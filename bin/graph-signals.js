"use strict";
// ── orc graph — CHEAP SIGNALS for planners and reviewers (v1.8.0 EW5) ───────
//
// Four answers that cost NO model tokens, because every one of them is already
// on disk: git's own history, and the index the parser already built.
//
//   changes    what this diff actually touched, who calls it, and how risky
//              that is. A reviewer asking `impact` on the DECLARED files gets
//              the whole file; this gets the symbols the HUNKS overlap.
//   importance one number per symbol, so a card's rows are ordered by what
//              matters instead of by raw fan-in. A helper called from forty
//              places is not more important than the exported entry point.
//   tests      the test files that reach a symbol — by CALL (the graph) and by
//              NAME (`x.test.js` beside `x.js`). Both, because a test that
//              imports a module without naming a symbol is still its test.
//   cochange   the files that historically change together with this one. The
//              planner's question "what else will I have to touch" is answered
//              by history far better than by static edges.
//
// THE RULE THAT SHAPES ALL FOUR: a signal is a HINT with its evidence attached.
// `changes` says WHY a symbol is high risk (exported, fan-in 4, no test caller),
// never just "high". A number nobody can check is a number nobody should act on.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const G = require("./graph.js");

const GIT_MAX_BUFFER = 256 * 1024 * 1024;
// A merge or a sweeping rename touches hundreds of files and would make every
// pair look related. CBM's threshold, and the same reason: a commit that broad
// carries no information about which two files belong together.
const COCHANGE_MAX_FILES = 20;
const COCHANGE_MIN = 3;
const COCHANGE_SINCE = "6.months";
const COCHANGE_ROWS = 12;

function git(root, args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: GIT_MAX_BUFFER });
}

const norm = (p) => String(p).split("\\").join("/").replace(/^\.\//, "");

// ── importance ──────────────────────────────────────────────────────────────
// sqrt of the confident in-edges, then knocked down by an order of magnitude for
// each thing that makes a symbol less likely to be what you are looking for.
// The square root matters: a symbol with 100 callers is not ten times more
// important than one with 10, it is a utility.
function importance(model, sym, fanIn) {
  let v = Math.sqrt(Math.max(0, fanIn));
  if (!sym.exported) v *= 0.1;
  // A name defined in five or more files is a convention (`handler`, `index`,
  // `run`), not a landmark.
  const sameName = (model.byName.get(sym.name) || []).length;
  if (sameName >= 5) v *= 0.1;
  if (require("./graph-query.js").TEST_FILE.test(sym.file)) v *= 0.1;
  return Math.round(v * 1000) / 1000;
}

// ── tests ───────────────────────────────────────────────────────────────────
// The naming half. `src/order.js` is tested by `order.test.js`, `test_order.py`,
// `order_test.go`, `OrderTest.java` — wherever they live.
function testsByName(model, rel) {
  const base = path.posix.basename(rel).replace(/\.[^.]+$/, "");
  if (!base) return [];
  const want = new Set([
    `${base}.test`,
    `${base}.spec`,
    `test_${base}`,
    `${base}_test`,
    `${base}Test`,
    `${base}Tests`,
  ]);
  const out = [];
  for (const f of model.fileSet) {
    if (f === rel) continue;
    const stem = path.posix.basename(f).replace(/\.[^.]+$/, "");
    if (want.has(stem)) out.push(f);
  }
  return out.sort();
}

// ── changes ─────────────────────────────────────────────────────────────────
// exit 0 answered · 1 no graph or not a git repository
//
// `git diff -U0` gives the hunks. A symbol whose line range overlaps a hunk was
// really touched; a symbol elsewhere in the same file was not, and saying it was
// is what makes a whole-file `impact` noisy at review time.
function parseDiff(text) {
  const byFile = new Map();
  let cur = null;
  for (const line of String(text).split("\n")) {
    const f = /^\+\+\+ b\/(.*)$/.exec(line);
    if (f) {
      cur = f[1] === "/dev/null" ? null : norm(f[1]);
      if (cur && !byFile.has(cur)) byFile.set(cur, []);
      continue;
    }
    if (!cur) continue;
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (h) {
      const start = Number(h[1]);
      const count = h[2] === undefined ? 1 : Number(h[2]);
      // A pure deletion has a zero-length new side; it still touched the line it
      // was removed from, so record it as a one-line hunk there.
      byFile.get(cur).push(count === 0 ? [start, start] : [start, start + count - 1]);
    }
  }
  return byFile;
}

// The paths this diff touches, by name only — two cheap git calls, no parsing.
// `changes` is a REVIEW-time command, so it heals on these before it answers:
// a reviewer told "nothing depends on this" by a stale index is worse served
// than one told nothing at all.
function changedPaths(root, base) {
  const out = [];
  const d = git(root, base ? ["diff", "--name-only", "-z", base, "--"] : ["diff", "--name-only", "-z", "HEAD", "--"]);
  if (d.status === 0) for (const f of d.stdout.split("\0")) if (f) out.push(norm(f));
  const u = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (u.status === 0) for (const f of u.stdout.split("\0")) if (f) out.push(norm(f));
  return [...new Set(out)];
}

function graphChanges(claudeDir, root, opts) {
  const Q = require("./graph-query.js");
  const model = Q.loadModel(claudeDir, root);
  if (!model) return { ok: false, state: "none", reason: "no-index", exit: 1 };
  const base = opts.base || null;
  const d = git(root, base ? ["diff", "-U0", base, "--"] : ["diff", "-U0", "HEAD", "--"]);
  if (d.error || d.status !== 0) return { ok: false, state: "unavailable", reason: "git-diff-failed", exit: 1 };
  const hunks = parseDiff(d.stdout);

  // An untracked file is a change too, and `git diff` never mentions it. Its
  // whole body is the hunk.
  const un = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (un.status === 0) {
    for (const rel of un.stdout.split("\0")) {
      if (!rel) continue;
      const r = norm(rel);
      if (!hunks.has(r)) hunks.set(r, [[1, Number.MAX_SAFE_INTEGER]]);
    }
  }

  const rows = [];
  const files = [...hunks.keys()].filter((f) => model.fileSet.has(f)).sort();
  const indexable = new Set(Object.keys(G.LANG_BY_EXT));
  const absent = [...hunks.keys()]
    .filter((f) => !model.fileSet.has(f) && indexable.has(path.posix.extname(f).toLowerCase()))
    .sort();
  for (const rel of files) {
    const ranges = hunks.get(rel);
    for (const sym of (model.byFile[rel] || {}).symbols || []) {
      if (sym.kind === "module") continue;
      const touched = ranges.some((h) => sym.lines[0] <= h[1] && h[0] <= sym.lines[1]);
      if (!touched) continue;
      const c = Q.callersOf(model, sym);
      const callerFiles = [...new Set(c.confident.map((x) => x.sym.file))];
      const tests = [...new Set([...callerFiles.filter((f) => Q.TEST_FILE.test(f)), ...testsByName(model, rel)])];
      // The reason is part of the answer. "high" with nothing behind it is a
      // number nobody can check, and nobody should act on.
      const why = [];
      if (sym.exported) why.push("exported");
      why.push(`fan-in ${c.confident.length}`);
      if (!tests.length) why.push("no test reaches it");
      if (c.maybe) why.push(`${c.maybe} ambiguous caller(s) not counted`);
      const risk = sym.exported && c.confident.length >= 3 && !tests.length ? "high" : sym.exported || c.confident.length >= 1 ? "medium" : "low";
      rows.push({
        id: sym.id,
        qname: sym.qname,
        kind: sym.kind,
        file: rel,
        lines: sym.lines,
        exported: !!sym.exported,
        fan_in: c.confident.length,
        maybe_callers: c.maybe,
        caller_files: callerFiles.sort(),
        tests: tests.sort(),
        risk,
        why,
      });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  rows.sort((a, b) => order[a.risk] - order[b.risk] || b.fan_in - a.fan_in || a.file.localeCompare(b.file) || a.lines[0] - b.lines[0]);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const r of rows) counts[r.risk]++;
  return {
    ok: true,
    state: "found",
    base: base || "HEAD",
    files,
    not_in_graph: absent,
    symbols: rows,
    counts,
    generation: model.meta.generation || 0,
    exit: 0,
  };
}

// ── cochange ────────────────────────────────────────────────────────────────
// exit 0 answered · 1 no graph, or git could not answer · 4 nothing reaches the
// threshold (an ANSWER: this file changes alone)
//
// Cached per HEAD. History does not move under a working-tree edit, so the cache
// is valid for exactly as long as HEAD is.
function cochangePath(claudeDir) {
  return path.join(G.graphPaths(claudeDir).dir, "cochange.json");
}

function buildCochange(root) {
  const r = git(root, ["log", `--since=${COCHANGE_SINCE}`, "--name-only", "--pretty=format:%x00", "--no-merges"]);
  if (r.error || r.status !== 0) return null;
  const pairs = Object.create(null);
  const total = Object.create(null);
  for (const commit of r.stdout.split("\0")) {
    const files = commit.split("\n").map((x) => x.trim()).filter(Boolean).map(norm);
    const uniq = [...new Set(files)];
    if (uniq.length < 2 || uniq.length > COCHANGE_MAX_FILES) continue;
    for (const f of uniq) total[f] = (total[f] || 0) + 1;
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const k = uniq[i] < uniq[j] ? `${uniq[i]}\u0000${uniq[j]}` : `${uniq[j]}\u0000${uniq[i]}`;
        pairs[k] = (pairs[k] || 0) + 1;
      }
    }
  }
  return { pairs, total };
}

function graphCochange(claudeDir, root, opts) {
  const rel = norm(opts.file || "");
  if (!rel) return { ok: false, reason: "missing-operand", exit: 1 };
  const head = git(root, ["rev-parse", "HEAD"]);
  if (head.status !== 0) return { ok: false, state: "unavailable", reason: "not-git", exit: 1 };
  const at = head.stdout.trim();

  let cache = null;
  try {
    cache = JSON.parse(fs.readFileSync(cochangePath(claudeDir), "utf8"));
  } catch (_) {}
  if (!cache || cache.head !== at || cache.schema !== 1) {
    const built = buildCochange(root);
    if (!built) return { ok: false, state: "unavailable", reason: "git-log-failed", exit: 1 };
    cache = { schema: 1, head: at, since: COCHANGE_SINCE, ...built };
    try {
      G.atomicWrite(cochangePath(claudeDir), JSON.stringify(cache));
    } catch (_) {}
  }

  const rows = [];
  const pre = rel + "\u0000";
  const suf = "\u0000" + rel;
  for (const [k, n] of Object.entries(cache.pairs || {})) {
    if (n < COCHANGE_MIN) continue;
    let other = null;
    if (k.startsWith(pre)) other = k.slice(pre.length);
    else if (k.endsWith(suf)) other = k.slice(0, k.length - suf.length);
    if (!other) continue;
    const own = (cache.total || {})[rel] || 0;
    rows.push({ file: other, together: n, of: own, share: own ? Math.round((n / own) * 100) / 100 : 0 });
  }
  rows.sort((a, b) => b.together - a.together || a.file.localeCompare(b.file));
  return {
    ok: true,
    state: rows.length ? "found" : "none",
    file: rel,
    commits: (cache.total || {})[rel] || 0,
    since: cache.since,
    min: COCHANGE_MIN,
    rows: rows.slice(0, COCHANGE_ROWS),
    more: Math.max(0, rows.length - COCHANGE_ROWS),
    exit: rows.length ? 0 : 4,
  };
}

module.exports = { importance, testsByName, parseDiff, changedPaths, graphChanges, graphCochange, cochangePath, COCHANGE_MIN, COCHANGE_MAX_FILES };
