"use strict";
// @test-pool spawn  — shells node bin/cli.js
//
// THE STATUS-LINE DESIGN FIELDS (v2.0.4). The CLI half: every new flag is
// stored and read back, every free text is checked for control characters,
// and the compiler emits the ops the shared contract names. A layout that sets
// none of the new fields must compile to the same ops as before.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall } = require("./_helpers.js");

function slj(root, args) {
  const r = cli(["statusline", ...args, "--dir", root, "--json"]);
  let j = null;
  try {
    j = JSON.parse(r.stdout);
  } catch (_) {}
  return { status: r.status, json: j, raw: r.stdout, err: r.stderr };
}
function compiled(root, board) {
  const f = board === "subagent" ? "subagent-compiled.json" : "statusline-compiled.json";
  return JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", f), "utf8"));
}
function flat(ops, out) {
  out = out || [];
  for (const o of ops) {
    out.push(o);
    if (o.children) flat(o.children, out);
  }
  return out;
}
const strip = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");

test("statusline design: every new flag round-trips through show --json and clears with \"\"", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    const flags = [
      ["--label-pos", "label_pos", "after", "after"],
      ["--value-pos", "value_pos", "after", "after"],
      ["--caption", "caption", "hi {value}", "hi {value}"],
      ["--caption-pos", "caption_pos", "above", "above"],
      ["--caption-align", "caption_align", "center", "center"],
      ["--caption-color", "caption_color", "cyan", "cyan"],
      ["--caption-case", "caption_case", "small", "small"],
      ["--fill-color", "fill_color", "#112233", "#112233"],
      ["--empty-color", "empty_color", "red", "red"],
      ["--ramp-colors", "ramp_colors", "green,red", ["green", "red"]],
      ["--ramp-stops", "ramp_stops", "0,50", [0, 50]],
      ["--fill-char", "fill_char", "=", "="],
      ["--empty-char", "empty_char", "-", "-"],
      ["--brackets", "brackets", "<,>", ["<", ">"]],
      ["--threshold", "threshold", "70", 70],
      ["--align", "align", "left", "left"],
      ["--sign", "sign", "always", "always"],
      ["--max-len", "max_len", "12", 12],
      ["--unknown", "unknown", "hide", "hide"],
      ["--state-color", "color_by_state", "ok=blue", { ok: "blue" }],
    ];
    for (const [f, k, v, want] of flags) {
      const r = slj(root, ["set", "1", "4", f, v]);
      assert.strictEqual(r.status, 0, f + " was refused: " + JSON.stringify(r.json && r.json.errors));
      const it = slj(root, ["show"]).json.lines[0].items[3];
      assert.deepStrictEqual(it[k], want, f + " did not round-trip");
      assert.deepStrictEqual(it.authored[k], want, f + " is not reported as authored");
      assert.strictEqual(slj(root, ["set", "1", "4", f, ""]).status, 0, f + " clear refused");
      assert.ok(!(k in slj(root, ["show"]).json.lines[0].items[3].authored), f + " did not clear");
    }
    // padding is ONE field from two flags.
    slj(root, ["set", "1", "4", "--pad-left", "2", "--pad-right", "1"]);
    assert.deepStrictEqual(slj(root, ["show"]).json.lines[0].items[3].padding, [2, 1]);
    slj(root, ["set", "1", "4", "--pad-left", "", "--pad-right", ""]);
    assert.deepStrictEqual(slj(root, ["show"]).json.lines[0].items[3].padding, []);
    // An absent map is {}, never null.
    const it = slj(root, ["show"]).json.lines[0].items[3];
    assert.deepStrictEqual(it.glyph_by_state, {});
    assert.deepStrictEqual(it.params, {});
    assert.deepStrictEqual(it.ramp_colors, []);
    // The line fields.
    assert.strictEqual(slj(root, ["line", "1", "--align", "right", "--sep-color", "cyan"]).status, 0);
    let l = slj(root, ["show"]).json.lines[0];
    assert.strictEqual(l.align, "right");
    assert.strictEqual(l.sep_color, "cyan");
    assert.ok("prefix" in l);
    slj(root, ["line", "1", "--align", "", "--sep-color", "inherit"]);
    l = slj(root, ["show"]).json.lines[0];
    assert.strictEqual(l.align, "left");
    assert.strictEqual(l.sep_color, null);
  } finally {
    rmrf(root);
  }
});

test("statusline design: the static parts draw, and fill is a flex op", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    assert.strictEqual(slj(root, ["set", "3", "1", "text", "--param", "text=Hi"]).status, 0);
    const pv = slj(root, ["preview"]).json;
    assert.ok(strip(pv.text).split("\n")[2].includes("Hi"), "the text part renders its text: " + JSON.stringify(pv.text));
    slj(root, ["set", "3", "2", "spacer", "--param", "width=3"]);
    slj(root, ["set", "3", "3", "divider", "--param", "text= | "]);
    slj(root, ["set", "3", "4", "icon-static", "--param", "glyph=*"]);
    slj(root, ["set", "3", "5", "fill"]);
    slj(root, ["set", "3", "6", "config", "--param", "key=max_scouts"]);
    const ops = flat(compiled(root).lines[2].ops);
    const lits = ops.filter((o) => o.op === "lit").map((o) => o.t);
    assert.ok(lits.includes("   "), "the spacer draws its width");
    assert.ok(lits.includes(" | "), "the divider draws its text");
    assert.ok(lits.includes("*"), "icon-static draws its glyph");
    assert.ok(ops.some((o) => o.op === "flex" && o.w === 1 && o.min === 1), "fill emits a flex op");
    const cfg = ops.find((o) => o.op === "val" && o.b === "config.value");
    assert.deepStrictEqual(cfg.p, { key: "max_scouts" }, "config carries its key");
    assert.ok(compiled(root).lines[2].ops.some((o) => o.op === "item" && o.p && o.p.key === "max_scouts"));
    // `--param k=` deletes that key.
    slj(root, ["set", "3", "1", "--param", "text="]);
    assert.deepStrictEqual(slj(root, ["show"]).json.lines[2].items[0].params, {});
  } finally {
    rmrf(root);
  }
});

test("statusline design: a control character and a 2-cell fill_char are REFUSED by name", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    const a = slj(root, ["set", "1", "4", "--label", "a\u001b[31mb"]);
    assert.strictEqual(a.status, 1);
    assert.ok(a.json.errors.some((e) => /label on line 1 position 4 holds a control character/.test(e)), JSON.stringify(a.json.errors));
    const b = slj(root, ["set", "1", "4", "--render", "bar-only", "--fill-char", "全"]);
    assert.strictEqual(b.status, 1);
    assert.ok(b.json.errors.some((e) => /fill_char .* line 1 position 4 must be one character of exactly 1 cell/.test(e)), JSON.stringify(b.json.errors));
    const c = slj(root, ["line", "1", "--separator", "\u0007"]);
    assert.strictEqual(c.status, 1, "a control character in a separator is refused");
  } finally {
    rmrf(root);
  }
});

test("statusline design: a caption compiles to cap, with sw after a separator", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    assert.strictEqual(slj(root, ["set", "1", "4", "--caption", "ctx {value}", "--caption-case", "small"]).status, 0);
    const it = compiled(root).lines[0].ops[3];
    assert.ok(it.cap, "the item carries cap");
    assert.strictEqual(it.cap.pos, "below");
    assert.strictEqual(it.cap.align, "left");
    assert.strictEqual(it.sw, 3, "sw is the width of ' · '");
    assert.ok(it.cap.ops.some((o) => o.op === "val"), "{value} is a val op");
    assert.ok(it.cap.ops.some((o) => o.op === "lit" && o.t !== "ctx " && o.a === "ctx "), "small caps, with the plain text as the ASCII twin");
  } finally {
    rmrf(root);
  }
});

test("statusline design: label, prefix, shape, value, suffix — in that order on a bar", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    const r = slj(root, ["set", "3", "1", "quota-5h", "--render", "bar-only", "--label", "5h", "--label-pos", "before", "--value-pos", "after", "--prefix", "[", "--suffix", "]"]);
    assert.strictEqual(r.status, 0, JSON.stringify(r.json && r.json.errors));
    const kids = compiled(root).lines[2].ops[0].children.filter((o) => o.op !== "sgr" && o.op !== "reset");
    assert.deepStrictEqual(kids.map((o) => o.op === "lit" ? "lit:" + o.t : o.op), ["lit:5h ", "lit:[", "bar", "lit: ", "val", "lit:]"]);
  } finally {
    rmrf(root);
  }
});

test("statusline design: gradient gc, fill colour fs, and a state glyph", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    slj(root, ["set", "3", "1", "context", "--render", "gradient", "--width", "8", "--ramp-colors", "#00ff00,#ffff00,#ff0000"]);
    let bar = flat(compiled(root).lines[2].ops).find((o) => o.op === "bar");
    assert.ok(Array.isArray(bar.gc) && bar.gc.length === 8, "gc has one SGR per cell");
    assert.ok(bar.gc.every((s) => /^\u001b\[38;2;\d+;\d+;\d+m$/.test(s)));
    slj(root, ["set", "3", "1", "--render", "bar-only", "--ramp-colors", "", "--fill-color", "cyan"]);
    bar = flat(compiled(root).lines[2].ops).find((o) => o.op === "bar");
    assert.strictEqual(bar.fs, "\u001b[36m");
    slj(root, ["set", "3", "2", "verdict", "--render", "shape", "--state-glyph", "ready=*"]);
    const c = compiled(root);
    const st = flat(c.lines[2].ops).find((o) => o.op === "state");
    assert.strictEqual(c.statemaps[st.m].glyphs.ready, "*");
  } finally {
    rmrf(root);
  }
});

test("statusline design: the subagent board refuses a caption", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "agent-default", "--board", "subagent"]);
    // The type is named: `--board` takes no positional slot of its own.
    const r = slj(root, ["set", "1", "1", "task-name", "--caption", "x", "--board", "subagent"]);
    assert.strictEqual(r.status, 1);
    assert.ok(r.json.errors.some((e) => /caption on line 1 position 1 — the subagent row is one terminal row/.test(e)), JSON.stringify(r.json.errors));
  } finally {
    rmrf(root);
  }
});

test("statusline design: components --json carries every design list", () => {
  const { root } = freshInstall();
  try {
    const j = slj(root, ["components"]).json;
    for (const k of ["label_positions", "value_positions", "caption_positions", "caption_aligns", "case_samples", "aligns", "signs", "unknowns", "line_aligns", "caption_tokens", "limits"])
      assert.ok(j[k], "components --json has no " + k);
    for (const c of ["small", "super", "sub"]) assert.ok(j.cases.includes(c) && j.case_samples[c], c);
    assert.strictEqual(j.limits.caption, 40);
    assert.ok(j.renderers["bar-only"].uses.includes("fill_char"));
    assert.ok(j.renderers.split.uses.includes("threshold"));
    assert.ok(j.renderers.shape.uses.includes("glyph_by_state"));
  } finally {
    rmrf(root);
  }
});

test("statusline design: the designer preset validates", () => {
  const { root } = freshInstall();
  try {
    const r = slj(root, ["apply", "designer"]);
    assert.strictEqual(r.status, 0, JSON.stringify(r.json && r.json.errors));
    assert.strictEqual(slj(root, ["validate"]).status, 0);
    for (const l of slj(root, ["show"]).json.lines) assert.ok(l.counted <= 6);
  } finally {
    rmrf(root);
  }
});

test("statusline design: an item with none of the new fields compiles to the same ops", () => {
  // orc-version on `plain`, terminal theme: the pre-v2.0.4 ops, by hand.
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    const it = compiled(root).lines[0].ops[1];
    assert.deepStrictEqual(Object.keys(it), ["op", "id", "b", "hide", "draw_empty", "unknown", "pad_l", "pad_r", "children"]);
    const f = it.children[5].f;
    assert.strictEqual(typeof f, "number");
    assert.deepStrictEqual(it.children, [
      { op: "lit", t: " · ", a: " . " },
      { op: "sgr", s: "\u001b[90m" },
      { op: "lit", t: "ORC " },
      { op: "reset" },
      { op: "sgr", s: "\u001b[39m" },
      { op: "val", b: "orc.version", f },
      { op: "reset" },
    ]);
    assert.ok(!("align" in compiled(root).lines[0]), "a line with no align carries none");
  } finally {
    rmrf(root);
  }
});

test("statusline design: the value after --board is never read as the component type", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "agent-default", "--board", "subagent"]);
    // No type named: "subagent" must not become one.
    const r = slj(root, ["set", "1", "1", "--caption", "x", "--board", "subagent"]);
    assert.strictEqual(r.status, 1);
    assert.ok(!r.json.errors.some((e) => /subagent/.test(e) && /unknown|no component/i.test(e)), JSON.stringify(r.json.errors));
    assert.ok(r.json.errors.some((e) => /caption on line 1 position 1 — the subagent row is one terminal row/.test(e)), JSON.stringify(r.json.errors));
  } finally {
    rmrf(root);
  }
});

test("statusline design: an item name on a meter with no --label-pos draws before the meter", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    let r = slj(root, ["set", "3", "1", "quota-week", "--render", "meter", "--label", "Weekly"]);
    assert.strictEqual(r.status, 0, JSON.stringify(r.json && r.json.errors));
    let kids = compiled(root).lines[2].ops[0].children.filter((o) => o.op !== "sgr" && o.op !== "reset");
    const names = kids.map((o) => o.op === "lit" ? "lit:" + o.t : o.op);
    assert.ok(names.indexOf("lit:Weekly ") >= 0 && names.indexOf("lit:Weekly ") < names.indexOf("bar"), JSON.stringify(names));
    const p = slj(root, ["preview"]);
    const txt = strip(JSON.stringify(p.json));
    assert.ok(/Weekly/.test(txt), txt.slice(0, 400));
    // No authored name: the catalogue label stays off the meter (unchanged).
    r = slj(root, ["set", "3", "1", "quota-week", "--render", "meter", "--label", ""]);
    assert.strictEqual(r.status, 0, JSON.stringify(r.json && r.json.errors));
    kids = compiled(root).lines[2].ops[0].children.filter((o) => o.op === "lit");
    assert.ok(!kids.some((o) => /wk|Weekly/.test(o.t)), JSON.stringify(kids));
  } finally {
    rmrf(root);
  }
});
