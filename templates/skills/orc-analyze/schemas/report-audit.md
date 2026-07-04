# Template — Analyst Report (AUDIT mode)

Human-readable source of truth. You review and confirm this; the machine spec
is derived from it. Written to analyst_report/{analysis-name}/report.md.

```markdown
# Analysis Report — {analysis-name}
mode: audit
source_doc: <path or "pasted">
scope: <X — the requested scope only>
analyzed_at: DDMMYY HH:MM:SS
model: opus-4.8-high
grounding: repo-read            # or "from-system-analyst" when chained (usually repo-read here)

## In-scope rows (X only)

Each row = one audit line that belongs to scope X, reconciled against code.

| # | Claim (result + notes) | Code reality | Files/modules | Status | Resolution |
|---|------------------------|--------------|---------------|--------|------------|
| 1 | PASS — "UUID validated" | present in auth/uuid.x | auth/uuid.x | verified | — |
| 2 | PASS — notes: "consider adding retry" | no retry in svc/x | svc/x | diverged | user: retry OUT of scope |
| 3 | FAIL — "missing UUID check" | UUID field was renamed to ref_id | models/x | diverged | user: update audit premise; implement ref_id check |

Status: verified | diverged | resolved
- verified: claim matches code, nothing to challenge.
- diverged: claim vs code mismatch → was challenged.
- resolved: a diverged row the user decided on (Resolution column holds the call).

## Challenges raised & answers
- Row 2: notes suggested retry — user confirmed OUT of scope X.
- Row 3: audit says missing UUID check, code renamed field to ref_id — user
  confirmed implement the check against ref_id.

## Excluded scopes (recognized, not detailed)
- Recognized Y, Z in the source doc; excluded from this report per scope = X.

## Handoff readiness
- complete: yes/no   (all diverged rows resolved?)
```
