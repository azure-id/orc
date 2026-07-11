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

## Validation gate (concrete)
- Endpoints return the EXPECTED HTTP status codes.
- `nest build` + lint clean; dependency graph resolves (no circular-dep errors).
- Swagger reflects the real contract.

## Worked-example shape
Complete feature: module + controller (Swagger) + service (typed errors) + DTOs
(validators) + mocked unit test (`Test.createTestingModule`).

## Delivery order
module → controller → service → DTOs → unit test.
