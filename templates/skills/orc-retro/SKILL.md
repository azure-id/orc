---
name: orc-retro
description: >
  Retro miner for ORC — closes the behavior-trace flywheel. Use for
  "/orc-retro", "analyze the orc traces", "how well is orc scoring", or "what
  should we tune from the logged runs". Reads the persistent behavior traces
  in log_dir (written when config `logging: true`), aggregates per-band
  outcomes (retries, requeues, needs_context, unmet, downgrades, findings),
  and produces a calibration report with recommendations. READ-ONLY and
  REPORT-ONLY: it never edits the rubric, the skills, or project code — a
  human applies (or ignores) its recommendations. The orchestrator dispatches
  the mining to a subagent — it never mines itself.
---

# ORC-RETRO (trace miner)

The behavior trace exists "for post-hoc skill improvement" — this skill is the
return spoke of that flywheel. It turns the raw `.txt` traces into an answer to
three questions: **is the scoring rubric calibrated? are the workers honest?
where does the pipeline leak?**

Run as Opus 4.8 high (orchestrator). The mining itself is dispatched to
`orc-retro-sonnet-5-high` — cheap, because it reads trace text, not code.

## Hard rules

1. **Read-only, report-only.** Never edit `effort-and-mode.md`, any skill,
   config, or project code. Recommendations are phrased for a HUMAN to apply;
   the retro never self-tunes the system it measures.
2. **You never mine yourself — you spawn.** Dispatch the retro agent with the
   trace file list; you validate the return and write the report.
3. **No traces → say so and stop.** Requires `logging: true` runs to have
   happened: resolve `log_dir` (`../orc/config.md` defaults +
   `.claude/orc.config.yaml`) and list its `*.txt`. Empty → tell the user how
   to enable logging (`orc config set logging true`) and stop. Never invent
   findings from zero data.
4. **This lane does NOT write a trace of its own.** It is the reader of the
   trace system, not a run — it writes no run pointer and emits no markers
   (tracing the retro would pollute the very data it mines).
5. **Small-sample honesty:** every aggregate states its n. A recommendation
   from n<3 runs is labeled "weak signal — gather more runs", never stated as
   a conclusion.

## Procedure

1. Resolve `log_dir`; collect `*.txt` traces (all, or the user-named subset /
   date range from `$ARGUMENTS`). Show the count and ask nothing else.
2. Dispatch `orc-retro-sonnet-5-high` with the slice: trace file paths + the
   verb reference (`../orc/references/trace-protocol.md`). The agent parses
   the CLOSED verb set and aggregates:
   - **Band calibration** (from `OUTCOME` lines): per band — task count, avg
     retries/requeues/needs_context/unmet. High retries in a band = the band's
     model is too weak (or slices too big); all-zeros in a high band = maybe
     over-tiered (cost leak).
   - **Tier integrity** (from `VERIFY` lines): every `⛔ DOWNGRADE`, grouped by
     agent — the "main session below Opus" bug leaves this exact fingerprint.
   - **Pipeline leaks:** `QUESTION`/`CONTEXT-GAP` clusters (over-asking, slices
     missing context), `REPLAN` reasons, `FINDING p0..p3` and `VERDICT fail`
     rates per run, runs with `SPAWN`s but no `FINISH` (aborted/never closed).
   - **Trace hygiene:** skeleton `SPAWN`/`RETURN` pairs with no orchestrator
     `DISPATCH`/`VERIFY` around them (rich markers being forgotten).
3. Validate the return (contract below). Write the report to
   `log_dir/retro/<DDMMYY>-report.md` (the `retro/` subfolder keeps the
   trace folder's top level `.txt`-only) and show the user the summary:
   verdict per question, the per-band table, and each recommendation with its
   evidence line counts + n.

## Return contract (the agent emits EXACTLY this; you validate)

- `runs_analyzed`, `tasks_analyzed` — the n behind everything
- `band_stats[]` — {band, model, tasks, avg_retries, avg_requeues,
  avg_needs_context, avg_unmet}
- `downgrades[]` — {agent, expected, actual, run}
- `leaks[]` — {kind: question-cluster | context-gap | replan | verdict-fail |
  unfinished-run | hygiene, evidence (trace file + line numbers), count}
- `recommendations[]` — {finding, suggested_change (which file/table a human
  would edit — e.g. an effort-and-mode.md adjuster or a preset boundary in
  config.md), confidence: strong|weak (weak when n<3)}
- `actual_model` — quoted VERBATIM from the system prompt's "The exact model
  ID is …" line (`unknown` if absent, never guessed)
- `actual_effort` — `$CLAUDE_EFFORT`

Malformed = failure (re-dispatch once, then surface). A recommendation without
evidence line references is dropped — the retro obeys the same
evidence-or-advisory rule it audits.
