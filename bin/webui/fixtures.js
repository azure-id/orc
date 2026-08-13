"use strict";
/**
 * fixtures.js — canned API responses for `orc ui --fixtures`.
 *
 * This exists because you cannot DESIGN a state you cannot reach. On a healthy
 * install with a fresh wiki and no paused runs, the STALE chip, the `waiting`
 * run card, the shadowed-setting lock and the unhealthy doctor panel are
 * unreachable — so they get built once, blind, and never looked at again.
 *
 * The rule for this file: carry ONE OF EVERY STATE, including the ugly ones.
 * It also means the UI can be worked on with no ORC project at all.
 *
 * Shapes MUST match what `bin/cli.js --json` really emits. A fixture that has
 * drifted from the CLI is worse than no fixture, so test/webui.test.js asserts
 * the fixture key set against the live CLI output for the shared routes.
 */

const PROJECT = "/example/project";

const config = {
  config_path: PROJECT + "/.claude/orc.config.yaml",
  exists: true,
  keys: [
    { key: "max_wave_tasks", tier: "common", value: 4, default: 3, is_overridden: true, is_shadowed: false, shadow_reason: null, desc: "Max parallel tasks per execution wave (higher = more parallelism, more collision risk).", options: [2, 3, 4, 5], control: { kind: "int", choices: null, min: 1, max: null } },
    { key: "batch_pause_every", tier: "common", value: 2, default: 2, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Waves between stop-and-continue pauses (1 = pause every wave).", options: [1, 2, 3, 4, 5], control: { kind: "int", choices: null, min: 1, max: null } },
    { key: "rubric_bands", tier: "common", value: 5, default: 5, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Scoring granularity (2-5 narrow preset, 6-8 wide preset).", options: [2, 3, 4, 5, 6, 7, 8], control: { kind: "range", choices: null, min: 2, max: 8 } },
    { key: "pattern_findings", tier: "common", value: "on", default: "ask", is_overridden: true, is_shadowed: false, shadow_reason: null, desc: "Code-pattern gate on an FE/BE cache miss.", options: ["ask", "on", "off"], control: { kind: "enum", choices: ["ask", "on", "off"], min: null, max: null } },
    { key: "generate_tests", tier: "common", value: false, default: false, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Opt-in Phase 6.5: author test cases before ship.", options: ["true", "false"], control: { kind: "enum", choices: ["true", "false"], min: null, max: null } },
    // ON, so the whole fable5_* block below renders shadowed — the animation
    // §6.2 calls the single best argument for the project.
    { key: "opus5_only", tier: "common", value: "true", default: false, is_overridden: true, is_shadowed: false, shadow_reason: null, desc: "EVERY dispatched role uses ONE model — Opus 5 — with EFFORT as the cost dial.", options: ["true", "false"], control: { kind: "enum", choices: ["true", "false"], min: null, max: null } },
    { key: "fable5_enabled", tier: "fable5", value: "true", default: false, is_overridden: true, is_shadowed: true, shadow_reason: "shadowed by opus5_only — every role dispatches its Opus 5 agent, so the Fable 5 override is inert", desc: "Master gate — route selected roles to Fable 5 agents.", options: ["true", "false"], control: { kind: "enum", choices: ["true", "false"], min: null, max: null } },
    { key: "fable5_effort", tier: "fable5", value: "medium", default: "medium", is_overridden: false, is_shadowed: true, shadow_reason: "shadowed by opus5_only — every role dispatches its Opus 5 agent, so the Fable 5 override is inert", desc: "Effort for the Fable 5 role agents.", options: ["medium", "high", "xhigh", "max"], control: { kind: "enum", choices: ["medium", "high", "xhigh", "max"], min: null, max: null } },
    { key: "fable5_roles", tier: "fable5", value: "[analyze, plan]", default: "[]", is_overridden: true, is_shadowed: true, shadow_reason: "shadowed by opus5_only — every role dispatches its Opus 5 agent, so the Fable 5 override is inert", desc: "Which roles use Fable 5 (CSV).", options: ["analyze", "plan", "advisor", "judge", "review"], control: { kind: "subset", choices: ["analyze", "plan", "advisor", "judge", "review"], min: null, max: null } },
    { key: "wiki_fresh_max", tier: "advanced", value: 10, default: 10, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Wiki freshness: commit distance < this → FRESH.", options: null, control: { kind: "int", choices: null, min: 1, max: null } },
    { key: "wiki_aging_max", tier: "advanced", value: 30, default: 30, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Wiki freshness: commit distance <= this → AGING; beyond → STALE.", options: null, control: { kind: "int", choices: null, min: 1, max: null } },
    { key: "log_dir", tier: "advanced", value: ".claude/orc/logs", default: ".claude/orc/logs", is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Persistent trace folder (never auto-deleted).", options: null, control: { kind: "path", choices: null, min: null, max: null } },
    { key: "retro_repo", tier: "advanced", value: "azure-id/orc", default: "azure-id/orc", is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "GitHub owner/repo that receives /orc-retro reports.", options: null, control: { kind: "repo", choices: null, min: null, max: null } },
    { key: "orchestrator_model", tier: "advanced", value: "claude-opus-4-8", tierNote: null, default: "claude-opus-4-8", is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Main-session model (below Opus breaks the tier ladder).", options: null, control: { kind: "enum", choices: ["claude-opus-5", "claude-opus-4-8", "claude-sonnet-5"], min: null, max: null } },
  ],
  // The registry-less, hand-written key — read-only everywhere, and shadowed here.
  hand_edited: [
    { key: "rubric_bands_override", value: "[[0,50,'orc-executor-sonnet-5-high'],[50,100,'orc-executor-opus-5-high']]", is_shadowed: true, shadow_reason: "shadowed by opus5_only — executors use the fixed 3-band Opus 5 ladder", editable: false },
  ],
  legacy_keys: [{ key: "opus5_executor_only", renamed_to: "opus5_only" }],
  score_table: {
    active: "opus5_only",
    default: [
      { from: 0, to: 30, inclusive_to: false, agent: "orc-executor-haiku-4-5" },
      { from: 30, to: 40, inclusive_to: false, agent: "orc-executor-sonnet-4-6-med" },
      { from: 40, to: 55, inclusive_to: false, agent: "orc-executor-sonnet-4-6-high" },
      { from: 55, to: 65, inclusive_to: false, agent: "orc-executor-sonnet-5-high" },
      { from: 65, to: 70, inclusive_to: false, agent: "orc-executor-opus-4-7-med" },
      { from: 70, to: 80, inclusive_to: false, agent: "orc-executor-opus-4-7-high" },
      { from: 80, to: 90, inclusive_to: false, agent: "orc-executor-opus-4-8-high" },
      { from: 90, to: 100, inclusive_to: true, agent: "orc-executor-opus-5-high" },
    ],
    opus5_only: [
      { from: 0, to: 40, inclusive_to: false, agent: "orc-executor-opus-5-low" },
      { from: 40, to: 80, inclusive_to: false, agent: "orc-executor-opus-5-med" },
      { from: 80, to: 100, inclusive_to: true, agent: "orc-executor-opus-5-high" },
    ],
  },
  behavior_trace: { always_on: true, configurable_key: "log_dir" },
};

// Deliberately UNHEALTHY, and with the global-install finding present — the
// banner §1 requires can only be designed against a doctor that reports it.
const doctor = {
  ok: false,
  claude_dir: PROJECT + "/.claude",
  installed_version: "0.41.0",
  package_version: "0.43.0",
  global_install: { present: true, version: "0.39.0", shadows: true },
  findings: [
    { id: "version-skew", severity: "warn", message: "payload version 0.41.0 != CLI 0.43.0 — run `orc update`", fixable: true, installed_version: "0.41.0", package_version: "0.43.0" },
    { id: "global-skew", severity: "warn", message: "GLOBAL install ~/.claude is 0.39.0 but this project is 0.41.0 — the global copy can win skill resolution; run `orc update --global`", fixable: false, global_version: "0.39.0", local_version: "0.41.0" },
    { id: "orphan", severity: "warn", message: "2 orphan(s) from a prior payload: agents/orc-executor-opus-4-8-med.md, skills/orc-old/SKILL.md — `orc update`", fixable: true, paths: ["agents/orc-executor-opus-4-8-med.md", "skills/orc-old/SKILL.md"] },
    { id: "statusline-missing", severity: "warn", message: "no statusLine — the non-Opus/high model warning won't show; run `orc update`", fixable: true },
  ],
  fixable: true,
};

const where = {
  claude_dir: PROJECT + "/.claude",
  project_root: PROJECT,
  package_root: "/usr/lib/node_modules/orc",
  package_version: "0.43.0",
  installed_version: "0.41.0",
  skills: PROJECT + "/.claude/skills",
  commands: PROJECT + "/.claude/commands",
  agents: PROJECT + "/.claude/agents",
  hooks: PROJECT + "/.claude/hooks",
  settings: PROJECT + "/.claude/settings.json",
  config: PROJECT + "/.claude/orc.config.yaml",
  run_dir: PROJECT + "/.claude/orc/run",
  log_dir: PROJECT + "/.claude/orc/logs",
};

// STALE on purpose (§9: you cannot design the STALE chip while your wiki is fresh).
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

const pact = {
  ok: true,
  ledger: PROJECT + "/.claude/orc/pact/ledger.json",
  doc: PROJECT + "/PACT.md",
  doc_exists: true,
  entries: 5,
  retired: 1,
  counts: { HOLDING: 2, DRIFTED: 1, UNCHECKABLE: 1, BROKEN: 1 },
  line: "pact: 2 holding · 1 drifted · 1 uncheckable · 1 BROKEN",
  rows: [
    {
      id: "PACT-014",
      statement: "A payment is never written to the ledger twice for one idempotency key.",
      origin: { lane: "orc-grill", run: "run-grill-checkout-100826-141130", kind: "constraint" },
      anchors: ["src/payments/ledger.ts:88", "src/payments/idempotency.ts"],
      check: { kind: "test", ref: "npm test -- idempotency" },
      verified_commit: "8a62b4f1c9",
      confidence: "high",
      last_check: { status: "fail", commit: "8a62b4f1c9", at: "09-08-2026 11:20:04", ref: "npm test -- idempotency" },
      // A real-looking failure, not a placeholder: the panel has to lay out a
      // multi-line check output that does not fit its card.
      history: [
        { at: "09-08-2026 11:20:04", status: "fail", commit: "8a62b4f1c9" },
        { at: "02-08-2026 09:14:51", status: "pass", commit: "c273793aa1" },
      ],
      retired: false,
      state: "BROKEN",
      why: "check failed at 8a62b4f1 (09-08-2026 11:20:04)",
      distance: 3,
    },
    {
      id: "PACT-002",
      statement: "Refund windows are configured, never hardcoded.",
      origin: { lane: "orc-brainstorm", run: "run-brainstorm-refunds-010826-101010", kind: "constraint" },
      anchors: ["src/billing/refund.ts"],
      check: { kind: "grep", ref: "REFUND_WINDOW_DAYS" },
      verified_commit: "c273793aa1",
      confidence: "medium",
      last_check: { status: "pass", commit: "c273793aa1", at: "01-08-2026 10:11:02", ref: "REFUND_WINDOW_DAYS" },
      history: [{ at: "01-08-2026 10:11:02", status: "pass", commit: "c273793aa1" }],
      retired: false,
      state: "DRIFTED",
      why: "6 commits since c273793a touched 1 anchored file",
      distance: 6,
    },
    {
      id: "PACT-007",
      statement: "The admin export never contains a raw email address.",
      origin: { lane: "user", run: null, kind: "constraint" },
      anchors: ["src/admin/export.ts"],
      check: { kind: "manual", ref: null },
      verified_commit: "783f6971aa",
      confidence: "low",
      last_check: null,
      history: [],
      retired: false,
      state: "UNCHECKABLE",
      // The long day count: an UNCHECKABLE promise nobody has looked at for
      // months is the case this state exists to make visible.
      why: "no cheap check exists — this promise is held by review, not by a runner",
      distance: null,
    },
    {
      id: "PACT-001",
      statement: "Every outbound webhook is signed with the tenant's current secret.",
      origin: { lane: "orc", run: "run-orc-webhooks-120726-084500", kind: "constraint" },
      anchors: ["src/webhooks/sign.ts:40"],
      check: { kind: "command", ref: "npm run test:webhooks" },
      verified_commit: "e9dad01bb2",
      confidence: "high",
      last_check: { status: "pass", commit: "e9dad01bb2", at: "05-08-2026 16:02:11", ref: "npm run test:webhooks" },
      history: [{ at: "05-08-2026 16:02:11", status: "pass", commit: "e9dad01bb2" }],
      retired: false,
      state: "HOLDING",
      why: "verified at e9dad01b; no commit since has touched its anchors",
      distance: 0,
    },
    {
      id: "PACT-009",
      statement: "Session cookies are always SameSite=Lax.",
      origin: { lane: "orc-grill", run: "run-grill-auth-200626-113000", kind: "constraint" },
      anchors: ["src/auth/session.ts"],
      check: { kind: "grep", ref: "SameSite=Lax" },
      verified_commit: "cc4778e0aa",
      confidence: "high",
      last_check: { status: "pass", commit: "cc4778e0aa", at: "21-06-2026 09:00:00", ref: "SameSite=Lax" },
      history: [{ at: "21-06-2026 09:00:00", status: "pass", commit: "cc4778e0aa" }],
      retired: false,
      state: "HOLDING",
      why: "verified at cc4778e0; no commit since has touched its anchors",
      distance: 0,
    },
  ],
};

const boundary = {
  ok: true,
  dir: PROJECT + "/.claude/orc/boundary",
  counts: { EXECUTE: 2, ESCALATE: 1, REFUSE: 1 },
  stale: 1,
  malformed: [],
  line: "boundary: 2 execute · 1 escalate · 1 refuse (1 stale)",
  cards: [
    {
      file: "src-payments.md",
      path: PROJECT + "/.claude/orc/boundary/src-payments.md",
      area: "src/payments",
      verdict: "REFUSE",
      checklist: [
        "add a test runner to this package",
        "cover the idempotency path",
        "record the money invariant in PACT.md",
      ],
      escalate_to: null,
      anchored_files: ["src/payments/ledger.ts", "src/payments/idempotency.ts"],
      verified_commit: "8a62b4f1c9",
      distance: 0,
      stale: false,
      malformed: [],
      reasons: [
        "self-verify: no — no test runner in this package",
        "reversible: no — writes to a live ledger",
      ],
    },
    {
      file: "db-migrations.md",
      path: PROJECT + "/.claude/orc/boundary/db-migrations.md",
      area: "db/migrations",
      verdict: "ESCALATE",
      checklist: [],
      escalate_to: "the data owner",
      anchored_files: ["db/migrations"],
      verified_commit: "c273793aa1",
      distance: 0,
      stale: false,
      malformed: [],
      reasons: ["reversible: no — a forward migration on live rows", "decision: yes — the rollout window is not ORC's call"],
    },
    {
      file: "web-locales.md",
      path: PROJECT + "/.claude/orc/boundary/web-locales.md",
      area: "web/locales",
      verdict: "EXECUTE",
      checklist: [],
      escalate_to: null,
      anchored_files: ["web/locales/en.json"],
      verified_commit: "783f6971aa",
      distance: 0,
      stale: false,
      malformed: [],
      reasons: ["self-verify: yes — `npm run i18n:check`", "reversible: yes — one git checkout"],
    },
    {
      file: "src-notifications.md",
      path: PROJECT + "/.claude/orc/boundary/src-notifications.md",
      area: "src/notifications",
      verdict: "EXECUTE",
      checklist: [],
      escalate_to: null,
      anchored_files: ["src/notifications/dispatcher.ts"],
      verified_commit: "9f2c41ab8d",
      // STALE: the evidence moved. Not a wrong card — one whose four answers
      // were computed against a commit that is 12 behind.
      distance: 12,
      stale: true,
      malformed: [],
      reasons: ["self-verify: yes — covered by test/notifications", "reversible: yes"],
    },
  ],
};

const handoff = {
  ok: true,
  map: PROJECT + "/orc-handoff/surfaces.md",
  map_exists: true,
  write_enabled: true,
  counts: { green: 4, amber: 1, red: 2 },
  surfaces: [
    { id: "H-001", file: "web/locales/en.json", what: "Screen text", fields: {}, grade: "green", check: "npm run i18n:check", check_kind: "command", revert: "git checkout -- web/locales/en.json", reason: null, ask: null, exists: true },
    { id: "H-002", file: "web/locales/id.json", what: "Screen text (Indonesian)", fields: {}, grade: "green", check: "npm run i18n:check", check_kind: "command", revert: "git checkout -- web/locales/id.json", reason: null, ask: null, exists: true },
    { id: "H-003", file: "content/pricing.md", what: "The pricing page", fields: { upgrade: "a link checker would make this green" }, grade: "amber", check: "open /pricing in the app and read the page", check_kind: "manual", revert: "git checkout -- content/pricing.md", reason: null, ask: null, exists: true },
    { id: "H-004", file: "config/features.yaml", what: "Feature switches", fields: {}, grade: "green", check: "npm run validate:flags", check_kind: "command", revert: "git checkout -- config/features.yaml", reason: null, ask: null, exists: true },
    // A GREEN surface whose check FAILS. The panel must be able to render the
    // failure and the undo command without it reading as "your edit was saved".
    { id: "H-005", file: "content/faq.md", what: "The FAQ page", fields: { last_check: "fail" }, grade: "green", check: "npm run lint:content", check_kind: "command", revert: "git checkout -- content/faq.md", reason: null, ask: null, exists: true },
    { id: "H-006", file: "src/config/limits.ts", what: "Looks like settings, is code", fields: {}, grade: "red", check: null, check_kind: "manual", revert: "git checkout -- src/config/limits.ts", reason: "this file decides how much a customer is charged", ask: "a backend developer", exists: true },
    { id: "H-007", file: "db/seeds/tenants.sql", what: "Looks like data, is a migration input", fields: {}, grade: "red", check: null, check_kind: "manual", revert: "git checkout -- db/seeds/tenants.sql", reason: "this file is replayed into production on every deploy", ask: "the data owner", exists: true },
  ],
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

const chGoals = (goal, audience, done, version) => ({
  version: version || 1,
  goal,
  audience,
  done_means: done,
  out_of_scope: ["the mobile client", "the 2027 ledger migration"],
  context_refs: ["JIRA-4412", "docs/adr/0009-idempotency.md"],
});

const chDims = (rows) => rows;

const challengeCycles = {
  // The rich one: an accepted exception, an OPEN rebuttal, and a `regoal` version
  // break in the middle of the convergence chart.
  "tsd-payments": {
    ok: true,
    slug: "tsd-payments",
    state: "AWAITING-RECHECK",
    why: "the artifact moved since the last verdict — a new iteration is warranted",
    stalled: false,
    no_template: false,
    kind: "tsd",
    goals: chGoals(
      "a backend team implements this without asking me anything",
      "backend engineers, 2 of 5 non-native English readers",
      "no open interface question and no TBD in §3–§7",
      2
    ),
    template: { source: "docs/templates/tsd.md", frozen: "template.md", sha: "0c8e41", version: 1, no_template: false },
    iterations: 3,
    artifacts: [{ path: "docs/tsd-payments.md", changed_since_verdict: true }],
    revision: { mode: "new-file", pattern: "docs/tsd-payments-v{n}.md", expected: "docs/tsd-payments-v4.md", found: true },
    counts: { P0: 0, P1: 3, P2: 5, P3: 2, accepted: 1, rebutted: 1 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 1 },
      { id: "D2", status: "CHECKED", findings: 2 },
      { id: "D3", status: "CHECKED", findings: 0 },
      { id: "D4", status: "CHECKED", findings: 3, score: "8/12" },
      { id: "D5", status: "CHECKED", findings: 4 },
      { id: "D6", status: "CHECKED", findings: 1 },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 9, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 2, P1: 7, P2: 6, P3: 1 } },
      { n: 2, blocking: 5, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 4, P2: 5, P3: 2 } },
      { n: 3, blocking: 3, passed: false, graded_against: 1, graded_against_goal: 2, severities: { P0: 0, P1: 3, P2: 5, P3: 2 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/tsd-payments",
    next: "/orc-challenge tsd-payments",
    preflight_line: "challenge: tsd-payments AWAITING-RECHECK — 3 blocking findings open",
  },
  // Stalled: four iterations, no net reduction. The warning is not chrome.
  "checkout-prd": {
    ok: true,
    slug: "checkout-prd",
    state: "AWAITING-FIX",
    why: "4 blocking findings open and nothing has changed yet",
    stalled: true,
    no_template: false,
    kind: "prd",
    goals: chGoals(
      "it survives the architecture review board on Tuesday",
      "the review board — two principals, one PM, none of them close to this code",
      "no section contradicts another, and every claim has a source"
    ),
    template: { source: "docs/templates/prd.md", frozen: "template.md", sha: "77aa10", version: 2, no_template: false },
    iterations: 4,
    artifacts: [{ path: "docs/checkout-prd.md", changed_since_verdict: false }],
    revision: { mode: "in-place", pattern: null, expected: "docs/checkout-prd.md", found: true },
    counts: { P0: 0, P1: 4, P2: 2, P3: 0, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 2 },
      { id: "D2", status: "NOT-SELECTED" },
      { id: "D3", status: "CHECKED", findings: 2 },
      { id: "D4", status: "CHECKED", findings: 0, score: "11/12" },
      { id: "D5", status: "CHECKED", findings: 0 },
      { id: "D6", status: "CHECKED", findings: 2 },
      { id: "D7", status: "CHECKED", findings: 0 },
    ]),
    convergence: [
      { n: 1, blocking: 9, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 8, P2: 3, P3: 0 } },
      { n: 2, blocking: 4, passed: false, graded_against: 2, graded_against_goal: 1, severities: { P0: 0, P1: 4, P2: 3, P3: 1 } },
      { n: 3, blocking: 4, passed: false, graded_against: 2, graded_against_goal: 1, severities: { P0: 0, P1: 4, P2: 2, P3: 0 } },
      { n: 4, blocking: 4, passed: false, graded_against: 2, graded_against_goal: 1, severities: { P0: 0, P1: 4, P2: 2, P3: 0 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/checkout-prd",
    next: "/orc-challenge checkout-prd",
    preflight_line: "challenge: checkout-prd AWAITING-FIX — 4 blocking findings open · stalled",
  },
  // Zero iterations. "Created, not yet judged" is an ANSWER, not a blank card.
  "runbook-oncall": {
    ok: true,
    slug: "runbook-oncall",
    state: "AWAITING-JUDGE",
    why: "created, not yet judged",
    stalled: false,
    no_template: false,
    kind: "runbook",
    goals: chGoals(
      "somebody woken at 3am can follow it without asking anyone",
      "the on-call rota — anyone in the backend group, including week-one joiners",
      "every step has a command and an expected result"
    ),
    template: { source: "docs/templates/runbook.md", frozen: "template.md", sha: "b0c110", version: 1, no_template: false },
    iterations: 0,
    artifacts: [{ path: "docs/runbooks/oncall.md", changed_since_verdict: false }],
    revision: { mode: "in-place", pattern: null, expected: "docs/runbooks/oncall.md", found: true },
    counts: { P0: 0, P1: 0, P2: 0, P3: 0, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D2", status: "NOT-SELECTED" },
      { id: "D3", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D4", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D5", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D6", status: "NOT-CHECKED", reason: "not yet judged" },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [],
    dir: PROJECT + "/orc/orc-challenge/runbook-oncall",
    next: "/orc-challenge runbook-oncall",
    preflight_line: "challenge: runbook-oncall AWAITING-JUDGE",
  },
  "adr-0012-events": {
    ok: true,
    slug: "adr-0012-events",
    state: "PASSED",
    why: "passed at iteration 2; nothing has changed since",
    stalled: false,
    no_template: false,
    kind: "adr",
    goals: chGoals(
      "a future maintainer understands why we chose the outbox over dual writes",
      "whoever inherits this service in two years",
      "the rejected options are written down with the reason each lost"
    ),
    template: { source: "docs/adr/0001-template.md", frozen: "template.md", sha: "33ee90", version: 1, no_template: false },
    iterations: 2,
    artifacts: [{ path: "docs/adr/0012-events.md", changed_since_verdict: false }],
    revision: { mode: "in-place", pattern: null, expected: "docs/adr/0012-events.md", found: true },
    counts: { P0: 0, P1: 0, P2: 1, P3: 2, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 0 },
      { id: "D2", status: "CHECKED", findings: 0 },
      { id: "D3", status: "CHECKED", findings: 1 },
      { id: "D4", status: "NOT-SELECTED" },
      { id: "D5", status: "NOT-SELECTED" },
      { id: "D6", status: "NOT-SELECTED" },
      { id: "D7", status: "CHECKED", findings: 2 },
    ]),
    convergence: [
      { n: 1, blocking: 4, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 3, P2: 2, P3: 1 } },
      { n: 2, blocking: 0, passed: true, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 0, P2: 1, P3: 2 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/adr-0012-events",
    next: null,
    preflight_line: "challenge: adr-0012-events PASSED",
  },
  // Passed, then somebody edited it. HONEST, not a failure — the UNCHECKABLE
  // precedent from /orc-pact.
  "api-contract-v2": {
    ok: true,
    slug: "api-contract-v2",
    state: "STALE-PASS",
    why: "passed at iteration 3, but 1 artifact changed afterwards — honest, not a failure",
    stalled: false,
    no_template: false,
    kind: "api-contract",
    goals: chGoals(
      "the mobile and web clients can both generate from it with no questions",
      "client engineers on two platforms, generating from the spec",
      "every endpoint has an error schema and an example"
    ),
    template: { source: "openapi/base.yaml", frozen: "template.md", sha: "9a7712", version: 1, no_template: false },
    iterations: 3,
    artifacts: [{ path: "openapi/payments-v2.yaml", changed_since_verdict: true }],
    revision: { mode: "in-place", pattern: null, expected: "openapi/payments-v2.yaml", found: true },
    counts: { P0: 0, P1: 0, P2: 0, P3: 1, accepted: 2, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 0 },
      { id: "D2", status: "CHECKED", findings: 0 },
      { id: "D3", status: "CHECKED", findings: 0 },
      { id: "D4", status: "NOT-SELECTED" },
      { id: "D5", status: "NOT-SELECTED" },
      { id: "D6", status: "CHECKED", findings: 1 },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 12, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 3, P1: 9, P2: 4, P3: 2 } },
      { n: 2, blocking: 5, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 5, P2: 3, P3: 1 } },
      { n: 3, blocking: 0, passed: true, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 0, P2: 0, P3: 1 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/api-contract-v2",
    next: "/orc-challenge api-contract-v2",
    preflight_line: "challenge: api-contract-v2 STALE-PASS",
  },
  // The declared revision is not where it was declared. Candidates are LISTED.
  "billing-webhooks": {
    ok: true,
    slug: "billing-webhooks",
    state: "MISSING-REVISION",
    why: "the declared revision docs/billing-webhooks-v2.md does not exist — candidates are listed, never adopted",
    stalled: false,
    no_template: false,
    kind: "code",
    goals: chGoals(
      "a new engineer can extend this module without reading the whole service",
      "backend engineers joining the team this quarter",
      "every exported function has a caller-visible contract, and no error path is silent"
    ),
    template: { source: ".claude/orc/patterns/typescript-pattern.md", frozen: "template.md", sha: "51ff02", version: 1, no_template: false },
    iterations: 1,
    artifacts: [{ path: "src/billing/webhooks/handler.ts", changed_since_verdict: false }],
    revision: { mode: "new-file", pattern: "docs/billing-webhooks-v{n}.md", expected: "docs/billing-webhooks-v2.md", found: false },
    counts: { P0: 1, P1: 2, P2: 3, P3: 0, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "NOT-SELECTED" },
      { id: "D2", status: "CHECKED", findings: 3 },
      { id: "D3", status: "CHECKED", findings: 1 },
      { id: "D4", status: "CHECKED", findings: 2, score: "6/11" },
      { id: "D5", status: "NOT-SELECTED" },
      { id: "D6", status: "CHECKED", findings: 0 },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 3, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 2, P2: 3, P3: 0 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/billing-webhooks",
    next: "/orc-challenge billing-webhooks",
    preflight_line: "challenge: billing-webhooks MISSING-REVISION — 3 blocking findings open",
  },
  // A verdict file changed after it was recorded. Reported, never re-graded.
  "readme-onboarding": {
    ok: true,
    slug: "readme-onboarding",
    state: "TAMPERED",
    why: "iteration-01/verdict.md changed after it was recorded — reported, never silently re-graded",
    stalled: false,
    no_template: false,
    kind: "readme",
    goals: chGoals(
      "a new hire gets the project running on day one without asking",
      "new joiners, on their own machine, on their first morning",
      "every command in it has been run on a clean checkout"
    ),
    template: { source: "docs/templates/readme.md", frozen: "template.md", sha: "12bb44", version: 1, no_template: false },
    iterations: 2,
    artifacts: [{ path: "README.md", changed_since_verdict: true }],
    revision: { mode: "in-place", pattern: null, expected: "README.md", found: true },
    counts: { P0: 0, P1: 2, P2: 1, P3: 0, accepted: 0, rebutted: 1 },
    dimensions: chDims([
      { id: "D1", status: "CHECKED", findings: 1 },
      { id: "D2", status: "NOT-SELECTED" },
      { id: "D3", status: "CHECKED", findings: 1 },
      { id: "D4", status: "CHECKED", findings: 1, score: "9/12" },
      { id: "D5", status: "CHECKED", findings: 0 },
      { id: "D6", status: "NOT-SELECTED" },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 6, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 1, P1: 5, P2: 2, P3: 0 } },
      { n: 2, blocking: 2, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 2, P2: 1, P3: 0 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/readme-onboarding",
    next: "/orc-challenge readme-onboarding",
    preflight_line: "challenge: readme-onboarding TAMPERED",
  },
  // No template supplied. D1 is NOT-CHECKED **with its reason**, everywhere —
  // in the verdict, in the report, and as a chip here.
  "mobile-spec": {
    ok: true,
    slug: "mobile-spec",
    state: "AWAITING-FIX",
    why: "2 blocking findings open and nothing has changed yet",
    stalled: false,
    no_template: true,
    kind: "tsd",
    goals: chGoals(
      "I just want to know if I forgot anything obvious",
      "me, and whoever picks this up next quarter",
      "no section is a heading with nothing under it"
    ),
    template: { source: null, frozen: null, sha: null, version: 1, no_template: true },
    iterations: 1,
    artifacts: [{ path: "docs/mobile-spec.md", changed_since_verdict: false }],
    revision: { mode: "in-place", pattern: null, expected: "docs/mobile-spec.md", found: true },
    counts: { P0: 0, P1: 2, P2: 4, P3: 3, accepted: 0, rebutted: 0 },
    dimensions: chDims([
      { id: "D1", status: "NOT-CHECKED", reason: "no template supplied" },
      { id: "D2", status: "CHECKED", findings: 1 },
      { id: "D3", status: "CHECKED", findings: 2 },
      { id: "D4", status: "NOT-CHECKED", reason: "challenge_reader is off" },
      { id: "D5", status: "CHECKED", findings: 4 },
      { id: "D6", status: "CHECKED", findings: 2 },
      { id: "D7", status: "NOT-SELECTED" },
    ]),
    convergence: [
      { n: 1, blocking: 2, passed: false, graded_against: 1, graded_against_goal: 1, severities: { P0: 0, P1: 2, P2: 4, P3: 3 } },
    ],
    dir: PROJECT + "/orc/orc-challenge/mobile-spec",
    next: "/orc-challenge mobile-spec",
    preflight_line: "challenge: mobile-spec AWAITING-FIX — 2 blocking findings open · no template (D1 NOT-CHECKED)",
  },
};

const challengeList = {
  ok: true,
  in_flight: Object.values(challengeCycles).filter((c) => c.state !== "PASSED").length,
  cycles: Object.values(challengeCycles).map((c) => ({
    slug: c.slug,
    kind: c.kind,
    state: c.state,
    why: c.why,
    iterations: c.iterations,
    blocking: c.counts.P0 + c.counts.P1,
    counts: c.counts,
    stalled: c.stalled,
    no_template: c.no_template,
    goal: c.goals.goal,
    next: c.next,
  })),
};

// The findings behind the rich cycle. Enough shapes to design against: a carried
// finding with each outcome, an accepted one, a rebutted one, and one whose
// anchor did not move.
const challengeShow = {
  ok: true,
  slug: "tsd-payments",
  state: "AWAITING-RECHECK",
  kind: "tsd",
  goals: challengeCycles["tsd-payments"].goals,
  template: challengeCycles["tsd-payments"].template,
  no_template: false,
  dimensions_selected: ["D1", "D2", "D3", "D4", "D5", "D6"],
  accepted: { "F-003": { reason: "the endpoints land in the sibling API spec, not here", at: "11-08-2026 16:04:22", iteration: 2 } },
  rebuttals: { "F-014": { reason: "the passive voice is quoted from the regulator's wording", at: "12-08-2026 09:11:03", status: "open" } },
  events: [
    { at: "10-08-2026 14:02:11", kind: "created", detail: "goal v1, template v1" },
    { at: "11-08-2026 16:04:22", kind: "accept", detail: "F-003 — the endpoints land in the sibling API spec, not here" },
    { at: "12-08-2026 08:40:00", kind: "regoal", detail: "docs/goals-v2.md — the board moved to a delivery review", to_version: 2 },
    { at: "12-08-2026 09:11:03", kind: "rebut", detail: "F-014 — the passive voice is quoted from the regulator's wording" },
  ],
  revision: { mode: "new-file", pattern: "docs/tsd-payments-v{n}.md", expected: "docs/tsd-payments-v4.md" },
  iterations: [
    {
      n: 3,
      graded_against: 1,
      graded_against_goal: 2,
      coverage_pct: 100,
      blocking: 3,
      passed: false,
      advised: true,
      lint: { findings: 13, grade: 8.1 },
      reader: { asked: 12, answered: 8, score: "8/12" },
      verdict_file: "iteration-03/verdict.md",
      advice_file: "iteration-03/advice.md",
      severities: { P0: 0, P1: 3, P2: 5, P3: 2 },
      dimensions: challengeCycles["tsd-payments"].dimensions.filter((d) => d.status !== "NOT-SELECTED"),
      findings: [
        {
          id: "F-001",
          dimension: "D2",
          severity: "P1",
          anchor: "docs/tsd-payments.md:118",
          quote: "the idempotency window is applied appropriately",
          what_is_wrong: "the window is never given a value anywhere in the document",
          consequence: "two teams implementing from this will pick different windows, and the mismatch only shows up in production",
          acceptance_line: "§4.2 names the window in seconds and the dead-letter destination",
          serves: "done_means",
          carried: true,
          outcome: "still-open",
          reason: null,
          superseded_by: null,
        },
        {
          id: "F-007",
          dimension: "D5",
          severity: "P1",
          anchor: "docs/tsd-payments.md:84",
          quote: "Once the settlement job has been kicked off, the reconciliation is not run until the window is closed and no further retries are outstanding.",
          what_is_wrong: "43 words, two negations, and a phrasal verb",
          consequence: "the two non-native readers on the team read this three times and still ask",
          acceptance_line: "the sentence is split, and 'kicked off' becomes 'started'",
          serves: "audience",
          carried: true,
          outcome: "still-open",
          reason: null,
          superseded_by: null,
        },
        {
          id: "F-011",
          dimension: "D1",
          severity: "P1",
          anchor: "docs/tsd-payments.md:1",
          quote: "(the section is absent)",
          what_is_wrong: "the template requires an Error handling section and there is none",
          consequence: "every error path is undecided, so the implementer invents one per endpoint",
          acceptance_line: "an Error handling section exists with one row per failure mode",
          serves: "goal",
          carried: false,
          outcome: null,
          reason: null,
          superseded_by: null,
        },
        {
          id: "F-009",
          dimension: "D3",
          severity: "P2",
          anchor: "docs/tsd-payments.md:52",
          quote: "the retry budget is 3",
          what_is_wrong: "§2 says 3 retries, §6 says 5",
          consequence: "whoever reads only one section builds the wrong one",
          acceptance_line: "both sections say the same number, or one defers to the other",
          serves: "goal",
          carried: true,
          outcome: "resolved",
          reason: "§6 now points at §2",
          superseded_by: null,
        },
        {
          id: "F-014",
          dimension: "D5",
          severity: "P2",
          anchor: "docs/tsd-payments.md:140",
          quote: "settlement is deemed to have occurred",
          what_is_wrong: "passive voice in a normative sentence",
          consequence: "the reader cannot tell who does it",
          acceptance_line: "the actor is named",
          serves: "audience",
          carried: true,
          outcome: "still-open",
          reason: null,
          superseded_by: null,
        },
        {
          id: "F-016",
          dimension: "D2",
          severity: "P2",
          anchor: "docs/tsd-payments.md:96",
          quote: "the worker consumes from the queue",
          what_is_wrong: "superseded — §5 was rewritten and the claim moved",
          consequence: "—",
          acceptance_line: "see F-021",
          serves: "goal",
          carried: true,
          outcome: "superseded",
          reason: "§5 was rewritten around the outbox",
          superseded_by: "F-021",
        },
      ],
      dropped: [{ id: "F-020", why: "no `serves` — not traceable to a stated goal element" }],
    },
  ],
  open: [],
  dir: PROJECT + "/orc/orc-challenge/tsd-payments",
};

const challengeDiff = {
  ok: true,
  slug: "tsd-payments",
  state: "AWAITING-RECHECK",
  expected: "docs/tsd-payments-v4.md",
  found: true,
  sha_before: "3f9a71c2",
  sha_after: "b71c04ea",
  changed: true,
  added: 48,
  removed: 12,
  carried: [
    { id: "F-001", anchor: "docs/tsd-payments.md:118", severity: "P1", dimension: "D2", touched: true },
    { id: "F-007", anchor: "docs/tsd-payments.md:84", severity: "P1", dimension: "D5", touched: false },
    { id: "F-014", anchor: "docs/tsd-payments.md:140", severity: "P2", dimension: "D5", touched: false },
  ],
  touched: 1,
  untouched: ["F-007", "F-014"],
  note: "touched/untouched is a HINT for you, never an input to the judge — the judge always re-reads the artifact",
};

// The exit-2 branch. You cannot design a candidate list on a cycle whose
// revision is exactly where it was declared — and this is the one place the
// panel must offer a COMMAND rather than a pick.
const challengeDiffMissing = {
  ok: true,
  slug: "billing-webhooks",
  state: "MISSING-REVISION",
  expected: "docs/billing-webhooks-v2.md",
  found: false,
  since: "11-08-2026 18:22:07",
  candidates: [
    { path: "docs/billing-webhooks-v2.draft.md", added: 51, removed: 12 },
    { path: "src/billing/webhooks/handler.ts", added: 4, removed: 0 },
  ],
  note: "candidates are LISTED, never adopted — record the real one with `orc challenge expect <slug> --set <path>`",
};

const challengeLint = {
  ok: true,
  path: "docs/tsd-payments.md",
  template: PROJECT + "/orc/orc-challenge/tsd-payments/template.md",
  findings: [
    { id: "L-001", dimension: "D1", line: 1, what: 'required section missing: "error handling"', quote: null },
    { id: "L-002", dimension: "D5", line: 1, what: "40% of sentences look passive (heuristic; threshold 25%)", quote: null },
    { id: "L-003", dimension: "D1", line: 3, what: 'section "Overview" has 13 words of body — ceremony, not content', quote: "Overview" },
    { id: "L-004", dimension: "D6", line: 9, what: 'placeholder marker: "TBD"', quote: "## Scope\n\nTBD" },
    { id: "L-005", dimension: "D5", line: 84, what: "sentence is 43 words (over 25)", quote: "Once the settlement job has been kicked off, the reconciliation is not run until the window is closed…" },
    { id: "L-006", dimension: "D5", line: 84, what: 'idiom / phrasal verb: "kick off" — hard for a non-native reader', quote: null },
    { id: "L-007", dimension: "D5", line: 118, what: '"SoR" is used before it is defined', quote: null },
    { id: "L-008", dimension: "D6", line: 118, what: 'ambiguous quantifier: "appropriate" — an implementer cannot build from it', quote: null },
  ],
  counts: { total: 8, by_dimension: { D1: 2, D5: 4, D6: 2 } },
  metrics: { headings: 9, sentences: 61, words: 812, sentence_p50: 14, sentence_p90: 43, passive_pct: 40, flesch_kincaid_grade: 8.1 },
  structure: { required: 5, present: 4, missing: ["error handling"], out_of_order: false, invented: [] },
  honesty: [
    "This is a SIGNAL, not a verdict. A long sentence is not automatically a defect — the lint never blocks; it feeds the judge, who decides.",
    "It is English-specific and heuristic: the grade is an estimate and passive-voice detection is a pattern match.",
  ],
};

// ── /orc-doc (v0.48.0) ──────────────────────────────────────────────────────
// ONE FIXTURE PER STATE, and the ugly ones are the point: you cannot design the
// `user-edited` swatch on a document nobody has touched, the `open` dashed
// segment on a document with no gaps, a lint-RED health card on a clean file,
// or ribbon overflow on a document with nine sections.
const docList = {
  ok: true,
  dir: "orc/orc-doc",
  total: 4,
  documents: [
    {
      slug: "prd-checkout-refund-130826",
      title: "Checkout refunds",
      type: "prd",
      target: "notion",
      language: "en",
      cycle: 2,
      document: "present",
      lines: 487,
      sections_total: 17,
      sections_written: 14,
      user_edited: ["02-summary", "08-functional-requirements"],
      where: "Where it stands:  /orc-doc · PRD · cycle 2 · 14 of 17 sections written",
      dir: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826",
      next: "/orc-doc resume prd-checkout-refund-130826",
    },
    {
      // The finished one. `complete` is the only state that offers `git add`.
      slug: "runbook-payout-freeze-110826",
      title: "Payout freeze runbook",
      type: "workflow",
      target: "confluence",
      language: "en",
      cycle: 3,
      document: "present",
      lines: 212,
      sections_total: 12,
      sections_written: 12,
      user_edited: [],
      where: "Where it stands:  /orc-doc · WORKFLOW · cycle 3 · 12 of 12 sections written",
      dir: PROJECT + "/orc/orc-doc/runbook-payout-freeze-110826",
      next: "/orc-doc resume runbook-payout-freeze-110826",
    },
    {
      // The MONSTER: 40 sections, which is what forces ribbon overflow. It is
      // also the one the split offer exists for.
      slug: "tsd-ledger-rewrite-090826",
      title: "Ledger rewrite",
      type: "tsd",
      target: "docusaurus",
      language: "en",
      cycle: 1,
      document: "present",
      lines: 3140,
      sections_total: 40,
      sections_written: 31,
      user_edited: ["05-detailed-design"],
      where: "Where it stands:  /orc-doc · TSD · cycle 1 · 31 of 40 sections written",
      dir: PROJECT + "/orc/orc-doc/tsd-ledger-rewrite-090826",
      next: "/orc-doc resume tsd-ledger-rewrite-090826",
    },
    {
      // NOT STARTED: the outline exists, nothing has been assembled. The CLI's
      // own phrase, and it is never softened into "failed" or "empty".
      slug: "collab-risk-and-payments-130826",
      title: "Risk and Payments working agreement",
      type: "collaboration",
      target: "generic",
      language: "id",
      cycle: 0,
      document: "not started",
      lines: 0,
      sections_total: 13,
      sections_written: 0,
      user_edited: [],
      where: "Where it stands:  /orc-doc · COLLABORATION · cycle 0 · 0 of 13 sections written",
      dir: PROJECT + "/orc/orc-doc/collab-risk-and-payments-130826",
      next: "/orc-doc resume collab-risk-and-payments-130826",
    },
  ],
};

const docStatuses = {
  "prd-checkout-refund-130826": {
    ok: true,
    slug: "prd-checkout-refund-130826",
    title: "Checkout refunds",
    type: "prd",
    target: "notion",
    language: "en",
    cycle: 2,
    state: "in-progress",
    document: "orc/orc-doc/prd-checkout-refund-130826/document.md",
    lines: 487,
    sections_total: 17,
    sections_written: 14,
    open_sections: [
      { id: "12-risks-and-open-questions", heading: "Risks and open questions" },
      { id: "13-rollout-and-measurement-plan", heading: "Rollout and measurement plan" },
    ],
    user_edited: [
      { id: "02-summary", heading: "Summary" },
      { id: "08-functional-requirements", heading: "Functional requirements" },
    ],
    lint: { errors: 2, warnings: 6, target: "notion" },
    dir: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826",
    where: "Where it stands:  /orc-doc · PRD · cycle 2 · 14 of 17 sections written",
    resume: "/orc-doc resume prd-checkout-refund-130826",
  },
  "runbook-payout-freeze-110826": {
    ok: true,
    slug: "runbook-payout-freeze-110826",
    title: "Payout freeze runbook",
    type: "workflow",
    target: "confluence",
    language: "en",
    cycle: 3,
    state: "complete",
    document: "orc/orc-doc/runbook-payout-freeze-110826/document.md",
    lines: 212,
    sections_total: 12,
    sections_written: 12,
    open_sections: [],
    user_edited: [],
    lint: { errors: 0, warnings: 1, target: "confluence" },
    dir: PROJECT + "/orc/orc-doc/runbook-payout-freeze-110826",
    where: "Where it stands:  /orc-doc · WORKFLOW · cycle 3 · 12 of 12 sections written",
    resume: "/orc-doc resume runbook-payout-freeze-110826",
  },
  "collab-risk-and-payments-130826": {
    ok: true,
    slug: "collab-risk-and-payments-130826",
    title: "Risk and Payments working agreement",
    type: "collaboration",
    target: "generic",
    language: "id",
    cycle: 0,
    state: "not-started",
    document: null,
    lines: 0,
    sections_total: 13,
    sections_written: 0,
    open_sections: [],
    user_edited: [],
    lint: null,
    dir: PROJECT + "/orc/orc-doc/collab-risk-and-payments-130826",
    where: "Where it stands:  /orc-doc · COLLABORATION · cycle 0 · 0 of 13 sections written",
    resume: "/orc-doc resume collab-risk-and-payments-130826",
  },
};

// The map carries one of EVERY section state, plus a repaired rename and a
// section with findings — none of which exist on a healthy document.
const docMapSections = [
  { id: "01-document-info", heading: "Document info", level: 2, start: 3, end: 24, lines: 22, hash: "a91f4c02de77", state: "checked", required: true, findings: 0, renamed_from: null },
  { id: "02-summary", heading: "Summary", level: 2, start: 25, end: 41, lines: 17, hash: "4c02aa1791ff", state: "user-edited", required: true, findings: 0, renamed_from: null },
  { id: "03-the-problem-we-are-solving", heading: "The problem we are solving", level: 2, start: 42, end: 118, lines: 77, hash: "7731bb04ce19", state: "written", required: true, findings: 1, renamed_from: "03-problem-and-context" },
  { id: "04-goals-and-success-metrics", heading: "Goals and success metrics", level: 2, start: 119, end: 176, lines: 58, hash: "5d642c42aa10", state: "written", required: true, findings: 2, renamed_from: null },
  { id: "05-non-goals", heading: "Non-goals", level: 2, start: 177, end: 181, lines: 5, hash: "c28656c5be31", state: "open", required: true, findings: 0, renamed_from: null },
  { id: "06-users-and-jobs-to-be-done", heading: "Users and jobs to be done", level: 2, start: 182, end: 240, lines: 59, hash: "a0c7398aff02", state: "checked", required: true, findings: 0, renamed_from: null },
  { id: "07-scenarios-and-user-stories", heading: "Scenarios and user stories", level: 2, start: 241, end: 333, lines: 93, hash: "3c5eb244cd18", state: "written", required: true, findings: 0, renamed_from: null },
  { id: "08-functional-requirements", heading: "Functional requirements", level: 2, start: 334, end: 470, lines: 137, hash: "be7aca8c0091", state: "user-edited", required: true, findings: 0, renamed_from: null },
  { id: "09-non-functional-requirements", heading: "Non-functional requirements", level: 2, start: 471, end: 480, lines: 10, hash: "4ff6336511cc", state: "planned", required: true, findings: 0, renamed_from: null },
  { id: "10-revision-history", heading: "Revision history", level: 2, start: 481, end: 487, lines: 7, hash: "0d8c6a9d7742", state: "written", required: true, findings: 0, renamed_from: null },
];

const docMap = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  file: "orc/orc-doc/prd-checkout-refund-130826/document.md",
  lines: 487,
  preamble_end: 2,
  sections: docMapSections,
  repaired: [{ from: "03-problem-and-context", to: "03-the-problem-we-are-solving", heading: "The problem we are solving" }],
  note: "line numbers are DERIVED on every read and never stored — a stored line number is a wrong line number one edit later",
};

// A lint-RED card against --target notion. You cannot design the error chip, the
// rule bars or the import note on a clean document.
const docLint = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  file: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826/document.md",
  target: "notion",
  target_label: "Notion",
  max_heading: 3,
  front_matter: "ban",
  lines: 487,
  errors: 2,
  warnings: 6,
  findings: [
    { id: "D-001", severity: "error", rule: "heading-too-deep", line: 128, what: "H4 is deeper than Notion supports (max H3) — it degrades to bold text", quote: "Refund windows" },
    { id: "D-002", severity: "error", rule: "hard-wrap", line: 204, what: "a hard-wrapped paragraph — one paragraph must be one line, or the wrap becomes a line break on import", quote: "The refund window closes at the end of the settlement day, and any" },
    { id: "D-003", severity: "warn", rule: "long-sentence", line: 141, what: "a 47-word sentence — one idea per sentence, and the bar is 35", quote: "Once the settlement job has been started the reconciliation is not run until…" },
    { id: "D-004", severity: "warn", rule: "long-sentence", line: 262, what: "a 39-word sentence — one idea per sentence, and the bar is 35", quote: "Merchants who have opted into instant payouts and who also…" },
    { id: "D-005", severity: "warn", rule: "undefined-acronym", line: 141, what: '"SoR" is used without being expanded on first use', quote: "the SoR for a refund is the ledger" },
    { id: "D-006", severity: "warn", rule: "undefined-acronym", line: 310, what: '"PSP" is used without being expanded on first use', quote: null },
    { id: "D-007", severity: "warn", rule: "placeholder", line: 179, what: "leftover placeholder text: TBD", quote: "> **Open:** TBD — the fraud limit" },
    { id: "D-008", severity: "warn", rule: "fence-no-language", line: 356, what: "a code fence with no language tag", quote: null },
  ],
  readability: {
    sentences: 214,
    avg_sentence_words: 21.4,
    avg_bar: 20,
    longest_sentence_words: 47,
    longest_sentence_line: 141,
    long_word_pct: 18,
    passive_constructions: 31,
    undefined_acronyms: [
      { acronym: "SoR", line: 141 },
      { acronym: "PSP", line: 310 },
    ],
  },
  honesty: [
    "A readability signal is a SIGNAL, not a verdict. This never blocks anything.",
    "It is English-specific and heuristic: passive voice is a pattern match and a syllable count is an estimate.",
  ],
  import_note: null,
};

// A plan with a CLAMP and an OVERSIZED section — both are states you cannot see
// on a well-shaped document, and both are things the panel must say out loud.
const docPlan = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  role: "write",
  agent: "orc-doc-writer-opus-5-med",
  budget_lines: 400,
  parallel: 4,
  clamped: { from: 6, to: 4 },
  waves: [
    {
      n: 1,
      agents: [
        { agent: "orc-doc-writer-opus-5-med", sections: ["09-non-functional-requirements"], headings: ["Non-functional requirements"], budget_lines: 120, oversized: false, part: ".work/09-non-functional-requirements.md" },
        { agent: "orc-doc-writer-opus-5-med", sections: ["12-risks-and-open-questions", "13-rollout-and-measurement-plan"], headings: ["Risks and open questions", "Rollout and measurement plan"], budget_lines: 160, oversized: false, part: ".work/12-risks-and-open-questions.md" },
        { agent: "orc-doc-writer-opus-5-med", sections: ["05-non-goals"], headings: ["Non-goals"], budget_lines: 40, oversized: false, part: ".work/05-non-goals.md" },
        { agent: "orc-doc-writer-opus-5-med", sections: ["08-functional-requirements"], headings: ["Functional requirements"], budget_lines: 620, oversized: true, part: ".work/08-functional-requirements.md" },
      ],
    },
    {
      n: 2,
      agents: [
        { agent: "orc-doc-writer-opus-5-med", sections: ["16-glossary", "17-revision-history"], headings: ["Glossary", "Revision history"], budget_lines: 60, oversized: false, part: ".work/16-glossary.md" },
      ],
    },
  ],
  agents: 5,
  oversized: ["08-functional-requirements"],
  hint: null,
  note: "no section is ever split across two agents, and no two agents ever share a file",
};

const docShow = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  title: "Checkout refunds",
  type: "prd",
  language: "en",
  target: "notion",
  length: "standard",
  template: { source: "shipped:prd", label: "PRD — Product Requirements Document" },
  cycle: 2,
  dir: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826",
  document: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826/document.md",
  total_lines: 487,
  outline: docMapSections.map((s) => ({
    id: s.id,
    heading: s.heading,
    level: 2,
    required: s.id !== "10-revision-history" ? true : true,
    purpose: "what this section is for, in one line",
    affinity: null,
    budget_lines: 120,
  })),
  sections: docMapSections,
  extracts: {},
  cycles: [
    { n: 1, at: "13-08-2026 09:14:02", kind: "write", agents: 5, sections: ["01-document-info", "02-summary"] },
    { n: 2, at: "14-08-2026 11:02:47", kind: "edit", agents: 2, sections: ["04-goals-and-success-metrics"] },
  ],
  lock: null,
  where: "Where it stands:  /orc-doc · PRD · cycle 2 · 14 of 17 sections written",
};

// ONE section's text, and only on an explicit Reveal click.
const docSection = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  section: "05-non-goals",
  heading: "Non-goals",
  start: 177,
  end: 181,
  lines: 5,
  state: "open",
  hash: "c28656c5be31",
  text: "## Non-goals\n\n> **Open:** nobody has decided whether subscription refunds are in scope. Needed before the rollout section can commit to a date.\n",
};

module.exports.get = function get(route, q) {
  switch (route) {
    case "/api/doc":
      return docList;
    case "/api/doc/one":
      return (q && docStatuses[q.slug]) || docStatuses["prd-checkout-refund-130826"];
    case "/api/doc/show":
      return docShow;
    case "/api/doc/map":
      return docMap;
    case "/api/doc/lint":
      return docLint;
    case "/api/doc/plan":
      return docPlan;
    case "/api/doc/section":
      return docSection;
    case "/api/challenge":
      return challengeList;
    case "/api/challenge/one":
      return (q && challengeCycles[q.slug]) || challengeCycles["tsd-payments"];
    case "/api/challenge/show":
      // Only the rich cycle carries findings. Every other slug returns its own
      // identity with an empty iteration list, which is the honest shape for a
      // cycle nobody has judged yet — and stops the panel drawing one cycle's
      // findings under another cycle's name.
      return q && q.slug && q.slug !== challengeShow.slug
        ? { ...challengeShow, slug: q.slug, iterations: [], accepted: {}, rebuttals: {}, events: [] }
        : challengeShow;
    case "/api/challenge/diff":
      return q && q.slug === "billing-webhooks" ? challengeDiffMissing : challengeDiff;
    case "/api/challenge/lint":
      return challengeLint;
    case "/api/meta":
      return undefined; // served for real even in fixture mode
    case "/api/version":
      // An update IS available here on purpose. "Up to date" is the state that
      // needs no design; you cannot lay out the update chip, the rail dot or
      // the upgrade row against a version that matches.
      return { version: "0.43.2", latest: "0.44.0", update_available: true, install_spec: "github:azure-id/orc", check_disabled: false };
    case "/api/where":
      return where;
    case "/api/doctor":
      return doctor;
    case "/api/config":
      return config;
    case "/api/config/profiles":
      return {
        profiles: [
          { name: "solo-fast", desc: "One person, moving fast, reads their own diffs. Fewer gates, bigger waves.", keys: { max_wave_tasks: 4, batch_pause_every: 3 }, changes: [{ key: "batch_pause_every", from: 2, to: 3 }] },
          { name: "balanced", desc: "Today's defaults. Change nothing unless you know why.", keys: { max_wave_tasks: 3 }, changes: [{ key: "max_wave_tasks", from: 4, to: 3 }] },
          { name: "paranoid", desc: "Shared codebase, real users. Every gate on, small waves, pause often.", keys: { max_wave_tasks: 2, security_review: "on" }, changes: [{ key: "max_wave_tasks", from: 4, to: 2 }, { key: "security_review", from: "off", to: "on" }] },
          { name: "token-lean", desc: "Big repo, tight budget. Narrow scans, shallow analysis.", keys: { max_scouts: 1 }, changes: [{ key: "max_scouts", from: 3, to: 1 }] },
        ],
      };
    case "/api/config/recommend":
      return {
        recommended: "paranoid",
        desc: "Shared codebase, real users. Every gate on, small waves, pause often.",
        reasons: ["a real `npm test` script exists — gates have something to check", "CI is configured — this repo is shared, not a scratchpad", "7 contributors in history — coordination cost is real", "a project wiki exists — grounding is already cheap"],
        scores: { "solo-fast": 0, paranoid: 3, "token-lean": 0 },
      };
    case "/api/overview":
      return { where, doctor, wiki, patterns: patterns, runs_total: runs.total, waiting: ["merchant-notifications", "refund-webhook-retry"], diy, pact, boundary, wiki_debt: wikiDebt };
    case "/api/pact":
      return pact;
    case "/api/boundary":
      return boundary;
    case "/api/handoff":
      return handoff;
    case "/api/wiki/plan":
      return wikiPlan;
    case "/api/wiki/debt":
      return wikiDebt;
    case "/api/wiki/usage":
      return wikiUsage;
    case "/api/budget/forecast":
      // No plan path → the exit-3 "no forecast possible" state, which is what a
      // first-time user sees and therefore has to be designed too.
      return q && q.plan
        ? budgetForecast
        : { ok: false, reason: "no-plan", hint: "pick a plan file — a forecast from a sentence is a guess that looks computed" };
    case "/api/budget/rates":
      return budgetRates;
    case "/api/budget/actual":
      return { ok: true, run: "store-credit", lane: "orc", trace: "run-orc-store-credit-100826-093012.txt", rows: [{ band: "[40,55)", dispatches: 3, forecast_weighted: 96000, actual_weighted: 138000, diff_pct: 44, tokens: { input: 9000, cache_write: 61000, cache_read: 121000, output: 11000 } }, { band: "[70,80)", dispatches: 1, forecast_weighted: 121000, actual_weighted: 304000, diff_pct: 151, tokens: { input: 12000, cache_write: 98000, cache_read: 240000, output: 24000 } }], actual: { tokens: { input: 21000, cache_write: 159000, cache_read: 361000, output: 35000 }, raw: 576000, weighted: 251100, usd: 7.02 }, cache_read_share: 0.71, unattributed: { blocks: 12, tokens: { input: 900, cache_write: 12000, cache_read: 24000, output: 1100 } }, joined: 17, dispatches: 19 };
    case "/api/aftermath":
      return aftermath;
    case "/api/export":
      return exportState;
    case "/api/runs":
      return runs;
    case "/api/run":
      return q && q.slug && q.slug !== runDetail.slug
        ? { ...runDetail, slug: q.slug, status: "done", resume: null, stands: { lane: "/orc-mini", phase: "", wave: "" } }
        : runDetail;
    case "/api/wiki":
      return wiki;
    case "/api/wiki/impact":
      return wikiImpact;
    case "/api/patterns":
      return patterns;
    case "/api/gotchas":
      return gotchas;
    case "/api/stats":
      return stats;
    case "/api/diy":
      return diy;
    case "/api/crosslink":
      return crosslink;
    case "/api/mocks":
      return mocks;
    case "/api/mock":
      return mockDetail;
    case "/api/stack":
      return { slugs: ["billing-split"], slug: "billing-split", ambiguous: false, plan: { slug: "billing-split", ready: false, exists: true, plan_path: PROJECT + "/stacked-pr/billing-split/stack-plan.md", layers: 4, ticket: "PAY-2214", problems: ["3 unfilled placeholders (e.g. <risk> <owner> <base>)"] } };
    case "/api/changelog":
      // Two entries, so the modal has to handle a LIST rather than one release —
      // skipping a version is the normal case, not the exotic one.
      return {
        version: "0.43.2",
        latest: "0.44.0",
        update_available: true,
        source: "https://raw.githubusercontent.com/azure-id/orc/main/CHANGELOG.md",
        check_disabled: false,
        fetched: true,
        entries: [
          {
            version: "0.44.0",
            date: "2026-08-09",
            title: "`orc ui`: the guided tour, and an upgrade you can read first",
            body:
              "**A version number is not a reason to upgrade.** The banner now fetches the\n" +
              "changelog from the same branch `orc upgrade` installs from, so what you read\n" +
              "and what you get can never be different releases.\n\n" +
              "- First-run tour over the key surfaces, skippable per project\n" +
              "- The upgrade spotlight clears when you actually reach the preview",
          },
          {
            version: "0.43.3",
            date: "2026-08-08",
            title: "settings stop being a wall",
            body: "Collapsible tiers and a filter across all of them at once.",
          },
        ],
      };
    case "/api/crosslink/kinds":
      // A short slice of the real catalog — enough to design the picker with,
      // including the nested `auth/oidc` whose directory is sanitised to
      // `auth-oidc` on disk. A picker that never sees one cannot be trusted.
      return { kinds: ["grpc", "rest-endpoint", "graphql", "websocket", "message-queue", "webhook", "shared-db", "auth/oidc"] };
    case "/api/experiment":
      // can_launch:false is the fixture-mode state on purpose — a disabled
      // launch button with a reason is a thing that needs designing.
      return {
        lanes: [
          { id: "orc", cmd: "/orc", what: "Full pipeline: intake → plan → scored parallel waves → review → verify → ship." },
          { id: "orc-quick", cmd: "/orc-quick", what: "Ask for anything. Look → ask once → do, and it always asks which agent." },
          { id: "orc-mini", cmd: "/orc-mini", what: "One executor, smoke gate, ship. No full review or verify phase." },
          { id: "orc-wiki", cmd: "/orc-wiki", what: "Build or refresh the project wiki. Expensive; always asks first." },
        ],
        project_root: "/example/project",
        platform: "linux",
        can_launch: false,
      };
    case "/api/learn":
      return { sections: require("../onboarding-content.js").SECTIONS };
    // The mocked runs are package content, identical on every machine and
    // needing no project — so fixture mode serves the REAL catalogue. A canned
    // copy here could only ever be a worse version of a file sitting next to
    // it, and it would be the one thing on this panel that could go stale.
    case "/api/mockruns":
      return require("../mockrun-catalog.js").catalogue();
    case "/api/mockrun": {
      const doc = require("../mockrun-catalog.js").get(String((q && q.slug) || ""));
      return doc ? { ...doc, found: true } : { slug: String((q && q.slug) || ""), found: false };
    }
    case "/api/fs/list":
      // The folder picker on canned data. It carries the states that are hard
      // to reach on a tidy machine: a plain folder, a git repo WITHOUT a wiki
      // (the case that saves an inert edge), a repo with one, and the project
      // itself — which the picker must refuse.
      return {
        path: "/example",
        parent: "/",
        sep: "/",
        home: "/home/dev",
        project_root: PROJECT,
        is_project_root: false,
        relative: "..",
        truncated: false,
        dirs: [
          { name: "payments-core", path: "/example/payments-core", is_repo: true, has_wiki: true },
          { name: "storefront-web", path: "/example/storefront-web", is_repo: true, has_wiki: false },
          { name: "ledger-batch", path: "/example/ledger-batch", is_repo: true, has_wiki: false },
          { name: "project", path: PROJECT, is_repo: true, has_wiki: true },
          { name: "scratch", path: "/example/scratch", is_repo: false, has_wiki: false },
        ],
      };
    case "/api/maintenance":
      return {
        actions: [
          { id: "update", label: "Re-copy this package's payload over the installed one", command: "orc update", network: false, names_files: false },
          { id: "prune", label: "Update AND delete ORC-named orphans from a pre-manifest install", command: "orc update --prune", network: false, names_files: true },
          { id: "fix", label: "Apply every fix orc doctor found (= update + prune + settings re-merge)", command: "orc doctor --fix", network: false, names_files: false },
          { id: "upgrade", label: "Fetch the LATEST package from the network, then apply it", command: "orc upgrade", network: true, names_files: false },
          { id: "update-global", label: "Re-copy this package's payload over the GLOBAL install in ~/.claude", command: "orc update --global", network: false, names_files: false, advanced: true },
        ],
      };
    case "/api/maintenance/preview":
      return {
        action: q.action,
        label: "Preview (fixtures)",
        command:
          "orc " +
          (q.action === "prune"
            ? "update --prune"
            : q.action === "fix"
              ? "doctor --fix"
              : q.action === "upgrade"
                ? "upgrade"
                : q.action === "update-global"
                  ? "update --global"
                  : "update"),
        network: q.action === "upgrade",
        names_files: q.action === "prune",
        advanced: q.action === "update-global",
        preview_command: q.action === "update-global" ? "orc doctor --global" : "orc doctor",
        preview: doctor,
        waiting_runs: ["merchant-notifications", "refund-webhook-retry"],
        dirty_tree: true,
      };
    case "/api/job":
      return { id: null, running: false };
    default:
      return undefined;
  }
};

// ── the states below are referenced above; declared after for readability ───

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
const diy = {
  state: "STALE",
  reason: "config changed since the last compile; orc updated 0.41.0 → 0.43.0 — run `orc diy compile`",
  triggers: ["config changed since the last compile", "orc updated 0.41.0 → 0.43.0"],
  configured: true,
  paths: { config: PROJECT + "/.claude/orc-diy.config.yaml", compiled: PROJECT + "/.claude/orc/diy/FLOW-COMPILED.md", lock: PROJECT + "/.claude/orc/diy/flow.lock.json" },
  // `options` is the key's closed set (v0.44.0) and the panel turns it into a
  // dropdown. The fixture carries all three shapes on purpose: an ordinary
  // enum, a NUMERIC set (rubric_bands — every band, not just the current one),
  // `options: null` free text (flow_name), and the ugly one — `fixed_executor`
  // holding the empty value, which is NOT in its own option list.
  keys: [
    { key: "flow_name", value: "my-lean", default: "custom", is_set: true, desc: "Name shown in the compiled flow.", options: null },
    { key: "wiki_gate", value: "notice", default: "notice", is_set: false, desc: "Wiki freshness at preflight.", options: ["notice", "off", "hard"] },
    { key: "analyze", value: "off", default: "full", is_set: true, desc: "Analyst phase.", options: ["auto", "off", "mini", "full"] },
    { key: "planning", value: "own-planner", default: "auto", is_set: true, desc: "Planning route.", options: ["auto", "own-planner", "superpowers", "openspec"] },
    { key: "pattern", value: "ask", default: "ask", is_set: false, desc: "Code-pattern gate on a cache miss.", options: ["ask", "off", "on"] },
    { key: "scoring", value: "on", default: "on", is_set: false, desc: "Rubric scoring.", options: ["on", "off"] },
    { key: "fixed_executor", value: "", default: "", is_set: false, desc: "Executor used for every task when scoring is off.", options: ["orc-executor-haiku-4-5", "orc-executor-sonnet-4-6-med", "orc-executor-sonnet-5-high", "orc-executor-opus-4-8-high", "orc-executor-opus-5-high"] },
    { key: "review", value: "blocking-only", default: "full", is_set: true, desc: "Review phase depth.", options: ["on", "off", "blocking-only"] },
    { key: "security", value: "off", default: "off", is_set: false, desc: "Security pass.", options: ["off", "ask", "on", "always"] },
    { key: "verify", value: "smoke", default: "full", is_set: true, desc: "Verification depth.", options: ["full", "off", "smoke"] },
    { key: "testgen", value: "off", default: "off", is_set: false, desc: "Test-authoring phase.", options: ["off", "ask", "on"] },
    { key: "mock_example", value: "ask", default: "ask", is_set: false, desc: "Post-verify mocked example.", options: ["ask", "on", "off"] },
    { key: "ship_mode", value: "ask", default: "ask", is_set: false, desc: "Terminal ship behavior.", options: ["ask", "commit", "pr", "report-only"] },
    { key: "summary", value: "short", default: "full", is_set: true, desc: "Summary depth.", options: ["full", "off", "short"] },
    { key: "tdd", value: "on", default: "on", is_set: false, desc: "TDD gate.", options: ["on", "off"] },
    { key: "rubric_bands", value: 5, default: 5, is_set: false, desc: "Scoring granularity (scoring on only).", options: [2, 3, 4, 5, 6, 7, 8] },
    { key: "session_tier", value: "opus-4-8-high", default: "opus-4-8-high", is_set: false, desc: "Declared main-session tier.", options: ["sonnet-4-6-high", "opus-4-7-high", "opus-4-8-high", "opus-5-high", "opus-5-max", "fable-5-high"] },
  ],
  // The bootstrap catalog, empty name first (= full-lane defaults, no --preset
  // flag). `lean` is ACTIVE here even though this flow was renamed away from
  // it — that is the state the "in use" chip exists for, and you cannot design
  // it against a catalog where nothing matches.
  presets: [
    { name: "", changes: {}, active: false },
    { name: "lean", changes: { analyze: "off", review: "blocking-only", verify: "smoke", summary: "short", flow_name: "lean" }, active: true },
    { name: "paranoid", changes: { analyze: "full", security: "always", testgen: "on", verify: "full", flow_name: "paranoid" }, active: false },
    { name: "solo-fast", changes: { scoring: "off", fixed_executor: "orc-executor-sonnet-5-high", review: "off", verify: "smoke", autonomy: "semi", flow_name: "solo-fast" }, active: false },
  ],
  errors: [],
  warnings: ["tdd is on but verify is smoke — the red proof gates less than it could"],
  // The stepper's data. A lean flow is the useful fixture here precisely
  // because it is half switched off — you cannot design the red OFF state
  // against a pipeline where every phase is on.
  steps: [
    { block: "header", label: "intake", key: null, value: "", on: true, note: "self-gate" },
    { block: "trace", label: "trace", key: null, value: "", on: true, note: "always on" },
    { block: "wiki", label: "wiki", key: "wiki_gate", value: "notice", on: true, note: "notice" },
    { block: "analyze", label: "analyze", key: "analyze", value: "off", on: false, note: "off" },
    { block: "planning", label: "plan", key: "planning", value: "own-planner", on: true, note: "own-planner" },
    { block: "pattern", label: "pattern", key: "pattern", value: "ask", on: true, note: "ask" },
    { block: "scoring", label: "score", key: "scoring", value: "on", on: true, note: "on" },
    { block: "execution", label: "execute", key: null, value: "", on: true, note: "scored" },
    { block: "review", label: "review", key: "review", value: "blocking-only", on: true, note: "blocking-only" },
    { block: "security", label: "security", key: "security", value: "off", on: false, note: "off" },
    { block: "verify", label: "verify", key: "verify", value: "smoke", on: true, note: "smoke" },
    { block: "testgen", label: "testgen", key: "testgen", value: "off", on: false, note: "off" },
    { block: "mock-example", label: "mock", key: "mock_example", value: "ask", on: true, note: "ask" },
    { block: "ship", label: "ship", key: "ship_mode", value: "ask", on: true, note: "ask" },
    { block: "summary", label: "summary", key: "summary", value: "short", on: true, note: "short" },
  ],
  score_table: "| Score | Executor agent |\n|-------|----------------|\n| [0,30) | orc-executor-haiku-4-5 |\n| [90,100] | orc-executor-opus-4-8-high |",
};

const crosslink = {
  configured: true,
  self: "checkout-api",
  config_path: PROJECT + "/.claude/orc-crosslink.config.yaml",
  nodes: [
    { name: "payments-core", repo_path: "../payments-core", resolved_path: "/example/payments-core", kinds: ["http", "auth/oidc"], direction: "consume", provider: { state: "wiki", last_scan: "2026-07-28", tier: "FRESH", distance: 4, tags: 11 } },
    { name: "storefront-web", repo_path: "../storefront-web", resolved_path: "/example/storefront-web", kinds: ["http"], direction: "provide", provider: { state: "wiki", last_scan: "2026-03-02", tier: "STALE", distance: 210, tags: 0 } },
    { name: "ledger-batch", repo_path: "../ledger-batch", resolved_path: "/example/ledger-batch", kinds: ["events"], direction: "none", provider: { state: "missing" } },
  ],
  links: [
    { from: "self", to: "payments-core", via: "http", relation: "we-call" },
    { from: "storefront-web", to: "self", via: "http", relation: "they-call-us" },
  ],
  needs_baseline: PROJECT + "/.claude/orc/crosslink/needs.json",
};

const mocks = {
  root: PROJECT + "/mock-examples",
  total: 2,
  mocks: [
    { slug: "merchant-notifications", dir: PROJECT + "/mock-examples/merchant-notifications", mtime_ms: Date.now() - 40 * 60 * 1000, has_readme: true },
    { slug: "invoice-pdf-export", dir: PROJECT + "/mock-examples/invoice-pdf-export", mtime_ms: Date.now() - 5 * 24 * 60 * 60 * 1000, has_readme: false },
  ],
};

const mockDetail = {
  root: PROJECT + "/mock-examples",
  slug: "merchant-notifications",
  found: true,
  dir: PROJECT + "/mock-examples/merchant-notifications",
  mtime_ms: Date.now() - 40 * 60 * 1000,
  readme:
    "# Mocked example — merchant notifications\n\n" +
    "A runnable slice of the change with the payment gateway stubbed out.\n\n" +
    "## Run it\n\n```\nnode run.js\n```\n\n" +
    "## What is mocked\n\n- the gateway webhook signature check\n- the SMTP transport (writes to `out/`)\n",
  readme_path: PROJECT + "/mock-examples/merchant-notifications/EXAMPLE.md",
  files: [
    { path: "EXAMPLE.md", size: 412 },
    { path: "run.js", size: 1830 },
    { path: "fixtures/webhook.json", size: 604 },
    { path: "mocks/gateway.js", size: 921 },
  ],
  truncated: false,
};

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
