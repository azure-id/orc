## Phase: Review

<!-- diy:when review=off -->
Code review is DISABLED in this flow. Say so in the run summary line ("review
skipped by flow config") — never imply the work was reviewed.
<!-- /diy:when -->
<!-- diy:when review=on -->
Dispatch the reviewer exactly as the full lane does — follow the review half
of `.claude/skills/orc/subskills/orc-review-verify/SKILL.md` (reviewer agent
`orc-reviewer-opus-4-8-high`; findings ride the severity ladder from the
locked rules, blocking and advisory findings both surfaced).
<!-- /diy:when -->
<!-- diy:when review=blocking-only -->
Dispatch the reviewer exactly as the full lane does — follow the review half
of `.claude/skills/orc/subskills/orc-review-verify/SKILL.md` — but only
P0/P1 findings gate anything; P2/P3 findings are listed once in the summary
and never re-offered as fix-up tasks.
<!-- /diy:when -->
