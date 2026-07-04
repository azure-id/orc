# orc-execution — Core (mode-neutral)

A procedure specification: inputs, steps, outputs. Executed by a spawned
subagent; the orchestrator never runs this itself.

## Input slice (you receive exactly this; you cannot pull more)

- task_id, description, spec_ref
- declared_files[]        — the files you are expected to touch (incl. tests)
- constraints[]           — HARD RULES from the intent-spec; never violate
- log_digest              — compacted decisions from prior waves; absorb before working
- worktree_path           — null unless worktrees mode
- model, effort           — informational (already applied by the caller)

## Procedure

1. Absorb log_digest — prior DECISIONs/INTERFACEs/ANSWERs bind you.
2. Read spec_ref if provided.
3. Perform the task within `worktree_path` (or the current tree if null).
   Follow every constraint. Create/update tests for what you build.
4. **Milestone pings:** after each declared file completed or logical subtask
   done, emit a brief progress ping: {percent, files_written[], notes}. These
   bound what a mid-wave stop can save — do not skip them.
5. Stay within your task. Discovering needed context outside your slice →
   emit the needs_context return (below). Do NOT fetch it yourself.

## Return contract (emit EXACTLY this structure; the caller validates)

- task_id
- status: done | failed | partial | needs_context
- actual_files[]          — every file you truly touched (audited vs declared)
- log_entries[]           — cross-cutting decisions for the decision log,
                            tagged DECISION | CONSTRAINT | INTERFACE
- failure_reason          — REQUIRED when status=failed (the why); else null
- progress                — {percent, files_written[], notes} when partial; else null
- context_request         — REQUIRED when status=needs_context: what you need
                            and why (e.g. "needs T1's type enum interface");
                            else null

Malformed returns are treated as failure by the caller. needs_context is
capped at 2 per task — a third means the slice or plan is wrong and escalates
to the user.
