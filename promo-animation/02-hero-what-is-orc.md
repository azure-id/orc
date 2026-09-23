# Scene 02 — Hero: what ORC is (~12 seconds)

> Requires `01-brand-and-motion-system.md` earlier in this conversation.

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
