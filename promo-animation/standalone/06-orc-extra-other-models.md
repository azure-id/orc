# ORC promo animation — paste this WHOLE file into Claude Design

Two parts. **Part A** is the shared design system (identical in every scene
file). **Part B** is the one scene to build. Read A, then build B.

---

# PART A — brand & motion system

---

## 1. What is being promoted

ORC takes a feature request or a requirements document, works out what was
meant, plans the work, gives every task a score from 0 to 100, sends each task
to the **cheapest model that can still do it**, runs non-colliding tasks **at the
same time**, reviews, verifies against a signed-off definition of done, and
ships.

The audience is **working developers** who already use Claude Code. They are
sceptical of marketing. The animation must feel like watching a real tool do
real work — not like a product video pretending.

**The core promise, in one line:** *You describe it once. ORC plans it, prices
it, builds it in parallel, and proves it.*

---

## 2. Canvas & output

- **1920 × 1080**, 16:9, dark background edge to edge. No letterboxing.
- Designed for **screen recording**, so: no scrollbars, no hover-only states, no
  audio cues, nothing that needs a cursor to reveal it.
- Everything loops or ends on a **held final frame of at least 1.5 seconds** so
  the recording has a clean out point.
- Motion respects `prefers-reduced-motion`: under that query, every element
  appears in its final state with opacity fades only, no transforms.

---

## 3. Palette

Dark, cold, deep-sea. ORC's mark is a whale.

```
--bg-void      #07090D   page background
--bg-panel     #0E1219   cards, terminal chrome
--bg-raised    #151B25   hovered / active rows
--line         #212A38   1px borders, dividers
--line-bright  #33405469 focus rings, active borders

--text         #E6EDF6   primary text
--text-dim     #8B98AC   labels, comments, secondary
--text-faint   #4E5A6E   timestamps, inactive

--cyan         #38E2D0   ORC accent. The whale, the spine, the active state.
--cyan-deep    #12A697   pressed / trailing edge of the cyan
--violet       #8B7BFF   planning, thinking, analysis phases
--amber        #F0B23A   waiting on a human, a pause, a caution
--green        #45D483   green build, passed gate, shipped
--red          #FF6B6B   failed gate, a P1 finding, a refusal
--magenta      #FF6FD8   foreign / non-Claude model (orc extra ONLY)
```

**Colour is meaning, never decoration.** Cyan = ORC itself. Violet = a model
thinking. Green = something proved. Amber = a human is needed. Red = a real
problem. Magenta appears in exactly one scene (`orc extra`) and nowhere else.

Every colour is defined once, as a token, on `:root`.

---

## 4. Typography

- **UI / headings:** Inter, or `-apple-system, "Segoe UI", system-ui, sans-serif`.
  Headings at **-0.02em** tracking. Weights 600 and 700 only.
- **Terminal / code / data:** `"JetBrains Mono", "SF Mono", Consolas, monospace`.
  This is the majority of the pixels on screen — ORC is a terminal tool.
- Terminal body: **15px / 1.65**. Never smaller than 14px anywhere: this will be
  recorded and re-compressed.
- Headline scale: 64px hero, 40px scene title, 22px caption, 15px mono body.
- Never use more than two type families in one scene.

---

## 5. Components you will reuse

### The terminal
A rounded 12px panel, `--bg-panel`, 1px `--line` border, a soft outer shadow and
a very faint cyan glow at 6% opacity. A 34px title bar with three dots
(`#3A4353`, dimmed — not macOS red/yellow/green) and a centred dim label such as
`rina@shopcart — claude code`. Body padding 24px 28px.

Inside it:
- The user's typed line is prefixed `> ` in **cyan**.
- ORC's own output is `--text`.
- Comments, paths and side-notes are `--text-dim`.
- A status word (`✓`, `PAUSE`, `P1`, `green`) takes its meaning colour.

### The lane chip
A pill: mono 13px, 6px 12px padding, 999px radius, 1px border in the lane's
colour at 40% alpha, background at 10% alpha, text at full. Used for
`/orc`, `/orc-doc`, `orc extra` and so on.

### The agent card
A small card representing one dispatched subagent: the agent name in mono
(`orc-executor-sonnet-5-high`), the task under it in `--text-dim`, and a 3px
progress rail across the bottom in the lane colour.

### The score row
A task name, a facets string, a number 0–100, and a model name — laid out on a
grid so the numbers align in a column. A thin proportional bar behind the number
shows where it sits on the 0–100 ladder.

---

## 6. Motion rules

- **Easing:** `cubic-bezier(0.22, 1, 0.36, 1)` for entrances (a decisive settle),
  `cubic-bezier(0.65, 0, 0.35, 1)` for anything that moves and stops.
- **Durations:** 180ms micro, 320ms element entrance, 600ms scene transition.
  Nothing takes longer than 900ms except a deliberate progress rail.
- **Typing:** terminal text types at 22–30ms per character, with a 400ms pause at
  each newline. A blinking block cursor at 530ms. **Never** type ORC's own
  output character by character — ORC's output *appears*, in whole lines, 90ms
  apart. Only the human types.
- **Stagger:** lists and cards enter 60ms apart, never all at once.
- **Parallelism must look parallel.** When two agents run at the same time, their
  progress rails advance simultaneously at *slightly different speeds*. Identical
  synchronised bars read as fake.
- Every scene ends on a **held frame ≥1.5s**.

---

## 7. Hard rules

1. **Never show a Claude model id that does not exist.** The allowed set:
   `claude-opus-5`, `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-haiku-4-5`,
   `claude-opus-4-8`. Agent names look like `orc-executor-sonnet-5-high`.
2. **Never show a dollar figure** unless the scene explicitly gives you one.
3. **No fake UI chrome.** No browser address bars, no macOS window buttons in
   product colours, no phone frames.
4. **No stock illustration, no 3D robots, no neural-network graphics, no glowing
   brains.** The aesthetic is terminal + data, full stop.
5. **The whale 🐋 is the only mascot** and it appears as a simple monoline cyan
   silhouette, or as the emoji, and only in the hero and the closing card.
6. Text on screen must be **readable at 50% scale** — this gets watched on
   phones and in a Twitter timeline.

---


# PART B — the scene to build

## Scene 06 — `orc extra`, run part of it elsewhere (~18 seconds)


Run some of ORC's work on a **different** AI model — DeepSeek, GLM, Kimi, a model
on your own laptop, or any endpoint you name — and still know exactly what left
your machine.

This is the **only** scene where `--magenta` appears. Magenta means *foreign*.
The instant a viewer sees magenta anywhere in ORC, it means work is leaving
Claude. That colour discipline is itself part of the pitch.

**The three promises to land, in this order:**
1. **ORC itself never moves.** Only the task is sent away. Planning, reviewing
   and checking stay where they are.
2. **Nothing happens until you say so.** Off by default; a connection you have
   not tested can never be used.
3. **You are always told** — before the work starts, not after.

---

## The beat sheet

### Beat 1 — 0.0s to 3.5s · The ladder splits

Recall the 0–100 score ladder from scene 03. Bring it back, cyan, familiar.

Then a magenta band claims the low end, sliding in from the left:

```
score   0 ──────── 30 ──────── 55 ──────── 100
        └ DeepSeek ┘└─────── Claude ───────┘
          (yours)      (unchanged)
```

Caption: *A tiny rename does not need the biggest model. Now it does not need
Claude either — if you say so.*

The `(unchanged)` under the Claude portion should be legible and reassuring. The
viewer's real fear here is "does this break my setup". Answer it in the picture.

### Beat 2 — 3.5s to 7.0s · Setup, six commands

A terminal panel. Type only the commands; let the output appear.

```
$ orc extra providers
  deepseek   DeepSeek           api · claude-shim
  zai        Z.ai (GLM)         api · claude-shim
  moonshot   Moonshot (Kimi)    api · claude-shim
  ollama     Ollama (local)     api · claude-shim
  opencode   OpenCode           cli
  codex      Codex              cli

  Model ids are NOT shipped — they rot within a quarter.
```

Highlight that last line and hold it a beat. Then:

```
$ orc extra add cheap --provider deepseek --engine api
$ orc extra ping cheap
  ✓ reachable · 6 models listed · 412 ms · this cost a fraction of a cent
$ orc extra route --band 0-30 --profile cheap
$ orc config set extra_enabled true
```

The `ping` result ticks **green**. Beside it, a small note in dim text:
*a profile that has never answered a probe can never be routed to.*

### Beat 3 — 7.0s to 10.0s · The credential, handled properly

A compact three-way diagram, one row each, entering 200ms apart:

```
env      a variable already in your shell
vault    encrypted on disk · AES-256-GCM · a passphrase with a deadline
tool     the CLI is already signed in — ORC sends no key at all
```

Then one line, emphasised, with a small crossed-out terminal glyph:

> **The key never reaches a command line.** `--key <value>` is refused by name.

Hold 800ms. Security-minded viewers stop scrolling here.

### Beat 4 — 10.0s to 14.5s · A run, announced before it starts

Back to a `/orc` run. Phase 1 preflight, and **before wave 1**, an announcement
band slides down across the full width in magenta:

```
extra:  band [0,30) → cheap (deepseek) · 2 of 5 tasks will run off Claude
        T4 order page shows the note      score 12
        T5 label text                     score  4
```

Caption: *Printed before the work starts. Every armed run, every time.*

Then the waves run. **T4 and T5's agent cards are magenta.** T1–T3 stay cyan.
The visual split does the explaining with no words at all.

On return, a validation strip under the magenta cards:

```
returned · checked against the worktree · declared_files fence held ✓
```

### Beat 5 — 14.5s to 18.0s · The money, counted

A stacked cost bar resolves, four segments, each labelled and never blended:

```
input      cache write      cache read      output
```

with:

```
orc extra stats
  18 dispatches · 2 profiles · reliability measured per profile
  every dispatch written to .claude/orc/extra-spend.jsonl at the moment it happened
```

Final card:

> ## `orc extra`
> ### route the cheap end anywhere · ORC stays where it is · you are always told

Hold 2 seconds.

---

## What must be true

- Magenta appears **only** in this scene and **only** for foreign work.
- Do not show a specific third-party model **id** — ORC deliberately ships
  providers and never models, because a shipped model id is wrong within a
  quarter and wrong silently.
- Do not show a dollar figure. ORC does not print one it did not price itself.
- The "announced before the work starts" beat is the trust beat. Do not cut it.
