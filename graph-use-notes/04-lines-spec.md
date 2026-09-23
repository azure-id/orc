# Spec — the CLI computes the line (items V1 · V2 · V3)

The rule (S1, and `lean-lanes-notes/02-PLAN.md` DE-14 (b)): a state is
computed by the CLI; a lane prints it. Today quick and mini count rows in the
orchestrator's context to print one line each (`01-research.md` §4.5). After
this spec the CLI prints both lines and the rows never enter that context.

## 1. `changes`: `totals{}`, `tests_line`, `blast_line`, `--files=`

### 1.1 New fields on the `changes` answer (additive)

```json
"totals": {
  "symbols": 3,
  "callers": 7,
  "caller_files": 4,
  "maybe": 2,
  "tests": 2,
  "tests_by_kind": { "route": 1, "call": 1, "name": 0 },
  "high": 1, "medium": 1, "low": 1,
  "not_in_graph": 0
},
"tests_line": "tests reached  2 files (ROUTE 1 · call 1)",
"blast_line": "blast radius   3 symbols · callers 7 in 4 files · tests reach 2 · risk high: createOrder (exported, fan-in 4, no test reaches it)"
```

- `callers` = the sum of `fan_in` over the rows; `caller_files` = the distinct
  `caller_files` over the rows; `maybe` = the sum of `maybe_callers`.
- `tests` = distinct test files over the rows; `tests_by_kind`: `route` = a test
  file whose edge into any row is `ROUTE` (from `callersOf(...).confident[].state`),
  `call` = any other confident edge, `name` = matched by `testsByName` only. A
  file that reaches by two kinds is counted once, under the strongest
  (`route` > `call` > `name`).
- `blast_line`, exact grammar (spaces are three between the label and the
  first field, one around every `·`):
  - rows > 0: `blast radius   <symbols> symbol(s) · callers <callers> in <caller_files> file(s)[ · maybe <maybe>] · tests reach <tests> · risk <worst>: <qname> (<why joined by ", ">)`
    — `<worst>` is the first row after the existing sort (high → medium → low,
    then fan-in). `maybe` is printed only when > 0.
  - rows = 0: `blast radius   none indexed (<not_in_graph> file(s) not in the graph)`
    — when `not_in_graph` is 0 too: `blast radius   none indexed`.
- `tests_line`: `tests reached  <tests> file(s) (ROUTE <route> · call <call>[ · name <name>])`;
  with 0 tests: `tests reached  none`. The lane appends ` → <n> passed` itself
  after running them — the CLI never runs a test.
- `plural()` is the CLI's existing helper (`1 symbol`, `3 symbols`).

### 1.2 `--files=<a,b>`

Restricts the rows to hunks in the given paths (normalised like every other
path). `totals`, `tests_line` and `blast_line` are computed over the restricted
rows. `files[]` lists only the restricted paths that had a hunk;
`not_in_graph` counts only among them. Without `--files=` nothing changes.
Quick passes its `actual_files`; the spine no longer says "keep the `symbols[]`
whose `file` is in the return's `actual_files`".

### 1.3 The `line` (human path) is unchanged

`blast_line` and `tests_line` are appended to the `--json` answer only. The
human `line` still lists every symbol with its risk and why.

### 1.4 The spine text that moves (`orc-quick/SKILL.md`, lines 190–199 today)

Before (10 lines, abridged): run `changes`, keep the `symbols[]` whose `file`
is in `actual_files`, run the tests their `tests[]` name, then print the blast
radius from the same answer, one line, never a `risk` word without its `why`;
the two example lines.

After (6 lines):

> **Affected tests first.** Run `orc graph changes --files=<actual_files> --if-enabled --json --brief`.
> Print its `tests_line`, run the files `tests[]` names BEFORE the suite (a runner
> that takes no file list → one line saying so), append ` → <n> passed`. Then the
> suite. Then print its `blast_line` VERBATIM — the CLI attaches every `risk`
> word's `why`; never restate it. Exit 3 → nothing; exit 1 → `blast radius   graph unavailable`.
> No `blast_line` in the answer (a 1.9.0 CLI) → count `symbols[]` as 1.9.0 did.

The same edit in `orc-mini/SKILL.md` line 80 (Phase M) and `references/look.md`
where the blast-radius sentence is quoted.

## 2. `impact --complexity [--risk=…]`

### 2.1 What it computes

Operands = `declared_files`. Over every symbol in them, from `callersOf`:

| Number | Definition |
|---|---|
| `files` | operands that are in the graph |
| `callers_outside` | confident callers (`LOCAL` · `IMPORT` · `UNIQUE` · `ROUTE`) whose file is NOT an operand |
| `caller_files_outside` | distinct files of those callers |
| `maybe` | AMBIGUOUS callers naming any operand symbol, by caller file, outside the operands |
| `tests_reaching` | distinct test files among the callers, plus `testsByName` for every operand, plus test importers |
| `cochange_missing[]` | for every operand, `graphCochange` partners with `together ≥ COMPLEXITY_COCHANGE_MIN` that are not operands, deduped, as `{path, count, of}` — computed in the same process from the per-HEAD cache |
| `risk[]` | parsed from `--risk=`; absent → `[]` and `risk_given: false` |

The four thresholds, as named constants in `bin/graph-signals.js` with their
reasons as comments (DE-12), quoted by `complexity.md`:

```js
const COMPLEXITY_CALLER_FILES = 4;   // callers in 4 or more files outside the plan
const COMPLEXITY_CALLERS = 8;        // 8 or more confident callers outside the plan
const COMPLEXITY_COCHANGE_MIN = 3;   // = COCHANGE_MIN: a partner that changed with an operand 3 times
// any risk class given → recommend; AMBIGUOUS callers never trip a threshold alone
```

Verdict: `recommend-orc` when `caller_files_outside ≥ 4` OR `callers_outside ≥ 8`
OR `risk.length > 0` OR `cochange_missing.length > 0`; else `mini-ok`.
`why[]` names every threshold that tripped, in this order, with its number:
`callers in 9 files (≥ 4)`, `callers 27 (≥ 8)`, `risk auth`, `cochange
src/auth.js x5 not in plan`. When `--risk=` is absent, `why[]` ends with
`risk: not given` so the reader knows the verdict is partial.

### 2.2 The answer (additive keys on the `impact` answer)

```json
"complexity": {
  "verdict": "recommend-orc",
  "why": ["callers in 9 files (≥ 4)", "callers 27 (≥ 8)", "risk auth", "cochange src/auth.js x5 not in plan"],
  "numbers": {
    "files": 6, "callers_outside": 27, "caller_files_outside": 9, "maybe": 3,
    "tests_reaching": 4,
    "cochange_missing": [{ "path": "src/auth.js", "count": 5, "of": 11 }],
    "risk": [{ "class": "auth", "at": "src/routes/orders.js:12" }],
    "risk_given": true
  },
  "line": "complexity: recommend /orc — 6 files · callers 27 in 9 files · maybe 3 · tests reach 4 · risk auth (src/routes/orders.js:12) · cochange src/auth.js x5 not in plan",
  "thresholds": { "caller_files": 4, "callers": 8, "cochange_min": 3 }
},
"facts": {
  "map": null,
  "impact": [{ "file": "src/orders.js", "confident_callers": 19, "caller_files": 7, "tests_reaching": 3 }],
  "cochange": [{ "file": "src/orders.js", "partners": [{ "path": "src/auth.js", "count": 5 }] }],
  "generation": 6
}
```

`facts` is `complexity.md` §1b's shape exactly; `map` is `null` here and the
lane fills it with the `map --focus` card it already has (DE: one paste). Both
keys are KEPT by `--brief` (`03` §2).

### 2.3 The line, exact grammar (`complexity.md` §3 owns the wording; the CLI prints it)

```
complexity: mini-ok — <files> files · confident callers <c> in <f> files[ · maybe <m>] · tests reach <t> · risk none · cochange none
complexity: recommend /orc — <files> files · callers <c> in <f> files[ · maybe <m>] · tests reach <t> · risk <class> (<at>)[, <class> (<at>)] · cochange <path> x<count> not in plan[, <path> x<count> not in plan]
complexity: mini-ok (graph off) — <files> files · risk <classes or none>
```

- `mini-ok` says `confident callers`; `recommend /orc` says `callers` — the two
  shapes as `complexity.md` §3 prints them today, unchanged.
- `maybe <m>` appears only when `m > 0`, after the callers, in both shapes.
- `risk none` when `risk_given` and the list is empty; `risk not given` when
  `--risk=` is absent (the lane appends the class itself in that case — the
  fallback for a 1.9.0 CLI is the same sentence).
- `cochange none` when `cochange_missing` is empty.
- The third shape is printed by the LANE (exit 3), never by the CLI.

`--risk=` grammar: `--risk=<class>[@<file:line>][,<class>[@<file:line>]…]`;
`class` is `[a-z][a-z0-9-]*`, `at` is copied as given (it comes from the
analyst's `facets.risk[]` evidence). An unparsable item is dropped and named in
`why[]` as `risk item ignored: <text>`.

### 2.4 Trace

`GRAPH-COMPLEXITY <verdict> :: files=<n> callers=<c> caller_files=<f> maybe=<m> tests=<t> risk=<k> cochange=<j> gen=<g>`
— a NEW verb, additive (trace.md gains one row; `/orc-retro` ignores unknown
verbs; `orc stats` reads `STATS` only). Mini's existing `GATE complexity :: <the
line>` stays as the gate line the lane emits after the user's choice.

### 2.5 One process, N operands

`impact --complexity` runs `graphCochange` per operand INSIDE the same process,
against the per-HEAD `cochange.json` (built once if stale). The W2 test counts
child processes: one `orc` process, at most two `git` calls (`rev-parse HEAD`;
`log` only when the cache is stale).

## 3. The spine text that moves

### 3.1 `orc-mini/SKILL.md` — "Code graph cache" step 3 (line 78 today)

Before: `3. **Phase 1, into graph_facts and the complexity line:** orc graph impact <declared_files> --if-enabled --json (ONE call) and orc graph cochange <each declared file> --if-enabled --json — NUMBERS, never a judgment (references/complexity.md).`

After: `3. **Phase 1, ONE call:** orc graph impact <declared_files> --complexity --risk=<facets.risk[] as class[@file:line],…> --if-enabled --json --brief. Its complexity.line IS the complexity line (print it VERBATIM; risk not given → append the classes yourself); its facts{} IS graph_facts (paste it, then set facts.map to the map --focus card). No complexity in the answer (a 1.9.0 CLI) → count as references/complexity.md §2 says.`

### 3.2 `orc-mini/SKILL.md` — "Complexity read" section (lines 135–147 today, 13 lines)

Keep: the heading, the sentence that the line is one line with numbers, the
OFFER sentence, the decision-log sentence, the trace sentence. Move OUT (they
are now the CLI's, quoted in `complexity.md` from the constants): the four
threshold clauses ("Recommend the full lane when ANY holds: …"), the `maybe`
clause, the `(graph off)` derivation. Net: 13 → 5 lines. The pin stays 280.

### 3.3 `orc-mini/references/complexity.md`

- §1 table: the two rows for `impact` and `cochange` become ONE row for
  `impact --complexity`, with its exits (0 · 1 · 3 · 4 as `impact`).
- §1b: "the CLI returns `facts` in this shape; `map` is filled by the lane".
- §2 "How to count": becomes "How the CLI counts", quoting the four constants by
  name and value, with the sentence *these numbers live in
  `bin/graph-signals.js`; change them there and here in the same commit*.
- §3 "The line": unchanged text, plus *printed by the CLI as `complexity.line`;
  the lane prints the third shape itself*.
- A contract row: `token: "COMPLEXITY_CALLER_FILES"`, files
  `["skills/orc-mini/references/complexity.md"]`, `binFiles: ["bin/graph-signals.js"]`,
  so the prose and the constant are renamed together.

### 3.4 `orc-quick/SKILL.md` and `references/look.md`

§1.4 above. `look.md` §3 ("what breaks") gains: *the blast-radius line is
`changes … --brief`'s `blast_line`, never assembled by hand*.

## 4. Tests (W2)

| Test | Asserts |
|---|---|
| `graph-signals.test.js` | `totals` sums; `tests_by_kind` strongest-wins; `blast_line` both forms byte for byte; `--files=` restricts rows and totals; the human `line` unchanged |
| `graph-complexity.test.js` | one test per threshold at the edge (3 vs 4 files; 7 vs 8 callers; a risk item; a cochange partner at 2 vs 3); `maybe` alone never trips; `--risk=` parse incl. one bad item; `why[]` order; `facts` shape; the `line` equals the string a test builds from `complexity.md` §3's grammar for the same numbers; one `orc` process |
| `graph-brief.test.js` | `complexity{}` and `facts{}` survive `--brief` |
| `goldens.test.js` | `impact` and `changes` WITHOUT the new flags equal the W0 goldens |
