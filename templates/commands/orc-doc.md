---
description: Write a PRD, TSD, collaboration agreement, report or workflow as portable Markdown — resumable across sessions
---

Use the **orc-doc** skill. Standalone — no plan, no build, no code written.

You arrive with a context: what you want written down, and about what. You leave
with a finished Markdown document that imports cleanly into Notion, Obsidian,
Google Docs, Coda, Craft and GitHub — plus one line that resumes the work months
later in a brand-new session.

> **The orchestrator never reads the document body.**

That is the whole architecture. A 900-line TSD is about 30k tokens; read it three
times and the session is over. So nothing that holds context ever holds the
document: the CLI derives a section map (heading, line range, hash), the writers
each own **one part file**, the checkers each read **one line range**, and the
orchestrator holds the map and the returns. A 10,000-line document costs the
orchestrator about 750 lines of context instead of 20,000.

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
outline after a write wave is what costs money.

**Where it will end up is a real setting, not a nicety.** `orc doc lint` enforces
that target's actual limits: Notion has three heading levels, so an H4 is an
error there; Docusaurus needs YAML front matter, so its absence is an error
there and its presence is an error everywhere else. A hard-wrapped paragraph is
an error everywhere, because a wrap at 80 columns becomes a line break inside a
Notion paragraph. The lint is deterministic and costs zero model tokens, and it
always runs before anything paid.

**Your edits are sacred.** Edit `document.md` yourself whenever you like — the
lane detects it by hash, tells you which sections you touched, and never rewrites
one unless you name it. A splice that would overwrite your wording refuses and
says which section.

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

Read the state back any time without this lane: `orc doc status <slug>`.

What you want written, or a slug to reopen (or nothing, and it will ask): $ARGUMENTS
