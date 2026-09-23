# Plan — v1.9.0: the lean lanes learn to look before they leap

`/orc-quick` and `/orc-mini` only. Written 19-09-2026 in Simplified Technical
English. Evidence: `01-research.md`. Exact text to write: `03-orc-quick-spec.md`,
`04-orc-mini-spec.md`, `05-trim.md`.

> **Status: PLAN ONLY. Nothing is built.** Decisions DE-1 … DE-14 (§10) are
> open. Version target **1.9.0** (`npm version minor`). Baseline: the 1.8.2
> tree with `code-graph-notes/06` executed.

---

## 0. The problem, in five lines

1. **The lean lanes may not ask the graph the questions that matter.** The
   catalogue lets them call `status`, `ctx`, `update`, `notes pending` — and
   forbids `impact`, `changes`, `coverage`, `cochange`, `map`. So quick cannot
   say what breaks, mini cannot measure its own complexity read, and neither
   knows which tests reach the change (R3-C, F6, F10).
2. **Quick's read-only half is untraced and half-real.** Ad-hoc recon offers
   an effort knob that does not exist and is invisible to the hook and to
   `orc run inflight` (F1, F2).
3. **A bug fix is never shown red first.** Quick dispatches a sketch; the suite
   turns green; the bug itself was never reproduced (F5). Outside evidence puts
   reproduction-first and affected-tests-first among the cheapest correctness
   gains there are (§5.4–5.6).
4. **Mini reads wiki prose into the 74–80% surface**, its planner sees no graph
   facts, and its exit gate Globs one path at a time (F11–F13).
5. **Both spines and both descriptions carry repeated or off-purpose text**
   (F8, F14): 22.5K chars of descriptions are loaded every session; quick has
   no spine budget at all; mini has 2 lines of headroom.

**What this plan does NOT promise.** No token saving on the bill (EW8: the
graph cannot move it; neither can these lanes). Every token line below is a
cost the lane itself adds and can cut: the description, the spine, the rules
card, the wiki bodies in the orchestrator's context. The claim is
**correctness, traceability and fewer round trips**, measured in §14.

---

## 1. The design in one screen

```
 TRIM (T)                                      QUICK (Q)                                          MINI (M)
 T1 descriptions  quick 619 → ≤ 330 chars      Q1 graph-first LOOK: ctx | map --focus | --source  M1 complexity read WITH EVIDENCE
                  mini  493 → ≤ 300 chars         (--source never for a file that will be edited)      impact + risk[] + cochange → ONE line
 T2 command files quick 1.6K → ~0.6K           Q2 recon = a pinned pair, traced and in-flight-      with three named thresholds
 T3 spines        quick 379 → ≤ 320, pin 325      visible: orc-recon-sonnet-4-6-med ·             M2 planner slice carries graph_facts
                  mini  268 → ≤ 250 before M,     orc-recon-opus-5-low; "other" = ad-hoc model      (map · impact · cochange)
                  ≤ 270 after (raise = reason) Q3 a DEFECT entry reproduces FIRST (repro field)   M3 exit gate: ONE ctx call per 5 paths,
 T4 dedupe: repair loop · gate table · inert   Q4 affected tests first, then the suite              Glob for what the graph does not index
    list · doc shape — each stated ONCE           (orc graph changes → tests[], call AND ROUTE)   M4 wiki: POINTERS, never bodies, in the
                                               Q5 a blast-radius line in every entry                 orchestrator's context
 SHARED PLUMBING (S)                           Q6 the gate marks → suggested, with its reason,    M5 smoke gate: affected tests first;
 S1 executor `repro` slice + return field         from the dig (never pre-selected)                  then `changes` rows, risk WITH why,
 S2 `REPRO red|green` trace verb               Q7 honest timestamps: a running record, not a        folded into the end-of-run question
 S3 `orc rules slice --lane orc-quick` compact    packet stamped "now"                            M6 wiki_used / graph_used = none is
 S4 catalogue lanes[]: impact · changes ·      Q8 graph_used checked on every return                 recorded and surfaced, never dropped
    coverage · cochange · map gain mini/quick  Q9 lazy `gh` probe — PR work only                  M7 the gain line at the smoke-gate close
 S5 hook role family `recon` (PHASE-EDGE)      Q10 the ❓/➡️ question shape — one primitive          (1.8.2 DE-M b — kept)
 S6 verify-package: two agent names            Q11 PR threads: `ctx <file:line>` per comment
 INVARIANTS THAT DO NOT MOVE: one user turn per quick request · the gate asks every time · no smoke gate in quick ·
   mini skips review/verify/summary · mini has ONE executor · no new config key · headings Q0–Q3 byte-identical
```

---

## 2. T — trim (the whole constellation pays for these two files)

Every skill's description loads into every session (§5.1). The two spines load
whole when the skill runs. The trims cut what is paid most often first.

| Item | Now | After | Rule it follows |
|---|---|---|---|
| `orc-quick` description | 619 chars, 6 sentences, 3 of them mechanics | ≤ 330 chars: what it does, the trigger phrases, one clause on the gate | third person · what + when · key use case first |
| `orc-mini` description | 493 chars | ≤ 300 chars | same |
| `commands/orc-quick.md` | 1,667 bytes restating the skill | ~600 bytes: the three steps, the gate, `$ARGUMENTS` | a command is a pointer, the skill is the text |
| `commands/orc-mini.md` | 587 bytes | ~450 bytes | same |
| `orc-quick/SKILL.md` | 379 lines, no pin | ≤ 320 after Q-additions; **pin 325** in `BUDGETS` | spine = trigger + tokens + phase order + pointer (knowledge §4k) |
| `orc-mini/SKILL.md` | 268 / 270 | ≤ 250 after T4, ≤ 270 after M-additions | same; a raise carries its comment |

Exact before/after text, counts, the pinned tokens and the arithmetic:
`05-trim.md`. **Rejected:** a `when_to_use` field (same 1,536 cap; one field
travels through `orc export`; the trigger phrases fit in `description`).

---

## 3. Q — `/orc-quick` (the spec is `03-orc-quick-spec.md`)

### Q1 — graph-first LOOK
The dig sorts the request, then asks the graph before any Grep:

| The request | The first call | Then |
|---|---|---|
| names a file or symbol | `orc graph ctx <targets> --if-enabled --json` (≤ 5) | read the RANGE it names; `--source` for a caller's range only |
| names no file | `orc graph map --focus "<3–6 words>" --budget 800 --if-enabled --json` (1.8.2 D4) | pick ≤ 3 files, then `ctx` |
| asks what breaks / who uses | `ctx <symbol> --depth 2` + `impact <file>` + `coverage <files>` | the answer lists direct · ROUTE · alias · inherited callers apart, and carries the silence sentence when an absence rests on the graph alone |
| exit 3 (off) | Grep/Glob exactly as today | — |
| exit 4 (not found) | Grep for the name | — |

The 12-file cap stays; a `map` answer counts as one call. The executor slice
carries `orc graph ctx <declared files> --for-slice` (1.8.2 D2), never a file
card that repeats what the executor reads whole anyway.

### Q2 — recon is a pinned pair
`orc-recon-sonnet-4-6-med` (cheap, finding things) and `orc-recon-opus-5-low`
(thinks harder). Read-only. Graph at read-ladder step 0, the anti-chain rule, a
capped return (`answer ≤ 12 lines`, `evidence[]`, `absences[]` with `searched`,
`blast_radius` when asked, `confidence` with its reason, `graph_used`,
`actual_model`, `actual_effort`). The hook traces them (name starts with
`orc-`), `orc run inflight` sees them, `/orc-retro` counts them. "Other — name a
model" stays as the escape hatch, **model only** (effort inherits the session;
the menu stops naming a knob that does not exist). The gate still asks every
time.

### Q3 — a defect entry reproduces first
`kind: defect` → the slice carries `repro: {required: true, kind: test | command,
hint}`. The executor writes and runs the reproduction FIRST, captures the red
run, fixes, runs it again, and returns `repro: {command, before: {exit_code,
tail}, after: {exit_code, tail}}` — or `none` + reason, honestly. The
orchestrator checks red-before and green-after, prints both, and the entry
records them. No runner → a command (`node -e`, `curl`, the CLI) with its output.
One executor, one slice, fix and test together (§5.5).

### Q4 — affected tests first
After every code-writing dispatch: `orc graph changes --if-enabled --json` →
the union of `symbols[].tests[]` (call AND `ROUTE`), filtered to the entry's
`actual_files`. Run those test files first when the runner takes a file list
(from `wiki-meta.json`'s `commands` block, else the detected runner; a runner
that cannot take a list → say so, run the suite). Then the suite as today. Print:
```
tests reached  3 files (ROUTE 2 · call 1) → 12 passed
suite          41 passed
```
No test suite → still no check (the lane's rule); the `changes` line still
prints.

### Q5 — the blast-radius line
From the same `changes` answer, in chat and in the entry:
```
blast radius   3 symbols touched · callers 7 in 4 files · tests reach 2 · risk high: searchByItemPrefix (exported, fan-in 4, no test reaches it)
```
`risk` is never printed without its `why` (the catalogue's own rule).

### Q6 — the gate marks a suggestion
The executor menu keeps its two lines (DE-5) and gains a `→ suggested` marker
with the reason, computed from the dig: `opus-5-low` when confident callers ≥ 8,
or a risk class is visible (auth · money · migration · security · concurrency ·
data-integrity), or more than 3 files will change; else `sonnet-4-6-med`. A
suggestion is not a default: nothing runs on silence.

### Q7 — honest timestamps
Every event is appended to `.claude/orc/run/<run-slug>/quick-checkpoint.md`
with `HH:MM:SS` when it happens. The entry packet is built from that record.
`trace.md` line 204 is the rule; this is the mechanism it lacked.

### Q8 — `graph_used` in the return check
Added beside `actual_model` / `unmet[]` in §3.1. Absent on a slice that carried
a card = malformed (re-dispatch once, then the fallback offer).

### Q9 — lazy `gh` probe
`gh auth status` runs in Q0 only when the request names a PR (`pr <n>`,
`PR <n>`, a GitHub URL). Otherwise the probe runs at Q1 of the first PR entry.

### Q10 — one question primitive
Q2's questions use `interview.md`'s shape: `❓ **Q1** — **<title>**: <question>`
and `➡️ <recommendation, one reason>`. Quick's own rule stays: every option
names a real file.

### Q11 — PR threads
Per thread, `orc graph ctx <file:line> --if-enabled --json` locates the symbol
the comment sits in and its callers; the slice for that thread carries the card.
One gate per thread, as today.

---

## 4. M — `/orc-mini` (the spec is `04-orc-mini-spec.md`)

### M1 — the complexity read carries evidence
After the planner returns and before dispatch:
`orc graph impact <declared_files> --if-enabled --json` (+ `cochange <each
declared file>`). ONE line:
```
complexity: mini-ok — 3 files · confident callers 4 in 2 files · tests reach 2 · risk none · cochange none
complexity: recommend /orc — 6 files · callers 27 in 9 files · risk auth (orders.js:12) · cochange auth.js ×5 not in plan
```
Recommend the full lane when ANY holds (each threshold has its reason in the
spec): callers in ≥ 4 files outside `declared_files` · confident callers ≥ 8 ·
any `facets.risk[]` · a `cochange` partner ≥ 3 co-commits not in
`declared_files`. The user still chooses (DE-6 sets the numbers).

### M2 — the planner sees the graph
The planner slice gains `graph_facts`: the `map --focus` text (≤ 800 tokens),
`impact` rows for the files the request names, `cochange` partners. The mini
planner agents (both variants) cite them in `grounding[].evidence` and in
`facets.breadth` / `facets.risk`.

### M3 — the exit gate batches
`disposition: exists` paths → `orc graph ctx <paths> --if-enabled --json`, five
per call; exit 0 = confirmed (record the `generation`); exit 4 or a non-code
path → Glob as today.

### M4 — pointers, never bodies
The orchestrator reads `wiki/INDEX.md` and `orc wiki status`, selects 1–3 page
PATHS, and puts them in the planner slice and the executor slice with the
instruction to read them first (fast's delta in `wiki-consult.md`, now "fast
and mini"). It never reads a page body into its own context. `WIKI-CONSULT`
records the paths; both returns carry `wiki_used`.

### M5 — the smoke gate learns what reaches the change
GREEN as today, then: `orc graph changes --if-enabled --json` → run the tests it
names first (Q4's rule), then the suite; print the blast-radius line (Q5's
format). A `risk: high` row (exported · fan-in ≥ 3 · no test reaches it) adds
ONE option to the end-of-run question batch (mock · tests · ship): "1 high-risk
symbol has no test — dispatch `orc-reviewer-opus-5-med` on the diff / write a
test in Phase T / ship anyway". Not a gate. Not a review. One line with its
reason.

### M6 — `none` is recorded
`wiki_used: none` / `graph_used: none` are written to the checkpoint and printed
at ship. Two consecutive runs with `wiki_used: none` on FRESH pages print a
one-line note recommending `/orc-wiki` review of the selected pages' TL;DRs.

### M7 — the gain line stays
The smoke-gate close prints `orc graph gain --run <this run> --if-enabled --json`
→ `line` verbatim (1.8.2 DE-M b). Budget already counted.

---

## 5. S — shared plumbing

| # | Change | Where | Compatibility |
|---|---|---|---|
| S1 | `repro` slice field + return field, REQUIRED only when the slice carried `repro.required: true` | `agents-src/executor.template.md` → `npm run build:agents`; `orc/subskills/orc-execution/core.md`; `_shared/return-validation.md` §5d; `verify-contracts.js` token `repro` | additive; absent = fine when not requested |
| S2 | trace verb `REPRO red|green :: <cmd> exit=<n>` | `_shared/phases/trace.md` row; quick `own_phases.trace_verbs`; the every-verb-defined test | additive; unknown to old retros, ignored |
| S3 | `rulesSlice()` compact form for `--lane orc-quick`: HARD rules as id + one line, PURPOSE/LOCK as id + file, worked examples dropped; `line` unchanged; JSON gains `compact: true` | `bin/cli.js rulesSlice()`; `rules.md` "Cost" paragraph names the lane set | the CLI decides, never the lane (rules.md); measured target ≤ 1,500 tokens |
| S4 | catalogue `lanes[]`: `graph-impact` + mini; `graph-changes` + mini + quick; `graph-coverage` + quick; `graph-cochange` + mini; `graph-map` + quick + mini (1.8.2 added quick) | `bin/cli.js LANE_CALLS`; `test/cli/graph-lanes.test.js` | additive rows; the old test comment's premise is retired on purpose and the new comment says why |
| S5 | `PHASE-EDGE` role family `recon` | `templates/hooks/orc-trace.js` family map; `trace.md` row; `test/hooks.test.js` | additive |
| S6 | two agent files registered | `bin/verify-package.js` (names + floor 44 → 46); `templates/agents/MODEL-MAPPING.md` | additive |
| S7 | quick `own_phases.trace_verbs`: q1 + `GRAPH-CONSULT`, `GRAPH-MAP`; q3 + `GRAPH-UPDATE`, `GRAPH-CHANGES`, `GRAPH-GAIN`, `REPRO` | `bin/cli.js LANE_OWN_PHASES`; `test/cli/lane.test.js` | headings unchanged |

No new config key. Quick stays key-free; mini adds none. The complexity
thresholds are constants with their reasons in the spine (no voodoo numbers).

---

## 6. Backward compatibility — a 1.8.x user upgrades and everything works

| Concern | Rule | Mechanism that exists |
|---|---|---|
| New agents | additive files; `orc update` installs them | the install manifest + `verify-package.js` naming them |
| A 1.8.2 payload with a 1.9.0 CLI | every old call keeps its flags and exits; new `lanes[]` rows only widen permission | `orc doctor` reports version drift as today |
| A 1.9.0 payload with a 1.8.2 CLI | `orc rules slice` returns the full card (no `compact`); `LANE_OWN_PHASES` lacks the new verbs — the lane still emits them; `orc lane calls` lacks the new rows — the spine names the call and its canonical file | stated as a known limit in the CHANGELOG, as 1.8.2 did |
| The executor return | `repro` is required ONLY when requested; every 1.8.x slice never requests it | the same pattern as `tdd_state`, `wiki_used`, `graph_used` |
| Traces | one new verb; `orc stats` reads only `STATS`; `/orc-retro` ignores an unknown verb | trace.md's additive-row rule |
| The quick doc | new entry fields are optional lines; old entries stay valid; the TOC block is unchanged | `context-doc.md` "use as many as apply" |
| Descriptions | the trigger phrases survive verbatim (`/orc-quick`, "quick fix", "quickly find out", "fix the comments on PR", `/orc-mini`, "use orc-mini to implement") | W1 gate re-reads them |
| Spine budgets | quick gains a pin; mini keeps 270 unless a raise carries its comment | `BUDGETS` in `verify-contracts.js` |
| `orc ui` | the Lanes panel renders `orc lane phases` — quick's card shows the new verbs; the fixture gains them; the mocked-run catalogue re-reads `mock-run/orc-quick.md` | `orc-ui-wiki.md` gets one line |

---

## 7. If a 1.8.2 item did not ship

| Missing | This plan does instead |
|---|---|
| `ROUTE` edges | Q4/M5 still run `changes … tests[]` (call edges only); the blast-radius line prints `route tests: unknown — a test that reaches this through a URL is not an edge` |
| `map` | Q1 "names no file" falls back to Grep/Glob as today; M2 `graph_facts` carries `impact` + `cochange` only |
| `--for-slice` | the slice carries a plain `ctx <declared files>` card as in 1.8.1 |
| `--source` | the recon agent reads the range with `Read offset/limit` (ladder step 3) |
| `update --notes-pending` | two calls, as in 1.8.1 |
| the gain line | the line is omitted; the budget arithmetic in `05-trim.md` loses one line per spine |

Each fallback is one sentence in the spine, so a wave can ship against either
state.

---

## 8. Waves

Pause after every two waves. Every pause holds `npm run verify` and `npm test`
green with the baseline count or higher.

| Wave | Work | Exit gate |
|---|---|---|
| **W0** measure and freeze | Re-run the baseline on the 1.8.2 tree: `npm test` count; `wc -l` both spines; description chars for all skills; the `BUDGETS` rows; `orc lane calls`/`phases` for both lanes. Run the R3-C question through `/orc-quick` look mode ONCE with 1.8.2 to confirm `ROUTE` rows reach a card. Write `findings/W0-baseline.md`. | the numbers in `00-README.md` are current or corrected |
| **W1** trim (T1–T4) | The two descriptions, the two command files, the two spines deduped per `05-trim.md` §3; quick budget pin 325 added; a new payload test: **every** skill description ≤ 1,024 chars and quick/mini ≤ 350. | `npm run verify` green (all 67 pinned tokens present — 25 quick · 42 mini); quick ≤ 300 lines, mini ≤ 250 lines before W3/W4 additions; the trigger phrases present; one fresh session confirms both skills still trigger on their phrases |
| **W2** shared plumbing (S1–S7) | `repro` field (template → build:agents, core.md, return-validation §5d, token); `REPRO` verb; `rulesSlice()` compact + test; catalogue `lanes[]` + graph-lanes test; hook `recon` family + test; the two recon agents + verify-package + MODEL-MAPPING; quick `trace_verbs`. | `npm test` green; `orc rules slice --lane orc-quick --json` `text` ≤ 1,500 tokens with every HARD id present; `orc lane calls orc-quick` lists `graph-changes`, `graph-coverage`, `graph-map`; `orc lane calls orc-mini` lists `graph-impact`, `graph-changes`, `graph-cochange`, `graph-map` |
| — PAUSE — | full `npm test`; one dry `/orc-quick` recon entry on `../orc-eval` shows `SPAWN orc-recon-…` in the trace | |
| **W3** quick (Q1–Q11) | The spine per `03-orc-quick-spec.md`; `references/look.md` (the graph-first dig) and `references/defect.md` (reproduce first) new; `dispatch-gate.md`, `context-doc.md`, `gh-mode.md` updated; `README.md` §3–§7 and `mock-run/orc-quick.md` show the new lines. | quick ≤ 320 lines; every Q-heading byte-identical; the graph-lanes test's quick assertions green; `npm run verify` |
| **W4** mini (M1–M7) | The spine per `04-orc-mini-spec.md`; `references/complexity.md` new (thresholds with reasons, the line formats); `orc-planner-mini-sonnet-5-high.md` + `orc-planner-mini-opus-5-med.md` gain `graph_facts`; `wiki-consult.md` lane-delta sentence names mini; `examples/mini-run-mock.md` shows the new lines. | mini ≤ 270 lines or a commented raise; the disposition and `risk[]` tokens still present (payload tests); `npm run verify` |
| — PAUSE — | full `npm test`; one `/orc-mini` dry run on `../orc-eval` prints the complexity line with numbers | |
| **W5** docs, UI, release, eval | README + README-id (lane table rows, the graph paragraph, version line, changelog bullet), CHANGELOG (1.9.0 on top), `knowledge.md` router row + `knowledge-parts/03` §4w rewrite + a new `§4z.<n>` for mini in `knowledge-parts/06`, `claude-rules/05` + `06`, `orc-ui-wiki.md` (Lanes panel verbs; mocked run), `bin/webui/fixtures/lanes.js` (quick verbs), `guides/model-selection.md` (recon is Claude-only, not a position), `templates/hooks/README.md` if the statusline text names a phase, `npm version minor` → **1.9.0**, ONE commit with only package/payload/doc files. Then §14 on `../orc-eval`, filed in `eval/results/1.9.0/`. | `npm run verify` + `npm test` green; the eval gate in §14 met or its miss written into the CHANGELOG limits |

---

## 9. Risks

| Risk | Control |
|---|---|
| A shorter description under-triggers | keep every trigger phrase verbatim; W1 gate tests both skills in a fresh session with all 33 loaded |
| Mini's spine does not fit 270 | W1 compresses first and measures; a raise is one commented line in `BUDGETS`, never silent |
| The recon return floods the orchestrator's context | `answer ≤ 12 lines`, `evidence ≤ 12 rows`; the return is paid every later turn (the noter lesson, `code-graph.md` §6.3) |
| `changes` reads the user's unrelated dirty files | filter `symbols[]` to the entry's `actual_files` client-side; propose `--files` on `changes` only if filtering proves lossy (not in this release) |
| A test runner that cannot take a file list | the step says so in one line and runs the suite; never invents a command |
| `repro` cannot be written (no runner, no reachable entry point) | `repro: none` + reason is an HONEST return; the entry says "not reproduced"; the commit offer shows it |
| Resuming a subagent drops its model (§5.2 bugs) | quick never resumes across entries (DE-11) |
| Headings Q0–Q3 drift from `LANE_OWN_PHASES` | a payload test asserts each manifest heading exists in the spine byte-for-byte |
| The `→ suggested` marker reads as a default | the marker line always ends with "your choice — nothing runs until you answer"; the gate's rule 1 is restated in `dispatch-gate.md` beside it |
| Retro sees a new role family | `recon` is added to the family map in the same wave as the agents; a run before W2 has no recon agent to mis-count |

---

## 10. Decisions for you

| # | Question | Options | Recommendation |
|---|---|---|---|
| **DE-1** | Recon | (a) a pinned pair `orc-recon-sonnet-4-6-med` + `orc-recon-opus-5-low`, ad-hoc "other" kept as escape hatch (model only) · (b) reuse `orc-scout-*` · (c) keep ad-hoc, drop the effort knob | **(a)**. It closes F1 and F2 at once and gives recon a return contract. The scouts return evidence for an analyst, not an answer for a person |
| **DE-2** | Reproduce-first attestation | (a) a `repro` slice + return field via the executor template (the house pattern) · (b) an acceptance line + `evidence` only | **(a)**; (b) cannot be validated by name |
| **DE-3** | The rules card in quick | (a) CLI-owned compact form for `--lane orc-quick` · (b) keep the full card | **(a)**; `rules.md` names `rulesSlice()` as the only lever, and quick is the lane with the smallest tasks under the largest fixed card |
| **DE-4** | The gate suggestion marker | (a) add `→ suggested` with its reason · (b) reasons only, no marker | **(a)**; every question carries a recommendation (`interview.md`), and a marker is not a default |
| **DE-5** | The executor menu | (a) keep the pair · (b) add `orc-executor-sonnet-5-high` as a middle line | **(a)**; three lines plus extra's line 4 is a menu, not a choice; the marker does the routing work |
| **DE-6** | Complexity thresholds | callers in ≥ 4 files · confident callers ≥ 8 · any `risk[]` · cochange partner ≥ 3 not in plan | **these**, as a start; `/orc-retro` can move them later. Each carries its reason in `references/complexity.md` |
| **DE-7** | Mini wiki | (a) pointers, never bodies, in the orchestrator · (b) keep content reads | **(a)**; the planner reads pages itself; the orchestrator's context is the 74–80% surface |
| **DE-8** | The `changes` signal in mini | (a) print the line, and add ONE option to the existing end-of-run question when a `risk: high` row has no test · (b) print only | **(a)**; it adds no user turn |
| **DE-9** | Spine budgets | quick pin 325 · mini stays 270 (raise to 280 only with a comment) | **as written** |
| **DE-10** | Repro trace verb | (a) new `REPRO red|green` · (b) reuse `TDD-RED`/`TDD-GREEN` | **(a)**; a repro is not a `tdd_spec`, and retro should count them apart |
| **DE-11** | Resume a subagent across quick entries | (a) never · (b) allow with a re-check | **(a)**; two open bugs drop the model override on resume |
| **DE-12** | `when_to_use` frontmatter | (a) no · (b) yes | **(a)**; same cap, one field travels through `orc export` |
| **DE-13** | Version | 1.9.0 minor | **as asked**; CLAUDE.md's rule agrees |
| **DE-14** | Who computes the complexity VERDICT | (a) the spine states the rule, the CLI supplies the numbers, the orchestrator prints the line · (b) a new `orc graph impact … --fit mini` returns `{verdict, why[]}` | **(a)** for 1.9.0; (b) follows S1 (a state is computed by the CLI) and is the right next step once the thresholds have survived a retro |

---

## 11. Files this plan touches

**Payload — quick:** `templates/skills/orc-quick/SKILL.md` · `references/dispatch-gate.md` ·
`references/context-doc.md` · `references/gh-mode.md` · NEW `references/look.md` ·
NEW `references/defect.md` · `README.md` · `templates/commands/orc-quick.md` ·
`mock-run/orc-quick.md`

**Payload — mini:** `templates/skills/orc-mini/SKILL.md` · NEW
`templates/skills/orc-mini/references/complexity.md` · `examples/mini-run-mock.md` ·
`templates/commands/orc-mini.md` · `templates/agents/orc-planner-mini-sonnet-5-high.md` ·
`templates/agents/orc-planner-mini-opus-5-med.md`

**Payload — shared:** NEW `templates/agents/orc-recon-sonnet-4-6-med.md` · NEW
`templates/agents/orc-recon-opus-5-low.md` · `templates/agents/MODEL-MAPPING.md` ·
`agents-src/executor.template.md` → the generated executors ·
`templates/skills/orc/subskills/orc-execution/core.md` ·
`templates/skills/_shared/return-validation.md` (§0 honest-limit wording, §5d `repro`) ·
`templates/skills/_shared/phases/trace.md` (`REPRO`, `recon` family) ·
`templates/skills/_shared/phases/wiki-consult.md` (lane delta names mini) ·
`templates/skills/_shared/phases/rules.md` ("Cost" names the compact lanes) ·
`templates/hooks/orc-trace.js` (role family)

**CLI:** `bin/cli.js` (`LANE_CALLS` lanes[], `LANE_OWN_PHASES` verbs, `rulesSlice()`
compact) · `bin/verify-package.js` · `bin/verify-contracts.js` (tokens `repro`,
`orc-recon-`, `REPRO`; quick `BUDGETS` pin) · `bin/webui/fixtures/lanes.js`

**Tests:** `test/cli/graph-lanes.test.js` · `test/cli/lane.test.js` · `test/payload.test.js`
· `test/hooks.test.js` · `test/cli/rules*.test.js` (compact form) · NEW description-length test

**Docs:** `README.md` · `README-id.md` · `CHANGELOG.md` · `knowledge.md` ·
`knowledge-parts/03-dispatch-and-models.md` §4w · `knowledge-parts/06-lanes-build.md` (new §) ·
`claude-rules/05-build-lanes.md` · `claude-rules/06-standalone-lanes.md` · `orc-ui-wiki.md` ·
`guides/model-selection.md` · `CLAUDE.md` layout line for `templates/agents/` count · `package.json`

**Never staged:** this folder and every other notes folder, `result.md`, `test.md`,
`eval/`, the user's `.gitignore` and `test/docs.test.js` edits.

---

## 12. Tests

| Test | Holds |
|---|---|
| NEW `test/payload.test.js` "description length" | every `SKILL.md` description ≤ 1,024 chars (the spec cap); `orc-quick` and `orc-mini` ≤ 350 |
| NEW payload: own-phase headings | each `LANE_OWN_PHASES` heading for `orc-quick` exists byte-for-byte in the spine |
| `graph-lanes.test.js` | new `lanes[]` sets; every graph row still canonical to `code-graph.md`; every listed lane a code lane; quick and mini spines point at `references/look.md` / `references/complexity.md` |
| `lane.test.js` | quick `trace_verbs` per phase; the manifest shape unchanged |
| payload: recon | both agent files exist, `model`/`effort` frontmatter matches the name (S2 rename rule), `graph_used` and `actual_model` in the return; `dispatch-gate.md` names both; `MODEL-MAPPING.md` rows |
| payload: repro | `repro` in every executor agent, `core.md`, `return-validation.md`, quick spine; "REQUIRED when the slice carried `repro`" wording; `defect.md` names red-before/green-after |
| `hooks.test.js` | `SPAWN`/`RETURN` for `orc-recon-*`; `PHASE-EDGE recon`; `orc run inflight` sees a recon in flight |
| rules compact | `--lane orc-quick` `text` shorter than `--lane orc-mini`; same `line`; every HARD id present in both; `compact: true` only for quick |
| `verify-package.js` | two names added; floor 46 |
| `verify-contracts.js` | tokens `repro`, `orc-recon-`, `REPRO`; quick `BUDGETS` 325 |

---

## 13. Docs (the P0 rules in CLAUDE.md)

- `package.json` → 1.9.0 via `npm version minor`.
- `README.md`: version line + date; the changelog block gains
  `- **v1.9.0** — the lean lanes look before they leap · _<date>_` on top (title
  only in the expandable history); the lane table rows for `/orc-mini` and
  `/orc-quick` mention the evidence line and the recon pair in one clause each;
  the graph paragraph's lane list is unchanged.
- `README-id.md`: the version line and the changelog title, in the same
  pattern (`Versi terbaru: v1.9.0`).
- `CHANGELOG.md`: `### v1.9.0 — the lean lanes look before they leap _(<date>)_`
  with the upgrade CAUTION block copied as every entry does, the two lanes'
  changes, the shared plumbing, the compatibility table's "known limit" row.
- `knowledge.md`: a router row for the new mini section; §4w row unchanged.
  `knowledge-parts/03` §4w rewritten for recon, repro, graph-first look, the
  budget pin. `knowledge-parts/06` gains `§4z.<n> The mini lane at 1.9.0`.
- `claude-rules/06` quick bullet: recon pair, repro, look protocol, the pin.
  `claude-rules/05`: a mini bullet for the evidence line, pointers, the changes
  signal.
- `orc-ui-wiki.md`: the Lanes panel's phases card for `orc-quick` shows the new
  verbs; the mocked-run catalogue picks up the new `mock-run/orc-quick.md`; the
  extra-lanes card's `offered` word is unchanged.
- `mock-run/orc-quick.md`, `orc-mini/examples/mini-run-mock.md`,
  `orc-quick/README.md`: the runs show the new lines.
- All in ASD-STE100; the quick files in simple English.

---

## 14. Eval — round M4 (`eval/results/1.9.0/`)

Tokens are reported, never gated (EW8). The claim is correctness, traceability
and round trips.

| Scenario | Lane | What is measured | Gate |
|---|---|---|---|
| S1a defect hunt: a planted bug in the Express fixture (`searchByItemPrefix` drops the last item) | `/orc-quick` | `REPRO red` before the fix and `REPRO green` after, both in the trace and the entry; affected tests named and run first; the blast-radius line; ONE user turn; executor `Read` calls | repro shown red→green in 3 of 3 runs; user turns = 1; regressions 0 |
| S1b context dig: the R3-C blast-radius question | `/orc-quick` recon | recall per caller class (direct · ROUTE · alias · inherited); invented callers; the silence sentence present when an absence rests on the graph; `SPAWN orc-recon-…` in the trace; `orc run inflight` reports it while it runs | recall on ROUTE ≥ the OFF run (11); invented = 0; traced 3 of 3 |
| S2 store extraction (W9's task) | `/orc-mini` | the complexity line with numbers; `graph_facts` in the planner slice; exit gate `ctx` batch; `wiki_used` non-`none` or paths only; the `changes` line; previously-passing tests broken (TDAD's metric) | regressions 0; complexity line present with `callers` and `risk` fields 3 of 3 |
| S3 quick on a request that names no file ("where is the retry logic?") | `/orc-quick` | `GRAPH-MAP` in the trace; files found in ≤ 3 calls; orchestrator `Read` calls vs the 1.8.2 run | fewer orchestrator reads than the 1.8.2 baseline on the same prompt |

N = 3 per cell, fresh session each, `../orc-eval` reset per run (`w9/reset.ps1`
moves old traces aside). A cell that misses its gate ships with the miss
written in the CHANGELOG limits, exactly as R3-C was.

---

## 15. Not in this release, with the reason recorded

| Not shipping | Why |
|---|---|
| `orc graph importers <package>` for dependency bumps | the graph marks outside imports `UNRESOLVED` and does not index them by package; a Grep for the specifier is exact and cheap. Revisit if a retro shows bump entries reading many files |
| A CLI-computed complexity verdict (`--fit mini`) | DE-14: thresholds first survive a retro, then move into the CLI |
| A `context-reader` position for recon (`orc extra role`) | recon stays on Claude: it reads the whole repository and returns an answer the gate trusts; a foreign reader is a different trust question |
| Resuming recon across entries | DE-11 |
| Affected-tests-first in `orc-fast` | out of scope by the user's instruction; the same `changes` step fits F3 later |
| Mini waves or a second executor | mini's promise is ONE executor; the evidence line recommends `/orc` instead |
