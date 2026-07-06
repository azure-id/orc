# Template — Analyst Report (REQUIREMENT mode — no document)

Used when there is NO source document: the user's plain-language request IS the
requirement, reconciled against the existing code. Human-readable source of
truth. Written to analyst_report/{analysis-name}/report.md.

```markdown
# Analysis Report — {analysis-name}
mode: requirement
depth: standard | deep
source: "pasted request"        # the user's own words, verbatim
scope: <X — the requested scope only>
analyzed_at: DDMMYY HH:MM:SS
model: opus-4.8-high
grounding: repo-read | repo-read+scouts   # scouts only in deep mode

## Restated requirement (analyst's words)
One or two sentences restating the request — restating is what surfaces
misreadings. If the restatement rests on any assumption, tag it and ask.

## In-scope requirement parts (X only)

Each part of the request, reconciled against code. Every "Code reality" cell
carries file:line evidence, OR the part is tagged ASSUMPTION/UNVERIFIED (and
appears below as an open question). In deep mode EVERY part is verified.

| # | Requirement part (from request) | Code reality | Evidence (file:line) | Files/modules | Status | Resolution |
|---|---------------------------------|--------------|----------------------|---------------|--------|------------|
| 1 | "add CSV export to reports" | reports render HTML only | web/reports/view.x:30 | web/reports/x | missing | new export path |
| 2 | "reuse current auth" | auth guard on report routes | web/reports/routes.x:12 | web/reports/x | exists | reuse, no change |

Status: buildable | exists | conflict | resolved
- buildable: not present, but consistent with the code — safe to build.
- exists: already implemented — flag so the planner doesn't duplicate.
- conflict: request contradicts existing behavior → challenged.
- resolved: a challenged part the user decided on.

## Assumptions & Open Questions
Every ambiguity in the request + anything not grounded to code. Each raised as a
recommended-option challenge and resolved (or still open).
- ASSUMPTION (resolved): "export" = download file (recommended) vs email — user
  confirmed download.
- UNVERIFIED (open): whether a reports permission gate exists — evidence not found.

## Alternatives & risks   (DEEP mode only — omit in standard)
- Approach A (recommended): stream CSV from the existing query — low blast radius.
- Approach B: precompute + cache — faster reads, adds a cache dependency.
- Risk: export reuses the report query (dependents: 2 schedulers).

## Challenges raised & answers
- Part 3 ("admin-only export") looked like scope Z (admin) — user confirmed OUT.

## Excluded scopes (recognized, not detailed)
- Recognized Y, Z implied by the request; excluded per scope = X.

## Handoff readiness
- complete: yes/no   (all challenges resolved, no open UNVERIFIED blocking scope?)
```
