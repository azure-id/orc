# W4 — `/orc-mini` (M1–M7), measured

Branch `feat/lean-lanes-1.9`. Nothing is committed; the release is ONE commit at
W5. Built against `04-orc-mini-spec.md`.

## 1. What landed, per spec item

| # | Item | Where |
|---|---|---|
| M1 | the complexity read with EVIDENCE | `## Complexity read` (the line + the four thresholds) · NEW `references/complexity.md` (105 lines) |
| M2 | the planner slice carries `graph_facts` | `## Analyst & planner` (the token + the pointer) · the shape in `complexity.md` §1b · both mini planner agents |
| M3 | the exit gate batches | `## Analyst & planner` — `orc graph ctx <paths>`, five at a time, Glob as the fallback |
| M4 | wiki POINTERS, never bodies | `## Wiki consult` · the shared lane-delta sentence in `_shared/phases/wiki-consult.md` |
| M5 | the smoke gate runs affected tests first | `## Phase M` — the affected set, then build + suite, then the blast-radius line |
| M6 | `wiki_used` / `graph_used` = `none` is recorded | `## Shared artifacts` — the ship line and the two-runs signal |
| M7 | the gain line at the smoke-gate close | code-graph step 6 |

Plus the intake half of M1: code-graph step 2 runs `orc graph map --focus` before
the tiered round, so Q4's `➡️` recommendation is pre-filled and the user is never
asked to recite their own repository.

Also: `examples/mini-run-mock.md` shows every new line in place.

## 2. The spine, and the budget raise

| | Before W4 | After W4 | Budget |
|---|---|---|---|
| `orc-mini/SKILL.md` | 248 (lint) | **280** | **280** (raised from 270) |

**The raise is deliberate and commented**, which `02-PLAN.md` DE-9 and
`05-trim.md` §5 both allow ("270 unchanged, else 280 with comment"). The comment
in `bin/verify-contracts.js` names what the room was spent on: the `graph_facts`
slice, the four thresholds, the wiki pointers rule, the affected-tests-first gate
and the `none is an answer` record — five contracts that must survive
compaction — and names `references/complexity.md` as the place the arithmetic
went instead.

What moved out rather than being shortened:

| Out of the spine | Now stated only in |
|---|---|
| the `graph_facts` YAML shape | `references/complexity.md` §1b |
| how to count (confident vs `AMBIGUOUS`, inside vs outside) | `references/complexity.md` §2 |
| why each threshold is that number | `references/complexity.md` §4 |
| the offer wording and the decision-log line | `references/complexity.md` §5 |

The spine keeps the line format, the four thresholds as a single sentence, the
`GATE complexity` trace verb and the pointer.

## 3. What the spec did not predict

**1. Mini LEFT the `graph-notes-pending` catalogue row** for the same reason
quick did (`W3-quick.md` §3.3): code-graph step 6 is one
`orc graph update --notes-pending --files <actual_files>` call, so mini no longer
names `orc graph notes pending`. It still dispatches the noter when that answer
has rows.

**2. `orc wiki status` had to gain orc-mini** — W0 §4 saw this coming. M4 has the
orchestrator read `orc wiki status --json` to compute the tier that the path
selection rests on, so the catalogue row's `lanes[]` gained `orc-mini` with the
reason in a comment.

**3. `facets` is a contract token, and a mock is scanned.** Writing "any
`facets.risk[]`" into `examples/mini-run-mock.md` made the example an
unregistered copy of the facet-scored-rubric contract. The example now says "a
cited risk class", which is what that line was trying to explain anyway. The two
graph tokens the mock legitimately demonstrates — `GRAPH-MAP` and `--for-slice`
— ARE registered, so a rename has to reach the example too. That is the right
answer for a file whose whole job is to show the real lines.

## 4. The thresholds, as shipped

| Threshold | Recommend `/orc` when |
|---|---|
| caller files | confident callers sit in **4 or more files** outside `declared_files` |
| caller count | **8 or more** confident callers outside `declared_files` |
| risk | **any** `facets.risk[]` entry |
| history | a `cochange` partner with **3 or more** co-commits not in the plan |

`AMBIGUOUS` callers print as `maybe <n>` and never trip one alone. The graph off
→ the `(graph off)` form of the line, decided from `facets.risk[]` alone; a
number is never invented. The recommendation is an OFFER, and continuing writes
the NUMBERS into the decision log, not just the choice — so `/orc-retro` can
move a threshold instead of anyone arguing about it.

## 5. Agents touched

`orc-planner-mini-sonnet-5-high.md` and `orc-planner-mini-opus-5-med.md` each
gain the `graph_facts` paragraph, word for word the same: ground
`declared_files` and `facets.breadth` on `impact`; a `cochange` partner not in
the plan is an `open_questions[]` entry and never a silent addition;
`tests_reaching` feeds `test_surface`; cite as `graph gen <n>`; the graph is a
LOCATOR and a card's silence is not proof of absence.

No other agent changed for mini. The executor's `repro` field is present in
every executor (W2 S1) and mini never requests it.

## 6. Gates at the pause

- `npm run verify` — green: **40 skills · 51 agent files · 208 contracts**.
- Spines: quick **325 / 325** · mini **280 / 280**. Both AT their pin, neither
  over it.
- `npm test` — **1110 passed · 0 failed · 3 skipped · 1113 tests · 74 files**
  (W2 baseline 1105 / 1108; +5 are the new `graph-lanes` cases).
- `node --test test/cli/graph-lanes.test.js` — 18 passed, including the five new
  v1.9.0 cases.

## 7. What the pause still owes

Unchanged from W2 §7, plus one:

1. one dry `/orc-quick` recon entry on `../orc-eval` showing `SPAWN orc-recon-…`
   in the trace (the deterministic half is covered by `test/hooks.test.js`);
2. one `/orc-mini` dry run on `../orc-eval` printing the complexity line **with
   numbers in it** — a line that renders `callers <n> in <n> files` from a real
   `impact` answer, not from the example.

Both need a live lane session. They belong with the W5 eval round.
