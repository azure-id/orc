# Mock run — `/orc-grill`

> You have one idea, but it is still vague. This lane asks you questions until
> the idea is sharp — and it never answers its own question.

---

## 1. What it does

You start with one fuzzy sentence. ORC builds a tree of open questions, then
asks you **every question that is ready** in the same round. A question that
depends on another question waits its turn.

The split that matters:

| Kind of thing | Who finds it |
|---|---|
| **Facts** — "where are refunds written?", "do we have a queue?" | **ORC**. It looks it up: wiki, code pattern, gotchas, then a read-only look at the code as a last step. |
| **Decisions** — "should this be instant or nightly?" | **You**. ORC waits. |

It writes no code, makes no plan, and creates no run folder.

---

## 2. The run

```
> /orc-grill I want refunds to feel faster
```

```
Preflight (silent): wiki AGING · pattern express cached · 3 gotchas on refunds

Round 1 — 3 questions

❓ Q1 — What is slow: the money, or the screen?
   The refund API answers in 180ms (I checked: api/refunds/create.ts). The
   money itself takes 3–5 days at the bank. Those need different fixes.
   ➡️  I would guess you mean the screen still says "pending" for days.

❓ Q2 — Who is complaining — customers, or support?
   ➡️  Support, if this came from a ticket.

❓ Q3 — Is a refund allowed to fail after we said "done"?
   ➡️  Recommend: no. Once we say done, we own it.

> Q1 yes the screen. Q2 both actually. Q3 no, agreed.
```

```
Round 2 — 2 questions (these were waiting on Q1)

❓ Q4 — Where does "done" come from today?
   fact: I found it. The bank webhook writes refunds.status — 
   api/refunds/webhook.ts:52. Nothing writes it before that.
   So today the screen cannot say anything else. This is a real gap.

❓ Q5 — Do you want a new middle state, or a better message?
   a) new state `sent_to_bank`, shown as "on its way, 3–5 days"
   b) same states, better wording on the pending screen
   c) your own answer
   ➡️  (a). (b) is cheaper but you will ask for (a) in a month.

> a. and support should see the same state in the admin list.
```

```
Round 3 — 1 question

❓ Q6 — Old refunds already in `pending` — what happens to them?
   ➡️  Recommend: leave them. A backfill on money records needs a reason.

> leave them, agreed
```

```
The frontier is empty. Let me play it back.

  You want a new refund state between "requested" and "done": sent_to_bank.
  The customer screen and the support list both show it. Nothing changes at
  the bank. Old refunds are not touched.

  intent      customers and support see a truthful middle state
  constraint  refund state is only ever written by the webhook handler
  constraint  no backfill of existing refund rows

Does that match what you meant?

> yes
```

```
The idea is sharp now. What next?

  1  Stop here — save it        → orc-grill/refund-visibility/grill-context.md
  2  Continue into /orc-analyze → check it against the real code
  3  Drop it                    → nothing is written

> 1

Written: orc-grill/refund-visibility/grill-context.md
```

---

## 3. What it wrote

```markdown
# Grill — refund visibility

## The idea, in one paragraph
A refund gets a new state, `sent_to_bank` …

## Settled decisions
| # | Decision | Tag |
|---|---|---|
| 1 | New state between requested and done | intent |
| 2 | Only the webhook handler writes refund state | constraint |
| 3 | No backfill of existing rows | constraint |

## Still open (with the right tool named)
| Question | Where it belongs |
|---|---|
| Does the copy read well to a customer? | ORC's mock_example phase |

## Facts ORC looked up (not asked)
| Fact | Where |
|---|---|
| Only the webhook writes refunds.status | api/refunds/webhook.ts:52 |
```

---

## 4. What to notice

- **Constraints become promises.** The two `constraint` rows are exactly what
  [`/orc-pact`](orc-pact.md) harvests later, and what a plan carries as
  `spec_invariants[]`. That is what makes the conversation load-bearing.
- **There is no question limit.** Some ideas settle in three questions, some
  need fifty. You stop it by saying "stop asking, just save it".
- **"I do not know the options" is a different lane.** If a round comes back
  that way, ORC offers [`/orc-brainstorm`](orc-brainstorm.md), and comes back
  here afterwards with what you picked.
- **Only your "yes" ends it.** An empty question list does not.

---

## 5. Related

- No idea yet at all? [`/orc-brainstorm`](orc-brainstorm.md)
- Check the idea against real code: [`/orc-analyze`](../templates/skills/orc-analyze/examples/analyze-mock.md)
