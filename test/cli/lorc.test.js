"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, tmpdir } = require("../_helpers");

// v2.3.0 W5a — `orc lorc …` runs Light ORC's CLI and passes its JSON through.
// A FAKE lorc cli answers here; it records its argv. Never the real home.

const FAKE = `"use strict";
const fs = require("fs");
const a = process.argv.slice(2);
if (process.env.FAKE_LORC_LOG) fs.appendFileSync(process.env.FAKE_LORC_LOG, JSON.stringify(a) + "\\n");
const mode = process.env.FAKE_LORC_MODE || "";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
if (mode === "slow" && a[0] !== "version") { const t = Date.now() + 3000; while (Date.now() < t) {} }
if (a[0] === "version") out({ name: "@azure-id/lorc", version: "0.1.0" });
else if (mode === "garbage") process.stdout.write("lorc says hello\\n");
else if (a[0] === "run" && a[1] === "list") out({ runs: [{ slug: "r1", tier: "low" }] });
else if (a[0] === "settings" && a[1] === "set") {
  if (a[2] === "nosuch") { process.stderr.write('lorc settings: unknown key "nosuch"\\n'); process.exit(2); }
  out({ ok: true, key: a[2], value: a[3], scope: a.includes("--global") ? "global" : "project" });
} else if (a[0] === "settings") out({ values: {}, sources: {}, files: {} });
else out({ echo: a });
`;

function setup(opts) {
  const o = opts || {};
  const root = tmpdir();
  const home = tmpdir();
  const bin = tmpdir();
  const cliFile = path.join(bin, "lorc.js");
  fs.writeFileSync(cliFile, FAKE);
  const stamp = (base) => {
    fs.mkdirSync(path.join(base, ".claude", "lorc"), { recursive: true });
    fs.writeFileSync(path.join(base, ".claude", "lorc", "version.json"), JSON.stringify({ version: "0.1.0", cli: o.missingCli ? path.join(bin, "gone.js") : cliFile }));
  };
  if (o.project) stamp(root);
  if (o.global) stamp(home);
  const log = path.join(bin, "argv.log");
  const env = { HOME: home, USERPROFILE: home, FAKE_LORC_LOG: log, FAKE_LORC_MODE: o.mode || "" , ...(o.env || {}) };
  return { root, home, bin, env, log, done: () => [root, home, bin].forEach(rmrf) };
}
const json = (r) => { try { return JSON.parse(r.stdout); } catch (_) { return null; } };

test("lorc status: none → exit 1 installed none", () => {
  const s = setup({});
  const r = cli(["lorc", "status", "--json", "--dir", s.root], s.env);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(json(r).installed, "none");
  assert.strictEqual(json(r).cli, null);
  s.done();
});

test("lorc status: project stamp → project, cli_ok, version", () => {
  const s = setup({ project: true });
  const r = cli(["lorc", "status", "--json", "--dir", s.root], s.env);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = json(r);
  assert.strictEqual(j.installed, "project");
  assert.strictEqual(j.cli_ok, true);
  assert.strictEqual(j.version, "0.1.0");
  assert.strictEqual(j.global, null);
  s.done();
});

test("lorc status: both stamps → both; a missing cli → cli_ok false", () => {
  const s = setup({ project: true, global: true });
  assert.strictEqual(json(cli(["lorc", "status", "--json", "--dir", s.root], s.env)).installed, "both");
  s.done();
  const m = setup({ project: true, missingCli: true });
  const j = json(cli(["lorc", "status", "--json", "--dir", m.root], m.env));
  assert.strictEqual(j.cli_ok, false);
  assert.strictEqual(j.version, null);
  m.done();
});

test("lorc runs: the envelope, and the fake saw run list --json --dir <root>", () => {
  const s = setup({ project: true });
  const r = cli(["lorc", "runs", "--json", "--dir", s.root], s.env);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = json(r);
  assert.strictEqual(j.ok, true);
  assert.strictEqual(j.source, "lorc 0.1.0");
  assert.deepStrictEqual(j.data.runs, [{ slug: "r1", tier: "low" }]);
  const calls = fs.readFileSync(s.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepStrictEqual(calls[calls.length - 1], ["run", "list", "--json", "--dir", path.resolve(s.root)]);
  s.done();
});

test("lorc: not installed → NOT-INSTALLED exit 1", () => {
  const s = setup({});
  const r = cli(["lorc", "settings", "--json", "--dir", s.root], s.env);
  assert.strictEqual(r.status, 1);
  assert.deepStrictEqual(json(r), { ok: false, state: "NOT-INSTALLED" });
  s.done();
});

test("lorc: garbage stdout → UNREADABLE exit 2", () => {
  const s = setup({ project: true, mode: "garbage" });
  const r = cli(["lorc", "habits", "--json", "--dir", s.root], s.env);
  assert.strictEqual(r.status, 2);
  assert.strictEqual(json(r).state, "UNREADABLE");
  assert.match(json(r).detail, /lorc says hello/);
  s.done();
});

test("lorc: a slow lorc → UNREADABLE timeout", () => {
  const s = setup({ project: true, mode: "slow", env: { ORC_LORC_TIMEOUT_MS: "800" } });
  const r = cli(["lorc", "usage", "--json", "--dir", s.root], s.env);
  assert.strictEqual(r.status, 2);
  assert.deepStrictEqual(json(r), { ok: false, state: "UNREADABLE", detail: "timeout" });
  s.done();
});

test("lorc settings set: exit 2 and the stderr line passed through; a good set answers", () => {
  const s = setup({ project: true });
  const bad = cli(["lorc", "settings", "set", "nosuch", "1", "--json", "--dir", s.root], s.env);
  assert.strictEqual(bad.status, 2);
  assert.match(bad.stderr, /unknown key "nosuch"/);
  const good = cli(["lorc", "settings", "set", "limit_pct", "80", "--global", "--json", "--dir", s.root], s.env);
  assert.strictEqual(good.status, 0, good.stderr);
  assert.strictEqual(json(good).data.scope, "global");
  s.done();
});

test("doctor: lorc's statusline → the lorc line, and the lorc info line", () => {
  const s = setup({ project: true });
  const cd = path.join(s.root, ".claude");
  fs.mkdirSync(path.join(cd, "hooks"), { recursive: true });
  fs.writeFileSync(path.join(cd, "settings.json"), JSON.stringify({ hooks: {}, statusLine: { type: "command", command: 'node ".claude/hooks/lorc-statusline.js"' } }));
  const r = cli(["doctor", "--dir", s.root], s.env);
  assert.match(r.stdout, /statusline: lorc \(bypass\) — it writes ORC's usage bridge/);
  assert.match(r.stdout, /lorc 0\.1\.0 \(project\)/);
  s.done();
});

test("usage check: only .claude/lorc/usage.json is fresh → it is read", () => {
  const s = setup({});
  const d = path.join(s.root, ".claude", "lorc");
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "usage.json"), JSON.stringify({ five_hour: { used_percentage: 42, resets_at: null }, seven_day: { used_percentage: 7, resets_at: null }, written_at: Date.now() }));
  const r = cli(["usage", "check", "--json", "--dir", s.root], s.env);
  const j = json(r);
  assert.ok(j, r.stdout + r.stderr);
  assert.match(JSON.stringify(j), /42/);
  s.done();
});

test("orc init keeps a Light ORC status line ('lorc-statusline' contains 'orc-statusline')", () => {
  const { spawnSync } = require("child_process");
  const dir = tmpdir();
  try {
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    const lorcLine = 'node "C:/x/hooks/lorc-statusline.js"';
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify({ statusLine: { type: "command", command: lorcLine } }));
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const r = spawnSync(process.execPath, [path.join(__dirname, "..", "..", "bin", "cli.js"), "init", "--dir", dir], { encoding: "utf8" });
    assert.strictEqual(r.status, 0, r.stderr);
    const st = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
    assert.strictEqual(st.statusLine.command, lorcLine);
  } finally {
    rmrf(dir);
  }
});
