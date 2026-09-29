"use strict";
// @test-pool spawn  — shells node bin/cli.js
//
// THE PETS, THE WEATHER AND THE REFRESH TIMER (v2.0.4, round B). The CLI half:
// every pet compiles to a `sprite` op whose frames are all one width of 1-cell
// glyphs, motion asks for a 1-second timer, the weather parts say what to
// fetch, and `refresh` edits the settings file that holds ORC's hook.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { REPO, cli, rmrf, freshInstall } = require("./_helpers.js");

const { cellWidth } = require(path.join(REPO, "templates", "hooks", "orc-statusline-render.js"));

function slj(root, args) {
  const r = cli(["statusline", ...args, "--dir", root, "--json"]);
  let j = null;
  try {
    j = JSON.parse(r.stdout);
  } catch (_) {}
  return { status: r.status, json: j, raw: r.stdout, err: r.stderr };
}
function readOrc(root, f) {
  return JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", f), "utf8"));
}
function flat(ops, out) {
  out = out || [];
  for (const o of ops || []) {
    out.push(o);
    if (o.children) flat(o.children, out);
  }
  return out;
}
const allOps = (c) => flat([].concat(...c.lines.map((l) => l.ops)));
const PETS = ["pet-cat", "pet-mouse", "pet-chase", "pet-cat-text", "pet-pacman", "pet-fish", "pet-bird", "pet-dog"];

test("statusline pets: every pet validates on run, bounce and idle, and compiles to one sprite op", () => {
  const { root } = freshInstall();
  try {
    const cat = slj(root, ["components"]).json;
    assert.strictEqual(cat.groups.M, "Pets and motion");
    for (const id of PETS) {
      const c = cat.components.find((x) => x.id === id);
      assert.ok(c, id + " is in the catalogue");
      assert.strictEqual(c.group, "M");
      assert.deepStrictEqual(c.renderers, ["run", "bounce", "idle"]);
      for (const mode of ["run", "bounce", "idle"]) {
        slj(root, ["reset"]);
        const r = slj(root, ["set", "1", "1", id, "--render", mode]);
        assert.strictEqual(r.status, 0, `${id}/${mode}: ${r.raw}${r.err}`);
        const ops = allOps(readOrc(root, "statusline-compiled.json")).filter((o) => o.op === "sprite");
        assert.strictEqual(ops.length, 1, `${id}/${mode} compiles to one sprite op`);
        const op = ops[0];
        assert.strictEqual(op.mode, mode);
        assert.strictEqual(op.w, 16);
        for (const set of [op.f, op.a]) {
          const w0 = cellWidth(set[0]);
          for (const fr of set) {
            assert.strictEqual(cellWidth(fr), w0, `${id}: every frame has the same width`);
            for (const ch of fr) assert.strictEqual(cellWidth(ch), 1, `${id}: "${ch}" is one cell`);
          }
        }
        assert.strictEqual(readOrc(root, "statusline.lock.json").needs_refresh_interval, 1, "motion asks for a 1-second timer");
      }
    }
  } finally {
    rmrf(root);
  }
});

test("statusline pets: the speed parameter scales the frame time, and the bird keeps its backslash", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["reset"]);
    assert.strictEqual(slj(root, ["set", "1", "1", "pet-bird", "--param", "speed=slow"]).status, 0);
    const op = allOps(readOrc(root, "statusline-compiled.json")).find((o) => o.op === "sprite");
    assert.strictEqual(op.ms, 1200);
    assert.strictEqual(op.f[0], "\\v/");
  } finally {
    rmrf(root);
  }
});

test("statusline pets: preview --frames 4 returns four texts and the pet moves", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["reset"]);
    slj(root, ["set", "1", "1", "pet-cat"]);
    const r = slj(root, ["preview", "--frames", "4"]);
    assert.strictEqual(r.status, 0, r.raw + r.err);
    assert.strictEqual(r.json.frames.length, 4);
    assert.strictEqual(r.json.frames[0], r.json.text, "frame 0 is the text");
    assert.strictEqual(new Set(r.json.frames).size, 4, "the pet moves between frames");
    assert.strictEqual(slj(root, ["preview", "--frames", "99"]).status, 2, "25+ frames is refused");
    const s = slj(root, ["show"]).json;
    assert.strictEqual(s.animated, true);
    assert.strictEqual(s.needs_refresh, 1);
  } finally {
    rmrf(root);
  }
});

test("statusline weather: the parts carry p, name scan.weather, and take their unit suffix", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["reset"]);
    assert.strictEqual(slj(root, ["set", "1", "1", "weather", "--param", "location=Jakarta"]).status, 0);
    assert.strictEqual(slj(root, ["set", "1", "2", "weather-icon"]).status, 0);
    assert.strictEqual(slj(root, ["set", "1", "3", "weather-desc"]).status, 0);
    let c = readOrc(root, "statusline-compiled.json");
    const items = c.lines[0].ops.filter((o) => o.op === "item").slice(0, 3);
    for (const it of items) {
      assert.ok(it.p && "location" in it.p && it.p.units === "metric", "item op carries p: " + JSON.stringify(it));
      const inner = flat(it.children).find((o) => o.op === "val" || o.op === "state");
      assert.deepStrictEqual(inner.p, it.p, "the value/state op carries the same p");
    }
    assert.strictEqual(items[0].p.location, "Jakarta");
    assert.ok(readOrc(root, "statusline.lock.json").providers.includes("scan.weather"));
    const valOf = (cc) => flat(cc.lines[0].ops[0].children).find((o) => o.op === "val");
    assert.strictEqual(c.formats[valOf(c).f].suffix, "°C");
    assert.strictEqual(slj(root, ["set", "1", "1", "weather", "--param", "units=us"]).status, 0);
    c = readOrc(root, "statusline-compiled.json");
    assert.strictEqual(c.formats[valOf(c).f].suffix, "°F");
    const bad = slj(root, ["set", "1", "1", "weather", "--param", "location=Ja\u001bkarta"]);
    assert.notStrictEqual(bad.status, 0, "a control character in the location is refused");
    assert.ok(/control character/.test(bad.raw + bad.err), bad.raw + bad.err);
  } finally {
    rmrf(root);
  }
});

test("statusline refresh: sets and removes refreshInterval in the hook's own settings.json", () => {
  const { root } = freshInstall();
  try {
    const sp = path.join(root, ".claude", "settings.json");
    const on = slj(root, ["refresh", "1"]);
    assert.strictEqual(on.status, 0, on.raw + on.err);
    assert.strictEqual(path.resolve(on.json.settings), path.resolve(sp));
    assert.strictEqual(JSON.parse(fs.readFileSync(sp, "utf8")).statusLine.refreshInterval, 1);
    assert.strictEqual(slj(root, ["show"]).json.refresh_interval, 1);
    assert.strictEqual(slj(root, ["refresh", "off"]).status, 0);
    const st = JSON.parse(fs.readFileSync(sp, "utf8"));
    assert.ok(!("refreshInterval" in st.statusLine), "off removes the key");
    assert.ok(st.statusLine.command, "the rest of the object is kept");
    assert.strictEqual(slj(root, ["show"]).json.refresh_interval, null);
    assert.strictEqual(slj(root, ["refresh", "61"]).status, 2);
  } finally {
    rmrf(root);
  }
});

test("statusline fixture: the healthy fixture has a series for every series a component declares", () => {
  const { root } = freshInstall();
  try {
    const cat = slj(root, ["components"]).json;
    const cat2 = slj(root, ["components", "--board", "subagent"]).json;
    const want = new Set(cat.components.concat(cat2.components).map((c) => c.series).filter(Boolean));
    // The fixture is read through the preview of a spark per series component.
    for (const c of cat.components.filter((x) => x.series && x.renderers.includes("spark"))) {
      const t = c.previews.spark;
      assert.ok(t && /[▁▂▃▄▅▆▇█]/.test(t), `${c.id} (${c.series}) draws a spark: ${JSON.stringify(t)}`);
      want.delete(c.series);
    }
    assert.deepStrictEqual([...want], [], "series with no spark preview to check");
  } finally {
    rmrf(root);
  }
});
test("statusline pets: pac-man under ORC_STATUSLINE_ASCII=1 emits only ASCII", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["reset"]);
    slj(root, ["set", "1", "1", "pet-pacman"]);
    const r = slj(root, ["preview"]);
    assert.strictEqual(r.status, 0, r.raw + r.err);
    const t = r.json.strippings.ascii;
    assert.ok(t.includes("C") || t.includes("O"), "pac-man is in the ASCII text");
    assert.deepStrictEqual([...t].filter((ch) => ch.codePointAt(0) > 0x7e && ch !== "\n"), [], "no byte above 0x7E");
  } finally {
    rmrf(root);
  }
});

test("statusline responsive plan: a wide line 2 never drops a part from a short line 1", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["reset"]);
    for (const [p, id] of [[2, "pet-cat"], [3, "pet-dog"], [4, "pet-fish"], [5, "pet-bird"]]) {
      assert.strictEqual(slj(root, ["set", "2", String(p), id]).status, 0, id);
    }
    const c = readOrc(root, "statusline-compiled.json");
    const lineOf = new Map();
    c.lines.forEach((l, li) => { for (const o of flat(l.ops)) if (o.op === "item") lineOf.set(o.id, li); });
    assert.ok(c.lines[1].static_width > 72 && c.lines[0].static_width < 60, JSON.stringify(c.lines.map((l) => l.static_width)));
    assert.ok(c.plans.some((p) => p.drop.length), "line 2 has a plan");
    for (const p of c.plans) for (const id of p.drop) assert.ok(c.lines[lineOf.get(id)].static_width > p.cols, `plan ${p.cols} drops ${id} from a line that fits`);
    const strip = (t) => t.replace(/\u001b\[[0-9;]*m/g, "");
    const wide = strip(slj(root, ["preview", "--width", "140"]).json.text).split("\n");
    const narrow = strip(slj(root, ["preview", "--width", "60"]).json.text).split("\n");
    assert.strictEqual(narrow[0], wide[0], "line 1 fits 60 and keeps every part");
    assert.ok(wide[1].includes("/"), "at 140 line 2 keeps the bird");
    assert.ok(cellWidth(narrow[1]) < cellWidth(wide[1]), "at 60 line 2 drops");
  } finally {
    rmrf(root);
  }
});
