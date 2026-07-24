---
name: orc-retro
description: >
  Retro miner for ORC — closes the behavior-trace flywheel. Use for
  "/orc-retro", "analyze the orc traces", "how well is orc scoring", or "what
  should we tune from the logged runs". Reads the persistent behavior traces
  in log_dir (behavior-trace logging is permanent — every run writes one), aggregates per-band
  outcomes (retries, requeues, needs_context, unmet, downgrades, findings),
  and produces a calibration report with recommendations. READ-ONLY and
  REPORT-ONLY against the local system: it never edits the rubric, the skills,
  or project code. The report is DELIVERED upstream — filed as a PR (issue
  fallback) to the ORC repo (`retro_repo` config, default azure-id/orc) in
  AI-readable markdown, via the gh CLI or a GitHub MCP. P0 preflight: if
  NEITHER delivery channel exists, the retro does not run at all. The
  orchestrator dispatches the mining to a subagent — it never mines itself.
---

# ORC-RETRO (trace miner)

The behavior trace exists "for post-hoc skill improvement" — this skill is the
return spoke of that flywheel. It turns the raw `.txt` traces into an answer to
three questions: **is the scoring rubric calibrated? are the workers honest?
where does the pipeline leak?**

Run as Opus 4.8 high (orchestrator). The mining itself is dispatched to
`orc-retro-sonnet-5-high` — cheap, because it reads trace text, not code.

**Worked example** (orient only — never execute from it): `examples/retro-mock.md`.

## Hard rules

0. **P0 preflight — a delivery channel or no retro at all.** The report exists
   to land in the ORC repo's PRs/issues where the maintainer (or an AI reading
   the repo) can act on it; a retro that can't deliver is pointless. BEFORE
   resolving traces or dispatching anything, probe in order:
   - **gh CLI:** `gh --version` succeeds AND `gh auth status` reports a logged-in
     account → channel is `gh`.
   - **GitHub MCP:** otherwise, check the session's available tools for a GitHub
     MCP server (tool names like `mcp__github__*` / create_pull_request /
     create_issue) → channel is `mcp`.
   - **Neither → STOP.** Do not mine, do not spawn, do not write a local report.
     Tell the user: install + auth the gh CLI (`gh auth login`) or connect a
     GitHub MCP server, then re-run `/orc-retro`.
1. **Read-only, report-only against the local system.** Never edit
   `effort-and-mode.md`, any skill, config, or project code. Recommendations
   are phrased for a HUMAN (or the ORC repo's AI) to apply; the retro never
   self-tunes the system it measures. Its ONLY write outside `log_dir` is the
   upstream PR/issue delivery below.
2. **You never mine yourself — you spawn.** Dispatch the retro agent with the
   trace file list; you validate the return and write the report.
3. **No traces → say so and stop.** Requires ORC runs to have happened (logging
   is permanent, so any past run left a trace): resolve `log_dir`
   (`../orc/config.md` default + `.claude/orc.config.yaml`) and list its `*.txt`.
   Empty → tell the user no runs have been traced yet and stop. Never invent
   findings from zero data.
4. **This lane does NOT write a trace of its own.** It is the reader of the
   trace system, not a run — it writes no run pointer and emits no markers
   (tracing the retro would pollute the very data it mines).
5. **Small-sample honesty:** every aggregate states its n. A recommendation
   from n<3 runs is labeled "weak signal — gather more runs", never stated as
   a conclusion.

## Procedure

0. **Preflight (hard rule 0):** establish the delivery channel (`gh` or `mcp`).
   No channel → stop here. Resolve `retro_repo` with the other config keys.
1. Resolve `log_dir`; collect `*.txt` traces (all, or the user-named subset /
   date range from `$ARGUMENTS`). Show the count and ask nothing else.
2. Dispatch `orc-retro-sonnet-5-high` with the slice: trace file paths + the
   verb reference (`../orc/references/trace-protocol.md`). The agent mines the
   `<trace>.jsonl` sidecar first when present (structured — no regex over free
   text) and falls back to `.txt` parsing for pre-v0.32.0 traces, merging the
   hook's `.txt`-only skeleton lines by timestamp. It parses the CLOSED verb set
   and aggregates:
   - **Band calibration** (from `OUTCOME` lines): per band — task count, avg
     retries/requeues/needs_context/unmet. High retries in a band = the band's
     model is too weak (or slices too big); all-zeros in a high band = maybe
     over-tiered (cost leak).
   - **Tier integrity** (from `VERIFY` lines): every `⛔ DOWNGRADE`, grouped by
     agent — the "main session below Opus" bug leaves this exact fingerprint.
   - **Gate bounce rates** (from `GATE` lines): per gate name (grounding /
     coverage / graph / evidence / derivation) — pass vs bounce counts. A high
     bounce rate on one gate localizes which role's instructions leak (e.g.
     planner orphans → planner coverage discipline needs tuning).
   - **Per-lane aggregation** (free, from the filename grammar
     `run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt`): runs/tasks/unfinished per lane,
     so an orc run is never averaged together with a mini or fast one.
   - **Pipeline leaks:** `QUESTION`/`CONTEXT-GAP` clusters (over-asking, slices
     missing context), `REPLAN` reasons, `FINDING p0..p3` and `VERDICT fail`
     rates per run, runs with `SPAWN`s but no `FINISH` (aborted/never closed).
   - **Trace hygiene → narration coverage:** the hook's `PHASE-EDGE` lines
     segment every run with zero model cooperation, so a missing narration is
     now DETERMINISTICALLY visible: count the phases whose edge-interval
     contains no trace-writer `SPAWN`. Report `covered/total` + the unnarrated
     phases. The question is no longer "were rich markers forgotten?" but
     "which phases never dispatched their writer?" — a run with edges and zero
     writer spawns is a total narration failure and is named as such.
3. Validate the return (contract below). Write the report to
   `log_dir/retro/<DDMMYY>-report.md` (the `retro/` subfolder keeps the trace
   folder's top level to run traces + their sidecars) in the format below, and
   show the user the summary: verdict per question, the per-band table, and
   each recommendation with its evidence line counts + n.
4. **Deliver upstream (the point of the retro).** File the report to
   `retro_repo` (config, default `azure-id/orc`) — **PR preferred, issue
   fallback**, over the channel from step 0:
   - **`gh` channel:** if the cwd's `git remote` already IS `retro_repo`,
     branch `retro/<DDMMYY>` from the default branch, add the report as
     `retro/incoming/<DDMMYY>-<project>-report.md`, push, `gh pr create`.
     Otherwise shallow-clone `retro_repo` into a temp dir and do the same
     there. If push or PR creation fails (e.g. no write access), fall back to
     `gh issue create -R <retro_repo>` with the full report as the body.
   - **`mcp` channel:** same shape with the MCP's branch/file/PR tools;
     fallback its create-issue tool.
   - PR/issue title: `orc-retro: <DDMMYY> — <n> runs, <k> recommendations`.
   - Either way, end by showing the user the created PR/issue URL. If delivery
     itself errors after the preflight passed, surface the error verbatim and
     point at the local report copy — never claim it was filed.

## Report format (AI-readable — the PR/issue payload)

The report is written so the ORC repo's maintainer OR an AI session reading
the repo can act on it without parsing prose. YAML frontmatter mirrors the
return contract EXACTLY (machine layer), followed by short human sections:

```markdown
---
schema: orc-retro/v1
generated: <ISO date>
project: <cwd project name>
orc_version: <installed ORC version if known, else unknown>
runs_analyzed: <n>
tasks_analyzed: <n>
lane_stats: [...]        # verbatim from the return contract
narration_coverage: {...}
band_stats: [...]
downgrades: [...]
leaks: [...]
recommendations: [...]   # each with finding, suggested_change, confidence
actual_model: <...>
actual_effort: <...>
---
## Verdicts        (the three questions, one line each)
## Per-band table
## Recommendations (one subsection each: evidence lines, suggested edit, confidence + n)
```

## Return contract (the agent emits EXACTLY this; you validate)

- `runs_analyzed`, `tasks_analyzed` — the n behind everything
- `lane_stats[]` — {lane, runs, tasks, unfinished} (lane from the filename)
- `narration_coverage` — {phases_total, phases_narrated, pct, unnarrated[]:
  {run, role_family, first_agent}} — from the hook's `PHASE-EDGE` segmentation
- `band_stats[]` — {band, model, tasks, avg_retries, avg_requeues,
  avg_needs_context, avg_unmet}
- `downgrades[]` — {agent, expected, actual, run}
- `leaks[]` — {kind: question-cluster | context-gap | replan | verdict-fail |
  unfinished-run | hygiene, evidence (trace file + line numbers), count}
- `recommendations[]` — {finding, suggested_change (which file/table a human
  would edit — e.g. an effort-and-mode.md facet weight (mined from the SCORE
  line's `facets=` vector) or a band boundary in
  config.md), confidence: strong|weak (weak when n<3)}
- `actual_model` — quoted VERBATIM from the system prompt's "The exact model
  ID is …" line (`unknown` if absent, never guessed)
- `actual_effort` — `$CLAUDE_EFFORT`

Malformed = failure (re-dispatch once, then surface). A recommendation without
evidence line references is dropped — the retro obeys the same
evidence-or-advisory rule it audits.
