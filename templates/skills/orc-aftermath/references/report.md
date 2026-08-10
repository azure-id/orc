# Reference — the aftermath report

Loaded at A3. The file is `orc-aftermath/<period>/aftermath.md` at the project
root. `<period>` is the window (`last-30d`) or a single run slug.

## Shape

```markdown
# Aftermath — last 30 days

3 runs graded · 1 HELD · 1 CHURN · 1 TOO_RECENT

Churn is a SIGNAL, not a verdict. A file changing again is a fact; why it changed
is not knowable from git. Nothing here says a change was bad.

## run-orc-store-credit-100826-093012 — CHURN (strength 2)

**What it promised** (from the plan's acceptance criteria)
- R1 a credit is never applied twice for one order
- R3 the refund window is read from config

**What the repo now shows**
| Signal | Evidence |
|---|---|
| 3 shipped files rewritten | `src/payments/ledger.ts` (2 commits), `src/payments/credit.ts`, `src/api/refunds.ts` — since 11-08-2026 |
| a promise is BROKEN | PACT-014 — `npm test -- idempotency` fails at HEAD |

**Not a verdict.** The strongest reading is that R1's proof no longer passes; the
weakest is that the area is simply under active development. Both are consistent
with the evidence above.

## run-orc-admin-export-050826-141130 — HELD

No churn signal in the window. That is not proof it worked — only that nothing
came back.

## run-mini-copy-tweak-090826-101010 — TOO_RECENT

2 days old. Too recent to grade; it keeps its slot so the count is honest.

---

<!-- orc-aftermath:retro
window_days: 30
runs: 3
held: 1
churn: 1
reverted: 0
too_recent: 1
shallow: 0
signals:
  - run: run-orc-store-credit-100826-093012
    lane: orc
    grade: CHURN
    strength: 2
    kinds: [churn, promise-broken]
-->
```

## The three sections per run, all required

**What it promised** — the plan's acceptance criteria, or the run's DoD lines, or
the invariants it was handed. If none can be found, say `no recorded promises — this
run cannot be graded against intent, only against churn`. Do not invent criteria to
fill the section.

**What the repo now shows** — one row per signal, each with real evidence: file
paths, commit dates, a pact id, the revert's own subject line. **A signal with no
evidence is not reported.**

**Not a verdict** — the strongest AND weakest honest reading, both stated. This
paragraph is what keeps the report usable in a room with the people who wrote the
code. Dropping it turns the table above into an accusation.

## `HELD` needs its caveat every time

> No churn signal in the window. That is not proof it worked — only that nothing
> came back.

Without that sentence HELD reads as verified, and this lane cannot verify anything.
A change nobody uses also produces no churn.

## The retro block

The `orc-aftermath:retro` comment is the machine half `/orc-retro` reads. Keep it
last, keep it flat, and keep the counts consistent with the prose above — the whole
value of the block is that a mining pass never has to parse the narrative.

## What never goes in

- A person's name, a git author, a blame line.
- The words "bad", "wrong", "failed to" about a change.
- A recommendation to revert. Reverting is a decision with context this lane does
  not have.
- Anything about a run younger than 7 days beyond `TOO_RECENT`.
