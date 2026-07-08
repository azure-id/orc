#!/usr/bin/env node
"use strict";

/**
 * ORC trace hook — the deterministic BACKBONE of ORC behavior-trace logging.
 *
 * ORC is not a runtime; the orchestrator (a Claude session following the orc
 * skill) writes the RICH markers. This hook writes the compaction-proof
 * SKELETON: a `SPAWN` line when an agent is dispatched (PreToolUse:Task) and a
 * `RETURN` line when a subagent finishes (SubagentStop). Even if the model
 * forgets to narrate after a compaction, the flow shape survives here.
 *
 * IMPORTANT — this hook is intentionally BLIND to the dispatched model. Claude
 * Code does not expose a subagent's model id to hooks (it lives only in the
 * subagent's own system prompt). The claimed-vs-actual model check is done by
 * the orchestrator from each agent's `actual_model` return field, NOT here.
 *
 * Gating (the "default off / else do nothing" requirement, enforced in code):
 *   no-op UNLESS  logging:true in .claude/orc.config.yaml  AND  a run pointer
 *   .claude/orc/logs/.current exists (written by the orchestrator at run start).
 *   The pointer means "an ORC run is active and wants tracing" — so Tasks from
 *   non-ORC work are never logged.
 *
 * Wiring (installed by `orc init` into .claude/settings.json):
 *   hooks.PreToolUse[]   { matcher:"Task",  hooks:[{command:"node <..>/orc-trace.js"}] }
 *   hooks.SubagentStop[] {                  hooks:[{command:"node <..>/orc-trace.js"}] }
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

function loggingEnabled() {
  return String(readConfigScalar("logging") || "").toLowerCase() === "true";
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
  // One complete line per append keeps concurrent SubagentStop writes (a wave
  // of N parallel agents) from interleaving mid-line.
  const line =
    `[${stamp(new Date())}] ${String(actor).padEnd(8)} ${verb}` +
    (tail ? ` :: ${tail}` : "") + "\n";
  fs.appendFileSync(path.join(dir, file), line);
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    if (!loggingEnabled()) return; // default off

    const dir = logDir();
    let current;
    try {
      current = fs.readFileSync(path.join(dir, ".current"), "utf8").trim();
    } catch (_) {
      return; // no active ORC run → nothing to trace
    }
    if (!current) return;

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
      const desc = (input.description || "").toString().slice(0, 80);
      appendLine(dir, current, "hook", `SPAWN ${agent}`, desc);
    } else if (event === "SubagentStop" || event === "Stop") {
      appendLine(dir, current, "hook", "RETURN", "");
    }
  } catch (_) {
    // Tracing must never affect a run.
  } finally {
    process.exit(0);
  }
});
