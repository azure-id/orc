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
| **Each writer** | ONE section file, and nothing else |
| **Each checker** | ONE section file, read from its first line |
| **Nobody** | the whole document |

And the second rule, which is what makes all of that cheap to come back to:

> **The folder is the document. `document.md` is just built from it.**

Each section is its own file in `sections/`. You can open one, change one line,
and see it in a pull request. `document.md` is rebuilt from those files whenever
you ask, and rebuilding costs **nothing at all**.

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
                                      -> sections/01-document-info.md
                                      -> sections/02-summary.md
                                      -> sections/03-problem-and-context.md
                                      -> sections/04-goals-and-success-metrics.md
                                      -> sections/05-non-goals.md
    orc-doc-writer-opus-5-med   180L  06-users + 07-scenarios
                                      -> sections/06-users-and-jobs-to-be-done.md
                                      -> sections/07-scenarios-and-user-stories.md

  2 agents in this wave.
  partial mode: 4 later waves not returned. Read wave 1's files, then ask for the next.
```

Four rules you can see in that output:

- **A section is never split across two agents.** Half a section is half an idea.
- **One file per section.** A slice with five sections writes five files — never
  one file with five sections in it.
- **Two agents at a time, and two is a hard cap.** More writers is more chances
  for the outline to drift.
- **Sections that talk about each other stay together.** Goals and Non-goals are
  in one slice, because keeping them consistent is free and checking it is not.

Each writer owns **one file**. No two agents ever share one.

---

## 5b. Every wave is a place you can stop

At the end of each wave, this is what you see:

```
Wave 1 of 5 done — 7 of 17 sections written.

  orc/orc-doc/prd-checkout-refund-130826/sections/01-document-info.md         22 L
  orc/orc-doc/prd-checkout-refund-130826/sections/02-summary.md               17 L
  orc/orc-doc/prd-checkout-refund-130826/sections/03-problem-and-context.md   77 L
  …

Read them now if you want to redirect — nothing later is bought yet.
See it as one file (free):   orc doc compile prd-checkout-refund-130826 --partial

To carry on — new session, or after your usage limit resets:

    /orc-doc resume prd-checkout-refund-130826

Everything needed is on disk. The next session starts at wave 2 and re-reads
nothing it already wrote.
```

That is the point of writing one wave at a time. If the first wave went the wrong
way, you have paid for one wave. And if your usage limit runs out here, nothing
is lost: the files on disk **are** the progress.

---

## 6. Compile, then the free check, then the paid one

Compiling just joins the section files into one document, in the order you
agreed. It uses no model at all, so you can do it as often as you like.

```
✓ compiled 17 sections → orc/orc-doc/prd-checkout-refund-130826/document.md  (487 lines)

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

Then the checkers, each with one file and nothing else:

```
$ orc doc plan prd-checkout-refund-130826 --role check

  wave 1
    orc-doc-checker-opus-5-low   58L  04-goals-and-success-metrics
                                      reads sections/04-goals-and-success-metrics.md
    orc-doc-checker-opus-5-low   59L  06-users-and-jobs-to-be-done
                                      reads sections/06-users-and-jobs-to-be-done.md
```

Because each checker gets its own file, there is no line counting anywhere in
this step. And no two checkers ever open the same file.

---

## 7. What you get, and what it says at the end

```
Saved to  orc/orc-doc/prd-checkout-refund-130826/sections/   (the real thing)
          orc/orc-doc/prd-checkout-refund-130826/document.md (built from it)

Editing it yourself is expected — go ahead. When you want to carry on, even in a
brand-new chat, paste this line:

    /orc-doc resume prd-checkout-refund-130826

The full picture is in RESUME.md — it remembers the context, the audience and
what is still open, so you never have to explain it twice.

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

  Sections:  17 planned · 14 written · wave 4 of 5
  You edited since last time: §02 Summary, §08 Requirements
      ← I will not touch these unless you say so
  Not written yet: §12 Risks · §13 Rollout
  document.md is 1 section behind the folder — rebuilding it is free.

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

There is nothing to take out and nothing to put back. The section file **is** the
section:

```
… a writer opens sections/04-goals-and-success-metrics.md and changes it …

$ orc doc compile prd-checkout-refund-130826
✓ compiled 17 sections → document.md  (500 lines)
```

A very long section is kept in parts underneath, so even then the writer only
opens the part it needs:

```
sections/08-functional-requirements/
├── 00-head.md          the heading and the opening lines
├── 01-payments.md
└── 02-refunds.md       ← only this one is opened
```

The reader never sees any of that. In the finished document it is one ordinary
section with one heading.

If you had edited a section yourself in the meantime, ORC says so by name and
leaves it alone. And it will not hand you a `document.md` that is behind the
folder:

```
❌ document.md is behind sections/: Goals and success metrics changed since the
   last compile. Rebuild it first (free): orc doc compile prd-checkout-refund-130826
```

---

## 10. What it will not do

- Read your document into its own context.
- Invent a fact. Anything it was not given comes back as a **gap**, is written
  into `gaps.md`, and is raised with you.
- Put its own notes in your document. No "Open:" lines, no "Assumption:" lines —
  nothing but what a reader came for, in `document.md` and in every section file.
- Leave a hole where a section should be. A part-written document simply does not
  have that section, and says so plainly outside the document.
- Overwrite a paragraph you wrote.
- Stage or commit anything.
- Grade its own output.

---

## 11. See it in the panel

`orc ui` ▸ **Docs** draws the whole document as one ribbon: each section is a
block sized by its length and coloured by its state. In one glance you can see
where the weight sits, what is still open, and which parts are yours. Under it,
the **section files** — one row each, with the parts of a long section nested
beneath it, and how far through the waves you are.

Free things are buttons there. Writing and checking cost model tokens, so those
are commands to copy.

---

## 12. Finishing it — the part that used to be missing

A document could be *complete* and there was no way to say it had actually been
**delivered**. So a PRD that went to a backend team in March looked exactly like
one that had been sitting finished-and-forgotten ever since.

```
$ orc doc ship prd-checkout-refund-130826 --where "Notion › Platform › Refund PRD" --note "handed to the ingest squad"

  ORC · doc ship — prd-checkout-refund-130826
  ───────────────────────────────────────────

  Shipped 16-08-2026 09:41:02 → Notion › Platform › Refund PRD
  Note: handed to the ingest squad

  17 section hashes recorded. If any of them changes, this reads shipped-drifted —
  which names the sections that moved, so you know exactly what a re-send would change.
```

**`--where` has no default.** Shipped with nowhere to point at is not a fact, it
is a feeling. ORC will not guess one and will not ship without one.

Change one paragraph afterwards and the state changes with it:

```
$ orc doc status prd-checkout-refund-130826

  shipped-drifted
  Where it stands:  /orc-doc · PRD · cycle 3 · 17 of 17 sections written · shipped 16-08-2026 → Notion › Platform › Refund PRD (drifted: 1 section)

  Changed since it shipped: Goals and success metrics
```

It names the section. A whole-file "something changed" would not tell you what
to re-send.

---

## 13. What did I ask for, again?

Come back three weeks later and you do not need to know what state the document
is in. You need **your own memory back**.

```
$ orc doc journal prd-checkout-refund-130826

  ORC · doc journal — prd-checkout-refund-130826
  ─────────────────────────────────────────────

  8 entries, 4 in your own words. Oldest first.

  • 13-08-2026 09:02:11  request   write the refund PRD for checkout, and do not invent an SLA
  · 13-08-2026 09:14:02  write cycle
  • 13-08-2026 09:40:55  decision  partial refunds are out of scope for v1
  · 13-08-2026 10:11:30  check cycle
  ~ —                    you edited
  • 14-08-2026 08:20:03  request   the goals section reads like marketing — make it measurable
  · 14-08-2026 08:44:19  edit cycle   · no request was recorded for it
  • 15-08-2026 17:05:00  note      waiting on legal before the rollout section

  1 cycle ran with nothing recorded. Shown as a gap on purpose — a reconstruction would read like a fact.
```

That last line is the rule. A cycle nobody logged is shown **as a gap**, never
filled in with something that sounds plausible. And `orc doc context` gives you
the brief you froze on day one — your request, quoted word for word — plus
whether each reference file you pointed at still says what it said then.

---

## 14. Which command comes next

You never have to remember.

```
$ orc doc next prd-checkout-refund-130826

  ORC · doc next — prd-checkout-refund-130826
  ───────────────────────────────────────────

  D7   lint
  3 sections changed since the last compile; the free check runs before the paid one

  free  orc doc lint prd-checkout-refund-130826 --json
```

Do what it says, then run it again. When it stops giving you a command, it tells
you what **you** have to decide — by name, never as a shrug.
