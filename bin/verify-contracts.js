#!/usr/bin/env node
"use strict";
/**
 * Contract drift lint. The integrity guard (verify-package.js) checks file
 * COUNTS; this checks CONTRACT CONSISTENCY across ORC's by-design maintenance
 * drift: shared return/slice contracts are duplicated across many payload
 * files, and a partial edit ships a forked contract the orchestrator will
 * reject at runtime.
 *
 * Data-driven: each contract = a fixed-string token + the EXACT set of files
 * under templates/ expected to carry it. Fails loudly when a token is missing
 * from an expected file (a drift copy was skipped) OR appears in an unexpected
 * file (a new copy was added without registering it here).
 *
 * RULE: any commit that adds/removes a contract copy updates the table below
 * IN THE SAME COMMIT. Runs with `npm run verify` and on prepack.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "templates");

// token: fixed string (no regex). files: paths relative to templates/, sorted.
const CONTRACTS = [
  {
    name: "actual_model / actual_effort return (claimed-vs-actual model check)",
    token: "actual_model",
    files: [
      "agents/MODEL-MAPPING.md",
      "agents/orc-advisor-fable-5.md",
      "agents/orc-advisor-opus-5-xhigh.md",
      "agents/orc-analyst-fable-5.md",
      "agents/orc-analyze-mini-opus-5-med.md",
      "agents/orc-analyze-mini-sonnet-5-high.md",
      "agents/orc-challenge-advisor-opus-5-med.md",
      "agents/orc-challenge-judge-opus-5-high.md",
      "agents/orc-challenge-reader-opus-5-low.md",
      "agents/orc-claude-writer-opus-4-8-high.md",
      "agents/orc-claude-writer-opus-5-med.md",
      "agents/orc-context-combiner-opus-5-high.md",
      "agents/orc-doc-checker-opus-5-low.md",
      "agents/orc-doc-writer-opus-5-med.md",
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "agents/orc-judge-fable-5.md",
      "agents/orc-judge-opus-5-xhigh.md",
      "agents/orc-learn-writer-opus-5-low.md",
      "agents/orc-pattern-codifier-opus-5-med.md",
      "agents/orc-pattern-codifier-sonnet-5-high.md",
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "agents/orc-retro-opus-5-med.md",
      "agents/orc-retro-sonnet-5-high.md",
      "agents/orc-reviewer-fable-5.md",
      "agents/orc-reviewer-opus-5-med.md",
      "agents/orc-scout-opus-5-low.md",
      "agents/orc-scout-sonnet-4-6-high.md",
      "agents/orc-system-analyst-opus-5-high.md",
      "agents/orc-test-author-opus-5-med.md",
      "agents/orc-trace-writer-haiku-4-5.md",
      "agents/orc-verifier-opus-5-med.md",
      "agents/orc-wiki-scanner-opus-4-8-high.md",
      "agents/orc-wiki-scanner-opus-5-med.md",
      "agents/orc-wiki-scanner-sonnet-5-high.md",
      "hooks/orc-trace.js",
      "skills/_shared/return-validation.md",
      "skills/orc-advisor/SKILL.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-budget/SKILL.md",
      "skills/orc-budget/references/corpus.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-claude/examples/claude-run-mock.md",
      "skills/orc-diy/references/blocks/trace.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/examples/orc-doc-prd-run.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-judge/SKILL.md",
      "skills/orc-learn/SKILL.md",
      "skills/orc-learn/examples/learn-run-mock.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-mini/examples/mini-run-mock.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-quick/references/dispatch-gate.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc-retro/examples/retro-mock.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc/README.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/schemas/checkpoint.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
      "skills/orc/subskills/orc-testgen/core.md",
    ],
  },
  {
    name: "pattern invariants_checked attestation (executor return)",
    token: "invariants_checked",
    files: [
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/_shared/return-validation.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc/README.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/pattern-gate.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
    ],
  },
  {
    name: "house_rules standing card (slice injection)",
    token: "house_rules",
    files: [
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/house-rules.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
    ],
  },
  {
    name: "validation_gate[] flow (codify -> slice -> review -> verify)",
    token: "validation_gate",
    files: [
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "agents/orc-pattern-codifier-opus-5-med.md",
      "agents/orc-pattern-codifier-sonnet-5-high.md",
      "agents/orc-reviewer-fable-5.md",
      "agents/orc-reviewer-opus-5-med.md",
      "agents/orc-verifier-opus-5-med.md",
      "skills/orc-pattern/SKILL.md",
      "skills/orc-pattern/schemas/pattern-doc.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/pattern-gate.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
    ],
  },
  {
    name: "executor evidence contract (v0.7.0 — verbatim build/test proof)",
    token: "no_runner_detected",
    files: [
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/_shared/return-validation.md",
      "skills/orc/SKILL.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
    ],
  },
  {
    name: "executor unmet[] honest-status contract (v0.7.0)",
    token: "unmet[]",
    files: [
      // v0.40.0: a verifier unmet[] the same run CLOSED is a recordable gotcha.
      "skills/_shared/gotchas.md",
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/_shared/return-validation.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-mini/examples/mini-run-mock.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc/README.md",
      "skills/orc/SKILL.md",
      "skills/orc/examples/full-run-mock.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
    ],
  },
  {
    name: "planner grounding attestation (v0.7.0 — disposition: exists|new)",
    token: "disposition",
    files: [
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      // v0.41.0: `disposition` is also the TDD scoping field (new-surface |
      // behavior-change | covered-by-existing | no-behavior | no-runner), so
      // these three carry the token for that reason, not for grounding.
      "skills/orc-diy/references/blocks/execution.md",
      "skills/orc-diy/references/flow-schema.md",
      "skills/orc/config.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/references/preflight-report.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
      // v0.42.0: /orc-explain names ORC jargon in order to DEFINE it for a user
      // who did not follow a message. A vocabulary mention, not a second copy of
      // the grounding contract — registered so the set-equality check stays true.
      "commands/orc-explain.md",
      "skills/orc-explain/SKILL.md",
    ],
  },
  {
    name: "findings evidence-or-advisory rule (v0.7.0 — unanchored => AUTO-P3)",
    token: "AUTO-P3",
    files: [
      "agents/orc-reviewer-fable-5.md",
      "agents/orc-reviewer-opus-5-med.md",
      "agents/orc-verifier-opus-5-med.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
      "skills/orc-verify/SKILL.md",
    ],
  },
  {
    name: "P0-P3 severity enum (findings shape)",
    token: "P0|P1|P2|P3",
    files: [
      "agents/orc-reviewer-fable-5.md",
      "agents/orc-reviewer-opus-5-med.md",
      "agents/orc-verifier-opus-5-med.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
    ],
  },
  {
    // v0.34.1: binFiles pins it to the CLI registry too — the key was
    // documented, read, and linted here while `orc config` had never heard of
    // it (a phantom key nothing could set).
    name: "retro delivery target (v0.8.1 — PR/issue to retro_repo, channel-gated)",
    token: "retro_repo",
    binFiles: ["bin/cli.js"],
    files: [
      "commands/orc-retro.md",
      "skills/orc/config.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc-retro/examples/retro-mock.md",
    ],
  },
  {
    name: "analyst absence attestation (v0.9.0 — searched: notes on missing/buildable)",
    token: "searched:",
    files: [
      "agents/orc-analyst-fable-5.md",
      "agents/orc-analyze-mini-opus-5-med.md",
      "agents/orc-analyze-mini-sonnet-5-high.md",
      "agents/orc-system-analyst-opus-5-high.md",
      // v0.39.0: the read ladder's anti-chain rule ends in a `searched:` return,
      // so a rename of the attestation field has to reach it too.
      "skills/_shared/read-ladder.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-analyze/references/deep-mode.md",
      "skills/orc-analyze/schemas/report-audit.md",
      "skills/orc-analyze/schemas/report-prose.md",
      "skills/orc-analyze/schemas/report-requirement.md",
      "skills/orc-analyze/schemas/requirement-spec.md",
    ],
  },
  {
    name: "spec staleness stamp (v0.9.0 — git_head recorded at analysis time)",
    token: "git_head",
    files: [
      "agents/orc-analyst-fable-5.md",
      "agents/orc-analyze-mini-opus-5-med.md",
      "agents/orc-analyze-mini-sonnet-5-high.md",
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-opus-5-med.md",
      "agents/orc-system-analyst-opus-5-high.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-analyze/schemas/requirement-spec.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-poly/references/poly-spec.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    name: "plan coverage gate (v0.9.0 — orphan requirement = malformed plan)",
    token: "orphan",
    files: [
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "commands/orc-plan.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    name: "spec invariants last-mile wiring (v0.9.0 — task field -> slice constraints[])",
    token: "spec_invariants",
    files: [
      "skills/orc-doc/SKILL.md",
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "commands/orc-pact.md",
      "skills/_shared/interview.md",
      "skills/_shared/lane-suspend.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-brainstorm/references/brainstorm-doc.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-grill/references/grill-doc.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-pact/references/gate.md",
      "skills/orc-pact/references/ledger.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/preflight-report.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    name: "GATE trace verb (v0.9.0 — deterministic exit-gate pass/bounce lines)",
    token: "`GATE",
    files: [
      "agents/orc-retro-opus-5-med.md",
      "agents/orc-retro-sonnet-5-high.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-diy/references/blocks/trace.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-poly/examples/poly-run-mock.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/effort-and-mode.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/references/stop-and-resume.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/references/ultra-mode.md",
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-setup/SKILL.md",
      "skills/orc/subskills/orc-pr/stack-gate.md",
      // v0.42.0: the run_budget_dispatches gate — a forecast over budget STOPS
      // before wave 1 with the batch pause`s discipline, and says so in the trace.
      "skills/orc/config.md",
      "skills/orc/references/preflight-report.md",
    ],
  },
  {
    name: "ultra lane trigger (v0.10.0 — /orc-ultra forces ultra_mode run-scoped)",
    token: "ultra_mode",
    files: [
      "commands/orc-ultra.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/references/ultra-mode.md",
      "skills/orc/schemas/checkpoint.md",
    ],
  },
  {
    name: "ultra advisor brief handoff (v0.10.0 — brief_path return -> slice injection)",
    token: "brief_path",
    files: [
      "agents/orc-advisor-fable-5.md",
      "agents/orc-advisor-opus-5-xhigh.md",
      "skills/orc-advisor/SKILL.md",
      "skills/orc/references/ultra-mode.md",
      "skills/orc/schemas/checkpoint.md",
    ],
  },
  {
    name: "ultra verdict discipline (v0.10.0 — blocking needs anchor + failure_consequence)",
    token: "failure_consequence",
    files: [
      "agents/orc-judge-fable-5.md",
      "agents/orc-judge-opus-5-xhigh.md",
      "skills/orc-judge/SKILL.md",
      "skills/orc/references/ultra-mode.md",
    ],
  },
  {
    // The v0.19.0 fix for "the trace only got one line": every trace-owning
    // lane states the running-record cadence + this self-check inline, so a
    // lane cannot quietly treat the trace as an end-of-run summary. v0.32.0
    // moved the PEN to orc-trace-writer-haiku-4-5, so the writer's own
    // self-check carries the token too — the cadence is now a dispatch
    // obligation, not a memory one.
    name: "behavior-trace write cadence (v0.19.0 — append per event, never batched at the end)",
    token: "zero new trace lines is a protocol violation",
    files: [
      "agents/orc-trace-writer-haiku-4-5.md",
      "skills/orc-aftermath/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-budget/SKILL.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-diy/references/blocks/trace.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-export/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-handoff/SKILL.md",
      "skills/orc-learn/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-setup/SKILL.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-route/SKILL.md",
      "skills/orc-verify/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
    ],
  },
  {
    // v0.34.2: the pointer alone was never enough. `traceStats` cannot tell a
    // pointer written two seconds ago (file not created yet) from a dangling
    // one, so every lane's own run-start step split its run across two files —
    // 9 orphan traces across 15 evals, the largest defect family in the corpus.
    // Creating the file in the SAME step makes the hook's existence check true
    // by construction. Pinned to every lane that writes a pointer, so the next
    // lane added cannot quietly omit it (the hook fix is independent, on
    // purpose — neither half relies on the other).
    name: "trace file created with the pointer (v0.34.2 — kills the .current clobber)",
    token: "touch the trace file",
    files: [
      "skills/_shared/lane-suspend.md",
      "skills/orc-aftermath/SKILL.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-budget/SKILL.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-diy/references/blocks/trace.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-export/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-handoff/SKILL.md",
      "skills/orc-learn/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-pattern/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-setup/SKILL.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-route/SKILL.md",
      "skills/orc-verify/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    name: "behavior-trace run pointer (every ORC entry point writes .current)",
    token: ".current",
    files: [
      "agents/orc-trace-writer-haiku-4-5.md",
      "hooks/orc-trace.js",
      "skills/_shared/lane-suspend.md",
      "skills/context-combiner/SKILL.md",
      "skills/orc-aftermath/SKILL.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-budget/SKILL.md",
      "skills/orc-budget/references/corpus.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/examples/tsd-two-iterations.md",
      "skills/orc-challenge/references/fix-brief.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-diy/references/blocks/trace.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/examples/orc-doc-prd-run.md",
      "skills/orc-export/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-handoff/SKILL.md",
      "skills/orc-learn/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-pattern/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-setup/SKILL.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-route/SKILL.md",
      "skills/orc-verify/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/references/stop-and-resume.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    // v0.32.0: narration is DISPATCHED, not remembered. The pen moved from the
    // orchestrator's memory to a pinned Haiku writer dispatched at every phase
    // close. Pinned to the canonical protocol + the three build-lane spines +
    // orc-wiki's (the multi-dispatch lane) + the roster. Single-dispatch lanes
    // (orc-claude/plan/analyze/pattern/verify/learn/poly/combiner) inherit the
    // one-packet obligation from trace-protocol.md's canonical section, so they
    // are DELIBERATELY not in this set — do not add them.
    name: "trace narration writer (v0.32.0 — every phase close dispatches the writer)",
    token: "orc-trace-writer-haiku-4-5",
    files: [
      "agents/MODEL-MAPPING.md",
      "agents/orc-trace-writer-haiku-4-5.md",
      "hooks/orc-trace.js",
      "skills/_shared/fable5-override.md",
      "skills/_shared/opus5-only.md",
      "skills/orc-aftermath/SKILL.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-boundary/references/gate.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-budget/SKILL.md",
      "skills/orc-diy/references/blocks/trace.md",
      "skills/orc-export/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-handoff/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-pact/references/gate.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-route/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
        ],
  },
  {
    // v0.32.0: the hook's zero-model-dependence phase segmentation. Producer
    // (the hook) and both consumers (retro skill + its miner) must agree on the
    // verb and its role families.
    name: "deterministic phase inference (v0.32.0 — hook-emitted PHASE-EDGE)",
    token: "PHASE-EDGE",
    files: [
      "agents/orc-retro-opus-5-med.md",
      "agents/orc-retro-sonnet-5-high.md",
      "hooks/orc-trace.js",
      "skills/orc-retro/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/trace-protocol.md",
      // v0.42.0: the combiner is segmented as its own PHASE-EDGE family INSIDE the
      // analyze trace — the reason it needs no lane of its own.
      "skills/context-combiner/SKILL.md",
    ],
  },
  {
    // v0.32.0: the rich run filename. The hook documents it (and bootstraps the
    // generic name the writer renames); the protocol defines the grammar; retro
    // aggregates per lane straight from it.
    name: "rich trace filename (v0.32.0 — run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt)",
    token: "run-<lane>-<slug>-",
    files: [
      "agents/orc-retro-opus-5-med.md",
      "agents/orc-retro-sonnet-5-high.md",
      "agents/orc-trace-writer-haiku-4-5.md",
      "hooks/orc-trace.js",
      "skills/orc-retro/SKILL.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/schemas/checkpoint.md",
    ],
  },
  {
    name: "wiki registration writer (v0.18.0 — manifest+INDEX derived by the CLI, never hand-written)",
    token: "orc wiki sync",
    binFiles: ["bin/cli.js"],
    files: [
      "agents/orc-wiki-scanner-opus-4-8-high.md",
      "agents/orc-wiki-scanner-opus-5-med.md",
      "agents/orc-wiki-scanner-sonnet-5-high.md",
      "commands/orc-export.md",
      "commands/orc-wiki.md",
      "hooks/orc-statusline.js",
      "skills/orc-export/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/orientation.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc-wiki/schemas/wiki-doc.md",
        ],
  },
  {
    name: "wiki CROSSLINK-ONLY branch (v0.18.0 — publish tags from existing docs; never a re-scan)",
    token: "CROSSLINK-ONLY",
    files: [
      "commands/orc-wiki.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
    ],
  },
  {
    name: "wiki UNREGISTERED state (v0.18.0 — docs without a manifest ≠ no wiki; sync, never re-scan)",
    token: "UNREGISTERED",
    files: [
      "hooks/orc-statusline.js",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc-wiki/references/staleness.md",
        ],
  },
  {
    name: "wiki freshness manifest (v0.11.0 — written ONLY by `orc wiki sync`, computed on read)",
    token: "wiki-meta.json",
    binFiles: ["bin/cli.js"],
    files: [
      "hooks/orc-statusline.js",
      "skills/_shared/detecting-artifacts.md",
      "skills/orc-challenge/references/cycle-state.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-learn/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-poly/examples/poly-run-mock.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/wiki-consult.md",
    ],
  },
  {
    // v0.25.0: existence detection is a shared contract so a generated wiki /
    // pattern is never missed by an ad-hoc find/glob against the hidden .claude
    // dir. Canonical prose: skills/_shared/detecting-artifacts.md; the
    // deterministic probes are `orc wiki status` + `orc pattern status` in
    // bin/cli.js (CLI half — documented drift the lint's templates/ root can't
    // see). Token = the pointer every knowledge-gated consumer carries.
    name: "artifact existence probe (v0.25.0 — deterministic CLI, never ad-hoc find)",
    token: "detecting-artifacts.md",
    files: [
      "skills/_shared/README.md",
      "skills/_shared/gotchas.md",
      "skills/_shared/interview.md",
      "skills/_shared/read-ladder.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-boundary/references/card.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-brainstorm/references/lenses.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/examples/code-module.md",
      "skills/orc-challenge/references/cycle-state.md",
      "skills/orc-challenge/references/kinds.md",
      "skills/orc-diy/references/flow-schema.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-handoff/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-route/SKILL.md",
      "skills/orc-verify/SKILL.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc/references/pattern-gate.md",
      "skills/orc/references/wiki-consult.md",
    ],
  },
  {
    // v0.42.0: the interview mechanic (design tree → frontier → rounds →
    // confirmation gate) is shared prose, not one lane's trick — /orc-grill
    // runs it end to end and intake.md borrows its round format. Canonical
    // copy: skills/_shared/interview.md. Token = the pointer every consumer
    // carries, so a lane cannot fork its own divergent interview.
    name: "the interview primitive (v0.42.0 — frontier rounds, facts vs decisions)",
    token: "_shared/interview.md",
    files: [
      "commands/orc-grill.md",
      "skills/_shared/README.md",
      "skills/_shared/interview.md",
      "skills/_shared/lane-suspend.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc/references/intake.md",
    ],
  },
  {
    // The one rule that makes an interview load-bearing rather than a good
    // conversation: a settled decision must come from the human. Pinned
    // verbatim so no lane can soften it into "assume a sensible default".
    name: "interview decisions belong to the user (v0.42.0)",
    token: "a lane that answers its own interview question",
    files: [
      "skills/_shared/interview.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-grill/SKILL.md",
    ],
  },
  {
    // v0.45.0: the DIVERGENT mirror of the rule above. Generating options is
    // ORC's job; choosing between them is the user's. Registered as its own
    // token, and deliberately pinned to interview.md as well, so the pair stays
    // a pair — a brainstorm that starts picking and a grill that starts
    // answering are the same drift seen from two sides.
    name: "generated options belong to the user (v0.45.0 — the divergent mirror)",
    token: "a lane that picks its own favourite",
    files: [
      "skills/_shared/interview.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-challenge/SKILL.md",
    ],
  },
  {
    // v0.47.0: the THIRD member of the pair above. Same split every time — facts
    // and findings are ORC's, the work and the decision are the user's — but here
    // it is the WORK that must stay the user's: a session that just wrote the fix
    // will grade its own homework, and it will always pass. The separation is not
    // friction; it is the measuring instrument.
    name: "the grader never repairs (v0.47.0 — /orc-challenge)",
    token: "a lane that fixes what it judged",
    files: [
      "skills/_shared/interview.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-doc/SKILL.md",
    ],
  },
  {
    // The same contract applied to the PURPOSE of the review rather than to a
    // design question. A finding is only a finding relative to a goal, and a
    // DEFENSIBLE finding about the wrong thing is worse than an obviously wrong
    // one — the user burns three iterations on what did not matter. Mirrored in
    // bin/cli.js, where `--goal` has no default and `init` refuses by name.
    name: "the review's goal is the user's to state (v0.47.0 — /orc-challenge intake)",
    token: "a lane that guesses the user's goal",
    files: [
      "skills/_shared/interview.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/intake.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // The frozen goal is a PATH in every dispatch, never prose — which is the
    // whole reason it is written to disk at intake instead of being retyped into
    // each slice. `goals.md` is also a filename the CLI owns.
    name: "the frozen goal file (v0.47.0 — /orc-challenge)",
    token: "goals.md",
    files: [
      "agents/orc-challenge-advisor-opus-5-med.md",
      "agents/orc-challenge-judge-opus-5-high.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/examples/tsd-two-iterations.md",
      "skills/orc-challenge/references/cycle-state.md",
      "skills/orc-challenge/references/dimensions.md",
      "skills/orc-challenge/references/fix-brief.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-challenge/references/sealed-slice.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // A fix is a CLAIM; a verdict is EVIDENCE. The moment the judge is handed a
    // summary of what changed, it is grading the summary — written by the party
    // with an interest in passing.
    name: "the sealed judge slice (v0.47.0 — paths and ids only)",
    token: "judge slice is SEALED",
    files: [
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/sealed-slice.md",
    ],
  },
  {
    // Rule 2. A judge that CAN pass something can be talked into passing
    // something; a judge that can only find, or fail to find, cannot.
    name: "PASS is the CLI's, never the judge's (v0.47.0)",
    token: "PASS is computed, never declared",
    files: [
      "skills/orc-doc/references/gates.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/rubric.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // The cycle folder. Project root, one folder per slug ever, never staged —
    // and never inside .claude/, because the review trail is a deliverable the
    // user may want in a pull request.
    name: "the challenge cycle folder (v0.47.0)",
    token: "orc/orc-challenge/",
    files: [
      "agents/orc-challenge-judge-opus-5-high.md",
      "skills/orc-challenge/examples/code-module.md",
      "skills/orc-challenge/examples/tsd-two-iterations.md",
      "skills/orc-challenge/references/fix-brief.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-challenge/references/sealed-slice.md",
      "skills/orc-challenge/references/verdict-doc.md",
      // The /orc-export seam: a PASSED cycle is portable evidence that a spec was
      // checked, not just written. An in-flight one is never exported.
      "skills/orc-export/SKILL.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "the paste-into-a-fresh-session brief (v0.47.0)",
    token: "fix-brief-",
    files: [
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/examples/tsd-two-iterations.md",
      "skills/orc-challenge/references/fix-brief.md",
      "skills/orc-challenge/references/intake.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // The block that stops the resumed session asking where the fix went. That
    // is a fact the cycle already owns, and asking for it is rule 0's failure
    // mode in miniature.
    name: "the declared revision location (v0.47.0)",
    token: "Where to put the revised version",
    files: [
      "skills/orc-challenge/references/fix-brief.md",
      "skills/orc-challenge/references/intake.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // It LISTS, it does not adopt: a judge pointed at the wrong file produces a
    // page of confident, useless findings.
    name: "the missing-revision state (v0.47.0)",
    token: "MISSING-REVISION",
    files: [
      "skills/orc-challenge/references/cycle-state.md",
      "skills/orc-challenge/references/fix-brief.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // THE LEDGER, and `orc challenge` is its only writer — the same rule
    // wiki-meta.json lives under.
    name: "the challenge ledger (v0.47.0 — CLI-only writer)",
    token: "challenge.json",
    files: ["skills/orc-challenge/references/cycle-state.md"],
    binFiles: ["bin/cli.js"],
  },
  {
    // The trace verb, pinned the way `CROSSLINK` is. The CLI assembles the line
    // (`record` returns it as `trace_line`), so a second wording anywhere would
    // be a second count of the same iteration.
    name: "the CHALLENGE trace verb (v0.47.0)",
    token: "CHALLENGE iter=",
    files: [
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/examples/tsd-two-iterations.md",
      "skills/orc/references/trace-protocol.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // v0.45.0: the SUSPEND contract — leave mid-run, let another lane settle one
    // thing, come back and finish. The opposite shape to FALLBACK-FROM, which
    // leaves and does not return. Canonical prose: _shared/lane-suspend.md.
    name: "lane suspend/resume canonical pointer (v0.45.0 — _shared/lane-suspend.md)",
    token: "_shared/lane-suspend.md",
    files: [
      "skills/_shared/README.md",
      "skills/_shared/lane-suspend.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc/references/trace-protocol.md",
    ],
  },
  {
    // v0.45.0: the marker itself. Both halves of a suspend must agree on it, and
    // the receiving lane's extra exit exists ONLY under it.
    name: "suspend marker (v0.45.0 — RETURN-TO, the sender finishes the run)",
    token: "RETURN-TO",
    files: [
      "commands/orc-brainstorm.md",
      "skills/_shared/README.md",
      "skills/_shared/lane-suspend.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc/references/trace-protocol.md",
    ],
  },
  {
    // v0.45.0: the brainstorm deliverable's location. Project root, one .md per
    // slug ever, never staged — same discipline as orc-quick/ and orc-grill/.
    name: "brainstorm deliverable location (v0.45.0 — orc/brainstorming-session/<slug>/)",
    token: "orc/brainstorming-session/",
    files: [
      "commands/orc-brainstorm.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-brainstorm/references/brainstorm-doc.md",
      "skills/orc-pact/SKILL.md",
        ],
  },
  {
    // v0.45.0: the open slot. The entire value of a brainstorm is the idea ORC
    // did not think of; a closed menu is a survey. Pinned verbatim because it is
    // exactly the kind of rule a later edit "tidies" into a trailing sentence.
    name: "the open slot (v0.45.0 — every menu ends with the user's own words)",
    token: "ends with a slot for the user's own words",
    files: [
      "skills/orc-brainstorm/SKILL.md",
      "commands/orc-brainstorm.md",
    ],
  },
  {
    // v0.42.0: the analyst gate mirrors the planner’s plannable floor. Both
    // sentences must stay literally identical wherever they are stated, or a
    // lane quietly widens its own entry criteria and thin input walks back in.
    name: "analyzable floor (v0.42.0 — the analyst’s mirror of plannable)",
    token: "analyzable ⇔ the input names",
    files: [
      "skills/orc-analyze/SKILL.md",
      "skills/orc-analyze/references/thin-input.md",
      "skills/orc-grill/SKILL.md",
      // v0.45.0: brainstorm's exit 2 reuses the SAME sentence — a second
      // definition of "analyzable" is drift the lint cannot see.
      "skills/orc-brainstorm/SKILL.md",
    ],
  },
  {
    // v0.42.0: the resume pointer. ORC writes it at every stop and DELETES it at
    // FINISH, so the file existing IS the "this run is unfinished" flag — there
    // is no second consumed/not-consumed record to drift. `orc resume` and
    // `orc run list` both read it, hence the bin mirror: a rename on either
    // side breaks discovery for every paused run on disk.
    name: "resume pointer file (v0.42.0 — written at every stop, deleted at FINISH)",
    token: "RESUME.md",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/examples/tsd-two-iterations.md",
      "skills/orc-challenge/references/fix-brief.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/examples/orc-doc-prd-run.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-doc/references/resume-protocol.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/stop-and-resume.md",
      "skills/orc-doc/README.md",
      "skills/orc-doc/references/chunking.md",
    ],
  },
  {
    // v0.42.0: the one deterministic summary line `orc stats` reads. Pinned to
    // the protocol (where every trace-owning lane picks the obligation up), the
    // orc spine Phase 8 (where it is emitted), and the CLI that parses it.
    name: "STATS trace line (v0.42.0 — the line orc stats reads)",
    token: "STATS lane=",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
    ],
  },
  {
    name: "wiki freshness tier enum (v0.11.0 — FRESH/AGING/STALE, computed on read)",
    token: "AGING",
    files: [
      "hooks/orc-statusline.js",
      "skills/_shared/gotchas.md",
      "skills/_shared/interview.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-learn/SKILL.md",
      "skills/orc-learn/references/refresh.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-poly/examples/poly-run-mock.md",
      "skills/orc-poly/references/gather.md",
      "skills/orc-route/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/wiki-consult.md",
        ],
  },
  {
    name: "post-ship wiki refresh ask (v0.11.0 — BIG-run trigger, full+ultra lanes)",
    token: "wiki_refresh_ask",
    files: [
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc-wiki/references/staleness.md",
    ],
  },
  {
    name: "fast->mini fallback handoff (v0.11.0 — orc-fast never stops the chat)",
    token: "FALLBACK-FROM",
    files: [
      "skills/_shared/fallback-handoff.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      // v0.45.0: lane-suspend.md defines itself AGAINST this contract — leaving
      // and returning vs leaving for good. Naming the sibling is the point.
      "skills/_shared/lane-suspend.md",
    ],
  },
  {
    name: "orc-claude generated-file meta header (v0.13.0 — version/date/budget/fingerprints)",
    token: "orc-claude:meta",
    files: [
      "skills/orc-claude/SKILL.md",
      "skills/orc-claude/examples/claude-run-mock.md",
      "skills/orc-claude/references/refresh.md",
      "skills/orc-claude/references/template.md",
    ],
  },
  {
    name: "orc-claude section fence grammar (v0.13.0 — surgical section-scoped refresh)",
    token: "orc-claude:section",
    files: [
      "skills/orc-claude/SKILL.md",
      "skills/orc-claude/references/refresh.md",
      "skills/orc-claude/references/template.md",
    ],
  },
  {
    name: "wiki pointer-block marker (owned by orc-wiki; orc-claude byte-preserves it)",
    token: "ORC-WIKI:START",
    files: [
      "agents/orc-claude-writer-opus-4-8-high.md",
      "agents/orc-claude-writer-opus-5-med.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-claude/references/refresh.md",
      "skills/orc-wiki/references/claude-md-injection.md",
    ],
  },
  {
    name: "combiner conservation gate (v0.12.0 — coverage must be 100 before handoff)",
    token: "coverage_pct",
    files: [
      "agents/orc-context-combiner-opus-5-high.md",
      "skills/context-combiner/SKILL.md",
      "skills/context-combiner/schemas/combined-report.md",
      "skills/context-combiner/schemas/combined-requirement-spec.md",
      "skills/orc-analyze/references/branching.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/conservation.md",
      "skills/orc-challenge/references/cycle-state.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
    ],
  },
  {
    name: "combiner overlap taxonomy (v0.12.0 — partial overlaps split, never collapsed)",
    token: "PARTIAL-OVERLAP",
    files: [
      "agents/orc-context-combiner-opus-5-high.md",
      "skills/context-combiner/SKILL.md",
      "skills/context-combiner/schemas/combined-report.md",
    ],
  },
  {
    name: "combiner eager decision checkpoint (v0.12.0 — verdicts survive compaction)",
    token: "combine-decisions.md",
    files: [
      "agents/orc-context-combiner-opus-5-high.md",
      "skills/context-combiner/SKILL.md",
      "skills/context-combiner/schemas/combined-report.md",
    ],
  },
  {
    name: "wiki per-file hash map (v0.15.0 — doc header + manifest docs registry)",
    token: "covered_files",
    files: [
      "agents/orc-learn-writer-opus-5-low.md",
      "agents/orc-wiki-scanner-opus-4-8-high.md",
      "agents/orc-wiki-scanner-opus-5-med.md",
      "agents/orc-wiki-scanner-sonnet-5-high.md",
      "skills/orc-learn/references/refresh.md",
      "skills/orc-learn/references/template-knowledge.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/wiki-doc.md",
        ],
  },
  {
    name: "wiki doc schema version marker (v0.15.0 — v1 docs upgrade lazily)",
    token: "wiki_schema",
    files: [
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/schemas/wiki-doc.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/staleness.md",
    ],
  },
  {
    name: "wiki scan-end integrity gate trace verb (v0.15.0)",
    token: "WIKI-CHECK",
    files: [
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/integrity-check.md",
    ],
  },
  {
    name: "wiki-consult grounding trace verb (v0.17.3 — every lane that grounds in the wiki)",
    token: "WIKI-CONSULT",
    files: [
      "skills/orc-fast/SKILL.md",
      "skills/orc-learn/SKILL.md",
      "skills/orc-learn/examples/learn-run-mock.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-poly/examples/poly-run-mock.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/references/wiki-consult.md",
    ],
  },
  {
    // v0.28.0: full orc now surfaces cross-repo peer-knowledge state (the
    // consult-point report + a CROSSLINK trace verb) so a user can tell whether
    // peer contracts were injected. Token = the trace verb, pinned to the spine
    // + the closed verb table + the canonical consult mechanism.
    name: "crosslink trace verb + run-time report (v0.28.0 — peer-knowledge visibility)",
    token: "`CROSSLINK ",
    files: [
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/references/wiki-consult.md",
    ],
  },
  {
    // v0.30.0: the Fable 5 role override. The shared paragraph is canonical
    // under _shared/; the lint pins its pointer into every lane that honors it.
    // The config keys themselves are pinned by the config-key coverage lint.
    name: "fable5 role override (v0.30.0 — hard-gated role→fable-5 dispatch)",
    token: "fable5-override.md",
    files: [
      "skills/_shared/README.md",
      "skills/_shared/fable5-override.md",
      "skills/_shared/opus5-only.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/ultra-mode.md",
    ],
  },
  {
    // v0.36.0: the Opus-5-only dispatch mode. Widened from v0.35.0's
    // executor-table-only key, so the pointer has to reach every lane with a
    // fixed-role dispatch — not just the ones that score.
    name: "opus5-only dispatch mode (v0.36.0 — forcing role→opus-5 dispatch)",
    token: "opus5-only.md",
    files: [
      "agents/MODEL-MAPPING.md",
      "skills/_shared/README.md",
      "skills/_shared/drift-recovery.md",
      "skills/_shared/fable5-override.md",
      "skills/_shared/opus5-only.md",
      "skills/orc-analyze/references/deep-mode.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pattern/SKILL.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc-wiki/references/pattern-prewarm.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/pattern-gate.md",
      "skills/orc/references/ultra-mode.md",
        ],
  },
  {
    // The config key itself mirrors bin/cli.js's CONFIG_META entry — a rename on
    // either side is a silent revert of the user's setting, so pin both.
    name: "opus5_only config key (v0.36.0 — CLI ↔ payload mirror)",
    token: "opus5_only",
    binFiles: ["bin/cli.js"],
    files: [
      "agents/MODEL-MAPPING.md",
      "agents/orc-analyze-mini-opus-5-med.md",
      "agents/orc-claude-writer-opus-5-med.md",
      "agents/orc-pattern-codifier-opus-5-med.md",
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-retro-opus-5-med.md",
      "agents/orc-scout-opus-5-low.md",
      "agents/orc-wiki-scanner-opus-5-med.md",
      "agents/orc-wiki-scanner-sonnet-5-high.md",
      "commands/orc-pattern.md",
      "skills/_shared/drift-recovery.md",
      "skills/_shared/fable5-override.md",
      "skills/_shared/opus5-only.md",
      "skills/orc-analyze/references/deep-mode.md",
      "skills/orc-challenge/README.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-diy/README.md",
      "skills/orc-doc/README.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pattern/SKILL.md",
      "skills/orc-quick/README.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-quick/references/dispatch-gate.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc-wiki/references/pattern-prewarm.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/effort-and-mode.md",
      "skills/orc/references/pattern-gate.md",
      "skills/orc/references/preflight-report.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/references/ultra-mode.md",
    ],
  },
  {
    name: "CONFIG trace verb (v0.30.0 — Phase 1 resolved-config runtime proof)",
    token: "`CONFIG ",
    files: [
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
    ],
  },
  {
    // v0.31.0: the plan-handoff entry contract. Recognising a plan INPUT (vs a
    // request) and re-grounding/re-scoring it in the executing session is pinned
    // to the reference + the two triggers (spine Phase 0, intake) + the command.
    name: "plan-handoff entry contract (v0.31.0 — execute a plan from another session)",
    token: "plan-handoff.md",
    files: [
      "commands/orc.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/intake.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/schemas/planning-output.md",
      // v0.42.0: /orc-route REUSES this file`s plan-input definition rather than
      // writing a second one — a second definition of `what counts as a plan` is
      // drift the lint cannot see.
      "commands/orc-route.md",
      "skills/orc-route/SKILL.md",
    ],
  },
  {
    // v0.31.0: the scoring revamp. The planner emits per-task `facets` (facts);
    // the orchestrator computes the score arithmetically and re-validates them.
    // The facet block is copied across the schema, the formula, the spine, the
    // trace verb, and all three planner agents — pin them together.
    name: "facet-scored rubric (v0.31.0 — planner-emitted facets, orchestrator arithmetic)",
    token: "facets",
    files: [
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "agents/orc-retro-opus-5-med.md",
      "agents/orc-retro-sonnet-5-high.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc/README.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/examples/full-run-mock.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/effort-and-mode.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/references/wave-grouping.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
      "commands/orc-route.md",
      "skills/orc-route/SKILL.md",
      "skills/orc/references/preflight-report.md",
    ],
  },
  {
    // v0.31.0: HEAD-at-plan-time staleness stamp — the plan-handoff entry
    // contract's mirror of the requirement-spec's git_head.
    name: "plan staleness stamp (v0.31.0 — plan_head drives the plan-handoff grounding re-check)",
    token: "plan_head",
    files: [
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/intake.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    name: "wiki cross-cutting reference maps (v0.15.0 — consumers pull by name)",
    token: "orc-reference-api-surface",
    files: [
      "skills/orc/SKILL.md",
      "skills/orc/references/wiki-consult.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/staleness.md",
    ],
  },
  {
    name: "wiki precedence rule (v0.15.0 — code > fresh wiki > stale wiki > priors)",
    token: "code > fresh wiki",
    files: [
      // v0.39.0: both new contracts defer to the precedence rule — the ladder
      // never overrides it, and untrusted-input extends it across a repo boundary.
      "skills/_shared/read-ladder.md",
      "skills/_shared/untrusted-input.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-learn/SKILL.md",
      "skills/orc-learn/references/deepen.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/claude-md-injection.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/wiki-consult.md",
      // v0.41.0: the `wiki` slice field states the precedence to the executor.
      "skills/orc/subskills/orc-execution/core.md",
    ],
  },
  {
    name: "orc-diy gate lock (v0.16.0 — CLI-written; stub/guard/statusline all read it)",
    token: "flow.lock.json",
    binFiles: ["bin/cli.js"],
    files: [
      "hooks/orc-effort-guard.js",
      "hooks/orc-statusline.js",
      "skills/_shared/opus5-only.md",
      "skills/orc-diy/README.md",
      "skills/orc-diy/SKILL.md",
      "skills/orc-diy/references/compile.md",
      "skills/orc-diy/references/flow-schema.md",
    ],
  },
  {
    name: "orc-diy compiled artifact path (v0.16.0 — build output, never hand-edited)",
    token: "FLOW-COMPILED.md",
    binFiles: ["bin/cli.js"],
    files: [
      "commands/orc-diy.md",
      "hooks/orc-statusline.js",
      "skills/orc-diy/README.md",
      "skills/orc-diy/SKILL.md",
      "skills/orc-diy/references/compile.md",
      "skills/orc-diy/references/flow-schema.md",
    ],
  },
  {
    name: "orc-diy flow config file (v0.16.0 — written ONLY by the `orc diy` CLI)",
    token: "orc-diy.config.yaml",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/orc/config.md",
      "hooks/orc-statusline.js",
      "skills/orc-diy/README.md",
      "skills/orc-diy/SKILL.md",
      "skills/orc-diy/references/compile.md",
      "skills/orc-diy/references/flow-schema.md",
    ],
  },
  {
    // The marker grammar's OTHER half is the compiler in bin/cli.js
    // (diyApplyVariants) — outside templates/, so this lint can't see it.
    // Changing the marker syntax means changing cli.js in the same commit.
    name: "orc-diy variant marker grammar (v0.16.0 — blocks stitched by the CLI compiler)",
    token: "diy:when",
    files: [
      "skills/orc-diy/references/blocks/analyze.md",
      "skills/orc-diy/references/blocks/execution.md",
      "skills/orc-diy/references/blocks/header.md",
      "skills/orc-diy/references/blocks/mock-example.md",
      "skills/orc-diy/references/blocks/pattern.md",
      "skills/orc-diy/references/blocks/planning.md",
      "skills/orc-diy/references/blocks/review.md",
      "skills/orc-diy/references/blocks/scoring.md",
      "skills/orc-diy/references/blocks/security.md",
      "skills/orc-diy/references/blocks/ship.md",
      "skills/orc-diy/references/blocks/summary.md",
      "skills/orc-diy/references/blocks/testgen.md",
      "skills/orc-diy/references/blocks/verify.md",
      "skills/orc-diy/references/blocks/wiki.md",
      "skills/orc-diy/references/compile.md",
    ],
  },
  {
    // The CLI half (bin/cli.js `orc crosslink` composer) is documented drift —
    // the lint's ROOT is templates/ and cannot see cli.js (like the DIY compiler).
    name: "crosslink CLI config file (v0.17.0 — written ONLY by `orc crosslink`, skill-read)",
    token: "orc-crosslink.config.yaml",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/orc-poly/SKILL.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/claude-md-injection.md",
      "skills/orc-wiki/references/crosslink-compile.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc/references/wiki-consult.md",
    ],
  },
  {
    name: "crosslink consumer needs baseline (v0.17.0 — machine-authored drift baseline + run-time inject)",
    token: "crosslink/needs.json",
    files: [
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink-compile.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/wiki-consult.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
    ],
  },
  {
    name: "crosslink consumer cache dir (v0.17.0 — gitignored snapshot mirror)",
    token: "crosslink/cache/",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/orientation.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc/references/wiki-consult.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
    ],
  },
  {
    name: "crosslink provider tag dir (v0.17.0 — per-point boundary tags, project-root wiki/)",
    token: "wiki/crosslink/",
    binFiles: ["bin/cli.js"],
    files: [
      "commands/orc-wiki.md",
      "skills/orc-boundary/references/card.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-poly/references/gather.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/claude-md-injection.md",
      "skills/orc-wiki/references/crosslink-compile.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/orientation.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc/references/wiki-consult.md",
        ],
  },
  {
    name: "crosslink provider registry (v0.17.0 — wiki-meta sibling, integrity-gated)",
    token: "crosslink_provided",
    binFiles: ["bin/cli.js"],
    files: [
      "agents/orc-wiki-scanner-opus-4-8-high.md",
      "agents/orc-wiki-scanner-opus-5-med.md",
      "agents/orc-wiki-scanner-sonnet-5-high.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
        ],
  },
  {
    // The CLI half (bin/cli.js `countBoundaryRows` boundary detector + the
    // sync boundary/N→0 guards) is documented drift — the lint's ROOT is
    // templates/ and cannot see cli.js.
    name: "crosslink per-scan-task emission (v0.24.0 — always-on; scan agent returns crosslink_tags | none)",
    token: "crosslink_tags",
    files: [
      "agents/orc-wiki-scanner-opus-4-8-high.md",
      "agents/orc-wiki-scanner-opus-5-med.md",
      "agents/orc-wiki-scanner-sonnet-5-high.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc-wiki/schemas/wiki-doc.md",
        ],
  },
  {
    // v0.26.0: the manual-QA deliverables are pinned to a visible project-root
    // folder (EVAL-REPORT F1/F2 fix). Registering the location sentence keeps
    // the pin from drifting across the contract copy (core.md), its mirrors
    // (testgen SKILL.md, the agent), and the two caller lanes + their docs.
    name: "testgen output location (v0.26.0 — pinned to test-generator/<change-slug>/ at project root)",
    token: "test-generator/",
    files: [
      "agents/orc-test-author-opus-5-med.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-mini/examples/mini-run-mock.md",
      "skills/orc-quick/references/context-doc.md",
      "skills/orc/README.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-testgen/SKILL.md",
      "skills/orc/subskills/orc-testgen/core.md",
      "skills/_shared/stack-plan.md",
      "skills/orc/subskills/orc-pr/stack-gate.md",
      // v0.42.0: named as a sibling project-root deliverable, so the grill doc lands
      // in the same visible place and not inside .claude/.
      "skills/orc-grill/references/grill-doc.md",
    ],
  },
  {
    // Both keys also register in bin/cli.js's CONFIG_META (documented drift).
    name: "crosslink snapshot-age config keys (v0.17.0 — Signal-B day tiers)",
    token: "crosslink_fresh_days",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc/config.md",
    ],
  },
  {
    // v0.27.0: the orc-poly handoff spec marker. orc-poly writes poly-spec.md
    // with this first-line marker; the shared planner self-activates poly-repo
    // split mode on it. Changing the marker means changing the skill, the
    // planner, and both commands in the same commit.
    name: "orc-poly handoff marker (v0.27.0 — planner splits per-repo on `orc-poly:spec`)",
    token: "orc-poly:spec",
    files: [
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-opus-5-med.md",
      "commands/orc-plan.md",
      "commands/orc-poly.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-poly/references/poly-spec.md",
      "skills/orc-poly/examples/poly-run-mock.md",
    ],
  },
  {
    name: "orc-poly output dir (v0.27.0 — source-of-truth docs + per-repo plans)",
    token: "poly-repo-implementation/",
    files: [
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-opus-5-med.md",
      "commands/orc-poly.md",
      "skills/_shared/stack-plan.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-poly/examples/poly-run-mock.md",
      "skills/orc-poly/references/poly-spec.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    name: "orc-poly frozen boundary (v0.27.0 — every per-repo plan pins interface-contract.md)",
    token: "interface-contract.md",
    files: [
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-opus-5-med.md",
      "commands/orc-plan.md",
      "commands/orc-poly.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-poly/examples/poly-run-mock.md",
      "skills/orc-poly/references/gather.md",
      "skills/orc-poly/references/poly-spec.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
        ],
  },
  {
    // v0.33.0: the commit-scoped delta probe — the DEFAULT refresh path. The
    // probe itself lives in bin/cli.js (exit 0/1/2/3 contract).
    name: "wiki delta probe (v0.33.0 — `orc wiki impact` drives the default refresh)",
    token: "orc wiki impact",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc/config.md",
        ],
  },
  {
    // v0.33.0: the federation atlas. The derived-artifact handling (never a
    // registered doc, never bulk-deleted) is mirrored in bin/cli.js.
    name: "crosslink ATLAS (v0.33.0 — wiki/crosslink/atlas.md, sanctioned peer file write)",
    token: "atlas.md",
    binFiles: ["bin/cli.js"],
    files: [
      "commands/orc-wiki.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-poly/references/gather.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/claude-md-injection.md",
      "skills/orc-wiki/references/crosslink-compile.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/orientation.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc/references/wiki-consult.md",
    ],
  },
  {
    // v0.33.0: the one-shot crosslink+atlas+injection entry branch.
    name: "crosslink compile branch (v0.33.0 — /orc-wiki crosslink compile, one-shot)",
    token: "crosslink compile",
    files: [
      "commands/orc-wiki.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/claude-md-injection.md",
      "skills/orc-wiki/references/crosslink-compile.md",
      "skills/orc-wiki/references/crosslink.md",
    ],
  },
  {
    // v0.33.0: the wiki's front door — derived at assemble, consumed first.
    // bin/cli.js notes it registers via its header like any doc.
    name: "wiki orientation doc (v0.33.0 — wiki/orc-orientation.md, derived + read-first)",
    token: "orc-orientation.md",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/orc-explain/SKILL.md",
      "skills/orc-export/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/claude-md-injection.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/orientation.md",
      "skills/orc-wiki/references/partial-refresh.md",
      "skills/orc/references/wiki-consult.md",
        ],
  },
  {
    // v0.33.0: the mock-example deliverable folder — visible at project root,
    // NEVER committed (ship excludes it from staging; no .gitignore edit).
    // bin/cli.js excludes it from the impact blind-spot sweep.
    name: "mock-example deliverable (v0.33.0 — mock-examples/<slug>/, never committed)",
    token: "mock-examples/",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/_shared/drift-recovery.md",
      "skills/orc-diy/references/blocks/mock-example.md",
      "skills/orc-diy/references/flow-schema.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/subskills/orc-pr/stack-gate.md",
      // v0.42.0: the interview names the mock-example phase as the instrument for a
      // question talking cannot settle (`how should this feel?`).
      "skills/_shared/interview.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-grill/references/grill-doc.md",
      // v0.45.0: brainstorm names the same instrument for the same class of
      // question — "how should it feel" is not settled by generating options
      // either.
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-brainstorm/references/brainstorm-doc.md",
    ],
  },
  {
    // v0.33.0: the drift-recovery canonical (sibling of fallback-handoff).
    name: "drift-recovery canonical pointer (v0.33.0 — _shared/drift-recovery.md)",
    token: "drift-recovery.md",
    files: [
      "skills/_shared/README.md",
      "skills/orc-diy/references/blocks/mock-example.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/chunking.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/references/ultra-mode.md",
      "skills/orc/references/wave-grouping.md",
    ],
  },
  {
    // v0.33.0: the drift handoff block (writer: the lane; readers: analyze-mini
    // gap analysis + mini planner patch plan).
    name: "drift handoff block (v0.33.0 — DRIFT-FROM, cap 2 recovery loops)",
    token: "DRIFT-FROM",
    files: [
      // v0.40.0: a resolved DRIFT-FROM round is one of the four record triggers.
      "skills/_shared/gotchas.md",
      "skills/_shared/drift-recovery.md",
      "skills/orc-diy/references/blocks/mock-example.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/_shared/README.md",
    ],
  },
  {
    // v0.33.0: TDD-anchored planning — the plan-time acceptance-test contract.
    name: "TDD plan anchor (v0.33.0 — tdd_spec at plan time; v0.41.0 — scoped by disposition, paired TDD task)",
    token: "tdd_spec",
    files: [
      // v0.40.0: a tdd_spec test driven red -> green is the primary record trigger.
      "skills/_shared/gotchas.md",
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "agents/orc-planner-fable-5.md",
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "skills/_shared/return-validation.md",
      "skills/orc-diy/references/blocks/execution.md",
      "skills/orc-diy/references/blocks/planning.md",
      "skills/orc-diy/references/flow-schema.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/preflight-report.md",
      "skills/orc/references/wave-grouping.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    // v0.33.0: the TDD repair-loop cap — config key mirrored in bin/cli.js.
    name: "TDD repair cap (v0.33.0 — tdd_loop_max, STOP + honest red report on cap)",
    token: "tdd_loop_max",
    binFiles: ["bin/cli.js"],
    files: [
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "agents/orc-verifier-opus-5-med.md",
      "skills/_shared/return-validation.md",
      "skills/orc-diy/references/blocks/execution.md",
      "skills/orc-diy/references/blocks/verify.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
    ],
  },
  {
    // v0.33.0: the executor TDD attestation (green needs quoted evidence).
    name: "TDD executor attestation (v0.33.0 — tdd_state green|red on tdd_spec slices)",
    token: "tdd_state",
    files: [
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/_shared/return-validation.md",
      "skills/orc-diy/references/blocks/execution.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
    ],
  },
  {
    // v0.33.0: the verify-slot TDD gate input (Phase 6 half 1).
    name: "TDD verify-gate slice (v0.33.0 — tdd_suite[] in the verifier slot)",
    token: "tdd_suite",
    files: [
      "agents/orc-verifier-opus-5-med.md",
      "skills/orc-diy/references/blocks/verify.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
    ],
  },
  {
    // v0.33.0: the TDD trace verbs (closed-set additions; TDD-GREEN rides the
    // same rows).
    name: "TDD trace verbs (v0.33.0 — TDD-RED/TDD-GREEN per iteration)",
    token: "TDD-RED",
    files: [
      "skills/orc-diy/references/blocks/execution.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
    ],
  },
  {
    // v0.33.0: mock_example config key (also in bin/cli.js CONFIG_META + the
    // DIY flow key).
    name: "mock-example gate key (v0.33.0 — mock_example ask|on|off)",
    token: "mock_example",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/_shared/drift-recovery.md",
      "skills/orc-diy/references/blocks/mock-example.md",
      "skills/orc-diy/references/flow-schema.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/ultra-mode.md",
      // v0.42.0: the interview + the grill name mock_example as the INSTRUMENT for
      // a question conversation cannot settle — they never run it themselves.
      "skills/_shared/interview.md",
      "skills/orc-grill/SKILL.md",
      "skills/orc-grill/references/grill-doc.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-brainstorm/references/brainstorm-doc.md",
    ],
  },
  {
    // v0.33.0: the delta→full recommendation threshold (config + CLI mirror).
    name: "delta full-refresh threshold (v0.33.0 — wiki_delta_full_threshold, default 30)",
    token: "wiki_delta_full_threshold",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/orc-wiki/references/staleness.md",
      "skills/orc/config.md",
    ],
  },
  {
    // v0.34.1: run state moved OUT of the installer's blast radius
    // (.claude/skills/orc/run/ → .claude/orc/run/, config key run_dir). The
    // path is prose in six lanes; without this pin the next rename drifts and
    // half the lanes checkpoint somewhere the resume contract can't find.
    name: "run artifact root (v0.34.1 — .claude/orc/run/, survives orc update)",
    token: ".claude/orc/run",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/_shared/fallback-handoff.md",
      "skills/_shared/stack-plan.md",
      "skills/orc-diy/references/blocks/header.md",
      "skills/orc-diy/references/locked-blocks.md",
      "skills/orc-export/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-quick/references/context-doc.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc/README.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/intake.md",
      "skills/orc/references/stop-and-resume.md",
      "skills/orc-doc/README.md",
      "skills/orc-doc/references/chunking.md",
      "skills/orc-doc/references/gates.md",
    ],
  },
  // ── Stacked pull requests (v0.37.0) ──────────────────────────────────────
  {
    // The deliverable folder. Visible at the project root and COMMITTED (same
    // class as poly-repo-implementation/ and test-generator/) — never inside
    // .claude/, which the installer replaces. bin/cli.js owns the path too
    // (`orc pr stack template` writes it, `orc pr stack status` probes it), so a
    // rename on either side fails the lint.
    name: "stacked-PR deliverable folder (v0.37.0 — stacked-pr/<slug>/, committed)",
    token: "stacked-pr/",
    binFiles: ["bin/cli.js"],
    files: [
      "commands/orc-pr-driver.md",
      "commands/orc-pr-setup.md",
      "skills/_shared/stack-plan.md",
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-setup/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/subskills/orc-pr/SKILL.md",
      "skills/orc/subskills/orc-pr/stack-gate.md",
      "skills/orc-pr-driver/README.md",
      "skills/orc-pr-setup/README.md",
    ],
  },
  {
    // The plan file IS the contract between the planner lane and the driver
    // lane — and it is equally the contract with a HAND-FILLED plan (the CLI
    // skeleton path), which is why the filename is pinned on both sides.
    name: "stack plan contract file (v0.37.0 — stack-plan.md, planner ↔ driver ↔ CLI)",
    token: "stack-plan.md",
    binFiles: ["bin/cli.js"],
    files: [
      "commands/orc-pr-driver.md",
      "commands/orc-pr-setup.md",
      "skills/_shared/README.md",
      "skills/_shared/gh-stack-commands.md",
      "skills/_shared/stack-plan.md",
      "skills/orc-challenge/references/kinds.md",
      "skills/orc-pr-driver/README.md",
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-driver/references/orc-run-split.md",
      "skills/orc-pr-setup/README.md",
      "skills/orc-pr-setup/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/subskills/orc-pr/stack-gate.md",
    ],
  },
  {
    // The handoff block — third member of the family (FALLBACK-FROM,
    // DRIFT-FROM, STACK-FROM). Written by ORC's ship gate or by orc-pr-setup,
    // read by the next lane; a forked shape strands a run mid-handoff.
    name: "STACK-FROM handoff block (v0.37.0 — ship gate / planner → driver)",
    token: "STACK-FROM",
    files: [
      "commands/orc-pr-driver.md",
      "skills/_shared/stack-plan.md",
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-setup/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/subskills/orc-pr/SKILL.md",
      "skills/orc/subskills/orc-pr/stack-gate.md",
      "skills/_shared/README.md",
    ],
  },
  {
    // The deterministic existence probe (exit 0 READY / 1 absent-or-unfilled),
    // same convention as `orc pattern status <lang>` and `orc diy status`. The
    // probe lives in bin/cli.js; every consumer must name it, never an ad-hoc
    // find — stacked-pr/ is a normal visible folder, but an UNFILLED plan is
    // indistinguishable from a ready one without the probe.
    name: "stack plan probe (v0.37.0 — `orc pr stack status`, exit-code contract)",
    token: "orc pr stack status",
    binFiles: ["bin/cli.js"],
    files: [
      "commands/orc-pr-driver.md",
      "skills/_shared/stack-plan.md",
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-driver/README.md",
      "skills/orc-pr-setup/README.md",
    ],
  },
  {
    // Canonical cross-lane prose (sibling of drift-recovery.md /
    // fallback-handoff.md): WHERE a PR body comes from. Shared by the ship gate
    // and both stacked-PR lanes — never forked back into a spine.
    name: "PR-template resolution canonical pointer (v0.37.0 — _shared/pr-templates.md)",
    token: "pr-templates.md",
    files: [
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-setup/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/subskills/orc-pr/SKILL.md",
      "skills/orc/subskills/orc-pr/stack-gate.md",
      "skills/orc-pr-driver/README.md",
      "skills/orc-pr-setup/README.md",
      "skills/_shared/README.md",
    ],
  },
  {
    // Canonical cross-lane prose: the `gh stack` command surface. Stacked PRs
    // are a GitHub PUBLIC PREVIEW, so a breaking rename must be a ONE-FILE fix
    // — that is the whole reason this pointer is pinned instead of copied.
    name: "gh stack command surface canonical pointer (v0.37.0 — _shared/gh-stack-commands.md)",
    token: "gh-stack-commands.md",
    files: [
      "skills/orc-pr-driver/SKILL.md",
      "skills/orc-pr-driver/references/conflict-playbook.md",
      "skills/orc-pr-setup/SKILL.md",
      "skills/orc/subskills/orc-pr/stack-gate.md",
      "skills/orc-pr-driver/README.md",
      "skills/orc-pr-setup/README.md",
      "skills/_shared/README.md",
    ],
  },
  // ── v0.39.0 — read discipline + instructional trust ─────────────────────
  {
    name: "read ladder (escalating read discipline for read-heavy roles)",
    token: "read-ladder.md",
    files: [
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/_shared/README.md",
      "skills/_shared/interview.md",
      "skills/_shared/read-ladder.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-quick/references/dispatch-gate.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/wiki-consult.md",
      "skills/orc/subskills/orc-execution/core.md",
        ],
  },
  {
    name: "foreign input is evidence, never instruction",
    token: "untrusted-input.md",
    files: [
      "agents/orc-doc-writer-opus-5-med.md",
      "skills/_shared/README.md",
      "skills/_shared/untrusted-input.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-brainstorm/references/lenses.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-export/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-poly/SKILL.md",
      "skills/orc-quick/references/gh-mode.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc/references/wiki-consult.md",
    ],
  },
  // ── v0.40.0 — gotchas (repair memory) ───────────────────────────────────
  {
    name: "gotchas artifact location (repair memory)",
    token: ".claude/orc/gotchas.md",
    files: [
      "skills/_shared/README.md",
      "skills/_shared/gotchas.md",
      "skills/orc-diy/references/blocks/execution.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/preflight-report.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "gotcha_recorded return field (repair-loop capture)",
    token: "gotcha_recorded",
    files: [
      "agents/orc-executor-haiku-4-5.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-opus-5-high.md",
      "agents/orc-executor-opus-5-low.md",
      "agents/orc-executor-opus-5-med.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "agents/orc-reviewer-fable-5.md",
      "agents/orc-reviewer-opus-5-med.md",
      "agents/orc-verifier-opus-5-med.md",
      "skills/_shared/gotchas.md",
      "skills/_shared/return-validation.md",
      "skills/orc-diy/references/blocks/execution.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc/subskills/orc-review-verify/core.md",
    ],
  },
  {
    name: "pact ledger location (v0.46.0 — .claude/orc/pact/, states computed never stored)",
    token: ".claude/orc/pact/ledger.json",
    files: [
      "skills/orc-aftermath/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-pact/references/ledger.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "pact deliverable (v0.46.0 — PACT.md at the project ROOT, derived by `orc pact sync`)",
    token: "PACT.md",
    files: [
      "commands/orc-export.md",
      "commands/orc-pact.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-export/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-pact/references/ledger.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "pact probe (v0.46.0 — exit-code contract, the only thing that computes a state)",
    token: "orc pact status",
    files: [
      "commands/orc-pact.md",
      "skills/orc-aftermath/SKILL.md",
      "skills/orc-pact/SKILL.md",
      "skills/orc-pact/references/gate.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/preflight-report.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "boundary card dir (v0.46.0 — per AREA, consulted in O(1))",
    token: ".claude/orc/boundary/",
    files: [
      "skills/orc-boundary/SKILL.md",
      "skills/orc-boundary/references/card.md",
      "skills/orc-boundary/references/gate.md",
      "skills/orc-export/SKILL.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "boundary probe (v0.46.0 — exit-code contract; the skill never computes a verdict)",
    token: "orc boundary status",
    files: [
      "commands/orc-boundary.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-boundary/references/card.md",
      "skills/orc-boundary/references/gate.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/preflight-report.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "handoff surface map (v0.46.0 — orc-handoff/surfaces.md at the project ROOT)",
    token: "orc-handoff/surfaces.md",
    files: [
      "commands/orc-handoff.md",
      "skills/orc-handoff/SKILL.md",
      "skills/orc-handoff/references/surfaces.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "handoff single writer (v0.46.0 — the lane and the panel share ONE write path)",
    token: "orc handoff set",
    files: [
      "commands/orc-handoff.md",
      "skills/orc-handoff/SKILL.md",
      "skills/orc-handoff/references/surfaces.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "budget plan key (v0.46.0 — asked once, stored; never a guessed quota percentage)",
    token: "budget_plan",
    files: [
      "skills/orc-budget/SKILL.md",
      "skills/orc-budget/references/corpus.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "budget forecast is PLAN-ONLY (v0.46.0 — a forecast from prose is a guess that looks computed)",
    token: "orc budget forecast",
    files: [
      "skills/orc-budget/SKILL.md",
      "skills/orc-route/SKILL.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "aftermath output dir (v0.46.0 — orc-aftermath/<period>/, report-only)",
    token: "orc-aftermath/",
    files: [
      "commands/orc-aftermath.md",
      "skills/orc-aftermath/SKILL.md",
      "skills/orc-aftermath/references/report.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "export derived marker (v0.46.0 — fingerprinted, --checkable, never hand-written)",
    token: "orc-export:derived",
    files: [
      "skills/orc-export/SKILL.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "wiki work list (v0.46.0 — ranked + priced; the skill renders, never computes)",
    token: "orc wiki plan",
    files: [
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/partial-refresh.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "wiki usage file (v0.46.0 — from TRACES, its own file, NEVER wiki-meta.json)",
    token: "wiki-usage.json",
    files: [
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/partial-refresh.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "wiki light scanner (v0.46.0 — the tier ladder's cheap half, dispatched BY NAME)",
    token: "orc-wiki-scanner-sonnet-5-high",
    files: [
      "agents/MODEL-MAPPING.md",
      "agents/orc-wiki-scanner-sonnet-5-high.md",
      "skills/_shared/opus5-only.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/partial-refresh.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "wiki scan tier mode (v0.46.0 — ladder | always_deep; the tier is never silent)",
    token: "wiki_scan_tier",
    files: [
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/partial-refresh.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  // ── v0.48.0 — /orc-doc ────────────────────────────────────────────────────
  // The two headline contracts, registered as a PAIR because they fail together:
  // a lane that reads the body has no reason to freeze the context, and a lane
  // that re-interviews has already lost the reason not to read the body.
  {
    name: "the orchestrator never reads the document body (v0.48.0 — /orc-doc)",
    token: "a lane that reads its own document",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/chunking.md",
    ],
  },
  {
    name: "the context is gathered once and FROZEN (v0.48.0 — /orc-doc)",
    token: "a lane that re-asks a frozen question",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/resume-protocol.md",
    ],
  },
  {
    name: "orc-doc output dir (v0.48.0 — project root, never .claude/)",
    token: "orc/orc-doc/",
    files: [
      "skills/orc-doc/references/chunking.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-doc/references/resume-protocol.md",
      "skills/orc-doc/README.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  // ── v0.48.1 — the score, the finish line, the memory ──────────────────────
  {
    // The pipeline stops being something the orchestrator REMEMBERS. Same shape
    // as the Flow stepper: the CLI computes the next legal action, the skill
    // renders it. A session that improvises the order is the exact drift this
    // command exists to prevent.
    name: "the CLI computes the next action, the skill renders it (v0.48.1)",
    token: "orc doc next",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/chunking.md",
      "skills/orc-doc/references/resume-protocol.md",
      "skills/orc-doc/README.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // Shipping is RECORDED as a decision (/orc-pact) and the resulting state is
    // COMPUTED, never stored (/orc-challenge). `shipped-drifted` names the
    // sections that moved — coverage-relative, the computeWikiFreshness lesson.
    name: "delivery is recorded, its state is computed (v0.48.1 — shipped-drifted)",
    token: "shipped-drifted",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-doc/references/chunking.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // The call site is the contract. A skill that forgets to log at D1 leaves
    // the journal permanently empty, and an empty journal is indistinguishable
    // from a document nobody ever asked for anything on.
    name: "the request is recorded VERBATIM at D1 (v0.48.1 — orc doc log)",
    token: "orc doc log",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-doc/references/resume-protocol.md",
      "skills/orc-doc/references/portable-markdown.md",
      "skills/orc-doc/references/chunking.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // The fourth member of the family, with `reads its own document` and
    // `re-asks a frozen question`. A cycle nobody logged renders AS A GAP —
    // never a plausible reconstruction from file mtimes. The /orc-pact
    // UNCHECKABLE rule: not knowing is an answer, and faking it teaches people
    // to distrust the rows that are real.
    name: "the journal never invents an entry (v0.48.1 — /orc-doc)",
    token: "a lane that invents a journal entry",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/resume-protocol.md",
    ],
  },
  {
    // `orc doc read` prints prose, so the rule table has to say out loud that
    // the orchestrator is not the one who runs it — otherwise it reads as a
    // hole in hard rule 0. It is a command for the human, like
    // `orc challenge report`.
    name: "orc doc read is for the HUMAN (v0.48.1 — rule 0 is not softened)",
    token: "The orchestrator never runs `orc doc read`",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/chunking.md",
    ],
  },
  // ── v0.49.0 — the document is a FOLDER, the file is a build artifact ──────
  {
    // The inversion this release exists to end: `.work/` was scratch and
    // `document.md` was truth, so every later change was extract → edit →
    // splice through the 10,000-line file. Naming the folder in every consumer
    // is what stops a spine quietly going back to the monolith.
    name: "sections/ is the source of truth (v0.49.0 — /orc-doc)",
    token: "sections/",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/README.md",
      "skills/orc-doc/references/chunking.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-doc/references/resume-protocol.md",
      "agents/orc-doc-checker-opus-5-low.md",
      "agents/orc-doc-writer-opus-5-med.md",
      "commands/orc-doc.md",
      "skills/orc-doc/references/portable-markdown.md",
      "skills/orc-doc/examples/orc-doc-prd-run.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // `document.md` is REBUILT, never edited in place. The command name is a
    // single token the lint can see, and it is mirrored in the CLI.
    name: "document.md is a build artifact (v0.49.0 — orc doc compile)",
    token: "orc doc compile",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/README.md",
      "skills/orc-doc/references/chunking.md",
      "skills/orc-doc/references/resume-protocol.md",
      "commands/orc-doc.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-doc/references/portable-markdown.md",
      "skills/orc-doc/examples/orc-doc-prd-run.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // ONE FILE PER SECTION. Before v0.49.0 a two-section slice wrote one file
    // named after the first, while compile looked one up per outline id — so
    // the second section's file never existed. A live bug, fixed by
    // construction, and the sentence is what keeps it fixed.
    name: "one file per section (v0.49.0 — the D-3 regression guard)",
    token: "one file per section",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/chunking.md",
      "agents/orc-doc-writer-opus-5-med.md",
    ],
  },
  {
    // The deliverable is only what the reader came for. ORC's uncertainty is
    // still recorded — in gaps.md and the journal — just not in the document.
    name: "the deliverable carries content only (v0.49.0 — /orc-doc)",
    token: "carries content only",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/README.md",
      "skills/orc-doc/references/chunking.md",
      "skills/orc-doc/references/plain-language.md",
      "skills/orc-doc/references/portable-markdown.md",
      "agents/orc-doc-writer-opus-5-med.md",
      "agents/orc-doc-checker-opus-5-low.md",
      "commands/orc-doc.md",
      "skills/orc-doc/references/resume-protocol.md",
      "skills/orc-doc/references/templates/collaboration.md",
      "skills/orc-doc/references/templates/prd.md",
      "skills/orc-doc/references/templates/report.md",
      "skills/orc-doc/references/templates/tsd.md",
      "skills/orc-doc/references/templates/workflow.md",
      "skills/orc-doc/examples/orc-doc-prd-run.md",
    ],
  },
  {
    // A wave boundary is a real STOP, not a loop iteration. Treat it as a loop
    // and a usage-limit kill between waves leaves nothing that says where it
    // stopped — which is exactly what happened before this release.
    name: "every wave is a stop (v0.49.0 — /orc-doc)",
    token: "Every wave is a stop",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/README.md",
      "commands/orc-doc.md",
    ],
  },
  {
    // Asked ONCE and stored, never decided per wave by the orchestrator — that
    // is remembered-not-dispatched protocol, the failure this repo has already
    // paid for twice.
    name: "partial writing is a stored mode, not a per-wave choice (v0.49.0)",
    token: "doc_write_mode",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/README.md",
      "skills/orc-doc/references/chunking.md",
      "skills/orc-doc/examples/orc-doc-prd-run.md",
    ],
    binFiles: ["bin/cli.js"],
  },
];

// Spine size budgets (v0.19.0). These SKILL.md files are ALWAYS loaded when
// their skill runs — every line here is paid on every run, and oversized
// spines are what make the model drift from the contract lines buried inside
// them. Detail belongs in load-on-demand references/ (free until the phase
// fires). A new feature that would blow a budget lands as a reference + a
// pointer, not as spine prose. Raising a budget is a deliberate, reviewed act.
const BUDGETS = [
  // v0.28.0: deliberate raise 335→350 — the run-integrity work adds inline
  // trace imperatives to every phase body (fix for SPAWN/RETURN-only traces),
  // the deterministic wave-stop gate, and the always-on wiki/pattern/crosslink
  // visibility reports.
  // v0.30.0: deliberate raise 350→360 — the scoring revamp adds the visible
  // `base+adjusters=final` demand + anti-inflation cite, the Fable 5 role-
  // override dispatch pointer, and the Phase-1 CONFIG runtime-proof trace line.
  // v0.31.0: deliberate raise 360→385 — the execution-integrity revamp wires
  // four of five parts into the spine: the Phase-0 plan-input trigger
  // (plan-handoff entry contract), waves-always-computed (Part C), the
  // facet-scored formula + fix-cycle scoring rule (Part D), and the Phase-1
  // open_questions relay + step-back valve (Part E). Detail lives in the
  // references; the spine keeps only triggers + contract tokens + pointers.
  // v0.32.0: deliberate raise 385→392 — the trace revamp replaces the v0.28.0
  // inline emit prose with the packet + writer-dispatch protocol (packet fields,
  // the pairing rule, the solo first/last packet). Net +7: the narration
  // contract is the one thing that must survive compaction in the spine itself,
  // and the packet SCHEMA + per-lane packet counts live in trace-protocol.md.
  // v0.33.0: deliberate raise 392→424 — the knowledge-deepening + verification
  // revamp adds three spine-level contracts that must survive compaction: the
  // TDD anchor (tdd_spec in the plan gate, Wave-0 red proof, the tdd_loop_max
  // repair loop, the two-half Phase 6), the mock-example phase (6.7) + its
  // never-staged ship rule, and the plan-gate tdd wording. Detail lives in
  // _shared/drift-recovery.md, planning-output.md, and orc-review-verify.
  // v0.37.0: deliberate raise 424→442 — the Phase 8 stacked-PR gate. It has to
  // sit in the spine because it is a SHIP-TIME decision the run must not forget
  // after compaction: the measured threshold, the ONE P0 question, its two
  // degrade-to-a-regular-PR prerequisites (ticket + template), and the handoff
  // to the two standalone lanes. The mechanism (measurement, template
  // resolution, the STACK-FROM block) lives in subskills/orc-pr/stack-gate.md
  // and _shared/{stack-plan,pr-templates}.md.
  // v0.39.0: deliberate raise 442→445 — hard rule 13, the read ladder. It has to
  // sit in the spine because the orchestrator BUILDS every slice: a discipline
  // named only in a reference the slice-builder never loads is not applied.
  // v0.40.0: deliberate raise 445→455 — the three gotcha touchpoints. All three
  // are decision points the spine owns and no reference can hold: the Phase-1
  // probe (before any reference loads), the slice-build injection rule (the
  // scope filter + cap 3 IS the anti-bloat guard), and the phase-close capture
  // (only the orchestrator may write the file). See _shared/gotchas.md.
  // v0.42.0: deliberate raise 455→462 — three spine facts the QoL release adds.
  // (1) The `forecast:` mandate: it fires between the Phase-1 exit gate and the
  // Phase-2 pause question, so a reference loaded at either end is loaded on the
  // wrong side of it; and run_budget_dispatches is a HARD STOP, which the spine
  // must own for the same reason the batch pause does. (2) The ultra lane names
  // its own trace lane (`run-ultra-…`) — an ultra run traced as `orc` is counted
  // as a plain /orc run forever. (3) Phase 8 now closes BOTH open-run markers —
  // .current and the run’s RESUME.md — and emits the one STATS line orc stats
  // reads; all three are run-end facts a reference loaded earlier cannot carry.
  // Mechanics live in references/{preflight-report,stop-and-resume,trace-protocol}.md.
  // v0.46.0: deliberate raise 462→490 — the six new lanes' CONSUMER seams. Every
  // one is a spine fact by the same test the earlier raises used: it happens at a
  // decision point the spine owns, before (or instead of) any reference load.
  // (1) The Phase-1 probe block — pact/boundary/wiki-debt/aftermath are read
  // alongside wiki/pattern/gotchas, and the "print each probe's own line VERBATIM"
  // rule is what stops a second wording of a number the CLI already computed.
  // (2) The Phase-1 PACT INJECTION: it fires between the exit gate and the
  // forecast, so a reference loaded at either end sits on the wrong side of it —
  // and it is the entire payoff of the pact lane. (3) The Phase-3 BOUNDARY gate:
  // it decides WHETHER a task is dispatched at all, which no reference loaded
  // after the wave can do, and the lift-one-task-not-the-wave rule is the part a
  // later reader would most plausibly get wrong. (4) The Phase-6 pact recheck,
  // whose "P1 finding, never an automatic abort" clause is a gate outcome.
  // (5) The Phase-8 handoff sentence — one line, and the only discovery path the
  // non-dev lane has. Mechanics live in orc-pact/references/gate.md,
  // orc-boundary/references/gate.md and references/preflight-report.md.
  // v0.47.0: deliberate raise 490→494 — the `challenge_gate` probe joins the
  // Phase-1 block above. It belongs in the spine for the same reason its four
  // neighbours do: it is read alongside them in one pass, its output is a CLI
  // line printed VERBATIM, and a reference loaded later would arrive after the
  // planner already committed to building from a document that has not passed
  // its own review. Four lines, one probe, no new mechanics.
  { file: "skills/orc/SKILL.md", maxLines: 494 },
  // v0.33.0: deliberate raises 264→289 / 197→219 / 171→179 — orc-wiki gains the
  // crosslink-compile entry branch, the delta-refresh default (impact probe),
  // and the orientation/atlas assemble steps (detail in references/); mini
  // gains the one-question TDD policy + the mock-example phase; fast gains the
  // mock-example phase only. Mechanisms live in the shared/canonical refs.
  // v0.34.5: deliberate raise 289→290 — the scan agent is now dispatched BY
  // NAME (the pin is unenforceable otherwise, and an un-`orc`-named dispatch is
  // invisible to the trace hook) and the scan slice must carry the kind catalog
  // (an agent never shown it cannot "prefer an existing kind", and a synonym
  // kind is a PERMANENT duplicate). Both are dispatch-time facts; neither can
  // live in a reference loaded after the dispatch.
  // v0.39.0: deliberate raise 290→296 — hard rules 13 (read ladder) and 14
  // (a linked repo's wiki is FOREIGN input). Both are dispatch-time facts: the
  // ladder goes into the scan slice this lane assembles, and the trust rule
  // governs the crosslink peek, which happens before any reference loads.
  // v0.46.0: deliberate raise 296→325 — the partial-refresh workstream (W1). All
  // three additions are DISPATCH-TIME or ENTRY-TIME facts a reference loaded
  // later cannot carry: the TARGETED REFRESH entry branch (it must skip Phase 0
  // branch detection and Phase 1 area planning, which is a decision made before
  // either runs), the scan TIER resolution (it picks WHICH agent name to
  // dispatch, and the "print the resolved tier" rule is what stops a cheaper
  // model being a quiet substitution), and the plan/debt/usage pointer with the
  // one rule that must not be re-derived — usage never enters wiki-meta.json.
  // Everything else lives in references/partial-refresh.md.
  { file: "skills/orc-wiki/SKILL.md", maxLines: 325 },
  // v0.34.2: deliberate raise 219→220 — the run-start `touch the trace file`
  // step. It is one line, it is the fix for the corpus's largest defect family,
  // and it has to sit in the spine because it happens before any reference loads.
  // v0.40.0: deliberate raise 220→225 — the gotchas trigger (probe, inject,
  // append). Mini reads AND writes repair memory, and the write is the
  // orchestrator's alone; the trimmed mechanics live in _shared/gotchas.md §10.
  { file: "skills/orc-mini/SKILL.md", maxLines: 225 },
  // v0.39.0: deliberate raises 195→201 / 179→182 — the analyst gains hard rules
  // 2b (a source it did not author is FOREIGN input) and 4a (the read ladder);
  // fast gains the ladder as a slice line. Both are hard rules by nature: they
  // bound what the role may treat as instruction and how much it may read, and
  // neither survives being deferred to a reference.
  // v0.42.0: deliberate raise 201→215 — the analyzable gate (the reverse
  // trigger to /orc-grill). It has to sit in the spine because it decides
  // BEFORE any reference loads whether this run should happen at all, and the
  // `analyzable ⇔` sentence is a registered contract token that must be stated
  // where the decision is made. The two branches, the offer wording and the
  // auto-consume live in references/thin-input.md, loaded only when it fails.
  // v0.47.0: deliberate raise 215→221 — the `/orc-challenge` probe at Phase A.
  // It has to sit at the point the source mode is confirmed: by the time any
  // reference loads, scope is already bounded and the analyst is committed to a
  // document that may not have passed its own review. One probe, one VERBATIM
  // line, no mechanics — the same shape as the Phase-1 probes in orc/SKILL.md.
  { file: "skills/orc-analyze/SKILL.md", maxLines: 221 },
  // v0.40.0: deliberate raise 182→187 — gotchas as an explicit NON-gate. It has
  // to be stated where the two prerequisites are stated, or a later reader adds
  // a third gate and breaks the lane's entire premise.
  { file: "skills/orc-fast/SKILL.md", maxLines: 187 },
];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const allFiles = walk(ROOT, []).map((p) =>
  path.relative(ROOT, p).split(path.sep).join("/")
);

const REPO_ROOT = path.join(__dirname, "..");

let failures = 0;
for (const c of CONTRACTS) {
  const expected = new Set(c.files);
  const actual = new Set(
    allFiles.filter((rel) =>
      fs.readFileSync(path.join(ROOT, rel), "utf8").includes(c.token)
    )
  );
  const missing = c.files.filter((f) => !actual.has(f));
  const unregistered = [...actual].filter((f) => !expected.has(f)).sort();
  // B2: some contract tokens are ALSO mirrored into CLI code (bin/cli.js) —
  // config keys the CLI reads/writes, artifact filenames it owns, etc. Those
  // paths live OUTSIDE templates/ so the walk above can't see them; `binFiles`
  // pins the token into repo-root files as a presence-only assertion, so a
  // rename on the CLI side (or the skill side) fails the lint. No unregistered
  // scan for bin files — the CLI legitimately mentions many tokens in passing.
  const binMissing = (c.binFiles || []).filter((bf) => {
    try {
      return !fs.readFileSync(path.join(REPO_ROOT, bf), "utf8").includes(c.token);
    } catch (_) {
      return true;
    }
  });
  if (missing.length || unregistered.length || binMissing.length) {
    failures++;
    console.error(`\n❌ contract drift: ${c.name}  (token: "${c.token}")`);
    for (const f of missing)
      console.error(`   - MISSING from expected copy: templates/${f}`);
    for (const f of unregistered)
      console.error(
        `   - UNREGISTERED copy (add to bin/verify-contracts.js): templates/${f}`
      );
    for (const f of binMissing)
      console.error(`   - MISSING from registered bin mirror: ${f}`);
  }
}

for (const b of BUDGETS) {
  const p = path.join(ROOT, b.file);
  let lines;
  try {
    lines = fs.readFileSync(p, "utf8").split("\n").length;
  } catch (_) {
    failures++;
    console.error(`\n❌ spine budget: templates/${b.file} is missing.`);
    continue;
  }
  if (lines > b.maxLines) {
    failures++;
    console.error(
      `\n❌ spine budget exceeded: templates/${b.file} is ${lines} lines ` +
        `(budget ${b.maxLines}).\n   Spines stay thin by design — move the ` +
        `new detail into a references/ file loaded at its phase, keep only ` +
        `the trigger + contract tokens + pointer in the spine.`
    );
  }
}

// ── Config-key coverage (C.3) ──────────────────────────────────────────────
// Every key in bin/cli.js's CONFIG_META must be referenced somewhere under
// templates/skills/**, and every `config.<key>` a skill references must be a
// real CLI key. Catches a decorative config key (nothing reads it) and a skill
// referencing a key the CLI can't actually write.
{
  const cliText = fs.readFileSync(path.join(REPO_ROOT, "bin", "cli.js"), "utf8");
  const block = cliText.match(/const CONFIG_META = \[([\s\S]*?)\n\];/);
  const cliKeys = block
    ? [...block[1].matchAll(/\{\s*key:\s*"([a-z0-9_]+)"/g)].map((m) => m[1])
    : [];
  const skillFiles = allFiles.filter((f) => f.startsWith("skills/"));
  const skillText = skillFiles
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"))
    .join("\n");
  const orphanKeys = cliKeys.filter(
    (k) => !new RegExp("\\b" + k + "\\b").test(skillText)
  );
  const EXT = new Set(["md", "yaml", "yml", "json", "js", "txt"]);
  const ALLOW = new Set(["rubric_bands_override"]); // hand-edit-only advanced key
  const referenced = new Set();
  for (const m of skillText.matchAll(/config\.([a-z][a-z0-9_]+)/g))
    referenced.add(m[1]);
  const unknownRefs = [...referenced].filter(
    (k) => !cliKeys.includes(k) && !EXT.has(k) && !ALLOW.has(k)
  );
  if (!cliKeys.length) {
    failures++;
    console.error("\n❌ config-key coverage: could not parse CONFIG_META from bin/cli.js.");
  }
  if (orphanKeys.length || unknownRefs.length) {
    failures++;
    console.error("\n❌ config-key coverage drift:");
    for (const k of orphanKeys)
      console.error(
        `   - CLI key "${k}" is never referenced under templates/skills/ (decorative — wire it or drop it)`
      );
    for (const k of unknownRefs)
      console.error(
        `   - templates reference config.${k} but no such CLI CONFIG_META key`
      );
  }
}

if (failures) {
  console.error(
    `\n❌ ORC contract lint FAILED — ${failures} contract(s) drifted.` +
      `\nEvery shared contract must change in ALL its copies (and this table)` +
      `\nin the same commit. See CLAUDE.md "maintenance drift is by design".\n`
  );
  process.exit(1);
}
console.log(
  `✅ ORC contracts OK — ${CONTRACTS.length} contracts consistent across templates/.`
);
