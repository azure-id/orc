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
differences below. Load the main skill's references and schemas by path — the
HOT-PATH essentials (dispatch names, return-contract fields, artifact path)
are inlined here so nothing is reconstructed from "full minus deltas."

Run as **Opus 4.8 high** (unchanged from full; never downgrade yourself).
**You never implement — you spawn.** The one exception is the **smoke gate**:
a read-only build+test run, not implementation — you still never write code.

**Worked example** (orient only — never execute from it): `examples/mini-run-mock.md`.

## Differences from the full orchestrator

1. **Skip full Phase 5 (Review), Phase 6 (Verify), and Phase 7 (Summary).**
   Instead: the **smoke gate** after execution, then the opt-in
   **test-authoring ask**, then ship.
2. **Implementation is ONE subagent, Sonnet 5, high effort.** No waves. **No
   scoring table** — replace it with a **one-line complexity read** (mini-ok?
   or recommend switching to full); log that line, never render the matrix.
3. **No dispatch-style and no batch-pause questions** — a single subagent
   makes both meaningless; never ask them.
4. **Lighter intake.** Ask only the **Always + medium tier** (Q1–Q4 in
   `../orc/references/intake.md`); skip the high tier (Q5/Q6). Run the Step
   3.5 repo cross-check at NAMES-ONLY depth (Glob/Grep-confirm what the draft
   names, tag the rest `UNVERIFIED`, resolve tags in the sign-off line; >3
   tags → recommend the full flow or `orc-analyze`). Sign-off **defaults to
   SOFT**, not GATE.
5. **Still write tests** if the project has a test setup (the executor
   creates/updates them in its task).
6. **Everything else is identical:** run folder + intent-spec, planning,
   checkpoint/state-of-play, stop sequence, usage reminder, ship flow.

## Mini flow (the phase set)

```
Phase 0  intake (Q1–Q4, soft sign-off) + run folder + intent-spec
Phase 1  planning (dispatch orc-planner-mini; analyst first only on real docs)
         → one-line complexity read (mini-ok? or recommend switch-to-full)
Phase 3  dispatch ONE executor (orc-executor-sonnet-5-high) — slice carries
         the standing `house_rules` card (../orc/references/house-rules.md,
         injected literally) + the cached `postgres` pattern on a data-access
         task (cache HIT only) — collect + validate return
Phase M  SMOKE GATE — run build+test → GREEN proceed · RED block ship + surface
Phase T  TEST-AUTHORING ASK (opt-in) — offer to write test cases (never run them)
Phase 8  ship (commit / push / PR)
```
(No Phase 2 scoring table, no dispatch-style/batch-pause asks, no full
review/verify/summary.)

**Postgres query grounding.** On a Postgres project, if the task touches the
data-access layer AND `orc pattern status postgres` reports cached (the
deterministic probe in `../_shared/detecting-artifacts.md`, never an ad-hoc
`find` for `.claude/orc/patterns/postgres-pattern.md`), inject it LITERALLY into
the slice (conventions + blocking query invariants).
Cache MISS → skip — mini never codifies (that's the full lane /
`/orc-pattern`); universal invariants + neighbor imitation still cover it.

## Phase M — Smoke gate (build + test; blocks ship on red)

After the executor return validates (`../_shared/return-validation.md` —
including `done` with non-empty `unmet[]` = partial), YOU run the smoke gate
per `../_shared/smoke-gate.md`: read-only build+test. **GREEN** →
test-authoring ask, then ship. **RED** → never offer commit/ship; one repair
re-dispatch, second red → STOP and surface. Docs-only → gate N/A, say so.

## Phase T — Test-authoring ask (opt-in; writes tests, never runs them)

Same opt-in as full Phase 6.5 — mini **only asks** (never gates the ship).
Default from `config.generate_tests`; at the end of a GREEN run ask: *"Write
test cases for these changes? (I'll author them — automated files +
TEST-PLAN.md + a curl bundle for HTTP APIs — but never run them; you test
manually.)"* Yes → dispatch `orc-test-author-opus-4-8-high` (subskill
`../orc/subskills/orc-testgen/`) with the run's `actual_files`,
definition-of-done, touched flows, constraints, stack; the two manual
deliverables land in **`test-generator/<change-slug>/` at the project root**.
Validate the returned `test_plan_path`/`curl_bundle_path` are under that folder
(else malformed → re-dispatch); relay + state the exact path (committed on ship,
not gitignored). No → ship. Either way this NEVER runs tests.

## Behavior trace (PERMANENT — same rule as full; always on)

Mini does NOT drop the trace. Follow `../orc/references/trace-protocol.md`
(load at run start) for mini's phase set: run start create `log_dir` + write
`.current` + store `trace_path` in the checkpoint; append the lines AS THE RUN
GOES — each phase's `PHASE` line BEFORE announcing it, `DISPATCH` per spawn,
`VERIFY` per return (`actual_model`/`actual_effort` vs expected — surface any
⛔ DOWNGRADE), `OUTCOME … band=mini` per task close, `VERDICT pass|fail` at the
smoke gate. A phase with zero new trace lines is a protocol violation — go
append them now. Run end: `FINISH …`, delete `log_dir/.current`. (The hook
bootstraps `.current` on the first dispatch, so the skeleton is never lost.)

## Complexity read (replaces the scoring table)

ONE judgment before dispatch: is this genuinely mini-sized (single coherent
area, low interdependency, low blast radius)? State it in one line and log it.
Complex/high-risk (many interdependencies, core/shared surface,
security-sensitive) → **recommend switching to full** — let the user choose.

## Fallback intake (arriving from orc-fast)

orc-fast falls back HERE whenever its prerequisites fail — never by stopping
the chat. Follow the reader side of `../_shared/fallback-handoff.md`: the
`FALLBACK-FROM` block in the shared run folder names the reason; acknowledge
it in one line, skip re-deriving whatever is carried, reuse the run folder.

## Switching to full flow mid-run

On "switch to full" (or when the complexity read / a mid-run surprise clearly
needs review/verify): the run folder, checkpoint, and intent-spec already live
in the shared `../orc/run/{run-slug}/` format, so the full flow resumes from
the current checkpoint and adds the phases mini skipped. Record the switch in
the decision log.

## Dispatch via named agents (canonical name-map — dispatch BY these names)

Models pinned in `.claude/agents/`; look up here, never reconstruct a name
(agent = skill-name + model-effort suffix). See `.claude/agents/MODEL-MAPPING.md`.

| Role | Agent (dispatch this) | Model / effort |
|------|-----------------------|----------------|
| mini analysis (docs only) | `orc-analyze-mini-sonnet-5-high` | claude-sonnet-5 / high |
| mini planning | `orc-planner-mini-sonnet-5-high` | claude-sonnet-5 / high |
| mini execution | `orc-executor-sonnet-5-high` | claude-sonnet-5 / high |
| test authoring (opt-in) | `orc-test-author-opus-4-8-high` | claude-opus-4-8 / high |

## Config

Resolve at run start: `../orc/config.md` defaults merged with
`.claude/orc.config.yaml` — read `generate_tests` (the Phase T offer default)
and `log_dir`. Wave/scoring/scout keys never apply to mini — never render or
ask them.

## Analyst & planner (mini lane)

orc-mini dispatches the FAST variants (Sonnet 5 high): `orc-analyze-mini` and
`orc-planner-mini` — same artifacts and output contracts as full, trimmed
depth. The mini analyst is **doc-optional**: on real doc input it runs first,
then the mini planner; on a merely ambiguous request, prefer one inline
clarifying question over a cold analyst spawn. Always single-pass — **no deep
mode, no scouts**; it escalates to `/orc-analyze` deep on its concrete
thresholds and the user chooses. You never analyze or plan yourself.

**Mini-lane gates (yours, deterministic — same as full; full detail in
`../orc/references/analyst-gates.md`; emit `GATE` trace lines).** On
mini-analyst return: evidence spot-check + derivation lint; refuse
take-into-build on open `UNVERIFIED`/missing `scope_closed`; `git_head` ≠
HEAD at plan time → re-run the spot-check first. On mini-planner return: Glob
every `disposition: exists` path, recompute coverage (no orphan
requirements), cycle + collision checks. Any miss → bounce (one retry, then
escalate). At dispatch, append the task's `spec_invariants` to the slice's
`constraints[]` verbatim.

## Wiki consult (if present)

Same rule as the full skill — load `../orc/references/wiki-consult.md` at the
planning/complexity-read step: compute the FRESH / AGING / STALE tier from
`.claude/orc/wiki-meta.json`, pull the relevant pages (incl. cross-cutting
maps like `orc-reference-api-surface` when their domain applies), apply
`code > fresh wiki > stale wiki (hints) > model priors`, and **emit
`WIKI-CONSULT <tier> :: docs=<pages pulled>`**. Crosslink: a task touching a
boundary in `.claude/orc/crosslink/needs.json` gets the cached contract
injected per that reference — advisory, never blocking. Mini never generates
the wiki; after a code-changing run apply the passive stale-flag note only
(the post-ship refresh ASK is full-lane/ultra behavior).

## Shared artifacts

Writes to the SAME location as the full skill
(`.claude/skills/orc/run/{run-slug}/`) — a switch needs no migration.

## What mini still enforces (from the main hard rules)

Never implement yourself (the smoke gate is read-only, not implementation) ·
all RUN-STATE artifacts in the run subfolder, never project root (the one
exception is the opt-in `test-generator/<change-slug>/` self-QA deliverable,
which lands at the project root by design) · validate every
subagent return (malformed = failure) · report the dispatch log + remind the
user to run `/usage` (never invoke it programmatically) · **never offer commit
on a red build** (enforced by Phase M).
