#!/usr/bin/env node
"use strict";

/**
 * ORC effort guard — a Claude Code PreToolUse hook.
 *
 * Blocks invocation of the full `orc` orchestrator skill unless the MAIN
 * session is running at HIGH reasoning effort. This is the one half of the
 * "run ORC on Opus 4.8 high" rule that hooks can enforce deterministically:
 * Claude Code exposes `effort.level` (and $CLAUDE_EFFORT) to PreToolUse, but
 * NOT the model id (only SessionStart may see the model, and cannot block).
 * The model tier is surfaced separately by the statusline warning + the
 * self-check inside skills/orc/SKILL.md.
 *
 * Wiring (installed by `orc init` into .claude/settings.json):
 *   hooks.PreToolUse[] { matcher: "Skill", hooks:[{ type:"command",
 *     command: 'node "<.claude>/hooks/orc-effort-guard.js"' }] }
 *
 * Contract: read PreToolUse JSON from stdin. Exit 0 = allow. Exit 2 = block
 * the tool call and show stderr to Claude, which relays it to the user.
 */

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(raw || "{}");
  } catch (_) {
    // Unparseable payload — never block on our own error.
    process.exit(0);
  }

  const tool = data.tool_name || "";
  const input = data.tool_input || {};
  const skill = String(input.skill || input.name || "");

  // Only gate the full orchestrator. orc-mini / orc-analyze / subskills pass.
  const isOrc = tool === "Skill" && /^orc$/i.test(skill);
  if (!isOrc) process.exit(0);

  const effort = String(
    (data.effort && data.effort.level) || process.env.CLAUDE_EFFORT || ""
  ).toLowerCase();

  if (effort === "high") process.exit(0); // requirement met

  process.stderr.write(
    "\n⛔ ORC blocked — the orchestrator must run at HIGH effort" +
      (effort ? ` (current effort: ${effort}).` : " (effort not detected).") +
      "\n   Switch this session to Opus 4.8 at high effort, then re-run /orc." +
      "\n   Run the MAIN session on Opus — subagents cannot exceed the main tier," +
      "\n   so on a lower tier the Opus executors silently downgrade.\n"
  );
  process.exit(2);
});
