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

## Scene 08 — Install and first run (~14 seconds)


The "how do I actually use this" scene. Someone watching should be able to
follow along in their own terminal and land on a working install.

Keep it **calm and literal**. No flourish. This is the scene where a viewer
decides whether the barrier is low enough — and it is: three commands.

---

## The beat sheet

### Beat 1 — 0.0s to 4.0s · Install

A single terminal panel, centred, wide. Type at 26ms/char:

```
$ npm install -g orc
```

Output appears line by line — do **not** fake an npm progress spinner for
longer than 600ms:

```
added 1 package in 1s

ORC installed. Run: orc init  (or orc init --global)
```

Three chips fade in beneath the panel, 100ms apart:

```
zero dependencies      Node ≥ 18      v0.54.0
```

### Beat 2 — 4.0s to 8.0s · Init, in your project

```
$ cd ~/shopcart
$ orc init
```

The output lands as grouped, ticking lines — each group's tick 150ms after the
last:

```
✓  skills      → .claude/skills/       38 skills
✓  commands    → .claude/commands/     29 slash commands
✓  agents      → .claude/agents/       50 model-pinned subagents
✓  hooks       → .claude/hooks/        effort guard · statusline · trace
✓  settings    → .claude/settings.json merged, nothing overwritten

ORC is installed in this project.  Try:  /orc  ·  /orc-quick  ·  orc ui
```

Beside the `settings` line, a dim callout: *merged, never clobbered — your
existing statusline is left alone.*

While these tick, a small file tree draws itself on the right, folder by folder:

```
.claude/
  skills/    commands/    agents/    hooks/    orc/
```

Caption, dim: *ORC is not a program that runs. It is markdown that Claude Code
reads.*

### Beat 3 — 8.0s to 11.5s · The first command

The terminal transitions to a Claude Code session. A slash-command menu drops
down as the user types `/orc`, showing the real lanes filtering live:

```
/orc            the full pipeline
/orc-quick      look → ask once → do
/orc-doc        write a long document
/orc-challenge  grade a finished artifact
/orc-mini       lighter build
/orc-fast       knowledge-gated single executor
…
```

The user picks `/orc-quick` — the friendliest entry point — types a short
request, and the first two lines of the reply appear before we cut:

```
> /orc-quick the refund badge shows "pending" after the webhook lands

I looked. Here is what I found and what I need from you.
```

Freeze there. Do not run the whole lane — scene 03 already did.

### Beat 4 — 11.5s to 14.0s · The three lines, held

Everything clears to a single centred card, three commands, mono, generous
spacing:

```
npm install -g orc
orc init
/orc
```

Under it, dim: `orc help · orc ui · github.com/azure-id/orc`

Hold 2.5 seconds. This is a **screenshot frame** — people will pause here.

---

## What must be true

- Real numbers only: 38 skills, 29 slash commands, 50 agents, v0.54.0, Node ≥18.
- `orc init` **merges** settings and never clobbers a user's `statusLine`. Say so.
- Do not imply ORC is a running daemon or a service. It copies markdown files.
- The final three-line card must be legible at 50% scale.
