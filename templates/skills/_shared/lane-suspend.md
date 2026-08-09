# Shared contract — Lane SUSPEND and RESUME (`RETURN-TO`)

Canonical file: `_shared/lane-suspend.md`. THE canonical mechanic for a lane that
must **leave mid-run, let another lane settle something, and come back to the
work it had already done**. Load it wherever a lane hands control away and
expects control back.

## Why this is not a fallback

ORC already has `_shared/fallback-handoff.md` (`FALLBACK-FROM`), used when
`/orc-fast` cannot proceed. That contract **leaves and does not return** — the
receiving lane finishes the job and the sender is done.

A SUSPEND is the other shape. The sender has real work in hand — a half-built
frame, a pool of candidates, decisions already tagged — and that state must
survive the trip. Sending it through a fallback would silently destroy it.

| | `FALLBACK-FROM` | `RETURN-TO` |
|---|---|---|
| Who finishes the run | the receiver | the **sender**, after coming back |
| Sender state | abandoned | **snapshotted, then resumed** |
| The receiver's exits | its own | its own **plus** a return option |
| Trace | one run | **two runs, correctly counted as two** |

## The block

The suspending lane writes this into the receiving lane's opening context:

```
RETURN-TO: <sender-lane>/<slug>
SNAPSHOT: <path to the sender's state file on disk>
GAP: <the one thing the receiver is being asked to settle, in one sentence>
```

## Sender obligations — all four, in order

1. **Snapshot first, before leaving.** Write the sender's current state to disk.
   A suspended run that cannot resume is worse than a file nobody asked for, so
   this write happens even in a lane whose deliverable is otherwise gated on an
   explicit yes — it is **run state, not the deliverable**, and the sender says
   so in one line when it writes it.
2. **Offer, never force.** A suspend is one option among the alternatives
   (answer it here · park it as a stated assumption and continue). The user
   chooses; the lane waits.
3. **Enter the receiving lane** with the block above and the `GAP` as its opening
   sentence.
4. **On return, resume at the phase you left** — never from scratch, never by
   re-asking what the trip just settled.

## Receiver obligations

- **Run completely normally.** Its own phases, its own gates, its own trace, its
  own run. A `RETURN-TO` marker changes nothing about how it works.
- **Add ONE exit option, present only under `RETURN-TO`:**
  `Return to /<sender-lane> — carry these decisions back`, and it is the
  recommended option in that state. Every other exit still works: a user who
  picks "stop, save nothing" simply does not come back, and the sender's
  snapshot is still on disk for a later re-open.
- **Carry decisions back with their tags intact** (`intent` / `constraint`, per
  `_shared/interview.md`) plus `source: /<receiver-lane>`, and merge the facts it
  looked up into the sender's own table. A decision that returns untagged is a
  decision that stops becoming a `spec_invariants[]` entry downstream.

## The trace-pointer rule (the one that is easy to skip, and expensive)

A receiving lane **deletes `log_dir/.current` at its `FINISH`**. If the sender
resumes without noticing, every line it writes after the return goes nowhere —
the v0.34.2 split-run defect family wearing a new hat.

> **On RESUME, the suspending lane re-writes its own `.current` AND must
> `touch the trace file` it names, in the SAME step. Both, or neither.**

Then it narrates the trip: one event for the suspend, one for the return, in the
sender's own trace. **Two traces are correct here** — two lanes ran, and
`orc stats` counts two. The sender's trace records the trip; the receiver's
records the content.

## What never travels

A suspend does not widen anyone's authority. The receiver may not write the
sender's deliverable, and the sender may not re-open the receiver's decisions on
return — it records them and carries on.
