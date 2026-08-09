---
description: Generate options for a problem you have not solved yet — candidates against named thinking lenses, clustered into a few directions, stress-tested, and you pick
---

Use the **orc-brainstorm** skill. It is standalone — no scan, no plan, no build,
no code written, and no config key changes how it behaves.

Start from a problem, a goal, or a hunch. *"How should we onboard new
merchants?"* *"Support queue is drowning us."* *"What should this thing even be
called?"* **Not restricted to code** — the repo is used when it helps and ignored
when it does not.

Grill converges one idea you already have. This one **diverges first**: it
proposes, you judge.

How it runs:

1. **Frame.** What is actually wrong, who it is for, what "better" looks like,
   what is fixed. Facts it can look up (wiki, code pattern, gotchas, a read-only
   web lookup) it looks up instead of asking you.
2. **Diverge.** It generates candidates against named thinking lenses — SCAMPER,
   inversion, Six Thinking Hats, analogy, constraint-flip, first principles, and
   what this repo already tried. At least 8 across at least 3 lenses, no cap, and
   **no criticism at all** in this phase.
3. **Cluster.** The pool collapses into 3–5 real directions, each with its bet,
   what must be true, what it costs, and what it kills. Every candidate lands in
   a direction or in the graveyard **with the reason it lost**.
4. **Stress.** Now the objections come out: a pre-mortem per direction, the
   honest worst case and the honest best case. Your own ideas get stressed
   exactly like its own.
5. **You pick.** It recommends one and argues for it, then waits. It never picks
   for you.

**Every menu it prints ends with a slot for the user's own words** — "in your
words", "mix 1 and 2", "none of these". Your idea enters the pool quoted verbatim
and gets stress-tested exactly like one of its own.

**It stops and asks before writing anything.** When the picture looks complete it
says why and asks whether to write it up. Only your yes writes the file.

Then ONE question: save it → `orc/brainstorming-session/<slug>/brainstorm-session.md`
(the problem in your words, every candidate, the directions, the pick, and one
paragraph per loser explaining why it lost) · continue into `/orc-analyze` (only
when the direction is concrete enough for the analyst) · continue into
`/orc-grill` to sharpen it · or stop and save nothing.

If a decision has to be settled before the options even make sense, it offers to
borrow `/orc-grill` and **come straight back** with your answers carried over —
a `RETURN-TO` suspend, never a one-way handoff.

The problem (a sentence is enough): $ARGUMENTS
