# Improvement plan — `orc graph` v1.8.2 (the map that finds what a grep cannot)

Written 19-09-2026 in Simplified Technical English. Builds ON the released
1.8.0/1.8.1 engine (`graph@4`, `RESOLVE_SCHEMA 2`). It does not replace it.
Evidence it stands on: `summary.md`, `findings/EW8-TOKEN-VERDICT.md`,
`findings/R3-results.md`, `findings/W9-eval.md`, `04-cbm-analysis.md`, and the
outside references in §12.

> **Status: PLAN ONLY. Nothing is built.** Decisions DE-A … DE-K (§10) are open.
> Version target: **1.8.2** (`npm version patch`, as the user asked; CLAUDE.md
> would call a new capability a minor — the user's instruction wins and the
> CHANGELOG says so in one line).
> Rules that stay in force: branch `feat/orc-graph-2`, never commit on `main`,
> never push unless asked, never stage the notes folders, pause every two waves,
> `npm run verify` + `npm test` green at every pause, ASD-STE100 in docs.

---

## 0. The problem, in four lines

1. **The map is silent where agents need it most.** R3-C: 11 route-level tests
   that break were declared absent. A caller that reaches a symbol through a URL,
   a decorator, a base class, an instance variable or a barrel re-export has
   **no edge**. The file still reads `coverage: full`. This is the one defect
   that made an agent write a false sentence.
2. **Tool calls are paid, tokens are not.** EW8: a perfect locator saves 0.1% of
   a run. But every `Read` the noter makes, every Grep a card could have
   answered, and every planner Glob is a **round trip**. CodeGraph's benchmark
   (§12) cut tool calls 88% on question sessions; the ceiling in ORC's code
   lanes is smaller, but it is a real number and it is not zero.
3. **The paid layer is paid badly.** A notes batch is ~40K tokens (R5): ~5.7K
   fixed start-up, then one `Read` per symbol. Half of those symbols already
   have a docstring the parser could have copied for free.
4. **Only seven languages, one borrowed parser.** Ruby, Rust, Kotlin, Swift,
   C/C++, Vue and Svelte are `excluded`. TypeScript is read by regex while the
   project's own `node_modules/typescript` sits unused.

**What this plan does NOT promise, stated first.** The graph is not a token
optimisation and cannot become one (EW8 §1: searches are 0.06% of a session).
Every token line below is a **cost the graph itself adds and can cut** —
cards re-sent every turn, noter dispatches — never a claim about the bill.
CodeGraph's own benchmark records the trap: graph answers left **80% more
retrieval context resident** at session end than grep-and-read. Every new
output in this plan is budget-capped and measured against that.

---

## 1. The design in one screen

```
 THE MAP (0 tokens, CLI)                                DELIVERY (fewer round trips)
 ┌─────────────────────────────────────────────┐        ┌───────────────────────────────────────────┐
 │ G1 ROUTE edges  url literal → route symbol  │        │ D1 ctx --source   card + the range text    │
 │    (+ mounts, + decorators, 6 frameworks)   │        │    one call, no Read  (budget-capped)       │
 │ G2 ALIAS        x = new S(); x.run() → S.run│        │ D2 ctx --for-slice the OUTSIDE view only    │
 │ G3 INHERITED    this.m() → Base.m           │        │    (declared files are read whole anyway)   │
 │ G4 barrels      export * from / __init__    │        │ D3 hook: Bash-search hint · whole-Read hint │
 │ G5 mask fixes   `${}` · f"{}" · JSX         │        │    · dedupe against slice cards             │
 │ G6 5 languages  rb rs kt vue svelte c/cpp   │        │ D4 orc graph map  ranked repo map, budgeted │
 │ G7 borrowed TS  node_modules/typescript     │        │    (planner / analyst orientation)          │
 │    borrowed Go  go/parser via `go run`      │        │ D5 update --notes  one call, not two        │
 │ G8 code_graph_ignore + default skips        │        └───────────────────────────────────────────┘
 └─────────────────────────────────────────────┘
 THE PAID LAYER (notes)                                  MEASUREMENT (free first, paid last)
   N1 doc notes: docstring/JSDoc → note, 0 tokens          M1 fixtures with answer keys (route, alias, barrel, base)
   N2 notes pending --with-source: 1 call, not N Reads     M2 replay: tool calls the new edges would answer
   N3 batch across waves; Haiku variant behind a gate     M3 round 4: 12 blast-radius questions, OFF/ON ×3
 THE GAIN METER (§3b — like `rtk gain`, paid vs avoided, the avoided half labelled an ESTIMATE)
   K1 gain.jsonl: every read writes paid tokens + what the ladder would have cost instead
   K2 `orc graph gain [--history] [--run] [--measured]`  K3 the orc ui Knowledge card + one ship-summary line
 BACKWARD COMPATIBILITY (§9): graph@5 re-extracts itself once at the next preflight; notes survive;
   JSON is additive; exit codes unchanged; a 1.8.1 payload with a 1.8.2 CLI still works.
```

---

## 2. G — the map finds what a grep cannot (code is not missed)

Engine `graph@5`, `heuristic@5`, `RESOLVE_SCHEMA 3`. Every item below adds a
record field or a resolution rung. **Every item has a fixture with an answer
key** (M1) and a rule in `_shared/code-graph.md` §2.

### G1 — ROUTE edges (fixes R3-C)

**What the parser records.** In `graph-extract.js`, beside `calls`, a per-symbol
`urls[]`: every string literal that starts with `/` and is the first (or the
URL) argument of an HTTP-shaped call:

| Shape | Method | Languages |
|---|---|---|
| `x.get("/p")` `x.post` … `x.del` | the verb | js/ts (supertest, axios, fetch wrappers, `request(app).get`), py (`client.get`, `requests.post`), go (`http.Get`) |
| `fetch("/p", {method: "POST"})` `axios("/p", {method})` | from the options within 200 chars, else `ANY` | js/ts |
| `http.NewRequest("GET", "/p", …)` `httptest.NewRequest` | first arg | go |
| `BASE + "/p"` `f"{base}/p"` | suffix (prefix unknown) | all |

**Mounts.** `app.use("/orders", ordersRouter)` (Express/Koa/Fastify
`register(…, {prefix})`), Flask `Blueprint(url_prefix=)`, FastAPI
`include_router(prefix=)`, Nest `@Controller("orders")`, Spring
`@RequestMapping("/orders")` on the class, Laravel `Route::prefix`. Recorded on
the `<module>` (or class) symbol as `mounts: [{prefix, target}]`, where `target`
is an import binding or the class itself.

**Decorator routes.** Today only `router.get("/p", handler)` becomes a `route`
symbol. Add: Python `@app.get("/p")` `@router.route("/p", methods=[…])`
`@api_view` + `path("p/", views.x)` (Django), Nest `@Get(":id")`, Spring
`@GetMapping("/p")` `@RequestMapping(method=)`, Laravel `Route::get('/p', [C::class, 'm'])`
+ `#[Route]`, Go `r.HandleFunc("/p", h)` `mux.Handle` gin `r.GET` echo `e.GET`
chi `r.Get`. A decorated function keeps its own symbol and gains
`route: "GET /p"`; a `route` alias symbol `GET /p` points at it (`handler: id`),
so `orc graph ctx "GET /orders/:id"` and `ctx OrdersController.find` both work.

**Resolution** (`graph-query.js`, new `resolveUrl`). Candidates are `route`
symbols. Full path = mount prefix + route path when the route file (or class) is
mounted exactly once; else the bare route path. The route path becomes a
pattern: `:id` `{id}` `<id>` `<int:id>` `[id]` → `[^/]+`, `*` → `.*`, trailing
slash optional, query string stripped from the URL. Order: exact full-path match
→ suffix match (the URL ends with the pattern, for `BASE + "/p"` and for an
unknown mount). One candidate → state **`ROUTE`** (confident). Several →
`AMBIGUOUS`, all listed. None → `UNRESOLVED`.

**Where it shows.** A card line `← reached via  GET /orders/search  tests/orders.test.js:27  ROUTE`.
`impact` follows ROUTE edges. `changes` counts them in fan-in and in `tests`.
The `tests` line lists a test that reaches a route. `resolved.json` stores them
in `callers` with the ref flag `2` (0 call · 1 ref · 2 url), so the cache format
is additive.

**The answer to R3-C, as a test.** On the Express fixture:
`ctx searchByItemPrefix --depth 2` lists `GET /search` at depth 1 (IMPORT) and
`tests/orders.test.js` 14 times at depth 2 (ROUTE), and `impact
src/stores/orderStore.js` names the test file. The false sentence can no longer
be written from the card.

### G2 — instance aliases (`x = new Service(); x.run()`)

Nest measured 118 `maybe` callers on one symbol from this alone (knowledge
§4z.28.8). Per scope (a symbol's body, else the module) the extractor records
`aliases: {local → ClassName}` from:

| Shape | Languages |
|---|---|
| `const x = new S(…)` `x: S = …` `let x: S` | js/ts |
| `constructor(private readonly x: S)` (param properties) · class fields `x: S;` `x = new S()` | ts |
| `x = S(…)` `x: S = …` `x: S` (annotation) · `self.x = S(…)` | py |
| `x := S{…}` `x := &S{}` `var x *S` `x := NewS(…)` (→ `S`) | go |
| `S x = new S(…)` `var x = new S(…)` `S x;` (fields, params) | java, cs |
| `$x = new S(…)` `private S $x` | php |

`normCall` rewrites the head: `x.run` with alias `x → S` becomes `S.run` with
`alias: true`. The existing class-qualified rung (`byClass`) then resolves it
LOCAL / IMPORT / UNIQUE as it does for `S.run` written out. The state word does
not change; the card marks `(via x)`. A local variable that shadows an alias
inside a nested scope wins for that scope.

### G3 — inherited members (`this.m()` → `Base.m`)

Class symbols gain `bases: [names]` (`extends`, `implements`, Python bases, PHP
`extends`/`use Trait`, Java `extends`/`implements`, C# `: Base`, Go struct
embedding is out of scope). A `self` call with no local member walks the base
chain (depth ≤ 4, cycle-safe): resolve the base by name with the ordinary rungs,
look for `Base.m`, and return the base's own state plus `inherited: true`.
`super.m()` / `super().m()` / `parent::m()` / `base.m()` resolve the same way,
one level up. `impact` and `changes` count inherited callers.

### G4 — barrel re-exports

Extractor records `reexports: [{from, names | "*"}]` for `export * from`,
`export {a as b} from`, `module.exports = require(…)`, `exports.a = require(…).a`,
and every import in a Python `__init__.py` (plus `__all__` when present). The
IMPORT rung, on a miss in the target file, follows re-exports (depth ≤ 3,
cycle-safe) to the defining file → `IMPORT`. Before this, `import {x} from "./index"`
fell to `UNIQUE` (right by luck) or `AMBIGUOUS`.

### G5 — mask fixes (calls the mask hid)

`mask()` blanks the inside of a template literal, so `${fn()}` is not a call.
Fix: keep `${ … }` spans as code (nested braces balanced). Same for Python
f-string `{…}` and for JSX attribute expressions `attr={fn()}`. A regex literal
after `(`, `,`, `=`, `return` is masked as a string (today a `/` there can
open a bogus comment). Each fix is a golden case in `graph-extract.test.js`.

### G6 — five languages (heuristic rung)

| Language | Declarations | Imports | Routes / notes |
|---|---|---|---|
| Ruby `.rb` | `def` `class` `module` (indent-free: `end` matching by keyword depth) | `require` `require_relative` | Rails `get "/p", to: "c#a"` → route with `handler` `C#a` |
| Rust `.rs` | `fn` `impl T { fn }` `struct` `enum` `trait` `mod` | `use a::b::{c}` | axum/actix `.route("/p", get(h))` |
| Kotlin `.kt` `.kts` | `fun` `class` `object` `companion` | `import` | Ktor `get("/p") { }` |
| Vue `.vue` / Svelte `.svelte` | the `<script>` block only, as js or ts | as js/ts | offsets keep the file's real line numbers |
| C/C++ `.c .h .cc .cpp .hpp` | functions at column 0 with a body, `class`/`struct` members | `#include "x.h"` (relative only) | — |

Swift, Scala and Dart are **not** in this wave (DE-F). The gate per language:
on a real repository (≥ 200 files) the parser marks < 5% of files `partial`,
and the fixture's answer key resolves 100%.

### G7 — borrowed toolchains (exact where the project already has the tool)

The Python `ast` rung proved the pattern: one batch, exact ranges, no dependency
for ORC. Two more rungs, same contract (`extractor` field names them, `ORC_GRAPH_NO_BORROW=1`
forces the heuristic, any failure falls back per file):

- **TypeScript AND JavaScript via the project's own `node_modules/typescript`.**
  `require(path.join(root, "node_modules", "typescript"))` in-process; `ts.createSourceFile`
  only (no type checker, no `Program` — it must stay fast). A walker emits
  functions, classes, methods, arrow consts, decorators (Nest routes for G1),
  `extends`/`implements` (G3), constructor param properties (G2), imports,
  exports and re-exports (G4), calls (`CallExpression`/`NewExpression` callee
  text), and `new` aliases. `.js` files are parsed with `ScriptKind.JS` when
  the package is present, so a TS project gets exact JS too. Tag:
  `typescript@<version>`.
- **Go via `go/parser`.** A ~120-line Go program (a string in the extractor, like
  `PY_AST`) written once per CLI process to the OS temp dir and run with
  `go run` over the batch (stdin JSON in, JSON out). Emits decls with receivers,
  calls, imports, struct embedding names. Tag: `go-ast@<go version>`.
- Java (JDK single-file launch), PHP (`php -r` + `token_get_all`), Ruby
  (`ruby -e` + `Prism`) are **DE-G** — each is a wave of its own only if the
  heuristic's measured partial rate on a real repo is > 5%.

Gate per rung, on nestjs/nest and on a Go repo (≥ 300 files): confident
resolution rate up by ≥ 10 points against the heuristic on the same tree, partial
rate down, and the fixture answer keys unchanged. A rung that does not meet its
gate is not shipped and the finding says why.

### G8 — `code_graph_ignore` and default skips

The key exists in the engine and not in config (knowledge §4z.28.7). Wire it:
`code_graph_ignore` (list of globs, default `[]`, `lanes: []`, `gated_by: code_graph`).
Extend `ALWAYS_SKIP` with `vendor/`, `dist/`, `build/`, `.next/`, `.nuxt/`,
`__pycache__/`, `*.generated.*`, `*.d.ts` (declarations duplicate every symbol
and make each one `AMBIGUOUS`), `*.bundle.js`. A skipped file is `excluded` in
`coverage`, never silent.

---

## 3. D — fewer round trips (delivery)

### D1 — `orc graph ctx … --source [N]` (the card and the range in one call)

CodeGraph's one-call `codegraph_explore` returned verbatim source and reached
**zero file reads** on seven repos. ORC's equivalent: after the card, print the
target symbol's line range (≤ `N` lines, default 80, hard cap 200) as a fenced
block with line numbers, and for a file card the first 40 lines. Charged
against the same `--budget`; the footer says `source 62 lines` and what it cut.
JSON gains `source: {file, from, to, text}`.

Rules that keep it safe:
- **A file you will EDIT is still read in full with `Read`, first** (read
  ladder exception 1 — an `old_string` from a CLI print is the same corruption
  bug as one from an outline). `--source` is for the CALLER'S range, the
  callee's range, the neighbour you will not edit.
- The hook never prints source. `--source` is a CLI answer to a CLI call the
  agent made; the injection rule (§4b) is unchanged.
- The noter (N2) is the first consumer; the executor ladder step 3 is the second
  (`ctx <caller> --source` replaces "Read the ±40 lines around the anchor").

Gate (M2/M3): in round 4 the ON runs make fewer `Read` calls than OFF at equal
quality, and the resident context at session end grows by less than the reads
it replaced (the CodeGraph caveat, measured, not assumed).

### D2 — `ctx --for-slice <declared files…>` (the outside view)

The executor reads every declared file in FULL before editing it (exception 1).
A file card for a declared file therefore repeats what the executor is about to
read, on every turn. What the executor cannot see from inside the file is the
**outside**: who imports it, who calls its exported symbols from elsewhere,
which tests reach it (now including ROUTE), which route mounts it. `--for-slice`
prints only that — one block per declared file, tree format, sorted by
importance — and omits the symbol table. It also writes the names it showed into
the run's `graph-hook-seen.json` so the PreToolUse hint never repeats them (D3).
`phases/execution.md` step 4 switches to it. Gate: like-for-like the slice
block is ≥ 30% smaller than today's file cards on the fixture and on django, and
round 4 shows no loss in direct-caller recall.

### D3 — the hook: two more hints, and no double payment

Verified on the Claude Code hooks reference (§12): `SubagentStart` and
`SubagentStop` matchers filter by **agent type**, `PreToolUse` and `PostToolUse`
carry `additionalContext`, `agent_id`/`agent_type` are present inside a
subagent, a `PreToolUse` timeout never blocks. `updatedInput` exists and **this
plan never uses it**: rewriting an agent's `Read` into a range read is the
corruption bug exception 1 forbids, and the read gate stays the only layer that
may touch a read.

- **Bash searches** (DE5 from plan 05, now taken): `PreToolUse` matcher gains
  `Bash`; the hook acts only when the command starts with `grep`, `rg`,
  `git grep`, `findstr`, `Select-String`, `ag`, `ack` and takes the longest
  identifier from the first quoted argument. Same `names.json` lookup, same
  budget, same once-per-run dedupe.
- **Whole-file Read of a wide file:** `PreToolUse` on `Read` when the input has
  no `offset`/`limit`, the file is indexed, and it has ≥ 8 symbols: one line
  with the top 6 symbols by importance and their line ranges. The read still
  runs (the hook never blocks). It makes the NEXT read a range read. Off by
  default until M3 shows it changes read shapes (`code_graph_hooks: on |
  update-only | off` gains the value `read` as a fourth: `on,read`).
- **Dedupe:** the seen file gains the slice-card targets (D2) and the
  `SubagentStart` line drops the "run ctx before a Grep" sentence when the agent
  received a `--for-slice` block (the hook can see the run's seen file).
- The matchers are re-wired by `orc update` exactly as today (`wireGraph`
  is idempotent; a 1.8.1 `settings.json` gains one entry and keeps four).
  `orc doctor graph-hook-unwired` counts five.

### D4 — `orc graph map` (a ranked repository map, budgeted)

Aider's repo map (§12) is the reference: a file graph, edges from a referencing
file to a defining file, **personalized PageRank** biased toward the files and
identifiers in the request, and a binary search over the token budget. ORC has
the edges already (`resolved.json` callers + importers), so:

`orc graph map [--focus <files or names…>] [--budget 1000] [--if-enabled] --json`
- nodes = files; edge weight = `sqrt(confident edges)` between the pair;
  `--focus` files get `100/n` personalization; a focus NAME adds its defining
  files; test files ×0.1; a file whose every symbol is private ×0.5.
- output: `file  sym:12-40 E · sym:44-80 · …` per file in rank order, the symbol
  list cut by importance, the file list cut by rank until the budget fits
  (binary search on rows, like Aider). `has_more`, `generation`.
- cached per generation in `map.json` (PageRank on 3K files is milliseconds; the
  file is small).
- consumers: `phases/planning.md` (once, with the request's mentioned files as
  focus, before `impact`), the analyst's orientation step, `/orc-quick` Q1 look
  when the request names no file. Trace verb `GRAPH-MAP`. `orc lane calls` row
  `graph-map`, lanes `orc`, `orc-diy`, `orc-quick`.

It replaces the planner's first Glob-and-Read sweep, which is the biggest
`Read` share in lane runs (EW8: `Read` is 3.28% there, and planning is where
whole-file reads cluster). Gate: M2 counts the planning-window Glob/Read calls
a map could answer; ship only if ≥ 3 calls per run on the fixture set.

### D5 — one call at a wave close

`orc graph update --notes-pending --files <paths> [--at wave|end] --if-enabled --json`
runs the update and the pending computation under one process and one lock, and
returns both objects (`update`, `notes`). The two-call form stays (backward
compatible); the phase files use the one-call form. One fewer round trip per
wave, per smoke gate, per `/orc-quick` request.

---

## 3b. K — the gain meter (`orc graph gain`, and the card in `orc ui`)

The user's question: can ORC show what the graph saves, the way `rtk gain` and
caveman do? **Yes, and every number can be computed for free** — but only if
the meter keeps the two halves apart that EW8 taught us to keep apart:

| Half | What it is | How it is known |
|---|---|---|
| **paid** | the tokens the graph PUT INTO a context: every card, every `--source` block, every hook hint, every `map` | **recorded** — the CLI counts what it printed with the same `tok()` the budget uses; the hook counts what it injected |
| **avoided** | what the read ladder would have cost for the same question, had there been no graph | **an estimate, a counterfactual** — the same method `rtk gain` uses (raw output minus filtered output), and the same method `eval/graph-replay.js` already uses at zero tokens |
| **measured** | what runs with the graph on actually did, against runs with it off, in this project's own history | **recorded**, joined from ORC traces and Claude Code's usage transcripts, exactly as `orc budget` already joins them (`transcriptDir()` in `bin/cli.js`) |

`rtk gain` prints one saving because a filtered command output has one exact
raw size. A graph card does not: the alternative to `ctx OrderService.create`
is a Grep and then a read, and how much read is a guess. So the meter prints
**a range, never one number**, and it never prints a percent of the session
(EW8 §1: that percent is a tenth of one percent, and printing it would make
the meter lie by omission).

### K1 — the ledger (`.claude/orc/graph/gain.jsonl`)

Every read command (`ctx`, `impact`, `path`, `changes`, `map`, `notes pending
--with-source`) appends ONE line after it answers. Append-only, torn-line
tolerant, compacted by `gc` to the last 5,000 rows, never under the lock (a
reader stays lock-free; `appendFileSync` of one line is atomic enough on both
platforms, and a torn line is skipped like `notes.jsonl`'s). No config key: it
is written only while `code_graph` is on, into a folder the graph already writes.

```
{"at":"19-09-2026 10:41:02","cmd":"ctx","targets":["OrderService.create"],"run":"<trace name or null>",
 "agent":"orc-executor-sonnet-5-high|null","gen":42,"ms":412,
 "paid":{"card":318,"source":0},
 "avoided":{"low":1140,"high":9280,"calls_low":2,"calls_high":3},
 "basis":{"files":[{"path":"src/services/order.js","tokens":9200,"lines":412}],"grep_hits":14}}
```

`agent` comes from `CLAUDE_AGENT_TYPE` when Claude Code sets it, else null.
`run` is the trace pointer the hook already reads (`<log_dir>/.current`).

### K2 — the counterfactual, per command (the rules are written down so the number can be checked)

| Command | `avoided.low` — the ladder done well | `avoided.high` — the ladder done badly (the common case, W9: 1,077 whole-file reads against 139 searches) | calls |
|---|---|---|---|
| `ctx <symbol>` | one Grep for the name (hits × 120 chars; the hit count is `callIndex` — the graph knows exactly how many lines name it) + ONE 80-line range read of the target (real average line length of that file) | the same Grep + a whole-file read of the target file + a whole-file read of ONE caller file (the largest) | low 2 · high 3 |
| `ctx <file>` (file card) | an outline read (first 60 lines) | a whole-file read | 1 · 1 |
| `ctx … --source` | the range read it replaced, exactly (same lines, same file) — this half is **not** an estimate | the same | 1 · 1 |
| `impact <files>` | one Grep per exported symbol in the files | the Greps + a whole-file read of every caller file listed | n · n + files |
| `path a b` | 2 Greps + 2 range reads | 2 Greps + whole-file reads of both ends | 4 · 4 |
| `changes` | `git diff` the reviewer already reads (0) + one Grep per touched symbol | the Greps + a whole-file read of every caller file | n · n + files |
| `map` | one Glob + an outline read of each file shown | one Glob + a whole-file read of each file shown | 1 + n · 1 + n |
| hook hint (PreToolUse) | 0 — the search still runs | a range read the anchor saved (80 lines) | 0 · 1 |
| hook coverage note (PostToolUse) | 0 | 0 (it adds, it saves nothing; it is listed as paid only) | 0 |

`paid` is exact. `avoided.low` is the floor a careful agent would have spent.
`avoided.high` is what W9 measured agents actually doing. The truth is between,
and the meter says so on its last line every time.

**Carry.** A card is re-sent on every later turn of the agent that received
it — and so is the read it replaced. Both halves carry the same multiplier, so
the comparison at first entry is fair, and the meter reports first-entry
tokens only. `eval/graph-replay.js` explains the multiplier; the meter's `--json`
carries `carry_note` pointing at it.

### K3 — `orc graph gain`

```
orc graph gain                      # this project, all time
orc graph gain --run <name>         # one run (the trace name)
orc graph gain --since 7d           # a window
orc graph gain --history [--limit 40]   # one row per call, newest first (rtk gain --history)
orc graph gain --measured           # the recorded A/B from this project's own runs (below)
orc graph gain --reset              # empty the ledger (asks; --yes skips)
orc graph gain --json
```

The chat shape, in the CLI's own styling kit (`bin/ui.js`):

```
graph gain — this project · 41 calls · 6 runs · gen 38–42
  paid        4,912 tokens   (cards 4,120 · source 610 · hints 182)
  avoided    ~18.9K – 71.4K  tokens   (estimate — the read ladder done well … done badly)
  net        ~14.0K – 66.5K  tokens · ~58 – 113 tool calls
  by command  ctx 29 · impact 6 · changes 4 · map 2   |   hints 11 injected · 3 read notes · 9 hook updates
  measured    6 runs ON vs 4 runs OFF (last 30 days): executor Read+Grep+Glob calls  median 31 → 19 (−39%)
              executor tool-result tokens  median 41.2K → 27.9K   ·   session total  ±0% (inside the 34% spread)
  an estimate of avoided RETRIEVAL, never a bill — searches are 0.06% of a session (eval/graph-replay.js)
```

Exit codes: 0 rows · 1 no ledger (`graph gain: no calls recorded yet`) · 3 off
(with `--if-enabled`). `--json` carries `paid`, `avoided: {low, high}`,
`calls: {low, high}`, `by_command`, `hints`, `measured`, `estimate: true`,
`generation_range`, and `line`.

### K4 — `--measured`: the recorded A/B that costs nothing

`orc budget` already joins ORC traces with Claude Code's usage transcripts
(`transcriptDir()`, the run's time window, the subagent windows). The trace of
every run says whether the graph was on: the `GRAPH-CONSULT` line is `off` or
a state. So `--measured` groups this project's runs into ON and OFF, and for
each group reports per run, medians with min–max and N, **executor windows and
session totals kept apart** (R4: the main session is 74–80% of a run and the
graph never touches it):

- executor `Read` + `Grep` + `Glob` calls, and their tool-result tokens
- executor `Bash` searches (grep/rg) — the D3 Bash hint's own target
- `graph_used` present / `none` (from the trace `RETURN` lines) — proof of use
- `GRAPH-HINT` counters per run
- session total tokens, printed with the OFF spread beside it, so nobody reads
  −1.8% as a result (W9 round 2)

It needs ≥ 3 runs in each group before it prints a median; below that it
prints the rows and `too few runs to compare`. It never compares runs across
projects, and it never compares a lane against a different lane.

### K5 — the `orc ui` card and the ship line

- **Knowledge panel, the code graph card** gains a `gain` strip: `paid 4.9K ·
  avoided ~19K–71K (est.) · 41 calls`, and a fold-out table with the same
  rows as the CLI. `/api/graph/gain` → `["graph", "gain", "--json"]` (a read
  whose exit code is data, like `/api/graph`). `--measured` is a second button
  (`/api/graph/gain/measured`) because it reads transcripts and takes longer.
  Fixture: `fixtures/knowledge.js` gains `graphGain` and `graphGainMeasured`.
  i18n: `en/knowledge.json` + `id/knowledge.json` gain the keys. Rule from
  `claude-rules/07-orc-ui.md`: the panel never runs a lane and never invents a
  number — the strip renders exactly the CLI's JSON, and the "estimate" word is
  part of the string, never a tooltip.
- **One line at ship** (the summary phase of `/orc`, `/orc-ultra`, `/orc-diy`;
  the smoke-gate close of `/orc-mini`, `/orc-fast`; the request close of
  `/orc-quick`): the `line` of `orc graph gain --run <this run> --if-enabled --json`,
  copied verbatim. Trace verb `GRAPH-GAIN paid=<n> low=<n> high=<n> calls=<n>`.
  It is one line, once per run, so the spine budgets move by one line each
  (deliberate, commented in `verify-contracts.js`) — DE-M decides whether the
  single-executor lanes carry it.
- `orc stats` gains a `graph` column: calls · paid · avoided range per run.
  `orc aftermath` reads nothing new (a saving is not an outcome).

### K6 — what the meter must never do

- Never print a percent of the session. The only percent it prints is the
  measured executor-window delta, with N and the spread beside it.
- Never count a hook coverage note as avoided anything.
- Never count a card the agent's return marked `graph_used: none` as avoided
  (K4 subtracts those calls from the ON group's count when the trace has the
  return; the ledger row gains `used: false` at ship when the lane reconciles).
- Never write the ledger from the hook's `PreToolUse` path in a way that can
  block: the hook appends after it has already emitted, inside its own
  fail-quiet wrapper, and a failed append is silent.

---

## 4. N — the paid layer, paid less

### N1 — doc notes at 0 tokens

The extractor already masks comments and knows every symbol's start line. It
now captures the docstring / JSDoc / `///` / `#` block immediately above (or,
for Python, immediately inside) a `function`/`method`/`route`: first sentence,
whitespace-collapsed, ≤ 240 chars, tagged `doc`. `notes pending` skips a symbol
that has a `doc` note, so the noter is dispatched only for undocumented code.
The card prints `doc  <sentence>  (parser · current)` with the same body-hash
rule as a model note; the precedence line places `doc` beside `graph notes`
(both below stale wiki — a comment can lie). A model note, when present,
outranks the doc note for the same symbol. Measured on django: expect > 60% of
symbols to carry a `doc`.

### N2 — `notes pending --with-source`

Returns each pending row with its line-range text (the D1 machinery, per row
cap 120 lines, batch cap `code_graph_notes_cap`). The noter makes **one** CLI
call instead of N `Read` calls, and its agent definition step 2 becomes one
line. Fixed cost per batch drops from `5.7K + N reads` to `5.7K + 1 call`.

### N3 — batching and the Haiku variant

- `--at wave` batches that are `below-min` roll forward: pending is recomputed
  from hashes, so nothing changes in the store — but the lane now prints
  `graph notes: 3 pending, waiting (min 5)` once per run instead of once per wave.
- `orc-graph-noter-haiku-4-5` (D5, never tested). Ship behind
  `code_graph_notes_model: sonnet | haiku` (default `sonnet`, unchanged) only if
  a blind 30-symbol comparison on the fixture set scores Haiku within one
  rejected note and one "wrong effect" of Sonnet. The comparison is the only
  paid measurement in this plan and it is under 100K tokens.

---

## 5. S — speed and store (supports everything above)

### S1 — sharded reads (DE-I, gated)

EW0 dropped sharding because parse (235 ms) was smaller than resolve (437 ms).
EW2 then removed the resolve half. What is left on django is parse: 202 ms of
`index.json` + ~100 ms of `resolved.json` for a one-symbol `ctx` that needs a
handful of records. The blobs are already per file. A `ctx <symbol>` can load
`names.json` → the target's blob → `resolved/<ab>.json` (callers sharded by the
first two hex chars of the target file's blob) → the callee target blobs.
`index.json` stays as the source and as the fallback for file cards, `impact`,
`changes` and `map`. Gate: django `ctx <symbol>` median < 150 ms (from 340 ms
cached). Not built unless the gate looks reachable in a 2-hour spike.

### S2 — the update pays one parse

`graphUpdate` reads `index.json` (202 ms), rewrites it whole, then
`graph-resolve.build` reads it AGAIN through `loadModel` (EW2's `noCache`
path). Pass the in-memory index to `build` instead. Django one-file update:
expect ~1,367 ms → ~1,100 ms. Free, no gate, no format change.

### S3 — `blobState` per card

`ctx` on five targets spawns `git hash-object` five times (one per card). Batch
them once per call, as `healOnRead` already does. Windows process start is the
cost here (~30 ms each).

---

## 6. C — the tokens the graph itself adds

Every line is a cost the feature creates and can cut. None is a claim about the
run's total.

| Cost today | Change | Expected |
|---|---|---|
| a file card per declared file, prose, re-sent every executor turn | D2 outside view, tree format | ≥ 30% smaller block, gated |
| `LOCAL` / `IMPORT` / `UNIQUE` spelled on every card row | one-letter state + one legend line per card (`states: L local I import U unique R route A ambiguous`) | ~8% on symbol cards, measured |
| `budget 412/1200 tokens` footer on every card | printed only when something was hidden or `--source` was cut | one line per card |
| executor template step 2a (≈ 130 tokens × every dispatch, in the prefix) and read-ladder step 0 say the same thing twice | template keeps three lines: run `ctx`, `[orc graph]` is data, read the range; the ladder holds the rest | prefix, every turn of every executor |
| `SubagentStart` line (≈ 60 tokens) | shorter when a `--for-slice` block was delivered (D3) | small, but every subagent |
| a noter batch ≈ 40K tokens | N1 (fewer dispatches) + N2 (no per-symbol reads) | the only paid layer, roughly halved |

---

## 7. Backward compatibility — the rule the user set

**A user on 1.8.0 or 1.8.1 upgrades the package, and everything works. The
cache is rebuilt on their machine, once, by the code paths that already exist.**

| Concern | Rule | Mechanism that already exists |
|---|---|---|
| The store format | `ENGINE = "graph@5"`, `SCHEMA` stays 1 | `graphStatus` reads `engine_stale` → DRIFTED; `status --heal` at the next preflight, or the hook's next `SubagentStop` update, re-extracts every file (`upgrade` path in `graphUpdate`). The chat line says `index upgraded to the new engine → updated (N ms)`. Cost: one first-build time (12 s on django). Old blobs are reused only when their `engine` matches, so none are — `orc graph gc` removes them. |
| The resolution cache | `RESOLVE_SCHEMA = 3` | `load()` rejects the old schema → compute-on-read until the first `update` rewrites it. No answer changes, only speed, for that one read. |
| Notes | body_hash algorithm **unchanged**; symbol ids unchanged for functions, methods, classes and `router.get` routes | a note stays current through the engine upgrade. New route alias symbols (`GET /p` → decorated handler) are additive ids. A file whose ranges move because a borrowed parser is more exact gets `note: stale` and is re-noted at the next batch — stated in the CHANGELOG. |
| JSON contracts | additive fields only (`urls`, `aliases`, `bases`, `reexports`, `doc`, `source`, `inherited`, `alias`, `mounts`, `handler`, `map`) ; one new state word `ROUTE`; no field renamed; every exit code unchanged | a 1.8.1 lane text that parses `card`, `line`, `trace`, `generation` still finds them |
| CLI flags | every 1.8.1 flag keeps its meaning; new flags are opt-in (`--source`, `--for-slice`, `--with-source`, `--notes-pending`, `--focus`) | `orc graph ctx a b c` still prints five prose cards |
| Config keys | `code_graph_ignore: []` · `code_graph_notes_model: sonnet` · `code_graph_hooks` gains values but `on` means what it meant (Bash hint included — DE-C decides) | 94 → 96 keys; golden + counts + orphan list move together (`test/goldens/config-keys.json`, `config.test.js`, `lane.test.js`, `goldens.test.js`, `bin/verify-contracts.js`) |
| The hook | one file, same name, same fail-quiet contract; `orc update` re-wires `Bash` and `Read` matchers idempotently | `wireGraph()` keeps the four existing entries and adds one; `orc doctor` names a missing one |
| A 1.8.1 PAYLOAD with a 1.8.2 CLI (the user ran `npm i -g` but not `orc update`) | works: the old skill text calls the same commands with the same flags and exits; the old hook shells out to the new CLI with `update --if-enabled --json` | the new lane text (D2, D4, D5) needs `orc update`, and the CHANGELOG says so as it does today |
| A 1.8.2 PAYLOAD with a 1.8.1 CLI (a global install behind a project) | `orc doctor` already reports version drift; the new flags are ignored by an old CLI with `unknown` positional errors on `map` only — `--if-enabled` calls exit 1, never block a phase | stated as a known limit |
| `orc ui` | `/api/graph` gains fields; the card renders them when present and renders as today when absent | fixture updated; `orc-ui-wiki.md` updated |
| The gain ledger | absent on a 1.8.1 store; `gain` prints `no calls recorded yet` (exit 1) and the UI strip shows an em dash, never a zero saving; the first read after the upgrade starts it | no migration; `gc` compacts it; `--reset` empties it |
| `--measured` on old runs | a 1.8.1 trace has the same `GRAPH-CONSULT` line, so runs made before the upgrade join the ON/OFF groups as they are | no trace format change |

**The migration test** (`test/cli/graph-upgrade.test.js`): a frozen 1.8.1 store
(`test/goldens/graph-1.8.1/` — `meta.json`, `files.json`, `index.json`,
`resolved.json`, `names.json`, `notes.jsonl`, generated NOW from the Express
fixture with the 1.8.1 CLI and committed as a golden) is copied into a temp
project; `status` reads `drifted` + `engine_stale: true`; `status --heal`
returns `built`/`updated` with `engine_upgrade: true`; every note whose symbol
still exists is `current`; `ctx` answers are byte-identical to a fresh build.
It runs on every `npm test`.

---

## 8. Waves

Pause every 2 waves. Core = W1–W4b + W9 (the gain meter is core: without it
the user cannot see what the rest did). W5–W8 are extensions with their own
decisions; the user can stop after any pause and still ship 1.8.2. The pause
after W4 moves to after W4b.

**Baseline, measured 19-09-2026 on the 1.8.1 tree:** `npm test` = **1022 passed,
0 failed, 65 files** (534 s on this machine). Every pause holds that count or
raises it; a wave that removes a test says which one and why.

| Wave | Work | Exit gate |
|---|---|---|
| **W0** spike + fixtures (free) | M1: four fixtures with answer keys under `eval/fixture-graph/` — Express+supertest (extend the existing), a Nest-like TS app (DI aliases, barrels, decorators, a base controller), FastAPI+pytest client, Go net/http+httptest. Each key names every direct, route, alias, inherited and barrel caller by file:line. M2: `eval/graph-replay.js --calls` counts, per transcript, the Grep/Glob/Read calls the NEW edges and `map` could answer. S1 2-hour spike on django. | `findings/W0-fixtures.md`. DE-I decided by the spike. |
| **W1** G1 ROUTE + mounts + decorators | extractor `urls`/`mounts`/`route` aliases; `resolveUrl`; callers ref flag 2; cards, `impact`, `changes`, `tests`; contract §2 | R3-C test passes on the Express fixture; every fixture route key resolves; `npm test` |
| **W2** G2 aliases · G3 inheritance · G4 barrels · G5 mask · G8 ignore · S2 · S3 | engine `graph@5`, `RESOLVE_SCHEMA 3`; the migration golden + test; `graph-resolve.test.js` property script gains alias/base/barrel edits | every fixture key resolves; incremental == full still holds over 200 steps; `graph-upgrade.test.js` green |
| — PAUSE — | full `npm test`; django + nest timing table vs 1.8.1 | |
| **W3** D1 `--source` · D2 `--for-slice` · D3 hook (Bash, Read, dedupe) · D5 one-call update · state legend · footer rule · template trim | `phases/execution.md`, `read-ladder.md`, executor template → `npm run build:agents`; hook tests for the two new matchers and for dedupe; install/doctor 5 entries | like-for-like block size gate (D2 ≥ 30%); hook p95 < 150 ms on the django `names.json`; `npm test` |
| **W4** N1 doc notes · N2 `--with-source` · N3 batching (+ Haiku variant behind DE-D) | extractor `doc`; `notes pending` skip rule; noter agent step 2; new agent file (if DE-D) registered in `verify-package.js` and `verify-contracts.js` | django `doc` share measured; noter fixture run: 1 CLI call, 0 Reads; blind comparison filed if DE-D |
| **W4b** K the gain meter | NEW `bin/graph-gain.js` (ledger, counterfactual rules K2, `gain` aggregation, `--measured` join reusing `transcriptDir()`); every read command appends; the hook appends after emit; `orc graph gain` + `--history` + `--json`; `/api/graph/gain` (+ `/measured`), the Knowledge card strip, fixtures, `en`/`id` i18n, `orc-ui-wiki.md`; `orc stats` column; the ship line + `GRAPH-GAIN` verb; spine budgets by one line (DE-M) | `test/cli/graph-gain.test.js`: a fixture ledger reproduces the K2 rules to the token; a torn line is skipped; `--measured` on the `../orc-eval` traces prints `too few runs` below N = 3 and medians at N = 3; the UI fixture renders the "estimate" word; `npm test` |
| — PAUSE — | full `npm test` | |
| **W5** G6 five languages | fixtures per language; `LANG_BY_EXT`; SFC script-block offsets; `TEST_FILE` patterns (`_spec.rb`, `*_test.rs`, `*Test.kt`) | < 5% partial on one real repo per language; keys resolve |
| **W6** G7 borrowed TS + Go | in-process TS walker; Go program; extractor tags; fallbacks; `ORC_GRAPH_NO_BORROW` | the ≥ 10-point gate on nest and a Go repo; keys unchanged |
| — PAUSE — | full `npm test` | |
| **W7** D4 `orc graph map` | PageRank, budget search, `map.json`, planner/analyst/quick wiring, `GRAPH-MAP`, `LANE_CALLS`, spine budgets (deliberate, commented) | M2 ≥ 3 answerable planning calls per fixture run; `graph-lanes.test.js` |
| **W8** S1 sharded reads (only if DE-I is yes) | `resolved/<ab>.json`; `ctx <symbol>` fast path; fallback to `index.json` | django `ctx <symbol>` < 150 ms; byte-identical answers with and without shards |
| **W9** docs, UI, contracts, release | README + README-id (the graph section + version line + changelog entry), CHANGELOG (1.8.2 on top, the migration paragraph, the limits list rewritten: R3-C moves from "limit" to "fixed, with the new limit stated"), `guides/configuration.md`, `knowledge-parts/05` §4z.28 + `knowledge.md` router row, `claude-rules/04`, `CLAUDE.md` layout lines, `templates/hooks/README.md`, `orc ui` Knowledge card + `orc-ui-wiki.md`, `mock-run/` graph lines if any, `bin/verify-contracts.js` tokens (`ROUTE`, `--for-slice`, `graph-map`, `code_graph_ignore`, `code_graph_notes_model`, the new noter name), `npm version patch` → **1.8.2**, one commit with ONLY package/payload/doc files | `npm run verify` + `npm test` green; M3 round 4 filed in `eval/results/1.8.2/` |

## 8.1 M3 — round 4, the measurement that fits the claim

The claim is **correctness and round trips**, so the metric is those, and tokens
are reported but never gated (EW8 §3 says why a token gate cannot be met and
must not be pretended).

- **Repositories:** the four W0 fixtures, frozen SHA, a clean worktree per condition.
- **Questions:** 12 blast-radius questions, three per fixture, of the R3-C
  shape ("list every place that breaks if the signature of X changes"), with
  answer keys split into direct / route / alias / inherited / barrel callers.
- **Conditions:** graph OFF · graph ON (1.8.1 payload) · graph ON (this plan),
  N = 3 each, fresh session per question, `/orc-quick` look mode.
- **Scored per answer:** recall per caller class, invented callers (must be 0),
  tool calls, `Read` calls, wall time, tokens in the answering window, resident
  context at session end (the CodeGraph caveat).
- **Gate:** ON-plan recall on route/alias/inherited/barrel ≥ OFF (OFF finds
  them by reading; the 1.8.1 graph declared them absent), invented = 0, median
  tool calls ON-plan < OFF, and resident context ON-plan ≤ OFF + the size of the
  cards. If the gate fails on a class, that class ships with its limit written in
  §2 of the contract, exactly as R3-C was.

---

## 9. Risks

| Risk | Control |
|---|---|
| A ROUTE match to the wrong handler (two routers with `/search`, unknown mounts) | suffix match yields AMBIGUOUS with all candidates; only a single full-path match is `ROUTE`; the card says `mount unknown` when the prefix was not found |
| Alias rewriting invents an edge (`x` reassigned, shadowed) | scope-local maps; a reassignment to a different class within the scope drops the alias; the property test adds alias edits |
| Inheritance walk loops or explodes (mixins) | depth ≤ 4, visited set, ≤ 8 bases per class |
| Borrowed TypeScript API changes across major versions | only `createSourceFile` + `SyntaxKind` walks; a thrown walker falls back per file; the tag records the version; a test runs the walker against the pinned dev version in `../orc-eval` |
| `go run` cold start on every update | the program is cached in the OS temp dir by content hash; skipped when no `.go` file changed |
| `--source` raises resident context (CodeGraph's 80%) | hard caps; charged against the card budget; M3 measures resident context; the executor ladder still reads a file it edits whole |
| The Read hint is noise | off by default; M3 decides; once-per-file-per-run dedupe |
| Bash hint fires on build commands | only on a command whose first word is a search tool; identifier ≥ 4 chars; same deadline |
| Spine budgets (`orc-mini` 270, `orc-fast` 240, `orc-quick` 379) | D2/D4/D5 change `_shared/phases/*` and the executor template first; a spine line changes only with a commented budget raise in `verify-contracts.js` |
| Engine upgrade re-parse surprises a user mid-run | the preflight line names it (`index upgraded to the new engine`); the hook's update has the 10 s subprocess budget — on django 12 s exceeds it, so the hook skips and the next preflight heals (recorded in `templates/hooks/README.md`) |
| Contract drift | every new token registered in `bin/verify-contracts.js` in the wave that adds it; W9 re-checks the table |
| Notes go stale from more exact ranges (G7) | body_hash is over the symbol text, and a more exact range is a different text; the CHANGELOG says so; `notes pending` lists them again at the next batch |
| Scope | W5–W8 are separable; each pause is a valid 1.8.2 |

---

## 10. Decisions for you

| # | Question | Options | Recommendation |
|---|---|---|---|
| **DE-A** | Version | (a) `1.8.2` patch as asked · (b) `1.9.0` per CLAUDE.md's "new feature → minor" | **(a)**, with one CHANGELOG line that says the number was the user's call |
| **DE-B** | `ROUTE` as a new state word, or a flag on IMPORT? | (a) new state · (b) flag | **(a)** — a URL is a different kind of link and the contract's §2 must say so |
| **DE-C** | Bash-search hint default | (a) on with `code_graph_hooks: on` · (b) opt-in value | **(a)**; it is the same lookup as Grep and W9 traces show executors search through Bash |
| **DE-D** | Haiku noter | (a) no · (b) behind `code_graph_notes_model`, only if the blind comparison passes | **(b)**; it is the one paid measurement and it is small |
| **DE-E** | `--source` in the executor ladder step 3 | (a) yes · (b) noter only | **(a)**, with exception 1 restated in the same sentence |
| **DE-F** | Language set for W5 | (a) rb rs kt vue svelte c/cpp · (b) add swift scala dart | **(a)**; each language is a fixture and a real-repo gate |
| **DE-G** | Borrowed rungs beyond TS and Go | (a) none now · (b) Java/PHP/Ruby | **(a)**; measure the heuristic first |
| **DE-H** | `orc graph map` consumers | (a) planner + analyst + quick · (b) planner only | **(a)** if M2 shows ≥ 3 answerable calls; else (b) |
| **DE-I** | Sharded reads | (a) no · (b) yes if the W0 spike reaches < 150 ms | **(b)**; decided by the spike, not by argument |
| **DE-J** | Read hint | (a) off by default until M3 · (b) on | **(a)** |
| **DE-K** | Doc notes in the precedence line | (a) beside graph notes · (b) a rung of its own above graph notes | **(a)**; a parser copied a comment, and a comment can lie |
| **DE-L** | The gain meter's headline number | (a) a range `low – high` every time · (b) one number (`high`, like `rtk gain`) with the range in `--json` | **(a)**; one number for a counterfactual is the claim EW8 forbids. RTK can print one because its raw size is exact; a card's alternative is not |
| **DE-M** | The ship-summary gain line | (a) wave lanes only (`orc`, `ultra`, `diy`) · (b) every code lane, one spine line each (mini 270→271, fast 240→241, quick 379→380) | **(b)**; the single-executor lanes are where the meter has the fewest other lines to hide behind, and the budgets have room for one |

---

## 11. Files this plan will touch (for the final staging list)

`bin/graph.js` (engine tag, skips, ignore key plumbing, `--notes-pending`, S2 pass-through) ·
`bin/graph-extract.js` (urls, mounts, decorators, aliases, bases, reexports, doc, mask fixes, five languages, TS/Go rungs) ·
`bin/graph-query.js` (`resolveUrl`, alias head rewrite, inheritance walk, barrel follow, `--source`, `--for-slice`, legend, footer rule, batched `blobState`) ·
`bin/graph-resolve.js` (schema 3, ref flag 2, `names.json` unchanged, optional shards) ·
`bin/graph-signals.js` (ROUTE in `changes`/`tests`, `map`) · NEW `bin/graph-map.js` ·
`bin/graph-notes.js` (doc skip, `--with-source`, model key) ·
NEW `bin/graph-gain.js` (ledger, K2 rules, aggregation, `--measured` join) ·
`bin/cli.js` (flags, `map`, `gain`, keys, doctor, hook wiring, `LANE_CALLS`, `/api/graph` fields, `orc stats` column) ·
`bin/verify-package.js` · `bin/verify-contracts.js` · `bin/webui/**` (Knowledge card + gain strip, `api.js` routes, `fixtures/knowledge.js`, `i18n/{en,id}/knowledge.json`) ·
`templates/hooks/orc-graph-hook.js` + `templates/hooks/README.md` ·
`templates/agents/orc-graph-noter-sonnet-4-6-med.md` (+ optional `orc-graph-noter-haiku-4-5.md`) ·
`agents-src/executor.template.md` → 10 executors ·
`templates/skills/_shared/{code-graph,read-ladder}.md` · `_shared/phases/{execution,planning,review,preflight,trace}.md` ·
`templates/skills/orc-quick/**` (Q1 map) ·
tests: `test/cli/graph*.test.js`, NEW `graph-upgrade.test.js`, NEW `graph-map.test.js`, NEW `graph-gain.test.js`, `test/hooks/graph-hook.test.js`, config/lane/goldens counts, NEW `test/goldens/graph-1.8.1/`, the `orc ui` panel tests for the gain strip ·
docs: README, README-id, CHANGELOG, `guides/configuration.md`, `knowledge.md` + `knowledge-parts/05`, `claude-rules/04`, `CLAUDE.md`, `orc-ui-wiki.md` ·
`package.json` (1.8.2).

Never staged: this folder, `result.md`, `test.md`, `caveman-notes/`, `read-gate-notes/`,
`usage-gate-notes/`, `promo-animation/`, `eval/`, the user's pre-existing `.gitignore` and
`test/docs.test.js` edits.

---

## 12. References (read 19-09-2026)

- Aider, *Repository map* and *Building a better repository map with tree-sitter*:
  file graph, personalized PageRank (chat files `100/n`), 1K-token default,
  binary search over the budget — the model for D4.
  https://aider.chat/docs/repomap.html · https://aider.chat/2023/10/22/repomap.html
- RepoGraph (arXiv 2410.14684): line-level def/ref graph, k-hop ego-graphs
  (1-hop ≈ 11.6 nodes, 2-hop ≈ 54.5), +32.8% average relative resolve rate on
  SWE-bench-Lite across four frameworks at a small token increase — evidence
  that a locator improves correctness, not cost. https://arxiv.org/abs/2410.14684
- colbymchenry/codegraph: route nodes for 17 frameworks, one-call
  `codegraph_explore` with verbatim source, 88% fewer tool calls and zero file
  reads on seven repos, and the **80% more resident context** caveat — the
  model and the warning for D1. https://github.com/colbymchenry/codegraph
- vincentkoc/codebase-memory-mcp: `CALL_REFERENCE`/`USAGE`, routes as
  first-class nodes, `EMITS`/`LISTENS_ON`, `detect_changes`, Grep/Glob/Bash hint
  hooks, coverage notes — G1's edge vocabulary and D3's Bash matcher.
  https://github.com/vincentkoc/codebase-memory-mcp
- Claude Code hooks reference: event list, `SubagentStart`/`SubagentStop`
  matchers by agent type, `PreToolUse` `additionalContext` + `updatedInput`,
  `agent_id`/`agent_type` inside subagents, timeouts never block `PreToolUse`.
  https://code.claude.com/docs/en/hooks
- Claude Code LSP tool (off by default; plugin per language): the read ladder
  gains one sentence — an `AMBIGUOUS` card with an LSP tool in the session is a
  `findReferences` call, not a Grep. https://claudelog.com/faqs/what-is-lsp-tool-in-claude-code/
- ORC's own: `findings/EW8-TOKEN-VERDICT.md` (the token ceiling),
  `findings/R3-results.md` (the false sentence), `findings/W9-eval.md` R2/R5
  (compliance, noter cost), `04-cbm-analysis.md` §8 (what not to copy: daemon,
  MCP, tree-sitter binary, SQLite, committed artifact — all still not copied).
