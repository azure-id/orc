"use strict";
/* fixtures/knowledge.js — canned data for `orc ui --fixtures`.
   Wiki status, plan, debt, usage, impact, patterns and gotchas — carrying a
   STALE tier, a STRUCTURAL blind spot and a `used 0/20` row on purpose.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const wiki = {
  state: "registered",
  docs: 14,
  tier: "STALE",
  distance: 47,
  anchor: "9f2c41ab8de0",
  last_scan: "2026-05-02",
  reasons: ["worst doc orc-feature-billing.md is 47 commits behind on its own covered files"],
  blind: 2,
  edges: { freshMax: 10, agingMax: 30 },
  crosslink_tags: 6,
};

const wikiPlan = {
  ok: true,
  registered: 14,
  pending: 4,
  deep: 2,
  light: 2,
  usage_window: 20,
  usage_runs_scanned: 20,
  estimate: { tokens: { input: 21000, cache_write: 96000, cache_read: 168000, output: 50000 }, usd: 0.94, weighted: 133800 },
  estimate_unavailable: null,
  freshness: { tier: "FRESH", distance: 6, edges: { freshMax: 10, agingMax: 30 } },
  scan_tier_mode: "ladder",
  free_repairs: [
    { id: "orientation", cost: "free", cmd: "/orc-wiki refresh wiki/orc-orientation.md", what: "regenerate the derived orientation doc (read first by every consumer)" },
  ],
  rows: [
    { doc: "wiki/orc-feature-refunds.md", state: "STRUCTURAL", delta: 0, delta_files: [], gone: ["api/refunds/window.ts"], used: 17, used_of: 20, last_used: "2026-08-10", tier: "deep", agent: "orc-wiki-scanner-opus-4-8-high", tier_rule: "structural", tier_why: "STRUCTURAL — a covered file is gone; a targeted refresh cannot re-anchor blind", new_surface: false, estimate: { p50: { input: 8000, cache_write: 40000, cache_read: 69000, output: 21000 }, p90: { input: 11000, cache_write: 58000, cache_read: 99000, output: 30000 }, samples: 7 }, usd: 0.42, retire_hint: false },
    { doc: "wiki/orc-feature-payments.md", state: "TOUCHED", delta: 6, delta_files: ["src/payments/ledger.ts", "src/payments/idempotency.ts"], gone: [], used: 14, used_of: 20, last_used: "2026-08-09", tier: "deep", agent: "orc-wiki-scanner-opus-4-8-high", tier_rule: "wide-delta", tier_why: "covered files touched >= wiki_tier_deep_files", new_surface: false, estimate: { p50: { input: 7000, cache_write: 36000, cache_read: 62000, output: 19000 }, p90: { input: 10000, cache_write: 51000, cache_read: 88000, output: 27000 }, samples: 7 }, usd: 0.38, retire_hint: false },
    { doc: "wiki/orc-reference-config.md", state: "TOUCHED", delta: 1, delta_files: ["src/config/index.ts"], gone: [], used: 2, used_of: 20, last_used: "2026-07-25", tier: "light", agent: "orc-wiki-scanner-sonnet-5-high", tier_rule: "small-delta", tier_why: "small delta, no new surface", new_surface: false, estimate: { p50: { input: 3000, cache_write: 11000, cache_read: 17000, output: 4000 }, p90: { input: 4000, cache_write: 16000, cache_read: 25000, output: 6000 }, samples: 4 }, usd: 0.06, retire_hint: false },
    // The zero-use retire candidate. It KEEPS ITS SLOT and renders muted with a
    // hint — filtering it out would make "unused" and "does not exist" identical.
    { doc: "wiki/orc-feature-admin-export.md", state: "TOUCHED", delta: 3, delta_files: ["src/admin/export.ts"], gone: [], used: 0, used_of: 20, last_used: null, tier: "light", agent: "orc-wiki-scanner-sonnet-5-high", tier_rule: "small-delta", tier_why: "small delta, no new surface", new_surface: false, estimate: { p50: { input: 3000, cache_write: 9000, cache_read: 20000, output: 6000 }, p90: { input: 4000, cache_write: 13000, cache_read: 29000, output: 9000 }, samples: 4 }, usd: 0.08, retire_hint: true },
  ],
};

const wikiDebt = {
  ok: true,
  project: "shopcart",
  pending: 4,
  deep: 2,
  tokens: { input: 21000, cache_write: 96000, cache_read: 168000, output: 50000 },
  usd: 0.94,
  oldest_commits_behind: 11,
  tier: "FRESH",
  edges: { freshMax: 10, agingMax: 30 },
  docs: [
    { doc: "wiki/orc-feature-refunds.md", state: "STRUCTURAL", tier: "deep", used: 17 },
    { doc: "wiki/orc-feature-payments.md", state: "TOUCHED", tier: "deep", used: 14 },
    { doc: "wiki/orc-reference-config.md", state: "TOUCHED", tier: "light", used: 2 },
    { doc: "wiki/orc-feature-admin-export.md", state: "TOUCHED", tier: "light", used: 0 },
  ],
};

const wikiUsage = {
  ok: true,
  file: PROJECT + "/.claude/orc/wiki-usage.json",
  window_runs: 20,
  runs_scanned: 20,
  rebuilt_at: "10-08-2026 09:41:02",
  registered: 14,
  in_active_use: 8,
  never_used: 2,
  rows: [
    { doc: "wiki/orc-orientation.md", used: 20, of: 20, last_used: "2026-08-10" },
    { doc: "wiki/orc-feature-refunds.md", used: 17, of: 20, last_used: "2026-08-10" },
    { doc: "wiki/orc-feature-payments.md", used: 14, of: 20, last_used: "2026-08-09" },
    { doc: "wiki/orc-reference-http.md", used: 9, of: 20, last_used: "2026-08-06" },
    { doc: "wiki/orc-reference-config.md", used: 2, of: 20, last_used: "2026-07-25" },
    { doc: "wiki/orc-feature-admin-export.md", used: 0, of: 20, last_used: null },
    { doc: "wiki/orc-reference-legacy-cron.md", used: 0, of: 20, last_used: null },
  ],
};

const patterns = {
  lang: null,
  cached: true,
  unknown_language: false,
  patterns_dir: PROJECT + "/.claude/orc/patterns",
  patterns: [
    { lang: "react", path: PROJECT + "/.claude/orc/patterns/react-pattern.md", mtime_ms: Date.now() - 2 * 24 * 60 * 60 * 1000 },
    { lang: "express", path: PROJECT + "/.claude/orc/patterns/express-pattern.md", mtime_ms: Date.now() - 61 * 24 * 60 * 60 * 1000 },
  ],
  known_languages: ["react", "vue", "express", "nestjs", "django", "rails", "spring", "dotnet"],
};

const gotchas = {
  file: PROJECT + "/.claude/orc/gotchas.md",
  count: 3,
  gotchas: [
    { id: "G-001", area: "express", kind: "repair", hits: 7, last_seen: "05-08-2026", trigger: "Jest suite hangs unless the server handle is closed in afterAll", fields: {} },
    { id: "G-002", area: "react", kind: "review", hits: 2, last_seen: "22-07-2026", trigger: "Date pickers must use the tz-aware helper, never new Date(string)", fields: {} },
    { id: "G-003", area: "build", kind: "verify", hits: 0, last_seen: "14-06-2026", trigger: "`npm run build` needs NODE_OPTIONS=--max-old-space-size=4096 on CI", fields: {} },
  ],
};

// STALE, so the Flow panel's gated state is designable.

const wikiImpact = {
  ok: true,
  scan_commit: "9f2c41ab8de0aa17",
  changed_files: 61,
  docs: [
    { file: "wiki/orc-feature-billing.md", state: "TOUCHED", hits: ["src/billing/invoice.ts", "src/billing/tax.ts"], gone: [] },
    { file: "wiki/orc-feature-auth.md", state: "STRUCTURAL", hits: [], gone: ["src/auth/legacy-session.ts"] },
    { file: "wiki/orc-reference-http.md", state: "CLEAN", hits: [], gone: [] },
    { file: "wiki/orc-architecture-overview.md", state: "CLEAN", hits: [], gone: [] },
  ],
  blind_spot: ["src/notifications/dispatcher.ts", "src/notifications/templates.ts"],
  registered: 14,
  touched: 1,
  structural: 1,
  affected_pct: 14,
  threshold: 30,
  freshness: { tier: "STALE", distance: 47, aging_max: 30 },
  recommendation: "FULL",
  reasons: ["STRUCTURAL change (gone anchors / blind spot)", "worst doc 47 commits behind on its own covered files > wiki_aging_max 30"],
};

module.exports = { wiki, wikiPlan, wikiDebt, wikiUsage, patterns, gotchas, wikiImpact };
