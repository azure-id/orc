# Phase — Planning   (id: `planning`)

> **Shared phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12, and into
> this library at W13 when `orc-diy` became its second reader. A spine is loaded
> IN FULL when its skill activates; this is loaded when the phase fires, and most
> runs skip most phases.
>
> **Two layers, and a lane reads exactly one.** `full` is `/orc`'s procedure.
> `composed` is what `orc diy compile` stitches — the same phase expressed as
> `<!-- diy:when -->` variants over a composed flow, NOT a second copy of the
> procedure. Reading the wrong one is the failure `README.md` names: a lane
> doing a phase its product promise says it does differently.
> `orc lane phases <lane> --json` names the layer for each lane.

<!-- orc:layer full -->

## Planning

Emit `PHASE planning start`, then emit ONE `CONFIG <key=value …>` line with the
resolved values of every config key this run will consume (ALWAYS `opus5_only` — it selects the executor table AND every fixed role, so retro can segment per-band outcomes BY dispatch mode) — the runtime
proof `/orc-retro` audits that the run honored the config.
**Wiki consult (load `wiki-consult.md`;
always report — no tier is silent):** read the FRESH/AGING/STALE tier from
**`orc wiki status`** (v0.41.0 — deterministic; never hand-compute it from `wiki-meta.json`), pull the relevant pages (incl. cross-cutting maps like `orc-reference-api-surface`), apply
`code > fresh wiki > stale wiki (hints) > model priors`, emit
`WIKI-CONSULT <tier> :: docs=<pages>`, print the one-line tier report (every tier, `absent` included), and attribute per-dispatch too — `wiki:` on the `DISPATCH` line + a `wiki_used` return (wiki-consult.md Step 5). **Crosslink:** per wiki-consult.md, inject
the cached `.claude/orc/crosslink/needs.json` contract into any boundary-touching
task (advisory) and print + emit `CROSSLINK <state> :: boundaries=<n> peers=<names>`
— `configured-no-cache` prints the "cache not built" warning (full orc reads
only pre-built needs/cache, never peer source live). **Gotchas (repair memory,
config `gotchas`):** probe ONCE with `orc gotcha status` (exit 0 = entries exist,
1 = none — never a `find`); canonical `_shared/gotchas.md`.
**Pact / boundary / aftermath / wiki debt (v0.46.0 — all CONSUMED here, never
written here):** probe `orc pact status --json` (`pact_gate`, default `warn`),
`orc boundary status --json` (`boundary_gate`, default `warn`), `orc wiki debt
--json`, and — only to decide whether the preflight's `after:` line fires at all —
`orc aftermath status --json`. Print each probe's own `line` VERBATIM; never
recount or re-word one. Gates: `../../orc-pact/references/gate.md` +
`../../orc-boundary/references/gate.md`. **Challenge (v0.47.0, `challenge_gate`,
default `warn`):** when the run's INPUT DOCUMENT has a cycle, print
`orc challenge status <slug> --json`'s `preflight_line` verbatim — building from
a document that has not passed its own review is worth one line. There is no
`block` mode (the `/orc-pact` precedent). **Extra (v0.50.0, `extra_enabled`) —
resolved HERE, announced HERE, never silent:** load `../extra-dispatch.md`;
per task run `orc extra resolve <score> --role executor --risk <n> --json`, and
before wave 1 settle its two pre-dispatch states, both PRINTED — a `needs_reping`
profile (re-ping; a STALE profile still routes) and a vaulted credential, which is
**LOCKED AT DISPATCH TIME whatever `credential.present` says** and falls back to
Claude rather than stopping the run. **Preflight:** print the compact block per
`../../orc/references/preflight-report.md` once wiki + crosslink (+ pattern/waves) resolve.

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
`../../orc/schemas/planning-output.md` (per-task `declared_files` incl. tests,
`grounding[]`, `acceptance[]`, `requirements[]`, `spec_invariants[]`,
`depends_on`, `owns_area`, `spec_ref`, + a `coverage` echo, + `tdd_spec` —
TDD is ALWAYS ON in full orc/ultra but **SCOPED to what can actually fail (v0.41.0)**: a `disposition` per entry (`new-surface | behavior-change | covered-by-existing | no-behavior | no-runner`) DERIVED from the planner's facets — constants/translations/file-splits get NO test, a cited `risk[]` is never scoped out, and a PAIRED task materializes it, never a Wave 0 (schema notes 7-8; gate check 5);
missing declared files → extract and confirm before leaving this phase.

**Phase 1 exit gate** (deterministic — full checks in analyst-gates.md; emit
`GATE` lines): Glob every `disposition: exists` path, recompute coverage (no
`orphan` requirements), cycle + same-file collision checks. Any miss →
bounce to the planner (one retry), then escalate. **After the gate passes,
relay the plan's `open_questions[]` in ONE batch:** blocking questions must be
answered before Phase 2; non-blocking show their `proposed_default` for tacit
approval. **Step-back valve:** `plan_confidence: low` OR >3 blocking questions →
recommend stepping back to `orc-analyze` (user may override and proceed).
**Pact injection (`pact_gate: warn`) — the payoff, and it happens HERE:** a
DRIFTED or BROKEN promise whose `anchors` intersect a task's `declared_files` is
appended VERBATIM to that task's `constraints[]` (the `spec_invariants[]`
channel — no new plumbing) and PRINTED per task. HOLDING entries are never
injected. Last month's decision constrains this month's plan, automatically. On
pass, emit `PHASE planning end`.

**Then print the `forecast:` block, BEFORE the Phase-2 pause question**
(`../../orc/references/preflight-report.md`) — tasks · waves · estimated subagents · model
mix · a measured time RANGE · one cheaper lane and what it costs. This is the
earliest instant every number is real and the last cheap moment to walk away.
Presentation only, no new probes. When `config.run_budget_dispatches` > 0 and the
forecast exceeds it, this is a **hard stop** with the batch pause's discipline
(`GATE budget stop`) offering proceed · cheaper lane · re-plan smaller — never
dispatch wave 1 past it.

<!-- /orc:layer -->

<!-- orc:layer composed -->

## Phase: Planning

<!-- diy:when planning=auto -->
Route planning exactly as the full lane does — Superpowers plan, OpenSpec
change, or ORC's own planner, chosen by what exists in the project. Follow
`.claude/skills/orc/subskills/orc-planner/SKILL.md` for the own-planner path
and validate the planning output against
`.claude/skills/orc/schemas/planning-output.md`.
<!-- /diy:when -->
<!-- diy:when planning=own-planner -->
Always use ORC's own Requirement Planner, even when Superpowers/OpenSpec
artifacts exist: follow `.claude/skills/orc/subskills/orc-planner/SKILL.md`
and validate the planning output against
`.claude/skills/orc/schemas/planning-output.md`.
<!-- /diy:when -->
<!-- diy:when planning=superpowers -->
Plan via Superpowers: require a Superpowers-written plan as planning input
(ask the user to produce one if absent), then convert it to ORC planning
output validated against `.claude/skills/orc/schemas/planning-output.md` —
same conversion the full lane applies on its Superpowers route.
<!-- /diy:when -->
<!-- diy:when planning=openspec -->
Plan via OpenSpec: require an OpenSpec change as planning input (ask the user
to produce one if absent), then convert it to ORC planning output validated
against `.claude/skills/orc/schemas/planning-output.md` — same conversion the
full lane applies on its OpenSpec route.
<!-- /diy:when -->
<!-- diy:when tdd=on -->
TDD is ON for this flow: the plan must carry a `tdd_spec` per requirement
(given/when/then + a runnable skeleton in the project's test framework, or
`tdd: exempt — <reason>`; schema in
`.claude/skills/orc/schemas/planning-output.md`). No test runner in the
project → whole-run exemption, stated once at preflight.
<!-- /diy:when -->

<!-- /orc:layer -->
