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
combiner trusts confirmed specs; it does not re-derive the code).

| # | Requirement (merged) | From | Code reality | Evidence (file:line) | Files/modules | Status |
|---|----------------------|------|--------------|----------------------|---------------|--------|
| 1 | "add CSV export"     | A.R1 | HTML only    | web/reports/view.x:30 | web/reports/x | buildable |
| 2 | "reuse report auth"  | A.R2, B.R3 (dedup) | guard present | web/reports/routes.x:12 | web/reports/x | exists |

## Cross-scope conflicts & decisions
Every conflict/duplicate/ordering issue found across sources, each raised as a
recommended-option challenge and resolved.
- CONFLICT (resolved): A.R4 wants offset paging, B.R2 wants cursor — user chose cursor.
- DUPLICATE (merged): A.R2 and B.R3 both reuse auth — merged into #2.
- ORDERING: B depends on A's export path existing — sequence A before B.

## Open questions (block handoff until resolved)
- (none) | UNRESOLVED: ... — combiner refuses build handoff while any remain.

## Handoff readiness
- complete: yes/no   (all conflicts resolved, no open UNRESOLVED)
```
