"use strict";
// @test-pool spawn  — calls bin/webui/api.js in-process, which may shell the CLI; does not bind a port
// The CLI Hook Interface fixes: a clear reaches the write, Apply stops at the
// first refusal, the gate card reads `show.hook`, chips prefer the item's own
// sample, and "shared" is the CLI's inherit token.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { panelJs, i18nTable } = require("../_helpers.js");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("hookui set route: a present empty or null key forwards <flag> \"\", an absent key forwards nothing", () => {
  const { WRITES } = require("../../bin/webui/api.js");
  const set = WRITES["/api/statusline/set"];
  const argv = set({ line: 1, pos: 2, label: "", width: null, prefix: "x" });
  const at = (f) => argv.indexOf(f);
  assert.ok(at("--label") > -1 && argv[at("--label") + 1] === "", argv.join(" "));
  assert.ok(at("--width") > -1 && argv[at("--width") + 1] === "");
  assert.strictEqual(argv[at("--prefix") + 1], "x");
  assert.strictEqual(at("--suffix"), -1);
  assert.strictEqual(at("--color"), -1);
});

test("hookui apply: stopOnFail is implemented in 06-edit.js and used by the panel", () => {
  const edit = read("bin/webui/js/06-edit.js");
  assert.match(edit, /async function applyActions\(edits, button, opts\)/);
  assert.match(edit, /o\.stopOnFail && failed\.length[\s\S]*?break;/);
  assert.match(panelJs("hookui"), /applyActions\(edits, b, \{ stopOnFail: true/);
});

test("hookui panel: gate card reads show.hook, chipSample prefers src.sample, shared uses cat.inherit_token", () => {
  const js = panelJs("hookui");
  const gate = js.slice(js.indexOf("function gateCard"), js.indexOf("function cautionCard"));
  assert.match(gate, /show\.hook/);
  assert.match(gate, /h\.fix/);
  const chip = js.slice(js.indexOf("function chipSample"), js.indexOf("function dropTarget"));
  assert.match(chip, /Object\.keys\(item\.over\)\.length === 0 && item\.src && item\.src\.sample/);
  assert.match(js, /cat\.inherit_token/);
  // The only "inherit" literal allowed is the CSS reset for SGR 39 — never the CLI token.
  const lits = [...js.matchAll(/["']inherit["']/g)].map((m) => js.slice(js.lastIndexOf("\n", m.index) + 1, js.indexOf("\n", m.index)).trim());
  assert.deepStrictEqual(lits, ['else if (n === 39) out.color = "inherit";']);
});

test("hookui i18n: the new keys exist in en and id, and all panel keys resolve", () => {
  const en = i18nTable("en");
  const id = i18nTable("id");
  for (const k of ["hookui.shared", "hookui.clearChange", "hookui.notSent", "hookui.notInTerminal", "hookui.hookSkew", "hookui.hookFallback"]) {
    assert.ok(k in en, "en " + k);
    assert.ok(k in id, "id " + k);
  }
  const used = [...panelJs("hookui").matchAll(/\bt\("(hookui\.[a-zA-Z0-9.]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(used.filter((k) => !(k in en) || !(k in id)), []);
});

test("hookui fixtures: every item has a sample and each show has a matching hook", () => {
  const fx = require("../../bin/webui/fixtures/hookui.js");
  assert.strictEqual(fx.components.inherit_token, "inherit");
  for (const s of [fx.show, fx.subShow]) {
    assert.strictEqual(s.hook.match, true);
    for (const l of s.lines) for (const it of l.items) assert.strictEqual(typeof it.sample, "string");
  }
});

test("banners: renderBanners has a generation guard and copies the global finding's own command", () => {
  const js = read("bin/webui/js/05-banners.js");
  const fn = js.slice(js.indexOf("async function renderBanners"));
  assert.match(js, /let bannerGen = 0;/);
  assert.match(fn, /const gen = \+\+bannerGen;/);
  assert.match(fn, /if \(gen !== bannerGen\) return;/);
  assert.match(fn, /renderUpdateBanner\(host, gen\);/);
  const upd = js.slice(js.indexOf("async function renderUpdateBanner(host, gen)"), js.indexOf("async function renderBanners"));
  assert.ok(upd.length > 0, "renderUpdateBanner takes the generation");
  assert.ok(upd.indexOf("if (gen !== bannerGen) return;") > upd.indexOf("await versionInfo()"), "the update banner checks the generation after its await");
  assert.match(fn, /const fixCmd = finding && finding\.fix_command;/);
  assert.ok(!/\.map\(\(f\) => f\.fix_command\)/.test(fn), "never the first fix of any finding");
});

test("hookui gateCard: the fix row matches the banner and the toast says Copied", () => {
  const js = panelJs("hookui");
  const fn = js.slice(js.indexOf("function gateCard"));
  assert.match(fn, /el\("div", "banner-fix"\)/);
  assert.match(fn, /el\("code", "action-cmd", h\.fix\)/);
  assert.match(fn, /copy\(h\.fix, t\("common\.copied"\)\)/);
});
