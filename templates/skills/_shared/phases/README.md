# `_shared/phases/` — one copy of a phase, and a manifest per lane

This directory is NOT a skill and NOT a lane. It holds the single canonical copy
of a phase that **two or more lanes run**. A lane's spine keeps its identity, its
trigger, its own hard rules and its own phases — and for a shared phase it keeps
only a POINTER plus that lane's own deltas.

**The CLI owns the pipeline, not the prose.** `orc lane phases <lane> [--json]`
is the manifest: the ordered phase list, the file each phase lives in, the layers
that lane reads, the catalogued calls it makes, and when to read it. A skill
never derives the phase list or its order from these filenames — the same rule
the Flow stepper follows, for the same reason: *a second idea of the pipeline is
the drift this exists to make impossible.*

## What belongs here — the rule is mechanical

> A file under `templates/skills/<lane>/` that a file in a DIFFERENT lane already
> points at belongs here. **A file with exactly one consumer stays home.**

That is auditable by grep, which is what makes it a lint rather than an opinion.
`bin/verify-contracts.js` asserts both halves: nothing under a lane folder may be
pointed at from another lane, and every file here must be claimed by **≥2 lanes**.

Centralizing a one-consumer file is centralizing for its own sake, and it costs a
lane its own wording for nothing.

## The layer set is CLOSED

A phase file may be cut into layers with the same marker grammar `orc diy
compile` already parses (`<!-- diy:when key=value -->`):

```markdown
<!-- orc:layer core -->
Every lane that runs this phase does this. Never optional.
<!-- /orc:layer -->

<!-- orc:layer trim -->
orc-mini / orc-fast: ONE executor, no waves. This is a REDUCTION and it is
deliberate — do not read the `full` layer here.
<!-- /orc:layer -->
```

| Layer | Read by | Meaning |
|---|---|---|
| `core` | every lane running this phase | the invariant. Never optional |
| `full` | `/orc`, `/orc-ultra` | the complete procedure |
| `trim` | `orc-mini`, `orc-fast` | an explicit REDUCTION, stated as one |
| `composed` | `orc-diy` | what `orc diy compile` stitches |

**Four names, closed. A fifth layer is a lint failure, not a feature** — free
markers are drift with extra steps. A lane reads `core` plus at most one other
layer, and `orc lane phases` tells it which.

**Why the set exists at all:** the single biggest way this library breaks ORC is
`orc-mini` reading a shared `review.md` written for the full lane and starting to
do a full code review. Mini's product promise is that it *skips* review.
Centralizing without layers does not just cost tokens — it changes behaviour. So
**a `trim` layer must say what it drops and that dropping it is deliberate.**

**A single-layer file is a legitimate answer.** `trace.md` and `stop-resume.md`
declare `core` only: their procedure really is identical in every lane that runs
them, and what varies is DATA (the tier table, the lane token), not prose. Cutting
them into layers to look symmetrical would be inventing structure the phase does
not have.

## Pointer discipline

Every pointer a spine adds declares `when` and `read` — the partial-read rules in
`../read-ladder.md`. `on-phase` is the default; `always` must be justified in the
release's findings; a `read:` names a HEADING and **never a line number**
(`/orc-doc` rule 2 — a stored line number is a wrong line number one edit later).

## What is here

| File | id | Layers | Lanes |
|---|---|---|---|
| `trace.md` | `trace` | `core` | every trace-owning lane (28) |
| `preflight.md` | `preflight` | `core`, `full` | the silent-probe lanes (15) |
| `stop-resume.md` | `stop-resume` | `core` | `orc`, `orc-wiki`, `orc-diy` |

`orc lane phases --all --json` is the authoritative list; this table is a
human index of it.
