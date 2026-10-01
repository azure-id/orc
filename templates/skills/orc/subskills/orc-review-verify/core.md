# orc-review-verify — Core (the input slice)

The INPUT SLICE the orchestrator builds for ONE review, verify or security
dispatch. The procedure and the return contract live in ONE place, the agent
file: `phase=review` and `phase=security` → `.claude/agents/orc-reviewer-opus-5-low.md`;
`phase=verify` → `.claude/agents/orc-verifier-opus-5-med.md`. The caller owns
the auto-fix-once loop and the `tdd_loop_max` repair loop, and validates the
return against `../../../_shared/return-validation.md`.

## Input slice

Canonical shape + how to build it: `../../../_shared/review-slice.md` (read it at
the dispatch). The verifier gets the same `gotcha_card` + `tool_findings[]`.

Slice fields: changed_files[] · diff_ranges[] · acceptance_criteria[] · constraints[] · code_pattern · invariants[] · validation_gate[] · fe_rules[] · security_checklist[] · graph_changes · tool_findings[] · gotcha_card · rules_card · previous_findings[] · mode

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
- gotcha_card             — the gotcha card's `text` (slice §2), or null (no
                            match is the normal case). ALWAYS built when anything
                            matches. A CHECKLIST, not a rule set: a confirmed hit
                            is a normal finding, never an automatic P0.
- tool_findings[]         — the free check's lines on changed files (never
                            re-reported), or empty
- diff_ranges[], rules_card, graph_changes, previous_findings[] (re-review
  only), mode (review · disprove · security) — as the canonical slice defines them
- changed_files[]         — the surface to examine
- constraints[]           — intent-spec hard rules (a violation is a P1 finding)
- model, effort           — informational

The P0–P3 ladder and the AUTO-P3 evidence rule (an unanchored finding never
gates) are defined in the agent files. Malformed returns are treated as failure
by the caller.
