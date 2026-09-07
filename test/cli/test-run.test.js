"use strict";
// @test-pool net   — stands up a fake target on loopback
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, tmpdir } = require("../_helpers");
const target = require("./_fake-target.js");

// `orc test run` — the only place in ORC that sends a request to a system it
// did not start (v1.5.0). Everything asserted here exists so ORC's own runner is
// never the incident:
//
//   · THE ORIGIN FENCE. A request whose resolved URL leaves the frozen origin is
//     NOT SENT. Recorded, reported, dropped — and the proof is the receiving
//     end's own account, never a verdict word.
//   · REDACTION IS STRUCTURAL. Every credential is replaced BEFORE the bytes
//     reach disk, not in a review step afterwards.
//   · THE LADDER HAS A STOP. A red happy path makes the edge cases meaningless
//     and the security tier noise.
//   · A 429 IS A RESULT. It means rate limiting works.
//   · `unknown` NEVER RAISES THE EXIT CODE. A run that exits red because it
//     could not observe something teaches people to stop believing the code.
//
// The target runs in its own process — see `_fake-target.js` for why that is
// load-bearing rather than tidy.

const SECRET = target.PLANTED;

const APP = [
  'const express = require("express");',
  "const app = express();",
  'app.get("/users", (req, res) => res.json([]));',
  'app.get("/users/:id", (req, res) => res.json({}));',
  "module.exports = app;",
].join("\n");

function project() {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), APP);
  // The dependency is not decoration: the extractor FINGERPRINTS the framework
  // first, and a package.json declaring none yields no routes at all — which
  // would make every case below pass for the wrong reason.
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"toy","dependencies":{"express":"^4"}}\n');
  return root;
}

const t = (root, argv, env) => cli([...argv, "--dir", root], env);

function tj(root, argv, env) {
  const r = t(root, [...argv, "--json"], env);
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch (_) {}
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
}

const ledgerOf = (root) => JSON.parse(fs.readFileSync(path.join(root, "orc", "orc-test", "toy", "test.json"), "utf8"));
const writeLedger = (root, l) => fs.writeFileSync(path.join(root, "orc", "orc-test", "toy", "test.json"), JSON.stringify(l, null, 2));

// Freeze, take the surface, select, derive — the four steps every run needs.
function armed(root, port, opts) {
  assert.equal(
    t(root, [
      "test", "init", "toy", "--kind", "be", "--env", "local",
      "--base-url", `http://127.0.0.1:${port}`,
      "--destructive", (opts && opts.destructive) || "deny", "--reason", "the test suite's own fake target",
    ]).status,
    0
  );
  assert.equal(t(root, ["test", "surface", "toy", "--no-live"]).status, 0);
  assert.equal(t(root, ["test", "select", "toy", "--target", "GET /users", "--target", "GET /users/{}"]).status, 0);
  assert.equal(t(root, ["test", "case", "derive", "toy", "--security", (opts && opts.security) || "off"]).status, 0);
  // Every case this file asserts on must actually be SENT. With
  // `--destructive deny` the mutating half is skipped by design (its own rule,
  // covered in test-lane.test.js), so the runner assertions here are about the
  // GET cases the fake target models.
  const l = ledgerOf(root);
  assert.ok(l.cases.some((c) => !c.mutates), "the matrix must contain a non-mutating case to send");
}

const walk = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

/* ─────────────────────────────────────────────────── the happy course ───── */

test("a green run records what it saw, and every case cites evidence that is ON DISK", async () => {
  const f = await target.start("ok");
  const root = project();
  try {
    armed(root, f.port);
    const r = tj(root, ["test", "run", "toy"]);
    assert.equal(r.status, 0, "nothing red -> 0");
    assert.ok(r.json.counts.pass > 0, "the non-mutating cases were observed");

    // A finding must be able to point at something. The evidence folder is
    // written by the runner, per case, at the moment it saw the response.
    const passed = ledgerOf(root).cases.filter((c) => c.verdict === "pass");
    assert.ok(passed.length);
    for (const c of passed) {
      const dir = path.join(root, c.evidence);
      assert.ok(fs.existsSync(path.join(dir, "request.txt")), `${c.id}: the request it sent`);
      assert.ok(fs.existsSync(path.join(dir, "response.txt")), `${c.id}: the response it saw`);
    }

    // The runner identifies itself on every request. A target's owner reading
    // their own logs must be able to tell this traffic apart from real traffic.
    assert.ok(f.hits().length, "requests actually reached the target");
  } finally {
    f.stop();
    rmrf(root);
  }
});

test("every request names itself and carries the run id", async () => {
  const f = await target.start("ok");
  const root = project();
  try {
    armed(root, f.port);
    t(root, ["test", "run", "toy"]);
    const files = walk(path.join(root, "orc", "orc-test", "toy", "runs")).filter((p) => p.endsWith("request.txt"));
    assert.ok(files.length, "requests were recorded");
    for (const p of files) {
      const body = fs.readFileSync(p, "utf8");
      if (body.startsWith("NOT SENT")) continue;
      assert.match(body, /orc-test/i, "the User-Agent names this lane");
      assert.match(body, /x-orc-test-run/i, "and the run id travels with it");
    }
  } finally {
    f.stop();
    rmrf(root);
  }
});

/* ────────────────────────────────────────────────────── the ladder ──────── */

test("a RED happy path STOPS the ladder, and everything below it is `unknown` — never a pass", async () => {
  // A 500 on every request will "prove" a dozen vulnerabilities that are one
  // bug, so the ladder stops and hands back.
  const f = await target.start("err500");
  const root = project();
  try {
    armed(root, f.port, { security: "safe" });
    const r = tj(root, ["test", "run", "toy"]);
    assert.equal(r.status, 1, "a FAILED case -> 1");
    assert.ok(r.json.stopped, "the ladder stopped");
    assert.equal(r.json.stopped.at, "happy", "at the happy tier");
    assert.ok(r.json.stopped.why, "and it says why");

    const l = ledgerOf(root);
    const below = l.cases.filter((c) => c.tier !== "happy");
    assert.ok(below.length, "there were later tiers to skip");
    for (const c of below) {
      // A case the ladder never reached is `unknown` WITH THE REASON. It is not
      // left at a previous verdict, which would report a stale pass.
      assert.equal(c.verdict, "unknown", `${c.id} was not observed`);
      assert.ok(String(c.verdict_why).length, `${c.id} says why`);
    }
    const security = l.cases.filter((c) => c.tier === "security");
    for (const c of security) assert.notEqual(c.verdict, "pass", "an unreached security probe is never a pass");
  } finally {
    f.stop();
    rmrf(root);
  }
});

/* ───────────────────────────────────────────────── the origin fence ─────── */

test("the origin fence: a case pointed off-origin is NOT SENT, and the OTHER host's own log proves it", async () => {
  const f = await target.start("ok");
  // A second server that must never be contacted. Anything arriving here is the
  // fence failing, and the whole lane with it — so the proof is ITS account,
  // not a verdict word ORC wrote about itself.
  const off = await target.start("silent");
  const root = project();
  try {
    armed(root, f.port);
    const l = ledgerOf(root);
    l.cases = [
      {
        id: "C-900",
        target: "GET /users",
        tier: "happy",
        source: "designed",
        why: "an absolute URL that leaves the frozen origin",
        identity: null,
        mutates: false,
        request: { method: "GET", path: `http://127.0.0.1:${off.port}/steal`, headers: {} },
        expect: { status: [200] },
      },
    ];
    writeLedger(root, l);

    const r = tj(root, ["test", "run", "toy"]);
    assert.equal(off.hits().length, 0, "NOTHING reached the off-origin host");

    const after = ledgerOf(root).cases[0];
    assert.notEqual(after.verdict, "pass", "a request nobody sent is never a pass");
    // Recorded and reported, never silently dropped.
    const said = String(after.verdict_why || "") + JSON.stringify(r.json || {});
    assert.match(said, /origin|fence/i, "the drop carries its reason");

    // And the evidence file says NOT SENT rather than pretending to a response.
    if (after.evidence) {
      const req = path.join(root, after.evidence, "request.txt");
      if (fs.existsSync(req)) assert.match(fs.readFileSync(req, "utf8"), /NOT SENT/);
    }
  } finally {
    f.stop();
    off.stop();
    rmrf(root);
  }
});

/* ───────────────────────────────────────────────────── redaction ────────── */

test("redaction is STRUCTURAL: the credential is replaced BEFORE the bytes reach disk", async () => {
  // The target hands a credential straight back in Set-Cookie. Real ones do, and
  // ORC must redact what it RECEIVED as well as what it sent.
  const f = await target.start("cookie");
  const root = project();
  try {
    armed(root, f.port);
    assert.equal(
      t(root, ["test", "identity", "add", "toy", "reader", "--role", "user", "--source", "env", "--env-var", "TOK"]).status,
      0
    );
    const l = ledgerOf(root);
    for (const c of l.cases) c.identity = "reader";
    writeLedger(root, l);

    t(root, ["test", "run", "toy"], { TOK: SECRET });

    // Walk EVERY file the run wrote. ORC does not do the "last six characters"
    // convention: a report is meant to be readable in a PR, and a tail is still
    // a secret when the vault is small.
    const files = walk(path.join(root, "orc", "orc-test", "toy", "runs"));
    assert.ok(files.length, "the run wrote evidence");
    let sent = 0;
    for (const p of files) {
      const body = fs.readFileSync(p, "utf8");
      assert.ok(!body.includes(SECRET), `${path.relative(root, p)} leaked the credential`);
      if (p.endsWith("request.txt") && !body.startsWith("NOT SENT")) {
        sent++;
        // Something was written WHERE the credential was, rather than the header
        // being dropped — a dropped header hides that a credential was sent.
        assert.match(body, /redacted/i, "the replacement is visible");
      }
    }
    assert.ok(sent > 0, "at least one request was actually sent, or this proves nothing");

    // And the ledger itself never holds it either.
    assert.ok(!fs.readFileSync(path.join(root, "orc", "orc-test", "toy", "test.json"), "utf8").includes(SECRET));
  } finally {
    f.stop();
    rmrf(root);
  }
});

test("a repro.sh carries no credential and SAYS the credential was removed", async () => {
  const f = await target.start("cookie");
  const root = project();
  try {
    armed(root, f.port);
    t(root, ["test", "identity", "add", "toy", "reader", "--role", "user", "--source", "env", "--env-var", "TOK"]);
    const l = ledgerOf(root);
    for (const c of l.cases) c.identity = "reader";
    writeLedger(root, l);
    t(root, ["test", "run", "toy"], { TOK: SECRET });

    const repros = walk(path.join(root, "orc", "orc-test", "toy", "runs")).filter((p) => p.endsWith("repro.sh"));
    assert.ok(repros.length, "a sent request gets a repro");
    for (const p of repros) {
      const body = fs.readFileSync(p, "utf8");
      assert.ok(!body.includes(SECRET), "the repro must not carry the credential");
      assert.match(body, /Put yours back before running this/i, "and it must say the credential was removed");
    }
  } finally {
    f.stop();
    rmrf(root);
  }
});

/* ─────────────────────────────────────────────────────── a 429 ──────────── */

test("a 429 is a RESULT — it means rate limiting works, and ORC does not push through", async () => {
  const f = await target.start("ratelimit");
  const root = project();
  try {
    armed(root, f.port);
    const r = tj(root, ["test", "run", "toy"]);
    const l = ledgerOf(root);
    assert.ok(
      l.cases.some((c) => c.last_status === 429),
      "the 429 was recorded as what happened, not swallowed"
    );
    // Pushing through is how a staging scan becomes a lockout. One request per
    // case, plus a small margin — never a retry storm.
    assert.ok(f.hits().length <= l.cases.length + 2, `pushed through: ${f.hits().length} requests for ${l.cases.length} cases`);
    assert.ok(r.json, "and the run still reported");
  } finally {
    f.stop();
    rmrf(root);
  }
});

/* ──────────────────────────────────────────────── the pace, and --only ──── */

test("`--only` sends exactly the case named, and leaves every other verdict alone", async () => {
  const f = await target.start("ok");
  const root = project();
  try {
    armed(root, f.port);
    const first = ledgerOf(root).cases.find((c) => !c.mutates);
    const r = tj(root, ["test", "run", "toy", "--only", first.id]);
    assert.equal(r.status, 0);
    assert.equal(f.hits().length, 1, "exactly one request left the machine");
    const l = ledgerOf(root);
    for (const c of l.cases) {
      if (c.id === first.id) assert.equal(c.verdict, "pass");
      else assert.ok(!c.verdict, `${c.id} was not touched`);
    }
  } finally {
    f.stop();
    rmrf(root);
  }
});

test("`test_max_rps` is applied by the CLI — the pace belongs to the target, not to ORC", async () => {
  const f = await target.start("ok");
  const root = project();
  try {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "test_max_rps: 3\n");
    armed(root, f.port);
    t(root, ["test", "run", "toy"]);
    // The pace travels WITH the result, so a report can say how hard the target
    // was pushed rather than leaving a reader to guess.
    const result = JSON.parse(fs.readFileSync(path.join(root, "orc", "orc-test", "toy", "runs", "01", "result.json"), "utf8"));
    assert.equal(result.pace.max_rps, 3, "the configured rate is the one recorded");
    assert.ok(result.pace.concurrency >= 1, "and the concurrency it actually used");
  } finally {
    f.stop();
    rmrf(root);
  }
});

/* ─────────────────────────────────────────────────── record + flakes ────── */

test("a finding whose evidence does not resolve is DROPPED BY NAME and counted", async () => {
  const f = await target.start("ok");
  const root = project();
  try {
    armed(root, f.port);
    t(root, ["test", "run", "toy"]);
    const good = ledgerOf(root).cases.find((c) => c.evidence);
    assert.ok(good, "a case with evidence on disk");

    const file = path.join(root, "findings.json");
    fs.writeFileSync(
      file,
      JSON.stringify([
        { title: "a real one", what: "observed", evidence: good.evidence, case: good.id },
        { title: "a made-up one", what: "invented", evidence: "orc/orc-test/toy/runs/99/evidence/C-999", case: good.id },
      ])
    );
    const rec = tj(root, ["test", "record", "toy", "--from", file]);
    assert.equal(rec.status, 1, "a dropped finding raises the exit code");
    assert.equal(rec.json.recorded.length, 1);
    assert.equal(rec.json.dropped.length, 1, "a finding with no reachable proof is not carried");
    assert.match(String(rec.json.dropped[0].id), /made-up/i, "and it is dropped BY NAME");
  } finally {
    f.stop();
    rmrf(root);
  }
});

test("SEVERITY IS ORC'S — the model's own is KEPT beside it, and never used", async () => {
  const f = await target.start("ok");
  const root = project();
  try {
    armed(root, f.port);
    t(root, ["test", "run", "toy"]);
    const c = ledgerOf(root).cases.find((x) => x.evidence);

    const file = path.join(root, "findings.json");
    fs.writeFileSync(
      file,
      JSON.stringify([{ title: "x", what: "y", evidence: c.evidence, case: c.id, owasp: "API1", severity: "low" }])
    );
    const got = tj(root, ["test", "record", "toy", "--from", file]).json.findings[0];
    assert.equal(got.claimed_severity, "low", "the model's word is KEPT — that is what makes a disagreement visible");
    assert.ok(got.severity, "and ORC derives its own");
    assert.ok(got.severity_why, "with the reasoning printed");
    // This case PASSED, so the finding was never OBSERVED — and a candidate
    // pending verification does not get a CVSS score.
    assert.equal(got.observed, false);
    assert.equal(got.cvss, null);
    assert.match(got.cvss_note, /not OBSERVED/i);
  } finally {
    f.stop();
    rmrf(root);
  }
});

test("a FLAKE is recorded, never retried away — the instability IS the finding", async () => {
  // 200 for the first two requests, 500 after. There is no retry count in the
  // runner, on purpose: the ledger holds both readings.
  const f = await target.start("flaky");
  const root = project();
  try {
    armed(root, f.port);
    t(root, ["test", "run", "toy"]);
    const before = ledgerOf(root).cases.map((c) => [c.id, c.verdict]);
    t(root, ["test", "run", "toy"]);
    const l = ledgerOf(root);

    const moved = l.cases.filter((c) => {
      const was = before.find((b) => b[0] === c.id);
      return was && was[1] && was[1] !== c.verdict;
    });
    assert.ok(moved.length, "the fake target answered differently across the two runs");
    assert.ok((l.flakes || []).length, "a verdict that moved between runs is RECORDED");
    const fl = l.flakes[0];
    assert.ok(fl.was && fl.now, "both readings are kept — that is the finding");
    assert.match(t(root, ["test", "report", "toy"]).stdout, /never retried away/i);
  } finally {
    f.stop();
    rmrf(root);
  }
});
