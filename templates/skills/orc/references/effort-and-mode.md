# Reference — Effort, Dispatch Style, and Task Scoring

**Subagents ALWAYS do the work — the orchestrator never implements** (hard
rule 1). The orchestrator is Opus 4.8 high: it doing implementation is the most
costly way possible, and it burns the context that must survive the whole run.
Spawning keeps orchestrator context lean so runs last longer before any pause.

Two INDEPENDENT axes. Never conflate them:
- **Run-level effort** (low/medium/high) → picks the **dispatch style**
  (sequential vs parallel), which controls only **intra-wave concurrency** —
  never WHO does the work, and never WHETHER waves exist.
- **Per-task score** (0–100) → picks each **worker's model**. Always applies.

A medium run can contain a 30-score task and a 95-score task in the same wave.

## Waves always exist; dispatch style is intra-wave only

**Wave computation runs for every run with ≥2 tasks, sequential included**
(dependency layers + conflict graph + `max_wave_tasks` cap — see
`wave-grouping.md`). Dispatch style does NOT decide whether there are waves; it
decides how a wave's tasks fire:

- **sequential** → a wave's tasks dispatch one at a time, in order; the wave
  closes when all its tasks close;
- **parallel** → a wave's non-conflicting tasks dispatch at once (up to
  `max_wave_tasks`).

The **wave-boundary batch pause binds to wave numbers, identically in both
styles** — a sequential run is NOT "no waves / per-task pauses". Show the wave
plan (wave → tasks → pause marks) to the user BEFORE wave 1 in both styles.

## Run-level effort → dispatch style (recommend, user confirms)

- **Low**, or heavy shared data/code → **sequential**: one scored subagent at a
  time, in dependency order (still grouped into waves). Even a single trivial
  task = one cheap subagent (typically Sonnet 4.6 medium), never the
  orchestrator itself.
- **Medium** → sequential by default; **parallel** intra-wave if 3+ genuinely
  independent areas.
- **High** with independent areas → **parallel** waves; consider worktrees for
  isolation (merge at end).

Always RECOMMEND with a one-line why, and let the user pick. Tell them the
agent/task/wave counts, each task's scored model, and where batch pauses fall
BEFORE dispatching.

## Per-task scoring — facet-scored, arithmetic, two-writer

The score is **not judged** from a task title. The **planner** — the one party
that globbed and read every declared file — emits per-task `facets` (facts). The
**orchestrator** — who never read the code — computes the number arithmetically
and audits the facts. No vibes anywhere. Every task is scored, including tiny ones.

**1. Planner-emitted facets** (`planning-output.md` `facets` block, filled during
grounding — zero extra passes):

| Facet | Values |
|---|---|
| `breadth` | `len(declared_files)` — computed, not judged |
| `novelty` | mechanical · imitate · new-surface · novel-algorithm |
| `logic` | none · branching · stateful · algorithmic |
| `test_surface` | none · update-existing · new-tests |
| `risk` | `[]` or `[{class, cite}]` — class ∈ auth·money·migration·security·concurrency·data-integrity; **each entry MUST cite the file/requirement** |
| `uncertainty` | low · medium · high (+ one-line reason if not low) |

`fan_in`/`fan_out` are NOT emitted — the orchestrator computes them from
`depends_on` (forward = fan_in, reverse = fan_out).

**2. Orchestrator validation gate (Phase 2, deterministic — same bounce
mechanics as grounding):** recompute `breadth` (= `len(declared_files)`) and
`fan_in`/`fan_out` from the plan itself; a mismatch, or a `risk` entry with no
`cite`, **bounces the plan** back to the planner (one retry, then escalate). A
plan with no `facets` at all (pre-v0.31.0) resumes on the legacy path — never
bounced for the missing block.

**3. The fixed formula (the ONLY scoring text — this replaces base+adjusters):**

```
score = B(breadth) + N(novelty) + L(logic) + T(test_surface)
        + 5*min(fan_in,3) + 3*min(fan_out,3) + U(uncertainty)

B: 1f=2   2-3f=6   4-5f=10   6+f=15
N: mechanical=0   imitate=8   new-surface=18   novel-algorithm=30
L: none=0   branching=8   stateful=16   algorithmic=24
T: none=0   update-existing=4   new-tests=8
U: low=0   medium=6   high=12

risk ≠ [] → floor 70 (DERIVED from a cited risk facet, never remembered).
clamp 0..100 → the SAME 8-band table (config.md unchanged).
```

Show the user the full table (task, the facet vector, the arithmetic
`B+N+L+T+fan+U = raw`, any risk floor, final, override+reason if any, dispatched
model) BEFORE dispatching — an un-shown number is not a scored number.

**4. Consistency check:** two tasks whose facet vectors differ in **≤1 facet must
land in the same band** — or the SCORE line for the outlier **cites the one
differing facet**. This is the specific fix for sibling tasks in the same domain
drifting into three different bands.

**5. Override protocol** (unchanged): you may override the computed score. Record
`{computed_score, override_score, reason}` in the dispatch log. An override
without a reason is invalid.

## EVERY dispatch is scored — the fix-cycle rule

Fix-cycle dispatches — review-fix, verify-fix, the Phase-7 P2-batch, and any
requeue — are scored through the **same formula**, with two floors that stop a
fix in a risk area from silently dropping to a cheap model:

- **Inherit the ORIGINAL task's `risk` facets** when the fix touches its files —
  a fix in a risk-floor area keeps the ≥70 floor (a userID/context-key fix can
  never dispatch below `opus-4-7-high` again);
- a **P0/P1 fix never dispatches below the band of the task that produced the
  finding.**

Emit a `SCORE task=fix-<n> …` line for each (they appear in the dispatch log and
the completion table like any task).

## Worked scoring examples (facet vectors — compare facet-by-facet, not by vibes)

Each row is the facet vector run through the formula. The number is arithmetic;
the band is what matters. Compare a new task to these facet-by-facet.

| Task | breadth·novelty·logic·test · fan_in/out · unc | Arithmetic | Band |
|---|---|---|---|
| Rename a config key across 4 files + its test | 5·mechanical·none·update-existing · 0/0 · low | 10+0+0+4 = **14** | haiku [0,30) |
| New CRUD endpoint following a sibling route | 3·imitate·branching·new-tests · 1/0 · low | 6+8+8+8+5 = **35** | sonnet-4-6-med [30,40) |
| Bug fix across 2 files with a repro test | 3·imitate·branching·new-tests · 0/0 · medium | 6+8+8+8+6 = **36** | sonnet-4-6-med [30,40) |
| Isolated component from the design system | 3·new-surface·branching·new-tests · 0/0 · low | 6+18+8+8 = **40** | sonnet-4-6-high [40,55) |
| Notification model + enum other tasks consume | 3·new-surface·stateful·new-tests · 0/3 · low | 6+18+16+8+9 = **57** | sonnet-5-high [55,65) |
| Service-layer refactor behind a stable interface | 5·imitate·stateful·update-existing · 0/3 · medium | 10+8+16+4+9+6 = **53** | sonnet-4-6-high [40,55) |
| Add role check to payment-refund endpoint | 3·imitate·branching·new-tests · 0/0 · low · **risk=[auth,money]** | 30 raw → **floor 70** | opus-4-7-high [70,80) |
| Migrate orders table to split-name + backfill | 6·new-surface·stateful·new-tests · 1/3 · high · **risk=[migration,data-integrity]** | 15+18+16+8+5+9+12 = 83 (floor 70) → **83** | opus-4-8-high [80,90) |

Two disciplines the vectors encode: (1) a small diff is NOT a low score when a
cited `risk` facet forces the floor (the refund row — 30 raw, floored to 70); (2)
a big-looking task IS low when its facets are mechanical (the rename). The risk
floor is always DERIVED from a cited facet — the SCORE line names it, never
applies it silently.

## Model ladder → the single score→model table

The score→model mapping is NOT hardcoded here — it lives in `config.md` as ONE
canonical 8-band table (there is no longer a narrow/wide preset). Read config at
run start and map each task's final score through that table (or
`rubric_bands_override`). The orchestrator dispatches the executor agent BY NAME;
it does not request a raw model. `rubric_bands` sets only how many bands the
rubric REPORTS (score granularity), never which table is used.

The 8 bands (see config.md for the exact edges): `haiku-4-5` [0,30) ·
`sonnet-4-6-med` [30,40) · `sonnet-4-6-high` [40,55) · `sonnet-5-high` [55,65) ·
`opus-4-7-med` [65,70) · `opus-4-7-high` [70,80) · `opus-4-8-high` [80,90) ·
`opus-5-high` [90,100]. Effort tiers rank `low < medium < high < xhigh < max`.

## Fixed model assignments (not scored)

- **Orchestrator (you):** Opus 4.8 high — or Opus 5 / Fable 5 at medium+, the
  two models that clear the guard from medium up. Never downgrade yourself.
- **Review** — Superpowers path: Sonnet 4.6, medium. OpenSpec/self path:
  Opus 4.8, high.
- **Verify:** Opus 4.8, high.
- **Merge-conflict resolver:** Opus 4.8, medium.

Note: every band in the table above is a real dispatch target (haiku through
opus-5). If a model tier is unavailable in the environment, fall back UP to the
next capable tier (never silently substitute a different family/effort).

## Dispatch log (lives in the checkpoint)

Every spawn records: `{task_id, computed_score, override_score|null,
override_reason|null, model, effort, spawned_at}`. Feeds the usage report at
every stop.
