# Phase — Mock example + drift recovery   (id: `mock-example`)

> **Shared phase file** — read when the phase fires. A lane reads ONE layer: `full` (`/orc`) or `composed` (the `<!-- diy:when -->` variants `orc diy compile` stitches). `orc lane phases <lane> --json` names it.

<!-- orc:layer full -->

## Mock example + drift recovery (config `mock_example`)

Load `../drift-recovery.md` (canonical). Only after a GREEN Phase 6,
before ship: `ask` (default) → the offer (H `orc.phase-6-7.mock`) is MANDATORY (never silently skipped,
never silently run); `on` → build; `off` → skip. Deliverable:
`mock-examples/<change-slug>/` at the project root (`EXAMPLE.md` + one minimal
runnable artifact; mocked inputs only) — **NEVER committed**. After the user
runs it, ONE question: matches expectation? [yes / drift: <describe>]. On
drift → `DRIFT-FROM` handoff → analyze-mini gap analysis → mini planner patch
plan → scored dispatch → re-verify → re-offer; **hard cap 2 loops**, then an
honest unresolved report. Emit `DRIFT loop=<n>` per loop; end-of-phase packet.

<!-- /orc:layer -->

<!-- orc:layer composed -->

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

<!-- /orc:layer -->
