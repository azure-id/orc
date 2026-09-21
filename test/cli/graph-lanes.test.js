"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.2 W7 (D4) — `orc graph map`: the ranked repository map.
//
// The promises this file holds:
//
//   1. A map RANKS. The file the repository's own traffic flows through comes
//      out above the file nobody calls, and a test file is pushed down.
//   2. `--focus` re-ranks the WHOLE repository around a file or a NAME, and it
//      never turns the rest of the list into a directory listing.
//   3. A budget cuts a PREFIX of the ranking — a smaller budget gives a shorter
//      map, never a different one — and it says how many files it left out.
//   4. The exit codes are the contract: 0 whenever a graph exists, 1 with no
//      index, 3 when `code_graph` is off and `--if-enabled` was passed.
//   5. `map.json` is DERIVED. Deleting it changes how long the answer takes and
//      not one byte of the answer.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");

const json = (r) => JSON.parse(r.stdout);

function write(root, rel, lines) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join("\n") + "\n");
}

// A repository with a clear shape: `core.js` is called by everything, `leaf.js`
// by nobody, and the test file only reaches the routes. That is enough for a
// ranking to be checkable rather than plausible.
function shop(opts) {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/core.js", [
    "function validate(row) { return !!row && !!row.id; }",
    "function normalise(row) { return { ...row, id: String(row.id) }; }",
    "function describe(row) { return `${row.id}`; }",
    "module.exports = { validate, normalise, describe };",
  ]);
  write(root, "src/store.js", [
    "const { validate, normalise } = require('./core');",
    "class Store {",
    "  constructor() { this.rows = new Map(); }",
    "  insert(row) {",
    "    if (!validate(row)) throw new Error('bad');",
    "    const r = normalise(row);",
    "    this.rows.set(r.id, r);",
    "    return r;",
    "  }",
    "  list() { return [...this.rows.values()]; }",
    "}",
    "module.exports = Store;",
  ]);
  write(root, "src/report.js", [
    "const { describe, validate } = require('./core');",
    "const Store = require('./store');",
    "const store = new Store();",
    "function report() {",
    "  return store.list().filter(validate).map(describe);",
    "}",
    "module.exports = { report };",
  ]);
  write(root, "src/routes.js", [
    "const express = require('express');",
    "const Store = require('./store');",
    "const { report } = require('./report');",
    "const router = express.Router();",
    "const store = new Store();",
    "router.get('/items', (req, res) => res.json(store.list()));",
    "router.post('/items', (req, res) => res.json(store.insert(req.body)));",
    "router.get('/report', (req, res) => res.json(report()));",
    "module.exports = router;",
  ]);
  write(root, "src/app.js", [
    "const express = require('express');",
    "const routes = require('./routes');",
    "const app = express();",
    "app.use('/api', routes);",
    "module.exports = app;",
  ]);
  // Called by nothing, calls nothing in the repository. The floor of any rank.
  write(root, "src/leaf.js", ["function unusedHelper() { return 1; }", "module.exports = { unusedHelper };"]);
  write(root, "tests/items.test.js", [
    "const request = require('supertest');",
    "const app = require('../src/app');",
    "const { validate } = require('../src/core');",
    "it('lists', () => request(app).get('/api/items'));",
    "it('adds', () => request(app).post('/api/items'));",
    "it('validates', () => validate({ id: 1 }));",
  ]);
  git("add", "-A");
  git("commit", "-qm", "shop");
  assert.equal(cli(["config", "set", "code_graph", opts && opts.off ? "off" : "on", "--dir", root]).status, 0);
  if (!(opts && opts.noIndex)) {
    const u = cli(["graph", "update", "--dir", root]);
    if (!(opts && opts.off)) assert.equal(u.status, 0, u.stdout + u.stderr);
  }
  return root;
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const rankOf = (r, file) => r.files.findIndex((f) => f.file === file);

// ── 1. it ranks ─────────────────────────────────────────────────────────────

test("map — the file everything reaches outranks the file nothing reaches", () => {
  const root = shop();
  const r = graph(root, "map", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = json(r);
  assert.equal(m.state, "found");
  assert.equal(m.total_files, 7, "every indexed file is counted, shown or not");
  assert.ok(m.edges > 0, "a repository that calls itself has edges");

  const core = rankOf(m, "src/core.js");
  const leaf = rankOf(m, "src/leaf.js");
  assert.ok(core >= 0 && leaf >= 0, "this budget shows every file");
  assert.ok(core < leaf, `core.js (${core}) must outrank leaf.js (${leaf})`);

  // A test file is knocked down by ten. It is real code and it is on the map;
  // it is never the first thing a planner is sent to read.
  const spec = rankOf(m, "tests/items.test.js");
  assert.ok(spec > core, "a test file never outranks the module it tests");
});

test("map — a row names the file's own symbols with their line ranges", () => {
  const root = shop();
  const m = json(graph(root, "map", "--json"));
  const core = m.files.find((f) => f.file === "src/core.js");
  assert.ok(core, "core.js is on the map");
  assert.ok(core.symbols.length > 0, "a row carries the symbols worth opening");
  for (const s of core.symbols) {
    assert.equal(typeof s.qname, "string");
    assert.equal(s.lines.length, 2, "a range, so the reader can read the range");
    assert.ok(s.lines[0] >= 1 && s.lines[1] >= s.lines[0]);
  }
  assert.match(m.card, /core\.js/);
  assert.match(m.card, /validate:\d+-\d+/, "the card prints name:from-to");
  assert.match(m.card, /a HINT about where to look first/, "rank is never proof");
});

// ── 2. focus ────────────────────────────────────────────────────────────────

test("map --focus <file> — the focus rises, and the rest stays RANKED", () => {
  const root = shop();
  const plain = json(graph(root, "map", "--json"));
  const focused = json(graph(root, "map", "--focus", "src/leaf.js", "--json"));

  assert.deepEqual(focused.focus, ["src/leaf.js"]);
  const before = rankOf(plain, "src/leaf.js");
  const after = rankOf(focused, "src/leaf.js");
  assert.ok(after < before, `focus must lift leaf.js (${before} → ${after})`);

  // W7-focus-baseline: the files the focus does not reach keep a baseline
  // share, so the rest of the map stays a RANKING. Handing the focus the whole
  // personalisation vector leaves everything else at exactly zero, and a
  // hundred tied zeroes sort alphabetically — a directory listing wearing a
  // ranking's clothes. The check is that the rest is NOT alphabetical.
  const rest = focused.files.map((f) => f.file).filter((f) => f !== "src/leaf.js");
  const alpha = rest.slice().sort();
  assert.notDeepEqual(rest, alpha, "the unfocused remainder must not collapse to alphabetical order");
});

test("map --focus <name> — a bare symbol name reaches the file that defines it", () => {
  const root = shop();
  const m = json(graph(root, "map", "--focus", "unusedHelper", "--json"));
  assert.deepEqual(m.focus, ["src/leaf.js"], "a name contributes its defining file");
  assert.deepEqual(m.focus_missing, []);
  assert.equal(m.files[0].file, "src/leaf.js", "the only focus leads the map");
});

test("map --focus — a name in nothing is REPORTED, and the map is still an answer", () => {
  const root = shop();
  const r = graph(root, "map", "--focus", "noSuchThingAnywhere", "--json");
  assert.equal(r.status, 0, "a focus miss is an answer, never an error");
  const m = json(r);
  assert.deepEqual(m.focus, []);
  assert.deepEqual(m.focus_missing, ["noSuchThingAnywhere"]);
  assert.match(m.card, /focus not in the graph: noSuchThingAnywhere/);
});

// ── 3. the budget cuts a PREFIX ─────────────────────────────────────────────

test("map --budget — a smaller budget gives a SHORTER map, never a different one", () => {
  const root = shop();
  const big = json(graph(root, "map", "--budget", "4000", "--json"));
  const small = json(graph(root, "map", "--budget", "100", "--json"));

  assert.ok(small.shown < big.shown, "a small budget shows fewer files");
  assert.ok(small.shown > 0, "and it still shows some");
  // THE promise. `fit()` is greedy — after skipping one long row it will happily
  // take a shorter row further down — which is right for a card of independent
  // sections and wrong for a list whose whole meaning is the order. A reader who
  // sees rank 10 present and rank 7 missing cannot use the order for anything.
  assert.deepEqual(
    small.files.map((f) => f.file),
    big.files.slice(0, small.shown).map((f) => f.file),
    "the short map is a PREFIX of the long one"
  );
  assert.ok(small.budget.used <= 100, `used ${small.budget.used} must stay inside the budget`);
  assert.equal(small.has_more, true);
  assert.equal(small.hidden.files, big.total_files - small.shown);
  assert.match(small.card, /hidden: \d+ files/, "a map that cut says so");
});

test("map — a map that hid nothing prints NO budget footer", () => {
  const root = shop();
  const m = json(graph(root, "map", "--budget", "4000", "--json"));
  assert.equal(m.has_more, false);
  assert.deepEqual(m.hidden, {});
  assert.ok(!/budget \d+\//.test(m.card), "no footer when nothing was hidden");
});

// ── 4. the exit codes ───────────────────────────────────────────────────────

test("map — exit 3 when the graph is off, exit 1 with no index", () => {
  const off = shop({ off: true, noIndex: true });
  const r3 = graph(off, "map", "--if-enabled", "--json");
  assert.equal(r3.status, 3);
  assert.equal(json(r3).state, "off");

  const none = shop({ noIndex: true });
  const r1 = graph(none, "map", "--if-enabled", "--json");
  assert.equal(r1.status, 1);
  assert.equal(json(r1).state, "none");
});

test("map — it needs no operand, which is the whole point of it", () => {
  const root = shop();
  const r = graph(root, "map", "--json");
  assert.equal(r.status, 0, "no file, no symbol, still an answer");
  assert.equal(json(r).trace.startsWith("GRAPH-MAP repo"), true);
  const f = graph(root, "map", "--focus", "src/core.js", "--json");
  assert.equal(json(f).trace.startsWith("GRAPH-MAP focused"), true);
});

// ── 5. map.json is DERIVED ──────────────────────────────────────────────────

test("map.json is a speed store — deleting it changes the time, not the answer", () => {
  const root = shop();
  const mapFile = path.join(root, ".claude", "orc", "graph", "map.json");
  assert.ok(fs.existsSync(mapFile), "an update writes it");
  const cached = json(graph(root, "map", "--json"));
  assert.equal(cached.cached_map, true);

  fs.rmSync(mapFile);
  const computed = json(graph(root, "map", "--json"));
  assert.equal(computed.cached_map, false, "it fell back to computing");
  assert.equal(computed.card, cached.card, "byte-identical card");
  assert.deepEqual(computed.files, cached.files);
  assert.equal(computed.edges, cached.edges);
});

test("map.json is generation-pinned — a stale one is never read", () => {
  const root = shop();
  const mapFile = path.join(root, ".claude", "orc", "graph", "map.json");
  const m = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const before = json(graph(root, "map", "--json"));

  // A cache claiming another generation is not "probably fine". It is not used.
  fs.writeFileSync(mapFile, JSON.stringify({ ...m, generation: m.generation + 99, files: [], edges: [], base: [] }));
  const after = json(graph(root, "map", "--json"));
  assert.equal(after.cached_map, false, "the generation did not match, so it was ignored");
  assert.equal(after.card, before.card, "and the answer is unchanged");
});
