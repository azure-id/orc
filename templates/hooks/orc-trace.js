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
 * Attribution hardening (v0.32.0) — three bugs a real 8-task run proved:
 *   1. DOUBLE RETURN. A stop that carried no `agent_type` FIFO-popped another
 *      agent's pending record; the REAL `agent_type` stop then found no record
 *      and wrote a second, desc-less RETURN for the same agent. Now: an
 *      `agent_type` stop with NO matching record while OTHER records are still
 *      in flight is a DUPLICATE (its slot was already consumed) and is dropped.
 *      An empty sidecar is NOT a duplicate signal — it still degrades to a bare
 *      RETURN, and the `returns >= spawns` guard covers the empty-list repeat.
 *   2. MISSING RETURN. The blind FIFO pop above starved the agent whose record
 *      was stolen. Now an `agent_type`-less stop only CONSUMES a record when
 *      exactly ONE is in flight; with ≥2 it writes `RETURN ~agent :: unattributed`
 *      WITHOUT consuming, so the real `agent_type` stop can still claim its own.
 *   3. RETRO SELF-POLLUTION. `/orc-retro` dispatches `orc-retro-*`, which matched
 *      the `/^orc/` gate — the trace miner was generating trace data. `orc-retro`
 *      is now on an explicit ignore-list: never bootstraps, never SPAWN/RETURN.
 *
 * Deterministic phase inference (v0.32.0): ORC agent NAMES encode their role, so
 * the hook can segment a run into phases with zero model cooperation. When a
 * SPAWN's role family differs from the previous SPAWN's, the hook writes one
 * extra line first — `PHASE-EDGE <role-family> :: first=<agent>` — so even a run
 * where every narration dispatch was forgotten still reads as
 * planning → execution → review → verify. `/orc-retro` reads these to compute
 * NARRATION COVERAGE (phase edges with a trace-writer SPAWN between them).
 *
 * Rich run filenames (v0.32.0): the canonical trace name is
 * `run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt`, written by the orchestrating lane at
 * run start. The hook still bootstraps its own generic `run-<DDMMYY>-<HHMMSS>.txt`
 * when the pointer is missing; the first `orc-trace-writer-haiku-4-5` dispatch
 * RENAMES that bootstrap file (+ sidecars) and rewrites `.current`. The hook is
 * name-agnostic (rotation/STALE logic is pointer-based) and holds no open
 * handles, so a rename between two hook events is safe.
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

// Lanes whose agents must NEVER be traced. `/orc-retro` MINES the traces — its
// hard rule 4 says it writes no trace of its own, so an `orc-retro-*` dispatch
// must not bootstrap a run or emit SPAWN/RETURN (that would pollute the very
// data it reads). Matched on the agent name, before every other gate.
const IGNORED_AGENTS = /^orc-retro\b/i;

// Role families for deterministic phase inference. ORC agent names encode the
// role, so a change of family between consecutive SPAWNs IS a phase edge.
// A name that maps to null never opens an edge (and never closes the previous
// one) — including the trace writer, whose whole job is narration.
function roleFamily(agent) {
  const a = String(agent).toLowerCase();
  if (/trace-writer/.test(a)) return null;
  if (/analyst|analyze|scout/.test(a)) return "analysis";
  if (/planner/.test(a)) return "planning";
  if (/executor/.test(a)) return "execution";
  if (/reviewer/.test(a)) return "review";
  if (/verifier/.test(a)) return "verify";
  if (/test-author/.test(a)) return "testgen";
  if (/advisor|judge/.test(a)) return "ultra-gate";
  return null;
}

// The role family of the LAST classified SPAWN in a trace. Derived from the file
// itself so phase inference needs no extra state file (and survives a rename).
function lastSpawnRole(dir, file) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, file), "utf8");
  } catch (_) {
    return null; // new/unreadable trace → the next SPAWN opens the first edge
  }
  let last = null;
  for (const m of text.matchAll(/\] hook\s+SPAWN (\S+)/g)) {
    const fam = roleFamily(m[1]);
    if (fam) last = fam;
  }
  return last;
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
    // `RETURN ~agent :: unattributed` claims no pending record (the ≥2-in-flight
    // restraint above), so it must not count toward the balance either — if it
    // did, it would starve the very RETURN it deliberately declined to steal.
    const all = (text.match(/\] hook\s+RETURN/g) || []).length;
    const loose = (text.match(/\] hook\s+RETURN ~agent :: unattributed/g) || []).length;
    return { idleMs: Date.now() - st.mtimeMs, spawns, returns: all - loose };
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
      // …and the trace miner is exempt from its own instrument.
      if (IGNORED_AGENTS.test(String(agent))) return;
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
      // Deterministic phase inference: a change of role family (or the first
      // classified dispatch of the run) opens a phase edge. Written BEFORE the
      // SPAWN so the edge reads as the header of the phase it opens.
      const fam = roleFamily(agent);
      if (fam && fam !== lastSpawnRole(dir, current))
        appendLine(dir, current, "hook", `PHASE-EDGE ${fam}`, `first=${agent}`);
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
      // The trace miner never returns into a trace either (hard rule 4).
      if (agentType && IGNORED_AGENTS.test(agentType)) return;

      const pend = readPending(dir, current);
      let rec = null;
      let name;
      let approx = false;
      let unattributed = false;
      if (agentType) {
        // Match the OLDEST pending record for this agent type (FIFO within name).
        const idx = pend.findIndex((p) => p && p.agent === agentType);
        if (idx >= 0) rec = pend.splice(idx, 1)[0];
        // DUPLICATE STOP: no record for this agent, but others are still in
        // flight → this agent's slot was already consumed (the classic
        // approximate-pop-then-real-stop double fire). Drop it rather than
        // write a second, desc-less RETURN for the same agent. An EMPTY sidecar
        // is a lost/corrupt sidecar, not a duplicate — that case still degrades
        // to a bare RETURN (and a genuine repeat is caught by returns>=spawns).
        else if (pend.length) return;
        name = agentType;
      } else if (pend.length === 1) {
        // Older Claude Code: no agent_type, and exactly ONE agent in flight —
        // the FIFO pop is unambiguous. Mark it approximate (`~`) all the same.
        rec = pend.shift();
        name = rec.agent;
        approx = true;
      } else if (pend.length > 1) {
        // ≥2 in flight and no agent_type: a blind FIFO pop would hand this stop
        // another agent's record and STARVE that agent's real RETURN. Record
        // that something finished, but consume NOTHING.
        name = "agent";
        approx = true;
        unattributed = true;
      } else {
        // No pending records at all (missing/corrupt sidecar) — bare RETURN.
        name = "agent";
        approx = true;
      }

      const parts = [];
      if (unattributed) parts.push("unattributed");
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
