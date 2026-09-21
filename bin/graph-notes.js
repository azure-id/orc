"use strict";
// ── orc graph — NOTES (v1.8.0 W4) ───────────────────────────────────────────
//
// Layer 2: one sentence per function or method, written by
// `orc-graph-noter-sonnet-4-6-med`, stored by THIS module and nothing else.
//
// THE RULES THIS FILE HOLDS
//
//   1. A note is keyed by `(symbol, body_hash)`. It is shown as current ONLY
//      while the symbol's body still hashes the same. A note about code that
//      has since changed is labelled stale and never presented as a fact — the
//      RepoMirage finding: agents trust provided context over the code.
//   2. The CLI is the only writer (S1). The agent pipes JSON to
//      `orc graph notes apply -`; every row is validated against the CURRENT
//      index, and a rejected row is named with its reason. The valid rows
//      still apply.
//   3. Notes are for touched code only. `pending` needs `--files` — there is no
//      repo-wide "note everything" mode, because that is the cost this layer
//      must never become.
//   4. A batch below `--min` is not dispatched. The fixed start-up cost of a
//      subagent (~5.7K tokens) makes a one-symbol batch the most expensive note
//      there is. Nothing is lost by waiting: pending is recomputed from hashes.
//   5. `notes.jsonl` is append-only between compactions. `orc graph gc`
//      compacts it to the latest note per symbol whose hash is still current.

const fs = require("fs");

const NOTE_MAX = 240;
// A two-line getter gains nothing from a sentence about it.
const MIN_LINES = 3;
// Classes are excluded: a class body hash moves whenever ANY of its methods
// moves, so a class note would go stale on every edit to the class.
// A route handler is a function with no name — it is noted like one.
const NOTE_KINDS = new Set(["function", "method", "route"]);

const G = () => require("./graph.js");

function clampInt(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n) || v === true || v === undefined || v === null || v === "") return def;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function readIndex(claudeDir) {
  try {
    return JSON.parse(fs.readFileSync(G().graphPaths(claudeDir).index, "utf8"));
  } catch (_) {
    return null;
  }
}

function readNotes(file) {
  const rows = [];
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (_) {
    return rows;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r.sym === "string" && typeof r.body_hash === "string" && typeof r.note === "string") rows.push(r);
    } catch (_) {
      // A torn last line from a crash mid-append is skipped, never fatal.
    }
  }
  return rows;
}

// The latest note per (sym, body_hash), and the latest note per sym whatever
// its hash (used only to say "stale").
function noteIndex(claudeDir) {
  const rows = readNotes(G().graphPaths(claudeDir).notes);
  const byKey = new Map();
  const bySym = new Map();
  for (const r of rows) {
    byKey.set(`${r.sym}\0${r.body_hash}`, r);
    bySym.set(r.sym, r);
  }
  return { byKey, bySym, rows: rows.length };
}

// The ONE resolution rule, shared by every reader:
//
//   1. a CURRENT model note   — somebody paid for it and it still describes
//                               this body
//   2. the DOC note (N1)      — the author's own first sentence, re-extracted
//                               with the body, so it is never stale on its own
//   3. a STALE model note     — reported as stale, never repeated as a fact
//
// A doc outranks a stale note because a sentence that matches the current
// bytes beats one that matched a body nobody has any more. It does NOT
// outrank a current model note: a comment can lie, and the model read the code.
// That is why the shared precedence line reads `graph notes and doc notes` as
// ONE rung, below a stale wiki — this function is the code half of it.
function noteFor(idx, sym) {
  if (!sym) return null;
  const cur = idx && idx.byKey.get(`${sym.id}\0${sym.body_hash}`);
  if (cur) return { text: cur.note, model: cur.model, at: cur.at, current: true, source: "model" };
  if (sym.doc) return { text: sym.doc, model: "parser", at: null, current: true, source: "doc" };
  const any = idx && idx.bySym.get(sym.id);
  if (any) return { text: null, model: any.model, at: any.at, current: false, source: "model" };
  return null;
}

const normPath = (f) => String(f).replace(/\\/g, "/").replace(/^\.\//, "");

// exit 0 = rows to note · 1 = no index / no --files · 5 = none, or fewer than --min
function notesPending(claudeDir, opts, root) {
  const index = readIndex(claudeDir);
  if (!index || !index.by_file) return { ok: false, state: "none", reason: "no-index", exit: 1 };
  const files = [...new Set((opts.files || []).map(normPath).filter(Boolean))];
  if (!files.length) return { ok: false, state: "usage", reason: "missing-files", exit: 1 };
  const cap = clampInt(opts.cap, 1, 200, 40);
  const min = clampInt(opts.min, 1, 200, 5);
  const idx = noteIndex(claudeDir);
  const missing = [];
  const rows = [];
  let documented = 0;
  for (const rel of files) {
    const f = index.by_file[rel];
    if (!f) {
      missing.push(rel);
      continue;
    }
    for (const s of f.symbols || []) {
      if (!NOTE_KINDS.has(s.kind)) continue;
      if (s.lines[1] - s.lines[0] + 1 < MIN_LINES) continue;
      if (idx.byKey.has(`${s.id}\0${s.body_hash}`)) continue;
      // N1 (v1.8.2 W4): the author already wrote the sentence. Paying a
      // subagent to write it again is the one cost this layer must not have.
      if (s.doc) {
        documented++;
        continue;
      }
      rows.push({ sym: s.id, file: rel, lines: s.lines, body_hash: s.body_hash, restale: idx.bySym.has(s.id) });
    }
  }
  const base = { ok: true, files, missing, total: rows.length, documented, cap, min };
  if (!rows.length) return { ...base, state: "none", rows: [], more: 0, exit: 5 };
  if (rows.length < min) return { ...base, state: "below-min", rows: [], waiting: rows.map((r) => r.sym), more: 0, exit: 5 };
  const out = rows.slice(0, cap);
  // N2 (v1.8.2 W4) — `--with-source`: the ranges, in the SAME call. The noter
  // used to open every symbol with a `Read`, so a 40-symbol batch was 40 round
  // trips before it wrote a word. One call, `SRC_PER_ROW` lines each, and the
  // noter reads nothing.
  if (opts.withSource) for (const r of out) r.source = readRange(root, r.file, r.lines);
  return { ...base, state: "pending", rows: out, more: rows.length - out.length, with_source: !!opts.withSource, exit: 0 };
}

const SRC_PER_ROW = 120;

function readRange(root, rel, lines) {
  if (!root) return null;
  try {
    const all = require("fs").readFileSync(require("path").join(root, ...rel.split("/")), "utf8").split(/\r?\n/);
    const from = Math.max(1, lines[0]);
    const to = Math.min(all.length, Math.min(lines[1], from + SRC_PER_ROW - 1));
    if (to < from) return null;
    return { from, to, cut: Math.max(0, lines[1] - to), text: all.slice(from - 1, to).join("\n") };
  } catch (_) {
    return null; // a file that moved between the index and now: the noter reads it
  }
}

// exit 0 = every row applied · 1 = no index / locked · 6 = one or more rows rejected
function notesApply(claudeDir, payload) {
  const index = readIndex(claudeDir);
  if (!index || !index.by_file) return { ok: false, state: "none", reason: "no-index", exit: 1 };
  let data = payload;
  if (typeof payload === "string") {
    try {
      data = JSON.parse(payload);
    } catch (_) {
      return { ok: false, state: "invalid", reason: "not-json", applied: 0, rejected: [], exit: 6 };
    }
  }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.notes) ? data.notes : null;
  if (!list) return { ok: false, state: "invalid", reason: "no-notes-array", applied: 0, rejected: [], exit: 6 };
  const model = data && !Array.isArray(data) && typeof data.model === "string" && data.model.trim() ? data.model.trim().slice(0, 60) : "unknown";

  const syms = new Map();
  for (const f of Object.values(index.by_file)) for (const s of f.symbols || []) syms.set(s.id, s);
  const applied = [];
  const rejected = [];
  const at = G().stamp(new Date());
  list.forEach((n, i) => {
    const reject = (reason) => rejected.push({ index: i, sym: (n && n.sym) || null, reason });
    if (!n || typeof n !== "object") return reject("not-an-object");
    const s = syms.get(n.sym);
    if (!s) return reject("unknown-symbol");
    if (n.body_hash !== s.body_hash) return reject("stale-body-hash");
    if (typeof n.note !== "string" || !n.note.trim()) return reject("empty-note");
    const text = n.note.trim();
    if (/[\r\n]/.test(text)) return reject("multi-line");
    if (text.length > NOTE_MAX) return reject("too-long");
    applied.push({ sym: s.id, body_hash: s.body_hash, note: text, model, at });
  });

  if (applied.length) {
    const g = G();
    const p = g.graphPaths(claudeDir);
    const lock = g.acquireLock(p);
    if (!lock.ok) return { ok: false, state: "unavailable", reason: "locked", holder: lock.holder, applied: 0, rejected, exit: 1 };
    try {
      fs.appendFileSync(p.notes, applied.map((r) => JSON.stringify(r)).join("\n") + "\n");
    } finally {
      g.releaseLock(p);
    }
  }
  return { ok: true, state: rejected.length ? "partial" : "applied", applied: applied.length, rejected, model, exit: rejected.length ? 6 : 0 };
}

// Called by `graphGc` while it already holds the lock.
function compactNotes(p, index, atomicWrite) {
  const rows = readNotes(p.notes);
  if (!rows.length) return { kept: 0, removed: 0 };
  const current = new Map();
  for (const f of Object.values((index && index.by_file) || {})) for (const s of f.symbols || []) current.set(s.id, s.body_hash);
  const latest = new Map();
  for (const r of rows) if (current.get(r.sym) === r.body_hash) latest.set(r.sym, r);
  const keep = [...latest.values()];
  if (keep.length !== rows.length) atomicWrite(p.notes, keep.map((r) => JSON.stringify(r)).join("\n") + (keep.length ? "\n" : ""));
  return { kept: keep.length, removed: rows.length - keep.length };
}

module.exports = { NOTE_MAX, notesPending, notesApply, noteIndex, noteFor, compactNotes };
