"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir, REPO, FAKE_HOME, webuiFiles } = require("../_helpers");


// `orc init` / `update` / `--prune` / `doctor`, and the two integrity guards.
// The P0 this file exists for: v0.34.1, when `orc update` recursively deleted
// every run checkpoint because the manifest bounds the PRUNE, not the copy.
//
// Split out of cli.test.js in v0.48.1: a suite you have to scroll
// past 1 200 lines of to find one case is a suite nobody adds a case to.

// ── v0.34.1 install integrity (P0: `orc update` destroyed all run state) ────

test("update preserves run state (the P0) and never re-copies it", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const runDir = path.join(claudeDir, "orc", "run", "probe");
    fs.mkdirSync(runDir, { recursive: true });
    const cp = path.join(runDir, "checkpoint.json");
    const bytes = '{"paused":true,"wave":2}\n';
    fs.writeFileSync(cp, bytes);

    assert.strictEqual(cli(["update", "--dir", root]).status, 0);
    assert.ok(fs.existsSync(cp), "checkpoint survives an update");
    assert.strictEqual(fs.readFileSync(cp, "utf8"), bytes, "checkpoint bytes unchanged");

    // doctor --fix is the ADVERTISED repair path — the one users run mid-run.
    cli(["doctor", "--fix", "--dir", root]);
    assert.strictEqual(fs.readFileSync(cp, "utf8"), bytes, "checkpoint survives doctor --fix");
  } finally {
    rmrf(root);
  }
});

test("update migrates pre-0.34.1 run state out of the payload tree, exactly once", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const legacy = path.join(claudeDir, "skills", "orc", "run", "old-run");
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, "checkpoint.json"), '{"wave":1}');

    assert.strictEqual(cli(["update", "--dir", root]).status, 0);
    const moved = path.join(claudeDir, "orc", "run", "old-run", "checkpoint.json");
    assert.ok(fs.existsSync(moved), "legacy run state lands at the new path");
    assert.ok(!fs.existsSync(legacy), "legacy copy is gone (moved, not duplicated)");

    // A second update must be a no-op, not a re-migration or a clobber.
    fs.writeFileSync(moved, '{"wave":9}');
    assert.strictEqual(cli(["update", "--dir", root]).status, 0);
    assert.strictEqual(fs.readFileSync(moved, "utf8"), '{"wave":9}', "no re-migration clobber");
  } finally {
    rmrf(root);
  }
});

test("update leaves the installed payload byte-identical to the shipped one", () => {
  const { root, claudeDir } = freshInstall();
  try {
    assert.strictEqual(cli(["update", "--dir", root]).status, 0);
    const src = path.join(REPO, "templates", "agents");
    for (const f of fs.readdirSync(src)) {
      const a = fs.readFileSync(path.join(src, f));
      const b = fs.readFileSync(path.join(claudeDir, "agents", f));
      assert.ok(a.equals(b), `agents/${f} installed byte-identical`);
    }
    const spine = path.join("skills", "orc", "SKILL.md");
    assert.ok(
      fs.readFileSync(path.join(REPO, "templates", spine)).equals(
        fs.readFileSync(path.join(claudeDir, spine))
      ),
      "the orc spine is installed byte-identical"
    );
  } finally {
    rmrf(root);
  }
});

test("prune: an unowned ORC-named file is REPORTED with a manifest present, deleted only with --prune", () => {
  const { root, claudeDir } = freshInstall();
  try {
    // manifest intact (the case the old early-return silenced entirely)
    const ghost = path.join(claudeDir, "agents", "orc-retired-opus-4-8-high.md");
    fs.writeFileSync(ghost, "retired");

    const rep = cli(["update", "--dir", root]);
    assert.strictEqual(rep.status, 0);
    assert.match(rep.stdout, /orc-retired-opus-4-8-high\.md/, "candidate is reported");
    assert.match(rep.stdout, /--prune/, "the fix is named");
    assert.ok(fs.existsSync(ghost), "never deleted without --prune");

    assert.strictEqual(cli(["update", "--dir", root, "--prune"]).status, 0);
    assert.ok(!fs.existsSync(ghost), "--prune removes it");
  } finally {
    rmrf(root);
  }
});

test("house-rules card: markers intact, <=10 lines, and the destructive-git rule present", () => {
  const card = fs
    .readFileSync(
      path.join(REPO, "templates", "skills", "orc", "references", "house-rules.md"),
      "utf8"
    )
    .replace(/\r\n/g, "\n");
  const m = card.match(/<!-- card-start -->\n([\s\S]*?)<!-- card-end -->/);
  assert.ok(m, "card-start/card-end markers intact");
  const lines = m[1].trim().split("\n");
  assert.ok(lines.length <= 10, `card is ${lines.length} lines — budget is 10 (it rides every dispatch)`);
  assert.ok(
    lines.some((l) => /git checkout\/restore\/reset\/stash\/clean/.test(l)),
    "rule 7 (no destructive worktree commands) is in the injected card"
  );
  assert.ok(
    lines.some((l) => /impossible assertion is `unmet`/.test(l)),
    "…including the clause that an unsatisfiable assertion is unmet, not something to make true"
  );

  // The bound must also reach the executors themselves, via the TEMPLATE.
  const tpl = fs.readFileSync(path.join(REPO, "agents-src", "executor.template.md"), "utf8");
  assert.match(tpl, /OTHERWISE CHANGE\s*\n?\s*THE STATE OF/, "template bounds worktree state, not just writes");
  for (const f of fs.readdirSync(path.join(REPO, "templates", "agents")).filter((n) => n.startsWith("orc-executor-"))) {
    const gen = fs.readFileSync(path.join(REPO, "templates", "agents", f), "utf8");
    assert.match(gen, /revert or discard/, `${f} carries the regenerated write-bound`);
  }
});

test("verify-package guards EVERY agent file (required[] ∪ generated == disk)", () => {
  const guarded = new Set(
    fs
      .readFileSync(path.join(REPO, "bin", "verify-package.js"), "utf8")
      .split("\n")
      .map((l) => (l.match(/"(templates\/agents\/[^"]+)"/) || [])[1])
      .filter(Boolean)
      .map((p) => p.replace("templates/agents/", ""))
  );
  const generated = fs
    .readFileSync(path.join(REPO, "bin", "build-agents.js"), "utf8")
    .matchAll(/name:\s*"(orc-executor-[a-z0-9-]+)"/g);
  for (const m of generated) guarded.add(m[1] + ".md");

  const onDisk = fs.readdirSync(path.join(REPO, "templates", "agents"));
  const unguarded = onDisk.filter((f) => !guarded.has(f));
  assert.deepStrictEqual(unguarded, [], "every shipped agent file is named by a guard");
});

// v0.48.1 — bin/webui/ went from 8 files to ~60. The explicit list stays (a
// dropped file is reported BY NAME, which a count never does) and gains the
// same set-equality guard the agent files already have: the two must agree in
// BOTH directions, so a new panel file cannot be added unguarded and a deleted
// one cannot linger in the list.
test("verify-package guards EVERY panel file (required[] == bin/webui on disk)", () => {
  const listed = new Set(
    fs
      .readFileSync(path.join(REPO, "bin", "verify-package.js"), "utf8")
      .split("\n")
      .map((l) => (l.match(/"bin\/webui\/([^"]+)"/) || [])[1])
      .filter(Boolean)
  );
  const onDisk = new Set(webuiFiles());

  const unguarded = [...onDisk].filter((f) => !listed.has(f)).sort();
  assert.deepStrictEqual(unguarded, [], "every file the panel ships must be named in verify-package.js");

  const phantom = [...listed].filter((f) => !onDisk.has(f)).sort();
  assert.deepStrictEqual(phantom, [], "verify-package.js names a panel file that no longer exists");
});

test("doctor warns about a stale GLOBAL install that can win skill resolution", () => {
  const { root } = freshInstall();
  const globalRoot = path.join(FAKE_HOME, "global-probe");
  try {
    // ~/.claude is the fake HOME: install there, then skew its stamp + plant a
    // retired agent name that a dispatch would silently resolve against.
    assert.strictEqual(cli(["init", "--dir", FAKE_HOME]).status, 0);
    const gClaude = path.join(FAKE_HOME, ".claude");
    fs.writeFileSync(
      path.join(gClaude, "hooks", "orc-version.json"),
      JSON.stringify({ version: "0.9.9" })
    );
    fs.writeFileSync(path.join(gClaude, "agents", "orc-executor-opus-4-8-med.md"), "retired");

    const r = cli(["doctor", "--dir", root]);
    assert.strictEqual(r.status, 1, "skew is an issue, not a pass");
    assert.match(r.stdout, /GLOBAL install/, "names the global skew");
    assert.match(r.stdout, /0\.9\.9/, "names the global version");
    assert.match(r.stdout, /orc-executor-opus-4-8-med\.md/, "names the shadowing agent");
  } finally {
    rmrf(root);
    rmrf(globalRoot);
    rmrf(path.join(FAKE_HOME, ".claude"));
  }
});

test("orc doctor reports healthy on a clean install (exit 0)", () => {
  const { root } = freshInstall();
  try {
    const r = cli(["doctor", "--dir", root]);
    assert.strictEqual(r.status, 0, "clean install is healthy");
    assert.match(r.stdout, /healthy/i);

    // --json renders the SAME verdict, machine-readably: exactly one object on
    // stdout (no banner, no colour) and the SAME exit code — the flag changes
    // the rendering, never the semantics.
    const j = cli(["doctor", "--json", "--dir", root]);
    assert.strictEqual(j.status, 0, "--json keeps the human exit code");
    const rep = JSON.parse(j.stdout); // throws if anything else was printed
    assert.strictEqual(rep.ok, true, "healthy install reports ok:true");
    assert.deepStrictEqual(rep.findings, [], "no findings on a clean install");
    assert.strictEqual(rep.fixable, false, "nothing to fix");
    assert.strictEqual(rep.package_version, rep.installed_version, "versions agree");
    assert.ok(rep.claude_dir.includes(".claude"), "names the target dir");
    assert.strictEqual(rep.global_install.present, false, "fake HOME has no global install");

    // A mutation is not a read-only report — mixing them is refused, not guessed.
    const mixed = cli(["doctor", "--json", "--fix", "--dir", root]);
    assert.strictEqual(mixed.status, 1, "--json --fix is refused");
    assert.match(mixed.stderr, /read-only/, "says why");
  } finally {
    rmrf(root);
  }
});

test("orc doctor detects an orphan and a version skew (exit 1)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    // plant a manifest orphan + skew the payload version stamp
    const orphan = path.join(claudeDir, "agents", "orc-ghost-opus-4-8-high.md");
    fs.writeFileSync(orphan, "ghost");
    const mp = path.join(claudeDir, "orc", "install-manifest.json");
    const m = JSON.parse(fs.readFileSync(mp, "utf8"));
    m.files.push("agents/orc-ghost-opus-4-8-high.md");
    fs.writeFileSync(mp, JSON.stringify(m));
    fs.writeFileSync(path.join(claudeDir, "hooks", "orc-version.json"), JSON.stringify({ version: "0.1.0" }));

    const r = cli(["doctor", "--dir", root]);
    assert.strictEqual(r.status, 1, "issues → exit 1");
    assert.match(r.stdout, /orphan/i);
    assert.match(r.stdout, /payload version 0\.1\.0/);

    const j = cli(["doctor", "--json", "--dir", root]);
    assert.strictEqual(j.status, 1, "--json keeps the failing exit code");
    const rep = JSON.parse(j.stdout);
    assert.strictEqual(rep.ok, false);
    assert.ok(rep.findings.length >= 2, "both findings are reported");
    const ids = rep.findings.map((f) => f.id);
    assert.ok(ids.includes("version-skew"), "skew has a stable id");
    assert.ok(ids.includes("orphan"), "orphan has a stable id");
    assert.strictEqual(rep.installed_version, "0.1.0", "reports what is on disk");
    assert.strictEqual(rep.fixable, true, "`doctor --fix` would address these");
    const orphan_f = rep.findings.find((f) => f.id === "orphan");
    assert.ok(
      orphan_f.paths.includes("agents/orc-ghost-opus-4-8-high.md"),
      "the JSON path carries the FULL orphan list (the human one truncates)"
    );
  } finally {
    rmrf(root);
  }
});

test("update prunes a manifest orphan but keeps user files", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const orphan = path.join(claudeDir, "agents", "orc-oldname-sonnet-5-high.md");
    const userFile = path.join(claudeDir, "agents", "my-custom-agent.md");
    fs.writeFileSync(orphan, "old");
    fs.writeFileSync(userFile, "mine");
    const mp = path.join(claudeDir, "orc", "install-manifest.json");
    const m = JSON.parse(fs.readFileSync(mp, "utf8"));
    m.files.push("agents/orc-oldname-sonnet-5-high.md");
    fs.writeFileSync(mp, JSON.stringify(m));

    const r = cli(["update", "--dir", root]);
    assert.strictEqual(r.status, 0);
    assert.ok(!fs.existsSync(orphan), "manifest orphan is pruned");
    assert.ok(fs.existsSync(userFile), "user-authored file survives");
  } finally {
    rmrf(root);
  }
});

test("pre-manifest install warns, and only deletes with --prune", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const orphan = path.join(claudeDir, "agents", "orc-ghost-opus-4-8-high.md");
    // simulate an install predating manifests
    fs.rmSync(path.join(claudeDir, "orc", "install-manifest.json"));
    fs.writeFileSync(orphan, "ghost");

    const warn = cli(["update", "--dir", root]);
    assert.strictEqual(warn.status, 0);
    assert.ok(fs.existsSync(orphan), "never auto-deletes without a manifest");
    assert.match(warn.stdout, /--prune/, "offers --prune");

    // stay pre-manifest, then explicitly prune
    fs.rmSync(path.join(claudeDir, "orc", "install-manifest.json"));
    const pruned = cli(["update", "--dir", root, "--prune"]);
    assert.strictEqual(pruned.status, 0);
    assert.ok(!fs.existsSync(orphan), "--prune removes the ORC-named orphan");
  } finally {
    rmrf(root);
  }
});

// ── v0.37.0 stacked PRs: the template generator + the exit-code probe ───────

// A FILLED plan, mirroring the schema in _shared/stack-plan.md. The driver's
// hard gate branches on `orc pr stack status`, so READY must be reachable.
