# Phase — Behavior trace   (id: `trace`)

> **Library file.** `orc lane phases <lane> --json` → `trace_grammar` gives this lane's verbs. **A verb not in `trace_grammar` → read `trace-verbs.md`** (the CLOSED set, on demand). Never invent a verb.

<!-- orc:layer core -->

**Behavior-trace logging is PERMANENT (always on) — there is no config toggle.**
Every ORC run traces, to a **persistent** file that is NOT the decision log. The
`orc-trace.js` hook bootstraps `log_dir` + the run pointer on the first ORC-agent
dispatch and writes the `SPAWN`/`RETURN`/`PHASE-EDGE` skeleton itself. Only
`log_dir` (default `.claude/orc/logs`) is configurable.

## Narration is WRITTEN BY THE CLI, not remembered (v2.0.0 — the core rule)

> **Phase close = pipe the phase packet to `orc trace write --packet -`.**
> Exit ≠ 0 → dispatch `orc-trace-writer-haiku-4-5` with the SAME packet.

You supply the facts; the CLI holds the pen. You never append lines by hand.

- **Pairing rule.** The write for phase N goes **in the same tool block as
  phase N+1's first dispatch**. A phase with no next dispatch (FINISH, an
  abort, a pure-question phase) writes SOLO, before its user-facing output.
- **First write is solo** — before the planner/analyst goes out. It carries
  `run_meta`.
- **Last write (run end).** The FINISH packet is written BEFORE you delete
  `.current`. It carries ONE `STATS` line immediately BEFORE `FINISH`.

### Phase packet (the command's stdin — small, plain YAML or JSON)

```yaml
phase: execution wave 2
run_meta:                 # FIRST packet of the run ONLY; omit thereafter
  lane: orc               # orc | ultra | mini | fast | diy | wiki | analyze |
                          # plan | claude | poly | learn | verify | pattern |
                          # prsetup | prdriver | quick | grill | route |
                          # brainstorm | pact | boundary | handoff | budget |
                          # aftermath | export | challenge | doc | test
  slug: cas-multi-exchange-withdrawal
  trace_path: .claude/orc/logs/run-orc-cas-multi-exchange-withdrawal-240726-002352.txt
events:                   # each {ts, verb, tail}; verb = the WHOLE head (`GATE grounding pass`), tail = detail only
  - {ts: "240726 00:30:39.881", verb: "VERIFY T2", tail: "actual=claude-sonnet-4-6/high ✅ MATCH"}
decisions: >              # free text — the WHY layer
  User answered "no new deps" verbatim; rejected the adapter split.
```

- Build it from the phase's **actual working state as the phase closes**, never
  from memory later. `ts` is each event's REAL time. An absent field is omitted.
- Subagent-returned markers (`QUESTION`, `FINDING`, `VERDICT`, a return's
  `actual_model`) are folded into the NEXT packet, never written directly.

### How many packets per lane (three tiers — EVERY trace-owning lane narrates)

| Tier | Lanes | Packets |
|------|-------|---------|
| Build lanes | `orc` (incl. ultra), `orc-mini`, `orc-fast` | per phase — full orc ≈ 7–9 (ultra adds U0 + judge packets); orc-mini batches to 3, orc-fast to 2 |
| Multi-dispatch | `orc-wiki`, `orc-pr-driver` | one per scan-batch (wiki) or LAYER (pr-driver) boundary + the end-of-run packet |
| Composed | `orc-diy` | one per ENABLED phase group, **minimum 2** |
| Iterative | `orc-quick`, `orc-challenge`, `orc-doc`, `orc-test` | **one per completed unit** (entry · iteration · wave · cycle — each spine names its unit) + the end-of-run `FINISH` packet. Several trace files for one cycle is CORRECT |
| Single-dispatch | `orc-claude`, `orc-plan`, `orc-analyze`, `orc-analyze-mini`, `orc-pattern`, `orc-verify`, `orc-learn`, `orc-poly`, `orc-pr-setup`, `orc-grill`, `orc-route`, `orc-brainstorm`, `orc-pact`, `orc-boundary`, `orc-handoff`, `orc-budget`, `orc-aftermath`, `orc-export` | **exactly ONE mandatory end-of-run packet** |

**The single-packet obligation is defined HERE, once.** That packet goes out
SOLO after the main return validates and BEFORE `.current` is deleted, with
`run_meta` plus the whole event list (intake decisions, the user's answers,
`DISPATCH`/`VERIFY`, gate/verdict lines, `FINISH`). `context-combiner` is a
PHASE of the analyze run, not a lane. `/orc-retro` writes no trace.

## Files & lifecycle

- `log_dir` stays until `orc clear logs --apply` or the `log_retention_auto`
  sweep. One append-only file per run:
  **`run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt`** — `lane` from the enum above,
  `slug` `[a-z0-9-]`, ≤32 chars, no trailing hyphen.
- Run pointer: at run start, write `log_dir/.current` containing just the trace
  filename **and `touch the trace file` of that name in the SAME step**. Both, or
  neither — a pointer to a missing file reads as dangling and splits the run.
  A lane that writes code also runs `orc run snapshot --run <run-slug>` in that
  step (what `orc undo` goes back to). Delete the pointer at run end (success or abort).
- **A SUSPENDED lane re-writes its pointer on RESUME** (`_shared/lane-suspend.md`,
  `RETURN-TO`): the receiving lane deleted `.current`, so re-write it and
  `touch the trace file` it names, in the SAME step.

## Write cadence — append AS THE RUN GOES, never in one batch at the end

Each phase's packet goes out AT that phase's close, with that phase's events
and the decisions behind them.

**Self-check:** a phase that ends with
`zero new trace lines is a protocol violation`.
If a phase went by without its packet, write it NOW with the events'
real timestamps — a block stamped "now" is a FALSE record. Never batch
everything at `FINISH`. **A run with no `FINISH` counts as unfinished,
permanently** — `FINISH` is mandatory even on an abort.

## Model check, announce, compaction

- **Claimed vs actual.** Compare each return's `actual_model` / `actual_effort`
  with the pair the agent NAME implies; put a `VERIFY` line in the next packet
  and surface a ⛔ DOWNGRADE to the user in chat.
- **Announce-on-spawn** from the agent NAME ("Spawning orc-executor-opus-5-low →
  claude-opus-5-5 / low"); never pass the coarse `sonnet|opus|haiku` arg.
- **Compaction.** The checkpoint carries `logging_enabled` + `trace_path`; on
  resume, keep writing to the same file. `/orc-ultra` = `orc` + `ultra_mode: true`.
- Append-only, one whole block per append. Record the ugly bits too.

<!-- /orc:layer -->

<!-- orc:layer composed -->

## Behavior trace (PERMANENT — always on, no flow key)

Tracing is NOT composable: every ORC run traces, this one included. Follow
`.claude/skills/_shared/phases/trace.md` (load it at run start) — this
block is stitched into every compiled flow so a user-composed pipeline can never
be the one lane that runs blind.

**Run start:** create `log_dir`, write `log_dir/.current` =
`run-diy-<slug>-<DDMMYY>-<HHMMSS>.txt` AND `touch the trace file` of that name
in the SAME step (a pointer naming a file that does not exist reads as dangling —
the hook rotates away from it and the run splits across two files), then store
`trace_path` in the checkpoint and run `orc run snapshot --run <run-slug>`. The lane token is `diy`, whatever the flow is
named.

**Narration is written by the CLI, never remembered:** record each event with
its REAL timestamp into a phase packet (`PHASE`, `DISPATCH`/`VERIFY` per spawn —
`actual_model`/`actual_effort` vs expected, surface any ⛔ DOWNGRADE to the user
— `SCORE`, `OUTCOME`, `GATE`, `FINDING`/`VERDICT` for whichever gates this flow
enabled, `FINISH`, plus `decisions` = the WHY), then pipe it to
`orc trace write --packet -` (exit ≠ 0 → `orc-trace-writer-haiku-4-5`), PAIRED
with the next phase's first dispatch. **One packet per ENABLED phase group, minimum 2** — the flow shape is
composed, so the packet count is too; a phase this flow turned OFF owes nothing.
A phase ending with `zero new trace lines is a protocol violation`.

**Run end:** write the `FINISH` packet, then delete
`log_dir/.current`.

<!-- /orc:layer -->
