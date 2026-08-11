# Mock run — `/orc-route`

> You have a plan. This tells you which lane should build it — and which lanes
> cannot.

---

## 1. What it does

It reads a **plan** — the numbers in it: how many tasks, how many waves, how
many files, the top score, whether any task is marked risky. Then it checks
ORC's own probes (is the wiki fresh, is a pattern cached, is a DIY flow ready,
does any boundary card say REFUSE) and names **one** lane.

It refuses to route a sentence. Routing from a plan is arithmetic. Routing from
"I want to add refunds" is guessing, and a guess that looks calculated is worse
than no answer.

---

## 2. The run — with a plan

```
> /orc-route .claude/orc/run/refund-visibility/plan.md
```

```
Plan: refund-visibility — 7 tasks, 3 waves, 14 files touched
      top score 78, two tasks marked risky (money)

→ /orc          the plan has risky tasks and a task above 70;
                review and verify are worth paying for here
                1.23M raw · 18% of a 5-hour window on Max 20x

   runner-up    /orc-mini — about 3x faster and 0.41M raw (6% of a window),
                but it skips full review and verification. Fine only if you
                will read the diff yourself.

   not possible /orc-fast — needs a FRESH or AGING wiki (yours is STALE →
                fix: /orc-wiki refresh) and this plan is 7 tasks; that lane
                runs ONE task.

   not possible /orc-diy — `orc diy status` exits 1 (UNCONFIGURED)
                fix: orc diy init && orc diy compile

Start /orc now?  [yes / no]

> yes
```

---

## 3. The run — without a plan

```
> /orc-route I want to make refunds faster
```

```
That is a request, not a plan, so I will not route it.

Routing is arithmetic over a plan's own numbers — tasks, waves, files, top
score, risk. From a sentence I would be guessing, and a guess that looks
calculated is the worst answer I can give you.

Two ways forward:
  · /orc-plan  "make refunds faster"   → gives you a plan, then come back
  · /orc-grill                         → if the idea itself is still vague

If you are new and just want to know which command to start with, that is
`orc onboarding first-run`, not this lane.
```

---

## 4. What to notice

- **Every runner-up says what it costs you**, not just that it is cheaper.
- **Every "not possible" names the blocking condition AND its fix.** A blocked
  lane with no stated fix is a dead end.
- **Cost is added only when it is knowable.** With no run history, the cost
  column is simply absent — never a guessed number, and never a reason to
  withhold the recommendation, which does not depend on cost.
- **`/orc-ultra` is never a default.** It appears only when the plan itself
  justifies it, and it says plainly that it costs the most.
- **`/orc-plan` offers this automatically** after you choose "Save & stop".

---

## 5. Related

- Make a plan first: [`/orc-plan`](orc-plan.md)
- The cost numbers behind the column: [`/orc-budget`](orc-budget.md)
