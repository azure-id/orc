# Mock run — `/orc-fix`

> You fixed something, and the fix says something about an earlier review.
> Type this, and ORC records what the fix fixes, so the next review sees it.

---

## 1. What it does

It records ONE fix and what it fixes. It looks at the evidence first: what
found the problem (Sonar, a failed check, a defect, a PR comment) and who wrote
the bad lines (an ORC run, an AI tool, a person). It asks you once. Then it
records the fix and goes back to exactly where you were.

It opens no run of its own. You can type it in the middle of another run, also
while that run waits at a question.

- **A run is open** → it only records. The run you are in makes the fix.
- **No run is open** → it can also make the fix, like `/orc-quick`: you pick
  the agent, the build and the tests must be green, and then it records.

---

## 2. The run

Rina is in an `/orc-quick` run. Sonar flagged `computeTotal()` as too complex,
and those lines came from last week's `/orc-mini` run, which had a review.

```
> /orc-fix this fixes Sonar typescript:S3776 in src/orders/total.ts:40-58
```

```
This fix:  source sonar · introduced by ORC (run-mini-total-290926-101500)
  - a Sonar rule key (typescript:S3776)
  - git blame → 4c1e2a9: the commit falls inside the run's trace window and
    src/orders/total.ts is in the run's changed set
  host run: run-quick-total-fix-021026-091200 — record only, the host lane
  makes the fix

  1. confirm   2. change the class   3. cancel
```

```
> 1
```

```
recorded F-9f2c41ab · sonar typescript:S3776 · introduced by ORC
(run-mini-total-290926-101500) · missed by review run-mini-total-290926-101500
· the next review sees it

Back to the run. Entry 3 is waiting for your "go".
```

The next time a reviewer looks at `src/orders/total.ts`, its card has this line:

```
fix: src/orders/total.ts — Sonar typescript:S3776 after ORC run
run-mini-total-290926-101500 · missed by review
```

---

## 3. What to notice

- **It classifies from evidence, and your word wins.** `orc fix classify` reads
  `git blame`, the traces and the run snapshots. If you change the class, the
  record says `class_by: user`.
- **"Missed by review" is computed.** Every review stores the line ranges it
  read. A fix on those lines, from an earlier run, is a miss. ORC never guesses
  it, and you never type it.
- **A fix is never a review.** The record's author is who FOUND the problem
  (Sonar is a bot, a user report is a person). Review Quality counts reviews
  apart, and shows fixes in their own block: **Fixes after review**.
- **A Sonar fix and the Sonar import are the same row.** With the issue key, the
  record uses the importer's id, so the next `orc gotcha sync` completes it.
- **One trace line.** `orc fix record` writes ONE `FIX` line into the run you
  are in. It never writes the run pointer.

---

## 4. Related

- The panel: `orc ui` ▸ Behaviour ▸ Review quality ▸ **Fixes after review**
- The records: `orc fix list`
- The Sonar import: [gotcha-import](gotcha-import.md)
