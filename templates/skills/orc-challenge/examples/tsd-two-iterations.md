# Example — a TSD, fail → fix → pass

> The annotated maintainer's walkthrough. Every gate that fires is called out.
> For the reader-facing version see `mock-run/orc-challenge.md`.

## Session 1 — C1 intake, and the refusal that proves rule 0

```
> /orc-challenge docs/tsd-payments.md
```

```
Before I can judge this, I need to know what "good" means for it.
Six questions, one round:

1  What must this document achieve?
2  Who reads it, and what do they already know?
3  What would you accept as finished?
4  Do you have a template it should follow?
5  Anything deliberately OUT of scope?
6  When you fix it, where will the fixed version go?
```

The user answers: *"just tell me if it's good"*.

```
That is not enough for me to judge it, and guessing would be worse than useless:
every finding I raised would be defensible, and you would spend three iterations
fixing things that did not matter.

Concretely — which of these is closest?

  a  a backend team must implement it without asking me anything
  b  it has to survive Tuesday's architecture review board
  c  our offshore team, several non-native English readers, must read it cold
  d  I just want to know if I forgot anything obvious
  e  your own words
```

**The gate:** ORC did not proceed, and it did not pick `d` as a safe default.
`orc challenge init` would have refused anyway — `--goal` has no default value.

User picks (a), audience "backend engineers, 2 of 5 non-native English readers",
done means "no open interface question and no TBD in §3–§7", pastes the team's
TSD template, out of scope "the mobile client", revision `docs/tsd-payments-v{n}.md`.

```bash
orc challenge init tsd-payments \
  --artifact docs/tsd-payments.md --kind tsd \
  --goal "a backend team implements this without asking me anything" \
  --audience "backend engineers, 2 of 5 non-native English readers" \
  --done-means "no open interface question and no TBD in §3–§7" \
  --out-of-scope "the mobile client" \
  --template docs/templates/tsd.md \
  --dimensions D1,D2,D3,D4,D5,D6 \
  --revision new-file --revision-pattern "docs/tsd-payments-v{n}.md"
```

`goals.md` and `template.md` are now FROZEN at v1.

## C2 — lint (free)

```bash
orc challenge lint docs/tsd-payments.md \
  --template orc/orc-challenge/tsd-payments/template.md --json \
  > orc/orc-challenge/tsd-payments/iteration-01/lint.json
```

```
  13 findings · 5 sentences · p50 8w / p90 43w · passive 40% · grade 8.1
  template: 4/5 required sections present, missing 1
```

Zero model tokens. The judge will never re-count any of this.

## C3 — the cold read

DISPATCH `orc-challenge-reader-opus-5-low`. Its slice is the artifact path, the
questionnaire protocol, and the audience line. **Not the goal** — telling the
reader what the document is trying to achieve hands it the answers.

```yaml
questions_asked: 12
answered_from_artifact: 8
answered_by_guessing: 3
unanswerable: 1
comprehension_score: "8/12"
terms_undefined_on_first_use: ["idempotency window", "SoR", "cutover"]
```

## C4 — the judge, with the SEALED slice

```
goals:         orc/orc-challenge/tsd-payments/goals.md          (frozen, v1)
artifact:      docs/tsd-payments.md
template:      orc/orc-challenge/tsd-payments/template.md       (frozen, v1)
dimensions:    <skill>/references/dimensions.md   (selected: D1 D2 D3 D4 D5 D6)
lint:          orc/orc-challenge/tsd-payments/iteration-01/lint.json
reader:        orc/orc-challenge/tsd-payments/iteration-01/reader-report.md
carry_ids:     (none — first iteration)
rebuttal_ids:  (none)
```

Paths and ids. Nothing else. No conversation, no diff, no "the user says".

## C5 — record, and one finding gets DROPPED

```
  iteration 1: FAIL — 4 blocking findings, coverage 100%
  1 finding dropped for having no `serves` (out of scope of the stated goal).
  CHALLENGE iter=1 findings=P0:1/P1:3/P2:1 coverage=100% verdict=FAIL
```

The dropped one was *"no mention of the mobile client"* — which the user
explicitly declared out of scope. **Rule 0, made structural:** the judge did not
have to be trusted to remember, and the CLI did not have to guess.

## C6 → C8 — advise, then STOP

The advisor groups 5 findings into 2 causes and orders them. ORC writes
`fix-brief-01.md`, `RESUME.md`, re-derives `CHALLENGE.md`, dispatches the
iteration's trace packet, prints the paste block, and **ends the turn**. It does
not ask whether you would like it to fix anything.

## Session 2 — the fix session

A DIFFERENT session. It reads the brief, reads `goals.md`, edits
`docs/tsd-payments-v2.md`, and stops. It runs no ORC command except one:

```bash
orc challenge rebut tsd-payments F-004 "the phrasal verbs are quoted from JIRA-4412"
```

**This session never runs `/orc-challenge`.** That is the beat that teaches the
contract.

## Session 3 — the re-judge

```
> /orc-challenge tsd-payments
```

```
expected revision:  docs/tsd-payments-v2.md   FOUND   (6fd76797 → f475e8e4, +24 −0)
carried findings:   5   ·  5 touched  ·  0 untouched

  touched/untouched is a hint for you. The judge re-reads the artifact either way.
```

The judge answers the rebuttal (`withdrawn` — "agreed, it is a quotation") and
gives every carried finding an outcome.

**What happens if it forgets one:**

```
❌ malformed verdict — coverage is 20% — every finding carried in must get
   exactly ONE outcome. Missing: F-002, F-003, F-004, F-005
```

**What happens if it ignores the rebuttal:**

```
❌ malformed verdict — these rebuttals were not addressed: F-004
```

**What happens if a selected dimension says nothing:**

```
❌ malformed verdict — dimension D5 is selected but reported nothing.
   NOT-CHECKED with a reason is allowed; silence is not.
```

Three different gates, three different rules, all in the CLI where a model cannot
route around them.

Clean run:

```
  iteration 2: FAIL — 1 blocking finding, coverage 100%
  CHALLENGE iter=2 findings=P0:0/P1:1/P2:0 coverage=100% verdict=FAIL
```

9 → 4 → 1. The last one is `F-003`: Scope still says `TBD`, and the user knows
why — the endpoint list lives in the sibling API spec.

```bash
orc challenge accept tsd-payments F-003 "the endpoints land in the sibling API spec, not here"
```

```
✓ F-003 accepted as a known gap. It stops blocking, and it stays visible in
  every report with your reason.
```

The state recomputes immediately — an accept is a decision, and it takes effect
the moment it is recorded, not one paid iteration later.

## PASS

```
  PASSED  passed at iteration 2; nothing has changed since
```

**No advisor is dispatched.** `orc challenge report` writes `CHALLENGE.md` and
`final-report-<DDMMYY>-<HHMMSS>.md`, `RESUME.md` is deleted, the `FINISH` packet
goes out, `.current` is deleted.

```
  Not staged. Commit them if your team should see the review trail:
  git add orc/orc-challenge/tsd-payments/
```

It prints the command. It does not run it.
