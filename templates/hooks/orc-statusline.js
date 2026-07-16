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
 * On Claude Code v2.1.80+ it also renders the official subscription-usage
 * segment `5h N% (reset) ↔ wk N%`, read straight from the payload's
 * `rate_limits.{five_hour,seven_day}` (Anthropic API headers, not estimated).
 * A window ≥90% folds into the DEGRADE verdict; fail-silent when absent.
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

  // ── Subscription usage (Claude Code v2.1.80+) ──────────────────────────────
  // Official 5-hour + 7-day usage, surfaced by Claude Code straight from
  // Anthropic's API headers into this payload's `rate_limits`. Display-only,
  // fail-silent: an absent block (older Claude Code / no headers) → no segment,
  // never `undefined`. A window at/above USAGE_CRIT contributes to the DEGRADE
  // verdict — running low on quota is a real mid-run degradation risk.
  const USAGE_WARN = 75;
  const USAGE_CRIT = 90;
  const fmtReset = (v) => {
    // resets_at may be an ISO string or an epoch (seconds or ms). "" on anything odd.
    let t = NaN;
    if (typeof v === "number") t = v < 1e12 ? v * 1000 : v;
    else if (typeof v === "string") {
      const n = Number(v);
      t = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(v);
    }
    if (!Number.isFinite(t)) return "";
    const ms = t - Date.now();
    if (ms <= 0) return "";
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h${m}m` : `${h}h`;
  };
  let rlSeg = "";
  const usageBad = [];
  try {
    const rl = d.rate_limits || {};
    const win = (obj, label) => {
      if (!obj || typeof obj.used_percentage !== "number") return "";
      const p = Math.round(obj.used_percentage);
      const reset = fmtReset(obj.resets_at);
      const mark = p >= USAGE_CRIT ? "⛔" : p >= USAGE_WARN ? "⚠" : "";
      if (p >= USAGE_CRIT) usageBad.push(`${label}≥${USAGE_CRIT}%`);
      // Reset shown for the short (5h) window always; weekly only when elevated.
      const showReset = reset && (label === "5h" || p >= USAGE_WARN);
      return `${mark}${label} ${p}%${showReset ? ` (${reset})` : ""}`;
    };
    const fh = win(rl.five_hour, "5h");
    const sd = win(rl.seven_day, "wk");
    if (fh && sd) rlSeg = `${fh} ↔ ${sd}`;
    else rlSeg = fh || sd || "";
  } catch (_) {
    rlSeg = "";
  }

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
  for (const u of usageBad) bad.push(u);

  let line;
  if (bad.length === 0) {
    line = `✅ ORC-ready ${tier}${pct ? " · " + pct : ""}`;
  } else {
    line = `⛔ ORC WILL DEGRADE (${bad.join(", ")}) — now: ${tier}${pct ? " · " + pct : ""}`;
  }

  // Subscription-usage segment (rendered after ctx, before wiki). Empty on
  // older Claude Code that doesn't surface `rate_limits`.
  if (rlSeg) line += " · " + rlSeg;

  // Wiki freshness tier (computed on read from wiki-meta.json — zero model
  // tokens; the manifest is written only by `orc wiki sync`). Fail-silent: no
  // wiki / no git / any error → no segment. Thresholds mirror the config
  // defaults (wiki_fresh_max 10 / wiki_aging_max 30); the hook can't read the
  // resolved config, so a user override shifts skill behavior, not this label.
  try {
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");
    const projectDir =
      (d.workspace && d.workspace.project_dir) || d.cwd || process.cwd();
    const metaPath = path.join(projectDir, ".claude", "orc", "wiki-meta.json");
    if (!fs.existsSync(metaPath)) {
      // Docs but no manifest = UNREGISTERED: a real wiki nothing has indexed
      // (usually a scan stopped at a 5-area pause). It is otherwise invisible —
      // consumers and `orc crosslink` read the manifest — so surface it here,
      // with the free fix. Never say "no wiki": these docs are already paid for.
      const wikiDir = path.join(projectDir, "wiki");
      const docs =
        fs.existsSync(wikiDir) &&
        fs.readdirSync(wikiDir).some((f) => f.startsWith("orc-") && f.endsWith(".md"));
      if (docs) line += " · wiki: UNREGISTERED (run `orc wiki sync`)";
    } else {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta && meta.scan_commit) {
        const distance = parseInt(
          execSync(`git rev-list --count ${meta.scan_commit}..HEAD`, {
            cwd: projectDir,
            timeout: 3000,
            stdio: ["ignore", "pipe", "ignore"],
          })
            .toString()
            .trim(),
          10
        );
        if (Number.isFinite(distance)) {
          if (distance >= 10 && distance <= 30)
            line += ` · wiki: AGING (${distance}c)`;
          else if (distance > 30) line += ` · wiki: STALE (${distance}c)`;
          else line += " · wiki: fresh";
        }
      }
    }
  } catch (_) {}

  // orc-diy gate segment (only when a flow exists). Recomputes the same
  // staleness checks as `orc diy status` from flow.lock.json — written only
  // by the `orc diy` CLI. Fail-silent: any error → no segment.
  try {
    const fs = require("fs");
    const path = require("path");
    const crypto = require("crypto");
    const projectDir =
      (d.workspace && d.workspace.project_dir) || d.cwd || process.cwd();
    const lockPath = path.join(projectDir, ".claude", "orc", "diy", "flow.lock.json");
    if (fs.existsSync(lockPath)) {
      const lock = JSON.parse(
        fs.readFileSync(lockPath, "utf8").replace(/^\uFEFF/, "")
      );
      const sha = (p) =>
        crypto.createHash("sha256").update(fs.readFileSync(p, "utf8")).digest("hex");
      const cfgPath = path.join(projectDir, ".claude", "orc-diy.config.yaml");
      const compiledPath = path.join(projectDir, ".claude", "orc", "diy", "FLOW-COMPILED.md");
      let installedV = null;
      try {
        installedV = JSON.parse(
          fs.readFileSync(path.join(__dirname, "orc-version.json"), "utf8")
        ).version;
      } catch (_) {}
      const ready =
        lock.compiled_hash &&
        fs.existsSync(cfgPath) &&
        lock.config_hash === sha(cfgPath) &&
        fs.existsSync(compiledPath) &&
        lock.compiled_hash === sha(compiledPath) &&
        (!installedV || lock.orc_version === installedV);
      let seg = `diy:${lock.flow_name || "flow"} ${ready ? "READY" : "STALE→recompile"}`;
      // Model half of the compiled session_tier — warn-only (hooks can't block on model).
      if (ready && modelKnown && lock.session_tier) {
        const want = {
          "sonnet-4-6-high": /sonnet[\s._-]?4[\s._-]?6\b/,
          "opus-4-7-med": /opus[\s._-]?4[\s._-]?7\b/,
          "opus-4-8-high": /opus[\s._-]?4[\s._-]?8\b/,
        }[lock.session_tier];
        if (want && !want.test(hay)) seg += ` ⛔model≠${lock.session_tier}`;
      }
      line += " · " + seg;
    }
  } catch (_) {}

  // Append an update hint from the cache (instant, no network here).
  if (updater) {
    try {
      const nudge = updater.readCachedNudge(updater.installedVersion(__dirname));
      if (nudge) line += " · " + nudge;
    } catch (_) {}
  }

  process.stdout.write(line);
});
