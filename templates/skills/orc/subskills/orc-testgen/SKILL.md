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

One entry point: spawned via the Task tool with `subagent.md` framing + the
slice, which points to `core.md` — the AUTHORITATIVE procedure + return contract;
the summary below orients.

## What the worker does (summary)

1. Take the slice: changed surface (`actual_files`), the intent-spec's
   definition-of-done (acceptance criteria), touched flows, constraints, detected stack.
2. Write **automated test files** in the project's framework, covering the changed surface.
3. Write a manual **TEST-PLAN.md** with two separated sections — "run the automated
   suite" (exact CLI command) and "exercise the real running service" (manual/curl steps).
4. For an HTTP/API backend, write a Postman-importable **test-cases.http** curl bundle
   (env-var placeholders — never real secrets).
5. Run NOTHING. Advisory `notes[]` may flag a case the code likely won't satisfy.

**Validation checkpoint before returning:** confirm each promised deliverable
actually exists on disk (test files, TEST-PLAN.md, and test-cases.http when the
stack exposes HTTP) before emitting the return contract in `core.md`.

Fixed model: `orc-test-author-opus-4-8-high` (Opus 4.8 high — authoring good
integration tests is a judgment task). Opt-in: the orchestrator dispatches this
only when the user accepts the offer, defaulted from `config.generate_tests`. The
full lane runs it as Phase 6.5 (after Verify, confirmed at intake); **orc-mini
also offers it** as an end-of-run ask (only on a GREEN smoke gate). Either lane,
it never runs tests and never gates the ship. orc-mini still skips full
review/verify.
