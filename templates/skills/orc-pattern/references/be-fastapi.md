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

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- Every new endpoint returns the expected status codes: 200 read · 201 create ·
  404 missing id · 409 conflict/duplicate · 422 invalid body (FastAPI default).
- Every collection endpoint paginates (params visible in the signature).
- Every request body/param passes through a Pydantic model (no raw `dict` params).
- Import/type check clean with the project's own tools (`ruff`/`mypy` IF present).
- OpenAPI (`/docs`) reflects the real contract (schemas registered, not `Any`).
- Advisory only (never gate; requires tooling the project may lack): coverage
  target on the new surface, p95 latency budget.

## Worked example (SHAPE REFERENCE — the project's observed layout ALWAYS wins)
A minimal-complete slice showing all layers. Imitate the SHAPE (schema → router
→ CRUD → dependency), NEVER this exact layout/naming when the project differs —
the codifier's reconciled conventions override everything here.

```python
# schemas/order.py — In/Out models (v2)
from pydantic import BaseModel, Field

class OrderIn(BaseModel):
    item_id: int
    quantity: int = Field(gt=0)

class OrderOut(BaseModel):
    id: int
    item_id: int
    quantity: int
    model_config = {"from_attributes": True}

# crud/order.py — data access, parameterized only
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Order

async def create_order(db: AsyncSession, data: "OrderIn") -> Order:
    order = Order(**data.model_dump())
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order

async def get_order(db: AsyncSession, order_id: int) -> Order | None:
    return await db.scalar(select(Order).where(Order.id == order_id))

# deps.py — one isolated auth dependency
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def current_user(token: str = Depends(oauth2_scheme)) -> "User":
    user = await resolve_user(token)          # however the project resolves it
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return user

# routers/order.py — endpoint wiring: typed errors, DI, pagination
from fastapi import APIRouter, Depends, HTTPException, status

router = APIRouter(prefix="/orders", tags=["orders"])

@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create(data: OrderIn, db: AsyncSession = Depends(get_db),
                 user: User = Depends(current_user)) -> OrderOut:
    return await crud.create_order(db, data)

@router.get("/{order_id}", response_model=OrderOut)
async def read(order_id: int, db: AsyncSession = Depends(get_db)) -> OrderOut:
    order = await crud.get_order(db, order_id)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order

@router.get("", response_model=list[OrderOut])
async def list_orders(limit: int = 50, offset: int = 0,
                      db: AsyncSession = Depends(get_db)) -> list[OrderOut]:
    return await crud.list_orders(db, limit=limit, offset=offset)
```

## Delivery order
schema → router/endpoint → CRUD/service → dependency wiring → test.
