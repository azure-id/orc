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

## Scene 02 — Hero: what ORC is (~12 seconds)


Build a single-shot animated hero. This is the **first thing anyone sees**. It
has one job: make a Claude Code user think *"wait, it does what?"* in under
twelve seconds.

---

## The beat sheet

### Beat 1 — 0.0s to 2.2s · One line, typed

Black. Centred, a terminal panel at 900px wide, nothing else on screen.

A human types, cyan `> ` prefix, 26ms per character:

```
> /orc add order notes: a note field on checkout, saved with
  the order, shown on the order page
```

Block cursor blinks twice. Hold 400ms.

### Beat 2 — 2.2s to 3.0s · The panel splits

The terminal does not scroll. It **splits**: it slides left and shrinks to 40%
width, and a second surface expands into the right 60% — the "work surface". A
1px cyan spine runs down the seam and stays there for the rest of the scene.

This split is the visual thesis of the whole product: *you say one thing on the
left, and a lot of things happen on the right.*

### Beat 3 — 3.0s to 7.5s · The work happens

On the right, five stages resolve top to bottom, each entering 500ms after the
last. Each is one line of mono text with a small state dot on the left.

```
●  understood      4 questions · signed off        [dot: violet]
●  planned         5 tasks · 14 of 15 paths exist  [dot: violet]
●  scored          62 · 38 · 35 · 12 · 4           [dot: cyan]
●  built           3 waves · 2 agents at once      [dot: cyan]
●  proved          build green · tests green       [dot: green]
```

While the `built` row is live, **four small agent cards fan out to the right of
it** and run their progress rails at once, at slightly different speeds, then
collapse back into the row with a soft cyan flash. Do not let them all finish on
the same frame.

As each row completes, its dot fills solid and a `✓` appears at the far right,
right-aligned in a column.

### Beat 4 — 7.5s to 9.5s · The claim

Everything on the right fades to 15% opacity and blurs 3px. Over it, centred,
the headline resolves — word by word, 120ms apart, each word rising 12px:

> ## You describe it once.
> ## ORC plans it, prices it, builds it in parallel, and proves it.

64px, weight 700, `--text`, with **"in parallel"** and **"proves it"** in cyan.

### Beat 5 — 9.5s to 12.0s · The mark, held

The headline slides up 40px and dims to 60%. Beneath it, on one line:

```
🐋 ORC   ·   a skill constellation for Claude Code   ·   zero dependencies
```

The whale draws in as a monoline cyan silhouette over 500ms (stroke-dasharray
reveal), then the text after it types on. Hold this final frame for **2 full
seconds** with only the whale's outline breathing at 4% opacity.

---

## What must be true

- The left terminal keeps the user's typed line visible the whole time. The
  viewer must never lose the fact that **one sentence started all of this**.
- The five right-hand rows are the real pipeline in the real order. Do not
  reorder them or add a sixth.
- The parallel moment (Beat 3) is the money shot. Give it room — it is the one
  thing no other Claude Code tool shows.
- No stock imagery, no gradients that look like a SaaS landing page. Flat, dark,
  precise.
