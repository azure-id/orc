## Phase: Security pass

<!-- diy:when security=off -->
The security pass is OFF in this flow — skip silently.
<!-- /diy:when -->
<!-- diy:when security=ask -->
When at least one task scored at or above the risk floor (70), ask the user
once after review whether to run the security pass; on yes, run it exactly as
the full lane's Phase 5.5 (reviewer re-dispatched with the checklist from
`.claude/skills/orc/references/security-checklist.md`, sweeping only the
run's changed files).
<!-- /diy:when -->
<!-- diy:when security=on -->
When at least one task scored at or above the risk floor (70), dispatch the
security pass without asking — the full lane's Phase 5.5 with the checklist
from `.claude/skills/orc/references/security-checklist.md`, sweeping only the
run's changed files.
<!-- /diy:when -->
<!-- diy:when security=always -->
Dispatch the security pass on EVERY run of this flow, regardless of task
scores — the full lane's Phase 5.5 with the checklist from
`.claude/skills/orc/references/security-checklist.md`, sweeping only the
run's changed files. (This flow removes the risk-floor trigger, not the
pass's mechanics.)
<!-- /diy:when -->
