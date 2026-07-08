# ORC Agents — Roster, Model Mapping & Verification

Single-role, model-specific agents. The orchestrator dispatches BY AGENT NAME —
model is pinned in frontmatter, not requested in prose. No agent is multi-role.

## Executors (score-mapped; preset chosen by config.rubric_bands)

| Agent | Model | Effort |
|-------|-------|--------|
| orc-executor-sonnet-4-6-med  | claude-sonnet-4-6 | medium |
| orc-executor-sonnet-4-6-high | claude-sonnet-4-6 | high |
| orc-executor-sonnet-5-high   | claude-sonnet-5   | high |
| orc-executor-opus-4-7-med    | claude-opus-4-7   | medium (narrow preset) |
| orc-executor-opus-4-7-high   | claude-opus-4-7   | high (wide preset) |
| orc-executor-opus-4-8-high   | claude-opus-4-8   | high |

Score→executor mapping lives in config.md (narrow vs wide preset).

## Fixed-role agents

| Agent | Model | Effort | Role |
|-------|-------|--------|------|
| orc-system-analyst-opus-4-8-high | claude-opus-4-8 | high | doc analysis |
| orc-planner-opus-4-8-med | claude-opus-4-8 | medium | planning |
| orc-reviewer-opus-4-8-high | claude-opus-4-8 | high | review |
| orc-verifier-opus-4-8-high | claude-opus-4-8 | high | verify (+ /orc-verify) |
| orc-test-author-opus-4-8-high | claude-opus-4-8 | high | test authoring (opt-in Phase 6.5; writes tests, never runs) |
| orc-mini-analyst-sonnet-5-high | claude-sonnet-5 | high | mini analysis |
| orc-mini-planner-sonnet-5-high | claude-sonnet-5 | high | mini planning |
| orc-scout-sonnet-4-6-high | claude-sonnet-4-6 | high | deep-analysis code scout (read-only) |
| orc-context-combiner-opus-4-8-high | claude-opus-4-8 | high | combine 2+ related analyses (full lane) |

Mini execution reuses orc-executor-sonnet-5-high.

The scout is dispatched only in the System Analyst's DEEP mode: the orchestrator
fans out ≤`config.max_scouts` (default 3) parallel scouts, one per coverage area
from the analyst's scout plan, and feeds their evidence bundles back to the
analyst for pass 2. Scouts are read-only and never analyze/plan/edit.

The orchestrator (main session) is NOT an agent file.

## ⚠ VERIFY IN YOUR ENVIRONMENT

Model IDs use the Platform/API dateless format (confirmed at
platform.claude.com/docs/en/about-claude/models/model-ids-and-versions):
claude-sonnet-4-6, claude-sonnet-5, claude-opus-4-7, claude-opus-4-8.

1. **Run `/agents`** to confirm Claude Code accepts these full IDs in agent
   frontmatter. If it wants short aliases (opus/sonnet) or dated IDs, adjust each
   `model:` field. The full IDs are valid at the API level but Claude Code may
   normalize differently.
2. **Confirm `effort:` is a valid CLI frontmatter field.** If the CLI ignores
   it, effort must be conveyed in the dispatched prompt instead.
3. **Run `/doctor`** for duplicate-name or load errors after any edit.

## ⚠ COST-TIER FALLBACK (the original "wrong model" bug)

A subagent's model cannot exceed the MAIN session's cost tier — request pricier
and it silently falls back to the main model. **Run your main Claude Code
session on Opus** or every opus-* agent downgrades to Sonnet. Verify by
expanding a subagent's tool-call in the transcript to see the model it ran.

## How dispatch works

- Score a task → config preset maps score to an executor agent → dispatch that
  agent BY NAME with the task slice.
- Fixed roles dispatch their named agent directly (analyst/planner/reviewer/
  verifier, mini variants).
- Every agent is single-role and self-contained (embedded procedure), so a
  dispatched agent needs no external skill-loading to function.
