# Shared contract — Fable 5 role override (hard-gated)

Canonical rule for routing selected roles to Fable 5 agents. Consumed by the
full orc spine and the ultra lane; the lint pins the `fable5-override.md` pointer
into every lane that honors it.

## The gate

Read the resolved config at run start (`config.md` defaults ← `orc.config.yaml`).
The override is **hard-gated**: absolutely nothing changes unless
`fable5_enabled: true`. When it is false (the default), dispatch every role
exactly as today — this file is inert.

## The mapping (only when `fable5_enabled: true`)

For each role listed in `fable5_roles` (a subset of
`analyze, plan, advisor, judge, review`), dispatch the Fable 5 variant agent
**instead of** the default role agent — same task slice, same return contract,
same phase:

| Role token | Default agent | Fable 5 variant |
|-----------|---------------|-----------------|
| `analyze` | `orc-system-analyst-opus-4-8-high` | `orc-analyst-fable-5` |
| `plan`    | `orc-planner-opus-4-8-med`         | `orc-planner-fable-5` |
| `advisor` | `orc-advisor-opus-4-8-max`         | `orc-advisor-fable-5` |
| `judge`   | `orc-judge-opus-4-8-max`           | `orc-judge-fable-5` |
| `review`  | `orc-reviewer-opus-4-8-high`       | `orc-reviewer-fable-5` |

A role NOT in `fable5_roles` keeps its default agent. `advisor` and `judge` are
ultra-lane only — they take effect solely under `/orc-ultra`, and only when
explicitly selected. `fable5_enabled: true` with an empty `fable5_roles` does
nothing (the CLI warns on set).

## Effort

The Fable 5 agents' effort is `fable5_effort` (enum `medium | high | xhigh |
max`, default `medium`). Effort lives in each agent's frontmatter; the
`orc config set fable5_effort <v>` CLI rewrites the `effort:` line of the
installed copies deterministically — the skill never edits agent files.

## Why it's safe

Fable 5 is a strictly-capable model (it never downgrades a subagent), so a
Fable 5 role agent runs at or above the baseline. The `CONFIG` trace line at
Phase 1 records the resolved `fable5_*` values, so `/orc-retro` can audit that a
run's dispatch honored the config.
