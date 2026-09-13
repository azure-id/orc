<!-- orc-rules:index -->

# ORC RULES — the anti-slop baseline

> **READ-ONLY.** Everything in this folder ships with ORC and changes only with
> `orc update`. Nothing in ORC writes here, and `orc rules set --pack …` is
> refused by name.
>
> Your own rules live in `.claude/orc/rules.md`. Write them with
> `orc rules add --priority P0 --text "…"`, or in `orc ui` ▸ **Rules**.

ORC generates a lot of text and a lot of code. Both come out carrying the same
recognisable defaults: prose that says nothing in a confident shape, and code
that is longer, more defensive and more abstract than the task asked for. These
packs are the filter.

**This is a filter, not a style guide.** It prescribes no voice, no aesthetic
and no architecture. It rejects technique without purpose, and it never invents
direction of its own.

---

## The packs

| Pack | File | Ids | Rules | Layer | Applies to |
|---|---|---|---|---|---|
| **Writing** | `writing.md` | `OSW-01…23` | 23 | `writing` | every word an agent writes |
| **Code** | `code.md` | `OSC-01…22` | 22 | `code` | source an agent writes or edits |
| **Delivery** | `delivery.md` | `OSD-01…10` | 10 | `core` | what an agent reports about its own work |
| **UI** | `ui.md` | `OSU-01…10` | 10 | `ui` | front-end work only, added **per task** |

**65 rules.** `orc rules --json` is the count's only source. Never compute it
here, and never compute it in a skill.

Credits, licences and what was taken from whom: `CREDITS.md`, or
`orc rules credits`.

---

## The three tiers

| Tier | Meaning | On a finding |
|---|---|---|
| **HARD** | Absolute. No exception, no purpose that redeems it. | A finding. |
| **PURPOSE** | The technique is allowed. It needs a written one-line reason. | Missing reason is a finding; the technique is not. |
| **LOCK** | A consistency requirement. | Reported, never blocking. |

The tier system is Miqdad Badjuber's (`miqdadbadjuber/anti-slop`). The mechanism
it exists for: a ban list alone leaves a void, and a model fills a void with its
most generic output. A purpose gate asks for the reason instead, which is the
only thing that separates craft from default.

---

## Precedence — three layers, and the order never changes

```
1.  PROJECT CODE HOUSE RULES        ../phases/house-rules.md + the project's CLAUDE.md P0
    ├ scope: CODE and agent BEHAVIOUR only
    └ beats everything below it, always

2.  USER RULES                      .claude/orc/rules.md    (P0 > P1 > P2)
    └ beats the ORC rules OUTRIGHT on any conflict

3.  ORC RULES                       these packs — read-only
```

**Layer 1 is code-only.** The house card governs how a change is made: surgical,
simple, honest, in-slice. It says nothing about the words an agent writes, so it
never overrules a writing rule — it does not speak about prose at all.

**Layer 2 wins outright over layer 3.** A user rule that contradicts an ORC rule
disables that ORC rule for this project. This is never silent: the agent returns
`rules_overridden[]` naming the ORC id and the user line that replaced it, and
the preflight prints the count. A silent override is the one outcome nobody can
audit.

---

## The boundary

Rules govern **what is written and how it reads**, and **what shape of code is
acceptable**. They can never change how a lane **runs**: the scoring, the wave
order, the gates, the dispatch contract, the ship rules, or any lane's
structural and safety rules.

A rule that asks for one of those comes back as `unsupported_request` and is
relayed as a gap. **Never a guessed compromise.**

**There is no fake validator here.** The CLI cannot parse intent, so it does not
pretend to. It does not detect a user rule that would break a structural rule.
It **declares** the boundary — in `orc rules`, at the top of every dispatched
slice, and in the panel. This is the same decision `orc doc rules` made, and for
the same reason: a validator that sometimes works is worse than none.

---

## What reads these packs

- `orc rules slice --lane <lane>` is the **only** assembler. No skill builds the
  card itself, so no two lanes can drift.
- `../phases/rules.md` is the phase that injects it.
- `orc rules lint` checks the mechanically checkable subset and says, in every
  mode, how many rules it did **not** check.
- `/orc-doc` reads **none** of this. That lane has its own ledger, written with
  `orc doc rules`, and its own frozen-per-document mechanic. The two surfaces
  never mix.
