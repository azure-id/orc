# Shared contract — the WAIT (`/orc-wait`, and the computed gate)

Canonical file: `_shared/wait.md`. THE canonical mechanic for a lane that must
**stop where it stands, wait for wall-clock time to pass, and carry on from the
same place**. Load it wherever a lane can be interrupted by a wait — which,
since v1.1.0, is every lane in the table below.

## Why a wait is not a suspend and not a fallback

ORC already has two shapes for leaving a run. This is a third, and conflating
them loses work.

| | `FALLBACK-FROM` | `RETURN-TO` | **WAIT** |
|---|---|---|---|
| Why it leaves | it cannot proceed | another lane must settle something | **wall-clock time must pass** |
| Who finishes | the receiver | the sender, after coming back | **the same lane, same run** |
| Another lane runs | yes | yes | **no — nothing runs** |
| Traces | one | two | **one** |

A wait dispatches nothing and decides nothing. It is the only ORC mechanic
whose entire purpose is that **no model is running**.

## The one rule

> **`a lane that waits without a hand-back` has broken this contract.**

A wait is a stop. Every stop in ORC writes its hand-back before it ends, because
the thing that resumes the run may not be this session — the user can close the
terminal, the machine can sleep, and the wake-up message is a Claude Code
behaviour ORC cannot promise. `RESUME.md` on disk is what makes a lost wake-up
cost nothing.

This is `_shared/phases/stop-resume.md` applied to a stop nobody asked a
question about. It does not replace that phase; it scales it.

## The three modes

A wait is requested with a mode. The modes differ in ONE thing: how much the
lane finishes before it stops.

| Mode | Stops at | Hand-back | Dispatches | Can lose |
|---|---|---|---|---|
| `safe` | the next **safe point** | full stop sequence | yes (checkpoint) | nothing |
| `soft` | the next **model turn** | full stop sequence, **forced** | yes (checkpoint) | an in-flight return |
| `hard` | the next **model turn** | `RESUME.md` only, best effort | **no** | an in-flight return, the checkpoint, the phase's trace packet |

**`soft` is forced.** On a lane the table below marks as checkpointing, `soft`
does not merely attempt the hand-back: if the checkpoint write fails, **`soft`
does not stop**. It reports the failure and stays in the run. That is
`stop-resume.md` step 2 unchanged — *stopping without a good checkpoint is the
one thing that loses work* — and it is the whole reason the mode exists.

**`hard` is the dispatch-free stop.** It writes only what ORC can write with its
own hand (`RESUME.md`, per stop-resume step 3b — never a dispatched agent). It
is fast BECAUSE it dispatches nothing, not in spite of it. It is the one mode
that can lose work, and it says so every time it runs.

### "the next model turn" is the honest promise

A typed message reaches ORC at a turn boundary. `hard` therefore **cannot**
interrupt a dispatch that is already in flight. What it promises is:

> stop at the first moment ORC can act, and do not wait for the current wave,
> phase or gate to finish.

Never write "immediately". A user who reads "immediately" and sees a wave finish
believes the command failed.

## Safe points

A safe point is a place where the run can stop with no loss. `safe` waits for
one. `soft` and `hard` do not — that is what they are for, and what they risk.

**Never begin a wait at any of these, in any mode:**

- between a dispatch and its validated return
- inside the stop sequence itself
- during a file write, a `splice`, or a wiki registration write
- before the smoke gate has reported

These are not a style preference. Each one leaves an artifact that no resume can
reconstruct.

## Which lanes support a wait

The machine-readable copy of this table is `WAIT_LANE_SHAPES` in `bin/cli.js`,
rendered by `orc wait lanes`. A golden test compares the two IN BOTH DIRECTIONS
— the `EXTRA_LANE_SHAPES` / `DIY_STEPS` precedent. A lane added to one and not
the other fails the suite.

| Lane | Checkpoint | Safe point |
|---|---|---|
| `/orc` | full | wave or phase edge |
| `/orc-ultra` | full | wave or judge gate |
| `/orc-mini` | full | after the executor returns |
| `/orc-fast` | full | after the executor returns |
| `/orc-diy` | full | compiled phase edge |
| `/orc-doc` | full | wave edge |
| `/orc-wiki` | full | scan-task boundary |
| `/orc-analyze` | full | after the analyst returns |
| `/orc-poly` | docset | after a per-repo plan is written |
| `/orc-quick` | entry | after an entry closes |
| `/orc-challenge` | cycle | after a cycle records |
| `/orc-brainstorm` | snapshot | phase edge |
| `/orc-grill` | snapshot | round edge |
| `/orc-learn` | none | single dispatch |
| `/orc-plan` | none | single dispatch |
| `/orc-verify` | none | single dispatch |
| `/orc-pattern` | none | single dispatch |
| `/orc-claude` | none | single dispatch |
| `/orc-explain` | none | read-only, seconds long |
| `/orc-route` | none | read-only, seconds long |
| `/orc-boundary` | none | read-only, seconds long |
| `/orc-budget` | none | read-only, seconds long |
| `/orc-aftermath` | none | read-only, seconds long |
| `/orc-export` | none | read-only, seconds long |
| `/orc-retro` | none | read-only, seconds long |
| `/orc-pact` | none | read-only, seconds long |

**`checkpoint: none` is an ANSWER, not a gap.** A single-dispatch lane has
nothing to checkpoint, so a wait there is a plain wait and the message says so.
On such a lane `safe`, `soft` and `hard` are the SAME thing, and
`orc wait lanes` states that rather than pretending to a distinction. A row that
reads `none` must never render like a row that is missing.

## The hop loop

The lane does not sleep. A **detached** command sleeps. It costs zero tokens and
no model runs during it.

```
1. Write the hand-back for the mode (above).
2. remaining = the requested time, or resets_at - now
3. hop = min(wait_hop_minutes, remaining)
4. Run a DETACHED command that waits hop seconds.
5. On wake: `orc usage check --json`
6. Exit 0, or the requested time has elapsed → continue. Else go to 3.
7. wait_max_hops reached → stop, keep the hand-back, say why.
```

**A hop is short on purpose.** Each wake-up is session activity, and session
activity is the only thing that makes the statusline run again — so each hop
buys a fresh reading. A single long sleep wakes into a reading as stale as the
sleep was long.

## After the wait — ORC does not drag a large context forward

`stop-resume.md` step 6 already requires offering both continue paths. This
decides which one ORC takes without asking:

- **context small** → continue here, and say so in one line.
- **context large** → STOP and offer both paths, recommending the fresh session.

A wait longer than one hour has already expired the prompt cache, so continuing
in-session re-reads the whole context at full input price — exactly when quota
is lowest. Auto-continuing into a bloated context is the cost the wait existed
to avoid.

**ORC cannot clear its own context.** `/clear` is the user's action. The wait
offers the swap; it never performs it.

## The computed gate (`usage_gate`)

The same engine, triggered by the CLI instead of by a typed command. It is
**`off` by default** — nothing below happens until the user turns it on.

Check **before a wave, never during one**: `orc usage check --json`.

| exit | state | `warn` | `stop` | `wait` |
|---|---|---|---|---|
| 0 | ok | continue | continue | continue |
| 1 | low | print and continue | hand back and stop | hand back, hop, come back |
| 2 | unknown | print and continue | print and continue | print and continue |

**Exit 2 never stops a run**, in any mode. An absent reading is absent, not low:
older Claude Code sends no usage headers, and a long dispatch leaves the reading
stale by exactly its own length. A gate that blocks on a missing number is a
gate people switch off.

**The worst window decides.** `orc usage check` already resolves that; never
re-derive it from one window.

A computed stop offers the cheaper answers before the expensive one — a lower
band for this wave, or `orc extra` if a profile is ready — because a wait is the
only one of them that costs wall-clock time.

**A typed `/orc-wait` is never suppressed by any of this**, and a computed wait
is suppressed entirely while a block is active.

## The block — the user's veto

`/orc-wait block <reason>` suppresses every COMPUTED wait for the rest of the
run. It is for the case where stopping costs more than continuing: the window
resets in five minutes and the task needs ten.

1. **The reason is REQUIRED.** A block with no reason is refused by name. The
   recorded reason is what makes the risk demonstrably the user's — the same
   `--reason` rule the run-close and doc-ship writers already use.
2. **Run-scoped. It NEVER writes the user's config.** The same rule the ultra
   lane's forced run-scoped mode already follows. A veto set today must not
   apply to a run started next month.
3. **It is ANNOUNCED at every gate it suppresses, with its age.** A shadowed
   setting must never be silent. There is no auto-expiry — ORC does not decide
   that a user's reason stopped being true — so the age is what keeps an old
   block from applying invisibly.
4. **It blocks what ORC COMPUTES, never what the user TYPES.** A typed
   `/orc-wait 30 hard` still waits while a block is active. `/orc-boundary`'s
   rule, unchanged: a gate constrains ORC's own dispatch, never an explicit
   instruction.
5. It survives a resume, and is re-announced on the first gate after it.

`orc wait cancel` is a DIFFERENT command: it ends a wait that is already
running. Block is before, cancel is during. Never conflate them in prose or in a
menu.

## What a wait never does

- It never dispatches an agent to do the waiting. An agent runs on the same
  account and consumes the same window the wait exists to protect.
- It never runs another lane.
- It never writes the user's config.
- It never widens or narrows the work: the same tasks, the same slice, the same
  agent resolve after the wait as before it.
- It never decides on its own that a user's block has expired.

## Trace

The wait writes CLI-composed lines into the trace that is ALREADY open, and
nothing when no run is active. `/orc-wait` opens no run, so it is **not a lane**
in the trace enum and has no `run-<lane>-<slug>` pointer — the `/orc-explain`
precedent, a stated blind spot rather than an oversight.

```
WAIT   mode=hard requested=30m start=18:44 end=19:14 hops=1/4 trigger=user
WAIT   block reason="window resets in 5m, task needs 10" by=user
WAIT   unblock
```

A wait that leaves no line cannot be counted, and a block that leaves no line
hides the fact that a run continued through a gate on the user's authority.
