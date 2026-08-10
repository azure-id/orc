---
description: The invariant ledger — the promises your project makes, and which ones are in doubt right now
---

Use the **orc-pact** skill. Standalone — no scan, no plan, no build, no code
written.

`/orc-grill` and `/orc-brainstorm` already settle constraints, and a plan already
carries them into every executor slice. Then the run ends and they evaporate. This
is the ledger that outlives the run.

Four states, and every one is **computed on read**, never stored:

- **HOLDING** — its check passed at a commit that still covers the files it anchors.
- **DRIFTED** — commits since then touched those files. Coverage-relative: a promise
  about payments does not fall into doubt because the README changed.
- **UNCHECKABLE** — nothing cheap proves it. **This is the honest state and the
  point of the lane**, and it never counts as a failure.
- **BROKEN** — the check ran and failed.

How it runs:

1. **Harvest** — pull constraints out of a run's `spec_invariants[]`, a grill doc, a
   brainstorm doc, or a frozen poly-repo contract. Each one arrives quoted verbatim
   with an origin recorded. **It never invents a promise.**
2. **Recheck** — `orc pact check` runs the cheap proofs for the drifted ones only,
   and re-anchors what passes. No model judges what a test can answer.
3. **Reconcile** — one promise at a time. ORC brings the facts (which commits
   touched it, what the check returned, whether this already went wrong before);
   **you** decide whether the promise still stands. It recommends, then waits.
4. **Write** — the ledger, plus a committed, PM-readable `PACT.md` at the project
   root, rendered by the CLI from the ledger so the two can never disagree.

**It never retires a promise on its own.** Retirement is your decision and records
your reason, and a retired promise stays visible struck through.

Inside `/orc` (`pact_gate`, default `warn`): one preflight line, and — the payoff —
a drifted promise whose files a plan is about to touch is injected into the planner
as a constraint. Last month's decision constrains this month's plan, automatically.
It never blocks a run.

Read it back any time without this lane: `orc pact status`.

What you want to do (harvest / review / add — or nothing, and it will ask): $ARGUMENTS
