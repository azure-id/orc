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

## Scene 04 — `/orc-doc`, long documents (~20 seconds)


The lane that writes a PRD, a TSD, a runbook or a report — and can be picked up
months later in a brand-new session without you explaining anything twice.

**The one idea to sell:** *ORC never reads the document body.* A 900-line design
document is roughly 30,000 tokens; read it three times and the session is over.
So nothing that holds context ever holds the whole document. That constraint is
what makes long documents possible at all — and it is a genuinely surprising,
quotable design decision.

Lane colour: **violet** (`--violet`) throughout, with cyan reserved for ORC's own
spine.

---

## The beat sheet

### Beat 1 — 0.0s to 2.5s · The problem, stated visually

Centre screen: a tall document silhouette, 900 lines rendered as densely stacked
1px violet rules. A label counts up beside it: `900 lines · ~30,000 tokens`.

A context-window meter appears beneath it and fills — once, twice, three times —
and on the third fill it **saturates red** with the word `full`.

Caption: *Read it three times and the session is over.*

Hold 500ms. This is the pain, and it should genuinely sting.

### Beat 2 — 2.5s to 6.0s · The reframe

The document silhouette **breaks apart** into eleven separate small cards that
spread across the screen, each labelled like a real file:

```
sections/01-summary.md      sections/02-problem.md
sections/03-goals.md        sections/04-non-goals.md
sections/05-approach.md     …
```

Caption, typing on:

> ### The folder is the document.
> `document.md` is only built from it — and rebuilding costs nothing.

Then a three-row table resolves beneath, each row entering 150ms apart:

```
Who           What they hold
ORC           a map: heading, line range, fingerprint, state
each writer   ONE section file, and nothing else
nobody        the whole document
```

Render the last row's **`nobody`** in violet, weight 700. That word is the whole
scene.

### Beat 3 — 6.0s to 9.0s · Context, frozen once

A small terminal panel slides in from the left:

```
> /orc-doc

What do you want this document to say?
> the payments rewrite: why we are moving off the old gateway,
  what the new contract looks like, and what breaks

Frozen to:  context.md
```

The word `Frozen` gets a brief frost-white shimmer, then settles violet. A small
lock glyph appears beside `context.md`.

Caption in dim text: *Asked once. A session three months from now reads this and
never asks you again.*

### Beat 4 — 9.0s to 14.5s · A wave of writers

Three writer agent cards fan out, each visibly bound to **exactly one** section
file — draw a 1px violet line from each card to its own card in the section grid
from Beat 2, and make it obvious that **no two lines ever reach the same file**.

```
▶ wave 1   orc-doc-writer-opus-5-med  ×3
           04-non-goals.md   05-approach.md   06-contract.md
```

Rails advance at different speeds. As each finishes, its section card fills
violet and gains a `✓`.

Then a free step, in green:

```
orc doc lint     free · zero tokens · 3 findings
```

then a checker pass, each checker reading exactly one bounded part:

```
▶ checkers   orc-doc-checker-opus-5-low  ×3     anchored findings, per section
```

### Beat 5 — 14.5s to 17.5s · The stop, and the hand-back

A wave is a **stop**. An amber-bordered card slides up:

```
⏸  wave 1 of 3 done — 6 sections written, 5 to go

    Where it stands:  /orc-doc · phase D7 · wave 1 of 3

    RESUME.md written. Walk away. Paste that line in any new chat.
```

The `Where it stands:` line highlights and a subtle copy affordance pulses once.

Caption: *Every wave is a place you can leave.*

### Beat 6 — 17.5s to 20.0s · The build

The section cards sweep together into a single document card labelled
`document.md`, and five destination chips light up in a row beneath it, 80ms
apart:

```
Notion    Obsidian    Google Docs    Coda    GitHub
```

Final line, centred:

> ## `/orc-doc`
> ### the folder is the document · come back months later · it never read a word of it

Hold 2 seconds.

---

## What must be true

- The "nobody holds the whole document" row is the memorable beat. Land it.
- The one-writer-one-file lines must visibly never cross or converge.
- `orc doc lint` is genuinely free and zero-token — say so, in green.
- Do not imply ORC commits or stages the document. It does not.
