---
name: orc-pr
description: >
  Ship-phase subskill for ORC Phase 8. Handles commit, push, and PR
  file generation from the team's template (pr.md in this folder). Coordination
  skill: always runs inline. Not for direct user invocation.
---

# orc-pr

## Input slice

- ticket, pr_title, target_branch  — asked together by the orchestrator
- changed_files[] / commit_range
- template_ref = subskills/orc-pr/pr.md  — the team's PR template (user-provided)
- build_green: bool — MUST be true; refuse commit otherwise (hard rule 8)

## Procedure

1. Gate: build_green must be true. If not, return failure — never commit red.
2. Show the current branch to the user via the orchestrator before committing.
3. Commit (message referencing the ticket) → push → generate the PR file:
   - Read pr.md as the template. Fill its sections from the run: intent-spec
     scope, task summary, test results, verify outcome.
   - Filename: run/{ticket}-{sanitized-title}.md
     (lowercase, spaces→hyphens, strip anything unsafe for filenames)
4. PR targets `target_branch` as base.

## Return contract

- { pr_file_path, commit_result, push_result, pr_result }
- failure_reason on any failed step (the why). Malformed = failure to caller.

## Template

The file `pr.md` in this folder is the team's default PR template. Replace the
placeholder with your real template — the skill reads whatever is there.
