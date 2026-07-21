# Reference — Stop Sequence, Usage Report, and Fresh-Session Resume

The token-saving heart of ORC. Load whenever a stop fires (batch
boundary, token pressure, phase transition worth guarding, or user request).

## When a stop is MANDATORY vs a judgment call

Most stops are yours to judge (token pressure, a phase worth guarding, a user
request). **The batch boundary is NOT a judgment call — it is a hard gate.**
After completing wave W, if `W % batch_pause_every == 0` **and at least one wave
remains** (`W < total_waves`), the stop sequence below is MANDATORY and
deterministic: **never dispatch wave W+1 past an unacknowledged boundary.** The
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
4. **Usage report** (see below).
5. **Generate the resume block** (see below) — regenerate FRESH at every stop,
   never reuse an old one.
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

## The resume block (fresh-session path)

Generate exactly this shape, with real values:

```
Continue ORC run `{run-id}`.
Read run/{run-slug}/state-of-play.md, then run/{run-slug}/checkpoint.json.
Resume from the checkpoint's phase and wave. The intent-spec is approved —
do not re-plan. Do not redo tasks marked done.
```

A fresh session + disk state is cheaper AND higher-fidelity than a long
compacted session: near-empty context, perfect state. Offer it proactively at
every pause once the run is more than ~2 waves old or usage is heavy — do not
wait to be forced.

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
