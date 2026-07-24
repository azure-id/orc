# Reference — Ultra Lane (load only when `ultra_mode: true`)

`/orc-ultra` runs the FULL pipeline with maximum rigor for complex and
ultra-complex requests. Everything in SKILL.md still applies; this file adds
the ultra deltas. Ultra exists ONLY here — never in orc-mini, never on a plain
`/orc` run.

Cost stance: ultra is costly by definition. State it once at intake
("ultra adds an Opus 4.8 max advisor + up to 3 judge dispatches + revision
loops"), then never prompt about cost again.

## Forced overrides (run-scoped — NEVER written to the user's config file)

Apply at Phase 0, on top of the normal config resolution:
- analysis depth = **deep**, no ask (the analyst's standard/deep gate is
  bypassed; `default_analysis_depth` is ignored; scouts dispatch as usual).
- `pattern_findings` = on · `generate_tests` = on · `security_review` = on.
- Executor **tier floor**: remap the resolved score→model preset so no task
  dispatches below `orc-executor-sonnet-5-high`; bands at/above the preset's
  opus boundary shift to `orc-executor-opus-4-8-high`. Show the remapped
  table with the Phase 2 scoring table.

> Fable 5 role override: if `fable5_enabled` and `advisor` / `judge` are in
> `fable5_roles`, dispatch the `orc-advisor-fable-5` / `orc-judge-fable-5`
> variant instead of the Opus 4.8 max default — same slice, same contract. See
> `../../_shared/fable5-override.md`.

## Phase U0 — Advisor (after intake sign-off, before the analyst)

Dispatch `orc-advisor-opus-4-8-max` (see `../../orc-advisor/SKILL.md`) with
the request, the run-folder path, and the detected stack. Validate the return
(`brief_path`, `open_questions[]`, `assumptions[]`, actual model/effort
fields). Then:

1. Relay `open_questions[]` to the user in ONE batched round. Fold answers
   into the intent-spec; unanswered questions fall back to the advisor's
   proposed default and enter the ledger as UNCONFIRMED.
2. Create `run/{run-slug}/ultra/assumption-ledger.md` from `assumptions[]`.
   Every later phase appends: `assumption → confirmed-by-user |
   confirmed-by-code-evidence (anchor) | UNCONFIRMED`. You alone write it
   (workers return candidate entries; you record them).
3. Inject the brief VERBATIM (never a pointer) into the analyst slice, the
   planner slice, every judge slice, and — as advisory notes — every executor
   slice. The rubric section is what the judges score against.

The advisor runs once; it is never re-dispatched. Record `ADVISE` into the U0
packet — ultra adds ONE writer packet for U0 and one per judge gate on top of
orc's phase packets (`../references/trace-protocol.md`), so the advisory brief,
the questions relayed, and each verdict round are narrated like any other phase.

## The three judgment gates (dispatch `orc-judge-opus-4-8-max`)

Shared mechanics — verdict validation, blocking-finding downgrade enforcement,
REVISE loops (author echo `finding_id → resolution`, re-judge convergence
rule, hard cap 2 per gate), the ESCALATE menu, advisory carry-forward, verdict
persistence (`run/{run-slug}/ultra/verdict-<gate>-<round>.md`), and the
`JUDGE` / `GATE judgment` trace events (packet-carried) — live in
`../../orc-judge/SKILL.md`.
Load it at the first gate. Loop counters + the ultra artifact paths go in the
checkpoint (`ultra` block) so a resumed run continues mid-loop.

Judge slices ALWAYS carry: the advisor brief (with rubric), the original
request, the assumption ledger, and gate-specific evidence below. Never the
author's reasoning or self-assessment.

- **Gate 1 (analysis)** — after the analyst-return deterministic gates pass
  (evidence spot-check + derivation lint) and the user's challenge round is
  resolved. Slice adds: report + spec paths. REVISE → bounce to the analyst.
  Gate approval does NOT replace the user's take-into-build choice.
- **Gate 2 (plan)** — after the Phase 1 exit gate passes. FIRST build the
  **blast-radius map** (deterministic, yours): for each task's declared
  files, Grep the importers/callers of the symbols it touches; list any
  caller file no task covers. Slice adds: planning-output + the map. REVISE →
  bounce to the planner. Gate approval does not replace plan sign-off.
- **Gate 3 (implementation)** — after Phase 6 (and 6.5). FIRST build two
  deterministic inputs:
  1. **Traceability matrix** (`run/{run-slug}/ultra/traceability-matrix.md`):
     `R# → task → declared files → actual diff hunks (git diff) → verify
     evidence`. An R# with an EMPTY diff column is a deterministically caught
     missing implementation — dispatch the fix wave directly, no judge needed
     for that miss.
  2. **Static analysis**: run the project's own tooling on the changed files
     when the stack detection found any (linter, sonar-scanner,
     type-checker) — never install tooling. Inject results into the slice;
     tool findings on changed lines are blocking input the judge triages.
  Slice adds: matrix, changed-file LIST (never an inlined diff — the judge
  reads matrix-guided via its own Read/Grep), verify report, static-analysis
  results, the resolved pattern's blocking invariants. REVISE → scored
  executor **fix wave** for only the affected tasks (findings verbatim in
  slices) → re-verify → re-judge. All clear → Phase 7.

## Verdict contract cross-check (validate like any worker return)

`verdict` ∈ APPROVE|REVISE|ESCALATE · every blocking finding has a verbatim
anchor + class-appropriate justification (`failure_consequence` for
correctness/security; named category + concrete alternative for
smell/simplification/placement) · `rubric_items_checked[]` covers the gate's
rubric lines · `unconfirmed_assumptions_touched[]` present. Malformed →
requeue the judge once, then escalate. Security findings with a concrete
consequence are always blocking. APPROVE with zero findings is legitimate.

## Phase 7/8 deltas

The summary additionally reports: per-gate verdicts + rounds, findings by
severity and class, auto-downgrades, the assumption ledger's final state
(UNCONFIRMED entries highlighted), and the traceability matrix path. Ship is
unchanged — but never offer commit while a gate is unresolved.
