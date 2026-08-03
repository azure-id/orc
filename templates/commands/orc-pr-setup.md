---
description: Stacked-PR planner — decide where the PR cut lines go, prove each layer stands alone, write stacked-pr/<slug>/stack-plan.md (plans only, never touches git)
---

Run the **orc-pr-setup** skill. It plans a **stack of pull requests** for a
change that is too big to review as one PR: ordered layers, each with a one-line
purpose, a value class (`USER | OPERATOR | CONTRACT | FOUNDATION`), an explicit
file list, measured LoC/file budgets and a dependency reason — written to
`stacked-pr/<slug>/stack-plan.md`.

It **plans only**: no branches, no commits, no pushes, no PRs. That is
`/orc-pr-driver`.

Two entry modes, auto-detected: **greenfield** (nothing written yet — a spec or
ticket) and **orc-run** (the change already exists in the worktree, e.g. ORC just
built it — the split is file-granular; hunk surgery is forbidden). A ticket
number is required. The PR-description template is resolved from the ORC template,
then the project (`.github/`, `docs/`), then a `CLAUDE.md` section — and if none
exists you get three recommended options to pick from; declining them all means
the stack is skipped and the change ships as one regular PR.

**P0 hard gate:** every uncertain boundary STOPS the lane and asks you, one
decision at a time, with the LoC/file/CI cost of each option and a recommendation
— and records your answer under `## Decisions`. Same-tier files, shared helpers,
refactor mixed with behavior change, ordering ambiguity and oversize atoms are all
uncertain by definition. It never guesses a seam.

When the plan is written it shows the layer table, states that nothing has been
created yet, and hands off to `/orc-pr-driver`.

Ticket / change / spec: $ARGUMENTS
