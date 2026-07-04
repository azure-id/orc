# ORC v2.2

A Claude Code skill constellation: intake → planning → scored parallel
execution → review → verify → ship. One orchestrator spine invoking focused
subskills, with eager checkpointing that survives compaction, crashes, and
fresh-session resumes.

Stack-agnostic — detects and adapts to your project's language/tooling.

## Install

Unzip so you get THREE sibling skills + command files:

```
<your-project>/.claude/skills/orc/
<your-project>/.claude/skills/orc-mini/
<your-project>/.claude/skills/orc-verify/
<your-project>/.claude/commands/orc.md
<your-project>/.claude/commands/orc-mini.md
<your-project>/.claude/commands/orc-verify.md
```

Then:
1. **Paste your PR template** into
   `orc/subskills/orc-pr/pr.md` (replaces the placeholder).
2. Add to your project .gitignore: `.claude/skills/orc/run/`
   (a local .gitignore inside run/ is included, but confirm).
3. The three `.claude/commands/` files give you `/orc`,
   `/orc-mini`, and `/orc-verify` in the terminal. If your
   Claude Code version reads commands from a different folder, move the three
   .md files there.

## Use

```
use orc to build <feature>
```

It will: rough-size → ask tiered intake questions (2/4/6) → draft an intent-spec
for your sign-off → plan (Superpowers/OpenSpec/self) → recommend sequential vs
parallel dispatch (workers always spawned) → score every task (rubric → model ladder) and show you the table
→ execute in conflict-free waves with batch pauses → at every stop: checkpoint,
usage report, and a paste-block to resume in a FRESH session (recommended for
long runs) → review → verify (auto-fix once) → summary → commit/push/PR.

## Layout

```
orc/
├── SKILL.md                     # thin orchestrator spine (progressive disclosure)
├── schemas/                     # orchestrator-owned; workers get slices
│   ├── intent-spec.md
│   ├── planning-output.md
│   └── checkpoint.md            # + state-of-play format
├── references/                  # loaded only when their phase fires
│   ├── intake.md
│   ├── effort-and-mode.md       # mode gate + scoring rubric + model ladder
│   ├── wave-grouping.md
│   ├── log-protocol.md
│   └── stop-and-resume.md       # stop sequence, /usage, resume block
├── subskills/
│   ├── orc-execution/            # SKILL.md + core.md + subagent.md (always spawned)
│   ├── orc-review-verify/        # same pattern (always spawned)
│   ├── orc-checkpoint/SKILL.md   # stateless write/read service
│   └── orc-pr/                   # SKILL.md + pr.md (YOUR template goes here)
├── examples/full-run-mock.md
└── run/                         # gitignored — all run artifacts live here
```

## What's new in v2.2

- **3-band model ladder** (Opus 4.7 removed): [0,50) Sonnet 5 med · [50,70)
  Opus 4.8 med · [70,100] Opus 4.8 high.
- **Wider scoring:** a base (intrinsic size) adjusted up/down by context (core
  vs isolated, risk, blast radius, mechanical). A "small" task can rise or a
  "medium" task can fall before landing in a band.
- **Per-run folder:** everything for a run lives in
  `run/{run-slug}/` (intent-spec, checkpoint, state-of-play, decision log) —
  never the project root, never loose files.
- **No programmatic /usage:** the orchestrator reports the dispatch log and
  reminds you to run `/usage` yourself, at every stop and at completion.
- **Two siblings:** `orc-mini` (fast, one Sonnet 5 high agent, skips
  review/verify/summary, switchable to full) and `orc-verify`
  (standalone git-diff verify, Opus 4.8 high, read-only).

## Key behaviors to know

- **The orchestrator NEVER implements — it always spawns scored subagents,
  even for tiny tasks.** Orchestrator (Opus 4.8 high) only coordinates; workers
  get scored models (Sonnet 4.6 med → Opus 4.8 high ladder). This keeps costs
  down and orchestrator context lean for long runs.
- **Usage is reported at every pause AND at run completion** — limits remaining
  plus the full per-task dispatch table (score, model, effort).
- **Disk is truth.** Every pause emits a resume block; paste it into a fresh
  session to continue with near-zero context cost. state-of-play.md +
  checkpoint carry everything.
- **Strict contracts.** Workers receive slices, return fixed structures;
  malformed = failure. `needs_context` (cap 2) is the only way a worker asks
  for more.
- **Auto-fix once** on blocking verify failures; nits reported then you're asked.

## Verify at first run (environment-dependent)

- Whether `/usage` can be invoked programmatically (fallback: dispatch-log
  report + instruct you to run /usage yourself — already built in).
- That the orchestrator loads subskills by PATH (subskills/...) — it should
  never rely on nested-skill auto-discovery.
- The planner hand-off: if Superpowers/OpenSpec output lacks declared files,
  the orchestrator extracts them — watch that seam on run one.

## Tuning after first runs

- Waves over-serializing → declared_files globs too broad; narrow them.
- Collisions slipping through → workers under-declaring; emphasize tests too.
- Rubric scores feel off → adjust weights in references/effort-and-mode.md;
  audit the override log to see where the orchestrator disagreed with it.
