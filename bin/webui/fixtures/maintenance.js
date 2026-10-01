"use strict";
/* fixtures/maintenance.js — canned data for `orc ui --fixtures`.
   The export state and the mocked-example listing.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const exportState = {
  ok: false,
  out: PROJECT + "/AGENTS.md",
  exists: true,
  source_commit: "c273793aa1b4",
  sources: 17,
  drifted: ["PACT.md", "wiki/orc-feature-payments.md", ".claude/orc/patterns/ts-pattern.md"],
  removed: [],
  stale: true,
};

/* ============================================================ v0.47.0 ====== */
/* /orc-challenge. ONE OF EVERY STATE, including the ugly ones — you cannot
   design a TAMPERED chip on a healthy cycle, a MISSING-REVISION candidate list
   on a cycle whose revision is right where it should be, or a `NOT-CHECKED`
   dimension chip on a cycle that has a template. test/webui.test.js asserts one
   fixture per state, so a new state cannot ship without one. */

const mocks = {
  root: PROJECT + "/mock-examples",
  total: 2,
  mocks: [
    { slug: "merchant-notifications", dir: PROJECT + "/mock-examples/merchant-notifications", mtime_ms: Date.now() - 40 * 60 * 1000, has_readme: true },
    { slug: "invoice-pdf-export", dir: PROJECT + "/mock-examples/invoice-pdf-export", mtime_ms: Date.now() - 5 * 24 * 60 * 60 * 1000, has_readme: false },
  ],
};

/* ============================================================ v2.1.0 W7 ==== */
/* `orc clear logs`. The summary is `--summary --json` (no scan); the preview
   is the print mode's `--json`. ONE OF EVERY STATE the renderer draws: a trace
   set, a leftover, a closed run with its git ref, a done run whose ref is
   already gone, every keep reason, the moved cutoff, and the old default
   folder. `ORC_UI_FIXTURE_CLEAR=empty` gives the nothing-to-delete preview. */

const clearLogsSummary = {
  ok: true,
  older_than_days: 30,
  auto: "on",
  last_sweep: { date: "2026-10-02", at: Date.now() - 3 * 60 * 60 * 1000, files: 41, bytes: 309112, older_than_days: 60 },
  last_apply: null,
  pruned_runs: 17,
  rollup: ".claude/orc/logs-rollup.json",
};

const L = ".claude/orc/traces/";
const R = ".claude/orc/run/";
const clearLogsPreview = {
  ok: true,
  applied: false,
  older_than_days: 30,
  effective_days: 60,
  cutoff: "2026-08-03",
  cutoff_moved: { from: 30, to: 60, reason: "aftermath_window_days" },
  log_dir: ".claude/orc/traces",
  run_dir: ".claude/orc/run",
  delete: [
    {
      path: L + "run-mini-order-store-extract-150626-192929.txt",
      kind: "trace",
      last_activity: "2026-06-15T20:04:11",
      dated_by: "line stamp",
      bytes: 9214,
      files: [L + "run-mini-order-store-extract-150626-192929.txt", L + "run-mini-order-store-extract-150626-192929.txt.jsonl", L + "run-mini-order-store-extract-150626-192929.txt.pending.json"],
    },
    { path: L + "run-300626-005724.txt.superseded", kind: "leftover", last_activity: "2026-06-30T00:57:24", dated_by: "name stamp", bytes: 5830, files: [L + "run-300626-005724.txt.superseded"] },
    {
      path: R + "orders-cancel-endpoint/",
      kind: "run",
      status: "closed",
      ref: "refs/orc/runs/orders-cancel-endpoint/pre",
      last_activity: "2026-07-02T11:40:00",
      dated_by: "mtime",
      bytes: 22410,
      files: [R + "orders-cancel-endpoint/RESUME.closed.md", R + "orders-cancel-endpoint/closed.json", R + "orders-cancel-endpoint/checkpoint.json", R + "orders-cancel-endpoint/snapshot.json"],
    },
    { path: R + "health-endpoint/", kind: "run", status: "done", ref: null, last_activity: "2026-06-20T09:12:45", dated_by: "mtime", bytes: 4096, files: [R + "health-endpoint/checkpoint.json"] },
  ],
  keep: [
    { path: L + ".current", reason: "the active-run pointer — never touched" },
    { path: L + "run-orc-orders-users-get-by-id-auth-011026-091500.txt", reason: "the active run — `.current` names it" },
    { path: L + "run-quick-version-route-020926-101500.txt", reason: "holds habit answers (younger than 180 days)" },
    { path: L + "run-fast-health-endpoint-210926-143000.txt", reason: "younger than 60 days (last activity 2026-09-21T14:41:09)" },
    { path: L + "run-verify-cancel-endpoint-tree-021026-071000.txt", reason: "changed less than 6 hours ago — a run may still write to it" },
    { path: L + "retro/", reason: "retro/ holds /orc-retro reports (deliverables) — never touched" },
    { path: L + "habits-state.json", reason: "user data — never deleted" },
    { path: R + "add-version-route/", reason: "a waiting run (RESUME.md, no RESUME.closed.md) — never touched" },
    { path: R + "orders-search-endpoint/", reason: "a wait is armed (wait.json) — never touched" },
  ],
  totals: { units: 4, files: 9, bytes: 41550 },
  default_dir: { path: ".claude/orc/logs", files: 132, bytes: 784384, included: false },
  notes: [
    "The cutoff moved from 30 to 60 days: aftermath_window_days is 60, and /orc-aftermath grades that window.",
    "The old default folder .claude/orc/logs still holds 132 file(s) (766.0 KB). No reader sees it. Add --include-default-dir to clear it with the same rules.",
  ],
};

const clearLogsPreviewEmpty = Object.assign({}, clearLogsPreview, {
  older_than_days: 90,
  effective_days: 90,
  cutoff: "2026-07-04",
  cutoff_moved: null,
  delete: [],
  keep: clearLogsPreview.keep.slice(0, 4),
  totals: { units: 0, files: 0, bytes: 0 },
  default_dir: null,
  notes: [],
});

module.exports = { exportState, mocks, clearLogsSummary, clearLogsPreview, clearLogsPreviewEmpty };
