---
description: System Analyst — turn a doc (PDF/pasted) into a scope-bounded, code-grounded requirement report before planning
---

Use the **orc-analyze** skill (System Analyst). Ingest the provided
document, auto-detect and confirm its mode (prose vs audit), bound to the
requested scope only (recognize other scopes only to exclude them), map each
requirement/row to real files and verify against code, and challenge scope +
accuracy issues one at a time. Write the human report + derived requirement
spec into `analyst_report/{name}/`, then offer to take it into a build or leave
it as a report. The orchestrator dispatches the analysis to a subagent.

Document / scope: $ARGUMENTS
