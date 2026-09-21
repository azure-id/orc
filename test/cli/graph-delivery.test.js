"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.2 W3 — DELIVERY: fewer round trips for the same answer.
//
// The promises this file holds:
//
//   1. **D1 `--source`** prints the range the card just named, in the SAME
//      call, charged against the SAME budget. It never overruns the budget, it
//      says how many lines it cut, and the JSON carries the text.
//   2. **D2 `--for-slice`** prints the OUTSIDE view of each declared file and
//      nothing else — no symbol table — and it is SMALLER than the file cards
//      it replaces. It also tells the graph hook which names it delivered.
//   3. **D5 `update --notes-pending`** answers both questions in one process,
//      and the update's own exit code is still the answer.
//   4. **§6 the tokens the graph itself adds:** the state word is one letter
//      with a legend when that is smaller, and the budget footer is printed
//      only when something was hidden.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");

const json = (r) => JSON.parse(r.stdout);
const tok = (s) => Math.ceil(String(s).length / 4);

function write(root, rel, lines) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join("\n") + "\n");
}

// One store, one router, two callers and a test that reaches the routes by URL
// — every class of edge the outside view has to show.
function shop() {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/store.js", [
    "class Store {",
    "  constructor() { this.rows = new Map(); }",
    "  list() {",
    "    return [...this.rows.values()];",
    "  }",
    "  insert(row) {",
    "    this.rows.set(row.id, row);",
    "    return row;",
    "  }",
    "  get(id) { return this.rows.get(id); }",
    "  clear() { this.rows.clear(); }",
    "  size() { return this.rows.size; }",
    "  keys() { return [...this.rows.keys()]; }",
    "  has(id) { return this.rows.has(id); }",
    "}",
    "module.exports = Store;",
  ]);
  write(root, "src/routes.js", [
    "const express = require('express');",
    "const Store = require('./store');",
    "const router = express.Router();",
    "const store = new Store();",
    "router.get('/items', (req, res) => res.json(store.list()));",
    "router.post('/items', (req, res) => res.json(store.insert(req.body)));",
    "module.exports = router;",
  ]);
  write(root, "src/app.js", [
    "const express = require('express');",
    "const routes = require('./routes');",
    "const app = express();",
    "app.use('/api', routes);",
    "module.exports = app;",
  ]);
  write(root, "src/report.js", [
    "const Store = require('./store');",
    "const store = new Store();",
    "function report() {",
    "  return store.size() + store.keys().length;",
    "}",
    "function total() { return report() + 1; }",
    "module.exports = { report, total };",
  ]);
  write(root, "tests/items.test.js", [
    "const request = require('supertest');",
    "const app = require('../src/app');",
    "it('lists', () => request(app).get('/api/items'));",
    "it('adds', () => request(app).post('/api/items'));",
  ]);
  git("add", "-A");
  git("commit", "-qm", "shop");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  const u = cli(["graph", "update", "--dir", root]);
  assert.equal(u.status, 0, u.stdout + u.stderr);
  return root;
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);

// ── D1 ──────────────────────────────────────────────────────────────────────

test("ctx --source — the card and the target's own lines, in one call and one budget", () => {
  const root = shop();
  const plain = json(graph(root, "ctx", "Store.insert", "--json"));
  assert.equal(plain.source, null, "no --source, no source");

  const r = graph(root, "ctx", "Store.insert", "--source", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.source.file, "src/store.js");
  assert.equal(j.source.from, 6);
  assert.equal(j.source.to, 9);
  assert.equal(j.source.cut, 0);
  assert.match(j.source.text, /this\.rows\.set\(row\.id, row\);/);
  // The card carries it as a fenced block with line numbers, under a head that
  // names the range.
  assert.match(j.card, /\n {2}source {2}src\/store\.js:6-9\n {2}```js\n/);
  assert.match(j.card, /\n {2}7 +this\.rows\.set\(row\.id, row\);\n/);
  assert.ok(j.budget.used > plain.budget.used, "source is charged, not free");
  assert.ok(j.budget.used <= j.budget.max);
});

test("ctx --source — it takes what the ROWS left, says what it cut, and never passes the budget", () => {
  const root = shop();
  for (const budget of [100, 140, 200, 400, 1200]) {
    const j = json(graph(root, "ctx", "src/store.js", "--source", "--budget", String(budget), "--json"));
    assert.ok(j.budget.used <= budget, `budget ${budget}: used ${j.budget.used}`);
    assert.ok(tok(j.card) <= budget + 2, `budget ${budget}: the card itself is ${tok(j.card)}`);
    if (j.source && j.source.cut) assert.match(j.card, /source \d+ lines · \d+ cut \(raise --budget\)/);
  }
  // A file card's source is the file HEAD — what a reader opening an unknown
  // file looks at.
  const f = json(graph(root, "ctx", "src/app.js", "--source", "--budget", "1200", "--json"));
  assert.equal(f.source.from, 1);
  assert.match(f.source.text, /require\('express'\)/);
});

test("ctx --source — the count is optional, capped at 200, and a bare flag never eats the target", () => {
  const root = shop();
  // `--source` before the target: the next word is not a number, so it stays a
  // target and the default count applies.
  const a = json(graph(root, "ctx", "--source", "Store.list", "--json"));
  assert.equal(a.target.qname, "Store.list");
  assert.ok(a.source, "the bare flag still asked for source");
  // An explicit count IS consumed.
  const b = json(graph(root, "ctx", "src/store.js", "--source", "2", "--json"));
  assert.equal(b.file, "src/store.js");
  assert.equal(b.source.to, 2);
  // Over the hard cap, the cap wins.
  const c = json(graph(root, "ctx", "src/store.js", "--source", "9999", "--budget", "8000", "--json"));
  assert.ok(c.source.to - c.source.from + 1 <= 200);
});

// ── D2 ──────────────────────────────────────────────────────────────────────

test("ctx --for-slice — the OUTSIDE view only: who reaches the file, and nothing it already contains", () => {
  const root = shop();
  const r = graph(root, "ctx", "--for-slice", "src/store.js", "src/routes.js", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.view, "for-slice");
  assert.deepStrictEqual(j.files, ["src/store.js", "src/routes.js"]);
  assert.equal(j.blocks.length, 2);

  const store = j.blocks[0];
  // One row per CALLING FILE, naming the symbols it reaches.
  const from = store.callers.map((c) => c.file).sort();
  assert.deepStrictEqual(from, ["src/report.js", "src/routes.js"]);
  const routesRow = store.callers.find((c) => c.file === "src/routes.js");
  assert.ok(routesRow.reaches.includes("list") && routesRow.reaches.includes("insert"), JSON.stringify(routesRow));
  assert.equal(routesRow.state, "IMPORT");

  // The routes block is reached by URL, with the MOUNT folded in — the one fact
  // the file itself cannot tell you.
  const routes = j.blocks[1];
  const test = routes.callers.find((c) => c.file === "tests/items.test.js");
  assert.equal(test.state, "ROUTE");
  assert.ok(test.reaches.includes("GET /api/items"), JSON.stringify(test.reaches));
  assert.deepStrictEqual(routes.tests, ["tests/items.test.js"]);

  // And NOT the symbol table — that is what the executor is about to read.
  assert.doesNotMatch(j.card, /fan-in/);
  assert.doesNotMatch(j.card, /^ {2}(method|class|function) /m);
  assert.match(j.card, /^graph outside view — read each file itself before you edit it/);
});

test("ctx --for-slice — it is SMALLER than the file cards it replaces (the D2 gate)", () => {
  const root = shop();
  const measure = (files) => {
    const cards = json(graph(root, "ctx", ...files, "--budget", "4000", "--json"));
    const slice = json(graph(root, "ctx", "--for-slice", ...files, "--budget", "4000", "--json"));
    return { before: tok(cards.card), after: tok(slice.card) };
  };
  // The gate, on a slice with real outside traffic — which is every slice an
  // executor is given.
  for (const files of [["src/store.js", "src/routes.js"], ["src/store.js", "src/report.js"]]) {
    const { before, after } = measure(files);
    assert.ok(after <= before * 0.7, `${files.join(" ")}: ${before} → ${after} tokens (want ≥ 30% smaller)`);
  }
  // The framing line is a FIXED cost paid once per answer, so a wider slice
  // does better, never worse. (One tiny file that nothing reaches is the one
  // shape where the framing line costs more than the symbol table it drops —
  // and that file is not what an executor slice is made of.)
  const one = measure(["src/routes.js"]);
  const three = measure(["src/routes.js", "src/store.js", "src/report.js"]);
  assert.ok(three.before - three.after >= one.before - one.after, `saving must not shrink with more files: ${JSON.stringify({ one, three })}`);
  assert.ok(three.after <= three.before, `${three.before} → ${three.after} tokens`);
});

test("ctx --for-slice — a file the graph does not hold is named, not guessed at", () => {
  const root = shop();
  const r = graph(root, "ctx", "--for-slice", "src/store.js", "src/nope.js", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.deepStrictEqual(j.missing, ["src/nope.js"]);
  assert.match(j.card, /not in the graph: src\/nope\.js/);
  const none = graph(root, "ctx", "--for-slice", "src/nope.js", "--json");
  assert.equal(none.status, 4, "no known file at all is exit 4, the same answer ctx gives");
});

// ── D5 ──────────────────────────────────────────────────────────────────────

test("update --notes-pending — one process answers both, and the UPDATE's exit is still the answer", () => {
  const root = shop();
  assert.equal(cli(["config", "set", "code_graph_notes", "wave", "--dir", root]).status, 0);
  write(root, "src/store.js", [
    "class Store {",
    "  constructor() { this.rows = new Map(); }",
    "  list() { return [...this.rows.values()]; }",
    "  insert(row) { this.rows.set(row.id, row); return row; }",
    "  get(id) { return this.rows.get(id); }",
    "}",
    "module.exports = Store;",
  ]);
  const r = graph(root, "update", "--notes-pending", "--files", "src/store.js", "--at", "wave", "--if-enabled", "--json");
  assert.equal(r.status, 0, "a notes batch below the minimum is not an update failure");
  const j = json(r);
  assert.equal(j.state, "updated");
  assert.ok(j.notes_pending, "the notes half is in the same answer");
  assert.equal(j.notes_pending.notes, "wave");
  assert.ok(["rows", "below-min", "none"].includes(j.notes_pending.state), JSON.stringify(j.notes_pending));
  assert.match(j.line, /graph: updated/);
  assert.match(j.line, /graph notes:/);

  // The two-call form still says exactly the same thing about the notes half.
  const alone = json(graph(root, "notes", "pending", "--files", "src/store.js", "--at", "wave", "--if-enabled", "--json"));
  assert.equal(alone.state, j.notes_pending.state);
  assert.equal(alone.total, j.notes_pending.total);
});

test("update --notes-pending — notes off is still an ANSWER, and the update still ran", () => {
  const root = shop();
  write(root, "src/report.js", [
    "const Store = require('./store');",
    "const store = new Store();",
    "function report() { return store.size(); }",
    "module.exports = { report };",
  ]);
  const r = graph(root, "update", "--notes-pending", "--files", "src/report.js", "--if-enabled", "--json");
  assert.equal(r.status, 0, "the update is the exit code, and notes being off is not an update failure");
  const j = json(r);
  assert.equal(j.state, "updated");
  assert.equal(j.notes_pending.state, "off");
  assert.equal(j.notes_pending.exit, 3);
});

// ── §6 — the tokens the graph itself adds ───────────────────────────────────

test("ctx — the state word is one letter WITH a legend only when that is smaller", () => {
  const root = shop();
  // Two caller rows: the legend costs more than the letters save, so the long
  // words stay. A card is never made worse to look consistent.
  const small = json(graph(root, "ctx", "Store.insert", "--json"));
  assert.equal(small.states, "long");
  assert.match(small.card, /IMPORT/);
  assert.doesNotMatch(small.card, /^ {2}states:/m);

  // Many rows: the short body plus one legend line wins.
  const big = json(graph(root, "ctx", "src/store.js", "--json"));
  assert.ok(big.card.length > 0);
  const wide = json(graph(root, "ctx", "Store", "--budget", "4000", "--json"));
  if (wide.states === "short") {
    assert.match(wide.card, /^ {2}states: L local · I import · U unique · R route · A ambiguous$/m);
    assert.doesNotMatch(wide.card, /\bIMPORT\b/);
  }
});

test("ctx — the budget footer is printed only when something was hidden", () => {
  const root = shop();
  const roomy = json(graph(root, "ctx", "total", "--budget", "4000", "--json"));
  assert.deepStrictEqual(roomy.hidden, {});
  assert.equal(roomy.unresolved, 0);
  assert.doesNotMatch(roomy.card, /budget \d+\/\d+ tokens/, "a card that hid nothing spends no line saying so");
  assert.ok(roomy.budget.used > 0, "the number is still in the JSON");

  const tight = json(graph(root, "ctx", "src/store.js", "--budget", "100", "--json"));
  assert.match(tight.card, /budget \d+\/100 tokens · hidden: .*\(raise --budget\)/);
  assert.ok(tight.budget.used <= 100);
});
