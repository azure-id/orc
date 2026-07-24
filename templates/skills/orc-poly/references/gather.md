# orc-poly — gathering & the question loop

Load at Phase P1–P2. This is *how* orc-poly turns two-or-more repos plus a
vague "build the endpoint and the screen" into a contract precise enough that
each repo can be planned and built in isolation without drifting.

## The cheap path first: wiki + crosslink

When a repo has a usable (FRESH/AGING) wiki, spend the tokens there before you
open source files:

- Read the repo's `wiki/INDEX.md`, pick the feature/reference pages whose
  keyword lines match the change, and pull their `Contracts & shapes` +
  `Testing map` sections and the cross-cutting maps (API surface / data model)
  when relevant.
- Read the federation **ATLAS first** when it exists (`wiki/crosslink/atlas.md`
  — `../orc-wiki/references/crosslink.md` ATLAS section, v0.33.0): its
  Federation map + per-node profiles say what each repo provides/consumes and
  which peer wiki docs answer which questions, so every subsequent peek is
  targeted. Newest-wins across copies (trust the newer `generated` stamp).
- Read the **crosslink boundary tags** each repo publishes (the orc-wiki
  cross-repo subsystem). These describe the *existing* seam between the repos —
  the endpoints one repo exposes and the other consumes. They are the single
  highest-signal read for understanding how the two sides already talk, so you
  extend the seam instead of reinventing it.
- Precedence holds: real code always outranks any wiki claim; re-check a claim
  against the file before you pin it into the contract.

## The fallback path: ask, don't blind-scan

A repo with no usable wiki (absent, or the change's area isn't covered) is
**not a blocker**. Ask the user, for that repo specifically:

- **Where** — the folder(s) or file(s) where this change lands (the router/
  controller dir for a new endpoint; the feature/screen dir for new UI), OR
- **A pattern** — a keyword/route/type name from their context to search
  against.

Then dig only there. Never launch a blind repo-wide scan; the user's pointer is
cheaper and more accurate than guessing. A stale wiki doc may still ride along
as hints.

## The question loop — keep asking until intent is pinned

The deliverable is a boundary written with **no guesses**. Before writing the
contract, every load-bearing ambiguity must be resolved. Ask in tight batches;
do not start writing while one of these is still open:

- **Boundary shape** — the exact request and response: fields, types,
  nullability, the wire format (REST JSON / gRPC message / event payload).
- **Ownership** — which repo produces each side of the boundary, and which
  merely consumes it.
- **Auth & access** — how the call is authenticated/authorized; who may call it.
- **Errors & edge states** — status/error codes, the empty/zero result, the
  loading and failure states the UI must render.
- **Versioning & compatibility** — is this additive, or does it change an
  existing contract other consumers depend on?
- **Naming** — the route/RPC/type names, so both sides land on the same
  identifiers.

If the user answers vaguely, propose a concrete default and ask them to confirm
or correct — never silently pick and move on. When a batch closes cleanly with
nothing load-bearing left open, proceed to write the doc set.

## What "enough context" means

Enough = you could hand the `interface-contract.md` to a stranger on either
repo and they would implement their side and it would fit the other side on the
first try. If you cannot honestly say that yet, you still have questions to ask
or files to read — stay in the loop.
