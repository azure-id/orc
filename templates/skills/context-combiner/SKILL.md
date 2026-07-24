---
name: context-combiner
description: >
  Combines 2+ RELATED, already-confirmed ORC analyses (from orc-analyze) into
  ONE merged, deduped, conflict-resolved requirement context before build. Use
  when the user analyzed multiple related documents within the same scope and
  chose "pass to context-combiner" at orc-analyze's Phase F. Verifies the source
  analyses actually overlap (shared files/requirements/scope) and challenges the
  user if they look unrelated; pools ALL source requirements into one table and
  reconciles them (exact/semantic duplicates, partial overlaps split — never
  collapsed, conflicts, ordering) one issue at a time; proves NOTHING WAS LOST
  via a source coverage matrix and a 100% coverage gate before handoff;
  spot-checks inherited evidence and marks stale anchors; writes
  combined-report.md + combined-requirement-spec.md (the merged spec reuses the
  requirement-spec schema, so the planner/build pipeline is unchanged). Full
  lane only (Opus 5 high). The orchestrator DISPATCHES this to a subagent —
  it never combines itself, and the combiner never builds or spawns subagents.
---

# CONTEXT-COMBINER

The orchestrator stays on top and **dispatches a Context Combiner subagent
(orc-context-combiner-opus-5-high)** with a list of 2+ confirmed analysis
spec paths. It never combines itself. The combiner merges related, ALREADY
code-grounded analyses — it does not re-analyze the repo from scratch.

Purpose: turn 2+ related, confirmed requirement-specs (same user scope) into ONE
merged, deduped, conflict-resolved requirement set a planner can build from as if
it were a single analysis — with PROOF that no source requirement was lost.

## Hard rules

1. **Dispatched, not self-run.** The orchestrator coordinates; the Combiner
   subagent (Opus 5 high) reads the specs and reconciles them against each
   other. The combiner NEVER builds and NEVER spawns subagents.
2. **Related only — verify + challenge.** The user asserted relatedness at the
   Phase F gate, but the combiner MUST verify real overlap (shared files,
   overlapping requirements, shared scope). If overlap is weak/empty, it
   challenges: "combine anyway / keep separate" — and records the decision.
3. **Trust confirmed sources — but spot-check freshness.** Source specs are
   already code-grounded with evidence. The combiner INHERITS their `file:line`
   evidence — it does not re-derive the code. It only reconciles the specs
   against EACH OTHER, plus ONE bounded freshness pass: for each inherited
   anchor, confirm the file still exists and the line still plausibly matches
   (Read just that region — never a re-analysis). A failed check marks the row's
   evidence `STALE` — never silently carried. STALE evidence on a buildable
   requirement becomes a Phase D challenge (re-anchor / proceed anyway / drop).
   Record the repo state checked against as `combined_against` (git HEAD short
   sha) in both artifacts.
4. **Resolve conflicts one at a time.** Every cross-source conflict, duplicate,
   and ordering dependency is raised as a 2–3 option challenge with ONE
   **recommended** option + a one-line reason. Wait, record, continue. Never
   batch. Keep asking until the combined context is clear (no open conflict).
5. **Conservation — nothing is lost, and you must prove it.** Every source
   requirement ID gets EXACTLY ONE outcome in the Source coverage matrix
   (merged / deduped-into / split-across / conflict-resolved / dropped).
   `dropped` is legal ONLY with a recorded user decision from a Phase D
   challenge. **When in doubt, keep both rows** — a redundant requirement costs
   the planner a dedupe; a lost one costs the build a feature. The conservation
   gate (Phase E) blocks artifact handoff until `coverage_pct` is 100.
6. **Two artifacts, spec derived from report.** `combined-report.md` (human,
   source of truth) and `combined-requirement-spec.md` DERIVED from it (schemas/).
7. **Never build on unresolved.** If a conflict is left unresolved, record it as
   an open question and refuse handoff to build until it is resolved.
8. **Checkpoint decisions eagerly.** Every challenge verdict is appended to
   `combine-decisions.md` in the internal folder THE MOMENT it is given
   (question, options, choice, timestamp). On resume/compaction, replay that
   file and continue from the first unanswered item — never re-ask a recorded
   decision, never lose one.
9. Usage: report handoff + remind the user to run `/usage`. Never invoke it.

## Phase A — Load sources
Read every source `requirement-spec.md` (2+) the orchestrator hands you, plus
their reports. Confirm you have ≥2. Note each source's scope, mode, depth.
Record `combined_against` = current git HEAD short sha.
**Scale guard:** if sources > 4, warn that merge quality and token cost degrade
and offer staged combining (combine the two most related first, then fold in
the next against the combined result). Record the choice in
`combine-decisions.md`.

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

## Phase C — Pool, then reconcile

**C.0 — Pool first, never pairwise.** Normalize ALL source requirements into ONE
pooled table (`source_id` e.g. A.R1, statement, files, evidence, depth of its
source). Then cluster pooled rows by shared files/behavior and detect issues
WITHIN clusters. This scales to N sources — pairwise comparison misses
three-way interactions and is forbidden.

**C.1 — Classify every cluster:**
- **EXACT-DUPLICATE** — same requirement, same wording → merge into one row,
  tracking `from: [A.Rx, B.Ry]`.
- **SEMANTIC-DUPLICATE** — same effect, different wording → merge, but QUOTE
  both original statements in the report so intent nuance isn't erased. If the
  equivalence is not obvious, it's a Phase D challenge, not a silent merge.
- **PARTIAL-OVERLAP** — one requirement subsumes or intersects another →
  **SPLIT into a shared row + residue row(s)**; never collapse. Residue rows
  keep their own `from[]` and evidence. Ambiguous splits are Phase D challenges.
- **CONFLICT** — source A and source B require contradictory things on the same
  file/behavior.
- **ORDERING** — one source depends on another's change existing first. Record
  as structured pairs (`before` / `after` merged IDs), not free text.

**C.2 — Reconcile beyond requirements.** Cross-check `assumptions_resolved` and
`alternatives` across sources too: contradictory resolved assumptions are a
CONFLICT (Phase D); alternatives anchored to a merged/split requirement are
re-pointed at the merged ID.

**C.3 — Evidence freshness spot-check** (per Hard rule 3): verify each inherited
anchor still exists; mark failures `STALE`.

Anything ambiguous becomes a Phase D challenge.

## Phase D — Challenge (interactive, recommended options, one at a time)
For every CONFLICT / ambiguous DUPLICATE or PARTIAL-OVERLAP split / ORDERING
decision / STALE-evidence-on-buildable / proposed drop, ask a single focused
2–3 option question with ONE **recommended** option + a one-line reason. Wait,
record, continue. Never batch. Append every verdict to `combine-decisions.md`
immediately (Hard rule 8). Keep going until nothing is unresolved.

## Phase E — Conservation gate (before any artifact is written)
Build the **Source coverage matrix**: one row per source requirement ID with
exactly one Outcome — `merged → #N` / `deduped-into → #N` / `split-across →
#N,#M` / `conflict-resolved → #N` / `dropped (user decision ref)`. Then check:
- every source ID appears exactly once (no unaccounted IDs, no double-counting),
- the union of `from[]` across merged rows equals the non-dropped source set,
- every `dropped` row cites a recorded decision in `combine-decisions.md`.
`coverage_pct` = accounted source IDs / total source IDs × 100. If it is not
100 → fix the merge (or raise the missing challenge), do NOT proceed.
`handoff_ready` = (`coverage_pct` == 100) AND (no open conflict).

## Phase F — Write combined artifacts
1. Write `combined-report.md` (schemas/combined-report.md) into
   `.claude/skills/orc/analyzer/combined-{name}/` (internal): Relatedness check,
   Merged requirements (deduped, ordered, evidence inherited, STALE flagged,
   `depth_from` when sources differ in depth), **Source coverage matrix**
   (Phase E), **Additional context (do not build)** merged from the sources
   (anchors re-pointed at the merged requirement; dedupe ONLY when the evidence
   anchor is the same `file:line` AND the notes convey the same constraint —
   otherwise keep both; non-actionable, omit if none), Cross-scope conflicts &
   decisions, Open questions, Handoff readiness.
2. Derive `combined-requirement-spec.md` (schemas/combined-requirement-spec.md)
   FROM the confirmed combined report, in the same internal folder. Reuse the
   base requirement-spec shape + `combined_from`, `cross_scope`, and the
   `coverage` block.

## Phase G — Return & branch
Return to the orchestrator: `combined_report_path`, `combined_spec_path`,
`combined_from[]`, `conflicts_resolved[]`, `coverage_pct`, `dropped[]`
(source IDs dropped by user decision), `stale_evidence[]` (rows flagged STALE),
`handoff_ready: bool` (open/unresolved items are NOT a return field — they live
in the report's Open questions section, reachable via `combined_report_path`).
The orchestrator then offers the user (plain language):
- **Stop here** → COPY `combined-report.md` OUT to `{report_out_dir}/combined-{name}/`
  and stop.
- **Pass to orc build** → hand `combined-requirement-spec.md` back to the
  orchestrator, which continues at Phase 1 (Requirement Planner) and runs the
  full pipeline. The combiner NEVER builds directly.

**Gate the build option on `handoff_ready`:** if `handoff_ready` is false (an
unresolved conflict remains per Hard rule 7, or `coverage_pct` < 100 per Hard
rule 5), the orchestrator offers ONLY **Stop here** — the build option is
withheld until the open conflict is resolved and coverage is complete.

## No mini variant
Full lane only. `orc-analyze-mini` / `orc-mini` do not use the combiner.
