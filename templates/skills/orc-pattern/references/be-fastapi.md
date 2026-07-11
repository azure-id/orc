# Playbook — FastAPI (BE)

Generic best-practice defaults for FastAPI. The codifier OVERRIDES the Conventions
with the project's observed style; the Invariants always stand.

**Activation triggers:** FastAPI, Pydantic, async Python, APIRouter, Depends,
BaseModel, endpoint, router, CRUD.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- One `APIRouter` per resource (match the project's file layout — e.g.
  `app/routers/<resource>.py`, CRUD split into `app/crud/` if the project does).
- Pydantic v2 schemas per resource (match the project's In/Out suffix + location).
- DI via `Depends(...)` (match the project's session/dependency names).
- Pagination style: match the project (limit/offset or cursor).

## Invariants (ALWAYS — BLOCKING)
- `async def` for all I/O paths; never block the event loop with sync I/O.
- Validate every request body/param with a Pydantic model — no raw dicts in.
- Parameterized queries ONLY; never string-interpolate SQL.
- Typed HTTP errors (`HTTPException` w/ correct 4xx), never a generic 500 leak.
- Never expose passwords, secrets, or stack traces in a response.
- Config/secrets via settings/env — never hardcoded.
- Pagination on every collection endpoint.

## Validation gate (concrete)
- Endpoints return the EXPECTED HTTP status codes (200/201/404/409/422…).
- Schemas validate; OpenAPI (`/docs`) reflects the real contract.
- Import/type check clean (`ruff`/`mypy` if the project uses them).

## Worked-example shape
Minimal-complete slice showing ALL layers: schema (In/Out) + router/endpoint +
CRUD/service, plus one isolated auth dependency snippet.

## Delivery order
schema → router/endpoint → CRUD/service → dependency wiring → test.
