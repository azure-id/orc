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

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- `go build ./...` and `go vet ./...` clean.
- `golangci-lint run` clean IF the project uses it.
- Tests pass under the **race detector** (`go test -race ./...`).
- No bare `_` error discards and no un-wrapped propagated errors in the diff.
- For gRPC changes: proto regenerated + committed; server starts and serves.
- Advisory only (never gate; requires tooling the project may lack): coverage
  target on the new surface, p95 latency budget.

## Worked example (SHAPE REFERENCE — the project's observed layout ALWAYS wins)
Imitate the SHAPE (consumer-defined interface → implementation with wrapped
errors → ctx-aware worker), never this exact layout/naming when the project differs.

```go
// order/service.go — consumer-defined contract + implementation
type OrderStore interface {
    GetOrder(ctx context.Context, id int64) (*Order, error)
}

func (s *Service) OrderSummary(ctx context.Context, id int64) (*Summary, error) {
    order, err := s.store.GetOrder(ctx, id)          // ctx threads down to I/O
    if err != nil {
        return nil, fmt.Errorf("order summary %d: %w", id, err)  // wrap, keep chain
    }
    return buildSummary(order), nil
}

// order/worker.go — goroutine with a clear lifecycle
func (s *Service) RunDigest(ctx context.Context, every time.Duration) error {
    t := time.NewTicker(every)
    defer t.Stop()
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()                          // clean shutdown path
        case <-t.C:
            if err := s.sendDigest(ctx); err != nil {
                s.log.Error("digest", "err", err)     // handle, never discard
            }
        }
    }
}
```

## Delivery order
proto/interface (contract) → implementation → data/transport wiring →
table-driven test (`-race`).
