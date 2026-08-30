# Phase — Test authoring (opt-in)   (id: `testgen`)

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

## Test Authoring (opt-in; load ../../orc/subskills/orc-testgen/)

Only when `config.generate_tests` is on (confirmed at intake). ORC **writes**
test cases and **runs nothing** — never gates the ship. Dispatch
`orc-test-author-opus-5-med` (run's `actual_files`, definition-of-done,
touched flows, constraints, stack); it returns test files + a `TEST-PLAN.md` + a
Postman-importable `test-cases.http` (HTTP APIs), the two manual deliverables
written to **`test-generator/<change-slug>/` at the project root**. Validate the
returned `test_plan_path`/`curl_bundle_path` are under that folder (else
malformed → re-dispatch); state the exact path in the summary — discoverability
is the point.

<!-- /orc:layer -->

<!-- orc:layer composed -->

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

<!-- /orc:layer -->
