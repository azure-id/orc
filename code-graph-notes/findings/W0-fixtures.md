# W0 — fixtures, the call count, and the S1 spike (20-09-2026)

Plan: `06-IMPROVEMENT-PLAN.md` §8 row W0. Everything here cost 0 model tokens.

## M1 — four fixtures with answer keys

Under `eval/fixture-graph/<name>/` (git-ignored, like all of `eval/`), each with
an `answer-key.json` that names every caller of every target by `file:line` and
the CLASS of edge the graph must produce:

| class | meaning | state the checker demands |
|---|---|---|
| `direct` | the caller names the symbol | LOCAL / IMPORT / UNIQUE |
| `route` | a URL literal reaches a route symbol | `ROUTE` |
| `alias` | an instance variable stands for the class | confident + `alias` set |
| `inherited` | `this.m()` resolves to a base-class member | confident + `inherited` set |
| `barrel` | the name is imported through a re-export | IMPORT (or UNIQUE) |

| fixture | files | symbols (1.8.1) | keys | rows | what it exercises |
|---|---|---|---|---|---|
| `express` | 12 | 19 | 11 | 24 | `app.use` mounts, `router.get` routes, supertest URLs, `new OrderStore()` aliases, `extends BaseHandler`, a `require("./index")` barrel |
| `nest` | 9 | 16 | 10 | 17 | `@Controller("orders")` + `@Get(":id")` decorators, constructor param-property aliases, class-field aliases, `export * from` barrels, `extends BaseController` |
| `fastapi` | 10 | 17 | 9 | 14 | `APIRouter(prefix=)` self-mount + `include_router(prefix=)` external mount, `@router.get` decorators, `TestClient` URLs, module-level `service = OrderService()` alias, `__init__.py` barrel, `class OrderService(BaseService)` |
| `go` | 5 | 18 | 8 | 12 | Go 1.22 `mux.HandleFunc("GET /orders", h)` patterns, `httptest.NewRequest` URLs, `s := NewStore()` aliases, a handler passed by name |

**`test/goldens/graph-1.8.1/`** — the migration golden (§7): `fixture.json` is the
Express fixture's source as ONE bundle (`{rel: text}` — the test runner treats
every `.js` under `test/` as a test file, which the first full run proved by
running the fixture itself as seven failing tests), `store/` is `meta.json`, `files.json`, `index.json`,
`resolved.json`, `names.json` and `notes.jsonl` (three notes applied under model
`golden-1.8.1`) as the 1.8.1 engine (`graph@4`, `RESOLVE_SCHEMA 2`) wrote them
on 20-09-2026. Generated BEFORE any engine change. `graph-upgrade.test.js` (W2)
copies both into a temp repository and drives the upgrade.

The checker: `node eval/fixture-graph/check.js [name…] [--json] [--keep]` —
copies each fixture into a temp git repo, indexes it with the WORKING-TREE
engine, and reports PASS/FAIL per key row. Exit code = failing rows. A caller
the key does not name is reported as `extra` (an invented edge fails the row).

### Baseline on the 1.8.1 engine — `findings/W0-baseline-1.8.1.json`

**1 of 38 keys resolves.** `express searchByItemPrefix` passes because its two
callers (`orders.js:13` IMPORT, `reports.js:5` via the barrel) happen to fall to
the UNIQUE rung — right by luck, as §2 G4 predicted. Everything else:

- every `route` target is `target none` — no route symbol exists for a decorator
  route, and no URL is an edge
- every `alias` caller is either MISSING (a `maybe` on the AMBIGUOUS pile: the
  head `store` matches no class) or wrongly UNIQUE with no `alias` mark
- every `inherited` caller is UNIQUE with no `inherited` mark — right by name
  uniqueness, and it would be AMBIGUOUS the moment a second class defined `ok`
- `barrel` callers on nest/fastapi are MISSING (the import resolves to the
  barrel file, which defines nothing)
- go: `health` passed by name in `routes.go:11` is missing (Go had no `ref`
  rung until now)

This is the W1/W2 gate: `check.js` prints `0 FAIL`.

## M2 — `eval/graph-replay.js --calls`

New mode. Counts, per transcript window, the round trips the NEW edges and a map
could answer: URL-path searches (ROUTE), `.member(` searches for a known name
(ALIAS), whole-file reads of a test file within 3 turns of a search (the `tests`
line), and Globs / whole-file indexed reads in the first 8 turns of a main-session
window (the D4 map). Shapes only — never a claim the agent would have stopped.

| transcripts | windows | searches | whole reads | url | member | test read | planning sweep | answerable / window |
|---|---|---|---|---|---|---|---|---|
| `../orc-eval` (245 windows, 41 main) | 245 | 190 | 983 | 5 | 0 | 4 | 22 | 0.13 all · **0.61 main** · 0.03 subagent |
| this repo's own sessions (75, dev work) | 75 | 1,905 | 157 | 25 | 71 | 1 | 0 | 1.29 |

Reading: on the fixture set the D4 gate (≥ 3 answerable planning calls per run)
is NOT met by this count — 22 sweeps over 41 main windows is 0.54 per window.
D4 is W7 (extension) and this number is carried there as the first evidence
against building it on the fixture set alone; a larger repo may differ. The ROUTE
and ALIAS shapes exist in real transcripts (5 and 0 on the eval set, 25 and 71
on dev sessions), which is what W1/W2 need: the edges answer a question agents do
ask, even though the count is small.

## S1 spike — sharded reads (DE-I)

django/django, the round-3 clone, 1.8.1 store on disk. One `orc graph ctx
slugify` end to end, three runs: **727 · 671 · 681 ms**. Inside the process:

| step | ms |
|---|---|
| node start-up (an empty `node -e 0`) | ~296 |
| `index.json` parse (21.7 MB) | 176 |
| `resolved.json` parse (11.5 MB) | 64 |
| `names.json` parse (4.0 MB) | 29 |
| `loadModel` total (parse + maps) | 341 |
| `ctx <symbol>` on a loaded model | 5 |
| `ctx <file>` on a loaded model | 158 (importers scan) |

**DE-I decision: (b) in principle, deferred to W8.** The in-process gate
(< 150 ms) is reachable — a symbol read needs `names.json` (29 ms), a handful
of blobs and one resolved shard — but the user-visible call cannot go below
node's own ~300 ms start-up, so the whole-call gain is ~680 → ~400 ms, not
340 → 150. Worth doing as an extension; not worth doing before the correctness
waves. No sharding is built in W1/W2.

## Decisions taken for W1/W2 (from §10, the recommendations)

DE-A (a) `1.8.2` · DE-B (a) `ROUTE` is a new state word · DE-C (a) — deferred to
W3 · DE-I (b) deferred to W8 · DE-K (a) — W4.
