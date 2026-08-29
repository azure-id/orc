# Phase — Integration (worktrees)   (id: `integration`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Integration (worktrees only)

Emit `PHASE integration start`. Merge worker branches; conflicts → resolver
subagent (Opus 4.8 medium) given BOTH tasks' specs/intents, not just the diff.
Record merge state in checkpoint; emit `PHASE integration end`.

<!-- /orc:layer -->
