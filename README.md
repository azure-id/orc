<div align="center">

# 🐋 ORC

**An orchestrator skill constellation for [Claude Code](https://claude.com/claude-code).**

*Intake → analyze → plan → score → parallel subagents → review → verify → ship.*

![Version](https://img.shields.io/badge/version-0.10.0-blue.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)
![Node](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg?style=for-the-badge)
![Claude Code](https://img.shields.io/badge/Claude_Code-Skills-purple.svg?style=for-the-badge)
![Dependencies](https://img.shields.io/badge/dependencies-zero-lightgrey.svg?style=for-the-badge)
![GitHub stars](https://img.shields.io/github/stars/azure-id/orc?style=for-the-badge&color=yellow)
![Tessl review](https://img.shields.io/badge/Tessl_review-avg_84-8A2BE2.svg?style=for-the-badge)

</div>

---

ORC takes a feature — or a requirements document — and drives it through a
disciplined pipeline: understand intent, analyze docs against your actual code,
plan, dispatch scored parallel subagents, review, verify, and ship. It keeps
cost down by matching each task to the cheapest capable model, survives long
runs by checkpointing to disk, and can build a persistent knowledge base of your
project that makes every future run smarter.

ORC is **not a runtime.** It's a set of markdown **skills**, **slash commands**,
and **subagent definitions** that Claude Code reads and follows. This
zero-dependency npm package installs those files into your `.claude/` directory.

```text
                    ┌──────────────── you own scope + sign-off ────────────────┐
  feature / doc ──▶ intake ─▶ analyze ─▶ plan ─▶ score ─▶ ⇉ parallel waves ⇉ ─▶ review ─▶ verify ─▶ ship
                              (grounded)         (per task)   (cheapest capable model)     (checkpointed to disk)
```

## Changelog

### v0.10.0 — `/orc-ultra`: max-effort advisor + three judgment gates for ultra-complex work _(2026-07-12)_

A third lane above `orc-mini` and `/orc`: maximum rigor for complex and
ultra-complex requests, built to minimize wrong interpretation, silent
assumptions, dropped requirements, and quality slips.

- **New `/orc-ultra` command** — the full pipeline with `ultra_mode: true`
  forced on (run-scoped, never persisted): deep analyze, pattern findings on,
  test authoring on, security review on, and an executor **tier floor**
  (nothing below Sonnet 5 high; top bands → Opus 4.8 high). Not a separate
  spine — the orc skill + `references/ultra-mode.md`.
- **New `orc-advisor` skill + `orc-advisor-opus-4-8-max` agent** (Phase U0,
  read-only): a code-grounded advisory brief — risks, alternatives, a
  mandatory security section, a request-specific **rubric** the judges score
  against — plus `open_questions[]` relayed to you in ONE batch and the seed
  of the run's **assumption ledger** (UNCONFIRMED entries become automatic
  judge findings).
- **New `orc-judge` skill + `orc-judge-opus-4-8-max` agent**: one judge, three
  gates — after analysis, after planning (fed a deterministic **blast-radius
  map**), and after verify: implementation **fidelity** (nothing missing,
  nothing invented) + **ultra-strict quality** (security, SonarQube-class
  smells, simplification, wrong placement — blocking when justified).
  Structured verdicts (APPROVE | REVISE | ESCALATE); blocking findings need a
  verbatim anchor + a failure consequence (or category + concrete
  alternative) or they auto-downgrade; security findings never downgrade.
  REVISE loops the author (cap 2, anti-moving-goalposts convergence rule),
  then an explicit ESCALATE menu. Judge gates add to your sign-offs, never
  replace them.
- **Deterministic anti-miss core:** a `R# → task → diff hunks → verify
  evidence` **traceability matrix** built with grep/diff before gate 3 — an
  empty diff column is a caught missing implementation with no model call;
  the project's own static analysis (linter/sonar/type-checker, never
  installed) feeds the judge as blocking input to triage.
- **Plumbing:** `ADVISE`/`JUDGE` trace verbs + `judgment` GATE name; checkpoint
  `ultra` block (per-gate loop counters, brief/ledger/matrix paths — resumes
  mid-loop); MODEL-MAPPING + config fixed-role rows; 3 new linted contracts
  (`ultra_mode`, `brief_path`, `failure_consequence`) — 19 total. Ultra never
  activates in `/orc` or `orc-mini`.

<details>
<summary><b>Previous versions</b> (click to expand)</summary>

### v0.9.0 — Trust-but-verify the analyst→planner chain: quote-anchored evidence · coverage gate · anchored judgment _(2026-07-12)_
### v0.8.1 — /orc-retro delivers upstream: PR/issue to the ORC repo, channel-gated _(2026-07-12)_
### v0.8.0 — Close the loop: grounded intake · scoring anchors · OUTCOME marker · /orc-retro trace miner · eval harness _(2026-07-12)_
### v0.7.0 — Evidence everywhere: grounded plans · verbatim proof · anchored findings · contract lint · trace fixes _(2026-07-12)_
### v0.6.0 — P0–P3 ladder · house rules · deep playbooks + wired gates · 3 new languages · FE rule packs · security pass _(2026-07-11)_
### v0.5.1 — Statusline false-degrade fix _(2026-07-11)_
### v0.5.0 — Code-pattern findings: executors match your house style, invariants always enforced
### v0.4.5 — Rewrite weak worker descriptions (the real score lever)
### v0.4.4 — Act on Tessl review: raise sub-70 workers, fix cross-spine paths
### v0.4.3 — `orc-analyze`: trim description under the 1024-char skill-spec limit
### v0.4.2 — Tessl-rubric pass: worked examples + sharper mini-analyst activation
### v0.4.1 — `orc-mini`: faster, safer fast-lane — smoke gate, opt-in tests, trimmed ceremony
### v0.4.0 — Opt-in Phase 6.5 Test Authoring (writes test cases, never runs them)
### v0.3.0 — Opt-in behavior-trace logging + claimed-vs-actual model verification
### v0.2.4 — `orc-analyze`: gather anchored adjacent-scope context (non-actionable)
### v0.2.3 — Context Combiner: merge 2+ related analyses into one combined spec
### v0.2.2 — Config: enforce per-key override-first resolution
### v0.2.1 — Move config editing into the `orc config` CLI (zero-token); drop `/orc-config`
### v0.2.0 — Doc-optional evidence-backed analyst + deep mode

</details>

## Contents

- [Changelog](#changelog)
- [Why ORC exists](#why-orc-exists)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Skill quality (Tessl review)](#skill-quality-independently-reviewed)
- [How model selection works](#how-model-selection-works-and-how-to-verify-it)
- [The tier guard](#the-tier-guard-installed-automatically)
- [Configuration](#configuration-orc-config)
- [What's inside the package](#whats-inside-the-package)
- [Design principles](#design-principles)
- [Requirements](#requirements)

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

## Quick start

```bash
npm i -g orc
# or straight from GitHub — no registry needed
npm i -g github:azure-id/orc

# or if installing is causing pain, try this:
npm i -g https://github.com/azure-id/orc/archive/refs/heads/main.tar.gz
```

Then, inside a project:

```bash
orc init            # install into ./.claude          (this project)
orc init --global   # install into ~/.claude          (all projects)
orc update          # re-copy this package's files (offline; local only)
orc upgrade         # fetch the LATEST package, then apply it (pulls a new version)
orc config          # view/change settings (interactive; zero model tokens)
orc version         # print installed version + check for a newer one
orc where           # print the target paths
orc --help
```

`orc init` installs three things into `.claude/`: **skills/**, **commands/**, and
**agents/**. After installing:

1. Paste your team's PR template into `skills/orc/subskills/orc-pr/pr.md`.
2. Add `.claude/skills/orc/run/` to your project `.gitignore`.
3. **Run `/agents`** to confirm the agent model IDs your Claude Code accepts.
4. **Run your main Claude Code session on Opus** — a subagent's model can't
   exceed the main session's tier, so on a Sonnet session the Opus agents
   silently downgrade (see `agents/MODEL-MAPPING.md`).
5. If a `/command` doesn't appear, your Claude Code may read commands from a
   different folder — move the files in `commands/` there.

<details>
<summary><b>Staying up to date & upgrading</b></summary>

<br>

`orc version` prints what you have and checks the source for a newer release:

```text
$ orc version
orc 0.4.1
⬆  newer version available: 0.5.0 — run `orc upgrade`
```

Normal commands (`orc init`, `orc update`, …) also show a one-line nudge when a
newer version exists. The check hits the source's `package.json` over HTTPS, is
**cached for 24h** (so it never slows you down), and is **fail-silent** offline.
Opt out entirely with `ORC_NO_UPDATE_CHECK=1`.

**You don't even have to run a command.** The same nudge surfaces *inside Claude
Code* through ORC's hooks — with **zero model tokens**, since hooks are scripts
Claude Code runs, not model turns:

- When you invoke **`/orc`**, the `PreToolUse` guard checks the cache and shows a
  `systemMessage` — displayed to you, not added to the model's context.
- The **statusline** appends a `⬆ orc X` hint whenever a newer version is known
  (read straight from the cache — no network on that path).

`orc update` only re-copies whatever is **already installed** — it never reaches
the network. To actually move to the latest, use **`orc upgrade`**, which
refreshes the package from the source first and then applies it:

```bash
orc upgrade                  # ./.claude   — fetch latest, then update this project
orc upgrade --global         # ~/.claude   — fetch latest, then update all projects
orc upgrade --from github:azure-id/orc   # pull from a fork or any npm spec
```

If the GitHub spec fails to install (common under **NVM**), `orc upgrade`
automatically retries with a plain tarball of the default branch — no action
needed. Either way, your `.claude/orc.config.yaml` overrides are left untouched.

</details>

---

## Commands

> [!TIP]
> Multi-step flows chain naturally:
> **`/orc-analyze` → `/orc-plan` → `/orc`** — analyze a doc into a grounded spec,
> shape it into a task plan, then build it through the full pipeline.

| Command | What it does |
|---------|--------------|
| **`/orc`** | The full orchestrator: intake → planning → per-task scoring → conflict-free parallel waves → review → verify → ship. Checkpoints eagerly; resumes in a fresh session at any pause. |
| **`/orc-ultra`** | The maximum-rigor lane for complex/ultra-complex work: the full pipeline plus an Opus 4.8 **max** advisor (code-grounded brief + rubric + one batched clarification round) and three judgment gates — after analysis, after planning, and after verify (implementation fidelity + ultra-strict quality: security, smells, simplification, placement). Deep analyze, pattern/testgen/security forced on, executor tier floor. Costly by design. |
| **`/orc-mini`** | The fast path — see below. |
| **`/orc-analyze`** | The System Analyst: turns a requirement or document into a scope-bounded, code-grounded, evidence-backed spec. |
| **`/orc-plan`** | The Requirement Planner: a detailed request or analyst spec → a grounded, right-sized, dependency-checked task plan. |
| **`/orc-verify`** | Standalone verification of your git-modified changes (build + tests + diff sanity). Read-only. |
| **`/orc-wiki`** | Builds a persistent project knowledge base into `wiki/` and points `CLAUDE.md` at it. Expensive, opt-in. |
| **`/orc-pattern`** | Learns your project's real code conventions per language and caches them so executors match your house style. Reconciles a generic playbook (9 languages: React · Next.js · Vue · Angular · FastAPI · Django · NestJS · Express · Go) against your actual files — conventions defer to your codebase; security/correctness invariants and measurable validation gates always carry through to review + verify. `--refresh` to relearn. |
| **`/orc-retro`** | Mines the behavior traces (`logging: true` runs) into an AI-readable calibration report — per-band outcomes, tier downgrades, pipeline leaks — and files it to the ORC repo (`retro_repo`, default azure-id/orc) as a PR (issue fallback). Hard-gates on an authed gh CLI or GitHub MCP: neither → refuses to run. |

### `/orc` — the full orchestrator

Feature or spec → shipped code, through: intake (with a signed-off intent-spec),
planning, per-task scoring, conflict-free parallel waves, review, verify, and
ship. Checkpoints eagerly; resumes in a fresh session at any pause.

The quality pipeline in detail:

- **Every executor slice carries a standing house-rules card** (surgical changes
  only, simplicity-first, no unrequested scope, boring solution first) plus the
  intent-spec's hard constraints — and, when a code-pattern is resolved, your
  project's conventions, blocking invariants, and the playbook's **validation
  gate** (default acceptance checks, enforced only when your own tooling can
  verify them).
- **Review + verify findings land on a P0–P3 severity ladder**, each level with
  distinct handling: **P0** (broken build/tests/criteria, invariant violations)
  is auto-fixed once without asking · **P1** (correctness/security risk) gates
  the ship and asks you before the fix · **P2** (maintainability) is offered as
  an optional fix-batch · **P3** (cosmetic) is counted. On frontend work the
  reviewer also checks two capped, impact-ordered **a11y/perf rule packs**
  (file:line findings, never auto-P0).
- **Two opt-in extra phases:** a **security pass** (Phase 5.5, config
  `security_review`) that fires only on runs containing a task scored ≥ 70 —
  the risk floor for security/money/migrations/auth — sweeping the changed
  files against a 12-item OWASP/STRIDE checklist; and **test authoring**
  (Phase 6.5, config `generate_tests`) that writes test cases + `TEST-PLAN.md`
  + a curl bundle, never runs them.

### `/orc-mini` — the fast path

```text
intake (Q1–Q4, soft sign-off) ─▶ plan ─▶ ONE Sonnet-5-high subagent
   ─▶ build + test smoke gate (red blocks ship) ─▶ opt-in "write test cases?" ─▶ ship
```

Same spine as `/orc` but leaner: **lighter intake** (fewer questions, soft
sign-off), a **one-line complexity read** instead of a full scoring table, and
**one Sonnet-tier subagent** for implementation (no parallel waves). It skips the
full review/verify/summary passes, but still:

- runs a **build + test smoke gate** after implementation — a red build **blocks
  the ship** (auto-fixed once), so "never commit on a red build" actually holds;
- **offers opt-in test authoring** at the end (writes test cases, never runs them);
- **switches to the full flow mid-run** on request — the run folder and checkpoint
  are shared, so nothing is lost.

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
with **recommended options** (it decides and recommends; you confirm).

> [!NOTE]
> Opt into **deep analysis** when it's worth the extra tokens and time: a wider
> code sweep (the orchestrator fans out parallel read-only scouts on a plan the
> analyst draws up), verify-every-claim, more clarifying questions, and
> implementation options with trade-offs and risks.

**Multiple related docs → one build (context-combiner).** After an analysis you
can analyze **another related doc** in the same scope. Once two or more related
analyses exist, ORC offers **context-combiner** — a dispatched Opus 4.8 subagent
that merges them into a single deduped, conflict-resolved requirement spec. It
first **verifies the analyses actually overlap** and challenges you if they look
unrelated, then resolves cross-scope conflicts one issue at a time. The merged
spec is a strict superset of a normal requirement spec, so it feeds the same build
pipeline unchanged.

### `/orc-plan` — the Requirement Planner

Turns a detailed request or an analyst spec into a grounded, right-sized,
dependency-checked task plan. Grounds file paths against the repo when run
standalone, trusts the analyst spec when chained. Shows the plan once for
approval, then takes it into a build or saves it as a plan file.

### `/orc-verify` — standalone verification

Verifies only your git-modified changes (build + tests + diff sanity), classifies
findings on the **P0–P3 severity ladder** (P0/P1 = fix before commit, P2/P3 =
advisory), prints a summary. If `/orc-pattern` has cached a pattern for a changed
file's language, its invariants and validation gate are checked too. Read-only —
never edits or commits.

### `/orc-wiki` — the project knowledge base

Scans your codebase and writes a persistent knowledge base into `wiki/` — feature
overviews, reference docs, an architecture map — and points `CLAUDE.md` at it.
Expensive and opt-in: it warns before scanning, pauses periodically, and spans
multiple sessions. `orc` and `orc-mini` consult the wiki when it exists,
sharpening their planning and scoring; when it's absent they behave exactly as
before.

---

## Skill quality (independently reviewed)

We don't grade our own homework. 🔬 Every skill in the constellation is scored by
**[Tessl](https://tessl.io)'s skill review** — an independent LLM-as-judge that
grades a Claude agent skill on three axes and returns a **0–100** score:

- **Validation** — structure & format: valid frontmatter, required fields, a
  description within the 1024-char limit, a present body, links that resolve.
  Straight pass/fail — a skill that fails here can't even be scored.
- **Activation** — how clearly the *description* signals **when** an agent should
  load the skill: specificity, complete triggers, distinctiveness from siblings.
  *A vague description is a skill that never fires at the right moment.*
- **Implementation** — how concrete and usable the *body* is: conciseness,
  actionability (worked examples, not just prose), workflow clarity, and
  progressive disclosure.

**Bands:** 🟢 **90–100** production-ready · 🟡 **70–89** good, ships · 🔴 **below 70** needs work.

| Skill | Score | Tier |
|-------|:-----:|:----:|
| `orc-verify` | **100** | 🟢 |
| `context-combiner` | **94** | 🟢 |
| `orc-analyze` | **91** | 🟢 |
| `orc-mini` | **91** | 🟢 |
| `orc-wiki` | **90** | 🟢 |
| `orc-planner` | **87** | 🟡 |
| `orc` | **85** | 🟡 |
| `orc-testgen` | **83** | 🟡 |
| `orc-analyze-mini` | **79** | 🟡 |
| `orc-execution` | **78** | 🟡 |
| `orc-review-verify` | **73** | 🟡 |
| `orc-checkpoint` | **71** | 🟡 |
| `orc-planner-mini` | **65** | 🔴 |

**12 of 13 skills clear the 70 bar and 5 are production-ready (90+).** Better yet,
acting on the review's *own* findings is how several got there — `orc-execution`
jumped **60 → 78** and `orc-planner` **78 → 87** once their descriptions stated
concrete capability and their bodies inlined the return contract. The lone
holdout, `orc-planner-mini` (65), is a *dispatched-only worker*: Tessl's
trigger-quality axis rewards **natural user phrases**, which an internal worker a
user never types legitimately doesn't have — an inherent ceiling, not a bug.
*(The PR-templating subskill `orc-pr` wasn't part of this run.)*

> [!NOTE]
> **Reproduce it.** Install the [Tessl CLI](https://tessl.io), then point it at any
> local skill directory — no publishing needed:
> ```bash
> tessl review run ./templates/skills/orc-mini --workspace <your-workspace>
> ```

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

> [!IMPORTANT]
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

| Key | Default | Purpose |
|-----|---------|---------|
| `max_wave_tasks` | `3` | Parallel tasks per wave (hard cap). |
| `batch_pause_every` | `2` | Waves between stop-and-continue pauses. |
| `rubric_bands` | `5` | Scoring granularity 2–8, selecting the narrow/wide preset. |
| `max_scouts` | `3` | Parallel read-only scouts in deep analysis. |
| `default_analysis_depth` | `standard` | The analyst depth gate's default (standard/deep). |
| `generate_tests` | `false` | Opt-in test authoring. When on, ORC **writes** test cases (automated files, a manual `TEST-PLAN.md`, and a Postman-importable `test-cases.http` curl bundle for HTTP APIs). It never runs them; you test manually. |
| `logging` | `false` | Opt-in behavior trace. Writes a persistent `.txt` per run under `log_dir` recording phases, every spawn plus the model that actually answered (claimed-vs-actual, catching a silent tier downgrade), scores, and outcomes. |
| `pattern_findings` | `ask` | Code-pattern matching (`ask`/`on`/`off`). On an FE/BE cache miss, `ask` prompts to learn the project's conventions via `orc-pattern` (or go language-agnostic), `on` auto-learns, `off` stays agnostic. A learned pattern makes executors match your house style; security/correctness invariants are always enforced. |
| `security_review` | `off` | Opt-in security pass (Phase 5.5, `off`/`ask`/`on`). Fires only on runs where a task scored ≥ 70 (the risk floor: security/money/migrations/auth). Sweeps the run's changed files against a 12-item OWASP/STRIDE checklist — wraps Semgrep if you have it installed, never installs anything. |
| `orc_wiki_pattern_findings` | `false` | When on, `orc-wiki` also learns code-patterns for every detected language during its scan, pre-warming the cache so later runs skip the prompt. |

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
Add `--global` to edit `~/.claude`. Any value can also be overridden for a single
run in-session.

---

## What's inside the package

```
templates/
├── skills/
│   ├── orc/                 full orchestrator — spine, schemas, references, subskills, config
│   ├── orc-mini/            fast path (smoke gate + opt-in test authoring)
│   ├── orc-verify/          standalone git-diff verify
│   ├── orc-wiki/            project knowledge-base builder
│   ├── orc-analyze/         System Analyst — doc-optional, evidence-backed (+ report templates, spec schema)
│   ├── orc-analyze-mini/    fast-lane analyst
│   ├── orc-pattern/         code-pattern codifier — 9 language playbooks + a11y/perf rule packs + reconcile (opt-in)
│   ├── orc-retro/           trace miner — calibration report PR'd to retro_repo (gh/MCP gated)
│   ├── orc-advisor/         ultra-lane advisory brief + rubric + clarification round (/orc-ultra only)
│   ├── orc-judge/           ultra-lane judgment gates — analysis / plan / implementation (/orc-ultra only)
│   └── context-combiner/    merges 2+ related analyses into one combined spec (+ schemas)
├── commands/                /orc /orc-ultra /orc-mini /orc-analyze /orc-plan /orc-verify /orc-wiki /orc-pattern /orc-retro
├── hooks/                   effort guard (PreToolUse) · statusline warning · behavior trace
└── agents/                  single-role, model-pinned subagents (+ read-only scout) + MODEL-MAPPING.md
bin/cli.js                   installer + config editor (init / update / upgrade / config / where)
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
- **Your codebase wins.** Learned patterns defer conventions to your project;
  only security/correctness invariants are non-negotiable, and quality bars
  gate only when your own tooling can measure them.
- **Additive knowledge.** The wiki improves planning when present and costs
  nothing when absent.

---

## Requirements

- **Claude Code** (reads the skills, commands, and agents).
- **Node 16+** (installer only — the skills themselves have zero dependencies).

## License

[MIT](LICENSE)
