# Phase — Review   (id: `review`)

> **Shared phase file** — read when the phase fires. A lane reads ONE layer: `full` (`/orc`) or `composed` (the `<!-- diy:when -->` variants `orc diy compile` stitches). `orc lane phases <lane> --json` names it.

<!-- orc:layer full -->

## Review (load ../../orc/subskills/orc-review-verify/, spawned)

Emit `PHASE review start`. **Build the slice from `../review-slice.md`** — its
§1 free check FIRST, then its §2 fields (with the graph on, `graph_changes` keeps
its rows: no `--brief` here). Superpowers path: its review skill incl. tests
(Sonnet 4.6 medium), then `../review-slice.md` §3 on its findings — no second
dispatch. OpenSpec/self path: review worker (Opus 5.5 medium). Pass the resolved
`code_pattern` + its invariants + gate lines for the re-check
(pattern-gate.md); no resolved pattern → FIRST ask for one (paste/md/none) (H `orc.phase-5.pattern-missing`).
FE tasks in run → pass `fe_rules[]` from `../../orc-pattern/references/` fe-a11y
+ fe-perf. Findings arrive on the **P0–P3 ladder** (invariant violation or
unmet gate line = P0; every P0–P2 carries `file:line` + VERBATIM `quote`;
unanchored → P3). Run `../review-slice.md` §3 (the after-filter) on the return.
**Disprove pass (R6, `/orc` and `/orc-ultra` ONLY):** a P0 or P1 left → dispatch
the SAME reviewer with `mode: disprove`, only those findings + their files; a
`keep: false` verdict → P3 with its `why`. Then apply hard rule 5 INCLUDING the
quote spot-check, per `group`: P0 →
auto-fix once · P1 → ask, then fix once · P2/P3 → record for Phase 7.
**Re-review (R9):** after a P0/P1 fix, dispatch the reviewer once more with
`previous_findings[]` (each with its outcome). It may raise a NEW finding only
on a line the fix changed. Its `gotcha_recorded` body → `orc gotcha add -`. Emit
`FINDING p0=<n> p1=<n> p2=<n> p3=<n> pre=<n> suppressed=<n> folded=<n>` on the
return (the tail = the §3 buckets), then `PHASE review end`. Outcomes: Phase 7.

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
locked rules, blocking and advisory findings both surfaced). Build its slice
from `.claude/skills/_shared/review-slice.md` (§1 free check, §3 after-filter).
<!-- /diy:when -->
<!-- diy:when review=blocking-only -->
Dispatch the reviewer exactly as the full lane does — follow the review half
of `.claude/skills/orc/subskills/orc-review-verify/SKILL.md`, with the slice
of `.claude/skills/_shared/review-slice.md` — but only
P0/P1 findings gate anything; P2/P3 findings are listed once in the summary
and never re-offered as fix-up tasks.
<!-- /diy:when -->
<!-- diy:when code_graph=on -->
With the code graph on, the reviewer also gets the callers from
`orc graph changes --if-enabled --json` — an unchanged caller of a
changed signature is a finding candidate (`.claude/skills/_shared/code-graph.md` §7).
<!-- /diy:when -->

<!-- /orc:layer -->
