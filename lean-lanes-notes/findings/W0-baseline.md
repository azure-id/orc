# W0 — baseline, measured on the 1.8.2 tree

Measured 21-09-2026 on `main` at `24abd61` (v1.8.2), before any 1.9.0 edit.
Branch for the work: `feat/lean-lanes-1.9`.

## 1. The suite and the guards

| Measure | Value | Note |
|---|---|---|
| `npm test` | **1096 passed · 0 failed · 1099 tests · 74 files** | `00-README.md` said 1022/65 — that number was from the 1.8.1 tree. Corrected. |
| `npm run verify` | green | `40 skills · 49 agent files · 206 contracts` |
| executor generator | green | 10 generated files match the template |

## 2. Spines and budgets

| File | Lines now | `BUDGETS` pin |
|---|---|---|
| `templates/skills/orc-quick/SKILL.md` | **378** | none |
| `templates/skills/orc-mini/SKILL.md` | **267** | **270** (raised 260→270 at v1.8.0 W9) |

`00-README.md` said 379 / 268; the measured numbers are 378 / 267 (`wc -l`).
The lint counts `split("\n").length`, which is one more than `wc -l` on a file
that ends with a newline — so the lint sees 379 / 268. **The budget arithmetic
in `05-trim.md` §5 uses the LINT number.**

## 3. Descriptions (the per-session cost)

33 skills · **22,496 chars** total (~5,600 tokens). This matches the baseline.

| Skill | Chars |
|---|---|
| `context-combiner` | **1,053 — over the 1,024 spec cap** |
| `orc-analyze-mini` | 989 |
| `orc-doc` | 980 |
| `orc-quick` | **619** |
| `orc-mini` | **493** |
| `orc-verify` (smallest) | 350 |

**New for the plan:** `context-combiner` is already over the cap the W1 test
pins. W1 trims it too, or the new test cannot go green. `02-PLAN.md` §11 does
not list that file; W1 adds it with this reason.

## 4. The catalogue today (F6 / F10 confirmed)

```
orc-quick : lane-config run-inflight lane-phases wiki-status pattern-status
            graph-status graph-update graph-ctx graph-notes-pending
            extra-resolve extra-role extra-dispatch rules-slice      (13)
orc-mini  : lane-config run-inflight lane-phases pattern-status gotcha-status
            graph-status graph-update graph-ctx graph-notes-pending
            extra-dispatch extra-reconcile rules-slice               (12)
```

Neither lane may call `impact`, `changes`, `coverage`, `cochange` or `map`.
S4 adds those rows.

**Also found:** `orc-mini` is NOT in `wiki-status`'s `lanes[]`, but M4 has the
orchestrator run `orc wiki status --json` to select page paths. W4 must either
add mini to that row or select the paths from `wiki/INDEX.md` alone. Recorded
here so W4 does not discover it late.

## 5. Quick's own phases today

`orc lane phases orc-quick --json` → `own_phases[].trace_verbs`:

| Phase | Heading (byte-for-byte) | Verbs now |
|---|---|---|
| q0 | `## Q0 — Preflight (ONE time per session, silent, nothing can stop the run)` | `GATE` |
| q1 | `## Q1 — LOOK (silent — no questions here)` | `GATE`, `WIKI-CONSULT` |
| q2 | `## Q2 — ASK (ONE user turn: questions + the gate together)` | — |
| q3 | `## Q3 — DO (dispatch → build/test → write the doc → offer)` | `FINISH`, `OUTCOME`, `VERIFY` |

Shared phases: `preflight`, `trace`, `house-rules`, `rules`. Trace tier
`Iterative`, token `quick`.

## 6. The pinned tokens, re-derived

Same walk as `05-trim.md` §4, run on this tree.

- `skills/orc-quick/SKILL.md`: **24** tokens (the note said 25; the 25th was the
  `orc lane phases` pointer, which is checked by the manifest test, not a row).
- `skills/orc-mini/SKILL.md`: **42** tokens, exactly the note's list. (A first
  walk counted 43: the `BUDGETS` row `{ file: "skills/orc-mini/SKILL.md" }` sits
  below the last contract, so a naive walk attributes the last token, `evidence/`,
  to mini. It is a `/orc-test` token. Quick has no `BUDGETS` row today, so its
  count is clean — W1 adds one, and any later walk must stop at `const BUDGETS`.)

Both lists match `05-trim.md` §4.

## 7. The 1.8.2 items this plan depends on — all present

| Item | Probe | Result |
|---|---|---|
| `map [--focus] [--budget]` | `orc graph map --budget 400 --json` on `../orc-eval` | ranked files returned |
| `ctx --source [N]` | `orc graph --help` | documented, cap 200 |
| `ctx --for-slice` | `orc graph --help` + `bin/graph-query.js` | present |
| `update --notes-pending` | `bin/cli.js` | one call answers both |
| `gain` | `bin/graph-gain.js` | present |
| `ROUTE` edges | see §8 | present |

So `02-PLAN.md` §7 (the "did not ship" fallbacks) is NOT needed. Every wave
ships against the full 1.8.2 state.

## 8. R3-C probe — do `ROUTE` rows reach a card?

Deterministic substitute for a graded `/orc-quick` run (the lane needs a live
session; the question W0 asks is whether the DATA is there).

`../orc-eval`, `orc graph update` → `orc graph ctx requireAuth --json`:

```
requireAuth  src/auth.js:2-8  [blob 9247b84 · current]
  doc   Toy auth middleware — every mutating route must use this (fixture invariant).  (parser · current)
  ← used by    GET /search  src/routes/orders.js:12  IMPORT
  ← used by    POST /  src/routes/orders.js:30  IMPORT
```

The route symbols (`GET /search`, `POST /`) are real symbols and they reach the
card as callers. **Confirmed.** Q1, Q4, Q5, M1 and M5 can rest on it.

Note: `../orc-eval` has `code_graph: off` and its graph was on `graph@4`; the
probe re-ran `update`, which upgraded it to the current engine. The sandbox is
a scratch repo, so this is safe; W5's eval round resets it anyway.

## 9. What W0 corrects in the notes

1. `00-README.md` baseline: `npm test` is 1096/74, not 1022/65.
2. Spines are 378/267 by `wc -l`, 379/268 by the lint's count.
3. Quick has 24 pinned tokens (the note's 25th is the `orc lane phases` pointer,
   checked by the manifest test), mini has 42 — as the note said.
4. `context-combiner`'s description is over the cap the W1 test adds.
5. `orc-mini` cannot call `orc wiki status` today (M4 input).
