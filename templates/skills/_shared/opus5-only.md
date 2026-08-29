# Shared contract — Opus-5-only dispatch mode (hard-gated, forcing)

Canonical rule for routing EVERY dispatched role to Opus 5. Consumed by the full
orc spine, the ultra lane, and every lane with a fixed-role dispatch; the lint
pins the `opus5-only.md` pointer into each of them.

## The gate

Read the resolved config at run start (`config.md` defaults ← `orc.config.yaml`).
The mode is **hard-gated**: absolutely nothing changes unless `opus5_only: true`.
When it is false (the default), dispatch every role exactly as today — this file
is inert.

## The mapping (only when `opus5_only: true`)

**Scored executors** — one model, EFFORT as the cost dial, replacing the 8-band
mixed-model table:

| Score | Executor agent |
|-----------|---------------------------|
| `[0,40)`   | `orc-executor-opus-5-low`  |
| `[40,80)`  | `orc-executor-opus-5-med`  |
| `[80,100]` | `orc-executor-opus-5-high` |

**Fixed roles** — dispatch the Opus 5 variant **instead of** the default role
agent: same task slice, same return contract, same phase.

| Role | Default agent | Opus-5-only variant |
|------|---------------|---------------------|
| mini executor | `orc-executor-sonnet-5-high` | `orc-executor-opus-5-low` |
| fast executor | `orc-executor-sonnet-4-6-high` | `orc-executor-opus-5-low` |
| mini analyze | `orc-analyze-mini-sonnet-5-high` | `orc-analyze-mini-opus-5-med` |
| mini plan | `orc-planner-mini-sonnet-5-high` | `orc-planner-mini-opus-5-med` |
| scout | `orc-scout-sonnet-4-6-high` | `orc-scout-opus-5-low` |
| pattern codify | `orc-pattern-codifier-sonnet-5-high` | `orc-pattern-codifier-opus-5-med` |
| wiki scan | `orc-wiki-scanner-opus-4-8-high` (deep) **or** `orc-wiki-scanner-sonnet-5-high` (light) | `orc-wiki-scanner-opus-5-med` |
| claude write | `orc-claude-writer-opus-4-8-high` | `orc-claude-writer-opus-5-med` |
| retro mine | `orc-retro-sonnet-5-high` | `orc-retro-opus-5-med` |

The nine roles already pinned to `claude-opus-5` — analyst, planner, reviewer,
verifier, test-author, combiner, learn-writer, advisor, judge — are already
compliant and dispatch unchanged (their efforts are NOT rewritten by this mode).

**The wiki scan tier ladder (v0.46.0) adds NO row here, and needs no new pair.**
Off, the ladder picks deep or light per delta. ON, this mode already forces the
wiki scanner to `orc-wiki-scanner-opus-5-med` — so **both tiers collapse onto that
one shipped agent** and the ladder simply stops applying. A cheaper Opus 5 scanner
variant for the light tier does not exist and must never be added: a pair for a
tier that cannot occur while the flag is on is exactly the phantom this table
exists to prevent. Ladder: `../orc-wiki/references/partial-refresh.md`.

## Out of scope — never forced

- **`orc-trace-writer-haiku-4-5` stays Haiku 4.5.** It transcribes a packet the
  orchestrator hands it — no reasoning, no source reads. It is never in the
  roster.
- **`orc-diy`.** Its score table is compile-owned (`orc diy compile` →
  `flow.lock.json`); a DIY flow dispatches whatever its lock says. Re-compile to
  change it.
- **`orc-quick` — the ONE exception to the flat precedence below.** Its dispatch
  gate asks the USER which agent to spawn before every single dispatch, and that
  hard gate is the lane's entire premise. A forcing mode that collapsed the menu
  to one option would silently delete it, so the mode is fully INERT there:
  `opus5_only` is neither read nor honored by `orc-quick`. When the mode is on,
  the lane SAYS so at the gate (`orc-quick ignores opus5_only — both options are
  live`), because a shadowed setting must never be silent in either direction.
- **`/orc-challenge` — UNAFFECTED, not exempt.** All three of its agents are
  already `claude-opus-5` (judge high, advisor medium, reader low), so the mode
  has nothing to force: zero new pairs, no rename churn, no roster row. The
  reader's `low` effort is a MEASUREMENT choice, not a cost one — a
  harder-thinking cold reader reasons around exactly the gaps D4 exists to find
  — so nothing may ever "upgrade" it.
  See `orc-quick/references/dispatch-gate.md`.

## It FORCES — precedence is flat while ON

`opus5_only: true` outranks every other dispatch selector:

- each role's default frontmatter pin;
- **`rubric_bands_override`** — a hand-written executor table is ignored while
  the mode is on.

Turning the mode off restores both. `rubric_bands` remains granularity
only, never a preset selector, in both modes.

The forcing is flat across every lane that HONORS the mode — `orc-quick` does
not, per "Out of scope" above.

### `orc extra` sits ABOVE the mode, and it is not a fourth thing it overrides

Extra decides **whether a Claude agent runs at all**. `opus5_only` and the score
tables only decide WHICH Claude agent runs where extra did not take it. So the
mode is neither shadowed nor shadowing — it is simply **NOT CONSULTED** for the
work extra took:

- **a scored task** — an extra route row covering that score outranks the mode;
  every score no row covers still resolves on the Opus 5 ladder.
- **a POSITION** (v0.55.0 — `quick-executor`, `fast-executor`, `doc-writer`,
  `doc-checker`, `wiki-scanner-deep`, `wiki-scanner-light`) — an extra slot row
  holding that position outranks the mode's variant of that slot's agent; **a
  position with no row is fully governed by the mode.** With `doc-writer` routed
  and `doc-checker` not, `opus5_only` is entirely live for the checker.

"Not consulted for that slot" and "inert" are different claims, and only the
first one is true. `orc config list` and `orc config set` NAME the taken bands
AND the taken positions for exactly that reason: a shadowed setting must never
be silent, and neither must a partly shadowed one.

Both wiki slots collapse onto `orc-wiki-scanner-opus-5-med` while the mode is on,
which is why the slot table adds **no agent and no pair**. A slot names the
POSITION, not the model.

## Tier honesty

A subagent can never outrank the main session. With the mode ON, EVERY dispatch
needs an Opus 5 main session — not just the top executor band. On a lower
session every role silently falls back to the session model and the tier-honesty
rule (`return-validation.md`) reports a downgrade on **every** return. That is
correct behavior, not a bug: hooks cannot block on model, only on effort, so the
`orc config set opus5_only true` notice is the only up-front warning.

This also means `orc-fast`'s "the orchestrator runs fine at Sonnet medium" holds
only while the mode is OFF. The effort guard is unchanged — it still matches the
exact skill name `orc`, and orc-fast is never added to it.

## Trace

Phase 1's `CONFIG` line always records the resolved `opus5_only`, so
`/orc-retro` can segment per-band outcomes BY dispatch mode.
