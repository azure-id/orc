"use strict";
// `orc extra` — WHICH SECRET A DISPATCH ACTUALLY SENDS (v0.53.3).
//
// The bug this file exists to prevent, in one sentence: a vaulted, verified,
// routed profile authenticated every wave with `ORC_EXTRA_KEY` — an ordinary
// environment variable that nothing in the profile named — and died at 401
// quoting the vaulted key it never sent.
//
// It was nasty rather than merely broken because `ORC_EXTRA_KEY` was passed as
// `inMemory` by `dispatch` and `conform` and BY NOBODY ELSE. `ping`,
// `models --test` and `preflight` all opened the vault and went green. Four
// honest checks, each about a path a wave does not take.
//
// So the assertions here are about the SOURCE, not the outcome:
//
//   · a vault ORC can open WINS over an ambient variable — that is the fix
//   · the ambient variable still works where it was written for: a vault that
//     cannot be opened here (an unattended wave with nothing cached)
//   · an EXPLICIT `--key-stdin` key still wins, because it is the key being
//     proved and stored — collapsing it with the ambient one is what caused this
//   · the dispatch return reports the source it USED, and an override is said
//     out loud whether the dispatch passed or failed
//   · a probe and a dispatch build the SAME completions URL, so a green badge
//     is earned by the path a wave will actually run
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { tmpdir, rmrf, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const CLI = path.join(__dirname, "..", "..", "bin", "cli.js");

// The key the fake provider accepts, and a decoy it rejects. The decoy is what
// a leftover `ORC_EXTRA_KEY` looks like from ORC's side: a real-shaped secret
// for something else entirely.
const GOOD_KEY = "sk-live-PLANTEDSECRET0123456789";
const STALE_KEY = "sk-live-LEFTOVERFROMANOTHERPROFILE";
const SECOND_KEY = "sk-live-THE-SECOND-KEY-0123456789";
const PASS = "planted-passphrase-do-not-print";

function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "// the original helper\n");
  // SCRUBBED, and the scrub is part of the point: this suite inherits the
  // developer's environment, and a real `ORC_EXTRA_KEY` sitting in it would make
  // the locked-vault case pass for the wrong reason — the exact ambient leak
  // under test. Empty is falsy at every read site.
  return { root, home, env: { HOME: home, USERPROFILE: home, ORC_EXTRA_KEY: "" } };
}
const run = (p, a, env) => cli([...a, "--dir", p.root], { ...p.env, ...(env || {}) });
function runIn(p, a, input, env) {
  const r = spawnSync(process.execPath, [CLI, ...a, "--dir", p.root], {
    encoding: "utf8",
    input,
    env: { ...process.env, ORC_NO_UPDATE_CHECK: "1", CI: "true", ...p.env, ...(env || {}) },
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}
const json = (r) => JSON.parse(r.stdout);

function slice(p) {
  const file = path.join(p.root, "slice.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      task_id: "T1",
      score: 20,
      role: "executor",
      prompt: "Rename the helper in src/a.js.",
      standing_rules: "# ORC standing rules\nReturn the contract.\n",
      declared_files: ["src/a.js"],
    })
  );
  return file;
}

// A VAULTED, verified, routed profile on engine `api`, with the master gate on.
// `--key-stdin` on the add stores the key under a passphrase; the ping proves it.
async function armedVault(p, opts) {
  const o = opts || {};
  const f = await fakeProvider("chat");
  const base = `http://127.0.0.1:${f.port}`;
  assert.equal(
    run(p, ["extra", "add", "v", "--provider", "custom", "--engine", "api", "--base-url", base, "--key-stdin"]).status,
    0
  );
  const ping = runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `${GOOD_KEY}\n${PASS}\n`);
  assert.equal(ping.status, 0, "fixture must verify: " + ping.stdout + ping.stderr);
  assert.equal(run(p, ["extra", "route", "set", "0-30", "v/fake-flash", "--json"]).status, 0);
  if (!o.noSession)
    assert.equal(runIn(p, ["extra", "session", "v", "--save", "--ttl", "30", "--json"], `${PASS}\n`).status, 0);
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: true\nextra_roles: [executor]\n");
  return f;
}

test("dispatch: a vault ORC can open WINS over a leftover ORC_EXTRA_KEY", async () => {
  const p = project();
  const f = await armedVault(p);
  try {
    // The exact shape of the reported failure: a stale variable in the
    // environment, a saved passphrase, a verified vaulted key. Before the fix
    // this authenticated with STALE_KEY and returned 401.
    const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], { ORC_EXTRA_KEY: STALE_KEY });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const j = json(r);
    assert.equal(j.outcome, "done");
    // THE ASSERTION. Not "it worked" — WHICH SECRET IT SENT.
    assert.equal(j.credential.source, "vault");
    assert.equal(j.credential.key_name, "v");
    assert.equal(j.credential_override, undefined, "nothing was overridden, so nothing is announced");
    assert.equal(j.credential_hint, undefined);
    assert.ok(!r.stdout.includes(STALE_KEY) && !r.stdout.includes(GOOD_KEY), "no secret reaches an output shape");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("dispatch: with the vault LOCKED, ORC_EXTRA_KEY still works — and says so", async () => {
  const p = project();
  // No saved passphrase: this is `extra_unlock: per-dispatch`, the unattended
  // wave the variable was written for. It is the ONLY case it applies to.
  const f = await armedVault(p, { noSession: true });
  try {
    // Locked and nothing to fall back on.
    let r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"]);
    assert.equal(r.status, 1);
    assert.equal(json(r).reason, "locked");

    r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], { ORC_EXTRA_KEY: GOOD_KEY });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const j = json(r);
    assert.equal(j.outcome, "done");
    assert.equal(j.credential.source, "ambient");
    assert.equal(j.credential.key_name, "ORC_EXTRA_KEY");
    // AN OVERRIDE IS NEVER SILENT. Same class of silence as work leaving Claude
    // with no `extra:` line.
    assert.match(j.credential_override, /ORC_EXTRA_KEY environment variable/);
    assert.match(j.credential_override, /orc extra session v --save --ttl 30/);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("dispatch: a 401 NAMES the source that produced the rejected secret", async () => {
  const p = project();
  const f = await armedVault(p, { noSession: true });
  try {
    const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], { ORC_EXTRA_KEY: STALE_KEY });
    assert.equal(r.status, 1);
    const j = json(r);
    assert.equal(j.reason, "authentication_failed");
    // The provider's message describes the secret it saw. Only ORC knows where
    // that secret came from, and not saying so was a multi-step diagnosis.
    assert.match(j.credential_hint, /the rejected credential came from the ORC_EXTRA_KEY environment variable/);
    assert.match(j.credential_hint, /NOT this profile/);
    assert.equal(j.credential.source, "ambient");
    assert.ok(!r.stdout.includes(STALE_KEY), "the rejected key is named by SOURCE, never by value");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("ping --key-stdin still re-keys: an EXPLICIT key outranks the record it replaces", async () => {
  const p = project();
  // Two endpoints, one per key. The profile starts on A, so a real key lands in
  // the vault and its passphrase gets cached; then it is repointed at B, which
  // rejects that key. That is the state a re-key has to survive, and a
  // vault-first ordering that swallowed `--key-stdin` would be stuck in it.
  const a = await fakeProvider("models", GOOD_KEY);
  const b = await fakeProvider("models", SECOND_KEY);
  try {
    const baseA = `http://127.0.0.1:${a.port}`;
    const baseB = `http://127.0.0.1:${b.port}`;
    run(p, ["extra", "add", "v", "--provider", "custom", "--engine", "api", "--base-url", baseA, "--key-stdin"]);
    let r = runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `${GOOD_KEY}\n${PASS}\n`);
    assert.equal(r.status, 0, "fixture: the first key verifies and is stored: " + r.stdout + r.stderr);
    assert.equal(runIn(p, ["extra", "session", "v", "--save", "--ttl", "30", "--json"], `${PASS}\n`).status, 0);

    const ledgerPath = path.join(p.root, ".claude", "orc", "extra.json");
    const led = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    led.profiles[0].base_url = baseB;
    fs.writeFileSync(ledgerPath, JSON.stringify(led, null, 2));

    // The vault opens — and holds a key this endpoint rejects.
    assert.equal(run(p, ["extra", "ping", "v", "--json"]).status, 1, "the vault IS being read");
    // The re-key. This is the case `inMemory` exists for and it must still win.
    r = runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `${SECOND_KEY}\n${PASS}\n`);
    assert.equal(r.status, 0, "an explicit key is the one being proved: " + r.stdout + r.stderr);
    // And it EARNED the badge — the profile records which source did.
    const list = json(run(p, ["extra", "list", "--json"]));
    assert.equal(list.profiles[0].verify_credential_source, "memory");
  } finally {
    a.stop();
    b.stop();
    rmrf(p.root);
  }
});

test("the probe and the dispatch build the SAME completions URL", async () => {
  const p = project();
  // The fake now 404s any completions path but /v1/chat/completions — the one
  // `apiCompletionsUrl` derives for a base with no version segment. A probe that
  // hardcoded `{base}/chat/completions` cannot verify against it at all.
  const f = await fakeProvider("nomodels");
  try {
    const base = `http://127.0.0.1:${f.port}`;
    run(p, ["extra", "add", "u", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K"]);
    // Rung 1 404s, so this lands on rung 2 — the hardcoded one.
    const r = run(p, ["extra", "ping", "u", "--json"], { K: GOOD_KEY });
    assert.equal(r.status, 0, "rung 2 must speak the URL a wave will call: " + r.stdout + r.stderr);
    const j = json(r);
    const completion = j.attempts.find((a) => a.rung === "completion");
    assert.equal(completion.url, base + "/v1/chat/completions");
    // …and `completions_path` is honoured by the probe now too, not only by
    // dispatch. A gateway that accepts neither default is exactly the case it
    // was added for.
    const ledgerPath = path.join(p.root, ".claude", "orc", "extra.json");
    const led = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    led.profiles[0].completions_path = "/chat/completions";
    fs.writeFileSync(ledgerPath, JSON.stringify(led, null, 2));
    const r2 = run(p, ["extra", "ping", "u", "--json"], { K: GOOD_KEY });
    const c2 = json(r2).attempts.find((a) => a.rung === "completion");
    assert.equal(c2.url, base + "/chat/completions", "the probe honours the override the profile carries");
    assert.equal(r2.status, 1, "and it fails honestly when that path is not served");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("keyhelp: ORC_EXTRA_KEY is described as the KEY, and never as the passphrase", () => {
  const p = project();
  run(p, [
    "extra", "add", "v", "--provider", "custom", "--engine", "api",
    "--base-url", "https://x.invalid", "--key-stdin",
  ]);
  const j = json(run(p, ["extra", "keyhelp", "v", "--json"]));
  // THE OLD TEXT TOLD USERS TO EXPORT THEIR VAULT PASSPHRASE INTO THE VARIABLE
  // DISPATCH SENDS IN AN AUTHORIZATION HEADER. Following the instruction handed
  // the secret that opens the vault to a third-party provider.
  assert.equal(j.passphrase_env, null, "nothing reads a passphrase from the environment");
  assert.ok(j.key_env, "the variable is offered — described as what it is");
  assert.ok(/<your key>/.test(j.key_env.session), "PLACEHOLDERS ONLY");
  assert.match(j.key_env.warning, /This is the KEY, not the passphrase/);
  assert.ok(!/<your passphrase>/.test(JSON.stringify(j)), "no instruction puts a passphrase in a variable");
  // The route with a deadline on it is offered FIRST.
  assert.match(j.vault_unlock.cmd, /^orc extra session v --save --ttl 30$/);
  rmrf(p.root);
});
