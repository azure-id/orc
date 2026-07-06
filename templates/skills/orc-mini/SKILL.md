---
name: orc-mini
description: >
  Lightweight ORC for fast implementation. Use for
  "use orc-mini to implement X" or "/orc-mini". Same
  intake → intent-spec → planning → scoring → dispatch → ship spine as the full
  orchestrator, but SKIPS code review, verification, and the summary phase.
  Dispatches ONE Sonnet 5 high-effort subagent for implementation (still writes
  tests if the project has them). Switchable to full flow mid-run. The
  orchestrator never implements — it always spawns.
---

# ORC-MINI

A trimmed orchestrator for when you want speed over the full quality pipeline.
Everything in the main spine (`../orc/SKILL.md`) applies EXCEPT the
differences below. Load the main skill's references and schemas by path — this
mini skill does not duplicate them.

Run as Opus 4.8 high (orchestrator). **You never implement — you spawn.**

## Differences from the full orchestrator

1. **Skip Phase 5 (Review), Phase 6 (Verify), and Phase 7 (Summary).** Go
   straight from execution to Phase 8 (Ship).
2. **Implementation is ONE subagent, Sonnet 5, high effort.** Do not fan out
   into parallel waves for implementation. Scoring still runs and is SHOWN
   (informational + audit), but the dispatched model for the implementation
   agent is fixed at Sonnet 5 high regardless of score.
3. **Still write tests** if the project has a test setup (the execution
   subagent creates/updates them as part of its task) — you just don't run the
   separate review/verify passes on them.
4. **Everything else is identical:** Phase 0 intake + intent-spec + run folder,
   Phase 1 planning, Phase 2 scoring table shown, checkpoint/state-of-play in
   `run/{run-slug}/`, stop sequence, usage reminder, ship flow.

## Switching to full flow mid-run

If the user says "switch to full" (or you hit something that clearly needs
review/verify), hand off to the full orchestrator: the run folder, checkpoint,
and intent-spec are already in the shared `../orc/run/{run-slug}/`
format, so the full flow resumes from the current checkpoint and adds the
review → verify → summary phases it skipped. Record the switch in the decision
log. State carries over cleanly because both skills share the same schemas.

## Dispatch via tier agent

ORC-MINI dispatches these named agents (`.claude/agents/`, models pinned):
- mini analysis → orc-mini-analyst-sonnet-5-high
- mini planning → orc-mini-planner-sonnet-5-high
- mini execution → orc-executor-sonnet-5-high
Each is single-role and self-contained. Cost-tier rule still applies (main
session ≥ Sonnet, always true). See `.claude/agents/MODEL-MAPPING.md`.

## Config

Resolve config at run start: `../orc/config.md` defaults merged with the user
override `.claude/orc.config.yaml` (written by `/orc-config`, survives
`orc update`) — for `max_wave_tasks` (default 3) and `batch_pause_every`. (Mini
is always single-pass analysis, so `max_scouts`/deep don't apply.) Mini also hands
planning back to itself for the full
Phase 2–8 (scoring, wave cap, pauses) — the mini analyst/planner never build
directly; they produce artifacts and return control.

## Analyst & planner (mini lane)

For requirement analysis and planning, orc-mini dispatches the FAST variants as
subagents (Sonnet 5 high): `orc-analyze-mini` and
`subskills/orc-planner-mini`. Same artifacts and output contracts as the full
versions, trimmed depth. The mini analyst is **doc-optional**: on doc input OR an
ambiguous/underspecified requirement it runs first (mode-detect + scope-bound +
evidence-or-mark ground + recommended-option challenges), then the mini planner.
The mini analyst is always single-pass — **no deep mode, no scouts**; if the
requirement clearly needs that depth, offer to switch to the full flow
(`/orc-analyze` deep). The orchestrator never analyzes or plans itself — it
dispatches. If a task proves complex/high-risk, offer to switch to the full flow.

## Wiki consult (if present)

Same rule as the full skill: if `wiki/` exists and has > 0 files, consult the
relevant overviews during planning/scoring for better core/isolated/risk
judgment; if empty or absent, ignore it. Mini never generates the wiki. After a
mini run that changed code, apply the same guarded stale-flag hook (flag only,
never auto-scan).

## Shared artifacts

Writes to the SAME location as the full skill:
`.claude/skills/orc/run/{run-slug}/` — so a switch needs no
migration. (Mini does not keep its own separate run/ tree.)

## What mini still enforces (from the main hard rules)

- Never implement yourself; always spawn.
- All artifacts in the run subfolder; never project root.
- Validate the subagent return; malformed = failure.
- Usage: report dispatch log + remind the user to run `/usage`. Never invoke
  `/usage` programmatically.
- Never commit on a red build.
