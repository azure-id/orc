---
name: orc-mini
description: >
  Lightweight build lane: light intake, a mini planner, ONE Sonnet 5
  executor, a build+test smoke gate, ship. Use for "/orc-mini", "use
  orc-mini to implement X", or a small change that needs a plan but not a
  full review. Skips review, verify and summary; can switch to the full
  /orc flow mid-run.
---

# ORC-MINI

A trimmed orchestrator for when you want speed over the full quality pipeline.
The full lane's behaviour applies EXCEPT the differences below. **Never load
`../orc/SKILL.md`** — this spine is self-contained. Load the shared phase files
and schemas it names, by path; the HOT-PATH essentials (dispatch names,
return-contract fields, artifact path) are inlined here.

Run as **Opus 4.8 high**, or Opus 5.5 / Fable 5 at medium+ (as full; never downgrade).
**You never implement — you spawn.** The one exception is the **smoke gate**: a
read-only build+test run, not implementation — you still never write code.
**Worked example** (orient only — never execute from it): `examples/mini-run-mock.md`.

## Differences from the full orchestrator

1. **Skip full Phase 5 (Review), Phase 6 (Verify), and Phase 7 (Summary).**
   Instead: the **smoke gate** after execution, then the opt-in
   **test-authoring ask**, then ship.
2. **Implementation is ONE subagent, Sonnet 5, high effort.** No waves. **No
   scoring table** — a **one-line complexity read** replaces it (mini-ok? or
   recommend switching to full); log that line, never render the matrix.
3. **No dispatch-style and no batch-pause questions** — one subagent makes both
   meaningless.
4. **Lighter intake.** Only the **Always + medium tier** (Q1–Q4 in
   `../_shared/phases/intake.md`); no high tier (Q5/Q6). Step 3.5 runs at
   NAMES-ONLY depth: confirm the names the draft cites with ONE `orc graph ctx
   <names> --if-enabled --json` (five per call; exit 4, or a non-code noun such
   as a command or a config key → Glob/Grep as before), tag the rest
   `UNVERIFIED`, resolve the tags in the sign-off line, >3 tags → recommend full
   or `orc-analyze`. Sign-off **defaults to SOFT**, not GATE.
5. **Still write tests** when the project has a test setup (the executor does it
   inside its task).
6. **Everything else is identical:** run folder + intent-spec, planning,
   checkpoint, stop sequence (H `any.stop.where`), usage reminder, ship flow.

## Mini flow (the phase set)

```
Phase 0  intake (Q1–Q4, soft sign-off) + run folder + intent-spec
Phase 1  planning (dispatch orc-planner-mini; analyst first only on real docs)
         → one-line complexity read (mini-ok? or recommend switch-to-full)
Phase 3  dispatch ONE executor (orc-executor-sonnet-5-high) — slice carries the
         standing `house_rules` card (../_shared/phases/house-rules.md, literal) +
         the `rules_card` under it (`orc rules slice` → `text`, verbatim) + the cached
         `postgres` pattern (HIT only) + the --for-slice card + wiki PATHS
Phase M  SMOKE GATE — run build+test → GREEN proceed · RED block ship + surface
Phase X  MOCK EXAMPLE (config mock_example) — offer/build after a GREEN gate
Phase T  TEST-AUTHORING ASK (opt-in) — offer to write test cases (never run them)
Phase 8  ship (commit / push / PR — never stages mock-examples/) (H `mini.phase-8.ship`)
```
**Postgres query grounding.** Data-access task on a Postgres project → probe
`orc pattern status postgres` (`../_shared/detecting-artifacts.md`, never an
ad-hoc `find`). HIT → inject the pattern LITERALLY into the slice (conventions +
blocking query invariants). MISS → skip; mini never codifies (full lane /
`/orc-pattern`).

**Gotchas (repair memory; config `gotchas`) — mini READS and WRITES.** Probe at
Phase 1 (`orc gotcha status`, one row, never silent), inject the SCOPE-MATCHING
entries into the Phase 3 slice (cap 3; zero matches = no block), and append a
returned `gotcha_recorded` YOURSELF. `.claude/orc/gotchas.md` and the mechanics: `../_shared/gotchas.md` §10.

## Code graph cache — consult, build, use, update (`../_shared/code-graph.md` §0)

Never skipped. Every call carries `--if-enabled`: exit 3 = off → print `graph: off` once, make no other graph call. Print each JSON `line` in chat; put each `trace` in the next packet VERBATIM.
1. **Preflight, with the probes, before the planner:** `orc graph status --if-enabled --heal --json --brief` — it builds or updates the cache itself.
2. **Phase 0, before the tiered round:** `orc graph map --focus "<3–6 words from the request>" --budget 800 --if-enabled --json --brief`. Its ranked files pre-fill Q4's `➡️` recommendation. Never ask what the map already answered.
3. **Phase 1, ONE call:** `orc graph impact <declared_files> --complexity --risk=<facets.risk[] as class[@file:line],…> --if-enabled --json --brief`. Its `complexity.line` IS the complexity line — print it VERBATIM (`risk not given` → append the classes yourself); its `facts{}` IS `graph_facts` — paste it, then set `facts.map` to the `map --focus` card you already hold. No `complexity` in the answer (an older CLI) → count as `references/complexity.md` §2 says.
4. **Phase 3 slice:** ONE `orc graph ctx <declared_files> --for-slice --if-enabled --json --brief` → its `card` is the `graph` block, the OUTSIDE view. No card when the change stays inside one named file with no signature change (`../_shared/code-graph.md` §7). The return carries `graph_used`.
5. **Phase M, before the suite:** `orc graph changes --files=<actual_files> --if-enabled --json --brief` — print its `tests_line`, run the files its `tests[]` names first, then the suite, then its `blast_line` VERBATIM. The CLI attaches every `risk` word's `why`.
6. **Phase M GREEN:** `orc graph update --notes-pending --files <actual_files> --if-enabled --json --brief` — ONE call for the update AND the notes batch (§6) — then `orc graph gain --run <this run> --if-enabled --json --brief`, `line` copied VERBATIM into the card's `graph` row.

## Phase M — Smoke gate (build + test; blocks ship on red)

After the executor return validates (`../_shared/return-validation.md` §1–§3 + each injected field's §; `done` + non-empty `unmet[]` = partial; §6's worktree delta: a path outside `declared_files` is a violation whatever the return said), YOU run the smoke gate
per `../_shared/smoke-gate.md`: read-only build+test, with **the affected tests
FIRST** (code-graph step 5; a runner that takes no file list → one line saying
so), then build and suite once each, then the `blast_line`, `risk` never without its `why`.
**GREEN** → code-graph step 6 → test-authoring ask, then ship. **RED** → never
offer commit/ship; the flaky check, then one repair re-dispatch, second red → STOP and surface.
Docs-only → gate N/A, say so. `orc run inflight` FIRST — exit 2 REFUSES, because
`a lane that re-dispatches over a live attempt` has broken the contract
(`return-validation.md` §0). **A `risk: high` row adds ONE option,
never a phase** (H `mini.phase-m.risk-high`): an exported symbol with fan-in 3+ that no test reaches adds one
option to the EXISTING end-of-run batch (mock example · test authoring · ship)
— *a. dispatch `orc-reviewer-opus-5-med` with `../_shared/review-slice.md`* (H `any.ship.review-before-push`) *(P0/P1 block the commit
offer once) · b. write a test in Phase T · c. ship anyway*. No new user turn;
mini still skips full review.

## Phase X — Mock example + drift recovery (config `mock_example`, default ask)

After a GREEN Phase M, before ship (H `mini.phase-x.mock`): follow `../_shared/drift-recovery.md` (load it
when the phase fires) — the `mock-examples/<change-slug>/` deliverable, the
`DRIFT-FROM` loop and its cap. Trace: `PHASE mock-example`, `DRIFT loop=<n>`.

## Phase T — Test-authoring ask (opt-in; writes tests, never runs them)

Same opt-in as full Phase 6.5 — mini **only asks** (never gates the ship).
Default from `config.generate_tests`; at the end of a GREEN run ask whether to
author test cases (H `mini.phase-t.testgen`; files + TEST-PLAN.md + a curl bundle for HTTP APIs), saying
they are never run. Yes → dispatch `orc-test-author-opus-5-med` (subskill
`../orc/subskills/orc-testgen/`) exactly as `../_shared/phases/testgen.md` (`full`
layer) says: the deliverables land in **`test-generator/<change-slug>/` at the
project root**, the returned paths are validated, and you state the exact path.
No → ship; either way this NEVER runs tests. Every end — ship or a red
STOP — prints the card (`../_shared/phases/summary.md` §End-of-run card).

## Behavior trace (always on)

`../_shared/phases/trace.md` (`core`, at run start; `orc lane phases orc-mini --json` →
`trace_grammar` gives the verbs). Lane token `mini`, tier
**Build lanes** — batched to **3 packets** (intake+plan · execution ·
ship). At run start: `.current` = `run-mini-<slug>-…` AND `touch the trace file`, SAME step. Pipe each packet to `orc trace write --packet -`. A phase that ends with `zero new trace lines is a protocol violation`.
Mini does NOT drop the trace. `OUTCOME … band=mini` per task.

## Complexity read (replaces the scoring table) — `references/complexity.md`

ONE line before dispatch, carrying its own NUMBERS. **The CLI computes it** —
`complexity.line` from the Phase 1 call, printed VERBATIM. Thresholds, the
`(graph off)` form and their reasons: that reference.
It is an OFFER (H `mini.phase-1.complexity`): *1. switch to /orc (recommended — <the reason>) · 2. continue in
mini*. Continuing writes the NUMBERS into the decision log, so `/orc-retro` can
move a threshold instead of anyone arguing about it. Trace: `GATE complexity :: <the line>`.

## Fallback intake (arriving from orc-fast)

orc-fast falls back HERE whenever its prerequisites fail — never by stopping the
chat. Follow the reader side of `../_shared/fallback-handoff.md`: the
`FALLBACK-FROM` block in the shared run folder names the reason; acknowledge it
in one line, reuse the run folder, re-derive nothing it carries.

## Switching to full flow mid-run

On "switch to full" (or when the complexity read recommends it): the run folder,
checkpoint and intent-spec already use the shared `.claude/orc/run/{run-slug}/`
format, so the full flow resumes from the current checkpoint and adds the phases
mini skipped. Record the switch in the decision log.

## Dispatch via named agents (canonical name-map — dispatch BY these names)

Models pinned in `.claude/agents/`; look one up here, never reconstruct a name (agent = skill-name + model-effort suffix). See `.claude/agents/MODEL-MAPPING.md`. `opus5_only: true` FORCES the right column and needs an Opus 5.5 main session — mini's cheap-lane premise is off while it is on (`../_shared/opus5-only.md`).

**Extra (`extra_enabled`, `../_shared/extra-dispatch.md` — the procedure):** mini's ONE executor may run off Claude. Resolve the pinned executor's **BAND, both edges, and require them to agree** — else the run stays on Claude and the preflight says so. Print the `extra:` line at intake whenever the gate is on (P0: `a lane that sends work off Claude without saying so`). The IDENTICAL slice goes via `orc extra dispatch --task <file> --json`; validate with `return-validation.md` **§2b, not §2** (⛔ SUBSTITUTION); a failure runs `orc extra reconcile <task_id>` FIRST (a moved worktree is RESUMED, never re-done), then the pinned Claude agent, announced. `extra_risk_tasks` still keeps a cited-risk change on Claude — the complexity read never replaces that gate.

| Role | Agent (dispatch this) | Model / effort | When `opus5_only` |
|------|-----------------------|----------------|-------------------|
| mini analysis (docs only) | `orc-analyze-mini-sonnet-5-high` | claude-sonnet-5 / high | `orc-analyze-mini-opus-5-med` |
| mini planning | `orc-planner-mini-sonnet-5-high` | claude-sonnet-5 / high | `orc-planner-mini-opus-5-med` |
| mini execution | `orc-executor-sonnet-5-high` | claude-sonnet-5 / high | `orc-executor-opus-5-low` |
| test authoring (opt-in) | `orc-test-author-opus-5-med` | claude-opus-5-5 / medium | unchanged |

## Lane contract (`../_shared/lane-contract.md` — read it ONLY when a call exits ≠ 0)

- **Calls:** `orc lane calls orc-mini --json` names every call and its exit codes.
  **An exit code is an ANSWER where it says so, not a failure.** Make no other call.
- **Config:** `orc lane config orc-mini --json`. Obey `effective`, print every line
  in `announce[]` VERBATIM at preflight, and honour `stops[]` before wave 1.
  Never merge `.claude/orc.config.yaml` yourself (`../_shared/config-precedence.md`).
- **Rules:** `orc rules slice --lane orc-mini --json` is the ONLY assembler
  (`../_shared/phases/rules.md`). Its `line` prints VERBATIM at preflight.
- **Habits:** `habits{}` in the config answer → read `../_shared/habits.md`. No
  `habits{}` → ignore habits and every `(H …)` mark.

## TDD (ONE intake question — mini's whole TDD policy)

At intake ask once (H `mini.intake.tdd`):
*"Anchor this in plan-time acceptance tests (TDD — red tests first, implement
to green)? [yes/no]"*. Yes → the planner slice carries `tdd: on` (the mini
planner authors `tdd_spec` per requirement, **scoped by the full lane's `disposition` set** — `new-surface | behavior-change | covered-by-existing | no-behavior | no-runner`, from the `facets`; a cited `risk[]` is never scoped out). Mini keeps its SINGLE executor — no paired TDD task; that executor materializes the failing tests FIRST, then implements to green
(implement→test→repair, cap `tdd_loop_max`; emit `TDD-RED`/`TDD-GREEN` per
iteration; cap hit → STOP + honest red report), and Phase M's smoke gate runs
the TDD suite as part of build+test. Scoped-out requirements are named with their
reason at preflight — never silent. No → skip entirely; never re-ask.

## Analyst & planner (mini lane)

orc-mini dispatches the FAST variants (Sonnet 5 high): `orc-analyze-mini` and
`orc-planner-mini`. The mini analyst is **doc-optional**: on real doc input it
runs first, then the mini planner; on a merely ambiguous request, prefer one
inline clarifying question over a cold analyst spawn (single-pass, its own
escalation thresholds). You never analyze or plan yourself.

**The planner slice carries `graph_facts`** — `map`, `impact`, `cochange` and
the `generation`, or `null` when the graph is off (shape:
`references/complexity.md` §1b). The planner grounds `declared_files` and
`facets.breadth` on them; a `cochange` partner not in the plan is an
`open_questions[]` entry, never a silent addition.

**Mini-lane gates (yours, deterministic — same as full; full detail in
`../_shared/phases/analyst-gates.md`; emit `GATE` trace lines).** On
mini-analyst return: evidence spot-check + derivation lint; refuse
take-into-build on open `UNVERIFIED`/missing `scope_closed`; `git_head` ≠
HEAD at plan time → re-run the spot-check first. On mini-planner return: confirm
every `disposition: exists` path with `orc graph ctx <paths> --if-enabled
--json --brief`, FIVE at a time — exit 4 or an unindexed path falls
back to a Glob. Then recompute coverage (no orphan requirements), cycle +
collision checks. Any miss → bounce (one retry, then escalate). At dispatch,
append the task's `spec_invariants` to the slice's `constraints[]` verbatim.

## Wiki consult (if present)

Load `../_shared/phases/wiki-consult.md` at the planning/complexity-read step. It
owns the tier (`orc wiki status --json` → `.tier`), the ladder
`code > fresh wiki > stale wiki (hints) > model priors`, the lane delta
(select PATHS, never bodies: 1–3 from `wiki/INDEX.md`), `WIKI-CONSULT`, the crosslink injection,
the passive stale-flag and `wiki_used: none` / `graph_used: none` (§Step 5, the mini paragraph).
**You never read a page body into your own context.** Mini never generates the wiki.

## Shared artifacts

All RUN STATE stays in `.claude/orc/run/{run-slug}/` (as full, so a switch needs no migration), never the project root —
only the opt-in `test-generator/<change-slug>/` and `mock-examples/`
deliverables sit there. Report the dispatch log and remind the user to run
`/usage` (never yourself).

## Waiting mid-run (`/orc-wait`)

Canonical: `../_shared/wait.md`. **`a lane that waits without a hand-back` has broken this contract.**
Checkpoint **full** · safe point **after the executor returns**.
