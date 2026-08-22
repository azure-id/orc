"use strict";
// `orc extra` — the SECRET DISCIPLINE (P2, P10) and the connection gate.
//
// The failure this file exists to prevent is not a bug, it is a leak: a key
// that reaches a --json payload, a trace line, an error message, a fixture or
// a process list. So the central assertion is blunt on purpose — plant known
// secrets, exercise EVERY `orc extra … --json` shape, and grep the whole lot
// for the planted strings. A future field that carried a secret would have to
// get past this.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { tmpdir, rmrf, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const CLI = path.join(__dirname, "..", "..", "bin", "cli.js");

// The planted secrets. If any of these ever appears in output, the test fails
// and names which command printed it.
const SECRET_KEY = "sk-live-PLANTEDSECRET0123456789";
const SECRET_PASS = "planted-passphrase-do-not-print";

// `cli()` cannot pipe stdin, and every credential path here deliberately reads
// stdin rather than argv — which is the property under test.
function cliIn(args, input, env) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    input,
    env: { ...process.env, ORC_NO_UPDATE_CHECK: "1", CI: "true", ...(env || {}) },
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}


// A project with its own HOME, so the install pepper never touches the
// developer's real ~/.claude and one test's vault cannot open another's.
function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, args, env) => cli([...args, "--dir", p.root], { ...p.env, ...(env || {}) });
const runIn = (p, args, input, env) => cliIn([...args, "--dir", p.root], input, { ...p.env, ...(env || {}) });

test("providers: a catalog of PROVIDERS, dated, and never a model list", () => {
  const r = cli(["extra", "providers", "--json"]);
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.ok(j.as_of, "the catalog is dated — the bin/pricing.json rule");
  assert.equal(typeof j.stale, "boolean", "staleness is COMPUTED on read, never stored");
  assert.ok(j.providers.length >= 10);
  assert.ok(j.providers.some((p) => p.id === "custom"), "`custom` is the escape hatch that keeps the catalog from being a gate");
  // P4: a shipped model id is wrong within a quarter, and wrong SILENTLY.
  for (const p of j.providers) {
    assert.ok(!("models" in p), `${p.id} must not ship a model list`);
    assert.ok(p.auth_env === "ANTHROPIC_AUTH_TOKEN" || p.auth_env === "ANTHROPIC_API_KEY",
      `${p.id}: auth names the ENV VAR, not a header — the variable is what decides the header`);
  }
  // Ollama's /v1/messages rejects x-api-key. A row that drifted to
  // ANTHROPIC_API_KEY would fail at 401 with nothing on screen explaining why.
  const ollama = j.providers.find((p) => p.id === "ollama");
  assert.equal(ollama.auth_env, "ANTHROPIC_AUTH_TOKEN");
});

test("add: --key <value> is refused BY NAME, because argv is world-readable", () => {
  const p = project();
  const r = run(p, ["extra", "add", "x", "--provider", "deepseek", "--engine", "api", "--key", SECRET_KEY]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--key <value>` does not exist on purpose/);
  assert.ok(!fs.existsSync(path.join(p.root, ".claude", "orc", "extra.json")), "nothing was written");
  rmrf(p.root);
});

test("add: the credential is a NAME; remove needs a reason and names what it un-routes", () => {
  const p = project();
  let r = run(p, ["extra", "add", "ds", "--provider", "deepseek", "--engine", "api", "--env-key", "MY_KEY"], { MY_KEY: SECRET_KEY });
  assert.equal(r.status, 0);
  r = run(p, ["extra", "list", "--json"], { MY_KEY: SECRET_KEY });
  const j = JSON.parse(r.stdout);
  assert.equal(j.profiles[0].credential.key_name, "MY_KEY");
  assert.equal(j.profiles[0].credential.present, true, "`present` is the only bit of a credential ORC says out loud");
  assert.equal(j.profiles[0].verified_at, null, "an unverified profile must read unverified");

  // The /orc-pact retirement rule: a change to how this repo builds is worth
  // one recorded sentence.
  r = run(p, ["extra", "remove", "ds"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a reason is required/);
  r = run(p, ["extra", "remove", "ds", "--reason", "wrong account"]);
  assert.equal(r.status, 0);
  rmrf(p.root);
});

test("the connection gate: three rungs, each recorded as ITSELF", async () => {
  const { stop, port } = await fakeProvider("models");
  const p = project();
  const base = `http://127.0.0.1:${port}`;
  run(p, ["extra", "add", "f", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K"]);

  // A wrong key exits 1 with the PROVIDER's own reason and no stack.
  let r = run(p, ["extra", "ping", "f", "--json"], { K: "wrong" });
  assert.equal(r.status, 1);
  let j = JSON.parse(r.stdout);
  assert.equal(j.reason, "auth-failed");
  assert.match(j.error, /invalid api key/, "the provider's own words, never ORC's paraphrase");
  assert.ok(!r.stdout.includes("at Object."), "no stack in a --json answer");

  // A right key exits 0 and lists REAL models.
  r = run(p, ["extra", "ping", "f", "--json"], { K: SECRET_KEY });
  assert.equal(r.status, 0);
  j = JSON.parse(r.stdout);
  assert.equal(j.verify_method, "models", "the profile records WHICH RUNG answered");
  assert.deepEqual(j.models_seen, ["fake-flash", "fake-pro"]);

  // `orc extra models` reads the cache and never invents.
  // v0.51.0 — `models` carries the rows a DROPDOWN needs (id, label, group), and
  // `model_ids` keeps the plain list every existing caller reads. `entry` is the
  // CLI's answer to "dropdown or text box" and the panel derives nothing from it.
  r = run(p, ["extra", "models", "f", "--json"], { K: SECRET_KEY });
  const mj = JSON.parse(r.stdout);
  assert.deepEqual(mj.model_ids, ["fake-flash", "fake-pro"]);
  assert.deepEqual(
    mj.models.map((m) => [m.id, m.label, m.group]),
    [
      ["fake-flash", "fake-flash", "custom"],
      ["fake-pro", "fake-pro", "custom"],
    ]
  );
  assert.equal(mj.entry, "free-text", "`custom` is the escape hatch, so its model box must stay typeable");

  // An unknown profile is exit 2, distinct from unreachable.
  assert.equal(run(p, ["extra", "ping", "nope", "--json"]).status, 2);

  stop();
  rmrf(p.root);
});

test("rung 2 escapes the chicken-and-egg: a rejected MODEL still proves the credential", async () => {
  const { stop, port } = await fakeProvider("nomodels");
  const p = project();
  run(p, ["extra", "add", "f", "--provider", "custom", "--engine", "api", "--base-url", `http://127.0.0.1:${port}`, "--env-key", "K"]);
  const r = run(p, ["extra", "ping", "f", "--json"], { K: SECRET_KEY });
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  // Weaker evidence than a real completion, and it must never read the same.
  assert.equal(j.verify_method, "completion-unknown-model");
  assert.deepEqual(j.models_seen, [], "no model id is confirmed, so none is invented");
  assert.match(j.note, /NO model id is confirmed/);
  stop();
  rmrf(p.root);
});

test("a redirect is a FAILURE — the credential never follows one", async () => {
  const { stop, port } = await fakeProvider("redirect");
  const p = project();
  run(p, ["extra", "add", "f", "--provider", "custom", "--engine", "api", "--base-url", `http://127.0.0.1:${port}`, "--env-key", "K"]);
  const r = run(p, ["extra", "ping", "f", "--json"], { K: SECRET_KEY });
  assert.equal(r.status, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.reason, "redirect-refused");
  assert.match(j.error, /refuses to follow a redirect/);
  stop();
  rmrf(p.root);
});

test("the vault: test FIRST, then store — and a failed test leaves nothing behind", async () => {
  const { stop, port } = await fakeProvider("models");
  const p = project();
  const base = `http://127.0.0.1:${port}`;
  const vaultFile = path.join(p.root, ".claude", "orc", "extra-vault.json");

  run(p, ["extra", "add", "v", "--provider", "custom", "--engine", "api", "--base-url", base, "--key-stdin"]);
  let r = runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `wrong-key\n${SECRET_PASS}\n`);
  assert.equal(r.status, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.profile_reverted, true, "a typo'd key must never rot in a vault nobody can open");
  assert.ok(!fs.existsSync(vaultFile), "the key is NEVER written before the test is green");
  assert.equal(JSON.parse(run(p, ["extra", "list", "--json"]).stdout).counts.profiles, 0);

  // Green test → stored.
  run(p, ["extra", "add", "v", "--provider", "custom", "--engine", "api", "--base-url", base, "--key-stdin"]);
  r = runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `${SECRET_KEY}\n${SECRET_PASS}\n`);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).vault.stored, true);
  assert.ok(fs.existsSync(vaultFile));

  // The gitignore line, so a secret that reached disk cannot reach a commit.
  assert.match(fs.readFileSync(path.join(p.root, ".gitignore"), "utf8"), /\.claude\/orc\/extra-vault\.json/);

  // The passphrase opens it; the key is NEVER printed.
  r = runIn(p, ["extra", "unlock", "v", "--json"], `${SECRET_PASS}\n`);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).unlocked, true);
  assert.ok(!r.stdout.includes(SECRET_KEY));

  stop();
  rmrf(p.root);
});

test("the vault self-destructs, counts down out loud, and keeps the profile", async () => {
  const { stop, port } = await fakeProvider("models");
  const p = project();
  // The counter is inspectable and testable rather than magic — which is the
  // whole reason `extra_vault_max_attempts` exists as a key.
  fs.mkdirSync(path.join(p.root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_vault_max_attempts: 3\n");
  run(p, ["extra", "add", "v", "--provider", "custom", "--engine", "api", "--base-url", `http://127.0.0.1:${port}`, "--key-stdin"]);
  runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `${SECRET_KEY}\n${SECRET_PASS}\n`);

  for (const n of [1, 2]) {
    const r = runIn(p, ["extra", "unlock", "v", "--json"], "wrong\n");
    assert.equal(r.status, 1);
    const j = JSON.parse(r.stdout);
    assert.equal(j.attempts_used, n, "a countdown that is not SHOWN is no countdown at all");
    assert.equal(j.max, 3);
    assert.match(j.honesty, /copies the vault file/, "never sold as protection against a stolen file");
  }
  let r = runIn(p, ["extra", "unlock", "v", "--json"], "wrong\n");
  assert.equal(JSON.parse(r.stdout).reason, "wiped");

  // The right passphrase no longer helps — and says so honestly.
  r = runIn(p, ["extra", "unlock", "v", "--json"], `${SECRET_PASS}\n`);
  assert.equal(JSON.parse(r.stdout).reason, "wiped");

  // The PROFILE survives: routes, verification history and models_seen are not
  // secrets, and destroying them would punish the wrong thing.
  const show = JSON.parse(run(p, ["extra", "show", "v", "--json"]).stdout);
  assert.ok(show.profile.verified_at, "the profile itself survives the wipe");
  assert.deepEqual(show.profile.models_seen, ["fake-flash", "fake-pro"]);
  assert.equal(show.profile.credential.present, false);
  assert.equal(show.profile.credential.vault.state, "wiped", "`wiped` and `never had a key` are different facts");

  // The ciphertext is gone from disk, not merely unlinked.
  const raw = fs.readFileSync(path.join(p.root, ".claude", "orc", "extra-vault.json"), "utf8");
  assert.ok(!/"ciphertext"/.test(raw));

  stop();
  rmrf(p.root);
});

// v0.50.0 (W14) — THE HOLE THIS CLOSES. `orc extra ping` needs the key itself,
// `extraCredentialValue` answers `locked` without one, and `orc extra unlock`
// proves a passphrase while deliberately never yielding what it unlocked. So a
// vaulted profile could never be re-verified, and `extra-stale-verify`'s promise
// of a re-ping before wave 1 was unreachable for exactly the profiles the vault
// exists for. `--passphrase-stdin` decrypts the stored key into memory for the
// probe and for nothing else.
test("a STORED key is re-testable with its passphrase, and with nothing else", async () => {
  const { stop, port } = await fakeProvider("models");
  const p = project();
  const base = `http://127.0.0.1:${port}`;

  run(p, ["extra", "add", "v", "--provider", "custom", "--engine", "api", "--base-url", base, "--key-stdin"]);
  let r = runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `${SECRET_KEY}\n${SECRET_PASS}\n`);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).vault.stored, true);
  const firstVerify = JSON.parse(run(p, ["extra", "show", "v", "--json"]).stdout).profile.verified_at;

  // Without a passphrase there is nothing to send, and it says so rather than
  // reporting the endpoint as unreachable.
  r = run(p, ["extra", "ping", "v", "--json"]);
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).reason, "locked");

  // A wrong passphrase spends an attempt on the SAME counter every other unlock
  // spends — a second door with its own counter is not a lock — and it does NOT
  // un-verify a profile that already passed. A failed check is not an erased
  // history (the /orc-pact rule).
  r = runIn(p, ["extra", "ping", "v", "--passphrase-stdin", "--json"], "not-the-passphrase\n");
  assert.equal(r.status, 1);
  const bad = JSON.parse(r.stdout);
  assert.equal(bad.reason, "bad-passphrase");
  assert.match(bad.error, /attempt 1 of/, "the countdown prints EVERY time");
  assert.ok(!bad.profile_reverted, "a stored key that failed its passphrase is not a typo'd key");
  assert.equal(JSON.parse(run(p, ["extra", "show", "v", "--json"]).stdout).profile.verified_at, firstVerify);

  // The right one re-probes for real, refreshes the verification, and the key
  // reaches no output anywhere.
  r = runIn(p, ["extra", "ping", "v", "--passphrase-stdin", "--json"], `${SECRET_PASS}\n`);
  assert.equal(r.status, 0);
  const ok = JSON.parse(r.stdout);
  assert.equal(ok.ok, true);
  assert.equal(ok.vault, null, "re-testing a stored key stores nothing — it is already stored");
  assert.ok(!r.stdout.includes(SECRET_KEY) && !r.stdout.includes(SECRET_PASS));
  const second = JSON.parse(run(p, ["extra", "show", "v", "--json"]).stdout).profile;
  assert.notEqual(second.verified_at, firstVerify, "a green re-probe is a NEW verification");
  // …and the counter is back to zero, because a correct unlock is what clears it.
  assert.equal(second.credential.vault.attempts_used, 0);

  // The two stdin flags are mutually exclusive and REFUSED BY NAME: line 1 would
  // be a key on one reading and a passphrase on the other.
  r = runIn(p, ["extra", "ping", "v", "--key-stdin", "--passphrase-stdin", "--json"], "x\ny\n");
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).reason, "stdin-ambiguous");

  // And it refuses on a profile with nothing to unlock, naming what that profile
  // actually reads instead.
  run(p, ["extra", "add", "e", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "SOME_VAR"]);
  r = runIn(p, ["extra", "ping", "e", "--passphrase-stdin", "--json"], `${SECRET_PASS}\n`);
  assert.equal(r.status, 1);
  const nv = JSON.parse(r.stdout);
  assert.equal(nv.reason, "not-vaulted");
  assert.match(nv.error, /SOME_VAR/);

  stop();
  rmrf(p.root);
});

/* ---------------------------------------------------------------------------
   v0.52.0 — THE PASSPHRASE LIFECYCLE (D11, the P0).

   A passphrase stored on the same machine as the vault it opens is not a second
   factor any more. It is a DEADLINE — the ssh-agent shape — and the whole design
   follows from saying that out loud. Before this, a vaulted key needed
   ORC_EXTRA_KEY in the environment or nothing, so a green, verified, routed
   profile answered `locked` at dispatch and the run announced a Claude fallback:
   safe, and a deadline you can miss without ever choosing to miss it.
--------------------------------------------------------------------------- */

// Reach into the cache and move a deadline. A test cannot wait 30 days, and the
// point of the state being COMPUTED is that moving the date is all it takes.
function ageSession(p, profile, days) {
  const f = path.join(p.root, ".claude", "orc", ".orc-ec-session");
  const v = JSON.parse(fs.readFileSync(f, "utf8"));
  v.records[profile].expires_at = new Date(Date.now() + days * 86400000).toISOString();
  fs.writeFileSync(f, JSON.stringify(v, null, 2));
  return f;
}

test("the passphrase cache: it round-trips, a copied project opens nothing, and the state is COMPUTED", async () => {
  const { stop, port } = await fakeProvider("models");
  const p = project();
  const base = `http://127.0.0.1:${port}`;
  run(p, ["extra", "add", "v", "--provider", "custom", "--engine", "api", "--base-url", base, "--key-stdin"]);
  runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `${SECRET_KEY}\n${SECRET_PASS}\n`);

  // A VALUE is refused BY NAME, exactly as `--key <value>` is. There is no
  // "just pass it in a script" path, and that is the point.
  let r = runIn(p, ["extra", "session", "v", "--save", "--passphrase", SECRET_PASS, "--json"], "");
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).reason, "passphrase-in-argv");

  // TEST FIRST, THEN STORE — the vault's own rule. A passphrase that does not
  // open the vault fails HERE rather than at wave 1.
  r = runIn(p, ["extra", "session", "v", "--save", "--ttl", "30", "--json"], "not-the-passphrase\n");
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).reason, "bad-passphrase");
  assert.equal(JSON.parse(run(p, ["extra", "session", "v", "--json"]).stdout).session.state, "ABSENT");

  // The real one saves, and the answer is a DATE. "30 days" is not something a
  // person can plan around.
  r = runIn(p, ["extra", "session", "v", "--save", "--ttl", "30", "--json"], `${SECRET_PASS}\n`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const saved = JSON.parse(r.stdout);
  assert.equal(saved.session.state, "ACTIVE");
  assert.equal(saved.session.ttl_days, 30);
  assert.match(saved.session.expires_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(saved.honesty, /Copying the project folder to another computer does not open it/);
  assert.ok(!r.stdout.includes(SECRET_PASS), "the passphrase never reaches an output shape");

  // …and it OPENS THE VAULT: a ping with no passphrase of its own now works,
  // which is the entire defect this closes.
  r = run(p, ["extra", "ping", "v", "--json"]);
  assert.equal(r.status, 0, "a saved passphrase is what stops a run falling back for no reason");

  // A COPIED PROJECT OPENS NOTHING. The cache lives in the project; the pepper
  // lives in $HOME. That split is the one genuine property this file has.
  const other = project();
  fs.mkdirSync(path.join(other.root, ".claude", "orc"), { recursive: true });
  for (const f of ["extra.json", "extra-vault.json", ".orc-ec-session"])
    fs.copyFileSync(path.join(p.root, ".claude", "orc", f), path.join(other.root, ".claude", "orc", f));
  r = run(other, ["extra", "ping", "v", "--json"]);
  assert.notEqual(r.status, 0, "a copied project folder must not open the connection");

  // THE STATE IS COMPUTED ON READ. Moving the deadline into the past is all it
  // takes — nothing rewrote a status word, because none was ever stored.
  const before = fs.readFileSync(ageSession(p, "v", -1), "utf8");
  assert.equal(JSON.parse(run(p, ["extra", "session", "v", "--json"]).stdout).session.state, "EXPIRED");
  stop();
  rmrf(p.root);
  rmrf(other.root);
});

test("the deadline STOPS a run — it never falls back, and the route rows survive", async () => {
  const { stop, port } = await fakeProvider("models");
  const p = project();
  const base = `http://127.0.0.1:${port}`;
  run(p, ["extra", "add", "v", "--provider", "custom", "--engine", "api", "--base-url", base, "--key-stdin"]);
  runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `${SECRET_KEY}\n${SECRET_PASS}\n`);
  run(p, ["extra", "route", "set", "0-30", "v/some-model", "--json"]);
  runIn(p, ["extra", "session", "v", "--save", "--ttl", "30", "--json"], `${SECRET_PASS}\n`);

  // ACTIVE passes the gate.
  let r = run(p, ["extra", "preflight", "--json"]);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).profiles[0].verdict, "ok");

  // EXPIRING passes it too, WITH THE DATE. A warning that does not say when is
  // a warning nobody acts on.
  ageSession(p, "v", 1);
  r = run(p, ["extra", "preflight", "--json"]);
  assert.equal(r.status, 0);
  let j = JSON.parse(r.stdout);
  assert.equal(j.profiles[0].verdict, "warn");
  assert.match(j.profiles[0].why, /\d{4}-\d{2}-\d{2}/);

  // EXPIRED STOPS. `extra_on_failure` is about an endpoint that FAILED; letting
  // `fallback` cover a deadline you set yourself would defeat the gate, and the
  // payload says so rather than leaving it to be inferred.
  ageSession(p, "v", -1);
  r = run(p, ["extra", "preflight", "--json"]);
  assert.equal(r.status, 1);
  j = JSON.parse(r.stdout);
  assert.equal(j.ok, false);
  assert.deepEqual(j.stops, ["v"]);
  assert.match(j.on_failure_note, /extra_on_failure covers an endpoint that FAILED/);

  // DISCONNECTED, precisely: the vault record is gone and the profile can never
  // route again…
  const prof = JSON.parse(run(p, ["extra", "show", "v", "--json"]).stdout).profile;
  assert.equal(prof.verified_at, null);
  assert.equal(prof.credential.present, false);
  const res = run(p, ["extra", "resolve", "10", "--json"]);
  assert.equal(res.status, 1, "an expired profile cannot be resolved to");

  // …AND ITS ROUTE ROWS SURVIVE (Decision 4). The bands are work the user did;
  // re-connecting should be one modal, not rebuilding the routing table.
  const list = JSON.parse(run(p, ["extra", "list", "--json"]).stdout);
  assert.equal(list.routes.length, 1);
  assert.equal(list.routes[0].profile, "v");

  // The ledger records the save AND the expiry. A credential that disappeared
  // with no entry is indistinguishable from one that was never there.
  const actions = list.profiles && JSON.parse(fs.readFileSync(path.join(p.root, ".claude", "orc", "extra.json"), "utf8")).history.map((h) => h.action);
  assert.ok(actions.includes("session-save"));
  assert.ok(actions.includes("session-expired"));
  stop();
  rmrf(p.root);
});

test("the sweep drops what expired and keeps what did not, and there is no timer", async () => {
  const { stop, port } = await fakeProvider("models");
  const p = project();
  const base = `http://127.0.0.1:${port}`;
  for (const n of ["a", "b"]) {
    run(p, ["extra", "add", n, "--provider", "custom", "--engine", "api", "--base-url", base, "--key-stdin"]);
    runIn(p, ["extra", "ping", n, "--key-stdin", "--json"], `${SECRET_KEY}\n${SECRET_PASS}\n`);
    runIn(p, ["extra", "session", n, "--save", "--ttl", "30", "--json"], `${SECRET_PASS}\n`);
  }
  ageSession(p, "a", -1);
  const r = run(p, ["extra", "session", "--sweep", "--json"]);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout).swept, ["a"]);
  const rows = JSON.parse(run(p, ["extra", "session", "--list", "--json"]).stdout).sessions;
  assert.equal(rows.find((x) => x.profile === "a").state, "ABSENT");
  assert.equal(rows.find((x) => x.profile === "b").state, "ACTIVE");

  // An `env` or `tool` credential never needs a passphrase, and that is NOT a
  // gap — which is why there is deliberately no doctor finding for it.
  run(p, ["extra", "add", "e", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "SOME_VAR"]);
  const e = JSON.parse(run(p, ["extra", "session", "e", "--json"]).stdout).session;
  assert.equal(e.needs_passphrase, false);
  const ids = JSON.parse(run(p, ["extra", "doctor", "--json"]).stdout).findings.map((f) => f.id);
  assert.ok(!ids.includes("extra-passphrase-expiring"), "a normal state is not a finding");

  // --forget is immediate, and it says whether anything was there.
  assert.equal(JSON.parse(run(p, ["extra", "session", "b", "--forget", "--json"]).stdout).removed, true);
  assert.equal(JSON.parse(run(p, ["extra", "session", "b", "--forget", "--json"]).stdout).removed, false);
  stop();
  rmrf(p.root);
});

test("the TTL set is closed: no 0, no forever, and the file is gitignored", async () => {
  const { stop, port } = await fakeProvider("models");
  const p = project();
  const base = `http://127.0.0.1:${port}`;
  run(p, ["extra", "add", "v", "--provider", "custom", "--engine", "api", "--base-url", base, "--key-stdin"]);
  runIn(p, ["extra", "ping", "v", "--key-stdin", "--json"], `${SECRET_KEY}\n${SECRET_PASS}\n`);

  for (const bad of ["0", "45", "9999"]) {
    const r = runIn(p, ["extra", "session", "v", "--save", "--ttl", bad, "--json"], `${SECRET_PASS}\n`);
    assert.equal(r.status, 1, `--ttl ${bad} must be refused`);
    assert.equal(JSON.parse(r.stdout).reason, "bad-ttl");
  }
  const opts = JSON.parse(run(p, ["extra", "session", "--json"]).stdout).ttl_options;
  assert.deepEqual(opts, [1, 3, 7, 14, 30, 90, 180, 360]);

  runIn(p, ["extra", "session", "v", "--save", "--ttl", "1", "--json"], `${SECRET_PASS}\n`);
  // The passphrase that opens the vault must never reach a commit either.
  assert.match(fs.readFileSync(path.join(p.root, ".gitignore"), "utf8"), /\.claude\/orc\/\.orc-ec-session/);
  stop();
  rmrf(p.root);
});

test("P2: no `orc extra … --json` shape ever carries a key or a passphrase", async () => {
  const { stop, port } = await fakeProvider("models");
  const p = project();
  const base = `http://127.0.0.1:${port}`;

  run(p, ["extra", "add", "envp", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "PLANTED"], { PLANTED: SECRET_KEY });
  run(p, ["extra", "add", "vaultp", "--provider", "custom", "--engine", "api", "--base-url", base, "--key-stdin"]);
  runIn(p, ["extra", "ping", "vaultp", "--key-stdin", "--json"], `${SECRET_KEY}\n${SECRET_PASS}\n`);
  run(p, ["extra", "ping", "envp", "--json"], { PLANTED: SECRET_KEY });

  const shapes = [
    ["extra", "providers", "--json"],
    ["extra", "list", "--json"],
    ["extra", "show", "envp", "--json"],
    ["extra", "show", "vaultp", "--json"],
    ["extra", "models", "envp", "--json"],
    ["extra", "models", "vaultp", "--json"],
    ["extra", "ping", "envp", "--json"],
    ["extra", "ping", "nope", "--json"],
    ["extra", "remove", "envp", "--reason", "leak sweep", "--json"],
  ];
  for (const argv of shapes) {
    const r = run(p, argv, { PLANTED: SECRET_KEY });
    const all = r.stdout + r.stderr;
    assert.ok(!all.includes(SECRET_KEY), `${argv.join(" ")} leaked the API key`);
    assert.ok(!all.includes(SECRET_PASS), `${argv.join(" ")} leaked the passphrase`);
    if (r.stdout.trim()) JSON.parse(r.stdout); // exactly one object, always parseable
  }

  // And the LEDGER itself — the file a user might paste into an issue.
  const ledger = fs.readFileSync(path.join(p.root, ".claude", "orc", "extra.json"), "utf8");
  assert.ok(!ledger.includes(SECRET_KEY) && !ledger.includes(SECRET_PASS));

  stop();
  rmrf(p.root);
});
