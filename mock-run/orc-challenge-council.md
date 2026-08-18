# Mock run — the `/orc-challenge` council

> One reviewer sees one kind of problem. The council is six more ways of looking, and YOU choose which ones run.

---

## 1. The problem with one reviewer

`/orc-challenge` already reads your finished document and tells you what is
wrong with it. But it reads it **one way**: *does this document do what a
document is supposed to do?*

That misses whole kinds of problem. Six of them, in fact — and each one is
missed for a different reason:

| The way of looking | The question it asks | What goes wrong without it |
|---|---|---|
| **The Contrarian** | where is the fatal flaw? | everyone assumes the document is fine and stops looking |
| **The First Principles Thinker** | are we even solving the right problem? | nobody questions the thing you asked for |
| **The Expansionist** | what is being undervalued here? | only the bad news gets counted |
| **The Outsider** | what does this assume I already know? | an expert cannot un-know things |
| **The Executor** | what do you actually do on Monday? | the theory is graded, the first step never is |

Plus **The Cold Reader**, which you already had: *can a stranger answer the
questions this document promised to answer?*

That is six. The seventh — **The Judge** — always runs, and it is the one that
decides what happens to everything the other six find.

---

## 2. ORC suggests. You pick.

This is the part that matters, and it is the one rule the whole design is built
around:

> **ORC suggests a council. You choose it. ORC never chooses for you.**

Choosing the council is choosing **which kinds of criticism you are allowed to
hear**. That is a bigger decision than any single thing the review will find, so
ORC will not make it for you. If you do not answer, the command refuses:

```
❌ --council is required and has no default. ORC SUGGESTS a roster (from the kind
   and the goal); the user PICKS it.
```

When you open a cycle, question 7 looks like this:

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

Three things about that block:

- **The suggestion is worked out from what you told it** — the kind of document
  and what it is for. That is a fact, so ORC is allowed to work it out.
- **The cost is in dispatches, never in money.** ORC will not put a dollar figure
  on anything it has not priced from a real, dated price table.
- **"none" is a real answer.** It gives you exactly the review you had before,
  and nothing is lost by saying it.

---

## 3. Two of them never block anything

Four of the six find **problems**. Two of them cannot, and pretending otherwise
would make them lie.

### The Expansionist finds upside, not defects

Its whole job is *"what is this worth that nobody is counting?"* — which, by
definition, is **not** something you asked for. So it cannot report a problem
against your goal, because there is no goal to report it against.

It writes **opportunities** instead. An opportunity has no severity, never
blocks a pass, and always comes with a first step:

```
OPPORTUNITIES — not work, nothing here blocks

  X-001  the retry table would work for every write in the service, not just this one
         first step: list the four existing retry rules side by side
         route: /orc-brainstorm
```

You keep it or you let it go, and either way you say why. An idea that quietly
disappears looks exactly like an idea nobody ever had.

### The First Principles Thinker questions your goal

It is the only one allowed to say **the goal is wrong**. And that is exactly why
it cannot report a problem: a problem is measured *against* the goal, and this
one is arguing about the goal itself. Those cannot be the same thing.

It writes a **premise challenge**, and when there is one, it is the first thing
you read:

```
OPEN PREMISE CHALLENGE — read this before the findings

  Q-001  disputes: goal

         Reframe: the real job here is not "describe self-serve signup"; it is
         "decide whether signup is self-serve at all". Three sections answer the
         second question as if the first were already settled.

         Cheapest test: ask the growth lead whether the decision has been taken.
         One message. No rewrite.

  Neither answer is automatic and ORC never picks:
      agree     orc challenge goals <slug> --set <path> --reason "…"
      disagree  orc challenge premise <slug> Q-001 --dismiss --reason "…"
```

**Only a person can settle this.** If you agree, you write a new goal and the
review starts measuring against that instead. If you disagree, you say why — and
your reason stays in the report forever.

The Judge never sees this report. Handing a judge a document arguing that the
goal is wrong would bend every single thing it says afterwards.

---

## 4. What stops six reviewers from being a waste of money

The obvious way this goes wrong: six reviewers run, the Judge quietly ignores
four of them, and the review looks exactly the same as before while costing five
times more.

So the CLI **reads what each reviewer wrote, from disk**, and demands that the
Judge account for every single thing they raised:

```
❌ malformed verdict — council coverage is below 100% — every id the council
   raised needs exactly ONE disposition (adopted | merged | rejected |
   out-of-goal). Missing: O-003
```

The Judge cannot make the list shorter by leaving something out, because the
list was never the Judge's to write.

Four possible answers, and three of them need a reason:

| Answer | Means |
|---|---|
| `adopted` | agreed — it becomes a real finding |
| `merged` | the same problem as another finding (and it must say which) |
| `rejected` | read it, disagreed — **and says why** |
| `out-of-goal` | real, but nothing you asked for covers it — **and says why**. Reported, never quietly dropped |

---

## 5. Whoever found it, keeps the credit

When the Judge agrees with something the Contrarian found, it stays `C-004`.
Forever — in this review, in the report, and in iteration nine.

That is not tidiness. It is the only way you ever find out whether a reviewer is
worth what it costs:

```
  RAN      reader        raised 3 · adopted 2 · merged 1 · rejected 0
  RAN      contrarian    raised 6 · adopted 4 · merged 1 · rejected 1
  RAN      outsider      raised 3 · adopted 1 · merged 2 · rejected 0
  RAN      executor      raised 2 · adopted 2 · merged 0 · rejected 0
  NOT-RUN  principles    usage limit reached mid-batch
```

After two rounds you can see plainly that the Contrarian found four of the six
things that mattered, and that one reviewer has never landed anything. Drop it.

---

## 6. A reviewer that did not run is never silent

Look at that last line again. `principles` did not run, and it says so, with the
reason.

If a reviewer you chose simply vanished from the report, "it found nothing" and
"it never ran" would look identical — and one of those means you should relax
and the other means you should look again. So a reviewer that was selected and
did not run is **rejected as malformed** unless it says why:

```
❌ malformed verdict — executor is on the roster but returned neither a report
   nor an explicit { "lens": "executor", "ran": false, "reason": "…" }.
   A selected role is never silently absent.
```

---

## 7. What you actually do Monday morning

The Executor writes one thing that nobody else does — the literal first three
things an implementer would do with your document today:

```
What you would actually do first

  1. open docs/tsd-payments.md §4.2 and write the retry window in seconds
  2. ask the payments lead which queue the dead letters go to
  3. — stops here. The document never names the queue.
```

**That third line is the useful one.** It does not pretend. If the list cannot be
finished, it says exactly where it stops and why — and that sentence is usually
the clearest thing in the whole review for somebody who does not read code.

---

## 8. You can change your mind

The council is frozen per review, like the goal and the template. Changing it is
a recorded decision with a reason:

```bash
orc challenge council my-tsd --set contrarian,executor \
  --reason "the framing question is settled; what is left is completeness"
```

The timeline draws a line at that point, because a round judged by three
reviewers and a round judged by six are not comparable.

**Anything still open stays open.** The Judge answers every carried finding
whatever found it — it re-reads your document from disk every time, so it never
needed the original reviewer. You can change the council freely and lose
nothing.

---

## 9. What this never does

- **It never picks the council for you.**
- **It never lets an opportunity or a premise block a pass.** Neither has a
  severity, and neither ever will.
- **It never bumps a severity because two reviewers agreed.** Agreement is a
  signal worth showing you. It is not a verdict.
- **It never fixes anything.** Same as before: ORC judges, you fix somewhere
  else, ORC judges again.
- **It never quietly leaves a reviewer out.**

---

## 10. What it costs

One extra read-only dispatch per reviewer, per round. That is it.

The suggestion defaults to three, `none` is free and gives you the old review
exactly, and the per-reviewer numbers in section 5 tell you within two rounds
which ones to keep.
