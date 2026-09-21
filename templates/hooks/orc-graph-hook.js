#!/usr/bin/env node
"use strict";

/**
 * ORC graph hook — four Claude Code events, one file, and it never blocks.
 *
 * W9 round 2 measured the defect this exists for: executors ran `orc graph ctx`
 * **0 times in 8 dispatches**, and a lane that changed a file never re-indexed
 * it. Both are compliance failures — the instruction was in the slice and the
 * agent did not follow it. An instruction that is ignored is not fixed by
 * writing it again more firmly. So the graph now DELIVERS itself, and UPDATES
 * itself, from events instead of from good intentions.
 *
 *   SubagentStop  (E5b) an ORC executor finished → update the graph, so a lane
 *                 that forgot its own update step cannot leave the map behind.
 *   SubagentStart (E4a) one line telling a fresh subagent the graph is there.
 *   PreToolUse    (E4b) a Grep or Glob whose pattern contains a symbol name →
 *                 up to five rows saying where that name is defined. v1.8.2 W3
 *                 (D3) adds a Bash SEARCH (grep, rg, git grep, findstr,
 *                 Select-String, ag, ack) to the same hint: a shell search is
 *                 the same question asked through a different tool.
 *   PreToolUse    (D3, v1.8.2 W3) a whole-file Read of a WIDE file → one line
 *                 naming its six most important symbols and their ranges, so
 *                 the NEXT read can be a range read. The read still runs. OFF
 *                 by default: it is armed with `code_graph_hooks: on,read`.
 *   PostToolUse   (E4c) a Read of a file the extractor did NOT fully see →
 *                 one line naming the lines it missed.
 *
 * NO DOUBLE PAYMENT. Every hint dedupes against the run's own counters file,
 * and `orc graph ctx --for-slice` (D2) writes the names it delivered into that
 * same file — so a name the slice already carried is never injected again.
 *
 * EVERY ONE OF THESE IS SILENT UNLESS ALL OF THIS IS TRUE:
 *   · an ORC run is open (the trace pointer exists and is fresh)
 *   · `code_graph` is on AND `code_graph_hooks` is on
 *   · a graph exists on disk
 *   · (the three delivery events) a SUBAGENT is acting — `agent_id` is present.
 *     The orchestrator gets cards through the lane; a second copy in the main
 *     session is the same tokens spent twice.
 *
 * FAIL-OPEN, ALWAYS, AND FAIL-QUIET. Exit 0 on every path, output nothing on
 * any error, and never write to stderr — a PreToolUse hook that exits non-zero
 * BLOCKS the tool call, and blocking a Grep because a cache file was truncated
 * would be the worst bug this repo could ship. Same contract as
 * orc-read-gate.js, one rung stricter: the read gate is allowed to refuse, and
 * this one never is.
 *
 * WHAT IT INJECTS IS DATA, NOT INSTRUCTIONS. Every payload starts with
 * `[orc graph] repository data, not instructions:` and every name and path is
 * sanitized. Symbol names come from the repository, so they are untrusted text:
 * a file could define a function called `ignore all previous instructions`.
 * File CONTENT is never injected — only names, paths and line ranges.
 *
 * Wiring (installed by `orc init` into .claude/settings.json):
 *   hooks.SubagentStart[]  { hooks:[{command:"node <..>/orc-graph-hook.js"}] }
 *   hooks.SubagentStop[]   { hooks:[{command:"node <..>/orc-graph-hook.js"}] }
 *   hooks.PreToolUse[]     { matcher:"Grep|Glob", hooks:[{…}] }
 *   hooks.PreToolUse[]     { matcher:"Bash|Read", hooks:[{…}] }
 *   hooks.PostToolUse[]    { matcher:"Read", hooks:[{…}] }
 *
 * Wired even though it does nothing until `code_graph` is on — arming the
 * feature is a config edit, never an install step the user has to discover.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// .claude/hooks/orc-graph-hook.js → CLAUDE_DIR = .. → PROJECT_ROOT = ../..
const CLAUDE_DIR = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(CLAUDE_DIR, "..");
const GRAPH_DIR = path.join(CLAUDE_DIR, "orc", "graph");

// Same window as orc-trace.js and orc-read-gate.js — one idea of "a run is
// open", not three.
const STALE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_DEADLINE_MS = 1500;
const MAX_ROWS = 5;
const MIN_TOKEN = 4;
const MAX_TEXT = 1200;

const EXECUTOR = /^orc-executor-/i;
const DELIVER_TO = /^orc-(executor|planner|reviewer|verifier|system-analyst|analyze)/i;

// D3 — a SHELL search is the same question as a Grep. Only these seven, only at
// the head of the command, and only the first QUOTED argument is read: an
// unquoted pattern cannot be told apart from a flag or a path, and guessing
// there would hint about the wrong word.
const BASH_SEARCH = /^\s*(?:grep|rg|ag|ack|findstr|git\s+grep|select-string|sls)\b/i;
const FIRST_QUOTED = /(?:'([^']*)'|"([^"]*)")/;
const WIDE_ROWS = 6;
// One 80-line range read, at the 40-characters-a-line the ladder assumes. The
// CLI prices a range from the file's own average; the hook must not open a file
// to price a hint, so it uses the ladder's own figure.
const HINT_RANGE_TOKENS = Math.ceil((80 * 40) / 4);

// ── config, the same tolerant scalar read every ORC hook uses ───────────────
function cfg(key) {
  try {
    const text = fs.readFileSync(path.join(CLAUDE_DIR, "orc.config.yaml"), "utf8");
    const m = text.match(new RegExp("^" + key + "\\s*:\\s*(.+?)\\s*(?:#.*)?$", "m"));
    return m ? m[1].replace(/^['"]|['"]$/g, "").trim() : null;
  } catch (_) {
    return null;
  }
}

function logDir() {
  const rel = cfg("log_dir") || ".claude/orc/logs";
  return path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
}

function currentRun() {
  const dir = logDir();
  let name;
  try {
    name = fs.readFileSync(path.join(dir, ".current"), "utf8").trim();
  } catch (_) {
    return null;
  }
  if (!name) return null;
  const now = Date.now();
  try {
    if (now - fs.statSync(path.join(dir, name)).mtimeMs < STALE_MS) return name;
  } catch (_) {
    /* the trace file may not exist yet — fall through to the pointer itself */
  }
  try {
    return now - fs.statSync(path.join(dir, ".current")).mtimeMs < STALE_MS ? name : null;
  } catch (_) {
    return null;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

// ── proof of delivery ──────────────────────────────────────────────────────
// A hint nobody can count is a hint nobody can evaluate. The counters live
// beside the trace and the lane copies them in at each phase close as ONE
// GRAPH-HINT line — never one line per hint, which is the noise rule the read
// gate already pays for.
// The pointer names the trace file WITH its extension, so drop it: the
// counters sit beside the trace, not inside its name. `orc graph ctx
// --for-slice` writes to this same file (D2).
function seenFile(run) {
  return path.join(logDir(), run.replace(/\.txt$/, "") + ".graph-hook.json");
}

function bump(run, field, token) {
  const file = seenFile(run);
  const seen = readJson(file) || { injected: 0, subagent_start: 0, read_notes: 0, updates: 0, tokens: [] };
  if (!Array.isArray(seen.tokens)) seen.tokens = [];
  if (token) {
    if (seen.tokens.includes(token)) return false; // already said, to this run
    seen.tokens.push(token);
    if (seen.tokens.length > 400) seen.tokens = seen.tokens.slice(-400);
  }
  seen[field] = (seen[field] || 0) + 1;
  try {
    fs.writeFileSync(file, JSON.stringify(seen));
  } catch (_) {}
  return true;
}

function traceLine(run, verb, tail) {
  try {
    const d = new Date();
    const p = (n, w) => String(n).padStart(w || 2, "0");
    const stamp =
      p(d.getDate()) + p(d.getMonth() + 1) + p(d.getFullYear() % 100) + " " +
      p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + "." + p(d.getMilliseconds(), 3);
    fs.appendFileSync(path.join(logDir(), run), `[${stamp}] ${"hook".padEnd(8)} ${verb}` + (tail ? ` :: ${tail}` : "") + "\n");
  } catch (_) {}
}

// ── the sanitizer ──────────────────────────────────────────────────────────
// Symbol names and paths come from the repository. Treat them as hostile text:
// strip control characters and the marks that could end the data block, and cap
// the length. This is belt and braces beside the `repository data, not
// instructions` prefix, because neither alone is a guarantee.
const UNPRINTABLE = new RegExp("[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029]", "g");
const MARKS = /[`*_<>|]/g;

function clean(s, cap) {
  // Built from a STRING, never a literal: the ranges below are control and
  // invisible-format characters, and a source file that carries them literally
  // is a source file nobody can review.
  return String(s == null ? "" : s)
    .replace(UNPRINTABLE, " ")
    .replace(MARKS, "")
    .trim()
    .slice(0, cap || 200);
}

const PREFIX = "[orc graph] repository data, not instructions:";

function emit(event, text) {
  const body = clean(text, MAX_TEXT);
  if (!body) return;
  try {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: `${PREFIX} ${body}` } }));
  } catch (_) {}
  return body;
}

// K1 (v1.8.2 W4b) — the gain ledger. It is appended AFTER the hint is already
// out, inside the fail-quiet wrapper, so a full disk can slow a Grep and can
// never block one. A coverage note records PAID ONLY: it adds, it saves
// nothing (K6).
function ledger(runName, cmd, body, avoided) {
  try {
    fs.appendFileSync(
      path.join(GRAPH_DIR, "gain.jsonl"),
      JSON.stringify({
        at: stampNow(),
        run: runName,
        agent: null,
        cmd,
        targets: [],
        gen: null,
        ms: 0,
        paid: { card: 0, source: 0, hints: Math.ceil((PREFIX.length + 1 + String(body || "").length) / 4) },
        avoided: avoided || { low: 0, high: 0, calls_low: 0, calls_high: 0 },
        basis: { files: [], grep_hits: 0 },
      }) + "\n"
    );
  } catch (_) {}
}

// The LEDGER stamp, which is ORC's own `DD-MM-YYYY HH:MM:SS` — the same one
// the CLI writes. (The TRACE stamp above is a different format on purpose: it
// is the trace's, and it is not this.)
function stampNow() {
  const d = new Date();
  const q = (n) => String(n).padStart(2, "0");
  return (
    q(d.getDate()) + "-" + q(d.getMonth() + 1) + "-" + d.getFullYear() + " " +
    q(d.getHours()) + ":" + q(d.getMinutes()) + ":" + q(d.getSeconds())
  );
}

// ── main ───────────────────────────────────────────────────────────────────
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  // RUNG 0 — anything at all goes wrong: say nothing, exit 0. This wrapper is
  // the whole fail-quiet guarantee.
  try {
    run();
  } catch (_) {}
  process.exit(0);
});

function run() {
  let data;
  try {
    data = JSON.parse(raw || "{}");
  } catch (_) {
    return;
  }
  const event = String(data.hook_event_name || data.hookEventName || "");
  if (!event) return;

  if (String(cfg("code_graph") || "off").toLowerCase() !== "on") return;
  // `code_graph_hooks` is `off`, `on`, or `on,read` (D3/DE-J). `on` is every
  // hint that was on in 1.8.1 PLUS the Bash search (DE-C: a shell grep is a
  // Grep). The whole-file READ hint is the one that changes how an agent reads,
  // so it is armed on purpose and never by an upgrade.
  const mode = String(cfg("code_graph_hooks") || "on").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (!mode.length || mode[0] !== "on") return;
  const readHint = mode.includes("read");
  const runName = currentRun();
  if (!runName) return;

  const meta = readJson(path.join(GRAPH_DIR, "meta.json"));
  if (!meta || !meta.generation) return; // no graph — nothing to say and nothing to heal

  if (event === "SubagentStop") return onExecutorStop(data, runName);

  // The three DELIVERY events are for subagents only. `agent_id` is present in
  // a subagent payload and absent in a main-session one — the same positive
  // test orc-read-gate.js measured in W1. Never test for the absence of some
  // other key, which asserts nothing.
  if (data.agent_id == null) return;

  if (event === "SubagentStart") return onSubagentStart(data, runName, meta);
  if (event === "PreToolUse") {
    const tool = String(data.tool_name || "");
    if (tool === "Read") return readHint ? onWideRead(data, runName, meta) : undefined;
    return onSearch(data, runName, meta);
  }
  if (event === "PostToolUse") return onRead(data, runName, meta);
}

// ── E5b — an executor finished, so the map is behind ───────────────────────
// Synchronous, one lock, one deadline, no detached process and no queue. A
// second executor stopping while the first update holds the lock simply SKIPS:
// the next trigger retries, which is the at-least-once rule the lane steps and
// heal-on-read already follow.
function onExecutorStop(data, runName) {
  const agent = String(data.agent_type || data.agentType || "");
  if (!agent || !EXECUTOR.test(agent)) return;
  if (String(cfg("code_graph_auto_update") || "true").toLowerCase() === "false") return;

  const stamp = readJson(path.join(CLAUDE_DIR, "hooks", "orc-version.json"));
  const cli = stamp && stamp.cli;
  if (!cli || !fs.existsSync(cli)) return; // an install older than v1.8.0 — silent, not broken

  const deadline = Math.max(0, Number(cfg("code_graph_heal_ms")) || DEFAULT_DEADLINE_MS);
  const r = spawnSync(process.execPath, [cli, "graph", "update", "--if-enabled", "--json", "--dir", PROJECT_ROOT], {
    encoding: "utf8",
    timeout: Math.max(deadline, 10000),
    windowsHide: true,
  });
  let out = null;
  try {
    out = JSON.parse(r.stdout || "{}");
  } catch (_) {}
  // A timeout must not be read as "nothing changed" — it gets its own word.
  if (r.error && r.error.code === "ETIMEDOUT") return traceLine(runName, "GRAPH-UPDATE deadline", `agent=${clean(agent, 60)}`);
  if (!out || out.state === "off") return;
  bump(runName, "updates");
  const moved = (out.added || 0) + (out.changed || 0) + (out.deleted || 0);
  traceLine(
    runName,
    "GRAPH-UPDATE " + (out.state || "unavailable"),
    `by=hook agent=${clean(agent, 60)} moved=${moved} gen=${out.generation || "?"}${out.reason ? ` reason=${clean(out.reason, 40)}` : ""}`
  );
}

// ── E4a — one router line for a fresh subagent ─────────────────────────────
function onSubagentStart(data, runName, meta) {
  const agent = String(data.agent_type || data.agentType || "");
  if (agent && !DELIVER_TO.test(agent)) return;
  if (!bump(runName, "subagent_start", "start:" + (data.agent_id || agent))) return;
  // D3 — the "run ctx before a Grep" sentence is dropped when this run already
  // delivered a `--for-slice` block: the agent has the outside view in its
  // slice, and saying it again is the double payment this wave removes.
  const counters = readJson(seenFile(runName)) || {};
  const advice = counters.for_slice
    ? ""
    : ` Before a wide Grep for a symbol, run: orc graph ctx <name|file> --json .`;
  emit(
    "SubagentStart",
    `a code graph of this repository is indexed (generation ${meta.generation}, ${meta.files} files).` +
      advice +
      ` A card is a LOCATOR — read the range it names before you rely on behaviour.`
  );
}

// ── E4b — a search for a name the graph already knows ──────────────────────
// It reads names.json ONLY: a name lookup, no index parse, no resolution. This
// is what keeps the hook off the critical path of every Grep.
function onSearch(data, runName, meta) {
  const tool = String(data.tool_name || "");
  const input = data.tool_input || {};
  let pattern = "";
  if (tool === "Grep" || tool === "Glob") pattern = String(input.pattern || "");
  else if (tool === "Bash") {
    // DE-C — a shell search is a Grep. The command must START with one of the
    // seven search programs, and the word comes from its first QUOTED argument.
    const cmd = String(input.command || "");
    if (!BASH_SEARCH.test(cmd)) return;
    const q = FIRST_QUOTED.exec(cmd);
    if (!q) return;
    pattern = q[1] !== undefined ? q[1] : q[2];
  } else return;
  if (!pattern) return;

  // The longest plain identifier in the pattern. Regex metacharacters are
  // separators, not content, so a pattern like `get(User|Order)` yields `Order`.
  const words = (pattern.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).filter((w) => w.length >= MIN_TOKEN);
  if (!words.length) return;
  const names = readJson(path.join(GRAPH_DIR, "names.json"));
  if (!names || !names.names || names.generation !== meta.generation) return;
  const table = names.names;

  let hit = null;
  for (const w of words.sort((a, b) => b.length - a.length)) {
    if (Object.prototype.hasOwnProperty.call(table, w)) {
      hit = { word: w, rows: table[w] };
      break;
    }
  }
  if (!hit || !Array.isArray(hit.rows) || !hit.rows.length) return;
  // Once per run per name. A wave of greps for the same symbol pays once.
  if (!bump(runName, "injected", "name:" + hit.word)) return;

  const rows = hit.rows.slice(0, MAX_ROWS).map((r) => `${clean(r[0], 80)} (${clean(r[1], 20)}) ${clean(r[2], 160)}:${Number(r[3]) || 0}-${Number(r[4]) || 0} fan-in ${Number(r[5]) || 0}`);
  const body = emit(
    "PreToolUse",
    `"${clean(hit.word, 80)}" is defined at ${rows.join(" · ")}. ` +
      `Read those ranges, or run orc graph ctx ${clean(hit.word, 80)} --json for callers and callees. The search below still runs.`
  );
  // The search STILL RUNS, so a careful ladder saved nothing here; a careless
  // one saved the range read the anchor pointed at. Low 0, high one range.
  ledger(runName, "hint", body, { low: 0, high: HINT_RANGE_TOKENS, calls_low: 0, calls_high: 1 });
}

// ── D3 (v1.8.2 W3) — a whole-file Read of a WIDE file ──────────────────────
// OFF by default (`code_graph_hooks: on,read` arms it). The read STILL RUNS —
// this hook never blocks and never rewrites an input. `updatedInput` exists and
// this file deliberately never uses it: turning an agent's Read into a range
// read is the corruption the read ladder's first exception forbids, and the
// read gate stays the only layer allowed to touch a read.
//
// The point is the NEXT read. One line naming the file's six most important
// symbols and their ranges is what an agent needs to ask for a range instead of
// 2,000 lines the turn after.
function onWideRead(data, runName, meta) {
  const input = data.tool_input || {};
  if (input.offset !== undefined || input.limit !== undefined) return; // already a range read
  const abs = String(input.file_path || "");
  if (!abs) return;
  let rel;
  try {
    rel = path.relative(PROJECT_ROOT, abs).split(path.sep).join("/");
  } catch (_) {
    return;
  }
  if (!rel || rel.startsWith("..")) return;
  const wide = readJson(path.join(GRAPH_DIR, "wide.json"));
  if (!wide || !wide.files || wide.generation !== meta.generation) return;
  const rows = Object.prototype.hasOwnProperty.call(wide.files, rel) ? wide.files[rel] : null;
  if (!Array.isArray(rows) || !rows.length) return;
  if (!bump(runName, "injected", "wide:" + rel)) return;
  const body = emit(
    "PreToolUse",
    `${clean(rel, 160)} holds many symbols; the most reached are ` +
      rows.slice(0, WIDE_ROWS).map((r) => `${clean(r[0], 80)} ${Number(r[1]) || 0}-${Number(r[2]) || 0}`).join(" · ") +
      `. The read below still runs; a later read of this file can name a range.`
  );
  ledger(runName, "hint", body, { low: 0, high: HINT_RANGE_TOKENS, calls_low: 0, calls_high: 1 });
}

// ── E4c — a Read of a file the extractor did not fully see ─────────────────
// The ONLY case worth a line. A file the graph parsed whole needs no note, and
// a note on every read would be the noise that gets a hook switched off.
function onRead(data, runName, meta) {
  if (String(data.tool_name || "") !== "Read") return;
  const abs = String((data.tool_input || {}).file_path || "");
  if (!abs) return;
  let rel;
  try {
    rel = path.relative(PROJECT_ROOT, abs).split(path.sep).join("/");
  } catch (_) {
    return;
  }
  if (!rel || rel.startsWith("..")) return;

  const files = readJson(path.join(GRAPH_DIR, "files.json"));
  if (!files || !Object.prototype.hasOwnProperty.call(files, rel)) return;
  const entry = files[rel];
  let note = null;
  if (entry.skipped) note = `the graph did NOT index ${clean(rel, 160)} (${clean(entry.skipped, 40)}), so no card about it is complete`;
  else if (entry.coverage === "partial" && Array.isArray(entry.partial) && entry.partial.length) {
    note = `the graph read ${clean(rel, 160)} only as far as lines ${entry.partial.map((g) => `${Number(g[0]) || 0}-${Number(g[1]) || 0}`).join(",")} — a card about it may be missing what is there`;
  }
  if (!note) return;
  if (!bump(runName, "read_notes", "read:" + rel)) return;
  const body = emit("PostToolUse", `${note}. The source you just read is ground truth; no recorded gap is not proof of completeness.`);
  // PAID ONLY. A coverage note tells you what the card cannot show; it replaces
  // no read and it is never counted as a saving (K6).
  ledger(runName, "read-note", body, { low: 0, high: 0, calls_low: 0, calls_high: 0 });
}
