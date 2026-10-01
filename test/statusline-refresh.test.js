"use strict";
// @test-pool spawn  — shells node bin/cli.js and runs the installed status-line hook
// v2.1.0 W8 — the status line refresh: the 1 s floor refused by name, the
// write-through key, step-per-run motion, the usage.json freshness fix, the
// doctor checks and the panel buttons.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const R = require("../templates/hooks/orc-statusline-render.js");
const { cli, rmrf, freshInstall, runHook, panelJs } = require("./_helpers.js");

const settings = (root) => path.join(root, ".claude", "settings.json");
const read = (root) => fs.readFileSync(settings(root), "utf8");
const j = (r) => JSON.parse(r.stdout);

test("refresh: 0.2 / 0.5 / 0.7 are refused by name and settings.json is untouched", () => {
  const { root } = freshInstall();
  try {
    const before = read(root);
    for (const v of ["0.2", "0.5", "0.7"]) {
      const r = cli(["statusline", "refresh", v, "--json", "--dir", root]);
      assert.strictEqual(r.status, 2, v);
      const o = j(r);
      assert.deepStrictEqual([o.reason, o.floor_s, o.nearest], ["below-floor", 1, 1], v);
      assert.match(o.hint, /below the Claude Code floor/);
    }
    const human = cli(["statusline", "refresh", "0.5", "--dir", root]);
    assert.match(human.stderr, /refreshInterval minimum: 1/);
    assert.strictEqual(read(root), before, "byte-identical");
  } finally {
    rmrf(root);
  }
});

test("refresh: 3 is written, off removes it, the rest of the file is kept; update keeps it", () => {
  const { root } = freshInstall();
  try {
    const st0 = JSON.parse(read(root));
    assert.strictEqual(cli(["statusline", "refresh", "3", "--dir", root]).status, 0);
    const st3 = JSON.parse(read(root));
    assert.strictEqual(st3.statusLine.refreshInterval, 3);
    delete st3.statusLine.refreshInterval;
    assert.deepStrictEqual(st3, st0, "only refreshInterval changed");
    assert.strictEqual(cli(["statusline", "refresh", "3", "--dir", root]).status, 0);
    assert.strictEqual(cli(["update", "--dir", root]).status, 0);
    assert.strictEqual(JSON.parse(read(root)).statusLine.refreshInterval, 3, "orc update keeps the timer");
    assert.strictEqual(cli(["statusline", "refresh", "off", "--dir", root]).status, 0);
    assert.ok(!("refreshInterval" in JSON.parse(read(root)).statusLine));
  } finally {
    rmrf(root);
  }
});

test("config: statusline_refresh writes THROUGH to settings.json and config list reads it back", () => {
  const { root } = freshInstall();
  try {
    assert.strictEqual(cli(["config", "set", "statusline_refresh", "2", "--dir", root]).status, 0);
    assert.strictEqual(JSON.parse(read(root)).statusLine.refreshInterval, 2);
    const ovr = path.join(root, ".claude", "orc.config.yaml");
    assert.ok(!fs.existsSync(ovr) || !/statusline_refresh/.test(fs.readFileSync(ovr, "utf8")), "no second stored value");
    const key = j(cli(["config", "list", "--json", "--dir", root])).keys.find((k) => k.key === "statusline_refresh");
    assert.strictEqual(String(key.value), "2", "read from settings.json");
    assert.notStrictEqual(cli(["config", "set", "statusline_refresh", "0.5", "--dir", root]).status, 0, "the enum refuses a sub-second value");
  } finally {
    rmrf(root);
  }
});

test("motion: with a step (a timer is set) each run shows the NEXT frame; without one the clock rules", () => {
  const prog = { ansi: "off", formats: [{}], ramps: [], glyphsets: [{}], statemaps: [], lines: [{ ops: [{ op: "item", id: "a", children: [{ op: "sprite", w: 6, mode: "run", ms: 1000, f: ["AB", "CD"], ahead: "", behind: "" }] }] }] };
  const ctx = (extra) => Object.assign({ payload: {}, ledger: {}, scan: {}, derived: { verdict: "ready", reasons: [], version: "x" }, now: 840000, cols: 20, env: {} }, extra);
  const frames = [1, 2, 3].map((step) => R.render(prog, ctx({ step })).text);
  assert.strictEqual(new Set(frames).size, 3, "three runs at the SAME now show three different frames");
  const clock = [1, 2, 3].map(() => R.render(prog, ctx({})).text);
  assert.strictEqual(new Set(clock).size, 1, "no timer: the same now gives the same frame (wall-clock rule)");
});

test("hook: usage.json is rewritten only when the numbers change; a timer advances the session frame", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const payload = { session_id: "s1", cwd: root, workspace: { project_dir: root }, model: { id: "claude-opus-5-5", display_name: "Opus" }, rate_limits: { five_hour: { used_percentage: 12, resets_at: null }, seven_day: { used_percentage: 3, resets_at: null } }, context_window: { used_percentage: 20 } };
    const usage = path.join(claudeDir, "orc", "usage.json");
    runHook(claudeDir, "orc-statusline.js", payload);
    const first = JSON.parse(fs.readFileSync(usage, "utf8")).written_at;
    const t0 = Date.now();
    while (Date.now() - t0 < 20) {}
    runHook(claudeDir, "orc-statusline.js", payload);
    assert.strictEqual(JSON.parse(fs.readFileSync(usage, "utf8")).written_at, first, "same numbers → written_at unchanged");
    runHook(claudeDir, "orc-statusline.js", Object.assign({}, payload, { context_window: { used_percentage: 21 } }));
    assert.notStrictEqual(JSON.parse(fs.readFileSync(usage, "utf8")).written_at, first, "a moved number → rewritten");

    const led = path.join(claudeDir, "orc", "usage-session.json");
    assert.ok(!("frame" in JSON.parse(fs.readFileSync(led, "utf8"))), "no timer → no step counter");
    assert.strictEqual(cli(["statusline", "refresh", "2", "--dir", root]).status, 0);
    runHook(claudeDir, "orc-statusline.js", payload);
    runHook(claudeDir, "orc-statusline.js", payload);
    assert.strictEqual(JSON.parse(fs.readFileSync(led, "utf8")).frame, 2, "one step per run");
  } finally {
    rmrf(root);
  }
});

test("doctor: a hand-edited refreshInterval under 1 s is named", () => {
  const { root } = freshInstall();
  try {
    const st = JSON.parse(read(root));
    st.statusLine.refreshInterval = 0.5;
    fs.writeFileSync(settings(root), JSON.stringify(st, null, 2));
    const r = cli(["doctor", "--json", "--dir", root]);
    assert.match(r.stdout, /statusline-refresh-below-floor/);
  } finally {
    rmrf(root);
  }
});

test("panel: 3 s is offered, 0.2 / 0.5 / 0.7 are disabled with the floor sentence (en + id)", () => {
  const js = panelJs("hookui");
  assert.match(js, /for \(const v of \[0\.2, 0\.5, 0\.7\]\)/);
  assert.match(js, /b\.disabled = true;/);
  assert.match(js, /for \(const v of \[null, 1, 2, 3, 5, 10\]\)/);
  for (const l of ["en", "id"]) {
    const t = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "bin", "webui", "i18n", l, "hookui.json"), "utf8"));
    assert.ok(t["hookui.animFloor"], l + ": the floor sentence");
  }
});
