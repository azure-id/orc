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
| wiki scan | `orc-wiki-scanner-opus-4-8-high` | `orc-wiki-scanner-opus-5-med` |
| claude write | `orc-claude-writer-opus-4-8-high` | `orc-claude-writer-opus-5-med` |
| retro mine | `orc-retro-sonnet-5-high` | `orc-retro-opus-5-med` |

The nine roles already pinned to `claude-opus-5` — analyst, planner, reviewer,
verifier, test-author, combiner, learn-writer, advisor, judge — are already
compliant and dispatch unchanged (their efforts are NOT rewritten by this mode).

## Out of scope — never forced

- **`orc-trace-writer-haiku-4-5` stays Haiku 4.5.** It transcribes a packet the
  orchestrator hands it — no reasoning, no source reads. It is never in the
  roster.
- **`orc-diy`.** Its score table is compile-owned (`orc diy compile` →
  `flow.lock.json`); a DIY flow dispatches whatever its lock says. Re-compile to
  change it.

## It FORCES — precedence is flat while ON

`opus5_only: true` outranks every other dispatch selector:

- each role's default frontmatter pin;
- **`fable5_enabled` / `fable5_roles`** — the Fable 5 role override is fully
  INERT while the mode is on (`../_shared/fable5-override.md` does not apply);
- **`rubric_bands_override`** — a hand-written executor table is ignored while
  the mode is on.

Turning the mode off restores all three. `rubric_bands` remains granularity
only, never a preset selector, in both modes.

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
