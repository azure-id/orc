# Research — the evidence behind `02-PLAN.md`

Measured 22-09-2026 on `C:\dev\orc` at `main` (v1.9.0, commit `c000342`), after
one `orc graph update` (engine graph@4 → graph@5). Tokens are `chars / 4`, the
same rule `bin/graph-gain.js` uses. Every number here was produced by a command
on this tree or read from a file on disk; none is estimated unless the row says
so.

## 1. Measured on this tree

### 1.1 The store

`orc graph update --json`: `updated`, 159 files, 1,482 symbols, generation 6,
158 parsed, 1,249 ms, `engine_upgrade: true`, `route: full`.

| File | Bytes | Note |
|---|---|---|
| `index.json` | 1,447,120 | the source; 7,919 bytes per file record on average |
| `resolved.json` | 707,014 | derived, generation-pinned |
| `resolved/<ab>.json` | 1,042,934 in 102 shards | derived |
| `blobs/` | 1,874,404 in 207 files | content-addressed records (old + new generation) |
| `cochange.json` | 239,048 | cached per HEAD |
| `names.json` | 99,075 | the hook's only read |
| `map.json` | 10,963 | derived |
| `wide.json` | 8,765 | 59 files with ≥ 8 symbols |
| `files.json` · `meta.json` | 24,767 · 240 | |

Total ≈ 5.45 MB for 159 files. Nothing in this plan changes any of these shapes.

### 1.2 What a `--json` answer costs against its card

`node bin/cli.js graph <cmd> --if-enabled --json`, size of the whole stdout
against the size of the `card` string inside it.

| Command | JSON tokens | `card` | `line` | `trace` | JSON ÷ card |
|---|---|---|---|---|---|
| `status --heal` | 142 | — | 20 | 13 | — |
| `ctx graphUpdate` (depth 2) | **4,434** | 983 | — | 11 | **4.5×** |
| `ctx graphUpdate --depth 1` | 2,928 | 596 | — | 11 | 4.9× |
| `ctx graphUpdate --source` | 4,642 | 1,084 | — | 11 | 4.3× |
| `ctx bin/graph.js` (file card) | 1,945 | 389 | — | 11 | 5.0× |
| `ctx bin/graph.js --format tree` | 1,841 | 285 | — | 11 | 6.5× |
| `ctx --for-slice bin/graph.js` | 1,139 | 206 | — | 11 | 5.5× |
| `ctx --for-slice` 3 files | **2,526** | 430 | — | 21 | **5.9×** |
| `impact bin/graph.js` | 4,904 | 900 | — | — | 5.4× |
| `impact` 3 files | **4,481** | 839 | — | — | **5.3×** |
| `map` | **8,991** | 1,111 | — | 9 | **8.1×** |
| `map --budget 800` | 6,006 | 749 | — | 9 | 8.0× |
| `map --focus bin/graph.js graphUpdate` | 9,053 | 1,120 | — | 15 | 8.1× |
| `changes` | 587 | — | 103 | 15 | — |
| `coverage` 3 paths | 189 | — | 53 | 11 | — |
| `cochange bin/graph.js` (exit 4) | 89 | — | 26 | 10 | — |
| `notes pending` (exit 3, notes off) | 44 | — | 4 | 4 | — |
| `gain` | 439 | — | 189 | 14 | — |

Where the bytes are (top-level keys, tokens of `JSON.stringify(value)`):

| Answer | Biggest keys |
|---|---|
| `ctx <symbol>` | `calls` **1,537** · `card` 1,001 · `callers` 223 · `effects` 194 · `note` 56 · `tests` 33 · `target` 29 — everything else ≤ 6 |
| `impact` 3 files | `callers` **2,185** · `card` 851 · `tests` 61 · `files` 15 |
| `map` | `files` **3,592** · `card` 1,127 · `hidden` 4 |

The rows the lane is told to print (`card`, `line`, `trace`) are 12–22 % of the
answer. The rest is the same facts as structured data, plus 2-space
indentation (`emitJson` prints `JSON.stringify(obj, null, 2)`).

### 1.3 The shape a brief answer would have

Same four answers, four renderings. "Brief" drops the row arrays (`callers`,
`calls`, `effects`, `files`, `symbols`, `blocks`, `names`, `imports`,
`importers`, `cards`, `source`) and keeps every scalar, `card`, `line`, `trace`,
`budget`, `generation`, `gen_id`, `read`, `healed`.

| Answer | pretty (today) | compact | brief, pretty | **brief, compact** | card |
|---|---|---|---|---|---|
| `ctx <symbol>` | 4,434 | 3,157 | 1,243 | **1,194** | 983 |
| `map` | 8,991 | 4,785 | 1,212 | **1,191** | 1,111 |
| `impact` 3 files | 4,481 | 3,177 | 999 | **969** | 839 |
| `ctx --for-slice` 3 files | 2,526 | 1,632 | 518 | **503** | 430 |

Brief-compact is **−73 % (ctx) to −87 % (map)** against today, and within 7–21 %
of the bare card. Indentation alone is 29–47 % of today's answer; on the brief
shape it is 3–4 %, because the card string dominates.

### 1.4 What the graph's JSON cost recorded sessions

`scratchpad/graph-json-cost.js` pairs every `Bash` tool_use whose command names
`orc graph` with its tool_result and sums the result text.

| Transcript set | Sessions with graph results | Results | Tokens (first entry) | By command |
|---|---|---|---|---|
| eval sandbox (`C--dev-orc-eval`, 40 transcripts, 1.8.0–1.8.2 runs on a 6–14-file fixture) | 9 | 24, all main-session | 13,645 | `status` 9 × avg 1,246 (max 2,706) · `update` 11 × 128 · `ctx` 3 × 174 · `impact` 1 × 506 |
| this repo (`C--dev-orc`, 80 transcripts) | 13 | 109 | 14,682 | development of the feature itself — `ctx` 26 × 45, `impact` 15 × 49; not lane runs |

Two readings. (1) On the fixture the answers are small because the repository
is small: a `ctx` card on 6 files is 174 tokens. The 1.2 table is the honest
size on a 159-file repository; the user's 808-file project is larger still.
(2) Every graph result landed in the MAIN session — the surface EW8 measured at
74–80 % of a run — and is re-sent on every later turn (the carry multiplier
`eval/graph-replay.js` describes).

Per lane run on this tree, at today's shapes, one `/orc-mini` run pays roughly:
`status` 142 + `map` 8,991 + `impact` 4,481 + `cochange` × 3 ≈ 300 +
`for-slice` 1,139 + `changes` 587 + `update --notes-pending` ≈ 150 + `gain` 439
≈ **16.2K first-entry tokens of graph JSON**. With brief answers the same run is
≈ 142 + 1,191 + 969 + 300 + 503 + 587 + 150 + 439 ≈ **4.3K**. This is
arithmetic over the measured rows above, not a measured run; W0 measures a run.

### 1.5 Replay of this repo's own sessions

`node eval/graph-replay.js ~/.claude/projects/C--dev-orc .` (74 windows,
88.1 M tokens added to context, 5.65 G re-read from cache):

| Mode | Result |
|---|---|
| tokens | 130 searches · 400 whole-file reads · the graph could answer 44 · saved 17,223 first-entry (4.2 % of retrieval, **0 % of tokens added**) · 7.08 M carried (0.1 %) |
| `--ceiling` | 82,192 first-entry (19.9 % of retrieval, **0.1 % of tokens added**) · 22.8 M carried (0.4 %) |
| `--calls` | 1,820 searches · URL-shaped 37 · member-shaped 68 · planning sweeps **0** · answerable round trips **106 (1.43 per window)** |

EW8's verdict holds on new data: the graph is not a session-level token saving.
What it CAN cut is its own cost (§1.2–1.4) and round trips (1.43 answerable
per window here, against 0.39 planning sweeps on the fixture).

### 1.6 Symbol density and what the parser did not read

| Measure | This repo |
|---|---|
| files · symbols · per file | 159 · 1,482 · **9.3** |
| kinds | function 1,480 · class 1 · route 1 · (module 134, not counted) |
| files with zero symbols | **25 (16 %)** — `bin/webui/fixtures/*.js` (2,037 · 1,003 · 585 … lines), `bin/onboarding-content.js`, `test/webui/api.test.js`: every one a `module.exports = {…}` data object or a test file of anonymous callbacks |
| files `partial` | 40 |
| files skipped | `bin/cli.js` — `too-large` (`MAX_BYTES` 512 KB); the repo's largest file has no record, and `ctx bin/cli.js` answers a 20-token card that says so |
| `bin/graph-extract.js` (3,217 lines) | 49 of 49 `function` declarations and 6 of 6 `const x = (…) =>` declarations indexed; 94 symbols |

The extractor reads named functions and arrow constants correctly here. A
zero-symbol file on this tree is data, not a parser miss. On a project with
**1.9 symbols per file** (§2) the same probe would say which it is — and today
no command runs it.

Reference densities: django/django 44,572 symbols over 2,977 files = 15.0
(CHECKPOINT-1.8.2); this repo 9.3; the Express eval fixture 8 symbols over 6
files = 1.3 (six files, so the ratio means little).

### 1.7 The contract's own cost, and who pays it

| File | Bytes | ≈ tokens |
|---|---|---|
| `templates/skills/_shared/code-graph.md` | 22,723 | 5.7K |
| `templates/skills/_shared/read-ladder.md` | 7,391 | 1.8K |
| `agents-src/executor.template.md` | 9,911 | 2.5K (in every executor's definition, 8 graph lines) |

Reads of `code-graph.md` recorded as `Read` tool calls: **0 in the 40 eval
transcripts** (lane runs); 36 in this repo's own 80 transcripts (this repo's
development). `read-ladder.md`: 0 and 10. Lanes act from the spines and the
`announce[]` line; they do not open the contract at run time. **A trim of the
contract therefore saves nothing at run time**, and this plan does not do one
(it is listed under "not in this release" with this number).

### 1.8 What the lanes call today

`orc graph <sub>` mentions in the 40 eval transcripts (all pre-1.9.0):
`notes` 94 · `ctx` 93 · `update` 89 · `status` 83 · `impact` 17 · `map`, `changes`,
`cochange`, `coverage` **0**. The 1.9.0 wiring for quick and mini has no recorded
run yet. Call sites in the payload that carry `--json` (candidates for
`--brief`): 46 lines across `_shared/phases/*`, `read-ladder.md`, `orc-quick`,
`orc-mini`, the two recon agents, and the executor template
(`03-brief-json-spec.md` §4 lists each).

### 1.9 What is pinned

`bin/verify-contracts.js` holds **16 rows** whose file set names
`skills/_shared/code-graph.md`:

`code-graph.md` (20 files) · `code > graph structure` (7) · `graph_used` (19) ·
`--for-slice` (7) · `--source [N]` (5) · `--notes-pending` (4) · `on,read` (3) ·
`--with-source` (2) · `graph notes and doc notes` (4) · `Ruby, Rust, Kotlin` (1) ·
`ORC_GRAPH_NO_BORROW` (1) · `resolved/<ab>.json` (1) · `orc graph map` (8) ·
`a HINT about where to look first` (2) · `AN ESTIMATE` (1) ·
`orc-graph-noter-sonnet-4-6-med` (7).

`npm run verify`: 40 skills · 51 agent files · **208 contracts**. Every new
token this plan adds (`--brief`, `blast_line`, `--complexity`, `THIN`,
`--callers-source`, `hook-update`) is a new row, and its file set is the list in
the spec that introduces it.

## 2. The user's company project (screenshot of `orc ui`, 22-09-2026)

| Field | Value | Reading |
|---|---|---|
| state | FRESH · 808 files · **1,547 symbols** · generation **93** · updated 22-09-2026 19:59:46 | the update path works — 93 index-changing writes |
| density | **1.9 symbols per file** | against 9.3 here and 15.0 on django. Either most files hold no named function (component objects, config, data) or the parser is not reading the shapes this codebase uses. Nothing in ORC today says which |
| notes | off | the default; doc notes still come free |
| ledger | paid **2K** (cards 1K · source 0 · hints 978) · avoided ~11K–23K (estimate) · **19 calls** | 19 reads for 93 generations |
| by command | `read-note` 4 · `hint` 9 · `for-slice` 4 · `ctx` 2 | 13 of 19 came from the HOOK; the orchestrator-side reads (`map`, `impact`, `changes`, `cochange`, `coverage`) are **absent** — either the project ran 1.8.2-era lanes or quick/mini before their 1.9.0 wiring, or the lanes skipped them. The gain ledger cannot tell these apart |
| hints | 9 injected · 4 read notes · **0 updates** | the `0` is a defect (§4.1): the hook never writes the row the meter counts |
| `--measured` | too few runs | needs 3 ON and 3 OFF |

The `paid` figure is the card only (§4.2). What the orchestrator actually paid
for those 6 lane reads is unknown, and by §1.2 it is 4–8× the recorded 1K.

### 2.1 Pasted from the company project (macOS, 22-09-2026 ~20:40)

The user ran the README's read-only commands in the project (`dashboard`, a
Vue + JavaScript client under `client/src/`). The density one-liner failed on
zsh (history expansion on `!`); the single-quoted form in the README replaces
it and is still owed.

| Command | What it showed |
|---|---|
| `orc --version` | **1.9.0**, up to date |
| `orc graph status --json` | FRESH · 808 files · 1,547 symbols · engine **graph@5** · gen 93 · gen_id `cab54d56` · notes off · `auto_update: true` |
| `orc graph gain --history` | **20 rows**: `map` 1 (paid 570, avoided ~2k–13k) · `for-slice` 4 (paid 126–264; avoided ~0 / ~150 / ~11k) · `ctx` 2 (paid 242–378) · `hint` 9 (paid 61–106, avoided ~0–800 each) · `read-note` 4 (paid 72–79). Every `for-slice`/`ctx` target is under `client/src/views/remittance/…` |
| hook counters, 5 runs (`*.graph-hook.json`) | `injected` **0 · 0 · 0 · 0 · 0** · `subagent_start` 6 · 13 · 2 · 3 · 13 · `read_notes` 0 · 1 · 1 · 0 · 1 · **`updates` 6 · 12 · 2 · 3 · 12 = 35** |
| `orc stats` | **94 runs** (15-07 → 22-09): `/quick` **38 (40 %)** · no lane 25 · `/doc` 10 · `/orc` 5 · `/fast` 1 · **`/mini` 0** · 140 subagents (43 executors) · code graph: 21 reads across 3 runs, 3K put in, ~15K–49K kept out (estimate) · 77 runs never finished |
| `orc graph map --budget 600` | 26 of 808 rows shown (583/600 tokens). **16 of the 26 rows have no symbol** (`store/mutation-types.js`, `store/index.js`, `constants/events.js`, `transferFundKeys.js`, `config.js`, `getter-types.js`, `routeName.js`, `SocialMediaIcon.vue`, `SkeletonLoader.vue`, …). `utils/DigitalAssets.js` shows `+55` (a 59-symbol file — wide). A 1,059-line spec file ranks 13th with two symbols |
| `ls -la .claude/orc/graph` | `index.json` 2.77 MB · `resolved.json` 732 KB · 245 shards · `names.json` 150 KB · `map.json` 68 KB · `files.json` 142 KB · `wide.json` 9.8 KB · 255 blob shard dirs |

What it proves, beyond the screenshot:

1. **§4.1 is confirmed on real data.** The counters files record **35 hook
   updates in five runs**; the ledger and the UI show 0. Generation 93 is the
   hook's work: the executor-stop update runs after every dispatch. The
   mechanism works; the meter cannot see it.
2. **The Grep hint never fired in those five runs** (`injected 0`, 9 hints in
   the whole ledger). In a Vue codebase the names an executor searches for are
   component names, store mutation types, constants and i18n keys. **None of
   those is a symbol** — the extractor names functions, methods, classes and
   routes (this repo: 1,480 functions, 1 class, 1 route, no `const`). So
   `names.json` cannot answer the searches this project actually makes, and 1.9
   symbols per file is the parser being RIGHT about what it was asked to index,
   on a codebase where most named things are not functions.
3. **The map ranks constants files it cannot describe.** `multiplier()` halves a
   file whose every symbol is private and knocks a test file down by ten — but a
   file with **zero** symbols keeps its full rank (`syms.length && …` is false).
   Import edges then lift every constants module and every component with no
   named function to the top: 16 of 26 shown rows point at nothing. For a
   planner that is a list of "imported everywhere", not "where to look". Two
   fixes are possible, and they are the same decision as point 2 (DE-15):
   name those things, or knock the row down.
4. **This user's ORC is `/orc-quick`.** 40 % of runs, 0 `/orc-mini`. Items that
   pay here: B (brief) on quick's calls, V1 (`blast_line`), the hook's hints
   (which need point 2), R1 for the recon pair. V2/V3 (mini's complexity line)
   pay nothing for this project until mini is used (DE-16).
5. **The `for-slice` avoided estimates swing from ~0 to ~11k** for the same file.
   `sliceBlock` prices what the outside view replaced; a file with no outside
   callers avoids nothing. That is the meter being honest, and it is also a sign
   the four slices were about files nothing else reaches — leaf views.

### 2.2 The density table (pasted 22-09-2026, the corrected command)

| Language | Files | Symbols | Per file | Zero-symbol files | Partial | Skipped |
|---|---|---|---|---|---|---|
| `vue` | **429** | **17** | **0.04** | **416 (97 %)** | 4 | 0 |
| `js` | 378 | 1,528 | 4.0 | 131 (35 %) | **74 (20 %)** | 0 |
| `py` | 1 | 2 | 2.0 | 0 | 0 | 0 |
| total | 808 | 1,547 | 1.9 | 547 (68 %) | 78 | 0 |

The twenty longest zero-symbol files are ALL `.vue` components between 930 and
**2,047** lines (`CreateFundTransferModal.vue` 2,047 · `CreateInvoice.vue` 1,723
· `WithdrawSelectionModal.vue` 1,670 · `SwapSelectionsModal.vue` 1,478 · …) plus
one 1,451-line `methods/vueMixins.js`. A component that long holds dozens of
methods, computed properties and watchers. **This is a parser gap, not a
codebase with nothing to name:** the js/ts rungs read `function`, `const x =
() =>`, `class` members and routes; they do not read the members of an
object literal — `export default { data() {…}, computed: { total() {…} },
methods: { submit() {…} }, mounted() {…} }` — which is how a Vue 2 / Options
API component, a mixin and a Vuex module (`mutations: { SET_X(state) {…} }`)
define every function they have. 53 % of this project's files are `.vue`; the
graph sees 17 symbols in them.

Consequences on this project, each measurable in the pasted data:

- `names.json` has no row for `submit`, `total`, `SET_USER` or
  `CreateFundTransferModal` → the Grep hint fired 9 times against 35 hook
  updates (§2.1 point 2).
- `wide.json` is 9.8 KB (about 60 files): the 2,047-line component is not
  "wide" because it has no symbols, so even `code_graph_hooks: on,read` could
  never hint a range for the reads that cost the most here.
- `map` ranks by import edges only for those files (§2.1 point 3).
- `impact <component>.vue` answers importers only; `changes` reports "no indexed
  symbol was touched" for an edit inside a component's method; the executor's
  `--for-slice` outside view has nothing to show for a method nothing names.
- The 74 partial `.js` files (20 %) are the second gap: `lang-coverage.js`
  measured 0.5 % on primevue and 0 % on sveltejs/svelte in W5, so 20 % here is
  a shape the heuristic trips on (the audit's partial list, A2, names the
  ranges).

**What this decides.** DE-15 (b) is no longer optional for this project to make
use of the graph: without Options API members as symbols the graph cannot
locate, hint, rank or measure half of the code. The scope of (b) therefore
LEADS with object-literal members (E1 in `02-PLAN.md` §4b), and constants and
the `<script setup>` component symbol follow. Arithmetic, not a measurement: if
half of the 416 files are Options API with ~15 members each, the project gains
≈ 3,000 symbols and density goes 1.9 → ≈ 5.6 per file. W5b's gate measures it.

## 3. Prior findings that bind this plan

| Finding | Where | What it forbids or requires here |
|---|---|---|
| **The graph is not a token saving** — retrieval is ≤ 4 % of a session, searches 0.06 %; ceiling 0.1 % | `code-graph-notes/findings/EW8-TOKEN-VERDICT.md`; re-confirmed §1.5 | no session-percent claim anywhere; every token figure in this plan is a cost the graph ITSELF adds (§1.2) and can cut |
| A card's silence is not proof of absence (11 route tests declared absent) | `R3-results.md` | the locator framing stays; `--callers-source` prints source for confident callers only |
| Executors ran `ctx` 0 times in 8 dispatches; hooks deliver `additionalContext` into subagents | `W9-eval.md` R2, `R3-results.md` R3-A | the paid reads are reached through the hook and the slice, not through instructions; R-items act there |
| M2 measured 0.39 planning sweeps per run → `map` planning only, widened in 1.9.0 to quick Q1 and mini intake | `W7-map.md`, `LANE_CALLS["graph-map"]` | this plan does not widen `map` further; §1.5 measured 0 sweeps on dev sessions |
| DE-D not taken — the Haiku noter waits on a paid blind comparison | `CHECKPOINT-1.8.2.md` | untouched |
| "the graph tools in the research froze machines" — no watcher, no daemon, no timer | `graph.js` header, `04-cbm-analysis.md` §8 | CodeGraph's file watcher (§5) is NOT copied |
| A 1.8.1 store re-extracts once on an engine bump; derived caches are refused by generation | `graph.js`, `graph-resolve.js` | the path exists — and this plan does not use it: no engine bump |
| The plan's ">60 % doc share" and "150 ms hook p95" were wrong | `RESUME.md` | every gate below is a number measured on this tree first (W0), never a figure from a paper |
| ~9 % of per-instance outcomes flip between byte-identical temperature-0 runs | arXiv 2607.09691 (§5) | no wave is gated on a small eval delta; gates are sizes, counts and byte-identity |

## 4. Defects found by reading (verified against the source)

### 4.1 `hints.updates` is always 0

`templates/hooks/orc-graph-hook.js` `onExecutorStop()` (lines 306–335) runs the
update, calls `bump(runName, "updates")` (the per-run counters file) and writes a
`GRAPH-UPDATE … by=hook` trace line. It never calls `ledger()`.
`bin/graph-gain.js` `gain()` line 296 counts `r.cmd === "hook-update"` rows.
No writer produces that `cmd`. So `orc graph gain` and the `orc ui` Knowledge
panel (`knowledge.js` line 228, `t("knowledge.gain.hints")`) print `0` for hook
updates whatever the hook did. The user's screenshot shows it. Fix: M1.

### 4.2 `paid` records the card, the context receives the JSON

`bin/cli.js` `gainRowFor()` prices `paid.card = K.tok(card)`. The orchestrator
runs the command in `Bash` and receives the whole `--json` answer — 4.3–8.1×
the card (§1.2). The meter under-reports the graph's own cost by that factor,
and it is the one figure the meter claims is EXACT. Fix: M3 (`paid.envelope`),
which also makes B1's saving visible in the meter itself.

### 4.3 `flag(name)` swallows the next word

```js
function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const val = args[i + 1];
  return val && !val.startsWith("-") ? val : true;
}
```

Any new flag that takes a space-separated value would, on a 1.9.0 CLI that does
not know it, leave that value in the positional list (the `plain` loops skip
only the `--` word). `orc graph impact a.js --fit mini` on 1.9.0 becomes
`impact a.js mini` → `mini` in `missing[]`. Not a bug in 1.9.0; a rule for
1.9.1: **new flags are bare switches or `--name=value`** (a word that starts
with `--` is skipped whole by every subcommand's positional loop).

### 4.4 The largest file is silently outside the map

`MAX_BYTES = 512 * 1024` skips `bin/cli.js` here with `skipped: too-large`.
`coverage` reports it when asked; `status` does not; the map's rank never shows
it. Not a defect — a visibility gap the audit (A2) closes by listing skipped
files with their reason.

### 4.4b A zero-symbol file keeps its full map rank

`bin/graph-map.js` `multiplier()`:

```js
const syms = (model.byFile[rel].symbols || []).filter((s) => s.kind !== "module");
if (syms.length && !syms.some((s) => s.exported)) m *= 0.5;
```

A file with private symbols only is halved; a file with NO symbols is not
touched. On the company project 16 of the 26 rows the map shows are such files
(§2.1 point 3). `map.json` stores the unfocused PageRank only; the multiplier
is applied on read, so changing it changes no stored byte (A4).

### 4.4c Constants, store types and components are not symbols

`bin/graph-extract.js` names functions, methods, classes and routes (`KIND_SHORT`
also knows `const`, `var`, `type`, `interface`, `enum`, `struct`, but the js/ts
rungs emit none of them on this tree: 1,480 functions, 1 class, 1 route). A
top-level `export const TRANSFER_FUND_KEYS = {…}`, a Vuex `mutation-types.js`,
an i18n key table, and a `.vue` component whose `<script setup>` holds no named
function all produce a `module` symbol and nothing else. `names.json` has no
row for them, so the Grep hint cannot fire on the names a front-end codebase
searches for (§2.1 point 2). Naming them is an EXTRACTOR change: the record
shape stays, but records made by graph@5 would lack the new rows, so the engine
tag must move (graph@6) and every file re-extracts once at the next
`status --heal` — the same path 1.8.1 → 1.8.2 took. Cost on this tree: 1,249 ms
for 158 files (7.9 ms/file); on 808 files ≈ 6–7 s, once, automatic. Function
symbol ids (`file#qname`) do not change, so every stored note stays current.
This is DE-15, the one engine change this plan puts in front of the user.

### 4.5 `graph_facts` and the blast-radius line are computed from rows by the orchestrator

`orc-quick/SKILL.md` lines 190–199: "keep the `symbols[]` whose `file` is in the
return's `actual_files` … then print the blast radius from the same answer".
`orc-mini/SKILL.md` lines 135–147 + `references/complexity.md` §2–§3: count
confident callers outside `declared_files`, distinct files, tests, `maybe`,
cochange partners ≥ 3 not in the plan, then print one line. Both need the row
arrays in the orchestrator's context, which is why `--brief` alone cannot be
applied to `changes` and `impact` in those lanes — the CLI must compute the
line first (V1, V2). This is S1 ("a state is computed by the CLI") and DE-14
(b) of `lean-lanes-notes/02-PLAN.md`, which named it "the right next step".

## 5. Outside references (read 22-09-2026)

| Source | What it says (their numbers) | Taken here | Not taken, and why |
|---|---|---|---|
| Aider — *Repository map* and *Building a better repository map with tree-sitter* ([docs](https://aider.chat/docs/repomap.html), [post](https://aider.chat/2023/10/22/repomap.html)) | files as nodes, references as edges, personalised PageRank, binary search to a `--map-tokens` budget (default 1K) | already the model for `orc graph map` (1.8.2) | — |
| LocAgent, ACL 2025 ([paper](https://aclanthology.org/2025.acl-long.426/), [arXiv](https://arxiv.org/abs/2503.09089)) | a heterogeneous code graph + multi-hop search; file-level localisation up to 92.7 %; a fine-tuned 32B reaches SOTA at ~86 % lower cost; +12 % issue resolution at Pass@10 | the locator framing: the graph's value is WHERE, and it lets a cheaper model find it | fine-tuning; a graph database |
| RepoGraph, ICLR 2025 ([arXiv](https://arxiv.org/pdf/2410.14684)) | line-level def/use graph, ego-subgraphs as a plug-in; +32.8 % relative on SWE-bench | `--callers-source`'s window is a one-hop ego view with source | line-level nodes (the record shape is a contract) |
| CodexGraph ([arXiv](https://arxiv.org/html/2408.03910v2)) | LLM writes graph-DB queries over a code graph | — | a graph database and a query language; ORC is zero-dep JSON |
| colbymchenry/codegraph ([GitHub](https://github.com/colbymchenry/codegraph)) | ONE tool `codegraph_explore` returns verbatim source grouped by file + call paths + blast radius; "62 % fewer tokens · 44 % cheaper" over 7 repos (Opus 4.8 headless, median of 4, CLI blocked in both arms); "2 vs 28" tool calls on VS Code, zero file reads; a staleness banner names pending files | **source travels with the answer** (R1); one dense answer beats a menu (V2 folds impact + cochange into one call) | the file watcher with a 2 s debounce — the no-daemon rule; the "80 % more resident context" caveat their own benchmark recorded is why every R-item is budget-charged |
| Codebase-Memory, arXiv 2603.27277 ([abs](https://arxiv.org/abs/2603.27277)) | Tree-sitter graph via MCP, 66 languages; over 31 repos: 83 % answer quality vs 92 % for a file-exploring agent, **10× fewer tokens, 2.1× fewer tool calls**; graph-native questions (hubs, caller ranking) match or beat the explorer on 19 of 31 | hub detection IS `map`; caller ranking IS `importance` | the 9-point quality gap is the reason a card stays a LOCATOR and the agent reads the range |
| FastContext, arXiv 2606.14066 ([abs](https://arxiv.org/abs/2606.14066); v4 withdrawn 30-06-2026 for IP reasons) | a dedicated exploration subagent (4–30B) returns **file paths and line ranges**, not files; up to **−60 % coding-agent tokens**, +5.5 % resolution on SWE-bench Multilingual / Pro / SWE-QA | the recon pair is this agent; give it range answers with source so it returns anchors, not files (R1) | training a model |
| SWE-Pruner, arXiv 2601.16746 ([abs](https://arxiv.org/abs/2601.16746)) | a 0.6B skimmer prunes lines against a stated goal; −23–54 % tokens on multi-turn SWE-bench Verified, success rate kept or up | the budgeted card + range read is ORC's pruning already | a model in the loop |
| *What Context Does a Coding Agent Actually Need to Act?*, arXiv 2607.09691 ([abs](https://arxiv.org/abs/2607.09691)) | with the location fixed: the edited code itself is the signal (source 27/45 vs NL summaries 4/45); **compressed context matches full files at ~⅓ the tokens (19K vs 94K per resolved issue)**; UML skeletons and signatures of the surroundings add nothing (N=70, p=0.75); **~9 % of outcomes flip between byte-identical temperature-0 runs** | `--for-slice` (outside view, no symbol table) is the right shape; the noise floor rules out small-delta gates | a "signatures of neighbours" block — measured useless |
| Repository Intelligence Graph, arXiv 2601.10112 ([abs](https://arxiv.org/abs/2601.10112)) | a deterministic build/test-metadata graph as JSON; 3 assistants × 8 repos: +12.2 % accuracy, −53.9 % time; multilingual repos gain most | deterministic, evidence-backed maps help ACCURACY; `tests` and `cochange` are the small cousins | build-system extraction |
| CODESTRUCT / trajectory studies ([arXiv 2604.05407](https://arxiv.org/pdf/2604.05407), [DEV](https://dev.to/kyoma_1234/why-ai-coding-agents-waste-30-of-their-tokens-and-how-to-fix-it-42c1)) | read-type operations are **76.1 %** of agent tokens on SWE-bench Verified; removing structure-aware RANGE reads costs +41 % input tokens (Qwen3-32B) / +7.6 % (GPT-5-mini) | the wide-read hint aims at the right lever; R2 measures how often it would fire before anyone flips its default | — |
| Serena ([GitHub](https://github.com/oraios/serena)) | LSP-backed `find_symbol` / `find_referencing_symbols`, 30+ languages, symbol-level edits | Claude Code ships an `LSP` tool now (schema read this session: `goToDefinition`, `findReferences`, `incomingCalls`, `outgoingCalls`, `workspaceSymbol`, …; it needs a file, a 1-based line and character) — the ladder gains one sentence (R4) | an MCP server |
| Repomix `--compress` ([docs](https://repomix.com/guide/code-compress)) | Tree-sitter keeps signatures, drops bodies, ~−70 % tokens | — | arXiv 2607.09691 measured signature skeletons of surroundings as no help |
| token-optimizer-mcp, tokensave, codebase-memory-mcp ([1](https://github.com/ooples/token-optimizer-mcp), [2](https://github.com/aovestdipaperino/tokensave), [3](https://github.com/DeusData/codebase-memory-mcp)) | "99 % fewer tokens" class claims from pre-indexed graphs served over MCP | the SHAPE of the win they all share: the answer is small and has the source in it | the claims (they compare against reading whole files, which the read ladder already forbids) |

### 5.1 The Claude Code hooks reference — not re-read

The fetch of `https://code.claude.com/docs/en/hooks` was declined in this
session. This plan therefore uses only the events ORC already wires
(`SubagentStart`, `SubagentStop`, `PreToolUse` on Grep/Glob/Bash/Read,
`PostToolUse` on Read) and adds no new event. A `SessionStart`-after-compaction
re-orientation is listed under "not in this release" for that reason.

## 6. What the evidence says, item by item

| Item | Evidence | Conclusion |
|---|---|---|
| B `--brief` | §1.2, §1.3, §1.4, §4.2 | the largest token lever INSIDE the graph's own cost, on the surface that matters most, at zero engine change; −73 % to −87 % per answer, measured |
| V the CLI computes the line | §4.5, `lean-lanes` DE-14 | without it `changes` and `impact` cannot be brief in quick and mini; with it the two spines lose their counting prose |
| A density + audit | §2 (1.9/file), §1.6 (a probe that answers), §4.4 | a THIN map answers exit 4 everywhere and nobody knows why; the audit is a 0-token read of files already on disk |
| M the honest meter | §4.1, §4.2, §2 | the two numbers the UI shows for cost and hook use are wrong today |
| R1 `--callers-source` | codegraph (zero file reads), FastContext (range answers), RepoGraph (ego view), §1.5 (1.43 answerable round trips per window) | one call replaces "card, then open the caller"; budget-charged, confident callers only |
| R2 count unhinted wide reads | CODESTRUCT (+41 % without range reads), DE-J (`on,read` off pending a measurement that was never run) | measure the miss for free before flipping a default |
| R4 the LSP sentence | Serena, the `LSP` tool in this session | an `AMBIGUOUS` card with an LSP server is a `findReferences`, not a Grep |
| A4 zero-symbol knock-down in `map` | §2.1 point 3, §4.4b | read-time only; 16 of 26 rows on the company map point at nothing |
| DE-15 name constants and components | §2.1 point 2, §4.4c, the 35 : 9 ratio of hook updates to hook hints | the one change that makes `names.json` answer a Vue codebase; costs one automatic re-extract |
| DE-16 defer mini's V2/V3 | §2.1 point 4 (0 mini runs of 94) | build quick's V1 first; mini's line can wait for a release that has mini runs to measure |
| a contract trim | §1.7 | saves nothing at run time — not done |
| widening `map` again | §1.5 (0 planning sweeps), M2 | not done |
