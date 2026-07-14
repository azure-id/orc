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
 *
 * Also surfaces a "newer orc version available" nudge here — this hook fires
 * exactly when /orc is invoked, so it's the natural place to tell the user
 * without them running `orc version`. On allow it emits a `systemMessage`
 * (shown to the user, NOT added to model context → zero tokens); on block it
 * appends the nudge to the block reason. Version check is cached 24h and
 * fail-silent. (systemMessage handling may vary by Claude Code version — verify
 * with /doctor if you don't see it; the statusline shows it regardless.)
 */

// Shared update-check helper (sibling file). Degrade gracefully if absent.
let updater = null;
try {
  updater = require("./orc-update-lib.js");
} catch (_) {
  updater = null;
}

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

  // Only gate the full orchestrator and the compiled DIY lane. orc-mini /
  // orc-fast / orc-analyze / subskills pass — orc-fast is DESIGNED to run at
  // Sonnet medium; never widen this match to include it.
  const isOrc = tool === "Skill" && /^orc$/i.test(skill);
  const isDiy = tool === "Skill" && /^orc-diy$/i.test(skill);
  if (!isOrc && !isDiy) process.exit(0);

  const effort = String(
    (data.effort && data.effort.level) || process.env.CLAUDE_EFFORT || ""
  ).toLowerCase();
  const installed = updater ? updater.installedVersion(__dirname) : null;

  // /orc-diy: the required tier is whatever the flow was COMPILED for — read
  // it from flow.lock.json (written only by the `orc diy` CLI). Fail closed:
  // no lock = no compiled flow = deterministic onboarding block. `compile` /
  // `status` invocations pass at any effort (they just shell out to the CLI).
  let requiredEfforts = ["high"];
  let requiredLabel = "Opus 4.8 at high effort";
  if (isDiy) {
    if (/\b(compile|status)\b/i.test(String(input.args || ""))) process.exit(0);
    const fs = require("fs");
    const path = require("path");
    let lock = null;
    try {
      const projectDir = data.cwd || process.cwd();
      lock = JSON.parse(
        fs
          .readFileSync(
            path.join(projectDir, ".claude", "orc", "diy", "flow.lock.json"),
            "utf8"
          )
          .replace(/^\uFEFF/, "")
      );
    } catch (_) {}
    if (!lock || !lock.session_tier) {
      process.stderr.write(
        "\n⛔ /orc-diy blocked — no compiled flow in this project (fail-closed gate)." +
          "\n   Compose and build your flow in the terminal first:" +
          "\n     orc diy init        (then shape it: orc diy set <key> <value>)" +
          "\n     orc diy compile" +
          "\n   Guide: .claude/skills/orc-diy/README.md — or use plain /orc for this request.\n"
      );
      process.exit(2);
    }
    if (lock.session_tier === "opus-4-7-med") {
      requiredEfforts = ["medium", "high"];
      requiredLabel = "Opus 4.7 at medium effort (this flow's compiled session_tier)";
    } else if (lock.session_tier === "sonnet-4-6-high") {
      requiredLabel = "Sonnet 4.6 at high effort (this flow's compiled session_tier)";
    } else {
      requiredLabel = "Opus 4.8 at high effort (this flow's compiled session_tier)";
    }
  }

  const decide = (nudge) => {
    if (requiredEfforts.includes(effort)) {
      // Requirement met — allow. Surface a version nudge if one exists.
      if (nudge) {
        try {
          process.stdout.write(JSON.stringify({ systemMessage: nudge }));
        } catch (_) {}
      }
      process.exit(0);
    }

    process.stderr.write(
      `\n⛔ ${isDiy ? "/orc-diy" : "ORC"} blocked — required effort not met` +
        (effort ? ` (current effort: ${effort}).` : " (effort not detected).") +
        `\n   Switch this session to ${requiredLabel}, then re-run.` +
        "\n   Run the MAIN session at (or above) the required tier — subagents cannot" +
        "\n   exceed the main tier, so pinned agents silently downgrade below it.\n" +
        (nudge ? "\n" + nudge + "\n" : "")
    );
    process.exit(2);
  };

  if (updater) updater.refreshAndNudge(installed, decide);
  else decide(null);
});
