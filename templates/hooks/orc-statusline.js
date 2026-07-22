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
 * Three-tier verdict (the "ORC-ready" acceptance matrix):
 *   ✅ ORC-ready       Opus 4.8 high (the baseline)
 *   🚀 ORC-boosted     Opus 4.8 xhigh/max, or Fable 5 medium…max (will do better)
 *   ⛔ ORC WILL DEGRADE everything below (wrong model, sub-baseline effort, quota)
 *
 * This is the ONLY place Claude Code exposes the live model id, so it also
 * writes a fail-silent session-model bridge (.claude/orc/session-model.json)
 * that the PreToolUse effort guard reads — the guard can't see the model id
 * on its own, so the bridge is how Fable 5's medium-effort allowance reaches it.
 *
 * Also appends a "newer orc version available" hint from the 24h update cache
 * (cache-only here — never a network call in the statusline hot path; the
 * PreToolUse guard refreshes the cache when /orc is invoked).
 */

// Opus 4.8 / Fable 5 are matched by tolerant regexes below (accept dated/
// suffixed ids and the display name), not strict strings. Effort ranks give the
// acceptance-matrix tiers (0 = unknown, never treated as a positive downgrade).
const EFFORT_RANK = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };

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

  // ── Session-model bridge (fail-silent) ─────────────────────────────────────
  // The PreToolUse effort guard cannot see the model id; it can only read
  // effort. Persist {model_id, effort, written_at} here so the guard can grant
  // Fable 5's medium-effort allowance. The statusline re-renders constantly
  // while a session is active, so written_at stays fresh; the guard treats a
  // stale file (older than its freshness window) as absent and never blocks on
  // it. Any error (no dir, read-only fs) is swallowed — this is a nicety, not a
  // guarantee, and must never break the statusline render.
  try {
    if (model || effort) {
      const fs = require("fs");
      const path = require("path");
      const projectDir =
        (d.workspace && d.workspace.project_dir) || d.cwd || process.cwd();
      const orcDir = path.join(projectDir, ".claude", "orc");
      fs.mkdirSync(orcDir, { recursive: true });
      fs.writeFileSync(
        path.join(orcDir, "session-model.json"),
        JSON.stringify({ model_id: model, effort, written_at: Date.now() }) + "\n"
      );
    }
  } catch (_) {}

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
  // whenever Claude Code reported a dated/suffixed id (e.g. claude-opus-4-8-
  // YYYYMMDD) or only a display name — even on the correct tier. Match Opus 4.8
  // and Fable 5 by normalized id OR display name, accepting any variant; the
  // trailing \b keeps 4.7 / 4.85 / Sonnet etc. correctly warning.
  const hay = `${model} ${display}`.toLowerCase();
  const isOpus48 = /opus[\s._-]?4[\s._-]?8\b/.test(hay);
  const isFable5 = /fable[\s._-]?5\b/.test(hay);
  const modelKnown = model !== "" || (display !== "" && display !== "unknown");
  // Effort rank; 0 = unknown. A missing/empty effort field is NOT proof of a
  // downgrade — the PreToolUse guard already hard-blocks a real low-effort /orc
  // — so an unknown effort never forces DEGRADE on effort grounds here.
  const er = EFFORT_RANK[effort] || 0;

  const tier = `${display}${effort ? "/" + effort : ""}`;

  // Verdict per the acceptance matrix. Only a POSITIVELY-known bad tier degrades.
  let verdict = "ready";
  const reasons = [];
  if (isOpus48) {
    if (er >= 4) verdict = "boosted"; // xhigh / max
    else if (er === 3 || er === 0) verdict = "ready"; // high (or unknown → lenient)
    else {
      verdict = "degrade"; // opus 4.8 below high
      reasons.push("effort≠high");
    }
  } else if (isFable5) {
    if (er >= 2 || er === 0) verdict = "boosted"; // medium…max (or unknown → lenient)
    else {
      verdict = "degrade"; // fable 5 below medium
      reasons.push("Fable-5 effort<medium");
    }
  } else if (modelKnown) {
    verdict = "degrade";
    reasons.push("model≠Opus4.8/Fable5");
  } // else model unknown → stay lenient (the guard enforces effort)

  // A quota window at/above the crit threshold folds into DEGRADE regardless.
  if (usageBad.length) {
    verdict = "degrade";
    for (const u of usageBad) reasons.push(u);
  }

  let line;
  if (verdict === "ready") {
    line = `✅ ORC-ready ${tier}${pct ? " · " + pct : ""}`;
  } else if (verdict === "boosted") {
    line = `🚀 ORC-boosted ${tier}${pct ? " · " + pct : ""}`;
  } else {
    line = `⛔ ORC WILL DEGRADE (${reasons.join(", ")}) — now: ${tier}${pct ? " · " + pct : ""}`;
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
      // Model half of the compiled session_tier — warn-only (hooks can't block on
      // model). Keyed by the slug's MODEL part, so the full tier grid (sonnet-4-6,
      // opus-4-7, opus-4-8, fable-5 at any effort) is covered without enumerating
      // every effort slug.
      if (ready && modelKnown && lock.session_tier) {
        const modelPart = String(lock.session_tier).replace(/-(med|high|xhigh|max)$/, "");
        const want = {
          "sonnet-4-6": /sonnet[\s._-]?4[\s._-]?6\b/,
          "opus-4-7": /opus[\s._-]?4[\s._-]?7\b/,
          "opus-4-8": /opus[\s._-]?4[\s._-]?8\b/,
          "fable-5": /fable[\s._-]?5\b/,
        }[modelPart];
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
