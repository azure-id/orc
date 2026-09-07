"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, tmpdir } = require("../_helpers");

// `/orc-test` — the lane that RUNS the test (v1.5.0).
//
// This file covers the half that never sends a request: the frozen target, the
// free surface pass, the derived case matrix, the closed OWASP set, the
// read-only `show`, and the four `orc doctor` findings. The runner itself — the
// origin fence, redaction, the ladder, the pace — is `test-run.test.js`, which
// needs a real socket and lives in the `net` pool.
//
// Every case here is one of the three contracts in its own words:
//
//   · `a lane that reports a result it did not observe` — three verdicts, and
//     `unknown` is the honest one. An UNCHECKABLE OWASP row is not a pass and
//     never raises the exit code.
//   · `a lane that sends traffic to a target nobody authorized` — the target is
//     frozen once, a remote target REQUIRES a written statement, and no read in
//     this file probes anything.
//   · `a lane that fixes the system under test` — `env` reports and hands back.

const APP = [
  'const express = require("express");',
  "const app = express();",
  'app.get("/users", (req, res) => res.json([]));',
  'app.post("/users", (req, res) => res.status(201).json({}));',
  'app.get("/users/:id", (req, res) => res.json({}));',
  "module.exports = app;",
].join("\n");

// A project with a route surface a real extractor can find. No `orc init` — the
// test lane needs no payload on disk, and a fresh install per case would make
// this file minutes slower for nothing.
function project(extra) {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), APP);
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"toy","dependencies":{"express":"^4"}}\n');
  if (extra) extra(root);
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

// The standard opening move: a frozen local target with no live half.
function frozen(root, slug, more) {
  return t(root, [
    "test",
    "init",
    slug || "toy",
    "--kind",
    "be",
    "--env",
    "local",
    "--base-url",
    "http://127.0.0.1:59999",
    "--destructive",
    "deny",
    "--reason",
    "read only",
    ...(more || []),
  ]);
}

const ledgerOf = (root, slug) => JSON.parse(fs.readFileSync(path.join(root, "orc", "orc-test", slug, "test.json"), "utf8"));
const writeLedger = (root, slug, l) => fs.writeFileSync(path.join(root, "orc", "orc-test", slug, "test.json"), JSON.stringify(l, null, 2));

/* ─────────────────────────────────────────────── the frozen target ──────── */

test("init freezes the target, and a REMOTE one cannot be frozen without a written authorization", () => {
  const root = project();
  try {
    assert.equal(frozen(root).status, 0, "a local target freezes");
    const l = ledgerOf(root, "toy");
    assert.equal(l.target.kind, "be");
    assert.equal(l.target.origin, "http://127.0.0.1:59999", "the origin fence is derived at init");
    assert.deepStrictEqual(l.target.destructive, { mode: "deny", reason: "read only" });

    // `a lane that sends traffic to a target nobody authorized`. On a remote
    // target the statement is REQUIRED, and the refusal names the flag rather
    // than inventing a default — nothing in this lane has one.
    const bad = tj(root, [
      "test", "init", "staging", "--kind", "be", "--env", "remote",
      "--base-url", "https://staging.example.invalid", "--destructive", "deny", "--reason", "read only",
    ]);
    assert.notEqual(bad.status, 0, "a remote target with nobody named must be refused");
    assert.match(JSON.stringify(bad.json) + bad.stderr, /authorized/i, "the refusal names the flag");
    assert.ok(!fs.existsSync(path.join(root, "orc", "orc-test", "staging")), "a refused init writes nothing");
  } finally {
    rmrf(root);
  }
});

test("the authorization statement is recorded VERBATIM and ORC never claims to have checked it", () => {
  const root = project();
  try {
    const said = "the platform team, in ticket OPS-4471, for the window 04-09 09:00-12:00";
    assert.equal(
      t(root, [
        "test", "init", "staging", "--kind", "be", "--env", "remote",
        "--base-url", "https://staging.example.invalid",
        "--authorized", said,
        "--destructive", "allow", "--reason", "OPS-4471 names the seeded tenant",
      ]).status,
      0
    );
    assert.equal(ledgerOf(root, "staging").target.authorized, said, "word for word, never normalised");
    const shown = tj(root, ["test", "show", "staging"]);
    assert.equal(shown.json.authorized, said);
    // The sentence that keeps it honest travels with it.
    assert.match(t(root, ["test", "show", "staging"]).stdout, /never verified by ORC/i);
  } finally {
    rmrf(root);
  }
});

/* ──────────────────────────────────────────────────── the free pass ─────── */

test("surface is free, finds the routes, and a diff it could not measure says so", () => {
  const root = project();
  try {
    frozen(root);
    const s = tj(root, ["test", "surface", "toy", "--no-live"]);
    assert.equal(s.status, 0, "routes found -> 0");
    assert.ok(s.json.surface.routes.length >= 3, "the express routes are extracted");
    assert.deepStrictEqual(s.json.surface.frameworks, ["express"]);

    // THE LINE THIS LANE LIVES BY. With no live spec the diff is `null` WITH A
    // REASON. An empty array here would read as "no shadow APIs", which is a
    // claim nobody measured.
    assert.equal(s.json.surface.diff.source, null);
    assert.equal(s.json.surface.diff.code_only, null, "not an empty array — nothing was compared");
    assert.equal(s.json.surface.diff.live_only, null);
    // Two honest reasons, never one: the live half was SKIPPED here, and a live
    // half that ran and found no spec says "NOT 'no shadow APIs' — it is 'not
    // measured'". Neither ever renders as a clean result.
    assert.match(s.json.surface.diff.why, /skipped/i);
    assert.match(s.json.surface.diff.why, /orc test env/, "and it says how to get the measurement");

    // `live: null` is "we did not look", which is a different fact from "it is
    // not there" — and only one of them is a finding.
    for (const r of s.json.surface.routes) assert.equal(r.live, null, "the live half was skipped");
  } finally {
    rmrf(root);
  }
});

test("surface exits 1 when nothing named a route, and 2 when there is no run", () => {
  const bare = tmpdir();
  try {
    fs.writeFileSync(path.join(bare, "package.json"), "{}\n");
    // 2 — no run. Checked BEFORE the scan: there is nothing to scan against.
    assert.equal(tj(bare, ["test", "surface", "nope"]).status, 2);

    frozen(bare, "bare");
    const s = tj(bare, ["test", "surface", "bare", "--no-live"]);
    assert.equal(s.status, 1, "no route found -> 1, and ORC does not invent one");
    assert.equal(s.json.surface.routes.length, 0);
  } finally {
    rmrf(bare);
  }
});

/* ───────────────────────────────────────────── the derived case matrix ──── */

test("cases derive for free, and the budget is a PLANNED stop that names what it did not expand", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users", "--target", "GET /users/{}"]);

    const d = tj(root, ["test", "case", "derive", "toy"]);
    assert.equal(d.status, 0);
    assert.ok(d.json.total > 0, "the matrix comes out of the schema");

    // A PLANNED stop, not an interrupt — the `wiki_refresh_budget` shape. The
    // matrix is combinatorial, and a run that silently expands to four thousand
    // cases against a staging box is a denial of service you wrote yourself.
    const small = tj(root, ["test", "case", "derive", "toy", "--budget", "2"]);
    assert.equal(small.json.budget.budget, 2);
    assert.equal(small.json.budget.reached, true);
    assert.ok(Array.isArray(small.json.budget.unfinished), "what did not fit is NAMED, never silently absent");
  } finally {
    rmrf(root);
  }
});

test("`case add` REFUSES a malformed row BY NAME and writes nothing half-formed", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users"]);

    const f = path.join(root, "rows.json");
    fs.writeFileSync(
      f,
      JSON.stringify([
        // good
        { target: "GET /users", tier: "edge", why: "an explained case", request: { method: "GET", path: "/users" } },
        // a tier that is not in the closed list
        { target: "GET /users", tier: "vibes", why: "x", request: { method: "GET", path: "/users" } },
        // no `why` — a case nobody can explain later is a case nobody should run
        { id: "NO-WHY", target: "GET /users", tier: "edge", request: { method: "GET", path: "/users" } },
        // a target that is not in the surface
        { target: "GET /ghost", tier: "edge", why: "x", request: { method: "GET", path: "/ghost" } },
      ])
    );
    const a = tj(root, ["test", "case", "add", "toy", "--from", f]);
    assert.equal(a.status, 1, "a dropped row raises the exit code");
    assert.equal(a.json.added.length, 1, "only the good row landed");
    assert.equal(a.json.refused.length, 3);
    // BY NAME, and with the reason — never a count.
    const ids = a.json.refused.map((x) => String(x.id));
    assert.ok(ids.includes("NO-WHY"), "each refusal names the row it refused");
    assert.match(JSON.stringify(a.json.refused), /tier must be one of/);
    assert.match(JSON.stringify(a.json.refused), /not in the surface/);
  } finally {
    rmrf(root);
  }
});

/* ─────────────────────────────────────────────── the closed OWASP set ───── */

test("the OWASP set is CLOSED: ten rows, always, in every state", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users"]);
    t(root, ["test", "case", "derive", "toy"]);

    const s = tj(root, ["test", "security", "toy"]);
    assert.equal(s.status, 0, "nothing FOUND -> 0");
    assert.equal(s.json.rows.length, 10, "ten rows — the set is the OWASP API Top 10 (2023)");
    assert.deepStrictEqual(
      s.json.rows.map((r) => r.owasp),
      ["API1", "API2", "API3", "API4", "API5", "API6", "API7", "API8", "API9", "API10"]
    );
    assert.equal(s.json.closed_set.length, 10, "the table travels with the answer");
    assert.match(s.json.never_extended, /CLOSED/);
  } finally {
    rmrf(root);
  }
});

test("UNCHECKABLE keeps its slot, carries its OWN reason, and never raises the exit code", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users"]);
    t(root, ["test", "case", "derive", "toy"]);

    const s = tj(root, ["test", "security", "toy"]);
    const unchecked = s.json.rows.filter((r) => r.state === "unchecked");
    assert.ok(unchecked.length >= 3, "a run with one identity cannot measure several categories");

    // The single most damaging thing a security report can do is report a
    // category nobody measured as clean. So: never a pass, never absent, and
    // never a reason borrowed from the row next door.
    for (const r of unchecked) {
      assert.notEqual(r.state, "observed-clean");
      assert.ok((r.unchecked || []).length, `${r.owasp} must carry its own reason`);
      assert.ok(String(r.unchecked[0].why).length > 20, `${r.owasp}'s reason must say what it needs`);
    }
    const whys = new Set(unchecked.map((r) => r.unchecked[0].why));
    assert.equal(whys.size, unchecked.length, "each row explains ITSELF");

    // The exit code is about what was FOUND. `unchecked` is not a finding.
    assert.equal(s.status, 0, "unchecked never raises the exit code");

    // API1 and API5 are the two that turn on the identity count, and the
    // sentence saying so is printed wherever that count is shown.
    const byId = Object.fromEntries(s.json.rows.map((r) => [r.owasp, r]));
    assert.equal(byId.API1.state, "unchecked", "one identity -> BOLA is not measurable");
    assert.equal(byId.API5.state, "unchecked", "one role -> BFLA is not measurable");
    assert.match(t(root, ["test", "identity", "list", "toy"]).stdout, /UNCHECKABLE/);
  } finally {
    rmrf(root);
  }
});

test("`full` is CLIPPED to `safe` without --destructive allow, and the clip is ANNOUNCED", () => {
  const root = project();
  try {
    frozen(root); // frozen `--destructive deny`
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "POST /users"]);
    const d = tj(root, ["test", "case", "derive", "toy", "--security", "full"]);
    assert.equal(d.json.security.tier, "safe", "clipped");
    // A SHADOWED SETTING MUST NEVER BE SILENT.
    assert.match(JSON.stringify(d.json.security.notes), /full/i);
    assert.match(JSON.stringify(d.json.security.notes), /destructive/i);
  } finally {
    rmrf(root);
  }
});

test("security reports the tier the cases were DERIVED at, and NAMES a setting that moved since", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users"]);
    t(root, ["test", "case", "derive", "toy", "--security", "safe"]);

    // The setting moves AFTER the derive. Re-resolving here would report a run
    // at a tier it never ran at.
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "test_security_tier: off\n");

    const s = tj(root, ["test", "security", "toy"]);
    assert.equal(s.json.tier, "safe", "the STORED tier wins");
    assert.match(JSON.stringify(s.json.notes), /has NOT been applied/i, "the moved setting is NAMED, not applied");
    assert.match(JSON.stringify(s.json.notes), /re-derive/i, "and it says how to move it");
  } finally {
    rmrf(root);
  }
});

/* ────────────────────────────────────────────────── the read-only view ──── */

test("`orc test show` is a READ: it re-scans nothing, probes nothing and writes nothing", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    const before = fs.statSync(path.join(root, "orc", "orc-test", "toy", "test.json")).mtimeMs;
    const surfaceBefore = ledgerOf(root, "toy").surface.at;

    const s = tj(root, ["test", "show", "toy"]);
    assert.equal(s.status, 0);
    const after = fs.statSync(path.join(root, "orc", "orc-test", "toy", "test.json")).mtimeMs;
    assert.equal(after, before, "the ledger is not rewritten by a read");
    assert.equal(ledgerOf(root, "toy").surface.at, surfaceBefore, "the surface was not re-taken");
  } finally {
    rmrf(root);
  }
});

test("`show --json` carries the WHOLE computed view — `--json is not a summary`", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users"]);
    t(root, ["test", "case", "derive", "toy"]);

    const s = tj(root, ["test", "show", "toy"]).json;
    for (const k of [
      "state", "target", "authorized", "destructive", "identities", "two_identities",
      "selected", "counts", "cases", "surface", "env", "security", "runs",
      "findings", "flakes", "events", "paths", "report_exists", "where",
    ])
      assert.ok(k in s, `show --json must carry \`${k}\``);

    // The panel renders the whole picture off this ONE read, so the expensive
    // halves have to arrive whole rather than as counts.
    assert.ok(Array.isArray(s.surface.routes) && s.surface.routes.length, "the routes, not a count");
    assert.equal(s.security.rows.length, 10, "all ten OWASP rows, not a count");
    assert.ok(Array.isArray(s.cases) && s.cases.length, "the case rows, not a count");
    assert.equal(s.destructive.mode, "deny", "the decision AND its reason travel whole");
    assert.equal(s.destructive.reason, "read only");
  } finally {
    rmrf(root);
  }
});

test("`show` exits 2 on no run, and renders an UNREADABLE ledger as a ROW", () => {
  const root = project();
  try {
    frozen(root);
    assert.equal(tj(root, ["test", "show", "ghost"]).status, 2, "no run -> 2");

    // UNREADABLE is a LIST-level state (the `challengeList` rule): it degrades
    // into a row, never a crash, and is never silently dropped — a listing that
    // drops it hides the one run that needs attention.
    fs.writeFileSync(path.join(root, "orc", "orc-test", "toy", "test.json"), "{ broken");
    const s = tj(root, ["test", "show", "toy"]);
    assert.equal(s.status, 0, "a row, not a failure");
    assert.equal(s.json.state, "UNREADABLE");
    assert.ok(s.json.error, "and it says what could not be read");

    const list = tj(root, ["test", "status"]);
    assert.equal(list.json.runs.length, 1, "the listing keeps it");
    assert.equal(list.json.runs[0].state, "UNREADABLE");
  } finally {
    rmrf(root);
  }
});

/* ───────────────────────────────────────────── the environment reading ──── */

test("a health state is NEVER stored; the OBSERVATION is, and it renders with its WHEN", () => {
  const root = project();
  try {
    frozen(root);
    // Nothing is listening on the frozen port, so this is a real reading.
    const e = tj(root, ["test", "env", "toy"]);
    assert.equal(e.status, 1, "not ready -> 1");
    assert.ok(["absent", "down", "unhealthy", "starting"].includes(e.json.state));
    assert.ok(e.json.next && e.json.next.why, "every state names what to do next");

    const s = tj(root, ["test", "show", "toy"]).json;
    // The distinction this whole field exists for: a health state is COMPUTED
    // on read and never stored, but "the last time anybody looked, at this
    // timestamp" is a fact about the PAST — it does not go stale, it only gets
    // older.
    assert.equal(s.env.state, null, "`show` never reports a health state");
    assert.equal(s.env.stored, false);
    assert.equal(s.env.last_observed.state, e.json.state);
    assert.ok(Date.parse(s.env.last_observed.at) > 0, "an observation without its WHEN is a stale word");

    // And the human branch says WHEN too, rather than printing the word alone.
    assert.match(t(root, ["test", "show", "toy"]).stdout, /last observed .* at .*not the state now/);
  } finally {
    rmrf(root);
  }
});

test("`env` REFUSES a remote target BY NAME — ORC starts nothing on a host you do not own", () => {
  const root = project();
  try {
    t(root, [
      "test", "init", "staging", "--kind", "be", "--env", "remote",
      "--base-url", "https://staging.example.invalid",
      "--authorized", "the platform team, in OPS-4471",
      "--destructive", "deny", "--reason", "read only",
    ]);
    const e = tj(root, ["test", "env", "staging"]);
    assert.equal(e.status, 2, "refused before anything ran");
    assert.equal(e.json.reason, "remote-target");
    assert.match(e.json.hint, /host you do not own/i);
  } finally {
    rmrf(root);
  }
});

/* ────────────────────────────────────────────────────── the report ──────── */

test("`report` renders and derives nothing, and REPORT.md is the only file written to be shared", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users"]);
    t(root, ["test", "case", "derive", "toy"]);

    const r = tj(root, ["test", "report", "toy"]);
    assert.equal(r.status, 0, "nothing red -> 0");
    assert.match(r.json.derived_nothing, /renders/i);
    const body = fs.readFileSync(path.join(root, "orc", "orc-test", "toy", "REPORT.md"), "utf8");
    // It leads with what was measured AND what was not, because the second half
    // is the half a reader will otherwise assume.
    assert.match(body, /Nothing in this file was derived here/i);

    assert.equal(tj(root, ["test", "report", "ghost"]).status, 2, "no run -> 2");
  } finally {
    rmrf(root);
  }
});

test("report exits 1 on a red case, and `unknown` never raises it", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users"]);
    t(root, ["test", "case", "derive", "toy"]);

    // `unknown` is the HONEST verdict, and a run that exits red because it could
    // not observe something teaches people to stop believing the exit code.
    let l = ledgerOf(root, "toy");
    l.cases[0].verdict = "unknown";
    l.cases[0].verdict_why = "not observed — the ladder stopped";
    writeLedger(root, "toy", l);
    assert.equal(tj(root, ["test", "report", "toy"]).status, 0, "unknown never raises the exit code");

    l = ledgerOf(root, "toy");
    l.cases[0].verdict = "fail";
    writeLedger(root, "toy", l);
    const red = tj(root, ["test", "report", "toy"]);
    assert.equal(red.status, 1, "a FAILED case -> 1");
    assert.equal(red.json.counts.fail, 1);
  } finally {
    rmrf(root);
  }
});

/* ─────────────────────────────────────────── the front-end driver probe ─── */

test("`ui tools` is a four-state read, and `no_install_alternative: null` MEANS there is none", () => {
  const root = project();
  try {
    const u = tj(root, ["test", "ui", "tools"]);
    // Playwright is not installed in a bare temp project, so this is the state a
    // first-time reader is actually in.
    assert.equal(u.status, 1, "not ready -> 1");
    assert.deepStrictEqual(u.json.ui.states, ["absent", "outdated", "unauthenticated", "ready"]);
    assert.equal(u.json.ui.state, "absent");
    // NAMED, NEVER RUN. ORC does not install into somebody else's project.
    assert.ok(u.json.ui.next, "the command is named");
    assert.ok((u.json.ui.install.cmds || []).length, "and so is every manager it knows");
    assert.strictEqual(u.json.ui.no_install_alternative, null, "null MEANS there is none, not that ORC forgot to look");

    // `none` is a SETTING, not a missing tool — a different exit code, because
    // they are different facts and one of them is not a problem.
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "test_ui_driver: none\n");
    const off = tj(root, ["test", "ui", "tools"]);
    assert.equal(off.status, 2, "driver `none` -> 2");
    assert.equal(off.json.ui.disabled, true);
    assert.match(off.json.ui.why, /setting, not a missing tool/i);
  } finally {
    rmrf(root);
  }
});

/* ──────────────────────────────────────────────── the doctor findings ───── */

function doctor(root) {
  const r = cli(["doctor", "--dir", root, "--json"]);
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch (_) {}
  return { status: r.status, ids: json ? json.findings.map((f) => f.id) : [], json };
}

test("doctor reports a red run and a last-observed unhealthy environment — and probes nothing", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users"]);
    t(root, ["test", "case", "derive", "toy"]);

    const clean = doctor(root);
    assert.ok(!clean.ids.includes("test-run-red"), "no red case, no finding");
    assert.ok(!clean.ids.includes("test-env-unhealthy"));

    const l = ledgerOf(root, "toy");
    l.cases[0].verdict = "fail";
    l.env_observed = { state: "unhealthy", at: new Date().toISOString() };
    writeLedger(root, "toy", l);

    const d = doctor(root);
    assert.ok(d.ids.includes("test-run-red"), "a FAILED case is a finding");
    assert.ok(d.ids.includes("test-env-unhealthy"));
    const env = d.json.findings.find((f) => f.id === "test-env-unhealthy");
    // NOT "the environment is unhealthy" — nothing here measured that.
    assert.match(env.message, /last OBSERVATION, not the state now/i);
    assert.match(env.message, /does not repair the system it is testing/i);
    const red = d.json.findings.find((f) => f.id === "test-run-red");
    assert.match(red.message, /C-001/, "the finding names the case, not a count");
  } finally {
    rmrf(root);
  }
});

test("test-unchecked-owasp is RESTRAINED to a run with a REPORT on disk", () => {
  const root = project();
  try {
    frozen(root);
    t(root, ["test", "surface", "toy", "--no-live"]);
    t(root, ["test", "select", "toy", "--target", "GET /users"]);
    t(root, ["test", "case", "derive", "toy"]);

    // An unchecked OWASP row is the NORMAL state of a run in progress, and a
    // doctor that warns about a normal state is a doctor people learn to ignore
    // (the `wiki-debt` rule — STALE only, never AGING).
    assert.ok(!doctor(root).ids.includes("test-unchecked-owasp"), "mid-build is not a caution");

    // A REPORT is the artifact somebody SHARES, and an unmeasured category
    // inside a shared report is the dangerous case.
    t(root, ["test", "report", "toy"]);
    const d = doctor(root);
    assert.ok(d.ids.includes("test-unchecked-owasp"));
    const f = d.json.findings.find((x) => x.id === "test-unchecked-owasp");
    assert.match(f.message, /API1/, "it names the categories");
    assert.match(f.message, /none of them is a pass/i);
  } finally {
    rmrf(root);
  }
});

test("test-evidence-unstaged fires only when git says the folder is not ignored", () => {
  const { spawnSync } = require("child_process");
  const root = project();
  try {
    frozen(root);
    const git = (...argv) => spawnSync("git", argv, { cwd: root, encoding: "utf8" });
    if (git("init", "-q").status !== 0) return; // no git here: nothing to assert

    // UNKNOWN is never reported as a problem, so the finding needs git's own
    // answer rather than a .gitignore parser of ORC's own.
    const before = doctor(root);
    assert.ok(before.ids.includes("test-evidence-unstaged"), "not ignored -> the caution fires");
    const f = before.json.findings.find((x) => x.id === "test-evidence-unstaged");
    assert.match(f.message, /real response bodies/i);
    assert.match(f.message, /ORC does not edit that file/i, "ORC names the line and will not write it");

    fs.writeFileSync(path.join(root, ".gitignore"), "orc/orc-test/\n");
    assert.ok(!doctor(root).ids.includes("test-evidence-unstaged"), "ignored -> silent");
  } finally {
    rmrf(root);
  }
});

/* ────────────────────────────────────────────── five keys, five refused ─── */

test("the lane has FIVE config keys, and the five refused ones stay refused", () => {
  const root = project();
  try {
    // The five that exist. Every one is settable and validated by the CLI.
    for (const [k, v] of [
      ["test_gate", "off"],
      ["test_security_tier", "full"],
      ["test_max_rps", "2"],
      ["test_case_budget", "50"],
      ["test_ui_driver", "none"],
    ])
      assert.equal(cli(["config", "set", k, v, "--dir", root]).status, 0, `${k} must be settable`);

    // A value outside the closed set is refused rather than stored.
    assert.notEqual(cli(["config", "set", "test_security_tier", "aggressive", "--dir", root]).status, 0);
    assert.notEqual(cli(["config", "set", "test_ui_driver", "selenium", "--dir", root]).status, 0);

    // THE FIVE REFUSED. Each one is a key somebody will propose again, so it is
    // refused here AND its reason is written down where the next person looks.
    for (const k of ["test_auto_fix", "test_destructive", "test_target_url", "test_retries", "test_skip_auth_probe"])
      assert.notEqual(cli(["config", "set", k, "true", "--dir", root]).status, 0, `${k} must stay refused`);
  } finally {
    rmrf(root);
  }
});

test("every refused key's REASON is written down in the shared contract prose", () => {
  // `bin/cli.js` says the reasons live in `_shared/live-target.md`. They must
  // actually be there: a comment pointing at a file that does not carry them is
  // a silence with a citation on it, and the next person to propose one of these
  // finds nothing to argue with.
  const prose = fs.readFileSync(path.join(__dirname, "..", "..", "templates", "skills", "_shared", "live-target.md"), "utf8");
  for (const k of ["test_auto_fix", "test_destructive", "test_target_url", "test_retries", "test_skip_auth_probe"])
    assert.ok(prose.includes("`" + k + "`"), `${k} is refused but its reason is not written down`);
  // And the five that DO exist are named there too, so the list is a list.
  for (const k of ["test_gate", "test_security_tier", "test_max_rps", "test_case_budget", "test_ui_driver"])
    assert.ok(prose.includes("`" + k + "`"), `${k} is a real key and belongs in the list`);
});
