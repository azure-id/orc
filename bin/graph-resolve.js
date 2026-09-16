"use strict";
// ── orc graph — the RESOLUTION CACHE (v1.8.0 EW2) ───────────────────────────
//
// W3 decided "resolution is computed on read, never stored". That was right for
// correctness and wrong for cost: on django/django ONE file card spent 437 ms
// working out who calls what, and `impact` up to 520 ms — every single time.
//
// EW2 measured what is worth storing, and the answer is narrower than the plan
// assumed. Two things were built, measured, and thrown away:
//
//   · the resolver's whole MEMO — 21.7 MB, ~120 ms to read and parse, to save
//     less than that. A net loss. Not stored.
//   · CLOSURE REPAIR (re-resolve only the changed file and its dependents) —
//     measured 2,669 ms against 2,695 ms for a plain full re-resolve on the
//     same one-line edit. **One percent.** On a JSON store the fixed costs
//     (change detection, loading the index, and rewriting the whole file) drown
//     the resolve, so an incremental resolve cannot pay. It was three
//     correctness bugs deep by the time the numbers came in, so it is gone.
//
// What IS stored is the REVERSE direction — who calls this symbol — which is
// the half the 437 ms walk was computing. 13 MB on django/django, and it turns
// a file card into 458 ms from 727 ms, and `impact` into 397 ms from 631 ms.
//
// The rules that keep W3's correctness:
//
//   1. `index.json` is still the only SOURCE. `resolved.json` is DERIVED, and
//      throwing it away costs speed and nothing else.
//   2. Only `update` writes it, inside the same lock. A reader never writes, so
//      readers stay lock-free.
//   3. A reader uses it ONLY when `resolved.generation === meta.generation`.
//      Any other answer — a crash between two writes, an older engine, a hand
//      deletion — falls back to computing on read. Stale is impossible: it is
//      not "probably fine", it is not used at all.
//   4. A cached answer must be BYTE-IDENTICAL to a computed one, order
//      included. `test/cli/graph-resolve.test.js` drives a seeded random edit
//      script and compares the two after every step.
//
// WHAT IS STORED
//
//   callers target symbol id → the confident callers of it, as
//           `[caller symbol id, line, state, ref]`.
//   maybe   target symbol id → how many AMBIGUOUS calls list this target, by
//           CALLER FILE. Per file, not per call site: 5 MB on django/django
//           instead of 45 MB, and the card only ever shows the total.

const fs = require("fs");
const path = require("path");
const G = require("./graph.js");

const RESOLVE_SCHEMA = 2;
const CONFIDENT = new Set(["LOCAL", "IMPORT", "UNIQUE"]);
const NAMES_PER_KEY = 5;

function resolvedPath(claudeDir) {
  return path.join(G.graphPaths(claudeDir).dir, "resolved.json");
}
function namesPath(claudeDir) {
  return path.join(G.graphPaths(claudeDir).dir, "names.json");
}

// Every map here is keyed by data from the repository — a bare symbol name can
// be `constructor`, `toString` or `__proto__`. A plain object would hand back
// `Object.prototype`'s member instead of "nothing here", so maps are built with
// a null prototype and read through this.
function own(o, k) {
  return o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}
const bare = () => Object.create(null);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

// ── build ───────────────────────────────────────────────────────────────────
// Called by `graphUpdate` INSIDE the lock, after index.json is on disk. It
// never throws into the update: a cache that cannot be written is a slower
// graph, not a broken one.
function build(claudeDir, root) {
  const t0 = Date.now();
  const Q = require("./graph-query.js");
  try {
    // `noCache` matters: the writer must COMPUTE, never read back the cache it
    // is about to replace.
    const model = Q.loadModel(claudeDir, root, { noCache: true });
    if (!model) return { route: "skipped", reason: "no-index", ms: Date.now() - t0 };

    const callers = bare();
    const maybe = bare();
    for (const [rel, f] of Object.entries(model.byFile)) {
      for (const s of f.symbols || []) {
        s.file = rel;
        for (const c of s.calls || []) {
          const r = Q.resolveCall(model, rel, s, c);
          if (r.target && CONFIDENT.has(r.state)) {
            (own(callers, r.target) || (callers[r.target] = [])).push([s.id, c.line, r.state, c.ref ? 1 : 0]);
          } else if (r.state === "AMBIGUOUS") {
            for (const cand of r.candidates || []) {
              const m = own(maybe, cand) || (maybe[cand] = bare());
              m[rel] = (own(m, rel) || 0) + 1;
            }
          }
        }
      }
    }

    // One stable order, so the same tree always produces the same bytes.
    const out = {
      schema: RESOLVE_SCHEMA,
      engine: G.ENGINE,
      generation: model.meta.generation,
      gen_id: model.meta.gen_id,
      callers: sortedRows(callers),
      maybe: sortedCounts(maybe),
    };
    G.atomicWrite(resolvedPath(claudeDir), JSON.stringify(out));
    writeNames(claudeDir, model, out.callers);
    return { route: "full", ms: Date.now() - t0 };
  } catch (e) {
    // A cache is an optimisation. Losing it must never lose the update — and a
    // HALF-written one must never be read, so it goes.
    try {
      fs.rmSync(resolvedPath(claudeDir), { force: true });
      fs.rmSync(namesPath(claudeDir), { force: true });
    } catch (_) {}
    return { route: "failed", reason: String((e && e.message) || e), ms: Date.now() - t0 };
  }
}

function sortedObject(o) {
  const out = bare();
  for (const k of Object.keys(o).sort()) out[k] = o[k];
  return out;
}
function sortedRows(o) {
  const out = bare();
  for (const k of Object.keys(o).sort()) {
    out[k] = o[k].slice().sort((a, b) => String(a[0]).localeCompare(String(b[0])) || a[1] - b[1]);
  }
  return out;
}
// target → [[caller file, count], …], both levels in a stable order.
function sortedCounts(o) {
  const out = bare();
  for (const k of Object.keys(o).sort()) out[k] = Object.keys(o[k]).sort().map((f) => [f, o[k][f]]);
  return out;
}

// ── names.json ──────────────────────────────────────────────────────────────
// A bare name → the few symbols worth showing for it. This is the ONLY file a
// delivery hook is allowed to read: a name lookup, no index parse, no resolve.
function writeNames(claudeDir, model, callers) {
  const out = bare();
  for (const [name, syms] of model.byName) {
    const rows = syms
      .map((s) => ({ s, fan: (own(callers, s.id) || []).length }))
      .sort((a, b) => b.fan - a.fan || a.s.file.localeCompare(b.s.file))
      .slice(0, NAMES_PER_KEY)
      .map(({ s, fan }) => [s.qname, s.kind, s.file, s.lines[0], s.lines[1], fan]);
    if (rows.length) out[name] = rows;
  }
  G.atomicWrite(namesPath(claudeDir), JSON.stringify({ schema: RESOLVE_SCHEMA, generation: model.meta.generation, names: sortedObject(out) }));
}

// ── read ────────────────────────────────────────────────────────────────────
// Used ONLY when the generation matches. Anything else returns null and the
// reader computes, exactly as it did before this file existed.
function load(claudeDir, meta) {
  const r = readJson(resolvedPath(claudeDir));
  if (!r || r.schema !== RESOLVE_SCHEMA || r.engine !== G.ENGINE) return null;
  if (!meta || !meta.generation || r.generation !== meta.generation) return null;
  return r;
}

module.exports = { own, RESOLVE_SCHEMA, resolvedPath, namesPath, build, load };
