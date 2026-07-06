#!/usr/bin/env node
"use strict";

/**
 * ORC statusline — a Claude Code statusLine command.
 *
 * The statusline is the ONLY place Claude Code exposes the live model id
 * (`model.id`) together with the reasoning effort (`effort.level`). It is
 * display-only — it cannot block — so this is the "model warn" half of the
 * "run ORC on Opus 4.8 high" rule. When the session is NOT Opus 4.8 at high
 * effort, it renders a loud warning so you never launch /orc on the wrong tier.
 *
 * The deterministic hard-stop for effort lives in orc-effort-guard.js.
 *
 * Wiring (installed by `orc init` ONLY if no statusLine already exists):
 *   settings.statusLine { type:"command", command:'node "<.claude>/hooks/orc-statusline.js"' }
 *
 * Also appends a "newer orc version available" hint from the 24h update cache
 * (cache-only here — never a network call in the statusline hot path; the
 * PreToolUse guard refreshes the cache when /orc is invoked).
 */

const REQUIRED_MODEL = "claude-opus-4-8";
const REQUIRED_EFFORT = "high";

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
  let d = {};
  try {
    d = JSON.parse(raw || "{}");
  } catch (_) {
    d = {};
  }

  const model = (d.model && d.model.id) || "";
  const display = (d.model && d.model.display_name) || model || "unknown";
  const effort = String((d.effort && d.effort.level) || "").toLowerCase();
  const pct =
    d.context_window && typeof d.context_window.used_percentage === "number"
      ? `${d.context_window.used_percentage}% ctx`
      : "";

  const modelOk = model === REQUIRED_MODEL;
  const effortOk = effort === REQUIRED_EFFORT;

  const tier = `${display}${effort ? "/" + effort : ""}`;
  let line;
  if (modelOk && effortOk) {
    line = `✅ ORC-ready ${tier}${pct ? " · " + pct : ""}`;
  } else {
    const bad = [];
    if (!modelOk) bad.push("model≠Opus4.8");
    if (!effortOk) bad.push("effort≠high");
    line = `⛔ ORC WILL DEGRADE (${bad.join(", ")}) — now: ${tier}${pct ? " · " + pct : ""}`;
  }

  // Append an update hint from the cache (instant, no network here).
  if (updater) {
    try {
      const nudge = updater.readCachedNudge(updater.installedVersion(__dirname));
      if (nudge) line += " · " + nudge;
    } catch (_) {}
  }

  process.stdout.write(line);
});
