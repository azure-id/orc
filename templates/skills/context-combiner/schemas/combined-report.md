# Template — Combined Analysis Report

Human-readable source of truth for a MERGE of 2+ related analyses. Written to
orc/analyzer/combined-{name}/combined-report.md. Copied OUT to
{report_out_dir}/combined-{name}/ on "stop here".

```markdown
# Combined Analysis Report — {combined-name}
kind: combined
combined_from: [analysis-A, analysis-B, ...]   # source analysis names
scope: <the shared scope X these analyses live in>
combined_at: DDMMYY HH:MM:SS
combined_against: <git HEAD short sha the evidence spot-check ran against>
model: opus-4.8-high

## Relatedness check
How the source analyses overlap — shared files, overlapping requirements,
shared scope. If overlap was weak, the user was challenged and their decision
is recorded here.
- Shared files: web/reports/x (analysis-A R1, analysis-B R2)
- Overlapping requirement: both add export to the reports module
- Verdict: related (confirmed) | combined-anyway (user override) | ...

## Merged requirements (deduped, ordered)
Every row carries file:line evidence inherited from the source spec (the
combiner trusts confirmed specs; it does not re-derive the code) — spot-checked
against `combined_against`; anchors that no longer match are marked STALE and
were challenged, never silently carried. SEMANTIC-DUPLICATE merges quote both
original statements. PARTIAL-OVERLAP rows are split (shared + residue), never
collapsed. `Depth` is shown when sources differ in depth.

| # | Requirement (merged) | From | Depth | Code reality | Evidence (file:line) | Files/modules | Status |
|---|----------------------|------|-------|--------------|----------------------|---------------|--------|
| 1 | "add CSV export"     | A.R1 | deep | HTML only    | web/reports/view.x:30 | web/reports/x | buildable |
| 2 | "reuse report auth"  | A.R2, B.R3 (dedup) | standard | guard present | web/reports/routes.x:12 (STALE — user chose proceed) | web/reports/x | exists |

## Source coverage matrix (conservation proof)
EVERY source requirement ID appears exactly once with exactly one Outcome.
`dropped` requires a recorded user decision in combine-decisions.md. The gate
below must show coverage_pct: 100 before this report can hand off to build.

| Source ID | Outcome | Merged as | Decision ref |
|-----------|---------|-----------|--------------|
| A.R1 | merged | #1 | — |
| A.R2 | deduped-into | #2 | — |
| B.R2 | conflict-resolved | #3 | combine-decisions.md #2 |
| B.R3 | deduped-into | #2 | — |
| B.R4 | dropped | — | combine-decisions.md #4 (user: superseded by A.R1) |

- source requirements total: {N} · accounted: {N} · coverage_pct: 100

## Additional context (do not build)
Anchored, non-actionable context merged from the sources — each item re-pointed at
the merged requirement it serves. Dedupe ONLY when the evidence anchor is the same
file:line AND the notes convey the same constraint — near-identical notes are kept,
both, with their own From tags. Read for understanding; never a task. Omit this
whole section if no source carried context.
| Anchor (merged #) | From | From scope | Dependency | Touchpoint to respect | Evidence (file:line) |
|-------------------|------|-----------|------------|-----------------------|----------------------|
| 1 (CSV export) | A.ctx | reporting (Y) | consumes-output | report query already paginates; export must page too | web/reports/query.x:44 |

## Cross-scope conflicts & decisions
Every conflict/duplicate/partial-overlap/ordering issue found across sources
(including contradictory resolved assumptions), each raised as a
recommended-option challenge and resolved. Decisions are also checkpointed
eagerly in combine-decisions.md.
- CONFLICT (resolved): A.R4 wants offset paging, B.R2 wants cursor — user chose cursor.
- DUPLICATE (merged): A.R2 and B.R3 both reuse auth — merged into #2.
- PARTIAL-OVERLAP (split): A.R5 subsumes B.R1 — shared row #4, A-only residue row #5.
- ORDERING (structured): before: #1 (A export) → after: #6 (B schedule).

## Open questions (block handoff until resolved)
- (none) | UNRESOLVED: ... — combiner refuses build handoff while any remain.

## Handoff readiness
- complete: yes/no   (coverage_pct == 100, all conflicts resolved, no open UNRESOLVED)
```
