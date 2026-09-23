"use strict";
// ── orc graph — D4: the RANKED REPOSITORY MAP (v1.8.2 W7) ───────────────────
//
// The question this answers is the one a planner asks FIRST, before it knows a
// single file name: "what is this repository, and which files matter?" Until
// now the only way to ask it was a Glob followed by a handful of whole-file
// Reads — the biggest `Read` share in a lane run, and the one place where reads
// cluster on files nobody ends up touching.
//
// Aider's repo map is the reference. The idea is small: a file that many other
// files call is a landmark, and a file that a LANDMARK calls is a landmark too.
// That is PageRank, and ORC already holds every edge it needs — the resolution
// cache is a map of "who calls this", which is exactly a referencing file
// pointing at a defining one.
//
// Three rules keep the ranking honest:
//
//   · An edge is weighted by the SQUARE ROOT of the confident calls between the
//     pair. A file called 100 times from one place is not ten times the
//     landmark of one called 10 times; it is one import used in a loop.
//   · A test file is knocked down by ten. It is real code and it belongs on the
//     map, but a repository where the tests outrank the thing being tested is a
//     map that sends a planner to the wrong half of the tree.
//   · A file whose every symbol is private is halved. Nothing outside it can
//     call it by name, so it is an implementation detail of its own directory.
//
// `--focus` is the half that makes it a TOOL rather than a list. A personalised
// PageRank biased toward the files (and the defining files of the names) the
// request already mentions re-ranks the whole repository around that request,
// so the same command answers "what is this project" and "what surrounds the
// thing I am about to change".
//
// WHAT IS STORED — `map.json`, generation-pinned like every other derived file
// in this directory:
//
//     files    the file list, in index order — the node ids
//     edges    [from, to, weight] over those ids, referencing → defining
//     base     the unfocused PageRank, one number per file
//
// It does NOT store symbols. The ranges and the importance come from the model,
// which a read command has loaded anyway, and storing them a second time would
// be `wide.json` again for no gain. Losing `map.json` costs the edge walk and
// nothing else: the reader computes it and answers the same bytes.

const path = require("path");
const G = require("./graph.js");

const MAP_SCHEMA = 1;
// Damping and iteration count are Aider's, and they are not worth tuning: the
// ORDER of the top rows stops moving long before iteration 30 on every fixture.
const DAMPING = 0.85;
const ITERATIONS = 30;
const SYMS_PER_FILE = 4;

function mapPath(claudeDir) {
  return path.join(G.graphPaths(claudeDir).dir, "map.json");
}

function readJson(file) {
  try {
    return JSON.parse(require("fs").readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

const own = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// ── the file graph ──────────────────────────────────────────────────────────
// `callers` is the resolution cache's own shape: target symbol id → rows of
// [caller symbol id, line, state, kind, extra]. Every row is one referencing
// file pointing at one defining file. A call inside a file is not an edge —
// PageRank on a self-loop only inflates the file that already won.
//
// The IMPORT half matters as much as the call half: a file that imports a
// constant and never calls it still depends on it, and a planner that cannot
// see that edge plans a change that breaks a file it never listed.
function buildEdges(model, callers) {
  const files = Object.keys(model.byFile).sort();
  const idOf = new Map(files.map((f, i) => [f, i]));
  const pair = new Map(); // "from|to" → confident call count

  const bump = (fromRel, toRel, n) => {
    const a = idOf.get(fromRel);
    const b = idOf.get(toRel);
    if (a === undefined || b === undefined || a === b) return;
    const k = a + "|" + b;
    pair.set(k, (pair.get(k) || 0) + n);
  };

  for (const [target, rows] of Object.entries(callers || {})) {
    const to = model.symbols.get(target);
    if (!to) continue;
    for (const row of rows) {
      const from = model.symbols.get(row[0]);
      if (from) bump(from.file, to.file, 1);
    }
  }

  // Imports. One edge per (file, imported file) pair, weight 1 — an import is a
  // single fact about a binding, however many times the binding is then used.
  const Q = require("./graph-query.js");
  for (const rel of files) {
    for (const t of Q.importsOf(model, rel).files) bump(rel, t, 1);
  }

  const edges = [];
  for (const [k, n] of pair) {
    const [a, b] = k.split("|");
    edges.push([Number(a), Number(b), Math.round(Math.sqrt(n) * 1000) / 1000]);
  }
  edges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return { files, edges };
}

// ── PageRank ────────────────────────────────────────────────────────────────
// `pers` is the personalisation vector — null for the unfocused rank. Rank
// leaks out of a file with no outgoing edge, so the dangling mass is put back
// through the personalisation vector rather than spread evenly: without that,
// a repository of mostly leaf files washes the focus straight out again.
function pageRank(n, edges, pers) {
  if (!n) return [];
  const outWeight = new Float64Array(n);
  for (const [a, , w] of edges) outWeight[a] += w;
  const p = new Float64Array(n);
  if (pers) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += pers[i];
    if (sum <= 0) for (let i = 0; i < n; i++) p[i] = 1 / n;
    else for (let i = 0; i < n; i++) p[i] = pers[i] / sum;
  } else for (let i = 0; i < n; i++) p[i] = 1 / n;

  let r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = p[i];
  for (let it = 0; it < ITERATIONS; it++) {
    const next = new Float64Array(n);
    let dangling = 0;
    for (let i = 0; i < n; i++) if (outWeight[i] === 0) dangling += r[i];
    for (const [a, b, w] of edges) if (outWeight[a] > 0) next[b] += (r[a] * w) / outWeight[a];
    for (let i = 0; i < n; i++) next[i] = (1 - DAMPING) * p[i] + DAMPING * (next[i] + dangling * p[i]);
    r = next;
  }
  return Array.from(r);
}

// ── the two per-file knock-downs ────────────────────────────────────────────
function multiplier(model, rel) {
  const Q = require("./graph-query.js");
  let m = 1;
  if (Q.TEST_FILE.test(rel)) m *= 0.1;
  const syms = (model.byFile[rel].symbols || []).filter((s) => s.kind !== "module");
  // A4 (v1.9.1): a file with NO symbol is as far from "a place behaviour lives"
  // as one whose symbols are all private, and it is knocked down the same way.
  // Measured on a real front-end project, 16 of the 26 rows a `--budget 600`
  // map printed named a file with nothing in it — a ranking that sends a
  // planner to a file the graph cannot answer a question about.
  //
  // It is a READ-TIME rank, not a stored one: `map.json` holds the edges and
  // the base ranking and is untouched, so nothing is re-extracted for this.
  if (!syms.length || !syms.some((s) => s.exported)) m *= 0.5;
  return m;
}

// ── build (called by `update`, inside the lock) ─────────────────────────────
// It never throws into the update: a map that cannot be written is a slower
// `orc graph map`, not a broken graph.
function build(claudeDir, model, callers) {
  const t0 = Date.now();
  try {
    const { files, edges } = buildEdges(model, callers);
    const base = pageRank(files.length, edges, null);
    const out = {
      schema: MAP_SCHEMA,
      engine: G.ENGINE,
      generation: model.meta.generation,
      gen_id: model.meta.gen_id,
      files,
      edges,
      base: base.map((x) => Math.round(x * 1e9) / 1e9),
    };
    G.atomicWrite(mapPath(claudeDir), JSON.stringify(out));
    return { route: "full", files: files.length, edges: edges.length, ms: Date.now() - t0 };
  } catch (e) {
    try {
      require("fs").rmSync(mapPath(claudeDir), { force: true });
    } catch (_) {}
    return { route: "failed", reason: String((e && e.message) || e), ms: Date.now() - t0 };
  }
}

// Used ONLY when the generation matches — the same rule as `resolved.json`.
function load(claudeDir, meta) {
  const m = readJson(mapPath(claudeDir));
  if (!m || m.schema !== MAP_SCHEMA || m.engine !== G.ENGINE) return null;
  if (!meta || !meta.generation || m.generation !== meta.generation) return null;
  return m;
}

// The reader's fallback: no cache, or a cache from another generation. It
// computes the same edges from the model and answers the same bytes.
function edgesFor(claudeDir, model) {
  const cached = load(claudeDir, model.meta);
  if (cached) return { files: cached.files, edges: cached.edges, base: cached.base, cached: true };
  const callers = model.callersCache || computeCallers(model);
  const { files, edges } = buildEdges(model, callers);
  return { files, edges, base: null, cached: false };
}

// Only reached when the resolution cache is absent or stale. It is the same
// walk `graph-resolve.build` does, kept here rather than exported from there so
// the cache writer keeps exactly one caller.
function computeCallers(model) {
  const Q = require("./graph-query.js");
  const out = Object.create(null);
  for (const [rel, f] of Object.entries(model.byFile)) {
    for (const s of f.symbols || []) {
      s.file = rel;
      for (const c of s.calls || []) {
        const r = Q.resolveCall(model, rel, s, c);
        if (r.target && (r.state === "LOCAL" || r.state === "IMPORT" || r.state === "UNIQUE" || r.state === "ROUTE")) {
          (own(out, r.target) || (out[r.target] = [])).push([s.id]);
        }
      }
    }
  }
  return out;
}

// The fan-in every printed row needs, counted ONCE. `importance` wants the
// confident caller count per symbol, and asking `callersOf` per symbol is a
// property read with the resolution cache and a full walk without it — so the
// count is taken from the same object the edges came from.
function fanCounts(model) {
  const callers = model.callersCache || computeCallers(model);
  const out = new Map();
  for (const [target, rows] of Object.entries(callers)) out.set(target, rows.length);
  return out;
}

module.exports = { MAP_SCHEMA, SYMS_PER_FILE, mapPath, build, load, edgesFor, buildEdges, pageRank, multiplier, fanCounts };
