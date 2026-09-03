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
 *   🚀 ORC-boosted     Opus 4.8 xhigh/max, or Opus 5 / Fable 5 medium…max
 *   ⛔ ORC WILL DEGRADE everything below (wrong model, sub-baseline effort, quota)
 *
 * This is the ONLY place Claude Code exposes the live model id, so it also
 * writes a fail-silent session-model bridge (.claude/orc/session-model.json)
 * that the PreToolUse effort guard reads — the guard can't see the model id
 * on its own, so the bridge is how the Opus 5 / Fable 5 medium-effort allowance
 * reaches it.
 *
 * Also appends a "newer orc version available" hint from the 24h update cache
 * (cache-only here — never a network call in the statusline hot path; the
 * PreToolUse guard refreshes the cache when /orc is invoked).
 */

// Opus 4.8 / Opus 5 / Fable 5 are matched by tolerant regexes below (accept
// dated/suffixed ids and the display name), not strict strings. Effort ranks give
// the acceptance-matrix tiers (0 = unknown, never treated as a positive downgrade).
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
  // the Opus 5 / Fable 5 medium-effort allowance. The statusline re-renders constantly
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

  // ── Usage bridge (v1.1.0 W4, fail-silent) ─────────────────────────────────
  // The `rate_limits` block below reaches ONLY this process: the statusline
  // renders a string and exits, so nothing else in ORC has ever been able to
  // see how full the window is. A lane therefore started a wave with no idea it
  // was about to run out, and the wave stopped in the middle.
  //
  // Persist the RAW numbers (never a computed word like `LOW` — a stored state
  // is wrong one minute later; `orc usage check` computes it on read) plus
  // `context_window`, which the wait needs to decide whether continuing
  // in-session is cheaper than a fresh one. Same fail-silent contract as the
  // session-model bridge above: any error is swallowed, and a reading older
  // than its freshness window reads as `unknown`, never as `low`.
  try {
    const rl0 = d.rate_limits;
    const cw0 = d.context_window;
    if (rl0 || cw0) {
      const fs = require("fs");
      const path = require("path");
      const projectDir =
        (d.workspace && d.workspace.project_dir) || d.cwd || process.cwd();
      const orcDir = path.join(projectDir, ".claude", "orc");
      const win = (o) =>
        o && typeof o.used_percentage === "number"
          ? { used_percentage: o.used_percentage, resets_at: o.resets_at == null ? null : o.resets_at }
          : null;
      fs.mkdirSync(orcDir, { recursive: true });
      fs.writeFileSync(
        path.join(orcDir, "usage.json"),
        JSON.stringify({
          five_hour: win(rl0 && rl0.five_hour),
          seven_day: win(rl0 && rl0.seven_day),
          context_used_percentage:
            cw0 && typeof cw0.used_percentage === "number" ? cw0.used_percentage : null,
          written_at: Date.now(),
        }) + "\n"
      );
      // -- Session consumption (v1.2.0) -------------------------------------
      // `usage.json` is a SNAPSHOT of the window. It cannot answer "how much
      // has THIS session eaten", which is the question a user actually asks
      // mid-run -- and the one they could otherwise only answer by remembering
      // what the number was an hour ago.
      //
      // So keep a per-session ledger beside it: the reading when this session
      // first rendered, and the reading now. Same rules as every other bridge
      // here -- RAW numbers only, never a computed word, fail-silent, and the
      // reader decides what it means.
      //
      // A window RESET mid-session (used_percentage drops) is not a refund:
      // bank what was consumed before the reset into `accumulated` and
      // re-baseline, so the running total keeps counting across the boundary.
      const sid = String(d.session_id || d.sessionId || "");
      const sfile = path.join(orcDir, "usage-session.json");
      let led = null;
      try { led = JSON.parse(fs.readFileSync(sfile, "utf8")); } catch (_) {}
      const pctOf = (o) => (o && typeof o.used_percentage === "number" ? o.used_percentage : null);
      const track = (prev, cur) => {
        if (cur == null) return prev || null;
        if (!prev) return { baseline: cur, last: cur, accumulated: 0, resets: 0 };
        if (cur < prev.baseline)
          return {
            baseline: cur,
            last: cur,
            accumulated: prev.accumulated + Math.max(0, prev.last - prev.baseline),
            resets: prev.resets + 1,
          };
        return { baseline: prev.baseline, last: cur, accumulated: prev.accumulated, resets: prev.resets };
      };
      if (!led || led.session_id !== sid) led = { session_id: sid, started_at: Date.now() };
      led.five_hour = track(led.five_hour, pctOf(rl0 && rl0.five_hour));
      led.seven_day = track(led.seven_day, pctOf(rl0 && rl0.seven_day));
      led.context_used_percentage =
        cw0 && typeof cw0.used_percentage === "number" ? cw0.used_percentage : null;
      led.updated_at = Date.now();
      fs.writeFileSync(sfile, JSON.stringify(led) + "\n");
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
  // Opus 5 (v0.34.0) — strictly above the baseline, so it boosts from medium up,
  // exactly like Fable 5. The `\b` keeps opus 4.8 / 4.7 out of this branch.
  const isOpus5 = /opus[\s._-]?5\b/.test(hay);
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
  } else if (isOpus5 || isFable5) {
    const label = isOpus5 ? "Opus-5" : "Fable-5";
    if (er >= 2 || er === 0) verdict = "boosted"; // medium…max (or unknown → lenient)
    else {
      verdict = "degrade"; // opus 5 / fable 5 below medium
      reasons.push(`${label} effort<medium`);
    }
  } else if (modelKnown) {
    verdict = "degrade";
    reasons.push("model≠Opus5/Opus4.8/Fable5");
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

  // How far the window moved while THIS session ran (v1.2.0). The ledger below
  // keeps the raw numbers; this renders the delta. Never shown as "this session
  // used X%" — the window is per ACCOUNT, and a second terminal moves it too.
  try {
    const fs = require("fs");
    const path = require("path");
    const projectDir =
      (d.workspace && d.workspace.project_dir) || d.cwd || process.cwd();
    const led = JSON.parse(
      fs.readFileSync(path.join(projectDir, ".claude", "orc", "usage-session.json"), "utf8")
    );
    const w = led && led.five_hour;
    if (w && typeof w.last === "number" && typeof w.baseline === "number") {
      const used = Math.max(0, (w.accumulated || 0) + Math.max(0, w.last - w.baseline));
      if (used > 0) line += " · sess +" + used + "%";
    }
  } catch (_) {}

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
          "opus-5": /opus[\s._-]?5\b/,
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

  // ── Session line (v1.2.0) ──────────────────────────────────────────────────
  // Line 1 answers "what tier am I on and how full is the window". This second
  // line answers "what has this session actually been DOING" — how many agents
  // it spawned, which lanes ran, whether work can leave Claude, and how long it
  // has been going. All of it is read from disk; none of it costs a model call.
  //
  // The dispatch count is the one that earns its place. v1.2.0 exists because a
  // retry cloned a live agent three times over and nothing surfaced it. A count
  // that says `7 (2 running)` makes that visible from the status bar.
  //
  // Fail-silent and THROTTLED: the statusline re-renders on every keystroke, so
  // the trace scan runs at most every 5s and its answer is cached in the same
  // per-session ledger. Any error → no second line, never a broken one.
  let line2 = "";
  try {
    const fs = require("fs");
    const path = require("path");
    const projectDir =
      (d.workspace && d.workspace.project_dir) || d.cwd || process.cwd();
    const orcDir = path.join(projectDir, ".claude", "orc");
    const sfile = path.join(orcDir, "usage-session.json");
    const sid = String(d.session_id || d.sessionId || "");

    let led = null;
    try { led = JSON.parse(fs.readFileSync(sfile, "utf8")); } catch (_) {}
    if (!led || led.session_id !== sid) led = { session_id: sid, started_at: Date.now() };

    // The hook cannot read the RESOLVED config — that is the lane resolver's
    // job, and a hook has no lane — so this reads the two raw keys it needs
    // straight from the file and takes the documented default
    // otherwise — the same caveat the wiki segment above already carries. A
    // user override shifts skill behaviour; this label follows the file.
    let logRel = ".claude/orc/logs";
    let extraOn = false;
    try {
      const raw = fs.readFileSync(path.join(projectDir, ".claude", "orc.config.yaml"), "utf8");
      const ld = /^[ \t]*log_dir:[ \t]*["']?([^"'#\r\n]+)/m.exec(raw);
      if (ld) logRel = ld[1].trim();
      extraOn = /^[ \t]*extra_enabled:[ \t]*true[ \t]*$/m.test(raw);
    } catch (_) {}

    const now = Date.now();
    // The scan interval is the ONE seam over this budget, on the
    // ORC_TEST_PROBE_MS precedent: a test that proves the throttle by SLEEPING
    // past it is a test that fails on a loaded machine, and a flake is recorded
    // and removed, never retried away. Unset, this is byte-identical to a
    // hardcoded 5000, and nothing in ORC ever sets it.
    const scanEvery = (() => {
      const n = Number(process.env.ORC_STATUSLINE_SCAN_MS);
      return Number.isFinite(n) && n >= 0 ? n : 5000;
    })();
    const stale = !led.dispatch || typeof led.dispatch.scanned_at !== "number" ||
      now - led.dispatch.scanned_at >= scanEvery;
    if (stale) {
      const logDir = path.isAbsolute(logRel) ? logRel : path.join(projectDir, logRel);
      const sessionFloor = Math.floor((led.started_at || 0) / 1000) * 1000;
      let spawns = 0;
      let running = 0;
      const lanes = [];
      try {
        for (const f of fs.readdirSync(logDir)) {
          if (!f.startsWith("run-") || !f.endsWith(".txt")) continue;
          const full = path.join(logDir, f);
          // Only traces touched since this session began. A trace from last
          // week is not this session's spend.
          let st;
          try { st = fs.statSync(full); } catch (_) { continue; }
          if (st.mtimeMs < (led.started_at || 0)) continue;
          const text = fs.readFileSync(full, "utf8");
          // Count by the trace's OWN line timestamps, not the file's mtime. A
          // run that was already going when this session started shares its
          // file with the session before it, and mtime cannot tell the two
          // apart — it would attribute the whole file to whoever looked last.
          let mine = 0;
          for (const raw of text.split("\n")) {
            const t = /^\[(\d{2})(\d{2})(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw);
            if (!t) continue;
            if (raw.indexOf("] hook") === -1 || raw.indexOf(" SPAWN ") === -1) continue;
            const at = new Date(
              2000 + Number(t[3]), Number(t[2]) - 1, Number(t[1]),
              Number(t[4]), Number(t[5]), Number(t[6])
            ).getTime();
            // Trace stamps have SECOND resolution and started_at has
            // milliseconds, so a dispatch in the same second as the
            // session start compares as earlier than it. Floor the
            // boundary to the second the trace could actually express.
            if (at >= sessionFloor) mine += 1;
          }
          spawns += mine;
          let openHere = 0;
          try {
            const pend = JSON.parse(fs.readFileSync(full + ".pending.json", "utf8"));
            if (Array.isArray(pend)) openHere = pend.length;
          } catch (_) {}
          running += openHere;
          // A lane earns its name by having actually dispatched in this
          // session — listing a lane that contributed nothing is noise.
          if (mine > 0 || openHere > 0) {
            const m = /^run-([a-z0-9-]+?)-.+-\d{6}-\d{6}\.txt$/.exec(f);
            if (m && lanes.indexOf(m[1]) === -1) lanes.push(m[1]);
          }
        }
      } catch (_) {}
      led.dispatch = { spawns, running, lanes, scanned_at: now };
    }

    led.updated_at = now;
    try {
      fs.mkdirSync(orcDir, { recursive: true });
      fs.writeFileSync(sfile, JSON.stringify(led) + "\n");
    } catch (_) {}

    const dsp = led.dispatch || { spawns: 0, running: 0, lanes: [] };
    const parts = [];
    // `running` is never hidden, because an agent still in flight is the thing
    // a user most needs to see (v1.2.0). Zero is simply not printed.
    parts.push(
      "agents " + dsp.spawns + (dsp.running ? " (" + dsp.running + " running)" : "")
    );
    parts.push("orc-extra: " + (extraOn ? "on" : "off"));
    // An empty lane list means no ORC lane has dispatched yet this session —
    // an ANSWER, not a gap, so it keeps its slot and says so.
    parts.push("lanes: " + (dsp.lanes.length ? dsp.lanes.join(", ") : "none yet"));
    if (led.started_at)
      parts.push(Math.max(0, Math.round((now - led.started_at) / 60000)) + "m");
    line2 = "   " + parts.join(" · ");
  } catch (_) {
    line2 = "";
  }

  process.stdout.write(line2 ? line + "\n" + line2 : line);
});
