"use strict";
// Shared test helpers.
//
// NOTE: `node --test test/` does NOT ignore this file — it executes every .js
// under test/ as a test file, and this one simply has no side effects, so it
// registers zero tests and passes. A helper that DOES something on load must
// guard itself (see test/cli/_fake-provider.js, which cost a debugging round
// before it did).
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// WHY `npm test` PINS `--test-concurrency=8` (v0.50.0). This box has 16 cores,
// and node --test defaults to one worker per core. Several files here spawn real
// child processes (the fake provider, the fake `claude`, the fake CLI) and one
// derives scrypt at N=2^17 — 128 MB and a beat of wall clock, on purpose,
// because that cost IS the vault's defence and must never be tuned down. At full
// parallelism those starve each other: a local fake provider misses the probe's
// 3s rung-1 timeout, the ping falls through to the 20s rung 2, and the file fails
// at ~25s with `1 == 0` — which looks EXACTLY like a real regression and has
// cost this repo three debugging rounds. Halving the peak costs ~11% wall clock
// and buys a suite whose result means something.
const REPO = path.join(__dirname, "..");
const CLI = path.join(REPO, "bin", "cli.js");
const HOOK_SRC = path.join(REPO, "templates", "hooks");

// Deterministic env: never let the update-check touch the network in tests,
// and never let the DEVELOPER's real ~/.claude decide a result — `orc doctor`
// reads the global install to detect skew, so a stale global ORC on the
// machine running the suite would otherwise flip a "healthy" assertion.
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "orc-test-home-"));
const BASE_ENV = {
  ...process.env,
  ORC_NO_UPDATE_CHECK: "1",
  CI: "true",
  HOME: FAKE_HOME,
  USERPROFILE: FAKE_HOME,
};

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "orc-test-"));
}

function rmrf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

// Run `node bin/cli.js <args...>`. Returns { status, stdout, stderr }.
function cli(args, env) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...BASE_ENV, ...(env || {}) },
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

// Pipe a JSON payload into an INSTALLED hook (under <claudeDir>/hooks) so the
// hook resolves its project root to the temp install, not the repo.
function runHook(claudeDir, name, payload, env) {
  const r = spawnSync(process.execPath, [path.join(claudeDir, "hooks", name)], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...BASE_ENV, ...(env || {}) },
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

// `orc init` into a fresh temp project; returns { root, claudeDir }.
function freshInstall() {
  const root = tmpdir();
  const res = cli(["init", "--dir", root]);
  if (res.status !== 0) throw new Error("init failed: " + res.stderr + res.stdout);
  return { root, claudeDir: path.join(root, ".claude") };
}

// ── the panel, read as ONE string ───────────────────────────────────────────
// v0.48.1. `bin/webui/` is many files now, but almost every assertion in the
// suite is about the panel as a WHOLE ("no panel stylesheet defines a colour
// token", "the CLI's state words appear verbatim"). Concatenating in the SAME
// order `app.html` loads them keeps every grep-style assertion valid across the
// split — and it makes a file `app.html` forgot to load impossible to hide,
// because a file that is not in the manifest is not in this string either.
//
// The list is derived from `app.html` rather than from a directory walk on
// purpose: these tests are about what the BROWSER actually runs.
const WEBUI = path.join(REPO, "bin", "webui");

function appHtml() {
  return fs.readFileSync(path.join(WEBUI, "app.html"), "utf8");
}

// Every href="…"/src="…" in app.html, in document order, as webui-relative
// POSIX paths. `ext` filters to one asset kind.
function assetRefs(ext) {
  const out = [];
  const re = /(?:href|src)="([\w./-]+)"/g;
  let m;
  while ((m = re.exec(appHtml()))) if (m[1].endsWith("." + ext)) out.push(m[1]);
  return out;
}

function concatRefs(ext) {
  return assetRefs(ext)
    .map((rel) => {
      const abs = path.join(WEBUI, ...rel.split("/"));
      // A manifest entry with no file behind it is a hard failure here rather
      // than a confusing assertion miss 40 tests later.
      if (!fs.existsSync(abs)) throw new Error(`app.html references ${rel}, which does not exist`);
      return `/* ${rel} */\n` + fs.readFileSync(abs, "utf8");
    })
    .join("\n");
}

let _js = null;
let _css = null;
function appJs() {
  if (_js === null) _js = concatRefs("js");
  return _js;
}
function appCss() {
  if (_css === null) _css = concatRefs("css");
  return _css;
}

// ONE panel's module. Before v0.48.1 a per-panel assertion had to slice the
// monolith between two landmark comments — which broke the moment either
// landmark moved, and silently returned an empty string rather than failing.
// A panel is a file now, so ask for the file.
function panelJs(name) {
  return fs.readFileSync(path.join(WEBUI, "js", "panels", name + ".js"), "utf8");
}
function panelCss(name) {
  return fs.readFileSync(path.join(WEBUI, "css", "panels", name + ".css"), "utf8");
}

// ONE language's full string table, merged from its namespace files exactly
// the way loadLang() merges them in the browser. Assertions about coverage and
// about the scope rule are about the whole table, not about one file.
function i18nNamespaces() {
  const src = fs.readFileSync(path.join(WEBUI, "js", "01-i18n.js"), "utf8");
  const block = /const NAMESPACES = \[([\s\S]*?)\];/.exec(src);
  if (!block) throw new Error("01-i18n.js no longer declares NAMESPACES");
  return [...block[1].matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
}

function i18nTable(code) {
  const out = {};
  for (const ns of i18nNamespaces())
    Object.assign(out, JSON.parse(fs.readFileSync(path.join(WEBUI, "i18n", code, ns + ".json"), "utf8")));
  return out;
}

// Every fixture file as ONE string. The canned data is per panel now, but the
// rules asserted against it ("one of every state", "no CLI vocabulary") are
// about the fixture set as a whole.
function fixtureSrc() {
  const dir = path.join(WEBUI, "fixtures");
  return fs
    .readdirSync(dir)
    .sort()
    .map((f) => "/* " + f + " */\n" + fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
}

// Every file under bin/webui/, as webui-relative POSIX paths. Used by the
// set-equality guard in verify-package.js's test and by the i18n parity checks.
function webuiFiles(sub) {
  const base = sub ? path.join(WEBUI, ...sub.split("/")) : WEBUI;
  const out = [];
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = prefix ? prefix + "/" + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else out.push(rel);
    }
  };
  walk(base, "");
  return out;
}

module.exports = {
  REPO,
  CLI,
  HOOK_SRC,
  FAKE_HOME,
  WEBUI,
  tmpdir,
  rmrf,
  cli,
  runHook,
  freshInstall,
  appHtml,
  assetRefs,
  appJs,
  appCss,
  panelJs,
  panelCss,
  fixtureSrc,
  i18nNamespaces,
  i18nTable,
  webuiFiles,
};
