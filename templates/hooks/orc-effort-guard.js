#!/usr/bin/env node
"use strict";

/**
 * ORC effort guard — a Claude Code hook on TWO events (v2.1.2, F13).
 *
 * Blocks the full `orc` orchestrator skill (and the compiled `orc-diy` lane)
 * unless the MAIN session is running at HIGH reasoning effort (Opus 5.5 /
 * Fable 5 clear at medium+ — see the session-model bridge below). This is the
 * one half of the "run ORC on Opus 4.8 high or better" rule hooks can enforce
 * deterministically: Claude Code exposes `effort.level` (and $CLAUDE_EFFORT)
 * to PreToolUse, but NOT the model id (only SessionStart may see the model,
 * and cannot block). The model tier is surfaced separately by the statusline
 * warning + the self-check inside skills/orc/SKILL.md.
 *
 * Wiring (installed by `orc init` into .claude/settings.json):
 *   hooks.PreToolUse[] { matcher: "Skill", hooks:[{ type:"command",
 *     command: 'node "<.claude>/hooks/orc-effort-guard.js"' }] }
 *   hooks.UserPromptExpansion[] { matcher: "orc|orc-diy", hooks:[ the same ] }
 *
 * PreToolUse(Skill) = a model-made Skill call; it carries the LIVE effort.
 * UserPromptExpansion = a TYPED /orc or /orc-diy; it carries NO effort, so the
 * effort is read from the status line's bridge — and only from a bridge THIS
 * session wrote, with no /model, /effort or /config typed after it. An effort
 * nobody can read never blocks (fail-open).
 *
 * Contract: read the event JSON from stdin. Exit 0 = allow. Exit 2 = block
 * and show stderr (to Claude on a tool call, to the user on a typed command).
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
// model id itself, so it reads it here to grant the medium-effort allowance of
// the models that are strictly stronger than the Opus 4.8 baseline (Opus 5.5 and
// Fable 5). Fail-OPEN: missing / unreadable / stale → null, and the guard
// behaves exactly as it would without a bridge (never blocks on our own error).
// Stale = older than this window; a live session re-renders the statusline far
// more often, so a fresh file always exists during active use.
// v2.1.2 (F13): it names its session. A bridge written by ANOTHER session is
// never read. `strict` (the typed path, which can BLOCK on it) also refuses a
// bridge with no session_id — a 2.1.1 bridge, or the eval harness before its
// update.
const BRIDGE_MAX_AGE_MS = 30 * 60 * 1000;
function readBridge(projectDir, sessionId, strict) {
  try {
    const fs = require("fs");
    const path = require("path");
    const p = path.join(projectDir, ".claude", "orc", "session-model.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
    if (!j || typeof j.written_at !== "number") return null;
    if (Date.now() - j.written_at > BRIDGE_MAX_AGE_MS) return null;
    const sid = typeof j.session_id === "string" ? j.session_id : "";
    if (sid && sessionId && sid !== sessionId) return null;
    if (strict && (!sid || !sessionId)) return null;
    return { model_id: String(j.model_id || ""), effort: String(j.effort || "").toLowerCase(), written_at: j.written_at };
  } catch (_) {
    return null;
  }
}

// v2.1.2 (F13): a /model, /effort or /config typed AFTER the bridge was
// written makes its reading old. Claude Code records each one in the
// transcript as `<command-name>/effort</command-name>` with a timestamp
// (measured, 2.1.287). Only the last 1 MiB is read; an unreadable transcript
// proves nothing and changes nothing.
const TIER_COMMAND = /<command-name>\/(model|effort|config)<\/command-name>/;
function tierChangedSince(transcriptPath, sinceMs) {
  if (!transcriptPath) return false;
  try {
    const fs = require("fs");
    const fd = fs.openSync(transcriptPath, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, 1024 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      for (const line of buf.toString("utf8").split("\n")) {
        if (!TIER_COMMAND.test(line)) continue;
        let t = NaN;
        try { t = Date.parse(JSON.parse(line).timestamp); } catch (_) {}
        if (Number.isFinite(t) && t >= sinceMs) return true;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {}
  return false;
}

// Models that clear /orc at medium effort — strictly stronger than the Opus 4.8
// baseline, so medium on them beats high on it. Opus 5.5 (v0.34.0) joins Fable 5.
// The `\b` after the 5 keeps 4.8 / 4.7 / 5-something-else correctly gated.
const isMediumOkModel = (id) =>
  /(opus|fable)[\s._-]?5\b/.test(String(id || "").toLowerCase());

// Anything this file did not plan for ALLOWS — the guard never blocks on its
// own error. (process.exit(2) is a decision, not a throw, so it is not caught.)
process.on("uncaughtException", () => process.exit(0));

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
  if (!data || typeof data !== "object") process.exit(0);

  // Two events, one decision. PreToolUse(Skill) = a model-made Skill call, with
  // the LIVE effort. UserPromptExpansion (v2.1.2, F13) = a TYPED /orc or
  // /orc-diy: Claude Code loads skills/<name>/SKILL.md directly for those, with
  // no Skill call, so PreToolUse never fires. That event carries no effort
  // (measured, 2.1.287): the effort comes from the status line's bridge, and an
  // effort nobody can read NEVER blocks.
  const typed = data.hook_event_name === "UserPromptExpansion";
  let skill = "";
  let args = "";
  if (typed) {
    skill = String(data.command_name || "").replace(/^\//, "");
    const a = data.command_args; // a string on 2.1.287; the docs show an array
    args = Array.isArray(a) ? a.join(" ") : String(a || "");
  } else {
    if ((data.tool_name || "") !== "Skill") process.exit(0);
    const input = data.tool_input || {};
    skill = String(input.skill || input.name || "");
    args = String(input.args || "");
  }
  // Only gate the full orchestrator and the compiled DIY lane. orc-mini /
  // orc-fast / orc-analyze / subskills pass — orc-fast is DESIGNED to run at
  // Sonnet medium; never widen this match to include it.
  const isOrc = /^orc$/i.test(skill);
  const isDiy = /^orc-diy$/i.test(skill);
  if (!isOrc && !isDiy) process.exit(0);

  const projectDir = data.cwd || process.cwd();
  const sessionId = String(data.session_id || "");
  let bridge = readBridge(projectDir, sessionId, typed);
  if (typed && bridge && tierChangedSince(data.transcript_path, bridge.written_at)) bridge = null;
  const payloadEffort = String((data.effort && data.effort.level) || "").toLowerCase();
  // $CLAUDE_EFFORT is read on the PreToolUse path only: the typed event does
  // not set it, so there a value would belong to a parent process.
  const effort = typed ? payloadEffort || (bridge ? bridge.effort : "") : payloadEffort || String(process.env.CLAUDE_EFFORT || "").toLowerCase();
  const unknown = typed && !payloadEffort && !bridge;
  const bridgeNote =
    typed && !payloadEffort && bridge
      ? `   (effort read from the ORC status line ${Math.round((Date.now() - bridge.written_at) / 1000)}s ago — changed the model or effort since? run /model or /effort once more, then re-run)\n`
      : "";
  const installed = updater ? updater.installedVersion(__dirname) : null;

  // Baseline /orc: the session must be at high effort OR stronger (xhigh/max).
  // Opus 5.5 and Fable 5 additionally clear at medium — strictly-capable models —
  // detected through the session-model bridge (the guard can't see the model id
  // itself; fail-open when the bridge is missing/stale, i.e. medium stays blocked).
  let requiredEfforts = effortsAtOrAbove("high");
  let requiredLabel =
    "Opus 4.8 at high effort (Opus 5.5 / Fable 5 also clear at medium+)";
  if (!isDiy && bridge && isMediumOkModel(bridge.model_id)) {
    requiredEfforts = ["medium", ...requiredEfforts];
  }

  // /orc-diy: the required tier is whatever the flow was COMPILED for — read
  // it from flow.lock.json (written only by the `orc diy` CLI). Fail closed:
  // no lock = no compiled flow = deterministic onboarding block. `compile` /
  // `status` invocations pass at any effort (they just shell out to the CLI).
  if (isDiy) {
    if (/^\s*(compile|status)\b/i.test(args)) process.exit(0);
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
          .replace(/^﻿/, "")
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

  // Typed, and nobody can read this session's effort → allow. The lock check
  // above already ran: a missing flow is a fact, not a guess.
  const failOpen = unknown;

  const decide = (nudge) => {
    if (failOpen || requiredEfforts.includes(effort)) {
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
        bridgeNote +
        (nudge ? "\n" + nudge + "\n" : "")
    );
    process.exit(2);
  };

  if (updater) updater.refreshAndNudge(installed, decide);
  else decide(null);
});
