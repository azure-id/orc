"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.2 W8 (S1, DE-I) — the SHARDED read path.
//
// The promises this file holds:
//
//   1. **Identical, or absent.** A card answered from the shards is BYTE for
//      byte the card the full model answers. That is the whole contract; the
//      speed is worthless without it.
//   2. It DECLINES rather than approximates. Every query it cannot prove it
//      would answer identically goes to the full model, and it says which
//      reason fired.
//   3. The shards are DERIVED. Deleting them, or leaving a set from another
//      generation, changes the time and not one byte of the answer.
//   4. `gc` removes a shard set the current generation will never read.
//   5. The gain ledger does not INVENT a basis it cannot have: a sharded read
//      records `grep_hits: null`, never a confident zero.
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

// Every edge class the fast path has to carry through unchanged: a plain call,
// an alias call, an inherited member, a route reached by URL, an AMBIGUOUS call
// (two `handle` methods), and a call that resolves to nothing.
function shop() {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/base.js", [
    "class Base {",
    "  ok(body) { return { status: 200, body }; }",
    "  fail(m) { return { status: 500, body: m }; }",
    "}",
    "module.exports = Base;",
  ]);
  write(root, "src/store.js", [
    "class Store {",
    "  constructor() { this.rows = new Map(); }",
    "  list() { return [...this.rows.values()]; }",
    "  insert(row) { this.rows.set(row.id, row); return row; }",
    "  get(id) { return this.rows.get(id); }",
    "}",
    "module.exports = Store;",
  ]);
  write(root, "src/handlers.js", [
    "const Base = require('./base');",
    "const Store = require('./store');",
    "const store = new Store();",
    "class Handlers extends Base {",
    "  list() { return this.ok(store.list()); }",
    "  find(id) {",
    "    const row = store.get(id);",
    "    return row ? this.ok(row) : this.fail('gone');",
    "  }",
    "  handle(x) { return this.ok(x); }",
    "}",
    "module.exports = Handlers;",
  ]);
  // A second `handle`, so a call to a bare `handle` is genuinely AMBIGUOUS.
  write(root, "src/other.js", ["class Other {", "  handle(x) { return x; }", "}", "module.exports = Other;"]);
  write(root, "src/routes.js", [
    "const express = require('express');",
    "const Handlers = require('./handlers');",
    "const router = express.Router();",
    "const h = new Handlers();",
    "router.get('/items', (req, res) => res.json(h.list()));",
    "router.get('/items/:id', (req, res) => res.json(h.find(req.params.id)));",
    "module.exports = router;",
  ]);
  write(root, "src/app.js", [
    "const express = require('express');",
    "const routes = require('./routes');",
    "const app = express();",
    "app.use('/api', routes);",
    "module.exports = app;",
  ]);
  write(root, "tests/items.test.js", [
    "const request = require('supertest');",
    "const app = require('../src/app');",
    "it('lists', () => request(app).get('/api/items'));",
    "it('finds', () => request(app).get('/api/items/1'));",
  ]);
  git("add", "-A");
  git("commit", "-qm", "shop");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  const u = cli(["graph", "update", "--dir", root]);
  assert.equal(u.status, 0, u.stdout + u.stderr);
  return root;
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const shardDir = (root) => path.join(root, ".claude", "orc", "graph", "resolved");

// ── 1. identical, or absent ─────────────────────────────────────────────────

test("sharded and full answer the SAME card, byte for byte", () => {
  const root = shop();
  assert.ok(fs.existsSync(shardDir(root)), "an update writes the shards");

  // Every shape at once: an inherited call, an alias call, a route, an
  // ambiguity, and a symbol that only anything else calls.
  const queries = ["Store.list", "Store.insert", "Handlers.list", "Handlers.find", "Base.ok", "Base.fail", "Store.get"];
  const bak = path.join(root, "shards-bak");
  let sharded = 0;
  const fast = {};
  for (const q of queries) {
    const r = json(graph(root, "ctx", q, "--json"));
    if (r.read === "sharded") sharded++;
    fast[q] = r;
  }
  assert.ok(sharded >= 5, `the fast path must carry most of these (carried ${sharded} of ${queries.length})`);

  fs.renameSync(shardDir(root), bak);
  for (const q of queries) {
    const full = json(graph(root, "ctx", q, "--json"));
    assert.equal(full.read, "full", `${q} must fall back with no shards`);
    assert.equal(fast[q].card, full.card, `${q}: the sharded card must be the full card`);
    assert.deepEqual(fast[q].callers, full.callers, `${q}: callers`);
    assert.deepEqual(fast[q].calls, full.calls, `${q}: calls`);
    assert.deepEqual(fast[q].effects, full.effects, `${q}: effects`);
    assert.deepEqual(fast[q].tests, full.tests, `${q}: tests`);
    assert.equal(fast[q].maybe_callers, full.maybe_callers, `${q}: maybe callers`);
    assert.equal(fast[q].unresolved, full.unresolved, `${q}: unresolved count`);
  }
  fs.renameSync(bak, shardDir(root));
});

test("an AMBIGUOUS call survives the interning table with its candidates intact", () => {
  const root = shop();
  const fast = json(graph(root, "ctx", "Handlers.handle", "--json"));
  const bak = path.join(root, "shards-bak");
  fs.renameSync(shardDir(root), bak);
  const full = json(graph(root, "ctx", "Handlers.handle", "--json"));
  fs.renameSync(bak, shardDir(root));
  assert.equal(fast.card, full.card);
  assert.deepEqual(fast.calls, full.calls);
});

test("--source is charged and printed the same on both paths", () => {
  const root = shop();
  const fast = json(graph(root, "ctx", "Handlers.find", "--source", "--json"));
  const bak = path.join(root, "shards-bak");
  fs.renameSync(shardDir(root), bak);
  const full = json(graph(root, "ctx", "Handlers.find", "--source", "--json"));
  fs.renameSync(bak, shardDir(root));
  assert.equal(fast.card, full.card);
  assert.deepEqual(fast.source, full.source);
  assert.deepEqual(fast.budget, full.budget);
});

// ── 2. it declines rather than approximates ────────────────────────────────

test("the fast path DECLINES what it cannot prove, and names the reason", () => {
  const root = shop();
  const cases = [
    ["src/store.js", "path-or-url"],
    ["src/store.js:3", "path-or-url"],
    // A slash is checked first, so a URL query reports the path reason.
    ["GET /api/items", "path-or-url"],
    ["two words", "not-a-plain-name"],
    ["noSuchSymbolAnywhere", "name-unknown"],
    // Two classes define `handle`, so a BARE `handle` is not one symbol.
    ["handle", "qname-not-exact"],
  ];
  for (const [q, reason] of cases) {
    const r = json(graph(root, "ctx", q, "--json"));
    assert.equal(r.read, "full", `${q} must go to the full model`);
    assert.equal(r.read_fallback, reason, `${q} must decline for ${reason}`);
  }
});

test("several targets in one call never take the fast path", () => {
  const root = shop();
  const r = json(graph(root, "ctx", "Store.list", "Store.get", "--json"));
  assert.equal(r.state, "found");
  assert.equal(r.read, undefined, "a multi-target call has no single read path");
});

// ── 3. the shards are DERIVED ───────────────────────────────────────────────

test("shards are generation-pinned — a stale set is never read", () => {
  const root = shop();
  const before = json(graph(root, "ctx", "Store.list", "--json"));
  assert.equal(before.read, "sharded");

  for (const f of fs.readdirSync(shardDir(root))) {
    const p = path.join(shardDir(root), f);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    fs.writeFileSync(p, JSON.stringify({ ...j, generation: j.generation + 99 }));
  }
  const after = json(graph(root, "ctx", "Store.list", "--json"));
  assert.equal(after.read, "full", "a shard naming another generation is not used");
  assert.equal(after.read_fallback, "shard-stale");
  assert.equal(after.card, before.card, "and the answer is unchanged");
});

test("an update rewrites the shards, and the card follows the code", () => {
  const root = shop();
  const before = json(graph(root, "ctx", "Store.list", "--json"));
  assert.equal(before.read, "sharded");

  write(root, "src/report.js", ["const Store = require('./store');", "const s = new Store();", "function report() { return s.list().length; }", "module.exports = { report };"]);
  spawnSync("git", ["add", "-A"], { cwd: root, encoding: "utf8" });
  spawnSync("git", ["commit", "-qm", "report"], { cwd: root, encoding: "utf8" });
  assert.equal(cli(["graph", "update", "--dir", root]).status, 0);

  const after = json(graph(root, "ctx", "Store.list", "--json"));
  assert.equal(after.read, "sharded", "still fast after an update");
  assert.ok(
    after.callers.some((c) => c.file === "src/report.js"),
    "the new caller is on the card"
  );
});

// ── 4. gc ───────────────────────────────────────────────────────────────────

test("gc removes a shard set the current generation will never read", () => {
  const root = shop();
  fs.writeFileSync(path.join(shardDir(root), "zz.json"), JSON.stringify({ schema: 1, engine: "graph@0", generation: 1, callers: {}, maybe: {}, cands: [], calls: {} }));
  const r = json(cli(["graph", "gc", "--dir", root, "--json"]));
  assert.equal(r.state, "done");
  assert.ok(r.shards.removed >= 1, "the dead shard is gone");
  assert.ok(!fs.existsSync(path.join(shardDir(root), "zz.json")));
  // And the live ones are untouched.
  assert.equal(json(graph(root, "ctx", "Store.list", "--json")).read, "sharded");
});

// ── 5. the gain ledger tells the truth about its own basis ─────────────────

test("a sharded read records grep_hits null, never a confident zero", () => {
  const root = shop();
  assert.equal(json(graph(root, "ctx", "Store.list", "--json")).read, "sharded");
  const ledger = path.join(root, ".claude", "orc", "graph", "gain.jsonl");
  const rows = fs
    .readFileSync(ledger, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const row = rows.filter((r) => r.cmd === "ctx").pop();
  assert.ok(row, "the read appended a row");
  assert.equal(row.basis.grep_hits, null, "the sharded model cannot size the search it replaced, and says so");

  const g = json(cli(["graph", "gain", "--dir", root, "--json"]));
  assert.ok(g.unsized >= 1, "`gain` counts the rows it could not size");
});

// ── 6. the hole the lazy read left ──────────────────────────────────────────

test("an unreadable blob found MID-CARD falls back, it never drops a row", () => {
  const root = shop();
  const fast = json(graph(root, "ctx", "Store.list", "--json"));
  assert.equal(fast.read, "sharded");
  assert.ok(fast.callers.some((c) => c.file === "src/handlers.js"), "a caller in another file");

  // Corrupt the blob of a CALLER's file — not the target's. The fast model reads
  // it lazily, so the damage is only discovered once the card is half built. It
  // must start again with the full model, which holds that file's symbols in
  // `index.json` and can still print the row.
  const files = JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "graph", "files.json"), "utf8"));
  const blob = files["src/handlers.js"].blob;
  const p = path.join(root, ".claude", "orc", "graph", "blobs", blob.slice(0, 2), `${blob}.json`);
  fs.writeFileSync(p, "{ this is not json");

  const r = json(graph(root, "ctx", "Store.list", "--json"));
  assert.equal(r.read, "full", "it gave up and used the full model");
  assert.match(String(r.read_fallback), /blob-unreadable/, "and it says which file did it");
  assert.equal(r.card, fast.card, "the card is the one the fast path would have given");
});
