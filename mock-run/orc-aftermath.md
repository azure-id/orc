# Mock run — `/orc-aftermath`

> Did the thing we shipped actually hold up?

---

## 1. What it does

Everyone in this industry says the same thing: *coding agents cannot see what
their code does after it ships. The loop is open.*

And everyone tries to close it the same way: connect Sentry, connect Datadog,
buy a monitoring product, wire an MCP server.

There is a cheaper way that nobody uses.

**The repository's own future is a grading signal.** It is free, it works
offline, and it needs no vendor:

| Signal | What it probably means |
|---|---|
| The files we shipped were rewritten a few days later | The change missed something |
| A test we added was deleted or skipped | Someone rejected our proof |
| The commit was reverted | Obvious |
| A promise (`PACT-xxx`) that was HOLDING is now BROKEN | The change leaked |
| Another `/orc` run hit the same area right away | Our slice was wrong |

All of that comes from `git log`, ORC's own trace files, and the pact ledger.
Nothing else.

### The rule that keeps this honest

**Churn is a signal, not a verdict.**

A file being rewritten is a fact. *Why* it was rewritten is not something ORC
can know. Maybe the change was wrong. Maybe the product changed. Maybe someone
found a better way.

So `/orc-aftermath` reports **the signal, and how sure it is.** It never
writes "this change was bad". It never blames a person. It never edits
anything. Read only, report only.

---

## 2. The run

One month has passed. It is now 08-09-2026.

```
> /orc-aftermath --since 30d
```

```
ORC · aftermath

Preflight (silent)
  git history depth : 412 commits — deep enough for a 30-day window
  traces in window  : 6 runs
  pact ledger       : present, 6 promises
  window            : 09-08-2026 → 08-09-2026

I only read. I will not change or fix anything.
```

```
ORC · aftermath · the six runs

  run                                    lane        shipped   grade
  ─────────────────────────────────────────────────────────────────────
  run-orc-partial-refunds-100826         /orc        11 tasks  HELD (weak signal)
  run-mini-cart-badge-140826             /orc-mini    3 tasks  HELD
  run-fast-tooltip-copy-160826           /orc-fast    1 task   HELD
  run-orc-tax-rounding-190826            /orc         7 tasks  CHURN
  run-mini-search-filter-240826          /orc-mini    4 tasks  REVERTED
  run-quick-flag-cleanup-020926          /orc-quick   2 tasks  too recent to grade

  "too recent" = shipped less than 7 days ago. I will grade it next time.
```

```
ORC · aftermath · the two that need your eyes

────────────────────────────────────────────────────────────────────────
CHURN · run-orc-tax-rounding-190826 · /orc · 7 tasks
────────────────────────────────────────────────────────────────────────

  What it promised (from the plan's acceptance criteria):
    "Tax is rounded once, at the order total, never per line item."

  What happened after:
    api/tax/round.ts       shipped 19-08   rewritten 22-08  (3 days)   by Rina
    api/tax/round.ts       rewritten again 27-08  (8 days)             by Rina
    api/tax/__tests__/round.test.ts   3 new cases added 22-08

  Signal strength: MEDIUM
    Two rewrites in 8 days, by the same person, on the same file the run
    shipped. The test file grew, which usually means real cases were found
    that the run did not cover.

  What I can prove:
    - the file changed twice          → yes, git says so
    - the run's own tests still pass  → yes
    - the acceptance criterion holds  → yes, tax is still rounded once

  What I cannot prove:
    - whether the rewrites were fixing our work, or adding new work

  Commit messages, for your reading (I do not read intent into them):
    22-08  "handle negative tax on refunds"
    27-08  "tax rounding: fix banker's rounding on .005"

  My honest read: the second message looks like a correction of our work.
  The first looks like new scope. I am not sure. You will know in 5 seconds.

────────────────────────────────────────────────────────────────────────
REVERTED · run-mini-search-filter-240826 · /orc-mini · 4 tasks
────────────────────────────────────────────────────────────────────────

  Reverted at commit 4f19ba2 on 26-08-2026 (2 days after ship).
  Revert message: "revert search filter — breaks pagination on page 2+"

  Signal strength: HIGH. A revert is not ambiguous.

  What the run did:
    lane        : /orc-mini
    review      : SKIPPED (orc-mini has no review phase — this is by design)
    verify      : SKIPPED (same)
    smoke gate  : GREEN — build passed, 138 tests passed
    boundary    : no card existed for web/search at the time

  The interesting part:
    The smoke gate was green. The tests passed. Nothing in the run was
    wrong by its own rules. The break was in pagination — a different
    folder, with no test that touches search.

    So this is not "orc-mini failed". This is "the repo has no test that
    covers search + pagination together". A review phase probably would
    have caught it by reading. A test would have caught it for sure.

  Two things you could do:
    1  Add a test for search + pagination. Then this class of miss is gone
       for every future run, in every lane.
    2  Add a boundary card for web/search that says ESCALATE until (1) is
       done. Then orc-mini would have flagged it.

  I am not recommending a lane change. /orc-mini did what it says it does.
```

```
ORC · aftermath · promises

  PACT-001  payments never double-written    HOLDING     unchanged all month
  PACT-002  prices are whole cents           HOLDING
  PACT-003  guest checkout works             HOLDING
  PACT-004  refund window 45 days            HOLDING     review due 01-12-2026
  PACT-005  no card number in logs           HOLDING
  PACT-006  refund to original method        UNCHECKABLE  ← still no test, 47 days

  One note: PACT-006 has been UNCHECKABLE since 10-08-2026. It sits on
  api/refunds/payout.ts, which was touched by run-orc-partial-refunds.
  Two separate lanes have now pointed at this same missing test:
    /orc-boundary   marked T04 ESCALATE for this reason
    /orc-budget     showed band [70,80) went 151% over, on that same task

  Three lanes, one finding. That is usually a true finding.
```

```
ORC · aftermath · summary

  6 runs in window · 4 held · 1 churn · 1 reverted · 1 too recent
  Hold rate: 4 of 5 gradeable = 80%

  By lane (small numbers — do not over-read these):
    /orc         2 runs   1 held, 1 churn
    /orc-mini    2 runs   1 held, 1 reverted
    /orc-fast    1 run    1 held

  Wrote: orc-aftermath/2026-09/aftermath.md
  A structured block is included for /orc-retro to read.

Trace: run-aftermath-30d-080926-091455.txt
```

---

## 3. The file it made

### `orc-aftermath/2026-09/aftermath.md`

````markdown
# Aftermath — 09-08-2026 to 08-09-2026

Read-only report from `/orc-aftermath`. No code was changed.
Signals come from git history, ORC traces, and the pact ledger. No telemetry.

## Summary

| | |
|---|---|
| Runs in window | 6 |
| Gradeable (older than 7 days) | 5 |
| Held | 4 |
| Churn | 1 |
| Reverted | 1 |
| Hold rate | 80% |

## Findings

### 1 · CHURN — `run-orc-tax-rounding-190826`
**Signal strength:** medium.
`api/tax/round.ts` was rewritten twice within 8 days of shipping.
The run's acceptance criterion still holds and its tests still pass.
Commit messages suggest one rewrite was new scope and one was a correction.
**Not a verdict.** A human should read the two commits.

### 2 · REVERTED — `run-mini-search-filter-240826`
**Signal strength:** high.
Reverted 2 days after ship. Reason given: pagination broke on page 2+.
The run's smoke gate was green and all 138 tests passed.
The gap was cross-folder: no test covers search together with pagination.
**Not a lane failure.** `/orc-mini` skips review by design and the user
chose it. The missing test is the root cause.

### 3 · STANDING — `PACT-006` uncheckable for 47 days
Three lanes have now independently pointed at the same missing test:
`/orc-boundary` (T04 escalate), `/orc-budget` (band 151% over), and this
report. This is the cheapest high-value fix available in the repo right now.

## For `/orc-retro`

<!-- orc-aftermath:retro -->
```json
{
  "window": { "from": "2026-08-09", "to": "2026-09-08" },
  "runs_graded": 5,
  "outcomes": { "held": 4, "churn": 1, "reverted": 1 },
  "by_lane": {
    "orc":      { "graded": 2, "held": 1, "churn": 1, "reverted": 0 },
    "orc-mini": { "graded": 2, "held": 1, "churn": 0, "reverted": 1 },
    "orc-fast": { "graded": 1, "held": 1, "churn": 0, "reverted": 0 }
  },
  "by_band": {
    "[55,65)": { "shipped": 6, "churned": 2 },
    "[70,80)": { "shipped": 3, "churned": 1 }
  },
  "standing_findings": [
    { "id": "PACT-006", "days_uncheckable": 47, "corroborated_by": ["orc-boundary", "orc-budget"] }
  ]
}
```
<!-- /orc-aftermath:retro -->
````

---

## 4. The CLI part

```
$ orc aftermath status --since 30d
```

```
AFTERMATH · shopcart · 30 days

  runs in window   6
  gradeable        5     (1 shipped less than 7 days ago)
  held             4
  churn            1     run-orc-tax-rounding-190826
  reverted         1     run-mini-search-filter-240826

  hold rate        80%
```

Exit `0` nothing to flag · `1` churn found · `2` a revert found ·
`3` history too shallow to grade.

```
$ orc aftermath status --since 30d --json
```

```json
{
  "window_days": 30,
  "runs_in_window": 6,
  "gradeable": 5,
  "outcomes": { "held": 4, "churn": 1, "reverted": 1, "too_recent": 1 },
  "hold_rate": 0.8,
  "findings": [
    {
      "run": "run-mini-search-filter-240826",
      "signal": "reverted",
      "strength": "high",
      "revert_commit": "4f19ba2",
      "days_after_ship": 2
    },
    {
      "run": "run-orc-tax-rounding-190826",
      "signal": "churn",
      "strength": "medium",
      "files": ["api/tax/round.ts"],
      "rewrites": 2
    }
  ],
  "exit": 2
}
```

**When history is too shallow:**

```
AFTERMATH · cannot grade

  Your git history goes back 12 days. You asked for 30.
  I will not grade a run with a window shorter than 7 days after its ship
  date — the signal is not there yet.

  Try: orc aftermath status --since 7d     (2 runs are gradeable)
```

Exit `3`. Same honesty rule as `/orc-budget`. No data, no answer.

---

## 5. Inside a normal `/orc` run

Aftermath is mostly a **standalone, run-it-monthly** lane. But it does two
things inside `/orc`:

**At Phase 1 preflight**, only when there is something to say:

```
Preflight
  wiki      : FRESH
  pattern   : typescript cached
  pact      : 5 holding · 1 uncheckable
  aftermath : api/tax/ churned after the last run here — 2 rewrites   ← new
```

That line appears **only** if the area you are about to touch has a recent
churn signal. It is not noise on every run. It tells the analyst "be careful
here, the last attempt did not stick".

**It feeds `/orc-retro`.** This is the important seam.

```
/orc-retro · calibration report

  Before:  retro could only see how the PIPELINE ran.
           retries, downgrades, requeues, leaks.

  Now:     retro also sees how the RESULT held up.

  Band [55,65)  sonnet-5-high
    process : 0 downgrades, 1.2 avg repair rounds — looks healthy
    outcome : 2 of 6 shipped tasks churned within 10 days
    reading : the band finishes cleanly but the work does not stick.
              This is a scoring problem, not a model problem.
              Recommend: raise the [55,65) upper edge, or add a facet
              for cross-folder work.
```

**This is the whole point.** Today `/orc-retro` grades how smoothly the machine
ran. A run can look perfect in the trace and still ship something that gets
reverted two days later. Aftermath is the other half of the flywheel.

---

## 6. Why this is good for ORC

**It closes the loop with no vendor.** Everyone else needs Sentry, Datadog, or
a paid backend to answer "did it work?". ORC answers a large part of it with
`git log` and files it already writes. No integration, no account, no cost.
That is a strong story to tell.

**It completes `/orc-retro`.** Retro measures process. Aftermath measures
result. Together they let the score→model table be tuned against **what stuck**
instead of **what ran smoothly**. Nothing else in ORC can give that signal.

**It makes lane choice honest.** In the mock, `/orc-mini` had a revert. The
report does not say "orc-mini is bad" — it says the repo has a missing test and
the user chose a lane with no review. That is a fair and useful thing to learn,
and only a lane that looks *after* the run can learn it.

**Findings that appear three times are true findings.** In the mock, PACT-006
was flagged by boundary, by budget, and by aftermath. Three lanes, three
different methods, same missing test. That kind of agreement is very convincing
to a human, and it comes free once these lanes exist together.

**It is cheap and safe.** Read only. Report only. No model needed for the
counting part; a model is only used to write the plain-English summary. It can
run on a schedule and never break anything.
