# Spec — delivery where the paid reads are (items R1 · R2 · R3 · R4)

The evidence (`01-research.md` §5): a graph answer helps when the SOURCE
travels with it (codegraph: zero file reads; FastContext: line ranges, −60 %
agent tokens), and read operations are ~76 % of an agent's tokens. The
executor and the recon agent are where those reads happen. Every item here is
budget-charged and keeps the locator rule: a card names a range; behaviour is
read from the code.

## 1. `ctx <symbol> --callers-source` (R1)

### 1.1 What it prints

After the card's rows and after any `--source` block, one fenced block per
confident caller, in the card's caller order (file, line), at most
`CALLERS_SOURCE_MAX = 5` callers, `CALLERS_SOURCE_LINES = 6` lines each: the
call line, two lines above, three lines below (clamped to the file). Charged to
the SAME budget, after everything else, so the rows always win and the footer
says how many callers it cut:

```
  callers source  3 of 5 shown (6 lines each; raise --budget)
  src/routes/orders.js:14-19  ← GET /search
  ```js
    14  router.get("/search", requireAuth, async (req, res) => {
    15    const q = String(req.query.q || "");
    16    const rows = await store.searchByItemPrefix(q);
    17    res.json(rows);
    18  });
    19
  ```
```

- The head line names the range and the caller's own `qname` (or the URL for a
  `ROUTE` edge: `← GET /search`), so the reader can match it to a card row.
- Lines come from the CURRENT bytes on disk; when the caller's file is not
  `current`, the head line gains ` — CHANGED since index, the range may have
  moved` (the same sentence `--source` prints).
- Only CONFIDENT callers (`LOCAL` · `IMPORT` · `UNIQUE` · `ROUTE`) — never an
  AMBIGUOUS candidate: printing source for a guess is the false sentence R3-C
  found. `maybe` stays a count.
- `--callers-source` on a FILE card or on `--for-slice` is ignored with one
  footer word (`callers source: symbol cards only`) — DE-7b.
- Not on the sharded fast path: `fastModel()` declines a query that carries
  `--callers-source` (reason `callers-source`), exactly as it declines
  `--source`'s count today, so the full model reads the caller files.

JSON (additive, only when the flag is given): `callers_source: [{file, from,
to, caller: qname-or-url, text, changed}]`, `counts.callers_source_cut`.
`--brief` drops `callers_source[]` (the card has it) and keeps the count.

### 1.2 The ledger

`gainRowFor` prices the block as `paid.source` (it printed exactly the lines a
range read would have returned, so `avoided` gets `sourceAvoided()` per block —
the one half of the meter that is not an estimate, as `--source` is today).

### 1.3 Who uses it

- The recon agents (`orc-recon-*.md` step 1): *`blast_radius: true` → `orc graph
  ctx <symbol> --depth 2 --callers-source --if-enabled --json --brief` — the call
  sites arrive WITH the card; open a caller file only when six lines were not
  enough to answer.* (`03` §4 rows 3–4 fold into this.)
- The read ladder step 3 (`_shared/read-ladder.md`): one sentence beside
  `--source`: *`--callers-source` adds six lines around each confident call
  site (≤ 5). A file you will EDIT is still read in full with `Read` first —
  this is for the callers you will not touch.* Exception 1 restated in the same
  sentence, as `--source` does.
- The executor template line 57 gains nothing more than `--brief`: an executor
  asks for callers' source through the ladder, not by default.
- The reviewer (`phases/review.md`) — not in this release; `03` §4 row 10.

### 1.4 Contract

`bin/verify-contracts.js` row: `token: "--callers-source"`, files
`["skills/_shared/code-graph.md", "skills/_shared/read-ladder.md",
"agents/orc-recon-sonnet-4-6-med.md", "agents/orc-recon-opus-5-low.md"]`,
`binFiles: ["bin/cli.js", "bin/graph-query.js"]`. `_shared/code-graph.md` §7
gains the paragraph from §1.3 (the ladder sentence, once, canonical).

## 2. Count the wide whole-file reads the hook did not hint (R2)

In `onRead()` (PostToolUse `Read`, which runs under `code_graph_hooks: on`),
BEFORE the coverage test, add:

```js
if (input.offset === undefined && input.limit === undefined) {
  const wide = readJson(path.join(GRAPH_DIR, "wide.json"));
  if (wide && wide.files && wide.generation === meta.generation && own(wide.files, rel)) {
    if (!readHint && bump(runName, "wide_unhinted", "wideu:" + rel))
      ledger(runName, "wide-unhinted", "", zeroAvoided, zeroPaid);
  }
}
```

- Counted ONLY when the read hint is NOT armed (`readHint` false): under
  `on,read` the PreToolUse hint already fired for that file and the miss is 0.
- Once per file per run (the `wideu:` token in the counters file); no
  `additionalContext`, no trace line — it is a count, not a hint.
- `wide.json` is 8.8 KB here and 278 KB on django; parsing it on every
  whole-file Read of a subagent is ≤ 2 ms (W3 measured 1.8 ms). The two hints
  that are on today do not pay for it: the parse happens only for a Read with no
  range, inside the fail-quiet wrapper.

`gain()` counts `r.cmd === "wide-unhinted"` into `hints.wide_unhinted` and the
line gains, when > 0:

```
  wide reads   12 whole-file reads of files with 8+ symbols were not hinted — `code_graph_hooks: on,read` names their ranges
```

The UI `Hints` row becomes `Hints (injected · read notes · updates · wide reads not hinted)`.
This is the number DE-8 waits for. Nothing flips by itself.

## 3. The wide hint names the run's own names first (R3)

Only under `on,read`, in `onWideRead()`: before slicing `rows` to `WIDE_ROWS`,
stable-sort them so a symbol whose bare name appears in the run's counters
`tokens` (`name:<x>` from a hint, and the names `--for-slice` delivered) comes
first; the rest keep their importance order. The line text is unchanged:

```
<file> holds many symbols; the most reached are <a> 40-80 · <b> 300-360 · … The read below still runs; a later read of this file can name a range.
```

Why: the six symbols the store ranks by importance are the repository's view;
the two the slice named are the task's view. Cost: one array sort over ≤ 6
rows and a `Set` of ≤ 400 tokens already in memory.

## 4. The LSP sentence and `lsp_at` (R4)

### 4.1 `lsp_at` on a symbol card (additive)

```json
"lsp_at": { "file": "src/stores/orderStore.js", "line": 18, "character": 17 }
```

`character` is the 1-based index of `sym.name` in the definition line
(`sym.lines[0]`), found by reading that ONE line from disk (`readRange`-style,
one file open) and searching for the name as a whole word; `null` when the
file is not `current`, the line cannot be read, or the name is not on it. Not
computed on the sharded fast path either (it reads the line; the fast path
already has the file's blob but not its bytes) — the fast path returns `lsp_at:
null` and the field says `"lsp_at": null`, so a fast card and a full card stay
byte-identical in every OTHER field (the W8 rule is about the card text, which
does not print `lsp_at`).

### 4.2 The ladder sentence (`_shared/read-ladder.md`, step 0)

> If the card answers `AMBIGUOUS (n)` for a callee, or `← maybe <n>` for
> callers, and an `LSP` tool is available in this session, run `LSP
> findReferences` (callers) or `goToDefinition` (a callee) at the card's `lsp_at`
> — file, line, character — before any Grep. A language server's answer is
> EXACT; the card's `AMBIGUOUS` is a list of candidates. Without an LSP tool, or
> with `lsp_at: null`, the ladder continues as before.

The executor template gains the same sentence in one line (line 57 today ends
"skip"; the sentence follows it). The recon agents step 1 gains it. The
contract §2 (the state words) gains: *`EXACT` is still reserved — the CLI never
emits it; an LSP answer inside the agent's own session is where `EXACT` lives.*

### 4.3 Contract

`bin/verify-contracts.js` row: `token: "lsp_at"`, files
`["skills/_shared/code-graph.md", "skills/_shared/read-ladder.md",
"agents/orc-recon-sonnet-4-6-med.md", "agents/orc-recon-opus-5-low.md"]` + the
10 executors through the template, `binFiles: ["bin/graph-query.js"]`.

## 5. Tests (W5)

| Test | Asserts |
|---|---|
| `graph-query.test.js` | `--callers-source`: ≤ 5 blocks, 6 lines each, clamped at file ends; the budget is never exceeded and the footer counts the cut; a `ROUTE` caller's head names the URL; a CHANGED caller file gets the sentence; AMBIGUOUS never printed; ignored on a file card and on `--for-slice` with the footer word; `fastModel` declines with reason `callers-source`; `lsp_at.character` equals `indexOf(name) + 1` on the fixture; `null` on a CHANGED file |
| `graph-gain.test.js` | a `--callers-source` block prices as `paid.source` with `sourceAvoided`; `wide-unhinted` rows counted into `hints.wide_unhinted`; the line appears only when > 0 |
| `graph-hook.test.js` | under `on`: a whole-file Read of a wide file appends one `wide-unhinted` row and emits nothing; a range Read appends none; under `on,read`: none (the hint fired instead); the personalised order puts a `name:` token's symbol first and keeps the rest in importance order; the line text is unchanged |
| `graph-brief.test.js` | `callers_source[]` dropped, count kept; `lsp_at` kept |
| `payload.test.js` / `docs.test.js` | the ladder, the template, the recon agents and the contract carry the pinned tokens |
