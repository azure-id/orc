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
  // v0.49.1 — `--json is not a summary`. Everything below was ALREADY printed by
  // the terminal branch and thrown away by `--json`, which is why the panel
  // could not be as detailed as the terminal no matter how it was written.
  counts: { FRESH: 6, AGING: 5, STALE: 2, unknown: 1 },
  // The doc actually pinning the tier, BY NAME. A hash is not a thing anybody
  // can go and refresh.
  worst: { file: "wiki/orc-feature-billing.md", distance: 47, anchor: "9f2c41ab8de0" },
  per_doc: [
    { file: "wiki/orc-orientation.md", title: "Orientation", tier: "FRESH", distance: 2, anchor: "aa11bb22", scanned_commit: "aa11bb22", doc_type: "reference", covers: ["README.md"], covered_files: 1, crosslink_tags: 0, used: 20, used_of: 20, last_used: "2026-08-10", retire_hint: false },
    { file: "wiki/orc-feature-billing.md", title: "Billing", tier: "STALE", distance: 47, anchor: "9f2c41ab", scanned_commit: "9f2c41ab", doc_type: "feature", covers: ["src/billing/"], covered_files: 23, crosslink_tags: 4, used: 12, used_of: 20, last_used: "2026-08-09", retire_hint: false },
    { file: "wiki/orc-feature-auth.md", title: "Auth", tier: "AGING", distance: 22, anchor: "3c4d5e6f", scanned_commit: "3c4d5e6f", doc_type: "feature", covers: ["src/auth/"], covered_files: 11, crosslink_tags: 2, used: 6, used_of: 20, last_used: "2026-08-01", retire_hint: false },
    // Zero-use KEEPS ITS SLOT with a retire hint, and it is never retired for
    // you. `used: null` on the next row is NOT zero-use — unknown must never be
    // reported as dead.
    { file: "wiki/orc-feature-admin-export.md", title: "Admin export", tier: "AGING", distance: 18, anchor: "7a8b9c0d", scanned_commit: "7a8b9c0d", doc_type: "feature", covers: ["src/admin/"], covered_files: 4, crosslink_tags: 0, used: 0, used_of: 20, last_used: null, retire_hint: true },
    { file: "wiki/orc-reference-http.md", title: "HTTP surface", tier: "unknown", distance: null, anchor: null, scanned_commit: null, doc_type: "reference", covers: [], covered_files: 0, crosslink_tags: 0, used: null, used_of: null, last_used: null, retire_hint: false },
  ],
  // THE FILES, not the number `2`. A count tells a user nothing they can act on.
  blind_spot: ["src/notifications/dispatcher.ts", "src/notifications/templates.ts"],
  orientation: { present: true, file: "wiki/orc-orientation.md", scanned_commit: "aa11bb22" },
  crosslink: { provided: 6, boundary_rows: 9, state: "PUBLISHED" },
  free_repairs: [
    { id: "crosslink", cost: "free", cmd: "/orc-wiki crosslink", what: "publish boundary tags from already-anchored doc rows" },
  ],
};

/* `orc wiki docs --json`. The order is the CLI's — THE PANEL NEVER INVENTS A
   RANK. Every ugly state is here on purpose: a STALE doc, an unmeasurable one,
   a zero-use retire candidate, and a doc with no crosslink tags. */
const wikiDocs = {
  ok: true,
  state: "registered",
  tier: "STALE",
  edges: { freshMax: 10, agingMax: 30 },
  docs: wiki.per_doc,
  counts: wiki.counts,
  worst: wiki.worst,
  free_repairs: wiki.free_repairs,
};

/* One doc, with and without its body. `--body` is opt-in: prose is returned only
   on an explicit request, exactly one artifact at a time. */
const wikiShow = {
  ok: true,
  doc: "wiki/orc-feature-billing.md",
  path: PROJECT + "/wiki/orc-feature-billing.md",
  ...wiki.per_doc[1],
  tags: [
    { tag: "http:POST /v1/invoices", kind: "http", anchor: "src/billing/invoice.ts:88" },
    { tag: "events:invoice.settled", kind: "events", anchor: "src/billing/emit.ts:14" },
  ],
  free_repairs: [],
  body: "---\nwiki_schema: 2\ndoc_type: feature\n---\n\n# Billing\n\n## TL;DR\n\n- Invoices are created, taxed, then settled by the worker.\n\n## Contracts & shapes\n\n| Surface | Shape |\n|---|---|\n| `POST /v1/invoices` | `{ merchant_id, lines[] }` |\n",
};

/* `orc wiki coverage --json`. A REPORT and never a gate: no threshold, no config
   key, nothing branches on it. The uncovered set is collapsed to DIRECTORIES and
   ranked by file count, because "240 files, all in vendor/" and "12 files, all
   in src/payments/" are opposite situations. */
const wikiCoverage = {
  ok: true,
  tracked: 412,
  covered: 251,
  uncovered: 161,
  coverage_pct: 61,
  docs: 14,
  uncovered_dirs: [
    { dir: "vendor/stripe-sdk", files: 118, newest_commit: "a1b2c3d 2026-02-11", sample: ["vendor/stripe-sdk/index.js"] },
    { dir: "src/notifications", files: 22, newest_commit: "9f2c41a 2026-08-08", sample: ["src/notifications/dispatcher.ts", "src/notifications/templates.ts"] },
    { dir: "scripts", files: 13, newest_commit: "77aa11b 2026-06-30", sample: ["scripts/seed.js"] },
    { dir: "src/admin/legacy", files: 8, newest_commit: "0c0c0c0 2025-11-04", sample: ["src/admin/legacy/report.ts"] },
  ],
  honesty: "coverage is a report, not a target — there is no threshold and nothing branches on it",
};

/* A FULLY-COVERED repo, so 100% is designable too — and a wiki that is not
   registered at all, which is the state `orc doctor` now warns about. */
const wikiCoverageFull = { ...wikiCoverage, covered: 412, uncovered: 0, coverage_pct: 100, uncovered_dirs: [] };
const wikiUnregistered = { state: "unregistered", docs: 9, tier: null, distance: null, anchor: null, last_scan: null, reasons: [], blind: 0, edges: { freshMax: 10, agingMax: 30 } };

/* `orc pattern show --json`. TWO of them: one with a real header, and one with
   NO header at all — which says so in one line and NEVER derives a date from the
   file's mtime. */
const patternShow = {
  react: {
    ok: true,
    lang: "react",
    path: PROJECT + "/.claude/orc/patterns/react-pattern.md",
    headered: true,
    codified_at: "09-08-2026",
    source_commit: "9f2c41ab8de0",
    playbook: "react",
    headings: ["Component shape", "State", "Data fetching", "Testing", "CONVENTIONS the project already keeps", "INVARIANTS that are kept regardless"],
    conventions: 14,
    invariants: 6,
    conflicts: [
      "CONFLICT — the project puts hooks in the component file; the playbook wants them in hooks/. Project wins.",
      "CONFLICT — the project disables the exhaustive-deps lint rule; the invariant keeps it, because a stale closure is a correctness bug.",
    ],
    bytes: 9140,
    lines: 212,
    mtime_ms: Date.now() - 2 * 24 * 60 * 60 * 1000,
    body: "# React — project pattern\n\n## Component shape\n\nFunction components, named export, props typed inline.\n",
  },
  express: {
    ok: true,
    lang: "express",
    path: PROJECT + "/.claude/orc/patterns/express-pattern.md",
    headered: false,
    codified_at: null,
    source_commit: null,
    playbook: null,
    headings: ["Routing", "Error handling", "Testing"],
    conventions: 8,
    invariants: 4,
    conflicts: [],
    bytes: 4210,
    lines: 96,
    mtime_ms: Date.now() - 61 * 24 * 60 * 60 * 1000,
    header_note: "this pattern file carries no parseable header — reported as it is on disk; a codified-at date is never derived from the file's mtime",
    body: "# Express — project pattern\n\n## Routing\n\nOne router per resource.\n",
  },
};

/* The archive, and the prune PREVIEW. A COUNT IS NOT CONSENT, so the preview
   NAMES every entry it would move. */
const gotchasArchived = {
  ok: true,
  file: PROJECT + "/.claude/orc/gotchas-archive.md",
  archived: true,
  count: 2,
  gotchas: [
    { id: "G-000", area: "build", kind: "repair", hits: 1, last_seen: "02-01-2026", trigger: "the old webpack config needed a polyfill for crypto", fields: {} },
    { id: "G-004", area: "react", kind: "drift", hits: 0, last_seen: "11-03-2026", trigger: "class components had to be wrapped for the router", fields: {} },
  ],
};

const gotchaPrunePreview = {
  ok: true,
  dry_run: true,
  file: PROJECT + "/.claude/orc/gotchas.md",
  count: 3,
  gotchas_max: 2,
  would_archive: [
    { id: "G-003", area: "build", kind: "verify", hits: 0, last_seen: "14-06-2026", trigger: "`npm run build` needs NODE_OPTIONS=--max-old-space-size=4096 on CI", why: "rank 1 of the low-value tail — 0 hit(s), last seen 14-06-2026" },
  ],
  archive: PROJECT + "/.claude/orc/gotchas-archive.md",
  honesty: "eviction is an ARCHIVE, never a delete — a gotcha that stopped being true is yours to remove",
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
  // v0.49.1: the cap is what makes the count mean anything, and only `prune`
  // used to print it — so "11 of 40" was not renderable from this payload.
  gotchas_max: 40,
  archive: PROJECT + "/.claude/orc/gotchas-archive.md",
  // `fields` was ALWAYS emitted and the panel rendered six columns and threw the
  // rest away. Symptom, fix and why are the half a person actually needs.
  gotchas: [
    { id: "G-001", area: "express", kind: "repair", hits: 7, last_seen: "05-08-2026", trigger: "Jest suite hangs unless the server handle is closed in afterAll", fields: { trigger: "Jest suite hangs unless the server handle is closed in afterAll", symptom: "`npm test` never exits; CI times out at 10 minutes", fix: "close the http server in afterAll and await it", why: "supertest keeps the listener open, and Jest waits for the handle", first_seen: "14-05-2026", hits: "7", last_seen: "05-08-2026" } },
    { id: "G-002", area: "react", kind: "review", hits: 2, last_seen: "22-07-2026", trigger: "Date pickers must use the tz-aware helper, never new Date(string)", fields: { trigger: "Date pickers must use the tz-aware helper, never new Date(string)", symptom: "bookings land one day early for users west of UTC", fix: "use parseInZone from src/time/zone.ts", why: "new Date(string) parses as UTC and then renders local", first_seen: "02-06-2026", hits: "2", last_seen: "22-07-2026" } },
    { id: "G-003", area: "build", kind: "verify", hits: 0, last_seen: "14-06-2026", trigger: "`npm run build` needs NODE_OPTIONS=--max-old-space-size=4096 on CI", fields: { trigger: "`npm run build` needs NODE_OPTIONS=--max-old-space-size=4096 on CI", symptom: "the CI build is OOM-killed with no error line", fix: "set NODE_OPTIONS in the workflow, not in package.json", why: "the runner has less memory than a dev laptop", first_seen: "14-06-2026", hits: "0", last_seen: "14-06-2026" } },
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

module.exports = { wiki, wikiDocs, wikiShow, wikiCoverage, wikiCoverageFull, wikiUnregistered, wikiPlan, wikiDebt, wikiUsage, patterns, patternShow, gotchas, gotchasArchived, gotchaPrunePreview, wikiImpact };
