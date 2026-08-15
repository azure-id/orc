"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir, REPO, FAKE_HOME, webuiFiles } = require("../_helpers");


// `computeWikiFreshness` and everything downstream of it. Freshness is
// COVERAGE-RELATIVE: a doc is stale only when commits since ITS OWN
// scanned_commit touched files IT covers.
//
// Split out of cli.test.js in v0.48.1: a suite you have to scroll
// past 1 200 lines of to find one case is a suite nobody adds a case to.

function impactFixture() {
  const { root, claudeDir } = freshInstall();
  const git = (args) =>
    require("child_process").spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "t@t"]);
  git(["config", "user.name", "t"]);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  for (const n of ["a", "b", "c", "d"])
    fs.writeFileSync(path.join(root, "src", n + ".js"), "module.exports = 1;\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"]);
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  fs.mkdirSync(path.join(root, "wiki"), { recursive: true });
  // 4 docs, one covered file each — one touched doc = 25%, under the 30% default
  // threshold, so a single covered-file commit reads DELTA rather than FULL.
  for (const n of ["a", "b", "c", "d"])
    fs.writeFileSync(
      path.join(root, "wiki", `orc-feature-${n}.md`),
      [
        "---",
        "wiki_schema: 2",
        "doc_type: feature",
        `area: ${n}`,
        `covers: [src/${n}.js]`,
        `keywords: [${n}]`,
        "scanned_at: 010126 00:00:00",
        `scanned_commit: ${head}`,
        "covered_files:",
        `  src/${n}.js: abc123`,
        "status: fresh",
        "---",
        "",
        `# ${n.toUpperCase()} Overview`,
        "",
        "## TL;DR",
        `- covers src/${n}.js`,
        "",
      ].join("\n")
    );
  const sync = cli(["wiki", "sync", "--dir", root]);
  assert.strictEqual(sync.status, 0, "sync registers the fixture doc: " + sync.stdout + sync.stderr);
  return { root, claudeDir, git };
}

test("orc wiki impact: CLEAN → DELTA (exit 2) → STRUCTURAL/FULL (exit 3)", () => {
  const { root, git } = impactFixture();
  try {
    const clean = cli(["wiki", "impact", "--dir", root]);
    assert.strictEqual(clean.status, 0, "no commits since scan → CLEAN: " + clean.stdout);
    assert.match(clean.stdout, /CLEAN/);

    fs.writeFileSync(path.join(root, "src", "a.js"), "module.exports = 2;\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "touch covered file"]);
    const delta = cli(["wiki", "impact", "--dir", root]);
    assert.strictEqual(delta.status, 2, "covered-file commit → DELTA: " + delta.stdout);
    assert.match(delta.stdout, /TOUCHED \(1\)/);

    fs.writeFileSync(path.join(root, "lib.py"), "x = 1\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "uncovered file"]);
    const full = cli(["wiki", "impact", "--dir", root]);
    assert.strictEqual(full.status, 3, "blind-spot file → FULL recommended: " + full.stdout);
    assert.match(full.stdout, /STRUCTURAL blind spot/);
    assert.match(full.stdout, /FULL refresh recommended/);
  } finally {
    rmrf(root);
  }
});

// ── v0.34.5 wiki: silent tag loss, and a delta that cannot clear itself ─────

function writeTag(root, dirParts, name, tag, kind) {
  const dir = path.join(root, "wiki", "crosslink", ...dirParts);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, name),
    [
      "---",
      "crosslink_schema: 1",
      `tag: ${tag}`,
      `kind: ${kind}`,
      "surface: provided",
      "anchor: src/a.js:1",
      "content_hash: abc123",
      "---",
      "",
      "## Contract",
      "- shape",
      "",
    ].join("\n")
  );
}

test("wiki sync: a kind containing '/' is indexed, not silently dropped", () => {
  const { root } = impactFixture();
  try {
    writeTag(root, ["rest-endpoint"], "GET__orders.md", "rest-endpoint:GET /orders", "rest-endpoint");
    // The payload's own catalog ships `auth/oidc`. Legacy wikis wrote it as a
    // NESTED directory, which the old single-level walk never saw.
    writeTag(root, ["auth", "oidc"], "fixture-bearer-token.md", "auth/oidc:fixture-bearer-token", "auth/oidc");

    const r = cli(["wiki", "sync", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /2 crosslink tags indexed/, "both tags reach the registry: " + r.stdout);

    const meta = JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "wiki-meta.json"), "utf8"));
    const kinds = meta.crosslink_provided.map((p) => p.kind).sort();
    assert.deepStrictEqual(kinds, ["auth/oidc", "rest-endpoint"], "kind comes from the HEADER, verbatim");
    assert.strictEqual(cli(["wiki", "sync", "--check", "--dir", root]).status, 0, "in sync → exit 0");
  } finally {
    rmrf(root);
  }
});

test("wiki sync --check: a tag file that does not reach the registry FAILS (exit 1)", () => {
  const { root } = impactFixture();
  try {
    writeTag(root, ["rest-endpoint"], "GET__orders.md", "rest-endpoint:GET /orders", "rest-endpoint");
    assert.strictEqual(cli(["wiki", "sync", "--dir", root]).status, 0);

    // A tag file with no `tag:` header — published, on disk, unresolvable.
    const dir = path.join(root, "wiki", "crosslink", "rest-endpoint");
    fs.writeFileSync(path.join(dir, "broken.md"), "---\nkind: rest-endpoint\n---\n\nno tag header\n");

    const chk = cli(["wiki", "sync", "--check", "--dir", root]);
    assert.strictEqual(chk.status, 1, "found != indexed must never exit 0");
    assert.match(chk.stdout + chk.stderr, /did NOT reach the registry/);
  } finally {
    rmrf(root);
  }
});

test("wiki sync --check: a branch switch alone is NOT out of sync (exit 0)", () => {
  const { root, git } = impactFixture();
  try {
    assert.strictEqual(cli(["wiki", "sync", "--dir", root]).status, 0);
    git(["checkout", "-q", "-b", "feature/some-work"]);
    const chk = cli(["wiki", "sync", "--check", "--dir", root]);
    assert.strictEqual(chk.status, 0, "only `branch` changed — nothing is unindexed: " + chk.stdout);
    assert.match(chk.stdout, /in sync/);
  } finally {
    rmrf(root);
  }
});

// Normal development on ONE documented area, well past wiki_aging_max. Every
// commit lands on a file a doc covers, so this is ordinary work — not a
// coverage gap. It is the state every real repo reaches, and the one the frozen
// oldest-doc anchor turned into a permanent STALE that no refresh could clear.
function churn(root, git, n, name = "a") {
  for (let i = 0; i < n; i++) {
    fs.writeFileSync(path.join(root, "src", name + ".js"), `module.exports = ${i + 2};\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", `edit ${name} ${i}`]);
  }
}

// The delta refresh: re-stamp ONLY the named doc at HEAD, exactly as the default
// refresh path does. Every other doc keeps its original anchor — which is
// precisely why `meta.scan_commit` never moves.
function deltaRefresh(root, git, name) {
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const docPath = path.join(root, "wiki", `orc-feature-${name}.md`);
  fs.writeFileSync(
    docPath,
    fs.readFileSync(docPath, "utf8").replace(/scanned_commit: .*/, `scanned_commit: ${head}`)
  );
  assert.strictEqual(cli(["wiki", "sync", "--dir", root]).status, 0);
  return head;
}

test("wiki status: a delta refresh MOVES the freshness anchor (regression: same hash, STALE forever)", () => {
  const { root, git } = impactFixture();
  try {
    churn(root, git, 40); // 40 > wiki_aging_max 30

    const before = cli(["wiki", "status", "--dir", root]);
    assert.match(before.stdout, /STALE/, "doc a's covered file changed 40 times → STALE: " + before.stdout);
    const anchorBefore = before.stdout.match(/freshness anchor ([0-9a-f]+)/);
    assert.ok(anchorBefore, "the tier-pinning anchor is shown: " + before.stdout);

    deltaRefresh(root, git, "a");

    const after = cli(["wiki", "status", "--dir", root]);
    assert.doesNotMatch(after.stdout, /STALE/, "the refresh cleared the staleness it was run for: " + after.stdout);
    assert.match(after.stdout, /FRESH/, "no doc's covered files have changed since its own anchor: " + after.stdout);
    const anchorAfter = after.stdout.match(/freshness anchor ([0-9a-f]+)/);
    assert.ok(anchorAfter);
    assert.notStrictEqual(
      anchorAfter[1],
      anchorBefore[1],
      "the reported hash MOVED — pre-fix it was the frozen oldest-doc anchor forever"
    );
  } finally {
    rmrf(root);
  }
});

test("wiki status: docs whose own area never changed stay FRESH through heavy churn elsewhere", () => {
  const { root, git } = impactFixture();
  try {
    // 40 commits, all on src/a.js. Docs b/c/d cover untouched files — a doc
    // about auth does not rot because another area changed 40 times.
    churn(root, git, 40);
    const r = cli(["wiki", "status", "--dir", root]);
    assert.match(r.stdout, /3 fresh/, "b/c/d are untouched and stay fresh: " + r.stdout);
    assert.match(r.stdout, /1 stale/, "only doc a rotted: " + r.stdout);
    assert.match(r.stdout, /orc-feature-a\.md/, "the offending doc is named: " + r.stdout);
  } finally {
    rmrf(root);
  }
});

test("wiki status: a changed covered file IS stale — the fix must not over-correct to always-FRESH", () => {
  const { root, git } = impactFixture();
  try {
    churn(root, git, 12);
    const r = cli(["wiki", "status", "--dir", root]);
    assert.match(r.stdout, /AGING|STALE/, "doc a's own surface moved: " + r.stdout);
    assert.match(r.stdout, /orc-feature-a\.md/, "the offending doc is named: " + r.stdout);
  } finally {
    rmrf(root);
  }
});

test("wiki status: the tier edges come from config, not hardcoded 10/30", () => {
  const { root, git } = impactFixture();
  try {
    churn(root, git, 12);
    assert.match(cli(["wiki", "status", "--dir", root]).stdout, /AGING/, "12c is AGING at the default edges");

    // Raising the fresh edge past the distance must move the tier. Pre-fix this
    // did nothing at all: wikiStatus never read the config.
    assert.strictEqual(cli(["config", "set", "wiki_fresh_max", "50", "--dir", root]).status, 0);
    const r = cli(["wiki", "status", "--dir", root]);
    assert.match(r.stdout, /FRESH/, "wiki_fresh_max moved the boundary: " + r.stdout);
    assert.match(r.stdout, /fresh < 50c/, "the edges in force are shown: " + r.stdout);
  } finally {
    rmrf(root);
  }
});

test("wiki status: a blind spot degrades ONE step to AGING — never straight to STALE", () => {
  const { root, git } = impactFixture();
  try {
    fs.mkdirSync(path.join(root, "src", "new"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "new", "unseen.js"), "module.exports = 9;\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "add an area no doc covers"]);
    const r = cli(["wiki", "status", "--dir", root]);
    // Every repo eventually grows a file no doc covers. Forcing STALE on that
    // would recreate the permanent-STALE bug from the other direction: the docs
    // on disk are accurate, the COVERAGE is merely incomplete.
    assert.match(r.stdout, /AGING/, "a coverage gap is not doc rot: " + r.stdout);
    assert.doesNotMatch(r.stdout, /STALE \(/, "never straight to STALE: " + r.stdout);
    assert.match(r.stdout, /blind spot/i, "the reason is named, not just the verdict: " + r.stdout);
    assert.match(r.stdout, /4 fresh/, "no individual doc rotted: " + r.stdout);
  } finally {
    rmrf(root);
  }
});

test("wiki status --json: machine-readable freshness for hooks and skills", () => {
  const { root, git } = impactFixture();
  try {
    churn(root, git, 40);
    deltaRefresh(root, git, "a");
    const r = cli(["wiki", "status", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, "--json never overloads the exit code (that is the existence probe's contract)");
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.state, "registered");
    assert.strictEqual(j.tier, "FRESH", "a completed delta refresh reads FRESH: " + r.stdout);
    assert.strictEqual(j.docs, 4);
    assert.strictEqual(j.edges.freshMax, 10);
    assert.strictEqual(j.edges.agingMax, 30);
    assert.ok(typeof j.distance === "number", "distance is a number for hooks to compare");
  } finally {
    rmrf(root);
  }
});

test("wiki impact: a completed delta refresh exits 0 CLEAN instead of recommending FULL forever", () => {
  const { root, git } = impactFixture();
  try {
    // Pre-fix: 40 commits put the frozen scan_commit past wiki_aging_max, so
    // `aging` stayed permanently true and impact exited 3 "FULL refresh
    // recommended" — the expensive re-scan the delta path exists to avoid —
    // even after the delta refresh had done its job and every doc read CLEAN.
    churn(root, git, 40);
    assert.strictEqual(cli(["wiki", "impact", "--dir", root]).status, 3, "FULL recommended while doc a is genuinely rotten");
    deltaRefresh(root, git, "a");
    const r = cli(["wiki", "impact", "--dir", root]);
    assert.strictEqual(r.status, 0, "no doc touched, nothing blind → CLEAN: " + r.stdout);
    assert.doesNotMatch(r.stdout, /FULL refresh recommended/, r.stdout);
  } finally {
    rmrf(root);
  }
});

test("wiki impact: a doc refreshed at HEAD reads CLEAN even when the global anchor is behind", () => {
  const { root, git } = impactFixture();
  try {
    fs.writeFileSync(path.join(root, "src", "a.js"), "module.exports = 2;\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "touch a"]);
    assert.strictEqual(cli(["wiki", "impact", "--dir", root]).status, 2, "DELTA before the refresh");

    // Simulate the delta refresh: doc a is re-scanned at HEAD; b/c/d are
    // untouched, so they keep the OLD anchor — which is what pins scan_commit.
    const head = git(["rev-parse", "HEAD"]).stdout.trim();
    const docPath = path.join(root, "wiki", "orc-feature-a.md");
    fs.writeFileSync(
      docPath,
      fs.readFileSync(docPath, "utf8").replace(/scanned_commit: .*/, `scanned_commit: ${head}`)
    );
    assert.strictEqual(cli(["wiki", "sync", "--dir", root]).status, 0);

    const after = cli(["wiki", "impact", "--dir", root]);
    assert.strictEqual(after.status, 0, "a correct delta refresh can now clear its own delta: " + after.stdout);
    assert.match(after.stdout, /CLEAN\s+wiki\/orc-feature-a\.md/, "the refreshed doc reads CLEAN");
    assert.match(after.stdout, /affected/, "the percentage is labelled by what it counts");
  } finally {
    rmrf(root);
  }
});

test("orc wiki impact: exit 1 when the wiki is absent", () => {
  const { root } = freshInstall();
  try {
    const r = cli(["wiki", "impact", "--dir", root]);
    assert.strictEqual(r.status, 1);
  } finally {
    rmrf(root);
  }
});

test("orc wiki sync: crosslink/atlas.md is derived — never indexed, never skipped-reported, never deleted", () => {
  const { root } = impactFixture();
  try {
    const atlas = path.join(root, "wiki", "crosslink", "atlas.md");
    fs.mkdirSync(path.dirname(atlas), { recursive: true });
    fs.writeFileSync(atlas, "# Federation atlas\ngenerated_from: fixture\n");
    const r = cli(["wiki", "sync", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.ok(fs.existsSync(atlas), "atlas survives sync");
    const index = fs.readFileSync(path.join(root, "wiki", "INDEX.md"), "utf8");
    assert.doesNotMatch(index, /atlas\.md/, "atlas never registered as a doc");
    assert.doesNotMatch(r.stdout, /atlas\.md/, "atlas never reported as a skipped doc");
  } finally {
    rmrf(root);
  }
});
