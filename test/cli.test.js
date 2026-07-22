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
    assert.match(flow, /orc-executor-opus-4-8-high/, "top band unclipped under a fable-5 tier");
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
