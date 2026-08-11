# How ORC picks a model (and how to check it)

Short version: **the planner measures the task, arithmetic turns that into a
score, and the score picks a named agent.** No step of that is a judgement call
made in prose, which is why you can argue with the result.

---

## 1. The score is computed, not guessed

The planner is the party that read every file, so it reports **facets** per task:

| Facet | What it measures |
|---|---|
| `breadth` | how many files the task touches |
| `novelty` | mechanical · imitate · new-surface |
| `logic` | none · branching · stateful |
| `test_surface` | none · update-existing · new-tests |
| `risk[]` | cited risks: auth, money, migration, … |
| `uncertainty` | the planner's own confidence |

ORC runs a fixed published formula over those numbers. Two rules ride with it:

- **A cited risk forces a floor of 70.** A small change to payment code is not
  a small task.
- **Every fix-cycle dispatch is scored the same way.** A repair is not
  automatically cheap.

You see the whole table before anything is dispatched.

---

## 2. The score → model table

The default table has 8 bands (`skills/orc/config.md`):

| Score | Model | Effort | Agent |
|---|---|---|---|
| `[0,30)` | `claude-haiku-4-5` | — | `orc-executor-haiku-4-5` |
| `[30,40)` | `claude-sonnet-4-6` | medium | `orc-executor-sonnet-4-6-med` |
| `[40,55)` | `claude-sonnet-4-6` | high | `orc-executor-sonnet-4-6-high` |
| `[55,65)` | `claude-sonnet-5` | high | `orc-executor-sonnet-5-high` |
| `[65,70)` | `claude-opus-4-7` | medium | `orc-executor-opus-4-7-med` |
| `[70,80)` | `claude-opus-4-7` | high | `orc-executor-opus-4-7-high` |
| `[80,90)` | `claude-opus-4-8` | high | `orc-executor-opus-4-8-high` |
| `[90,100]` | `claude-opus-5` | high | `orc-executor-opus-5-high` |

`rubric_bands` (2–8) changes **how the report is grouped**, not the table.

### The alternative table: `opus5_only`

Set `opus5_only: true` and **every dispatched role uses Opus 5**, with effort as
the cost dial instead of the model:

| Score | Model | Effort |
|---|---|---|
| `[0,40)` | `claude-opus-5` | low |
| `[40,80)` | `claude-opus-5` | medium |
| `[80,100]` | `claude-opus-5` | high |

Nine fixed roles switch to an Opus 5 variant too (mini executor, mini analyst,
mini planner, scout, pattern codifier, wiki scanner, CLAUDE.md writer, retro
miner). Two things are **never** forced: the Haiku trace writer (it transcribes
a packet somebody else wrote) and `/orc-diy` (its executors come from the
compiled flow).

While `opus5_only` is on it **outranks** the Fable 5 override and any
hand-written band table. ORC never hides that: `orc config set` names every key
it makes inert, and `orc config list` marks them.

**It is inert in `/orc-quick`.** That lane always asks you which agent to use,
and a forcing mode would silently delete your answer.

### Resolution order

`opus5_only` › a hand-written `rubric_bands_override` › the default 8-band
table.

---

## 3. The models are pinned, so you can check them

A dispatch names a real agent file in `.claude/agents/`, for example
`orc-executor-sonnet-5-high`, whose frontmatter carries the model and effort.
That is why **an agent's model change is always a rename**.

Three ways to confirm what actually ran:

1. Expand the tool call in Claude Code.
2. Read the behavior trace under `.claude/orc/logs/` — every `RETURN` records
   the model that really answered.
3. `orc stats` — it counts dispatches and **downgrades** from those traces.

Every agent return carries `actual_model` and `actual_effort`, quoted rather
than assumed, so a silent tier downgrade is flagged rather than absorbed.

---

## 4. The tier rule that catches everyone

> **A subagent's model can never be higher than your main session's model.**

Run your main Claude Code session on **Opus 5**. Otherwise every Opus-5-pinned
role (analyst, planner, reviewer, verifier, test author, combiner, ultra
advisor and judge) plus the top executor band quietly runs on whatever your
session runs. This is the most common cause of "it used the wrong model".

See `agents/MODEL-MAPPING.md` in your install for the full list.

### The guard `orc init` installs

`orc init` merges two things into `.claude/settings.json`, without replacing
anything you already have:

- **Effort — a hard block.** `hooks/orc-effort-guard.js` (a `PreToolUse` hook)
  refuses to start `/orc` below **high** effort. `claude-opus-5` and
  `claude-fable-5` are cleared from **medium** up, because both outrank the
  Opus 4.8 baseline. This is the half Claude Code lets a hook enforce.
- **Model — a warning only.** Claude Code does not expose the model id to a
  blocking hook, so the tier cannot be hard-stopped. `hooks/orc-statusline.js`
  shows `✅ ORC-ready`, `🚀 ORC-boosted`, or `⛔ ORC WILL DEGRADE`, and the
  orchestrator checks itself at startup. If you already run a statusline,
  `orc init` leaves it alone and prints the snippet for you to merge.

The guard matches the **exact** skill name `orc`. `/orc-fast` legitimately runs
at Sonnet medium — it does no scoring or planning — so it is not in the guard,
and it never should be.
