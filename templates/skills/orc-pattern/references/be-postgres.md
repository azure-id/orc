# Playbook — Postgres data-access (BE, cross-cutting)

Generic best-practice defaults for **Postgres query & data-access code** — the
`getDataUser`-style layer: repositories, DAOs, query builders, raw SQL, ORM calls.
Unlike a framework playbook this is **cross-cutting**: it co-applies on TOP of the
task's framework pattern (Express/FastAPI/NestJS/Django/Go/…) whenever a task
touches the DB layer. The codifier OVERRIDES the Conventions with the project's
observed data-access style; the Invariants always stand. Never connects to a
database — everything here is reconciled from the repo's own files.

**Activation triggers:** Postgres, `pg`, `psycopg`, `asyncpg`, `pgx`, `lib/pq`,
`Npgsql`, Prisma `provider = "postgresql"`, `postgrex`/Ecto, SQLAlchemy,
`repository`/`dao`/`queries` modules, `.sql` files, migrations, "query the DB",
`SELECT`/`INSERT`/`UPDATE`/`DELETE`, `getX`/`findX`/`listX` data-access functions.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- Access path: match the project — raw driver, query builder (Knex/Drizzle/sqlc),
  or ORM (Prisma/TypeORM/SQLAlchemy/ActiveRecord/Ecto). NEVER introduce a second
  client/ORM alongside the one already in use.
- Where data-access lives: match the project's layout (`repositories/`, `dao/`,
  `db/queries/`, `models/`, co-located `*.sql`) and its file-per-resource split.
- Column selection: match the project — if it lists explicit columns, list them
  (no `SELECT *`); if it maps rows to a DTO/entity, return that same type.
- Naming: match the project's table/column case (usually `snake_case`) and its
  mapping to app-side field names.
- Error surface: match how the project turns a DB error / not-found into an app
  error (typed error, `Result`, nullable return) — don't invent a new shape.
- Migrations: match the project's tool (Prisma, Alembic, Flyway, Liquibase,
  `db/migrate`, sqlc) and file convention.

## Invariants (ALWAYS — BLOCKING)
- **Parameterized / bound queries ONLY.** Never build SQL by string
  concatenation or interpolation of any caller-supplied value — bind every
  parameter. (SQL-injection.) Dynamic identifiers (table/column names) must come
  from a fixed allow-list, never raw input.
- **No credentials or connection strings hardcoded** in data-access code — read
  from the project's existing config/env source.
- **Atomic multi-write = one transaction.** Two+ writes that must all-or-nothing
  succeed run in a single transaction with a clear commit/rollback path.
- **No DDL or migrations from a request/data-access function** — schema changes
  go through the project's migration tool, not inline.
- **Use the configured connection pool** — never open a per-call connection or
  bypass the pool.
- **Never leak DB errors verbatim** to the caller/response (no raw driver
  messages, SQLSTATE, or query text in a user-facing error).

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- Every new query uses bound parameters — no user value inside the SQL string
  (visible in the diff).
- New data-access functions go through the existing client/pool, not a fresh
  connection.
- Multi-write operations are wrapped in a transaction (visible in the code).
- Build/type-check clean IF the project uses a typed stack; lint clean IF it has
  a linter.
- Advisory only (never gate; needs tooling/data the project may lack): `EXPLAIN`
  plan review, index coverage for new filter/join columns, N+1 audit under load.

## Worked example (SHAPE REFERENCE — the project's observed layer ALWAYS wins)
Imitate the SHAPE (bound params → existing client → typed return → transaction on
multi-write), never this exact driver/naming when the project differs.

```ts
// repositories/users.ts — bound params, pooled client, explicit columns, typed return
import { pool } from "../db/client";           // the project's existing pool
import type { User } from "../types";

export async function getDataUser(id: number): Promise<User | null> {
  const { rows } = await pool.query(
    `SELECT id, email, name, created_at
       FROM users
      WHERE id = $1`,                            // $1 bound — never `${id}`
    [id],
  );
  return rows[0] ?? null;                        // not-found handled explicitly
}

// atomic multi-write → one transaction
export async function transferCredits(fromId: number, toId: number, amount: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [amount, fromId]);
    await client.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [amount, toId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;                                   // wrapped to a typed app error upstream
  } finally {
    client.release();                            // always back to the pool
  }
}
```

## Delivery order
migration (if schema changes) → data-access function (bound query) → app-error
mapping → wire into the calling service → test.
