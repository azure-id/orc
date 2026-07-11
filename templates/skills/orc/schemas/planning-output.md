# Schema — Planning Output (Phase 1)

The single artifact planning produces. Everything downstream reads it: conflict
graph, wave grouping, task scoring, checkpoint, dependency graph (forward =
scheduling, reverse = stale-flagging), failure re-runs. Owned by the
orchestrator; workers receive SLICES, never this whole object.

YAML for readability; field names stable if serialized to JSON.

## Top level

```yaml
run:
  id: string               # "run-020726-1422"
  planner: enum            # superpowers | openspec | orc
  effort: enum             # low | medium | high     (run-level → mode)
  execution_model: enum    # sequential | parallel | parallel_worktrees  (dispatch style; workers ALWAYS spawned)
  source_branch: string
  intent_spec: string      # path: run/{run-slug}/intent-spec.md
  created_at: timestamp    # DDMMYY HH:MM:SS.mmm

tasks: [ Task ]
waves: [ Wave ]            # planning may leave empty; orchestrator computes
```

## Task

```yaml
- id: string               # "T1" — referenced by depends_on and waves
  title: string
  description: string
  spec_ref: string|null    # path to planner's prose spec ("openspec/x.md#section")

  owns_area: [string]      # human-readable grouping (logs/summaries)
  declared_files: [string] # HARD GATE: actual files it will touch, incl. tests.
                           # File-level globs. No declaration → no wave assignment.
  depends_on: [string]     # forward = ordering; reverse = stale_review flagging

  # grounding attestation (filled by the PLANNER — one entry per declared path)
  grounding: [object]      # {path, disposition: exists|new, evidence}
                           # exists → the planner CONFIRMED the path this session
                           #   (evidence: "globbed" | "read" | the analyst spec's
                           #   file:line — copied through, never dropped)
                           # new → a file to be created (evidence: the parent
                           #   dir confirmed to exist)
                           # An ungrounded path is a MALFORMED plan — the
                           # orchestrator spot-checks every `exists` path with
                           # Glob at Phase 1 exit and bounces misses back (one
                           # retry, then escalate). Plans from before v0.7.0
                           # lack this field: resume them without the
                           # spot-check, never bounce an old plan.
  acceptance: [string]     # per-task acceptance criteria, sliced from the
                           # intent-spec's definition-of-done. Executors
                           # self-check against these before returning;
                           # review/verify use them to localize failures to a
                           # task instead of the whole diff.

  # scoring (filled by orchestrator in Phase 2; ALWAYS — every task is scored)
  computed_score: int|null     # 0–100 (base + adjusters, clamped)
  override_score: int|null     # orchestrator override (requires reason)
  override_reason: string|null
  model: string|null           # from the ladder — never null at dispatch time
  model_effort: string|null

  # runtime (filled by orchestrator during Phase 3)
  agent: string|null
  wave: int|null
  worktree: string|null    # subagent_worktrees mode only
  status: enum             # pending | running | done | failed | partial |
                           # requeued | stale_review | needs_context
  failure_reason: string|null  # the WHY — re-runs read this
  retry_count: int             # hard cap 2
  context_requests: int        # needs_context count — hard cap 2
  stale_cause: string|null     # set when status=stale_review
  progress: object|null        # {percent, files_written[], notes} — from
                               # milestone pings; bounds mid-wave stop recovery
  actual_files: [string]|null  # returned by worker; audited vs declared_files
```

## Wave

```yaml
- number: int
  task_ids: [string]       # zero declared_files overlap within a wave
  agents: int
  is_batch_pause: bool     # true every Nth wave per user's batch choice
```

## Status semantics

- `requeued` ≠ `stale_review`. requeued = "I failed, run me again (reading my
  failure_reason)". stale_review = "my upstream changed; give me a cheap review
  pass — escalate to re-run only if actually broken."
- `needs_context` = worker paused asking for a context re-slice; orchestrator
  adjudicates (in-scope for its area?), re-slices or treats as a planning
  correction (add the missing depends_on edge).

## Settled decisions (locked)

1. `declared_files` = file-level globs (symbol-level deferred).
2. `owns_area` kept for readability; `declared_files` does the conflict work.
3. Planner prose referenced via `spec_ref`, never inlined.
4. `grounding` is a per-file ATTESTATION, not prose: the planner states how each
   path was confirmed, and the orchestrator deterministically spot-checks it
   (instruction → contract → attestation → spot-check). `declared_files` stays a
   plain string list so the conflict graph and waves read it unchanged.
