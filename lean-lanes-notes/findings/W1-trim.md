# W1 — the trim, measured

Branch `feat/lean-lanes-1.9`. Ran BEFORE the Q- and M- additions, so those land
in a spine that already fits.

## 1. Descriptions

| Skill | Before | After | Target |
|---|---|---|---|
| `orc-quick` | 619 | **326** | ≤ 330 ✅ |
| `orc-mini` | 493 | **294** | ≤ 300 ✅ |
| `context-combiner` | 1,053 | **1,017** | ≤ 1,024 ✅ (W0 §3 — it was already over the spec cap) |
| **all 33** | 22,496 | **22,004** | — (−492 chars, ~−123 tokens per session) |

Both new texts are the ones `05-trim.md` §1.2 / §1.3 wrote, word for word.
Every trigger phrase survived, and a new test now holds them.

## 2. Command files

| File | Before | After |
|---|---|---|
| `templates/commands/orc-quick.md` | 1,667 B | **~600 B** |
| `templates/commands/orc-mini.md` | 587 B | **~450 B** |

The quick command file does NOT yet name the reproduce-first step or the
`→ suggested` marker; both arrive with W3, which owns them.

## 3. Spines

| File | Before (`wc -l` / lint) | After | Budget |
|---|---|---|---|
| `orc-quick/SKILL.md` | 378 / 379 | **297 / 298** | new pin **325** |
| `orc-mini/SKILL.md` | 267 / 268 | **245 / 246** | 270, unchanged |

Quick beat the ≤ 300 W1 target. Mini landed at 246 against a ≤ 245 target — one
line over, and it needs no raise, because the pin is 270 and `04` adds ≈ 23.

What moved, and where it now lives ONCE:

| Cut from the spine | Now stated only in |
|---|---|
| the six-item "it is open" list, the step-count table, the "what this lane is NOT" list | `orc-quick/README.md` §1–§2 (the spine keeps a one-line rule + pointer) |
| the "Nothing can override this lane" block | merged into `## Config` — the inert five, the `extra_enabled` third option, the announce rule |
| the PR-fetch commands and the thread list | `references/gh-mode.md` |
| the gate menu table, per kind | `references/dispatch-gate.md` |
| the 8-line repair-loop example | `references/dispatch-gate.md` |
| the stop-while-red block | one line + `git checkout -- .` |
| the doc shape | `references/context-doc.md` |
| mini: the Phase X / Phase T narration, the fallback and switch paragraphs | `_shared/drift-recovery.md`, the phase's own reference |

## 4. The pinned tokens

`npm run verify` is green — **206 contracts**, so all 24 quick tokens and all 42
mini tokens survived. Checked independently as well by re-deriving the two lists
and substring-matching them against the trimmed spines: 0 missing.

## 5. The new tests

`test/payload.test.js` gains two:

1. **description length** — every skill ≤ 1,024 chars; `orc-quick` and
   `orc-mini` ≤ 350. It walks `templates/skills/` itself, so a skill added later
   is covered without touching the test.
2. **trigger phrases** — the exact strings a user types (`/orc-quick`,
   "quick fix X", "quickly find out how Y works", "fix the review comments",
   "on PR N", `/orc-mini`, "use orc-mini to implement X") must stay in the
   description. This is the control for the "a shorter description
   under-triggers" risk in `02-PLAN.md` §9.

## 6. Gates

- `npm run verify` — green (40 skills · 49 agents · 206 contracts).
- `npm test` — **1098 passed · 0 failed · 1101 tests · 74 files** (baseline
  1096/1099; +2 are the new payload tests).
- Trigger phrases present — asserted by the test above, not by eye.

Still open for W5: a fresh session that confirms both skills still trigger on
their phrases with all 33 descriptions loaded. A test cannot measure that.
