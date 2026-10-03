"use strict";
// @test-pool spawn  — shells node bin/cli.js
// `orc wait` (v1.1.0 W1) — the deterministic half of `/orc-wait`.
//
// The load-bearing assertion is the BOTH-DIRECTIONS agreement between
// WAIT_LANE_SHAPES in bin/cli.js and the `## Which lanes support a wait` table
// in templates/skills/_shared/wait.md. That is the EXTRA_LANE_SHAPES /
// DIY_STEPS precedent: a lane added to one copy and not the other is drift the
// contract lint cannot see, because the lint matches a TOKEN and not a table.
//
// Everything else here is an exit-code contract. `wait plan` is the only place
// hop arithmetic exists — the skill must never recompute it, so it must never
// be wrong here.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tmpdir, rmrf, cli } = require("../_helpers.js");

const REPO = path.join(__dirname, "..", "..");
const WAIT_MD = path.join(REPO, "templates", "skills", "_shared", "wait.md");

function jsonOf(res) {
  return JSON.parse(res.stdout);
}

// ── the golden: the table is CODE and PROSE, and they agree ────────────────

test("wait lanes: every CLI row appears in wait.md, and every wait.md row in the CLI", () => {
  const res = cli(["wait", "lanes", "--json"]);
  assert.equal(res.status, 0);
  const cliLanes = jsonOf(res).lanes;

  const md = fs.readFileSync(WAIT_MD, "utf8");
  const section = md.split("## Which lanes support a wait")[1];
  assert.ok(section, "wait.md must carry the `## Which lanes support a wait` heading");
  const table = section.split(/\n## /)[0];

  const mdRows = [];
  for (const line of table.split("\n")) {
    const m = /^\|\s*`(\/orc[a-z-]*)`\s*\|\s*([a-z]+)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(line);
    if (m) mdRows.push({ lane: m[1], checkpoint: m[2], safe_point: m[3] });
  }
  assert.ok(mdRows.length >= 20, `parsed only ${mdRows.length} rows from wait.md`);

  // Direction 1: nothing in the CLI is missing from the prose.
  for (const row of cliLanes) {
    const md1 = mdRows.find((r) => r.lane === row.lane);
    assert.ok(md1, `${row.lane} is in WAIT_LANE_SHAPES but not in wait.md`);
    assert.equal(md1.checkpoint, row.checkpoint, `${row.lane}: checkpoint disagrees`);
    assert.equal(md1.safe_point, row.safe_point, `${row.lane}: safe point disagrees`);
  }
  // Direction 2: nothing in the prose is missing from the CLI.
  for (const row of mdRows) {
    assert.ok(
      cliLanes.find((r) => r.lane === row.lane),
      `${row.lane} is in wait.md but not in WAIT_LANE_SHAPES`
    );
  }
  assert.equal(cliLanes.length, mdRows.length);
});

test("wait lanes: a `none` row keeps its slot and says the modes are identical", () => {
  const out = jsonOf(cli(["wait", "lanes", "--json"]));
  const none = out.lanes.filter((l) => l.checkpoint === "none");
  assert.ok(none.length >= 10, "single-dispatch and read-only lanes must still be listed");
  for (const l of none) {
    assert.equal(l.modes_differ, false);
    assert.match(l.detail, /identically/);
  }
  const full = out.lanes.filter((l) => l.checkpoint === "full");
  for (const l of full) {
    assert.equal(l.modes_differ, true);
    assert.match(l.detail, /soft forces/);
  }
});

test("wait lanes: the mode set is exactly safe/soft/hard", () => {
  const out = jsonOf(cli(["wait", "lanes", "--json"]));
  assert.deepEqual(out.modes, ["safe", "soft", "hard"]);
  for (const l of out.lanes) assert.deepEqual(l.modes, ["safe", "soft", "hard"]);
});

// ── `wait plan` — the exit-code contract ───────────────────────────────────

test("wait plan: every accepted spelling parses", () => {
  const cases = [
    ["30", 30],
    ["30m", 30],
    ["90m", 90],
    ["2h", 120],
    ["2h30m", 150],
    ["2h30", 150],
  ];
  for (const [spec, minutes] of cases) {
    const res = cli(["wait", "plan", spec, "--json"]);
    assert.equal(res.status, 0, `${spec} should parse`);
    const out = jsonOf(res);
    assert.equal(out.minutes, minutes, `${spec} → ${minutes} min`);
    assert.equal(out.source, "duration");
  }
});

test("wait plan: `until HH:MM` is always in the future, never a negative wait", () => {
  const out = jsonOf(cli(["wait", "plan", "until", "00:01", "--json"]));
  assert.equal(out.source, "until");
  assert.ok(out.minutes > 0, "a time already past today means tomorrow");
  assert.ok(out.minutes <= 24 * 60);
});

test("wait plan: an unparsable spec exits 1 and names the accepted forms", () => {
  const res = cli(["wait", "plan", "banana", "--json"]);
  assert.equal(res.status, 1);
  const out = jsonOf(res);
  assert.equal(out.ok, false);
  assert.equal(out.reason, "unparsable");
  assert.match(out.hint, /until 18:41/);
});

test("wait plan: a zero wait is refused", () => {
  const res = cli(["wait", "plan", "0", "--json"]);
  assert.equal(res.status, 1);
  assert.equal(jsonOf(res).reason, "zero");
});

test("wait plan: `reset` with no reading exits 2 and names the fix", () => {
  const root = tmpdir();
  try {
    const res = cli(["wait", "plan", "reset", "--dir", root, "--json"]);
    // 2 is `unknown`, NOT 1 (`unparsable`) — the spec was fine, the reading is
    // absent. Unknown is not an error the user made.
    assert.equal(res.status, 2);
    const out = jsonOf(res);
    assert.equal(out.reason, "no-reading");
    assert.match(out.hint, /Type a time instead/);
  } finally {
    rmrf(root);
  }
});

test("wait plan: `reset` reads a FRESH bridge and refuses a stale one", () => {
  const root = tmpdir();
  try {
    const orcDir = path.join(root, ".claude", "orc");
    fs.mkdirSync(orcDir, { recursive: true });
    const bridge = path.join(orcDir, "usage.json");
    const write = (writtenAt, resetsInMs) =>
      fs.writeFileSync(
        bridge,
        JSON.stringify({
          five_hour: { used_percentage: 94, resets_at: Date.now() + resetsInMs },
          seven_day: { used_percentage: 41, resets_at: Date.now() + 86400000 },
          written_at: writtenAt,
        })
      );

    write(Date.now(), 45 * 60000);
    const ok = cli(["wait", "plan", "reset", "--dir", root, "--json"]);
    assert.equal(ok.status, 0);
    const out = jsonOf(ok);
    assert.equal(out.source, "reset");
    assert.ok(out.minutes >= 43 && out.minutes <= 46, `got ${out.minutes} min`);

    // Older than the 30-minute freshness window → `unknown`, same as absent.
    write(Date.now() - 31 * 60 * 1000, 45 * 60000);
    const stale = cli(["wait", "plan", "reset", "--dir", root, "--json"]);
    assert.equal(stale.status, 2);
    assert.equal(jsonOf(stale).reason, "no-reading");
  } finally {
    rmrf(root);
  }
});

// ── hop arithmetic ─────────────────────────────────────────────────────────

test("wait plan: the LAST hop is the remainder, never a full hop", () => {
  const out = jsonOf(cli(["wait", "plan", "70", "--json"]));
  assert.deepEqual(out.hops, [30, 30, 10]);
  assert.equal(
    out.hops.reduce((a, b) => a + b, 0),
    70,
    "the hops must sum to the requested time — an overshoot waits for nothing"
  );
  assert.equal(out.truncated, false);
  assert.equal(out.uncovered_minutes, 0);
});

test("wait plan: a wait shorter than one hop is ONE hop", () => {
  const out = jsonOf(cli(["wait", "plan", "25", "--json"]));
  assert.deepEqual(out.hops, [25]);
  assert.equal(out.hop_count, 1);
});

test("wait plan: max_hops truncates, and the shortfall is NAMED", () => {
  const out = jsonOf(cli(["wait", "plan", "5h", "--max-hops", "3", "--json"]));
  assert.deepEqual(out.hops, [30, 30, 30]);
  assert.equal(out.truncated, true);
  // 300 requested, 90 covered. A silent shortfall is a wait that ends early
  // and looks like it worked.
  assert.equal(out.uncovered_minutes, 210);
});

test("wait plan: --hop overrides the default hop length", () => {
  const out = jsonOf(cli(["wait", "plan", "60", "--hop", "15", "--json"]));
  assert.deepEqual(out.hops, [15, 15, 15, 15]);
  assert.equal(out.hop_minutes, 15);
});

test("wait plan: a wait over one hour reports that it crosses the cache TTL", () => {
  assert.equal(jsonOf(cli(["wait", "plan", "45", "--json"])).crosses_cache_ttl, false);
  assert.equal(jsonOf(cli(["wait", "plan", "61", "--json"])).crosses_cache_ttl, true);
});

// ── the `--json is not a summary` rule ─────────────────────────────────────

test("wait plan --json carries every field the human branch prints", () => {
  const res = cli(["wait", "plan", "150", "--json"]);
  const out = jsonOf(res);
  for (const k of [
    "minutes",
    "hops",
    "hop_count",
    "hop_minutes",
    "max_hops",
    "ends_at",
    "truncated",
    "uncovered_minutes",
    "crosses_cache_ttl",
    "source",
    "modes",
  ])
    assert.ok(k in out, `--json must carry ${k} — a field the human path prints`);
});

test("wait: --json prints exactly one object and nothing else", () => {
  for (const argv of [
    ["wait", "lanes", "--json"],
    ["wait", "plan", "30", "--json"],
  ]) {
    const res = cli(argv);
    assert.doesNotThrow(() => JSON.parse(res.stdout), argv.join(" "));
    assert.equal(res.stdout.trimEnd().split("\n").pop(), "}");
  }
});

test("wait: an unknown subcommand exits 1 with usage", () => {
  const res = cli(["wait", "sleep"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /orc wait lanes/);
  assert.match(res.stderr, /orc wait plan/);
});

// ── W2: the run state — block, unblock, cancel, status ─────────────────────
//
// ONE writer, and it is this CLI. The skill never writes wait.json, so the
// state can never be behind the disk — the v0.49.5 hand-back lesson.

function runProject() {
  const root = tmpdir();
  const dir = path.join(root, ".claude", "orc", "run", "demo-run");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "RESUME.md"), "Where it stands:  /orc · phase 4 · wave 3 of 6\n");
  return { root, dir };
}

test("wait block: a reason is REQUIRED and the refusal names the flag", () => {
  const { root } = runProject();
  try {
    const res = cli(["wait", "block", "demo-run", "--dir", root, "--json"]);
    assert.equal(res.status, 1);
    const out = jsonOf(res);
    assert.equal(out.reason, "no-reason");
    assert.match(out.hint, /--reason/);
    // Nothing may be written by a refused block.
    assert.equal(fs.existsSync(path.join(root, ".claude/orc/run/demo-run/wait.json")), false);
  } finally {
    rmrf(root);
  }
});

test("wait block: the reason is stored VERBATIM and the age is computed on read", () => {
  const { root } = runProject();
  try {
    const why = "window resets in 5m, task needs 10";
    const b = cli(["wait", "block", "demo-run", "--reason", why, "--dir", root, "--json"]);
    assert.equal(b.status, 0);
    assert.equal(jsonOf(b).reason, why);

    const s = jsonOf(cli(["wait", "status", "demo-run", "--dir", root, "--json"]));
    assert.equal(s.blocked, true);
    assert.equal(s.block_reason, why);
    // The AGE is what keeps an old block from applying invisibly. There is no
    // auto-expiry, so it must always be computable.
    assert.equal(typeof s.block_age_minutes, "number");
  } finally {
    rmrf(root);
  }
});

test("wait block: the state lives BESIDE RESUME.md, so it dies with the run", () => {
  const { root, dir } = runProject();
  try {
    cli(["wait", "block", "demo-run", "--reason", "x", "--dir", root, "--json"]);
    assert.ok(fs.existsSync(path.join(dir, "wait.json")), "wait.json belongs in the run folder");
    assert.ok(fs.existsSync(path.join(dir, "RESUME.md")), "beside the hand-back");
  } finally {
    rmrf(root);
  }
});

test("wait unblock: clears the block, and a second unblock exits 1", () => {
  const { root } = runProject();
  try {
    cli(["wait", "block", "demo-run", "--reason", "x", "--dir", root, "--json"]);
    const u = cli(["wait", "unblock", "demo-run", "--dir", root, "--json"]);
    assert.equal(u.status, 0);
    assert.equal(jsonOf(u).blocked, false);
    const again = cli(["wait", "unblock", "demo-run", "--dir", root, "--json"]);
    assert.equal(again.status, 1);
    assert.equal(jsonOf(again).reason, "not-blocked");
  } finally {
    rmrf(root);
  }
});

test("wait block: an unknown run exits 2 and NEVER guesses a run", () => {
  const { root } = runProject();
  try {
    const res = cli(["wait", "block", "nope", "--reason", "x", "--dir", root, "--json"]);
    // 2, not 1: the command was well-formed. And with a real run sitting right
    // there, it must not be adopted — a block on the wrong run silently
    // protects something the user is not looking at.
    assert.equal(res.status, 2);
    assert.equal(jsonOf(res).reason, "no-run");
    assert.equal(fs.existsSync(path.join(root, ".claude/orc/run/demo-run/wait.json")), false);
  } finally {
    rmrf(root);
  }
});

test("wait status: no run is an ANSWER — it still returns its object", () => {
  const root = tmpdir();
  try {
    const res = cli(["wait", "status", "--dir", root, "--json"]);
    assert.equal(res.status, 1);
    const out = jsonOf(res);
    assert.equal(out.ok, true);
    assert.equal(out.run, null);
    assert.equal(out.blocked, false);
  } finally {
    rmrf(root);
  }
});

test("wait cancel: refuses when no wait is running", () => {
  const { root } = runProject();
  try {
    const res = cli(["wait", "cancel", "demo-run", "--dir", root, "--json"]);
    assert.equal(res.status, 1);
    assert.equal(jsonOf(res).reason, "no-wait");
  } finally {
    rmrf(root);
  }
});

test("wait block: the trace line is written BY THE CLI, into the open trace", () => {
  const { root } = runProject();
  try {
    const logs = path.join(root, ".claude", "orc", "logs");
    fs.mkdirSync(logs, { recursive: true });
    const trace = "run-orc-demo-run-310826-101500.txt";
    fs.writeFileSync(path.join(logs, trace), "");
    fs.writeFileSync(path.join(logs, ".current"), trace);

    const out = jsonOf(cli(["wait", "block", "demo-run", "--reason", "quota", "--dir", root, "--json"]));
    assert.ok(out.trace_line, "a block that leaves no line cannot be counted");
    const text = fs.readFileSync(path.join(logs, trace), "utf8");
    assert.match(text, /\] cli\s+WAIT block :: reason="quota" by=user/);

    const u = jsonOf(cli(["wait", "unblock", "demo-run", "--dir", root, "--json"]));
    assert.ok(u.trace_line);
    assert.match(fs.readFileSync(path.join(logs, trace), "utf8"), /\] cli\s+WAIT unblock$/m);
  } finally {
    rmrf(root);
  }
});

test("wait block: no trace is best-effort, never a failure", () => {
  const { root } = runProject();
  try {
    // No log dir and no .current — the block must still succeed.
    const res = cli(["wait", "block", "demo-run", "--reason", "x", "--dir", root, "--json"]);
    assert.equal(res.status, 0);
    assert.equal(jsonOf(res).trace_line, null);
  } finally {
    rmrf(root);
  }
});

test("orc-wait is a config lane, and every dispatch family is INERT there", () => {
  const out = jsonOf(cli(["lane", "config", "orc-wait", "--json"]));
  assert.equal(out.lane, "orc-wait");
  // This lane dispatches nothing, so a family that answers "which model runs
  // this" has no work to name. A setting that does nothing must never be
  // reported as live.
  assert.equal(out.families["executor-band"].inert, true);
  assert.match(out.families["executor-band"].inert_reason, /dispatches nothing/);
  assert.equal(out.families["fixed-role-model"].inert, true);
});

// ── W3: the rollout is COMPLETE, or it is not a rollout ────────────────────
//
// A wait whose behaviour depends on which lane you are in is worse than no
// wait. This is the payload-walking guard for that: every lane the registry
// declares must carry the token and a pointer, and the values in its spine must
// be the values the CLI computes.

test("W3: every lane in WAIT_LANE_SHAPES carries the token and the pointer", () => {
  const SKILLS = path.join(REPO, "templates", "skills");
  // /orc-ultra runs the `orc` skill and /orc-plan its planner subskill —
  // neither has a spine of its own.
  const ALIASES = new Set(["/orc-ultra", "/orc-plan"]);
  const lanes = jsonOf(cli(["wait", "lanes", "--json"])).lanes;
  const missing = [];
  let checked = 0;
  for (const row of lanes) {
    if (ALIASES.has(row.lane)) continue;
    const file = path.join(SKILLS, row.lane.replace(/^\//, ""), "SKILL.md");
    assert.ok(fs.existsSync(file), `${row.lane} has no spine at ${file}`);
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("a lane that waits without a hand-back")) missing.push(row.lane);
    else {
      // The pointer, never a forked copy of the prose.
      assert.match(text, /_shared\/wait\.md/, `${row.lane} must point at the canonical file`);
      // And the spine's own row must AGREE with the registry.
      assert.ok(
        text.includes(`Checkpoint **${row.checkpoint}**`),
        `${row.lane} spine disagrees with WAIT_LANE_SHAPES on its checkpoint`
      );
      assert.ok(
        text.includes(`safe point **${row.safe_point}**`),
        `${row.lane} spine disagrees with WAIT_LANE_SHAPES on its safe point`
      );
      checked++;
    }
  }
  assert.deepEqual(missing, [], "these lanes declare a wait but no spine says so");
  assert.ok(checked >= 24, `only ${checked} spines wired`);
});

test("W3: no spine forks the canonical prose", () => {
  const SKILLS = path.join(REPO, "templates", "skills");
  const lanes = jsonOf(cli(["wait", "lanes", "--json"])).lanes;
  for (const row of lanes) {
    if (row.lane === "/orc-ultra" || row.lane === "/orc-plan") continue;
    const file = path.join(SKILLS, row.lane.replace(/^\//, ""), "SKILL.md");
    const text = fs.readFileSync(file, "utf8");
    const block = text.split("## Waiting mid-run")[1] || "";
    // A pointer is short by construction. Prose creeping back into a spine is
    // exactly what the spine budget and this contract both exist to stop.
    assert.ok(
      block.split("\n").filter((l) => l.trim()).length <= 4,
      `${row.lane}: the wait block has grown into prose — it belongs in _shared/wait.md`
    );
  }
});

// ── W4/W5: the usage bridge and the computed gate ──────────────────────────
//
// The whole point of this half is that UNKNOWN IS NOT LOW. A gate that blocks
// on a missing reading is a gate people switch off, so exit 2 must never behave
// like exit 1 anywhere.

function bridgeProject(reading) {
  const root = tmpdir();
  const orcDir = path.join(root, ".claude", "orc");
  fs.mkdirSync(orcDir, { recursive: true });
  if (reading) fs.writeFileSync(path.join(orcDir, "usage.json"), JSON.stringify(reading));
  return root;
}

const fresh = (fh, sd, ctx) => ({
  five_hour: { used_percentage: fh, resets_at: Date.now() + 107 * 60000 },
  seven_day: { used_percentage: sd, resets_at: Date.now() + 86400000 },
  context_used_percentage: ctx == null ? 20 : ctx,
  written_at: Date.now(),
});

test("usage check: no reading is UNKNOWN (exit 2), and says so in words", () => {
  const root = bridgeProject(null);
  try {
    const res = cli(["usage", "check", "--dir", root, "--json"]);
    assert.equal(res.status, 2);
    const out = jsonOf(res);
    assert.equal(out.state, "unknown");
    assert.equal(out.ok, true, "an empty result is an ANSWER — it still returns its object");
    assert.match(out.note, /unknown is not low/);
  } finally {
    rmrf(root);
  }
});

test("usage check: a stale reading is UNKNOWN, not stale-but-usable", () => {
  const r = fresh(94, 41);
  r.written_at = Date.now() - 31 * 60 * 1000;
  const root = bridgeProject(r);
  try {
    assert.equal(cli(["usage", "check", "--dir", root, "--json"]).status, 2);
  } finally {
    rmrf(root);
  }
});

test("usage check: plenty of quota exits 0", () => {
  const root = bridgeProject(fresh(20, 30));
  try {
    const res = cli(["usage", "check", "--dir", root, "--json"]);
    assert.equal(res.status, 0);
    assert.equal(jsonOf(res).state, "ok");
  } finally {
    rmrf(root);
  }
});

test("usage check: THE WORST WINDOW DECIDES", () => {
  // The 5-hour window is fine and the weekly one is nearly gone. Continuing
  // here is how a run dies twenty minutes later.
  const root = bridgeProject(fresh(20, 96));
  try {
    const res = cli(["usage", "check", "--dir", root, "--json"]);
    assert.equal(res.status, 1);
    const out = jsonOf(res);
    assert.equal(out.state, "low");
    assert.equal(out.worst, "wk");
    assert.equal(out.five_hour.low, false);
    assert.equal(out.seven_day.low, true);
  } finally {
    rmrf(root);
  }
});

test("usage check: usage_stop_pct moves the line, and is INERT while the gate is off", () => {
  const root = bridgeProject(fresh(88, 10));
  try {
    // 12% left, default threshold 10 → ok.
    assert.equal(cli(["usage", "check", "--dir", root, "--json"]).status, 0);
    cli(["config", "set", "usage_stop_pct", "20", "--dir", root]);
    assert.equal(cli(["usage", "check", "--dir", root, "--json"]).status, 1);

    // And the registry must SAY it does nothing while usage_gate is off — a
    // shadowed setting must never be silent.
    const list = cli(["config", "list", "--dir", root]);
    assert.match(list.stdout, /usage_stop_pct/);
    assert.match(list.stdout, /inert: usage_gate is off/);
  } finally {
    rmrf(root);
  }
});

test("usage check: the reading carries context, for the come-back decision", () => {
  const root = bridgeProject(fresh(50, 20, 81));
  try {
    assert.equal(jsonOf(cli(["usage", "check", "--dir", root, "--json"])).context, 81);
  } finally {
    rmrf(root);
  }
});

test("usage check: a reading is never reported as a promise", () => {
  const root = bridgeProject(fresh(50, 20));
  try {
    const out = jsonOf(cli(["usage", "check", "--dir", root, "--json"]));
    assert.match(out.note, /reading and not a promise/);
  } finally {
    rmrf(root);
  }
});

test("every default in the wait family is OFF or ASK", () => {
  const root = tmpdir();
  try {
    const out = jsonOf(cli(["config", "list", "--dir", root, "--json"]));
    const byKey = Object.fromEntries((out.keys || out.config || []).map((k) => [k.key, k]));
    assert.equal(String(byKey.usage_gate.value), "off");
    assert.equal(String(byKey.wait_default_mode.value), "ask");
  } finally {
    rmrf(root);
  }
});

test("W4: the statusline hook WRITES the bridge, raw and fail-silent", () => {
  const { root, claudeDir } = require("../_helpers.js").freshInstall();
  try {
    const payload = {
      workspace: { project_dir: root },
      model: { id: "claude-opus-5-5" },
      rate_limits: {
        five_hour: { used_percentage: 94.4, resets_at: Math.floor(Date.now() / 1000) + 6420 },
        seven_day: { used_percentage: 41, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
      context_window: { used_percentage: 63 },
    };
    const res = require("../_helpers.js").runHook(claudeDir, "orc-statusline.js", payload);
    assert.equal(res.status, 0);

    const file = path.join(root, ".claude", "orc", "usage.json");
    assert.ok(fs.existsSync(file), "the statusline is the only writer of this bridge");
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    // RAW numbers only. A stored state word is wrong one minute later.
    assert.equal(j.five_hour.used_percentage, 94.4);
    assert.equal(j.context_used_percentage, 63);
    assert.equal(typeof j.written_at, "number");
    assert.ok(!("state" in j) && !("low" in j), "never store a computed state");

    // And the CLI must read what the hook just wrote.
    const chk = cli(["usage", "check", "--dir", root, "--json"]);
    assert.equal(chk.status, 1, "94% used = 6% left, below the default 10");
    assert.equal(jsonOf(chk).five_hour.used_percentage, 94);
  } finally {
    rmrf(root);
  }
});

test("W4: a payload with no rate_limits writes no bridge and still renders", () => {
  const { root, claudeDir } = require("../_helpers.js").freshInstall();
  try {
    const res = require("../_helpers.js").runHook(claudeDir, "orc-statusline.js", {
      workspace: { project_dir: root },
      model: { id: "claude-opus-5-5" },
    });
    assert.equal(res.status, 0);
    assert.ok(res.stdout.length > 0, "the statusline must always render a line");
    assert.doesNotMatch(res.stdout, /undefined/);
    assert.equal(fs.existsSync(path.join(root, ".claude", "orc", "usage.json")), false);
  } finally {
    rmrf(root);
  }
});

// ── v2.1.2 F17 — the human refusals ────────────────────────────────────────
// Every wait test above passes --json, so the human branch never ran: four
// refusals called a glyph the terminal kit never had and died with a TypeError.

test("wait: the human refusals print a mark and the hint — never a TypeError", () => {
  const empty = tmpdir();
  const { root } = runProject();
  try {
    const plan = cli(["wait", "plan", "banana"]);
    assert.equal(plan.status, 1);
    assert.match(plan.stderr, /cannot read "banana"/);
    assert.match(plan.stderr, /90m/);

    const reset = cli(["wait", "plan", "reset", "--dir", empty]);
    assert.equal(reset.status, 2);
    assert.match(reset.stderr, /no reading in the last 30 minutes/);

    const noRun = cli(["wait", "block", "--dir", empty]);
    assert.equal(noRun.status, 2);
    assert.match(noRun.stderr, /cannot find the run/);

    const noReason = cli(["wait", "block", "demo-run", "--dir", root]);
    assert.equal(noReason.status, 1);
    assert.match(noReason.stderr, /--reason/);

    for (const r of [plan, reset, noRun, noReason]) assert.ok(!/TypeError/.test(r.stderr), r.stderr);
  } finally {
    rmrf(empty);
    rmrf(root);
  }
});

test("every ui.* helper the CLI calls exists in bin/ui.js", () => {
  const kit = require("../../bin/ui.js");
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  let seen = 0;
  for (const m of src.matchAll(/(?<![\w.])(?:ui|U)\.(mark|color|glyph)\.(\w+)/g)) {
    seen++;
    assert.ok(kit[m[1]] && m[2] in kit[m[1]], `ui.${m[1]}.${m[2]} is not in bin/ui.js`);
  }
  for (const m of src.matchAll(/(?<![\w.])(?:ui|U)\.(\w+)\(/g)) {
    seen++;
    assert.ok(m[1] in kit, `ui.${m[1]}() is not in bin/ui.js`);
  }
  assert.ok(seen > 50, "the scan must find the calls it guards");
});

// ── v2.1.2 F10 + F11 — the STARTED half ────────────────────────────────────
// `wait.json` had a reader for a started wait and no writer, so `status` could
// never say `waiting` and `cancel` always refused. `start` and `end` are the
// writer; whether a wait is live is COMPUTED from its start and the clock.

function tracedProject() {
  const { root, dir } = runProject();
  const logs = path.join(root, ".claude", "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  const trace = path.join(logs, "run-orc-demo-run-310826-101500.txt");
  fs.writeFileSync(trace, "");
  fs.writeFileSync(path.join(logs, ".current"), path.basename(trace));
  return { root, dir, trace };
}

test("wait start: a run in flight gets wait.json and ONE `WAIT mode=` line, and status reads waiting", () => {
  const { root, dir, trace } = tracedProject();
  try {
    // No slug: the trace pointer names the run.
    const res = cli(["wait", "start", "30", "--mode", "hard", "--dir", root, "--json"]);
    assert.equal(res.status, 0);
    const out = jsonOf(res);
    assert.equal(out.recorded, true);
    assert.equal(out.slug, "demo-run");
    assert.equal(out.minutes, 30, "the mode's value must not leak into the spec");
    assert.deepEqual(out.hops, [30]);

    const st = JSON.parse(fs.readFileSync(path.join(dir, "wait.json"), "utf8"));
    assert.equal(st.mode, "hard");
    assert.equal(st.trigger, "user");
    assert.equal(st.hops_planned, 1);
    assert.equal(st.wait_ended_at, null);

    const lines = fs.readFileSync(trace, "utf8").split("\n").filter((l) => /WAIT/.test(l));
    assert.equal(lines.length, 1);
    assert.match(
      lines[0],
      /\] cli\s+WAIT mode=hard requested=30m start=\d\d:\d\d end=\d\d:\d\d hops=1\/5 trigger=user$/
    );
    assert.equal(out.trace_line, lines[0].trimEnd());

    const s = jsonOf(cli(["wait", "status", "demo-run", "--dir", root, "--json"]));
    assert.equal(s.waiting, true);
    assert.equal(s.stale, false);
    assert.equal(s.mode, "hard");
    assert.equal(s.hops_done, 0);
    assert.equal(s.hops_planned, 1);

    // One wait at a time: a second start is refused and writes no second line.
    const again = cli(["wait", "start", "10", "--mode", "safe", "--dir", root, "--json"]);
    assert.equal(again.status, 1);
    assert.equal(jsonOf(again).reason, "already-waiting");
    assert.equal(fs.readFileSync(trace, "utf8").split("\n").filter((l) => /WAIT/.test(l)).length, 1);
  } finally {
    rmrf(root);
  }
});

test("wait start: no run in flight records nothing and still exits 0 (`recorded: false`)", () => {
  const root = tmpdir();
  try {
    const res = cli(["wait", "start", "1", "--mode", "hard", "--dir", root, "--json"]);
    assert.equal(res.status, 0);
    const out = jsonOf(res);
    assert.equal(out.ok, true);
    assert.equal(out.recorded, false);
    assert.equal(out.reason, "no-run");
    assert.deepEqual(out.hops, [1], "the plan is still the answer");
    assert.equal(fs.existsSync(path.join(root, ".claude", "orc", "run")), false, "a wait with no run writes no file");
  } finally {
    rmrf(root);
  }
});

test("wait start: --mode is required, and an unparsable spec exits 1 — nothing written", () => {
  const { root, dir } = runProject();
  try {
    const noMode = cli(["wait", "start", "30", "--run", "demo-run", "--dir", root, "--json"]);
    assert.equal(noMode.status, 1);
    assert.equal(jsonOf(noMode).reason, "no-mode");

    const badMode = cli(["wait", "start", "30", "--mode", "gentle", "--run", "demo-run", "--dir", root, "--json"]);
    assert.equal(badMode.status, 1);

    const bad = cli(["wait", "start", "banana", "--mode", "hard", "--run", "demo-run", "--dir", root, "--json"]);
    assert.equal(bad.status, 1);
    assert.equal(jsonOf(bad).reason, "unparsable");
    assert.match(jsonOf(bad).hint, /until 18:41/);

    // The same exit 2 as `wait plan`: the spec was fine, the reading is absent.
    const reset = cli(["wait", "start", "reset", "--mode", "hard", "--run", "demo-run", "--dir", root, "--json"]);
    assert.equal(reset.status, 2);
    assert.equal(jsonOf(reset).reason, "no-reading");

    assert.equal(fs.existsSync(path.join(dir, "wait.json")), false);
  } finally {
    rmrf(root);
  }
});

test("wait cancel: a started wait accepts the cancel, and status says `cancel_requested`", () => {
  const { root } = runProject();
  try {
    const start = cli(["wait", "start", "2h", "--mode", "soft", "--run", "demo-run", "--dir", root, "--json"]);
    assert.equal(start.status, 0);
    // No trace is open here: the wait is recorded all the same.
    assert.equal(jsonOf(start).recorded, true);
    assert.equal(jsonOf(start).trace_line, null);

    const c = cli(["wait", "cancel", "demo-run", "--dir", root, "--json"]);
    assert.equal(c.status, 0);
    assert.equal(jsonOf(c).cancelled, true);
    const s = jsonOf(cli(["wait", "status", "demo-run", "--dir", root, "--json"]));
    assert.equal(s.waiting, true);
    assert.equal(s.cancel_requested, true);
  } finally {
    rmrf(root);
  }
});

test("wait end: closes the wait, writes `WAIT end`, and a second end exits 1", () => {
  const { root, dir, trace } = tracedProject();
  try {
    cli(["wait", "start", "30", "--mode", "hard", "--trigger", "gate", "--dir", root, "--json"]);
    assert.match(fs.readFileSync(trace, "utf8"), /trigger=gate$/m);

    const noReason = cli(["wait", "end", "demo-run", "--dir", root, "--json"]);
    assert.equal(noReason.status, 1);
    assert.equal(jsonOf(noReason).reason, "no-reason");

    const end = cli(["wait", "end", "demo-run", "--reason", "recovered", "--dir", root, "--json"]);
    assert.equal(end.status, 0);
    assert.equal(jsonOf(end).end_reason, "recovered");
    assert.match(fs.readFileSync(trace, "utf8"), /\] cli\s+WAIT end :: done=0\/1 reason=recovered$/m);

    const st = JSON.parse(fs.readFileSync(path.join(dir, "wait.json"), "utf8"));
    assert.ok(st.wait_ended_at);
    assert.equal(st.end_reason, "recovered");
    assert.equal(jsonOf(cli(["wait", "status", "demo-run", "--dir", root, "--json"])).waiting, false);

    const again = cli(["wait", "end", "demo-run", "--reason", "elapsed", "--dir", root, "--json"]);
    assert.equal(again.status, 1);
    assert.equal(jsonOf(again).reason, "no-wait");

    // With no run in flight there is nothing to end — an answer, exit 1.
    const empty = tmpdir();
    try {
      const none = cli(["wait", "end", "--reason", "elapsed", "--dir", empty, "--json"]);
      assert.equal(none.status, 1);
      assert.equal(jsonOf(none).reason, "no-run");
    } finally {
      rmrf(empty);
    }
  } finally {
    rmrf(root);
  }
});

test("wait status: a wait past its end plus one hop is NOT waiting — it reads `stale`", () => {
  const { root, dir } = runProject();
  try {
    // A session that died mid-wait: started three hours ago, due two hours ago,
    // never closed. One 30-minute hop of grace is long past.
    const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
    fs.writeFileSync(
      path.join(dir, "wait.json"),
      JSON.stringify({
        v: 1,
        slug: "demo-run",
        wait_started_at: ago(180),
        mode: "hard",
        minutes: 60,
        hop_minutes: 30,
        hops: [30, 30],
        hops_planned: 2,
        ends_at: ago(120),
        wait_ended_at: null,
      })
    );
    const s = jsonOf(cli(["wait", "status", "demo-run", "--dir", root, "--json"]));
    assert.equal(s.waiting, false);
    assert.equal(s.stale, true);
    assert.equal(s.hops_done, 2, "the hop count is computed from the clock, and capped at the plan");

    const c = cli(["wait", "cancel", "demo-run", "--dir", root, "--json"]);
    assert.equal(c.status, 1);
    assert.equal(jsonOf(c).reason, "no-wait");

    // A stale wait never blocks the next one.
    const next = cli(["wait", "start", "30", "--mode", "hard", "--run", "demo-run", "--dir", root, "--json"]);
    assert.equal(next.status, 0);
    assert.equal(jsonOf(next).recorded, true);
  } finally {
    rmrf(root);
  }
});
