"use strict";
// @test-pool spawn  — the Python rung shells a python subprocess
// v1.8.0 W2 — extraction: symbols, calls, imports, effects, body hashes.
//
// The promises this file holds:
//
//   1. A call inside a comment or a string is never a call.
//   2. A class member is qualified by its class, in every brace language —
//      W0 found the crude pattern missed TypeScript methods entirely.
//   3. `body_hash` changes with THIS symbol's text only. Notes key on it, so a
//      hash that moved with a neighbour would throw away paid-for notes.
//   4. The effect that answers "which query does this run" is found and
//      anchored to its line.
//   5. The borrowed Python parser and the heuristic agree on the shape.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tmpdir } = require("../_helpers");
const X = require("../../bin/graph-extract.js");

const one = (rel, lang, src) => X.extractOne({ rel, lang, src }, null);
const sym = (rec, qname) => rec.symbols.find((s) => s.qname === qname);
const callNames = (s) => s.calls.map((c) => c.name);

test("js — functions, arrows and a class with methods; comments and strings are not calls", () => {
  const src = [
    "const { validateCart } = require('../cart/validate');",
    "// fake() in a comment",
    "function helper(a) { return a + 1; }",
    "const arrow = async (x) => { return helper(x); };",
    "class OrderService {",
    "  constructor(repo) { this.repo = repo; }",
    "  async create(order) {",
    "    validateCart(order);",
    "    const msg = \"notACall()\";",
    "    return this.orderRepo.insert(order);",
    "  }",
    "}",
    "module.exports = { OrderService, arrow };",
  ].join("\n");
  const r = one("src/orders/service.js", "js", src);
  assert.ok(sym(r, "helper"));
  assert.ok(sym(r, "arrow"));
  assert.ok(sym(r, "OrderService"));
  const create = sym(r, "OrderService.create");
  assert.ok(create, "a method is qualified by its class");
  assert.deepStrictEqual(create.lines, [7, 11]);
  assert.deepStrictEqual(callNames(create).sort(), ["orderRepo.insert", "validateCart"]);
  assert.equal(create.calls.find((c) => c.name === "orderRepo.insert").self, true);
  const all = r.symbols.flatMap(callNames);
  assert.ok(!all.includes("fake"), "a call in a comment is not a call");
  assert.ok(!all.includes("notACall"), "a call in a string is not a call");
  assert.equal(sym(r, "arrow").exported, true, "module.exports names count as exported");
  assert.deepStrictEqual(r.imports[0].bindings, [{ local: "validateCart", orig: "validateCart", kind: "named" }]);
});

test("ts — class members with modifiers, generics and return types (the W0 gap)", () => {
  const src = [
    "import { Injectable } from '@nestjs/common';",
    "import * as utils from './utils';",
    "import Repo, { type Row as R } from './repo';",
    "@Injectable()",
    "export class UsersService {",
    "  private readonly cache = new Map<string, number>();",
    "  public async findAll<T>(limit: number): Promise<T[]> {",
    "    return utils.page(limit);",
    "  }",
    "  static of(): UsersService {",
    "    return new UsersService();",
    "  }",
    "  private handle = async (id: string): Promise<void> => {",
    "    await Repo.load(id);",
    "  };",
    "}",
  ].join("\n");
  const r = one("src/users.service.ts", "ts", src);
  assert.ok(sym(r, "UsersService.findAll"));
  assert.ok(sym(r, "UsersService.of"));
  assert.ok(sym(r, "UsersService.handle"), "an arrow class property is a member");
  assert.equal(sym(r, "UsersService.findAll").exported, true);
  assert.equal(sym(r, "UsersService.handle").exported, false, "private is not exported");
  assert.deepStrictEqual(callNames(sym(r, "UsersService.of")), ["UsersService"]);
  const b = r.imports.flatMap((i) => i.bindings);
  assert.ok(b.some((x) => x.local === "utils" && x.kind === "namespace"));
  assert.ok(b.some((x) => x.local === "Repo" && x.kind === "default"));
  assert.ok(b.some((x) => x.local === "R" && x.orig === "Row"));
});

test("ts — an overload signature is not a symbol; only the implementation is", () => {
  const src = [
    "export class NestFactoryStatic {",
    "  public create(module: any): Promise<App>;",
    "  public create(module: any, options: Options): Promise<App>;",
    "  public async create(module: any, options?: Options): Promise<App> {",
    "    return this.build(module, options);",
    "  }",
    "}",
    "export function make(a: string): string;",
    "export function make(a: any): any { return a; }",
  ].join("\n");
  const r = one("packages/core/nest-factory.ts", "ts", src);
  const creates = r.symbols.filter((s) => s.qname === "NestFactoryStatic.create");
  assert.equal(creates.length, 1, "one implementation, zero signatures");
  assert.deepStrictEqual(creates[0].lines, [4, 6]);
  assert.equal(r.symbols.filter((s) => s.qname === "make").length, 1);
});

test("effects — SQL, db, HTTP, env and fs are found and anchored", () => {
  const src = [
    "const fs = require('fs');",
    "class OrderRepo {",
    "  insert(o) {",
    "    return db.query(\"INSERT INTO orders (total) VALUES ($1)\", [o.total]);",
    "  }",
    "  async sync() {",
    "    const url = process.env.BILLING_URL;",
    "    await fetch('https://billing.example/api', { method: 'POST' });",
    "    fs.writeFileSync('out.json', '{}');",
    "  }",
    "}",
  ].join("\n");
  const r = one("src/orders/repo.js", "js", src);
  const ins = sym(r, "OrderRepo.insert").effects;
  assert.ok(ins.some((e) => e.type === "sql" && /^INSERT INTO orders/.test(e.text) && e.line === 4));
  assert.ok(ins.some((e) => e.type === "db" && e.text === "db.query"));
  const sy = sym(r, "OrderRepo.sync").effects;
  assert.ok(sy.some((e) => e.type === "env" && e.text === "BILLING_URL"));
  assert.ok(sy.some((e) => e.type === "http" && /billing\.example/.test(e.text)));
  assert.ok(sy.some((e) => e.type === "fs" && e.text === "fs.writeFileSync"));
});

test("body_hash — moves with the symbol's own text, never with a neighbour's", () => {
  const a = ["function a() {", "  return 1;", "}", "function b() {", "  return 2;", "}"].join("\n");
  const b = ["function a() {", "  return 1;", "}", "function b() {", "  return 3;", "}"].join("\n");
  const c = ["function a() {", "  return   1;   ", "}", "function b() {", "  return 2;", "}"].join("\n");
  const ra = one("x.js", "js", a);
  const rb = one("x.js", "js", b);
  const rc = one("x.js", "js", c);
  assert.equal(sym(ra, "a").body_hash, sym(rb, "a").body_hash, "editing b keeps a's hash");
  assert.notEqual(sym(ra, "b").body_hash, sym(rb, "b").body_hash, "editing b moves b's hash");
  assert.equal(sym(ra, "a").body_hash, sym(rc, "a").body_hash, "whitespace alone does not move it");
});

test("go — receiver methods are qualified; capitals are exported; import blocks bind aliases", () => {
  const src = [
    "package orders",
    "import (",
    "  \"fmt\"",
    "  store \"example.com/app/internal/store\"",
    ")",
    "type Service struct { db *store.DB }",
    "func (s *Service) Create(o Order) error {",
    "  fmt.Println(\"creating\")",
    "  return s.db.Insert(o)",
    "}",
    "func helper() {}",
  ].join("\n");
  const r = one("internal/orders/service.go", "go", src);
  assert.ok(sym(r, "Service"));
  const create = sym(r, "Service.Create");
  assert.ok(create);
  assert.equal(create.exported, true);
  assert.equal(sym(r, "helper").exported, false);
  assert.ok(callNames(create).includes("s.db.Insert"));
  const b = r.imports.flatMap((i) => i.bindings);
  assert.ok(b.some((x) => x.local === "store" && x.kind === "namespace"));
  assert.ok(b.some((x) => x.local === "fmt"));
});

test("java and c# — classes, methods, constructors; a statement is not a method", () => {
  const java = [
    "import com.shop.repo.OrderRepo;",
    "public class OrderService {",
    "  private final OrderRepo repo;",
    "  public OrderService(OrderRepo repo) { this.repo = repo; }",
    "  public Order create(Order o) {",
    "    return repo.save(o);",
    "  }",
    "}",
  ].join("\n");
  const rj = one("src/main/java/com/shop/OrderService.java", "java", java);
  assert.ok(sym(rj, "OrderService.create"));
  assert.ok(sym(rj, "OrderService.OrderService"), "a constructor is a member");
  assert.ok(!rj.symbols.some((s) => s.name === "save"), "`return repo.save(o)` is a call, not a declaration");
  assert.deepStrictEqual(rj.imports[0].bindings, [{ local: "OrderRepo", orig: "OrderRepo", kind: "named" }]);

  const cs = [
    "using Shop.Data;",
    "public class Orders {",
    "  public int Count() => _db.Orders.Count();",
    "  private void Save(Order o) { _db.SaveChanges(); }",
    "}",
  ].join("\n");
  const rc = one("Orders.cs", "cs", cs);
  assert.ok(sym(rc, "Orders.Count"), "an expression-bodied member counts");
  assert.equal(sym(rc, "Orders.Save").exported, false);
});

test("php — class methods, functions, use statements, and $this calls", () => {
  const src = [
    "<?php",
    "use App\\Repo\\OrderRepo;",
    "class OrderController {",
    "  public function store($req) {",
    "    return $this->service->create($req);",
    "  }",
    "}",
    "function helper() { return 1; }",
  ].join("\n");
  const r = one("app/Http/OrderController.php", "php", src);
  const store = sym(r, "OrderController.store");
  assert.ok(store);
  assert.deepStrictEqual(callNames(store), ["service.create"]);
  assert.equal(store.calls[0].self, true);
  assert.ok(sym(r, "helper"));
  assert.equal(r.imports[0].bindings[0].local, "OrderRepo");
});

const PY = [
  "from .repo import OrderRepo",
  "import os.path as osp",
  "",
  "class OrderService:",
  "    def __init__(self, repo):",
  "        self.repo = repo",
  "",
  "    def create(",
  "        self, order",
  "    ):",
  "        # fake() in a comment",
  "        self.repo.insert(order)",
  "        return osp.join('a', 'b')",
  "",
  "def _private():",
  "    pass",
].join("\n");

function pyShape(rec) {
  return {
    qnames: rec.symbols.filter((s) => s.kind !== "module").map((s) => `${s.qname}:${s.lines.join("-")}`).sort(),
    createCalls: callNames(sym(rec, "OrderService.create")).sort(),
    bindings: rec.imports.flatMap((i) => i.bindings.map((b) => `${b.local}<-${b.orig}`)).sort(),
  };
}

test("python heuristic — indentation bodies, a multi-line signature, class qualifiers", () => {
  const r = one("app/orders/service.py", "py", PY);
  const s = pyShape(r);
  assert.ok(s.qnames.includes("OrderService.create:8-13"), s.qnames.join(" "));
  assert.deepStrictEqual(s.createCalls, ["osp.join", "repo.insert"]);
  assert.equal(sym(r, "_private").exported, false);
  assert.deepStrictEqual(s.bindings, ["OrderRepo<-OrderRepo", "osp<-os.path"]);
  assert.equal(r.extractor, X.HEURISTIC);
});

test("python borrowed ast — same shape as the heuristic, marked with its extractor", { skip: !X._findPython() && "no Python ≥3.8 on this machine" }, () => {
  const dir = tmpdir();
  const abs = path.join(dir, "service.py");
  fs.writeFileSync(abs, PY);
  const out = X.extractBatch([{ rel: "app/orders/service.py", abs, lang: "py", src: PY }]);
  const r = out.get("app/orders/service.py");
  assert.match(r.extractor, /^python-ast@3\./);
  assert.deepStrictEqual(pyShape(r), pyShape(one("app/orders/service.py", "py", PY)));
});

test("js — a route handler is a symbol; a function passed by name is a ref; a local variable is not", () => {
  const src = [
    "const { Router } = require('express');",
    "const { requireAuth } = require('../auth');",
    "const router = Router();",
    "function load(id) { return id; }",
    "router.get('/', (req, res) => { res.json(load(1)); });",
    "router.post('/', requireAuth, async (req, res) => {",
    "  const order = load(2);",
    "  res.json(order);",
    "});",
    "cache.get('/k');",
    "module.exports = router;",
  ].join("\n");
  const r = one("src/routes/orders.js", "js", src);
  const get = sym(r, "GET /");
  assert.ok(get, "an anonymous route handler is named <METHOD> <path>");
  assert.equal(get.kind, "route");
  assert.deepStrictEqual(get.lines, [5, 5]);
  const post = sym(r, "POST /");
  assert.deepStrictEqual(post.lines, [6, 9]);
  assert.ok(post.calls.some((c) => c.name === "requireAuth" && c.ref), "middleware passed by name is a ref");
  assert.ok(post.calls.some((c) => c.name === "load" && !c.ref), "a call inside the handler belongs to the route");
  assert.ok(!post.calls.some((c) => c.name === "order"), "a local variable passed along is not a ref");
  assert.ok(!post.calls.some((c) => c.name === "async"), "`async (req, res) =>` is not a call");
  assert.ok(!r.symbols.some((s) => s.qname === "GET /k"), "a get with no handler is not a route");
  assert.equal(X.HEURISTIC, "heuristic@6", "W5b (v1.9.1): Options API members, constants, the <script setup> component");
});

test("a file the extractor cannot handle is an empty record, never a thrown update", () => {
  const out = X.extractBatch([{ rel: "weird.js", abs: "", lang: "js", src: null }]);
  const r = out.get("weird.js");
  assert.equal(r.error, "extract-failed");
  assert.deepStrictEqual(r.symbols, []);
});
