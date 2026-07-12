# Reference — Phase F branching (multi-analyze loop + combiner)

Load when an analysis completes and the menu must be offered. Artifacts are
written INTERNALLY to `orc/analyzer/{name}/`. The options shown depend on how
many analyses exist this run. The Phase F gates (evidence spot-check +
derivation lint, see SKILL.md) run BEFORE any build option is offered.

## After the 1st analysis (one analysis exists)
1. **Stop here** → COPY `report.md` OUT to `{report_out_dir}/{name}/` and stop.
2. **Pass to build** → hand both internal files to the ORCHESTRATOR (Phase 1
   planner → full pipeline). The analyst NEVER builds directly.
3. **Analyze another RELATED doc** → the next analysis must be context-related to
   this one so the two can be combined later. Go to the relatedness gate.

## Relatedness gate (before the next analysis starts)
Ask: "Is this related context (same scope, so it can be combined)?"
- **Yes** → run the next analysis (a normal orc-analyze pass), then show the
  "2+ analyses" menu below.
- **No** → combining doesn't apply. Offer a small choice: (a) take the
  already-completed analysis (or analyses, if 2+ exist) into orc build as-is —
  each spec builds as its OWN pipeline (the planner consumes one spec at a time;
  uncombined specs are NEVER handed to a single planner run), (b) analyze the new
  doc as a STANDALONE analysis that goes to build on its own, or (c) stop.

## After the 2nd+ analysis (2+ analyses exist)
1. **Stop here** → COPY every report OUT and stop.
2. **Pass to context-combiner** → the orchestrator dispatches
   `orc-context-combiner-opus-4-8-high` with the list of confirmed spec paths for
   all RELATED analyses this run. It verifies relatedness, resolves conflicts with
   the user, proves conservation (a source coverage matrix — every source
   requirement accounted for, `coverage_pct` must be 100), and writes
   `combined-report.md` + `combined-requirement-spec.md`.
3. **Analyze another related doc** → back to the relatedness gate (loop).

## After the combiner returns
The orchestrator offers (gating on the combiner's `handoff_ready`):
1. **Stop here** → the combined report is copied OUT for the user.
2. **Pass to orc build** → the combined spec goes to Phase 1 planning and the
   full pipeline.

If the combiner returned `handoff_ready: false` (an unresolved conflict remains,
or its coverage gate found source requirements unaccounted for), offer ONLY
**Stop here** — the build option is withheld until the conflict is resolved and
coverage is complete. If the combiner returned `combined: false` (user chose keep-separate at
the relatedness challenge), the analyses stay separate — fall back to the
per-analysis stop/build choice above, where each spec builds as its OWN pipeline
(uncombined specs are never handed to a single planner run).
