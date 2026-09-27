# Phase — Ship   (id: `ship`)

> **Shared phase file** — read when the phase fires. A lane reads ONE layer: `full` (`/orc`) or `composed` (the `<!-- diy:when -->` variants `orc diy compile` stitches). `orc lane phases <lane> --json` names it.

<!-- orc:layer full -->

## Ship (load ../../orc/subskills/orc-pr/SKILL.md)

Emit `PHASE ship start`. Show current branch.

**Stacked-PR gate FIRST (deterministic; full `/orc` + `/orc-ultra` only — load
`../../orc/subskills/orc-pr/stack-gate.md`; never mini/fast/diy).** Measure the change
(`git diff --numstat`, exclusions applied) vs config `stacked_pr_loc`/
`stacked_pr_files`. Under threshold or `stacked_pr: off` → silent, ship normally
(`GATE stack-gate pass :: under-threshold`). Tripped → surface report + ONE P0
question (H `orc.phase-8.stack`: stack into layers? or one regular PR?) in the SAME round as its two
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

Then ask together (H `orc.phase-8.ship`): **commit? push? create PR?** (PR: ticket +
title + target branch; generate from `../../orc/subskills/orc-pr/pr.md`). If Phase 6.5 ran,
commit `test-generator/<change-slug>/` too (a user deliverable, never gitignored).
**`mock-examples/` is NEVER staged** (drift-recovery.md; no `.gitignore` edit —
just never `git add` it).
On success: delete the ephemeral decision log; KEEP checkpoint + dispatch log.
**Wiki stale-flag:** flag (never re-scan) wiki docs whose covered files this
run changed; point at `/orc-wiki`. **Post-ship refresh ask** (BIG runs, /orc +
/orc-ultra — the `wiki_refresh_ask_tasks`/`_files` triggers and full rules in
`../../orc-wiki/references/staleness.md`): upgrade the passive note to **"Refresh
wiki now?"** (H `orc.phase-8.wiki-refresh`); on "later" print the prominent stale warning and stamp
`wiki_refresh_declined` in the checkpoint. Then ALWAYS show the completion
usage report — /usage limits + the full dispatch log (model/effort/score per
subagent). The user must always know what the run cost. A `proposal` in
`habits{}` → its ONE line joins that report (`../habits.md` §3). **Code graph
(`../code-graph.md` §5–§6):** run `orc graph update --if-enabled` once more —
fix rounds move code — and emit `GRAPH-UPDATE`; then run `orc graph notes pending
--files <every path the run changed> --at end --if-enabled` — exit 0 → one noter
dispatch, exit 3 or 5 → nothing. Then ONE line, once, copied VERBATIM from
`orc graph gain --run <this run's trace name> --if-enabled --json --brief` (emit
`GRAPH-GAIN`): what the graph put in, and an ESTIMATE of the retrieval it kept
out. Exit 1 or 3 → no line. **Never restate it as one number** — the range and
the word "estimate" are the claim. Finally emit
`PHASE ship end`, then the one-line `STATS lane=… dispatches=… downgrades=…`
summary (trace.md — what `orc stats` reads), then `FINISH :: <detail>`,
and in ONE step delete BOTH `log_dir/.current` and the run's `RESUME.md` (that
file existing is what marks a run unfinished — stop-resume.md).

<!-- /orc:layer -->

<!-- orc:layer composed -->

## Phase: Ship

State the current branch and the change summary BEFORE any git action, and
never ship on a red build (locked rule).

<!-- diy:when code_graph=on -->
Before the ship action, run `orc graph update --if-enabled` once more — fix rounds
move code (`.claude/skills/_shared/code-graph.md` §5).
<!-- /diy:when -->
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
