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
//   ROUTE       (v1.8.2 W1) a URL literal reaches exactly one route symbol — the
//               mount chain is known and the full path matches, or the path's tail
//               matches one route and no other
//   (EXACT is reserved for a type-checker-backed resolution; nothing emits it yet.)
//
// Every read is BUDGETED. A card never exceeds its budget and always says what
// it hid — a graph tool that returned 33K tokens is the failure this prevents.
//
// v1.8.2 W1 — URLS ARE EDGES. R3-C measured the defect: a card listed every
// caller that NAMED a symbol and declared eleven route-level tests absent. They
// reached it through `request(app).get("/orders/search")`. The extractor now
// records every URL literal a symbol sends (`urls[]`) and every mount
// (`mounts[]`); this file resolves a URL to a route symbol on read:
//   full path = the mount chain's prefix (followed across files, depth ≤ 4,
//   exactly one chain) + the route's own path, with `:id` `{id}` `<id>` `[id]`
//   as one segment and `*` as anything; trailing slash optional; query stripped.
//   A URL whose prefix is unknown (`BASE + "/p"`) matches by its tail.

const fs = require("fs");
const path = require("path");
const posix = path.posix;
const { spawnSync } = require("child_process");
const G = require("./graph.js");
const N = require("./graph-notes.js");

const CONFIDENT = new Set(["LOCAL", "IMPORT", "UNIQUE", "ROUTE"]);
const MOUNT_DEPTH = 4;
// W5 (G6) adds the five new languages' own conventions: RSpec and minitest
// (`_spec.rb`, `_test.rb`), Rust (`*_test.rs`, and `mod tests` lives inside
// the file it tests, which no path pattern can see), Kotlin (`*Test.kt`,
// `*Spec.kt`) and a `*_test.cpp` beside its unit.
const TEST_FILE = /(^|\/)(tests?|__tests__|specs?)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rs|c|cc|cpp)$|(^|\/)test_[^/]*\.py$|Tests?\.(java|cs)$|Test\.php$|_(spec|test)\.rb$|(Test|Spec)\.kts?$/;
const JS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte"];
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
  // S2: the writer hands over the index it holds; a reader parses the file.
  const index = (opts && opts.index) || readJson(p.index);
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
    // W1: the route table and the URL memo, both built on first use.
    routes: null,
    urlIndex: null,
    urlMemo: new Map(),
    // S3: blob freshness, batched by `warmBlobs` (one git call per read).
    blobStates: new Map(),
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

// W5 (G6). Every file whose DIRECTORY ends with this package path — Kotlin
// names a package, not a file, and a Kotlin file name need not match its class.
function filesInPackage(model, pkg, ext) {
  if (!pkg) return [];
  const key = `pkg\0${pkg}\0${ext}`;
  if (model.suffix.has(key)) return model.suffix.get(key);
  const out = [];
  for (const f of model.fileSet) {
    if (!f.endsWith(ext)) continue;
    const d = posix.dirname(f);
    if (d === pkg || d.endsWith("/" + pkg)) out.push(f);
  }
  model.suffix.set(key, out);
  return out;
}

// W5 (G6). `mod store;` is a sibling file or a folder with `mod.rs`;
// `use crate::store::OrderStore` names a path from the crate root.
function resolveRs(model, from, imp) {
  const dir = posix.dirname(from);
  const spec = imp.from || "";
  if (imp.mod) {
    for (const c of [`${dir}/${spec}.rs`, `${dir}/${spec}/mod.rs`]) if (model.fileSet.has(c)) return [c];
    return [];
  }
  const parts = spec.split("::").filter(Boolean);
  if (!parts.length) return [];
  // An integration test under `tests/` names the crate by its PACKAGE name,
  // not by `crate` — the same fact `go.mod` carries for Go.
  if (model.rustCrate === undefined) {
    model.rustCrate = null;
    try {
      const mm = /^\s*name\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(model.root, "Cargo.toml"), "utf8"));
      if (mm) model.rustCrate = mm[1].replace(/-/g, "_");
    } catch (_) {}
  }
  let base = parts;
  if (parts[0] === "crate" || parts[0] === "self" || (model.rustCrate && parts[0] === model.rustCrate)) base = parts.slice(1);
  else if (parts[0] === "super") {
    const up = posix.dirname(dir);
    base = parts.slice(1);
    const p = [up === "." ? "" : up, ...base].filter(Boolean).join("/");
    for (const c of [`${p}.rs`, `${p}/mod.rs`]) if (model.fileSet.has(c)) return [c];
    return [];
  } else return []; // an external crate
  const p = base.join("/");
  for (const c of [`${p}.rs`, `${p}/mod.rs`, `src/${p}.rs`, `src/${p}/mod.rs`]) if (model.fileSet.has(c)) return [c];
  const a = bySuffix(model, `${p}.rs`);
  return a.length ? a : bySuffix(model, `${p}/mod.rs`);
}

function importTargets(model, from, lang, imp) {
  const spec = imp.from || "";
  if (lang === "js" || lang === "ts" || lang === "vue" || lang === "svelte") return resolveJs(model, from, spec);
  if (lang === "rb") {
    if (imp.include) {
      const rel = posix.normalize(posix.join(posix.dirname(from), spec));
      const hit = [rel, `${rel}.rb`].find((c) => model.fileSet.has(c));
      if (hit) return [hit];
    }
    return bySuffix(model, /\.rb$/.test(spec) ? spec : `${spec}.rb`);
  }
  if (lang === "rs") return resolveRs(model, from, imp);
  if (lang === "kt") {
    const parts = spec.split(".");
    const last = parts[parts.length - 1];
    const pkg = parts.slice(0, -1).join("/");
    // `import a.b.OrderStore` — the file is usually `OrderStore.kt`, but a
    // Kotlin file may hold several classes, so the package folder is the
    // fallback, never a guess at a same-named file anywhere in the tree.
    if (imp.star) return filesInPackage(model, spec.replace(/\./g, "/"), ".kt");
    const byFile = bySuffix(model, `${pkg ? pkg + "/" : ""}${last}.kt`);
    return byFile.length ? byFile : filesInPackage(model, pkg, ".kt");
  }
  if (lang === "c") {
    const rel = posix.normalize(posix.join(posix.dirname(from), spec));
    return model.fileSet.has(rel) ? [rel] : bySuffix(model, spec.replace(/^(\.\.?\/)+/, ""));
  }
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

// ── W2 (G4): barrels ────────────────────────────────────────────────────────
// `import { OrderService } from "./orders"` reaches `orders/index.ts`, which
// defines nothing and re-exports. Follow its re-exports (depth ≤ 3, cycle-safe)
// to every file that may define `name`, remembering the name it is defined
// under there (`export { a as b }` renames). The head of the list is always
// the file the import named, so a barrel that DOES define the name still wins.
const BARREL_DEPTH = 3;
function barrelTargets(model, files, name, depth, seen) {
  const out = [];
  for (const file of files) {
    const k = `${file}\0${name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ file, name });
    if (depth >= BARREL_DEPTH) continue;
    const f = model.byFile[file] || {};
    for (const rx of f.reexports || []) {
      let orig = null;
      if (rx.names === "*") orig = name;
      else {
        const hitName = (rx.names || []).find((n) => n.local === name);
        if (hitName) orig = hitName.orig;
      }
      if (orig == null) continue;
      const targets = importTargets(model, file, f.lang, { from: rx.from });
      out.push(...barrelTargets(model, targets, orig, depth + 1, seen));
    }
  }
  return out;
}

// ── W2 (G3): inherited members ──────────────────────────────────────────────
// The class named `name` as seen from `rel`: in this file (LOCAL), through an
// import (IMPORT, barrels followed), or the only class of that name (UNIQUE).
function classSymbol(model, rel, name) {
  const f = model.byFile[rel] || {};
  const local = (f.symbols || []).find((s) => s.kind === "class" && s.name === name);
  if (local) return { sym: local, state: "LOCAL" };
  const bd = fileBindings(model, rel).map.get(name);
  if (bd && bd.files.length) {
    for (const t of barrelTargets(model, bd.files, bd.orig === "default" || bd.orig === "*" ? name : bd.orig, 0, new Set())) {
      const s = ((model.byFile[t.file] || {}).symbols || []).find((x) => x.kind === "class" && x.name === t.name);
      if (s) return { sym: s, state: "IMPORT" };
    }
    // W5b: a DEFAULT import names the file's default export, whatever the
    // importer calls it (`import FM from "./formMixin"`). When that file holds
    // exactly one exported class, it is the one.
    if (bd.orig === "default") {
      const only = ((model.byFile[bd.files[0]] || {}).symbols || []).filter((x) => x.kind === "class" && x.exported);
      if (only.length === 1) return { sym: only[0], state: "IMPORT" };
    }
  }
  if (f.lang === "go") {
    const s = filesInDir(model, posix.dirname(rel), ".go").flatMap((x) => ((model.byFile[x] || {}).symbols || []).filter((y) => y.kind === "class" && y.name === name));
    if (s.length === 1) return { sym: s[0], state: "LOCAL" };
  }
  const all = (model.byName.get(name) || []).filter((s) => s.kind === "class");
  if (all.length === 1) return { sym: all[0], state: "UNIQUE" };
  return null;
}

// `this.m()` in a class with no `m` of its own: walk the base chain (depth ≤
// 4, ≤ 8 bases per class, cycle-safe) and return the base member with the
// state the BASE CLASS resolved with from the subclass's file.
const INHERIT_DEPTH = 4;
function inheritedMember(model, rel, className, member, depth, seen) {
  if (depth > INHERIT_DEPTH) return null;
  const own = classSymbol(model, rel, className);
  if (!own) return null;
  for (const base of (own.sym.bases || []).slice(0, 8)) {
    if (seen.has(base)) continue;
    seen.add(base);
    const b = classSymbol(model, own.sym.file, base);
    if (!b) continue;
    const mem = ((model.byFile[b.sym.file] || {}).symbols || []).find((s) => s.kind !== "module" && s.name === member && classOf(s) && classOf(s).split(".").pop() === b.sym.name);
    if (mem) return { sym: mem, state: b.state };
    const deeper = inheritedMember(model, b.sym.file, b.sym.name, member, depth + 1, seen);
    if (deeper) return deeper;
  }
  return null;
}

function resolveCall(model, rel, caller, call) {
  const cls = caller ? classOf(caller) : null;
  const key = `${rel}\0${cls || ""}\0${call.name}\0${call.self ? 1 : 0}\0${call.ref ? 1 : 0}\0${call.sup ? 1 : 0}\0${call.alias ? 1 : 0}`;
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

  // `super.m()` never resolves to the class's own member.
  if (!call.sup && !head && locals.length) {
    const same = call.self && cls ? locals.find((s) => classOf(s) === cls) : null;
    // W2: a self call on a class that has no such member is not a local
    // function of the same name — it is inherited, or nothing.
    const pick = same || (call.self && cls ? null : locals.find((s) => !classOf(s) || !call.self) || locals[0]);
    if (pick) r = hit("LOCAL", pick);
  }
  if (!r && !call.sup && head) {
    const m2 = locals.filter((s) => s.qname === `${head}.${last}` || s.qname.endsWith(`.${head}.${last}`));
    if (m2.length) r = hit("LOCAL", m2[0]);
  }
  // W2 (G3): a self call with no own member walks the base chain.
  if (!r && call.self && !head && cls) {
    const inh = inheritedMember(model, rel, cls.split(".").pop(), last, 0, new Set());
    if (inh) r = { state: inh.state, target: inh.sym.id, inherited: true };
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
      // W2 (G4): the files the binding names, and every file a barrel among
      // them re-exports the name from — with the name it carries there.
      const wanted = bd.kind === "named" ? bd.orig : bd.local;
      const pairs = barrelTargets(model, bd.files, wanted, 0, new Set());
      let s = null;
      for (const pair of pairs) {
        const tsyms = ((model.byFile[pair.file] || {}).symbols || []).filter((x) => x.kind !== "module");
        const orig = bd.kind === "named" ? pair.name : bd.orig;
        const localName = bd.kind === "named" ? pair.name : pair.name;
        if (head) {
          s =
            tsyms.find((x) => x.qname === `${orig}.${last}` || x.qname === `${localName}.${last}`) ||
            (bd.kind === "namespace" || bd.kind === "default" ? tsyms.find((x) => x.name === last && !classOf(x)) : null) ||
            tsyms.find((x) => x.name === last && x.qname.startsWith(orig + "."));
        } else if (bd.kind === "named") {
          s = tsyms.find((x) => x.qname === orig) || tsyms.find((x) => x.name === orig && !classOf(x));
        } else {
          const exported = tsyms.filter((x) => x.exported && !classOf(x));
          s = tsyms.find((x) => x.qname === localName) || (exported.length === 1 ? exported[0] : null);
        }
        if (s) break;
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
  // A file this one INCLUDES by path names its symbols directly — a bare name
  // (PHP, C) and, since W5, a member of a class declared in that header.
  if (!r && includes.length) {
    const s = includes.flatMap((t) => ((model.byFile[t] || {}).symbols || []).filter((x) => x.kind !== "module" && (head ? x.qname === `${head}.${last}` : x.name === last && !classOf(x))))[0];
    if (s) r = hit("IMPORT", s);
  }
  // W1: Go's package scope is the DIRECTORY. A bare name defined in a sibling
  // `.go` file is as local as one in this file — no import names it, and the
  // UNIQUE rung would call a second `New` elsewhere in the module ambiguous.
  // W5 (G6) gives Rust, Kotlin and C/C++ the same rung, for the same reason: a
  // `mod` sibling, a class in the same Kotlin package, and a translation unit
  // beside this one are all named without an import.
  const DIR_SCOPE = { go: ".go", rs: ".rs", kt: ".kt", c: ".cpp" };
  if (!r && DIR_SCOPE[lang] && (!head || call.alias)) {
    const isTest = /_test\.go$/.test(rel);
    const exts = lang === "c" ? [".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".hh"] : [DIR_SCOPE[lang]];
    const s = exts
      .flatMap((e) => filesInDir(model, posix.dirname(rel), e))
      .filter((f) => f !== rel && (isTest || !/_test\.go$/.test(f)))
      .flatMap((f) => ((model.byFile[f] || {}).symbols || []).filter((x) => x.kind !== "module" && (head ? x.qname === `${head}.${last}` : x.name === last && !classOf(x))));
    if (s.length === 1) r = hit("LOCAL", s[0]);
  }
  // W5 (G6). C++ reaches a member — its own, or one it inherits — with no
  // `this->`. Every rung above has already run, so a free function of that
  // name still wins; this is the last step before the repository-wide guess.
  if (!r && !head && !call.self && lang === "c" && cls) {
    const own = (f.symbols || []).find((s) => s.name === last && classOf(s) === cls);
    if (own) r = hit("LOCAL", own);
    else {
      const inh = inheritedMember(model, rel, cls.split(".").pop(), last, 0, new Set());
      if (inh) r = { state: inh.state, target: inh.sym.id, inherited: true };
    }
  }
  if (!r) {
    // W1: a bare `get(…)` is never a class METHOD — a method is reached through
    // a receiver, `this`, or inheritance. Before this, `request(app).get("/p")`
    // resolved UNIQUE to the only method named `get` in the repository.
    const all = model.byName.get(last) || [];
    const cands = head || call.self ? all : all.filter((s) => !classOf(s));
    if (head) {
      const hl = head.toLowerCase();
      const byClass = cands.filter((s) => {
        const c = classOf(s);
        return c && c.split(".").pop().toLowerCase() === hl;
      });
      if (byClass.length === 1) r = hit("UNIQUE", byClass[0]);
      else if (byClass.length > 1) r = { state: "AMBIGUOUS", candidates: byClass.map((s) => s.id) };
      // W2 (G2): the head came from an alias, so it IS a class name. A class
      // named `Router` with no `get` is not "some `get` somewhere" — it is
      // outside this repository (an external package), and saying AMBIGUOUS
      // over every `get` in the tree was the nestjs/nest 118-maybe noise.
      else if (call.alias) r = { state: "UNRESOLVED", external: head };
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

// ── W1: routes and URLs ─────────────────────────────────────────────────────
const PARAM_SEG = /:\w+\??|\{[^}]*\}|<[^>]*>|\[[^\]]*\]/g;
const isLiteralPath = (p) => !/[:{<\[*]/.test(p);

// A route path → a regular expression over a URL path. One segment per
// parameter, `*` is anything, the trailing slash is optional.
function pathSource(p) {
  const s = String(p).replace(/\/+$/, "");
  return s
    .split("/")
    .map((seg) => {
      if (seg === "*" || seg === "**") return ".*";
      let out = "";
      let last = 0;
      for (const mm of seg.matchAll(PARAM_SEG)) {
        out += seg.slice(last, mm.index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (mm[0].endsWith("?") ? "[^/]*" : "[^/]+");
        last = mm.index + mm[0].length;
      }
      out += seg.slice(last).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
      return out;
    })
    .join("/");
}

const joinPrefix = (a, b) => (String(a || "") + "/" + String(b || "")).replace(/\/{2,}/g, "/").replace(/\/+$/, "");

// Which files a mount's TARGET names: an import binding (`ordersRouter`,
// `orders.router`), an inline `require("./x")`, a Django `include("a.urls")`.
function mountTargets(model, rel, mt) {
  const f = model.byFile[rel] || {};
  const lang = f.lang;
  const t = String(mt.target || "");
  if (!t) return [];
  if (mt.module) return lang === "py" ? resolvePy(model, rel, t) : resolveJs(model, rel, t);
  if (/^[./]/.test(t)) return lang === "py" ? resolvePy(model, rel, t) : resolveJs(model, rel, t);
  const head = t.split(".")[0];
  const bd = fileBindings(model, rel).map.get(head);
  if (!bd) return [];
  // `from app.routers import orders` + `orders.router`: the binding names a
  // MODULE, and the package `__init__.py` it also resolves to is not the file
  // that holds the router.
  if (lang === "py" && bd.kind === "named" && t.includes(".")) {
    const sub = resolvePy(model, rel, `${bd.from}.${bd.orig}`);
    if (sub.length) return sub;
  }
  if (bd.files.length) return bd.files;
  if (lang === "py" && bd.kind === "named") return resolvePy(model, rel, `${bd.from}.${bd.orig}`);
  return [];
}

// file → the mounts that reach it, built once per model.
function mountsInto(model) {
  if (model.mountsInto) return model.mountsInto;
  const into = new Map();
  for (const [rel, f] of Object.entries(model.byFile)) {
    for (const s of f.symbols || []) {
      for (const mt of s.mounts || []) {
        for (const target of mountTargets(model, rel, mt)) {
          const a = into.get(target) || [];
          a.push({ prefix: mt.prefix || "", from: rel });
          into.set(target, a);
        }
      }
    }
  }
  model.mountsInto = into;
  return into;
}

// Every full prefix under which `rel` is reachable, following mounts across
// files. Exactly one is a KNOWN mount; none means unmounted (the route's own
// path is the full path); several means the file is mounted more than once.
function prefixesOf(model, rel, depth, seen) {
  const ins = mountsInto(model).get(rel) || [];
  if (!ins.length || depth >= MOUNT_DEPTH) return [""];
  const out = new Set();
  for (const m of ins) {
    if (seen.has(m.from)) continue;
    for (const p of prefixesOf(model, m.from, depth + 1, new Set([...seen, rel]))) out.add(joinPrefix(p, m.prefix));
  }
  return out.size ? [...out] : [""];
}

function routeTable(model) {
  if (model.routes) return model.routes;
  const rows = [];
  for (const s of model.symbols.values()) {
    if (s.kind !== "route") continue;
    const mm = /^([A-Z]+) (.+)$/.exec(s.name);
    if (!mm) continue;
    const own = mm[2];
    const prefixes = prefixesOf(model, s.file, 0, new Set());
    const full = prefixes.length === 1 ? joinPrefix(prefixes[0], own) || "/" : null;
    rows.push({
      sym: s,
      method: mm[1],
      own,
      full,
      mounted: prefixes.length === 1 ? (prefixes[0] ? "known" : "none") : "ambiguous",
      literal: isLiteralPath(own) && (full == null || isLiteralPath(full)),
      reFull: full != null ? new RegExp("^" + pathSource(full) + "/?$") : null,
      reTail: new RegExp("(^|/)" + pathSource(own) + "/?$"),
    });
  }
  model.routes = rows;
  return rows;
}

const methodOk = (a, b) => a === "ANY" || b === "ANY" || a === b;

// A URL (with its method) → the route it reaches. Order: an exact literal full
// path; a full-path pattern; the path's TAIL against every route's own path
// (a suffix URL, or a route whose mount is unknown). One candidate → ROUTE;
// several → AMBIGUOUS with all of them; none → UNRESOLVED.
function resolveUrl(model, u) {
  const method = String(u.method || "ANY").toUpperCase();
  const url = String(u.url || "").split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const key = `${method} ${url} ${u.suffix ? 1 : 0}`;
  if (model.urlMemo.has(key)) return model.urlMemo.get(key);
  const cands = routeTable(model).filter((r) => methodOk(r.method, method));
  const pick = (list) => {
    const lit = list.filter((r) => r.literal);
    return lit.length ? lit : list;
  };
  let found = [];
  let mount = "known";
  if (!u.suffix) found = pick(cands.filter((r) => r.reFull && r.reFull.test(url)));
  if (!found.length) {
    found = pick(cands.filter((r) => r.reTail.test(url)));
    mount = "unknown";
  }
  let r;
  if (found.length === 1) r = { state: "ROUTE", target: found[0].sym.id, ...(mount === "unknown" ? { mount } : {}) };
  else if (found.length > 1) r = { state: "AMBIGUOUS", candidates: found.map((x) => x.sym.id) };
  else r = { state: "UNRESOLVED" };
  model.urlMemo.set(key, r);
  return r;
}

// Every URL any symbol sends, once per model.
function urlIndex(model) {
  if (model.urlIndex) return model.urlIndex;
  const rows = [];
  for (const [rel, f] of Object.entries(model.byFile)) for (const s of f.symbols || []) for (const u of s.urls || []) rows.push({ rel, sym: s, u });
  model.urlIndex = rows;
  return rows;
}

// Who calls `target`: confident callers, and a count of AMBIGUOUS ones that
// list it among their candidates. A route symbol is also REACHED by URL (W1).
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
      confident.push({
        sym,
        line: r[1],
        state: r[2],
        ...(r[3] === 1 ? { ref: true } : {}),
        ...(r[3] === 2 && r[4] ? { url: r[4] } : {}),
        ...(r[3] === 3 ? { inherited: true } : {}),
        ...(r[3] === 0 && r[4] ? { alias: r[4] } : {}),
      });
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
      const k = `${row.sym.id} ${row.call.line}`;
      if (seen.has(k)) continue;
      seen.add(k);
      confident.push({
        sym: row.sym,
        line: row.call.line,
        state: r.state,
        ...(row.call.ref ? { ref: true } : {}),
        ...(r.inherited ? { inherited: true } : {}),
        ...(!row.call.ref && !r.inherited && row.call.alias ? { alias: row.call.alias } : {}),
      });
    } else if (r.state === "AMBIGUOUS" && r.candidates.includes(target.id)) maybe++;
  }
  if (target.kind === "route") {
    for (const row of urlIndex(model)) {
      const r = resolveUrl(model, row.u);
      if (r.state === "ROUTE" && r.target === target.id) {
        const k = `${row.sym.id} ${row.u.line}`;
        if (seen.has(k)) continue;
        seen.add(k);
        confident.push({ sym: row.sym, line: row.u.line, state: "ROUTE", url: `${row.u.method} ${row.u.url}` });
      } else if (r.state === "AMBIGUOUS" && r.candidates.includes(target.id)) maybe++;
    }
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
  // S1 (v1.8.2 W8): on the sharded fast path the resolutions were computed by
  // the update and stored, so this loop reads instead of resolving. The DEDUPE
  // and the order are unchanged — the rows are keyed by the call's INDEX, so
  // the same calls survive in the same order and the card is the same bytes.
  const fwd = model.callsFor ? model.callsFor(sym) : null;
  const stored = fwd ? new Map((fwd.r || []).map((row) => [row[0], row])) : null;
  const calls = sym.calls || [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    if (stored) {
      const row = stored.get(i);
      const S = require("./graph-shard.js");
      out.push({
        call: c,
        res: row
          ? row[1] === S.STATE_CODE.AMBIGUOUS
            ? { state: "AMBIGUOUS", target: null, candidates: (fwd.cands || [])[row[4]] || [] }
            : { state: S.CODE_STATE[row[1]], target: row[2], ...(row[3] === 1 ? { inherited: true } : {}) }
          : { state: "UNRESOLVED", target: null, candidates: [] },
      });
      continue;
    }
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
  // W1: `GET /orders/search` or `/orders/search` — a URL, resolved like one a
  // test would send, so a route is found by its FULL path, mounts included.
  const asUrl = /^(?:([A-Za-z]+) )?(\/\S*)$/.exec(s);
  if (!exact.length && asUrl) {
    const r = resolveUrl(model, { method: asUrl[1] ? asUrl[1].toUpperCase() : "ANY", url: asUrl[2] });
    if (r.state === "ROUTE") return { kind: "symbol", sym: model.symbols.get(r.target) };
    if (r.state === "AMBIGUOUS") return { kind: "ambiguous", candidates: r.candidates.map((id) => model.symbols.get(id)).filter(Boolean) };
  }
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
  if (model.blobStates.has(rel)) return model.blobStates.get(rel);
  let state;
  if (!fs.existsSync(path.join(model.root, ...rel.split("/")))) state = "deleted";
  else {
    const r = spawnSync("git", ["hash-object", "--", rel], { cwd: model.root, encoding: "utf8" });
    state = r.status !== 0 ? "unknown" : r.stdout.trim() === (model.byFile[rel] || {}).blob ? "current" : "changed";
  }
  model.blobStates.set(rel, state);
  return state;
}

// S3 (v1.8.2 W2): one `git hash-object --stdin-paths` for every file the
// cards of this read will name. `ctx` on five targets spawned git five times,
// and a Windows process start is ~30 ms each.
function warmBlobs(model, queries) {
  const rels = new Set();
  for (const q of queries || []) {
    const t = findTarget(model, q);
    if (t.kind === "symbol") rels.add(t.sym.file);
    else if (t.kind === "file") rels.add(t.rel);
  }
  warmFiles(model, rels);
}

// The same batch, for files the caller already knows by path (R1: the caller
// files a `--callers-source` card reads).
function warmFiles(model, rels) {
  const onDisk = [...rels].filter((rel) => !model.blobStates.has(rel) && fs.existsSync(path.join(model.root, ...rel.split("/"))));
  for (const rel of rels) if (!fs.existsSync(path.join(model.root, ...rel.split("/")))) model.blobStates.set(rel, "deleted");
  if (!onDisk.length) return;
  const h = spawnSync("git", ["hash-object", "--stdin-paths"], { cwd: model.root, encoding: "utf8", input: onDisk.join("\n") + "\n" });
  if (h.status !== 0) return;
  const out = h.stdout.split(/\r?\n/).filter(Boolean);
  onDisk.forEach((rel, i) => {
    if (out[i]) model.blobStates.set(rel, out[i] === (model.byFile[rel] || {}).blob ? "current" : "changed");
  });
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
// order. The footer always says what the card hid.
//
// v1.8.2 W3 — TWO changes, both about the tokens the card itself adds:
//   · the footer is printed ONLY when something was hidden, a call was
//     unresolved, or `--source` was cut. A card that hid nothing used to spend
//     a whole line saying so, on every card, on every later turn of the agent
//     that received it. `budget` stays in the JSON either way.
//   · `tail` is the `--source` block (D1). It is charged against the SAME
//     budget and it goes LAST, so the rows always win: source takes what the
//     card left, line by line, and the footer says how many lines it cut.
function fit(items, budget, footer, tail, blocks) {
  // The reserve is the LONGEST footer this card could print — one hidden
  // count per section present — so the final `used` can never pass the
  // budget, whatever ends up hidden. (W2: a card with five sections overran a
  // 100-token budget by five tokens on the footer alone.)
  const worst = {};
  for (const it of items) if (it.pri > 0) worst[it.section] = 99;
  const worstBlocks = blocks && blocks.length ? { shown: 0, want: blocks.length } : null;
  const reserve = tok(footer(0, worst, tail ? { kept: 0, want: tail.want, cut: tail.want } : null, worstBlocks)) + 2;
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
  let source = null;
  if (tail) {
    const open = "  ```" + (tail.fence || "");
    const close = "  ```";
    let left = budget - used - reserve - tok(tail.head) - tok(open) - tok(close) - 3;
    const body = [];
    for (const ln of tail.lines) {
      const t = tok(ln) + 1;
      if (t > left) break;
      left -= t;
      body.push(ln);
    }
    if (body.length) {
      const block = [tail.head, open, ...body, close];
      used += block.reduce((a, l) => a + tok(l) + 1, 0);
      lines.push(...block);
    }
    source = { kept: body.length, want: tail.want, cut: tail.want - body.length };
  }
  // R1 (v1.9.1): the callers' own lines. They go AFTER the target's source, and
  // each block is kept WHOLE or not at all — six lines cut to four is a call
  // site with its arguments missing, which is worse than no call site.
  let callersShown = null;
  if (blocks && blocks.length) {
    const headOf = (n) => `  callers source  ${n < blocks.length ? `${n} of ${blocks.length}` : n} shown (${CALLERS_SOURCE_LINES} lines each${n < blocks.length ? "; raise --budget" : ""})`;
    let left = budget - used - reserve - tok(headOf(0)) - 1;
    const out = [];
    for (const b of blocks) {
      const open = "  ```" + (b.fence || "");
      const block = [b.head, open, ...b.lines, "  ```"];
      const t = block.reduce((a, l) => a + tok(l) + 1, 0);
      if (t > left) break;
      left -= t;
      out.push({ b, block });
    }
    if (out.length) {
      const all = [headOf(out.length), ...out.flatMap((x) => x.block)];
      used += all.reduce((a, l) => a + tok(l) + 1, 0);
      lines.push(...all);
    }
    callersShown = { shown: out.length, want: blocks.length, kept: out.map((x) => x.b) };
  }
  const foot = footer(used, hidden, source, callersShown);
  if (foot) lines.push(foot);
  return { card: lines.join("\n"), kept: keep, hidden, source, callers: callersShown, used: used + tok(foot) };
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
const STATE_SHORT = { LOCAL: "L", IMPORT: "I", UNIQUE: "U", ROUTE: "R", AMBIGUOUS: "A", UNRESOLVED: "-" };
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

// ── D1 (v1.8.2 W3): the card and the range in ONE call ──────────────────────
// A card is a LOCATOR: it names a range and the agent then reads it. That is
// two round trips for one question, and the second one is a `Read` the CLI
// could have answered. `--source` prints the range the card just named.
//
// It does NOT change the read ladder. A file you are about to EDIT is still
// read in full with `Read` first (exception 1) — an `old_string` rebuilt from
// a CLI print is the same corruption bug as one rebuilt from an outline.
// `--source` is for the CALLER'S range, the callee's, the neighbour you will
// not touch. The hook never prints source; this is a CLI answer to a CLI call.
const SOURCE_DEFAULT = 80;
const SOURCE_CAP = 200;
const FILE_HEAD_LINES = 40;
const FENCE_BY_EXT = {
  ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx", ".mjs": "js", ".cjs": "js", ".mts": "ts", ".cts": "ts",
  ".py": "python", ".go": "go", ".rb": "ruby", ".rs": "rust", ".java": "java", ".kt": "kotlin", ".cs": "csharp",
  ".php": "php", ".sh": "bash", ".sql": "sql", ".json": "json", ".yml": "yaml", ".yaml": "yaml", ".md": "md",
};

function sourceLimit(want) {
  const n = Number(want);
  if (!Number.isFinite(n) || n <= 0) return SOURCE_DEFAULT;
  return Math.min(SOURCE_CAP, Math.floor(n));
}

// The lines are read from the CURRENT bytes on disk, and the range comes from
// the index. When the two disagree the card header already says CHANGED, and
// the source head repeats it — a range that has moved is a wrong answer given
// confidently, which is the one thing this whole feature must never do.
function sourceTail(model, rel, from, to, want, fresh) {
  if (fresh === "deleted") return null;
  let text;
  try {
    text = fs.readFileSync(path.join(model.root, ...rel.split("/")), "utf8");
  } catch (_) {
    return null;
  }
  const all = text.split(/\r?\n/);
  const start = Math.max(1, Number(from) || 1);
  const end = Math.max(start, Math.min(all.length, Number(to) || all.length));
  const limit = sourceLimit(want);
  const stop = Math.min(end, start + limit - 1);
  const width = String(stop).length;
  const lines = [];
  for (let i = start; i <= stop; i++) lines.push(`  ${String(i).padStart(width)}  ${all[i - 1] === undefined ? "" : all[i - 1]}`);
  if (!lines.length) return null;
  const moved = fresh !== "current" ? "  — CHANGED since index, the range may have moved" : "";
  return {
    head: `  source  ${rel}:${start}-${stop}${moved}`,
    fence: FENCE_BY_EXT[posix.extname(rel)] || "",
    want: end - start + 1,
    lines,
    file: rel,
    from: start,
    to: stop,
  };
}

function sourceText(tail, kept) {
  return tail.lines.slice(0, kept).join("\n");
}

// ── R1 (v1.9.1): the call sites WITH the card ───────────────────────────────
// A recon agent asked "who calls this" and then opened every caller file to
// see HOW it was called. Six lines around each call site answer that in the
// same call. The limits, and the reason for each:
//   · CONFIDENT callers only. Source printed for an AMBIGUOUS guess reads as a
//     fact, and that is the false sentence the R3-C eval found.
//   · never the target's OWN file. The agent that asks is about to edit that
//     file, and a file you edit is read in full with `Read` first (the read
//     ladder's exception 1) — a CLI print of it would be read twice.
//   · ≤ 5 callers, 6 lines each, charged to the SAME budget, after everything
//     else. The rows always win.
const CALLERS_SOURCE_MAX = 5;
const CALLERS_SOURCE_LINES = 6;

function fileLines(model, rel) {
  model.textCache = model.textCache || new Map();
  if (model.textCache.has(rel)) return model.textCache.get(rel);
  let all = null;
  try {
    const text = fs.readFileSync(path.join(model.root, ...rel.split("/")), "utf8");
    all = text.split(/\r?\n/);
    if (all.length > 1 && all[all.length - 1] === "") all.pop();
  } catch (_) {
    all = null;
  }
  model.textCache.set(rel, all);
  return all;
}

function callerBlocks(model, sym, confident) {
  const others = confident.filter((c) => c.sym.file !== sym.file);
  // One git call for the files the blocks will most likely come from. A caller
  // past this slice (many call sites in one window) is still checked, one by one.
  warmFiles(model, new Set(others.slice(0, CALLERS_SOURCE_MAX * 4).map((c) => c.sym.file)));
  const out = [];
  for (const c of others) {
    if (out.length >= CALLERS_SOURCE_MAX) break;
    const rel = c.sym.file;
    // Two call sites a line apart are ONE window. Printing it twice is the
    // same six lines paid twice.
    if (out.some((b) => b.file === rel && b.from <= c.line && c.line <= b.to)) continue;
    const fresh = blobState(model, rel);
    if (fresh === "deleted") continue;
    const all = fileLines(model, rel);
    if (!all || !all.length) continue;
    const at = Math.max(1, Math.min(all.length, Number(c.line) || 1));
    // Two lines above, three below — shifted, not shortened, at either end of
    // the file, so every block is six lines when the file has six.
    const from = Math.max(1, Math.min(at - 2, all.length - CALLERS_SOURCE_LINES + 1));
    const to = Math.min(all.length, from + CALLERS_SOURCE_LINES - 1);
    const width = String(to).length;
    const lines = [];
    for (let i = from; i <= to; i++) lines.push(`  ${String(i).padStart(width)}  ${all[i - 1]}`);
    const caller = c.url || c.sym.qname;
    const changed = fresh !== "current";
    out.push({
      head: `  ${rel}:${from}-${to}  ← ${caller}${changed ? "  — CHANGED since index, the range may have moved" : ""}`,
      fence: FENCE_BY_EXT[posix.extname(rel)] || "",
      lines,
      file: rel,
      from,
      to,
      caller,
      changed,
    });
  }
  return out;
}

function callersSourceNote(cs) {
  if (!cs || cs.shown >= cs.want) return "";
  return cs.shown ? ` · callers source ${cs.want - cs.shown} cut (raise --budget)` : ` · callers source not shown (${cs.want} callers, raise --budget)`;
}

// ── R4 (v1.9.1): where a language server should be asked ───────────────────
// The LSP tool takes a file, a line and a 1-based character. The card knows the
// line; the character is where the NAME sits on it, read from the bytes on disk.
// `null` whenever that cannot be stated exactly — a guessed column sends the
// language server to the wrong token, and its answer is then confidently wrong.
function lspAt(model, sym, fresh) {
  if (fresh !== "current" || !sym || !sym.name) return null;
  const all = fileLines(model, sym.file);
  const line = sym.lines && sym.lines[0];
  if (!all || !line || line > all.length) return null;
  const text = all[line - 1];
  const esc = String(sym.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|[^A-Za-z0-9_$])${esc}(?![A-Za-z0-9_$])`).exec(text);
  if (!m) return null;
  return { file: sym.file, line, character: m.index + m[1].length + 1 };
}

function sourceNote(source) {
  if (!source) return "";
  if (!source.kept) return ` · source not shown (${source.want} lines, raise --budget)`;
  return source.cut ? ` · source ${source.kept} lines · ${source.cut} cut (raise --budget)` : "";
}

// ── §6 (v1.8.2 W3): the state word, once ────────────────────────────────────
// `LOCAL` / `IMPORT` / `UNIQUE` is spelled on every row of every card, and a
// card is sent again on each later turn of the agent that received it. The
// one-letter form plus ONE legend line says the same thing — but only when the
// card has enough rows to pay for the legend. So both bodies are built and the
// SMALLER one is printed, the same rule `--format tree` already follows, and
// the answer says which one it used. It can never be worse than the long form.
const STATE_LEGEND = "  states: L local · I import · U unique · R route · A ambiguous";
const stateWord = (s, short) => (short ? STATE_SHORT[s] || s : s);

// Rewrites `items` in place to the short body and inserts the legend, but only
// when the short body PLUS the legend is smaller than the long one. Returns
// which body was chosen.
function pickShort(items) {
  let long = 0;
  let short = STATE_LEGEND.length;
  for (const it of items) {
    long += it.text.length;
    short += it.short.length;
  }
  if (short >= long) return false;
  for (const it of items) it.text = it.short;
  items.splice(1, 0, { pri: 0, section: "header", text: STATE_LEGEND, short: STATE_LEGEND, data: null });
  return true;
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
  // `short` is the same row with the one-letter state word. Both bodies are
  // built; the smaller one is printed (§6).
  const push = (pri, section, text, data, short) => items.push({ pri, section, text, short: short == null ? text : short, data });
  push(0, "header", `${sym.qname}  ${sym.file}:${sym.lines[0]}-${sym.lines[1]}  [blob ${String((model.byFile[sym.file] || {}).blob || "").slice(0, 7)} · ${BLOB_LABEL[fresh]}${coverageTag(model, sym.file)}]`);
  // A note is shown ONLY while the body still hashes the same. An old
  // sentence about code that has since changed is never printed.
  const note = N.noteFor(model.notes, sym);
  if (note)
    push(
      1,
      "note",
      note.current ? `  ${note.source === "doc" ? "doc " : "note"}  ${note.text}  (${note.model} · current)` : "  note: stale (body changed) — it is re-noted at the next batch",
      { item: "note", ...note }
    );

  const callers = callersOf(model, sym);
  callers.confident.sort((a, b) => (a.sym.file + a.line).localeCompare(b.sym.file + b.line));
  for (const c of callers.confident) {
    const row = (short) =>
      c.url
        ? `  ← reached via  ${c.url}  ${where(c.sym, c.line)}  ${stateWord("ROUTE", short)}`
        : `  ← ${c.ref ? "used by  " : "called by"}  ${c.sym.qname}  ${where(c.sym, c.line)}  ${stateWord(c.state, short)}${c.inherited ? " (inherited)" : c.alias ? ` (via ${c.alias})` : ""}`;
    push(
      2,
      "callers",
      row(false),
      {
        item: "caller",
        id: c.sym.id,
        qname: c.sym.qname,
        file: c.sym.file,
        line: c.line,
        state: c.state,
        ...(c.ref ? { ref: true } : {}),
        ...(c.url ? { url: c.url } : {}),
        ...(c.inherited ? { inherited: true } : {}),
        ...(c.alias ? { alias: c.alias } : {}),
      },
      row(true)
    );
  }
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
        const amb = (short) => `${indent}→ calls      ${call.name}  ${stateWord("AMBIGUOUS", short)} (${cs.length}): ${shown}${cs.length > 3 ? `, +${cs.length - 3}` : ""}`;
        push(4, "calls", amb(false), { item: "call", name: call.name, line: call.line, state: "AMBIGUOUS", candidates: cs.map((x) => x.id) }, amb(true));
        continue;
      }
      const target = model.symbols.get(res.target);
      if (!target) continue;
      const mark = res.inherited ? " (inherited)" : call.alias ? ` (via ${call.alias})` : "";
      const row = (short) => `${indent}→ ${call.ref ? "uses " : "calls"}      ${target.qname}  ${where(target)}  ${stateWord(res.state, short)}${mark}`;
      push(level === 1 ? 2 : 3 + level, "calls", row(false), {
        item: "call",
        name: call.name,
        line: call.line,
        state: res.state,
        target: brief(target),
        level,
        ...(call.ref ? { ref: true } : {}),
        ...(res.inherited ? { inherited: true } : {}),
        ...(call.alias ? { alias: call.alias } : {}),
      }, row(true));
      if (level < depth && !visited.has(target.id)) {
        visited.add(target.id);
        const cn = N.noteFor(model.notes, target);
        if (cn && cn.current) push(2 + level, "notes", `${indent}    └ ${cn.source === "doc" ? "doc" : "note"} ${cn.text}`, { item: "callee_note", of: target.id, text: cn.text, source: cn.source });
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

  const short = pickShort(items);
  // The footer is printed ONLY when the card hid something, dropped an
  // unresolved call, or cut the source block (§6).
  const footer = (used, hidden, source, cs) => {
    const why = `${unresolved ? ` · ${unresolved} unresolved call(s) not shown` : ""}${hiddenText(hidden)}${sourceNote(source)}${callersSourceNote(cs)}`;
    return why ? `  budget ${used}/${budget} tokens${why}` : "";
  };
  const tail = opts.source === undefined ? null : sourceTail(model, sym.file, sym.lines[0], sym.lines[1], opts.source, fresh);
  const blocks = opts.callersSource ? callerBlocks(model, sym, callers.confident) : null;
  const f = fit(items, budget, footer, tail, blocks);
  const kept = items.filter((_, i) => f.kept.has(i)).map((it) => it.data).filter(Boolean);
  const callersSource = blocks
    ? {
        callers_source: (f.callers ? f.callers.kept : []).map((b) => ({ file: b.file, from: b.from, to: b.to, caller: b.caller, text: b.lines.join("\n"), changed: b.changed })),
        counts: { callers_source_cut: f.callers ? f.callers.want - f.callers.shown : 0 },
      }
    : {};
  return {
    ok: true,
    state: "found",
    target: brief(sym),
    blob: fresh,
    exported: sym.exported,
    lsp_at: lspAt(model, sym, fresh),
    states: short ? "short" : "long",
    note: note || null,
    callers: kept.filter((d) => d.item ==="caller"),
    maybe_callers: callers.maybe,
    calls: kept.filter((d) => d.item ==="call"),
    effects: kept.filter((d) => d.item ==="effect"),
    wiki,
    tests,
    unresolved,
    source: tail && f.source && f.source.kept ? { file: tail.file, from: tail.from, to: tail.from + f.source.kept - 1, text: sourceText(tail, f.source.kept), cut: f.source.cut } : null,
    ...callersSource,
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
  // R1: `--callers-source` is a SYMBOL card's option. A file card names who
  // imports the file, not a call line, so there is no six-line window to print.
  const ignored = opts.callersSource ? " · callers source: symbol cards only" : "";
  const footer = (used, hidden, source) => {
    const why = `${hiddenText(hidden)}${sourceNote(source)}${ignored}`;
    return why ? `  budget ${used}/${budget} tokens${why}` : "";
  };
  // D1 on a FILE card is the file's head — the imports, the exports and the
  // first declaration, which is what a reader opening an unknown file looks at.
  const tail = opts.source === undefined ? null : sourceTail(model, rel, 1, Math.min(FILE_HEAD_LINES, sourceLimit(opts.source)), opts.source, fresh);
  const fitted = fit(items, budget, footer, tail);
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
    source: tail && fitted.source && fitted.source.kept ? { file: tail.file, from: tail.from, to: tail.from + fitted.source.kept - 1, text: sourceText(tail, fitted.source.kept), cut: fitted.source.cut } : null,
    hidden: fitted.hidden,
    budget: { used: fitted.used, max: budget },
    card: fitted.card,
    exit: 0,
  };
}

// ── D2 (v1.8.2 W3): `ctx --for-slice` — the OUTSIDE view ────────────────────
// An executor reads every declared file IN FULL before editing it (read-ladder
// exception 1). A file card for a declared file therefore repeats what the
// executor is about to read anyway — the symbol table, the line ranges, the
// fan-in — on every turn of that agent, for the whole run.
//
// What the executor CANNOT see from inside the file is the outside: who imports
// it, who calls its exported symbols from elsewhere, which route reaches it, and
// which tests cover it. `--for-slice` prints ONLY that. No symbol table, no
// callee tree, no notes.
//
// It is one block per declared file, always tree format, and the caller rows are
// sorted by the IMPORTANCE of the symbol they reach — the exported entry point
// before the private helper, the same rule the file card already follows.
const SLICE_MAX_TARGETS = 10;
const STATE_RANK = { LOCAL: 0, IMPORT: 1, ROUTE: 2, UNIQUE: 3 };

function sliceBlock(model, rel, budget, opts) {
  const f = model.byFile[rel];
  const fresh = blobState(model, rel);
  const items = [];
  const push = (pri, section, text, data) => items.push({ pri, section, text, short: text, data });
  push(0, "header", `${rel}  [blob ${String(f.blob).slice(0, 7)} · ${BLOB_LABEL[fresh]}${coverageTag(model, rel)}]`);

  const SIG = require("./graph-signals.js");
  const allSyms = (f.symbols || []).filter((s) => s.kind !== "module");
  // A route symbol is named by its own path; the MOUNTED path is the one a
  // reader outside the file recognises, and it is the one thing the file itself
  // cannot tell them.
  const fullRoute = new Map();
  for (const r of routeTable(model)) if (r.sym.file === rel) fullRoute.set(r.sym.id, `${r.method} ${r.full || r.own}`);
  // ONE ROW PER CALLING FILE, naming every symbol of this file it reaches. The
  // first measurement of this view listed one row per (symbol, caller) pair and
  // came out LARGER than the file card it replaces — six symbols and four
  // callers is twenty-four rows for four relationships. The outside question is
  // "who reaches this file, and through what", and that is one row per file.
  const OUT_NAMES = 8;
  const byFile = new Map();
  for (const s of allSyms) {
    const cs = callersOf(model, s).confident;
    const imp = SIG.importance(model, s, cs.length);
    const reaches = fullRoute.get(s.id) || s.name;
    for (const c of cs) {
      if (c.sym.file === rel) continue; // inside the file — the executor reads it
      let row = byFile.get(c.sym.file);
      if (!row) byFile.set(c.sym.file, (row = { file: c.sym.file, line: c.line, imp, state: c.state, names: new Map() }));
      if (c.line < row.line) row.line = c.line;
      if (imp > row.imp) row.imp = imp;
      // One state per row: the strongest one this file reached the target with.
      if (STATE_RANK[c.state] < STATE_RANK[row.state]) row.state = c.state;
      if (!row.names.has(reaches)) row.names.set(reaches, imp);
    }
  }
  const rows = [...byFile.values()]
    .map((r) => ({ ...r, names: [...r.names.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]) }))
    .sort((a, b) => b.imp - a.imp || a.file.localeCompare(b.file));
  for (const r of rows) {
    const shown = r.names.slice(0, OUT_NAMES);
    push(
      2,
      "callers",
      `  ${r.file}:${r.line} ${STATE_SHORT[r.state] || r.state}  ${shown.join(" ")}${r.names.length > OUT_NAMES ? ` +${r.names.length - OUT_NAMES}` : ""}`,
      { item: "caller", file: r.file, line: r.line, state: r.state, reaches: r.names }
    );
  }

  const importers = importersOf(model, rel);
  // Only the importers that call NOTHING — the ones the caller rows already
  // name are the same fact printed twice.
  const quiet = importers.filter((x) => !byFile.has(x));
  if (quiet.length) {
    const pre = dirPrefix(quiet);
    if (pre) push(1, "importers", `  dir ${pre}`, null);
    push(1, "importers", `  imp ${quiet.map((x) => (pre && x.startsWith(pre) ? x.slice(pre.length) : x)).join(" ")}  (imports it, calls nothing)`, { item: "importers", files: quiet });
  }

  // The routes this file answers, with the mount chain already folded in — the
  // one fact a reader of the file itself cannot get without opening the mount.
  // A route a caller row already named is the same fact twice, so only the ones
  // NOTHING reaches are printed — which is also the more interesting half.
  const reached = new Set(rows.flatMap((r) => r.names));
  const routes = routeTable(model)
    .filter((r) => r.sym.file === rel)
    .map((r) => `${r.method} ${r.full || r.own}${r.mounted === "known" || r.mounted === "none" ? "" : " (mount ambiguous)"}`);
  const unreached = routes.filter((x) => !reached.has(x));
  if (unreached.length) push(1, "routes", `  rt  ${unreached.join("  ")}  (no caller in the graph)`, { item: "routes", routes: unreached });

  const shownFiles = new Set(rows.map((r) => r.file));
  const allTests = [
    ...new Set([...rows.map((r) => r.file).filter((x) => TEST_FILE.test(x)), ...importers.filter((x) => TEST_FILE.test(x)), ...SIG.testsByName(model, rel)]),
  ].sort();
  const moreTests = allTests.filter((x) => !shownFiles.has(x));
  if (moreTests.length) push(1, "tests", `  tst ${moreTests.join(" ")}`, { item: "tests", files: moreTests });

  const footer = (used, hidden) => (hiddenText(hidden) ? `  budget ${used}/${budget} tokens${hiddenText(hidden)}` : "");
  const fitted = fit(items, budget, footer);
  const kept = items.filter((_, i) => fitted.kept.has(i)).map((it) => it.data).filter(Boolean);
  return {
    file: rel,
    blob: fresh,
    callers: kept.filter((d) => d.item === "caller"),
    total_callers: rows.length,
    importers,
    routes,
    tests: allTests,
    names: [...new Set([...rows.flatMap((r) => r.names), ...routes])],
    hidden: fitted.hidden,
    used: fitted.used,
    card: fitted.card,
  };
}

function forSlice(model, files, opts) {
  const budget = Math.max(100, Math.min(8000, Number(opts.budget) || 1200));
  const all = [...new Set(files.map(norm))];
  const known = all.filter((r) => model.fileSet.has(r)).slice(0, SLICE_MAX_TARGETS);
  const skipped = all.filter((r) => model.fileSet.has(r)).slice(SLICE_MAX_TARGETS);
  const missing = all.filter((r) => !model.fileSet.has(r));
  if (!known.length) return { ok: false, state: "not-found", missing, exit: 4 };
  const each = Math.max(100, Math.floor(budget / known.length));
  const blocks = known.map((rel) => sliceBlock(model, rel, each, opts));
  const body = blocks.map((b) => b.card).join("\n\n");
  // R1 / DE-7b: the executor reads its declared files whole, so the outside
  // view stays rows only — the flag is named as ignored, never silently dropped.
  const note = (missing.length ? `\n  not in the graph: ${missing.join(", ")}` : "") + (opts.callersSource ? "\n  callers source: symbol cards only" : "");
  // The column header is named ONCE for the whole answer, not once per block —
  // the tree format's own rule, applied one level up.
  return {
    ok: true,
    state: "found",
    view: "for-slice",
    format: "tree",
    files: known,
    missing,
    skipped,
    blocks: blocks.map((b) => ({ file: b.file, blob: b.blob, callers: b.callers, total_callers: b.total_callers, importers: b.importers, routes: b.routes, tests: b.tests, hidden: b.hidden })),
    names: [...new Set(blocks.flatMap((b) => b.names))],
    budget: { used: blocks.reduce((a, b) => a + b.used, 0), max: budget },
    card: `graph outside view — read each file itself before you edit it · rows are  from:line state  reaches\n${body}${note}`,
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
        seen.set(row.sym.id, { sym: row.sym, depth: d, line: row.line, state: row.state, via: row.url ? `${t.qname} ← ${row.url}` : t.qname, ...(row.url ? { url: row.url } : {}) });
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
      data: { item: "caller", depth: h.depth, ...brief(h.sym), line: h.line, state: h.state, via: h.via, ...(h.url ? { url: h.url } : {}) },
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
  const footer = (used, hidden) => (hiddenText(hidden) ? `  budget ${used}/${budget} tokens${hiddenText(hidden)}` : "");
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

// ── D4 (v1.8.2 W7): `orc graph map` — the ranked repository map ─────────────
// The planner's FIRST question, answered without a single Read: which files
// are the landmarks here, and — with `--focus` — which ones surround the thing
// the request already names.
//
// The rank comes from `bin/graph-map.js`. This half owns what a row says and
// how the list is cut, which is the same contract every other card keeps: rows
// in a fixed order, the budget cuts from the BOTTOM, and a card that hid
// something says so.
const MAP_MAX_ROWS = 200;
const MAP_FOCUS_MASS = 100;
const MAP_CAVEAT = "  rank is a HINT about where to look first — it is never proof a file matters to this change";

function mapRow(model, rel, fan, pre) {
  const SIG = require("./graph-signals.js");
  const syms = (model.byFile[rel].symbols || []).filter((s) => s.kind !== "module");
  const ranked = syms
    .map((s) => ({ s, imp: SIG.importance(model, s, fan.get(s.id) || 0) }))
    .sort((a, b) => b.imp - a.imp || a.s.lines[0] - b.s.lines[0]);
  // Chosen by importance, then PRINTED in line order: a file is read top to
  // bottom, and a list that jumps about costs the reader more than it saves.
  const M = require("./graph-map.js");
  const shown = ranked.slice(0, M.SYMS_PER_FILE).sort((a, b) => a.s.lines[0] - b.s.lines[0]);
  const rest = ranked.length - shown.length;
  const name = pre && rel.startsWith(pre) ? rel.slice(pre.length) : rel;
  const parts = shown.map(({ s }) => `${s.qname}:${s.lines[0]}-${s.lines[1]}${s.exported ? " E" : ""}`);
  if (rest > 0) parts.push(`+${rest}`);
  return {
    text: `  ${name}${parts.length ? "  " + parts.join(" · ") : ""}`,
    data: { item: "file", file: rel, symbols: shown.map(({ s }) => ({ qname: s.qname, kind: s.kind, lines: s.lines, exported: !!s.exported })), more: Math.max(0, rest) },
  };
}

// A focus token is a FILE when the graph holds that path, and a NAME otherwise.
// A name contributes every file that DEFINES it — which is how "focus on
// `createOrder`" reaches the file a request never spelled out.
function focusFiles(model, tokens) {
  const files = [];
  const missing = [];
  for (const t of tokens) {
    const rel = norm(t).replace(/:\d+$/, "");
    if (model.fileSet.has(rel)) {
      files.push(rel);
      continue;
    }
    const defs = model.byName.get(String(t).split(".").pop()) || [];
    if (defs.length) for (const s of defs) files.push(s.file);
    else missing.push(t);
  }
  return { files: [...new Set(files)], missing };
}

function graphMap(claudeDir, model, opts) {
  const M = require("./graph-map.js");
  const budget = Math.max(100, Math.min(8000, Number(opts.budget) || 1200));
  const { files, edges, base, cached } = M.edgesFor(claudeDir, model);
  const idOf = new Map(files.map((f, i) => [f, i]));
  const tokens = (opts.focus || []).filter(Boolean);
  const foc = tokens.length ? focusFiles(model, tokens) : { files: [], missing: [] };

  let rank;
  if (foc.files.length) {
    // W7-focus-baseline: EVERY file keeps a baseline share of 1 and the focus
    // gets `MAP_FOCUS_MASS / n` ON TOP of it. Giving the focus the whole vector
    // — the literal reading of "focus files get 100/n" — leaves every file the
    // focus does not reach at exactly zero, and a hundred tied zeroes sort
    // alphabetically. That turns the rest of the map into a directory listing,
    // which is the one thing it must never be.
    //
    // The mass is FIXED, so a fifth focus file dilutes the other four rather
    // than making the focus louder overall. That is Aider's rule and the reason
    // is the same: a focus list is a hint about where to start, not a filter.
    const pers = new Float64Array(files.length).fill(1);
    const each = MAP_FOCUS_MASS / foc.files.length;
    for (const f of foc.files) {
      const i = idOf.get(f);
      if (i !== undefined) pers[i] += each;
    }
    rank = M.pageRank(files.length, edges, pers);
  } else rank = base || M.pageRank(files.length, edges, null);

  const scored = files
    .map((rel, i) => ({ rel, score: rank[i] * M.multiplier(model, rel) }))
    .sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  const candidates = scored.slice(0, MAP_MAX_ROWS);
  const fan = M.fanCounts(model);
  const pre = dirPrefix(candidates.map((c) => c.rel));
  const rows = candidates.map((c, i) => {
    const row = mapRow(model, c.rel, fan, pre);
    return { text: row.text, data: { ...row.data, rank: i + 1 } };
  });

  const focusNote = foc.files.length ? ` · focus ${foc.files.length} file(s)` : "";
  const footer = (used, hidden) => (hiddenText(hidden) ? `  budget ${used}/${budget} tokens${hiddenText(hidden)}` : "");
  // W7-map-prefix: the map is cut to a PREFIX of the ranking, never to whatever
  // happens to fit. `fit()` is greedy — after skipping one long row it will
  // still take a shorter row further down — which is right for a card whose
  // sections are independent and wrong for a list whose whole meaning is the
  // ORDER. A reader who sees rank 10 present and rank 7 missing cannot use the
  // order for anything.
  //
  // So the row count is chosen by binary search, exactly as Aider chooses its
  // map size, and `fit` is then handed a list it can keep whole. Its budget
  // arithmetic and its footer reserve are unchanged and still do the accounting.
  const itemsFor = (k) => {
    const items = [];
    items.push({ pri: 0, section: "header", text: `graph map (gen ${model.meta.generation}) — ${files.length} file(s) by rank${focusNote}`, data: null });
    if (pre) items.push({ pri: 0, section: "header", text: `  dir ${pre}`, data: null });
    if (foc.missing.length) items.push({ pri: 0, section: "focus", text: `  focus not in the graph: ${foc.missing.join(", ")}`, data: { item: "focus-missing" } });
    for (let i = 0; i < k; i++) items.push({ pri: 1, section: "files", text: rows[i].text, data: rows[i].data });
    // pri 0: never cut, and CHARGED to the budget like everything else. It is
    // the map's whole equivalent of "the graph is a LOCATOR" — a card that
    // dropped it under budget pressure would be a ranking with no warning
    // label on it.
    items.push({ pri: 0, section: "caveat", text: MAP_CAVEAT, data: null });
    return items;
  };
  const fits = (k) => {
    const f = fit(itemsFor(k), budget, footer);
    return !f.hidden.files;
  };
  let lo = 0;
  let hi = rows.length;
  if (!fits(hi)) {
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (fits(mid)) lo = mid;
      else hi = mid - 1;
    }
  } else lo = hi;

  const shownRows = rows.slice(0, lo);
  const items = itemsFor(lo);
  // The footer has to report what the PREFIX left out, which `fit` cannot know
  // once the rows are gone. A map that silently stops at rank 12 is a map that
  // claims the repository has twelve files.
  const cut = files.length - shownRows.length;
  const footerFinal = (used) => (cut > 0 ? `  budget ${used}/${budget} tokens · hidden: ${cut} files (raise --budget)` : "");
  const f = fit(items, budget, footerFinal);
  return {
    ok: true,
    state: "found",
    focus: foc.files,
    focus_missing: foc.missing,
    cached_map: !!cached,
    total_files: files.length,
    edges: edges.length,
    files: shownRows.map((r) => r.data),
    shown: shownRows.length,
    has_more: cut > 0,
    hidden: cut > 0 ? { files: cut } : {},
    budget: { used: f.used, max: budget },
    card: f.card,
    generation: model.meta.generation,
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

// K2 (v1.8.2 W4b): how many lines in this repository NAME this symbol — the
// exact size of the Grep the card replaced. The graph knows it for free: every
// call site is already in the call index, and every definition in `byName`.
function nameHits(model, name) {
  // S1 (v1.8.2 W8): the sharded model holds a dozen files, not the repository,
  // so it CANNOT count the lines a grep would have returned. It says so rather
  // than returning a confident zero — K2's whole rule is that the
  // counterfactual is written down, and a made-up basis is worse than none.
  if (model.fast) return null;
  const bare = String(name || "").split(".").pop();
  const calls = (callIndex(model).get(bare) || []).length;
  const defs = (model.byName.get(bare) || []).length;
  return calls + defs;
}

module.exports = { loadModel, resolveCall, resolveUrl, routeTable, urlIndex, findTarget, callersOf, nameHits, warmBlobs, ctx, forSlice, impact, graphMap, pathBetween, importsOf, TEST_FILE, SOURCE_DEFAULT, SOURCE_CAP, CALLERS_SOURCE_MAX, CALLERS_SOURCE_LINES };
