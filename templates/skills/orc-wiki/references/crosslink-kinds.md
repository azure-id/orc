# Reference — Crosslink Kinds Catalog

The **kinds** taxonomy for cross-repo integration points. A kind labels *what
sort of boundary* an edge crosses. This catalog is curated-but-open: the
`orc crosslink` CLI reads it to offer a multi-pick, and `orc-wiki` uses it to
decide which call sites count as a boundary of a given linked repo.

> **Documented drift (not lint-checkable):** `bin/cli.js` carries a mirror of
> this list in its `orc crosslink` composer (a `CROSSLINK_KINDS` constant),
> exactly like `DIY_PRESETS` mirrors `config.md`. Grow the catalog here AND in
> cli.js in the same change. The lint's ROOT is `templates/` and cannot see
> cli.js.

## Catalog

Backend (a repo that exposes or reaches an inter-service boundary):

| Kind | Boundary it marks | Detected at (provider side) |
|------|-------------------|-----------------------------|
| `grpc` | gRPC service/method | server handler / service registration |
| `rest-endpoint` | HTTP route the repo serves | router / controller definition |
| `graphql` | GraphQL resolver | schema type + resolver |
| `websocket` | WS channel the repo serves | ws handler / upgrade route |
| `message-queue` | queue/topic produced or consumed | kafka/rabbit/pubsub client |
| `webhook` | outbound webhook the repo fires | webhook dispatch call |
| `shared-db` | a datastore two repos both hit | repository/DAO on a shared schema |
| `cache` | shared cache (redis, …) | cache client keyspace |
| `object-storage` | shared bucket/blob store | storage client |
| `repository` | data-access repository layer | repository/DAO class |
| `auth/oidc` | identity/token boundary | auth middleware / token verify |
| `cron` | scheduled job that spans repos | scheduler registration |

Frontend (a repo that consumes a backend boundary):

| Kind | Boundary it marks | Detected at (consumer side) |
|------|-------------------|-----------------------------|
| `api-client` | typed/untyped REST client of a BE | fetch/axios client module |
| `graphql-client` | GraphQL client of a BE | apollo/urql client + query |
| `component-api` | a shared UI component contract | exported component props |
| `state-store` | shared client state contract | store slice / context |
| `websocket-client` | WS client of a BE channel | ws client hook |
| `sdk` | a generated/hand-written SDK wrapper | sdk package import |

## Rules

- **"Other" is always allowed.** The CLI multi-pick ends with an *Other — type
  your own* option; a typed kind that is not in this catalog is accepted
  verbatim (lowercase, dashes). New integration styles never block a compose.
- A kind is just a **label on an edge** — it carries no behavior of its own.
  `orc-wiki` matches a call site to a linked repo when the site's shape matches
  the edge's `via: <kind>` and the target node's `kinds` list contains it.
- Kinds are **not** a closed enum in the config schema — do not validate a
  node's `kinds` against this list beyond "lowercase slug". The catalog guides;
  it does not gate.
- When adding a kind, prefer an existing one over a near-synonym (`rest-endpoint`
  over `http`, `api-client` over `rest-client`) so provider/consumer edges of the
  same boundary use the same `via`.
