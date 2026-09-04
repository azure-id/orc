#!/usr/bin/env node
"use strict";

/**
 * ORC subagent line — a Claude Code `subagentStatusLine` command. (v1.4.0.)
 *
 * THE SECOND BOARD. Claude Code renders a custom row body for every subagent in
 * the agent panel, and hands this script the whole task list. That surface is
 * ORC's exact domain: one row per dispatched agent, live, while it runs.
 *
 * Wiring (installed by `orc init` ONLY if no subagentStatusLine already exists):
 *   settings.subagentStatusLine { type:"command", command:'node "<.claude>/hooks/orc-subagent-line.js"' }
 *
 * Output is ONE JSON LINE PER ROW: {"id": "<task id>", "content": "…"}.
 * Omitting an id keeps Claude Code's default row; an empty `content` hides it.
 * So a row this build cannot render is simply left alone — the default is a
 * better answer than a blank line.
 *
 * ── WHY THIS MATTERS MORE TO ORC THAN TO ANYONE ELSE ────────────────────────
 *
 * v1.2.0 established that Claude Code records NO token usage for a dispatched
 * subagent: `isSidechain` is never set, no sidechain message carries a usage
 * block, verified across every transcript on two machines. `orc usage report`
 * therefore reports `tokens: null` for every Claude row and says why, because
 * a fake measurement is worse than none.
 *
 * That remains true of the TRANSCRIPT. It is not true of this payload: each
 * task here carries `tokenCount`, and the resolved `model` and `effort`.
 *
 * So this hook does one thing beyond drawing: it WRITES WHAT IT SAW into
 * `.claude/orc/subagent-usage.json`, and `orc usage report` reads it. That is
 * the measurement v1.2.0 concluded was unavailable, and it arrives without a
 * single new read — Claude Code hands it to us.
 *
 * THE HONEST LIMIT, and it ships with the number rather than being discovered
 * later: this hook only sees a task WHILE IT IS IN THE AGENT PANEL. An agent
 * that started and finished between two renders is never seen at all, and a
 * count read at the last render before an agent finished is short by whatever
 * came after. So the record is a FLOOR, it says so in its own field
 * (`floor: true`), and `orc usage report` renders it as one. A floor reported
 * as a total is the same class of lie as a zero reported for an unknown.
 *
 * ── THE SAME WALL ───────────────────────────────────────────────────────────
 *
 * The CLI compiles, this hook renders. Same compiler, same IR, same renderers,
 * same glyph sets, same colour model, same gate ladder — a DIFFERENT BINDING
 * TABLE and a different config key, and that is the whole difference. There is
 * no second compiler and there will not be one.
 */

const SUB_SCHEMA = 1;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let d = {};
  try {
    d = JSON.parse(raw || "{}");
  } catch (_) {
    d = {};
  }
  const tasks = Array.isArray(d.tasks) ? d.tasks : [];

  // The usage record runs even when the custom board is OFF. It is not part of
  // the feature — it is a measurement Claude Code is handing us either way, and
  // throwing it away because a display setting is off would be the wrong trade
  // by a wide margin.
  recordUsage(d, tasks);

  const out = render(d, tasks);
  if (out) process.stdout.write(out);
});

// ── the record ─────────────────────────────────────────────────────────────
// Raw numbers only, never a computed word — the rule every other bridge in
// these hooks already follows. Keyed by task id so a re-render UPDATES rather
// than appends, and the highest count seen for a task wins: a count can only go
// up, so a lower reading is a stale one.
function recordUsage(d, tasks) {
  if (!tasks.length) return;
  try {
    const fs = require("fs");
    const path = require("path");
    const projectDir =
      (d.workspace && d.workspace.project_dir) || d.cwd || process.cwd();
    const orcDir = path.join(projectDir, ".claude", "orc");
    const file = path.join(orcDir, "subagent-usage.json");
    let led = null;
    try {
      led = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (_) {}
    const sid = String(d.session_id || d.sessionId || "");
    if (!led || led.session_id !== sid) led = { session_id: sid, started_at: Date.now(), tasks: {} };
    led.tasks = led.tasks || {};

    for (const task of tasks) {
      const id = String(task.id || "");
      if (!id) continue;
      const prev = led.tasks[id] || {};
      const tok = num(task.tokenCount);
      led.tasks[id] = {
        // The agent NAME is what `orc usage report` groups by, and it is the
        // one field that ties this record to ORC's own traces.
        name: task.name || task.type || prev.name || null,
        type: task.type || prev.type || null,
        // OBSERVED, not derived from the agent's name and not quoted back by
        // the agent itself. ORC's downgrade check has two readings — one from
        // the agent's NAME and one the agent REPORTS — and this is the third,
        // the only one nobody had to be trusted for.
        model: task.model || prev.model || null,
        effort: task.effort || prev.effort || null,
        context_window_size: num(task.contextWindowSize) != null ? num(task.contextWindowSize) : prev.context_window_size || null,
        // A count can only go up, so a lower reading is a stale one.
        tokens: tok == null ? (prev.tokens == null ? null : prev.tokens) : Math.max(tok, prev.tokens || 0),
        status: task.status || prev.status || null,
        started_at: task.startTime != null ? task.startTime : prev.started_at || null,
        seen_at: Date.now(),
        // THE FLOOR FLAG, stored rather than inferred. This hook only sees a
        // task while it is in the agent panel: an agent that started and
        // finished between two renders is never seen, and a count read at the
        // last render before it finished is short by whatever came after.
        floor: true,
      };
    }
    led.updated_at = Date.now();
    fs.mkdirSync(orcDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(led) + "\n");
  } catch (_) {
    // A record is a nicety. It never takes a row down with it.
  }
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ── the board ──────────────────────────────────────────────────────────────
// The SAME six-rung gate ladder as the main status line, for the same reason:
// this hook cannot refuse either. Every rung falls back to Claude Code's own
// default row, which is a real answer and a better one than a blank.
function render(d, tasks) {
  try {
    const fs = require("fs");
    const path = require("path");
    const projectDir =
      (d.workspace && d.workspace.project_dir) || d.cwd || process.cwd();
    const orcDir = path.join(projectDir, ".claude", "orc");

    // Rung 1. A hook cannot resolve config — it has no lane — so it reads the
    // raw key off the file, exactly as the status line already does.
    let on = false;
    try {
      const cfg = fs.readFileSync(path.join(projectDir, ".claude", "orc.config.yaml"), "utf8");
      on = /^[ \t]*subagent_line_custom:[ \t]*["']?on["']?[ \t]*\r?$/m.test(cfg);
    } catch (_) {}
    if (!on) return null;

    // Rung 2. The AUTHORED layout is never read here either.
    let prog = null;
    try {
      prog = JSON.parse(fs.readFileSync(path.join(orcDir, "subagent-compiled.json"), "utf8"));
    } catch (_) {}
    if (!prog || prog.schema !== SUB_SCHEMA) return null;

    // Rung 3. A layout compiled against a catalogue this build no longer ships.
    let lock = null;
    try {
      lock = JSON.parse(fs.readFileSync(path.join(orcDir, "subagent.lock.json"), "utf8"));
    } catch (_) {}
    let installed = null;
    try {
      installed = JSON.parse(fs.readFileSync(path.join(__dirname, "orc-version.json"), "utf8")).version;
    } catch (_) {}
    if (!lock || (installed && lock.orc_version !== installed)) return null;

    const engine = require("./orc-statusline-render.js");

    // Rung 4. A binding this build does not have is an install skew.
    for (const b of lock.bindings || []) {
      if (!engine.BINDINGS[b]) return null;
    }

    // Rung 5. A subagent row is ONE line by construction — Claude Code renders
    // one row per task — so the board's three-line shape does not apply and the
    // cheap guard is simply "one line, at most five things on it".
    if (!Array.isArray(prog.lines) || !prog.lines.length) return null;
    const line = prog.lines[0];
    if ((line.ops || []).filter((o) => o.op === "item").length > 5) return null;

    // Rung 6. One row per task, each rendered with THAT TASK bound.
    const now = Date.now();
    const rows = [];
    for (const task of tasks) {
      if (!task || !task.id) continue;
      try {
        const out = engine.render(
          { schema: 1, ansi: prog.ansi, formats: prog.formats, glyphsets: prog.glyphsets, statemaps: prog.statemaps, ramps: prog.ramps, lines: [line], plans: prog.plans },
          {
            payload: d,
            ledger: {},
            scan: {},
            derived: { verdict: null, reasons: [], version: installed },
            task,
            now,
            cols: Number(process.env.COLUMNS) || 0,
            env: process.env,
          }
        );
        // An EMPTY row hides the task's row entirely, which is almost never
        // what a user meant — so an empty render falls back to the default row
        // by omitting the id, rather than rendering a task as nothing.
        if (out.text && out.text.trim()) rows.push(JSON.stringify({ id: String(task.id), content: out.text.split("\n")[0] }));
      } catch (_) {}
    }
    return rows.length ? rows.join("\n") + "\n" : null;
  } catch (_) {
    return null;
  }
}
