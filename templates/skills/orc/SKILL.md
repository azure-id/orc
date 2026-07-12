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
5. **Severity drives the fix path (P0–P3 ladder).** P0 (objective breakage:
   failed build/tests/criteria, runtime errors, invariant violations) →
   auto-fix ONCE without asking; second failure → STOP and surface. P1
   (correctness/security risk, constraint violations) → gates ship, but ASK the
   user before dispatching the fix (judgment call, never silent). P2/P3 →
   advisory, never auto-fixed (offered in Phase 7). **Quote spot-check before
   acting on any P0/P1:** Read the finding's cited `file:line` and confirm its
   VERBATIM `quote` matches (exact or trivially moved). Mismatch or missing
   quote → treat the finding as P3 and tell the user the worker cited a line
   that doesn't match — never dispatch a fix (or block ship) on an unverified
   finding. This protects the ONLY path where ORC edits code without asking.
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
  - **Analyst-return gates are YOURS (deterministic, before any build option).**
    (1) Evidence spot-check: Glob every `files[]` path in the spec +
    Grep-verify the quoted snippet on every `status: exists|conflict` entry;
    (2) derivation lint: R# ids, statuses, and context-anchor set must match
    between report.md and requirement-spec.md. Any miss → bounce to the analyst
    with the miss list (one retry, then escalate). Refuse take-into-build when
    the spec has open `UNVERIFIED` or lacks `scope_closed: true`. Emit `GATE`
    trace lines (pass|bounce) when logging.
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
  Mini lane → orc-analyze-mini / orc-planner-mini / orc-executor-sonnet-5-high.

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
single run. Apply these in Phase 0 (analyst depth gate + scout cap; test-authoring
opt-in), Phase 2 (batch-pause) and Phase 3 (wave cap). It also provides
`generate_tests` (default `false` — the opt-in Phase 6.5 gate) and `logging`
(default `false`) + `log_dir` (default `.claude/orc/logs`) — see the
behavior-trace section below. And `pattern_findings` (default `ask`) — the
code-pattern gate applied at Phase 3 dispatch (see the code-pattern section) —
and `security_review` (default `off`; `ask`/`on` enable the opt-in Phase 5.5
security pass on runs containing a task scored ≥ 70).

## Behavior trace (opt-in — only when config `logging: true`)

Default OFF. When `logging: true`, follow `references/trace-protocol.md` and
record the run's behavior to a persistent `.txt` under `log_dir` — for post-hoc
skill improvement, separate from the decision log and NEVER deleted. When
`logging: false`, do NONE of this.

- **Run start:** create `log_dir`, write `log_dir/.current` =
  `<run-slug>-<DDMMYY>.txt`, and store `logging_enabled: true` + `trace_path` in
  the checkpoint so a resumed run re-anchors. Emit a `PHASE` line at each phase
  transition. (The `orc-trace.js` hook independently writes `SPAWN`/`RETURN`
  skeleton lines, immune to compaction.)
- **Every dispatch:** announce the model to the user, derived from the agent
  NAME (e.g. "→ claude-opus-4-7 / high"), and emit `SCORE …` + `DISPATCH <agent>
  :: <task> expect=<model>/<effort>`. Derive the model from the NAME — never pass
  the coarse `sonnet|opus|haiku` dispatch arg (it can't express 4-7 vs 4-8 and
  would override the frontmatter pin).
- **Every return:** read the worker's `actual_model` + `actual_effort`, compare
  to the expected (name→model table in `config.md`), and emit `VERIFY <task>
  actual=…/… ✅ MATCH` or `⛔ DOWNGRADE expected=…`. **Surface a downgrade to the
  user** — it means the main tier capped a pin (the "wrong model" bug). Fold any
  worker `QUESTION` / `CONTEXT-GAP` markers in as well.
- **Every task close** (final validated return — done, or terminally
  failed/escalated): emit `OUTCOME task=… score=… band=… model=… retries=…
  requeues=… needs_context=… unmet=…` — one line linking the scoring band to
  what the task actually took. This is the raw material `/orc-retro` mines to
  calibrate the rubric; without it a trace shows dispatches but not costs.
- **Review/verify:** emit `FINDING p0=n p1=n p2=n p3=n` and `VERDICT pass|fail`.
- **Run end (Phase 8 or abort):** emit `FINISH …` and delete `log_dir/.current`.

## Code-pattern findings (executors match the project's house style)

So executors write code that matches the EXISTING codebase (not a generic
template), the run resolves a per-language code-pattern at dispatch. A generic
playbook is reconciled against the project's real files: **conventions defer to
the project; security/correctness invariants are always enforced.** See the
`orc-pattern` sibling skill; the codifier is `orc-pattern-codifier-sonnet-5-high`.

- **Cache:** `.claude/orc/patterns/<lang>-pattern.md` (project `.claude/`, one per
  language, reused across runs, refreshed only on drift or `/orc-pattern --refresh`).
- **Gate (config `pattern_findings`, default `ask`):** applied at Phase 3 on an
  FE/BE **cache miss**. `ask` → P0 prompt (learn via `orc-pattern`, or go
  agnostic); `on` → auto-codify; `off` → always agnostic. A cache **hit** is used
  silently. Batch the ask ONCE per run across all missing languages.
- **Agnostic fallback** (declined/off, or no playbook for the language): no
  codifier, no scan — the executor enforces the universal invariants and imitates
  the neighbor files it already reads. ~Zero added cost.
- **Anti-skip (3 layers):** (1) the resolved conventions + blocking invariants are
  INJECTED LITERALLY into each executor's task slice (`pattern` field) — never a
  file pointer; (2) the executor return echoes `pattern_version` + `invariants_checked`
  (validated like `actual_model`); (3) the Reviewer re-checks the invariants against
  the diff. With `logging: true`, record the applied `pattern_version`.

## Sibling skills (separate top-level skills, own slash commands)

- `orc-mini` — fast path: one Sonnet 5 high subagent, skips
  review/verify/summary. Shares this skill's run folder + schemas; switchable
  to full flow mid-run.
- `orc-verify` — standalone; verifies only git-modified changes,
  Opus 4.8 high, read-only. Runs without this orchestrator.
- `orc-retro` — mines the behavior traces (`logging: true` runs) into a
  calibration report: per-band outcomes, downgrades, pipeline leaks.
  Read-only/report-only; it never edits the rubric — a human applies its
  recommendations. The `OUTCOME` trace marker is its raw material.

## Constellation map (load on demand only)

- Phase 0 → `references/intake.md`
- Phase 2 → `references/effort-and-mode.md` (mode gate + task scoring rubric)
- Phase 3 → `references/wave-grouping.md` + `references/log-protocol.md`
  + `references/house-rules.md` (the standing behavioral card injected into
    every executor slice — read once per run)
  - workers → `subskills/orc-execution/` (always spawned; subagent wrapper)
  - code-pattern (FE/BE) → `../orc-pattern/SKILL.md` (dispatch the codifier on a
    cache miss per config `pattern_findings`; inject the resolved pattern into slices)
  - stops → `subskills/orc-checkpoint/SKILL.md` + `references/stop-and-resume.md`
- Phase 5–6 → `subskills/orc-review-verify/` (always spawned; subagent wrapper)
  - FE tasks in run → `../orc-pattern/references/fe-a11y.md` + `fe-perf.md`
    (rule packs passed to the reviewer as `fe_rules[]`)
- Phase 5.5 (opt-in, `security_review`) → `references/security-checklist.md`
- Phase 6.5 (opt-in) → `subskills/orc-testgen/` (spawned; only when `generate_tests`)
- Phase 8 → `subskills/orc-pr/SKILL.md` (template: `subskills/orc-pr/pr.md`)
- Schemas (you own; pass slices only): `schemas/intent-spec.md`,
  `schemas/planning-output.md`, `schemas/checkpoint.md`
- `logging: true` → `references/trace-protocol.md` (behavior trace; else skip)
- Worked example (orient only — never execute from it) → `examples/full-run-mock.md`
  (annotated dry run of a full pipeline, Phase 0 → ship)

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
(`schemas/intent-spec.md`) → **repo cross-check the draft** (intake Step 3.5:
Glob/Grep-confirm every file/module/behavior the spec names, or tag it
`UNVERIFIED`; tags become ONE batched sign-off question; >3 tags → recommend
`orc-analyze` instead) → ask sign-off preference (gate/soft; DEFAULT GATE)
→ show spec → approval or edits. **No planning until approved (gate mode) and
no unresolved `UNVERIFIED` tags either way.**

The intent-spec's definition-of-done becomes Phase 6's acceptance criteria.
Its constraints become hard rules in every worker slice — and at slice-assembly
time each task's `spec_invariants[]` (the analyst's do-not-build invariants the
planner copied onto the task) is appended VERBATIM to that slice's
`constraints[]`, so an invariant that reached the plan demonstrably reaches the
executor.

Also offer the opt-in **Test Authoring** (Phase 6.5) in the sign-off round —
default from `config.generate_tests`; the run confirms. If on, note it now so the
touched flows are captured for the test matrix later. ORC will WRITE test cases
before ship, never run them (the user tests manually).

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
about task breakdown/approach. **Staleness valve:** if the spec's `git_head` ≠
current HEAD (analysis and build in different sessions), re-run the analyst
evidence spot-check (paths + quotes) BEFORE dispatching the planner; on misses
offer re-analyze vs proceed-with-flagged. Dispatch the planner as a subagent
(Opus 4.8 medium) — never plan yourself.

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
schema: every task with `declared_files` (incl. tests), `grounding[]` (per-file
`exists|new` attestation with evidence), `acceptance[]` (sliced, source-cited
definition-of-done lines), `requirements[]` (the R#/DoD ids it implements),
`spec_invariants[]` (verbatim do-not-build lines), `depends_on`, `owns_area`,
`spec_ref` — plus a `coverage: {requirements, tasks, orphans}` echo. If the
planner doesn't emit declared files, extract and confirm them before leaving
this phase.

**Phase 1 exit gate (deterministic, before scoring — emit a `GATE` trace line
per check when logging).**
1. **Grounding spot-check:** Glob every path the plan marks `disposition:
   exists`. A task whose declared paths lack `grounding[]` entries counts as a
   miss.
2. **Coverage check:** recompute the planner's coverage echo — every in-scope
   spec R# / intent-spec DoD line must appear in ≥1 task's `requirements[]`;
   an orphan requirement is a miss (the user may explicitly descope instead).
3. **Graph checks:** cycle detection over `depends_on` + same-file collision
   over `declared_files` (two tasks sharing a file need a serializing dep or a
   merge). Both trivial at ≤20 tasks — never trust the planner's self-check
   alone.
Any miss → the plan is malformed: bounce it back to the planner WITH the miss
list (one retry), then escalate to the user. Exception: a pre-v0.7.0 plan
resumed from an old checkpoint has no `grounding[]` (pre-v0.9.0: no
`requirements[]`/`spec_invariants[]`) — resume it without the missing checks,
never bounce an old plan.

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

**Tag each task's code-pattern domain+language** while you score (from its
`declared_files` extensions + repo deps; see `../orc-pattern/references/INDEX.md`):
`{domain: FE|BE|null, lang: react|nextjs|vue|fastapi|nestjs|go|…|null}`. This drives
the Phase 3 pattern-resolve gate. Tasks with no FE/BE language need no pattern.

Ask: "Any anticipated escalations or changes, or run straight through?"

## Phase 3 — Execution (load wave-grouping.md + log-protocol.md)

Build conflict graph from `declared_files` → group waves → write checkpoint +
state-of-play BEFORE dispatching.

**Pattern-resolve gate (once, before the first wave — FE/BE tasks only).** For the
distinct languages tagged in Phase 2, resolve each against
`.claude/orc/patterns/<lang>-pattern.md`:
- **Cache hit, no drift** → use it silently (no ask, no cost).
- **Cache miss** → apply config `pattern_findings`: `ask` → P0 prompt, batched ONCE
  for ALL missing langs ("Learn conventions for {…} via orc-pattern, or proceed
  language-agnostic?"); `on` → codify without asking; `off` → agnostic.
- **On "learn"/`on`** → dispatch `orc-pattern-codifier-sonnet-5-high` per missing
  lang (slice per `../orc-pattern/SKILL.md` Phase 1), then write the returned
  pattern to the cache. **On "no"/`off`/no-playbook** → agnostic (invariants only).
Hold the resolved pattern per language in run state (survives checkpoint/resume) so
you inject it into each task's slice below and reuse it at Phase 5.

Per wave:
1. Dispatch EVERY task as a spawned subagent via the Task tool, with the
   subagent wrapper framing + the task's INPUT SLICE (see orc-execution/core.md
   contract) + its scored model/effort. EVERY slice carries the task's
   `acceptance[]` (from the plan — the sliced definition-of-done lines the
   executor self-checks against) and `house_rules`: the
   card lines from `references/house-rules.md` (between its card markers),
   injected LITERALLY — read the file once per run, never pass a pointer. For an
   FE/BE task, INJECT the resolved
   `pattern` (conventions to MATCH + blocking invariants + the enforceable
   `validation_gate[]` lines) LITERALLY into its slice
   — never a file pointer; agnostic tasks get the universal invariants only. You
   never do the task yourself, regardless of size (hard rule 1). Sequential style =
   one spawn at a time; parallel style = the wave's spawns together.
2. Workers emit milestone progress pings; record them (they bound what a
   mid-wave stop can save).
3. Collect returns; VALIDATE each against the contract. `needs_context` →
   adjudicate (in-scope for its area?) → re-slice and resume, or treat as a
   planning correction. Cap 2 per task, then escalate to user. For a task that was
   given a `pattern`, require `invariants_checked: true` + a `pattern_version`
   matching what you injected — a missing/false attestation is a malformed return
   (requeue). With `logging: true`, record the applied `pattern_version`.
   **Evidence check:** `status=done` on a project with a runnable build/test
   REQUIRES `evidence` {command, exit_code, tail} — you detected the stack at
   intake, so you KNOW whether a runner exists; a missing evidence block or a
   false `no_runner_detected` is a malformed return (requeue). `status=done`
   with a non-empty `unmet[]` is malformed too — a return that admits unmet
   acceptance lines is `partial`, handled like any partial.
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
OpenSpec/self path: review worker (Opus 4.8, high). If this run resolved a
code-pattern (from the Phase 3 gate), pass it as `code_pattern` AND pass its
blocking `invariants[]` + enforceable `validation_gate[]` lines for the re-check
— don't re-ask. Otherwise FIRST ask for a
code pattern (paste text / md / none). **FE rule packs:** if any task in the run
was tagged FE, read `../orc-pattern/references/fe-a11y.md` + `fe-perf.md` and
pass their rules as `fe_rules[]` (reviewer emits file:line findings, P1–P3 by
impact, never auto-P0). Findings come back on the **P0–P3
ladder**; an invariant violation or unmet gate line is P0. Every P0–P2 finding
carries `file:line` + a VERBATIM `quote` (the worker downgrades unanchored
findings to P3 itself — if one slips through, downgrade it here). Apply hard
rule 5 INCLUDING the quote spot-check: Read each P0/P1's cited line first; then
P0 → auto-fix once
(no ask) · P1 → ask the user, then fix once · P2/P3 → record for Phase 7.

## Phase 5.5 — Security pass (opt-in; config `security_review`)

Runs ONLY when config `security_review` is `on`/`ask` (default `off`) AND at
least one task in the run scored **≥ 70** (the risk floor already marks
security/money/migration/auth work — the trigger reuses that signal, computing
nothing new). `ask` → one P0 prompt after review ("High-risk tasks in this run —
run the security pass?"); `on` → dispatch without asking; `off` → skip silently.

Dispatch the reviewer (`orc-reviewer-opus-4-8-high`) with `phase=security` and a
slice: the run's changed files + the checklist from
`references/security-checklist.md` (load only now). Findings land on the same
P0–P3 ladder and follow the same hard-rule-5 handling. Report-only worker;
never gates on advisory levels.

## Phase 6 — Verify (same subskill, phase=verify)

Verify worker (Opus 4.8, high) checks against the intent-spec's
**definition-of-done** as acceptance criteria PLUS the resolved pattern's
enforceable `validation_gate[]` lines (pass them in the slice — each line is a
criterion; an unmet line is P0). The return carries per-criterion `criteria[]`
{criterion, pass|fail, evidence} — validate that every criterion has evidence
(a test/output line or file:line), and apply the hard-rule-5 quote spot-check
to P0/P1 findings before any fix. P0 findings → auto-fix once
→ re-verify once → second failure STOPS. P1 findings → ask before the one
fix attempt, then re-verify (same single-retry cap).

## Phase 6.5 — Test Authoring (opt-in; load subskills/orc-testgen/)

Only when `config.generate_tests` is on for this run (default OFF; confirmed at
intake). ORC **writes** test cases as a deliverable and **runs nothing** — the
user tests manually; this phase never gates the ship.

Dispatch `orc-test-author-opus-4-8-high` (spawned subagent) with a slice: the
run's `actual_files` (changed surface), the intent-spec's definition-of-done
(acceptance criteria), the touched flows, constraints, and the detected stack
(incl. whether it exposes an HTTP API). It returns automated test files + a
manual `TEST-PLAN.md` (with the exact CLI run command AND a separate "exercise
the real running service" section) + a Postman-importable `test-cases.http` curl
bundle for HTTP APIs. Validate the return; relay what was authored (files, plan,
curl, run command, advisory notes). Then continue to Phase 7. The full lane runs
this as Phase 6.5; orc-mini also offers the same test-authoring dispatch as an
opt-in end-of-run ask (on a GREEN smoke gate) — orc-mini still skips full
review/verify.

## Phase 7 — Summary

Report: tasks/waves/dispatches (with scores + any overrides), escalations,
needs_context events, review findings by severity (P0/P1 resolved during
review/verify; P2 itemized; P3 counted), verify result, **authored test cases
(files + TEST-PLAN.md + curl bundle + run command) when Phase 6.5 ran**, repo
state + branch, stale_review flags. Then ask: **"Apply the P2 fix-batch?
The P3 cosmetics too?"** (one question, both levels — never fix unasked).

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
