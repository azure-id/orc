---
description: The anti-slop rules — ORC's shipped packs (read-only) and this project's own, which win on any conflict
---

Do not use a skill. This command is a **CLI surface**, and the CLI is the only
thing that reads or writes either half.

## What this is

Two rule sets, and they never mix:

- **ORC rules** — 65 shipped rules in four packs, tagged `ORC RULE`, **read-only**.
  They change with `orc update` and with nothing else. Adapted, with credit, from
  `petergyang/no-ai-slop`, `miqdadbadjuber/anti-slop`, `ehmo/slopkit`,
  `BioInfo/slopless`, Andrej Karpathy's `CLAUDE.md` and Matty Cartwright's
  anti-slop writing rules. `orc rules credits` names every one.
- **Your rules** — a plain text file, `.claude/orc/rules.md`, three headings
  (P0, P1, P2) and as much text under each as you want. **They beat an ORC rule
  outright** wherever the two disagree.

Above both sits the project's CODE house rules, which govern how a change is
made and say nothing about the words an agent writes.

```
house rules  >  your rules  >  ORC rules
```

`/orc-doc` reads none of this. That lane has its own ledger: `orc doc rules`.

## Run this

```
orc rules                                   both halves, the ladder, the counts
orc rules packs                             the four packs (read-only)
orc rules show writing|code|delivery|ui     one pack, rule by rule
orc rules credits                           every source, author and licence
orc rules user                              your own ledger and where it lives

orc rules add   --priority P0 --text "…"    append a rule, as many lines as you like
orc rules set   --priority P1 --text "…"    replace that whole block
orc rules clear --priority P2               empty one block
orc rules --reset                           back to the bare template

orc rules lint <path> | --staged | --diff   the FREE check, zero tokens
```

`orc ui` ▸ **Rules** is the same thing with a text box and a Save button.

## Then report, in this order

1. `orc rules` — print its output. The precedence ladder is the part people get
   wrong, so it goes first and is never summarised away.
2. If the user asked to ADD a rule, run the `add` command with their words
   **verbatim**. Never re-word a standing instruction into your own phrasing:
   the whole block is handed to every agent exactly as typed.
3. If they asked to turn an ORC rule OFF, tell them how: name its id in a rule
   of their own (`OSW-13: em dashes are our house voice.`). The override is then
   counted, printed at preflight, and stated inside every slice.
4. If they asked whether something IS slop, run `orc rules lint` on it and relay
   the coverage line it prints — the one that says how many rules it did not
   check. A clean lint is not a clean review, and that line is the difference.

Never edit `.claude/orc/rules.md` with a file tool. `orc rules` is its only
writer, and the panel goes through the same command.

What about the rules: $ARGUMENTS
