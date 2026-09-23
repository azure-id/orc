# EW1 + EW2 — generation, coverage, and the resolution cache

Date: 15-09-2026. Fixture for every number: django/django @ `abb9c04` (3,040 source files,
44,159 symbols), shallow clone in the session scratchpad. Never committed.

## EW1 — generation and coverage (E3)

E1 (the signature fast path) was DROPPED in EW0 by its own gate, so EW1 is E3 only.

| What | Where |
|---|---|
| `meta.generation` — an integer that goes up by one on every write that changes the index | `bin/graph.js` |
| `meta.gen_id` — 8 hex chars of sha1 over the sorted `path\0blob` list; the same tree indexed twice gives the same id | `bin/graph.js` |
| every graph `--json` answer carries `generation` + `gen_id`; the chat line says `gen N`; the trace says `gen=N` | `bin/cli.js` |
| per-file `coverage`: `full` · `partial` + line ranges · `skipped:<reason>` · `excluded` | `bin/graph-extract.js`, `bin/graph.js` |
| `orc graph coverage <file…> --if-enabled --json` — one batch call, exit 0 even when there are gaps | `bin/cli.js` |
| the card header carries the gap: `[blob a1b2c3 · current · coverage partial 327-466]` | `bin/graph-query.js` |
| `graph_used` is now `{targets, generation}` | executor template + 10 executors, `return-validation.md`, `code-graph.md` |

### What `partial` had to learn

The first build of the signal marked **57 of ORC's own 141 files** partial. Two false sources
were removed, and the third was made precise:

1. `matchPair` falls through to end-of-file whenever a pair does not close — but two of its
   callers scan SPECULATIVELY (a parameter list that is not one, a probe whose start is not the
   opening character at all). Those are not coverage gaps. Guarded on `a === "{" && s[open] === a`.
2. A symbol that hits `MAX_CALLS_PER_SYMBOL` was reporting its WHOLE range as partial. A test
   file whose `<module>` holds 400 calls is fully seen down to call 200; the gap starts at the
   first line that was dropped. Now it does.

Result: **36 of 141**, each naming a real truncated tail (`test/cli/config.test.js  partial 327-466`).
A signal that fires on 40% of files says nothing; this one says where the record stops.

## EW2 — the resolution cache (E2)

**The plan's E2 was built in full, measured, and then cut down to the half that pays.**

### Measured on django/django

| Read | compute-on-read | cached | delta |
|---|---|---|---|
| `loadModel` | 215 ms | 302 ms | +87 ms (the cache's own cost) |
| `ctx <symbol>` | 376 ms | 340 ms | −10% |
| `ctx <file>` | 702 ms | 458 ms | **−35%** |
| `impact <file>` | 644 ms | 455 ms | **−29%** |

Store: `index.json` 21.2 MB (unchanged) + `resolved.json` 11.3 MB + `names.json` 4.0 MB.

### Two pieces of the plan were built and then thrown away

**The resolver's whole MEMO — a net loss.** Storing every `resolveCall` answer is 21.7 MB. It
costs ~120 ms to read and parse, and saves less than that: the outgoing direction was never the
expensive part. Not stored. What IS stored is the REVERSE direction — who calls this symbol —
which is exactly what the 437 ms `callersOf` walk was computing. 6.2 MB.

**CLOSURE REPAIR — one percent.** Re-resolving only the changed file and its dependents,
against a plain full re-resolve, on the same one-line body edit, median of 3:

| route | ms |
|---|---|
| closure repair | 2,669 |
| full re-resolve | 2,695 |

On a JSON store the fixed costs — change detection (206 ms), loading the index (202 ms),
rebuilding the import map (92 ms), and rewriting the whole file — drown the resolve. An
incremental resolve cannot pay here. By the time those numbers came in, the property test had
already found **three** correctness bugs in it (below), so it is gone: `surface_hash`,
`pending`, `unique`, `importers`, `relopen`, the closure budget and the decline reasons are all
deleted. `route` is now `full` · `unchanged` · `skipped` · `failed`.

### The three bugs the property test found before the numbers ended the argument

They are recorded because they are what an incremental resolver costs, not because the code survived:

1. A DELETED file with no callers left an empty closure, so its own rows were never pruned.
2. Re-adding a file turned another file's `UNIQUE` edge AMBIGUOUS — a dependency on the NAME,
   not on any edge. Needed a `unique` map beside `pending`.
3. Deleting a file changed the resolution of every file that IMPORTED it, even with no
   confident edge into it. Needed an importer map, plus "a relative specifier that reaches
   nothing" for the add direction.

### One real bug the cache did find in existing code

`impact` and `callersOf` had an UNSTABLE order: same rows, different sequence, depending on
whether a cache file happened to exist. Both now sort on a total key (file, line, id), so a card
is diffable run to run. This was a latent defect — the cache only made it visible.

### The invariant, as a test

`test/cli/graph-resolve.test.js` — a seeded edit script (rename, delete, re-add, add a
same-name function, move an import, edit a body, call a name nothing defines). After EVERY step
it runs `ctx` on every file, `ctx` on every symbol and `impact` on every file **twice** — once
through the cache, once with the cache refused — and compares the answers whole, order
included. 30 steps by default (`ORC_GRAPH_RESOLVE_STEPS` raises it; 200 was run by hand and
passes). It also holds: generation mismatch, truncated cache, foreign engine, deleted cache,
and a symbol named `constructor`.

Cross-checked on Django: 14 of 14 `ctx` / `impact` / `path` answers are byte-identical with and
without the cache.

## Prototype pollution, once and for all

Every map in `graph-resolve.js` is keyed by repository data, and a bare symbol name can be
`constructor`, `toString` or `__proto__`. The first build crashed on exactly that. All maps are
now `Object.create(null)` and read through an `own()` helper. `names.json` is the file a future
delivery hook reads, so a test pins it: `own(names, "constructor")` is an array,
`own(names, "hasOwnProperty")` is `undefined`.

## Gate

- `npm run verify` green — 192 contracts.
- `npm test` green — **992 passed, 0 failed**, 63 files.
