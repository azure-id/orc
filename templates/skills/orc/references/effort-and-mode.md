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
| Bug fix across 2 files with a repro test | 20 (2 files, some logic, 1 test) | +15 correctness-critical path | **35** | small diff but the repro must prove it; not haiku work |
| New isolated component from the existing design system | 35 (3 files incl. test, moderate UI logic) | +10 new surface, −0 isolated leaf (no consumers yet) | **45** | pattern to imitate, but net-new code |
| Service-layer refactor behind a stable interface | 40 (several files, refactor logic, tests) | +18 dependency load (callers), −0 interface frozen | **58** | internals move, contract unchanged — Sonnet 5 band |
| Notification model + type enum other tasks consume | 32 (3 files, moderate logic) | +25 core/shared (every later task imports it), +8 blast radius | **65** | the run's keystone — errors cascade |
| Add role check to payment-refund endpoint | 24 (2 files + test) | +25 risk (money+auth), +10 core | **70** (risk floor also forces ≥70) | small diff, catastrophic if wrong |
| Migrate orders table to split-name columns + backfill | 38 (migration + model + callers + tests) | +25 risk (migration), +15 dependency load, +10 blast radius | **88** | irreversible data change, wide surface |

Two disciplines the examples encode: (1) base is INTRINSIC size only — risk
and centrality live in the adjusters, never double-counted into base; (2) a
small diff is NOT a low score when the blast radius or risk class is high (the
refund example), and a big-looking task IS low when it's mechanical (the
rename). If your score diverges >20 points from the nearest analog, re-derive
it or write an override reason.

**Anti-inflation / anti-deflation (do NOT blindly score 60):**
- Show the arithmetic. The dispatch table you present to the user MUST carry
  `base + adjusters = final` columns per task, not just the final number — an
  un-shown number is not a scored number.
- A final score in **[55,70)** must CITE which adjuster moved it out of the base
  range. No cited adjuster → clamp back to the base band. This is the specific
  fix for the reflexive "everything is a 60".
- Mirror the rule for the **risk floor**: a security/money/migration/auth task
  clamped to ≥70 must name the risk adjuster that put it there; the floor is
  never applied silently.
- **Haiku band [0,30):** mechanical + isolated + a tested pattern to imitate =
  haiku work. Don't spend Sonnet on a pure find-replace or a codegen-shaped
  task. Conversely, never drop a correctness- or contract-critical task into the
  haiku band just because the diff is small — cite the adjuster and let it rise.

## Model ladder → the single score→model table

The score→model mapping is NOT hardcoded here — it lives in `config.md` as ONE
canonical 8-band table (there is no longer a narrow/wide preset). Read config at
run start and map each task's final score through that table (or
`rubric_bands_override`). The orchestrator dispatches the executor agent BY NAME;
it does not request a raw model. `rubric_bands` sets only how many bands the
rubric REPORTS (score granularity), never which table is used.

The 8 bands (see config.md for the exact edges): `haiku-4-5` [0,30) ·
`sonnet-4-6-med` [30,40) · `sonnet-4-6-high` [40,55) · `sonnet-5-high` [55,65) ·
`opus-4-7-med` [65,70) · `opus-4-7-high` [70,80) · `opus-4-8-med` [80,85) ·
`opus-4-8-high` [85,100]. Effort tiers rank `low < medium < high < xhigh < max`.

## Fixed model assignments (not scored)

- **Orchestrator (you):** Opus 4.8, high — always.
- **Review** — Superpowers path: Sonnet 4.6, medium. OpenSpec/self path:
  Opus 4.8, high.
- **Verify:** Opus 4.8, high.
- **Merge-conflict resolver:** Opus 4.8, medium.

Note: every band in the table above is a real dispatch target (haiku through
opus-4-8). If a model tier is unavailable in the environment, fall back UP to the
next capable tier (never silently substitute a different family/effort).

## Dispatch log (lives in the checkpoint)

Every spawn records: `{task_id, computed_score, override_score|null,
override_reason|null, model, effort, spawned_at}`. Feeds the usage report at
every stop.
