---
description: Execute, escalate or refuse — what an agent should not try in this repo, and exactly what would change that
---

Use the **orc-boundary** skill. Standalone — read-only, no code written, no plan.

Every other skill you can install assumes the answer to *"should the agent do
this?"* is yes. Agents spend 5×–50× longer than human experts on a task, and most
of the excess goes into attempts that were never going to succeed.

Three verdicts, one card per **area**:

- **EXECUTE** — dispatch normally. The agent can do this and can tell whether it
  worked.
- **ESCALATE** — dispatch, but a named human signs off before ship.
- **REFUSE** — do not dispatch. **And here is the checklist that would change
  this.**

**A REFUSE always names what would make it a yes.** "No" with no "unless" is a
shrug, so a REFUSE with no checklist is treated as a malformed card, not rendered as
an empty one.

The verdict is derived, not guessed — four questions, each answered from something
already on disk:

| Question | Answered from |
|---|---|
| Can the agent verify itself? | is there a test runner, does the build run, is there a smoke gate |
| Does it know this area? | `orc wiki status` · `orc pattern status` · `orc gotcha list` · past traces |
| Is it reversible? | migrations, live payments, deletes, published artifacts, outbound sends |
| Is it a decision, not a fact? | a decision is yours — that is what ESCALATE is for |

Every card records which answers drove the verdict, so a verdict is always arguable,
and every card also says **what an agent MAY do here today** — most refused areas
still have plenty of safe work in them.

**It gates ORC's own dispatch, never you.** Tell ORC to change the migration and ORC
changes the migration; the card is shown, not enforced against you.

Inside `/orc` (`boundary_gate`, default `warn`): a preflight line and a per-task
verdict. Set it to `block` and a REFUSE task is **lifted out of its wave** — the wave
still runs the rest, and the lifted task comes back with its checklist.

Read the cards back any time: `orc boundary status [<path>]`.

What to draw a boundary around (a path, a plan, or nothing and it will ask): $ARGUMENTS
