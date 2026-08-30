# Phase — Mock example + drift recovery   (id: `mock-example`)

> **Shared phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12, and into
> this library at W13 when `orc-diy` became its second reader. A spine is loaded
> IN FULL when its skill activates; this is loaded when the phase fires, and most
> runs skip most phases.
>
> **Two layers, and a lane reads exactly one.** `full` is `/orc`'s procedure.
> `composed` is what `orc diy compile` stitches — the same phase expressed as
> `<!-- diy:when -->` variants over a composed flow, NOT a second copy of the
> procedure. Reading the wrong one is the failure `README.md` names: a lane
> doing a phase its product promise says it does differently.
> `orc lane phases <lane> --json` names the layer for each lane.

<!-- orc:layer full -->

## Mock example + drift recovery (config `mock_example`)

Load `../drift-recovery.md` (canonical). Only after a GREEN Phase 6,
before ship: `ask` (default) → the offer is MANDATORY (never silently skipped,
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
