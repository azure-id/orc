"use strict";
/* fixtures/extra.js — canned `orc extra … --json` for `orc ui --fixtures`.

   ONE OF EVERY STATE, including the ugly ones — you cannot design a `7 of 10
   wrong attempts` chip on a vault nobody has ever mistyped, and you cannot
   design the deleted-key card at all without deleting a key.

   Covered here: no key in the environment · never tested · tested and answering
   · tested too long ago · a key stored in the vault with a clean counter · the
   same with the counter part-used · a key the vault DELETED · a connection whose
   engine binary is missing · a stale catalog · overlapping route rows · a routed
   model the provider no longer lists.

   Shapes MUST match what `bin/cli.js --json` really emits. */

// `orc extra providers --json`. The catalog ships DATED and the fixture is
// deliberately past its staleness edge, because the warning banner is the half
// that needs designing — "recently dated" needs no design at all.
const extraProviders = {
  ok: true,
  path: "bin/providers.json",
  as_of: "2026-02-11",
  age_days: 192,
  stale: true,
  stale_after_days: 90,
  models: "never shipped — `orc extra ping` reads them from the provider",
  providers: [
    {
      id: "deepseek",
      label: "DeepSeek",
      engines: ["api", "claude-shim"],
      api_base: "https://api.deepseek.com",
      anthropic_base: "https://api.deepseek.com/anthropic",
      auth_env: "ANTHROPIC_AUTH_TOKEN",
      env_key_default: "DEEPSEEK_API_KEY",
      models_path: "/v1/models",
      context_tokens: null,
      regions: [],
      docs_url: "https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/",
      terms_url: "https://platform.deepseek.com/downloads/DeepSeek%20Open%20Platform%20Terms%20of%20Service.html",
      notes: "Peak / off-peak rates differ; the off-peak window is the cheap one.",
    },
    {
      id: "zai",
      label: "Z.ai (GLM)",
      engines: ["api", "claude-shim"],
      api_base: "https://api.z.ai/api/paas/v4",
      anthropic_base: "https://api.z.ai/api/anthropic",
      auth_env: "ANTHROPIC_AUTH_TOKEN",
      env_key_default: "ZAI_API_KEY",
      models_path: "/models",
      context_tokens: null,
      regions: [],
      docs_url: "https://docs.z.ai/scenario-example/develop-tools/claude",
      terms_url: "https://z.ai/terms",
      notes: null,
    },
    {
      // A provider with REGIONS, so the region line is designable.
      id: "minimax",
      label: "MiniMax",
      engines: ["api", "claude-shim"],
      api_base: "https://api.minimax.io/v1",
      anthropic_base: "https://api.minimax.io/anthropic",
      auth_env: "ANTHROPIC_AUTH_TOKEN",
      env_key_default: "MINIMAX_API_KEY",
      models_path: "/models",
      context_tokens: null,
      regions: [{ id: "cn", label: "mainland China" }],
      docs_url: "https://platform.minimax.io/docs/token-plan/claude-code",
      terms_url: "https://www.minimax.io/platform/protocol/terms-of-service",
      notes: null,
    },
    {
      // A provider with NO links at all — the tile has to survive that.
      id: "ollama",
      label: "Ollama (local)",
      engines: ["api", "claude-shim"],
      api_base: "http://localhost:11434",
      anthropic_base: "http://localhost:11434",
      auth_env: null,
      env_key_default: null,
      models_path: "/v1/models",
      context_tokens: null,
      regions: [],
      docs_url: null,
      terms_url: null,
      notes: "Runs on this machine. Nothing leaves it.",
    },
    {
      id: "custom",
      label: "Custom endpoint",
      engines: ["api", "claude-shim", "cli"],
      api_base: null,
      anthropic_base: null,
      auth_env: "ANTHROPIC_AUTH_TOKEN",
      env_key_default: null,
      models_path: "/v1/models",
      context_tokens: null,
      regions: [],
      docs_url: null,
      terms_url: null,
      notes: "Anything that speaks either protocol. You supply the base URL.",
    },
  ],
};

// One profile per state. `credential.vault` is null on an env-sourced profile
// and an object on a vaulted one — those are DIFFERENT facts and the panel must
// never flatten them together.
const extraProfiles = [
  {
    // Verified, answering, key in the environment: the healthy one.
    name: "cheap",
    provider: "deepseek",
    engine: "api",
    region: "default",
    cli: null,
    base_url: "https://api.deepseek.com",
    anthropic_base_url: "https://api.deepseek.com/anthropic",
    completions_path: null,
    auth_env: "ANTHROPIC_AUTH_TOKEN",
    credential: { source: "env", key_name: "DEEPSEEK_API_KEY", present: true, vault: null },
    verified_at: "2026-08-21T09:14:02.881Z",
    verify_method: "models",
    verify_base_url: "https://api.deepseek.com",
    latency_ms: 412,
    models_seen: ["deepseek-chat", "deepseek-reasoner"],
    model_map: null,
    tool_fidelity: { streams: true, tool_round_trip: true, cache_control: false },
    privacy: null,
    notes: null,
  },
  {
    // Verified once, too long ago. `extra-stale-verify` is the finding that
    // makes the chip amber — the panel never computes that itself.
    name: "glm",
    provider: "zai",
    engine: "claude-shim",
    region: "default",
    cli: null,
    base_url: "https://api.z.ai/api/paas/v4",
    anthropic_base_url: "https://api.z.ai/api/anthropic",
    completions_path: null,
    auth_env: "ANTHROPIC_AUTH_TOKEN",
    credential: { source: "vault", key_name: "glm", present: true, vault: { state: "stored", attempts_used: 0, wiped_at: null } },
    verified_at: "2026-07-30T16:41:55.002Z",
    verify_method: "completion",
    verify_base_url: "https://api.z.ai/api/anthropic",
    latency_ms: 1980,
    models_seen: ["glm-4.6", "glm-4.5-air"],
    model_map: null,
    tool_fidelity: null,
    privacy: null,
    notes: null,
  },
  {
    // A vault the user has mistyped into. THE COUNTDOWN toward a destructive
    // action is the whole reason this state has a fixture.
    name: "kimi",
    provider: "moonshot",
    engine: "api",
    region: "cn",
    cli: null,
    base_url: "https://api.moonshot.cn/v1",
    anthropic_base_url: "https://api.moonshot.cn/anthropic",
    completions_path: null,
    auth_env: "ANTHROPIC_AUTH_TOKEN",
    credential: { source: "vault", key_name: "kimi", present: true, vault: { state: "stored", attempts_used: 7, wiped_at: null } },
    verified_at: "2026-08-20T11:02:10.114Z",
    verify_method: "models",
    verify_base_url: "https://api.moonshot.cn/v1",
    latency_ms: 733,
    models_seen: ["kimi-k2-0905-preview"],
    model_map: null,
    tool_fidelity: null,
    privacy: null,
    notes: null,
  },
  {
    // The vault DELETED this one on purpose. `present: false` and a tombstone.
    name: "burned",
    provider: "stepfun",
    engine: "api",
    region: "default",
    cli: null,
    base_url: "https://api.stepfun.com/v1",
    anthropic_base_url: "https://api.stepfun.com/anthropic",
    completions_path: null,
    auth_env: "ANTHROPIC_AUTH_TOKEN",
    credential: { source: "vault", key_name: "burned", present: false, vault: { state: "wiped", attempts_used: 10, wiped_at: "2026-08-18T20:55:03.900Z" } },
    verified_at: "2026-08-01T08:20:00.000Z",
    verify_method: "models",
    verify_base_url: "https://api.stepfun.com/v1",
    latency_ms: 610,
    models_seen: [],
    model_map: null,
    tool_fidelity: null,
    privacy: null,
    notes: null,
  },
  {
    // Never tested, and the variable it reads is not set in this environment.
    // Two separate failures on one row, which is exactly how it looks in life.
    name: "router",
    provider: "openrouter",
    engine: "api",
    region: "default",
    cli: null,
    base_url: "https://openrouter.ai/api/v1",
    anthropic_base_url: null,
    completions_path: null,
    auth_env: "ANTHROPIC_AUTH_TOKEN",
    credential: { source: "env", key_name: "OPENROUTER_API_KEY", present: false, vault: null },
    verified_at: null,
    verify_method: null,
    verify_base_url: null,
    latency_ms: null,
    models_seen: [],
    model_map: null,
    // The one engine that can carry a policy at all.
    privacy: { zdr: true, data_collection: "deny", allow_fallbacks: false },
    notes: null,
  },
  {
    // Engine `cli`, whose binary is not on PATH. Verified means "the binary was
    // there once", which is why the CLI gives it its own verify_method.
    name: "local-cli",
    provider: "custom",
    engine: "cli",
    region: "default",
    cli: { bin: "opencode", agent: "build", attach: null, args: [] },
    base_url: null,
    anthropic_base_url: null,
    completions_path: null,
    auth_env: null,
    credential: { source: "env", key_name: "OPENCODE_API_KEY", present: true, vault: null },
    verified_at: "2026-08-19T07:31:44.000Z",
    verify_method: "cli-bin",
    verify_base_url: "/usr/local/bin/opencode",
    latency_ms: null,
    models_seen: [],
    model_map: null,
    tool_fidelity: null,
    privacy: null,
    notes: null,
  },
];

// `orc extra list --json`. The routes ride along here (the resolver reads both
// halves out of one ledger), and two of them OVERLAP on purpose.
const extraList = {
  ok: true,
  ledger: ".claude/orc/extra.json",
  exists: true,
  catalog_as_of: "2026-02-11",
  catalog_stale: true,
  profiles: extraProfiles,
  routes: [
    { from: 0, to: 30, profile: "cheap", model: "deepseek-chat", small_model: null, max_turns: null },
    { from: 30, to: 55, profile: "glm", model: "glm-4.6", small_model: null, max_turns: null },
    // Overlaps the row above — the resolver takes the first match, which is not
    // a decision anybody made.
    { from: 50, to: 60, profile: "kimi", model: "kimi-k2-0905-preview", small_model: null, max_turns: 12 },
    // Routed to a model the last ping did not list.
    { from: 60, to: 70, profile: "cheap", model: "deepseek-coder", small_model: null, max_turns: null },
  ],
  counts: { profiles: 6, verified: 5, credential_present: 4 },
};

// `orc extra doctor --json`. Every finding class the CLI can emit, including
// the two that are NOT fixable and must say so rather than offering a button.
const extraDoctor = {
  ok: false,
  findings: [
    {
      id: "extra-catalog-stale",
      severity: "warn",
      message: "the shipped provider catalog is dated 2026-02-11 (192 days) — a base URL may have moved.",
      as_of: "2026-02-11",
      age_days: 192,
    },
    {
      id: "extra-stale-verify",
      severity: "warn",
      message: '"glm" last verified 22d ago (> extra_verify_max_days 7) — it still routes, and re-pings before wave 1.',
      profile: "glm",
      age_days: 22,
    },
    {
      id: "extra-vault-attempts",
      severity: "warn",
      message: '"kimi" has 7 failed passphrase attempts recorded — a correct unlock resets the count.',
      profile: "kimi",
      attempts_used: 7,
    },
    {
      id: "extra-vault-wiped",
      severity: "warn",
      message: '"burned" had its stored key deleted after 10 wrong passphrase attempts. Paste a new key from your provider.',
      profile: "burned",
      wiped_at: "2026-08-18T20:55:03.900Z",
    },
    {
      id: "extra-unverified",
      severity: "warn",
      message: '"router" has never verified — nothing will route to it.',
      profile: "router",
    },
    {
      id: "extra-missing-key",
      severity: "warn",
      message: '"router" reads OPENROUTER_API_KEY, which is not set in this environment.',
      profile: "router",
      source: "env",
    },
    {
      id: "extra-engine-unavailable",
      severity: "warn",
      message: '"local-cli" uses engine cli, but "opencode" is not on PATH.',
      profile: "local-cli",
      engine: "cli",
    },
    {
      // NOT FIXABLE. The install pepper is one of the two halves of the key and
      // cannot be regenerated, so the panel must say so rather than offer a fix
      // that cannot work.
      id: "extra-pepper-missing",
      severity: "warn",
      message:
        '"burned" is encrypted against the install pepper at ~/.claude/orc/extra-pepper, which is gone. The stored key CANNOT be recovered — paste a new one.',
      profile: "burned",
      fixable: false,
    },
    {
      id: "extra-route-overlap",
      severity: "warn",
      message:
        "route rows 30-55 and 50-60 overlap — the resolver takes the first match, which is not a decision anybody made.",
      rows: ["30-55", "50-60"],
    },
    {
      id: "extra-model-gone",
      severity: "warn",
      message:
        '60-70 routes to "deepseek-coder", which the last ping of "cheap" did not list. A vanished model is a 404 in the middle of a wave.',
      band: "60-70",
      profile: "cheap",
      model: "deepseek-coder",
    },
  ],
};

// `orc extra route --json`. The Claude fall-through is ALWAYS carried, split at
// the resolving Claude table's own edges, so a gap renders as the agent it
// actually resolves to. `extra_enabled` is true here — an ARMED table is the
// state that needs designing, and the CLI's own inert-note is the other one.
const extraRoute = {
  ok: true,
  extra_enabled: true,
  claude_table: "default",
  rows: [
    {
      from: 0, to: 30, band: "[0,30)", via: "extra",
      profile: "cheap", model: "deepseek-chat", small_model: null, max_turns: null,
      engine: "api", provider: "deepseek", verify_state: "VERIFIED", model_known: true,
    },
    {
      from: 30, to: 55, band: "[30,55)", via: "extra",
      profile: "glm", model: "glm-4.6", small_model: null, max_turns: null,
      engine: "claude-shim", provider: "zai", verify_state: "STALE", model_known: true,
    },
    { from: 55, to: 65, band: "[55,65)", via: "claude", agent: "orc-executor-sonnet-5-high" },
    {
      // A routed model the last ping did not list — the state that becomes a
      // 404 in the middle of a wave if nothing shows it first.
      from: 65, to: 70, band: "[65,70)", via: "extra",
      profile: "cheap", model: "deepseek-coder", small_model: null, max_turns: null,
      engine: "api", provider: "deepseek", verify_state: "VERIFIED", model_known: false,
    },
    { from: 70, to: 80, band: "[70,80)", via: "claude", agent: "orc-executor-opus-4-7-high" },
    { from: 80, to: 90, band: "[80,90)", via: "claude", agent: "orc-executor-opus-4-8-high" },
    { from: 90, to: 100, band: "[90,100]", via: "claude", agent: "orc-executor-opus-5-high" },
  ],
  foreign: [],
  claude_fallthrough: [],
  counts: { foreign: 3, claude: 4 },
  note: null,
};
extraRoute.foreign = extraRoute.rows.filter((r) => r.via === "extra");
extraRoute.claude_fallthrough = extraRoute.rows.filter((r) => r.via === "claude");

// `orc extra stats --json`. Joined from the EXTRA trace lines, grouped by the
// pair a routing decision is made in — profile AND band.
//
// The ugly states are the point: one band whose vector is assembled from SIX of
// ten dispatches (four reported no counts at all), one whose provider has no
// rate at all so `usd` is null, one substitution, one reroute and one fallback.
// The `[65,70)` row is deliberately ABSENT so a routed band that nothing has run
// through can be designed — it must read `—`, never `0`.
const extraStats = {
  log_dir: ".claude/orc/logs",
  since: null,
  files_scanned: 14,
  dispatches: 23,
  bands: [
    {
      profile: "cheap",
      provider: "deepseek",
      band: "[0,30)",
      engines: { api: 15 },
      models: { "deepseek-chat": 15 },
      dispatches: 15,
      outcomes: { done: 13, partial: 1, failed: 0, fallback: 1 },
      usage: { input: 214_400, cache_write: 38_100, cache_read: 1_902_300, output: 61_400 },
      usage_reported: 15,
      usage_missing: 0,
      usd: 0.41,
    },
    {
      // The honest-partial state: six of ten reported counts, and a provider the
      // price table has no rate for, so `usd` is null rather than 0.
      profile: "glm",
      provider: "zai",
      band: "[30,55)",
      engines: { "claude-shim": 8 },
      models: { "glm-4.6": 8 },
      dispatches: 8,
      outcomes: { done: 5, partial: 1, failed: 1, fallback: 1 },
      usage: { input: 96_200, cache_write: 0, cache_read: 0, output: 28_900 },
      usage_reported: 6,
      usage_missing: 2,
      usd: null,
    },
  ],
  substitutions: [{ task: "T-07", requested: "glm-4.6", reported: "glm-4.5-air" }],
  reroutes: [{ task: "T-11", providers: ["deepseek", "novita"] }],
  fallbacks: [{ task: "T-04", reason: "timeout", agent: "orc-executor-sonnet-5-high" }],
  price_table: { as_of: "2026-05-02", age_days: 112, stale: true, path: "bin/pricing.json" },
  priced_dispatches: 15,
  unpriced_dispatches: 8,
  missing_rates: [{ pair: "zai/glm-4.6", dispatches: 8 }],
  hint: "`orc extra rates` prints the JSON to paste for every provider/model pair with no rate.",
};

// `orc extra rates --json`. The paste path: `bin/pricing.json` ships every
// models map EMPTY on purpose, because a figure that is wrong by 2x gets
// believed — so this is the skeleton, not a guess at a price.
const extraRates = {
  price_table: { as_of: "2026-05-02", age_days: 112, stale: true, path: "bin/pricing.json" },
  pairs: [
    { provider: "deepseek", model: "deepseek-chat", dispatches: 15, rate: { input: 0.28, cache_write: 0.28, cache_read: 0.028, output: 0.42 } },
    { provider: "zai", model: "glm-4.6", dispatches: 8, rate: null },
  ],
  missing: ["zai/glm-4.6"],
  paste: { providers: { zai: { models: { "glm-4.6": { input: 0, cache_write: 0, cache_read: 0, output: 0 } } } } },
  where: "point `orc config set budget_price_table <path>` at your own copy rather than editing the shipped file, so `orc update` never overwrites your rates",
  caveats: [{ provider: "deepseek", caveat: "peak and off-peak rates differ; this table carries the peak one." }],
};

// The connection test's two outcomes. These are the ONLY canned POST answers in
// the whole fixture set, and they exist because they are the two states this
// panel is most about and the two you cannot otherwise design: fixture mode
// never runs a real command, so without them the wire never lands and the result
// box is a shape nobody has looked at.
//
// GREEN for a connection the fixture says has answered before, RED for the one
// that never has — deterministic, and it matches what the list already claims.
const extraPingOk = {
  ok: true,
  profile: "cheap",
  engine: "api",
  base_url: "https://api.deepseek.com",
  rung: "models",
  verify_method: "models",
  latency_ms: 412,
  models_seen: ["deepseek-chat", "deepseek-reasoner"],
  attempts: [{ rung: "models", url: "https://api.deepseek.com/v1/models", status: 200, ok: true, ms: 412, error: null }],
  vault: null,
  note: null,
};
const extraPingBad = {
  ok: false,
  profile: "router",
  engine: "api",
  base_url: "https://openrouter.ai/api/v1",
  reason: "auth-failed",
  rung: "models",
  status: 401,
  error: "401 — the endpoint rejected the credential. OPENROUTER_API_KEY is not set in this environment.",
  attempts: [{ rung: "models", url: "https://openrouter.ai/api/v1/models", status: 401, ok: false, ms: 180, error: "401" }],
  // The reset the CLI performs: a failed test on a connection that had never
  // verified leaves NOTHING behind.
  profile_reverted: true,
};
// A green test on a PASTED key that has no passphrase yet — the state that opens
// the save modal, and the one place the self-destruct warning is designable.
const extraPingSaveOffer = {
  ...extraPingOk,
  profile: "pasted",
  vault: {
    stored: false,
    reason: "no-passphrase",
    error:
      "connection verified, but the key was NOT stored: a passphrase is required and none was given. " +
      "Re-run at a terminal, or pipe the key and the passphrase as two lines.",
  },
};

module.exports = {
  extraProviders,
  extraList,
  extraDoctor,
  extraRoute,
  extraStats,
  extraRates,
  extraPingOk,
  extraPingBad,
  extraPingSaveOffer,
};
