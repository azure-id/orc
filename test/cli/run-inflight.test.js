"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, tmpdir } = require("../_helpers");

// `orc run inflight` — the guard behind `a lane that re-dispatches over a live
// attempt` (v1.2.0). A Task error does not kill the subagent behind it, so a
// lane that retries on a broken return can put a SECOND agent on a live task.
// A graded /orc-quick entry did exactly that three times over: 50m19s + 115m22s
// + 100m53s of opus-5-low on ONE task. Every case below is a state that entry
// passed through.

const TRACE = "run-quick-rmt-recipient-approval-030926-191813.txt";

// The hook's own skeleton lines, in the shape orc-trace.js writes them.
function traceText(spawns, returns) {
  const L = [];
  for (let i = 0; i < spawns; i++)
    L.push(`[030926 20:2${i}:00.000] hook     SPAWN orc-executor-opus-5-low :: task ${i}`);
  for (let i = 0; i < returns; i++)
    L.push(`[030926 21:2${i}:00.000] hook     RETURN orc-executor-opus-5-low :: task ${i} dur=1m0s`);
  return L.join("\n") + "\n";
}

// A project with a log dir, a pointer, a trace, and optionally a sidecar.
function project({ pointer = TRACE, spawns = 0, returns = 0, pending = null }) {
  const root = tmpdir();
  const logs = path.join(root, ".claude", "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  if (pointer !== null) {
    fs.writeFileSync(path.join(logs, ".current"), pointer);
    fs.writeFileSync(path.join(logs, pointer), traceText(spawns, returns));
  }
  if (pending !== null)
    fs.writeFileSync(path.join(logs, pointer + ".pending.json"), JSON.stringify(pending));
  return root;
}

function inflight(root) {
  const r = cli(["run", "inflight", "--dir", root, "--json"]);
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) {}
  return { status: r.status, json, stdout: r.stdout };
}

const minsAgo = (m) => Date.now() - m * 60000;

test("three live dispatches on one task -> exit 1, every agent named", () => {
  // The real incident: SPAWN at 20:25, 'retry' at 20:29, 'retry 2' at 20:48,
  // none returned. Had the lane asked, the second dispatch never happens.
  const root = project({
    spawns: 3,
    returns: 0,
    pending: [
      { agent: "orc-executor-opus-5-low", desc: "Fix approval flow defects", ts: minsAgo(30) },
      { agent: "orc-executor-opus-5-low", desc: "Fix approval flow defects retry", ts: minsAgo(26) },
      { agent: "orc-executor-opus-5-low", desc: "Fix approval flow defects retry 2", ts: minsAgo(7) },
    ],
  });
  const { status, json } = inflight(root);
  assert.equal(status, 1, "a live attempt must exit 1");
  assert.equal(json.state, "in-flight");
  assert.equal(json.count, 3);
  assert.equal(json.entries.length, 3);
  // Naming the task is the point — a count is not a refusal the user can act on.
  assert.ok(json.entries.every((e) => e.agent === "orc-executor-opus-5-low"));
  assert.ok(json.entries.some((e) => /retry 2$/.test(e.desc)));
  assert.ok(json.entries.every((e) => typeof e.age_s === "number" && e.age_s > 0));
  assert.equal(json.stale_entries, 0);
  rmrf(root);
});

test("empty sidecar AND a balanced trace -> exit 0", () => {
  const root = project({ spawns: 2, returns: 2, pending: [] });
  const { status, json } = inflight(root);
  assert.equal(status, 0);
  assert.equal(json.state, "clear");
  assert.equal(json.balance_agrees, true);
  rmrf(root);
});

test("empty sidecar but the trace disagrees -> unknown, never clear", () => {
  // The sidecar says nothing is open; the trace shows a SPAWN with no RETURN.
  // Trusting the sidecar here is how a live agent becomes invisible.
  const root = project({ spawns: 3, returns: 1, pending: [] });
  const { status, json } = inflight(root);
  assert.equal(status, 2);
  assert.equal(json.state, "unknown");
  assert.equal(json.balance_agrees, false);
  assert.match(json.reason, /disagree/);
  rmrf(root);
});

test("no sidecar at all, trace shows unmatched SPAWNs -> exit 1", () => {
  const root = project({ spawns: 2, returns: 0, pending: null });
  const { status, json } = inflight(root);
  assert.equal(status, 1);
  assert.equal(json.state, "in-flight");
  assert.equal(json.sidecar_readable, false);
  rmrf(root);
});

test("no sidecar, balanced trace -> unknown (unknown is not zero)", () => {
  const root = project({ spawns: 2, returns: 2, pending: null });
  const { status, json } = inflight(root);
  assert.equal(status, 2, "an unreadable sidecar can never prove a dispatch finished");
  assert.equal(json.state, "unknown");
  rmrf(root);
});

test("records older than 6h -> unknown, not clear and not in-flight", () => {
  const root = project({
    spawns: 1,
    returns: 0,
    pending: [{ agent: "orc-executor-opus-5-low", desc: "old", ts: minsAgo(9 * 60) }],
  });
  const { status, json } = inflight(root);
  assert.equal(status, 2);
  assert.equal(json.state, "unknown");
  assert.equal(json.stale_entries, 1);
  assert.ok(json.entries[0].stale);
  rmrf(root);
});

test("no trace pointer -> unknown, and it says so", () => {
  const root = project({ pointer: null });
  const { status, json } = inflight(root);
  assert.equal(status, 2);
  assert.equal(json.state, "unknown");
  assert.match(json.reason, /no trace pointer/);
  rmrf(root);
});

test("a dangling pointer is unknown, never clear", () => {
  const root = tmpdir();
  const logs = path.join(root, ".claude", "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(logs, ".current"), "run-quick-gone-010101-000000.txt");
  const { status, json } = inflight(root);
  assert.equal(status, 2);
  assert.match(json.reason, /cannot be read/);
  rmrf(root);
});

test("--json is not a summary — every field the human branch shows is carried", () => {
  const root = project({
    spawns: 1,
    returns: 0,
    pending: [{ agent: "orc-executor-opus-5-low", desc: "d", ts: minsAgo(5) }],
  });
  const { json } = inflight(root);
  for (const k of [
    "ok", "state", "reason", "count", "entries", "trace", "lane", "slug",
    "log_dir", "sidecar", "sidecar_readable", "spawns", "returns",
    "balance_agrees", "stale_entries",
  ])
    assert.ok(k in json, `--json must carry ${k}`);
  assert.equal(json.lane, "quick");
  assert.equal(json.slug, "rmt-recipient-approval");
  // The human branch must refuse out loud, not just exit non-zero.
  const human = cli(["run", "inflight", "--dir", root]);
  assert.equal(human.status, 1);
  assert.match(human.stdout, /IN FLIGHT/);
  assert.match(human.stdout, /Do NOT re-dispatch/);
  rmrf(root);
});
