# Phase — Review   (id: `review`)

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

## Review (load ../../orc/subskills/orc-review-verify/, spawned)

Emit `PHASE review start`. Superpowers path: its review skill incl. tests
(Sonnet 4.6 medium). OpenSpec/self path: review worker (Opus 5 medium). Pass the resolved
`code_pattern` + its invariants + gate lines for the re-check
(pattern-gate.md); no resolved pattern → FIRST ask for one (paste/md/none).
FE tasks in run → pass `fe_rules[]` from `../../orc-pattern/references/` fe-a11y
+ fe-perf. Findings arrive on the **P0–P3 ladder** (invariant violation or
unmet gate line = P0; every P0–P2 carries `file:line` + VERBATIM `quote`;
unanchored → P3). Apply hard rule 5 INCLUDING the quote spot-check: P0 →
auto-fix once · P1 → ask, then fix once · P2/P3 → record for Phase 7. Emit
`FINDING p0=<n> p1=<n> p2=<n> p3=<n>` on the return, then `PHASE review end`.

<!-- /orc:layer -->

<!-- orc:layer composed -->

## Phase: Review

<!-- diy:when review=off -->
Code review is DISABLED in this flow. Say so in the run summary line ("review
skipped by flow config") — never imply the work was reviewed.
<!-- /diy:when -->
<!-- diy:when review=on -->
Dispatch the reviewer exactly as the full lane does — follow the review half
of `.claude/skills/orc/subskills/orc-review-verify/SKILL.md` (reviewer agent
`orc-reviewer-opus-5-med`; findings ride the severity ladder from the
locked rules, blocking and advisory findings both surfaced).
<!-- /diy:when -->
<!-- diy:when review=blocking-only -->
Dispatch the reviewer exactly as the full lane does — follow the review half
of `.claude/skills/orc/subskills/orc-review-verify/SKILL.md` — but only
P0/P1 findings gate anything; P2/P3 findings are listed once in the summary
and never re-offered as fix-up tasks.
<!-- /diy:when -->

<!-- /orc:layer -->
