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

// --fixtures must carry ONE OF EVERY STATE, including the ugly ones: you cannot
// DESIGN a STALE chip on a fresh wiki. Asserted per state, so a new state
// cannot ship without a fixture nobody has ever looked at.
//
// Split out of webui.test.js in v0.48.1, alongside bin/webui/ itself.

test("fixtures match the live --json shapes for the routes they stand in for", () => {
  const { root } = freshInstall();
  try {
    const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
    const pairs = [
      ["/api/where", ["where"]],
      ["/api/doctor", ["doctor"]],
      ["/api/config", ["config", "list"]],
      ["/api/wiki", ["wiki", "status"]],
      ["/api/patterns", ["pattern", "status"]],
      ["/api/gotchas", ["gotcha", "list"]],
      ["/api/stats", ["stats"]],
      ["/api/runs", ["run", "list"]],
      ["/api/diy", ["diy", "show"]],
      ["/api/crosslink", ["crosslink", "list"]],
      ["/api/mocks", ["mock", "list"]],
      ["/api/version", ["version"]],
    ];
    for (const [route, argv] of pairs) {
      const live = JSON.parse(cli([...argv, "--json", "--dir", root]).stdout);
      const canned = fixtures.get(route, {});
      assert.ok(canned, `no fixture for ${route}`);
      for (const key of Object.keys(live))
        assert.ok(key in canned, `fixture ${route} is missing the live key "${key}"`);
    }
  } finally {
    rmrf(root);
  }
});

// The whole point of fixture mode is designing states you cannot otherwise
// reach. If they all read healthy, the mode is decoration.
test("fixtures carry the UGLY states, not just the happy ones", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  assert.strictEqual(fixtures.get("/api/wiki", {}).tier, "STALE", "a STALE wiki must be designable");
  assert.strictEqual(
    fixtures.get("/api/version", {}).update_available,
    true,
    "an AVAILABLE update must be designable — 'up to date' is the state that needs no design"
  );
  assert.strictEqual(fixtures.get("/api/doctor", {}).ok, false, "an unhealthy doctor must be designable");
  assert.ok(fixtures.get("/api/doctor", {}).global_install.shadows, "the global-install banner must be designable");
  assert.ok(
    fixtures.get("/api/runs", {}).runs.some((r) => r.status === "waiting"),
    "a waiting run card must be designable"
  );
  assert.ok(
    fixtures.get("/api/config", {}).keys.some((k) => k.is_shadowed),
    "the shadowed-setting lock must be designable"
  );
  assert.strictEqual(fixtures.get("/api/diy", {}).state, "STALE", "a stale DIY gate must be designable");
  assert.ok(
    fixtures.get("/api/crosslink", {}).nodes.some((n) => n.provider.state === "missing"),
    "an unresolvable peer must be designable"
  );
});

// v0.47.0 — /orc-challenge. ONE FIXTURE PER STATE, and the ugly ones are the
// point: you cannot design a TAMPERED chip on a healthy cycle, a candidate list
// on a cycle whose revision is where it was declared, or a `NOT-CHECKED`
// dimension chip on a cycle that has a template.
test("challenge fixtures carry one of every computed state", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  const cycles = fixtures.get("/api/challenge", {}).cycles;
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const block = cli.match(/const CHALLENGE_STATES = \[([\s\S]*?)\n\];/);
  assert.ok(block, "CHALLENGE_STATES is parseable");
  const states = [...block[1].matchAll(/"([A-Z-]+)"/g)].map((m) => m[1]);
  assert.ok(states.length >= 7, "the full state list is present");
  for (const s of states)
    assert.ok(
      cycles.some((c) => c.state === s),
      `a ${s} cycle must be designable`
    );

  // The flags ride alongside the state, so they need their own fixtures.
  assert.ok(cycles.some((c) => c.stalled), "a stalled cycle must be designable");
  assert.ok(cycles.some((c) => c.no_template), "a cycle with no template must be designable");
  assert.ok(cycles.some((c) => c.iterations === 0), "a zero-iteration cycle must be designable");
  assert.ok(cycles.some((c) => c.counts.accepted > 0), "an accepted exception must be designable");
  assert.ok(cycles.some((c) => c.counts.rebutted > 0), "an open rebuttal must be designable");

  // A NOT-CHECKED dimension always carries its reason — rule 6, and the chip
  // shows that reason on hover AND to a screen reader.
  const noTpl = cycles.find((c) => c.no_template);
  const dims = fixtures.get("/api/challenge/one", { slug: noTpl.slug }).dimensions;
  const nc = dims.filter((d) => d.status === "NOT-CHECKED");
  assert.ok(nc.length, "a NOT-CHECKED dimension must be designable");
  for (const d of nc) assert.match(d.reason || "", /\S/, `${d.id} NOT-CHECKED must carry its reason`);
  assert.ok(dims.some((d) => d.status === "NOT-SELECTED"), "NOT-SELECTED is a different word and needs its own chip");

  // A version break in the middle of the convergence chart.
  const conv = fixtures.get("/api/challenge/one", { slug: "tsd-payments" }).convergence;
  assert.ok(
    conv.some((it, i) => i > 0 && (it.graded_against_goal !== conv[i - 1].graded_against_goal || it.graded_against !== conv[i - 1].graded_against)),
    "a regoal/retemplate version break must be designable"
  );

  // MISSING-REVISION's candidate list — the one place the panel offers a
  // command instead of a pick.
  const miss = fixtures.get("/api/challenge/diff", { slug: cycles.find((c) => c.state === "MISSING-REVISION").slug });
  assert.strictEqual(miss.found, false, "the missing-revision diff must report found:false");
  assert.ok((miss.candidates || []).length, "the candidate list must be designable");
});

// The panel draws `--json` and decides nothing about it — the Flow-stepper rule
// applied to a second surface.
test("the challenge panel derives no state word of its own", () => {
  const app = appJs();
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const states = [...(cli.match(/const CHALLENGE_STATES = \[([\s\S]*?)\n\];/) || ["", ""])[1].matchAll(/"([A-Z-]+)"/g)].map((m) => m[1]);
  // The panel may KEY on a state (a colour, a pulse, a next action) but must
  // never invent one the CLI cannot emit.
  const panel = panelJs("challenge");
  for (const m of panel.matchAll(/"(AWAITING-[A-Z]+|PASSED|STALE-PASS|MISSING-REVISION|TAMPERED)"/g))
    assert.ok(states.includes(m[1]), `${m[1]} is a state the CLI can actually emit`);
  // And a paid action is never a button: running an iteration has no write route.
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const writes = (api.match(/const WRITES = \{[\s\S]*?\n\};/) || [""])[0];
  assert.ok(!/orc-challenge/.test(writes), "no lane invocation may be a write route");
  for (const free of ["challenge/accept", "challenge/rebut", "challenge/report"])
    assert.ok(writes.includes(free), `${free} is free and deterministic, so it is a real button`);
});

// The panel never claims a mock example is missing when none was ever asked
// for, and it never offers to run one.
test("the ui never offers to run a mock example", () => {
  const app = appJs();
  assert.ok(!/Run mock|runMock|\/api\/mock\/run/.test(app), "there must be no run affordance for a mock example");
  // The honesty line moved into the string table with everything else, so it is
  // asserted where it now lives — in EVERY language, because a missing
  // translation here would silently become an empty state that reads as "one is
  // missing" rather than "none was ever generated".
  assert.match(app, /t\("runs\.mock\.none"\)/, "the panel must render the not-generated line");
  for (const [code, table] of Object.entries(TABLES)) {
    assert.match(table["runs.mock.none"] || "", /\S/, `${code} must say a run has no mock example`);
    assert.match(table["runs.mock.noneHint"] || "", /mock_example/, `${code} must name the config key that controls it`);
  }
});

// ── i18n (v0.43.6) ──────────────────────────────────────────────────────────
//
// THE SCOPE RULE is the thing worth protecting here, and it is not obvious:
// only the panel's OWN prose is translated. Everything that arrives from
// `bin/cli.js --json` — config keys, their descriptions, values, agent names,
// model ids, paths, commands, doctor messages — is machine text and stays
// exactly as the CLI wrote it. A translated config key is a key that does not
// exist; a translated command is a command you cannot type.

// v0.49.1 — THE COUNCIL. You cannot design a NOT-RUN row on a run where
// everything ran, a NOT-SELECTED row on a full roster, or the empty state of a
// cycle whose roster was never answered.
test("council fixtures carry one of every roster state", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  const cycles = fixtures.get("/api/challenge", {}).cycles;
  const one = (slug) => fixtures.get("/api/challenge/one", { slug });
  const rows = cycles.flatMap((c) => one(c.slug).council || []);
  for (const status of ["RAN", "NOT-RUN", "NOT-SELECTED"])
    assert.ok(rows.some((r) => r.status === status), `a ${status} lens row must be designable`);
  // Rule 15: a NOT-RUN row that is NOT simply "not yet judged" must carry a
  // real reason, because that is the case a user paid for and did not get.
  assert.ok(
    rows.some((r) => r.status === "NOT-RUN" && /limit|failed|error/i.test(r.reason || "")),
    "a lens that could not run must carry a REAL reason"
  );
  // Every lens must appear somewhere, or one of them has never been looked at.
  const roles = fixtures.get("/api/challenge/roles", {});
  for (const l of roles.lenses.map((x) => x.lens))
    assert.ok(rows.some((r) => r.lens === l), `the ${l} lens must appear in some fixture`);

  // A cycle with NO ROSTER AT ALL — a v1 ledger migrated forward. UNSET is an
  // ANSWER, not an error, and `orc challenge record` refuses until it is
  // answered.
  assert.ok(cycles.some((c) => one(c.slug).council_unset), "a council-less v1 cycle must be designable");
  const unset = fixtures.get("/api/challenge/council", { slug: "billing-webhooks" });
  assert.strictEqual(unset.council, null);
  assert.strictEqual(unset.reason, "council-unset");
  assert.ok(unset.suggested.length, "and ORC still SUGGESTS — the fact is its, the decision is not");

  // The two classes that never touch the pass gate, in every one of their
  // states.
  const rich = one("tsd-payments");
  const premises = Object.values(rich.premises || {});
  for (const st of ["open", "dismissed"])
    assert.ok(premises.some((q) => q.status === st), `a ${st} premise must be designable`);
  const opps = Object.values(rich.opportunities || {});
  for (const st of ["open", "taken", "dropped"])
    assert.ok(opps.some((o) => o.status === st), `a ${st} opportunity must be designable`);
  for (const q of premises) assert.ok(!("severity" in q), "a premise NEVER carries a severity");
  for (const o of opps) assert.ok(!("severity" in o), "an opportunity NEVER carries a severity");
  // An adopted premise is what MOVED the goal — the council is the first thing
  // that can legitimately do that.
  assert.ok(
    Object.values(one("adr-0012-events").premises || {}).some((q) => q.status === "adopted" && q.goal_version_after),
    "an adopted premise with its version break must be designable"
  );

  // A corroborated finding, and a council-raised id that KEPT ITS RAISER'S
  // PREFIX after the judge adopted it.
  const findings = fixtures.get("/api/challenge/show", { slug: "tsd-payments" }).iterations[0].findings;
  assert.ok(findings.some((f) => (f.corroborated_by || []).length), "a corroborated finding must be designable");
  assert.ok(findings.some((f) => f.lens && f.lens !== "judge"), "a council-raised finding must be designable");
  assert.ok(findings.every((f) => "lens" in f), "every finding carries its raiser — no blank column");
  // A council row with every disposition it can report.
  const it = fixtures.get("/api/challenge/show", { slug: "tsd-payments" }).iterations[0];
  assert.strictEqual(it.council_coverage_pct, 100);
  assert.ok(it.council.some((r) => r.ran === false && r.reason), "the NOT-RUN row survives into the iteration record");
});

// v0.49.1 — THE KNOWLEDGE DEEPENING. Same rule: one of every state, including
// the ugly ones. You cannot design a `used 0/20` retire hint on a wiki nobody
// has stopped reading, or an unheadered pattern on a tidy one.
test("knowledge fixtures carry one of every state the new reads can return", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  const w = fixtures.get("/api/wiki", {});
  // `--json is not a summary`: the fixture must carry the WHOLE object, or the
  // panel gets designed against a payload the CLI does not send.
  for (const k of ["counts", "worst", "per_doc", "blind_spot", "orientation", "crosslink", "free_repairs"])
    assert.ok(k in w, `the wiki fixture carries ${k}`);
  assert.ok(Array.isArray(w.blind_spot) && w.blind_spot.length, "the blind spot is a FILE LIST, and a non-empty one");

  const docs = fixtures.get("/api/wiki/docs", {}).docs;
  for (const tier of ["FRESH", "AGING", "STALE", "unknown"])
    assert.ok(docs.some((d) => d.tier === tier), `a ${tier} doc must be designable`);
  assert.ok(docs.some((d) => d.retire_hint), "a zero-use retire candidate must be designable");
  assert.ok(docs.some((d) => d.used === null), "`used: null` is UNKNOWN, not zero-use, and needs its own row");
  assert.ok(docs.some((d) => d.crosslink_tags === 0), "a doc with no tags must be designable");

  // `--body` is opt-in: the default carries no prose at all.
  assert.ok(!("body" in fixtures.get("/api/wiki/show", {})), "the default show carries no body");
  assert.ok("body" in fixtures.get("/api/wiki/show", { body: 1 }), "and --body returns one");

  // 61% AND 100%, because a full-coverage repo is a different picture.
  assert.ok(fixtures.get("/api/wiki/coverage", {}).uncovered_dirs.length, "an uncovered set must be designable");
  assert.strictEqual(fixtures.get("/api/wiki/coverage", { full: 1 }).coverage_pct, 100);
  assert.ok(!("threshold" in fixtures.get("/api/wiki/coverage", {})), "coverage is a report — nothing to gate on");

  // A headered pattern AND an unheadered one, which says so and invents no date.
  const react = fixtures.get("/api/pattern/show", { lang: "react" });
  const express = fixtures.get("/api/pattern/show", { lang: "express" });
  assert.strictEqual(react.headered, true);
  assert.ok(react.conflicts.length, "a flagged conflict must be designable");
  assert.strictEqual(express.headered, false);
  assert.strictEqual(express.codified_at, null, "no date is ever derived from an mtime");
  assert.ok(!("body" in react), "--body is opt-in here too");

  // The gotcha reads: every field, the cap, a preview, and a non-empty archive.
  const g = fixtures.get("/api/gotchas", {});
  assert.ok(g.gotchas_max, "the cap is what makes the count mean anything");
  assert.ok(g.gotchas.every((e) => Object.keys(e.fields || {}).length), "every entry carries its FULL record");
  assert.ok(fixtures.get("/api/gotchas/archived", {}).count, "a non-empty archive must be designable");
  const prev = fixtures.get("/api/gotcha/prune/preview", {});
  assert.ok(prev.would_archive.length, "a preview that would evict something must be designable");
  assert.ok(prev.would_archive.every((e) => e.why), "and every named entry says WHY it is in the tail");
});

/* v0.49.2 — ONE OF EVERY STATE, including the ugly ones. You cannot design a
   `—` row on a table where every row has a number, and you cannot design a
   collided card on a list of short slugs. */

test("fixtures: the states v0.49.2 introduced are all designable", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  const runs = fixtures.get("/api/runs", {}).runs;
  assert.ok(runs.some((r) => r.status === "closed"), "a closed run");
  assert.ok(runs.find((r) => r.status === "closed").closed.reason, "carrying the reason it was closed with");
  assert.ok(runs.filter((r) => r.status === "waiting").length >= 3, "enough waiting runs to see the card as a list");
  assert.ok(runs.some((r) => r.slug.length > 28), "and a slug long enough to collide, which is the state that broke");

  // The house rules: populated, with all three priorities AND a disabled rule.
  const rules = fixtures.get("/api/doc/rules", {});
  assert.ok(rules.rules.length >= 3);
  for (const p of ["P0", "P1", "P2"]) assert.ok(rules.rules.some((r) => r.priority === p), `${p} is designable`);
  assert.ok(rules.rules.some((r) => !r.enabled), "a DISABLED rule keeps its slot");
  assert.ok(rules.boundary, "and the boundary sentence is always there");

  // Frozen: clean AND drifted, and the drift NAMES what moved.
  const drifted = fixtures.get("/api/doc/rules/one", { slug: "prd-checkout-refund-130826" });
  assert.strictEqual(drifted.drift.drifted, true);
  assert.ok(drifted.drift.added.length || drifted.drift.changed.length);
  assert.strictEqual(fixtures.get("/api/doc/rules/one", { slug: "runbook-payout-freeze-110826" }).drift.drifted, false);

  // The run map: a real one, a low-confidence naive floor, and a REFUSAL.
  const fc = fixtures.get("/api/doc/forecast", { slug: "prd-checkout-refund-130826" });
  assert.ok(fc.waves.length > 1 && fc.stops > 1);
  for (const k of ["input", "cache_write", "cache_read", "output"]) assert.ok(k in fc.tokens.p50);
  assert.ok(fixtures.get("/api/doc/forecast", { slug: "tsd-ledger-rewrite-090826" }).low_confidence_roles.length);
  assert.strictEqual(fixtures.get("/api/doc/forecast", { slug: "collab-risk-and-payments-130826" }).ok, false);

  // The cost report: joined, PARTLY joined (a `—` row), and no trace at all.
  const cost = fixtures.get("/api/doc/cost", { slug: "prd-checkout-refund-130826" });
  assert.ok(cost.by_section.some((s) => s.joined === false && s.tokens === null), "a section nothing joins reads —, never 0");
  assert.ok(cost.by_section.some((s) => s.joined === true));
  assert.ok("unattributed" in cost, "unattributed is always present");
  assert.strictEqual(fixtures.get("/api/doc/cost", { slug: "collab-risk-and-payments-130826" }).ok, false);
});
