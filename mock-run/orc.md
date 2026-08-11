# Mock run — `/orc`

> The full pipeline: understand → plan → score → build in parallel → review →
> verify → ship.

Use this when the job is a real feature, not a one-line fix.

---

## 1. What it does

`/orc` never writes code itself. It is the **coordinator**. It splits the work
into tasks, gives each task a score from 0 to 100, and sends each task to the
**cheapest model that can still do it**. Tasks that do not touch the same files
run at the same time (a "wave").

It writes everything to disk as it goes, so you can stop any time and come back
tomorrow — even in a brand new chat.

---

## 2. The run

Rina wants order notes on the checkout page and a new API field.

```
> /orc add order notes: a note field on checkout, saved with the order,
  shown on the order page
```

### Phase 0 — Intake (it asks, you sign off)

```
Run folder:  .claude/orc/run/order-notes/

I read the repo: TypeScript, vitest, Express. I will not ask you about that.
Size looks medium. Four questions, one round:

  1  What must exist when this is done?
  2  What is NOT part of this?
  3  How will we know it works?
  4  Any file or pattern to stay away from?

> 1 note box on checkout + note saved + note shown on order page
> 2 no editing a note after the order is placed, no admin view
> 3 a new order keeps its note after a page reload
> 4 follow api/orders/, do not touch api/payments/

Draft written: .claude/orc/run/order-notes/intent-spec.md
Sign-off:  gate (I stop until you approve)  or  soft?

> gate

Approved.
```

### Phase 1 — Planning

```
Planner: ORC's own planner.

5 tasks. Every file path checked against the real repo:
  14 of 15 paths exist. `api/orders/note_servce.ts` does NOT exist (typo).
  → plan sent back to the planner → corrected to note_service.ts ✓

TDD: 3 tasks get a red-proof task first. 2 do not:
  T4  covered-by-existing → api/orders/orders.test.ts:120 (checked, it exists)
  T5  no-behavior         → a string in web/locales/en.json
```

### Phase 2 — Scoring (arithmetic, not opinion)

```
Task                                   facets                     score  model
T1 order note column + migration       3 files · new · stateful     62   sonnet-5 high
T2 POST /orders accepts note           2 files · imitate            38   sonnet-4-6 med
T3 checkout note box                   2 files · imitate            35   sonnet-4-6 med
T4 order page shows the note           1 file  · mechanical         12   haiku-4-5
T5 label text                          1 file  · mechanical          4   haiku-4-5

Waves:  W1 {T1}   W2 {T2, T3}   W3 {T4, T5}
Pause every 2 waves. OK to start?

> yes
```

### Phase 3 — Building

```
▶ W1  orc-executor-sonnet-5-high (T1)
      40% … 100%   returned: build green, `npx vitest run db/` exit 0
      answered as: claude-sonnet-5 / high          ✓ matches what I asked for

▶ W2  two agents at the same time
      T3 asked me a question: "note max length?"  → your call:

      > 500 characters

      Answered. Both returned ✓. No two tasks touched the same file.

⏸  PAUSE (2 waves done)
   Checkpoint saved. To continue in a fresh chat, paste this:

   | Continue ORC run `order-notes`.
   | Read .claude/orc/run/order-notes/state-of-play.md, then checkpoint.json.
   | Do not re-plan. Do not redo finished tasks.

> continue

▶ W3  two haiku agents → done. 5 of 5 tasks complete.
```

### Phases 5–6 — Review, then verify

```
Review (orc-reviewer-opus-5-med):
  P1  note is not length-checked on the server — api/orders/create.ts:44
      I re-read line 44 myself. The quote matches. Fix it?   > yes
  P3  naming nit ×2  (counted, not fixed)

Verify (orc-verifier-opus-5-med) — against YOUR definition of done:
  note saved         ✓  orders.test.ts:131
  note survives F5   ✗  no test covers a reload  → P0, fixed once, re-checked ✓
  PASSED   18/18 tests green
```

### Phase 8 — Ship

```
Branch feat/order-notes. Commit? Push? Open a PR?   > yes to all
Ticket / title / target?   > SHOP-214 / Add order notes / develop

✓ committed  ✓ pushed  ✓ PR body written from your pr.md template

5 tasks · 3 waves · 5 subagents · 1 pause · 1 question to you · 0 downgrades
```

---

## 3. What to notice

- **The orchestrator never wrote a line of code.** Even the 4-point label task
  went to a subagent. That is what keeps it able to run for hours.
- **A bad file path was caught before any agent started.** The planner claimed
  `note_servce.ts`; ORC checked the disk and bounced the plan.
- **The score picked the model, and the trace proves what answered.** Every
  return says which model really replied, so a silent downgrade is visible.
- **The pause is real.** It stops. It does not "keep going a bit more".

---

## 4. Related

- The dense, annotated version of this run (written for the model, not for
  people): [`templates/skills/orc/examples/full-run-mock.md`](../templates/skills/orc/examples/full-run-mock.md)
- Smaller job? [`/orc-mini`](../templates/skills/orc-mini/examples/mini-run-mock.md)
- Not sure which lane? [`/orc-route`](orc-route.md)
