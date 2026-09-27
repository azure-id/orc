#!/usr/bin/env node
"use strict";

/**
 * ORC session hook (v2.0.0) — two main-session events, one file.
 *
 *   Stop                    (Q8) the terminal bell when a turn of an ORC run
 *                           ends. Config `notify`: `off` (the default) · `bell`.
 *   SessionStart `compact`  (Q9) ONE line after a compaction, while a run is in
 *                           flight, so the session is told where its state is.
 *
 * Both halves say NOTHING outside an open ORC run. A normal chat never rings
 * and never gets a line. No OS notification, no network, no model text.
 *
 * An open run = the `.current` pointer in `log_dir` exists and is fresh (the
 * same 6-hour window as orc-trace.js and orc-read-gate.js — one idea of "a run
 * is open", not three). The lanes delete `.current` at FINISH.
 *
 * Wiring (installed by `orc init` into .claude/settings.json):
 *   hooks.Stop[]         {                    hooks:[{command:"node <..>/orc-session-hook.js"}] }
 *   hooks.SessionStart[] { matcher:"compact", hooks:[{command:"node <..>/orc-session-hook.js"}] }
 *
 * Contract: read hook JSON from stdin. ALWAYS exit 0. It never blocks a stop
 * (no `decision` key, ever) and it is silent on any error.
 */

const fs = require("fs");
const path = require("path");

// .claude/hooks/orc-session-hook.js → CLAUDE_DIR = .. → PROJECT_ROOT = ../..
const CLAUDE_DIR = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(CLAUDE_DIR, "..");
const STALE_MS = 6 * 60 * 60 * 1000;
// The canonical trace name — the same regex the CLI's in-flight read uses.
const TRACE_NAME = /^run-([a-z0-9]+)-(.+)-(\d{6})-(\d{6})\.txt$/;
const RUN_DIR_DEFAULT = ".claude/orc/run";

// Tolerant top-level YAML scalar read, matching orc-read-gate.js exactly.
function readConfigScalar(key) {
  try {
    const text = fs.readFileSync(path.join(CLAUDE_DIR, "orc.config.yaml"), "utf8");
    const re = new RegExp("^" + key + "\\s*:\\s*(.+?)\\s*(?:#.*)?$", "m");
    const m = text.match(re);
    return m ? m[1].replace(/^['"]|['"]$/g, "").trim() : null;
  } catch (_) {
    return null;
  }
}

function abs(rel) {
  return path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
}

function logDir() {
  return abs(readConfigScalar("log_dir") || ".claude/orc/logs");
}

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch (_) {
    return null;
  }
}

// The open run, or null. `last` = the newest sign of life (the trace file or
// the pointer), which the bell compares with the session start.
function openRun() {
  const dir = logDir();
  let name;
  try {
    name = fs.readFileSync(path.join(dir, ".current"), "utf8").trim();
  } catch (_) {
    return null;
  }
  if (!name) return null;
  const now = Date.now();
  const last = Math.max(mtime(path.join(dir, name)) || 0, mtime(path.join(dir, ".current")) || 0);
  if (!last || now - last >= STALE_MS) return null;
  return { dir, name, last };
}

// ── Q8 — the bell ───────────────────────────────────────────────────────────
// Rings when ALL are true: `notify: bell`; the main session (no `agent_id`);
// a run is open; the run showed life in THIS session (after the transcript was
// created); and it showed life since the last ring. The last rule is what
// makes an idle chat turn next to a paused run stay silent.
function onStop(data) {
  if (String(readConfigScalar("notify") || "off").toLowerCase() !== "bell") return;
  if (data.agent_id) return;
  const run = openRun();
  if (!run) return;
  let born = 0;
  try {
    if (data.transcript_path) {
      const st = fs.statSync(data.transcript_path);
      born = st.birthtimeMs || 0;
    }
  } catch (_) {}
  if (born && run.last < born) return; // the run was open before this session began
  const statePath = path.join(CLAUDE_DIR, "orc", "notify-state.json");
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (_) {}
  if (prev && prev.run === run.name && typeof prev.at === "number" && run.last <= prev.at) return;
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ run: run.name, at: Date.now() }) + "\n");
  } catch (_) {}
  process.stdout.write(JSON.stringify({ terminalSequence: "\u0007" }));
}

// ── Q9 — the run pointer after compaction ───────────────────────────────────
// ONE line, only when the pointer names a run whose folder exists and is not
// closed. A run the disk cannot find is not a run this line can point at.
function onCompact(data) {
  if (data.source && data.source !== "compact") return;
  const run = openRun();
  if (!run) return;
  const m = TRACE_NAME.exec(run.name);
  if (!m) return;
  const slug = m[2];
  const rel = readConfigScalar("run_dir") || RUN_DIR_DEFAULT;
  const folder = path.join(abs(rel), slug);
  try {
    if (!fs.statSync(folder).isDirectory()) return;
  } catch (_) {
    return;
  }
  if (fs.existsSync(path.join(folder, "RESUME.closed.md"))) return;
  const shown = path.isAbsolute(rel) ? rel : rel.replace(/\\/g, "/").replace(/\/+$/, "");
  process.stdout.write(
    `orc: run ${slug} is in flight — read ${shown}/${slug}/state-of-play.md, then the checkpoint (hard rule 2)\n`
  );
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(raw || "{}") || {};
    const ev = String(data.hook_event_name || "");
    if (ev === "Stop") onStop(data);
    else if (ev === "SessionStart") onCompact(data);
  } catch (_) {}
  process.exit(0);
});
