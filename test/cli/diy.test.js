"use strict";
// @test-pool spawn  — shells node bin/cli.js
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
    assert.match(flow, /orc-executor-opus-5-med/, "top band unclipped under a fable-5 tier");
    assert.match(flow, /orc-executor-opus-5-low/, "the [65,90) band is unclipped too");
  } finally {
    rmrf(root);
  }
});

test("diy: an opus-4-8 session_tier clips BOTH opus-5 bands, an opus-5 tier keeps them", () => {
  const { root, claudeDir } = freshInstall();
  const compiled = path.join(claudeDir, "orc", "diy", "FLOW-COMPILED.md");
  try {
    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    // The default session_tier is opus-4-8-high. Since v1.0.0 W4 the default
    // table's TOP TWO bands are Opus 5, so a tier that could not outrank one
    // band now cannot outrank two — and both collapse into the highest allowed
    // agent. Two adjacent rows naming the same agent is not a rendering bug: it
    // is what a clip looks like, and the compiled flow says it is clipped.
    assert.strictEqual(cli(["diy", "compile", "--dir", root]).status, 0);
    const clipped = fs.readFileSync(compiled, "utf8");
    assert.doesNotMatch(clipped, /orc-executor-opus-5-(low|med|high)/, "every opus-5 band clipped under an opus-4-8 tier");
    assert.match(clipped, /\| \[65,90\) \| orc-executor-opus-4-8-high \|/, "the [65,90) band falls back");
    assert.match(clipped, /\| \[90,100\] \| orc-executor-opus-4-8-high \|/, "the top band falls back");
    assert.match(clipped, /already clipped to this flow's session tier/, "and the clip is stated, never silent");

    assert.strictEqual(cli(["diy", "set", "session_tier", "opus-5-high", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "compile", "--dir", root]).status, 0);
    const onOpus5 = fs.readFileSync(compiled, "utf8");
    assert.match(onOpus5, /\| \[65,90\) \| orc-executor-opus-5-low \|/, "opus-5 tier keeps the low band");
    assert.match(onOpus5, /\| \[90,100\] \| orc-executor-opus-5-med \|/, "opus-5 tier keeps the top band");
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
  // v0.50.0 — named explicitly so a REMOVAL is reported by name rather than as
  // a diff of two lists. `extra` decides WHETHER a flow may send work off
  // Claude; `orc extra resolve` still decides WHERE, per task, at run time.
  assert.ok(code.includes("extra"), "the `extra` block is in the stitch order and in compile.md");
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

/* --------------------------------------------------------------------------
   v0.52.0 (D7, D8) — EXTRA IS VISIBLE IN THE FLOW.

   `diyScoreTable` read the Claude ladder unconditionally and knew nothing about
   the route ledger, so a flow with `extra: on` and a row covering [40,55) still
   printed `[40,55) | orc-executor-sonnet-4-6-high` — a phase list describing a
   run that will not happen. And `fixed_executor` could not name a foreign target
   at all, because its option list was `Object.keys(DIY_EXECUTORS)` and a foreign
   target has no model tier.
-------------------------------------------------------------------------- */

// A verified profile with one route row, in a real install.
function armedExtra(root, band, model) {
  const base = "https://example.invalid/v1";
  assert.strictEqual(
    cli(["extra", "add", "w", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K", "--dir", root]).status,
    0
  );
  // Verified WITHOUT a network probe: the ledger is a plain JSON file and this
  // suite is about the flow, not about the connection gate (which has its own).
  const led = path.join(root, ".claude", "orc", "extra.json");
  const j = JSON.parse(fs.readFileSync(led, "utf8"));
  j.profiles[0].verified_at = new Date().toISOString();
  j.profiles[0].verify_method = "models";
  fs.writeFileSync(led, JSON.stringify(j, null, 2));
  assert.strictEqual(cli(["extra", "route", "set", band, "w/" + model, "--dir", root]).status, 0);
  fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "extra_enabled: true\nextra_roles: [executor]\n");
}

test("diy: the score table renders the COMPOSITE when extra is on, and is byte-identical when it is off", () => {
  const { root } = freshInstall();
  try {
    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    const before = JSON.parse(cli(["diy", "show", "--json", "--dir", root]).stdout).score_table;

    armedExtra(root, "40-55", "big-pickle");
    // `extra: off` still renders EXACTLY what will run — the flow key decides
    // WHETHER, the resolver decides WHERE, and this must not blur the two.
    assert.strictEqual(
      JSON.parse(cli(["diy", "show", "--json", "--dir", root]).stdout).score_table,
      before,
      "extra: off must render byte-identically"
    );

    assert.strictEqual(cli(["diy", "set", "extra", "on", "--dir", root]).status, 0);
    const j = JSON.parse(cli(["diy", "show", "--json", "--dir", root]).stdout);
    assert.match(j.score_table, /\[40,55\) \| extra/, "the routed band names the connection, not a Claude agent");
    assert.match(j.score_table, /big-pickle/);
    // A gap is not a hole — it is Claude, and it keeps its own rows.
    assert.match(j.score_table, /orc-executor-haiku-4-5/);
    // The execution step says how many bands leave Claude, or a stepper reads
    // `scored` on a flow routing half its work to a third party.
    const exec = j.steps.find((x) => x.block === "execution");
    assert.match(exec.note, /1 band\(s\) foreign/);
  } finally {
    rmrf(root);
  }
});

test("diy: a band that cannot route KEEPS ITS ROW and names its fall-through", () => {
  const { root } = freshInstall();
  try {
    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    armedExtra(root, "40-55", "big-pickle");
    assert.strictEqual(cli(["diy", "set", "extra", "on", "--dir", root]).status, 0);
    // Un-verify it: the row is still the user's routing decision, and it must
    // not vanish — the OFF-phase-keeps-its-slot rule applied to a band.
    const led = path.join(root, ".claude", "orc", "extra.json");
    const j = JSON.parse(fs.readFileSync(led, "utf8"));
    j.profiles[0].verified_at = null;
    fs.writeFileSync(led, JSON.stringify(j, null, 2));

    const table = JSON.parse(cli(["diy", "show", "--json", "--dir", root]).stdout).score_table;
    assert.match(table, /\[40,55\) \| extra/, "the row keeps its slot");
    assert.match(table, /unverified/);
    assert.match(table, /stays on Claude: orc-executor-sonnet-4-6-high/);
  } finally {
    rmrf(root);
  }
});

test("diy: fixed_executor can name a FOREIGN target, and the skipped tier rule is announced", () => {
  const { root, claudeDir } = freshInstall();
  try {
    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    armedExtra(root, "40-55", "big-pickle");

    // The option list is EXTENDED; DIY_EXECUTORS is not.
    let opts = JSON.parse(cli(["diy", "show", "--json", "--dir", root]).stdout).keys.find((k) => k.key === "fixed_executor").options;
    assert.ok(opts.includes("orc-executor-haiku-4-5"), "the Claude agents are still there");
    assert.ok(opts.includes("extra:w/custom/big-pickle"), "a verified profile's routed model is offerable");

    // TWO KEYS, TWO QUESTIONS. `scoring: off` plus a foreign executor still
    // needs `extra: on`, refused BY NAME rather than inferred.
    assert.strictEqual(cli(["diy", "set", "scoring", "off", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "set", "fixed_executor", "extra:w/custom/big-pickle", "--dir", root]).status, 0);
    let comp = cli(["diy", "compile", "--dir", root]);
    assert.strictEqual(comp.status, 1, "a foreign executor with extra off must not compile");
    assert.match(comp.stderr + comp.stdout, /extra is off/);

    assert.strictEqual(cli(["diy", "set", "extra", "on", "--dir", root]).status, 0);
    comp = cli(["diy", "compile", "--dir", root]);
    assert.strictEqual(comp.status, 0, comp.stdout + comp.stderr);
    // A RULE SILENTLY DISABLED IS WORSE THAN NO RULE.
    assert.match(comp.stdout, /session_tier does not apply to this executor/);
    const flow = fs.readFileSync(path.join(claudeDir, "orc", "diy", "FLOW-COMPILED.md"), "utf8");
    assert.match(flow, /session_tier does not apply to this executor/);

    // A DELETED profile fails the compile with the profile NAMED.
    const led = path.join(root, ".claude", "orc", "extra.json");
    const j = JSON.parse(fs.readFileSync(led, "utf8"));
    j.profiles = [];
    fs.writeFileSync(led, JSON.stringify(j, null, 2));
    comp = cli(["diy", "compile", "--dir", root]);
    assert.strictEqual(comp.status, 1);
    assert.match(comp.stderr + comp.stdout, /"w", which no longer exists/);
  } finally {
    rmrf(root);
  }
});
