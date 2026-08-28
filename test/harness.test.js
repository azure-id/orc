"use strict";
// @test-pool spawn  — shells `node bin/test-run.js` to prove its own contract
//
// v1.0.0 W0. The runner is the thing every later gate stands on, so the ways it
// could quietly stop testing things are asserted here rather than trusted.
//
// Three of these are the design's own guards, in its words:
//   * every file lands in exactly ONE pool, and an unclassified file is REPORTED
//   * a selective run can NEVER be the gate
//   * a file that was not run is NAMED
// The fourth is the one that bites later: `npm test` must still BE the runner.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { REPO } = require("./_helpers");

const RUNNER = path.join(REPO, "bin", "test-run.js");
const SRC = fs.readFileSync(RUNNER, "utf8");

function run(args) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], { cwd: REPO, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function testFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) out.push(path.relative(REPO, p).split(path.sep).join("/"));
    }
  };
  walk(path.join(REPO, "test"));
  return out.sort();
}

const POOL_NAMES = ["pure", "spawn", "net", "heavy"];

test("every file under test/ DECLARES a pool, and the name is one the runner knows", () => {
  const bad = [];
  for (const rel of testFiles()) {
    const head = fs.readFileSync(path.join(REPO, rel), "utf8").split(/\r?\n/).slice(0, 8).join("\n");
    const m = /@test-pool\s+(\w+)/.exec(head);
    // A pool guessed from a grep would be wrong the first time somebody puts a
    // spawnSync inside a helper — a debugging round this repo has already paid
    // for once (test/cli/_fake-provider.js). So it is declared, or it is a bug.
    if (!m) bad.push(rel + " (no @test-pool pragma in its first 8 lines)");
    else if (!POOL_NAMES.includes(m[1])) bad.push(rel + " (@test-pool " + m[1] + " is not a pool)");
  }
  assert.deepEqual(bad, [], "unclassified or misdeclared test files:\n" + bad.join("\n"));
});

test("the runner knows exactly those four pools, and each one carries its reason", () => {
  for (const n of POOL_NAMES) {
    assert.match(SRC, new RegExp("\\b" + n + ": \\{ concurrency:"), n + " is missing from POOLS");
    assert.match(SRC, new RegExp("\\b" + n + ": \\{ concurrency: [^}]*why: \""), n + " has no `why`");
  }
  // The scrypt cost is the vault's defence and must never be tuned down; the
  // way this suite keeps it affordable is a lane to itself, not a weaker N.
  assert.match(SRC, /heavy: \{ concurrency: 1,/);
  assert.match(SRC, /net: \{ concurrency: 2,/);
});

test("a selective run is NEVER the gate, and it NAMES every file it skipped", () => {
  const r = run(["--file", "docs.test", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.is_gate, false);
  assert.equal(j.files_run, 1);
  assert.ok(j.files_total > 1);
  // A file not run is NAMED, always. A count is not a list.
  assert.equal(j.skipped_files.length, j.files_total - j.files_run);
  assert.ok(j.skipped_files.includes("test/payload.test.js"));
  // Nothing here re-runs a failure, so this array is only ever filled by a
  // human recording a flake. A suite that hides its own flakes is how
  // serve.test.js stayed broken.
  assert.deepEqual(j.flaky, []);
});

test("a bad argument exits 2, and an unknown pool is named", () => {
  assert.equal(run(["--pool", "nope"]).status, 2);
  assert.equal(run(["--wat"]).status, 2);
  assert.match(run(["--pool", "nope"]).stderr, /unknown pool: nope/);
});

test("`npm test` and `prepack` both run the harness, and neither pins a global concurrency", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  assert.equal(pkg.scripts.test, "node bin/test-run.js");
  assert.match(pkg.scripts.prepack, /node bin\/test-run\.js$/);
  // The number moved into the pool table, where it can be different per pool.
  // That is the whole point, and a global pin creeping back would undo it.
  assert.ok(!/--test-concurrency/.test(pkg.scripts.test + pkg.scripts.prepack));
});

test("a changed path that no rule claims widens to EVERYTHING — the fail-safe direction", () => {
  // The mapping is a declared table. An inference engine that quietly picks
  // three files is how a suite stops testing things, so the miss case is the
  // one asserted.
  assert.match(SRC, /const TEST_TOUCHES = \[/);
  assert.match(SRC, /if \(!matched\) return \{ files: all, widened_by: p \}/);
});
