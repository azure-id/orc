"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir, REPO, FAKE_HOME, webuiFiles } = require("../_helpers");


// `orc diy` — compile, the tier clip, the stitch order, `steps[]`, and the
// exit-code contract (0 READY, 1 STALE | UNCONFIGURED).
//
// Split out of cli.test.js in v0.48.1: a suite you have to scroll
// past 1 200 lines of to find one case is a suite nobody adds a case to.

test("diy: compile roundtrip with a fable-5 session_tier (all executors fit)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "set", "session_tier", "fable-5-xhigh", "--dir", root]).status, 0);
    const comp = cli(["diy", "compile", "--dir", root]);
    assert.strictEqual(comp.status, 0, "fable-5 tier compiles");
    const flow = fs.readFileSync(path.join(claudeDir, "orc", "diy", "FLOW-COMPILED.md"), "utf8");
    assert.match(flow, /orc-executor-haiku-4-5/, "haiku band present under a fable-5 tier");
    assert.match(flow, /orc-executor-opus-5-high/, "top band unclipped under a fable-5 tier");
  } finally {
    rmrf(root);
  }
});

test("diy: an opus-4-8 session_tier clips the opus-5 top band, an opus-5 tier keeps it", () => {
  const { root, claudeDir } = freshInstall();
  const compiled = path.join(claudeDir, "orc", "diy", "FLOW-COMPILED.md");
  try {
    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    // default session_tier is opus-4-8-high: the [90,100] opus-5 band cannot
    // outrank the main session, so it collapses into the highest allowed agent.
    assert.strictEqual(cli(["diy", "compile", "--dir", root]).status, 0);
    const clipped = fs.readFileSync(compiled, "utf8");
    assert.doesNotMatch(clipped, /orc-executor-opus-5-high/, "opus-5 clipped under an opus-4-8 tier");
    assert.match(clipped, /\| \[90,100\] \| orc-executor-opus-4-8-high \|/, "top band falls back to opus-4-8-high");

    assert.strictEqual(cli(["diy", "set", "session_tier", "opus-5-high", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "compile", "--dir", root]).status, 0);
    const onOpus5 = fs.readFileSync(compiled, "utf8");
    assert.match(onOpus5, /\| \[90,100\] \| orc-executor-opus-5-high \|/, "opus-5 tier keeps the top band");
  } finally {
    rmrf(root);
  }
});

test("diy: every compiled flow carries the trace protocol (tracing is not composable)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "compile", "--dir", root]).status, 0);
    const flow = fs.readFileSync(path.join(claudeDir, "orc", "diy", "FLOW-COMPILED.md"), "utf8");
    assert.match(flow, /Behavior trace \(PERMANENT/, "the trace block is stitched in");
    assert.match(flow, /run-diy-<slug>-/, "the diy lane token is named");
    assert.match(flow, /touch the trace file/, "run-start pointer+file rule present");
    assert.match(flow, /orc-trace-writer-haiku-4-5/, "narration dispatch present");
  } finally {
    rmrf(root);
  }
});

test("diy status: the exit code IS the contract (0 READY, 1 STALE, 1 UNCONFIGURED)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const unconf = cli(["diy", "status", "--dir", root]);
    assert.strictEqual(unconf.status, 1, "UNCONFIGURED must not read as runnable");
    assert.match(unconf.stdout, /UNCONFIGURED/);

    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "status", "--dir", root]).status, 1, "never compiled → STALE → 1");

    assert.strictEqual(cli(["diy", "compile", "--dir", root]).status, 0);
    const ready = cli(["diy", "status", "--dir", root]);
    assert.strictEqual(ready.status, 0, "READY → 0");
    assert.match(ready.stdout, /READY/);

    // Two live triggers at once: the config changed AND orc was updated.
    fs.appendFileSync(path.join(claudeDir, "orc-diy.config.yaml"), "\n# touched\n");
    const lockPath = path.join(claudeDir, "orc", "diy", "flow.lock.json");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    lock.orc_version = "0.24.0";
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

    const stale = cli(["diy", "status", "--dir", root]);
    assert.strictEqual(stale.status, 1);
    assert.match(stale.stdout, /config changed/, "names the config trigger");
    assert.match(stale.stdout, /orc updated 0\.24\.0/, "AND the version trigger — not just the first");
  } finally {
    rmrf(root);
  }
});

test("diy compile: the documented stitch order equals the compiler's order array", () => {
  const cliSrc = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const arr = cliSrc.match(/const order = \[([^\]]+)\]/);
  assert.ok(arr, "found the compiler's order array");
  const code = arr[1]
    .split(",")
    .map((x) => x.trim().replace(/^"|"$/g, ""))
    .map((x) => (x === "null" ? "locked-blocks.md" : x));

  const doc = fs
    .readFileSync(path.join(REPO, "templates", "skills", "orc-diy", "references", "compile.md"), "utf8")
    .replace(/\r\n/g, "\n");
  // The order list itself — from the first `header` to `summary`; the prose
  // around it legitimately names blocks out of order.
  const step = doc.slice(doc.indexOf("3. **Stitch.**"), doc.indexOf("4. **Substitute"));
  const stitch = step.slice(step.indexOf("`header`"), step.indexOf("`summary`") + "`summary`".length);
  const documented = [...stitch.matchAll(/`([a-z-]+(?:\.md)?)`/g)]
    .map((m) => m[1])
    .filter((n) => code.includes(n) || n === "locked-blocks.md");
  // de-dupe while keeping first-seen order (the prose mentions some twice)
  const seen = [];
  for (const n of documented) if (!seen.includes(n)) seen.push(n);

  assert.deepStrictEqual(seen, code, "compile.md and bin/cli.js must stitch the same blocks in the same order");
  assert.ok(code.includes("mock-example"), "the phase that went missing from the doc is in both");
});

// The `orc ui` flow stepper draws `steps[]` and nothing else. If a block joins
// the stitch order without a DIY_STEPS row, the picture silently stops being
// the pipeline — a phase would run that the panel never draws.
test("diy show --json: steps[] is the stitch order (minus the locked rules)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const cliSrc = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
    const order = cliSrc
      .match(/const order = \[([^\]]+)\]/)[1]
      .split(",")
      .map((x) => x.trim().replace(/^"|"$/g, ""))
      .filter((x) => x !== "null");

    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    const d = JSON.parse(cli(["diy", "show", "--json", "--dir", root]).stdout);
    assert.deepStrictEqual(d.steps.map((s) => s.block), order, "every stitched block has exactly one step, in order");

    const byBlock = Object.fromEntries(d.steps.map((s) => [s.block, s]));
    assert.strictEqual(byBlock.header.on, true, "a keyless block always runs");
    assert.strictEqual(byBlock.execution.note, "scored", "scoring on → execute is scored");
    assert.strictEqual(byBlock.testgen.on, false, "testgen defaults off");
    assert.strictEqual(byBlock.verify.on, true);

    // An OFF phase keeps its slot — the stepper's width must not depend on config.
    assert.strictEqual(cli(["diy", "set", "review", "off", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "set", "scoring", "off", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "set", "fixed_executor", "orc-executor-sonnet-5-high", "--dir", root]).status, 0);
    const d2 = JSON.parse(cli(["diy", "show", "--json", "--dir", root]).stdout);
    assert.strictEqual(d2.steps.length, d.steps.length, "off never removes a step");
    const b2 = Object.fromEntries(d2.steps.map((s) => [s.block, s]));
    assert.strictEqual(b2.review.on, false);
    assert.strictEqual(b2.scoring.on, false);
    assert.strictEqual(b2.execution.note, "orc-executor-sonnet-5-high", "scoring off → execute names the fixed executor");

    // Unconfigured is an ANSWER, not an error: the object still comes back.
    rmrf(path.join(claudeDir, "orc-diy.config.yaml"));
    const none = JSON.parse(cli(["diy", "show", "--json", "--dir", root]).stdout);
    assert.deepStrictEqual(none.steps, [], "no config → no pipeline to draw");
  } finally {
    rmrf(root);
  }
});
