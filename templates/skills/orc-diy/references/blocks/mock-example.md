## Phase: Mock example (after a green verify, before ship)

<!-- diy:when mock_example=off -->
The mock-example phase is DISABLED in this flow. Skip silently.
<!-- /diy:when -->
<!-- diy:when mock_example=ask -->
After the verify/smoke gate is GREEN and BEFORE any ship action, the offer is
MANDATORY (never silently skipped, never silently run): follow
`.claude/skills/_shared/drift-recovery.md` — build
`mock-examples/<change-slug>/` (EXAMPLE.md + one minimal runnable mocked
artifact) only on a yes. After the user runs it, ask the one drift question;
on drift run the `DRIFT-FROM` recovery loop (hard cap 2, then an honest
unresolved report). `mock-examples/` is NEVER staged by the ship phase.
<!-- /diy:when -->
<!-- diy:when mock_example=on -->
After the verify/smoke gate is GREEN and BEFORE any ship action, build the
mocked example without asking, per
`.claude/skills/_shared/drift-recovery.md`: `mock-examples/<change-slug>/`
(EXAMPLE.md + one minimal runnable mocked artifact; mocked inputs only). Then
ask the one drift question; on drift run the `DRIFT-FROM` recovery loop (hard
cap 2). `mock-examples/` is NEVER staged by the ship phase.
<!-- /diy:when -->
