# Template — Analyst Report (AUDIT mode)

Human-readable source of truth. You review and confirm this; the machine spec
is derived from it. Written to analyst_report/{analysis-name}/report.md.

```markdown
# Analysis Report — {analysis-name}
mode: audit
depth: standard | deep
source_doc: <path or "pasted">
scope: <X — the requested scope only>
analyzed_at: DDMMYY HH:MM:SS
model: opus-4.8-high
grounding: repo-read | repo-read+scouts   # scouts only in deep mode

## In-scope rows (X only)

Each row = one audit line that belongs to scope X, reconciled against code. Every
"Code reality" cell carries file:line evidence, OR the row is tagged
ASSUMPTION/UNVERIFIED (and appears below as an open question). In deep mode EVERY
row is verified, not just the load-bearing ones.

| # | Claim (result + notes) | Code reality | Evidence (file:line) | Files/modules | Status | Resolution |
|---|------------------------|--------------|----------------------|---------------|--------|------------|
| 1 | PASS — "UUID validated" | present | auth/uuid.x:8 | auth/uuid.x | verified | — |
| 2 | PASS — notes: "consider adding retry" | no retry | svc/order.x:55 | svc/x | diverged | user: retry OUT of scope |
| 3 | FAIL — "missing UUID check" | field renamed to ref_id | models/user.x:20 | models/x | diverged | user: update premise; check ref_id |

Status: verified | diverged | resolved
- verified: claim matches code (with evidence), nothing to challenge.
- diverged: claim vs code mismatch → was challenged.
- resolved: a diverged row the user decided on (Resolution column holds the call).

## Assumptions & Open Questions
- UNVERIFIED (resolved): row 7 cited a "legacy flag" not found in code — user
  confirmed it was removed; row dropped.

## Alternatives & risks   (DEEP mode only — omit in standard)
- Row 3 fix: add ref_id check in the model (recommended) vs at the API edge —
  edge version duplicates validation across 3 handlers.

## Challenges raised & answers
- Row 2: notes suggested retry — user confirmed OUT of scope X.
- Row 3: audit says missing UUID check, code renamed field to ref_id — user
  confirmed implement the check against ref_id.

## Excluded scopes (recognized, not detailed)
- Recognized Y, Z in the source doc; excluded from this report per scope = X.

## Handoff readiness
- complete: yes/no   (all diverged rows resolved?)
```
