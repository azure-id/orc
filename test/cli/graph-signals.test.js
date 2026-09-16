"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.0 EW5 — the lean card format (E6) and the four cheap signals (E7).
//
// The promises this file holds:
//
//   1. **The tree format is a FORMAT, never a filter.** Same rows, same order,
//      same JSON — only the bytes differ. And it is NEVER WORSE: a column
//      header is a fixed cost, so a card with too few rows to pay for one
//      stays prose and SAYS it stayed prose.
//   2. **Paging is not truncation.** `--offset` moves the window, `has_more`
//      says there is another, and `total_symbols` never changes.
//   3. **Risk is a hint with its evidence attached.** `changes` never says
//      "high" without saying why, and it reports the symbols the HUNKS
//      overlap — not every symbol in a touched file.
//   4. **Co-change is history, not structure**, and it says so.
//   5. Every one of them costs zero model tokens.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");

const json = (r) => JSON.parse(r.stdout);

function write(root, rel, body) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
}

// A repo with a real call chain, a test that reaches it by CALL, and a test
// that reaches another file only by NAME.
function repo() {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/services/orderService.js", [
    "import { findOrder } from '../repos/orderRepo.js';",
    "export function getOrder(id) { return findOrder(id); }",
    "export function listOrders() { return findOrder(0); }",
    "function privateHelper() { return 1; }",
    "",
  ].join("\n"));
  write(root, "src/repos/orderRepo.js", "export function findOrder(id) { return { id }; }\n");
  write(root, "src/routes/orders.js", [
    "import { getOrder } from '../services/orderService.js';",
    "export function handler(req) { return getOrder(req.id); }",
    "",
  ].join("\n"));
  write(root, "tests/orderService.test.js", [
    "import { getOrder } from '../src/services/orderService.js';",
    "it('gets', () => getOrder(1));",
    "",
  ].join("\n"));
  // Reaches orderRepo.js by NAME only — no call, no import of a symbol.
  write(root, "tests/orderRepo.test.js", "it('exists', () => 1);\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  return { root, git };
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const on = (root) => assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
const built = (root) => {
  on(root);
  assert.equal(graph(root, "update", "--json").status, 0);
};

// ── E6 ──────────────────────────────────────────────────────────────────────

test("graph ctx --format tree — the same rows in fewer bytes, and the JSON is unchanged", () => {
  const { root } = repo();
  built(root);
  const prose = json(graph(root, "ctx", "src/services/orderService.js", "--budget", "4000", "--json"));
  const tree = json(graph(root, "ctx", "src/services/orderService.js", "--budget", "4000", "--format", "tree", "--json"));

  assert.equal(tree.format, "tree");
  assert.equal(prose.format, "prose");
  // A FORMAT, never a filter: every structured field is identical.
  assert.deepStrictEqual(tree.symbols, prose.symbols);
  assert.deepStrictEqual(tree.imports, prose.imports);
  assert.deepStrictEqual(tree.tests, prose.tests);
  assert.equal(tree.total_symbols, prose.total_symbols);
  // Only the bytes differ, and only downwards.
  assert.ok(tree.budget.used < prose.budget.used, `tree ${tree.budget.used} should be under prose ${prose.budget.used}`);
  assert.match(tree.card, /kind name lines exp fan-in/, "the columns are named once");
  assert.ok(!/fan-in \d+$/m.test(tree.card.split("\n")[2] || ""), "and never again per row");
});

test("graph --format tree — a card too small to pay for a column header stays PROSE and says so", () => {
  const { root } = repo();
  built(root);
  // One symbol: a header line costs more than the columns save.
  const one = json(graph(root, "ctx", "src/repos/orderRepo.js", "--budget", "4000", "--format", "tree", "--json"));
  assert.equal(one.format, "prose", "never worse than prose is the whole rule");
  assert.ok(!/kind name lines/.test(one.card));
});

test("graph ctx --offset — paging moves the window; it never changes the total", () => {
  const { root } = repo();
  built(root);
  const all = json(graph(root, "ctx", "src/services/orderService.js", "--budget", "4000", "--json"));
  assert.equal(all.offset, 0);
  assert.equal(all.has_more, false);
  assert.ok(all.total_symbols >= 3);

  const paged = json(graph(root, "ctx", "src/services/orderService.js", "--budget", "4000", "--offset", "2", "--json"));
  assert.equal(paged.offset, 2);
  assert.equal(paged.total_symbols, all.total_symbols, "the total is a fact about the file, not about the page");
  assert.equal(paged.symbols.length, all.symbols.length - 2);
  assert.deepStrictEqual(paged.symbols, all.symbols.slice(2));
});

// ── E7 ──────────────────────────────────────────────────────────────────────

test("graph ctx — rows are ordered by IMPORTANCE, so an exported entry point beats a busy private helper", () => {
  const { root } = repo();
  built(root);
  const r = json(graph(root, "ctx", "src/services/orderService.js", "--budget", "4000", "--json"));
  const names = r.symbols.map((s) => s.qname);
  assert.ok(names.indexOf("getOrder") < names.indexOf("privateHelper"), "exported first");
  for (const s of r.symbols) assert.equal(typeof s.importance, "number", s.qname + " carries its score");
  assert.ok(r.symbols[0].importance > 0);
});

test("graph ctx — tests are found by CALL and by NAME, because either one is its test", () => {
  const { root } = repo();
  built(root);
  const svc = json(graph(root, "ctx", "src/services/orderService.js", "--budget", "4000", "--json"));
  assert.ok(svc.tests.includes("tests/orderService.test.js"), "reached by a call");

  // orderRepo.test.js calls nothing and imports nothing. The graph can only
  // find it by its name, and a test that exists is a test that counts.
  const repoCard = json(graph(root, "ctx", "src/repos/orderRepo.js", "--budget", "4000", "--json"));
  assert.ok(repoCard.tests.includes("tests/orderRepo.test.js"), "reached by name only");
});

test("graph changes — the symbols the HUNKS touched, each with the reason for its risk", () => {
  const { root } = repo();
  built(root);
  // Touch ONE function in a file that holds four.
  const f = path.join(root, "src", "services", "orderService.js");
  fs.writeFileSync(root && f, fs.readFileSync(f, "utf8").replace("return findOrder(id);", "return findOrder(id) || null;"));

  const r = json(graph(root, "changes", "--json"));
  assert.equal(r.status === undefined, true);
  const names = r.symbols.map((s) => s.qname);
  assert.deepStrictEqual(names, ["getOrder"], "a hunk in one function must not report its neighbours");
  const row = r.symbols[0];
  assert.equal(row.file, "src/services/orderService.js");
  assert.ok(row.risk === "high" || row.risk === "medium");
  assert.ok(row.why.length, "risk always carries its reason");
  assert.ok(row.why.some((w) => /fan-in/.test(w)));
  assert.ok(row.tests.includes("tests/orderService.test.js"), "a tested symbol is never the highest risk for no reason");
  assert.match(json(graph(root, "changes", "--json")).trace, /^GRAPH-CHANGES found/);
});

test("graph changes — an untracked source file is a change too, and one outside the graph is NAMED", () => {
  const { root } = repo();
  built(root);
  write(root, "src/new.js", "export function brandNew() { return 1; }\n");
  write(root, "notes.md", "# not source\n");
  const r = json(graph(root, "changes", "--json"));
  assert.ok(r.files.includes("src/new.js"), "git diff never mentions an untracked file; the answer must");
  // notes.md is not a source file, so it is neither indexed nor reported as a gap.
  assert.ok(!r.files.includes("notes.md"));
});

test("graph changes — a clean tree is an ANSWER, not an error", () => {
  const { root } = repo();
  built(root);
  const r = graph(root, "changes", "--json");
  assert.equal(r.status, 0);
  assert.deepStrictEqual(json(r).symbols, []);
  assert.match(json(r).line, /no indexed symbol was touched/);
});

test("graph changes and cochange — off with --if-enabled is exit 3, and no graph is exit 1", () => {
  const { root } = repo();
  for (const sub of ["changes", "cochange"]) {
    const off = graph(root, sub, "src/repos/orderRepo.js", "--if-enabled", "--json");
    assert.equal(off.status, 3, sub);
    assert.equal(json(off).state, "off");
  }
  on(root);
  assert.equal(graph(root, "changes", "--json").status, 1, "changes needs an index");
});

test("graph cochange — files that really change together, and silence for a file that does not", () => {
  const { root, git } = repo();
  built(root);
  // Three commits that touch the route and the service together, and one that
  // touches the repo alone.
  for (let i = 0; i < 3; i++) {
    write(root, "src/routes/orders.js", `// rev ${i}\nimport { getOrder } from '../services/orderService.js';\nexport function handler(req) { return getOrder(req.id); }\n`);
    write(root, "src/services/orderService.js", `// rev ${i}\nimport { findOrder } from '../repos/orderRepo.js';\nexport function getOrder(id) { return findOrder(id); }\n`);
    git("add", "-A");
    git("commit", "-qm", `pair ${i}`);
  }
  write(root, "src/repos/orderRepo.js", "export function findOrder(id) { return { id, ok: true }; }\n");
  git("add", "-A");
  git("commit", "-qm", "alone");

  const r = json(graph(root, "cochange", "src/routes/orders.js", "--json"));
  assert.equal(r.state, "found");
  assert.equal(r.rows[0].file, "src/services/orderService.js");
  assert.ok(r.rows[0].together >= 3, "below the threshold is noise, not a signal");
  assert.match(r.line, /history, not structure/, "it must never be read as a dependency");

  // The repo file changed with the others only once — under the threshold.
  const alone = graph(root, "cochange", "src/repos/orderRepo.js", "--json");
  assert.equal(alone.status, 4, "nothing reaching the threshold is an ANSWER (exit 4)");
  assert.match(json(alone).line, /changes alone/);
});

test("graph cochange — the answer is cached per HEAD, and a new commit rebuilds it", () => {
  const { root, git } = repo();
  built(root);
  graph(root, "cochange", "src/routes/orders.js", "--json");
  const cache = path.join(root, ".claude", "orc", "graph", "cochange.json");
  assert.ok(fs.existsSync(cache), "history does not move under a working-tree edit — cache it");
  const first = JSON.parse(fs.readFileSync(cache, "utf8"));

  write(root, "src/routes/orders.js", "// changed\nexport function handler() { return 1; }\n");
  git("add", "-A");
  git("commit", "-qm", "moved");
  graph(root, "cochange", "src/routes/orders.js", "--json");
  const second = JSON.parse(fs.readFileSync(cache, "utf8"));
  assert.notEqual(second.head, first.head, "HEAD moved, so the cache was rebuilt");
});
