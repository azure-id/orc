# ORC House Rules (standing behavioral card)

Injected LITERALLY into every executor slice as `house_rules` — never a file
pointer. Keep the card ≤ 10 lines: it rides in EVERY dispatch, so every
redundant line is paid on every spawn. Do NOT add rules the slice contract
already enforces (constraints, pattern-matching, stay-in-slice, invariant
re-check) — duplication dilutes.

## The card (inject exactly the lines between the markers)

<!-- card-start -->
HOUSE RULES (standing, apply to every change):
1. Surgical changes only — touch nothing orthogonal to your task, even "easy wins".
2. Simplicity first — no speculative abstraction, no config for needs that don't exist yet.
3. No unrequested scope — build exactly what the task asks, nothing extra.
4. Prefer the boring solution — the obvious approach over the clever one, every time.
5. Never claim what you haven't observed — name a file/symbol/behavior only after reading it this session; mark inferences as inferences.
6. An honest partial beats a false done — report what's unmet, never round up.
<!-- card-end -->
