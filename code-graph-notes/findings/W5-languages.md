# W5 (G6) — five more languages, measured

Wave W5 of `code-graph-notes/06-IMPROVEMENT-PLAN.md`, on branch
`feat/orc-graph-2`. Nothing is committed.

## What shipped

`LANG_BY_EXT` goes from 7 languages to 12. Each one is a HEURISTIC rung — the
same class of parser the JavaScript, Go, Java, C# and PHP rungs already are.

| Language | Extensions | Declarations | Imports | Routes |
|---|---|---|---|---|
| Ruby | `.rb` `.rake` | keyword depth (`class` · `module` · `def` · a trailing `do`, closed by `end`) | `require` · `require_relative` | Rails `get "/p", to: "c#a"` |
| Rust | `.rs` | `fn` · `impl T { }` · `impl Trait for T` · `struct` · `enum` · `trait` | `mod x;` · `use crate::a::b::{c}` | axum `.route("/p", get(h))` · actix `#[get("/p")]` |
| Kotlin | `.kt` `.kts` | `fun` (block AND expression body) · `class` · `object` · `interface` | `import a.b.C` | Ktor `get("/p") { }`, nested in `route("/x") { }` |
| Vue / Svelte | `.vue` `.svelte` | the `<script>` block, read as js or ts | as js / ts | as js / ts |
| C / C++ | `.c .h .cc .cpp .cxx .hpp .hh` | definitions only (a `;` declaration is not a symbol) · class members · a MACRO with a block body | `#include "x.h"` | — |

Six decisions had to be made to get there, and each one is load-bearing.

| # | Decision |
|---|---|
| W5-rb-depth | Ruby is read by KEYWORD DEPTH, one line at a time. `if`, `unless`, `while` and `until` open a block only as the FIRST word of a statement, because `save if valid?` is a modifier and counting it would swallow the rest of the file. `while x do` is ONE block: the trailing `do` belongs to the loop keyword that already opened it. |
| W5-rb-parenless | Ruby calls a method with no parentheses, so a RECEIVER form (`@store.list`, `handler.index`, `OrderStore.new`) is a call. A BARE word is not: it is far more often a local variable, and guessing there would invent edges. Measured on jekyll and rubocop; without this rung a Ruby file looks as though it calls almost nothing. |
| W5-bare-is-self | In Ruby and Kotlin a bare call inside a method is a call on the object (`ok(body)` means `self.ok(body)`), which is what lets it reach the base class. It is marked `self` only when the FILE has no top-level function and no import of that name, so a real module function still wins where the language would give it the call. |
| W5-rs-trait-base | Rust has no inheritance, so `impl Trait for Type` is read as one: the type gains the trait's DEFAULT methods and the trait becomes a BASE of the type. A `trait` body owns its default methods, which is what makes `self.ok(…)` on an implementing struct an inherited edge. |
| W5-sfc-blank | A single-file component is parsed by BLANKING everything outside its `<script>` block, keeping every newline. The js/ts rung is then unchanged and every line number is the FILE's own. A card that points at the wrong line is worse than no card. `lang="ts"` picks the ts rung. |
| W5-c-macrodef | A macro at column 0 with a block body (`TEST_F(Suite, Case) { … }`) is a DEFINITION. Without it every such body belonged to the module symbol, which then passed the 200-call cap and reported the whole file `partial`. On abseil-cpp that one rule took partial from **11% to 1.7%** and symbols from 9,661 to 14,110 — and every file it fixed was a test file, which is also what the `tests` line reads. |
| W5-c-member | C++ reaches a member — its own, or one it inherits — with no `this->`. That rung runs LAST, after every other, so a free function of the same name still wins; it is the step before the repository-wide UNIQUE guess, not before the local one. |
| W5-dir-scope | Rust, Kotlin and C/C++ join Go's directory-scope rung (W1-go-package): a `mod` sibling, a class in the same Kotlin package and a translation unit beside this one are all named without an import. |
| W5-rust-crate | An integration test under `tests/` names the crate by its PACKAGE name, not by `crate`. The name is read from `Cargo.toml`, exactly as `resolveGo` reads `go.mod`. |
| W5-kt-package | A Kotlin file name need not match its class, so an import resolves to `<pkg>/<Class>.kt` first and to the package FOLDER second — never to a same-named file anywhere in the tree. |

Also in this wave: `ALWAYS_SKIP` gains `target/debug/` and `target/release/` at
the root (Rust build output), and `TEST_FILE` gains `_spec.rb`, `_test.rb`,
`*_test.rs`, `*Test.kt`, `*Spec.kt` and `*_test.{c,cc,cpp}`.

## The gate: partial coverage under 5% on a real repository

`node eval/fixture-graph/lang-coverage.js <repo>` builds the graph with the
working-tree engine and reports, per language, the share of files the extractor
marked `partial` — its own word for "I lost the thread here". Every repository
below was cloned at `--depth 1` on 21-09-2026 and indexed from scratch.

| Language | Repository | Files | Partial | % | Gate |
|---|---|---|---|---|---|
| Ruby | `rubocop/rubocop` | 1,790 | 43 | **2.4%** | ✅ |
| Ruby | `jekyll/jekyll` | 165 | 4 | 2.4% | ✅ (second sample) |
| Rust | `tokio-rs/tokio` | 799 | 2 | **0.3%** | ✅ |
| Rust | `BurntSushi/ripgrep` | 110 | 5 | 4.5% | ✅ (second sample) |
| Kotlin | `ktorio/ktor` | 2,593 | 36 | **1.4%** | ✅ |
| Vue | `primefaces/primevue` | 2,615 | 14 | **0.5%** | ✅ |
| Svelte | `sveltejs/svelte` | 4,547 | 0 | **0%** | ✅ |
| C / C++ | `abseil/abseil-cpp` | 875 | 15 | **1.7%** | ✅ |
| C / C++ | `redis/redis` | 796 | 36 | 4.5% | ✅ (second sample) |

redis is the tightest of the nine. Its own `src/` tree is 11 partial files in
280 (3.9%); the rest are in the vendored `deps/jemalloc` tree, where the cause
is a macro that opens a brace one `#ifdef` branch closes and another does not.
That is an inherent limit of a heuristic C rung, and no regex removes it.

## The answer keys

`node eval/fixture-graph/check.js` — **0 FAIL across 9 fixtures**. W5 adds five
fixtures with 48 new key rows; the four W0 fixtures (38 rows) are unchanged.

| Fixture | Files | Keys | What it measures |
|---|---|---|---|
| `ruby` | 7 | 11 | keyword depth · a modifier `if` · a paren-less call · an `@ivar` field alias · an inherited bare call · Rails routes reached by URL |
| `rust` | 8 | 11 | `impl Trait for Type` as inheritance · a struct field alias · axum `.route` reached by a `reqwest` URL · a `tests/` crate import |
| `kotlin` | 6 | 11 | an expression body · a class-level `val` as a field · an open base class · Ktor routes reached by a `client.get` URL |
| `sfc` | 6 | 6 | a `.vue` and a `.svelte` component at the FILE's own line numbers · a `fetch` URL in a component reaching an Express route on the server |
| `cpp` | 5 | 9 | a `;` declaration that is NOT a symbol · a member with no `this->` · a public base class · an alias through a class-typed member |

## Tests

`test/cli/graph-langs.test.js` — 6 NEW tests, one promise each, listed at the
top of the file. Graph suite: **146 passed, 0 failed** (140 before this wave).
`npm run verify`: 40 skills · 49 agents · **201 contracts** (200 before).

## One measurement that is NOT a W5 regression

`vuejs/core` reports **15.8%** of its `.ts` files `partial`. The same tree on
the saved 1.8.1 engine reports **15.3%** (491 files vs 481 — the difference is
W2's `.d.ts` skip). So the TypeScript heuristic rung has always been the
weakest rung in the engine on a modern TS repository, and W5 did not move it.

That is exactly the gap **W6 (G7)** exists to close: a project that already has
`node_modules/typescript` gets an EXACT parse, borrowed the way the Python `ast`
rung is borrowed. The number to beat is on record here.

## What W5 did not do

- No borrowed toolchain. Ruby has `Prism` and Java has a single-file launcher;
  both are DE-G, gated on the heuristic's measured partial rate being over 5%.
  It is not: Ruby measured 2.4% on 1,790 files. So DE-G stays unopened, and
  this finding is the evidence for that.
- Swift, Scala and Dart are still out (DE-F).
- A Rails route's `to: "orders#show"` names a controller action in ANOTHER
  file. The route symbol carries the path (which is what a URL reaches); the
  handler link across files is not built, and the card is silent about it.
