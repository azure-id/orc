---
description: Requirement Planner — turn a detailed request or analyst spec into a grounded task plan (plan only)
---

Use the **orc-planner** subskill via the orchestrator. Take the input (a
detailed request, or a System Analyst requirement-spec) and produce a grounded,
right-sized, dependency-checked plan in orc's planning-output format. Ground
declared files from the repo/wiki when run standalone; trust the analyst spec
when chained. Show the plan once for approval/edits (task breakdown/approach
only), then offer to take it into a build or save it as plan-{name}.md and stop.
The orchestrator dispatches the planning to a subagent.

Request / spec: $ARGUMENTS
