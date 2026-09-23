# Scene 07 — `orc ui`, the control panel (~22 seconds)

> Requires `01-brand-and-motion-system.md` earlier in this conversation.

A local web page for everything in ORC that is **not** ai.

**Say this plainly, on screen:** *it never runs a lane and never calls a model.*
That restraint is the product decision — the panel subprocesses the real CLI for
every read and shells the real command for every write, so the panel and the
terminal can never disagree.

This scene is a **setup walkthrough**: start it, look at it, change something,
apply it. Someone should be able to follow along.

---

## The beat sheet

### Beat 1 — 0.0s to 3.0s · Start it

A terminal, centred:

```
$ orc ui
```

```
orc ui  ·  http://127.0.0.1:9921/?t=3734924cb00ae0fe…
  project   /home/rina/shopcart
  token     new for this launch — the URL is the key
  idle      shuts down after 30 minutes with no tab open

Opening your browser.
```

Three dim annotations point at three parts of that output, entering 200ms apart:

```
loopback only — never exposed        → 127.0.0.1
one token per launch                 → ?t=…
zero dependencies, no build step      → (beside the command)
```

### Beat 2 — 3.0s to 5.0s · The panel arrives

The terminal shrinks to a corner and **the panel expands** into the frame — not
a browser mockup, no address bar, just the panel itself, edge to edge, dark.

A left nav lists the panels, each entering 50ms apart:

```
Overview · Settings · Runs · Knowledge · Stats · Flow · Crosslink
Promises · Boundary · Self-serve · Extra · Docs · Mocked Skill Use
Learn · Experiment · Maintenance
```

Overview is selected, cyan.

### Beat 3 — 5.0s to 9.0s · Overview — what is waiting

The Overview panel composes: a version chip `v0.54.0`, a doctor summary, a wiki
freshness chip, and a card headed **Worth doing** — one list of everything that
currently wants a decision.

```
Worth doing
  ●  wiki has 2 STALE docs                    → Knowledge
  ●  1 run left unfinished                    → Runs
  ●  3 orphaned files from an old version     → Maintenance
```

Each row's arrow animates to its nav item, showing that **a caution routes to
the panel that can clear it** — never to a generic settings page.

### Beat 4 — 9.0s to 13.0s · Settings — staged, then applied together

Click into Settings. Config keys, grouped, each with the right control for its
type — a toggle, a select, a number.

Change three things. As each changes, a **pending edit** appears in a sticky bar
at the bottom, **named**, never just counted:

```
3 pending    batch_pause_every 2 → 3 · generate_tests off → on · extra_enabled → true
[ Discard ]                                                            [ Apply ]
```

Then re-set one value back to its original — and it **disappears from the list**.
Show that; it is a small, precise, confidence-building detail.

Press **Apply**. Each write runs one at a time, in staged order, each ticking
green 150ms apart. Beneath, in dim mono, the actual commands scroll past:

```
orc config set batch_pause_every 3
orc config set generate_tests on
orc config set extra_enabled true
```

Caption: *The panel shells the real CLI. There is no second implementation to
drift.*

### Beat 5 — 13.0s to 17.0s · Flow — the pipeline, drawn

Click into Flow. A **horizontal stepper** draws itself, one phase per node, in
order, with a connector animating between each:

```
intake → analyze → plan → score → tdd → build → review → verify → ship
```

One node — `review` — is **red and struck through**, but it **keeps its slot**.

Callout: *An OFF phase keeps its place. Hiding it would make "I switched review
off" and "this flow has no review phase" look identical.*

A slow sweep of light travels the stepper end to end and loops.

### Beat 6 — 17.0s to 20.0s · Maintenance — preview, then apply

Click into Maintenance.

```
Remove orphaned files
  Command:   orc update --prune
  [ Preview ]        [ Apply ]   ← disabled, greyed
```

Press **Preview**. Apply **enables**. The preview names **every file**:

```
.claude/agents/orc-executor-opus-4-8-med.md
.claude/skills/orc/references/old-scoring.md
.claude/commands/orc-legacy.md
```

Callout, held: **A count is not consent.**

Press Apply. Green. Done.

### Beat 7 — 20.0s to 22.0s · The claim

The panel dims. Centred:

> ## `orc ui`
> ### everything in ORC that is not ai
> *it never runs a lane · it never calls a model · zero dependencies*

Hold 2 seconds.

---

## What must be true

- **Never draw a browser frame or an address bar.** Show the panel itself.
- The "never runs a lane, never calls a model" line must be on screen at least
  twice — it is the thing people misunderstand about a web panel.
- The named-not-counted pending edits, and the named-not-counted prune preview,
  are the same principle twice. Keep both.
- Everything shown must be one of the real panels listed in Beat 2.
