---
name: orc-analyze-mini
description: >
  Fast-lane System Analyst for ORC-MINI. Sonnet 5 high effort.
  Same purpose and artifacts as orc-analyze but with trimmed depth
  for speed and token savings. Use for "/orc-analyze-mini" or when
  orc-mini needs doc analysis. The orchestrator dispatches this to a subagent —
  it never analyzes itself.
---

# ORC-ANALYZE-MINI

The fast variant of the System Analyst, dispatched by orc-mini as a Sonnet 5
high subagent. Produces the SAME artifacts and follows the SAME output contract
as the full analyst (`../orc-analyze/`) — read its schemas
(report-audit.md, report-prose.md, report-requirement.md, requirement-spec.md)
for the formats; this skill does not duplicate them.

## What's trimmed vs the full analyst

- **Shallower code grounding.** Confirms the obvious file mappings and the
  clearest divergences; does not exhaustively trace every reference.
- **Fewer challenge rounds.** Raises only the high-signal scope/accuracy issues
  (clear scope-bleed, clear stale audit premises), not every minor ambiguity.
- **No deep mode, no scouts.** Always single-pass. If the requirement clearly
  needs a wider sweep / verify-every-claim / approach trade-offs, tell the user
  it may warrant the full `/orc-analyze` (Opus 4.8 high, deep) and let them choose.
- **Model:** Sonnet 5, high effort.

## What's identical

- **Doc-optional intake:** auto-detect + confirm mode — prose / audit
  (documents) or **requirement** (NO doc; the user's request is the source of
  truth, reconciled against code).
- **Evidence-or-mark:** every code claim / interpretation is grounded with
  `file:line`, OR tagged `ASSUMPTION`/`UNVERIFIED` and turned into a question —
  never a silent guess.
- **Recommended-option challenges:** each challenge is a 2–3 option set with one
  flagged recommended option + reason, one at a time.
- Recognize-to-exclude: report contains ONLY the requested scope.
- Two artifacts, spec derived from the confirmed report, same folder
  `orc/analyzer/{analysis-name}/` (internal; copied out only on report-only),
  including the Evidence column and Assumptions & Open Questions section.
- Same branch: report-only, or take into build (hand both files to orc-mini,
  which continues with the mini planner).
