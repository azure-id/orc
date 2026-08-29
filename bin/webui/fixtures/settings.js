"use strict";
/* fixtures/settings.js — canned data for `orc ui --fixtures`.
   The full config list, including a SHADOWED key: you cannot design the lock
   and its explanation against a config where nothing is shadowed.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. The v1.0.0 W2 fields (answers/family/prio/
   lanes/gated_by per key, and the `families` table) were copied straight from
   the live registry for that reason — a shadow you can design against has to
   carry the RANK that causes it, not just the sentence. */

const { PROJECT } = require("./shell.js");

const config = {
  config_path: PROJECT + "/.claude/orc.config.yaml",
  exists: true,
  keys: [
    { key: "max_wave_tasks", tier: "common", answers: [{"family":"waves","prio":"P2","mode":"replace"}], family: "waves", prio: "P2", lanes: ["orc","orc-diy"], gated_by: null, value: 4, default: 3, is_overridden: true, is_shadowed: false, shadow_reason: null, desc: "Max parallel tasks per execution wave (higher = more parallelism, more collision risk).", options: [2, 3, 4, 5], control: { kind: "int", choices: null, min: 1, max: null } },
    { key: "batch_pause_every", tier: "common", answers: [{"family":"waves","prio":"P2","mode":"replace"}], family: "waves", prio: "P2", lanes: ["orc","orc-diy"], gated_by: null, value: 2, default: 2, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Waves between stop-and-continue pauses (1 = pause every wave).", options: [1, 2, 3, 4, 5], control: { kind: "int", choices: null, min: 1, max: null } },
    { key: "rubric_bands", tier: "common", answers: [{"family":"scoring","prio":"P2","mode":"replace"}], family: "scoring", prio: "P2", lanes: ["orc","orc-diy"], gated_by: null, value: 5, default: 5, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Scoring granularity (2-5 narrow preset, 6-8 wide preset).", options: [2, 3, 4, 5, 6, 7, 8], control: { kind: "range", choices: null, min: 2, max: 8 } },
    { key: "pattern_findings", tier: "common", answers: [{"family":"patterns","prio":"P2","mode":"replace"}], family: "patterns", prio: "P2", lanes: ["orc","orc-pattern","orc-wiki"], gated_by: null, value: "on", default: "ask", is_overridden: true, is_shadowed: false, shadow_reason: null, desc: "Code-pattern gate on an FE/BE cache miss.", options: ["ask", "on", "off"], control: { kind: "enum", choices: ["ask", "on", "off"], min: null, max: null } },
    { key: "generate_tests", tier: "common", answers: [{"family":"testing","prio":"P2","mode":"replace"}], family: "testing", prio: "P2", lanes: ["orc","orc-mini"], gated_by: null, value: false, default: false, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Opt-in Phase 6.5: author test cases before ship.", options: ["true", "false"], control: { kind: "enum", choices: ["true", "false"], min: null, max: null } },
    // ON, and PARTLY SHADOWED by the extra overlay above it — the animation
    // §6.2 calls the single best argument for the project. Since v1.0.0 W3
    // removed the Fable 5 block, the overlay is the ONLY way a registry key
    // reaches `is_shadowed`, so this row is the fixture set's whole coverage of
    // that state. Do not quietly make it false.
    { key: "opus5_only", tier: "common", answers: [{"family":"executor-band","prio":"P1","mode":"replace"},{"family":"fixed-role-model","prio":"P1","mode":"replace"}], family: "executor-band", prio: "P1", lanes: ["orc","orc-analyze","orc-challenge","orc-claude","orc-diy","orc-doc","orc-fast","orc-mini","orc-pattern","orc-quick","orc-retro","orc-wiki"], gated_by: null, value: "true", default: false, is_overridden: true, is_shadowed: true, shadow_reason: "partly shadowed by extra_enabled — [0,30), [30,55), [50,60), [60,70) are routed to a non-Claude worker; the quick-executor, doc-writer position is held by one too (not consulted here); every other score and position still resolves here", desc: "EVERY dispatched role uses ONE model — Opus 5 — with EFFORT as the cost dial.", options: ["true", "false"], control: { kind: "enum", choices: ["true", "false"], min: null, max: null } },
    { key: "wiki_fresh_max", tier: "advanced", answers: [{"family":"wiki","prio":"P2","mode":"replace"}], family: "wiki", prio: "P2", lanes: ["orc","orc-fast","orc-learn","orc-wiki"], gated_by: null, value: 10, default: 10, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Wiki freshness: commit distance < this → FRESH.", options: null, control: { kind: "int", choices: null, min: 1, max: null } },
    { key: "wiki_aging_max", tier: "advanced", answers: [{"family":"wiki","prio":"P2","mode":"replace"}], family: "wiki", prio: "P2", lanes: ["orc","orc-fast","orc-learn","orc-wiki"], gated_by: null, value: 30, default: 30, is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Wiki freshness: commit distance <= this → AGING; beyond → STALE.", options: null, control: { kind: "int", choices: null, min: 1, max: null } },
    { key: "log_dir", tier: "advanced", answers: [{"family":"paths","prio":"P2","mode":"replace"}], family: "paths", prio: "P2", lanes: ["context-combiner","orc","orc-aftermath","orc-analyze","orc-analyze-mini","orc-boundary","orc-brainstorm","orc-budget","orc-challenge","orc-claude","orc-diy","orc-doc","orc-explain","orc-export","orc-fast","orc-grill","orc-handoff","orc-learn","orc-mini","orc-pact","orc-pattern","orc-poly","orc-pr-driver","orc-pr-setup","orc-quick","orc-retro","orc-route","orc-verify","orc-wiki"], gated_by: null, value: ".claude/orc/logs", default: ".claude/orc/logs", is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Persistent trace folder (never auto-deleted).", options: null, control: { kind: "path", choices: null, min: null, max: null } },
    { key: "retro_repo", tier: "advanced", answers: [{"family":"retro","prio":"P2","mode":"replace"}], family: "retro", prio: "P2", lanes: ["orc","orc-retro"], gated_by: null, value: "azure-id/orc", default: "azure-id/orc", is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "GitHub owner/repo that receives /orc-retro reports.", options: null, control: { kind: "repo", choices: null, min: null, max: null } },
    // v0.50.0 — the nine `orc extra` keys, copied from the live registry so the
    // shapes cannot drift. `extra_enabled` is TRUE here on purpose: an ARMED
    // subsystem is the state that needs designing.
    {"key": "extra_enabled", "tier": "common", answers: [{"family":"executor-band","prio":"P0","mode":"overlay"},{"family":"fixed-role-model","prio":"P0","mode":"overlay"}], family: "executor-band", prio: "P0", lanes: ["orc","orc-boundary","orc-challenge","orc-diy","orc-doc","orc-fast","orc-mini","orc-quick","orc-wiki"], gated_by: null, "value": true, "default": false, "is_overridden": true, "is_shadowed": false, "shadow_reason": null, "desc": "Master gate for `orc extra` — dispatching a scored task to a non-Claude worker (DeepSeek, GLM, Kimi, a local Ollama, any OpenAI-/Anthropic-compatible endpoint you can name). NOTHING changes unless true. The orchestrator always stays Claude; what moves is who executes a slice. Every run that will cross the boundary PRINTS it at Phase 1 — routing work off Claude silently is the failure mode this whole subsystem is shaped around.", "options": ["true", "false"], "control": {"kind": "enum", "choices": ["true", "false"], "min": null, "max": null}},
    {"key": "extra_roles", "tier": "common", answers: [{"family":"extra","prio":"P2","mode":"replace"}], family: "extra", prio: "P2", lanes: ["orc-doc","orc-wiki"], gated_by: "extra_enabled", "value": "[executor]", "default": "[executor]", "is_overridden": false, "is_shadowed": false, "shadow_reason": null, "desc": "Which dispatched roles may go foreign (CSV). Executor only by default, deliberately: an executor's output is checked by the smoke gate, the TDD gate, the reviewer and the worktree-delta check, all of which are engine-blind — while a REVIEWER you cannot trust is worse than no reviewer at all, because it launders a finding nobody made.", "options": ["executor", "reviewer", "verifier", "analyst", "planner", "scout", "test-author", "doc-writer", "doc-checker"], "control": {"kind": "subset", "choices": ["executor", "reviewer", "verifier", "analyst", "planner", "scout", "test-author", "doc-writer", "doc-checker"], "min": null, "max": null}},
    {"key": "extra_risk_tasks", "tier": "common", answers: [{"family":"extra","prio":"P2","mode":"replace"}], family: "extra", prio: "P2", lanes: ["orc","orc-diy","orc-mini"], gated_by: "extra_enabled", "value": "off", "default": "off", "is_overridden": false, "is_shadowed": false, "shadow_reason": null, "desc": "Whether a task with a non-empty cited `risk[]` (auth, money, migration, security, concurrency, data-integrity) may leave Claude. OFF holds it on the Claude ladder whatever the route table says, and the preflight NAMES it as held back. ORC already refuses to send a refund-endpoint change to a cheap model; this keeps Extra from becoming the hole in that rule.", "options": ["off", "on"], "control": {"kind": "enum", "choices": ["off", "on"], "min": null, "max": null}},
    {"key": "extra_on_failure", "tier": "common", answers: [{"family":"extra","prio":"P2","mode":"replace"}], family: "extra", prio: "P2", lanes: ["orc-quick","orc-wiki"], gated_by: "extra_enabled", "value": "fallback", "default": "fallback", "is_overridden": false, "is_shadowed": false, "shadow_reason": null, "desc": "What an unreachable endpoint, a 401, a 429 past backoff, a timeout or a malformed return does. `fallback` re-dispatches the task to the Claude band it would have had, ANNOUNCED, and the run continues. `stop` is for people who would rather stop than silently start paying Anthropic rates. A failed foreign dispatch is never a dead run either way.", "options": ["fallback", "stop"], "control": {"kind": "enum", "choices": ["fallback", "stop"], "min": null, "max": null}},
    {"key": "extra_max_concurrent", "tier": "common", answers: [{"family":"extra","prio":"P2","mode":"replace"}], family: "extra", prio: "P2", lanes: [], gated_by: "extra_enabled", "value": 1, "default": 1, "is_overridden": false, "is_shadowed": false, "shadow_reason": null, "desc": "Foreign dispatches in flight at once. Per-provider rate limits are undocumented in aggregate, so 1 is the honest default — a wave of 3 that 429s costs more in repairs than the parallelism saved.", "options": [1, 2, 3], "control": {"kind": "int", "choices": null, "min": 1, "max": null}},
    {"key": "extra_unlock", "tier": "common", answers: [{"family":"extra","prio":"P2","mode":"replace"}], family: "extra", prio: "P2", lanes: [], gated_by: "extra_enabled", "value": "per-run", "default": "per-run", "is_overridden": false, "is_shadowed": false, "shadow_reason": null, "desc": "When a vault-stored key asks for its passphrase. `per-run` asks ONCE at the Phase-1 stop the lane already has, so an unattended wave can actually run. `per-dispatch` prompts every time and REFUSES to start an unattended wave, naming why — it is interactive-only by design. Irrelevant when the credential source is an environment variable, which is the recommended one.", "options": ["per-run", "per-dispatch"], "control": {"kind": "enum", "choices": ["per-run", "per-dispatch"], "min": null, "max": null}},
    {"key": "extra_vault_max_attempts", "tier": "advanced", answers: [{"family":"extra","prio":"P2","mode":"replace"}], family: "extra", prio: "P2", lanes: [], gated_by: "extra_enabled", "value": 10, "default": 10, "is_overridden": false, "is_shadowed": false, "shadow_reason": null, "desc": "Wrong passphrases before the encrypted key DELETES ITSELF. It is a key rather than a magic number so the count is inspectable and testable — NOT so it can be switched off; below 3 is refused. The counter stops someone at your keyboard; it does not stop someone who copies the vault file and tries offline, and scrypt's cost is the only defence there.", "options": null, "control": {"kind": "int", "choices": null, "min": 3, "max": null}},
    {"key": "extra_timeout_s", "tier": "advanced", answers: [{"family":"extra","prio":"P2","mode":"replace"}], family: "extra", prio: "P2", lanes: [], gated_by: "extra_enabled", "value": 900, "default": 900, "is_overridden": false, "is_shadowed": false, "shadow_reason": null, "desc": "Per-dispatch wall clock for a foreign worker. The child's own timeouts are DERIVED from this rather than set independently, so three timeouts cannot disagree about which one fires first.", "options": null, "control": {"kind": "int", "choices": null, "min": 30, "max": null}},
    {"key": "extra_verify_max_days", "tier": "advanced", answers: [{"family":"extra","prio":"P2","mode":"replace"}], family: "extra", prio: "P2", lanes: [], gated_by: "extra_enabled", "value": 7, "default": 7, "is_overridden": false, "is_shadowed": false, "shadow_reason": null, "desc": "Past this a profile's verification reads STALE and is re-pinged before wave 1. A STALE profile STILL ROUTES — a stale check is not a failed one (the /orc-pact UNCHECKABLE rule) — and freshness is computed on read, never stored.", "options": null, "control": {"kind": "int", "choices": null, "min": 1, "max": null}},
    { key: "orchestrator_model", tier: "advanced", answers: [{"family":"session","prio":"P2","mode":"replace"}], family: "session", prio: "P2", lanes: ["orc"], gated_by: null, value: "claude-opus-4-8", tierNote: null, default: "claude-opus-4-8", is_overridden: false, is_shadowed: false, shadow_reason: null, desc: "Main-session model (below Opus breaks the tier ladder).", options: null, control: { kind: "enum", choices: ["claude-opus-5", "claude-opus-4-8", "claude-sonnet-5"], min: null, max: null } },
  ],
  // The registry-less, hand-written key — read-only everywhere, and shadowed here.
  hand_edited: [
    { key: "rubric_bands_override", value: "[[0,50,'orc-executor-sonnet-5-high'],[50,100,'orc-executor-opus-5-high']]", is_shadowed: true, shadow_reason: "shadowed by opus5_only — executors use the fixed 2-band Opus 5 ladder", editable: false },
  ],
  legacy_keys: [{ key: "opus5_executor_only", renamed_to: "opus5_only" }],
  // A key that was REMOVED, not renamed — the ugly state `--fixtures` exists to
  // carry. You cannot design the "still on disk, no longer read" row against a
  // clean config, and a panel that renders it as an editable setting is the
  // failure this field prevents.
  retired_keys: [
    {
      key: "fable5_enabled",
      value: "true",
      removed_in: "1.0.0",
      why: "the Fable 5 role override was removed — every role dispatches its shipped Claude agent, or the Opus 5 variant under opus5_only",
    },
  ],
  score_table: {
    active: "opus5_only",
    default: [
      { from: 0, to: 30, inclusive_to: false, agent: "orc-executor-haiku-4-5" },
      { from: 30, to: 40, inclusive_to: false, agent: "orc-executor-sonnet-4-6-med" },
      { from: 40, to: 55, inclusive_to: false, agent: "orc-executor-sonnet-4-6-high" },
      { from: 55, to: 65, inclusive_to: false, agent: "orc-executor-sonnet-5-high" },
      { from: 65, to: 90, inclusive_to: false, agent: "orc-executor-opus-5-low" },
      { from: 90, to: 100, inclusive_to: true, agent: "orc-executor-opus-5-med" },
    ],
    opus5_only: [
      { from: 0, to: 90, inclusive_to: false, agent: "orc-executor-opus-5-low" },
      { from: 90, to: 100, inclusive_to: true, agent: "orc-executor-opus-5-med" },
    ],
  },
  families: {
    "executor-band": {
      "contested": true,
      "question": "which model executes a SCORED task",
      "ranks": [
        {
          "prio": "P0",
          "key": "extra_enabled",
          "mode": "overlay"
        },
        {
          "prio": "P1",
          "key": "opus5_only",
          "mode": "replace"
        },
        {
          "prio": "P2",
          "key": "rubric_bands_override",
          "mode": "replace",
          "registry_less": true,
          "shadow_note": "shadowed by {by} — executors use the fixed 2-band Opus 5 ladder"
        },
        {
          "prio": "P3",
          "key": null,
          "terminal": "the shipped score→model table"
        }
      ]
    },
    "fixed-role-model": {
      "contested": true,
      "question": "which model runs a role that has no score",
      "ranks": [
        {
          "prio": "P0",
          "key": "extra_enabled",
          "mode": "overlay"
        },
        {
          "prio": "P1",
          "key": "opus5_only",
          "mode": "replace"
        },
        {
          "prio": "P2",
          "key": null,
          "terminal": "the agent shipped for that position"
        }
      ]
    },
    "waves": {
      "contested": false,
      "question": "how a run is broken into waves and when it pauses"
    },
    "scoring": {
      "contested": false,
      "question": "how finely a task is scored"
    },
    "analysis": {
      "contested": false,
      "question": "how wide the analyst sweeps before planning"
    },
    "testing": {
      "contested": false,
      "question": "which tests a run writes, and how long it repairs"
    },
    "patterns": {
      "contested": false,
      "question": "when the project's code conventions are learned"
    },
    "gotchas": {
      "contested": false,
      "question": "what repair memory is kept and injected"
    },
    "security": {
      "contested": false,
      "question": "when a security pass runs"
    },
    "mock": {
      "contested": false,
      "question": "when a runnable mocked example is produced"
    },
    "pr": {
      "contested": false,
      "question": "when a change ships as a stack instead of one PR"
    },
    "extra": {
      "contested": false,
      "question": "how a foreign dispatch behaves once extra is on"
    },
    "pact": {
      "contested": false,
      "question": "what a drifted promise does to a run"
    },
    "boundary": {
      "contested": false,
      "question": "what a refused area does to a wave"
    },
    "handoff": {
      "contested": false,
      "question": "whether a non-engineer may write a graded surface"
    },
    "budget": {
      "contested": false,
      "question": "how a cost forecast is computed and shown"
    },
    "aftermath": {
      "contested": false,
      "question": "how far back a run is graded from the repo's future"
    },
    "challenge": {
      "contested": false,
      "question": "what counts as a pass, and which lenses run"
    },
    "doc": {
      "contested": false,
      "question": "how a long document is written and checked"
    },
    "wiki": {
      "contested": false,
      "question": "how the project wiki is scanned and when it is stale"
    },
    "crosslink": {
      "contested": false,
      "question": "when a peer repo's wiki reads stale"
    },
    "retro": {
      "contested": false,
      "question": "where a retro is delivered"
    },
    "paths": {
      "contested": false,
      "question": "where ORC writes on disk"
    },
    "session": {
      "contested": false,
      "question": "what the main session itself runs as"
    }
  },
  behavior_trace: { always_on: true, configurable_key: "log_dir" },
};

// Deliberately UNHEALTHY, and with the global-install finding present — the
// banner §1 requires can only be designed against a doctor that reports it.

module.exports = { config };
