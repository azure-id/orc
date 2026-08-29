# Phase — Test authoring (opt-in)   (id: `testgen`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Test Authoring (opt-in; load ../../subskills/orc-testgen/)

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
