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
`orc-scout-sonnet-4-6-high` agents (`orc-scout-opus-5-low` when `opus5_only`
— `../../_shared/opus5-only.md`; scouts fan out in PARALLEL, so this is the
mode's largest single cost multiplier) — one coverage area each, read-only — and
re-dispatch the analyst WITH their evidence bundles for pass 2. Same "return a
request → you re-slice → re-dispatch" shape as `needs_context`. You never
analyze; you only dispatch and relay.

## Analyst-return gates (deterministic, before any build option)

1. **Evidence spot-check:** Glob every `files[]` path in the spec +
   Grep-verify the quoted snippet on **EVERY quote-anchored ref, whatever its
   `status`** (v0.34.6). It used to check only `exists|conflict` — but the two
   statuses a GOOD audit most often produces are `resolved` (a challenged row
   the user decided) and `buildable` (the actual work), so a correctly-triaged
   analysis was the one the gate barely checked: a real spec had zero
   `exists|conflict` rows, so the mandated verification covered 0 of 5 refs and
   a `file:5` citing a quote that lives at `file:4` went through. It is one
   Grep per ref, and it is the ONLY mechanical defence against a wrong line
   number reaching the planner. Note the causal shape: that ref started as a
   line RANGE with no quote (auto-UNVERIFIED per hard rule 2); narrowing it to
   one line + quote was the CORRECT fix and is what introduced the off-by-one —
   tightening evidence granularity is itself an error surface, so the gate has
   to be what catches it.
2. **Derivation lint:** R# ids, statuses, and context-anchor set must match
   between report.md and requirement-spec.md.

Any miss → bounce to the analyst with the miss list (one retry, then escalate
to the user). Refuse take-into-build when the spec has open `UNVERIFIED` or
lacks `scope_closed: true` (a one-Grep check).

## Combiner tracking (yours; full lane only)

`context-combiner` (`orc-context-combiner-opus-5-high` — Opus 5 high, v0.34.0)
merges 2+ RELATED, already-confirmed
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
4. **TDD/test-task collision (v0.34.4):** a `tdd_spec` entry whose target file
   is in the `declared_files` of a task whose `facets.test_surface` is
   `new-tests` is a miss. The paired TDD task materializes `tdd_spec` BEFORE the
   task it guards, so that task's planned work is already on disk and
   green by the time its wave opens — leaving only bad options (dispatch a
   no-op, silently drop promised coverage, or re-slice mid-run). The planner
   authored both mechanisms and folds them together itself: extend the
   materialized file, never re-author it.
5. **TDD disposition gate (v0.41.0)** — this gate is what lets TDD be skipped
   safely. Skipping a test is cheap to claim and expensive to get wrong, so
   every skip must be checkable, and it is checked in BOTH directions: a rule
   that only ever prevents tests is a rule that deletes coverage.
   - `disposition` outside the closed set
     `new-surface | behavior-change | covered-by-existing | no-behavior | no-runner`
     → miss. (Absent on a pre-v0.41.0 plan → derive from `kind`; never bounce an
     old plan — see the legacy exception below.)
   - `covered-by-existing` **without a resolvable `covered_by`** → miss. Glob the
     cited `path` exactly as check 1 does for `disposition: exists`. "A test
     already covers this" is the one claim that, if false, silently removes
     coverage the run promised.
   - `no-behavior` whose task has `facets.test_surface != none` → miss
     (self-contradiction: the planner said the surface is testable and that it
     isn't).
   - **Safety floor:** any entry that is `covered-by-existing` or `no-behavior`
     on a task with non-empty `facets.risk[]` → miss, no exceptions. Auth,
     money, migration, security, concurrency and data-integrity requirements do
     not ride on another test's coincidence.
   - `new-surface` / `behavior-change` missing `skeleton` or `given_when_then`
     → miss.
   - A disposition that DEVIATES from the derivation table in
     `../schemas/planning-output.md` without a `reason` → miss. The derivation
     is the default; departing from it is the thing that needs justifying.

Any miss → the plan is malformed: bounce it back to the planner WITH the miss
list (one retry), then escalate to the user. **Legacy exception:** a
pre-v0.7.0 plan resumed from an old checkpoint has no `grounding[]`
(pre-v0.9.0: no `requirements[]`/`spec_invariants[]`; pre-v0.41.0: no
`disposition`) — resume it without the
missing checks; never bounce an old plan.
