---
description: You have a plan — this says which lane should build it, with the numbers it decided from. Plan-only: it refuses a request in words rather than guess
---

Use the **orc-route** skill. Zero agents, nothing is built.

**It routes a PLAN, and only a plan** — pasted ORC planning-output, a
`plan-<name>.md` path, or a saved `orc/planner/<name>/` checkpoint (the same
definition `skills/_shared/phases/plan-handoff.md` already uses). A plan carries real
numbers: tasks, files per task, dependencies, facets, scores. Routing from those
is arithmetic; routing from a sentence is guessing, so a request in words gets a
refusal and a pointer to `/orc-plan`, not a guess.

It reads the plan plus ORC's deterministic probes (`orc wiki status`,
`orc pattern status`, `orc gotcha status`, `orc diy status`) and answers:

```
Plan: merchant-notifications — 7 tasks, 3 waves, 14 files touched
      top score 78, two tasks marked risky

→ /orc          the plan has risky tasks and a task above 70;
                review and verify are worth paying for here
   runner-up    /orc-mini — about 3x faster, but it skips full review
                and verification. Fine only if you will read the diff yourself.
   not possible /orc-fast — needs a fresh wiki (yours is STALE) and this plan
                is 7 tasks; that lane runs ONE task

Start /orc now?  [yes / no]
```

Every runner-up says what choosing it costs you. Every impossible lane names the
condition blocking it **and** how to fix it. Risk beats size: a small plan with a
cited risk still earns the full lane.

`/orc-plan` also offers this automatically after **Save & stop**, so you rarely
need to type it.

New to ORC and wondering which command to use at all? That is
`orc onboarding first-run`, not this.

Plan (paste it, or give a path): $ARGUMENTS
