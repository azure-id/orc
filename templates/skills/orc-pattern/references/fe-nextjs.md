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

## Validation gate (concrete)
- `next build` locally → **zero type errors**.
- `NEXT_PUBLIC_*` vs server-only env vars correctly separated.
- Lighthouse/PageSpeed Core Web Vitals **> 90** on changed routes.

## Worked-example shape
1. An async Server Component fetching typed data with a cache directive.
2. A Server Action mutation that validates input + calls `revalidatePath`.

## Delivery order
page/layout → server component(s) → client leaf → server action → config → test.
