---
description: Mine the ORC behavior traces — per-band calibration, downgrades, pipeline leaks (read-only report)
---

Use the **orc-retro** skill: read the persistent behavior traces in `log_dir`
(written by runs with config `logging: true`), dispatch the retro miner
subagent to aggregate per-band outcomes (retries, requeues, needs_context,
unmet), tier downgrades, and pipeline leaks, then write the calibration report
to `log_dir/retro/` and show the summary. Read-only and report-only — never
edits the rubric, skills, or code; recommendations are for you to apply. If no
traces exist, say how to enable logging and stop.

Optional trace subset / date range: $ARGUMENTS
