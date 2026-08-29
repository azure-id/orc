# Phase — House rules   (id: `house-rules`)

> **Library file.** Canonical since v1.0.0 W12; it was under the `orc` skill's
> private `references/`, and other lanes already reached across into it. Read
> by `orc`, `orc-mini`, `orc-fast`, `orc-quick`, `orc-doc`. Layers declared:
> `core` only — single-layer because it is a standing card injected VERBATIM
> into a slice — a layered card would be a different card. `orc lane phases
> <lane> --json` names the file and the layers to read.

<!-- orc:layer core -->
## ORC House Rules (standing behavioral card)

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
7. Never revert, discard or rewrite files you did not write — `git checkout/restore/reset/stash/clean` are forbidden in your slice; an impossible assertion is `unmet`, never something to make true.
<!-- card-end -->

<!-- /orc:layer -->
