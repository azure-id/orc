# Phase — Verify — TDD gate + adversarial review   (id: `verify`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Verify: TDD gate + adversarial review (same subskill, phase=verify)

Emit `PHASE verify start`. TWO halves in the SAME dispatched verifier slot
(../../subskills/orc-review-verify/ — Phase 5's reviewer stays separate):
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
