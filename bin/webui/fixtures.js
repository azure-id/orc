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

module.exports.get = function get(route, q) {
  switch (route) {
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
        source: "https://raw.githubusercontent.com/azure-id/orc/main/README.md",
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
