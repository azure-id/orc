---
description: Did what we shipped hold up — graded from the repo's own future, with no telemetry and no verdicts
---

Use the **orc-aftermath** skill. Read-only and report-only: it never edits the
rubric, the config, the code, or a run.

`/orc-retro` measures the **process** — bands, downgrades, retries, gate bounces. It
cannot tell you whether any of it was any good. This measures the **result**, and
together the score→model table can finally be tuned against *what stuck* instead of
*what ran smoothly*.

Everyone reaches for production telemetry. For a large class of outcomes **the
repository's own future is the grading signal**, and it is free:

| Signal | What it suggests | Strength |
|---|---|---|
| the commit was reverted | obvious | 3 |
| a test we added no longer exists | our proof was rejected | 3 |
| a promise anchored in the change is BROKEN | the change leaked | 3 |
| a test we added now contains a skip | the proof was neutralised | 2 |
| 3+ shipped files rewritten in the window | the change likely missed | 2 |
| 1–2 shipped files rewritten | weak — normal iteration looks like this | 1 |

All of it from `git log`, ORC's traces and the pact ledger. No vendor, no
instrumentation, nothing to install.

**Churn is a signal, not a verdict.** A file being rewritten is a fact; *why* is not
knowable from git — somebody may have fixed a real miss, extended a good change, or
reformatted the file. So every run gets three sections: what it **promised**, what
the repo now **shows** (each row with its files, commits or pact ids), and the
strongest AND weakest honest reading of that evidence.

It never writes "this change was bad". **It never names a person** — git knows who
committed and this lane never asks.

Two answers that are answers, not gaps: a run **younger than 7 days** is `too recent
to grade`, and it keeps its slot. `HELD` always carries its caveat — *no churn signal
is not proof it worked, only that nothing came back.*

Output: `orc-aftermath/<period>/aftermath.md`, ending with a structured block
`/orc-retro` aggregates.

Inside `/orc`: **one preflight line, and only when the area about to be touched has a
recent churn signal.** Never noise on a clean run.

Read it back any time: `orc aftermath status [--since 14d]`.

A run slug, `--since 14d`, or nothing for the last `aftermath_window_days`: $ARGUMENTS
