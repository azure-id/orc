# orc-testgen — Core (mode-neutral)

A procedure specification: inputs, steps, outputs. Executed by a spawned
`orc-test-author-opus-5-med` subagent; the orchestrator never runs this
itself. **Authoring only — RUN NOTHING, GATE NOTHING.** The user tests manually.

## Input slice (you receive exactly this)

- changed_files[]        — the surface the change touched (from the run's actual_files)
- acceptance_criteria[]  — the intent-spec's definition-of-done (the "new behaviour")
- touched_flows[]        — user journeys through the changed code (may be empty)
- constraints[]          — intent-spec hard rules
- stack                  — {language, test_framework, is_http_api}; detect if absent
- test_types[]           — subset of {new_behaviour, flow, change, regression}; default all
- output_conventions     — where tests live in this repo

## Procedure

1. Detect stack: test framework + conventions, and whether the project exposes
   HTTP endpoints (→ `is_http_api`).
2. Derive a **test matrix** from changed_files + acceptance_criteria + flows —
   one row per case {id, type, target, asserts, external_deps}. Bound regression
   to the diff's blast radius; never test the whole app.
3. Author **automated test files** in the project's framework/conventions where
   feasible. Match existing test style. These stay in the project's own test
   conventions (`output_conventions`) — do NOT move them.
4. **Pin the manual-QA output folder.** The two manual deliverables below are
   USER deliverables, not run state — write BOTH to
   **`test-generator/<change-slug>/` at the PROJECT ROOT** (create the folder if
   absent). `<change-slug>` = the run's existing kebab-case run-folder slug (e.g.
   `post-users`). NEVER write them inside `.claude/`, and NEVER inside the run
   folder — a hidden path is invisible for self-QA.
5. Write **`test-generator/<change-slug>/TEST-PLAN.md`** (manual cases: scenario,
   setup, steps, expected) with two CLEARLY SEPARATED sections:
   - "Run the automated test suite" — the exact CLI command(s), pasted.
   - "Exercise the real running service" — manual steps / curl.
6. If `is_http_api`: write **`test-generator/<change-slug>/test-cases.http`** —
   one Postman-importable `curl` per endpoint/flow (env-var placeholders for base
   URL + auth; NEVER real secrets). Reference it from TEST-PLAN.md.
7. Advisory only: note (do not gate) any case the code likely won't satisfy.

## Return contract (emit EXACTLY this; the caller validates)

- test_matrix[]         — the rows above (or counts by type)
- files_authored[]      — automated test files created/updated
- test_plan_path        — path to TEST-PLAN.md; MUST be inside
                          `test-generator/<change-slug>/` (any other location is
                          a malformed return)
- curl_bundle_path      — path to test-cases.http (also inside
                          `test-generator/<change-slug>/`), or null (non-API projects)
- run_command           — exact CLI command(s) to run the authored tests
- notes[]               — advisory gaps noticed while authoring (non-blocking); else []
- actual_model          — model id quoted VERBATIM from your system prompt ("The
                          exact model ID is …"); NEVER inferred; `unknown` if absent
- actual_effort         — the value of $CLAUDE_EFFORT (read via Bash)
- failure_reason        — required if you could not author; else null

Malformed returns are treated as failure by the caller. Never run tests; never
spawn subagents.
