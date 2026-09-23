# Plan — graph use, v1.9.1

Plan only. Nothing here is built. Evidence: `01-research.md` (cited as R §n).
Exact text and shapes: `03` … `06`. Decisions for the user: §10.

## 0. The problem, in five lines

1. **The orchestrator pays 4–8× the card for every graph answer**, on the
   74–80 % surface, on every later turn — and the meter records the card only
   (R §1.2–1.4, §4.2).
2. **Two lanes still count rows to print a line.** Quick's blast radius and
   mini's complexity line are computed by the orchestrator from `symbols[]` and
   `callers[]`, so those answers cannot be made brief until the CLI computes the
   line (R §4.5).
3. **A thin map is silent about being thin.** 1.9 symbols per file on the user's
   project (R §2) means most `ctx` calls answer exit 4, and nothing says whether
   the code has no named functions or the parser did not read them.
4. **The meter shows two wrong numbers**: hook updates are always 0 (R §4.1) and
   `paid` is the card, not the answer (R §4.2).
5. **The paid reads live in the executor and the recon agent**, where a card is
   followed by a `Read` of the caller. The research that shows a win shows it
   when the source travels with the answer (R §5: codegraph, FastContext).

**What this plan does NOT promise, stated first.** No session-percent saving
(EW8; re-confirmed R §1.5). Every token figure is the graph's OWN cost, measured
on this tree, and the saving is measured by the meter it fixes. No engine
change: the store on disk is read as it is.

## 1. The design in one screen

```
 B  BRIEF ANSWERS (the orchestrator's surface)            V  THE CLI COMPUTES THE LINE (S1 for the graph)
 ┌──────────────────────────────────────────────┐        ┌──────────────────────────────────────────────┐
 │ B1 --brief switch on every read              │        │ V1 changes: totals{} + blast_line             │
 │    keeps card · line · trace · scalars       │        │    quick Q4 / mini M5 print it, count nothing │
 │    drops callers[] calls[] files[] symbols[] │        │ V2 impact --complexity [--risk=a,b]           │
 │    compact JSON · full --json byte-identical │        │    verdict · why[] · numbers · the exact line │
 │ B2 46 lane call sites gain --brief           │        │    impact + cochange in ONE call               │
 │    announce[] names it; contract §3 says why │        │ V3 graph_facts = that answer's facts{}        │
 │ B3 paid.envelope — the meter records the     │        │    one call, one paste, into the planner slice│
 │    answer, not the card                      │        └──────────────────────────────────────────────┘
 └──────────────────────────────────────────────┘
 A  THE THIN MAP                                           M  THE HONEST METER
   A1 meta.density at update; status says THIN               M1 the hook writes a hook-update ledger row
   A2 orc graph audit — zero-symbol and skipped files,          (35 real updates in 5 company runs; ledger 0)
      by language, longest first, the shape it saw           M2 gain says which reads were NEVER called
   A3 the Knowledge panel shows density + the audit line     M3 = B3; the UI shows envelope beside cards
   A4 map: a zero-symbol file is knocked down like a private one (read-time; map.json untouched)
 E  NAME WHAT A FRONT-END CODEBASE SEARCHES FOR (DE-15 — the ONE optional engine change, wave W5b)
   E1 Options API / mixin / Vuex members as class + method (416 of 429 .vue files have NO symbol today)
   E2 exported constants · E3 a <script setup> component owner → names.json answers the Grep the hook
   sees; graph@6, one automatic re-extract (≈ 6–7 s on 808 files), notes and function ids unchanged
 R  DELIVERY (where the paid reads are)
   R1 ctx <symbol> --callers-source  — 6 lines around each of ≤ 5 confident call sites, budget-charged
   R2 the hook COUNTS wide whole-file reads it did not hint; gain prints the count (data before a default)
   R3 the wide hint names the run's own slice/search names first (only under on,read)
   R4 the ladder: AMBIGUOUS card + an LSP tool in the session → findReferences at lsp_at, not a Grep
 BACKWARD COMPATIBILITY (§6): no ENGINE/SCHEMA bump · every --json byte-identical (goldens) · new fields
   additive · new flags are switches or --name=value · a gen-93 store reads FRESH · exit codes unchanged
```

## 2. B — brief answers

### B1 — the `--brief` switch

Every `orc graph` read (`status`, `update`, `ctx`, `ctx --for-slice`, `impact`,
`map`, `changes`, `coverage`, `cochange`, `notes pending`, `gain`, `path`)
accepts `--brief` beside `--json`. The answer keeps: `ok`, `state`, every
scalar the answer has today, `card`, `line`, `trace`, `budget`, `generation`,
`gen_id`, `read`, `read_fallback`, `healed`, `hidden`, and the COUNT of every
row array it drops (`callers: 7` in place of seven objects). It drops the row
arrays: `callers[]`, `calls[]`, `effects[]`, `files[]` (map), `symbols[]`,
`blocks[]`, `names[]`, `imports[]`, `importers[]`, `cards[]`, `source`,
`rows[]` (coverage, cochange), `nearest[]`/`candidates[]` stay (an exit-4 answer
is its rows). The brief answer prints COMPACT (`JSON.stringify(obj)`), because
its reader is a model and the card string carries its own newlines (DE-2).
Without `--brief`, `--json` is byte-identical to 1.9.0 — a golden test holds it.
Shapes per command: `03-brief-json-spec.md` §1–§2.

Why: R §1.2–1.3 — −73 % (ctx) to −87 % (map) per answer, on the main-session
surface, re-sent every turn. Gate: the brief answer of every command in the
R §1.2 table is ≤ 1.25 × its card + 120 tokens, measured by the same script.

### B2 — every lane call site says `--brief`

The 46 payload lines that carry an `orc graph … --json` gain `--brief`
(`03-brief-json-spec.md` §4 lists each, before and after). Exceptions, each
with its reason in the spec: mini's `impact` and quick's `changes` until V1/V2
land (they read rows today); the recon agents' `impact` when `blast_radius:
true` (the return contract names four caller kinds APART — it needs the rows
until V2's `facts` carries them per kind); the noter's `notes apply` (not a
read). The `announce[]` line in `orc lane config` names `--brief` in steps (1)
and (2). `_shared/code-graph.md` §3 gains one sentence: "Add `--brief` to every
`--json` read unless the step names a row array it reads." The lane lint in
`test/cli/graph-lanes.test.js` matches `orc graph <sub>`; a flag after the
subcommand is free.

Gate: `grep -rn "orc graph .*--json" templates agents-src` shows `--brief` on
every line not in the exceptions list (a test asserts it); `npm run verify`
green; the `diy-compile-default.md` golden regenerated (the `diy:` blocks in
`execution.md` and `review.md` compile into it).

### B3 — `paid.envelope`

`gainRowFor()` adds `paid.envelope = tok(answer) − tok(card)` where `answer`
is the exact string `emitJson` will write. `gain()` sums it, the `line` prints
`paid <total> (cards · source · hints · envelope)`, the UI row too. A hook row
has `envelope 0`. Additive: `readLedger` requires only `cmd`, `paid`, `avoided`;
an old row without `envelope` sums as 0.

Why: R §4.2 — the one number the meter calls EXACT is 4–8× too small. With B1
the envelope falls to ≤ 25 % of the card, and the meter shows the fall.

## 3. V — the CLI computes the line

### V1 — `changes`: `totals{}` and `blast_line`

`graphChanges()` adds `totals: {symbols, callers, caller_files, tests, maybe,
high, medium, low, not_in_graph}` and `blast_line`, the exact one-line blast
radius quick prints today (`orc-quick/SKILL.md` line 199) and the `none indexed`
form. `--files=a,b` restricts the rows to the given paths (quick keeps
`actual_files`; the CLI does the filter). The lane text becomes "print
`blast_line`". Exact format: `04-lines-spec.md` §1.

### V2 — `impact --complexity [--risk=a,b]`

`impact <declared files> --complexity` adds `complexity: {verdict:
"mini-ok" | "recommend-orc", why[], numbers: {files, callers_outside,
caller_files_outside, maybe, tests_reaching, cochange_missing[]}}` and the exact
complexity line (`complexity.md` §3, three shapes). The operands ARE
`declared_files`; callers inside them are not counted (complexity.md §2 "outside,
not inside"). The call also runs `cochange` for every operand inside the same
process and lists partners with ≥ `COCHANGE_MIN` co-commits that are not
operands — one call replaces `impact` + N `cochange`. `--risk=auth,payment`
supplies `facets.risk[]` so the CLI prints the full line; without it the
`why[]` carries `risk: not given` and the orchestrator appends the risk class.
The four thresholds move from prose into `bin/graph-signals.js` as named
constants; `complexity.md` quotes them and a contract row pins the wording.
Exact shape and line: `04-lines-spec.md` §2.

### V3 — `graph_facts` from that one answer

The `complexity` answer carries `facts: {map: null, impact: [{file,
confident_callers, caller_files, tests_reaching}], cochange: [{file, partners:
[{path, count}]}], generation}` — the §1b shape of `complexity.md`, ready to
paste into the planner slice (mini pastes the `map --focus` card into `map`
itself, as today). Mini's Phase 1 goes from `impact` + N `cochange` + counting
to ONE call and two pastes. Spine text that moves: `04-lines-spec.md` §3.

Why: R §4.5, DE-14 (b). Gate: the CLI's `complexity` line is byte-identical to
the line the spine specified for the same numbers on the fixture (a test
constructs both); mini's spine loses ≥ 8 lines and stays under its pin (280);
quick's stays ≤ 325.

## 4. A — the thin map

### A1 — `meta.density`, and a status line that says THIN

`graphUpdate()` writes `density: {symbols_per_file, zero_files, zero_share,
skipped, by_lang: {<lang>: {files, symbols, zero, partial, skipped}}}` into
`meta.json` whenever it rewrites meta (additive). `status` prints the density
and, when `files ≥ THIN_MIN_FILES` and `symbols_per_file < THIN_PER_FILE` and
`zero_share ≥ THIN_ZERO_SHARE`, appends ` · THIN (1.9 symbols/file · 61 % of
files have no symbol) — run: orc graph audit`. The trace gains ` density=1.9`
(additive token on `GRAPH-CONSULT`). A meta without `density` (a 1.9.0 store)
prints no density until the next real update; `status --heal` backfills it once
from `index.json` when it is missing (DE-5), so a FRESH store still gets the
line at its next preflight. Thresholds: DE-4. Exact line: `05-audit-meter-spec.md` §1.

### A2 — `orc graph audit [--json] [--top=N]`

A read (exit 0 always when a graph exists · 1 no index · 3 off). Prints: the
density table by language (files · symbols · per file · zero · partial ·
skipped · extractor rung used), the zero-symbol files longest first (top N,
default 20, with `lines`), the skipped files with their reason (`too-large`,
`unreadable`, …), the partial files with their ranges, and — for js/ts/vue/
svelte zero-symbol files — the FIRST declaration shape the file opens with,
counted (`module.exports = {`, `export default {`, `export default
defineComponent(`, `<script setup>`, `export const X = () =>`, `class X`,
other), so the reader can tell data from a parser gap. It reads `index.json`
and the first 40 lines of each listed file; 0 model tokens; never writes. Exact
output: `05-audit-meter-spec.md` §2.

### A3 — the Knowledge panel

The Code Graph card gains a `Density` row (`1.9 symbols/file · 61 % files empty
· THIN`) and, when THIN, one line naming `orc graph audit`. `/api/graph` already
returns `status --json`; the row reads `density`. en/id i18n keys, the fixture,
`orc-ui-wiki.md`. Spec: `05-audit-meter-spec.md` §5.

### A4 — a zero-symbol file is knocked down in `map`

`multiplier()` in `bin/graph-map.js` halves a file whose every symbol is
private; a file with no symbol at all keeps its full rank (R §4.4b). On the
company map 16 of 26 shown rows are such files. Change: `if (!syms.length ||
!syms.some((s) => s.exported)) m *= 0.5;` — the same reason as the private rule
(nothing outside can call it by name). Read-time only: `map.json` stores the
unfocused PageRank and is not touched. If DE-15 (b) ships, most of those files
gain exported symbols and are no longer knocked down — which is the right
outcome for both. Gate: the fixture map's order for files WITH symbols is
unchanged; a constants-only fixture file drops below the code that imports it.
Spec: `05-audit-meter-spec.md` §1.4.

Why: R §2 (1.9/file, unexplained), R §2.1 (16 of 26 map rows point at nothing),
R §1.6 (the probe answers), R §4.4 (the largest file is skipped in silence).
Gate: on this tree the audit names the 25 zero-symbol fixtures and `bin/cli.js
too-large`; on the Express fixture it prints no THIN; on the company data the
density table matches the pasted numbers.

## 4b. E — name what a front-end codebase searches for (DE-15, optional wave W5b)

The company data (R §2.1–2.2) says the extractor reads what it was built to
read and misses half of this codebase: **416 of 429 `.vue` files have no
symbol**, the longest are 930–2,047 lines, and a 1,451-line mixin is empty too.
The js/ts rungs do not read the members of an object literal, which is how an
Options API component, a mixin and a Vuex module define every function they
have. So the hook's Grep hint fired 9 times against 35 hook updates,
`wide.json` cannot name a range in a 2,047-line component, `changes` reports
"no indexed symbol was touched" for an edit inside a method, and `names.json`
cannot answer the names a Vue codebase searches for.

What (b) adds, js/ts/vue/svelte only, in this order of weight:

| # | New symbol | Shape | Kind | `qname` | Exported |
|---|---|---|---|---|---|
| **E1** | **an object-literal member of a default-exported object** | `export default { … }` or `export default defineComponent({ … })` or `Vue.extend({ … })` or `export default { mixins: […], methods: {…} }`: every function-valued member at depth 1 (`data() {}`, `mounted() {}`, `setup() {}`) and every function-valued member of the depth-1 sections `methods` · `computed` · `watch` · `getters` · `mutations` · `actions` · `filters` · `provide` (a method shorthand `submit() {}`, an arrow `submit: () => {}`, a function expression `submit: function () {}`, a getter/setter pair) | `method` | `<Owner>.<name>` — `Owner` is the `name:` property when present, else the file stem (`CreateFundTransferModal`); a section is NOT part of the qname (`CreateFundTransferModal.submit`, not `.methods.submit`) | the OWNER is; a member is `exported: false` |
| E1a | the owner | the default-exported object itself | `class` | `<Owner>` | yes |
| E2 | a top-level constant | `export const NAME = …` · `export let/var NAME` · `exports.NAME = …` · the keys of a top-level `module.exports = { A, B }` · `export default { A, B }` keys when every value is a non-function | `const` | `NAME` | yes |
| E3 | a component with no named function | a `.vue`/`.svelte` file with `<script setup>` or no script: ONE `class` symbol named from the file stem, lines = the `<script>` block or 1–EOF | `class` | `<Stem>` | yes |

No new `kind` word except `const`: the owner is a `class` and a member is a
`method`, so inheritance (`mixins`/`extends` → `bases`), `classOf`, the
private-only knock-down, `KIND_SHORT`, the noter's `NOTE_KINDS` and every card
format apply unchanged.

Rules for E1: a `this.x()` call inside a member is marked `self: true` with the
owner as its class, so it resolves `LOCAL` to `<Owner>.x` through the existing
`classOf` rung — the same path a class method takes today; a `this.x` READ of a
data/computed member is not a call and is not an edge. `mixins: [foo]` and
`extends: Base` become `bases: ["foo", "Base"]` on the owner, so an inherited
member walks the same `inheritedMember` chain a class does. A member of a
component is `exported: false` (the template reaches it, and the parser does
not read the template — a card's silence rule already covers this); the owner
is exported, so the file is never knocked down as private-only. A `const`
symbol has `calls: []`; `NOTE_KINDS` gains nothing (a `method` is already
noteable — an Options API method WITH a `doc` comment gets its doc note for
free, and one without joins the noter's batch like any method). `importance`,
`map` rows, `changes` and `--for-slice` need no new rule: a member is a
`method`, an owner is a `class`. `TEST_FILE` and every state word are
unchanged. Reading `<template>` for `@click="submit"` edges is NOT in this
release (listed in §15).

The cost, stated once: `ENGINE = "graph@6"` and `HEURISTIC` `@6`. A graph@5
store reads `DRIFTED (engine_stale)` and the next `status --heal` re-extracts
every file once — 7.9 ms/file measured here → ≈ 6–7 s on 808 files, inside the
first preflight, automatic. Blobs are content-addressed (nothing is deleted
until `gc`); function symbol ids do not change, so `notes.jsonl` stays current;
the derived caches are rebuilt in the same locked pass. `test/goldens/graph-1.8.1/`
stays frozen; `graph-upgrade.test.js` gains the @5 → @6 case. This is exactly
the 1.8.1 → 1.8.2 path.

Gate for W5b: on the company project (measured by the user after the wave, with
the README's density command) `vue` zero-symbol share falls from 97 % to under
20 %, project density ≥ 4 per file (arithmetic in R §2.2 says ≈ 5.6), and
`injected` > 0 in the next five quick runs; on this tree density and every
existing test unchanged except the new kinds; `check.js` 0 FAIL with two new
fixture files (an Options API component with `mixins`, a Vuex module) and
answer-key rows for `ctx CreateFundTransferModal.submit` (callers: the mixin
method that calls `this.submit()`), `impact` on the mixin file (every component
that mixes it in), and `ctx SET_USER`.

If (a) is chosen, nothing here is built, A4 alone corrects the map, and the
audit's shape table says "Options API object — the parser does not read its
members (parser gap)" for 416 files on this project. **For this project (a)
leaves the graph blind to half the code; the recommendation is (b).**

## 5. M — the honest meter

### M1 — the hook writes the row the meter counts

`onExecutorStop()` appends `{cmd: "hook-update", paid: {card:0, source:0,
hints:0, envelope:0}, avoided: {low:0, high:0, calls_low:0, calls_high:0},
targets: [agent], gen}` after a successful update, inside the fail-quiet
wrapper, after the trace line. `hints.updates` becomes a real number. The
counters file keeps its own `updates` field unchanged.

### M2 — `gain` names the reads that were never called

`gain()` adds `never_called: [...]` = the read set (`ctx`, `for-slice`, `impact`,
`map`, `changes`, `cochange`, `coverage`) minus `by_command` keys, for the scope.
The `line` gains `  never called  map · impact · changes` when non-empty; the UI
row too. It is a fact about the ledger, not advice — no lane prints it.

### M3 — `paid.envelope` (= B3)

Why: R §4.1, R §2 (`updates 0`), R §4.2. Gate: one executor dispatch on the
fixture with the hook wired → `hints.updates ≥ 1`; `never_called` on the user's
ledger lists exactly the commands the screenshot lacks.

## 6. Backward compatibility — the store built today keeps working

The user's constraint, stated first: **data compiled today is used as it is.**

| Concern | Rule | Mechanism |
|---|---|---|
| The store (`index.json`, blobs, `files.json`, `meta.json`) | **no `ENGINE` or `SCHEMA` bump; no record field changes** | `graph.js` reads `ENGINE = "graph@5"`, `SCHEMA = 1` unchanged; a generation-93 store built by 1.9.0 reads `FRESH` with zero re-extraction; `meta.density` is a NEW optional field written at the next real update (or backfilled once by `status --heal`, DE-5) |
| Derived caches (`resolved.json`, `names.json`, `wide.json`, `map.json`, shards) | untouched | schemas 3 / 1 unchanged; nothing new is read from them |
| `notes.jsonl`, `cochange.json` | untouched | — |
| `gain.jsonl` | additive rows and fields | new `cmd: hook-update`; new `paid.envelope`; `readLedger` requires only `cmd/paid/avoided`; `gain()` sums a missing `envelope` as 0; `compact()` unchanged |
| `--json` output | **byte-identical for every command without `--brief`** | W0 freezes goldens for every command on the Express fixture; a test compares at every wave; new fields (`totals`, `blast_line`, `complexity`, `facts`, `density`, `never_called`, `lsp_at`) are ADDITIVE and appear only when their flag is given or the data exists |
| Exit codes | unchanged | every new answer reuses the command's existing codes; `audit` uses 0 · 1 · 3 |
| New flags | **bare switches (`--brief`, `--complexity`, `--callers-source`) or `--name=value` (`--risk=`, `--files=`, `--top=`)** | a 1.9.0 CLI skips any `--x` word in every positional loop, so a 1.9.1 payload on a 1.9.0 CLI gets the full answer and no swallowed operand (R §4.3) |
| A 1.9.1 payload with a 1.9.0 CLI | every lane line has a one-sentence fallback | "no `blast_line` → count `symbols[]` as 1.9.0 did"; "no `complexity` → count as `complexity.md` §2 says"; `--brief` ignored → full JSON, same fields; stated as a known limit in the CHANGELOG as 1.8.2 and 1.9.0 did |
| A 1.9.0 payload with a 1.9.1 CLI | every old call keeps its flags, fields and exits | the goldens |
| Hooks | no new event, no `settings.json` change; the counters file gains `wide_unhinted` (additive) | `wireGraph` untouched; `orc doctor` counts the same five entries |
| Config | no new key | thresholds are constants in `bin/graph-signals.js`; `code_graph_hooks` values unchanged (`on,read` still opt-in) |
| Traces | `GRAPH-CONSULT` gains an optional ` density=<n>`; no new verb | trace.md's additive-row rule; `orc stats` reads only `STATS`; `/orc-retro` ignores unknown tokens |
| Agents | the executor template gains one sentence (R4); regenerated by `npm run build:agents` | `verify` checks the generated files |
| `orc ui` | new rows render when the field exists, else the row is hidden | `knowledge.js` guards on `g.density`, `g.paid.envelope`, `g.never_called` |
| The Express eval fixture and `test/goldens/graph-1.8.1/` | frozen, never regenerated | — |
| **Only if DE-15 (b) is chosen (W5b):** the engine tag | `graph@6`; a graph@5 store reads `DRIFTED (engine_stale)` and is re-extracted ONCE by the next `status --heal`, automatically, ≈ 6–7 s on 808 files | the 1.8.1 → 1.8.2 path (`graphUpdate` `upgrade` branch); blobs content-addressed; function ids and notes unchanged; derived caches rebuilt in the same pass; `graph-upgrade.test.js` covers @5 → @6. Compatibility here means nothing breaks and nothing is manual — not that the bytes never change |

## 7. If a 1.9.0 item did not ship

| Missing | This plan does instead |
|---|---|
| quick's `changes` step (Q4) | V1 still ships; the spine line that prints `blast_line` is added where Q4 would be |
| mini's `graph_facts` | V3 still carries `facts`; the planner slice line is added |
| the recon pair | R1 is wired into the executor template's ladder step 3 only |
| `LANE_CALLS` rows for map/impact/changes in quick and mini | B2 adds `--brief` only where the row exists; the lint derives the rest |

## 8. Waves

| Wave | Items | Gate (measured) |
|---|---|---|
| **W0** measure + goldens | freeze `--json` goldens for every command on the Express fixture (`test/goldens/graph-json-1.9.0/`); re-measure R §1.2–1.3 with the script; measure ONE `/orc-mini` run's graph JSON on this tree (`graph-json-cost.js`); fold in the company data if pasted | goldens written; the R §1.2 table reproduced within ±5 % |
| **W1** B1 + B3 | `--brief` on every read; compact output; `paid.envelope`; `gain` line + JSON | brief ≤ 1.25 × card + 120 tokens per command; full `--json` byte-identical to W0 goldens; `graph-brief.test.js` green |
| **W2** V1 + V2 + V3 | `changes` totals/`blast_line`/`--files=`; `impact --complexity --risk=`; `facts`; constants in `graph-signals.js` | the CLI line equals the spine-specified line for the same numbers (test); one call replaces impact + N cochange (test counts processes) |
| **PAUSE 1** | `npm run verify` · `npm test` | green |
| **W3** B2 + the spine moves | 46 call sites → `--brief`; quick Q4 prints `blast_line`; mini Phase 1 = one call, `graph_facts` from `facts`; `announce[]`; contract §3 sentence; contract rows (`--brief`, `blast_line`, `--complexity`); regenerate `diy-compile-default.md` | grep test: every `--json` graph call carries `--brief` or is in the exception list; mini spine ≤ 280 and ≥ 8 lines shorter; quick ≤ 325; verify 208 → ≥ 211 |
| **W4** A1 + A2 + A3 + M1 + M2 | `meta.density`, THIN line, backfill; `orc graph audit`; hook-update row; `never_called`; UI rows + i18n + fixture + `orc-ui-wiki.md` | audit on this tree names 25 zero-symbol files and `bin/cli.js too-large`; fixture prints no THIN; `hints.updates ≥ 1` after one hook update in the hook test; UI fixture renders |
| **PAUSE 2** | `npm run verify` · `npm test` | green |
| **W5** R1 + R2 + R3 + R4 | `ctx --callers-source`; `wide_unhinted` counter + gain line; personalised wide hint; ladder LSP sentence + `lsp_at`; recon agents + executor template text | `--callers-source` never exceeds the budget and never prints a file the operand's own file (test); the counter increments on a whole-file read of a wide file with `on` (not `on,read`) and emits nothing (hook test); `lsp_at` column equals the name's index on the definition line (test) |
| **W5b** (only if DE-15 = b) E | E1 object-literal members of a default-exported object as `class` + `method` (Options API, mixins, Vuex modules; `this.` calls `self`; `mixins`/`extends` → `bases`); E2 `const` symbols; E3 the `<script setup>` owner; `ENGINE graph@6`; `graph-upgrade.test.js` @5 → @6; three new fixture files (an Options API component with a mixin, a Vuex module, a constants module) with answer-key rows | `check.js` 0 FAIL; this tree's density unchanged except the new kinds; `ctx CreateFundTransferModal.submit` answers with its mixin caller on the fixture; the user's re-run of the density command shows `vue` zero share < 20 % and density ≥ 4; W3's `--brief` goldens re-frozen ONLY for the fields the new kinds add |
| **W6** docs + release | CHANGELOG 1.9.1 on top; README + README-id (latest line, graph section, changelog entry); `guides/configuration.md`; `knowledge.md` router row + `knowledge-parts/05` §4z.31; `claude-rules/04`; `templates/hooks/README.md`; `orc-ui-wiki.md`; `npm version patch` → 1.9.1 | `npm run verify` + `npm test` green; one commit, package/payload/doc/test files only |

Pause after every two waves (DE-13). Docs are W6's; a pause does not need them.

**Order for this user.** `orc stats` on the company project: `/orc-quick` 40 %
of 94 runs, `/orc-mini` 0 (R §2.1). So W1 → W2 builds V1 (quick's `blast_line`)
FIRST and V2/V3 (mini's line) may move to a later release (DE-16); W3 does
quick's call sites before mini's; W4 and W5b are where this project gains the
most, because its hook hints depend on `names.json` knowing constants and
components.

## 9. Risks

| Risk | Mitigation |
|---|---|
| A lane reads a row array the brief answer dropped | W3's exception list is derived by grepping the spines for `symbols[]`, `callers[]`, `files[]`, `rows[]` references BEFORE adding `--brief`; the CLI keeps counts so a `hidden`/`total_callers` check still works |
| The CLI line and the spine's line drift | one implementation, one contract row pinning the format words, the spine quotes the CLI (`print blast_line`), never restates the format |
| `meta.density` backfill parses `index.json` at a preflight (22 MB on django ≈ 250 ms) | once per store, only when the field is missing, only under `--heal`; bounded by `code_graph_heal_ms` like every heal |
| The audit's shape sampler misreads a file | it prints the FIRST declaration it saw and the count; it never claims a reason; `_shared/code-graph.md` says the audit is a hint |
| `--callers-source` re-introduces the "80 % more resident context" trap | budget-charged like `--source`; ≤ 5 callers × 6 lines; never the file the agent will edit (ladder exception 1 restated in the same sentence); the meter records it as `paid.source` |
| A brief answer hides a `CHANGED`/`coverage` warning | those are in the `card` header, which brief keeps; `healed` stays |
| Threshold values are wrong for a real project | DE-4 is decided with the company data; the constants live in one file with their reasons |

## 10. Decisions for you

| # | Question | Options | Recommendation |
|---|---|---|---|
| **DE-1** | Version | (a) `1.9.1` patch as asked · (b) `1.10.0` (new flags, new command) | **(a)**, with one CHANGELOG line that says the number was the user's call, as 1.8.2 did |
| **DE-2** | Brief output formatting | (a) compact JSON · (b) keep 2-space pretty | **(a)** — measured 3–4 % on the brief shape, free, and the reader is a model |
| **DE-3** | Brief by default? | (a) opt-in switch, full `--json` unchanged · (b) brief default + `--full` | **(a)** — (b) breaks the UI's `/api/graph` readers and every golden; compatibility is the constraint |
| **DE-4** | THIN thresholds | files ≥ 30 · symbols/file < 3 · zero share ≥ 40 % — all three | **these, provisionally**; re-cut with the company data (R §2 gives 1.9 and an unknown zero share) |
| **DE-5** | Backfill `meta.density` on `status --heal` when missing | (a) yes, once, bounded by `code_graph_heal_ms` · (b) wait for the next real update | **(a)** — a FRESH store never updates, so (b) leaves the user's gen-93 store without the line |
| **DE-6** | The risk class into `--complexity` | (a) `--risk=a,b` flag · (b) the orchestrator appends it | **(a)** — the full line comes from one place; (b) is the drift §9 names |
| **DE-7** | `--callers-source` window | 6 lines around each of ≤ 5 confident callers, budget-charged | **as written**; DE-7b: also on `--for-slice`? **no** — the executor reads declared files whole; the outside view stays row-only |
| **DE-8** | Flip `code_graph_hooks` default to `on,read` | (a) no — R2 counts first · (b) yes | **(a)**; the count is free and a default flip that changes how an agent reads must be armed on purpose (1.8.2's rule) |
| **DE-9** | The LSP sentence | (a) ladder sentence + `lsp_at {line, character}` on a symbol card · (b) sentence only | **(a)** — the LSP tool needs a 1-based character and the CLI can read that one line for ~0 cost |
| **DE-10** | Hook updates in the meter | (a) a `hook-update` ledger row · (b) `gain` reads the counters files | **(a)** — one reader, one file; the counters stay as the trace's source |
| **DE-11** | `never_called` | (a) `gain` line + JSON + UI · (b) UI only | **(a)**; a fact about the ledger belongs where the ledger is printed |
| **DE-12** | Where the four complexity thresholds live | (a) constants in `bin/graph-signals.js`, quoted by `complexity.md`, pinned by a contract row · (b) prose only | **(a)** |
| **DE-13** | Pause cadence | after W2 and after W4 | **as written** |
| **DE-14** | A paid eval round (rerun R3-C with `--callers-source`) | (a) no — fixture tests + replay · (b) yes, N=3 each arm | **(a)**; R §3 last row: ~9 % of outcomes flip between identical runs, and the fixture cannot show the effect |
| **DE-15** | Name Options API members, constants and SFC components as symbols (§4b) | (a) no — no engine change in 1.9.1; A4 corrects the map; the audit explains the density · (b) yes — `graph@6`, one automatic re-extract (≈ 6–7 s on 808 files), W5b | **(b).** R §2.2: 416 of 429 `.vue` files have no symbol and the longest is 2,047 lines — the parser does not read object-literal members, so the graph is blind to 53 % of this project and cannot hint, rank or measure it. Compatibility holds: nothing breaks, nothing is manual, notes and function ids survive — the same path 1.8.2 shipped. W4's audit runs first and its "parser gap" count is the number W5b must bring down. If the re-extract is not acceptable, (a) |
| **DE-16** | Mini's V2/V3 in 1.9.1 | (a) keep — one release, one contract change · (b) defer to the release that has mini runs to measure | **(b) for this user, (a) for the package** — `orc stats` shows 0 mini runs of 94. Recommendation: build V1 in W2, put V2/V3 LAST in W2 and drop them from 1.9.1 if W2 runs long; the spec is written either way |

## 11. Files this plan touches

**Engine + CLI:** `bin/cli.js` (`--brief` in `finish`/`emitJson` path, `--complexity`, `--risk=`, `--files=`, `audit`, `announce[]`, `LANE_CALLS` `graph-audit` row, `gainRowFor` envelope) · `bin/graph.js` (`meta.density`, backfill) · `bin/graph-query.js` (brief shapes, `--callers-source`, `lsp_at`) · `bin/graph-map.js` (A4 multiplier) · `bin/graph-signals.js` (`totals`, `blast_line`, complexity constants, THIN constants, `--files=`) · `bin/graph-gain.js` (`envelope`, `never_called`, `hook-update`, `wide-unhinted`) · NEW `bin/graph-audit.js` · `bin/verify-package.js` (the new file) · `bin/verify-contracts.js` (new rows). **Only with DE-15 (b):** `bin/graph-extract.js` (the `const`/`component`/store-key rungs for js/ts/vue/svelte) · `bin/graph.js` (`ENGINE graph@6`) · `bin/graph-notes.js` (nothing — `NOTE_KINDS` excludes the new kinds by construction).

**Payload:** `templates/skills/_shared/code-graph.md` (§3 sentence, §3b, §7 `--callers-source`, §8b envelope) · `_shared/read-ladder.md` (LSP sentence) · `_shared/phases/{planning,execution,review,ship,preflight}.md` (`--brief`) · `_shared/phases/trace.md` (`density=` token) · `templates/skills/orc-quick/SKILL.md` + `references/look.md` + `references/gh-mode.md` · `templates/skills/orc-mini/SKILL.md` + `references/complexity.md` · `templates/agents/orc-recon-*.md` · `agents-src/executor.template.md` → 10 executors · `templates/hooks/orc-graph-hook.js` + `templates/hooks/README.md`.

**orc ui:** `bin/webui/js/panels/knowledge.js` · `fixtures/{knowledge,stats}.js` · `i18n/{en,id}/knowledge.json` · `orc-ui-wiki.md`.

**Tests:** NEW `test/cli/graph-brief.test.js` · `graph-complexity.test.js` · `graph-audit.test.js` · NEW `test/goldens/graph-json-1.9.0/` · edited `graph-signals.test.js`, `graph-gain.test.js`, `graph-lanes.test.js`, `graph-query.test.js`, `test/hooks/graph-hook.test.js`, `test/goldens/diy-compile-default.md`, `test/goldens/config-keys.json` (unchanged keys — asserted).

**Docs:** README, README-id, CHANGELOG, `guides/configuration.md`, `knowledge.md` + `knowledge-parts/05`, `claude-rules/04`, `CLAUDE.md` layout line for `bin/graph-audit.js`, `orc-ui-wiki.md`, `package.json` (1.9.1).

Never staged: this folder, `eval/`, `result.md`, `test.md`, the other `*-notes/`
folders, `promo-animation/`, the user's `.gitignore` and `test/docs.test.js` edits.

## 12. Tests

| Test | Holds |
|---|---|
| `graph-brief.test.js` | for each command: brief keeps `card/line/trace/generation`; drops the row arrays; keeps counts; is compact; brief ≤ 1.25 × card + 120; full `--json` equals the W0 golden byte for byte |
| `graph-complexity.test.js` | `--complexity` verdict per threshold (one test per threshold, one for `maybe` never tripping); the line equals the spine's three shapes; `--risk=` folds in; one process, N operands; `facts` shape |
| `graph-signals.test.js` | `totals`, `blast_line` both forms, `--files=` filter |
| `graph-audit.test.js` | density by language; zero-symbol ordering; skipped reasons; the shape sampler on six fixtures; THIN thresholds at each edge; backfill once |
| `graph-gain.test.js` | `envelope` summed; missing envelope = 0; `never_called`; `hook-update` counted |
| `graph-hook.test.js` | hook-update row appended after a successful update, not after a locked one; `wide_unhinted` increments under `on` and emits nothing; personalised order under `on,read` |
| `graph-query.test.js` | `--callers-source` budget, caller cap, never the operand's file; `lsp_at` |
| `graph-lanes.test.js` | every `--json` graph call in a lane folder carries `--brief` unless listed; `graph-audit` row lanes = `[]` (a user command) |
| `goldens.test.js` | `diy-compile-default.md` regenerated once, then stable |

## 13. Docs (the P0 rules in `CLAUDE.md`)

`package.json` → 1.9.1 (`npm version patch`). README: latest line, the graph
section (audit, `--brief`, `--callers-source`), the changelog entry on top,
the expandable list. README-id the same. CHANGELOG 1.9.1 on top with the
measured numbers (R §1.2–1.3) and the two defects (R §4.1–4.2) named as fixed.
`knowledge.md` router row + `knowledge-parts/05` §4z.31. `claude-rules/04` gains
the flag rule and the no-engine-bump rule. `orc-ui-wiki.md` for A3/M2/M3.
`guides/configuration.md`: no key changes; one line on `orc graph audit`.
ASD-STE100 throughout. Commit only after the changes; the message names no
process document.

## 14. Eval — round M5 (`eval/results/1.9.1/`)

Zero-token first: `graph-json-cost.js` over the transcripts of ONE `/orc-mini`
run before and after W3 on this tree (first-entry tokens of graph results;
gate: −60 % or more, from the R §1.4 arithmetic of −73 %). `orc graph gain`
before/after on the same ledger shows `envelope` falling. The company data
(README) re-cuts DE-4. No paid A/B (DE-14).

## 15. Not in this release, with the reason recorded

| Item | Reason |
|---|---|
| A trim of `_shared/code-graph.md` | lanes read it 0 times in 40 eval transcripts (R §1.7); it costs nothing at run time |
| Widening `map` to the analyst | 0 planning sweeps in 74 dev windows (R §1.5); M2's 0.39 still stands |
| An `ENGINE` bump for a `col` on calls, or any other record-field change | the store is the contract this release keeps; `lsp_at` is computed on read. The ONE engine change offered is DE-15 (b), new symbol KINDS with the record shape unchanged, and it ships only if chosen |
| The Haiku noter (DE-D) | its paid gate is unrun |
| `SessionStart`-after-compaction re-orientation | the hooks reference was not re-read this session (R §5.1) |
| Flipping `code_graph_hooks` to `on,read` | R2 gathers the count first (DE-8) |
| A file watcher, MCP server, tree-sitter binary, SQLite | `04-cbm-analysis.md` §8 still stands |
| Signature skeletons of neighbouring files in a slice | measured useless (arXiv 2607.09691, R §5) |
| Reading a Vue/Svelte `<template>` for `@click="submit"` and `:value="total"` edges | a second parser (HTML attributes → member refs); E1 first, then measure how many members still show fan-in 0 on the company project |
| Options API members in Python/Ruby/… object literals | the shape is JavaScript's; the other languages define members in classes the extractor already reads |
