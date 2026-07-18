# ORC Eval Report — payload v0.25.0

**Sandbox:** `C:\dev\orc-eval` (the `eval/fixture` Express toy as its own git repo,
payload installed from this repo's working tree).
**Date of run:** 18-07-2026 · main session Opus 4.8 high · suite: `evals/01…17`
(one executable spec per lane; every unchecked checklist line is a defect filed
against the responsible skill file, not the model).

All evidence below is read from the sandbox's persistent behavior traces
(`.claude/orc/logs/*.txt`), run folders (`.claude/skills/orc/run/`), and the
artifacts each lane left on disk — not from session memory.

## How durations are measured

Each lane writes a permanent trace with millisecond `SPAWN`/`RETURN` hook lines
plus rich orchestrator markers. Duration = first trace line → `FINISH` (or last
`RETURN`). This measures **orchestration wall time** and excludes the human
think-time between scripted intake answers, so real sessions run a bit longer.
Some lanes' rich markers carry reconstructed (rounded) timestamps; the hook
lines are always real.

## Results by lane

| # | Lane | Eval task | Task complexity | Duration | Subagent dispatches | Steps (phases) | Result |
|---|------|-----------|-----------------|----------|--------------------:|---------------:|--------|
| 01 | `/orc-fast` (fallback) | `GET /healthz` on a bare sandbox | Trivial — 1 file, no auth; the *gate* is the test | ~3 min | 1 executor (Sonnet 5 high via mini) | 7 | ✅ Both prerequisite gates bounced with named reasons; fell back to orc-mini via `FALLBACK-FROM`; smoke GREEN 3/3 |
| 02 | `/orc-mini` | `DELETE /orders/:id` (auth + 204 + 404) | Low — 1 file, but must honor the `requireAuth` invariant | ~2.5 min exec+testgen (hook span) | 1 executor + 1 test-author | 8 | ✅ Auth invariant kept, smoke 8/8; testgen delivered (see finding F2 on artifact location) |
| 03 | `/orc` (full) | `PATCH /orders/:id` + `GET /orders` pagination | Medium — 2 independent tasks sharing one file (forces wave serialization, rule 4) | ~10 min | 5 (planner, 2 executors, reviewer, verifier) | 10 | ✅ Score override 13→70 on auth risk; shared-file tasks correctly serialized W1/W2; review 0 blockers; verify 6/6, tests 15/15 |
| 04 | `/orc-ultra` | `POST /users`, security-sensitive | High **rigor** (task itself moderate) — advisor + 3 judge gates + security pass + testgen | **~43 min** | **12** (advisor·max, analyst, 3 judges·max, planner, 2 executors, 2 reviewers, verifier, test-author) | 16 | ✅ 3/3 gates APPROVE round 1; security clean; tests 10/10 · ⚠️ **F1: TEST-PLAN.md buried in the hidden run folder** |
| 05 | `/orc-analyze` (deep) | Audit doc with 1 planted false claim | Medium-high — 4 audit rows, scout sweep, user challenge | ~8 min | 6 (analyst ×2 passes, 4 scouts in parallel) | 9 | ✅ Stale finding-2 caught (`POST /orders` already guarded, `orders.js:18`), challenged, dropped; all rows file:line-anchored |
| 06 | `/orc-analyze-mini` | Same doc, single pass | Low-medium | — | — | — | ⬜ **No trace on disk** — not evidenced in this sandbox (gap G1) |
| 07 | `/orc-plan` | Orders `status` field plan with a **phantom path** trap | Low-medium — plan-only, grounding is the test | ~2 min | 1 planner | 3 | ✅ `src/db/orderStore.js` bounced as non-existent (recorded under `phantom_paths` with evidence); new `src/lib/orderStatus.js` correctly marked *created* |
| 08 | `/orc-verify` | Planted unauthenticated DELETE | Low | — | — | — | ⬜ **No trace on disk** — not evidenced (gap G1) |
| 09 | `/orc-wiki` | Build the knowledge base | High cost — full scan | scan completed 15:38 | (scan agents) | — | ✅ 5 evidence-anchored docs + `INDEX.md` + `wiki-meta.json` registered by `orc wiki sync` (`scan_commit da58dd0`); crosslink dir present · ⚠️ no trace file for the scan itself (gap G2) |
| 10 | `/orc-pattern` | Cache the JS pattern | Low-medium | ~2.5 min | 1 codifier | 3 | ✅ `js-pattern.md` (2026-07-18-a) from the `be-express` playbook + 5 real files; 5 conflicts flagged, 2 ambiguities |
| 11 | `/orc-fast` (real) | `GET /orders/count` | Low — the *no-fallback* path is the test | ~3.5 min | 1 executor (Sonnet 4.6 high) | 6 | ✅ Both gates PASS (wiki FRESH d=0, pattern cache hit); wiki-consult logged; no analyst/planner; smoke 4/4 |
| 12 | `/orc-diy` | Hard gate, then compiled "lean" flow for `/healthz` | Low — the gate + config-honoring is the test | ~1.7 min (Part B) | 2 (executor, verifier) | 12 (incl. 4 explicit skips) | ✅ `diy status` READY honored; analyze/review/security/testgen skipped **by config and named in the trace**; smoke verify GREEN |
| 13 | `/orc-claude` | Build then refresh `CLAUDE.md` | Low-medium | ~8 min (both passes) | 1 writer ×2 | 4 | ✅ UPDATE v0.0.1 written; second run correctly a fingerprint **noop** |
| 14 | `/orc-learn` | Orders feature onboarding | Low-medium | ~7.5 min | 1 writer | 4 | ✅ Wiki-topic pick (FRESH); `learning-docs/orders/` learning.md + knowledge.md + derived INDEX.md |
| 15 | `context-combiner` | Merge 2 overlapping orders analyses | Medium — lossless-merge contract | ~9 min (A + B + combine) | 3 (2 analysts, 1 combiner) | 5 | ✅ `combined-report.md` + `combined-requirement-spec.md` + decisions written; shared DELETE requirement reconciled |
| 16 | `/orc-retro` | Mine the traces | Low-medium | — | — | — | ⬜ No local report expected (delivered upstream by design) — **no local evidence either way** (gap G1) |
| 17 | trace-hook (deterministic) | `bash eval-kit/trace-eval/run.sh` | Scripted — no model | seconds | 0 | 10 checks | ✅ The hook fixes are exercised by every other row: `SPAWN`/`RETURN` lines present in all 13 traces, no orphan RETURNs |

**Totals with evidence on disk: 13 of 17 lanes fully evidenced, 13/13 evidenced lanes passed their core contract.**
Aggregate trace counters across all runs: `retries=0 requeues=0 needs_context=0 unmet=0 downgrades=0` — every
subagent `VERIFY` line matched its expected model/effort (`✅ MATCH`, including the `[1m]` long-context variants).

## Accuracy vs. designed behavior — notable confirmations

- **Model-tier honesty held everywhere.** Every dispatch logged
  `expect=<model>/<effort>` and every return was verified against the quoted
  `actual_model`/`actual_effort`. Zero silent downgrades across ~35 dispatches.
- **The knowledge gate is real, both directions.** Test 01 (bare sandbox)
  bounced and named both missing prerequisites; test 11 (after 09+10) passed
  both probes and ran the real fast lane. Same skill, opposite branches, both
  correct.
- **Scoring overrides fire on risk, not just size.** Test 03's PATCH task
  computed 13 but was floored to 70 (auth risk) → Opus executor; the pagination
  task stayed Sonnet 4.6. Test 04's ultra tier floor raised T2 as designed.
- **The DIY compiled flow is authoritative.** Every OFF phase was *skipped
  with a named reason* in the trace — nothing was silently run or silently
  dropped.
- **Deep analysis catches planted falsehoods.** The stripped audit doc's stale
  claim was caught by pass-1, corroborated by a scout, and resolved *with the
  user* — it never became a build task.

## Findings (defects / drift)

### F1 — Test-gen output is invisible to the user (ultra lane) — **the headline drift**

The ultra run's Phase 6.5 authored a real, good `TEST-PLAN.md` (5.7K) and
`test-cases.http` — but wrote them to
`.claude/skills/orc/run/post-users/ultra/`, a **hidden dot-directory run
folder**. A user looking for "how do I self-QA this change" will never find
them; for practical purposes the deliverable doesn't exist. The root cause is a
contract hole: `orc-testgen/core.md`'s return contract asks for
`test_plan_path` but **never pins where the manual artifacts must live**, so
each lane improvises. Fix planned: a canonical, visible
`test-generator/<change-slug>/` folder at the project root (see
`orc-testgen-output-plan.md`, process doc).

### F2 — Same hole in orc-mini (test 02)

The mini trace records `TEST-PLAN.md` + `delete-orders.curl.md` authored, but
neither survives on disk anywhere in the sandbox. Either they were written to
the repo root and swept by the between-tests reset ritual, or into a run folder
that was later cleared — indistinguishable after the fact, which is itself the
problem: **no pinned location means no durable self-QA artifact**. Covered by
the same fix as F1.

### F3 — Copy-out artifacts don't survive the reset ritual

`analyst_report/orders-audit/` exists but is **empty** — the trace shows
`report.md` was copied out at 14:57, and the folder's mtime (15:17) matches the
next reset. Not a skill defect, but the eval reset ritual (`git clean -fd`)
sweeps root-level deliverables; specs that assert on copied-out artifacts
should grade them before resetting.

## Gaps (not graded, not failed)

- **G1 — No trace evidence for 06 (`/orc-analyze-mini`), 08 (`/orc-verify`),
  16 (`/orc-retro`).** Either the runs happened before a `.claude/orc/logs`
  wipe or were skipped. Re-run and grade these three to close the suite.
- **G2 — The wiki scan (test 09) left artifacts but no trace file.** The wiki
  itself is verifiably present and registered (5 docs, synced manifest), but
  the scan session's trace is absent from `log_dir` — worth confirming the
  trace hook fires on wiki scan-task dispatches in a future run.

## Cost/duration takeaways

- The **rigor multiplier is ~4×**: the same class of single-route change costs
  ~2.5–3.5 min in fast/mini, ~10 min in the full pipeline, **~43 min in ultra**
  (12 dispatches, three of them Opus-max judges). Ultra spends most wall time
  in the advisor (~10 min) and the three judge gates (~9 min combined) — the
  price of 3× APPROVE-round-1 assurance.
- The two knowledge scans (09 wiki, 10 pattern) are the enabling investment:
  they turn orc-fast from a fallback shim into a real ~3-minute lane and feed
  wiki-consults in ultra/planning.
- Checkpoint/run-folder hygiene held: every non-trivial lane left
  `checkpoint.json` + `state-of-play.md`, so any of these runs was resumable.
