# Reference — Behavior-Trace Protocol

How ORC records its own behavior for later review. **Load only when
`logging: true`** (config key). When logging is off, do NONE of this.

Purpose: capture the flow of a run — phases, spawns, the model that actually
answered, scoring decisions, user questions, review/verify outcomes — so the
skills can be improved from real traces. This is NOT the decision log
(`run/…md`, agent knowledge, deleted on success). The trace is a separate,
**persistent** artifact and the two never mix.

## Gate

Everything here is conditional on `logging: true` (resolved defaults ←
`.claude/orc.config.yaml`). Default is `false` → the trace subsystem is inert.

## Applies to EVERY ORC entry point (not just /orc)

When `logging: true`, EVERY skill that starts an ORC run owns this protocol
from its FIRST action: `orc`, `orc-mini`, `orc-wiki`, and the standalone lanes
`/orc-analyze` (+ mini), `/orc-plan`, `/orc-pattern`, `/orc-verify`. Whichever
skill is orchestrating the session resolves `logging` at start; when true it
writes the run pointer, emits the markers for its own phase set, and closes the
trace at the end. Without the pointer the `orc-trace.js` hook writes NOTHING —
a lane that skips this section produces no `.txt` at all (this was the
orc-wiki bug fixed in v0.7.0). Skills dispatched INSIDE a run (executors,
reviewer, analyst-as-subagent, codifier, combiner, test-author, scouts) do not
start traces — they only return `actual_model`/`actual_effort` markers that the
orchestrating skill folds in.

## Files & lifecycle

- Folder: `log_dir` (default `.claude/orc/logs/`). Persistent — **never deleted**
  (deliberate opposite of the decision log).
- One file per run: `<run-slug>-<DDMMYY>.txt`, append-only, `.txt` only.
- Run pointer: at run start, write `log_dir/.current` containing just the trace
  filename. Delete it at run end (success or abort). The `orc-trace.js` hook
  reads this to know a run is active and which file to append to — without it,
  the hook no-ops, so non-ORC Tasks are never traced.

## Line format

`[DDMMYY HH:MM:SS.mmm] <actor>  <VERB> :: <free tail>`

Fixed columns → human-skimmable now, column-parseable by a future mining tool.
Actors: `orc` (orchestrator), `hook`, or a role/agent short name
(`analyst`, `planner`, `reviewer`, `verifier`, or `T<n>` for an executor task).

## Verb set (CLOSED — never invent new verbs)

| Verb | Emitted by | Meaning |
|------|-----------|---------|
| `PHASE <name> start\|end` | orc | phase transition |
| `SPAWN <agent>` | hook | an agent dispatch was observed (skeleton) |
| `RETURN` | hook | a subagent finished (skeleton) |
| `DISPATCH <agent> :: <task> expect=<model>/<effort>` | orc | orchestrator dispatched a named agent (the claim) |
| `SCORE task=<id> score=<n> band=<range> model=<m> :: <reason>` | orc | scoring decision (tunes the rubric) |
| `VERIFY <task> actual=<model>/<effort> ✅ MATCH` / `⛔ DOWNGRADE expected=<m>/<e>` | orc | claimed-vs-actual model check |
| `QUESTION count=<n> :: <topic>` | subagent→orc | stopped to ask the user |
| `CONTEXT-GAP :: <what was already known>` | subagent→orc | asked/re-derived something already in context |
| `REPLAN wave=<n> :: <reason>` | orc | re-planned after a conflict/failure |
| `GATE <name> pass\|bounce :: <detail>` | orc | deterministic exit-gate result — name ∈ grounding \| coverage \| graph \| evidence \| derivation. Bounce detail lists the misses (feeds `/orc-retro` gate-bounce rates) |
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
