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
(report-audit.md, report-prose.md, requirement-spec.md) for the formats; this
skill does not duplicate them.

## What's trimmed vs the full analyst

- **Shallower code grounding.** Confirms the obvious file mappings and the
  clearest doc-vs-code divergences; does not exhaustively trace every reference.
- **Fewer challenge rounds.** Raises only the high-signal scope/accuracy issues
  (clear scope-bleed, clear stale audit premises), not every minor ambiguity.
- **Model:** Sonnet 5, high effort.

## What's identical

- Auto-detect + confirm doc mode (prose vs audit).
- Recognize-to-exclude: report contains ONLY the requested scope.
- Two artifacts, spec derived from the confirmed report, same folder
  `orc/analyzer/{analysis-name}/` (internal; copied out only on report-only).
- Same branch: report-only, or take into build (hand both files to orc-mini,
  which continues with the mini planner).
- Interactive challenges, one at a time; plain-language handoffs.

If mid-analysis the doc proves too complex or high-risk for the shallow pass,
tell the user it may warrant the full `/orc-analyze` (Opus 4.8 high)
and let them choose.
