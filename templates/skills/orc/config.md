# ORC — Config

The **values** are not here any more. `bin/cli.js`'s registry holds every key,
its default, its validator, its family and its rank, and `orc lane config orc
--json` resolves them for a run. Restating them here produced a second table
that drifted from the first.

What stays here is the part the CLI cannot hand you: the score→model table, the
fixed-role pins, and where each subsystem's own rule is written down.

## Resolution

**ONE resolver, and it is not you:** `orc lane config orc --json`. Obey
`effective`, print every line in `announce[]` VERBATIM at preflight, and honour
`stops[]` before wave 1. Never re-derive a value, a precedence or an inertness
from `.claude/orc.config.yaml` — a key this lane does not read is not in the
answer, and a key another key shadows comes back already marked. Exit ≠ 0 → say
the CLI is unavailable and fall back to `../_shared/config-precedence.md`'s
documented defaults, out loud.

Read a family top-down and **stop at the first rank that resolves**; a rank
compares only INSIDE its family. Ranks, families, gates, lane-level inertness,
the `announce[]` boundary and the CLI-absent floor:
**`../_shared/config-precedence.md`.**

## Score → model table (executor agent dispatched by name)

The orchestrator scores each task 0–100, then maps to a model via this SINGLE
canonical 6-band table, and dispatches the matching **executor agent**.
`rubric_bands` sets scoring granularity only — it never selects a table.

| Score | Model | Effort | Executor agent |
|-------|-------|--------|----------------|
| [0,30)   | claude-haiku-4-5  | —      | orc-executor-haiku-4-5 |
| [30,40)  | claude-sonnet-4-6 | medium | orc-executor-sonnet-4-6-med |
| [40,55)  | claude-sonnet-4-6 | high   | orc-executor-sonnet-4-6-high |
| [55,65)  | claude-sonnet-5   | high   | orc-executor-sonnet-5-high |
| [65,90)  | claude-opus-5     | low    | orc-executor-opus-5-low |
| [90,100] | claude-opus-5     | medium | orc-executor-opus-5-med |

(Haiku has no effort ladder — that agent carries no `effort:` field.) The risk
floor (≥70) lands `orc-executor-opus-5-low` at minimum in THIS table. Above ~65
the useful dial stopped being the model GENERATION and became the EFFORT, which
is why the old four Opus rows are two. **Every band from 65 needs an Opus 5 MAIN
session** or it silently falls back to the session model (the tier-honesty rule
reports the downgrade) — two bands where it used to be one, and that is the cost
of this table.

**Four executors are named by NO band** — `orc-executor-opus-4-7-med`,
`orc-executor-opus-4-7-high`, `orc-executor-opus-4-8-high` and
`orc-executor-opus-5-high`. They still ship, reachable through
`rubric_bands_override`, `orc diy`'s `fixed_executor` and `extra_fallback_agent`.
Not deleted, because this is a TABLE change and not a model change — and an
agent's model change is always a rename.

### The Opus-5-only ladder (`opus5_only`, default **false**)

One model, EFFORT as the cost dial. Off by default; nothing changes until set.

| Score | Model | Effort | Executor agent |
|-------|-------|--------|----------------|
| [0,90)   | claude-opus-5 | low    | orc-executor-opus-5-low |
| [90,100] | claude-opus-5 | medium | orc-executor-opus-5-med |

Two bands, sharing the 90 edge with the default table's top two rows. That
symmetry is the point: once the default table's high end is already Opus 5 with
effort as the dial, this mode differs from it only BELOW 65, so a third band
would be a distinction the default table stopped making.

**Tier cost:** today TWO bands in six need an Opus 5 main session; with this on,
EVERY dispatch does, so a lower session downgrades every task (warn-only — a
hook can gate effort, never model). **Scope:** it is NOT executor-only — it also
forces every fixed role below, across every lane. orc-diy's table
stays compile-owned and reads only `orc-diy.config.yaml`, never this file.
Full mapping and the two exclusions: `../_shared/opus5-only.md`.

Whichever table resolves, **show it** with the Phase 2 scoring table and record
the mode in the `CONFIG` trace line: an un-shown table is as unaccountable as an
un-shown number.

## Fixed-role agents (not score-mapped)

| Role | Agent |
|------|-------|
| System Analyst | orc-system-analyst-opus-5-high |
| Requirement Planner | orc-planner-opus-5-med |
| Reviewer | orc-reviewer-opus-5-med |
| Verifier | orc-verifier-opus-5-med |
| Mini analyst | orc-analyze-mini-sonnet-5-high |
| Mini planner | orc-planner-mini-sonnet-5-high |
| Mini executor | orc-executor-sonnet-5-high (reused) |
| Pattern codifier | orc-pattern-codifier-sonnet-5-high |
| Ultra advisor (/orc-ultra only) | orc-advisor-opus-5-xhigh |
| Ultra judge (/orc-ultra only) | orc-judge-opus-5-xhigh |

Under `opus5_only`, every role above that is not already `claude-opus-5`
dispatches its Opus 5 variant instead — plus the roles owned by other lanes
(scout, wiki scanner, CLAUDE.md writer, retro miner, fast executor).

## Where each subsystem's rule is written down

A key's default and validator come from the resolver. These are the RULES the
value participates in, and each has exactly one canonical copy.

| Subsystem | The rule, in one line | Canonical prose |
|---|---|---|
| Wave grouping | `max_wave_tasks` is a hard cap, never a target | `references/wave-grouping.md` |
| Batch pause | `batch_pause_every` is a DETERMINISTIC hard gate, not a cadence hint: after wave W, `W % N == 0` with a later wave remaining forces the stop sequence. Computed and confirmed at Phase 2 intake, persisted as `pause_schedule` so a resume enforces it too | `references/stop-and-resume.md` |
| Run budget | `run_budget_dispatches` turns the Phase-1 forecast into a hard stop BEFORE wave 1 and emits `` `GATE budget stop\|pass ``. At `0` no line is emitted at all. The estimate is a FLOOR — repairs push the real count up, never down | `references/preflight-report.md` |
| Analysis depth | `default_analysis_depth` only presets the standard/deep gate; the run still confirms, and deep never auto-escalates without consent. `max_scouts` caps the parallel scouts the same way a wave is capped | `../orc-analyze/SKILL.md` |
| TDD | every plan carries `tdd_spec`; each entry's `disposition` is DERIVED from the planner's `facets`, and a task with a cited `facets.risk[]` can never be scoped out. `tdd_loop_max` caps the repair loop, then STOP + an honest red report. There is deliberately no key for the scoping — one would restore the tautological tests it removes | `SKILL.md` Phase 6 · `schemas/planning-output.md` |
| Test authoring | `generate_tests` gates the opt-in Phase 6.5: it WRITES cases and never runs them, pinned to a visible `test-generator/<change-slug>/` at the project root | `../orc-verify/SKILL.md` |
| Mock example | `mock_example` gates the post-verify runnable example under `mock-examples/`, which is NEVER committed; on drift, `drift-recovery.md` (`DRIFT-FROM`) is capped at 2 loops | `../_shared/drift-recovery.md` |
| Code patterns | `pattern_findings` gates the codifier on an FE/BE cache MISS; a cache HIT is used silently regardless. `orc_wiki_pattern_findings` pre-warms the cache during a wiki scan | `../orc-pattern/SKILL.md` |
| Repair memory | `gotchas` / `gotchas_max` govern `.claude/orc/gotchas.md` — recorded only on a red → green repair, injected scope-matched, never unfiltered | `../_shared/gotchas.md` |
| Security | `security_review` gates the opt-in Phase 5.5, and can only fire on a run with a task scored ≥ 70 | `references/security-checklist.md` |
| Wiki freshness | `wiki_fresh_max` / `wiki_aging_max` set the tier edges. The tier is COVERAGE-RELATIVE and computed on read, and `orc wiki status` is the only thing that computes it — never hand-run a `git rev-list` against `wiki-meta.json`. A STRUCTURAL blind spot degrades ONE step and never past `AGING` | `../orc-wiki/references/staleness.md` |
| Wiki refresh | `wiki_refresh_ask_tasks` / `wiki_refresh_ask_files` set the big-run post-ship ask, judged by FINAL counts. `orc wiki impact` decides delta vs full, and `wiki_delta_full_threshold` is when a FULL refresh is recommended — never silent | `../orc-wiki/references/staleness.md` |
| Crosslink | `crosslink_fresh_days` / `crosslink_aging_days` are DAY-based (two repos share no commit axis); the effective tier is `min(provider-wiki tier, snapshot age)`, advisory only — a stale crosslink warns, never blocks | `../orc-wiki/references/crosslink.md` |
| Foreign dispatch | `extra_enabled` and the `extra_*` block; every armed run prints its `extra:` line at Phase 1 | `../_shared/extra-dispatch.md` |
| Stacked PRs | the `stacked_pr*` keys gate the Phase 8 stack (full `/orc` + `/orc-ultra` only) | `../orc-pr-setup/SKILL.md` |
| Retro | `retro_repo` is where `/orc-retro` files its report; it hard-gates on a delivery channel and does not run at all without one | `../orc-retro/SKILL.md` |
| Paths | `log_dir` (traces, NEVER auto-deleted), `run_dir` (`.claude/orc/run` — outside the installer's blast radius), and the analyst/planner/report dirs | `../_shared/config-precedence.md` |
| Ultra | **no config key at all** — `/orc-ultra` forces its overrides RUN-SCOPED and never writes them to `orc.config.yaml` | `references/ultra-mode.md` |

**TDD — Lane policy (fixed, not configurable).** Full orc + ultra always on ·
orc-mini asks ONE intake question · orc-fast off (no planner) · orc-diy composes
it as the `tdd` flow key · standalone `/orc-plan` ON, because a saved plan's only
consumers are the TDD-always build lanes, so a plan with no `tdd_spec` is
unusable by the lane that runs it.

**Behavior-trace logging is PERMANENT — there is no key.** Every run writes a
persistent trace under `log_dir`; the `orc-trace.js` hook is the deterministic
guarantee, bootstrapping the pointer itself and segmenting the run with
`PHASE-EDGE` lines, so a usable trace exists even if the orchestrator never
narrates. The rich narration is DISPATCHED per phase to the pinned Haiku trace
writer — never appended from memory. See `references/trace-protocol.md`.
