# W9 — eval findings (15-09-2026)

Numbers: `eval/results/1.8.0/W9-RESULTS.md`. Verdict: **gate NOT passed** — S2 invalid (graph never ran), S3 inconclusive (tokens −8.9%, tool calls −4.4%, both within ±10%). Tests 100% in every run.

## What the runs say about the design

### F1 — the lean lanes do not follow the graph pointer
- `/orc-mini` (s2-on): `code_graph: on`, and no `orc graph status` probe and no `orc graph update` after the green smoke gate. The SAME lane in s2-off DID print `PROBE graph status :: exit3 off`. So compliance is random.
- `/orc-quick` (s1-on): no Q0 graph probe, no Q1 `ctx`, no Q3 update.
- `/orc` (s3-on) DID build and update the graph, but folded the result into `GATE grounding` / `OUTCOME` prose.
- **No run emitted `GRAPH-CONSULT`, `GRAPH-UPDATE` or `GRAPH-NOTES`, and no executor return carried `graph_used`.**
- Cause (likely): W6-budget put the mini/fast pointers into LENGTHENED existing lines. A clause at the end of a long line is easy to skip. `orc lane calls` counts that the text NAMES the call — not that a run MAKES it.

### F2 — the extractor sees almost nothing in a CommonJS Express app
- Baseline: 6 files → 1 symbol. Route handlers `router.get("/", (req, res) => …)` are anonymous → no symbol, no card body.
- `requireAuth` passed as middleware → `fan-in 0`. A function REFERENCE is not an edge; only a call is. That makes `impact requireAuth` wrong on the most common Express shape.
- After S3 the graph has 10 symbols (the named repo/service functions). So the graph starts to help only AFTER the code has named functions.

### F3 — notes were not tested
- s3-on ran `notes=off`. The noter was never dispatched. Whether notes pay for themselves (and D5, Sonnet vs Haiku) is still unknown.

### F4 — the sandbox reset leaks the previous trace
- `w9/reset.ps1` removes `.claude/orc/graph`, `.claude/orc/run` and `logs/.current`, but keeps `.claude/orc/logs/*`. s2-on found the s2-off trace, judged it a fabricated claim, and quarantined it. Extra turns and tokens went into s2-on.

### F5 — the method is too weak for this effect size
- s1-on did not touch the graph and still came in −54% tokens vs s1-off. Run-to-run variance on these lanes is far above ±10%. One run per cell cannot decide the gate.

## What must change before a re-run
1. F1: a dedicated line (not a lengthened one) for the graph probe + update in `orc-mini`, `orc-fast`, `orc-quick` (budget trade needed), and an explicit instruction to emit the `GRAPH-*` trace verbs.
2. F2: record a function passed as an argument as a `ref` edge (counts in `impact`/fan-in), and name route handlers by `<file>:<METHOD path>`. Or accept the gap and pick a fixture with named functions.
3. F4: `reset.ps1` moves `.claude/orc/logs/*` aside per run.
4. F3/F5: S2 and S3 at N=3 per cell; S3-on with `-Mode on-notes`; `s3-haiku` once.

## Round 2 fixes (15-09-2026, user chose option A)

User direction: every code lane must USE, UPDATE and CREATE the graph cache, `/orc-quick` included.

| Finding | Fix |
|---|---|
| F1 — lanes skipped the calls | **One call builds:** `orc graph status --if-enabled --heal --json` builds a NONE graph and updates a DRIFTED one in the same call. **The resolver announces:** `orc lane config <code lane> --json` puts the three steps (consult+build · ctx cards · update) in `announce[]` while `code_graph` is on — every lane prints `announce[]` verbatim. **Own steps:** `orc-mini` gets a "Code graph cache" section, `orc-fast` an F0 step e., `orc-quick` a numbered Q0 step 4 (+ `GATE graph`), `orc` a "NEVER skipped" line; `_shared/code-graph.md` §0 holds the three steps. **The executor asks itself:** the read ladder step 0 and the executor template run `orc graph ctx --if-enabled --json` before any Grep (exit 3 → skip for the task), so use does not depend on the orchestrator. **Copy, never paraphrase:** every graph `--json` answer carries `line` + `trace` (`GRAPH-CONSULT` / `GRAPH-UPDATE` / `GRAPH-NOTES`); trace.md says a gate line in other words is not a `GRAPH-CONSULT` line. **One ctx call per slice:** `ctx` takes up to 5 targets under one budget. **DIY:** the `code_graph` flow key defaults to `on` (the global key still decides at run time). |
| F2 — 1 symbol on Express | Engine `graph@3` / `heuristic@3`: route handlers are `route` symbols named `<METHOD> <path>`; a function passed by name is a `ref` edge, kept only when its head is defined or imported in the file, and resolved only LOCAL or IMPORT; `← used by` on cards; refs count for `impact`; routes can get notes. A dotted keyword is a method (`router.delete(`). Fixture baseline now **6 files · 8 symbols**; `requireAuth` is used by `GET /search` and `POST /`. |
| F3 — notes not tested | `reset.ps1` derives `on-notes` from the id for every S3 ON run — the user no longer picks a mode. |
| F4 — trace leak | `reset.ps1` moves every file in `.claude/orc/logs` to `logs-w9-archive/<time>/`; round 1 traces are in `logs-w9-archive/round1/`. |
| F5 — method | S2 and S3 × 3; the gate uses medians. `measure.ps1` refuses a session older than the reset and prints a `CHECK` line for graph use. |

Spine budgets raised deliberately: `orc-mini` 260→270, `orc-fast` 230→240 (comments in `bin/verify-contracts.js`).

## Round 2 results (15-09-2026)

Numbers: `eval/results/1.8.0/W9-RESULTS.md`. Runs: S1 ×1, S2 ×3, S3 ×1 per mode (S3 repeats not run — user token limit). 10/10 valid, 0 excluded. Tests 100% in every run.

**Verdict: gate NOT passed.**
- S2 (medians, N=3): tokens **−1.8%**, tool calls **+11.8%**. The literal rule is met on tokens, but the OFF runs alone spread 34%, so −1.8% is noise, and tool calls are worse.
- S3 (N=1): tokens **+1.4%**, tool calls **−4.3%** → **inconclusive** (both within ±10%), weak.
- S1 (N=1, no gate): +46.8% tokens / +59.3% tool calls. It proves `/orc-quick` builds, uses and updates the cache.

### R1 — F1 is fixed at the orchestrator
Every ON run built the cache (`GRAPH-CONSULT built`), put a card into at least one slice, and updated it (`GRAPH-UPDATE`). The `announce[]` line reached every lane. `/orc-mini` and `/orc-quick` now make the calls. The trace verbs are copied (s2-on-1 missed the `card` trace line, but the card is in its prompt).

### R2 — the executor step 0 is dead text
0 executor `orc graph ctx` calls in 8 ON executor dispatches (from the transcripts). All use came from the orchestrator. `graph_used` was reported in 2 of 8 slices (`none`, `3 targets`); `/orc` OUTCOME lines carry `wiki_used` and never `graph_used`.

### R3 — `/orc` put the card in 1 of 4 slices
s3-on-1: only T4 got a card; T1–T3 got none. The final status was `drifted` (1 file changed after the last update), so the ship-time update did not catch the last change.

### R4 — the metric cannot see the graph on this fixture
The main session is 74–80% of total tokens; executors are 5–7%. The graph only shortens executor (and planner) reading. A 50% cut in executor tokens moves the total by at most ~3.5%, which is under the ±10% band and far under the 34% run-to-run spread. In S3 the graph DID change how code was read (Read 80→53, Grep+Glob 9→0), but Bash went 145→206 and main turns 57→69, so the total did not move. On a 6–10 file app, reading the code directly is already cheap.

### R5 — notes: cheap, not proven
Noter: 40,522 tokens (0.21% of the run), 45 s, 13 notes, 0 rejected. They cannot pay back inside the same run: the batch ran after the last code wave, so no later slice read them. Any benefit is in the NEXT run, which this eval does not measure. D5 (Sonnet vs Haiku) is still not tested.

### What this means for the design
The graph works as a mechanism (build, card, update, notes all run and cost little), and it does no harm (tests 100%, cost flat). It does NOT show a token saving on this fixture with this metric, and no repeat count on this fixture will show one (R4). A saving claim needs a repository where finding code is the expensive part, and a metric that isolates subagent tokens.
