# Mock run — `/orc-boundary`

> The lane that says what the AI should **not** try here, and why.

---

## 1. What it does

Every AI coding skill in the world assumes the answer to *"should the AI do
this?"* is **yes**.

Research says this is expensive. Agents that do not know their limits spend
**5 to 50 times longer** than a human expert, and most of that time is spent on
work that was never going to succeed. When you teach an agent to stop early,
performance goes up about **20%** and the wasted time drops about **80%**.

Nobody has shipped this as a skill. `/orc-boundary` ships it.

It gives one of three answers for each piece of work:

| Verdict | Easy English |
|---|---|
| **EXECUTE** | Let the agent do it. It can check its own work here. |
| **ESCALATE** | Let the agent do it, but a named human must look before ship. |
| **REFUSE** | The agent should not try this. Here is what must change first. |

**A REFUSE always says what would make it a yes.** "No" with no "unless" is not
a boundary. It is just a shrug. ORC never does that.

### How ORC decides — no guessing

The verdict comes from four questions, and ORC already has a real answer to all
four. It does not ask the model to feel it out.

| Question | How ORC answers it, for real |
|---|---|
| Can the agent **check its own work**? | Does a test runner exist? Does the build run? Is there a smoke gate? |
| Does the agent **know this area**? | `orc wiki status` coverage · `orc pattern status <lang>` · past traces that touched these files |
| Is it **easy to undo**? | Is it a DB migration, a live payment call, a published package, a deleted row? |
| Is it a **decision, not a fact**? | `_shared/interview.md` already draws this line. A decision belongs to the human. |

---

## 2. The run

Rina has a plan from `/orc-plan`. 12 tasks. She wants to know what is safe to
hand to the agent before she starts an expensive run.

```
> /orc-boundary plan.md
```

```
ORC · boundary

Preflight (silent probes)
  wiki status       : FRESH — 12 docs
  pattern status    : typescript → cached
  test runner       : vitest  (npm test)          → the agent CAN check itself
  build             : npm run build works
  git remote        : origin (github)
  past traces       : 31 runs, 9 touched api/payments
  pact ledger       : 4 holding · 2 uncheckable

Reading plan.md — 12 tasks, 4 waves.
Looking at each task. Read-only. I will not change any file.
```

```
ORC · boundary · verdicts

EXECUTE — 8 tasks
  T01  Add a partial-refund field to the refund form         web/refunds/
  T02  Add the partial amount to the refund API type         api/refunds/
  T03  Translate the 4 new labels                            web/locales/
  T05  Add a unit test for the partial amount                api/refunds/
  T06  Show the partial amount on the receipt                web/receipt/
  T08  Add a red proof for the 45-day window                 api/refunds/
  T10  Update the refund docs page                           docs/
  T11  Add the new field to the admin table                  web/admin/

  Why these are safe: tests exist for all of them, the wiki covers these
  folders, and every change can be undone with `git revert`.

ESCALATE — 3 tasks
  T04  Change the refund payout target
       reason  : PACT-006 covers this file and is UNCHECKABLE.
                 The agent can write the code but cannot prove it is right.
       who     : Rina (code) + Finance (behaviour)
       when    : before ship, not before the wave

  T07  Add a rate limit to POST /refunds
       reason  : no load test exists. The agent can set a number but cannot
                 tell you if that number is correct for real traffic.
       who     : Rina
       when    : before ship

  T09  Call the Stripe refund API with the partial amount
       reason  : this reaches a third party and moves real money.
                 The sandbox key is present, so the agent can work — but a
                 human must confirm the amount rounding before it goes live.
       who     : Rina
       when    : before ship

REFUSE — 1 task
  T12  Backfill partial_amount on 1.4M old refund rows
       reason 1: this is a DB migration that writes to production data.
                 It cannot be undone with git.
       reason 2: no rollback migration exists in db/migrations/.
       reason 3: no staging database is configured in config/app.yaml.

       This becomes EXECUTE when ALL THREE are true:
         [ ] a down-migration file exists next to the up-migration
         [ ] config/app.yaml has a staging database URL
         [ ] the backfill is written to run in batches with a resume point

       Until then this is a human task. I can still WRITE the migration
       for you as a draft that nobody runs — ask me and I will.
```

```
ORC · boundary · cards

Wrote 3 boundary cards:
  .claude/orc/boundary/api-refunds.md
  .claude/orc/boundary/api-payments.md
  .claude/orc/boundary/db-migrations.md

A card is per AREA, not per task. So the next run reads the card instead of
thinking about this again. Cards go stale the same way a wiki doc does — only
when the files they cover actually change.

Trace: run-boundary-partial-refunds-100826-161240.txt
```

---

## 3. The file it made

### `.claude/orc/boundary/db-migrations.md`

```markdown
---
area: db/migrations
anchored_files:
  - db/migrations/**
  - config/app.yaml
verified_commit: c273793
generated_by: orc-boundary
generated_at: 2026-08-10T16:12:40Z
default_verdict: REFUSE
---

# Boundary card — db/migrations

## Default verdict: REFUSE

The agent should not run a migration in this repo yet.

## Why

| Check | Result | Evidence |
|---|---|---|
| Can the agent verify itself? | **No** | No migration test job. `npm test` does not touch the DB. |
| Does the agent know this area? | Partly | Wiki covers the schema, not the migration process. |
| Is it easy to undo? | **No** | No down-migration in any of the 7 files in `db/migrations/`. |
| Is it a human decision? | Partly | Data loss on production is not the agent's call. |

## What would change the verdict

This area becomes **ESCALATE** when:
- [ ] every migration file has a matching down-migration
- [ ] `config/app.yaml` declares a `staging.database_url`

This area becomes **EXECUTE** when the two above are true **and**:
- [ ] a CI job runs migrations up and down against a throwaway database

## What the agent MAY still do here

- Write a migration file as a draft. Nobody runs it.
- Read migrations to understand the schema.
- Suggest the down-migration that is missing.

## Not covered by this card

`db/seeds/` — that is fixture data, graded separately. See
`.claude/orc/boundary/db-seeds.md`.
```

---

## 4. The CLI part

```
$ orc boundary status
```

```
BOUNDARY · shopcart

  api/refunds      ESCALATE   card fresh   (2 open preconditions)
  api/payments     EXECUTE    card fresh
  db/migrations    REFUSE     card fresh   (3 open preconditions)
  web/             EXECUTE    card fresh
  config/          ESCALATE   card STALE   → 4 commits since c273793

  4 areas ready · 1 card needs a refresh
```

Exit code: `2` — because at least one area is REFUSE.

**The exit codes:**

| Code | Meaning |
|---|---|
| 0 | Everything in scope is EXECUTE |
| 1 | At least one ESCALATE |
| 2 | At least one REFUSE |
| 3 | No card, or the card is stale |

```
$ orc boundary status db/migrations --json
```

```json
{
  "area": "db/migrations",
  "verdict": "REFUSE",
  "card_present": true,
  "card_stale": false,
  "verified_commit": "c273793",
  "reasons": [
    { "check": "self_verification", "pass": false, "evidence": "no migration test job" },
    { "check": "reversible", "pass": false, "evidence": "no down-migration in db/migrations/" },
    { "check": "domain_known", "pass": "partial", "evidence": "wiki covers schema, not process" }
  ],
  "preconditions": [
    { "to_reach": "ESCALATE", "items": ["down-migration for every file", "staging.database_url in config/app.yaml"] },
    { "to_reach": "EXECUTE", "items": ["CI job runs migrations up and down"] }
  ],
  "allowed_anyway": ["write a draft migration", "read migrations", "suggest a missing down-migration"],
  "exit": 2
}
```

---

## 5. Inside a normal `/orc` run

**Phase 1 — preflight.** One new line.

```
Preflight
  wiki      : FRESH
  pattern   : typescript cached
  pact      : 4 holding · 2 uncheckable
  boundary  : 8 execute · 3 escalate · 1 refuse      ← new
```

**Phase 3 — waves.** This is where it saves money.

With `boundary_gate: block`:

```
Wave 3 of 4 — dispatching 3 tasks

  T09  Stripe partial refund call        → orc-executor-opus-5-high   [ESCALATE]
  T11  Admin table column                → orc-executor-sonnet-5-high [EXECUTE]
  T12  Backfill 1.4M rows                → NOT DISPATCHED             [REFUSE]

  T12 was lifted out of this wave.
  Reason: db/migrations card says REFUSE — no down-migration, no staging DB.
  It is now in the handback list. The wave continues without it.

  This saved an estimated 1 executor dispatch at opus-5-high
  (~38k tokens) that would have produced code nobody could safely run.
```

At the end of the run:

```
Ship

  Shipped: 11 tasks
  Handed back to you: 1 task

  T12  Backfill partial_amount on 1.4M old refund rows
       I did not attempt this. Here is what to do:
         1. Write db/migrations/0009_backfill_partial.down.sql
         2. Add staging.database_url to config/app.yaml
         3. Re-run `orc boundary status db/migrations` — it should say ESCALATE
         4. Then `/orc-quick` can do the backfill with you watching

  ESCALATE items that need your eyes before merge:
       T04  refund payout target      → PACT-006 has no test
       T07  rate limit number         → no load test
       T09  Stripe amount rounding    → real money
```

### The three settings

```yaml
boundary_gate: off | warn | block
```

- `off` — the lane still works when you call it. `/orc` ignores it.
- `warn` (**default**) — the task is still dispatched, but the card goes into
  the slice so the executor knows the risk.
- `block` — a REFUSE task is never dispatched.

Default is `warn` because `block` changes how existing runs behave, and a
surprise on upgrade is bad. Move to `block` one release later.

### It also fixes `/orc-route`

```
$ /orc-route plan.md
```

```
Recommended lane: /orc

  /orc-fast    NOT POSSIBLE
               reason: the plan has 1 REFUSE task and 3 ESCALATE tasks.
               orc-fast has one executor and no review phase. It cannot
               hold an escalation.
```

Before `/orc-boundary`, routing could only count tasks and scores. Now it can
say *why a lane is not allowed*.

---

## 6. Why this is good for ORC

**It is the only lane in the world that does this.** The research is published
and measured. The skill does not exist. ORC would be first, and the claim is
easy to say out loud: *"ORC is the only agent that tells you what it should not
try."*

**It saves real money on every run.** A REFUSE task is a dispatch that never
happens. In the mock above that is one `opus-5-high` executor — the most
expensive band ORC has. The lane pays for itself the first time it stops one.

**It uses probes ORC already has.** No new machinery. `orc wiki status`,
`orc pattern status`, the smoke gate, the trace corpus, the pact ledger. Every
input already ships. This is why ORC can build it in weeks and a standalone
skill cannot build it at all.

**It makes the other lanes smarter for free.** `/orc-route` gets a hard
constraint. `/orc-ultra`'s judge gets something to score against. `/orc-quick`
can show the card at its dispatch gate. One lane, four upgrades.

**It answers the question every manager is asking in 2026.** *"How much should
I let the AI do?"* Right now the honest answer everywhere is "try it and see".
ORC would give a per-area answer with evidence and a checklist.
