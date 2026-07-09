---
name: orc-review-verify
description: >
  Review/verify worker for ORC Phases 5–6 (Opus 4.8 high). Two modes: a REVIEW
  pass — examine the changed files against the code pattern + constraints,
  create/update tests, and classify EVERY finding blocking vs nit; or a VERIFY
  pass — run the build + full test suite and check each intent-spec
  definition-of-done criterion, reporting pass/fail. Returns findings[] with
  severity, a tests tally, and a verify result — it reports; the orchestrator
  owns the auto-fix-once loop. Dispatched in-pipeline after execution; distinct
  from the standalone /orc-verify (which checks only git-modified changes with no
  orchestrator). ALWAYS a spawned subagent — not for direct user invocation.
---

# orc-review-verify

One entry point: spawned via the Task tool with `subagent.md` framing + the
slice, which points to `core.md`. `core.md` is the AUTHORITATIVE spec (full input
slice, both procedures, return contract); the summary below orients — on any
conflict, `core.md` wins.

## What the worker does (summary)

- **phase=review:** examine `changed_files[]` against `code_pattern` + `constraints[]`;
  create/update tests for the changed surface; classify EVERY finding **blocking**
  (failing tests/build, unmet acceptance criteria, constraint violations) vs **nit**
  (cosmetic). Never fix nits; blocking fixes are the caller's call.
- **phase=verify:** run the build + full test suite; check EACH
  `acceptance_criteria[]` item individually (pass/fail, nothing invented); report
  failures precisely. You don't fix — the caller owns the auto-fix-once loop.

## Return shape (summary — full contract in `core.md`)

`{ phase, findings[]{severity,location,description,criterion}, tests{added,updated,passing},
result (verify only): passed|failed, actual_model, actual_effort, failure_reason }`

**Validation checkpoint before returning:** every finding carries a `severity`;
verify sets `result`; `actual_model` is quoted VERBATIM (never inferred). A
malformed return is treated as failure by the caller.

Fixed models (from `../../references/effort-and-mode.md`): review on the OpenSpec/self
path = Opus 4.8 high; review on the Superpowers path is delegated to the
Superpowers review skill instead (Sonnet 4.6 medium). Verify = Opus 4.8 high,
always this subskill.
