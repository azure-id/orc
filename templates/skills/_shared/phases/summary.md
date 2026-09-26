# Phase — Summary   (id: `summary`)

> **Shared phase file** — read when the phase fires. A lane reads ONE layer: `full` (`/orc`) or `composed` (the `<!-- diy:when -->` variants `orc diy compile` stitches). `orc lane phases <lane> --json` names it.

<!-- orc:layer full -->

## Summary

Emit `PHASE summary start`. Report: tasks/waves/dispatches (scores + overrides), escalations,
needs_context events, findings by severity (P0/P1 resolved; P2 itemized by
`group`; P3 counted; `pre_existing` in its own non-gating bucket; the
after-filter's `removed[]`, each with the id that removed it), verify result,
authored tests when 6.5 ran, repo state + branch,
stale_review flags. Then ONE question: **"Apply the P2 fix-batch? The P3
cosmetics too?"** (H `orc.phase-7.p2-batch` · `orc.phase-7.p3-batch`) — never fix unasked.
A yes dispatches ONE fix per `group` (R7), never one per finding. Then record
each Phase 5 finding's outcome and emit `FINDING-OUTCOME` (`../gotchas.md` §10
"Review close"). Print the card (§End-of-run card), then emit `PHASE summary end`.

<!-- /orc:layer -->

<!-- orc:layer composed -->

## Phase: Summary

<!-- diy:when summary=off -->
No summary phase: end after ship with a single line (tasks done / gate color
/ ship action taken) plus usage, and note which phases this flow skipped.
<!-- /diy:when -->
<!-- diy:when summary=short -->
Short summary: one paragraph — what was built, gate results, ship action,
skipped phases, and usage. No per-task breakdown.
<!-- /diy:when -->
<!-- diy:when summary=full -->
Full summary exactly as the full lane's final phase: per-task outcomes with
models used, findings outcomes, verify results, ship action, skipped
phases, and usage.
<!-- /diy:when -->

Always name the phases this flow skipped by config — the user must never
mistake a DIY run for a full-lane run. The run ends with the card
(`.claude/skills/_shared/phases/summary.md` §End-of-run card).

<!-- /orc:layer -->

## End-of-run card

**ONE template, the same shape in every coding lane.** `/orc` and `/orc-diy`
print it at the end of the summary; `/orc-mini`, `/orc-fast` and `/orc-quick`
point here and print it at their end — a green ship, a red STOP, or a quick
entry that wrote code. Every detail goes BELOW the card, never above it.

```
✅ Fixed the null charge on guest checkout — 3 files, tests 14 passed (2 affected first)
   review   2 findings · 1 fixed · 1 disputed (recorded)      gotchas  1 recorded (G-044)
   risk     low — callers 3 in 2 files, tests reach 2          habits   1 proposal below
   flaky    1 test passed on the re-run (no repair round)      graph    <gain line>
   undo     orc undo --run <run-slug>                          next     commit? (your usual: review → commit)
```

- **Line 1 is the outcome.** Start with ✅ (done), ⚠ (partial) or ⛔ (red). Then
  say what happened, the files and the tests. The first sentence answers "what
  happened?".
- **A row shows only when it has something.** Never print an empty row.
- **The `undo` row always shows on a run that wrote code:**
  `orc undo --run <run-slug>` — never `git checkout -- .`, which also discards
  the user's own edits. No `checkpoint.json` with `actual_files` → add
  `--files <actual_files>`. No snapshot (not a git repository) → say
  `undo  none — no snapshot`. The command only PRINTS the undo; `--apply` runs
  it. The lane never runs it itself.
- **Copy the CLI's words.** `risk` is the `blast_line` with its `why`;
  `graph` is the `orc graph gain` `line`, VERBATIM — an estimate with a range,
  never restated as a saving. `flaky` is the `GATE flaky` tests.
