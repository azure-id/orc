# Phase — Rules   (id: `rules`)

> **Library file.** New at v1.7.0 W5. Layers declared: `core` only — single-layer
> for the same reason `house-rules.md` is: it is a standing card injected
> VERBATIM into a slice, and a layered card would be a different card. What
> varies between lanes is DATA (which packs, whether a task is front-end), not
> prose. `orc lane phases <lane> --json` names the file and the layers to read.
>
> **What is NOT here:** the rules. They are `../rules/` — four packs, read-only,
> shipped. This file is the SHAPE: who assembles the card, where it sits in a
> slice, what comes back, and what the phase must never do.
>
> **`/orc-doc` does not run this phase.** That lane has its own ledger
> (`orc doc rules`) and its own frozen-per-document mechanic. Excluded means
> excluded, and `orc rules slice --lane orc-doc` refuses by name.

<!-- orc:layer core -->

## One assembler, and it is not you

```
orc rules slice --lane <lane> [--pack ui] [--json]
```

That command is the **only** thing that builds this card. A lane never
concatenates the packs itself, never re-orders them, never summarises a rule and
never drops one it judges irrelevant.

Two reasons, and both have cost this repo money elsewhere:

1. **Drift.** A card assembled in twenty-eight spines is twenty-eight ideas of
   the precedence order. The same argument as `orc lane phases`: *a second idea
   of the pipeline is the drift this exists to make impossible.*
2. **Cost.** This card rides on **every spawn**. One assembler is the only place
   its token weight can be measured, and therefore the only place it can be cut.

Print the command's `line` VERBATIM at preflight. Never compute it:

```
rules:    ORC 65 (W 23 · C 22 · D 10 · U 10) · yours 9 lines (P0 4 · P1 2 · P2 3) · 1 override
rules:    ORC 65 (W 23 · C 22 · D 10 · U 10) · yours none
```

**Both spellings are mandatory in their state.** `yours none` is an ANSWER — it
says the project has not written its own rules, which is a different fact from
the CLI failing to look.

## Where it sits in a slice — the order IS the contract

```
1  HOUSE RULES              ./house-rules.md, injected verbatim
2  YOUR PROJECT'S RULES     from the slice, P0 then P1 then P2, verbatim
3  ORC RULES                from the slice, the packs this lane carries
4  the task                 the lane's own dispatch contract
```

Nothing goes above 1. Nothing goes between 2 and 3. The assembler emits 2 and 3
as one block in that order, so the lane's job is to place that block directly
under the house card and before the task.

## Precedence, and the one sentence that gets it wrong

```
house rules  >  your rules  >  ORC rules
```

**The house card is CODE and BEHAVIOUR only.** It governs how a change is made:
surgical, simple, honest, in-slice. It says nothing about the words an agent
writes, so it never overrules a writing rule — *it does not speak about prose at
all.* A lane that presents the house card as beating `OSW-*` has misread it.

**A project rule beats an ORC rule outright.** Not a waiver and not a
negotiation: the ORC rule is removed from the slice, and the removal is stated
inside it. The assembler does that. The lane does not decide it.

Where a lane's preflight prints a report rather than a bare line, the report
**names** each override. An override the user cannot see is an override they
cannot audit.

## The `ui` pack rides per TASK, never per lane

`ui` is in no lane's default set. Add it to a single slice, at dispatch time:

> If a task's **declared files** are front-end — `.css`, `.scss`, `.html`,
> `.jsx`, `.tsx`, `.vue`, `.svelte`, or a directory the wiki or the cached
> pattern identifies as the UI layer — assemble that task's card with
> `--pack ui`. Otherwise do not.

A UI rule in a backend slice is tokens paid on every spawn for a rule that
cannot apply. A lane that dispatches no tasks never passes `--pack ui` at all.

## What comes back

Every return from a slice that carried this card gains three fields
(`../return-validation.md`):

| Field | What it holds |
|---|---|
| `rules_applied[]` | the ids the agent acted on |
| `rules_conflicts[]` | two rules that disagree. **A gap, never a silent choice** |
| `rules_overridden[]` | an ORC id a project rule replaced |

A `rules_conflicts[]` entry is relayed to the user as a gap through the lane's
own gap channel. Resolving it quietly is the failure the field exists to prevent.

## The boundary — declared, never validated

Rules govern **what is written and how it reads**, and **what shape of code is
acceptable**. They can never change how a lane **runs**: the scoring, the wave
order, the gates, the dispatch contract, the ship rules, or any lane's
structural and safety rules.

A rule that asks for one of those comes back as `unsupported_request` and is
relayed as a gap. **Never a guessed compromise.**

**Do not build a detector for this.** The CLI declares the boundary and does not
pretend to enforce it, for the reason `orc doc rules` already settled: a
validator that sometimes works is worse than none, because a clean pass then
means nothing. The agent is the only reader that can tell a content rule from a
structural one, so the agent is where the answer comes from.

## The free lint

```
orc rules lint <path…|--staged|--diff> [--pack w,c,d,u] [--json]
```

Deterministic, zero tokens. Exit `0` clean · `1` findings · `2` nothing to lint.

It checks only the rules a string match can prove, and it prints — in every
mode — how many it did not check. **Relay that coverage line whenever you relay
a lint result.** A clean exit allowed to stand in for a review nobody did is the
whole failure that line prevents.

Findings are ADVISORY. This phase adds no gate: a style preference that fails a
build gets switched off within a week, and then nothing is enforced at all.

An exemption is never silent either. The lint skips the rules packs themselves
(a rule that bans a word has to print that word to define it) and any file
marked `orc-rules-ignore-file`, and it reports the count of both.

## Cost, and where to cut it

Measured at v1.7.0: roughly **3 600 tokens** per build-lane slice, **4 300** with
the UI pack, **2 200** for a prose-only lane. The card already carries HARD rules
in full and PURPOSE/LOCK rules as one line plus the file to open when one
applies.

If it must come down, the lever is the worked examples inside the HARD bodies,
and the only place to pull it is `rulesSlice()` in `bin/cli.js`. **Never by a
lane deciding to trim its own card** — that is the drift this phase exists to
prevent, arriving disguised as a saving.

<!-- /orc:layer -->
