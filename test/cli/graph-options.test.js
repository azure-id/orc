"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.9.1 W5b (DE-15) — name what a front-end codebase searches for.
//
// The promises this file holds:
//
//   1. **E1 — an Options API object is a class with methods.** A component, a
//      mixin and a Vuex module: every function-valued member at depth 1 and in
//      the named sections, qname `<Owner>.<name>` (the section is never part of
//      it), `mixins` / `extends` as `bases`. The owner is exported; a member is not.
//   2. **`this.x()` inside a member is a self call**, so it resolves LOCAL to
//      the component's own member, or through the mixin as inherited.
//   3. **E2 — an exported constant is a `const`** with `calls: []`. A function
//      value is a function, and a `require(…)` value is a re-export, never a constant.
//   4. **E3 — a `<script setup>` component is ONE class** that owns no line:
//      an alias declared in the script stays module scope.
//   5. **A member's own `(` is a declaration, never a call.**
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { REPO, cli, tmpdir } = require("../_helpers");
const X = require("../../bin/graph-extract.js");

const one = (rel, lines, lang) => X.extractOne({ rel, lang: lang || (rel.endsWith(".vue") ? "vue" : rel.endsWith(".svelte") ? "svelte" : "js"), src: lines.join("\n") + "\n" }, null);
const byQ = (r) => Object.fromEntries(r.symbols.map((s) => [s.qname, s]));

test("E1 — a component: the owner, every member, the section never in the qname", () => {
  const r = one("src/components/CreateFundTransferModal.vue", [
    "<template><form @submit.prevent=\"submit\"></form></template>",
    "<script>",
    "import formMixin from '../mixins/formMixin';",
    "export default {",
    "  name: 'CreateFundTransferModal',",
    "  mixins: [formMixin],",
    "  data() {",
    "    return { amount: 0 };",
    "  },",
    "  computed: {",
    "    canSubmit() { return this.amount > 0; },",
    "    label: {",
    "      get() { return 'x'; },",
    "      set(v) { this.amount = v; },",
    "    },",
    "    ...mapGetters(['user']),",
    "  },",
    "  watch: {",
    "    amount: function (v) { this.reset(); },",
    "  },",
    "  methods: {",
    "    async submit() {",
    "      if (!this.validate()) return;",
    "    },",
    "    load: () => null,",
    "  },",
    "};",
    "</script>",
  ]);
  const q = byQ(r);
  const owner = q.CreateFundTransferModal;
  assert.equal(owner.kind, "class");
  assert.equal(owner.exported, true);
  assert.deepStrictEqual(owner.bases, ["formMixin"]);
  assert.deepStrictEqual(owner.lines, [4, 27]);
  for (const m of ["data", "canSubmit", "label", "amount", "submit", "load"]) {
    const s = q[`CreateFundTransferModal.${m}`];
    assert.ok(s, `member ${m} is named`);
    assert.equal(s.kind, "method");
    assert.equal(s.exported, false, `${m}: a member is reached through the owner`);
  }
  assert.ok(!r.symbols.some((s) => /\.(methods|computed|watch)\./.test(s.qname)), "a section is never part of a qname");
  assert.ok(!r.symbols.some((s) => s.name === "get" || s.name === "set" || s.name === "mapGetters"), "an accessor pair is ONE member; a spread is none");
  assert.deepStrictEqual(q["CreateFundTransferModal.submit"].lines, [22, 24]);
  const submit = q["CreateFundTransferModal.submit"];
  assert.ok(submit.calls.some((c) => c.name === "validate" && c.self), "this.validate() is a self call");
  assert.ok(q["CreateFundTransferModal.amount"].calls.some((c) => c.name === "reset" && c.self));
  // Promise 5: `data() {` and `submit() {` are declarations.
  const all = r.symbols.flatMap((s) => s.calls.map((c) => c.name));
  for (const decl of ["data", "canSubmit", "submit", "get", "set"]) assert.ok(!all.includes(decl), `${decl}( is a declaration, not a call`);
});

test("E1 — the owner is named by `name:`, else by the file: stem, folder of an index, kebab to Pascal", () => {
  const stem = (rel) => one(rel, ["export default {", "  methods: { go() { return 1; } },", "};"]).symbols.find((s) => s.kind === "class").qname;
  assert.equal(stem("src/mixins/formMixin.js"), "formMixin");
  assert.equal(stem("src/store/user/index.js"), "user");
  assert.equal(stem("src/components/create-fund-transfer.js"), "CreateFundTransfer");
  const named = one("src/x.js", ["export default {", "  name: \"Pretty\",", "  methods: { go() {} },", "};"]);
  assert.ok(byQ(named)["Pretty.go"]);
  // A name that is not an identifier falls back to the file.
  const kebab = one("src/y.js", ["export default {", "  name: 'my-thing',", "  methods: { go() {} },", "};"]);
  assert.ok(byQ(kebab)["y.go"]);
});

test("E1 — defineComponent, Vue.extend, `extends`, and a section declared above", () => {
  const a = one("src/A.ts", ["import Base from './Base';", "export default defineComponent({", "  extends: Base,", "  setup() { return {}; },", "});"], "ts");
  assert.deepStrictEqual(byQ(a).A.bases, ["Base"]);
  assert.ok(byQ(a)["A.setup"]);
  const b = one("src/B.js", ["export default Vue.extend({", "  methods: { run() {} },", "});"]);
  assert.ok(byQ(b)["B.run"]);
  const c = one("src/store/cart.js", ["const mutations = {", "  ADD(state, x) { state.items.push(x); },", "};", "export default { namespaced: true, mutations };"]);
  assert.ok(byQ(c)["cart.ADD"], "`export default { mutations }` reads the object declared above");
});

test("E1 — a Vuex module: state, getters, mutations and actions are members", () => {
  const r = one("src/store/modules/user.js", [
    "export default {",
    "  namespaced: true,",
    "  state: () => ({ user: null }),",
    "  getters: { isAdmin: (state) => !!state.user },",
    "  mutations: { SET_USER(state, user) { state.user = user; } },",
    "  actions: { async fetchUser({ commit }) { commit('SET_USER', 1); } },",
    "};",
  ]);
  const q = byQ(r);
  for (const m of ["state", "isAdmin", "SET_USER", "fetchUser"]) assert.equal((q[`user.${m}`] || {}).kind, "method", m);
  assert.ok(!q["user.namespaced"], "a data member of a component is not a constant");
});

test("E2 — exported constants; a function is a function, a require is a re-export", () => {
  const r = one("src/constants.js", [
    "export const API_BASE = '/api';",
    "export const ROLES = {",
    "  admin: 'admin',",
    "};",
    "export let retries = 3;",
    "export const fmt = (x) => String(x);",
    "export const client = axios.create({ baseURL: API_BASE });",
    "exports.LIMIT = 10;",
    "exports.helper = require('./helper').helper;",
    "exports.named = named;",
  ]);
  const q = byQ(r);
  for (const c of ["API_BASE", "ROLES", "retries", "client", "LIMIT"]) {
    assert.equal((q[c] || {}).kind, "const", c);
    assert.equal(q[c].exported, true);
    assert.deepStrictEqual(q[c].calls, [], `${c}: a constant carries no calls`);
  }
  assert.deepStrictEqual(q.ROLES.lines, [2, 4], "a constant spans its value");
  assert.equal(q.fmt.kind, "function");
  assert.ok(!q.helper && !q.named, "a require and a bare name are re-exports");
  // `axios.create(…)` inside a constant stays with the module.
  assert.ok(q["<module>"].calls.some((c) => c.name === "axios.create"));
});

test("E2 — module.exports keys: a data key, a shorthand to a declared value, never a function", () => {
  const r = one("src/data/fixtures.js", [
    "const owner = 'ops';",
    "function build() { return 1; }",
    "module.exports = {",
    "  owner,",
    "  build,",
    "  tasks: [1, 2],",
    "  make() { return 2; },",
    "  lib: require('./lib'),",
    "};",
  ]);
  const q = byQ(r);
  assert.equal(q.owner.kind, "const");
  assert.deepStrictEqual(q.owner.lines, [1, 1], "a shorthand key's constant sits where the value is declared");
  assert.equal(q.tasks.kind, "const");
  assert.equal(q.build.kind, "function", "a key that names a function is that function");
  assert.ok(!r.symbols.some((s) => s.kind === "const" && (s.name === "build" || s.name === "make" || s.name === "lib")));
});

test("E3 — a <script setup> component is one class that owns no line; a Svelte prop is not a constant", () => {
  const vue = one("src/components/order-badge.vue", ["<template><b/></template>", "<script setup>", "import { OrderStore } from '../store';", "const store = new OrderStore();", "function rows() { return store.list(); }", "</script>"]);
  const cls = vue.symbols.find((s) => s.kind === "class");
  assert.equal(cls.qname, "OrderBadge");
  assert.equal(cls.exported, true);
  assert.deepStrictEqual(cls.calls, [], "it owns no line");
  const rows = vue.symbols.find((s) => s.qname === "rows");
  assert.ok(rows.calls.some((c) => c.name === "OrderStore.list" && c.alias === "store"), "the module-scope alias still reaches the function below it");

  const sv = one("src/Panel.svelte", ["<script>", "  export let id;", "  function go() { return id; }", "</script>", "<p>{id}</p>"]);
  assert.ok(sv.symbols.some((s) => s.kind === "class" && s.qname === "Panel"));
  assert.ok(!sv.symbols.some((s) => s.name === "id"), "`export let` in Svelte is a prop");

  // A component WITH an object is named by the object, never twice.
  const opt = one("src/Two.vue", ["<script>", "export default { methods: { a() {} } };", "</script>"]);
  assert.equal(opt.symbols.filter((s) => s.kind === "class").length, 1);
});

test("E1 — a file with no object and no constant is exactly what 1.9.0 wrote", () => {
  const src = ["const { a } = require('./a');", "function f() { return a(); }", "module.exports = { f };"];
  const r = one("src/f.js", src);
  assert.deepStrictEqual(r.symbols.map((s) => s.qname), ["f"]);
});

// ── the answers, end to end ────────────────────────────────────────────────

function optionsRepo() {
  const root = tmpdir();
  const files = JSON.parse(fs.readFileSync(path.join(REPO, "test", "goldens", "graph-1.9.0", "fixture.json"), "utf8"));
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  cli(["config", "set", "code_graph", "on", "--dir", root]);
  assert.equal(cli(["graph", "update", "--json", "--dir", root]).status, 0);
  return { root, git };
}
const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const json = (r) => JSON.parse(r.stdout);

test("answers — the mixin calls the component's submit; the component reaches the mixin as inherited", () => {
  const { root } = optionsRepo();
  const submit = json(graph(root, "ctx", "CreateFundTransferModal.submit", "--json"));
  assert.equal(submit.state, "found");
  assert.deepStrictEqual(
    submit.callers.map((c) => [c.qname, c.file, c.line]),
    [["formMixin.reset", "src/mixins/formMixin.js", 7]],
    "the mixin's this.submit() is the caller"
  );
  assert.ok(submit.calls.some((c) => c.target && c.target.qname === "formMixin.validate" && c.inherited), "validate is inherited through mixins");
  assert.equal(submit.note.source, "doc", "an Options API method with a comment gets its doc note for free");

  const v = json(graph(root, "ctx", "formMixin.validate", "--json"));
  assert.deepStrictEqual(v.callers.map((c) => [c.file, c.line, !!c.inherited]), [["src/components/CreateFundTransferModal.vue", 37, true]]);

  const imp = json(graph(root, "impact", "src/mixins/formMixin.js", "--json"));
  assert.ok(imp.callers.some((c) => c.file === "src/components/CreateFundTransferModal.vue"), "every component that mixes it in is in the blast radius");
});

test("answers — SET_USER and the constants are found by name; a string dispatch is no edge", () => {
  const { root } = optionsRepo();
  const s = json(graph(root, "ctx", "SET_USER", "--json"));
  assert.equal(s.state, "found");
  assert.equal(s.target.qname, "user.SET_USER");
  assert.deepStrictEqual(s.callers, [], "commit('SET_USER') is a string, and a string is not an edge");
  assert.equal(json(graph(root, "ctx", "API_BASE", "--json")).target.kind, "const");
  const st = json(graph(root, "status", "--json"));
  assert.equal(st.engine, "graph@6");
  assert.equal(st.density.zero_files, 0, "every file of the fixture now holds a named symbol");
});

test("answers — a default import under ANY local name reaches the mixin", () => {
  const { root, git } = optionsRepo();
  const p = path.join(root, "src", "components", "CreateFundTransferModal.vue");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("import formMixin from", "import FM from").replace("mixins: [formMixin]", "mixins: [FM]"));
  git("add", "-A");
  git("commit", "-qm", "rename");
  graph(root, "update", "--json");
  const v = json(graph(root, "ctx", "formMixin.validate", "--json"));
  assert.equal(v.callers.length, 1, "the file has ONE exported class, so FM is it");
  assert.equal(v.callers[0].inherited, true);
});
