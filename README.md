<div align="center">

# 🐋 ORC

**An orchestrator skill constellation for [Claude Code](https://claude.com/claude-code).**

*Intake → analyze → plan → score → parallel subagents → review → verify → ship.*

![Version](https://img.shields.io/badge/version-0.31.0-blue.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=for-the-badge)
![Claude Code](https://img.shields.io/badge/Claude_Code-Skills-purple.svg?style=for-the-badge)
![Dependencies](https://img.shields.io/badge/dependencies-zero-lightgrey.svg?style=for-the-badge)
![GitHub stars](https://img.shields.io/github/stars/azure-id/orc?style=for-the-badge&color=yellow)

</div>

---

> [!IMPORTANT]
> **🚀 `orc-open` is released — ORC for non-Claude agents.**
> A provider-agnostic port of the ORC pipeline for use outside Claude Code is now
> available: **[github.com/azure-id/orc-open](https://github.com/azure-id/orc-open)**.
> If you run a different coding agent (or want ORC's orchestration decoupled from
> Claude Code), start there. This repository remains the Claude Code–native
> constellation.

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

### v0.31.0 — Execution-integrity revamp: plan handoff, attributable traces, facet scoring _(2026-07-23)_

Driven by a real cross-session run trace where a plan built in one session was
executed in another and drifted. Five fixes, verifier untouched (it performed
well). **Plan handoff is a real entry contract:** when the run input IS a plan
(pasted planning-output, a `plan-{name}.md` path, or a saved planner checkpoint),
ORC no longer improvises task-by-task — it bootstraps the trace, schema-validates,
applies a `plan_head` staleness valve, RE-RUNS the full Phase 1 exit gate in the
executing session (the deterministic catch for the phantom-file drift that
started this), relays the plan's open questions, then runs the normal Phase 2–8.
**Attributable RETURN traces:** the trace hook now writes
`RETURN <agent> :: <desc> dur=<m>m<s>s [model=<id>]` — it attributes each finish
to its agent (from the SubagentStop payload, FIFO `~`-marked on older Claude
Code), echoes the dispatch's description + wall-clock duration, and captures the
`actual_model` when it is visible, so a bare `SPAWN`/`RETURN` skeleton is no
longer unattributable. **Waves always exist:** wave grouping now runs for every
run with ≥2 tasks, sequential included — dispatch style controls only intra-wave
concurrency, so the batch pause always binds to wave numbers instead of
degenerating to per-task stops. **Facet-scored rubric:** the planner (the party
that read the code) emits per-task `facets` — breadth, novelty, logic,
test-surface, cited risk, uncertainty — and the orchestrator computes the score
with a fixed published formula and re-validates the facts; no number is judged
from a task title, and **every** fix-cycle dispatch is scored too (a fix in a
risk area can never silently drop to a cheap model). **Planner clarity:** plans
return `plan_confidence` + `open_questions[]`, with a step-back valve to
`orc-analyze` when confidence is low.

<details>
<summary><b>Previous versions</b> (click to expand)</summary>

### v0.30.0 — Scoring revamp, Fable 5 role override, tier-aware guards, `orc onboarding` _(2026-07-23)_

### v0.29.0 — Drift-prevention hardening: install manifest + prune, `orc doctor`, a real test suite _(2026-07-22)_

### v0.28.1 — Defect fixes: package encoding, trace event routing, count/doc drift _(2026-07-22)_

### v0.28.0 — Run integrity: rich full-lane traces, deterministic wave stop, visible knowledge gates _(2026-07-21)_

### v0.27.0 — `/orc-poly`: plan one change across two-or-more repos without drift _(2026-07-20)_

### v0.26.0 — Test-gen output pinned to a visible `test-generator/<change-slug>/` deliverable _(2026-07-19)_

### v0.25.1 — Eval report: the full 17-lane suite graded against the v0.25.0 payload _(2026-07-18)_
### v0.25.0 — Deterministic artifact detection: a generated wiki/pattern is never missed _(2026-07-18)_
### v0.24.0 — Crosslink fused into wiki generation: always-on, per-scan-task, never wiped _(2026-07-18)_
### v0.23.0 — Trace fix: SPAWN restored on the `Agent` tool, stale runs rotate to fresh files _(2026-07-18)_

### v0.22.0 — `/orc-learn`: per-feature onboarding docs — learning.md + knowledge.md, wiki-deep, git-ignored _(2026-07-17)_

### v0.21.0 — Statusline shows live subscription usage: 5h ↔ weekly, official numbers _(2026-07-16)_

### v0.20.0 — One source of truth: generated executor agents + shared cross-lane contracts _(2026-07-16)_

### v0.19.0 — Thin spines: skill compaction, budget lint, and a trace that logs every phase _(2026-07-16)_

### v0.18.0 — `orc wiki sync`: the wiki registers itself — a paused scan is no longer an invisible wiki _(2026-07-15)_

### v0.17.3 — Trace the wiki consult: Phase 1 now logs whether the run grounded in the wiki (and if it was stale) _(2026-07-14)_
### v0.17.2 — Behavior-trace logging is permanent + the trace folder is now created deterministically _(2026-07-14)_
### v0.17.1 — Complete cross-repo crosslink setup guide in the orc-wiki README _(2026-07-14)_
### v0.17.0 — `orc crosslink`: cross-repo wiki references — advisory boundary contracts _(2026-07-14)_
### v0.16.1 — Interactive `orc diy` composer + numbered picks in `orc config` _(2026-07-14)_
### v0.16.0 — `/orc-diy`: build your own lane — CLI-composed flow, compiled, hard-gated _(2026-07-14)_
### v0.15.0 — Wiki v2: evidence-anchored docs · per-file staleness registry · integrity gate _(2026-07-14)_
### v0.14.0 — Postgres data-access playbook: cross-cutting query grounding _(2026-07-13)_
### v0.13.0 — `/orc-claude`: local CLAUDE.md builder — fenced sections, fingerprint refresh, zero questions _(2026-07-12)_

### v0.12.0 — Lossless context-combiner: conservation gate · overlap taxonomy · evidence freshness _(2026-07-12)_
### v0.11.0 — `/orc-fast`: knowledge-gated speed lane + wiki freshness infrastructure _(2026-07-12)_
### v0.10.1 — README: a fuller "Why ORC exists" _(2026-07-12)_
### v0.10.0 — `/orc-ultra`: max-effort advisor + three judgment gates for ultra-complex work _(2026-07-12)_
### v0.9.0 — Trust-but-verify the analyst→planner chain: quote-anchored evidence · coverage gate · anchored judgment _(2026-07-12)_
### v0.8.1 — /orc-retro delivers upstream: PR/issue to the ORC repo, channel-gated _(2026-07-12)_
### v0.8.0 — Close the loop: grounded intake · scoring anchors · OUTCOME marker · /orc-retro trace miner · eval harness _(2026-07-12)_
### v0.7.0 — Evidence everywhere: grounded plans · verbatim proof · anchored findings · contract lint · trace fixes _(2026-07-12)_
### v0.6.0 — P0–P3 ladder · house rules · deep playbooks + wired gates · 3 new languages · FE rule packs · security pass _(2026-07-11)_
### v0.5.1 — Statusline false-degrade fix _(2026-07-11)_
### v0.5.0 — Code-pattern findings: executors match your house style, invariants always enforced
### v0.4.5 — Rewrite weak worker descriptions (the real score lever)
### v0.4.4 — Act on external review: raise sub-70 workers, fix cross-spine paths
### v0.4.3 — `orc-analyze`: trim description under the 1024-char skill-spec limit
### v0.4.2 — External-review pass: worked examples + sharper mini-analyst activation
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
- [Eval status](#eval-status)
- [How model selection works](#how-model-selection-works-and-how-to-verify-it)
- [The tier guard](#the-tier-guard-installed-automatically)
- [Configuration](#configuration-orc-config)
- [What's inside the package](#whats-inside-the-package)
- [Design principles](#design-principles)
- [Requirements](#requirements)

---

## Why ORC exists

Hand a real feature to a single agent and it fails the same ways every time: it
picks one reading of your requirements silently, runs the top model on
everything, forgets decisions when context compacts, says "done" against a
definition of done nobody wrote, cites code that doesn't exist, and leaves
nothing to inspect. These are **process problems** — the ones teams solved with
roles, reviews, and written agreements. ORC encodes that discipline as skills:

- **Coordination and labor are separate jobs.** The orchestrator never
  implements — even a one-line change goes to a spawned subagent — keeping its
  context lean for the whole run.
- **Every task is scored, and the score picks the model.** You see the table
  before anything dispatches; named, model-pinned agents make what ran
  verifiable, not a prose request.
- **"Done" is written before work starts.** Intake produces a signed-off
  intent-spec whose definition-of-done becomes the end verification; with
  documents, the analyst grounds every requirement in real code first.
- **Nothing is trusted, everything is attested.** `file:line` quotes, grounding
  attestations, verbatim build output, anchored findings — the orchestrator
  spot-checks each on return, so a hallucinated citation bounces instead of
  riding into a slice.
- **Disk is the source of truth.** Eager checkpoints make every pause — planned,
  token-limit, or crash — a clean resume, even in a fresh session.
- **Rigor is a dial.** The same spine runs as `orc-mini` (one subagent), `/orc`
  (real features), and `/orc-ultra` (max-effort advisor + judgment gates) when a
  miss is expensive.
- **The system learns.** Code patterns make executors match your house style,
  the optional wiki sharpens every future plan, and behavior traces feed
  `/orc-retro`, which recalibrates scoring from real runs.

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
orc wiki            # wiki registration state (registered / UNREGISTERED / out of sync)
orc wiki sync       # rebuild the wiki index + manifest from the docs (instant, no re-scan)
orc pattern status  # deterministic "does a cached code-pattern exist" probe (exit 1 when absent)
orc version         # print installed version + check for a newer one
orc where           # print the target paths
orc --help
```

> **"ORC can't see my wiki" / `orc crosslink` says there's no wiki-meta.json?**
> Run **`orc wiki sync`**, not a re-scan. Docs without a manifest are
> *UNREGISTERED*, not missing — common when a scan stopped at one of `/orc-wiki`'s
> 5-area pauses. Sync rebuilds the index from the docs you already have, for free.

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
| **`/orc-ultra`** | Maximum-rigor lane: the full pipeline plus an Opus 4.8 **max** advisor (brief + rubric + one clarification round) and three judgment gates (after analysis, planning, and verify). Deep analyze, pattern/testgen/security forced on, executor tier floor. Costly by design. |
| **`/orc-mini`** | The fast path — see below. |
| **`/orc-fast`** | Fastest lane — knowledge-gated: needs a fresh wiki + cached code-pattern, skips analyst/planner, one Sonnet 4.6 high executor + smoke gate. Falls back to `orc-mini` when a prerequisite is missing. See below. |
| **`/orc-diy`** | **Your own lane** — runs the flow you composed with the `orc diy` CLI. Hard-gated: unconfigured/stale → offers plain `/orc`. Guide: [ORC-DIY README](templates/skills/orc-diy/README.md). |
| **`/orc-analyze`** | System Analyst: a requirement or document → a scope-bounded, code-grounded, evidence-backed spec. |
| **`/orc-plan`** | Requirement Planner: a request or analyst spec → a grounded, right-sized, dependency-checked task plan. Splits an orc-poly `poly-spec.md` into one plan per repo. |
| **`/orc-poly`** | **Poly-repo planning.** Plan ONE change spanning 2+ repos (BE endpoint + FE UI, service + gRPC consumer) without drift. Run in the HOST repo, paste each PEER path; it reads every repo's wiki + crosslink, pins the shared boundary into a frozen `interface-contract.md`, and splits into one plan per repo. PEER source read-only; never builds. |
| **`/orc-verify`** | Standalone verification of git-modified changes (build + tests + diff sanity). Read-only. |
| **`/orc-wiki`** | Builds a persistent knowledge base into `wiki/` and points `CLAUDE.md` at it. Expensive, opt-in. Powers **cross-repo crosslink** — guide: [ORC-WIKI README](templates/skills/orc-wiki/README.md). |
| **`/orc-pattern`** | Learns and caches your real code conventions per language so executors match your house style. Reconciles a generic playbook (9 languages) against your files — conventions defer to your codebase; security/correctness invariants always carry through. `--refresh` to relearn. |
| **`/orc-claude`** | Builds/refreshes the **local repo's** `CLAUDE.md` from verified facts — fenced, version-stamped sections, fingerprint-scoped refresh. Zero questions; user content never trimmed, wiki block byte-preserved. |
| **`/orc-learn`** | Per-feature **onboarding docs** for humans — `learning-docs/<feature>/learning.md` (mental model, walkthrough, recipes, FAQ) + `knowledge.md` (`file:line`-anchored). Local, git-ignored; `refresh` regenerates only what you pick. |
| **`/orc-retro`** | Mines behavior traces into an AI-readable calibration report (per-band outcomes, downgrades, pipeline leaks) and files it to the ORC repo (`retro_repo`) as a PR (issue fallback). Hard-gates on an authed gh CLI or GitHub MCP. |

### `/orc` — the full orchestrator

Feature or spec → shipped code: intake (signed-off intent-spec) → planning →
per-task scoring → conflict-free parallel waves → review → verify → ship.
Checkpoints eagerly; resumes in a fresh session at any pause. Also accepts a
**handed-off plan** (pasted planning-output or a saved plan file) — it re-grounds
and re-scores the plan in the executing session before building.

- **Every executor slice carries a house-rules card** (surgical, simplicity-first,
  no scope creep) plus the intent-spec's constraints and — when a code-pattern is
  resolved — your conventions, blocking invariants, and the playbook's
  **validation gate** (checked only when your own tooling can verify it).
- **Review + verify findings land on a P0–P3 ladder:** P0 (broken
  build/tests/invariants) auto-fixed once · P1 (correctness/security) gates ship,
  asks first · P2 optional fix-batch · P3 counted. Frontend work also gets capped
  a11y/perf rule packs.
- **Two opt-in phases:** a **security pass** (`security_review`, fires only when a
  task scored ≥ 70) sweeping changed files against a 12-item OWASP/STRIDE
  checklist, and **test authoring** (`generate_tests`) that writes test cases +
  `TEST-PLAN.md` + a curl bundle but never runs them.

### `/orc-mini` — the fast path

```text
intake (Q1–Q4, soft sign-off) ─▶ plan ─▶ ONE Sonnet-5-high subagent
   ─▶ build + test smoke gate (red blocks ship) ─▶ opt-in "write test cases?" ─▶ ship
```

Same spine as `/orc`, leaner: lighter intake, a one-line complexity read (no
scoring table), and one Sonnet-tier subagent (no parallel waves). It skips the
full review/verify/summary passes but still runs a **build + test smoke gate**
(a red build blocks the ship, auto-fixed once), **offers opt-in test authoring**,
and **switches to the full flow mid-run** on request (shared run folder +
checkpoint, so nothing is lost).

### `/orc-fast` — the fastest lane (knowledge-gated)

```text
preflight (fresh wiki? pattern cache?) ─▶ fit gate + micro-intake (ONE ask)
   ─▶ ONE Sonnet-4.6-high executor (wiki pointers + literal pattern)
   ─▶ build + test smoke gate (one repair round, red blocks ship) ─▶ ship
```

Where `orc-mini` pays for an analyst-lite and planner-lite, `orc-fast` pays for
**neither** — the wiki supplies grounding, the pattern cache supplies house
style. Two hard preflight prerequisites: a **fresh wiki** (freshness computed
live from `wiki-meta.json`; on STALE you refresh, drop to orc-mini, or continue)
and a **cached code-pattern** for the request's language. Either missing →
**automatic fallback to `orc-mini`**, request carried over — the chat never
stops. With no scoring or planning judgment, the orchestrator runs fine at
**Sonnet medium**. `/orc-fast` is the payoff for having run `/orc-wiki` and
`/orc-pattern`.

### `/orc-diy` — build your own lane

```text
orc diy init ─▶ orc diy set … ─▶ orc diy compile        (terminal, zero tokens)
                                       │
/orc-diy <request>  ─▶ hard gate ─▶ runs YOUR compiled flow
```

The shipped lanes fix the rigor/speed trade; `orc-diy` lets you pick it — which
phases run and how strict, rubric scoring or one fixed executor, autonomy, ship
mode, session tier. Everything is composed in the **terminal** with the `orc diy`
CLI and compiled into a flow file; Claude never invents or edits it in-session.
Unconfigured or stale → `/orc-diy` refuses and offers plain `/orc`. Safety
boundaries (never-implement, checkpoints, wave conflict rules, severity ladder,
red-build ship block) are locked into every flow.

> [!IMPORTANT]
> **The how-to lives in its own guide, not in this README:**
> [`templates/skills/orc-diy/README.md`](templates/skills/orc-diy/README.md)
> (installed at `.claude/skills/orc-diy/README.md`). Read that for the key
> reference, presets, tier rules, and the compile workflow.

### `/orc-analyze` — the System Analyst

Turns a **requirement** — a document (PDF by path or pasted, prose or
audit/structured) or a plain-language request with no doc — into a scope-bounded,
code-grounded report. It bounds the **deliverable** to the scope you asked for
while pulling related adjacent scopes in as anchored "do not build" context. It
maps each requirement to real files and **never hallucinates about what you
meant**: every interpretation and code claim carries `file:line` evidence or
becomes a question. It challenges you one issue at a time with **recommended
options**. Opt into **deep analysis** for a wider sweep (parallel read-only
scouts), verify-every-claim, and implementation options with trade-offs.

**Multiple related docs → one build (context-combiner).** Once 2+ related
analyses exist, a dispatched Opus 4.8 subagent merges them into one deduped,
conflict-resolved spec: it verifies real overlap, pools all source requirements
(never pairwise), splits partial overlaps rather than collapsing them, and a
**conservation gate blocks handoff below 100% coverage** (dropping anything needs
your call). Inherited evidence is re-checked against HEAD. The merged spec is a
superset of a normal spec, so it feeds the build pipeline unchanged.

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

Scans your codebase into a persistent `wiki/` — feature overviews, cross-cutting
reference maps (API surface, data model, glossary, config/env), an architecture
map, a structured `INDEX.md` — and points `CLAUDE.md` at it. Expensive and
opt-in: it warns before scanning, pauses periodically, spans sessions. `orc` and
`orc-mini` consult it when present (sharper planning/scoring) and behave as
before when absent; `orc-fast` requires it.

- **Evidence-anchored (v2).** Every contract claim (routes, tables, events,
  config, testing map) cites its file — unanchored claims are omitted, not
  guessed. Every run ends with an integrity self-check, and precedence is
  explicit: **code > fresh wiki > stale wiki > model priors**.
- **Freshness is computed, never stored.** Each scan writes a `wiki-meta.json`
  manifest; consumers measure commit distance on read (FRESH / AGING / STALE),
  shown live in the statusline. Refresh is **incremental** — it re-scans only the
  docs affected since the last scan and sweeps for coverage gaps + dead docs.
- **Cross-repo crosslink.** In a multi-repo setup, crosslink lets one repo
  reference another's wiki *at the integration boundary* so executors build
  against the real contract. Every scan publishes this repo's boundary as tag
  files; the `orc crosslink` CLI draws the graph; `/orc`/`/orc-fast`/`/orc-mini`
  inject the linked contract only where a slice touches a boundary. **Advisory,
  never blocking**, reads foreign *wiki* only.

**Full setup guide:**
[`templates/skills/orc-wiki/README.md`](templates/skills/orc-wiki/README.md).

---

## Eval status

The constellation is graded **end-to-end**, not just per-file: a 17-lane
executable eval suite runs every lane against a sandboxed Express fixture and
grades from on-disk evidence (behavior traces, run folders, artifacts). Headline:
**13/13 evidenced lanes passed their core contract, with zero silent model
downgrades across ~35 subagent dispatches.** Full graded results —
[EVAL-REPORT.md](EVAL-REPORT.md).

---

## How model selection works (and how to verify it)

Each task is scored 0–100 by **arithmetic, not judgment**: the planner (the party
that read every file) emits per-task **facets** — breadth, novelty, logic,
test-surface, cited risk, uncertainty — and the orchestrator runs a fixed
published formula over them, so no number is guessed from a task title. A cited
risk facet (auth/money/migration/…) forces a ≥70 floor; **every** fix-cycle
dispatch is scored the same way. The score maps through a **single 8-band
score→model table** in `skills/orc/config.md`:

- Bands span `claude-haiku-4-5` → `claude-sonnet-4-6` → `claude-sonnet-5` →
  `claude-opus-4-7` → `claude-opus-4-8`, at medium/high effort (`claude-fable-5`
  via the opt-in role override).
- `rubric_bands` (2–8) sets **report granularity only** — the table is always the
  same; override the band edges/models entirely if you want.

Dispatch uses **named subagents** in `.claude/agents/`, one per role and model
(e.g. `orc-executor-sonnet-5-high`), so the model is **pinned and inspectable**,
not requested in prose. To confirm what a task ran on, expand its tool-call — or
read the behavior trace, where each `RETURN` now records the actual model.

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
| `rubric_bands` | `5` | Scoring **report** granularity 2–8 (the score→model table is always the single 8-band one). |
| `max_scouts` | `3` | Parallel read-only scouts in deep analysis. |
| `default_analysis_depth` | `standard` | The analyst depth gate's default (standard/deep). |
| `generate_tests` | `false` | Opt-in test authoring. When on, ORC **writes** test cases (automated files, a manual `TEST-PLAN.md`, and a Postman-importable `test-cases.http` curl bundle for HTTP APIs). It never runs them; you test manually. |
| `pattern_findings` | `ask` | Code-pattern matching (`ask`/`on`/`off`). On an FE/BE cache miss, `ask` prompts to learn the project's conventions via `orc-pattern` (or go language-agnostic), `on` auto-learns, `off` stays agnostic. A learned pattern makes executors match your house style; security/correctness invariants are always enforced. |
| `security_review` | `off` | Opt-in security pass (Phase 5.5, `off`/`ask`/`on`). Fires only on runs where a task scored ≥ 70 (the risk floor: security/money/migrations/auth). Sweeps the run's changed files against a 12-item OWASP/STRIDE checklist — wraps Semgrep if you have it installed, never installs anything. |
| `orc_wiki_pattern_findings` | `false` | When on, `orc-wiki` also learns code-patterns for every detected language during its scan, pre-warming the cache so later runs skip the prompt. |
| `wiki_fresh_max` / `wiki_aging_max` | `10` / `30` | Wiki freshness tier edges (commit distance since the last scan → FRESH / AGING / STALE). Computed on read from the `wiki-meta.json` manifest — never stored. |
| `wiki_refresh_ask_tasks` / `wiki_refresh_ask_files` | `3` / `10` | BIG-run trigger for the post-ship "refresh wiki now?" ask (full + ultra lanes, only when the run touched wiki-covered files). |

**Behavior-trace logging is permanent (always on)** — every run writes a
persistent `.txt` under `log_dir` (default `.claude/orc/logs/`) recording phases,
every spawn plus the model that actually answered (claimed-vs-actual, catching a
silent tier downgrade), scores, and outcomes. There is no on/off key; only
`log_dir` (advanced) relocates it.

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

> The custom lane has its **own** CLI family (`orc diy …`) and its own config
> file — see the separate [ORC-DIY README](templates/skills/orc-diy/README.md);
> it is not part of `orc config`.

---

## What's inside the package

```
templates/
├── skills/
│   ├── orc/                 full orchestrator — spine, schemas, references, subskills, config
│   ├── orc-mini/            fast path (smoke gate + opt-in test authoring)
│   ├── orc-fast/            fastest lane — knowledge-gated, falls back to orc-mini
│   ├── orc-diy/             build-your-own lane — CLI-composed, compiled, hard-gated (see its own README)
│   ├── orc-verify/          standalone git-diff verify
│   ├── orc-wiki/            project knowledge-base builder
│   ├── orc-analyze/         System Analyst — doc-optional, evidence-backed (+ report templates, spec schema)
│   ├── orc-analyze-mini/    fast-lane analyst
│   ├── orc-pattern/         code-pattern codifier — 9 language playbooks + a11y/perf rule packs + reconcile (opt-in)
│   ├── orc-claude/          local CLAUDE.md builder — fenced sections, fingerprint refresh, zero questions
│   ├── orc-learn/           per-feature onboarding docs — wiki-deep, git-ignored learning-docs/
│   ├── orc-poly/            poly-repo planning — frozen interface contract + one plan per repo
│   ├── orc-retro/           trace miner — calibration report PR'd to retro_repo (gh/MCP gated)
│   ├── orc-advisor/         ultra-lane advisory brief + rubric + clarification round (/orc-ultra only)
│   ├── orc-judge/           ultra-lane judgment gates — analysis / plan / implementation (/orc-ultra only)
│   └── context-combiner/    merges 2+ related analyses into one combined spec (+ schemas)
├── commands/                /orc /orc-ultra /orc-mini /orc-fast /orc-diy /orc-analyze /orc-plan /orc-poly /orc-verify /orc-wiki /orc-pattern /orc-retro /orc-claude /orc-learn
├── hooks/                   effort guard (PreToolUse) · statusline warning · behavior trace
└── agents/                  single-role, model-pinned subagents (+ read-only scout) + MODEL-MAPPING.md
bin/cli.js                   installer + config editor + flow composer (init / update / upgrade / config / diy / where)
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
- **Node 18+** (installer only — the skills themselves have zero dependencies).

## License

[MIT](LICENSE)
