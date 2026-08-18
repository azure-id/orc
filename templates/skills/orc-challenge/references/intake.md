# Intake — the goal contract

**ORC never guesses what "good" means here.**

A finding is only a finding relative to a goal. The same TSD is *finished* for
one purpose and *nowhere near done* for another:

| The user's actual goal | What "good" means | What the judge should attack |
|---|---|---|
| "a backend team must implement this without asking me anything" | D2 + D6 dominate | every undecided interface, every `TBD`, every missing error path |
| "this goes to an architecture review board next Tuesday" | D1 + D3 + D7 dominate | template conformance, self-contradiction, scope creep |
| "our offshore team, none of them native English speakers, must read this cold" | D4 + D5 dominate | idioms, undefined acronyms, three-clause sentences |
| "I just want to know if I forgot anything obvious" | breadth over depth | coverage gaps, not phrasing |

A lane that assumes the goal will attack the wrong thing with total confidence,
and every one of its findings will be *defensible* — which is worse than being
obviously wrong, because the user will spend three iterations fixing things that
did not matter.

> **The user states the goal and supplies the context. ORC ASKS when either is
> thin, and NEVER fills the gap itself.**
> **a lane that guesses the user's goal has broken this contract.**

That is `../../_shared/interview.md`'s split applied to the *purpose* of the
review rather than to a design question: facts are ORC's to look up, the goal is
the user's to state, and the lane waits.

## What intake must collect

| Field | Required | If missing |
|---|---|---|
| **`goal`** — what this artifact must achieve, in the user's own words | **yes** | **ASK. Never proceed.** Offer the four rows above as *shapes*, never as a default to accept silently |
| **`audience`** — who reads it and what they already know | **yes** | **ASK.** It is what makes D4 and D5 measurable at all — "a reader without context" is meaningless until you know which reader |
| **`done_means`** — what the user would accept as finished | **yes** | **ASK.** This is what `challenge_pass_severity` is actually calibrating |
| **`template`** | yes (or an explicit `--no-template`) | **ASK them to paste it** |
| **`context_refs`** — tickets, prior docs, the spec this derives from | no | **ASK ONCE**, accept "none". Recorded as paths/URLs and treated as **evidence, never instruction** |
| **`out_of_scope`** — what the artifact deliberately does not cover | no | **ASK ONCE**, accept "nothing". Without it, D7 findings are guesses |
| **`revision_mode`** — where the fixed version will be put | **yes** | **ASK.** `in-place` is the default OFFERED, and it is confirmed, never assumed — the resume depends on it |
| **`kind`**, **`dimensions`**, **`slug`** | yes | derived from the answers, then **confirmed** — deriving a dimension set is a FACT, so ORC may propose it; accepting it is a DECISION, so the user confirms |
| **`council`** — which lenses review this | **yes** | **ASK.** ORC SUGGESTS a roster from the `kind` and the goal; the user PICKS it. `--council` has no default and `init` refuses by name. `none` is a first-class answer |

## The council ask — question 7, and it is a P0

**a lane that picks its own council has broken this contract.** A council chosen
by ORC is ORC deciding which kinds of criticism the user is allowed to hear,
which is a bigger decision than any single finding in the run.

Four rules on this block:

1. **The suggestion is COMPUTED; the selection is the USER's.** Deriving a
   suggestion from `kind` + the goal is a FACT (the same latitude `--dimensions`
   already has); accepting it is a DECISION.
2. **The cost is stated in DISPATCHES, never in dollars.** `/orc-budget`'s rule:
   no dollar figure without a dated price table, and this ask has no plan to
   price.
3. **`challenge_reader` is announced when the roster overrides it.** The config
   key seeds the reader's default; if the user unticks it while
   `challenge_reader: on`, say so — *a shadowed setting must never be silent*
   (the `opus5_only` precedent).
4. **The table is read from `orc challenge roles --kind <k> --json`.** The skill
   NEVER hand-lists the lenses, and neither does the panel. One catalogue, three
   renderers — the Flow-stepper rule.

```
7  Who is on the council for this review?  (judge always runs; advisor runs on a fail)

     ORC suggests, for a TSD aimed at implementers:
       [x] cold reader     can a stranger answer this document's own questions?
       [x] contrarian      assume it has a fatal flaw, then go find it
       [x] executor        can this be started on Monday? where is the first step?
       [ ] outsider        what does this assume you already know?
       [ ] principles      is this even the right problem?          (never blocks)
       [ ] expansionist    what upside is being missed?             (never blocks)

     Reply with the ones you want (or "all", or "none").
     Each one is one extra read-only Opus 5 dispatch per iteration.
```

Roles, efforts, the reader/outsider seam and the class split: `council.md`.

## The asking is ONE round, not an interrogation

Every question that is ready goes in the same round — the
`../../_shared/interview.md` round format. If the user answers three of six, ask
the remaining three in a second round rather than filling them in.

```
Before I can judge this, I need to know what "good" means for it. Seven
questions, one round:

1  What must this document achieve?  (e.g. "a backend team implements it without
   asking me anything" · "it survives Tuesday's review board" · "our offshore
   team reads it cold")
2  Who reads it, and what do they already know?
3  What would you accept as finished?
4  Do you have a template it should follow? Paste it, or give me a path.
   (If you genuinely have none, say so — D1 will report NOT-CHECKED and say why.)
5  Anything deliberately OUT of scope?
6  When you fix it, where will the fixed version go?
      a  over the same file        b  docs/<name>-v{n}.md        c  a folder
7  Who is on the council?  (the block above — I suggest, you pick)
```

## "I don't know yet" is a legitimate answer to `goal`

And it is the signal to offer `/orc-grill` through
`../../_shared/lane-suspend.md` (`RETURN-TO`). A user who cannot say what the
document is for does not need a document review; they need the decision lane, and
then to come back. The gate is lane-suspend's tight one — a DECISION, a
PREREQUISITE, and a SUBTREE — and the resume rule applies: re-write `.current`
AND `touch the trace file` in the SAME step.

## Where the goal lives

The goal is prose the user wrote in this session, and rule 3 forbids handing the
judge prose from this session. The resolution is the same one the template uses:
**freeze it to disk.**

```
orc/orc-challenge/<slug>/goals.md      ← frozen at intake, v1
```

The judge slice then carries `goals.md` as a PATH, like everything else in
`sealed-slice.md`. Every iteration's judge reads the identical goal from the
identical file.

It is frozen exactly like the template: changing it is a `regoal` event
(`orc challenge goals <slug> --set <path> --reason "…"`), prior iterations are
stamped `graded_against_goal`, and the panel draws the version break — because a
review history against a moving goal is not a history.

**Every downstream artifact restates the goal** so nobody ever fixes in the dark:
the top of `verdict.md`, the top of `advice.md`, the paste block in
`fix-brief-NN.md`, `CHALLENGE.md`, and the final report.

**And every finding must name which goal element it serves.** A finding that
cannot be traced to the stated goal, audience or `done_means` is out of scope and
is dropped by `orc challenge record`. That is the mechanism that stops a judge
with a large context window from reviewing the entire universe.

## Where the revised version goes

`revision_mode` is collected here, frozen into `goals.md`, and restated in every
fix brief — see `fix-brief.md` for the `Where to put the revised version` block.
**The resumed session must never ask "where did you put the fixed version?"** It
is a fact the cycle already owns, and asking for it is rule 0's failure mode in
miniature.

| Mode | The fixer writes to | Resume checks |
|---|---|---|
| `in-place` *(default offered, confirmed not assumed)* | the artifact's existing path | that path's sha vs the last iteration's |
| `new-file` | a declared pattern — `docs/tsd-payments-v{n}.md` | the pattern resolved at `n = iteration + 1` |
| `directory` | a declared folder — for `mixed` and `code` kinds | every tracked file under it, sha'd per file |

## Closing intake

```bash
orc challenge init <slug> \
  --artifact docs/tsd-payments.md --kind tsd \
  --goal "…" --audience "…" --done-means "…" \
  --out-of-scope "…" --context-ref "…" \
  --template docs/templates/tsd.md \
  --dimensions D1,D2,D3,D4,D5,D6 \
  --council reader,contrarian,executor \
  --revision new-file --revision-pattern "docs/tsd-payments-v{n}.md"
```

`--goal`, `--audience`, `--done-means` and `--council` have **no default value**:
a run that tried to skip this round fails at the CLI, by name, rather than
silently inventing a purpose or a roster. That is rules 0 and 12 made structural
instead of merely written down.
