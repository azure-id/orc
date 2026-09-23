# EW5 + EW6 — lean cards, cheap signals, and the lanes that use them

Date: 16-09-2026. Builds on `EW0-spike.md`, `EW1-EW2.md`, `EW3-EW4.md`.
Fixtures: this repo (141 files) and django/django @ `abb9c04` (3,040 source files).

## EW5 — E6, and the gate that split

### The gate

§7: *on the fixture AND on Django, the median card is ≥ 15% fewer tokens at the same kept
rows, counted with the same `tok()` the budget uses.* Measured over every file in the fixture
and a 120-file sample of Django, excluding any card whose kept-row count differed between the
two formats (so it is a like-for-like comparison, never a comparison against truncation).

| Card | ORC repo | Django | Gate |
|---|---|---|---|
| `ctx <file>` | **−17.4%** | **−20.6%** | **PASSES on both** |
| `impact <file>` | 0.0% | −7.1% | **FAILS the 15% bar** |

### What the first measurement taught, before the gate could be applied

The first build made `impact` **+1.8% on this repo — bigger, not smaller**. The reason is
structural and it applies to every tabular format: a column header and a directory-prefix line
are FIXED costs. On a two-row card they cost more than the columns save.

So `--format tree` was redefined: **build both bodies, print the smaller, and report which one
was used.** It can now never be worse than prose, and a small card correctly stays prose and
says `format: "prose"`. That change is what took `impact` from +1.8% to 0.0% on this repo.

### The verdict, stated plainly

- **The file card ships the tree format** — it passes its gate on both repos.
- **`impact` keeps the flag** because the code path is shared and it is now provably never
  worse — but it **does not meet the 15% bar**, and that is recorded here rather than rounded
  up. If the user would rather hold the whole of E6 to the gate, `impact` should stop honouring
  `--format tree`; the change is one condition.

### Also in E6

`--offset` pages the symbol rows of a file card and the caller rows of `impact`. **Paging is not
truncation**: `total_symbols` is a fact about the file and never moves, `has_more` says whether
there is another page, and the budget footer still says what it hid.

## EW5 — E7, four signals that cost no model tokens

| Signal | What it is | The rule that keeps it honest |
|---|---|---|
| `orc graph changes [--base <ref>]` | the symbols THIS diff's hunks OVERLAP, with callers, tests, and `high`/`medium`/`low` | every row carries `why` — `exported · fan-in 4 · no test reaches it`. A rating nobody can check is a rating nobody should act on |
| `importance` | `sqrt(fan-in)`, ×0.1 for private, ×0.1 for a name defined in ≥ 5 files, ×0.1 for test code | the square root is the point: 100 callers does not mean ten times more important than 10, it means a utility |
| `tests` | test files reaching a file by CALL **and** by NAME | a test that imports a module without naming a symbol is still its test, and the graph alone would never find it |
| `orc graph cochange <file>` | files that changed WITH it ≥ 3 times in 6 months, ignoring commits over 20 files | it is HISTORY, not structure. The card says so, the lane contract says so, and exit 4 ("this file changes alone") is an ANSWER |

`changes` replaces a whole-file `impact` at review: a file card reports every symbol in a
touched file, and **a symbol nobody edited is not a finding**. It also HEALS on the paths the
diff names before it answers — a reviewer told "nothing depends on this" by a stale index is
worse served than one told nothing at all.

`importance` now orders the file card. On `bin/graph-notes.js` that moves three exported
functions above a private helper with a fan-in of 17, which is the whole point.

Co-change is cached per HEAD in `cochange.json`: history cannot move under a working-tree edit,
so the cache is valid exactly as long as HEAD is.

## EW6 — the lanes, the catalogue and the lint

- **`phases/review.md`** now calls `orc graph changes`, and says why it is not `impact`.
- **`phases/planning.md`** adds `orc graph cochange` per candidate file, with "never a
  dependency" written into the instruction rather than left to be inferred.
- **`read-ladder.md`** tells an agent that a `[orc graph]` line is repository data, and that a
  `coverage partial` header names lines to read in the source.
- **Three new `orc lane calls` rows** — `graph-coverage`, `graph-changes`, `graph-cochange` —
  all `lanes: ["orc", "orc-diy"]`. The catalogue lint MEASURES a lane's calls from the text
  under its own folder, so the `orc` constellation line and the `orc-diy` flow-schema row were
  **lengthened** to name them. No spine gained a line; the budgets are unchanged
  (orc 256 · orc-mini 268 · orc-fast 237 · orc-quick 379 · orc-diy 142).
- **Two new trace verbs** defined before any lane can emit one: `GRAPH-CHANGES`,
  `GRAPH-COCHANGE`.
- The signals are wired to the WAVE lanes only. A single-executor lane has no planning phase to
  spend a co-change on and no review phase to spend `changes` on, and a catalogue row wider than
  the lanes that really call it is a catalogue that lies.

## Gate

- `npm run verify` green — 192 contracts.
- `npm test` green — **1021 passed, 0 failed**, 65 files.
- `test/goldens/diy-compile-default.md` regenerated: the DIY flow is COMPILED from the phase
  files, so a review-phase edit is expected to appear there.

## Carried forward

- `orc graph coverage`, `changes` and `cochange` have catalogue rows and phase instructions, but
  **no `orc ui` surface and no README line** — that is EW7.
- The `GRAPH-HINT` phase line is defined in `phases/trace.md`; no lane spine yet instructs a
  phase close to emit it. It needs one line in `phases/trace.md`'s emit list, and the budgets
  have room. EW7 or a follow-up.
