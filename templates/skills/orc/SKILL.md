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

This file is a THIN SPINE. Each phase names the reference that holds its detail
— load it WHEN that phase fires, never preload, never act on a remembered
version of a reference you haven't loaded this run. Detect the stack from the repo — never ask what the repo can tell you.

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

Workers are model-pinned SUBAGENTS in `.claude/agents/` — the model is enforced,
not requested in prose. Score every task from the planner-emitted `facets` via
the fixed arithmetic formula and SHOW the table with the facet vector + the
arithmetic (`B+N+L+T+fan+U = raw`; an un-shown number is not scored); map the
final score via the SINGLE 8-band table in `config.md` (`rubric_bands` =
granularity only, never a preset); sibling tasks differing in ≤1 facet share a
band or cite the differing facet (see `references/effort-and-mode.md`). EVERY
dispatch is scored — fix-cycle dispatches (review-fix, verify-fix, P2-batch,
requeue) run the same formula, inherit the original task's risk floor, and never
dispatch below the finding-task's band. Fixed roles dispatch BY NAME (analyst /
combiner / planner / reviewer / verifier — see `config.md`'s fixed-role table +
`.claude/agents/MODEL-MAPPING.md`). If `fable5_enabled`, roles in `fable5_roles`
dispatch their `orc-<role>-fable-5` variant instead — see
`_shared/fable5-override.md`.
Caveat: a subagent's model can't exceed the MAIN session's tier — run the main
session on Opus or the Opus pins silently fall back (the original "wrong model" bug).

## Config (read at run start)

Read `config.md` defaults, merge the user override `.claude/orc.config.yaml` on
top (written by the `orc config` CLI; survives `orc update`; per-run overrides
allowed). Keys: `max_wave_tasks`, `batch_pause_every`, `max_scouts`,
`default_analysis_depth`, `generate_tests`, `pattern_findings`, `security_review`, `log_dir`.

## Behavior trace (PERMANENT — always on, no config toggle)

Follow `references/trace-protocol.md` (ALWAYS load it at run start). The
`orc-trace.js` hook writes the `SPAWN`/`RETURN`/`PHASE-EDGE` skeleton
deterministically; the rich narrative is **dispatched, never remembered** — every
`emit <VERB>` step below means RECORD that event, with its REAL timestamp, into
the current **phase packet**; you never append a trace line yourself. Run start:
create `log_dir`, write `log_dir/.current` =
`run-orc-<slug>-<DDMMYY>-<HHMMSS>.txt`, store `trace_path` in the checkpoint.
**Phase close = dispatch `orc-trace-writer-haiku-4-5`** with that packet
(`phase`, `events[]`, and `decisions` — the WHY: scoring rationale, the user's
answers VERBATIM, what you rejected; `run_meta` on the FIRST packet only).
**Pairing rule:** issue phase N's writer dispatch in the SAME tool block as phase
N+1's first dispatch (a phase with no next dispatch sends it solo, before its
user-facing output); the first packet is solo + synchronous — it repairs a
hook-bootstrapped filename. `DISPATCH`/`VERIFY` models are derived from the agent
NAME and checked against each return's `actual_model`/`actual_effort` — surface
any ⛔ DOWNGRADE to the user, not just into the packet. A phase ending with
`zero new trace lines is a protocol violation` — build and dispatch its packet
NOW, with the events' real stamps. Run end (Phase 8 or abort): the `FINISH`
packet goes out and RETURNS, then delete `log_dir/.current`.

## Code-pattern gate (executors match the house style)

The run resolves a per-language pattern (cache
`.claude/orc/patterns/<lang>-pattern.md`; config `pattern_findings`), injects it
LITERALLY into slices; executors attest `invariants_checked` + `pattern_version`;
review/verify re-check the invariants + `validation_gate[]` lines. Load
`references/pattern-gate.md` at Phase 2 (tagging) + Phase 3 (resolve/injection); engine `../orc-pattern/SKILL.md`.

## Ultra lane (`/orc-ultra`)

`/orc-ultra` sets `ultra_mode: true` RUN-SCOPED (never persisted): full pipeline
+ Opus 4.8 max Advisor (Phase U0) + three judge gates + forced overrides (deep
analyze, pattern/testgen/security on, executor tier floor); never on plain
`/orc` or orc-mini. Load `references/ultra-mode.md` at Phase 0 when ultra_mode;
orc-advisor / orc-judge load at their dispatch points.

## Sibling skills (own slash commands)

`orc-mini` (one Sonnet 5 high subagent, skips review/verify/summary; shares this
run folder + schemas; switchable mid-run) · `orc-verify` (standalone git-diff
verify, read-only) · `orc-retro` (mines the traces; `OUTCOME` lines are its raw
material) · `orc-advisor`/`orc-judge` (ultra-lane, only under ultra_mode).

## Constellation map (load on demand only)

- Run start → `references/trace-protocol.md` (always)
- Phase 0 → `references/intake.md`; **plan input → `references/plan-handoff.md`**;
  ultra_mode → `references/ultra-mode.md`
- Phase 0/1 analyst-planner gates → `references/analyst-gates.md`
- Phase 1 wiki grounding → `references/wiki-consult.md` + `references/preflight-report.md`
- Phase 2 → `references/effort-and-mode.md`; tagging → `references/pattern-gate.md`
- Phase 3 → `references/wave-grouping.md` + `log-protocol.md` + `house-rules.md`
  + `pattern-gate.md` (resolve gate); workers → `subskills/orc-execution/`;
  stops → `subskills/orc-checkpoint/SKILL.md` + `references/stop-and-resume.md`
- Phase 5–6 → `subskills/orc-review-verify/`; FE tasks →
  `../orc-pattern/references/fe-a11y.md` + `fe-perf.md` (as `fe_rules[]`)
- Phase 5.5 → `references/security-checklist.md`; 6.5 → `subskills/orc-testgen/`
- Phase 8 → `subskills/orc-pr/SKILL.md` (template `subskills/orc-pr/pr.md`)
- Schemas (you own; pass slices only): `schemas/intent-spec.md`,
  `schemas/planning-output.md`, `schemas/checkpoint.md`
- Worked example (orient only — never execute from it) → `examples/full-run-mock.md`

---

## Phase 0 — Intake (load references/intake.md) · Trace: `PHASE intake`

**Plan-input trigger (check FIRST — load `references/plan-handoff.md`):** if the
run input IS a plan (pasted planning-output, a `plan-{name}.md` path, or an
`orc/planner/{name}/` checkpoint), follow that reference: bootstrap the trace,
schema-validate, apply the `plan_head` staleness valve, RE-RUN the full Phase 1
exit gate here (the deterministic catch for phantom-file drift), relay
`open_questions[]`, then continue at Phase 2. A plan input never skips Phase 2/3
nor executes task-by-task ad hoc.

**Analyst auto-trigger:** on a document (PDF path, pasted doc, audit sheet)
OR an ambiguous/underspecified requirement, FIRST dispatch the System Analyst
(doc-optional — with no doc the request itself is the source). Offer
standard/deep (`config.default_analysis_depth` presets it; mention `orc
config set default_analysis_depth deep`); deep → you dispatch the scouts. On
return run the analyst-return gates (analyst-gates.md); on build, continue at
Phase 1 with the Requirement Planner.

Emit `PHASE intake start` FIRST, then create `run/{run-slug}/` (slug from the
intent). Then: rough-size →
question tier (2/4/6) → ONE batched question round → draft the intent-spec
(`schemas/intent-spec.md`) → **repo cross-check** (intake Step 3.5:
Glob/Grep-confirm everything the spec names, or tag `UNVERIFIED`; tags become
ONE batched sign-off question; >3 tags → recommend `orc-analyze`) → sign-off
preference (gate/soft; DEFAULT GATE) → show spec → approval or edits. **No
planning until approved (gate mode) and no unresolved `UNVERIFIED` tags
either way.** On approval, emit `PHASE intake end`.

The intent-spec's definition-of-done becomes Phase 6's acceptance criteria;
its constraints become hard rules in every slice — at slice-assembly each
task's `spec_invariants[]` is appended VERBATIM to that slice's
`constraints[]`. Offer the opt-in **Test Authoring** (Phase 6.5; default
`config.generate_tests`) in the sign-off round.

## Phase 1 — Planning · Trace: `PHASE planning`, `CONFIG`, `WIKI-CONSULT`, `CROSSLINK`, `GATE`

Emit `PHASE planning start`, then emit ONE `CONFIG <key=value …>` line with the
resolved values of every config key this run will consume (incl. `fable5_*` when
enabled) — the runtime proof `/orc-retro` audits that the run honored the config.
**Wiki consult (load `references/wiki-consult.md`;
always report — no tier is silent):** compute the FRESH/AGING/STALE tier from
`.claude/orc/wiki-meta.json`, pull the relevant pages (incl. cross-cutting maps
like `orc-reference-api-surface`), apply
`code > fresh wiki > stale wiki (hints) > model priors`, emit
`WIKI-CONSULT <tier> :: docs=<pages>`, AND print the one-line tier report to the
user (every tier, `absent` included). **Crosslink:** per wiki-consult.md, inject
the cached `.claude/orc/crosslink/needs.json` contract into any boundary-touching
task (advisory) and print + emit `CROSSLINK <state> :: boundaries=<n> peers=<names>`
— `configured-no-cache` prints the "cache not built" warning (full orc reads
only pre-built needs/cache, never peer source live). **Preflight:** print the compact block per
`references/preflight-report.md` once wiki + crosslink (+ pattern/waves) resolve.

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
`depends_on`, `owns_area`, `spec_ref`, + a `coverage` echo, + `tdd_spec` —
TDD is ALWAYS ON in full orc/ultra: per-requirement given/when/then + runnable
skeletons, or `tdd: exempt — <reason>` per requirement; no test runner in the
project → whole-run exemption, ONE preflight line says so); missing declared
files → extract and confirm before leaving this phase.

**Phase 1 exit gate** (deterministic — full checks in analyst-gates.md; emit
`GATE` lines): Glob every `disposition: exists` path, recompute coverage (no
`orphan` requirements), cycle + same-file collision checks. Any miss →
bounce to the planner (one retry), then escalate. **After the gate passes,
relay the plan's `open_questions[]` in ONE batch:** blocking questions must be
answered before Phase 2; non-blocking show their `proposed_default` for tacit
approval. **Step-back valve:** `plan_confidence: low` OR >3 blocking questions →
recommend stepping back to `orc-analyze` (user may override and proceed). On
pass, emit `PHASE planning end`.

## Phase 2 — Effort, dispatch style, scoring (load references/effort-and-mode.md) · Trace: `PHASE scoring`, `SCORE`

Emit `PHASE scoring start`. Refine effort; recommend **sequential** vs
**parallel** dispatch (worktrees for high-effort independent features) — user
confirms. Dispatch style is **intra-wave concurrency only**: waves are computed
regardless of style (sequential runs have waves too, see wave-grouping.md), so
the batch pause always binds to wave numbers. **Batch-pause schedule (deterministic, not a cadence hint):** the plan
has K waves — ask "pause after every wave / every 2nd / run straight through?"
and SHOW the resulting stop list ("will pause after waves [list]"); a 2-wave
plan plainly offers "pause after wave 1". Store it as `pause_schedule`, recompute
each wave's `is_batch_pause` (last wave never pauses). **Facet-validation gate
(deterministic):** recompute `breadth` + `fan_in`/`fan_out` from the plan; a
mismatch or an uncited `risk` entry bounces the plan (grounding mechanics).
**Score every task** from its `facets` via the fixed formula, map to the model
ladder, show the facet vector + arithmetic table, and emit `SCORE task=<id>
score=<n> band=<band> model=<m> facets=<vector> :: <reason>` per task; a score
override needs a written reason (logged). Use the wiki's "Notes for planning" to sharpen
core/isolated + risk factors. **Tag each task's pattern domain+language**
(+ secondary `db: postgres`) per `references/pattern-gate.md`. Ask: "Any
anticipated escalations, or run straight through?" Emit `PHASE scoring end`.

## Phase 3 — Execution (load wave-grouping.md + log-protocol.md) · Trace: `PHASE execution`, `DISPATCH`/`VERIFY`/`OUTCOME` per task

Emit `PHASE execution start`. Build the conflict graph from `declared_files` →
group waves (cap `max_wave_tasks`, mark `is_batch_pause` from `pause_schedule`;
waves are computed for BOTH dispatch styles — sequential fires a wave's tasks
one at a time, parallel fires them together) → SHOW the wave plan (wave → tasks →
pause marks) to the user BEFORE wave 1 → write checkpoint + state-of-play BEFORE
dispatching. **Pattern-resolve gate
(once, before the first wave):** resolve each tagged language per
`references/pattern-gate.md` and report ONE user line per language (cache hit →
apply cached; miss → codify/agnostic per `pattern_findings`; learn → dispatch
the codifier); hold resolved patterns in run state.

**Wave 0 — TDD red proof (before the implementation waves; skip only on a
whole-run exemption):** dispatch ONE task that materializes every non-exempt
`tdd_spec` skeleton into real FAILING tests in the project's test tree, runs
them, and returns the red evidence. Emit `TDD-RED task=<id> iter=0` per
requirement. A test that PASSES pre-implementation is a spec bug → block that
requirement's dispatch and surface it. Then per implementation wave:
1. Dispatch EVERY task as a spawned subagent (emit `DISPATCH <agent> :: <task>
   expect=<model>/<effort>` BEFORE the Task call; subagent wrapper framing + the
   task's INPUT SLICE per orc-execution/core.md + its scored model). Every
   slice carries the task's `acceptance[]`, its `tdd_spec` tests (the executor
   implements to green: implement→test→repair, cap `tdd_loop_max`, emitting
   `TDD-RED`/`TDD-GREEN` per iteration; cap hit → STOP SEQUENCE + honest red
   report) and the `house_rules` card lines
   (`references/house-rules.md`, injected LITERALLY — read once per run, never
   a pointer); FE/BE and `db:postgres` tasks get the resolved `pattern`
   injected literally (pattern-gate.md).
2. Record worker milestone pings (they bound what a mid-wave stop can save).
3. Collect returns; VALIDATE each (emit `VERIFY <task> actual=<model>/<effort>`
   ✅ MATCH / ⛔ DOWNGRADE per return — surface any downgrade to the user).
   `needs_context` → adjudicate → re-slice
   (cap 2 per task, then escalate). A `pattern` task must return
   `invariants_checked: true` + the matching `pattern_version`. **Evidence
   check:** `status=done` on a stack with a runnable build/test REQUIRES
   `evidence` {command, exit_code, tail} — a missing block or false
   `no_runner_detected` is malformed (requeue); `done` with non-empty
   `unmet[]` is `partial`.
4. Post-wave collision audit: `actual_files` vs declarations. Overlap →
   `failure_reason: "file-collision:<file> with <agent>"`, requeue later wave.
5. Append worker `log_entries` to the decision log; regenerate the digest.
6. Update checkpoint + state-of-play; emit `OUTCOME task=<id> score=<n>
   band=<range> model=<m> retries=<n> requeues=<n> needs_context=<n> unmet=<n>`
   as each task closes.
7. **Wave-boundary gate (deterministic — NOT judgment):** after wave W, if the
   wave's `is_batch_pause` is true (W in `pause_schedule`) AND a later wave
   remains, emit `GATE wave-boundary :: wave=W of K → STOP (batch_pause_every=N)`
   and run the MANDATORY STOP SEQUENCE — never dispatch wave W+1 past an
   unacknowledged boundary. Token pressure → same STOP SEQUENCE (judgment).
   Last wave closes → emit `PHASE execution end`. (references/stop-and-resume.md)

**User escalations:** relay question → broadcast answer to log; an answer that
invalidates a DONE task → re-run once, then set every reverse-`depends_on`
consumer to `stale_review`. **Worker failure/garbage/timeout:** flag +
continue the wave; audit and re-dispatch at the next batch checkpoint
(`requeued`, retry_count++). Hard retry cap 2 → STOP and surface.

## Phase 4 — Integration (worktrees only) · Trace: `PHASE integration`

Emit `PHASE integration start`. Merge worker branches; conflicts → resolver
subagent (Opus 4.8 medium) given BOTH tasks' specs/intents, not just the diff.
Record merge state in checkpoint; emit `PHASE integration end`.

## Phase 5 — Review (load subskills/orc-review-verify/, spawned) · Trace: `PHASE review`, `FINDING`

Emit `PHASE review start`. Superpowers path: its review skill incl. tests
(Sonnet 4.6 medium). OpenSpec/self path: review worker (Opus 4.8 high). Pass the resolved
`code_pattern` + its invariants + gate lines for the re-check
(pattern-gate.md); no resolved pattern → FIRST ask for one (paste/md/none).
FE tasks in run → pass `fe_rules[]` from `../orc-pattern/references/` fe-a11y
+ fe-perf. Findings arrive on the **P0–P3 ladder** (invariant violation or
unmet gate line = P0; every P0–P2 carries `file:line` + VERBATIM `quote`;
unanchored → P3). Apply hard rule 5 INCLUDING the quote spot-check: P0 →
auto-fix once · P1 → ask, then fix once · P2/P3 → record for Phase 7. Emit
`FINDING p0=<n> p1=<n> p2=<n> p3=<n>` on the return, then `PHASE review end`.

## Phase 5.5 — Security pass (opt-in) · Trace: `FINDING`

Only when config `security_review` is `on`/`ask` (default `off`) AND a task
scored **≥ 70** (reuses the risk floor). `ask` → one P0 prompt; `on` →
silent. Dispatch the reviewer with `phase=security` + changed files +
`references/security-checklist.md` (load only now). Same ladder, same
hard-rule-5 handling; report-only.

## Phase 6 — Verify: TDD gate + adversarial review (same subskill, phase=verify) · Trace: `PHASE verify`, `VERDICT`, `TDD-RED`/`TDD-GREEN`

Emit `PHASE verify start`. TWO halves in the SAME dispatched verifier slot
(subskills/orc-review-verify/ — Phase 5's reviewer stays separate):
**1) TDD gate (deterministic):** run the plan's TDD suite — green IS the
definition-of-done for non-exempt requirements; red → repair loop (implement→
test→repair, cap `tdd_loop_max`; cap hit → STOP SEQUENCE + honest red report).
**2) Adversarial review:** attack the green implementation — edge cases the
spec missed, error paths, contract violations, race/ordering, workflow breaks
(dead wiring, broken commands) — findings on the existing P0–P3 ladder. The
verifier also checks the intent-spec's
definition-of-done PLUS the pattern's `validation_gate[]` lines (each a
criterion; unmet = P0). The return carries `criteria[]` {criterion, pass|fail,
evidence} — every criterion needs evidence. Quote spot-check P0/P1 first, then:
P0 → auto-fix once → re-verify once → second failure STOPS; P1 → ask before the
one fix attempt, then re-verify (same single-retry cap). Emit
`VERDICT pass|fail :: <detail>`, then `PHASE verify end`.

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

## Phase 6.7 — Mock example + drift recovery (config `mock_example`) · Trace: `PHASE mock-example`, `DRIFT`

Load `../_shared/drift-recovery.md` (canonical). Only after a GREEN Phase 6,
before ship: `ask` (default) → the offer is MANDATORY (never silently skipped,
never silently run); `on` → build; `off` → skip. Deliverable:
`mock-examples/<change-slug>/` at the project root (`EXAMPLE.md` + one minimal
runnable artifact; mocked inputs only) — **NEVER committed**. After the user
runs it, ONE question: matches expectation? [yes / drift: <describe>]. On
drift → `DRIFT-FROM` handoff → analyze-mini gap analysis → mini planner patch
plan → scored dispatch → re-verify → re-offer; **hard cap 2 loops**, then an
honest unresolved report. Emit `DRIFT loop=<n>` per loop; end-of-phase packet.

## Phase 7 — Summary · Trace: `PHASE summary`

Emit `PHASE summary start`. Report: tasks/waves/dispatches (scores + overrides), escalations,
needs_context events, findings by severity (P0/P1 resolved; P2 itemized; P3
counted), verify result, authored tests when 6.5 ran, repo state + branch,
stale_review flags. Then ONE question: **"Apply the P2 fix-batch? The P3
cosmetics too?"** — never fix unasked. Emit `PHASE summary end`.

## Phase 8 — Ship (load subskills/orc-pr/SKILL.md) · Trace: `FINISH`

Show current branch. Ask together: **commit? push? create PR?** (PR: ticket +
title + target branch; generate from `subskills/orc-pr/pr.md`). If Phase 6.5 ran,
commit `test-generator/<change-slug>/` too (a user deliverable, never gitignored).
**`mock-examples/` is NEVER staged** (drift-recovery.md; no `.gitignore` edit —
just never `git add` it).
On success: delete the ephemeral decision log; KEEP checkpoint + dispatch log.
**Wiki stale-flag:** flag (never re-scan) wiki docs whose covered files this
run changed; point at `/orc-wiki`. **Post-ship refresh ask** (BIG runs, /orc +
/orc-ultra — the `wiki_refresh_ask_tasks`/`_files` triggers and full rules in
`../orc-wiki/references/staleness.md`): upgrade the passive note to **"Refresh
wiki now?"**; on "later" print the prominent stale warning and stamp
`wiki_refresh_declined` in the checkpoint. Then ALWAYS show the completion
usage report — /usage limits + the full dispatch log (model/effort/score per
subagent). The user must always know what the run cost. Finally emit
`FINISH :: <detail>` and delete `log_dir/.current`.
