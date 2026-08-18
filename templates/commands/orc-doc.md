---
description: Write a PRD, TSD, collaboration agreement, report or workflow as portable Markdown — resumable across sessions
---

Use the **orc-doc** skill. Standalone — no plan, no build, no code written.

You arrive with a context: what you want written down, and about what. You leave
with a finished Markdown document that imports cleanly into Notion, Obsidian,
Google Docs, Coda, Craft and GitHub — plus one line that resumes the work months
later in a brand-new session.

> **The orchestrator never reads the document body.**

That is half the architecture. A 900-line TSD is about 30k tokens; read it three
times and the session is over. So nothing that holds context ever holds the
document: the CLI derives a section map (heading, line range, hash), each writer
owns **exactly one file**, each checker reads **one bounded part**, and the
orchestrator holds the map and the returns. A 10,000-line document costs the
orchestrator about 750 lines of context instead of 20,000.

> **`sections/` is the source of truth. `document.md` is a build artifact.**

That is the other half. Every section lives in its own file you can open, edit
and diff in a pull request — `sections/04-goals-and-metrics.md`, and a big section splits
into sub-parts underneath without the reader ever knowing. `orc doc compile`
rebuilds the document from those files, for **zero model tokens**, whenever you
ask. So a resumed session, an update and a re-check never touch the 10,000-line
file at all.

Five base templates, and each one is a floor rather than a cage — bring your own
and its headings become the outline:

`prd` · `tsd` · `collaboration` · `report` · `workflow`

It asks four things, in this order, and the first one blocks:

1. **What do you want this document to say?** No context, no document — it stops
   and points at `/orc-brainstorm` rather than inventing one.
2. **Any files I should read first?** "none" is a complete answer. It never reads
   them itself: one dispatch per file returns anchored claims, not content.
3. **Do you have your own template?** Otherwise it shows you the shipped section
   list before writing a word.
4. **What is it for, who reads it, and what must they be able to do afterwards?**
   Plus language, type, where it will end up, and how long. Every field has a
   recommended default; accepting one counts as answering.

Then the outline, confirmed before anything is written — because changing the
outline after a write wave is what costs money. And one more question: **how much
do you want written at once?** `partial` writes ONE wave and stops, so you can
read those section files and redirect before the rest is paid for. That is the
single biggest saving in the lane.

**Every wave is a stop you can walk away from.** At each boundary you get every
file path it wrote, a free way to see it as one document, and the one line that
resumes the work — written to disk *before* anything that needs a subagent. If a
usage limit kills the run, `orc resume` finds it, and the next session starts at
the following wave and re-reads nothing it already wrote.

**The document carries content only.** No "Open:" blockquotes, no "Assumption:"
notes, no ORC bookkeeping of any kind — not in `document.md` and not in a section
file. It still never invents a fact: what it was not given comes back as a gap,
lands in `gaps.md`, and is raised with you.

**Your project gets its own house rules.** A P0/P1/P2 ledger of what a document
says and how it reads — *"open with a one-paragraph summary"*, *"money always
carries its currency"* — stored in your words and read FIRST in every dispatch,
above ORC's own rules. Each document freezes the set it started with, so a rule
you change halfway through cannot silently invalidate what is already written;
`orc doc rules <slug>` names every rule that moved since. House rules govern what
the document SAYS — they can never change how this lane runs, and ORC declares
that boundary rather than pretending to detect it.

**Four rules it applies to every document, all free.** No questions or `TBD`s in
the body (a section your outline calls *open questions* is exempt); what is
missing is `N/A` plus one short line, never filler; a section well over its
planned length is a finding; and no `src/foo.ts:42`, no `./relative`, no
`localhost` — whoever reads a PRD has no repository. Code examples are always
exempt. A template YOU supply is a cage, not a suggestion: a heading it never had
is an error, and a part that grew one is refused rather than recorded.

**You are told what it will cost before you pay for it.** Once, before the first
write wave: how many sections, how many waves, **how many times it will stop**,
and a token range with its sample count. With no history it refuses to invent
numbers and offers a price-table floor instead. Afterwards, `orc doc cost <slug>`
answers "what did this document cost" across **every session it spanned** — per
role and per section, with a `—` (never a `0`) for anything it cannot join.

**Where it will end up is a real setting, not a nicety.** `orc doc lint` enforces
that target's actual limits: Notion has three heading levels, so an H4 is an
error there; Docusaurus needs YAML front matter, so its absence is an error
there and its presence is an error everywhere else. A hard-wrapped paragraph is
an error everywhere, because a wrap at 80 columns becomes a line break inside a
Notion paragraph. The lint is deterministic and costs zero model tokens, and it
always runs before anything paid.

**Your edits are sacred.** Edit `sections/<id>.md` yourself whenever you like —
the lane detects it by hash, tells you which sections you touched, and never
rewrites one unless you name it. And it will not ship a `document.md` that is
behind its own sections: it refuses and names what moved.

Coming back, in any session:

```
/orc-doc resume                  lists every document
/orc-doc resume prd-checkout     a prefix is enough
```

The new session reads the frozen context, says what you changed, and **stops and
asks what should change**. It never re-asks what you already answered.

It never edits source, never stages, never commits — it prints the `git add`
command. And it never grades its own output: at handoff it offers
`/orc-challenge`, to run in a separate session.

Read the state back any time without this lane: `orc doc status <slug>` for where
it stands, `orc doc parts <slug>` for what is written — which works before a
single compile has ever run.

A document started on an older release migrates the first time you touch it.
`document.md` is split into `sections/` and **never deleted**, a pending edit
wins, and an unparseable file is refused rather than guessed at.

What you want written, or a slug to reopen (or nothing, and it will ask): $ARGUMENTS
