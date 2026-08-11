# A normal day — what it looks like when all six new lanes are installed

> One normal day. One normal run. `/orc-pact`, `/orc-boundary`, `/orc-handoff`,
> `/orc-budget`, `/orc-aftermath` and `/orc-export` are all installed, plus
> the wiki partial refresh.

This is the file that answers: **so what actually changes?**

The other six files each show one lane alone. That is not how you will meet
them. You will meet them all at once, inside a run you were going to do anyway.

---

## 1. The setup

```
$ orc --version
orc 0.53.0

$ orc doctor
  ✓ install manifest current   (40 agents, 29 skills)
  ✓ settings wiring present
  ✓ trace pointer clean
  ✓ AGENTS.md current
```

Same project as the other files: **shopcart**, a small web shop.
Same two people: **Rina** (developer) and **Budi** (product manager, does not
read code).

Config, all defaults except two:

```yaml
boundary_gate: block          # Rina moved this up from `warn` after one month
wiki_scan_tier: ladder
```

Today's job: **"let customers take a refund as store credit instead of money
back."**

This touches the front end, the back end, the database, and money. It is a
good test, because it hits every new lane at once.

---

## 2. The run, from start to end

### Phase 1 — preflight

This is the screen that changed the most. Six lines instead of three.

```
> /orc  add store credit as a refund option
```

```
ORC · run-orc-store-credit-081026-093012

Preflight
  wiki       : FRESH — 14 docs · 8 in active use · 2 pending refresh, est. $0.14
  pattern    : typescript cached (02-09-2026)
  crosslink  : none configured
  pact       : 5 holding · 1 drifted · 0 uncheckable          ← 01
  boundary   : 3 areas execute · 1 escalate · 1 refuse        ← 02
  aftermath  : api/refunds/ churned after the last run here   ← 05

Three of those need a word before we start.

  1  PACT-004 is DRIFTED.
     "A refund is only allowed inside 45 days."
     api/refunds/window.ts changed 4 days ago and we owe it a re-check.
     It takes 4 seconds and costs nothing. I will run it now unless you say no.

  2  db/migrations is REFUSE.
     Store credit almost certainly needs a table. I will plan the migration
     as a draft that nobody runs, and hand it to you at the end.
     (This is boundary_gate: block. Set it to warn to change this.)

  3  api/refunds/ churned after run-orc-tax-rounding-190826 — the file was
     rewritten twice in the 8 days after we shipped there. Something about
     that area is harder than it looks. I will tell the analyst.

  Continue?  [yes] / stop / change something
```

```
> yes
```

```
Preflight · re-check

  PACT-004  npm test -- refund-window     ✓ pass   → HOLDING
            re-anchored at 3b71ce2

  pact now: 6 holding · 0 drifted · 0 uncheckable
```

**Note what happened.** A free 4-second check cleared a stale promise before
one token was spent on planning. Last year that promise would have sat
forgotten and the planner would never have known about it.

**And PACT-006 is gone from the uncheckable list.** In the `/orc-aftermath` mock it had been
uncheckable for 47 days, flagged by three lanes. Someone finally wrote the
test. This is what the flywheel looks like when it works.

---

### Phase 2 — intake and the price tag

```
ORC · intake

The analyst asked 4 questions. You answered. Spec is settled.
The planner produced 14 tasks in 5 waves.

Two promises point at files this plan touches. They are now hard constraints
for the planner:                                                        ← 01

  PACT-004  refund window is 45 days (temporary, review 01-12-2026)
  PACT-006  refund money goes back to the original payment method

  ⚠ PACT-006 is interesting here. "Store credit" is NOT the original payment
    method. This plan may break a promise you made in July.

    Is store credit an exception to PACT-006, or does PACT-006 need to change?

      1  It is an exception. Store credit is opt-in, the customer chooses it.
      2  PACT-006 needs to change. Rewrite it.
      3  Stop and think about this.
```

```
> 1
```

```
  Recorded. PACT-006 gains an exception clause and a new test case is added
  to the plan (T13) that proves the exception is explicit and opt-in.
  A promise was not quietly broken. That is the whole point of the ledger.
```

Then the budget:

```
ORC · intake · cost                                                     ← 04

  14 tasks · 5 waves · pause after every 2 waves
  Your plan: Max 20x. Primary unit: quota.

  lane          raw tok   weighted   quota    usd p50   time      note
  ──────────────────────────────────────────────────────────────────────────
  /orc-ultra     3.10M     1.38M      45%     $16.80    38–62m   more than needed
  /orc           1.64M      752k      24%      $7.90    22–36m ← recommended
  /orc-mini      0.58M      266k       9%      $2.60    11–18m   no review on money
  /orc-fast      not possible                                    1 REFUSE, 2 ESCALATE

  T12 (the migration) is REFUSE and will not be dispatched.
  Without it: 1.34M raw · 614k weighted · 20% of window · $6.45 → $10.10.

  token split, p50, on /orc
    input        71k   ( 4%)      cache write   484k  (30%)
    cache read  979k   (60%)      output        103k  ( 6%)
    cache read is 60% of the count and 12% of the cost. Budget on the
    weighted number, not the raw one.

  Confidence: good in 6 bands, fair in 1, LOW in 1.
  Band [90,100] has 4 samples. The top of the range is soft.
  Unattributed in the corpus: 2.4%.

  Context: no task above 78% of its window. Nothing at risk.

  1  Start on /orc      614k weighted · 20% of window · $6.45 → $10.10
  2  Switch to /orc-mini
  3  Change the plan first
```

```
> 1
```

**Before all this, that screen said:** *"14 tasks, 5 waves, pause after 2.
Continue?"* Now it has a token ledger, the unit Rina is actually billed in, a
lane comparison, a context-risk check, and an honest note about which numbers
are soft.

---

### Phase 3 — waves

```
Wave 1 of 5 — 3 tasks

  T01  TDD: red proof for store-credit refund      sonnet-5-high   [EXECUTE]
  T02  TDD: red proof for the PACT-006 exception   sonnet-5-high   [EXECUTE]
  T03  Add the store_credit type to the API        sonnet-4-6-high [EXECUTE]

  wiki: orc-feature-refunds.md → T01, T02, T03
```

```
Wave 3 of 5 — 3 tasks

  T08  Call the credit ledger on refund      opus-4-8-high   [ESCALATE]
       card: api/refunds — this touches money and PACT-006's new exception.
       Rina must read this before ship.

  T09  Show the store-credit option in the UI   sonnet-4-6-high [EXECUTE]

  T12  Create the store_credit table            NOT DISPATCHED  [REFUSE]     ← 02
       db/migrations card: no down-migration, no staging database.
       Lifted out of the wave. The wave continues with 2 tasks.

       I will still write db/migrations/0011_store_credit.sql as a DRAFT.
       Nobody runs it. It is yours to review and run.
```

At the pause:

```
Pause after wave 2 of 5

  Burned so far : 267k weighted · 8% of window · $2.14                    ← 04
                  (forecast to here 238k–390k · 7–12%)
  Left to go    : 347k → 610k weighted · 11–19% of window
  Inside the forecast.

  Waves done    : 2 of 5
  Tasks done    : 6 of 13 dispatched (1 refused)

  1  Continue     2  Stop here     3  Show me what changed so far
```

---

### Phase 5 and 6 — review, verify, promises

```
Phase 5 · review        12 files · 3 findings (1 P1, 2 P3)
                        P1: the store-credit path skips the idempotency guard
                        → sent back to T08, repaired, re-reviewed, clean

Phase 6 · verify
  build                 ✓
  tests                 ✓  158 passed (14 new)
  TDD gate              ✓  both red proofs went green
  acceptance criteria   ✓  6 of 6

  pact re-check — only what this change touched                          ← 01
    PACT-001  payments never double-written     ✓ HOLDING
    PACT-004  refund window 45 days             ✓ HOLDING
    PACT-006  refund to original method         ✓ HOLDING
              exception recorded: store credit, opt-in, proved by T02

  boundary re-check                                                      ← 02
    api/refunds  ESCALATE → still ESCALATE. Rina must read T08.
    db/migrations REFUSE  → unchanged. The draft migration is waiting.
```

---

### Phase 7 — ship, and the five new closing lines

```
ORC · ship

  Shipped 12 tasks. 19 files changed. Branch: feat/store-credit

  ── Before you merge ────────────────────────────────────────────────

  1  Read this one yourself                                            ← 02
     T08  api/refunds/credit.ts — the credit ledger call.
     Why: it touches money and it is the first code under PACT-006's
     new exception. The reviewer passed it. A human should still look.

  2  Handed back to you, not attempted                                 ← 02
     T12  Create the store_credit table.
     Draft written: db/migrations/0011_store_credit.sql — NOT run.
     To let ORC do this next time:
       ☐ add 0011_store_credit.down.sql
       ☐ add staging.database_url to config/app.yaml
       ☐ add a CI job that runs migrations up and down
     Then `orc boundary status db/migrations` will say ESCALATE.

  ── Small things ────────────────────────────────────────────────────

  3  2 of these files were GREEN self-serve surfaces                   ← 03
       web/locales/en.json
       web/locales/id.json
     Next time a product manager can change those text strings alone,
     with /orc-handoff or the Self-serve panel. No run needed.

  4  The wiki is now 3 docs behind — 79k tokens / $0.20                ← wiki
     This run changed api/refunds/ and web/checkout/.
       orc-feature-refunds.md   TOUCHED  6 files  used 17/20  deep   46k  $0.14
       orc-feature-checkout.md  TOUCHED  2 files  used  9/20  light  21k  $0.04
       orc-reference-config.md  TOUCHED  1 file   used  2/20  light  12k  $0.02
     Free first:  [ orc wiki sync ]  — registration only, 0 tokens
     Then:        /orc-wiki refresh --top 1   (46k covers 17 of 28 recorded uses)

  5  AGENTS.md is stale — 2 sources moved                              ← 06
     Cursor and Codex on this team are reading the old version.
     Fix: orc export     (3 seconds, no tokens)

  ── Cost ────────────────────────────────────────────────────────────

              forecast p50          actual          diff                 ← 04
  raw          1.34M tokens         1.47M           +10%
  weighted       614k                670k           +9%   inside p90
  quota           20% of window       22%
  usd           $6.45               $7.02
  time          22–36 min           27 min

  cache read    60% of raw forecast → 58% actual   (cache behaved)
  output        103k forecast → 129k actual  (+25%) ← the repair round

  Band [80,90) ran +22% weighted — T08 needed one repair after the P1
  finding, and a repair is almost pure output tokens. That is why the
  money moved more than the token count did.

  Fed to /orc-retro. That band now has 7 samples.
```

---

## 3. What changed, line by line

Here is the same run, before and after, side by side.

| Moment | v0.45.0 (today) | v0.53.0 (all shipped) |
|---|---|---|
| Preflight | 3 lines: wiki, pattern, crosslink | 6 lines. A stale promise is re-checked free. A REFUSE area is named. A past churn warning is passed to the analyst. |
| Intake | "14 tasks, 5 waves. Continue?" | Plus a token ledger per lane in the unit you are billed in, a context-risk check, a confidence note, and two promises turned into planner constraints |
| **A promise about to break** | Nobody notices. It breaks in November. | ORC asks one question at Phase 2 and adds a test |
| Wave dispatch | All 14 tasks dispatched | 13 dispatched. The one nobody could safely run is lifted out and drafted instead |
| Pause | "Continue?" | Plus spend so far vs forecast |
| Verify | build + tests + criteria | Plus a re-check of only the promises this change touched |
| Ship | "Shipped 12 tasks" | Plus what to read, what was handed back with a checklist, what a PM could have done alone, the wiki debt with a price, and a stale export warning |
| After ship | nothing | Cost forecast vs actual, fed to retro. Aftermath will grade this run in 7 days. |

---

## 4. The rhythm — a month with all of it

None of these lanes are things you run every day. Here is the real shape.

### Every run — automatic, no extra work

- Preflight shows pact, boundary, wiki debt.
- Free promise re-checks happen before any spending.
- REFUSE tasks are not dispatched.
- Ship names the wiki debt and the export staleness.

**Extra time cost: about 10 seconds. Extra token cost: zero** — all of this is
CLI arithmetic on files ORC already writes.

### Weekly — 2 minutes

```
$ orc pact status         # any promise drifted?
$ orc wiki debt           # how far behind is the wiki?
$ orc export --check      # is AGENTS.md still telling the truth?
```

All three are free and instant. If they are all green, you are done.

### After a few runs — pay a little

```
/orc-wiki refresh --top 2        ~$0.20 · 2 minutes
```

The debt list makes this a small habit instead of a scary $6 event once a
quarter. **That is the real budget win** — not a cheaper full refresh, but a
full refresh you never need.

### Monthly — 5 minutes

```
/orc-aftermath --since 30d       # did last month's work hold up?
/orc-retro                       # process + result together now
```

### When something changes shape — rare

```
/orc-boundary                    # after adding a staging DB, a CI job, a test runner
/orc-pact                        # after a grill or brainstorm session
/orc-handoff                     # after a big refactor moves the safe surfaces
```

---

## 5. Budi's week — the non-developer side

Budi never opens a terminal. He opens the browser panel.

**Monday.** He opens `orc ui` → **Promises**. He reads six sentences about what
the system guarantees. One says *"refund money goes back to the original payment
method — exception: store credit, opt-in"*. He now knows, without asking Rina,
that store credit shipped and how it behaves.

**Tuesday.** Support says the empty-cart message sounds cold. Budi opens
**Self-serve**, searches "empty cart", edits the English and the Indonesian,
clicks Preview, then Apply. The check runs and passes. He copies the two git
commands and sends them to Rina in chat.

Time: 3 minutes. Before: a ticket, and three days.

**Wednesday.** He needs a number for a planning meeting. He opens **Stats →
Cost** and picks the plan file. The panel has three buttons — Tokens, Quota,
USD. His team is on Max 20x, so Quota is already selected: store credit used
**22% of a 5-hour window** and took 27 minutes. He clicks USD to get $7.02 for
the finance slide. He writes both in the deck.

**Thursday.** He wants a small copy change in an order email. **Self-serve**
shows it as 🔴 RED with a plain reason: *"looks like text, but it is code — a
rule inside decides which lines show."* It tells him to ask Rina, and offers to
save his exact wording as a note so Rina only pastes it. He does that.

He was told no, and it did not feel like a wall.

**Friday.** The **Boundary** panel has one red card: `db/migrations`. He reads
the three-item checklist. He now understands why the AI does not touch the
database, in concrete terms, and he can put "add a staging database" on the
roadmap with a real reason behind it.

**None of this needed Rina.** That is the change.

---

## 6. The compounding — one problem, four lanes

This is the effect that is invisible when you read the lanes one at a time.

In these mocks, one small thing — *"PACT-006 has no test"* — was found four
different ways:

| Lane | How it found it | When |
|---|---|---|
| `/orc-pact` | Refused to mark it HOLDING. Printed `UNCHECKABLE`. | 10-08 |
| `/orc-boundary` | Marked that task ESCALATE — the agent could not check itself. | 10-08 |
| `/orc-budget` | Band `[70,80)` ran **151% over**. The executor had nothing to check against, so it guessed and got requeued twice. | 10-08 |
| `/orc-aftermath` | Still uncheckable 47 days later, and named the other two lanes. | 08-09 |

Four methods. One cause. One cheap fix: write the test.

By the run in this file, the test exists, and:
- the promise is HOLDING
- the area is EXECUTE instead of ESCALATE
- that band's cost went back to forecast
- and a new store-credit exception could be added **safely**, because there was
  finally something to prove it against

**One test. Four improvements.** No single lane could have made that case
convincingly. That agreement is the product.

---

## 7. The money, honestly

Rough monthly numbers for a team doing about 20 runs a month.

### What the new lanes cost

Most of them cost **nothing**, because they are CLI arithmetic on files ORC
already writes. Only the four that dispatch an agent cost anything.

| Lane | When it runs | Weighted tokens | USD | Quota |
|---|---|---|---|---|
| `orc pact status` / `check` | every run + weekly | **0** | **$0** | **0%** |
| `/orc-pact` reconcile | ~2×/month | 34k each | ~$0.30 | ~1% |
| `orc boundary status` | every run | **0** | **$0** | **0%** |
| `/orc-boundary` cards | ~1×/month | 62k | ~$0.60 | ~2% |
| `orc handoff surfaces` | when asked | **0** | **$0** | **0%** |
| `/orc-handoff` map | ~1×/month | 27k | ~$0.25 | ~1% |
| `orc budget forecast/actual` | every run | **0** | **$0** | **0%** |
| `/orc-aftermath` | monthly | 44k | ~$0.40 | ~1% |
| `orc export` | weekly | **0** | **$0** | **0%** |
| **Total added** | | **~201k/month** | **~$2.15** | **~6% of one window** |

### What they save

| Saving | How | Weighted tokens | USD |
|---|---|---|---|
| REFUSE tasks never dispatched | ~1 per 3 runs, often in a top band | −740k | −$8 |
| Fewer repair loops | executors get promises + cards in the slice | −460k | −$5 |
| Fewer compactions | context risk flagged before the wave, not after | −180k | −$2 |
| Wiki: light tier on small deltas | ~40% off each refresh | −370k | −$4 |
| Wiki: never a full refresh | debt cleared in small pieces | −560k | −$6 |
| Wiki: 2 dead docs retired | never scanned, and never in a slice again | −185k | −$2 |
| Right lane chosen, with a price | fewer `/orc-ultra` runs "just in case" | −920k | −$10 |
| **Total saved** | | **~3.4M/month** | **~$37** |

**Net: about 3.2M weighted tokens saved per month, on a 201k investment.**
In dollars, about **$35 saved on a $2 spend**. On Max 20x, roughly **a whole
5-hour window given back per month.**

Two notes on reading this:

- **The two wiki lines are the biggest single block** (−1.1M). That is the
  argument for shipping W1 in the middle of the sequence rather than last.
- **"Fewer repair loops" is worth more than it looks.** A repair round is almost
  pure *output* tokens, the most expensive kind. It moves the bill about twice
  as much as it moves the token count.

And all of this is still the small part. The bigger saving is the reverted run
in the `/orc-aftermath` mock — one revert costs a developer half a day, which is worth more than
a whole month of tokens.

---

## 8. What does NOT change

Just as important. If you install all of this:

- **No lane you use today behaves differently by default.** `boundary_gate`
  ships as `warn`, not `block`. Rina had to turn it up herself.
- **No new agent is added** except one wiki scanner for the cheap tier.
- **Nothing runs automatically.** Every paid action is still a thing you ask
  for. The panel still never runs a lane.
- **The effort guard is unchanged.** It still matches the exact name `orc`.
- **`/orc-quick` is still standalone** and still ignores every config key.
- **No lane blocks you.** Boundary at `block` skips a dispatch — it never stops
  the run and never refuses your direct instruction.
- **Traces, run state, checkpoints, resume** — all unchanged. These lanes read
  them; they do not change how they are written.

---

## 9. Where this could go wrong

An honest list. Each one needs a decision before building.

**1 · Preflight becomes noise.**
Six lines is already a lot. At ten lines people stop reading, and then a real
warning is invisible.
*Rule to hold:* a lane only gets a preflight line when it has something to say.
`aftermath` in the mock above prints **only** because the area being touched
churned. On a clean run it prints nothing.

**2 · The pact ledger becomes a second wiki.**
If every small decision becomes a promise, the ledger grows to 80 entries and
nobody reads it.
*Rule to hold:* only `constraint`-tagged decisions become promises, never
`intent`. And the ledger is reviewed — retirement is offered, not forbidden.

**3 · Boundary at `block` blocks the wrong thing.**
A wrong REFUSE is worse than no boundary at all, because it stops real work.
*Rule to hold:* the checklist makes every refusal falsifiable, and `warn` is the
default for at least one release. Watch `/orc-retro` for tasks that were
refused and then done by hand with no trouble — that is a mis-calibration
signal.

**4 · Self-serve writes something bad.**
The whole safety argument is "a check exists". A weak check that passes is worse
than no check.
*Rule to hold:* AMBER exists precisely for this. If ORC is not sure the check is
strong, the surface is AMBER, and AMBER always shows the human check as a task
— never as a pass.

**5 · The budget forecast gets trusted too early, or in the wrong unit.**
A number on a screen looks true. And a dollar figure shown to a Max user is a
number they will quietly ignore, which is worse than showing nothing.
*Rules to hold:* `insufficient history` is printed, not hidden. The range is
never collapsed into one number. Tokens are always available, and cache-read is
always separable — a blended count re-hides the thing the four-way split exists
to expose. No dollar figure without a dated price table, no quota figure without
a known plan, and `unattributed` is always shown.

**6 · The light wiki tier misses something.**
A cheap scanner writes a shallow doc, and the wiki quietly gets worse.
*Rule to hold:* `wiki_scan_tier: always_deep` restores today's behaviour
exactly, the tier is always printed, and STRUCTURAL is always deep. Watch the
integrity self-check failure rate per tier.

---

## 10. One sentence

**Before:** ORC is a very good build pipeline that forgets everything the moment
a run ends.

**After:** ORC is a build pipeline that remembers what you promised, knows what
it should not try, tells you the price first, checks later whether the work
held up, and lets the person who cannot read code change the things that are
safe to change.
