---
name: orc-aftermath
description: >
  Did the thing we shipped hold up. Use for "/orc-aftermath", "did that change
  stick", "what did we ship last month and how did it go", "which runs came back".
  Read-only and report-only: it grades past runs from the repository's own future —
  files rewritten soon after, a test we added deleted or skipped, the commit
  reverted, a promise that was HOLDING now BROKEN — all from git log, ORC's traces
  and the pact ledger. No vendor, no telemetry, no instrumentation. Churn is a
  SIGNAL, never a verdict: it reports the signal and its strength, never "this
  change was bad", and never a person's name.
---

# ORC-AFTERMATH

The lane that **measures** — backwards. The missing half of ORC's flywheel.

`/orc-retro` measures the **process**: bands, downgrades, retries, gate bounces,
narration coverage. It cannot tell you whether any of it was any good. Aftermath
measures the **result** — and together the score→model table can finally be tuned
against *what stuck* instead of *what ran smoothly*.

## The insight

Everyone reaches for production telemetry. For a large class of outcomes **the
repository's own future is the grading signal**, and it is free:

| Signal | What it suggests | Strength |
|---|---|---|
| The commit was reverted | obvious | 3 |
| A test we added no longer exists | our proof was rejected | 3 |
| A promise anchored in this change is BROKEN | the change leaked | 3 |
| A test we added now contains a skip | the proof was neutralised | 2 |
| 3+ shipped files rewritten inside the window | the change likely missed | 2 |
| 1–2 shipped files rewritten | weak — normal iteration looks like this | 1 |

All of it from `git log` + the trace corpus + `.claude/orc/pact/ledger.json`.

## The rule that keeps it honest

**Churn is a signal, not a verdict.** A file being rewritten is a fact; *why* is not
knowable from git. Somebody may have fixed a real miss, or extended a good change,
or reformatted the file. The lane reports **the signal and its strength** and stops
there.

It never writes "this change was bad". It never names a person — `git log` knows who
committed and this lane never asks. It never edits anything: not the rubric, not
config, not code, not a run.

**A run younger than 7 days is `too recent to grade`.** That is an ANSWER, not a
gap, and it keeps its slot in the report. So does `history too shallow` when there
are no runs in the window at all.

## Nothing to configure but the window

`aftermath_window_days` (default 30) is how far back it grades. That is the only key
this lane reads besides `log_dir`.

---

## Phases

```
A0  preflight (silent)   log_dir · git work tree · orc pact status --json
A1  scope                a run slug · --since Nd · everything in the window
A2  grade                orc aftermath status --json — the CLI computes; this RENDERS
A3  report               orc-aftermath/<period>/aftermath.md + the /orc-retro block
A4  close                one end-of-run trace packet
```

**A0 opens the run properly.** Write `log_dir/.current` =
`run-aftermath-<slug>-<DDMMYY>-<HHMMSS>.txt` AND `touch the trace file` of that
name in the SAME step. Both, or neither. A lane the protocol declares must be a
lane something OPENS, or every counting tool reports it as a permanent zero.

**A2 does no grading of its own.** `orc aftermath status` is the only engine — the
skill never re-derives a signal, a strength or a grade. Same rule as the wiki tier.

## A3 — the report

Write `orc-aftermath/<period>/aftermath.md` at the project root, where `<period>` is
the window (`last-30d`) or the single run slug. Per run: **what it promised**
(acceptance criteria from the plan, plus any invariants it was told about) versus
**what the repo now shows**. Shape: `references/report.md`.

The report ends with a structured block `/orc-retro` aggregates — that is the whole
point of writing a file rather than only printing.

**Every claim carries its evidence.** A churn row names the files and the commits.
A revert row quotes the revert's subject line. A broken-promise row names the pact
id. An unevidenced signal is not reported at all.

## Where this shows up in `/orc`

**One line at preflight, and only when the area about to be touched has a recent
churn signal:**

```
after : src/payments — 2 shipped files rewritten within 30 days of run store-credit
```

**Never a line on a clean run.** A preflight that reports "nothing to report" on
every run is a preflight people learn to skip, and this one has to be readable the
one time it matters.

At ship it feeds `/orc-retro` alongside `orc budget actual`.

## Behavior trace (always on)

`../_shared/phases/trace.md` (`core`, at run start; `orc lane phases` names
the file and the layers). Lane token `aftermath`, tier **Single-dispatch** —
exactly ONE end-of-run packet, dispatched solo before `.current` is deleted.
At run start write `log_dir/.current` = `run-aftermath-<slug>-<DDMMYY>-<HHMMSS>.txt` AND
`touch the trace file` of that name in the SAME step.
Nothing else about the protocol is restated here; a phase that ends with
`zero new trace lines is a protocol violation`.

## How this lane fails — and the rule that prevents each

| Failure | Prevention |
|---|---|
| It reads as blame | Signals with strengths, never a verdict; no names, ever |
| A normal follow-up commit looks like a failure | 1–2 files is strength 1 and is labelled weak |
| A fresh run is graded as clean | Under 7 days is `too recent to grade`, and it says so |
| It edits the rubric it is measuring | Report-only. It writes one markdown file and nothing else |
| A signal with no evidence | Every row names its files, commits or pact ids |
| It needs a vendor | git log + traces + the ledger. Nothing else |
| Noise on every preflight | The preflight line fires ONLY on a real churn signal |

## Rules this lane always keeps

Report-only · never a verdict · never a person's name · never edit anything · every
signal carries its evidence · `too recent` is an answer · never compute what the CLI
computes.

## Config

Resolve with `orc lane config orc-aftermath --json` and obey `effective`. Never merge
`.claude/orc.config.yaml` yourself, and never re-derive a precedence. Exit ≠ 0 →
say so and use `../_shared/config-precedence.md`'s documented defaults, out
loud. Nothing this lane reads is contested, gated or a stop, so it owes no
preflight line and has no gate to honour.
