---
description: Grade a finished artifact against a goal you state — then stop, so you fix it somewhere else
---

Use the **orc-challenge** skill. Standalone — no plan, no build, no code written.

Every other ORC lane produces something. This one grades a finished thing, writes
down what is wrong, and then **stops and makes you go and fix it in a different
session**. The stopping is the point:

> **ORC judges, you fix, ORC re-judges — and ORC never fixes what it judged.**

A session that just wrote the fix will grade its own homework, and it will always
pass. The separation is the measuring instrument.

**It never guesses what "good" means here.** Intake asks — in one round — what the
artifact must achieve, who reads it, what you would accept as finished, and what
template it follows. Those are frozen to disk, and every finding must name which
of them it serves. A finding that cannot is dropped, because a *defensible*
finding about the wrong thing is worse than an obviously wrong one.

One iteration:

1. **Lint** — `orc challenge lint` counts what a computer can count: missing
   sections, sentences over 25 words, undefined acronyms, idioms, `TBD`s,
   unresolved links. Deterministic, and it costs zero model tokens.
2. **Cold read** — an agent with `Read` and nothing else answers questions from
   the artifact alone. It is the only honest way to measure whether a reader with
   no context can follow it.
3. **Judge** — grades it against your frozen template and goal, and returns
   anchored findings, each with a consequence and an acceptance line ("fixed when
   §4.2 names the retry budget"). **It cannot declare a pass** — the CLI computes
   that from the findings.
4. **Advise** (only on a fail) — twelve findings are usually three causes. It
   groups them, orders them with the reason, and flags the ones that are really
   unmade decisions.
5. **Stop** — it writes a fix brief with a paste-ready prompt for a fresh session,
   and ends the turn.

Then you fix, in a new session, and run `/orc-challenge <slug>` again. Every
finding from last time gets exactly one outcome and a reason — nothing quietly
evaporates.

Two ways out of the loop, because a loop with no exit is a trap:
`orc challenge accept <slug> <id> "reason"` (a known gap: it stops blocking and
stays visible forever) and `orc challenge rebut <slug> <id> "reason"` (the judge
is wrong: the next one must answer you).

There is no iteration cap. Each turn is a separate human sitting down to work, so
it measures instead — `stalled` after three iterations with no progress, with
three honest options.

It never stages and never commits. Read the state back any time without this
lane: `orc challenge status <slug>`.

Kinds: `tsd` `prd` `adr` `api-contract` `readme` `runbook` `plan` `code` `mixed`.

The artifact to challenge, or a slug to reopen (or nothing, and it will ask): $ARGUMENTS
