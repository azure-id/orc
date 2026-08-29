# Example — the full roster, and a premise challenge that moves the goal

> The annotated maintainer's walkthrough for the council. Every council gate that
> fires is called out. For the whole lane end to end, read
> `tsd-two-iterations.md` first.

The artifact is a PRD, not a TSD, and that matters: the suggestion ORC computes
for a PRD includes the two lenses that never block.

---

## C1 — intake, and question 7

```
> /orc-challenge docs/prd-self-serve.md
```

The first six questions are unchanged (`../../_shared/phases/intake.md`). Question 7 is
rendered from `orc challenge roles --kind prd --json` — **the skill never
hand-lists the lenses**:

```
7  Who is on the council for this review?  (judge always runs; advisor runs on a fail)

     ORC suggests, for a PRD:
       [x] cold reader     can a stranger answer this document's own questions?
       [x] outsider        what does this assume you already know?
       [x] principles      is this even the right problem?          (never blocks)
       [x] expansionist    what upside is being missed?             (never blocks)
       [ ] contrarian      assume it has a fatal flaw, then go find it
       [ ] executor        can this be started on Monday? where is the first step?

     Reply with the ones you want (or "all", or "none").
     Each one is one extra read-only Opus 5 dispatch per iteration.
```

The user replies: **`all`**.

> **GATE — rule 12.** Had the session tried to proceed without an answer,
> `orc challenge init` would have refused:
>
> ```
> ❌ --council is required and has no default. ORC SUGGESTS a roster (from the
>    kind and the goal); the user PICKS it. […] Suggested for --kind prd:
>    reader,outsider,principles,expansionist.
>    (a lane that picks its own council has broken this contract)
> ```

```bash
orc challenge init prd-self-serve \
  --artifact docs/prd-self-serve.md --kind prd \
  --goal "…" --audience "…" --done-means "…" \
  --template docs/templates/prd.md \
  --council all \
  --revision in-place
```

```
  council (v1): reader contrarian outsider executor principles expansionist  → 7 dispatch(es) per iteration
```

The cost is stated in **dispatches**, never in dollars — `/orc-budget`'s rule:
no dollar figure without a dated price table, and this ask has no plan to price.

---

## C3 — the council, in parallel, ≤ 3 in flight

Six lenses, three at a time, every one dispatched **BY NAME**. The cap is
announced when it bites:

```
  Council: 6 lenses on the roster, dispatched 3 at a time (hard cap, no config key).
     wave 1  reader · contrarian · outsider
     wave 2  executor · principles · expansionist
```

Each writes two files:

```
orc/orc-challenge/prd-self-serve/iteration-01/council/
    reader.md      reader.json          R-001 … R-003
    contrarian.md  contrarian.json      C-001 … C-006
    outsider.md    outsider.json        O-001 … O-003
    executor.md    executor.json        E-001 … E-002
    principles.md  principles.json      Q-001                  ← never reaches the judge
    expansionist.md expansionist.json   X-001 … X-002          ← never reaches the judge
```

The two non-finding reports are recorded separately:

```bash
orc challenge note prd-self-serve --iteration 1 --from /tmp/council-note.json
```

```
✓ recorded 1 premise and 2 opportunities at iteration 1.
  Neither blocks. A premise challenge is resolved by a HUMAN and by nobody else.
```

> **GATE — `class-mismatch`.** The first attempt put the opportunities in a
> `findings[]` key, and `note` refused by name:
>
> ```
> ❌ `orc challenge note` records OPPORTUNITIES and PREMISES only. The
>    expansionist and the first-principles thinker never touch the pass gate —
>    a findings[] key here is a class error, not a typo. Findings go through
>    `orc challenge record`.
> ```

---

## C4 — the judge, with a slice that grew by exactly four rows

```
goals:         orc/orc-challenge/prd-self-serve/goals.md          (frozen, v1)
artifact:      docs/prd-self-serve.md
template:      orc/orc-challenge/prd-self-serve/template.md       (frozen, v1)
dimensions:    <skill>/references/dimensions.md   (selected: D1 D2 D3 D4 D5 D7)
lint:          …/iteration-01/lint.json
reader:        …/iteration-01/council/reader.md
contrarian:    …/iteration-01/council/contrarian.md
outsider:      …/iteration-01/council/outsider.md
executor:      …/iteration-01/council/executor.md
carry_ids:     (none — first iteration)
```

Still paths and ids only. **`principles.md` and `expansionist.md` are NOT
there**, and that is the architecture, not an oversight.

---

## C5 — record, and the gate that makes five reviewers safe

The judge's first return disposed of thirteen of the fourteen council ids.

> **GATE — `council-coverage`.**
>
> ```
> ❌ malformed verdict — council coverage is below 100% — every id the council
>    raised needs exactly ONE disposition (adopted | merged | rejected |
>    out-of-goal). Missing: O-003
> ```
>
> `orc challenge record` read `iteration-01/council/*.json` **itself**. The judge
> could not shrink the set by omitting `O-003`, because the set was never the
> judge's to report.

Re-recorded:

```
  iteration 1: FAIL — 5 blocking findings, coverage 100%
  reader        RAN      raised 3 · adopted 2 · merged 1 · rejected 0 · out-of-goal 0
  contrarian    RAN      raised 6 · adopted 4 · merged 1 · rejected 1 · out-of-goal 0
  outsider      RAN      raised 3 · adopted 1 · merged 2 · rejected 0 · out-of-goal 0
  executor      RAN      raised 2 · adopted 2 · merged 0 · rejected 0 · out-of-goal 0
  CHALLENGE iter=1 findings=P0:1/P1:4/P2:6 coverage=100% council=6/6 raised=R:3,C:6,O:3,E:2 adopted=9 verdict=FAIL
```

Three things to notice:

- **`C-002` is `C-002` in the verdict.** An adopted council finding keeps the
  raiser's id, forever — which is what lets the panel say *"the contrarian raised
  four of the six blockers"*.
- **`O-001` was adopted and is marked `also found by: reader`.** The outsider and
  the cold reader landed on the same undefined term from opposite directions.
  That is `corroborated_by` — **a signal, never an automatic severity bump.**
- **The two `O-` ids that were `merged`** name a real `merged_into`. `record`
  refuses a merge into an id that does not resolve.

---

## C8 — the stop, and the block that goes FIRST

The fix brief leads with the premise challenge, because it disputes the yardstick
every finding under it was measured against:

```
OPEN PREMISE CHALLENGE — read this before the findings

  Q-001  disputes: goal
         "…a PRD that lets the growth team ship self-serve signup…"

         Reframe: the underlying job is not "describe self-serve signup"; it is
         "decide whether signup is self-serve at all". Three sections of this
         document answer the second question and are written as if the first
         were settled.

         Cheapest test: ask the growth lead whether the decision is made. One
         message, no rewrite.

  Neither resolution is automatic and ORC never picks:
      adopt    orc challenge goals prd-self-serve --set <path> --reason "…"
      dismiss  orc challenge premise prd-self-serve Q-001 --dismiss --reason "…"
```

Then the findings, grouped by the advisor's root causes. Then, last and clearly
marked **not work**:

```
OPPORTUNITIES — not work, nothing here blocks

  X-001  the onboarding checklist generalises to every plan tier
         first step: list the four tiers' current checklists side by side
         route: /orc-brainstorm

  X-002  §6 is the enablement doc the support team has been asking for
         first step: send §6 to support and ask if it is enough on its own
         route: /orc-pact  (they would want it committed to)
```

---

## Session 2 — the user adopts the premise, and the yardstick moves

```bash
orc challenge goals prd-self-serve --set docs/goals-v2.md \
  --reason "Q-001 was right — the decision was never taken"
```

`goals.version` → 2, iteration 1 keeps `graded_against_goal: 1`, and the
iteration rail draws the version break. **That mechanism has existed since
v0.47.0; the council is the first thing that can legitimately move it.**

The user also narrows the roster, because the premise has been answered and the
document is now a technical one:

```bash
orc challenge council prd-self-serve --set contrarian,executor \
  --reason "the framing question is settled; what is left is completeness"
```

```
✓ council v2: contrarian executor  — the framing question is settled; what is left is completeness
```

> **This is safe, and here is why.** `C-002`, `O-001` and `R-003` are still open
> and the outsider and the reader are no longer on the roster. **The judge
> resolves every carried finding, whatever prefix it carries** (rule 13) — rule
> 11 already had it re-reading the artifact from disk rather than from an account
> of what changed, so it never needed the original raiser. The roster is freely
> variable at zero cost to conservation.

---

## Session 3 — a lens that could not run

A usage limit hit mid-batch. The orchestrator records the truth:

```json
{ "lens": "executor", "ran": false, "reason": "usage limit reached mid-batch" }
```

```
  iteration 3: FAIL — 2 blocking findings, coverage 100%
  contrarian    RAN      raised 2 · adopted 1 · merged 0 · rejected 1 · out-of-goal 0
  executor      NOT-RUN  usage limit reached mid-batch
  CHALLENGE iter=3 findings=P0:0/P1:2/P2:3 coverage=100% council=1/2 raised=C:2 adopted=1 verdict=FAIL
```

> **GATE — `lens-silent`.** Omitting the executor entirely instead of declaring
> it would have been rejected:
>
> ```
> ❌ malformed verdict — executor is on the roster but returned neither a report
>    (iteration-03/council/executor.json) nor an explicit
>    { "lens": "executor", "ran": false, "reason": "…" }. A selected role is
>    never silently absent.
> ```

`council=1/2` in the trace line means the gap is visible to `orc stats` and to
`/orc-retro`, not only in the panel — which is how a user eventually finds out
whether a lens is earning its dispatch.
