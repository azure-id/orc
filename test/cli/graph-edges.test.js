"use strict";
// @test-pool spawn  — shells node bin/cli.js for the config key; the rest drives the engine in-process
// v1.8.2 W2 — the edges a grep cannot see: instance aliases (G2), inherited
// members (G3), barrel re-exports (G4), the mask fixes (G5), the ignore key (G8)
// and the batched blob check (S3).
//
// The promises this file holds:
//
//   1. `const x = new S(); x.m()` is an edge to `S.m` with the same state the
//      class resolves with, marked `(via x)`. A local that shadows the alias
//      in a nested scope is NOT an edge. An alias to a class that is not in
//      the repository is UNRESOLVED — not "some m somewhere".
//   2. `this.m()` in a class with no `m` walks `extends` (depth ≤ 4, cycle
//      safe) and lands on the base member, marked `(inherited)`; `super.m()`
//      starts one level up; an own member still wins.
//   3. A name imported through a barrel resolves IMPORT to its defining file,
//      through `export * from`, `export { a as b } from`, `module.exports =
//      require`, `exports.a = require().a` and a Python `__init__.py`.
//   4. `${fn()}` in a template, `{fn()}` in an f-string and a call after a
//      regex literal are calls; `a / b` is not a regex.
//   5. `code_graph_ignore` and the default skips keep a file out of the map,
//      and `coverage` says `excluded` for it.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");
const X = require("../../bin/graph-extract.js");
const G = require("../../bin/graph.js");
const Q = require("../../bin/graph-query.js");

const one = (rel, lang, src) => X.extractOne({ rel, lang, src }, null);
const sym = (rec, qname) => rec.symbols.find((s) => s.qname === qname);
const json = (r) => JSON.parse(r.stdout);

function write(root, rel, body) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
}

function repo(files) {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  for (const [rel, body] of Object.entries(files)) write(root, rel, body);
  git("add", "-A");
  git("commit", "-qm", "base");
  return { root, claudeDir: path.join(root, ".claude"), git };
}

function model(files, opts) {
  const c = repo(files);
  const u = G.graphUpdate(c.claudeDir, c.root, { enabled: true, ...(opts || {}) });
  assert.equal(u.exit, 0, JSON.stringify(u));
  return { ...c, m: Q.loadModel(c.claudeDir, c.root, { noCache: true }), hot: Q.loadModel(c.claudeDir, c.root) };
}

const callers = (m, q) => {
  const t = Q.findTarget(m, q);
  assert.equal(t.kind, "symbol", `${q}: ${t.kind}`);
  return Q.callersOf(m, t.sym).confident.map((c) => `${c.sym.file}:${c.line} ${c.state}${c.alias ? ` via ${c.alias}` : ""}${c.inherited ? " inherited" : ""}${c.ref ? " ref" : ""}`);
};

// ── G2 aliases ──────────────────────────────────────────────────────────────
test("aliases — an instance variable stands for its class, in every language, scoped and shadowable", () => {
  const { m, hot } = model({
    "src/service.js": ["class OrderService {", "  create(o) { return o; }", "  list() { return []; }", "}", "module.exports = { OrderService };"].join("\n"),
    "src/routes.js": [
      "const { OrderService } = require('./service');",
      "const { Router } = require('express');",
      "const router = Router();",
      "const svc = new OrderService();",
      "function handle(body) {",
      "  return svc.create(body);",
      "}",
      "function shadowed(other) {",
      "  const svc = other;",
      "  return svc.create({});",
      "}",
      "router.get('/x', (req, res) => res.json(svc.list()));",
      "module.exports = { handle, shadowed, router };",
    ].join("\n"),
    "src/holder.ts": [
      "import { OrderService } from './service';",
      "export class Holder {",
      "  private readonly repo = new OrderService();",
      "  constructor(private readonly orders: OrderService) {}",
      "  run() { return this.orders.create(this.repo.list()); }",
      "}",
    ].join("\n"),
    "py/svc.py": ["class Store:", "    def save(self, x):", "        return x", ""].join("\n"),
    "py/app.py": ["from py.svc import Store", "store = Store()", "class App:", "    def __init__(self):", "        self.db = Store()", "    def go(self, x):", "        self.db.save(x)", "        return store.save(x)", ""].join("\n"),
    "go.mod": "module fixture\n\ngo 1.22\n",
    "store.go": ["package main", "type Store struct{}", "func NewStore() *Store { return &Store{} }", "func (s *Store) List() []int { return nil }"].join("\n"),
    "main.go": ["package main", "func main() {", "\ts := NewStore()", "\t_ = s.List()", "\tvar t *Store", "\t_ = t.List()", "}"].join("\n"),
  });
  assert.deepStrictEqual(callers(m, "OrderService.create"), ["src/holder.ts:5 IMPORT via orders", "src/routes.js:6 IMPORT via svc"]);
  assert.deepStrictEqual(callers(m, "OrderService.list"), ["src/holder.ts:5 IMPORT via repo", "src/routes.js:12 IMPORT via svc"]);
  // The shadowed `svc` in `shadowed()` is not an edge: with its type unknown it
  // is the AMBIGUOUS hint it was in 1.8.1 (one maybe), never a confident caller.
  const create = Q.findTarget(m, "OrderService.create").sym;
  assert.equal(Q.callersOf(m, create).maybe, 1);
  // `router.get` is an alias of `Router`, a class this repository does not
  // define: UNRESOLVED, never an AMBIGUOUS list of every `get` in the tree.
  const routes = m.byFile["src/routes.js"];
  const rget = routes.symbols.flatMap((s) => s.calls).find((c) => c.name === "Router.get");
  assert.ok(rget && rget.alias === "router");
  assert.equal(Q.resolveCall(m, "src/routes.js", routes.symbols.find((s) => s.name === "GET /x"), rget).state, "UNRESOLVED");
  assert.deepStrictEqual(callers(m, "Store.save"), ["py/app.py:7 IMPORT via db", "py/app.py:8 IMPORT via store"]);
  assert.deepStrictEqual(callers(m, "Store.List"), ["main.go:4 LOCAL via s", "main.go:6 LOCAL via t"]);
  // The card marks the alias on both sides.
  const card = Q.ctx(m, "src/routes.js#handle", { budget: 2000 }).card;
  assert.match(card, /→ calls {6}OrderService\.create {2}src\/service\.js:2 {2}IMPORT \(via svc\)/);
  assert.match(Q.ctx(m, "OrderService.create", { budget: 2000 }).card, /← called by {2}handle {2}src\/routes\.js:6 {2}IMPORT \(via svc\)/);
  // And the cache agrees with the computation, alias marks included.
  for (const q of ["OrderService.create", "Store.save", "Store.List", "src/routes.js"]) assert.deepStrictEqual(Q.ctx(hot, q, { budget: 4000 }), Q.ctx(m, q, { budget: 4000 }), q);
});

// ── G3 inheritance ──────────────────────────────────────────────────────────
test("inheritance — this.m() and super.m() land on the base member, own members win, cycles end", () => {
  const { m, hot } = model({
    "src/base.js": ["class Base {", "  ok(x) { return x; }", "  log(x) { return x; }", "}", "module.exports = { Base };"].join("\n"),
    "src/mid.js": ["const { Base } = require('./base');", "class Mid extends Base {", "  log(x) { return super.log(x) + 1; }", "}", "module.exports = { Mid };"].join("\n"),
    "src/leaf.js": [
      "const { Mid } = require('./mid');",
      "class Leaf extends Mid {",
      "  run() { return this.ok(this.log(1)); }",
      "  ok(x) { return -x; }",
      "}",
      "class A extends B { go() { return this.nowhere(); } }",
      "class B extends A {}",
      "module.exports = { Leaf, A, B };",
    ].join("\n"),
    "py/base.py": ["class BaseService:", "    def log(self, m):", "        return m", ""].join("\n"),
    "py/svc.py": ["from py.base import BaseService", "class OrderService(BaseService):", "    def run(self):", "        self.log('a')", "        return super().log('b')", ""].join("\n"),
  });
  // Leaf.run: `this.ok` is Leaf's OWN ok (LOCAL, not inherited); `this.log` is
  // Mid.log two hops away? No — one hop: Leaf extends Mid, and Mid HAS log.
  assert.deepStrictEqual(callers(m, "src/leaf.js#Leaf.ok"), ["src/leaf.js:3 LOCAL"]);
  assert.deepStrictEqual(callers(m, "Mid.log"), ["src/leaf.js:3 IMPORT inherited"]);
  // Mid.log's `super.log` skips Mid's own log and lands on Base.log.
  assert.deepStrictEqual(callers(m, "Base.log"), ["src/mid.js:3 IMPORT inherited"]);
  assert.deepStrictEqual(callers(m, "Base.ok"), [], "Leaf overrides ok, so Base.ok is not reached");
  // Python: both the plain self call and super() — Python is on the borrowed
  // rung or the heuristic one, and both must agree.
  assert.deepStrictEqual(callers(m, "BaseService.log"), ["py/svc.py:4 IMPORT inherited", "py/svc.py:5 IMPORT inherited"]);
  // A cycle (A extends B extends A) with a member nobody defines: no hang, no edge.
  const go = m.byFile["src/leaf.js"].symbols.find((s) => s.qname === "A.go");
  assert.equal(Q.resolveCall(m, "src/leaf.js", go, go.calls.find((c) => c.name === "nowhere")).state, "UNRESOLVED");
  assert.match(Q.ctx(m, "src/leaf.js#Leaf.run", { budget: 2000 }).card, /→ calls {6}Mid\.log {2}src\/mid\.js:3 {2}IMPORT \(inherited\)/);
  for (const q of ["Mid.log", "Base.log", "BaseService.log", "src/leaf.js"]) assert.deepStrictEqual(Q.ctx(hot, q, { budget: 4000 }), Q.ctx(m, q, { budget: 4000 }), q);
});

// ── G4 barrels ──────────────────────────────────────────────────────────────
test("barrels — a re-exported name resolves IMPORT to the file that defines it, through every barrel shape", () => {
  const { m } = model({
    "src/core/alpha.js": "export function alpha() { return 1; }\nexport function beta() { return 2; }\n",
    "src/core/index.js": "export * from './alpha.js';\n",
    "src/svc/service.ts": "export class Service { run() { return 1; } }\n",
    "src/svc/index.ts": "export { Service as Svc } from './service';\nexport * from '../core/index.js';\n",
    "src/cjs/impl.js": "function work() { return 1; }\nfunction other() { return 2; }\nmodule.exports = { work, other };\n",
    "src/cjs/index.js": "module.exports = require('./impl');\n",
    "src/cjs/pick.js": "exports.doWork = require('./impl').work;\n",
    "src/use.js": [
      "import { alpha } from './core';",
      "import { Svc, beta } from './svc';",
      "const { work } = require('./cjs');",
      "const { doWork } = require('./cjs/pick');",
      "export function go() { const s = new Svc(); return alpha() + beta() + work() + doWork() + s.run(); }",
    ].join("\n"),
    "pkg/services/__init__.py": "from .orders import OrderService\nfrom .base import *\n",
    "pkg/services/orders.py": "class OrderService:\n    def run(self):\n        return 1\n",
    "pkg/services/base.py": "def helper():\n    return 1\n",
    "pkg/app.py": "from pkg.services import OrderService, helper\nsvc = OrderService()\ndef go():\n    helper()\n    return svc.run()\n",
  });
  assert.deepStrictEqual(callers(m, "alpha"), ["src/use.js:5 IMPORT"]);
  assert.deepStrictEqual(callers(m, "beta"), ["src/use.js:5 IMPORT"], "a barrel of a barrel (svc/index → core/index → alpha.js)");
  assert.deepStrictEqual(callers(m, "Service.run"), ["src/use.js:5 IMPORT via s"], "`export { Service as Svc }` renames on the way");
  assert.deepStrictEqual(callers(m, "work"), ["src/use.js:5 IMPORT"], "module.exports = require(…)");
  assert.deepStrictEqual(callers(m, "src/cjs/impl.js#work"), ["src/use.js:5 IMPORT"]);
  const doWork = m.byFile["src/use.js"].symbols.find((s) => s.name === "go").calls.find((c) => c.name === "doWork");
  const r = Q.resolveCall(m, "src/use.js", m.byFile["src/use.js"].symbols.find((s) => s.name === "go"), doWork);
  assert.equal(r.state, "IMPORT");
  assert.equal(r.target, "src/cjs/impl.js#work", "exports.doWork = require('./impl').work");
  assert.deepStrictEqual(callers(m, "OrderService.run"), ["pkg/app.py:5 IMPORT via svc"], "a Python package __init__ is a barrel");
  assert.deepStrictEqual(callers(m, "helper"), ["pkg/app.py:4 IMPORT"], "and `from .base import *` is followed");
  assert.deepStrictEqual(m.byFile["src/svc/index.ts"].reexports, [
    { from: "./service", names: [{ local: "Svc", orig: "Service" }] },
    { from: "../core/index.js", names: "*" },
  ]);
});

// ── G5 mask ─────────────────────────────────────────────────────────────────
test("mask — template and f-string expressions are code, a regex literal is not a comment, a division is not a regex", () => {
  const js = one(
    "a.js",
    "js",
    [
      "function fmt(x) { return x; }",
      "function a() {",
      "  const s = `value: ${fmt(1)} and ${other(2)}`;",
      "  const re = /\\/\\*not a comment/;",
      "  const n = total / count / fmt(3);",
      "  return s.replace(/x/g, '${notACall()}') + `${'q' + fmt(4)}`;",
      "}",
    ].join("\n")
  );
  const names = sym(js, "a").calls.map((c) => c.name);
  assert.deepStrictEqual(names.filter((n) => n === "fmt").length, 3, "${fmt(1)}, fmt(3) after two divisions, fmt(4) inside a nested string expression");
  assert.ok(names.includes("other"));
  assert.ok(names.includes("s.replace"), "the call after the regex literal is seen");
  assert.ok(!names.includes("notACall"), "a ${} inside a PLAIN string is text");
  assert.equal(js.coverage, "full", "the `/` in the regex did not open a comment that ran to the end");

  const py = one("a.py", "py", ["def fmt(x):", "    return x", "def a(base):", '    s = f"{fmt(1)}/p {{literal}} {base}"', "    t = rf'{fmt(2)}'", "    u = '{notACall()}'", "    return s + t + u", ""].join("\n"));
  const pn = sym(py, "a").calls.map((c) => c.name);
  assert.deepStrictEqual(pn.filter((n) => n === "fmt").length, 2);
  assert.ok(!pn.includes("notACall"));
});

// ── G8 ignore + default skips ───────────────────────────────────────────────
test("ignore — code_graph_ignore globs and the default skips keep files out of the map, and coverage says excluded", () => {
  const c = repo({
    "src/app.js": "function app() { return 1; }\nmodule.exports = { app };\n",
    "src/types.d.ts": "export declare function app(): number;\n",
    "src/app.generated.js": "function app() { return 2; }\n",
    "dist/app.js": "function app() { return 3; }\n",
    "vendor/lib/x.js": "function app() { return 4; }\n",
    "gen/out.js": "function app() { return 5; }\n",
    "src/a.gen.ts": "export function app() { return 6; }\n",
    "src/keep.ts": "export function keep() { return 1; }\n",
  });
  const set = (v) => cli(["config", "set", "code_graph_ignore", v, "--dir", c.root]);
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", c.root]).status, 0);
  assert.notEqual(set("gen/** with space").status, 0, "a glob with a space is refused");
  assert.notEqual(set("../escape").status, 0);
  assert.equal(set("gen/**,*.gen.ts").status, 0);
  const u = json(cli(["graph", "update", "--json", "--dir", c.root]));
  assert.equal(u.exit, undefined);
  assert.equal(u.files, 2, JSON.stringify(u));
  const m = Q.loadModel(c.claudeDir, c.root);
  assert.deepStrictEqual([...m.fileSet].sort(), ["src/app.js", "src/keep.ts"]);
  // Exactly ONE `app` in the map, so the name is not ambiguous.
  assert.equal(Q.findTarget(m, "app").kind, "symbol");
  const cov = json(cli(["graph", "coverage", "src/types.d.ts", "dist/app.js", "gen/out.js", "src/a.gen.ts", "src/app.js", "--json", "--dir", c.root]));
  assert.deepStrictEqual(cov.rows.map((r) => `${r.path} ${r.coverage}`), ["src/types.d.ts excluded", "dist/app.js excluded", "gen/out.js excluded", "src/a.gen.ts excluded", "src/app.js full"]);
  // Clearing the key brings the globbed files back; the default skips stay.
  assert.equal(set("").status, 0);
  const u2 = json(cli(["graph", "update", "--json", "--dir", c.root]));
  assert.equal(u2.files, 4);
  assert.equal(u2.added, 2);
});

// ── S3 warm blobs ───────────────────────────────────────────────────────────
test("warmBlobs — one git call fills the freshness of every target's file, and matches the per-file answer", () => {
  const c = repo({
    "src/a.js": "function a() { return b(); }\nmodule.exports = { a };\n",
    "src/b.js": "function b() { return 1; }\nmodule.exports = { b };\n",
    "src/c.js": "function c() { return 1; }\nmodule.exports = { c };\n",
  });
  G.graphUpdate(c.claudeDir, c.root, { enabled: true });
  write(c.root, "src/b.js", "function b() { return 2; }\nmodule.exports = { b };\n");
  fs.rmSync(path.join(c.root, "src", "c.js"));
  const m = Q.loadModel(c.claudeDir, c.root);
  Q.warmBlobs(m, ["a", "src/b.js", "c", "nothing-here"]);
  assert.deepStrictEqual([...m.blobStates.entries()].sort(), [
    ["src/a.js", "current"],
    ["src/b.js", "changed"],
    ["src/c.js", "deleted"],
  ]);
  assert.equal(Q.ctx(m, "a", { budget: 2000 }).blob, "current");
  assert.equal(Q.ctx(m, "src/b.js", { budget: 2000 }).blob, "changed");
  assert.equal(Q.ctx(m, "c", { budget: 2000 }).blob, "deleted");
  // A cold model answers the same for each file, one git call at a time.
  const cold = Q.loadModel(c.claudeDir, c.root);
  for (const q of ["a", "src/b.js", "c"]) assert.deepStrictEqual(Q.ctx(cold, q, { budget: 2000 }), Q.ctx(m, q, { budget: 2000 }), q);
});
