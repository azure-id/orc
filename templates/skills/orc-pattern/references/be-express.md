# Playbook — Express (BE)

Generic best-practice defaults for Express 4/5 (Node/TS). The codifier OVERRIDES
the Conventions with the project's observed style; the Invariants always stand.

**Activation triggers:** Express, `app.use`, middleware, `Router()`, req/res/next,
node backend, REST API in package.json with `express`.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- Router-per-resource (`routes/<resource>.ts`) with handlers delegated to a
  service/controller layer — match the project's split (fat routes vs services).
- Validation layer: match the project (zod, joi, express-validator, celebrate).
- Error handling funneled to a single error middleware (match its error shape).
- Async style: match the project (async/await + wrapper vs explicit next(err)).
- Config loading: match the project (dotenv, convict, env objects).

## Invariants (ALWAYS — BLOCKING)
- Every async handler routes rejections to `next(err)` (wrapper or try/catch) —
  an unhandled rejection must never crash or hang a request.
- Validate every request body/param/query BEFORE use — no raw `req.body` into
  the DB or business logic.
- Parameterized queries ONLY; never string-interpolate SQL.
- Central error middleware returns typed 4xx for expected failures; never leak
  stack traces, internal messages, or secrets in a response.
- Config/secrets via env — never hardcoded.
- Pagination on every collection endpoint.
- Never mount user input into `res.redirect`/headers unvalidated.

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- Every new endpoint returns the expected status codes: 200 read · 201 create ·
  404 missing id · 409 conflict · 400/422 invalid body (match the project's
  validator convention).
- Build/type-check clean IF the project uses TS; lint clean IF it has a linter.
- Every new async handler visibly routes errors to `next` (wrapper or catch).
- Every new collection endpoint paginates (params visible in the signature).
- Advisory only (never gate; requires tooling the project may lack): coverage
  target on the new surface, p95 latency budget.

## Worked example (SHAPE REFERENCE — the project's observed layout ALWAYS wins)
Imitate the SHAPE (validate → service → typed error → central middleware),
never this exact layout/naming when the project differs.

```ts
// routes/orders.ts — validated input, async-safe, paginated
import { Router } from "express";
import { z } from "zod";

const router = Router();

const CreateOrder = z.object({ itemId: z.number().int(), quantity: z.number().int().positive() });
const ListQuery = z.object({ limit: z.coerce.number().max(100).default(50), offset: z.coerce.number().default(0) });

router.post("/", async (req, res, next) => {
  try {
    const data = CreateOrder.parse(req.body);          // validate BEFORE use
    const order = await orderService.create(data);
    res.status(201).json(order);
  } catch (err) { next(err); }                          // always to the funnel
});

router.get("/", async (req, res, next) => {
  try {
    const { limit, offset } = ListQuery.parse(req.query);
    res.json(await orderService.list({ limit, offset })); // paginated
  } catch (err) { next(err); }
});

export default router;

// middleware/error.ts — single funnel, typed 4xx, no leaks
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input" });
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.publicMessage });
  logger.error(err);                                    // full detail stays server-side
  res.status(500).json({ error: "Internal error" });    // never the stack trace
}
```

## Delivery order
route → validation schema → service → error wiring → test.
