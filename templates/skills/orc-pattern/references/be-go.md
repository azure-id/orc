# Playbook — Go (BE)

Generic best-practice defaults for idiomatic Go services (HTTP + gRPC, with Redis
and SQL data layers). The codifier OVERRIDES the Conventions with the project's
observed style; the Invariants always stand. Covers the golang-pro surface:
concurrency, errors, interfaces, generics, project structure, testing — plus
transport (gRPC) and data (Redis/SQL).

**Activation triggers:** Go, Golang, goroutines, channels, context, gRPC, protobuf,
Redis, database/sql, sqlx, pgx, generics, `go.mod`, microservices.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- **Layout:** small, consumer-defined interfaces; composition over inheritance.
  Match the project's `cmd/` (entrypoints), `internal/` (private), `pkg/` (public).
- **Config:** functional options or env-loaded struct (match the project's approach).
- **Transport:** match the project's router (net/http, chi, gin, echo) and, for
  gRPC, its proto layout + generated-code location + interceptor chain.
- **Data:** match the project's DB access (database/sql, sqlx, pgx, or an ORM) and
  its Redis client usage (go-redis) + key-naming scheme.
- **Concurrency:** match the project's worker-pool / errgroup / channel patterns.

## Invariants (ALWAYS — BLOCKING)
**Errors & control flow**
- Handle EVERY error explicitly — no bare `_` discards of an `error`.
- Wrap propagated errors with `fmt.Errorf("...: %w", err)` (preserve the chain).
- Never `panic` for normal control flow.

**Concurrency**
- Pass `context.Context` as the first arg to all blocking/I/O ops; honor
  cancellation (`<-ctx.Done()`) in every worker — no goroutine without a clear
  lifecycle/shutdown path (no leaks).
- Protect shared state (mutex/channel); code must pass the race detector.

**Transport (HTTP / gRPC)**
- Every inbound handler/RPC threads the request `context.Context` down to I/O.
- Set server + client timeouts / deadlines; never an unbounded call.
- gRPC: return proper `status.Error(codes.…)` codes, never leak internal errors;
  validate every request message; register health + reflection as the project does.
- Never expose secrets, stack traces, or internal error strings to callers.

**Data (Redis / SQL)**
- Parameterized queries ONLY; never string-interpolate SQL.
- Always close/release rows, statements, and acquired connections (`defer`).
- Redis: set TTLs on cache keys (no unbounded growth); handle cache-miss as a
  normal path, not an error; never store secrets in plaintext cache values.
- Config/secrets (DSNs, Redis URLs, tokens) via env — never hardcoded.

## Validation gate (concrete)
- `go build ./...` and `go vet ./...` clean.
- `golangci-lint run` clean (if the project uses it).
- Tests pass under the **race detector** (`go test -race ./...`).
- For gRPC changes: proto regenerated + committed; server starts and serves.

## Worked-example shape
1. Interface (contract) + implementation with wrapped errors + `context.Context`.
2. A worker goroutine using `select { case <-ctx.Done(): … }` for clean shutdown.
3. A gRPC handler returning typed `status` codes; a Redis get-or-set with TTL.

## Delivery order
proto/interface (contract) → implementation → data/transport wiring →
table-driven test (`-race`).
