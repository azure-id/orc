# Playbook — NestJS (BE)

Generic best-practice defaults for NestJS. The codifier OVERRIDES the Conventions
with the project's observed style; the Invariants always stand.

**Activation triggers:** NestJS, `@Injectable`, `@Controller`, module, provider,
DTO, guard, pipe, `@nestjs/swagger`.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- Feature module per domain: `*.module.ts` wiring `*.controller.ts` +
  `*.service.ts` + `dto/*.dto.ts` (match the project's folder layout).
- Constructor injection for all services (match the project's provider naming).
- DTOs with `class-validator` decorators (match project's In/Out/Create naming).
- Swagger annotations on endpoints (match the project's decorator usage).

## Invariants (ALWAYS — BLOCKING)
- Dependency injection ONLY — never `new SomeService()`; use `@Injectable()` +
  constructor injection.
- Global `ValidationPipe` + `class-validator` on every DTO — no unvalidated input.
- Typed exceptions (`NotFoundException`, `ConflictException`), never generic errors.
- Never expose passwords, secrets, or stack traces in responses.
- Config/secrets via `ConfigModule`/env — never hardcoded.
- No circular module deps; `forwardRef()` is a last resort, not a default.
- No unjustified `any`.

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- Every new endpoint returns the expected status codes: 200 read · 201 create ·
  404 missing id · 409 conflict · 400 invalid body (ValidationPipe default).
- `nest build` clean; dependency graph resolves (no circular-dep errors).
- Every new DTO field carries a `class-validator` decorator (visible in diff).
- Lint clean IF the project has a linter.
- Swagger reflects the real contract IF the project uses `@nestjs/swagger`.
- Advisory only (never gate; requires tooling the project may lack): coverage
  target on the new surface, p95 latency budget.

## Worked example (SHAPE REFERENCE — the project's observed layout ALWAYS wins)
A minimal-complete feature slice. Imitate the SHAPE (module → controller →
service → DTO), never this exact layout/naming when the project differs.

```ts
// dto/create-order.dto.ts — validated input
import { IsInt, IsPositive } from "class-validator";

export class CreateOrderDto {
  @IsInt() itemId: number;
  @IsInt() @IsPositive() quantity: number;
}

// order.service.ts — typed errors, injected deps
@Injectable()
export class OrderService {
  constructor(private readonly repo: OrderRepository) {}

  async findOne(id: number): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async create(dto: CreateOrderDto): Promise<Order> {
    return this.repo.create(dto);
  }
}

// order.controller.ts — thin, status codes explicit
@Controller("orders")
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrderDto) { return this.orders.create(dto); }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) { return this.orders.findOne(id); }
}

// order.module.ts — feature module wiring
@Module({ controllers: [OrderController], providers: [OrderService, OrderRepository] })
export class OrderModule {}
```

## Delivery order
module → controller → service → DTOs → unit test.
