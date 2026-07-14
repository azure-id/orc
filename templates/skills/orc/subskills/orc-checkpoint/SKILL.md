---
name: orc-checkpoint
description: >
  Stateless persistence service for ORC — the checkpoint read/write engine. On a
  trigger passed in by the orchestrator (batch_pause | token_limit |
  phase_transition | crash_guard), it atomically writes
  run/{slug}/checkpoint.json, regenerates the 10-line state-of-play.md, then reads
  both back and validates; the read op locates the newest valid checkpoint for a
  fresh-session resume. It makes NO judgment — it never decides WHEN to stop or
  resume (the orchestrator owns that and passes the trigger in). Coordination
  skill: always runs inline (loaded by the orchestrator), never spawned. Not for
  direct user invocation.
---

# orc-checkpoint

## Boundary (locked in design)

- Orchestrator DECIDES: when to checkpoint, when to stop, when/whether to
  resume. These judgments need full run context and never leave the orchestrator.
- This skill EXECUTES: serialize/write atomically, read/validate back. It makes
  no judgment; the `trigger` is an input, already decided.

## Write operation

Input: run_state (the checkpoint fields per `../../schemas/checkpoint.md`),
       trigger (batch_pause | token_limit | phase_transition | crash_guard)

Minimal `run_state` shape (see `../../schemas/checkpoint.md` for the full field set):
```json
{ "run_slug": "merchant-notifications", "phase": 3, "updated_at": "2026-07-10T09:00:00Z",
  "tasks": [ { "id": "T1", "status": "done", "actual_files": ["services/notify.ts"] } ],
  "resume_pointer": "wave 2 of 3", "logging_enabled": true }
```
Steps:
1. Serialize run_state to JSON.
2. Atomic write: temp file → rename to run/{run-slug}/checkpoint.json.
3. Regenerate run/{run-slug}/state-of-play.md from the same state (10-line format per
   `../../schemas/checkpoint.md`).
4. Read back and validate both writes.
Return: { checkpoint_path, state_of_play_path, written_at, resume_pointer }

A failed or unvalidated write returns failure — the caller must NOT stop the
session on a failed write; it surfaces the failure instead.

## Read operation

Input: run_id (or "newest")
Steps: locate the run subfolder, then newest valid checkpoint by updated_at → parse → validate schema.
Return: { run_state, resume_pointer } or failure if none valid.

## What this skill never does

- Decide to stop. Announce a pause. Talk to the user. Modify task logic.
- Write anything other than the two files above.
