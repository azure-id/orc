# Phase — Execution   (id: `execution`)

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

## Execution (load wave-grouping.md + log-protocol.md)

Emit `PHASE execution start`. Build the conflict graph from `declared_files` →
group waves (cap `max_wave_tasks`, mark `is_batch_pause` from `pause_schedule`;
waves are computed for BOTH dispatch styles — sequential fires a wave's tasks
one at a time, parallel fires them together) → SHOW the wave plan (wave → tasks →
pause marks) to the user BEFORE wave 1 → write checkpoint + state-of-play BEFORE
dispatching. **Boundary gate, per wave (`boundary_gate`; emit `BOUNDARY`):**
`warn` prints each task's verdict; `block` additionally LIFTS a REFUSE task out of
the wave — **the wave still runs the rest** — and hands it back with its checklist
plus the "not blocked for you" line (it gates ORC's dispatch, never an explicit
instruction). ESCALATE dispatches but gates ship on the named human, riding the
EXISTING pause machinery. An uncarded area is `unknown`, never REFUSE. **Pattern-resolve gate
(once, before the first wave):** resolve each tagged language per
`../../orc/references/pattern-gate.md` and report ONE user line per language (cache hit →
apply cached; miss → codify/agnostic per `pattern_findings`; learn → dispatch
the codifier); hold resolved patterns in run state.

**TDD red proof — PAIRED TASKS, not a Wave 0 (v0.41.0):** TDD tasks are ORDINARY planner-emitted tasks the impl task `depends_on`, so they wave and score like any other (mechanics in `wave-grouping.md`); no `new-surface`/`behavior-change` entries → no TDD task at all. Each materializes its skeletons into real FAILING tests and returns the red evidence; emit `TDD-RED task=<id> iter=0` per requirement.
**Pre-implementation green is read per `disposition`:** a `new-surface` entry that PASSES is a spec bug → block that requirement's dispatch and surface it; a `behavior-change` regression-guard passing is EXPECTED and blocks nothing; anything else → adjudicate with the user, recorded in `decisions`. Then per implementation wave:
1. Dispatch EVERY task as a spawned subagent (emit `DISPATCH <agent> :: <task>
   expect=<model>/<effort>` BEFORE the Task call; subagent wrapper framing + the
   task's INPUT SLICE per orc-execution/core.md + its scored model). Every
   slice carries the task's `acceptance[]`, its `tdd_spec` tests (the executor
   implements to green: implement→test→repair, cap `tdd_loop_max`, emitting
   `TDD-RED`/`TDD-GREEN` per iteration; cap hit → STOP SEQUENCE + honest red
   report) and the `house_rules` card lines
   (`house-rules.md`, injected LITERALLY — read once per run, never
   a pointer); FE/BE and `db:postgres` tasks get the resolved `pattern`
   injected literally (pattern-gate.md), and — with `gotchas: on` — the
   SCOPE-MATCHING gotchas beside it (glob vs this task's `declared_files`, cap 3,
   highest `hits` first; zero matches = NO block, never an empty one — NEVER
   inject unfiltered: `_shared/gotchas.md` §7).
   **A FOREIGN task uses Bash, not the Task tool:** write the IDENTICAL slice to a
   file and run `orc extra dispatch --task <file> --json` (exit codes + the
   fallback procedure: `../extra-dispatch.md`). Append `via=extra:<profile>`
   to the `DISPATCH` line and copy the return's `trace_line` + every
   `trace_extras[]` entry VERBATIM into the packet — the CLI composes them, and the
   hook emits NO `SPAWN`/`RETURN` for a foreign worker, so they are the whole record.
2. Record worker milestone pings (they bound what a mid-wave stop can save).
3. Collect returns; VALIDATE each (emit `VERIFY <task> actual=<model>/<effort>`
   ✅ MATCH / ⛔ DOWNGRADE per return — surface any downgrade to the user).
   **A FOREIGN return runs `_shared/return-validation.md` §2b INSTEAD of §2** — it
   has no injected model-id line, so it cannot carry `actual_model` and faking one
   claims evidence that does not exist; ⛔ SUBSTITUTION replaces the downgrade
   check. A failure runs the fallback procedure, which BEGINS with a free
   `orc extra reconcile <task>` — a worktree that moved is RESUMED, never re-done
   — then re-dispatches or STOPs, announced, with the `EXTRA fallback` line.
   `needs_context` → adjudicate → re-slice
   (cap 2 per task, then escalate). A `pattern` task must return
   `invariants_checked: true` + the matching `pattern_version`. **Evidence
   check:** `status=done` on a stack with a runnable build/test REQUIRES
   `evidence` {command, exit_code, tail} — a missing block or false
   `no_runner_detected` is malformed (requeue); `done` with non-empty
   `unmet[]` is `partial`.
4. **Post-wave worktree audit (GATE, `_shared/return-validation.md` §6):** diff `git status --short` before/after the wave — a changed path in NO task's `declared_files`, INCLUDING one that became less modified (the revert signature), blocks the close until named and decided.
   Overlap → `failure_reason: "file-collision:<file> with <agent>"`, requeue later wave.
5. Append worker `log_entries` to the decision log; regenerate the digest.
   **Gotcha capture (`gotchas: on`):** a return that CLOSED a repair loop carries
   `gotcha_recorded` (`_shared/return-validation.md` §7) — dedupe on
   `symptom`+`scope` (a match bumps `hits`/`last_seen` and appends nothing), else
   append the block to `.claude/orc/gotchas.md`. YOU write it, never a subagent;
   a capped-and-stopped loop records NOTHING.
6. Update checkpoint + state-of-play; emit `OUTCOME task=<id> score=<n>
   band=<range> model=<m> retries=<n> requeues=<n> needs_context=<n> unmet=<n>`
   as each task closes.
7. **Wave-boundary gate (deterministic — NOT judgment):** after wave W, if the
   wave's `is_batch_pause` is true (W in `pause_schedule`) AND a later wave
   remains, emit `GATE wave-boundary :: wave=W of K → STOP (batch_pause_every=N)`
   and run the MANDATORY STOP SEQUENCE — never dispatch wave W+1 past an
   unacknowledged boundary. Token pressure → same STOP SEQUENCE (judgment).
   Last wave closes → emit `PHASE execution end`. (stop-resume.md)

**User escalations:** relay question → broadcast answer to log; an answer that
invalidates a DONE task → re-run once, then set every reverse-`depends_on`
consumer to `stale_review`. **Worker failure/garbage/timeout:** flag +
continue the wave; audit and re-dispatch at the next batch checkpoint
(`requeued`, retry_count++). Hard retry cap 2 → STOP and surface.

<!-- /orc:layer -->

<!-- orc:layer composed -->

## Phase: Execution (waves)

Run execution exactly as the full lane's execution subskill defines it —
follow `.claude/skills/orc/subskills/orc-execution/SKILL.md` (slices
constructed by you, standing rules injected, evidence-bearing returns
validated against the contract) with these compiled overrides:

- Max parallel tasks per wave: **{{max_wave_tasks}}** (hard cap; overflow →
  next wave; wave grouping per
  `.claude/skills/_shared/phases/wave-grouping.md`).
- Stop-and-continue pause every **{{batch_pause_every}}** waves (checkpoint
  confirmed BEFORE announcing any stop; resume per
  `.claude/skills/_shared/phases/stop-resume.md`).
- Executor selection comes from this flow's scoring section above — never
  from the shipped presets.

<!-- diy:when tdd=on -->
TDD execution: `tdd_spec` is SCOPED by each entry's `disposition` — only
`new-surface` and `behavior-change` get tests; `covered-by-existing` (cited
existing test) and `no-behavior` (constants, translation strings, docs, config)
get none, and a task with cited `risk[]` is never scoped out. A PAIRED TDD task
(never a Wave 0) materializes the remaining skeletons into real
FAILING tests (red proven before implementation; a `new-surface` pre-implementation
pass is a spec bug → block that requirement). Each implementation slice carries its
`tdd_spec`; executors implement to green (implement→test→repair, cap
`tdd_loop_max`; `TDD-RED`/`TDD-GREEN` per iteration) and return `tdd_state`
per `.claude/skills/_shared/return-validation.md` — including §6's worktree
delta: `git status --short` before/after each dispatch, any changed path
outside `declared_files` (a revert included) gates the wave close.
<!-- /diy:when -->

<!-- diy:when gotchas=on -->
Repair memory: probe `orc gotcha status` once at preflight (exit 0 = entries,
1 = none — never a `find`) and print one line either way. Inject the
SCOPE-MATCHING entries into each slice beside `pattern` — glob vs that task's
`declared_files`, cap 3, highest `hits` first; zero matches = NO block, never an
empty one, and NEVER unfiltered. A return that CLOSED a repair loop carries
`gotcha_recorded`; dedupe it on `symptom`+`scope` (a match bumps `hits` and
`last_seen`) and append it to `.claude/orc/gotchas.md` YOURSELF — a subagent never
writes that file, and a loop that hit its cap and stopped records nothing. Full
contract: `.claude/skills/_shared/gotchas.md`.
<!-- /diy:when -->

<!-- /orc:layer -->
