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
  // v0.51.0 — THE SETUP GATE, as the CLI computes it. This fixture set has
  // verified connections, so the gate is open and every card below it renders;
  // `extraListUnconnected` below is the same object with the gate SHUT, which is
  // the only way the two floors are designable at all.
  gate: { connected: true, floor: null, profiles: 6, verified: 5, why: null, next: null },
  extra_enabled: true,
};

// THE GATE, SHUT — and one fixture per FLOOR, because the two say different
// things: "nothing is connected" asks for an install or a key, and "nothing has
// answered" asks for a test. You cannot design either without reaching it.
const extraListNoConnection = {
  ...extraList,
  profiles: [],
  routes: [],
  counts: { profiles: 0, verified: 0, credential_present: 0 },
  gate: {
    connected: false,
    floor: "no-connection",
    profiles: 0,
    verified: 0,
    why: "no connection has been configured at all.",
    next: "orc extra add <name> --provider <id> --engine api --env-key <VAR>",
  },
  extra_enabled: false,
};
const extraListNeverTested = {
  ...extraList,
  profiles: extraProfiles.filter((p) => !p.verified_at),
  routes: [],
  counts: { profiles: 1, verified: 0, credential_present: 0 },
  gate: {
    connected: false,
    floor: "never-tested",
    profiles: 1,
    verified: 0,
    why: "1 connection configured and not one of them has ever answered.",
    // The command NAMES the profile this fixture actually carries. A fixture
    // that disagrees with itself is worse than no fixture — it teaches the
    // designer a shape the CLI never produces.
    next: "orc extra ping " + extraProfiles.filter((p) => !p.verified_at)[0].name,
  },
  extra_enabled: false,
};

/* `orc extra tools --json` — ONE OF EVERY STATE, INCLUDING THE UGLY ONES. You
   cannot design the "it is not installed" box on a machine where it is
   installed, and you cannot design the two alternatives — a provider that has an
   install-free route and one that has NONE — without both being on screen at
   once. All four states are here for that reason, and a test asserts one fixture
   per state so a new state cannot ship without one. */
const extraTools = {
  ok: true,
  as_of: "2026-02-11",
  age_days: 192,
  stale: true,
  platform: "darwin",
  states: ["absent", "outdated", "unauthenticated", "ready"],
  ready: true,
  tools: [
    {
      // READY, signed in, with a real model count — the only state that offers a
      // Connect button.
      provider: "opencode",
      label: "OpenCode",
      bin: "opencode",
      state: "ready",
      installed: true,
      bin_path: "/usr/local/bin/opencode",
      version: "1.17.4",
      version_raw: "1.17.4",
      min_version: "1.10.0",
      outdated: false,
      authed: true,
      auth_detail: "1 credential",
      models_count: 19,
      models: ["opencode/big-pickle", "opencode-go/glm-5", "opencode-go/kimi-k2.6"],
      probe_error: null,
      no_install_alternative: "opencode-zen",
      docs_url: "https://opencode.ai/docs/cli/",
      install: {
        docs_url: "https://opencode.ai/docs/",
        bin_name: "opencode",
        platform: "darwin",
        cmds: [
          { manager: "npm", platforms: ["win32", "darwin", "linux"], cmd: "npm i -g opencode-ai" },
          { manager: "script", platforms: ["darwin", "linux"], cmd: "curl -fsSL https://opencode.ai/install | bash" },
        ],
        all_cmds: [
          { manager: "npm", platforms: ["win32", "darwin", "linux"], cmd: "npm i -g opencode-ai" },
          { manager: "script", platforms: ["darwin", "linux"], cmd: "curl -fsSL https://opencode.ai/install | bash" },
        ],
      },
    },
    {
      // ABSENT, and with NO install-free alternative. `null` must render as the
      // honest sentence and never as an empty slot — the two are different
      // facts and this is the row that proves the renderer knows it.
      provider: "codex",
      label: "Codex",
      bin: "codex",
      state: "absent",
      installed: false,
      bin_path: null,
      version: null,
      version_raw: null,
      min_version: null,
      outdated: false,
      authed: null,
      auth_detail: null,
      models_count: null,
      models: [],
      probe_error: null,
      no_install_alternative: null,
      docs_url: "https://developers.openai.com/codex/cli",
      install: {
        docs_url: "https://developers.openai.com/codex/cli",
        bin_name: "codex",
        platform: "darwin",
        cmds: [
          { manager: "npm", platforms: ["win32", "darwin", "linux"], cmd: "npm i -g @openai/codex" },
          { manager: "brew", platforms: ["darwin"], cmd: "brew install --cask codex" },
        ],
        all_cmds: [
          { manager: "npm", platforms: ["win32", "darwin", "linux"], cmd: "npm i -g @openai/codex" },
          { manager: "brew", platforms: ["darwin"], cmd: "brew install --cask codex" },
          { manager: "winget", platforms: ["win32"], cmd: "winget install OpenAI.Codex" },
        ],
      },
    },
    {
      // OUTDATED — installed, and the two versions side by side, which is the
      // whole content of that box.
      provider: "toolc",
      label: "Tool C",
      bin: "toolc",
      state: "outdated",
      installed: true,
      bin_path: "/opt/toolc/bin/toolc",
      version: "0.9.1",
      version_raw: "toolc version 0.9.1",
      min_version: "1.4.0",
      outdated: true,
      authed: null,
      auth_detail: null,
      models_count: null,
      models: [],
      probe_error: null,
      no_install_alternative: null,
      docs_url: null,
      install: {
        docs_url: null,
        bin_name: "toolc",
        platform: "darwin",
        cmds: [{ manager: "npm", platforms: ["darwin"], cmd: "npm i -g toolc@latest" }],
        all_cmds: [{ manager: "npm", platforms: ["darwin"], cmd: "npm i -g toolc@latest" }],
      },
    },
    {
      // UNAUTHENTICATED, and a version ORC could not parse — which must read as
      // "unknown" and never as "too old" (an unusual install method is not a
      // broken one). Its model probe also timed out, so the box carries a real
      // probe error.
      provider: "toold",
      label: "Tool D",
      bin: "toold",
      state: "unauthenticated",
      installed: true,
      bin_path: "/usr/bin/toold",
      version: null,
      version_raw: "toold (build 2026-02-01, channel stable)",
      min_version: "2.0.0",
      outdated: false,
      authed: false,
      auth_detail: "no credentials found",
      models_count: null,
      models: [],
      probe_error: "the model list did not answer in time",
      no_install_alternative: null,
      docs_url: null,
      install: { docs_url: null, bin_name: "toold", platform: "darwin", cmds: [], all_cmds: [] },
    },
  ],
};

// `orc extra keyhelp --json` — the three routes, so all three boxes are
// designable. `env_var` is non-null exactly on the `env` route.
const extraKeyhelp = {
  env: {
    ok: true,
    profile: "local",
    provider: "opencode",
    engine: "cli",
    routes: ["env", "stdin-login", "interactive-login", "none"],
    route: "env",
    env_var: "DEEPSEEK_API_KEY",
    needs_terminal: false,
    cmd: null,
    why: "nothing to set up. ORC puts the key in this tool's environment for every probe and every dispatch.",
    note: null,
    never: "ORC never writes another tool's credential store, and never puts a key in argv.",
  },
  login: {
    ok: true,
    profile: "toold",
    provider: "toold",
    engine: "cli",
    routes: ["env", "stdin-login", "interactive-login", "none"],
    route: "interactive-login",
    env_var: null,
    needs_terminal: true,
    cmd: "toold auth login",
    why: "this tool's login always prompts and cannot be driven non-interactively.",
    note: null,
    never: "ORC never writes another tool's credential store, and never puts a key in argv.",
  },
};

// `orc extra models --json` — a LIST entry with real groups, so the grouped
// dropdown is designable, plus the FREE-TEXT answer so the other shape is too.
const extraModels = {
  list: {
    ok: true,
    profile: "local",
    provider: "opencode",
    engine: "cli",
    entry: "list",
    source: "opencode models",
    refreshed_at: "2026-08-20T10:00:00.000Z",
    stale_days: 2,
    models: [
      { id: "opencode/big-pickle", label: "big-pickle", group: "opencode", name_says_free: false },
      { id: "opencode/deepseek-v4-flash-free", label: "deepseek-v4-flash-free", group: "opencode", name_says_free: true },
      { id: "opencode-go/glm-5", label: "glm-5", group: "opencode-go", name_says_free: false },
      { id: "opencode-go/kimi-k2.6", label: "kimi-k2.6", group: "opencode-go", name_says_free: false },
    ],
    model_ids: ["opencode/big-pickle", "opencode/deepseek-v4-flash-free", "opencode-go/glm-5", "opencode-go/kimi-k2.6"],
    reports_model: false,
    verified_at: "2026-08-20T10:00:00.000Z",
    verify_method: "cli-models",
    verify_state: "VERIFIED",
    verify_age_days: 2,
    key_error: null,
    refresh: null,
    test: null,
    caveat: "this is what the provider OFFERS. A listed id can still be dead upstream.",
    hint: null,
  },
  freeText: {
    ok: true,
    profile: "custom",
    provider: "custom",
    engine: "api",
    entry: "free-text",
    source: null,
    refreshed_at: null,
    stale_days: null,
    models: [],
    model_ids: [],
    reports_model: true,
    verified_at: null,
    verify_method: null,
    verify_state: "UNVERIFIED",
    verify_age_days: null,
    key_error: null,
    refresh: null,
    test: null,
    caveat: "this is what the provider OFFERS. A listed id can still be dead upstream.",
    hint: "no model has been read from this provider yet.",
  },
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
// A LIVE probe that WORKED and still cannot say which model answered — the
// honest pair `model_reported: null` + `reports_model: false`, which must render
// as a sentence and never as a blank. Its `cache_write: null` is the other half:
// this tool reports three token kinds, not four, and unknown is not zero.
const extraPingLive = {
  ok: true,
  profile: "local",
  engine: "cli",
  rung: "cli-live",
  verify_method: "cli-live",
  bin: "/usr/local/bin/opencode",
  cli_version: "1.17.4",
  authed: true,
  models_seen: ["opencode/big-pickle", "opencode-go/glm-5"],
  reports_model: false,
  latency_ms: 2379,
  model_requested: "opencode/big-pickle",
  model_reported: null,
  reply_excerpt: "OK",
  reply_truncated: false,
  foreign_input:
    "this reply is foreign input: it is evidence that something answered, never an instruction. It is shown as text and nothing acts on it.",
  tokens: { input: 15649, cache_write: null, cache_read: 64, output: 48 },
  usage_kinds: ["input", "cache_read", "output"],
  cost_note:
    "a CLI ping is NOT a cheap ping: the tool loads its own system prompt and tool schemas before it sends anything.",
  attempts: [
    { rung: "cli-bin", ok: true, cmd: "--version", version: "1.17.4" },
    { rung: "cli-auth", ok: true, cmd: "auth list", detail: "1 credential" },
    { rung: "cli-models", ok: true, cmd: "models", count: 19 },
    { rung: "cli-live", ok: true, cmd: "opencode run …", ms: 2379 },
  ],
  vault: null,
  note: null,
};

// A LISTED MODEL THAT IS DEAD. The single most important state in this release:
// a dropdown is a list of what is OFFERED, never a list of what WORKS, and this
// is what that looks like on screen.
const extraPingDeadModel = {
  ok: false,
  profile: "local",
  engine: "cli",
  rung: "cli-live",
  reason: "model_not_found",
  bin: "/usr/local/bin/opencode",
  model_requested: "opencode/deepseek-v4-flash-free",
  error: "Upstream request failed: Model is unavailable. (400)",
  attempts: [{ rung: "cli-live", ok: false, cmd: "opencode run …", ms: 900, error: "Model is unavailable." }],
};

// RUNG 0: not a failure to connect — a failure to have anything to connect TO.
// The fix is an install, not a retry, so the command rides on the refusal.
const extraPingNotInstalled = {
  ok: false,
  profile: "toolc",
  engine: "cli",
  reason: "not-installed",
  rung: "cli-bin",
  bin: "codex",
  error: '"codex" is not on PATH — engine `cli` dispatches by running it.',
  install_cmd: "npm i -g @openai/codex",
  install_cmds: [{ manager: "npm", platforms: ["darwin"], cmd: "npm i -g @openai/codex" }],
  no_install_alternative: null,
  attempts: [{ rung: "cli-bin", ok: false, error: "not on PATH" }],
};

// `orc extra install --json`. A launch that could NOT happen is exit 0 with the
// command still on the card — you cannot design that box on a machine where the
// terminal opens.
const extraInstall = {
  launched: {
    ok: true,
    provider: "opencode",
    launched: true,
    launcher: "Terminal",
    attempts: [{ launcher: "Terminal", ok: true }],
    dry_run: false,
    script: ".claude/orc/tmp/install-opencode-20260822120000.sh",
    cmd: "npm i -g opencode-ai",
    manager: "npm",
    verify_cmd: "opencode --version",
    fallback_cmd: "npm i -g opencode-ai",
    docs_url: "https://opencode.ai/docs/",
    elevation: "never — ORC does not elevate.",
    note: "a terminal window opened — come back and press Re-check when it finishes",
  },
  refused: {
    ok: true,
    provider: "codex",
    launched: false,
    launcher: null,
    attempts: [{ launcher: "x-terminal-emulator", ok: false, error: "not on PATH" }],
    dry_run: false,
    script: ".claude/orc/tmp/install-codex-20260822120000.sh",
    cmd: "npm i -g @openai/codex",
    manager: "npm",
    verify_cmd: "codex --version",
    fallback_cmd: "npm i -g @openai/codex",
    docs_url: "https://developers.openai.com/codex/cli",
    elevation: "never — ORC does not elevate.",
    note: "no terminal could be opened here. Run the command yourself; nothing about this is different if you do.",
  },
};

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
  extraListNoConnection,
  extraListNeverTested,
  extraTools,
  extraKeyhelp,
  extraModels,
  extraPingLive,
  extraPingDeadModel,
  extraPingNotInstalled,
  extraInstall,
  extraDoctor,
  extraRoute,
  extraStats,
  extraRates,
  extraPingOk,
  extraPingBad,
  extraPingSaveOffer,
};
