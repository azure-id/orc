---
description: Mine the ORC behavior traces — per-band calibration, downgrades, pipeline leaks (read-only report)
---

Use the **orc-retro** skill. **P0 preflight first:** verify a delivery channel
exists — the gh CLI (authed) or a GitHub MCP server; if NEITHER is available,
do not run the retro at all (the report must land upstream or it's pointless).
Then: read the persistent behavior traces in `log_dir` (written by runs with
config `logging: true`), dispatch the retro miner subagent to aggregate
per-band outcomes (retries, requeues, needs_context, unmet), tier downgrades,
and pipeline leaks, write the AI-readable calibration report to
`log_dir/retro/`, and DELIVER it to the ORC repo (`retro_repo` config, default
azure-id/orc) as a PR — issue fallback — showing the created URL. Never edits
the rubric, skills, or code locally. If no traces exist, say how to enable
logging and stop.

Optional trace subset / date range: $ARGUMENTS
