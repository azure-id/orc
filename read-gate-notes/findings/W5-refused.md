# W5 — refused

**Date:** 2026-09-07 · **Class: none — nothing was built.**

`03-PLAN.md` §3 W5 is gated on `findings/W0-read-cost.md` and carries its own
instruction: *"Do not start this wave to make the release feel complete."*

W0 did not earn it. This file is the record the plan asks for.

---

## What W5 would have been

1. **D8** — a `context-reader` row in `EXTRA_SLOTS`, so a delegated read could
   go to a cheap or foreign worker, inheriting the journal, the spend log, the
   credential triangle, the `declared_files` fence and the resume path.
2. **D3 option (c)** — the block message names that dispatch instead of naming
   the ladder step.

---

## Why it is refused

**The population does not exist.** At the threshold this release actually
shipped — **1000 lines**, derived in W2 from measured break-even, not the
borrowed 350 — W0 counted **five** main-session full reads across 239
transcripts. After read-ladder exception 1 and the plan-document reality in
`W0-read-cost.md` §6, the run-scoped addressable set rounds to approximately
zero.

`02-risks-and-choices.md` D8 wrote the disqualifying sentence itself:

> If oversized reads are rare, a slot is infrastructure for nothing.

They are rare. A seventh `EXTRA_SLOTS` position, a seventh set of hold-backs,
a seventh row in `EXTRA_LANE_SHAPES` and its golden test in both directions —
all for a population of five reads — is cost with no measured return.

**A second reason, independent of the count.** A `context-reader` slot inherits
*"a lane that sends work off Claude without saying so"*, so it must announce.
That is a user line on every delegated read. At this volume the announcements
would outnumber the tokens saved.

**And D3 (c) has nothing to point at.** A block message that names a dispatch
which does not exist would be worse than the one that shipped, which names two
things that do: `offset`/`limit`, and an ordinary agent dispatch.

---

## What shipped instead

D3 option **(a)** — the block names the ladder step, plus a plain agent
dispatch and the config escape. All three exist today and cost nothing to
build. `templates/hooks/orc-read-gate.js` rung 8.

---

## What would re-open it

The same trigger as W0 §11, and for the same reason: a workload where the
orchestrator must read bulk source it will not edit. If oversized run-scoped
reads ever exceed roughly 5% of price-weighted main-session ingest, D8 becomes
worth costing again — and by then `orc extra` will have moved, so re-derive it
rather than reading this file as a design.
