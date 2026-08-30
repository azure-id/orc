# Phase — Ship   (id: `ship`)

> **Shared phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12, and into
> this library at W13 when `orc-diy` became its second reader. A spine is loaded
> IN FULL when its skill activates; this is loaded when the phase fires, and most
> runs skip most phases.
>
> **Two layers, and a lane reads exactly one.** `full` is `/orc`'s procedure.
> `composed` is what `orc diy compile` stitches — the same phase expressed as
> `<!-- diy:when -->` variants over a composed flow, NOT a second copy of the
> procedure. Reading the wrong one is the failure `README.md` names: a lane
> doing a phase its product promise says it does differently.
> `orc lane phases <lane> --json` names the layer for each lane.

<!-- orc:layer full -->

## Ship (load ../../orc/subskills/orc-pr/SKILL.md)

Emit `PHASE ship start`. Show current branch.

**Stacked-PR gate FIRST (deterministic; full `/orc` + `/orc-ultra` only — load
`../../orc/subskills/orc-pr/stack-gate.md`; never mini/fast/diy).** Measure the change
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
title + target branch; generate from `../../orc/subskills/orc-pr/pr.md`). If Phase 6.5 ran,
commit `test-generator/<change-slug>/` too (a user deliverable, never gitignored).
**`mock-examples/` is NEVER staged** (drift-recovery.md; no `.gitignore` edit —
just never `git add` it).
On success: delete the ephemeral decision log; KEEP checkpoint + dispatch log.
**Wiki stale-flag:** flag (never re-scan) wiki docs whose covered files this
run changed; point at `/orc-wiki`. **Post-ship refresh ask** (BIG runs, /orc +
/orc-ultra — the `wiki_refresh_ask_tasks`/`_files` triggers and full rules in
`../../orc-wiki/references/staleness.md`): upgrade the passive note to **"Refresh
wiki now?"**; on "later" print the prominent stale warning and stamp
`wiki_refresh_declined` in the checkpoint. Then ALWAYS show the completion
usage report — /usage limits + the full dispatch log (model/effort/score per
subagent). The user must always know what the run cost. Finally emit
`PHASE ship end`, then the one-line `STATS lane=… dispatches=… downgrades=…`
summary (trace.md — what `orc stats` reads), then `FINISH :: <detail>`,
and in ONE step delete BOTH `log_dir/.current` and the run's `RESUME.md` (that
file existing is what marks a run unfinished — stop-resume.md).

<!-- /orc:layer -->

<!-- orc:layer composed -->

## Phase: Ship

State the current branch and the change summary BEFORE any git action, and
never ship on a red build (locked rule).

<!-- diy:when ship_mode=ask -->
Ask the user how to ship: commit, PR (via
`.claude/skills/orc/subskills/orc-pr/SKILL.md`), or leave the working tree
as-is. Default when auto-accepted by autonomy: leave as-is and report.
<!-- /diy:when -->
<!-- diy:when ship_mode=commit -->
Commit the run's changes on a green gate without asking (branch first if on
the default branch; conventional message from the intent). PRs only if the
user asks afterwards.
<!-- /diy:when -->
<!-- diy:when ship_mode=pr -->
On a green gate, create the PR without asking via
`.claude/skills/orc/subskills/orc-pr/SKILL.md` (branch + commit + push + PR
body from the run artifacts).
<!-- /diy:when -->
<!-- diy:when ship_mode=report-only -->
NEVER commit or push in this flow. Leave the working tree modified, and end
with the change report + suggested commit message the user can apply
themselves.
<!-- /diy:when -->

<!-- /orc:layer -->
