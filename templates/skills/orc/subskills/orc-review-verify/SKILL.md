---
name: orc-review-verify
description: >
  Review/verify worker for ORC Phases 5–6 (Opus 5 medium). Two modes: a REVIEW
  pass — examine the changed files against the code pattern + constraints,
  create/update tests, and classify EVERY finding on the P0–P3 severity
  ladder (P0/P1 gate ship, P2/P3 advisory); a VERIFY
  pass — run the build + full test suite and check each intent-spec
  definition-of-done criterion PLUS the pattern's enforceable validation-gate
  lines, reporting pass/fail; or an opt-in SECURITY pass — sweep the changed
  files against a supplied OWASP/STRIDE checklist. Returns findings[] with
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
  create/update tests for the changed surface; independently re-check each
  `invariants[]` rule AND each enforceable `validation_gate[]` line against the
  diff (a violation is P0), plus any `fe_rules[]` pack rules on FE diffs
  (file:line findings, P1–P3 by impact, never auto-P0); classify EVERY
  finding on the ladder — **P0** (failing tests/build, unmet acceptance
  criteria, runtime errors, invariant violations — caller auto-fixes, no ask),
  **P1** (correctness/security risk, constraint violations — caller asks the
  user before fixing), **P2** (maintainability — advisory fix-batch offer),
  **P3** (cosmetic — advisory, counted). Never fix P2/P3; P0/P1 fixes are the
  caller's call. **Evidence-or-advisory:** every P0–P2 finding carries
  `file:line` + the offending line(s) quoted VERBATIM; an unanchored finding is
  AUTO-P3 (never gates, never triggers a fix) — the caller spot-checks quotes
  before acting on P0/P1.
- **phase=verify (two halves, v0.33.0):** FIRST the **TDD gate** — run the
  plan's TDD suite (`tdd_suite[]` in the slice) plus the build + full test
  suite; green is the definition-of-done for non-exempt requirements, and each
  red TDD test is a P0 tied to its requirement (the caller owns the
  `tdd_loop_max` repair loop). THEN the **adversarial review** — attack the
  green implementation: edge cases the spec missed, error paths, contract
  violations, race/ordering, workflow breaks (dead wiring, broken commands) —
  findings on the same P0–P3 ladder. Also fold the enforceable
  `validation_gate[]` lines into the criteria set, then check EACH criterion
  individually (pass/fail, nothing invented; an unmet gate line = unmet
  criterion = P0), each with per-criterion `evidence` (the test/output line or
  file:line that proves it); report failures precisely. You don't fix — the
  caller owns the auto-fix-once loop.
- **phase=security (opt-in):** sweep only `changed_files[]` against the supplied
  `security_checklist[]` (wrap Semgrep if installed, never install it); findings
  on the same ladder (exploitable-in-diff = P0, hardening gap = P1,
  defense-in-depth = P2/P3). Report-only, no `result` verdict.

## Return shape (summary — full contract in `core.md`)

`{ phase, findings[]{severity: P0|P1|P2|P3, location "file:line", quote (verbatim,
required P0–P2; unanchored ⇒ AUTO-P3), description, criterion},
criteria[] (verify only){criterion, result, evidence}, tests{added,updated,passing},
result (verify only): passed|failed, actual_model, actual_effort, failure_reason }`

**Validation checkpoint before returning:** every finding carries a `severity`
from the P0–P3 ladder; every P0–P2 finding carries `file:line` + a VERBATIM
`quote` (else downgrade it to P3 yourself);
verify sets `result` + per-criterion `evidence`; `actual_model` is quoted
VERBATIM (never inferred). A
malformed return is treated as failure by the caller.

Fixed models (from `../../references/effort-and-mode.md`): review on the OpenSpec/self
path = Opus 5 medium; review on the Superpowers path is delegated to the
Superpowers review skill instead (Sonnet 4.6 medium). Verify = Opus 5 medium,
always this subskill.
