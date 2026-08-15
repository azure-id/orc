"use strict";
/* fixtures/flow.js — canned data for `orc ui --fixtures`.
   A compiled DIY flow with an OFF phase, so the red struck-through step is
   designable.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

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

module.exports = { diy };
