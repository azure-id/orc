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

## Pointer discipline — the partial-read rules (v1.0.0 W10)

Every pointer a spine adds declares `when` and `read`. `on-phase` is the
default; `always` must be justified in the release's findings; a `read:` names
a HEADING and **never a line number** (`/orc-doc` rule 2 — a stored line number
is a wrong line number one edit later). **Rule of 2.0.0:** every new shared file
is `on-phase` or `on-demand`, never `always`, and a new CLI answer is brief by
default (the full rows only on request). This section is for the
ORCHESTRATOR; an executor or a recon agent reads only `../read-ladder.md`.

### Reading ORC's own payload

The read ladder (`../read-ladder.md`) is about reading the PROJECT. It
applies unchanged to reading ORC's own files, and it has to: a lane manifest of
pointers that every lane dutifully reads whole is MORE round-trips than the prose it replaced, for the
same bytes. Centralizing prose and then reading all of it is a slower payload,
not a smaller one.

So every pointer a lane carries declares three things.

| Declaration | Values | Means |
|---|---|---|
| `when` | `always` · `on-phase` · `on-state` · `on-demand` · `compile-time` | WHETHER to open it at all |
| `read` | `layer` · `section` · `whole` | HOW MUCH to open |
| `layers` | `core` · `full` · `trim` · `composed` | WHICH part, when `read: layer` |

#### The five rules that make it honest

1. **`on-phase` is the default, and `always` must be justified.** A file every
   lane always loads has saved nothing by moving. Each `always` pointer is
   named in the wave that adds it.
2. **`read: section` names a HEADING, never a line number.** A stored line
   number is a wrong line number one edit later; a heading anchor survives an
   edit above it. This is why a shared file's headings are part of its
   contract — renaming one breaks every pointer into it.
3. **A trimmed lane reads `core` plus its OWN layer, and never the `full`
   layer.** Reading a neighbouring layer "for context" is the bleed this rule
   exists to stop: the layer boundary is the product promise, not a suggestion.
4. **The two exceptions of `../read-ladder.md` carry over unchanged.** A file
   you will EDIT is read in full, first, always; and output a gate parses is read whole.
5. **`compile-time` is not a run-time read at all.** `orc-diy` is a declared
   reader of ten shared phases and opens none of them during a run: the `orc
   diy compile` CLI reads their `composed` layer once and stitches it into
   `FLOW-COMPILED.md`, which is the only spine that run then follows. Saying
   `on-phase` there would describe a read that never happens, and a manifest
   that describes a run nobody performs is the drift it exists to prevent
   (v1.0.0 W13).

#### The honest limit

A partial read saves round-trips and bytes for the lanes that SKIP a phase. It
does **not** make a phase cheaper for the lane that runs it — that lane reads
its layers whole. Any claim otherwise has to show the measurement.

### Why the ladder exists

ORC's cost is dominated by parallel reading, not by thinking: up to `max_scouts`
scouts at once, a wiki scan that is expensive by design, and every executor in a
wave opening its declared files. A role that opens a 900-line file to learn one
function's shape has spent the run's budget on bytes nobody needed. Reading more
is not understanding more.

What a lane INVOKES, and what each exit code means, is not in this file: that is
`orc lane calls <lane> --json`, whose catalogue is the one copy of every call
two or more lanes share.

## What is here

| File | id | Layers | Lanes |
|---|---|---|---|
| `trace.md` | `trace` | `core` | every trace-owning lane (28) |
| `preflight.md` | `preflight` | `core`, `full` | the silent-probe lanes (15) |
| `stop-resume.md` | `stop-resume` | `core` | `orc`, `orc-wiki`, `orc-diy` |
| `rules.md` | `rules` | `core` | every lane that writes words or code (28) — **never `orc-doc`** |

`orc lane phases --all --json` is the authoritative list; this table is a
human index of it.
