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
    // v0.52.0 — THE PASSPHRASE DEADLINE, computed by the CLI on read. One
    // fixture per state including the ugly ones: you cannot design an EXPIRED
    // chip, or the "not saved" one a run STOPS on, on a connection that is fine.
    session: null,
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
    session: { state: "ACTIVE", days_left: 27, expires_at: "2026-09-18T09:14:00.000Z", ttl_days: 30, created_at: "2026-08-19T09:14:00.000Z", last_used_at: "2026-08-22T07:40:00.000Z" },
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
    session: { state: "EXPIRING", days_left: 2, expires_at: "2026-08-24T09:14:00.000Z", ttl_days: 7, created_at: "2026-08-17T09:14:00.000Z", last_used_at: null },
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
    session: { state: "EXPIRED", days_left: 0, expires_at: "2026-08-18T09:14:00.000Z", ttl_days: 14, created_at: "2026-08-04T09:14:00.000Z", last_used_at: "2026-08-16T11:00:00.000Z" },
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
    // A VAULTED KEY WITH NO SAVED PASSPHRASE — verified, routed, and the state a
    // run STOPS on before wave 1. This is the connection the reported failure
    // was: green everywhere the panel looked, and locked the moment work
    // started. `not saved` KEEPS ITS SLOT for exactly that reason.
    name: "glm-air",
    provider: "zai",
    engine: "api",
    region: "default",
    cli: null,
    base_url: "https://api.z.ai/api/paas/v4",
    anthropic_base_url: "https://api.z.ai/api/anthropic",
    completions_path: null,
    auth_env: "ANTHROPIC_AUTH_TOKEN",
    credential: { source: "vault", key_name: "glm-air", present: true, vault: { state: "stored", attempts_used: 0, wiped_at: null } },
    verified_at: "2026-08-21T18:02:00.000Z",
    verify_method: "models",
    verify_base_url: "https://api.z.ai/api/paas/v4",
    session: { state: "ABSENT", days_left: null, expires_at: null, ttl_days: null, created_at: null, last_used_at: null },
    latency_ms: 810,
    models_seen: ["glm-4.5-air"],
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
    session: null,
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
    // v0.52.0 — THE THIRD CREDENTIAL SOURCE. The tool signs itself in, so ORC
    // holds no key at all: no variable to set, no vault, no passphrase and no
    // deadline. This is the profile the panel could not create until the add
    // form grew its third radio, and it is the one a locked run never should
    // have had.
    name: "oc-tool",
    provider: "opencode",
    engine: "cli",
    region: "default",
    cli: { bin: "opencode", agent: "build", attach: null, args: [] },
    base_url: null,
    anthropic_base_url: null,
    completions_path: null,
    auth_env: null,
    credential: { source: "tool", key_name: null, present: true, vault: null },
    verified_at: "2026-08-22T13:21:58.522Z",
    session: null,
    verify_method: "cli-live",
    verify_base_url: "/usr/local/bin/opencode",
    latency_ms: 2140,
    models_seen: ["opencode/big-pickle"],
    model_map: null,
    tool_fidelity: null,
    privacy: null,
    notes: null,
  },
  {
    // CONNECTED AND NEVER TESTED, against a tool that is installed and ready.
    // The card for this is not the Connect card and it is not the verified
    // card — it is the one that says "test it before ORC routes work here".
    name: "toole-new",
    provider: "toole",
    engine: "cli",
    region: "default",
    cli: { bin: "toole", agent: null, attach: null, args: [] },
    base_url: null,
    anthropic_base_url: null,
    completions_path: null,
    auth_env: null,
    credential: { source: "tool", key_name: null, present: true, vault: null },
    verified_at: null,
    session: null,
    verify_method: null,
    verify_base_url: null,
    latency_ms: null,
    models_seen: [],
    model_map: null,
    tool_fidelity: null,
    privacy: null,
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
    session: null,
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
  counts: { profiles: 9, verified: 7, credential_present: 7 },
  // v0.51.0 — THE SETUP GATE, as the CLI computes it. This fixture set has
  // verified connections, so the gate is open and every card below it renders;
  // `extraListUnconnected` below is the same object with the gate SHUT, which is
  // the only way the two floors are designable at all.
  gate: { connected: true, floor: null, profiles: 9, verified: 7, why: null, next: null },
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
      // v0.52.0 — READY IS NOT UNCONNECTED. This row is what the "connected as"
      // card is designed on, and it is why there is no Connect button on it.
      connected_profiles: [{ name: "oc-tool", verified_at: "2026-08-22T13:21:58.522Z", credential_source: "tool" }],
      connected: true,
      verified: true,
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
      connected_profiles: [],
      connected: false,
      verified: false,
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
      connected_profiles: [],
      connected: false,
      verified: false,
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
      connected_profiles: [],
      connected: false,
      verified: false,
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
    {
      // READY, and CONNECTED BUT NEVER TESTED — the state between "connect me"
      // and "connected as". It gets a Test button and no Connect button, because
      // another connection is not what this card is missing.
      provider: "toole",
      label: "Tool E",
      bin: "toole",
      state: "ready",
      connected_profiles: [{ name: "toole-new", verified_at: null, credential_source: "tool" }],
      connected: true,
      verified: false,
      installed: true,
      bin_path: "/usr/local/bin/toole",
      version: "3.2.0",
      version_raw: "toole 3.2.0",
      min_version: "3.0.0",
      outdated: false,
      authed: true,
      auth_detail: "1 credential",
      models_count: 4,
      models: ["toole/one", "toole/two"],
      probe_error: null,
      no_install_alternative: null,
      docs_url: null,
      install: { docs_url: null, bin_name: "toole", platform: "darwin", cmds: [], all_cmds: [] },
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
    // v0.52.0 — the per-OS instruction, PLACEHOLDER only. You cannot design this
    // box on a machine whose platform you are not on, which is why it is canned.
    env_set: {
      platform: "darwin",
      session: 'export DEEPSEEK_API_KEY="<your key>"',
      persist: "echo 'export DEEPSEEK_API_KEY=\"<your key>\"' >> ~/.zshrc",
      persist_note: "a new shell picks it up; the one you are in does not. This writes the value in PLAINTEXT to ~/.zshrc.",
      shell_file: "~/.zshrc",
      warning: null,
    },
    passphrase_env: null,
    key_env: null,
    vault_unlock: null,
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
      from: 0, to: 30, band: "[0,30)", range: "scores 0 to 29", meaning: "mechanical work in one or two files, with no new logic", via: "extra",
      profile: "cheap", model: "deepseek-chat", small_model: null, max_turns: null,
      engine: "api", provider: "deepseek", verify_state: "VERIFIED", model_known: true,
    },
    {
      from: 30, to: 55, band: "[30,55)", range: "scores 30 to 54", meaning: "a few files, following a pattern this repo already has", via: "extra",
      profile: "glm", model: "glm-4.6", small_model: null, max_turns: null,
      engine: "claude-shim", provider: "zai", verify_state: "STALE", model_known: true,
    },
    { from: 55, to: 65, band: "[55,65)", range: "scores 55 to 64", meaning: "several files, or a new surface, or logic that carries state", via: "claude", agent: "orc-executor-sonnet-5-high" },
    {
      // A routed model the last ping did not list — the state that becomes a
      // 404 in the middle of a wave if nothing shows it first.
      from: 65, to: 70, band: "[65,70)", range: "scores 65 to 69", meaning: "several files, or a new surface, or logic that carries state", via: "extra",
      profile: "cheap", model: "deepseek-coder", small_model: null, max_turns: null,
      engine: "api", provider: "deepseek", verify_state: "VERIFIED", model_known: false,
    },
    // v1.0.0 W4 — the route row above splits the default table's [65,90) band,
    // so the Claude remainder is [70,90) and it resolves to the SAME agent the
    // routed part displaced. That is the honest picture of an overlay: a row
    // takes a slice of a band, and what it did not take falls through.
    { from: 70, to: 90, band: "[70,90)", range: "scores 70 to 89", meaning: "wide reach or genuinely new work (a cited risk floors a task to 70, so it lands here or above)", via: "claude", agent: "orc-executor-opus-5-low" },
    { from: 90, to: 100, band: "[90,100]", range: "scores 90 to 100", meaning: "the hardest work: a novel algorithm, or wide reach with deep logic", via: "claude", agent: "orc-executor-opus-5-med" },
  ],
  foreign: [],
  claude_fallthrough: [],
  counts: { foreign: 3, claude: 4 },
  // R17 (v0.53.0) — the anchors every row's `meaning` is built from. The CLI
  // computes this; a plain-language label written in the panel would be the
  // panel deciding what a score means.
  band_meanings: [
    { from: 0, to: 30, meaning: "mechanical work in one or two files, with no new logic" },
    { from: 30, to: 55, meaning: "a few files, following a pattern this repo already has" },
    { from: 55, to: 70, meaning: "several files, or a new surface, or logic that carries state" },
    { from: 70, to: 85, meaning: "wide reach or genuinely new work (a cited risk floors a task to 70, so it lands here or above)" },
    { from: 85, to: 100, meaning: "the hardest work: a novel algorithm, or wide reach with deep logic" },
  ],
  note: null,
};
extraRoute.foreign = extraRoute.rows.filter((r) => r.via === "extra");
extraRoute.claude_fallthrough = extraRoute.rows.filter((r) => r.via === "claude");

/* `orc extra role list --json` (v0.55.0) — THE POSITIONS.

   ONE OF EVERY STATE, including the ugly ones, because you cannot design a
   STALE chip on a fresh connection:

     · routed + VERIFIED                  doc-writer
     · routed + STALE                     fast-executor
     · routed, profile lost verification  wiki-scanner-light  (held_back: unverified)
     · routed, model left models_seen     quick-executor      (model_known: false)
     · UNROUTED, keeps its slot           doc-checker · wiki-scanner-deep

   `quick-executor` is routed on purpose too, so the "offered, never applied"
   wording is designable — that lane ASKS, and the row has to say so without
   ever reading as "this is what runs". */
const extraRole = {
  ok: true,
  extra_enabled: true,
  slots: [
    {
      slot: "quick-executor", lane: "/orc-quick", routed: true,
      profile: "cheap", model: "deepseek-coder", small_model: null, max_turns: null,
      added_at: "2026-08-20T09:12:00Z", provider: "deepseek", engine: "api",
      verify_state: "VERIFIED", verify_age_days: 1, model_known: false,
      meaning: "the user picks the agent for every entry anyway, so a foreign worker is one more option on a menu they already read.",
      asks: true, announce_point: "the dispatch gate — offered as a third option, never a default",
      claude: { via: "claude", agent: "orc-executor-sonnet-4-6-med", agents: ["orc-executor-sonnet-4-6-med", "orc-executor-opus-5-low"], table: "shipped" },
      resolved: "extra", held_back: null,
      why: "slot row quick-executor holds this position and outranks orc-executor-sonnet-4-6-med.",
      announce: "quick-executor (/orc-quick) → deepseek/deepseek-coder via api (profile cheap) — displaces orc-executor-sonnet-4-6-med; this sends the slice to a third party.",
      next: null,
    },
    {
      slot: "fast-executor", lane: "/orc-fast", routed: true,
      profile: "glm", model: "glm-4.6", small_model: null, max_turns: null,
      added_at: "2026-08-11T14:02:00Z", provider: "zai", engine: "claude-shim",
      verify_state: "STALE", verify_age_days: 15, model_known: true,
      meaning: "one executor, one slice, a build+test smoke gate behind it — the checks that catch a bad implementation here are engine-blind.",
      asks: false, announce_point: "the F0 preflight `extra:` line, before wave 1",
      claude: { via: "claude", agent: "orc-executor-sonnet-4-6-high", agents: ["orc-executor-sonnet-4-6-high"], table: "shipped" },
      resolved: "extra", held_back: null,
      why: "slot row fast-executor holds this position and outranks orc-executor-sonnet-4-6-high; verification is 15d old (STALE — still routes, re-pinged before the wave).",
      announce: "fast-executor (/orc-fast) → zai/glm-4.6 via claude-shim (profile glm) — displaces orc-executor-sonnet-4-6-high; this sends the slice to a third party.",
      next: null,
    },
    {
      slot: "doc-writer", lane: "/orc-doc", routed: true,
      profile: "cheap", model: "deepseek-chat", small_model: "deepseek-chat", max_turns: 12,
      added_at: "2026-08-24T08:00:00Z", provider: "deepseek", engine: "api",
      verify_state: "VERIFIED", verify_age_days: 1, model_known: true,
      meaning: "a writer owns ONE part file and invents no fact; its output is read by a checker and by you before it ships.",
      asks: false, announce_point: "before the wave, naming the sections going off Claude",
      claude: { via: "claude", agent: "orc-doc-writer-opus-5-med", agents: ["orc-doc-writer-opus-5-med"], table: "shipped" },
      resolved: "extra", held_back: null,
      why: "slot row doc-writer holds this position and outranks orc-doc-writer-opus-5-med.",
      announce: "doc-writer (/orc-doc) → deepseek/deepseek-chat via api (profile cheap) — displaces orc-doc-writer-opus-5-med; this sends the slice to a third party.",
      next: null,
    },
    {
      // UNROUTED, AND IT KEEPS ITS SLOT. Filtering it out would make "I left the
      // checker on Claude on purpose" and "there is no checker" identical.
      slot: "doc-checker", lane: "/orc-doc", routed: false,
      profile: null, model: null, small_model: null, max_turns: null, added_at: null,
      provider: null, engine: null, verify_state: null, verify_age_days: null, model_known: null,
      meaning: "the checker reads one bounded part and reports; it rewrites nothing, so a finding it makes is a finding you read.",
      asks: false, announce_point: "before the wave",
      claude: { via: "claude", agent: "orc-doc-checker-opus-5-low", agents: ["orc-doc-checker-opus-5-low"], table: "shipped" },
      resolved: "claude", held_back: null,
      why: "no slot row holds doc-checker — Extra is an OVERLAY, so an unrouted position falls straight through to orc-doc-checker-opus-5-low.",
      announce: null,
      next: "orc extra role set doc-checker <profile>/<model>",
    },
    {
      slot: "wiki-scanner-deep", lane: "/orc-wiki", routed: false,
      profile: null, model: null, small_model: null, max_turns: null, added_at: null,
      provider: null, engine: null, verify_state: null, verify_age_days: null, model_known: null,
      meaning: "a scanner returns an evidence-anchored doc body the orchestrator writes; every claim in it is anchored to a file you can open.",
      asks: false, announce_point: "per scan-batch, beside the resolved tier",
      claude: { via: "claude", agent: "orc-wiki-scanner-opus-4-8-high", agents: ["orc-wiki-scanner-opus-4-8-high"], table: "shipped" },
      resolved: "claude", held_back: null,
      why: "no slot row holds wiki-scanner-deep — Extra is an OVERLAY, so an unrouted position falls straight through to orc-wiki-scanner-opus-4-8-high.",
      announce: null,
      next: "orc extra role set wiki-scanner-deep <profile>/<model>",
    },
    {
      // ROUTED AND HELD BACK: the profile lost its verification, so the position
      // fell back to Claude without the user asking it to.
      slot: "wiki-scanner-light", lane: "/orc-wiki", routed: true,
      profile: "gone", model: "glm-4.6", small_model: null, max_turns: null,
      added_at: "2026-07-30T11:30:00Z", provider: "zai", engine: "api",
      verify_state: "UNVERIFIED", verify_age_days: null, model_known: true,
      meaning: "the LIGHT tier is already a small no-new-surface delta on an existing doc — the cheapest work the wiki does.",
      asks: false, announce_point: "per scan-batch, beside the resolved tier",
      claude: { via: "claude", agent: "orc-wiki-scanner-sonnet-5-high", agents: ["orc-wiki-scanner-sonnet-5-high"], table: "shipped" },
      resolved: "claude", held_back: "unverified",
      why: '"gone" has never verified — nothing dispatches to an unproven endpoint.',
      announce: null,
      next: "orc extra ping gone",
    },
  ],
  counts: { total: 6, routed: 4, resolving: 3 },
  unreachable_roles: [
    { role: "reviewer", state: "declared · no slot · nothing resolves this" },
    { role: "verifier", state: "declared · no slot · nothing resolves this" },
    { role: "analyst", state: "declared · no slot · nothing resolves this" },
    { role: "planner", state: "declared · no slot · nothing resolves this" },
    { role: "scout", state: "declared · no slot · nothing resolves this" },
    { role: "test-author", state: "declared · no slot · nothing resolves this" },
  ],
  note: "a slot with no row KEEPS ITS SLOT and falls through to its pinned Claude agent. Absence is not a hole.",
};

/* `orc extra lanes --json` (v0.52.0, D6). ONE OF EVERY VERDICT, including the
   two that are easy to forget: a fixed-executor lane whose band's two edges
   DISAGREE (it stays on Claude and names the row that partially covered it),
   and a fixed-role lane whose roles `extra_roles` does not name. You cannot
   design "one edge went foreign and the other did not" on a config where every
   band is covered. */
const extraLanes = {
  ok: true,
  extra_enabled: true,
  roles: ["executor"],
  shapes: ["scored", "fixed-executor", "slot", "gated-choice", "inert", "never"],
  routes: ["per-task", "foreign", "claude", "roles", "offered", "never"],
  slots: [
    { slot: "quick-executor", lane: "/orc-quick", asks: true },
    { slot: "fast-executor", lane: "/orc-fast", asks: false },
    { slot: "doc-writer", lane: "/orc-doc", asks: false },
    { slot: "doc-checker", lane: "/orc-doc", asks: false },
    { slot: "wiki-scanner-deep", lane: "/orc-wiki", asks: false },
    { slot: "wiki-scanner-light", lane: "/orc-wiki", asks: false },
  ],
  note: "A lane not in this list does not route foreign.",
  lanes: [
    {
      lane: "/orc", shape: "scored", agent: null, routes: "per-task",
      detail: "every task is scored, so the routing table below applies score by score.",
    },
    {
      lane: "/orc-ultra", shape: "scored", agent: null, routes: "per-task",
      detail: "every task is scored, so the routing table below applies score by score.",
    },
    {
      lane: "/orc-mini", shape: "fixed-executor", agent: "orc-executor-sonnet-5-high",
      band: "[55,65)", edges: [55, 64], agree: false, routes: "claude", resolved: null,
      detail: "one edge routes foreign and the other does not, so the lane stays on Claude. Row [30,55) covers only part of this band.",
    },
    {
      lane: "/orc-fast", shape: "slot", agent: null, routes: "roles",
      slots: [
        { slot: "fast-executor", routes: true, profile: "glm", model: "glm-4.6", claude: "orc-executor-sonnet-4-6-high", held_back: null, why: "slot row fast-executor holds this position and outranks orc-executor-sonnet-4-6-high." },
      ],
      detail: "fast-executor is held by a non-Claude worker; every position with no row stays on its pinned Claude agent.",
    },
    {
      lane: "/orc-diy", shape: "scored", agent: null, routes: "per-task",
      detail: "every task is scored, so the routing table below applies score by score. The flow key decides WHETHER; the resolver still decides WHERE, so route rows are never baked into flow.lock.json.",
    },
    {
      // OFFERED, never applied. The verdict word is this lane's own, because
      // "this lane routes foreign" would be a claim about a decision only the
      // user gets to make, per entry.
      lane: "/orc-quick", shape: "gated-choice", agent: null, routes: "offered",
      slots: [
        { slot: "quick-executor", routes: true, profile: "cheap", model: "deepseek-chat", claude: "orc-executor-sonnet-4-6-med", held_back: null, why: "slot row quick-executor holds this position and outranks orc-executor-sonnet-4-6-med." },
      ],
      detail: "quick-executor is OFFERED as one more option at the dispatch gate. It never becomes a default and never sticks — this lane asks before every dispatch.",
    },
    {
      // ONE ROUTED, ONE NOT. This is the state that could not be designed
      // before v0.55.0, because both roles resolved the WRITER's band.
      lane: "/orc-doc", shape: "slot", agent: null, routes: "roles",
      slots: [
        { slot: "doc-writer", routes: true, profile: "cheap", model: "deepseek-chat", claude: "orc-doc-writer-opus-5-med", held_back: null, why: "slot row doc-writer holds this position and outranks orc-doc-writer-opus-5-med." },
        { slot: "doc-checker", routes: false, profile: null, model: null, claude: "orc-doc-checker-opus-5-low", held_back: null, why: "no slot row holds doc-checker — Extra is an OVERLAY, so an unrouted position falls straight through to orc-doc-checker-opus-5-low." },
      ],
      detail: "doc-writer is held by a non-Claude worker; every position with no row stays on its pinned Claude agent.",
    },
    {
      lane: "/orc-challenge", shape: "never", agent: null, routes: "never",
      detail: "this lane measures rather than produces, so nothing it dispatches may be swapped for a different model.",
    },
    {
      // NEITHER position held — the row that was DEAD before v0.55.0, now
      // answering honestly instead of blaming a role name nobody could set.
      lane: "/orc-wiki", shape: "slot", agent: null, routes: "claude",
      slots: [
        { slot: "wiki-scanner-deep", routes: false, profile: null, model: null, claude: "orc-wiki-scanner-opus-4-8-high", held_back: null, why: "no slot row holds wiki-scanner-deep — Extra is an OVERLAY, so an unrouted position falls straight through to orc-wiki-scanner-opus-4-8-high." },
        { slot: "wiki-scanner-light", routes: false, profile: null, model: null, claude: "orc-wiki-scanner-sonnet-5-high", held_back: null, why: "no slot row holds wiki-scanner-light — Extra is an OVERLAY, so an unrouted position falls straight through to orc-wiki-scanner-sonnet-5-high." },
      ],
      detail: "no position in this lane is held, so every one of them stays on its pinned Claude agent.",
    },
    { lane: "/orc-retro", shape: "never", agent: null, routes: "never", detail: "this lane measures rather than produces, so nothing it dispatches may be swapped for a different model." },
    { lane: "/orc-budget", shape: "never", agent: null, routes: "never", detail: "this lane measures rather than produces, so nothing it dispatches may be swapped for a different model." },
    { lane: "/orc-aftermath", shape: "never", agent: null, routes: "never", detail: "this lane measures rather than produces, so nothing it dispatches may be swapped for a different model." },
    { lane: "/orc-boundary", shape: "never", agent: null, routes: "never", detail: "this lane measures rather than produces, so nothing it dispatches may be swapped for a different model." },
    { lane: "/orc-pact", shape: "never", agent: null, routes: "never", detail: "this lane measures rather than produces, so nothing it dispatches may be swapped for a different model." },
  ],
};

// `orc extra stats --json`. Joined from the EXTRA trace lines, grouped by the
// pair a routing decision is made in — profile AND band.
//
// The ugly states are the point: one band whose vector is assembled from SIX of
// ten dispatches (four reported no counts at all), one whose provider has no
// rate at all so `usd` is null, one substitution, one reroute and one fallback.
// The `[65,70)` row is deliberately ABSENT so a routed band that nothing has run
// through can be designed — it must read `—`, never `0`.
//
// `sources` carries its ugly states too: rows from all three sources at once,
// plus a torn log line and an undated saved return. Both of those are ABSENT
// counts — dispatches that are real and are NOT in the totals — and you cannot
// design the warning for a short report against a clean one.
const extraStats = {
  log_dir: ".claude/orc/logs",
  since: null,
  files_scanned: 14,
  dispatches: 23,
  spend_log: ".claude/orc/extra-spend.jsonl",
  sources: {
    spend_log: 18,
    traces_only: 3,
    run_returns: 2,
    run_returns_undated_skipped: 1,
    unreadable_spend_lines: 1,
  },
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
  // v0.54.0 — RELIABILITY. ONE PROFILE ABOVE THE SAMPLE FLOOR AND ONE BELOW IT,
  // because the `sample too small` chip cannot be designed against a fixture
  // set where every profile has a percentage. `flaky` is over the floor and
  // over the rate; `cheap` is four dispatches and gets no percentage at all —
  // a rate computed from four tries is noise with a percent sign on it.
  reliability: {
    sample_floor: 10,
    unreadable_journals: 1,
    journals_without_result: 2,
    profiles: [
      {
        profile: "flaky",
        dispatches: 14,
        dispatches_total: 16,
        failed: 5,
        partial: 1,
        resumed: 3,
        orphaned: 2,
        attribution: { provider: 2, network: 3, local: 0, worker: 1, orc: 0 },
        unattributed: 1,
        mean_time_to_failure_ms: 38000,
        sample_floor: 10,
        sample_too_small: false,
        failure_rate: 0.44,
      },
      {
        profile: "cheap",
        dispatches: 4,
        dispatches_total: 4,
        failed: 1,
        partial: 0,
        resumed: 0,
        orphaned: 0,
        attribution: { provider: 1, network: 0, local: 0, worker: 0, orc: 0 },
        // ALWAYS PRESENT, INCLUDING WHEN ZERO.
        unattributed: 0,
        mean_time_to_failure_ms: 12000,
        sample_floor: 10,
        sample_too_small: true,
        failure_rate: null,
      },
    ],
  },
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

// ── v0.54.0 — RECOVERY. ONE OF EVERY STATE, INCLUDING THE UGLY ONES ────────
//
// You cannot design an `in-flight` REFUSAL against a fixture set that only has
// clean rows, and you cannot design a `streamed-opaque` row — one with no
// per-turn tool attribution to render — on a journal that always has one. Every
// reconcile state the CLI can return is reachable here:
//
//   T-2   resumable, attribution `network`      the row this release is for
//   T-5   resumable, `provider`, engine cli     streamed-opaque, nothing to attribute per turn
//   T-7   nothing-to-resume                     a row that keeps its slot with nothing in it
//   T-8   in-flight                             a REFUSAL with a live pid and a lease
//   T-9   resumable + reverted                  the blocked resume, naming the paths
//   T-11  complete                              a clean close, and prune-eligible
//   T-12  no-journal                            a pre-0.54.0 task somebody asks about
const extraJournal = {
  ok: true,
  root: "/repo/.claude/orc/extra-journal",
  entries: 6,
  orphans: 1,
  in_flight: 1,
  prunable: 1,
  retention_days: 30,
  journals: [
    {
      task_id: "T-2",
      dir: "/repo/.claude/orc/extra-journal/T-2",
      attempts: 1,
      attempt: 1,
      profile: "dipkshit",
      provider: "deepseek",
      engine: "api",
      model_requested: "deepseek-v4-flash",
      started_at: "2026-08-24T19:31:27.401Z",
      journal_fidelity: "per-turn",
      declared_files: ["src/routes/health.js", "src/app.js"],
      outcome: "failed",
      reason: "connection-lost-local",
      reported_back: true,
      live: false,
      orphan: false,
      prunable: false,
      prunable_why: "attempt 1 closed `failed`, not `done`",
    },
    {
      task_id: "T-5",
      dir: "/repo/.claude/orc/extra-journal/T-5",
      attempts: 2,
      attempt: 2,
      profile: "local-opencode",
      provider: "custom",
      engine: "cli",
      model_requested: "deepseek/deepseek-chat",
      started_at: "2026-08-24T18:02:11.902Z",
      journal_fidelity: "streamed-opaque",
      declared_files: ["src/lib/cart.ts"],
      outcome: "partial",
      reason: "wall-clock",
      reported_back: true,
      live: false,
      orphan: false,
      prunable: false,
      prunable_why: "attempt 2 closed `partial`, not `done`",
    },
    {
      task_id: "T-7",
      dir: "/repo/.claude/orc/extra-journal/T-7",
      attempts: 1,
      attempt: 1,
      profile: "dipkshit",
      provider: "deepseek",
      engine: "api",
      model_requested: "deepseek-v4-flash",
      started_at: "2026-08-24T17:40:00.000Z",
      journal_fidelity: "per-turn",
      declared_files: ["README.md"],
      outcome: "failed",
      reason: "rate_limit",
      reported_back: true,
      live: false,
      orphan: false,
      prunable: false,
      prunable_why: "attempt 1 closed `failed`, not `done`",
    },
    {
      task_id: "T-8",
      dir: "/repo/.claude/orc/extra-journal/T-8",
      attempts: 1,
      attempt: 1,
      profile: "dipkshit",
      provider: "deepseek",
      engine: "api",
      model_requested: "deepseek-v4-flash",
      started_at: "2026-08-24T19:58:04.117Z",
      journal_fidelity: "per-turn",
      declared_files: ["src/pay/refund.ts"],
      outcome: null,
      reason: null,
      reported_back: false,
      live: true,
      orphan: false,
      prunable: false,
      prunable_why: "attempt 1 never reported back — an orphan is never swept",
    },
    {
      task_id: "T-9",
      dir: "/repo/.claude/orc/extra-journal/T-9",
      attempts: 1,
      attempt: 1,
      profile: "local-opencode",
      provider: "custom",
      engine: "cli",
      model_requested: "deepseek/deepseek-chat",
      started_at: "2026-08-23T11:15:42.000Z",
      journal_fidelity: "streamed-opaque",
      declared_files: ["src/db/schema.sql"],
      outcome: null,
      reason: null,
      reported_back: false,
      live: false,
      // THE ONE STATE THIS LISTING EXISTS TO MAKE VISIBLE.
      orphan: true,
      prunable: false,
      prunable_why: "attempt 1 never reported back — an orphan is never swept",
    },
    {
      task_id: "T-11",
      dir: "/repo/.claude/orc/extra-journal/T-11",
      attempts: 1,
      attempt: 1,
      profile: "dipkshit",
      provider: "deepseek",
      engine: "api",
      model_requested: "deepseek-v4-flash",
      started_at: "2026-06-30T09:00:00.000Z",
      journal_fidelity: "per-turn",
      declared_files: ["src/util/slug.ts"],
      outcome: "done",
      reason: null,
      reported_back: true,
      live: false,
      orphan: false,
      prunable: true,
      prunable_why: "every attempt closed `done` and nothing here has changed in 30+ days",
    },
  ],
};

// `orc extra reconcile <task> --json`, one per state. The panel renders these
// and computes NOTHING — not the state word, not the line counts, not the
// verdict, and above all not the prose beside the verdict.
const extraReconcile = {
  // THE USER'S OWN SCENARIO. Six of seven lines written, then the wire died,
  // and the unauthenticated probe failed too — so a Claude fallback would fail
  // as well and the wave HOLDS.
  "T-2": {
    ok: true,
    state: "resumable",
    task_id: "T-2",
    attempt: 1,
    attempts_total: 1,
    profile: "dipkshit",
    provider: "deepseek",
    engine: "api",
    model_requested: "deepseek-v4-flash",
    band: "[0,40)",
    score: 22,
    journal: "/repo/.claude/orc/extra-journal/T-2/attempt-01.json",
    journal_fidelity: "per-turn",
    journal_fidelity_note: "every turn and every tool call was recorded as it happened.",
    resumed_from: null,
    slice_path: "/repo/.claude/orc/run/health/T-2.slice.json",
    slice_sha256: "9f2c1ab4d7e05f38c6b1a2d9e4f70b83c5a6d1e2f3049b7c8d5e6f1a2b3c4d5e",
    started_at: "2026-08-24T19:31:27.401Z",
    ended_at: "2026-08-24T19:32:08.601Z",
    duration_ms: 41200,
    outcome: "failed",
    reason: "connection-lost-local",
    retryable: true,
    reported_back: true,
    orphan: false,
    liveness: {
      live: false,
      pid: 24188,
      pid_alive: false,
      lease_expires_at: "2026-08-24T19:47:27.401Z",
      lease_expired: true,
      note: "the lease has expired, so a live pid here is treated as SOMEBODY ELSE'S process. Pid reuse is real; this is an honest bound, not a proof.",
    },
    attribution: {
      verdict: "network",
      why: "the connection to deepseek failed, and an UNAUTHENTICATED probe of https://api.deepseek.com/v1/models also failed inside 3s. That points at this machine's network, not at the provider.",
      evidence: ["3 turn(s) completed", "1 file(s) were written before it stopped", "network probe: ECONNREFUSED after 3000ms"],
      fallback_would_also_fail: true,
      probe: { ran: true, reachable: false, url: "https://api.deepseek.com/v1/models", status: null, ms: 3000 },
    },
    files: [
      {
        path: "src/routes/health.js",
        state: "created",
        baseline: { exists: false, sha256: null, lines: 0 },
        now: { exists: true, sha256: "aa11bb22cc33dd44ee55ff6607182930a1b2c3d4e5f60718293a4b5c6d7e8f90", lines: 7 },
        numstat: { added: 7, removed: 0, source: "the file did not exist at baseline, so every line in it is new" },
      },
      {
        path: "src/app.js",
        state: "untouched",
        baseline: { exists: true, sha256: "bb22cc33dd44ee55ff6607182930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11", lines: 41 },
        now: { exists: true, sha256: "bb22cc33dd44ee55ff6607182930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11", lines: 41 },
        numstat: { added: 0, removed: 0, source: "the file is byte-identical to the baseline" },
      },
    ],
    touched_undeclared: [],
    reverted: [],
    git: true,
    git_note: null,
    last_action: "turn 4 of 12 · Write src/routes/health.js · ok",
    progress_lines: 9,
    unreadable_progress_lines: 0,
    turns_used: 4,
    max_turns: 12,
    partial_usage: { input: 8140, cache_write: 0, cache_read: 0, output: 512 },
    partial_usage_note:
      "read from the journal's per-turn vector. It is a FLOOR — the true total may be higher, because the dispatch died before it could report.",
    acceptance: ["GET /health returns 200 {status:'ok'}"],
    acceptance_note: "carried forward unevaluated — whether these are met is not a question this command can answer.",
    resume_target: {
      kind: "hold",
      profile: null,
      agent: null,
      why: "attributed to this machine's NETWORK. A Claude fallback would fail too, so hold the wave and say why — do not spend a second failure finding that out.",
      resumes_so_far: 0,
      resume_max: 2,
    },
    next: null,
    spend_recovered: null,
    blocked_by: null,
  },

  // ENGINE `cli`: the bytes are on disk and ORC did not interpret them. Nothing
  // may render this as if it had per-turn tool attribution.
  "T-5": {
    ok: true,
    state: "resumable",
    task_id: "T-5",
    attempt: 2,
    attempts_total: 2,
    profile: "local-opencode",
    provider: "custom",
    engine: "cli",
    model_requested: "deepseek/deepseek-chat",
    band: "[40,80)",
    score: 55,
    journal: "/repo/.claude/orc/extra-journal/T-5/attempt-02.json",
    journal_fidelity: "streamed-opaque",
    journal_fidelity_note:
      "the child's own output was captured verbatim; ORC did not interpret it, so there is NO per-turn tool attribution here — only bytes.",
    resumed_from: { attempt: 1, reason: "timeout", attribution: "provider", at: "2026-08-24T17:44:00.000Z" },
    slice_path: "/repo/.claude/orc/run/cart/T-5.resume.json",
    slice_sha256: "1122334455667788990011223344556677889900112233445566778899001122",
    started_at: "2026-08-24T18:02:11.902Z",
    ended_at: "2026-08-24T18:17:12.902Z",
    duration_ms: 901000,
    outcome: "partial",
    reason: "wall-clock",
    retryable: true,
    reported_back: true,
    orphan: false,
    liveness: { live: false, pid: 30112, pid_alive: false, lease_expires_at: "2026-08-24T18:33:11.902Z", lease_expired: true, note: null },
    attribution: {
      verdict: "worker",
      why: "the dispatch was capped rather than broken (wall-clock): the conversation worked and the work did not finish inside it.",
      evidence: ["2 file(s) were written before it stopped"],
      fallback_would_also_fail: false,
      probe: null,
    },
    files: [
      {
        path: "src/lib/cart.ts",
        state: "modified",
        baseline: { exists: true, sha256: "cc33dd44ee55ff6607182930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22", lines: 210 },
        now: { exists: true, sha256: "dd44ee55ff6607182930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22cc33", lines: 236 },
        // UNKNOWN IS NOT ZERO. The file already differed from HEAD before the
        // dispatch started, so a line count here would mix two people's changes.
        numstat: {
          added: null,
          removed: null,
          source:
            "the file already differed from HEAD before this dispatch started, so a line count here would mix this dispatch's change with somebody else's uncommitted one. UNKNOWN, and unknown is not zero.",
        },
      },
    ],
    touched_undeclared: [{ path: "src/lib/cart.test.ts", status_line: "?? src/lib/cart.test.ts" }],
    reverted: [],
    git: true,
    git_note: null,
    last_action: "nothing was captured — this engine records BYTES, and none arrived.",
    progress_lines: 41,
    unreadable_progress_lines: 1,
    turns_used: 0,
    max_turns: null,
    partial_usage: null,
    partial_usage_note: "the journal recorded no usage vector, so there is NO figure here — not a zero one.",
    acceptance: ["the cart total excludes removed lines"],
    acceptance_note: "carried forward unevaluated — whether these are met is not a question this command can answer.",
    resume_target: {
      kind: "extra",
      profile: "local-opencode",
      agent: null,
      why: "`wall-clock` is retryable, so the same profile gets it again in a NEW session — carrying the position it left behind.",
      resumes_so_far: 1,
      resume_max: 2,
    },
    next: "orc extra resume-slice T-5 --out <file>",
    spend_recovered: null,
    blocked_by: null,
  },

  // A ROW THAT KEEPS ITS SLOT WITH NOTHING IN IT. Filtering this out would make
  // "there was nothing to resume" and "ORC did not look" identical.
  "T-7": {
    ok: true,
    state: "nothing-to-resume",
    task_id: "T-7",
    attempt: 1,
    attempts_total: 1,
    profile: "dipkshit",
    provider: "deepseek",
    engine: "api",
    model_requested: "deepseek-v4-flash",
    band: "[0,40)",
    score: 12,
    journal: "/repo/.claude/orc/extra-journal/T-7/attempt-01.json",
    journal_fidelity: "per-turn",
    journal_fidelity_note: "every turn and every tool call was recorded as it happened.",
    resumed_from: null,
    slice_path: "/repo/.claude/orc/run/readme/T-7.slice.json",
    slice_sha256: "3344556677889900112233445566778899001122334455667788990011223344",
    started_at: "2026-08-24T17:40:00.000Z",
    ended_at: "2026-08-24T17:40:03.100Z",
    duration_ms: 3100,
    outcome: "failed",
    reason: "rate_limit",
    retryable: true,
    reported_back: true,
    orphan: false,
    liveness: { live: false, pid: 21000, pid_alive: false, lease_expires_at: "2026-08-24T17:56:00.000Z", lease_expired: true, note: null },
    attribution: {
      verdict: "provider",
      why: "the provider rate-limited this key — the endpoint answered, and what it answered was a refusal.",
      evidence: ["the endpoint answered HTTP 429", "1 turn(s) completed"],
      fallback_would_also_fail: false,
      probe: null,
    },
    files: [
      {
        path: "README.md",
        state: "untouched",
        baseline: { exists: true, sha256: "ee55ff6607182930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22cc33dd44", lines: 88 },
        now: { exists: true, sha256: "ee55ff6607182930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22cc33dd44", lines: 88 },
        numstat: { added: 0, removed: 0, source: "the file is byte-identical to the baseline" },
      },
    ],
    touched_undeclared: [],
    reverted: [],
    git: true,
    git_note: null,
    last_action: "no tool call was ever recorded.",
    progress_lines: 2,
    unreadable_progress_lines: 0,
    turns_used: 1,
    max_turns: 12,
    partial_usage: { input: 940, cache_write: 0, cache_read: 0, output: 0 },
    partial_usage_note:
      "read from the journal's per-turn vector. It is a FLOOR — the true total may be higher, because the dispatch died before it could report.",
    acceptance: ["the install section names the new flag"],
    acceptance_note: "carried forward unevaluated — whether these are met is not a question this command can answer.",
    resume_target: null,
    next: "nothing was written — re-dispatch the ORIGINAL slice (the existing fallback procedure).",
    spend_recovered: null,
    blocked_by: null,
  },

  // A REFUSAL, rendered as one, naming the pid and the lease.
  "T-8": {
    ok: true,
    state: "in-flight",
    task_id: "T-8",
    attempt: 1,
    attempts_total: 1,
    profile: "dipkshit",
    provider: "deepseek",
    engine: "api",
    model_requested: "deepseek-v4-flash",
    band: "[0,40)",
    score: 31,
    journal: "/repo/.claude/orc/extra-journal/T-8/attempt-01.json",
    journal_fidelity: "per-turn",
    journal_fidelity_note: "every turn and every tool call was recorded as it happened.",
    resumed_from: null,
    slice_path: "/repo/.claude/orc/run/refund/T-8.slice.json",
    slice_sha256: "5566778899001122334455667788990011223344556677889900112233445566",
    started_at: "2026-08-24T19:58:04.117Z",
    ended_at: null,
    duration_ms: null,
    outcome: null,
    reason: null,
    retryable: null,
    reported_back: false,
    orphan: false,
    liveness: {
      live: true,
      pid: 31882,
      pid_alive: true,
      lease_expires_at: "2026-08-24T20:14:04.117Z",
      lease_expired: false,
      note: null,
    },
    attribution: null,
    files: [
      {
        path: "src/pay/refund.ts",
        state: "modified",
        baseline: { exists: true, sha256: "ff6607182930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22cc33dd44ee55", lines: 120 },
        now: { exists: true, sha256: "07182930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22cc33dd44ee55ff66", lines: 131 },
        numstat: { added: 11, removed: 0, source: "the baseline WAS the committed blob, so `git diff --numstat HEAD` describes exactly this dispatch's change" },
      },
    ],
    touched_undeclared: [],
    reverted: [],
    git: true,
    git_note: null,
    last_action: "turn 2 of 12 · Edit src/pay/refund.ts · ok",
    progress_lines: 4,
    unreadable_progress_lines: 0,
    turns_used: 2,
    max_turns: 12,
    partial_usage: { input: 3020, cache_write: 0, cache_read: 0, output: 288 },
    partial_usage_note:
      "read from the journal's per-turn vector. It is a FLOOR — the true total may be higher, because the dispatch died before it could report.",
    acceptance: ["a partial refund never exceeds the captured amount"],
    acceptance_note: "carried forward unevaluated — whether these are met is not a question this command can answer.",
    resume_target: null,
    next: null,
    spend_recovered: null,
    blocked_by:
      "pid 31882 is still alive and its lease does not expire until 2026-08-24T20:14:04.117Z. A human decides whether that process is really working: two writers on one file is worse than a lost dispatch.",
  },

  // THE BLOCKED RESUME. A declared file came back CLOSER TO HEAD than the
  // baseline — how a destructive git command inside a slice disguises itself.
  "T-9": {
    ok: true,
    state: "resumable",
    task_id: "T-9",
    attempt: 1,
    attempts_total: 1,
    profile: "local-opencode",
    provider: "custom",
    engine: "cli",
    model_requested: "deepseek/deepseek-chat",
    band: "[40,80)",
    score: 61,
    journal: "/repo/.claude/orc/extra-journal/T-9/attempt-01.json",
    journal_fidelity: "streamed-opaque",
    journal_fidelity_note:
      "the child's own output was captured verbatim; ORC did not interpret it, so there is NO per-turn tool attribution here — only bytes.",
    resumed_from: null,
    slice_path: "/repo/.claude/orc/run/schema/T-9.slice.json",
    slice_sha256: "7788990011223344556677889900112233445566778899001122334455667788",
    started_at: "2026-08-23T11:15:42.000Z",
    ended_at: null,
    duration_ms: null,
    outcome: null,
    reason: null,
    retryable: null,
    // NEVER REPORTED BACK, and the lease has expired — so it is an orphan AND
    // the worktree moved.
    reported_back: false,
    orphan: true,
    liveness: { live: false, pid: 9001, pid_alive: false, lease_expires_at: "2026-08-23T11:31:42.000Z", lease_expired: true, note: "the lease has expired, so a live pid here is treated as SOMEBODY ELSE'S process. Pid reuse is real; this is an honest bound, not a proof." },
    attribution: null,
    files: [
      {
        path: "src/db/schema.sql",
        state: "reverted",
        baseline: { exists: true, sha256: "182930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22cc33dd44ee55ff6607", lines: 302 },
        now: { exists: true, sha256: "2930a1b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22cc33dd44ee55ff660718", lines: 288 },
        numstat: { added: null, removed: null, source: "the file already differed from HEAD before this dispatch started, so a line count here would mix this dispatch's change with somebody else's uncommitted one. UNKNOWN, and unknown is not zero." },
      },
    ],
    touched_undeclared: [],
    reverted: ["src/db/schema.sql"],
    git: true,
    git_note: null,
    last_action: "nothing was captured — this engine records BYTES, and none arrived.",
    progress_lines: 0,
    unreadable_progress_lines: 0,
    turns_used: 0,
    max_turns: null,
    partial_usage: null,
    partial_usage_note: "the journal recorded no usage vector, so there is NO figure here — not a zero one.",
    acceptance: ["the migration is reversible"],
    acceptance_note: "carried forward unevaluated — whether these are met is not a question this command can answer.",
    resume_target: {
      kind: "extra",
      profile: "local-opencode",
      agent: null,
      why: "`the failure` is retryable, so the same profile gets it again in a NEW session — carrying the position it left behind.",
      resumes_so_far: 0,
      resume_max: 2,
    },
    next: null,
    spend_recovered: { already: false, marker: "/repo/.claude/orc/extra-journal/T-9/attempt-01.recovered" },
    blocked_by:
      "src/db/schema.sql came back CLOSER TO HEAD than the baseline — the §6 revert signature. A human decides whether to restore first: resuming on top of a possible destructive action is the one case where continuing is worse than starting over.",
  },

  // A CLEAN CLOSE. Resuming would duplicate work that is already done.
  "T-11": {
    ok: true,
    state: "complete",
    task_id: "T-11",
    attempt: 1,
    attempts_total: 1,
    profile: "dipkshit",
    provider: "deepseek",
    engine: "api",
    model_requested: "deepseek-v4-flash",
    band: "[0,40)",
    score: 9,
    journal: "/repo/.claude/orc/extra-journal/T-11/attempt-01.json",
    journal_fidelity: "per-turn",
    journal_fidelity_note: "every turn and every tool call was recorded as it happened.",
    resumed_from: null,
    slice_path: "/repo/.claude/orc/run/slug/T-11.slice.json",
    slice_sha256: "9900112233445566778899001122334455667788990011223344556677889900",
    started_at: "2026-06-30T09:00:00.000Z",
    ended_at: "2026-06-30T09:00:28.000Z",
    duration_ms: 28000,
    outcome: "done",
    reason: null,
    retryable: false,
    reported_back: true,
    orphan: false,
    liveness: { live: false, pid: 4410, pid_alive: false, lease_expires_at: "2026-06-30T09:16:00.000Z", lease_expired: true, note: "the lease has expired, so a live pid here is treated as SOMEBODY ELSE'S process. Pid reuse is real; this is an honest bound, not a proof." },
    attribution: {
      verdict: null,
      why: "this attempt finished. There is nothing to attribute.",
      evidence: [],
      fallback_would_also_fail: false,
      probe: null,
    },
    files: [
      {
        path: "src/util/slug.ts",
        state: "modified",
        baseline: { exists: true, sha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22cc33dd44ee55ff6607182930", lines: 34 },
        now: { exists: true, sha256: "b2c3d4e5f60718293a4b5c6d7e8f90aa11bb22cc33dd44ee55ff6607182930a1", lines: 39 },
        numstat: { added: 5, removed: 0, source: "the baseline WAS the committed blob, so `git diff --numstat HEAD` describes exactly this dispatch's change" },
      },
    ],
    touched_undeclared: [],
    reverted: [],
    git: true,
    git_note: null,
    last_action: "turn 3 of 12 · Write src/util/slug.ts · ok",
    progress_lines: 7,
    unreadable_progress_lines: 0,
    turns_used: 3,
    max_turns: 12,
    partial_usage: { input: 5100, cache_write: 0, cache_read: 0, output: 410 },
    partial_usage_note:
      "read from the journal's per-turn vector. It is a FLOOR — the true total may be higher, because the dispatch died before it could report.",
    acceptance: ["a slug never contains two dashes in a row"],
    acceptance_note: "carried forward unevaluated — whether these are met is not a question this command can answer.",
    resume_target: null,
    next: null,
    spend_recovered: null,
    blocked_by: null,
  },

  // A PRE-0.54.0 DISPATCH somebody asks about. Exit 2, and the message says so
  // rather than pretending the task never existed.
  "T-12": {
    ok: false,
    state: "no-journal",
    task_id: "T-12",
    attempt: null,
    attempts_total: 0,
    error:
      "no journal for task `T-12`. Either the id is wrong, or this dispatch predates the journal (orc 0.54.0) — in which case there is no baseline and today's fallback procedure is the whole of the answer.",
    blocked_by: null,
  },
};

// The prune preview. It NAMES EVERY DIRECTORY — a count is not consent — and it
// names why each kept one is kept, which is as much of the answer.
const extraJournalPrune = {
  ok: true,
  root: "/repo/.claude/orc/extra-journal",
  dry_run: true,
  retention_days: 30,
  candidates: [
    {
      task_id: "T-11",
      dir: "/repo/.claude/orc/extra-journal/T-11",
      attempts: 1,
      why: "every attempt closed `done` and nothing here has changed in 30+ days",
    },
  ],
  kept: [
    { task_id: "T-2", why: "attempt 1 closed `failed`, not `done`" },
    { task_id: "T-5", why: "attempt 2 closed `partial`, not `done`" },
    { task_id: "T-7", why: "attempt 1 closed `failed`, not `done`" },
    { task_id: "T-8", why: "attempt 1 never reported back — an orphan is never swept" },
    { task_id: "T-9", why: "attempt 1 never reported back — an orphan is never swept" },
  ],
  removed: [],
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
  extraRole,
  extraLanes,
  extraStats,
  extraRates,
  extraPingOk,
  extraPingBad,
  extraPingSaveOffer,
  extraJournal,
  extraReconcile,
  extraJournalPrune,
};
