---
description: Poly-repo planning — plan ONE change across 2+ repos, freeze the shared interface contract, split into one plan per repo (no drift)
---

Run the **orc-poly** skill. You are in the HOST repo; paste the path of each
PEER repo the change also touches (one or many — FE→BE, BE→another service's
gRPC, …). orc-poly peeks at every repo's wiki + crosslink read-only (or, when a
wiki is missing, asks you which folders/files to dig — never a blind scan),
gathers the cross-repo context by asking questions until the shared boundary is
pinned with no guesses, then writes a source-of-truth doc set
(`poly-context.md`, `interface-contract.md`, `poly-spec.md`) into
`poly-repo-implementation/<slug>/`. Each iteration it offers three choices: pass
to orc-plan · stop & chat · add more context (another repo path or pasted
knowledge). On "pass to orc-plan" the shared planner self-activates poly mode on
the `orc-poly:spec` marker and splits ONE plan per repo — the HOST plan into
this repo, each PEER plan written into that peer repo — every plan pinned to the
frozen `interface-contract.md`. You then build each repo later, in its own
session, with plain `/orc`, and no repo drifts. PEER source is READ-ONLY (the
only peer write is its plan file); orc-poly never builds.

Change / peer path(s): $ARGUMENTS
