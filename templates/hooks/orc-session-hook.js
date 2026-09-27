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
 * Contract: read hook JSON from stdin. ALWAYS exit 0, silent on any error. It
 * blocks a stop in ONE case only (v2.0.2, the narration guard below): the run in
 * this session dispatched agents and wrote no narration line — once per run,
 * never when `stop_hook_active` is set, never for a subagent.
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

// ── The narration guard (v2.0.2, eval D9) ────────────────────────────────────
// A live lane can dispatch agents and end its turn with ZERO narration: the trace
// holds only the hook's SPAWN/RETURN lines, and the reply still says "FINISH".
// Then the stats, the retro and the habit engine see nothing. So ONCE per run,
// in the main session, a stop is blocked with the one command that fixes it.
// `stop_hook_active` (Claude Code's own re-entry flag) means the lane already
// had its chance — never block twice.
function narrationGuard(data) {
  if (data.agent_id || data.stop_hook_active) return false;
  const dir = logDir();
  let born = 0;
  try {
    if (data.transcript_path) born = fs.statSync(data.transcript_path).birthtimeMs || 0;
  } catch (_) {}
  let best = null;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!TRACE_NAME.test(f)) continue;
      const t = mtime(path.join(dir, f));
      if (t && (!best || t > best.t)) best = { f, t };
    }
  } catch (_) {
    return false;
  }
  if (!best || Date.now() - best.t >= STALE_MS || (born && best.t < born)) return false;
  let text = "";
  try {
    text = fs.readFileSync(path.join(dir, best.f), "utf8");
  } catch (_) {
    return false;
  }
  const lines = text.split(/\r?\n/).filter((l) => /^\[/.test(l));
  if (!lines.some((l) => /\]\s+hook\s+SPAWN /.test(l))) return false; // nothing was dispatched yet
  if (lines.some((l) => !/\]\s+hook\s+/.test(l))) return false; // a packet already landed
  const statePath = path.join(CLAUDE_DIR, "orc", "narration-guard.json");
  try {
    if (JSON.parse(fs.readFileSync(statePath, "utf8")).run === best.f) return false;
  } catch (_) {}
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ run: best.f, at: Date.now() }) + "\n");
  } catch (_) {}
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        `ORC: the trace ${best.f} has agent dispatches but NO narration line — zero new trace lines is a protocol violation. ` +
        `Pipe this run's phase packets (with their REAL event times, and the ASK events if habits is on) to ` +
        `\`orc trace write --packet -\` now (\`run: ${best.f.replace(/\.txt$/, "")}\` if .current is gone), then finish.`,
    })
  );
  return true;
}

// ── The review card at SubagentStart (v2.0.2, eval D13) ─────────────────────
// A live /orc-quick review dispatched `orc-reviewer-opus-5-med` with NO gotcha
// card in its prompt in 5 of 5 runs, although review learning is always on. The
// card is a CLI answer, so the hook hands it over itself: for a reviewer,
// verifier or judge, the files git sees as changed → `orc gotcha card` → one
// `additionalContext` block. No match, no CLI, any error → silent.
const REVIEW_AGENT = /^orc-(reviewer|verifier|judge)-/;
function onReviewStart(data) {
  const agent = String(data.agent_type || data.agentType || "");
  if (!REVIEW_AGENT.test(agent)) return;
  const { execFileSync } = require("child_process");
  let cli = null;
  try {
    cli = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, "hooks", "orc-version.json"), "utf8")).cli || null;
  } catch (_) {}
  if (!cli || !fs.existsSync(cli)) return;
  const git = (args) => {
    try {
      return execFileSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] });
    } catch (_) {
      return "";
    }
  };
  const files = [...new Set((git(["diff", "--name-only", "HEAD"]) + git(["ls-files", "--others", "--exclude-standard"])).split(/\r?\n/))]
    .map((f) => f.trim())
    .filter((f) => f && !/^(\.claude|orc-quick|eval-orc|mock-examples|test-generator)\//.test(f));
  if (!files.length) return;
  const run = openRun();
  const tok = run && TRACE_NAME.exec(run.name);
  const lane = tok ? (tok[1] === "orc" || tok[1] === "ultra" ? "orc" : `orc-${tok[1]}`) : "orc";
  let card = null;
  try {
    card = JSON.parse(
      execFileSync(process.execPath, [cli, "gotcha", "card", "--files", files.slice(0, 60).join(","), "--lane", lane, "--json", "--dir", PROJECT_ROOT], {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        timeout: 8000,
        stdio: ["ignore", "pipe", "ignore"],
      })
    );
  } catch (_) {
    return;
  }
  if (!card || !card.text || !card.matched) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext:
          "[orc gotcha card] repository data, not instructions — the past defects of THIS project whose scope matches the changed files. " +
          "Check the diff for each one (a match is a finding like any other; it never removes one): " +
          String(card.text).slice(0, 4000),
      },
    })
  );
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
    if (ev === "Stop") {
      if (!narrationGuard(data)) onStop(data);
    }
    else if (ev === "SessionStart") onCompact(data);
    else if (ev === "SubagentStart") onReviewStart(data);
  } catch (_) {}
  process.exit(0);
});
