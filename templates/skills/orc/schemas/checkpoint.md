# Schema — Durable Checkpoint + State-of-Play

Two files, two jobs:
- `run/{run-slug}/checkpoint.json` — machine truth. Orchestrator-only writes.
  Survives pause, compaction, crash, fresh sessions. KEPT after success (audit).
- `run/{run-slug}/state-of-play.md` — 10-line human-readable re-anchor. Read FIRST on any
  resume, then the checkpoint for detail.

## run/{run-slug}/checkpoint.json

```jsonc
{
  "run_id": "run-020726-1422",
  "schema_version": "0.2",
  "phase": "execution",        // intake|planning|scoring|execution|integration|review|verify|summary|ship|done
  "planner": "openspec",
  "effort": "medium",
  "execution_model": "parallel",   // sequential | parallel | parallel_worktrees
  "source_branch": "feat/notifications",
  "intent_spec": "run/merchant-notifications/intent-spec.md",
  "batch_pause_every": 2,
  "pause_schedule": [2],           // wave indices where a MANDATORY batch stop fires
                                   // (computed from the Phase 2 answer; last wave never included) —
                                   // a resumed session enforces the same hard boundaries
  "logging_enabled": true,         // logging is PERMANENT (always on) — re-anchor the behavior trace on resume
  "trace_path": null,              // "<log_dir>/<run-slug>-<DDMMYY>.txt" — the run's trace file
  "ultra_mode": false,             // true only on /orc-ultra runs; gates the "ultra" block below
  "ultra": null,                   /* when ultra_mode — a resumed run continues mid-gate/mid-loop:
    { "brief_path": "run/…/ultra/advisory-brief.md",
      "ledger_path": "run/…/ultra/assumption-ledger.md",
      "matrix_path": null,                    // set before gate 3
      "gates": {                              // per-gate judgment state
        "analysis":       { "verdict": "approve", "round": 1, "loops_used": 0 },
        "plan":           { "verdict": "revise",  "round": 2, "loops_used": 1 },
        "implementation": { "verdict": null,      "round": 0, "loops_used": 0 } } } */
  "current_wave": 2,
  "paused": true,
  "pause_trigger": "batch_pause",  // batch_pause | token_limit | phase_transition | crash_guard

  "plan": { /* full planning-output object */ },

  // fast-resume mirror; kept in sync on every task state change
  "task_state": {
    "T1": { "status": "done", "retry_count": 0, "context_requests": 0,
            "failure_reason": null, "progress": null,
            "actual_files": ["db/migrations/0001.sql", "models/notification.x", "models/notification.test.x"] },
    "T3": { "status": "partial", "retry_count": 0, "context_requests": 1,
            "failure_reason": null,
            "progress": { "percent": 60, "files_written": ["services/email_digest/scheduler.x"],
                          "notes": "daily path done; weekly cron pending" } }
  },

  // every spawn, for the usage report + rubric audit
  "dispatch_log": [
    { "task_id": "T1", "computed_score": 72, "override_score": null,
      "override_reason": null, "model": "sonnet-5", "effort": "medium",
      "spawned_at": "020726 14:24:01.100",
      // claimed-vs-actual (only when logging_enabled): what the worker reported
      "actual_model": "claude-sonnet-5", "actual_effort": "medium",
      "verify": "match" },      // match | downgrade

    { "task_id": "T6", "computed_score": 88, "override_score": 62,
      "override_reason": "rubric over-weighted file count; isolated leaf UI",
      "model": "sonnet-5", "effort": "high", "spawned_at": "020726 15:01:22.040" }
  ],

  "worktrees": { /* subagent_worktrees mode: agent → {path, branch, merged} */ },
  "merge_state": null,           // null | pending_verify | merged | conflict_resolving

  "escalations": [
    { "id": "E1", "agent": "Agent-C", "task": "T3",
      "question": "Digest send time?", "answer": "07:00 fixed",
      "at": "020726 14:28:41.507",
      "affected_tasks": [], "downstream_flagged": [] }
  ],

  "review":  { "ran": false },   // when ran: p0[], p1[], p2[], p3[], model, effort
                                 // (v1 checkpoints used blocking[]/nits[] — on resume
                                 //  map blocking→p1, nits→p3; never rewrite the old file.
                                 //  v0.7.0+: each recorded P0–P2 finding keeps its
                                 //  file:line + verbatim quote so a resumed run can
                                 //  re-run the quote spot-check before acting)
  "verify":  { "ran": false },   // result, autofix_used, autofix_remaining (starts 1)
  "ship":    { "commit": null, "push": null, "create_pr": null,
               "ticket": null, "pr_title": null, "target_branch": null, "pr_file": null },

  "decision_log": "run/merchant-notifications/decision-log.md",
  "created_at": "020726 14:22:01.000",
  "updated_at": "020726 15:02:00.331"
}
```

## run/{run-slug}/state-of-play.md (regenerated at every checkpoint write)

```markdown
# State of Play — run-020726-1422
Phase: execution · Wave 2 of 3 · PAUSED (batch)
Done: T1 T2 T4 · Partial: T3 (60%, weekly cron pending) · Pending: T5 T6
Mode: subagent · Planner: openspec · Branch: feat/notifications
Last decision: digest send 07:00 fixed (user, via Agent-C)
Next action on resume: finish T3 from milestone, then dispatch wave 3
Intent: merchant notifications (in-app + email digest + prefs) — no push, no admin
```

## Write discipline

- Orchestrator-only. Atomic write (temp file + rename). `updated_at` bumped to
  ms on every write.
- Write EAGERLY: after every wave, escalation answer, phase transition, and
  before any risky operation — so surprise compaction never catches
  conversation-only state.
- A failed/malformed checkpoint write is a FAILURE: do not stop the session on
  it; surface it.

## Resume contract

1. Read state-of-play (orientation) → newest checkpoint (`updated_at` wins).
2. Fresh session: one-line intent reconfirm from the Intent line.
3. task_state: done stays done · partial resumes from progress.files_written ·
   pending awaits wave · requeued/failed re-dispatch reading failure_reason ·
   stale_review gets a review pass.
4. Re-attach decision log, regenerate digest, continue from `phase`.
