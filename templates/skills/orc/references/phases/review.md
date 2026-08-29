# Phase — Review   (id: `review`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Review (load ../../subskills/orc-review-verify/, spawned)

Emit `PHASE review start`. Superpowers path: its review skill incl. tests
(Sonnet 4.6 medium). OpenSpec/self path: review worker (Opus 5 medium). Pass the resolved
`code_pattern` + its invariants + gate lines for the re-check
(pattern-gate.md); no resolved pattern → FIRST ask for one (paste/md/none).
FE tasks in run → pass `fe_rules[]` from `../../../orc-pattern/references/` fe-a11y
+ fe-perf. Findings arrive on the **P0–P3 ladder** (invariant violation or
unmet gate line = P0; every P0–P2 carries `file:line` + VERBATIM `quote`;
unanchored → P3). Apply hard rule 5 INCLUDING the quote spot-check: P0 →
auto-fix once · P1 → ask, then fix once · P2/P3 → record for Phase 7. Emit
`FINDING p0=<n> p1=<n> p2=<n> p3=<n>` on the return, then `PHASE review end`.

<!-- /orc:layer -->
