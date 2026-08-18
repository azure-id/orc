"use strict";
// v0.43.0 — `orc ui` and the `--json` surface it stands on.
//
// Two failure modes drive every case here.
//
// (1) The --json contract is what makes the UI possible AT ALL: the server
//     parses stdout, so a command that prints one stray banner line beside its
//     object breaks a panel — and it does so silently, because the human path
//     still looks perfect. Every flagged command is therefore checked for
//     EXACTLY ONE object and an UNCHANGED exit code (several of those codes are
//     already contracts: pattern status, wiki impact, pr stack status).
//
// (2) The server can WRITE config, so it is a write surface on a machine that
//     may be shared. Auth, the loopback Host guard and the method guard are not
//     nice-to-haves; a regression in any of them is the whole vulnerability.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { cli, rmrf, tmpdir, freshInstall, REPO, WEBUI, appJs, appCss, appHtml, assetRefs, panelJs, panelCss, fixtureSrc, i18nNamespaces, i18nTable, webuiFiles } = require("../_helpers");

const CLI = path.join(REPO, "bin", "cli.js");
const LOCK_REL = path.join(".claude", "orc", "ui.lock");

// The shipped string tables. English is the FALLBACK table every other language
// falls back to, so it is loaded separately as well as in the pair.
const en = i18nTable("en");
const TABLES = { en, id: i18nTable("id") };

// The --json contract, which is what makes the panel possible AT ALL: the
// server parses stdout, so a command that prints one stray banner line beside
// its object breaks a panel — silently, because the human path still looks
// perfect. Every flagged command gets EXACTLY ONE object and an UNCHANGED exit
// code (several of those codes are already gates).
//
// Split out of webui.test.js in v0.48.1, alongside bin/webui/ itself.

// ── the --json contract ─────────────────────────────────────────────────────

// Every command the help text advertises as --json-capable. `exit` is the code
// the HUMAN path uses in the seeded state, so a mismatch means --json changed
// semantics rather than rendering.
const JSON_COMMANDS = [
  { argv: ["where"], exit: 0 },
  { argv: ["doctor"], exit: 0 },
  { argv: ["config", "list"], exit: 0 },
  { argv: ["config", "profile"], exit: 0 },
  { argv: ["config", "recommend"], exit: 0 },
  { argv: ["wiki", "status"], exit: 0 },
  { argv: ["wiki", "impact"], exit: 1 }, // no wiki → "cannot compute"
  { argv: ["pattern", "status"], exit: 1 }, // empty cache IS the absent state
  { argv: ["gotcha", "list"], exit: 1 }, // none recorded
  { argv: ["crosslink", "list"], exit: 0 },
  { argv: ["diy", "show"], exit: 0 },
  { argv: ["diy", "status"], exit: 1 }, // UNCONFIGURED
  { argv: ["run", "list"], exit: 0 },
  { argv: ["stats"], exit: 1 }, // no traces
  { argv: ["pr", "stack", "status"], exit: 1 }, // no plan
  { argv: ["mock", "list"], exit: 0 },
];

test("--json prints exactly one object and never changes the exit code", () => {
  const { root } = freshInstall();
  try {
    for (const c of JSON_COMMANDS) {
      const human = cli([...c.argv, "--dir", root]);
      const j = cli([...c.argv, "--json", "--dir", root]);
      assert.strictEqual(
        j.status,
        human.status,
        `${c.argv.join(" ")}: --json changed the exit code (${human.status} → ${j.status})`
      );
      assert.strictEqual(j.status, c.exit, `${c.argv.join(" ")}: expected exit ${c.exit}, got ${j.status}`);
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(j.stdout);
      }, `${c.argv.join(" ")}: stdout is not a single JSON value — got ${JSON.stringify(j.stdout.slice(0, 160))}`);
      assert.ok(parsed && typeof parsed === "object" && !Array.isArray(parsed), `${c.argv.join(" ")}: not an object`);
      // "one object, nothing else" — a trailing banner would still parse if we
      // only checked the head, so the whole stream must round-trip.
      assert.strictEqual(
        j.stdout.trim(),
        JSON.stringify(parsed, null, 2).trim(),
        `${c.argv.join(" ")}: stdout carries more than the object`
      );
    }
  } finally {
    rmrf(root);
  }
});

// The risk the plan names outright: a new CONFIG_META key silently missing from
// the UI. The panel renders from this payload, so a key that appears here
// appears there automatically — and this test is what keeps that true.
test("config list --json exposes EVERY CONFIG_META key, with a control shape", () => {
  const { root } = freshInstall();
  try {
    const src = fs.readFileSync(CLI, "utf8");
    const block = src.slice(src.indexOf("const CONFIG_META = ["), src.indexOf("const metaFor ="));
    const declared = [...block.matchAll(/\{ key: "([a-z0-9_]+)"/g)].map((m) => m[1]);
    assert.ok(declared.length > 20, "sanity: found the CONFIG_META table");

    const out = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    const shown = out.keys.map((k) => k.key);
    for (const key of declared) assert.ok(shown.includes(key), `config list --json is missing ${key}`);
    assert.deepStrictEqual(shown.slice().sort(), declared.slice().sort(), "extra or missing keys in the JSON listing");

    for (const k of out.keys) {
      assert.ok(k.control && typeof k.control.kind === "string", `${k.key}: no control kind`);
      assert.ok(
        ["enum", "int", "range", "path", "repo", "subset", "text"].includes(k.control.kind),
        `${k.key}: unknown control kind ${k.control.kind}`
      );
      assert.ok("is_shadowed" in k && "shadow_reason" in k, `${k.key}: no shadow fields`);
    }
  } finally {
    rmrf(root);
  }
});

// Shadowing is the feature (plan §6.2): the CLI already announces it in prose,
// and the JSON must carry the SAME rule as data or the lock icon lies.
test("config list --json marks fable5_* and rubric_bands_override shadowed by opus5_only", () => {
  const { root, claudeDir } = freshInstall();
  try {
    fs.writeFileSync(
      path.join(claudeDir, "orc.config.yaml"),
      "opus5_only: true\nfable5_enabled: true\nrubric_bands_override: [[0,100,'orc-executor-opus-5-high']]\n"
    );
    const on = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    for (const k of on.keys.filter((x) => x.tier === "fable5"))
      assert.ok(k.is_shadowed && /opus5_only/.test(k.shadow_reason), `${k.key} should be shadowed`);
    const hand = on.hand_edited.find((h) => h.key === "rubric_bands_override");
    assert.ok(hand && hand.is_shadowed, "rubric_bands_override should be shadowed");
    // Registry-less by design — the UI must never offer to write it.
    assert.strictEqual(hand.editable, false, "rubric_bands_override must be reported read-only");
    assert.strictEqual(on.score_table.active, "opus5_only", "the 3-band ladder should resolve");

    fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "fable5_enabled: true\n");
    const off = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    assert.ok(
      off.keys.filter((x) => x.tier === "fable5").every((k) => !k.is_shadowed),
      "nothing is shadowed once opus5_only is off"
    );
    assert.strictEqual(off.score_table.active, "default");
  } finally {
    rmrf(root);
  }
});

// A retired name still on disk is resolved away by readOverride, so without
// this the file says one thing and the listing says another.
test("config list --json surfaces a legacy key rather than hiding it", () => {
  const { root, claudeDir } = freshInstall();
  try {
    fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "opus5_executor_only: true\n");
    const out = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    const legacy = out.legacy_keys.find((l) => l.key === "opus5_executor_only");
    assert.ok(legacy, "the retired name should be reported");
    assert.strictEqual(legacy.renamed_to, "opus5_only");
  } finally {
    rmrf(root);
  }
});

// The ladder is mirrored in five places already; the UI reads the CLI's own
// table so it adds no sixth copy. This pins that it really is the same table.
test("config list --json's score table is DIY_SCORE_TABLE, not a copy", () => {
  const { root } = freshInstall();
  try {
    const src = fs.readFileSync(CLI, "utf8");
    const block = src.slice(src.indexOf("const DIY_SCORE_TABLE = ["), src.indexOf("function diyScoreTable"));
    const rows = [...block.matchAll(/\[(\d+), (\d+), "([a-z0-9-]+)"\]/g)].map((m) => [Number(m[1]), Number(m[2]), m[3]]);
    const out = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    assert.strictEqual(out.score_table.default.length, rows.length);
    out.score_table.default.forEach((r, i) => {
      assert.strictEqual(r.from, rows[i][0]);
      assert.strictEqual(r.agent, rows[i][2]);
    });
  } finally {
    rmrf(root);
  }
});

// ── orc mock ────────────────────────────────────────────────────────────────

test("mock list: an empty mock-examples/ is a normal answer, not an error", () => {
  const { root } = freshInstall();
  try {
    const r = cli(["mock", "list", "--dir", root]);
    assert.strictEqual(r.status, 0, "no mock examples must not be an error state");
    assert.match(r.stdout, /Nothing is wrong/, "an empty list must not imply something is missing");
    const j = JSON.parse(cli(["mock", "list", "--json", "--dir", root]).stdout);
    assert.strictEqual(j.total, 0);
    assert.deepStrictEqual(j.mocks, []);
  } finally {
    rmrf(root);
  }
});

test("mock show: reads EXAMPLE.md and the tree; a missing slug exits 1", () => {
  const { root } = freshInstall();
  try {
    const dir = path.join(root, "mock-examples", "merchant-notifications");
    fs.mkdirSync(path.join(dir, "mocks"), { recursive: true });
    fs.writeFileSync(path.join(dir, "EXAMPLE.md"), "# Mocked example\n\nRun it with `node run.js`.\n");
    fs.writeFileSync(path.join(dir, "run.js"), "console.log('hi')\n");
    fs.writeFileSync(path.join(dir, "mocks", "gateway.js"), "module.exports = {}\n");

    const list = JSON.parse(cli(["mock", "list", "--json", "--dir", root]).stdout);
    assert.strictEqual(list.total, 1);
    assert.strictEqual(list.mocks[0].slug, "merchant-notifications");
    assert.strictEqual(list.mocks[0].has_readme, true);

    const show = JSON.parse(cli(["mock", "show", "merchant-notifications", "--json", "--dir", root]).stdout);
    assert.strictEqual(show.found, true);
    assert.match(show.readme, /Mocked example/);
    assert.deepStrictEqual(
      show.files.map((f) => f.path).sort(),
      ["EXAMPLE.md", "mocks/gateway.js", "run.js"]
    );

    const missing = cli(["mock", "show", "nope", "--json", "--dir", root]);
    assert.strictEqual(missing.status, 1);
    assert.strictEqual(JSON.parse(missing.stdout).found, false);
  } finally {
    rmrf(root);
  }
});

test("run show --json carries the resume text, the checkpoint and the trace tail", () => {
  const { root } = freshInstall();
  try {
    const runDir = path.join(root, ".claude", "orc", "run", "merchant-notifications");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "RESUME.md"),
      "Continue the run.\n\nWhere it stands:  /orc · phase execution · wave 2 of 4 done\n"
    );
    const traceRel = path.join(".claude", "orc", "logs", "run-orc-merchant-notifications-080826-094501.txt");
    fs.mkdirSync(path.join(root, path.dirname(traceRel)), { recursive: true });
    fs.writeFileSync(path.join(root, traceRel), "PHASE-EDGE execution\nDISPATCH orc-executor-opus-5-high\n");
    fs.writeFileSync(
      path.join(runDir, "checkpoint.json"),
      JSON.stringify({ phase: "execution", wave: 2, trace_path: traceRel.split(path.sep).join("/") })
    );

    const j = JSON.parse(cli(["run", "show", "merchant-notifications", "--json", "--dir", root]).stdout);
    assert.strictEqual(j.status, "waiting", "RESUME.md existing IS the unfinished flag");
    assert.deepStrictEqual(j.stands, { lane: "/orc", phase: "execution", wave: "wave 2 of 4 done" });
    assert.match(j.resume, /Continue the run/);
    assert.strictEqual(j.checkpoint.wave, 2);
    assert.match(j.trace, /DISPATCH orc-executor-opus-5-high/, "the trace tail should resolve from trace_path");
  } finally {
    rmrf(root);
  }
});

// ── the server ──────────────────────────────────────────────────────────────

// Start `orc ui` and wait for its lock file, which is written only after a
// successful bind — so this never races the listen.
// `until` exists for the one test that starts a server against a lock file that
// ALREADY EXISTS (the stale-pid case). Without it this polls, reads the stale
// lock before the server has replaced it, and resolves with the very token the
// test is asserting must never be reused — a flake in the test, not the product.

test("ui: the update-check env var never gags the commands that check updates", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const i = api.indexOf("function runCli");
  const fn = api.slice(i, api.indexOf("\nfunction readCli"));

  assert.match(fn, /ORC_NO_UPDATE_CHECK/, "the guard must still exist for commands that nudge");
  // Conditional, never unconditional — that was the bug.
  assert.ok(
    !/env:\s*\{[^}]*ORC_NO_UPDATE_CHECK/.test(fn),
    "the flag must not be set inline for every command"
  );
  assert.match(fn, /argv\[0\] === "version"/, "`version` must be exempt");
  assert.match(fn, /argv\[0\] === "changelog"/, "`changelog` must be exempt");
});

/* ══════════════════════════════════════════════════════════ v0.49.2 ═══════
   A 500 WITH NO MESSAGE IS WHAT THE USER ACTUALLY SAW. A read that produced no
   parseable object already carried `stderr` and `stdout` in the body; nothing
   was named `error`, so the client fell through to "request failed (500)" and
   one corrupt file on disk looked like a broken panel. */

test("a read that produces no JSON comes back with the CLI's own reason", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  // The body gains an `error` the client already knows how to render.
  assert.match(api, /out\.ok \? out : \{ \.\.\.out, error: readFailReason\(out\) \}/);
  assert.match(api, /function readFailReason\(out\)/);
  // It names WHAT ran and WHY it stopped, in the CLI's own first line.
  const fn = api.slice(api.indexOf("function readFailReason"));
  assert.match(fn.slice(0, 600), /out\.stderr \|\| out\.stdout/);
  assert.match(fn.slice(0, 600), /produced no JSON \(exit \$\{out\.exit_code\}\)/);

  // And the client renders it — message AND the output itself.
  const core = fs.readFileSync(path.join(REPO, "bin", "webui", "js", "00-core.js"), "utf8");
  assert.match(core, /function failure\(payload, status\)/);
  assert.match(core, /err\.detail = \[payload\.command, payload\.stderr, payload\.stdout\]/);
  const ui = fs.readFileSync(path.join(REPO, "bin", "webui", "js", "02-ui.js"), "utf8");
  assert.match(ui, /function failBox\(e\)/);
  assert.match(ui, /e\.detail/);
  // Every panel that used to show only `e.message` now shows the box.
  for (const f of ["panels/docs.js", "panels/challenge.js", "panels/runs.js", "04-router.js"]) {
    const src = fs.readFileSync(path.join(REPO, "bin", "webui", "js", f), "utf8");
    assert.ok(!/empty\(t\("common\.loadFail"\), String\(e\.message\)\)/.test(src), `${f} must render the reason, not just the message`);
    assert.match(src, /failBox\(e\)/);
  }
});

test("maintenance: waiting_runs excludes a run the human closed", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  // ONE boolean, read everywhere. `closed` is not `waiting`, so the upgrade
  // preview unblocks without any other subsystem learning a new word.
  assert.match(api, /\.filter\(\(r\) => r\.status === "waiting"\)/);
  const fixtures = fs.readFileSync(path.join(REPO, "bin", "webui", "fixtures", "index.js"), "utf8");
  assert.match(fixtures, /waiting_runs: runs\.runs\.filter\(\(r\) => r\.status === "waiting"\)/,
    "the fixture derives it from the SAME list the Runs panel renders");
  // The Overview payload carries rows, not bare slugs — the age column needs a
  // number and the button needs a slug.
  assert.match(api, /waiting: waiting\.map\(\(r\) => \(\{ slug: r\.slug, updated_ms: r\.updated_ms, lane: r\.lane \|\| null \}\)\)/);
});
