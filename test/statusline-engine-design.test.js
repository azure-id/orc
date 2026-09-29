"use strict";
// v2.0.4 engine additions: cell width, styled text, case, val param, bar
// fs/es and gc, flex, line align, captions — and old programs unchanged.
const test = require("node:test");
const assert = require("node:assert");
const R = require("../templates/hooks/orc-statusline-render.js");

const ESC = String.fromCharCode(27);
const RED = ESC + "[31m";
const GRN = ESC + "[32m";
const BLU = ESC + "[34m";
const RESET = ESC + "[0m";

function ctx(extra) {
  return Object.assign(
    {
      payload: { context_window: { used_percentage: 50 } },
      ledger: {},
      scan: { config_raw: "extra_enabled: yes\nfoo: bar\n" },
      derived: { verdict: "ready", reasons: [], version: "x" },
      now: 1767225600000,
      cols: 60,
      env: {},
    },
    extra || {}
  );
}
function prog(lines, extra) {
  return Object.assign(
    { ansi: "on", formats: [{}], ramps: [{ stops: [0, 50], sgr: [GRN, RED] }], glyphsets: [{ fill: "#", empty: "." }], statemaps: [], lines },
    extra || {}
  );
}
const lit = (t) => ({ op: "lit", t });
const item = (id, children, more) => Object.assign({ op: "item", id, children }, more || {});
const run = (p, c) => R.render(p, ctx(c));

test("cellWidth: ASCII, emoji, SGR stripped", () => {
  assert.strictEqual(R.cellWidth("abc"), 3);
  assert.strictEqual(R.cellWidth("\u{1F600}"), 2);
  assert.strictEqual(R.cellWidth(RED + "ab" + RESET), 2);
  assert.strictEqual(R.cellWidth("é"), 1);
});

test("styleText small / super / sub", () => {
  assert.strictEqual(R.styleText("Weekly 61", "small"), "ᴡᴇᴇᴋʟʏ 61");
  assert.strictEqual(R.styleText("x2+1", "super"), "ˣ²⁺¹");
  assert.strictEqual(R.styleText("h2o!", "sub"), "ₕ₂ₒ!");
});

test("val with case small", () => {
  const p = prog([{ ops: [item("a", [{ op: "val", b: "verdict.state", f: 0 }])] }], { formats: [{ case: "small" }] });
  assert.strictEqual(run(p).text, "ʀᴇᴀᴅʏ");
});

test("config val with p", () => {
  const p = prog([{ ops: [item("a", [{ op: "val", b: "config.value", f: 0, p: { key: "foo" } }], { b: "config.value", p: { key: "foo" }, hide: ["unknown"] })] }]);
  assert.strictEqual(run(p).text, "bar");
});

test("bar fs/es colour both runs", () => {
  const p = prog([{ ops: [item("a", [{ op: "bar", k: "blocks", b: "ctx.used_pct", g: 0, w: 4, r: 0, fs: GRN, es: BLU }])] }]);
  assert.strictEqual(run(p).text, GRN + "##" + RESET + BLU + ".." + RESET);
  const d = prog([{ ops: [item("a", [{ op: "bar", k: "dots", b: "ctx.used_pct", g: 0, w: 4, fs: GRN, es: BLU }])] }], {
    glyphsets: [{ fill: "#", empty: ".", on: "o", off: "-" }],
  });
  assert.strictEqual(run(d).text, GRN + "oo" + RESET + BLU + "--" + RESET);
});

test("gradient gc per cell", () => {
  const p = prog([{ ops: [item("a", [{ op: "bar", k: "gradient", b: "ctx.used_pct", g: 0, w: 2, r: 0, gc: [GRN, RED] }])] }]);
  assert.strictEqual(run(p).text, GRN + "#" + RED + "." + RESET);
});

test("flex pushes the next item to the right edge; cols 0 prints min", () => {
  const p = prog([{ ops: [item("a", [lit("left")]), { op: "flex", w: 1, min: 1 }, item("b", [lit("right")])] }]);
  const t = run(p).text;
  // D5: flex leaves one column free, so the row is cols - 1 wide.
  assert.strictEqual(t.length, 59);
  assert.ok(t.endsWith(" right") && t.startsWith("left "));
  assert.strictEqual(run(p, { cols: 0 }).text, "left right");
});

test("line align right / center", () => {
  const r = prog([{ align: "right", ops: [item("a", [lit("abcd")])] }]);
  // D1: Claude Code trims leading whitespace, so a row's first leading space is U+2800.
  assert.strictEqual(run(r, { cols: 10 }).text, "⠀     abcd");
  const c = prog([{ align: "center", ops: [item("a", [lit("abcd")])] }]);
  assert.strictEqual(run(c, { cols: 11 }).text, "⠀  abcd");
});

test("caption below starts after the separator; caption above", () => {
  const b = prog([{ ops: [item("a", [lit("xx")]), item("b", [lit(" | "), lit("value")], { sw: 3, cap: { pos: "below", align: "left", ops: [lit("cap")] } })] }]);
  // D1: the first leading space of each row is U+2800 (Claude Code trims leading whitespace).
  assert.strictEqual(run(b).text, "xx | value\n⠀    cap");
  const a = prog([{ ops: [item("a", [lit("value")], { cap: { pos: "above", align: "right", ops: [lit("up")] } })] }]);
  assert.strictEqual(run(a).text, "⠀  up\nvalue"); // D1 again: the caption row's first space is U+2800
});

test("two captions that would overlap", () => {
  const p = prog([{ ops: [
    item("a", [lit("ab")], { cap: { pos: "below", align: "left", ops: [lit("long")] } }),
    item("b", [lit("cd")], { cap: { pos: "below", align: "left", ops: [lit("z")] } }),
  ] }]);
  assert.strictEqual(run(p).text, "abcd\nlong z");
});

test("NO_COLOR emits no ESC for any of these", () => {
  const p = prog([
    { align: "right", ops: [item("a", [{ op: "bar", k: "blocks", b: "ctx.used_pct", g: 0, w: 4, fs: GRN, es: BLU }], { cap: { pos: "above", ops: [{ op: "sgr", s: RED }, lit("c"), { op: "reset" }] } })] },
    { ops: [item("b", [{ op: "bar", k: "gradient", b: "ctx.used_pct", g: 0, w: 2, r: 0, gc: [GRN, RED] }]), { op: "flex", w: 1, min: 1 }, item("c", [{ op: "val", b: "verdict.state", f: 0 }])] },
  ], { formats: [{ case: "super" }] });
  const t = R.render(p, ctx({ env: { NO_COLOR: "1" } })).text;
  assert.ok(!t.includes(ESC), JSON.stringify(t));
  assert.ok(!t.includes("\u0000"));
});

test("an old program renders the same bytes as before v2.0.4", () => {
  // Hand-checked against the pre-change engine.
  const p = { ansi: "on", formats: [{ kind: "percent" }], ramps: [{ stops: [0, 50], sgr: [GRN, RED] }], glyphsets: [{ fill: "#", empty: "." }], statemaps: [],
    lines: [{ prefix: "> ", ops: [item("a", [lit("ctx "), { op: "val", b: "ctx.used_pct", f: 0, r: 0 }]), item("b", [lit(" | "), { op: "bar", k: "blocks", b: "ctx.used_pct", g: 0, w: 6, r: 0 }], { pad_l: 1 })] }] };
  const t = R.render(p, ctx({ payload: { context_window: { used_percentage: 61 } } })).text;
  assert.strictEqual(t, "> ctx " + RED + "61%" + RESET + "  | " + RED + "###..." + RESET);
});
