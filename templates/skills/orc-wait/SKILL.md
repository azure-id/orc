---
name: orc-wait
description: >
  Wait for wall-clock time to pass without losing the run you are in. Use for
  "/orc-wait", "/orc-wait 30", "/orc-wait 2h hard", "wait for my quota to
  reset", "pause this until the window resets". You watched the statusline, you
  saw the window was almost full, and you decided to stop — this carries that
  decision out: it writes the hand-back, waits in short detached hops that cost
  ZERO tokens, and picks the run back up where it left it. Three modes decide
  how much finishes before it stops: safe (finish the wave), soft (stop now, but
  force the checkpoint first), hard (stop now, RESUME.md only, can lose work).
  Also carries the veto — "/orc-wait block <reason>" tells ORC not to stop you
  at all. It never dispatches an agent, never runs another lane, and never
  writes your config.
---

# ORC — the wait

Canonical contract: **`_shared/wait.md`**. Load it before you do anything here.
This spine is the entry point; that file is the rule.

> **`a lane that waits without a hand-back` has broken this contract.**

A wait is a stop. Every stop writes its hand-back BEFORE it ends, because the
thing that resumes the run may not be this session.

## What this lane never does

- It never dispatches an agent to do the waiting. An agent runs on the same
  account and burns the window the wait exists to protect.
- It never runs another lane, and never changes the work: same tasks, same
  slice, same agent resolve after the wait as before it.
- It never writes the user's config.
- It never computes hops itself. `orc wait plan` does that.
- It is **command-entry only.** No lane invokes `/orc-wait` for itself.

## W1 — parse (silent)

Run `orc wait plan <spec> --json`. Never do this arithmetic in your head.

| exit | meaning | what you do |
|---|---|---|
| 0 | planned | go to W2 |
| 1 | unparsable | show the `hint` verbatim and STOP. Do not guess a duration. |
| 2 | no reading | show the `hint` verbatim and STOP. `reset` needs a usage reading; ask for a time instead. |

`block` / `unblock` skip W1 entirely — see **The veto** below.

## W2 — resolve the mode

A named mode always wins. With none, read `wait_default_mode`:

- `ask` (the default) → ask, in ONE turn, with the cost of each spelled out:

  ```
  Which mode?
    1. safe — finish the current wave first, then wait. Loses nothing.
    2. soft — stop at the next turn. Forces the checkpoint first.
    3. hard — stop at the next turn. No checkpoint. Can lose the wave.
  ```
- `safe` | `soft` | `hard` → use it, and say which one you used and why.

If `orc wait lanes --json` reports `modes_differ: false` for the lane in flight
(nothing to checkpoint), SAY SO and do not ask — the three modes are identical
there, and asking a question with one real answer wastes a turn.

## W3 — reach the stop point

Answer the user IMMEDIATELY, before you reach it. A queued command that looks
ignored reads as a broken command.

```
⏸ I got your wait. 30 minutes, soft.
   Wave 3 is running. I do not stop a dispatch in the middle.
   I stop as soon as wave 3's returns are validated.
```

| mode | stop at |
|---|---|
| `safe` | the next SAFE POINT — see the table in `_shared/wait.md` |
| `soft` | the next model turn |
| `hard` | the next model turn |

**Never begin a wait** between a dispatch and its validated return, inside the
stop sequence, during a file write, or before the smoke gate has reported. That
holds in every mode, `hard` included.

Never write "immediately". `hard` stops at the first moment ORC can act.

## W4 — hand back (the step that is never skipped)

| mode | what you write |
|---|---|
| `safe`, `soft` | the FULL stop sequence — `_shared/phases/stop-resume.md`, steps 2–3b |
| `hard` | `RESUME.md` ONLY, with your own hand, never a dispatched agent |

**`soft` is FORCED.** If the checkpoint write fails, **do not stop**. Report the
failure and stay in the run. Stopping without a good checkpoint is the one thing
that loses work.

`hard` is the dispatch-free stop: it writes only what ORC can write itself, and
that is exactly why it is fast. When you use it, name what may be lost:

```
⚠ hard: wave 3 had 2 dispatches in flight. Their file writes may still land,
   but their returns are not validated. RESUME.md records this.
```

## W5 — hop

Run each hop as a **detached** command so no model is running and no tokens are
spent. One hop per entry in `hops[]` from W1.

After every hop:

1. `orc usage check --json` (exit 0 → the window recovered; go to W6)
2. `orc wait status --json` — `cancel_requested: true` → stop hopping, go to W6
3. otherwise, the next hop

Print the END TIME every hop, not only the length: "hop 2 of 4, ends 19:14".
A user who cannot see when a wait ends cannot tell it from a hang.

## W6 — come back

Read `context` from `orc usage check --json`.

- **context small** → continue the run here, in one line.
- **context large** → STOP. Offer both paths, and recommend the fresh session:

  ```
  The wait ended.  usage: 5h 9% (4h51m) · context: 81%

    Context is large, and the prompt cache expired during the wait.
      → new session, then:  orc resume <slug>
    Or reply `continue` to go on here.
  ```

ORC cannot clear its own context — `/clear` is the user's action. Offer the
swap; never claim to have performed it.

## The veto — `block` and `unblock`

`/orc-wait block <reason>` → `orc wait block <slug> --reason "<why>"`.

- The CLI writes it. You never write `wait.json` yourself.
- **The reason is required.** Exit 1 means you must ask for one — relay the
  refusal, never invent a reason on the user's behalf.
- It suppresses what ORC COMPUTES, never what the user TYPES. A typed
  `/orc-wait 30 hard` still waits while a block is active.
- Re-announce it, with its age, at EVERY gate it suppresses. There is no
  auto-expiry.

`orc wait cancel` is a DIFFERENT thing: it ends a wait already running. Block is
before, cancel is during. Never present them as the same choice.

## Trace

The CLI writes the `WAIT` lines itself, into the trace already open. You do not
narrate them and you do not repeat them.

`/orc-wait` opens no run, so it is **not a lane** in the trace enum and writes
no `run-<lane>-<slug>` pointer — the `/orc-explain` precedent. With no run in
flight, a wait is simply a wait and nothing is traced.
