"use strict";
// @test-pool spawn  — calls bin/webui/api.js in-process, which may shell the CLI; does not bind a port
// v2.0.4 — the redraw timer and the animated preview in the CLI Hook Interface.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { panelJs } = require("../_helpers.js");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const api = require("../../bin/webui/api.js");

test("hookui refresh route: seconds and off reach `statusline refresh`", () => {
  const r = api.WRITES["/api/statusline/refresh"];
  assert.deepStrictEqual(r({ seconds: 5 }).slice(0, 3), ["statusline", "refresh", "5"]);
  assert.deepStrictEqual(r({ seconds: "off" }).slice(0, 3), ["statusline", "refresh", "off"]);
  assert.ok(r({ seconds: 2, board: "subagent" }).join(" ").includes("--board subagent"));
});

test("hookui preview route passes frames and frame_ms; stage-preview forwards them", () => {
  const argv = api.READS["/api/statusline/preview"]({ frames: 12, frame_ms: 1000 });
  assert.strictEqual(argv[argv.indexOf("--frames") + 1], "12");
  assert.strictEqual(argv[argv.indexOf("--frame-ms") + 1], "1000");
  assert.strictEqual(api.READS["/api/statusline/preview"]({}).indexOf("--frames"), -1);
  assert.match(read("bin/webui/api.js"), /if \(b\.frames\) q\.frames = b\.frames;/);
});

test("hookui panel reads show.refresh_interval / show.animated and caps the cycle", () => {
  const js = panelJs("hookui");
  assert.match(js, /show\.refresh_interval/);
  assert.match(js, /show\.animated/);
  assert.match(js, /HK_ANIM_MAX_MS = 20000/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /\/api\/statusline\/refresh/);
});

test("hookui: the animation interval is cleared on every repaint", () => {
  const js = panelJs("hookui");
  assert.match(js, /function hkPaint\(\) \{\s*if \(!HK_SLOT \|\| !HK_DATA\) return;\s*hkAnimStop\(\);/);
  assert.match(js, /function hkAnimStop\(\) \{\s*clearInterval\(HK_ANIM_TIMER\);/);
});

test("hookui motion keys: en and id carry the same keys", () => {
  const en = JSON.parse(read("bin/webui/i18n/en/hookui.json"));
  const id = JSON.parse(read("bin/webui/i18n/id/hookui.json"));
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(id).sort());
  for (const k of ["hookui.animTitle", "hookui.animCost", "hookui.animNeeds"]) assert.ok(en[k] && id[k], k);
});
