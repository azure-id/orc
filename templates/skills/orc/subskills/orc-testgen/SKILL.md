---
name: orc-testgen
description: >
  Worker subskill for ORC's opt-in Phase 6.5 (Test Authoring). Fires when the user
  opts into writing tests ("write test cases", "generate tests", "author test
  cases for these changes"). Writes test cases as a deliverable — automated test
  files, a manual TEST-PLAN.md, and (for HTTP/API backends) a Postman-importable
  curl bundle. It NEVER runs tests and NEVER gates the ship; the user tests
  manually. ALWAYS invoked as a spawned subagent by the orchestrator. Not for
  direct user invocation.
---

# orc-testgen

A pointer. The orchestrator spawns `orc-test-author-opus-5-med` via the Task
tool, prepending `subagent.md` framing + the input slice. It WRITES test cases;
it never runs them and never gates the ship.

- **Input slice** (the orchestrator builds it): `core.md`.
- **Procedure + return contract** (the ONE source): the agent file,
  `.claude/agents/orc-test-author-opus-5-med.md`. The manual deliverables
  (TEST-PLAN.md + test-cases.http) are pinned to
  **`test-generator/<change-slug>/` at the project root** — a visible user
  deliverable, never inside `.claude/` or the run folder.
- **Validator** (the caller checks every return against it):
  `../../../_shared/return-validation.md`.

Fixed model: `orc-test-author-opus-5-med` (Opus 5.5 medium — authoring good
integration tests is a judgment task). Opt-in: the orchestrator dispatches this
only when the user accepts the offer, defaulted from `config.generate_tests`. The
full lane runs it as Phase 6.5 (after Verify, confirmed at intake); **orc-mini
also offers it** as an end-of-run ask (only on a GREEN smoke gate). Either lane,
it never runs tests and never gates the ship. orc-mini still skips full
review/verify.
