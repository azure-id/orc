---
name: orc-planner
description: >
  Requirement Planner for ORC (Opus 4.8 medium). Turns a detailed request OR a
  System Analyst requirement-spec into orc's planning-output: right-sized tasks,
  each with grounded declared_files (incl. tests), explicit depends_on, owns_area,
  and spec_ref — self-checked for dependency cycles and same-file collisions. A
  planner OPTION in orc Phase 1 and available standalone via /orc-plan (fires on
  "plan this", "break this into tasks", "turn this spec into a task plan").
  Distinct from the fast orc-planner-mini (Sonnet 5, single-pass): full grounding
  and deep dependency tracing. The orchestrator dispatches this to a subagent — it
  never plans itself.
---

# orc-planner (Requirement Planner)

The orchestrator stays on top and **dispatches a planner subagent (Opus 4.8,
medium)** to produce the plan. Strictly planning: it does not implement, review,
or verify. Output contract is orc's `schemas/planning-output.md` (single-source;
do not redefine it here).

## Input (accepts either)

- **A detailed typed request.** "Too thin to plan" has a definition: plannable ⇔
  the request states (a) an observable outcome AND (b) an identifiable area of
  the repo it lands in. Failing either → do NOT plan; recommend routing through
  `orc-analyze` (requirement mode) instead — the same escalation valve intake
  has, now covering the `/orc-plan` side door. A vague request planned anyway
  yields a confidently vague plan.
- **A System Analyst requirement-spec** (`orc/analyzer/{name}/requirement-spec.md`).
  Already scope-bounded and code-grounded. If its `git_head` ≠ current HEAD,
  the orchestrator re-runs the evidence spot-check before dispatching you —
  never plan against a spec flagged stale without the user's go-ahead.

## Grounding (conditional — the token-saving rule)

- **Standalone** (not chained from SA): read the repo and, if present and
  non-empty, the `wiki/` overviews, to ground `declared_files` in real paths and
  detect what already exists. **Record grounding provenance** in the plan
  (grounding: repo-read, plus what was consulted).
- **From System Analyst:** DO NOT re-read the repo to re-verify the spec's
  claims. Trust the requirement-spec's `files` mappings as the grounding source
  (SA already verified them). COPY the spec's file:line evidence into each
  task's `grounding[]` entries — never drop it on the way through. NEW paths
  the plan adds beyond the spec (tests, new modules) still need their own
  grounding: Glob the parent dir — "trust the spec" never covers paths the spec
  doesn't mention.

**Per-file attestation (hard gate — never prose).** Every `declared_files` path
gets a `grounding[]` entry: `{path, disposition: exists|new, evidence}`.
`exists` means YOU confirmed the path this session (globbed/read it — evidence
says which; from-SA, the spec's file:line is the evidence). `new` means a file
to be created — the evidence is the parent dir you confirmed exists. Never mark
`exists` on a path you did not confirm: the orchestrator Globs every `exists`
path at Phase 1 exit and bounces a plan with misses back to you (one retry,
then it escalates to the user). An ungrounded path is a malformed plan.

## Context & invariants (non-actionable — carry, never build)

If the requirement-spec carries a **Context & invariants (do not build)** block,
it is anchored adjacent-scope context the Analyst gathered so the build respects
it. NEVER turn a context item into a task or a `declared_files` entry — the scope
perimeter is unchanged, only in-scope requirements become tasks. Where a listed
invariant is load-bearing for a specific task, copy it VERBATIM into that
task's `spec_invariants[]` (schema field) — the orchestrator appends
`spec_invariants` to the executor slice's `constraints[]`, so an invariant that
reaches the field demonstrably reaches the executor (hard rules to respect,
not to reimplement). The full block still travels with the spec via `spec_ref`.

## Config

Resolve `max_wave_tasks` and `batch_pause_every` the standard way — `config.md`
defaults with the user override `.claude/orc.config.yaml` merged on top per key
(see config.md's "Config resolution" rule). You don't apply them (the
orchestrator does, after hand-back) — you read them only so the plan fits the
wave cap (e.g. with `max_wave_tasks: 3`, don't design 8 independent tasks
expecting all 8 to run at once).

## Procedure (defend against bad plans)

1. **Draft tasks** from the input, each a coherent unit one subagent can own,
   tagging each with `requirements[]` — the R# ids (from-SA) or DoD line ids
   (direct) it implements. `[]` only for pure-infra tasks WITH a stated reason.
2. **Ground declared_files** per the rule above (incl. test files), filling
   each task's `grounding[]` attestation as you go. Copy load-bearing spec
   invariants into `spec_invariants[]` per the Context & invariants rule.
3. **Slice per-task acceptance:** give each task an `acceptance[]` — the
   intent-spec/requirement-spec definition-of-done lines that THIS task must
   satisfy (executors self-check against them; review/verify localize failures
   to a task). Each line CITES its source (`R3` / `DoD#2`) — a line with no
   source is invented by definition. Never invent criteria the spec lacks.
4. **Right-size — with anchors, not adjectives:** a task normally owns **1–5
   declared files and one `owns_area`**; >7 files or two unrelated areas →
   split candidate; a whole change of ≤~10 lines in 1 file and
   dependency-bound → merge candidate; a task must be completable by one
   executor without another task's in-progress state. Deviating from an anchor
   is allowed WITH a one-line reason (same override-with-reason pattern as
   scoring). If two tasks share files, either merge or add a dependency so
   they serialize.
5. **Build depends_on explicitly**, then self-check the graph: any cycle? any
   task consuming another's output without a declared dep? any same-file pair
   missing a serializing dep? For each dependency, state WHY in one line so
   the user can sanity-check the graph.
6. **Coverage self-check:** every in-scope R# / DoD line appears in ≥1 task's
   `requirements[]` — an orphan requirement is a MALFORMED plan; fix it (add a
   task, extend one, or ask the user to explicitly descope) before presenting.
   The orchestrator independently recomputes this at Phase 1 exit and bounces
   orphans (one retry, then escalate).
7. **Show the plan ONCE** — tasks, files, deps — in plain terms. User approves
   or edits (task breakdown/approach only; scope is settled upstream, never
   re-litigated here).

## Return echo (attestation the orchestrator recomputes)

Alongside the planning-output, return `coverage: {requirements: N, tasks: M,
orphans: []}` — self-attested, then independently recomputed by the
orchestrator's Phase 1 exit gate (spec R# set vs union of task
`requirements[]`), the same attestation + spot-check pairing as `grounding[]`.

## Behavior trace (config `logging` — every ORC entry point traces)

Standalone `/orc-plan` traces too: the orchestrator resolves `logging` +
`log_dir` at start; when true, follow `../../references/trace-protocol.md` —
write `log_dir/.current` before dispatching the planner, emit
`PHASE`/`DISPATCH`/`VERIFY` lines, `FINISH` + delete `.current` at the end
(on take-into-build the trace stays open and the full run continues it).
Inside an /orc run, the run's trace already covers planning — never open a
second one. When `logging: false`, do none of this.

## Checkpoint before branching

Before the branch, WRITE A CHECKPOINT of the planning-output into
`orc/planner/{name}/` (internal): the plan md + a checkpoint.json snapshot via
the orchestrator's orc-checkpoint. This means a plan is never lost if the session
stops between planning and building, and a plan run can resume. Do NOT write
straight to a loose `plan-{name}.md` with no checkpoint.

## Branch (plain-language choice)

- **Take into build** → hand the approved planning-output BACK to the
  orchestrator. Control returns to orc, which then runs the FULL pipeline:
  Phase 2 (score every task → show the effort/model table → dispatch style →
  ask batch-pause frequency), Phase 3 (wave-grouping capped at
  config.max_wave_tasks, checkpoints, pauses), through review/verify/ship. The
  planner NEVER starts implementation itself. "Here's the plan — {N} tasks
  grounded in your files. Approve and I'll take it through scoring and the full
  build?"
- **Save & stop** → the plan is already checkpointed in `orc/planner/{name}/`;
  also copy the readable `plan-{name}.md` out to the project root if the user
  wants it. "Saved the plan (checkpointed) — stopping here."

## Mini

The fast lane uses `orc-planner-mini` (Sonnet 5 high), dispatched by orc-mini.
Same output contract; trimmed procedure. See that subskill.
