# Phase — Summary   (id: `summary`)

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

## Summary

Emit `PHASE summary start`. Report: tasks/waves/dispatches (scores + overrides), escalations,
needs_context events, findings by severity (P0/P1 resolved; P2 itemized; P3
counted), verify result, authored tests when 6.5 ran, repo state + branch,
stale_review flags. Then ONE question: **"Apply the P2 fix-batch? The P3
cosmetics too?"** — never fix unasked. Emit `PHASE summary end`.

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
mistake a DIY run for a full-lane run.

<!-- /orc:layer -->
