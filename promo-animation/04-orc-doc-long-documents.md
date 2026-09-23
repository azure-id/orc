# Scene 04 — `/orc-doc`, long documents (~20 seconds)

> Requires `01-brand-and-motion-system.md` earlier in this conversation.

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
