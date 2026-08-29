"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir, REPO, FAKE_HOME, webuiFiles } = require("../_helpers");


// `orc config` get/set/list/reset, the validators, and the forcing modes
// (`opus5_only`, `fable5_*`) — including what each one SHADOWS, because a
// shadowed setting must never be silent.
//
// Split out of cli.test.js in v0.48.1: a suite you have to scroll
// past 1 200 lines of to find one case is a suite nobody adds a case to.

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
    const again = cli(["config", "set", "opus5_only", "true", "--dir", root]);
    assert.match(again.stderr, /INERT while opus5_only/, "shadowed keys are reported");
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

test("config: a RETIRED key is refused by name, survives on disk, and is reported", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const ovr = path.join(claudeDir, "orc.config.yaml");

    // A key ORC REMOVED is not the same thing as a key ORC never had. A
    // generic "unknown config key" list would send the user hunting for a typo
    // in a name that was correct until this release, so the refusal names it.
    const set = cli(["config", "set", "fable5_roles", "analyze,review", "--dir", root]);
    assert.notStrictEqual(set.status, 0, "a retired key is refused");
    assert.match(set.stderr, /fable5_roles was removed in v1\.0\.0/, "refused BY NAME, with the version");
    assert.match(set.stderr, /Fable 5 role override was removed/, "and with the reason");
    assert.doesNotMatch(set.stderr, /Unknown config key/, "never the generic unknown-key list");

    // A line already on disk is LEFT ALONE — a user's file is never rewritten
    // — but it must not read as a setting that works. Both surfaces say so.
    fs.appendFileSync(ovr, "fable5_enabled: true\nfable5_effort: xhigh\n");
    const list = cli(["config", "list", "--dir", root]);
    assert.strictEqual(list.status, 0);
    assert.match(list.stdout, /Retired — still on disk, no longer read/, "human branch has the section");
    assert.match(list.stdout, /fable5_enabled/, "and names the key");
    assert.doesNotMatch(list.stdout, /Other \(hand-edited\) overrides[\s\S]*fable5_enabled/,
      "a retired key is never filed as a hand-edited override");

    // `--json is not a summary`: the human branch prints it, so the JSON
    // carries it, or a panel is structurally unable to be as honest.
    const j = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    const names = j.retired_keys.map((r) => r.key).sort();
    assert.deepStrictEqual(names, ["fable5_effort", "fable5_enabled"]);
    for (const r of j.retired_keys) {
      assert.strictEqual(r.removed_in, "1.0.0");
      assert.ok(r.why && r.why.length, r.key + " carries no reason");
    }
    assert.ok(!j.keys.some((k) => k.key.startsWith("fable5")), "not a registry key any more");
    assert.ok(!j.hand_edited.some((k) => k.key.startsWith("fable5")), "not a hand-edited key either");
    assert.match(fs.readFileSync(ovr, "utf8"), /^fable5_enabled: true$/m, "the user's line is untouched");
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

// ── v0.40.0 gotchas (repair memory) ─────────────────────────────────────────

// One well-formed entry, per the format _shared/gotchas.md pins.

test("config: gotchas + gotchas_max roundtrip through set/list/reset", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const ovr = path.join(claudeDir, "orc.config.yaml");

    assert.strictEqual(cli(["config", "set", "gotchas", "off", "--dir", root]).status, 0);
    assert.match(fs.readFileSync(ovr, "utf8"), /gotchas:\s*off/);
    assert.notStrictEqual(cli(["config", "set", "gotchas", "sometimes", "--dir", root]).status, 0, "bad enum rejected");

    assert.strictEqual(cli(["config", "set", "gotchas_max", "60", "--dir", root]).status, 0);
    assert.notStrictEqual(cli(["config", "set", "gotchas_max", "4", "--dir", root]).status, 0, "<5 rejected");
    assert.notStrictEqual(cli(["config", "set", "gotchas_max", "lots", "--dir", root]).status, 0, "non-integer rejected");

    const list = cli(["config", "list", "--dir", root]);
    assert.match(list.stdout, /gotchas\s+off/, "list shows the override");
    assert.match(list.stdout, /gotchas_max\s+60/);

    assert.strictEqual(cli(["config", "reset", "gotchas", "--dir", root]).status, 0);
    assert.strictEqual(cli(["config", "reset", "gotchas_max", "--dir", root]).status, 0);
    const after = fs.readFileSync(ovr, "utf8");
    assert.doesNotMatch(after, /^gotchas:/m, "reset removes gotchas");
    assert.doesNotMatch(after, /^gotchas_max:/m, "reset removes gotchas_max");
  } finally {
    rmrf(root);
  }
});


// ── the config data model (v1.0.0 W2) ───────────────────────────────────────
//
// `answers[]` + CONFIG_FAMILIES replaced a shadowReason() that branched on key
// NAMES. The strings did not move (test/goldens.test.js pins them); what is new
// is that the reason a key is shadowed is now a RANK, and a rank is data a lint
// and a panel can both read.

test("config: every key answers a declared family, and the two contested ones are a real ladder", () => {
  const { root } = freshInstall();
  try {
    const j = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    assert.strictEqual(j.keys.length, 72);
    for (const k of j.keys) {
      assert.ok(k.answers && k.answers.length, k.key + " declares no answers[]");
      for (const a of k.answers) assert.ok(j.families[a.family], k.key + " → unknown family " + a.family);
      // The convenience scalars are the FIRST answer, never a third opinion.
      assert.strictEqual(k.family, k.answers[0].family);
      assert.strictEqual(k.prio, k.answers[0].prio);
    }
    // Two keys answer TWO questions each. That is the whole reason `answers` is
    // an array: `extra_enabled` and `opus5_only` decide the executor band AND
    // the fixed-role model, and one family would invent a contest between keys
    // that are not competing.
    const twoAnswers = j.keys.filter((k) => k.answers.length > 1).map((k) => k.key);
    assert.deepStrictEqual(twoAnswers, ["extra_enabled", "opus5_only"]);

    const band = j.families["executor-band"];
    assert.strictEqual(band.contested, true);
    assert.deepStrictEqual(
      band.ranks.map((r) => [r.prio, r.key]),
      [
        ["P0", "extra_enabled"],
        ["P1", "opus5_only"],
        ["P2", "rubric_bands_override"],
        ["P3", null],
      ]
    );
    // The lowest rank is TOTAL, and it is a ROW rather than a setting: a
    // fall-through is not something a user configures.
    assert.strictEqual(band.ranks[3].terminal, "the shipped score→model table");
    // W3 removed the Fable 5 override, so this family's terminal row moved UP a
    // rank. The rank it vacated is not backfilled: a fall-through is not a
    // setting, and inventing a P2 to keep the shape would be a ladder nobody
    // configured.
    const role = j.families["fixed-role-model"];
    assert.deepStrictEqual(
      role.ranks.map((r) => [r.prio, r.key]),
      [
        ["P0", "extra_enabled"],
        ["P1", "opus5_only"],
        ["P2", null],
      ]
    );
    assert.strictEqual(role.ranks[2].terminal, "the agent shipped for that position");
    // Every other family is uncontested, and its keys are all at the neutral
    // rank — a P0 where nothing competes is a ladder somebody invented.
    for (const [name, f] of Object.entries(j.families)) {
      if (f.contested) continue;
      assert.ok(!f.ranks, name + " is uncontested but declares ranks[]");
      for (const k of j.keys)
        for (const a of k.answers)
          if (a.family === name) assert.strictEqual(a.prio, "P2", k.key + " in " + name);
    }
  } finally {
    rmrf(root);
  }
});

test("config: a shadow is a RANK, and after W3 only the hand-written table is under one", () => {
  const root = tmpdir();
  try {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".claude", "orc.config.yaml"),
      "opus5_only: true\nrubric_bands_override: [{min: 0, max: 100}]\n"
    );
    const j = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    const by = Object.fromEntries(j.keys.map((k) => [k.key, k]));

    // W3 removed the Fable 5 override, which was the only REGISTRY key sitting
    // below a `replace` rank. So the replace-shadow path is now reachable only
    // through the hand-written table — which is registry-less by design and
    // therefore reported in hand_edited[], not in keys[]. Asserting the
    // emptiness is the point: it is the fact a future reader needs before
    // wondering why gateRowOf() has no live example.
    const shadowedKeys = j.keys.filter((k) => k.is_shadowed).map((k) => k.key);
    assert.deepStrictEqual(shadowedKeys, [], "no registry key sits below a replace rank any more");

    const table = j.hand_edited.find((k) => k.key === "rubric_bands_override");
    assert.ok(table, "the hand-written table is reported");
    assert.strictEqual(table.is_shadowed, true);
    assert.match(table.shadow_reason, /shadowed by opus5_only/, "the reason names the rank that won");
    assert.strictEqual(table.editable, false, "config set refuses it, so it is not offered as editable");

    // The RANK is what does the shadowing, and the ladder still says so.
    const band = j.families["executor-band"];
    assert.strictEqual(band.ranks[1].key, "opus5_only");
    assert.strictEqual(band.ranks[2].key, "rubric_bands_override");
    assert.match(band.ranks[2].shadow_note, /shadowed by \{by\}/, "the sentence lives on the rank");

    // A gate whose gate is NOT shadowed stays silent. The extra_* operating
    // keys are gated by extra_enabled, which ranks P0 and is shadowed by
    // nothing — so opus5_only must not make them report anything.
    assert.strictEqual(by.extra_timeout_s.gated_by, "extra_enabled");
    assert.strictEqual(by.extra_timeout_s.is_shadowed, false);
    assert.strictEqual(by.extra_timeout_s.shadow_reason, null);
  } finally {
    rmrf(root);
  }
});

test("config: lanes[] is a mechanical seed, and says so by being empty where it is", () => {
  const { root } = freshInstall();
  try {
    const j = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    const by = Object.fromEntries(j.keys.map((k) => [k.key, k]));
    for (const k of j.keys) assert.ok(Array.isArray(k.lanes), k.key + " has no lanes[]");
    assert.ok(by.log_dir.lanes.length > 20, "a path every lane writes through is owned by every lane");
    assert.ok(by.doc_max_parallel.lanes.includes("orc-doc"));
    // TEN keys are named by no lane's own prose — they live in
    // _shared/extra-dispatch.md instead. An empty array is the SEED being
    // honest about what it measured, not a claim that nothing reads the key.
    // W8/W9 correct these lane by lane, against the recorded seed.
    //
    // W5 added the last two KNOWINGLY: they are operating keys of the bridge in
    // exactly the sense `extra_stall_s` is, and giving them a guessed lane set
    // would be inventing the measurement this list exists to be honest about.
    const orphans = j.keys.filter((k) => !k.lanes.length).map((k) => k.key);
    assert.deepStrictEqual(orphans, [
      "extra_max_concurrent",
      "extra_unlock",
      "extra_vault_max_attempts",
      "extra_timeout_s",
      "extra_passphrase_ttl_days",
      "extra_verify_max_days",
      "extra_stall_s",
      "extra_resume_max",
      "extra_demote_after",
      "extra_demote_stale_min",
    ]);
  } finally {
    rmrf(root);
  }
});
