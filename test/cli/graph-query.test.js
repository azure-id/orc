"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.0 W3 — resolution and the read commands: `orc graph ctx | impact | path`.
//
// The promises this file holds:
//
//   1. The chain the feature exists for is walkable: a route calls a service,
//      the service calls a repo, the repo runs a query — and the card says so.
//   2. AMBIGUOUS lists its candidates. It is never collapsed into a guess.
//   3. An external package is UNRESOLVED, never matched to a same-named repo
//      function.
//   4. A card NEVER exceeds its budget, and says what it hid.
//   5. A file edited after the index is labelled CHANGED on the card.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");

const json = (r) => JSON.parse(r.stdout);

function write(root, rel, body) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
}

function shop() {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/routes/orders.js", [
    "const express = require('express');",
    "const { OrderService } = require('../orders/service');",
    "const router = express.Router();",
    "const orderService = new OrderService();",
    "router.post('/orders', (req, res) => orderService.create(req.body));",
    "module.exports = router;",
  ].join("\n"));
  write(root, "src/orders/service.js", [
    "const { validateCart } = require('../cart/validate');",
    "const OrderRepo = require('./repo');",
    "const axios = require('axios');",
    "class OrderService {",
    "  constructor() { this.orderRepo = new OrderRepo(); }",
    "  create(order) {",
    "    validateCart(order);",
    "    emit('order.created');",
    "    axios.get('https://x.example');",
    "    return this.orderRepo.insert(order);",
    "  }",
    "}",
    "module.exports = { OrderService };",
  ].join("\n"));
  write(root, "src/orders/repo.js", [
    "class OrderRepo {",
    "  insert(o) {",
    "    return db.query(\"INSERT INTO orders (total) VALUES ($1)\", [o.total]);",
    "  }",
    "}",
    "module.exports = OrderRepo;",
  ].join("\n"));
  write(root, "src/cart/validate.js", "function validateCart(c) { return !!c; }\nmodule.exports = { validateCart };\n");
  write(root, "src/events/bus.js", "function emit(name) { return name; }\nfunction get() { return 1; }\nmodule.exports = { emit, get };\n");
  write(root, "src/ws/hub.js", "function emit(name) { return name; }\nmodule.exports = { emit };\n");
  write(root, "test/orders.test.js", [
    "const { OrderService } = require('../src/orders/service');",
    "const { validateCart } = require('../src/cart/validate');",
    "validateCart({});",
    "new OrderService().create({ total: 1 });",
  ].join("\n"));
  git("add", "-A");
  git("commit", "-qm", "shop");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  const u = cli(["graph", "update", "--dir", root]);
  assert.equal(u.status, 0, u.stdout + u.stderr);
  return { root, git };
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);

test("ctx — the route → service → repo → SQL chain, with the state of every edge", () => {
  const { root } = shop();
  const r = graph(root, "ctx", "OrderService.create", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.target.file, "src/orders/service.js");
  const byName = Object.fromEntries(j.calls.filter((c) => c.level === 1 || c.state === "AMBIGUOUS").map((c) => [c.name, c]));
  assert.equal(byName.validateCart.state, "IMPORT");
  assert.equal(byName.validateCart.target.file, "src/cart/validate.js");
  // v1.8.2 W2: `this.orderRepo.insert` is an instance ALIAS of the imported
  // OrderRepo, so the edge is IMPORT (via orderRepo), no longer a UNIQUE guess.
  assert.equal(byName["OrderRepo.insert"].state, "IMPORT");
  assert.equal(byName["OrderRepo.insert"].alias, "orderRepo");
  assert.equal(byName["OrderRepo.insert"].target.qname, "OrderRepo.insert");
  assert.ok(j.effects.some((e) => e.type === "sql" && /INSERT INTO orders/.test(e.text) && e.of.endsWith("#OrderRepo.insert")), "depth 2 reaches the query");
  assert.ok(j.callers.some((c) => c.file === "src/routes/orders.js" && c.state === "IMPORT" && c.alias === "orderService"), "the route calls it through its alias");
  assert.match(j.card, /OrderRepo\.insert {2}src\/orders\/repo\.js:2 {2}IMPORT \(via orderRepo\)/);
  assert.deepStrictEqual(j.tests, ["test/orders.test.js"]);
  assert.equal(j.blob, "current");
  assert.match(j.card, /effect sql {2}"INSERT INTO orders/);
});

test("ctx — AMBIGUOUS keeps every candidate; an external package is UNRESOLVED, not a repo match", () => {
  const { root } = shop();
  const j = json(graph(root, "ctx", "OrderService.create", "--json"));
  const emit = j.calls.find((c) => c.name === "emit");
  assert.equal(emit.state, "AMBIGUOUS");
  assert.equal(emit.candidates.length, 2);
  assert.ok(!j.calls.some((c) => c.name === "axios.get"), "axios.get resolves to nothing here and is not shown");
  assert.ok(j.unresolved >= 1);
});

test("ctx — a card never exceeds its budget and says what it hid", () => {
  const { root } = shop();
  const j = json(graph(root, "ctx", "OrderService.create", "--budget", "100", "--json"));
  assert.ok(j.budget.used <= 100, `used ${j.budget.used}`);
  assert.ok(Math.ceil(j.card.length / 4) <= 100 + 5);
  assert.ok(Object.keys(j.hidden).length > 0);
  assert.match(j.card, /hidden: /);
});

test("ctx — file:line finds the innermost symbol; a file alone gives the file card", () => {
  const { root } = shop();
  const a = json(graph(root, "ctx", "src/orders/repo.js:3", "--json"));
  assert.equal(a.target.qname, "OrderRepo.insert");
  const f = json(graph(root, "ctx", "src/orders/repo.js", "--json"));
  assert.equal(f.file, "src/orders/repo.js");
  assert.ok(f.importers.includes("src/orders/service.js"));
});

test("ctx — an unknown name is exit 4 with the nearest names; an ambiguous name lists its choices", () => {
  const { root } = shop();
  const none = graph(root, "ctx", "validat", "--json");
  assert.equal(none.status, 4);
  assert.ok(json(none).nearest.some((s) => s.qname === "validateCart"));
  const amb = graph(root, "ctx", "emit", "--json");
  assert.equal(amb.status, 4);
  assert.equal(json(amb).candidates.length, 2);
  assert.match(graph(root, "ctx", "emit").stdout, /pick one/);
});

test("ctx — a file edited after the index is CHANGED on the card", () => {
  const { root } = shop();
  write(root, "src/orders/repo.js", "class OrderRepo {\n  insert(o) { return 1; }\n}\nmodule.exports = OrderRepo;\n");
  const j = json(graph(root, "ctx", "OrderRepo.insert", "--json"));
  assert.equal(j.blob, "changed");
  assert.match(j.card, /CHANGED since index/);
});

test("ctx — middleware passed by name is `used by` its route; an unbound name passed along is no edge; several targets share one budget", () => {
  const { root, git } = shop();
  write(root, "src/auth.js", "function requireAuth(req, res, next) {\n  next();\n}\nmodule.exports = { requireAuth };\n");
  write(root, "src/routes/admin.js", [
    "const { requireAuth } = require('../auth');",
    "const router = require('express').Router();",
    "router.delete('/orders/:id', requireAuth, (req, res) => { res.json(validateCart); });",
    "module.exports = router;",
  ].join("\n"));
  git("add", "-A");
  git("commit", "-qm", "auth");
  assert.equal(graph(root, "update").status, 0);
  const j = json(graph(root, "ctx", "requireAuth", "--json"));
  assert.ok(j.callers.some((c) => c.qname === "DELETE /orders/:id" && c.ref && c.state === "IMPORT"), JSON.stringify(j.callers));
  assert.match(j.card, /← used by\s+DELETE \/orders\/:id  src\/routes\/admin\.js:3  IMPORT/);
  const v = json(graph(root, "ctx", "validateCart", "--json"));
  assert.ok(!v.callers.some((c) => c.file === "src/routes/admin.js"), "validateCart is not imported in admin.js, so passing the name is no edge");
  const imp = json(graph(root, "impact", "src/auth.js", "--json"));
  assert.ok(imp.callers.some((c) => c.qname === "DELETE /orders/:id"), "a ref counts for impact");
  const m = graph(root, "ctx", "src/auth.js", "src/routes/admin.js", "--budget", "600", "--json");
  assert.equal(m.status, 0, m.stdout + m.stderr);
  const mj = json(m);
  assert.deepStrictEqual(mj.cards.map((c) => c.state), ["found", "found"]);
  assert.ok(mj.budget.used <= 600);
  assert.equal(mj.line, undefined, "the card is the line — it is not sent twice");
  assert.equal(mj.trace, "GRAPH-CONSULT card :: targets=src/auth.js,src/routes/admin.js");
});

test("impact — transitive callers by depth, and the tests that reach them", () => {
  const { root } = shop();
  const r = graph(root, "impact", "src/orders/repo.js", "--json");
  assert.equal(r.status, 0, r.stdout);
  const j = json(r);
  const d1 = j.callers.filter((c) => c.depth === 1).map((c) => c.qname);
  const d2 = j.callers.filter((c) => c.depth === 2).map((c) => `${c.file}#${c.qname}`);
  assert.ok(d1.includes("OrderService.create"), JSON.stringify(j.callers));
  assert.ok(d2.includes("src/routes/orders.js#POST /orders"), "the route handler is the caller, not <module>");
  assert.ok(j.tests.includes("test/orders.test.js"));
  const miss = graph(root, "impact", "src/nope.js", "--json");
  assert.equal(miss.status, 4);
});

test("path — the confident chain exists one way and not the other", () => {
  const { root } = shop();
  const r = graph(root, "path", "OrderService.create", "OrderRepo.insert", "--json");
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.hops, 1);
  assert.deepStrictEqual(j.chain.map((c) => c.qname), ["OrderService.create", "OrderRepo.insert"]);
  assert.equal(graph(root, "path", "OrderRepo.insert", "OrderService.create", "--json").status, 4);
});

test("read commands — no index is exit 1; off with --if-enabled is exit 3", () => {
  const root = tmpdir();
  spawnSync("git", ["init", "-q"], { cwd: root });
  assert.equal(graph(root, "ctx", "x", "--json").status, 1);
  const off = graph(root, "impact", "a.js", "--if-enabled", "--json");
  assert.equal(off.status, 3);
  assert.equal(json(off).state, "off");
});

test("python — a relative import resolves, and a self call finds the method on the same class", { skip: process.platform === "win32" && !process.env.PATH }, () => {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  write(root, "app/__init__.py", "");
  write(root, "app/repo.py", "class OrderRepo:\n    def insert(self, o):\n        return o\n");
  write(root, "app/service.py", [
    "from .repo import OrderRepo",
    "class OrderService:",
    "    def create(self, o):",
    "        self.check(o)",
    "        return OrderRepo().insert(o)",
    "    def check(self, o):",
    "        return o",
  ].join("\n"));
  git("add", "-A");
  git("commit", "-qm", "py");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  assert.equal(graph(root, "update").status, 0);
  const j = json(graph(root, "ctx", "OrderService.create", "--json"));
  const byName = Object.fromEntries(j.calls.map((c) => [c.name, c]));
  assert.equal(byName.check.state, "LOCAL");
  assert.equal(byName.check.target.qname, "OrderService.check");
  assert.equal(byName.OrderRepo.state, "IMPORT");
});
