# Template — Analyst Report (PROSE mode)

Human-readable source of truth. Written to analyst_report/{analysis-name}/report.md.

```markdown
# Analysis Report — {analysis-name}
mode: prose
source_doc: <path or "pasted">
scope: <X — the requested scope only>
analyzed_at: DDMMYY HH:MM:SS
model: opus-4.8-high
grounding: repo-read

## In-scope requirements (X only)

| # | Requirement (from doc) | Code reality | Files/modules | Status | Resolution |
|---|------------------------|--------------|---------------|--------|------------|
| 1 | "notifications must paginate" | list is unbounded | api/notifications/x | missing | implement pagination |
| 2 | "respect existing auth" | auth middleware present | auth/mw.x | exists | reuse, no change |

Status: exists | missing | conflict | resolved

## Challenges raised & answers
- Req 3 appeared to require an admin panel (belongs to scope Z) — user confirmed
  OUT of scope X.

## Excluded scopes (recognized, not detailed)
- Recognized Y, Z; excluded per scope = X.

## Handoff readiness
- complete: yes/no
```
