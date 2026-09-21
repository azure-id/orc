"use strict";
// ── orc graph (v1.8.0) — the code graph STORE ───────────────────────────────
//
// A small, local, git-ignored map of how this repository is connected. This
// file owns the store and change detection. Extraction is `graph-extract.js`;
// resolution and the read commands are `graph-query.js`. `bin/cli.js` routes
// `orc graph …` and resolves the config — no module here reads
// `.claude/orc.config.yaml`.
//
// THE RULES THIS FILE HOLDS
//
//   1. A change is found from git's OWN blob SHAs. `git ls-files -s` hashes
//      every tracked file in one call; `git status` names the dirty and
//      untracked ones, and `git hash-object` hashes only those. Nothing is
//      parsed to find out whether it changed. (W0: 42 ms for 7,091 files.)
//   2. A record is CONTENT-ADDRESSED — `blobs/<ab>/<sha>.json`. A branch
//      switch back, a revert, or a teammate's identical file reuses it.
//   3. Writes are atomic (temp file + rename) and serialized by `.lock`.
//      Readers never take the lock: they see the old index or the new one.
//   4. The write ORDER is blobs → index.json → files.json → meta.json. A crash
//      between any two leaves files.json OLD, so the next status reads DRIFTED
//      and the next update redoes the work. Idempotent, never half-applied.
//   5. No background process and no timer, ever — a continuous rebuild is how
//      the graph tools in the research froze machines. EW3 adds two ONE-SHOT
//      triggers (a read that finds its own target stale, and an executor
//      finishing). Both take the lock below, and the loser SKIPS rather than
//      queues, so nothing can ever pile up.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const X = require("./graph-extract.js");

const SCHEMA = 1;
// Bumped whenever the record shape or extraction changes. A record made by an
// older engine is re-extracted, and status reads DRIFTED until it is.
// @3 (W9): route symbols + `ref` edges — an older index re-extracts once.
// @4 (EW1): per-file COVERAGE and a GENERATION on the index.
// @5 (v1.8.2): `urls`, `mounts`, decorator routes with `handler`, `bases`,
//     aliases, re-exports. A 1.8.1 store reads DRIFTED with `engine_stale` and
//     the next preflight (`status --heal`) re-extracts every file once.
const ENGINE = "graph@5";
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
const MAX_BYTES = 512 * 1024;
const LOCK_STALE_MS = 10 * 60 * 1000;
// Measured on this machine class: nestjs/nest 1.3 ms per file (heuristic),
// django/django 3.5 ms per file on 1.8.1 and 5.6 ms on 1.8.2 (Python ast +
// masking + the W1/W2 alias, decorator and re-export passes). The estimate
// uses the slower one — a first build that finishes early is fine, one that
// overruns its own estimate teaches people to ignore it.
const EST_MS_PER_FILE = 5.6;
const ESTIMATE_ABOVE = 2000;

const LANG_BY_EXT = {
  ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "js",
  ".ts": "ts", ".tsx": "ts", ".mts": "ts", ".cts": "ts",
  ".py": "py",
  ".go": "go",
  ".java": "java",
  ".cs": "cs",
  ".php": "php",
  // v1.8.2 W5 (G6) — the heuristic rung gains Ruby, Rust, Kotlin, the two
  // single-file component formats, and C/C++.
  ".rb": "rb", ".rake": "rb",
  ".rs": "rs",
  ".kt": "kt", ".kts": "kt",
  // A single-file component is its `<script>` block, parsed as js or ts. The
  // rest of the file is blanked, so every line number is the file's own.
  ".vue": "vue",
  ".svelte": "svelte",
  ".c": "c", ".h": "c", ".cc": "c", ".cpp": "c", ".cxx": "c", ".hpp": "c", ".hh": "c",
};

// Never part of the map, whatever git says: ORC's own tree, installed or
// vendored dependencies (sometimes committed), build output, caches, minified
// or bundled JS, generated files, and `.d.ts` declarations (v1.8.2 W2 — a
// declaration file duplicates every symbol of its module and made each one
// AMBIGUOUS). `dist/` and `build/` are skipped at the ROOT only: `pkg/build/`
// is a package name in more than one real repository. A skipped path has no
// record, so `coverage` reports it `excluded`, never silently.
const ALWAYS_SKIP = /^(\.claude\/|dist\/|build\/|out\/|target\/(debug|release)\/)|(^|\/)(node_modules|vendor|__pycache__|\.next|\.nuxt|\.venv|venv|target\/classes)\/|\.(min|bundle|chunk)\.js$|\.d\.ts$|\.generated\.[A-Za-z]+$|\.pb\.go$|_pb2\.py$/;

function graphPaths(claudeDir) {
  const dir = path.join(claudeDir, "orc", "graph");
  return {
    dir,
    meta: path.join(dir, "meta.json"),
    files: path.join(dir, "files.json"),
    index: path.join(dir, "index.json"),
    blobs: path.join(dir, "blobs"),
    notes: path.join(dir, "notes.jsonl"),
    lock: path.join(dir, ".lock"),
  };
}

function globRe(g) {
  const raw = String(g).replace(/^\.\//, "");
  const esc = raw
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__GLOBSTAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/__GLOBSTAR__/g, ".*");
  // gitignore's rule (W2): a pattern with no slash matches at ANY depth
  // (`*.gen.ts`, `__snapshots__`); one with a slash is anchored at the root.
  const anchored = raw.replace(/\/$/, "").includes("/");
  return new RegExp("^" + (anchored ? "" : "(?:.*/)?") + esc + "(/|$)");
}

function makeFilter(ignore) {
  const res = (Array.isArray(ignore) ? ignore : []).filter(Boolean).map(globRe);
  return (rel) => {
    if (ALWAYS_SKIP.test(rel)) return null;
    if (res.some((re) => re.test(rel))) return null;
    return LANG_BY_EXT[path.extname(rel).toLowerCase()] || null;
  };
}

function git(root, args, input) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: GIT_MAX_BUFFER, input });
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

// Windows can refuse a rename for a moment while another process has the
// target open (a reader mid-parse). A short retry is the whole remedy.
function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (i >= 5 || (e.code !== "EPERM" && e.code !== "EBUSY" && e.code !== "EACCES")) {
        try { fs.rmSync(tmp, { force: true }); } catch (_) {}
        throw e;
      }
      const until = Date.now() + 20 * (i + 1);
      while (Date.now() < until) {} // eslint-disable-line no-empty
    }
  }
}

// ── the lock ────────────────────────────────────────────────────────────────
function acquireLock(p) {
  fs.mkdirSync(p.dir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(p.lock, "wx");
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: stamp(new Date()) }));
      fs.closeSync(fd);
      return { ok: true };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let age = 0;
      try {
        age = Date.now() - fs.statSync(p.lock).mtimeMs;
      } catch (_) {
        continue; // released between the open and the stat
      }
      // A writer that died leaves its lock behind. Ten minutes is far past any
      // real update (W0: 1.7 s for Django), so an older lock is a dead one.
      if (age > LOCK_STALE_MS) {
        try { fs.rmSync(p.lock, { force: true }); } catch (_) {}
        continue;
      }
      return { ok: false, holder: readJson(p.lock), age_ms: Math.round(age) };
    }
  }
  return { ok: false, holder: readJson(p.lock), age_ms: null };
}

function releaseLock(p) {
  try { fs.rmSync(p.lock, { force: true }); } catch (_) {}
}

// ── detection ───────────────────────────────────────────────────────────────
// Returns { ok, files: Map<rel, blob>, langs, head } or { ok:false, reason }.
function detect(root, opts) {
  const langOf = makeFilter(opts && opts.ignore);
  const ls = git(root, ["ls-files", "-s", "-z"]);
  if (ls.error || ls.status !== 0) return { ok: false, reason: "not-git" };
  const files = new Map();
  const langs = new Map();
  for (const rec of ls.stdout.split("\0")) {
    if (!rec) continue;
    const tab = rec.indexOf("\t");
    if (tab < 0) continue;
    const [mode, blob] = rec.slice(0, tab).split(" ");
    const rel = rec.slice(tab + 1);
    if (mode === "160000") continue; // a submodule is another repository
    const lang = langOf(rel);
    if (!lang) continue;
    // A conflicted file lists up to three stages; the working tree decides
    // below, so the first stage seen is only a placeholder.
    if (!files.has(rel)) files.set(rel, blob);
    langs.set(rel, lang);
  }

  const st = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"]);
  if (st.error || st.status !== 0) return { ok: false, reason: "git-status-failed" };
  const hashMe = [];
  for (const rec of st.stdout.split("\0")) {
    if (!rec || rec.length < 4) continue;
    const x = rec[0];
    const y = rec[1];
    const rel = rec.slice(3);
    const lang = langOf(rel);
    if (!lang) continue;
    if (y === "D") {
      files.delete(rel);
      langs.delete(rel);
      continue;
    }
    // `ls-files -s` already carries the STAGED content. Only a working-tree
    // difference (M, T, U, A with intent-to-add) or an untracked file needs its
    // own hash.
    if (x === "?" || x === "U" || y === "M" || y === "T" || y === "U" || y === "A") {
      hashMe.push(rel);
      langs.set(rel, lang);
    }
  }
  if (hashMe.length) {
    // No --no-filters on purpose: the clean filter (autocrlf on Windows) must
    // run, or every CRLF file would hash differently from its index blob and
    // read as changed forever.
    const h = git(root, ["hash-object", "--stdin-paths"], hashMe.join("\n") + "\n");
    if (h.error || h.status !== 0) return { ok: false, reason: "hash-object-failed" };
    const shas = h.stdout.split(/\r?\n/).filter(Boolean);
    hashMe.forEach((rel, i) => {
      if (shas[i]) files.set(rel, shas[i]);
    });
  }
  const head = git(root, ["rev-parse", "HEAD"]);
  return {
    ok: true,
    files,
    langs,
    head: head.status === 0 ? head.stdout.trim() : null,
  };
}

function diffFiles(prev, cur) {
  const added = [];
  const changed = [];
  const deleted = [];
  for (const [rel, blob] of cur) {
    const was = prev[rel];
    if (!was) added.push(rel);
    else if (was.blob !== blob) changed.push(rel);
  }
  for (const rel of Object.keys(prev)) if (!cur.has(rel)) deleted.push(rel);
  return { added, changed, deleted };
}

function blobPath(p, blob) {
  return path.join(p.blobs, blob.slice(0, 2), `${blob}.json`);
}

// ── generation (EW1) ────────────────────────────────────────────────────────
// `generation` counts index-changing writes; `gen_id` names the CONTENT those
// writes produced. A reader compares the number (cheap) and a second store —
// the resolution cache — pins itself to it. Two machines that index the same
// tree get the same `gen_id` and different `generation` numbers, so the id is
// what a card may quote and the number is what a cache may compare.
function genId(filesOut) {
  const h = crypto.createHash("sha1");
  for (const rel of Object.keys(filesOut).sort()) h.update(`${rel} ${(filesOut[rel] || {}).blob || ""} `);
  return h.digest("hex").slice(0, 8);
}

// What the extractor saw of ONE file, from the record it already wrote. A path
// with no record at all is `excluded` — git does not track it, an ignore glob
// dropped it, or the language has no extractor.
function coverageOf(entry) {
  if (!entry) return { coverage: "excluded" };
  if (entry.skipped) return { coverage: `skipped:${entry.skipped}` };
  if (entry.coverage === "partial") return { coverage: "partial", ranges: entry.partial || [] };
  return { coverage: "full" };
}

// ── status ──────────────────────────────────────────────────────────────────
// exit 0 FRESH · 1 NONE (or unavailable) · 2 DRIFTED · 3 OFF
function graphStatus(claudeDir, root, opts) {
  const p = graphPaths(claudeDir);
  const meta = readJson(p.meta);
  const prev = readJson(p.files);
  const base = {
    ok: true,
    enabled: !!opts.enabled,
    exists: !!(meta && prev),
    files: meta ? meta.files : 0,
    symbols: meta ? meta.symbols : 0,
    updated_at: meta ? meta.updated_at : null,
    head_commit: meta ? meta.head_commit : null,
    engine: meta ? meta.engine : null,
    generation: meta ? meta.generation || 0 : 0,
    gen_id: meta ? meta.gen_id || null : null,
  };
  if (!opts.enabled) return { ...base, state: "off", exit: 3 };
  if (!meta || !prev) return { ...base, state: "none", exit: 1 };
  const d = detect(root, opts);
  if (!d.ok) return { ...base, ok: false, state: "unavailable", reason: d.reason, exit: 1 };
  const diff = diffFiles(prev, d.files);
  const behind = { added: diff.added.length, changed: diff.changed.length, deleted: diff.deleted.length };
  const engineStale = meta.engine !== ENGINE || meta.schema !== SCHEMA;
  const n = behind.added + behind.changed + behind.deleted;
  if (n || engineStale) return { ...base, state: "drifted", behind, engine_stale: engineStale, exit: 2 };
  return { ...base, state: "fresh", behind, engine_stale: false, exit: 0 };
}

// ── update ──────────────────────────────────────────────────────────────────
// exit 0 built/updated/unchanged · 1 unavailable (not git, locked, io) · 3 off
function graphUpdate(claudeDir, root, opts) {
  const t0 = Date.now();
  const say = opts.say || (() => {});
  if (!opts.enabled && opts.ifEnabled) return { ok: true, enabled: false, state: "off", exit: 3 };
  const p = graphPaths(claudeDir);
  const d = detect(root, opts);
  if (!d.ok) return { ok: false, enabled: !!opts.enabled, state: "unavailable", reason: d.reason, exit: 1 };

  const lock = acquireLock(p);
  if (!lock.ok) {
    return { ok: false, enabled: !!opts.enabled, state: "unavailable", reason: "locked", holder: lock.holder, age_ms: lock.age_ms, exit: 1 };
  }
  try {
    const prevMeta = readJson(p.meta);
    const prevFiles = readJson(p.files);
    const first = !prevMeta || !prevFiles;
    const upgrade = !first && (prevMeta.engine !== ENGINE || prevMeta.schema !== SCHEMA);
    const prev = first ? {} : prevFiles;
    const fresh = { schema: SCHEMA, engine: ENGINE, by_file: {} };
    const index = first || upgrade ? fresh : readJson(p.index) || fresh;

    const diff = diffFiles(prev, d.files);
    // An engine upgrade re-extracts everything. A missing index entry is
    // repaired too — that is how a crash between two writes heals.
    const work = new Set([...diff.added, ...diff.changed]);
    if (upgrade) for (const rel of d.files.keys()) work.add(rel);
    for (const rel of d.files.keys()) if (!index.by_file[rel]) work.add(rel);

    if (first && work.size > ESTIMATE_ABOVE) {
      say(`graph: building first index (~${work.size} files, est. ${Math.max(1, Math.round((work.size * EST_MS_PER_FILE) / 1000))} s)`);
    }

    // Phase 1 — reuse what is already on disk; read the rest.
    let reused = 0;
    let skipped = 0;
    const records = new Map();
    const toExtract = [];
    for (const rel of work) {
      const blob = d.files.get(rel);
      const lang = d.langs.get(rel);
      const have = readJson(blobPath(p, blob));
      if (have && have.schema === SCHEMA && have.engine === ENGINE) {
        records.set(rel, have);
        reused++;
        continue;
      }
      const abs = path.join(root, ...rel.split("/"));
      try {
        const size = fs.statSync(abs).size;
        if (size > MAX_BYTES) records.set(rel, { schema: SCHEMA, engine: ENGINE, blob, lang, bytes: size, skipped: "too-large", coverage: "skipped", imports: [], symbols: [] });
        else toExtract.push({ rel, abs, lang, blob, bytes: size, src: fs.readFileSync(abs, "utf8") });
      } catch (_) {
        records.set(rel, { schema: SCHEMA, engine: ENGINE, blob, lang, bytes: 0, skipped: "unreadable", coverage: "skipped", imports: [], symbols: [] });
      }
    }

    // Phase 2 — extract in ONE batch (one Python process for every .py file).
    const out = X.extractBatch(toExtract, { root });
    for (const it of toExtract) {
      const r = out.get(it.rel) || { extractor: X.HEURISTIC, imports: [], symbols: [] };
      records.set(it.rel, {
        schema: SCHEMA,
        engine: ENGINE,
        blob: it.blob,
        lang: it.lang,
        bytes: it.bytes,
        lines: r.lines || 0,
        extractor: r.extractor,
        ...(r.error ? { skipped: r.error } : {}),
        coverage: r.error ? "skipped" : r.coverage || "full",
        ...(r.partial ? { partial: r.partial } : {}),
        imports: r.imports,
        symbols: r.symbols,
        ...(r.reexports ? { reexports: r.reexports } : {}),
      });
    }
    for (const [rel, record] of records) {
      if (!toExtract.some((t) => t.rel === rel) && reused && readJson(blobPath(p, record.blob))) continue;
      const file = blobPath(p, record.blob);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      atomicWrite(file, JSON.stringify(record));
    }

    const filesOut = {};
    for (const [rel, blob] of d.files) {
      const record = records.get(rel);
      if (record) {
        if (record.skipped) skipped++;
        index.by_file[rel] = {
          blob,
          lang: record.lang,
          bytes: record.bytes || 0,
          lines: record.lines || 0,
          ...(record.skipped ? { skipped: record.skipped } : {}),
          ...(record.coverage && record.coverage !== "full" ? { coverage: record.coverage } : {}),
          ...(record.partial ? { partial: record.partial } : {}),
          imports: record.imports,
          symbols: record.symbols,
          ...(record.reexports ? { reexports: record.reexports } : {}),
        };
        filesOut[rel] = {
          blob,
          lang: record.lang,
          bytes: record.bytes,
          ...(record.lines ? { lines: record.lines } : {}),
          ...(record.extractor ? { extractor: record.extractor } : {}),
          ...(record.skipped ? { skipped: record.skipped } : {}),
          ...(record.coverage && record.coverage !== "full" ? { coverage: record.coverage } : {}),
          ...(record.partial ? { partial: record.partial } : {}),
        };
      } else {
        filesOut[rel] = prev[rel];
      }
    }
    for (const rel of Object.keys(index.by_file)) if (!d.files.has(rel)) delete index.by_file[rel];

    let symbols = 0;
    for (const v of Object.values(index.by_file)) symbols += (v.symbols || []).filter((s) => s.kind !== "module").length;
    const unchanged = !first && !upgrade && work.size === 0 && diff.deleted.length === 0;

    const gen = genId(filesOut);
    const meta = {
      schema: SCHEMA,
      engine: ENGINE,
      head_commit: d.head,
      updated_at: unchanged && prevMeta ? prevMeta.updated_at : stamp(new Date()),
      files: d.files.size,
      symbols,
      // The number goes up only when the index on disk changes, so a reader
      // that saw generation N is looking at exactly the index that wrote N.
      generation: unchanged && prevMeta && prevMeta.generation ? prevMeta.generation : ((prevMeta && prevMeta.generation) || 0) + 1,
      gen_id: gen,
      // EW3: how long the last real update took, end to end. A read that may
      // heal uses it as the estimate for the next one — the only honest
      // estimate available, because an update cannot be stopped half way.
      update_ms: unchanged && prevMeta ? prevMeta.update_ms || 0 : 0,
    };
    if (!unchanged) {
      index.schema = SCHEMA;
      index.engine = ENGINE;
      atomicWrite(p.index, JSON.stringify(index));
      atomicWrite(p.files, JSON.stringify(filesOut));
      atomicWrite(p.meta, JSON.stringify(meta, null, 2) + "\n");
    }
    // EW2: the DERIVED resolution cache, written inside this same lock, AFTER
    // meta.json — it reads the generation it must pin itself to. It is an
    // optimisation: a route of `failed` leaves the graph correct and only
    // slower, so it never changes this function's answer.
    // S2 (v1.8.2 W2): the index is already in memory — `build` must not read
    // the 21 MB file it just wrote a second time. One parse per update.
    const resolveRoute = unchanged && require("./graph-resolve.js").load(claudeDir, meta)
      ? { route: "unchanged", ms: 0 }
      : require("./graph-resolve.js").build(claudeDir, root, index);
    // EW3: stamp the duration. A second 200-byte write of the same file, not a
    // second commit point — every other field is already the one just written,
    // so a crash between the two leaves a valid meta that only lacks an
    // estimate, and a missing estimate simply means "heal, and find out".
    if (!unchanged) {
      meta.update_ms = Date.now() - t0;
      atomicWrite(p.meta, JSON.stringify(meta, null, 2) + "\n");
    }
    return {
      ok: true,
      enabled: !!opts.enabled,
      state: first ? "built" : unchanged ? "unchanged" : "updated",
      files: d.files.size,
      symbols,
      generation: meta.generation,
      gen_id: meta.gen_id,
      route: resolveRoute.route,
      ...(resolveRoute.reason ? { route_reason: resolveRoute.reason } : {}),
      added: diff.added.length,
      changed: diff.changed.length,
      deleted: diff.deleted.length,
      parsed: toExtract.length,
      reused,
      skipped,
      engine_upgrade: upgrade,
      head_commit: d.head,
      ms: Date.now() - t0,
      exit: 0,
    };
  } finally {
    releaseLock(p);
  }
}

// ── coverage ────────────────────────────────────────────────────────────────
// exit 0 always when a graph exists — a gap IS the answer, never an error.
// exit 1 no index · 3 off (with --if-enabled)
//
// It reads `files.json` (444 KB on django/django) and NEVER `index.json`
// (22 MB), because the only question is how much of each file was seen.
function graphCoverage(claudeDir, root, opts) {
  const p = graphPaths(claudeDir);
  const meta = readJson(p.meta);
  const files = readJson(p.files);
  if (!meta || !files) return { ok: false, state: "none", reason: "no-index", exit: 1 };
  const paths = (opts.paths || []).map((x) => String(x).split("\\").join("/").replace(/^\.\//, ""));
  // One `hash-object` for every path that is still on disk — the batch command
  // must not pay one git process per file.
  const onDisk = paths.filter((rel) => files[rel] && fs.existsSync(path.join(root, ...rel.split("/"))));
  const shas = new Map();
  if (onDisk.length) {
    const h = git(root, ["hash-object", "--stdin-paths"], onDisk.join("\n") + "\n");
    if (h.status === 0) {
      const out = h.stdout.split(/\r?\n/).filter(Boolean);
      onDisk.forEach((rel, i) => shas.set(rel, out[i]));
    }
  }
  const rows = [];
  for (const rel of paths) {
    const entry = files[rel];
    const c = coverageOf(entry);
    let changed = null;
    if (entry) {
      if (!fs.existsSync(path.join(root, ...rel.split("/")))) changed = "deleted";
      else if (!shas.has(rel)) changed = "unknown";
      else changed = shas.get(rel) === entry.blob ? "current" : "changed";
    }
    rows.push({ path: rel, ...c, changed_since_index: changed });
  }
  const gaps = rows.filter((r) => r.coverage !== "full").length;
  return {
    ok: true,
    state: "found",
    generation: meta.generation || 0,
    gen_id: meta.gen_id || null,
    rows,
    gaps,
    exit: 0,
  };
}

// ── gc ──────────────────────────────────────────────────────────────────────
// exit 0 done · 1 none or locked
function graphGc(claudeDir) {
  const p = graphPaths(claudeDir);
  const files = readJson(p.files);
  if (!files) return { ok: false, state: "none", reason: "no-index", exit: 1 };
  const lock = acquireLock(p);
  if (!lock.ok) return { ok: false, state: "unavailable", reason: "locked", holder: lock.holder, exit: 1 };
  try {
    const keep = new Set(Object.values(files).map((f) => f.blob));
    let removed = 0;
    let kept = 0;
    let bytes = 0;
    let shards = [];
    try {
      shards = fs.readdirSync(p.blobs);
    } catch (_) {}
    for (const shard of shards) {
      const dir = path.join(p.blobs, shard);
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch (_) {
        continue;
      }
      for (const name of names) {
        const blob = name.replace(/\.json$/, "");
        const full = path.join(dir, name);
        if (name.endsWith(".json") && keep.has(blob)) {
          kept++;
          continue;
        }
        try {
          bytes += fs.statSync(full).size;
          fs.rmSync(full, { force: true });
          removed++;
        } catch (_) {}
      }
      try {
        if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
      } catch (_) {}
    }
    // S1 (v1.8.2 W8): a shard set from an older generation is never READ — a
    // reader refuses it on the generation check — but it is still tens of
    // megabytes nobody will ever open. An update replaces the set wholesale, so
    // the only way to get here is a crash between two writes.
    let deadShards = { removed: 0, bytes: 0 };
    try {
      const S = require("./graph-shard.js");
      const dir = S.shardDir(claudeDir);
      const meta = readJson(p.meta);
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const j = readJson(full);
        if (j && meta && j.generation === meta.generation && j.engine === ENGINE) continue;
        deadShards.bytes += fs.statSync(full).size;
        fs.rmSync(full, { force: true });
        deadShards.removed++;
      }
    } catch (_) {}

    // A temp file left by a writer that died mid-write.
    for (const name of fs.readdirSync(p.dir)) {
      if (name.endsWith(".tmp")) {
        try { fs.rmSync(path.join(p.dir, name), { force: true }); } catch (_) {}
      }
    }
    // Compact the notes ledger in the same locked pass: the latest note per
    // symbol whose body still hashes the same, and nothing else.
    const notes = require("./graph-notes.js").compactNotes(p, readJson(p.index), atomicWrite);
    // K1 (v1.8.2 W4b): the gain ledger is capped in the same locked pass. It is
    // append-only between compactions, exactly like the notes ledger.
    const gain = require("./graph-gain.js").compact(p, atomicWrite);
    return { ok: true, state: "done", removed, kept, bytes_freed: bytes + deadShards.bytes, shards: deadShards, notes, gain, exit: 0 };
  } finally {
    releaseLock(p);
  }
}

module.exports = {
  SCHEMA,
  ENGINE,
  LANG_BY_EXT,
  graphPaths,
  detect,
  diffFiles,
  graphStatus,
  graphUpdate,
  graphCoverage,
  coverageOf,
  genId,
  graphGc,
  // shared with graph-notes.js — one lock, one atomic writer, one date format
  acquireLock,
  releaseLock,
  atomicWrite,
  stamp,
};
