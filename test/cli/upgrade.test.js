"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { REPO } = require("../_helpers");

// The bin-shim collision (v0.56.0).
//
// This package moved from the unscoped `orc` to `@azure-id/orc`, and both
// declare the same bin name. npm links a bin only if the shim is unowned or
// owned by the installing package, so with the old package still on disk
// globally EVERY install source failed with the same EEXIST — the tarball, the
// github: spec and the registry alike. `orc upgrade` walked all three and then
// printed npm's wall, and `npm i -g -f <spec>` was the only thing that
// "worked", by overwriting the shim and leaving a ghost package underneath.
//
// These are source-level and pure-function tests on purpose: the real behaviour
// depends on the machine's global npm state, which a test must never mutate and
// can never assume.

const BS = String.fromCharCode(92);
// LF, always. Several tests below lift a function out of a shipped file by
// slicing to the next `\n}\n` — a needle a CRLF checkout never contains, which
// collapses the slice to "" and then reports the function as UNDEFINED rather
// than as absent. The rules being asserted are about the CODE; a line ending is
// not one of them.
const srcOf = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const cliSrc = () => srcOf(path.join(REPO, "bin", "cli.js"));

// Lift one top-level function out of cli.js and evaluate it in isolation.
// cli.js runs a CLI on require, so it cannot simply be imported.
function lift(name) {
  const src = cliSrc();
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " not found in bin/cli.js");
  const end = src.indexOf("\n}\n", start);
  assert.ok(end > start, name + " has no closing brace at column 0");
  const body = src.slice(start, end + 2);
  // eslint-disable-next-line no-new-func
  return new Function(body + "\nreturn " + name + ";")();
}

test("the published package name is the scoped one, and it is what upgrade installs", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  const src = cliSrc();
  const declared = (src.match(/const PKG_NAME = "([^"]+)"/) || [])[1];
  assert.strictEqual(
    declared,
    pkg.name,
    "PKG_NAME must equal package.json's name — the whole collision fix keys on this identity"
  );
  // NPM_SPEC is what `npm install -g` is handed. If it drifted from PKG_NAME the
  // upgrade would install a DIFFERENT package than the one it evicted for.
  assert.ok(
    /const NPM_SPEC = PKG_NAME;/.test(src),
    "NPM_SPEC must BE PKG_NAME, not a second spelling of it"
  );
  assert.ok(pkg.name.startsWith("@"), "this test is only meaningful while the name is scoped");
});

test("the legacy bin owners list names the old package and excludes the current one", () => {
  const src = cliSrc();
  const block = (src.match(/const LEGACY_BIN_OWNERS = \[([^\]]*)\]/) || ["", ""])[1];
  const names = block
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  assert.ok(names.includes("orc"), "the unscoped `orc` is the package that owns the shim in the field");
  assert.ok(
    !names.includes("@azure-id/orc"),
    "evicting ourselves would make `orc upgrade` uninstall the tool"
  );
});

test("upgrade tries the registry before the tarball and the github: spec", () => {
  const src = cliSrc();
  const line = (src.match(/specs = \[\.\.\.new Set\(\[[^\]]*\][^;]*;/) || [""])[0];
  const iNpm = line.indexOf("NPM_SPEC");
  const iTar = line.indexOf("TARBALL_SPEC");
  const iGh = line.indexOf("GITHUB_SPEC");
  assert.ok(iNpm > 0 && iTar > 0 && iGh > 0, "all three specs must still be in the ladder");
  assert.ok(iNpm < iTar, "the registry resolves a VERSION, not a branch tip — it goes first");
  assert.ok(iTar < iGh, "the github: spec shells out to git; it stays last");
});

test("the legacy package is evicted BEFORE any source is tried", () => {
  const src = cliSrc();
  const fn = src.slice(src.indexOf("function upgrade() {"));
  const iEvict = fn.indexOf("detectLegacyBinOwner()");
  const iLoop = fn.indexOf("for (let i = 0; i < specs.length");
  assert.ok(iEvict > 0, "upgrade must consult detectLegacyBinOwner");
  assert.ok(
    iEvict < iLoop,
    "the collision fails every source identically — walking the ladder first only " +
      "spends three network round trips to arrive at the same EEXIST"
  );
});

test("isBinShimCollision recognises npm's real EEXIST wall, on both separators", () => {
  const isBinShimCollision = lift("isBinShimCollision");
  const win = "C:" + BS + "Users" + BS + "j" + BS + "AppData" + BS + "Roaming" + BS + "npm" + BS + "orc";
  // Captured verbatim from the failure this release fixes.
  const real = [
    "npm error code EEXIST",
    "npm error path " + win,
    "npm error EEXIST: file already exists",
    "npm error File exists: " + win,
    "npm error Remove the existing file and try again, or run npm",
    "npm error with --force to overwrite files recklessly.",
  ].join("\n");
  assert.strictEqual(isBinShimCollision(real), true, "the Windows wall this release was reported from");

  const posix =
    "npm error code EEXIST\nnpm error path /usr/local/bin/orc\nnpm error File exists: /usr/local/bin/orc";
  assert.strictEqual(isBinShimCollision(posix), true, "the same collision on a posix prefix");

  assert.strictEqual(
    isBinShimCollision("npm error code EEXIST\nnpm error path C:" + BS + "npm" + BS + "orc.cmd"),
    true,
    "the Windows .cmd shim"
  );
  assert.strictEqual(
    isBinShimCollision("npm error code EEXIST\nnpm error path C:" + BS + "npm" + BS + "orc.ps1"),
    true,
    "the Windows .ps1 shim"
  );
});

test("isBinShimCollision does not fire on an unrelated EEXIST, or on no EEXIST at all", () => {
  const isBinShimCollision = lift("isBinShimCollision");
  // --force overwrites files recklessly. Firing on any EEXIST anywhere in a
  // dependency tree would reach for it on a failure it cannot fix.
  assert.strictEqual(
    isBinShimCollision("npm error code EEXIST\nnpm error path /usr/local/lib/node_modules/left-pad"),
    false,
    "an EEXIST elsewhere in the tree is not the shim collision"
  );
  assert.strictEqual(
    isBinShimCollision("npm error code EEXIST\nnpm error path /usr/local/bin/orchestrator"),
    false,
    "`orchestrator` merely starts with the bin name — the path component must BE it"
  );
  assert.strictEqual(
    isBinShimCollision("npm error 404 Not Found - GET https://registry.npmjs.org/orc"),
    false,
    "no EEXIST, no collision"
  );
  assert.strictEqual(isBinShimCollision(""), false);
  assert.strictEqual(isBinShimCollision(null), false, "a null capture must not throw");
});

test("detectLegacyBinOwner reports by OWNERSHIP, never by directory name alone", () => {
  const src = cliSrc();
  const fn = src.slice(src.indexOf("function detectLegacyBinOwner() {"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(
    /if \(m\.name === PKG_NAME\) continue;/.test(body),
    "a directory called `orc` holding THIS package is not legacy — a machine that " +
      "never saw the rename land must not have its working install uninstalled"
  );
  assert.ok(
    /hasOwnProperty\.call\(bins, "orc"\)/.test(body),
    "the finding is that a package OWNS the `orc` bin; a package declaring no such " +
      "bin blocks nothing and must never be evicted"
  );
});

test("freshCliPath resolves the SCOPED directory first and verifies identity", () => {
  const src = cliSrc();
  const fn = src.slice(src.indexOf("function freshCliPath() {"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(
    /\[PKG_NAME, \.\.\.LEGACY_BIN_OWNERS\]/.test(body),
    "step 2 must run the NEW cli. Looking under <root>/orc first resolved the LEGACY " +
      "package and re-applied the very templates step 1 had just superseded"
  );
  assert.ok(
    /if \(m && m\.name !== PKG_NAME\) continue;/.test(body),
    "a directory that exists is not proof of identity"
  );
});

test("doctor carries a finding for the legacy package, and it is not --fix-able", () => {
  const src = cliSrc();
  const i = src.indexOf('"legacy-global-package"');
  assert.ok(i > 0, "the one finding that explains why `orc upgrade` cannot fix anything else");
  const block = src.slice(i, i + 1600);
  assert.ok(
    !/fixable: true/.test(block),
    "`orc doctor --fix` is scoped to this project's .claude/ — evicting a global npm " +
      "package is neither project-scoped nor something to do without saying so"
  );
  assert.ok(
    /fix_command: "orc upgrade"/.test(block),
    "the fix routes to the command that DOES it, announced"
  );
});

// ── The recovery steps have to SURVIVE the surfaces that show them ───────────
//
// The fix cannot reach the people who need it: a user still on the old package
// runs the OLD `orc upgrade`, so the only route left is a human reading the
// steps and typing them. That makes the CHANGELOG a load-bearing surface, and
// `orc ui`'s modal is where most people will read it — through
// `reflowMd(stripMd(body))`, which JOINS consecutive lines with a space.

// The changelog parser and the panel's markdown helpers, lifted the same way.
function changelogEntries() {
  const src = srcOf(path.join(REPO, "bin", "cli.js"));
  const i = src.indexOf("function parseChangelog(md) {");
  const fn = new Function(
    src.slice(i, src.indexOf("\n}\n", i) + 2) + "\nreturn parseChangelog;"
  )();
  return fn(srcOf(path.join(REPO, "CHANGELOG.md")));
}
function mdHelpers() {
  return new Function(
    srcOf(path.join(REPO, "bin", "webui", "js", "03-md.js")) +
      "\nreturn { stripMd, reflowMd };"
  )();
}

test("the newest changelog entry carries the manual recovery steps, up front", () => {
  const top = changelogEntries()[0];
  const { stripMd, reflowMd } = mdHelpers();
  const rendered = reflowMd(stripMd(top.body));
  const lines = rendered.split("\n");

  // Each command must be its OWN line. A fenced code block does NOT survive:
  // stripMd drops the fence and reflowMd then joins the commands into one
  // unusable run-on line. Bullets are the only form that renders as steps.
  const step = (cmd) => {
    const hit = lines.findIndex((l) => l.startsWith("• ") && l.includes(cmd));
    assert.ok(hit >= 0, "`" + cmd + "` must render as its own bullet line in orc ui");
    return hit;
  };
  const a = step("npm uninstall -g orc");
  const b = step("npm i -g @azure-id/orc");
  const c = step("orc update");
  assert.ok(a < b && b < c, "the steps must render in the order they must be run");

  // Up front: a recovery buried under six paragraphs of rationale is a recovery
  // nobody scrolls to.
  assert.ok(a < 6, "the steps must be near the top of the entry, not below the analysis");

  // And never the one thing that makes it worse.
  assert.ok(
    /Do not use npm i -g -f/.test(rendered),
    "--force leaves the superseded package installed underneath, owning nothing"
  );
});

test("stripMd strips an inline span that WRAPPED in the source", () => {
  const { stripMd } = mdHelpers();
  // CHANGELOG.md is hard-wrapped at ~78 columns, so a bold run or a code span
  // routinely straddles a newline. `.` does not match a newline, so these
  // survived unstripped — the panel showed literal asterisks, and a mispaired
  // backtick run swallowed the prose between two unrelated code spans.
  assert.strictEqual(stripMd("**a rename moved\nthe command**"), "a rename moved\nthe command");
  assert.strictEqual(stripMd("run `orc\nupgrade` now"), "run orc\nupgrade now");
  const two = stripMd("`orc\nupgrade` walked all three and `orc\nui` did the same");
  assert.ok(!two.includes("`"), "no backtick may survive: " + JSON.stringify(two));
  assert.ok(two.includes("walked all three"), "the prose between two spans must not be swallowed");

  // The real entry, end to end.
  const rendered = stripMd(changelogEntries()[0].body);
  assert.ok(!rendered.includes("**"), "no bold marker may reach the panel");
  assert.ok(!rendered.includes("`"), "no backtick may reach the panel");
});
