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

- **A detailed typed request.** If the request is too thin to plan against, push
  back for specifics BEFORE planning — a vague request yields a vague plan.
- **A System Analyst requirement-spec** (`orc/analyzer/{name}/requirement-spec.md`).
  Already scope-bounded and code-grounded.

## Grounding (conditional — the token-saving rule)

- **Standalone** (not chained from SA): read the repo and, if present and
  non-empty, the `wiki/` overviews, to ground `declared_files` in real paths and
  detect what already exists. **Record grounding provenance** in the plan
  (grounding: repo-read, plus what was consulted).
- **From System Analyst:** DO NOT re-read the repo. Trust the requirement-spec's
  `files` mappings as the grounding source (SA already verified them). No
  provenance note needed — the spec is the record.

## Context & invariants (non-actionable — carry, never build)

If the requirement-spec carries a **Context & invariants (do not build)** block,
it is anchored adjacent-scope context the Analyst gathered so the build respects
it. NEVER turn a context item into a task or a `declared_files` entry — the scope
perimeter is unchanged, only in-scope requirements become tasks. The block travels
with the spec (executors read it via `spec_ref`); where a listed invariant is
load-bearing for a specific task, name it in that task so it surfaces in the
executor's `constraints[]` (hard rules to respect, not to reimplement).

## Config

Resolve `max_wave_tasks` and `batch_pause_every` the standard way — `config.md`
defaults with the user override `.claude/orc.config.yaml` merged on top per key
(see config.md's "Config resolution" rule). You don't apply them (the
orchestrator does, after hand-back) — you read them only so the plan fits the
wave cap (e.g. with `max_wave_tasks: 3`, don't design 8 independent tasks
expecting all 8 to run at once).

## Procedure (defend against bad plans)

1. **Draft tasks** from the input, each a coherent unit one subagent can own.
2. **Ground declared_files** per the rule above (incl. test files).
3. **Right-size:** merge trivially-small dependency-bound tasks; split tasks
   doing two unrelated things; if two tasks share files, either merge or add a
   dependency so they serialize.
4. **Build depends_on explicitly**, then self-check the graph: any cycle? any
   task consuming another's output without a declared dep? any same-file pair
   missing a serializing dep?
5. **Show the plan ONCE** — tasks, files, deps — in plain terms. User approves
   or edits (task breakdown/approach only; scope is settled upstream, never
   re-litigated here).

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
