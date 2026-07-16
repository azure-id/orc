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
      "agents/orc-advisor-opus-4-8-max.md",
      "agents/orc-analyze-mini-sonnet-5-high.md",
      "agents/orc-claude-writer-opus-4-8-high.md",
      "agents/orc-context-combiner-opus-4-8-high.md",
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "agents/orc-judge-opus-4-8-max.md",
      "agents/orc-pattern-codifier-sonnet-5-high.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-4-8-med.md",
      "agents/orc-retro-sonnet-5-high.md",
      "agents/orc-reviewer-opus-4-8-high.md",
      "agents/orc-scout-sonnet-4-6-high.md",
      "agents/orc-system-analyst-opus-4-8-high.md",
      "agents/orc-test-author-opus-4-8-high.md",
      "agents/orc-verifier-opus-4-8-high.md",
      "hooks/orc-trace.js",
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
      "skills/orc-advisor/SKILL.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-claude/examples/claude-run-mock.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-judge/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-mini/examples/mini-run-mock.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc-retro/examples/retro-mock.md",
      "skills/orc-wiki/SKILL.md",
    ],
  },
  {
    name: "pattern invariants_checked attestation (executor return)",
    token: "invariants_checked",
    files: [
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/orc/README.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/pattern-gate.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc-fast/SKILL.md",
    ],
  },
  {
    name: "house_rules standing card (slice injection)",
    token: "house_rules",
    files: [
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/house-rules.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
    ],
  },
  {
    name: "validation_gate[] flow (codify -> slice -> review -> verify)",
    token: "validation_gate",
    files: [
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "agents/orc-pattern-codifier-sonnet-5-high.md",
      "agents/orc-reviewer-opus-4-8-high.md",
      "agents/orc-verifier-opus-4-8-high.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/pattern-gate.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
      "skills/orc-pattern/SKILL.md",
      "skills/orc-pattern/schemas/pattern-doc.md",
    ],
  },
  {
    name: "executor evidence contract (v0.7.0 — verbatim build/test proof)",
    token: "no_runner_detected",
    files: [
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/orc/SKILL.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
    ],
  },
  {
    name: "executor unmet[] honest-status contract (v0.7.0)",
    token: "unmet[]",
    files: [
      "agents/orc-executor-opus-4-7-high.md",
      "agents/orc-executor-opus-4-7-med.md",
      "agents/orc-executor-opus-4-8-high.md",
      "agents/orc-executor-sonnet-4-6-high.md",
      "agents/orc-executor-sonnet-4-6-med.md",
      "agents/orc-executor-sonnet-5-high.md",
      "skills/orc/README.md",
      "skills/orc/SKILL.md",
      "skills/orc/examples/full-run-mock.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
      "skills/orc/subskills/orc-execution/core.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-mini/examples/mini-run-mock.md",
    ],
  },
  {
    name: "planner grounding attestation (v0.7.0 — disposition: exists|new)",
    token: "disposition",
    files: [
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-4-8-med.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
    ],
  },
  {
    name: "findings evidence-or-advisory rule (v0.7.0 — unanchored => AUTO-P3)",
    token: "AUTO-P3",
    files: [
      "agents/orc-reviewer-opus-4-8-high.md",
      "agents/orc-verifier-opus-4-8-high.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
      "skills/orc-verify/SKILL.md",
    ],
  },
  {
    name: "P0-P3 severity enum (findings shape)",
    token: "P0|P1|P2|P3",
    files: [
      "agents/orc-reviewer-opus-4-8-high.md",
      "agents/orc-verifier-opus-4-8-high.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
    ],
  },
  {
    name: "retro delivery target (v0.8.1 — PR/issue to retro_repo, channel-gated)",
    token: "retro_repo",
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
      "agents/orc-analyze-mini-sonnet-5-high.md",
      "agents/orc-system-analyst-opus-4-8-high.md",
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
      "agents/orc-analyze-mini-sonnet-5-high.md",
      "agents/orc-system-analyst-opus-4-8-high.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-analyze/schemas/requirement-spec.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    name: "plan coverage gate (v0.9.0 — orphan requirement = malformed plan)",
    token: "orphan",
    files: [
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-4-8-med.md",
      "commands/orc-plan.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    name: "spec invariants last-mile wiring (v0.9.0 — task field -> slice constraints[])",
    token: "spec_invariants",
    files: [
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-4-8-med.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
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
      "agents/orc-retro-sonnet-5-high.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/references/ultra-mode.md",
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
      "agents/orc-advisor-opus-4-8-max.md",
      "skills/orc-advisor/SKILL.md",
      "skills/orc/references/ultra-mode.md",
      "skills/orc/schemas/checkpoint.md",
    ],
  },
  {
    name: "ultra verdict discipline (v0.10.0 — blocking needs anchor + failure_consequence)",
    token: "failure_consequence",
    files: [
      "agents/orc-judge-opus-4-8-max.md",
      "skills/orc-judge/SKILL.md",
      "skills/orc/references/ultra-mode.md",
    ],
  },
  {
    // The v0.19.0 fix for "the trace only got one line": every trace-owning
    // lane states the running-record cadence + this self-check inline, so a
    // lane cannot quietly treat the trace as an end-of-run summary.
    name: "behavior-trace write cadence (v0.19.0 — append per event, never batched at the end)",
    token: "zero new trace lines is a protocol violation",
    files: [
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-verify/SKILL.md",
      "skills/orc-wiki/SKILL.md",
    ],
  },
  {
    name: "behavior-trace run pointer (every ORC entry point writes .current)",
    token: ".current",
    files: [
      "hooks/orc-trace.js",
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pattern/SKILL.md",
      "skills/orc-verify/SKILL.md",
      "skills/orc-wiki/SKILL.md",
    ],
  },
  {
    name: "wiki registration writer (v0.18.0 — manifest+INDEX derived by the CLI, never hand-written)",
    token: "orc wiki sync",
    files: [
      "commands/orc-wiki.md",
      "hooks/orc-statusline.js",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
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
      "skills/orc-wiki/references/staleness.md",
    ],
  },
  {
    name: "wiki freshness manifest (v0.11.0 — written ONLY by `orc wiki sync`, computed on read)",
    token: "wiki-meta.json",
    files: [
      "hooks/orc-statusline.js",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/wiki-consult.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
    ],
  },
  {
    name: "wiki freshness tier enum (v0.11.0 — FRESH/AGING/STALE, computed on read)",
    token: "AGING",
    files: [
      "hooks/orc-statusline.js",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/wiki-consult.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/staleness.md",
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
    files: ["skills/orc-fast/SKILL.md", "skills/orc-mini/SKILL.md"],
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
      "skills/orc-claude/SKILL.md",
      "skills/orc-claude/references/refresh.md",
      "skills/orc-wiki/references/claude-md-injection.md",
    ],
  },
  {
    name: "combiner conservation gate (v0.12.0 — coverage must be 100 before handoff)",
    token: "coverage_pct",
    files: [
      "agents/orc-context-combiner-opus-4-8-high.md",
      "skills/context-combiner/SKILL.md",
      "skills/context-combiner/schemas/combined-report.md",
      "skills/context-combiner/schemas/combined-requirement-spec.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc-analyze/references/branching.md",
    ],
  },
  {
    name: "combiner overlap taxonomy (v0.12.0 — partial overlaps split, never collapsed)",
    token: "PARTIAL-OVERLAP",
    files: [
      "agents/orc-context-combiner-opus-4-8-high.md",
      "skills/context-combiner/SKILL.md",
      "skills/context-combiner/schemas/combined-report.md",
    ],
  },
  {
    name: "combiner eager decision checkpoint (v0.12.0 — verdicts survive compaction)",
    token: "combine-decisions.md",
    files: [
      "agents/orc-context-combiner-opus-4-8-high.md",
      "skills/context-combiner/SKILL.md",
      "skills/context-combiner/schemas/combined-report.md",
    ],
  },
  {
    name: "wiki per-file hash map (v0.15.0 — doc header + manifest docs registry)",
    token: "covered_files",
    files: [
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/schemas/wiki-doc.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/references/staleness.md",
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
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
      "skills/orc/references/wiki-consult.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
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
      "skills/orc/SKILL.md",
      "skills/orc/references/wiki-consult.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/claude-md-injection.md",
      "skills/orc-wiki/references/staleness.md",
    ],
  },
  {
    name: "orc-diy gate lock (v0.16.0 — CLI-written; stub/guard/statusline all read it)",
    token: "flow.lock.json",
    files: [
      "hooks/orc-effort-guard.js",
      "hooks/orc-statusline.js",
      "skills/orc-diy/README.md",
      "skills/orc-diy/SKILL.md",
      "skills/orc-diy/references/compile.md",
      "skills/orc-diy/references/flow-schema.md",
    ],
  },
  {
    name: "orc-diy compiled artifact path (v0.16.0 — build output, never hand-edited)",
    token: "FLOW-COMPILED.md",
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
    files: [
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
      "skills/orc-diy/references/blocks/header.md",
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
    files: [
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
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
    files: [
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc/subskills/orc-execution/SKILL.md",
    ],
  },
  {
    name: "crosslink provider tag dir (v0.17.0 — per-point boundary tags, project-root wiki/)",
    token: "wiki/crosslink/",
    files: [
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
    ],
  },
  {
    name: "crosslink provider registry (v0.17.0 — wiki-meta sibling, integrity-gated)",
    token: "crosslink_provided",
    files: [
      "skills/orc-wiki/README.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/integrity-check.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
    ],
  },
  {
    // Both keys also register in bin/cli.js's CONFIG_META (documented drift).
    name: "crosslink snapshot-age config keys (v0.17.0 — Signal-B day tiers)",
    token: "crosslink_fresh_days",
    files: [
      "skills/orc-wiki/references/crosslink.md",
      "skills/orc-wiki/references/staleness.md",
      "skills/orc-wiki/schemas/crosslink-tag.md",
      "skills/orc/config.md",
    ],
  },
];

// Spine size budgets (v0.19.0). These SKILL.md files are ALWAYS loaded when
// their skill runs — every line here is paid on every run, and oversized
// spines are what make the model drift from the contract lines buried inside
// them. Detail belongs in load-on-demand references/ (free until the phase
// fires). A new feature that would blow a budget lands as a reference + a
// pointer, not as spine prose. Raising a budget is a deliberate, reviewed act.
const BUDGETS = [
  { file: "skills/orc/SKILL.md", maxLines: 330 },
  { file: "skills/orc-wiki/SKILL.md", maxLines: 305 },
  { file: "skills/orc-mini/SKILL.md", maxLines: 215 },
  { file: "skills/orc-analyze/SKILL.md", maxLines: 195 },
  { file: "skills/orc-fast/SKILL.md", maxLines: 180 },
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
  if (missing.length || unregistered.length) {
    failures++;
    console.error(`\n❌ contract drift: ${c.name}  (token: "${c.token}")`);
    for (const f of missing)
      console.error(`   - MISSING from expected copy: templates/${f}`);
    for (const f of unregistered)
      console.error(
        `   - UNREGISTERED copy (add to bin/verify-contracts.js): templates/${f}`
      );
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
