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

// ── the complexity thresholds (v1.9.1 V2, DE-12) ────────────────────────────
// They live HERE, with their reasons, because the lane used to hold them in
// prose and count the rows itself. A threshold in two places is a threshold
// that drifts. `orc-mini/references/complexity.md` quotes these by NAME and
// VALUE, and `bin/verify-contracts.js` fails if one side is renamed alone.
//
// COMPLEXITY_CALLER_FILES  callers in this many files OUTSIDE the plan mean the
//                          change reaches further than one executor can see.
// COMPLEXITY_CALLERS       this many confident callers outside the plan mean the
//                          same, by weight rather than by spread.
// COMPLEXITY_COCHANGE_MIN  a file that changed WITH an operand this many times
//                          and is not in the plan is a file the plan forgot.
//                          It is COCHANGE_MIN by construction — the same
//                          evidence, read for a different question.
const COMPLEXITY_CALLER_FILES = 4;
const COMPLEXITY_CALLERS = 8;
const COMPLEXITY_COCHANGE_MIN = COCHANGE_MIN;

// ── the THIN thresholds (v1.9.1 A1, DE-4) ───────────────────────────────────
// A graph is THIN when it holds so few named symbols that most questions asked
// of it answer "not found" — and nothing, until now, said so. All three must
// hold, because each one alone is a false alarm:
//
// THIN_MIN_FILES     a small repository has few symbols because it is small.
// THIN_PER_FILE      under three named symbols per file, a `ctx` on a name the
//                    request mentions is more likely to miss than to hit.
// THIN_ZERO_SHARE    the decisive one: files the parser read as EMPTY. Measured
//                    at 0.97 for `.vue` on a real front-end project, where the
//                    graph@5 parser did not read Options API object members
//                    (graph@6, W5b, does — THIN stays for what it still misses).
const THIN_MIN_FILES = 30;
const THIN_PER_FILE = 3;
const THIN_ZERO_SHARE = 0.4;

function isThin(density, files) {
  if (!density) return false;
  return (
    Number(files) >= THIN_MIN_FILES &&
    Number(density.symbols_per_file) < THIN_PER_FILE &&
    Number(density.zero_share) >= THIN_ZERO_SHARE
  );
}

const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;

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

  // V1 (v1.9.1) `--files=`: the lane used to take the whole answer and keep the
  // rows whose file it had just written. The CLI restricts them instead, so the
  // rows it never wanted never enter its context.
  const only = Array.isArray(opts.files) && opts.files.length ? new Set(opts.files.map(norm)) : null;
  if (only) for (const k of [...hunks.keys()]) if (!only.has(k)) hunks.delete(k);

  const rows = [];
  const files = [...hunks.keys()].filter((f) => model.fileSet.has(f)).sort();
  const indexable = new Set(Object.keys(G.LANG_BY_EXT));
  const absent = [...hunks.keys()]
    .filter((f) => !model.fileSet.has(f) && indexable.has(path.posix.extname(f).toLowerCase()))
    .sort();
  // Which KIND of edge reaches each test file: a route beats a call, a call
  // beats a name. A file that reaches two ways is counted once, under the
  // strongest — otherwise the three numbers do not add up to the total.
  const TEST_RANK = { route: 3, call: 2, name: 1 };
  const testKind = new Map();
  const noteTest = (file, kind) => {
    const had = testKind.get(file);
    if (!had || TEST_RANK[kind] > TEST_RANK[had]) testKind.set(file, kind);
  };
  for (const rel of files) {
    const ranges = hunks.get(rel);
    for (const sym of (model.byFile[rel] || {}).symbols || []) {
      if (sym.kind === "module") continue;
      const touched = ranges.some((h) => sym.lines[0] <= h[1] && h[0] <= sym.lines[1]);
      if (!touched) continue;
      const c = Q.callersOf(model, sym);
      const callerFiles = [...new Set(c.confident.map((x) => x.sym.file))];
      const tests = [...new Set([...callerFiles.filter((f) => Q.TEST_FILE.test(f)), ...testsByName(model, rel)])];
      for (const x of c.confident) if (Q.TEST_FILE.test(x.sym.file)) noteTest(x.sym.file, x.state === "ROUTE" ? "route" : "call");
      for (const f of testsByName(model, rel)) noteTest(f, "name");
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

  // V1: the CLI computes the line. Both lines used to be assembled by the
  // orchestrator from `symbols[]`, which is why `symbols[]` had to travel into
  // the main session to be counted there. Now the numbers travel and the rows
  // do not.
  const testFiles = new Set(rows.flatMap((r) => r.tests));
  const byKind = { route: 0, call: 0, name: 0 };
  for (const f of testFiles) byKind[testKind.get(f) || "name"]++;
  const totals = {
    symbols: rows.length,
    callers: rows.reduce((a, r) => a + r.fan_in, 0),
    caller_files: new Set(rows.flatMap((r) => r.caller_files)).size,
    maybe: rows.reduce((a, r) => a + r.maybe_callers, 0),
    tests: testFiles.size,
    tests_by_kind: byKind,
    high: counts.high,
    medium: counts.medium,
    low: counts.low,
    not_in_graph: absent.length,
  };
  // The PATHS behind `totals.tests`. A count alone cannot be run, and the lane
  // that used to read them out of `symbols[]` no longer receives that array.
  const tests = [...testFiles].sort();
  const worst = rows[0];
  const blast_line = rows.length
    ? `blast radius   ${plural(totals.symbols, "symbol")} · callers ${totals.callers} in ${plural(totals.caller_files, "file")}` +
      (totals.maybe ? ` · maybe ${totals.maybe}` : "") +
      ` · tests reach ${totals.tests} · risk ${worst.risk}: ${worst.qname} (${worst.why.join(", ")})`
    : `blast radius   none indexed${absent.length ? ` (${plural(absent.length, "file")} not in the graph)` : ""}`;
  const tests_line = totals.tests
    ? `tests reached  ${plural(totals.tests, "file")} (ROUTE ${byKind.route} · call ${byKind.call}${byKind.name ? ` · name ${byKind.name}` : ""})`
    : "tests reached  none";

  return {
    ok: true,
    state: "found",
    base: base || "HEAD",
    files,
    not_in_graph: absent,
    symbols: rows,
    counts,
    totals,
    tests,
    tests_line,
    blast_line,
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
  // `opts.at` is the HEAD a caller has already asked git for. V2 asks this
  // question once per DECLARED FILE, and one `rev-parse` per file is one git
  // process per file for an answer that cannot change between them.
  let at = opts.at;
  if (!at) {
    const head = git(root, ["rev-parse", "HEAD"]);
    if (head.status !== 0) return { ok: false, state: "unavailable", reason: "not-git", exit: 1 };
    at = head.stdout.trim();
  }

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

// ── complexity (v1.9.1 V2) ──────────────────────────────────────────────────
// exit codes are `impact`'s — this is an ADDITION to that answer, never a
// command of its own.
//
// The question is mini's: is this change small enough for one executor? It used
// to be answered by the orchestrator, which ran `impact` and one `cochange` per
// declared file, read `callers[]` and `rows[]` in its own context, and applied
// four thresholds written in prose. Now ONE call answers it, the four
// thresholds are the constants at the top of this file, and the lane prints the
// line it is handed.
//
// The verdict is never a decision. `recommend-orc` is a recommendation the
// lane OFFERS; the user chooses.

// `--risk=<class>[@<file:line>],…`. An unparsable item is DROPPED and named,
// never guessed at: a risk class the reader cannot check is worse than none.
function parseRisk(spec) {
  const risk = [];
  const ignored = [];
  for (const raw of String(spec || "").split(",")) {
    const item = raw.trim();
    if (!item) continue;
    const m = /^([a-z][a-z0-9-]*)(?:@(.+))?$/.exec(item);
    if (!m) {
      ignored.push(item);
      continue;
    }
    risk.push({ class: m[1], ...(m[2] ? { at: m[2] } : {}) });
  }
  return { risk, ignored };
}

const CONFIDENT_STATES = new Set(["LOCAL", "IMPORT", "UNIQUE", "ROUTE"]);

function complexityOf(claudeDir, root, model, rels, opts) {
  const Q = require("./graph-query.js");
  const o = opts || {};
  const operands = new Set(rels.map(norm));
  const targets = rels.flatMap((r) => ((model.byFile[r] || {}).symbols || []).filter((s) => s.kind !== "module"));

  const callerFiles = new Set();
  let callersOutside = 0;
  let maybe = 0;
  const testFiles = new Set();
  for (const t of targets) {
    const c = Q.callersOf(model, t);
    for (const x of c.confident) {
      const f = x.sym.file;
      if (Q.TEST_FILE.test(f)) testFiles.add(f);
      if (operands.has(f) || !CONFIDENT_STATES.has(x.state)) continue;
      callersOutside++;
      callerFiles.add(f);
    }
    // The stored AMBIGUOUS map knows WHICH file each unresolved call came from,
    // so a caller inside the plan is not counted against it. Without the cache
    // only the total exists, and the total is what is used.
    const m = model.maybeCache;
    if (m && Object.prototype.hasOwnProperty.call(m, t.id)) {
      for (const [file, n] of m[t.id]) if (!operands.has(norm(file))) maybe += n;
    } else maybe += c.maybe;
  }
  // Tests are counted the two ways `changes` counts them: by CALL (an edge into
  // an operand's symbol) and by NAME (`x.test.js` beside `x.js`). When the
  // `impact` answer is handed in, ITS list wins: it followed the call chain to
  // the configured depth and through routes, and a second, shallower count of
  // the same thing beside it would be two answers to one question.
  for (const rel of rels) for (const f of testsByName(model, rel)) testFiles.add(f);
  const testsReaching = Array.isArray(o.tests) ? new Set(o.tests).size : testFiles.size;

  // The partners history says change WITH an operand and the plan does not
  // name. One process: `graphCochange` reads the per-HEAD cache, which is built
  // at most once for the whole call.
  const cochange = [];
  const seenPartner = new Set();
  const perFile = [];
  const head = git(root, ["rev-parse", "HEAD"]);
  const at = head.status === 0 ? head.stdout.trim() : null;
  for (const rel of rels) {
    let r = null;
    try {
      r = at ? graphCochange(claudeDir, root, { file: rel, at }) : null;
    } catch (_) {
      r = null;
    }
    const partners = r && r.ok ? r.rows.filter((x) => x.together >= COMPLEXITY_COCHANGE_MIN) : [];
    perFile.push({ file: rel, partners: partners.map((x) => ({ path: x.file, count: x.together })) });
    for (const x of partners) {
      const p = norm(x.file);
      if (operands.has(p) || seenPartner.has(p)) continue;
      seenPartner.add(p);
      cochange.push({ path: p, count: x.together, of: x.of });
    }
  }
  cochange.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  const { risk, ignored } = parseRisk(o.risk);
  const riskGiven = typeof o.risk === "string";

  const why = [];
  if (callerFiles.size >= COMPLEXITY_CALLER_FILES) why.push(`callers in ${callerFiles.size} files (≥ ${COMPLEXITY_CALLER_FILES})`);
  if (callersOutside >= COMPLEXITY_CALLERS) why.push(`callers ${callersOutside} (≥ ${COMPLEXITY_CALLERS})`);
  for (const x of risk) why.push(`risk ${x.class}`);
  for (const x of cochange) why.push(`cochange ${x.path} x${x.count} not in plan`);
  for (const x of ignored) why.push(`risk item ignored: ${x}`);
  if (!riskGiven) why.push("risk: not given");

  const verdict =
    callerFiles.size >= COMPLEXITY_CALLER_FILES || callersOutside >= COMPLEXITY_CALLERS || risk.length > 0 || cochange.length > 0 ? "recommend-orc" : "mini-ok";

  const riskText = risk.length ? risk.map((x) => `${x.class}${x.at ? ` (${x.at})` : ""}`).join(", ") : riskGiven ? "none" : "not given";
  const cochangeText = cochange.length ? cochange.map((x) => `${x.path} x${x.count} not in plan`).join(", ") : "none";
  const maybeText = maybe ? ` · maybe ${maybe}` : "";
  const line =
    verdict === "mini-ok"
      ? `complexity: mini-ok — ${rels.length} files · confident callers ${callersOutside} in ${callerFiles.size} files${maybeText} · tests reach ${testsReaching} · risk ${riskText} · cochange ${cochangeText}`
      : `complexity: recommend /orc — ${rels.length} files · callers ${callersOutside} in ${callerFiles.size} files${maybeText} · tests reach ${testsReaching} · risk ${riskText} · cochange ${cochangeText}`;

  return {
    verdict,
    why,
    numbers: {
      files: rels.length,
      callers_outside: callersOutside,
      caller_files_outside: callerFiles.size,
      maybe,
      tests_reaching: testsReaching,
      cochange_missing: cochange,
      risk,
      risk_given: riskGiven,
    },
    line,
    thresholds: { caller_files: COMPLEXITY_CALLER_FILES, callers: COMPLEXITY_CALLERS, cochange_min: COMPLEXITY_COCHANGE_MIN },
    // V3: `graph_facts` in the shape the lane pastes. `map` is null — the lane
    // already holds the `map --focus` card and fills it there, so the same card
    // is never computed twice.
    facts: {
      map: null,
      impact: rels.map((rel) => {
        const syms = ((model.byFile[rel] || {}).symbols || []).filter((s) => s.kind !== "module");
        const cf = new Set();
        let n = 0;
        const tf = new Set();
        for (const t of syms) {
          for (const x of Q.callersOf(model, t).confident) {
            if (Q.TEST_FILE.test(x.sym.file)) tf.add(x.sym.file);
            if (!CONFIDENT_STATES.has(x.state)) continue;
            n++;
            cf.add(x.sym.file);
          }
        }
        for (const f of testsByName(model, rel)) tf.add(f);
        return { file: rel, confident_callers: n, caller_files: cf.size, tests_reaching: tf.size };
      }),
      cochange: perFile,
      generation: model.meta.generation || 0,
    },
  };
}

module.exports = {
  importance,
  testsByName,
  parseDiff,
  changedPaths,
  graphChanges,
  graphCochange,
  cochangePath,
  complexityOf,
  parseRisk,
  COCHANGE_MIN,
  COCHANGE_MAX_FILES,
  isThin,
  THIN_MIN_FILES,
  THIN_PER_FILE,
  THIN_ZERO_SHARE,
  COMPLEXITY_CALLER_FILES,
  COMPLEXITY_CALLERS,
  COMPLEXITY_COCHANGE_MIN,
};
