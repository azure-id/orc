"use strict";
// @test-pool net  — stands up the fake provider on loopback; also drives the watchdog clocks
// `orc extra` — THE JOURNAL (v0.54.0), write side.
//
// A failed foreign dispatch is a POSITION, not a blank page. Every assertion
// here is about the one property that makes that true: the record exists, it is
// complete, and it survives the process that wrote it.
//
//   · the HEADER lands before the first byte leaves the machine — kill the
//     provider and it is still there, with a complete baseline
//   · the baseline covers `declared_files` ONLY; a change outside the fence is
//     visible through `git status --short`, which is stored in full
//   · a torn last line costs the torn line and nothing else
//   · engine `cli` redirects the child's stdout onto a FILE DESCRIPTOR, so a
//     wall-clock kill leaves the bytes on disk instead of in a dead parent's
//     buffer
//   · a journal that cannot be written NEVER takes the dispatch down with it
//   · fidelity is declared per engine and is never rendered stronger than it is
//   · the sweep only ever deletes a directory whose every attempt closed `done`
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { tmpdir, rmrf, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const SECRET_KEY = "sk-live-PLANTEDSECRET0123456789";
const FAKE_CLI = path.join(__dirname, "_fake-cli.js");

function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "// the original helper\n");
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, a, env) => cli([...a, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);

// A real repository, because the baseline stores `git status --short` VERBATIM
// and "clean tree" must never be confused with "not a git repository".
function gitRepo(root) {
  const g = (...argv) => spawnSync("git", argv, { cwd: root, encoding: "utf8" });
  if (g("init", "-q").status !== 0) return false;
  g("config", "user.email", "t@example.invalid");
  g("config", "user.name", "t");
  g("config", "commit.gpgsign", "false");
  g("add", "-A");
  g("commit", "-qm", "baseline");
  return true;
}

const journalDir = (p, task) => path.join(p.root, ".claude", "orc", "extra-journal", task);
const readHeader = (p, task, n) =>
  JSON.parse(fs.readFileSync(path.join(journalDir(p, task), `attempt-${String(n || 1).padStart(2, "0")}.json`), "utf8"));
const progressLines = (p, task, n) =>
  fs
    .readFileSync(path.join(journalDir(p, task), `attempt-${String(n || 1).padStart(2, "0")}.progress.jsonl`), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length);

// ── engine `api` ────────────────────────────────────────────────────────────
async function armedApi(p, mode, cfgExtra) {
  const f = await fakeProvider(mode || "chat");
  const base = `http://127.0.0.1:${f.port}`;
  assert.equal(run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K"]).status, 0);
  const ping = run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY });
  assert.equal(ping.status, 0, "fixture must verify: " + ping.stdout + ping.stderr);
  assert.equal(run(p, ["extra", "route", "set", "0-30", "ds/fake-flash", "--json"]).status, 0);
  fs.writeFileSync(
    path.join(p.root, ".claude", "orc.config.yaml"),
    "extra_enabled: true\nextra_roles: [executor]\n" + (cfgExtra || "")
  );
  return f;
}

function slice(p, over) {
  const file = path.join(p.root, "slice.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      Object.assign(
        {
          task_id: "T-2",
          score: 20,
          role: "executor",
          prompt: "Rename the helper in src/a.js.",
          standing_rules: "# ORC standing rules\nReturn the contract.\n",
          declared_files: ["src/a.js"],
          acceptance: ["the helper is renamed"],
        },
        over || {}
      )
    )
  );
  return file;
}
const dispatch = (p, over, env) =>
  run(p, ["extra", "dispatch", "--task", slice(p, over), "--json"], { K: SECRET_KEY, ...(env || {}) });

test("the header is written BEFORE the first byte leaves the machine, with a complete baseline", async () => {
  const p = project();
  assert.ok(gitRepo(p.root), "git must be available for this fixture");
  const f = await armedApi(p, "chat");
  // The profile verified against a live provider; now the provider is GONE. The
  // dispatch cannot reach anything — and the header must already be on disk,
  // because it is written before the request is made and not after it answers.
  f.stop();
  await new Promise((r) => setTimeout(r, 200));

  const r = dispatch(p);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.dispatched, true);
  assert.equal(j.ok, false);
  assert.equal(j.attempt, 1);
  assert.ok(j.journal && fs.existsSync(j.journal), "the return names a journal header that exists");
  assert.equal(j.journal_fidelity, "per-turn");

  const h = readHeader(p, "T-2");
  assert.equal(h.task_id, "T-2");
  assert.equal(h.attempt, 1);
  assert.equal(h.resumed_from, null);
  assert.equal(h.engine, "api");
  assert.equal(h.profile, "ds");
  assert.equal(h.score, 20);
  assert.equal(h.model_requested, "fake-flash");
  assert.deepEqual(h.declared_files, ["src/a.js"]);
  assert.deepEqual(h.acceptance, ["the helper is renamed"]);
  assert.equal(typeof h.pid, "number");
  assert.ok(Date.parse(h.lease_expires_at) > Date.parse(h.started_at), "the lease outlives the start");
  assert.match(h.slice_sha256, /^[0-9a-f]{64}$/);

  // THE BASELINE — what the repository looked like before a third party touched
  // it, which is the only thing that can make a reconciliation possible later.
  assert.equal(h.baseline.git, true);
  assert.ok(Array.isArray(h.baseline.git_status));
  assert.match(h.baseline.head, /^[0-9a-f]{7,40}$/);
  const b = h.baseline.files["src/a.js"];
  assert.equal(b.exists, true);
  assert.match(b.sha256, /^[0-9a-f]{64}$/);
  assert.equal(b.lines, 1, "a trailing newline TERMINATES the last line, it does not begin an empty one");
  assert.equal(b.bytes, fs.statSync(path.join(p.root, "src", "a.js")).size);

  // A dispatch that never reached the provider still closed its own attempt.
  assert.ok(fs.existsSync(path.join(journalDir(p, "T-2"), "attempt-01.result.json")));
  rmrf(p.root);
});

test("the baseline covers declared_files ONLY — everything else is git status, stored in full", async () => {
  const p = project();
  assert.ok(gitRepo(p.root));
  const f = await armedApi(p, "chat");
  try {
    // Untracked, and NOT declared. It must not be hashed, and it must be
    // visible: a change outside the fence is §6's job, and §6 reads git status.
    fs.writeFileSync(path.join(p.root, "src", "outside.js"), "// nobody declared me\n");
    assert.equal(dispatch(p).status, 0);
    const h = readHeader(p, "T-2");
    assert.deepEqual(Object.keys(h.baseline.files), ["src/a.js"]);
    assert.ok(!("src/outside.js" in h.baseline.files));
    assert.ok(
      h.baseline.git_status.some((l) => l.includes("outside.js")),
      "the undeclared file is in git status: " + JSON.stringify(h.baseline.git_status)
    );
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a file that does not exist yet is a complete baseline row, not a missing one", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    assert.equal(dispatch(p, { declared_files: ["src/a.js", "src/routes/health.js"] }).status, 0);
    const h = readHeader(p, "T-2");
    assert.deepEqual(h.baseline.files["src/routes/health.js"], { exists: false, sha256: null, lines: 0, bytes: 0 });
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("engine api records every turn and every tool call, with the running usage vector", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    const j = json(dispatch(p));
    assert.equal(j.outcome, "done");
    assert.equal(j.output_file, path.join(journalDir(p, "T-2"), "attempt-01.progress.jsonl"));

    const lines = progressLines(p, "T-2").map((l) => JSON.parse(l));
    const turns = lines.filter((l) => l.model !== undefined);
    const tools = lines.filter((l) => l.tool !== undefined);
    assert.ok(turns.length >= 2, "one line per turn");
    assert.deepEqual(
      tools.map((t) => t.tool),
      ["Write", "Bash"]
    );
    // THE PATH, so `last_action` can say WHICH file the worker last touched.
    assert.equal(tools[0].path, "src/a.js");
    assert.equal(tools[1].path, null, "Bash has no path, and an invented one would be worse than none");
    assert.ok(tools.every((t) => t.ok === true));
    // The RUNNING vector, on every line — a floor on what a dispatch cost even
    // when it never reached the spend log.
    for (const l of lines) {
      assert.deepEqual(Object.keys(l.usage).sort(), ["cache_read", "cache_write", "input", "output"]);
      assert.equal(typeof l.usage.input, "number");
    }
    const last = lines[lines.length - 1];
    assert.ok(last.usage.input > 0, "the vector grew as the loop ran");
    assert.ok(lines.every((l) => typeof l.t === "string"));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a torn last line costs the torn line and nothing else", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    assert.equal(dispatch(p).status, 0);
    const file = path.join(journalDir(p, "T-2"), "attempt-01.progress.jsonl");
    const before = progressLines(p, "T-2").length;
    assert.ok(before >= 3);

    // What a killed process leaves: the last append never finished. Cutting the
    // trailing newline alone is not enough — the line is still valid JSON, and a
    // fixture that only removed it would prove nothing.
    const buf = fs.readFileSync(file);
    fs.writeFileSync(file, buf.slice(0, buf.length - 5));

    let read = 0;
    let torn = 0;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        JSON.parse(line);
        read++;
      } catch (_) {
        torn++;
      }
    }
    assert.equal(read, before - 1, "every prior line still parses");
    assert.equal(torn, 1, "exactly one line was lost, and it is the last one");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a resume is a new attempt, never an overwrite", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    assert.equal(json(dispatch(p)).attempt, 1);
    const first = fs.readFileSync(path.join(journalDir(p, "T-2"), "attempt-01.json"), "utf8");
    assert.equal(json(dispatch(p)).attempt, 2);
    assert.equal(
      fs.readFileSync(path.join(journalDir(p, "T-2"), "attempt-01.json"), "utf8"),
      first,
      "attempt 1 holds the only record of the untouched repository — nothing may write over it"
    );
    assert.ok(fs.existsSync(path.join(journalDir(p, "T-2"), "attempt-02.progress.jsonl")));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a journal that cannot be written NEVER takes the dispatch down with it", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    // A FILE where the journal root has to be a directory. Portable, and it is
    // the same failure any unwritable path produces: mkdir refuses.
    fs.mkdirSync(path.join(p.root, ".claude", "orc"), { recursive: true });
    fs.writeFileSync(path.join(p.root, ".claude", "orc", "extra-journal"), "not a directory\n");

    const r = dispatch(p);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const j = json(r);
    assert.equal(j.outcome, "done");
    assert.equal(j.journal, null, "null is the honest answer — there is nothing to reconcile against");
    assert.equal(j.journal_fidelity, null);
    assert.equal(j.spend_logged, true, "the spend record is unaffected");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a task id that sanitises to nothing gets NO journal, never a directory called empty", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    const j = json(dispatch(p, { task_id: "../../escape" }));
    // Sanitised to a flat segment — never a traversal.
    assert.ok(j.journal.includes("extra-journal"));
    assert.ok(!j.journal.includes(".."), "a task id is untrusted input about to become a path segment");
    const roots = fs.readdirSync(path.join(p.root, ".claude", "orc", "extra-journal"));
    assert.deepEqual(roots, ["escape"]);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── engine `cli` ────────────────────────────────────────────────────────────
function fakeBinDir(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orc-fake-cli-"));
  for (const n of names) {
    if (process.platform === "win32")
      fs.writeFileSync(path.join(dir, n + ".cmd"), `@echo off\r\n"${process.execPath}" "${FAKE_CLI}" %*\r\n`);
    else {
      const f = path.join(dir, n);
      fs.writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CLI}" "$@"\n`);
      fs.chmodSync(f, 0o755);
    }
  }
  return dir;
}

function armedCli(p, bin, cfgExtra) {
  assert.equal(
    run(p, ["extra", "add", "w", "--provider", "custom", "--engine", "cli", "--cli", bin, "--env-key", "K", "--cli-agent", "build"]).status,
    0
  );
  const PATHV = fakeBinDir([bin]) + path.delimiter + process.env.PATH;
  assert.equal(run(p, ["extra", "ping", "w", "--json"], { PATH: PATHV }).status, 0);
  assert.equal(run(p, ["extra", "route", "set", "0-30", "w/deepseek/fake-flash", "--json"]).status, 0);
  fs.writeFileSync(
    path.join(p.root, ".claude", "orc.config.yaml"),
    "extra_enabled: true\nextra_roles: [executor]\n" + (cfgExtra || "")
  );
  return PATHV;
}

test("engine cli: the child's stdout lands on DISK, and output_file names a file that exists", () => {
  const p = project();
  const PATHV = armedCli(p, "opencode");
  const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], {
    K: SECRET_KEY,
    PATH: PATHV,
    ORC_FAKE_CLI_MODE: "ok",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.outcome, "done");
  assert.equal(j.journal_fidelity, "streamed-opaque");
  // NO LONGER NULL. The answer was never to report a dead path, it was to stop
  // deleting the evidence.
  assert.equal(j.output_file, path.join(journalDir(p, "T-2"), "attempt-01.progress.jsonl"));
  assert.ok(fs.existsSync(j.output_file));
  const raw = fs.readFileSync(j.output_file, "utf8");
  assert.match(raw, /"type":"session\.start"/);
  assert.match(raw, /"type":"message\.done"/);
  // The tool still reported its own numbers — reading the bytes back from the
  // file must be indistinguishable from reading them out of a pipe.
  assert.deepEqual(j.usage, { input: 500, cache_write: 0, cache_read: 400, output: 70 });
  rmrf(p.root);
});

test("engine cli: a wall-clock kill leaves the child's output on disk", () => {
  const p = project();
  // THE BUDGET IS INJECTED, and it is the only thing that is (v1.0.0 W0).
  // 30s is the FLOOR extraTimeouts enforces, so as written this test SLEPT for
  // 32s to prove one classification. What is under test is the DECISION a
  // wall-clock kill produces — the reason word, the retryability, and the bytes
  // left on disk — none of which know how long they waited. So the floor drops
  // to 1s for this child and the wall clock to 3s: the same code path, the same
  // assertions, a tenth of the wall clock. The budget the PRODUCT enforces is
  // unchanged, and is asserted by the pure-arithmetic test below.
  const PATHV = armedCli(p, "opencode", "extra_timeout_s: 3\n");
  const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], {
    K: SECRET_KEY,
    PATH: PATHV,
    ORC_FAKE_CLI_MODE: "slow",
    ORC_TEST_BUDGET_FLOOR_MS: "1000",
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.reason, "timeout");
  assert.equal(j.retry, true);
  assert.equal(j.output_file, path.join(journalDir(p, "T-2"), "attempt-01.progress.jsonl"));
  assert.ok(j.captured_bytes > 0, "the bytes the child produced before the kill were read back, not discarded");
  assert.match(fs.readFileSync(j.output_file, "utf8"), /"type":"session\.start"/);
  rmrf(p.root);
});

// ── the stall clock (v0.56.1) ───────────────────────────────────────────────
//
// The failure a wall clock cannot see: the worker is ALIVE and doing nothing.
// The `slow` fixture is exactly that shape — it prints one real event and then
// blocks — so the difference between these two tests and the wall-clock one
// above is only which budget is short enough to fire first.
test("engine cli: a worker that goes quiet is `stalled`, not `timeout`", () => {
  const p = project();
  // 30s is the stall floor; the wall clock is left far above it so the stall is
  // unambiguously what fired. A stall reported as a timeout reads as a budget
  // somebody should raise, when it is a POSITION somebody should resume from.
  const PATHV = armedCli(p, "opencode", "extra_timeout_s: 30\nextra_stall_s: 3\n");
  const t0 = Date.now();
  const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], {
    K: SECRET_KEY,
    PATH: PATHV,
    ORC_FAKE_CLI_MODE: "slow",
    // Injected, as above: the 30s floor is what made this sleep for 37s. What
    // these assertions are about is the RATIO — a stall budget an order of
    // magnitude under the wall clock, so it is unambiguously the stall that
    // fired — and a ratio does not care what the units are.
    ORC_TEST_BUDGET_FLOOR_MS: "1000",
  });
  const elapsed = Date.now() - t0;
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.reason, "stalled");
  // RETRYABLE is the whole point: it is what lets `extra_resume` continue from
  // what is on disk instead of re-dispatching the slice from scratch.
  assert.equal(j.retry, true);
  // It stopped at the STALL budget, nowhere near the wall clock. Without this
  // the test would pass on a build where the stall clock does nothing.
  assert.ok(elapsed < 12000, "the stall budget must fire long before the 30s wall clock (took " + elapsed + "ms)");
  // The bytes the worker DID produce are still on disk — a stall is a position,
  // and a position you deleted is a blank page.
  assert.equal(j.output_file, path.join(journalDir(p, "T-2"), "attempt-01.progress.jsonl"));
  assert.match(fs.readFileSync(j.output_file, "utf8"), /"type":"session\.start"/);
  // THE TIMELINE, on the record. A budget you can only see when it fires is a
  // budget nobody can set before it does.
  assert.equal(j.timeline.stall_budget_ms, 3000);
  assert.equal(j.timeline.wall_budget_ms, 30000);
  assert.ok(j.timeline.first_byte_ms !== undefined);
  rmrf(p.root);
});

// ARITHMETIC, so it is tested as arithmetic. A live dispatch would hold a
// process for a full wall clock to prove a comparison — and the pure function
// pins the rule more precisely than an outcome word can, because it can name
// the reason the clock stood down.
test("the stall clock stands down when it cannot fit under the wall clock, and says why", () => {
  // LF, always — the slice below looks for `\n}\n`, which a CRLF checkout
  // never contains. Without this the test reports extraTimeouts as undefined.
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "cli.js"), "utf8").replace(/\r\n/g, "\n");
  const i = src.indexOf("function extraTimeouts(cfg) {");
  const extraTimeouts = new Function(
    src.slice(i, src.indexOf("\n}\n", i) + 2) + "\nreturn extraTimeouts;"
  )();

  // The default: comfortably under a 900s wall clock, so it is honoured whole.
  const d = extraTimeouts({});
  assert.equal(d.stall_ms, 180000);
  assert.equal(d.stall_clamped, false);
  assert.equal(d.stall_off_reason, null);
  // ORDERED, once: stall < idle < api < wall. Three timeouts that disagree
  // about which one fires first is the bug this function exists to prevent.
  assert.ok(d.stall_ms < d.idle_ms && d.idle_ms < d.api_ms && d.api_ms <= d.wall_ms);

  // Asked for more than fits: CLAMPED, and it says it was.
  const c = extraTimeouts({ extra_timeout_s: 120, extra_stall_s: 600 });
  assert.equal(c.stall_ms, 105000, "min(asked, wall - 15s)");
  assert.equal(c.stall_clamped, true);

  // The wall clock at its own 30s floor leaves no room for the 30s stall floor.
  // Two timers on the same instant would report whichever won the race, so the
  // stall clock stands down and the WALL CLOCK — the budget the user set —
  // wins the tie. A budget that silently does nothing is the failure mode; one
  // that says why is something a person can act on.
  const off = extraTimeouts({ extra_timeout_s: 30, extra_stall_s: 180 });
  assert.equal(off.stall_ms, 0);
  assert.equal(off.stall_clamped, true);
  assert.match(off.stall_off_reason, /cannot fit under extra_timeout_s/);

  // 0 is OFF, and it is not a clamp — the user asked for no stall clock.
  const zero = extraTimeouts({ extra_stall_s: 0 });
  assert.equal(zero.stall_ms, 0);
  assert.equal(zero.stall_clamped, false);
  assert.equal(zero.stall_off_reason, null);
});

test("a worker that keeps producing is never stalled, however long it takes", () => {
  const p = project();
  // The `ok` fixture answers immediately. The assertion that matters is the
  // NEGATIVE one: an ordinary dispatch under a live stall clock must be
  // untouched by it, or the clock would be firing on workers that are merely
  // slow — which is the whole reason it measures progress and not the wall.
  const PATHV = armedCli(p, "opencode", "extra_timeout_s: 300\nextra_stall_s: 30\n");
  const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], {
    K: SECRET_KEY,
    PATH: PATHV,
    ORC_FAKE_CLI_MODE: "ok",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.outcome, "done");
  // The timeline rides on a SUCCESS too, not only on a failure.
  assert.equal(j.timeline.stall_budget_ms, 30000);
  assert.ok(j.timeline.first_byte_ms !== null, "a worker that answered produced a first byte");
  rmrf(p.root);
});

// ── the watchdog itself, in seconds rather than in a wall clock ────────────
//
// `extraTimeouts` floors a CONFIGURED stall budget at 30s, because a budget
// small enough to fire on a model's first token is a footgun. `runCliChild`
// takes `stall_ms` directly and has no opinion about it — so the mechanism can
// be pinned in two seconds, precisely, without waiting out a policy that is
// already tested as arithmetic above.
function watchdog() {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "cli.js"), "utf8").replace(/\r\n/g, "\n");
  const pick = (name) => {
    const i = src.indexOf("function " + name + "(");
    return src.slice(i, src.indexOf("\n}\n", i) + 2);
  };
  // `new Function` compiles in GLOBAL scope, which has no `require` — so the
  // module's own is passed in rather than reached for.
  return new Function(
    "require",
    'const fs = require("fs"); const path = require("path"); const { spawnSync } = require("child_process");\n' +
      pick("spawnCmdParts") +
      pick("killProcessTree") +
      pick("declaredFilesFingerprint") +
      "const EXTRA_MAX_OUTPUT_BYTES = 256 * 1024 * 1024;\nconst EXTRA_STALL_POLL_MS = 5000;\n" +
      pick("runCliChild") +
      "\nreturn runCliChild;"
  )(require);
}
const NODE = process.execPath;

test("the watchdog kills a QUIET child and reports how long it was quiet", async () => {
  const runCliChild = watchdog();
  const p = project();
  const started = Date.now();
  // Alive, doing nothing, saying nothing — the exact shape of the failure.
  const r = await runCliChild(
    NODE,
    ["-e", "setTimeout(() => {}, 60000)"],
    { cwd: p.root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    { started, wall_ms: 60000, stall_ms: 2000, progressFile: null, root: p.root, declared: [] }
  );
  assert.equal(r.stopped_by, "stall");
  assert.ok(Date.now() - started < 20000, "it must stop at the stall budget, not at the wall clock");
  // Never said anything, so there is no first byte. NULL, and never 0 — those
  // are different facts and /orc-budget must not read one as the other.
  assert.equal(r.first_byte_ms, null);
  assert.ok(r.stall_ms >= 2000, "it reports how long the worker was quiet");
  rmrf(p.root);
});

test("a child that keeps TALKING is never stalled, however long it runs", async () => {
  const runCliChild = watchdog();
  const p = project();
  const started = Date.now();
  // Six seconds of work under a two-second stall budget: it survives ONLY
  // because the clock measures progress. This is the assertion that proves the
  // watchdog is not just a second wall clock.
  const r = await runCliChild(
    NODE,
    ["-e", "let n = 0; const t = setInterval(() => { process.stdout.write('tick\\n'); if (++n > 11) { clearInterval(t); } }, 500);"],
    { cwd: p.root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    { started, wall_ms: 60000, stall_ms: 2000, progressFile: null, root: p.root, declared: [] }
  );
  assert.equal(r.stopped_by, null, "a talking worker must never be stopped");
  assert.equal(r.status, 0);
  assert.ok(r.first_byte_ms !== null);
  assert.ok(r.stdout.includes("tick"));
  rmrf(p.root);
});

test("a child that only WRITES A DECLARED FILE is never stalled either", async () => {
  const runCliChild = watchdog();
  const p = project();
  const started = Date.now();
  // SILENT the whole time — the third progress signal is the only thing keeping
  // it alive. A worker can think for minutes and then write in one go, and a
  // clock that watched only the stream would kill it mid-thought.
  const target = path.join(p.root, "src", "a.js").replace(/\\/g, "/");
  const r = await runCliChild(
    NODE,
    [
      "-e",
      "const fs = require('fs'); let n = 0; const t = setInterval(() => { fs.appendFileSync(" +
        JSON.stringify(target) +
        ", 'line\\n'); if (++n > 11) { clearInterval(t); } }, 500);",
    ],
    { cwd: p.root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    { started, wall_ms: 60000, stall_ms: 2000, progressFile: null, root: p.root, declared: ["src/a.js"] }
  );
  assert.equal(r.stopped_by, null, "a worker that is writing is working, whatever its stream is doing");
  assert.equal(r.stdout, "", "and it said nothing at all — the file is the ONLY signal here");
  rmrf(p.root);
});

// ── the declared table, and the sweep ───────────────────────────────────────
test("journal fidelity is DECLARED per engine and never rendered stronger than it is", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    assert.equal(json(dispatch(p)).journal_fidelity, "per-turn");
    assert.equal(
      readHeader(p, "T-2").journal_fidelity_note,
      "every turn and every tool call was recorded as it happened."
    );
  } finally {
    f.stop();
  }
  rmrf(p.root);

  const q = project();
  const PATHV = armedCli(q, "opencode");
  assert.equal(
    run(q, ["extra", "dispatch", "--task", slice(q), "--json"], { K: SECRET_KEY, PATH: PATHV, ORC_FAKE_CLI_MODE: "ok" })
      .status,
    0
  );
  const h = readHeader(q, "T-2");
  assert.equal(h.journal_fidelity, "streamed-opaque");
  assert.match(h.journal_fidelity_note, /NO per-turn tool attribution/);
  rmrf(q.root);
});

test("the sweep only ever deletes a directory whose EVERY attempt closed `done`, 30+ days old", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    const root = path.join(p.root, ".claude", "orc", "extra-journal");
    const old = Date.now() - 40 * 86400000;
    const plant = (name, result) => {
      const dir = path.join(root, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "attempt-01.json"), JSON.stringify({ task_id: name, attempt: 1 }));
      fs.writeFileSync(path.join(dir, "attempt-01.progress.jsonl"), "");
      if (result) fs.writeFileSync(path.join(dir, "attempt-01.result.json"), JSON.stringify(result));
      for (const n of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, n), old / 1000, old / 1000);
    };
    plant("old-done", { outcome: "done" });
    plant("old-failed", { outcome: "failed" });
    plant("old-orphan", null);

    const fresh = path.join(root, "fresh-done");
    fs.mkdirSync(fresh, { recursive: true });
    fs.writeFileSync(path.join(fresh, "attempt-01.json"), "{}");
    fs.writeFileSync(path.join(fresh, "attempt-01.result.json"), JSON.stringify({ outcome: "done" }));

    assert.equal(dispatch(p).status, 0, "the sweep runs on a dispatch, never on a timer");

    const left = fs.readdirSync(root).sort();
    assert.ok(!left.includes("old-done"), "closed `done` and past the floor — swept");
    assert.ok(left.includes("old-failed"), "a failed close is not a done close");
    assert.ok(left.includes("old-orphan"), "an orphan is the one thing this subsystem exists to find — never swept");
    assert.ok(left.includes("fresh-done"), "inside the 30-day floor");
    assert.ok(left.includes("T-2"), "the dispatch that ran the sweep is untouched");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});
