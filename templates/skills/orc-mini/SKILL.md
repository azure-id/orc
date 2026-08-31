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

Run as **Opus 4.8 high**, or Opus 5 / Fable 5 at medium+ (as full; never downgrade).
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
   `../_shared/phases/intake.md`); skip the high tier (Q5/Q6). Run the Step
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
         the standing `house_rules` card (../_shared/phases/house-rules.md,
         injected literally) + the cached `postgres` pattern on a data-access
         task (cache HIT only) — collect + validate return
Phase M  SMOKE GATE — run build+test → GREEN proceed · RED block ship + surface
Phase X  MOCK EXAMPLE (config mock_example) — offer/build after a GREEN gate
Phase T  TEST-AUTHORING ASK (opt-in) — offer to write test cases (never run them)
Phase 8  ship (commit / push / PR — never stages mock-examples/)
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

**Gotchas (repair memory; config `gotchas`) — mini READS and WRITES.** Probe at
Phase 1 (`orc gotcha status`, one row, never silent), inject the SCOPE-MATCHING
entries into the Phase 3 slice (cap 3; zero matches = no block, never
unfiltered), and append a returned `gotcha_recorded` YOURSELF after the return.
Trimmed mechanics + `.claude/orc/gotchas.md`: `../_shared/gotchas.md` §10.

## Phase M — Smoke gate (build + test; blocks ship on red)

After the executor return validates (`../_shared/return-validation.md` —
including `done` with non-empty `unmet[]` = partial, and §6's worktree delta: a path changed outside `declared_files` is a violation whatever the return said), YOU run the smoke gate
per `../_shared/smoke-gate.md`: read-only build+test. **GREEN** →
test-authoring ask, then ship. **RED** → never offer commit/ship; one repair
re-dispatch, second red → STOP and surface. Docs-only → gate N/A, say so.

## Phase X — Mock example + drift recovery (config `mock_example`, default ask)

Canonical: `../_shared/drift-recovery.md` — load it when the phase fires. After
a GREEN Phase M, before ship: `ask` → MANDATORY offer (never silently
skipped/run) · `on` → build · `off` → skip. Deliverable
`mock-examples/<change-slug>/` at project root (EXAMPLE.md + one runnable
mocked artifact) — **never committed, never staged** (no `.gitignore` edit).
One question after the user runs it: matches expectation? [yes / drift:
<describe>]. Drift → `DRIFT-FROM` handoff (gap analysis → patch plan → dispatch
→ re-gate → re-offer), hard cap 2 loops, then an honest unresolved report.
Trace: `PHASE mock-example`, `DRIFT loop=<n>`.

## Phase T — Test-authoring ask (opt-in; writes tests, never runs them)

Same opt-in as full Phase 6.5 — mini **only asks** (never gates the ship).
Default from `config.generate_tests`; at the end of a GREEN run ask: *"Write
test cases for these changes? (I'll author them — automated files +
TEST-PLAN.md + a curl bundle for HTTP APIs — but never run them; you test
manually.)"* Yes → dispatch `orc-test-author-opus-5-med` (subskill
`../orc/subskills/orc-testgen/`) with the run's `actual_files`,
definition-of-done, touched flows, constraints, stack; the two manual
deliverables land in **`test-generator/<change-slug>/` at the project root**.
Validate the returned `test_plan_path`/`curl_bundle_path` are under that folder
(else malformed → re-dispatch); relay + state the exact path (committed on ship,
not gitignored). No → ship. Either way this NEVER runs tests.

## Behavior trace (always on)

`../_shared/phases/trace.md` (`core`, at run start; `orc lane phases` names
the file and the layers). Lane token `mini`, tier **Build lanes** —
per phase, batched to **3 packets** (intake+plan · execution · ship), each
paired with the next phase's first dispatch.
At run start write `log_dir/.current` = `run-mini-<slug>-<DDMMYY>-<HHMMSS>.txt` AND
`touch the trace file` of that name in the SAME step.
Nothing else about the protocol is restated here; a phase that ends with
`zero new trace lines is a protocol violation`.

Mini does NOT drop the trace. `OUTCOME … band=mini` per task.

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
in the shared `.claude/orc/run/{run-slug}/` format, so the full flow resumes from
the current checkpoint and adds the phases mini skipped. Record the switch in
the decision log.

## Dispatch via named agents (canonical name-map — dispatch BY these names)

Models pinned in `.claude/agents/`; look up here, never reconstruct a name (agent = skill-name + model-effort suffix). See `.claude/agents/MODEL-MAPPING.md`. `opus5_only: true` FORCES the right column and needs an Opus 5 main session — mini's cheap-lane premise is off while it is on (`../_shared/opus5-only.md`).

**Extra (`extra_enabled`, `../_shared/extra-dispatch.md`):** mini's ONE executor may run off Claude. It has no score, so resolve the pinned executor's **BAND, both edges, and require them to agree** — a partially covering row keeps the run on Claude and the preflight says so. Print the `extra:` line at intake whenever the gate is on (P0: `a lane that sends work off Claude without saying so`); dispatch via `orc extra dispatch --task <file> --json` with the IDENTICAL slice; validate with `return-validation.md` **§2b, not §2** (⛔ SUBSTITUTION replaces the downgrade check); a failure runs `orc extra reconcile <task_id>` FIRST — a worktree that moved is RESUMED, never re-done — then falls back to the pinned Claude agent, announced. A cited-risk change never leaves Claude (`extra_risk_tasks`, default `off`) — and mini's complexity read is not a substitute for that gate.

| Role | Agent (dispatch this) | Model / effort | When `opus5_only` |
|------|-----------------------|----------------|-------------------|
| mini analysis (docs only) | `orc-analyze-mini-sonnet-5-high` | claude-sonnet-5 / high | `orc-analyze-mini-opus-5-med` |
| mini planning | `orc-planner-mini-sonnet-5-high` | claude-sonnet-5 / high | `orc-planner-mini-opus-5-med` |
| mini execution | `orc-executor-sonnet-5-high` | claude-sonnet-5 / high | `orc-executor-opus-5-low` |
| test authoring (opt-in) | `orc-test-author-opus-5-med` | claude-opus-5 / medium | unchanged |

## Config

**ONE resolver, and it is not you:** `orc lane config orc-mini --json`. Obey
`effective`, print every line in `announce[]` VERBATIM at preflight, and honour
`stops[]` before wave 1. Never re-derive a value, a precedence or an inertness
from `.claude/orc.config.yaml` — a key this lane does not read is not in the
answer, and a key another key shadows comes back already marked. Exit ≠ 0 → say
the CLI is unavailable and fall back to `../_shared/config-precedence.md`'s
documented defaults, out loud. Priorities and families:
`../_shared/config-precedence.md`.

Wave/scoring/scout keys never apply to mini — and they are not in the answer,
so there is nothing to render or ask.

## Calls

**ONE catalogue, and it is not you:** `orc lane calls orc-mini --json` names every
CLI call this lane makes, each with its exit-code contract, its cost, when to run
it, and what an EMPTY answer means. Never invent a spelling, never re-word an
exit code, and never re-derive a state word — the CLI's state words are the only
state words, and **an exit code is an ANSWER wherever that contract says so, not
a failure**. A call the answer does not name is a call this lane does not make.
Exit ≠ 0 from the catalogue itself → say the CLI is unavailable and name the
command you are about to run, out loud, before running it.

## TDD (ONE intake question — mini's whole TDD policy)

At intake ask once:
*"Anchor this in plan-time acceptance tests (TDD — red tests first, implement
to green)? [yes/no]"*. Yes → the planner slice carries `tdd: on` (the mini
planner authors `tdd_spec` per requirement, **scoped by the same `disposition` set the full lane uses** — `new-surface | behavior-change | covered-by-existing | no-behavior | no-runner`, derived from the `facets`, same safety floor: a cited `risk[]` is never scoped out, so a constant or a translation string gets no test but an auth change always does). Mini keeps its SINGLE executor — no paired TDD task; that executor materializes the failing tests FIRST, then implements to green
(implement→test→repair, cap `tdd_loop_max`; emit `TDD-RED`/`TDD-GREEN` per
iteration; cap hit → STOP + honest red report), and Phase M's smoke gate runs
the TDD suite as part of build+test. Scoped-out requirements are named with their
reason at preflight — never silent. No → skip entirely; never re-ask.

## Analyst & planner (mini lane)

orc-mini dispatches the FAST variants (Sonnet 5 high): `orc-analyze-mini` and
`orc-planner-mini` — same artifacts and output contracts as full, trimmed
depth. The mini analyst is **doc-optional**: on real doc input it runs first,
then the mini planner; on a merely ambiguous request, prefer one inline
clarifying question over a cold analyst spawn. Always single-pass — **no deep
mode, no scouts**; it escalates to `/orc-analyze` deep on its concrete
thresholds and the user chooses. You never analyze or plan yourself.

**Mini-lane gates (yours, deterministic — same as full; full detail in
`../_shared/phases/analyst-gates.md`; emit `GATE` trace lines).** On
mini-analyst return: evidence spot-check + derivation lint; refuse
take-into-build on open `UNVERIFIED`/missing `scope_closed`; `git_head` ≠
HEAD at plan time → re-run the spot-check first. On mini-planner return: Glob
every `disposition: exists` path, recompute coverage (no orphan
requirements), cycle + collision checks. Any miss → bounce (one retry, then
escalate). At dispatch, append the task's `spec_invariants` to the slice's
`constraints[]` verbatim.

## Wiki consult (if present)

Same rule as the full skill — load `../_shared/phases/wiki-consult.md` at the
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
(`.claude/orc/run/{run-slug}/`) — a switch needs no migration.

## What mini still enforces (from the main hard rules)

Never implement yourself (the smoke gate is read-only, not implementation) ·
all RUN-STATE artifacts in the run subfolder, never project root (the one
exception is the opt-in `test-generator/<change-slug>/` self-QA deliverable,
which lands at the project root by design) · validate every
subagent return (malformed = failure) · report the dispatch log + remind the
user to run `/usage` (never invoke it programmatically) · **never offer commit
on a red build** (enforced by Phase M).

## Waiting mid-run (`/orc-wait`)

Canonical: `../_shared/wait.md`. **`a lane that waits without a hand-back` has broken this contract.**
Checkpoint **full** · safe point **after the executor returns**. `soft` FORCES that checkpoint and does NOT stop if the write fails; `hard` skips it and can lose an in-flight return. Never begin a wait between a dispatch and its validated return, or before the smoke gate has reported.
