# Mock run — `/orc-brainstorm`

> For when you do not have the idea yet. It makes the options. **You** pick.

---

## 1. What it does

`/orc-grill` sharpens one idea you already have. `/orc-brainstorm` is for the
step before that: you have a problem, a goal, or a hunch, and no candidates.

It works in two halves:

- **Diverge** — it generates a lot of ideas on purpose, using named thinking
  lenses, and says **nothing bad about any of them yet**. An objection said too
  early kills the three ideas that would have come after it.
- **Converge** — judgment comes back on. Every idea is stress-tested, then ORC
  recommends one and **waits**.

It does not have to be about code. A product name, an onboarding flow, or a
support-queue problem are all fine.

---

## 2. The run

```
> /orc-brainstorm our refund support tickets keep growing and I don't know why
```

### B1 — Frame

```
Before I generate anything, let me pin the problem.

  Problem     refund tickets are growing
  Better      fewer tickets per 100 refunds, not faster replies
  Fixed       we cannot change the bank's 3–5 day settlement
  Free        anything in web/, api/, and the emails we send

Is that the problem, or did I frame it wrong?

> right, but also: support says most tickets are "where is my money"
```

### B2 — Diverge (no criticism here, on purpose)

```
Lens 1 — Inversion: how would we make this WORSE?
  1  Say "refunded" the moment the button is pressed, then go silent
  2  Send no email at all
  3  Hide refund status behind a login wall

  (Flipping each of those gives us:)
  4  Tell the truth about the 3–5 days, in the moment of the refund
  5  Send one email when the bank confirms
  6  A public refund status link, no login

Lens 2 — Analogy: what does a parcel company do?
  7  A tracking page with 3 fixed steps and a date range
  8  A "still on time" message that appears BEFORE anyone worries
  9  One number to look up on the front page

Lens 3 — This repo's own history:
  10 We already built order tracking (wiki/orc-feature-orders.md). Reuse it
     for refunds instead of building a second thing.
  11 gotcha #7: we tried customer-facing ETAs once and support hated them
     because the ETA was wrong. Any ETA must be a range, not a date.

Lens 4 — Constraint flip: what if support could not answer tickets at all?
  12 The refund email answers the question before it is asked
  13 A canned reply that is one click and always correct

That is 13 candidates across 4 lenses. More? Or shall I cluster?
  · anything of your own to add — say it and it goes in the pool as #14

> add: let support see the bank reference number. cluster after that.

  14 (yours) support sees the bank reference number
```

### B3 — Cluster

```
4 directions. Every one of the 14 candidates is in exactly one of them, or
in the graveyard with a reason.

| Direction | The bet | Must be true | Costs | Kills |
|---|---|---|---|---|
| A Tell the truth early | People ask because we implied it was instant | Customers accept 3–5 days if told up front | Small: copy + one state | The word "instant" in marketing |
| B Tracking page | People want to look, not to ask | They will visit a link | Medium: reuse order tracking (#10) | A second status system |
| C Arm support | Tickets are fine, answering is slow | Support is the bottleneck, not the customer | Small | Nothing |
| D Do nothing visible, fix the email | One good email removes the question | The email is opened | Smallest | — |

Graveyard
  #3  hide behind login — makes the problem worse, kept only as an inversion
  #9  front-page lookup — no. YAGNI for our volume.
```

### B4 — Stress (judgment back on)

```
A · pre-mortem: "it failed because we told people 3–5 days and the bank took 9."
    worst  a truthful message that is still wrong
    best   ticket volume drops without any new screen
    repo   gotcha #7 applies. Use a range, never a date.

B · pre-mortem: "we built a page nobody visited."
    worst  a second status system to maintain
    best   support links it and stops typing the same reply
    repo   order tracking already exists — this is cheaper than it looks

C · pre-mortem: "support got faster at answering a question we caused."
    worst  we optimise the symptom
    best   immediate relief this week

D · pre-mortem: "the email went to spam."
```

### B5 — Converge (ORC recommends, then stops)

```
Recommendation: A first, then B.

Why: A is the cheapest thing that attacks the cause, and B is nearly free
because #10 lets us reuse order tracking. C treats the symptom — but it is
one afternoon, so do it alongside if support is drowning now.

  1  A
  2  A then B          ← my recommendation
  3  B only
  4  C only
  5  something else, or combine — say it in your own words

> 2, but the range must come from real data not a guess

  constraint  any customer-facing refund ETA is a RANGE from measured
              settlement times, never a fixed date
  intent      tell the customer the truth at the moment of refund
  intent      reuse the order tracking components for refunds
```

### B6 — Exit

```
Ready to write the session doc?  It saves the pick AND every direction that
lost, with the reason.

  1  Write it     → orc/brainstorming-session/refund-tickets/brainstorm-session.md
  2  Carry into /orc-grill to sharpen direction A
  3  Drop it

> 1
```

---

## 3. What to notice

- **ORC never picks.** It recommends, then waits. A lane that picks its own
  favourite has broken this lane's contract.
- **Every menu ends with your own slot**, and it is always last. What you type
  goes into the pool word for word and gets stress-tested like the rest.
- **Nothing evaporates.** Every candidate lands in a direction or in the
  graveyard **with a reason**. The most valuable part of the saved doc is *why
  the others lost*.
- **It stops before writing anything.** "Complete" is a proposal, never a
  verdict.
- **The repo's own history is a lens.** `gotcha #7` is the kind of thing no
  generic brainstorm can give you.

---

## 4. Related

- Sharpen the direction you picked: [`/orc-grill`](orc-grill.md)
- Turn constraints into lasting promises: [`/orc-pact`](orc-pact.md)
