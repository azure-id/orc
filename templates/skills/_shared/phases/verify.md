# Phase — Verify — TDD gate + adversarial review   (id: `verify`)

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

## Verify: TDD gate + adversarial review (same subskill, phase=verify)

Emit `PHASE verify start`. TWO halves in the SAME dispatched verifier slot
(../../orc/subskills/orc-review-verify/ — Phase 5's reviewer stays separate):
**1) TDD gate (deterministic):** run the plan's TDD suite — green IS the
definition-of-done for non-exempt requirements; red → repair loop (implement→
test→repair, cap `tdd_loop_max`; cap hit → STOP SEQUENCE + honest red report).
**2) Adversarial review:** attack the green implementation — edge cases the
spec missed, error paths, contract violations, race/ordering, workflow breaks
(dead wiring, broken commands) — findings on the existing P0–P3 ladder. The
verifier also checks the intent-spec's
definition-of-done PLUS the pattern's `validation_gate[]` lines (each a
criterion; unmet = P0). The return carries `criteria[]` {criterion, pass|fail,
evidence} — every criterion needs evidence. Quote spot-check P0/P1 first, then:
P0 → auto-fix once → re-verify once → second failure STOPS; P1 → ask before the
one fix attempt, then re-verify (same single-retry cap).
**Pact recheck (`pact_recheck_on_verify`, default true; emit `PACT recheck`):**
after GREEN, run `orc pact check` scoped to the promises whose anchors intersect
this run's CHANGED files. A promise that flips to BROKEN is a **P1 finding with its
check output** — reported, never an automatic abort: the ledger may simply have
outgrown the code, and that is the user's call. Emit
`VERDICT pass|fail :: <detail>`, then `PHASE verify end`.

<!-- /orc:layer -->

<!-- orc:layer composed -->

## Phase: Verify

<!-- diy:when verify=off -->
Verification is DISABLED in this flow. The build+test evidence in each
executor return is the only green signal; say "verify skipped by flow
config" in the summary. Never claim criteria were verified.
<!-- /diy:when -->
<!-- diy:when verify=smoke -->
Run a SMOKE verify only: dispatch the verifier
(`orc-verifier-opus-5-med`) with an explicitly narrowed scope — build +
full test suite, red/green verdict, NO per-criterion definition-of-done
sweep. Red blocks ship exactly as a full verify would.
<!-- /diy:when -->
<!-- diy:when verify=full -->
Dispatch verification exactly as the full lane does — follow the verify half
of `.claude/skills/orc/subskills/orc-review-verify/SKILL.md` (build + tests +
every acceptance criterion checked against the definition of done).
<!-- /diy:when -->
<!-- diy:when tdd=on -->
TDD gate (rides the verify slot): the verifier slice carries the plan's
`tdd_suite[]`; green is the definition-of-done for non-exempt requirements,
red → the repair loop capped at `tdd_loop_max` (cap hit → STOP + honest red
report). The adversarial half of the verify pass applies as the full lane
defines it.
<!-- /diy:when -->

<!-- /orc:layer -->
