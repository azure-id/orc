---
description: Change something small yourself — screen text, content, a safe setting — with the check and the undo shown first
---

Use the **orc-handoff** skill. It is written in simple English on purpose.

You want to change something small, and you should not have to ask an engineer for
it: the words on a page, a title, a label, a document, a setting with a safe list of
values, a feature switch.

You do not need to read code. You need two things before you change anything: **will
something catch my mistake**, and **how do I undo it**. This lane always tells you
both, before it edits.

**The grade does not come from the file type. It comes from whether a cheap check
exists.** A settings file with a validator is green; the same file with no validator
is amber. That is what makes this a real rule and not a feeling.

- 🟢 **GREEN** — change it. A check runs after, and it will catch a mistake.
- 🟡 **AMBER** — change it. But the check is a person, not a program, and here it is.
- 🔴 **RED** — this looks like content. It is not. ORC will not touch it, and it says
  who to ask.

Two modes:

**MAP** — find every file a non-engineer can own, grade each one, and record the
exact check and the exact undo command for each. Written to
`orc-handoff/surfaces.md`.

**DO** — change one value:

1. It finds the file and shows the value as it is now.
2. **One confirmation message**: this is the file, this is the check I will run, this
   is the command that undoes it. You say yes.
3. It changes one value, through `orc handoff set` — the same single writer the
   browser panel uses, so there is only ever one set of rules.
4. It runs the file's own check and tells you what happened in plain words.
5. It writes a numbered entry to `orc-handoff/<slug>/handoff-log.md` so you can find
   it again later.

Things it never does: touch a red file · commit or stage anything (it prints the git
command) · create a new setting that did not exist · call an amber change "verified"
when only a person can verify it · change a grade to make an edit possible.

If the job turns out to be bigger than one value, it **offers** `/orc-quick`. An
offer, never a redirect.

Set `handoff_write` to `false` and this becomes map-only — no writes at all.

Read the map back any time: `orc handoff surfaces`.

What you want to change (or nothing, and it will ask): $ARGUMENTS
