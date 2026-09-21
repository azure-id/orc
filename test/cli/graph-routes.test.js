"use strict";
// @test-pool spawn  — shells node bin/cli.js; the Python rung may shell python
// v1.8.2 W1 — ROUTE edges: a URL literal reaches a route symbol.
//
// The promises this file holds (R3-C, the false sentence):
//
//   1. A test that reaches a symbol through `request(app).get("/orders/search")`
//      is a CALLER of that route — state ROUTE — and the route's `tests` line
//      names the test file. `impact` on the store walks store → route → test.
//   2. A mount is followed across files: `app.use("/orders", ordersRouter)`,
//      `app.use("/api", require("./routes"))` + `router.use(...)`, FastAPI
//      `include_router(prefix=)`, and the full path is what a URL matches.
//   3. A decorated handler (`@Get(":id")`, `@router.get("/p")`) keeps its own
//      symbol and gains a ROUTE alias named with the class or router prefix.
//   4. Two routes that match one URL are AMBIGUOUS, never a guess; a URL whose
//      prefix is unknown (`BASE + "/p"`) matches by its tail only.
//   5. A bare `get("/p")` never resolves to a class METHOD named `get` — the
//      invented caller the 1.8.1 UNIQUE rung produced on every supertest call.
//   6. The resolution cache stores ROUTE rows (ref flag 2 + the URL) and a
//      cached answer is byte-identical to a computed one.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");
const X = require("../../bin/graph-extract.js");
const G = require("../../bin/graph.js");
const R = require("../../bin/graph-resolve.js");
const Q = require("../../bin/graph-query.js");

const json = (r) => JSON.parse(r.stdout);
const one = (rel, lang, src) => X.extractOne({ rel, lang, src }, null);
const sym = (rec, qname) => rec.symbols.find((s) => s.qname === qname);

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

// The R3-C shape: a store, a router mounted under /orders, supertest calls.
const EXPRESS = {
  "src/app.js": [
    "const express = require('express');",
    "const ordersRouter = require('./routes/orders');",
    "const app = express();",
    "app.use('/orders', ordersRouter);",
    "app.use('/admin', require('./routes/admin'));",
    "module.exports = app;",
  ].join("\n"),
  "src/stores/orderStore.js": [
    "class OrderStore {",
    "  list() { return []; }",
    "  get(id) { return id; }",
    "}",
    "function searchByItemPrefix(orders, prefix) {",
    "  return orders.filter((o) => o.item.startsWith(prefix));",
    "}",
    "module.exports = { OrderStore, searchByItemPrefix };",
  ].join("\n"),
  "src/routes/orders.js": [
    "const { Router } = require('express');",
    "const { OrderStore, searchByItemPrefix } = require('../stores/orderStore');",
    "const router = Router();",
    "const store = new OrderStore();",
    "router.get('/search', (req, res) => res.json(searchByItemPrefix(store.list(), req.query.q)));",
    "router.get('/:id', (req, res) => res.json(store.get(req.params.id)));",
    "router.post('/', (req, res) => res.status(201).json(req.body));",
    "module.exports = router;",
  ].join("\n"),
  "src/routes/admin.js": [
    "const { Router } = require('express');",
    "const router = Router();",
    "router.get('/search', (req, res) => res.json([]));",
    "module.exports = router;",
  ].join("\n"),
  "tests/orders.test.js": [
    "const request = require('supertest');",
    "const app = require('../src/app');",
    "it('searches', async () => {",
    "  const res = await request(app).get('/orders/search?q=mu');",
    "  expect(res.status).toBe(200);",
    "});",
    "it('404s', async () => {",
    "  await request(app).get('/orders/9999');",
    "});",
    "it('creates', async () => {",
    "  await request(app).post('/orders').send({ item: 'mug' });",
    "});",
    "it('admin', async () => {",
    "  await request(app).get('/admin/search');",
    "  await fetch(`${BASE}/search`);",
    "});",
  ].join("\n"),
};

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);

test("routes — a supertest URL is a ROUTE caller of the route it reaches, and the route's tests line names the test file (R3-C)", () => {
  const { root } = repo(EXPRESS);
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  const u = graph(root, "update", "--json");
  assert.equal(u.status, 0, u.stdout + u.stderr);

  // Two files define a `GET /search`, so the bare name is ambiguous (exit 4,
  // both listed) — and the FULL path a test would send is not.
  const bare = graph(root, "ctx", "GET /search", "--json");
  assert.equal(bare.status, 4);
  assert.deepStrictEqual(json(bare).candidates.map((c) => c.file).sort(), ["src/routes/admin.js", "src/routes/orders.js"]);
  for (const q of ["src/routes/orders.js#GET /search", "GET /orders/search"]) {
    const r = graph(root, "ctx", q, "--json");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const j = json(r);
    assert.equal(j.target.qname, "GET /search");
    assert.equal(j.target.file, "src/routes/orders.js");
    const reached = j.callers.filter((c) => c.state === "ROUTE");
    assert.deepStrictEqual(reached.map((c) => `${c.file}:${c.line} ${c.url}`), ["tests/orders.test.js:4 GET /orders/search?q=mu"]);
    assert.deepStrictEqual(j.tests, ["tests/orders.test.js"]);
    assert.match(j.card, /← reached via {2}GET \/orders\/search\?q=mu {2}tests\/orders\.test\.js:4 {2}ROUTE/);
  }
  // The admin router has a `/search` too — the mount decides, so `/orders/search`
  // is ONE route, not two.
  const admin = json(graph(root, "ctx", "GET /admin/search", "--json"));
  assert.equal(admin.target.file, "src/routes/admin.js");
  assert.equal(admin.callers.filter((c) => c.state === "ROUTE").length, 1);
  // A pattern segment: `/orders/9999` is `GET /:id`; a POST is the POST route.
  assert.equal(json(graph(root, "ctx", "GET /orders/9999", "--json")).target.qname, "GET /:id");
  const post = json(graph(root, "ctx", "POST /", "--json"));
  assert.deepStrictEqual(post.callers.map((c) => `${c.line} ${c.url}`), ["11 POST /orders"]);
  // The tail-only URL (`${BASE}/search`) matches BOTH search routes → a maybe on each, never an edge.
  assert.equal(json(graph(root, "ctx", "GET /admin/search", "--json")).maybe_callers, 1);
  assert.equal(json(graph(root, "ctx", "GET /orders/search", "--json")).maybe_callers, 1);

  // `impact` on the store walks store → route → test, and names the test file.
  const imp = json(graph(root, "impact", "src/stores/orderStore.js", "--json"));
  const d2 = imp.callers.filter((c) => c.depth === 2 && c.state === "ROUTE");
  assert.ok(d2.some((c) => c.file === "tests/orders.test.js" && c.url === "GET /orders/search?q=mu"), JSON.stringify(imp.callers));
  assert.ok(imp.tests.includes("tests/orders.test.js"));

  // Promise 5: a bare `get("/p")` is never the method `OrderStore.get`.
  const get = json(graph(root, "ctx", "OrderStore.get", "--json"));
  assert.deepStrictEqual(get.callers.filter((c) => c.file.startsWith("tests/")), []);
});

test("routes — `changes` counts a ROUTE caller in fan-in and in tests", () => {
  const { root } = repo(EXPRESS);
  cli(["config", "set", "code_graph", "on", "--dir", root]);
  assert.equal(graph(root, "update", "--json").status, 0);
  write(root, "src/routes/orders.js", fs.readFileSync(path.join(root, "src/routes/orders.js"), "utf8").replace("res.status(201)", "res.status(202)"));
  const ch = json(graph(root, "changes", "--json"));
  const row = ch.symbols.find((s) => s.qname === "POST /");
  assert.ok(row, JSON.stringify(ch.symbols));
  assert.equal(row.fan_in, 1);
  assert.deepStrictEqual(row.tests, ["tests/orders.test.js"]);
});

test("routes — the cache stores ROUTE rows (flag 2 + the URL) and answers byte-identically", () => {
  const c = repo(EXPRESS);
  G.graphUpdate(c.claudeDir, c.root, { enabled: true });
  const cache = JSON.parse(fs.readFileSync(R.resolvedPath(c.claudeDir), "utf8"));
  assert.equal(cache.schema, 3);
  const rows = cache.callers["src/routes/orders.js#GET /search"];
  assert.ok(rows.some((r) => r[0] === "tests/orders.test.js#<module>" && r[2] === "ROUTE" && r[3] === 2 && r[4] === "GET /orders/search?q=mu"), JSON.stringify(rows));
  const hot = Q.loadModel(c.claudeDir, c.root);
  const cold = Q.loadModel(c.claudeDir, c.root, { noCache: true });
  assert.ok(hot.callersCache);
  for (const q of ["GET /search", "GET /:id", "src/routes/orders.js", "src/stores/orderStore.js"]) {
    assert.deepStrictEqual(Q.ctx(hot, q, { budget: 4000 }), Q.ctx(cold, q, { budget: 4000 }), q);
  }
  assert.deepStrictEqual(Q.impact(hot, ["src/stores/orderStore.js"], { budget: 4000 }), Q.impact(cold, ["src/stores/orderStore.js"], { budget: 4000 }));
});

test("routes — a mount chain across two files gives the full path (app.use + router.use)", () => {
  const c = repo({
    "src/app.js": ["const app = require('express')();", "app.use('/api', require('./routes'));", "module.exports = app;"].join("\n"),
    "src/routes/index.js": ["const { Router } = require('express');", "const orders = require('./orders');", "const router = Router();", "router.use('/orders', orders);", "module.exports = router;"].join("\n"),
    "src/routes/orders.js": ["const { Router } = require('express');", "const router = Router();", "router.get('/:id', (req, res) => res.json({}));", "module.exports = router;"].join("\n"),
    "tests/a.test.js": ["const request = require('supertest');", "const app = require('../src/app');", "request(app).get('/api/orders/7');", "request(app).post('/api/orders/7');"].join("\n"),
  });
  G.graphUpdate(c.claudeDir, c.root, { enabled: true });
  const m = Q.loadModel(c.claudeDir, c.root, { noCache: true });
  const row = Q.routeTable(m).find((r) => r.sym.name === "GET /:id");
  assert.equal(row.full, "/api/orders/:id");
  assert.equal(row.mounted, "known");
  const t = Q.findTarget(m, "GET /api/orders/7");
  assert.equal(t.kind, "symbol");
  const callers = Q.callersOf(m, t.sym).confident;
  // The GET reaches it; the POST does not (method mismatch is no edge).
  assert.deepStrictEqual(callers.map((x) => `${x.line} ${x.state} ${x.url}`), ["3 ROUTE GET /api/orders/7"]);
  assert.equal(Q.resolveUrl(m, { method: "POST", url: "/api/orders/7" }).state, "UNRESOLVED");
});

test("routes — decorators: a Nest controller keeps its methods and gains prefixed ROUTE aliases that call them", () => {
  const r = one(
    "src/orders.controller.ts",
    "ts",
    [
      "import { Controller, Get, Post, Param } from '@nestjs/common';",
      "@Controller('orders')",
      "export class OrdersController {",
      "  @Get()",
      "  list() { return []; }",
      "  @Get(':id')",
      "  find(@Param('id') id: string) { return id; }",
      "  @Post()",
      "  create() { return 1; }",
      "  @Get('/:id/lines')",
      "  lines() { return []; }",
      "}",
    ].join("\n")
  );
  assert.equal(sym(r, "OrdersController.list").route, "GET /orders");
  assert.equal(sym(r, "OrdersController.find").route, "GET /orders/:id");
  assert.equal(sym(r, "OrdersController.create").route, "POST /orders");
  assert.equal(sym(r, "OrdersController.lines").route, "GET /orders/:id/lines");
  const alias = sym(r, "GET /orders/:id");
  assert.equal(alias.kind, "route");
  assert.equal(alias.handler, "src/orders.controller.ts#OrdersController.find");
  assert.deepStrictEqual(alias.lines, sym(r, "OrdersController.find").lines);
  assert.deepStrictEqual(alias.calls.map((x) => x.name), ["OrdersController.find"]);
  assert.equal(alias.body_hash, sym(r, "OrdersController.find").body_hash);
  assert.ok(!r.symbols.some((s) => s.urls), "a decorator is a route, never a URL the file sends");
});

test("routes — decorators: FastAPI, Flask and Django shapes on the heuristic rung; Spring and Go registrations", () => {
  const py = X.extractBatch([
    {
      rel: "app/routers/orders.py",
      abs: "",
      lang: "py",
      src: [
        "from fastapi import APIRouter",
        "router = APIRouter(prefix='/orders')",
        "@router.get('/')",
        "def list_orders():",
        "    return []",
        "@router.route('/{order_id}', methods=['GET', 'DELETE'])",
        "def one(order_id: int):",
        "    return order_id",
      ].join("\n"),
    },
    {
      rel: "app/main.py",
      abs: "",
      lang: "py",
      src: ["from fastapi import FastAPI", "from app.routers import orders", "app = FastAPI()", "app.include_router(orders.router, prefix='/api')", "@app.get('/health')", "def health():", "    return {'ok': True}"].join("\n"),
    },
    {
      rel: "blog/urls.py",
      abs: "",
      lang: "py",
      src: ["from django.urls import path, include", "from . import views", "urlpatterns = [", "    path('posts/<int:pk>/', views.detail),", "    path('api/', include('blog.api.urls')),", "]"].join("\n"),
    },
    {
      rel: "tests/test_api.py",
      abs: "",
      lang: "py",
      src: ["def test_it(client):", "    client.get('/api/orders/')", "    client.post(BASE + '/orders/')", "    client.get(f'{base}/health')", "    requests.get('https://example.com/orders/')"].join("\n"),
    },
  ]);
  const orders = py.get("app/routers/orders.py");
  assert.equal(sym(orders, "list_orders").route, "GET /orders/");
  assert.ok(sym(orders, "GET /orders/"), "the router prefix is folded into the alias name");
  assert.ok(sym(orders, "GET /orders/{order_id}") && sym(orders, "DELETE /orders/{order_id}"), "methods=[…] gives one alias per method");
  const main = py.get("app/main.py");
  assert.deepStrictEqual(sym(main, "<module>").mounts.map((m) => `${m.prefix} ${m.target}`), ["/api orders.router"]);
  assert.ok(sym(main, "GET /health"));
  const urls = py.get("blog/urls.py");
  const dj = sym(urls, "ANY /posts/<int:pk>/");
  assert.ok(dj, JSON.stringify(urls.symbols.map((s) => s.qname)));
  assert.ok(dj.calls.some((x) => x.name === "views.detail" && x.ref), "the Django handler is a ref of the route");
  assert.deepStrictEqual(sym(urls, "<module>").mounts.map((m) => `${m.prefix} ${m.target} ${m.module}`), ["/api/ blog.api.urls true"]);
  const t = sym(py.get("tests/test_api.py"), "test_it");
  assert.deepStrictEqual(
    t.urls.map((u) => `${u.method} ${u.url}${u.suffix ? " ~" : ""}`),
    ["GET /api/orders/", "POST /orders/ ~", "GET /health ~"],
    "a concatenation and an f-string are suffixes; another host is not a route here"
  );

  const java = one(
    "src/OrdersController.java",
    "java",
    ["@RestController", "@RequestMapping(\"/orders\")", "public class OrdersController {", "  @GetMapping(\"/{id}\")", "  public Order find(@PathVariable long id) { return null; }", "  @RequestMapping(value = \"/bulk\", method = RequestMethod.POST)", "  public void bulk() { }", "}"].join("\n")
  );
  assert.equal(sym(java, "OrdersController.find").route, "GET /orders/{id}");
  assert.ok(sym(java, "POST /orders/bulk"));

  const go = one("routes.go", "go", ["package main", "import \"net/http\"", "func RegisterRoutes(mux *http.ServeMux) {", "\tmux.HandleFunc(\"GET /orders\", listOrders)", "\tmux.HandleFunc(\"/health\", health)", "\tr.POST(\"/orders\", createOrder)", "}"].join("\n"));
  for (const [name, ref] of [["GET /orders", "listOrders"], ["ANY /health", "health"], ["POST /orders", "createOrder"]]) {
    const s = sym(go, name);
    assert.ok(s, name);
    assert.ok(s.calls.some((x) => x.name === ref && x.ref), `${name} refs ${ref}`);
  }
  const goTest = one("a_test.go", "go", ["package main", "func TestIt(t *testing.T) {", "\treq := httptest.NewRequest(http.MethodPost, \"/orders\", nil)", "\treq2, _ := http.NewRequest(\"GET\", \"http://localhost:8080/health\", nil)", "\t_ = req; _ = req2", "}"].join("\n"));
  assert.deepStrictEqual(sym(goTest, "TestIt").urls.map((u) => `${u.method} ${u.url}`), ["POST /orders", "GET /health"]);
});

test("routes — URL shapes: fetch with a method, a cache get, a registration, and an Express mount by require", () => {
  const r = one(
    "src/client.js",
    "js",
    [
      "const cache = new Map();",
      "const { pingHandler } = require('./handlers');",
      "export async function load() {",
      "  await fetch('/api/orders', { method: 'POST', body: '{}' });",
      "  await axios.get('/api/orders/1');",
      "  cache.get('/api/orders');",
      "  return fetch(`${BASE}/api/orders`);",
      "}",
      "app.use('/api', require('./routes/api'));",
      "app.get('/ping', pingHandler);",
      "app.get('/pong', (req, res) => res.send('pong'));",
    ].join("\n")
  );
  const load = sym(r, "load");
  assert.deepStrictEqual(
    load.urls.map((u) => `${u.method} ${u.url}${u.suffix ? " ~" : ""}`),
    ["POST /api/orders", "GET /api/orders/1", "ANY /api/orders ~"],
    "fetch reads its method from the options; a cache get is not a URL; a template is a suffix"
  );
  const mod = sym(r, "<module>");
  assert.deepStrictEqual(mod.mounts.map((m) => `${m.prefix} ${m.target}`), ["/api ./routes/api"]);
  assert.ok(!mod.urls, "a registration is never a URL the module sends");
  const ping = sym(r, "GET /ping");
  assert.ok(ping && ping.calls.some((x) => x.name === "pingHandler" && x.ref), "a handler passed by name is a route with a ref");
  assert.ok(sym(r, "GET /pong"));
});

test("routes — go: a bare name defined in a sibling file of the package is LOCAL, so a handler passed by name is an edge", () => {
  const c = repo({
    "go.mod": "module fixture\n\ngo 1.22\n",
    "routes.go": ["package main", "import \"net/http\"", "func RegisterRoutes(mux *http.ServeMux) {", "\tmux.HandleFunc(\"/health\", health)", "}"].join("\n"),
    "handlers.go": ["package main", "import \"net/http\"", "func health(w http.ResponseWriter, r *http.Request) {", "\tw.Write([]byte(\"ok\"))", "}"].join("\n"),
    "handlers_test.go": ["package main", "import (\"net/http/httptest\"; \"testing\")", "func TestHealth(t *testing.T) {", "\thealth(httptest.NewRecorder(), httptest.NewRequest(\"GET\", \"/health\", nil))", "}"].join("\n"),
  });
  G.graphUpdate(c.claudeDir, c.root, { enabled: true });
  const m = Q.loadModel(c.claudeDir, c.root, { noCache: true });
  const health = Q.findTarget(m, "handlers.go#health").sym;
  const callers = Q.callersOf(m, health).confident.map((x) => `${x.sym.file}:${x.line} ${x.state}${x.ref ? " ref" : ""}`);
  assert.deepStrictEqual(callers, ["handlers_test.go:4 LOCAL", "routes.go:4 LOCAL ref"]);
  const route = Q.findTarget(m, "ANY /health").sym;
  assert.deepStrictEqual(Q.callersOf(m, route).confident.map((x) => `${x.sym.qname} ${x.url}`), ["TestHealth GET /health"]);
});
