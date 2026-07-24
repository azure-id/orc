# orc-review-verify — Core (mode-neutral)

## Input slice

- phase: review | verify | security
- acceptance_criteria[]   — the intent-spec's definition-of-done, verbatim
                            (verify checks EXACTLY these; nothing invented)
- code_pattern            — resolved/user-provided style guide, or null (review bare)
- invariants[]            — BLOCKING code-pattern rules to re-check, or empty
                            (a violation is a P0 finding)
- validation_gate[]       — the pattern's enforceable acceptance checks (already
                            measurability-filtered at reconciliation), or empty.
                            Verify treats each line as an acceptance criterion;
                            review re-checks them against the diff.
- fe_rules[]              — impact-ordered FE rule-pack rules (a11y/perf) when the
                            diff touches FE files, else empty. Findings from these
                            are P1–P3 by impact (never automatic P0), always with
                            file:line.
- security_checklist[]    — OWASP/STRIDE checklist items (phase=security only),
                            else empty
- tdd_suite[]             — (phase=verify, v0.33.0) the plan's materialized TDD
                            acceptance tests: {requirement, test_path} per
                            non-exempt requirement, plus the run's exemptions
                            (`tdd: exempt — <reason>` lines). Empty on a
                            whole-run exemption or a pre-v0.33.0 plan.
- changed_files[]         — the surface to examine
- constraints[]           — intent-spec hard rules (a violation is a P1 finding)
- model, effort           — informational

## Review procedure (phase=review)

1. Examine changed_files against code_pattern (if given) and constraints.
2. Create/update test files and test cases for the changed surface.
3. Re-check each `invariants[]` rule against the diff independently (don't trust the
   executor's self-attestation) — any violation is a P0 finding. Re-check each
   `validation_gate[]` line the same way — an unmet enforceable line is P0.
4. Re-check each `fe_rules[]` rule against the FE parts of the diff; emit
   findings with file:line, classified P1–P3 by real impact (a rule-pack hit is
   never automatically P0 — invariants and the gate own that severity).
5. **Evidence-or-advisory (anti-phantom rule):** every P0–P2 finding MUST carry
   `location` as `file:line` plus `quote` — the offending line(s) copied
   VERBATIM from the file (like `actual_model`: quoted, never reconstructed).
   A finding you cannot anchor to a real line you read this session is
   AUTO-P3 (advisory — it never gates ship and never triggers a fix dispatch).
   The caller spot-checks quotes before acting on P0/P1.
6. Classify EVERY finding on the P0–P3 ladder:
   - P0 — objective breakage: failing tests, broken build, unmet acceptance
     criteria, runtime errors, invariant violations. Gates ship; the caller
     auto-fixes immediately (no ask).
   - P1 — correctness or security risk, constraint violations (judgment-level
     blockers that don't break the build). Gates ship; the caller asks the user
     before fixing.
   - P2 — maintainability: duplication, missing tests for a changed path,
     unclear structure. Advisory; itemized in the summary as an optional fix-batch.
   - P3 — cosmetic: naming, formatting, length, style. Advisory; counted only.
7. Never fix P2/P3. P0/P1 fixes are the caller's decision, not yours.

## Verify procedure (phase=verify — two halves, v0.33.0)

**Half 1 — TDD gate (deterministic):**
1. Run the build and full test suite — INCLUDING every `tdd_suite[]` test.
2. Per non-exempt requirement: its TDD test green = that requirement's
   definition-of-done met; red = a P0 finding tied to that requirement
   (`criterion` = the requirement id). Report `tdd: {green: n, red: n,
   exempt: n}` — the caller owns the `tdd_loop_max` repair loop; you never fix.
   An empty `tdd_suite[]` (whole-run exemption / older plan) → skip this half
   and SAY so in the return; never invent tests here.

**Half 2 — adversarial review (attack the green implementation):**
3. Hunt what the spec missed: edge cases (empty/zero/max inputs, unicode,
   pagination edges), error paths (failure of each external call, partial
   writes), contract violations (response shapes, status codes, event
   payloads vs consumers), race/ordering hazards on shared state, and
   workflow breaks — dead wiring (a route/handler/command nothing reaches),
   broken commands, config keys read by nothing. Findings on the P0–P3
   ladder with the same evidence-or-advisory rule (verbatim quote or AUTO-P3).

**Criteria sweep (unchanged):**
4. Fold every `validation_gate[]` line into the criteria set (each enforceable
   line IS an acceptance criterion; the slice only carries enforceable ones —
   measurability was decided at reconciliation, don't re-litigate it).
5. Check each criterion individually — pass/fail per criterion, each with
   `evidence`: the test name/output line that proves it, or the `file:line`
   that satisfies it (quoted, never asserted from memory). An unmet gate
   line is an unmet criterion (P0).
6. Report failures precisely (which criterion, what observed). You do not fix;
   the caller owns the auto-fix-once loop.

## Security procedure (phase=security — opt-in, config `security_review`)

1. Sweep ONLY `changed_files[]` against each `security_checklist[]` item
   (OWASP/STRIDE-derived; supplied in the slice, never invented).
2. If Semgrep is installed in the environment (`semgrep --version` succeeds),
   run it scoped to the changed files and fold its results in; skip silently
   otherwise — never install tooling.
3. Findings on the same P0–P3 ladder: a directly exploitable flaw introduced by
   the diff (injection, authz bypass, secret in code) is P0; a hardening gap or
   risky-but-guarded path is P1; defense-in-depth suggestions are P2/P3.
4. Report only; you never fix. Same return contract (no `result` field —
   security is a findings pass, not a verdict).

## Return contract (emit EXACTLY this)

- phase
- findings[]: { severity: P0|P1|P2|P3, location ("file:line" — REQUIRED for
               P0–P2), quote (offending line(s) VERBATIM — REQUIRED for P0–P2;
               missing/unanchored ⇒ the finding is AUTO-P3), description,
               criterion|null }
- criteria[] (verify only): { criterion, result: pass|fail, evidence — the test
               name/output line or file:line that proves it }
- tdd (verify only): { green: int, red: int, exempt: int } — the TDD-gate tally
               (omit only when the slice carried no tdd_suite[])
- tests: { added: int, updated: int, passing: "x/y" }
- result (verify only): passed | failed
- actual_model — the model id quoted VERBATIM from your system prompt ("The exact
                 model ID is …"); NEVER inferred; `unknown` if absent
- actual_effort — the value of $CLAUDE_EFFORT (read via Bash)
- failure_reason — required if the pass itself could not run; else null

Malformed returns are treated as failure by the caller.
