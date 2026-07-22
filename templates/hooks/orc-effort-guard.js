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

// Effort ladder: low < medium < high < xhigh < max. A tier that meets the bar
// meets it at that rung OR anything stronger — so "requires high" allows xhigh
// and max too (the bug this fixes: an xhigh/max session was hard-blocked).
const EFFORT_LADDER = ["low", "medium", "high", "xhigh", "max"];
const effortsAtOrAbove = (e) => {
  const i = EFFORT_LADDER.indexOf(String(e).toLowerCase());
  return i === -1 ? ["high", "xhigh", "max"] : EFFORT_LADDER.slice(i);
};

// Session-model bridge (written by orc-statusline.js). The guard can't see the
// model id itself, so it reads it here to grant Fable 5's medium-effort
// allowance. Fail-OPEN: missing / unreadable / stale → null, and the guard
// behaves exactly as it would without a bridge (never blocks on our own error).
// Stale = older than this window; a live session re-renders the statusline far
// more often, so a fresh file always exists during active use.
const BRIDGE_MAX_AGE_MS = 30 * 60 * 1000;
function readSessionModel(projectDir) {
  try {
    const fs = require("fs");
    const path = require("path");
    const p = path.join(projectDir, ".claude", "orc", "session-model.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
    if (!j || typeof j.written_at !== "number") return null;
    if (Date.now() - j.written_at > BRIDGE_MAX_AGE_MS) return null;
    return String(j.model_id || "");
  } catch (_) {
    return null;
  }
}
const isFable5Model = (id) => /fable[\s._-]?5\b/.test(String(id || "").toLowerCase());

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
  const projectDir = data.cwd || process.cwd();

  // Baseline /orc: the session must be at high effort OR stronger (xhigh/max).
  // Fable 5 additionally clears at medium — a strictly-capable model — detected
  // through the session-model bridge (the guard can't see the model id itself;
  // fail-open when the bridge is missing/stale, i.e. medium stays blocked).
  let requiredEfforts = effortsAtOrAbove("high");
  let requiredLabel = "Opus 4.8 at high effort (Fable 5 also clears at medium+)";
  if (!isDiy && isFable5Model(readSessionModel(projectDir))) {
    requiredEfforts = ["medium", ...requiredEfforts];
  }

  // /orc-diy: the required tier is whatever the flow was COMPILED for — read
  // it from flow.lock.json (written only by the `orc diy` CLI). Fail closed:
  // no lock = no compiled flow = deterministic onboarding block. `compile` /
  // `status` invocations pass at any effort (they just shell out to the CLI).
  if (isDiy) {
    if (/^\s*(compile|status)\b/i.test(String(input.args || ""))) process.exit(0);
    const fs = require("fs");
    const path = require("path");
    let lock = null;
    try {
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
    // Effort half is DETERMINISTIC from the compiled slug's suffix (allow that
    // effort or anything stronger); the model half is warn-only on the
    // statusline (hooks can't block on model). Covers the full tier grid —
    // sonnet-4-6 / opus-4-7 / opus-4-8 / fable-5 at med|high|xhigh|max.
    const m = String(lock.session_tier).match(/-(med|high|xhigh|max)$/);
    const slugEffort = m ? (m[1] === "med" ? "medium" : m[1]) : "high";
    requiredEfforts = effortsAtOrAbove(slugEffort);
    requiredLabel = `${lock.session_tier} (compiled session_tier — needs effort ${slugEffort}+)`;
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
