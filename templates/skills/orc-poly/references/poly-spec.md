# orc-poly — the source-of-truth doc set

Load at Phase P3. All three files live in the HOST repo under
`poly-repo-implementation/<slug>/` — a visible, committed deliverable, never
inside `.claude/`. Together they are the carried source of truth: the context a
human reads, the boundary both repos are pinned to, and the machine-readable
spec the planner splits on.

## `poly-context.md` — the human-readable understanding

Free-form but structured. Cover:

- **Change** — one paragraph on what is being built across the repos.
- **Repos & roles** — a row per repo: name, absolute path, role
  (`host` | `peer`), the side of the boundary it owns or consumes.
- **Per-repo touch points** — the real files/dirs each repo changes (anchored
  to paths that actually exist — confirmed in P2), plus a one-line note of how
  the local conventions do this kind of change.
- **Decisions** — the ambiguities resolved during the P2 question loop, each
  with the answer that was pinned.

## `interface-contract.md` — the FROZEN boundary

The anti-drift core. This is the one artifact every repo's plan is pinned to,
so it must be exact and self-contained. Cover the shared seam precisely:

- **Endpoint / RPC / event** — method + path, or RPC name, or event topic.
- **Request** — every field: name, type, nullability, constraints; auth
  header/token.
- **Response** — success shape (every field, type, nullability), pagination if
  any.
- **Errors** — each status/error code and when it is returned.
- **Auth & access** — who may call it and how.
- **Versioning** — additive vs breaking; compatibility notes for existing
  consumers.

Once frozen (the user picks "pass to orc-plan"), treat it as immutable for the
run: if a later iteration changes the boundary, it is a NEW freeze — rewrite the
contract and re-split, never let a repo's plan diverge from it silently.

## `poly-spec.md` — the machine-readable handoff

Carries the marker `orc-poly:spec` on its first line so the planner
self-activates poly mode. Shape:

```
orc-poly:spec v1
slug: <slug>
contract: interface-contract.md        # the frozen boundary, relative to this file
git_head:                              # HOST HEAD short-sha at freeze time (staleness stamp)
repos:
  - name: <host-repo>
    role: host
    path: <absolute path>
    in_scope[]: <files/dirs this repo changes>
    requirements[]:
      - id: R1
        text: <what this repo must do>
        contract_ref: <section of interface-contract.md it depends on>
  - name: <peer-repo>
    role: peer
    path: <absolute path>
    in_scope[]: ...
    requirements[]: ...
```

Rules:

- Every requirement cites a `contract_ref` — a requirement that does not touch
  the boundary still names why it is in this poly change.
- `in_scope[]` paths are the ones confirmed to exist in P2 (new files are
  allowed, marked as such — the planner grounds them like any new path).
- One `repos[]` entry per repo. N peers are allowed; the planner produces one
  plan per entry.

## How the planner consumes it (P5)

The shared planner (`orc-planner-opus-4-8-med`), on seeing `orc-poly:spec`,
produces **one planning-output per `repos[]` entry**, each scoped to that
repo's `in_scope[]` and each embedding the frozen `interface-contract.md`
verbatim so the later per-repo `/orc` build cannot drift from the boundary. The
HOST plan is written under `poly-repo-implementation/<slug>/`; each PEER plan is
written into that peer repo at the same relative path (the only write orc-poly
ever makes into a peer).
