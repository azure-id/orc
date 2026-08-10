# Reference — the boundary card

Loaded at B4. One file per area: `.claude/orc/boundary/<area-slug>.md`. The slug
is the area path with `/` → `-` (`src/payments` → `src-payments.md`), the same
sanitisation `wiki/crosslink/<kind>/` uses — a nested path a single-level readdir
never sees is a card that is invisible with the status check still green.

## Shape

```markdown
---
area: src/payments                  # verbatim — this is the identity
verdict: EXECUTE | ESCALATE | REFUSE
anchored_files:                     # what staleness is computed against
  - src/payments/ledger.ts
  - src/payments/idempotency.ts
verified_commit: 8a62b4f            # HEAD when the four questions were answered
scanned_at: 100826 14:11:30
reasons:                            # the four answers, compressed. Required.
  - "self-verify: no — no test runner in this package"
  - "reversible: no — writes to a live ledger"
checklist:                          # REQUIRED when verdict is REFUSE
  - add a test runner to this package
  - cover the idempotency path
escalate_to: "the payments owner"   # REQUIRED when verdict is ESCALATE
---

# src/payments — REFUSE

## Why
<the derivation, in prose. Two or three sentences.>

## What would make this a yes
<the checklist again, with the lane that clears each item named.>

## What an agent MAY do here today
<the part that is fine. A card that reads as "hands off entirely" when only one
 file is dangerous costs more than it saves.>
```

## Field rules

**`area`** — verbatim, never sanitised. The filename is sanitised; the identity is
not. Same split as a crosslink kind.

**`anchored_files`** — the files whose change should make this verdict
re-examined. Over-broad (`src/**`) makes every card permanently stale; empty makes
every card permanently fresh. Both defeat the point.

**`verified_commit`** — HEAD at the moment the four questions were answered. Moved
only by a real re-examination, never bumped to quiet a stale flag.

**`reasons`** — at least the answers that DROVE the verdict. This is what makes a
verdict arguable, and a verdict nobody can argue with is one people route around.

**`checklist`** — required on REFUSE, and each item must be a thing somebody could
actually finish. "Be more careful" is not a checklist item. Where another lane
clears it, name the lane (`→ /orc-pact`, `→ /orc-pattern`).

**`escalate_to`** — required on ESCALATE. A role is fine ("the payments owner"); a
shrug is not.

## The last section is not optional

**"What an agent MAY do here today"** is what stops a card from reading as a wall.
Most REFUSE areas contain plenty of safe work — tests, docs, a rename, a log line.
A card that does not say so gets ignored, and an ignored card is worse than none,
because it looks like coverage.

## Staleness

Computed on read by `orc boundary status`, never stored:
`git rev-list --count <verified_commit>..HEAD -- <anchored_files>`. Non-zero =
stale. **The skill never computes this** — same rule as the wiki tier
(`../../_shared/detecting-artifacts.md`).

A stale card is not a wrong card; it is one whose evidence has moved. Refresh is
cheap: re-run the four questions for that area only.
