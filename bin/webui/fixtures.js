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
      return { where, doctor, wiki, patterns: patterns, runs_total: runs.total, waiting: ["merchant-notifications", "refund-webhook-retry"], diy };
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
    case "/api/learn":
      return { sections: require("../onboarding-content.js").SECTIONS };
    case "/api/maintenance":
      return {
        actions: [
          { id: "update", label: "Re-copy this package's payload over the installed one", command: "orc update", network: false, names_files: false },
          { id: "prune", label: "Update AND delete ORC-named orphans from a pre-manifest install", command: "orc update --prune", network: false, names_files: true },
          { id: "fix", label: "Apply every fix orc doctor found (= update + prune + settings re-merge)", command: "orc doctor --fix", network: false, names_files: false },
          { id: "upgrade", label: "Fetch the LATEST package from the network, then apply it", command: "orc upgrade", network: true, names_files: false },
        ],
      };
    case "/api/maintenance/preview":
      return {
        action: q.action,
        label: "Preview (fixtures)",
        command: "orc " + (q.action === "prune" ? "update --prune" : q.action === "fix" ? "doctor --fix" : q.action === "upgrade" ? "upgrade" : "update"),
        network: q.action === "upgrade",
        names_files: q.action === "prune",
        preview_command: "orc doctor",
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
  keys: [
    { key: "flow_name", value: "lean", default: "custom", is_set: true, desc: "Name shown in the compiled flow." },
    { key: "analyze", value: "off", default: "full", is_set: true, desc: "Analyst phase." },
    { key: "review", value: "blocking-only", default: "full", is_set: true, desc: "Review phase depth." },
    { key: "verify", value: "smoke", default: "full", is_set: true, desc: "Verification depth." },
    { key: "tdd", value: "on", default: "on", is_set: false, desc: "TDD gate." },
    { key: "session_tier", value: "opus-4-8-high", default: "opus-4-8-high", is_set: false, desc: "Declared main-session tier." },
  ],
  errors: [],
  warnings: ["tdd is on but verify is smoke — the red proof gates less than it could"],
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
