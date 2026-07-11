---
name: orc-execution
description: >
  Executor worker for ORC — the single-task implementer. Given one task slice
  (task_id, declared_files, constraints, spec_ref, log_digest), it implements
  EXACTLY that task within its declared files, honors every hard-rule constraint,
  creates/updates tests, emits milestone progress pings, and returns a strict
  contract (status done|failed|partial|needs_context, actual_files, log_entries,
  and claimed-vs-actual model/effort so the caller can catch a silent tier
  downgrade). Dispatched once per task in an execution wave, on the scored model
  pinned by its executor agent. Distinct from the review/verify/test-author
  workers — this one writes the implementation. ALWAYS a spawned subagent; the
  orchestrator never implements. Not for direct user invocation.
---

# orc-execution

One entry point: the orchestrator spawns a subagent via the Task tool,
prepending `subagent.md` framing + the input slice, which points to `core.md`.
`core.md` is the AUTHORITATIVE spec (full input slice, procedure, and return
contract); the summary below orients — on any conflict, `core.md` wins.

## What the worker does (summary)

1. Absorb `log_digest` (prior DECISIONs/INTERFACEs/ANSWERs bind you); read `spec_ref`.
2. Implement EXACTLY the task in the slice, touching only `declared_files[]`,
   honoring every `constraints[]` hard rule; create/update tests for what you build.
3. Emit milestone pings ({percent, files_written[], notes}) as you go.
4. Stay in your slice — need outside context? emit `needs_context`, don't fetch it.

## Return shape (summary — full contract in `core.md`)

`{ task_id, actual_model, actual_effort, status: done|failed|partial|needs_context,
actual_files[], log_entries[], failure_reason, progress, context_request,
pattern_version, invariants_checked }`

When the slice carries a `pattern`, MATCH its conventions and satisfy every BLOCKING
invariant; echo the `pattern_version` and set `invariants_checked: true` only after
re-checking your diff. A pattern task that returns false/absent here is malformed.

**Validation checkpoint before returning:** `status=failed` REQUIRES a
`failure_reason`; `needs_context` REQUIRES a `context_request` (capped at 2/task);
`actual_model` is quoted VERBATIM from your system prompt, never inferred. A
malformed return is treated as failure by the caller.
