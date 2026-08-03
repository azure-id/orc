# Reference — layer taxonomy (where the cut lines go)

Loaded at Phase S3/S4. **Ordering principle: dependency direction = stack
direction.** Layer N may depend only on layers < N. The bottom layer has the
widest blast radius and is the least reversible (schema); the top is the
thinnest (docs, a flag flip).

## Generic tiers (the fallback — any stack)

`data/schema → store → domain logic → external adapter → wiring → transport →
async consumers → tests-at-scale → docs & flag flip`

Use the framework tiers below when they match; fall back to the generic four
(**data → logic → transport → wiring**) for anything unlisted.

## Backend service (Go / Java / Node / Python — layered service shape)

| # | Tier | What it contains | Typical value class |
|---|------|------------------|---------------------|
| 1 | **Migrations / schema** | DDL only. Deployable ahead of code, reversible | CONTRACT or FOUNDATION |
| 2 | **Models + repository / store** | structs/entities, queries, repo tests. Consumes 1 | FOUNDATION |
| 3 | **Domain / service logic** | business rules, unit-tested in isolation | FOUNDATION or CONTRACT |
| 4 | **Adapter / external client** | provider HTTP/gRPC client, signing, DTO mapping | FOUNDATION |
| 5 | **Wiring** | factory registration, config, DI, feature flag default-OFF | FOUNDATION |
| 6 | **Handler / route / API contract** | transport layer, request validation, response shape | CONTRACT |
| 7 | **Callbacks / async consumers** | webhook + queue handlers — separate from 6: different reviewer, different risk | CONTRACT or OPERATOR |
| 8 | **Tests-at-scale / e2e** | only when they would blow the budget of the layer they belong to | FOUNDATION |
| 9 | **Docs / dashboards / flag flip** | the flip that turns the feature on for users | USER or OPERATOR |

## Frontend

`types + API client → presentational component (+ stories/tests) → state/store →
page/route + wiring → flag flip`

## Separation rule (the one people break)

A **component** and its **handler** are different concerns → **different layers
by default**, even when both are small and were written in the same sitting.
Likewise:

- handler vs async consumer (webhook/queue),
- migration vs the code that reads the new column,
- provider adapter vs the domain logic that calls it,
- refactor/rename vs behavior change in the same file (this one is an UNCERTAIN —
  see `certainty-gate.md`).

## Value classes (every layer carries exactly one)

- **`USER`** — an end user or merchant sees a behavior change.
- **`OPERATOR`** — ops/on-call gains a capability (dashboard, script, better
  log/alert).
- **`CONTRACT`** — a consumer-visible API / schema / event contract lands,
  unblocking another team or repo.
- **`FOUNDATION`** — no external value; it enables named upper layer(s). Allowed
  (layer 1 of any stack is foundation by construction) but **capped**: it MUST
  name its consumer layer, at most **2 consecutive** FOUNDATION layers, and a
  FOUNDATION layer with no named consumer merges into its consumer.

No purpose → not a layer. No value class → not a layer.

## Layer ordering when there is no dependency

Two layers with no dependency between them can go in either order — which means
**the order is a review decision, not a technical one**, and that makes it an
UNCERTAIN (ask). Default recommendation when you ask: the layer that gives a
reviewer the most context first (usually schema/contract before the code that
consumes it).
