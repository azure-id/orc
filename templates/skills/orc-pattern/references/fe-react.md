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

## Validation gate (concrete)
- Type-check passes (TypeScript strict if the project uses TS) — **zero errors**.
- Lint passes; no `react-hooks/exhaustive-deps` warnings on new code.
- Component renders without console errors/warnings.

## Worked-example shape
1. A component with typed props + the project's data-fetch layer.
2. A custom hook with an explicit cleanup return.

## Delivery order
component → hook(s) → API/client util → styles → test.
