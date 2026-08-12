# Shared contract — The interview (turning a vague idea into a settled one)

Canonical file: `_shared/interview.md`. THE canonical way any ORC lane
interrogates a human until an idea is sharp enough to act on. Load it wherever a
lane must ask more than a fixed questionnaire's worth of questions: `/orc-grill`
runs it end to end, and `references/intake.md` borrows its round format when a
tier's question set runs long.

This is not "ask good questions". It is a specific mechanic with a termination
rule, and the mechanic is what makes the output load-bearing instead of merely a
good conversation.

## Why this exists

ORC's spec quality is capped by the opening message. A fixed questionnaire asks
the same things of "add a retry to the webhook" and "something is wrong with our
refunds" — and gets a usable answer for one and noise for the other. Worse, the
expensive instruments are the wrong fix: `/orc-analyze` checks a requirement
**against the code**, so pointing it at a fuzzy *intent* spends a scan asking
questions a conversation asks for free.

## The design tree

Model the idea as a tree of open questions, not a list. A question is **settled**
when the user has answered it (or explicitly deferred it); it is **open**
otherwise. A question **depends on** another when its sensible options change
based on that answer.

> "Which queue?" depends on "is this async at all?" — asking both at once
> produces an answer to the second that the first may delete.

## The frontier, and the round

The **frontier** is every open question whose prerequisites are all settled.

**Ask the whole frontier in ONE round.** Not one question at a time (that is a
slow interrogation), not everything at once (that is a form). Two questions never
share a round if one depends on the other — if they do, you have mis-drawn the
tree, and the answer to the dependent one is worthless.

After each round: record the answers, re-derive the frontier, ask the next round.
Rounds get shorter as the tree settles. That shrinking is the progress signal.

## Fixed question shape (so a round is answerable by number)

```
❓ **Q1** — **<short title>**: <the question, in plain words>
➡️ <your recommendation, alone on this line, with the one-line reason>
```

Every question carries a recommendation. A user who does not care answers
"1, 3, default the rest" and the round still moves. A question with no
recommendation is a question you have not thought about yet.

## Facts vs decisions — the split that does the work

**A FACT is ORC's job, never the user's.** If the answer exists somewhere ORC can
look, looking is cheaper and more accurate than asking. Never make a human recite
their own codebase back to you. Resolve facts in this order — this is
`_shared/read-ladder.md` applied to interviewing, and you stop at the step that
answers:

| Step | Source |
|------|--------|
| 1 | `orc wiki status` — is there a wiki, and is it fresh? (`_shared/detecting-artifacts.md`) |
| 2 | the wiki pages themselves, when the tier is FRESH or AGING |
| 3 | the cached code-pattern (`orc pattern status <lang>`) |
| 4 | `orc gotcha list` — what this project already got wrong here |
| 5 | a read-only ad-hoc dispatch, **last** — it costs tokens and wall-clock |

**Never block a round on a running fact-find.** Ask the rest of the frontier
while it runs; only the questions genuinely downstream of that fact wait.

**A DECISION is the user's, and the lane waits for it.** Trade-offs, scope,
priorities, what "done" means, what is explicitly not being built — these have no
correct answer discoverable in a repository. Recommend, argue for the
recommendation, and then wait. Put plainly:
**a lane that answers its own interview question has broken this contract.**
A default silently adopted is
indistinguishable, one week later, from a decision the user made — and it is the
one the build gets wrong.

**The mirrored half, for a lane that GENERATES options** (`/orc-brainstorm`):
producing candidates is ORC's job, choosing between them is the user's, and
**The third half, for a lane that GRADES** (`/orc-challenge`): ORC judges, the
user fixes, ORC re-judges — and **a lane that fixes what it judged has broken
this contract**, because a session that just wrote the fix will grade its own
homework and it will always pass. Its intake is this same split applied to the
PURPOSE of the review: **a lane that guesses the user's goal has broken this
contract** too, because a finding is only a finding relative to a goal, and a
*defensible* finding about the wrong thing is worse than an obviously wrong one.

**a lane that picks its own favourite** and moves on has broken the same
contract. Convergent and divergent work split the same way; the two sentences are
registered as a pair so neither lane can drift into the other's habits.

## The confirmation gate — an empty frontier does NOT end the session

When no open question remains, do not declare victory. Play the idea back in
plain words — what it is, what was decided, what was ruled out — and ask:

> Does this match what you meant?

The user saying **yes, we understand each other** ends the interview. Nothing
else does. A "no" is not a failure; it is the tree being wrong, which is exactly
what this gate exists to catch. Re-open, add the questions the mismatch implies,
and run another round.

## Tag every settled decision — what makes this load-bearing

This is ORC's addition, and it is the reason an interview is worth running rather
than just chatting. As each decision settles, tag it exactly one way:

- **`intent`** — what the user wants built. Flows into the intent-spec / the
  requirement statement.
- **`constraint`** — a boundary the build must not cross ("no new dependencies",
  "must stay backward-compatible with the v1 payload"). Becomes a
  `spec_invariants[]` entry, appended **verbatim** to every executor slice.

A constraint recorded as prose in a document nobody re-reads is a constraint that
gets violated in wave 2. A constraint that rides in every slice does not.

## Questions an interview cannot settle — name them, do not talk around them

Some questions are not answerable by conversation at all:

- **"How should this feel?"** — taste, layout, tone. Talking produces agreement
  on words, not on the artifact. This is what ORC's `mock_example` phase is for
  (`mock-examples/<slug>/`): make something to look at, then react to it.
- **"Does the code actually do that?"** — a claim about the repository. That is
  `/orc-analyze`, not another round of questions.

Say which class an unsettled question is in and point at the right instrument.
Carrying it as an open question with the instrument named is a complete answer;
grinding on it for three more rounds is not.
