## Phase: Planning

<!-- diy:when planning=auto -->
Route planning exactly as the full lane does — Superpowers plan, OpenSpec
change, or ORC's own planner, chosen by what exists in the project. Follow
`.claude/skills/orc/subskills/orc-planner/SKILL.md` for the own-planner path
and validate the planning output against
`.claude/skills/orc/schemas/planning-output.md`.
<!-- /diy:when -->
<!-- diy:when planning=own-planner -->
Always use ORC's own Requirement Planner, even when Superpowers/OpenSpec
artifacts exist: follow `.claude/skills/orc/subskills/orc-planner/SKILL.md`
and validate the planning output against
`.claude/skills/orc/schemas/planning-output.md`.
<!-- /diy:when -->
<!-- diy:when planning=superpowers -->
Plan via Superpowers: require a Superpowers-written plan as planning input
(ask the user to produce one if absent), then convert it to ORC planning
output validated against `.claude/skills/orc/schemas/planning-output.md` —
same conversion the full lane applies on its Superpowers route.
<!-- /diy:when -->
<!-- diy:when planning=openspec -->
Plan via OpenSpec: require an OpenSpec change as planning input (ask the user
to produce one if absent), then convert it to ORC planning output validated
against `.claude/skills/orc/schemas/planning-output.md` — same conversion the
full lane applies on its OpenSpec route.
<!-- /diy:when -->
<!-- diy:when tdd=on -->
TDD is ON for this flow: the plan must carry a `tdd_spec` per requirement
(given/when/then + a runnable skeleton in the project's test framework, or
`tdd: exempt — <reason>`; schema in
`.claude/skills/orc/schemas/planning-output.md`). No test runner in the
project → whole-run exemption, stated once at preflight.
<!-- /diy:when -->
