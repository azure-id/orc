# Graph use — make the code graph earn its place, and pay less for it (v1.9.1)

Written 22-09-2026 in Simplified Technical English. This folder is a working
note. It is never staged and never committed (the same rule as
`code-graph-notes/`, `lean-lanes-notes/`, `read-gate-notes/` and
`usage-gate-notes/`).

> **Status: W0 · W1 · W2 · W3 · W4 BUILT and GREEN on `feat/graph-use-1.9.1`,
> uncommitted. Next: W5. See `CHECKPOINT.md`.** Version target: **1.9.1**
> (`npm version patch`, the user's call — see `02-PLAN.md` DE-1).
> Decisions DE-1 … DE-16 are open in `02-PLAN.md` §10. The two added after the
> company data arrived (22-09-2026 evening): **DE-15** — name constants and
> components as symbols (the one optional engine change, one automatic
> re-extract) and **DE-16** — defer mini's complexity items (0 mini runs of 94).

## The problem, in one paragraph

The graph is maintained far more than it is consulted, and the part of it that
IS consulted costs more than the meter says. On the user's company project the
store is at generation 93 and the ledger holds **19 reads in total**; the UI
shows `updates 0` because the hook never writes the row the meter counts. Every
`orc graph … --json` answer the orchestrator reads is **3 to 8 times the size
of its card** (measured on this tree: a symbol card 983 tokens inside 4,434; the
map 1,111 inside 8,991), and that answer sits in the main-session context — the
74–80 % surface — on every later turn. The meter records only the card. And a
graph with **1.9 symbols per file** (the user's project) answers `exit 4` to most
questions, and nothing tells anyone why.

This plan does four things, all backward compatible with a store that exists
today: **(B)** a `--brief` answer that drops the rows the lane never reads,
**(V)** the CLI computes the lines the lanes now compute from rows, **(A)** the
graph says when it is THIN and why, **(M)** the meter tells the truth about use
and cost, and **(R)** the paid reads get one-call answers with source where the
research says they help.

## What this plan assumes

`lean-lanes-notes/02-PLAN.md` is **executed** as v1.9.0 (commit `c000342`,
21-09-2026). So these exist when this plan starts:

| From 1.9.0 | Used here by |
|---|---|
| `/orc-quick` Q1 `map --focus`, Q4 `changes` (affected tests first), the blast-radius line | V1 (`blast_line`), B2 (call sites) |
| `/orc-mini` complexity line, `graph_facts`, `impact` + `cochange` in Phase 1 | V2 (`impact --complexity`), V3 |
| the recon pair `orc-recon-sonnet-4-6-med` / `orc-recon-opus-5-low` | R1 (`--callers-source`), R4 (the LSP sentence) |
| `orc graph gain` at every code lane's close | M1–M3 |
| `LANE_CALLS` rows for map / impact / changes / cochange / coverage in quick and mini | B2 (flags after the subcommand are free) |

Everything from 1.8.2 (ROUTE edges, `--for-slice`, `--source`, `map`, shards,
the gain meter, doc notes) is also assumed. `02-PLAN.md` §7 says what to do if
one of them turns out not to be there.

## The files

| File | What it holds |
|---|---|
| `00-README.md` | this index, the rules, the baseline, the data to gather, how to resume |
| `CHECKPOINT.md` | **the live state** — which waves are built, the measured gate, the files touched, the decisions taken, and how to pick the next wave up. Read it FIRST in a fresh session |
| `01-research.md` | the evidence: every number measured on this tree today, the user's project screenshot, the prior findings that bind, defects found by reading, outside references with what is taken and what is not |
| `02-PLAN.md` | the plan: the design in one screen, the items (B · V · A · M · R), waves and gates, decisions, files, tests, docs, risks, backward compatibility, eval, not in this release |
| `03-brief-json-spec.md` | `--brief`: the exact key set per command, the compact rule, the envelope accounting, every lane call site before/after, the `announce[]` text, the new-flag rule |
| `04-lines-spec.md` | the CLI computes the line: `changes` totals + `blast_line`, `impact --complexity`, `graph_facts` from one call, the exact spine text that moves |
| `05-audit-meter-spec.md` | `meta.density`, the THIN status line, `orc graph audit`, the `hook-update` ledger row, `paid.envelope`, the never-called line, the UI rows and i18n keys |
| `06-delivery-spec.md` | `ctx --callers-source`, the personalised wide hint, the `wide_unhinted` counter and its gain line, the LSP sentence and `lsp_at` |

## Rules in force while this plan runs

- Work on a branch (`feat/graph-use-1.9.1`). Never commit on `main`. Never push
  unless asked.
- Never stage this folder, `result.md`, `test.md`, `caveman-notes/`,
  `code-graph-notes/`, `lean-lanes-notes/`, `read-gate-notes/`,
  `usage-gate-notes/`, `promo-animation/`, `eval/`, or the user's pre-existing
  edits to `.gitignore` and `test/docs.test.js`.
- Read `claude-rules/00-guards-and-release.md` before any edit under `bin/` or
  `templates/`. Read `claude-rules/04-knowledge-wiki-patterns.md` (the graph
  rules), `claude-rules/05-build-lanes.md` (mini), `claude-rules/06-standalone-lanes.md`
  (quick), and `claude-rules/07-orc-ui.md` + `orc-ui-wiki.md` before W4 touches
  the Knowledge panel.
- **The store on disk is a contract.** No `ENGINE` bump, no `SCHEMA` bump, no
  change to a record field, no change to `resolved.json` / `names.json` /
  `wide.json` / `map.json` / the shards. A generation-93 store built by 1.9.0
  reads `FRESH` under 1.9.1 with no re-extraction (`02-PLAN.md` §6).
- **Every existing `--json` answer stays byte-identical.** W0 freezes goldens;
  a test compares them at every wave. New fields are additive; `--brief` is a
  switch.
- **Every new flag is a bare switch or `--name=value`**, never `--name value`:
  `flag()` in `bin/cli.js` reads the next word as a value, so a 1.9.0 CLI given
  `--complexity mini` would swallow an operand. A 1.9.0 CLI given `--brief` or
  `--risk=auth` ignores it (`02-PLAN.md` §6, `03-brief-json-spec.md` §5).
- Pause after every two waves. `npm run verify` and `npm test` are green at
  every pause. Never pipe `npm test` through `tail`.
- ASD-STE100 in every doc. The generated executor files are never hand-edited
  (`agents-src/executor.template.md` → `npm run build:agents`).
- A contract token moves only with its row in `bin/verify-contracts.js`, in the
  same commit. Sixteen rows pin `templates/skills/_shared/code-graph.md` today
  (`01-research.md` §1.9).
- `bin/cli.js` is CRLF; everything else is LF. Read and write it as bytes.
- A heredoc in this environment eats backslashes: write a `.js`/`.py` file with
  the Write tool and run it for any edit that carries `\n`, `\d` or a regex.

## Baseline (measured 22-09-2026 on this tree, after `orc graph update`)

| Measure | Value |
|---|---|
| `npm run verify` | 40 skills · 51 agent files · **208 contracts** |
| `npm test` (last pause, lean-lanes W4, 21-09-2026) | 1110 passed · 0 failed · 1113 tests · 74 files |
| this repo's graph | 159 files · 1,482 symbols · **9.3 symbols/file** · gen 6 · update 1,249 ms (engine upgrade graph@4 → @5, 158 parsed) |
| store on disk | 5.45 MB: index 1.45 MB · resolved 707 KB · shards 1.04 MB (102) · blobs 1.87 MB (207) · cochange 239 KB · names 99 KB · map 11 KB · wide 8.8 KB (59 files) |
| `ctx <symbol>` answer | JSON **4,434** tokens · card **983** (4.5×) · `calls[]` alone 1,537 |
| `ctx --for-slice` 3 files | JSON **2,526** · card **430** (5.9×) |
| `impact` 3 files | JSON **4,481** · card **839** (5.3×) · `callers[]` 2,185 |
| `map` | JSON **8,991** · card **1,111** (8.1×) · `files[]` 3,592 |
| `changes` / `coverage` / `status` / `gain` | 587 / 189 / 142 / 439 (no card; the `line` is 103 / 53 / 20 / 189) |
| a brief answer, compact (measured shape) | ctx 1,194 · map 1,191 · impact 969 · for-slice 503 — **−73 % to −87 %** |
| zero-symbol files here | 25 of 159 (16 %), every one a `module.exports = {…}` data fixture; `bin/cli.js` skipped `too-large` (> 512 KB) |
| `code-graph.md` reads by lanes in 40 eval transcripts | **0** (36 reads in this repo's own dev sessions — development, not runs) |
| graph `--json` results in the 40 eval transcripts | 9 sessions · 24 results · 13,645 tokens, all in the main session |
| replay of this repo's 74 dev windows | 130 searches · 400 whole reads · answerable round trips **1.43 / window** · planning sweeps **0** · ceiling 0.1 % of tokens added |
| **the user's company project** (screenshot, 22-09-2026) | FRESH · **808 files · 1,547 symbols (1.9/file)** · gen **93** · notes off · paid 2K (cards 1K · source 0 · hints 978) · avoided ~11–23K · **19 calls**: read-note 4 · hint 9 · for-slice 4 · ctx 2 · `updates 0` |
| the same project, pasted terminal output (22-09-2026 20:40, `01-research.md` §2.1) | ORC **1.9.0** · graph@5 · hook counters over 5 runs: **`updates` 35, `injected` 0**, `subagent_start` 37 · `orc stats`: 94 runs, **`/orc-quick` 40 %**, `/orc-mini` **0**, 43 executors, 21 graph reads in 3 runs, 77 unfinished runs · `map --budget 600`: **16 of 26 rows have no symbol** · `index.json` 2.77 MB · 245 shards |
| the same project, density by language (`01-research.md` §2.2) | **`vue` 429 files · 17 symbols · 416 zero (97 %)** · `js` 378 · 1,528 · 131 zero (35 %) · **74 partial (20 %)** · `py` 1 · the 20 longest zero-symbol files are all `.vue`, 930–2,047 lines, plus a 1,451-line mixin — the parser does not read Options API object members (DE-15) |

## Data to gather from the company project (read-only, no model tokens)

Run these in the company project and paste the output. Each one is a read; none
of them changes the store. They turn the plan's thresholds (DE-4) and its W0
baseline into measured numbers on a real repository.

**Received 22-09-2026 (macOS, zsh): all six** — folded into `01-research.md`
§2.1 and §2.2. The density result is the plan's decisive number: **`vue` 429
files · 17 symbols · 416 with none (97 %)**, longest 2,047 lines; `js` 378
files · 1,528 symbols · 131 with none · 74 partial. (The first form of command
3 failed on zsh, which expands `!` inside double quotes; the form below is
single-quoted outside and zsh leaves it alone.)

```bash
orc --version && orc graph status --json
```

```bash
orc graph gain --history --limit 40
```

```bash
node -e 'const i=require("./.claude/orc/graph/index.json");const f=require("./.claude/orc/graph/files.json");const L={};let z=[];for(const [r,v] of Object.entries(i.by_file)){const n=(v.symbols||[]).filter(s=>s.kind!=="module").length;const l=L[v.lang]||(L[v.lang]={files:0,symbols:0,zero:0,partial:0,skipped:0});l.files++;l.symbols+=n;if(n===0){l.zero++;z.push([r,v.lines||0])}if(v.coverage==="partial")l.partial++;if(v.skipped)l.skipped++}console.log(JSON.stringify(L,null,1));z.sort((a,b)=>b[1]-a[1]);console.log("zero-symbol files, longest first:");console.log(z.slice(0,20).map(x=>x[1]+"  "+x[0]).join("\n"));const sk=Object.entries(f).filter(([,v])=>v.skipped).map(([r,v])=>v.skipped+"  "+r);console.log("skipped:",sk.length);console.log(sk.slice(0,10).join("\n"))'
```

```bash
orc graph map --budget 600
```

```bash
ls -la .claude/orc/graph && ls .claude/orc/logs | tail -20 && cat .claude/orc/logs/*.graph-hook.json 2>/dev/null | head -c 1500
```

```bash
orc stats
```

What each answers: the version and the store state; which commands were ever
called and what they cost; **symbols per file by language and the longest files
the parser read as empty** (the A-items and DE-15 depend on this); whether the
ranked map names the files you would name; the hook counters (`updates` is
written there even though the UI shows 0); which lanes ran.

## How to resume in a fresh session

1. **Read `CHECKPOINT.md` first.** It is the live state: the waves that are
   built, the measured gate, the files touched, the decisions taken, and the
   judgement calls that are not in this plan.
2. Then read this file, then `02-PLAN.md` §8 (waves) and §10 (decisions).
3. `git status --short` says what is in the tree. There are no commits on the
   branch — every wave so far is uncommitted working-tree change.
4. Run `npm run verify` and `node bin/test-run.js --json`. Both must be green
   before the next wave. **Never run two test suites at once** — the `net` pool
   fails under that load and the failures look real.
5. The spec files (`03` … `06`) hold the exact text and shapes to write. Do not
   re-derive them.
