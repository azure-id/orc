# Playbook — React (FE)

Generic best-practice defaults for React 18/19 SPAs. The codifier OVERRIDES the
Conventions with the project's observed style; the Invariants always stand.

**Activation triggers:** React, JSX, hooks, useState/useEffect/useContext,
Suspense, TanStack Query, Zustand, Redux, component, frontend.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- Function components + hooks; one component per file, PascalCase filename.
- State: colocate; lift only when shared. (Project may standardize on
  Zustand/Redux/Context — match whatever it uses.)
- Data fetching via the project's chosen layer (TanStack Query / SWR / fetch hook).
- Styling: match the project (CSS Modules / Tailwind / styled-components).
- Custom hooks in `use*` files; return a stable API + explicit cleanup.

## Invariants (ALWAYS — BLOCKING)
- Never mutate state directly; produce new references.
- Never use array index as a list `key` when items reorder/insert/delete.
- Every effect with a subscription/timer/listener returns a cleanup.
- No secrets in client code or bundled env (only intentionally-public vars).
- Accessibility: semantic HTML + ARIA on interactive elements; label every input.
- Validate/guard user input on the client, but treat the server as the real gate.

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- Type-check passes with the project's own setup (TS strict IF the project uses
  it) — **zero errors**.
- Lint passes IF the project has a linter; no `react-hooks/exhaustive-deps`
  warnings on new code.
- Every new interactive element is reachable by keyboard (real `<button>`/`<a>`
  or explicit key handlers + tabindex) and every new input has a label.
- Every new list rendering uses a stable key (visible in the diff).
- Advisory only (never gate; requires tooling the project may lack):
  render-without-console-warnings check, bundle-size budget.

## Worked example (SHAPE REFERENCE — the project's observed layout ALWAYS wins)
Imitate the SHAPE (typed props → data layer → cleanup-safe hook), never this
exact naming/styling when the project differs.

```tsx
// useOrderPolling.ts — custom hook with explicit cleanup
import { useEffect, useState } from "react";

export function useOrderPolling(orderId: string, intervalMs = 5000) {
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await fetchOrder(orderId);   // the project's fetch layer
      if (!cancelled) setOrder(next);
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(id); };  // cleanup, always
  }, [orderId, intervalMs]);

  return order;
}

// OrderStatus.tsx — typed props, semantic + labeled, stable keys
type OrderStatusProps = { orderId: string };

export function OrderStatus({ orderId }: OrderStatusProps) {
  const order = useOrderPolling(orderId);
  if (!order) return <p role="status">Loading order…</p>;
  return (
    <section aria-label="Order status">
      <h2>{order.title}</h2>
      <ul>
        {order.items.map((item) => (
          <li key={item.id}>{item.name}</li>   // stable id, never the index
        ))}
      </ul>
    </section>
  );
}
```

## Delivery order
component → hook(s) → API/client util → styles → test.
