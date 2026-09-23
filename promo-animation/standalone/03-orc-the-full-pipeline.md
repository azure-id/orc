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

## Scene 03 — `/orc`, the full pipeline (~25 seconds)


The flagship scene. It shows the whole `/orc` run: intake → plan → **score** →
parallel waves → review → verify → ship. The two things that must land are
**scoring** (a task's difficulty picks the model, so you stop paying Opus prices
for a one-line rename) and **waves** (tasks that do not collide run at once).

Layout: a full-width terminal panel, plus a narrow **phase rail** pinned down the
left edge — eight dots joined by a 1px line, labelled `intake · plan · score ·
build · review · verify · ship`. The active phase's dot is cyan and slightly
larger; completed dots are solid `--green`; future dots are `--line`. The rail is
the viewer's clock for the whole scene.

---

## The beat sheet

### Beat 1 — 0.0s to 3.5s · Intake, and a gate

Rail: **intake** lights.

```
> /orc add order notes: a note field on checkout, saved with the
  order, shown on the order page

Run folder:  .claude/orc/run/order-notes/

I read the repo: TypeScript, vitest, Express. I will not ask you about that.
Four questions, one round:

  1  What must exist when this is done?
  2  What is NOT part of this?
  3  How will we know it works?
  4  Any file or pattern to stay away from?
```

The human's four answers type in fast, tight, one after another in cyan. Then:

```
Draft written: intent-spec.md          Sign-off:  gate  or  soft?
> gate
Approved.
```

Render the word `gate` in **amber** — this is the "a human decides" colour, and
it recurs. `Approved.` flashes green once.

### Beat 2 — 3.5s to 7.0s · Planning, and a caught mistake

Rail: **plan**.

```
5 tasks. Every file path checked against the real repo:
  14 of 15 paths exist.  api/orders/note_servce.ts  does NOT exist (typo)
  → plan sent back to the planner → corrected to note_service.ts ✓
```

Animate this: `note_servce.ts` appears in **red** and shakes 4px horizontally,
then a 400ms morph rewrites it in place to `note_service.ts` in **green**.

This beat is doing real persuasive work — it shows ORC checking its own planner
against the actual filesystem. Give it a beat of silence after.

### Beat 3 — 7.0s to 13.0s · Scoring — hold this the longest

Rail: **score**.

Five score rows build in, 140ms apart, on an aligned grid. Behind each score
number, a thin proportional bar fills from 0 to its value over 500ms.

```
Task                                facets                    score   model
T1  note column + migration         3 files · new · stateful    62    sonnet-5 high
T2  POST /orders accepts note       2 files · imitate           38    sonnet-4-6 med
T3  checkout note box               2 files · imitate           35    sonnet-4-6 med
T4  order page shows the note       1 file  · mechanical        12    haiku-4-5
T5  label text                      1 file  · mechanical         4    haiku-4-5
```

Then a **0–100 ladder** slides up beneath the table: a horizontal track with
model bands marked along it, and five dots dropping onto their positions with a
small bounce. The bands read left to right: `haiku-4-5 → sonnet-4-6 →
sonnet-5 → opus-4-8 → opus-5`.

Caption in `--text-dim`, typing on beneath:

> *Arithmetic, not opinion. The score picks the model.*

Hold **1.5 seconds**. This is the idea people repeat to other people.

### Beat 4 — 13.0s to 19.0s · The waves

Rail: **build**.

```
Waves:  W1 {T1}   W2 {T2, T3}   W3 {T4, T5}
Pause every 2 waves. OK to start?
> yes
```

The five score rows **reflow** into three grouped wave blocks — animate the
regroup, do not cut to it. Then run them:

- **W1** — one agent card, rail fills, returns
  `build green · npx vitest run db/ exit 0 ✓` and, in dim text under it,
  `answered as: claude-sonnet-5 / high  ✓ matches what I asked for`.
- **W2** — **two cards side by side**, rails advancing together at different
  speeds. Mid-run, card T3 turns **amber** and raises a question:

  ```
  T3 asked me a question: "note max length?"
  > 500 characters
  ```

  The amber clears back to cyan and the rail resumes. Under both cards, dim:
  `no two tasks touched the same file`.

- A **PAUSE** card slides in, amber-bordered:

  ```
  ⏸  PAUSE (2 waves done) — checkpoint saved
     continue in a fresh chat by pasting one line
  ```

  Hold 800ms, then `> continue` and it dissolves.

- **W3** — two haiku cards, fast, done. `5 of 5 tasks complete.`

### Beat 5 — 19.0s to 22.5s · Review and verify

Rail: **review**, then **verify**.

```
Review (orc-reviewer-opus-5-med):
  P1  note is not length-checked on the server — api/orders/create.ts:44
      I re-read line 44 myself. The quote matches. Fix it?   > yes
  P3  naming nit ×2  (counted, not fixed)

Verify: build green · tests green · every acceptance line met.
```

`P1` in red, `P3` in `--text-dim`. The three verify results tick green in
sequence, 200ms apart.

### Beat 6 — 22.5s to 25.0s · Ship

Rail: **ship** — the last dot fills, and the whole rail flushes green from top to
bottom in one 600ms sweep.

The terminal shrinks and dims. Centred over it:

> ## `/orc`
> ### one sentence in · five tasks · three waves · shipped

with a single dim line beneath: `every step written to disk — stop any time,
come back in a new chat`.

Hold 2 seconds.

---

## What must be true

- **Do not shorten the scoring beat.** It is the differentiator.
- Parallel rails must never be frame-synchronised.
- The amber question in W2 matters: it shows ORC stops and asks rather than
  guessing. Do not cut it for time.
- Model names must come from the allowed set in the brand file.
