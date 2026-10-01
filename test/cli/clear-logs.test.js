"use strict";
// @test-pool spawn  — shells node bin/cli.js and git in temp projects
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { cli, rmrf, tmpdir } = require("../_helpers");

// ── v2.1.0 W7 — `orc clear logs` (06-clear-logs-spec §8) ─────────────────────
// Print by default (DE-16); `--apply` deletes finished trace sets and finished
// run folders WITH their git ref (DE-18); the `orc stats` totals survive in
// logs-rollup.json (DE-19); the opt-in FINISH sweep runs at most once per 24 h
// (DE-20). User data and in-flight state are never deleted.

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
function stampOf(ms) {
  const d = new Date(ms);
  const ddmmyy = `${pad(d.getDate())}${pad(d.getMonth() + 1)}${pad(d.getFullYear() % 100)}`;
  return { ddmmyy, hhmmss: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`, line: `[${ddmmyy} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000]` };
}
function setAge(file, daysAgo) {
  const t = (Date.now() - daysAgo * DAY) / 1000;
  fs.utimesSync(file, t, t);
}
function project(cfg) {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, ".claude", "orc", "logs"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude", "orc", "run"), { recursive: true });
  if (cfg) fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), cfg);
  return root;
}
const logs = (root) => path.join(root, ".claude", "orc", "logs");
const runs = (root) => path.join(root, ".claude", "orc", "run");

// A finished trace SET: .txt + .txt.jsonl + .pending.json + .graph-hook.json.
// `days` = the line stamps' age; `mtimeDays` = the files' mtime age (a copy
// gets a fresh mtime and keeps its old stamps).
function trace(root, lane, slug, days, opts) {
  opts = opts || {};
  const dir = opts.dir || logs(root);
  const start = Date.now() - days * DAY;
  const s = stampOf(start);
  const name = `run-${lane}-${slug}-${s.ddmmyy}-${s.hhmmss}.txt`;
  const end = stampOf(start + 10 * 60 * 1000).line;
  let body = `${s.line} orc      PHASE :: preflight\n${s.line} orc      DISPATCH orc-executor-sonnet-5-high :: T1\n`;
  if (opts.ask) body += `${s.line} orc      ASK mini.q1.tdd :: offered=yes|no rec=yes chose=yes by=user\n`;
  body += `${end} orc      STATS lane=${lane} slug=${slug} dispatches=${opts.dispatches || 2} waves=1 tasks=1 downgrades=${opts.downgrades || 0}\n`;
  if (!opts.unfinished) body += `${end} orc      FINISH :: shipped\n`;
  const base = name.replace(/\.txt$/, "");
  const files = [name, name + ".jsonl", name + ".pending.json", base + ".graph-hook.json"];
  fs.writeFileSync(path.join(dir, name), body);
  fs.writeFileSync(path.join(dir, name + ".jsonl"), "{}\n");
  fs.writeFileSync(path.join(dir, name + ".pending.json"), "[]");
  fs.writeFileSync(path.join(dir, base + ".graph-hook.json"), "{}");
  const mt = opts.mtimeDays === undefined ? days : opts.mtimeDays;
  for (const f of files) setAge(path.join(dir, f), mt);
  return { name, files, paths: files.map((f) => path.join(dir, f)) };
}
function runFolder(root, slug, days, files) {
  const dir = path.join(runs(root), slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, f), body);
    setAge(path.join(dir, f), days);
  }
  return dir;
}
function clear(root, ...extra) {
  const r = cli(["clear", "logs", "--json", "--dir", root, ...extra]);
  let j = null;
  try {
    j = JSON.parse(r.stdout);
  } catch (_) {}
  return { r, j };
}
function tree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return out;
}
function git(root, ...a) {
  const r = spawnSync("git", a, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
const exists = (p) => fs.existsSync(p);

test("clear logs: print mode deletes nothing (byte compare of the folder)", () => {
  const root = project();
  try {
    trace(root, "mini", "old-one", 100);
    runFolder(root, "done-run", 100, { "checkpoint.json": "{}" });
    const before = tree(path.join(root, ".claude"));
    const { r, j } = clear(root);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(j.applied, false);
    assert.ok(j.delete.length >= 2, "it names what it would delete");
    assert.deepStrictEqual(tree(path.join(root, ".claude")), before, "not one byte changed");
    // The human print names the files and says how to apply.
    const h = cli(["clear", "logs", "--dir", root]);
    assert.strictEqual(h.status, 0);
    assert.match(h.stdout, /run-mini-old-one-/);
    assert.match(h.stdout, /orc clear logs --apply/);
    assert.deepStrictEqual(tree(path.join(root, ".claude")), before);
  } finally {
    rmrf(root);
  }
});

test("clear logs: --apply deletes a 100-day-old trace set as one unit and keeps a 10-day one", () => {
  const root = project();
  try {
    const old = trace(root, "mini", "old-one", 100);
    const fresh = trace(root, "mini", "new-one", 10);
    const { r, j } = clear(root, "--apply");
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(j.applied, true);
    const unit = j.delete.find((d) => d.kind === "trace");
    assert.strictEqual(unit.files.length, 4, "the .txt, the .jsonl twin, the .pending.json and the .graph-hook.json go together");
    for (const p of old.paths) assert.ok(!exists(p), "deleted: " + p);
    for (const p of fresh.paths) assert.ok(exists(p), "kept: " + p);
    assert.ok(j.keep.some((k) => /new-one/.test(k.path) && /younger than 90 days/.test(k.reason)));
  } finally {
    rmrf(root);
  }
});

test("clear logs: .current, its target and its sidecars are kept at any age; a file younger than 6 h is kept", () => {
  const root = project();
  try {
    const cur = trace(root, "orc", "live-run", 300);
    fs.writeFileSync(path.join(logs(root), ".current"), cur.name + "\n");
    setAge(path.join(logs(root), ".current"), 300);
    // Old stamps, but the file changed one hour ago — a run may still write to it.
    const young = trace(root, "mini", "busy-run", 300, { mtimeDays: 1 / 24 });
    const { r, j } = clear(root, "--apply");
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    for (const p of cur.paths) assert.ok(exists(p), "the active run is kept: " + p);
    assert.ok(exists(path.join(logs(root), ".current")));
    assert.ok(j.keep.some((k) => k.path.endsWith(cur.name) && /\.current/.test(k.reason)));
    for (const p of young.paths) assert.ok(exists(p), "younger than 6 h is kept: " + p);
    assert.ok(j.keep.some((k) => /busy-run/.test(k.path) && /6 hours/.test(k.reason)));
    assert.strictEqual(j.delete.length, 0);
  } finally {
    rmrf(root);
  }
});

test("clear logs: a waiting run folder is kept; a closed one goes WITH its refs/orc/runs/<slug>/pre ref", () => {
  const root = project();
  try {
    git(root, "init", "-q");
    git(root, "config", "user.email", "t@example.com");
    git(root, "config", "user.name", "t");
    git(root, "commit", "-q", "--allow-empty", "-m", "base");
    const waiting = runFolder(root, "still-waiting", 200, { "RESUME.md": "Where it stands: /orc · phase execution\n" });
    const closed = runFolder(root, "closed-run", 200, { "RESUME.closed.md": "x", "closed.json": "{}", "snapshot.json": "{}" });
    git(root, "update-ref", "refs/orc/runs/closed-run/pre", "HEAD");
    git(root, "update-ref", "refs/orc/runs/still-waiting/pre", "HEAD");
    const preview = clear(root).j;
    const row = preview.delete.find((d) => d.kind === "run");
    assert.strictEqual(row.ref, "refs/orc/runs/closed-run/pre", "the preview names the ref");
    assert.strictEqual(row.status, "closed");
    const { r, j } = clear(root, "--apply");
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.ok(exists(path.join(waiting, "RESUME.md")), "a waiting run is never deleted");
    assert.ok(j.keep.some((k) => /still-waiting/.test(k.path) && /waiting run/.test(k.reason)));
    assert.ok(!exists(closed), "the closed run folder is gone");
    const refs = git(root, "for-each-ref", "--format=%(refname)", "refs/orc/runs");
    assert.ok(!/closed-run/.test(refs), "its ref is gone too");
    assert.match(refs, /still-waiting/, "the waiting run keeps its ref");
  } finally {
    rmrf(root);
  }
});

test("clear logs: a trace with an ASK line is kept at 100 days (habit evidence) and deleted at 200", () => {
  const root = project();
  try {
    const a100 = trace(root, "mini", "ask-hundred", 100, { ask: true });
    const a200 = trace(root, "mini", "ask-two-hundred", 200, { ask: true });
    const { j } = clear(root, "--apply");
    assert.ok(exists(a100.paths[0]));
    assert.ok(j.keep.some((k) => /ask-hundred/.test(k.path) && /holds habit answers \(younger than 180 days\)/.test(k.reason)));
    assert.ok(!exists(a200.paths[0]), "older than 180 days, the habit window does not hold it");
  } finally {
    rmrf(root);
  }
});

test("clear logs: --older-than 30 with aftermath_window_days: 60 moves the cutoff to 60 and says so", () => {
  const root = project("aftermath_window_days: 60\n");
  try {
    const t45 = trace(root, "mini", "forty-five", 45);
    const t70 = trace(root, "mini", "seventy", 70);
    const { r, j } = clear(root, "--older-than", "30", "--apply");
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(j.older_than_days, 30);
    assert.strictEqual(j.effective_days, 60);
    assert.deepStrictEqual(j.cutoff_moved, { from: 30, to: 60, reason: "aftermath_window_days" });
    assert.ok(j.notes.some((n) => /moved from 30 to 60 days/.test(n)));
    assert.ok(exists(t45.paths[0]), "inside the aftermath window");
    assert.ok(!exists(t70.paths[0]));
    const h = cli(["clear", "logs", "--older-than", "30", "--dir", root]);
    assert.match(h.stdout, /moved from 30 to 60 days/, "the human print says it in one line");
  } finally {
    rmrf(root);
  }
});

test("clear logs: --older-than 45 exits 2 and names the allowed set", () => {
  const root = project();
  try {
    const { r, j } = clear(root, "--older-than", "45");
    assert.strictEqual(r.status, 2);
    assert.strictEqual(j.ok, false);
    assert.match(j.message, /30 \| 60 \| 90 \| 120 \| 240 \| 360/);
    const h = cli(["clear", "logs", "--older-than", "45", "--dir", root]);
    assert.strictEqual(h.status, 2);
    assert.match(h.stderr, /30 \| 60 \| 90 \| 120 \| 240 \| 360/);
  } finally {
    rmrf(root);
  }
});

test("clear logs: a copied trace (fresh mtime, old line stamps) is dated by the line stamps", () => {
  const root = project();
  try {
    // The copy happened 2 days ago — past the 6-hour guard, far inside 90 days.
    const t = trace(root, "mini", "copied", 120, { mtimeDays: 2 });
    const { j } = clear(root);
    const row = j.delete.find((d) => /copied/.test(d.path));
    assert.ok(row, "dated by its stamps, so it is old enough");
    assert.strictEqual(row.dated_by, "line stamp");
    const d = new Date(Date.now() - 120 * DAY);
    assert.strictEqual(row.last_activity.slice(0, 10), `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    assert.ok(exists(t.paths[0]), "print mode");
  } finally {
    rmrf(root);
  }
});

test("clear logs: orc stats totals are the same before and after --apply (DE-19 a)", () => {
  const root = project();
  try {
    trace(root, "mini", "old-a", 100, { dispatches: 3, downgrades: 1 });
    trace(root, "orc", "old-b", 150, { dispatches: 7, unfinished: true });
    trace(root, "quick", "fresh-c", 5, { dispatches: 1 });
    const pick = (s) => ({ runs: s.runs, from: s.from, to: s.to, lanes: s.lanes, agents: s.agents, dispatches: s.dispatches, downgrades: s.downgrades, unfinished: s.unfinished, unknown_lane: s.unknown_lane });
    const before = JSON.parse(cli(["stats", "--json", "--dir", root]).stdout);
    assert.strictEqual(before.pruned_runs, 0);
    const { j } = clear(root, "--apply");
    assert.strictEqual(j.rollup.runs_added, 2);
    const after = JSON.parse(cli(["stats", "--json", "--dir", root]).stdout);
    assert.deepStrictEqual(pick(after), pick(before));
    assert.strictEqual(after.pruned_runs, 2);
    assert.match(cli(["stats", "--dir", root]).stdout, /includes 2 pruned runs/);
    const rollup = JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "logs-rollup.json"), "utf8"));
    assert.ok(rollup.buckets && Object.keys(rollup.buckets).length === 2, "per lane and month");
  } finally {
    rmrf(root);
  }
});

test("clear logs: log_retention_auto on — the FINISH sweep runs once, not again inside 24 h; off — no scan", () => {
  const fin = 'phase: FINISH\nevents:\n  - {ts: "011026 10:40:00.000", verb: "FINISH", tail: "done"}\n';
  const finish = (root) => {
    const f = path.join(root, "packet.yaml");
    fs.writeFileSync(f, fin);
    const r = cli(["trace", "write", "--packet", f, "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, "the sweep never changes the exit code: " + r.stdout + r.stderr);
    return JSON.parse(r.stdout);
  };
  const setup = (cfg) => {
    const root = project(cfg);
    const cur = trace(root, "mini", "live", 0);
    fs.writeFileSync(path.join(logs(root), ".current"), cur.name + "\n");
    return { root, cur };
  };
  const on = setup("log_retention_auto: on\n");
  try {
    const old1 = trace(on.root, "mini", "old-first", 100);
    const j1 = finish(on.root);
    assert.ok(j1.log_sweep && j1.log_sweep.ran, "the first FINISH sweeps");
    assert.ok(!exists(old1.paths[0]), "the old trace went");
    for (const p of on.cur.paths) assert.ok(exists(p), "the run that just finished is kept");
    const rollup = JSON.parse(fs.readFileSync(path.join(on.root, ".claude", "orc", "logs-rollup.json"), "utf8"));
    assert.ok(rollup.last_sweep && rollup.last_sweep.files === 4, "last_sweep is written");
    const old2 = trace(on.root, "mini", "old-second", 100);
    const j2 = finish(on.root);
    assert.ok(!j2.log_sweep, "a second FINISH inside 24 h does not sweep");
    assert.ok(exists(old2.paths[0]));
    // The Maintenance row's summary reads that memo.
    const s = JSON.parse(cli(["clear", "logs", "--summary", "--json", "--dir", on.root]).stdout);
    assert.strictEqual(s.auto, "on");
    assert.strictEqual(s.last_sweep.files, 4);
  } finally {
    rmrf(on.root);
  }
  const off = setup(null);
  try {
    const old = trace(off.root, "mini", "old-off", 100);
    const j = finish(off.root);
    assert.ok(!j.log_sweep, "off — no sweep");
    assert.ok(exists(old.paths[0]));
    assert.ok(!exists(path.join(off.root, ".claude", "orc", "logs-rollup.json")), "off — not even the memo is written");
  } finally {
    rmrf(off.root);
  }
});

test("clear logs: class b user data survives --apply at any age, even when log_dir holds it", () => {
  const root = project("log_dir: .claude/orc\n");
  try {
    const orc = path.join(root, ".claude", "orc");
    const b = ["habits-state.json", "habits-cache.json", "observations.jsonl", "gotchas-sync.json", "extra-spend.jsonl", "budget-rates.json", "logs-rollup.json"];
    for (const f of b) {
      fs.writeFileSync(path.join(orc, f), f === "logs-rollup.json" ? '{"version":1,"buckets":{}}' : "{}");
      setAge(path.join(orc, f), 400);
    }
    const t = trace(root, "mini", "old-one", 400, { dir: orc });
    const { r, j } = clear(root, "--older-than", "30", "--apply");
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    for (const f of b) assert.ok(exists(path.join(orc, f)), "user data kept: " + f);
    for (const f of b) assert.ok(j.keep.some((k) => k.path.endsWith(f) && /user data/.test(k.reason)), "the reason is named: " + f);
    assert.ok(!exists(t.paths[0]), "the old trace beside them went");
  } finally {
    rmrf(root);
  }
});

test("clear logs: --json is one object, also when nothing matches", () => {
  const root = project();
  try {
    const r = cli(["clear", "logs", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    const j = JSON.parse(r.stdout); // the WHOLE stdout parses — nothing beside the object
    assert.strictEqual(j.ok, true);
    assert.deepStrictEqual(j.delete, []);
    assert.deepStrictEqual(j.totals, { units: 0, files: 0, bytes: 0 });
    const a = cli(["clear", "logs", "--apply", "--json", "--dir", root]);
    assert.strictEqual(a.status, 0);
    assert.strictEqual(JSON.parse(a.stdout).applied, true);
  } finally {
    rmrf(root);
  }
});

test("clear logs: the old default folder is reported, and cleared only with --include-default-dir", () => {
  const root = project("log_dir: .claude/orc/traces\n");
  try {
    fs.mkdirSync(path.join(root, ".claude", "orc", "traces"), { recursive: true });
    const t = trace(root, "mini", "in-default", 100);
    const { j } = clear(root, "--apply");
    assert.ok(exists(t.paths[0]), "never included in silence");
    assert.strictEqual(j.default_dir.included, false);
    assert.strictEqual(j.default_dir.files, 4);
    assert.ok(j.notes.some((n) => /--include-default-dir/.test(n)));
    const k = clear(root, "--apply", "--include-default-dir").j;
    assert.strictEqual(k.default_dir.included, true);
    assert.ok(!exists(t.paths[0]), "included: the same rules apply");
    const rp = path.join(root, ".claude", "orc", "logs-rollup.json");
    const rollup = exists(rp) ? JSON.parse(fs.readFileSync(rp, "utf8")) : {};
    assert.deepStrictEqual(rollup.buckets || {}, {}, "orc stats never read that folder, so nothing is rolled up");
  } finally {
    rmrf(root);
  }
});
