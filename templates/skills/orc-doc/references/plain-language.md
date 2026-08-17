# Writing a human can actually read (P0)

Both the writer and the checker are held to this. The free half is measured by
`orc doc lint`; the rest is what the checker grades each section for.

## The rules

1. **Write for the audience named in D4**, not for the model that wrote it.
2. **One idea per sentence.** Average ≤ 20 words. Any sentence over 35 words is
   a lint finding, with its line number.
3. **Common words beat precise-sounding ones.** *use* not *utilise*, *start* not
   *initiate*, *about* not *regarding*, *use* not *leverage*, *before* not
   *prior to*.
4. **Every acronym is expanded on first use** — "service level objective (SLO)".
   The lint catches unexpanded ones by scanning for capitalised runs, and it
   already knows the ones every technical reader has.
5. **Active voice.** "The service retries the call", not "the call is retried" —
   the passive hides who does it, and in a runbook that is the whole point of
   the sentence.
6. **No unexplained internal jargon.** A term the D4 audience would not know is
   either replaced or defined in the glossary. The checker flags it either way.
7. **Facts go in tables**, not in a paragraph listing six things.
8. **Say the thing first.** Each section opens with its conclusion; the
   reasoning follows.
9. **Never invent a fact.** What is not in `context.md` or `context-sources.md`
   is **not written at all** — it comes back as a gap and is raised with the
   user. The deliverable carries content only, so it never carries ORC's own
   uncertainty markers. Filler that reads like a fact is the worst possible
   output of this lane; a `> **Open:**` line left in the reader's document is
   the second worst.
10. **Non-English output is held to the same bar in that language** — short
    sentences, common words, acronyms expanded. Technical terms with no natural
    translation stay in English and are glossed once.

## Why the checker is `low` effort — deliberately

`orc-doc-checker-opus-5-low` reads a short range and answers a bounded question:
*does this text do what its section is for, in words this audience knows,
without inventing anything?*

Low effort is the **right instrument** for that, not a cost compromise. A
harder-thinking checker reasons its way past a gap a real reader would trip on —
the same reasoning that pins `/orc-challenge`'s cold reader at `low`. **Nothing
may "upgrade" it later.**

## What the lint measures, and what it does not

| Free (`orc doc lint`) | Judgment (the checker) |
|---|---|
| average sentence length, and the longest one with its line | whether the section does what its purpose says |
| long-word ratio | whether the declared audience can act on it |
| acronyms used without being expanded | whether a term needs the glossary |
| passive constructions (a pattern match) | whether a sentence hides its actor in a way that matters |
| leftover `TODO` / `TBD` / `???` | whether something is asserted that nothing supports |

**Free checks run before paid ones. Always.** The lint's findings ride in the
checker's slice, so no model ever spends a token counting sentences — and the
checker never re-reports one.

## Two honesty rules the lint prints about itself

1. **A readability signal is a SIGNAL, not a verdict.** A long sentence is not
   automatically a defect. It never blocks anything.
2. **It is English-specific and heuristic.** Passive-voice detection is a
   pattern match and a syllable count is an estimate. It says so, once, on its
   own output.
