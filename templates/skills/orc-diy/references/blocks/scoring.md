## Phase: Task scoring → executor selection

<!-- diy:when scoring=on -->
Score each task 0–100 with the full lane's rubric (see the scoring section of
`.claude/skills/orc/SKILL.md`), then dispatch the executor agent from THIS
compiled table — it is already clipped to this flow's session tier; never
substitute a preset from `config.md`:

{{score_table}}
<!-- /diy:when -->
<!-- diy:when scoring=off -->
Scoring is DISABLED in this flow. Skip the rubric entirely: EVERY execution
task dispatches to **{{fixed_executor}}**. Wave grouping, declared-files
conflict rules, and slice construction are unchanged — scoring off changes
model selection only, never scheduling.
<!-- /diy:when -->
