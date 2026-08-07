---
description: Sharpen a vague idea into a settled one by conversation — rounds of questions, facts looked up not asked, then save it or carry it into /orc-analyze
---

Use the **orc-grill** skill. It is standalone — no scan, no plan, no build, no
code written, and no config key changes how it behaves.

Start from as little as one sentence. *"I want notifications for merchants."*
*"Something is wrong with our refunds."* Vagueness is the input here, not a
reason to refuse.

How it runs (the shared mechanic in `_shared/interview.md`):

1. **Rounds, not a form.** It builds a tree of open questions and asks the whole
   **frontier** each round — every question whose prerequisites are already
   settled, and nothing that depends on an answer it does not have yet. Each
   question carries a recommendation, so "1, 3, default the rest" moves the round
   along.
2. **Facts are looked up, not asked.** The wiki, the cached code-pattern, the
   gotcha list, and — last, and announced — a read-only recon dispatch. You are
   never made to recite your own codebase.
3. **Decisions are yours.** It recommends and argues, then waits. It never
   answers its own question and never adopts a default in silence.
4. **You end it, not an empty question list.** It plays the idea back in plain
   words and asks whether that is what you meant. Only your yes ends it.

Then ONE question, three answers:

- **Stop here — save it** → `orc-grill/<slug>/grill-context.md` at the project
  root: what it is in your words, every decision with the reason it was settled,
  what was ruled out, and the questions talking cannot settle (each pointed at
  the instrument that can — a mock, or `/orc-analyze`).
- **Continue into `/orc-analyze`** → the saved doc IS the input, so the analyst
  spends its tokens grounding the idea in code instead of re-asking scope.
- **Stop, save nothing.**

There is no question cap. Say "stop asking, just save it" whenever you want, and
use `/orc-explain` if a round gets dense.

The idea (one sentence is enough): $ARGUMENTS
