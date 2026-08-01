"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir, REPO, FAKE_HOME } = require("./_helpers");

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

test("every config key documented in config.md resolves through the CLI registry", () => {
  const cliKeys = new Set(
    [
      ...fs
        .readFileSync(path.join(REPO, "bin", "cli.js"), "utf8")
        .matchAll(/\{\s*key:\s*"([a-z0-9_]+)"/g),
    ].map((m) => m[1])
  );
  const md = fs
    .readFileSync(path.join(REPO, "templates", "skills", "orc", "config.md"), "utf8")
    .replace(/\r\n/g, "\n");
  // the documented defaults block: `key: value` lines inside the yaml fence
  const fence = (md.match(/```yaml\n([\s\S]*?)```/) || [])[1] || "";
  const ALLOW = new Set(["rubric_bands_override"]); // hand-edit-only advanced key
  const documented = [...fence.matchAll(/^([a-z][a-z0-9_]+):/gm)].map((m) => m[1]);
  assert.ok(documented.length > 10, "parsed the documented config block");
  const phantom = documented.filter((k) => !cliKeys.has(k) && !ALLOW.has(k));
  assert.deepStrictEqual(phantom, [], "no documented key is unsettable via `orc config`");
});


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

test("config: opus5_only forces, warns about what it shadows, and honors the retired name", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const ovr = path.join(claudeDir, "orc.config.yaml");

    const bad = cli(["config", "set", "opus5_only", "yes", "--dir", root]);
    assert.notStrictEqual(bad.status, 0, "non-boolean rejected");

    // A key that changed NAME must not silently revert a user's setting: the
    // retired name is accepted, deprecation-warned, and WRITTEN as the new key.
    const legacy = cli(["config", "set", "opus5_executor_only", "true", "--dir", root]);
    assert.strictEqual(legacy.status, 0, "retired name still accepted");
    assert.match(legacy.stderr, /renamed to opus5_only/, "deprecation is stated");
    const text = fs.readFileSync(ovr, "utf8");
    assert.match(text, /^opus5_only:\s*true$/m, "written under the new name");
    assert.doesNotMatch(text, /^opus5_executor_only:/m, "retired name is not persisted");

    // Set-time notice: the roster + the tier cost, not just an "ok".
    const on = cli(["config", "set", "opus5_only", "true", "--dir", root]);
    assert.strictEqual(on.status, 0);
    assert.match(on.stdout, /orc-executor-opus-5-low/, "the executor ladder is shown");
    assert.match(on.stdout, /orc-wiki-scanner-opus-5-med/, "the fixed-role roster is shown");
    assert.match(on.stdout, /trace-writer-haiku-4-5/, "the excluded role is named");
    assert.match(on.stdout, /EVERY dispatch does/, "the tier cost is stated");

    // A setting the run will now ignore has to be called out, not left to rot.
    fs.appendFileSync(ovr, "rubric_bands_override: [{min: 0, max: 100}]\n");
    cli(["config", "set", "fable5_enabled", "true", "--dir", root]);
    const again = cli(["config", "set", "opus5_only", "true", "--dir", root]);
    assert.match(again.stderr, /INERT while opus5_only/, "shadowed keys are reported");
    assert.match(again.stderr, /fable5_enabled/, "fable5 named as shadowed");
    assert.match(again.stderr, /rubric_bands_override/, "hand-written table named as shadowed");

    const list = cli(["config", "list", "--dir", root]);
    assert.match(list.stdout, /INERT — opus5_only is true/, "config list marks the inert block");

    const off = cli(["config", "reset", "opus5_only", "--dir", root]);
    assert.strictEqual(off.status, 0);
    assert.doesNotMatch(fs.readFileSync(ovr, "utf8"), /^opus5_only:/m, "reset removes it");
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

test("orc pattern status: 0 cached, 1 absent, 2 unknown key", () => {
  const { root, claudeDir } = freshInstall();
  try {
    // A real INDEX.md key with nothing cached → absent.
    assert.strictEqual(cli(["pattern", "status", "express", "--dir", root]).status, 1, "absent → 1");

    // A key the payload has never heard of is a CALLER bug, not an absent
    // cache: probing `js` (a file extension) used to answer a clean "absent",
    // so the gate fell back correctly and the caller's bug read as a lane
    // defect for two whole evals.
    const unknown = cli(["pattern", "status", "js", "--dir", root]);
    assert.strictEqual(unknown.status, 2, "unknown language key → 2");
    assert.match(unknown.stdout, /unknown language key/);
    assert.match(unknown.stdout, /express/, "lists the real keys");

    // No argument, empty cache → the same absent contract.
    assert.strictEqual(cli(["pattern", "status", "--dir", root]).status, 1, "empty cache → 1");

    const dir = path.join(claudeDir, "orc", "patterns");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "express-pattern.md"), "# express pattern\n");
    assert.strictEqual(cli(["pattern", "status", "express", "--dir", root]).status, 0, "cached → 0");
    assert.strictEqual(cli(["pattern", "status", "--dir", root]).status, 0, "non-empty cache → 0");
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
