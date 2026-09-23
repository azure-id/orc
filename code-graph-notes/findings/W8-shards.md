# W8 (S1) — sharded reads: `ctx <symbol>` at 480 ms instead of 881 ms

Wave W8 of `code-graph-notes/06-IMPROVEMENT-PLAN.md` §5 (S1, decision DE-I), on
branch `feat/orc-graph-2`. Nothing is committed.

## The problem, restated by its own history

EW0 dropped sharding because the parse (235 ms) was smaller than the resolve
(437 ms). EW2 then removed the resolve half by storing the reverse edges. What
was left is the parse — a one-symbol `ctx` opening a 23 MB `index.json` and a
15 MB `resolved.json` to answer a question about a dozen records.

## What was built

**NEW `bin/graph-shard.js`** — `resolved/<ab>.json`, where `<ab>` is the first
two hex characters of the file's blob, which is the shard layout `blobs/`
already uses. Four maps per shard:

| | |
|---|---|
| `callers` | what `resolved.json` holds, for targets whose FILE hashes here |
| `maybe` | the AMBIGUOUS-caller counts, sharded with the callers they belong to |
| `calls` | the FORWARD half — `{u, r}` per symbol, `r` positional against the symbol's `calls` array, `u` the count that resolved to nothing |
| `cands` | the AMBIGUOUS candidate lists, INTERNED per shard |

The forward half is collected in the SAME pass `graph-resolve.build` already
runs, so every resolution is computed once and written twice, never computed
twice. `calleesOf` reads it instead of resolving; the dedupe-by-name and the
order are untouched, because the rows are keyed by the call's INDEX.

### The rule that makes it safe

**The fast path answers exactly what the full model answers, or it does not
answer at all.** `fastModel()` returns null the moment it cannot PROVE the card
would be identical, and the caller loads the full model as before. Every reason
is named in `read_fallback`, and the answer always carries `read: sharded|full`
— a fast path that quietly stopped being fast is otherwise invisible.

It declines a path, a URL, a `file:line`, anything with a space, a name at or
above `names.json`'s five-row cap (where "these are all of them" stops being
knowable), a bare name that is not exactly one symbol's qname, a duplicate qname
inside one file, a stale or missing shard, `--for-slice`, a file card, and any
call naming more than one target.

## The gate — MET

`node eval/fixture-graph/shard-diff.js <repo> <N>` renders each sampled symbol's
card twice in one process and compares them byte for byte.

| | django/django (2,977 files) | nestjs/nest (1,925 files) |
|---|---|---|
| symbols sampled | 400 | 400 |
| fast path answered | 327 | 250 |
| **IDENTICAL** | **327** | **250** |
| **different** | **0** | **0** |
| declined: name at cap | 42 | 70 |
| declined: ambiguous qname | 25 | 51 |
| declined: path or URL | 6 | 29 |

**577 comparisons across two repositories, zero differences.**

| `ctx <symbol>`, load + answer, IN PROCESS | django | nest |
|---|---|---|
| full model | 360.9 ms (p95 413.2) | 50.5 ms (p95 63.0) |
| **sharded** | **50.1 ms (p95 62.1)** | **8.3 ms (p95 18.3)** |

**The plan's gate was < 150 ms on django, from 340 ms. Measured 50.1 ms.**

The whole user-visible call, three runs each on django:

| | ms |
|---|---|
| full model | 881 · 891 · 882 |
| **sharded** | **487 · 479 · 475** |

**881 → 480 ms, a 45% cut.** The floor is node's own start-up (~300 ms on this
machine), which W0 measured and no Node command can go below. Of the ~580 ms
that was above the floor, the shards remove ~400.

## The disk cost, which the plan did not budget

django's shard set is **30 MB** next to a 23 MB index and a 15 MB
`resolved.json`. The whole `.claude/orc/graph` directory goes from about 87 MB
to 117 MB — blobs included.

It was **47 MB** until the candidate lists were interned. A name that is
ambiguous is ambiguous the same way everywhere it is called, so the same list
was written once per call site: 35,730 AMBIGUOUS rows carrying 25.3 MB of
candidate lists, against 8.2 MB when each distinct list is stored once per
shard and the row carries its index. **68% of that half, 17 MB of the whole.**

Interning is per SHARD, not global, because a shard is the unit a reader parses
— a table shared across shards would mean opening a second file to render one
row.

The update pays nothing measurable for any of it: django 3,767 ms before the
wave, **3,646 ms** with the map and the shards both being written.

`orc graph gc` now removes a shard set the current generation will never read.
An update replaces the set wholesale, so the only way to get one is a crash
between two writes — but 30 MB nobody will ever open is worth a line of code.

## One decision, and one thing it forced

| # | Decision |
|---|---|
| **W8-gain-basis** | A sharded read records `basis.grep_hits: null`, never a confident zero. `nameHits` counts the lines a grep would have returned by walking the whole call index — which the fast model, holding a dozen files, does not have. Returning 0 would have quietly shrunk the gain estimate as the fast path spread, and a falling estimate would have looked like a falling saving. `orc graph gain` now reports `unsized`: how many rows it could not size, in its own line. K2's rule is that the counterfactual is written down; a made-up basis is worse than none. |

One defect found by the first timing run and fixed: the fast path was gated on
`!healed`, and `healOnRead` returns a `skipped` object when the last update was
over the heal cap — which django's is. So the fast path never fired on the one
repository it was built for. A skipped heal changes nothing on disk, and a heal
that DID run rewrote the shards in the same locked pass, so the guard was wrong
either way and is gone.

## Registered in the same wave

`bin/verify-package.js` gains `bin/graph-shard.js`. `bin/verify-contracts.js`
gains `resolved/<ab>.json`. **205 → 206 contracts.**

## Tests

`test/cli/graph-shard.test.js` — **10 NEW**. The first drives seven queries
covering a plain call, an alias call, an inherited member, a route, an ambiguity
and a leaf, then renames the shard directory away and asserts the card, the
callers, the calls, the effects, the tests, the maybe count and the unresolved
count all match. The rest: the interning table round-trips; `--source` is
charged identically; each decline reason fires; a multi-target call never goes
fast; a stale shard is refused and the answer is unchanged; an update rewrites
the shards and the card follows the code; `gc` removes a dead set; the ledger
records a null basis and `gain` counts it.

- graph suite (16 files): **162 tests, 159 passed, 0 failed, 3 skipped** (no
  TypeScript on the machine; `ORC_TEST_TS_DIR` runs them).
- `node eval/fixture-graph/check.js`: **0 FAIL across 9 fixtures, 86 rows.**
- `npm run verify`: 40 skills · 49 agents · **206 contracts**.

NEW eval script, git-ignored: `eval/fixture-graph/shard-diff.js`.

## The hole the LAZY read left, and the K6 bug it uncovered

The fast model reads blobs lazily, so a blob that will not parse is discovered
when the card is already half built. `ctx` then does `if (!target) continue` and
the row is silently DROPPED — a different card, not a slower one, which is
exactly what "identical or absent" forbids.

`loadFile` now THROWS `FastUnavailable` on a file the index holds whose blob
will not read (a path the index never held is still a plain `null`: the full
model does not know it either, and both answer the same "no"). The CLI catches
it and rebuilds the answer from the full model. A throw is the right shape here
precisely because it cannot be ignored.

Writing the test for it found two more defects, both real and both older than
this wave:

1. **The fallback replaced the model for `ctx` and for nothing else.** `model`
   was `const`, so the catch built a local full model, rendered the card from
   it, and then handed the ALREADY-FAILED fast model to `gainRowFor`. The
   command crashed. `model` is now `let` and the catch reassigns it.

2. **The gain meter could fail the read it was measuring.** `graphGainAppend`
   has always been fail-quiet, but `gainRowFor` — which PRICES the answer, walks
   the model and can throw — was evaluated as its ARGUMENT, outside that
   wrapper. K6 says the ledger must never block; it could. The call is now
   inside its own try.

This is the second time this build has found that a wrapper protected the wrong
half of an expression (the first was the W3 footer reserve). Both were invisible
until something downstream threw for an unrelated reason.

`test/cli/graph-shard.test.js` gains a tenth test: corrupt a CALLER's blob — not
the target's — and assert the read falls back, names the file in
`read_fallback`, and still prints the caller row.
