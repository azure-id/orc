"use strict";
// @test-pool net  — stands up the fake provider on loopback
// `orc extra conform` — the conformance matrix — and the concurrency cap.
//
// `tool_fidelity` is a RECORD, not a boolean, because the difference between
// "DeepSeek works" and "DeepSeek works if you set two environment variables,
// and here they are" is the difference between a feature and a support thread.
// Every dimension is `true | false | unknown`, and `unknown` is an honest value
// that must never be rendered as either of the others.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { tmpdir, rmrf, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const SECRET_KEY = "sk-live-PLANTEDSECRET0123456789";
const FAKE_CLAUDE = path.join(__dirname, "_fake-claude.js");

function fakeClaudeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orc-fake-claude-"));
  if (process.platform === "win32")
    fs.writeFileSync(path.join(dir, "claude.cmd"), `@echo off\r\n"${process.execPath}" "${FAKE_CLAUDE}" %*\r\n`);
  else {
    const p = path.join(dir, "claude");
    fs.writeFileSync(p, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CLAUDE}" "$@"\n`);
    fs.chmodSync(p, 0o755);
  }
  return dir;
}

function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, args, env) => cli([...args, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);

async function armedShim(p, engine) {
  const f = await fakeProvider("models");
  const base = `http://127.0.0.1:${f.port}`;
  run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", engine || "claude-shim", "--base-url", base, "--anthropic-base-url", base, "--env-key", "K"]);
  assert.equal(run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY }).status, 0);
  run(p, ["extra", "route", "set", "0-30", "ds/fake-flash", "--json"]);
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: true\nextra_roles: [executor]\n");
  f.stop();
}

const withClaude = (mode, extra) => ({
  K: SECRET_KEY,
  PATH: fakeClaudeDir() + path.delimiter + process.env.PATH,
  ORC_FAKE_CLAUDE_MODE: mode || "ok",
  ...(extra || {}),
});

test("conform: every dimension is measured, and `unknown` stays unknown", async () => {
  const p = project();
  await armedShim(p);
  const r = run(p, ["extra", "conform", "ds", "--json"], withClaude("ok"));
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.usable, true);

  assert.equal(j.dimensions.models_endpoint, true, "the ping answered on the models rung");
  assert.equal(j.dimensions.streams, true);
  assert.equal(j.dimensions.tool_multi_turn, true, "a tool_use → tool_result round trip survived");
  assert.equal(j.dimensions.cache_read_seen, true);

  // Not measured without --deep, and it must NOT be guessed either way: those
  // two calls change what ORC SENDS, not whether the profile works.
  assert.equal(j.dimensions.adaptive_ok, "unknown");
  assert.equal(j.dimensions.betas_ok, "unknown");
  assert.equal(j.dimensions.structured_output_ok, "unknown");

  // Every dimension carries its own reason for existing, so the matrix is
  // readable by someone who has never seen the gateway protocol.
  for (const k of Object.keys(j.dimensions)) assert.ok(j.legend[k], `${k} has no legend`);

  // The asymmetry that is the first honest reason to prefer engine `api`.
  assert.match(j.privacy_note, /does not compose the request body/);
  assert.match(j.privacy_note, /still reaches Anthropic/);

  // It is PERSISTED on the profile, so a later run does not have to re-measure.
  const shown = json(run(p, ["extra", "show", "ds", "--json"])).profile;
  assert.equal(shown.tool_fidelity.dimensions.streams, true);
  assert.equal(shown.tool_fidelity.model, "fake-flash");
  rmrf(p.root);
});

test("conform --deep: a tolerant endpoint and a picky one are told apart", async () => {
  // A shim that accepts the beta body fields — the flags are not needed here,
  // and knowing that is worth a fraction of a cent when you are debugging a 400.
  const tolerant = project();
  await armedShim(tolerant);
  let j = json(run(tolerant, ["extra", "conform", "ds", "--deep", "--json"], withClaude("ok")));
  assert.equal(j.deep, true);
  assert.equal(j.dimensions.adaptive_ok, true);
  assert.equal(j.dimensions.betas_ok, true);
  assert.equal(j.consequences.length, 0, "nothing to keep, so nothing to say");
  rmrf(tolerant.root);

  // A weak shim that 400s on exactly what the mitigations suppress. Same
  // matrix, opposite arm — and each NO carries the flag to keep.
  const picky = project();
  await armedShim(picky);
  j = json(run(picky, ["extra", "conform", "ds", "--deep", "--json"], withClaude("picky")));
  assert.equal(j.usable, true, "the MITIGATED run still works — that is the point of the flags");
  assert.equal(j.dimensions.adaptive_ok, false);
  assert.equal(j.dimensions.betas_ok, false);
  const c = j.consequences.find((x) => x.dimension === "adaptive_ok");
  assert.match(c.effect, /keep CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1/);
  // structured_output travels in a beta body field, so it cannot be true where
  // the betas are rejected. Prose parsing stays the floor either way.
  assert.equal(j.dimensions.structured_output_ok, false);
  rmrf(picky.root);
});

test("conform: cache_read 0 records FALSE and names what it costs", async () => {
  const p = project();
  await armedShim(p);
  const j = json(run(p, ["extra", "conform", "ds", "--json"], withClaude("nocache")));
  assert.equal(j.dimensions.cache_read_seen, false);
  const c = j.consequences.find((x) => x.dimension === "cache_read_seen");
  assert.ok(c, "a NO with no consequence is a measurement nobody can use");
  assert.match(c.effect, /MEASUREMENT, not missing data/);
  rmrf(p.root);
});

test("conform: a shim that cannot stream is recorded, and its consequence named", async () => {
  const p = project();
  await armedShim(p);
  const j = json(run(p, ["extra", "conform", "ds", "--json"], withClaude("nostream")));
  assert.equal(j.dimensions.streams, false);
  const c = j.consequences.find((x) => x.dimension === "streams");
  assert.match(c.effect, /retry budget is the only one left/);
  assert.equal(c.fallback_reason, "malformed-return", "every consequence maps to a fallback reason");
  rmrf(p.root);
});

test("conform: an unusable endpoint exits 1 and reports the failure, not a blank matrix", async () => {
  const p = project();
  await armedShim(p);
  const r = run(p, ["extra", "conform", "ds", "--json"], withClaude("authfail"));
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.usable, false);
  assert.ok(j.failure && j.failure.reason);
  assert.equal(j.dimensions.tool_multi_turn, "unknown", "nothing is claimed about a run that failed");
  rmrf(p.root);
});

test("conform: it refuses a profile with no shim to measure, and one with no model", async () => {
  const p = project();
  await armedShim(p, "api");
  let r = run(p, ["extra", "conform", "ds", "--json"], withClaude("ok"));
  assert.equal(r.status, 1);
  assert.equal(json(r).reason, "not-applicable");
  assert.match(json(r).error, /Only claude-shim has a shim to measure/);

  assert.equal(run(p, ["extra", "conform", "nope", "--json"]).status, 2);
  rmrf(p.root);
});

test("the concurrency cap is ENFORCED by the bridge, not remembered by the caller", async () => {
  const p = project();
  await armedShim(p);
  const sliceFile = path.join(p.root, "slice.json");
  fs.writeFileSync(
    sliceFile,
    JSON.stringify({ task_id: "T1", score: 20, prompt: "do a thing", standing_rules: "rules" })
  );

  // Plant a live slot: this process is alive, so it cannot be reaped, and
  // extra_max_concurrent defaults to 1.
  fs.mkdirSync(path.join(p.root, ".claude", "orc"), { recursive: true });
  const inflight = path.join(p.root, ".claude", "orc", "extra-inflight.json");
  fs.writeFileSync(inflight, JSON.stringify({ slots: [{ pid: process.pid, at: Date.now(), task: "T0" }] }));

  const r = run(p, ["extra", "dispatch", "--task", sliceFile, "--json"], withClaude("ok"));
  const j = json(r);
  assert.equal(j.reason, "concurrency-cap");
  assert.equal(j.cap, 1);
  assert.equal(j.in_flight, 1);
  // A cap refusal is not a failure — the orchestrator holds the task for the
  // next wave, and nothing was spent.
  assert.equal(r.status, 3);
  assert.equal(j.dispatched, false);
  assert.ok(j.fallback_to.agent);
  assert.match(j.error, /rate limits are undocumented/);

  // A DEAD pid's slot is reaped, so a crashed dispatch cannot wedge the lane.
  fs.writeFileSync(inflight, JSON.stringify({ slots: [{ pid: 999999, at: Date.now(), task: "ghost" }] }));
  const ok = run(p, ["extra", "dispatch", "--task", sliceFile, "--json"], withClaude("ok"));
  assert.equal(ok.status, 0, "a stale slot must not wedge the lane: " + ok.stdout);
  // …and the slot is released when the dispatch ends.
  assert.deepEqual(JSON.parse(fs.readFileSync(inflight, "utf8")).slots, []);
  rmrf(p.root);
});

test("no key or passphrase reaches a conform or dispatch --json payload", async () => {
  const p = project();
  await armedShim(p);
  const sliceFile = path.join(p.root, "slice.json");
  fs.writeFileSync(sliceFile, JSON.stringify({ task_id: "T1", score: 20, prompt: "x", standing_rules: "y" }));
  for (const argv of [
    ["extra", "conform", "ds", "--json"],
    ["extra", "dispatch", "--task", sliceFile, "--json"],
  ]) {
    const r = run(p, argv, withClaude("ok"));
    const all = r.stdout + r.stderr;
    assert.ok(!all.includes(SECRET_KEY), argv.join(" ") + " leaked the key");
    if (r.stdout.trim()) JSON.parse(r.stdout);
  }
  rmrf(p.root);
});
