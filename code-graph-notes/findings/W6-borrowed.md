# W6 (G7) — the borrowed toolchains, and the gate they did NOT meet

Wave W6 of `code-graph-notes/06-IMPROVEMENT-PLAN.md`, on branch
`feat/orc-graph-2`. Nothing is committed.

> **Read this first.** The two rungs are BUILT, tested and currently ON. They
> did **not** meet the plan's exit gate, and the plan says a rung that misses
> its gate is not shipped. The numbers are below, and the decision is the
> user's — see "The open decision" at the end.

## What was built

Two more borrowed rungs, on the contract the Python `ast` rung set in 1.8.0:
one batch, exact ranges, ORC itself still has zero dependencies, a failure
falls back PER FILE, and `ORC_GRAPH_NO_BORROW=1` forces the heuristic back.

| Rung | How it is borrowed | Tag |
|---|---|---|
| TypeScript **and** JavaScript | `require(<root>/node_modules/typescript/lib/typescript.js)` IN PROCESS. `ts.createSourceFile` only — no `Program`, no type checker, because an update that takes minutes is an update nobody runs. `.js`/`.jsx` get `ScriptKind.JS`, so a TS project gets an exact JS parse too. | `typescript@5.9.3` |
| Go | A ~260-line Go program held as a string, written once per CLI process to the OS temp directory and run with `go run` over the batch — JSON in on stdin, JSON out on stdout. It imports only `go/parser`, `go/ast`, `go/token`, `encoding/json`, `os`, `strconv`, `strings`: no module fetch, no network. | `go-ast@1.24.0` |

The walker emits the SAME shapes the heuristic builds — the `piece` forms
`argPieces` produces, the raw dotted call names `normCall` expects — so
`finalize`, `urlOf`, `mountOf`, `decoRoute` and the alias pass are ONE code
path for both rungs. That is what makes "a card must not change meaning
because a dependency happened to be installed" checkable, and it is checked.

Five decisions had to be made.

| # | Decision |
|---|---|
| W6-raw-names | A borrowed rung emits the RAW dotted call name (`this.ok`, `super.m`), never a normalised one. `extractOne` normalises every rung in ONE place; normalising twice silently loses `self`, and with it every inherited edge. This was the first defect found and it cost the nest fixture 10 of its 10 keys. |
| W6-callee-line | A call's line is the line of the CALLEE's own name, not of the whole expression. In `request(app)\n  .post("/orders")` the call a reader points at is `.post` on line 18, which is what the heuristic reports and what the answer key holds. The AST's node start is line 17. |
| W6-bare-tail | A receiver the parser cannot name (`request(app).get(…)`, `rows[0].id`) leaves the BARE member name, exactly as the heuristic's chain regex does. Dropping the call instead would lose the URL it carries — and W1's rule already stops a bare name becoming a method edge. |
| W6-commonjs | `const x = require("m")` is an import. Without it an Express mount cannot be followed, because `app.use("/orders", ordersRouter)` has no way to learn which FILE `ordersRouter` is. The AST walk covers the ES forms; `module.exports = { … }` is still read out of the source by the heuristic half, and the two export sets are merged. |
| W6-route-half | A borrowed rung still runs the heuristic's ROUTE pass, because a route handler is ANONYMOUS and an AST has no name to give it. Its brace matching must not then report the file `partial`: an AST read every byte, so the coverage counter is reset after that pass. |

## The gate, measured

`node eval/fixture-graph/borrow-compare.js <repo>` indexes one repository twice
with the working-tree engine — once borrowed, once with `ORC_GRAPH_NO_BORROW=1`
— and reports the CONFIDENT resolution rate: of every non-ref call recorded,
the share resolving to one symbol (`LOCAL` · `IMPORT` · `UNIQUE` · `ROUTE`)
rather than to a candidate list (`AMBIGUOUS`) or to nothing (`UNRESOLVED`).

**The plan's gate: confident rate up by ≥ 10 points, partial rate down.**

| Repository | Rung | Files | Confident (heuristic → borrowed) | Δ points | Partial |
|---|---|---|---|---|---|
| `nestjs/nest` | TypeScript | 1,925 | 18.5% → **19.5%** | **+1.0** | 2.4% → 2.4% |
| `vuejs/core` | TypeScript | 528 | 22.5% → **22.2%** | **−0.3** | 14.4% → 13.6% |
| `gohugoio/hugo` | Go | 938 | 21.1% → **20.8%** | **−0.3** | 1.0% → 1.3% |

**The gate is not met, on any of the three.** It is not close.

### Why — and what the borrow DID buy

The confident rate is dominated by calls into EXTERNAL packages, which no
parser can resolve: 72% of nest's calls are `UNRESOLVED` and almost all of
them are `@nestjs/*`, `rxjs` and node builtins. An exact parse cannot make a
package that is not in the tree appear in the tree.

What moved is the make-up of the confident set, and it moved the RIGHT way:

| | nest | vuejs/core | hugo |
|---|---|---|---|
| `UNIQUE` (a repo-wide GUESS) | 264 → 272 | 738 → **475** | 917 → **554** |
| `IMPORT` (a FACT about a binding) | 5,045 → **5,107** | 3,707 → **3,853** | 3,319 → **3,431** |

`UNIQUE` falls by 36% on vuejs/core and 40% on hugo, and `IMPORT` rises. That
is the same correction W1 shipped and the same trade the W2 pause recorded: the
graph stops guessing and starts either knowing or saying it does not know.
Measured as "confident edges" it looks flat; measured as "invented edges" it is
a real improvement.

The `partial` rate barely moves because the partials were never parse failures.
They are the 200-call cap (`MAX_CALLS_PER_SYMBOL`) firing on a module symbol —
a legitimate report, and one an exact parse does not change. **That also
re-frames the W5 partial numbers**: `coverage partial` means "I stopped
recording here", which includes a cap, not only "I lost the thread".

### The cost

| | heuristic | borrowed |
|---|---|---|
| nest, full build (1,925 files) | 3,345 ms | 4,514 ms |
| hugo, full build (938 files) | 2,549 ms | 3,264 ms |
| nest, ONE file changed | 0.90 s | 1.13 s (+0.24 s — the compiler load) |
| hugo, ONE file changed | 1.12 s | 1.82 s (+0.70 s — the `go run` spawn) |

The incremental number is the one that matters, because it is what the wave
close (`update --notes-pending`, D5) and the run-end hook pay every time.

## The answer keys — unchanged, which IS a gate it met

`node eval/fixture-graph/check.js` — **0 FAIL across 9 fixtures, 86 rows**,
with and without the borrow:

```
node eval/fixture-graph/check.js                      # 0 FAIL, 9 fixtures
node eval/fixture-graph/check.js --ts <dir with node_modules/typescript>   # 0 FAIL
```

`--ts` is new: it copies that directory's `node_modules/typescript` into every
fixture repository, so the same 86 rows are checked against the borrowed rung.
The Go fixture is parsed by `go/parser` whenever a Go toolchain is on PATH, so
its 8 rows already cover that rung both ways on this machine.

## Tests

`test/cli/graph-borrow.test.js` — 5 NEW tests, one promise each. The two that
need a TypeScript SKIP with a reason when the machine has none, exactly as the
Python rung's test does; point `ORC_TEST_TS_DIR` at a directory holding
`node_modules/typescript` to run them.

- Graph suite: **151 tests, 148 passed, 0 failed** (3 skipped without a TS).
- `npm run verify`: 40 skills · 49 agents · **202 contracts**.
- `npm test`: **1,085 passed, 0 failed, 1,088 tests, 73 files, 476 s.**

One flake, recorded because it happened: the first full run failed one test in
`test/cli/test-run.test.js` (the `/orc-test` lane, which stands up a local HTTP
server). The same file passed 12/12 on three consecutive runs afterwards and
the next full `npm test` was green. It is not in the graph and nothing in this
wave touches it.

## The open decision

The plan (§2, G7) says: *"A rung that does not meet its gate is not shipped and
the finding says why."* By the letter of that rule, neither rung ships.

Against that:

1. The gate's METRIC turned out not to measure what the borrow improves, the
   same way W4 found the plan's ">60% doc share" estimate wrong. The confident
   RATE is pinned by external packages; the invented-edge count is what moved,
   by 36–40%.
2. Removing an invented edge at the cost of a "confident" one is the exact
   trade W1-bare-method made, and this build already shipped it once.
3. The rungs cost 0.24 s (TS) and 0.70 s (Go) on every incremental update.

Three ways forward, and this is the user's call, not the builder's:

| Option | What it means |
|---|---|
| **A — ship ON** (current state) | Record a decision row saying the ≥10-point gate was the wrong metric, quote these numbers in the CHANGELOG, and keep `ORC_GRAPH_NO_BORROW` as the escape hatch. |
| **B — ship OFF, opt in** | Add a `code_graph_borrow` key defaulting to off. Costs a config key, a lint registration and a lane-contract line that the plan did not budget for. |
| **C — do not ship** | Keep the code in the branch, do not enable it, file this finding as the reason, and let a later version revisit with a metric that fits. W9's staging list then drops the W6 changes. |

Nothing below W6 depends on the answer: W7 (`orc graph map`) and W8 (shards)
read the store, not the rung that wrote it.

---

## SETTLED — 21-09-2026: option A, ship ON

The user chose **A**. Both rungs ship, ON by default. `ORC_GRAPH_NO_BORROW=1`
stays the escape hatch; no `code_graph_borrow` key is added, because a key that
only repeats an existing environment variable is a config surface that earns
nothing.

The reason recorded with the decision: the gate's metric could not see what the
borrow improves. The confident RATE is bounded by calls into external packages,
which no parser can resolve. The invented-edge count is what moved, by 36-40%,
and removing an invented edge at the cost of a "confident" one is the same trade
W1-bare-method already shipped in this build.

**This obliges W9.** The CHANGELOG must say the >=10-point gate was missed and
that the metric was wrong, and quote these numbers. It must not present the
borrow as having met its gate.
