# ORC (installed payload)

A Claude Code skill constellation: intake → planning → scored parallel
execution → review → verify → ship. One orchestrator spine invoking focused
subskills, with eager checkpointing that survives compaction, crashes, and
fresh-session resumes.

Stack-agnostic — detects and adapts to your project's language/tooling.

> This README ships inside the installed payload. The full user docs (install,
> commands, config, changelog) live in the `orc` npm package's root README:
> https://github.com/azure-id/orc

## Install / update

Installed by the `orc` npm package — don't copy files by hand:

```bash
npm i -g github:azure-id/orc
orc init            # install into ./.claude   (orc init --global for ~/.claude)
orc update          # re-copy the installed package's files (offline)
orc upgrade         # fetch the latest package, then apply it
orc config          # view/change settings — zero model tokens
```

`orc init` installs **skills/**, **commands/** (`/orc` `/orc-mini` `/orc-analyze`
`/orc-plan` `/orc-verify` `/orc-wiki` `/orc-pattern`), **agents/** (single-role,
model-pinned subagents + `MODEL-MAPPING.md`), and **hooks/** (effort hard-block,
statusline tier warning, behavior trace), merging the hook wiring
non-destructively into `.claude/settings.json`.

After installing:

1. **Paste your PR template** into `orc/subskills/orc-pr/pr.md` (replaces the
   placeholder).
2. Add `.claude/skills/orc/run/` to your project `.gitignore` (a local
   .gitignore inside run/ is included, but confirm).
3. Run `/agents` to confirm the model IDs your Claude Code accepts, and **run
   your main session on Opus** — a subagent's model can't exceed the main
   session's tier.

## Use

```
use orc to build <feature>        # or /orc
```

It will: rough-size → ask tiered intake questions (2/4/6) → draft an intent-spec
for your sign-off → plan (Superpowers/OpenSpec/Requirement Planner/self) →
recommend sequential vs parallel dispatch (workers always spawned) → score every
task (rubric → config preset → named executor agent) and show you the table →
execute in conflict-free waves with batch pauses → at every stop: checkpoint,
usage report, and a paste-block to resume in a FRESH session (recommended for
long runs) → review → verify → optional security pass / test authoring →
summary → commit/push/PR.

## Layout (this skill)

```
orc/
├── SKILL.md                     # thin orchestrator spine (progressive disclosure)
├── config.md                    # shipped defaults + score→model presets
├── schemas/                     # orchestrator-owned; workers get slices
│   ├── intent-spec.md
│   ├── planning-output.md
│   └── checkpoint.md            # + state-of-play format
├── references/                  # loaded only when their phase fires
│   ├── intake.md
│   ├── effort-and-mode.md       # dispatch-style gate + scoring rubric
│   ├── wave-grouping.md
│   ├── log-protocol.md
│   ├── stop-and-resume.md       # stop sequence, /usage, resume block
│   ├── house-rules.md           # standing behavioral card, injected into every slice
│   ├── security-checklist.md    # Phase 5.5 OWASP/STRIDE items (opt-in)
│   └── trace-protocol.md        # behavior trace (only when logging: true)
├── subskills/
│   ├── orc-execution/           # SKILL.md + core.md + subagent.md (always spawned)
│   ├── orc-review-verify/       # review / verify / security modes (always spawned)
│   ├── orc-planner/             # Requirement Planner (+ orc-planner-mini fast lane)
│   ├── orc-testgen/             # opt-in Phase 6.5 test authoring
│   ├── orc-checkpoint/          # stateless write/read service
│   └── orc-pr/                  # SKILL.md + pr.md (YOUR template goes here)
├── examples/full-run-mock.md
└── run/                         # gitignored — all run artifacts live here
```

Sibling skills installed alongside: `orc-mini` (fast path), `orc-verify`
(standalone git-diff verify), `orc-analyze` + `orc-analyze-mini` (System
Analyst), `orc-wiki` (project knowledge base), `orc-pattern` (code-pattern
codifier: 9 language playbooks + a11y/perf rule packs), `context-combiner`
(merge related analyses).

## Key behaviors to know

- **The orchestrator NEVER implements — it always spawns scored subagents,
  even for tiny tasks.** Orchestrator (Opus 4.8 high) only coordinates; each
  task's 0–100 score maps to a named executor agent via the preset in
  `config.md` (`rubric_bands` narrow/wide), Sonnet 4.6 med → Opus 4.8 high.
- **Every executor slice carries** the intent-spec constraints, the task's
  sliced acceptance criteria, the standing
  house-rules card, and — when a code-pattern is resolved — your project's
  conventions + blocking invariants + the playbook's measurable validation
  gate. Executors echo `actual_model`/`actual_effort` (claimed-vs-actual tier
  check), `pattern_version`/`invariants_checked`, plus verbatim build/test
  `evidence` and an `unmet[]` honesty field — a `done` without proof (or with
  admitted unmet lines) is a malformed return.
- **Plans are grounded, not trusted:** every declared file carries an
  `exists|new` attestation the orchestrator spot-checks with Glob before
  scoring — hallucinated paths bounce the plan back to the planner.
- **P0–P3 severity ladder** on review/verify findings: P0 (objective breakage)
  auto-fixed once without asking · P1 (correctness/security risk) gates ship,
  you're asked before the fix · P2/P3 advisory, offered as an optional
  fix-batch in the summary. Every P0–P2 finding must be anchored (file:line +
  verbatim quote — spot-checked before any fix); unanchored findings are
  auto-P3 and never gate.
- **Opt-in phases** (all default OFF, via `orc config`): security pass
  (`security_review`, fires only on runs with a task scored ≥ 70), test
  authoring (`generate_tests`, writes tests + TEST-PLAN.md + curl bundle,
  never runs them), behavior trace (`logging`, persistent per-run `.txt`).
- **Usage is reported at every pause AND at run completion** — limits reminder
  plus the full per-task dispatch table (score, model, effort).
- **Disk is truth.** Every pause emits a resume block; paste it into a fresh
  session to continue with near-zero context cost. state-of-play.md +
  checkpoint carry everything.
- **Strict contracts.** Workers receive slices, return fixed structures;
  malformed = failure. `needs_context` (cap 2) is the only way a worker asks
  for more.

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
- Cached pattern drifted from the codebase → `/orc-pattern --refresh`.
