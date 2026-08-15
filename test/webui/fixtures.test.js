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
