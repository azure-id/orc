# Mock example + drift recovery (canonical — v0.33.0)

The ONE canonical procedure for the post-implementation mocked example and the
`DRIFT-FROM` recovery handoff. Implementation lanes only (orc, orc-mini,
orc-fast, orc-ultra, orc-diy via its block) — never in read-only/doc lanes.
Lane spines keep the trigger + pointer; this file is the mechanism. Sibling of
`fallback-handoff.md` (same handoff-block pattern).

## The mock-example phase

**Gate:** config `mock_example` — `ask` (default) | `on` | `off`.
**Timing:** after the lane's verify/smoke gate is GREEN, **before ship** —
never earlier, never after a commit.

- `ask` → the offer is **MANDATORY** — never silently skipped, never silently
  run: "Build a runnable mocked example of what was just implemented
  (mock-examples/<change-slug>/, never committed)? [yes/no]".
- `on` → build without asking. `off` → skip silently.

**Deliverable — `mock-examples/<change-slug>/` at the PROJECT ROOT** (visible;
never in `.claude/`, never in the run folder):

- `EXAMPLE.md` — what it demonstrates, how to run it, the expected output —
  each claim anchored to the implemented files;
- ONE minimal runnable artifact (a script, an `example.http`, or an FE usage
  snippet). **Mocked inputs/stubs only — never real services, never prod
  data.**

**Who builds it: NOT you.** The example is DISPATCHED like any task (orc hard
rule 1 — the orchestrator never implements, not even the smallest task). It is
an orchestrator-SYNTHESIZED task, so it is scored from a DERIVED vector, never a
judged one — see `orc/references/wave-grouping.md` "Orchestrator-synthesized
tasks".

**Git: NEVER committed.** The ship phase explicitly excludes `mock-examples/`
from staging — and does NOT edit `.gitignore` (it's a new untracked folder;
simply never `git add` it). A ship that staged it is malformed.

## The drift question

After the user runs the example, ask exactly ONE question:

> matches expectation? **[yes / drift: \<describe\>]**

`yes` → proceed to ship. `drift:` → the recovery loop below.

## The `DRIFT-FROM` handoff block (written into the shared run folder)

```
DRIFT-FROM: <lane> mock-example
LOOP: <1 | 2>                      # recovery loops already spent
EXAMPLE: mock-examples/<change-slug>/
USER-DRIFT: <the user's description, verbatim>
INTENT-SPEC: <path to the run's original intent-spec>
```

## What carries over

| Carries over | The recovery round RE-DERIVES | On conflict |
|---|---|---|
| `USER-DRIFT` — the user's description, verbatim | The current worktree state (what the code actually does NOW) | The worktree wins |
| The failing expectation: what the example promised vs what it showed | The build + test result, run fresh | The fresh result wins |
| `INTENT-SPEC` (the run's original intent) + `LOOP` (loops already spent) | Every file claim in the superseded `EXAMPLE.md` | The worktree wins |

An inherited claim is a HINT with a known author, never evidence. The previous
`EXAMPLE.md` in particular documents the SUPERSEDED contract as fact — that is
exactly why step 5 deletes it. Re-anchor an inherited claim against the worktree
or drop it.

## The recovery loop (hard cap: 2)

1. **Gap analysis** — dispatch `orc-analyze-mini-sonnet-5-high` with the
   handoff block: scope BOUNDED to the drift (what the example shows vs what
   the intent-spec promised), never a re-analysis of the whole request.
2. **Patch plan** — dispatch the orc-mini planner
   (`orc-planner-mini-sonnet-5-high`) on the gap spec.

   Both steps use their `opus5_only` variants (`orc-analyze-mini-opus-5-med` /
   `orc-planner-mini-opus-5-med`) when that mode is on — see `opus5-only.md`.
3. **Scored dispatch** of the patch tasks (the lane's normal executor path).
4. **Re-verify** — the lane's verify/smoke gate again.
5. **Re-offer** — regenerate the example, then ask the drift question again.
   **DELETE or overwrite the previous `EXAMPLE.md` first.** After a patch the old
   example does not merely look dated — it documents the SUPERSEDED contract as
   fact (one asserted "case-insensitive substring matching" and cited a
   `String.includes()` call that had become `.startsWith()`). Leaving it in the
   tree re-seeds the exact drift this loop exists to remove, and re-showing it at
   the re-offer burns a capped loop on our own artifact.

**Cap hit (2 loops) → STOP with an honest unresolved report**: what still
drifts, what was tried, and the recommendation (usually a full `/orc` run on
the remaining gap). Never a silent third loop, never ship as "done".

## Trace

`PHASE mock-example start/end` frames the phase; each recovery loop emits
`DRIFT loop=<n> :: <user description, compressed>`. End-of-phase packet to the
trace writer like any phase.
