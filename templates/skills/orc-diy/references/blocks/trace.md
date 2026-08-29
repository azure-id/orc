<!-- GENERATED SOURCE BLOCK — stitched by `orc diy compile`. Edit the block
     template in skills/orc-diy/references/blocks/, never the compiled file. -->
## Behavior trace (PERMANENT — always on, no flow key)

Tracing is NOT composable: every ORC run traces, this one included. Follow
`.claude/skills/_shared/phases/trace.md` (load it at run start) — this
block is stitched into every compiled flow so a user-composed pipeline can never
be the one lane that runs blind.

**Run start:** create `log_dir`, write `log_dir/.current` =
`run-diy-<slug>-<DDMMYY>-<HHMMSS>.txt` AND `touch the trace file` of that name
in the SAME step (a pointer naming a file that does not exist reads as dangling —
the hook rotates away from it and the run splits across two files), then store
`trace_path` in the checkpoint. The lane token is `diy`, whatever the flow is
named.

**Narration is dispatched, never remembered:** record each event with its REAL
timestamp into a phase packet (`PHASE`, `DISPATCH`/`VERIFY` per spawn —
`actual_model`/`actual_effort` vs expected, surface any ⛔ DOWNGRADE to the user
— `SCORE`, `OUTCOME`, `GATE`, `FINDING`/`VERDICT` for whichever gates this flow
enabled, `FINISH`, plus `decisions` = the WHY), then dispatch
`orc-trace-writer-haiku-4-5` with it, PAIRED with the next phase's first
dispatch. **One packet per ENABLED phase group, minimum 2** — the flow shape is
composed, so the packet count is too; a phase this flow turned OFF owes nothing.
A phase ending with `zero new trace lines is a protocol violation`.

**Run end:** the `FINISH` packet goes out and RETURNS, then delete
`log_dir/.current`.
