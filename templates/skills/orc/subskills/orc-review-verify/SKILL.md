---
name: orc-review-verify
description: >
  Worker subskill for ORC Phases 5-6. Runs a code review pass
  (blocking vs nit classification, test creation/update) or a verify pass
  (acceptance criteria from the intent-spec's definition-of-done). ALWAYS
  invoked as a spawned subagent by the orchestrator. Not for direct user
  invocation.
---

# orc-review-verify

One entry point: spawned via the Task tool with `subagent.md` framing + the
slice, which points to `core.md`. Return contract lives in core.md only.

Fixed models (from references/effort-and-mode.md): review on the OpenSpec/self
path = Opus 4.8 high; review on the Superpowers path is delegated to the
Superpowers review skill instead (Sonnet 4.6 medium). Verify = Opus 4.8 high,
always this subskill.
