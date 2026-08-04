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
- stacked_pr, stacked_pr_loc, stacked_pr_files, stacked_pr_max_layers — the
  stack-gate config (`../../config.md`)

## Procedure

1. Gate: build_green must be true. If not, return failure — never commit red.
2. **Stacked-PR gate (load `stack-gate.md` — full `/orc` + `/orc-ultra` only).**
   Measure the change, compare against `stacked_pr_loc` / `stacked_pr_files`, and
   on a tripped threshold ask the ONE P0 question. "Yes" (with a ticket AND a
   resolved PR template) → write `stacked-pr/<slug>/STACK-FROM.md` and hand off to
   `/orc-pr-setup` → `/orc-pr-driver`; anything else (under threshold, `off`,
   declined, no ticket, no template) → continue this procedure as one regular PR.
3. Show the current branch to the user via the orchestrator before committing.
4. Commit (message referencing the ticket) → push → generate the PR file:
   - Read pr.md as the template. Fill its sections from the run: intent-spec
     scope, task summary, test results, verify outcome.
   - Filename: run/{ticket}-{sanitized-title}.md
     (lowercase, spaces→hyphens, strip anything unsafe for filenames)
5. PR targets `target_branch` as base.

## Return contract

- { pr_file_path, commit_result, push_result, pr_result }
- `stack_gate`: { tripped: bool, loc, files, decision: `under-threshold` | `off` |
  `declined` | `no-ticket` | `no-template` | `handoff`, slug } — always present in
  full `/orc` / `/orc-ultra`; `handoff` means no PR was created here.
- failure_reason on any failed step (the why). Malformed = failure to caller.

## Template

The file `pr.md` in this folder is the team's default PR template. Replace the
placeholder with your real template — the skill reads whatever is there. Template
resolution when it is still the placeholder (project `.github/`, `docs/`,
`CLAUDE.md`, or three recommended options) is
`../../../_shared/pr-templates.md` — shared with the stacked-PR lanes.
