# W1 + W2 — the edges a grep cannot see (20-09-2026)

Plan: `06-IMPROVEMENT-PLAN.md` §2 (G1–G5, G8), §5 (S2, S3), §7 (the migration).
Engine `graph@5` · `heuristic@5` · `RESOLVE_SCHEMA 3`. Zero model tokens spent.

## The gate: every answer key resolves

`node eval/fixture-graph/check.js` — **0 FAIL across 4 fixtures, 38 of 38 rows**
(W0 baseline on 1.8.1: 1 of 38). Per class: 12 route rows, 20 alias rows, 7
inherited rows, 6 barrel rows, 3 direct rows; no `extra` (invented) caller on
any row.

## What was built

| # | Change | Where |
|---|---|---|
| G1 | `urls[]` per symbol (method + path, `suffix` when the prefix is unknown), `mounts[]` per module (`app.use`, `register`, `include_router`, `register_blueprint`, `mount`, Django `include`), decorator routes (`@Get`, `@router.get/route/api_route`, `@GetMapping/@RequestMapping`, `[HttpGet]/[Route]`, `#[Route]`) as a `route` field on the handler plus an alias ROUTE symbol that CALLS it, registration routes with a handler by name (Express router head, Go `HandleFunc/GET`, Laravel `Route::get`, Django `path()`), same-file / same-class prefixes folded into the route name | `graph-extract.js` |
| G1 | `resolveUrl`: mount chains across files (depth ≤ 4), full-path literal → full-path pattern → tail match; one → `ROUTE`, several → `AMBIGUOUS`; `callersOf` reaches route symbols by URL (on read and from the cache, ref flag `2` + the URL text); `findTarget` accepts `GET /orders/9999`; card line `← reached via`; `impact` follows ROUTE (`via GET /search ← GET /orders/search`) | `graph-query.js` · `graph-resolve.js` |
| G2 | `aliasesOf`: `const x = new S()`, `x: S`, `x = S()`, `this.x = new S()`, ctor param-properties, typed fields, Python `x = S()` / `self.x = S()` / annotations, Go `x := S{}` / `NewS()` / receivers / params, Java-C# typed declarations, PHP `$x = new S()` / typed properties; scoped to the symbol (module for top-level), class fields to the class; a re-binding shadows; the call is rewritten to `S.m` with `alias: "x"`; an alias head that names no class in the repo is `UNRESOLVED`, never an AMBIGUOUS list of every `m` | `graph-extract.js` · `graph-query.js` |
| G3 | `bases[]` on classes (JS/TS/Java/C#/PHP incl. `use Trait`, Python); `this.m()` with no own member walks the base chain (depth ≤ 4, ≤ 8 bases, cycle-safe) and returns the base member with the state the BASE resolved with, `inherited: true`; `super.m()` / `super().m()` / `parent::m()` / `base.m()` start one level up; ref flag `3` in the cache | both |
| G4 | `reexports[]` on the file record (`export * from`, `export { a as b } from`, `export { X }` of an import, `module.exports = require`, `exports.a = require().a`, every import in a Python `__init__.py`, `from .x import *`); the IMPORT rung follows them (depth ≤ 3, cycle-safe, renames honoured); `classSymbol` follows them too | both |
| G5 | `${…}` in a template literal and `{…}` in an f-string are code (masked recursively, string segments recorded around them and rebuilt as `{}`-joined text for URLs); a regex literal after an operator / bracket / keyword is masked, never a comment opener; `a / b / c` is division | `graph-extract.js` |
| G8 | `code_graph_ignore` (comma-separated globs, `vGlobs`, default empty, gated by `code_graph`); `ALWAYS_SKIP` gains root `dist/ build/ out/`, any-depth `vendor __pycache__ .next .nuxt .venv venv target/classes`, `*.bundle.js *.chunk.js *.d.ts *.generated.* *.pb.go *_pb2.py`; a glob with no slash matches at any depth (gitignore rule); 95 config keys | `graph.js` · `cli.js` · registries |
| S2 | `graph-resolve.build(claudeDir, root, index)` takes the in-memory index — one parse per update | `graph.js` · `graph-resolve.js` · `graph-query.js` |
| S3 | `warmBlobs(model, queries)`: one `git hash-object --stdin-paths` per read for every card's file | `graph-query.js` · `cli.js` |
| fix | a bare call (`get("/p")`) never resolves UNIQUE to a class METHOD (the 1.8.1 invented caller on every supertest call); `new S().m()` / `S().m()` carry `S` as the head; Go's package scope (directory) is LOCAL for bare names and receiver-typed calls; a class member named `list`, `delete`, `of` is a member (the shared keyword set dropped it); one-line classes (`class A extends B { go() {} }`) have members; the budget footer reserve is the LONGEST footer the card could print | `graph-extract.js` · `graph-query.js` |
| docs | `_shared/code-graph.md` §2: the `ROUTE` state, the URL-is-an-edge paragraph, the "names the symbol OR sends a URL literal" limit line | contract |

## Tests

| File | Tests | What it pins |
|---|---|---|
| `test/cli/graph-routes.test.js` (NEW) | 8 | R3-C on an Express shape (URL → route, tests line, impact d2), ambiguity by name vs full path, method mismatch, tail-only URL → maybe on both, `changes` fan-in/tests, cache ROUTE rows byte-identical, a two-file mount chain, Nest decorators, FastAPI/Flask/Django/Spring/Go shapes, URL shapes (fetch options, cache get, registration, require mount), Go package rung |
| `test/cli/graph-edges.test.js` (NEW) | 6 | aliases in JS/TS/Python/Go with scope + shadow + external class, inheritance (own wins, super, chain, cycle, Python), barrels (five shapes + a chain + a rename + Python `__init__`), mask fixes, ignore key + default skips + `coverage excluded`, warmBlobs |
| `test/cli/graph-upgrade.test.js` (NEW) | 3 | the frozen 1.8.1 store: DRIFTED + `engine_stale`, the old cache refused, `status --heal` re-extracts 12 files with `engine_upgrade`, every note current, every `ctx`/`impact` byte-identical to a fresh build |
| `test/cli/graph-resolve.test.js` | +4 ops | the property script now toggles an alias, a base, a barrel rename and a mount prefix (11 ops, 30 steps) |
| `test/cli/graph-query.test.js` | 2 edited | `this.orderRepo.insert` is IMPORT (via orderRepo), no longer a UNIQUE guess |
| registries | — | `config-keys.json` golden, `config.test.js`, `lane.test.js`, `goldens.test.js`, `verify-contracts.js` SEED_EMPTY: 94 → 95 |

Graph suite: **105 passed, 0 failed** (11 files). `npm run verify`: package OK, contracts OK.

## The pause table — 1.8.1 vs 1.8.2, same tree, same machine

`node eval/fixture-graph/engine-compare.js <repo> <saved 1.8.1 bin files>` — both
engines build the same checkout into separate stores.

| | django/django 1.8.1 | django/django **1.8.2** | nestjs/nest 1.8.1 | nestjs/nest **1.8.2** |
|---|---|---|---|---|
| files / symbols | 3,040 / 44,160 | 2,977 / 44,572 | 1,925 / 5,729 | 1,925 / 6,139 |
| build (ms) | 12,524 | 13,746 (+10%) | 3,141 | 4,019 (+28%) |
| index / resolved (KB) | 21,712 / 11,541 | 22,120 / 14,862 | 4,240 / 2,833 | 4,594 / 1,961 |
| confident edges | 65,379 | **72,955 (+12%)** | 7,288 | **9,426 (+29%)** |
| maybe (ambiguous) | 606,208 | 598,519 | 81,485 | **33,906 (−58%)** |
| states I · L · U · R | 20,882 · 20,631 · 23,866 · — | **40,293** · 25,564 · **6,442** · **656** | 2,415 · 2,916 · 1,957 · — | **5,437** · 3,370 · **275** · **344** |
| `ctx` widest symbol, in-process (ms ×3) | 364 / 365 / 330 | 377 / 389 / 460 | 116 / 85 / 91 | 106 / 100 / 78 |

Reading it:
- **UNIQUE guesses fall by 73% (django) and 86% (nest)** and IMPORT roughly
  doubles: `self.x.y()` / `this.x.y()` through an alias now resolves through the
  import that bound the class, instead of "the only `y` with a class called
  `x`". Same edge, a fact instead of a guess.
- **ROUTE edges exist**: 656 on django (its test client URLs reach `path()`
  routes), 344 on nest (`request(server).get(...)` in the e2e tests).
- Django lost 63 files: `django/contrib/admin/static/admin/js/vendor/*.js`
  (jQuery, XRegExp, Select2) are under `vendor/`, one of the new default
  skips — vendored code was indexed before and is `excluded` now.
- The django `resolved.json` grew 29%: aliases turn maybe COUNTS into caller
  ROWS. The nest one shrank 31% for the opposite reason (fewer maybes). A
  django `ctx` end to end is ~830–930 ms (was ~680–730); the in-process read is
  within noise; the difference is the larger cache parse (112 ms from 64) plus
  node's ~300 ms start-up, which DE-I/W8 is about.
- Build cost: +10% django, +28% nest — the alias, decorator and re-export regex
  passes. `EST_MS_PER_FILE` moved 3.5 → 5.6 (django, measured) so the first-build
  estimate line does not under-promise.

## Decisions taken (added to CHECKPOINT-1.8.2.md)

W1-bare-method · W1-chained-new · W1-go-package · W1-route-name-from-file ·
W1-tail-match · W1-mask-prefix · W2-ignore-scalar (a comma-separated string, not a
YAML list — config values are scalars and `orc config set` takes one value) ·
W2-shadow-is-maybe (a shadowed alias falls back to the 1.8.1 AMBIGUOUS hint, never
a confident edge and never silently dropped) · W2-alias-external (an alias to a
class the repo does not define is UNRESOLVED) · W2-oneline-class · W2-glob-depth.

## What W1/W2 did NOT do (stated, per the plan)

- Go struct embedding (G3 scope), Swift/Scala/Dart (DE-F), borrowed TS/Go
  parsers (G7 → W6), the five new languages (G6 → W5), `--source`, `--for-slice`,
  the hook matchers (W3), doc notes (W4), the gain meter (W4b), `map` (W7),
  sharded reads (W8), and every user-facing doc except the contract's §2 (W9).
- A URL built from parts the parser cannot see (`url.join(base, "orders")`,
  a constant defined in another file) is still not an edge; the contract line
  says so.
