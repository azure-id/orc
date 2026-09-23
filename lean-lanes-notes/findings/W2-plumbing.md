# W2 — the shared plumbing (S1–S7)

Branch `feat/lean-lanes-1.9`. Nothing is committed yet; the release is ONE commit
at W5.

## 1. What landed

| # | Change | Where |
|---|---|---|
| S1 | `repro` slice field + return field | `agents-src/executor.template.md` → `npm run build:agents` (10 files) · `orc/subskills/orc-execution/core.md` · `_shared/return-validation.md` **§5d** · lint token `repro.required: true` |
| S2 | trace verb `REPRO red\|green :: <cmd> exit=<n>` | `_shared/phases/trace.md` row · lint token `REPRO` (+`binFiles: bin/cli.js`) |
| S3 | the COMPACT rules card for `--lane orc-quick` | `bin/cli.js` `rulesSlice()` · `_shared/phases/rules.md` "Cost" |
| S4 | catalogue `lanes[]` widened | `bin/cli.js` `LANE_CALLS` — see §3, it did not land the way the plan expected |
| S5 | hook role family `recon` | `templates/hooks/orc-trace.js` · `trace.md` · `bin/cli.js` `TRACE_FAMILIES` + the kind map |
| S6 | the recon pair registered | 2 new agent files · `bin/verify-package.js` (floor 48 → 50) · `MODEL-MAPPING.md` |
| S7 | quick `own_phases.trace_verbs` | `bin/cli.js` `LANE_OWN_PHASES` — the four HEADINGS are byte-identical |

Plus one thing the plan did not list: `references/dispatch-gate.md`'s recon
section. W3 owns that file, but shipping the agents while the gate still offered
"an ad-hoc model + effort" would have put a contradiction in the payload at the
pause. The menu half moved now; the `→ suggested` marker is still W3's.

## 2. The compact rules card — measured

| Lane | `compact` | chars | ≈ tokens |
|---|---|---|---|
| `orc-quick` | `true` | **5,838** | **~1,460** |
| `orc-mini` (and every other lane) | `false` | 13,874 | ~3,469 |

Target was ≤ 1,500 tokens. Every HARD rule keeps its **id, its title and its
first line** — the instruction — and loses only the worked examples; the pack
file is named beside them. `line` is IDENTICAL in both forms, because compacting
changes how a rule is written and never whether it applies. `compact: true` is
in the JSON: a reader that cannot tell a short card from a stripped one cannot
trust either.

Three knobs were tried before the target was met: the HARD body cap (150 → 80 →
70 → **62** chars) and, in compact mode only, dropping the credits line (it is a
credit, not an instruction, and `orc rules credits` prints it in full).

## 3. S4 did not land the way the plan wrote it — and could not

**What the plan assumed:** `lanes[]` is a list in `bin/cli.js` that W2 widens,
and W3/W4 then teach the spines to use the new calls.

**What is actually true:** `bin/verify-contracts.js` DERIVES the lane set by
scanning each lane's own skill folder for `orc <noun> <verb>` and requires the
stored `lanes[]` to EQUAL what it measured, in both directions. A catalogue row
that names a lane whose payload never names the command is drift, by name:

```
graph-map: lanes[] disagrees with the payload — orc-mini, orc-quick are listed
           and no longer name it
```

So the catalogue cannot be widened before the payload asks the question. The
minimal, final text was pulled forward from W3/W4 rather than reverting S4:

- `orc-quick/SKILL.md` Q1 — the graph-first dig now names `ctx`, `map --focus`
  and `coverage`, with the exit-4-lists-candidates rule.
- `orc-quick/SKILL.md` Q3.2 — affected tests first (`orc graph changes`), then
  the suite, then the one-line blast radius with `risk` never without its `why`.
- `orc-mini/SKILL.md` code-graph section — steps 4 and 5: `map`, `impact` and
  `cochange` are the NUMBERS behind the complexity line; `changes` names the
  tests that reach the change.

W3 and W4 build on these lines; they do not replace them.

**Result:**

```
quick: … graph-status graph-update graph-ctx graph-map graph-coverage
       graph-changes graph-notes-pending …                        (16 calls)
mini : … graph-status graph-update graph-ctx graph-map graph-impact
       graph-changes graph-cochange graph-notes-pending …         (16 calls)
```

The `graph-map` row's "planning ONLY" premise is NARROWED, not dropped, and the
row says so: DE-H's measured 0.39 answerable calls per run was the ANALYST
asking for a map after the files were already known. Quick with a request that
names no file, and mini before its tiered round, are the same orientation
question asked by a lane with no planner.

## 4. The lint found five more copies nobody had registered

Every one was a real cross-file contract the two new agent files now carry:
`actual_model` · `searched:` · `code > graph structure` · `graph_used` ·
`--source [N]` · `read-ladder.md` · `untrusted-input.md`. Also two prose
mentions of `orc run inflight` (`MODEL-MAPPING.md`, `dispatch-gate.md`) — both
state the recon pair's reason for existing, so both must move with a rename.

**The `repro` token was too coarse and was tightened before it shipped.** As
`repro` it matched "reproducible" and "reproduce" in five unrelated files. The
registered token is now `repro.required: true` — the exact conditional the
contract is about.

## 5. One drift the plan did not predict

`orc lane rails` carries a MIRROR of the hook's `roleFamily()`, asserted by a
golden test against the hook's source text. Adding `recon` to the hook without
adding it to `TRACE_FAMILIES` fails with *"a family the hook writes that the
rail cannot name renders no phase at all"*. Both sides moved, and `recon` is
kind `look`: one question, answered with evidence, nothing written.

## 6. Sizes and gates

| File | Before W1 | After W1 | After W2 | Budget |
|---|---|---|---|---|
| `orc-quick/SKILL.md` | 379 | 298 | **311** | 325 (new pin) |
| `orc-mini/SKILL.md` | 268 | 246 | **248** | 270 |
| agent files | 49 | — | **51** | floor 50 |
| contracts | 206 | — | **208** | — |

- `npm run verify` — green (40 skills · 51 agents · 208 contracts).
- `npm test` — **1105 passed · 0 failed · 1108 tests · 74 files** (baseline
  1096/1099; +9 new).

New tests: description length · trigger phrases · own-phase headings byte-for-byte
· the recon pair's frontmatter, return fields and gate rows · the `repro`
contract across all ten executors, the slice contract, §5d and the trace verb ·
`SPAWN orc-recon-*` + `PHASE-EDGE recon` + the not-analysis assertion ·
the compact card keeps every HARD id and the same `line` · the two lean lanes'
graph permissions, both directions.

One flake seen once and not reproduced: `test/cli/test-run.test.js` "a FLAKE is
recorded, never retried away" failed in one run and passed in the two runs
either side. It is the suite's own flake-detection fixture and touches nothing
in this release.

## 7. What the pause still owes

`02-PLAN.md` asks for "one dry `/orc-quick` recon entry on `../orc-eval` shows
`SPAWN orc-recon-…` in the trace". That needs a live lane session, which this
pass cannot run. The deterministic half is covered: `test/hooks.test.js` drives
the SHIPPED hook with a real `orc-recon-sonnet-4-6-med` dispatch on a fresh
install and asserts the `SPAWN` line and the `PHASE-EDGE recon` edge. The live
run belongs with the W5 eval round.
