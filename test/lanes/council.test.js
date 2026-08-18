"use strict";
// v0.49.1 — the /orc-challenge COUNCIL.
//
// The rules worth a test are the ones a model could route around if they lived
// only in prose. Adding five reviewers has exactly one catastrophic failure
// mode — the judge quietly ignores four of them and the run looks identical
// while costing five times more — so `council_coverage_pct` is derived by the
// CLI from the reports ON DISK, and every gate below rejects BY NAME.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, rmrf, tmpdir, REPO } = require("../_helpers");

const ARTIFACT = ["# TSD", "", "## Overview", "", "It does a thing.", "", "## Scope", "", "TBD", ""].join("\n");

function project() {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "tsd.md"), ARTIFACT);
  spawnSync("git", ["init", "-q", "."], { cwd: root });
  spawnSync("git", ["add", "-A"], { cwd: root });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: root });
  return root;
}

const INIT = (root, council) => [
  "challenge", "init", "tsd", "--dir", root,
  "--artifact", "docs/tsd.md",
  "--kind", "tsd",
  "--goal", "a backend team implements this without asking me anything",
  "--audience", "backend engineers",
  "--done-means", "no TBD in the design sections",
  "--no-template",
  ...(council === null ? [] : ["--council", council]),
];

const cyc = (root) => path.join(root, "orc", "orc-challenge", "tsd");
const iterDir = (root, n) => path.join(cyc(root), "iteration-" + String(n).padStart(2, "0"));

function writeCouncil(root, n, lens, ids, extra) {
  const dir = path.join(iterDir(root, n), "council");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, lens + ".md"), `# ${lens}\n`);
  fs.writeFileSync(
    path.join(dir, lens + ".json"),
    JSON.stringify({ lens, findings: (ids || []).map((id) => ({ id })), ...(extra || {}) })
  );
}

function writeVerdict(root, n) {
  fs.mkdirSync(iterDir(root, n), { recursive: true });
  fs.writeFileSync(path.join(iterDir(root, n), "verdict.md"), `# Verdict ${n}\n`);
}

const DIMS_OK = ["D1", "D2", "D3", "D4", "D5", "D6"].map((id) =>
  id === "D1" ? { id, status: "NOT-CHECKED", reason: "no template" } : { id, status: "CHECKED", findings: 0 }
);

const finding = (id, extra) => ({
  id,
  dimension: "D2",
  severity: "P2",
  anchor: "docs/tsd.md:5",
  serves: "goal",
  what_is_wrong: "x",
  consequence: "y",
  acceptance_line: "z",
  ...(extra || {}),
});

function record(root, n, payload) {
  const f = path.join(root, `v${n}.json`);
  fs.writeFileSync(f, JSON.stringify({ dimensions: DIMS_OK, ...payload }));
  const r = cli(["challenge", "record", "tsd", "--dir", root, "--iteration", String(n), "--from", `v${n}.json`, "--json"]);
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch (_) {}
  return { ...r, json };
}

// ── the catalogue: ONE list, three renderers ────────────────────────────────

test("challenge roles is the ONE catalogue, and it works with no cycle at all", () => {
  const root = tmpdir();
  try {
    const r = cli(["challenge", "roles", "--dir", root, "--json"]);
    assert.strictEqual(r.status, 0, "static: no cycle, no project, no git needed");
    const d = JSON.parse(r.stdout);
    assert.strictEqual(d.lenses.length, 7, "seven lenses");
    assert.deepStrictEqual(
      d.lenses.map((l) => l.lens),
      ["judge", "reader", "contrarian", "outsider", "executor", "principles", "expansionist"]
    );
    assert.strictEqual(d.council.length, 6, "six are selectable; the judge always runs");
    assert.ok(!d.council.includes("judge"));
    assert.match(d.rule, /A lens raises; only the judge resolves/);

    // The two classes that can never touch the pass gate.
    const byLens = Object.fromEntries(d.lenses.map((l) => [l.lens, l]));
    assert.strictEqual(byLens.expansionist.class, "opportunity");
    assert.strictEqual(byLens.principles.class, "premise");
    assert.strictEqual(byLens.expansionist.blocks, false);
    assert.strictEqual(byLens.principles.blocks, false);
    for (const l of ["judge", "reader", "contrarian", "outsider", "executor"])
      assert.strictEqual(byLens[l].class, "finding", `${l} produces findings`);

    // Prefixes are the raiser's signature and `record` gates on them, so no two
    // lenses may share one.
    const prefixes = d.lenses.map((l) => l.prefix);
    assert.strictEqual(new Set(prefixes).size, prefixes.length, "every prefix is unique");

    // The suggestion is COMPUTED (a fact ORC may derive); accepting it is a
    // DECISION (which is why --council has no default).
    const forTsd = JSON.parse(cli(["challenge", "roles", "--dir", root, "--kind", "tsd", "--json"]).stdout);
    assert.ok(forTsd.suggested.length > 0 && forTsd.suggested.length < 6, "a suggestion, not everything");
  } finally {
    rmrf(root);
  }
});

// GOLDEN TEST. `CHALLENGE_LENS_META` and references/council.md's roster table
// are documented drift the token lint cannot see — a table is not a token.
test("the CLI's lens table and council.md's roster table agree", () => {
  const doc = fs.readFileSync(path.join(REPO, "templates/skills/orc-challenge/references/council.md"), "utf8");
  const rows = [...doc.matchAll(/^\| `(\w+)` \| [^|]+ \| `([\w.-]+)` \| (\w+) \| \*?\*?(\w+)\*?\*? \| `([A-Z]-)` \|/gm)];
  assert.strictEqual(rows.length, 7, `council.md's roster table has 7 rows, saw ${rows.length}`);
  const cliRoles = JSON.parse(cli(["challenge", "roles", "--json", "--dir", tmpdir()]).stdout).lenses;
  const byLens = Object.fromEntries(cliRoles.map((l) => [l.lens, l]));
  for (const [, lens, agent, effort, klass, prefix] of rows) {
    const m = byLens[lens];
    assert.ok(m, `council.md names a lens the CLI does not know: ${lens}`);
    assert.strictEqual(m.agent, agent, `${lens}: agent`);
    assert.strictEqual(m.effort, effort, `${lens}: effort`);
    assert.strictEqual(m.class, klass, `${lens}: class`);
    assert.strictEqual(m.prefix, prefix, `${lens}: id prefix`);
  }
});

test("every lens agent is a real shipped file whose frontmatter matches its row", () => {
  const cliRoles = JSON.parse(cli(["challenge", "roles", "--json", "--dir", tmpdir()]).stdout).lenses;
  for (const l of cliRoles) {
    const p = path.join(REPO, "templates/agents", l.agent + ".md");
    assert.ok(fs.existsSync(p), `${l.lens} dispatches ${l.agent}, which does not exist`);
    const src = fs.readFileSync(p, "utf8");
    assert.match(src, /^model: claude-opus-5$/m, `${l.agent} is claude-opus-5 (so opus5_only is a no-op for this lane)`);
    assert.match(src, new RegExp("^effort: " + l.effort + "$", "m"), `${l.agent}: effort matches the table`);
  }
  // The outsider's slice is the tightest in the lane, and low effort is a
  // MEASUREMENT choice — nothing may ever upgrade it.
  const outsider = fs.readFileSync(path.join(REPO, "templates/agents/orc-challenge-outsider-opus-5-low.md"), "utf8");
  assert.match(outsider, /^tools: Read$/m, "Read and nothing else");
  assert.ok(!/Glob|Grep|Bash/.test(outsider.split("---")[1] || ""), "no search tool in the frontmatter");
  assert.match(outsider, /WORSE instrument/, "the agent states WHY low is correct");
});

// ── rule 12: --council has no default, and init refuses BY NAME ─────────────

test("init refuses without --council, and `none` reproduces v0.47.0 exactly", () => {
  const root = project();
  try {
    const bare = cli(INIT(root, null));
    assert.strictEqual(bare.status, 2, "no default: it is a hard error");
    assert.ok(bare.stderr.includes("--council"), "the error names the flag");
    assert.ok(
      bare.stderr.includes("a lane that picks its own council"),
      "and it names the contract it would have broken"
    );
    assert.ok(!fs.existsSync(cyc(root)), "nothing is created on a refusal");

    const bad = cli(INIT(root, "contrarian,chairman"));
    assert.strictEqual(bad.status, 2);
    assert.ok(bad.stderr.includes("chairman"), "an unknown lens is named");

    assert.strictEqual(cli(INIT(root, "none")).status, 0, "`none` is a first-class answer");
    const led = JSON.parse(fs.readFileSync(path.join(cyc(root), "challenge.json"), "utf8"));
    assert.deepStrictEqual(led.council, [], "an empty roster, not a null one");
    assert.strictEqual(led.version, 2);
    assert.strictEqual(led.council_version, 1);
  } finally {
    rmrf(root);
  }
});

test("--council all takes every selectable lens, and the order is the catalogue's", () => {
  const root = project();
  try {
    assert.strictEqual(cli(INIT(root, "expansionist,contrarian")).status, 0);
    const led = JSON.parse(fs.readFileSync(path.join(cyc(root), "challenge.json"), "utf8"));
    // Catalogue order, never the user's typing order — two identical rosters
    // must never render as two different lists.
    assert.deepStrictEqual(led.council, ["contrarian", "expansionist"]);
  } finally {
    rmrf(root);
  }
});

// ── the roster is a FROZEN decision, changed only by a recorded event ───────

test("changing the roster is a recorded `recouncil` event and needs a reason", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian"));
    const noReason = cli(["challenge", "council", "tsd", "--dir", root, "--set", "outsider", "--json"]);
    assert.strictEqual(noReason.status, 2);
    assert.strictEqual(JSON.parse(noReason.stdout).reason, "no-reason");

    const ok = cli(["challenge", "council", "tsd", "--dir", root, "--set", "outsider,executor", "--reason", "the framing is settled", "--json"]);
    assert.strictEqual(ok.status, 0);
    const d = JSON.parse(ok.stdout);
    assert.deepStrictEqual(d.council, ["outsider", "executor"]);
    assert.strictEqual(d.council_version, 2, "it bumps, exactly like goals.version");
    const led = JSON.parse(fs.readFileSync(path.join(cyc(root), "challenge.json"), "utf8"));
    assert.ok(led.events.some((e) => e.kind === "recouncil" && /the framing is settled/.test(e.detail)));
  } finally {
    rmrf(root);
  }
});

test("a v1 cycle reads council: null, `council` exits 1, and `record` refuses BY NAME", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian"));
    // Simulate a cycle opened before v0.49.1.
    const p = path.join(cyc(root), "challenge.json");
    const led = JSON.parse(fs.readFileSync(p, "utf8"));
    delete led.council;
    led.version = 1;
    fs.writeFileSync(p, JSON.stringify(led));

    const read = cli(["challenge", "council", "tsd", "--dir", root, "--json"]);
    assert.strictEqual(read.status, 1, "UNSET is an ANSWER, not an error");
    const d = JSON.parse(read.stdout);
    assert.strictEqual(d.council, null);
    assert.strictEqual(d.reason, "council-unset");
    assert.ok(d.suggested.length, "it still suggests — the fact is ORC's, the decision is not");

    writeVerdict(root, 1);
    const rec = record(root, 1, { verdict_file: "iteration-01/verdict.md", findings: [] });
    assert.strictEqual(rec.status, 2);
    assert.strictEqual(rec.json.reason, "council-unset", "a silent default would be ORC picking the council");
  } finally {
    rmrf(root);
  }
});

// ── COUNCIL CONSERVATION — the gate that makes five reviewers safe ─────────

test("council_coverage: an id on disk with no disposition is rejected, and NAMED", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian"));
    writeVerdict(root, 1);
    writeCouncil(root, 1, "contrarian", ["C-001", "C-002", "C-003"]);
    const rec = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council_dispositions: [{ id: "C-001", disposition: "adopted" }],
      findings: [finding("C-001")],
    });
    assert.strictEqual(rec.status, 2);
    assert.strictEqual(rec.json.reason, "council-coverage");
    // The judge cannot shrink the set by omission: `record` read the directory.
    assert.deepStrictEqual(rec.json.missing.sort(), ["C-002", "C-003"]);
    assert.ok(rec.json.detail.includes("C-002") && rec.json.detail.includes("C-003"), "the missing ids are named");
  } finally {
    rmrf(root);
  }
});

test("every disposition needs what it needs, and an adopted id KEEPS THE RAISER'S ID", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian,outsider"));
    writeVerdict(root, 1);
    writeCouncil(root, 1, "contrarian", ["C-001", "C-002", "C-003", "C-004"]);
    writeCouncil(root, 1, "outsider", ["O-001"]);

    const noReason = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council_dispositions: [
        { id: "C-001", disposition: "adopted" },
        { id: "C-002", disposition: "rejected" },
        { id: "C-003", disposition: "merged", merged_into: "C-001" },
        { id: "C-004", disposition: "out-of-goal", reason: "nothing in the goal covers it" },
        { id: "O-001", disposition: "adopted" },
      ],
      findings: [finding("C-001"), finding("O-001")],
    });
    assert.strictEqual(noReason.status, 2, "rejected without a reason is malformed");
    assert.strictEqual(noReason.json.reason, "bad-disposition");
    assert.strictEqual(noReason.json.id, "C-002");

    const badMerge = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council_dispositions: [
        { id: "C-001", disposition: "adopted" },
        { id: "C-002", disposition: "rejected", reason: "read the anchor; the section does say it" },
        { id: "C-003", disposition: "merged", merged_into: "C-999" },
        { id: "C-004", disposition: "out-of-goal", reason: "nothing in the goal covers it" },
        { id: "O-001", disposition: "adopted" },
      ],
      findings: [finding("C-001"), finding("O-001")],
    });
    assert.strictEqual(badMerge.status, 2, "merged into an id that does not resolve");
    assert.strictEqual(badMerge.json.reason, "bad-disposition");

    const ok = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council_dispositions: [
        { id: "C-001", disposition: "adopted" },
        { id: "C-002", disposition: "rejected", reason: "read the anchor; the section does say it" },
        { id: "C-003", disposition: "merged", merged_into: "C-001" },
        { id: "C-004", disposition: "out-of-goal", reason: "nothing in the goal covers it" },
        { id: "O-001", disposition: "adopted", },
      ],
      findings: [finding("C-001", { corroborated_by: ["outsider"] }), finding("O-001")],
    });
    assert.strictEqual(ok.status, 0, ok.stderr + ok.stdout);
    assert.strictEqual(ok.json.council_coverage_pct, 100);
    const led = JSON.parse(fs.readFileSync(path.join(cyc(root), "challenge.json"), "utf8"));
    const it = led.iterations[0];
    const c = it.findings.find((f) => f.id === "C-001");
    assert.strictEqual(c.lens, "contrarian", "an adopted council finding keeps its RAISER, forever");
    assert.strictEqual(c.disposition, "adopted");
    assert.deepStrictEqual(c.corroborated_by, ["outsider"]);
    const row = it.council.find((r) => r.lens === "contrarian");
    assert.deepStrictEqual(
      { raised: row.raised, adopted: row.adopted, rejected: row.rejected, merged: row.merged, out_of_goal: row.out_of_goal },
      { raised: 4, adopted: 1, rejected: 1, merged: 1, out_of_goal: 1 }
    );
  } finally {
    rmrf(root);
  }
});

test("a prefix that disagrees with its lens, and two lenses raising one id", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian,reader"));
    writeVerdict(root, 1);
    writeCouncil(root, 1, "contrarian", ["C-001"]);
    writeCouncil(root, 1, "reader", ["R-001"]);
    const wrongLens = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council_dispositions: [
        { id: "C-001", disposition: "adopted" },
        { id: "R-001", disposition: "adopted" },
      ],
      findings: [finding("C-001", { lens: "reader" }), finding("R-001")],
    });
    assert.strictEqual(wrongLens.status, 2);
    assert.strictEqual(wrongLens.json.reason, "bad-prefix");

    // The SAME id from two lenses. An id is permanent and belongs to exactly
    // one raiser.
    writeCouncil(root, 1, "reader", ["C-001"]);
    const dupe = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council_dispositions: [{ id: "C-001", disposition: "adopted" }],
      findings: [finding("C-001")],
    });
    assert.strictEqual(dupe.status, 2);
    assert.ok(["duplicate-id", "bad-prefix"].includes(dupe.json.reason), dupe.json.reason);
  } finally {
    rmrf(root);
  }
});

test("rule 15: a roster lens with neither a report nor a reason is REJECTED", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian,outsider"));
    writeVerdict(root, 1);
    writeCouncil(root, 1, "contrarian", []);

    const silent = record(root, 1, { verdict_file: "iteration-01/verdict.md", findings: [] });
    assert.strictEqual(silent.status, 2);
    assert.strictEqual(silent.json.reason, "lens-silent");
    assert.strictEqual(silent.json.lens, "outsider");

    const noWhy = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council: [{ lens: "outsider", ran: false }],
      findings: [],
    });
    assert.strictEqual(noWhy.status, 2, "NOT-RUN with no reason is indistinguishable from forgotten");
    assert.strictEqual(noWhy.json.reason, "lens-silent");

    const ok = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council: [{ lens: "outsider", ran: false, reason: "usage limit reached mid-batch" }],
      findings: [],
    });
    assert.strictEqual(ok.status, 0, ok.stderr + ok.stdout);
    const row = ok.json.council.find((r) => r.lens === "outsider");
    assert.strictEqual(row.ran, false);
    assert.match(row.reason, /usage limit/);
    // A NOT-RUN lens is visible in the TRACE, so `orc stats` and /orc-retro see
    // it too — not only the panel.
    assert.match(ok.json.trace_line, /council=1\/2/);
  } finally {
    rmrf(root);
  }
});

test("corroborated_by may only name a lens that actually ran this iteration", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian"));
    writeVerdict(root, 1);
    writeCouncil(root, 1, "contrarian", ["C-001"]);
    const bad = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council_dispositions: [{ id: "C-001", disposition: "adopted" }],
      findings: [finding("C-001", { corroborated_by: ["outsider"] })],
    });
    assert.strictEqual(bad.status, 2);
    assert.strictEqual(bad.json.reason, "unknown-corroborator");
  } finally {
    rmrf(root);
  }
});

// ── the two classes that NEVER touch the pass gate ─────────────────────────

test("`note` records opportunities and premises, and REFUSES a findings[] key", () => {
  const root = project();
  try {
    cli(INIT(root, "principles,expansionist"));
    const bad = path.join(root, "bad.json");
    fs.writeFileSync(bad, JSON.stringify({ findings: [] }));
    const r1 = cli(["challenge", "note", "tsd", "--dir", root, "--from", "bad.json", "--json"]);
    assert.strictEqual(r1.status, 2);
    assert.strictEqual(JSON.parse(r1.stdout).reason, "class-mismatch");

    const withSeverity = path.join(root, "sev.json");
    fs.writeFileSync(withSeverity, JSON.stringify({ opportunities: [{ id: "X-001", severity: "P1", route: "none" }] }));
    const r2 = cli(["challenge", "note", "tsd", "--dir", root, "--from", "sev.json", "--json"]);
    assert.strictEqual(r2.status, 2, "an opportunity never blocks and never has a severity");
    assert.strictEqual(JSON.parse(r2.stdout).reason, "class-mismatch");

    const good = path.join(root, "note.json");
    fs.writeFileSync(
      good,
      JSON.stringify({
        iteration: 1,
        premises: [{ id: "Q-001", disputes: "goal", reframe: "the real job is X", cheapest_test: "ask one implementer" }],
        opportunities: [{ id: "X-001", what: "it generalises", upside: "u", first_step: "s", route: "brainstorm" }],
      })
    );
    const r3 = cli(["challenge", "note", "tsd", "--dir", root, "--from", "note.json", "--json"]);
    assert.strictEqual(r3.status, 0, r3.stderr + r3.stdout);
    const led = JSON.parse(fs.readFileSync(path.join(cyc(root), "challenge.json"), "utf8"));
    assert.strictEqual(led.premises["Q-001"].status, "open");
    assert.strictEqual(led.opportunities["X-001"].route, "brainstorm");

    const badRoute = path.join(root, "route.json");
    fs.writeFileSync(badRoute, JSON.stringify({ opportunities: [{ id: "X-009", route: "build-it" }] }));
    const r4 = cli(["challenge", "note", "tsd", "--dir", root, "--from", "route.json", "--json"]);
    assert.strictEqual(r4.status, 2);
    assert.strictEqual(JSON.parse(r4.stdout).reason, "bad-route", "the routes are a closed set — this lane never builds");
  } finally {
    rmrf(root);
  }
});

test("an opportunity and a premise NEVER appear in the blocking set", () => {
  const root = project();
  try {
    cli(INIT(root, "principles,expansionist"));
    const note = path.join(root, "note.json");
    fs.writeFileSync(
      note,
      JSON.stringify({
        iteration: 1,
        premises: [{ id: "Q-001", disputes: "goal", reframe: "r" }],
        opportunities: [{ id: "X-001", what: "w", upside: "u", first_step: "s", route: "pact" }],
      })
    );
    cli(["challenge", "note", "tsd", "--dir", root, "--from", "note.json"]);
    writeVerdict(root, 1);
    writeCouncil(root, 1, "principles", []);
    writeCouncil(root, 1, "expansionist", []);
    const rec = record(root, 1, { verdict_file: "iteration-01/verdict.md", findings: [] });
    assert.strictEqual(rec.status, 0, rec.stderr + rec.stdout);
    assert.strictEqual(rec.json.passed, true, "the pass gate learns NOTHING about these two classes");
    assert.strictEqual(rec.json.blocking, 0);

    const st = JSON.parse(cli(["challenge", "status", "tsd", "--dir", root, "--json"]).stdout);
    assert.deepStrictEqual(st.open_premises, ["Q-001"]);
    assert.ok(!JSON.stringify(st.counts).includes("Q-001"));
  } finally {
    rmrf(root);
  }
});

test("a non-finding lens that writes findings[] is a CLASS error, named as one", () => {
  const root = project();
  try {
    cli(INIT(root, "expansionist"));
    writeVerdict(root, 1);
    writeCouncil(root, 1, "expansionist", ["X-001"]);
    const rec = record(root, 1, { verdict_file: "iteration-01/verdict.md", findings: [] });
    assert.strictEqual(rec.status, 2);
    assert.strictEqual(rec.json.reason, "class-mismatch");
    assert.strictEqual(rec.json.lens, "expansionist");
  } finally {
    rmrf(root);
  }
});

test("a premise is dismissed only with a reason, and an opportunity is conserved either way", () => {
  const root = project();
  try {
    cli(INIT(root, "principles,expansionist"));
    const note = path.join(root, "note.json");
    fs.writeFileSync(
      note,
      JSON.stringify({
        iteration: 1,
        premises: [{ id: "Q-001", disputes: "goal", reframe: "r" }],
        opportunities: [{ id: "X-001", what: "w", upside: "u", first_step: "s", route: "brainstorm" }],
      })
    );
    cli(["challenge", "note", "tsd", "--dir", root, "--from", "note.json"]);

    const noReason = cli(["challenge", "premise", "tsd", "Q-001", "--dismiss", "--dir", root, "--json"]);
    assert.strictEqual(noReason.status, 2);
    assert.strictEqual(JSON.parse(noReason.stdout).reason, "no-reason");
    assert.strictEqual(cli(["challenge", "premise", "tsd", "Q-404", "--dismiss", "--reason", "x", "--dir", root, "--json"]).status, 3);

    const ok = cli(["challenge", "premise", "tsd", "Q-001", "--dismiss", "--reason", "the framing holds", "--dir", root, "--json"]);
    assert.strictEqual(ok.status, 0);
    const led = JSON.parse(fs.readFileSync(path.join(cyc(root), "challenge.json"), "utf8"));
    assert.strictEqual(led.premises["Q-001"].status, "dismissed");
    assert.strictEqual(led.premises["Q-001"].reason, "the framing holds", "it stays visible forever");

    const neither = cli(["challenge", "opportunity", "tsd", "X-001", "--reason", "x", "--dir", root, "--json"]);
    assert.strictEqual(neither.status, 2, "exactly one of --take or --drop");
    const noWhy = cli(["challenge", "opportunity", "tsd", "X-001", "--take", "--dir", root, "--json"]);
    assert.strictEqual(noWhy.status, 2);
    const took = cli(["challenge", "opportunity", "tsd", "X-001", "--take", "--reason", "worth a brainstorm", "--dir", root, "--json"]);
    assert.strictEqual(took.status, 0);
    const d = JSON.parse(took.stdout);
    assert.strictEqual(d.status, "taken");
    assert.strictEqual(d.next, "/orc-brainstorm", "it is ROUTED, and this lane never builds it");
  } finally {
    rmrf(root);
  }
});

// ── the trace, and the pass gate that learned nothing ──────────────────────

test("the trace line carries council=<ran>/<roster>, the raise counts, and adopted", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian,reader,outsider"));
    writeVerdict(root, 1);
    writeCouncil(root, 1, "contrarian", ["C-001", "C-002"]);
    writeCouncil(root, 1, "reader", ["R-001"]);
    const rec = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council: [{ lens: "outsider", ran: false, reason: "usage limit" }],
      council_dispositions: [
        { id: "C-001", disposition: "adopted" },
        { id: "C-002", disposition: "rejected", reason: "the anchor says otherwise" },
        { id: "R-001", disposition: "adopted" },
      ],
      findings: [finding("C-001"), finding("R-001")],
    });
    assert.strictEqual(rec.status, 0, rec.stderr + rec.stdout);
    assert.match(rec.json.trace_line, /^CHALLENGE iter=1 /);
    assert.match(rec.json.trace_line, /council=2\/3/);
    // Catalogue order, not the raise order — the same normalisation that keeps
    // two identical rosters from rendering as two different lists.
    assert.match(rec.json.trace_line, /raised=R:1,C:2/);
    assert.match(rec.json.trace_line, /adopted=2/);
  } finally {
    rmrf(root);
  }
});

test("an adopted council P0 blocks exactly like a judge P0", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian"));
    writeVerdict(root, 1);
    writeCouncil(root, 1, "contrarian", ["C-001"]);
    const rec = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      council_dispositions: [{ id: "C-001", disposition: "adopted" }],
      findings: [finding("C-001", { severity: "P0" })],
    });
    assert.strictEqual(rec.status, 0, rec.stderr + rec.stdout);
    assert.strictEqual(rec.json.passed, false);
    assert.strictEqual(rec.json.blocking, 1);
    // Exit 2 = a P0 is open, whoever raised it.
    assert.strictEqual(cli(["challenge", "status", "tsd", "--dir", root]).status, 2);
  } finally {
    rmrf(root);
  }
});

test("the judge resolves a carried finding whatever prefix it carries, across a changed roster", () => {
  const root = project();
  try {
    cli(INIT(root, "contrarian"));
    writeVerdict(root, 1);
    writeCouncil(root, 1, "contrarian", ["C-001"]);
    assert.strictEqual(
      record(root, 1, {
        verdict_file: "iteration-01/verdict.md",
        council_dispositions: [{ id: "C-001", disposition: "adopted" }],
        findings: [finding("C-001")],
      }).status,
      0
    );
    // The contrarian is dropped from the roster while C-001 is still open.
    assert.strictEqual(
      cli(["challenge", "council", "tsd", "--dir", root, "--set", "none", "--reason", "narrowing"]).status,
      0
    );
    writeVerdict(root, 2);
    const rec2 = record(root, 2, {
      verdict_file: "iteration-02/verdict.md",
      findings: [finding("C-001", { outcome: "resolved" })],
    });
    assert.strictEqual(rec2.status, 0, "conservation costs nothing when the roster changes: " + rec2.stderr + rec2.stdout);
    assert.strictEqual(rec2.json.coverage_pct, 100);
    const led = JSON.parse(fs.readFileSync(path.join(cyc(root), "challenge.json"), "utf8"));
    const carried = led.iterations[1].findings.find((f) => f.id === "C-001");
    assert.strictEqual(carried.lens, "contrarian", "the raiser is permanent, like the id");
  } finally {
    rmrf(root);
  }
});
