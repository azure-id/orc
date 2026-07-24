# ORC Agents — Roster, Model Mapping & Verification

Single-role, model-specific agents. The orchestrator dispatches BY AGENT NAME —
model is pinned in frontmatter, not requested in prose. No agent is multi-role.

## Executors (score-mapped by the single 8-band table in config.md)

| Score band | Agent | Model | Effort |
|-----------|-------|-------|--------|
| [0,30)   | orc-executor-haiku-4-5       | claude-haiku-4-5  | — (no ladder) |
| [30,40)  | orc-executor-sonnet-4-6-med  | claude-sonnet-4-6 | medium |
| [40,55)  | orc-executor-sonnet-4-6-high | claude-sonnet-4-6 | high |
| [55,65)  | orc-executor-sonnet-5-high   | claude-sonnet-5   | high |
| [65,70)  | orc-executor-opus-4-7-med    | claude-opus-4-7   | medium |
| [70,80)  | orc-executor-opus-4-7-high   | claude-opus-4-7   | high |
| [80,90)  | orc-executor-opus-4-8-high   | claude-opus-4-8   | high |
| [90,100] | orc-executor-opus-5-high     | claude-opus-5     | high |

Score→executor mapping lives in config.md (one canonical 8-band table;
`rubric_bands` is granularity only, not a preset selector).

## Fixed-role agents

| Agent | Model | Effort | Role |
|-------|-------|--------|------|
| orc-system-analyst-opus-4-8-high | claude-opus-4-8 | high | doc analysis |
| orc-planner-opus-4-8-med | claude-opus-4-8 | medium | planning |
| orc-reviewer-opus-4-8-high | claude-opus-4-8 | high | review |
| orc-verifier-opus-4-8-high | claude-opus-4-8 | high | verify (+ /orc-verify) |
| orc-test-author-opus-4-8-high | claude-opus-4-8 | high | test authoring (opt-in Phase 6.5; writes tests, never runs) |
| orc-analyze-mini-sonnet-5-high | claude-sonnet-5 | high | mini analysis |
| orc-planner-mini-sonnet-5-high | claude-sonnet-5 | high | mini planning |
| orc-scout-sonnet-4-6-high | claude-sonnet-4-6 | high | deep-analysis code scout (read-only) |
| orc-context-combiner-opus-4-8-high | claude-opus-4-8 | high | combine 2+ related analyses (full lane) |
| orc-pattern-codifier-sonnet-5-high | claude-sonnet-5 | high | reconcile per-language playbook vs. project files → cached code-pattern (opt-in) |
| orc-retro-sonnet-5-high | claude-sonnet-5 | high | mine behavior traces → calibration report (/orc-retro; read-only) |
| orc-advisor-opus-4-8-max | claude-opus-4-8 | max | ultra Phase U0 advisory brief + rubric + clarification questions (read-only; /orc-ultra only) |
| orc-judge-opus-4-8-max | claude-opus-4-8 | max | ultra judgment gates — analysis / plan / implementation (read-only; /orc-ultra only) |
| orc-claude-writer-opus-4-8-high | claude-opus-4-8 | high | scan repo → write/refresh the local CLAUDE.md (/orc-claude only; zero questions) |
| orc-trace-writer-haiku-4-5 | claude-haiku-4-5 | — (no ladder) | append one phase block of behavior-trace narration from an orchestrator packet (every trace-owning lane; append-only, never reads source) |

## Fable 5 role-override agents (hard-gated; dispatched only when configured)

Used ONLY when `fable5_enabled: true` and the role is in `fable5_roles` — each
replaces its default role agent with the same slice/contract. Effort defaults to
`medium` and is rewritten in-place by `orc config set fable5_effort <v>`.

| Agent | Model | Effort | Replaces |
|-------|-------|--------|----------|
| orc-analyst-fable-5 | claude-fable-5 | fable5_effort | orc-system-analyst-opus-4-8-high |
| orc-planner-fable-5 | claude-fable-5 | fable5_effort | orc-planner-opus-4-8-med |
| orc-advisor-fable-5 | claude-fable-5 | fable5_effort | orc-advisor-opus-4-8-max (ultra) |
| orc-judge-fable-5 | claude-fable-5 | fable5_effort | orc-judge-opus-4-8-max (ultra) |
| orc-reviewer-fable-5 | claude-fable-5 | fable5_effort | orc-reviewer-opus-4-8-high |

Mini execution reuses orc-executor-sonnet-5-high. Fast-lane (orc-fast)
execution reuses orc-executor-sonnet-4-6-high — no dedicated agent.

The scout is dispatched only in the System Analyst's DEEP mode: the orchestrator
fans out ≤`config.max_scouts` (default 3) parallel scouts, one per coverage area
from the analyst's scout plan, and feeds their evidence bundles back to the
analyst for pass 2. Scouts are read-only and never analyze/plan/edit.

The orchestrator (main session) is NOT an agent file.

## ⚠ VERIFY IN YOUR ENVIRONMENT

Model IDs use the Platform/API dateless format (confirmed at
platform.claude.com/docs/en/about-claude/models/model-ids-and-versions):
claude-haiku-4-5, claude-sonnet-4-6, claude-sonnet-5, claude-opus-4-7,
claude-opus-4-8, claude-opus-5 (the top executor band), and claude-fable-5 (the
Fable 5 role-override agents).

1. **Run `/agents`** to confirm Claude Code accepts these full IDs in agent
   frontmatter — in particular `claude-haiku-4-5` and `claude-fable-5`, the two
   newest ids. If it wants short aliases (opus/sonnet/haiku) or dated IDs, adjust
   each `model:` field. The full IDs are valid at the API level but Claude Code
   may normalize differently.
2. **Confirm `effort:` is a valid CLI frontmatter field.** If the CLI ignores
   it, effort must be conveyed in the dispatched prompt instead.
3. **Run `/doctor`** for duplicate-name or load errors after any edit.

## ⚠ COST-TIER FALLBACK (the original "wrong model" bug)

A subagent's model cannot exceed the MAIN session's cost tier — request pricier
and it silently falls back to the main model. **Run your main Claude Code
session on Opus** or every opus-* agent downgrades to Sonnet — and the [90,100]
band needs an **Opus 5** main session or it lands on Opus 4.8. Verify by
expanding a subagent's tool-call in the transcript to see the model it ran.

## How dispatch works

- Score a task → config preset maps score to an executor agent → dispatch that
  agent BY NAME with the task slice.
- Fixed roles dispatch their named agent directly (analyst/planner/reviewer/
  verifier, mini variants).
- Every agent is single-role and self-contained (embedded procedure), so a
  dispatched agent needs no external skill-loading to function.
