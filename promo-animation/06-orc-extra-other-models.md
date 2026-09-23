# Scene 06 — `orc extra`, run part of it elsewhere (~18 seconds)

> Requires `01-brand-and-motion-system.md` earlier in this conversation.

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
