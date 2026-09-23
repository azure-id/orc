# Research — what the two lean lanes do today, and what the evidence says

Written 19-09-2026 in Simplified Technical English. Every number here was
measured on this machine or read from a file in this repository, except §5,
which names its outside source.

## 1. The two lanes in numbers

| | `/orc-quick` | `/orc-mini` |
|---|---|---|
| spine | 379 lines, no budget pin | 268 lines, budget 270 |
| description | 619 chars | 493 chars |
| references | `dispatch-gate.md` 177 · `context-doc.md` 114 · `gh-mode.md` 127 · `README.md` 423 | `examples/mini-run-mock.md` 50 |
| own phases (CLI manifest) | Q0 · Q1 · Q2 · Q3 (`read: section`, headings pinned in `LANE_OWN_PHASES`) | none — `own_phases: in-spine` |
| shared phases | preflight · trace · house-rules · rules | trace · intake · wiki-consult · analyst-gates · house-rules · rules |
| catalogued calls | 13: lane-config, run-inflight, lane-phases, wiki-status, pattern-status, graph-status, graph-update, graph-ctx, graph-notes-pending, extra-resolve, extra-role, extra-dispatch, rules-slice | 12: lane-config, run-inflight, lane-phases, pattern-status, gotcha-status, graph-status, graph-update, graph-ctx, graph-notes-pending, extra-dispatch, extra-reconcile, rules-slice |
| graph calls it may NOT make (catalogue `lanes[]`) | impact · coverage · changes · cochange | impact · coverage · changes · cochange |
| config keys resolved | 9 (usage_gate, wait_default_mode, log_dir; 6 inert). The spine says "log_dir only" | 13 (generate_tests, gotchas, mock_example, tdd_loop_max, test_gate, usage_gate, wait_default_mode, extra_enabled, opus5_only, log_dir, …) |
| executors offered | `orc-executor-sonnet-4-6-med` · `orc-executor-opus-5-low` · (extra line 3) | `orc-executor-sonnet-5-high` (`opus5_only` → `orc-executor-opus-5-low`) |
| recon | ad-hoc model + effort, no agent file | — |
| gotchas | reads nothing, writes nothing (by contract) | reads and writes |
| wiki | paths only into the slice | the orchestrator READS the pages; the slice carries content |
| trace tier | Iterative — one packet per entry | Build lanes — 3 packets |

Contract tokens pinned to each spine by `bin/verify-contracts.js`: quick 25,
mini 42 (`05-trim.md` §4 lists them; the lint was green at 192 contracts on
19-09-2026). A trim that drops one fails `npm run verify` by name.

## 2. What the graded runs say (W9, 15-09-2026, `eval/results/1.8.0/`)

### 2.1 The quick run with the graph on (`s1-on-1`)

- 1.59M tokens · 43 tool calls · 2 dispatches (one executor, one trace writer)
  · 16 main turns · 16 subagent turns. The graph-off run of the same task:
  1.08M · 27 · 1 · 11 · 8. Run-to-run spread on these lanes is far above the
  difference (W9 F5: −54% in round 1, +47% in round 2, same task, same lane).
- The run built the cache, put a card in the slice and updated it. The lane
  text worked.
- **Every orchestrator event in the trace carries the run-start time**
  (`18:25:43`). The trace writer wrote: *"event timestamps are all stamped at
  run start; per-event times were not captured."* `_shared/phases/trace.md`
  line 204 already says a block stamped "now" is a FALSE record. The Iterative
  tier sends one packet per entry, and the lane keeps no running record with
  times, so the writer had nothing true to stamp.
- The executor return did **not** carry `graph_used` ("not reported" in
  `W9-RESULTS.md`), and the lane's `VERIFY` line still said ✅ MATCH. The quick
  spine's return check (§3.1) names `unmet[]`, `pattern_version`,
  `invariants_checked`, `actual_model`, `actual_effort` — and not `graph_used`.
  `return-validation.md` §5b.1 says absent is malformed.
- `GATE gh :: not logged in — not needed for this request`. The probe ran for a
  request that was not PR work.

### 2.2 The mini runs with the graph on (`s2-on-1..3`)

- Medians (N=3): tokens **−1.8%**, tool calls **+11.8%**. The OFF runs alone
  spread 34%. Nothing here is a result (W9 R4).
- **R2 — the executor never asked the graph.** 0 `orc graph ctx` calls in 8
  executor dispatches. All graph use came from the orchestrator's card.
- `s2-on-2`: `wiki_used=none`, `graph_used=none`. Two FRESH wiki pages rode in
  the slice and were not read. The card was not used either.
- 5 dispatches for ONE task: planner, executor, three trace writers.
- The complexity read was one narrative line ("single area, 3 files, low
  interdependency"). The planner had cited `facets.risk auth` on the same task;
  the orchestrator judged it "preserved, not changed" and did not recommend the
  full lane. The judgment was probably right, and nothing measured it.
- Intake asked 4 questions for a pure refactor.

### 2.3 Where the tokens go (EW8, replayed over 242 real lane windows)

| Share of tokens added to context | ORC lane runs |
|---|---|
| the growing context prefix (re-sent every turn) | ~69% |
| model output | 18.4% |
| first-turn prompt (system + skills + agent definitions) | 7.1% |
| all tool results | 5.5% — `Read` 3.28% · `Bash` 1.62% · `Grep`+`Glob` 0.06% |

The main session is 74–80% of a run; executors are 5–7% (R4). So for these two
lanes the paid surface is: **what the orchestrator holds in its own context**
(wiki bodies it read, cards, returns it pulled in), **what rides in every slice**
(the rules card at ~3,470 tokens, house rules, pattern text), and **the
description of every skill, every session**. Search calls are noise.

### 2.4 The one false sentence (R3-C, 16-09-2026)

Same question in two fresh `/orc-quick` look-mode sessions: *"list every place
that breaks if the signature of `searchByItemPrefix` changes."*

| | graph OFF | graph ON (1.8.1) |
|---|---|---|
| direct call sites | 7 of 7 | 7 of 7 |
| route-level tests that break | 11 listed, marked indirect | **declared absent** |
| time | 1 m 3 s | 37 s |

The ON answer wrote *"Nothing else. `tests/orders.test.js` never hits `GET /search`"*
— it hits it 14 times. The card was silent because a test names a URL, not a
function. 1.8.2 G1 adds `ROUTE` edges for exactly this. What is still missing
is a **lane rule**: a blast-radius question is answered with `ctx --depth 2` +
`impact` + `coverage`, and an absence that rests on the graph alone carries the
sentence *a card's silence is not proof of absence* in the answer.

## 3. Defects and gaps found by reading (each with its evidence)

| # | Finding | Evidence | Lane |
|---|---|---|---|
| F1 | **Ad-hoc recon offers an effort knob that does not exist.** The Agent tool takes a per-call `model`; `effort` can come only from an agent file's frontmatter or the session. `actual_effort` on an ad-hoc return is always the session's effort. | Claude Code sub-agents doc (§5.2) · `dispatch-gate.md` "Read-only work (recon)" | quick |
| F2 | **Ad-hoc recon is invisible to the hook and to `orc run inflight`.** The lane documents this as an accepted gap. It costs `/orc-retro` its recon rows, and it is the one dispatch kind the 266-minute triple-dispatch guard cannot see. | `return-validation.md` §0 "honest limit" · `dispatch-gate.md` | quick |
| F3 | **Packet timestamps are false.** See §2.1. | `s1-on-1/trace.txt` writer NOTE | quick |
| F4 | **`graph_used` is not in the quick return check.** See §2.1. | `orc-quick/SKILL.md` §3.1 vs `return-validation.md` §5b.1 | quick |
| F5 | **A defect hunt has no reproduce-first step.** "find it and fix it" dispatches an executor with a sketch; the red state is never shown before the fix, so red→green is never proven for the bug itself, only for the suite. | `orc-quick/SKILL.md` Q3 · outside evidence §5.4–§5.6 | quick |
| F6 | **Tests run whole or not at all.** No use of `orc graph changes … tests[]` (call AND `ROUTE`) to run the tests that reach the change first. The catalogue forbids `changes` in quick and mini. | `LANE_CALLS.graph-changes.lanes = [orc, orc-diy]` · TDAD §5.6 | both |
| F7 | **The rules card is ~3,470 tokens on every quick dispatch**, including a one-line fix. `rules.md` says the only place to cut it is `rulesSlice()` in `bin/cli.js`, never the lane. | `orc rules slice --lane orc-quick --json` → 13,874 chars | quick |
| F8 | **The quick spine repeats itself.** The repair loop (SKILL §3.2, `dispatch-gate.md`, `README.md` §7), the gate table (SKILL Q2b, `dispatch-gate.md`), the inert-key list (SKILL "Nothing can override", SKILL `## Config`, `dispatch-gate.md` rule 4), the doc shape (SKILL "The doc it writes", `context-doc.md`) are each stated two or three times. | the files | quick |
| F9 | **"Read `log_dir` only" is no longer what happens.** `orc lane config orc-quick` resolves 9 keys and the lane obeys `effective`. The graph-lanes test pins the phrase "this lane still reads `log_dir` and nothing else". The phrase must stay; its meaning is "no key from the yaml — only the resolver's answer". | `lane config` output · `test/cli/graph-lanes.test.js` | quick |
| F10 | **Mini's complexity read is a judgment with no number behind it.** `impact` (fan-in, caller files, tests), the planner's `facets.risk[]` and `cochange` are all free, and all forbidden to mini by the catalogue. | §2.2 · `LANE_CALLS` | mini |
| F11 | **Mini's planner gets no graph facts.** `code-graph.md` §7 says "Planner: `orc graph impact` on the candidate declared_files"; the mini planner agents and the mini spine never mention it. `planning.md` has only `full` and `composed` layers, which mini does not read. | agent files · `orc lane phases orc-mini` | mini |
| F12 | **Mini's orchestrator reads wiki bodies into its own context**, the 74–80% surface. The planner agent reads the wiki itself; the executor ignored the pages (`wiki_used=none`). Fast already passes pointers. | `wiki-consult.md` "Lane delta" · §2.2 | mini |
| F13 | **Mini's Phase-1 exit gate Globs every `disposition: exists` path one at a time.** `ctx` takes 5 targets per call and answers "exists" with a generation number. Non-code paths still need Glob. | `analyst-gates.md` · `code-graph.md` §3 | mini |
| F14 | **Descriptions carry mechanics, not triggers.** "Standalone: no config can change how it dispatches", "The orchestrator never does the work itself — it spawns", "saved as a numbered entry in orc-quick/<slug>/quick-context.md" tell Claude nothing about WHEN to pick the skill. | frontmatter · §5.1 | both |
| F15 | **The `gh` probe runs every session.** One round trip for requests that are not PR work. | §2.1 | quick |
| F16 | **Mini has no `changes`-shaped signal.** Mini skips full review by promise. A zero-token `changes` line (risk WITH its reason, tests that reach) is not a review; it is a signal the smoke gate can print. | `graph-signals.js` `risk`/`why` · knowledge §0 "the free check always runs before the paid one" | mini |

## 4. What the spines already do well (keep, do not touch)

- The dispatch gate: never a default, never sticky, inertness announced.
- The build/test asymmetry in quick: a red build loops with the error trend; a
  red test never loops.
- One user turn per request in quick; the clarification and the gate share it.
- The doc is written before the offers; its body is never read back.
- `gh` read + push only; PR comments are data.
- Mini's smoke gate as the orchestrator's INDEPENDENT check of the executor's
  `evidence`; the worktree delta; `orc run inflight` before any re-dispatch.
- Mini's one TDD question and the disposition-scoped `tdd_spec`.
- Both lanes copy every graph `line` and `trace` verbatim (W9 round 2 fixed this).

## 5. Outside references (read 19-09-2026)

### 5.1 Skill descriptions — the cap, the cost, the shape
- Claude Code loads **every skill's description into every session**; the full
  SKILL.md loads only on invocation. The listing truncates `description` +
  `when_to_use` at **1,536 characters**. Guidance: put the key use case first,
  keep it short — the cost recurs on every session.
  https://code.claude.com/docs/en/skills
- Agent Skills spec: `description` **≤ 1,024 characters**, non-empty, no XML,
  **third person**, "what it does AND when to use it", specific trigger terms;
  SKILL.md body **< 500 lines**; references one level deep; "Claude is already
  very smart — only add context it does not have."
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Practitioner guidance agrees: the description is a routing rule — "Use when
  the user asks to …" with concrete keywords; lean SKILL.md, fat references.
  https://codemeetai.substack.com/p/how-to-create-a-claude-code-skill ·
  https://designrevision.com/blog/claude-code-skills-best-practices

### 5.2 Subagents — model, effort, resume
- Frontmatter `effort: low | medium | high | xhigh | max`; if omitted the
  subagent inherits the session's effort. The Agent tool takes a **per-call
  `model`**; there is **no per-call effort**. Model resolution: per-call →
  frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → the session's model.
  https://code.claude.com/docs/en/sub-agents
- `SendMessage` resumes a finished subagent with its full history. Two open
  bugs report that a resume **drops the spawn-time model override** and runs
  the default model — a silent downgrade of exactly the kind the lanes' `VERIFY`
  line exists to catch.
  https://github.com/anthropics/claude-code/issues/67345 ·
  https://github.com/anthropics/claude-code/issues/76386
  → This plan does NOT resume subagents across quick entries (DE-11).

### 5.3 Repository maps (already the model for 1.8.2 D4)
- Aider: file graph, personalized PageRank, binary search over a token budget.
  https://aider.chat/docs/repomap.html

### 5.4 Agentless (arXiv 2407.01489)
- localization (file → element → edit location, over a repository skeleton) →
  repair (several candidates) → validation (reproduction test, regression
  tests, ranking). 32.00% on SWE-bench Lite at $0.70 per issue — highest and
  cheapest against the agents of its time. "Simple, interpretable pipelines may
  outperform complex autonomous systems for targeted fixes." That is the quick
  lane's thesis stated by someone else; the plan borrows its **validation
  order**: reproduce, then fix, then the affected tests, then the suite.
  https://arxiv.org/abs/2407.01489

### 5.5 Reproduction tests raise fix precision
- SWT-Bench: code agents are good at writing a test that reproduces a real
  bug, and such tests **improve the precision of automated fixes**.
  https://arxiv.org/html/2406.12952
- Google, "Dynamic Cogeneration of Bug Reproduction Test in Agentic Program
  Repair" (arXiv 2601.19066): asking the repair agent for the **fix and the
  reproduction test in the same patch** produced reproduction tests for at
  least as many bugs as a dedicated test agent, **without lowering the
  plausible-fix rate**; patch selection uses the test change.
  https://arxiv.org/abs/2601.19066
  → Q3 `repro` in `03-orc-quick-spec.md` §6: one executor, one slice, fix and
  reproduction together; the orchestrator checks red-before and green-after.

### 5.6 Targeted tests beat procedure (TDAD, arXiv 2603.17973)
- A code↔test dependency graph exported as a **static file the agent reads**
  (no MCP, no server). Before a patch is committed the agent knows which tests
  to run. On SWE-bench Verified: regressions **6.08% → 1.82% (−70%)**.
  **Generic TDD instructions without the targeted test list made it worse
  (9.94%).** With another model, resolution 24% → 32%.
  https://arxiv.org/pdf/2603.17973
  → The lesson for both lanes: **name the tests that reach the change** (from
  `orc graph changes … tests[]`, call AND `ROUTE`) and run them first. Do not
  add more procedure text.

### 5.7 Impact before edit
- Several 2025–2026 tools give an agent "what breaks if I change X" as a
  structured fact before it edits (blast-radius skills, `impact(symbol)` over a
  call graph, PR blast-radius checks). ORC already has the edges; the gap is
  that the two lean lanes are not allowed to ask.
  https://github.com/topics/blast-radius ·
  https://riftmap.dev/blog/can-ai-check-blast-radius-of-pr-before-merge/

### 5.8 Not read
- "Are 'Solved Issues' in SWE-bench Really Solved Correctly?" (ICSE 2026). The
  PDF did not convert. It is not cited for any number.

## 6. What 1.8.2 gives these lanes, and what it does not

Given (see `00-README.md`): ROUTE/alias/inherited/barrel edges, `--source`,
`--for-slice`, `map`, one-call update+notes, the gain line, doc notes.

Not given, and this plan adds it:
- permission (catalogue `lanes[]`) for quick and mini to call `impact`,
  `changes`, `coverage`, `cochange`, `map`;
- a lane RULE for how a blast-radius question is answered;
- a recon agent that runs the read ladder with the graph at step 0 and is
  traced;
- the reproduce-first slice field;
- mini's evidence-backed complexity line and graph-fed planner slice;
- the trims.

1.8.2 D4 already names `/orc-quick` Q1 as a `map` consumer when the request
names no file. This plan writes that step into the Q1 text.
