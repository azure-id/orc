"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.2 W7 (D4) — `orc graph map`: the ranked repository map.
//
// The promises this file holds:
//
//   1. A map RANKS. The file the repository's own traffic flows through comes
//      out above the file nobody calls, and a test file is pushed down.
//   2. `--focus` re-ranks the WHOLE repository around a file or a NAME, and it
//      never turns the rest of the list into a directory listing.
//   3. A budget cuts a PREFIX of the ranking — a smaller budget gives a shorter
//      map, never a different one — and it says how many files it left out.
//   4. The exit codes are the contract: 0 whenever a graph exists, 1 with no
//      index, 3 when `code_graph` is off and `--if-enabled` was passed.
//   5. `map.json` is DERIVED. Deleting it changes how long the answer takes and
//      not one byte of the answer.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");

const json = (r) => JSON.parse(r.stdout);

function write(root, rel, lines) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join("\n") + "\n");
}

// A repository with a clear shape: `core.js` is called by everything, `leaf.js`
// by nobody, and the test file only reaches the routes. That is enough for a
// ranking to be checkable rather than plausible.
function shop(opts) {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/core.js", [
    "function validate(row) { return !!row && !!row.id; }",
    "function normalise(row) { return { ...row, id: String(row.id) }; }",
    "function describe(row) { return `${row.id}`; }",
    "module.exports = { validate, normalise, describe };",
  ]);
  write(root, "src/store.js", [
    "const { validate, normalise } = require('./core');",
    "class Store {",
    "  constructor() { this.rows = new Map(); }",
    "  insert(row) {",
    "    if (!validate(row)) throw new Error('bad');",
    "    const r = normalise(row);",
    "    this.rows.set(r.id, r);",
    "    return r;",
    "  }",
    "  list() { return [...this.rows.values()]; }",
    "}",
    "module.exports = Store;",
  ]);
  write(root, "src/report.js", [
    "const { describe, validate } = require('./core');",
    "const Store = require('./store');",
    "const store = new Store();",
    "function report() {",
    "  return store.list().filter(validate).map(describe);",
    "}",
    "module.exports = { report };",
  ]);
  write(root, "src/routes.js", [
    "const express = require('express');",
    "const Store = require('./store');",
    "const { report } = require('./report');",
    "const router = express.Router();",
    "const store = new Store();",
    "router.get('/items', (req, res) => res.json(store.list()));",
    "router.post('/items', (req, res) => res.json(store.insert(req.body)));",
    "router.get('/report', (req, res) => res.json(report()));",
    "module.exports = router;",
  ]);
  write(root, "src/app.js", [
    "const express = require('express');",
    "const routes = require('./routes');",
    "const app = express();",
    "app.use('/api', routes);",
    "module.exports = app;",
  ]);
  // Called by nothing, calls nothing in the repository. The floor of any rank.
  write(root, "src/leaf.js", ["function unusedHelper() { return 1; }", "module.exports = { unusedHelper };"]);
  write(root, "tests/items.test.js", [
    "const request = require('supertest');",
    "const app = require('../src/app');",
    "const { validate } = require('../src/core');",
    "it('lists', () => request(app).get('/api/items'));",
    "it('adds', () => request(app).post('/api/items'));",
    "it('validates', () => validate({ id: 1 }));",
  ]);
  git("add", "-A");
  git("commit", "-qm", "shop");
  assert.equal(cli(["config", "set", "code_graph", opts && opts.off ? "off" : "on", "--dir", root]).status, 0);
  if (!(opts && opts.noIndex)) {
    const u = cli(["graph", "update", "--dir", root]);
    if (!(opts && opts.off)) assert.equal(u.status, 0, u.stdout + u.stderr);
  }
  return root;
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const rankOf = (r, file) => r.files.findIndex((f) => f.file === file);

// ── 1. it ranks ─────────────────────────────────────────────────────────────

test("map — the file everything reaches outranks the file nothing reaches", () => {
  const root = shop();
  const r = graph(root, "map", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = json(r);
  assert.equal(m.state, "found");
  assert.equal(m.total_files, 7, "every indexed file is counted, shown or not");
  assert.ok(m.edges > 0, "a repository that calls itself has edges");

  const core = rankOf(m, "src/core.js");
  const leaf = rankOf(m, "src/leaf.js");
  assert.ok(core >= 0 && leaf >= 0, "this budget shows every file");
  assert.ok(core < leaf, `core.js (${core}) must outrank leaf.js (${leaf})`);

  // A test file is knocked down by ten. It is real code and it is on the map;
  // it is never the first thing a planner is sent to read.
  const spec = rankOf(m, "tests/items.test.js");
  assert.ok(spec > core, "a test file never outranks the module it tests");
});

test("map — a row names the file's own symbols with their line ranges", () => {
  const root = shop();
  const m = json(graph(root, "map", "--json"));
  const core = m.files.find((f) => f.file === "src/core.js");
  assert.ok(core, "core.js is on the map");
  assert.ok(core.symbols.length > 0, "a row carries the symbols worth opening");
  for (const s of core.symbols) {
    assert.equal(typeof s.qname, "string");
    assert.equal(s.lines.length, 2, "a range, so the reader can read the range");
    assert.ok(s.lines[0] >= 1 && s.lines[1] >= s.lines[0]);
  }
  assert.match(m.card, /core\.js/);
  assert.match(m.card, /validate:\d+-\d+/, "the card prints name:from-to");
  assert.match(m.card, /a HINT about where to look first/, "rank is never proof");
});

// ── 2. focus ────────────────────────────────────────────────────────────────

test("map --focus <file> — the focus rises, and the rest stays RANKED", () => {
  const root = shop();
  const plain = json(graph(root, "map", "--json"));
  const focused = json(graph(root, "map", "--focus", "src/leaf.js", "--json"));

  assert.deepEqual(focused.focus, ["src/leaf.js"]);
  const before = rankOf(plain, "src/leaf.js");
  const after = rankOf(focused, "src/leaf.js");
  assert.ok(after < before, `focus must lift leaf.js (${before} → ${after})`);

  // W7-focus-baseline: the files the focus does not reach keep a baseline
  // share, so the rest of the map stays a RANKING. Handing the focus the whole
  // personalisation vector leaves everything else at exactly zero, and a
  // hundred tied zeroes sort alphabetically — a directory listing wearing a
  // ranking's clothes. The check is that the rest is NOT alphabetical.
  const rest = focused.files.map((f) => f.file).filter((f) => f !== "src/leaf.js");
  const alpha = rest.slice().sort();
  assert.notDeepEqual(rest, alpha, "the unfocused remainder must not collapse to alphabetical order");
});

test("map --focus <name> — a bare symbol name reaches the file that defines it", () => {
  const root = shop();
  const m = json(graph(root, "map", "--focus", "unusedHelper", "--json"));
  assert.deepEqual(m.focus, ["src/leaf.js"], "a name contributes its defining file");
  assert.deepEqual(m.focus_missing, []);
  assert.equal(m.files[0].file, "src/leaf.js", "the only focus leads the map");
});

test("map --focus — a name in nothing is REPORTED, and the map is still an answer", () => {
  const root = shop();
  const r = graph(root, "map", "--focus", "noSuchThingAnywhere", "--json");
  assert.equal(r.status, 0, "a focus miss is an answer, never an error");
  const m = json(r);
  assert.deepEqual(m.focus, []);
  assert.deepEqual(m.focus_missing, ["noSuchThingAnywhere"]);
  assert.match(m.card, /focus not in the graph: noSuchThingAnywhere/);
});

// ── 3. the budget cuts a PREFIX ─────────────────────────────────────────────

test("map --budget — a smaller budget gives a SHORTER map, never a different one", () => {
  const root = shop();
  const big = json(graph(root, "map", "--budget", "4000", "--json"));
  const small = json(graph(root, "map", "--budget", "100", "--json"));

  assert.ok(small.shown < big.shown, "a small budget shows fewer files");
  assert.ok(small.shown > 0, "and it still shows some");
  // THE promise. `fit()` is greedy — after skipping one long row it will happily
  // take a shorter row further down — which is right for a card of independent
  // sections and wrong for a list whose whole meaning is the order. A reader who
  // sees rank 10 present and rank 7 missing cannot use the order for anything.
  assert.deepEqual(
    small.files.map((f) => f.file),
    big.files.slice(0, small.shown).map((f) => f.file),
    "the short map is a PREFIX of the long one"
  );
  assert.ok(small.budget.used <= 100, `used ${small.budget.used} must stay inside the budget`);
  assert.equal(small.has_more, true);
  assert.equal(small.hidden.files, big.total_files - small.shown);
  assert.match(small.card, /hidden: \d+ files/, "a map that cut says so");
});

test("map — a map that hid nothing prints NO budget footer", () => {
  const root = shop();
  const m = json(graph(root, "map", "--budget", "4000", "--json"));
  assert.equal(m.has_more, false);
  assert.deepEqual(m.hidden, {});
  assert.ok(!/budget \d+\//.test(m.card), "no footer when nothing was hidden");
});

// ── 4. the exit codes ───────────────────────────────────────────────────────

test("map — exit 3 when the graph is off, exit 1 with no index", () => {
  const off = shop({ off: true, noIndex: true });
  const r3 = graph(off, "map", "--if-enabled", "--json");
  assert.equal(r3.status, 3);
  assert.equal(json(r3).state, "off");

  const none = shop({ noIndex: true });
  const r1 = graph(none, "map", "--if-enabled", "--json");
  assert.equal(r1.status, 1);
  assert.equal(json(r1).state, "none");
});

test("map — it needs no operand, which is the whole point of it", () => {
  const root = shop();
  const r = graph(root, "map", "--json");
  assert.equal(r.status, 0, "no file, no symbol, still an answer");
  assert.equal(json(r).trace.startsWith("GRAPH-MAP repo"), true);
  const f = graph(root, "map", "--focus", "src/core.js", "--json");
  assert.equal(json(f).trace.startsWith("GRAPH-MAP focused"), true);
});

// ── 5. map.json is DERIVED ──────────────────────────────────────────────────

test("map.json is a speed store — deleting it changes the time, not the answer", () => {
  const root = shop();
  const mapFile = path.join(root, ".claude", "orc", "graph", "map.json");
  assert.ok(fs.existsSync(mapFile), "an update writes it");
  const cached = json(graph(root, "map", "--json"));
  assert.equal(cached.cached_map, true);

  fs.rmSync(mapFile);
  const computed = json(graph(root, "map", "--json"));
  assert.equal(computed.cached_map, false, "it fell back to computing");
  assert.equal(computed.card, cached.card, "byte-identical card");
  assert.deepEqual(computed.files, cached.files);
  assert.equal(computed.edges, cached.edges);
});

test("map.json is generation-pinned — a stale one is never read", () => {
  const root = shop();
  const mapFile = path.join(root, ".claude", "orc", "graph", "map.json");
  const m = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const before = json(graph(root, "map", "--json"));

  // A cache claiming another generation is not "probably fine". It is not used.
  fs.writeFileSync(mapFile, JSON.stringify({ ...m, generation: m.generation + 99, files: [], edges: [], base: [] }));
  const after = json(graph(root, "map", "--json"));
  assert.equal(after.cached_map, false, "the generation did not match, so it was ignored");
  assert.equal(after.card, before.card, "and the answer is unchanged");
});

// ── v1.9.0 — which lanes may ask which graph question ──────────────────────
// The catalogue is permission, not documentation: a lane calls what its own
// `orc lane calls` answer names and nothing else. Until 1.9.0 the lean lanes
// could ask WHERE something is (`ctx`) and never WHAT BREAKS (`impact`,
// `changes`, `coverage`, `cochange`) or WHERE TO LOOK FIRST (`map`), so
// /orc-quick could not state a blast radius and /orc-mini could not measure
// its own complexity read. These sets are that fix, pinned.
//
// The 1.8.2 comment on `graph-map` said "planning ONLY", and DE-H's measured
// 0.39 answerable calls per run is why. That premise is retired ON PURPOSE and
// narrowed rather than dropped: the number measured the ANALYST asking for a
// map after the files were already known. /orc-quick's Q1 with a request that
// names no file, and /orc-mini's intake before the tiered round, are the same
// orientation question asked by a lane that has no planner to ask it.
const laneCalls = (lane) => json(cli(["lane", "calls", lane, "--json"])).calls.map((c) => c.id);

test("the lean lanes may ask what breaks, and where to look first", () => {
  const quick = laneCalls("orc-quick");
  for (const id of ["graph-map", "graph-changes", "graph-coverage"])
    assert.ok(quick.includes(id), "orc-quick cannot call " + id);
  // Quick has no planner and no declared-file set before the gate, so the two
  // planning reads stay out of its catalogue.
  for (const id of ["graph-impact", "graph-cochange"])
    assert.ok(!quick.includes(id), "orc-quick should not be able to call " + id);

  const mini = laneCalls("orc-mini");
  for (const id of ["graph-map", "graph-impact", "graph-changes"])
    assert.ok(mini.includes(id), "orc-mini cannot call " + id);
  // v1.9.1: mini LEFT `graph-cochange`. `impact --complexity` answers the same
  // question inside the same process, against the same per-HEAD cache, so the
  // lane makes one call where it used to make one per declared file.
  assert.ok(!mini.includes("graph-cochange"), "orc-mini no longer names cochange on its own");
});

test("every graph row a lean lane gained still points at the one canonical file", () => {
  const all = json(cli(["lane", "calls", "--all", "--json"])).calls;
  const byId = Object.fromEntries(all.map((c) => [c.id, c]));
  for (const id of ["graph-map", "graph-impact", "graph-changes", "graph-coverage", "graph-cochange"]) {
    const row = byId[id];
    assert.ok(row, id + " is not catalogued");
    assert.equal(row.canonical, "_shared/code-graph.md", id + " points somewhere else");
    // A graph read is free and never blocks: both are contract, not prose.
    assert.equal(row.cost, "free", id + " is not free");
    assert.ok(row.never && row.never.length > 10, id + " has no `never`");
    // Every lane named on a graph row is a lane that touches code.
    for (const lane of row.lanes)
      assert.ok(
        ["orc", "orc-diy", "orc-fast", "orc-mini", "orc-quick"].includes(lane),
        id + " names " + lane + ", which is not a code lane"
      );
  }
});

// ── v1.9.0 W3/W4 — the two lean lanes, wired ────────────────────────────────
// The catalogue is permission; these hold that the PAYLOAD actually asks the
// questions the permission was granted for, and that each lane's detail sits in
// its own reference rather than growing back into the spine.
const skill = (lane) =>
  fs.readFileSync(
    path.join(__dirname, "..", "..", "templates", "skills", lane, "SKILL.md"),
    "utf8"
  );
const ref = (lane, name) =>
  fs.readFileSync(
    path.join(__dirname, "..", "..", "templates", "skills", lane, "references", name),
    "utf8"
  );

test("each lean lane's new detail lives in its own reference, not in the spine", () => {
  // The files exist and the spine POINTS at them. A pointer into nothing is the
  // failure mode a `read: section` manifest cannot catch on its own.
  const quick = skill("orc-quick");
  assert.ok(quick.includes("references/look.md"), "the quick spine does not point at look.md");
  assert.ok(quick.includes("references/defect.md"), "the quick spine does not point at defect.md");
  assert.ok(ref("orc-quick", "look.md").length > 500);
  assert.ok(ref("orc-quick", "defect.md").length > 500);

  const mini = skill("orc-mini");
  assert.ok(mini.includes("references/complexity.md"), "the mini spine does not point at complexity.md");
  const complexity = ref("orc-mini", "complexity.md");
  // The four thresholds are the lane's judgment. Each one carries its NUMBER,
  // because a threshold with no number cannot be moved by a retro.
  for (const n of ["4 or more", "8 or more", "3 or more"])
    assert.ok(complexity.includes(n), "complexity.md lost the threshold: " + n);
  assert.ok(complexity.includes("graph_facts"), "complexity.md does not hold the planner-slice shape");
});

test("a defect reproduces red before it is fixed, and never in silence", () => {
  const quick = skill("orc-quick");
  const defect = ref("orc-quick", "defect.md");
  assert.ok(quick.includes("kind: defect"), "the quick spine never sorts a defect");
  assert.ok(quick.includes("REPRO red"), "the quick spine emits no REPRO verb");
  // `repro: none` is an HONEST return, so it must be written down rather than
  // quietly dropped — that is the whole reason the field exists.
  assert.ok(defect.includes("repro: none"), "defect.md has no not-reproduced path");
  assert.ok(defect.includes("Never invent a reproduction"), "defect.md does not forbid a fake");
  // The executor writes it. An orchestrator-written reproduction is a sketch.
  assert.ok(
    /EXECUTOR writes the reproduction|executor writes the reproduction/i.test(defect),
    "defect.md does not pin who writes the reproduction"
  );
});

test("the gate suggestion is a recommendation, never a default", () => {
  const gate = ref("orc-quick", "dispatch-gate.md");
  assert.ok(gate.includes("## The suggestion"), "dispatch-gate.md has no suggestion section");
  // Every menu that carries a marker still ends with the line that says nothing
  // runs on silence. A marker without it reads as a pre-selection.
  assert.ok(
    gate.includes("Your choice — nothing runs until you answer."),
    "the gate menus lost the nothing-runs-until-you-answer line"
  );
  assert.ok(
    /never a pre-selection|never pre-selects/i.test(gate),
    "dispatch-gate.md does not say the marker is not a pre-selection"
  );
  assert.ok(skill("orc-quick").includes("→ suggested"), "the quick spine never names the marker");
});

test("the gain line is catalogued for the lanes that print it, and only those", () => {
  const all = json(cli(["lane", "calls", "--all", "--json"])).calls;
  const row = all.find((c) => c.id === "graph-gain");
  assert.ok(row, "graph-gain is not catalogued");
  assert.deepEqual([...row.lanes].sort(), ["orc-mini", "orc-quick"]);
  assert.equal(row.canonical, "_shared/code-graph.md");
  assert.equal(row.cost, "free");
  // The meter may never block a run, and its estimate may never be restated as
  // a saving. Both are in the row's own `never`, where a lane will read them.
  assert.ok(/block/i.test(row.never), "graph-gain's `never` does not forbid blocking");
  assert.ok(/saving/i.test(row.never), "graph-gain's `never` does not forbid the saving claim");
});

test("mini passes wiki POINTERS, never bodies, and records a `none`", () => {
  const mini = skill("orc-mini");
  assert.ok(/select PATHS,\s*\n?never bodies/.test(mini) || mini.includes("select PATHS"), "mini does not select paths");
  assert.ok(
    mini.includes("You never read a page\nbody into your own context.") ||
      /never read a page\s+body into your own context/.test(mini),
    "mini does not forbid reading a wiki body into the orchestrator"
  );
  // A null result is a result. Two runs of it is a signal about the wiki, not
  // about the run, and it is never dropped for looking empty.
  assert.ok(mini.includes("wiki_used: none"), "mini does not record wiki_used: none");
  assert.ok(mini.includes("graph_used: none"), "mini does not record graph_used: none");

  const shared = fs.readFileSync(
    path.join(__dirname, "..", "..", "templates", "skills", "_shared", "phases", "wiki-consult.md"),
    "utf8"
  );
  assert.ok(
    shared.includes("orc-fast and orc-mini pass POINTERS"),
    "the shared lane delta still names only orc-fast"
  );
});

// ── v1.9.1 W3 — `--brief` reaches every lane call site ─────────────────────
//
// The orchestrator prints the `card`, never the rows, and a `--json` answer is
// 4 to 8 times its card. Every read a lane makes carries `--brief`; the two
// exceptions below are the steps that really do read a row array, and each one
// says so in its own file.
const PAYLOAD = path.join(__dirname, "..", "..", "templates");

// file → why this call keeps its rows.
const BRIEF_EXCEPTIONS = {
  "skills/_shared/phases/review.md": "the reviewer is handed symbols[].caller_files and reads them",
  "agents/orc-graph-noter-sonnet-4-6-med.md": "the noter needs rows[].source, and `notes apply` is not a read",
  "skills/_shared/phases/trace.md": "it NAMES the commands a trace verb comes from; it makes no call",
};

function walkPayload(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkPayload(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

test("every graph --json call a lane makes carries --brief, or is a named exception", () => {
  const offenders = [];
  for (const file of walkPayload(PAYLOAD, [])) {
    const rel = path.relative(PAYLOAD, file).split(path.sep).join("/");
    if (BRIEF_EXCEPTIONS[rel]) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      if (!/orc graph .*--json/.test(line)) continue;
      // `--brief` may sit anywhere after the subcommand; the flags before it
      // are never reordered.
      if (line.includes("--brief")) continue;
      offenders.push(`${rel}: ${line.trim().slice(0, 100)}`);
    }
  }
  assert.deepStrictEqual(offenders, [], "a lane asks for rows it never prints");
});

test("the exceptions each SAY why, in their own file", () => {
  const review = fs.readFileSync(path.join(PAYLOAD, "skills", "_shared", "phases", "review.md"), "utf8");
  assert.match(review, /no `--brief` here/, "review.md does not say why it keeps its rows");
  const noter = fs.readFileSync(path.join(PAYLOAD, "agents", "orc-graph-noter-sonnet-4-6-med.md"), "utf8");
  assert.match(noter, /--with-source/, "the noter does not name the flag that gives it rows");
});

test("the source template carries --brief, so every generated executor does", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "agents-src", "executor.template.md"), "utf8");
  assert.match(src, /orc graph ctx <symbol\|file> --if-enabled --json --brief/);
});
