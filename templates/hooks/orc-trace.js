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
  const re = new RegExp("^\\s*" + key + "\\s*:\\s*(.+?)\\s*(?:#.*)?$", "m");
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

    if (event === "PreToolUse" || tool === "Task" || tool === "Agent") {
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
        if (!stats || stats.idleMs > STALE_MS) current = null;
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
      appendLine(dir, current, "hook", "RETURN", "");
    }
  } catch (_) {
    // Tracing must never affect a run.
  } finally {
    process.exit(0);
  }
});
