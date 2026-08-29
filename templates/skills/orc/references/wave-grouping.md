# Reference — Wave Grouping & Conflict Graph

Turn the tagged task list into conflict-free waves. Load during Phase 3.

## Waves are computed for EVERY run — dispatch style is intra-wave only

Wave computation is NOT a parallel-mode concern. It runs for **every run with ≥2
tasks, sequential included** (dependency layers + conflict graph +
`max_wave_tasks` cap). **Dispatch style controls only INTRA-WAVE concurrency:**

- **parallel** → a wave's non-conflicting tasks dispatch at once (up to
  `max_wave_tasks`);
- **sequential** → the SAME waves, but a wave's tasks dispatch one at a time, in
  order; the wave still closes only when all its tasks close.

Either way the **wave-boundary gate fires identically** (the deterministic batch
pause below binds to wave numbers, not to a dispatch style). A sequential run
therefore never degenerates to "no waves / per-task pauses" — a 5-task plan
becomes e.g. `[T1] [T2 T3 T4] [T5]`, not five ad-hoc stops. **Show the wave plan
(wave → tasks → pause marks) to the user BEFORE wave 1 in BOTH styles.**

## The principle

Two tasks may share a wave ONLY if their `declared_files` don't overlap AND
neither depends on the other. Conflicts are designed out by scheduling — never
negotiated at runtime.

## Algorithm

1. **Dependency edges:** a task's earliest wave = max(wave of its deps) + 1.
2. **Conflict edges:** for every pair, mark conflict if `declared_files` globs
   intersect (expand against the repo tree; unresolvable globs conflict on
   their literal prefix).
3. **Assign greedily in topological order:** place each task in the earliest
   wave where (a) all deps are earlier and (b) nothing in that wave conflicts.
   Otherwise open a new wave.
4. **Cap concurrency at `config.max_wave_tasks`** (default 3): a wave NEVER
   exceeds this many tasks, even if more are conflict-free. Overflow moves to the
   next wave. This is the efficiency cap — 3 parallel subagents by default.
5. **Mark batch pauses:** compute the pause schedule from the user's Phase 2
   answer — mark `is_batch_pause: true` on wave W when `W % N == 0` AND a later
   wave exists (`W < total_waves`); the last wave is NEVER a pause (nothing
   remains to gate). The resulting wave indices are the `pause_schedule` stored
   in the checkpoint. A pause so marked is a HARD gate (stop-resume.md), not
   an orchestrator judgment call.

## Same-feature collision

If two tasks own the same feature/files with no dependency between them, the
graph auto-serializes them — but that's a planning smell. Surface it: suggest
merging them into one task rather than silently serializing duplicate work.

## TDD tasks are ORDINARY tasks (v0.41.0)

TDD red proofs are **planner-emitted tasks**, not an orchestrator-synthesized
Wave 0. Each one materializes the `tdd_spec` entries of the implementation task
it guards, and that task lists it in `depends_on`. Nothing here special-cases
them:

- they enter the same conflict graph via their `declared_files` (their test
  files), so **independent TDD tasks share a wave and run in parallel** — the
  red proofs for two unrelated features are one wave, not two;
- `depends_on` guarantees **a red proof is always in an earlier wave than the
  code it proves** — a proof can never land beside its implementation;
- they are scored from **their own planner-emitted `facets`**, like any task, so
  no derived-vector rule is needed;
- `max_wave_tasks`, `is_batch_pause` and `pause_schedule` bind to them unchanged.

**A TDD task does NOT inherit the risk floor** of the task it guards: it
transcribes planner-authored skeletons, writes no production code, and its output
is asserted RED before anything is believed. The planner reflects that in the
task's own facets (`novelty: mechanical`, `logic: none`, `risk: []`). Stated here
so it is not re-litigated per run — the alternative is a Haiku-sized
transcription job dispatched at floor 70 because the requirement it proves is
auth-flavoured.

**If no task carries `new-surface` or `behavior-change` entries, no TDD task
exists and no extra wave is created.**

## Orchestrator-synthesized tasks (the mock example, any future one)

Some dispatched tasks appear in no `tasks[]` because the ORCHESTRATOR synthesized
them — the mock example (`_shared/drift-recovery.md`). They still obey hard rule
1: **dispatched like any other task, never done by you.** But they have no
planner-emitted `facets`, and the orchestrator is by definition the party that
did NOT read the code — inventing a vector for them is judgment wearing
arithmetic's clothes, the exact thing the facet redesign removed.

So their vector is **DERIVED, never judged**:

| Facet | Value |
|---|---|
| `breadth` | `len(files the synthesized task will touch)` |
| `novelty` | `mechanical` — it transcribes planner-authored material |
| `logic` | `none` |
| `test_surface` | per the task |
| `risk` | `[]` — unless the synthesized task itself inherits a CITED risk |

## Post-wave worktree audit (a GATE, not a report)

Declarations can be wrong, and a return can be honest and still miss what
happened. Capture `git status --short` BEFORE the wave dispatches and again
after every task returns, then diff the two:
- **Any path whose state changed and is in NO task's `declared_files`** → name
  the path and the likely task, and get an explicit user decision BEFORE the
  wave closes. A wave never closes over an unexplained worktree delta.
- **A file that became LESS modified is as much a violation as one that became
  more modified.** That is the revert signature — an executor made an
  unsatisfiable assertion true by `git checkout`-ing another task's completed
  work, returned a literally-true report, and left a CLEAN tree. Nothing that
  reads returns can see it.
- **Stray files count** — a path that appears at the repo root (a stdout dump, a
  mangled-path artifact) is undeclared output, not noise to ignore.
- Two agents in one wave touched the same undeclared file → record
  `failure_reason: "file-collision:<file> with <agent>"`, set the
  later-finishing task to `requeued`, re-dispatch in a later wave so it sees
  the other's committed changes.
- Declarations are the plan, `actual_files` is the ATTESTATION, and
  `git status` is the AUDIT — same instruction → contract → attestation →
  spot-check pattern the plan applies to `grounding[]`.
- Canonical cross-lane wording: `_shared/return-validation.md` §6.
