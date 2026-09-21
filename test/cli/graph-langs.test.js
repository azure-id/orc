"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.2 W5 (G6) — the five new language rungs.
//
// The promises this file holds:
//
//   1. Ruby is read by KEYWORD DEPTH, not by braces: a `def` body runs to the
//      `end` that pops it, and a MODIFIER (`save if valid?`) never opens a
//      block. A Ruby call needs no parentheses, and `@store.list` is one.
//   2. Rust reads `impl Trait for Type` as inheritance: the type gains the
//      trait's DEFAULT methods, so `self.ok(…)` reaches the trait.
//   3. Kotlin reads an EXPRESSION body (`fun n() = x`) as a declaration, and a
//      bare call in a method reaches the open base class.
//   4. A Vue / Svelte single-file component is its `<script>` block AT THE
//      FILE'S OWN LINE NUMBERS — a card that points at the wrong line is worse
//      than no card.
//   5. C/C++ keeps a DECLARATION (`void f();`) out of the symbol table, reads a
//      macro with a block body (`TEST_F(Suite, Case) { … }`) as a definition,
//      and reaches a member with no `this->`.
//   6. A language with no rung has no record, and `coverage` says `excluded`,
//      never silence.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");
const G = require("../../bin/graph.js");
const Q = require("../../bin/graph-query.js");

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
  return { root, claudeDir: path.join(root, ".claude") };
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const json = (r) => JSON.parse(r.stdout);

function built(files) {
  const { root } = repo(files);
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  const u = graph(root, "update", "--json");
  assert.equal(u.status, 0, u.stdout + u.stderr);
  return root;
}

// Every caller of a symbol, as `file:line STATE`, with the alias or the
// inherited flag spelled out — the shape the fixture answer keys check.
function callers(root, query) {
  const model = Q.loadModel(path.join(root, ".claude"), root);
  const t = Q.findTarget(model, query);
  assert.equal(t.kind, "symbol", `${query} → ${t.kind}`);
  return Q.callersOf(model, t.sym)
    .confident.map((c) => `${c.sym.file}:${c.line} ${c.state}${c.alias ? " alias" : ""}${c.inherited ? " inherited" : ""}`)
    .sort();
}

test("langs — Ruby: keyword depth bounds a def, a modifier `if` opens nothing, and a call with no parentheses is still a call", () => {
  const root = built({
    "app/store.rb": [
      "class OrderStore", //                        1
      "  def list", //                              2
      "    @rows.reverse", //                       3
      "  end", //                                   4
      "", //                                        5
      "  def get(id)", //                           6
      "    return nil if id.nil?", //               7
      "    @rows.find { |r| r[:id] == id }", //      8
      "  end", //                                   9
      "end", //                                    10
    ].join("\n"),
    "app/handler.rb": [
      'require_relative "store"', //                 1
      "", //                                        2
      "class Handler", //                           3
      "  def initialize", //                        4
      "    @store = OrderStore.new", //             5
      "  end", //                                   6
      "", //                                        7
      "  def index", //                             8
      "    @store.list", //                         9
      "  end", //                                  10
      "end", //                                    11
    ].join("\n"),
  });

  const model = Q.loadModel(path.join(root, ".claude"), root);
  const store = (model.byFile["app/store.rb"] || {}).symbols || [];
  // The modifier `if` on line 7 must not open a block: `get` ends at its own
  // `end` on line 9, not at the class's on line 10.
  const get = store.find((s) => s.qname === "OrderStore.get");
  assert.deepStrictEqual(get.lines, [6, 9]);
  assert.deepStrictEqual(store.find((s) => s.qname === "OrderStore.list").lines, [2, 4]);
  assert.deepStrictEqual(store.find((s) => s.qname === "OrderStore").lines, [1, 10]);

  // `@store.list` has no parentheses and is still an alias call.
  assert.deepStrictEqual(callers(root, "app/store.rb#OrderStore.list"), ["app/handler.rb:9 IMPORT alias"]);
});

test("langs — Rust: `impl Trait for Type` is inheritance, so a self call reaches the trait's default method", () => {
  const root = built({
    "Cargo.toml": '[package]\nname = "fx"\n',
    "src/responder.rs": ["pub trait Responder {", "    fn ok(&self, body: String) -> String {", '        format!("200 {}", body)', "    }", "", "    fn missing(&self) -> String;", "}"].join("\n"),
    "src/handler.rs": [
      "use crate::responder::Responder;", //                1
      "", //                                               2
      "pub struct Handler {}", //                          3
      "", //                                               4
      "impl Responder for Handler {}", //                  5
      "", //                                               6
      "impl Handler {", //                                 7
      "    pub fn index(&self) -> String {", //             8
      '        self.ok(String::from("[]"))', //             9
      "    }", //                                         10
      "}", //                                             11
    ].join("\n"),
  });

  assert.deepStrictEqual(callers(root, "src/responder.rs#Responder.ok"), ["src/handler.rs:9 IMPORT inherited"]);
  // A trait method with NO body is a signature, never a symbol.
  const model = Q.loadModel(path.join(root, ".claude"), root);
  const names = ((model.byFile["src/responder.rs"] || {}).symbols || []).map((s) => s.qname);
  assert.ok(names.includes("Responder.ok"), names.join(","));
  assert.ok(!names.includes("Responder.missing"), names.join(","));
});

test("langs — Kotlin: an expression body is a declaration, and a bare call in a method reaches the open base class", () => {
  const root = built({
    "src/app/Base.kt": ["package app", "", "open class Base {", "    fun ok(body: String): String = \"200 \" + body", "}"].join("\n"),
    "src/app/Handler.kt": [
      "package app", //                              1
      "", //                                         2
      "import app.Base", //                          3
      "", //                                         4
      "class Handler : Base() {", //                  5
      "    private val store = Store()", //           6
      "", //                                         7
      "    fun index(): String {", //                 8
      "        return ok(store.list())", //           9
      "    }", //                                    10
      "}", //                                        11
    ].join("\n"),
    "src/app/Store.kt": ["package app", "", "class Store {", "    fun list(): List<String> = listOf()", "}"].join("\n"),
  });

  const model = Q.loadModel(path.join(root, ".claude"), root);
  // The expression body IS the declaration; without it `Base.ok` is no symbol.
  assert.deepStrictEqual(((model.byFile["src/app/Base.kt"] || {}).symbols || []).map((s) => s.qname).sort(), ["Base", "Base.ok"]);
  assert.deepStrictEqual(callers(root, "src/app/Base.kt#Base.ok"), ["src/app/Handler.kt:9 IMPORT inherited"]);
  // A class-level `val` is a FIELD, so `store.list()` is an alias call — and
  // a class in the same PACKAGE needs no import, so the edge is LOCAL.
  assert.deepStrictEqual(callers(root, "src/app/Store.kt#Store.list"), ["src/app/Handler.kt:9 LOCAL alias"]);
});

test("langs — a single-file component is its script block, at the FILE's own line numbers", () => {
  const root = built({
    "package.json": '{ "name": "sfc", "private": true }\n',
    "src/store.ts": ["export class Store {", "  list(): string[] {", "    return [];", "  }", "}"].join("\n"),
    "src/List.vue": [
      "<template>", //                                  1
      "  <ul><li>{{ n }}</li></ul>", //                 2
      "</template>", //                                 3
      "", //                                            4
      '<script setup lang="ts">', //                    5
      'import { Store } from "./store";', //            6
      "", //                                            7
      "const store = new Store();", //                  8
      "", //                                            9
      "function rowsOf() {", //                        10
      "  return store.list();", //                     11
      "}", //                                          12
      "", //                                           13
      "const n = rowsOf().length;", //                  14
      "</script>", //                                  15
      "", //                                           16
      "<style scoped>", //                             17
      "ul { padding: 0; }", //                         18
      "</style>", //                                   19
    ].join("\n"),
    "src/Detail.svelte": [
      "<script>", //                                    1
      '  import { Store } from "./store";', //          2
      "", //                                            3
      "  const store = new Store();", //                4
      "", //                                            5
      "  function rowOf() {", //                        6
      "    return store.list();", //                    7
      "  }", //                                         8
      "</script>", //                                   9
      "", //                                           10
      "<p>{rowOf().length}</p>", //                     11
    ].join("\n"),
  });

  const model = Q.loadModel(path.join(root, ".claude"), root);
  // The markup around the script is not code, and it does not shift a line.
  assert.deepStrictEqual(((model.byFile["src/List.vue"] || {}).symbols || []).filter((s) => s.kind === "function").map((s) => `${s.qname} ${s.lines.join("-")}`), ["rowsOf 10-12"]);
  assert.deepStrictEqual(callers(root, "src/store.ts#Store.list"), ["src/Detail.svelte:7 IMPORT alias", "src/List.vue:11 IMPORT alias"]);
});

test("langs — C++: a declaration is not a symbol, a macro with a block body is, and a member needs no `this->`", () => {
  const root = built({
    "src/base.h": ["#pragma once", "#include <string>", "", "class Base {", "public:", "    std::string ok(const std::string& body) {", '        return "200 " + body;', "    }", "};"].join("\n"),
    "src/handler.h": [
      "#pragma once", //                                     1
      '#include "base.h"', //                                2
      "", //                                                 3
      "class Handler : public Base {", //                     4
      "public:", //                                          5
      "    std::string missing();", //                       6
      "", //                                                 7
      "    std::string index() {", //                        8
      '        return ok("[]");', //                          9
      "    }", //                                           10
      "};", //                                              11
    ].join("\n"),
    "tests/handler_test.cpp": [
      '#include "../src/handler.h"', //                       1
      "", //                                                 2
      "TEST_F(HandlerTest, Index) {", //                      3
      "    Handler handler;", //                             4
      "    handler.index();", //                             5
      "}", //                                                6
    ].join("\n"),
  });

  const model = Q.loadModel(path.join(root, ".claude"), root);
  const names = ((model.byFile["src/handler.h"] || {}).symbols || []).map((s) => s.qname).sort();
  // `std::string missing();` is a DECLARATION — recording it would give the
  // header a second, bodyless copy of every function.
  assert.deepStrictEqual(names, ["Handler", "Handler.index"]);
  assert.deepStrictEqual(callers(root, "src/base.h#Base.ok"), ["src/handler.h:9 UNIQUE inherited"]);
  // The gtest macro body is a symbol named after its two arguments, so the
  // call inside it belongs to it and not to the module.
  assert.deepStrictEqual(callers(root, "src/handler.h#Handler.index"), ["tests/handler_test.cpp:5 IMPORT alias"]);
  const t = ((model.byFile["tests/handler_test.cpp"] || {}).symbols || []).map((s) => s.qname);
  assert.ok(t.includes("HandlerTest.Index"), t.join(","));
});

test("langs — a language with no rung is EXCLUDED, never silently absent", () => {
  const root = built({
    "src/a.rb": "class A\n  def go\n    1\n  end\nend\n",
    "src/b.erl": "-module(b).\ngo() -> 1.\n",
    "vendor/c.rb": "class C\n  def go\n    2\n  end\nend\n",
  });

  const cov = json(graph(root, "coverage", "src/a.rb", "src/b.erl", "vendor/c.rb", "--json"));
  const by = Object.fromEntries((cov.rows || []).map((f) => [f.path, f.coverage]));
  assert.equal(by["src/a.rb"], "full", JSON.stringify(cov));
  // Erlang has no rung; `vendor/` is always skipped. Neither is a record, and
  // neither is silence.
  assert.ok(String(by["src/b.erl"] || "").startsWith("excluded"), JSON.stringify(cov));
  assert.ok(String(by["vendor/c.rb"] || "").startsWith("excluded"), JSON.stringify(cov));
  assert.ok(!G.LANG_BY_EXT[".erl"]);
});
