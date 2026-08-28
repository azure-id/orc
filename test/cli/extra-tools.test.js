"use strict";
// @test-pool net  — stands up the fake provider on loopback
// `orc extra` — LOCAL TOOLS: the install gate, the four-rung ladder, the model
// dropdown and the setup gate (v0.51.0).
//
// The premise of this file is the thing v0.50.0 got honest about and could not
// fix: engine `cli` verified by asking whether a binary was on PATH, said so
// plainly ("the binary exists; nothing about a model or a credential has been
// proven"), and then had nothing else to offer. `models_seen` stayed empty
// forever, so the routing box had no list and the user hand-typed an id they had
// to go and find somewhere else.
//
// Every assertion here is about a rung reading as ITSELF:
//
//   · a tool that is NOT INSTALLED is a refusal with an install command, never
//     an unreachable endpoint and never a profile that cannot work
//   · `cli-bin` is not `cli-auth` is not `cli-models` is not `cli-live`
//   · a model that is LISTED is not a model that WORKS
//   · a public /models list is a URL proof and NOT a credential proof
//   · the setup gate is enforced in the CLI, because a UI-only gate is not a gate
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { tmpdir, rmrf, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const FAKE_CLI = path.join(__dirname, "_fake-cli.js");

// The stand-in binary lives on PATH under the catalog's own name, because that
// is the name `orc extra tools` looks for. On Windows it MUST be a .cmd — that
// is what an npm shim is, and it is the platform detail most likely to break.
function fakeBinDir(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orc-fake-tool-"));
  for (const n of names) {
    if (process.platform === "win32")
      fs.writeFileSync(path.join(dir, n + ".cmd"), `@echo off\r\n"${process.execPath}" "${FAKE_CLI}" %*\r\n`);
    else {
      const f = path.join(dir, n);
      fs.writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CLI}" "$@"\n`);
      fs.chmodSync(f, 0o755);
    }
  }
  return dir;
}
// A PATH with NOTHING on it, so `absent` is reachable on a machine where the
// real tool happens to be installed. You cannot test the install gate on a
// developer's laptop otherwise.
const EMPTY_PATH = fs.mkdtempSync(path.join(os.tmpdir(), "orc-empty-path-"));

function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, a, env) => cli([...a, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);
const withTool = (dir) => ({ PATH: dir + path.delimiter + EMPTY_PATH, Path: dir + path.delimiter + EMPTY_PATH });
const withoutTool = () => ({ PATH: EMPTY_PATH, Path: EMPTY_PATH });

// The one catalog row every test here drives, read from the shipped catalog so
// this file names no provider of its own — a second catalog is exactly the drift
// this subsystem lints for everywhere else.
const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "bin", "providers.json"), "utf8"));
const TOOL_ROWS = CATALOG.providers.filter((p) => p.cli_bin);
const ROW = TOOL_ROWS[0];

test("extra tools: every row's state is in the closed set, and the install block is real", () => {
  const p = project();
  const r = run(p, ["extra", "tools", "--json"], withoutTool());
  const j = json(r);
  assert.ok(TOOL_ROWS.length >= 2, "the catalog must ship at least two local tools for this release to mean anything");
  assert.equal(j.tools.length, TOOL_ROWS.length, "every cli_bin row is a tool row");
  // exit 1 when nothing is ready — exit-code-as-DATA, like `pattern status`.
  assert.equal(r.status, 1);
  assert.equal(j.ready, false);

  for (const tool of j.tools) {
    assert.ok(j.states.includes(tool.state), `${tool.provider}: ${tool.state} is not in the closed set`);
    assert.equal(tool.state, "absent", "nothing is on this PATH");
    assert.equal(tool.installed, false);
    // The install command is the whole content of an `absent` box, so a row
    // without one would render as a dead end.
    const cmds = tool.install.cmds.length ? tool.install.cmds : tool.install.all_cmds;
    assert.ok(cmds.length, `${tool.provider} has no install command at all`);
    for (const c of tool.install.cmds)
      assert.ok(c.platforms.includes(process.platform), "the CLI filters to this platform so the panel never picks");
    // `null` MEANS THERE IS NONE. Either it names a real catalog row or it is
    // explicitly null — a typo would render as an offer that goes nowhere.
    assert.ok(
      tool.no_install_alternative === null || CATALOG.providers.some((x) => x.id === tool.no_install_alternative),
      `${tool.provider}: no_install_alternative names nothing in the catalog`
    );
  }
  // The asymmetry is DATA: one has an install-free route and one does not, and a
  // renderer must be able to tell those two apart.
  assert.ok(
    j.tools.some((x) => x.no_install_alternative) && j.tools.some((x) => x.no_install_alternative === null),
    "both halves of the asymmetry must be reachable"
  );
  rmrf(p.root);
});

test("extra tools: an installed tool climbs to ready, and an unparseable version is UNKNOWN not too-old", () => {
  const p = project();
  const dir = fakeBinDir(TOOL_ROWS.map((x) => x.cli_bin));
  let j = json(run(p, ["extra", "tools", "--json"], withTool(dir)));
  const row = j.tools.find((x) => x.provider === ROW.id);
  assert.equal(row.state, "ready");
  assert.equal(row.version, "1.17.4");
  assert.ok(row.models_count > 0, "a ready tool has been asked which models the account can reach");

  // R8 — version output differs per tool and per install method. A version ORC
  // could not read is UNKNOWN, and blocking on a guess would make an unusual
  // install method look like a broken one.
  j = json(run(p, ["extra", "tools", "--json"], { ...withTool(dir), ORC_FAKE_CLI_VERSION: "build-nightly" }));
  const un = j.tools.find((x) => x.provider === ROW.id);
  assert.equal(un.version, null);
  assert.equal(un.outdated, false);
  assert.notEqual(un.state, "outdated");

  // Below the floor IS outdated, and both versions are carried so the box can
  // put them side by side.
  if (ROW.min_version) {
    j = json(run(p, ["extra", "tools", "--json"], { ...withTool(dir), ORC_FAKE_CLI_VERSION: "0.0.1" }));
    const old = j.tools.find((x) => x.provider === ROW.id);
    assert.equal(old.state, "outdated");
    assert.equal(old.outdated, true);
    assert.equal(old.min_version, ROW.min_version);
  }

  // No credential of its own and no model list is `unauthenticated` — the one
  // state whose next action is a sign-in rather than an install or a test.
  j = json(run(p, ["extra", "tools", "--json"], { ...withTool(dir), ORC_FAKE_CLI_MODE: "noauth" }));
  // `noauth` still lists models, so the row stays ready — a model list IS
  // evidence there is a credential. Both together is what makes it unauthenticated.
  const na = j.tools.find((x) => x.provider === ROW.id);
  assert.ok(["ready", "unauthenticated"].includes(na.state));
  rmrf(p.root);
});

test("extra tools: WHETHER A CONNECTION EXISTS is joined in the CLI, not in the panel", () => {
  // v0.52.0 / D1. The panel rendered an unconditional Connect button on every
  // `ready` card because it never consulted the profile list — so a tool you had
  // already connected, tested and routed work to still offered to connect it.
  // The join belongs HERE: a second idea of "connected" living in app.js is the
  // drift this panel exists to prevent.
  const p = project();
  const dir = fakeBinDir([ROW.cli_bin]);

  // An empty ledger: both false, and neither is null — absence is an ANSWER.
  let row = json(run(p, ["extra", "tools", "--json"], withTool(dir))).tools.find((x) => x.provider === ROW.id);
  assert.equal(row.connected, false);
  assert.equal(row.verified, false);
  assert.deepEqual(row.connected_profiles, []);

  // Configured and NEVER TESTED is connected and not verified — two different
  // cards, and the difference is the whole point of the field.
  assert.equal(
    run(p, ["extra", "add", "w", "--provider", ROW.id, "--engine", "cli", "--tool-auth"], withTool(dir)).status,
    0
  );
  row = json(run(p, ["extra", "tools", "--json"], withTool(dir))).tools.find((x) => x.provider === ROW.id);
  assert.equal(row.connected, true);
  assert.equal(row.verified, false);
  assert.deepEqual(row.connected_profiles.map((x) => x.name), ["w"]);
  assert.equal(row.connected_profiles[0].credential_source, "tool");

  // Once it has answered, verified follows — and the profile is NAMED, because a
  // state must be visible rather than re-offerable.
  assert.equal(run(p, ["extra", "ping", "w", "--json"], withTool(dir)).status, 0);
  row = json(run(p, ["extra", "tools", "--json"], withTool(dir))).tools.find((x) => x.provider === ROW.id);
  assert.equal(row.verified, true);
  assert.ok(row.connected_profiles[0].verified_at, "the row carries WHEN it answered, not just that it did");
  rmrf(p.root);
});

test("extra add --tool-auth: a tool that holds its own key needs NO credential from ORC", () => {
  // D3 Part 1. This is the profile the reported run should have had: opencode
  // reports `authed: true`, so it needed no env var, no vault, no passphrase and
  // no deadline — and the panel offered two radios, pushed it into the vault,
  // and the vault then locked the run.
  const p = project();
  const dir = fakeBinDir([ROW.cli_bin]);
  const r = run(p, ["extra", "add", "w", "--provider", ROW.id, "--engine", "cli", "--tool-auth", "--json"], withTool(dir));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const prof = json(run(p, ["extra", "list", "--json"])).profiles[0];
  assert.equal(prof.credential.source, "tool");
  assert.equal(prof.credential.key_name, null);
  rmrf(p.root);
});

test("extra add: a provider whose tool is ABSENT is refused BY NAME, with the install command", () => {
  const p = project();
  const r = run(p, ["extra", "add", "w", "--provider", ROW.id, "--engine", "cli", "--env-key", "K", "--json"], withoutTool());
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.reason, "not-installed");
  assert.equal(j.bin, ROW.cli_bin);
  assert.ok(j.install.cmds.length || j.install.all_cmds.length, "a refusal that only says no is a wall");
  assert.match(j.error, /orc extra install/, "the refusal names the command that fixes it");
  // And NOTHING was written: the refusal comes before the profile, not after it.
  assert.equal(json(run(p, ["extra", "list", "--json"])).profiles.length, 0);
  rmrf(p.root);
});

test("the cli ladder: cli-bin is not cli-auth is not cli-models, and each rung is recorded as ITSELF", () => {
  const p = project();
  const dir = fakeBinDir([ROW.cli_bin]);
  const env = withTool(dir);
  // A native row needs no --cli: the catalog names its own binary.
  assert.equal(run(p, ["extra", "add", "w", "--provider", ROW.id, "--engine", "cli", "--env-key", "K", "--json"], env).status, 0);

  let j = json(run(p, ["extra", "ping", "w", "--json"], { ...env, K: "sk-live-x" }));
  assert.equal(j.ok, true);
  assert.equal(j.verify_method, "cli-models", "the STRONGEST rung that answered is what the profile records");
  const rungs = j.attempts.map((a) => a.rung);
  assert.deepEqual(rungs, ["cli-bin", "cli-auth", "cli-models"], "every rung is on the record, in order");
  assert.deepEqual(j.models_seen, ["fakeco/fake-flash", "fakeco/fake-pro", "fakeco-go/fake-free"]);
  assert.equal(j.cli_version, "1.17.4");
  // F6/F14c — NEITHER shipped tool reports which model answered, so a silent
  // substitution is invisible on this engine. That is on the record rather than
  // rendered as a blank.
  assert.equal(j.reports_model, false);
  // F5, carried beside every list: OFFERED is not WORKING.
  assert.match(j.note, /LISTED is not a model that WORKS/);

  // With no credential the ladder stops at cli-bin and SAYS what that did not
  // prove — it must never read like a working connection.
  j = json(run(p, ["extra", "ping", "w", "--json"], { ...env, ORC_FAKE_CLI_MODE: "noauth", K: "sk-live-x" }));
  assert.equal(j.attempts.find((a) => a.rung === "cli-auth").ok, false);

  j = json(run(p, ["extra", "ping", "w", "--json"], { ...env, ORC_FAKE_CLI_MODE: "nomodels", K: "sk-live-x" }));
  assert.equal(j.verify_method, "cli-auth", "a rung that did not answer never becomes the verification");
  assert.match(j.note, /nothing to pick from/);
  rmrf(p.root);
});

test("rung 0: a tool that vanished is `not-installed` with the install command — not an unreachable endpoint", () => {
  const p = project();
  const dir = fakeBinDir([ROW.cli_bin]);
  assert.equal(
    run(p, ["extra", "add", "w", "--provider", ROW.id, "--engine", "cli", "--env-key", "K", "--json"], withTool(dir)).status,
    0
  );
  // The tool is uninstalled between the add and the ping — the ordinary way this
  // state is actually reached.
  const r = run(p, ["extra", "ping", "w", "--json"], { ...withoutTool(), K: "sk-live-x" });
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.reason, "not-installed");
  assert.equal(j.rung, "cli-bin");
  assert.ok(j.install_cmd, "the fix is an install, not a retry, so the command rides on the refusal");
  assert.ok("no_install_alternative" in j, "null MEANS there is none — the key must always be present");
  rmrf(p.root);
});

test("the model dropdown: entry, group and label are the CLI's answers, and --test is the only proof", () => {
  const p = project();
  const dir = fakeBinDir([ROW.cli_bin]);
  const env = withTool(dir);
  run(p, ["extra", "add", "w", "--provider", ROW.id, "--engine", "cli", "--env-key", "K", "--json"], env);
  run(p, ["extra", "ping", "w", "--json"], { ...env, K: "sk-live-x" });

  const j = json(run(p, ["extra", "models", "w", "--json"], env));
  assert.equal(j.entry, "list", "a real list is a DROPDOWN and the CLI is what says so");
  assert.deepEqual(
    j.models.map((m) => [m.id, m.label, m.group]),
    [
      ["fakeco/fake-flash", "fake-flash", "fakeco"],
      ["fakeco/fake-pro", "fake-pro", "fakeco"],
      ["fakeco-go/fake-free", "fake-free", "fakeco-go"],
    ],
    "`label (group)` is composed from data the panel was HANDED, never by splitting a string it does not own"
  );
  // A NAME HINT and never a price: ORC prints no cost figure it did not price
  // itself, so this says what the NAME says and claims nothing about billing.
  assert.equal(j.models[2].name_says_free, true);
  assert.equal(j.models[0].name_says_free, false);
  assert.equal(j.reports_model, false);
  assert.match(j.caveat, /dead upstream/);
  // Every field the human path prints is in the JSON (`--json is not a summary`).
  for (const k of ["entry", "source", "refreshed_at", "stale_days", "models", "model_ids", "verify_state", "caveat"])
    assert.ok(k in j, `models --json is missing ${k}`);

  // A refresh re-reads the LIVE list rather than the cache.
  const rf = json(run(p, ["extra", "models", "w", "--refresh", "--json"], env));
  assert.equal(rf.refresh.ok, true);
  assert.equal(rf.model_ids.length, 3);

  // F5 — the paid rung, scoped to ONE id. This is the only thing that tells a
  // LISTED model from a WORKING one.
  const tj = json(run(p, ["extra", "models", "w", "--test", "fakeco/fake-flash", "--json"], env));
  assert.equal(tj.test.ok, true);
  assert.equal(tj.test.model_reported, null);
  assert.equal(tj.test.reports_model, false, "a null here WITH this flag is the honest pair, never a blank field");
  assert.match(tj.test.cost_note, /NOT a cheap ping/);
  rmrf(p.root);
});

test("--live: the paid rung reports the round trip, the reply, four token kinds and what it could NOT prove", () => {
  const p = project();
  const dir = fakeBinDir([ROW.cli_bin]);
  const env = withTool(dir);
  run(p, ["extra", "add", "w", "--provider", ROW.id, "--engine", "cli", "--env-key", "K", "--json"], env);

  const j = json(run(p, ["extra", "ping", "w", "--live", "--json"], { ...env, K: "sk-live-x" }));
  assert.equal(j.ok, true);
  assert.equal(j.verify_method, "cli-live", "the top rung, and only when it actually ran");
  assert.equal(j.rung, "cli-live");
  assert.ok(typeof j.latency_ms === "number");
  assert.equal(j.reply_excerpt, "OK");
  // D6 — the reply is FOREIGN INPUT: evidence that something answered, never an
  // instruction.
  assert.match(j.foreign_input, /never an instruction/);
  // FOUR KINDS, NEVER BLENDED (/orc-budget).
  assert.deepEqual(Object.keys(j.tokens).sort(), ["cache_read", "cache_write", "input", "output"]);
  assert.equal(j.tokens.cache_read, 64);
  // F7 — a CLI ping is not a cheap ping, and the quote is not optional chrome.
  assert.match(j.cost_note, /NOT a cheap ping/);
  assert.equal(j.model_reported, null);
  assert.equal(j.reports_model, false);
  rmrf(p.root);
});

test("keyhelp: the route is from a closed set, and env_var is non-null exactly on the env route", () => {
  const p = project();
  const dir = fakeBinDir([ROW.cli_bin]);
  const env = withTool(dir);
  run(p, ["extra", "add", "w", "--provider", ROW.id, "--engine", "cli", "--env-key", "K", "--json"], env);
  const j = json(run(p, ["extra", "keyhelp", "w", "--json"], env));
  assert.ok(j.routes.includes(j.route), "the route is from a closed set");
  assert.equal(j.route === "env", j.env_var !== null, "env_var is non-null exactly when the route is env");
  assert.match(j.never, /never writes another tool's credential store/);

  // A tool that signs itself in has NOTHING for ORC to inject, and the honest
  // route is the tool's own login rather than a variable nobody set.
  run(p, ["extra", "add", "s", "--provider", ROW.id, "--engine", "cli", "--tool-auth", "--json"], env);
  const k2 = json(run(p, ["extra", "keyhelp", "s", "--json"], env));
  assert.notEqual(k2.route, "env");
  assert.equal(k2.env_var, null);
  // `present` is NULL for that source: ORC has nothing to send and nothing is
  // missing, so neither `found` nor `not found` would be true.
  const prof = json(run(p, ["extra", "list", "--json"], env)).profiles.find((x) => x.name === "s");
  assert.equal(prof.credential.source, "tool");
  assert.equal(prof.credential.present, null);
  rmrf(p.root);
});

test("keyhelp: it says HOW to set the variable, per OS, and never renders a real key", () => {
  // v0.52.0 / D3 Part 2. `orc extra list` printed `no key (env DEEPSEEK_API_KEY)`
  // and nothing anywhere said how to set that variable on Windows or on macOS.
  const p = project();
  const f = fakeBinDir([ROW.cli_bin]);
  assert.equal(
    run(p, ["extra", "add", "e", "--provider", ROW.id, "--engine", "cli", "--cli", ROW.cli_bin, "--env-key", "SOME_VAR"], withTool(f)).status,
    0
  );
  const j = json(run(p, ["extra", "keyhelp", "e", "--json"], withTool(f)));
  assert.ok(j.env_set, "an env credential gets the instruction");
  assert.ok(j.env_set.session.includes("SOME_VAR"));
  assert.ok(j.env_set.persist.includes("SOME_VAR"));
  assert.ok(j.env_set.persist_note, "a persistent set has a caveat, on every platform");
  // PLACEHOLDERS ONLY. The CLI never renders a real key into an instruction, so
  // nothing here can leak into a screenshot, a copy button or a shell history.
  assert.ok(/<your key>/.test(j.env_set.session));
  // And ORC does not RUN it: `setx` would put the key in argv, which this
  // subsystem refuses by name, and an `export` line writes it in plaintext.
  assert.ok(!/setx/i.test(JSON.stringify(j)), "setx puts the key in argv");
  // A vaulted profile gets the PASSPHRASE variable instead, with its own warning
  // — it is a different thing and it is never presented as the same one.
  assert.equal(j.passphrase_env, null);
  rmrf(p.root);
});

test("install: the script carries the command, the verify and no credential — and a failed launch is exit 0", () => {
  const p = project();
  const r = run(p, ["extra", "install", ROW.id, "--dry-run", "--json"], { ...withoutTool(), PLANTED: "sk-live-SECRET" });
  assert.equal(r.status, 0, "a launch that could not happen is an ANSWER, not an error");
  const j = json(r);
  assert.equal(j.launched, false);
  assert.ok(j.fallback_cmd, "the command is always on the card — the openBrowser rule");
  assert.equal(j.cmd, j.fallback_cmd);
  assert.match(j.verify_cmd, new RegExp("^" + ROW.cli_bin + " "));

  const body = fs.readFileSync(j.script, "utf8");
  assert.ok(body.includes(j.cmd), "the script runs the catalog's command");
  assert.ok(body.includes(j.verify_cmd), "and checks it landed");
  assert.match(body, /Enter to close|Re-check/, "a window that vanishes on failure is worse than no window");
  // ORC NEVER ELEVATES. Papering over a package-manager permission problem is
  // exactly what makes running an installer on someone's machine indefensible.
  assert.ok(!/\bsudo\b|\brunas\b|Start-Process .*-Verb RunAs/i.test(body), "no elevation, ever");
  assert.ok(!body.includes("sk-live-SECRET"), "an install script carries no credential");
  const mode = fs.statSync(j.script).mode & 0o777;
  if (process.platform !== "win32") assert.equal(mode, 0o700);

  // A provider that is not a local tool is refused BY NAME rather than given a
  // script that would install nothing.
  const bad = run(p, ["extra", "install", "custom", "--dry-run", "--json"], withoutTool());
  assert.equal(bad.status, 1);
  assert.equal(json(bad).reason, "not-a-tool");
  rmrf(p.root);
});

test("models_public: a list anyone can read is a URL proof and NEVER a credential proof", async () => {
  // F8, and it is the reason the key exists at all: on a provider whose /models
  // answers without a credential, the cheapest rung would otherwise mark a
  // profile VERIFIED WITH A GARBAGE KEY.
  const f = await fakeProvider("publicmodels");
  const p = project();
  const base = `http://127.0.0.1:${f.port}`;
  const pub = CATALOG.providers.find((x) => x.models_public);
  assert.ok(pub, "the catalog must ship at least one models_public row for this rule to be live");

  run(p, ["extra", "add", "z", "--provider", pub.id, "--engine", "api", "--base-url", base, "--env-key", "K", "--json"]);
  const r = run(p, ["extra", "ping", "z", "--json"], { K: "definitely-not-the-key" });
  assert.equal(r.status, 1, "a bogus key must NOT come back verified");
  const j = json(r);
  assert.notEqual(j.verify_method, "models");
  // The free answer is on the record as its OWN method, so nothing reads it as
  // the profile's verification.
  assert.ok(
    j.attempts.some((a) => a.rung === "models-public"),
    "the public list is recorded as what it was"
  );
  f.stop();
  rmrf(p.root);
});

test("the setup gate is enforced in the CLI, because a UI-only gate is not a gate", async () => {
  const fp = await fakeProvider("models");
  const p = project();
  const base = `http://127.0.0.1:${fp.port}`;

  // Nothing configured at all: the switch cannot be armed, and the refusal names
  // BOTH the reason and the command.
  let r = run(p, ["config", "set", "extra_enabled", "true"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no connection has been configured/);
  assert.match(r.stderr, /orc extra add/);

  // Configured but never tested is the OTHER floor, and it says something else.
  run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K"]);
  r = run(p, ["config", "set", "extra_enabled", "true"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /never answered/);
  assert.match(r.stderr, /orc extra ping ds/);

  // One green test opens it.
  assert.equal(run(p, ["extra", "ping", "ds", "--json"], { K: "sk-live-PLANTEDSECRET0123456789" }).status, 0);
  assert.equal(run(p, ["config", "set", "extra_enabled", "true"]).status, 0);

  // And the gate the panel reads is the SAME one, carried on `extra list --json`
  // with the floor it is on — there is no second idea of "connected" anywhere.
  const g = json(run(p, ["extra", "list", "--json"])).gate;
  assert.equal(g.connected, true);
  assert.equal(g.floor, null);
  fp.stop();
  rmrf(p.root);
});
