# Phase — Integration (worktrees)   (id: `integration`)

> **`/orc` phase file** — read when the phase fires. One consumer, so it stays home (`../../../_shared/phases/README.md`). `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Integration (worktrees only)

Emit `PHASE integration start`. Merge worker branches; conflicts → resolver
subagent (Opus 4.8 medium) given BOTH tasks' specs/intents, not just the diff.
Record merge state in checkpoint; emit `PHASE integration end`.

<!-- /orc:layer -->
