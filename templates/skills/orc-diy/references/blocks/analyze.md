## Phase: Analyze (doc intake)

<!-- diy:when analyze=off -->
Document analysis is DISABLED in this flow. If the user supplies a
requirements document, tell them this flow skips analysis and will plan
directly from their stated intent; offer `/orc-analyze` as a standalone step
if they want the doc grounded first.
<!-- /diy:when -->
<!-- diy:when analyze=mini -->
When the request includes a document (PDF path or pasted), dispatch the
trimmed analyst: follow `.claude/skills/orc-analyze-mini/SKILL.md` and hand
its requirement spec to planning. No doc → go straight to planning.
<!-- /diy:when -->
<!-- diy:when analyze=full -->
When the request includes a document (PDF path or pasted), dispatch the full
System Analyst: follow `.claude/skills/orc-analyze/SKILL.md` (the orchestrator
dispatches; it never analyzes itself) and hand the requirement spec to
planning. No doc → go straight to planning.
<!-- /diy:when -->
<!-- diy:when analyze=auto -->
Route doc intake exactly as the full lane does: a document present triggers
the System Analyst per the intake rules in
`.claude/skills/orc/references/intake.md`; otherwise proceed to planning.
<!-- /diy:when -->
