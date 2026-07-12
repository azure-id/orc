# Template — Analyst Report (PROSE mode)

Human-readable source of truth. Written to analyst_report/{analysis-name}/report.md.

```markdown
# Analysis Report — {analysis-name}
mode: prose
depth: standard | deep
source_doc: <path or "pasted">
scope: <X — the requested scope only>
analyzed_at: DDMMYY HH:MM:SS
model: opus-4.8-high
grounding: repo-read | repo-read+scouts   # scouts only in deep mode

## In-scope requirements (X only)

Every "Code reality" cell carries quote-anchored file:line evidence
(`file:line — "verbatim snippet"`, never paraphrased; a ref with no quote
auto-downgrades to UNVERIFIED), OR the row is tagged ASSUMPTION/UNVERIFIED (and
appears below as an open question). Absence claims (status missing) instead
carry `searched:` — the concrete globs/greps run.

| # | Requirement (from doc) | Code reality | Evidence (file:line + quote / searched:) | Files/modules | Status | Resolution |
|---|------------------------|--------------|------------------------------------------|---------------|--------|------------|
| 1 | "notifications must paginate" | list is unbounded | searched: `paginate`, `cursor`, `limit` in api/notifications — no hits | api/notifications/x | missing | implement pagination |
| 2 | "respect existing auth" | auth middleware present | auth/mw.x:10 — "app.use(requireAuth)" | auth/mw.x | exists | reuse, no change |

Status: exists | missing | conflict | resolved

## Assumptions & Open Questions
Anything not grounded to code, plus every ambiguity — each was raised as a
recommended-option challenge and resolved (or is still open).
- ASSUMPTION (resolved): "paginate" = cursor-based (recommended) — user confirmed.
- UNVERIFIED (open): whether a rate-limit already exists — evidence not found.

## Additional context (do not build)
Anchored, non-actionable context pulled from an ADJACENT scope because an in-scope
requirement depends on it. Read for understanding; never a task. Each item names
the in-scope requirement it serves + why. Omit this whole section if none survived.
| Anchor (in-scope #) | From scope | Dependency | Touchpoint to respect | Evidence (file:line) |
|---------------------|-----------|------------|-----------------------|----------------------|
| Req 1 (pagination) | listing (Y) | guards-invariant | shared list serializer caps a page at 100 | api/serializers/list.x:31 |

## Alternatives & risks   (DEEP mode only — omit in standard)
- Approach A (recommended): reuse existing cursor helper — low blast radius, 3 files.
- Approach B: new offset paginator — simpler read, breaks existing cursor clients.
- Risk: pagination touches the shared list serializer (dependents: 4 call sites).

## Challenges raised & answers
- Req 3 appeared to require an admin panel (belongs to scope Z) — user confirmed
  OUT of scope X.

## Excluded scopes (recognized, not detailed)
- Recognized Y, Z; excluded per scope = X.

## Handoff readiness (checklist — all five or handoff_ready is false)
- [ ] all BLOCKING challenges resolved
- [ ] zero open UNVERIFIED on any in-scope requirement
- [ ] every requirement has status + evidence-or-resolution
- [ ] spec derived AFTER the user confirmed this report
- [ ] scope_closed: true written into the spec
```
