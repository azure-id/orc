# Applying the tier-agent update

1. Copy the agents into your Claude Code agents folder:
   cp update-agents/agents/\*.md <project>/.claude/agents/
   (or ~/.claude/agents/ for user scope)

2. Copy the two changed skill files:
   cp -r update-agents/skills/\* <project>/.claude/skills/

3. READ agents/MODEL-MAPPING.md and do the two verifications:
   - run /agents to confirm the model strings + effort field your CLI accepts;
     fix the frontmatter if it wants short aliases (opus/sonnet).
   - run your MAIN Claude Code session on Opus, or the Opus tiers fall back to
     Sonnet (this was the model bug).

4. run /doctor to check for load errors or duplicate names.

