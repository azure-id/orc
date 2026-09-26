---
description: Stacked-PR planner — decide where the PR cut lines go, prove each layer stands alone, write stacked-pr/<slug>/stack-plan.md (plans only, never touches git)
---

Run the **orc-pr-setup** skill. It plans a stack of pull requests for a change
too big to review as one, and writes `stacked-pr/<slug>/stack-plan.md`. It plans
only: no branches, commits, pushes or PRs — that is `/orc-pr-driver`. A ticket
is required. Every uncertain boundary STOPS and asks you, one decision at a time.

Ticket / change / spec: $ARGUMENTS
