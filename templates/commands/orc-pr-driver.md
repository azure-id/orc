---
description: Stacked-PR driver — execute a stack plan: one branch per layer, mandatory per-layer green gate, gh stack submit, then sync/rebase/bottom-up merge
---

Run the **orc-pr-driver** skill. It executes `stacked-pr/<slug>/stack-plan.md`
(probed with `orc pr stack status`; written by `/orc-pr-setup`, by you, or
handed over as `STACK-FROM.md`): one branch per layer, a mandatory green gate
per layer, then `gh stack submit` and the merge care. It refuses a plan with an
open field or a red build, and never fills a field in for you.

Slug / plan path / stack action: $ARGUMENTS
