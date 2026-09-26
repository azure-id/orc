# orc-testgen — Core (the input slice)

The INPUT SLICE the orchestrator builds for ONE `orc-test-author-opus-5-med`
dispatch. The procedure and the return contract live in ONE place: the agent
file, `.claude/agents/orc-test-author-opus-5-med.md`. The orchestrator never
runs this itself. **Authoring only — RUN NOTHING, GATE NOTHING.** The user tests manually.

## Input slice (you receive exactly this)

- changed_files[]        — the surface the change touched (from the run's actual_files)
- acceptance_criteria[]  — the intent-spec's definition-of-done (the "new behaviour")
- touched_flows[]        — user journeys through the changed code (may be empty)
- constraints[]          — intent-spec hard rules
- stack                  — {language, test_framework, is_http_api}; detect if absent
- test_types[]           — subset of {new_behaviour, flow, change, regression}; default all
- output_conventions     — where tests live in this repo

The manual deliverables go to `test-generator/<change-slug>/` at the PROJECT
ROOT (`<change-slug>` = the run's kebab-case run-folder slug). Malformed returns
are treated as failure by the caller.
