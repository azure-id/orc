---
description: System Analyst — turn a doc (PDF/pasted) into a scope-bounded, code-grounded requirement report before planning
---

Use the **orc-analyze** skill (System Analyst). It ingests the document, runs
the Standard-vs-Deep gate and WAITS for your choice, bounds the work to the
requested scope, and maps each requirement to real code with quote-anchored
evidence. It writes the report and the derived spec into
`orc/analyzer/{name}/` (a copy goes to `analyst_report/{name}/` only when you
stop at the report). The orchestrator dispatches the analysis to a
subagent.

Document / scope: $ARGUMENTS
