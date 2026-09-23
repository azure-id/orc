# Scene 08 — Install and first run (~14 seconds)

> Requires `01-brand-and-motion-system.md` earlier in this conversation.

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
