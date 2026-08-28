"use strict";
// @test-pool net  — stands up the fake provider on loopback
// `orc extra` — ENGINE A (`claude-shim`) and the dispatch bridge.
//
// Every assertion here is about a rule that is cheap to state and expensive to
// discover live: --bare (P8), the six model variables (F2), `is_error` over the
// exit code (F3), `total_cost_usd` never echoed (P9), a turn cap reported as
// PARTIAL rather than failed, and a failure classified well enough for the
// caller to know whether retrying could possibly help (P6).
//
// The child asserts its own half — see test/cli/_fake-claude.js, which exits 90
// with `ORC-CONTRACT: <rule>` if the parent broke one. That is deliberate: a
// missing --bare should fail by NAME, not as a puzzling downstream symptom.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { tmpdir, rmrf, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const SECRET_KEY = "sk-live-PLANTEDSECRET0123456789";
const FAKE_CLAUDE = path.join(__dirname, "_fake-claude.js");

// A `claude` on PATH that is really our stand-in. On Windows it MUST be a .cmd,
// because that is what the real npm shim is — which is the whole reason the
// engine has a Windows branch at all. Testing against a bare script would dodge
// the one platform detail most likely to break.
function fakeClaudeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orc-fake-claude-"));
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(dir, "claude.cmd"),
      `@echo off\r\n"${process.execPath}" "${FAKE_CLAUDE}" %*\r\n`
    );
  } else {
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

// A verified profile on engine claude-shim, with one route row, armed.
async function armedShim(p, band, opts) {
  const o = opts || {};
  const f = await fakeProvider("models");
  const base = `http://127.0.0.1:${f.port}`;
  run(p, [
    "extra", "add", "ds",
    "--provider", "custom",
    "--engine", "claude-shim",
    "--base-url", base,
    "--anthropic-base-url", base,
    "--env-key", "K",
  ]);
  const ping = run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY });
  assert.equal(ping.status, 0, "fixture must verify: " + ping.stdout + ping.stderr);
  const setArgs = ["extra", "route", "set", band || "0-30", "ds/fake-flash", "--json"];
  if (o.small) setArgs.splice(5, 0, "--small-model", o.small);
  if (o.maxTurns) setArgs.push("--max-turns", String(o.maxTurns));
  assert.equal(run(p, setArgs).status, 0);
  fs.writeFileSync(
    path.join(p.root, ".claude", "orc.config.yaml"),
    "extra_enabled: true\nextra_roles: [executor]\n" + (o.cfg || "")
  );
  f.stop();
  return base;
}

function slice(p, over) {
  const file = path.join(p.root, "slice.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      Object.assign(
        {
          task_id: "T1",
          score: 20,
          role: "executor",
          prompt: "Rename the helper. This text is long enough to matter and must never appear in argv.",
          standing_rules: "# ORC standing rules\nReturn the contract.\n",
          declared_files: ["src/a.js"],
        },
        over || {}
      )
    )
  );
  return file;
}

const dispatch = (p, mode, over, env) =>
  run(p, ["extra", "dispatch", "--task", slice(p, over), "--json"], {
    K: SECRET_KEY,
    PATH: fakeClaudeDir() + path.delimiter + process.env.PATH,
    ORC_FAKE_CLAUDE_MODE: mode || "ok",
    ...(env || {}),
  });

test("engine A: a clean run — and the CHILD confirms --bare, the six model vars and no key in argv", async () => {
  const p = project();
  await armedShim(p, "0-30", { small: "fake-pro" });
  const r = dispatch(p, "ok");
  assert.ok(
    !r.stderr.includes("ORC-CONTRACT:"),
    "the child reported a broken contract: " + r.stderr
  );
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.outcome, "done");
  assert.equal(j.engine, "claude-shim");
  assert.equal(j.format, "stream-json", "stream-json is preferred — its api_retry events ARE the classifier");
  assert.equal(j.via, "extra:ds");

  // The four token kinds, never blended (the /orc-budget rule).
  assert.deepEqual(j.usage, { input: 1200, cache_write: 300, cache_read: 9000, output: 450 });

  // P9 — the worker hands us a total_cost_usd priced against ANTHROPIC's table.
  // On a foreign endpoint that is fiction, and it must not survive into ORC's
  // output in any shape.
  assert.equal(j.cost_usd, null);
  assert.ok(!r.stdout.includes("0.4242"), "the worker's own dollar figure must never be echoed");

  // Tool fidelity is MEASURED — a shim that mangles tool blocks is the known
  // weak spot of this whole transport.
  assert.equal(j.tool_uses, 1);
  assert.equal(j.tool_results, 1);

  // The cheap companion was configured, so it is used and nothing is warned.
  assert.equal(j.model_map.small, "fake-pro");
  assert.equal(j.model_map.small_source, "route");
  assert.equal(j.model_map.small_note, null);
  rmrf(p.root);
});

test("engine A: F3 — an in-run 401 arrives as the RESULT with exit 0, and is still a failure", async () => {
  const p = project();
  await armedShim(p, "0-30");
  const r = dispatch(p, "authfail");
  assert.ok(!r.stderr.includes("ORC-CONTRACT:"), r.stderr);
  // The child exited 0. An exit-code-only check would call this success.
  const j = json(r);
  assert.equal(j.exit_code, 0, "the worker really did exit 0");
  assert.equal(r.status, 1, "…and ORC still reports a failure");
  assert.equal(j.ok, false);
  assert.equal(j.outcome, "failed");
  // P6 — the caller is told which Claude agent to fall back to, with no second
  // lookup and no second idea of the routing.
  assert.ok(j.fallback_to && j.fallback_to.agent, "a failed foreign dispatch is never a dead run");
  rmrf(p.root);
});

test("engine A: a turn cap is PARTIAL, never failed — the work is in the tree", async () => {
  const p = project();
  await armedShim(p, "0-30", { maxTurns: 3 });
  const r = dispatch(p, "maxturns");
  assert.ok(!r.stderr.includes("ORC-CONTRACT:"), r.stderr);
  const j = json(r);
  assert.equal(j.exit_code, 1, "the real client exits non-zero on a turn cap");
  assert.equal(j.outcome, "partial", "reporting it as failed would throw the finished work away and pay twice");
  assert.equal(j.reason, "max-turns");
  assert.equal(r.status, 4, "partial has its own exit code");
  assert.equal(j.ok, true);
  rmrf(p.root);
});

test("engine A: a rate limit is classified as RETRYABLE, an auth failure is not", async () => {
  const p = project();
  await armedShim(p, "0-30");

  const rl = json(dispatch(p, "ratelimit"));
  assert.equal(rl.reason, "rate_limit", "system/api_retry is a ready-made classifier");
  assert.equal(rl.retry, true, "retrying THIS profile could work");
  assert.equal(rl.api_retries.length, 1);
  assert.equal(rl.api_retries[0].max_retries, 3);

  const af = json(dispatch(p, "authfail"));
  assert.equal(af.retry, false, "a rejected credential will be rejected again");
  rmrf(p.root);
});

test("engine A: stream-json is preferred but never depended on — it DEGRADES and records it", async () => {
  const p = project();
  await armedShim(p, "0-30");
  const j = json(dispatch(p, "nostream"));
  assert.equal(j.outcome, "done");
  assert.equal(j.format, "json", "a client that cannot stream still works");
  assert.ok(j.attempts.length >= 2, "the degradation is recorded, not hidden");
  assert.equal(j.attempts[0].format, "stream-json");
  rmrf(p.root);
});

test("engine A: prose instead of a result object is `malformed-return`, and retryable", async () => {
  const p = project();
  await armedShim(p, "0-30");
  const j = json(dispatch(p, "garbage"));
  assert.equal(j.ok, false);
  assert.equal(j.reason, "malformed-return");
  assert.equal(j.retry, true);
  rmrf(p.root);
});

test("engine A: cache_read 0 is a MEASUREMENT, not missing data", async () => {
  const p = project();
  await armedShim(p, "0-30");
  const j = json(dispatch(p, "nocache"));
  assert.equal(j.outcome, "done");
  assert.equal(j.usage.cache_read, 0);
  // The distinction matters downstream: /orc-retro must read this as "this
  // shim ignores cache_control", never as "we failed to collect a number".
  assert.equal(typeof j.usage.cache_read, "number");
  rmrf(p.root);
});

test("no cheap companion model → background calls go to the PRIMARY, and it says so", async () => {
  const p = project();
  await armedShim(p, "0-30"); // no --small-model
  const j = json(dispatch(p, "ok"));
  assert.equal(j.model_map.small, j.model_map.primary);
  assert.equal(j.model_map.small_source, "primary");
  assert.match(j.model_map.small_note, /--small-model/, "a cost surprise must be named, not absorbed");
  rmrf(p.root);
});

test("the bridge refuses what it should, with an exit code per reason", async () => {
  const p = project();

  // No slice at all.
  assert.equal(run(p, ["extra", "dispatch", "--json"]).status, 2);
  // A slice with no score cannot be routed — routing is what this command does.
  let f = path.join(p.root, "bad.json");
  fs.writeFileSync(f, JSON.stringify({ prompt: "hi" }));
  assert.equal(run(p, ["extra", "dispatch", "--task", f, "--json"]).status, 2);

  // Nothing armed: exit 3 means "this is a Claude task", not an error — the
  // caller dispatches normally and nothing was spent.
  await armedShim(p, "0-30");
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: false\n");
  const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], { K: SECRET_KEY });
  assert.equal(r.status, 3);
  assert.equal(json(r).dispatched, false);
  assert.equal(json(r).reason, "not-routed");
  rmrf(p.root);
});

test("the tool set is CLOSED — an unrecognised tool is refused by name", async () => {
  const p = project();
  await armedShim(p, "0-30");
  const j = json(dispatch(p, "ok", { allowed_tools: ["Read", "Sudo"] }));
  assert.equal(j.ok, false);
  assert.equal(j.reason, "invalid_request");
  assert.match(j.error, /Sudo/, "the refusal names what it did not recognise");
  // It is the last part of the command line a slice can influence, which is
  // what makes the Windows shell path safe.
  assert.match(j.error, /closed on purpose/);
  rmrf(p.root);
});

test("a missing credential fails BEFORE spawning anything, and names the fallback", async () => {
  const p = project();
  await armedShim(p, "0-30");
  const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"]); // K unset
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.dispatched, false);
  assert.equal(j.reason, "missing-key");
  assert.ok(j.fallback_to.agent);
  assert.ok(!r.stdout.includes(SECRET_KEY));
  rmrf(p.root);
});

// ── the spend log is written by the BRIDGE (v0.53.2) ───────────────────────
//
// The whole subsystem's cost report used to depend on the orchestrator relaying
// `trace_line` into a trace packet. Two real graded runs proved that relay is
// not reliable — one reshaped the line, one dropped it — and both dispatches
// disappeared from `orc extra stats` while having really been paid for. The
// bridge now writes the record itself, at the moment it holds the numbers.
test("dispatch: the spend record is written by the CLI, not relayed by anybody", async () => {
  const p = project();
  await armedShim(p, "0-30", { small: "fake-pro" });
  const r = dispatch(p, "ok");
  const j = json(r);
  assert.equal(j.spend_logged, true, "the dispatch says whether the durable record exists");

  const f = path.join(p.root, ".claude", "orc", "extra-spend.jsonl");
  const rows = fs
    .readFileSync(f, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(rows.length, 1);
  const rec = rows[0];
  assert.equal(rec.profile, "ds");
  assert.equal(rec.engine, "claude-shim");
  assert.equal(rec.outcome, "done");
  // The four token kinds land unblended and unrounded — this file is what
  // /orc-budget and the Spending tab are then reading.
  assert.deepEqual(rec.usage, { input: 1200, cache_write: 300, cache_read: 9000, output: 450 });
  // The line the lane is SUPPOSED to relay, stored next to the numbers it came
  // from, so a trace that never received it can still be reconciled.
  assert.equal(rec.trace_line, j.trace_line);
  // No secret ever reaches this file. It is written into the project.
  assert.ok(!fs.readFileSync(f, "utf8").includes(SECRET_KEY), "a key must never land in the spend log");

  // …and it is immediately visible to the report, with no trace on disk at all.
  const st = JSON.parse(run(p, ["extra", "stats", "--json"]).stdout);
  assert.equal(st.dispatches, 1);
  assert.equal(st.sources.spend_log, 1);
  assert.equal(st.files_scanned, 0, "no trace exists — and the dispatch is counted anyway");
  rmrf(p.root);
});

test("dispatch: a FAILED dispatch is logged too — an unknown cost is not a free one", async () => {
  const p = project();
  await armedShim(p, "0-30");
  const r = dispatch(p, "authfail");
  assert.equal(r.status, 1);
  const rows = fs
    .readFileSync(path.join(p.root, ".claude", "orc", "extra-spend.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, "failed");
  // `fallback_to` records WHO would have finished it. Whether anybody did is
  // the caller's fact, not the bridge's — so the fallback LINE stays the
  // caller's to emit and this field is only the target.
  assert.ok(rows[0].fallback_to, "the recorded target is the agent that displaced this route");
  rmrf(p.root);
});
