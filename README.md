<div align="center">

# 🐋 ORC

**An orchestrator skill constellation for [Claude Code](https://claude.com/claude-code).**

*Intake → analyze → plan → score → parallel subagents → review → verify → ship.*

![Version](https://img.shields.io/badge/version-0.47.0-blue.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=for-the-badge)
![Claude Code](https://img.shields.io/badge/Claude_Code-Skills-purple.svg?style=for-the-badge)
![Dependencies](https://img.shields.io/badge/dependencies-zero-lightgrey.svg?style=for-the-badge)
![GitHub stars](https://img.shields.io/github/stars/azure-id/orc?style=for-the-badge&color=yellow)

**Latest: v0.47.0** · updated 2026-08-12 · [full changelog](CHANGELOG.md)

</div>

---

> [!IMPORTANT]
> **`orc-open` is released — ORC for non-Claude agents.**
> A provider-agnostic port of the pipeline:
> **[github.com/azure-id/orc-open](https://github.com/azure-id/orc-open)**. Use it
> if you run a different coding agent. This repository stays Claude Code–native.

---

## What ORC is

You give ORC a feature — or a requirements document. It works out what you
meant, plans the work, sends each task to the **cheapest model that can still do
it**, runs the tasks that do not collide **at the same time**, reviews the
result, verifies it against a definition of done you signed off, and ships it.

It writes its state to disk as it goes, so a long run survives a pause, a token
limit, or a brand new chat session.

**ORC is not a program that runs.** It is a set of markdown **skills**, **slash
commands** and **subagent definitions** that Claude Code reads and follows. This
zero-dependency npm package copies those files into your `.claude/` folder.

```text
                    ┌──────────────── you own scope + sign-off ────────────────┐
  feature / doc ──▶ intake ─▶ analyze ─▶ plan ─▶ score ─▶ ⇉ parallel waves ⇉ ─▶ review ─▶ verify ─▶ ship
                              (grounded)         (per task)   (cheapest capable model)     (checkpointed to disk)
```

---

## 👀 See it run before you run it

Every lane is written out as a **mocked run**: what you type, what ORC prints
back, and the files that land on disk. Nothing was executed to make them — they
exist so you never have to spend tokens to find out what a command does.

### **▶ [Start here: `mock-run/INDEX.md`](mock-run/INDEX.md)**

Also available without leaving your machine:

```bash
orc mock-run list           # every walkthrough, in reading order
orc mock-run show orc-pact  # read one
orc ui                      # ▸ Mocked Skill Use  — the same docs, searchable
```

---

## Why it works this way

A single agent handed a real feature fails the same ways every time: it silently
picks one reading of your request, runs the most expensive model on everything,
forgets decisions when the context compacts, says "done" against a definition
nobody wrote, cites code that does not exist, and leaves nothing to inspect.

Those are **process problems** — the ones teams solved with roles, reviews and
written agreements. ORC writes that discipline down as skills:

- **Coordinating and doing are different jobs.** The orchestrator never
  implements. Even a one-line change goes to a subagent, which keeps its own
  context lean for the whole run.
- **Every task is scored, and the score picks the model.** You see the table
  before anything starts, and the agents are named and model-pinned, so what ran
  is a fact you can check.
- **"Done" is written before the work starts.** Intake produces a signed-off
  spec whose definition of done becomes the final verification.
- **Nothing is trusted, everything is attested.** `file:line` quotes, verbatim
  build output, anchored findings — and the orchestrator spot-checks them, so a
  made-up citation bounces instead of riding into a task.
- **Disk beats memory.** Eager checkpoints turn every pause into a clean resume,
  including in a fresh session.
- **Rigor is a dial.** The same spine runs as `/orc-mini` (one subagent), `/orc`
  (real features), and `/orc-ultra` (advisor plus judgment gates).
- **It learns.** Code patterns make executors write like your codebase, the wiki
  sharpens every future plan, and traces feed `/orc-retro`, which recalibrates
  the scoring from real runs.

---

## Quick start

```bash
npm i -g orc
# or straight from GitHub — no registry needed
npm i -g github:azure-id/orc
# or, if the install fights you:
npm i -g https://github.com/azure-id/orc/archive/refs/heads/main.tar.gz
```

Then, inside a project:

```bash
orc init            # install into ./.claude   (this project)
orc init --global   # install into ~/.claude   (all projects)
orc onboarding      # the whole walkthrough in the terminal — no GitHub needed
orc config          # view or change settings (zero model tokens)
orc ui              # the local control panel
orc --help          # every command
```

After installing:

1. Paste your team's PR template into `skills/orc/subskills/orc-pr/pr.md`.
2. Add `.claude/orc/run/` to your project `.gitignore`.
3. Run **`/agents`** to confirm your Claude Code accepts the agent model ids.
4. **Run your main session on Opus 5.** A subagent can never use a better model
   than your session. This is the most common cause of "it used the wrong
   model" — see [model selection](guides/model-selection.md).
5. If a `/command` does not appear, your Claude Code may read commands from a
   different folder — move the files in `commands/` there.

<details>
<summary><b>Staying up to date</b></summary>

<br>

`orc update` re-copies the files already in this package. It never uses the
network. **`orc upgrade` is the one that pulls a new version**: it fetches the
newest package first, then applies it. Your `.claude/orc.config.yaml` survives
both.

```bash
orc version                  # what you have, and whether something newer exists
orc changelog                # what you would GET by upgrading
orc upgrade                  # fetch the latest, then update this project
orc upgrade --global         # the same for ~/.claude
orc upgrade --from github:azure-id/orc   # a fork, or any npm spec
```

The update check reads the source over HTTPS, is cached for 24 hours, and fails
silently when you are offline. Turn it off with `ORC_NO_UPDATE_CHECK=1`.

You do not have to run a command to hear about it: the same notice appears
inside Claude Code through ORC's hooks, at **zero model tokens** — hooks are
scripts Claude Code runs, not model turns.

If the GitHub spec fails to install (common under **NVM**), `orc upgrade` retries
with a plain tarball by itself.

</details>

> **"ORC cannot see my wiki"?** Run **`orc wiki sync`**, not a new scan. Docs
> without a manifest are *unregistered*, not missing — common when a scan stopped
> at one of `/orc-wiki`'s pauses. Sync rebuilds the index from the docs you
> already have, for free.

---

## The lanes

> [!TIP]
> They chain naturally: **`/orc-brainstorm` → `/orc-grill` → `/orc-analyze` →
> `/orc-plan` → `/orc-route` → `/orc`**. You can start anywhere.

### Build something

| Command | What it does | Mocked run |
|---|---|---|
| **`/orc`** | The full pipeline: intake → plan → scored parallel waves → review → verify → ship. Checkpoints eagerly; resumes in a fresh session. | [see it](mock-run/orc.md) |
| **`/orc-ultra`** | The same, plus an Opus 5 **xhigh** advisor and three judgment gates. Deep analysis, patterns, tests and security forced on. Costly by design. | [see it](mock-run/orc-ultra.md) |
| **`/orc-mini`** | One Sonnet 5 executor, a build + test smoke gate, ship. Skips full review and verify. Switches to the full flow mid-run on request. | [see it](templates/skills/orc-mini/examples/mini-run-mock.md) |
| **`/orc-fast`** | The fastest lane. Needs a fresh wiki **and** a cached code pattern; then it skips the analyst and planner entirely. A missing prerequisite falls back to `/orc-mini` — the chat never stops. | [see it](mock-run/orc-fast.md) |
| **`/orc-quick`** | Ask for anything: a fix, a question, a defect hunt, a dependency bump, PR comments. Look → ask once → do. **It always asks which agent to dispatch**, and no setting can change that. | [see it](mock-run/orc-quick.md) |
| **`/orc-diy`** | Your own lane, composed in the terminal with `orc diy` and compiled. Unconfigured or stale → it refuses and offers plain `/orc`. | [see it](mock-run/orc-diy.md) |

### Work out what to build

| Command | What it does | Mocked run |
|---|---|---|
| **`/orc-brainstorm`** | You do not have the idea yet. It generates candidates against named thinking lenses with **no criticism while generating**, clusters them into a few real directions, stress-tests each, then recommends one and **waits — it never picks for you**. Every menu ends with your own slot. | [see it](mock-run/orc-brainstorm.md) |
| **`/orc-grill`** | You have one idea and it is still vague. It asks rounds of questions, **looks facts up itself** instead of making you recite your own codebase, and never answers its own question. Ends when *you* say the idea matches what you meant. | [see it](mock-run/orc-grill.md) |
| **`/orc-analyze`** | A document or a request → a scope-bounded, code-grounded spec. Every claim carries `file:line` evidence or becomes a question. Deep mode adds parallel scouts. | [see it](templates/skills/orc-analyze/examples/analyze-mock.md) |
| **`/orc-plan`** | A request or a spec → a real task plan: grounded files, dependencies, facets, and a test disposition per task. | [see it](mock-run/orc-plan.md) |
| **`/orc-route`** | You have a plan — which lane should build it? It names one lane, the runners-up with what each costs you, and any lane that is impossible with the condition blocking it. **It refuses to route a sentence**, because that would be guessing. | [see it](mock-run/orc-route.md) |
| **`/orc-explain`** | "Wait, what?" It says the last message again: the point first, then the background it assumed, then every ORC-only word defined in your project's terms. | [see it](mock-run/orc-explain.md) |
| **`/orc-poly`** | One change across two or more repos, without drift. Peer source is read-only; it freezes the shared boundary into a contract and writes one plan per repo. It never builds. | [see it](templates/skills/orc-poly/examples/poly-run-mock.md) |

### Teach ORC your project

| Command | What it does | Mocked run |
|---|---|---|
| **`/orc-wiki`** | Scans your codebase into a persistent `wiki/`, evidence-anchored, and points `CLAUDE.md` at it. Freshness is computed on read, never stored. Expensive and opt-in — it always warns first. | [see it](templates/skills/orc-wiki/examples/wiki-run-mock.md) |
| **`/orc-pattern`** | Learns your real conventions per language, so executors write code that matches your codebase. Your conventions win; security and correctness invariants always carry through. | [see it](mock-run/orc-pattern.md) |
| **`/orc-learn`** | Onboarding docs for a human, one feature at a time, `file:line`-anchored. Local and git-ignored. | [see it](templates/skills/orc-learn/examples/learn-run-mock.md) |
| **`/orc-claude`** | Builds or refreshes this repo's `CLAUDE.md` from verified facts. Zero questions; your own content is never trimmed. | [see it](templates/skills/orc-claude/examples/claude-run-mock.md) |
| **`/orc-export`** | Compiles the wiki, patterns, `PACT.md` and boundary cards into a portable `AGENTS.md` — derived, fingerprinted, `--check`able. So ORC is not a trap. | [see it](mock-run/orc-export.md) |

### Check what happened

| Command | What it does | Mocked run |
|---|---|---|
| **`/orc-challenge`** | Grades a **finished** artifact — a TSD, a PRD, an ADR, an API contract, a README, a module — against a goal **you** state, then **stops and makes you fix it in a different session**. ORC judges, you fix, ORC re-judges: **it never fixes what it judged**, because a session that just wrote the fix would grade its own homework. **And it never guesses what "good" means here.** | [see it](mock-run/orc-challenge.md) |
| **`/orc-pact`** | The promises your project makes, and which are in doubt right now. Four states, all **computed on read**: HOLDING · DRIFTED · **UNCHECKABLE** (the honest state — never a failure) · BROKEN. It never invents a promise and never retires one for you. | [see it](mock-run/orc-pact.md) |
| **`/orc-boundary`** | What ORC should **not** try here, and exactly what would change that. EXECUTE · ESCALATE · REFUSE, per area. **A REFUSE always names what would make it a yes.** It gates ORC's own dispatch, never your instructions. | [see it](mock-run/orc-boundary.md) |
| **`/orc-verify`** | Verifies only your git-modified changes: build, tests, diff sanity, findings on a P0–P3 ladder. Read-only. | [see it](templates/skills/orc-verify/examples/verify-mock.md) |
| **`/orc-aftermath`** | Did what we shipped hold up? Graded from the repository's own future: churn, reverts, deleted tests, broken promises. **Churn is a signal, never a verdict**, and it never names a person. | [see it](mock-run/orc-aftermath.md) |
| **`/orc-budget`** | What a run costs, in the unit you are billed in. A **token vector** — fresh input, cache write, cache read, output, never blended — shown four ways: tokens, dollars, percent of your 5-hour window, and context risk. Needs a plan, not a sentence. | [see it](mock-run/orc-budget.md) |
| **`/orc-retro`** | Mines the behavior traces into a calibration report and files it upstream as a PR. | [see it](templates/skills/orc-retro/examples/retro-mock.md) |

### Ship and hand over

| Command | What it does | Mocked run |
|---|---|---|
| **`/orc-pr-setup`** | Decides where a big change gets cut into stacked pull requests: ordered layers, each with a purpose, a file list and a measured budget. It stops and asks at every uncertain seam, and never touches git. | [see it](mock-run/orc-pr-setup.md) |
| **`/orc-pr-driver`** | Executes that plan: a branch per layer, a **mandatory green gate at each layer's own base**, `gh stack submit`, then restack and bottom-up merge. | [see it](mock-run/orc-pr-setup.md) |
| **`/orc-handoff`** | For someone who does not read code. The grade comes from **whether a cheap check exists**, not from the file type. It shows the undo command *before* it writes, and never touches a red file. | [see it](mock-run/orc-handoff.md) |

---

## `orc ui` — the control panel

A local web page for **everything in ORC that is not ai**. One boundary defines
it: **it never runs a lane, never spawns `claude`, never calls a model API.**
Everything it shows or writes is deterministic CLI output.

<!--
  🎬 VIDEO PLACEHOLDER — the walkthrough goes right here.

  1. Record `orc ui --fixtures` (under ~2 min). Save the files as
       mock-run/media/orc-ui-demo.mp4
       mock-run/media/orc-ui-demo-poster.png
  2. Replace the blockquote below with this line:

       [![Watch the orc ui walkthrough](mock-run/media/orc-ui-demo-poster.png)](mock-run/media/orc-ui-demo.mp4)

  To make it PLAY inline on github.com instead of opening the file, drag the
  .mp4 into any issue comment and paste the https://github.com/user-attachments/…
  URL GitHub gives you, on its own line. Full steps: mock-run/media/README.md
-->

> 🎬 **Video walkthrough — not recorded yet.** The player belongs here; see
> [`mock-run/media/README.md`](mock-run/media/README.md) for the two files to
> drop in. Until then, the panel is written out screen by screen in
> [`mock-run/orc-ui.md`](mock-run/orc-ui.md).

```bash
orc ui                 # binds 127.0.0.1:9921 and opens a browser
orc ui --port 9930     # an explicit port never auto-walks — a collision is an error
orc ui --no-open       # print the URL only
orc ui --idle 0        # disable the idle shutdown (default: 30 minutes)
orc ui --fixtures      # canned data, no project needed
orc ui --stop          # shut this project's server down
```

| Panel | Shows | Can change |
|---|---|---|
| Overview | version, `orc doctor`, wiki tier, what is waiting — plus **Worth doing**, one list of everything wanting a decision | — |
| Settings | every config key, grouped, each with its own control | staged edits, applied together |
| Runs | run history as an accordion: a row opens in place into state-of-play, resume prompt, checkpoint, trace tail | — |
| Knowledge | wiki freshness and refresh scope, code patterns, gotchas, wiki debt | `wiki sync`, `gotcha prune` |
| Stats | lane and agent usage, downgrades, and a **Cost** tab whose stacked bar keeps cache-read visible | — |
| Flow | the compiled DIY flow, its gate, and a stepper of every phase in order | `diy set`, `diy compile`, presets |
| Crosslink | **Design** (the boundary as a graph) and **Settings** (each peer's freshness) | `crosslink add` / `remove` |
| Promises · Boundary · Self-serve | the pact ledger, the boundary cards, and the surfaces a non-developer can change | `pact check`, `pact sync`, `handoff set` |
| **Mocked Skill Use** | every mocked run that ships with ORC, grouped and searchable, with a reading pane | — |
| Learn | the `orc onboarding` walkthrough, one section at a time | — |
| Experiment | every lane with a copy button; opens a Claude session in a terminal | — |
| Maintenance | `update`, `update --prune`, `doctor --fix`, `upgrade` | preview, then apply |

- **The panel *is* the CLI.** It reads `orc <command> --json` and shells the real
  command for every write, so it cannot drift from the CLI — it has no second
  copy of anything.
- **A free action gets a button. A paid action gets a command to copy.**
- **Nothing is automatic**, and a prune names **every** file. A count is not
  consent.
- **Treated as a write surface**: loopback only, a fresh token per launch, a
  Host-header check against DNS rebinding, no CORS, POST-only mutations.
- **Project-scoped, no `--global` config.** If a global install exists that could
  win skill resolution, every page carries a banner. It reports that; it never
  edits global config.
- **English and Indonesian.** Only the panel's own words are translated — config
  keys, model ids, paths, commands and doctor messages are printed exactly as the
  CLI wrote them, because a translated config key is a key that does not exist.

Zero dependencies, zero build step: `node:http`, plain JavaScript, hand-written
CSS.

---

## How the model is picked

Each task is scored 0–100 by **arithmetic, not judgement**: the planner reports
facets (breadth, novelty, logic, test surface, cited risk, uncertainty) and a
fixed published formula turns them into a number. A cited risk forces a floor of
70. The score maps through a published table to a **named, model-pinned agent**,
so what ran is inspectable rather than requested in prose.

> **The rule that catches everyone:** a subagent's model can never be higher than
> your main session's. Run your session on Opus 5.

**Full detail — the bands, `opus5_only`, and the tier guard `orc init` installs:
[guides/model-selection.md](guides/model-selection.md).**

---

## Configuration

Settings are edited with the **`orc config` CLI** — deterministic terminal I/O,
so it costs **zero model tokens**.

```bash
orc config              # interactive menu
orc config list         # the effective config
orc config recommend    # read this repo, suggest ONE profile, with reasons
orc config profile paranoid
```

Your changes live in `.claude/orc.config.yaml`, which `orc update` never
clobbers. `orc ui` ▸ Settings edits the same keys through the same validators.

**Every key, with defaults and what each one does:
[guides/configuration.md](guides/configuration.md).**

---

## What is inside the package

```
templates/
├── skills/       29 skills — the lanes above, plus the ones with no command of
│                 their own: context-combiner, orc-advisor, orc-judge,
│                 orc-analyze-mini, and _shared/ (cross-lane contract prose)
├── commands/     27 slash commands
├── hooks/        effort guard (PreToolUse) · statusline warning · behavior trace
└── agents/       40 model-pinned subagents + MODEL-MAPPING.md
bin/cli.js        installer, config editor, flow composer, run-state reader, and
                  the deterministic half of every lane. Every read speaks --json
bin/webui/        `orc ui` — the local control panel. Zero deps, no build step
bin/mockrun-catalog.js   the mocked-run catalogue (derived from the files on disk)
mock-run/         the mocked runs themselves — start at INDEX.md
guides/           configuration · model selection
```

The `orc` skill is a thin **spine**: it loads a reference or a subskill only when
that phase actually runs, so a small task never pays for the machinery of a big
one.

---

## Longer guides

Some lanes ship a full how-to next to the skill, in plain language:

| Guide | Read it when |
|---|---|
| [ORC-QUICK](templates/skills/orc-quick/README.md) | you want the quick lane's complete worked runs |
| [ORC-DIY](templates/skills/orc-diy/README.md) | you want to compose your own lane |
| [ORC-WIKI](templates/skills/orc-wiki/README.md) | you want the knowledge base, and cross-repo crosslink setup |
| [ORC-PR-SETUP](templates/skills/orc-pr-setup/README.md) | you want to split a big change into stacked PRs |
| [ORC-PR-DRIVER](templates/skills/orc-pr-driver/README.md) | you have a stack plan and want to build, submit and merge it |
| [Configuration](guides/configuration.md) · [Model selection](guides/model-selection.md) | you want every key, or the scoring bands |

Every skill also ships its own `SKILL.md` and `references/`. The guides above are
the human-facing versions.

---

## Eval status

The constellation is graded **end to end**, not file by file: one executable
spec per lane, run against a sandboxed Express fixture, graded from on-disk
evidence — behavior traces, run folders and artifacts.

The last full round was the **30-eval suite against the v0.34.0 payload**: 25
filled result files and 38 trace files, with 5 evals never graded and 2 only
partly graded — all named in the report. Everything found there was either fixed
in a later release or is still listed. Read it as a record of that round, not as
a current audit: [EVAL-REPORT.md](EVAL-REPORT.md).

---

## Design principles

- **Never implement at the top.** The orchestrator coordinates; scored subagents
  do the work.
- **Bound the scope before parallelizing.** A misunderstanding is cheap to fix
  before five agents build on it.
- **Disk over memory.** Every pause is a clean resume point.
- **Pinned, inspectable models.** Named agents, models in frontmatter.
- **Your codebase wins.** Learned patterns defer to your project; only security
  and correctness invariants are non-negotiable.
- **Additive knowledge.** The wiki improves planning when it is there and costs
  nothing when it is not.
- **Say what you do not know.** `UNCHECKABLE`, `no card`, `insufficient history`
  are real answers. A confident guess is worse than an honest gap.

---

## Changelog

**Full history: [CHANGELOG.md](CHANGELOG.md)** — or `orc changelog`, which prints
only what is newer than the version you have.

### v0.47.0 — the lane that refuses to produce _(2026-08-12)_

Every other lane in ORC makes something. **`/orc-challenge` grades a finished
thing, writes down what is wrong, and then stops and makes you go and fix it
somewhere else.**

- **ORC judges, you fix, ORC re-judges — and it never fixes what it judged.**
  A session that just wrote the fix would grade its own homework and it would
  always pass. The separation is not friction; it is the measuring instrument.
- **It never guesses what "good" means here.** Intake asks — in one round — what
  the artifact must achieve, who reads it, and what you would accept as
  finished. Those are frozen to disk, and every finding must name which of them
  it serves; a finding that cannot is dropped.
- **Three instruments, not three tiers.** `orc challenge lint` counts what a
  computer can count, for free. A **cold reader** with `Read` and nothing else
  answers questions from the artifact alone — `8/12` is what "someone new can
  follow this" looks like as a number. A grounded judge spends its effort on the
  one dimension no computer can reach. **It cannot declare a pass**: the CLI
  computes that from the findings, which removes leniency as a possibility.
- **Nothing evaporates.** Every finding from last round gets exactly one outcome
  and a reason, or the verdict is rejected by name. Two ways out of the loop:
  `orc challenge accept` (a known gap, visible forever with your reason) and
  `orc challenge rebut` (the judge is wrong, and the next one must answer you).
- **No iteration cap** — each turn is a person sitting down to work — so it
  measures instead and reports `stalled` with three honest options.
- Plus the `orc challenge` CLI family (12 subcommands, all `--json`), a
  **Challenge panel** in `orc ui` with the convergence chart, and a mocked run.

Before that: **v0.46.1 — see a lane run before you pay for one** (`mock-run/`,
`orc mock-run`, and the Mocked Skill Use panel), and **v0.46.0 — a lane that
remembers, a lane that declines, and a lane that measures**.
[Read them in the changelog](CHANGELOG.md).

---

## Requirements

- **Claude Code** — it reads the skills, commands and agents.
- **Node 18+** — for the installer only. The skills themselves have zero
  dependencies.

## License

MIT — the `license` field in `package.json` is the canonical statement.
