---
description: Lightweight orchestrator — one Sonnet 5 high subagent, skips review/verify/summary
---

Use the **orc-mini** skill for fast implementation: same intake (lighter — Q1–Q4,
soft sign-off), intent-spec, planning, run folder, and ship as the full skill, but
skip full review, verify, and summary. Dispatch ONE Sonnet 5 high-effort subagent
for implementation (still write tests if the project has them), then run a
build+test **smoke gate** (blocks ship on red) and an **opt-in test-authoring ask**
before ship. Switchable to full flow on request.

Request: $ARGUMENTS
