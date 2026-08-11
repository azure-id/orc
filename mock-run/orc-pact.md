# Mock run — `/orc-pact`

> The promises your system makes, and which ones are in doubt right now.

---

## 1. What it does

When you use `/orc-grill` or `/orc-brainstorm`, you settle some decisions.
Some of those are **constraints** — rules the system must always follow.

Today those rules die when the run ends. Nobody checks them again. Six weeks
later someone breaks one, and nobody notices.

`/orc-pact` keeps them. It calls each one an **invariant** — a promise.

Each promise has four possible states. ORC works out the state itself. It never
saves the state to disk, because a saved state gets old and lies to you.

| State | Meaning in easy English |
|---|---|
| **HOLDING** | The check passed. Nothing changed since. This promise is fine. |
| **DRIFTED** | Someone changed a file this promise depends on. We owe it a re-check. |
| **UNCHECKABLE** | There is no cheap way to test this. **We are being honest, not lazy.** |
| **BROKEN** | We ran the check. It failed. This promise is not true any more. |

`UNCHECKABLE` is the most important one. Other tools would just say "OK". ORC
says "I cannot prove this", and shows you the list.

---

## 2. The run

Rina ran `/orc-grill` last week about checkout. Now she runs `/orc-pact` for
the first time.

```
> /orc-pact
```

```
ORC · pact

Preflight (silent probes)
  ledger            : none yet — this will be the first one
  git               : clean, 47 commits since the grill run
  test runner       : vitest  (npm test)
  runs with constraints found : 2

I found 2 past runs that settled constraints and never saved them.

  run-grill-checkout-100826-141130      4 constraints
  run-brainstorm-refunds-220726-093015  2 constraints

Do you want me to harvest them into a new ledger?

  1  Yes, harvest both runs        (recommended)
  2  Harvest only the grill run
  3  No, I want to add promises by hand instead
```

```
> 1
```

```
ORC · pact · harvest

Reading the 6 constraints. For each one I look for the cheapest thing that
can prove it. I do not run anything yet.

  PACT-001  A payment is never written twice for one idempotency key.
            anchors : api/payments/ledger.ts:88, api/payments/idempotency.ts
            check   : test  → npm test -- idempotency
            found because: test file api/payments/__tests__/idempotency.test.ts exists

  PACT-002  Every price is stored as a whole number of cents. Never a decimal.
            anchors : api/payments/money.ts:12, db/migrations/0004_prices.sql
            check   : grep → no `float` or `numeric` in price columns
            found because: migration 0004 declares price_cents INTEGER

  PACT-003  A guest can finish checkout with no account.
            anchors : web/checkout/GuestFlow.tsx, api/checkout/session.ts:31
            check   : test  → npm test -- guest-checkout
            found because: test file exists

  PACT-004  A refund is only allowed inside 30 days of the order.
            anchors : api/refunds/window.ts:19
            check   : test  → npm test -- refund-window
            found because: test file exists

  PACT-005  A full card number is never written to any log.
            anchors : api/payments/*.ts, api/middleware/logger.ts
            check   : NONE FOUND
            → I will mark this UNCHECKABLE. See the question below.

  PACT-006  Refund money always goes back to the original payment method.
            anchors : api/refunds/payout.ts:44
            check   : NONE FOUND
            → I will mark this UNCHECKABLE. See the question below.

Two promises have no check. I have one question about each.
I will not guess an answer for you.
```

```
ORC · pact · round 1  (2 questions)

Q1 — PACT-005 (card number in logs)
     A grep for a 16-digit pattern in the logger would be cheap and would
     catch the common mistake. It would not catch a card number that was
     split into parts first.
     Do you want that grep as the check?

       a  Yes, use the grep. Better than nothing.
       b  No. Keep it UNCHECKABLE until we write a real test.
       c  Something else (tell me)

Q2 — PACT-006 (refund goes to the original method)
     I found no test and no cheap signal. The only honest options:

       a  Keep it UNCHECKABLE and add a note: "check by hand at release"
       b  Drop this promise — it was never really agreed
       c  Something else (tell me)
```

```
> Q1 a. Q2 a, and add the note "Finance checks this in the monthly report".
```

```
ORC · pact · re-check

Running the checks now. Only the ones that can run.

  PACT-001  npm test -- idempotency        ✓ pass      → HOLDING
  PACT-002  grep price columns             ✓ pass      → HOLDING
  PACT-003  npm test -- guest-checkout     ✓ pass      → HOLDING
  PACT-004  npm test -- refund-window      ✗ FAIL      → BROKEN
  PACT-005  grep 16-digit in logger        ✓ pass      → HOLDING
  PACT-006  (manual)                       — not run   → UNCHECKABLE

One promise is BROKEN.

  PACT-004  A refund is only allowed inside 30 days of the order.
            check : npm test -- refund-window
            error : expected 30, received 45
            file  : api/refunds/window.ts:19   → REFUND_WINDOW_DAYS = 45
            commit: 8a62b4f  "allow longer refunds for the Nov sale"  (12 days ago)

I do not know if this is a bug or a decision. Only you know.
I will not retire this promise by myself.

  1  It is a bug. Keep the promise. Fix the code later.
  2  It changed on purpose. Update the promise to 45 days.
  3  Retire the promise. It does not apply any more.
```

```
> 2, but only for the sale. It goes back to 30 days on 01-12-2026.
```

```
ORC · pact · write

Updated PACT-004:
  statement : A refund is only allowed inside 45 days of the order.
              Temporary for the November sale.
  review_by : 01-12-2026
  reason    : changed on purpose at commit 8a62b4f, confirmed by user

Wrote:
  PACT.md                          (project root — you can read this)
  .claude/orc/pact/ledger.json     (the machine copy)

  4 holding · 0 broken · 2 uncheckable · 1 review due 01-12-2026

Trace: run-pact-first-ledger-100826-153020.txt

Next time, run `orc pact status` any time. It is free and takes no tokens.
```

---

## 3. The files it made

### `PACT.md` — at the project root, safe to commit, a PM can read it

````markdown
# PACT — what shopcart promises

Last checked: 10-08-2026 at commit `c273793`
State: **4 holding · 0 broken · 2 uncheckable · 1 review due**

This file is written by `/orc-pact`. Do not edit it by hand.
Run `orc pact status` to see the live state.

---

## Holding — we checked, and these are true

### PACT-001 · A payment is never written twice for one idempotency key
- **Why it exists:** settled in `/orc-grill` on 10-08-2026 (checkout)
- **Where it lives:** `api/payments/ledger.ts:88`, `api/payments/idempotency.ts`
- **How we prove it:** `npm test -- idempotency`
- **Last proved at:** commit `c273793`

### PACT-002 · Every price is a whole number of cents
- **Why it exists:** settled in `/orc-grill` on 10-08-2026 (checkout)
- **Where it lives:** `api/payments/money.ts:12`, `db/migrations/0004_prices.sql`
- **How we prove it:** grep — no float or numeric type on a price column
- **Last proved at:** commit `c273793`

### PACT-003 · A guest can finish checkout with no account
- **Why it exists:** settled in `/orc-grill` on 10-08-2026 (checkout)
- **Where it lives:** `web/checkout/GuestFlow.tsx`, `api/checkout/session.ts:31`
- **How we prove it:** `npm test -- guest-checkout`
- **Last proved at:** commit `c273793`

### PACT-005 · A full card number is never written to any log
- **Why it exists:** settled in `/orc-grill` on 10-08-2026 (checkout)
- **Where it lives:** `api/payments/*.ts`, `api/middleware/logger.ts`
- **How we prove it:** grep — no 16-digit run reaches the logger
- **Weak check:** this grep does not catch a card number split into parts
- **Last proved at:** commit `c273793`

---

## Under review — changed on purpose, with an end date

### PACT-004 · A refund is only allowed inside 45 days of the order
- **Was:** 30 days, until 29-07-2026
- **Changed:** commit `8a62b4f` — "allow longer refunds for the Nov sale"
- **Confirmed by:** user, on 10-08-2026
- **Review by:** 01-12-2026 — goes back to 30 days
- **How we prove it:** `npm test -- refund-window`

---

## Uncheckable — we cannot prove these cheaply

**These are not broken. We simply have no cheap way to test them.**
This list is the honest part of the file. Read it before you trust the rest.

### PACT-006 · Refund money always goes back to the original payment method
- **Why it exists:** settled in `/orc-brainstorm` on 22-07-2026 (refunds)
- **Where it lives:** `api/refunds/payout.ts:44`
- **How we prove it:** by hand. Finance checks this in the monthly report.
- **To make this checkable:** write a test that mocks two payment methods and
  asserts the payout target matches the original charge.
````

### `.claude/orc/pact/ledger.json` — the machine copy

```json
{
  "version": 1,
  "generated_at": "2026-08-10T15:30:20Z",
  "generated_commit": "c273793",
  "entries": [
    {
      "id": "PACT-004",
      "statement": "A refund is only allowed inside 45 days of the order. Temporary for the November sale.",
      "origin": { "lane": "orc-grill", "run": "run-grill-checkout-100826-141130", "kind": "constraint" },
      "anchors": ["api/refunds/window.ts:19"],
      "check": { "kind": "test", "ref": "npm test -- refund-window" },
      "verified_commit": "c273793",
      "confidence": "high",
      "review_by": "2026-12-01",
      "history": [
        { "at": "2026-08-10", "was": "30 days", "now": "45 days", "commit": "8a62b4f", "reason": "November sale, confirmed by user" }
      ]
    }
  ]
}
```

---

## 4. The CLI part

```
$ orc pact status
```

```
PACT · shopcart

  HOLDING      4    api/payments · api/checkout · web/checkout
  DRIFTED      0
  BROKEN       0
  UNCHECKABLE  2    api/refunds/payout.ts

  1 review due  PACT-004 by 01-12-2026

  ledger anchored at c273793 · you are at c273793 · nothing to re-check
```

Exit code: `0`

**The exit codes** — same idea as `orc pattern status`:

| Code | Meaning |
|---|---|
| 0 | Every promise is HOLDING |
| 1 | At least one DRIFTED — a re-check is owed |
| 2 | At least one BROKEN |
| 3 | No ledger on disk |

Now a week goes by. Rina edits `api/refunds/window.ts`.

```
$ orc pact status
```

```
PACT · shopcart

  HOLDING      3
  DRIFTED      1    PACT-004  → api/refunds/window.ts changed at e9dad01
  BROKEN       0
  UNCHECKABLE  2

  Run `orc pact check PACT-004` to re-prove it. Takes ~4 seconds.
```

Exit code: `1`

**Note what did NOT happen.** The other 3 promises did not go stale. Only the
one whose file changed. This is the same rule the wiki uses
(`computeWikiFreshness`) — **a promise is only old if the files it depends on
moved.** A date alone never makes it old.

```
$ orc pact status --json
```

```json
{
  "ledger_present": true,
  "generated_commit": "c273793",
  "head_commit": "e9dad01",
  "counts": { "holding": 3, "drifted": 1, "broken": 0, "uncheckable": 2 },
  "drifted": [
    { "id": "PACT-004", "touched_by": ["e9dad01"], "anchor": "api/refunds/window.ts" }
  ],
  "reviews_due": [
    { "id": "PACT-004", "by": "2026-12-01" }
  ],
  "exit": 1
}
```

---

## 5. Inside a normal `/orc` run

**Phase 1 — preflight.** One new line. It is never silent.

```
Preflight
  wiki      : FRESH   (12 docs, anchored e9dad01)
  pattern   : typescript cached
  crosslink : none configured
  pact      : 3 holding · 1 drifted · 2 uncheckable      ← new
```

**Phase 2 — planning.** This is the payoff.

```
Planning · shopcart · "add partial refunds"

  The plan touches api/refunds/window.ts and api/refunds/payout.ts.
  Two promises point at those files. I am giving them to the planner as
  hard constraints:

    PACT-004  refund window is 45 days (temporary, review 01-12-2026)
    PACT-006  refund goes back to the original payment method  [UNCHECKABLE]

  PACT-006 has no test. The planner will add one to the plan, because the
  new code touches the same file.
```

A decision Rina made in July now shapes a plan in August. **Nobody had to
remember it.**

**Phase 6 — verify.** Re-check only what the change touched.

```
Verify
  build              ✓
  tests              ✓  142 passed
  pact re-check      ✓  PACT-004 HOLDING · PACT-006 now has a test → HOLDING
                        uncheckable count 2 → 1
```

---

## 6. Why this is good for ORC

**It turns two lanes that were dead ends into a supply chain.**
`/orc-grill` and `/orc-brainstorm` already make `spec_invariants[]`. Today
that array is used once and thrown away. With `/orc-pact` the output of a
thinking lane becomes the input of every future build lane. ORC starts to
compound.

**It is a moat.** No other skill can build this. To have an invariant ledger
you first need a lane that produces invariants and tags them. ORC shipped that
in v0.42.0 for a different reason. Nobody else has it.

**It gives the PM something to read.** `PACT.md` is twelve sentences in plain
English about what the system promises. Budi can read it in a pull request.
Today there is nothing in ORC that a non-developer can open and understand.

**It makes `UNCHECKABLE` a product.** Every other tool in this space hides what
it cannot prove. ORC prints the list. That single behaviour is a real reason to
choose ORC over a generator skill.

**Cost is close to zero after the first run.** `orc pact status` is pure CLI —
no model, no tokens. The model is only needed when you harvest new promises or
when something breaks and a human must decide.
