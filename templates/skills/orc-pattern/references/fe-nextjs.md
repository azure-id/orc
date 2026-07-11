# Playbook — Next.js (FE)

Generic best-practice defaults for Next.js App Router. The codifier OVERRIDES the
Conventions with the project's observed style; the Invariants always stand.

**Activation triggers:** Next.js, App Router, RSC, Server Components, Server
Actions, `use client`, route handlers, `generateMetadata`, revalidate.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- Server Components by default; add `'use client'` only at the LEAF that needs it.
- Route handlers in `app/**/route.ts`; pages in `app/**/page.tsx`.
- Mutations via Server Actions; call `revalidatePath()`/`revalidateTag()` after.
- Explicit cache directives on fetches (`next: { revalidate: N }` or `cache`).
- Metadata via `generateMetadata`/`metadata` export, not hand-written `<meta>`.
- (Project may still use the Pages Router — if so, MATCH it, don't force App Router.)

## Invariants (ALWAYS — BLOCKING)
- Never put a plain `<img>` for content images — use `next/image`.
- Never leak server-only secrets into client components or `NEXT_PUBLIC_*`.
- Server Actions validate their input server-side (never trust the client).
- No blocking sync work in a Server Component render path.
- Accessibility: semantic HTML + ARIA; label every input.

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- `next build` locally → **zero type errors**.
- `NEXT_PUBLIC_*` vs server-only env vars correctly separated (visible in diff).
- Every new Server Action validates its input server-side (visible in diff).
- Content images in new code use `next/image`, not `<img>` (visible in diff).
- Advisory only (never gate; requires tooling the project may lack):
  Lighthouse/Core Web Vitals score on changed routes, bundle-size budget.

## Worked example (SHAPE REFERENCE — the project's observed layout ALWAYS wins)
Imitate the SHAPE (RSC fetch + validated Server Action), never this exact
layout/naming when the project differs — including Pages Router projects.

```tsx
// app/orders/[id]/page.tsx — async Server Component, explicit cache directive
export default async function OrderPage({ params }: { params: { id: string } }) {
  const res = await fetch(`${process.env.API_URL}/orders/${params.id}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) notFound();
  const order: Order = await res.json();
  return <OrderView order={order} />;
}

// app/orders/actions.ts — Server Action: validate server-side, then revalidate
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const UpdateQty = z.object({ orderId: z.string(), quantity: z.coerce.number().int().positive() });

export async function updateQuantity(formData: FormData) {
  const parsed = UpdateQty.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };  // never trust the client
  await db.order.update(parsed.data);                      // the project's data layer
  revalidatePath(`/orders/${parsed.data.orderId}`);
}
```

## Delivery order
page/layout → server component(s) → client leaf → server action → config → test.
