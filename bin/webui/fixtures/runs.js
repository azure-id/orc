"use strict";
/* fixtures/runs.js — canned data for `orc ui --fixtures`.
   A run list with a `waiting` card, run detail, and aftermath grades including
   TOO_RECENT (which keeps its slot — it is an answer, not a gap).

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const runs = {
  run_dir: PROJECT + "/.claude/orc/run",
  total: 5,
  shown: 5,
  runs: [
    { slug: "merchant-notifications", status: "waiting", lane: "/orc", phase: "execution", wave: "wave 2 of 4", updated_ms: Date.now() - 40 * 60 * 1000 },
    { slug: "refund-webhook-retry", status: "waiting", lane: "/orc-mini", phase: "review", wave: "", updated_ms: Date.now() - 26 * 60 * 60 * 1000 },
    { slug: "settings-page-a11y", status: "done", lane: "/orc-quick", phase: "", wave: "", updated_ms: Date.now() - 3 * 60 * 60 * 1000 },
    { slug: "invoice-pdf-export", status: "done", lane: "/orc-ultra", phase: "", wave: "", updated_ms: Date.now() - 5 * 24 * 60 * 60 * 1000 },
    { slug: "abandoned-spike", status: "empty", lane: "", phase: "", wave: "", updated_ms: Date.now() - 11 * 24 * 60 * 60 * 1000 },
  ],
};

const runDetail = {
  slug: "merchant-notifications",
  dir: PROJECT + "/.claude/orc/run/merchant-notifications",
  status: "waiting",
  updated_ms: Date.now() - 40 * 60 * 1000,
  stands: { lane: "/orc", phase: "execution", wave: "wave 2 of 4" },
  resume:
    "# RESUME — merchant-notifications\n\n" +
    "Where it stands:  /orc · phase execution · wave 2 of 4\n\n" +
    "Paste this into a fresh Claude Code session to pick the run back up:\n\n" +
    "> Resume the ORC run `merchant-notifications`. Read\n" +
    "> `.claude/orc/run/merchant-notifications/checkpoint.json` and continue from wave 3.\n",
  state_of_play:
    "# State of play\n\n" +
    "Waves 1-2 done (6 tasks). Wave 3 holds the notification templates and is\n" +
    "blocked on the frozen copy deck. Smoke gate GREEN at the wave-2 boundary.\n",
  checkpoint: { phase: "execution", wave: 2, updated_at: "2026-08-08T10:14:02Z", trace_path: ".claude/orc/logs/run-orc-merchant-notifications-080826-094501.txt" },
  files: ["RESUME.md", "checkpoint.json", "state-of-play.md"],
};

const aftermath = {
  ok: true,
  window_days: 30,
  log_dir: PROJECT + "/.claude/orc/logs",
  counts: { HELD: 1, CHURN: 1, REVERTED: 1, TOO_RECENT: 1 },
  runs: [
    {
      slug: "store-credit",
      lane: "orc",
      age_days: 18,
      commits: 3,
      files: 9,
      grade: "CHURN",
      strength: 2,
      signals: [
        { kind: "churn", strength: 2, detail: "3 shipped files rewritten within 30 days", files: ["src/payments/ledger.ts", "src/payments/credit.ts", "src/api/refunds.ts"] },
        { kind: "promise-broken", strength: 3, detail: "1 promise anchored in this change is BROKEN", ids: ["PACT-014"] },
      ],
      note: "signals, not a verdict: why a file changed again is not knowable from git.",
    },
    { slug: "admin-export", lane: "orc", age_days: 24, commits: 2, files: 4, grade: "HELD", strength: 0, signals: [], note: "no churn signal in the window. That is not proof it worked — only that nothing came back." },
    { slug: "webhook-retry", lane: "mini", age_days: 12, commits: 1, files: 2, grade: "REVERTED", strength: 3, signals: [{ kind: "revert", strength: 3, detail: 'a1b2c3d Revert "webhook retry backoff"' }], note: "signals, not a verdict: why a file changed again is not knowable from git." },
    { slug: "copy-tweak", lane: "mini", age_days: 2, grade: "TOO_RECENT", strength: 0, signals: [], note: "younger than 7 days — too recent to grade. That is an answer, not a gap." },
  ],
};

module.exports = { runs, runDetail, aftermath };
