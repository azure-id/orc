# Reference — Analyst, Combiner & Plan Gates (orchestrator side)

The orchestrator's deterministic gates around the analyst, the
context-combiner, and the planner. The roles themselves are defined in
`../../orc-analyze/SKILL.md`, `../../context-combiner/SKILL.md`, and
`../subskills/orc-planner/SKILL.md` — this file is what YOU do around their
dispatches and returns. Load at Phase 0 (analyst dispatch) and Phase 1
(planner return). Emit a `GATE` trace line (pass|bounce) per check when
logging.

## Deep-mode scout dispatch (yours)

When the analyst runs in deep mode it returns a `scout_plan` (pass 1). You then
dispatch ≤ `config.max_scouts` (default 3) parallel
`orc-scout-sonnet-4-6-high` agents — one coverage area each, read-only — and
re-dispatch the analyst WITH their evidence bundles for pass 2. Same "return a
request → you re-slice → re-dispatch" shape as `needs_context`. You never
analyze; you only dispatch and relay.

## Analyst-return gates (deterministic, before any build option)

1. **Evidence spot-check:** Glob every `files[]` path in the spec +
   Grep-verify the quoted snippet on every `status: exists|conflict` entry.
2. **Derivation lint:** R# ids, statuses, and context-anchor set must match
   between report.md and requirement-spec.md.

Any miss → bounce to the analyst with the miss list (one retry, then escalate
to the user). Refuse take-into-build when the spec has open `UNVERIFIED` or
lacks `scope_closed: true` (a one-Grep check).

## Combiner tracking (yours; full lane only)

`context-combiner` (Opus 4.8 high) merges 2+ RELATED, already-confirmed
analyses from the same run into ONE combined requirement-spec before build.

- **Track the analysis set:** hold the confirmed spec paths of every analysis
  this run in run state (survives checkpoint/resume).
- When the user picks "pass to context-combiner" at orc-analyze's Phase F
  branch menu (offered only once 2+ analyses exist), dispatch
  `orc-context-combiner-opus-5-high` with that list.
- The return carries `combined_spec_path` + `coverage_pct` (conservation
  proof — every source requirement accounted for; must be 100) + `dropped[]` +
  `stale_evidence[]` + `handoff_ready` — or `combined: false` if the user chose
  keep-separate at the combiner's relatedness challenge (then fall back to
  per-analysis stop/build).
- Offer the build option ONLY when `handoff_ready` is true (the combiner sets
  it false when `coverage_pct` < 100 OR a conflict is open). On build, continue
  at Phase 1 with the combined spec exactly like a single requirement-spec.

You never combine; you only track, dispatch, and relay.

## Spec staleness valve (Phase 1, before dispatching the planner)

If the requirement-spec's `git_head` ≠ current HEAD (analysis and build in
different sessions), re-run the analyst evidence spot-check (paths + quotes)
BEFORE dispatching the planner; on misses offer re-analyze vs
proceed-with-flagged.

## Phase 1 exit gate (deterministic, before scoring)

1. **Grounding spot-check:** Glob every path the plan marks
   `disposition: exists`. A task whose declared paths lack `grounding[]`
   entries counts as a miss.
2. **Coverage check:** recompute the planner's coverage echo — every in-scope
   spec R# / intent-spec DoD line must appear in ≥ 1 task's `requirements[]`;
   an `orphan` requirement is a miss (the user may explicitly descope instead).
3. **Graph checks:** cycle detection over `depends_on` + same-file collision
   over `declared_files` (two tasks sharing a file need a serializing dep or a
   merge). Both trivial at ≤ 20 tasks — never trust the planner's self-check
   alone.

Any miss → the plan is malformed: bounce it back to the planner WITH the miss
list (one retry), then escalate to the user. **Legacy exception:** a
pre-v0.7.0 plan resumed from an old checkpoint has no `grounding[]`
(pre-v0.9.0: no `requirements[]`/`spec_invariants[]`) — resume it without the
missing checks; never bounce an old plan.
