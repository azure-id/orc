#!/usr/bin/env node
"use strict";

/**
 * ORC read gate — a Claude Code PreToolUse hook on `Read`.
 *
 * ORC's read discipline (`skills/_shared/read-ladder.md`, orc-doc hard rule 0,
 * orc-quick line 21) says the ORCHESTRATOR reads to LOCATE and dispatches to
 * UNDERSTAND. That rule was advisory prose in three places and enforced in
 * none. This hook is the one layer that can refuse.
 *
 * It is DELIBERATELY the narrowest useful gate. Everything below is a state in
 * which it says nothing at all, and every one of them is intentional:
 *
 *   - a SUBAGENT is reading            (measured: W1 — see `agent_id` below)
 *   - `read_gate` is `off`             (the default)
 *   - no ORC run is open
 *   - the read is already targeted     (`offset` / `limit` — ladder step 3)
 *   - the file is under the threshold
 *   - the file is output a gate parses (ladder exception 2)
 *   - `read_gate` is `warn`            (it says so, and still allows)
 *
 * THE SUBAGENT RULE IS LOAD-BEARING, AND IT IS MEASURED, NOT ASSUMED.
 * `PreToolUse` DOES fire inside a dispatched subagent. `session_id` and
 * `transcript_path` are IDENTICAL in both contexts — a gate written against
 * either would treat an executor's read as the orchestrator's and block the
 * full read that must precede an `Edit`, whose `old_string` cannot be
 * reconstructed from an outline. That is a file-corruption path. The ONLY
 * discriminator is `agent_id`, present in a subagent payload and absent in a
 * main-session one. Test for its PRESENCE — never for the absence of some
 * other key, which is not a positive assertion.
 *
 * Wiring (installed by `orc init` into .claude/settings.json):
 *   hooks.PreToolUse[] { matcher: "Read", hooks:[{ type:"command",
 *     command: 'node "<.claude>/hooks/orc-read-gate.js"' }] }
 *
 * Contract: read PreToolUse JSON from stdin. Exit 0 = allow. Exit 2 = block
 * the tool call and show stderr to Claude, which relays it to the user.
 *
 * FAIL-OPEN, ALWAYS. A read gate that throws and blocks a read has broken the
 * tool. Every failure path here exits 0, and the ones we can name RECORD
 * themselves so `orc doctor` can turn them into a sentence — but only while
 * the feature is armed. Precedent: orc-statusline.js is fail-silent, and the
 * v1.3.0 statusline gate ladder is all fallbacks, each of which records itself.
 */

const fs = require("fs");
const path = require("path");

// .claude/hooks/orc-read-gate.js → CLAUDE_DIR = .. → PROJECT_ROOT = ../..
const CLAUDE_DIR = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(CLAUDE_DIR, "..");

// A run whose trace has been idle this long has ENDED. Same window as
// orc-trace.js — one idea of "a run is open", not two.
const STALE_MS = 6 * 60 * 60 * 1000;

// Default line threshold. MEASURED, not copied.
//
// The number in the source material this pattern came from is 350, derived
// from a 10-30s delegation round trip. ORC's is nothing like that: a Task
// dispatch measured p50 76s / p90 188s (n=125), and one real read-only
// dispatch cost 13,276 tokens to read a four-line file and return three words.
// At the measured 55.2 chars/line across 316 main-session full reads, that
// floor is ~962 lines; at the median file's 51.9 chars/line it is ~1024.
// Break-even is therefore ~1000 lines, and BELOW it delegating a read costs
// more than the read does. Copying 350 would delegate work whose overhead
// exceeds its saving.
const DEFAULT_THRESHOLD = 1000;

// Output a gate PARSES is read whole — read-ladder exception 2. The smoke
// gate, the TDD gate, the verifier and /orc-quick's build loop all decide red
// vs green from these exact bytes, and a truncated red build reads GREEN.
// That is worse than any token saving, so this list is deliberately generous:
// a false ALLOW costs tokens, a false BLOCK costs correctness.
const GATE_PARSED =
  /(\.(log|tap|xml|lcov|junit)$|(^|[\\/])(coverage|test-results|npm-debug|yarn-error)([\\/]|$)|\.jsonl$)/i;

// ---------------------------------------------------------------------------
// Config — tolerant top-level YAML scalar read, matching orc-trace.js exactly.
// The repo is zero-dep; there is no YAML parser.
// ---------------------------------------------------------------------------
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

function logDir() {
  const rel = readConfigScalar("log_dir") || ".claude/orc/logs";
  return path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
}

// Is an ORC run open? `.current` names the run; the trace file it names must
// exist and be fresh. A pointer naming a file that does not exist is
// indistinguishable from a dangling one (v0.34.2), so honour a pointer whose
// OWN mtime is fresh too — neither half depends on the other.
function runIsOpen() {
  const dir = logDir();
  let name;
  try {
    name = fs.readFileSync(path.join(dir, ".current"), "utf8").trim();
  } catch (_) {
    return false;
  }
  if (!name) return false;
  const now = Date.now();
  try {
    if (now - fs.statSync(path.join(dir, name)).mtimeMs < STALE_MS) return true;
  } catch (_) {
    /* trace file not created yet — fall through to the pointer's own mtime */
  }
  try {
    return now - fs.statSync(path.join(dir, ".current")).mtimeMs < STALE_MS;
  } catch (_) {
    return false;
  }
}

// D10 — A GATE DECISION THAT LEAVES NO LINE CANNOT BE COUNTED. Same rule as a
// resume and a demotion, and it is CHEAP HERE FOR A STRUCTURAL REASON: the gate
// only ever acts while a run is open (rung 2), so a trace to write into is
// guaranteed to exist by the time we get here. There is no "a read happened
// with no run" case to handle, because that read was already allowed.
//
// Hook-composed, like every other line orc-trace.js writes. Best effort: a line
// that cannot be written must never take the gate down with it.
function traceLine(verb, tail) {
  try {
    const dir = logDir();
    const name = fs.readFileSync(path.join(dir, ".current"), "utf8").trim();
    if (!name) return;
    const d = new Date();
    const p = (n, w) => String(n).padStart(w || 2, "0");
    const stamp =
      p(d.getDate()) + p(d.getMonth() + 1) + p(d.getFullYear() % 100) + " " +
      p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) +
      "." + p(d.getMilliseconds(), 3);
    fs.appendFileSync(
      path.join(dir, name),
      `[${stamp}] ${"hook".padEnd(8)} ${verb}` + (tail ? ` :: ${tail}` : "") + "\n"
    );
  } catch (_) {}
}

// A fallback RECORDS ITSELF (v1.3.0's rule). Best effort by construction: a
// record that cannot be written must never take the gate down with it.
function recordFallback(rung, detail) {
  try {
    const dir = path.join(CLAUDE_DIR, "orc");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "read-gate-fallback.json"),
      JSON.stringify({ rung, detail: String(detail || "").slice(0, 300), at: Date.now() })
    );
  } catch (_) {}
}

// Count lines without holding the whole file in memory twice. Returns null when
// the file cannot be measured — and null NEVER blocks (unknown is not "big").
function countLines(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return null;
    // A file that cannot possibly reach the threshold is not worth reading.
    // 1 byte/line is the floor, so bytes < threshold ⇒ lines < threshold.
    const buf = fs.readFileSync(file);
    let n = 1;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++;
    return n;
  } catch (_) {
    return null;
  }
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  // RUNG 0 — anything at all goes wrong: ALLOW. This wrapper is the whole
  // fail-open guarantee; every `return` below it is an allow.
  try {
    gate();
  } catch (e) {
    recordFallback("threw", e && e.message);
    process.exit(0);
  }
  process.exit(0);
});

function gate() {
  let data;
  try {
    data = JSON.parse(raw || "{}");
  } catch (e) {
    recordFallback("unparseable-payload", e && e.message);
    return; // allow
  }

  if (data.tool_name !== "Read") return;

  // RUNG 0.5 — a SUBAGENT is reading. ALLOW, always, and this check comes
  // before every other one. See the header: this is what keeps the gate off
  // the pre-`Edit` full read that an executor must perform, and it is why the
  // gate never needs to know a slice's declared_files.
  if (data.agent_id != null) return;

  const mode = String(readConfigScalar("read_gate") || "off").toLowerCase();
  if (mode !== "warn" && mode !== "block") return; // `off` (the default), or garbage

  // RUNG 2 — no ORC run is open. The gate constrains ORC's own reading; it is
  // not a policy on the user's session. A read outside a run is not ORC's to
  // refuse, and the gate says nothing. This is an HONEST LIMIT, not an
  // oversight: it is stated in templates/hooks/README.md and in `orc doctor`.
  if (!runIsOpen()) return;

  const input = data.tool_input || {};
  const file = String(input.file_path || "");
  if (!file) return;

  // RUNG 3 — already a targeted read. This IS ladder step 3; it is the
  // behaviour the gate exists to encourage, so it can never be refused.
  if (input.offset != null || input.limit != null) return;

  // RUNG 5 — output a gate parses. Exception 2 is not a preference.
  if (GATE_PARSED.test(file)) return;

  let threshold = parseInt(readConfigScalar("read_gate_max_lines"), 10);
  if (!Number.isFinite(threshold) || threshold < 1) threshold = DEFAULT_THRESHOLD;

  const lines = countLines(file);
  if (lines == null) {
    // Unmeasurable — a directory, a missing file, a permissions error, a binary
    // the Read tool will handle its own way. UNKNOWN IS NOT BIG.
    recordFallback("unmeasurable", file);
    return;
  }
  if (lines < threshold) return; // RUNG 4 — under the threshold

  // RUNG 7 — `warn`: allow, and say so. `systemMessage` is shown to the user
  // and is NOT added to model context, so the warning itself costs no tokens.
  if (mode === "warn") {
    traceLine("READ-GATE warn", `lines=${lines} max=${threshold} file=${path.basename(file)}`);
    try {
      process.stdout.write(
        JSON.stringify({
          systemMessage:
            `📖 ORC read gate — ${path.basename(file)} is ${lines} lines ` +
            `(threshold ${threshold}). Allowed: read_gate is 'warn'.\n` +
            `   Cheaper: Read with offset/limit, or dispatch an agent to read it and report back.`,
        })
      );
    } catch (_) {}
    return;
  }

  // RUNG 8 — block, and NAME THE ALTERNATIVE. A block that only refuses
  // teaches people to switch it off.
  traceLine("READ-GATE block", `lines=${lines} max=${threshold} file=${path.basename(file)}`);
  process.stderr.write(
    `\n⛔ ORC read gate — ${path.basename(file)} is ${lines} lines, over the ` +
      `${threshold}-line threshold.\n` +
      `   Reading it whole spends the orchestrator's context on material a ` +
      `worker could summarise.\n\n` +
      `   Do one of these instead:\n` +
      `     • Read with offset/limit — the ladder's targeted read, and always allowed.\n` +
      `     • Grep for what you actually need, then read that range.\n` +
      `     • Dispatch an agent to read it and report back (its reads are never gated).\n\n` +
      `   If you genuinely need the whole file here: set read_gate to warn or off\n` +
      `     orc config set read_gate warn\n` +
      `   The gate is silent outside an ORC run, on targeted reads, on files a\n` +
      `   gate parses, and on every read a subagent makes.\n`
  );
  process.exit(2);
}
