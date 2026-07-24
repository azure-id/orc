"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir } = require("./_helpers");

test("where prints the four payload target paths", () => {
  const dir = tmpdir();
  try {
    const r = cli(["where", "--dir", dir]);
    assert.strictEqual(r.status, 0);
    for (const seg of ["skills", "commands", "agents", "hooks", "settings", "config"]) {
      assert.match(r.stdout, new RegExp(seg), `where output should mention ${seg}`);
    }
  } finally {
    rmrf(dir);
  }
});

test("init writes an install manifest listing shipped files", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(claudeDir, "orc", "install-manifest.json"), "utf8"));
    assert.ok(m.version, "manifest has a version");
    assert.ok(Array.isArray(m.files) && m.files.length > 30, "manifest lists the payload");
    assert.ok(m.files.includes("hooks/orc-trace.js"), "manifest includes a hook");
    assert.ok(m.files.some((f) => f.startsWith("agents/orc-")), "manifest includes agents");
  } finally {
    rmrf(root);
  }
});

test("config set → override → reset roundtrip, with validator", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const ovr = path.join(claudeDir, "orc.config.yaml");

    const set = cli(["config", "set", "max_scouts", "4", "--dir", root]);
    assert.strictEqual(set.status, 0, "valid set exits 0");
    assert.match(fs.readFileSync(ovr, "utf8"), /max_scouts:\s*4/, "override persisted");

    const bad = cli(["config", "set", "max_scouts", "notanumber", "--dir", root]);
    assert.notStrictEqual(bad.status, 0, "invalid set is rejected (non-zero)");

    const reset = cli(["config", "reset", "max_scouts", "--dir", root]);
    assert.strictEqual(reset.status, 0, "reset exits 0");
    assert.doesNotMatch(fs.readFileSync(ovr, "utf8"), /^max_scouts:/m, "key removed after reset");
  } finally {
    rmrf(root);
  }
});

test("config: fable5_roles subset validator + fable5_effort rewrites the agents", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const ovr = path.join(claudeDir, "orc.config.yaml");

    // valid CSV subset persists as a flow array
    const ok = cli(["config", "set", "fable5_roles", "analyze,review", "--dir", root]);
    assert.strictEqual(ok.status, 0);
    assert.match(fs.readFileSync(ovr, "utf8"), /fable5_roles:\s*\[analyze, review\]/);

    // an unknown role is rejected
    const bad = cli(["config", "set", "fable5_roles", "analyze,bogus", "--dir", root]);
    assert.notStrictEqual(bad.status, 0, "unknown role rejected");

    // fable5_effort set rewrites the effort: line of every fable agent
    const setEff = cli(["config", "set", "fable5_effort", "xhigh", "--dir", root]);
    assert.strictEqual(setEff.status, 0);
    const agent = fs.readFileSync(path.join(claudeDir, "agents", "orc-analyst-fable-5.md"), "utf8");
    assert.match(agent, /^effort: xhigh$/m, "installed fable agent effort rewritten");
  } finally {
    rmrf(root);
  }
});

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

test("orc pattern status <lang> exits 1 when no pattern is cached", () => {
  const { root } = freshInstall();
  try {
    const r = cli(["pattern", "status", "python", "--dir", root]);
    assert.strictEqual(r.status, 1, "absent pattern → exit 1");
  } finally {
    rmrf(root);
  }
});

test("orc onboarding prints all sections when piped, and jumps to a topic", () => {
  const dir = tmpdir();
  try {
    const all = cli(["onboarding"]);
    assert.strictEqual(all.status, 0);
    assert.match(all.stdout, /What ORC is/, "prints the overview section");
    assert.match(all.stdout, /Troubleshooting/, "prints the last section");

    const topic = cli(["onboarding", "upgrade"]);
    assert.strictEqual(topic.status, 0);
    assert.match(topic.stdout, /Upgrade & after-upgrade/);

    const bad = cli(["onboarding", "nosuchtopic"]);
    assert.notStrictEqual(bad.status, 0, "unknown topic exits non-zero");
  } finally {
    rmrf(dir);
  }
});

test("orc doctor reports healthy on a clean install (exit 0)", () => {
  const { root } = freshInstall();
  try {
    const r = cli(["doctor", "--dir", root]);
    assert.strictEqual(r.status, 0, "clean install is healthy");
    assert.match(r.stdout, /healthy/i);
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

test("config: v0.33.0 keys validate (mock_example, tdd_loop_max, wiki_delta_full_threshold)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const ovr = path.join(claudeDir, "orc.config.yaml");

    assert.strictEqual(cli(["config", "set", "mock_example", "on", "--dir", root]).status, 0);
    assert.match(fs.readFileSync(ovr, "utf8"), /mock_example:\s*on/);
    assert.notStrictEqual(cli(["config", "set", "mock_example", "sometimes", "--dir", root]).status, 0, "bad enum rejected");

    assert.strictEqual(cli(["config", "set", "tdd_loop_max", "2", "--dir", root]).status, 0);
    assert.notStrictEqual(cli(["config", "set", "tdd_loop_max", "0", "--dir", root]).status, 0, "0 rejected (>=1)");

    assert.strictEqual(cli(["config", "set", "wiki_delta_full_threshold", "50", "--dir", root]).status, 0);
    assert.notStrictEqual(cli(["config", "set", "wiki_delta_full_threshold", "101", "--dir", root]).status, 0, ">100 rejected");
  } finally {
    rmrf(root);
  }
});

// ── orc wiki impact golden fixture ──────────────────────────────────────────
// A tiny git repo with one registered doc covering src/a.js. Impact must read
// CLEAN before any commit, DELTA (exit 2) after a covered-file commit, and
// FULL-recommended (exit 3) when an uncovered file lands (STRUCTURAL blind spot).
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
