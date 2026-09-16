<div align="center">

# 🐋 ORC

**An orchestrator skill constellation for [Claude Code](https://claude.com/claude-code).**

*Intake → analyze → plan → score → parallel subagents → review → verify → ship.*

![npm](https://img.shields.io/npm/v/%40azure-id%2Forc?style=for-the-badge&color=cb3837&logo=npm)
![Version](https://img.shields.io/badge/version-1.8.0-blue.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=for-the-badge)
![Claude Code](https://img.shields.io/badge/Claude_Code-Skills-purple.svg?style=for-the-badge)
![Dependencies](https://img.shields.io/badge/dependencies-zero-lightgrey.svg?style=for-the-badge)
![GitHub stars](https://img.shields.io/github/stars/azure-id/orc?style=for-the-badge&color=yellow)

**Latest: v1.8.0** · updated 2026-09-16 · [full changelog](CHANGELOG.md)

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
| **`/orc-test`** | **Runs** the test against a running system - yours, or one you were given permission to touch. Sends the requests, writes down what came back, and stops. **The CLI executes and measures; the model designs and interprets.** Three verdicts, and **`unknown` is the honest one**. The OWASP API Top 10 (2023) as a **closed set** where a category it could not measure keeps its slot and never becomes a pass. It never edits the system it is testing. | [see it](mock-run/orc-test.md) |
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

## Rules that keep the slop out

ORC writes a lot of prose and a lot of code. Both come out carrying the same
recognisable defaults: sentences that say nothing in a confident shape, and code
that is longer, more defensive and more abstract than the task asked for.
`orc rules` is the filter, and it has **two halves that never mix**.

| Half | Who writes it | Where | Changes when |
|---|---|---|---|
| **ORC rules** | ORC | `.claude/skills/_shared/rules/` | `orc update` |
| **Your rules** | you | `.claude/orc/rules.md` | you type |

**65 shipped rules, read-only**, in four packs: `OSW` writing (23) · `OSC` code
(22) · `OSD` delivery (10), which is what an agent reports about its OWN work ·
`OSU` UI (10), which rides per TASK rather than per lane. Three tiers - **HARD**
absolute, **PURPOSE** allowed with a written one-line reason, **LOCK** a
consistency check.

**Your rules are plain text**, three headings, as much under each as you want -
and **they beat an ORC rule outright**:

```
house rules  >  your rules  >  ORC rules
```

The house rules are about CODE and behaviour. They say nothing about the words
an agent writes, so they never overrule a writing rule. To switch an ORC rule
off, name its id in a rule of your own; the override is then counted, printed at
preflight, and stated inside every slice. **It is never silent.**

```bash
orc rules                                   # both halves, the ladder, the counts
orc rules add --priority P0 --text "..."    # your own, in your own words
orc rules lint src/ README.md               # free, zero tokens
orc rules credits                           # every source, author and licence
```

`orc rules lint` checks **13 of the 65** - the ones a string match can prove -
and prints, every time, `not checked here: 52 rules. They need a reader, not a
matcher.` A clean lint is not a clean review, and it says so.

**The rules are other people's work, and the credit ships with them.** Adapted
from [`petergyang/no-ai-slop`](https://github.com/petergyang/no-ai-slop) (MIT),
[`miqdadbadjuber/anti-slop`](https://github.com/miqdadbadjuber/anti-slop) (MIT),
[`ehmo/slopkit`](https://github.com/ehmo/slopkit),
[`BioInfo/slopless`](https://github.com/BioInfo/slopless), Andrej Karpathy's
`CLAUDE.md`, Matty Cartwright's Anti-Slop Writing Rules, and three papers on LLM
code smells.

**Full detail: [`guides/rules.md`](guides/rules.md).**

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

## The code graph — `orc graph`

A local map of how your code is connected. It is **off by default**.

```bash
orc config set code_graph on          # code lanes build and use the map (free)
orc config set code_graph_notes wave  # optional: one-sentence notes (costs tokens)
orc graph ctx OrderService.create     # a card: callers, calls, SQL/HTTP/env effects
orc graph changes                     # what THIS diff touched, and how risky
orc graph cochange src/orders.js      # what usually changes with this file
orc graph coverage src/orders.js      # how much of it the parser really saw
```

- **Structure is free.** The CLI parses the code. No model, no dependency.
  Functions, methods, classes and route handlers (`GET /orders/:id`); a
  middleware passed by name is a `used by` link.
- **Updates are small.** Git already hashes every file. Only the files whose hash
  changed are parsed again — a teammate's change heals at the next preflight.
- **Every link says how sure it is:** `LOCAL`, `IMPORT`, `UNIQUE`, `AMBIGUOUS`
  (every candidate listed) or `UNRESOLVED`. The graph never guesses.
- **A card has a token budget.** It never goes over it, and it says what it hid.
  `--format tree` names each column once instead of on every row, and falls back
  to the normal shape when a card is too small to pay for the header.
- **It shows where code is. It does not replace reading it.** Agents still read
  the line range before they act. A card header says `coverage partial 327-466`
  when the parser could not finish a file — **no recorded gap is not proof of
  completeness**. A card also lists only the callers that NAME the symbol: one
  that reaches it through an HTTP route or a string dispatch is not a link, so
  **a card's silence is not proof of absence**.
- **Every answer carries a `generation`** — a number that goes up each time the
  map changes. A card quoted back later can be placed in time.
- **It keeps itself current in three ways, and only one of them needs a lane to
  remember a step.** A read repairs the files it is about to answer for; the
  installed hook updates the map when a worker finishes; and every code lane
  — `/orc`, `/orc-ultra`, `/orc-diy`, `/orc-mini`, `/orc-fast`, `/orc-quick` —
  still builds it at preflight and updates it after each change. Other lanes
  never call it. **Nothing runs on a timer and nothing runs in the background.**
- **The hook also hands a worker the anchors it would otherwise search for**, and
  everything it hands over is labelled repository data, never an instruction.
  Switch it off with `orc config set code_graph_hooks off`; the map still works.

The contract: `templates/skills/_shared/code-graph.md`. The hook:
`templates/hooks/README.md`.

> **It does not save tokens, and we measured that rather than guessing.** Across
> 242 real ORC lane windows, `Grep` and `Glob` results are **0.06%** of what a
> session adds to its context and every tool result together is 5.5%. A perfect
> locator — every whole-file read turned into a range read — would save **0.1% of
> a session**. Turn the map on because you want the cards: what calls what, what
> a change would touch, where the parser could not finish. Not for a number.
> The working is in `eval/graph-replay.js`, and it spends no tokens to re-run.

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
└── agents/       48 model-pinned subagents + MODEL-MAPPING.md
bin/cli.js        installer, config editor, flow composer, run-state reader, and
                  the deterministic half of every lane. Every read speaks --json
bin/graph*.js     the code graph: store, extraction, resolution + its cache, signals, notes
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
| [Rules](guides/rules.md) | you want the 65 anti-slop rules, the precedence ladder and the lint |
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

### v1.8.0 - the code graph: a map of the code that stays fresh _(2026-09-16)_

ORC lanes spend most of their tokens on searching: Grep, read a file, Grep
again. The next agent in the next wave searches for the same things again.

**`orc graph` is a local map of how the code is connected.** It is off by
default: `orc config set code_graph on`.

- **Structure is free.** The CLI parses JavaScript, TypeScript, Python, Go, Java,
  C# and PHP — no model. Python uses its own `ast` parser when Python 3.8+ is
  installed.
- **Updates are small.** Only files whose git hash changed are parsed again. On
  django/django (3,040 source files) a first build takes 12 s and a one-file
  update takes 2.7 s.
- **`orc graph ctx | impact | path`** answer with a token budget and a state word
  on every link. Route handlers are symbols, and a middleware passed by name is a
  `used by` link. `--format tree` names each column once instead of on every row
  — 17–21% fewer tokens on a file card, and it falls back to the normal shape
  when a card is too small to pay for the header.
- **A stored answer for the expensive half.** Working out who calls a symbol cost
  437 ms on django/django, every time. It is now written once per update and read
  back, which takes a file card from 727 ms to 458 ms and `impact` from 631 ms to
  397 ms. The store is DERIVED: it is used only when it names the current index,
  and deleting it costs speed and nothing else.
- **Every answer carries a `generation`**, and every file carries what the parser
  really saw — `full`, `partial` with the line ranges it could not finish, or
  `skipped`. `orc graph coverage <files>` asks in one call. **No recorded gap is
  not proof of completeness.**
- **Three new read-only answers, all free:** `orc graph changes` (the symbols
  THIS diff's hunks touched, each with its callers, its tests and a risk word
  that carries its own reason), `orc graph cochange <file>` (what usually changes
  WITH it, from git history — never a dependency), and `orc graph coverage`.
- **Notes are optional** (`code_graph_notes: wave | end`). One Sonnet 4.6 agent
  writes one sentence per changed function. A note is shown only while the
  function body is unchanged.
- **It stays fresh in three ways, and only one needs anyone to remember a step.**
  A read repairs the files it is about to answer for. An installed hook updates
  the map when a worker finishes, and hands a worker the anchors it would
  otherwise search for. And every code lane still builds it at preflight and
  updates it after each change. `/orc-quick` still reads only `log_dir` — the CLI
  reads the settings. **Nothing runs on a timer and nothing runs in the
  background.**
- **Anything a worker receives from the graph is labelled repository data, never
  an instruction.** Symbol names come out of your repository, so ORC treats them
  as text. File contents are never injected — only names, paths and line ranges.
- **Also:** eight config keys, two `orc doctor` findings, a code graph card in
  `orc ui`, and a `graph` status line component.

**Limits we know about.** TypeScript is read with pattern matching, not the
TypeScript compiler. `x = new Service(); x.run()` shows as `AMBIGUOUS`. A caller
that never names the symbol — an HTTP route test, a job runner — is not a link,
so read a card as an anchor, not as a blast radius.
**It is not a token optimisation, and that is measured.** Searches are 0.06% of
what a session adds to its context; a perfect locator would save 0.1% of a run.
The map costs no model tokens to build and the read timings above are real —
turn it on for the cards, not for a saving.

<details>
<summary><strong>Earlier releases</strong> — 116 of them, titles only. Full text in <a href="CHANGELOG.md">CHANGELOG.md</a>.</summary>

- **v1.7.1** — the rules card now reaches the agent · _2026-09-14_
- **v1.7.0** — the rules that keep the slop out · _2026-09-13_
- **v1.6.0** — the rule that can finally say no · _2026-09-07_
- **v1.5.0** — the lane that runs the test · _2026-09-07_
- **v1.4.2** — the panel that stops reloading, and the fields you could not read back · _2026-09-05_
- **v1.4.1** — the board you can actually use · _2026-09-05_
- **v1.4.0** — the agent panel, and the number that was missing · _2026-09-04_
- **v1.3.0** — build your own status line · _2026-09-04_
- **v1.2.1** — the status line says what ORC is doing · _2026-09-04_
- **v1.2.0** — a retry that cloned the agent, and a window you can watch empty · _2026-09-04_
- **v1.1.0** — the wait, and a window ORC can finally see · _2026-08-31_
- **v1.0.0** — config, phases and calls stop being prose · _2026-08-30_
- **v0.56.1** — a worker that is alive and doing nothing · _2026-08-28_
- **v0.56.0** — a rename moved the command, and nobody could reach the fix · _2026-08-27_
- **v0.55.2** — a gate that is never probed is a gate that is always off · _2026-08-27_
- **v0.55.1** — ORC is on npm · _2026-08-27_
- **v0.55.0** — a score is what a band needs, and four lanes do not have one · _2026-08-26_
- **v0.54.0** — a failed dispatch is a POSITION, not a blank page · _2026-08-25_
- **v0.53.4** — the reload that dropped its own token · _2026-08-24_
- **v0.53.3** — the key it never sent · _2026-08-24_
- **v0.53.2** — the cost that was paid and never written down · _2026-08-24_
- **v0.53.1** — "up to date" now names what it checked · _2026-08-23_
- **v0.53.0** — the schema the provider rejected, and a routing table you can read · _2026-08-23_
- **v0.52.0** — the connection that could not be used, and the routing nobody could see · _2026-08-23_
- **v0.51.0** — the tools you already have, and a connection that proves itself · _2026-08-22_
- **v0.50.0** — work that runs somewhere else · _2026-08-22_
- **v0.49.5** — house rules are text, and the hand-back writes itself · _2026-08-21_
- **v0.49.4** — the panel was being handed half an answer · _2026-08-20_
- **v0.49.3** — coverage on a large repo · _2026-08-19_
- **v0.49.2** — house rules, a run map before you pay, and three defects · _2026-08-18_
- **v0.49.1** — the challenge council, and a `--json` that stops throwing things away · _2026-08-18_
- **v0.49.0** — the document is a folder, and the file is a build artifact · _2026-08-17_
- **v0.48.1** — one file per thing, and a document that can be finished · _2026-08-16_
- **v0.48.0** — a document long enough to end a session, written anyway · _2026-08-13_
- **v0.47.0** — the lane that refuses to produce · _2026-08-12_
- **v0.46.1** — see a lane run before you pay for one · _2026-08-12_
- **v0.46.0** — a lane that remembers, a lane that declines, and a lane that measures · _2026-08-10_
- **v0.45.0** — `/orc-brainstorm`: for when you do not have the idea yet · _2026-08-10_
- **v0.44.1** — apply when you say so, and a spotlight that survives a banner · _2026-08-09_
- **v0.44.0** — the panel stops making you type what it already knows · _2026-08-09_
- **v0.43.7** — the flow you can see, and a boundary you can read · _2026-08-09_
- **v0.43.6** — `orc ui` in two languages, and panels that point at the right page · _2026-08-08_
- **v0.43.5** — the update check works, and the UI teaches itself · _2026-08-08_
- **v0.43.4** — a warning that finally clears, an Experiment panel, crosslink from the UI · _2026-08-08_
- **v0.43.3** — `orc ui`: it tells you about updates, and 36 keys stop being a wall · _2026-08-08_
- **v0.43.2** — `orc ui`: boxes stop colliding, because the container owns the gap · _2026-08-08_
- **v0.43.1** — the panel's stylesheet and script actually reach the browser · _2026-08-08_
- **v0.43.0** — `orc ui`: a control panel for everything that is not ai · _2026-08-08_
- **v0.42.0** — Say what you mean, see what it costs, find your way back · _2026-08-08_
- **v0.41.0** — A wiki that can tell you it is fresh, and TDD only where it can fail · _2026-08-06_
- **v0.40.0** — Gotchas: repair memory that outlives the run · _2026-08-06_
- **v0.39.0** — The read ladder, and foreign input that is evidence rather than instruction · _2026-08-06_
- **v0.38.1** — `orc doctor --json` + handoff carry-over that says what is re-derived · _2026-08-06_
- **v0.38.0** — `/orc-quick`: the quick lane, and the gate no config can collapse · _2026-08-05_
- **v0.37.0** — Stacked pull requests: a measured ship gate + two standalone lanes · _2026-08-03_
- **v0.36.0** — `opus5_only`: one model for every role, not just executors · _2026-08-02_
- **v0.35.0** — `opus5_executor_only`: one model, effort as the cost dial · _2026-08-02_
- **v0.34.8** — `orc pattern status` rejects a language key the payload has never heard of · _2026-08-01_
- **v0.34.7** — DIY: a usable status contract, and compile docs that match the compiler · _2026-08-01_
- **v0.34.6** — Analyze: the evidence gate now covers the rows a good analysis produces · _2026-08-01_
- **v0.34.5** — Wiki: stop losing tags silently, let a delta clear its own delta · _2026-08-01_
- **v0.34.4** — Planner: scorable facets, and TDD rules scoped to reality · _2026-08-01_
- **v0.34.3** — Slice boundary: the worktree, not the editor · _2026-08-01_
- **v0.34.2** — Trace subsystem: the pointer clobber, and a writer contract that holds · _2026-08-01_
- **v0.34.1** — Install integrity: run state survives `orc update` · _2026-08-01_
- **v0.34.0** — Opus 5: top scoring band, every core role, medium-effort session tier · _2026-07-25_
- **v0.33.0** — Knowledge deepening + verification revamp · _2026-07-25_
- **v0.32.0** — Trace revamp: narration is dispatched, not remembered · _2026-07-24_
- **v0.31.0** — Execution-integrity revamp: plan handoff, attributable traces, facet scoring · _2026-07-23_
- **v0.30.0** — Scoring revamp, Fable 5 role override, tier-aware guards, `orc onboarding` · _2026-07-23_
- **v0.29.0** — Drift-prevention hardening: install manifest + prune, `orc doctor`, a real test suite · _2026-07-22_
- **v0.28.1** — Defect fixes: package encoding, trace event routing, count/doc drift · _2026-07-22_
- **v0.28.0** — Run integrity: rich full-lane traces, deterministic wave stop, visible knowledge gates · _2026-07-21_
- **v0.27.0** — `/orc-poly`: plan one change across two-or-more repos without drift · _2026-07-20_
- **v0.26.0** — Test-gen output pinned to a visible `test-generator/<change-slug>/` deliverable · _2026-07-19_
- **v0.25.1** — Eval report: the full 17-lane suite graded against the v0.25.0 payload · _2026-07-18_
- **v0.25.0** — Deterministic artifact detection: a generated wiki/pattern is never missed · _2026-07-18_
- **v0.24.0** — Crosslink fused into wiki generation: always-on, per-scan-task, never wiped · _2026-07-18_
- **v0.23.0** — Trace fix: SPAWN restored on the `Agent` tool, stale runs rotate to fresh files · _2026-07-18_
- **v0.22.0** — `/orc-learn`: per-feature onboarding docs — learning.md + knowledge.md, wiki-deep, git-ignored · _2026-07-17_
- **v0.21.0** — Statusline shows live subscription usage: 5h ↔ weekly, official numbers · _2026-07-16_
- **v0.20.0** — One source of truth: generated executor agents + shared cross-lane contracts · _2026-07-16_
- **v0.19.0** — Thin spines: skill compaction, budget lint, and a trace that logs every phase · _2026-07-16_
- **v0.18.0** — `orc wiki sync`: the wiki registers itself — a paused scan is no longer an invisible wiki · _2026-07-15_
- **v0.17.3** — Trace the wiki consult: Phase 1 now logs whether the run grounded in the wiki (and if it was stale) · _2026-07-14_
- **v0.17.2** — Behavior-trace logging is permanent + the trace folder is now created deterministically · _2026-07-14_
- **v0.17.1** — Complete cross-repo crosslink setup guide in the orc-wiki README · _2026-07-14_
- **v0.17.0** — `orc crosslink`: cross-repo wiki references — advisory boundary contracts · _2026-07-14_
- **v0.16.1** — Interactive `orc diy` composer + numbered picks in `orc config` · _2026-07-14_
- **v0.16.0** — `/orc-diy`: build your own lane — CLI-composed flow, compiled, hard-gated · _2026-07-14_
- **v0.15.0** — Wiki v2: evidence-anchored docs · per-file staleness registry · integrity gate · _2026-07-14_
- **v0.14.0** — Postgres data-access playbook: cross-cutting query grounding · _2026-07-13_
- **v0.13.0** — `/orc-claude`: local CLAUDE.md builder — fenced sections, fingerprint refresh, zero questions · _2026-07-12_
- **v0.12.0** — Lossless context-combiner: conservation gate · overlap taxonomy · evidence freshness · _2026-07-12_
- **v0.11.0** — `/orc-fast`: knowledge-gated speed lane + wiki freshness infrastructure · _2026-07-12_
- **v0.10.1** — README: a fuller "Why ORC exists" · _2026-07-12_
- **v0.10.0** — `/orc-ultra`: max-effort advisor + three judgment gates for ultra-complex work · _2026-07-12_
- **v0.9.0** — Trust-but-verify the analyst→planner chain: quote-anchored evidence · coverage gate · anchored judgment · _2026-07-12_
- **v0.8.1** — /orc-retro delivers upstream: PR/issue to the ORC repo, channel-gated · _2026-07-12_
- **v0.8.0** — Close the loop: grounded intake · scoring anchors · OUTCOME marker · /orc-retro trace miner · eval harness · _2026-07-12_
- **v0.7.0** — Evidence everywhere: grounded plans · verbatim proof · anchored findings · contract lint · trace fixes · _2026-07-12_
- **v0.6.0** — P0–P3 ladder · house rules · deep playbooks + wired gates · 3 new languages · FE rule packs · security pass · _2026-07-11_
- **v0.5.1** — Statusline false-degrade fix · _2026-07-11_
- v0.5.0 — Code-pattern findings: executors match your house style, invariants always enforced
- v0.4.5 — Rewrite weak worker descriptions (the real score lever)
- v0.4.4 — Act on external review: raise sub-70 workers, fix cross-spine paths
- v0.4.3 — `orc-analyze`: trim description under the 1024-char skill-spec limit
- v0.4.2 — External-review pass: worked examples + sharper mini-analyst activation
- v0.4.1 — `orc-mini`: faster, safer fast-lane — smoke gate, opt-in tests, trimmed ceremony
- v0.4.0 — Opt-in Phase 6.5 Test Authoring (writes test cases, never runs them)
- v0.3.0 — Opt-in behavior-trace logging + claimed-vs-actual model verification
- v0.2.4 — `orc-analyze`: gather anchored adjacent-scope context (non-actionable)
- v0.2.3 — Context Combiner: merge 2+ related analyses into one combined spec
- v0.2.2 — Config: enforce per-key override-first resolution
- v0.2.1 — Move config editing into the `orc config` CLI (zero-token); drop `/orc-config`
- v0.2.0 — Doc-optional evidence-backed analyst + deep mode

</details>

## Requirements

- **Claude Code** — it reads the skills, commands and agents.
- **Node 18+** — for the installer only. The skills themselves have zero
  dependencies.

## License

MIT — the `license` field in `package.json` is the canonical statement.
