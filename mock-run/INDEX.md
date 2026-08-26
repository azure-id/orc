# Mocked runs — what each ORC lane looks like when it runs

New to ORC? Start here. Every file below is a **mocked run**: the screen you
would see, the questions you would be asked, and the files that would land on
disk — written the way the real lane writes them.

Nothing here was executed. It is documentation, and it is here because you
should not have to spend tokens to find out what a command does.

All of it uses **easy English**, short sentences, and the same fake project.

> **Read it in the panel instead:** `orc ui` ▸ **Mocked Skill Use** — the same
> documents, searchable, with a reading pane. From the terminal:
> `orc mock-run list` and `orc mock-run show <slug>`.

---

## Start here

| Doc | What it shows |
|---|---|
| [The example project](the-example-project.md) | `shopcart`, the fake project every mock uses, and how to read these files |
| [A normal day](a-normal-day.md) | `/orc-pact`, `/orc-boundary`, `/orc-budget`, `/orc-aftermath` and the rest, all inside one ordinary run |

## Build a change

| Doc | Lane | One line |
|---|---|---|
| [orc](orc.md) | `/orc` | The full pipeline: intake → plan → score → parallel waves → review → verify → ship |
| [orc-ultra](orc-ultra.md) | `/orc-ultra` | The same, plus an advisor and three judgment gates. Costs the most |
| [orc-mini](../templates/skills/orc-mini/examples/mini-run-mock.md) | `/orc-mini` | One executor, a smoke gate, ship |
| [orc-fast](orc-fast.md) | `/orc-fast` | No analyst, no planner — the wiki and the pattern already did that work |
| [orc-quick](orc-quick.md) | `/orc-quick` | Ask for anything. Look → ask once → do, and it always asks which agent |
| [orc-diy](orc-diy.md) | `/orc-diy` | Your own lane, composed in the terminal and compiled |

## Decide what to build

| Doc | Lane | One line |
|---|---|---|
| [orc-brainstorm](orc-brainstorm.md) | `/orc-brainstorm` | No idea yet: it generates the options and **you** pick |
| [orc-grill](orc-grill.md) | `/orc-grill` | One vague idea, sharpened by questions — it never answers its own |
| [orc-doc](orc-doc.md) | `/orc-doc` | A PRD, TSD, agreement, report or runbook — written in parts, so nothing holds it all |
| [orc-plan](orc-plan.md) | `/orc-plan` | A real task plan: grounded files, dependencies, facets, test dispositions |
| [orc-route](orc-route.md) | `/orc-route` | You have a plan — which lane should build it, and which cannot |
| [orc-explain](orc-explain.md) | `/orc-explain` | "Wait, what?" — it says the last message again, properly |
| [orc-analyze](../templates/skills/orc-analyze/examples/analyze-mock.md) | `/orc-analyze` | A document turned into code-grounded requirements |
| [orc-analyze-mini](../templates/skills/orc-analyze-mini/examples/quick-analysis-mock.md) | *(inside `/orc-mini`)* | The same, single pass, much cheaper |
| [context-combiner](context-combiner.md) | — | Two related analyses merged into one spec, with a 100% conservation gate |
| [orc-poly](../templates/skills/orc-poly/examples/poly-run-mock.md) | `/orc-poly` | One change across two or more repos, without drift |

## Teach ORC your project

| Doc | Lane | One line |
|---|---|---|
| [orc-wiki](../templates/skills/orc-wiki/examples/wiki-run-mock.md) | `/orc-wiki` | Scan the codebase into an evidence-anchored knowledge base |
| [orc-pattern](orc-pattern.md) | `/orc-pattern` | Learn your real conventions so executors match your house style |
| [orc-learn](../templates/skills/orc-learn/examples/learn-run-mock.md) | `/orc-learn` | Onboarding docs for a human, per feature |
| [orc-claude](../templates/skills/orc-claude/examples/claude-run-mock.md) | `/orc-claude` | Build or refresh this repo's `CLAUDE.md` from verified facts |
| [orc-export](orc-export.md) | `/orc-export` | Compile it all into a portable `AGENTS.md` so ORC is not a trap |

## Check what happened

| Doc | Lane | One line |
|---|---|---|
| [orc-verify](../templates/skills/orc-verify/examples/verify-mock.md) | `/orc-verify` | Verify only your git-modified changes. Read-only |
| [orc-challenge](orc-challenge.md) | `/orc-challenge` | Grade a finished document, then stop and make you fix it in another session |
| [orc-challenge-council](orc-challenge-council.md) | `/orc-challenge` | Six more ways of looking at the same document — and you choose which ones run |
| [orc-pact](orc-pact.md) | `/orc-pact` | The promises your system makes, and which are in doubt right now |
| [orc-boundary](orc-boundary.md) | `/orc-boundary` | What the agent should **not** try here, and what would change that |
| [orc-aftermath](orc-aftermath.md) | `/orc-aftermath` | Did what we shipped hold up. Churn is a signal, never a verdict |
| [orc-budget](orc-budget.md) | `/orc-budget` | What a run costs, in the unit you are billed in |
| [orc-retro](../templates/skills/orc-retro/examples/retro-mock.md) | `/orc-retro` | Mine the behavior traces into a calibration report |

## Ship and hand over

| Doc | Lane | One line |
|---|---|---|
| [orc-pr-setup / orc-pr-driver](orc-pr-setup.md) | `/orc-pr-setup`, `/orc-pr-driver` | Split a big change into a stack of PRs, then build and merge them |
| [orc-handoff](orc-handoff.md) | `/orc-handoff` | What a non-developer can safely change, graded by whether a check exists |

## Panel and terminal

| Doc | One line |
|---|---|
| [orc-ui](orc-ui.md) | The local control panel for everything that is not ai (**video placeholder here**) |
| [orc-cli](orc-cli.md) | The terminal commands: install, config, probes, run state, stats |
| [orc-extra](orc-extra.md) | Run some of ORC's work on a different AI model, and still know what left your machine |
| [extra-recovery](extra-recovery.md) | When that other model stops half-way: what it left on disk, whose fault it was, and how to continue |
| [extra-slots](extra-slots.md) | The four lanes that never score a task: giving one JOB to a cheaper model, and what ORC says before it does |

---

## Two kinds of document

- **Walkthroughs** (this folder) — written for a person, in easy English.
- **Annotated examples** (`templates/skills/<skill>/examples/`) — dense, written
  for the model, and shipped inside your `.claude/` install. Both appear in
  `orc mock-run list` and in the **Mocked Skill Use** panel.

## Adding one

Drop a `.md` file in this folder with a `# Title` heading and a `> one line`
summary under it. It appears in `orc mock-run`, in the panel, and here — no list
to update anywhere else. Reading order comes from `GROUP_OF` in
[`bin/mockrun-catalog.js`](../bin/mockrun-catalog.js); a file nobody placed
there still shows, under **More**.
