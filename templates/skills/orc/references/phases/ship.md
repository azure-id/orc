# Phase — Ship   (id: `ship`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Ship (load ../../subskills/orc-pr/SKILL.md)

Emit `PHASE ship start`. Show current branch.

**Stacked-PR gate FIRST (deterministic; full `/orc` + `/orc-ultra` only — load
`../../subskills/orc-pr/stack-gate.md`; never mini/fast/diy).** Measure the change
(`git diff --numstat`, exclusions applied) vs config `stacked_pr_loc`/
`stacked_pr_files`. Under threshold or `stacked_pr: off` → silent, ship normally
(`GATE stack-gate pass :: under-threshold`). Tripped → surface report + ONE P0
question (stack into layers? or one regular PR?) in the SAME round as its two
prerequisites — **a ticket** and a resolved PR template
(`_shared/pr-templates.md`; none found → recommend three options). No ticket, no
template, or "no" → **one regular PR, never re-asked**. "Yes" → commit on the
current branch (the driver's snapshot), write `stacked-pr/<slug>/STACK-FROM.md`
(`_shared/stack-plan.md`, `ENTRY-MODE: orc-run`, this run's `RUN-DIR`), then hand
off **`/orc-pr-setup`** → **`/orc-pr-driver`**. ORC never cuts layers itself.

**Handoff seam (one sentence, only when it applies):** if any changed file is a
GREEN surface in `orc handoff surfaces --json`, say so —
*"2 of these were changes a PM could have made alone — `/orc-handoff` next time."*
That sentence is how anyone finds out that lane exists.

Then ask together: **commit? push? create PR?** (PR: ticket +
title + target branch; generate from `../../subskills/orc-pr/pr.md`). If Phase 6.5 ran,
commit `test-generator/<change-slug>/` too (a user deliverable, never gitignored).
**`mock-examples/` is NEVER staged** (drift-recovery.md; no `.gitignore` edit —
just never `git add` it).
On success: delete the ephemeral decision log; KEEP checkpoint + dispatch log.
**Wiki stale-flag:** flag (never re-scan) wiki docs whose covered files this
run changed; point at `/orc-wiki`. **Post-ship refresh ask** (BIG runs, /orc +
/orc-ultra — the `wiki_refresh_ask_tasks`/`_files` triggers and full rules in
`../../../orc-wiki/references/staleness.md`): upgrade the passive note to **"Refresh
wiki now?"**; on "later" print the prominent stale warning and stamp
`wiki_refresh_declined` in the checkpoint. Then ALWAYS show the completion
usage report — /usage limits + the full dispatch log (model/effort/score per
subagent). The user must always know what the run cost. Finally emit
`PHASE ship end`, then the one-line `STATS lane=… dispatches=… downgrades=…`
summary (trace.md — what `orc stats` reads), then `FINISH :: <detail>`,
and in ONE step delete BOTH `log_dir/.current` and the run's `RESUME.md` (that
file existing is what marks a run unfinished — stop-resume.md).

<!-- /orc:layer -->
