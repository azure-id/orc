# W7 (D4) — `orc graph map`, and the gate that chose its own fallback

Wave W7 of `code-graph-notes/06-IMPROVEMENT-PLAN.md` §3 (D4), on branch
`feat/orc-graph-2`. Nothing is committed.

## What was built

`orc graph map [--focus <files or names…>] [--budget N] [--if-enabled] [--json]`
— the one graph read that needs no operand, because it answers the question a
planner asks before it knows a single file name.

| Piece | Where |
|---|---|
| the ranking engine | **NEW** `bin/graph-map.js` — the file graph, PageRank, the two knock-downs, `map.json` |
| the card | `bin/graph-query.js` `graphMap()` — what a row says, and how the list is cut |
| the route | `bin/cli.js` `graphCmd()` — `sub === "map"`, `GRAPH-MAP`, one gain-ledger row |
| the counterfactual | `bin/graph-gain.js` `mapCost()` |

Nodes are files. An edge runs from a REFERENCING file to a DEFINING one, which
is exactly the shape `resolved.json` already holds, plus one edge per resolved
import. Edge weight is the SQUARE ROOT of the confident calls between the pair:
a file called a hundred times from one place is one import used in a loop, not
ten times the landmark of one called ten times.

Two knock-downs, applied after the rank: a test file ×0.1 and a file whose every
symbol is private ×0.5.

## `map.json` — 335 KB, and it earns it

Written by `update`, inside the same lock, from the `callers` object
`graph-resolve.build` already holds. It stores the file list, the edges and the
UNFOCUSED rank — and deliberately **not** the symbols, which come from the model
a read command has loaded anyway. Storing them again would be `wide.json` twice.

| | django/django (2,977 files) |
|---|---|
| `map.json` | **334.6 KB** (next to `index.json` at 22.2 MB) |
| edges | 12,850 |
| `orc graph map`, no cache | 971 · 954 · 973 ms |
| `orc graph map`, with cache | 803 · 783 · 786 ms |

~175 ms, and the rest is the `index.json` parse plus ~300 ms of node start-up —
the same wall every read command hits, and the one W8 is about.

Losing `map.json` costs that 175 ms and **not one byte of the answer**; a test
drives both paths and compares the cards. It is generation-pinned like every
other derived file here, and a cache naming another generation is not used.

### Is the ranking any good

django, unfocused, top rows: `django/utils/functional.py`,
`django/core/exceptions.py`, `django/conf/__init__.py`,
`django/db/models/expressions.py`, `django/db/models/fields/__init__.py`,
`django/apps/registry.py`. Those are django's landmarks, and no one told it so.

## Two decisions the build had to make

| # | Decision |
|---|---|
| **W7-focus-baseline** | Every file keeps a personalisation share of 1 and the focus gets `100/n` ON TOP. The literal reading of the plan's "focus files get 100/n" gives the focus the whole vector, which leaves every file the focus does not reach at exactly ZERO — and a hundred tied zeroes sort alphabetically. That turned the rest of the map into a directory listing wearing a ranking's clothes. Caught by eye on the Express fixture, and a test now holds the line: the unfocused remainder must not be in alphabetical order. |
| **W7-map-prefix** | The map is cut to a PREFIX of the ranking, by binary search over the row count, never by `fit()`'s greedy pass. `fit` is right for a card of independent sections and wrong for a list whose whole meaning is the ORDER: it skipped one long row and took a shorter row four ranks below it, and a reader who sees rank 10 present and rank 7 missing cannot use the order for anything. `fit` still does the budget arithmetic and the footer reserve — it is handed a list it can keep whole. |

One defect found and fixed during the tests: the "rank is a HINT" caveat was
being appended by the CLI to the human line, so the `--json` reader — the only
consumer that exists — never saw it. It is now a pri-0 item INSIDE the card,
charged to the budget like every other row, so both paths carry it.

## The M2 gate — NOT met, and the plan had already said what to do

`node eval/graph-replay.js ~/.claude/projects/C--dev-orc-eval <django> --calls`

| window | windows | searches | whole reads | planning sweeps | answerable / window |
|---|---|---|---|---|---|
| all | 245 | 190 | 983 | 16 | 0.24 |
| **main session** | **41** | 84 | 428 | **16** | **0.93** |
| subagents | 204 | 106 | 555 | 0 | 0.10 |

**The gate: ≥ 3 answerable planning calls per fixture run. Measured 0.39
planning sweeps per main window** (16 over 41). Eight times under.

W0 already saw this coming and wrote it down: *"on the fixture set the D4 gate
is NOT met by this count — 22 sweeps over 41 main windows."* The number has
moved (22 → 16, on a rebuilt django index) and the reading has not.

**Unlike W6, this needed no user decision, because the plan had already made
it.** DE-H: *"`orc graph map` consumers — (a) planner + analyst + quick if M2
shows ≥ 3 answerable calls; else (b) planner only."* The measurement chose (b).

So: the analyst wiring and the `/orc-quick` Q1 wiring were **built, then
removed**. `templates/skills/orc-analyze/references/orientation.md` was written
and deleted; the `/orc-quick` Q1 paragraph was written and deleted;
`LANE_CALLS["graph-map"].lanes` went from four lanes to `["orc", "orc-diy"]`.

The honest caveat on the number, recorded and NOT acted on: the fixture
transcripts come from an eval sandbox driving lanes over a fourteen-file Express
toy, where a planner has nothing to sweep. A planner on django would sweep. That
is a reason to re-measure on a real repository in a later version — it is not a
reason to overrule a written decision with a measured trigger, which is the
mistake W6 was careful not to make either.

## Registered in the same wave

`bin/verify-package.js` gains `bin/graph-map.js`. `bin/verify-contracts.js`
gains three tokens — `orc graph map`, `GRAPH-MAP`, and
`a HINT about where to look first` (the map's equivalent of "the graph is a
LOCATOR"). **202 → 205 contracts.**

## Tests

`test/cli/graph-lanes.test.js` — **11 NEW**, one promise each: it ranks; a test
file is pushed down; `--focus` takes a file or a NAME and does not flatten the
remainder; a focus miss is an answer; a small budget gives a PREFIX of the long
map; a map that hid nothing prints no footer; the exit codes; `map.json` is
derived and generation-pinned.

- `test/cli/graph-lanes.test.js`: 11 tests, 11 passed.
- `node eval/fixture-graph/check.js`: **0 FAIL across 9 fixtures, 86 rows.**
- `npm run verify`: 40 skills · 49 agents · **205 contracts**.
