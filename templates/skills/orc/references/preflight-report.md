# Reference — Phase-1 Preflight Report

One compact, user-visible block printed ONCE at Phase 1, after the planning
input is settled (wiki consulted, crosslink probed, waves computed at Phase 2 —
so print it at the point all inputs exist, typically end of Phase 1 / start of
Phase 3). This is **presentation only** — no new probes; every value is already
computed by the wiki consult (Change 3), the crosslink probe (Change 5), the
pattern resolve gate (Change 4), and wave grouping.

The point is that the four knowledge gates the run used to keep silent are now
always surfaced: the user always knows whether the run is grounded (wiki),
whose house style is in force (pattern), whether peer contracts are in play
(crosslink), where the trace is, and when the run will pause.

## Template

```
── run preflight ──
wiki:      FRESH — 12 docs consulted
pattern:   js cached · ts cached
gotchas:   12 known · 3 match this change's files
crosslink: 2 boundaries (payments-api) — advisory
scoring:   8-band default table
tdd:       3 tasks with tests (T3, T6, T9) · 2 covered-by-existing · 2 no-behavior
           skipped: R4 translation strings (no-behavior) · R7 file split
                    (covered-by-existing → test/api/health.test.js:41)
trace:     .claude/orc/logs/run-orc-<slug>-210726-154500.txt
waves:     3 planned — will pause after wave 2 (batch_pause_every=2)
```

## Line rules

- **wiki:** the exact tier line from `wiki-consult.md` Step 1 (one of the four
  freshness tiers, `absent` included). Never omit — `absent` still prints.
- **pattern:** one token per resolved language (`<lang> cached` /
  `<lang> codifying` / `<lang> agnostic`), joined by ` · `. No FE/BE language
  in the run → `none (no FE/BE work)`.
- **gotchas:** ALWAYS printed — repair memory is knowledge like the wiki and the
  pattern, and a silent one is the same defect. Exactly one of
  `<n> known · <m> match this change's files` (from `orc gotcha status` +
  the scope-glob count against the plan's `declared_files`) ·
  `none yet` · `off`. `off` still prints: a user who turned it off should see
  that the run is not learning from its own repairs, and a user who did not should
  see that it is. Canonical: `../../_shared/gotchas.md`. `.claude/orc/gotchas.md`
  is where the entries live.
- **crosslink:** the crosslink line from `wiki-consult.md` when a probe hit
  (`cached` or `configured-no-cache`); omit the whole line when crosslink is
  not in play (state `none`).
- **scoring:** which executor table RESOLVED for this run — `8-band default
  table` · `Opus-5-only ladder (opus5_only)` · `custom
  (rubric_bands_override, <n> rows)`. An un-shown table is as unaccountable as
  an un-shown number, and the Opus-5-only ladder in particular means EVERY
  dispatch needs an Opus 5 main session — the user should see that before the
  first dispatch, not in a trace full of downgrades. When `opus5_only` is on,
  append ` · all fixed roles forced to Opus 5` and name any selector it
  shadowed (`rubric_bands_override` / `fable5_*` present but INERT) — a setting
  the user tuned and the run then ignored has to be said out loud.
- **tdd:** ALWAYS printed on a lane whose TDD policy is on — BOTH branches, not
  only the exemption. Counted straight from the plan's `tdd_spec`, broken down
  by `disposition` so the user sees **what got no test and why** (v0.41.0):

  ```
  tdd:  3 tasks with tests (T3, T6, T9) · 2 covered-by-existing · 2 no-behavior
        skipped: R4 translation strings (no-behavior) · R7 file split
                 (covered-by-existing → test/api/health.test.js:41)
  ```

  The `skipped:` continuation is REQUIRED whenever any entry is
  `covered-by-existing` or `no-behavior`, one line per entry, each naming its
  `reason` (or its `covered_by` path). Scoping TDD down is only safe if the
  scoping is visible: a silently skipped test is indistinguishable from a
  forgotten one, and this is the line that keeps the token saving honest.

  Whole-run exemption →
  `EXEMPT (whole run) — no test runner detected in this project`, which is the
  ONE line `SKILL.md` mandates for that case. A plan where NO task needed a test
  → `no tasks required tests (all covered-by-existing / no-behavior)` plus the
  same `skipped:` breakdown — never silence. A lane whose policy is off
  (orc-fast, or orc-mini when the user declined) prints `off (<lane> policy)`.
  This line is the producer the mandate previously lacked — without it an
  orchestrator that prints only what the payload compels prints nothing at all
  about TDD on a normal run.
- **trace:** the run's `trace_path`.
- **waves:** `K planned — will pause after wave(s) [list] (batch_pause_every=N)`,
  or `K planned — no pause (run straight through)` when the user chose to run
  through / the schedule is empty.

The pattern and crosslink lines reuse Changes 4/5's already-emitted content — do
NOT recompute. If the pattern resolve gate has not run yet when the block is
printed, show the tagged languages as `pending resolve` rather than delaying the
block.

---

# The `forecast:` block (v0.42.0) — printed EARLIER, and separately

A second, shorter block. It is NOT part of the preflight block above and does not
change it. It answers the one question ORC never answered: **what will this run
cost me in time, before it starts?**

## When

**The moment the Phase 1 exit gate passes**, and *before* the pause-schedule
question, and long before the first executor dispatch.

That timing is the whole design. It is the EARLIEST point where every number is
real — the plan exists, so tasks, dependencies and facets are all in hand, which
makes waves and scores computable. It is also the LAST cheap moment to walk away:
nothing dispatched, nothing written, nothing wasted. Printed any later it would
still be honest and would be useless.

On a `/orc-plan` **Save & stop** it prints alongside the routing question
(`../../orc-route/SKILL.md`), so price and recommended lane arrive together.

## Template

```
── forecast ──
tasks:     7 · waves: 3 · subagents: about 17
models:    2 high · 3 medium · 1 low
time:      about 45-80 minutes in this lane
cheaper:   /orc-mini would be about 15 minutes with 3 subagents
           (it skips full review and verification)
```

## Line rules

- **Presentation only — NO new probes.** Every value is already in hand at this
  instant: `tasks` and `waves` from the plan and the wave grouping, `subagents`
  from the dispatch count the lane's phases imply, `models` from the score→model
  table that was already resolved for the `scoring:` line above.
- **`subagents` is an estimate and says so** (`about N`). The honest floor is
  one per task plus the lane's fixed roles plus one trace-writer per phase; a
  repair round or a requeue makes the real number higher, never lower.
- **`time:` is a RANGE, calibrated from measured runs, never invented.** The
  corpus behind the current ranges: `/orc-fast` ≈ 9 min / 3 dispatches ·
  `/orc-mini` ≈ 15 min / 3 · `/orc` 48–84 min / 15–23. Scale within the lane's
  range by task count. If a lane has no measured corpus, print
  `time: not measured for this lane` rather than a guess — a fabricated number
  here is worse than no number, because it looks computed.
- **`cheaper:` names ONE alternative and what it costs you**, never a bare
  "X is faster". Omit the line when no cheaper lane can run this plan (say why in
  one clause instead — e.g. `cheaper: none — /orc-fast needs a fresh wiki`).
- **The full lane can cost six times more than the fast lane.** That ratio is the
  reason this block exists; do not bury it in prose.

## `run_budget_dispatches` — the optional hard stop

Config key, `common` tier, default `0` (off). When set and the forecast's
`subagents` estimate EXCEEDS it, the run **stops before wave 1** with the same
discipline as the batch pause — a gate, not a hint. Never dispatch wave 1 past
an unacknowledged budget stop.

```
── budget ──
This run forecasts about 17 subagents; your run_budget_dispatches is 12.

  1  proceed anyway
  2  switch to /orc-mini (about 3 subagents — skips full review and verify)
  3  stop and re-plan smaller
```

Emit `GATE budget stop :: forecast=<n> limit=<m>` before stopping, and
`GATE budget pass :: forecast=<n> limit=<m>` when the forecast is within the
limit (so a run that silently passed is distinguishable from one where the key
was unset). `0` means the gate never fires and no `GATE budget` line is emitted
at all.

