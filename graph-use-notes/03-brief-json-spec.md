# Spec — `--brief` (items B1 · B2 · B3)

Exact shapes and text. `02-PLAN.md` §2 says why. Numbers: `01-research.md` §1.2–1.3.

## 1. The switch

`--brief` is a bare switch, read as `args.includes("--brief")` (never through
`flag()`, which would read the next word as its value — R §4.3). It has an
effect only together with `--json`. Without `--json` nothing changes. Without
`--brief`, `--json` prints exactly what 1.9.0 prints (the W0 goldens hold it).

Implementation point: `finish(r, line, trace, jsonLine)` in `graphCmd()`
(`bin/cli.js`). When `brief` is set, `finish` passes the object through
`briefOf(sub, obj)` before `emitJson`, and `emitJson` is called with a third
argument `compact = true` so it writes `JSON.stringify(obj)` (no indentation).
`emitJson(obj, exitCode, compact)` keeps its old two-argument behaviour.

## 2. What brief keeps and drops, per command

Rule: **keep every scalar, every object of scalars, `card`, `line`, `trace`,
`budget`, `hidden`, `generation`, `gen_id`, `read`, `read_fallback`, `healed`,
and every list of PATHS or NAMES that is already short (≤ 10 items). Drop every
array of objects. Where a dropped array had no count beside it, add one under
`counts`.** An exit-4 answer keeps `nearest[]` / `candidates[]` — they are the
answer.

| Command | Dropped | Added under `counts` | Kept lists |
|---|---|---|---|
| `status` | — (no arrays) | — | — |
| `update` | `notes_pending.rows[]`, `notes_pending.waiting[]` | `notes_pending.rows: n`, `notes_pending.waiting: n` | `notes_pending.files[]`, `.missing[]` |
| `ctx <symbol>` | `callers[]`, `calls[]`, `effects[]`, `source` | `callers`, `calls`, `effects`, `source_lines` (0 when none) | `tests[]`, `wiki[]`, `note{}`, `target{}` |
| `ctx <file>` | `symbols[]`, `imports[]`, `importers[]`, `source` | `symbols`, `imports`, `importers`, `source_lines` | `tests[]`, `wiki[]` |
| `ctx a b …` (2–5 targets) | the per-target arrays inside each card are never in the JSON today; nothing to drop | — | `cards[]` (≤ 5 rows of `{query, state, used}`) |
| `ctx --for-slice` | `blocks[]`, `names[]` | `blocks`, `names` | `files[]`, `missing[]`, `skipped[]` |
| `impact` | `callers[]` | — (`total_callers` exists) | `files[]`, `missing[]`, `tests[]`, `wiki[]`; with `--complexity`: `complexity{}` and `facts{}` are KEPT whole (they are the answer, ≤ 10 rows each) |
| `map` | `files[]` | — (`shown`, `total_files` exist) | `focus[]`, `focus_missing[]` |
| `changes` | `symbols[]` | — (`counts{}` exists; V1 adds `totals{}`) | `files[]`, `not_in_graph[]`; V1's `blast_line`, `tests_line`, `totals{}` kept |
| `coverage` | `rows[]` | `paths` | — (the `line` names every path) |
| `cochange` | `rows[]` | `rows` | — (the `line` names every partner) |
| `notes pending` | `rows[]`, `waiting[]` | `rows`, `waiting` | `files[]`, `missing[]` |
| `gain` | — (no arrays; `by_command{}` and `hints{}` are objects of scalars) | — | — |
| `gain --history` | never brief — `--history` IS its rows; `--brief` is ignored with `line += " (--brief ignored on --history)"` | — | — |
| `path` | `chain[]` | `chain` | — (`hops` exists; the `card` is the chain) |
| `audit` (A2) | `zero_files[]`, `skipped[]`, `partial[]`, `shapes[]` | `zero_files`, `skipped`, `partial` | `by_lang{}` |

`counts` is one object, added only when brief dropped something. A brief
answer therefore has at most ONE new top-level key.

### 2.1 Measured target (the W1 gate)

| Command | Today | Brief, compact | Card | Gate: ≤ 1.25 × card + 120 |
|---|---|---|---|---|
| `ctx <symbol>` | 4,434 | 1,194 | 983 | 1,349 ✓ |
| `map` | 8,991 | 1,191 | 1,111 | 1,509 ✓ |
| `impact` 3 files | 4,481 | 969 | 839 | 1,169 ✓ |
| `ctx --for-slice` 3 files | 2,526 | 503 | 430 | 658 ✓ |

The W1 test re-measures these four on the Express fixture and on this tree.

## 3. `paid.envelope` (B3)

`finish` owns the ledger append. Today `graphGainAppend(gainRowFor(...))` runs
before `finish`; it moves INTO `finish` as an optional fourth parameter
`gainRow`. `finish` builds the output text, then:

```
envelope = tok(text) − tok(obj.card ?? obj.line ?? "")
gainRow.paid.envelope = Math.max(0, envelope)
graphGainAppend(claudeDir, gainRow)        // still fail-quiet, still after the text exists
write(text)
```

On the human path (`--json` absent) `text` is `line`, so the envelope is 0 for
a card command and the size of the human line otherwise. The hook's rows carry
`envelope: 0`. `gain()`:

- `paid.envelope` summed like the other three; `paid.total` includes it.
- the `line`: `paid       <total> tokens   (cards <c> · source <s> · hints <h> · envelope <e>)`.
- `--history` rows: `paid <total>` unchanged (total now includes envelope).
- the `trace`: `GRAPH-GAIN paid=<total> low=<l> high=<h> calls=<n>` unchanged in
  shape — `paid` is the total.

Backward compatibility: a row without `envelope` sums as 0; `readLedger`'s
validity test (`cmd`, `paid`, `avoided` present) is unchanged.

## 4. Every lane call site, before and after (B2)

Rule for the edit: append ` --brief` immediately after `--json` (or after
`--if-enabled` where `--json` is absent and the step reads the answer as JSON).
Never reorder the other flags. The lane lint matches `orc graph <sub>`, so the
lint's derived `lanes[]` does not move.

| # | File:line (22-09-2026) | Today | After |
|---|---|---|---|
| 1 | `agents-src/executor.template.md:57` (→ 10 executors) | `orc graph ctx <symbol\|file> --if-enabled --json` | `… --if-enabled --json --brief` |
| 2 | `templates/agents/orc-recon-sonnet-4-6-med.md:37` and `orc-recon-opus-5-low.md:37` | `orc graph ctx <anchor> --if-enabled --json` | `… --json --brief` |
| 3 | both recon agents `:43` | `orc graph ctx <symbol> --depth 2 --if-enabled --json` | `… --json --brief` |
| 4 | both recon agents `:44` | `orc graph impact <file> --if-enabled --json` | `… --json --brief` — the caller KINDS the return keeps apart are in the card rows (`R`, `(via x)`, `(inherited)`), not in `callers[]` |
| 5 | both recon agents `:45` | `orc graph coverage <files> --if-enabled --json` | `… --json --brief` |
| 6 | `_shared/phases/planning.md:34` | `orc graph map --focus <…> --if-enabled --json` | `… --json --brief` |
| 7 | `planning.md:41` | `orc graph impact <candidate declared_files> --if-enabled --json` | `… --json --brief` (the facets take `total_callers`, `tests[]`, `maybe_callers` — all kept) |
| 8 | `planning.md:43` | `orc graph cochange <each candidate file> --if-enabled --json` | `… --json --brief` |
| 9 | `_shared/phases/preflight.md:103` | `orc graph status --if-enabled --heal --json` | `… --heal --json --brief` |
| 10 | `_shared/phases/review.md:25` | `orc graph changes --if-enabled --json` | **EXCEPTION — unchanged.** The reviewer is handed the answer and needs `symbols[].caller_files` (an unchanged caller of a changed signature). Note for a later release: the reviewer agent runs `changes` itself, so the main session never holds it |
| 11 | `review.md:59` (diy block) | same | same exception |
| 12 | `_shared/phases/execution.md:40` | `orc graph ctx --for-slice <declared_files> --if-enabled --json` | `… --json --brief` |
| 13 | `execution.md:81` | `orc graph update --notes-pending --files <paths> --at wave --if-enabled --json` | `… --json --brief` (the lane reads `notes_pending.exit` and dispatches the noter with PATHS; rows are the noter's) |
| 14 | `execution.md:148–151` (diy block) | the same two calls | the same two edits → regenerate `test/goldens/diy-compile-default.md` |
| 15 | `_shared/phases/ship.md:57` | `orc graph gain --run <trace name> --if-enabled --json` | `… --json --brief` |
| 16 | `_shared/read-ladder.md:29` | `orc graph ctx <symbol\|file[:line]> --if-enabled --json` | `… --json --brief` |
| 17 | `orc-mini/SKILL.md:76` | `orc graph status --if-enabled --heal --json` | `… --json --brief` |
| 18 | `orc-mini/SKILL.md:77` | `orc graph map --focus "<3–6 words>" --budget 800 --if-enabled --json` | `… --json --brief` (mini pastes the CARD into `graph_facts.map`) |
| 19 | `orc-mini/SKILL.md:78` | `orc graph impact <declared_files> --if-enabled --json` (ONE call) and `orc graph cochange <each declared file> --if-enabled --json` | **replaced by V2**: `orc graph impact <declared_files> --complexity --risk=<facets.risk[] as class[@file:line],…> --if-enabled --json --brief` — ONE call (`04-lines-spec.md` §3) |
| 20 | `orc-mini/SKILL.md:79` | `orc graph ctx <declared_files> --for-slice --if-enabled --json` | `… --json --brief` |
| 21 | `orc-mini/SKILL.md:80` | `orc graph changes --if-enabled --json` | `… --json --brief` once V1 lands (prints `tests_line`, `blast_line`); the spine no longer reads `symbols[]` |
| 22 | `orc-mini/SKILL.md:81` | `orc graph update --notes-pending --files <actual_files> --if-enabled --json` · `orc graph gain --run <this run> --if-enabled --json` | both `… --json --brief` |
| 23 | `orc-mini/SKILL.md:237` | `orc graph ctx <paths> --if-enabled --json`, FIVE at a time | `… --json --brief` (exit codes only) |
| 24 | `orc-mini/references/complexity.md:13–14` | two table rows (`impact`, `cochange`) | one row: `orc graph impact <declared_files> --complexity [--risk=…] --if-enabled --json --brief` — `04-lines-spec.md` §3 |
| 25 | `orc-quick/SKILL.md:59` | `orc graph status --if-enabled --heal --json` | `… --json --brief` |
| 26 | `orc-quick/SKILL.md:97` | `orc graph ctx <targets> --if-enabled --json`, 5 at most | `… --json --brief` |
| 27 | `orc-quick/SKILL.md:98` | `orc graph map --focus "<3–6 words>" --budget 800 --if-enabled --json` | `… --json --brief` |
| 28 | `orc-quick/SKILL.md:100` | `ctx <symbol> --depth 2` and `orc graph coverage <files> --if-enabled --json` | both `… --brief` |
| 29 | `orc-quick/SKILL.md:157` | `orc graph ctx <declared files> --for-slice --if-enabled --json` | `… --json --brief` |
| 30 | `orc-quick/SKILL.md:190` | `orc graph changes --if-enabled --json`, keep the `symbols[]` whose `file` is in `actual_files` … | **replaced by V1**: `orc graph changes --files=<actual_files, comma-separated> --if-enabled --json --brief` — print `tests_line`, run those tests, print `blast_line` (`04-lines-spec.md` §1) |
| 31 | `orc-quick/SKILL.md:213` | `orc graph update --notes-pending --files <actual_files> --if-enabled --json` | `… --json --brief` |
| 32 | `orc-quick/SKILL.md:218` | `orc graph gain --run <this run> --if-enabled --json` | `… --json --brief` |
| 33 | `orc-quick/references/look.md:23` | `orc graph ctx <targets> --if-enabled --json` | `… --json --brief` |
| 34 | `look.md:24` | `orc graph map --focus "<…>" --budget 800 --if-enabled --json` | `… --json --brief` |
| 35 | `look.md:25` | `orc graph ctx <symbol> --depth 2 --if-enabled --json`, then `orc graph coverage <files> --if-enabled --json` | both `… --brief` |
| 36 | `look.md:55` | `orc graph coverage <the files in play> --if-enabled --json` | `… --json --brief` |
| 37 | `look.md:78` | `orc graph ctx <declared files> --for-slice --if-enabled --json` | `… --json --brief` |
| 38 | `orc-quick/references/gh-mode.md:73` | `orc graph ctx <the anchor file:line> --if-enabled --json` | `… --json --brief` |
| 39 | `orc-fast/SKILL.md:77` | `orc graph status --if-enabled --heal --json` | `… --json --brief` |
| 40 | `orc-fast/SKILL.md:78` | `orc graph ctx <declared files> --if-enabled --json` | `… --json --brief` |
| 41 | `orc-fast/SKILL.md:79` | `orc graph update --if-enabled --json` | `… --json --brief` |
| 42 | `orc/SKILL.md:208` | the summary line naming every call | add once: `… every `--json` read carries `--brief` (`../_shared/code-graph.md` §3)` |
| 43 | `templates/agents/orc-graph-noter-sonnet-4-6-med.md:39` | `orc graph notes pending --files <files> --cap <cap> --min <min> --with-source --json` | **EXCEPTION — unchanged.** The noter needs `rows[].source` |
| 44 | `orc-graph-noter-sonnet-4-6-med.md:63` | `orc graph notes apply - --json` | **EXCEPTION — not a read** |
| 45 | `bin/cli.js:3185–3187` `announce[]` | `(1) now: \`orc graph status --if-enabled --heal --json\` … (2) … \`orc graph ctx <declared files> --if-enabled --json\` cards; (3) … \`orc graph update --if-enabled --json\`` | each gains ` --brief`; the sentence ends `Copy each \`line\` and \`trace\` verbatim; \`--brief\` drops the rows you never print` |
| 46 | `_shared/code-graph.md` §3 table | every `Call` cell that ends in `--json` | append ` --brief` in each cell; add one sentence under the table (§4.1 below) |

Not listed, on purpose: `templates/skills/_shared/phases/ship.md:53` and `:76`
(`orc graph update --if-enabled` with no `--json` — human path, nothing to
drop); `orc-mini/examples/mini-run-mock.md` (an example transcript, edited only
if the printed answer is shown).

### 4.1 The sentence in `_shared/code-graph.md` §3

Placed directly under the calls table:

> **`--brief` (v1.9.1).** Add it to every `--json` read. It keeps the `card`,
> the `line`, the `trace`, every count and every short list of paths, and drops
> the row arrays a lane never prints — the same facts the card already carries,
> at 4 to 8 times its size, re-sent on every later turn. Leave it off only where
> the step names a row array it reads (the reviewer's `changes`; the noter's
> `notes pending --with-source`).

Contract row to add in `bin/verify-contracts.js`: `token: "--brief"`, files:
the payload files in rows 1–42 above that carry it (the executor template is
covered through the 10 generated files, as `graph_used` is today), plus
`hooks/README.md` is NOT included (the hook never uses it), `binFiles:
["bin/cli.js"]`.

## 5. The rule for every new flag in this release

| Flag | Kind | Why this kind |
|---|---|---|
| `--brief` | bare switch | `flag()` would eat the next operand |
| `--complexity` | bare switch | same |
| `--callers-source` | bare switch, fixed window (6 lines, ≤ 5 callers) | a count would need `=`; a fixed window is enough (DE-7) |
| `--risk=<class>[@file:line],…` | `--name=value` | a value; `=` keeps it one word, so a 1.9.0 CLI skips it whole |
| `--files=<a,b>` (on `changes`) | `--name=value` | same; note `notes pending --files <a,b>` (space form) is a 1.8.x flag and stays as it is |
| `--top=N` (on `audit`) | `--name=value` | same |

Parsing helper, once, in `graphCmd()`:

```js
const eqFlag = (name) => {
  const hit = args.find((a) => a.startsWith(name + "="));
  return hit === undefined ? undefined : hit.slice(name.length + 1);
};
```

Every subcommand's positional loop already skips a word that starts with `--`,
so none of these can reach `plain[]`, and `--source`'s optional-count logic is
untouched.
