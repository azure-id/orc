---
name: orc-handoff
description: >
  The lane for people who do not read code. Use for "/orc-handoff", "I want to
  change the text on the empty cart page", "can I edit this myself", "what can a
  PM safely change here". Two modes. MAP finds the files a non-engineer can own —
  screen text, content, settings with a validator, feature flags, docs — and grades
  each one: green (a check will catch a mistake), amber (the check is manual), red
  (looks like content, is not). DO changes one value: it shows you the file, the
  check, and the undo command BEFORE it edits, then runs the check and tells you in
  plain words. It never touches a red file. It never commits.
---

# ORC-HANDOFF

**This whole folder is written in simple English on purpose.** Many people who use
this lane do not read code, and many do not read English first. Keep every file
here short, plain, and free of jargon. Same standing rule as `../orc-quick/`.

## What this lane is for

You want to change something small and you should not have to ask an engineer.

- the words on a page
- a title, a label, a button
- a setting that has a safe list of values
- a feature switch that is on or off
- a document

You do not need to read code. You do not need a terminal. You need to know two
things before you change anything: **will something catch my mistake**, and **how
do I undo it**. This lane always tells you both, before it edits.

## The idea that makes this safe

**The grade does not come from the file type. It comes from whether a cheap check
exists for that file.**

A settings file with a validator is **green**. The exact same file with no
validator is **amber**. That is why this is a real safety rule and not a feeling.

| Grade | What it means |
|---|---|
| 🟢 GREEN | Change it. A check runs after, and it will catch a mistake. |
| 🟡 AMBER | Change it. But the check is a person, not a program. Here is the check. |
| 🔴 RED | This looks like content. It is not. ORC will not touch it. |

**A red file is never edited.** Not by you through this lane, not by ORC. The lane
says why, says who to ask, and **offers** `/orc-quick` instead. It is an offer, not
a redirect — the same rule `/orc-quick` follows when a job is too big.

## Rules this lane never breaks

- **The undo command is shown BEFORE the edit, not after.** After is too late.
- **It never stages and never commits.** It prints the git command for you.
- **It never re-grades a file to make a change possible.** If it is red now, it is
  red for this request.
- **It only changes a value that already exists.** It never creates a new key. A
  new key is a code change.

---

## Mode 1 — MAP: what can I own?

Find the files a non-engineer can safely own, and grade each one. Look for:

- screen text and translations
- content files (markdown, pages, posts)
- settings files that have a validator or a schema
- feature switches
- example or seed data
- documents
- design values (colours, spacing) when they live in their own file

For **each** file, record four things. All four, every time:

1. **what it is**, in plain words ("the words users see on the empty cart page")
2. **the grade**, and the reason for it
3. **the exact check** — the command that proves the file is still fine
4. **the exact undo** — the command that puts it back

The grade comes from step 3. **No check found → amber, or red if the file drives
behaviour rather than showing text.** Never green without a real check.

Write it to `orc-handoff/surfaces.md` at the top of the project. Shape and field
rules: `references/surfaces.md`. Then run `orc handoff surfaces` and show what it
says — the CLI is what everything else reads.

**A file with no check is not a failure of the map.** Say so plainly: "this one has
no automatic check, so it is amber, and here is what to look at by hand."

## Mode 2 — DO: change one value

Five steps. Do not skip step 2.

```
H1  find      find the file · show the value now · show its grade
H2  confirm   ONE message: this is the file, this is the check, this is the undo
H3  edit      one value, through `orc handoff set`
H4  check     run the file's own check · say what happened in plain words
H5  record    add a numbered entry to orc-handoff/<slug>/handoff-log.md
```

### H1 — find

Search the mapped surfaces first. If the map does not exist yet, run MAP for just
the area the user named — never the whole project for one small change.

Show the value as it is now. If you cannot find it, say so and ask for more — a
guessed key is a wrong edit.

### H2 — confirm (one message, always)

```
File:   web/locales/en.json
Now:    "Your cart is empty"
New:    "Nothing in here yet"
Grade:  🟢 green

After I change it I will run:   npm run i18n:check
To undo it, run:                git checkout -- web/locales/en.json

Change it? (yes / no)
```

**This message is not optional, even when the change looks tiny.** It is the whole
consent step.

### H3 — edit

Always through `orc handoff set <id> <key> <value>`. Never edit the file yourself.
One writer means one set of rules, and the browser panel uses the same one.

`handoff_write: false` makes this project **map only** — no writes at all. Say that
plainly and stop; do not work around it.

### H4 — check

Green surfaces: the CLI runs the check and reports it.

- **passed** → say so in one line.
- **failed** → say what failed, show the undo command again, and **do not try to
  fix it**. Fixing a failed check is code work.

Amber surfaces: the change is made, and the check is a **task for a person**. Never
report an amber change as verified. Say: "this file has no automatic check, so
nothing has confirmed your change yet. Please check: <the manual check>."

### H5 — record

One numbered entry per change, in `orc-handoff/<slug>/handoff-log.md`. Shape:
`references/handoff-log.md`. One file per thread, named from the first slug, never
staged.

---

## Preflight (ONE time, silent)

1. **Config.** Read `log_dir` and `handoff_write`. Nothing else.
2. **Trace.** Write `log_dir/.current` = `run-handoff-<slug>-<DDMMYY>-<HHMMSS>.txt`
   AND `touch the trace file` in the SAME step. Both, or neither.
3. **Probe.** `orc handoff surfaces --json` (exit 1 = no map yet, which is normal
   on a first run). Use `../_shared/detecting-artifacts.md`, never a raw `find`.

## Where this shows up in `/orc`

At ship, if any changed file was a GREEN surface:

> 2 of these were changes a PM could have made alone — try `/orc-handoff` next
> time.

One sentence. That is the whole seam, and it is how anyone finds out this lane
exists.

## Behavior trace (always on)

Follow `../orc/references/trace-protocol.md`. Lane name `handoff`.
**Single-dispatch lane: exactly ONE end-of-run packet** to
`orc-trace-writer-haiku-4-5`, after the last entry and BEFORE `.current` is
deleted. It carries `run_meta`, the events (mapped, confirmed, edited, checked) and
the confirmations as `decisions`. A run that ends with
`zero new trace lines is a protocol violation`.

Any reading it needs is an **ad-hoc dispatch by model + effort**, never a pinned
agent — **zero new agents ship for this lane**. Announce it in one line first.

## How this lane fails — and the rule that stops it

| Failure | What stops it |
|---|---|
| A file is called safe because it is JSON | The grade comes from the CHECK, not the file type |
| Someone edits money code through a text change | Red is never edited. Ever |
| A change looks verified but nothing checked it | Amber returns a manual TASK, never a pass |
| The user cannot undo it | The undo command is shown BEFORE the edit |
| It commits something by surprise | It never stages and never commits |
| It re-grades a file to be helpful | The grade never moves inside one request |
| It creates a new setting | It only changes values that already exist |
| The words are too hard to read | This whole folder is simple English |

## Rules this lane always keeps

Show the undo first · never touch a red file · never commit · never create a key ·
never call an amber change verified · write through `orc handoff set` only · keep
every word simple.

## Config

Resolve with `orc lane config orc-handoff --json` and obey `effective`. Never merge
`.claude/orc.config.yaml` yourself, and never re-derive a precedence. Exit ≠ 0 →
say so and use `../_shared/config-precedence.md`'s documented defaults, out
loud. Nothing this lane reads is contested, gated or a stop, so it owes no
preflight line and has no gate to honour.
