# Checkpoint — graph use, v1.9.1

Written 22-09-2026 in Simplified Technical English. This file is a working
note. It is never staged and never committed, like the rest of this folder.

> **State: RELEASED on the branch — v1.9.1 committed as `feb83f3` on `feat/graph-use-1.9.1` (not pushed). W6 done.**
> **DE-8 = (a)** (count first, no default flip) and **DE-15 = (b)** (build W5b),
> both answered by the user on 23-09-2026. The user said "continue" after the
> W5 report and "continue until commit" after W5b; W6 (docs + release) is done.
> Next: push + PR on the user's word, and the company-project density re-run (the W5b gate).

## W5b — what was built (23-09-2026)

`ENGINE graph@6` (`bin/graph.js`) · `HEURISTIC heuristic@6` (`bin/graph-extract.js`).

| Item | Where |
|---|---|
| E1 owner + members | `objectDefs()` in `bin/graph-extract.js` — `export default {…}` / `defineComponent({…})` / `Vue.extend({…})`; depth-1 functions + `methods · computed · watch · getters · mutations · actions · filters · provide`; an accessor pair / watcher `{handler}` is ONE member; a section declared above (`export default { mutations }`) is read; `mixins`/`extends` → `bases`; owner = `name:` or file stem (index → folder, kebab → Pascal) |
| E2 constants | `export const/let/var` (non-function), `exports.X =`, the keys of `module.exports = {…}` and of a data-only default object; a `require(…)`/`import(…)` value is a re-export and is skipped; a Svelte `export let` is a prop and is skipped |
| E3 component | a `.vue` `<script setup>`, any Svelte instance script, or no script → ONE `class` named from the file, **NAME-ONLY** (owns no line) |
| both rungs | the pass runs after the borrowed TypeScript walk too (the walker only names a method inside a class) |
| `finalize` | a `const` and a name-only class own no line → `calls: []` |
| resolver | `classSymbol()`: a DEFAULT import whose file holds exactly one exported class resolves to it (`import FM from "./formMixin"`) |
| audit | two shape readings rewritten for graph@6 |

Measured: `check.js` **0 FAIL across 10 fixtures** on the heuristic rung AND
with `--ts` (typescript 5 installed in the session scratchpad only) — the new
`eval/fixture-graph/options` fixture has 6 keys. This tree: HEAD's extractor
vs graph@6 on every indexed file → **0 unexplained differences**; the only
change is **189 new `const` symbols** and **34 new `ref` edges** to them (a
constant passed as an argument is now a known name). Zero-symbol files here:
**25 → 7**. The Express goldens: every count unchanged; only `status.engine`
moved (added to `CHANGED`).

New golden: `test/goldens/graph-1.9.0/` — the Options API fixture and its
graph@5 store, frozen BEFORE the extractor changed (2 symbols in 7 files).

**The gate the plan leaves to the user:** re-run the README density command on
the company project after `orc graph status --heal`. The plan's gate is `vue`
zero share < 20 % and density ≥ 4 per file.

Judgement calls:
1. **The E3 class owns no line.** Owning the script block moved a module-scope
   alias (`const store = new OrderStore()`) out of scope and broke 2 `sfc`
   answer keys; name-only restores them.
2. **A re-export is never a constant** (`exports.x = require(…).x` broke the
   Express barrel key).
3. **Svelte `export let` is skipped** — it is a prop.
4. **The default-import fallback in `classSymbol`** is a read-side rule the
   plan did not list. Without it `import FM from "./formMixin"` loses every
   inherited edge; a mutation test shows the test fails without it.
5. **Computed keys `[NAME]() {}` are named `NAME`** (a Vuex mutation-type
   pattern) — a const and a method can then share a name, and `ctx` lists both.

## W5 — what was built (23-09-2026)

Gate after W5: `npm run verify` 40 skills · 51 agent files · **214 contracts**
(was 212) · `node bin/test-run.js --json` **1189 passed · 0 failed · 3 skipped ·
1192 tests · 79 files**, `failures: []`, `flaky: []` (was 1173 / 1176 / 78).

| Item | Where |
|---|---|
| **R1** `ctx --callers-source` | `bin/graph-query.js` `callerBlocks()` · `fit(…, blocks)` · `CALLERS_SOURCE_MAX/LINES`; file card + `--for-slice` print `callers source: symbol cards only`; `bin/graph-shard.js` `fastModel(…, opts)` declines `callers-source`; `bin/cli.js` switch + usage + `gainRowFor` (blocks → `paid.source`, `sourceAvoided` per block) |
| **R2** `wide_unhinted` | `templates/hooks/orc-graph-hook.js` `onRead(…, readHint)`; `bin/graph-gain.js` `hints.wide_unhinted`; `bin/cli.js` `wide reads` line; UI Hints row + en/id i18n + fixture + `orc-ui-wiki.md` |
| **R3** personalised wide hint | `onWideRead()` stable sort on `name:` tokens |
| **R4** `lsp_at` + LSP sentence | `bin/graph-query.js` `lspAt()`; `_shared/read-ladder.md` step 0; `_shared/code-graph.md` §2 (EXACT) · §3 · §4b · §7 · §8b; both recon agents; executor template → 10 executors |
| contracts | `--callers-source` and `lsp_at` rows in `bin/verify-contracts.js` |
| tests | NEW `test/cli/graph-callers-source.test.js` (10); `graph-hook.test.js` +5; `graph-gain.test.js` +1; `graph-brief.test.js` ADDED rows; `panels.test.js` |

Judgement calls in W5, for the reader:

1. **`lsp_at` is computed on the sharded path too.** `06` §4.1 said the fast
   path returns `null`. Most `ctx <symbol>` calls take the fast path, so the
   LSP sentence would have pointed at `null` most of the time. Reading one
   line is the same cost `--source` already pays there, and both paths now
   answer the SAME field (tested).
2. **`--callers-source` never prints the target's own file** — from the W5
   gate row in `02-PLAN.md` §8, which `06` §1.1 does not state.
3. **Two call sites inside one window print ONE block** (a `<module>` caller
   with calls on lines 8 and 9 printed the same six lines twice).
4. **A block is kept whole or not at all** under budget pressure; the head
   line reads `N of M shown (6 lines each; raise --budget)` and the footer
   `callers source K cut (raise --budget)`.
5. **`hints.wide_unhinted` is always present** (0 when none) so a reader
   never has to guess; the `gain` line prints only when it is > 0.
6. **Not done in W5, left to W6:** `templates/hooks/README.md` (the R2 count),
   CHANGELOG, README, knowledge parts.

## Where the work is

| | |
|---|---|
| Branch | `feat/graph-use-1.9.1` (created from `main` at `9a7c438`) |
| Commits | **none** — every change is in the working tree |
| `package.json` | still `1.9.0`; the bump is W6 (`npm version patch`, DE-1) |
| Files changed | 48 modified · 6 new (see §4) |

Nothing in this folder, `eval/`, `result.md`, `test.md`, the other `*-notes/`
folders or `promo-animation/` is ever staged.

## 1. The gate, as measured at PAUSE 2

```
npm run verify   40 skills · 51 agent files · 212 contracts     (1.9.0: 208)
npm test         1173 passed · 0 failed · 3 skipped · 1176 tests · 78 files
```

The 1.9.0 baseline, re-measured on a stashed tree at the same pause, is
**1110 passed · 0 failed · 3 skipped · 1113 tests**. So this release adds **63
tests** and skips nothing new. The three skips are pre-existing.

**A warning about the suite.** One run reported 5 failures in
`test/cli/extra-secrets.test.js` and the `net` pool. That was two `npm test`
runs overlapping on the same box, not a defect: run alone the file passes 14 of
14, and a clean full run reports `flaky: []` and `failures: []`. **Never run two
suites at once.** `node bin/test-run.js --json` prints `failures[]`, which is
the fastest way to see WHICH test failed — `npm test` prints only the totals.

## 2. What is built, item by item

| Item | Where | Done |
|---|---|---|
| **W0** goldens | `test/goldens/graph-json-1.9.0/` (19 answers) + `test/cli/_graph-fixture.js` | ✅ |
| **B1** `--brief` | `briefOf()` in `bin/cli.js`; `emitJson(obj, exit, compact)` | ✅ |
| **B3** `paid.envelope` | `finish()` owns the ledger append; `bin/graph-gain.js` sums it | ✅ |
| **V1** `changes` totals | `bin/graph-signals.js`: `totals{}`, `tests[]`, `tests_line`, `blast_line`, `--files=` | ✅ |
| **V2** `impact --complexity` | `complexityOf()` in `bin/graph-signals.js`; `--risk=` parser; 4 constants | ✅ |
| **V3** `facts{}` | returned by `complexityOf`, `map: null` for the lane to fill | ✅ |
| **B2** 46 call sites | every payload `--json` graph read carries `--brief` | ✅ |
| **A1** `meta.density` + THIN | `densityOf()` in `bin/graph.js`; `isThin()` + 3 constants in `graph-signals.js`; backfill under `--heal` | ✅ |
| **A2** `orc graph audit` | NEW `bin/graph-audit.js` | ✅ |
| **A3** the panel | `bin/webui/js/panels/knowledge.js` + i18n + fixture + `orc-ui-wiki.md` | ✅ |
| **A4** map knock-down | `bin/graph-map.js` `multiplier()` | ✅ |
| **M1** `hook-update` row | `templates/hooks/orc-graph-hook.js` `onExecutorStop()` | ✅ |
| **M2** `never_called` | `READ_SET` in `bin/graph-gain.js`; line + JSON + UI | ✅ |
| **M3** envelope in the UI | the `paid` row reads `(cards · source · hints · envelope)` | ✅ |
| **R1–R4** delivery | — | ❌ **W5** |
| **E1–E3** the extractor | — | ❌ **W5b**, only if DE-15 = b |
| docs + release | — | ❌ **W6** |

## 3. Measured results (this tree, 22-09-2026)

`--brief` against the plan's gate of `≤ 1.25 × card + 120` tokens:

| command | full | brief | card | gate | saving |
|---|---|---|---|---|---|
| `ctx <symbol>` | 2,773 | 734 | 600 | 870 | −74 % |
| `ctx <file>` | 1,484 | 369 | 243 | 424 | −75 % |
| `ctx --for-slice` 3 | 1,818 | 420 | 320 | 520 | −77 % |
| `impact` 3 files | 4,910 | 1,122 | 956 | 1,315 | −77 % |
| `map` | 8,995 | 1,193 | 1,113 | 1,511 | −87 % |
| `changes` | 5,228 | 934 | 681 | 971 | −82 % |

Every command clears the gate. The plan predicted −73 % to −87 %; `map` came
back at 1,193 against a predicted 1,191.

Spine budgets: mini **275** (pin 280, was 279) · quick **323** (pin 325, was
324).

## 4. Files touched

**New (6):** `bin/graph-audit.js` · `test/cli/_graph-fixture.js` ·
`test/cli/graph-audit.test.js` · `test/cli/graph-brief.test.js` ·
`test/cli/graph-complexity.test.js` · `test/goldens/graph-json-1.9.0/`.

**Engine + CLI:** `bin/cli.js` · `bin/graph.js` · `bin/graph-gain.js` ·
`bin/graph-map.js` · `bin/graph-signals.js` · `bin/verify-contracts.js` ·
`bin/verify-package.js`.

**orc ui:** `bin/webui/js/panels/knowledge.js` · `bin/webui/fixtures/knowledge.js` ·
`bin/webui/i18n/{en,id}/knowledge.json` · `orc-ui-wiki.md`.

**Payload:** `agents-src/executor.template.md` → the 10 generated executors ·
both `orc-recon-*` agents · `templates/hooks/orc-graph-hook.js` ·
`templates/hooks/README.md` · `_shared/code-graph.md` · `_shared/read-ladder.md` ·
`_shared/phases/{execution,planning,preflight,review,ship,trace}.md` ·
`orc/SKILL.md` · `orc-fast/SKILL.md` · `orc-mini/SKILL.md` +
`references/complexity.md` · `orc-quick/SKILL.md` + `references/{look,gh-mode}.md`.

**Tests:** `graph.test.js` · `graph-gain.test.js` · `graph-lanes.test.js` ·
`test/hooks/graph-hook.test.js` · `test/webui/panels.test.js` ·
`test/goldens/diy-compile-default.md` (regenerated).

## 5. Decisions taken, and why

Taken as the plan recommended: **DE-2** (a, compact) · **DE-3** (a, opt-in
switch) · **DE-5** (a, backfill under `--heal`) · **DE-6** (a, `--risk=` flag) ·
**DE-12** (a, constants in `bin/graph-signals.js`) · **DE-13** (a, pause after
W2 and W4).

**DE-16 — built in full.** V1, V2 and V3 all landed, so 1.9.1 can carry mini's
half or drop it at any time without re-work.

**DE-4 — the THIN thresholds are the plan's provisional ones**: `files ≥ 30`,
`symbols/file < 3`, `zero share ≥ 0.40`. They are named constants with their
reasons in `bin/graph-signals.js` and each is tested at its edge. Re-cut them
with the company project's own `orc graph audit` output before W6.

**Still open, and W5 needs them:** DE-1 (version) · DE-8 (flip
`code_graph_hooks` to `on,read` — the plan says no, gather the count first) ·
DE-14 (a paid eval round — the plan says no) · **DE-15 (the extractor change,
which is the whole of W5b)**.

## 6. Five judgement calls a reader should know about

1. **A golden is compared key-and-value, not byte for byte.** W1, W2 and W4 add
   fields on purpose, so a literal byte compare would be re-frozen at every wave
   and would then prove nothing. `test/cli/graph-brief.test.js` fails on any key
   that disappears, any value that moves, and any key that arrives without a
   line in its `ADDED` / `CHANGED` table. Those two tables ARE the record of
   what this release changed.
2. **`changes` gained a top-level `tests[]`.** The spec told the lane to run the
   files `tests[]` names, but `--brief` drops `symbols[]`, where those paths
   lived. A count cannot be run, so the CLI returns the paths as a short list
   that brief keeps. `03-brief-json-spec.md` §2 does not mention it.
3. **The recon agents' `impact` DOES carry `--brief`.** `03` §4 row 4 says to add
   it and `02-PLAN.md` §2 B2 lists it as an exception; they contradict. Row 4
   wins, because the four caller classes are read off the CARD (`ROUTE`,
   `(via x)`, `(inherited)`), never off `callers[]` — and both agent files now
   say so in one sentence.
4. **Mini LEFT the `graph-cochange` catalogue row.** It no longer names the
   command. `LANE_CALLS` and `graph-lanes.test.js` both carry the reason.
5. **The catalogue lint learned about user commands.** It required ≥ 2 lanes per
   row and `orc graph audit` has none. A row with `lanes: []` is now asserted the
   other way round — no lane may name it — which is stronger than the rule it
   replaced.

**One gate missed, on purpose.** W3 wanted mini's spine ≥ 8 lines shorter; it is
4. Mini writes each step as one long line, so moving prose out of a 12-line
section reclaims what that section occupied and no more. Both budgets hold with
room. The diff was not padded to reach the number.

## 7. How to pick W5 up

1. Read `00-README.md` (rules + baseline), then `02-PLAN.md` §8 (waves) and §10
   (decisions), then `06-delivery-spec.md` — it holds the exact text and shapes
   for R1–R4 and must not be re-derived.
2. Read `claude-rules/00-guards-and-release.md` before any edit under `bin/` or
   `templates/`.
3. `git status --short` and this file say what is done. There are no commits to
   read, and `git stash list` holds **older, unrelated** stashes — leave them.
4. Confirm the gate before starting: `npm run verify` then
   `node bin/test-run.js --json`. Both must be green.
5. W5 is R1 (`ctx --callers-source`) · R2 (`wide_unhinted` counter) · R3 (the
   personalised wide hint) · R4 (the LSP sentence + `lsp_at`). **Ask DE-8 and
   DE-15 first** — R2 exists to gather the data DE-8 needs, and DE-15 decides
   whether W5b happens at all.
6. Every new flag is a bare switch or `--name=value`, never `--name value`.
7. `bin/cli.js` is CRLF and the shell eats backslashes in a heredoc. Write a
   `.js` or `.py` file with the Write tool and run it for any edit to `bin/cli.js`
   or any edit that carries `\n`, `\d` or a regex.
