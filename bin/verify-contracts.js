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
      "agents/orc-advisor-opus-5-xhigh.md",
      "agents/orc-analyze-mini-opus-5-med.md",
      "agents/orc-analyze-mini-sonnet-5-high.md",
      "agents/orc-challenge-advisor-opus-5-med.md",
      "agents/orc-challenge-contrarian-opus-5-high.md",
      "agents/orc-challenge-executor-opus-5-med.md",
      "agents/orc-challenge-expansionist-opus-5-med.md",
      "agents/orc-challenge-judge-opus-5-high.md",
      "agents/orc-challenge-outsider-opus-5-low.md",
      "agents/orc-challenge-principles-opus-5-high.md",
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
      "agents/orc-judge-opus-5-xhigh.md",
      "agents/orc-learn-writer-opus-5-low.md",
      "agents/orc-pattern-codifier-opus-5-med.md",
      "agents/orc-pattern-codifier-sonnet-5-high.md",
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "agents/orc-retro-opus-5-med.md",
      "agents/orc-retro-sonnet-5-high.md",
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
      "skills/_shared/extra-dispatch.md",
      "skills/_shared/return-validation.md",
      "skills/orc-advisor/SKILL.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-boundary/references/gate.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-budget/SKILL.md",
      "skills/orc-budget/references/corpus.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/council.md",
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
      "skills/orc-wiki/references/extra.md",
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
      "skills/_shared/extra-dispatch.md",
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
      "skills/_shared/extra-dispatch.md",
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
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "commands/orc-explain.md",
      "skills/orc-challenge/examples/council-full-roster.md",
      "skills/orc-challenge/references/conservation.md",
      "skills/orc-challenge/references/council.md",
      "skills/orc-challenge/references/cycle-state.md",
      "skills/orc-challenge/references/verdict-doc.md",
      "skills/orc-diy/references/blocks/execution.md",
      "skills/orc-diy/references/flow-schema.md",
      "skills/orc-explain/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/references/preflight-report.md",
      "skills/orc/schemas/planning-output.md",
      "skills/orc/subskills/orc-planner-mini/SKILL.md",
      "skills/orc/subskills/orc-planner/SKILL.md",
    ],
  },
  {
    name: "findings evidence-or-advisory rule (v0.7.0 — unanchored => AUTO-P3)",
    token: "AUTO-P3",
    files: [
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
      "agents/orc-reviewer-opus-5-med.md",
      "agents/orc-verifier-opus-5-med.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc/subskills/orc-review-verify/SKILL.md",
      "skills/orc/subskills/orc-review-verify/core.md",
    ],
  },
  {
    // v0.50.0 — the EXTRA trace verb. The wording is composed by
    // `orc extra dispatch` and copied VERBATIM by the lane (the
    // `orc challenge record` precedent), so the two halves live in two files
    // and a rename on either side has to fail loudly.
    name: "EXTRA trace verb — substitution continuation (v0.50.0)",
    token: "EXTRA substitution",
    binFiles: ["bin/cli.js"],
    files: ["skills/orc/references/trace-protocol.md"],
  },
  {
    // The additive tail on SCORE and DISPATCH. One token, two sides: the
    // payload documents it, the CLI composes the profile half of it.
    name: "foreign dispatch tail — via=extra:<profile> (v0.50.0)",
    token: "via=extra:",
    files: [
      "hooks/orc-trace.js",
      "skills/_shared/extra-dispatch.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/trace-protocol.md",
    ],
  },
  // ── v0.55.0 — ROLE SLOTS. The non-scored half of routing ────────────────
  {
    // The command family that holds the six POSITIONS. It is named in every
    // lane spine that has one, because a lane that says it routes foreign and
    // cannot say HOW is the dead `/orc-wiki` row all over again.
    name: "the POSITIONS are held by one command family (v0.55.0)",
    token: "orc extra role",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/_shared/extra-dispatch.md",
      "skills/orc-diy/references/blocks/extra.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-quick/references/dispatch-gate.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/extra.md",
    ],
  },
  {
    // The trace band spelling for a position. The field NAME is unchanged, so
    // the parser and the dedupe are untouched — but a rename of the PREFIX
    // would silently split every slot dispatch out of `orc extra stats`.
    name: "a slot dispatch's band is `slot:<slot>` (v0.55.0)",
    token: "slot:<slot>",
    binFiles: ["bin/cli.js"],
    files: ["skills/_shared/extra-dispatch.md", "skills/orc/references/trace-protocol.md"],
  },
  // ── v0.54.0 — RECOVERY. A failure is a POSITION, not a blank page ────────
  {
    // The sixth member of the family. It is what stops a fallback from landing
    // a fresh executor on a file a dead worker already half-wrote.
    name: "a resume CONTINUES; it never re-does what is already on disk (v0.54.0)",
    token: "a lane that re-does work the worktree already contains",
    files: ["skills/_shared/extra-dispatch.md"],
  },
  {
    // The free, zero-token read that decides which recovery is even correct. It
    // is named in the preflight report too, because the orphan line the report
    // renders is the command's own output.
    name: "reconcile runs BEFORE the fallback, and it is free (v0.54.0)",
    token: "orc extra reconcile",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/_shared/extra-dispatch.md",
      "skills/_shared/return-validation.md",
      "skills/orc-diy/references/blocks/extra.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      // v0.55.0 — /orc-wiki can finally route, so it finally owes the rule.
      "skills/orc-wiki/references/extra.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/preflight-report.md",
    ],
  },
  {
    // The CLI composes the continuation slice. A lane that wrote its own resume
    // wording would produce a second wording for the same facts.
    name: "the resume slice is CLI-composed (v0.54.0)",
    token: "orc extra resume-slice",
    binFiles: ["bin/cli.js"],
    files: ["skills/_shared/extra-dispatch.md"],
  },
  {
    // WHERE the position lives. Renamed on either side and the lint fails — the
    // `extra-spend.jsonl` precedent, for the same reason: a path a lane cannot
    // find is a recovery that cannot happen.
    name: "the journal is the CLI's, and it lives at ONE path (v0.54.0)",
    token: ".claude/orc/extra-journal/",
    binFiles: ["bin/cli.js"],
    files: ["skills/_shared/extra-dispatch.md"],
  },
  {
    // The field a resumed return owes. Absent on a resume slice is MALFORMED,
    // and `restarted` on a non-empty preexisting[] is a finding — both are
    // useless if the two copies of the field name drift.
    name: "a resumed return owes `resume_state` (v0.54.0)",
    token: "resume_state",
    files: ["skills/_shared/extra-dispatch.md", "skills/_shared/return-validation.md"],
  },
  {
    // A gap that is not reported reads as a capability. The validator has to be
    // able to tell `streamed-opaque` evidence from per-turn evidence, and it can
    // only do that if the field is spelled the same in all three places.
    name: "journal fidelity is DECLARED and never rendered stronger (v0.54.0)",
    token: "journal_fidelity",
    binFiles: ["bin/cli.js"],
    files: ["skills/_shared/extra-dispatch.md", "skills/_shared/return-validation.md"],
  },
  {
    // Three readers parse the EXTRA verbs, so a resume that leaves no line
    // cannot be counted by any of them.
    name: "the resume trace verb, composed once (v0.54.0)",
    token: "EXTRA resume",
    binFiles: ["bin/cli.js"],
    files: ["skills/_shared/extra-dispatch.md", "skills/orc/references/trace-protocol.md"],
  },
  {
    // v1.0.0 W5 — same shape, same reason: a demotion that leaves no line
    // cannot be counted, so the CLI composes the wording and the lane copies it
    // verbatim. Registered against both halves of the protocol.
    name: "the demotion trace verb, composed once (v1.0.0)",
    token: "EXTRA demote",
    binFiles: ["bin/cli.js"],
    files: ["skills/_shared/extra-dispatch.md", "skills/orc/references/trace-protocol.md"],
  },
  {
    // The trigger's own sentence. It is the half a "simplification" would
    // delete first — one clock instead of two — and the two clocks measure
    // different things, so the sentence is the guard.
    name: "the stall demotion trigger — two clocks, never merged (v1.0.0)",
    token: "extra_demote_stale_min",
    binFiles: ["bin/cli.js"],
    files: [
      "skills/_shared/config-precedence.md",
      "skills/_shared/extra-dispatch.md",
    ],
  },
  {
    // Whose fault it was. It is not decoration — a `network` verdict HOLDS the
    // wave, so the word has to mean the same thing on both sides.
    name: "attribution decides the recovery, and `network` HOLDS (v0.54.0)",
    token: "fallback_would_also_fail",
    binFiles: ["bin/cli.js"],
    files: ["skills/_shared/extra-dispatch.md"],
  },
  {
    // v0.52.0 (D6) — WHICH LANES ROUTE FOREIGN. The table was prose in one
    // markdown file and nothing computed it, so the routing table could say
    // `[40,55) → opencode/big-pickle` without ever saying that `/orc-fast`
    // resolves a BAND rather than a score. `EXTRA_LANE_SHAPES` in bin/cli.js is
    // the machine-readable copy; a golden test in test/cli/extra-routing.test.js
    // compares the two lists in BOTH directions (the DIY_STEPS → stitch-order
    // precedent), so a lane added to one and not the other fails.
    name: "the lane table is CODE, not only prose (v0.52.0)",
    token: "Which lanes route foreign",
    binFiles: ["bin/cli.js"],
    files: ["skills/_shared/extra-dispatch.md"],
  },
  {
    // The rule a fixed-executor lane resolves with. Registered because
    // `/orc-doc` was DECLARED as routing foreign while being absent from the
    // rule's own list, so the lane had no defined way to resolve a band at all.
    name: "a fixed lane resolves BOTH EDGES of its agent's band (v0.50.0, extended v0.52.0)",
    token: "Resolve BOTH EDGES",
    binFiles: ["bin/cli.js"],
    files: ["skills/_shared/extra-dispatch.md"],
  },
  {
    // The foreign return's downgrade check. `actual_model` cannot exist for a
    // worker with no injected model-id line, so this is what replaces it — and
    // it must never quietly become a synonym for a clean check.
    name: "foreign return — SUBSTITUTION check replaces the downgrade check (v0.50.0)",
    token: "SUBSTITUTION",
    files: [
      "skills/_shared/extra-dispatch.md",
      "skills/_shared/return-validation.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc/SKILL.md",
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
      "agents/orc-analyze-mini-opus-5-med.md",
      "agents/orc-analyze-mini-sonnet-5-high.md",
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
    // NOTE — the token is a BARE ENGLISH WORD, so this row is a token->file-set
    // map and not only a concept. v0.54.0 added a second, unrelated meaning: an
    // ORPHANED FOREIGN DISPATCH, whose lowercase literals (`orphans[]`, the
    // `EXTRA orphan` trace verb, `extra-orphan-dispatch`) cannot be spelled any
    // other way. Those three files are registered here so the lint stays green;
    // the row's real job — a PLAN file that drops the coverage-gate word — is
    // unaffected, because that is caught by `missing`, not by `unregistered`.
    name: "plan coverage gate (v0.9.0 — orphan requirement = malformed plan)",
    token: "orphan",
    files: [
      "agents/orc-planner-mini-opus-5-med.md",
      "agents/orc-planner-mini-sonnet-5-high.md",
      "agents/orc-planner-opus-5-med.md",
      "commands/orc-plan.md",
      "skills/_shared/extra-dispatch.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/references/analyst-gates.md",
      "skills/orc/references/plan-handoff.md",
      "skills/orc/references/preflight-report.md",
      "skills/orc/references/trace-protocol.md",
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
      // v1.0.0 W5 — the stall demotion is run-scoped state and names this as
      // the precedent it copies. That is a real dependency: if `ultra_mode`
      // ever stopped being run-scoped, the sentence justifying the demotion
      // would be wrong.
      "skills/_shared/extra-dispatch.md",
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
      "skills/orc-wiki/references/extra.md",
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
      "skills/orc-challenge/references/council.md",
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
      "skills/_shared/extra-dispatch.md",
      "skills/_shared/interview.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/council.md",
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
      "skills/_shared/extra-dispatch.md",
      "skills/_shared/interview.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/council.md",
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
      "skills/_shared/extra-dispatch.md",
      "skills/_shared/interview.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/council.md",
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
      "agents/orc-challenge-contrarian-opus-5-high.md",
      "agents/orc-challenge-executor-opus-5-med.md",
      "agents/orc-challenge-expansionist-opus-5-med.md",
      "agents/orc-challenge-judge-opus-5-high.md",
      "agents/orc-challenge-principles-opus-5-high.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/examples/council-full-roster.md",
      "skills/orc-challenge/examples/tsd-two-iterations.md",
      "skills/orc-challenge/references/council.md",
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
      "skills/orc-challenge/references/council.md",
      "skills/orc-challenge/references/sealed-slice.md",
    ],
  },
  {
    // v0.49.1: the FOURTH member of the interview family. Same split every time
    // — the facts are ORC's, the decision is the user's — but this one is about
    // WHO REVIEWS. A council chosen by ORC is ORC deciding which kinds of
    // criticism the user is allowed to hear, which is a bigger decision than any
    // single finding in the run. Mirrored in bin/cli.js, where `--council` has
    // no default and `init` refuses by name.
    // v0.49.1. The rule NO OTHER LINT CAN ENFORCE, which is exactly why it is
    // written down in three places and tested per read: a field the human path
    // prints and the JSON omits is drift, and both halves live in ONE function,
    // so nothing structural can ever notice the gap.
    name: "a read hands back the whole computed object (v0.49.1)",
    token: "--json is not a summary",
    files: [
      "skills/_shared/detecting-artifacts.md",
      // v1.0.0 W5 — `orc extra demotion --json` carries both clocks, the
      // counter, the evidence and the ladder before and after, because its TTY
      // branch prints all of them.
      "skills/_shared/extra-dispatch.md",
      "skills/orc-doc/references/house-rules.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "the council is the user's to pick (v0.49.1 — /orc-challenge)",
    token: "a lane that picks its own council",
    files: [
      "skills/_shared/extra-dispatch.md",
      "skills/_shared/interview.md",
      "skills/orc-challenge/README.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/examples/council-full-roster.md",
      "skills/orc-challenge/references/council.md",
      "skills/orc-challenge/references/intake.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // The rule that makes five extra reviewers SAFE. A lens may only ever add a
    // candidate; the judge is the only role that assigns an outcome, and it is
    // the instrument `orc challenge record` validates against. Without this, the
    // council is five more opinions with no arbiter and the ledger stops meaning
    // anything.
    name: "a lens raises, the judge resolves (v0.49.1 — the council)",
    token: "A lens raises; only the judge resolves",
    files: [
      "agents/orc-challenge-contrarian-opus-5-high.md",
      "agents/orc-challenge-executor-opus-5-med.md",
      "skills/orc-challenge/README.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/conservation.md",
      "skills/orc-challenge/references/council.md",
    ],
  },
  {
    // The council's canonical prose has ONE copy. The spine keeps the token and
    // a pointer; every lens agent points at it too, so a maintainer editing one
    // agent cannot invent a second idea of what the council is.
    name: "the council's canonical prose (v0.49.1)",
    token: "council.md",
    files: [
      "agents/orc-challenge-contrarian-opus-5-high.md",
      "agents/orc-challenge-executor-opus-5-med.md",
      "agents/orc-challenge-expansionist-opus-5-med.md",
      "agents/orc-challenge-outsider-opus-5-low.md",
      "agents/orc-challenge-principles-opus-5-high.md",
      "skills/orc-challenge/README.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/dimensions.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-challenge/references/sealed-slice.md",
    ],
  },
  {
    // conservation.md applied to INPUT. The obvious failure of adding five
    // reviewers is that the judge quietly ignores four of them and the run looks
    // identical while costing five times more — so the id set is derived by the
    // CLI from the reports on disk, never from the judge's account of them.
    name: "council conservation (v0.49.1 — conservation of input)",
    token: "council_coverage_pct",
    files: [
      "skills/orc-challenge/README.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/conservation.md",
      "skills/orc-challenge/references/council.md",
      "skills/orc-challenge/references/cycle-state.md",
      "skills/orc-challenge/references/verdict-doc.md",
    ],
    binFiles: ["bin/cli.js"],
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
      "skills/orc-challenge/examples/council-full-roster.md",
      "skills/orc-challenge/examples/tsd-two-iterations.md",
      "skills/orc-challenge/references/council.md",
      "skills/orc-challenge/references/fix-brief.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-challenge/references/sealed-slice.md",
      "skills/orc-challenge/references/verdict-doc.md",
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
      "skills/orc-challenge/examples/council-full-roster.md",
      "skills/orc-challenge/examples/tsd-two-iterations.md",
      "skills/orc-challenge/references/council.md",
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
      // v1.0.0 W5 — the demotion's run-scoped record lives BESIDE it, in
      // {run_dir}/{slug}/, and is deleted with the run. A move of one is a move
      // of the other.
      "skills/_shared/extra-dispatch.md",
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
      // v0.49.5 — the lane's own blurb now promises the hand-back by name.
      "commands/orc-doc.md",
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
      "skills/orc-challenge/README.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/conservation.md",
      "skills/orc-challenge/references/council.md",
      "skills/orc-challenge/references/cycle-state.md",
      "skills/orc-challenge/references/verdict-doc.md",
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
    // v0.36.0: the Opus-5-only dispatch mode. Widened from v0.35.0's
    // executor-table-only key, so the pointer has to reach every lane with a
    // fixed-role dispatch — not just the ones that score.
    name: "opus5-only dispatch mode (v0.36.0 — forcing role→opus-5 dispatch)",
    token: "opus5-only.md",
    files: [
      "agents/MODEL-MAPPING.md",
      "skills/_shared/README.md",
      "skills/_shared/drift-recovery.md",
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
      "skills/_shared/extra-dispatch.md",
      "skills/_shared/opus5-only.md",
      "skills/orc-analyze/references/deep-mode.md",
      "skills/orc-challenge/README.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-challenge/references/council.md",
      "skills/orc-challenge/references/intake.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-diy/README.md",
      "skills/orc-diy/references/blocks/extra.md",
      "skills/orc-doc/README.md",
      "skills/orc-fast/SKILL.md",
      "skills/orc-mini/SKILL.md",
      "skills/orc-pattern/SKILL.md",
      "skills/orc-quick/README.md",
      "skills/orc-quick/SKILL.md",
      "skills/orc-quick/references/dispatch-gate.md",
      "skills/orc-retro/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/extra.md",
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
          "skills/_shared/config-precedence.md",
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
      "skills/_shared/extra-dispatch.md",
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
      "skills/orc-diy/references/blocks/extra.md",
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
      "skills/_shared/extra-dispatch.md",
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
      "skills/orc-retro/SKILL.md",
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
      "skills/orc-doc/references/resume-protocol.md",
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
      "skills/_shared/extra-dispatch.md",
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
      "skills/orc-wiki/references/extra.md",
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
      // v0.55.0 — the slot table names the agent `wiki-scanner-light` displaces.
      "skills/_shared/extra-dispatch.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/extra.md",
      "skills/orc-wiki/references/partial-refresh.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "wiki scan tier mode (v0.46.0 — ladder | always_deep; the tier is never silent)",
    token: "wiki_scan_tier",
    files: [
      "skills/orc-wiki/SKILL.md",
      "skills/orc-wiki/references/extra.md",
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
      "skills/_shared/extra-dispatch.md",
      "skills/orc-challenge/references/council.md",
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
      "skills/orc-doc/references/gates.md",
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
      // v0.49.2 — both new rule pages send what they catch to the SAME place.
      "skills/orc-doc/references/house-rules.md",
      "skills/orc-doc/references/generation-rules.md",
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
      // v0.49.2 — the doc lane's DISPATCH tail names the section FILE, which is
      // the only thing that makes `orc doc cost` per-section honest.
      "skills/orc/references/trace-protocol.md",
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
      // The boundary sentence restates it: a house rule can never relax it.
      "skills/orc-doc/references/house-rules.md",
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
  // ── v0.49.2 — house rules, the generation rules, the template lock, the
  //              forecast, the cost report and the revision anchor ───────────
  {
    // The project's OWN standing instructions ride at the TOP of every slice,
    // above ORC's own. A rule the writer reads third is a rule the writer
    // weighs third, and the whole point of a P0 is that it is not weighed.
    name: "house rules ride first in every dispatched slice (v0.49.2)",
    token: "house rules are read first",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/house-rules.md",
      "skills/orc-doc/references/chunking.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // A SUPPLIED template is a cage, not a floor. `--template` set the outline
    // and then nothing stopped a writer adding a heading it never had.
    name: "a supplied template is a P0 cage (v0.49.2)",
    token: "a lane that writes outside its template",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-doc/references/generation-rules.md",
    ],
  },
  {
    // A revision round that names a rule but not a PLACE cannot be followed in
    // `sections/`, which is where the user is actually reading. The numbers are
    // part-local because the part file is what the writer opens.
    name: "an edit round names the file and the part-local line (v0.49.2)",
    token: "sections/<id>.md \u00b7 line",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/chunking.md",
    ],
  },
  {
    // The project ledger. Outside templates/, so `orc update` never clobbers it.
    // v0.49.5 — it is a PLAIN TEXT config now, and the file extension IS the
    // change: a `.json` row store and a `.md` a human edits are not the same
    // artifact, so the token moves with it.
    name: "the house-rule ledger's file (v0.49.2, text config in v0.49.5)",
    token: "doc-house-rules.md",
    files: [
      "skills/orc-doc/references/house-rules.md",
      // v0.49.5 — a config a human is told to open in their editor has to be
      // named where they are told to open it.
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/README.md",
      "commands/orc-doc.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "the run map, once, before the first paid wave (v0.49.2)",
    token: "orc doc forecast",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/gates.md",
      "skills/orc-doc/README.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "what a document cost, across every session it spanned (v0.49.2)",
    token: "orc doc cost",
    files: [
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/references/chunking.md",
      // The DISPATCH tail that makes per-section attribution honest is defined
      // there, so the command's name has to move with it.
      "skills/orc/references/trace-protocol.md",
      "skills/orc-doc/README.md",
      "commands/orc-doc.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // A run the user abandoned kept a RESUME.md forever, so it was waiting
    // forever — and that is what blocked the upgrade preview with no way out.
    name: "a run the human is finished with (v0.49.2)",
    token: "orc run close",
    files: [],
    binFiles: ["bin/cli.js"],
  },
  {
    name: "the local-reference switch (v0.49.2)",
    token: "doc_local_refs",
    files: [
      "skills/orc-doc/references/generation-rules.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-doc/README.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // v1.0.0 W10 — the call catalogue. `orc lane calls <lane> --json` is the one
    // copy of every call two or more lanes make, with its exit-code contract.
    // Pinned to the CLI because that is where the catalogue lives.
    name: "the call catalogue (v1.0.0 W10)",
    token: "orc lane calls",
    files: ["skills/_shared/read-ladder.md"],
    binFiles: ["bin/cli.js"],
  },
  {
    // v1.0.0 W10 — the partial-read discipline. The sentence that stops pillar 2
    // from making the payload SLOWER: a manifest of pointers read whole is more
    // round-trips than the prose it replaced.
    name: "a pointer declares how much of it to read (v1.0.0 W10)",
    token: "on-phase",
    files: ["skills/_shared/read-ladder.md"],
  },
  {
    // v1.0.0 W7 — ONE resolver per lane. A lane that re-derives a value from
    // `.claude/orc.config.yaml` has forked the resolver, and the fork is
    // invisible: it produces a plausible answer that is only wrong once a key
    // is shadowed. W8/W9 add every migrated lane spine to this list, which is
    // what turns "the lane should ask the CLI" into something a lint can see.
    name: "one config resolver per lane (v1.0.0 W7)",
    token: "orc lane config",
    files: [
      "skills/_shared/README.md",
      "skills/_shared/config-precedence.md",
      "skills/_shared/extra-dispatch.md",
      "skills/context-combiner/SKILL.md",
      "skills/orc-aftermath/SKILL.md",
      "skills/orc-analyze-mini/SKILL.md",
      "skills/orc-analyze/SKILL.md",
      "skills/orc-boundary/SKILL.md",
      "skills/orc-brainstorm/SKILL.md",
      "skills/orc-budget/SKILL.md",
      "skills/orc-challenge/SKILL.md",
      "skills/orc-claude/SKILL.md",
      "skills/orc-diy/SKILL.md",
      "skills/orc-doc/SKILL.md",
      "skills/orc-explain/SKILL.md",
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
      "skills/orc-retro/SKILL.md",
      "skills/orc-route/SKILL.md",
      "skills/orc-verify/SKILL.md",
      "skills/orc-wiki/SKILL.md",
      "skills/orc/SKILL.md",
      "skills/orc/config.md",
      "skills/orc/subskills/orc-pr/stack-gate.md",
    ],
    binFiles: ["bin/cli.js"],
  },
  {
    // The sentence the whole precedence model rests on. It is pinned to the CLI
    // as well as the payload because the CLI is where it is IMPLEMENTED — the
    // config file's own header says it, `orc config list` prints it per family,
    // and a payload that described a different rule would be describing a
    // pipeline that does not run.
    name: "read a family top-down, stop at the first rank that resolves (v1.0.0 W7)",
    token: "stop at the first rank that resolves",
    files: ["skills/_shared/config-precedence.md", "skills/orc/config.md"],
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
  // v0.50.0: deliberate raise 494→528 — Extra's four SEAMS, and every one of them
  // is a decision the spine makes before (or instead of) loading a reference.
  // (1) The subsystem header: the gate, the pointer, and `ONE resolver, and it is
  // not you` — the rule a compacted orchestrator is most likely to lose, and the
  // one whose loss produces a dispatch that does not match what the user was told.
  // (2) The Phase-1 resolve+announce: it joins the probe block its five neighbours
  // already occupy, and its `extra:` line is P0 — a run that crosses the boundary
  // silently is the one failure this whole subsystem is shaped around, so it may
  // not depend on a reference having been loaded. (3) The Phase-2 cited-risk
  // HOLD-BACK: it changes WHETHER a task leaves Claude, which no reference loaded
  // after scoring can do — the /orc-boundary-gate precedent exactly. (4) The
  // Phase-3 transport switch (Bash, not the Task tool) plus §2b-instead-of-§2 on
  // the return: a foreign worker emits no SPAWN/RETURN, so if the spine forgets
  // the trace tail there is no record at all. Mechanics — the engine capability
  // table, the five exit codes, the fence asymmetry, the fallback procedure —
  // live in _shared/extra-dispatch.md, with the rendering rules in
  // references/{preflight-report,effort-and-mode}.md.
  // v1.0.0 W7: deliberate raise 528→532 — the spine's hand-rolled `## Config`
  // (six lines: read config.md, merge the override, then a key list that was
  // already wrong) is replaced by the VERBATIM shared contract from
  // `_shared/config-precedence.md` §8, which is ten. Four lines up, and the
  // trade is the point: the old section told the orchestrator to read a table
  // of defaults that W7 deleted, and its key list is the exact hand-maintained
  // artefact `orc lane config` exists to replace. The contract is identical in
  // every lane by design, so it is never shortened to fit one budget. W8/W9
  // take this back down — they delete the same section from thirty more lanes.
  { file: "skills/orc/SKILL.md", maxLines: 532 },
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
  // v1.0.0 W8: deliberate raise 325→335 — orc-wiki had NO `## Config` section at all — it names each key inline where it is used, which is already the right shape. What it lacked was the resolver, so this is the ten-line contract arriving, not prose moving.
  { file: "skills/orc-wiki/SKILL.md", maxLines: 335 },
  // v0.34.2: deliberate raise 219→220 — the run-start `touch the trace file`
  // step. It is one line, it is the fix for the corpus's largest defect family,
  // and it has to sit in the spine because it happens before any reference loads.
  // v0.40.0: deliberate raise 220→225 — the gotchas trigger (probe, inject,
  // append). Mini reads AND writes repair memory, and the write is the
  // orchestrator's alone; the trimmed mechanics live in _shared/gotchas.md §10.
  // v0.50.0: deliberate raise 225→227 — Extra, as ONE paragraph beside the
  // agent name-map, because that is the table it modifies. Mini has no score, so
  // the resolve-the-BAND-at-both-edges rule decides WHETHER the single executor
  // leaves Claude at all; it happens before any reference loads, and getting it
  // wrong routes a whole run on a partially covering row. Mechanics in
  // _shared/extra-dispatch.md.
  // v1.0.0 W8: deliberate raise 227→237 — mini's `## Config` was fifteen lines, but nine of them were the TDD lane POLICY (one intake question, the disposition set, the repair cap) — which is not config and is kept, now under its own heading. Only six lines of restated resolution were deleted, against a ten-line contract.
  { file: "skills/orc-mini/SKILL.md", maxLines: 237 },
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
  // v1.0.0 W9: deliberate raise 221→232 — the analyst reads `default_analysis_depth`,
  // `max_scouts` and `opus5_only`, and that last one is a CONTESTED rank, so this lane
  // gets the full resolver contract rather than the short pointer. Ten lines arriving,
  // not prose moving: it had no `## Config` section at all before this wave.
  { file: "skills/orc-analyze/SKILL.md", maxLines: 232 },
  // v0.40.0: deliberate raise 182→187 — gotchas as an explicit NON-gate. It has
  // to be stated where the two prerequisites are stated, or a later reader adds
  // a third gate and breaks the lane's entire premise.
  // v0.50.0: deliberate raise 187→189 — Extra, stated at the slice build beside
  // the pinned executor name, with the same both-edges band rule mini uses and
  // the explicit clause that Extra is ORTHOGONAL to the knowledge gate. That
  // clause is the one a later reader would most plausibly get wrong — this lane
  // is defined by having exactly two prerequisites, and a foreign executor is
  // not a third one. Mechanics in _shared/extra-dispatch.md.
  // v1.0.0 W8: deliberate raise 189→199 — fast's `## Config` was six lines of restated resolution plus a two-key list; the contract is ten. The lane genuinely has no config key of its own, which is now something the resolver says rather than something the spine claims.
  { file: "skills/orc-fast/SKILL.md", maxLines: 199 },
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

// ── The two-way registry lint (C.3) ────────────────────────────────────────
// v1.0.0 W3. REPLACES the old `config-key coverage` check, which asserted that
// every CONFIG_META key appeared as a substring SOMEWHERE under
// templates/skills/**. That test was already weak — a key mentioned in a
// paragraph passed it — and centralization makes it vacuous: after W7 the keys
// live in ONE registry doc, so a grep across the payload would pass forever
// while every lane silently stopped reading anything. Replacing it in the same
// wave that makes it vacuous is not optional; a lint nobody removed and nobody
// can fail is worse than no lint, because it reads as coverage.
//
// Six assertions where there was one, and none of them can be satisfied by
// mentioning a word in a paragraph:
//
//   1. every key declares a NON-EMPTY lanes[]  — a key no lane reads is
//      decorative, which is the thing the old check was actually for;
//   2. every lane named in any lanes[] is a real lane, against the LANES
//      registry the `orc lane` noun serves;
//   3. LANES itself matches the payload in BOTH directions — a skill with no
//      row is a lane `orc lane config` cannot answer for, and a row with no
//      skill is a lane that does not exist;
//   4. every LANE_INERT lane and every LANE_STOPS key is real;
//   5. every gate is a real key and gates are not chained;
//   6. the answer tally accounts for every key.
//
// The half of the old check that was never vacuous SURVIVES: a skill naming
// `config.<key>` for a key the CLI cannot write is still drift, and no registry
// can see that from the CLI side.
{
  const cliText = fs.readFileSync(path.join(REPO_ROOT, "bin", "cli.js"), "utf8");
  const errs = [];

  const metaBlock = (cliText.match(/const CONFIG_META = \[([\s\S]*?)\n\];/) || [])[1] || "";
  const metaEntries = [];
  for (const line of metaBlock.split(/\r?\n/)) {
    const key = (line.match(/\{ key: "([a-z0-9_]+)", def: /) || [])[1];
    if (!key) continue;
    const lanesSrc = (line.match(/ lanes: (\[[^\]]*\])/) || [])[1];
    const answersSrc = (line.match(/ answers: (\[[^\]]*\}\])/) || [])[1];
    let lanes = null;
    let answers = null;
    try {
      lanes = lanesSrc ? new Function("return " + lanesSrc)() : null;
    } catch (_) {}
    try {
      answers = answersSrc ? new Function("return " + answersSrc)() : null;
    } catch (_) {}
    metaEntries.push({
      key,
      lanes,
      answers,
      gated_by: (line.match(/ gated_by: "([a-z0-9_]+)"/) || [])[1] || null,
    });
  }
  const cliKeys = metaEntries.map((e) => e.key);
  const metaKeys = new Set(cliKeys);

  let LANES = null;
  let LANE_INERT = null;
  let LANE_STOPS_KEYS = null;
  try {
    LANES = new Function(
      "return " + cliText.match(/const LANES = \[[\s\S]*?\n\];/)[0].replace(/^const LANES = /, "").replace(/;$/, "")
    )();
  } catch (e) {
    errs.push("could not evaluate LANES from bin/cli.js: " + e.message);
  }
  try {
    LANE_INERT = new Function(
      "return " + cliText.match(/const LANE_INERT = \{[\s\S]*?\n\};/)[0].replace(/^const LANE_INERT = /, "").replace(/;$/, "")
    )();
  } catch (e) {
    errs.push("could not evaluate LANE_INERT from bin/cli.js: " + e.message);
  }
  try {
    const src = cliText.match(/const LANE_STOPS = \[[\s\S]*?\n\];/)[0];
    LANE_STOPS_KEYS = [...src.matchAll(/\n    key: "([a-z0-9_]+)",/g)].map((m) => m[1]);
  } catch (e) {
    errs.push("could not read LANE_STOPS from bin/cli.js: " + e.message);
  }

  if (!cliKeys.length) errs.push("could not parse CONFIG_META from bin/cli.js");

  // 1. A NON-EMPTY lanes[]. The ten below are the v1.0.0 W2 mechanical seed's
  // known gap: `_shared/extra-dispatch.md` names them, no lane spine does, and
  // W8/W9 assign them lane by lane. The allowlist is NAMED rather than implied
  // so the exception is visible and shrinking; a key joining it must be a
  // deliberate line in a diff, not a silent pass.
  //
  // W5 added the last two knowingly. `extra_demote_after` and
  // `extra_demote_stale_min` are OPERATING keys of the bridge in exactly the
  // sense `extra_stall_s` is — every lane that dispatches foreign reads them
  // through `orc extra resolve`, and none of them names them — so they join the
  // list rather than being given a guessed lane set. W8/W9 empty it.
  const SEED_EMPTY = new Set([
    "extra_max_concurrent",
    "extra_unlock",
    "extra_vault_max_attempts",
    "extra_timeout_s",
    "extra_passphrase_ttl_days",
    "extra_verify_max_days",
    "extra_stall_s",
    "extra_resume_max",
    "extra_demote_after",
    "extra_demote_stale_min",
  ]);
  for (const e of metaEntries) {
    if (!e.lanes) {
      errs.push(`${e.key}: lanes[] is missing or unparseable`);
      continue;
    }
    if (!e.lanes.length && !SEED_EMPTY.has(e.key))
      errs.push(`${e.key}: lanes[] is empty — a key no lane reads is decorative; wire it or drop it`);
  }
  for (const k of SEED_EMPTY) {
    const e = metaEntries.find((x) => x.key === k);
    if (!e) errs.push(`the seed-empty allowlist names "${k}", which is no longer a CONFIG_META key`);
    else if (e.lanes && e.lanes.length)
      errs.push(`${k}: now has lanes[] — remove it from the seed-empty allowlist in this lint`);
  }

  // D28 (deferred from W3) — `design-01` §10.6: every lane spine carries the
  // config contract. W8 turned it on for five lanes; W9 completes it, so the
  // named migrated-lane list is GONE and this is one loop over every lane.
  //
  // TWO FORMS, and the split is the W9 measurement (D32). A lane whose keys can
  // be shadowed, gated, inert or a STOP carries the FULL contract: getting
  // precedence wrong there changes what runs, and `announce[]` is P0 — a
  // shadowed setting must never be silent, which a reference loaded later
  // cannot guarantee. Every other lane that reads a key carries the SHORT
  // pointer: the guarantee it needs is only "do not merge the file yourself".
  // A lane that reads NO key carries neither, and that is an answer, not a gap.
  //
  // Both forms name the lane's OWN name and point at the precedence reference,
  // so one assertion covers them; what separates them is whether the spine has
  // to mention `announce[]`.
  const laneKeySets = {};
  for (const e of metaEntries) for (const l of e.lanes || []) (laneKeySets[l] ||= []).push(e.key);
  const CONTESTED_KEYS = new Set(["extra_enabled", "opus5_only", "rubric_bands_override"]);
  const gatedKeys = new Set(metaEntries.filter((e) => e.gated_by).map((e) => e.key));
  const inertLanes = new Set(Object.keys(LANE_INERT || {}));

  for (const lane of fs
    .readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared")
    .map((d) => d.name)) {
    const spine = path.join(ROOT, "skills", lane, "SKILL.md");
    if (!fs.existsSync(spine)) continue;
    const text = fs.readFileSync(spine, "utf8");
    const keys = laneKeySets[lane] || [];
    if (!keys.length) {
      if (text.includes("orc lane config"))
        errs.push(`${lane}: reads no config key, so it must not carry a config contract — an empty answer is an answer`);
      continue;
    }
    if (!text.includes(`orc lane config ${lane} --json`)) {
      errs.push(`${lane}: reads ${keys.length} key(s) but its spine does not name \`orc lane config ${lane} --json\` — the contract is missing or names the wrong lane`);
      continue;
    }
    if (!text.includes("config-precedence.md"))
      errs.push(`${lane}: the config contract is there but points at no precedence reference`);
    // The thing the contract REPLACES. A spine that still tells the
    // orchestrator to merge the override file itself has two resolvers, and the
    // second is the one that will be wrong once a key is shadowed.
    if (/defaults merged with|config\.md. defaults|← .claude\/orc\.config\.yaml/.test(text))
      errs.push(`${lane}: the spine still restates config resolution — the contract replaces that, it does not sit beside it`);
    const needsFull =
      keys.some((k) => CONTESTED_KEYS.has(k) || gatedKeys.has(k)) || inertLanes.has(lane);
    if (needsFull && !text.includes("announce[]"))
      errs.push(`${lane}: reads a contested, gated or inert key, so it needs the FULL contract — the short pointer owes no announce[] line and this lane does`);
    if (!needsFull && text.includes("announce[]"))
      errs.push(`${lane}: carries the full contract but reads nothing contested, gated or inert — use the short pointer, or the announce[] obligation is a line nobody can produce`);
  }

  if (LANES) {
    const laneNames = new Set(LANES.map((l) => l.lane));

    // 2. Every lane a key names is a real lane.
    for (const e of metaEntries)
      for (const l of e.lanes || [])
        if (!laneNames.has(l)) errs.push(`${e.key}: lanes[] names "${l}", which is not a lane in LANES`);

    // 3. LANES vs the payload, BOTH directions. `orc lane config <lane>` is the
    // only config resolver a spine is allowed to ask, so a skill missing here
    // is a spine with no answer, and a row here with no skill is a lane the
    // panel would offer and the CLI could never serve.
    const skillDirs = fs
      .readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "_shared")
      .map((d) => d.name);
    for (const d of skillDirs)
      if (!laneNames.has(d)) errs.push(`templates/skills/${d}/ has no row in LANES`);
    for (const l of LANES) {
      if (!skillDirs.includes(l.lane)) errs.push(`LANES declares "${l.lane}", which is not a directory under templates/skills/`);
      // A lane with no command is a lane something else dispatches, and it has
      // to SAY which — an unexplained null reads as an oversight.
      if (l.command === null && !l.note) errs.push(`LANES "${l.lane}" has no command and no note explaining what opens it`);
      if (l.command && !fs.existsSync(path.join(ROOT, "commands", l.command + ".md")))
        errs.push(`LANES "${l.lane}" names command "${l.command}", which is not a file under templates/commands/`);
    }

    // 4. The two lane-keyed tables.
    if (LANE_INERT)
      for (const l of Object.keys(LANE_INERT))
        if (!laneNames.has(l)) errs.push(`LANE_INERT names "${l}", which is not a lane in LANES`);
  }
  if (LANE_INERT) {
    const famBlock = cliText.match(/const CONFIG_FAMILIES = \{[\s\S]*?\n\};/);
    let FAM = null;
    try {
      FAM = new Function("return " + famBlock[0].replace(/^const CONFIG_FAMILIES = /, "").replace(/;$/, ""))();
    } catch (_) {}
    for (const [lane, rows] of Object.entries(LANE_INERT))
      for (const r of rows) {
        if (!r.reason) errs.push(`LANE_INERT ${lane}: a row with no reason — an inert key must say why, in words that survive`);
        if (r.key && !metaKeys.has(r.key)) errs.push(`LANE_INERT ${lane}: key "${r.key}" is not a CONFIG_META key`);
        if (r.family && FAM && !FAM[r.family]) errs.push(`LANE_INERT ${lane}: family "${r.family}" is not in CONFIG_FAMILIES`);
        if (!r.key && !r.family) errs.push(`LANE_INERT ${lane}: a row names neither a key nor a family`);
      }
  }
  if (LANE_STOPS_KEYS)
    for (const k of LANE_STOPS_KEYS)
      if (!metaKeys.has(k)) errs.push(`LANE_STOPS names "${k}", which is not a CONFIG_META key`);

  // 5. Gates are real, and are not chained. A gate whose own gate is off would
  // make `inert_reason` name a key that is itself inert, and the sentence stops
  // being true one hop away from where it is read.
  for (const e of metaEntries) {
    if (!e.gated_by) continue;
    if (!metaKeys.has(e.gated_by)) {
      errs.push(`${e.key}: gated_by "${e.gated_by}" is not a CONFIG_META key`);
      continue;
    }
    const gate = metaEntries.find((x) => x.key === e.gated_by);
    if (gate && gate.gated_by)
      errs.push(`${e.key}: gated_by "${e.gated_by}", which is itself gated by "${gate.gated_by}" — gates are not chained`);
  }

  // 6. The tally. Every key contributes at least one answer, and every answer
  // lands in one of the four ranks — so a key cannot go missing from the
  // precedence model by declaring nothing.
  const tally = { P0: 0, P1: 0, P2: 0, P3: 0 };
  let answersTotal = 0;
  for (const e of metaEntries) {
    if (!e.answers || !e.answers.length) {
      errs.push(`${e.key}: no answers[] — it is in no family's tally`);
      continue;
    }
    for (const a of e.answers) {
      answersTotal++;
      if (tally[a.prio] === undefined) errs.push(`${e.key}: prio "${a.prio}" is outside the closed set`);
      else tally[a.prio]++;
    }
  }
  const summed = tally.P0 + tally.P1 + tally.P2 + tally.P3;
  if (summed !== answersTotal)
    errs.push(`the prio tally sums to ${summed} but there are ${answersTotal} answers`);

  // The surviving half of the old check: a skill naming a key the CLI cannot
  // write. No registry sees this — it is a claim the payload makes about the
  // CLI, and only a scan of the payload can check it.
  const skillFiles = allFiles.filter((f) => f.startsWith("skills/"));
  const skillText = skillFiles.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  const EXT = new Set(["md", "yaml", "yml", "json", "js", "txt"]);
  const ALLOW = new Set(["rubric_bands_override"]); // hand-edit-only advanced key
  const referenced = new Set();
  for (const m of skillText.matchAll(/config\.([a-z][a-z0-9_]+)/g)) referenced.add(m[1]);
  for (const k of [...referenced].filter((k) => !metaKeys.has(k) && !EXT.has(k) && !ALLOW.has(k)))
    errs.push(`templates reference config.${k} but no such CLI CONFIG_META key`);

  // A key ORC REMOVED must not still be named as a live setting by the payload.
  // The old coverage check could not see this at all: it only looked for keys
  // that were MISSING from the payload, never for ones that should have left.
  const retiredKeys = [...cliText.matchAll(/^  ([a-z0-9_]+): \{ removed_in:/gm)].map((m) => m[1]);
  for (const k of retiredKeys)
    if (new RegExp("\\b" + k + "\\b").test(skillText))
      errs.push(`retired key "${k}" is still named under templates/skills/ — it was removed; the payload must not offer it`);

  if (errs.length) {
    failures++;
    console.error("\n❌ config registry drift:");
    for (const e of errs) console.error("   - " + e);
  }
}

// ── Config data model (C.4) ────────────────────────────────────────────────
// v1.0.0 W2. Every CONFIG_META key declares WHICH QUESTION it answers, at which
// rank, in which mode. This lint is what stops that from becoming decoration.
//
// C.3 above asserts the REGISTRY is wired (lanes, gates, the tally). This adds
// the half a registry check cannot see: that the ranks are a real ladder.
// A contested family with two P0 keys, or a key claiming a rank the family's
// own `ranks[]` gives to somebody else, is a precedence that resolves
// differently depending on which table you read.
{
  const cliText = fs.readFileSync(path.join(REPO_ROOT, "bin", "cli.js"), "utf8");
  const errs = [];

  // CONFIG_FAMILIES is pure data, so it is evaluated rather than regexed.
  // CONFIG_META is not (`validate: vInt(1)`), so its three new fields are read
  // per entry — the same technique C.3 uses on the same table.
  let FAMILIES = null;
  const famBlock = cliText.match(/const CONFIG_FAMILIES = \{[\s\S]*?\n\};/);
  try {
    FAMILIES = new Function("return " + famBlock[0].replace(/^const CONFIG_FAMILIES = /, "").replace(/;$/, ""))();
  } catch (e) {
    errs.push("could not evaluate CONFIG_FAMILIES from bin/cli.js: " + e.message);
  }

  const metaBlock = (cliText.match(/const CONFIG_META = \[([\s\S]*?)\n\];/) || [])[1] || "";
  const entries = [];
  for (const line of metaBlock.split(/\r?\n/)) {
    const key = (line.match(/\{ key: "([a-z0-9_]+)", def: /) || [])[1];
    if (!key) continue;
    const answersSrc = (line.match(/ answers: (\[[^\]]*\}\])/) || [])[1];
    const gatedBy = (line.match(/ gated_by: "([a-z0-9_]+)"/) || [])[1] || null;
    let answers = null;
    try {
      answers = answersSrc ? new Function("return " + answersSrc)() : null;
    } catch (_) {}
    entries.push({ key, answers, gated_by: gatedBy, has_lanes: / lanes: \[/.test(line) });
  }
  const metaKeys = new Set(entries.map((e) => e.key));

  const PRIOS = ["P0", "P1", "P2", "P3"];
  const MODES = ["replace", "overlay", "gate"];

  if (!entries.length) errs.push("could not parse CONFIG_META from bin/cli.js");
  if (FAMILIES) {
    for (const e of entries) {
      if (!e.answers || !e.answers.length) {
        errs.push(`${e.key}: no answers[] — every key must declare the question it answers`);
        continue;
      }
      if (!e.has_lanes) errs.push(`${e.key}: no lanes[] (an empty array is fine; a missing one is not)`);
      for (const a of e.answers) {
        if (!FAMILIES[a.family]) {
          errs.push(`${e.key}: answers a family "${a.family}" that CONFIG_FAMILIES does not declare`);
          continue;
        }
        if (!PRIOS.includes(a.prio)) errs.push(`${e.key}: prio "${a.prio}" is not one of ${PRIOS.join("/")}`);
        if (!MODES.includes(a.mode)) errs.push(`${e.key}: mode "${a.mode}" is not one of ${MODES.join("/")}`);
        const fam = FAMILIES[a.family];
        if (fam.contested) {
          // The family's ranks[] IS the registry. A key may not claim a rank
          // the family gives to someone else, and may not claim one at all
          // without appearing in it.
          const row = (fam.ranks || []).find((r) => r.key === e.key);
          if (!row) errs.push(`${e.key}: claims contested family "${a.family}" but is not in its ranks[]`);
          else if (row.prio !== a.prio)
            errs.push(`${e.key}: says ${a.prio} in "${a.family}", whose ranks[] says ${row.prio}`);
          else if (row.mode !== a.mode)
            errs.push(`${e.key}: says mode ${a.mode} in "${a.family}", whose ranks[] says ${row.mode}`);
        } else if (a.prio !== "P2") {
          // Rank distinctness is meaningless where nothing competes, so the
          // neutral rank is asserted instead — a P0 in an uncontested family
          // is somebody inventing a ladder that does not exist.
          errs.push(`${e.key}: "${a.family}" is uncontested, so every key in it must be P2 (got ${a.prio})`);
        }
      }
      if (e.gated_by && !metaKeys.has(e.gated_by))
        errs.push(`${e.key}: gated_by "${e.gated_by}" is not a CONFIG_META key`);
    }

    const answered = new Set(entries.flatMap((e) => (e.answers || []).map((a) => a.family)));
    for (const [name, fam] of Object.entries(FAMILIES)) {
      if (!answered.has(name)) errs.push(`family "${name}" is declared but no key answers it`);
      if (!fam.question) errs.push(`family "${name}" has no question — a family IS a question`);
      if (!fam.contested) {
        if (fam.ranks) errs.push(`family "${name}" is uncontested but declares ranks[]`);
        continue;
      }
      const ranks = fam.ranks || [];
      if (!ranks.length) {
        errs.push(`contested family "${name}" declares no ranks[]`);
        continue;
      }
      const prios = ranks.map((r) => r.prio);
      if (new Set(prios).size !== prios.length)
        errs.push(`contested family "${name}" has duplicate ranks: ${prios.join(", ")}`);
      if (prios.filter((p) => p === "P0").length !== 1)
        errs.push(`contested family "${name}" must have exactly one P0`);
      // THE LOWEST RANK MUST BE TOTAL. Something has to answer when nothing
      // above resolved, and a fall-through is a ROW, never a setting.
      const last = ranks[ranks.length - 1];
      if (last.key !== null || !last.terminal)
        errs.push(`contested family "${name}" has no terminal row (key: null + terminal: "…") at its lowest rank`);
      for (const r of ranks.slice(0, -1)) {
        if (!r.key) errs.push(`contested family "${name}": only the lowest rank may have key: null`);
        else if (!metaKeys.has(r.key) && !r.registry_less)
          errs.push(`contested family "${name}": rank ${r.prio} names "${r.key}", which is not a CONFIG_META key and is not flagged registry_less`);
        if (!MODES.includes(r.mode)) errs.push(`contested family "${name}": rank ${r.prio} has no valid mode`);
      }
    }
  }

  if (errs.length) {
    failures++;
    console.error("\n❌ config data model drift:");
    for (const e of errs) console.error("   - " + e);
  }
}

// ── The call catalogue (C.5) ───────────────────────────────────────────────
// v1.0.0 W10 (design-05 §6). Three assertions, and the reason each exists is a
// bug this repo has already shipped.
//
// A CLI invocation restated per lane is an exit-code contract restated per
// lane. `orc diy status` INVERTED its exit code for a release (v0.34.7) and
// `orc pattern status` needed a third code because lanes were passing a file
// extension where a framework key was required (v0.34.8). Both were payload
// prose disagreeing with the CLI, and no lint could see either.
{
  const errs = [];
  const cliText = fs.readFileSync(path.join(REPO_ROOT, "bin", "cli.js"), "utf8");
  const block = cliText.match(/const LANE_CALLS = \{[\s\S]*?\n\};/);
  if (!block) {
    console.error("\n❌ call catalogue: could not parse LANE_CALLS from bin/cli.js");
    failures++;
  }
  let CALLS = null;
  if (block) try {
    CALLS = new Function("return " + block[0].replace(/^const LANE_CALLS = /, "").replace(/;$/, ""))();
  } catch (e) {
    console.error("\n❌ call catalogue: LANE_CALLS does not parse — " + e.message);
    failures++;
  }
  if (CALLS) {

  // The lane set, measured from the payload rather than believed. This is the
  // check CONFIG_META's own `lanes[]` cannot have (W8 §4: applying the config
  // contract removed the key names a grep would need), so the catalogue is
  // built the other way round — the stored set must EQUAL the measured one, in
  // both directions.
  const skillsDir = path.join(ROOT, "skills");
  const measured = {};
  const walk = (dir, acc) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (e.name.endsWith(".md")) acc.push(p);
    }
    return acc;
  };
  for (const lane of fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared")
    .map((d) => d.name)) {
    const text = walk(path.join(skillsDir, lane), [])
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n");
    for (const m of text.matchAll(/\borc ([a-z-]+) ([a-z-]+)/g)) {
      const key = `orc ${m[1]} ${m[2]}`;
      (measured[key] ||= new Set()).add(lane);
    }
  }
  // The prefix a catalogue entry is measured by: the first three words of its
  // `cmd`, which is the `orc <noun> <verb>` a payload grep can see.
  const prefixOf = (cmd) => cmd.split(/\s+/).slice(0, 3).join(" ");

  // 1. Every catalogued `cmd` is a real CLI route. A renamed command must fail
  //    here rather than sending every lane that reads the catalogue at a
  //    command that no longer exists — the v0.56.0 lesson at payload scale.
  const routeNouns = new Set(
    [...cliText.matchAll(/^    case "([a-z-]+)":/gm)].map((m) => m[1])
  );
  for (const [id, c] of Object.entries(CALLS)) {
    const noun = c.cmd.split(/\s+/)[1];
    if (!routeNouns.has(noun))
      errs.push(`${id}: cmd "${c.cmd}" names \`orc ${noun}\`, which is not a top-level CLI route`);
    for (const f of ["what", "cost", "when", "on_absent", "never"])
      if (!c[f]) errs.push(`${id}: missing \`${f}\` — the six fields are the contract`);
    if (!c.exits || !Object.keys(c.exits).length)
      errs.push(`${id}: no exits — an exit code is a contract, not a detail`);
    for (const code of Object.keys(c.exits || {}))
      if (!/^\d+$/.test(code)) errs.push(`${id}: exit key "${code}" is not a number`);
    if (!["free", "paid", "paid-per-task"].includes(c.cost))
      errs.push(`${id}: cost "${c.cost}" is outside the closed set (free · paid · paid-per-task)`);
    if (c.canonical && !fs.existsSync(path.join(ROOT, "skills", c.canonical)))
      errs.push(`${id}: canonical "${c.canonical}" does not exist`);
  }

  // 2. THE TWO-WAY HALF. A call two or more lanes make must be catalogued, or a
  //    call quietly grows back into several spines with a different wording of
  //    its exit codes in each — which is the whole failure being prevented.
  const ALLOW = new Set([
    // Prose that happens to match `orc <word> <word>` and is not a command.
    "orc or orc-mini",
    "orc was updated",
    "orc is installed",
    "orc and orc-mini",
    "orc lane calls", // the catalogue's own reader, named in read-ladder.md
    "orc lane phases", // W12
  ]);
  const catalogued = new Set(Object.values(CALLS).map((c) => prefixOf(c.cmd)));
  for (const [call, lanes] of Object.entries(measured)) {
    if (lanes.size < 2) continue; // one lane's own call is deliberately not catalogued
    if (catalogued.has(call) || ALLOW.has(call)) continue;
    errs.push(
      `"${call}" is named by ${lanes.size} lanes (${[...lanes].sort().join(", ")}) but is not in the catalogue — ` +
        "catalogue it, or add it to the lint's ALLOW list if it is prose"
    );
  }

  // 3. Every catalogued call has >= 2 lanes, and its stored set is the measured
  //    one. design-05 §6.3: a call one lane makes belongs to that lane.
  for (const [id, c] of Object.entries(CALLS)) {
    const want = [...(measured[prefixOf(c.cmd)] || new Set())].sort();
    if (want.length < 2)
      errs.push(
        `${id}: only ${want.length} lane names it — a call one lane makes belongs to that lane and is not catalogued`
      );
    const have = [...(c.lanes || [])].sort();
    if (have.join(",") !== want.join(",")) {
      const gained = want.filter((l) => !have.includes(l));
      const lost = have.filter((l) => !want.includes(l));
      errs.push(
        `${id}: lanes[] disagrees with the payload` +
          (gained.length ? ` — ${gained.join(", ")} name it and are not listed` : "") +
          (lost.length ? ` — ${lost.join(", ")} are listed and no longer name it` : "")
      );
    }
  }

  if (errs.length) {
    failures++;
    console.error("\n❌ call catalogue drift:");
    for (const e of errs) console.error("   - " + e);
  }
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
