"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.0 W4 — `orc graph notes pending | apply`, and the note on the card.
//
// The promises this file holds:
//
//   1. A note is shown as CURRENT only while the symbol's body hashes the same.
//      After the body changes the card says "stale" — it never repeats an old
//      sentence as a fact.
//   2. The CLI validates every row against the current index. A stale or
//      unknown row is rejected BY NAME, and the valid rows still apply.
//   3. `pending` never runs repo-wide, and a batch below `--min` is exit 5 —
//      the lane does not pay a subagent's start-up cost for one sentence.
//   4. `gc` compacts the ledger to the latest current note per symbol.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");

const CLI = path.join(__dirname, "..", "..", "bin", "cli.js");
const json = (r) => JSON.parse(r.stdout);

function write(root, rel, body) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
}

const SVC = (ret) =>
  [
    "function validate(o) {",
    "  if (!o) throw new Error('empty');",
    "  return o;",
    "}",
    "function save(o) {",
    "  validate(o);",
    `  return ${ret};`,
    "}",
    "function tiny() { return 1; }",
    "module.exports = { validate, save };",
  ].join("\n");

function repo() {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/svc.js", SVC("db.insert(o)"));
  git("add", "-A");
  git("commit", "-qm", "base");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  assert.equal(cli(["graph", "update", "--dir", root]).status, 0);
  return { root, git };
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);

function applyStdin(root, body) {
  const r = spawnSync(process.execPath, [CLI, "graph", "notes", "apply", "-", "--json", "--dir", root], { input: JSON.stringify(body), encoding: "utf8" });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

test("notes pending — functions and methods of the named files only; a tiny symbol is skipped", () => {
  const { root } = repo();
  const r = graph(root, "notes", "pending", "--files", "src/svc.js", "--min", "1", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.deepStrictEqual(j.rows.map((x) => x.sym).sort(), ["src/svc.js#save", "src/svc.js#validate"]);
  assert.ok(j.rows.every((x) => x.body_hash && x.lines.length === 2));
});

test("notes pending — below --min is exit 5 and lists who is waiting; no --files is exit 1", () => {
  const { root } = repo();
  const r = graph(root, "notes", "pending", "--files", "src/svc.js", "--json");
  assert.equal(r.status, 5, "the default minimum is 5 and this file has 2");
  const j = json(r);
  assert.equal(j.state, "below-min");
  assert.equal(j.waiting.length, 2);
  assert.equal(graph(root, "notes", "pending", "--json").status, 1);
});

test("notes apply — valid rows apply, a stale or unknown row is rejected by name (exit 6)", () => {
  const { root } = repo();
  const rows = json(graph(root, "notes", "pending", "--files", "src/svc.js", "--min", "1", "--json")).rows;
  const byId = Object.fromEntries(rows.map((x) => [x.sym, x]));
  const r = applyStdin(root, {
    model: "claude-sonnet-4-6",
    notes: [
      { sym: "src/svc.js#save", body_hash: byId["src/svc.js#save"].body_hash, note: "Validates an order and inserts it into the database." },
      { sym: "src/svc.js#validate", body_hash: "0000000000000000", note: "Throws on an empty order." },
      { sym: "src/svc.js#ghost", body_hash: "x", note: "Does not exist." },
    ],
  });
  assert.equal(r.status, 6, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.applied, 1);
  assert.deepStrictEqual(j.rejected.map((x) => x.reason).sort(), ["stale-body-hash", "unknown-symbol"]);
  const left = json(graph(root, "notes", "pending", "--files", "src/svc.js", "--min", "1", "--json")).rows.map((x) => x.sym);
  assert.deepStrictEqual(left, ["src/svc.js#validate"], "a noted symbol is no longer pending");
});

test("notes apply — a multi-line or oversized note is rejected; a file path works as well as stdin", () => {
  const { root } = repo();
  const rows = json(graph(root, "notes", "pending", "--files", "src/svc.js", "--min", "1", "--json")).rows;
  const file = path.join(root, "notes.json");
  fs.writeFileSync(file, JSON.stringify({ notes: [
    { sym: rows[0].sym, body_hash: rows[0].body_hash, note: "line one\nline two" },
    { sym: rows[1].sym, body_hash: rows[1].body_hash, note: "x".repeat(400) },
  ] }));
  const r = graph(root, "notes", "apply", file, "--json");
  assert.equal(r.status, 6);
  assert.deepStrictEqual(json(r).rejected.map((x) => x.reason).sort(), ["multi-line", "too-long"]);
});

test("ctx — a current note is on the card; after the body changes it is STALE, never repeated", () => {
  const { root } = repo();
  const rows = json(graph(root, "notes", "pending", "--files", "src/svc.js", "--min", "1", "--json")).rows;
  const save = rows.find((x) => x.sym.endsWith("#save"));
  assert.equal(applyStdin(root, { model: "claude-sonnet-4-6", notes: [{ sym: save.sym, body_hash: save.body_hash, note: "Validates an order and inserts it." }] }).status, 0);
  const before = json(graph(root, "ctx", "save", "--json"));
  assert.equal(before.note.current, true);
  assert.equal(before.note.text, "Validates an order and inserts it.");
  assert.match(before.card, /note {2}Validates an order and inserts it\./);

  write(root, "src/svc.js", SVC("db.upsert(o)"));
  assert.equal(graph(root, "update").status, 0);
  const after = json(graph(root, "ctx", "save", "--json"));
  assert.equal(after.note.current, false);
  assert.equal(after.note.text, null);
  assert.ok(!after.card.includes("Validates an order and inserts it."), "the old sentence is never shown as a fact");
  assert.match(after.card, /note: stale/);
});

test("gc — the ledger is compacted to the latest current note per symbol", () => {
  const { root } = repo();
  const rows = json(graph(root, "notes", "pending", "--files", "src/svc.js", "--min", "1", "--json")).rows;
  const save = rows.find((x) => x.sym.endsWith("#save"));
  applyStdin(root, { notes: [{ sym: save.sym, body_hash: save.body_hash, note: "First." }] });
  applyStdin(root, { notes: [{ sym: save.sym, body_hash: save.body_hash, note: "Second." }] });
  write(root, "src/svc.js", SVC("db.upsert(o)"));
  assert.equal(graph(root, "update").status, 0);
  const g = graph(root, "gc", "--json");
  assert.equal(g.status, 0);
  assert.deepStrictEqual(json(g).notes, { kept: 0, removed: 2 });
  const ledger = path.join(root, ".claude", "orc", "graph", "notes.jsonl");
  assert.equal(fs.readFileSync(ledger, "utf8"), "");
});
