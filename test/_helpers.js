"use strict";
// Shared test helpers. NOT a *.test.js file, so `node --test test/` ignores it.
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.join(__dirname, "..");
const CLI = path.join(REPO, "bin", "cli.js");
const HOOK_SRC = path.join(REPO, "templates", "hooks");

// Deterministic env: never let the update-check touch the network in tests.
const BASE_ENV = { ...process.env, ORC_NO_UPDATE_CHECK: "1", CI: "true" };

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

module.exports = { REPO, CLI, HOOK_SRC, tmpdir, rmrf, cli, runHook, freshInstall };
