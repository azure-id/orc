"use strict";
/* fixtures/stats.js — canned data for `orc ui --fixtures`.
   Usage, the cost forecast and the dated rate table. The forecast is a RANGE
   with a sample count, and cache-read is its own segment.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const stats = {
  log_dir: PROJECT + "/.claude/orc/logs",
  runs: 61,
  from: "2026-04-11",
  to: "2026-08-08",
  lanes: { orc: 22, quick: 17, mini: 9, wiki: 6, fast: 4, ultra: 2, grill: 1 },
  agents: { "orc-executor": 88, "orc-system-analyst": 21, "orc-planner": 21, "orc-reviewer": 18, "orc-verifier": 18, "orc-scout": 12, "orc-wiki-scanner": 9, "orc-trace-writer": 61 },
  dispatches: 248,
  downgrades: 3,
  unfinished: 2,
  unknown_lane: 1,
};

/* ============================================================ v0.46.0 ====== */
/* Same rule as everything above: ONE OF EVERY STATE, including the ugly ones.
   You cannot design a BROKEN promise card on a ledger where everything holds,
   a REFUSE checklist on a repo with no refusals, or an empty-debt Knowledge
   panel on a wiki that owes four docs. test/webui.test.js asserts the count per
   state, so a new state cannot ship without a fixture. */

const budgetForecast = {
  ok: true,
  plan: PROJECT + "/.claude/orc/run/store-credit/plan.md",
  tasks: 14,
  waves: 5,
  tokens: {
    p50: { input: 53400, cache_write: 362800, cache_read: 733800, output: 75100 },
    p90: { input: 81000, cache_write: 548000, cache_read: 1140000, output: 118000 },
  },
  raw: { p50: 1225100, p90: 1887000 },
  weighted: { p50: 564680, p90: 861000 },
  usd: { p50: 6.76, p90: 10.5 },
  price_table: { as_of: "2026-08-01", age_days: 9, stale: false, path: "bin/pricing.json" },
  quota: { available: true, plan: "max20", label: "Max 20x", window_pct: 18.2, weekly_pct: 4.1 },
  // A task at CONTEXT RISK — the state that cannot be designed on a small plan.
  context_risk: [{ task: "T12", agent: "orc-executor-opus-5-high", peak: 189000, window: 200000, pct: 95 }],
  bands: [
    { band: "[0,30)", agent: "orc-executor-haiku-4-5", count: 2, tasks: ["T01", "T02"], samples: 9, p50: { input: 1200, cache_write: 6400, cache_read: 11800, output: 900 }, p90: { input: 1800, cache_write: 9200, cache_read: 17000, output: 1400 } },
    { band: "[40,55)", agent: "orc-executor-sonnet-4-6-high", count: 3, tasks: ["T03", "T05", "T07"], samples: 12, p50: { input: 7800, cache_write: 52100, cache_read: 104000, output: 8400 }, p90: { input: 11000, cache_write: 75000, cache_read: 150000, output: 12000 } },
    { band: "[70,80)", agent: "orc-executor-opus-4-7-high", count: 1, tasks: ["T04"], samples: 6, p50: { input: 5700, cache_write: 40200, cache_read: 81000, output: 9300 }, p90: { input: 8100, cache_write: 58000, cache_read: 117000, output: 13400 } },
    // A band with insufficient history — the low-confidence warning is not
    // optional chrome, so the fixture has to be able to trigger it.
    { band: "[90,100]", agent: "orc-executor-opus-5-high", count: 1, tasks: ["T12"], samples: 2, p50: { input: 9100, cache_write: 61000, cache_read: 128000, output: 17000 }, p90: { input: 14000, cache_write: 94000, cache_read: 198000, output: 26000 } },
  ],
  fixed_roles: [
    { role: "orc-system-analyst-opus-5-high", samples: 11, p50: { input: 6100, cache_write: 41000, cache_read: 82000, output: 9000 }, p90: { input: 8600, cache_write: 58000, cache_read: 116000, output: 13000 } },
    { role: "orc-planner-opus-5-med", samples: 11, p50: { input: 5000, cache_write: 33000, cache_read: 68000, output: 7400 }, p90: { input: 7100, cache_write: 47000, cache_read: 96000, output: 10500 } },
    { role: "orc-trace-writer-haiku-4-5", samples: 41, p50: { input: 900, cache_write: 3000, cache_read: 5400, output: 700 }, p90: { input: 1300, cache_write: 4400, cache_read: 7800, output: 1000 } },
  ],
  low_confidence_bands: 1,
  min_samples: 5,
  // Non-zero on purpose: `unattributed` is shown whenever it is above 0, and a
  // fixture where it is always 0 makes that branch undesignable.
  unattributed: { blocks: 12, tokens: { input: 900, cache_write: 12000, cache_read: 24000, output: 1100 } },
  transcripts_readable: true,
  lanes: [
    { lane: "ultra", cmd: "/orc-ultra", raw: 2410000, weighted: 1090000, usd: 14.2, low_confidence_bands: 1, low_confidence_roles: 0 },
    { lane: "orc", cmd: "/orc", raw: 1225100, weighted: 564680, usd: 6.76, low_confidence_bands: 1, low_confidence_roles: 0 },
    { lane: "mini", cmd: "/orc-mini", raw: 410000, weighted: 188000, usd: 2.1, low_confidence_bands: 0, low_confidence_roles: 0 },
    { lane: "fast", cmd: "/orc-fast", raw: 0, weighted: 0, usd: null, low_confidence_bands: 1, low_confidence_roles: 1 },
  ],
  view: "auto",
};

const budgetRates = {
  ok: true,
  version: 1,
  calibrated_at: "10-08-2026 09:40:11",
  transcript_dir: "/home/you/.claude/projects/-example-project",
  transcripts_readable: true,
  transcript_files: 31,
  traces_read: 42,
  dispatches_joined: 96,
  price_table_as_of: "2026-08-01",
  bands: {
    "[0,30)": { samples: 9, p50: { input: 1200, cache_write: 6400, cache_read: 11800, output: 900 }, p90: { input: 1800, cache_write: 9200, cache_read: 17000, output: 1400 }, peak_p50: 24000, peak_p90: 38000 },
    "[40,55)": { samples: 12, p50: { input: 7800, cache_write: 52100, cache_read: 104000, output: 8400 }, p90: { input: 11000, cache_write: 75000, cache_read: 150000, output: 12000 }, peak_p50: 78000, peak_p90: 121000 },
    "[70,80)": { samples: 6, p50: { input: 5700, cache_write: 40200, cache_read: 81000, output: 9300 }, p90: { input: 8100, cache_write: 58000, cache_read: 117000, output: 13400 }, peak_p50: 96000, peak_p90: 142000 },
    "[90,100]": { samples: 2, p50: { input: 9100, cache_write: 61000, cache_read: 128000, output: 17000 }, p90: { input: 14000, cache_write: 94000, cache_read: 198000, output: 26000 }, peak_p50: 151000, peak_p90: 189000 },
  },
  roles: {
    "orc-system-analyst-opus-5-high": { samples: 11, p50: { input: 6100, cache_write: 41000, cache_read: 82000, output: 9000 }, p90: { input: 8600, cache_write: 58000, cache_read: 116000, output: 13000 }, peak_p50: 88000, peak_p90: 131000 },
    "orc-trace-writer-haiku-4-5": { samples: 41, p50: { input: 900, cache_write: 3000, cache_read: 5400, output: 700 }, p90: { input: 1300, cache_write: 4400, cache_read: 7800, output: 1000 }, peak_p50: 9000, peak_p90: 14000 },
  },
  lanes: {},
  unattributed: { blocks: 12, tokens: { input: 900, cache_write: 12000, cache_read: 24000, output: 1100 } },
};

module.exports = { stats, budgetForecast, budgetRates };
