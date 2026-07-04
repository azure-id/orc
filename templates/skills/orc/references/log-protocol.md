# Reference — Decision Log Protocol

How workers pass knowledge across waves without peer-to-peer IPC. Load during
Phase 3.

## What it is

- File: `run/{title}-{subtitle}-{DDMMYY}.md`. Append-only.
- Workers read a COMPACTED DIGEST at start (via their slice's `log_digest`
  field) and return `log_entries[]` at end; the ORCHESTRATOR appends them.
- Holds: cross-cutting decisions, discovered constraints, interface changes,
  broadcast escalation answers.
- Deleted on successful completion. (Checkpoint survives; the log does not.)
- Log = agent knowledge. Checkpoint = orchestration state. Never mix them.

## Write discipline (no corruption)

1. Every entry prefixed with **agent-id + millisecond timestamp**:
   `[Agent-C | 020726 14:28:41.507] <entry>`
   Agent-id makes same-millisecond writes still distinct.
2. Append-only; no edits to existing lines. One logical entry = one atomic append.
3. Accept a bloated raw log — it's the audit trail. Clarity beats size.

## Compaction (what workers actually read)

1. Before each wave, YOU produce a compacted digest: dedup, sort by timestamp,
   drop superseded decisions, group by area, keep only what's relevant to the
   upcoming tasks' areas.
2. **Compact a COPY** (digest passed inline in slices, or
   `run/{...}-digest.md` regenerated per wave). NEVER mutate the raw log.

## Entry tags (so the compactor can group and workers can scan)

```
[Agent-A | 020726 14:25:10.001] DECISION: notification.type enum = {in_app, email, system}.
[USER via Agent-C | 020726 14:28:41.507] ANSWER: digest send = 07:00 fixed.
[Agent-D | 020726 14:31:02.118] CONSTRAINT: pref model includes digest_frequency.
[Agent-B | 020726 14:33:40.020] INTERFACE: NotificationAPI.list(paginated) — consumers use cursor param.
```
