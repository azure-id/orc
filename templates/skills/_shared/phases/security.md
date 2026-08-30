# Phase — Security pass (opt-in)   (id: `security`)

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

## Security pass (opt-in)

Only when config `security_review` is `on`/`ask` (default `off`) AND a task
scored **≥ 70** (reuses the risk floor). `ask` → one P0 prompt; `on` →
silent. Dispatch the reviewer with `phase=security` + changed files +
`security-checklist.md` (load only now). Same ladder, same
hard-rule-5 handling; report-only.

<!-- /orc:layer -->

<!-- orc:layer composed -->

## Phase: Security pass

<!-- diy:when security=off -->
The security pass is OFF in this flow — skip silently.
<!-- /diy:when -->
<!-- diy:when security=ask -->
When at least one task scored at or above the risk floor (70), ask the user
once after review whether to run the security pass; on yes, run it exactly as
the full lane's Phase 5.5 (reviewer re-dispatched with the checklist from
`.claude/skills/_shared/phases/security-checklist.md`, sweeping only the
run's changed files).
<!-- /diy:when -->
<!-- diy:when security=on -->
When at least one task scored at or above the risk floor (70), dispatch the
security pass without asking — the full lane's Phase 5.5 with the checklist
from `.claude/skills/_shared/phases/security-checklist.md`, sweeping only the
run's changed files.
<!-- /diy:when -->
<!-- diy:when security=always -->
Dispatch the security pass on EVERY run of this flow, regardless of task
scores — the full lane's Phase 5.5 with the checklist from
`.claude/skills/_shared/phases/security-checklist.md`, sweeping only the
run's changed files. (This flow removes the risk-floor trigger, not the
pass's mechanics.)
<!-- /diy:when -->

<!-- /orc:layer -->
