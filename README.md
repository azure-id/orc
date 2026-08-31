<div align="center">

# 🐋 ORC

**An orchestrator skill constellation for [Claude Code](https://claude.com/claude-code).**

*Intake → analyze → plan → score → parallel subagents → review → verify → ship.*

![npm](https://img.shields.io/npm/v/%40azure-id%2Forc?style=for-the-badge&color=cb3837&logo=npm)
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=for-the-badge)
![Claude Code](https://img.shields.io/badge/Claude_Code-Skills-purple.svg?style=for-the-badge)
![Dependencies](https://img.shields.io/badge/dependencies-zero-lightgrey.svg?style=for-the-badge)
![GitHub stars](https://img.shields.io/github/stars/azure-id/orc?style=for-the-badge&color=yellow)

**Latest: v1.0.0** · updated 2026-08-30 · [full changelog](CHANGELOG.md)

**On npm: [`@azure-id/orc`](https://www.npmjs.com/package/@azure-id/orc)** — `npm i -g @azure-id/orc`

**🇮🇩 [Baca dalam Bahasa Indonesia](README-id.md)**

</div>

---

> [!CAUTION]
> **Upgrading from a version before v0.56.0? Do this once.**
>
> The package moved from the unscoped `orc` to **`@azure-id/orc`**. Both declare
> the same `orc` command, and npm will not hand that command to the new package
> while the old one still holds it — so **every** install source fails with the
> same error, and `orc upgrade` cannot fix itself:
>
> ```text
> npm error code EEXIST
> npm error File exists: C:\Users\you\AppData\Roaming\npm\orc
> ```
>
> Run these two lines once. Nothing in your `.claude/` is touched, and your
> `orc.config.yaml` survives:
>
> ```bash
> npm uninstall -g orc          # release the `orc` command from the old package
> npm i -g @azure-id/orc        # install the current one
> orc update                    # re-apply into this project (add --global for ~/.claude)
> ```
>
> **From v0.56.0 onward `orc upgrade` handles this for you** — it removes the old
> package first, then installs, and says so while it does it. `orc doctor` also
> reports the old package by name if it is still there.
>
> Do **not** reach for `npm i -g -f`. `--force` overwrites the command file and
> leaves the superseded package installed underneath, owning nothing and never
> updated again.

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

ORC is on npm as **[`@azure-id/orc`](https://www.npmjs.com/package/@azure-id/orc)**.

```bash
npm i -g @azure-id/orc          # install
npm i -g @azure-id/orc@latest   # update to the newest release
```

<details>
<summary>Install straight from GitHub instead</summary>

<br>

```bash
npm i -g https://github.com/azure-id/orc/archive/refs/heads/main.tar.gz
```

</details>

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
orc version                              # what you have, and whether something newer exists
orc changelog                            # what you would GET by upgrading
orc upgrade                              # fetch the latest, then update this project
orc upgrade --global                     # the same for ~/.claude
orc upgrade --from @azure-id/orc         # explicitly from npm
orc upgrade --from github:azure-id/orc   # a fork, or any npm spec
```

Or update the package yourself and re-apply it:

```bash
npm i -g @azure-id/orc@latest
orc update
```

The update check reads the source over HTTPS, is cached for 24 hours, and fails
silently when you are offline. Turn it off with `ORC_NO_UPDATE_CHECK=1`.

You do not have to run a command to hear about it: the same notice appears
inside Claude Code through ORC's hooks, at **zero model tokens** — hooks are
scripts Claude Code runs, not model turns.

`orc upgrade` tries the npm registry first, then a plain tarball, then the
GitHub spec — and it remembers which one worked. If the old unscoped `orc`
package is still installed, it removes that first (announced), because npm
cannot give the `orc` command to `@azure-id/orc` while another package owns it.
See the caution at the top of this README for the one-time manual version.

</details>

> **"ORC cannot see my wiki"?** Run **`orc wiki sync`**, not a new scan. Docs
> without a manifest are *unregistered*, not missing — common when a scan stopped
> at one of `/orc-wiki`'s pauses. Sync rebuilds the index from the docs you
> already have, for free.

> **"What does ORC actually know about my project?"** `orc wiki docs` lists every
> registered doc, `orc wiki coverage` says how much of your code is written about
> at all, and `orc pattern show <lang>` prints the conventions that go into every
> agent that writes code here. All free, all read-only —
> **[`guides/knowledge-reads.md`](guides/knowledge-reads.md)**.

---
## Terminal Hook
ORC have terminal hook to see: Context Window %, 5 Hour usage %, Weekly usage % and others you might see

<img width="725" height="96" alt="image" src="https://github.com/user-attachments/assets/6a649c87-81ea-4fd9-9d0b-6bb4b97fe9cd" />

<br>

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
| **`/orc-wait`** | Wall-clock pause without losing the run. You see the window is nearly full, type `/orc-wait 30`, and ORC hands the run back to disk, waits in detached hops that **cost zero tokens**, and picks up where it stopped. Three modes decide how much finishes first: `safe` · `soft` (forces the checkpoint) · `hard` (fastest, can lose an in-flight return). `/orc-wait block <reason>` tells it not to stop you at all. | — |
| **`/orc-diy`** | Your own lane, composed in the terminal with `orc diy` and compiled. Unconfigured or stale → it refuses and offers plain `/orc`. | [see it](mock-run/orc-diy.md) |

### Work out what to build

| Command | What it does | Mocked run |
|---|---|---|
| **`/orc-brainstorm`** | You do not have the idea yet. It generates candidates against named thinking lenses with **no criticism while generating**, clusters them into a few real directions, stress-tests each, then recommends one and **waits — it never picks for you**. Every menu ends with your own slot. | [see it](mock-run/orc-brainstorm.md) |
| **`/orc-grill`** | You have one idea and it is still vague. It asks rounds of questions, **looks facts up itself** instead of making you recite your own codebase, and never answers its own question. Ends when *you* say the idea matches what you meant. | [see it](mock-run/orc-grill.md) |
| **`/orc-analyze`** | A document or a request → a scope-bounded, code-grounded spec. Every claim carries `file:line` evidence or becomes a question. Deep mode adds parallel scouts. | [see it](templates/skills/orc-analyze/examples/analyze-mock.md) |
| **`/orc-plan`** | A request or a spec → a real task plan: grounded files, dependencies, facets, and a test disposition per task. | [see it](mock-run/orc-plan.md) |
| **`/orc-doc`** | Writes the long document — a PRD, a TSD, a cross-team agreement, a status report or a runbook — as portable Markdown that imports cleanly into Notion, Obsidian, Docs, Coda, Craft and GitHub. **ORC never reads the document body**: each section is its own file under `sections/`, each writer owns exactly one of them, each checker reads one bounded part, and `document.md` is a build artifact rebuilt for free. Every wave is a stop you can walk away from, and it resumes months later without you explaining anything twice. | [see it](mock-run/orc-doc.md) |
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

## Documents that go somewhere

`/orc-doc` writes the long document — and Markdown is the deliverable because of
where a Markdown file can actually go:

| Target | Imports `.md`? |
|---|---|
| Notion · Obsidian · Google Docs · Coda · Craft · Apple Notes · GitHub | **natively** |
| Docusaurus · Hugo · Jekyll · MkDocs | yes — and these *want* YAML front matter |
| Confluence | not natively. Plan for a marketplace importer app |
| Microsoft OneNote | **no**. Convert to Word or PDF first |

That table is load-bearing, not decoration: `orc doc lint --target` enforces the
real limit of the place your document is going. Notion has three heading levels,
so an H4 is an **error** there. A hard-wrapped paragraph is an error everywhere,
because a wrap at 80 columns becomes a line break inside a Notion paragraph.

Five base templates — `prd` · `tsd` · `collaboration` · `report` · `workflow` —
each a floor rather than a cage. `orc doc templates` prints them; bring your own
and its headings become the outline.

**Full detail: [`guides/documents.md`](guides/documents.md).**

---

## `orc ui` — the control panel

A local web page for **everything in ORC that is not ai**. One boundary defines
it: **it never runs a lane, never spawns `claude`, never calls a model API.**
Everything it shows or writes is deterministic CLI output.

<img width="1870" height="1269" alt="image" src="https://github.com/user-attachments/assets/207fe821-9aa6-430e-bdcc-968340cc687f" />

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
| **Knowledge** | **five tabs**: the wiki's tier AND its **contents** (every doc, what it covers, how often it is read), coverage against your tracked files, the code patterns with the conflicts the codifier flagged, repair memory with a **preview-then-apply** prune, and a read-only view of the linked repos | `wiki sync`, `gotcha prune` |
| Stats | lane and agent usage, downgrades, and a **Cost** tab whose stacked bar keeps cache-read visible | — |
| Flow | the compiled DIY flow, its gate, and a stepper of every phase in order | `diy set`, `diy compile`, presets |
| Crosslink | **Design** (the boundary as a graph) and **Settings** (each peer's freshness) | `crosslink add` / `remove` |
| Promises · Boundary · Self-serve | the pact ledger, the boundary cards, and the surfaces a non-developer can change | `pact check`, `pact sync`, `handoff set` |
| **Docs** | every `/orc-doc` document as a **ribbon** — one block per section, sized by its length and coloured by its state — plus the section files with their sub-parts, the wave strip, the lint health card and the wave preview | `doc compile` · `doc migrate` |
| **Extra** | **six tabs**: the connection setup, the local tools and their state, the band ladder and the six positions, spending per profile per band, and **Recovery** — every dispatch that never reported back, with what it left on disk | `extra add` / `ping` / `route` / `role` |
| **Challenge** | every `/orc-challenge` cycle: the frozen goal, the council roster and what each lens raised, the findings with their dispositions, and whether the pass is computed or blocked | `challenge record` · `accept` · `rebut` |
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

## Running part of the ladder somewhere else — `orc extra`

**The orchestrator is always Claude.** What Extra changes is *who executes a
slice*: a score band you own, or one of six named positions, can point at
DeepSeek, GLM, Kimi, MiniMax, Qwen, a local Ollama, or a coding CLI you already
have signed in (opencode, codex). Everything downstream — the smoke gate, the TDD
gate, the reviewer, the worktree-delta check — is engine-blind, so nothing learns
the work was foreign.

**Off by default, and it cannot be armed until something has actually answered.**

```bash
orc extra providers              # the shipped, dated catalog — providers, never models
orc extra tools                  # local CLIs: absent · outdated · unauthenticated · ready
orc extra add ds --provider deepseek --engine api --env-key DEEPSEEK_API_KEY
orc extra ping ds                # the connection gate: a ladder, and nothing reads stronger than it is
orc extra models ds --test <id>  # a LISTED model can still be dead upstream
orc extra health ds --model <id> # …and a working model is not one that FINISHES
orc extra route set 40-55 ds/deepseek-chat     # a score band
orc extra role set doc-writer ds/deepseek-chat # or a named position
orc config set extra_enabled true
```

- **The catalog ships providers and never models.** A shipped model id is wrong
  within a quarter and wrong *silently* — a 404 mid-wave. `orc extra ping` reads
  the live list and caches it; nothing invents a name. Same for price: a cost
  figure ORC did not price itself is never printed, it reads as an em dash.
- **Every armed run says so before wave 1.** Routing work off Claude silently is
  the failure this whole subsystem is shaped around.
- **Two hard hold-backs**: a task with a cited `risk[]` (auth, money, migration,
  security, concurrency, data-integrity) stays on Claude unless you say
  otherwise, and a `/orc-boundary` REFUSE area holds even in `warn`.
- **A foreign return is foreign input.** It is the only foreign class that edits
  your worktree, so what it says it did is a *claim*, checked against the tree.
- **Your key never reaches a command line.** It travels on stdin into an
  encrypted vault, or it stays in an environment variable, or the tool holds its
  own — and the passphrase is a **deadline**, not a second factor.
- **Six positions for the lanes that pin an agent instead of scoring a task**:
  `quick-executor` · `fast-executor` · `doc-writer` · `doc-checker` ·
  `wiki-scanner-deep` · `wiki-scanner-light`. A position with no row keeps its
  slot and reads as its pinned Claude agent — "I left the checker on Claude on
  purpose" and "there is no checker" must never look the same.

**When a foreign worker fails, it is a position and not a blank page.** ORC
journals the baseline *before the first byte leaves the machine*, so a worker cut
off mid-write is **reconciled and resumed** — never re-dispatched from scratch
onto a file that is already two-thirds written.

- **`extra_stall_s` (default 180)** stops a worker that has produced nothing for
  that long. It is reset by observable progress — the worker's stream, its
  stderr, or a declared file that changed on disk — so it never fires on one that
  is merely slow. `stalled` is retryable, which is what makes the resume ORC's
  own spelling of typing `continue`.
- **`extra_fallback_agent` (default `band`)** decides who picks the task up.
  `ask` stops and puts the menu to you; any installed agent name pins one. It
  changes *who*, never the score, the declared files or the acceptance criteria.
- **Every dispatch writes its own spend record**, so a cost report never depends
  on a run remembering to narrate what it spent. `orc extra stats` merges the
  spend log, the traces and saved returns, and always says how many rows came
  from each.

**`/orc-quick` is inert here** and announces it — that lane asks which agent
before every dispatch, so no setting may pre-answer it. **`/orc-challenge` never
routes foreign**: swapping a lens for a different model does not make the lane
cheaper, it changes what is being measured.

**The whole subsystem, with every command and key:
[guides/extra-models.md](guides/extra-models.md).**

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
├── skills/       31 skill folders, 38 SKILL.md files (a lane may ship subskills) —
│                 the lanes above, plus the ones with no command of their own:
│                 context-combiner, orc-advisor, orc-judge, orc-analyze-mini,
│                 and _shared/ (cross-lane contract prose)
├── commands/     29 slash commands
├── hooks/        effort guard (PreToolUse) · statusline warning · behavior trace
└── agents/       51 model-pinned subagents + MODEL-MAPPING.md
bin/cli.js        installer, config editor, flow composer, run-state reader, and
                  the deterministic half of every lane. Every read speaks --json
bin/webui/        `orc ui` — the local control panel: css/ + js/ + i18n/<lang>/ +
                  fixtures/, one file per layer and per panel. Zero deps, no build step
bin/mockrun-catalog.js   the mocked-run catalogue (derived from the files on disk)
mock-run/         the mocked runs themselves — start at INDEX.md
guides/           configuration · model selection · documents · knowledge reads · other AI models
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
| [Other AI models](guides/extra-models.md) | you want part of the ladder to run somewhere other than Claude |

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

### v1.1.0 - the wait, and a window ORC can finally see _(2026-08-31)_

**Still on the unscoped `orc` package?** Do this once first — your `orc upgrade`
is the pre-v0.56.0 one and cannot install itself. Full detail in the CAUTION at
the top of this file.

- **Step 1 — release the command from the old package:** `npm uninstall -g orc`
- **Step 2 — install the current package:** `npm i -g @azure-id/orc`
- **Step 3 — re-apply it to your project:** `orc update`

**Do not use `npm i -g -f`.** Full detail in v0.56.0 below.

Until now the only thing in ORC that could see how full your 5-hour and 7-day
windows were was the statusline, which drew a string and threw the numbers away.
So a lane started a wave with no idea it was about to run out, and the wave
stopped in the middle.

- **`/orc-wait`** - a wall-clock pause that does not lose the run. Type
  `/orc-wait 30` and ORC writes the hand-back, waits in detached hops, and picks
  the run up where it stopped. **The waiting costs zero tokens** - a detached
  command does it, and no model runs. It never dispatches an agent to wait,
  because an agent would spend the very window you are waiting for.
- **Three modes, and they differ in one thing only: how much finishes first.**
  `safe` finishes the current wave and loses nothing. `soft` stops at the next
  turn but **forces** the checkpoint - and if that write fails it does not stop.
  `hard` stops at the next turn with the hand-back alone.
- **`/orc-wait block <reason>`** - the veto. It tells ORC not to stop this run at
  all. The reason is required, it is never written to your config, and it is
  re-printed with its age at every gate it suppresses.
- **`orc usage check`** - one reader, three answers: `0` ok, `1` low, `2`
  unknown. **The worst window decides.** A weekly window at 96% is not a green
  light because the 5-hour one is at 20%.
- **`orc ui` gains a Wait panel** - your windows, a wait in progress, a standing
  block and its age. It cannot start a wait: a wait lives in a Claude Code
  session, and the panel never runs a lane.
- **Every lane supports it, in one release.** 24 spines carry the contract, each
  naming what it checkpoints and where its safe point is - generated from one
  registry, so a spine cannot disagree with the CLI.

> [!CAUTION]
> **`/orc-wait ... hard` can lose work.** It stops at the first moment ORC can
> act - it does not wait for the current wave, phase or gate to finish, and it
> dispatches nothing, so it writes `RESUME.md` and skips the checkpoint. What
> you can lose: a dispatch that was in flight (its file writes may still land,
> but its return is never validated), the checkpoint, and that phase's trace
> packet. Use `hard` when losing the current wave is cheaper than losing the
> window; use `soft` when you can spare a few seconds; use no keyword at all
> when you can wait for the wave to end.
>
> **A wait longer than one hour ends the prompt cache.** The first turn after it
> re-reads your whole context at full input price, exactly when your quota is
> lowest. When the context is large ORC stops and offers a fresh session
> instead - **it cannot clear its own context**, only offer the swap.
>
> **`/orc-wait block` moves the risk to you, deliberately.** It suppresses every
> computed stop for the rest of the run. If the window empties mid-wave, the
> wave stops in the middle and you keep the pieces.
>
> **Nothing here is on by default.** `usage_gate` ships `off` and
> `wait_default_mode` ships `ask`. A fresh install behaves exactly as it did
> before this release. You choose every stop.

### v1.0.0 - config, phases and calls stop being prose _(2026-08-30)_

**Still on the unscoped `orc` package?** Do this once first — your `orc upgrade`
is the pre-v0.56.0 one and cannot install itself. Full detail in the CAUTION at
the top of this file.

- **Step 1 — release the command from the old package:** `npm uninstall -g orc`
- **Step 2 — install the current package:** `npm i -g @azure-id/orc`
- **Step 3 — re-apply it to your project:** `orc update`

**Nothing you configure changes meaning, and no command you run is renamed.**
Three things actually change behaviour; everything else is ORC finally reading
its own payload the way it has been telling you to read yours.

- **The score to model table ends `opus-5-low [65,90)` · `opus-5-med [90,100]`.**
  Two bands in six now want an Opus 5 main session where one in eight did.
- **A foreign worker that stalls twice in one run steps aside** for the rest of
  that run. Two clocks, never merged; it writes no new measurement and never
  writes your config; a promote is a watermark, not a mute, and needs a reason.
- **`orc diy init` defaults to `opus-5-high`.** The old default silently
  collapsed the top third of your ladder onto one agent before you chose
  anything.

The structural half - **config, phases and calls stop being prose**:

- **`orc lane config <lane>`** answers what a lane's config resolved to, with
  every shadow already worded. A lane never merges the config file itself again,
  and **a rank below a resolved rank is not read at all**.
- **`orc lane phases <lane>`** and **`orc lane calls --all`** do the same for the
  shared phase library and the CLI call catalogue - one canonical copy each,
  where there were 14-59 restatements per call.
- **`orc ui` renders all of it**: a rank ladder showing which setting ANSWERED,
  the lanes that read each key, a Lanes panel, and Extra ▸ Recovery's demotion
  row with Promote. `orc doctor` gains `lane-keys-drifted`.

**It did not make the payload smaller** - 208 files became 291, 26,507 lines
became 33,204. Most waves measured as correctness, not deduplication. What
changed is that there is now one place to fix each of these, and a lint that
fails when a copy grows back. Two planned deletions were **measured and
refused**, and the test suite's four-wave flake was diagnosed - with the honest
caveat that three green runs are the gate and not proof.

**Full entry: [CHANGELOG.md](CHANGELOG.md).**

---

## Requirements

- **Claude Code** — it reads the skills, commands and agents.
- **Node 18+** — for the installer only. The skills themselves have zero
  dependencies.

## License

MIT — the `license` field in `package.json` is the canonical statement.
