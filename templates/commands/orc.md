---
description: Full orchestrator — intake, planning, scored parallel subagents, review, verify, ship
---

Use the **orc** skill to handle this request end to end: Phase 0
intake (with intent-spec sign-off), planning, per-task scoring, spawning scored
subagents in conflict-free waves, review, verify, and ship. Follow the skill's
SKILL.md exactly.

If the input IS a plan (pasted planning-output, a `plan-{name}.md` path, or an
`orc/planner/{name}/` checkpoint) rather than a request, the skill switches to
its plan-handoff entry contract (`references/plan-handoff.md`) — it re-grounds
and re-scores the plan in this session, then runs Phase 2–8; it never executes a
handed-off plan task-by-task ad hoc.

Request: $ARGUMENTS
