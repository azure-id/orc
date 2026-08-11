# Mock run — `/orc-plan`

> Turns a request (or an analyst spec) into a real task plan. It plans only —
> it never builds.

---

## 1. What it does

A plan here is not a to-do list. Every task carries:

- the **files it will touch**, each checked against the real repo,
- **what it depends on**, so waves can be worked out later,
- **facets** — the properties the score is computed from,
- and a **test disposition**: does this task need a failing test first, or not,
  and why not.

The planner also says how confident it is. Low confidence is an answer, and it
changes what ORC recommends next.

---

## 2. The run

```
> /orc-plan add a sent_to_bank state for refunds, shown to customers
  and to support
```

```
Grounding: I checked every path I am about to claim.
  api/refunds/webhook.ts        exists
  api/refunds/state.ts          exists
  web/refunds/RefundRow.tsx     exists
  web/admin/RefundList.tsx      exists
  db/migrations/                exists
  api/refunds/notify.ts         DOES NOT EXIST → this task creates it (new)

5 tasks · 2 waves · plan_confidence: medium

| # | Task | Files | depends_on | facets | test |
|---|---|---|---|---|---|
| T1 | add sent_to_bank to the state enum + migration | 2 | — | breadth 2 · new-surface · stateful | new-surface → red proof first |
| T2 | webhook writes the new state | 1 | T1 | breadth 1 · imitate · branching | behavior-change → red proof first |
| T3 | customer refund row shows it | 1 | T1 | breadth 1 · imitate | covered-by-existing → web/refunds/RefundRow.test.tsx:44 |
| T4 | admin list shows it | 1 | T1 | breadth 1 · imitate | covered-by-existing → web/admin/RefundList.test.tsx:87 |
| T5 | the two label strings | 1 | — | breadth 1 · mechanical | no-behavior → no test |

TDD tasks emitted: 2 (T1a, T2a). They are ordinary tasks — same conflict
graph, same waves — and T1/T2 depend on them, so each proof runs before its
code. Skipped: 2 covered-by-existing (both cited above and both found on
disk), 1 no-behavior.

Carried, not built (constraints from your grill session)
  · refund state is only ever written by the webhook handler
  · no backfill of existing refund rows

Open questions (2)
  Q1  Does the customer email change too, or only the screen?
  Q2  Is `sent_to_bank` allowed to go back to `requested`?

> Q1 screen only for now.  Q2 no, one direction only.

plan_confidence: high (both questions answered)
```

```
What next?

  1  Take it into build   → /orc scores it and runs the whole pipeline
  2  Save & stop          → keeps the plan, builds nothing
  3  Drop it

> 2

Saved: .claude/skills/orc/planner/refund-visibility/  (+ plan-refund-visibility.md at the root)

Want a lane recommendation for building this?  [yes / no]

> yes

→ /orc-mini     5 tasks, 2 waves, top score 57, no risk flags.
                Full review and verification are not what this plan needs.
   runner-up    /orc  — safer, roughly 3x the tokens
   not possible /orc-fast — this plan is 5 tasks; that lane runs ONE
```

---

## 3. What to notice

- **A path that does not exist is caught here**, before any agent is told to
  edit it. `api/refunds/notify.ts` is marked `new` on purpose, not by accident.
- **Tests are scoped to what can actually fail.** A label string gets no test.
  But a skip is never silent: `covered-by-existing` must name a test file that
  really exists, and ORC checks that it does.
- **A task with a risk flag can never be scoped out of testing**, whatever its
  facets say.
- **Only "Save & stop" offers the lane recommendation.** If you take it into
  build, the lane is already chosen and running.

---

## 4. Related

- Route the saved plan: [`/orc-route`](orc-route.md)
- Build it: [`/orc`](orc.md)
- Ground it in a document first: [`/orc-analyze`](../templates/skills/orc-analyze/examples/analyze-mock.md)
