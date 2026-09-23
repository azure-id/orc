"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.2 W2 — the migration: a 1.8.1 store meets the 1.8.2 engine.
//
// The rule the user set (plan §7): a user on 1.8.0 or 1.8.1 upgrades the
// package and everything works; the cache is rebuilt on their machine, once,
// by the code paths that already exist. The golden under
// `test/goldens/graph-1.8.1/` was written by the 1.8.1 engine (`graph@4`,
// `RESOLVE_SCHEMA 2`) on 20-09-2026 and is never regenerated.
//
//   1. `status` on the old store reads DRIFTED with `engine_stale: true`.
//   2. `status --heal` re-extracts every file once, says so on its line, and
//      the store is FRESH on the new engine.
//   3. Every note whose symbol still exists is `current` after the upgrade.
//   4. The old resolution cache is refused before the heal and rewritten by it.
//   5. Every `ctx` and `impact` answer on the upgraded store is byte-identical
//      to the same answer on a store built from scratch.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { REPO, cli, tmpdir } = require("../_helpers");
const G = require("../../bin/graph.js");
const R = require("../../bin/graph-resolve.js");
const Q = require("../../bin/graph-query.js");

const GOLD = path.join(REPO, "test", "goldens", "graph-1.8.1");
const json = (r) => JSON.parse(r.stdout);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// The fixture as a git repository — the blobs must hash the same as the
// golden's `files.json`, which is why autocrlf is off and the bytes are written
// exactly. The source lives in `fixture.json` (one bundle, not `.js` files:
// the test runner would run every `.js` under test/ as a test file).
function fixtureRepo() {
  const root = tmpdir();
  const files = JSON.parse(fs.readFileSync(path.join(GOLD, "fixture.json"), "utf8"));
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  return { root, claudeDir: path.join(root, ".claude") };
}

function withOldStore() {
  const c = fixtureRepo();
  copyDir(path.join(GOLD, "store"), path.join(c.claudeDir, "orc", "graph"));
  return c;
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);

test("upgrade — a 1.8.1 store reads DRIFTED with engine_stale, and its resolution cache is refused", () => {
  const c = withOldStore();
  const s = json(graph(c.root, "status", "--json"));
  assert.equal(s.state, "drifted");
  assert.equal(s.engine_stale, true);
  assert.equal(s.engine, "graph@4", "the golden really is a 1.8.1 store");
  assert.equal(s.exists, true);
  const meta = JSON.parse(fs.readFileSync(path.join(c.claudeDir, "orc", "graph", "meta.json"), "utf8"));
  assert.equal(R.load(c.claudeDir, meta), null, "a schema-2 cache is never used by the schema-3 reader");
  // A read before the heal still answers — from the old index, computed on read.
  const m = Q.loadModel(c.claudeDir, c.root);
  assert.equal(m.callersCache, null);
  assert.equal(Q.ctx(m, "searchByItemPrefix", { budget: 2000 }).state, "found");
});

test("upgrade — status --heal re-extracts once, says so, and the store is FRESH on the current engine with every note current", () => {
  const c = withOldStore();
  const before = JSON.parse(fs.readFileSync(path.join(c.claudeDir, "orc", "graph", "meta.json"), "utf8"));
  const h = graph(c.root, "status", "--heal", "--json");
  assert.equal(h.status, 0, h.stdout + h.stderr);
  const j = json(h);
  assert.equal(j.state, "fresh");
  assert.equal(j.engine, G.ENGINE);
  assert.equal(j.engine_stale, false);
  assert.equal(j.healed.state, "updated");
  assert.equal(j.healed.engine_upgrade, true);
  assert.equal(j.healed.parsed, 12, "every file is parsed again — no old record is reused");
  assert.equal(j.healed.reused, 0);
  assert.equal(j.generation, before.generation + 1);
  assert.match(j.line, /index upgraded to the new engine → updated/);
  assert.match(j.trace, /^GRAPH-CONSULT updated :: /);
  const cache = JSON.parse(fs.readFileSync(R.resolvedPath(c.claudeDir), "utf8"));
  assert.equal(cache.schema, R.RESOLVE_SCHEMA);
  assert.equal(cache.generation, j.generation);

  // Promise 3: the three golden notes are keyed by (symbol, body_hash), and
  // neither moved — a note survives an engine upgrade.
  for (const [q, text] of [
    ["searchByItemPrefix", "golden note for searchByItemPrefix"],
    ["OrderStore.get", "golden note for OrderStore.get"],
    ["OrderStore.constructor", "golden note for OrderStore.constructor"],
  ]) {
    const r = json(graph(c.root, "ctx", q, "--json"));
    assert.equal(r.state, "found", q);
    assert.ok(r.note && r.note.current === true, `${q}: note should be current, got ${JSON.stringify(r.note)}`);
    assert.equal(r.note.text, text);
    assert.equal(r.note.model, "golden-1.8.1");
  }
});

test("upgrade — every read answer on the upgraded store is byte-identical to a store built from scratch", () => {
  const old = withOldStore();
  assert.equal(graph(old.root, "status", "--heal", "--json").status, 0);
  const fresh = fixtureRepo();
  const u = G.graphUpdate(fresh.claudeDir, fresh.root, { enabled: true });
  assert.equal(u.state, "built");
  // The same notes on both, so the only difference left would be the engine's.
  fs.copyFileSync(path.join(GOLD, "store", "notes.jsonl"), G.graphPaths(fresh.claudeDir).notes);

  const a = Q.loadModel(old.claudeDir, old.root);
  const b = Q.loadModel(fresh.claudeDir, fresh.root);
  assert.ok(a.callersCache && b.callersCache, "both read through their (rewritten) caches");
  assert.equal(a.meta.gen_id, b.meta.gen_id, "the same tree has the same content id on both machines");
  assert.notEqual(a.meta.generation, b.meta.generation, "and a different generation number — the id is what a card may quote");
  const files = Object.keys(b.byFile).sort();
  assert.deepStrictEqual(Object.keys(a.byFile).sort(), files);
  for (const rel of files) {
    assert.deepStrictEqual(Q.ctx(a, rel, { budget: 4000 }), Q.ctx(b, rel, { budget: 4000 }), `ctx ${rel}`);
    assert.deepStrictEqual(Q.impact(a, [rel], { depth: 3, budget: 4000 }), Q.impact(b, [rel], { depth: 3, budget: 4000 }), `impact ${rel}`);
    for (const s of (b.byFile[rel].symbols || []).filter((x) => x.kind !== "module")) {
      assert.deepStrictEqual(Q.ctx(a, s.id, { budget: 4000 }), Q.ctx(b, s.id, { budget: 4000 }), `ctx ${s.id}`);
    }
  }
  // And the R3-C answer is there on both: the route is reached by its tests.
  const r = Q.ctx(a, "GET /orders/search", { budget: 4000 });
  assert.equal(r.state, "found");
  assert.deepStrictEqual(r.tests, ["tests/orders.test.js"]);
  assert.ok(r.callers.filter((x) => x.state === "ROUTE").length >= 3);
});

// ── v1.9.1 W5b — a 1.9.0 store (graph@5) meets graph@6 ──────────────────────
//
// The golden under `test/goldens/graph-1.9.0/` was written by the graph@5
// engine on 23-09-2026, BEFORE the extractor changed, on an Options API
// fixture where graph@5 saw 2 symbols in 7 files. It is never regenerated.
const GOLD5 = path.join(REPO, "test", "goldens", "graph-1.9.0");

function withStore5() {
  const root = tmpdir();
  const files = JSON.parse(fs.readFileSync(path.join(GOLD5, "fixture.json"), "utf8"));
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  const claudeDir = path.join(root, ".claude");
  copyDir(path.join(GOLD5, "store"), path.join(claudeDir, "orc", "graph"));
  return { root, claudeDir };
}

test("upgrade @5 → @6 — DRIFTED, one automatic re-extract, the Options API is named, the note survives", () => {
  const c = withStore5();
  const s = json(graph(c.root, "status", "--json"));
  assert.equal(s.engine, "graph@5", "the golden really is a 1.9.0 store");
  assert.equal(s.state, "drifted");
  assert.equal(s.engine_stale, true);
  // Before the heal the old index still answers what it knew. In process: a
  // CLI read would heal on read (the golden's HEAD is not this repo's HEAD).
  const m5 = Q.loadModel(c.claudeDir, c.root);
  assert.equal(Q.ctx(m5, "money", { budget: 2000 }).state, "found");
  assert.equal(Q.ctx(m5, "CreateFundTransferModal.submit", { budget: 2000 }).state, "not-found", "graph@5 never named it");

  const h = json(graph(c.root, "status", "--heal", "--json"));
  assert.equal(h.state, "fresh");
  assert.equal(h.engine, "graph@6");
  assert.equal(h.healed.engine_upgrade, true);
  assert.equal(h.healed.parsed, 7, "every file is parsed again");
  assert.equal(h.healed.reused, 0);
  assert.equal(h.density.zero_files, 0, "graph@5 read 5 of these 7 files as empty");

  const submit = json(graph(c.root, "ctx", "CreateFundTransferModal.submit", "--json"));
  assert.equal(submit.state, "found");
  assert.deepStrictEqual(submit.callers.map((x) => x.qname), ["formMixin.reset"]);

  // A function symbol keeps its id and its body hash, so its note is current.
  const fmt = json(graph(c.root, "ctx", "fmt", "--json"));
  assert.ok(fmt.note && fmt.note.current === true, JSON.stringify(fmt.note));
  assert.equal(fmt.note.text, "golden note for fmt");
});

test("upgrade @5 → @6 — the healed store answers exactly what a fresh graph@6 build answers", () => {
  const old = withStore5();
  assert.equal(graph(old.root, "status", "--heal", "--json").status, 0);
  const fresh = withStore5();
  fs.rmSync(path.join(fresh.claudeDir, "orc", "graph"), { recursive: true, force: true });
  assert.equal(G.graphUpdate(fresh.claudeDir, fresh.root, { enabled: true }).state, "built");
  fs.copyFileSync(path.join(GOLD5, "store", "notes.jsonl"), G.graphPaths(fresh.claudeDir).notes);
  const a = Q.loadModel(old.claudeDir, old.root);
  const b = Q.loadModel(fresh.claudeDir, fresh.root);
  assert.equal(a.meta.gen_id, b.meta.gen_id);
  for (const rel of Object.keys(b.byFile).sort()) {
    assert.deepStrictEqual(Q.ctx(a, rel, { budget: 4000 }), Q.ctx(b, rel, { budget: 4000 }), `ctx ${rel}`);
    for (const s of (b.byFile[rel].symbols || []).filter((x) => x.kind !== "module")) {
      assert.deepStrictEqual(Q.ctx(a, s.id, { budget: 4000 }), Q.ctx(b, s.id, { budget: 4000 }), `ctx ${s.id}`);
    }
  }
});
