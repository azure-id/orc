"use strict";
// @test-pool pure
// v2.2.0 T3 — the EXTRACT side of the Vue / SPA edges: the template owner and
// its calls, the component contract, `$` built-ins, lazy imports, SPA route
// records, route navigation by name, and the string values of a constant.
const { test } = require("node:test");
const assert = require("node:assert");
const X = require("../../bin/graph-extract.js");

const one = (rel, lines, lang) => X.extractOne({ rel, lang: lang || (rel.endsWith(".vue") ? "vue" : "js"), src: lines.join("\n") + "\n" }, null);
const byQ = (r) => Object.fromEntries(r.symbols.map((s) => [s.qname, s]));
const allCalls = (r) => r.symbols.flatMap((s) => s.calls.map((c) => ({ ...c, owner: s.qname })));

test("1 — the template symbol owns its handlers, bindings and child components", () => {
  const r = one("src/views/Transfer.vue", [
    "<template>", // 1
    "  <div>", // 2
    "    <template v-if=\"ready\">", // 3
    "      <Banner @cta-click=\"onTransferFund\" />", // 4
    "    </template>", // 5
    "    <button @click=\"save(1)\" :disabled=\"!canGo\">{{ total }}</button>", // 6
    "    <li v-for=\"row in rows\">{{ row.amount }}</li>", // 7
    "    <SelectField @select=\"pick\" />", // 8
    "    <select-field />", // 9
    "    <router-view />", // 10
    "  </div>", // 11
    "</template>", // 12
    "<script>", // 13
    "import SelectField from './SelectField.vue';", // 14
    "export default {", // 15
    "  name: 'Transfer',", // 16
    "  computed: {", // 17
    "    canGo() { return true; },", // 18
    "    total() { return 1; },", // 19
    "    rows() { return []; },", // 20
    "    ready() { return true; },", // 21
    "  },", // 22
    "  methods: {", // 23
    "    onTransferFund() {},", // 24
    "    save(n) {},", // 25
    "    pick() {},", // 26
    "  },", // 27
    "};", // 28
    "</script>",
  ]);
  const t = byQ(r)["Transfer.template"];
  assert.ok(t, "a template symbol");
  assert.strictEqual(t.kind, "template");
  assert.strictEqual(t.name, "template");
  assert.strictEqual(t.exported, false);
  assert.deepStrictEqual(t.lines, [1, 12]);
  const has = (name, f) => t.calls.some((c) => c.name === name && f(c));
  for (const n of ["onTransferFund", "save", "pick"]) assert.ok(has(n, (c) => c.self && !c.ref), `self call ${n}`);
  for (const n of ["canGo", "total", "rows"]) assert.ok(has(n, (c) => c.self && c.ref), `self ref ${n}`);
  assert.ok(has("SelectField", (c) => c.ref && !c.self), "component ref");
  assert.strictEqual(t.calls.find((c) => c.name === "SelectField").line, 8);
  assert.ok(t.calls.some((c) => c.name === "SelectField" && c.line === 9), "kebab tag");
  assert.ok(!t.calls.some((c) => /router|RouterView|row$/.test(c.name) && c.name !== "rows"), "no router-view, no row");
  assert.strictEqual(t.calls.find((c) => c.name === "onTransferFund").line, 4);
});

test("2 — props (array and object), emits, inject are contract symbols that own no calls", () => {
  const r = one("src/components/Card.vue", [
    "<template><div /></template>", // 1
    "<script>", // 2
    "export default {", // 3
    "  name: 'Card',", // 4
    "  props: {", // 5
    "    title: { type: String, default: () => fmt('x') },", // 6
    "    size: String,", // 7
    "  },", // 8
    "  emits: ['close', 'save'],", // 9
    "  inject: ['bus'],", // 10
    "  methods: { go() {} },", // 11
    "};", // 12
    "</script>",
  ]);
  const q = byQ(r);
  assert.strictEqual(q["Card.title"].kind, "prop");
  assert.deepStrictEqual(q["Card.title"].lines, [6, 6]);
  assert.strictEqual(q["Card.size"].kind, "prop");
  assert.deepStrictEqual(q["Card.size"].lines, [7, 7]);
  assert.strictEqual(q["Card.close"].kind, "emit");
  assert.strictEqual(q["Card.save"].kind, "emit");
  assert.deepStrictEqual(q["Card.save"].lines, [9, 9]);
  assert.strictEqual(q["Card.bus"].kind, "inject");
  for (const k of ["Card.title", "Card.size", "Card.close", "Card.bus"]) {
    assert.strictEqual(q[k].exported, false);
    assert.deepStrictEqual(q[k].calls, []);
  }
});

test("3 — `$` built-ins make no call record", () => {
  const r = one("src/components/Hi.vue", [
    "<template><p /></template>",
    "<script>",
    "export default {",
    "  methods: {",
    "    go() { this.$t('x'); this.$router.push('/a'); this.$emit('x'); this.$nextTick(() => {}); this.real(); },",
    "    real() {},",
    "  },",
    "};",
    "</script>",
  ]);
  const names = allCalls(r).map((c) => c.name);
  for (const n of ["t", "router.push", "emit", "nextTick", "$t", "$emit"]) assert.ok(!names.includes(n), `no ${n}`);
  assert.ok(names.includes("real"));
  assert.strictEqual(X.normCall("this.$store.dispatch"), null);
});

test("4 — router file: lazy imports and VIEW route records", () => {
  const r = one("src/router/index.js", [
    "import Vue from 'vue';", // 1
    "const Home = () => import('@/views/Home.vue');", // 2
    "const Outwards = async () => import(/* chunk */ '@/views/Outwards.vue')", // 3
    "const Lazy = () => import('@/views/Lazy.vue');", // 4
    "export const routes = [", // 5
    "  {", // 6
    "    path: '/home',", // 7
    "    name: 'Home',", // 8
    "    component: Home,", // 9
    "    children: [", // 10
    "      { path: 'outwards', name: 'Outwards', component: Lazy },", // 11
    "    ],", // 12
    "  },", // 13
    "];", // 14
    "function load() { return import('./extra.js'); }", // 15
  ]);
  const imp = (from) => r.imports.find((i) => i.from === from);
  assert.deepStrictEqual(imp("@/views/Home.vue").bindings, [{ local: "Home", orig: "default", kind: "default" }]);
  assert.strictEqual(imp("@/views/Home.vue").line, 2);
  assert.deepStrictEqual(imp("@/views/Lazy.vue").bindings, [{ local: "Lazy", orig: "default", kind: "default" }]);
  assert.deepStrictEqual(imp("./extra.js").bindings, []);
  assert.ok(!r.symbols.some((s) => s.name === "Home" || s.name === "Lazy"), "no function symbol for a lazy import");
  const q = byQ(r);
  const home = q["VIEW /home"];
  assert.ok(home, "VIEW /home");
  assert.strictEqual(home.kind, "route");
  assert.strictEqual(home.route_name, "Home");
  assert.deepStrictEqual(home.calls, [{ name: "Home", line: 9, ref: true }]);
  const out = q["VIEW /outwards"];
  assert.ok(out, "VIEW /outwards");
  assert.strictEqual(out.route_name, "Outwards");
  assert.deepStrictEqual(out.lines, [11, 11]);
  assert.deepStrictEqual(out.calls, [{ name: "Lazy", line: 11, ref: true }]);
});

test("5 — navigation by route name: literal, const, IDENT.MEMBER, router-link", () => {
  const r = one("src/views/Nav.vue", [
    "<template>", // 1
    "  <router-link :to=\"{ name: 'Linked' }\">x</router-link>", // 2
    "</template>", // 3
    "<script>", // 4
    "import ROUTES from '@/router/names';", // 5
    "const DETAIL = 'Detail';", // 6
    "export default {", // 7
    "  methods: {", // 8
    "    a() { this.$router.push({ name: 'Lit' }); },", // 9
    "    b() { this.$router.replace({ name: DETAIL, params: {} }); },", // 10
    "    c() { router.push({ name: ROUTES.CREATE }); },", // 11
    "  },", // 12
    "};", // 13
    "</script>",
  ]);
  const routes = allCalls(r).filter((c) => c.route);
  const find = (n) => routes.find((c) => c.name === n);
  assert.ok(find("Linked"), "router-link");
  assert.strictEqual(find("Linked").line, 2);
  assert.strictEqual(find("Lit").line, 9);
  assert.strictEqual(find("Lit").owner, "Nav.a");
  assert.ok(find("Detail"), "same-file const");
  assert.strictEqual(find("ROUTES.CREATE").via, true);
});

test("6 — an exported constant object keeps its string values", () => {
  const r = one("src/router/names.js", ["export const ROUTES = { A: 'Alpha', B: 'Beta', n: 3 };"]);
  assert.deepStrictEqual(byQ(r).ROUTES.values, { A: "Alpha", B: "Beta" });
});

test("7 — a server route file is unchanged: GET /p, no VIEW", () => {
  const r = one("src/server.js", [
    "const express = require('express');",
    "const router = express.Router();",
    "function h(req, res) { res.json({ path: '/x', ok: 1 }); }",
    "router.get('/p', h);",
  ]);
  const names = r.symbols.map((s) => s.qname);
  assert.ok(names.includes("GET /p"));
  assert.ok(!names.some((n) => n.startsWith("VIEW")));
});

test("8 — a props-only SFC is still a component: class, props, template", () => {
  const r = one("src/components/Stepper.vue", [
    "<template><ol>{{ current }}</ol></template>",
    "<script>",
    "export default { name: 'Stepper', props: ['steps', 'current'] };",
    "</script>",
  ]);
  const q = byQ(r);
  assert.strictEqual(q.Stepper.kind, "class");
  assert.strictEqual(q["Stepper.steps"].kind, "prop");
  assert.strictEqual(q["Stepper.current"].kind, "prop");
  assert.strictEqual(q["Stepper.template"].kind, "template");
});
