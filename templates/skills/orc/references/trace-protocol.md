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
  lane: orc               # orc | ultra | mini | fast | wiki | analyze | plan |
                          # claude | poly | learn | verify | pattern
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
| Multi-dispatch | `orc-wiki` | one per scan-batch boundary (the points that already run the registration sync / offer the pause) + the end-of-run packet |
| Single-dispatch | `orc-claude`, `orc-plan`, `orc-analyze` (+ mini), `orc-pattern`, `orc-verify`, `orc-learn`, `orc-poly`, context-combiner | **exactly ONE mandatory end-of-run packet** |

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
    `wiki`, `analyze`, `plan`, `claude`, `poly`, `learn`, `verify`, `pattern`).
  - `slug` — kebab-cased short user context from the intent (`[a-z0-9-]`, ≤32
    chars, filesystem-safe, no trailing hyphen) — same derivation as the
    run-folder slug.
  - `HHMMSS` — so two same-day runs never collide.
  - e.g. `run-orc-cas-multi-exchange-withdrawal-240726-002352.txt`.
  - The name is DATA: `/orc-retro` aggregates per lane straight from it, without
    parsing content.
- Run pointer: at run start, write `log_dir/.current` containing just the trace
  filename. Delete it at run end (success or abort). The `orc-trace.js` hook
  reads this to know which file to append to.
- **Rename repair (deterministic-with-repair, not memory-only).** If the pointer
  is missing when the first ORC-agent dispatch fires, the hook creates the folder
  + a generic `run-<DDMMYY>-<HHMMSS>.txt` pointer itself — and the FIRST writer
  dispatch renames that file (plus its `.pending.json` / `.jsonl` siblings) to
  the rich name and rewrites `.current`. Non-ORC Tasks never trace — the hook
  only bootstraps for agent names starting with `orc`.

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
Actors: `writer` (the narration agent), `hook`, `orc` (legacy orchestrator-written
lines in pre-v0.32.0 traces), or a role/agent short name (`analyst`, `planner`,
`reviewer`, `verifier`, or `T<n>` for an executor task) inside a packet event.

## Verb set (CLOSED — never invent new verbs)

"Emitted by" now reads **orc → writer** for the narrated verbs: the orchestrator
supplies the fact in a packet, the writer writes the line. `SPAWN`, `RETURN` and
`PHASE-EDGE` stay hook-owned and need no cooperation at all.

| Verb | Emitted by | Meaning |
|------|-----------|---------|
| `PHASE <name> start\|end` | orc → writer | phase transition |
| `PHASE-EDGE <role-family> :: first=<agent>` | hook | **deterministic phase inference.** ORC agent names encode their role, so when a SPAWN's role family differs from the previous SPAWN's, the hook segments the run itself — families: `analyst\|scout → analysis`, `planner → planning`, `executor → execution`, `reviewer → review`, `verifier → verify`, `test-author → testgen`, `advisor\|judge → ultra-gate` (the trace writer never opens an edge). Zero model dependence: even a run where every writer dispatch was forgotten still reads planning → execution → review → verify, and `/orc-retro` computes NARRATION COVERAGE from edges with vs without a writer `SPAWN` between them |
| `CONFIG <key=value …>` | orc → writer | Phase 1 — the resolved config values this run will consume (incl. `fable5_*` when enabled). Runtime proof that the run honored the config; `/orc-retro` audits it against behavior |
| `WIKI-CONSULT <tier> :: docs=<list>` | orc → writer | project wiki consulted for grounding (full/mini at planning; fast at slice-build) — tier ∈ `fresh` \| `aging` \| `stale` \| `absent` \| `empty`; `docs=` the pages pulled/handed to the executor (comma list) or `none`. Records whether the run grounded in the wiki and whether it was stale (surfaces grounding + staleness for later audit) |
| `CROSSLINK <state> :: boundaries=<n> peers=<names>` | orc → writer | cross-repo peer-knowledge state at the consult point — state ∈ `cached` (peer cache present) \| `configured-no-cache` (crosslink configured but the cache is not built) \| `none`. Per-task `CROSSLINK inject task=<id> :: <boundary>` when a slice receives a linked contract. Records whether peer contracts were injected this run (full orc consumes only the pre-built crosslink cache — it never reads peer source live; mechanism in `references/wiki-consult.md`) |
| `SPAWN <agent>` | hook | an agent dispatch was observed (skeleton) |
| `RETURN <agent> :: <desc> dur=<m>m<s>s [model=<id>]` | hook | a subagent finished (skeleton). The hook attributes the RETURN to the finishing agent from the SubagentStop payload (`~<agent>` = approximate FIFO match on older Claude Code that omits `agent_type`; `~agent :: unattributed` = ≥2 agents in flight, so it deliberately claimed NO pending record rather than starve the right one), echoes the SPAWN's desc + wall-clock duration, and appends `model=<id>` when the return's `actual_model` is visible in the last message. A duplicate stop for an agent whose record was already consumed is DROPPED, never written as a desc-less RETURN. Still hook-written skeleton — NOT an orchestrator obligation; the authoritative model check is the `VERIFY` line |
| `DISPATCH <agent> :: <task> expect=<model>/<effort>` | orc → writer | orchestrator dispatched a named agent (the claim) |
| `SCORE task=<id> score=<n> band=<range> model=<m> facets=<compact-vector> :: <reason>` | orc → writer | scoring decision (tunes the rubric). `facets=` is the planner-emitted vector (breadth·novelty·logic·test·fan·unc·risk) the score was computed from — `/orc-retro` reads it to recalibrate the formula. Fix-cycle dispatches emit `SCORE task=fix-<n> …` the same way |
| `VERIFY <task> actual=<model>/<effort> ✅ MATCH` / `⛔ DOWNGRADE expected=<m>/<e>` | orc → writer | claimed-vs-actual model check (the COMPARISON stays the orchestrator's obligation — surface a downgrade to the user, not just the trace) |
| `QUESTION count=<n> :: <topic>` | subagent→orc → writer | stopped to ask the user |
| `CONTEXT-GAP :: <what was already known>` | subagent→orc → writer | asked/re-derived something already in context |
| `REPLAN wave=<n> :: <reason>` | orc → writer | re-planned after a conflict/failure |
| `GATE <name> pass\|bounce\|escalate :: <detail>` | orc → writer | exit-gate result — name ∈ grounding \| coverage \| graph \| evidence \| derivation \| judgment (ultra; `escalate` is judgment-only) \| wave-boundary. Bounce detail lists the misses (feeds `/orc-retro` gate-bounce rates) |
| `ADVISE :: brief=<path> questions=<n>` | orc → writer | ultra Phase U0 — advisor brief received, clarification round relayed |
| `JUDGE <gate> <verdict> round=<n> blocking=<n> advisory=<n> downgraded=<n>` | orc → writer | ultra judgment verdict (gate ∈ analysis \| plan \| implementation) |
| `OUTCOME task=<id> score=<n> band=<range> model=<m> retries=<n> requeues=<n> needs_context=<n> unmet=<n>` | orc → writer | task closed — links the scoring band to what it actually took (feeds `/orc-retro` calibration) |
| `FINDING p0=<n> p1=<n> p2=<n> p3=<n>` | reviewer→orc → writer | review outcome (P0–P3 severity ladder) |
| `VERDICT pass\|fail :: <detail>` | verifier→orc → writer | verification outcome |
| `NOTE :: <decisions>` | writer | the packet's `decisions` field — the WHY layer (scoring rationale, user answers verbatim, what was rejected). One line per packet, only when `decisions` is non-empty |
| `FINISH :: <detail>` | orc → writer | run ended |

`SPAWN`/`RETURN`/`PHASE-EDGE` come from the hook automatically. Every other verb
reaches the file through a packet — you never append lines by hand.

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
(e.g. "Spawning orc-executor-opus-4-7-high → claude-opus-4-7 / high"). Derive it
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
