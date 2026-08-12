# Mock run — `/orc-challenge`

> ORC grades your finished document, then stops and makes you fix it somewhere else.

---

## 1. What it does

Every other ORC lane **makes** something. This one does not.

It reads a finished thing — a design document, a README, a runbook, a module of
code — and tells you what is wrong with it. Then it **stops**. You go and fix the
thing in a **new chat**. Then you come back and it grades it again.

> **ORC judges. You fix. ORC judges again. ORC never fixes what it judged.**

That sounds like extra work. It is the whole point.

If the same chat writes the fix, that chat will also mark it as fixed. It will
always say the work is good, because it just did the work. Keeping the two apart
is the only way the score means anything.

---

## 2. It never guesses what "good" means

A document can be finished for one purpose and nowhere near done for another.

| Your real goal | What ORC should attack |
|---|---|
| "a backend team must build this without asking me anything" | every open question, every `TBD` |
| "this goes to a review board on Tuesday" | missing sections, things that contradict each other |
| "our team abroad must read it cold" | idioms, long sentences, words nobody explained |
| "did I forget anything obvious?" | gaps, not wording |

So ORC asks you first. It does not pick one for you.

If it guessed, every problem it found would still *sound* right — and you would
spend three rounds fixing things that did not matter. That is worse than being
obviously wrong.

---

## 3. Session 1 — you start

```
> /orc-challenge docs/tsd-payments.md
```

ORC asks six questions, all at once:

```
Before I can judge this, I need to know what "good" means for it.
Six questions, one round:

1  What must this document achieve?
2  Who reads it, and what do they already know?
3  What would you accept as finished?
4  Do you have a template it should follow? Paste it, or give me a path.
5  Anything deliberately OUT of scope?
6  When you fix it, where will the fixed version go?
      a  over the same file    b  docs/<name>-v2.md    c  a folder
```

You type: **"just tell me if it's good"**.

ORC does **not** start:

```
That is not enough for me to judge it, and guessing would be worse than useless.

Which of these is closest?

  a  a backend team must implement it without asking me anything
  b  it has to survive Tuesday's architecture review board
  c  our offshore team, several non-native English readers, must read it cold
  d  I just want to know if I forgot anything obvious
  e  your own words
```

You pick **a**, say who reads it, paste your team's template, and say the fixed
version goes to `docs/tsd-payments-v2.md`.

ORC saves your answers to a file and **freezes them**. From now on every round is
judged against the same goal — otherwise the history would mean nothing.

---

## 4. Still session 1 — the three checks

### Check 1 — the free one

```
  13 findings · 5 sentences · p50 8w / p90 43w · passive 40% · grade 8.1
  template: 4/5 required sections present, missing 1
```

This costs **nothing**. No AI ran. A small program counted the things a program
can count: missing sections, one 43-word sentence, short words, `TBD`, links that
go nowhere, words nobody explained.

ORC says out loud what this is: **a signal, not a verdict.** A long sentence is
not automatically bad. It just hands the numbers to the judge so the judge does
not spend money counting.

### Check 2 — the cold reader

ORC sends the document to an agent that **can only read that one file**. No
search. No repo. No chat history. It does not even know what the document is for.

Its job is not to review. Its job is to **answer questions from the document**.

```
It asked itself 12 questions.
  8  it could answer from the document
  3  it had to guess
  1  it could not answer at all

Words used before anyone explained them: "idempotency window", "SoR", "cutover"
```

**8 out of 12.** That is what "someone new can follow this" actually means, as a
number.

Why an agent that thinks *less*? Because a clever reader fills in the gaps
without noticing. You want a reader that stops when the document stops.

### Check 3 — the judge

Now a strong agent reads the document properly, with your frozen template and
your frozen goal.

It gets **file paths only** — never a summary of what changed, never "the user
says they fixed this". A summary is where bias gets in.

It finds problems like this one:

```
F-001 · P0 · docs/tsd-payments.md:118

  "the idempotency window is applied appropriately"

  What is wrong:   the window is never given a value anywhere.
  What it costs:   two teams building from this will pick different values,
                   and you find out in production.
  Fixed when:      §4.2 names the window in seconds and the dead-letter target.
  Serves:          done_means
```

Three things matter here:

- **"What it costs"** — not "this is unclear", but what somebody builds wrong.
- **"Fixed when"** — so you are never guessing what done looks like.
- **"Serves"** — which of YOUR goals this helps. A problem it cannot tie back to
  your goal gets **thrown away**.

---

## 5. The result — and ORC does not decide it

```
  iteration 1: FAIL — 4 blocking findings, coverage 100%
  1 finding dropped for having no `serves` (out of scope of the stated goal).
```

The judge does not say pass or fail. It only lists problems. A small program
counts them and decides.

That is on purpose. **A judge that can pass something can be talked into passing
something.** A judge that can only find things cannot.

The dropped one was about the mobile app — which you said was out of scope. You
did not have to trust the judge to remember. The rule is in the program.

---

## 6. ORC stops

```
Fix brief written:  orc/orc-challenge/tsd-payments/fix-brief-01.md

Paste this into a NEW Claude Code session:

  Fix the findings in orc/orc-challenge/tsd-payments/fix-brief-01.md.

  Artifact:  docs/tsd-payments.md
  Goal:      orc/orc-challenge/tsd-payments/goals.md  (read this first)

  Write the revised version to:  docs/tsd-payments-v2.md

  Rules:
  - Change the document only. Do not edit anything under orc/orc-challenge/.
  - Do not mark findings resolved. The next judgement decides that.
  - If you think a finding is wrong, do not argue with it here —
    run: orc challenge rebut tsd-payments F-007 "why"

  When you are done, start ANOTHER new session and run:
    /orc-challenge tsd-payments
```

And it **ends the turn**. It does not ask "would you like me to fix these?"

Offering would break the rule politely, which is still breaking it.

The brief also groups the problems. Twelve findings are usually three causes:

```
Group 1 — the glossary          fixes F-004 F-009 F-011 F-012 F-015 F-018
  Root cause: three terms are never defined, and six findings come from that.
  Do this first: six findings disappear when you define the terms once.
```

---

## 7. Session 2 — the fix session

A **new chat**. It reads the brief. It edits `docs/tsd-payments-v2.md`. It stops.

It does not run `/orc-challenge`. **This is the important part.**

One thing it may do: if a finding looks wrong, say so on the record.

```
$ orc challenge rebut tsd-payments F-004 "the phrasal verbs are quoted from JIRA-4412"

✓ F-004 rebutted. The next judgement MUST answer it explicitly — withdrawn (with
  an admission) or upheld (with new evidence).
```

Without this, one wrong finding would loop forever and your only move would be to
give up.

---

## 8. Session 3 — round two

```
> /orc-challenge tsd-payments
```

ORC opens with what actually changed:

```
expected revision:  docs/tsd-payments-v2.md   FOUND   (6fd76797 → f475e8e4, +24 −0)
carried findings:   5   ·  5 touched  ·  0 untouched

  touched/untouched is a hint for you. The judge re-reads the document either way.
```

It knew where to look because you said so in session 1. **It never asks you where
you put the fixed version.**

If the file is not there:

```
expected revision:  docs/tsd-payments-v2.md   MISSING

Candidates changed since iteration 1:
  1  docs/tsd-payments-v2.draft.md      +51 −12
  2  docs/tsd-payments.md               +4  −0

Which of these is the revision — or is the work not done yet?
```

It **lists**. It does not pick. A judge pointed at the wrong file writes a page of
confident, useless findings.

### Nothing is allowed to disappear

Every problem from last time must get an answer this time:

| Answer | Meaning |
|---|---|
| `resolved` | the judge looked again and it is gone |
| `still-open` | not fixed, or fixed wrongly |
| `superseded` | the document moved; a new finding replaces it |
| `withdrawn` | the judge now agrees it was not a problem |

If the judge forgets one:

```
❌ malformed verdict — coverage is 20% — every finding carried in must get
   exactly ONE outcome. Missing: F-002, F-003, F-004, F-005
```

If it ignores your rebuttal:

```
❌ malformed verdict — these rebuttals were not addressed: F-004
```

If it quietly skips a check:

```
❌ malformed verdict — dimension D5 is selected but reported nothing.
   NOT-CHECKED with a reason is allowed; silence is not.
```

A problem that quietly vanishes looks exactly like a problem that got fixed. That
is how review cycles pretend to succeed.

Round two:

```
  iteration 2: FAIL — 1 blocking finding, coverage 100%
```

Nine, then four, then one. The judge also withdrew `F-004` — you were right, it
was a quotation.

---

## 9. The last one, and a way out

The last problem is real, and you are not going to fix it: the endpoint list
lives in a different document.

```
$ orc challenge accept tsd-payments F-003 "the endpoints land in the sibling API spec, not here"

✓ F-003 accepted as a known gap. It stops blocking, and it stays visible in
  every report with your reason.
```

"Good enough, and here is why" is a real ending. ORC writes your reason down
forever instead of quietly lowering the bar.

---

## 10. Pass

```
  PASSED  passed at iteration 2; nothing has changed since

✓ CHALLENGE.md rendered from the ledger — 2 iterations.
✓ final report: final-report-120826-192451.md

  Not staged. Commit them if your team should see the review trail:
  git add orc/orc-challenge/tsd-payments/
```

No advice is written on a pass — advice about a finished document is invented
work, and it costs money.

It prints the `git add` command. It does not run it. **This lane never commits.**

---

## 11. What if it never converges?

There is **no limit** on rounds. Every other loop in ORC has one, because those
loops run inside a single chat and burn money each turn. Here each turn is a
person sitting down to work. Refusing on round six would be refusing to review a
hard document.

Instead ORC measures:

```
convergence: 9 → 4 → 4 → 4 blocking findings over 4 iterations
             ⚠ stalled — no net reduction in 3 iterations.

Three honest options:
  1  Narrow the rubric          orc challenge init … --dimensions D1,D2,D6
  2  Accept them as known gaps  orc challenge accept tsd-payments F-003 "…"
  3  Keep going                 /orc-challenge tsd-payments
```

It says this once. It does not nag every round.

---

## 12. Coming back later

You do not need the old chat. Everything lives on disk.

| How | What happens |
|---|---|
| `/orc-challenge tsd-payments` in a new chat | the normal way, and the one the brief tells you to use |
| `/orc-challenge` with nothing | lists your open cycles and asks which one |
| `orc challenge status tsd-payments` | just read the state, no AI at all |

`orc resume` also shows it, for free.

---

## 13. What lands on disk

```
orc/orc-challenge/tsd-payments/
├── challenge.json          the record. Only the `orc challenge` command writes it
├── goals.md                your frozen answers from session 1
├── template.md             your frozen template
├── CHALLENGE.md            a readable summary of the whole cycle
├── iteration-01/
│   ├── lint.json           the free checks
│   ├── reader-report.md    the cold read
│   ├── verdict.md          the review
│   └── advice.md           how to group the fixes
├── fix-brief-01.md         the thing you paste into a new chat
├── iteration-02/…
└── final-report-120826-192451.md
```

Nothing here is staged for commit. It is yours to publish or not.

---

## 14. What it will not do

- It will not fix the thing it judged.
- It will not guess what your document is for.
- It will not say "pass" — a program decides that from the findings.
- It will not let a problem quietly disappear between rounds.
- It will not pick which file is your fixed version.
- It will not stage or commit anything.
- It will not run your build or your tests. That is `/orc-verify`'s job.
