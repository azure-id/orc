---
description: Requirement Planner — turn a detailed request or analyst spec into a grounded task plan (plan only)
---

Use the **orc-planner** subskill via the orchestrator. Take the input (a
detailed request, or a System Analyst requirement-spec) and produce a grounded,
right-sized, dependency-checked plan in orc's planning-output format. If the
request is below the plannable floor (an observable outcome + an identifiable
repo area), do not plan — recommend `/orc-analyze` requirement mode instead.
Ground declared files from the repo/wiki when run standalone; trust the analyst
spec when chained. Every declared path carries a grounding attestation
(exists|new + evidence), every task a sliced source-cited acceptance[] plus the
requirements[] it implements — the orchestrator spot-checks grounding AND
recomputes coverage (an orphan requirement bounces the plan), plus cycle and
same-file collision checks. Show the plan once for approval/edits (task
breakdown/approach only), then offer to take it into a build or save it as
plan-{name}.md and stop. The orchestrator dispatches the planning to a subagent.

Request / spec: $ARGUMENTS
