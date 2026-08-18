# `verdict.md` and the findings array

Two halves of one return. The **prose** is for a human reading the review; the
**array** is what `orc challenge record` gates and stores. They must agree —
`record` re-checks the file's sha forever after, so an edit to one without the
other shows up as `TAMPERED`.

## The file

`orc/orc-challenge/<slug>/iteration-NN/verdict.md`. `NN` is zero-padded so
iteration 10 sorts after iteration 9.

This is the file the reader thinks of as "the review". It lives inside its
iteration folder because an iteration has four artifacts, not one:
`lint.json` · `reader-report.md` · `verdict.md` · `advice.md` (absent on PASS).

```markdown
# Verdict — iteration 2 · tsd-payments

**Goal (frozen v1):** a backend team implements this without asking me anything
**Audience:** backend engineers, 2 of 5 non-native English readers
**Done means:** no open interface question and no TBD in §3–§7

Graded against template v1 · goal v1 · dimensions D1 D2 D3 D4 D5 D6

## Summary

Two sentences. What state the artifact is in, and what is standing between it
and the stated goal. Not a list — the list is below.

## Dimensions

| ID | Status | Findings | Note |
|---|---|---|---|
| D1 | CHECKED | 0 | every required section is present and carries content |
| D5 | NOT-CHECKED | — | challenge_reader is off |

## Carried findings

| id | outcome | why |
|---|---|---|
| F-001 | resolved | §3.2 now names the window as 24h |
| F-003 | still-open | Scope is still `TBD` |
| F-004 | withdrawn | the rebuttal is right — it is a quotation from JIRA-4412 |

## New findings

### F-014 · P1 · D2 — docs/tsd-payments.md:118

> the idempotency window is applied appropriately

**What is wrong:** the window is never given a value anywhere in the document.
**Consequence:** two teams implementing from this will pick different windows,
and the mismatch only shows up in production.
**Fixed when:** §4.2 names the window in seconds and the dead-letter destination.
**Serves:** done_means
```

**Every verdict restates the goal at the top.** Nobody should ever fix in the
dark.

## The array

One object per finding — new AND carried, in the same array:

```yaml
- id: F-014                 # permanent. Never renumber, never reuse
  dimension: D2             # one of D1…D7
  severity: P1              # P0 | P1 | P2 | P3
  anchor: "docs/tsd-payments.md:118"   # real, resolvable
  quote: "the idempotency window is applied appropriately"
  what_is_wrong: "…"
  consequence: "…"          # what a reader BUILDS wrong
  acceptance_line: "…"      # what "fixed" looks like, concretely
  serves: done_means        # goal | audience | done_means | out_of_scope:<name>
  # carried findings ALSO carry:
  outcome: still-open       # resolved | still-open | superseded | withdrawn
  reason: "…"               # required for withdrawn
  superseded_by: F-021      # required for superseded
```

Plus, at the top level of the return:

```yaml
verdict_file: "iteration-02/verdict.md"
lint:    { findings: 13, grade: 8.1 }
reader:  { asked: 12, answered: 11, score: "11/12" }
dimensions:
  - { id: D1, status: CHECKED, findings: 0 }
  - { id: D5, status: NOT-CHECKED, reason: "challenge_reader is off" }
rebuttals_addressed:
  - { id: F-004, result: withdrawn, reason: "agreed — it is a quotation" }
```

## What `record` rejects, by name

| Rejection | Rule |
|---|---|
| a selected dimension reported nothing | 6 — silence is indistinguishable from a forgotten check |
| `NOT-CHECKED` with no reason | 6 |
| coverage below 100% | 4 — with the missing ids named |
| an outcome on a finding that was not open | 4 |
| `withdrawn` with no reason, `superseded` with no id | 4 |
| an open rebuttal not addressed | the rebuttal contract |
| the verdict file is missing from disk | 10 |
| a bad severity or an unknown dimension | the enums |

And one thing it does NOT reject: a finding with no `serves`. That one is
**dropped**, counted, and reported — it is out of scope of the stated goal, which
is a judge working outside its brief, not a broken return.

## Writing the return to disk

The skill writes the array to a temp JSON (inside the cycle folder), then:

```bash
orc challenge record <slug> --iteration N --from orc/orc-challenge/<slug>/iteration-NN/verdict.json
```

The CLI prints the `trace_line` for the iteration. Use it verbatim — do not
compose a second wording for it.

## The council section (v0.49.1)

The verdict body gains one section, above the findings.

**One row per roster lens, and a NOT-RUN row keeps its slot with its reason** —
filtering it out makes *"the contrarian found nothing"* and *"the contrarian
never ran"* look identical. Rule 15.

```
council v1 — 4 of 5 ran

  RAN      reader        raised 3 · adopted 2 · merged 1 · rejected 0 · out-of-goal 0
  RAN      contrarian    raised 6 · adopted 4 · merged 1 · rejected 1 · out-of-goal 0
  RAN      outsider      raised 3 · adopted 1 · merged 2 · rejected 0 · out-of-goal 0
  RAN      executor      raised 2 · adopted 2 · merged 0 · rejected 0 · out-of-goal 0
  NOT-RUN  principles    usage limit reached mid-batch
```

Then the **disposition table** — every id the council raised, with the ONE
disposition it got and its reason. `council_coverage_pct` must be 100 or
`orc challenge record` rejects the verdict and names the missing ids.

Every finding line carries its **lens**, and where two lenses landed on the same
defect, `also found by: outsider`. **Corroboration is a signal, never an
automatic severity bump.**

An **adopted council finding keeps the raiser's id.** `C-004` is `C-004` here and
in iteration 9.

The council executor's `monday_morning` list is printed verbatim — including
`monday_morning_stops_at`, which is the most legible sentence this lane produces
for a non-engineer.
