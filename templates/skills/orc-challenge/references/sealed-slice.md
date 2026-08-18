# The sealed slice

The single most important sentence in this lane:

> **the judge slice is SEALED** — its dispatch payload contains PATHS and IDs. It
> never contains prose written in this session.

**A fix is a claim; a verdict is evidence.** The moment the judge is handed a
summary of what changed, it is grading the summary. And the moment the session
that wrote the fix also writes the slice, the summary is written by the party
with an interest in passing.

## The permitted field list — complete

```
goals:         orc/orc-challenge/tsd-payments/goals.md          (frozen, v1)
artifact:      docs/tsd-payments.md
template:      orc/orc-challenge/tsd-payments/template.md       (frozen, v1)
dimensions:    <skill>/references/dimensions.md   (selected: D1 D2 D3 D4 D5 D6)
lint:          orc/orc-challenge/tsd-payments/iteration-02/lint.json
reader:        orc/orc-challenge/tsd-payments/iteration-02/council/reader.md
contrarian:    orc/orc-challenge/tsd-payments/iteration-02/council/contrarian.md
outsider:      orc/orc-challenge/tsd-payments/iteration-02/council/outsider.md
executor:      orc/orc-challenge/tsd-payments/iteration-02/council/executor.md
carry_ids:     F-003 F-007 C-002
rebuttal_ids:  F-007
```

Every value is either a PATH or an ID. Nothing else may appear.

One row per **finding** lens on the roster, and no more. A council report is a
path to a file an *agent* wrote, so it does not breach the rule: the line this
rule actually draws is *"a summary written by the party with an interest in
passing"*, and no council member has one.

`goals.md` is a path, not prose — which is exactly why the goal is frozen to disk
at intake instead of being retyped into each dispatch. Every iteration's judge
reads the identical goal from the identical file, forever.

## The two reports that may NEVER appear

**`council/principles.md` and `council/expansionist.md` are forbidden in the
judge's slice.** Handing a judge a document arguing that the frozen goal is wrong
biases every finding it produces afterwards, and an opportunity is not a defect
at all. **The three finding lenses feed the judge; the two non-finding lenses
feed the user** — see `council.md`.

## What may NOT appear

- what changed since last time
- the diff, or `orc challenge diff`'s output
- the fix brief
- the previous `advice.md`
- the finding BODIES
- any sentence beginning "the user says", "they fixed", "this should now be"
- a severity suggestion, a hint about what to look at, or an expected outcome

**The judge opens `iteration-01/verdict.md` itself if it wants the carried
bodies.** Reading them from disk is fine; being handed a summary of them is not,
because a summary is where the bias enters.

## The reader's slice is even tighter

`orc-challenge-reader-opus-5-low` gets the artifact path(s), the questionnaire
protocol, and **the `audience` line only**, lifted from `goals.md`.

*Why the audience but not the goal:* "a reader without context" is meaningless
until you say WHICH reader — a staff engineer and a non-native junior are
different instruments. But telling the reader what the document is *trying to
achieve* hands it the answers it is supposed to have to find, and D4 measures
exactly the gap between the two.

Its tools are `Read` and nothing else. Not `Glob`, not `Grep`, not `Bash`. **The
instrument is defined by what it cannot reach.**

## The outsider's slice is the tightest in the lane

`orc-challenge-outsider-opus-5-low` gets **the artifact path(s) and its protocol.
Nothing else.** Not the goal, not the audience, not the kind, not the template,
not the repository. Its tools are `Read` and nothing else.

Tighter than the reader, which at least knows who it is reading as. The outsider
is not told, because the moment it can look anything up it stops being able to
measure what a stranger cannot find out.

## The advisor's slice is the loose one, on purpose

`orc-challenge-advisor-opus-5-med` gets `goals.md`, the verdict's findings, the
council reports, the artifact and the repository. It needs the goal because ORDERING a fix is a goal
question: which repair unblocks the most of what the user actually wants. It is
dispatched only on a FAIL, and it never writes prose for the artifact.

## Testable

`test/payload.test.js` greps this file and `../SKILL.md` for the sealed-slice
token and asserts the C4 dispatch block lists only path-shaped and ID-shaped
fields.
