"use strict";
// @test-pool spawn  — shells node bin/cli.js
//
// THE STATUS-LINE WRITE PATH. What `set` stores, what `compile` lowers, and
// whether the hook that will draw the layout speaks this CLI's catalogue.
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
const layoutOf = (root) => JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "statusline-layout.json"), "utf8"));
const itemAt = (root, l, p) => layoutOf(root).lines[l - 1].items[p - 1];
const strip = (s) => String(s || "").replace(/\x1b\[[0-9;]*m/g, "");
const compiledOf = (root) => JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "statusline-compiled.json"), "utf8"));
const flat = (ops, out = []) => {
  for (const o of ops || []) {
    out.push(o);
    if (o.children) flat(o.children, out);
  }
  return out;
};

// ── A5 + A6 — the flags and the clearing semantics ─────────────────────────

test("statusline set: an empty value clears, `inherit` clears a colour, a leading dash is literal", () => {
  const { root } = freshInstall();
  try {
    assert.strictEqual(slj(root, ["set", "1", "1", "context", "--label", "ctx", "--value-color", "red", "--width", "8"]).status, 0);
    assert.strictEqual(itemAt(root, 1, 1).label, "ctx");
    assert.strictEqual(slj(root, ["set", "1", "1", "context", "--label", ""]).status, 0);
    assert.ok(!("label" in itemAt(root, 1, 1)), "the label key is gone");
    slj(root, ["set", "1", "1", "--value-color", "inherit"]);
    assert.ok(!("value_color" in itemAt(root, 1, 1)), "inherit removes value_color");
    slj(root, ["set", "1", "1", "--width", ""]);
    assert.ok(!("width" in itemAt(root, 1, 1)), "an empty number clears");
    slj(root, ["set", "1", "1", "--prefix", "-"]);
    assert.strictEqual(itemAt(root, 1, 1).prefix, "-");
    slj(root, ["set", "1", "1", "--label", "-x"]);
    assert.strictEqual(itemAt(root, 1, 1).label, "-x");
    slj(root, ["set", "1", "1", "--emphasis", "bold"]);
    slj(root, ["set", "1", "1", "--emphasis", ""]);
    assert.ok(!("emphasis" in itemAt(root, 1, 1)));
  } finally {
    rmrf(root);
  }
});

test("statusline set: a swap drops the shape the new component cannot draw", () => {
  const { root } = freshInstall();
  try {
    assert.strictEqual(slj(root, ["set", "1", "1", "context", "--render", "meter", "--label", "c"]).status, 0);
    const r = slj(root, ["set", "1", "1", "model"]);
    assert.strictEqual(r.status, 0, r.raw + r.err);
    const it = itemAt(root, 1, 1);
    assert.strictEqual(it.type, "model");
    assert.ok(!("render" in it) && !("label" in it) && !("ramp" in it));
  } finally {
    rmrf(root);
  }
});

// ── A2 + A3 — show, the hook info and the samples ──────────────────────────

test("statusline show --json: a hook block with eight keys, and a sample per item", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    const { json } = slj(root, ["show"]);
    assert.deepStrictEqual(Object.keys(json.hook).sort(), ["catalog_hash", "cli_version", "fallback", "fix", "match", "path", "settings", "version"]);
    assert.strictEqual(json.hook.match, true, JSON.stringify(json.hook));
    assert.strictEqual(json.hook.fix, null);
    for (const l of json.lines) for (const it of l.items) assert.ok("sample" in it, it.id);
    assert.ok(json.lines[0].items.some((it) => typeof it.sample === "string" && it.sample.length));
  } finally {
    rmrf(root);
  }
});

test("statusline: an old hook is named, with the fix", () => {
  const { root, claudeDir } = freshInstall();
  try {
    fs.writeFileSync(path.join(claudeDir, "hooks", "orc-version.json"), JSON.stringify({ version: "0.0.1" }) + "\n");
    const r = slj(root, ["compile"]);
    assert.strictEqual(r.json.hook.match, false);
    assert.strictEqual(r.json.hook.version, "0.0.1");
    assert.strictEqual(r.json.hook.fix, "orc update");
    const human = cli(["statusline", "show", "--dir", root]);
    assert.match(human.stdout, /The status line hook is ORC 0\.0\.1/);
  } finally {
    rmrf(root);
  }
});

test("statusline compile deletes the recorded fallback", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const st = path.join(claudeDir, "orc", "statusline-state.json");
    fs.mkdirSync(path.dirname(st), { recursive: true });
    fs.writeFileSync(st, JSON.stringify({ finding: "statusline-layout-stale", at: Date.now() }));
    assert.strictEqual(slj(root, ["compile"]).status, 0);
    assert.ok(!fs.existsSync(st));
  } finally {
    rmrf(root);
  }
});

// ── A1 — update recompiles an existing layout ──────────────────────────────

test("orc update: stamps catalog_hash and recompiles an existing layout", () => {
  const { root, claudeDir } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    const lockP = path.join(claudeDir, "orc", "statusline.lock.json");
    const lock = JSON.parse(fs.readFileSync(lockP, "utf8"));
    lock.orc_version = "1.4.2";
    lock.catalog_hash = "old";
    fs.writeFileSync(lockP, JSON.stringify(lock));
    const r = cli(["update", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /upd {3}orc\/statusline-compiled\.json \(recompiled for v/);
    assert.ok(!/subagent-compiled/.test(r.stdout), "a layout that does not exist is not created");
    const inst = JSON.parse(fs.readFileSync(path.join(claudeDir, "hooks", "orc-version.json"), "utf8"));
    const fresh = JSON.parse(fs.readFileSync(lockP, "utf8"));
    assert.ok(inst.catalog_hash && inst.catalog_hash === fresh.catalog_hash);
    assert.strictEqual(fresh.orc_version, inst.version);
  } finally {
    rmrf(root);
  }
});

// ── A7 — the compiler ──────────────────────────────────────────────────────

test("statusline compile: an item colour beats the catalogue ramp, and emphasis applies", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["set", "1", "1", "context", "--render", "bar", "--value-color", "bright-cyan", "--emphasis", "underline"]);
    const ops = flat([compiledOf(root).lines[0].ops[0]]);
    const sgrs = ops.filter((o) => o.op === "sgr").map((o) => o.s);
    assert.ok(sgrs.some((s) => /\[4;96m/.test(s)), JSON.stringify(sgrs));
    assert.ok(ops.filter((o) => o.op === "bar").every((o) => o.r == null));
  } finally {
    rmrf(root);
  }
});

test("statusline compile: mono drops the catalogue ramp", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["set", "1", "1", "context"]);
    slj(root, ["doc", "--theme", "mono"]);
    const ops = flat([compiledOf(root).lines[0].ops[0]]);
    assert.ok(ops.filter((o) => o.op === "val").every((o) => o.r == null));
  } finally {
    rmrf(root);
  }
});

test("statusline compile: a pill puts the value outside the brackets", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["set", "1", "1", "orc-version", "--render", "pill"]);
    const { json } = slj(root, ["show"]);
    const s = strip(json.lines[0].items[0].sample);
    assert.match(s, /^⟪ORC⟫\S/, s);
  } finally {
    rmrf(root);
  }
});

test("statusline catalogue: lines-added is not `+ +`, and no summary names a number for the cap", () => {
  const { root } = freshInstall();
  try {
    const { json } = slj(root, ["components"]);
    const la = json.components.find((c) => c.id === "lines-added");
    assert.strictEqual(la.defaults.sign, "auto");
    for (const c of json.components) assert.ok(!/5-per-line|against the five/.test(c.summary), c.id);
    assert.strictEqual(json.inherit_token, "inherit");
    const api = json.components.find((c) => c.id === "api-time");
    assert.strictEqual(api.binding, "cost.api_min");
    assert.strictEqual(json.components.find((c) => c.id === "wall-time").binding, "cost.wall_min");
  } finally {
    rmrf(root);
  }
});

// These three depend on the engine (C4/C5/C6).
test("statusline engine: api-time in minutes, clock as a time, effort dots draw", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["set", "1", "1", "api-time"]);
    slj(root, ["set", "1", "2", "clock"]);
    slj(root, ["set", "1", "3", "effort", "--render", "dots"]);
    const ops = flat(compiledOf(root).lines[0].ops);
    assert.ok(ops.some((o) => o.op === "val" && o.tf === "HH:mm"));
    assert.ok(ops.some((o) => o.op === "bar" && Array.isArray(o.o) && !o.o.includes("unknown")));
    const { json } = slj(root, ["show"]);
    const [api, clock, eff] = json.lines[0].items.map((i) => strip(i.sample));
    assert.ok(!/\d{5,}m/.test(api), api);
    assert.match(clock, /\d{1,2}:\d{2}/);
    assert.ok(eff.trim().length > 0, "effort dots render");
  } finally {
    rmrf(root);
  }
});
