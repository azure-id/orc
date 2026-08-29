# Phase — Summary   (id: `summary`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Summary

Emit `PHASE summary start`. Report: tasks/waves/dispatches (scores + overrides), escalations,
needs_context events, findings by severity (P0/P1 resolved; P2 itemized; P3
counted), verify result, authored tests when 6.5 ran, repo state + branch,
stale_review flags. Then ONE question: **"Apply the P2 fix-batch? The P3
cosmetics too?"** — never fix unasked. Emit `PHASE summary end`.

<!-- /orc:layer -->
