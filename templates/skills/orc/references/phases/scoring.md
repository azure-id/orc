# Phase — Effort & scoring   (id: `scoring`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Effort, dispatch style, scoring (load ../effort-and-mode.md)

Emit `PHASE scoring start`. Refine effort; recommend **sequential** vs
**parallel** dispatch (worktrees for high-effort independent features) — user
confirms. Dispatch style is **intra-wave concurrency only**: waves are computed
regardless of style (sequential runs have waves too, see wave-grouping.md), so
the batch pause always binds to wave numbers. **Batch-pause schedule (deterministic, not a cadence hint):** the plan
has K waves — ask "pause after every wave / every 2nd / run straight through?"
and SHOW the resulting stop list ("will pause after waves [list]"); a 2-wave
plan plainly offers "pause after wave 1". Store it as `pause_schedule`, recompute
each wave's `is_batch_pause` (last wave never pauses). **Facet-validation gate
(deterministic):** recompute `breadth` + `fan_in`/`fan_out` from the plan; a
mismatch or an uncited `risk` entry bounces the plan (grounding mechanics).
**Score every task** from its `facets` via the fixed formula, map to the model
ladder, show the facet vector + arithmetic table, and emit `SCORE task=<id>
score=<n> band=<band> model=<m> facets=<vector> :: <reason>` per task; a score
override needs a written reason (logged). **With `extra_enabled`** the table gains
a `via` column and its head can name TWO tables (effort-and-mode.md); a foreign
task's `SCORE` appends `via=extra:<profile>` and `model=` is the FOREIGN model id.
**Cited-risk hold-back (deterministic, beside the facet gate):** a foreign-routed
task with a non-empty `risk[]` is HELD BACK to its Claude band (`extra_risk_tasks`
defaults to `off`) and every one is LISTED with its cited risk — a silently
held-back task is indistinguishable from a forgotten one. Use the wiki's "Notes for planning" to sharpen
core/isolated + risk factors. **Tag each task's pattern domain+language**
(+ secondary `db: postgres`) per `../pattern-gate.md`. Ask: "Any
anticipated escalations, or run straight through?" Emit `PHASE scoring end`.

<!-- /orc:layer -->
