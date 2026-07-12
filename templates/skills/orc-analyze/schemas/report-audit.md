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
"Code reality" cell carries quote-anchored file:line evidence
(`file:line — "verbatim snippet"`, never paraphrased; a ref with no quote
auto-downgrades to UNVERIFIED), OR the row is tagged ASSUMPTION/UNVERIFIED (and
appears below as an open question). A row whose code reality is a claim of
ABSENCE ("no retry exists") instead carries `searched:` — the concrete
globs/greps run. In deep mode EVERY row is verified, not just the load-bearing
ones.

| # | Claim (result + notes) | Code reality | Evidence (file:line + quote / searched:) | Files/modules | Status | Resolution |
|---|------------------------|--------------|------------------------------------------|---------------|--------|------------|
| 1 | PASS — "UUID validated" | present | auth/uuid.x:8 — "validateUuid(id)" | auth/uuid.x | verified | — |
| 2 | PASS — notes: "consider adding retry" | no retry | searched: `retry`, `backoff` in svc/ — no hits | svc/x | diverged | user: retry OUT of scope |
| 3 | FAIL — "missing UUID check" | field renamed to ref_id | models/user.x:20 — "ref_id:" | models/x | diverged | user: update premise; check ref_id |

Status: verified | diverged | resolved
- verified: claim matches code (with evidence), nothing to challenge.
- diverged: claim vs code mismatch → was challenged.
- resolved: a diverged row the user decided on (Resolution column holds the call).

## Assumptions & Open Questions
- UNVERIFIED (resolved): row 7 cited a "legacy flag" not found in code — user
  confirmed it was removed; row dropped.

## Additional context (do not build)
Anchored, non-actionable context pulled from an ADJACENT scope because an in-scope
row depends on it. Read for understanding; never a task. Each item names the
in-scope row it serves + why. Omit this whole section if none survived.
| Anchor (in-scope #) | From scope | Dependency | Touchpoint to respect | Evidence (file:line) |
|---------------------|-----------|------------|-----------------------|----------------------|
| Row 3 (ref_id check) | models (Y) | consumes-output | ref_id is set by the user loader before validation | models/user.x:20 |

## Alternatives & risks   (DEEP mode only — omit in standard)
- Row 3 fix: add ref_id check in the model (recommended) vs at the API edge —
  edge version duplicates validation across 3 handlers.

## Challenges raised & answers
- Row 2: notes suggested retry — user confirmed OUT of scope X.
- Row 3: audit says missing UUID check, code renamed field to ref_id — user
  confirmed implement the check against ref_id.

## Excluded scopes (recognized, not detailed)
- Recognized Y, Z in the source doc; excluded from this report per scope = X.

## Handoff readiness (checklist — all five or handoff_ready is false)
- [ ] all BLOCKING challenges resolved (every diverged row decided)
- [ ] zero open UNVERIFIED on any in-scope row
- [ ] every row has status + evidence-or-resolution
- [ ] spec derived AFTER the user confirmed this report
- [ ] scope_closed: true written into the spec
```
