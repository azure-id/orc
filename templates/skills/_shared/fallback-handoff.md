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
`.claude/orc/run/{run-slug}/` format — no migration, no new slug.

## Reader side (orc-mini)

On entry: acknowledge the fallback + reason in one line, then run the normal
mini lane — but SKIP re-deriving anything carried over:

- An attached INTENT-SPEC replaces the Phase 0 draft (still do the soft
  sign-off).
- Reuse the run folder and slug.
- `REASON: smoke-red-escalation` means code was already written — start from
  the failing state, not from scratch.

## What carries over

| Carries over | The receiver RE-DERIVES | On conflict |
|---|---|---|
| The user's original request, verbatim | The knowledge gate (wiki tier, pattern, and its own probes) | The receiver's own probe wins |
| Why the handoff fired — the exact failed prerequisite | The plan, the scoring, the waves | — |
| Anything the user already confirmed in this session | Every file claim the sender made | HOST code wins |

The middle column is the point: a receiving lane must not inherit the sender's
findings as fact. An inherited claim is a HINT with a known author, never
evidence — re-anchor it or drop it.
