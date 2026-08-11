# Mock run — `/orc-ultra`

> The same pipeline as `/orc`, plus an advisor at the start and three judges
> along the way. It costs the most. Use it when a mistake is expensive.

---

## 1. What it does

`/orc-ultra` adds four things to a normal `/orc` run:

| Extra | When | What it is for |
|---|---|---|
| **Advisor** | before the analyst | Writes a brief: real risks, other ways to do it, a **security section**, and a **rubric** — the list of things a correct answer must get right here |
| **Judge (analysis)** | after the analyst | Scores the analysis against that rubric |
| **Judge (plan)** | after the planner | Same, for the plan |
| **Judge (implementation)** | after verify | Did we build what was asked, at the quality asked |

It also forces on: deep analysis, code patterns, test authoring, the security
pass, and a floor on executor models. You do not configure any of that — the
lane sets it for this run only and never writes it to your settings.

---

## 2. The run

Rina is changing how refunds are calculated. Money code.

```
> /orc-ultra rewrite the refund amount calculation to support partial refunds
```

### Phase U0 — Advisor (runs once, before anything else)

```
Dispatching orc-advisor-opus-5-xhigh …
returned as: claude-opus-5 / xhigh          ✓

ADVISORY BRIEF — partial refunds

Risks in this domain
  · Rounding. A cent lost per refund is a real bug, not a rounding style.
  · Double refunds. Retry + no idempotency key = money out twice.
  · Currency. api/payments/ stores minor units; web/ formats major units.

Security section (always written)
  · The refund endpoint must re-check ownership. Today it checks the session
    only — api/refunds/create.ts:31.

RUBRIC — what a correct answer must get right here
  R1  amounts are integers in minor units end to end
  R2  a partial refund can never exceed the remaining refundable amount
  R3  the operation is idempotent per refund request id
  R4  every branch has a test with a real number in it

OPEN QUESTIONS  (answer together, one round)
  Q1  Can one order have several partial refunds?      default: yes
  Q2  Rounding on a split refund — who gets the cent?  default: the last refund

> Q1 yes.  Q2 the customer gets the cent, not us.
```

### Then the normal pipeline, with gates

```
Analyst (deep, 3 scouts) → done
  Judge (gate=analysis): APPROVE with 1 note
    R2 is not evidenced anywhere in the analysis. Cited section added.

Planner → 6 tasks
  Judge (gate=plan): REVISE
    "T3 changes the refund total but has no test task. R4 fails."
    → planner re-ran once → TDD task added → APPROVE

Build → review → verify → PASSED
  Judge (gate=implementation): APPROVE
    R1 ✓ minor units, checked at refunds/calc.ts:18 and web/format.ts:9
    R2 ✓ test "cannot refund more than remaining" — a real number, 1250
    R3 ✓ idempotency key on the request row
    R4 ✓ 9 new tests, all with numbers
```

---

## 3. What to notice

- **The judge can send work back, but only twice.** A REVISE loop is capped at
  2 rounds. After that it must APPROVE, ESCALATE to you, or stop. It can never
  argue with itself forever.
- **A judge never fixes anything.** It reads and it votes. The author fixes.
- **A judge never re-opens an earlier gate.** The plan judge does not re-argue
  the analysis.
- **The rubric came before the work.** That is the trick — the standard is
  written by someone who has not seen the answer yet.
- **`ultra_mode` is not a setting.** It exists only inside this command. `/orc`
  and `/orc-mini` never turn it on.

---

## 4. Related

- The normal pipeline: [`/orc`](orc.md)
- What it will cost first: [`/orc-budget`](orc-budget.md)
