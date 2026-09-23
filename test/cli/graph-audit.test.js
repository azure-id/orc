"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.9.1 W4 — A1 · A2: the graph says when it is THIN, and why.
//
// The promises this file holds:
//
//   1. **The density is counted from the index**, the same way `meta.symbols`
//      counts it: `module` records are not symbols anyone looks for.
//   2. **THIN needs all three thresholds**, and each one is tested AT ITS EDGE.
//      A small repository is not thin; a repository with real symbols in most
//      files is not thin; a repository the parser read as empty IS.
//   3. **A backfill happens once, under `--heal`, and never moves the
//      generation** — the index did not change, so neither does its number.
//   4. **The audit reads and never writes.** It opens at most the first lines
//      of the files it lists, it never runs the extractor, and its shape
//      reading is a HINT that says so on its own last line.
//   5. **No lane may call it.** `lanes: []` is the contract.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");
const G = require("../../bin/graph.js");
const SIG = require("../../bin/graph-signals.js");
const A = require("../../bin/graph-audit.js");

const json = (r) => JSON.parse(r.stdout);
const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);

function write(root, rel, body) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Array.isArray(body) ? body.join("\n") + "\n" : body);
}

// A repository built to order: `full` files carry one named function each,
// `empty` files carry none, and `extra` is written as given. An empty file
// exports an ARRAY: since graph@6 (W5b) a plain key of an exported object is
// a named constant, so `module.exports = { a: 1 }` is no longer empty. That makes every
// threshold reachable from either side.
function repo(opts) {
  const o = opts || {};
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  for (let i = 0; i < (o.full || 0); i++) {
    const body = [];
    for (let k = 0; k < (o.symbolsEach || 1); k++) body.push(`export function fn${i}_${k}() { return ${k}; }`);
    write(root, `src/full${i}.js`, body);
  }
  for (let i = 0; i < (o.empty || 0); i++) write(root, `src/empty${i}.js`, [`module.exports = [${i}];`]);
  if (o.extra) for (const [rel, body] of Object.entries(o.extra)) write(root, rel, body);
  git("add", "-A");
  git("commit", "-qm", "base");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  if (!o.noBuild) assert.equal(graph(root, "update", "--json").status, 0);
  return root;
}

const metaOf = (root) => JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "graph", "meta.json"), "utf8"));

// ── A1 — the field ──────────────────────────────────────────────────────────

test("density — the update writes it, and the counts equal a hand count", () => {
  const root = repo({ full: 4, empty: 2, symbolsEach: 3 });
  const d = metaOf(root).density;
  assert.ok(d, "an update writes the density");
  assert.equal(d.zero_files, 2, "two files hold no named symbol");
  // 4 files × 3 functions over 6 files.
  assert.equal(d.symbols_per_file, 2);
  assert.equal(d.zero_share, Math.round((100 * 2) / 6) / 100);
  assert.equal(d.by_lang.js.files, 6);
  assert.equal(d.by_lang.js.symbols, 12);
  assert.equal(d.by_lang.js.zero, 2);
  assert.equal(d.skipped, 0);
});

test("density — a module record is not a symbol, the same way meta.symbols counts", () => {
  const root = repo({ full: 3, empty: 1 });
  const m = metaOf(root);
  const total = Object.values(m.density.by_lang).reduce((a, v) => a + v.symbols, 0);
  assert.equal(total, m.symbols, "the two counts must be the same count");
});

// ── A1 — THIN, at each edge ─────────────────────────────────────────────────

test("THIN — all three thresholds must hold, and each is tested at its edge", () => {
  // Too few files: thin numbers, but a small repository is small, not thin.
  const small = { symbols_per_file: 0.5, zero_share: 0.9 };
  assert.equal(SIG.isThin(small, SIG.THIN_MIN_FILES - 1), false);
  assert.equal(SIG.isThin(small, SIG.THIN_MIN_FILES), true);

  // Density at the edge: 3.0 is not thin, 2.9 is.
  assert.equal(SIG.isThin({ symbols_per_file: SIG.THIN_PER_FILE, zero_share: 0.9 }, 100), false);
  assert.equal(SIG.isThin({ symbols_per_file: SIG.THIN_PER_FILE - 0.1, zero_share: 0.9 }, 100), true);

  // Empty share at the edge: 0.39 is not thin, 0.40 is.
  assert.equal(SIG.isThin({ symbols_per_file: 1, zero_share: SIG.THIN_ZERO_SHARE - 0.01 }, 100), false);
  assert.equal(SIG.isThin({ symbols_per_file: 1, zero_share: SIG.THIN_ZERO_SHARE }, 100), true);

  assert.equal(SIG.isThin(null, 100), false, "no density is not a verdict");
});

test("THIN — the status line says it, names the command, and the trace carries the number", () => {
  // 30 files, one symbol each in 15 of them: 0.5 symbols/file, half empty.
  const root = repo({ full: 15, empty: 15 });
  const r = json(graph(root, "status", "--json"));
  assert.equal(r.thin, true, JSON.stringify(r.density));
  assert.match(r.line, /symbols\/file/);
  assert.match(r.line, /THIN \(\d+ % of files have no symbol\) — run: orc graph audit/);
  assert.match(r.trace, / density=[\d.]+ thin=1$/);

  const fat = json(graph(repo({ full: 30, symbolsEach: 5 }), "status", "--json"));
  assert.equal(fat.thin, false);
  assert.ok(!/THIN/.test(fat.line), fat.line);
  assert.match(fat.trace, / density=[\d.]+$/, "a graph that is not thin says its density and stops");
});

test("THIN — the density never reaches a line that has no graph behind it", () => {
  const off = repo({ full: 2, noBuild: true });
  assert.equal(cli(["config", "set", "code_graph", "off", "--dir", off]).status, 0);
  const r = graph(off, "status", "--if-enabled", "--json");
  assert.ok(!/symbols\/file/.test(r.stdout), "an off graph has no density to print");

  const none = repo({ full: 2, noBuild: true });
  const n = graph(none, "status", "--json");
  assert.ok(!/symbols\/file/.test(n.stdout), "a graph with no index has no density to print");
});

// ── A1 — the backfill ───────────────────────────────────────────────────────

const stripDensity = (root) => {
  const p = path.join(root, ".claude", "orc", "graph", "meta.json");
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  delete m.density;
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  return m;
};

test("backfill — --heal fills a store built before this release, once, without moving the generation", () => {
  const root = repo({ full: 4, empty: 1 });
  const before = stripDensity(root);

  const plain = json(graph(root, "status", "--json"));
  assert.equal(plain.density, undefined, "a plain status never rewrites meta");

  const healed = json(graph(root, "status", "--heal", "--json"));
  assert.ok(healed.density, "--heal fills it in");
  assert.equal(healed.density_backfilled, true);
  const after = metaOf(root);
  assert.equal(after.generation, before.generation, "the index did not change, so the generation does not");
  assert.equal(after.gen_id, before.gen_id);
  assert.ok(after.density, "and it is on disk, so the next read is free");

  const again = json(graph(root, "status", "--heal", "--json"));
  assert.equal(again.density_backfilled, undefined, "once is once");
});

test("backfill — it obeys the same cap every heal obeys", () => {
  const root = repo({ full: 3 });
  stripDensity(root);
  const p = path.join(root, ".claude", "orc", "graph", "meta.json");
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  m.update_ms = 999999;
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  assert.equal(cli(["config", "set", "code_graph_heal_ms", "10", "--dir", root]).status, 0);

  const r = json(graph(root, "status", "--heal", "--json"));
  assert.equal(r.density_backfilled, undefined, "a store that takes too long to read is left alone");
  assert.equal(metaOf(root).density, undefined);
});

// ── A2 — the audit ──────────────────────────────────────────────────────────

test("audit — the per-language table, and which extractor read each one", () => {
  const root = repo({ full: 3, empty: 2 });
  const r = json(graph(root, "audit", "--json"));
  assert.equal(r.state, "found");
  const js = r.by_lang.js;
  assert.equal(js.files, 5);
  assert.equal(js.zero, 2);
  assert.equal(js.per_file, Math.round((10 * js.symbols) / js.files) / 10);
  assert.ok(Object.keys(js.extractor).length > 0, "a language names the extractor that read it");
  assert.match(r.line, /lang {3}files {2}symbols {2}per-file/);
});

test("audit — the empty files come back longest first, and --top= bounds the list", () => {
  const root = repo({
    full: 1,
    extra: {
      "src/short.js": ["module.exports = [1];"],
      "src/long.js": new Array(40).fill("// filler").concat(["module.exports = [2];"]),
      "src/middle.js": new Array(10).fill("// filler").concat(["module.exports = [3];"]),
    },
  });
  const r = json(graph(root, "audit", "--json"));
  const order = r.zero_files.map((z) => z.path);
  assert.deepStrictEqual(order, ["src/long.js", "src/middle.js", "src/short.js"]);
  assert.ok(r.zero_files[0].lines > r.zero_files[1].lines);

  const one = json(graph(root, "audit", "--top=1", "--json"));
  assert.equal(one.zero_files.length, 1);
  assert.equal(one.total_zero, 3, "the COUNT is always over every file, however short the list");
  assert.match(one.line, /--top=N for more/);
});

test("audit — the shape sampler reads the first declaration, one fixture per shape", () => {
  const cases = {
    "a.vue": ['<script setup lang="ts">', "const x = 1;", "</script>"],
    "b.js": ["export default {", "  name: 'x',", "};"],
    "c.js": ["export const make = () => 1;"],
    "d.js": ["module.exports = {", "  a: 1,", "};"],
    "e.js": ["class Thing {}"],
    "f.js": ["// just a comment", "", "const internal = 1;"],
  };
  const root = tmpdir();
  for (const [name, body] of Object.entries(cases)) write(root, name, body);
  assert.equal(A.shapeOf(path.join(root, "a.vue")).id, "script-setup");
  assert.equal(A.shapeOf(path.join(root, "b.js")).id, "export-default-object");
  assert.equal(A.shapeOf(path.join(root, "c.js")).id, "export-const-fn");
  assert.equal(A.shapeOf(path.join(root, "d.js")).id, "module-exports-object");
  assert.equal(A.shapeOf(path.join(root, "e.js")).id, "class");
  assert.equal(A.shapeOf(path.join(root, "f.js")).id, "other");

  // A directive prologue and an import are not declarations.
  write(root, "g.js", ['"use strict";', "const fs = require('fs');", "import x from 'y';", "export default {"]);
  assert.equal(A.shapeOf(path.join(root, "g.js")).id, "export-default-object");
});

test("audit — a shape the parser SHOULD have read is marked a gap; one that is data is not", () => {
  const gap = A.SHAPES.find((s) => s.id === "export-const-fn");
  assert.equal(gap.gap, true);
  assert.match(gap.reading, /parser gap/);
  assert.equal(A.SHAPES.find((s) => s.id === "export-default-object").gap, false);
  assert.equal(A.SHAPES.find((s) => s.id === "script-setup").gap, false, "a component with no named function is not a defect");
});

test("audit — it names the skipped files with the reason, and the partial ones with the range", () => {
  const root = repo({
    full: 2,
    extra: { "src/partial.js": ["export function ok() { return 1; }", "function broken( {"] },
  });
  const r = json(graph(root, "audit", "--json"));
  assert.ok(Array.isArray(r.skipped));
  assert.ok(Array.isArray(r.partial));
  for (const x of r.skipped) assert.ok(x.reason, "a skipped file says why");
});

test("audit — the last line says an empty file is not a defect", () => {
  const r = graph(repo({ full: 2, empty: 1 }), "audit");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /an empty file is not a defect by itself/);
  assert.match(r.stdout, /"parser gap" is worth one issue with the file path/);
});

test("audit — exit 1 with no index, exit 3 when the graph is off", () => {
  const none = repo({ full: 1, noBuild: true });
  const r = graph(none, "audit", "--json");
  assert.equal(r.status, 1);
  assert.equal(json(r).reason, "no-index");

  const root = repo({ full: 1 });
  assert.equal(cli(["config", "set", "code_graph", "off", "--dir", root]).status, 0);
  const off = graph(root, "audit", "--if-enabled", "--json");
  assert.equal(off.status, 3);
  assert.equal(json(off).state, "off");
});

test("audit — --brief drops the lists and keeps their counts", () => {
  const root = repo({ full: 2, empty: 3 });
  const full = json(graph(root, "audit", "--json"));
  const brief = json(graph(root, "audit", "--json", "--brief"));
  assert.ok(!brief.zero_files, "the list is what --brief is for");
  assert.equal(brief.counts.zero_files, full.zero_files.length);
  assert.deepStrictEqual(brief.by_lang, full.by_lang, "a table of scalars is kept");
  assert.equal(brief.line, full.line);
  assert.equal(brief.thin, full.thin);
});

test("audit — it writes nothing: the store is byte-identical afterwards", () => {
  const root = repo({ full: 3, empty: 2 });
  const dir = path.join(root, ".claude", "orc", "graph");
  const snap = () =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => [e.name, fs.readFileSync(path.join(dir, e.name)).toString("base64")]);
  const before = snap();
  assert.equal(graph(root, "audit", "--json").status, 0);
  const after = snap();
  assert.deepStrictEqual(after, before, "a read that writes is not a read");
});

test("audit — no lane may call it", () => {
  const all = json(cli(["lane", "calls", "--all", "--json"])).calls;
  const row = all.find((c) => c.id === "graph-audit");
  assert.ok(row, "the audit is catalogued");
  assert.deepStrictEqual(row.lanes, [], "an audit is a USER command");
  assert.equal(row.cost, "free");
  assert.equal(row.canonical, "_shared/code-graph.md");
  assert.ok(row.never && /defect/.test(row.never), "the row carries the rule that an empty file is not a defect");
});

test("audit — the trace is a verb of its own, with the numbers on it", () => {
  const r = json(graph(repo({ full: 2, empty: 1 }), "audit", "--json"));
  assert.match(r.trace, /^GRAPH-AUDIT (thin|ok) :: files=\d+ symbols=\d+ per_file=[\d.]+ zero=\d+ skipped=\d+ gen=\d+$/);
});

// ── the density helper, used by both ────────────────────────────────────────

test("densityOf — an empty index answers zero, never NaN", () => {
  const d = G.densityOf({ by_file: {} }, {});
  assert.equal(d.symbols_per_file, 0);
  assert.equal(d.zero_share, 0);
  assert.deepStrictEqual(Object.keys(d.by_lang), [], "no file, no language");
});
