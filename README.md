# ORC

**An orchestrator skill constellation for [Claude Code](https://claude.com/claude-code).**

ORC takes a feature — or a requirements document — and drives it through a
disciplined pipeline: understand intent, analyze docs against your actual code,
plan, dispatch scored parallel subagents, review, verify, and ship. It keeps
cost down by matching each task to the cheapest capable model, survives long
runs by checkpointing to disk, and can build a persistent knowledge base of your
project that makes every future run smarter.

ORC is **not a runtime.** It's a set of markdown **skills**, **slash commands**,
and **subagent definitions** that Claude Code reads and follows. This npm package
installs those files into your `.claude/` directory.

---

## Why ORC exists

Handing a big task to one agent tends to fail in specific ways: it burns tokens
doing everything at the top model, it loses the thread when context compacts, it
builds the wrong thing because "done" was never pinned down, and — with
documents — it implements the wrong scope. ORC addresses each:

- **The orchestrator never implements — it dispatches scored subagents,** even
  for a one-line change. Each task is scored and routed to the cheapest capable
  model, so the expensive models are reserved for genuinely hard work.
- **Disk is the source of truth.** Every run checkpoints its state, so any pause
  — planned, token-limit, or crash — resumes cleanly, and you can continue in a
  fresh session via a paste-block instead of dragging a compacted conversation.
- **Intake and document analysis happen before any parallel work,** so scope is
  bounded and confirmed before it's parallelized across agents.

---

## Install

```bash
npm i -g orc
# or straight from GitHub — no registry needed
npm i -g github:<you>/orc

# or if installing is causing pain, try this:
npm i -g https://github.com/azure-id/orc/archive/refs/heads/main.tar.gz
```

Then, inside a project:

```bash
orc init            # install into ./.claude          (this project)
orc init --global   # install into ~/.claude          (all projects)
orc update          # re-copy this package's files (offline; local only)
orc upgrade         # fetch the LATEST package, then apply it (this pulls a new version)
orc config          # view/change settings (interactive; zero model tokens)
orc version         # print installed version + check for a newer one
orc where           # print the target paths
orc --help
```

### Staying up to date

`orc version` prints what you have and checks the source for a newer release:

```text
$ orc version
orc 0.2.1
⬆  newer version available: 0.3.0 — run `orc upgrade`
```

Normal commands (`orc init`, `orc update`, …) also show a one-line nudge when a
newer version exists, so you'll notice without asking. The check hits the source's
`package.json` over HTTPS, is **cached for 24h** (so it never slows you down or
hammers the network), and is **fail-silent** offline. When it flags an update,
`orc upgrade` pulls and applies it. Opt out entirely with `ORC_NO_UPDATE_CHECK=1`.

**You don't even have to run a command.** The same nudge surfaces *inside Claude
Code*, through ORC's hooks — with **zero model tokens**, since hooks are scripts
Claude Code runs, not model turns:

- When you invoke **`/orc`**, the `PreToolUse` guard checks the cache and shows a
  `systemMessage` — "orc X available, run `orc upgrade`" — displayed to you, not
  added to the model's context.
- The **statusline** appends a `⬆ orc X` hint whenever a newer version is known
  (read straight from the cache — no network on that path).

`orc init`/`update`/`upgrade` stamp the installed version into
`.claude/hooks/orc-version.json` so the hooks know what to compare against; the
guard refreshes the shared 24h cache when you launch `/orc`.

### Updating to a new version

`orc update` only re-copies whatever is **already installed** — it never reaches
the network, so on its own it can't bring in a newer release. To actually move to
the latest, use **`orc upgrade`**, which refreshes the package from the source
first and then applies it:

```bash
orc upgrade                  # ./.claude   — fetch latest, then update this project
orc upgrade --global         # ~/.claude   — fetch latest, then update all projects
orc upgrade --from github:<you>/orc   # pull from a fork or any npm spec
```

If the GitHub spec fails to install (common under **NVM** or where npm's `github:`
spec can't shell out to git), `orc upgrade` automatically retries with a plain
tarball of the default branch — no action needed. You can also run that bypass
manually:

```bash
npm i -g https://github.com/azure-id/orc/archive/refs/heads/main.tar.gz
orc update
```

Equivalently, the normal two manual steps are `npm i -g github:azure-id/orc`
followed by `orc update`. Either way, your `.claude/orc.config.yaml` overrides
(set via `/orc-config`) are left untouched.

This installs three things into `.claude/`: **skills/**, **commands/**, and
**agents/**. After installing:

1. Paste your team's PR template into `skills/orc/subskills/orc-pr/pr.md`.
2. Add `.claude/skills/orc/run/` to your project `.gitignore`.
3. **Run `/agents`** to confirm the agent model IDs your Claude Code accepts.
4. **Run your main Claude Code session on Opus** — a subagent's model can't
   exceed the main session's tier, so on a Sonnet session the Opus agents
   silently downgrade (see `agents/MODEL-MAPPING.md`).
5. If a `/command` doesn't appear, your Claude Code may read commands from a
   different folder — move the files in `commands/` there.

---

## Commands

### `/orc` — the full orchestrator
Feature or spec → shipped code, through: intake (with a signed-off intent-spec),
planning, per-task scoring, conflict-free parallel waves, review, verify, and
ship. Checkpoints eagerly; resumes in a fresh session at any pause.

### `/orc-mini` — the fast path
Same intake/planning/scoring/ship, but skips review/verify/summary and uses the
fast (Sonnet-tier) agents. Still writes tests. Switchable to the full flow
mid-run.

### `/orc-analyze` — the System Analyst
Turns a **requirement** — a document (PDF by path or pasted, prose **or**
audit/structured) **or** a plain-language request with no doc at all — into a
scope-bounded, code-grounded requirement report. It bounds the **deliverable** to
the scope you asked for (other scopes never become tasks) while pulling **related**
adjacent scopes in as anchored, non-actionable context — labeled "do not build" —
so the build understands your scope correctly instead of guessing. It maps each
requirement to real files, and **never hallucinates about what you meant**: every
interpretation and every code claim carries `file:line` evidence, or gets tagged
as an assumption and turned into a question. It challenges you one issue at a time
with **recommended options** (it decides and recommends; you confirm) — for
example, an audit row marked "fail: missing UUID check" when the code renamed that
field. Prevents scope-bleed, stale-doc drift, and requirement hallucination.

Opt into **deep analysis** when it's worth the extra tokens and time: a wider code
sweep (the orchestrator fans out parallel read-only scouts on a plan the analyst
draws up), verify-every-claim, more clarifying questions, and implementation
options with trade-offs and risks. Outputs a human report plus a derived machine
spec; you choose to keep it as a report or take it straight into a build.

**Multiple related docs → one build (context-combiner).** After an analysis you
can analyze **another related doc** in the same scope instead of stopping. Once
two or more related analyses exist, ORC offers **context-combiner** — a dispatched
Opus 4.8 subagent that merges them into a single deduped, conflict-resolved
requirement spec. It first **verifies the analyses actually overlap** (shared
files, requirements, scope) and challenges you if they look unrelated, then
resolves cross-scope conflicts and duplicates one issue at a time until the
combined context is clear. The merged spec is a strict superset of a normal
requirement spec, so it feeds the same build pipeline unchanged. You then keep the
combined context as files or take it straight into a build.

### `/orc-plan` — the Requirement Planner
Turns a detailed request or an analyst spec into a grounded, right-sized,
dependency-checked task plan. Grounds file paths against the repo when run
standalone, trusts the analyst spec when chained. Shows the plan once for
approval, then takes it into a build or saves it as a plan file.

### `/orc-verify` — standalone verification
Verifies only your git-modified changes (build + tests + diff sanity), classifies
findings blocking vs nit, prints a summary. Read-only — never edits or commits.

### `/orc-wiki` — the project knowledge base
Scans your codebase and writes a persistent knowledge base into `wiki/` — feature
overviews, reference docs, an architecture map — and points `CLAUDE.md` at it.
Expensive and opt-in: it warns before scanning, pauses periodically, and spans
multiple sessions. `orc` and `orc-mini` consult the wiki when it exists,
sharpening their planning and scoring; when it's absent they behave exactly as
before.

---

## How model selection works (and how to verify it)

Each task is scored 0–100. The score is a base (intrinsic size) adjusted up or
down by context — core-vs-isolated, risk, blast radius, mechanical/boilerplate.
The score maps to a model via a **configurable rubric** in `skills/orc/config.md`:

- `rubric_bands` (2–8) sets the scoring granularity and picks a preset:
  **narrow** (2–5 bands) or **wide** (6–8), each with its own score→model map.
- Models span `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-opus-4-7`, and
  `claude-opus-4-8`, at medium or high effort.
- You can override the band edges and model assignments entirely.

Dispatch uses **named subagents** in `.claude/agents/`, one per role and model
(e.g. `orc-executor-sonnet-5-high`, `orc-system-analyst-opus-4-8-high`), so the
model is **pinned and inspectable**, not requested in prose. To confirm what a
task actually ran on, expand the subagent's tool-call in the transcript.

> **The cost-tier rule:** a subagent's model cannot exceed the main session's
> tier. Run your main session on Opus, or the Opus-tier agents fall back to
> Sonnet. This is the most common cause of "it used the wrong model."

### The tier guard (installed automatically)

Because that rule is so easy to trip, `orc init` installs a guard into your
`.claude/settings.json`:

- **Effort — hard block.** A `PreToolUse` hook (`hooks/orc-effort-guard.js`)
  refuses to launch `/orc` unless the session is at **high** effort. This is the
  one half Claude Code lets a hook enforce deterministically (`effort.level` /
  `$CLAUDE_EFFORT` are exposed to blocking hooks).
- **Model — warning.** Claude Code does **not** expose the model id to any
  blocking hook, so the tier can't be hard-stopped. Instead a statusline
  (`hooks/orc-statusline.js`, installed only if you don't already have one) shows
  `⛔ ORC WILL DEGRADE` whenever the model isn't `claude-opus-4-8`, and the
  orchestrator self-checks at startup. If you already run a statusline, `orc init`
  leaves it alone and prints the snippet to merge.

---

## Configuration (`orc config`)

The knobs (shipped defaults in `skills/orc/config.md`):

- `max_wave_tasks` — parallel tasks per wave (default 3; hard cap).
- `batch_pause_every` — waves between stop-and-continue pauses (default 2).
- `rubric_bands` — scoring granularity 2–8, selecting the narrow/wide preset.
- `max_scouts` — parallel read-only scouts in deep analysis (default 3).
- `default_analysis_depth` — the analyst depth gate's default (standard/deep).
- `logging` — opt-in behavior trace (default OFF). When on, ORC writes a
  persistent `.txt` per run under `log_dir` (`.claude/orc/logs/`) recording the
  flow — phases, every spawn plus the model that actually answered
  (claimed-vs-actual, catching a silent tier downgrade), scores, questions, and
  review/verify outcomes — for reviewing and improving runs afterward.
- artifact locations, the report-out target, and the trace `log_dir`.

Change them with the **`orc config`** CLI — deterministic terminal I/O, so editing
costs **zero model tokens** (nothing is loaded into a Claude session):

```bash
orc config                    # interactive menu — shows each value + default/override
orc config list               # print the effective config
orc config set max_scouts 5   # validate + write one setting
orc config reset max_scouts   # revert one key (omit key to reset all)
orc config path               # where the override file lives
```

Your changes are written to an update-safe `.claude/orc.config.yaml` override that
`orc update`/`orc upgrade` never clobber; `config.md` stays the shipped defaults.
Common knobs are offered first; risky ones (like `orchestrator_model`, which can
break the model-tier ladder) validate and warn. Add `--global` to edit `~/.claude`.
Any value can also still be overridden for a single run in-session.

---

## What's inside the package

```
templates/
├── skills/
│   ├── orc/           full orchestrator — spine, schemas, references, subskills, config
│   ├── orc-mini/      fast path
│   ├── orc-verify/    standalone git-diff verify
│   ├── orc-wiki/      project knowledge-base builder
│   ├── orc-analyze/   System Analyst — doc-optional, evidence-backed (+ report templates, spec schema)
│   ├── orc-analyze-mini/  fast-lane analyst
│   └── context-combiner/  merges 2+ related analyses into one combined spec (+ schemas)
├── commands/          /orc /orc-mini /orc-analyze /orc-plan /orc-verify /orc-wiki
└── agents/            single-role, model-pinned subagents (+ read-only scout) + MODEL-MAPPING.md
bin/cli.js             installer + config editor (init / update / upgrade / config / where)
```

The `orc` skill is a thin **spine** that loads references and subskills only when
a phase runs — so a small task never pays for the machinery of a big one.

---

## Design principles

- **Never implement at the top.** The orchestrator coordinates; scored subagents
  do the work, keeping its context lean for long runs.
- **Bound scope before parallelizing.** Intake sign-off and document analysis
  catch misunderstandings before five agents build on them.
- **Disk over memory.** Checkpoints and state-of-play files make every pause a
  clean resume point, including in a fresh session.
- **Pinned, inspectable models.** Named agents with models in frontmatter — not
  prose requests — so what ran is verifiable.
- **Additive knowledge.** The wiki improves planning when present and costs
  nothing when absent.

## Requirements

- Claude Code (reads the skills, commands, and agents).
- Node 16+ (installer only).

## License

MIT
