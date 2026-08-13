# Mock run — `/orc-doc`

> You want a long document written down. This lane writes it in parts, so
> nothing ever has to hold the whole thing at once — and you can come back to it
> months later without explaining anything twice.

---

## 1. What it does

You bring a context: what you want said, and about what. You leave with a
Markdown file that imports cleanly into Notion, Obsidian, Google Docs, Coda,
Craft and GitHub — plus one line that picks the work up in a brand-new session.

The rule the whole lane is built around:

> **ORC never reads the document body.**

A 900-line design document is about 30,000 tokens. Read it three times and the
session is over. So nothing that holds context ever holds the document:

| Who | What they hold |
|---|---|
| **ORC** | a map: heading, line range, fingerprint, state — one line per section |
| **Each writer** | its own part file, and nothing else |
| **Each checker** | one line range, read with an offset and a limit |
| **Nobody** | the whole document |

Five kinds of document: `prd` · `tsd` · `collaboration` · `report` · `workflow`.

---

## 2. What you type

```
/orc-doc
```

---

## 3. It asks four things, in this order

The first one blocks. The rest have defaults you can accept.

```
What do you want this document to say?

A paragraph is plenty — the problem, the change, or the decision you want
written down. If you would rather talk it through first, /orc-brainstorm or
/orc-grill will get you there and hand back here.
```

You:

```
We are adding refunds to checkout. Finance wants a limit on how much a single
agent can refund per day, and the mobile team needs to know what the API looks
like before they start. Write the PRD.
```

Nothing has been created yet. **A folder with no context in it is
indistinguishable from an abandoned run**, so no folder exists until this
question is answered.

```
Any files I should read first?

Paste paths, one per line — a spec, an old version, meeting notes, a ticket
export. Say "none" if there are none.
```

You paste two paths. ORC checks both exist, then **dispatches one agent per
file** to read them. It does not read them itself. What comes back is a digest:
the claims that matter, each anchored to `file:line`, plus an explicit list of
what the file did *not* cover.

```
Do you have your own template for this?

Give me the path and I will follow its headings exactly. Otherwise I will use
ORC's base PRD template — and I will show you the section list before writing
a word.
```

You say no.

```
Four more, and every one has a suggested answer you can just accept:

1  What is this document for?      → the decision it should unblock
2  Who reads it?                   → suggested: the mobile team and finance
3  What must they be able to do?   → suggested: build against it without asking
4  Language?                       → en
5  Which type?                     → PRD
6  Where will it end up?           → Notion
7  How long?                       → standard
```

"Where will it end up" is a real setting, not a nicety. Notion has **three**
heading levels, so under `--target notion` an H4 is an **error**, not a style
note.

---

## 4. The outline, before a word is written

```
PRD — Checkout refunds       17 sections

   1  Document info                     20 L
   2  Summary                           30 L
   3  Problem and context               90 L
   4  Goals and success metrics         80 L
   5  Non-goals                         40 L
   …
  17  Revision history                  20 L

Look right? Changing this after the writing starts is what costs money.
```

---

## 5. The write wave

ORC does not decide how to split the work. The CLI does:

```
$ orc doc plan prd-checkout-refund-130826 --role write

  wave 1
    orc-doc-writer-opus-5-med   260L  01-document-info + 02-summary + 03-problem-and-context + 04-goals + 05-non-goals
    orc-doc-writer-opus-5-med   180L  06-users + 07-scenarios
    orc-doc-writer-opus-5-med   340L  08-functional-requirements + 09-non-functional-requirements
    orc-doc-writer-opus-5-med   390L  10-experience + 11-dependencies + 12-risks + 13-rollout + 14-milestones + 15-out-of-scope

  wave 2
    orc-doc-writer-opus-5-med    60L  16-glossary + 17-revision-history

  5 agents across 2 waves.
```

Three rules you can see in that output:

- **A section is never split across two agents.** Half a section is half an idea.
- **Four agents at a time, and four is a hard cap.** More writers is more chances
  for the outline to drift.
- **Sections that talk about each other stay together.** Goals and Non-goals are
  in one slice, because keeping them consistent is free and checking it is not.

Each writer writes **its own file**. No two agents ever have the document open.

---

## 6. Assemble, then the free check, then the paid one

```
✓ assembled 17 sections → orc/orc-doc/prd-checkout-refund-130826/document.md  (487 lines)

orc doc lint — document.md  →  Notion

  2 errors · 6 warnings · 487 lines
  readability: avg 21.4 words/sentence (bar 20) · longest 47 → L141 · 31 passive

  D-001  error    128  H4 is deeper than Notion supports (max H3) — it degrades to bold text
  D-002  error    204  a hard-wrapped paragraph — one paragraph must be one line
  D-003  warn     141  a 47-word sentence — one idea per sentence, and the bar is 35
  D-005  warn     141  "SoR" is used without being expanded on first use

  A readability signal is a SIGNAL, not a verdict. This never blocks anything.
  It is English-specific and heuristic.
```

That check costs **zero model tokens**, and it always runs first. Its findings
then ride along in the checkers' slices, so no model is ever paid to count
sentences — and no checker repeats something the lint already said.

Then the checkers, each with a line range and nothing else:

```
$ orc doc plan prd-checkout-refund-130826 --role check

  wave 1
    orc-doc-checker-opus-5-low   86L  04-goals + 05-non-goals   lines 119..204
    orc-doc-checker-opus-5-low   83L  06-users + 07-scenarios   lines 205..287
```

---

## 7. What you get, and what it says at the end

```
Saved to  orc/orc-doc/prd-checkout-refund-130826/document.md

Editing it yourself is expected — go ahead. When you want to carry on, even in a
brand-new chat, paste this line:

    /orc-doc resume prd-checkout-refund-130826

The full picture is in that folder's RESUME.md — it remembers the context, the
audience and what is still open, so you never have to explain it twice.

Not staged, not committed. If your team should see it:
    git add orc/orc-doc/prd-checkout-refund-130826/

Want it graded before you send it? In a NEW session:
    /orc-challenge orc/orc-doc/prd-checkout-refund-130826/document.md
```

It offers `/orc-challenge` and never runs it. A session that wrote the document
cannot honestly grade it — that separation is `/orc-challenge`'s own rule, read
from this side.

---

## 8. Coming back on Monday

```
/orc-doc resume prd-checkout
```

```
Picking up: PRD — checkout refunds (started 13-08-2026, cycle 2).
I have read the context you gave me — you do not need to repeat it.

  Document:  487 lines · 17 sections · 14 written · lint GREEN
  You edited since last time: §02 Summary, §08 Requirements
      ← I will not touch these unless you say so
  Still open: §12 Risks (waiting on the fraud limit) · §13 Rollout (not started)

What should change?
```

Two things are happening there.

**It knows you edited it.** Every section carries a fingerprint. Two of them no
longer match what ORC last wrote, so those sections are yours — and a finding
inside one of them is *reported*, never *applied*.

**It does not start working.** No change request means no work. Regenerating a
document nobody asked to change is the most expensive possible way to do
nothing.

---

## 9. Editing one section, safely

```
$ orc doc extract prd-checkout-refund-130826 --section 04-goals
✓ 04-goals extracted to .work/04-goals.md  (lines 119..176, 58 L)

… a writer edits ONLY that file …

$ orc doc splice prd-checkout-refund-130826
✓ 1 section spliced back, bottom-up.
    04-goals    58 → 71 L  (+13)
```

**Bottom-up** is the whole trick: the highest section is replaced first, so an
edit that changes a section's length never shifts a range that has not been
used yet. The model does no line arithmetic at all.

And if you had edited that section in the meantime:

```
❌ these sections changed on disk after they were extracted: Goals and success
   metrics. Nothing was written. Ask before overwriting — a human's wording is
   not recoverable from here.
```

---

## 10. What it will not do

- Read your document into its own context.
- Invent a fact. Anything it was not given becomes a visible `> **Open:**` or
  `> **Assumption:**` line.
- Overwrite a paragraph you wrote.
- Stage or commit anything.
- Grade its own output.

---

## 11. See it in the panel

`orc ui` ▸ **Docs** draws the whole document as one ribbon: each section is a
block sized by its length and coloured by its state. In one glance you can see
where the weight sits, what is still open, and which parts are yours.

Free things are buttons there. Writing and checking cost model tokens, so those
are commands to copy.
