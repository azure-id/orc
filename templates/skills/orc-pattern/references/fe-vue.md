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

## Validation gate (default acceptance checks; measurable-only)
Enforce only what is machine-checkable in the target repo; anything needing
tooling the project lacks is advisory, never gating.
- Type-check passes with the project's own setup (`vue-tsc` IF TS) — **zero errors**.
- Lint passes IF the project has a linter; no unused refs/reactives on new code.
- Every new `v-for` uses a stable `:key` (visible in the diff).
- Every new watcher/listener/interval has a teardown (visible in the diff).
- Advisory only (never gate; requires tooling the project may lack):
  mount-without-console-warnings check.

## Worked example (SHAPE REFERENCE — the project's observed layout ALWAYS wins)
Imitate the SHAPE (typed SFC + cleanup-safe composable), never this exact
naming/store layout when the project differs — including Options-API projects.

```vue
<!-- OrderStatus.vue — <script setup>, typed props, store read, stable keys -->
<script setup lang="ts">
import { useOrderStore } from "@/stores/orders";
import { useOrderPolling } from "@/composables/useOrderPolling";

const props = defineProps<{ orderId: string }>();
const store = useOrderStore();
const order = useOrderPolling(props.orderId);
</script>

<template>
  <section aria-label="Order status">
    <p v-if="!order" role="status">Loading order…</p>
    <ul v-else>
      <li v-for="item in order.items" :key="item.id">{{ item.name }}</li>
    </ul>
  </section>
</template>
```

```ts
// composables/useOrderPolling.ts — composable with explicit teardown
import { ref, onUnmounted } from "vue";

export function useOrderPolling(orderId: string, intervalMs = 5000) {
  const order = ref<Order | null>(null);
  const tick = async () => { order.value = await fetchOrder(orderId); };
  tick();
  const id = setInterval(tick, intervalMs);
  onUnmounted(() => clearInterval(id));   // teardown, always
  return order;
}
```

## Delivery order
component (SFC) → composable(s) → store → API/client util → test.
