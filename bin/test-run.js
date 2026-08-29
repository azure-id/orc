#!/usr/bin/env node
"use strict";
// ORC's test runner — POOLS, not shards. (v1.0.0 W0; design-07.)
//
// WHY THIS EXISTS. `npm test` used to be `node --test --test-concurrency=6
// test/`: one global concurrency for 41 files with four completely different
// resource appetites. 250 of 597 tests cost 36 s between them and were being
// throttled to protect ~12 files that spawn real child processes, stand up a
// loopback server, or derive scrypt at N=2^17. One number cannot serve both,
// and the number that keeps the badly-behaved files honest is the number the
// whole suite ran at. `test/_helpers.js` carries the full scar: the peak came
// 8 -> 6 after a full run failed TWENTY-NINE tests that all passed on their own
// file. That comment is still the REASON these numbers exist; it now points
// here for the numbers themselves.
//
// So: every file DECLARES its resource class in a first-lines pragma
//
//     // @test-pool net   — stands up the fake provider on loopback
//
// and files run pool by pool, each pool at its own concurrency. A class is
// never sniffed from the source: a grep would be wrong the first time somebody
// puts a spawnSync inside a helper, which is a debugging round this repo has
// already paid for once (test/cli/_fake-provider.js).
//
// This script schedules; `node --test` still does the testing. One child per
// file — which is what `node --test` does internally anyway — so the pass count
// is identical to the old command, per-file durations are exact, and a failure
// prints ONLY the failing file's output instead of 3,000 lines of TAP.
//
// THE GUARD THAT MATTERS: a selective run is NEVER the gate. `--file`,
// `--pool` and `--since` all set `is_gate: false`, name every file they skipped
// in the JSON, and print a loud last line. A green partial run reported as a
// green suite is the worst possible outcome of making a suite faster.
// There is no retry-until-green here, at any level: a flake is RECORDED.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const TEST_DIR = path.join(REPO, "test");
const TIMINGS = path.join(TEST_DIR, ".timings.json");

// ── the pools ───────────────────────────────────────────────────────────────
// Concurrency numbers here are EMPIRICAL, not chosen. Raising one requires
// three clean runs of that pool (design-07 §5.3) — the v0.55.0 scar again: 8
// was "already marginal" and only became visible when two files were added.
const CPUS = os.cpus().length || 4;
const POOLS = {
  // Pure computation: reads files, greps the payload, evaluates pure functions
  // out of cli.js. Over-subscription cannot hurt these.
  pure: { concurrency: Math.max(2, CPUS - 2), why: "no child process, no server, no crypto, no real clock" },
  // A child process is memory and a scheduler slot, not a socket.
  spawn: { concurrency: 4, why: "shells `node bin/cli.js` or an installed hook" },
  // THE STARVATION CLASS. A real timeout on a loopback socket is what breaks
  // when these are crowded, and it breaks looking exactly like a regression.
  net: { concurrency: 2, why: "stands up a fake provider, a fake CLI or the ui server on loopback" },
  // scrypt at N=2^17 is 128 MB and a beat of wall clock, ON PURPOSE — that cost
  // IS the vault's defence and must never be tuned down. It gets a lane to
  // itself instead.
  heavy: { concurrency: 1, why: "derives scrypt at N=2^17" },
};
const POOL_ORDER = ["pure", "spawn", "net", "heavy"];
// THE POOLS OVERLAP, and the correction is worth writing down (v1.0.0 W0).
//
// design-07 §3 had the pools run sequentially, one after another. Built that
// way and MEASURED, the full gate took 504 s against the old command's 328 s —
// slower, because a pool boundary serialises the whole box: `net` at 2 left 14
// cores idle for three minutes. The design's arithmetic assumed the cost was
// where the TEST durations were (250 free tests, 36 s), and the cost is
// actually per-FILE wall clock — 1,037 s of it, most of it node startup and
// fixture setup inside files that spawn.
//
// So the pools run TOGETHER, under one global cap, each still holding its own
// per-class limit. That keeps the thesis exactly — `net` is never more than 2
// and `heavy` is never more than 1 — and it is strictly SAFER than the old
// single number, under which all 6 concurrent processes could be `net` files.
// The global cap is what stops 14 + 4 + 2 + 1 becoming 21 processes.
// v1.0.0 W8 — a MEASUREMENT SEAM, not a behaviour change. Unset, this is 8 and
// the runner is byte-identical to what shipped (the `ORC_TEST_BUDGET_FLOOR_MS`
// precedent from W0/D22).
//
// It exists because the gate itself became unreliable. The full suite flaked on
// UNCHANGED code in three consecutive waves — W6 (12 failures, detail lost),
// W7 (4), W8 (3, then 13) — always in the `spawn`/`net` pools, always with
// ~24 s durations that are a budget elapsing rather than an assertion failing,
// and always on a run 35-90% slower than the ~188 s norm. Every affected file
// passes in isolation.
//
// Measured on the same tree, same commit: at 8 the suite failed 13 tests in
// 358 s; at 4 it passed 653/653 in 302 s. SLOWER at higher concurrency is the
// contention signature — the box is oversubscribed, so real timeouts elapse.
//
// ANSWERED at v1.0.0 W11: the default is 4, on that measurement. A cap that is
// both slower and red is not buying anything, and a green run at 8 on an idle
// box (W9, W10) is evidence about the box rather than about the cap. The seam
// stays — `ORC_TEST_GLOBAL_CONCURRENCY=8` reproduces the old behaviour exactly.
const GLOBAL_CONCURRENCY = Number(process.env.ORC_TEST_GLOBAL_CONCURRENCY) || 4;
// A file with no pragma lands in the safe middle AND is reported by name.
const DEFAULT_POOL = "spawn";

// ── which tests a source change can break ───────────────────────────────────
// A DECLARED table, never an inference. A changed path that matches no rule
// runs EVERYTHING — the fail-safe direction. An engine that quietly picks three
// files is how a suite stops testing things.
const TEST_TOUCHES = [
  [/^bin\/cli\.js$/, ["test/cli/", "test/lanes/", "test/webui/api.test.js", "test/webui/serve.test.js"]],
  [/^bin\/webui\//, ["test/webui/"]],
  [/^bin\/pricing\.json$/, ["test/cli/extra-stats.test.js"]],
  [/^bin\/providers\.json$/, ["test/cli/extra-tools.test.js", "test/cli/extra-routing.test.js"]],
  [/^bin\/mockrun-catalog\.js$/, ["test/cli/knowledge.test.js", "test/docs.test.js"]],
  [/^bin\/verify-/, ["test/payload.test.js"]],
  [/^templates\/hooks\//, ["test/hooks.test.js"]],
  [/^templates\/agents\//, ["test/payload.test.js"]],
  [/^templates\/(skills|commands)\//, ["test/payload.test.js", "test/docs.test.js"]],
  // The lane suites grep the payload of the lane they are named after, so a
  // skill edit inside one of these directories widens to its own suite. This is
  // the ONLY inference in the table and it is a name match, not a guess.
  [/^templates\/(skills|commands)\/orc-doc/, ["test/lanes/doc.test.js"]],
  [/^templates\/(skills|commands)\/orc-challenge/, ["test/lanes/challenge.test.js", "test/lanes/council.test.js"]],
  [/^templates\/skills\/_shared\//, ["test/lanes/"]],
  [/^test\//, ["SELF"]],
  [/^(README|README-id|CHANGELOG)\.md$/, ["test/docs.test.js"]],
];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(path.relative(REPO, p).split(path.sep).join("/"));
  }
  return out;
}

// The pragma is read from the first lines only: a `@test-pool` mentioned in
// prose 400 lines down is documentation, not a declaration.
function poolOf(rel) {
  const head = fs.readFileSync(path.join(REPO, rel), "utf8").split(/\r?\n/).slice(0, 8).join("\n");
  const m = /@test-pool\s+(\w+)/.exec(head);
  if (!m) return { pool: DEFAULT_POOL, declared: false };
  if (!POOLS[m[1]]) return { pool: DEFAULT_POOL, declared: false, bad: m[1] };
  return { pool: m[1], declared: true };
}

function readTimings() {
  try {
    return JSON.parse(fs.readFileSync(TIMINGS, "utf8"));
  } catch (_) {
    return {};
  }
}

// ── TAP parsing ─────────────────────────────────────────────────────────────
// Only the trailing counters are read. The per-test lines are kept as raw
// output and printed only when the file fails.
function counters(tap) {
  const num = (k) => {
    const m = new RegExp("^# " + k + " (\\d+)$", "m").exec(tap);
    return m ? +m[1] : 0;
  };
  return { tests: num("tests"), pass: num("pass"), fail: num("fail"), skipped: num("skipped"), todo: num("todo") };
}

function runFile(rel) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ["--test", "--test-reporter=tap", rel], {
      cwd: REPO,
      env: { ...process.env, ORC_NO_UPDATE_CHECK: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      const c = counters(out);
      resolve({
        file: rel,
        ms: Date.now() - started,
        status: code,
        ok: code === 0,
        ...c,
        output: out + (err ? "\n--- stderr ---\n" + err : ""),
      });
    });
  });
}

// ONE scheduler over every pool at once. Longest-job-first from the last run's
// timings — a file with no recorded time sorts FIRST (it is unknown, and
// unknown is not fast); ties fall back to the sorted path, so a failure
// reproduces. A file starts only when its pool has a free slot AND the global
// cap has one, so the box stays busy without any class exceeding its limit.
async function runAll(byPool, timings, opts) {
  const cost = (f) => (timings[f] === undefined ? Infinity : timings[f]);
  const queue = [];
  for (const name of POOL_ORDER) for (const f of byPool[name] || []) queue.push({ file: f, pool: name });
  queue.sort((a, b) => cost(b.file) - cost(a.file) || (a.file < b.file ? -1 : 1));

  const inPool = {};
  const results = [];
  const poolMs = {};
  const poolStart = {};
  let running = 0;
  let idx = 0;

  await new Promise((done) => {
    const pump = () => {
      while (running < GLOBAL_CONCURRENCY) {
        // Scan for the most expensive job whose pool has room. Skipping a
        // blocked job rather than stalling on it is what lets `pure` drain
        // while `net`'s two slots are busy.
        let pick = -1;
        for (let i = idx; i < queue.length; i++) {
          const j = queue[i];
          if (j.done) continue;
          if ((inPool[j.pool] || 0) < POOLS[j.pool].concurrency) {
            pick = i;
            break;
          }
        }
        if (pick < 0) break;
        const job = queue[pick];
        job.done = true;
        while (idx < queue.length && queue[idx].done) idx++;
        inPool[job.pool] = (inPool[job.pool] || 0) + 1;
        if (poolStart[job.pool] === undefined) poolStart[job.pool] = Date.now();
        running++;
        runFile(job.file).then((r) => {
          results.push({ ...r, pool: job.pool });
          poolMs[job.pool] = Date.now() - poolStart[job.pool];
          inPool[job.pool]--;
          running--;
          if (!opts.json) process.stdout.write(r.ok ? "." : "\n  FAIL " + r.file + "\n");
          if (results.length === queue.length) return done();
          pump();
        });
      }
      if (!queue.length) done();
    };
    pump();
  });

  return POOL_ORDER.filter((n) => (byPool[n] || []).length).map((n) => ({
    pool: n,
    concurrency: POOLS[n].concurrency,
    files: results.filter((r) => r.pool === n).sort((a, b) => (a.file < b.file ? -1 : 1)),
    ms: poolMs[n] || 0,
  }));
}

// ── selection ───────────────────────────────────────────────────────────────
function changedPaths(ref) {
  const args = ["diff", "--name-only", ref === true ? "HEAD" : ref];
  const a = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  const b = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: REPO, encoding: "utf8" });
  if (a.status !== 0) return null;
  return (a.stdout + (b.stdout || "")).split(/\r?\n/).filter(Boolean);
}

function selectSince(all, paths) {
  const picked = new Set();
  for (const p of paths) {
    let matched = false;
    for (const [re, targets] of TEST_TOUCHES) {
      if (!re.test(p)) continue;
      matched = true;
      for (const t of targets) {
        if (t === "SELF") {
          if (all.includes(p)) picked.add(p);
        } else for (const f of all) if (f === t || f.startsWith(t)) picked.add(f);
      }
    }
    // The fail-safe direction: a path no rule claims runs the whole suite.
    if (!matched) return { files: all, widened_by: p };
  }
  return { files: all.filter((f) => picked.has(f)), widened_by: null };
}

function usage(msg) {
  if (msg) console.error("test-run: " + msg);
  console.error(
    [
      "",
      "usage: node bin/test-run.js [--pool <name>] [--file <substr>] [--since [ref]] [--json]",
      "",
      "  (no flags)        run everything, pool by pool. THIS is the gate.",
      "  --pool <name>     one pool only: " + POOL_ORDER.join(" | "),
      "  --file <substr>   files whose path contains <substr>",
      "  --since [ref]     files a working-tree change against <ref> (default HEAD) can break",
      "  --json            the whole computed object on stdout, nothing else",
      "",
      "exit: 0 all green · 1 a test failed · 2 a bad argument",
      "",
    ].join("\n")
  );
  return 2;
}

async function main(argv) {
  const opts = { json: false, pool: null, file: null, since: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--pool") {
      opts.pool = argv[++i];
      if (!POOLS[opts.pool]) return usage("unknown pool: " + opts.pool);
    } else if (a === "--file") {
      opts.file = argv[++i];
      if (!opts.file) return usage("--file needs a substring");
    } else if (a === "--since") {
      opts.since = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else if (a === "-h" || a === "--help") return usage();
    else return usage("unknown argument: " + a);
  }

  const all = walk(TEST_DIR, []);
  const classified = {};
  const unclassified = [];
  const misdeclared = [];
  for (const f of all) {
    const c = poolOf(f);
    classified[f] = c.pool;
    if (!c.declared) (c.bad ? misdeclared : unclassified).push(c.bad ? f + " (@test-pool " + c.bad + ")" : f);
  }

  let selected = all;
  let widened_by = null;
  const is_gate = !opts.pool && !opts.file && !opts.since;
  if (opts.file) selected = all.filter((f) => f.includes(opts.file));
  if (opts.since) {
    const paths = changedPaths(opts.since);
    if (!paths) return usage("--since needs a git repository");
    const s = selectSince(selected, paths);
    selected = s.files;
    widened_by = s.widened_by;
  }
  if (opts.pool) selected = selected.filter((f) => classified[f] === opts.pool);

  const timings = readTimings();
  const byPool = {};
  for (const name of POOL_ORDER) {
    const files = selected.filter((f) => classified[f] === name);
    if (files.length) byPool[name] = files;
  }
  if (!opts.json && selected.length)
    console.log(
      "running " +
        selected.length +
        " files, global x" +
        GLOBAL_CONCURRENCY +
        " — " +
        POOL_ORDER.filter((n) => byPool[n])
          .map((n) => n + " x" + POOLS[n].concurrency + " (" + byPool[n].length + ")")
          .join(" · ")
    );
  const t0 = Date.now();
  const pools = await runAll(byPool, timings, opts);
  const wall_ms = Date.now() - t0;
  if (!opts.json && selected.length) process.stdout.write("\n");

  const files = pools.flatMap((p) => p.files);
  const totals = files.reduce(
    (t, f) => ({ tests: t.tests + f.tests, pass: t.pass + f.pass, fail: t.fail + f.fail, skipped: t.skipped + f.skipped, todo: t.todo + f.todo }),
    { tests: 0, pass: 0, fail: 0, skipped: 0, todo: 0 }
  );
  const failed = files.filter((f) => !f.ok);
  const skippedFiles = all.filter((f) => !selected.includes(f));

  // Longest-job-first needs a record. Written on every run, gate or not;
  // a selective run only refreshes the files it actually ran.
  const nextTimings = { ...timings };
  for (const f of files) nextTimings[f.file] = f.ms;
  try {
    fs.writeFileSync(TIMINGS, JSON.stringify(nextTimings, null, 1) + "\n");
  } catch (_) {}

  const report = {
    ok: failed.length === 0,
    // A selective run is NEVER the gate. This field is the machine-readable
    // half of that rule and the last line below is the human half.
    is_gate,
    wall_clock_s: +(wall_ms / 1000).toFixed(1),
    global_concurrency: GLOBAL_CONCURRENCY,
    totals,
    files_run: selected.length,
    files_total: all.length,
    // A file not run is NAMED, always.
    skipped_files: skippedFiles,
    widened_by,
    unclassified,
    misdeclared,
    // A flake is RECORDED, never retried away: nothing in this runner re-runs a
    // failure, so this array is filled only by a human recording one.
    flaky: [],
    pools: pools.map((p) => ({
      pool: p.pool,
      concurrency: p.concurrency,
      wall_clock_s: +(p.ms / 1000).toFixed(1),
      why: POOLS[p.pool].why,
      files: p.files.map((f) => ({ file: f.file, ms: f.ms, tests: f.tests, pass: f.pass, fail: f.fail, ok: f.ok })),
    })),
    failures: failed.map((f) => ({ file: f.file, status: f.status, fail: f.fail })),
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 1) + "\n");
    return failed.length ? 1 : 0;
  }

  // Failure-only reporting. 3,000 lines of TAP for one ECONNRESET is why
  // nobody reads the current output.
  for (const f of failed) {
    console.log("\n" + "=".repeat(72) + "\n" + f.file + " — exit " + f.status + "\n" + "=".repeat(72));
    console.log(f.output.trim());
  }
  if (unclassified.length) console.log("\nunclassified (ran in `" + DEFAULT_POOL + "`): " + unclassified.join(", "));
  if (misdeclared.length) console.log("\nBAD @test-pool pragma (ran in `" + DEFAULT_POOL + "`): " + misdeclared.join(", "));
  console.log(
    "\n" +
      (failed.length ? "FAIL" : "ok") +
      " — " +
      totals.pass +
      " passed, " +
      totals.fail +
      " failed, " +
      totals.tests +
      " tests in " +
      (wall_ms / 1000).toFixed(1) +
      "s across " +
      selected.length +
      " files"
  );
  if (!is_gate)
    console.log(
      "ran " + selected.length + " of " + all.length + " files — this is NOT the gate" + (widened_by ? " (widened to everything by " + widened_by + ")" : "")
    );
  return failed.length ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e && e.stack ? e.stack : String(e));
    process.exit(2);
  }
);
