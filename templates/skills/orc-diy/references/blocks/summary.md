## Phase: Summary

<!-- diy:when summary=off -->
No summary phase: end after ship with a single line (tasks done / gate color
/ ship action taken) plus usage, and note which phases this flow skipped.
<!-- /diy:when -->
<!-- diy:when summary=short -->
Short summary: one paragraph — what was built, gate results, ship action,
skipped phases, and usage. No per-task breakdown.
<!-- /diy:when -->
<!-- diy:when summary=full -->
Full summary exactly as the full lane's final phase: per-task outcomes with
models used, findings outcomes, verify results, ship action, skipped
phases, and usage.
<!-- /diy:when -->

Always name the phases this flow skipped by config — the user must never
mistake a DIY run for a full-lane run.
