## Phase: Execution (waves)

Run execution exactly as the full lane's execution subskill defines it —
follow `.claude/skills/orc/subskills/orc-execution/SKILL.md` (slices
constructed by you, standing rules injected, evidence-bearing returns
validated against the contract) with these compiled overrides:

- Max parallel tasks per wave: **{{max_wave_tasks}}** (hard cap; overflow →
  next wave; wave grouping per
  `.claude/skills/orc/references/wave-grouping.md`).
- Stop-and-continue pause every **{{batch_pause_every}}** waves (checkpoint
  confirmed BEFORE announcing any stop; resume per
  `.claude/skills/orc/references/stop-and-resume.md`).
- Executor selection comes from this flow's scoring section above — never
  from the shipped presets.

<!-- diy:when tdd=on -->
TDD execution: Wave 0 materializes every non-exempt `tdd_spec` into real
FAILING tests (red proven before implementation; a pre-implementation pass is
a spec bug → block that requirement). Each implementation slice carries its
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
