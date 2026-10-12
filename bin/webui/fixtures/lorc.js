"use strict";
/* fixtures/lorc.js — canned data for `orc ui --fixtures`, the Light ORC panel.
   Every route answers the `orc lorc … --json` shape from
   lorc-notes/briefs/W5-shared-contract.md: `status` is the detection object,
   every other route is the pass-through wrapper `{ ok, source, data }`, or
   `{ ok: false, state: "NOT-INSTALLED" | "UNREADABLE" }`.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. The panel picks a state with `?fx=<state>` in fixture mode only:
   none · project · global · both (the default) · old · noruns · unreadable.

   Shapes MUST match what the lorc CLI really emits — a drifted fixture is
   worse than no fixture. */

const { PROJECT } = require("./shell.js");

const HOME = "C:/Users/dev";
const PROJ_CLI = PROJECT + "/node_modules/@azure-id/lorc/bin/lorc.js";
const GLOB_CLI = HOME + "/AppData/Roaming/npm/node_modules/@azure-id/lorc/bin/lorc.js";

const projectSide = (version) => ({ path: PROJECT + "/.claude/lorc/version.json", version, cli: PROJ_CLI });
const globalSide = (version) => ({ path: HOME + "/.claude/lorc/version.json", version, cli: GLOB_CLI });

const LORC_STATES = ["none", "project", "global", "both", "old", "noruns", "unreadable"];

const lorcStatus = {
  none: { installed: "none", project: null, global: null, cli: null, cli_ok: false, version: null },
  project: { installed: "project", project: projectSide("0.2.0"), global: null, cli: PROJ_CLI, cli_ok: true, version: "0.2.0" },
  global: { installed: "global", project: null, global: globalSide("0.2.0"), cli: GLOB_CLI, cli_ok: true, version: "0.2.0" },
  both: { installed: "both", project: projectSide("0.2.0"), global: globalSide("0.1.0"), cli: PROJ_CLI, cli_ok: true, version: "0.2.0" },
  old: { installed: "global", project: null, global: globalSide("0.1.0"), cli: GLOB_CLI, cli_ok: true, version: "0.1.0" },
  noruns: { installed: "project", project: projectSide("0.2.0"), global: null, cli: PROJ_CLI, cli_ok: true, version: "0.2.0" },
  // The cli file is there, but it does not answer. Every pass-through is UNREADABLE.
  unreadable: { installed: "project", project: projectSide("0.2.0"), global: null, cli: PROJ_CLI, cli_ok: false, version: null },
};

const wrap = (version, data) => ({ ok: true, source: "lorc " + version, data });
const NOT_INSTALLED = { ok: false, state: "NOT-INSTALLED" };
const UNREADABLE = { ok: false, state: "UNREADABLE", detail: "SyntaxError: Unexpected token 'l', \"lorc 0.2.0\" is not valid JSON" };

const usage = (fh) => ({ state: "ok", five_hour: { used: 18, resets_at_ms: 1791800000000, resets_in_min: 142 }, seven_day: { used: 41, resets_at_ms: 1792200000000 }, context: 27, source: "lorc", age_s: 35, limit_pct: 90, limit_weekly_pct: 98, ...fh });

// runs.jsonl rows, newest first. Every tier and every outcome.
const runRows = [
  { slug: "261011-0912-add-refund-endpoint", request: "Add a refund endpoint to the orders API", started_at: "2026-10-11T09:12:04Z", ended_at: "2026-10-11T09:31:40Z", duration_s: 1176, outcome: "done", tier: "high", executor: "opus-5-low", dispatches: 4, asks: 2, findings: { P0: 0, P1: 1, P2: 2, P3: 1 }, store_mode: "delegate", session_id: "7c1e0d2a", usage_start: { five_hour: 12, seven_day: 39 }, usage_end: { five_hour: 18, seven_day: 41 } },
  { slug: "261010-1640-fix-cart-total-rounding", request: "Fix the cart total rounding", started_at: "2026-10-10T16:40:11Z", ended_at: "2026-10-10T16:48:02Z", duration_s: 471, outcome: "done", tier: "mid", executor: "sonnet-5-med", dispatches: 1, asks: 1, findings: { P0: 0, P1: 0, P2: 1, P3: 0 }, store_mode: "own", session_id: "5b9f3c11", usage_start: { five_hour: 4, seven_day: 37 }, usage_end: { five_hour: 7, seven_day: 38 } },
  { slug: "261010-1102-rename-user-fields", request: "Rename the user fields in the profile form", started_at: "2026-10-10T11:02:55Z", ended_at: "2026-10-10T11:05:20Z", duration_s: 145, outcome: "done", tier: "low", executor: "haiku-5-high", dispatches: 1, asks: 0, findings: { P0: 0, P1: 0, P2: 0, P3: 0 }, store_mode: "own", session_id: "5b9f3c11", usage_start: { five_hour: 2, seven_day: 36 }, usage_end: { five_hour: 3, seven_day: 36 } },
  { slug: "261009-1520-migrate-auth-tokens", request: "Migrate the auth tokens to the new store", started_at: "2026-10-09T15:20:00Z", ended_at: "2026-10-09T15:52:31Z", duration_s: 1951, outcome: "stopped", tier: "high", executor: "opus-5-med", dispatches: 3, asks: 3, findings: { P0: 1, P1: 2, P2: 0, P3: 0 }, store_mode: "delegate", session_id: "0aa41f7e", usage_start: { five_hour: 61, seven_day: 30 }, usage_end: { five_hour: 90, seven_day: 34 } },
  { slug: "261009-0901-update-readme-badges", request: "Update the README badges", started_at: "2026-10-09T09:01:12Z", ended_at: "2026-10-09T09:02:03Z", duration_s: 51, outcome: "failed", tier: "low", executor: "ask", dispatches: 0, asks: 1, findings: { P0: 0, P1: 0, P2: 0, P3: 0 }, store_mode: "own", session_id: null, usage_start: { five_hour: 1, seven_day: 29 }, usage_end: { five_hour: 1, seven_day: 29 } },
];

const runShow = {
  slug: "261011-0912-add-refund-endpoint",
  request: "Add a refund endpoint to the orders API",
  started_at: "2026-10-11T09:12:04Z",
  ended_at: "2026-10-11T09:31:40Z",
  duration_s: 1176,
  outcome: "done",
  tier: "high",
  executor: "opus-5-low",
  session_id: "7c1e0d2a",
  store: { mode: "delegate", dir: PROJECT + "/.claude" },
  settings: { dispatch: "auto", dispatch_max: 5, executor: "ask", review: "auto" },
  counts: { dispatches: 3, checks: 2, asks: 2, findings: { P0: 0, P1: 1, P2: 2, P3: 1 } },
  graph: { ok: true, ms: 412 },
  tasks: [
    { id: "T1", title: "Add the POST /orders/:id/refund route", executor: "opus-5-low", status: "done" },
    { id: "T2", title: "Add the refund service call", executor: "opus-5-low", status: "done" },
    { id: "T3", title: "Write the route tests", executor: "sonnet-5-med", status: "done" },
  ],
  checks: [
    { name: "npm test", ok: true, detail: "212 passed" },
    { name: "npm run lint", ok: false, detail: "1 warning: unused import in refund.service.ts" },
  ],
  usage_start: { five_hour: 12, seven_day: 39 },
  usage_end: { five_hour: 18, seven_day: 41 },
};

const tok = (input, output, cache_read, cache_write) => ({ input, output, cache_read, cache_write, total: input + output + cache_read + cache_write });
const stats = {
  runs: [
    { slug: runRows[0].slug, tier: "high", executor: "opus-5-low", duration_s: 1176, tokens: tok(48210, 21904, 1288400, 96320), cost_usd: 4.8132, models: { "claude-opus-5-5": tok(40100, 18200, 1100000, 80000), "claude-opus-5": tok(8110, 3704, 188400, 16320) } },
    { slug: runRows[1].slug, tier: "mid", executor: "sonnet-5-med", duration_s: 471, tokens: tok(9120, 4410, 301200, 22100), cost_usd: 0.7344, models: { "claude-opus-5-5": tok(4000, 2000, 150000, 10000), "claude-sonnet-5": tok(5120, 2410, 151200, 12100) } },
    { slug: runRows[2].slug, tier: "low", executor: "haiku-5-high", duration_s: 145, tokens: tok(2210, 980, 88100, 6400), cost_usd: 0.1406, models: { "claude-haiku-5-5": tok(2210, 980, 88100, 6400) } },
    { slug: runRows[3].slug, tier: "high", executor: "opus-5-med", duration_s: 1951, tokens: tok(61900, 30220, 1702300, 140800), cost_usd: 7.2209, models: { "claude-opus-5-5": tok(61900, 30220, 1702300, 140800) } },
    // No transcript → no tokens. The CLI says so; the panel shows the note.
    { slug: runRows[4].slug, tier: "low", executor: "ask", duration_s: 51, tokens: null, cost_usd: null, models: {}, note: "no transcript" },
  ],
  totals: { runs: 5, tokens: tok(121440, 57514, 3380000, 265620), cost_usd: 12.9091, no_transcript: 1 },
  pricing_as_of: "2026-10-09",
};

const settings = {
  values: { dispatch: "auto", dispatch_max: 5, limit_pct: 85, limit_weekly_pct: 98, executor: "sonnet-5-med", executors: "core", review: "auto", review_agent_min_lines: 400, pattern_miss: "ask", extra: "auto", habits: "propose", house_rules_warn_kb: 4, statusline_writes_orc: true },
  sources: { dispatch: "default", dispatch_max: "default", limit_pct: "project", limit_weekly_pct: "default", executor: "global", executors: "default", review: "default", review_agent_min_lines: "default", pattern_miss: "default", extra: "default", habits: "project", house_rules_warn_kb: "default", statusline_writes_orc: "default" },
  files: { project: PROJECT + "/.claude/lorc/settings.json", global: HOME + "/.claude/lorc/settings.json" },
};

const habits = {
  mode: "propose",
  proposals: [
    { id: "executor:mid:sonnet-5-med", kind: "executor", strength: 0.53, n: 7, m: 8, text: "Set executor = sonnet-5-med? (you picked it 7 of 8 times at tier mid)", apply: { key: "executor", value: "sonnet-5-med" } },
    { id: "mute:style", kind: "mute", strength: 0.47, n: 6, m: 9, text: "Stop listing style findings at P2/P3? (you rejected 6 of 9)", apply: { key: "review_mute", add: "style" } },
  ],
  stats: {
    asks: 24,
    followed_rate: 0.83,
    executor_by_tier: { low: { "haiku-5-high": 6, ask: 1 }, mid: { "sonnet-5-med": 7, "opus-5-low": 1 }, high: { "opus-5-low": 3, "opus-5-med": 2 } },
    findings_by_cat: { style: { fixed: 1, listed: 2, rejected: 6 }, correctness: { fixed: 5, listed: 1, rejected: 0 }, security: { fixed: 2, listed: 0, rejected: 0 } },
  },
};

const graph = {
  ok: true,
  engine: { engine: "graph@7", schema: 1 },
  orc: { installed: true, scope: "project", version: "2.3.0", cli: PROJECT + "/node_modules/@azure-id/orc/bin/cli.js", delegate: true, reason: "orc 2.3.0 >= 2.2.0" },
  orc_engine: { engine: "graph@7", schema: 1 },
  orc_code_graph: "on",
  mode: "delegate",
  claudeDir: PROJECT + "/.claude",
  reason: "orc 2.3.0 >= 2.2.0 → orc graph store .claude/orc/graph",
  store: { mode: "delegate", dir: PROJECT + "/.claude/orc/graph" },
};

const doctor = {
  ok: false,
  checks: [
    { id: "version", ok: true, detail: "installed 0.2.0, package 0.2.0", fix: "lorc update" },
    { id: "files", ok: true, detail: "all manifest files present", fix: "lorc doctor --fix" },
    { id: "orphans", ok: false, detail: "1 not in manifest: skills/lorc/old-notes.md", fix: "lorc prune" },
    { id: "settings-json", ok: true, detail: "parses" },
    { id: "hooks", ok: true, detail: "2 wired" },
    { id: "statusline", ok: true, detail: "project: lorc" },
  ],
};

const changelogCurrent = { installed: "0.2.0", latest: "0.2.0", newer: [], source: "remote" };
const changelogOld = {
  installed: "0.1.0",
  latest: "0.2.0",
  newer: [{ version: "0.2.0", date: "10-10-2026", lines: ["- Habits: propose an executor per tier", "- The status line also writes the ORC usage file"] }],
  source: "remote",
};

// One pass-through answer per route and state.
function lorcRead(route, state) {
  const st = lorcStatus[state] ? state : "both";
  if (route === "/api/lorc/status") return lorcStatus[st];
  if (st === "none") return NOT_INSTALLED;
  if (st === "unreadable") return UNREADABLE;
  const v = lorcStatus[st].version;
  const empty = st === "noruns";
  switch (route) {
    case "/api/lorc/runs":
      // lorc `run list --json` answers { runs: [...] }, never a bare array.
      return wrap(v, { runs: empty ? [] : runRows });
    case "/api/lorc/run":
      return wrap(v, runShow);
    case "/api/lorc/stats":
      return wrap(v, empty ? { runs: [], totals: { runs: 0, tokens: tok(0, 0, 0, 0), cost_usd: 0, no_transcript: 0 }, pricing_as_of: "2026-10-09" } : stats);
    case "/api/lorc/settings":
      return wrap(v, settings);
    case "/api/lorc/habits":
      return wrap(v, empty ? { mode: "observe", proposals: [], stats: { asks: 0, followed_rate: null, executor_by_tier: {}, findings_by_cat: {} } } : habits);
    case "/api/lorc/usage":
      return wrap(v, usage(st === "old" ? { state: "limit", five_hour: { used: 91, resets_at_ms: 1791800000000, resets_in_min: 12 } } : {}));
    case "/api/lorc/graph":
      return wrap(v, graph);
    case "/api/lorc/doctor":
      return wrap(v, doctor);
    case "/api/lorc/version":
      return wrap(v, { name: "@azure-id/lorc", version: v });
    case "/api/lorc/changelog":
      return wrap(v, st === "old" ? changelogOld : changelogCurrent);
    default:
      return undefined;
  }
}

// Writes. A bad settings value answers exit 2 with the CLI's own line.
function lorcWrite(route, body) {
  const b = body || {};
  if (route === "/api/lorc/settings/set") {
    const key = String(b.key || "");
    const value = String(b.value === undefined ? "" : b.value);
    if (key === "limit_pct" && !/^\d+$/.test(value)) return { exit_code: 2, output: `bad value for limit_pct: ${JSON.stringify(value)} (allowed: 50..99)` };
    if (key === "limit_pct" && (Number(value) < 50 || Number(value) > 99)) return { exit_code: 2, output: `bad value for limit_pct: ${JSON.stringify(value)} (allowed: 50..99)` };
    return { exit_code: 0, output: `${key} = ${value} (${b.global ? "global" : "project"})` };
  }
  if (route === "/api/lorc/habits/accept") return { exit_code: 0, output: `accepted ${b.id}` };
  if (route === "/api/lorc/habits/decline") return { exit_code: 0, output: `declined ${b.id}` };
  return undefined;
}

module.exports = { LORC_STATES, lorcStatus, lorcRead, lorcWrite, lorcRunRows: runRows, lorcRunShow: runShow, lorcStats: stats, lorcSettings: settings, lorcHabits: habits, lorcChangelogOld: changelogOld };
