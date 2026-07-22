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

## Applies to EVERY ORC entry point (not just /orc)

EVERY skill that starts an ORC run owns this protocol
from its FIRST action: `orc`, `orc-mini`, `orc-fast`, `orc-wiki`, and the
standalone lanes
`/orc-analyze` (+ mini), `/orc-plan`, `/orc-pattern`, `/orc-verify`,
`/orc-claude`. Whichever skill is orchestrating the session writes the run
pointer at start, emits the markers for its own phase set, and closes the trace
at the end. A lane emits only the markers its
own shape produces — e.g. `/orc-claude` is a single-dispatch lane, so it emits
just `DISPATCH`/`VERIFY`/`FINISH` (+ the hook's `SPAWN`/`RETURN`), never
`PHASE`/`SCORE`/`FINDING`/`VERDICT`. Even a lane that skips this section still
produces a `.txt` — the hook bootstraps the pointer on the first dispatch, so
the SPAWN/RETURN skeleton is always captured (only the rich markers are lost).
`/orc-ultra` is the `orc` skill with
`ultra_mode: true` — the orc trace ownership covers it. Skills dispatched
INSIDE a run (executors, reviewer, analyst-as-subagent, codifier, combiner,
test-author, scouts, advisor, judge, the orc-claude writer) do not start
traces — they only return `actual_model`/`actual_effort` markers that the
orchestrating skill folds in.

## Files & lifecycle

- Folder: `log_dir` (default `.claude/orc/logs/`). Persistent — **never deleted**
  (deliberate opposite of the decision log).
- One file per run: `<run-slug>-<DDMMYY>.txt`, append-only, `.txt` only.
- Run pointer: at run start, write `log_dir/.current` containing just the trace
  filename. Delete it at run end (success or abort). The `orc-trace.js` hook
  reads this to know which file to append to; if it is missing when the first
  ORC-agent dispatch fires, the hook creates the folder + pointer itself (a
  generic `run-<DDMMYY-HHMMSS>.txt` slug). Non-ORC Tasks never trace — the hook
  only bootstraps for agent names starting with `orc`.

## Write cadence — append AS THE RUN GOES, never in one batch at the end

The trace is a **running record**, not an end-of-run report. Append each line
at the moment the event happens, BEFORE announcing that step to the user:

| Moment | Append before you… |
|--------|--------------------|
| entering a phase | announce the phase / ask its questions |
| dispatching an agent | show the dispatch line to the user |
| a return validates | act on the return |
| a task closes | move to the next task |
| review/verify verdict | relay the verdict |
| run end | print the final report |

**Inline-imperative rule:** every phase body in a lane spine carries its OWN
emit steps as WORK, not as a header decoration. The `· Trace:` annotation on a
phase heading is a summary of what that phase emits — the instruction is the
inline "emit `<VERB> …`" step inside the phase body. Follow the inline steps;
never treat the header list as the whole obligation.

**Self-check:** a phase that ends with
`zero new trace lines is a protocol violation`.
If you notice a phase went by unlogged, append the missing lines
NOW (with the events' real order) rather than skipping them; a trace with one
line and a fully-executed run behind it is the failure this cadence exists to
prevent. The most common cause is treating the trace as a summary to write at
`FINISH` — by then the run's context is compacted and the detail is gone.
Batched-at-the-end lines lose their timestamps' meaning too: the stamps are
the run's timeline, so a line written late is a false record, not a late one.

## Line format

`[DDMMYY HH:MM:SS.mmm] <actor>  <VERB> :: <free tail>`

Fixed columns → human-skimmable now, column-parseable by a future mining tool.
Actors: `orc` (orchestrator), `hook`, or a role/agent short name
(`analyst`, `planner`, `reviewer`, `verifier`, or `T<n>` for an executor task).

## Verb set (CLOSED — never invent new verbs)

| Verb | Emitted by | Meaning |
|------|-----------|---------|
| `PHASE <name> start\|end` | orc | phase transition |
| `CONFIG <key=value …>` | orc | Phase 1 — the resolved config values this run will consume (incl. `fable5_*` when enabled). Runtime proof that the run honored the config; `/orc-retro` audits it against behavior |
| `WIKI-CONSULT <tier> :: docs=<list>` | orc | project wiki consulted for grounding (full/mini at planning; fast at slice-build) — tier ∈ `fresh` \| `aging` \| `stale` \| `absent` \| `empty`; `docs=` the pages pulled/handed to the executor (comma list) or `none`. Records whether the run grounded in the wiki and whether it was stale (surfaces grounding + staleness for later audit) |
| `CROSSLINK <state> :: boundaries=<n> peers=<names>` | orc | cross-repo peer-knowledge state at the consult point — state ∈ `cached` (peer cache present) \| `configured-no-cache` (crosslink configured but the cache is not built) \| `none`. Per-task `CROSSLINK inject task=<id> :: <boundary>` when a slice receives a linked contract. Records whether peer contracts were injected this run (full orc consumes only the pre-built crosslink cache — it never reads peer source live; mechanism in `references/wiki-consult.md`) |
| `SPAWN <agent>` | hook | an agent dispatch was observed (skeleton) |
| `RETURN` | hook | a subagent finished (skeleton) |
| `DISPATCH <agent> :: <task> expect=<model>/<effort>` | orc | orchestrator dispatched a named agent (the claim) |
| `SCORE task=<id> score=<n> band=<range> model=<m> :: <reason>` | orc | scoring decision (tunes the rubric) |
| `VERIFY <task> actual=<model>/<effort> ✅ MATCH` / `⛔ DOWNGRADE expected=<m>/<e>` | orc | claimed-vs-actual model check |
| `QUESTION count=<n> :: <topic>` | subagent→orc | stopped to ask the user |
| `CONTEXT-GAP :: <what was already known>` | subagent→orc | asked/re-derived something already in context |
| `REPLAN wave=<n> :: <reason>` | orc | re-planned after a conflict/failure |
| `GATE <name> pass\|bounce\|escalate :: <detail>` | orc | exit-gate result — name ∈ grounding \| coverage \| graph \| evidence \| derivation \| judgment (ultra; `escalate` is judgment-only). Bounce detail lists the misses (feeds `/orc-retro` gate-bounce rates) |
| `ADVISE :: brief=<path> questions=<n>` | orc | ultra Phase U0 — advisor brief received, clarification round relayed |
| `JUDGE <gate> <verdict> round=<n> blocking=<n> advisory=<n> downgraded=<n>` | orc | ultra judgment verdict (gate ∈ analysis \| plan \| implementation) |
| `OUTCOME task=<id> score=<n> band=<range> model=<m> retries=<n> requeues=<n> needs_context=<n> unmet=<n>` | orc | task closed — links the scoring band to what it actually took (feeds `/orc-retro` calibration) |
| `FINDING p0=<n> p1=<n> p2=<n> p3=<n>` | reviewer→orc | review outcome (P0–P3 severity ladder) |
| `VERDICT pass\|fail :: <detail>` | verifier→orc | verification outcome |
| `FINISH :: <detail>` | orc | run ended |

`SPAWN`/`RETURN` come from the hook automatically. All other verbs are appended
by the orchestrator (its own, or folded in from a subagent's returned markers).

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
2. Compares against the returned `actual_*` and emits a `VERIFY` line —
   `✅ MATCH` or `⛔ DOWNGRADE`. A downgrade (the harness capped a high pin to the
   main-session tier) is surfaced to the user, not just logged.

## Announce-on-spawn

When dispatching, announce the model to the user, derived from the agent NAME
(e.g. "Spawning orc-executor-opus-4-7-high → claude-opus-4-7 / high"). Derive it
from the name — do NOT pass the coarse `sonnet|opus|haiku` dispatch arg, which
cannot express 4-7 vs 4-8 and would override the frontmatter pin.

## Compaction safety

The checkpoint carries `logging_enabled` + `trace_path`. On resume, re-read them
and continue appending to the same file. The hook backbone keeps emitting
`SPAWN`/`RETURN` regardless of orchestrator memory.

## Write discipline

- Append-only; one complete line per append (never edit prior lines).
- The trace records behavior faithfully — including the ugly bits (over-asking,
  downgrades, failed waves). That honesty is the whole value.
