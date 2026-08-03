# ORC-PR-SETUP — plan your stacked pull requests

**Guide for humans.** Plain, simple English. Read this once, and you will know
what stacked pull requests are, when to use them, what this skill asks you, and
what it writes.

Companion guide: **[ORC-PR-DRIVER README](../orc-pr-driver/README.md)** — the
skill that builds the layers after this one plans them.

---

## 1. The short version

A very big pull request (PR) is hard to review. If a PR changes 2,000 lines in
40 files, most reviewers stop reading. They click "approve" because they are
tired, not because the code is correct.

A **stack** solves this. You cut one big change into a chain of small PRs. Each
small PR is easy to read. Reviewers can review them at the same time.

This skill does the **thinking** part: it decides *where to cut*. It writes a
plan file. It does **not** touch git.

```
one big change ──▶ /orc-pr-setup ──▶ stack-plan.md ──▶ /orc-pr-driver ──▶ 3–6 small PRs
                   (this skill:                        (the other skill:
                    plan the cuts)                      make the branches)
```

Run it with:

```
/orc-pr-setup
```

---

## 2. Words you will see here

| Word | Simple meaning |
|---|---|
| **trunk** | Your main branch. Usually `main` or `master`. |
| **stack** | A chain of PRs in one repository. Each PR sits on top of the one below. |
| **layer** | One PR inside the stack. Layer 1 is at the bottom. |
| **base** | The branch a PR wants to merge into. Layer 1's base is the trunk. Layer 2's base is layer 1. |
| **retarget** | When you merge a layer, GitHub automatically points the layers above it to the new base. You do nothing. |
| **restack / rebase** | Moving the layers above a change so they sit on the new version of it. |
| **seam** | The place where you cut. "Where does layer 1 end and layer 2 start?" |
| **budget** | The maximum size of one layer (lines and files). |
| **value class** | What a layer is worth to somebody. See section 7. |
| **LoC** | Lines of code. Here it means added lines **plus** deleted lines. |

---

## 3. Why bother? (what you get, what it costs)

**You get:**

- Small diffs. A reviewer can hold 300 lines in their head. Not 2,000.
- Parallel review. Three people can review three layers at the same time.
- Safer releases. You can merge the safe layer (a database migration) today and
  the risky layer (the new endpoint) tomorrow.
- Easy revert. If one layer breaks production, you revert one small PR.

**It costs:**

- **Every layer runs the full CI pipeline.** 5 layers = 5 CI runs. This is real
  money and real waiting time.
- More PRs to open, watch, and merge.

So: more layers is **not** better. The skill keeps the number small on purpose
(default maximum 6 layers).

---

## 4. Before you start

You need these things. The skill checks all of them for you first and tells you
if one is missing.

| Need | How to check | If missing |
|---|---|---|
| `gh` (GitHub CLI), version 2.0 or newer | `gh --version` | install `gh`, then log in with `gh auth login` |
| Logged in | `gh auth status` | run `gh auth login` |
| The stack extension | `gh extension list` | run `gh extension install github/gh-stack` |
| Your repo is **not** a fork | `gh repo view --json isFork` | **Stop.** Stacks cannot cross forks. Use one normal PR. |
| A ticket number | you know it | the skill asks you; without one it stops and suggests one normal PR |

If something is missing, the skill will not pretend. It says which check failed
and recommends **one normal PR** instead. That is a normal, safe result — not an
error you must fix today.

---

## 5. Three ways to start

**Way 1 — you have a spec, no code yet (the cleanest way).**

```
/orc-pr-setup            → plan the layers first
/orc-pr-driver           → build each layer, one at a time
```

**Way 2 — ORC already built the change.** At the end of a `/orc` run, if the
change is big, ORC asks you one question: *stack it, or one normal PR?* If you
say "stack it", ORC writes a small handoff file and tells you to run this skill.
Nothing is lost — your code is already committed on your branch.

**Way 3 — you already know your own layers.** You do not need this skill at
all. Generate a blank plan and fill it in yourself:

```bash
orc pr stack template my-feature     # writes stacked-pr/my-feature/stack-plan.md
# open the file, fill in every <...>
orc pr stack status my-feature       # says READY, or tells you what is missing
```

Then go straight to `/orc-pr-driver`.

---

## 6. How to use it, step by step

You type `/orc-pr-setup`. Then this happens.

### Step 1 — it checks your tools

It runs the checks from section 4 and prints a short report. It also tells you
if your trunk branch has protection rules, because that decides how much CI
each layer will run.

### Step 2 — it asks you a few things

- **Ticket number.** Required. Branch names and PR titles use it.
- **PR description template.** It looks for one, in this order:
  1. your team's template inside ORC (`skills/orc/subskills/orc-pr/pr.md`),
  2. your project's template (`.github/pull_request_template.md`, or files in
     `.github/PULL_REQUEST_TEMPLATE/`, or `docs/`),
  3. a "PR template" section in your `CLAUDE.md`,
  4. if there is none: it shows you **three ready-made templates** and you pick
     one (`minimal`, `context-first`, `risk-and-rollback`).

  If you do not want any template, the skill stops the stack and you ship one
  normal PR. This is on purpose: 5 layers with no template means 5 walls of
  text, and nobody reads them.

### Step 3 — it looks at the change

If the code already exists, it reads the real numbers from git
(`git diff --numstat`). If the code does not exist yet, it estimates from your
spec and says clearly that these are estimates.

It ignores some files when counting (but still lists them, so reviewers know
they exist):

- generated code (`*.pb.go`, `*_gen.go`, mocks, OpenAPI/Swagger output)
- lock files (`go.sum`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, …)
- `vendor/`, `node_modules/`, `testdata/`
- pure file moves and renames with no content change

Tests **do** count. Tests are code that reviewers read.

### Step 4 — it groups files into layers

It puts each file into a "kind of work" group (database, storage, logic,
adapter, wiring, HTTP handler, background worker, docs), then builds layers from
those groups, bottom to top. See section 7.

### Step 5 — it asks you when it is not sure

This is the most important part. Read section 8.

### Step 6 — it writes the plan and stops

It writes `stacked-pr/<slug>/stack-plan.md`, shows you a table of the layers,
and says clearly: **nothing has been created yet.** No branches. No PRs.

You read the plan. If you like it, you run `/orc-pr-driver`.

---

## 7. The rules it follows

### Rule 1 — bottom layers first, dependencies decide the order

A layer may only use code from the layers **below** it. So the order is:

```
layer 5   docs, dashboards, turn the feature on     (smallest risk, top)
layer 4   HTTP handler / route / API shape
layer 3   business logic
layer 2   database queries / storage
layer 1   database migration (schema)               (biggest risk, bottom)
```

Frontend version: types + API client → component → state/store → page and
wiring → turn the feature on.

If your project is not one of the known shapes, it falls back to a simple four
step order: **data → logic → transport → wiring**.

### Rule 2 — one layer, one kind of work

A UI component and its backend handler are **different layers by default**, even
when both are small, even when you wrote them in the same hour. The same is true
for:

- a handler and a background/webhook worker,
- a database migration and the code that reads the new column,
- an external API client and the business logic that calls it.

Why: different reviewers, different risk, different revert.

### Rule 3 — size limits (a ceiling, not a target)

| Limit | Default | Config key |
|---|---|---|
| lines per layer | 1000 | `stacked_pr_loc` |
| files per layer | 20 (aim for 10) | `stacked_pr_files` |
| layers per stack | 6 | `stacked_pr_max_layers` |

Change them with `orc config set stacked_pr_loc 1500`.

Important: staying under the limit does **not** make a layer good. A layer with
999 lines that mixes a migration and a handler still fails rule 2. The size
limit only stops layers from getting too big.

If the smallest possible piece of work is still too big (for example, one huge
generated file), the skill does **not** fake a split. It tells you, explains
why, and asks you to accept the oversized layer.

### Rule 4 — every layer must be worth something

Each layer gets one **value class**:

| Class | Meaning | Example |
|---|---|---|
| `USER` | a real user or customer sees a change | the new checkout button works |
| `OPERATOR` | your ops / on-call team gains something | a new dashboard or alert |
| `CONTRACT` | another team or repo can now build against it | the API endpoint exists |
| `FOUNDATION` | nobody sees it yet; it enables a later layer | the database table |

`FOUNDATION` is allowed — layer 1 is almost always foundation. But it must
**name the layer that uses it**, and you may not have more than 2 foundation
layers in a row. A foundation layer with no user gets merged into the layer that
uses it.

If a layer has no purpose you can write in one line, it is not a layer.

### Rule 5 — each layer must build and test **alone**

A layer must be green on its own base, not only when the whole stack is applied.
Why: you might merge layer 1 today and layer 2 next week. If layer 1 alone
breaks the trunk, the stack was a lie.

This skill *reasons* about it. `/orc-pr-driver` *proves* it by really running
build, tests, and lint for each layer.

---

## 8. The questions it asks you (and why)

The skill never guesses a cut line. If it is not sure, it **stops and asks**.
One question at a time. Every question shows the cost of each option and a
recommendation.

**It does not ask** (it is sure) when:

- the files live in clearly different folders (`migrations/` vs `handler/`),
- it can prove file A is only used by later layers,
- the change is only a database migration, or only configuration/wiring,
- the layer is already small and does one kind of work.

**It asks** when:

- two files do the same kind of work and could be one layer or two (two
  handlers, two providers, two components),
- a shared helper is used by two layers (put it at the bottom, or duplicate it
  now and clean up later?),
- a rename/refactor is mixed with a behavior change in the same file,
- two layers depend on each other in a circle,
- splitting would make a layer that cannot build alone,
- the smallest piece is bigger than the size limit,
- two layers do not depend on each other, so **you** decide which comes first,
- a feature flag could live in the bottom layer or in the top layer.

A real question looks like this:

```
Seam between the refund store and the refund handler.

[a] two layers (recommended)
    L2 store   9 files / 640 lines
    L3 handler 8 files / 520 lines
    cost: +1 CI run. Reviewer of L3 sees a store function that already exists.

[b] one layer
    17 files / 1160 lines — over the 1000-line limit, needs your approval.
    cost: one review context, but the storage reviewer must read HTTP code too.
```

Your answer is written into the plan under `## Decisions`, with your reason.
That record is why the plan still makes sense next week, or to a colleague.

---

## 9. What the plan file looks like

Path: `stacked-pr/<slug>/stack-plan.md` — in your project, visible, and meant to
be committed. It is **not** hidden inside `.claude/`.

```markdown
# Stack plan: refund adapter

- ticket: PAY-4211
- repo: acme/payment_service
- trunk: main
- entry mode: orc-run
- pr template: project:.github/pull_request_template.md
- totals: 1840 LoC · 31 files · 3 layers

## Layers
| # | branch | purpose | value class | files | LoC | depends on | build-alone? |

## Layer 1 — refund schema
- Purpose: land reversible database changes before any code
- Value class: FOUNDATION (consumer: layer 2)
- Files: migrations/0042_refunds.up.sql, migrations/0042_refunds.down.sql
- Excluded-from-budget files: none
- Deliberately NOT here: the queries → layer 2
- Green-gate commands: build … · tests … · lint … --new-from-rev main
- Gate status: NOT RUN
- Risk / rollback: the down migration reverts cleanly

## Decisions
<every question you answered, and why>

## Accepted exceptions
<oversize layers you approved, and why>
```

Field meanings:

| Field | What it is for |
|---|---|
| `ticket` | branch names, PR titles, tracking |
| `entry mode` | `greenfield` = code not written yet · `orc-run` = code already in your working tree |
| `pr template` | which template the driver uses for every PR body |
| `Deliberately NOT here` | stops a reviewer from rejecting a layer for something the next layer fixes |
| `Gate status` | filled in by the driver: `GREEN`, `RED <step>`, or `NOT RUN` |
| `Decisions` | your answers — the audit trail |

Check the plan at any time:

```bash
orc pr stack status            # exit code 0 = ready, 1 = missing or not filled in
```

---

## 10. When it says "do not stack this"

These are normal answers, not failures:

| Situation | What happens |
|---|---|
| your repo is a fork | stop — GitHub cannot stack across forks; use one normal PR |
| no `gh` or no `gh-stack` | stop — one normal PR (never build a fake stack by hand) |
| you have no ticket number | stop — one normal PR |
| you refuse every PR template | stop — one normal PR |
| the change needs more than 8 layers | stop — split the work into several stacks, or release in phases |
| the change is small | you did not need a stack anyway |
| a PR is already open with all the code | out of scope in this version — ship it as one normal PR |

---

## 11. FAQ

**Do I have to run `/orc-pr-setup` before `/orc-pr-driver`?**
No. If you already know your layers, run `orc pr stack template`, fill in the
file, and start at the driver.

**Does this change my code?**
No. This skill only reads and writes one markdown file. It never runs git
commands that change anything.

**Does ORC always ask me to stack?**
Only in the full `/orc` and `/orc-ultra` lanes, and only when the change is
bigger than the limit. `orc-mini` and `orc-fast` never ask. Turn the question
off completely with `orc config set stacked_pr off`.

**Can I stack across two repositories?**
No. GitHub stacks live in one repository. For a change across repos, use
`/orc-poly` — it plans one change over several repos.

**What if I disagree with a layer after the plan is written?**
Edit the plan file, or run the skill again. Nothing exists in git yet, so
changing your mind is free at this point. After the driver runs, changes cost
force-pushes.

**My team squashes commits. Does that work?**
Yes. `gh stack merge` supports merge, squash, and rebase.

**Is the number of layers a score? More is better?**
No. Each layer costs a full CI run and a review context. Fewer, meaningful
layers beat many tiny ones.

---

## 12. What this skill never does

- Never creates a branch, commit, push, or PR.
- Never guesses a cut line — it asks you instead.
- Never fakes a split of something that cannot be split.
- Never plans a stack across forks or across repositories.
- Never edits an already-open pull request into a stack.

---

## 13. Next step

Read **[ORC-PR-DRIVER README](../orc-pr-driver/README.md)** and run:

```
/orc-pr-driver
```

Reference files for the details (loaded by the skill when needed):

| File | Contains |
|---|---|
| `references/layer-taxonomy.md` | the full list of layer kinds, per language, and value classes |
| `references/certainty-gate.md` | the sure/not-sure rules and the "do not talk yourself out of asking" table |
| `../_shared/stack-plan.md` | the plan format, the size rules, the handoff file |
| `../_shared/gh-stack-commands.md` | every `gh stack` command, and what to do if GitHub renames one |
| `../_shared/pr-templates.md` | how a PR description is chosen, plus the three ready-made templates |
