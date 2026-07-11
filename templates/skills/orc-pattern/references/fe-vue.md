# Playbook — Vue 3 (FE)

Generic best-practice defaults for Vue 3. The codifier OVERRIDES the Conventions
with the project's observed style; the Invariants always stand.

**Activation triggers:** Vue, Composition API, `<script setup>`, ref/reactive,
computed, Pinia, defineProps, defineEmits, SFC.

## Conventions (PROJECT-OVERRIDABLE — match the codebase)
- Single-File Components; `<script setup>` + Composition API (match project if it
  uses Options API instead).
- State: Pinia stores for shared state (match the project's store layout/naming).
- Composables in `use*` files; return refs + an explicit teardown where needed.
- Props typed via `defineProps<T>()`; events via `defineEmits`.
- Styling: match the project (scoped `<style>`, CSS Modules, Tailwind).

## Invariants (ALWAYS — BLOCKING)
- Never mutate props; emit an event or use a local copy.
- Stable `:key` on `v-for` — never the index when the list mutates.
- Clean up watchers/listeners/intervals (`onUnmounted` / `watch` stop handles).
- No secrets in client code or bundled env.
- Accessibility: semantic HTML + ARIA; label every input.
- Validate user input client-side, but the server is the real gate.

## Validation gate (concrete)
- Type-check passes (`vue-tsc` if TS) — **zero errors**.
- Lint passes; no unused refs/reactives on new code.
- Component mounts without console warnings.

## Worked-example shape
1. A `<script setup>` component with typed props + a Pinia store read.
2. A composable with an `onUnmounted` cleanup.

## Delivery order
component (SFC) → composable(s) → store → API/client util → test.
