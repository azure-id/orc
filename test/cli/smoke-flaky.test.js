"use strict";
// @test-pool spawn  — shells node bin/cli.js for `orc ci flaky`
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli } = require("../_helpers");
const I = require("../../bin/gotcha-import.js");

// ── W6b — the flaky classifier (08 Q5) and the end-of-run card (08 Q6) ───────
// Q5: a test that fails and then passes on an identical re-run is FLAKY and
// does NOT use a repair round. ONE definition, shared with `orc ci failed`
// (bin/gotcha-import.js `testLine`). Q6: every coding lane ends in ONE card.

const FX = path.join(__dirname, "..", "fixtures", "flaky");
const fx = (f) => path.join(FX, f);
const read = (f) => fs.readFileSync(fx(f), "utf8");
const T = path.join(__dirname, "..", "..", "templates", "skills");
const tpl = (f) => fs.readFileSync(path.join(T, f), "utf8");

test("flaky: a test that fails then passes on the identical re-run is FLAKY — no repair round", () => {
  const r = I.classifyRerun(read("first.log"), read("rerun-pass.log"));
  assert.strictEqual(r.state, "flaky");
  assert.deepStrictEqual(r.tests_failed, ["charges the guest", "writes the receipt"]);
  assert.deepStrictEqual(r.flaky, ["charges the guest", "writes the receipt"]);
  const c = cli(["ci", "flaky", "--first", fx("first.log"), "--rerun", fx("rerun-pass.log"), "--json"]);
  assert.strictEqual(c.status, 0, c.stderr);
  const j = JSON.parse(c.stdout);
  assert.strictEqual(j.repair_round, false);
  assert.strictEqual(j.gate_line, "GATE flaky :: charges the guest, writes the receipt");
});

test("flaky: a test that fails AGAIN is red (exit 1); the first log alone names what to re-run; no test name → unknown (exit 3)", () => {
  const red = cli(["ci", "flaky", "--first", fx("first.log"), "--rerun", fx("rerun-fail.log"), "--json"]);
  assert.strictEqual(red.status, 1);
  const j = JSON.parse(red.stdout);
  assert.strictEqual(j.state, "red");
  assert.strictEqual(j.repair_round, true);
  assert.strictEqual(j.gate_line, null);
  assert.deepStrictEqual(j.flaky, ["charges the guest"]);
  assert.deepStrictEqual(j.still_failing, ["writes the receipt"]);
  const only = JSON.parse(cli(["ci", "flaky", "--first", fx("first.log"), "--json"]).stdout);
  assert.deepStrictEqual(only.tests_failed, ["charges the guest", "writes the receipt"]);
  assert.strictEqual(only.state, "red");
  // A re-run that exited ≠ 0 is red, whatever its test lines say.
  assert.strictEqual(I.classifyRerun(read("first.log"), read("rerun-pass.log"), 2).state, "red");
  // A re-run that did not run a failing test was not identical.
  assert.deepStrictEqual(I.classifyRerun(read("first.log"), "  ✓ charges the guest\n").missing, ["writes the receipt"]);
  assert.strictEqual(cli(["ci", "flaky", "--first", fx("build-error.log"), "--json"]).status, 3);
  assert.strictEqual(cli(["ci", "flaky", "--json"]).status, 2, "no --first → usage");
});

test("flaky: the rule is in the shared test steps that repair, and every lane that restates its red branch points at it", () => {
  const smoke = tpl("_shared/smoke-gate.md");
  assert.match(smoke, /## Flaky — before any repair round/);
  assert.match(smoke, /orc ci flaky --first <log> --rerun <log>/);
  assert.match(smoke, /GATE flaky :: <tests>/);
  assert.match(smoke, /Run the flaky check first/);
  assert.match(tpl("_shared/phases/verify.md"), /red → the flaky check\s+\(`\.\.\/smoke-gate\.md` §Flaky/);
  assert.match(tpl("orc-quick/SKILL.md"), /Tests are RED → the flaky check first\*\* \(`\.\.\/_shared\/smoke-gate\.md` §Flaky\)/);
  assert.match(tpl("orc-mini/SKILL.md"), /the flaky check, then one repair re-dispatch/);
  assert.match(tpl("orc-fast/SKILL.md"), /the flaky check, then one repair round/);
});

test("card: ONE end-of-run template, outcome first, and every coding lane points at it", () => {
  const sum = tpl("_shared/phases/summary.md");
  assert.strictEqual(sum.split("## End-of-run card").length - 1, 1, "exactly one template");
  const card = sum.slice(sum.indexOf("## End-of-run card"));
  const block = card.slice(card.indexOf("```") + 3, card.indexOf("```", card.indexOf("```") + 3)).trim().split(/\r?\n/);
  assert.match(block[0], /^✅ .+ — \d+ files, tests \d+ passed/, "line 1 is the outcome, the files and the tests");
  assert.ok(block.some((l) => /^\s+undo\s+orc undo --run <run-slug>/.test(l)), "the undo row");
  assert.match(card, /✅ \(done\), ⚠ \(partial\) or ⛔ \(red\)/);
  assert.match(card, /The `undo` row always shows on a run that wrote code/);
  assert.match(card, /only PRINTS the undo; `--apply` runs\s+it/, "the undo prints by default (08 Q2, S6)");
  // /orc reaches it from its summary layer, /orc-diy from the composed one.
  const full = sum.slice(sum.indexOf("<!-- orc:layer full -->"), sum.indexOf("<!-- orc:layer composed -->"));
  const composed = sum.slice(sum.indexOf("<!-- orc:layer composed -->"), sum.indexOf("## End-of-run card"));
  assert.match(full, /§End-of-run card/);
  assert.match(composed, /§End-of-run card/);
  // The three lanes with no summary phase point from the spine — at the SAME path.
  for (const lane of ["orc-mini", "orc-fast", "orc-quick"])
    assert.match(tpl(`${lane}/SKILL.md`), /`\.\.\/_shared\/phases\/summary\.md` §End-of-run card/, `${lane} points at the one card`);
});
