"use strict";
// v2.0.0 T21 — `orc trace write --packet -`: the CLI holds the trace pen.
//
// The orchestrator already builds a PHASE PACKET at every phase close
// (`_shared/phases/trace.md`). This module renders that ONE packet into BOTH
// halves of the trace pair — the `.txt` line and its `.jsonl` row — so the two
// can never disagree about an event. W0 measured the Haiku writer at 92.4 %
// (whole phase blocks missing from the `.jsonl`); here parity is by
// construction. The writer agent `orc-trace-writer-haiku-4-5` stays as the
// FALLBACK: a lane dispatches it only when this command exits ≠ 0.
//
// The formats are the writer's, not new ones (`agents/orc-trace-writer-haiku-4-5.md`):
//   .txt    [<ts>] <actor padded to 8> <VERB> :: <tail>
//   .jsonl  {"ts","actor","phase","verb","tail", …verbatim extra fields}
//   NOTE    one line from `decisions`, actor `writer`, the last event's ts
// and so are the file rules: the first (`run_meta`) packet renames a
// hook-bootstrapped `run-<DDMMYY>-<HHMMSS>.txt` (a MOVE of the .txt and its
// sidecars, reusing the bootstrap stamp); a later packet finds its file through
// `log_dir/.current`, so the FINISH packet must go out BEFORE `.current` is
// deleted. Nothing is written unless the WHOLE packet validates. Appends only —
// one append per file per block; an earlier line is never rewritten.
//
// Exit codes: 0 written · 1 usage / unreadable input · 2 invalid packet
// (unknown verb, bad ts, parse error — nothing written) · 3 trace-file state
// (no `.current` on a later packet, a rename target in the way).

const fs = require("fs");
const path = require("path");

const TS_RE = /^\d{6} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;
const GENERIC_RE = /^run-(\d{6})-(\d{6})\.txt$/;
const CORE_FIELDS = ["ts", "actor", "verb", "tail"];

class PacketError extends Error {}

// ── the packet parser: JSON, or the small plain-YAML shape trace.md shows ──

function stripComment(s) {
  // A ` #` outside quotes starts a comment (YAML plain-scalar rule).
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "\\" && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s:{,\[]/.test(s[i - 1])) q = c;
    } else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

// Read one quoted scalar starting at s[i] (a quote). → [value, nextIndex]
function readQuoted(s, i) {
  const q = s[i];
  let out = "";
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (q === "'") {
      if (c === "'") {
        if (s[j + 1] === "'") {
          out += "'";
          j++;
          continue;
        }
        return [out, j + 1];
      }
      out += c;
      continue;
    }
    if (c === "\\") {
      const n = s[++j];
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "r") out += "\r";
      else if (n === "u") {
        out += String.fromCharCode(parseInt(s.slice(j + 1, j + 5), 16));
        j += 4;
      } else out += n === undefined ? "" : n;
      continue;
    }
    if (c === '"') return [out, j + 1];
    out += c;
  }
  throw new PacketError(`unterminated ${q === '"' ? "double" : "single"}-quoted string`);
}

function scalar(raw) {
  const s = stripComment(String(raw)).trim();
  if (s === "" || s === "~" || s === "null") return undefined;
  if (s[0] === '"' || s[0] === "'") return readQuoted(s, 0)[0];
  return s;
}

// Parse a flow map `{k: v, k: "v, with comma"}` (one level; a nested value is
// kept as its raw text). → object
function flowMap(s) {
  s = s.trim();
  if (s[0] !== "{") throw new PacketError(`expected a {…} map, got: ${s.slice(0, 40)}`);
  const out = {};
  let i = 1;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  for (;;) {
    ws();
    if (s[i] === "}") return out;
    if (i >= s.length) throw new PacketError("unterminated {…} map");
    let key;
    if (s[i] === '"' || s[i] === "'") [key, i] = readQuoted(s, i);
    else {
      const k0 = i;
      while (i < s.length && s[i] !== ":" && s[i] !== "," && s[i] !== "}") i++;
      key = s.slice(k0, i).trim();
    }
    ws();
    if (s[i] !== ":") throw new PacketError(`map key "${key}" has no value`);
    i++;
    ws();
    let val;
    if (s[i] === '"' || s[i] === "'") [val, i] = readQuoted(s, i);
    else if (s[i] === "{" || s[i] === "[") {
      const open = s[i], close = open === "{" ? "}" : "]";
      let depth = 0;
      const v0 = i;
      for (; i < s.length; i++) {
        if (s[i] === open) depth++;
        else if (s[i] === close && --depth === 0) {
          i++;
          break;
        }
      }
      val = s.slice(v0, i);
    } else {
      const v0 = i;
      while (i < s.length && s[i] !== "," && s[i] !== "}") i++;
      val = s.slice(v0, i).trim();
      if (val === "" || val === "~" || val === "null") val = undefined;
    }
    if (key) out[key] = val;
    ws();
    if (s[i] === ",") {
      i++;
      continue;
    }
    if (s[i] === "}") return out;
    throw new PacketError(`expected "," or "}" after "${key}"`);
  }
}

const indentOf = (l) => l.length - l.replace(/^ +/, "").length;
const KEY_RE = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*)|\s*)$/;

// Collect a flow map that may span lines, starting at lines[i] (text from col).
function takeFlow(lines, i, first) {
  let buf = first;
  const bal = (t) => (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
  while (bal(stripComment(buf)) > 0 && i + 1 < lines.length) buf += " " + lines[++i].trim();
  return [flowMap(stripComment(buf)), i];
}

function blockScalar(lines, i, style, parentIndent) {
  const body = [];
  let j = i + 1;
  for (; j < lines.length; j++) {
    const l = lines[j];
    if (l.trim() !== "" && indentOf(l) <= parentIndent) break;
    body.push(l);
  }
  while (body.length && body[body.length - 1].trim() === "") body.pop();
  const ind = Math.min(...body.filter((l) => l.trim()).map(indentOf).concat([Infinity]));
  const rows = body.map((l) => (l.trim() === "" ? "" : l.slice(ind === Infinity ? 0 : ind)));
  let text;
  if (style[0] === "|") text = rows.join("\n");
  else {
    text = "";
    for (const r of rows) text += r === "" ? "\n" : (text && !text.endsWith("\n") ? " " : "") + r;
  }
  return [text, j - 1];
}

function parseYaml(text) {
  const lines = text.split("\n");
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim()[0] === "#") continue;
    if (indentOf(line) !== 0) throw new PacketError(`line ${i + 1}: unexpected indentation`);
    const m = KEY_RE.exec(line);
    if (!m) throw new PacketError(`line ${i + 1}: expected "key: value"`);
    const key = m[1];
    const rest = stripComment(m[2] || "").trim();
    if (/^[>|][+-]?$/.test(rest)) {
      [out[key], i] = blockScalar(lines, i, rest, 0);
      continue;
    }
    if (rest[0] === "{") {
      [out[key], i] = takeFlow(lines, i, rest);
      continue;
    }
    if (rest !== "") {
      out[key] = scalar(m[2]);
      continue;
    }
    // A nested block: a sequence (`- …`) or a one-level map.
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === "" || lines[j].trim()[0] === "#")) j++;
    if (j >= lines.length || (indentOf(lines[j]) === 0 && !/^- /.test(lines[j]))) {
      out[key] = undefined;
      continue;
    }
    if (/^\s*- /.test(lines[j]) || /^\s*-$/.test(lines[j])) {
      const seq = [];
      let k = j;
      for (; k < lines.length; k++) {
        const l = lines[k];
        if (l.trim() === "" || l.trim()[0] === "#") continue;
        if (indentOf(l) === 0 && !/^- /.test(l)) break;
        const d = /^(\s*)- ?(.*)$/.exec(l);
        if (!d) throw new PacketError(`line ${k + 1}: expected a "- " item`);
        const itemIndent = d[1].length;
        const body = d[2].trim();
        if (body[0] === "{") {
          let v;
          [v, k] = takeFlow(lines, k, body);
          seq.push(v);
          continue;
        }
        const km = KEY_RE.exec(body);
        if (!km) {
          seq.push(scalar(body));
          continue;
        }
        // A block-map item: this line's pair plus every deeper-indented pair.
        const item = {};
        const put = (kk, vv, at) => {
          const r = stripComment(vv || "").trim();
          if (/^[>|][+-]?$/.test(r)) {
            let t;
            [t, k] = blockScalar(lines, at, r, itemIndent + 2);
            item[kk] = t;
          } else item[kk] = scalar(vv || "");
        };
        put(km[1], km[2], k);
        while (k + 1 < lines.length) {
          const n = lines[k + 1];
          if (n.trim() === "") {
            k++;
            continue;
          }
          if (indentOf(n) <= itemIndent) break;
          const nm = KEY_RE.exec(n.trim());
          if (!nm) throw new PacketError(`line ${k + 2}: expected "key: value" inside an item`);
          k++;
          put(nm[1], nm[2], k);
        }
        seq.push(item);
      }
      out[key] = seq;
      i = k - 1;
      continue;
    }
    const map = {};
    let k = j;
    for (; k < lines.length; k++) {
      const l = lines[k];
      if (l.trim() === "" || l.trim()[0] === "#") continue;
      if (indentOf(l) === 0) break;
      const nm = KEY_RE.exec(l.trim());
      if (!nm) throw new PacketError(`line ${k + 1}: expected "key: value" under ${key}`);
      map[nm[1]] = scalar(nm[2] || "");
    }
    out[key] = map;
    i = k - 1;
  }
  return out;
}

function parsePacket(text) {
  const t = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!t.trim()) throw new PacketError("the packet is empty");
  if (t.trim()[0] === "{") {
    try {
      return JSON.parse(t);
    } catch (e) {
      throw new PacketError(`the packet is not valid JSON: ${e.message}`);
    }
  }
  return parseYaml(t);
}

// ── validation + rendering (pure: the golden pair tests this half) ──

const oneLine = (v) =>
  String(v)
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");

function kebab(slug) {
  return String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 32)
    .replace(/-+$/, "");
}

// → { phase, run_meta, events: [{ts, actor, verb, tail, extra}], note } or throws.
function validatePacket(pk, traceVerbs) {
  if (!pk || typeof pk !== "object" || Array.isArray(pk)) throw new PacketError("the packet is not a map");
  const errs = [];
  const events = Array.isArray(pk.events) ? pk.events : [];
  if (pk.events !== undefined && !Array.isArray(pk.events)) errs.push("events must be a list");
  if (!events.length) errs.push("the packet has no events — zero new trace lines is a protocol violation");
  const out = [];
  events.forEach((e, n) => {
    const at = `events[${n}]`;
    if (!e || typeof e !== "object") return errs.push(`${at} is not a {ts, verb, tail} map`);
    const verb = oneLine(e.verb == null ? "" : e.verb);
    const word = verb.split(/\s+/)[0];
    if (!word) return errs.push(`${at} has no verb`);
    const d = Object.prototype.hasOwnProperty.call(traceVerbs, word) ? traceVerbs[word] : null;
    if (!d) return errs.push(`${at}: unknown verb ${word} — not in the CLOSED set (trace-verbs.md)`);
    if (d.emitter === "hook") return errs.push(`${at}: ${word} is written by the hook, never by a packet`);
    const ts = e.ts == null ? "" : String(e.ts).trim();
    if (!TS_RE.test(ts)) errs.push(`${at} (${word}): ts "${ts}" is not DDMMYY HH:MM:SS.mmm — the event's REAL time, never "now"`);
    const actor = e.actor == null || e.actor === "" ? "orc" : String(e.actor).trim();
    if (/\s/.test(actor)) errs.push(`${at} (${word}): actor "${actor}" has a space`);
    const extra = {};
    for (const [k, v] of Object.entries(e)) {
      if (CORE_FIELDS.includes(k) || k === "phase" || v === undefined) continue;
      extra[k] = typeof v === "string" && /^-?\d+(?:\.\d+)?$/.test(v) ? Number(v) : v;
    }
    out.push({ ts, actor, verb, tail: e.tail == null ? undefined : oneLine(e.tail), extra });
  });
  const rm = pk.run_meta;
  if (rm !== undefined && rm !== null) {
    if (typeof rm !== "object") errs.push("run_meta must be a map");
    else {
      if (!rm.lane || !/^[a-z0-9]+$/.test(String(rm.lane))) errs.push(`run_meta.lane "${rm.lane || ""}" is not a lane token`);
      if (!kebab(rm.slug)) errs.push("run_meta.slug is missing");
    }
  }
  if (errs.length) {
    const err = new PacketError(errs.join("; "));
    err.errors = errs;
    throw err;
  }
  const decisions = pk.decisions == null ? "" : oneLine(pk.decisions);
  return {
    phase: pk.phase == null ? undefined : oneLine(pk.phase),
    run_meta: rm || null,
    events: out,
    note: decisions ? { ts: out[out.length - 1].ts, actor: "writer", verb: "NOTE", tail: decisions, extra: {} } : null,
  };
}

// → { txt: [lines], jsonl: [lines] } — SAME order and SAME count.
function renderBlock(v) {
  const all = v.events.concat(v.note ? [v.note] : []);
  const txt = [];
  const jsonl = [];
  for (const e of all) {
    txt.push(`[${e.ts}] ${e.actor.padEnd(8)} ${e.verb}` + (e.tail ? ` :: ${e.tail}` : ""));
    const row = { ts: e.ts, actor: e.actor };
    if (v.phase !== undefined) row.phase = v.phase;
    row.verb = e.verb;
    if (e.tail !== undefined) row.tail = e.tail;
    jsonl.push(JSON.stringify(Object.assign(row, e.extra)));
  }
  return { txt, jsonl };
}

// ── the file half ──

const countLines = (f) => {
  try {
    const t = fs.readFileSync(f, "utf8");
    return (t.match(/\n/g) || []).length + (t && !t.endsWith("\n") ? 1 : 0);
  } catch (_) {
    return 0;
  }
};
const exists = (f) => {
  try {
    fs.statSync(f);
    return true;
  } catch (_) {
    return false;
  }
};

// One append for the whole block. A file whose last line has no newline gets
// one first, so a block never glues onto an earlier line (never rewrites it).
function appendBlock(file, rows) {
  if (!rows.length) return;
  let lead = "";
  try {
    const st = fs.statSync(file);
    if (st.size > 0) {
      const fd = fs.openSync(file, "r");
      const b = Buffer.alloc(1);
      fs.readSync(fd, b, 0, 1, st.size - 1);
      fs.closeSync(fd);
      if (b[0] !== 0x0a) lead = "\n";
    }
  } catch (_) {}
  fs.appendFileSync(file, lead + rows.join("\n") + "\n");
}

class StateError extends Error {}

// Decide the file against DISK (the writer's rename rule), then append.
function writePacket(claudeDir, logDir, v, block) {
  const root = path.dirname(claudeDir);
  fs.mkdirSync(logDir, { recursive: true });
  const ptrFile = path.join(logDir, ".current");
  let ptr = null;
  try {
    ptr = fs.readFileSync(ptrFile, "utf8").trim() || null;
  } catch (_) {}
  let target;
  let renamed = false;
  let repointed = false;
  if (v.run_meta) {
    const rm = v.run_meta;
    const given = rm.trace_path ? (path.isAbsolute(rm.trace_path) ? rm.trace_path : path.join(root, rm.trace_path)) : null;
    const g = ptr && GENERIC_RE.exec(ptr);
    if (g && exists(path.join(logDir, ptr)) && (!given || path.basename(given) !== ptr)) {
      // The clobber signature: a rich packet name beside a generic bootstrap
      // pointer. MOVE the bootstrap file and its sidecars; reuse its stamp.
      const name = `run-${rm.lane}-${kebab(rm.slug)}-${g[1]}-${g[2]}.txt`;
      const dest = path.join(logDir, name);
      if (exists(dest)) {
        if (fs.statSync(dest).size > 0) throw new StateError(`rename target ${name} already exists and is not empty`);
        fs.unlinkSync(dest);
      }
      for (const sfx of ["", ".pending.json", ".jsonl"]) {
        const from = path.join(logDir, ptr + sfx);
        if (exists(from)) fs.renameSync(from, path.join(logDir, name + sfx));
      }
      fs.writeFileSync(ptrFile, name + "\n");
      target = dest;
      renamed = true;
    } else if (given) {
      target = given;
    } else if (ptr) {
      target = path.join(logDir, ptr);
    } else throw new StateError("run_meta has no trace_path and log_dir/.current is missing — nothing names the trace file");
    // A pointer naming some OTHER existing file is repointed after the write
    // (the file then exists); a missing pointer is never invented here.
    if (ptr && !renamed && path.basename(target) !== ptr && path.dirname(path.resolve(target)) === path.resolve(logDir)) repointed = true;
  } else {
    if (!ptr)
      throw new StateError("log_dir/.current is missing and this packet has no run_meta — the FINISH packet must be written BEFORE .current is deleted");
    target = path.join(logDir, ptr);
  }
  const jsonl = target + ".jsonl";
  const before = [countLines(target), countLines(jsonl)];
  appendBlock(target, block.txt);
  appendBlock(jsonl, block.jsonl);
  if (repointed) fs.writeFileSync(ptrFile, path.basename(target) + "\n");
  return {
    trace_path: path.relative(root, target).split(path.sep).join("/"),
    lines_written: countLines(target) - before[0],
    jsonl_written: countLines(jsonl) - before[1],
    renamed,
    repointed,
  };
}

const USAGE = "usage: orc trace write --packet -|<file> [--json]   (reads one phase packet; writes the .txt + .jsonl pair)";

// deps: { flag, positionals, emitJson, wantsJson, resolveClaudeDir, resolveLogDir, TRACE_VERBS }
function traceCmd(deps) {
  const pos = deps.positionals();
  const json = deps.wantsJson();
  const fail = (code, state, reason, extra) => {
    if (json) return deps.emitJson(Object.assign({ ok: false, state, reason }, extra || {}), code);
    console.error(`trace write: ${reason}`);
    process.exit(code);
  };
  if (pos[1] !== "write") return fail(1, "usage", USAGE);
  const src = deps.flag("--packet");
  if (src === undefined) return fail(1, "usage", USAGE);
  let text;
  try {
    text = src === true || src === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(String(src)), "utf8");
  } catch (e) {
    return fail(1, "unreadable", `cannot read the packet (${e.code || e.message})`);
  }
  let v;
  try {
    v = validatePacket(parsePacket(text), deps.TRACE_VERBS);
  } catch (e) {
    if (!(e instanceof PacketError)) throw e;
    return fail(2, "invalid", `${e.message} — nothing written`, { errors: e.errors || [e.message] });
  }
  const claudeDir = deps.resolveClaudeDir();
  let r;
  try {
    r = writePacket(claudeDir, deps.resolveLogDir(claudeDir), v, renderBlock(v));
  } catch (e) {
    if (!(e instanceof StateError)) return fail(3, "error", `${e.message} — nothing written`);
    return fail(3, "trace-state", `${e.message} — nothing written`);
  }
  if (json) return deps.emitJson(Object.assign({ ok: true }, r), 0);
  console.log(
    `trace write: +${r.lines_written} lines, +${r.jsonl_written} jsonl → ${r.trace_path}` +
      (r.renamed ? " (renamed the bootstrap file)" : "") +
      (r.repointed ? " (.current repointed)" : "")
  );
}

module.exports = { parsePacket, validatePacket, renderBlock, writePacket, traceCmd, kebab, PacketError, StateError, USAGE };
