---
name: orc-advisor
description: >
  Pre-analysis Advisor for the ORC ultra lane. Runs ONCE at ultra Phase U0
  (after intake, before the analyst) to produce a code-grounded advisory
  brief: domain risks, alternatives, a mandatory security-risk section, a
  request-specific rubric the ultra judges score against, open questions
  (relayed to the user in one batch), and the seed of the run's assumption
  ledger. Dispatched only from /orc-ultra — no slash command of its own, never
  in orc or orc-mini. The orchestrator dispatches the advisor subagent — it
  never advises itself.
---

# ORC-ADVISOR (ultra-lane advisory brief)

Ultra-complex tasks fail on wrong interpretation, silent assumptions, and
generic quality bars. The Advisor front-loads the fix: one max-effort pass
that frames the request against the REAL codebase and hands every downstream
role — analyst, planner, judges, executors — the same request-specific brief.

Ultra lane ONLY. There is no `/orc-advisor` command; the orchestrator
dispatches `orc-advisor-opus-5-xhigh` at Phase U0 of an `/orc-ultra` run.
Cost is accepted by definition of the lane — no consent prompt.

## Hard rules

1. **The orchestrator never advises — it spawns.** Dispatch
   `orc-advisor-opus-5-xhigh` with the slice below; the advisor writes the
   brief; the orchestrator relays and injects.
2. **The advisor is read-only on the project** (Read/Glob/Grep + Bash for
   git introspection). It never edits code, never spawns subagents.
3. **One dispatch per run.** The advisor is never re-dispatched for
   revisions — post-brief quality is the judges' job.
4. **The brief is injected LITERALLY** (never a file pointer) into the
   analyst slice, the planner slice, all three judge slices, and — as
   advisory notes — the executor slices.
5. **The security section may not be skipped.** "No security surface" is a
   legitimate conclusion but must be stated with reasoning.

## Dispatch slice (orchestrator → advisor)

- The user's request verbatim (plus the doc path when one exists).
- The run-folder path for `advisory-brief.md`.
- Detected stack summary (from intake — never re-detected).

## Brief contents (see the agent file for the full section spec)

Risks & pitfalls (anchored) · alternatives + trade-offs · security risks
(mandatory) · the three-part RUBRIC (correct analysis / correct plan /
faithful implementation) · open questions with proposed defaults · seed
assumption-ledger entries.

## Return contract

`brief_path`, `open_questions[]`, `assumptions[]`, `actual_model` (verbatim
from the agent's system-prompt model-id line), `actual_effort`
($CLAUDE_EFFORT). The orchestrator validates the return, emits the `ADVISE`
trace line when logging, relays the open questions to the user in ONE batched
round, folds the answers into the intent-spec, and records unanswered
defaults as UNCONFIRMED in the assumption ledger.
