# Fallback handoff (orc-fast → orc-mini)

Canonical contract for the fast lane's fallback. orc-fast WRITES this block;
orc-mini READS it. Fallback is the router — orc-fast never stops the chat.

## The block (written into the shared run folder)

```
FALLBACK-FROM: orc-fast
REASON: wiki-absent | wiki-stale-user-choice | pattern-absent | fit-gate | smoke-red-escalation
INTENT-SPEC: <path to the intent-spec if fast's Phase F1 completed, else "none — raw request follows">
REQUEST: <the raw user request, verbatim>
```

## Writer side (orc-fast)

Announce which prerequisite/gate failed in one line, write the block, invoke
orc-mini pointing at it. The run folder is already in the shared
`.claude/skills/orc/run/{run-slug}/` format — no migration, no new slug.

## Reader side (orc-mini)

On entry: acknowledge the fallback + reason in one line, then run the normal
mini lane — but SKIP re-deriving anything carried over:

- An attached INTENT-SPEC replaces the Phase 0 draft (still do the soft
  sign-off).
- Reuse the run folder and slug.
- `REASON: smoke-red-escalation` means code was already written — start from
  the failing state, not from scratch.
