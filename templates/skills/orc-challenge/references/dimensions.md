# The seven dimensions

Selected per cycle (`--dimensions D1,D2,D4,D5`). A README does not need D2.

**A deselected dimension is `NOT-SELECTED`; a selected dimension that could not
run is `NOT-CHECKED` WITH ITS REASON.** Two different words on purpose, and hard
rule 6 forbids either being silent: a silently skipped check is indistinguishable
from a forgotten one.

| ID | Dimension | Produced by | Blocking by default |
|---|---|---|---|
| `D1` | Template conformance | lint (structure) + judge (substance) | yes |
| `D2` | Technical completeness | judge (grounded) + contrarian + council executor | yes |
| `D3` | Internal consistency | lint (links/anchors) + judge | yes |
| `D4` | Cold comprehension | **reader (the score)** + outsider (load-bearing assumptions) | yes |
| `D5` | Plain English for non-native readers | lint (metrics) + reader (judgment) + outsider | yes |
| `D6` | Actionability | lint (markers) + judge + council executor | yes |
| `D7` | Scope discipline | judge | advisory |

**D4 stays the reader's score.** The outsider feeds D4 only where an assumption
is load-bearing, and it returns **no score of its own** — a second comprehension
number would leave a user asking which one is real. The seam between the two is
in `council.md`, and it is structural, not stylistic.

The two non-finding lenses feed **no dimension at all.** An `opportunity` and a
`premise` never enter `findings[]` and never touch the pass gate, so they can
never move a dimension's status.

---

## D1 — Template conformance

Every required section present, in the template's order, none invented, none
empty ceremony.

**Evidence a finding must carry:** the section name, and either its absence, its
position, or the word count under it. `orc challenge lint --template` already
computes all four — the judge grades the SUBSTANCE (is the section actually doing
its job) and never re-counts.

With `--no-template`, D1 is `NOT-CHECKED — no template supplied`, in the verdict,
in every report, and as a chip in the panel.

## D2 — Technical completeness

**For the document's own declared scope**, does the low-level design actually
exist? Every claim anchored to a real file, or explicitly marked `ASSUMPTION`.

**Evidence:** a `file:line` anchor that resolves, or the absence of one where the
document asserts something about the code. This is the ONLY dimension no computer
can reach, and it is where the judge should spend its effort.

**`/orc-boundary` seam:** an area whose boundary card says `REFUSE` should not be
judged for automation-friendly detail — the point of a REFUSE is that a human
decides there. Note it and move on; do not raise a D2 finding demanding a
step-by-step an agent could follow.

## D3 — Internal consistency

No self-contradiction. Names, ids, versions and units used the same way
throughout. Every referenced artifact exists.

**Evidence:** the two places that disagree, both quoted. A single quote is an
opinion; two quotes are a contradiction.

## D4 — Cold comprehension

A reader with NO prior context can answer the artifact's own questions from the
artifact alone.

**This is why the reader agent exists, and why it is `low` effort.** To judge
"can a reader without context follow this?" the reader must BE without context.
The grounded judge has read the repository — it can no longer simulate ignorance
and it will unconsciously fill every gap the document leaves.

**A stronger, harder-thinking reader is a WORSE instrument.** Low effort does not
reason around a gap: it reports what the document actually says rather than what
a determined reader could reconstruct. That is precisely the measurement.

**Evidence:** the scored questionnaire, and per finding, the LINE THAT OWED THE
ANSWER — not the place the reader noticed it was missing.

## D5 — Plain English for non-native readers

Measured, not felt. `orc challenge lint` computes: acronyms used before they are
defined, sentences over 25 words (with a p50/p90 distribution), a passive-voice
percentage, idioms and phrasal verbs from `plain-english.md`, ambiguous
quantifiers, and a Flesch–Kincaid grade estimate.

**Evidence:** the metric AND the cost to the stated audience. A long sentence is
not automatically a defect — the lint is a signal, the judge decides. A D5
finding on an audience of "staff engineers, all native speakers" needs to justify
itself.

## D6 — Actionability

An implementer can build from it without asking a question. Every `TBD`, `etc.`,
`as needed`, `and so on` is a finding, and so is every ambiguous quantifier
(`some`, `several`, `appropriate`, `reasonable`, `quickly`, `robust`).

**Evidence:** the marker, quoted, plus the DECISION it is standing in for.
"§4.2 says the retry budget is `TBD`" is a finding; "§4.2 could be clearer" is
not.

## D7 — Scope discipline (advisory by default)

The artifact stays inside its own declared scope and does not quietly annex an
adjacent one.

**Evidence:** the `out_of_scope` entry from `goals.md` that the artifact crossed,
plus the line that crossed it. **Without a declared `out_of_scope`, every D7
finding is a guess** — which is why intake asks for it once and accepts
"nothing".

---

## The enum

`D1 D2 D3 D4 D5 D6 D7`. Mirrored in `bin/cli.js`'s `CHALLENGE_DIMS` and its
`--dimensions` validator — documented drift the token lint cannot see, covered by
a golden test instead. Change both together.
