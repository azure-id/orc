"use strict";
// ── orc graph — RESOLUTION and the READ commands (v1.8.0 W3) ────────────────
//
// `ctx`, `impact` and `path` answer from the stored records. Resolution is
// COMPUTED ON READ, never stored — a deliberate change from plan §3 step 5.
// W0 measured the whole resolve pass at 175 ms on Django (7K files); storing
// edges would add ~12 MB to every parse AND an invalidation path that can go
// stale in silence. The standing rule wins: a state is computed, not kept.
//
// THE STATES — never a fuzzy guess
//   LOCAL       defined in the same file (a `this.`/`self.` call prefers the caller's class)
//   IMPORT      the name, or its receiver, is bound by an import whose path resolves here
//   UNIQUE      exactly one symbol in the repo has that name (and the receiver agrees)
//   AMBIGUOUS   two or more candidates, OR a receiver that no candidate confirms — all listed
//   UNRESOLVED  nothing in this repo (a builtin, an external package, dynamic dispatch)
//   (EXACT is reserved for a type-checker-backed resolution; nothing emits it yet.)
//
// Every read is BUDGETED. A card never exceeds its budget and always says what
// it hid — a graph tool that returned 33K tokens is the failure this prevents.

const fs = require("fs");
const path = require("path");
const posix = path.posix;
const { spawnSync } = require("child_process");
const G = require("./graph.js");
const N = require("./graph-notes.js");

const CONFIDENT = new Set(["LOCAL", "IMPORT", "UNIQUE"]);
const TEST_FILE = /(^|\/)(tests?|__tests__|specs?)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py)$|(^|\/)test_[^/]*\.py$|Tests?\.(java|cs)$|Test\.php$/;
const JS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const tok = (s) => Math.ceil(String(s).length / 4);
const norm = (p) => String(p).replace(/\\/g, "/").replace(/^\.\//, "");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

// EW2: `opts.noCache` is for the WRITER — `graph-resolve.build` must compute,
// never read back the cache it is about to replace.
function loadModel(claudeDir, root, opts) {
  const p = G.graphPaths(claudeDir);
  const meta = readJson(p.meta);
  const index = readJson(p.index);
  if (!meta || !index || !index.by_file) return null;
  // The stored resolution, and ONLY when it names this exact generation.
  // Anything else — a crash between two writes, an older engine, a hand
  // deletion — leaves `cached` null and every answer is computed as before.
  const cached = opts && opts.noCache ? null : require("./graph-resolve.js").load(claudeDir, meta);
  const byFile = index.by_file;
  const symbols = new Map();
  const byName = new Map();
  for (const [rel, f] of Object.entries(byFile)) {
    for (const s of f.symbols || []) {
      s.file = rel;
      symbols.set(s.id, s);
      if (s.kind === "module") continue;
      const a = byName.get(s.name);
      if (a) a.push(s);
      else byName.set(s.name, [s]);
    }
  }
  return {
    root,
    meta,
    notes: N.noteIndex(claudeDir),
    byFile,
    fileSet: new Set(Object.keys(byFile)),
    symbols,
    byName,
    bindings: new Map(),
    resolved: new Map(),
    // The REVERSE direction only. EW2 measured storing the whole memo as a net
    // loss (21.7 MB to parse, to save less than that), while this half is the
    // one the 437 ms walk was computing.
    callersCache: cached ? cached.callers || {} : null,
    maybeCache: cached ? cached.maybe || {} : null,
    generation: meta.generation || 0,
    suffix: new Map(),
    dirs: null,
    goModule: undefined,
    callIndex: null,
  };
}

// ── import targets ──────────────────────────────────────────────────────────
function bySuffix(model, suffix) {
  if (model.suffix.has(suffix)) return model.suffix.get(suffix);
  const out = [];
  for (const f of model.fileSet) if (f === suffix || f.endsWith("/" + suffix)) out.push(f);
  model.suffix.set(suffix, out);
  return out;
}

function filesInDir(model, dir, ext) {
  if (!model.dirs) {
    model.dirs = new Map();
    for (const f of model.fileSet) {
      const d = posix.dirname(f);
      const a = model.dirs.get(d);
      if (a) a.push(f);
      else model.dirs.set(d, [f]);
    }
  }
  return (model.dirs.get(dir) || []).filter((f) => f.endsWith(ext));
}

function resolveJs(model, from, spec) {
  let base;
  if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), spec));
  else if (/^[@~]\//.test(spec)) base = "src/" + spec.slice(2);
  else if (spec.startsWith("/")) base = spec.slice(1);
  else return [];
  const cands = [base, ...JS_EXT.map((e) => base + e), ...JS_EXT.map((e) => `${base}/index${e}`)];
  // TS ESM writes `./x.js` for a file that is `x.ts` on disk.
  if (/\.(js|jsx|mjs|cjs)$/.test(base)) {
    const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
    cands.push(...JS_EXT.map((e) => stem + e));
  }
  for (const c of cands) if (model.fileSet.has(c)) return [c];
  return [];
}

function resolvePy(model, from, spec) {
  const lvl = /^\.*/.exec(spec)[0].length;
  const parts = spec.slice(lvl).split(".").filter(Boolean);
  let dir = "";
  if (lvl) {
    dir = posix.dirname(from);
    for (let i = 1; i < lvl; i++) dir = posix.dirname(dir);
    if (dir === ".") dir = "";
  }
  const p = [dir, ...parts].filter(Boolean).join("/");
  for (const c of p ? [`${p}.py`, `${p}/__init__.py`] : [`${dir ? dir + "/" : ""}__init__.py`]) if (model.fileSet.has(c)) return [c];
  if (!lvl && parts.length) {
    const a = bySuffix(model, `${parts.join("/")}.py`);
    if (a.length) return a;
    return bySuffix(model, `${parts.join("/")}/__init__.py`);
  }
  return [];
}

function resolveGo(model, spec) {
  if (model.goModule === undefined) {
    model.goModule = null;
    try {
      const mm = /^module\s+(\S+)/m.exec(fs.readFileSync(path.join(model.root, "go.mod"), "utf8"));
      if (mm) model.goModule = mm[1];
    } catch (_) {}
  }
  if (!model.goModule || !spec.startsWith(model.goModule + "/")) return [];
  return filesInDir(model, spec.slice(model.goModule.length + 1), ".go").filter((f) => !f.endsWith("_test.go"));
}

function importTargets(model, from, lang, imp) {
  const spec = imp.from || "";
  if (lang === "js" || lang === "ts") return resolveJs(model, from, spec);
  if (lang === "py") return resolvePy(model, from, spec);
  if (lang === "go") return resolveGo(model, spec);
  if (lang === "java") {
    // A wildcard import names a package, not a file; the UNIQUE rung covers it.
    if (imp.star) return [];
    return bySuffix(model, `${spec.replace(/\./g, "/")}.java`);
  }
  if (lang === "php") {
    if (imp.include) {
      const rel = posix.normalize(posix.join(posix.dirname(from), spec));
      return model.fileSet.has(rel) ? [rel] : bySuffix(model, spec.replace(/^(\.\.?\/)+/, ""));
    }
    return bySuffix(model, `${spec.replace(/\\/g, "/")}.php`);
  }
  return [];
}

function fileBindings(model, rel) {
  if (model.bindings.has(rel)) return model.bindings.get(rel);
  const b = new Map();
  const includes = [];
  const f = model.byFile[rel] || {};
  for (const imp of f.imports || []) {
    const files = importTargets(model, rel, f.lang, imp);
    if (imp.include) includes.push(...files);
    for (const bd of imp.bindings || []) b.set(bd.local, { ...bd, from: imp.from, files });
  }
  const out = { map: b, includes };
  model.bindings.set(rel, out);
  return out;
}

// ── resolution ──────────────────────────────────────────────────────────────
function classOf(sym) {
  const q = sym.qname.split(".");
  return q.length > 1 ? q.slice(0, -1).join(".") : null;
}

function resolveCall(model, rel, caller, call) {
  const cls = caller ? classOf(caller) : null;
  const key = `${rel}\0${cls || ""}\0${call.name}\0${call.self ? 1 : 0}\0${call.ref ? 1 : 0}`;
  if (model.resolved.has(key)) return model.resolved.get(key);
  const parts = call.name.split(".");
  const last = parts[parts.length - 1];
  const head = parts.length > 1 ? parts[0] : null;
  const f = model.byFile[rel] || {};
  const locals = (f.symbols || []).filter((s) => s.kind !== "module" && s.name === last);
  const { map: binds, includes } = fileBindings(model, rel);
  const lang = f.lang;
  let r = null;
  const hit = (state, s) => ({ state, target: s.id });

  if (!head && locals.length) {
    const same = call.self && cls ? locals.find((s) => classOf(s) === cls) : null;
    r = hit("LOCAL", same || locals.find((s) => !classOf(s) || !call.self) || locals[0]);
  }
  if (!r && head) {
    const m2 = locals.filter((s) => s.qname === `${head}.${last}` || s.qname.endsWith(`.${head}.${last}`));
    if (m2.length) r = hit("LOCAL", m2[0]);
  }
  if (!r) {
    const bd = binds.get(head || last);
    if (bd && !bd.files.length && lang !== "cs") {
      // Bound by an import that does not resolve to a file here — an external
      // package. Matching it against a same-named repo function would invent
      // an edge (axios.get → some repo `get`).
      if (!(lang === "py" && bd.kind === "named")) r = { state: "UNRESOLVED", external: bd.from };
    }
    if (!r && bd && bd.files.length) {
      const tsyms = bd.files.flatMap((t) => ((model.byFile[t] || {}).symbols || []).filter((s) => s.kind !== "module"));
      let s = null;
      if (head) {
        s =
          tsyms.find((x) => x.qname === `${bd.orig}.${last}` || x.qname === `${bd.local}.${last}`) ||
          (bd.kind === "namespace" || bd.kind === "default" ? tsyms.find((x) => x.name === last && !classOf(x)) : null) ||
          tsyms.find((x) => x.name === last && x.qname.startsWith(bd.orig + "."));
      } else if (bd.kind === "named") {
        s = tsyms.find((x) => x.qname === bd.orig) || tsyms.find((x) => x.name === bd.orig && !classOf(x));
      } else {
        const exported = tsyms.filter((x) => x.exported && !classOf(x));
        s = tsyms.find((x) => x.qname === bd.local) || (exported.length === 1 ? exported[0] : null);
      }
      // `from pkg import module` — the name is a module, not a symbol in pkg.
      if (!s && lang === "py" && bd.kind === "named") {
        const sub = resolvePy(model, rel, `${bd.from}.${bd.orig}`);
        const ss = sub.flatMap((t) => ((model.byFile[t] || {}).symbols || []).filter((x) => x.kind !== "module"));
        s = head ? ss.find((x) => x.name === last && !classOf(x)) : null;
      }
      if (s) r = hit("IMPORT", s);
    }
  }
  if (!r && !head && includes.length) {
    const s = includes.flatMap((t) => ((model.byFile[t] || {}).symbols || []).filter((x) => x.kind !== "module" && x.name === last && !classOf(x)))[0];
    if (s) r = hit("IMPORT", s);
  }
  if (!r) {
    const cands = model.byName.get(last) || [];
    if (head) {
      const hl = head.toLowerCase();
      const byClass = cands.filter((s) => {
        const c = classOf(s);
        return c && c.split(".").pop().toLowerCase() === hl;
      });
      if (byClass.length === 1) r = hit("UNIQUE", byClass[0]);
      else if (byClass.length > 1) r = { state: "AMBIGUOUS", candidates: byClass.map((s) => s.id) };
      else if (cands.length) r = { state: "AMBIGUOUS", candidates: cands.map((s) => s.id) };
    } else if (cands.length === 1) r = hit("UNIQUE", cands[0]);
    else if (cands.length > 1) r = { state: "AMBIGUOUS", candidates: cands.map((s) => s.id) };
  }
  if (!r) r = { state: "UNRESOLVED" };
  // A name passed as an argument is only an edge when this file defines it or
  // imports it. `res.json(order)` must never find a repo function named `order`.
  if (call.ref && r.state !== "LOCAL" && r.state !== "IMPORT") r = { state: "UNRESOLVED" };
  model.resolved.set(key, r);
  return r;
}

function callIndex(model) {
  if (model.callIndex) return model.callIndex;
  const idx = new Map();
  for (const [rel, f] of Object.entries(model.byFile)) {
    for (const s of f.symbols || []) {
      for (const c of s.calls || []) {
        const last = c.name.split(".").pop();
        const a = idx.get(last);
        const row = { rel, sym: s, call: c };
        if (a) a.push(row);
        else idx.set(last, [row]);
      }
    }
  }
  model.callIndex = idx;
  return idx;
}

// Who calls `target`: confident callers, and a count of AMBIGUOUS ones that
// list it among their candidates.
function callersOf(model, target) {
  const confident = [];
  const seen = new Set();
  let maybe = 0;
  // The stored reverse map. EW0 measured this walk at 437 ms for one file card
  // on django/django; the lookup is a property read.
  const cachedRows = model.callersCache && Object.prototype.hasOwnProperty.call(model.callersCache, target.id) ? model.callersCache[target.id] : model.callersCache ? [] : null;
  if (cachedRows) {
    for (const r of cachedRows) {
      const sym = model.symbols.get(r[0]);
      if (!sym) continue;
      const k = `${r[0]} ${r[1]}`;
      if (seen.has(k)) continue;
      seen.add(k);
      confident.push({ sym, line: r[1], state: r[2], ...(r[3] ? { ref: true } : {}) });
    }
  }
  if (model.callersCache) {
    stableCallers(confident);
    const m = model.maybeCache;
    if (m && Object.prototype.hasOwnProperty.call(m, target.id)) for (const row of m[target.id]) maybe += row[1];
    return { confident, maybe };
  }
  for (const row of callIndex(model).get(target.name) || []) {
    const r = resolveCall(model, row.rel, row.sym, row.call);
    if (r.target === target.id && CONFIDENT.has(r.state)) {
      const k = `${row.sym.id}\0${row.call.line}`;
      if (seen.has(k)) continue;
      seen.add(k);
      confident.push({ sym: row.sym, line: row.call.line, state: r.state, ...(row.call.ref ? { ref: true } : {}) });
    } else if (r.state === "AMBIGUOUS" && r.candidates.includes(target.id)) maybe++;
  }
  stableCallers(confident);
  return { confident, maybe };
}

// EW2: the stored reverse map and the on-read walk visit callers in different
// orders. Same rows, and a card that reorders itself depending on whether a
// cache file happens to exist is a card nobody can diff. One total order, both
// ways.
function stableCallers(rows) {
  rows.sort((a, b) => a.sym.file.localeCompare(b.sym.file) || a.line - b.line || String(a.sym.id).localeCompare(String(b.sym.id)));
}

function calleesOf(model, sym) {
  const out = [];
  const seen = new Set();
  for (const c of sym.calls || []) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push({ call: c, res: resolveCall(model, sym.file, sym, c) });
  }
  return out;
}

// ── targets ─────────────────────────────────────────────────────────────────
function findTarget(model, q) {
  const s = norm(q);
  const fl = /^(.+?):(\d+)$/.exec(s);
  if (fl && model.fileSet.has(fl[1])) {
    const line = Number(fl[2]);
    const inside = (model.byFile[fl[1]].symbols || [])
      .filter((x) => x.kind !== "module" && x.lines[0] <= line && line <= x.lines[1])
      .sort((a, b) => a.lines[1] - a.lines[0] - (b.lines[1] - b.lines[0]));
    return inside.length ? { kind: "symbol", sym: inside[0] } : { kind: "file", rel: fl[1] };
  }
  if (model.fileSet.has(s)) return { kind: "file", rel: s };
  if (model.symbols.has(s)) return { kind: "symbol", sym: model.symbols.get(s) };
  const exact = [];
  for (const x of model.symbols.values()) if (x.kind !== "module" && x.qname === s) exact.push(x);
  if (exact.length === 1) return { kind: "symbol", sym: exact[0] };
  // Same qname, same file: one symbol declared more than once (a Go build tag,
  // a Python redefinition). The widest one is the implementation.
  if (exact.length > 1 && exact.every((x) => x.file === exact[0].file)) {
    return { kind: "symbol", sym: exact.slice().sort((a, b) => b.lines[1] - b.lines[0] - (a.lines[1] - a.lines[0]))[0] };
  }
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };
  const named = model.byName.get(s) || [];
  if (named.length === 1) return { kind: "symbol", sym: named[0] };
  if (named.length > 1) return { kind: "ambiguous", candidates: named };
  const ql = s.toLowerCase();
  const nearest = [];
  for (const [n, arr] of model.byName) if (n.toLowerCase().includes(ql)) nearest.push(...arr);
  return { kind: "none", nearest: nearest.slice(0, 5) };
}

const where = (sym, line) => `${sym.file}:${line || sym.lines[0]}`;
const brief = (sym) => ({ id: sym.id, qname: sym.qname, kind: sym.kind, file: sym.file, lines: sym.lines });

function blobState(model, rel) {
  if (!fs.existsSync(path.join(model.root, ...rel.split("/")))) return "deleted";
  const r = spawnSync("git", ["hash-object", "--", rel], { cwd: model.root, encoding: "utf8" });
  if (r.status !== 0) return "unknown";
  return r.stdout.trim() === (model.byFile[rel] || {}).blob ? "current" : "changed";
}

// EW1: what the extractor saw of this file, for the card header. A card that
// hides a gap is worse than no card — the reader takes silence for absence.
function coverageTag(model, rel) {
  const f = model.byFile[rel] || {};
  if (f.skipped) return ` · coverage skipped:${f.skipped}`;
  if (f.coverage !== "partial") return "";
  const r = (f.partial || []).map((g) => `${g[0]}-${g[1]}`).join(",");
  return ` · coverage partial ${r}`;
}

const BLOB_LABEL = {
  current: "current",
  changed: "CHANGED since index — hints only (run: orc graph update)",
  deleted: "DELETED since index (run: orc graph update)",
  unknown: "freshness unknown",
};

// Pick lines by priority until the budget is spent, then print them in display
// order. The footer is always kept, so the card always says what it hid.
function fit(items, budget, footer) {
  const reserve = tok(footer(0, {})) + 12;
  let used = 0;
  const keep = new Set();
  const hidden = {};
  const order = items.map((it, i) => i).sort((a, b) => items[a].pri - items[b].pri || a - b);
  for (const i of order) {
    const t = tok(items[i].text) + 1;
    if (items[i].pri === 0 || used + t + reserve <= budget) {
      keep.add(i);
      used += t;
    } else hidden[items[i].section] = (hidden[items[i].section] || 0) + 1;
  }
  const lines = items.filter((_, i) => keep.has(i)).map((it) => it.text);
  const foot = footer(used, hidden);
  lines.push(foot);
  return { card: lines.join("\n"), kept: keep, hidden, used: used + tok(foot) };
}

// ── E6: the tree format ─────────────────────────────────────────────────────
// The prose card repeats a label on every row — `function`, `:12-40`,
// `exported`, `fan-in 3`, `(via X)`. A card is sent again on every later turn of
// the agent that received it, so a word repeated on forty rows is paid forty
// times, forty turns over. The tree format names each column ONCE in a header
// and then prints only values.
//
// It is a FORMAT, never a filter: the same rows, the same order, the same JSON.
// `--format prose` stays the default, because a shorter card that is read wrong
// costs more than it saves.
const KIND_SHORT = { function: "fn", method: "me", class: "cl", route: "rt", module: "mo", const: "co", var: "va", type: "ty", interface: "in", enum: "en", struct: "st" };
const STATE_SHORT = { LOCAL: "L", IMPORT: "I", UNIQUE: "U", AMBIGUOUS: "A", UNRESOLVED: "-" };
const shortKind = (k) => KIND_SHORT[k] || String(k).slice(0, 2);

// The longest directory every path shares. A prefix line is only worth writing
// when it saves REAL bytes — CBM's rule, and the reason is that a header nobody
// needs is a header everybody still reads.
function dirPrefix(paths) {
  if (paths.length < 2) return "";
  const parts = paths.map((p) => p.split("/").slice(0, -1));
  let n = 0;
  outer: for (; n < parts[0].length; n++) {
    for (const q of parts) if (q[n] !== parts[0][n]) break outer;
  }
  if (!n) return "";
  const pre = parts[0].slice(0, n).join("/") + "/";
  const saved = pre.length * paths.length - (pre.length + 6); // "  dir " + the prefix
  const total = paths.reduce((a, p) => a + p.length, 0);
  return saved >= 64 && saved >= total * 0.15 ? pre : "";
}

function hiddenText(hidden) {
  const parts = Object.entries(hidden).map(([k, v]) => `${v} ${k}`);
  return parts.length ? ` · hidden: ${parts.join(", ")} (raise --budget)` : "";
}

// ── ctx ─────────────────────────────────────────────────────────────────────
function ctx(model, query, opts) {
  const depth = Math.max(1, Math.min(4, Number(opts.depth) || 2));
  const budget = Math.max(100, Math.min(8000, Number(opts.budget) || 1200));
  const t = findTarget(model, query);
  if (t.kind === "none") return { ok: false, state: "not-found", query, nearest: t.nearest.map(brief), exit: 4 };
  if (t.kind === "ambiguous") return { ok: false, state: "ambiguous-target", query, candidates: t.candidates.map(brief), exit: 4 };
  if (t.kind === "file") return fileCard(model, t.rel, budget, opts);

  const sym = t.sym;
  const fresh = blobState(model, sym.file);
  const items = [];
  const push = (pri, section, text, data) => items.push({ pri, section, text, data });
  push(0, "header", `${sym.qname}  ${sym.file}:${sym.lines[0]}-${sym.lines[1]}  [blob ${String((model.byFile[sym.file] || {}).blob || "").slice(0, 7)} · ${BLOB_LABEL[fresh]}${coverageTag(model, sym.file)}]`);
  // A note is shown ONLY while the body still hashes the same. An old
  // sentence about code that has since changed is never printed.
  const note = N.noteFor(model.notes, sym);
  if (note) push(1, "note", note.current ? `  note  ${note.text}  (${note.model} · current)` : "  note: stale (body changed) — it is re-noted at the next batch", { item: "note", ...note });

  const callers = callersOf(model, sym);
  callers.confident.sort((a, b) => (a.sym.file + a.line).localeCompare(b.sym.file + b.line));
  for (const c of callers.confident)
    push(2, "callers", `  ← ${c.ref ? "used by  " : "called by"}  ${c.sym.qname}  ${where(c.sym, c.line)}  ${c.state}`, { item: "caller", id: c.sym.id, qname: c.sym.qname, file: c.sym.file, line: c.line, state: c.state, ...(c.ref ? { ref: true } : {}) });
  if (callers.maybe) push(4, "callers", `  ← maybe      ${callers.maybe} more caller(s) name it among AMBIGUOUS candidates`, { item: "maybe_callers", n: callers.maybe });

  let unresolved = 0;
  const visited = new Set([sym.id]);
  const walk = (s, level, indent) => {
    for (const { call, res } of calleesOf(model, s)) {
      if (res.state === "UNRESOLVED") {
        if (level === 1) unresolved++;
        continue;
      }
      if (res.state === "AMBIGUOUS") {
        if (level > 1) continue;
        const cs = res.candidates.map((id) => model.symbols.get(id)).filter(Boolean);
        const shown = cs.slice(0, 3).map((x) => where(x)).join(", ");
        push(4, "calls", `${indent}→ calls      ${call.name}  AMBIGUOUS (${cs.length}): ${shown}${cs.length > 3 ? `, +${cs.length - 3}` : ""}`, { item: "call", name: call.name, line: call.line, state: "AMBIGUOUS", candidates: cs.map((x) => x.id) });
        continue;
      }
      const target = model.symbols.get(res.target);
      if (!target) continue;
      push(level === 1 ? 2 : 3 + level, "calls", `${indent}→ ${call.ref ? "uses " : "calls"}      ${target.qname}  ${where(target)}  ${res.state}`, { item: "call", name: call.name, line: call.line, state: res.state, target: brief(target), level, ...(call.ref ? { ref: true } : {}) });
      if (level < depth && !visited.has(target.id)) {
        visited.add(target.id);
        const cn = N.noteFor(model.notes, target);
        if (cn && cn.current) push(2 + level, "notes", `${indent}    └ note ${cn.text}`, { item: "callee_note", of: target.id, text: cn.text });
        for (const e of target.effects || []) push(2 + level, "effects", `${indent}    └ effect ${e.type}  "${e.text}"  ${target.file}:${e.line}`, { item: "effect", of: target.id, ...e });
        walk(target, level + 1, indent + "    ");
      }
    }
  };
  walk(sym, 1, "  ");
  for (const e of sym.effects || []) push(1, "effects", `  effect ${e.type}  "${e.text}"  ${sym.file}:${e.line}`, { item: "effect", of: sym.id, ...e });

  const wiki = opts.wikiDocsFor ? opts.wikiDocsFor([sym.file]) : [];
  if (wiki.length) push(6, "wiki", `  wiki  ${wiki.join(", ")}`, { item: "wiki", docs: wiki });
  const tests = [...new Set(callers.confident.filter((c) => TEST_FILE.test(c.sym.file)).map((c) => c.sym.file))];
  if (tests.length) push(5, "tests", `  tests ${tests.join(", ")}`, { item: "tests", files: tests });

  const footer = (used, hidden) => `  budget ${used}/${budget} tokens${unresolved ? ` · ${unresolved} unresolved call(s) not shown` : ""}${hiddenText(hidden)}`;
  const f = fit(items, budget, footer);
  const kept = items.filter((_, i) => f.kept.has(i)).map((it) => it.data).filter(Boolean);
  return {
    ok: true,
    state: "found",
    target: brief(sym),
    blob: fresh,
    exported: sym.exported,
    note: note || null,
    callers: kept.filter((d) => d.item ==="caller"),
    maybe_callers: callers.maybe,
    calls: kept.filter((d) => d.item ==="call"),
    effects: kept.filter((d) => d.item ==="effect"),
    wiki,
    tests,
    unresolved,
    hidden: f.hidden,
    budget: { used: f.used, max: budget },
    card: f.card,
    exit: 0,
  };
}

function importersOf(model, rel) {
  const out = [];
  for (const other of model.fileSet) {
    if (other === rel) continue;
    const { map, includes } = fileBindings(model, other);
    let hit = includes.includes(rel);
    if (!hit) for (const bd of map.values()) if (bd.files.includes(rel)) { hit = true; break; }
    if (!hit) for (const imp of (model.byFile[other].imports || [])) if (!(imp.bindings || []).length && importTargets(model, other, model.byFile[other].lang, imp).includes(rel)) { hit = true; break; }
    if (hit) out.push(other);
  }
  return out;
}

function fileCard(model, rel, budget, opts) {
  const f = model.byFile[rel];
  const fresh = blobState(model, rel);
  const items = [];
  const push = (pri, section, text, data) => items.push({ pri, section, text, data });
  const tree = opts.format === "tree";
  const allSyms = (f.symbols || []).filter((s) => s.kind !== "module");
  push(0, "header", `${rel}  (${allSyms.length} symbols)  [blob ${String(f.blob).slice(0, 7)} · ${BLOB_LABEL[fresh]}${coverageTag(model, rel)}]`);
  // E7: ordered by IMPORTANCE, not by raw fan-in. A private helper called from
  // forty places is not more useful to a reader than the exported entry point
  // called from three, and a card that leads with the helper buries the answer.
  const SIG = require("./graph-signals.js");
  const allRows = allSyms.map((s) => {
    const fanIn = callersOf(model, s).confident.length;
    return { s, fanIn, imp: SIG.importance(model, s, fanIn) };
  });
  allRows.sort((a, b) => b.imp - a.imp || b.fanIn - a.fanIn || a.s.lines[0] - b.s.lines[0]);
  // `--offset` pages the SYMBOL rows. Paging is not truncation: `has_more` says
  // there is a next page, and the budget footer still says what it hid.
  const offset = Math.max(0, Number(opts.offset) || 0);
  const rows = allRows.slice(offset);
  const syms = rows.map((r) => r.s);
  // Both bodies are built, and the SMALLER one is printed. A column header and
  // a directory line are FIXED costs: on a three-row card they cost more than
  // the columns save, which is exactly what the first measurement showed. So
  // `--format tree` means "use the tree WHEN it is smaller", and the answer says
  // which one it used. It can never be worse than the prose card.
  const symRows = rows.map(({ s, fanIn, imp }) => ({
    prose: `  ${s.kind.padEnd(8)} ${s.qname}  :${s.lines[0]}-${s.lines[1]}${s.exported ? "  exported" : ""}  fan-in ${fanIn}`,
    tree: `  ${shortKind(s.kind)} ${s.qname} ${s.lines[0]}-${s.lines[1]} ${s.exported ? "E" : "-"} ${fanIn}`,
    data: { item: "symbol", ...brief(s), fan_in: fanIn, importance: imp },
  }));
  const SYM_HEAD = "  kind name lines exp fan-in";
  const useTree =
    tree && symRows.length > 0 &&
    SYM_HEAD.length + symRows.reduce((a, r) => a + r.tree.length, 0) < symRows.reduce((a, r) => a + r.prose.length, 0);
  if (useTree) push(1, "symbols", SYM_HEAD);
  for (const r of symRows) push(2, "symbols", useTree ? r.tree : r.prose, r.data);
  const imports = [...new Set((f.imports || []).flatMap((imp) => importTargets(model, rel, f.lang, imp)))];
  const importers = importersOf(model, rel);
  if (useTree) {
    const pre = dirPrefix([...imports, ...importers]);
    const strip = (a) => a.map((x) => (pre && x.startsWith(pre) ? x.slice(pre.length) : x));
    if (pre) push(3, "imports", `  dir ${pre}`, null);
    if (imports.length) push(3, "imports", `  in  ${strip(imports).join(" ")}`, { item: "imports", files: imports });
    if (importers.length) push(3, "importers", `  out ${strip(importers).join(" ")}`, { item: "importers", files: importers });
  } else {
    if (imports.length) push(3, "imports", `  imports     ${imports.join(", ")}`, { item: "imports", files: imports });
    if (importers.length) push(3, "importers", `  imported by ${importers.join(", ")}`, { item: "importers", files: importers });
  }
  // E7: the tests that reach this file — by CALL (an edge into one of its
  // symbols from a test file) and by NAME (`x.test.js` beside `x.js`). Both,
  // because a test that imports a module without naming a symbol is still its
  // test, and the graph alone would never find it.
  const fileTests = [
    ...new Set([
      ...allSyms.flatMap((sym) => callersOf(model, sym).confident.map((c) => c.sym.file)).filter((x) => TEST_FILE.test(x)),
      ...importers.filter((x) => TEST_FILE.test(x)),
      ...SIG.testsByName(model, rel),
    ]),
  ].sort();
  if (fileTests.length) push(4, "tests", `  tests ${fileTests.join(useTree ? " " : ", ")}`, { item: "tests", files: fileTests });
  const wiki = opts.wikiDocsFor ? opts.wikiDocsFor([rel]) : [];
  if (wiki.length) push(5, "wiki", `  wiki ${wiki.join(useTree ? " " : ", ")}`, { item: "wiki", docs: wiki });
  const footer = (used, hidden) => `  budget ${used}/${budget} tokens${hiddenText(hidden)}`;
  const fitted = fit(items, budget, footer);
  const kept = items.filter((_, i) => fitted.kept.has(i)).map((it) => it.data).filter(Boolean);
  const keptSymbols = kept.filter((d) => d.item === "symbol");
  return {
    ok: true,
    state: "found",
    format: useTree ? "tree" : "prose",
    offset,
    has_more: offset + keptSymbols.length < allRows.length,
    total_symbols: allRows.length,
    file: rel,
    blob: fresh,
    symbols: kept.filter((d) => d.item ==="symbol"),
    tests: fileTests,
    imports,
    importers,
    wiki,
    hidden: fitted.hidden,
    budget: { used: fitted.used, max: budget },
    card: fitted.card,
    exit: 0,
  };
}

// ── impact ──────────────────────────────────────────────────────────────────
function impact(model, files, opts) {
  const depth = Math.max(1, Math.min(6, Number(opts.depth) || 3));
  const budget = Math.max(100, Math.min(8000, Number(opts.budget) || 1500));
  const rels = [...new Set(files.map(norm))].filter((f) => model.fileSet.has(f));
  const missing = files.map(norm).filter((f) => !model.fileSet.has(f));
  if (!rels.length) return { ok: false, state: "not-found", missing, exit: 4 };
  const targets = rels.flatMap((r) => (model.byFile[r].symbols || []).filter((s) => s.kind !== "module"));
  const inTargets = new Set(targets.map((s) => s.id));
  const seen = new Map();
  let frontier = targets;
  let maybe = 0;
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next = [];
    for (const t of frontier) {
      const c = callersOf(model, t);
      if (d === 1) maybe += c.maybe;
      for (const row of c.confident) {
        if (inTargets.has(row.sym.id) || seen.has(row.sym.id)) continue;
        seen.set(row.sym.id, { sym: row.sym, depth: d, line: row.line, state: row.state, via: t.qname });
        if (row.sym.kind !== "module") next.push(row.sym);
      }
    }
    frontier = next;
  }
  const hits = [...seen.values()].sort(
    (a, b) => a.depth - b.depth || a.sym.file.localeCompare(b.sym.file) || a.line - b.line || String(a.sym.id).localeCompare(String(b.sym.id))
  );
  const importerTests = rels.flatMap((r) => importersOf(model, r)).filter((f) => TEST_FILE.test(f));
  const SIG = require("./graph-signals.js");
  const tests = [
    ...new Set([
      ...hits.filter((h) => TEST_FILE.test(h.sym.file)).map((h) => h.sym.file),
      ...importerTests,
      ...rels.flatMap((r) => SIG.testsByName(model, r)),
    ]),
  ].sort();
  const touched = [...new Set([...rels, ...hits.map((h) => h.sym.file)])];
  const wiki = opts.wikiDocsFor ? opts.wikiDocsFor(touched) : [];

  const tree = opts.format === "tree";
  const offset = Math.max(0, Number(opts.offset) || 0);
  const page = hits.slice(offset);
  const items = [];
  const push = (pri, section, text, data) => items.push({ pri, section, text, data });
  push(0, "header", `impact of ${rels.join(", ")} — ${targets.length} symbols · depth ${depth}`);
  // The same never-worse rule as the file card. The fixed cost here is a column
  // header PLUS a directory line, so a two-row impact card stays prose.
  const pre = dirPrefix(page.map((h) => h.sym.file));
  const CALL_HEAD = "  d qname file:line state via";
  const callRows = page.map((h) => {
    const file = pre && h.sym.file.startsWith(pre) ? h.sym.file.slice(pre.length) : h.sym.file;
    return {
      pri: h.depth,
      prose: `  d${h.depth}  ${h.sym.qname}  ${where(h.sym, h.line)}  ${h.state}  (via ${h.via})`,
      tree: `  ${h.depth} ${h.sym.qname} ${file}:${h.line || h.sym.lines[0]} ${STATE_SHORT[h.state] || h.state} ${h.via}`,
      data: { item: "caller", depth: h.depth, ...brief(h.sym), line: h.line, state: h.state, via: h.via },
    };
  });
  const fixed = CALL_HEAD.length + (pre ? pre.length + 6 : 0);
  const useTree =
    tree && callRows.length > 0 &&
    fixed + callRows.reduce((a, r) => a + r.tree.length, 0) < callRows.reduce((a, r) => a + r.prose.length, 0);
  if (useTree) {
    if (pre) push(1, "callers", `  dir ${pre}`, null);
    push(1, "callers", CALL_HEAD);
  }
  for (const r of callRows) push(r.pri, "callers", useTree ? r.tree : r.prose, r.data);
  const j = useTree ? " " : ", ";
  if (tests.length) push(1, "tests", `  tests${useTree ? "" : " "} ${tests.join(j)}`, { item: "tests" });
  if (wiki.length) push(2, "wiki", `  wiki${useTree ? "" : "  "} ${wiki.join(j)}`, { item: "wiki" });
  if (maybe) push(2, "maybe", useTree ? `  maybe ${maybe} ambiguous, not followed` : `  maybe  ${maybe} AMBIGUOUS caller(s) not followed`, { item: "maybe" });
  if (missing.length) push(1, "missing", useTree ? `  absent ${missing.join(" ")}` : `  not in the graph: ${missing.join(", ")}`, { item: "missing" });
  const footer = (used, hidden) => `  budget ${used}/${budget} tokens${hiddenText(hidden)}`;
  const f = fit(items, budget, footer);
  const kept = items.filter((_, i) => f.kept.has(i)).map((it) => it.data).filter(Boolean);
  const keptCallers = kept.filter((d) => d.item === "caller");
  return {
    ok: true,
    state: "found",
    format: useTree ? "tree" : "prose",
    offset,
    has_more: offset + keptCallers.length < hits.length,
    files: rels,
    missing,
    symbols: targets.length,
    callers: kept.filter((d) => d.item ==="caller"),
    total_callers: hits.length,
    maybe_callers: maybe,
    tests,
    wiki,
    hidden: f.hidden,
    budget: { used: f.used, max: budget },
    card: f.card,
    exit: 0,
  };
}

// ── path ────────────────────────────────────────────────────────────────────
function pathBetween(model, fromQ, toQ) {
  const a = findTarget(model, fromQ);
  const b = findTarget(model, toQ);
  if (a.kind !== "symbol" || b.kind !== "symbol") {
    return { ok: false, state: "not-found", from: a.kind, to: b.kind, candidates: [...(a.candidates || []), ...(b.candidates || [])].map(brief), exit: 4 };
  }
  const prev = new Map([[a.sym.id, null]]);
  let frontier = [a.sym];
  for (let d = 0; d < 8 && frontier.length && !prev.has(b.sym.id); d++) {
    const next = [];
    for (const s of frontier) {
      for (const { call, res } of calleesOf(model, s)) {
        if (!CONFIDENT.has(res.state) || prev.has(res.target)) continue;
        const t = model.symbols.get(res.target);
        if (!t) continue;
        prev.set(t.id, { from: s, line: call.line, state: res.state });
        next.push(t);
      }
    }
    frontier = next;
  }
  if (!prev.has(b.sym.id)) return { ok: true, state: "none", from: brief(a.sym), to: brief(b.sym), exit: 4, card: `no confident call path from ${a.sym.qname} to ${b.sym.qname} (AMBIGUOUS edges are not followed)` };
  const chain = [];
  for (let id = b.sym.id; id; ) {
    const p = prev.get(id);
    chain.unshift({ sym: model.symbols.get(id), step: p });
    id = p ? p.from.id : null;
  }
  const lines = chain.map((c, i) => (i === 0 ? `${c.sym.qname}  ${where(c.sym)}` : `  → ${c.sym.qname}  ${where(c.sym)}  ${c.step.state}  (called at ${where(c.step.from, c.step.line)})`));
  return {
    ok: true,
    state: "found",
    hops: chain.length - 1,
    chain: chain.map((c) => ({ ...brief(c.sym), state: c.step ? c.step.state : null, called_at: c.step ? where(c.step.from, c.step.line) : null })),
    card: lines.join("\n"),
    exit: 0,
  };
}

// EW2, for the resolution cache only: which files this one's import specifiers
// actually reach, and whether any RELATIVE specifier reaches nothing. A file
// added later can only ever satisfy a relative specifier, so that flag is the
// complete set of files an addition can move.
function importsOf(model, rel) {
  const f = model.byFile[rel] || {};
  const files = new Set();
  let unresolvedRelative = false;
  for (const imp of f.imports || []) {
    const t = importTargets(model, rel, f.lang, imp);
    for (const x of t) files.add(x);
    if (!t.length && /^\.{1,2}\//.test(String(imp.from || ""))) unresolvedRelative = true;
  }
  return { files: [...files].sort(), unresolvedRelative };
}

module.exports = { loadModel, resolveCall, findTarget, callersOf, ctx, impact, pathBetween, importsOf, TEST_FILE };
