#!/usr/bin/env node
"use strict";

/**
 * ORC trace hook — the deterministic BACKBONE of ORC behavior-trace logging.
 *
 * ORC is not a runtime; the orchestrator (a Claude session following the orc
 * skill) writes the RICH markers. This hook writes the compaction-proof
 * SKELETON: a `SPAWN` line when an agent is dispatched (PreToolUse on the
 * Task/Agent tool) and a
 * `RETURN` line when a subagent finishes (SubagentStop). Even if the model
 * forgets to narrate after a compaction, the flow shape survives here.
 *
 * IMPORTANT — this hook is intentionally BLIND to the dispatched model. Claude
 * Code does not expose a subagent's model id to hooks (it lives only in the
 * subagent's own system prompt). The claimed-vs-actual model check is done by
 * the orchestrator from each agent's `actual_model` return field, NOT here.
 *
 * Logging is PERMANENT (always on) — no config toggle. This hook is the
 * DETERMINISTIC guarantee that a trace exists: on the first ORC-agent dispatch
 * it BOOTSTRAPS the log folder + run pointer itself, so a `.txt` is created for
 * every run even if the orchestrator never writes a single rich marker. That
 * removes the old failure where nothing was ever created because the folder /
 * pointer depended entirely on the model remembering to make them.
 *
 * Gating (so non-ORC Tasks are never logged, enforced in code):
 *   - a SPAWN is written (and the folder+pointer bootstrapped if missing) only
 *     when the dispatched agent name starts with `orc` — a real ORC run.
 *   - a RETURN is written only when a run pointer already exists, the run is
 *     not STALE, and the file has fewer RETURNs than SPAWNs (a RETURN can never
 *     exist without a matching observed dispatch — this is what stops stray
 *     SubagentStops from unrelated sessions bleeding into an old trace).
 *   - a SubagentStop that carries a non-ORC `agent_type` is dropped, mirroring
 *     the SPAWN gate (an unrelated subagent must never claim an ORC RETURN).
 *
 * Attributable RETURN (v0.31.0): the bare `RETURN` skeleton is unattributable
 * once ≥2 agents are in flight. Each SPAWN now also pushes a pending record into
 * a sidecar next to the trace (`<trace>.pending.json` — `[{agent, desc, ts}]`).
 * On SubagentStop the hook resolves the finishing agent from `data.agent_type`
 * (Claude Code's SubagentStop payload) — or, on older Claude Code that omits it,
 * pops the oldest pending record FIFO and marks the attribution approximate
 * (`~`). It emits `RETURN <agent> :: <desc> dur=<m>m<s>s` and, when
 * `last_assistant_message` carries the agent's `actual_model`, appends
 * ` model=<id>` — so the claimed-vs-actual check is deterministic even if the
 * orchestrator forgets its VERIFY line. The sidecar is best-effort: a missing or
 * corrupt sidecar degrades to a bare RETURN (never throws, always exit 0).
 *
 * Run rotation (v0.23.0): `.current` is a POINTER, not a lifetime lease. A run
 * whose trace file has been idle longer than STALE_MS is considered ENDED — the
 * next ORC dispatch rotates to a fresh `.txt` instead of appending days of
 * unrelated sessions into one merged file.
 *
 * Wiring (installed by `orc init` into .claude/settings.json):
 *   hooks.PreToolUse[]   { matcher:"Task|Agent", hooks:[{command:"node <..>/orc-trace.js"}] }
 *   hooks.SubagentStop[] {                       hooks:[{command:"node <..>/orc-trace.js"}] }
 *   (matcher covers both names — newer Claude Code dispatches subagents via the
 *   `Agent` tool, older via `Task`; matching only `Task` silently kills SPAWN.)
 *
 * Contract: read hook JSON from stdin. ALWAYS exit 0 (never block a tool call —
 * tracing must never affect a run). Fail-silent on any error.
 */

const fs = require("fs");
const path = require("path");

// .claude/hooks/orc-trace.js → CLAUDE_DIR = ..  → PROJECT_ROOT = ../..
const CLAUDE_DIR = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(CLAUDE_DIR, "..");

// Minimal, tolerant YAML line-scan (repo is zero-dep — no YAML parser).
// Reads a top-level `key: value` scalar; ignores comments and quotes.
function readConfigScalar(key) {
  const file = path.join(CLAUDE_DIR, "orc.config.yaml");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (_) {
    return null; // no override file → key absent (caller applies default)
  }
  // Anchor to column 0 — a top-level key only, matching how the CLI reads
  // top-level scalars. Prevents an indented `log_dir:` nested under another map
  // from being read as the global override.
  const re = new RegExp("^" + key + "\\s*:\\s*(.+?)\\s*(?:#.*)?$", "m");
  const m = text.match(re);
  if (!m) return null;
  return m[1].replace(/^['"]|['"]$/g, "").trim();
}

function logDir() {
  const override = readConfigScalar("log_dir");
  const rel = override || ".claude/orc/logs";
  return path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
}

// DDMMYY HH:MM:SS.mmm — matches the decision-log timestamp style.
function stamp(d) {
  const p = (n, w) => String(n).padStart(w || 2, "0");
  const dd = p(d.getDate());
  const mm = p(d.getMonth() + 1);
  const yy = p(d.getFullYear() % 100);
  const t =
    p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) +
    "." + p(d.getMilliseconds(), 3);
  return `${dd}${mm}${yy} ${t}`;
}

function appendLine(dir, file, actor, verb, tail) {
  // Ensure the folder exists — the hook is the deterministic writer, so it
  // must never depend on the orchestrator having created log_dir first.
  fs.mkdirSync(dir, { recursive: true });
  // One complete line per append keeps concurrent SubagentStop writes (a wave
  // of N parallel agents) from interleaving mid-line.
  const line =
    `[${stamp(new Date())}] ${String(actor).padEnd(8)} ${verb}` +
    (tail ? ` :: ${tail}` : "") + "\n";
  fs.appendFileSync(path.join(dir, file), line);
}

// Generic run slug used only when the hook bootstraps a trace before the
// orchestrator wrote its own pointer (e.g. the model skipped run-start).
function bootstrapSlug(d) {
  const p = (n) => String(n).padStart(2, "0");
  const dd = p(d.getDate()), mm = p(d.getMonth() + 1), yy = p(d.getFullYear() % 100);
  const t = p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  return `run-${dd}${mm}${yy}-${t}.txt`;
}

// Read the active run pointer, or null. Never throws.
function readPointer(dir) {
  try {
    const cur = fs.readFileSync(path.join(dir, ".current"), "utf8").trim();
    return cur || null;
  } catch (_) {
    return null;
  }
}

// Sidecar of pending SPAWN records, next to the trace file. Best-effort — every
// accessor swallows errors so a missing/corrupt sidecar never affects the run.
function sidecarPath(dir, file) {
  return path.join(dir, file + ".pending.json");
}
function readPending(dir, file) {
  try {
    const arr = JSON.parse(fs.readFileSync(sidecarPath(dir, file), "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}
function writePending(dir, file, arr) {
  try {
    fs.writeFileSync(sidecarPath(dir, file), JSON.stringify(arr));
  } catch (_) {}
}
function dropPending(dir, file) {
  try {
    fs.unlinkSync(sidecarPath(dir, file));
  } catch (_) {}
}

// A trace file idle longer than this is a FINISHED run — never append to it.
const STALE_MS = 6 * 60 * 60 * 1000;

// Stats for the pointed-at trace file: idle age + hook SPAWN/RETURN balance.
// Returns null when the pointer is dangling (file missing/unreadable).
function traceStats(dir, file) {
  try {
    const full = path.join(dir, file);
    const st = fs.statSync(full);
    const text = fs.readFileSync(full, "utf8");
    // Count only the hook's own skeleton lines (actor column = "hook") — the
    // orchestrator's rich verbs (DISPATCH/VERIFY/…) never collide with these.
    const spawns = (text.match(/\] hook\s+SPAWN /g) || []).length;
    const returns = (text.match(/\] hook\s+RETURN/g) || []).length;
    return { idleMs: Date.now() - st.mtimeMs, spawns, returns };
  } catch (_) {
    return null;
  }
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    // Logging is PERMANENT (always on) — no config gate.
    const dir = logDir();

    let data = {};
    try {
      data = JSON.parse(raw || "{}");
    } catch (_) {
      return;
    }

    const event = data.hook_event_name || "";
    const tool = data.tool_name || "";

    if (event === "PreToolUse" && (tool === "Task" || tool === "Agent")) {
      // Agent dispatch — record the REQUESTED agent name (the claim). The
      // orchestrator's DISPATCH/VERIFY lines carry the authoritative detail.
      const input = data.tool_input || {};
      const agent = input.subagent_type || input.subagentType || "agent";
      // Only ORC-agent dispatches start/extend a trace — non-ORC Tasks (Explore,
      // general-purpose, superpowers, …) are never logged.
      if (!/^orc/i.test(String(agent))) return;
      let current = readPointer(dir);
      // Rotate away from a finished run: a dangling pointer or a trace file
      // idle past STALE_MS means the old run ended — start a fresh `.txt`
      // instead of merging a new day's run into it.
      if (current) {
        const stats = traceStats(dir, current);
        if (!stats || stats.idleMs > STALE_MS) {
          // The old run is over — clean up its pending sidecar so a new run
          // never inherits stale in-flight records.
          dropPending(dir, current);
          current = null;
        }
      }
      if (!current) {
        // Bootstrap: no live run pointer (never written, dangling, or stale).
        // Create the folder + pointer so a trace exists regardless.
        current = bootstrapSlug(new Date());
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, ".current"), current + "\n");
      }
      const desc = (input.description || "").toString().slice(0, 80);
      appendLine(dir, current, "hook", `SPAWN ${agent}`, desc);
      // Push a pending record so the matching RETURN can be attributed (agent +
      // desc + start time). Best-effort — a write failure degrades to a bare
      // RETURN, never affects the run.
      const pend = readPending(dir, current);
      pend.push({ agent: String(agent), desc, ts: Date.now() });
      writePending(dir, current, pend);
    } else if (event === "SubagentStop" || event === "Stop") {
      // A RETURN only makes sense inside an active run — don't manufacture a
      // trace from a stray subagent stop that had no matching ORC dispatch.
      const current = readPointer(dir);
      if (!current) return;
      const stats = traceStats(dir, current);
      // Drop the RETURN when the run is over (stale/dangling) or when every
      // observed SPAWN already has its RETURN — unrelated sessions' subagents
      // must never bleed into an ORC trace.
      if (!stats || stats.idleMs > STALE_MS) return;
      if (stats.returns >= stats.spawns) return;

      // Resolve WHICH agent finished. Claude Code's SubagentStop carries
      // agent_type today; older builds omit it.
      const agentType = (data.agent_type || data.agentType || "").toString();
      // Non-ORC agent_type → drop, mirroring the SPAWN gate.
      if (agentType && !/^orc/i.test(agentType)) return;

      const pend = readPending(dir, current);
      let rec = null;
      let name;
      let approx = false;
      if (agentType) {
        // Match the OLDEST pending record for this agent type (FIFO within name).
        const idx = pend.findIndex((p) => p && p.agent === agentType);
        if (idx >= 0) rec = pend.splice(idx, 1)[0];
        name = agentType;
      } else {
        // Older Claude Code: no agent_type — pop the oldest pending record and
        // mark the attribution approximate (`~`).
        if (pend.length) rec = pend.shift();
        name = rec ? rec.agent : "agent";
        approx = true;
      }

      const parts = [];
      if (rec && rec.desc) parts.push(String(rec.desc));
      if (rec && typeof rec.ts === "number") {
        const s = Math.max(0, Math.round((Date.now() - rec.ts) / 1000));
        parts.push(`dur=${Math.floor(s / 60)}m${s % 60}s`);
      }
      // Opportunistic model capture from the finishing agent's last message —
      // makes the downgrade check deterministic even without the VERIFY line.
      const msg = (data.last_assistant_message || "").toString();
      const mm =
        msg.match(/actual_model["'\s:=]*["']?(claude-[a-z0-9-]+)/i) ||
        msg.match(/\b(claude-[a-z0-9-]+)\b/);
      if (mm) parts.push(`model=${mm[1]}`);

      const label = approx ? `RETURN ~${name}` : `RETURN ${name}`;
      appendLine(dir, current, "hook", label, parts.join(" "));
      writePending(dir, current, pend);
    }
  } catch (_) {
    // Tracing must never affect a run.
  } finally {
    process.exit(0);
  }
});
