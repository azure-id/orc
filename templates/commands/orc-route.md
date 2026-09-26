---
description: You have a plan — this says which lane should build it, with the numbers it decided from. Plan-only: it refuses a request in words rather than guess
---

Use the **orc-route** skill. Zero agents, nothing is built. It routes a PLAN
only — the same definition `skills/_shared/phases/plan-handoff.md` uses. It reads
the plan's tasks, files, deps, `facets` and scores plus ORC's probes, then names
the lane, the runner-up and its cost, and each impossible lane with its fix. A
request in words gets a pointer to `/orc-plan`, never a guess.

Plan (paste it, or give a path): $ARGUMENTS
