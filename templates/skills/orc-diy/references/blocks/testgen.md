## Phase: Test authoring

<!-- diy:when testgen=off -->
Test authoring is OFF in this flow — skip silently.
<!-- /diy:when -->
<!-- diy:when testgen=ask -->
After verify (or after execution when verify is off), offer test authoring
once; on yes, run the full lane's Phase 6.5 via
`.claude/skills/orc/subskills/orc-testgen/SKILL.md` — it WRITES test cases
and a test plan, never runs them, and never gates the ship.
<!-- /diy:when -->
<!-- diy:when testgen=on -->
After verify (or after execution when verify is off), run the full lane's
Phase 6.5 without asking via
`.claude/skills/orc/subskills/orc-testgen/SKILL.md` — it WRITES test cases
and a test plan, never runs them, and never gates the ship.
<!-- /diy:when -->
