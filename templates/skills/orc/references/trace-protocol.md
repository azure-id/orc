# Reference — Behavior-Trace Protocol

How ORC records its own behavior for later review. **Behavior-trace logging is
PERMANENT (always on) — there is no config toggle.** Every ORC run traces.

Purpose: capture the flow of a run — phases, spawns, the model that actually
answered, scoring decisions, user questions, review/verify outcomes — so the
skills can be improved from real traces. This is NOT the decision log
(`run/…md`, agent knowledge, deleted on success). The trace is a separate,
**persistent** artifact and the two never mix.

## Always on

There is no gate. Behavior-trace logging is PERMANENT — every run traces. The
`orc-trace.js` hook is the deterministic guarantee: on the first ORC-agent
dispatch it bootstraps `log_dir` + the run pointer itself, so a `.txt` is created
for every run even if the orchestrator never writes a rich marker. Only
`log_dir` (default `.claude/orc/logs`) is configurable.

## Narration is DISPATCHED, not remembered (v0.32.0 — the core rule)

Two earlier fixes bet on the orchestrator remembering to append rich lines; both
failed under real load (long runs, compaction, parallel waves), leaving traces
with nothing but the hook's `SPAWN`/`RETURN` skeleton. The one behavior a run
performs reliably is **dispatching agents**. So narration moved onto it:

> **Phase close = build the phase packet + dispatch `orc-trace-writer-haiku-4-5`.**

The orchestrator supplies the facts; the pinned Haiku writer holds the pen and
appends the block. Three properties make this hold:

- **Pairing rule (the anti-forget mechanism).** The writer dispatch for phase N
  is issued **in the same tool block as phase N+1's first dispatch** — logging
  piggybacks on the very action the model reliably performs. A phase with no next
  dispatch (FINISH, an abort, a pure-question phase) dispatches the writer SOLO,
  before printing that phase's user-facing output.
- **First dispatch is solo and synchronous** — before the planner/analyst goes
  out. It carries `run_meta` and performs the rename repair (below) while nothing
  else is in flight.
- **Last dispatch (run end).** The FINISH packet (final report summary, ship
  state, verdict totals) goes out and RETURNS before you delete `.current`.

The writer's own `SPAWN`/`RETURN` are logged like any `orc*` agent — deliberately:
**a writer SPAWN per phase is the deterministic proof that narration happened**,
and that is exactly what `/orc-retro` audits (narration coverage).

### Phase packet (passed inline in the dispatch prompt — small, plain YAML)

```yaml
phase: execution wave 2
run_meta:                 # FIRST packet of the run ONLY; omit thereafter
  lane: orc               # orc | ultra | mini | fast | diy | wiki | analyze |
                          # plan | claude | poly | learn | verify | pattern |
                          # prsetup | prdriver | quick | grill | route |
                          # brainstorm | pact | boundary | handoff | budget |
                          # aftermath | export | challenge | doc
                          # (`ultra` = an /orc-ultra run; the ONLY lane the orc
                          #  spine can emit besides `orc`. No other value here
                          #  is legal — a lane no entry point opens is a lane
                          #  every counting tool reports as permanently zero.)
  slug: cas-multi-exchange-withdrawal
  trace_path: .claude/orc/logs/run-orc-cas-multi-exchange-withdrawal-240726-002352.txt
events:                   # each {ts, verb, tail}; verb from the CLOSED set below
  - {ts: "240726 00:28:16.220", verb: "DISPATCH orc-executor-sonnet-4-6-high",
     tail: "T2 pairs expect=claude-sonnet-4-6/high"}
  - {ts: "240726 00:30:39.881", verb: "VERIFY T2", tail: "actual=claude-sonnet-4-6/high ✅ MATCH"}
decisions: >              # free text — the WHY layer
  T2 kept at band [40,55) despite fan_out=3: the three consumers are
  generated. User answered "no new deps" verbatim; rejected the adapter split.
```

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

### How many packets per lane (three tiers — EVERY trace-owning lane narrates)

| Tier | Lanes | Packets |
|------|-------|---------|
| Build lanes | `orc` (incl. ultra), `orc-mini`, `orc-fast` | per phase — full orc ≈ 7–9 (ultra adds U0 + judge packets); orc-mini batches to 3 (intake+plan, execution, ship); orc-fast to 2 (preflight+dispatch, gate+ship) |
| Multi-dispatch | `orc-wiki`, `orc-pr-driver` (lane `prdriver`) | orc-wiki: one per scan-batch boundary (the points that already run the registration sync / offer the pause) + the end-of-run packet. orc-pr-driver: one per LAYER boundary (each layer's green gate closes) + the end-of-run packet |
| Composed | `orc-diy` | one packet per ENABLED phase group, **minimum 2** — the flow shape is user-composed, so the count is too (the compiled flow carries this block automatically) |
| Iterative | `orc-quick`, `orc-challenge` (lane `challenge`), `orc-doc` (lane `doc`) | **one packet per completed numbered entry** + the end-of-run `FINISH` packet — the lane loops on user requests, so the count follows entries, not phases. For `orc-challenge` the unit is one completed ITERATION (C2→C8), and the packet goes out at the stop; on a PASS it is the `FINISH` packet. **Several trace files for one cycle is CORRECT** — several sessions ran, and `orc stats` counts several. For `orc-doc` the unit is one completed WAVE, and the packet is the LAST step of the stop sequence |
| Single-dispatch | `orc-claude`, `orc-plan`, `orc-analyze` (+ mini), `orc-pattern`, `orc-verify`, `orc-learn`, `orc-poly`, `orc-pr-setup` (lane `prsetup`), `orc-grill`, `orc-route`, `orc-brainstorm` (lane `brainstorm`), `orc-pact` (lane `pact`), `orc-boundary` (lane `boundary`), `orc-handoff` (lane `handoff`), `orc-budget` (lane `budget`), `orc-aftermath` (lane `aftermath`), `orc-export` (lane `export`) | **exactly ONE mandatory end-of-run packet** |

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

## Files & lifecycle

- Folder: `log_dir` (default `.claude/orc/logs/`). Persistent — **never deleted**
  (deliberate opposite of the decision log). Top level holds the run `.txt` plus
  its sidecars (`.pending.json`, `.jsonl`); generated reports live in
  subfolders (`retro/`).
- One file per run: **`run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt`**, append-only.
  - `lane` — the trace-owning skill's short name (`orc`, `ultra`, `mini`, `fast`,
    `diy`, `wiki`, `analyze`, `plan`, `claude`, `poly`, `learn`, `verify`,
    `pattern`, `prsetup`, `prdriver`, `quick`, `grill`, `route`,
    `brainstorm`, `challenge`). Every value
    here is a lane some entry point actually opens — keep it that way: this
    list IS the lane vocabulary `orc stats` and `/orc-retro` count against.
  - `slug` — kebab-cased short user context from the intent (`[a-z0-9-]`, ≤32
    chars, filesystem-safe, no trailing hyphen) — same derivation as the
    run-folder slug.
  - `HHMMSS` — so two same-day runs never collide.
  - e.g. `run-orc-cas-multi-exchange-withdrawal-240726-002352.txt`.
  - The name is DATA: `/orc-retro` aggregates per lane straight from it, without
    parsing content.
- Run pointer: at run start, write `log_dir/.current` containing just the trace
  filename **and `touch the trace file` of that name in the SAME step**. Both, or
  neither — a pointer naming a file that does not exist yet is indistinguishable
  from a dangling one by content alone, and that is what used to split a run
  across two files (a generic bootstrap holding the hook skeleton + a rich file
  holding every narrated line, each looking correct alone). Delete the pointer at
  run end (success or abort). The `orc-trace.js` hook reads it to know which file
  to append to, and since v0.34.2 it also honors a POINTER whose mtime is fresh
  even when the file is not there yet — the two fixes are independent on purpose.
- **A SUSPENDED lane re-writes its pointer on RESUME.** When a lane hands control
  to another lane and expects it back (`_shared/lane-suspend.md`, `RETURN-TO`),
  the receiving lane DELETES `.current` at its own `FINISH`. So on return the
  suspending lane re-writes `.current` and must `touch the trace file` it names,
  in the SAME step — both, or neither. Otherwise every line it writes after the
  return goes nowhere: the v0.34.2 split-run signature, reached by a different
  road. Two traces for a suspend is CORRECT — two lanes ran, and `orc stats`
  counts two.
- **Rename repair (deterministic-with-repair, not memory-only).** When no usable
  pointer exists as the first ORC-agent dispatch fires, the hook creates the
  folder + a generic `run-<DDMMYY>-<HHMMSS>.txt` and points at it. The FIRST
  writer dispatch repairs that. **The trigger is a DISK COMPARISON, not a
  remembered state:** repair when `.current` on disk DISAGREES with the packet's
  `run_meta.trace_path` — a rich packet name beside a generic pointer IS the
  clobber signature, every time — regardless of whether the pointer was ever
  missing. (Stated the old way — "if the pointer is missing" — writers correctly
  declined to repair, because that is not the state the hook actually leaves.)
  The repair is a **MOVE** of the `.txt` plus its `.pending.json` / `.jsonl`
  siblings, then a rewrite of `.current` — never a fresh create beside the
  bootstrap file, which splits the run's evidence in two. Non-ORC Tasks never
  trace — the hook only bootstraps for agent names starting with `orc`.

## Structured companion (`<trace>.jsonl`)

The `.txt` stays the canonical, human-skimmable trace. The writer ALSO appends
each packet event as one JSON line to `<trace>.jsonl`:
`{ts, actor, phase, verb, tail, …verb-specific fields}`. `/orc-retro` mines the
`.jsonl` when present — `SCORE`/`OUTCOME`/`VERIFY` aggregation becomes robust
without regex over free tail text — and falls back to `.txt` parsing for older
traces. Hook lines stay `.txt`-only; the two are read together.

## Write cadence — append AS THE RUN GOES, never in one batch at the end

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

**Self-check:** a phase that ends with
`zero new trace lines is a protocol violation`.
The failure this prevents is a fully-executed run behind a one-line trace. If a
phase went by without its packet, dispatch the writer NOW with the events' real
timestamps rather than skipping them — a late block with true stamps is a late
record; a block stamped "now" is a FALSE one. Batching everything at `FINISH` is
the classic failure: by then the run's context is compacted and the detail is gone.

## Line format

`[DDMMYY HH:MM:SS.mmm] <actor>  <VERB> :: <free tail>`

Fixed columns → human-skimmable now, column-parseable by a future mining tool.
Actors: `hook`, `orc` (the default for a packet event with no actor), a role/agent
short name (`analyst`, `planner`, `reviewer`, `verifier`, `T<n>` for an executor
task), or `writer` — which means the narration agent speaking for ITSELF (its
`NOTE` line), never a blanket stamp on events it was handed. **The actor is
per-EVENT.** The writer copies `events[].actor` into both the `.txt` column and
the `.jsonl` `actor` field, so the pair can never disagree about the same event
(they did, and retro reads the `.jsonl` first).

## Verb set (CLOSED — never invent new verbs)

"Emitted by" now reads **orc → writer** for the narrated verbs: the orchestrator
supplies the fact in a packet, the writer writes the line. `SPAWN`, `RETURN` and
`PHASE-EDGE` stay hook-owned and need no cooperation at all.

| Verb | Emitted by | Meaning |
|------|-----------|---------|
| `PHASE <name> start\|end` | orc → writer | phase transition |
| `PHASE-EDGE <role-family> :: first=<agent>` | hook | **deterministic phase inference.** ORC agent names encode their role, so when a SPAWN's role family differs from the previous SPAWN's, the hook segments the run itself — families: `analyst\|scout → analysis`, `planner → planning`, `executor → execution`, `reviewer → review`, `verifier → verify`, `test-author → testgen`, `advisor\|judge → ultra-gate` (the trace writer never opens an edge). Zero model dependence: even a run where every writer dispatch was forgotten still reads planning → execution → review → verify, and `/orc-retro` computes NARRATION COVERAGE from edges with vs without a writer `SPAWN` between them |
| `CONFIG <key=value …>` | orc → writer | Phase 1 — the resolved config values this run will consume (ALWAYS `opus5_only` — it selects the executor table AND every fixed role, so retro can segment outcomes by dispatch mode). Runtime proof that the run honored the config; `/orc-retro` audits it against behavior |
| `WIKI-CONSULT <tier> :: docs=<list>` | orc → writer | project wiki consulted for grounding (full/mini at planning; fast at slice-build) — tier ∈ `fresh` \| `aging` \| `stale` \| `absent` \| `empty`; `docs=` the pages pulled/handed to the executor (comma list) or `none`. Records whether the run grounded in the wiki and whether it was stale (surfaces grounding + staleness for later audit) |
| `CROSSLINK <state> :: boundaries=<n> peers=<names>` | orc → writer | cross-repo peer-knowledge state at the consult point — state ∈ `cached` (peer cache present) \| `configured-no-cache` (crosslink configured but the cache is not built) \| `none`. Per-task `CROSSLINK inject task=<id> :: <boundary>` when a slice receives a linked contract. Records whether peer contracts were injected this run (full orc consumes only the pre-built crosslink cache — it never reads peer source live; mechanism in `references/wiki-consult.md`) |
| `SPAWN <agent>` | hook | an agent dispatch was observed (skeleton) |
| `RETURN <agent> :: <desc> dur=<m>m<s>s [model=<id>]` | hook | a subagent finished (skeleton). The hook attributes the RETURN to the finishing agent from the SubagentStop payload (`~<agent>` = approximate FIFO match on older Claude Code that omits `agent_type`; `~agent :: unattributed` = ≥2 agents in flight, so it deliberately claimed NO pending record rather than starve the right one), echoes the SPAWN's desc + wall-clock duration, and appends `model=<id>` when the return's `actual_model` is visible in the last message. A duplicate stop for an agent whose record was already consumed is DROPPED, never written as a desc-less RETURN. Still hook-written skeleton — NOT an orchestrator obligation; the authoritative model check is the `VERIFY` line |
| `DISPATCH <agent> :: <task> expect=<model>/<effort>` | orc → writer | orchestrator dispatched a named agent (the claim). **A FOREIGN dispatch appends `via=extra:<profile>`** and its `expect=` names the profile's model rather than a Claude tier — additive, the way `/orc-doc`'s `sections=` was. A foreign worker is not a Claude subagent, so the hook emits NO `SPAWN` and NO `RETURN` for it (P7, the `/orc-quick` ad-hoc-recon precedent): this line and `EXTRA` are the whole record, which is why neither is optional. **The `/orc-doc` lane's tail NAMES ITS SECTIONS** (v0.49.2) — `doc write sections=03-scope,04-risks part=sections/03-scope.md`, `doc check sections=03-goals`, `doc digest source=<path>` — which is the only thing that makes `orc doc cost`'s per-section attribution honest rather than a guess. It is additive: the tail was already captured whole |
| `SCORE task=<id> score=<n> band=<range> model=<m> facets=<compact-vector> :: <reason>` | orc → writer | scoring decision (tunes the rubric). **A task the resolver sent foreign appends `via=extra:<profile>`**, and `model=` is the foreign model id — so `/orc-retro` can segment a band's outcomes by WHO ran it. `facets=` is the planner-emitted vector (breadth·novelty·logic·test·fan·unc·risk) the score was computed from — `/orc-retro` reads it to recalibrate the formula. Fix-cycle dispatches emit `SCORE task=fix-<n> …` the same way |
| `VERIFY <task> actual=<model>/<effort> ✅ MATCH` / `⛔ DOWNGRADE expected=<m>/<e>` | orc → writer | claimed-vs-actual model check (the COMPARISON stays the orchestrator's obligation — surface a downgrade to the user, not just the trace) |
| `QUESTION count=<n> :: <topic>` | subagent→orc → writer | stopped to ask the user |
| `CONTEXT-GAP :: <what was already known>` | subagent→orc → writer | asked/re-derived something already in context |
| `REPLAN wave=<n> :: <reason>` | orc → writer | re-planned after a conflict/failure |
| `GATE <name> pass\|bounce\|escalate :: <detail>` | orc → writer | exit-gate result — name ∈ grounding \| coverage \| graph \| evidence \| derivation \| facet (the plan's facet-vocabulary check, `effort-and-mode.md`) \| schema (the plan-handoff schema check) \| judgment (ultra; `escalate` is judgment-only) \| wave-boundary \| budget (the Phase-1 `run_budget_dispatches` forecast gate — `pass` or the `stop` that blocks wave 1; emitted only when the key is > 0) \| stack-gate (Phase 8 stacked-PR threshold + handoff) \| stack-certainty (a stacked-PR seam decision) \| layer-green (one layer's green-gate ladder). The shared-band SIBLING-CONSISTENCY determination is NOT a gate name — carry it in the packet's `decisions`, never as an invented verb. Bounce detail lists the misses (feeds `/orc-retro` gate-bounce rates) |
| `ADVISE :: brief=<path> questions=<n>` | orc → writer | ultra Phase U0 — advisor brief received, clarification round relayed |
| `JUDGE <gate> <verdict> round=<n> blocking=<n> advisory=<n> downgraded=<n>` | orc → writer | ultra judgment verdict (gate ∈ analysis \| plan \| implementation) |
| `OUTCOME task=<id> score=<n> band=<range> model=<m> retries=<n> requeues=<n> needs_context=<n> unmet=<n>` | orc → writer | task closed — links the scoring band to what it actually took (feeds `/orc-retro` calibration) |
| `FINDING p0=<n> p1=<n> p2=<n> p3=<n>` | reviewer→orc → writer | review outcome (P0–P3 severity ladder) |
| `VERDICT pass\|fail :: <detail>` | verifier→orc → writer | verification outcome |
| `DRIFT loop=<n> :: <user description, compressed>` | orc → writer | mock-example drift-recovery loop opened (`PHASE mock-example`; canonical `_shared/drift-recovery.md`; hard cap 2 loops) |
| `TDD-RED task=<id> iter=<n> :: <failing tests>` | executor→orc → writer | TDD repair-loop iteration — the plan's acceptance tests still red (cap `tdd_loop_max`; a paired TDD task's red proof also emits iter=0) |
| `TDD-GREEN task=<id> iter=<n>` | executor→orc → writer | the task's TDD acceptance tests pass (the non-exempt definition-of-done) |
| `NOTE :: <decisions>` | writer | the packet's `decisions` field — the WHY layer (scoring rationale, user answers verbatim, what was rejected). One line per packet, only when `decisions` is non-empty |
| `STATS lane=<l> slug=<s> dispatches=<n> waves=<n> tasks=<n> bands=<h:n,m:n,l:n> downgrades=<n> duration_ms=<n>` | orc → writer | ONE deterministic summary line per run, in the `FINISH` packet, immediately BEFORE the `FINISH` line. This is what `orc stats` reads — one line per file, never a parse of the whole trace. Omit a field you genuinely do not have (a lane with no waves omits `waves=`); never guess one. Every trace-owning lane emits it, not just `orc` |
| `PACT <state> :: <ids>` | orc → writer | invariant-ledger state at the Phase-1 probe (`pact_gate`), and `PACT inject task=<id> :: <PACT-id>` when a DRIFTED/BROKEN promise is appended to a task's `constraints[]`. `PACT recheck pass\|fail :: <ids>` at Phase 6. Records whether last month's decisions constrained this month's plan |
| `BOUNDARY <verdict> task=<id> :: <area>` | orc → writer | per-task boundary verdict (verdict ∈ `EXECUTE` \| `ESCALATE` \| `REFUSE` \| `unknown` — an uncarded area is UNKNOWN, never REFUSE), plus `BOUNDARY lift task=<id> :: <area>` when `boundary_gate: block` removes ONE task from a wave (the wave still runs). `/orc-retro` reads these to answer the question the lane exists for: how much work did we stop attempting, and was that right |
| `CHALLENGE iter=<n> findings=P0:<n>/P1:<n>/P2:<n> coverage=<n>% verdict=PASS\|FAIL` | orc → writer | one line per completed `/orc-challenge` iteration boundary. **Copy `orc challenge record`'s `trace_line` verbatim** — the CLI assembles it so the lane never composes a second wording for the same number. Plus `CHALLENGE accept :: <id>` and `CHALLENGE rebut :: <id>` when an escape valve is used, and `CHALLENGE regoal\|retemplate :: v<n>` on a re-freeze. `/orc-retro` reads the sequence to answer whether a cycle converged or stalled |
| `EXTRA <profile>/<model> engine=<api\|claude-shim\|cli> task=<id> band=[lo,hi) tok=in/cw/cr/out outcome=<done\|partial\|failed\|fallback> dur=<m>m<s>s` | orc → writer | one line per FOREIGN dispatch — a slice that executed on a non-Claude worker (`_shared/extra-dispatch.md`). **Copy `orc extra dispatch`'s `trace_line` verbatim** — the CLI assembles it, exactly as `orc challenge record` does, so the lane never composes a second wording for the same numbers. Plus `EXTRA fallback task=<id> :: <reason> → <agent>` when a failed foreign dispatch re-dispatches to Claude (P6), `EXTRA substitution task=<id> :: requested=<m> reported=<m>` / `EXTRA reroute task=<id> :: <providers>` when the endpoint answered with a different model, or the same model served by a different company, and — v0.54.0 — `EXTRA resume task=<id> attempt=<n> :: from=<reason> attribution=<verdict> target=<extra:profile\|agent> files_preexisting=<n>` when a dispatch CONTINUES a position an earlier attempt left on disk, plus `EXTRA orphan task=<id> :: attempt=<n> lease-expired files_changed=<n> state=<state>` when preflight reports a dispatch that never reported back. **A resume that leaves no line cannot be counted** — neither `orc extra stats` nor `/orc-retro` can then learn whether resuming works, or which providers ignore the resume preamble. `EXTRA resume` rides in the resumed dispatch's own `trace_extras[]`; `EXTRA orphan` is the LANE's to emit after it reports, the same ownership rule as `EXTRA fallback`. **`tok=none` is a real value** and the ONLY correct one when the worker reported no counts (engine `cli` often does not): `tok=0/0/0/0` would tell `/orc-budget` the run was free, while a measured zero — engine `api`'s `cw`, always — is a different fact. **On a lane with no score `band=` carries `slot:<slot>`** (v0.55.0 — `slot:doc-writer`, `slot:wiki-scanner-light`): the field NAME is unchanged, so this parser, the eight-field dedupe and the ` :: ` tolerance are untouched, and `orc extra stats` gives each POSITION its own row for free. This is the verb `/orc-retro` reads to answer the only question that matters: is the cheap model actually cheaper once you count the repairs |
| `FINISH :: <detail>` | orc → writer | run ended |

`SPAWN`/`RETURN`/`PHASE-EDGE` come from the hook automatically. Every other verb
reaches the file through a packet — you never append lines by hand.

### Why `STATS` exists as its own line (v0.42.0)

`orc stats` counts usage from these files. Lane and date are free — they are in
the filename, which is already DATA. Everything else would cost a full parse of
a 20-minute trace, per run, forever. One deterministic line at a step that
already exists makes the depth free instead: `orc stats` reads the tail of each
file and nothing more.

Two consequences to keep true, because a counting tool built on a drifting log
produces confident WRONG numbers, which is worse than no numbers:

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

## Model source of truth — the claimed-vs-actual check

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

## Announce-on-spawn

When dispatching, announce the model to the user, derived from the agent NAME
(e.g. "Spawning orc-executor-opus-5-low → claude-opus-5 / low"). Derive it
from the name — do NOT pass the coarse `sonnet|opus|haiku` dispatch arg, which
cannot express 4-7 vs 4-8 and would override the frontmatter pin.

## Compaction safety

The checkpoint carries `logging_enabled` + `trace_path`. On resume, re-read them
and continue dispatching packets against the same file. The hook backbone keeps
emitting `SPAWN`/`RETURN`/`PHASE-EDGE` regardless of orchestrator memory, so a
compacted run is never blind — at worst it loses the WHY layer for one phase.
`/orc-ultra` is the `orc` skill with `ultra_mode: true`; its packets are just
orc's plus the U0/judge ones.

## Write discipline

- Append-only; one whole block per append (never edit prior lines).
- The trace records behavior faithfully — including the ugly bits (over-asking,
  downgrades, failed waves). That honesty is the whole value.
