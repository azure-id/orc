---
name: orc-analyze
description: >
  System Analyst for ORC. Use for "/orc-analyze",
  "analyze this doc for scope X", or when a requirements/audit document (PDF by
  path or pasted) must be turned into a precise, code-grounded requirement set
  BEFORE any planning. Bounds scope to exactly what the user asked (recognizes
  other scopes only to exclude them), maps each requirement to real files,
  verifies the doc's claims against actual code, and challenges the user
  interactively on scope and accuracy issues. Prevents scope-bleed and
  building against stale doc claims. Also auto-triggers inside /orc
  when a doc is present. The orchestrator dispatches this work to a subagent —
  it never analyzes itself.
---

# ORC-ANALYZE (System Analyst)

The orchestrator stays on top and **dispatches a System Analyst subagent
(Opus 4.8, high)** to do this work — it never analyzes itself, keeping its own
context lean. This skill defines what that subagent does and how the
orchestrator relays its challenges and branches on its result.

Purpose: turn "this document, scope X" into a confirmed, code-grounded
requirement report + machine spec that a planner cannot misread — so
implementation never bleeds into other scopes or builds against claims the code
already contradicts.

## Hard rules

1. **Dispatched, not self-run.** The orchestrator coordinates; the Analyst
   subagent (Opus 4.8 high) reads the doc, reads the code, and reconciles.
2. **Recognize-to-exclude.** Other scopes (Y, Z) are recognized only to police
   the boundary. The written report contains ONLY the requested scope X.
3. **Ground against real code.** Every in-scope requirement (or audit row) maps
   to specific files/modules, verified to exist and match.
4. **Challenge interactively, one issue at a time** — scope + accuracy only.
   Never batch. Each answer is recorded in the report.
5. **Two artifacts, spec derived from report.** The human `report.md` is the
   source of truth you confirm; `requirement-spec.md` is DERIVED from it (a
   projection, so they can't drift).
6. Usage: report dispatch + remind the user to run `/usage`. Never invoke it.

## Phase A — Ingest & detect mode

Read the doc (PDF via path or pasted content, or other formats). **Auto-detect**
whether it is:
- **prose/spec** — narrative requirements, or
- **audit/structured** — columns like expectation / notes / result.

**Confirm the detected mode with the user** ("This looks like an audit doc with
result columns — analyze it in audit mode?") before proceeding.

## Phase B — Bound scope

Take the user's scope instruction (X). Identify the doc's full scope structure
internally (X, Y, Z…), isolate X, and set the rest aside — they will NOT appear
in the output. If the user didn't name a scope, ask which scope(s) are in play.

## Phase C — Reconcile against code (mode-specific)

- **Prose mode:** for each in-scope requirement, find the files/modules it
  touches, and confirm they exist / already implement / are missing / conflict.
- **Audit mode:** for each in-scope row, take its claim (result + notes) and
  verify against the code. Surface divergences:
  - result PASS but notes suggest a change → challenge.
  - result FAIL citing a reason the code contradicts (e.g. a UUID check the
    code has renamed/removed/replaced) → challenge; the audit premise is stale.

## Phase D — Challenge (interactive, one at a time)

For every scope-bleed or doc-vs-code divergence, ask the user a single focused
question, wait, record the answer, continue. Scope + accuracy only — not task
breakdown (that's the planner's job). Relay each as a plain-language question.

## Phase E — Write report, derive spec

1. Write `report.md` in the mode-specific template (schemas/report-audit.md or
   report-prose.md) into `.claude/skills/orc/analyzer/{analysis-name}/` (internal).
2. Derive `requirement-spec.md` FROM the confirmed report
   (schemas/requirement-spec.md) in the same internal folder.

## Phase F — Branch (plain-language choice)

Artifacts are written INTERNALLY to `orc/analyzer/{name}/`. Then ask, in natural
terms:
- **Report only** → COPY the human `report.md` OUT to the project root at
  `{report_out_dir}/{name}/` (config, default `analyst_report/`) so the user can
  read it, and stop. "Analysis complete — I've put the report in
  `analyst_report/{name}/` for you. Leaving it as a report for now."
- **Take into build** → hand BOTH internal files back to the ORCHESTRATOR, which
  continues at Phase 1 with the Requirement Planner, and THEN runs the full
  pipeline (Phase 2 scoring + effort table + batch-pause ask, Phase 3
  wave-grouping capped at max_wave_tasks with checkpoints, through ship). The
  analyst NEVER builds directly. "Scope is confirmed and grounded against your
  code. I'll hand this to planning and take it through the full build — shall I
  continue?"

## Mini variant

For the fast lane, `orc-analyze-mini` (Sonnet 5 high) does a
shallower version of the same flow, used by orc-mini. Same artifacts, same
output contract; trimmed depth. See that skill.
