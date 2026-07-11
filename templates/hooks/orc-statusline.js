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

// Opus 4.8 is matched by a tolerant regex below (accepts dated/suffixed ids and
// the display name), not a strict string, so REQUIRED_MODEL is no longer a const.
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

  // Tolerant tier detection. A strict `model === "claude-opus-4-8"` false-fired
  // "model≠Opus4.8" whenever Claude Code reported a dated/suffixed id (e.g.
  // claude-opus-4-8-YYYYMMDD) or only a display name — even on the correct tier.
  // Match Opus 4.8 by normalized id OR display name, accepting any variant; the
  // trailing \b keeps 4.7 / 4.85 / Sonnet etc. correctly warning.
  const hay = `${model} ${display}`.toLowerCase();
  const modelOk = /opus[\s._-]?4[\s._-]?8\b/.test(hay);
  const modelKnown = model !== "" || (display !== "" && display !== "unknown");
  // Effort: only a POSITIVELY-read non-high effort is a downgrade. A missing/
  // empty effort field is NOT proof of low effort — the PreToolUse guard already
  // hard-blocks a real low-effort /orc — so don't false-warn when it's absent.
  const effortKnown = effort !== "";
  const effortOk = effort === REQUIRED_EFFORT;

  const tier = `${display}${effort ? "/" + effort : ""}`;
  const bad = [];
  if (modelKnown && !modelOk) bad.push("model≠Opus4.8");
  if (effortKnown && !effortOk) bad.push("effort≠high");

  let line;
  if (bad.length === 0) {
    line = `✅ ORC-ready ${tier}${pct ? " · " + pct : ""}`;
  } else {
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
