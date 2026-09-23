# Checkpoint — `orc graph` v1.8.2 (the map that finds what a grep cannot)

Disk is truth. Update this file at every pause. Never announce a stop before it is written.
The 1.8.0 build's record is `CHECKPOINT.md` (history only).

## Run

| Field | Value |
|---|---|
| Plan | `code-graph-notes/06-IMPROVEMENT-PLAN.md` (decisions DE-A … DE-M in §10) |
| Branch | `feat/orc-graph-2` (from `main` @ `bc41f26`, v1.8.1) |
| Commits | **`0b3f096`** (21-09-2026) — the one W9 release commit, 75 files, package/payload/doc/test only. `orc-ui-wiki.md` was staged on the user's yes. NOT pushed. |
| Target version | **1.8.2** (`npm version patch`, DE-A) — bump in W9 only |
| Pause rule | the user asks per session. Pause 1 was after W2 (3 waves); pause 2 after W4b; pause 3 is after W6 (the plan's own third PAUSE). |
| Baseline | `npm test` = 1022 passed · 0 failed · 65 files (19-09-2026, 1.8.1 tree) |
| Last update | 21-09-2026 — **W9 DONE. Docs written, version bumped to 1.8.2, `npm run verify` + `npm test` green (1096/0). The build is complete; only the commit remains.** |

## Decisions in force (this build)

| # | Decision |
|---|---|
| W3-legend | The one-letter state is printed WITH a legend only when the short body plus the legend is SMALLER than the long one. A three-row card keeps the words; `states` in the JSON says which body was used. Always-short makes small cards bigger and less readable, the opposite of §6's purpose. |
| W3-footer | "Something was hidden" includes an unresolved call and a cut source block. A card that hid nothing prints NO footer; `budget {used, max}` stays in the JSON either way. |
| W3-slice-rows | `--for-slice` prints ONE row per calling FILE, naming every symbol of the target file it reaches. One row per (symbol, caller) pair came out LARGER than the file card it replaces. |
| W3-slice-dedupe | The `rt` row prints only routes NOTHING reaches; the `imp` row only importers that call nothing; the `tst` row only tests no caller row already named. A fact on a caller row is never printed twice. |
| W3-wide-file | The wide-file table is its OWN store (`wide.json`, schema- and generation-pinned). The hint that reads it is OFF by default and the two hints that are ON must not pay for it. 278 KB on django. |
| W3-wire-key | `wireGraph` matches on (event, matcher), not on the event alone — a 1.8.1 `settings.json` keeps its four entries byte-for-byte and gains the fifth, and `orc doctor` counts five ENTRIES, not four events. |
| W3-source-flag | `--source` takes an OPTIONAL count, so it consumes the next word only when that word is a number. Otherwise `ctx --source handler` would lose its target. |
| W4-doc-share | The plan's ">60% of django symbols carry a doc" is WRONG: measured 19.9% overall, 30.6% of non-test source. The extractor is correct (verified by hand). The CHANGELOG quotes the measurement, never the estimate. |
| W4-py-hash-doc | Python looks INSIDE first (the docstring), then at a `#` block above. +1.5 points on django, and the sentences it adds are correct. |
| W4-doc-beats-stale | Resolution order is: current model note → doc → stale model note. A sentence that matches the bytes on disk beats one that matched a body nobody has; a model that READ the code beats a comment that claims to describe it. |
| **DE-D not taken** | The Haiku noter is NOT built — its gate is a paid blind comparison that has not been run. Protocol in `findings/W4-W4b-notes-and-gain.md`. |
| W4b-ledger-stamp | The gain ledger uses ORC's own `DD-MM-YYYY HH:MM:SS` in the CLI and in the hook. The parser also accepts the trace's `DDMMYY HH:MM:SS.mmm`. |
| W4b-bytes-lines | `bytes` and `lines` go into the INDEX, not a new store. The counterfactual needs a file's average line length, and opening the file to get it would make every ledger row a file read. |
| W4b-measured-own-route | `--measured` is its own API route and its own button: it reads Claude Code's transcripts, and a panel that stalls on open is a panel nobody opens. |
| W4b-stats-null | `orc stats` reports `graph: null` with no ledger, never `0`. No record at all and a zero saving are different facts. |
| W5-rb-depth | Ruby is read by KEYWORD DEPTH, one line at a time. `if`, `unless`, `while` and `until` open a block only as the FIRST word of a statement — `save if valid?` is a modifier, and counting it swallows the rest of the file. `while x do` is ONE block. |
| W5-rb-parenless | Ruby calls a method with no parentheses, so a RECEIVER form (`@store.list`) is a call. A BARE word is not: it is far more often a local variable, and guessing there invents edges. |
| W5-bare-is-self | In Ruby and Kotlin a bare call inside a method is a call on the object, which is what lets `ok(body)` reach the base class. Marked `self` only when the FILE has no top-level function and no import of that name. |
| W5-rs-trait-base | `impl Trait for Type` is Rust's inheritance: the type gains the trait's DEFAULT methods and the trait becomes a BASE. A `trait` body owns its default methods. |
| W5-sfc-blank | A single-file component is parsed by BLANKING everything outside its `<script>` block, keeping every newline, so the js/ts rung is unchanged and every line number is the FILE's own. `lang="ts"` picks the ts rung. |
| W5-c-macrodef | A macro at column 0 with a block body (`TEST_F(Suite, Case) { … }`) is a DEFINITION. Without it the body belonged to the module symbol, which then passed the 200-call cap: abseil-cpp went from 11% partial to 1.7% and 9,661 symbols to 14,110. |
| W5-c-member | C++ reaches a member — its own or an inherited one — with no `this->`. That rung runs LAST, so a free function of the same name still wins. |
| W5-dir-scope | Rust, Kotlin and C/C++ join Go's directory-scope rung (W1-go-package): a `mod` sibling, a class in the same Kotlin package and a translation unit beside this one are named without an import. |
| W5-rust-crate | A `tests/` integration test names the crate by its PACKAGE name, read from `Cargo.toml` exactly as `resolveGo` reads `go.mod`. |
| W5-kt-package | A Kotlin file name need not match its class: an import resolves to `<pkg>/<Class>.kt` first, the package FOLDER second, never a same-named file anywhere in the tree. |
| W6-raw-names | A borrowed rung emits the RAW dotted call name (`this.ok`). `extractOne` normalises every rung in ONE place; normalising twice loses `self`, and with it every inherited edge. |
| W6-callee-line | A call's line is the line of the CALLEE's own name, not of the whole expression — `request(app)
  .post("/p")` is line 18, which is what the heuristic reports and what the keys hold. |
| W6-bare-tail | A receiver the parser cannot name (`request(app).get(…)`) leaves the BARE member name, as the heuristic's chain regex does. Dropping the call would lose the URL it carries. |
| W6-commonjs | `const x = require("m")` is an import. Without it an Express mount cannot be followed. `module.exports = { … }` is still read from the source by the heuristic half and the export sets are merged. |
| W6-route-half | A borrowed rung still runs the heuristic ROUTE pass (a route handler is anonymous, so an AST has no name for it), and the coverage counter is RESET after it: an AST read every byte. |
| **W6-ship-on (the user's call, 21-09-2026)** | The borrowed TypeScript and Go rungs SHIP, ON by default — option A of `findings/W6-borrowed.md`. The ≥10-point confident-rate gate MEASURED +1.0 (nest), −0.3 (vuejs/core), −0.3 (hugo) and is NOT met. The gate measured the wrong thing: the confident RATE is pinned by calls into external packages, which no parser can resolve. What moved is INVENTED edges — `UNIQUE` guesses fell 36–40% and `IMPORT` facts rose — the same trade W1-bare-method already shipped in this build. Cost: +0.24 s (TS) and +0.70 s (Go) per incremental update. `ORC_GRAPH_NO_BORROW=1` stays the escape hatch; no new config key (option B was refused for that reason). **W9 MUST state in the CHANGELOG that the gate was missed and that the metric was wrong, with these numbers.** |
| W7-focus-baseline | `--focus` gives every file a personalisation share of 1 and adds `MAP_FOCUS_MASS / n` ON TOP for the focus. The literal reading of the plan ("focus files get 100/n") hands the focus the whole vector, which leaves every file it does not reach at exactly ZERO — and a hundred tied zeroes sort alphabetically. That turned the rest of the map into a directory listing. A test holds the line: the unfocused remainder must not be in alphabetical order. |
| W7-map-prefix | The map is cut to a PREFIX of the ranking, chosen by binary search over the row count, never by `fit()`'s greedy pass. `fit` is right for a card of independent sections and wrong for a list whose whole meaning is the ORDER — it skipped a long row and took a shorter one four ranks below. `fit` still does the budget arithmetic and the footer reserve. |
| W7-map-caveat-in-card | "rank is a HINT about where to look first" is a pri-0 row INSIDE the card, charged to the budget. It was first appended to the CLI's human line, where the `--json` reader — the only consumer there is — never saw it. |
| **W7 M2 gate NOT met — DE-H (b) applied** | M2 measured **0.39** answerable planning calls per main window (16 over 41) against a gate of **≥ 3**. W0 had already predicted this. DE-H names its own fallback: "(a) planner + analyst + quick if M2 shows ≥ 3; else **(b) planner only**." So `orc graph map` ships wired to PLANNING ONLY. The analyst and `/orc-quick` wiring was built and then REMOVED, `references/orientation.md` deleted, `LANE_CALLS["graph-map"].lanes` cut to `["orc", "orc-diy"]`. **This needed no user decision — the plan had already made it.** `findings/W7-map.md` |
| W8-fast-or-nothing | The sharded read answers exactly what the full model answers, or it declines. `fastModel()` returns null the moment it cannot PROVE the card is identical, every answer carries `read: sharded\|full`, and a decline carries `read_fallback: <reason>`. It declines a path, a URL, a `file:line`, a spaced query, a name at `names.json`'s five-row cap, a bare name that is not exactly one qname, a duplicate qname in one file, a stale shard, `--for-slice`, a file card, and any multi-target call. |
| W8-intern-cands | The AMBIGUOUS candidate lists are INTERNED per shard — a row carries the index, never the list. 25.3 MB of django's shards became 8.2 MB (68%), and the whole set 47 → 30 MB. Per SHARD and not globally, because a shard is the unit a reader parses: a shared table would mean opening a second file to render one row. |
| W8-gain-basis | A sharded read records `basis.grep_hits: null`, never a confident zero. `nameHits` needs the whole call index, which the fast model does not hold; returning 0 would have quietly shrunk the gain estimate as the fast path spread, and a falling estimate would have read as a falling saving. `orc graph gain` reports `unsized` in its own line. |
| W8-fast-gives-up-mid-card | The fast model reads blobs LAZILY, so an unreadable blob is found when the card is half built — and `ctx` would then drop the row silently. `loadFile` THROWS `FastUnavailable`, the CLI catches it and rebuilds from the full model. A path the index never held stays a plain `null`: the full model does not know it either, so both answer the same "no". |
| W8-ledger-cannot-fail-the-read | `graphGainAppend` was always fail-quiet, but `gainRowFor` — which PRICES the answer and walks the model — was its ARGUMENT, outside that wrapper. K6 says the meter may never block a read; it could. The call is now inside its own try. SECOND time this build found a wrapper protecting the wrong half of an expression (the first was the W3 footer reserve). |
| W8-heal-not-a-guard | The fast path is NOT gated on `healOnRead` returning nothing. A `skipped` heal (django's, which is over the heal cap) changes nothing on disk, and a heal that ran rewrote the shards in the same locked pass. The first version gated on it and so never fired on the one repository it was built for. |
| DE-A | `1.8.2`, patch. The CHANGELOG says the number was the user's call. |
| DE-B | `ROUTE` is a NEW state word (confident). `STATE_SHORT.ROUTE = "R"`. Ref flag `2` in `resolved.json` callers rows (0 call · 1 ref · 2 url · 3 inherited). |
| DE-I | Sharded reads deferred to W8: in-process gate reachable, whole call bounded by node start-up (~300 of ~680 ms). See `findings/W0-fixtures.md`. |
| W0-golden | `test/goldens/graph-1.8.1/` frozen from the Express fixture with the 1.8.1 engine BEFORE any engine edit. It is never regenerated. |
| W0-route-name | A route alias symbol is named `<METHOD> <path>` with the SAME-FILE / SAME-CLASS prefix folded in at extraction (`@Controller("orders")` + `@Get(":id")` → `GET /orders/:id`; `APIRouter(prefix="/orders")` + `@router.get("/{id}")` → `GET /orders/{id}`). A mount from ANOTHER file (`app.use`, `include_router`, `register_blueprint`) is applied at resolution. |
| W0-alias-symbol | A decorated handler keeps its own symbol and gains `route`; the alias route symbol (kind `route`, `handler: <id>`) CALLS the handler (one LOCAL edge), so `impact` walks handler → route → test with no special case and the cache needs none. |
| W1-bare-method | A bare call (`get("/p")`, no receiver, not `this.`) never resolves UNIQUE to a class METHOD. 1.8.1 made every supertest `.get(...)` a caller of the only method named `get` — an INVENTED edge, the opposite of R3-C. A method is reached through a receiver, `this`, or (W2) inheritance. |
| W1-chained-new | `new S().m()` and Python `S().m()` carry `S` as the head (the receiver is a constructor call). The 1.8.1 test suite relied on the bare-method match this replaces. |
| W1-go-package | Go's package scope is the directory: a bare name defined in a sibling `.go` file resolves LOCAL (test files see non-test files; non-test files never see `_test.go`). Refs of bare Go identifiers are kept for the same reason. |
| W1-route-name-from-file | A route alias symbol carries the SAME-FILE or SAME-CLASS prefix in its name; a prefix from another file (`app.use`, `include_router`, `register_blueprint`, Django `include`) is a mount and is applied on read. `GET /search` in two routers is an ambiguous TARGET by name and two distinct routes by full path. |
| W1-tail-match | A URL whose prefix is unknown (`BASE + "/p"`, `${base}/p`, `f"{base}/p"`) or a route whose mount chain is unknown/ambiguous matches by TAIL. One candidate → ROUTE with `mount: unknown`; several → AMBIGUOUS (a `maybe` on each). Literal matches beat pattern matches at every step. |
| W1-mask-prefix | A string with a prefix (`f"…"`, `r'…'`, `@"…"`) is one string argument. |
| W2-ignore-scalar | `code_graph_ignore` is a comma-separated STRING (`vendor/**,*.gen.ts`), default `""`, validator `vGlobs` — config values are scalars and `orc config set` takes one value. The CLI splits it; the engine takes a list. A glob with no slash matches at any depth (gitignore's rule). |
| W2-shadow-is-maybe | A local that re-binds an alias name to something that is not a class SHADOWS the alias in that scope: no rewrite, so the call falls back to the 1.8.1 AMBIGUOUS hint (a `maybe`), never a confident edge and never silently dropped. |
| W2-alias-external | An alias head IS a class name. When no class in the repo has that member (`router.get` with `router = Router()`), the call is `UNRESOLVED (external)`, never an AMBIGUOUS list of every `get` in the tree — the nestjs/nest 118-maybe noise. |
| W2-inherited-state | An inherited member carries the state the BASE CLASS resolved with from the subclass's file (LOCAL / IMPORT / UNIQUE) plus `inherited: true`; cache ref flag `3`. `super.m()` skips the class's own `m`. A self call on a class with no such member is NOT a same-named module function. |
| W2-barrel-head-wins | The IMPORT rung searches the imported file FIRST, then the files its re-exports reach (depth ≤ 3); a barrel that defines the name itself wins over one it re-exports. |
| W2-oneline-class | A class member may follow `{`, `}` or `;` on the same line (`class A extends B { go() {} }`), not only a line start. |
| W2-default-skips | Root `dist/ build/ out/`; any-depth `vendor/ __pycache__/ .next/ .nuxt/ .venv/ venv/ target/classes/`; `*.min.js *.bundle.js *.chunk.js *.d.ts *.generated.* *.pb.go *_pb2.py`. `build/` and `dist/` at the ROOT only — `pkg/build/` is a package name in real repositories. A skipped path is `excluded` in `coverage`. |
| W2-footer-reserve | `fit()` reserves the LONGEST footer the card could print (one hidden count per section present), so `used` never passes the budget. |
| W2-est | `EST_MS_PER_FILE` 3.5 → 5.6 (django on the 1.8.2 engine, measured). |

## Waves

| Wave | Status | Gate |
|---|---|---|
| W0 spike + fixtures | **DONE 20-09-2026** | `findings/W0-fixtures.md` · baseline 1/38 keys · golden frozen · `--calls` mode · DE-I decided |
| W1 G1 ROUTE + mounts + decorators | **DONE 20-09-2026** | every route key on all 4 fixtures resolves (18 of 38 rows; the rest are W2 classes) · `test/cli/graph-routes.test.js` 8 tests · graph suite 88/88 · contract §2 gained the ROUTE line |
| W2 G2 · G3 · G4 · G5 · G8 · S2 · S3 · migration | **DONE 20-09-2026** | `check.js` **0 FAIL, 38/38 rows** · `graph-edges.test.js` 6 tests · `graph-upgrade.test.js` 3 tests · property script +4 ops · graph suite 105/105 · `npm run verify` OK · `findings/W1-W2-edges.md` |
| PAUSE (3 waves) | done 20-09-2026 | `npm test` 1039/1039 · django + nest table in `findings/W1-W2-edges.md` |
| **W3** D1 `--source` · D2 `--for-slice` · D3 hook (Bash + wide Read + dedupe) · D5 one-call update · state legend · footer rule · template trim | **DONE 20-09-2026** | `check.js` 0 FAIL · `graph-delivery.test.js` 10 NEW · hook suite 14 (4 NEW) · install suite 16 (3 NEW) · `npm run verify` 196 contracts · D2 gate: fixture 30%/51%, django 46% aggregate · `findings/W3-delivery.md` |
| **W4** N1 doc notes · N2 `--with-source` · N3 batching | **DONE 20-09-2026** | doc share MEASURED (django 19.9% / 30.6% non-test — the plan's >60% was wrong) · `graph-doc.test.js` 7 NEW · **DE-D not taken: the Haiku noter is NOT built, its gate is an unrun paid measurement** · `findings/W4-W4b-notes-and-gain.md` |
| **W4b** K the gain meter | **DONE 20-09-2026** | NEW `bin/graph-gain.js` · `orc graph gain` (+ `--history`/`--since`/`--run`/`--measured`/`--reset`) · ledger from 5 read paths + the hook · `orc stats` row · `GRAPH-GAIN` at ship · `/api/graph/gain[/measured]` + the Knowledge strip + en/id i18n + fixtures + `orc-ui-wiki.md` · `graph-gain.test.js` 14 NEW |
| **PAUSE** | done 20-09-2026 | `npm test` 1077/1077 |
| **W5** G6 five languages (rb · rs · kt · vue/svelte · c/cpp) | **DONE 21-09-2026** | `check.js` 0 FAIL, 9 fixtures / 86 rows (5 NEW fixtures, 48 NEW rows) · partial < 5% per language on a real repo · `graph-langs.test.js` 6 NEW · `findings/W5-languages.md` |
| **W6** G7 borrowed TypeScript + Go | **DONE 21-09-2026 — GATE NOT MET** | keys unchanged with AND without the borrow (`check.js --ts`) · `graph-borrow.test.js` 5 NEW · the ≥10-point gate measured +1.0 / −0.3 / −0.3 · `findings/W6-borrowed.md` |
| **W7** D4 `orc graph map` | **DONE 21-09-2026 — M2 GATE NOT MET, DE-H (b) applied** | NEW `bin/graph-map.js` · `orc graph map [--focus] [--budget]` · `map.json` (335 KB on django, saves 175 ms) · PageRank + sqrt edges + test×0.1 + private×0.5 · `GRAPH-MAP` · `LANE_CALLS` · `graph-lanes.test.js` **11 NEW** · M2 = 0.39/run against ≥ 3 → PLANNING ONLY · `findings/W7-map.md` |
| **W8** S1 sharded reads (DE-I) | **DONE 21-09-2026 — GATE MET** | NEW `bin/graph-shard.js` · `resolved/<ab>.json` (callers · maybe · forward calls · interned candidates) · **577 cards compared on django + nest, 0 different** · in-process 361 → **50 ms** (gate 150) · whole call 881 → **480 ms** · 30 MB on django · `graph-shard.test.js` **9 NEW** · `findings/W8-shards.md` |
| **PAUSE** | **HERE** | see the pause gate below |
| **W9** docs + release | **DONE 21-09-2026** | CHANGELOG 1.8.2 on top · README + README-id (badge, latest line, graph section, changelog entry, package listing) · `guides/configuration.md` (`code_graph_ignore`, `on,read`) · `knowledge.md` router row + `knowledge-parts/05` **§4z.30** (§4z.28 marked history) · `claude-rules/04` · `CLAUDE.md` layout (graph-map / graph-shard / graph-gain) · `templates/hooks/README.md` · `bin/verify-contracts.js` (the `on,read` contract gained `hooks/README.md`) · `npm version patch` → 1.8.2 · `npm run verify` 206 contracts OK · `npm test` **1096 passed, 0 failed, 1099 tests, 74 files, 464 s** |
| | | `mock-run/` needed NO change — no mocked run mentions `orc graph`. M3 round 4 was NOT run: RESUME scopes W9 as docs + release and the S1/S2/S3 token matrix is closed by `findings/EW8-TOKEN-VERDICT.md`. |

## Pause gate (21-09-2026, fourth pause — after W7 · W8)

| Check | Result |
|---|---|
| `node eval/fixture-graph/check.js` | **0 FAIL** across **9 fixtures, 86 rows** |
| `npm run verify` | ✅ 40 skills · 49 agents · **206 contracts** (202 at the third pause) |
| `npm test` (full) | **1096 passed · 0 failed · 1099 tests · 74 files · 488 s** (1085 / 73 at the third pause) |
| graph suite (16 files) | 162 tests · 159 passed · 0 failed · 3 SKIPPED (no TypeScript on the machine) |
| **W7 gate — M2 ≥ 3 answerable planning calls per run** | **NOT MET: 0.39** (16 planning sweeps over 41 main windows). DE-H's own fallback applied — `orc graph map` ships wired to PLANNING ONLY. No user decision was needed: the plan had already made it. |
| **W8 gate — django `ctx <symbol>` < 150 ms in process** | **MET: 50.1 ms median** (p95 62.1), from 360.9 ms (p95 413.2) |
| **W8 gate — byte-identical with and without shards** | **MET: 577 cards compared on django + nest, 0 different** |
| W8, the whole user-visible call | django 881 · 891 · 882 ms → **487 · 479 · 475 ms**. The floor is node's own ~300 ms start-up (the W0 wall again) |
| W7 cost | `map.json` 335 KB on django; it saves ~175 ms a call (971 → 790 ms without / with) |
| W8 cost — **disk, which the plan did not budget** | django's shard set is **30 MB** (47 MB before the candidate lists were interned). `.claude/orc/graph` goes from ~87 MB to ~117 MB. The update pays nothing measurable: 3,767 ms → 3,646 ms with BOTH new stores being written |
| NEW test files | `graph-lanes.test.js` 11 · `graph-shard.test.js` 10 |
| NEW eval scripts (git-ignored) | `eval/fixture-graph/shard-diff.js` |

### One flake, recorded — and one thing that was NOT a bug

The full suite run made straight after the blob-guard patch reported **1 failed
of 1099**. The next full run on the same tree was **1096 / 0 failed**. The
failing test's NAME was lost: the run was piped through `tail -12`, which cut
off the runner's failure-only report. Two lessons, both recorded rather than
explained away:

- **Never pipe `npm test` through `tail`.** It hides the failure detail AND
  replaces the runner's exit code with `tail`'s, so a red run reads as exit 0.
  `bin/test-run.js` returns 1 correctly; the pipeline was the problem. An
  earlier note in this session wrongly called the exit code a runner bug — it
  is not.
- The third pause recorded a similar unreproducible flake in
  `test/cli/test-run.test.js` (a lane that stands up a local HTTP server). This
  one may or may not be the same; it cannot be said, and it is not said.

## Pause gate (21-09-2026, third pause — after W5 · W6)

| Check | Result |
|---|---|
| `node eval/fixture-graph/check.js` | **0 FAIL** across **9 fixtures, 86 rows** (4 fixtures / 38 rows before W5) |
| `node eval/fixture-graph/check.js --ts <dir>` | **0 FAIL** — the same 86 rows against the BORROWED TypeScript rung |
| `npm run verify` | ✅ 40 skills · 49 agents · **202 contracts** (200 at the second pause) |
| `npm test` (full) | **1085 passed · 0 failed · 1088 tests · 73 files · 476 s** (1077 / 71 at the second pause) |
| graph suite (14 files) | 151 tests · 148 passed · 0 failed · 3 SKIPPED (no TypeScript on the machine; `ORC_TEST_TS_DIR` runs them) |
| W5 gate — partial < 5% on a real repo | rubocop **2.4%** (1,790 files) · tokio **0.3%** (799) · ktor **1.4%** (2,593) · primevue **0.5%** (2,615) · sveltejs/svelte **0%** (4,547) · abseil-cpp **1.7%** (875) · redis **4.5%** (796) |
| W6 gate — confident rate +10 points | **NOT MET**: nest +1.0 · vuejs/core −0.3 · hugo −0.3. `UNIQUE` guesses fell 36–40% and `IMPORT` facts rose, so the borrow is more CORRECT but not more RESOLVED. **SETTLED 21-09-2026 — the user chose option A: ship ON.** See W6-ship-on above.
| W6 cost | one changed file: nest 0.90 s → 1.13 s (the compiler load) · hugo 1.12 s → 1.82 s (the `go run` spawn) |
| NEW test files | `graph-langs.test.js` 6 · `graph-borrow.test.js` 5 |
| NEW eval scripts (git-ignored) | `eval/fixture-graph/lang-coverage.js` · `borrow-compare.js` · `check.js --ts` |
| One flake, recorded | the first full `npm test` failed one test in `test/cli/test-run.test.js` (the `/orc-test` lane, which stands up a local HTTP server). That file then passed 12/12 three times and the next full run was green. Nothing in W5 or W6 touches it. |

### Not delivered, on purpose

**DE-G — Ruby `Prism`, Java, PHP.** Each is gated on the heuristic's measured
partial rate being OVER 5% on a real repository. Ruby measured **2.4% on 1,790
files**, so the gate does not open. `findings/W5-languages.md` is the evidence.

**Swift, Scala, Dart** are still out (DE-F).

## Pause gate (20-09-2026, second pause — after W4b)

| Check | Result |
|---|---|
| `node eval/fixture-graph/check.js` | **0 FAIL** across 4 fixtures (38 rows) |
| `npm run verify` | ✅ 40 skills · 49 agents · **200 contracts** (192 at the first pause) |
| `npm test` (full) | **1077 passed · 0 failed · 71 files · 531 s (baseline 1022/65 at 1.8.1; 1039/68 at the first pause)** |
| D2 size gate (≥ 30%) | fixture 30% / 51% · django 46% aggregate over 5 slices (80 · 38 · 44 · 22 · 29) |
| hook p95 (django `names.json` 4.0 MB) | Grep 384 ms · Bash 390 ms · wide Read 340 ms wall — of which **303 ms is bare `node -e 0` on this machine**. The hook's own work is ~70 ms; the plan's 150 ms wall figure is not reachable by any Node hook here (the DE-I wall again). |
| doc share (N1) | django 19.9% of notable symbols (30.6% of non-test source) · nest 7.1% / 9.0% — **the plan's >60% estimate was wrong; the extractor is right** |
| NEW test files | `graph-delivery.test.js` 10 · `graph-doc.test.js` 7 · `graph-gain.test.js` 14 (+4 hook, +3 install) |
| ONE stale golden, found and regenerated | `test/goldens/diy-compile-default.md` — the W3 edit to the `diy:` block of `_shared/phases/execution.md` (`--for-slice`, `--notes-pending`) is compiled into the DIY flow. Regenerated from the current payload; the diff is exactly those two lines. |

### Not delivered, on purpose

**DE-D — the Haiku noter.** `orc-graph-noter-haiku-4-5` and the
`code_graph_notes_model` key are NOT built. The decision row gates them on a
blind 30-symbol comparison that costs real model tokens and has not been run;
shipping an unvalidated model behind a user-facing key is exactly what that gate
exists to prevent. The protocol is written down in
`findings/W4-W4b-notes-and-gain.md`. The default was `sonnet` and still is.

## Pause gate (20-09-2026, first pause — after W2)

| Check | Result |
|---|---|
| `node eval/fixture-graph/check.js` | 0 FAIL across 4 fixtures (38 rows) |
| graph suite (11 files) | 105 passed · 0 failed |
| `npm run verify` | ✅ package OK (40 skills, 49 agents) · ✅ 192 contracts OK |
| `npm test` (full) | **1039 passed · 0 failed · 68 files · 448 s** (baseline 1022 / 65 files; +17 tests, +3 files). The first run failed 7 because the golden fixture's `.js` files were run as tests — the fixture is now `fixture.json`. |
| django 1.8.1 → 1.8.2 | confident edges 65,379 → 72,955 · UNIQUE guesses 23,866 → 6,442 · ROUTE 656 · build 12.5 → 13.7 s |
| nestjs/nest 1.8.1 → 1.8.2 | confident edges 7,288 → 9,426 · maybe 81,485 → 33,906 · UNIQUE 1,957 → 275 · ROUTE 344 · build 3.1 → 4.0 s |

## Files touched so far (for the W9 staging list)

To be committed at W9 (package/payload/doc/test files only):

**Engine + CLI**
- `bin/graph.js` · `bin/graph-extract.js` · `bin/graph-query.js` · `bin/graph-resolve.js` · `bin/graph-notes.js` · `bin/cli.js`
- `bin/graph-gain.js` (**NEW**, W4b) — registered in `bin/verify-package.js`
- `bin/graph-map.js` (**NEW**, W7) — the ranked map. Registered in `bin/verify-package.js`
- `bin/graph-shard.js` (**NEW**, W8) — the sharded read path. Registered in `bin/verify-package.js`
- W7/W8 also touch `bin/graph-resolve.js` (the map + shard builds, and the
  FORWARD half collected in the same resolve pass), `bin/graph-query.js`
  (`graphMap`, `calleesOf` reading the forward half, `nameHits` returning null
  on a fast model), `bin/graph.js` (`gc` drops a dead shard set) and
  `bin/graph-gain.js` (`mapCost`, the null-basis rule, `unsized`)
- `bin/verify-contracts.js` · `bin/verify-package.js`
- W5/W6 touch `bin/graph.js` (`LANG_BY_EXT`, `ALWAYS_SKIP`, the `root` passed to
  `extractBatch`), `bin/graph-extract.js` (the rb rung, the rs/kt/c branches,
  the SFC blanker, the TypeScript walker, the Go program) and
  `bin/graph-query.js` (`importTargets` for the five new languages, `TEST_FILE`,
  `JS_EXT`, the directory-scope and C++ member rungs)

**Payload**
- `templates/skills/_shared/code-graph.md` · `read-ladder.md` · `phases/execution.md` · `phases/ship.md` · `phases/trace.md` · `phases/wiki-consult.md` · `orc-wiki/references/staleness.md`
- `templates/hooks/orc-graph-hook.js` · `templates/agents/orc-graph-noter-sonnet-4-6-med.md`
- `agents-src/executor.template.md` → the 10 generated `templates/agents/orc-executor-*.md`

**orc ui**
- `bin/webui/api.js` · `js/panels/knowledge.js` · `fixtures/{index,knowledge,stats}.js` · `i18n/{en,id}/knowledge.json` · `orc-ui-wiki.md`

**Tests**
- NEW: `test/cli/graph-routes.test.js` · `graph-edges.test.js` · `graph-upgrade.test.js` · `graph-delivery.test.js` · `graph-doc.test.js` · `graph-gain.test.js` · `graph-langs.test.js` (W5) · `graph-borrow.test.js` (W6) · `graph-lanes.test.js` (W7) · `graph-shard.test.js` (W8)
- Edited: `test/cli/graph-extract.test.js` · `graph-query.test.js` · `graph-resolve.test.js` · `config.test.js` · `lane.test.js` · `install.test.js` · `test/hooks/graph-hook.test.js` · `test/goldens.test.js`
- `test/goldens/config-keys.json` · `test/goldens/graph-1.8.1/**` (NEW — the frozen 1.8.1 store + the Express fixture source)

Never staged:
- `eval/fixture-graph/**` (now NINE fixtures, `check.js`, `engine-compare.js`, and the W5–W8 additions `lang-coverage.js`, `borrow-compare.js` and `shard-diff.js`) · `eval/graph-replay.js` — all under git-ignored `eval/`
- `code-graph-notes/**` · the user's pre-existing `.gitignore` and `test/docs.test.js` edits

Not yet done (W9): README / README-id / CHANGELOG / `guides/configuration.md` / `knowledge.md` + `knowledge-parts/05` / `claude-rules/04` / `CLAUDE.md` layout lines / `templates/hooks/README.md` / `mock-run/` graph lines / `package.json` bump. `orc-ui-wiki.md` is already updated (W4b).

**Contract tokens registered so far:** `ROUTE` · `code_graph_ignore` (W2) · `--for-slice` · `--source [N]` · `--notes-pending` · `on,read` (W3) · `--with-source` · `graph notes and doc notes` · `GRAPH-GAIN` · `AN ESTIMATE` (W4/W4b) · `Ruby, Rust, Kotlin` (W5) · `ORC_GRAPH_NO_BORROW` (W6) · `orc graph map` · `GRAPH-MAP` · `a HINT about where to look first` (W7) · `resolved/<ab>.json` (W8). 192 → **206**.

**W9 doc debt added by W7/W8:** `orc graph map` and the `resolved/` shards need
a README line, a CHANGELOG entry, `guides/configuration.md`, `knowledge-parts/05`
§4z.28, the `CLAUDE.md` layout lines for `bin/graph-map.js` and
`bin/graph-shard.js`, and `claude-rules/`. The CHANGELOG must say the W7 map is
wired to PLANNING ONLY and why (M2 = 0.39 against a gate of 3), and must quote
the W8 numbers as MEASURED (881 → 480 ms whole call, 361 → 50 ms in process,
30 MB of shards on django) rather than as estimates.

**W9 doc debt added by W5/W6:** the language list and the borrowed-parser
paragraph now live in `templates/skills/_shared/code-graph.md` §1 and have to
reach the README, the CHANGELOG, `guides/configuration.md` and
`knowledge-parts/05` §4z.28 — plus, if the user ships W6, the ship/no-ship
decision and its numbers.
