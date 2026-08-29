# Phase — Security pass (opt-in)   (id: `security`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Security pass (opt-in)

Only when config `security_review` is `on`/`ask` (default `off`) AND a task
scored **≥ 70** (reuses the risk floor). `ask` → one P0 prompt; `on` →
silent. Dispatch the reviewer with `phase=security` + changed files +
`../../../_shared/phases/security-checklist.md` (load only now). Same ladder, same
hard-rule-5 handling; report-only.

<!-- /orc:layer -->
