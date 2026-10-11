"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v2.2.0 (T1 + T2) — a Vue 2.7 SPA whose code lives under `client/`.
//
// The promises this file holds:
//
//   1. **D1 — `@/` reaches the nearest package `src/`**, through a jest
//      `moduleNameMapper`, a jsconfig `paths`, or a bundler `alias` — and a
//      declared alias wins over the default.
//   2. **No regression on a real clash** — two `getBalance` stay AMBIGUOUS.
//   3. **D5 — a source file never resolves into a test helper.**
//   4. **D6 — a focus word is weighted, never dropped**, and the map ranks
//      every indexed file.
const { test } = require("node:test");
const assert = require("node:assert");
const { cli } = require("../_helpers");
const { vueRepo } = require("./_graph-vue-fixture.js");

const graph = (root, ...a) => {
  const r = cli(["graph", ...a, "--json", "--dir", root]);
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch (_) {
    json = null;
  }
  return { status: r.status, json, stdout: r.stdout };
};

const CREATE = "client/src/views/remittance/recipients/CreateRecipient.vue";

test("D1 — impact of the api file reaches CreateRecipient.vue (jest moduleNameMapper / nearest src)", () => {
  const { root } = vueRepo();
  const r = graph(root, "impact", "client/src/api/remittance.api.js");
  assert.equal(r.status, 0, r.stdout);
  const direct = r.json.callers.filter((c) => c.depth === 1).map((c) => c.file);
  assert.ok(direct.includes(CREATE), JSON.stringify(direct));
});

test("D1 — the same through a jsconfig.json `paths` entry", () => {
  const { root } = vueRepo({
    extra: { "client/jsconfig.json": '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}\n' },
  });
  const r = graph(root, "impact", "client/src/api/remittance.api.js");
  assert.equal(r.status, 0, r.stdout);
  const direct = r.json.callers.filter((c) => c.depth === 1).map((c) => c.file);
  assert.ok(direct.includes(CREATE), JSON.stringify(direct));
});

test("D1 — a declared bundler alias wins over the default src/", () => {
  const { root } = vueRepo({
    extra: {
      "client/vue.config.js": [
        "const path = require('path');",
        "",
        "module.exports = {",
        "  configureWebpack: {",
        "    resolve: {",
        "      alias: { '@': path.resolve(__dirname, 'app') },",
        "    },",
        "  },",
        "};",
        "",
      ].join("\n"),
      "client/app/x.js": ["export function hello() {", "  return 'hi';", "}", ""].join("\n"),
      "client/src/y.js": ["import { hello } from '@/x';", "", "export function greet() {", "  return hello();", "}", ""].join("\n"),
    },
  });
  const r = graph(root, "ctx", "hello");
  assert.equal(r.status, 0, r.stdout);
  const files = r.json.callers.map((c) => c.file);
  assert.ok(files.includes("client/src/y.js"), JSON.stringify(files));
});

test("no regression — a getBalance clash stays AMBIGUOUS; the file#name form answers", () => {
  const { root } = vueRepo();
  const a = graph(root, "ctx", "getBalance");
  assert.equal(a.status, 4, a.stdout);
  const files = a.json.candidates.map((c) => c.file).sort();
  assert.deepStrictEqual(files, ["client/src/api/balance.api.js", "client/src/api/disbursement.api.js"]);
  const b = graph(root, "ctx", "client/src/api/balance.api.js#getBalance");
  assert.equal(b.status, 0, b.stdout);
  assert.equal(b.json.target.file, "client/src/api/balance.api.js");
});

test("D5 — a source file never resolves a bare name into a test helper", () => {
  const { root } = vueRepo({
    extra: { "client/src/z.js": ["export function run() {", "  return t('k');", "}", ""].join("\n") },
  });
  const a = graph(root, "ctx", "client/tests/unit/utils/DigitalAssets.spec.js#t");
  assert.equal(a.status, 0, a.stdout);
  const callerFiles = a.json.callers.map((c) => c.file);
  assert.ok(!callerFiles.includes("client/src/z.js"), JSON.stringify(callerFiles));
  const b = graph(root, "ctx", "client/src/z.js#run");
  assert.equal(b.status, 0, b.stdout);
  // `t` is UNRESOLVED: no confident call row, one unresolved call counted.
  assert.deepStrictEqual(b.json.calls, [], JSON.stringify(b.json.calls));
  assert.equal(b.json.unresolved, 1);
});

test("D6 — every focus word is weighted, none too common, the focus outranks the hub", () => {
  const { root } = vueRepo();
  const r = graph(root, "map", "--focus", "remittance,recipient", "--budget", "8000");
  assert.equal(r.status, 0, r.stdout);
  const words = r.json.focus_words;
  assert.deepStrictEqual(words.map((w) => w.word).sort(), ["recipient", "remittance"]);
  for (const w of words) {
    assert.ok(w.files > 0 && w.weight > 0 && w.weight <= 1, JSON.stringify(w));
    assert.ok(r.json.card.includes(`${w.word} ${w.files}×${w.weight.toFixed(2)}`), r.json.card);
  }
  assert.ok(!r.json.card.includes("too common"), r.json.card);
  const rank = (f) => r.json.files.findIndex((x) => x.file === f);
  const hub = rank("client/src/constants/config.js");
  assert.ok(rank(CREATE) >= 0 && rank(CREATE) < hub, `CreateRecipient ${rank(CREATE)} vs config ${hub}`);
  assert.ok(rank("client/src/api/remittance.api.js") >= 0 && rank("client/src/api/remittance.api.js") < hub);
  const brief = graph(root, "map", "--focus", "remittance,recipient", "--brief");
  assert.equal(brief.status, 0, brief.stdout);
  assert.ok(!brief.json.card.includes("too common"));
});

test("D6 — the map with no focus ranks every indexed file", () => {
  const { root } = vueRepo();
  const s = graph(root, "status");
  const r = graph(root, "map", "--budget", "8000");
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.json.total_files, s.json.files);
  assert.equal(r.json.shown, s.json.files);
  assert.equal(r.json.files.length, s.json.files);
});

// ── v2.2.0 (T4) — end to end, extract + query, through the CLI ──────────────

const fs = require("fs");
const path = require("path");
const OUTWARD = "client/src/views/remittance/outwardRemittance/OutwardRemittance.vue";
const SELECT = "client/src/views/remittance/components/SelectField.vue";

test("E2E — the template is the caller of onTransferFund (LOCAL)", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "onTransferFund");
  assert.equal(r.status, 0, r.stdout);
  const c = r.json.callers.find((x) => x.qname === "OutwardRemittance.template");
  assert.ok(c && c.state === "LOCAL", JSON.stringify(r.json.callers));
});

test("E2E — SelectField: both tag forms reach it, props and the emit come before the methods", () => {
  const { root } = vueRepo();
  const cls = graph(root, "ctx", `${SELECT}#SelectField`);
  assert.equal(cls.status, 0, cls.stdout);
  assert.ok(cls.json.callers.some((x) => x.qname === "CreateRecipient.template"), JSON.stringify(cls.json.callers));
  const r = graph(root, "ctx", SELECT);
  assert.equal(r.status, 0, r.stdout);
  assert.ok(r.json.importers.includes(CREATE), JSON.stringify(r.json.importers));
  const kinds = r.json.symbols.map((s) => s.kind);
  assert.equal(kinds.filter((k) => k === "prop").length, 6, kinds.join(","));
  assert.ok(r.json.symbols.some((s) => s.kind === "emit" && s.qname === "SelectField.select"));
  const lastContract = Math.max(kinds.lastIndexOf("prop"), kinds.lastIndexOf("emit"));
  assert.ok(lastContract < kinds.indexOf("method"), kinds.join(","));
});

test("E2E — the router file holds VIEW route records, not function symbols for the lazy views", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "client/src/router/index.js");
  assert.equal(r.status, 0, r.stdout);
  const names = r.json.symbols.map((s) => s.qname);
  assert.ok(names.includes("VIEW /outwards"), names.join(","));
  assert.ok(names.includes("VIEW /recipients/create"), names.join(","));
  for (const n of ["OutwardRemittance", "CreateRecipientFlow", "RemittanceLayout"]) {
    assert.ok(!r.json.symbols.some((s) => s.qname === n && s.kind === "function"), n);
  }
  for (const f of [OUTWARD, "client/src/views/remittance/recipients/CreateRecipientFlow.vue", "client/src/containers/RemittanceLayout.vue"]) {
    assert.ok(r.json.imports.includes(f), JSON.stringify(r.json.imports));
  }
  const page = graph(root, "ctx", OUTWARD);
  assert.equal(page.status, 0, page.stdout);
  assert.ok(page.json.importers.includes("client/src/router/index.js"), JSON.stringify(page.json.importers));
});

test("E2E — a route constant reaches its VIEW record; a missing route name is SAID", () => {
  const { root } = vueRepo();
  const a = graph(root, "ctx", "OutwardRemittance.openList");
  assert.equal(a.status, 0, a.stdout);
  const hit = a.json.calls.find((c) => c.state === "ROUTE");
  assert.ok(hit && hit.target.qname === "VIEW /outwards", JSON.stringify(a.json.calls));
  assert.ok(a.json.card.includes("→ route TRANSFER_FUND_ROUTE_NAMES.OUTWARD  VIEW /outwards"), a.json.card);
  const b = graph(root, "ctx", "OutwardRemittance.onTransferFund");
  assert.equal(b.status, 0, b.stdout);
  const miss = b.json.calls.find((c) => c.missing_route === "TransferFund");
  assert.ok(miss && miss.state === "UNRESOLVED", JSON.stringify(b.json.calls));
  assert.ok(b.json.card.includes("→ route TransferFund  NO ROUTE — no record has this name"), b.json.card);
});

test("E2E — fetchDestinations calls the api through @/, never a callee under client/tests/", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "CreateRecipient.fetchDestinations");
  assert.equal(r.status, 0, r.stdout);
  const c = r.json.calls.find((x) => x.name === "getRemittanceDestinations");
  assert.ok(c && c.state === "IMPORT" && c.target.file === "client/src/api/remittance.api.js", JSON.stringify(r.json.calls));
  assert.ok(!r.json.calls.some((x) => x.target && x.target.file.startsWith("client/tests/")), JSON.stringify(r.json.calls));
  // A spec that imports the page is a TEST of it, not a production caller:
  // it may only appear as an IMPORT-state caller and in `tests`.
  for (const x of r.json.callers.filter((y) => y.file.startsWith("client/tests/"))) {
    assert.ok(r.json.tests.includes(x.file), JSON.stringify(r.json.callers));
  }
});

test("E2E — path runs CTA → route → page (a symbol end, and a file end)", () => {
  const { root } = vueRepo();
  const asFile = graph(root, "path", "OutwardRemittance.openList", OUTWARD);
  // v2.2.0 (T6b): a FILE end means any symbol in that file.
  assert.equal(asFile.status, 0, "a file end is any symbol in the file");
  const r = graph(root, "path", "OutwardRemittance.openList", `${OUTWARD}#OutwardRemittance`);
  assert.equal(r.status, 0, r.stdout);
  assert.ok(r.json.card.includes("VIEW /outwards"), r.json.card);
});

test("E2E — the sharded read equals the full read (route calls decline to full)", () => {
  const { root, claudeDir } = vueRepo();
  const qs = ["OutwardRemittance.onTransferFund", "CreateRecipient.fetchDestinations", "OutwardRemittance.openList"];
  const fast = {};
  for (const q of qs) fast[q] = graph(root, "ctx", q).json;
  assert.equal(fast["CreateRecipient.fetchDestinations"].read, "sharded");
  const shards = path.join(claudeDir, "orc", "graph", "resolved");
  fs.renameSync(shards, shards + "-bak");
  for (const q of qs) {
    const full = graph(root, "ctx", q).json;
    assert.equal(full.read, "full", q);
    assert.equal(fast[q].card, full.card, q);
    assert.deepEqual(fast[q].calls, full.calls, q);
    assert.deepEqual(fast[q].callers, full.callers, q);
  }
});

// ── T6b — map focus that beats hubs, test rows out of impact, path to a file ──

test("T6b map — a focus word equal to a symbol name stays a WORD, and the focused files beat the hub", () => {
  const { root } = vueRepo();
  const m = graph(root, "map", "--focus=remittance,recipient,swap").json;
  const words = m.focus_words.map((w) => w.word);
  for (const w of ["remittance", "recipient", "swap"]) assert.ok(words.includes(w), `${w} is on the words line`);
  assert.ok(m.focus_words.every((w) => w.kind === "word"));
  const rank = (f) => m.files.findIndex((x) => x.file === f);
  const hub = rank("client/src/constants/config.js");
  for (const f of ["client/src/views/remittance/recipients/CreateRecipient.vue", "client/src/views/digitalAssets/components/modals/SwapSelectionsModal.vue"]) {
    assert.ok(rank(f) !== -1 && (hub === -1 || rank(f) < hub), `${f} above config.js`);
  }
  const camel = graph(root, "map", "--focus=calcSource").json;
  assert.deepStrictEqual(camel.focus_words.map((w) => [w.word, w.kind]), [["calc", "name"], ["source", "name"]]);
});

test("T6b impact — a caller in a test file is a `tests` entry, never a caller row", () => {
  const { root } = vueRepo();
  const r = graph(root, "impact", "client/src/api/remittance.api.js").json;
  assert.ok(r.tests.some((t) => t.endsWith("CreateRecipient.spec.js")), JSON.stringify(r.tests));
  assert.ok(!r.callers.some((c) => /\.spec\.js$/.test(c.file)), "no test file among the caller rows");
  assert.match(r.card, /\n {2}tests {2}\d+ files: /);
});

test("T6b path — a file as an end means any symbol in it", () => {
  const { root } = vueRepo();
  const r = graph(root, "path", "OutwardRemittance.openList", "client/src/views/remittance/outwardRemittance/OutwardRemittance.vue");
  assert.equal(r.status, 0, JSON.stringify(r.json));
});

// ── v2.2.0 (R7) — padded ranges, and a .vue ref gives its contract ─────────
test("R7 anchors — a .vue ref adds its props/emits contract; ranges are padded and clipped to the owner", () => {
  const { root } = vueRepo();
  const r = graph(root, "ctx", "--for-slice", CREATE, "--focus=select,field,recipient", `--refs=${SELECT}`, "--anchors", "--brief");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.json.card, /props\/emits/, r.json.card);
  assert.match(r.json.card, /\nread all: /);
  const props = graph(root, "ctx", SELECT).json.symbols.filter((s) => s.kind === "prop" || s.kind === "emit");
  const lo = Math.min(...props.map((s) => s.lines[0]));
  const hi = Math.max(...props.map((s) => s.lines[1]));
  const row = r.json.card.split("\n").find((l) => l.startsWith(`${SELECT}:`)) || "";
  const m = row.slice(SELECT.length).match(/^:(\d+)-(\d+)/);
  assert.ok(m && Number(m[1]) <= lo && Number(m[2]) >= hi, r.json.card);
  // clipped to the owner block SelectField (never above its first line)
  const owner = graph(root, "ctx", `${SELECT}#SelectField`).json;
  const first = (owner.symbol || owner.target || {}).lines ? (owner.symbol || owner.target).lines[0] : 1;
  assert.ok(Number(m[1]) >= first, `${m[1]} < ${first}`);
  assert.ok(r.json.anchors.read_tokens <= 2500);
});

test("R7 map — a --json --brief map answer keeps only the small keys and stays under 2 KB", () => {
  const { root } = vueRepo();
  const r = graph(root, "map", "--focus=outward,remittance,select", "--budget", "300", "--brief");
  assert.equal(r.status, 0, r.stdout);
  assert.ok(Buffer.byteLength(r.stdout) <= 2048, String(Buffer.byteLength(r.stdout)));
  const keep = new Set(["ok", "state", "line", "trace", "generation", "card", "counts"]);
  for (const k of Object.keys(r.json)) assert.ok(keep.has(k), `kept ${k}`);
  assert.ok(Buffer.byteLength(r.json.card) <= 1300, String(Buffer.byteLength(r.json.card)));
});
