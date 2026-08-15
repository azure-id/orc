"use strict";
/* fixtures/settings.js — canned data for `orc ui --fixtures`.
   The full config list, including a SHADOWED key: you cannot design the lock
   and its explanation against a config where nothing is shadowed.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

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

module.exports = { config };
