# How the judge scores — and why it cannot pass anything

## Severity

Reuses ORC's existing reviewer ladder, so nobody has to learn a second one.

| | Meaning in this lane |
|---|---|
| **P0** | The artifact actively **misleads**. A reader who follows it will build the wrong thing. |
| **P1** | The artifact is **incomplete or undecidable** at a load-bearing point. |
| **P2** | Advisory — real, worth fixing, not a blocker. |
| **P3** | Nit. |

Severity is about the CONSEQUENCE to the stated audience, never about how much
text is wrong. One missing number in an interface is a P0. Four paragraphs of
clumsy phrasing in a document nobody reads cold is a P3.

## PASS

> **PASS is computed, never declared.**

`PASS` = zero open findings at or above `challenge_pass_severity` (default `p1`),
**after** accepted exceptions are subtracted, **and** every selected dimension
reported a result.

`orc challenge record` computes it. The judge cannot: it reports findings, and
that is all. This is not ceremony — it removes leniency as a possibility. A judge
that can pass something can be talked into passing something.
A judge that **can only find, or fail to find** cannot.

The second half is structural too: `record` REJECTS an iteration in which a
selected dimension reported nothing, so "every dimension reported" is guaranteed
before the severity question is even asked.

## What a finding must carry

```
id · dimension · severity · anchor(file:line) · quote · what_is_wrong ·
consequence · acceptance_line · serves
```

- **`consequence`** — what a reader BUILDS wrong because of this. A finding with
  no consequence is a preference.
- **`acceptance_line`** — what "fixed" looks like, concretely. It is what stops
  the fixer guessing, and it is what gives the next judge an objective re-check
  instead of a fresh opinion.
- **`serves`** — which goal element the finding advances (`goal`, `audience`,
  `done_means`, or a named `out_of_scope` entry). **A finding with no `serves` is
  out of scope and is DROPPED by the CLI.**

## Zero findings is a legitimate outcome

Do not invent findings to look thorough. Do not soften one to be kind — you are
not the one who decides whether the artifact passes, so there is nothing to be
kind about.

## The two escape valves

A loop with no exit is a trap.

- **`orc challenge accept <slug> <id> "reason"`** — the user accepts a blocking
  finding as a known gap. It stops blocking immediately, it stays visible forever
  in the report under **Accepted exceptions** with the reason. *Never automatic*
  — the `/orc-pact` retirement rule.
- **`orc challenge rebut <slug> <id> "reason"`** — the user thinks the judge is
  wrong. The next judge must address it explicitly and return `withdrawn` (with
  an admission) or `upheld` (with NEW evidence, not a restatement). **A rebutted
  finding the next verdict ignores makes the iteration malformed and it is
  rejected.** Without this, one bad finding loops forever and the user's only
  move is to give up.

## Convergence, not a cap

There is no loop cap and there is no config key for one. Every other loop in ORC
(TDD 3, drift recovery 2, quick repair 3) runs inside one session and costs
tokens per turn. Here each turn is a separate human sitting down to work, and a
cap that refuses on iteration 6 would be refusing to review a hard document.

So: measure instead.

```
convergence: 9 → 4 → 4 → 4 blocking findings over 4 iterations
             ⚠ stalled — no net reduction in 3 iterations.

Three honest options:
  1  Narrow the rubric          orc challenge init … --dimensions D1,D2,D6
  2  Accept them as known gaps  orc challenge accept tsd-payments F-003 "…"
  3  Keep going                 /orc-challenge tsd-payments
```

It prints once when `stalled` flips true, and again only if the count RISES.
Never a block, never a nag repeated every iteration.

## Severity is about the consequence, never about who raised it

A council lens does not get a severity discount for being clever or a bump for
being enthusiastic. The ladder is unchanged and it asks one question: **what
happens to the STATED audience if this ships as written?**

`corroborated_by` — two lenses independently landing on the same defect — is the
strongest comprehension evidence this lane can produce, and it is **a signal,
never an automatic severity bump.** (The `/orc-aftermath` rule: churn is a
signal, not a verdict.) The judge may raise a severity because the corroboration
told it something about the consequence; it may never raise one because two
agents agreed.

And the contrarian's rule against manufacturing findings is the same rule
everybody else here lives under: **never invent a finding to look thorough, and
never soften one to look balanced.** Balance is the judge's job.
