---
name: context-combiner
description: >
  Combines 2+ RELATED, already-confirmed ORC analyses (from orc-analyze) into
  ONE merged, deduped, conflict-resolved requirement context before build. Use
  when the user analyzed multiple related documents within the same scope and
  chose "pass to context-combiner" at orc-analyze's Phase F. Verifies the source
  analyses actually overlap (shared files/requirements/scope) and challenges the
  user if they look unrelated; resolves cross-scope conflicts and duplicates one
  at a time until the combined context is clear; writes combined-report.md +
  combined-requirement-spec.md (the merged spec reuses the requirement-spec
  schema, so the planner/build pipeline is unchanged). Full lane only (Opus 4.8
  high). The orchestrator DISPATCHES this to a subagent — it never combines
  itself, and the combiner never builds or spawns subagents.
---

# CONTEXT-COMBINER

The orchestrator stays on top and **dispatches a Context Combiner subagent
(orc-context-combiner-opus-4-8-high)** with a list of 2+ confirmed analysis
spec paths. It never combines itself. The combiner merges related, ALREADY
code-grounded analyses — it does not re-analyze the repo from scratch.

Purpose: turn 2+ related, confirmed requirement-specs (same user scope) into ONE
merged, deduped, conflict-resolved requirement set a planner can build from as if
it were a single analysis.

## Hard rules

1. **Dispatched, not self-run.** The orchestrator coordinates; the Combiner
   subagent (Opus 4.8 high) reads the specs and reconciles them against each
   other. The combiner NEVER builds and NEVER spawns subagents.
2. **Related only — verify + challenge.** The user asserted relatedness at the
   Phase F gate, but the combiner MUST verify real overlap (shared files,
   overlapping requirements, shared scope). If overlap is weak/empty, it
   challenges: "combine anyway / keep separate" — and records the decision.
3. **Trust confirmed sources.** Source specs are already code-grounded with
   evidence. The combiner INHERITS their `file:line` evidence — it does not
   re-derive the code. It only reconciles the specs against EACH OTHER.
4. **Resolve conflicts one at a time.** Every cross-source conflict, duplicate,
   and ordering dependency is raised as a 2–3 option challenge with ONE
   **recommended** option + a one-line reason. Wait, record, continue. Never
   batch. Keep asking until the combined context is clear (no open conflict).
5. **Two artifacts, spec derived from report.** `combined-report.md` (human,
   source of truth) and `combined-requirement-spec.md` DERIVED from it (schemas/).
6. **Never build on unresolved.** If a conflict is left unresolved, record it as
   an open question and refuse handoff to build until it is resolved.
7. Usage: report handoff + remind the user to run `/usage`. Never invoke it.

## Phase A — Load sources
Read every source `requirement-spec.md` (2+) the orchestrator hands you, plus
their reports. Confirm you have ≥2. Note each source's scope, mode, depth.

## Phase B — Verify relatedness
Compute overlap across sources:
- shared `files[]` between specs,
- overlapping/duplicate requirement statements,
- shared scope string.
If overlap is strong → proceed. If weak/empty → CHALLENGE (recommended-option):
"These share {N} files / no overlapping requirements — combine anyway
(recommended only if you're sure) or keep separate?" Record the verdict in the
report's Relatedness check. If the user chooses **keep separate**, STOP the run:
do NOT proceed to Phase C or write any `combined-*` artifact — return to the
orchestrator with `combined: false` (the analyses stay separate; the orchestrator
falls back to per-analysis stop/build).

## Phase C — Reconcile sources against each other
Detect and classify cross-source issues:
- **CONFLICT** — source A and source B require contradictory things on the same
  file/behavior.
- **DUPLICATE** — the same requirement appears in both → merge into one row,
  tracking `from: [A.Rx, B.Ry]`.
- **ORDERING** — one source depends on another's change existing first.
Anything ambiguous becomes a Phase D challenge.

## Phase D — Challenge (interactive, recommended options, one at a time)
For every CONFLICT / ambiguous DUPLICATE / ORDERING decision, ask a single
focused 2–3 option question with ONE **recommended** option + a one-line reason.
Wait, record, continue. Never batch. Keep going until nothing is unresolved.

## Phase E — Write combined artifacts
1. Write `combined-report.md` (schemas/combined-report.md) into
   `.claude/skills/orc/analyzer/combined-{name}/` (internal): Relatedness check,
   Merged requirements (deduped, ordered, evidence inherited), **Additional context
   (do not build)** merged from the sources (anchors re-pointed at the merged
   requirement, identical touchpoints deduped — non-actionable, omit if none),
   Cross-scope conflicts & decisions, Open questions, Handoff readiness.
2. Derive `combined-requirement-spec.md` (schemas/combined-requirement-spec.md)
   FROM the confirmed combined report, in the same internal folder. Reuse the
   base requirement-spec shape + `combined_from` and `cross_scope`.

## Phase F — Return & branch
Return to the orchestrator: `combined_report_path`, `combined_spec_path`,
`combined_from[]`, `conflicts_resolved[]`, `handoff_ready: bool` (open/unresolved
items are NOT a return field — they live in the report's Open questions section,
reachable via `combined_report_path`). The orchestrator then offers the user
(plain language):
- **Stop here** → COPY `combined-report.md` OUT to `{report_out_dir}/combined-{name}/`
  and stop.
- **Pass to orc build** → hand `combined-requirement-spec.md` back to the
  orchestrator, which continues at Phase 1 (Requirement Planner) and runs the
  full pipeline. The combiner NEVER builds directly.

**Gate the build option on `handoff_ready`:** if `handoff_ready` is false (an
unresolved conflict remains, per Hard rule 6), the orchestrator offers ONLY
**Stop here** — the build option is withheld until the open conflict is resolved.

## No mini variant
Full lane only. `orc-analyze-mini` / `orc-mini` do not use the combiner.
