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

// The head shape of a verb, read from its grammar in TRACE_VERBS (the first form):
// `sep` = the grammar has a ` :: ` between head and tail; `args` = it names head
// arguments after the verb (a `[…]` part is optional and does not count).
const TAIL_ALIASES = ["note", "detail", "text"];
function headShape(grammar) {
  const form = String(grammar || "").split(" · ")[0];
  const sep = form.includes(" :: ");
  const head = (sep ? form.slice(0, form.indexOf(" :: ")) : form).replace(/\[[^\]]*\]/g, " ");
  const rest = head.replace(/<[^>]*>/g, "<x>").trim().split(/\s+/).slice(1).filter(Boolean);
  return { sep, args: rest.length > 0 };
}

// Put ONE event into the grammar's shape, or return an error. A lane may hand the
// detail over as `note`/`detail`/`text`, put ` :: ` inside `verb`, start the tail
// with `::`, or give a no-`::` verb only a tail — each is repaired, never guessed.
function shapeEvent(e, word, d) {
  let verb = oneLine(e.verb == null ? "" : e.verb);
  let tail = e.tail;
  let alias = null;
  if (tail == null || tail === "") for (const k of TAIL_ALIASES) if (e[k] != null && e[k] !== "") { tail = e[k]; alias = k; break; }
  tail = tail == null ? "" : oneLine(tail);
  const cut = verb.indexOf("::");
  if (cut >= 0) { tail = [verb.slice(cut + 2).trim(), tail].filter(Boolean).join(" · "); verb = verb.slice(0, cut).trim(); }
  tail = tail.replace(/^(?:::\s*)+/, "").trim();
  const shape = d.grammar ? headShape(d.grammar) : null;
  const bare = verb === word;
  if (shape && !shape.sep && bare && tail) { verb = `${word} ${tail}`; tail = ""; }
  else if (shape && shape.sep && shape.args && bare) {
    const i = tail.indexOf(" :: ");
    if (i > 0) { verb = `${word} ${tail.slice(0, i).trim()}`; tail = tail.slice(i + 4).trim(); }
    else return { error: `${word} needs its head arguments before "::" — grammar: ${d.grammar.split(" · ")[0]} — put the whole head in \`verb\` (e.g. "${d.grammar.split(" :: ")[0].split(" · ")[0]}")` };
  }
  return { verb, tail: tail || undefined, alias };
}

// v2.1.0 — the review-close line has ONE grammar, and `orc gotcha quality`
// now reads it. A per-finding line (`FINDING-OUTCOME F1 :: sev=P3
// outcome=deferred`) or an outcome outside the closed set is refused BY NAME,
// so a lane can never write a line the reader silently skips.
const FINDING_OUTCOMES = ["addressed", "disputed", "wontfix", "open", "pre", "suppressed"];
const FINDING_HEAD = /^FINDING-OUTCOME addressed=\d+ disputed=\d+ wontfix=\d+ open=\d+ pre=\d+ suppressed=\d+$/;
const FINDING_TAIL = /^(?:clean|[a-z][a-z.-]*:\d+\/\d+(?:\s*,\s*[a-z][a-z.-]*:\d+\/\d+)*)$/;
const FINDING_COUNT_HEAD = /^FINDING p0=\d+ p1=\d+ p2=\d+ p3=\d+(?: pre=\d+)?(?: suppressed=\d+)?(?: folded=\d+)?$/;
const REVIEW_WHICH_HEAD = /^REVIEW-WHICH chose=(orc|project|skip) name=(\S+) by=(user|ledger|learned)$/;
function reviewWhichError(verb, tail) {
  const m = REVIEW_WHICH_HEAD.exec(verb);
  if (!m)
    return 'REVIEW-WHICH: the head must be "REVIEW-WHICH chose=<orc|project|skip> name=<the review the rule names> by=<user|ledger|learned>"';
  if (m[2] === "none") return "REVIEW-WHICH: name= is the review the project rule names (e.g. /code-review), never none";
  if (!tail || !/^\S+:\d+$/.test(tail)) return 'REVIEW-WHICH: the tail is the rule\'s "<file>:<line>" from `orc review policy` (e.g. "CLAUDE.md:42")';
  return null;
}
function findingOutcomeError(verb, tail) {
  const all = `${verb} ${tail || ""}`;
  const unknown = [...all.matchAll(/\boutcome=([a-z_-]+)/g)].map((m) => m[1]).filter((o) => !FINDING_OUTCOMES.includes(o));
  if (unknown.length)
    return `FINDING-OUTCOME: unknown outcome "${unknown[0]}" — the closed set is ${FINDING_OUTCOMES.slice(0, 4).join(" · ")}; write ONE line for the whole review, not one per finding`;
  if (!FINDING_HEAD.test(verb))
    return 'FINDING-OUTCOME: the head must be exactly "FINDING-OUTCOME addressed=<n> disputed=<n> wontfix=<n> open=<n> pre=<n> suppressed=<n>" — ONE line per review, never one per finding';
  if (tail && !FINDING_TAIL.test(tail))
    return 'FINDING-OUTCOME: the tail must be "<category>:<addressed>/<total>,…" or "clean"';
  // v2.1.0 (E21 D5) — a live /orc run wrote `logic:0/4,test-teardown:0/1`. The
  // categories are the review return's CLOSED set (the observations use it).
  if (tail && tail !== "clean") {
    let cats = [];
    try { cats = require("./gotcha.js").CATEGORIES || []; } catch (_) {}
    const bad = cats.length ? tail.split(",").map((x) => x.trim().split(":")[0]).filter((c) => c !== "uncategorized" && !cats.includes(c)) : [];
    if (bad.length) return `FINDING-OUTCOME: unknown category "${bad[0]}" — use the review return's own: ${cats.join(" · ")} (or uncategorized); a review with no finding is the tail "clean"`;
  }
  return null;
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
    // v2.1.0 W6 — `FIX` is written by `orc fix record` itself.
    if (d.emitter === "cli") return errs.push(`${at}: ${word} is written by the CLI (\`orc fix record\`), never by a packet`);
    const ts = e.ts == null ? "" : String(e.ts).trim();
    if (!TS_RE.test(ts)) errs.push(`${at} (${word}): ts "${ts}" is not DDMMYY HH:MM:SS.mmm — the event's REAL time, never "now"`);
    const actor = e.actor == null || e.actor === "" ? "orc" : String(e.actor).trim();
    if (/\s/.test(actor)) errs.push(`${at} (${word}): actor "${actor}" has a space`);
    const shaped = shapeEvent(e, word, d);
    if (shaped.error) return errs.push(`${at}: ${shaped.error}`);
    if (word === "FINDING-OUTCOME") {
      const bad = findingOutcomeError(shaped.verb, shaped.tail);
      if (bad) return errs.push(`${at}: ${bad}`);
    }
    // v2.1.0 (E21 D2, D3) — a live run wrote `FINDING 9 findings — P0×2 …` and
    // `REVIEW-WHICH chose=orc name=none … :: CLAUDE.md:Review policy`.
    if (word === "FINDING" && !FINDING_COUNT_HEAD.test(shaped.verb))
      return errs.push(`${at}: FINDING: the head must be "FINDING p0=<n> p1=<n> p2=<n> p3=<n>" (optionally " pre=<n> suppressed=<n> folded=<n>") — counts only, the detail goes in the tail`);
    if (word === "REVIEW-WHICH") {
      const bad = reviewWhichError(shaped.verb, shaped.tail);
      if (bad) return errs.push(`${at}: ${bad}`);
    }
    const extra = {};
    for (const [k, v] of Object.entries(e)) {
      if (CORE_FIELDS.includes(k) || k === "phase" || k === shaped.alias || v === undefined) continue;
      extra[k] = typeof v === "string" && /^-?\d+(?:\.\d+)?$/.test(v) ? Number(v) : v;
    }
    out.push({ ts, actor, verb: shaped.verb, tail: shaped.tail, extra });
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
    run: typeof pk.run === "string" && /^run-[a-z0-9]+-[a-z0-9-]+-\d{6}-\d{6}(\.txt)?$/.test(pk.run) ? pk.run : null,
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
    // A late packet (the ASK answers after the habits nudge) may arrive after the
    // lane removed `.current`: its `run:` names an EXISTING trace in log_dir.
    const late = !ptr && v.run ? path.join(logDir, path.basename(v.run).replace(/(\.txt)?$/, ".txt")) : null;
    if (late && exists(late)) target = late;
    else if (!ptr)
      throw new StateError("log_dir/.current is missing and this packet has no run_meta — the FINISH packet must be written BEFORE .current is deleted");
    else target = path.join(logDir, ptr);
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

// deps: { flag, positionals, emitJson, wantsJson, resolveClaudeDir, resolveLogDir, TRACE_VERBS, readOverride, reviewPolicyCompute, logSweep }
// The habits capture check (eval E2, 27-09-2026): a live lane read habits.md at
// preflight and then wrote no ASK at the question it asked minutes later. So at the
// FINISH packet, with `habits` on and ZERO `ASK` lines in the run, the CLI names
// this lane's registered questions and asks for ONE more packet with the answers.
// It never blocks: the packet is already written, the exit stays 0.
function askNudge(deps, claudeDir, v, r) {
  if (!deps.readOverride || !v.events.some((e) => e.verb.split(/\s+/)[0] === "FINISH")) return null;
  let H;
  try { H = require("./habit.js"); } catch (_) { return null; }
  let mode = "off";
  try { mode = H.habitsMode(deps.readOverride(claudeDir).map); } catch (_) {}
  if (mode === "off") return null;
  const file = path.join(path.dirname(claudeDir), r.trace_path);
  let txt = "";
  try { txt = fs.readFileSync(file, "utf8"); } catch (_) { return null; }
  // The qids this run already recorded (a VALID ASK line — invalid ones never reach the file).
  const done = new Set();
  for (const m of txt.matchAll(/\] \S+\s+ASK (\S+) ::/g)) done.add(m[1]);
  const tok = (/(?:^|\/)run-([a-z0-9]+)-/.exec(r.trace_path) || [])[1];
  if (!tok) return null;
  const lane = tok === "orc" || tok === "ultra" ? "orc" : `orc-${tok}`;
  const qids = Object.keys(H.ASK_POINTS).filter((q) => (H.ASK_POINTS[q].lanes || []).includes(lane) && !done.has(q));
  if (!qids.length) return null;
  return {
    qids,
    line: `habits: ${mode} — ${done.size ? `this run recorded ASK for ${[...done].join(", ")} only` : "this run wrote NO ASK line"}. If you asked the user any question below, write ONE more packet now (with \`run: ${path.basename(r.trace_path)}\` — it works even after .current is removed): one ASK event per question you asked the user that is marked (H <qid>) — ${lane}: ${qids.map((q) => { const o = Object.keys(H.ASK_POINTS[q].options || {}); return o.length ? `${q} (${o.join("|")})` : `${q} (the agent names you offered)`; }).join(", ")}. Use THESE option ids exactly. verb "ASK <qid>", tail "offered=<o1|o2|…> rec=<o|none> chose=<o|other> by=<user|ledger|learned|config|default>". A question you did not ask this run → no event.`,
  };
}

// v2.1.0 (E21 D6) — the phase-skip nudge. A live /orc run built the plan inline
// and skipped review AND verify "as a proportionality call" until the user asked.
// /orc ALWAYS reviews and verifies (`orc/SKILL.md`, the phase manifest). At FINISH,
// an /orc or /orc-ultra trace with an executor SPAWN and no reviewer or no verifier
// SPAWN gets ONE line naming what is missing. Never a block: the exit stays 0.
function phaseNudge(v, r, claudeDir) {
  if (!v.events.some((e) => e.verb.split(/\s+/)[0] === "FINISH")) return null;
  const tok = (/(?:^|\/)run-([a-z0-9]+)-/.exec(r.trace_path) || [])[1];
  if (tok !== "orc" && tok !== "ultra") return null;
  let txt = "";
  try { txt = fs.readFileSync(path.join(path.dirname(claudeDir), r.trace_path), "utf8"); } catch (_) { return null; }
  if (!/\]\s+hook\s+SPAWN\s+orc-executor-/.test(txt)) return null;
  const missing = [];
  if (!/\]\s+hook\s+SPAWN\s+orc-reviewer-/.test(txt)) missing.push("review (Phase 5, orc-reviewer-opus-5-low)");
  if (!/\]\s+hook\s+SPAWN\s+orc-verifier-/.test(txt)) missing.push("verify (Phase 6, orc-verifier-opus-5-med)");
  if (!missing.length) return null;
  return {
    missing,
    line: `phases: this /orc run changed code and has no ${missing.join(" and no ")}. /orc always runs both — they are not optional for a small change. Run them now, before the summary; a run that should skip them belongs in /orc-mini or /orc-fast.`,
  };
}

// v2.1.0 — the observe nudge (the askNudge model). At the FINISH packet, a run
// whose trace has a reviewer RETURN, whose review was NOT clean, and that has no
// `author: orc` observation with `run=<this trace>` gets ONE line naming
// `orc gotcha observe`. Review Quality counts the review from the trace either
// way; this is the acceptance half. It never blocks: the exit stays 0.
function observeNudge(claudeDir, v, r) {
  if (!v.events.some((e) => e.verb.split(/\s+/)[0] === "FINISH")) return null;
  const file = path.join(path.dirname(claudeDir), r.trace_path);
  let txt = "";
  try { txt = fs.readFileSync(file, "utf8"); } catch (_) { return null; }
  if (!/\]\s+hook\s+RETURN\s+orc-reviewer-/.test(txt)) return null;
  const fo = /FINDING-OUTCOME addressed=(\d+) disputed=(\d+) wontfix=(\d+) open=(\d+)/.exec(txt);
  if (fo && fo.slice(1, 5).every((n) => n === "0")) return null; // a clean review records nothing
  const run = path.basename(r.trace_path).replace(/\.txt$/, "");
  let obs = "";
  try { obs = fs.readFileSync(path.join(claudeDir, "orc", "observations.jsonl"), "utf8"); } catch (_) {}
  for (const line of obs.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o && o.author === "orc" && o.run === run) return null;
    } catch (_) {}
  }
  return {
    run,
    line: `review: this run has a reviewer RETURN and no recorded finding outcome. Pipe ONE object per finding to \`orc gotcha observe - --json\` (source review · author orc · run ${run} · ref "${run} · F<n>" · outcome addressed|disputed|wontfix|open · rule or sig), then write the FINDING-OUTCOME line if it is missing. A clean review needs neither. Every lane that ran a review records this, /orc-fast too: an observation is review learning, not a repair-memory entry.`,
  };
}

// v2.1.0 — the which-review nudge. At FINISH: the project names its own review
// (`orc review policy`, re-run here — the files are small), the run changed code
// (a hook SPAWN of an executor, or a quick code entry), and the trace has no
// REVIEW-WHICH line → ONE line. Never a block: the exit stays 0.
function reviewWhichNudge(deps, claudeDir, v, r) {
  if (typeof deps.reviewPolicyCompute !== "function") return null;
  if (!v.events.some((e) => e.verb.split(/\s+/)[0] === "FINISH")) return null;
  const file = path.join(path.dirname(claudeDir), r.trace_path);
  let txt = "";
  try { txt = fs.readFileSync(file, "utf8"); } catch (_) { return null; }
  if (/\]\s+\S+\s+REVIEW-WHICH\b/.test(txt)) return null;
  const changed = /\]\s+hook\s+SPAWN\s+orc-executor-/.test(txt) || /\]\s+\S+\s+GRAPH-UPDATE\b/.test(txt);
  if (!changed) return null;
  let p;
  try { p = deps.reviewPolicyCompute(claudeDir); } catch (_) { return null; }
  if (!p || p.policy !== "project" || !p.found.length) return null;
  const f = p.found[0];
  return {
    rule: `${f.file}:${f.line}`,
    name: f.names[0],
    line: `review: ${f.file}:${f.line} names ${f.names[0]} and this run changed code with no REVIEW-WHICH line. Before ship, ask "which review" (_shared/review-slice.md §0), then write ONE packet: verb "REVIEW-WHICH chose=<orc|project|skip> name=<name|none> by=user", tail "${f.file}:${f.line}".`,
  };
}

// v2.1.0 (A7) — "Questions saved" read 0 for ever: a lane that SKIPPED a
// question because a config value answered it wrote no `by=config` line. At
// FINISH, with habits on, each of this lane's points whose config key is SET in
// the override (and not `ask`) and that has no ASK line in the run is named once.
// It never blocks; habits off → nothing (zero bytes).
function configNudge(deps, claudeDir, v, r) {
  if (!deps.readOverride || !v.events.some((e) => e.verb.split(/\s+/)[0] === "FINISH")) return null;
  let H;
  try { H = require("./habit.js"); } catch (_) { return null; }
  let map = {};
  try { map = deps.readOverride(claudeDir).map || {}; } catch (_) { return null; }
  let mode = "off";
  try { mode = H.habitsMode(map); } catch (_) {}
  if (mode === "off") return null;
  const file = path.join(path.dirname(claudeDir), r.trace_path);
  let txt = "";
  try { txt = fs.readFileSync(file, "utf8"); } catch (_) { return null; }
  const tok = (/(?:^|\/)run-([a-z0-9]+)-/.exec(r.trace_path) || [])[1];
  if (!tok) return null;
  const lane = tok === "orc" || tok === "ultra" ? "orc" : `orc-${tok}`;
  const done = new Set();
  for (const m of txt.matchAll(/\] \S+\s+ASK (\S+) ::/g)) done.add(m[1]);
  const points = [];
  for (const [qid, pt] of Object.entries(H.ASK_POINTS)) {
    if (!pt.key || !(pt.lanes || []).includes(lane) || done.has(qid)) continue;
    const val = map[pt.key];
    if (val === undefined || val === null || String(val) === "ask") continue;
    const opt = Object.entries(pt.values || {}).find(([, x]) => String(x) === String(val));
    points.push({ qid, key: pt.key, value: String(val), option: opt ? opt[0] : null });
  }
  if (!points.length) return null;
  return {
    points,
    line: `habits: ${mode} — your config answered ${points.map((p) => `${p.qid} (${p.key}: ${p.value})`).join(", ")} and this run has no ASK line for it. If the run reached that question, write ONE packet (with \`run: ${path.basename(r.trace_path)}\`): one ASK event each, tail "offered=<the options> rec=<o> chose=<the option your config picked> by=config". Not reached this run → no event.`,
  };
}

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
  // An ASK is checked against the habit registry AS IT ARRIVES (eval E2): a live lane
  // wrote its own option names and extra text, and the habit engine then counted
  // nothing. An invalid ASK is kept OUT of the trace and handed back with the option
  // ids, so the lane resends it in the same turn; the other events are written.
  const askRejected = [];
  let H = null;
  try { H = require("./habit.js"); } catch (_) {}
  // The trace so far, to tell a FOLLOW-UP from a new answer: the same qid again
  // with no new executor SPAWN (the hook writes those, deterministically) since
  // its last ASK is the same entry's next decision (eval E2: `stop` at the commit
  // offer after the review, recorded as quick.q3.offer.review).
  let sofar = "";
  let sofarName = null;
  try {
    const ld = deps.resolveLogDir(deps.resolveClaudeDir());
    let cur = null;
    try { cur = fs.readFileSync(path.join(ld, ".current"), "utf8").trim() || null; } catch (_) {}
    const name = cur || (v.run ? path.basename(v.run).replace(/(\.txt)?$/, ".txt") : null);
    sofarName = name;
    if (name) sofar = fs.readFileSync(path.join(ld, name), "utf8");
  } catch (_) {}
  const followUp = (qid) => {
    const lines = sofar.split(/\r?\n/);
    let last = -1;
    lines.forEach((l, i) => { if (new RegExp(`\\]\\s+\\S+\\s+ASK ${qid.replace(/\./g, "\\.")} ::`).test(l)) last = i; });
    if (last < 0) return false;
    // v2.1.0 (A6): a NEW entry starts at an executor OR a recon SPAWN, or an extra
    // dispatch line. A reviewer SPAWN is part of the same entry (its commit offer
    // after the review is a follow-up), so it is not a boundary.
    return !lines.slice(last + 1).some((l) => /\]\s+hook\s+SPAWN orc-(?:executor|recon)-/.test(l) || /\]\s+\S+\s+EXTRA\s/.test(l));
  };
  if (H) {
    const seen = new Set();
    v.events = v.events.filter((e) => {
      if (e.verb.split(/\s+/)[0] !== "ASK") return true;
      const p = H.parseAskLine(`${e.verb} :: ${e.tail || ""}`);
      if (p && p.ok !== false && (followUp(p.qid) || seen.has(p.qid))) {
        askRejected.push({ qid: p.qid, error: "a follow-up decision in the SAME entry (no new executor dispatch since this question was answered) — record no ASK for it", options: "none" });
        return false;
      }
      // eval E2: a live lane invented `q3-review`, `q-exec` — an id the registry
      // does not know counts for nothing, so it is refused with the real ids.
      if (p && p.ok !== false && p.known === false && !(H.HABIT_META_QIDS || []).includes(p.qid)) {
        const tok = (/(?:^|\/)run-([a-z0-9]+)-/.exec(sofarName || "") || [])[1];
        const lane = !tok ? null : tok === "orc" || tok === "ultra" ? "orc" : `orc-${tok}`;
        const ids = Object.keys(H.ASK_POINTS).filter((q) => !lane || (H.ASK_POINTS[q].lanes || []).includes(lane));
        askRejected.push({ qid: p.qid, error: `unknown question id — use one of: ${ids.join(", ")}`, options: "see the id list" });
        return false;
      }
      if (p && p.ok !== false) {
        seen.add(p.qid);
        // v2.1.0 (A1): an agent gate is STORED with the canonical agent names.
        const pt = H.ASK_POINTS[p.qid];
        if (pt && pt.open === "agent") {
          const ctx = Object.entries(p.ctx || {}).map(([k, x]) => `${k}=${x}`).join(",");
          e.tail = `offered=${p.offered.join("|")} rec=${p.rec} chose=${p.chose} by=${p.by}` + (p.pre ? ` pre=${p.pre}` : "") + (ctx ? ` ctx=${ctx}` : "");
        }
        return true;
      }
      const qid = e.verb.split(/\s+/)[1] || "";
      const pt = H.ASK_POINTS[qid];
      const o = pt ? Object.keys(pt.options || {}) : [];
      askRejected.push({ qid, error: (p && p.error) || "not an ASK line", options: o.length ? o.join("|") : "the agent names you offered (plain ids, no spaces)" });
      return false;
    });
  }
  // v2.1.0 (E21 D3/D4) — §0 "which review" exists only when the PROJECT names its
  // own review. Live runs wrote REVIEW-WHICH and ASK any.review.which with no rule
  // at all, so both are handed back by name when `orc review policy` says orc.
  const isWhich = (e) => /^REVIEW-WHICH\b/.test(e.verb) || /^ASK any\.review\.which\b/.test(e.verb);
  if (typeof deps.reviewPolicyCompute === "function" && v.events.some(isWhich)) {
    let pol = null;
    try { pol = deps.reviewPolicyCompute(deps.resolveClaudeDir()); } catch (_) {}
    if (pol && pol.policy !== "project")
      v.events = v.events.filter((e) => {
        if (!isWhich(e)) return true;
        askRejected.push({ qid: /^ASK/.test(e.verb) ? "any.review.which" : "REVIEW-WHICH", error: "no project review rule (`orc review policy` says orc) — the which-review question is not asked, so record nothing for it", options: "none" });
        return false;
      });
  }
  if (askRejected.length && !v.events.length && !v.note) {
    const line = `ASK rejected — nothing written. Resend each as verb "ASK <qid>", tail "offered=<a|b> rec=<o> chose=<o> by=user" with these ids: ${askRejected.map((a) => `${a.qid} (${a.options}) — ${a.error}`).join("; ")}`;
    if (json) return deps.emitJson({ ask_rejected_line: line, ok: true, lines_written: 0, jsonl_written: 0, ask_rejected: askRejected }, 0);
    console.log(line);
    return;
  }
  const claudeDir = deps.resolveClaudeDir();
  let r;
  try {
    r = writePacket(claudeDir, deps.resolveLogDir(claudeDir), v, renderBlock(v));
  } catch (e) {
    if (!(e instanceof StateError)) return fail(3, "error", `${e.message} — nothing written`);
    return fail(3, "trace-state", `${e.message} — nothing written`);
  }
  const nudge = askNudge(deps, claudeDir, v, r);
  const obsNudge = observeNudge(claudeDir, v, r);
  const whichNudge = reviewWhichNudge(deps, claudeDir, v, r);
  const cfgNudge = configNudge(deps, claudeDir, v, r);
  const phNudge = phaseNudge(v, r, claudeDir);
  // v2.1.0 W7 (DE-20 a) — the opt-in log sweep, AFTER the FINISH packet is on
  // disk. `log_retention_auto: off` → one config lookup, no scan. It never
  // blocks and never changes the exit code (sweep() swallows every error).
  let sweep = null;
  if (typeof deps.logSweep === "function" && v.events.some((e) => e.verb.split(/\s+/)[0] === "FINISH")) {
    try { sweep = deps.logSweep(claudeDir); } catch (_) { sweep = null; }
  }
  // The messages go FIRST: a lane often pipes the answer through `head`.
  const rejLine = askRejected.length
    ? `ASK rejected (the other events were written) — resend each as verb "ASK <qid>", tail "offered=<a|b> rec=<o> chose=<o> by=user" with these ids: ${askRejected.map((a) => `${a.qid} (${a.options}) — ${a.error}`).join("; ")}`
    : null;
  const head = Object.assign(
    rejLine ? { ask_rejected_line: rejLine } : {},
    nudge ? { ask_missing_line: nudge.line } : {},
    obsNudge ? { observe_missing_line: obsNudge.line } : {},
    whichNudge ? { review_which_missing_line: whichNudge.line } : {},
    cfgNudge ? { config_missing_line: cfgNudge.line } : {},
    phNudge ? { phases_missing_line: phNudge.line } : {}
  );
  if (json) return deps.emitJson(Object.assign(head, { ok: true }, r, rejLine ? { ask_rejected: askRejected } : {}, nudge ? { ask_missing: nudge } : {}, obsNudge ? { observe_missing: obsNudge } : {}, whichNudge ? { review_which_missing: whichNudge } : {}, cfgNudge ? { config_missing: cfgNudge } : {}, phNudge ? { phases_missing: phNudge } : {}, sweep ? { log_sweep: sweep } : {}), 0);
  if (rejLine) console.log(rejLine);
  if (nudge) console.log(nudge.line);
  if (obsNudge) console.log(obsNudge.line);
  if (whichNudge) console.log(whichNudge.line);
  if (cfgNudge) console.log(cfgNudge.line);
  if (phNudge) console.log(phNudge.line);
  if (sweep) console.log(sweep.line);
  console.log(
    `trace write: +${r.lines_written} lines, +${r.jsonl_written} jsonl → ${r.trace_path}` +
      (r.renamed ? " (renamed the bootstrap file)" : "") +
      (r.repointed ? " (.current repointed)" : "")
  );
}

module.exports = { parsePacket, validatePacket, renderBlock, writePacket, traceCmd, kebab, PacketError, StateError, USAGE };
