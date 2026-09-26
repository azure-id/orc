# Phase reference — Trace verbs   (id: `trace-verbs`)

> **Library file, read ON DEMAND** — only for a verb not in `orc lane phases <lane> --json` → `trace_grammar`, or for a verb's detail. Data: `TRACE_VERBS` in `bin/cli.js`; `npm run verify` fails when they disagree or a phase lists an unknown verb.

<!-- orc:layer core -->

## Verb set (CLOSED — never invent new verbs)

"Emitted by" now reads **orc → writer** for the narrated verbs: the orchestrator
supplies the fact in a packet, the writer writes the line. `SPAWN`, `RETURN` and
`PHASE-EDGE` stay hook-owned and need no cooperation at all. ` · ` separates the
sub-forms of one verb. "Owner" is the file that holds the detail; a verb whose
owner is this file has its detail in "Verb detail" below.

| Verb | Emitted by | Meaning | Owner |
|------|-----------|---------|-------|
| `PHASE <name> start\|end` | orc → writer | phase transition | `_shared/phases/trace.md` |
| `PHASE-EDGE <role-family> :: first=<agent>` | hook | deterministic phase inference: a SPAWN whose role family differs from the previous one opens an edge | `hooks/orc-trace.js` |
| `CONFIG <key=value …>` | orc → writer | Phase 1 — the resolved config values this run will consume, ALWAYS with opus5_only | `_shared/phases/trace-verbs.md` |
| `WIKI-CONSULT <fresh\|aging\|stale\|absent\|empty> :: docs=<list\|none>` | orc → writer | project wiki consulted for grounding, with its staleness tier | `_shared/phases/wiki-consult.md` |
| `CROSSLINK <cached\|configured-no-cache\|none> :: boundaries=<n> peers=<names> · CROSSLINK inject task=<id> :: <boundary>` | orc → writer | cross-repo peer-knowledge state at the consult point; `inject` when a slice receives a linked contract | `_shared/phases/wiki-consult.md` |
| `GRAPH-CONSULT <fresh\|updated\|built\|drifted\|none\|off> :: files=<n> symbols=<n>[ density=<n>[ thin=1]] · GRAPH-CONSULT card task=<id> :: targets=<…>` | orc → writer | the code graph's preflight state, copied VERBATIM from the CLI `trace` field | `_shared/code-graph.md` |
| `GRAPH-UPDATE <state> :: parsed=<n> reused=<n> deleted=<n> gen=<n> route=<n> ms=<n>` | orc → writer | one graph update, the `trace` field of `orc graph update --json`, verbatim | `_shared/phases/trace-verbs.md` |
| `GRAPH-MAP <repo\|focused> :: files=<shown>/<total> [focus=<a,b>] gen=<n>` | orc → writer | ONE line at the start of planning, the `trace` field of `orc graph map --json`, verbatim | `_shared/phases/trace-verbs.md` |
| `GRAPH-CHANGES <found\|none> :: symbols=<n> high=<n> medium=<n> low=<n> gen=<n>` | orc → writer | one line at review, the `trace` field of `orc graph changes --json`, verbatim | `_shared/phases/trace-verbs.md` |
| `GRAPH-COMPLEXITY <mini-ok\|recommend-orc> :: files=<n> callers=<n> caller_files=<n> maybe=<n> tests=<n> risk=<n> cochange=<n> gen=<n>` | orc → writer | one line per /orc-mini run, the `trace` field of the `--complexity` impact call, verbatim | `_shared/phases/trace-verbs.md` |
| `GRAPH-COCHANGE <found\|none> :: rows=<n> commits=<n>` | orc → writer | one line per planning batch, for the file that produced the widest answer | `_shared/phases/trace-verbs.md` |
| `GRAPH-HINT injected=<n> subagent_start=<n> read_notes=<n> updates=<n>` | orc → writer | ONE line per phase close, the graph hook's counters; omitted when the counter file does not exist | `_shared/phases/trace-verbs.md` |
| `GRAPH-GAIN paid=<n> low=<n> high=<n> calls=<n>` | orc → writer | ONE line per run at ship; `paid` is exact, `low`/`high` are an estimate never collapsed into one number | `_shared/phases/trace-verbs.md` |
| `GRAPH-NOTES <applied\|below-min\|none\|deferred\|off\|skipped> :: <detail>` | orc → writer | one notes batch; `applied` copies the noter's one-line return verbatim | `_shared/phases/trace-verbs.md` |
| `SPAWN <agent>` | hook | an agent dispatch was observed (skeleton) | `hooks/orc-trace.js` |
| `RETURN <agent> :: <desc> dur=<m>m<s>s [model=<id>]` | hook | a subagent finished (skeleton) — not an orchestrator obligation; the model check is VERIFY | `hooks/orc-trace.js` |
| `DISPATCH <agent> :: <task> expect=<model>/<effort>[ via=extra:<profile>]` | orc → writer | orchestrator dispatched a named agent (the claim) | `_shared/phases/trace-verbs.md` |
| `SCORE task=<id> score=<n> band=<range> model=<m> facets=<compact-vector>[ via=extra:<profile>] :: <reason>` | orc → writer | scoring decision (tunes the rubric); a fix cycle emits `task=fix-<n>` | `_shared/phases/scoring.md` |
| `VERIFY <task> actual=<model>/<effort> ✅ MATCH · VERIFY <task> actual=<model>/<effort> ⛔ DOWNGRADE expected=<m>/<e>` | orc → writer | claimed-vs-actual model check; surface a downgrade to the user, not just the trace | `_shared/return-validation.md` |
| `ASK <qid> :: offered=<o1\|o2\|…> rec=<o\|none> chose=<o\|other> by=<user\|ledger\|learned\|config\|default> [pre=<o>] [ctx=<k=v,…>]` | orc → writer | one answered decision point — what `orc habit` learns from; the free text of an `other` answer is never stored | `_shared/phases/trace-verbs.md` |
| `QUESTION count=<n> :: <topic>` | subagent→orc → writer | stopped to ask the user | `_shared/phases/trace-verbs.md` |
| `CONTEXT-GAP :: <what was already known>` | subagent→orc → writer | asked/re-derived something already in context | `_shared/phases/trace-verbs.md` |
| `REPLAN wave=<n> :: <reason>` | orc → writer | re-planned after a conflict/failure | `_shared/phases/trace-verbs.md` |
| `GATE <grounding\|coverage\|graph\|evidence\|derivation\|facet\|schema\|judgment\|wave-boundary\|budget\|stack-gate\|stack-certainty\|layer-green> pass\|bounce\|escalate :: <detail>` | orc → writer | exit-gate result; `escalate` is judgment-only; bounce detail lists the misses | `_shared/phases/trace-verbs.md` |
| `ADVISE :: brief=<path> questions=<n>` | orc → writer | ultra Phase U0 — advisor brief received, clarification round relayed | `orc/references/ultra-mode.md` |
| `JUDGE <analysis\|plan\|implementation> <verdict> round=<n> blocking=<n> advisory=<n> downgraded=<n>` | orc → writer | ultra judgment verdict | `orc/references/ultra-mode.md` |
| `OUTCOME task=<id> score=<n> band=<range> model=<m> retries=<n> requeues=<n> needs_context=<n> unmet=<n>` | orc → writer | task closed — links the scoring band to what it actually took | `_shared/phases/execution.md` |
| `FINDING p0=<n> p1=<n> p2=<n> p3=<n>[ pre=<n> suppressed=<n> folded=<n>]` | reviewer→orc → writer | review outcome (P0–P3 severity ladder); the tail counts the after-filter's buckets | `_shared/phases/review.md` |
| `FINDING-OUTCOME addressed=<n> disputed=<n> wontfix=<n> open=<n> pre=<n> suppressed=<n> :: <cat>:<addressed>/<total>,…` | orc → writer | ONE line at review close — what became of each finding; `orc gotcha quality` reads it | `_shared/phases/trace-verbs.md` |
| `VERDICT pass\|fail :: <detail>` | verifier→orc → writer | verification outcome | `_shared/phases/verify.md` |
| `DRIFT loop=<n> :: <user description, compressed>` | orc → writer | mock-example drift-recovery loop opened (hard cap 2 loops) | `_shared/drift-recovery.md` |
| `TDD-RED task=<id> iter=<n> :: <failing tests>` | executor→orc → writer | TDD repair-loop iteration — the plan's acceptance tests still red | `_shared/phases/trace-verbs.md` |
| `TDD-GREEN task=<id> iter=<n>` | executor→orc → writer | the task's TDD acceptance tests pass | `_shared/phases/trace-verbs.md` |
| `REPRO red\|green :: <cmd> exit=<n> · REPRO none :: <reason>` | executor→orc → writer | a DEFECT task's reproduction: RED before the fix, GREEN after | `_shared/return-validation.md` |
| `NOTE :: <decisions>` | writer | the packet's `decisions` field — the WHY layer; one line, only when non-empty | `agents/orc-trace-writer-haiku-4-5.md` |
| `STATS lane=<l> slug=<s> dispatches=<n> waves=<n> tasks=<n> bands=<h:n,m:n,l:n> downgrades=<n> duration_ms=<n>` | orc → writer | ONE summary line per run, in the FINISH packet, immediately BEFORE the FINISH line | `_shared/phases/trace-verbs.md` |
| `PACT <state> :: <ids> · PACT inject task=<id> :: <PACT-id> · PACT recheck pass\|fail :: <ids>` | orc → writer | invariant-ledger state at the Phase-1 probe, a promise injected into a task, the Phase-6 recheck | `orc-pact/references/gate.md` |
| `BOUNDARY <EXECUTE\|ESCALATE\|REFUSE\|unknown> task=<id> :: <area> · BOUNDARY lift task=<id> :: <area>` | orc → writer | per-task boundary verdict; an uncarded area is `unknown`, never REFUSE | `orc-boundary/references/gate.md` |
| `CHALLENGE iter=<n> findings=P0:<n>/P1:<n>/P2:<n> coverage=<n>% verdict=PASS\|FAIL · CHALLENGE accept\|rebut :: <id> · CHALLENGE regoal\|retemplate :: v<n>` | orc → writer | one line per completed /orc-challenge iteration — `orc challenge record`'s `trace_line`, verbatim | `orc-challenge/SKILL.md` |
| `EXTRA <profile>/<model> engine=<api\|claude-shim\|cli> task=<id> band=[lo,hi) tok=in/cw/cr/out outcome=<done\|partial\|failed\|fallback> dur=<m>m<s>s · EXTRA fallback task=<id> :: <reason> → <agent> · EXTRA substitution task=<id> :: requested=<m> reported=<m> · EXTRA reroute task=<id> :: <providers> · EXTRA resume task=<id> attempt=<n> :: from=<reason> attribution=<verdict> target=<extra:profile\|agent> files_preexisting=<n> · EXTRA orphan task=<id> :: attempt=<n> lease-expired files_changed=<n> state=<state> · EXTRA demote run=<slug> :: profile=<p> reason=<consecutive-stall\|stale-live-attempt\|manual> n=<k> → <ladder>` | orc → writer | one line per FOREIGN dispatch — `orc extra dispatch`'s `trace_line`, verbatim | `_shared/extra-dispatch.md` |
| `FINISH :: <detail>` | orc → writer | run ended — mandatory, even on an abort | `_shared/phases/trace.md` |

`SPAWN`/`RETURN`/`PHASE-EDGE` come from the hook automatically. Every other verb
reaches the file through a packet — you never append lines by hand.

## Verb detail

- **`PHASE-EDGE`.** ORC agent names encode their role, so when a SPAWN's role
  family differs from the previous SPAWN's, the hook segments the run itself.
  Families: `recon → recon` (v1.9.0 — /orc-quick's read-only half; a question
  answered for a person is not an analysis), `analyst|scout → analysis`,
  `planner → planning`, `executor → execution`, `reviewer → review`,
  `verifier → verify`, `test-author → testgen`, `advisor|judge → ultra-gate`
  (the trace writer never opens an edge). Zero model dependence: even a run
  where every writer dispatch was forgotten still reads planning → execution →
  review → verify, and `/orc-retro` computes NARRATION COVERAGE from edges with
  vs without a writer `SPAWN` between them.
- **`CONFIG`.** ALWAYS carries `opus5_only` — it selects the executor table AND
  every fixed role, so retro can segment outcomes by dispatch mode. Runtime
  proof that the run honored the config; `/orc-retro` audits it against behavior.
- **`ASK`.** One line per answered decision point. `qid` is a row of
  `orc habit points --json`; a qid the registry does not know is dropped and
  `orc habit doctor` counts it. `offered`, `rec`, `chose` and `pre` are option
  ids, never free text: an answer typed in words is `chose=other`, and the words
  are never stored. `by` says how the answer came: `user` typed it, `ledger` said
  it up front in the request, `learned` took what an accepted habit pre-selected,
  `config` or `default` answered without showing the question (not a choice, so
  not counted). `ctx` carries only what the lane knows (`branch`, `kind`, `size`,
  `risk`). `orc habit` reads these lines; it never applies a habit without a yes.
- **`WIKI-CONSULT`.** Full/mini at planning; fast at slice-build. `docs=` is the
  pages pulled/handed to the executor (comma list) or `none`. It records whether
  the run grounded in the wiki and whether it was stale (grounding + staleness
  for later audit).
- **`CROSSLINK`.** `cached` = peer cache present; `configured-no-cache` =
  crosslink configured but the cache is not built. It records whether peer
  contracts were injected this run. Full orc consumes only the pre-built
  crosslink cache — it never reads peer source live (mechanism in
  `wiki-consult.md`).
- **`GRAPH-CONSULT`.** Copied VERBATIM from the `trace` field of
  `orc graph status --heal --json --brief` (`code-graph.md` §4). `density=` is
  the named symbols per file, and `thin=1` means most files hold none, so most
  questions asked of the graph will not find one (v1.9.1). A `GATE` line that
  describes the graph in other words does not replace it. The `card` form is the
  `trace` of `orc graph ctx --json`, with `task=` added, when a slice receives
  cards.
- **`GRAPH-UPDATE`.** One graph update at a wave close, a green smoke gate, a
  code-writing `/orc-quick` request, or ship. The graph HOOK writes its own
  `GRAPH-UPDATE … :: by=hook …` lines directly; never copy one of those, it is
  already in the file.
- **`GRAPH-MAP`.** Also at a `/orc-quick` Q1 look that had no file to name.
  `files=` is how many the budget SHOWED over how many the repository has, so a
  short map can be told from a small repository. `focused` means `--focus`
  re-ranked the repository around what the request named. RANK is a hint about
  where to look first and the trace never says more than that.
- **`GRAPH-CHANGES`.** `high` counts symbols that are exported, have three or
  more callers and NO test reaching them.
- **`GRAPH-COMPLEXITY`.** The `trace` field of
  `orc graph impact … --complexity --json`. The CLI computes the verdict from the
  four thresholds in `bin/graph-signals.js`; `maybe` is reported and never trips
  one. Mini's own `GATE complexity :: <the line>` is separate: it records what
  the USER chose after the offer.
- **`GRAPH-COCHANGE`.** Not per file — the `trace` field of
  `orc graph cochange --json` for the file that produced the widest answer.
- **`GRAPH-HINT`.** Not one per hint — the counters `orc-graph-hook.js` keeps in
  `<log_dir>/<run>.graph-hook.json`. Omitted when the file does not exist (the
  hook is off, or it never had anything to say).
- **`GRAPH-GAIN`.** The `trace` field of `orc graph gain --run <trace name>
  --json`, verbatim. `paid` is exact (the tokens the graph put in); `low`/`high`
  are an ESTIMATE of the retrieval it kept out. Omitted when the ledger is empty
  or the graph is off.
- **`GRAPH-NOTES`.** The `trace` field of `orc graph notes pending --json` when
  it exited 3 or 5; `skipped` under the Opus-5-only mode.
- **`RETURN`.** The hook attributes the RETURN to the finishing agent from the
  SubagentStop payload (`~<agent>` = approximate FIFO match on older Claude Code
  that omits `agent_type`; `~agent :: unattributed` = ≥2 agents in flight, so it
  deliberately claimed NO pending record rather than starve the right one),
  echoes the SPAWN's desc + wall-clock duration, and appends `model=<id>` when
  the return's `actual_model` is visible in the last message. A duplicate stop
  for an agent whose record was already consumed is DROPPED, never written as a
  desc-less RETURN. Still hook-written skeleton — NOT an orchestrator
  obligation; the authoritative model check is the `VERIFY` line.
- **`DISPATCH`.** **A FOREIGN dispatch appends `via=extra:<profile>`** and its
  `expect=` names the profile's model rather than a Claude tier — additive, the
  way `/orc-doc`'s `sections=` was. A foreign worker is not a Claude subagent, so
  the hook emits NO `SPAWN` and NO `RETURN` for it (P7, the `/orc-quick`
  ad-hoc-recon precedent): this line and `EXTRA` are the whole record, which is
  why neither is optional. **The `/orc-doc` lane's tail NAMES ITS SECTIONS**
  (v0.49.2) — `doc write sections=03-scope,04-risks part=sections/03-scope.md`,
  `doc check sections=03-goals`, `doc digest source=<path>` — which is the only
  thing that makes `orc doc cost`'s per-section attribution honest rather than a
  guess. It is additive: the tail was already captured whole.
- **`SCORE`.** **A task the resolver sent foreign appends `via=extra:<profile>`**,
  and `model=` is the foreign model id — so `/orc-retro` can segment a band's
  outcomes by WHO ran it. `facets=` is the planner-emitted vector
  (breadth·novelty·logic·test·fan·unc·risk) the score was computed from —
  `/orc-retro` reads it to recalibrate the formula. Fix-cycle dispatches emit
  `SCORE task=fix-<n> …` the same way.
- **`VERIFY`.** The COMPARISON stays the orchestrator's obligation — surface a
  downgrade to the user, not just the trace.
- **`GATE`.** `facet` is the plan's facet-vocabulary check
  (`effort-and-mode.md`); `schema` is the plan-handoff schema check; `judgment`
  is ultra (`escalate` is judgment-only); `budget` is the Phase-1
  `run_budget_dispatches` forecast gate — `pass` or the `stop` that blocks
  wave 1, emitted only when the key is > 0; `stack-gate` is the Phase 8
  stacked-PR threshold + handoff; `stack-certainty` is a stacked-PR seam
  decision; `layer-green` is one layer's green-gate ladder. The shared-band
  SIBLING-CONSISTENCY determination is NOT a gate name — carry it in the
  packet's `decisions`, never as an invented verb. Bounce detail lists the
  misses (feeds `/orc-retro` gate-bounce rates).
- **`OUTCOME`.** Feeds `/orc-retro` calibration.
- **`FINDING-OUTCOME`.** At review close: `/orc` Phase 7, `/orc-mini` after the
  risk option, `/orc-quick` after the review offer. The counts are PROGRAMMATIC
  (`_shared/gotchas.md` §10): the flagged lines changed before ship = addressed;
  the user said "not a problem here" = disputed; declined with no reason = wontfix.
  `pre` and `suppressed` copy the after-filter's buckets; they never gate. The
  `FINDING` tail `pre= suppressed= folded=` is additive (the `sections=` precedent).
- **`DRIFT`.** `PHASE mock-example`; canonical `_shared/drift-recovery.md`.
- **`TDD-RED` / `TDD-GREEN`.** Cap `tdd_loop_max`; a paired TDD task's red proof
  also emits iter=0. `TDD-GREEN` is the non-exempt definition-of-done.
- **`REPRO`.** `_shared/return-validation.md` §5d. TWO lines per reproduced
  defect, in this order: the `before` run must be RED and the `after` run GREEN,
  or the return was malformed. `REPRO none :: <reason>` when no reproduction
  could be written — an honest answer, never a missing line. A reproduction is
  NOT a plan-time acceptance test, so it never reuses `TDD-RED`/`TDD-GREEN`:
  `/orc-retro` counts "we proved the bug first" apart from "we drove the plan's
  acceptance tests".
- **`NOTE`.** Scoring rationale, user answers verbatim, what was rejected. One
  line per packet, only when `decisions` is non-empty.
- **`PACT`.** At the Phase-1 probe (`pact_gate`); `inject` when a
  DRIFTED/BROKEN promise is appended to a task's `constraints[]`; `recheck` at
  Phase 6. Records whether last month's decisions constrained this month's plan.
- **`BOUNDARY`.** `lift` when `boundary_gate: block` removes ONE task from a
  wave (the wave still runs). `/orc-retro` reads these to answer the question
  the lane exists for: how much work did we stop attempting, and was that right.
- **`CHALLENGE`.** **Copy `orc challenge record`'s `trace_line` verbatim** — the
  CLI assembles it so the lane never composes a second wording for the same
  number. `accept`/`rebut` when an escape valve is used; `regoal|retemplate` on a
  re-freeze. `/orc-retro` reads the sequence to answer whether a cycle converged
  or stalled.
- **`EXTRA`.** A slice that executed on a non-Claude worker
  (`_shared/extra-dispatch.md`). **Copy `orc extra dispatch`'s `trace_line`
  verbatim** — the CLI assembles it, exactly as `orc challenge record` does, so
  the lane never composes a second wording for the same numbers. The sub-forms:
  `fallback` when a failed foreign dispatch re-dispatches to Claude (P6);
  `substitution` / `reroute` when the endpoint answered with a different model,
  or the same model served by a different company; `resume` (v0.54.0) when a
  dispatch CONTINUES a position an earlier attempt left on disk; `orphan` when
  preflight reports a dispatch that never reported back; `demote` (v1.0.0) when
  this run DROPS a foreign profile to the bottom of the ladder after two
  consecutive stalls, a stale live attempt, or `orc extra demote`.
  - **A demotion that leaves no line cannot be counted** either — copy
    `orc extra demotion`’s `trace_line` VERBATIM and emit it before the next
    dispatch, beside the mandatory announce line. A demotion is RUN state: it
    never writes the config and it is never promoted back on its own.
  - **A resume that leaves no line cannot be counted** — neither
    `orc extra stats` nor `/orc-retro` can then learn whether resuming works, or
    which providers ignore the resume preamble. `EXTRA resume` rides in the
    resumed dispatch's own `trace_extras[]`; `EXTRA orphan` is the LANE's to
    emit after it reports, the same ownership rule as `EXTRA fallback`.
  - **`tok=none` is a real value** and the ONLY correct one when the worker
    reported no counts (engine `cli` often does not): `tok=0/0/0/0` would tell
    `/orc-budget` the run was free, while a measured zero — engine `api`'s `cw`,
    always — is a different fact.
  - **On a lane with no score `band=` carries `slot:<slot>`** (v0.55.0 —
    `slot:doc-writer`, `slot:wiki-scanner-light`): the field NAME is unchanged,
    so this parser, the eight-field dedupe and the ` :: ` tolerance are
    untouched, and `orc extra stats` gives each POSITION its own row for free.
  - This is the verb `/orc-retro` reads to answer the only question that
    matters: is the cheap model actually cheaper once you count the repairs.

## `STATS` — what `orc stats` reads

`orc stats` reads the tail of each file and nothing more: one line per file,
never a parse of the whole trace. Omit a field you genuinely do not have (a lane
with no waves omits `waves=`); never guess one. Every trace-owning lane emits
it, not just `orc`.

- **A run with no `FINISH` is counted as unfinished, permanently.** That is
  correct behaviour and it is why `FINISH` is mandatory even on an abort.
- **A trace older than v0.42.0 has no `STATS` line.** `orc stats` falls back to
  counting `DISPATCH` lines — orchestrator-written and present in every lane
  (including `/orc-quick`, whose ad-hoc recon emits no `SPAWN`/`RETURN`). Old
  traces still count, with less detail. Never back-fill a `STATS` line into an
  old trace: the numbers would be invented, and the trace is append-only.

**Skeleton caveat (read every retro metric with it):** the hook only sees a NEW
dispatch. CONTINUING an already-running agent fires no PreToolUse/SubagentStop
pair, so a lane driven by continuing one agent produces fewer `SPAWN`/`RETURN`
lines than it did real work. The skeleton is a FLOOR on dispatch volume, never a
census — narration coverage computed from it reads low, not wrong.


## Protocol detail — the WHY behind `trace.md`

`trace.md` carries the rules a run applies at every phase close. This section
keeps the reasons and the per-lane detail behind them, for a reader who needs it.

Purpose: capture the flow of a run — phases, spawns, the model that actually
answered, scoring decisions, user questions, review/verify outcomes — so the
skills can be improved from real traces. This is NOT the decision log
(`run/…md`, agent knowledge, deleted on success). The trace is a separate,
**persistent** artifact and the two never mix.

There is no gate. Behavior-trace logging is PERMANENT — every run traces. The
`orc-trace.js` hook is the deterministic guarantee: on the first ORC-agent
dispatch it bootstraps `log_dir` + the run pointer itself, so a `.txt` is created
for every run even if the orchestrator never writes a rich marker. Only
`log_dir` (default `.claude/orc/logs`) is configurable.

### Narration

- **The pen (v2.0.0).** `orc trace write --packet -` reads the packet on stdin
  and writes the `.txt` lines AND the `.jsonl` rows from it, in the writer's
  formats — the two halves agree by construction. An unknown verb, a missing or
  "now" `ts`, or a parse error exits 2 and writes NOTHING; a missing `.current`
  on a later packet exits 3. Only on exit ≠ 0 does the lane dispatch
  `orc-trace-writer-haiku-4-5` with the SAME packet (the fallback).
- **Pairing rule (the anti-forget mechanism).** The write for phase N is issued
  **in the same tool block as phase N+1's first dispatch** — logging
  piggybacks on the very action the model reliably performs. A phase with no next
  dispatch (FINISH, an abort, a pure-question phase) writes SOLO, before
  printing that phase's user-facing output.
- **First write is solo** — before the planner/analyst goes out. It carries
  `run_meta` and performs the rename repair (below) while nothing else is in
  flight.
- **Last write (run end).** The FINISH packet (final report summary, ship
  state, verdict totals) is written BEFORE you delete `.current`.

A fallback writer's own `SPAWN`/`RETURN` are logged like any `orc*` agent.
`/orc-retro` audits narration coverage from the narrated (non-`hook`) lines
stamped inside each `PHASE-EDGE` interval, or a writer SPAWN there.

### Phase packet

- The packet is built from the phase's **actual working state as the phase
  closes** — never reconstructed later from memory.
- `ts` is each event's REAL time. The writer stamps nothing itself: the block is
  a faithful late append of events that happened seconds ago, not an end-of-run
  summary. Retro sorts by stamp, not by file order.
- Subagent-returned markers (`QUESTION`, `FINDING`, `VERDICT`, a return's
  `actual_model`) are folded into the NEXT packet, never written directly.
- `VERIFY` stays an orchestrator OBLIGATION — you compare claimed vs actual and
  surface any ⛔ DOWNGRADE to the user in chat; only the LINE travels by packet.
- The writer NEVER invents: an absent field is omitted, never guessed.

### Packet units per lane (full detail)

| Tier | Lanes | Packets |
|------|-------|---------|
| Build lanes | `orc` (incl. ultra), `orc-mini`, `orc-fast` | per phase — full orc ≈ 7–9 (ultra adds U0 + judge packets); orc-mini batches to 3 (intake+plan, execution, ship); orc-fast to 2 (preflight+dispatch, gate+ship) |
| Multi-dispatch | `orc-wiki`, `orc-pr-driver` (lane `prdriver`) | orc-wiki: one per scan-batch boundary (the points that already run the registration sync / offer the pause) + the end-of-run packet. orc-pr-driver: one per LAYER boundary (each layer's green gate closes) + the end-of-run packet |
| Composed | `orc-diy` | one packet per ENABLED phase group, **minimum 2** — the flow shape is user-composed, so the count is too (the compiled flow carries this block automatically) |
| Iterative | `orc-quick`, `orc-challenge` (lane `challenge`), `orc-doc` (lane `doc`), `orc-test` (lane `test`) | **one packet per completed numbered entry** + the end-of-run `FINISH` packet — the lane loops on user requests, so the count follows entries, not phases. For `orc-challenge` the unit is one completed ITERATION (C2→C8), and the packet goes out at the stop; on a PASS it is the `FINISH` packet. **Several trace files for one cycle is CORRECT** — several sessions ran, and `orc stats` counts several. For `orc-doc` the unit is one completed WAVE, and the packet is the LAST step of the stop sequence. For `orc-test` the unit is one completed CYCLE (T2→T9), and the packet goes out at the stop |
| Single-dispatch | `orc-claude`, `orc-plan`, `orc-analyze` + `orc-analyze-mini` (both lane token `analyze`), `orc-pattern`, `orc-verify`, `orc-learn`, `orc-poly`, `orc-pr-setup` (lane `prsetup`), `orc-grill`, `orc-route`, `orc-brainstorm` (lane `brainstorm`), `orc-pact` (lane `pact`), `orc-boundary` (lane `boundary`), `orc-handoff` (lane `handoff`), `orc-budget` (lane `budget`), `orc-aftermath` (lane `aftermath`), `orc-export` (lane `export`) | **exactly ONE mandatory end-of-run packet** |

**`context-combiner` is NOT a lane — it is a PHASE inside the analyze run.** It
has no slash command and no entry point of its own: `orc-analyze` Phase F
dispatches it while `.current` still points at that run's `run-analyze-…` file.
So it never writes a pointer, never touches a trace file, and never emits its own
`FINISH`; its `DISPATCH`/`RETURN`, its Phase D challenge verdicts and its
conservation-gate result all fold into **orc-analyze's** end-of-run packet. The
hook agrees — `context-combiner` maps to its own `PHASE-EDGE` role family
(`combine`), which segments the phase *within* that trace. Listing it as a lane
(as this table did before v0.42.0) declared a run nothing could ever open.

**The single-packet obligation is defined HERE, once** (every trace-owning lane
already loads this reference) — micro-lane spines keep only their existing trace
pointer. That packet is dispatched SOLO after the lane's main return validates
and BEFORE `.current` is deleted; it carries `run_meta` (so the rename repair
works there too) plus the lane's whole event list: intake decisions, the user's
answers, `DISPATCH`/`VERIFY`, gate/verdict lines, `FINISH`. One Haiku call per
run buys the WHY layer for every lane. Haiku cost is noise against any run's
executor spend.

`/orc-retro` is the ONE exception: it mines traces and writes none (its hard
rule 4). The hook enforces this — `orc-retro-*` dispatches never bootstrap a
trace and never emit `SPAWN`/`RETURN`.

### Files & lifecycle

- Folder: `log_dir` (default `.claude/orc/logs/`). Persistent — **never deleted**
  (deliberate opposite of the decision log). Top level holds the run `.txt` plus
  its sidecars (`.pending.json`, `.jsonl`); generated reports live in
  subfolders (`retro/`).
- One file per run: **`run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt`**, append-only.
  - `lane` — the trace-owning skill's short name: one value of the
    `run_meta.lane` enum in `trace.md`. That enum is the ONE list — the lane
    vocabulary `orc stats` and `/orc-retro` count against. Every value there is
    a lane some entry point actually opens — keep it that way. `ultra` = an
    /orc-ultra run, the ONLY lane the orc spine can emit besides `orc`. No other
    value is legal: a lane no entry point opens is a lane every counting tool
    reports as permanently zero.
  - `slug` — kebab-cased short user context from the intent (`[a-z0-9-]`, ≤32
    chars, filesystem-safe, no trailing hyphen) — same derivation as the
    run-folder slug.
  - `HHMMSS` — so two same-day runs never collide.
  - e.g. `run-orc-cas-multi-exchange-withdrawal-240726-002352.txt`.
  - The name is DATA: `/orc-retro` aggregates per lane straight from it, without
    parsing content.
- **Why the pointer and the file are made together.** A pointer naming a file
  that does not exist yet is indistinguishable from a dangling one by content
  alone. That used to split a run across two files (a generic bootstrap holding
  the hook skeleton + a rich file holding every narrated line, each looking
  correct alone). The `orc-trace.js` hook reads the pointer to know which file
  to append to, and since v0.34.2 it also honors a POINTER whose mtime is fresh
  even when the file is not there yet — the two fixes are independent on purpose.
- **Why a resumed lane re-writes the pointer.** Otherwise every line it writes
  after the return goes nowhere: the v0.34.2 split-run signature, reached by a
  different road. Two traces for a suspend is CORRECT — two lanes ran, and
  `orc stats` counts two.
- **The hook bootstrap.** When no usable pointer exists as the first ORC-agent
  dispatch fires, the hook creates the folder + a generic
  `run-<DDMMYY>-<HHMMSS>.txt` and points at it. The FIRST writer dispatch
  repairs that — a MOVE, decided against disk (the writer's contract). Non-ORC
  Tasks never trace — the hook only bootstraps for agent names starting with `orc`.

### Write cadence

The trace is a **running record**, not an end-of-run report. Each phase's packet
goes out AT that phase's close — coupled to the next phase's first dispatch:

| Moment | Packet carries |
|--------|----------------|
| a phase closes | that phase's events + the decisions behind them |
| dispatching an agent | the `DISPATCH` line (folded into the closing phase's packet) |
| a return validates | its `VERIFY` + any subagent-returned marker |
| a task closes | its `OUTCOME` |
| review/verify verdict | `FINDING` / `VERDICT` |
| run end | `FINISH` — dispatched SOLO and returned before `.current` is deleted |

About the self-check in `trace.md`:
The failure this prevents is a fully-executed run behind a one-line trace. If a
phase went by without its packet, write it NOW with the events' real
timestamps rather than skipping them — a late block with true stamps is a late
record; a block stamped "now" is a FALSE one. Batching everything at `FINISH` is
the classic failure: by then the run's context is compacted and the detail is gone.

### Model source of truth — the claimed-vs-actual check

A hook cannot read a subagent's model id (it lives only in the subagent's system
prompt). So each dispatched agent returns two fields (see each agent's return
contract):

- `actual_model` — **quoted verbatim** from the agent's injected system-prompt
  model-id line ("The exact model ID is …"). Never a guess; `unknown` if absent.
- `actual_effort` — the value of `$CLAUDE_EFFORT` (env var, read via Bash).

For each spawn the orchestrator:
1. Derives the **expected** `(model, effort)` from the dispatched agent NAME via
   the `config.md` score→model table / `MODEL-MAPPING.md`.
2. Compares against the returned `actual_*` and puts a `VERIFY` line in the next
   packet — `✅ MATCH` or `⛔ DOWNGRADE`. A downgrade (the harness capped a high
   pin to the main-session tier) is surfaced to the user, not just logged.

### Announce-on-spawn

When dispatching, announce the model to the user, derived from the agent NAME
(e.g. "Spawning orc-executor-opus-5-low → claude-opus-5-5 / low"). Derive it
from the name — do NOT pass the coarse `sonnet|opus|haiku` dispatch arg, which
cannot express 4-7 vs 4-8 and would override the frontmatter pin.

### Compaction safety

The checkpoint carries `logging_enabled` + `trace_path`. On resume, re-read them
and continue dispatching packets against the same file. The hook backbone keeps
emitting `SPAWN`/`RETURN`/`PHASE-EDGE` regardless of orchestrator memory, so a
compacted run is never blind — at worst it loses the WHY layer for one phase.
`/orc-ultra` is the `orc` skill with `ultra_mode: true`; its packets are just
orc's plus the U0/judge ones.

### Write discipline

- Append-only; one whole block per append (never edit prior lines).
- The trace records behavior faithfully — including the ugly bits (over-asking,
  downgrades, failed waves). That honesty is the whole value.

<!-- /orc:layer -->
