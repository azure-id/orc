# orc-review-verify — Core (mode-neutral)

## Input slice

- phase: review | verify
- acceptance_criteria[]   — the intent-spec's definition-of-done, verbatim
                            (verify checks EXACTLY these; nothing invented)
- code_pattern            — user-provided style guide, or null (review bare)
- changed_files[]         — the surface to examine
- constraints[]           — intent-spec hard rules (violations are BLOCKING)
- model, effort           — informational

## Review procedure (phase=review)

1. Examine changed_files against code_pattern (if given) and constraints.
2. Create/update test files and test cases for the changed surface.
3. Classify EVERY finding:
   - blocking: failing tests, broken build, unmet acceptance criteria,
     runtime errors, constraint violations
   - nit: naming, formatting, length, style — anything cosmetic
4. Never fix nits. Blocking fixes are the caller's decision, not yours.

## Verify procedure (phase=verify)

1. Run the build and full test suite.
2. Check each acceptance criterion individually — pass/fail per criterion.
3. Report failures precisely (which criterion, what observed). You do not fix;
   the caller owns the auto-fix-once loop.

## Return contract (emit EXACTLY this)

- phase
- findings[]: { severity: blocking|nit, location, description, criterion|null }
- tests: { added: int, updated: int, passing: "x/y" }
- result (verify only): passed | failed
- actual_model — the model id quoted VERBATIM from your system prompt ("The exact
                 model ID is …"); NEVER inferred; `unknown` if absent
- actual_effort — the value of $CLAUDE_EFFORT (read via Bash)
- failure_reason — required if the pass itself could not run; else null

Malformed returns are treated as failure by the caller.
