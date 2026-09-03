"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, tmpdir, freshInstall, runHook } = require("../_helpers");

// `orc usage report` (v1.2.0) — how much has THIS session eaten, and what ate
// it. The design constraint that shapes every assertion below: Claude Code
// records NO token usage for a dispatched subagent, so a per-agent token figure
// cannot be measured. Rows rank by MEASURED WALL TIME and report tokens as
// null — never 0, which would tell a reader the work was free.

const TRACE = "run-quick-rmt-recipient-approval-030926-191813.txt";

function project(opts) {
  const o = opts || {};
  const root = tmpdir();
  const orc = path.join(root, ".claude", "orc");
  const logs = path.join(orc, "logs");
  fs.mkdirSync(logs, { recursive: true });
  if (o.usage) fs.writeFileSync(path.join(orc, "usage.json"), JSON.stringify(o.usage));
  if (o.session) fs.writeFileSync(path.join(orc, "usage-session.json"), JSON.stringify(o.session));
  if (o.trace) {
    fs.writeFileSync(path.join(logs, TRACE), o.trace);
    fs.writeFileSync(path.join(logs, ".current"), TRACE);
  }
  if (o.pending)
    fs.writeFileSync(path.join(logs, TRACE + ".pending.json"), JSON.stringify(o.pending));
  return root;
}

function report(root) {
  const r = cli(["usage", "report", "--dir", root, "--json"]);
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) {}
  return { status: r.status, json, stdout: r.stdout };
}

const fresh = (fh, sd, ctx) => ({
  five_hour: { used_percentage: fh, resets_at: null },
  seven_day: { used_percentage: sd, resets_at: null },
  context_used_percentage: ctx,
  written_at: Date.now(),
});

// Two returns for one agent (12m43s + 9m3s) and one for another (3m19s).
const TRACE_TEXT = [
  "[030926 19:22:26.727] hook     SPAWN orc-executor-opus-5-low :: Build approval flow",
  "[030926 19:39:34.533] hook     RETURN orc-executor-opus-5-low :: Build approval flow dur=12m43s model=claude-opus-5",
  "[030926 19:49:08.852] hook     SPAWN orc-executor-opus-5-low :: Repair findings",
  "[030926 19:54:28.672] hook     RETURN orc-executor-opus-5-low :: Repair findings dur=9m3s",
  "[030926 20:36:23.220] hook     RETURN ~agent :: unattributed",
  "[030926 22:42:41.248] hook     SPAWN orc-executor-sonnet-4-6-med :: Map fields",
  "[030926 22:45:59.966] hook     RETURN orc-executor-sonnet-4-6-med :: Map fields dur=3m19s",
  "",
].join("\n");

test("no reading at all -> unknown, exit 2, and it says a run is never stopped on it", () => {
  const root = project({});
  const { status, json, stdout } = report(root);
  assert.equal(status, 2);
  assert.equal(json.state, "unknown");
  assert.equal(json.five_hour, null);
  assert.equal(json.session, null);
  assert.equal(json.reading_stale, true);
  rmrf(root);
});

test("a stale reading is SHOWN with its age but still reads unknown", () => {
  const u = fresh(40, 20, 30);
  u.written_at = Date.now() - 4 * 60 * 60 * 1000;
  const root = project({ usage: u });
  const { status, json } = report(root);
  assert.equal(status, 2, "a stale reading can never gate");
  assert.equal(json.state, "unknown");
  // ...but the numbers are still carried, with the age, so a panel can show them.
  assert.equal(json.five_hour.used_percentage, 40);
  assert.ok(json.reading_age_minutes >= 230);
  assert.equal(json.reading_stale, true);
  rmrf(root);
});

test("session consumption counts ACROSS a window reset", () => {
  // 10% -> 55% (45 banked), window reset, then 4% -> 12% (8 more) = 53.
  const root = project({
    usage: fresh(12, 38, 20),
    session: {
      session_id: "s1",
      started_at: Date.now() - 90 * 60000,
      five_hour: { baseline: 4, last: 12, accumulated: 45, resets: 1 },
      seven_day: { baseline: 30, last: 38, accumulated: 0, resets: 0 },
    },
  });
  const { json } = report(root);
  assert.equal(json.session.five_hour.consumed_percentage, 53);
  assert.equal(json.session.five_hour.window_resets, 1);
  assert.equal(json.session.still_counting, true);
  // Never overclaim: the window is per account, not per session.
  assert.match(json.session.caveat, /other sessions on the same account share it/);
  rmrf(root);
});

test("top rows rank by measured wall time and mark what is still RUNNING", () => {
  const root = project({
    usage: fresh(30, 20, 40),
    trace: TRACE_TEXT,
    pending: [{ agent: "orc-executor-opus-5-low", desc: "still going", ts: Date.now() - 5 * 60000 }],
  });
  const { json } = report(root);
  assert.equal(json.top[0].agent, "orc-executor-opus-5-low");
  // 12m43s + 9m3s = 1306s, plus ~300s still running.
  assert.ok(json.top[0].wall_seconds >= 1306, "returned dispatches are summed");
  assert.equal(json.top[0].running, 1, "an open dispatch is real spend happening now");
  assert.equal(json.top[1].agent, "orc-executor-sonnet-4-6-med");
  assert.equal(json.top[1].wall_seconds, 199);
  // `RETURN ~agent :: unattributed` is a >=2-in-flight artefact, not a dispatch.
  assert.ok(!json.top.some((t) => t.agent === "agent"));
  assert.equal(json.run.in_flight, 1);
  rmrf(root);
});

test("a Claude agent reports tokens null — never 0 — and the report says why", () => {
  const root = project({ usage: fresh(30, 20, 40), trace: TRACE_TEXT });
  const { json, stdout } = report(root);
  for (const t of json.top) {
    assert.equal(t.tokens, null, "0 would tell the reader the work was free");
    assert.equal(t.tokens_source, "unavailable");
  }
  assert.match(json.tokens_note, /records no token usage for a dispatched subagent/);
  assert.match(json.tokens_note, /MEASURED WALL TIME/);
  rmrf(root);
});

test("no open run keeps the report useful rather than empty", () => {
  const root = project({ usage: fresh(30, 20, 40) });
  const { status, json } = report(root);
  assert.equal(status, 0);
  assert.equal(json.run, null, "absent is absent — never a zeroed run object");
  assert.deepEqual(json.top, []);
  rmrf(root);
});

test("low on either window -> exit 1, and the WORST window decides", () => {
  // 5h is comfortable, the 7-day window is nearly gone.
  const root = project({ usage: fresh(20, 95, 30) });
  const { status, json } = report(root);
  assert.equal(status, 1);
  assert.equal(json.state, "low");
  assert.equal(json.seven_day.low, true);
  assert.equal(json.five_hour.low, false);
  rmrf(root);
});

test("--json is not a summary — the human branch shows nothing the JSON omits", () => {
  const root = project({
    usage: fresh(71, 44, 83),
    session: {
      session_id: "s2",
      started_at: Date.now() - 30 * 60000,
      five_hour: { baseline: 12, last: 71, accumulated: 0, resets: 0 },
      seven_day: { baseline: 40, last: 44, accumulated: 0, resets: 0 },
    },
    trace: TRACE_TEXT,
  });
  const { json } = report(root);
  for (const k of [
    "ok", "state", "five_hour", "seven_day", "context_used_percentage",
    "reading_age_minutes", "reading_stale", "stop_pct", "gate", "session",
    "run", "top", "foreign_spend_rows", "unreadable_spend_lines", "tokens_note",
  ])
    assert.ok(k in json, "--json must carry " + k);

  const human = cli(["usage", "report", "--dir", root]);
  assert.match(human.stdout, /This session has consumed 59% of the 5-hour window and is still counting/);
  assert.match(human.stdout, /Top 5 by measured wall time/);
  assert.match(human.stdout, /wall time, not tokens/);
  rmrf(root);
});

test("the statusline ledger banks consumption and re-baselines a new session", () => {
  const { root, claudeDir } = freshInstall();
  const hit = (sid, fh) =>
    runHook(claudeDir, "orc-statusline.js", {
      session_id: sid,
      workspace: { project_dir: root },
      model: { id: "claude-opus-5", display_name: "Opus 5" },
      effort: { level: "high" },
      context_window: { used_percentage: 20 },
      rate_limits: {
        five_hour: { used_percentage: fh, resets_at: null },
        seven_day: { used_percentage: 30, resets_at: null },
      },
    });
  const led = () =>
    JSON.parse(fs.readFileSync(path.join(claudeDir, "orc", "usage-session.json"), "utf8"));

  hit("a", 10);
  hit("a", 55);
  assert.equal(led().five_hour.baseline, 10);
  assert.equal(led().five_hour.last, 55);
  assert.equal(led().five_hour.accumulated, 0);

  hit("a", 4); // the window reset — not a refund
  assert.equal(led().five_hour.accumulated, 45, "what was spent before the reset is banked");
  assert.equal(led().five_hour.baseline, 4);
  assert.equal(led().five_hour.resets, 1);

  hit("b", 12); // a different session starts its own count
  assert.equal(led().session_id, "b");
  assert.equal(led().five_hour.accumulated, 0);
  assert.equal(led().five_hour.baseline, 12);
  rmrf(root);
});
