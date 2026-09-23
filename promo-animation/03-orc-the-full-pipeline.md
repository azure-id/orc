# Scene 03 — `/orc`, the full pipeline (~25 seconds)

> Requires `01-brand-and-motion-system.md` earlier in this conversation.

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
