# The complexity read — one line, with the numbers behind it

This replaces the full lane's scoring table. It asks one question: **is this
still a mini-sized change?** It answers with counts, not with a feeling, and
the answer is an OFFER — the user always chooses.

It runs after the planner returns and passes the exit gate, before dispatch.

## 1. The three calls

| Call | What you take from it | Exit codes |
|---|---|---|
| `orc graph impact <declared_files> --if-enabled --json` | confident callers OUTSIDE `declared_files`, the distinct files they sit in, the tests that reach | 0 found · 1 no graph · 3 off · 4 not found |
| `orc graph cochange <each declared file> --if-enabled --json` | partners with `count >= 3` that are not in `declared_files` | 0 rows · 1 no history · 3 off · 4 none |
| the planner's own `facets.risk[]` | the cited risk classes | — |

One `impact` call for ALL the declared files. `cochange` is one call per file.

**Exit 3 anywhere means the graph is off.** Print the `graph off` form of the
line (§3) and decide from `facets.risk[]` alone. Never invent a number.

## 1b. `graph_facts` — the same numbers, in the planner slice

The planner is dispatched BEFORE the complexity read, and it gets the same
facts, so it can ground its own plan on them instead of guessing:

```yaml
graph_facts:
  map: <the `map --focus` text, 800 tokens at most, or null>
  impact:   [{file, confident_callers, caller_files, tests_reaching}]
  cochange: [{file, partners: [{path, count}]}]
  generation: <n>
```

The graph off, or every call exit 3 → `graph_facts: null`, and the planner plans
as it did before. A `cochange` partner that is not in the plan becomes an
`open_questions[]` entry — never a file the planner adds in silence.

## 2. How to count

**Confident callers** are the edges the graph is sure about: `LOCAL`, `IMPORT`,
`UNIQUE` and `ROUTE`. A `ROUTE` edge is a test or a client that reaches the code
through a URL — it counts, because it breaks like any other caller.

**`AMBIGUOUS` callers are counted separately** and printed as `maybe <n>`. They
never trip a threshold on their own. The catalogue says why: an `AMBIGUOUS`
caller is counted, never followed.

**Outside, not inside.** A caller that lives in a file the plan already declares
is not blast radius — it is part of the change. Only callers outside
`declared_files` count.

## 3. The line

Print exactly one line. Three shapes:

```
complexity: mini-ok — 3 files · confident callers 4 in 2 files · tests reach 2 · risk none · cochange none
complexity: recommend /orc — 6 files · callers 27 in 9 files · risk auth (src/routes/orders.js:12) · cochange src/auth.js x5 not in plan
complexity: mini-ok (graph off) — 3 files · risk none
```

Trace it: `GATE complexity :: <the line>`.

## 4. The four thresholds, and why each number

**Recommend the full lane when ANY of these holds.** One is enough; they do not
add up.

| Threshold | Why this number |
|---|---|
| confident callers in **4 or more files** outside `declared_files` | mini's whole premise is ONE coherent area. Four outside files is a change that is felt across areas, and areas are what a planner and a reviewer exist for. |
| **8 or more confident callers** outside `declared_files` | one executor and one smoke gate verify a small blast radius well. Eight callers is the point where a reviewer starts to earn its cost. |
| **any `facets.risk[]` entry** | the six classes — auth, money, migration, security, concurrency, data-integrity — are exactly what the full lane's review and verify phases exist for. The planner already floors them to 70. |
| a **`cochange` partner with 3 or more co-commits** not in `declared_files` | the repository's own history says people always touch that file too. A plan without it is probably missing a file, and mini has no second pass to notice. |

## 5. The offer

The recommendation never switches the lane by itself:

```
complexity: recommend /orc — 6 files · callers 27 in 9 files · risk auth (src/routes/orders.js:12)

  1. switch to /orc   (recommended — a cited auth risk, and 27 callers in 9 files)
  2. continue in mini

Your choice.
```

**If the user continues in mini, write the NUMBERS into the decision log**, not
just the choice:

```
complexity: recommended /orc (callers 27 in 9 files · risk auth) — user continued in mini
```

Months later that line answers "did anyone know this was big?" without anyone
having to guess.

## 6. Why the thresholds are printed, not hidden

The numbers sit in the `GATE complexity` trace line on purpose. `/orc-retro`
reads the traces, so a threshold that is wrong for a project can be MEASURED and
moved, instead of argued about. A verdict with no numbers behind it cannot be
calibrated by anyone.
