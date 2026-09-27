---
description: Poly-repo planning — plan ONE change across 2+ repos, freeze the shared interface contract, split into one plan per repo (no drift)
---

Run the **orc-poly** skill in the HOST repo; paste the path of each PEER repo.
It asks until the shared boundary is pinned, then writes `poly-context.md`,
`interface-contract.md` and `poly-spec.md` into
`poly-repo-implementation/<slug>/`. The `orc-poly:spec` marker makes the planner
split ONE plan per repo, each pinned to `interface-contract.md`. PEER source is
read-only; it never builds.

Change / peer path(s): $ARGUMENTS
