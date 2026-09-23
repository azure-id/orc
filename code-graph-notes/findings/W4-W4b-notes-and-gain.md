# W4 · W4b — the paid layer paid less, and the meter that shows it (20-09-2026)

Plan §4 (N1 · N2 · N3) and §3b (K1–K6). Branch `feat/orc-graph-2`.
Nothing committed.

---

## W4 — N: the paid layer, paid less

| Item | Where | Note |
|---|---|---|
| N1 doc notes | `bin/graph-extract.js` (`docFor`, `pyDoc`, `aboveDoc`, `docText`) | The first sentence the AUTHOR wrote, for a function, a method or a route, at **0 model tokens**. Docstring (Python, inside), JSDoc block, `///`/`//` run, `#` run, `--` run. Cut at the first tag line (`@param`, `:returns:`, `Args:`). ≤ 240 characters. Stored as `symbol.doc`. |
| N1 resolution | `bin/graph-notes.js` (`noteFor`) | ONE rule, shared by every reader: **current model note → doc → stale model note**. A doc beats a STALE note because it matches the bytes on disk; a CURRENT model note beats a doc because a comment can lie. |
| N1 batching | `bin/graph-notes.js` (`notesPending`) | A symbol with a `doc` is **never in a batch**. The answer carries `documented`, and the chat line says how many were skipped. |
| N2 `--with-source` | `bin/graph-notes.js` (`readRange`), `bin/cli.js` | Each pending row carries `source {from, to, cut, text}`, ≤ 120 lines. The noter's step 2 becomes "read a file ONLY when `source` is null" — one CLI call instead of N `Read`s. |
| N3 batch sentence | `bin/cli.js` | A below-minimum batch always prints `graph notes: <n> pending, waiting (min <m>)`, so a lane that says it once per wave and one that says it once per run read alike. |
| N3 Haiku noter | **NOT BUILT — see below** | |

### The doc-share measurement, honestly

The plan expected **> 60%** of django symbols to carry a `doc`. Measured on the
real repositories, with the extractor verified correct by hand on samples:

| Repo | function/method/route symbols | with a `doc` | non-test source |
|---|---|---|---|
| django/django | 33,468 | 6,669 (**19.9%**) | 2,873 / 9,401 (**30.6%**) |
| nestjs/nest | 4,369 | 312 (**7.1%**) | 297 / 3,318 (**9.0%**) |

The extraction is right — spot checks on `django/apps/registry.py` found 11 of
14 methods documented and all 11 captured, and `packages/common/decorators/**`
in nest captured every JSDoc block. The estimate was wrong: django's test tree
(24,067 of its 33,468 notable symbols) is largely undocumented, dunder methods
are 4.6% documented, and nest's core files carry two JSDoc blocks between them.
Adding the `#`-block-above fallback for Python gained +1.5 points overall.

**What this means for the claim:** N1 removes roughly a fifth to a third of the
work a noter batch would otherwise pay for, on a well-documented codebase. Not
the two-thirds the plan assumed. It costs nothing either way, so it ships — but
the CHANGELOG must not repeat the 60% figure.

### DE-D (the Haiku noter) — NOT BUILT, and why

The decision row says: ship `orc-graph-noter-haiku-4-5` behind
`code_graph_notes_model: sonnet | haiku` **only if** a blind 30-symbol
comparison on the fixture set scores Haiku within one rejected note and one
"wrong effect" of Sonnet. That comparison is the one PAID measurement in this
plan (~100K tokens of model work) and it has not been run.

Shipping the variant without it would put an unvalidated model behind a config
key the user can turn on — exactly what the gate exists to prevent. So:

- `orc-graph-noter-haiku-4-5.md` is **not** created.
- `code_graph_notes_model` is **not** added to the config registry.
- The protocol is written down here so the measurement can be run later:
  30 symbols from the four W0 fixtures, both models noting the same batch with
  the same slice, notes shuffled and graded blind against the source for
  (a) rejected rows and (b) a claimed effect the code does not have.

This is the only part of W4 that is not delivered, and it is a decision, not a
blocker: the default was `sonnet` and it still is.

---

## W4b — K: the gain meter

New file **`bin/graph-gain.js`** (the ledger, the K2 counterfactual rules, the
aggregation, the K4 arithmetic). New command **`orc graph gain`**.

| Item | Where |
|---|---|
| K1 the ledger | `.claude/orc/graph/gain.jsonl`, appended by `ctx` · `ctx --for-slice` · `impact` · `path` · `changes` and by the hook after it emits. Append-only, torn-line tolerant, never under the lock, capped at 5,000 rows by `orc graph gc`. |
| K2 the counterfactual | `bin/graph-gain.js` — one function per command, each priced from the file's own `bytes` and `lines` (both now recorded by the extractor). No file is opened to price a row. |
| K3 `orc graph gain` | `--run` · `--since` · `--history [--limit]` · `--measured` · `--reset --yes` · `--json` · `--if-enabled`. Exit 0 rows · 1 no ledger or no rows · 3 off. |
| K4 `--measured` | `graphMeasured()` in `bin/cli.js` — reuses `transcriptDir()`/`listTraces()`/`readTraceMeta()`, adds `readToolCorpus()` which counts TOOL CALLS (the existing `readCorpus` reads `usage` blocks only). |
| K5 the panel + `orc stats` | `/api/graph/gain` on load, `/api/graph/gain/measured` on a button; the Knowledge card's gain strip; `orc stats` gains a `graph` row; `GRAPH-GAIN` at ship. |
| K6 the refusals | asserted by tests — no percent of the session, a coverage note is paid-only, a `graph_used: none` card avoids nothing, a failed append is silent. |

### The two numbers the meter refuses to print

1. **One number for `avoided`.** `rtk gain` can print one because a filtered
   command output has one exact raw size. The alternative to
   `ctx OrderService.create` is a Grep and then a read, and how much read is a
   guess. So it is always `low – high`, and the word "estimate" is in the
   string, not in a tooltip (DE-L).
2. **A percent of the session.** EW8 §1 measured retrieval at a fraction of a
   percent of a session. The only percent the meter prints is the MEASURED
   executor-window delta, with its N and the OFF group's own spread beside it,
   and the line says in words that a delta smaller than that spread is noise.

### Store changes

- `index.by_file[rel]` and `files.json` gain `bytes` and `lines`. Additive, same
  engine (`graph@5` — 1.8.2's engine, already bumped in W2), and the gain meter
  is the only reader.
- `wide.json` (W3) and `gain.jsonl` (W4b) are new files under
  `.claude/orc/graph/`. Both are derived, both are generation- or cap-bounded,
  and losing either changes no answer.

---

## Gates at the W4b pause

| Check | Result |
|---|---|
| `node eval/fixture-graph/check.js` | **0 FAIL** across 4 fixtures (38 rows) |
| `npm run verify` | ✅ 40 skills · 49 agents · **200 contracts** (192 at the W2 pause) |
| `npm test` | see `CHECKPOINT-1.8.2.md` |
| NEW test files | `test/cli/graph-delivery.test.js` (10) · `test/cli/graph-doc.test.js` (7) · `test/cli/graph-gain.test.js` (14) |
| Edited test files | `test/hooks/graph-hook.test.js` (+4) · `test/cli/install.test.js` (+3) · `bin/webui/fixtures/stats.js` |

## Decisions taken in these waves

| # | Decision |
|---|---|
| W4-doc-share | The plan's ">60% of django symbols carry a doc" is WRONG: measured 19.9% overall and 30.6% of non-test source. The extractor is correct; the estimate was not. The CHANGELOG must quote the measurement, never the estimate. |
| W4-py-hash-doc | Python looks INSIDE first (the docstring), then at a `#` block above. Measured +1.5 points on django, and the samples it adds are correct sentences about the function below them. |
| W4-doc-beats-stale | A doc outranks a STALE model note and never a current one. A sentence that matches the bytes on disk beats one that matched a body nobody has any more; a model that read the code beats a comment that claims to describe it. |
| **DE-D not taken** | The Haiku noter is NOT built. Its gate is a paid blind comparison that has not been run, and shipping an unvalidated model behind a user-facing key is what the gate exists to prevent. The protocol is recorded above. |
| W4b-ledger-stamp | The ledger uses ORC's own `DD-MM-YYYY HH:MM:SS` (what `graph.stamp()` writes), in the CLI and in the hook. The parser also accepts the trace's `DDMMYY HH:MM:SS.mmm` so a row of either shape still reads. |
| W4b-bytes-lines | `bytes` and `lines` go into the INDEX, not into a new store. The counterfactual needs a file's average line length to price "an 80-line read", and computing it by opening the file would make every ledger row a file read. |
| W4b-measured-own-route | `--measured` is its own API route and its own button. It reads Claude Code's transcripts and takes longer than a panel load should, and a panel that stalls on open is a panel nobody opens. |
| W4b-stats-null | `orc stats` reports `graph: null` when there is no ledger, never `0`. No record at all and a zero saving are different facts. |
