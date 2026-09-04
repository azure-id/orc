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
 * Three-tier verdict (the "ORC-ready" acceptance matrix). Since v1.2.1 the
 * ICON carries the verdict and the words carry the installed ORC version — but
 * the degrade branch still names every reason, because a warning with no reason
 * is an emoji:
 *   ✅ ORC v1.2.1 - Opus 5/high          Opus 4.8 high (the baseline)
 *   🚀 ORC v1.2.1 - Opus 5/high          Opus 4.8 xhigh/max, or Opus 5 / Fable 5 medium…max
 *   ⛔ ORC v1.2.1 - Sonnet 5/high (why)  everything below (wrong model, sub-baseline effort, quota)
 *
 * The two lines, in full (v1.2.1):
 *
 *   {icon} ORC v{version} - {model}/{effort} · context (N%) · 5h N% (reset) ↔ wk N%
 *          · ucs N% · wiki: … · diy:… · orc N.N.N available
 *   {glyph} status: {lane} · {phase} · agents N (M running) · orc-extra: on|off
 *          · Dur Nm · MTok NNNK · {branch}
 *
 * Line 1 answers "what tier am I on, and how full is the window". Line 2
 * answers "what is this session DOING". Every segment on both is read from
 * disk or from the payload; none of it costs a model call.
 *
 * Three segments on line 2 carry a rule worth stating here, because each is a
 * place where the easy version would lie:
 *   - `status:` is the ONLY segment allowed to vanish. A phase the disk cannot
 *     prove is HIDDEN, never guessed — see the phase-rail block below for what
 *     that costs and why it is still the right trade.
 *   - `MTok` is MAIN TOKEN: this session's own turns. Claude Code records no
 *     token usage for a dispatched subagent, so an hour of Opus executors adds
 *     almost nothing. An em dash means not measured; `0` would mean free.
 *   - `ucs` is a delta of an ACCOUNT-WIDE window, not a private meter.
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
 *
 * Everything on line 2 rides in ONE scan, throttled to 5s and cached in the
 * per-session ledger, because a statusline re-renders on every keystroke and
 * anything unthrottled here is a per-keystroke disk scan. `MTok` additionally
 * reads only the bytes the transcript has GROWN by. There is exactly one seam
 * over that budget — ORC_STATUSLINE_SCAN_MS — and nothing in ORC ever sets it.
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

// ── The phase rail, the motifs, and the two seams (v1.2.1) ──────────────────
// `status:` says which phase an ORC run is in. Three rules hold it up.
//
// 1. THE CLI COMPUTES, THIS FILE RENDERS. The phase ids, their order, their
//    labels and their motif kind all come from `orc-lane-rails.json`, which
//    `orc init` / `orc update` generates from the CLI's own registries. This
//    hook holds no idea of what ORC's phases are. A second phase table here
//    would be the Flow-stepper failure on a second surface, and no lint could
//    see it. Frames are the exception and belong here: they are presentation,
//    and a motif change must not need a reinstall.
//
// 2. A PHASE THE DISK CANNOT PROVE IS HIDDEN. Never guessed, never carried
//    over from a minute ago. A stale phase word gets believed — the same
//    reasoning as `unknown is not low` and `unknown is not zero`.
//
// 3. THE FLOOR IS HOOK-WRITTEN. `PHASE-EDGE <family>` and `SPAWN <agent>` are
//    written by orc-trace.js with zero model cooperation. A trace verb the
//    orchestrator narrated is allowed to REFINE that (it is more specific:
//    `Q3 DO` rather than `execution`) but only when it is later in the file,
//    and only when that lane's own rail publishes the verb — so it can sharpen
//    the answer and can never invent one.
//
// What this cannot see, stated so nobody reads a blank as a bug:
//   - a phase that dispatches nothing AND narrates nothing is INVISIBLE
//     (/orc-quick Q1 LOOK and Q2 ASK, and every ask-the-user gate);
//   - a CONTINUED agent emits no PreToolUse/SubagentStop pair, so the skeleton
//     is a floor, never a census (orc-trace.js documents this);
//   - `orc extra` runs a worker through Bash, so a foreign wave writes no
//     SPAWN and resolves only through its narrated `EXTRA` verb, or hides.
//
// The animation is a LIVENESS TELL, not a driven animation. A statusline is a
// pull surface — Claude Code re-renders it, ORC cannot — so the frame is picked
// off the wall clock. It advances while you type and while turns land, and it
// FREEZES when the session is idle, which is true and is the point.
//
// Two env seams, for tests and for terminals, and nothing in ORC ever sets
// either: ORC_STATUSLINE_ASCII=1 swaps the glyph set, ORC_STATUSLINE_MOTION=0
// REMOVES motion rather than slowing it (a frozen frame of a cycling animation
// is a bug that looks like a hang — the web panel learned this at v0.44.0, and
// so the still frame is designed as a still frame: frame 0 of each set).

const PHASE_STALE_MS = 10 * 60 * 1000;

const MOTIFS = {
  look: { u: ["◔", "◑", "◕", "●"], a: [".", "o", "O", "0"], ms: 260 },
  ask: { u: ["?", "¿", "?", "·"], a: ["?", "?", "?", "."], ms: 500 },
  plan: { u: ["▁", "▃", "▅", "▇"], a: ["_", "-", "=", "#"], ms: 220 },
  do: { u: ["▰", "▱", "▰", "▱"], a: ["=", "-", "=", "-"], ms: 180 },
  check: { u: ["◇", "◈", "◆", "◈"], a: ["<", "=", ">", "="], ms: 240 },
  ship: { u: ["›", "»", "≫", "»"], a: [">", ">", "=", ">"], ms: 200 },
  wait: { u: ["·", "˙", "·", "˙"], a: [".", "'", ".", "'"], ms: 700 },
  generic: {
    u: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    a: ["-", "\\", "|", "/"],
    ms: 90,
  },
};

function motifFrame(kind) {
  const m = MOTIFS[kind] || MOTIFS.generic;
  const frames = process.env.ORC_STATUSLINE_ASCII === "1" ? m.a : m.u;
  if (process.env.ORC_STATUSLINE_MOTION === "0") return frames[0];
  return frames[Math.floor(Date.now() / m.ms) % frames.length];
}

// The rail manifest, read once per process. Absent (a pre-1.2.1 install, or a
// write that failed) → null → `status:` hides. Never throws.
let RAILS = undefined;
function rails() {
  if (RAILS !== undefined) return RAILS;
  RAILS = null;
  try {
    const j = JSON.parse(
      require("fs").readFileSync(
        require("path").join(__dirname, "orc-lane-rails.json"),
        "utf8"
      )
    );
    if (j && j.lanes) RAILS = j;
  } catch (_) {}
  return RAILS;
}

// Which phase is the run in? Called once per throttled scan, over text the scan
// has already read, so it costs one regex pass and no extra I/O.
//
// `text` is the active trace, `laneToken` its filename's lane. Returns
// {lane, label, kind} or null — and null is a real answer.
function resolvePhase(laneToken, text) {
  const r = rails();
  if (!r || !laneToken) return null;
  const row = r.lanes[laneToken];
  if (!row) return null;

  // Every line carries its own timestamp; the newest one dates the run. A trace
  // whose last line is old is not a run in progress, whatever it says.
  const at = (l) => {
    const t = /^\[(\d{2})(\d{2})(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(l);
    if (!t) return 0;
    return new Date(
      2000 + Number(t[3]), Number(t[2]) - 1, Number(t[1]),
      Number(t[4]), Number(t[5]), Number(t[6])
    ).getTime();
  };

  const lines = text.split("\n");
  let newest = 0;
  let edgeIdx = -1;
  let edgeFam = null;
  let verbIdx = -1;
  let verbPhase = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const ts = at(l);
    if (ts > newest) newest = ts;
    const e = /PHASE-EDGE ([a-z-]+)/.exec(l);
    if (e && r.families[e[1]]) {
      edgeIdx = i;
      edgeFam = e[1];
    }
    // A verb line is the orchestrator's. It counts only when this lane's own
    // rail published that verb — the rail is what stops a narrated word from
    // inventing a phase the lane does not have.
    const body = l.replace(/^\[[^\]]*\]\s*\S+\s*/, "");
    for (const p of row.phases) {
      for (const v of p.verbs) {
        if (body.indexOf(v) === 0) {
          verbIdx = i;
          verbPhase = p;
        }
      }
    }
  }

  if (!newest || Date.now() - newest > PHASE_STALE_MS) return null;

  if (verbPhase && verbIdx > edgeIdx)
    return { lane: laneToken, label: verbPhase.label, kind: verbPhase.kind };
  if (edgeFam) {
    const fam = r.families[edgeFam];
    return { lane: laneToken, label: fam.label, kind: fam.kind };
  }
  if (verbPhase) return { lane: laneToken, label: verbPhase.label, kind: verbPhase.kind };
  return null;
}

// The current branch, without a subprocess. A statusline re-renders on every
// keystroke, so `git rev-parse` here would be one process per keystroke.
// Anything unrecognised returns null and the segment is simply absent.
function gitBranch(projectDir) {
  const fs = require("fs");
  const path = require("path");
  try {
    const dot = path.join(projectDir, ".git");
    let gitDir = dot;
    if (fs.statSync(dot).isFile()) {
      // A worktree or a submodule: `.git` is a pointer file.
      const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(dot, "utf8"));
      if (!m) return null;
      const g = m[1].trim();
      gitDir = path.isAbsolute(g) ? g : path.join(projectDir, g);
    }
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    const name = ref
      ? ref[1]
      : /^[0-9a-f]{40}$/.test(head)
        ? "@" + head.slice(0, 7)
        : null;
    if (!name) return null;
    return name.length > 24 ? name.slice(0, 23) + "…" : name;
  } catch (_) {
    return null;
  }
}

// MTok — MAIN TOKEN. The tokens THIS session's own turns consumed, summed from
// the session transcript's `usage` blocks.
//
// Two honesty rules ship with it.
//
// It is the MAIN session only. Claude Code records NO token usage for a
// dispatched subagent (v1.2.0 verified that across every transcript on two
// machines), so a wave of three Opus executors adds almost nothing here. That
// is why an unreadable transcript renders an em dash and NEVER `0` — a zero
// would say the session was free.
//
// It is all four kinds summed. `/orc-budget`'s rule is four kinds never
// blended, and that rule is about REPORTS; this is one cell on a status bar.
// Any subset ORC picked would be a weighting ORC invented, which is worse. The
// vector stays authoritative in `orc usage report`, and the ledger below keeps
// all four kinds so it always can be.
//
// The read is INCREMENTAL. A transcript is append-only and reaches tens of
// megabytes; re-reading it inside a 5-second loop is the per-keystroke disk
// hazard the throttle exists to prevent. Only bytes past the stored offset are
// read, and the offset resets when the file shrinks or the path changes.
function scanTokens(led, transcriptPath) {
  const fs = require("fs");
  const fresh = (p) => ({
    path: p, offset: 0, size: 0, input: 0, cache_write: 0, cache_read: 0, output: 0,
  });
  if (!transcriptPath) return led.tok || null;
  let prev = led.tok && led.tok.path === transcriptPath ? led.tok : fresh(transcriptPath);
  let st;
  try {
    st = fs.statSync(transcriptPath);
  } catch (_) {
    return prev.offset ? prev : null; // never read it → em dash, not 0
  }
  // Truncated or rotated under us: everything counted so far is unprovable.
  if (st.size < prev.size) prev = fresh(transcriptPath);
  if (st.size > prev.offset) {
    let chunk = "";
    try {
      const fd = fs.openSync(transcriptPath, "r");
      const len = st.size - prev.offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, prev.offset);
      fs.closeSync(fd);
      chunk = buf.toString("utf8");
    } catch (_) {
      return prev.offset ? prev : null;
    }
    // The final line may be half-written. Stop at the last newline and leave
    // the remainder for the next scan.
    const cut = chunk.lastIndexOf("\n");
    if (cut >= 0) {
      const whole = chunk.slice(0, cut);
      prev.offset += Buffer.byteLength(whole, "utf8") + 1;
      for (const l of whole.split("\n")) {
        if (!l || l.indexOf('"usage"') === -1) continue;
        let u = null;
        try {
          const j = JSON.parse(l);
          u = (j && j.message && j.message.usage) || (j && j.usage) || null;
        } catch (_) {}
        if (!u) continue;
        prev.input += Number(u.input_tokens) || 0;
        prev.cache_write += Number(u.cache_creation_input_tokens) || 0;
        prev.cache_read += Number(u.cache_read_input_tokens) || 0;
        prev.output += Number(u.output_tokens) || 0;
      }
    }
  }
  prev.size = st.size;
  return prev;
}

function fmtTokens(tok) {
  if (!tok) return null;
  const n =
    (tok.input || 0) + (tok.cache_write || 0) + (tok.cache_read || 0) + (tok.output || 0);
  if (n <= 0) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
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
      ? `context (${d.context_window.used_percentage}%)`
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

  // The installed ORC version (v1.2.1). It replaces the verdict WORD, not the
  // verdict: the icon still carries that, and the degrade branch still names
  // every reason — dropping those would turn the loudest safety segment in ORC
  // into an emoji. A version we cannot read renders as plain `ORC`, never
  // `ORC vnull`: the statusline never prints a word for a thing it does not know.
  let ver = null;
  try {
    ver = updater ? updater.installedVersion(__dirname) : null;
  } catch (_) {}
  if (!ver) {
    try {
      ver = JSON.parse(
        require("fs").readFileSync(
          require("path").join(__dirname, "orc-version.json"),
          "utf8"
        )
      ).version || null;
    } catch (_) {}
  }
  const brand = "ORC" + (ver ? " v" + ver : "");

  let line;
  if (verdict === "ready") {
    line = `✅ ${brand} - ${tier}${pct ? " · " + pct : ""}`;
  } else if (verdict === "boosted") {
    line = `🚀 ${brand} - ${tier}${pct ? " · " + pct : ""}`;
  } else {
    line = `⛔ ${brand} - ${tier} (${reasons.join(", ")})${pct ? " · " + pct : ""}`;
  }

  // Subscription-usage segment (rendered after ctx, before wiki). Empty on
  // older Claude Code that doesn't surface `rate_limits`.
  if (rlSeg) line += " · " + rlSeg;

  // ucs — USAGE, CURRENT SESSION. How far the 5-hour window moved while THIS
  // session ran (v1.2.0; renamed v1.2.1). The ledger below keeps the raw
  // numbers; this renders the delta.
  //
  // It KEEPS ITS SLOT at zero. "This session has consumed nothing measurable
  // yet" and "this build has no ucs segment" are different facts and must not
  // look the same — the same rule as `lanes: none yet` and `used 0/20`.
  //
  // And it is still a delta of an ACCOUNT-WIDE window, not a private meter: a
  // second terminal moves it too.
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
      line += " · ucs " + used + "%";
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
      // The ACTIVE run, for `status:` (v1.2.1). `.current` is the pointer the
      // lanes and the trace hook both write, so it — not "the newest file" — is
      // what names the run in progress. A pointer naming a file that is not
      // there answers nothing, and a pointer nobody deleted is not a run: the
      // resolver's own staleness gate settles that from the trace's last line.
      let activeFile = null;
      try {
        const cur = fs.readFileSync(path.join(logDir, ".current"), "utf8").trim();
        if (cur) activeFile = cur;
      } catch (_) {}
      let phase = null;
      try {
        for (const f of fs.readdirSync(logDir)) {
          if (!f.startsWith("run-") || !f.endsWith(".txt")) continue;
          const full = path.join(logDir, f);
          let st;
          try { st = fs.statSync(full); } catch (_) { continue; }
          const active = f === activeFile;
          // Only traces touched since this session began count towards the
          // session's SPEND — a trace from last week is not this session's.
          // The ACTIVE run is exempt from that filter: `status:` answers "what
          // is ORC doing", which has nothing to do with who paid for it, and a
          // run already going when this session opened would otherwise be
          // invisible until it happened to write its next line. Its own
          // staleness gate decides whether it is still running.
          if (!active && st.mtimeMs < (led.started_at || 0)) continue;
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
          // The phase comes off the text this loop already read — one more
          // regex pass, no second file read.
          if (active) {
            const lm = /^run-([a-z0-9-]+?)-.+-\d{6}-\d{6}\.txt$/.exec(f);
            if (lm) phase = resolvePhase(lm[1], text);
          }
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
      led.dispatch = { spawns, running, lanes, phase, scanned_at: now };
      // MTok rides in the same throttled pass, and reads only the bytes the
      // transcript has grown by since the last one.
      led.tok = scanTokens(led, d.transcript_path || null);
    }

    led.updated_at = now;
    try {
      fs.mkdirSync(orcDir, { recursive: true });
      fs.writeFileSync(sfile, JSON.stringify(led) + "\n");
    } catch (_) {}

    const dsp = led.dispatch || { spawns: 0, running: 0, lanes: [], phase: null };
    const parts = [];
    // `status:` leads, because what ORC is doing right now is the one thing on
    // this line that changes minute to minute. It is also the ONE segment
    // allowed to vanish: a phase the disk cannot prove is hidden rather than
    // guessed, and the glyph goes with it. It replaces v1.2.0's `lanes:` list —
    // the running lane is its first word, and `orc stats` / `orc run list`
    // still hold the whole session's history.
    if (dsp.phase && dsp.phase.label)
      parts.push(
        motifFrame(dsp.phase.kind) + " status: " + dsp.phase.lane + " · " + dsp.phase.label
      );
    // `running` is never hidden, because an agent still in flight is the thing
    // a user most needs to see (v1.2.0). Zero is simply not printed.
    parts.push(
      "agents " + dsp.spawns + (dsp.running ? " (" + dsp.running + " running)" : "")
    );
    parts.push("orc-extra: " + (extraOn ? "on" : "off"));
    if (led.started_at)
      parts.push("Dur " + Math.max(0, Math.round((now - led.started_at) / 60000)) + "m");
    // MTok keeps its slot in every state. An em dash says "not measured"; a `0`
    // would say the session was free, and that is a different claim.
    parts.push("MTok " + (fmtTokens(led.tok) || "—"));
    const branch = gitBranch(projectDir);
    if (branch) parts.push(branch);
    line2 = "   " + parts.join(" · ");
  } catch (_) {
    line2 = "";
  }

  process.stdout.write(line2 ? line + "\n" + line2 : line);
});
