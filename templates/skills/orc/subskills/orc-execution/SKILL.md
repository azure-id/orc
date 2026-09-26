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

A pointer. The orchestrator spawns the scored executor agent via the Task tool,
prepending `subagent.md` framing + the input slice. The orchestrator never
implements.

- **Input slice** (the orchestrator builds it): `core.md`.
- **Procedure + return contract** (the ONE source): the executor agent file,
  `.claude/agents/orc-executor-*.md`.
- **Validator** (the caller checks every return against it):
  `../../../_shared/return-validation.md`. A malformed return is treated as
  failure by the caller.
