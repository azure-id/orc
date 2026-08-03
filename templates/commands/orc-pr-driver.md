---
description: Stacked-PR driver — execute a stack plan: one branch per layer, mandatory per-layer green gate, gh stack submit, then sync/rebase/bottom-up merge
---

Run the **orc-pr-driver** skill. It takes an approved stack plan and makes the
layers real: `gh stack init` → per layer `gh stack add`, only that layer's files,
the **mandatory green-gate ladder** (build → tests → lint scoped to *that layer's
own base* → the repo's own pre-commit hooks, never `--no-verify`) → commit →
`gh stack submit`, PR bodies filled from the resolved template, then the ongoing
`gh stack sync` / `rebase --upstack` / `modify` care and the bottom-up merge.

**Three ways in — all read the same file** (`stacked-pr/<slug>/stack-plan.md`,
probed with `orc pr stack status`):

1. `/orc-pr-setup` planned it (the normal path),
2. ORC's ship phase handed it over (`stacked-pr/<slug>/STACK-FROM.md`),
3. **you wrote the plan yourself** — run `orc pr stack template` for the skeleton,
   fill it in, and start here. No planner run required.

It **refuses to run** — naming the exact missing field — on a plan with an
unanswered uncertain seam, a missing ticket, a layer with no purpose or value
class, a FOUNDATION layer that names no consumer, fewer than 2 layers, or a red
build. It never fills a field in for you.

When the change already exists in the worktree, your work is snapshotted to a
scratch branch BEFORE any branch surgery, every layer is materialized from that
snapshot file-by-file, and a completeness gate proves the union of the layers
equals the snapshot exactly before anything is submitted.

Slug / plan path / stack action: $ARGUMENTS
