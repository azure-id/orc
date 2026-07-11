# orc-review-verify — Core (mode-neutral)

## Input slice

- phase: review | verify
- acceptance_criteria[]   — the intent-spec's definition-of-done, verbatim
                            (verify checks EXACTLY these; nothing invented)
- code_pattern            — resolved/user-provided style guide, or null (review bare)
- invariants[]            — BLOCKING code-pattern rules to re-check, or empty
                            (a violation is a P0 finding)
- changed_files[]         — the surface to examine
- constraints[]           — intent-spec hard rules (a violation is a P1 finding)
- model, effort           — informational

## Review procedure (phase=review)

1. Examine changed_files against code_pattern (if given) and constraints.
2. Create/update test files and test cases for the changed surface.
3. Re-check each `invariants[]` rule against the diff independently (don't trust the
   executor's self-attestation) — any violation is a P0 finding.
4. Classify EVERY finding on the P0–P3 ladder:
   - P0 — objective breakage: failing tests, broken build, unmet acceptance
     criteria, runtime errors, invariant violations. Gates ship; the caller
     auto-fixes immediately (no ask).
   - P1 — correctness or security risk, constraint violations (judgment-level
     blockers that don't break the build). Gates ship; the caller asks the user
     before fixing.
   - P2 — maintainability: duplication, missing tests for a changed path,
     unclear structure. Advisory; itemized in the summary as an optional fix-batch.
   - P3 — cosmetic: naming, formatting, length, style. Advisory; counted only.
5. Never fix P2/P3. P0/P1 fixes are the caller's decision, not yours.

## Verify procedure (phase=verify)

1. Run the build and full test suite.
2. Check each acceptance criterion individually — pass/fail per criterion.
3. Report failures precisely (which criterion, what observed). You do not fix;
   the caller owns the auto-fix-once loop.

## Return contract (emit EXACTLY this)

- phase
- findings[]: { severity: P0|P1|P2|P3, location, description, criterion|null }
- tests: { added: int, updated: int, passing: "x/y" }
- result (verify only): passed | failed
- actual_model — the model id quoted VERBATIM from your system prompt ("The exact
                 model ID is …"); NEVER inferred; `unknown` if absent
- actual_effort — the value of $CLAUDE_EFFORT (read via Bash)
- failure_reason — required if the pass itself could not run; else null

Malformed returns are treated as failure by the caller.
