---
name: orc-mini
description: >
  Lightweight ORC for fast implementation. Use for
  "use orc-mini to implement X" or "/orc-mini". Same
  intake → intent-spec → planning → dispatch → smoke-gate → ship spine as the full
  orchestrator, but SKIPS full code review, verification, and the summary phase.
  Dispatches ONE Sonnet 5 high-effort subagent for implementation, then runs a
  build+test smoke gate (blocks ship on red) and offers opt-in test authoring.
  Switchable to full flow mid-run. The orchestrator never implements — it spawns.
---

# ORC-MINI

A trimmed orchestrator for when you want speed over the full quality pipeline.
Everything in the main spine (`../orc/SKILL.md`) applies EXCEPT the
differences below. Load the main skill's references and schemas by path — this
mini skill does not duplicate them, but the HOT-PATH essentials (dispatch names,
return-contract fields, artifact path) are inlined here so nothing has to be
reconstructed from "full minus deltas."

Run as **Opus 4.8 high** (orchestrator — unchanged from full; do not downgrade
yourself). **You never implement — you spawn.** The one exception is the
**smoke gate** below: running the project's build+test is a read-only ship gate,
not implementation — you still never write code.

**Worked example** (orient only — never execute from it): `examples/mini-run-mock.md`.

## Differences from the full orchestrator

1. **Skip full Phase 5 (Review), Phase 6 (Verify), and Phase 7 (Summary).**
   Instead run the lightweight **smoke gate** (below) after execution, then the
   opt-in **test-authoring ask**, then ship.
2. **Implementation is ONE subagent, Sonnet 5, high effort.** Do not fan out into
   parallel waves. **No scoring table** — execution is fixed at Sonnet 5 high, so
   a score→model table would be computed-then-discarded. Replace it with a
   **one-line complexity read**: state in one line whether the task is
   mini-appropriate, or recommend switching to the full flow (see below). Log that
   one-line read; do not render the full scoring matrix.
3. **No dispatch-style and no batch-pause questions.** A single subagent with no
   waves makes both meaningless — never ask them, and never reason about wave caps
   or pauses in the mini lane.
4. **Lighter intake.** Ask only the intake **Always + medium tier** (Q1–Q4 in
   `../orc/references/intake.md`): what should exist, what's out of scope, how
   we'll know it's done, and constraints/patterns/libs/files-not-to-touch. **Skip
   the high tier (Q5 "what must not break", Q6 "what might change").** Run the
   Step 3.5 repo cross-check at the NAMES-ONLY depth (Glob/Grep-confirm the
   files/modules the draft names, tag the rest `UNVERIFIED`, resolve tags in
   the sign-off line; >3 tags → recommend the full flow or `orc-analyze`).
   Sign-off **defaults to SOFT** (proceed unless the user objects), not GATE.
5. **Still write tests** if the project has a test setup (the execution subagent
   creates/updates them as part of its task).
6. **Everything else is identical:** Phase 0 run folder + intent-spec, Phase 1
   planning, checkpoint/state-of-play in `run/{run-slug}/`, stop sequence, usage
   reminder, ship flow.

## Mini flow (the phase set)

```
Phase 0  intake (Q1–Q4, soft sign-off) + run folder + intent-spec
Phase 1  planning (dispatch orc-planner-mini; analyst first only on real docs)
         → one-line complexity read (mini-ok? or recommend switch-to-full)
Phase 3  dispatch ONE executor (orc-executor-sonnet-5-high) — slice carries the
         standing `house_rules` card (`../orc/references/house-rules.md`, card
         lines injected literally, same as full) — collect + validate return
Phase M  SMOKE GATE — run build+test → GREEN proceed · RED block ship + surface
Phase T  TEST-AUTHORING ASK (opt-in) — offer to write test cases (never run them)
Phase 8  ship (commit / push / PR)
```
(No Phase 2 scoring table, no dispatch-style/batch-pause asks, no full
review/verify/summary.)

## Phase M — Smoke gate (build + test; blocks ship on red)

After the executor returns and its contract validates (mini validates the same
evidence rules as full: `status=done` on a stack with a runnable build/test
REQUIRES `evidence` {command, exit_code, tail}; `done` with a non-empty
`unmet[]` is malformed — treat as partial), the orchestrator itself
runs the detected stack's **build and test** commands once, as a **read-only ship
gate** (this is the "never commit on a red build" rule made enforceable — nothing
else in the mini flow establishes build color). The executor's `evidence` is a
claim; YOUR smoke run is the independent check — if they disagree, say so.

- **GREEN** (build + tests pass) → proceed to the test-authoring ask, then ship.
- **RED** (build or tests fail) → **do NOT offer commit/ship.** Surface the
  failure output, then auto-fix ONCE: re-dispatch the executor with the failing
  output as `failure_reason`, re-run the smoke gate. Second red → STOP and surface
  (same cap as the full auto-fix rule). Never commit on red.
- This is a smoke gate, not full verification: no findings classification, no
  acceptance-criteria matrix. For that depth, switch to the full flow.
- If the stack exposes no runnable build/test (e.g. docs-only change), say so
  explicitly and treat the gate as N/A — never silently skip it.

## Phase T — Test-authoring ask (opt-in; writes tests, never runs them)

Same opt-in as the full orchestrator's Phase 6.5 — mini offers it too, but **only
asks** (it does not gate the ship). Default the offer from
`config.generate_tests`; the run confirms. At the end of a GREEN run, ask: *"Write
test cases for these changes? (I'll author them — automated files + TEST-PLAN.md +
a curl bundle for HTTP APIs — but never run them; you test manually.)"*

- **Yes** → dispatch `orc-test-author-opus-4-8-high` (subskill `../orc/subskills/orc-testgen/`)
  with a slice: the run's `actual_files`, the intent-spec's definition-of-done,
  the touched flows, constraints, and the detected stack (incl. whether it exposes
  an HTTP API). Validate the return; relay what was authored. Tier-OK: the mini
  orchestrator is Opus 4.8 high, so this Opus 4.8 high author does not exceed it.
- **No** → skip and continue to ship.
- Either way this NEVER runs tests and NEVER gates the ship.

## Behavior trace (logging — same rule as full; keep it running)

Mini does NOT drop the trace. When config `logging: true`, follow
`../orc/references/trace-protocol.md` exactly as the full orchestrator does, for
mini's phase set:
- **Run start:** create `log_dir`, write `.current`, store `logging_enabled` +
  `trace_path` in the checkpoint. Emit a `PHASE` line at each mini phase
  transition (intake → planning → execute → smoke → test-ask → ship).
- **Each dispatch:** announce the model derived from the agent NAME, emit
  `DISPATCH <agent> :: <task> expect=<model>/<effort>`. The `orc-trace.js` hook
  writes the `SPAWN`/`RETURN` skeleton independently.
- **Each return:** read `actual_model` + `actual_effort`, compare to expected,
  emit `VERIFY <task> actual=…/… ✅ MATCH` or `⛔ DOWNGRADE expected=…` and
  surface a downgrade to the user.
- **Task close:** emit `OUTCOME task=… score=n/a band=mini model=… retries=…
  requeues=… needs_context=… unmet=…` (mini has no score — band is `mini`; the
  counters still feed `/orc-retro`).
- **Smoke gate:** emit `VERDICT pass|fail` for the build+test result.
- **Run end (ship or abort):** emit `FINISH …` and delete `log_dir/.current`.

When `logging: false`, do NONE of this (the hook no-ops).

## Complexity read (replaces the scoring table)

Instead of scoring, make ONE judgment before dispatch: is this genuinely
mini-sized (single coherent area, low interdependency, low blast radius)? State it
in one line and log it. If it reads as complex/high-risk (many interdependencies,
core/shared surface, security-sensitive), **recommend switching to the full flow**
rather than pushing a fixed single-Sonnet build through it — let the user choose.

## Switching to full flow mid-run

If the user says "switch to full" (or the complexity read / a mid-run surprise
clearly needs review/verify), hand off to the full orchestrator: the run folder,
checkpoint, and intent-spec already live in the shared
`../orc/run/{run-slug}/` format, so the full flow resumes from the current
checkpoint and adds the review → verify → summary phases it skipped. Record the
switch in the decision log. State carries over cleanly — both skills share the
same schemas.

## Dispatch via named agents (canonical name-map — dispatch BY these names)

ORC-MINI dispatches these named agents (`.claude/agents/`, models pinned).
Note the naming rule: **agent = skill-name + model-effort suffix** (drop the
suffix to get the skill name). Look up here; never reconstruct a name.

| Role | Skill | Agent (dispatch this) | Model / effort |
|------|-------|-----------------------|----------------|
| mini analysis (docs only) | `orc-analyze-mini` | `orc-analyze-mini-sonnet-5-high` | claude-sonnet-5 / high |
| mini planning | `orc-planner-mini` | `orc-planner-mini-sonnet-5-high` | claude-sonnet-5 / high |
| mini execution | (reused) | `orc-executor-sonnet-5-high` | claude-sonnet-5 / high |
| test authoring (opt-in) | `orc-testgen` | `orc-test-author-opus-4-8-high` | claude-opus-4-8 / high |

Each agent is single-role and self-contained. Cost-tier rule still applies (main
session Opus 4.8 ≥ every dispatched agent, always true). See
`.claude/agents/MODEL-MAPPING.md`.

## Config

Resolve config at run start: `../orc/config.md` defaults merged with the user
override `.claude/orc.config.yaml` (written by the `orc config` CLI, survives
`orc update`) — read `generate_tests` (default OFF — the Phase T offer default),
`logging` (default OFF) + `log_dir`. (Mini is single-subagent with no waves, so
`max_wave_tasks` / `batch_pause_every` / the scoring presets do not apply — never
render or ask them.) Mini is always single-pass analysis, so `max_scouts` / deep
mode don't apply either.

## Analyst & planner (mini lane)

For requirement analysis and planning, orc-mini dispatches the FAST variants as
subagents (Sonnet 5 high): `orc-analyze-mini` and `orc-planner-mini` (subskill
`../orc/subskills/orc-planner-mini/`). Same artifacts and output contracts as the
full versions, trimmed depth. The mini analyst is **doc-optional**: on real doc
input it runs first (mode-detect + scope-bound + evidence-or-mark ground +
recommended-option challenges), then the mini planner; on a merely
ambiguous/underspecified request, prefer one inline clarifying question over a
cold analyst spawn. The mini analyst is always single-pass — **no deep mode, no
scouts**; it escalates to the full flow (`/orc-analyze` deep) on its concrete
thresholds and the user chooses. The orchestrator never analyzes or plans
itself — it dispatches.

**Mini-lane gates (yours, deterministic — same as the full lane; emit `GATE`
trace lines when logging).** On mini-analyst return: evidence spot-check (Glob
the spec's `files[]`; Grep-verify quotes on `status: exists|conflict`) +
derivation lint (report↔spec R# ids/statuses/anchors match); refuse
take-into-build on open `UNVERIFIED` or missing `scope_closed: true`; if the
spec's `git_head` ≠ current HEAD at plan time, re-run the evidence spot-check
first. On mini-planner return: Glob every `disposition: exists` path, recompute
`coverage` (orphan requirements), and run cycle + same-file collision checks.
Any miss → bounce back (one retry, then escalate). At dispatch, append the
task's `spec_invariants` to the slice's `constraints[]` verbatim.

## Wiki consult (if present)

Same rule as the full skill: if `wiki/` exists and has > 0 files, consult the
relevant overviews during planning/complexity-read for better core/isolated/risk
judgment; if empty or absent, ignore it. Mini never generates the wiki. After a
mini run that changed code, apply the same guarded stale-flag hook (flag only,
never auto-scan).

## Shared artifacts

Writes to the SAME location as the full skill:
`.claude/skills/orc/run/{run-slug}/` — so a switch needs no
migration. (Mini does not keep its own separate run/ tree.)

## What mini still enforces (from the main hard rules)

- Never implement yourself; always spawn (the smoke gate is a read-only build+test
  run, not implementation).
- All artifacts in the run subfolder; never project root.
- Validate the subagent return; malformed = failure.
- Usage: report dispatch log + remind the user to run `/usage`. Never invoke
  `/usage` programmatically.
- **Never offer commit on a red build** — enforced by the Phase M smoke gate.
