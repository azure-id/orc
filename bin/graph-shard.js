"use strict";
// ── orc graph — S1: SHARDED READS (v1.8.2 W8, DE-I) ─────────────────────────
//
// EW0 dropped sharding because the parse (235 ms) was smaller than the resolve
// (437 ms). EW2 then removed the resolve half by storing the reverse edges, and
// what is left on django is the parse: a one-symbol `ctx` opens a 23 MB
// `index.json` and a 15 MB `resolved.json` to answer a question about a handful
// of records.
//
// Measured on django/django (2,977 files, 44,572 symbols):
//
//     index.json       234 ms  ─┐
//     resolved.json    101 ms   ├─ 373 ms, every `ctx <symbol>`
//     names.json        37 ms  ─┘
//
//     files.json         3 ms  ─┐
//     names.json        37 ms   ├─ ~42 ms for the same answer
//     ~11 blobs          1 ms   │
//     1-3 shards         1 ms  ─┘
//
// THE RULE THAT MAKES THIS SAFE: the fast path answers, byte for byte, what the
// full model answers — or it does not answer at all. It never approximates.
// `fastModel()` returns null the moment it cannot PROVE its answer is the same
// one, and the caller loads the full model exactly as before. Every reason it
// gives up is named in `reason`, so a fast path that quietly stopped being fast
// is visible rather than invisible.
//
// The place it gives up most is target resolution. `names.json` is capped at
// `NAMES_PER_KEY` rows per bare name, so a name with six definitions shows five
// — which means "these are all of them" is only knowable BELOW the cap. Above
// it, and for a query that resolves through a URL, a file path, a line number
// or a fuzzy nearest-match, the full model is the only honest answer.
//
// WHAT IS STORED — `resolved/<ab>.json`, `<ab>` being the first two hex
// characters of the file's blob, which is the shard layout `blobs/` already
// uses:
//
//     callers  target symbol id -> the rows `resolved.json` holds, for targets
//              whose FILE hashes into this shard
//     maybe    target symbol id -> the AMBIGUOUS-caller counts, sharded with
//              the callers they belong to. Without it a fast card would print
//              no `maybe` line where the full card prints one, which is a
//              DIFFERENT card, not a shorter one.
//     calls    symbol id -> { u, r } for symbols whose OWN file hashes here.
//              `r` is one row per RESOLVED call, positional against the
//              symbol's `calls` array; `u` is how many of its calls resolved to
//              nothing. UNRESOLVED rows are not stored — they are 72% of the
//              calls in a real repository and the card only ever counts them.
//     cands    the AMBIGUOUS candidate lists, INTERNED. A name that is ambiguous
//              is ambiguous the same way everywhere it is called, so the same
//              list was being written once per call site: 25.3 MB of django's
//              shards, against 8.2 MB once each. An AMBIGUOUS row carries the
//              INDEX into this table, never the list.

const fs = require("fs");
const path = require("path");
const G = require("./graph.js");

const SHARD_SCHEMA = 1;
// The state words, as one byte each. The card prints words; the store does not
// have to repeat them 400,000 times.
const STATE_CODE = { LOCAL: 0, IMPORT: 1, UNIQUE: 2, ROUTE: 3, AMBIGUOUS: 4 };
const CODE_STATE = ["LOCAL", "IMPORT", "UNIQUE", "ROUTE", "AMBIGUOUS"];

const own = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// Thrown when the fast path discovers, HALFWAY through a card, that it cannot
// answer identically after all. The caller catches it and re-answers from the
// full model — the same fallback every other decline takes, just later.
class FastUnavailable extends Error {}

function shardDir(claudeDir) {
  return path.join(G.graphPaths(claudeDir).dir, "resolved");
}
function shardOf(blob) {
  return String(blob || "").slice(0, 2) || "00";
}
function shardPath(claudeDir, ab) {
  return path.join(shardDir(claudeDir), `${ab}.json`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

// ── build (called by `update`, inside the lock) ─────────────────────────────
// `callers` is the object `graph-resolve.build` already produced. `calls` is
// the forward half, collected in the SAME pass — every resolution is computed
// once and written twice, never computed twice.
function build(claudeDir, model, callers, maybe, calls) {
  const t0 = Date.now();
  const dir = shardDir(claudeDir);
  try {
    // A shard set from another generation must never be half-replaced. The
    // whole directory goes, then the new one is written.
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const buckets = new Map();
    const bucket = (rel) => {
      const ab = shardOf((model.byFile[rel] || {}).blob);
      let b = buckets.get(ab);
      if (!b) buckets.set(ab, (b = { callers: Object.create(null), maybe: Object.create(null), calls: Object.create(null), cands: [], candIdx: new Map() }));
      return b;
    };
    for (const [target, rows] of Object.entries(callers)) {
      const rel = String(target).split("#")[0];
      if (model.byFile[rel]) bucket(rel).callers[target] = rows;
    }
    for (const [target, rows] of Object.entries(maybe)) {
      const rel = String(target).split("#")[0];
      if (model.byFile[rel]) bucket(rel).maybe[target] = rows;
    }
    for (const [id, rec] of Object.entries(calls)) {
      const rel = String(id).split("#")[0];
      if (!model.byFile[rel]) continue;
      const b = bucket(rel);
      // The interning happens HERE, per shard, because a shard is the unit a
      // reader parses: a table shared across shards would mean reading a second
      // file to render one row.
      b.calls[id] = {
        u: rec.u,
        r: rec.r.map((row) => {
          if (row[1] !== STATE_CODE.AMBIGUOUS) return row;
          const key = (row[4] || []).join("\u0000");
          let at = b.candIdx.get(key);
          if (at === undefined) {
            at = b.cands.length;
            b.cands.push(row[4] || []);
            b.candIdx.set(key, at);
          }
          return [row[0], row[1], null, 0, at];
        }),
      };
    }
    let bytes = 0;
    for (const [ab, b] of buckets) {
      const body = JSON.stringify({
        schema: SHARD_SCHEMA,
        engine: G.ENGINE,
        generation: model.meta.generation,
        callers: b.callers,
        maybe: b.maybe,
        cands: b.cands,
        calls: b.calls,
      });
      bytes += body.length;
      G.atomicWrite(shardPath(claudeDir, ab), body);
    }
    return { route: "full", shards: buckets.size, bytes, ms: Date.now() - t0 };
  } catch (e) {
    // A shard set that cannot be written is a slower `ctx`, never a wrong one.
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
    return { route: "failed", reason: String((e && e.message) || e), ms: Date.now() - t0 };
  }
}

// One forward row: the call's INDEX in the symbol's own `calls` array, its
// state, its target, and — only for AMBIGUOUS — its candidate list.
function forwardRow(i, res) {
  const code = STATE_CODE[res.state];
  if (code === undefined) return null; // UNRESOLVED — counted, never stored
  if (res.state === "AMBIGUOUS") return [i, code, null, 0, res.candidates || []];
  return [i, code, res.target, res.inherited ? 1 : 0];
}

// ── read ────────────────────────────────────────────────────────────────────
// A mini-model that answers `ctx <symbol>` exactly as the full one does, or
// null with the reason it could not.
const NAMES_PER_KEY = 5;
const norm = (p) => String(p).split("\\").join("/").replace(/^\.\//, "");

function fastModel(claudeDir, root, query, opts) {
  // R1 (v1.9.1): `--callers-source` reads every caller FILE and asks git for
  // each one's freshness. The fast model holds blobs, not bytes, so the full
  // model answers — the same decline, for the same reason, as any other read
  // the fast path cannot prove.
  if (opts && opts.callersSource) return { model: null, reason: "callers-source" };
  const p = G.graphPaths(claudeDir);
  const meta = readJson(p.meta);
  if (!meta || !meta.generation) return { model: null, reason: "no-meta" };
  if (!fs.existsSync(shardDir(claudeDir))) return { model: null, reason: "no-shards" };

  const q = norm(query);
  // Everything the fast path cannot prove it would answer identically. Each of
  // these needs a whole-repository walk that `names.json` cannot stand in for.
  if (q.includes("/")) return { model: null, reason: "path-or-url" };
  if (/:\d+$/.test(q)) return { model: null, reason: "file-line" };
  if (!q || /\s/.test(q)) return { model: null, reason: "not-a-plain-name" };

  const files = readJson(p.files);
  if (!files) return { model: null, reason: "no-files" };
  const namesFile = readJson(require("./graph-resolve.js").namesPath(claudeDir));
  if (!namesFile || namesFile.generation !== meta.generation) return { model: null, reason: "names-stale" };

  const bare = q.split(".").pop();
  const rows = own(namesFile.names, bare);
  if (!rows) return { model: null, reason: "name-unknown" };
  // AT the cap, "these are all of them" stops being knowable. Below it, it is.
  if (rows.length >= NAMES_PER_KEY) return { model: null, reason: "name-at-cap" };
  const hits = rows.filter((r) => r[0] === q);
  if (hits.length !== 1) return { model: null, reason: hits.length ? "ambiguous-qname" : "qname-not-exact" };

  const rel = hits[0][2];
  const rec = files[rel];
  if (!rec) return { model: null, reason: "file-unknown" };

  const loaded = Object.create(null);
  const loadFile = (r) => {
    if (own(loaded, r) !== undefined) return loaded[r];
    const f = files[r];
    // A path the index never held is not an error — the full model would not
    // know it either, and both answer the same "no".
    if (!f) return (loaded[r] = null);
    const blob = readJson(path.join(p.blobs, f.blob.slice(0, 2), `${f.blob}.json`));
    // A file the index DOES hold, whose blob will not read, is different: the
    // full model has that file's symbols from `index.json` and would print a
    // row this path would drop. Dropping a row is a different card, so this
    // throws and the caller starts again with the full model.
    if (!blob) throw new FastUnavailable("blob-unreadable:" + r);
    for (const s of blob.symbols || []) s.file = r;
    return (loaded[r] = { ...blob, blob: f.blob });
  };

  let home;
  try {
    home = loadFile(rel);
  } catch (e) {
    return { model: null, reason: e instanceof FastUnavailable ? e.message : "blob-missing" };
  }
  if (!home) return { model: null, reason: "blob-missing" };
  const mine = (home.symbols || []).filter((s) => s.kind !== "module" && s.qname === q);
  // Two symbols with the same qname in one file (a Go build tag, a Python
  // redefinition) are a case the full model settles by width. It is rare and it
  // is not worth a second implementation.
  if (mine.length !== 1) return { model: null, reason: mine.length ? "duplicate-qname" : "not-in-blob" };
  const sym = mine[0];

  const shards = new Map();
  const shardFor = (r) => {
    const f = files[r];
    if (!f) return null;
    const ab = shardOf(f.blob);
    if (shards.has(ab)) return shards.get(ab);
    const s = readJson(shardPath(claudeDir, ab));
    const ok = s && s.schema === SHARD_SCHEMA && s.engine === G.ENGINE && s.generation === meta.generation ? s : null;
    shards.set(ab, ok);
    return ok;
  };
  if (!shardFor(rel)) return { model: null, reason: "shard-stale" };

  // `byFile` and `symbols` are LAZY: a blob is read the first time something
  // asks about the file it holds, and never again. A card about one symbol on
  // django touches about a dozen files, out of nearly three thousand.
  const byFile = new Proxy(Object.create(null), {
    get: (_, r) => (typeof r === "string" ? loadFile(r) || undefined : undefined),
    has: (_, r) => typeof r === "string" && !!files[r],
  });
  const symbols = {
    get(id) {
      const f = loadFile(String(id).split("#")[0]);
      if (!f) return undefined;
      return (f.symbols || []).find((s) => s.id === id);
    },
    has(id) {
      return this.get(id) !== undefined;
    },
    // Nothing on the fast path may walk every symbol — that is exactly the
    // whole-repository question this path exists to avoid. A caller that needs
    // it has already been sent to the full model.
    values() {
      throw new Error("graph-shard: the fast model has no symbol table to walk");
    },
  };

  // The target's own shard holds its callers AND its ambiguous-caller counts.
  // `ctx` asks for callers of the TARGET and of nothing else, so one shard is
  // the whole reverse half of this card.
  const s0 = shardFor(rel);
  const callersCache = Object.create(null);
  const maybeCache = Object.create(null);
  for (const [k, v] of Object.entries(s0.callers)) callersCache[k] = v;
  for (const [k, v] of Object.entries(s0.maybe || {})) maybeCache[k] = v;

  return {
    model: {
      root,
      meta,
      fast: true,
      notes: require("./graph-notes.js").noteIndex(claudeDir),
      byFile,
      fileSet: new Set(Object.keys(files)),
      symbols,
      byName: new Map(),
      bindings: new Map(),
      resolved: new Map(),
      callersCache,
      maybeCache,
      generation: meta.generation,
      suffix: new Map(),
      dirs: null,
      goModule: undefined,
      callIndex: null,
      routes: null,
      urlIndex: null,
      urlMemo: new Map(),
      blobStates: new Map(),
      // The forward half. `calleesOf` reads this instead of resolving, and a
      // symbol whose shard is missing sends the whole read back to the full
      // model rather than answering with fewer calls than it has.
      callsFor(s) {
        const sh = shardFor(String(s.id).split("#")[0]);
        if (!sh) return null;
        const rec = own(sh.calls, s.id) || { u: 0, r: [] };
        // The candidate table travels WITH the rows, so the caller never has to
        // know which shard a row came out of.
        return { u: rec.u, r: rec.r, cands: sh.cands || [] };
      },
    },
    sym,
    reason: null,
  };
}

module.exports = { SHARD_SCHEMA, STATE_CODE, CODE_STATE, FastUnavailable, shardDir, shardPath, shardOf, build, forwardRow, fastModel };
