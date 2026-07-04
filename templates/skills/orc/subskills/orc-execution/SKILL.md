---
name: orc-execution
description: >
  Worker subskill for ORC. Performs exactly one task from a slice
  and emits a strict return structure. ALWAYS invoked as a spawned subagent by
  the orchestrator (the orchestrator never implements). Not for direct user
  invocation.
---

# orc-execution

One entry point: the orchestrator spawns a subagent via the Task tool,
prepending `subagent.md` framing + the input slice, which points to `core.md`.

The RETURN CONTRACT lives in core.md ONLY. The wrapper adds framing but never
redefines what is emitted.
