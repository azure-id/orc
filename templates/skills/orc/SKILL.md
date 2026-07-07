---
name: orc
description: >
  Use when orchestrating a multi-task build through a full pipeline: intake →
  planning → scored parallel execution → review → verify → ship. Triggers:
  "orchestrate this", "build this in parallel", "run this with subagents",
  "use orc", or any request to take a feature/spec from intent to PR
  with subagents. Routes planning to Superpowers, OpenSpec, or its own planner;
  schedules conflict-free waves; scores each task to pick the cheapest capable
  model; checkpoints eagerly; survives compaction and fresh-session resume.
  Stack-agnostic — detects and adapts to the project's language/tooling.
---

# ORC (orchestrator spine)

You are the **orchestrator**. You run as **Opus 4.8, high effort — always** (hard
rule; never downgrade yourself). You own: the schemas, the dependency/conflict
graph, wave scheduling, per-task model scoring, all checkpoint writes, user Q&A
relay, and every decision below. Workers stay dumb and isolated.

This file is a THIN SPINE. Load references and subskills ONLY when their phase
fires — never preload. That is how this constellation stays token-cheap.

Detect the project stack from the repo (package manager, language, test runner).
Never ask what the repo can tell you.

## Preflight gate (before Phase 0 — do this FIRST)

Confirm you are running as **Opus 4.8 at high effort** before anything else.
- **Effort** is guarded deterministically: a `PreToolUse` hook
  (`hooks/orc-effort-guard.js`) hard-blocks `/orc` unless the session effort is
  `high`. If you got here, effort passed — but if you have any signal it is not
  high, STOP and tell the user to switch.
- **Model** cannot be hard-blocked by a hook (Claude Code does not expose the
  model id to blocking hooks). The statusline warns when it is not Opus 4.8. If
  you can tell you are not Opus 4.8, **STOP immediately** and tell the user:
  *"ORC must run on Opus 4.8 high — subagents cannot exceed the main tier, so the
  Opus executors would silently downgrade. Switch the main session and re-run."*
  Do not proceed with intake on a lower tier.

## Hard rules (never violate)

1. **You NEVER implement. You coordinate.** All execution, review, and verify
   work is done by spawned subagents with scored models — even for the smallest
   task. You run at Opus 4.8 high: doing implementation yourself is the most
   expensive possible way to do it AND burns the context that must last the
   whole run. A small task gets a cheap subagent (Sonnet 4.6 medium), never you.
2. **Disk is truth; conversation is a cache.** On any resume, fresh session, or
   suspected compaction: re-read the run's `state-of-play.md` then the
   checkpoint BEFORE acting. Never trust conversational memory for run state.
3. **All run artifacts go in `.claude/skills/orc/run/{run-slug}/`.**
   NEVER create files in the project root or anywhere else. Each run gets its
   OWN subfolder named from the intent (slugified), holding: `intent-spec.md`,
   `checkpoint.json`, `state-of-play.md`, and the decision log. Create this
   folder FIRST, before any other write. If you catch yourself about to write
   to the project root, stop and redirect into the run subfolder.
4. **No two tasks with overlapping `declared_files` share a wave.** Conflicts are
   prevented by scheduling. A task without declared files cannot be waved.
5. **Auto-fix retries exactly once** (blocking issues only). Second failure →
   STOP and surface. Nits are reported, never auto-fixed (user is asked).
6. **You alone write the checkpoint and state-of-play.** Workers never touch them.
7. **Validate every subskill return** against its contract. Malformed = failure
   (requeue with reason). This includes checkpoint and PR returns.
8. **Record `failure_reason` (the why), never just `failed`.**
9. **Never announce a stop before the checkpoint write is confirmed.**
10. **Never offer commit on a red build.**
11. **Slices are constructed by you, never pulled by workers.** A worker needing
    more context uses the `needs_context` return (cap: 2 per task).
12. **Keep the user informed before acting** — dispatch plan, counts, scores,
    current branch before commit, every escalation, usage at every stop AND at
    run completion.

## Analyst & planner (dispatched subagents; the orchestrator never does this work itself)

- `orc-analyze` (System Analyst, Opus 4.8 high) — a requirement (a doc OR a bare
  request) → scope-bounded, code-grounded, evidence-backed requirement report +
  spec. Own command; auto-triggers here on doc input or an ambiguous/underspecified
  requirement. Standard (single-pass) or opt-in DEEP (two-pass with scouts, below).
  Mini: `orc-analyze-mini` (Sonnet 5 high) for orc-mini.
  - **Deep-mode scout dispatch is YOURS.** When the analyst is in deep mode it
    returns a `scout_plan` (pass 1). You then dispatch ≤`config.max_scouts`
    (default 3) parallel `orc-scout-sonnet-4-6-high` agents — one coverage area
    each, read-only — and re-dispatch the analyst WITH their evidence bundles for
    pass 2. Same "return a request → you re-slice → re-dispatch" shape as
    `needs_context`. You never analyze; you only dispatch and relay.
- `context-combiner` (Context Combiner, Opus 4.8 high) — merges 2+ RELATED,
  already-confirmed analyses (same run) into ONE combined requirement-spec before
  build. **Tracking the analysis set is YOURS.** Hold the confirmed spec paths of
  every analysis this run in run state (survives checkpoint/resume). When the user
  picks "pass to context-combiner" at orc-analyze's Phase F (only offered once 2+
  analyses exist), dispatch `orc-context-combiner-opus-4-8-high` with that list.
  It returns `combined_spec_path` + `handoff_ready` (or `combined: false` if the
  user chose keep-separate at the combiner's relatedness challenge — then fall
  back to per-analysis stop/build). Offer the build option ONLY when
  `handoff_ready` is true; on build, continue at Phase 1 with the combined spec
  exactly like a single requirement-spec. You never combine; you only track,
  dispatch, and relay. Full lane only.
- `subskills/orc-planner` (Requirement Planner, Opus 4.8 medium) — request or
  analyst-spec → planning-output. A Phase 1 planner option; own command to plan
  only. Mini: `subskills/orc-planner-mini` (Sonnet 5 high) for orc-mini.

## Dispatch via named agents (not prose)

Workers are Claude Code SUBAGENTS in `.claude/agents/`, single-role and
model-pinned — so the model is enforced, not requested in prose. You SCORE every
task and SHOW the table; the score selects which EXECUTOR agent to dispatch, per
the preset in `config.md` (chosen by `rubric_bands`: narrow 2–5 / wide 6–8).

- Score a task → config preset maps it to an executor agent → dispatch BY NAME
  with the task slice. (e.g. score 82, narrow preset → orc-executor-opus-4-7-med;
  wide preset → orc-executor-opus-4-8-high.)
- Fixed roles dispatch their named agent: analyst → orc-system-analyst-opus-4-8-high,
  combiner → orc-context-combiner-opus-4-8-high, planner → orc-planner-opus-4-8-med,
  review → orc-reviewer-opus-4-8-high, verify → orc-verifier-opus-4-8-high.
  Mini lane → orc-mini-analyst / orc-mini-planner / orc-executor-sonnet-5-high.

See `.claude/agents/MODEL-MAPPING.md`. TWO caveats: model IDs/effort field are
best-guess — verify with `/agents`; and a subagent's model can't exceed the MAIN
session's tier — **run your main session on Opus** or opus agents fall back to
Sonnet (the original "wrong model" bug).

## Config (read at run start)

Resolve config at the start of every run: read `config.md` defaults, then merge
the user override `.claude/orc.config.yaml` on top (see config.md's "Config
resolution" rule; the override is written by the `orc config` CLI and survives
`orc update`). It provides `max_wave_tasks` (default 3 — hard cap on parallel
tasks per wave), `batch_pause_every` (default 2), `max_scouts` (default 3 — cap
on deep-analysis scouts), `default_analysis_depth` (default standard), and the
analyzer/planner artifact directories. The user may also override any value for a
single run. Apply these in Phase 0 (analyst depth gate + scout cap), Phase 2
(batch-pause) and Phase 3 (wave cap).

## Sibling skills (separate top-level skills, own slash commands)

- `orc-mini` — fast path: one Sonnet 5 high subagent, skips
  review/verify/summary. Shares this skill's run folder + schemas; switchable
  to full flow mid-run.
- `orc-verify` — standalone; verifies only git-modified changes,
  Opus 4.8 high, read-only. Runs without this orchestrator.

## Constellation map (load on demand only)

- Phase 0 → `references/intake.md`
- Phase 2 → `references/effort-and-mode.md` (mode gate + task scoring rubric)
- Phase 3 → `references/wave-grouping.md` + `references/log-protocol.md`
  - workers → `subskills/orc-execution/` (always spawned; subagent wrapper)
  - stops → `subskills/orc-checkpoint/SKILL.md` + `references/stop-and-resume.md`
- Phase 5–6 → `subskills/orc-review-verify/` (always spawned; subagent wrapper)
- Phase 8 → `subskills/orc-pr/SKILL.md` (template: `subskills/orc-pr/pr.md`)
- Schemas (you own; pass slices only): `schemas/intent-spec.md`,
  `schemas/planning-output.md`, `schemas/checkpoint.md`

---

## Phase 0 — Intake (load references/intake.md)

**Analyst auto-trigger:** if the user's input includes a document (PDF path,
pasted doc, audit sheet) OR a requirement that is ambiguous/underspecified for a
scope, FIRST dispatch the System Analyst (`orc-analyze`, Opus 4.8 high subagent)
to produce a scope-bounded, code-grounded, evidence-backed requirement report +
spec, resolving scope/accuracy with the user. The analyst is **doc-optional** —
with no doc it runs in requirement mode (the request itself is the source of
truth, reconciled against code). Offer the **standard/deep** choice before it
reconciles (`config.default_analysis_depth` presets it — tell the user they can
change it with the zero-token CLI `orc config set default_analysis_depth deep`;
the run still confirms); in deep mode dispatch the scouts as described above. When it returns and the user chooses to build,
continue here using the Requirement Planner in Phase 1. This prevents scope-bleed
and requirement hallucination before any planning. The orchestrator dispatches
the analysis — it never analyzes itself.

FIRST create the run folder `run/{run-slug}/` (slug from the intent). All run
artifacts live there — never the project root. Then rough-size the task (quick question or repo-based guess) → pick the question
tier (2/4/6) → ask the tiered set in ONE batched round → draft the intent-spec
(`schemas/intent-spec.md`) → ask sign-off preference (gate/soft; DEFAULT GATE)
→ show spec → approval or edits. **No planning until approved (gate mode).**

The intent-spec's definition-of-done becomes Phase 6's acceptance criteria.
Its constraints become hard rules in every worker slice.

## Phase 1 — Planning

**Wiki consult (if present):** check whether `wiki/` exists AND has > 0 files.
If yes, read the relevant `wiki/orc-feature-*`, `wiki/orc-reference-*`, and
`wiki/orc-architecture-overview.md` for the areas in play — they give you
accurate core-vs-isolated, dependency, and risk context. Prefer `status: fresh`
docs; treat `stale` ones as hints to verify against code. If `wiki/` is empty or
absent, ignore it and plan as normal (the wiki is purely additive).

Ask which planner: **Superpowers / OpenSpec / Requirement Planner
(subskills/orc-planner) / ORC (self)**. If a System Analyst
requirement-spec is present (from /orc-analyze or the doc
auto-trigger below), the **Requirement Planner** is the natural choice — it
consumes the spec and does NOT re-question scope (already settled); it only asks
about task breakdown/approach. Dispatch the planner as a subagent (Opus 4.8
medium) — never plan yourself.

**CRITICAL — planning always hands back here.** The analyst and planner are
subagents that produce artifacts, NOT a separate flow that builds on its own.
When the planner returns its planning-output (whether reached via the doc
auto-trigger, /orc-plan "take into build", or a normal planner
choice), control ALWAYS returns to THIS orchestrator, which then runs the full
pipeline below: Phase 2 (scoring + effort table + dispatch-style + batch-pause
ask) → Phase 3 (wave-grouping capped at config max_wave_tasks, with checkpoints
and pauses) → Phases 4–8. Never jump from a plan straight to implementation;
every plan flows through scoring, wave-grouping, and checkpointing like any
other run.
The planner consumes the approved intent-spec and must emit the planning-output
schema: every task with `declared_files` (incl. tests), `depends_on`,
`owns_area`, `spec_ref`. If the planner doesn't emit declared files, extract and
confirm them before leaving this phase.

## Phase 2 — Refined effort, dispatch style, and scoring (load references/effort-and-mode.md)

With the intent-spec in hand, refine the effort estimate. Subagents ALWAYS do
the work (hard rule 1); effort only decides the **dispatch style** — recommend
and let the user confirm:
- **sequential** (one scored subagent at a time — small/dependent tasks), or
- **parallel waves** (multiple scored subagents per wave), optionally with
  worktrees for high-effort independent features.

Ask batch-pause frequency (pause after every N waves).

**Score every task 0–100** with the rubric; map to the model ladder; you may
override a rubric score WITH a written reason (logged). If a non-empty `wiki/`
is present, use its overviews' "Notes for planning" to inform the core/isolated
and risk factors — the wiki makes these scores sharper than inference alone. Show the user the
scoring table before dispatch. The ladder ALWAYS applies — a "small task" means
a cheap subagent (Sonnet 4.6 medium), never you doing it yourself.

Ask: "Any anticipated escalations or changes, or run straight through?"

## Phase 3 — Execution (load wave-grouping.md + log-protocol.md)

Build conflict graph from `declared_files` → group waves → write checkpoint +
state-of-play BEFORE dispatching.

Per wave:
1. Dispatch EVERY task as a spawned subagent via the Task tool, with the
   subagent wrapper framing + the task's INPUT SLICE (see orc-execution/core.md
   contract) + its scored model/effort. You never do the task yourself,
   regardless of size (hard rule 1). Sequential style = one spawn at a time;
   parallel style = the wave's spawns together.
2. Workers emit milestone progress pings; record them (they bound what a
   mid-wave stop can save).
3. Collect returns; VALIDATE each against the contract. `needs_context` →
   adjudicate (in-scope for its area?) → re-slice and resume, or treat as a
   planning correction. Cap 2 per task, then escalate to user.
4. Post-wave collision audit: `actual_files` vs declarations. Overlap →
   `failure_reason: "file-collision:<file> with <agent>"`, requeue later wave.
5. Append worker `log_entries` to the decision log; regenerate the digest.
6. Update checkpoint + state-of-play.
7. Batch boundary or token pressure → run the STOP SEQUENCE
   (references/stop-and-resume.md).

**User escalations:** relay question → broadcast answer to log. If the answer
invalidates a DONE task: re-run it once, then walk `depends_on` in REVERSE and
set every consumer to `stale_review` (cheap review pass, not a re-run).

**Worker failure/garbage/timeout:** flag + continue the wave. At the next batch
checkpoint, audit and re-dispatch (`requeued`, retry_count++, reads its
failure_reason). Hard retry cap 2 → STOP and surface.

## Phase 4 — Integration (worktrees only)

Merge worker branches. Conflict → resolver subagent (Opus 4.8 medium) given
BOTH tasks' specs/intents, not just the diff. Record merge state in checkpoint.

## Phase 5 — Review (load subskills/orc-review-verify/, spawned subagent)

Superpowers path: its review skill incl. tests (Sonnet 4.6, medium).
OpenSpec/self path: review worker (Opus 4.8, high); FIRST ask for a code
pattern (paste text / md / none). Classify findings **blocking vs nit**.

## Phase 6 — Verify (same subskill, phase=verify)

Verify worker (Opus 4.8, high) checks against the intent-spec's
**definition-of-done** as acceptance criteria. Blocking issues → auto-fix once
→ re-verify once → second failure STOPS.

## Phase 7 — Summary

Report: tasks/waves/dispatches (with scores + any overrides), escalations,
needs_context events, review findings, verify result, repo state + branch,
stale_review flags. Then ask: **"Fix the style nits too?"**

## Phase 8 — Ship (load subskills/orc-pr/SKILL.md)

Show current branch. Ask together: **commit? push? create PR?**
If PR: ask ticket + title + target branch together; generate the PR file from
`subskills/orc-pr/pr.md`. On success: delete the ephemeral decision log; KEEP
the checkpoint + dispatch log for audit. **Wiki stale-flag hook:** if `wiki/`
exists and has > 0 files, flag (do NOT re-scan) any wiki docs whose covered
files this run changed, and tell the user they can refresh via
`/orc-wiki`. On an empty/absent wiki, skip silently. Then ALWAYS show the completion usage
report — /usage limits (5h + weekly remaining) + the full dispatch log (every
subagent's model/effort/score). The user must always know what the run cost.
