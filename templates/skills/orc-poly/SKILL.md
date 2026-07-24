---
name: orc-poly
description: >
  Poly-repo planning lane — plan ONE change that spans two or more repos
  (BE endpoint + FE UI, service + its gRPC consumer, etc.) without drift. Use
  for "/orc-poly", "plan this across both repos", "coordinate a change over
  these repos". Runs in the HOST repo (where you are); you paste the path of
  each PEER repo. It peeks at every repo's wiki + crosslink (read-only) — or,
  when a wiki is missing, asks you which folders/files to dig — gathers the
  cross-repo context by asking questions until intent is pinned, then writes
  a source-of-truth doc set (poly-context.md, interface-contract.md,
  poly-spec.md) into poly-repo-implementation/<slug>/. Each iteration offers:
  pass to orc-plan (splits ONE plan per repo, each written into its repo,
  all pinned to the frozen interface contract) · stop & chat · add more
  context. PEER source is READ-ONLY; the only peer write is the handoff plan.
  It never builds — it plans the split so each repo's later /orc run stays on
  contract.
---

# ORC-POLY (poly-repo planning)

The coordination lane. A single change often lands in two places at once — a
new endpoint in the **backend** and the UI that calls it in the **frontend**,
or a service and the gRPC consumer downstream. Built one repo at a time from
memory, the two halves **drift**: the FE assumes a field the BE never returns,
the consumer expects a status the service never sends. orc-poly removes the
drift by planning **all the repos together, once**, and freezing the boundary
they share into a single **interface contract** that every repo's plan is
pinned to.

orc-poly is a **planner, not a builder**. It gathers cross-repo context, writes
the source-of-truth docs, and (on your go-ahead) drives the split into one plan
per repo. The actual implementation happens **later, per repo, in its own
session** via plain `/orc` (or `/orc-mini`) pointed at that repo's plan — which
carries the same frozen contract, so no repo drifts from the others.

**Roles.** **HOST** = the repo you are in now (orc-poly runs and writes its
docs here). **PEER** = every other repo, given by pasted path — one or many
(FE→BE, BE→another service's gRPC, …). PEER **source is READ-ONLY**: orc-poly
reads it to learn where/how the change lands, and the *only* thing ever written
into a PEER is its handoff plan file (Phase P5). It never edits peer source,
never commits, never pushes — in any repo.

**Tier.** Not effort-gated (the effort guard matches the exact skill name
`orc`, never `orc-poly`), so this lane runs at whatever tier the chat is on.
Cross-repo reasoning is better at Opus high; it is correct at any tier.
**Grounding precedence** everywhere a wiki is consumed:
`code > fresh wiki > stale wiki (hints) > model priors`.

**Worked example** (orient only — never execute from it):
`examples/poly-run-mock.md`. Gathering + question-loop protocol:
`references/gather.md`. Doc-set + poly-spec schema: `references/poly-spec.md`.

## Behavior trace (PERMANENT — always on)

Resolve `log_dir` (`../orc/config.md` default ← `.claude/orc.config.yaml`) at
start and follow `../orc/references/trace-protocol.md`. Write
`log_dir/.current` = `run-poly-<slug>-<DDMMYY>-<HHMMSS>.txt` before the first
sub-dispatch (the `orc-trace.js` hook also bootstraps it). Record each marker
with its REAL timestamp AS ITS EVENT HAPPENS; a step ending with
**zero new trace lines is a protocol violation**. Marker set (actor `orc`): `PHASE P0..P5`,
`GATE` (per-repo knowledge probe verdict), `WIKI-CONSULT tier=<tier> ::
<repo>` (every wiki read), `DISPATCH`/`VERIFY` (around the planner in P5),
`FINISH`. Narration is dispatched, not remembered — as a single-dispatch lane,
dispatch the trace writer ONCE at run end with that event list plus `decisions`
(the WHY: peers resolved, what the contract froze), then delete `.current`.

## Phase P0 — Intake (identify HOST + PEERs + the change)

1. HOST = the current repo (confirm it is a git repo; if not, say so and stop).
2. Collect **PEER(s)** from the user — at least one; more can be added later
   (P4 choice 3). Each PEER input is EITHER a filesystem path OR a **crosslink
   node name** (a `nodes[].name` slug in the HOST's
   `.claude/orc-crosslink.config.yaml`). Resolve each per **PEER resolution**
   below; a slug that resolves also gives the host↔peer relation for free.
3. Restate the cross-repo change in one or two lines and name, provisionally,
   which repo owns which side (e.g. "A/BE owns the new endpoint; B/FE owns the
   new screen that calls it"). Derive `<slug>` (kebab-case) from the change.
4. `PHASE P0`. Nothing is written yet.

**PEER resolution (path or crosslink slug).** For each PEER the user gives:
- **Looks like a path** (contains a `/` or `\`, or exists on disk) → use it as
  the peer repo root; confirm it exists and looks like a repo, then **ask its
  relation to the HOST** (which side owns/consumes the boundary), since a raw
  path carries no edge info.
- **Otherwise treat it as a crosslink slug** → read the HOST's
  `.claude/orc-crosslink.config.yaml` (the `orc crosslink` graph). If it matches
  a `nodes[].name`, resolve that node's `repo_path` as the peer root AND read
  the `links[]` edges between `self` and that node to **auto-derive the
  relation** (the `via:` kind + direction — we consume it / it consumes us); no
  need to ask. Confirm the resolved path exists.
- **Slug doesn't match / no config** → do NOT guess. Say which input was
  unrecognized, then **list every available `nodes[].name`** from the config
  (or "no crosslink config found") and offer two ways forward: pick a correct
  slug from the list, or paste the peer's filesystem path (then answer its
  relation to the HOST). Loop until every PEER is resolved.

## Phase P1 — Knowledge gate (per repo; NON-blocking)

For HOST **and each PEER**, decide what grounding exists. A missing wiki is
**never a blocker** — it just changes how you scope (ask the user), it never
stops the chat and never falls back to another lane.

- **HOST wiki:** probe existence with `orc wiki status` — the deterministic CLI
  in `../_shared/detecting-artifacts.md`, never an ad-hoc `find` (`.claude` is
  hidden). Present → compute the tier from `.claude/orc/wiki-meta.json` per
  `../orc-wiki/references/staleness.md` (FRESH/AGING/STALE).
- **PEER wiki:** the `orc` CLI is CWD-scoped, so for a peer at another path read
  its `wiki/INDEX.md` + `wiki-meta.json` **directly at the peer path** (compute
  the tier the same way). Absent there → treat as no wiki.
- `WIKI-CONSULT tier=<FRESH|AGING|STALE|none> :: <repo>` on every read (emit
  even for `none`). `GATE knowledge <repo>=<wiki|ask>` per repo.

**Both/all repos have a usable wiki** → read the relevant feature/reference
pages, and read the **crosslink boundary tags** each repo publishes under its
`wiki/crosslink/` (the orc-wiki cross-repo subsystem — read-only) to understand
the existing seam between them BEFORE digging the source. This is the cheap,
high-signal path.

**A repo has no usable wiki (or the topic isn't covered)** → **ask the user**
for that repo: the folder(s)/file(s) to dig into, OR a pattern/keyword from
their context to dig against (never a blind repo-wide scan). A STALE wiki doc
may still ride along as hints (precedence above). This is the "bounce to the
user" branch — do it per repo that lacks coverage.

## Phase P2 — Recon + gather (read-only, all repos)

Read the pointed-at files across HOST and every PEER (read-only; peer source is
never modified) to learn, for each side, **where** the change lands and **how**
the local conventions do it. Then close the context gaps: **keep asking
questions until the intent is fully pinned** — the shared boundary shape, each
side's responsibilities, auth, error/empty states, versioning, naming. Ask in
tight batches; do not proceed to write while a load-bearing ambiguity remains.
The goal of P2 is that the interface contract (P3) can be written with **no
guesses**.

## Phase P3 — Write the source-of-truth doc set

Write into the HOST repo at `poly-repo-implementation/<slug>/` (a visible,
committed deliverable — never inside `.claude/`). Per `references/poly-spec.md`:

- **`poly-context.md`** — the cross-repo understanding: the change, the repos
  and their roles, per-repo touch points (real files), open decisions resolved
  in P2.
- **`interface-contract.md`** — the **frozen boundary** both sides share: the
  endpoint/RPC/event shape — request + response schema, status/error codes,
  auth, pagination, versioning. This is THE anti-drift artifact; every repo's
  plan is pinned to it.
- **`poly-spec.md`** — the machine-readable handoff carrying the
  `orc-poly:spec` marker and a `repos:` block (per repo: role, absolute path,
  in-scope files, per-repo requirements), each requirement citing the contract
  section it depends on. This is what the planner splits on in P5.

Re-run P3 (rewrite/extend the docs) whenever P2 gains new context.

## Phase P4 — Iterate (ask exactly these three, every iteration)

After the docs are written/updated, ask the user to pick ONE:

1. **Pass to orc-plan** — freeze it and split into per-repo plans (→ P5, then
   normal build in each repo).
2. **Stop & chat** — keep refining; the user gives more input, then loop back
   to P2/P3 (nothing is frozen).
3. **Add more context** — the user pastes another PEER repo path, or generated
   knowledge / any docs that sharpen the picture; ingest it, then loop back to
   P1/P2/P3.

Only choice 1 leaves this loop. Choices 2 and 3 re-enter the gather.

## Phase P5 — Split handoff (dispatch the planner in poly mode)

On choice 1, hand `poly-repo-implementation/<slug>/poly-spec.md` to the shared
planner via `/orc-plan` (poly mode — the planner self-activates on the
`orc-poly:spec` marker; see `../../commands/orc-plan.md` and the planner agent).
`DISPATCH orc-planner :: poly <slug>` before the spawn. The planner emits **one
plan per repo**, each scoped to that repo's in-scope files and each embedding
the **frozen `interface-contract.md`**:

- HOST plan → `poly-repo-implementation/<slug>/<host-repo>-implementation-plan.md`.
- Each PEER plan → **written INTO that peer repo** at
  `poly-repo-implementation/<slug>/<peer-repo>-implementation-plan.md` (the one
  and only peer write — a plan file, never source).

`VERIFY planner actual=<model>/<effort>` from the return (downgrade → warn).
Then tell the user the handoff clearly: **open each repo in its own fresh
session and run `/orc` (or `/orc-mini`) pointed at that repo's plan** — every
plan pins the same contract, so no repo drifts. orc-poly stops here; it never
builds.

## Boundaries

- **PEER source is READ-ONLY.** The only write into any PEER is its
  `<repo>-implementation-plan.md` in P5. Never edits peer source, never commits
  or pushes in any repo.
- **HOST writes** live only under `poly-repo-implementation/<slug>/`. It is a
  committed deliverable (the carried source of truth), not a hidden run
  artifact.
- **Never builds.** No executors, no smoke gate, no ship. The split plans are
  built later, per repo, by plain `/orc` — with the frozen contract preventing
  drift.
- **Wiki/crosslink are read-only inputs**, and a missing wiki is never a
  blocker — orc-poly asks the user for scope instead.
- Reminder: to see usage limits, tell the user to run `/usage` (never invoke it
  programmatically).
