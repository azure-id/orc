# Worked example — /orc-retro run (mock; orient only, never execute from this)

The retro is the READER end of the behavior-trace flywheel: it mines the `.txt`
traces (written only when config `logging: true`), aggregates the CLOSED verb
set, and files a calibration report UPSTREAM to the ORC repo. It never tunes
your project, never self-tunes, and writes no trace of its own.

## Happy path

Setup: `.claude/orc/logs/` holds 3 traces (logging was on for a while). The
delivery target is the configured `retro_repo` (default `azure-id/orc`). The
`gh` CLI is installed and authed.

```
U: /orc-retro
```

### Step 0 — P0 preflight (a delivery channel, or no run at all)

```
C: Probing delivery channel…
   gh --version   → gh 2.62.0 ✓      gh auth status → logged in as joshua-k ✓
   Channel = gh.  Target = retro_repo (azure-id/orc).
```

If BOTH `gh` and a GitHub MCP were missing → STOP here: mine nothing, spawn
nothing, write no local report. Tell the user to `gh auth login` (or connect a
GitHub MCP) and re-run.

### Step 1 — collect traces

```
C: log_dir = .claude/orc/logs
   Found 3 traces:
     • feat-auth-090726.txt    (full /orc, 42 lines)
     • orc-claude-100726.txt   (orc-claude, 5 lines)
     • fix-cache-110726.txt    (orc-mini, 11 lines)
   Mining all 3.  n=3 runs — small-sample edge; weak signals get labeled.
```

The three lanes contribute DIFFERENT verb sets — the miner only gets what each
lane wrote:

`feat-auth-090726.txt` (full pipeline — the rich one):
```
[090726 14:40:02.300] orc      SCORE task=T3 score=72 band=[70,80) model=opus-4-7 :: multi-file, judgment
[090726 14:40:03.010] orc      DISPATCH orc-executor-opus-4-7-high :: T3 expect=opus-4-7/high
[090726 14:44:12.900] orc      VERIFY T3 actual=opus-4-7/high ✅ MATCH
[090726 14:44:13.000] orc      VERIFY T5 actual=sonnet-4-6/high ⛔ DOWNGRADE expected=opus-4-8/high
[090726 15:02:00.000] reviewer FINDING p0=1 p1=0 p2=3 p3=2
[090726 15:04:10.000] orc      GATE coverage bounce :: T4 unowned (no owning req)
[090726 15:10:00.000] verifier VERDICT pass :: 8/8 acceptance criteria
[090726 15:11:30.000] orc      OUTCOME task=T3 score=72 band=[70,80) model=opus-4-7 retries=1 requeues=0 needs_context=0 unmet=0
[090726 15:12:00.000] orc      FINISH :: shipped PR #123
```

`orc-claude-100726.txt` (single-dispatch lane — its ONLY meaningful signal is
the writer's tier honesty):
```
[100726 09:14:02.110] orc      DISPATCH orc-claude-writer :: refresh expect=opus-4-8/high
[100726 09:14:02.230] hook     SPAWN orc-claude-writer-opus-4-8-high
[100726 09:15:47.900] hook     RETURN
[100726 09:15:48.010] orc      VERIFY writer actual=sonnet-4-6/high ⛔ DOWNGRADE expected=opus-4-8/high
[100726 09:15:48.120] orc      FINISH :: refresh CLAUDE.md v0.0.3
```

### Step 2 — dispatch the miner (never mines itself)

```
C: Spawning orc-retro-sonnet-5-high → claude-sonnet-5 / high
   slice: trace_files=[3 paths] + verb_reference=orc/references/trace-protocol.md
   (This lane writes NO run pointer and emits NO markers — tracing the retro
    would pollute the very data it mines.)
```

The miner parses `[stamp] actor VERB :: tail`, skips any line outside the closed
verb set, and returns EXACTLY the contract:

```yaml
runs_analyzed: 3
tasks_analyzed: 6
band_stats:
  - {band: "[70,80)", model: opus-4-7, tasks: 2, avg_retries: 0.5, avg_requeues: 0, avg_needs_context: 0, avg_unmet: 0}
  - {band: "[50,70)", model: sonnet-5, tasks: 3, avg_retries: 1.3, avg_requeues: 0.7, avg_needs_context: 1.0, avg_unmet: 0.3}
downgrades:
  - {agent: orc-executor-opus-4-8-high,     expected: opus-4-8/high, actual: sonnet-4-6/high, run: feat-auth-090726}
  - {agent: orc-claude-writer-opus-4-8-high, expected: opus-4-8/high, actual: sonnet-4-6/high, run: orc-claude-100726}
leaks:
  - {kind: verdict-fail, evidence: "feat-auth-090726.txt:L31 (FINDING p0=1)", count: 1}
  - {kind: gate-bounce,  evidence: "feat-auth-090726.txt:L33 (coverage bounce)", count: 1}
  - {kind: context-gap,  evidence: "fix-cache-110726.txt:L4,L7", count: 2}
recommendations:
  - finding: "Both downgrades share a fingerprint: an opus-4-8/high pin ran as sonnet-4-6 — the main session was below Opus when the child spawned."
    suggested_change: "Not a rubric issue — surface to the user: run the pinned lanes from an Opus 4.8 session. No config edit."
    confidence: strong
  - finding: "sonnet-5 band [50,70) shows avg_needs_context=1.0 across 3 tasks — slices may be under-specified."
    suggested_change: "config.md — tighten the planner's declared-files discipline, or nudge the [50,70) band slice detail."
    confidence: weak      # n<3 in this band
actual_model: claude-sonnet-5
actual_effort: high
```

A recommendation with no evidence line references is DROPPED — the retro obeys
the same evidence-or-advisory rule it audits.

### Step 3 — validate, write the local report, show the summary

```
C: Return validates. Writing report →
   .claude/orc/logs/retro/130726-report.md   (retro/ subfolder keeps the top
   level .txt-only)

── orc-retro summary (n=3 runs, 6 tasks) ──────────────────────────────
Scoring calibrated?  ~ mostly — [70,80) clean; [50,70) shows a context-gap (weak, n=3)
Workers honest?      ⛔ NO — 2 silent downgrades (opus-4-8 → sonnet-4-6)
Where it leaks?      1 coverage-gate bounce, 1 P0 review finding, 2 context-gaps
Recommendations: 2 (1 strong, 1 weak)
───────────────────────────────────────────────────────────────────────
```

The report is AI-readable: YAML frontmatter mirroring the return contract
(`schema: orc-retro/v1`, every array verbatim), then short human sections
(Verdicts / Per-band table / Recommendations, each with its evidence + n).

### Step 4 — deliver upstream (the point of the retro)

```
C: cwd remote ≠ retro_repo → shallow-clone azure-id/orc into a temp dir.
   branch retro/130726 → add retro/incoming/130726-myproject-report.md → push
   gh pr create -R azure-id/orc --title "orc-retro: 130726 — 3 runs, 2 recommendations"
   ✅ https://github.com/azure-id/orc/pull/318
```

If push or PR creation fails (e.g. no write access), fall back to
`gh issue create -R azure-id/orc` with the full report as the body. Either way,
end by showing the created PR/issue URL. If delivery itself errors after the
preflight passed, surface the error verbatim and point at the local report copy
— never claim it was filed.

## Early-exit branches

No delivery channel (preflight fails):
```
U: /orc-retro
C: gh not authed, no GitHub MCP in this session.
   ✋ Retro needs somewhere to file its report. Run `gh auth login` (or connect a
   GitHub MCP), then re-run. Mining nothing until then.
```

No traces (logging was never on):
```
U: /orc-retro
C: Channel OK. log_dir has 0 *.txt files.
   Nothing to mine — enable logging first (`orc config set logging true`), run
   some ORC work, then come back. Never invents findings from zero data.
```

## What each lane contributes to the mine

- **Full `/orc`** — the rich one: `SCORE`/`OUTCOME` (band calibration), GATE
  bounce rates (which role's discipline leaks), `FINDING`/`VERDICT`
  (review/verify health), plus `VERIFY` (tier honesty).
- **orc-mini** — `DISPATCH`/`VERIFY`/`FINISH` + any `CONTEXT-GAP`; no scoring
  or review markers.
- **orc-claude** — single-dispatch: `DISPATCH`/`VERIFY`/`FINISH` only. Its one
  contribution is the writer's tier-honesty `VERIFY` — exactly the `⛔ DOWNGRADE`
  in this mock. Before orc-claude wrote its trace at all, that downgrade was
  invisible; now it lands in `downgrades[]`.
