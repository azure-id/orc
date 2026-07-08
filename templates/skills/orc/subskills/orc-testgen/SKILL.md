---
name: orc-testgen
description: >
  Worker subskill for ORC's opt-in Phase 6.5 (Test Authoring). Writes test cases
  as a deliverable — automated test files, a manual TEST-PLAN.md, and (for
  HTTP/API backends) a Postman-importable curl bundle. It NEVER runs tests and
  NEVER gates the ship; the user tests manually. ALWAYS invoked as a spawned
  subagent by the orchestrator. Not for direct user invocation.
---

# orc-testgen

One entry point: spawned via the Task tool with `subagent.md` framing + the
slice, which points to `core.md`. Return contract lives in core.md only.

Fixed model: `orc-test-author-opus-4-8-high` (Opus 4.8 high — authoring good
integration tests is a judgment task). Full ORC lane only — orc-mini skips it
along with review/verify. Opt-in: the orchestrator dispatches this only when
`config.generate_tests` is on for the run (confirmed at intake).
