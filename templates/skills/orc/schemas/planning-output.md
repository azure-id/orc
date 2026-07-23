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
  plan_head: string        # HEAD sha at plan time (mirror of the requirement-
                           #   spec's git_head). The plan-handoff entry contract
                           #   (references/plan-handoff.md) compares it to the
                           #   executing session's HEAD: a mismatch (or an absent
                           #   field, a pre-v0.31.0 plan) makes the Phase 1 exit
                           #   gate grounding spot-check COMPULSORY.
  plan_confidence: enum    # high | medium | low (+ reason). Filled by the planner
                           #   (Part E). low → the orchestrator recommends
                           #   stepping back to orc-analyze before Phase 2.

tasks: [ Task ]
waves: [ Wave ]            # planning may leave empty; orchestrator computes
open_questions: [object]   # [] or [{question, proposed_default, blocking: bool}]
                           #   — every ambiguity the planner met (Part E). The
                           #   orchestrator relays them in ONE batch after the
                           #   Phase 1 exit gate: blocking ones must be answered
                           #   before Phase 2; non-blocking show their default for
                           #   tacit approval.
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
                           # intent-spec's definition-of-done. Each line CITES
                           # its source ("R3" / "DoD#2") — a line with no
                           # source is invented by definition and bounces.
                           # Executors self-check against these before
                           # returning; review/verify use them to localize
                           # failures to a task instead of the whole diff.

  requirements: [string]   # WHICH spec requirements this task implements —
                           # R# ids (from-SA) or DoD line ids (direct intake).
                           # [] allowed ONLY for pure-infra tasks WITH a stated
                           # reason in description. Feeds the coverage gate:
                           # every in-scope R#/DoD line must appear in ≥1
                           # task's requirements[] — an orphan requirement is
                           # a MALFORMED plan (bounced, one retry).
  spec_invariants: [string]# load-bearing lines copied VERBATIM from the spec's
                           # Context & invariants (do not build) block into the
                           # task(s) they guard. The orchestrator appends them
                           # to the executor slice's constraints[] — hard rules
                           # to respect, never tasks to build.

  # scoring facets (filled by the PLANNER during grounding — the party that read
  # every declared file produces the FACTS; the orchestrator computes the score
  # arithmetically from them, so no number is judged from a task title. See
  # references/effort-and-mode.md for the fixed formula. The orchestrator
  # RECOMPUTES breadth + fan_in/fan_out from the plan and bounces a mismatch or
  # an uncited risk — same bounce mechanics as grounding.)
  facets:                  # object; absent ONLY on pre-v0.31.0 plans (resume
                           #   without the facet gate, score via the legacy path)
    breadth: int           # = len(declared_files) — computed by the planner, not judged
    novelty: enum          # mechanical | imitate | new-surface | novel-algorithm
    logic: enum            # none | branching | stateful | algorithmic
    test_surface: enum     # none | update-existing | new-tests
    risk: [object]         # [] or [{class, cite}] — class ∈
                           #   auth|money|migration|security|concurrency|data-integrity;
                           #   cite = the file/requirement that makes it so (an
                           #   uncited risk entry is a MALFORMED plan → bounced).
                           #   risk ≠ [] forces the score floor of 70 (now DERIVED
                           #   from a cited facet, never remembered).
    uncertainty: enum      # low | medium | high (+ one-line reason if not low)
    # fan_in / fan_out are NOT emitted here — the orchestrator computes them from
    # depends_on (forward = fan_in, reverse = fan_out) at Phase 2.

  # scoring (filled by orchestrator in Phase 2; ALWAYS — every task is scored)
  computed_score: int|null     # 0–100 (facet formula, clamped)
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
  is_batch_pause: bool     # recomputed from the Phase 2 pause schedule: true
                           # when wave.number % N == 0 AND a later wave exists
                           # (last wave is never a pause). A true here is a HARD
                           # stop gate (stop-and-resume.md), not a hint.
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
5. `requirements` + the coverage echo make plan COMPLETENESS checkable the same
   way `grounding` made paths checkable. The planner returns `coverage:
   {requirements: N, tasks: M, orphans: []}` (self-attested); the orchestrator
   independently recomputes it at Phase 1 exit — spec R# set vs the union of
   task `requirements[]` — and bounces orphans. Cycle detection + same-file
   collision re-run at the same gate (deterministic, trivial at ≤20 tasks)
   instead of being trusted to the planner's self-check.
6. `spec_invariants` paves the last mile of the analyst's do-not-build context:
   an invariant that reaches a task field demonstrably reaches the executor's
   `constraints[]`; one that lives only in the spec's prose may not.
