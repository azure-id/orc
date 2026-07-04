# Schema — Intent Spec (Phase 0 output)

Written to `run/{run-slug}/intent-spec.md` after the tiered intake questions.
Restates the user's intent in the orchestrator's words; shown for sign-off
(gate or soft; default gate). The planner consumes it; two later phases read
slices of it.

```markdown
# Intent Spec — {run-id}
approved: false          # flips true on sign-off; gate mode blocks planning until true
signoff_mode: gate       # gate | soft

## Scope in
- <what should exist when done that doesn't now>

## Scope out            # explicit non-goals — the top waste-preventer
- <e.g. no push notifications, no admin tooling>

## Definition of done   # → becomes Phase 6 verify's acceptance criteria, verbatim
- <observable, checkable statements: "bell shows unread count">

## Constraints          # → hard rules injected into EVERY worker slice
- <patterns to follow, libraries not to add, files/services not to touch>

## Integration surface  # → feeds the conflict graph / blast-radius awareness
- <existing modules/APIs/tables this touches and must not break>

## Open / expected changes   # pre-empted escalations
- <anything the user flagged as uncertain or likely to change>
```

Rules:
- Only fields the tier asked about are required; leave others as "not gathered
  (low-tier intake)" rather than inventing content.
- `Definition of done` items must be observable/checkable — if it can't be
  verified in Phase 6, rewrite it until it can.
- On fresh-session resume, the one-line reconfirm quotes `Scope in`.
