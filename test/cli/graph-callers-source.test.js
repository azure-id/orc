"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.9.1 W5 — R1 `ctx --callers-source` and R4 `lsp_at`.
//
// The promises this file holds:
//
//   1. **R1 prints the call sites WITH the card**: at most 5 confident callers,
//      6 lines each, shifted (never shortened) at either end of a file.
//   2. **It never prints what it must not**: an AMBIGUOUS candidate, or the
//      target's OWN file — the file the asking agent is about to edit.
//   3. **It never exceeds the budget**, and the footer counts the callers it cut.
//   4. **A ROUTE caller is named by its URL; a CHANGED caller file says so.**
//   5. **It is a symbol card's option**: a file card and `--for-slice` name it
//      as ignored. The sharded fast path declines it by name.
//   6. **R4 `lsp_at`** is the 1-based column of the name on its definition line,
//      and `null` whenever that cannot be stated exactly.
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

// `lookup` has seven callers in seven files, one more in its own file, and an
// AMBIGUOUS caller that names `pick` (defined twice). `edge` is called on the
// first line of one file, on the last line of another, and inside a file too
// short for a full window. A router and a test reach `GET /items` by URL.
function repo() {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/store.js", [
    "// the store",
    "function lookup(id) {",
    "  return { id };",
    "}",
    "function again(id) {",
    "  return lookup(id);",
    "}",
    "function edge(x) {",
    "  return x;",
    "}",
    "module.exports = { lookup, again, edge };",
  ]);
  for (let i = 1; i <= 7; i++) {
    write(root, `src/c${i}.js`, [
      "const { lookup } = require('./store');",
      "",
      `function use${i}() {`,
      "  const a = 1;",
      `  return lookup(${i});`,
      "}",
      "",
      "",
      `module.exports = { use${i} };`,
    ]);
  }
  write(root, "src/pa.js", ["function pick() {", "  return 1;", "}", "module.exports = { pick };"]);
  write(root, "src/pb.js", ["function pick() {", "  return 2;", "}", "module.exports = { pick };"]);
  write(root, "src/guess.js", ["function guess() {", "  return pick();", "}", "module.exports = { guess };"]);
  // `edge` at the FIRST line of a long file, at the LAST line of a long file,
  // and in a file of three lines.
  write(root, "src/first.js", [
    "const { edge } = require('./store'); function first() { return edge(1); }",
    "// 2",
    "// 3",
    "// 4",
    "// 5",
    "// 6",
    "// 7",
    "// 8",
    "module.exports = { first };",
  ]);
  write(root, "src/last.js", [
    "// 1",
    "// 2",
    "// 3",
    "// 4",
    "// 5",
    "// 6",
    "// 7",
    "const { edge } = require('./store');",
    "module.exports = { last: function last() { return edge(2); } }; function tail() { return edge(3); }",
  ]);
  write(root, "src/tiny.js", ["const { edge } = require('./store');", "function tiny() { return edge(4); }", "module.exports = { tiny };"]);
  write(root, "src/routes.js", [
    "const express = require('express');",
    "const router = express.Router();",
    "router.get('/items', (req, res) => res.json([]));",
    "module.exports = router;",
  ]);
  write(root, "tests/items.test.js", [
    "const request = require('supertest');",
    "const router = require('../src/routes');",
    "test('items', async () => {",
    "  await request(router).get('/items');",
    "});",
  ]);
  git("add", "-A");
  git("commit", "-qm", "init");
  cli(["config", "set", "code_graph", "on", "--dir", root]);
  const u = cli(["graph", "update", "--json", "--dir", root]);
  assert.equal(u.status, 0, u.stdout + u.stderr);
  return { root, git };
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const tok = (s) => Math.ceil(String(s).length / 4);

test("R1 — at most five confident callers, six lines each, never the target's own file", () => {
  const { root } = repo();
  const r = graph(root, "ctx", "lookup", "--callers-source", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.ok(j.callers.some((c) => c.file === "src/store.js"), "the card still NAMES the own-file caller as a row");
  assert.equal(j.callers_source.length, 5, "the cap is five");
  for (const b of j.callers_source) {
    assert.notEqual(b.file, "src/store.js", "the target's own file is never printed");
    assert.equal(b.to - b.from + 1, 6, `${b.file}: six lines`);
    assert.equal(b.text.split("\n").length, 6);
    assert.match(b.text, /lookup\(\d\)/, "the window holds the call");
    assert.equal(b.changed, false);
  }
  assert.equal(j.counts.callers_source_cut, 0);
  assert.match(j.card, /callers source {2}5 shown \(6 lines each\)/);
  assert.match(j.card, /src\/c1\.js:3-8 {2}← use1/);
  assert.match(j.card, /```js/);
  assert.equal(j.read, "full", "the sharded path declines --callers-source");
  assert.equal(j.read_fallback, "callers-source");
});

test("R1 — the window is shifted at either end of a file, and a short file is printed whole", () => {
  const { root } = repo();
  const j = json(graph(root, "ctx", "edge", "--callers-source", "--json"));
  const by = Object.fromEntries(j.callers_source.map((b) => [b.file, b]));
  assert.deepStrictEqual([by["src/first.js"].from, by["src/first.js"].to], [1, 6], "a call on line 1 still gets six lines");
  assert.deepStrictEqual([by["src/last.js"].from, by["src/last.js"].to], [4, 9], "a call on the last line still gets six lines");
  assert.deepStrictEqual([by["src/tiny.js"].from, by["src/tiny.js"].to], [1, 3], "a three-line file is three lines");
  // Two call sites on the same line of src/last.js are ONE window.
  assert.equal(j.callers_source.filter((b) => b.file === "src/last.js").length, 1);
});

test("R1 — an AMBIGUOUS candidate is never printed; `maybe` stays a count", () => {
  const { root } = repo();
  const j = json(graph(root, "ctx", "src/pa.js:1", "--callers-source", "--json"));
  assert.equal(j.target.qname, "pick");
  assert.ok(j.maybe_callers >= 1, "guess() names pick among AMBIGUOUS candidates");
  assert.deepStrictEqual(j.callers_source, [], "and no source is printed for a guess");
  assert.ok(!/src\/guess\.js/.test(j.card.split("callers source")[1] || ""));
});

test("R1 — the budget is never exceeded, and the footer counts the callers it cut", () => {
  const { root } = repo();
  const seen = new Set();
  for (const budget of [100, 180, 260, 400]) {
    const j = json(graph(root, "ctx", "lookup", "--callers-source", "--budget", String(budget), "--json"));
    assert.ok(j.budget.used <= budget, `budget ${budget}: used ${j.budget.used}`);
    assert.ok(tok(j.card) <= budget + 5, `budget ${budget}: the card is ${tok(j.card)} tokens`);
    const shown = j.callers_source.length;
    assert.equal(j.counts.callers_source_cut, 5 - shown);
    if (shown && shown < 5) {
      assert.match(j.card, new RegExp(`callers source {2}${shown} of 5 shown \\(6 lines each; raise --budget\\)`));
      assert.match(j.card, new RegExp(`callers source ${5 - shown} cut \\(raise --budget\\)`));
    }
    if (!shown) assert.match(j.card, /callers source not shown \(5 callers, raise --budget\)/);
    seen.add(shown === 0 ? "none" : shown < 5 ? "some" : "all");
  }
  assert.deepStrictEqual([...seen].sort(), ["all", "none", "some"], "the budgets walk every case: none, some, all");
});

test("R1 — a ROUTE caller is named by its URL; a CHANGED caller file says so", () => {
  const { root } = repo();
  const route = json(graph(root, "ctx", "GET /items", "--callers-source", "--json"));
  assert.equal(route.state, "found", route.line);
  const b = route.callers_source.find((x) => x.file === "tests/items.test.js");
  assert.ok(b, "the test that reaches the route by URL has a block");
  assert.equal(b.caller, "GET /items");
  assert.match(route.card, /tests\/items\.test\.js:\d+-\d+ {2}← GET \/items/);

  fs.appendFileSync(path.join(root, "src", "c1.js"), "// edited\n");
  const j = json(graph(root, "ctx", "lookup", "--callers-source", "--json"));
  const c1 = j.callers_source.find((x) => x.file === "src/c1.js");
  assert.equal(c1.changed, true);
  assert.match(j.card, /src\/c1\.js:3-8 {2}← use1 {2}— CHANGED since index, the range may have moved/);
});

test("R1 — ignored on a file card and on --for-slice, and named as ignored", () => {
  const { root } = repo();
  const f = json(graph(root, "ctx", "src/store.js", "--callers-source", "--json"));
  assert.ok(!f.callers_source, "a file card carries no callers_source");
  assert.match(f.card, /callers source: symbol cards only/);
  const s = json(graph(root, "ctx", "--for-slice", "src/store.js", "--callers-source", "--json"));
  assert.match(s.card, /callers source: symbol cards only/);
  // And without the flag, nothing about it anywhere.
  const plain = json(graph(root, "ctx", "lookup", "--json"));
  assert.ok(!("callers_source" in plain));
  assert.ok(!/callers source/.test(plain.card));
});

test("R1 — --brief drops callers_source[] and keeps its count", () => {
  const { root } = repo();
  const j = json(graph(root, "ctx", "lookup", "--callers-source", "--json", "--brief"));
  assert.ok(!("callers_source" in j));
  assert.equal(j.counts.callers_source, 5);
  assert.equal(j.counts.callers_source_cut, 0);
  assert.match(j.card, /callers source {2}5 shown/, "the card still carries the blocks");
  assert.ok(j.lsp_at && j.lsp_at.line === 2, "lsp_at survives --brief");
});

test("R1 — the blocks are paid as source, and each one avoided a range read", () => {
  const { root } = repo();
  const ledger = path.join(root, ".claude", "orc", "graph", "gain.jsonl");
  const rows = () => fs.readFileSync(ledger, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  graph(root, "ctx", "lookup", "--json");
  const plain = rows().pop();
  const j = json(graph(root, "ctx", "lookup", "--callers-source", "--json"));
  const withSrc = rows().pop();
  const want = j.callers_source.reduce((a, b) => a + tok(b.text), 0);
  assert.equal(withSrc.paid.source, want, "paid.source is the blocks' own text");
  assert.equal(plain.paid.source, 0);
  assert.ok(withSrc.avoided.low > plain.avoided.low, "each block adds the range read it replaced");
  assert.equal(withSrc.avoided.calls_low, plain.avoided.calls_low + j.callers_source.length);
});

test("R4 — lsp_at is the 1-based column of the name on its definition line", () => {
  const { root } = repo();
  for (const q of ["lookup", "edge"]) {
    const j = json(graph(root, "ctx", q, "--json"));
    const line = fs.readFileSync(path.join(root, "src", "store.js"), "utf8").split("\n")[j.target.lines[0] - 1];
    assert.deepStrictEqual(j.lsp_at, { file: "src/store.js", line: j.target.lines[0], character: line.indexOf(q) + 1 });
  }
  // The sharded path and the full path answer the same field.
  const fast = json(graph(root, "ctx", "lookup", "--json"));
  const full = json(graph(root, "ctx", "src/store.js:2", "--json"));
  assert.equal(fast.read, "sharded");
  assert.deepStrictEqual(fast.lsp_at, full.lsp_at);
});

test("R4 — lsp_at is null on a CHANGED file, and on a name that is not on its line", () => {
  const { root } = repo();
  const before = json(graph(root, "ctx", "use2", "--json"));
  assert.equal(before.blob, "current");
  assert.deepStrictEqual(before.lsp_at, { file: "src/c2.js", line: 3, character: "function use2".indexOf("use2") + 1 });
  // An edit BELOW the definition still makes the whole file CHANGED: the index
  // cannot say which lines moved, so no column is stated.
  fs.appendFileSync(path.join(root, "src", "c2.js"), "// edited\n");
  const after = json(graph(root, "ctx", "use2", "--json"));
  assert.equal(after.blob, "changed");
  assert.equal(after.lsp_at, null);
  const route = json(graph(root, "ctx", "GET /items", "--json"));
  assert.equal(route.lsp_at, null, "a route's name is `GET /items`, which no line spells");
});
