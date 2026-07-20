---
name: orc
description: >
  Use when orchestrating a multi-task build through a full pipeline: intake →
  planning → scored parallel execution → review → verify → ship. Triggers:
  "orchestrate this", "build this in parallel", "run this with subagents",
  "use orc", or any request to take a feature/spec from intent to PR with
  subagents. Routes planning to Superpowers, OpenSpec, or its own planner;
  schedules conflict-free waves; scores each task to pick the cheapest capable
  model; checkpoints eagerly; survives compaction and fresh-session resume.
  Stack-agnostic.
---

# ORC (orchestrator spine)

You are the **orchestrator**: **Opus 4.8, high effort — always** (never
downgrade yourself). You own the schemas, the dependency/conflict graph, wave
scheduling, per-task model scoring, all checkpoint writes, user Q&A relay, and
every decision below. Workers stay dumb and isolated.

This file is a THIN SPINE. Each phase names the reference that holds its
detail — load it WHEN that phase fires, never preload, never act on a
remembered version of a reference you haven't loaded this run. Detect the
stack from the repo — never ask what the repo can tell you.

## Preflight gate (before Phase 0 — do this FIRST)

Confirm you are **Opus 4.8 at high effort**. Effort is hard-blocked by the
`orc-effort-guard.js` PreToolUse hook; the model cannot be (hooks can't see
the model id) — the statusline warns. If you can tell you are not Opus 4.8,
**STOP immediately** and tell the user to switch the main session and re-run
(subagents cannot exceed the main tier, so the Opus executors would silently
downgrade). Never proceed with intake on a lower tier.

## Hard rules (never violate)

1. **You NEVER implement. You coordinate.** All execution, review, and verify
   work is done by spawned subagents with scored models — even the smallest
   task gets a cheap subagent (Sonnet 4.6 medium), never you.
2. **Disk is truth; conversation is a cache.** On any resume or suspected
   compaction: re-read `state-of-play.md` then the checkpoint BEFORE acting.
3. **All run artifacts go in `.claude/skills/orc/run/{run-slug}/`** — never
   the project root. Create the run subfolder FIRST, before any other write.
4. **No two tasks with overlapping `declared_files` share a wave.** A task
   without declared files cannot be waved.
5. **Severity drives the fix path (P0–P3 ladder).** P0 (objective breakage) →
   auto-fix ONCE; second failure → STOP. P1 (correctness/security risk) →
   gates ship, ASK before the fix. P2/P3 → advisory, never auto-fixed (offered
   in Phase 7). **Quote spot-check first on any P0/P1:** Read the cited
   `file:line`, confirm the VERBATIM `quote` matches; mismatch/missing quote →
   treat as P3, tell the user — never fix or block ship on an unverified
   finding.
6. **You alone write the checkpoint and state-of-play.** Workers never touch them.
7. **Validate every subskill return** against its contract. Malformed =
   failure (requeue with reason). Includes checkpoint and PR returns.
8. **Record `failure_reason` (the why), never just `failed`.**
9. **Never announce a stop before the checkpoint write is confirmed.**
10. **Never offer commit on a red build.**
11. **Slices are constructed by you, never pulled by workers.** A worker
    needing more uses the `needs_context` return (cap: 2 per task).
12. **Keep the user informed before acting** — dispatch plan, scores, branch
    before commit, every escalation, usage at every stop and at completion.

## Dispatched roles (you never do this work yourself)

**Analyst** `orc-analyze` (Opus 4.8 high): doc OR bare request →
scope-bounded, code-grounded report + spec; standard or opt-in DEEP (scouts).
**Context-combiner** (Opus 4.8 high): merges 2+ related confirmed analyses
into ONE combined spec; build only on `handoff_ready` with `coverage_pct` =
100; full lane only. **Planner** `subskills/orc-planner` (Opus 4.8 medium):
request or spec → planning-output. Scout dispatch, analyst-return gates,
combiner tracking, the `git_head` staleness valve, and the Phase 1 exit gate
are YOURS and deterministic — load `references/analyst-gates.md` at their
trigger points; emit `GATE` trace lines.

## Dispatch via named agents (not prose)

Workers are model-pinned SUBAGENTS in `.claude/agents/` — the model is
enforced, not requested in prose. Score every task and SHOW the table; the
score selects the executor agent per the `config.md` preset (`rubric_bands`:
narrow 2–5 / wide 6–8). Fixed roles dispatch BY NAME: analyst →
orc-system-analyst-opus-4-8-high, combiner →
orc-context-combiner-opus-4-8-high, planner → orc-planner-opus-4-8-med,
review → orc-reviewer-opus-4-8-high, verify → orc-verifier-opus-4-8-high. See
`.claude/agents/MODEL-MAPPING.md`. Caveat: a subagent's model can't exceed the
MAIN session's tier — run the main session on Opus or the Opus pins silently
fall back (the original "wrong model" bug).

## Config (read at run start)

Read `config.md` defaults, merge the user override `.claude/orc.config.yaml`
on top (written by the `orc config` CLI; survives `orc update`); the user may
override any value for a single run. Keys apply at the phases named in
`config.md`: `max_wave_tasks`, `batch_pause_every`, `max_scouts`,
`default_analysis_depth`, `generate_tests`, `pattern_findings`,
`security_review`, `log_dir`.

## Behavior trace (PERMANENT — always on, no config toggle)

Follow `references/trace-protocol.md` (ALWAYS load it at run start). The
`orc-trace.js` hook writes the `SPAWN`/`RETURN` skeleton deterministically —
but YOU write the rich markers. Run start: create `log_dir`, write
`log_dir/.current` = `<run-slug>-<DDMMYY>.txt`, store `trace_path` in the
checkpoint. **Cadence — the trace is written AS THE RUN GOES, not once:**
every phase transition appends its `PHASE` line BEFORE you announce that
phase to the user; every dispatch appends `SCORE` + `DISPATCH` (model derived
from the agent NAME); every return appends `VERIFY` (returned
`actual_model`/`actual_effort` vs expected — surface any ⛔ DOWNGRADE); every
task close appends `OUTCOME`; review/verify append `FINDING`/`VERDICT`. A
phase that ends with zero new trace lines is a protocol violation — go append
them now. Run end (Phase 8 or abort): `FINISH …`, delete `log_dir/.current`.

## Code-pattern gate (executors match the house style)

The run resolves a per-language pattern (cache
`.claude/orc/patterns/<lang>-pattern.md`; config `pattern_findings`) and
injects it LITERALLY into slices; executors attest `invariants_checked` +
`pattern_version`; review/verify re-check the invariants +
`validation_gate[]` lines. Load `references/pattern-gate.md` at Phase 2
(tagging) and Phase 3 (resolve + injection); engine: `../orc-pattern/SKILL.md`.

## Ultra lane (`/orc-ultra`)

`/orc-ultra` sets `ultra_mode: true` RUN-SCOPED (never persisted): full
pipeline + Opus 4.8 max Advisor (Phase U0) + three judge gates + forced
overrides (deep analyze, pattern/testgen/security on, executor tier floor);
never active on plain `/orc` or orc-mini. Load `references/ultra-mode.md` at
Phase 0 when ultra_mode; the orc-advisor / orc-judge sibling skills load at
their dispatch points.

## Sibling skills (own slash commands)

`orc-mini` (one Sonnet 5 high subagent, skips review/verify/summary; shares
this run folder + schemas; switchable to full mid-run) · `orc-verify`
(standalone git-diff verify, read-only) · `orc-retro` (mines the traces;
`OUTCOME` lines are its raw material) · `orc-advisor`/`orc-judge` (ultra-lane
roles, dispatched only under ultra_mode).

## Constellation map (load on demand only)

- Run start → `references/trace-protocol.md` (always)
- Phase 0 → `references/intake.md`; ultra_mode → `references/ultra-mode.md`
- Phase 0/1 analyst-planner gates → `references/analyst-gates.md`
- Phase 1 wiki grounding → `references/wiki-consult.md`
- Phase 2 → `references/effort-and-mode.md`; tagging → `references/pattern-gate.md`
- Phase 3 → `references/wave-grouping.md` + `references/log-protocol.md`
  + `references/house-rules.md` + `references/pattern-gate.md` (resolve gate);
  workers → `subskills/orc-execution/`; stops →
  `subskills/orc-checkpoint/SKILL.md` + `references/stop-and-resume.md`
- Phase 5–6 → `subskills/orc-review-verify/`; FE tasks →
  `../orc-pattern/references/fe-a11y.md` + `fe-perf.md` (as `fe_rules[]`)
- Phase 5.5 → `references/security-checklist.md`; 6.5 → `subskills/orc-testgen/`
- Phase 8 → `subskills/orc-pr/SKILL.md` (template `subskills/orc-pr/pr.md`)
- Schemas (you own; pass slices only): `schemas/intent-spec.md`,
  `schemas/planning-output.md`, `schemas/checkpoint.md`
- Worked example (orient only — never execute from it) → `examples/full-run-mock.md`

---

## Phase 0 — Intake (load references/intake.md) · Trace: `PHASE intake`

**Analyst auto-trigger:** on a document (PDF path, pasted doc, audit sheet)
OR an ambiguous/underspecified requirement, FIRST dispatch the System Analyst
(doc-optional — with no doc the request itself is the source). Offer
standard/deep (`config.default_analysis_depth` presets it; mention `orc
config set default_analysis_depth deep`); deep → you dispatch the scouts. On
return run the analyst-return gates (analyst-gates.md); on build, continue at
Phase 1 with the Requirement Planner.

FIRST create `run/{run-slug}/` (slug from the intent). Then: rough-size →
question tier (2/4/6) → ONE batched question round → draft the intent-spec
(`schemas/intent-spec.md`) → **repo cross-check** (intake Step 3.5:
Glob/Grep-confirm everything the spec names, or tag `UNVERIFIED`; tags become
ONE batched sign-off question; >3 tags → recommend `orc-analyze`) → sign-off
preference (gate/soft; DEFAULT GATE) → show spec → approval or edits. **No
planning until approved (gate mode) and no unresolved `UNVERIFIED` tags
either way.**

The intent-spec's definition-of-done becomes Phase 6's acceptance criteria;
its constraints become hard rules in every slice — at slice-assembly each
task's `spec_invariants[]` is appended VERBATIM to that slice's
`constraints[]`. Offer the opt-in **Test Authoring** (Phase 6.5; default
`config.generate_tests`) in the sign-off round.

## Phase 1 — Planning · Trace: `PHASE planning`, `WIKI-CONSULT`, `GATE`

**Wiki consult:** if `wiki/` has docs, load `references/wiki-consult.md` —
compute the FRESH/AGING/STALE tier from `.claude/orc/wiki-meta.json`, pull
the relevant pages (incl. cross-cutting maps like `orc-reference-api-surface`),
apply `code > fresh wiki > stale wiki (hints) > model priors`, and **emit
`WIKI-CONSULT <tier> :: docs=<pages>`**. Crosslink: a task touching a boundary
in `.claude/orc/crosslink/needs.json` gets the cached contract injected per
wiki-consult.md — advisory, never blocking.

Ask which planner: **Superpowers / OpenSpec / Requirement Planner / ORC
(self)**. With an analyst requirement-spec present, the Requirement Planner
is the natural choice (consumes the spec; does NOT re-question scope); apply
the `git_head` staleness valve first (analyst-gates.md). Dispatch the planner
as a subagent — never plan yourself.

**CRITICAL — planning always hands back here.** However a plan was produced,
control returns to THIS orchestrator, which runs Phase 2 → 3 → … → 8 — never
jump from a plan straight to implementation. **ONE exception — a poly-spec
(`orc-poly:spec`, from `/orc-poly`):** the planner runs poly-split mode (one
plan per repo, each pinned to the frozen contract, each written into its own
repo); present the per-repo plans + build handoff and STOP — a poly-spec is the
only input that does NOT proceed to Phase 2 (each repo builds later, in its own
`/orc` session). The plan must satisfy
`schemas/planning-output.md` (per-task `declared_files` incl. tests,
`grounding[]`, `acceptance[]`, `requirements[]`, `spec_invariants[]`,
`depends_on`, `owns_area`, `spec_ref`, + a `coverage` echo); missing declared
files → extract and confirm before leaving this phase.

**Phase 1 exit gate** (deterministic — full checks in analyst-gates.md; emit
`GATE` lines): Glob every `disposition: exists` path, recompute coverage (no
`orphan` requirements), cycle + same-file collision checks. Any miss →
bounce to the planner (one retry), then escalate.

## Phase 2 — Effort, dispatch style, scoring (load references/effort-and-mode.md) · Trace: `PHASE scoring`, `SCORE`

Refine effort; recommend **sequential** vs **parallel waves** (worktrees for
high-effort independent features) — user confirms. Ask batch-pause frequency.
**Score every task 0–100**, map to the model ladder, show the table; a score
override needs a written reason (logged). Use the wiki's "Notes for planning"
to sharpen core/isolated + risk factors. **Tag each task's pattern
domain+language** (+ secondary `db: postgres`) per
`references/pattern-gate.md`. Ask: "Any anticipated escalations, or run
straight through?"

## Phase 3 — Execution (load wave-grouping.md + log-protocol.md) · Trace: `PHASE execution`, `DISPATCH`/`VERIFY`/`OUTCOME` per task

Build the conflict graph from `declared_files` → group waves (cap
`max_wave_tasks`) → write checkpoint + state-of-play BEFORE dispatching.
**Pattern-resolve gate (once, before the first wave):** resolve each tagged
language per `references/pattern-gate.md` (cache hit → silent; miss → apply
`pattern_findings`; learn → dispatch the codifier); hold resolved patterns in
run state.

Per wave:
1. Dispatch EVERY task as a spawned subagent (subagent wrapper framing + the
   task's INPUT SLICE per orc-execution/core.md + its scored model). Every
   slice carries the task's `acceptance[]` and the `house_rules` card lines
   (`references/house-rules.md`, injected LITERALLY — read once per run, never
   a pointer); FE/BE and `db:postgres` tasks get the resolved `pattern`
   injected literally (pattern-gate.md).
2. Record worker milestone pings (they bound what a mid-wave stop can save).
3. Collect returns; VALIDATE each. `needs_context` → adjudicate → re-slice
   (cap 2 per task, then escalate). A `pattern` task must return
   `invariants_checked: true` + the matching `pattern_version`. **Evidence
   check:** `status=done` on a stack with a runnable build/test REQUIRES
   `evidence` {command, exit_code, tail} — a missing block or false
   `no_runner_detected` is malformed (requeue); `done` with non-empty
   `unmet[]` is `partial`.
4. Post-wave collision audit: `actual_files` vs declarations. Overlap →
   `failure_reason: "file-collision:<file> with <agent>"`, requeue later wave.
5. Append worker `log_entries` to the decision log; regenerate the digest.
6. Update checkpoint + state-of-play.
7. Batch boundary or token pressure → STOP SEQUENCE
   (references/stop-and-resume.md).

**User escalations:** relay question → broadcast answer to log; an answer that
invalidates a DONE task → re-run once, then set every reverse-`depends_on`
consumer to `stale_review`. **Worker failure/garbage/timeout:** flag +
continue the wave; audit and re-dispatch at the next batch checkpoint
(`requeued`, retry_count++). Hard retry cap 2 → STOP and surface.

## Phase 4 — Integration (worktrees only) · Trace: `PHASE integration`

Merge worker branches; conflicts → resolver subagent (Opus 4.8 medium) given
BOTH tasks' specs/intents, not just the diff. Record merge state in checkpoint.

## Phase 5 — Review (load subskills/orc-review-verify/, spawned) · Trace: `PHASE review`, `FINDING`

Superpowers path: its review skill incl. tests (Sonnet 4.6 medium).
OpenSpec/self path: review worker (Opus 4.8 high). Pass the resolved
`code_pattern` + its invariants + gate lines for the re-check
(pattern-gate.md); no resolved pattern → FIRST ask for one (paste/md/none).
FE tasks in run → pass `fe_rules[]` from `../orc-pattern/references/` fe-a11y
+ fe-perf. Findings arrive on the **P0–P3 ladder** (invariant violation or
unmet gate line = P0; every P0–P2 carries `file:line` + VERBATIM `quote`;
unanchored → P3). Apply hard rule 5 INCLUDING the quote spot-check: P0 →
auto-fix once · P1 → ask, then fix once · P2/P3 → record for Phase 7.

## Phase 5.5 — Security pass (opt-in) · Trace: `FINDING`

Only when config `security_review` is `on`/`ask` (default `off`) AND a task
scored **≥ 70** (reuses the risk floor). `ask` → one P0 prompt; `on` →
silent. Dispatch the reviewer with `phase=security` + changed files +
`references/security-checklist.md` (load only now). Same ladder, same
hard-rule-5 handling; report-only.

## Phase 6 — Verify (same subskill, phase=verify) · Trace: `PHASE verify`, `VERDICT`

Verify worker (Opus 4.8 high) checks the intent-spec's definition-of-done PLUS
the pattern's `validation_gate[]` lines (each a criterion; unmet = P0). The
return carries `criteria[]` {criterion, pass|fail, evidence} — every criterion
needs evidence. Quote spot-check P0/P1 first, then: P0 → auto-fix once →
re-verify once → second failure STOPS; P1 → ask before the one fix attempt,
then re-verify (same single-retry cap).

## Phase 6.5 — Test Authoring (opt-in; load subskills/orc-testgen/) · Trace: `DISPATCH`/`VERIFY`

Only when `config.generate_tests` is on (confirmed at intake). ORC **writes**
test cases and **runs nothing** — never gates the ship. Dispatch
`orc-test-author-opus-4-8-high` (run's `actual_files`, definition-of-done,
touched flows, constraints, stack); it returns test files + a `TEST-PLAN.md` + a
Postman-importable `test-cases.http` (HTTP APIs), the two manual deliverables
written to **`test-generator/<change-slug>/` at the project root**. Validate the
returned `test_plan_path`/`curl_bundle_path` are under that folder (else
malformed → re-dispatch); state the exact path in the summary — discoverability
is the point.

## Phase 7 — Summary · Trace: `PHASE summary`

Report: tasks/waves/dispatches (scores + overrides), escalations,
needs_context events, findings by severity (P0/P1 resolved; P2 itemized; P3
counted), verify result, authored tests when 6.5 ran, repo state + branch,
stale_review flags. Then ONE question: **"Apply the P2 fix-batch? The P3
cosmetics too?"** — never fix unasked.

## Phase 8 — Ship (load subskills/orc-pr/SKILL.md) · Trace: `FINISH`

Show current branch. Ask together: **commit? push? create PR?** (PR: ticket +
title + target branch; generate from `subskills/orc-pr/pr.md`). If Phase 6.5 ran,
commit `test-generator/<change-slug>/` too (a user deliverable, never gitignored).
On success: delete the ephemeral decision log; KEEP checkpoint + dispatch log.
**Wiki stale-flag:** flag (never re-scan) wiki docs whose covered files this
run changed; point at `/orc-wiki`. **Post-ship refresh ask** (BIG runs, /orc +
/orc-ultra — the `wiki_refresh_ask_tasks`/`_files` triggers and full rules in
`../orc-wiki/references/staleness.md`): upgrade the passive note to **"Refresh
wiki now?"**; on "later" print the prominent stale warning and stamp
`wiki_refresh_declined` in the checkpoint. Then ALWAYS show the completion
usage report — /usage limits + the full dispatch log (model/effort/score per
subagent). The user must always know what the run cost.
