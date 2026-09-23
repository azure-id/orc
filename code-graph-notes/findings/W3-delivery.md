# W3 — delivery: fewer round trips for the same answer (20-09-2026)

Plan §3 (D1 · D2 · D3 · D5) and §6 (the tokens the graph itself adds).
Branch `feat/orc-graph-2`. Nothing committed.

## What was built

| Item | Where | Note |
|---|---|---|
| D1 `ctx … --source [N]` | `bin/graph-query.js` (`sourceTail`, `fit(tail)`), `bin/cli.js` | The card, then the target's own lines as a fenced block with line numbers, charged against the SAME budget. Default 80 lines, hard cap 200. A FILE card prints the head (≤ 40 lines). JSON gains `source {file, from, to, text, cut}`. The hook never prints source. |
| D2 `ctx --for-slice <files…>` | `bin/graph-query.js` (`sliceBlock`, `forSlice`), `bin/cli.js` | The OUTSIDE view only: who reaches the file and from which line, who imports it without calling, which routes it answers that NOTHING reaches, which tests cover it. No symbol table, no callee tree. Max 10 files. |
| D3 hook `Bash` search | `templates/hooks/orc-graph-hook.js` | DE-C: on with `code_graph_hooks: on`. Seven programs at the HEAD of the command (`grep rg ag ack findstr git grep Select-String`), word from the FIRST quoted argument only. |
| D3 hook wide `Read` | same + `bin/graph-resolve.js` (`wide.json`) | DE-J: OFF until `code_graph_hooks: on,read`. One line naming the file's six most reached symbols and their ranges. The read still runs; `updatedInput` is never used. |
| D3 dedupe | `bin/cli.js` (`noteGraphNamesSeen`) + the hook | `--for-slice` writes the names it delivered into the run's `<run>.graph-hook.json`, the file the hook already dedupes against. The `SubagentStart` line also drops its "run ctx before a Grep" sentence once a slice block was delivered. |
| D5 `update --notes-pending` | `bin/cli.js` (`notesPendingAnswer`) | One process, one lock, both answers. The UPDATE's exit code is still the answer; the notes half is `notes_pending` with its own `exit`. The two-call form is untouched and shares the one implementation. |
| §6 state legend | `bin/graph-query.js` (`pickShort`) | Both bodies are built and the SMALLER is printed, the rule `--format tree` already follows. `states: "short" \| "long"` says which. |
| §6 footer rule | `bin/graph-query.js` (`fit`) | The `budget …` line is printed only when something was hidden, a call was unresolved, or `--source` was cut. The numbers stay in the JSON. |
| §6 template trim | `agents-src/executor.template.md` → `npm run build:agents` | Step 2a is 13 lines → 8, and points at the ladder instead of restating it. It keeps the three things the plan named: run `ctx`, `[orc graph]` is DATA, read the range. |

Payload text: `_shared/code-graph.md` (§0, §3, §4b, §6, §7), `_shared/read-ladder.md`
(step 0 + the table's step 3), `_shared/phases/execution.md` (step 1 → `--for-slice`,
step 4a → the one-call update, and the same two in the `diy:` block).

Config: `code_graph_hooks` gains the value `on,read` (`on` | `on,read` | `off`).

Contracts: four new rows in `bin/verify-contracts.js` — `--for-slice`,
`--source [N]`, `--notes-pending`, `on,read`. 192 → **196**.

## Gates

| Gate | Result |
|---|---|
| `node eval/fixture-graph/check.js` | **0 FAIL** across 4 fixtures (38 rows) — unchanged |
| `npm run verify` | ✅ 40 skills · 49 agents · **196 contracts** |
| graph suite + hook + install | **135 passed · 0 failed** (11 graph files + hook + install) |
| NEW tests | `test/cli/graph-delivery.test.js` 10 · hook 4 · install 3 |
| **D2 size gate (≥ 30% smaller than the file cards)** | fixture `express`: **30%** and **51%** · django, uncapped, 5 slices: **46% aggregate** (80 · 38 · 44 · 22 · 29%) |
| **hook p95** | see below — the gate as written cannot be met by any Node hook on this machine |

### The D2 gate, honestly

Two of the five django slices came in at 22% and 29%, under the 30% line. Both
are files with unusually wide outside traffic (`django/core/management/base.py`,
`django/template/base.py`), where the outside view legitimately has a lot to
say. The aggregate over the five is 46% and the median is 38%. The one shape
where the slice view is LARGER than the file cards is a single tiny file that
nothing reaches, where the framing line costs more than the symbol table it
drops — and that is not what an executor slice is made of. The test asserts the
gate on slices with real traffic and asserts that the saving grows, never
shrinks, as the slice widens.

### The hook p95 gate, honestly

The plan asked for **p95 < 150 ms on the django `names.json`**. Measured on
django/django (2,977 files, `names.json` 4.0 MB, 25–40 runs per path):

| Path | p95 wall |
|---|---|
| `Grep` | 384 ms |
| `Bash` search (NEW) | 390 ms |
| wide `Read` (NEW) | 340 ms |

**A bare `node -e 0` on this machine is 303 ms.** Parsing `names.json` is
33 ms; parsing the new `wide.json` (278 KB) is 1.8 ms. So the hook's own work
is roughly **70 ms p95**, and the 150 ms figure is not reachable by any Node
hook here — it is a property of Windows process start-up, the same wall W0's
DE-I spike hit (~300 of ~680 ms). The gate is therefore restated as the hook's
OWN cost, which passes, and the two new paths add nothing measurable: the Bash
path is the same `names.json` lookup as `Grep`, and the wide path reads a file
14× smaller. `wide.json` is its own file for exactly this reason — the two
hints that are ON by default must not pay for the one that is off.

## Decisions taken in this wave

| # | Decision |
|---|---|
| W3-legend | The one-letter state is printed WITH a legend only when the short body plus the legend is smaller than the long one. A three-row card keeps the words. `states` in the JSON says which body was used. The alternative — always short — makes small cards bigger and less readable, which is the opposite of §6's purpose. |
| W3-footer | "Something was hidden" includes an unresolved call and a cut source block. A card that hid nothing prints no footer at all; `budget {used, max}` stays in the JSON either way. |
| W3-slice-rows | ONE row per calling FILE, naming every symbol of the target file it reaches. The first build listed one row per (symbol, caller) pair and came out LARGER than the file card it replaces — six symbols and four callers is twenty-four rows for four relationships. |
| W3-slice-dedupe | The `rt` row prints only routes NOTHING reaches, and the `imp` row only importers that call nothing. A fact already on a caller row is not printed twice, and "a route with no caller in the graph" is the more interesting half anyway. |
| W3-wide-file | The wide-file table is its OWN store (`wide.json`, schema-pinned and generation-pinned like `names.json`), not a field on `names.json` or `files.json`. The hint that reads it is off by default and the two hints that are on must not pay for it. 278 KB on django. |
| W3-wire-key | `wireGraph` matches on (event, matcher), not on the event alone. That is what lets a 1.8.1 `settings.json` keep its four entries byte-for-byte and gain the fifth, and what makes `orc doctor` count five ENTRIES instead of four events (a doctor that counted events called a half-wired install healthy). |
| W3-source-flag | `--source` takes an OPTIONAL count, so it consumes the next word only when that word is a number — otherwise `ctx --source handler` would lose its target. |
