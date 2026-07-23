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
   in the checkpoint. A pause so marked is a HARD gate (stop-and-resume.md), not
   an orchestrator judgment call.

## Same-feature collision

If two tasks own the same feature/files with no dependency between them, the
graph auto-serializes them — but that's a planning smell. Surface it: suggest
merging them into one task rather than silently serializing duplicate work.

## Post-wave collision backstop

Declarations can be wrong. After each wave, compare each worker's returned
`actual_files` against declarations:
- Two agents in one wave touched the same undeclared file → record
  `failure_reason: "file-collision:<file> with <agent>"`, set the
  later-finishing task to `requeued`, re-dispatch in a later wave so it sees
  the other's committed changes.
- Declarations are the plan; `actual_files` is the audit.
