# Scene 05 — `/orc-challenge`, the lane that refuses (~18 seconds)

> Requires `01-brand-and-motion-system.md` earlier in this conversation.

Every other ORC lane **makes** something. This one does not. It grades a
finished artifact — a TSD, a PRD, an ADR, a README, a runbook, a module of code —
writes down exactly what is wrong, and then **stops**. You fix it in a different
session. You come back. It grades again.

**The line the whole scene is built on:**

> **ORC judges. You fix. ORC judges again. ORC never fixes what it judged.**

The reason is the persuasive part: if the same session writes the fix, that
session will also mark it as fixed. It will always say the work is good, because
it just did the work. Keeping the two apart is the only thing that makes the
score mean anything.

Lane colour: **amber** for the judgement, **red** for findings, **green** only at
the very end.

---

## The beat sheet

### Beat 1 — 0.0s to 3.0s · It refuses to guess what "good" means

```
> /orc-challenge docs/tsd-payments.md
```

Immediately, before anything else:

```
Before I can judge this, I need to know what "good" means for it.
```

A four-row table types in, one row per 300ms:

```
Your real goal                                    What ORC attacks
a backend team must build this without asking     every open question, every TBD
this goes to a review board on Tuesday            missing sections, contradictions
our team abroad must read it cold                 idioms, long sentences, jargon
did I forget anything obvious?                    gaps, not wording
```

Then, emphasised:

> **It does not pick one for you.**

Caption, dim: *A defensible finding about the wrong thing is worse than an
obviously wrong one.*

The user answers, and the answer **freezes** — a lock glyph, `goals.md`, amber.

### Beat 2 — 3.0s to 5.5s · The free check runs first

A green bar sweeps across the document silhouette:

```
orc challenge lint     free · zero tokens
  H4 heading at line 212 — Notion flattens it
  hard wrap at 14 lines
  3 sentences over 40 words
```

Caption: *Nothing pays a model to count sentences.*

### Beat 3 — 5.5s to 10.5s · The council

Seven small instrument cards arrange themselves in an arc. Each has a name, a
one-line brief and an effort level. They are **instruments, not staff** — draw
them as calibrated tools, not as avatars, and never as people or robots.

```
judge          opus-5 · high     grades against the frozen goal
contrarian     opus-5 · high     assumes there is a fatal flaw, and hunts it
outsider       opus-5 · low      knows nothing — reports what you assumed
cold reader    opus-5 · low      answers questions FROM the document only
executor       opus-5 · med      what do you actually do Monday morning
first-principles  opus-5 · high  disputes the yardstick itself
expansionist   opus-5 · med      what is being undervalued
```

As the two `low` cards enter, pin a callout beside them:

> **`low` is a measurement, not a discount.** A harder-thinking reader reasons
> around the gap this instrument exists to find.

That callout is the single most credibility-building sentence in the scene. Hold
it 1.2 seconds.

Each card fires a thin line into a shared findings column.

### Beat 4 — 10.5s to 14.0s · The verdict

The findings column resolves into anchored rows, red severity chips first:

```
C-004  blocker   §5 names no owner for the retry budget      serves: buildable
C-007  major     "eventually consistent" never defined       serves: cold-read
C-011  major     §7 contradicts §3 on idempotency keys       serves: review-board
C-018  minor     two acronyms unexpanded                     serves: cold-read
```

Then, in a bordered band:

```
FAIL   2 blockers · 4 major        cycle 1
```

And beneath it, the thing that makes this lane different — a **hard stop**:

```
I am not going to fix this.

Fix it in a NEW session, then come back and run:
    /orc-challenge docs/tsd-payments.md
```

Animate the refusal: the panel border pulses **red once**, and a small chain-link
glyph between "judge" and "fix" visibly **snaps apart**.

### Beat 5 — 14.0s to 18.0s · Cycle 2, and PASS is computed

A hard cut. `cycle 2` badge. Same instruments, faster, and the findings column
now resolves mostly empty:

```
C-004  resolved      C-007  resolved
C-011  resolved      C-018  accepted (recorded, with your reason)
```

```
PASS   computed from the ledger · not declared
```

Type `computed` and then, deliberately, strike through the word `declared` after
it. `PASS` in green, everything else dim.

Final card:

> ## `/orc-challenge`
> ### it grades your work · it will not fix it · that is the point

Hold 2 seconds.

---

## What must be true

- The refusal must land as a **feature**, never as a limitation. Give it the red
  pulse and the snapping link.
- The seven instruments are instruments. No faces, no robots, no avatars.
- `PASS` is **computed**, never declared by a model. Say it exactly that way.
- Do not show ORC editing the document at any point in this scene.
