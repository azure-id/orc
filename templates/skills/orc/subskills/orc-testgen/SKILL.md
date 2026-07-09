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
integration tests is a judgment task). Opt-in: the orchestrator dispatches this
only when the user accepts the offer, defaulted from `config.generate_tests`. The
full lane runs it as Phase 6.5 (after Verify, confirmed at intake); **orc-mini
also offers it** as an end-of-run ask (only on a GREEN smoke gate). Either lane,
it never runs tests and never gates the ship. orc-mini still skips full
review/verify.
