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
