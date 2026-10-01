"use strict";
// @test-pool spawn  — runs the installed status-line hook (runHook)
// v2.0.4 round B: the trimmed-row fix (D1), unknown bars (D2), the one-cell
// minimum (D3), the live spark (D4), the one free column (D5), sprites,
// weather — engine, hook series and the fetcher's pure half. No network.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const R = require("../templates/hooks/orc-statusline-render.js");
const W = require("../templates/hooks/orc-weather-fetch.js");
const { REPO, rmrf, runHook } = require("./_helpers.js");

const ESC = String.fromCharCode(27);
const RED = ESC + "[31m";
const BB = "⠀";

function ctx(extra) {
  return Object.assign(
    { payload: {}, ledger: {}, scan: {}, derived: { verdict: "ready", reasons: [], version: "x" }, now: 0, cols: 20, env: {} },
    extra || {}
  );
}
function prog(ops, extra) {
  return Object.assign(
    { ansi: "on", formats: [{}], ramps: [], glyphsets: [{ fill: "#", empty: ".", on: "o", off: "-", spark: ["a", "b", "c"], ascii: { fill: "#" } }], statemaps: [], lines: [{ ops }] },
    extra || {}
  );
}
const lit = (t) => ({ op: "lit", t });
const item = (id, children, more) => Object.assign({ op: "item", id, children }, more || {});
const run = (ops, c, extra) => R.render(prog(ops, extra), ctx(c)).text;

// ── D1 ──
test("D1: caption row and prefixed row start with U+2800; ASCII keeps a space; ESC row unchanged", () => {
  const cap = [item("a", [lit("x"), lit("value")], { sw: 1, cap: { pos: "below", ops: [lit("cap")] } })];
  assert.strictEqual(run(cap), "xvalue\n" + BB + "cap");
  const pre = R.render(Object.assign(prog([item("a", [lit("v")])]), { lines: [{ prefix: "  ", ops: [item("a", [lit("v")])] }] }), ctx()).text;
  assert.strictEqual(pre, BB + " v");
  assert.strictEqual(run(cap, { env: { ORC_STATUSLINE_ASCII: "1" } }), "xvalue\n cap");
  const esc = R.render(Object.assign(prog([]), { lines: [{ prefix: RED + " ", ops: [item("a", [lit("v")])] }] }), ctx()).text;
  assert.strictEqual(esc, RED + " v");
});

// ── D2 ──
test("D2: null on blocks/meter/dots gives the dash form at width; gauge a single dash", () => {
  for (const k of ["blocks", "meter", "dots", "fine", "gradient"]) {
    assert.strictEqual(run([item("a", [{ op: "bar", k, b: "ctx.used_pct", g: 0, w: 5 }])]), "—    ", k);
  }
  assert.strictEqual(run([item("a", [{ op: "bar", k: "gauge", b: "ctx.used_pct", g: 0 }])]), "—");
  assert.strictEqual(run([item("a", [{ op: "bar", k: "blocks", b: "ctx.used_pct", g: 0, w: 3 }])], { env: { ORC_STATUSLINE_ASCII: "1" } }), "-  ");
});

// ── D3 ──
test("D3: 6% on blocks width 10 fills one cell", () => {
  const c = { payload: { context_window: { used_percentage: 6 } } };
  assert.strictEqual(run([item("a", [{ op: "bar", k: "blocks", b: "ctx.used_pct", g: 0, w: 10 }])], c), "#.........");
  assert.strictEqual(run([item("a", [{ op: "bar", k: "dots", b: "ctx.used_pct", g: 0, w: 10 }])], c), "o---------");
  const z = { payload: { context_window: { used_percentage: 0 } } };
  assert.strictEqual(run([item("a", [{ op: "bar", k: "blocks", b: "ctx.used_pct", g: 0, w: 4 }])], z), "....");
});

// ── D4 engine ──
test("D4: spark with an empty series and a number draws one point; no number → dash", () => {
  const c = { payload: { cost: { total_cost_usd: 1.5 } } };
  const one = run([item("a", [{ op: "series", k: "spark", s: "cost", b: "cost.usd", g: 0, w: 4 }])], c);
  assert.strictEqual(one, BB + "  a");
  assert.strictEqual(run([item("a", [{ op: "series", k: "spark", s: "cost", b: "cost.usd", g: 0, w: 4 }])]), "—   ");
  const br = run([item("a", [{ op: "series", k: "spark-braille", s: "cost", b: "cost.usd", g: 0, w: 5 }])], Object.assign({ ledger: { series: { cost: [1, 2] } } }, c));
  assert.strictEqual([...br].length, 5);
  assert.strictEqual(run([item("a", [{ op: "series", k: "trend", s: "cost", g: 0 }])], { ledger: { series: { cost: [3] } } }), "—");
});

// ── D5 ──
test("D5: flex leaves one column free", () => {
  const t = run([item("a", [lit("l")]), { op: "flex", w: 1, min: 1 }, item("b", [lit("r")])]);
  assert.strictEqual(R.cellWidth(t), 19);
});

// ── sprites ──
const sp = (more) => [item("a", [Object.assign({ op: "sprite", w: 6, mode: "run", ms: 1000, f: ["AB", "CD"], a: ["ab", "cd"], ahead: "", behind: "" }, more)])];
// A base tick that is a multiple of every cycle here (run 7 x 2 frames, bounce 8), and not 0 (0 is "now").
const T0 = 840000;
const at = (s) => s.replace(/^⠀/, " ");
test("sprite run: enters from the left, clips at both edges, exact width", () => {
  // travel = w + fw - 1 = 7, x = tick % 7 - 1: the sprite always shows at least one cell.
  // tick 0: x = -1 (right half); tick 1: x = 0; tick 3: x = 2.
  assert.strictEqual(at(run(sp(), { now: T0 + 0 })), "B     ");
  assert.strictEqual(at(run(sp(), { now: T0 + 1000 })), "CD    ");
  assert.strictEqual(at(run(sp(), { now: T0 + 3000 })), "  CD  ");
  // tick 6: x = 5 → only the left cell shows.
  assert.strictEqual(at(run(sp(), { now: T0 + 6000 })), "     A");
  for (let t = 0; t < 14; t++) {
    const row = at(run(sp(), { now: T0 + t * 1000 }));
    assert.strictEqual([...row].length, 6);
    assert.ok(row.trim() !== "", "tick " + t + " renders an all-blank track");
  }
});
test("sprite bounce and idle positions", () => {
  // span 4: tick 2 → x 2, tick 6 → x 2 (on the way back), tick 4 → x 4.
  assert.strictEqual(at(run(sp({ mode: "bounce" }), { now: T0 + 2000 })), "  AB  ");
  assert.strictEqual(at(run(sp({ mode: "bounce" }), { now: T0 + 4000 })), "    AB");
  assert.strictEqual(at(run(sp({ mode: "bounce" }), { now: T0 + 6000 })), "  AB  ");
  assert.strictEqual(run(sp({ mode: "idle" }), { now: T0 + 5000 }), "CD    ");
});
test("sprite fillers, ASCII frames, MOTION=0", () => {
  assert.strictEqual(run(sp({ ahead: "·", behind: "_" }), { now: T0 + 4000 }), "___AB·");
  assert.strictEqual(run(sp({ mode: "idle" }), { now: T0 + 1000, env: { ORC_STATUSLINE_ASCII: "1" } }), "cd    ");
  assert.strictEqual(run(sp(), { now: T0 + 3000, env: { ORC_STATUSLINE_MOTION: "0" } }), "AB    ");
  assert.ok(R.OPS.sprite);
});

// ── weather bindings ──
test("weather bindings read c.scan.weather, metric and us", () => {
  const scan = { weather: { temp_c: 21, temp_f: 70, state: "rain", desc: "Light rain" } };
  const v = (b, p) => run([item("a", [{ op: "val", b, f: 0, p }])], { scan });
  assert.strictEqual(v("weather.temp", { units: "metric" }), "21");
  assert.strictEqual(v("weather.temp", { units: "us" }), "70");
  assert.strictEqual(v("weather.state", {}), "rain");
  assert.strictEqual(v("weather.desc", {}), "Light rain");
  assert.strictEqual(run([item("a", [{ op: "val", b: "weather.temp", f: 0 }])]), "—");
});

// ── the fetcher's pure half ──
test("fetcher: weatherCode → state, and sanitising", () => {
  const map = { 113: "sun", 116: "partly", 122: "cloud", 248: "fog", 389: "storm", 338: "snow", 296: "rain", 176: "rain" };
  for (const k of Object.keys(map)) assert.strictEqual(W.stateOf(k), map[k], k);
  assert.strictEqual(W.stateOf("999", "Smoky haze"), "fog");
  assert.strictEqual(W.stateOf("999", "Something new"), "cloud");
  assert.strictEqual(W.stateOf("302", "Heavy rain"), "rain");
  assert.strictEqual(W.clean("a" + ESC + "[31mb\u0085c"), "a[31mbc");
  assert.strictEqual(W.clean("x".repeat(40)).length, 24);
  const rec = W.record({ current_condition: [{ temp_C: "12", temp_F: "54", weatherCode: "113", weatherDesc: [{ value: "Sunny" + ESC }] }] }, 5);
  assert.deepStrictEqual(rec, { at: 5, temp_c: 12, temp_f: 54, state: "sun", desc: "Sunny" });
  assert.strictEqual(W.record({}, 1), null);
});

// ── the hook's series ──
test("hook: the first sample is taken at once and burn + speed are recorded", () => {
  const SRC = path.join(REPO, "templates", "hooks");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orc-motion-"));
  try {
    const claudeDir = path.join(root, ".claude");
    const hooks = path.join(claudeDir, "hooks");
    const orc = path.join(claudeDir, "orc");
    fs.mkdirSync(hooks, { recursive: true });
    fs.mkdirSync(orc, { recursive: true });
    for (const f of ["orc-statusline.js", "orc-statusline-render.js", "orc-subagent-line.js", "orc-update-lib.js"])
      fs.copyFileSync(path.join(SRC, f), path.join(hooks, f));
    fs.writeFileSync(path.join(hooks, "orc-version.json"), JSON.stringify({ version: "1.0.0" }));
    fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "statusline_custom: on\n");
    const p = { schema: 1, formats: [{}], glyphsets: [{ fill: "#", empty: "." }], statemaps: [], ramps: [], lines: [{ ops: [item("a", [lit("X")])] }] };
    fs.writeFileSync(path.join(orc, "statusline-compiled.json"), JSON.stringify(p));
    fs.writeFileSync(path.join(orc, "statusline.lock.json"), JSON.stringify({ orc_version: "1.0.0", bindings: [], providers: [], series: ["burn", "speed", "cost"], max_per_line: 6 }));
    const now = Date.now();
    const started = now - 3600000;
    fs.writeFileSync(path.join(orc, "usage-session.json"), JSON.stringify({
      session_id: "m", started_at: started, series_at: now,
      five_hour: { baseline: 10, last: 30, accumulated: 0 }, tok: { input: 360000 },
    }));
    const r = runHook(claudeDir, "orc-statusline.js", { cwd: root, session_id: "m", cost: { total_cost_usd: 0.42 } }, { ORC_STATUSLINE_SCAN_MS: "0", ORC_STATUSLINE_NO_NET: "1" });
    assert.match(r.stdout, /X/);
    const led = JSON.parse(fs.readFileSync(path.join(orc, "usage-session.json"), "utf8"));
    assert.ok(led.series, JSON.stringify(led));
    assert.deepStrictEqual(led.series.cost, [0.42]);
    assert.strictEqual(led.series.burn.length, 1);
    assert.ok(Math.abs(led.series.burn[0] - 20) <= 1, String(led.series.burn));
    assert.strictEqual(led.series.speed.length, 1);
    assert.ok(Math.abs(led.series.speed[0] - 100) <= 1, String(led.series.speed));
  } finally {
    rmrf(root);
  }
});

test("plan: the engine drops nothing when cols >= the widest static_width", () => {
  const p = prog([], {
    ansi: "off",
    lines: [{ static_width: 10, ops: [item("a", [lit("AAAAA")])] }, { static_width: 100, ops: [item("b", [lit("B")])] }],
    plans: [{ cols: 0, drop: [] }, { cols: 72, drop: ["b"] }],
  });
  assert.strictEqual(R.render(p, ctx({ cols: 140 })).text, "AAAAA\nB");
  assert.strictEqual(R.render(p, ctx({ cols: 100 })).text, "AAAAA\nB");
  assert.strictEqual(R.render(p, ctx({ cols: 60 })).text, "AAAAA");
});
