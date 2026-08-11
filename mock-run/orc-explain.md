# Mock run — `/orc-explain`

> ORC said something you did not understand. Type this and it says it again,
> properly.

---

## 1. What it does

It re-explains the **last thing ORC said** (or an earlier one, if you point at
it). It adds the background the message assumed, and defines every ORC-only
word in your project's own terms.

It is not "make it shorter". A summary of something you did not understand is
the same thing you did not understand.

Nothing about the run changes: no re-plan, no re-score, no undo, no new
question. When it finishes, you are exactly where you were.

---

## 2. The run

ORC has just printed a scoring block. Rina reads it and blinks.

```
T1 3·new-surface·stateful·new-tests·fan0/3·low = 6+18+16+8+9 = 57
   → orc-executor-sonnet-5-high (keystone)
```

```
> /orc-explain
```

```
The point: task T1 is medium-hard, so I am sending it to Sonnet 5 at high
effort, and it must finish before three other tasks can start.

The background that line assumed
  Before building, I give each task a number from 0 to 100. The number is
  arithmetic, not opinion: the planner (which read your files) reports a few
  properties of the task, and I add them up with a published formula. The
  number then picks the model from a fixed table. That is why you can argue
  with it — the inputs are all visible.

Every word in that line, in this project's terms
  facet          one property of the task the planner measured
  3              the task touches 3 files (`breadth`)
  new-surface    api/orders/note_service.ts does not exist yet — this task
                 creates it (`novelty`)
  stateful       it holds data between calls, not just if/else (`logic`)
  new-tests      tests must be written, not just updated (`test_surface`)
  fan0/3         it depends on 0 tasks; 3 tasks depend on IT. That is why I
                 called it a keystone, and why it runs alone in wave 1.
  low            the planner's own confidence that the task is uncertain
  57             the total. The table maps [55,65) to Sonnet 5 at high effort.
  band           one row of that table
  wave           a group of tasks that can run at the same time because no
                 two of them write the same file

What this means for you
  Nothing to decide. This was me showing my work before dispatching. If you
  think 57 is wrong — say so, and I will re-score with your correction.

Back to the run. Waiting for your "go" on the wave plan.
```

---

## 3. What to notice

- **It explains, it never re-does.** No agent is dispatched, no file is
  written, no gate changes.
- **It defines words in *your* project's terms**, using `wiki/orc-orientation.md`
  when a wiki exists, so the words match the rest of your docs.
- **The skill itself is deliberately tiny.** A long skill that says "be clear"
  makes a wordy model, because the model copies the length it sees.
- **This lane writes no trace on purpose.** It is the only lane that does not,
  and `orc stats --help` says so — a stated blind spot, not an oversight.

---

## 4. Related

- The words themselves: `orc onboarding lanes`
- The whole walkthrough with no GitHub needed: `orc onboarding`
