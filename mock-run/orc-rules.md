# Mock run — `orc rules`

> ORC ships 65 anti-slop rules. Your project writes its own. Yours win.

---

## 1. What it does

ORC writes a lot of prose and a lot of code, and both come out carrying the
same recognisable defaults: sentences that say nothing in a confident shape,
and code that is longer, more defensive and more abstract than the task asked
for. These rules are the filter.

There are two halves, and they never mix.

| Half | Who writes it | Where it lives | Changes when |
|---|---|---|---|
| **ORC rules** | ORC | `.claude/skills/_shared/rules/` | you run `orc update` |
| **Your rules** | you | `.claude/orc/rules.md` | you type |

The ORC rules are **read-only**. They were adapted, with credit, from other
people's work — `orc rules credits` names every source, its author, its licence
and what ORC took from it.

`/orc-doc` uses none of this. That lane has its own rules: `orc doc rules`.

---

## 2. Look at what you have

Rina has just installed ORC in the `acme-api` repo.

```
$ orc rules

orc rules — ORC 65 (W 23 · C 22 · D 10 · U 10) · yours none

  Precedence   the order never changes
   1. house rules  CODE and agent BEHAVIOUR only
      _shared/phases/house-rules.md + the project's CLAUDE.md P0
      beats everything below it, always
   2. your rules   everything
      <claude>/orc/rules.md
      beats the ORC rules OUTRIGHT on any conflict
   3. ORC rules    everything
      <claude>/skills/_shared/rules/
      beats nothing — it is the floor, and yours replaces it

  ORC rules   read-only — `orc update` changes them, nothing else
   OSW   Writing     23  HARD 14 · PURPOSE 2 · LOCK 7
   OSC   Code        22  HARD 17 · PURPOSE 4 · LOCK 1
   OSD   Delivery    10  HARD 7 · PURPOSE 0 · LOCK 3
   OSU   UI          10  HARD 7 · PURPOSE 1 · LOCK 2
   /home/rina/acme-api/.claude/skills/_shared/rules

  Your rules   they win on any conflict
   none yet
   add one:  orc rules add --priority P0 --text "…"
   /home/rina/acme-api/.claude/orc/rules.md
```

**`yours none` is an answer, not a gap.** It says this project has not written
its own rules yet. That is a different fact from the command failing to look,
and the line keeps the two apart.

The three tiers mean:

- **HARD** — absolute. No exception.
- **PURPOSE** — the technique is allowed. It needs a written one-line reason.
- **LOCK** — a consistency rule. Reported, never blocking.

---

## 3. Read one pack

```
$ orc rules show writing

Writing (OSW) — 23 rules  read-only

  OSW-01  HARD    Lead with the point
  OSW-02  HARD    No binary contrast
  OSW-03  HARD    No faux-insight setup
  OSW-04  LOCK    No colon reveal
  OSW-05  HARD    No fake-profound kicker, no summary recap
  …
  OSW-22  HARD    A human's paragraph is not yours to restyle
  OSW-23  HARD    Never invent a specific

  /home/rina/acme-api/.claude/skills/_shared/rules/writing.md
```

---

## 4. Write your own

Rina's team has two standing rules. She types them the way she would say them.

```
$ orc rules add --priority P0 --text "Never name a customer in a commit message or a PR body. Use the account id.
Every public function in src/api/ carries a one-line comment naming its caller."

✓ P0 extended — 2 lines
  ORC 65 (W 23 · C 22 · D 10 · U 10) · yours 2 lines (P0 2)
  /home/rina/acme-api/.claude/orc/rules.md
```

There is **no rule id and no rule count** on your side. The unit is the block,
and the whole block is handed to every agent exactly as you typed it. A rule you
no longer want, you delete.

Three headings, and as much text under each as you want:

- **P0** — must. A run that breaks it is wrong.
- **P1** — should. Break it only with a reason, and the reason is recorded.
- **P2** — prefer. A default when nothing else decides.

You can edit the file in your own editor instead. Or open `orc ui` ▸ **Rules**,
which is one text box and a Save button.

---

## 5. Turn an ORC rule off

ORC caps em dashes (`OSW-13`). Rina's team likes them. She does not argue with
the tool — she writes her own rule and names the id.

```
$ orc rules add --priority P1 --text "OSW-13: em dashes are our house voice. Use them where they read best."

✓ P1 extended — 1 line
  ORC 65 (W 23 · C 22 · D 10 · U 10) · yours 3 lines (P0 2 · P1 1) · 1 override
```

`1 override`. That count is **never silent**: it prints at preflight, it is
listed in the panel, and it is stated inside every slice ORC dispatches.

The count comes from ORC rule ids you **named**. A rule of yours that
contradicts an ORC rule without naming it is found by the agent while it works,
and comes back as a conflict for you to settle — never a choice it makes
quietly. The command says so in its own output.

**Trying to edit ORC's own packs is refused by name:**

```
$ orc rules set --pack writing --priority P0 --text "…"
❌ ORC rules are read-only — they change with `orc update`, never with a command.
   Write your own instead: orc rules add --priority P0 --text "…" (yours win on any conflict).
```

---

## 6. Check a file, for free

```
$ orc rules lint src/checkout.js README.md

orc rules lint — 2 files (paths)

  src/checkout.js
       1  OSC-02 HARD    No decorative separator
          ==========================
          → one plain line, or nothing
       2  OSC-04 HARD    No empty label
          MAIN LOGIC
          → the label names a category, not a fact — delete it
       7  OSC-05 HARD    A TODO names a task
          TODO: improve this
          → name the task and enough context to act on it, or delete it

  README.md
       3  OSW-11 HARD    Banned phrases
          it's worth noting
          → delete the clause and keep the point

  off here  your own rules name these ids
   OSW-13

  checked 12 rules of 65 — not checked here: 53 rules. They need a reader, not a matcher.
```

That last line is the important one. **The lint only checks what a string match
can prove** — banned words, banned phrases, comment shapes, emoji in a heading,
em dash density, a few more. The other 53 rules need a reader.

A clean lint is not a clean review, and the command says so every time, even
when it finds nothing.

It costs nothing and calls no model. It **reports**; it never fixes.

Two things it skips, and it counts both rather than staying quiet: the rule
packs themselves (a rule that bans a word has to print that word to define it),
and any file you mark `orc-rules-ignore-file`. One line you want left alone gets
`orc-rules-ignore` on it.

---

## 7. What a run does with them

Every lane that writes words or code now carries a card in every slice it
dispatches, in this order and no other:

```
1  HOUSE RULES              how a change is made: surgical, simple, honest
2  YOUR PROJECT'S RULES     read first, and they win
3  ORC RULES                the anti-slop baseline
4  the task
```

The house rules are about **code and behaviour**. They say nothing about the
words an agent writes, so they never overrule a writing rule.

At preflight you see one line:

```
rules:    ORC 65 (W 23 · C 22 · D 10 · U 10) · yours 3 lines (P0 2 · P1 1) · 1 override
```

And every agent reports back what it did with them: which rules it acted on,
which two rules disagreed, and which ORC rule your own rule replaced. A conflict
comes back as a gap for you to settle.

---

## 8. Where the rules came from

```
$ orc rules credits
```

Every source, with its licence and what was taken:

- **Peter G. Yang** — [`petergyang/no-ai-slop`](https://github.com/petergyang/no-ai-slop) (MIT)
- **Miqdad Badjuber** — [`miqdadbadjuber/anti-slop`](https://github.com/miqdadbadjuber/anti-slop) (MIT)
- **`@ehmo`** — [`ehmo/slopkit`](https://github.com/ehmo/slopkit)
- **`@BioInfo`** — [`BioInfo/slopless`](https://github.com/BioInfo/slopless)
- **Andrej Karpathy** — his `CLAUDE.md`
- **Matty Cartwright** — The Anti-Slop Writing Rules
- Three research papers on LLM code smells

The long form is `CREDITS.md` beside the packs, and the panel renders the same
table. Credit is a shipped file here, not a line in a commit message.

---

## 9. What it never does

- It never edits ORC's own packs. `orc update` does that, and nothing else.
- It never resolves a conflict for you. A conflict is a gap you settle.
- It never blocks a run. The lint reports; there is no gate.
- It never pretends the lint covered rules it could not check.
- It never guesses that one of your sentences contradicts a rule. It counts the
  ids you named and says that is what it counted.
- It never reaches `/orc-doc`. That lane has `orc doc rules`.
