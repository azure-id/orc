# Phase — Mock example + drift recovery   (id: `mock-example`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Mock example + drift recovery (config `mock_example`)

Load `../../../_shared/drift-recovery.md` (canonical). Only after a GREEN Phase 6,
before ship: `ask` (default) → the offer is MANDATORY (never silently skipped,
never silently run); `on` → build; `off` → skip. Deliverable:
`mock-examples/<change-slug>/` at the project root (`EXAMPLE.md` + one minimal
runnable artifact; mocked inputs only) — **NEVER committed**. After the user
runs it, ONE question: matches expectation? [yes / drift: <describe>]. On
drift → `DRIFT-FROM` handoff → analyze-mini gap analysis → mini planner patch
plan → scored dispatch → re-verify → re-offer; **hard cap 2 loops**, then an
honest unresolved report. Emit `DRIFT loop=<n>` per loop; end-of-phase packet.

<!-- /orc:layer -->
