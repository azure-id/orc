# Reference — Wave Grouping & Conflict Graph

Turn the tagged task list into conflict-free waves. Load during Phase 3.

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
