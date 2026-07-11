# Reference — Effort, Dispatch Style, and Task Scoring

**Subagents ALWAYS do the work — the orchestrator never implements** (hard
rule 1). The orchestrator is Opus 4.8 high: it doing implementation is the most
costly way possible, and it burns the context that must survive the whole run.
Spawning keeps orchestrator context lean so runs last longer before any pause.

Two INDEPENDENT axes. Never conflate them:
- **Run-level effort** (low/medium/high) → picks the **dispatch style**
  (sequential vs parallel), never WHO does the work.
- **Per-task score** (0–100) → picks each **worker's model**. Always applies.

A medium run can contain a 30-score task and a 95-score task in the same wave.

## Run-level effort → dispatch style (recommend, user confirms)

- **Low**, or heavy shared data/code → **sequential**: one scored subagent at a
  time, in dependency order. Even a single trivial task = one cheap subagent
  (typically Sonnet 4.6 medium), never the orchestrator itself.
- **Medium** → sequential by default; **parallel waves** if 3+ genuinely
  independent areas.
- **High** with independent areas → **parallel waves**; consider worktrees for
  isolation (merge at end).

Always RECOMMEND with a one-line why, and let the user pick. Tell them the
agent/task/wave counts, each task's scored model, and where batch pauses fall
BEFORE dispatching.

## Per-task scoring rubric (default; override with written reason)

Every task is scored — including tiny ones. The score is a **base** from
intrinsic size, then ADJUSTED up or down by contextual factors, so a nominally
"small" task (base 20) can end at 40 if it's risky or central, and a "medium"
task (base 60) can drop to 20 if it's isolated and mechanical. Look wide before
settling the number.

**Base (intrinsic size), 0–40:**

| Signal | Read from | Range |
|---|---|---|
| File count / breadth | `declared_files[]` | 0–15 |
| Algorithmic complexity | task `description` (logic-heavy vs CRUD) | 0–15 |
| Test surface | tests implied by declared_files | 0–10 |

**Adjusters (context), each can push the score up or down:**

| Factor | Effect | Read from |
|---|---|---|
| Core vs isolated code | +0..+25 core/shared; −0..−15 isolated leaf | `owns_area`, integration surface |
| Dependency load | +0..+15 per upstream contract to honor | `depends_on[]` |
| Risk class | +0..+25 security/money/migrations/auth | intent-spec constraints |
| Blast radius | +0..+10 many consumers depend on this | reverse `depends_on` |
| Mechanical/repetitive | −0..−15 boilerplate, codegen-like | task `description` |

Final score = clamp(base + adjusters, 0, 100).

**Risk floor:** anything touching security, money, data migrations, or auth
cannot end below 70 regardless of other factors.

**Override protocol:** you may override the computed score. Record
`{computed_score, override_score, reason}` in the dispatch log. An override
without a reason is invalid.

Show the user the full scoring table (task, base, adjusters, final,
override+reason if any, dispatched model) BEFORE dispatching.

## Worked scoring examples (anchor to these — never score from vibes)

Score by ANALOGY to the nearest example, then adjust for the differences. These
are calibration anchors, not templates to copy blindly.

| Task | Base | Adjusters | Final | Why |
|---|---|---|---|---|
| Rename a config key across 4 files + its test | 12 (4 files, no logic, small test surface) | −10 mechanical, −5 isolated | **0** | pure find-replace, leaf code |
| Add a `--json` flag to one CLI command | 18 (2 files, light logic, 1 test file) | −5 isolated leaf | **13** | one coherent area, no consumers |
| New CRUD endpoint following an existing sibling route | 28 (3 files incl. test, CRUD logic) | +5 dependency on shared schema, −5 mechanical (sibling to imitate) | **28** | pattern exists; mid-low band |
| Notification model + type enum other tasks consume | 32 (3 files, moderate logic) | +25 core/shared (every later task imports it), +8 blast radius | **65** | the run's keystone — errors cascade |
| Add role check to payment-refund endpoint | 24 (2 files + test) | +25 risk (money+auth), +10 core | **70** (risk floor also forces ≥70) | small diff, catastrophic if wrong |
| Migrate orders table to split-name columns + backfill | 38 (migration + model + callers + tests) | +25 risk (migration), +15 dependency load, +10 blast radius | **88** | irreversible data change, wide surface |

Two disciplines the examples encode: (1) base is INTRINSIC size only — risk
and centrality live in the adjusters, never double-counted into base; (2) a
small diff is NOT a low score when the blast radius or risk class is high (the
refund example), and a big-looking task IS low when it's mechanical (the
rename). If your score diverges >20 points from the nearest analog, re-derive
it or write an override reason.

## Model ladder → config presets

The score→model mapping is NO LONGER hardcoded here. It lives in `config.md`,
selected by `rubric_bands` (narrow preset for 2–5 bands, wide for 6–8), and maps
each score to a named EXECUTOR AGENT. Read config at run start and use its
preset (or `rubric_bands_override`). The orchestrator dispatches the executor
agent by name; it does not request a raw model.

`rubric_bands` controls how many bands the rubric produces (finer or coarser
score granularity); the preset boundaries in config map the resulting score to a
model/agent.

## Fixed model assignments (not scored)

- **Orchestrator (you):** Opus 4.8, high — always.
- **Review** — Superpowers path: Sonnet 4.6, medium. OpenSpec/self path:
  Opus 4.8, high.
- **Verify:** Opus 4.8, high.
- **Merge-conflict resolver:** Opus 4.8, medium.

Note: Opus 4.7 is NOT a dispatch target — the ladder uses only Sonnet 5 and
Opus 4.8. If a model tier is unavailable in the environment, fall back UP to the
next capable tier (never silently substitute a different family/effort).

## Dispatch log (lives in the checkpoint)

Every spawn records: `{task_id, computed_score, override_score|null,
override_reason|null, model, effort, spawned_at}`. Feeds the usage report at
every stop.
