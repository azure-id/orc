# Phase — Stop, usage report, resume   (id: `stop-resume`)

> **Library file.** Canonical since v1.0.0 W11; it was
> the `orc` skill's own `stop-and-resume` reference. Layers declared: `core` only — the stop
> sequence is identical in every lane that stops, and the lane-specific half
> (which moments are MANDATORY stops) is already a per-lane rule in the spine.

<!-- orc:layer core -->

The token-saving heart of ORC. Load whenever a stop fires (batch
boundary, token pressure, phase transition worth guarding, or user request).

## When a stop is MANDATORY vs a judgment call

Most stops are yours to judge (token pressure, a phase worth guarding, a user
request). **The batch boundary is NOT a judgment call — it is a hard gate.**
Waves are computed for every run regardless of dispatch style (sequential runs
have waves too — see `wave-grouping.md`), so the boundary binds to wave numbers
in both styles. After completing wave W, if `W % batch_pause_every == 0` **and at
least one wave remains** (`W < total_waves`), the stop sequence below is MANDATORY
and deterministic: **never dispatch wave W+1 past an unacknowledged boundary.** The
boundary is computed from the answered pause schedule at intake (Phase 2) and
stored as `pause_schedule` in the checkpoint, so a resumed session enforces the
same boundaries. Emit `GATE wave-boundary :: wave=W of K → STOP (batch_pause_every=N)`
before the stop. Token pressure and user request remain judgment; the batch
boundary is not.

## The stop sequence (order is mandatory)

1. **Decide** to stop (your judgment for token/phase/user stops; the batch
   boundary above is not a decision but a hard gate). The checkpoint skill
   never decides.
2. **Write the checkpoint** into the run subfolder via
   `subskills/orc-checkpoint/SKILL.md`. VALIDATE the
   return. If the write fails → DO NOT STOP; surface the write failure instead.
   Stopping without a good checkpoint is the one thing that loses work.
3. **Update `run/{run-slug}/state-of-play.md`** — the 10-line human-readable re-anchor:
   current phase, wave, done/pending tasks, last decision, next action.
3b. **Write `{run_dir}/{run-slug}/RESUME.md`** — the same breath as steps 2–3,
   by YOU, never a dispatched agent. Overwrite; never append. Shape below.
4. **Usage report** (see below).
5. **Generate the resume block** (see below) — regenerate FRESH at every stop,
   never reuse an old one. It is printed inline AND is the body of `RESUME.md`.
6. Tell the user: what's done / remaining, then BOTH continue paths:
   "Reply **continue** here, or paste the block below in a **fresh session**
   (recommended if this conversation is long — cheaper and cleaner than
   dragging this context forward)."
7. End the turn.

## Usage report (at EVERY stop and ALSO at run completion)

Do NOT attempt to invoke `/usage` — it cannot be called programmatically.
Instead, at every stop and at run completion:
1. Report the **dispatch log** you fully control: every subagent's model,
   effort, and score. At completion, show the full per-task table (task, score
   + override reason, model, effort) so the user sees where tokens went.
2. **Remind the user to run `/usage` themselves** for their 5-hour and weekly
   limit numbers: "Run `/usage` to see your remaining limits."

Never skip either part.

## The resume block — printed inline AND written to `RESUME.md`

A fresh session + disk state is cheaper AND higher-fidelity than a long compacted
session: near-empty context, perfect state. Offer it proactively at every pause
once the run is more than ~2 waves old or usage is heavy — do not wait to be
forced.

**The problem this file fixes.** ORC used to print the block and nothing else. If
the user closed the window, got distracted, or came back three days later, the
work was safe (the checkpoint is on disk) but the *way back in* was gone.

### Where it goes, and why there

```
{run_dir}/{run-slug}/RESUME.md
```

Inside the run folder — with `checkpoint.json` and `state-of-play.md`, where run
state has lived safely since v0.34.1 — **never at the project root**.
`/orc-quick` and `/orc-grill` put their docs at the root because those are
deliverables a human reads later. A resume prompt is *transient run state*: dead
the moment the run finishes, and it must never be at risk of being committed.
Discovery is `orc resume`'s job, not the filesystem's.

### Lifecycle — the file existing IS the "unfinished" flag

- **Written at EVERY stop**, as the third write in the same breath as
  `checkpoint.json` and `state-of-play.md`. ORC writes it itself — no dispatch.
  A dispatch inside the stop sequence would mean a stop can fail because a
  subagent did, at the one step whose entire job is not losing work.
- **ONE per run slug, always overwritten, never appended.** This is already the
  protocol's rule above ("regenerated FRESH at every stop, never reuse an old
  one"), because a stale resume block points at a wave that is already done. This
  gives that rule a place on disk.
- **Deleted at `FINISH`** — in the same Phase 8 step that deletes
  `log_dir/.current`. So a `RESUME.md` existing means **this run is still waiting
  for you**, with no stale entries and no separate "is this consumed?"
  bookkeeping.
- **NOT deleted when a resume merely starts.** If that session then dies, the
  pointer must still be there.

### Contents (deterministic — this shape, not an improvisation)

```
Continue ORC run `merchant-notifications`.

Read .claude/orc/run/merchant-notifications/state-of-play.md,
then .claude/orc/run/merchant-notifications/checkpoint.json.
Resume from the checkpoint's phase and wave.
The intent-spec is approved — do not re-plan. Do not redo tasks marked done.

Where it stands:  /orc · phase execution · wave 2 of 4 done
Done:             T1, T2, T3, T5
Left:             T4 (requeued — see failure_reason), T6, T7
Watch out for:    T4 failed once on a missing migration; the gotcha is recorded
Next action:      dispatch wave 3 (T6, T7)
```

Every blank is a value you hold at that instant (phase, wave, task states,
failure reasons) — which is exactly why no model is needed to fill them in.

**Keep the `Where it stands:` line in exactly that shape** — lane, then phase,
then `wave K of N`, separated by ` · `. It is the ONE line `orc resume` and
`orc run list` parse, which is how they can list every waiting run without ever
opening a `checkpoint.json`. Prose elsewhere in the file is free-form.

### Always tell the user both paths

```
Paused after wave 2 of 4.

To continue in a NEW session (cheaper and cleaner than this long one):
open a fresh session and paste the contents of

  .claude/orc/run/merchant-notifications/RESUME.md
  (or just run `orc resume` and pick it from the list)

Or reply `continue` here.
```

Name the path AND the command. A user who lost the chat has neither the block nor
the slug in front of them.

## Compaction-proofing (always on, not just at stops)

- **Disk is truth.** Everything needed to continue lives in `run/` files you
  created: intent-spec, checkpoint, state-of-play, decision log. Conversation
  is a disposable cache.
- Write the checkpoint EAGERLY: after every wave, every escalation answer,
  every phase transition — so a surprise compaction never catches state that
  exists only in conversation.
- On ANY suspicion of compaction (context feels summarized, details missing):
  re-read state-of-play → checkpoint → re-anchor BEFORE acting.

## Resume procedure (both paths: "continue" here, or fresh session)

1. Read `run/{run-slug}/state-of-play.md` (one-glance orientation).
2. Read the newest valid checkpoint (`updated_at` wins).
3. One-line intent reconfirm (fresh session only): "Resuming: <scope>. Still
   correct?"
4. From task_state: done stays done; partial resumes from
   `progress.files_written` (last milestone); pending awaits its wave;
   requeued/failed re-dispatch reading `failure_reason`; stale_review gets a
   review pass.
5. Re-attach the decision log, regenerate the digest, continue from the
   checkpoint's phase.

<!-- /orc:layer -->
