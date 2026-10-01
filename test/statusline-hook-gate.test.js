"use strict";
// @test-pool spawn  — runs the installed status-line hook (runHook)
// The hook half of the custom status line gate (rung 3 catalog_hash, rung 4
// unknown ops, the cleared fallback ledger, the commented config key) and the
// engine additions (cost.*_min, val `tf`, bar `o`). The compiled files are
// hand-written so this does not depend on the compiler.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { REPO, rmrf, runHook } = require("./_helpers.js");

const SRC = path.join(REPO, "templates", "hooks");
const engine = require(path.join(SRC, "orc-statusline-render.js"));

function setup(opts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orc-gate-"));
  const claudeDir = path.join(root, ".claude");
  const hooks = path.join(claudeDir, "hooks");
  const orc = path.join(claudeDir, "orc");
  fs.mkdirSync(hooks, { recursive: true });
  fs.mkdirSync(orc, { recursive: true });
  for (const f of ["orc-statusline.js", "orc-statusline-render.js", "orc-subagent-line.js", "orc-update-lib.js"])
    fs.copyFileSync(path.join(SRC, f), path.join(hooks, f));
  fs.writeFileSync(path.join(hooks, "orc-version.json"), JSON.stringify(opts.inst));
  fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), opts.config || "statusline_custom: on\nsubagent_line_custom: on\n");
  const ops = opts.ops || [{ op: "item", id: "a", children: [{ op: "lit", t: "MYDESIGN" }] }];
  const prog = { schema: 1, formats: {}, glyphsets: {}, statemaps: {}, ramps: {}, lines: [{ ops }] };
  const lock = Object.assign({ bindings: [], max_per_line: 6 }, opts.lock);
  fs.writeFileSync(path.join(orc, "statusline-compiled.json"), JSON.stringify(prog));
  fs.writeFileSync(path.join(orc, "statusline.lock.json"), JSON.stringify(lock));
  fs.writeFileSync(path.join(orc, "subagent-compiled.json"), JSON.stringify(prog));
  fs.writeFileSync(path.join(orc, "subagent.lock.json"), JSON.stringify(lock));
  if (opts.staleState) fs.writeFileSync(path.join(orc, "statusline-state.json"), '{"finding":"statusline-layout-stale"}\n');
  return { root, claudeDir, orc };
}
function run(s) {
  return runHook(s.claudeDir, "orc-statusline.js", { cwd: s.root, session_id: "g", model: { id: "claude-opus-5-5" } }, { ORC_STATUSLINE_SCAN_MS: "0" });
}
function state(s) {
  try {
    return JSON.parse(fs.readFileSync(path.join(s.orc, "statusline-state.json"), "utf8")).finding;
  } catch (_) {
    return null;
  }
}
function sub(s) {
  return runHook(s.claudeDir, "orc-subagent-line.js", { cwd: s.root, session_id: "g", tasks: [{ id: "t1", description: "x" }] });
}

test("same catalog_hash, different version: the custom program runs, old ledger cleared", () => {
  const s = setup({ inst: { version: "9.9.9", catalog_hash: "abc" }, lock: { orc_version: "1.0.0", catalog_hash: "abc" }, staleState: true });
  try {
    assert.match(run(s).stdout, /MYDESIGN/);
    assert.strictEqual(fs.existsSync(path.join(s.orc, "statusline-state.json")), false);
    assert.match(sub(s).stdout, /MYDESIGN/);
  } finally {
    rmrf(s.root);
  }
});

test("a moved catalog_hash falls back as stale", () => {
  const s = setup({ inst: { version: "1.0.0", catalog_hash: "new" }, lock: { orc_version: "1.0.0", catalog_hash: "old" } });
  try {
    assert.doesNotMatch(run(s).stdout, /MYDESIGN/);
    assert.strictEqual(state(s), "statusline-layout-stale");
    assert.doesNotMatch(sub(s).stdout, /MYDESIGN/);
  } finally {
    rmrf(s.root);
  }
});

test("no catalog_hash installed: the version comparison stays", () => {
  const a = setup({ inst: { version: "2.0.0" }, lock: { orc_version: "1.0.0", catalog_hash: "x" } });
  const b = setup({ inst: { version: "2.0.0" }, lock: { orc_version: "2.0.0" } });
  try {
    assert.doesNotMatch(run(a).stdout, /MYDESIGN/);
    assert.strictEqual(state(a), "statusline-layout-stale");
    assert.match(run(b).stdout, /MYDESIGN/);
  } finally {
    rmrf(a.root);
    rmrf(b.root);
  }
});

test("an op the engine does not know falls back as skew", () => {
  const ops = [{ op: "item", id: "a", children: [{ op: "lit", t: "MYDESIGN" }, { op: "hologram" }] }];
  const s = setup({ inst: { version: "1.0.0" }, lock: { orc_version: "1.0.0" }, ops });
  try {
    assert.doesNotMatch(run(s).stdout, /MYDESIGN/);
    assert.strictEqual(state(s), "statusline-layout-skew");
    assert.doesNotMatch(sub(s).stdout, /MYDESIGN/);
  } finally {
    rmrf(s.root);
  }
});

test("a trailing YAML comment on the key still arms the custom path", () => {
  const s = setup({
    inst: { version: "1.0.0" },
    lock: { orc_version: "1.0.0" },
    config: "statusline_custom: on  # note\r\nsubagent_line_custom: \"on\" # mine\r\n",
  });
  try {
    assert.match(run(s).stdout, /MYDESIGN/);
    assert.match(sub(s).stdout, /MYDESIGN/);
  } finally {
    rmrf(s.root);
  }
});

test("engine: OPS, cost minutes, val tf, bar o", () => {
  for (const k of ["lit", "sgr", "reset", "item", "cond", "link", "flex", "val", "bar", "state", "motif", "series"])
    assert.ok(engine.OPS[k], k);
  const c = { payload: { cost: { total_api_duration_ms: 960000, total_duration_ms: 1800000 } } };
  assert.strictEqual(engine.BINDINGS["cost.api_min"](c), 16);
  assert.strictEqual(engine.BINDINGS["cost.wall_min"](c), 30);
  assert.strictEqual(engine.BINDINGS["cost.api_min"]({ payload: {} }), null);

  const renderOne = (op, payload) =>
    engine.render(
      { schema: 1, formats: { f: {} }, glyphsets: { g: { full: "#", empty: "." } }, statemaps: {}, ramps: {}, lines: [{ ops: [{ op: "item", id: "i", children: [op] }] }] },
      { payload: payload || {}, ledger: {}, scan: {}, derived: {}, now: 1767225600000, cols: 0, env: {} }
    ).text;
  for (const tf of ["HH:mm", "HH:mm:ss", "h:mm a"]) {
    const t = renderOne({ op: "val", b: "cost.wall_ms", f: "f", tf }, { cost: { total_duration_ms: 1767225600000 } });
    assert.doesNotMatch(t, /\d{13}/);
    assert.match(t, tf === "h:mm a" ? /^\d{1,2}:\d\d (am|pm)$/ : tf === "HH:mm" ? /^\d\d:\d\d$/ : /^\d\d:\d\d:\d\d$/);
  }
  const bar = renderOne(
    { op: "bar", b: "effort.level", k: "dots", g: "g", w: 5, o: ["low", "medium", "high", "xhigh", "max"] },
    { effort: { level: "high" } }
  );
  assert.ok(bar.trim().length > 0, "bar drew: " + JSON.stringify(bar));
});
