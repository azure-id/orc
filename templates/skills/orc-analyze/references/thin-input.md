# Reference — Thin input and the `/orc-grill` reverse trigger

Load at Phase A″ when the analyzable gate fails, or at Phase F when a returned
report is mostly tagged. Both are the SAME signal — the input was never sharp
enough to check against code — arriving at two different moments.

## Why a scan is the wrong instrument here

`/orc-analyze` answers *"does the repo really do that?"*. It cannot answer
*"what do I actually want?"*. Pointed at a fuzzy intent it still produces
questions — but it produces them after paying for a scan (deep mode adds scouts
at `max_scouts` in parallel), and it produces them as twenty tags in one batch
rather than as a conversation with a frontier.

The planner already refuses this shape rather than absorbing it
(`../../orc/subskills/orc-planner/SKILL.md`: *plannable ⇔ an observable outcome
AND an identifiable area*). This is the analyst's mirror of that rule.

## Branch 1 — the gate fails up front (Phase A″)

Print exactly this, then wait:

```
This is too thin to check against the code — I would spend the scan asking you
questions instead of reading files.

→ Switch to /orc-grill first (a conversation, no scan, no scout tokens).
  When it is sharp, it comes straight back here and I analyze it.
  [switch / analyze anyway]
```

- **`switch`** → run `../../orc-grill/SKILL.md`. Its exit 2 **auto-consumes back
  into THIS invocation**: the written `orc-grill/<slug>/grill-context.md` becomes
  the analyze input and Phase A restarts with it. The user retypes nothing and
  re-explains nothing. Say so in one line when handing over, so the round trip is
  visible rather than feeling like a lane change.
- **`analyze anyway`** → proceed exactly as today. The user's override stands and
  is not re-litigated later in the run; record it in the report's decisions so a
  later reader knows the tags were expected.

**It is an OFFER.** Never switch lanes without the answer, and never refuse to
analyze — this gate changes what is RECOMMENDED, never what is permitted.

## Branch 2 — the same signal arriving late (after the analyst returns)

A report can pass the up-front gate and still come back mostly unanchored. That
is this gate firing after the fact, and it deserves the same offer rather than a
twenty-question relay.

**Use numbers already in hand — add no probe.** `references/analyst-gates.md`
already recomputes coverage on return; compare the count of rows tagged
`ASSUMPTION`/`UNVERIFIED` against the total requirement rows. When the tagged
rows are the majority, offer:

```
The analysis came back mostly unverified — <k> of <n> requirements could not be
anchored to code. That is usually the intent still being open, not the repo
being unreadable.

→ /orc-grill to settle the intent (minutes, no scan), then re-analyze
   the sharpened version — cheaper than answering <k> questions here.
   [grill / answer the questions here]
```

`answer the questions here` runs the ordinary Phase D challenge relay. Nothing is
withheld either way.

## What this gate never does

- Never blocks. Both branches proceed on the user's word.
- Never re-scores an already-approved analysis, and never fires twice in one run
  for the same input — if the user chose "analyze anyway", branch 2 is skipped.
- Never invents its own idea of thin. The definition is the spine's sentence,
  stated once and registered as a contract token:
  **analyzable ⇔ the input names (a) a subject the repo could plausibly contain
  — a feature, a flow, a file, or a document — AND (b) at least one thing that
  should be true when the work is done.** Nothing here may widen it.
