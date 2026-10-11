"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v2.2.0 (T6) — the executor PACK: `orc graph ctx --for-slice … --pack=<path>`.
//
// The promises this file holds:
//
//   1. **One file, four sections** — outside view, reference outlines, quoted
//      ranges and tests — written atomically where `--pack=` says.
//   2. **The quotes follow the focus** — `--refs=` names the files the executor
//      copies from and `--focus=` ranks their ranges.
//   3. **The JSON answer is ONE line** that points at the pack.
//   4. **The budget holds**, and the pack says what it cut.
//   5. **No `--pack` is today's for-slice answer**, and `--if-enabled` under
//      `code_graph off` is exit 3.
//   6. **Short file names resolve** to the one file whose path ends with them.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli } = require("../_helpers");
const { spawnSync } = require("child_process");
const { vueRepo } = require("./_graph-vue-fixture.js");

const DECLARED = "client/src/views/remittance/outwardRemittance/OutwardRemittance.vue";
const SWAP = "client/src/views/digitalAssets/components/modals/SwapSelectionsModal.vue";
const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const json = (r) => JSON.parse(r.stdout);
const tok = (s) => Math.ceil(String(s).length / 4);

test("pack — the file is written with all four sections, and the JSON card is ONE line", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=.claude/orc/run/pack-T1.md", `--refs=${SWAP}`, "--focus=calc,source", "--if-enabled", "--json", "--brief");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  const file = path.join(root, ".claude", "orc", "run", "pack-T1.md");
  assert.ok(fs.existsSync(file), "the folder is created and the pack written");
  const text = fs.readFileSync(file, "utf8");
  for (const h of ["# graph pack · gen", "## 1. Files to change — outside view", "## 2. Reference files — outline", "## 3. Quoted ranges", "## 4. Tests that reach these files"])
    assert.ok(text.includes(h), `section: ${h}`);
  assert.match(text, /SwapSelectionsModal\.vue · 21 lines · template 1-3 · script 5-20/);
  assert.match(text, /### client\/src\/views\/digitalAssets\/components\/modals\/SwapSelectionsModal\.vue:9-11 · SwapSelectionsModal\.calcSource/, "the focus words quote calcSource");
  assert.ok(text.includes("    calcSource(v) {\n      return v * 2;\n    },"), "the exact lines");
  assert.ok(!/\.template\b/.test(text.split("## 3.")[1].split("## 4.")[0]), "a template symbol is never quoted");

  assert.ok(!j.card.includes("\n"), "the card is one line");
  assert.match(j.card, /^graph pack → \.claude\/orc\/run\/pack-T1\.md · 2 files · 1 refs · \d+ quoted ranges · ~\d+ tokens · gen \d+ — the executor reads it first$/);
  assert.equal(j.line, j.card);
  assert.match(j.trace, /^GRAPH-CONSULT pack :: files=2 refs=1 excerpts=\d+ tokens=\d+ gen=\d+$/);
  assert.equal(j.pack.path, ".claude/orc/run/pack-T1.md");
  assert.deepStrictEqual(j.pack.refs, [SWAP]);
  assert.equal(j.pack.tokens, tok(text));
  assert.deepStrictEqual(j.files, [DECLARED], "today's for-slice fields stay");

  const rows = fs.readFileSync(path.join(root, ".claude", "orc", "graph", "gain.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const row = rows[rows.length - 1];
  assert.equal(row.cmd, "pack");
  assert.equal(row.paid.card, j.pack.tokens);
  assert.equal(row.avoided.low, 0);
  assert.equal(row.outcome, "ok");
});

test("pack — a short ref name resolves, and an ambiguous one is exit 4 with its candidates", () => {
  const { root } = vueRepo({ extra: { "client/src/other/SwapSelectionsModal.vue": "<template><div/></template>\n" } });
  graph(root, "update");
  const ok = graph(root, "ctx", "--for-slice", DECLARED, "--pack=p.md", "--refs=modals/SwapSelectionsModal.vue", "--json");
  assert.equal(ok.status, 0, ok.stdout);
  assert.deepStrictEqual(json(ok).pack.refs, [SWAP]);
  const amb = graph(root, "ctx", "--for-slice", DECLARED, "--pack=p.md", "--refs=SwapSelectionsModal.vue", "--json");
  assert.equal(amb.status, 4);
  assert.equal(json(amb).candidates.length, 2);

  // The same rule for a plain `ctx`.
  const one = graph(root, "ctx", "OutwardRemittance.vue", "--json");
  assert.equal(one.status, 0, one.stdout);
  assert.equal(json(one).file, DECLARED);
  const two = graph(root, "ctx", "SwapSelectionsModal.vue", "--json");
  assert.equal(two.status, 4);
  assert.deepStrictEqual(json(two).candidates.map((c) => c.file).sort(), ["client/src/other/SwapSelectionsModal.vue", SWAP]);
});

test("pack — --pack-budget=500 keeps the pack small and says what it cut", () => {
  const fns = [];
  for (let i = 0; i < 40; i++) fns.push(`export function calcStep${i}(v) {`, ...Array.from({ length: 8 }, (_, k) => `  const x${k} = v * ${k} + ${i}; // a line long enough to cost tokens`), "  return v;", "}");
  const { root } = vueRepo({ extra: { "client/src/utils/calc.js": fns.join("\n") + "\n" } });
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=small.md", "--refs=client/src/utils/calc.js", "--focus=calc", "--pack-budget=500", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  const text = fs.readFileSync(path.join(root, "small.md"), "utf8");
  assert.ok(j.pack.tokens <= 500 + 2000, `${j.pack.tokens} tokens`);
  const quoted = text.split("## 3. Quoted ranges")[1].split(/\n## 4\.|\ncut:/)[0];
  assert.ok(tok(quoted) <= 520, `the quotes keep to their budget (${tok(quoted)})`);
  assert.ok(j.pack.cut.length > 0, "something was left out");
  assert.match(text, /\ncut: .*§3 \d+ range\(s\) over the 500-token quote budget/);
});

test("pack — without --pack the for-slice answer is today's, and off with --if-enabled is exit 3", () => {
  const { root } = vueRepo();
  const plain = json(graph(root, "ctx", "--for-slice", DECLARED, "--json"));
  assert.equal(plain.pack, undefined);
  assert.match(plain.card, /^graph outside view/);
  assert.match(plain.trace, /^GRAPH-CONSULT slice :: targets=/);

  assert.equal(cli(["config", "set", "code_graph", "off", "--dir", root]).status, 0);
  const off = graph(root, "ctx", "--for-slice", DECLARED, "--pack=x.md", "--if-enabled", "--json");
  assert.equal(off.status, 3);
  assert.ok(!fs.existsSync(path.join(root, "x.md")), "no pack is written when the graph is off");
});

test("pack — with no --refs the map picks them, and a new declared file is named", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "--for-slice", DECLARED, "client/src/views/new/Thing.vue", "--pack=auto.md", "--focus=remittance", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.ok(j.pack.refs.length > 0 && j.pack.refs.length <= 5);
  assert.ok(!j.pack.refs.includes(DECLARED), "a declared file is never a reference");
  assert.ok(j.pack.refs.every((f) => !/tests?\//.test(f)), "a test is never a reference");
  assert.match(fs.readFileSync(path.join(root, "auto.md"), "utf8"), /new \(no record yet\): client\/src\/views\/new\/Thing\.vue/);
});

test("map — --focus=a,b reads like the space form, and --brief counts the focus list", () => {
  const { root } = vueRepo();
  const eq = json(graph(root, "map", "--focus=remittance,recipient", "--budget", "800", "--json"));
  const sp = json(graph(root, "map", "--focus", "remittance,recipient", "--budget", "800", "--json"));
  assert.deepStrictEqual(eq.focus, sp.focus);
  assert.ok(eq.focus.length > 0);
  const raw = graph(root, "map", "--focus=remittance,recipient", "--budget", "800", "--json", "--brief").stdout;
  const b = JSON.parse(raw);
  assert.equal(b.focus, undefined, "the focus list is dropped");
  assert.equal(b.counts.focus, eq.focus.length, "and counted");
  assert.ok(b.card, "the card stays");
  // The card fills its own 800-token budget; everything AROUND it stays small.
  assert.ok(Buffer.byteLength(raw) - Buffer.byteLength(JSON.stringify(b.card)) <= 1024, `${Buffer.byteLength(raw)} bytes`);
});

// ── T6c — pack priorities ───────────────────────────────────────────────────

test("T6c pack — the quotes are spread: two refs with candidates both get a quote", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=spread.md", `--refs=${SWAP},client/src/views/remittance/recipients/CreateRecipient.vue`, "--focus=calc,source", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(root, "spread.md"), "utf8");
  const files = new Set([...text.matchAll(/^### (\S+?):\d+-\d+/gm)].map((m) => m[1]));
  assert.ok(files.has(SWAP) && files.has("client/src/views/remittance/recipients/CreateRecipient.vue"), [...files].join(" "));
});

test("T6c pack — --pack-budget=500 never removes the members rows", () => {
  const fns = [];
  for (let i = 0; i < 40; i++) fns.push(`export function calcStep${i}(v) {`, ...Array.from({ length: 8 }, (_, k) => `  const x${k} = v * ${k} + ${i}; // a line long enough to cost tokens`), "  return v;", "}");
  const { root } = vueRepo({ extra: { "client/src/utils/calc.js": fns.join("\n") + "\n" } });
  graph(root, "ctx", "--for-slice", DECLARED, "--pack=m.md", `--refs=client/src/utils/calc.js,${SWAP}`, "--focus=calc", "--pack-budget=500", "--json");
  const text = fs.readFileSync(path.join(root, "m.md"), "utf8");
  const outline = text.split("## 2. Reference files — outline")[1].split("## 3.")[0];
  assert.match(outline, /client\/src\/utils\/calc\.js · \d+ lines · read ranges, not the file\n {2}members {3}calcStep0 1-11/);
  assert.match(outline, /members {3}calcSource 9-11/);
});

test("T6c pack — a large router edit target gets its ROUTE outline in §1", () => {
  const routes = [];
  for (let i = 0; i < 30; i++) routes.push("        {", `          path: 'page${i}',`, `          name: 'Page${i}',`, "          component: OutwardRemittance,", "        },");
  const router = [
    "import Router from 'vue-router';",
    "",
    "const RemittanceLayout = () => import('@/containers/RemittanceLayout');",
    "const OutwardRemittance = () => import('@/views/remittance/outwardRemittance/OutwardRemittance');",
    "",
    "function configRoutes() {",
    "  return [",
    "    {",
    "      path: '/remittances',",
    "      component: RemittanceLayout,",
    "      children: [",
    ...routes,
    "      ],",
    "    },",
    "  ];",
    "}",
    "",
    "export default new Router({ mode: 'history', routes: configRoutes() });",
  ].join("\n");
  const { root } = vueRepo({ extra: { "client/src/router/index.js": router + "\n" } });
  const r = graph(root, "ctx", "--for-slice", "client/src/router/index.js", "--pack=r.md", `--refs=${SWAP}`, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const s1 = fs.readFileSync(path.join(root, "r.md"), "utf8").split("## 2.")[0];
  assert.match(s1, /client\/src\/router\/index\.js · \d+ lines/);
  assert.match(s1, /\n {2}VIEW \/page0 Page0 \d+-\d+/);
});

// ── R2 — lean pack v2: outline first ────────────────────────────────────────

const SELECT = "client/src/views/remittance/components/SelectField.vue";

test("R2 pack — the default pack keeps to its budget, and the header is the read rule", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=lean.md", `--refs=${SWAP},${SELECT}`, "--focus=calc,source", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(root, "lean.md"), "utf8");
  assert.ok(json(r).pack.tokens <= 1200 + 1500 + 400 + 400, `${json(r).pack.tokens} tokens`);
  assert.ok(text.includes("Read this pack ALONE, with the Read tool, before anything else."));
  assert.ok(text.includes("never a whole file over 300 lines"));
  assert.ok(!text.includes("A LOCATOR from the code graph"));
});

test("R2 pack — a child ref pulls its template parent as an outline-only ref", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=par.md", `--refs=${SELECT}`, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(root, "par.md"), "utf8");
  const s2 = text.split("## 2.")[1].split("## 3.")[0];
  assert.match(s2, /recipients\/CreateRecipient\.vue · \d+ lines.* · parent of SelectField\.vue/);
  assert.ok(!/^### \S*CreateRecipient\.vue/m.test(text), "a parent is never quoted");
});

test("R2 pack — a 40-line method is not quoted", () => {
  const body = Array.from({ length: 38 }, (_, k) => `  const x${k} = v + ${k};`);
  const src = ["export function calcLong(v) {", ...body, "}", "export function calcShort(v) {", "  return v;", "}"].join("\n");
  const { root } = vueRepo({ extra: { "client/src/utils/long.js": src + "\n" } });
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=long.md", "--refs=client/src/utils/long.js", "--focus=calc", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(root, "long.md"), "utf8");
  assert.ok(!/^### .*calcLong/m.test(text), "the 40-line method is not quoted");
  assert.match(text, /^### .*calcShort/m);
});

// ── R3 — pack v3: the component neighbourhood ──────────────────────────────

const CREATE = "client/src/views/remittance/recipients/CreateRecipient.vue";

test("R3 pack — a given ref pulls its child, a declared component pulls its child, outline only", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=nb.md", `--refs=${CREATE}`, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(root, "nb.md"), "utf8");
  const s2 = text.split("## 2.")[1].split("## 3.")[0];
  assert.match(s2, /components\/SelectField\.vue · \d+ lines.* · child of CreateRecipient\.vue/);
  assert.match(s2, /components\/PageHeader\.vue · \d+ lines.* · child of OutwardRemittance\.vue/);
  assert.ok(!/^### \S*(SelectField|PageHeader)\.vue/m.test(text), "a neighbour is never quoted");
  const j = json(r);
  assert.ok(j.pack.refs.every((f) => !/SelectField|PageHeader/.test(f)), "neighbours are not given refs");
});

test("R3 pack — the neighbourhood cap of 10 holds", () => {
  const extra = {};
  const tags = [];
  for (let i = 0; i < 14; i++) {
    extra[`client/src/components/Kid${i}.vue`] = `<template><div>${i}</div></template>\n<script>\nexport default { name: 'Kid${i}' };\n</script>\n`;
    tags.push(`<Kid${i} />`);
  }
  const imports = Array.from({ length: 14 }, (_, i) => `import Kid${i} from '@/components/Kid${i}';`).join("\n");
  extra["client/src/views/Many.vue"] = `<template>\n  <div>\n    ${tags.join("\n    ")}\n  </div>\n</template>\n<script>\n${imports}\nexport default { name: 'Many', components: { ${tags.map((_, i) => `Kid${i}`).join(", ")} } };\n</script>\n`;
  const { root } = vueRepo({ extra });
  const refs = ["client/src/views/Many.vue", CREATE, SWAP].join(",");
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=cap.md", `--refs=${refs}`, "--focus=remittance", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(root, "cap.md"), "utf8");
  const tagged = text.split("## 2.")[1].split("## 3.")[0].split("\n").filter((l) => / · (child of|parent of|name match:)/.test(l));
  assert.ok(tagged.length <= 10, `${tagged.length} neighbours`);
  assert.ok(tagged.filter((l) => /Kid\d+\.vue.* · child of Many\.vue/.test(l)).length <= 3, "max 3 children per ref");
});

test("R3 pack — a router edit target keeps only focus-matching routes ±2", () => {
  const routes = [];
  for (let i = 0; i < 30; i++) routes.push("        {", `          path: '${i === 15 ? "swapPage" : "page" + i}',`, `          name: 'Page${i}',`, "          component: OutwardRemittance,", "        },");
  const router = [
    "import Router from 'vue-router';",
    "const OutwardRemittance = () => import('@/views/remittance/outwardRemittance/OutwardRemittance');",
    "function configRoutes() {",
    "  return [",
    "    {",
    "      path: '/remittances',",
    "      component: OutwardRemittance,",
    "      children: [",
    ...routes,
    "      ],",
    "    },",
    "  ];",
    "}",
    "export default new Router({ mode: 'history', routes: configRoutes() });",
  ].join("\n");
  const { root } = vueRepo({ extra: { "client/src/router/index.js": router + "\n" } });
  const r = graph(root, "ctx", "--for-slice", "client/src/router/index.js", "--pack=rt.md", `--refs=${SWAP}`, "--focus=swap", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const s1 = fs.readFileSync(path.join(root, "rt.md"), "utf8").split("## 2.")[0];
  const rows = s1.split("\n").filter((l) => /^ {2}VIEW /.test(l));
  assert.ok(rows.some((l) => /swapPage/.test(l)), s1);
  for (const k of [13, 14, 16, 17]) assert.ok(rows.some((l) => new RegExp(`Page${k} `).test(l)), `Page${k} kept`);
  assert.ok(!rows.some((l) => /\/page0 /.test(l)), "a far route is not listed");
  assert.match(s1, /\n {2}\+\d+ other routes/);
});

// ── R4 — name match finds the copy-from file; the closest spec's setup ─────

test("R4 pack — `selection` matches SwapSelectionsModal (plural) as a name match", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=pl.md", `--refs=${SELECT}`, "--focus=selection", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const s2 = fs.readFileSync(path.join(root, "pl.md"), "utf8").split("## 2.")[1].split("## 3.")[0];
  assert.match(s2, /SwapSelectionsModal\.vue · .*name match: selection \(/);
});

test("R4 pack — a 2-word name match beats a single rare word", () => {
  const extra = { "client/src/utils/zebraUnique.js": "export function zebraUnique() { return 1; }\n" };
  const { root } = vueRepo({ extra });
  const r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=mw.md", `--refs=${SELECT}`, "--focus=zebra,selection,modal", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const s2 = fs.readFileSync(path.join(root, "mw.md"), "utf8").split("## 2.")[1].split("## 3.")[0];
  const names = s2.split("\n").filter((l) => / · name match: /.test(l)).map((l) => l.split(" · ")[0]);
  assert.ok(names.indexOf(SWAP) >= 0, JSON.stringify(names));
  assert.ok(names.indexOf("client/src/utils/zebraUnique.js") < 0 || names.indexOf(SWAP) < names.indexOf("client/src/utils/zebraUnique.js"), JSON.stringify(names));
});

test("R4 pack — §4 quotes the closest spec's setup, max 45 lines", () => {
  const mocks = Array.from({ length: 60 }, (_, i) => `jest.mock('@/api/mod${i}', () => ({\n  get: jest.fn(),\n}));`).join("\n");
  const spec = [
    "import { render } from '@testing-library/vue';",
    "import SwapSelectionsModal from '@/views/digitalAssets/components/modals/SwapSelectionsModal';",
    mocks,
    "const renderIt = () => render(SwapSelectionsModal);",
    "describe('SwapSelectionsModal', () => {",
    "  it('opens', () => {",
    "    renderIt();",
    "  });",
    "});",
  ].join("\n");
  const small = ["import { render } from '@testing-library/vue';", "jest.mock('@/api/remittance.api');", "describe('x', () => {", "  it('y', () => {});", "});"].join("\n");
  const { root } = vueRepo({ extra: { "client/tests/unit/views/SwapSelectionsModal.spec.js": spec + "\n", "client/tests/unit/views/Small.spec.js": small + "\n", "client/src/views/Small.vue": "<template><div/></template>\n" } });
  let r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=sp.md", "--refs=client/src/views/Small.vue", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  let s4 = fs.readFileSync(path.join(root, "sp.md"), "utf8").split("## 4.")[1];
  assert.match(s4, /closest spec for Small\.vue: client\/tests\/unit\/views\/Small\.spec\.js .*describe "x" 3-5/);
  assert.match(s4, /setup 1-2:\n```js\nimport \{ render \}[^\n]*\njest\.mock\('@\/api\/remittance\.api'\);\n```/);
  r = graph(root, "ctx", "--for-slice", DECLARED, "--pack=sp2.md", `--refs=${SWAP}`, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  s4 = fs.readFileSync(path.join(root, "sp2.md"), "utf8").split("## 4.")[1];
  const m = /setup 1-(\d+):\n```js\n([\s\S]*?)\n```/.exec(s4);
  assert.ok(m, s4);
  assert.equal(Number(m[1]), 45);
  assert.equal(m[2].split("\n").length, 45);
  assert.match(s4, /setup goes on to line 183/);
});

// ── v2.2.0 (R6): `--anchors` — no file, max 12 ranges, ONE read-all command ──
test("anchors — at most 12 lines, no file written, and read_cmd prints every range in sh", () => {
  const { root } = vueRepo();
  const before = new Set(fs.readdirSync(root, { recursive: true }).map(String));
  const r = graph(root, "ctx", "--for-slice", DECLARED, "client/src/router/index.js", "client/src/api/remittance.api.js", `--refs=${SWAP}`, "--focus=calc,source,swap", "--anchors", "--if-enabled", "--json", "--brief");
  assert.equal(r.status, 0, r.stderr);
  const j = json(r);
  assert.ok(j.anchors, "the answer carries anchors");
  assert.ok(j.anchors.lines.length >= 1 && j.anchors.lines.length <= 12, `${j.anchors.lines.length} lines`);
  for (const l of j.anchors.lines) assert.match(l, /^\S+:\d+-\d+ {2}\S.* {2}\(.+\)$/);
  assert.ok(j.card.includes(`\nread all: ${j.anchors.read_cmd}\n`), "the block carries the read-all command");
  assert.ok(typeof j.anchors.code === "string" && j.anchors.code.length > 0, "R8: the code comes inline");
  assert.match(j.card, /\nread all: [^\n]+\n(`{3,})\n[\s\S]+\n\1$/, "R8: the card ends with a fenced code block");
  assert.ok(j.card.includes(j.anchors.code), "R8: the fenced block is anchors.code");
  assert.ok(Buffer.byteLength(j.card) <= 11264, "R8: the card cap follows read_tokens");
  assert.match(j.line, /^graph anchors: \d+ ranges in \d+ files · ~\d+ tokens to read · gen \d+ · code inline$/);
  assert.match(j.trace, /^GRAPH-CONSULT anchors :: ranges=\d+ files=\d+ gen=\d+$/);
  const after = fs.readdirSync(root, { recursive: true }).map(String).filter((f) => !before.has(f) && !/[\/]\.claude[\/]|^\.claude/.test(f));
  assert.deepStrictEqual(after, [], "no file is written outside .claude");
  const out = spawnSync("sh", ["-c", j.anchors.read_cmd], { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  for (const l of j.anchors.lines) {
    const [, file, a, b] = /^(\S+):(\d+)-(\d+)/.exec(l);
    assert.ok(out.stdout.includes(`== ${file}:${a}-${b}`), `the header for ${file}:${a}-${b}`);
  }
  // R8: the inline code IS what read_cmd prints for those ranges (headers carry the qname on top).
  for (const chunk of j.anchors.code.replace(/^(== \S+:\d+-\d+) · .*$/gm, "$1").split(/\n(?=== )/)) {
    assert.ok(out.stdout.includes(chunk), `inline chunk is read_cmd output: ${chunk.slice(0, 60)}`);
  }
  const row = fs.readFileSync(path.join(root, ".claude", "orc", "graph", "gain.jsonl"), "utf8").trim().split("\n").map((x) => JSON.parse(x)).pop();
  assert.equal(row.cmd, "anchors");
  assert.equal(row.paid.card, j.anchors.tokens);
  assert.equal(row.avoided.low, 0);
});

test("anchors — every coding lane names --anchors and graph_anchors, and none uses --pack=", () => {
  const { REPO } = require("../_helpers");
  const T = (rel) => fs.readFileSync(path.join(REPO, "templates", rel), "utf8");
  for (const rel of ["skills/orc/SKILL.md", "skills/orc-mini/SKILL.md", "skills/orc-fast/SKILL.md", "skills/orc-quick/SKILL.md", "skills/orc-quick/references/look.md", "skills/_shared/phases/execution.md", "skills/_shared/code-graph.md"]) {
    const t = T(rel);
    assert.ok(t.includes("--anchors"), `${rel} names --anchors`);
    assert.ok(t.includes("graph_anchors"), `${rel} names graph_anchors`);
    if (!rel.endsWith("code-graph.md")) assert.ok(!t.includes("--pack="), `${rel} no longer uses --pack=`);
    assert.ok(!t.includes("graph_pack"), `${rel} no longer names graph_pack`);
  }
  assert.ok(T("agents/orc-executor-opus-5-low.md").includes("graph_anchors"));
});

// ── v2.2.0 (R8): the code comes inline, and the wiki becomes lazy ──
test("anchors R8 — lanes list at most ONE wiki page with anchors; the executor uses the inline code as read", () => {
  const { REPO } = require("../_helpers");
  const T = (rel) => fs.readFileSync(path.join(REPO, "templates", rel), "utf8");
  for (const rel of ["skills/orc/SKILL.md", "skills/orc-mini/SKILL.md", "skills/orc-fast/SKILL.md", "skills/orc-quick/SKILL.md", "skills/orc-quick/references/look.md", "skills/_shared/phases/execution.md", "skills/_shared/code-graph.md"])
    assert.ok(T(rel).includes("at most ONE wiki page"), `${rel} says at most ONE wiki page`);
  assert.ok(T("skills/_shared/phases/wiki-consult.md").includes("a slice that carries graph anchors lists at most one page"));
  for (const rel of ["agents/orc-executor-opus-5-low.md", "skills/_shared/read-ladder.md"]) {
    const t = T(rel);
    assert.ok(t.includes("use it as already read") && t.includes("do NOT read those ranges again"), `${rel}: inline code`);
    assert.ok(t.includes("a wiki page is OPTIONAL"), `${rel}: lazy wiki`);
    assert.ok(t.includes("real bytes of the current blob"), `${rel}: anchors are real bytes`);
    assert.ok(/EDIT is still read in\s+full first/.test(t), `${rel}: exception 1 kept`);
  }
});

// ── v2.2.0: a ROUTER edit target always gives the nearest route + a path comment ──
test("anchors — a router edit target gives the nearest route and a quoted-path comment", () => {
  const kids = [];
  for (let i = 0; i < 11; i++) kids.push(`        { path: 'page${i}', name: 'Page${i}', component: Page },`);
  kids.splice(6, 0,
    "        {",
    "          path: 'outwards',",
    "          name: 'OutwardRemittance',",
    "          component: Page,",
    "        },",
    "        // Declared after 'outwards/create' so the list page wins");
  const router = [
    "import Router from 'vue-router';",
    "const Page = () => import('@/views/remittance/outwardRemittance/OutwardRemittance');",
    "function configRoutes() {",
    "  return [",
    "    {",
    "      path: '/remittances',",
    "      component: Page,",
    "      children: [",
    ...kids,
    "      ],",
    "    },",
    "  ];",
    "}",
    "export default new Router({ mode: 'history', routes: configRoutes() });",
    "",
  ].join("\n");
  const { root } = vueRepo({ extra: { "client/src/router/index.js": router } });
  const r = graph(root, "ctx", "--for-slice", "client/src/router/index.js", "--focus=outward,remittance,create", "--anchors", "--if-enabled", "--json", "--brief");
  assert.equal(r.status, 0, r.stderr);
  const j = json(r);
  const row = j.anchors.lines.find((l) => l.startsWith("client/src/router/index.js:"));
  assert.ok(row, JSON.stringify(j.anchors.lines));
  assert.match(row, /router: /);
  const [, a, b] = /:(\d+)-(\d+)/.exec(row).map(Number);
  const src = router.split("\n");
  const routeAt = src.findIndex((l) => l.includes("path: 'outwards',")) + 1;
  const commentAt = src.findIndex((l) => l.includes("'outwards/create'")) + 1;
  assert.ok(a <= routeAt && b >= routeAt, `${row} holds the outwards route (${routeAt})`);
  assert.ok(a <= commentAt && b >= commentAt, `${row} holds the path comment (${commentAt})`);
});

test("anchors — a same-feature copy-from ranks before a cross-feature one, unless given", () => {
  const SAME = "client/src/views/remittance/components/SwapSelections.vue";
  const body = "<template><div/></template>\n<script>\nexport default {\n  methods: {\n    swapSelections() {\n      return 1;\n    },\n  },\n};\n</script>\n";
  const { root } = vueRepo({ extra: { [SAME]: body } });
  const first = (j) => j.anchors.lines.map((l) => l.split(":")[0]).find((f) => f === SAME || f === SWAP);
  const auto = json(graph(root, "ctx", "--for-slice", DECLARED, "--focus=swap,selections", "--anchors", "--if-enabled", "--json", "--brief"));
  assert.equal(first(auto), SAME, JSON.stringify(auto.anchors.lines));
  const given = json(graph(root, "ctx", "--for-slice", DECLARED, `--refs=${SWAP}`, "--focus=swap,selections", "--anchors", "--if-enabled", "--json", "--brief"));
  assert.equal(first(given), SWAP, JSON.stringify(given.anchors.lines));
});

// ── v2.2.0: inline code = edit sites only; caller anchors for a declared api file ──
test("anchors — copy-from code is not inline; edit-target and caller code is; an api file gets caller anchors", () => {
  const big = ["export function calcSwapSource(a) {", "  return a + 1;", "}"];
  for (let i = 0; i < 170; i++) big.push(`export function filler${i}() { return ${i}; }`);
  const { root } = vueRepo({ extra: { "client/src/utils/swapMath.js": big.join("\n") + "\n" } });
  let r = graph(root, "ctx", "--for-slice", "client/src/utils/swapMath.js", `--refs=${SWAP}`, "--focus=calc,source,swap", "--anchors", "--if-enabled", "--json", "--brief");
  assert.equal(r.status, 0, r.stderr);
  let j = json(r);
  const heads = (code) => new Set((code.match(/^== (\S+:\d+-\d+)/gm) || []).map((h) => h.slice(3)));
  let inl = heads(j.anchors.code);
  const kinds = j.anchors.lines.map((l) => ({ at: /^(\S+:\d+-\d+)/.exec(l)[1], why: /\(([^)]*)\)$/.exec(l)[1] }));
  assert.ok(kinds.some((k) => /^(copy-from|contract)/.test(k.why)), j.anchors.lines.join("\n"));
  for (const k of kinds) {
    if (/^(copy-from|contract)/.test(k.why)) assert.ok(!inl.has(k.at), `copy-from not inline: ${k.at}`);
    if (/^(edit target|router|caller)/.test(k.why)) assert.ok(inl.has(k.at), `edit site inline: ${k.at}`);
  }
  assert.ok(kinds.some((k) => /^edit target/.test(k.why) && inl.has(k.at)), "an edit target is inline");
  assert.ok(j.anchors.read_tokens <= 2500);
  r = graph(root, "ctx", "--for-slice", "client/src/api/remittance.api.js", "--focus=recipient,create", "--anchors", "--if-enabled", "--json", "--brief");
  assert.equal(r.status, 0, r.stderr);
  j = json(r);
  const callers = j.anchors.lines.filter((l) => /\(caller of /.test(l));
  assert.ok(callers.length >= 1 && callers.length <= 6, j.anchors.lines.join("\n"));
  assert.ok(callers.some((l) => l.includes("CreateRecipient.vue")), callers.join("\n"));
  inl = heads(j.anchors.code);
  for (const l of callers) assert.ok(inl.has(/^(\S+:\d+-\d+)/.exec(l)[1]), `caller inline: ${l}`);
  assert.ok(j.anchors.read_tokens <= 2500);
});

// ── v2.2.0 (R10): comma-joined declared files; caller anchors follow the focus ──
test("anchors — a comma-joined --for-slice equals the space form; a missing path is named", () => {
  const { root } = vueRepo();
  const A = DECLARED;
  const B = "client/src/api/remittance.api.js";
  const sp = json(graph(root, "ctx", "--for-slice", A, B, "--focus=outward,remittance", "--anchors", "--if-enabled", "--json", "--brief"));
  const cm = json(graph(root, "ctx", "--for-slice", `${A},${B}`, "--focus=outward,remittance", "--anchors", "--if-enabled", "--json", "--brief"));
  assert.deepEqual(cm.anchors.lines, sp.anchors.lines);
  assert.deepEqual(cm.anchors.missing, []);
  const ty = json(graph(root, "ctx", "--for-slice", `${A},nope.js`, "--focus=outward,remittance", "--anchors", "--if-enabled", "--json", "--brief"));
  assert.ok(String(ty.line).includes("not found: nope.js"), ty.line);
  assert.deepEqual(ty.anchors.missing, ["nope.js"]);
});

test("anchors — a focus callee gives its definition and every call site, declared files included", () => {
  const F = "client/src/utils/fmtSlot.js";
  const CA = "client/src/utils/callerA.js";
  const CB = "client/src/utils/callerB.js";
  const CC = "client/src/views/other/callerC.js";
  const extra = {
    [F]: "export function fmtSlot(slot, locale) {\n  return String(slot) + locale;\n}\n",
    [CA]: "import { fmtSlot } from './fmtSlot.js';\nexport function helperA(x) {\n  return fmtSlot(x, 'en');\n}\n",
    [CB]: "import { fmtSlot } from './fmtSlot.js';\nexport function useB(x) {\n  return fmtSlot(x, 'id');\n}\n",
    [CC]: "import { fmtSlot } from '../../utils/fmtSlot.js';\nimport { helperA } from '../../utils/callerA.js';\nexport function runC(x) {\n  const y = fmtSlot(x, 'fr');\n  return helperA(y);\n}\n",
  };
  const { root } = vueRepo({ extra });
  const r = graph(root, "ctx", "--for-slice", F, CA, CB, "--focus=fmtSlot,options", "--anchors", "--if-enabled", "--json", "--brief");
  assert.equal(r.status, 0, r.stderr);
  const j = json(r);
  const lines = j.anchors.lines;
  assert.ok(lines.some((l) => l.startsWith(F + ":") && l.includes("(edit target: fmtSlot")), lines.join("\n"));
  for (const f of [CA, CB, CC]) assert.ok(lines.some((l) => l.startsWith(f + ":") && /\(caller of fmtSlot/.test(l)), f + "\n" + lines.join("\n"));
  assert.ok(!lines.some((l) => /caller of helperA/.test(l)), lines.join("\n"));
  // R10b: in focus mode the call sites are the edit targets — no one-word edit target, no auto copy-from.
  assert.ok(!lines.some((l) => /\(edit target: [a-z]+[,)]/.test(l) && !/edit target: fmtSlot/.test(l)), lines.join("\n"));
  assert.ok(!lines.some((l) => /\(copy-from/.test(l)), lines.join("\n"));
  const inl = new Set((j.anchors.code.match(/^== (\S+:\d+-\d+)/gm) || []).map((h) => h.slice(3)));
  for (const l of lines) assert.ok(inl.has(/^(\S+:\d+-\d+)/.exec(l)[1]), "inline: " + l);
});

test("anchors — an SFC component (class) is never a focus callee; the R9 caller rule holds", () => {
  const V = "client/src/views/other/FmtPanel.vue";
  const H = "client/src/utils/panelMath.js";
  const U = "client/src/views/other/usePanel.js";
  const extra = {
    [V]: "<template><div/></template>\n<script>\nexport default {\n  name: 'FmtPanel',\n  methods: {\n    show() {\n      return 1;\n    },\n  },\n};\n</script>\n",
    [H]: "export function sumPanel(a, b) {\n  return a + b;\n}\n",
    [U]: "import { sumPanel } from '../../utils/panelMath.js';\nexport function usePanel(x) {\n  return sumPanel(x, 1);\n}\n",
  };
  const { root } = vueRepo({ extra });
  const r = graph(root, "ctx", "--for-slice", V, H, "--focus=fmt,panel", "--anchors", "--if-enabled", "--json", "--brief");
  assert.equal(r.status, 0, r.stderr);
  const lines = json(r).anchors.lines;
  assert.ok(!lines.some((l) => /edit target: FmtPanel/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => l.startsWith(U + ":") && /\(caller of sumPanel/.test(l)), lines.join("\n"));
});

// ── v2.2.0 (R11): ONE look-time card — tests via callers, coverage, anchors ──
test("R11 — a helper only components call: tests_via names the spec, coverage is present, --anchors equals for-slice", () => {
  const { root } = vueRepo();
  const HELPER = "client/src/api/remittance.api.js";
  const CALLER = "client/src/views/remittance/recipients/CreateRecipient.vue";
  const card = graph(root, "ctx", "getRemittanceDestinations", "--json");
  assert.equal(card.status, 0, card.stdout + card.stderr);
  const c = json(card);
  assert.deepStrictEqual(c.tests_via, [{ file: "client/tests/unit/views/remittance/CreateRecipient.spec.js", via: "CreateRecipient.fetchDestinations" }]);
  assert.ok(c.tests.includes(c.tests_via[0].file), "tests carries the via file too");
  assert.match(c.card, /\n {2}tests \(via callers\) client\/tests\/unit\/views\/remittance\/CreateRecipient\.spec\.js ← CreateRecipient\.fetchDestinations/);
  assert.deepStrictEqual(c.coverage, { verdict: "full", files: 2, gaps: [] });
  assert.match(c.card, /\n {2}coverage full · 2 files/);
  assert.ok(!c.anchors, "no --anchors, no anchors");

  const one = json(graph(root, "ctx", "getRemittanceDestinations", "--anchors", "--json"));
  const two = json(graph(root, "ctx", "--for-slice", HELPER, CALLER, "--focus=getRemittanceDestinations", "--anchors", "--json"));
  assert.ok(one.anchors && two.anchors, "both answers carry anchors");
  assert.deepStrictEqual(one.anchors.lines, two.anchors.lines);
  assert.equal(one.anchors_card, two.card, "anchors_card is the for-slice anchor block");
  assert.match(one.line.split("\n")[0], / · anchors \d+ ranges$/);
  const rows = fs.readFileSync(path.join(root, ".claude", "orc", "graph", "gain.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(rows[rows.length - 2].cmd, "anchors", "the one-symbol anchors read is metered as anchors");
});

test("R11b — a spec that only IMPORTS the caller's file is a test via that file", () => {
  const { root } = vueRepo({
    extra: {
      "client/src/utils/fmtLabel.js": ["export function fmtLabel(x) {", "  return String(x);", "}", ""].join("\n"),
      "client/src/utils/useLabel.js": ["import { fmtLabel } from '@/utils/fmtLabel';", "", "export function showLabel(x) {", "  return fmtLabel(x);", "}", ""].join("\n"),
      "client/tests/unit/utils/labelMount.spec.js": ["import { showLabel } from '@/utils/useLabel';", "", "describe('label', () => {", "  it('mounts', () => expect(1).toBe(1));", "});", ""].join("\n"),
    },
  });
  const c = json(graph(root, "ctx", "fmtLabel", "--json"));
  assert.deepStrictEqual(c.tests_via, [{ file: "client/tests/unit/utils/labelMount.spec.js", via: "client/src/utils/useLabel.js" }], c.card);
  assert.ok(c.tests.includes("client/tests/unit/utils/labelMount.spec.js"));
});
