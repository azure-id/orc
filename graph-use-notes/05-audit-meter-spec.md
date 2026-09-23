# Spec — the thin map and the honest meter (items A1 · A2 · A3 · M1 · M2 · M3)

## 1. `meta.density` and the THIN status line (A1)

### 1.1 The field (additive, `meta.json`)

Written by `graphUpdate()` in the same `meta` object it already writes, so it
appears at the next update that rewrites meta:

```json
"density": {
  "symbols_per_file": 1.9,
  "zero_files": 493,
  "zero_share": 0.61,
  "skipped": 2,
  "partial": 14,
  "by_lang": {
    "vue": { "files": 412, "symbols": 380, "zero": 301, "partial": 3, "skipped": 0 },
    "ts":  { "files": 396, "symbols": 1167, "zero": 192, "partial": 11, "skipped": 2 }
  }
}
```

Counted over `index.by_file` at the end of the update, excluding `module`
symbols (the same count `meta.symbols` uses). `symbols_per_file` is rounded to
one decimal; `zero_share` to two.

### 1.2 Backfill (DE-5)

`status --heal` only: when `meta` exists and has no `density`, and
`code_graph_auto_update` is not `false`, parse `index.json` once, compute the
field, and rewrite `meta.json` with it (the same `atomicWrite`, under the lock;
`generation` and `gen_id` unchanged — the index did not change). Bounded like a
heal: skipped when `meta.update_ms > code_graph_heal_ms`, and then the line
says nothing about density until the next real update. The answer carries
`density_backfilled: true` once.

### 1.3 The line

Appended to the FRESH / updated / built lines of `status` (never to `off`,
`none`, `unavailable`):

```
graph: FRESH — 808 files · 1,547 symbols · gen 93 (updated 22-09-2026 19:59:46) · 1.9 symbols/file
graph: FRESH — 808 files · 1,547 symbols · gen 93 (updated …) · 1.9 symbols/file · THIN (61 % of files have no symbol) — run: orc graph audit
```

THIN when ALL of: `files ≥ THIN_MIN_FILES (30)`, `symbols_per_file <
THIN_PER_FILE (3)`, `zero_share ≥ THIN_ZERO_SHARE (0.40)` (DE-4; constants in
`bin/graph-signals.js` beside the complexity constants, with their reasons).
The trace gains ` density=1.9[ thin=1]` at the end of `GRAPH-CONSULT` —
additive tokens, the verb unchanged. JSON: `thin: true|false` beside `density`.

### 1.4 The map's zero-symbol knock-down (A4)

`bin/graph-map.js`:

```js
function multiplier(model, rel) {
  const Q = require("./graph-query.js");
  let m = 1;
  if (Q.TEST_FILE.test(rel)) m *= 0.1;
  const syms = (model.byFile[rel].symbols || []).filter((s) => s.kind !== "module");
  // A4 (v1.9.1): a file with NO symbol is as far from "a place behaviour lives"
  // as one whose symbols are all private. Before this, a constants module
  // imported everywhere kept its full rank and 16 of 26 rows on a real
  // front-end map pointed at nothing.
  if (!syms.length || !syms.some((s) => s.exported)) m *= 0.5;
  return m;
}
```

Read-time only. `map.json` (`files`, `edges`, `base`) is unchanged and stays
generation-pinned; the W0 `map --json` golden is re-frozen ONLY if the fixture
has a zero-symbol file (it does: `config.js`-style modules), and the test then
asserts the order among files WITH symbols is the 1.9.0 order.

## 2. `orc graph audit [--json] [--top=N] [--if-enabled]` (A2)

A read. Exit 0 always when a graph exists · 1 no index · 3 off (with
`--if-enabled`). Reads `index.json`, `files.json`, `meta.json`, and the first
40 lines of each zero-symbol js/ts/vue/svelte file it lists. Never writes,
never parses a file with the extractor, 0 model tokens. New file
`bin/graph-audit.js`, registered in `bin/verify-package.js`, routed by
`graphCmd()`. `LANE_CALLS` gains a `graph-audit` row with `lanes: []` (a user
command; the lint asserts no lane names it).

### 2.1 Output (human path)

```
graph audit (gen 93) — 808 files · 1,547 symbols · 1.9 symbols/file · THIN
  lang   files  symbols  per-file  zero   partial  skipped  extractor
  vue      412      380       0.9   301         3        0  heuristic@5
  ts       396    1,167       2.9   192        11        2  typescript@5.9.3 (388) · heuristic@5 (8)
  zero-symbol files, longest first (20 of 493 · --top=N for more)
   1,204  src/views/orders/OrderTable.vue        <script setup>
     988  src/store/modules/cart.ts              export default {
     …
  what the first declaration in a zero-symbol file looks like (js/ts/vue/svelte, 493 files)
    <script setup>                      301   a component with no named function — the parser is right, there is nothing to name
    export default {                     97   an object literal (a store module, a config) — data, not code
    export const X = () =>               41   an arrow constant the parser SHOULD index — a parser gap; report it with one file path
    module.exports = {                   30   data
    other                                24
  skipped (2)
    too-large   src/generated/api-client.ts   (1,102 KB)
    unreadable  src/legacy/old.ts
  partial (14)   src/utils/date.ts 120-188 · src/api/index.ts 40-77 · … (--json lists all)
  a zero-symbol file is not a defect by itself — the graph names functions, methods, classes and routes;
  a shape marked "parser gap" is worth one issue with the file path
```

Rules:
- `extractor` per language = the distinct `files.json` `extractor` values with
  their counts.
- The shape sampler: the first non-blank, non-comment, non-import line of the
  file (imports skipped by the same `import`/`require` regexes the extractor's
  heuristic uses), matched against, in order: `<script setup`, `<script>`,
  `export default {`, `export default defineComponent(`, `export default
  class`, `export const \w+ = (\(|async)`, `export function`, `module.exports = {`,
  `class \w+`, `function \w+`, otherwise `other`. Each shape carries a fixed
  one-clause reading (the third column) from a table in `graph-audit.js`; the
  reading is a HINT and the last line says so. A shape whose reading is "parser
  gap" is printed in the same colour the CLI uses for a warning.
- `--top=N` (default 20, cap 200) bounds the zero-symbol list; the counts are
  always over all files.

### 2.2 JSON

```json
{ "ok": true, "state": "found", "generation": 93, "gen_id": "cab54d56",
  "density": { …the meta field… }, "thin": true,
  "by_lang": { "vue": { "files": 412, "symbols": 380, "per_file": 0.9, "zero": 301, "partial": 3, "skipped": 0, "extractor": { "heuristic@5": 412 } } },
  "zero_files": [ { "path": "src/views/orders/OrderTable.vue", "lines": 1204, "lang": "vue", "shape": "script-setup" } ],
  "shapes": [ { "shape": "script-setup", "count": 301, "reading": "component with no named function", "gap": false } ],
  "skipped": [ { "path": "src/generated/api-client.ts", "reason": "too-large", "bytes": 1128448 } ],
  "partial": [ { "path": "src/utils/date.ts", "ranges": [[120, 188]] } ],
  "line": "<the human text>", "trace": "GRAPH-AUDIT thin :: files=808 symbols=1547 per_file=1.9 zero=493 skipped=2 gen=93" }
```

`--brief` drops `zero_files[]`, `skipped[]`, `partial[]`, `shapes[]` and adds
`counts`.

### 2.3 Where it is named

`_shared/code-graph.md` §4 gains one line after the five preflight lines:
*A `THIN` line means most files have no named symbol; `orc graph audit` says
which files and what their first declaration looks like. It is a user command
— no lane runs it.* `guides/configuration.md` gains one line. README's graph
section gains `orc graph audit  # why the map is thin: the files it read as empty, by language`.

## 3. The `hook-update` ledger row (M1)

In `templates/hooks/orc-graph-hook.js` `onExecutorStop()`, after
`bump(runName, "updates")` and the `traceLine(...)`, inside the same
fail-quiet path:

```js
ledger(runName, "hook-update", "", { low: 0, high: 0, calls_low: 0, calls_high: 0 });
```

`ledger()` already writes `paid.hints` from the body length; with an empty body
that is `Math.ceil((PREFIX.length + 1) / 4)` ≈ 12 — wrong for an update. So
`ledger()` gains a fifth parameter `paidOverride`; the update row passes
`{ card: 0, source: 0, hints: 0, envelope: 0 }`. `targets: [agent]` (the
sanitised agent type) so `--history` shows who triggered it. A skipped update
(lock held, `off`, deadline) writes no row — the counters file's `updates`
already counts only successes, and the two must agree.

`gain()`: unchanged — it already counts `r.cmd === "hook-update"`. The UI row
`Hints (injected · read notes · updates)` becomes a real number with no UI
change. `templates/hooks/README.md`: one sentence.

## 4. `paid.envelope` in the meter (M3)

Defined in `03-brief-json-spec.md` §3. Here: the `orc graph gain` line, the
`--history` rows, the JSON (`paid.envelope`, `paid.total` includes it), `orc
stats`'s graph row (reads `paid.total` — unchanged), the UI (§5).

## 5. `never_called` (M2)

`gain()` adds:

```json
"read_set": ["ctx", "for-slice", "impact", "map", "changes", "cochange", "coverage"],
"never_called": ["map", "impact", "changes", "cochange", "coverage"]
```

`never_called` = `read_set` − keys of `by_command`, for the scope (`--run`,
`--since`, or the project). The `line` gains, when non-empty, after the `hints`
line:

```
  never called  map · impact · changes · cochange · coverage
```

No advice follows it. `--run` scope prints it too (a run that made no `map`
call is a fact about that run).

## 6. The Knowledge panel (A3 · M2 · M3) — `bin/webui/js/panels/knowledge.js`

Rows added to the Code Graph card, each rendered only when its field exists:

| Row label (en) | Value | Source | i18n key |
|---|---|---|---|
| `Density` | `1.9 symbols/file · 61 % files empty · THIN` (or without ` · THIN`) | `/api/graph` → `density`, `thin` | `knowledge.graph.density` |
| (line, when THIN) | `Most files hold no named symbol. \`orc graph audit\` lists them by language.` | `thin` | `knowledge.graph.thin` |
| `Tokens put in (cards · source · hints · envelope)` | `2k (1k · 0 · 978 · 0)` | `/api/graph/gain` → `paid` | `knowledge.gain.paid` (text changes) |
| `Never called` | `map · impact · changes` | `never_called` | `knowledge.gain.never` |

Indonesian (`i18n/id/knowledge.json`): `Kepadatan` · `Sebagian besar file tidak
punya simbol bernama. \`orc graph audit\` mendaftarkannya per bahasa.` · `Token
yang dimasukkan (kartu · sumber · petunjuk · amplop)` · `Belum pernah dipanggil`.

`fixtures/knowledge.js` gains `density`, `thin: true`, `paid.envelope`,
`never_called` so `orc ui --fixtures` renders every row. `orc-ui-wiki.md`: the
Knowledge → Code Graph card section lists the four rows and the two API fields
(CLAUDE.md P0). No new API route: `/api/graph` is `status --json` and
`/api/graph/gain` is `gain --json`; both carry the new fields.

## 6b. DE-15 (b) — the extractor names constants and components (W5b, only if chosen)

`02-PLAN.md` §4b says what and why. The shapes:

| Source | Symbol | `qname` | `kind` | `lines` | `exported` |
|---|---|---|---|---|---|
| `export default { name: "CreateFundTransferModal", … }` in `CreateFundTransferModal.vue` (E1a) | `CreateFundTransferModal` | same | `class` | the object literal | true |
| `methods: { submit() { this.validate(); … } }` inside it (E1) | `submit` | `CreateFundTransferModal.submit` | `method` | the member | false; `calls: [{name: "validate", self: true, …}]` → `LOCAL` to `CreateFundTransferModal.validate` |
| `computed: { total: () => … }`, `watch: { amount(n) {…} }`, `mounted() {…}`, `data() {…}` (E1) | `total` · `amount` · `mounted` · `data` | `<Owner>.<name>` | `method` | the member | false |
| `export default { mixins: [fundMixin], extends: BaseModal, … }` (E1) | — | — | on the owner: `bases: ["fundMixin", "BaseModal"]` | — | — |
| `export default { methods: { … } }` in `methods/vueMixins.js` (E1, a mixin) | owner `vueMixins` + one `method` per member | `vueMixins.<name>` | `class` + `method` | | owner true |
| `export default { state, mutations: { SET_USER(state, u) {…} }, actions: { fetchUser({commit}) {…} } }` under `store/` (E1, a Vuex module) | owner from the file stem + one `method` per mutation/action/getter | `<Module>.SET_USER` | `class` + `method` | | owner true |
| `export const SET_USER = "SET_USER";` (js/ts, top level) (E2) | `SET_USER` | `SET_USER` | `const` | that statement | true |
| `export const TRANSFER_FUND_KEYS = { … };` | `TRANSFER_FUND_KEYS` | same | `const` | the statement to its closing brace | true |
| `exports.formatX = …` / `module.exports.formatX = …` (not a function) | `formatX` | same | `const` | the statement | true |
| `module.exports = { A, B: 1, C }` when the file has no other symbol | `A`, `B`, `C` | each key | `const` | the object's line range | true |
| `export default { state, mutations, actions }` under a `store/` path | `state`, `mutations`, `actions` | each key | `const` | the object's line range | true |
| `client/src/components/SkeletonLoader.vue` with `<script setup>` or no script (E3) | `SkeletonLoader` | same | `class` | the `<script>` block, or `[1, EOF]` | true |
| `Foo.svelte` (E3) | `Foo` | same | `class` | same rule | true |

E1 in the extractor: the js/ts heuristic already finds `export default {` /
`defineComponent(` / `Vue.extend(` as the module's tail; the new rung walks
that object's depth-1 members and, for the eight section names, their depth-1
members, with the existing `matchPair` brace walker — no new parser. The
borrowed TypeScript rung emits the same rows from `ObjectLiteralExpression`
members (`MethodDeclaration`, `PropertyAssignment` whose initializer is a
function or arrow). A member's `self` calls are the existing `this.` detection
with `cls` set to the owner. The `component` kind named in an earlier draft of
this table is NOT introduced: the owner is a `class`, so every rule that knows
classes (inheritance, `classOf`, the private-only knock-down, `KIND_SHORT`)
applies unchanged and no state word or format changes.

- `calls: []`, `effects: []`, `urls: []` on a `const`; a `component` keeps the
  calls its `<script>` block already produced under the module symbol today
  (they MOVE from the module symbol to the component symbol, so `ctx
  SkeletonLoader` shows what the component calls).
- `body_hash` is computed as for a function (so a changed constant reads as
  changed) but `NOTE_KINDS` does not include the two kinds: the noter is never
  dispatched for them, `notes pending` never lists them.
- `importance`: `sqrt(fanIn)`, exported → no ×0.1; the `sameName ≥ 5` rule
  applies (a `const index` in forty files is a convention).
- `names.json`: the new symbols enter like any other (`NAMES_PER_KEY` 5), so the
  Grep hint fires on `SET_USER` and `SkeletonLoader`.
- `ctx <const>`: header + note line (a `doc` above the constant, if any) +
  `← used by` rows (the `IMPORT` bindings and the `ref` edges that name it);
  no callee tree; `--source` prints the statement.
- `map` rows: functions first, then constants, within `SYMS_PER_FILE`.
- `changes`: a touched constant is a row with `kind: const`; `risk` follows the
  same rule (exported + fan-in ≥ 3 + no test → high).
- `TEST_FILE`, the state words, `resolveCall`, the URL rules: unchanged. A
  `const` is never a call TARGET (a call named like a constant stays
  UNRESOLVED); it is an import target and a `ref` target.
- `ENGINE = "graph@6"`, `HEURISTIC = "heuristic@6"`; the borrowed TypeScript
  rung emits the same rows (it sees `VariableStatement` with `export`), the Go
  rung is untouched, Python/Ruby/… are untouched in this release.
- Fixtures: `eval/fixture-graph/express/` gains `src/constants.js` and the
  `sfc/` fixture gains a `<script setup>` component with no named function;
  answer-key rows for `ctx SET_USER`, `ctx SkeletonLoader`, `impact
  src/constants.js`.

## 7. Tests (W4)

| Test | Asserts |
|---|---|
| `graph.test.js` | `meta.density` written on update; counts equal a hand count on the fixture; backfill once under `--heal`, never without it, never over the heal cap |
| `graph-audit.test.js` | per-language table; zero-symbol ordering by lines; the sampler on six fixture files (one per shape); `--top=`; skipped reasons; exit 1 / 3; `--brief`; THIN at each threshold edge (29/30 files, 2.9/3.0, 0.39/0.40) |
| `graph-hook.test.js` | a successful hook update appends one `hook-update` row with zero paid; a locked one appends none; the counters `updates` and the ledger count agree |
| `graph-gain.test.js` | `never_called` for project / `--run` scope; `envelope` summed; an old row without `envelope` sums 0 |
| `test/webui/*.test.js` (the panel tests) | the four rows render from the fixture and are absent when the fields are absent |
| `goldens.test.js` | `status --json` on the fixture equals the W0 golden PLUS the `density`/`thin` keys only (the golden is taken after a build, so the field exists) |
