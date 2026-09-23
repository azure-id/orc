# Spec — `/orc-mini` at v1.9.0

Written 19-09-2026 in Simplified Technical English. This file says what to
write into `templates/skills/orc-mini/`; `05-trim.md` says what to remove first
so it fits the 270-line budget.

## 0. What does not move

- ONE executor (`orc-executor-sonnet-5-high`; `opus5_only` → `orc-executor-opus-5-low`).
  No waves, no scoring table.
- Skips full review, verify and summary. The smoke gate is the orchestrator's
  independent build+test; it blocks ship on red; one repair round; second red
  stops.
- Light intake (Q1–Q4, soft sign-off), the mini analyst on real docs only, the
  mini planner, the analyst-gates, the shared run folder, the switch to full.
- Gotchas read and written; the one TDD question; Phase X mock example; Phase T
  test-authoring ask; ship never stages `mock-examples/`.
- Budget 270 lines. A raise carries its comment in `verify-contracts.js`.
- No new config key. The complexity thresholds are constants with reasons.
- The pinned tokens (24, `05-trim.md` §4) survive every edit.

## 1. Phase 0 — intake

Two changes, both silent:

1. **Facts from the graph before the questions.** Before the tiered round, run
   `orc graph map --focus "<3–6 words from the request>" --budget 800 --if-enabled --json`
   (1.8.2 D4; exit 3 → skip). Its ranked files pre-fill Q4's recommendation
   ("patterns/files to avoid") on the `➡️` line. Never ask what the map already
   answered (`interview.md`: a fact is ORC's job).
2. **Step 3.5 cross-check in one call.** The NAMES the draft spec cites →
   `orc graph ctx <names> --if-enabled --json` (5 per call). Exit 0 → confirmed
   (record `generation`). Exit 4 or a non-code noun (a command, a config key, a
   doc) → Glob/Grep as today. Tags and the >3-tag valve are unchanged.

## 2. Phase 1 — planning

### 2.1 The planner slice carries `graph_facts`

```
graph_facts:
  map: <the `map --focus` text, ≤ 800 tokens, or null>
  impact:   [{file, confident_callers, caller_files, tests_reaching}]   # one row per file the request names
  cochange: [{file, partners: [{path, count}]}]                          # exit 4 → []
  generation: <n>
```

The orchestrator runs `orc graph impact <named files> --if-enabled --json` and
`orc graph cochange <each named file> --if-enabled --json` once, before the
planner dispatch. Exit 3 → `graph_facts: null` and the planner plans as today.

### 2.2 The mini planner agents (both variants) gain one paragraph

*"`graph_facts` (or null): the repository's own map. Use `impact` rows to
ground `declared_files` and `facets.breadth`; a `cochange` partner not in your
plan is a question for `open_questions[]` (never a silent addition); a
`tests_reaching` list feeds `test_surface`. Cite the card in `grounding[].evidence`
as `graph gen <n>`. The graph is a locator: confirm a path exists before you
mark it `exists`. A card's silence is not proof of absence."*

### 2.3 The exit gate batches

`analyst-gates.md`'s "Glob every `disposition: exists` path" becomes, for mini:
`orc graph ctx <paths> --if-enabled --json` five at a time; exit 0 confirms;
exit 4 or a path the graph does not index → Glob as today. Coverage, cycle and
collision checks are unchanged. (`analyst-gates.md` is `core` for every lane;
the mini delta is stated in the mini spine, not in the shared file.)

### 2.4 The complexity read — one line with evidence

Replaces the narrative judgment. After the planner returns and passes the gate:

1. `orc graph impact <declared_files> --if-enabled --json` (all of them, one
   call). Count: confident callers (`LOCAL` · `IMPORT` · `UNIQUE` · `ROUTE`)
   whose `file` is outside `declared_files`; the distinct files they sit in;
   the tests that reach.
2. `orc graph cochange <each declared file> --if-enabled --json`. Partners with
   `count ≥ 3` not in `declared_files`.
3. The planner's `facets.risk[]`.

Print ONE line, then decide:

```
complexity: mini-ok — 3 files · confident callers 4 in 2 files · tests reach 2 · risk none · cochange none
complexity: recommend /orc — 6 files · callers 27 in 9 files · risk auth (src/routes/orders.js:12) · cochange src/auth.js ×5 not in plan
complexity: mini-ok (graph off) — 3 files · risk none
```

**Recommend the full lane when ANY holds** (`references/complexity.md` states
each with its reason):

| Threshold | Why this number |
|---|---|
| callers in **≥ 4 files** outside `declared_files` | mini's premise is one coherent area; four outside files is a change felt across areas |
| **≥ 8 confident callers** outside `declared_files` | one executor and one smoke gate verify a small blast radius; eight callers is where a reviewer earns its cost |
| **any `facets.risk[]`** entry | the six classes (auth · money · migration · security · concurrency · data-integrity) are the ones the full lane's review and verify exist for; the planner already floors them to 70 |
| a **`cochange` partner ≥ 3** co-commits not in `declared_files` | history says people always touch that file too; a plan without it is missing a file |

The recommendation is an OFFER: *"1. switch to /orc (recommended — <the
reason>) · 2. continue in mini"*. Continuing writes the numbers into the
decision log. Trace: `GATE complexity :: <the line>`.

`AMBIGUOUS` callers are counted separately and printed as `maybe <n>`; they
never trip a threshold alone (the catalogue: "AMBIGUOUS callers are counted,
never followed").

## 3. Phase 3 — dispatch

- **The graph block** is `orc graph ctx <declared_files> --for-slice --if-enabled --json`
  (1.8.2 D2) — the outside view, not a file card that repeats what the
  executor reads whole. No card when the change stays inside one named file
  with no signature change (`code-graph.md` §7).
- **Wiki: pointers, never bodies.** The orchestrator reads `wiki/INDEX.md` (one
  line per doc) and `orc wiki status --json`, selects 1–3 page PATHS by
  keyword (the cross-cutting maps when their domain applies —
  `orc-reference-api-surface` for API work), and puts the paths in the planner
  slice AND the executor slice with: *"Read these first: the TL;DR for
  orientation, `Contracts & shapes` for specifics. `code > fresh wiki > stale
  wiki (hints) > model priors`."* It never reads a page body into its own
  context. `WIKI-CONSULT <tier> :: docs=<paths>` records the selection.
  `wiki-consult.md`'s lane-delta sentence becomes "**orc-fast and orc-mini**
  pass POINTERS, not content"; full reads the content itself.
- Gotchas (probe, cap 3, scope-matching), the cached `postgres` pattern on a
  data-access task, `house_rules`, `rules_card`, `spec_invariants` into
  `constraints[]`, `tdd_spec` when TDD is on — all unchanged.
- The return check gains nothing new; `graph_used` and `wiki_used` are already
  required by `return-validation.md`. What changes is §5 below: `none` is
  recorded.

## 4. Phase M — the smoke gate

After the executor return validates and `orc run inflight` is clear:

1. **Affected tests first.** `orc graph changes --if-enabled --json` → keep the
   `symbols[]` whose `file` is in `actual_files`; union `tests[]` (call AND
   `ROUTE`). When the runner takes a file list (`wiki-meta.json` `commands`,
   else the runner detected once), run those files first and print one line.
   A runner with no list → one line saying so.
2. **Build, then the suite**, once each, as `smoke-gate.md` says. `VERDICT
   pass|fail`.
3. **The blast-radius line**, from the same `changes` answer:
   ```
   blast radius   2 symbols touched · callers 3 in 2 files · tests reach 2 · risk medium: searchByItemPrefix (fan-in 3, no test reaches it)
   ```
   `risk` never without `why`. Trace `GRAPH-CHANGES` (the `trace` field
   verbatim).
4. **GREEN →** `orc graph update --notes-pending --files <actual_files>
   --if-enabled --json` (1.8.2 D5; one call), the noter batch when `notes` says
   so, then `orc graph gain --run <this run> --if-enabled --json` → `line`
   verbatim (1.8.2 K5). Then Phase X, Phase T, ship.
5. **RED →** one repair re-dispatch with the failing output (the affected files
   are named in the `failure_reason` so the executor runs them first), second
   red → STOP. Unchanged.

### 4.1 The `changes` signal is one option, not a gate

When the `changes` answer has a `risk: high` row (exported · fan-in ≥ 3 · no test
reaches it), the existing end-of-run question batch (mock example · test
authoring · ship) gains ONE option under test authoring:

```
1 high-risk symbol has no test — searchByItemPrefix (exported, fan-in 4).
  a. dispatch orc-reviewer-opus-5-med on the diff (findings P0|P1 block the commit offer once)
  b. write a test for it in Phase T
  c. ship anyway
```

No new user turn. Not a review phase: mini still skips full review; this is a
CLI signal with its reason and three exits. Option a is the same gated
reviewer dispatch quick offers; option b routes into the Phase T ask.

## 5. `none` is recorded

`wiki_used: none` and `graph_used: none` from any return are written to the
checkpoint and printed at ship:

```
knowledge: wiki 2 pages offered · used none  ·  graph card 2 targets · used none
```

Two consecutive runs in this project with `wiki_used: none` on FRESH pages →
one line: `wiki: the selected pages were not used in 2 runs — check their TL;DRs
(/orc-wiki)`. Never dropped, never a gate.

## 6. Phase X, Phase T, Phase 8 — unchanged

The gain line and the blast-radius line ride in the ship summary the lane
already prints (dispatch log + `/usage` reminder).

## 7. `references/complexity.md` (new, one consumer, stays home)

Contents: the three calls and their exit codes (one table); how to count
(confident vs `AMBIGUOUS`, outside vs inside `declared_files`, tests that
reach); the four thresholds with their reasons (§2.4); the three line formats;
the offer wording; what to write into the decision log when the user continues;
and one sentence on `/orc-retro`: *"the numbers are in the `GATE complexity`
line so a retro can move the thresholds."*

## 8. Trace

Lane token `mini`, tier Build lanes, 3 packets — unchanged. New lines inside
the existing packets: `GRAPH-MAP` (intake), `GATE complexity :: <line>`
(planning), `GRAPH-CHANGES` and `GRAPH-GAIN` (execution + ship). No new verb.

## 9. The example (`examples/mini-run-mock.md`)

The mock gains, in place:
- Phase 0: `graph: FRESH — 6 files · 8 symbols` and `GRAPH-MAP … focus="report json flag"`.
- Phase 1: `complexity: mini-ok — 2 files · confident callers 1 in 1 file · tests reach 1 · risk none · cochange none`.
- Phase 3: `graph: --for-slice card (2 files) · wiki: 1 path (pointer)`.
- Phase M: `tests reached 1 file (call 1) → 4 passed` before the suite; the
  blast-radius line; `GRAPH-UPDATE`; the gain line.
- Ship: `knowledge: wiki 1 page offered · used tests/test_report.py note · graph used 1 target`.

## 10. Agents touched

`orc-planner-mini-sonnet-5-high.md` and `orc-planner-mini-opus-5-med.md` gain
the `graph_facts` paragraph (§2.2). No other agent changes for mini; the
executor's `repro` field (quick §6) is present in every executor and mini never
requests it.
