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

You are the **orchestrator**: **Opus 4.8 high — or Opus 5 / Fable 5 at medium+**
(never downgrade yourself). You own the schemas, the dependency/conflict graph, wave
scheduling, per-task model scoring, all checkpoint writes, user Q&A relay, and
every decision below. Workers stay dumb and isolated.

This file is a THIN SPINE. Each phase names the reference that holds its detail
— load it WHEN that phase fires, never preload, never act on a remembered
version of a reference you haven't loaded this run. Detect the stack from the repo — never ask what the repo can tell you.

## Preflight gate (before Phase 0 — do this FIRST)

Confirm you are **Opus 4.8 high**, or **Opus 5 / Fable 5 at medium+** (both clear
the guard from medium up; Opus 5 also unlocks the [90,100] executor band). Effort
is hard-blocked by the `orc-effort-guard.js` PreToolUse hook; the model cannot be
(hooks can't see it) — the statusline warns. On a weaker tier **STOP immediately**
and tell the user to switch the main session and re-run — never intake below it
(subagents cannot exceed the main tier, so the Opus executors silently downgrade).

The SHAPE of these steps — the order, and the four rules that make it worth
having — is `../_shared/phases/preflight.md` (`core` + `full`). The probes
themselves are this lane's own and stay here.

## Hard rules (never violate)

1. **You NEVER implement. You coordinate.** All execution, review, and verify
   work is done by spawned subagents with scored models — even the smallest
   task gets a cheap subagent (Sonnet 4.6 medium), never you.
2. **Disk is truth; conversation is a cache.** On any resume or suspected
   compaction: re-read `state-of-play.md` then the checkpoint BEFORE acting.
3. **All run artifacts go in `.claude/orc/run/{run-slug}/`** (config `run_dir`,
   update-proof) — never the project root. Create it FIRST, before any write.
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
13. **Every read-heavy slice carries the read ladder** (`_shared/read-ladder.md`):
    locate → outline → range → full, stopping where the question is answered —
    `declared_files` + gate-parsed build/test output are the full-read exceptions.

## Dispatched roles (you never do this work yourself)

**Analyst** `orc-analyze` (Opus 5 high): doc OR bare request →
scope-bounded, code-grounded report + spec; standard or opt-in DEEP (scouts).
**Context-combiner** (Opus 5 high): merges 2+ related confirmed analyses
into ONE combined spec; build only on `handoff_ready` with `coverage_pct` =
100; full lane only. **Planner** `subskills/orc-planner` (Opus 5 medium):
request or spec → planning-output. Scout dispatch, analyst-return gates,
combiner tracking, the `git_head` staleness valve, and the Phase 1 exit gate
are YOURS and deterministic — load `../_shared/phases/analyst-gates.md` at their
trigger points; emit `GATE` trace lines.

## Dispatch via named agents (not prose)

**`orc run inflight` before ANY re-dispatch** (0 clear · 1 in-flight · 2 unknown).
A Task error does not kill the agent behind it, and exit 2 REFUSES by default —
`a lane that re-dispatches over a live attempt` has broken the contract. Canonical: `_shared/return-validation.md` §0.

Workers are model-pinned SUBAGENTS in `.claude/agents/` — the model is enforced,
not requested in prose. Score every task from the planner-emitted `facets` via
the fixed arithmetic formula and SHOW the table with the facet vector + the
arithmetic (`B+N+L+T+fan+U = raw`; an un-shown number is not scored); map the
final score via the RESOLVED table in `config.md` — `opus5_only` (2-band Opus-5-only, FORCING) > `rubric_bands_override` > the default 6-band (`rubric_bands` = granularity only, never a preset); NAME it when you show scores; sibling tasks differing in ≤1 facet share a
band or cite the differing facet (see `references/effort-and-mode.md`). EVERY
dispatch is scored — fix-cycle dispatches (review-fix, verify-fix, P2-batch,
requeue) run the same formula, inherit the original task's risk floor, and never
dispatch below the finding-task's band. Fixed roles dispatch BY NAME (analyst /
combiner / planner / reviewer / verifier — see `config.md`'s fixed-role table +
`.claude/agents/MODEL-MAPPING.md`). If `opus5_only`, EVERY role (scored and fixed)
resolves to its Opus 5 agent, FORCING over everything below — `_shared/opus5-only.md`.
Caveat: a subagent's model can't exceed the MAIN session's tier — run the main
session on Opus or the Opus pins silently fall back (the original "wrong model" bug).

## Config (read at run start)

**ONE resolver, and it is not you:** `orc lane config orc --json`. Obey
`effective`, print every line in `announce[]` VERBATIM at preflight, and honour
`stops[]` before wave 1. Never re-derive a value, a precedence or an inertness
from `.claude/orc.config.yaml` — a key this lane does not read is not in the
answer, and a key another key shadows comes back already marked. Exit ≠ 0 → say
the CLI is unavailable and fall back to `../_shared/config-precedence.md`'s
documented defaults, out loud. Priorities and families:
`../_shared/config-precedence.md`.

## Calls

**ONE catalogue, and it is not you:** `orc lane calls orc --json` names every
CLI call this lane makes, each with its exit-code contract, its cost, when to run
it, and what an EMPTY answer means. Never invent a spelling, never re-word an
exit code, and never re-derive a state word — the CLI's state words are the only
state words, and **an exit code is an ANSWER wherever that contract says so, not
a failure**. A call the answer does not name is a call this lane does not make.
Exit ≠ 0 from the catalogue itself → say the CLI is unavailable and name the
command you are about to run, out loud, before running it.

## Behavior trace (PERMANENT — always on, no config toggle)

Follow `../_shared/phases/trace.md` (ALWAYS load it at run start). The
`orc-trace.js` hook writes the `SPAWN`/`RETURN`/`PHASE-EDGE` skeleton
deterministically; the rich narrative is **dispatched, never remembered** — every
`emit <VERB>` step below means RECORD that event, with its REAL timestamp, into
the current **phase packet**; you never append a trace line yourself. Run start:
create `log_dir`, write `log_dir/.current` = `run-orc-<slug>-<DDMMYY>-<HHMMSS>.txt`
AND `touch the trace file` of that name in the SAME step; store `trace_path`.
**Under `ultra_mode` the lane segment is `ultra`, not `orc`** (`run-ultra-<slug>-…`)
— the filename IS the per-lane data, so an ultra run named `orc` is counted as a
plain `/orc` run forever, hiding the costliest lane in every usage report.
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

## Extra — a band that executes OFF Claude (config `extra_enabled`, default false)

Canonical: `../_shared/extra-dispatch.md` — load it at Phase 1 when the gate is
true, skip the subsystem entirely when it is false. You stay Claude; only **who
executes a slice** changes. `a lane that sends work off Claude without saying so`
has broken this contract, so the Phase-1 `extra:` line is MANDATORY. **ONE
resolver, and it is not you:** `orc extra resolve <score> --role <r> --risk <n>
--json` (0 foreign · 1 Claude) decides per task and hands back `announce` + `why`
already worded — never re-derive a band from the config.

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
material) · `orc-advisor`/`orc-judge` (ultra-lane, only under ultra_mode) ·
**`orc-pr-setup`/`orc-pr-driver`** (stacked PRs — the Phase 8 gate hands off to
them; they are never dispatched as subagents).

## Constellation map (load on demand only)

- Run start → `../_shared/phases/trace.md` (always)
- Phase 0 → `../_shared/phases/intake.md`; **plan input → `../_shared/phases/plan-handoff.md`**;
  ultra_mode → `references/ultra-mode.md`
- Phase 0/1 analyst-planner gates → `../_shared/phases/analyst-gates.md`
- Phase 1 wiki grounding → `../_shared/phases/wiki-consult.md` + `references/preflight-report.md`
- Phase 2 → `references/effort-and-mode.md`; tagging → `references/pattern-gate.md`
- Phase 3 → `../_shared/phases/wave-grouping.md` + `log-protocol.md` + `../_shared/phases/house-rules.md`
  + `pattern-gate.md` (resolve gate); workers → `subskills/orc-execution/`;
  stops → `subskills/orc-checkpoint/SKILL.md` + `../_shared/phases/stop-resume.md`
- Phase 5–6 → `subskills/orc-review-verify/`; FE tasks →
  `../orc-pattern/references/fe-a11y.md` + `fe-perf.md` (as `fe_rules[]`)
- Phase 5.5 → `../_shared/phases/security-checklist.md`; 6.5 → `subskills/orc-testgen/`
- Phase 8 → `subskills/orc-pr/SKILL.md` (template `subskills/orc-pr/pr.md`);
  stack gate → `subskills/orc-pr/stack-gate.md` + `_shared/pr-templates.md`
- Schemas (you own; pass slices only): `schemas/intent-spec.md`,
  `schemas/planning-output.md`, `schemas/checkpoint.md`
- Worked example (orient only — never execute from it) → `examples/full-run-mock.md`

---

## Phases

`orc lane phases orc --json` **is** the pipeline — the CLI owns the list and
its order, and this table is the human index of it. Never derive the order
from these filenames; a second idea of the pipeline is the drift the manifest
exists to prevent.

**Read a row when its phase fires, not on activation.** Every row is
`on-phase` — this spine deliberately carries no `always` phase pointer. **Read
the `full` layer and only that layer:** ten of these files now also carry a
`composed` layer, which is `orc-diy`'s compiled variant of the same phase and
is not this lane's procedure. `orc lane phases orc --json` names the layer for
each row.

W13 gave those ten a second reader (`orc-diy`), so they moved to
`_shared/phases/`. Intake and Integration have one consumer each and stay home
— a file with one consumer stays home. W14 (`orc-mini`/`orc-fast`) is what adds
a `trim` layer beside the `full` one.

| # | Phase | File | Read | Trace |
|---|-------|------|------|-------|
| 0 | Intake | `references/phases/intake.md` | `full` | `PHASE intake` |
| 1 | Planning | `../_shared/phases/planning.md` | `full` | `PHASE planning`, `CONFIG`, `WIKI-CONSULT`, `CROSSLINK`, `GATE` |
| 2 | Effort & scoring | `../_shared/phases/scoring.md` | `full` | `PHASE scoring`, `SCORE` |
| 3 | Execution | `../_shared/phases/execution.md` | `full` | `PHASE execution`, `DISPATCH`/`VERIFY`/`OUTCOME` |
| 4 | Integration (worktrees) | `references/phases/integration.md` | `full` | `PHASE integration` |
| 5 | Review | `../_shared/phases/review.md` | `full` | `PHASE review`, `FINDING` |
| 5.5 | Security pass (opt-in) | `../_shared/phases/security.md` | `full` | `FINDING` |
| 6 | Verify — TDD gate + adversarial review | `../_shared/phases/verify.md` | `full` | `PHASE verify`, `VERDICT`, `TDD-RED`/`TDD-GREEN` |
| 6.5 | Test authoring (opt-in) | `../_shared/phases/testgen.md` | `full` | `DISPATCH`/`VERIFY` |
| 6.7 | Mock example + drift recovery | `../_shared/phases/mock-example.md` | `full` | `PHASE mock-example`, `DRIFT` |
| 7 | Summary | `../_shared/phases/summary.md` | `full` | `PHASE summary` |
| 8 | Ship | `../_shared/phases/ship.md` | `full` | `PHASE ship`, `FINISH` |

Phase 4 runs only in worktree mode. Phases 5.5, 6.5 and 6.7 are opt-in and
their config key is resolved by `orc lane config orc --json`, never read raw.

## Waiting mid-run (`/orc-wait`)

Canonical: `../_shared/wait.md`. **`a lane that waits without a hand-back` has broken this contract.**
Checkpoint **full** · safe point **wave or phase edge**. `soft` FORCES that checkpoint and does NOT stop if the write fails; `hard` skips it and can lose an in-flight return. Never begin a wait between a dispatch and its validated return, or before the smoke gate has reported.
