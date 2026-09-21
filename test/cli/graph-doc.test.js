"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.2 W4 — N1 · N2 · N3: the paid layer, paid less.
//
// The promises this file holds:
//
//   1. **N1 doc notes cost 0 model tokens.** The extractor takes the first
//      sentence the AUTHOR wrote — a docstring, a JSDoc block, a `///` run, a
//      `#` run — for a function, a method or a route. It is a NOTE, not a fact:
//      a current model note outranks it, and it outranks a stale one.
//   2. **A documented symbol is never in a notes batch.** The sentence exists;
//      nobody pays a subagent to write it again.
//   3. **N2 `--with-source`** hands the noter each row's own code, so a
//      40-symbol batch is one call instead of forty reads.
//   4. **N3** a batch under the minimum always says the same sentence.
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

// One file per comment shape the plan names.
function documented() {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/jsdoc.js", [
    "/**",
    " * Validates the cart and returns the total. Never mutates its argument.",
    " *",
    " * @param {object} cart the cart",
    " * @returns {number}",
    " */",
    "function totalOf(cart) {",
    "  let n = 0;",
    "  for (const i of cart.items) n += i.price;",
    "  return n;",
    "}",
    "",
    "// A plain line comment is a doc too.",
    "// The second line joins the first when the first has no full stop",
    "function slugOf(s) {",
    "  const t = String(s).toLowerCase();",
    "  return t.replace(/ /g, '-');",
    "}",
    "",
    "function undocumented(a) {",
    "  const b = a + 1;",
    "  return b * 2;",
    "}",
    "module.exports = { totalOf, slugOf, undocumented };",
  ]);
  write(root, "src/mod.py", [
    "def load(path):",
    '    """Read the file at PATH and return its rows.',
    "",
    "    Args:",
    "        path: where to read from",
    '    """',
    "    with open(path) as fh:",
    "        return fh.readlines()",
    "",
    "",
    "# Count the rows a load() produced.",
    "def count(rows):",
    "    n = 0",
    "    for _ in rows:",
    "        n += 1",
    "    return n",
    "",
    "",
    "def bare(x):",
    "    y = x + 1",
    "    return y",
  ]);
  write(root, "src/lib.go", [
    "package lib",
    "",
    "// Sum adds every value and returns the total.",
    "func Sum(xs []int) int {",
    "\ttotal := 0",
    "\tfor _, x := range xs {",
    "\t\ttotal += x",
    "\t}",
    "\treturn total",
    "}",
  ]);
  git("add", "-A");
  git("commit", "-qm", "docs");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  const u = cli(["graph", "update", "--dir", root]);
  assert.equal(u.status, 0, u.stdout + u.stderr);
  return root;
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const symbolsOf = (root) => {
  const idx = JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "graph", "index.json"), "utf8"));
  const out = {};
  for (const f of Object.values(idx.by_file)) for (const s of f.symbols || []) out[s.qname] = s;
  return out;
};

// ── N1 ──────────────────────────────────────────────────────────────────────

test("doc notes — the author's first sentence, from every comment shape, at 0 model tokens", () => {
  const root = documented();
  const syms = symbolsOf(root);
  assert.equal(syms.totalOf.doc, "Validates the cart and returns the total.", "JSDoc: first sentence only, and the @param table is cut");
  assert.equal(syms.slugOf.doc, "A plain line comment is a doc too.", "a `//` run");
  assert.equal(syms.load.doc, "Read the file at PATH and return its rows.", "a Python docstring, with the Args: block cut");
  assert.equal(syms.count.doc, "Count the rows a load() produced.", "a `#` block above, when there is no docstring");
  assert.equal(syms.Sum.doc, "Sum adds every value and returns the total.", "Go");
  assert.equal(syms.undocumented.doc, undefined, "no comment, no doc");
  assert.equal(syms.bare.doc, undefined);
});

test("doc notes — the card prints it as the parser's sentence, and a MODEL note outranks it", () => {
  const root = documented();
  const syms = symbolsOf(root);
  const before = json(graph(root, "ctx", "totalOf", "--json"));
  assert.equal(before.note.source, "doc");
  assert.equal(before.note.model, "parser");
  assert.equal(before.note.current, true);
  assert.match(before.card, /^ {2}doc {3}Validates the cart and returns the total\. {2}\(parser · current\)$/m);

  const payload = JSON.stringify({ model: "claude-sonnet-4-6", notes: [{ sym: syms.totalOf.id, body_hash: syms.totalOf.body_hash, note: "Adds every item price and returns the sum." }] });
  fs.writeFileSync(path.join(root, "notes.json"), payload);
  assert.equal(cli(["graph", "notes", "apply", path.join(root, "notes.json"), "--dir", root]).status, 0);

  const after = json(graph(root, "ctx", "totalOf", "--json"));
  assert.equal(after.note.source, "model", "the model read the code; the comment only claims to have");
  assert.match(after.card, /note {2}Adds every item price/);
});

test("doc notes — a doc outranks a STALE model note, because it matches the bytes on disk", () => {
  const root = documented();
  const syms = symbolsOf(root);
  const payload = JSON.stringify({ model: "claude-sonnet-4-6", notes: [{ sym: syms.totalOf.id, body_hash: syms.totalOf.body_hash, note: "An old sentence about an old body." }] });
  fs.writeFileSync(path.join(root, "notes.json"), payload);
  assert.equal(cli(["graph", "notes", "apply", path.join(root, "notes.json"), "--dir", root]).status, 0);

  // Change the body. The model note is now stale; the doc is re-extracted with it.
  const f = path.join(root, "src", "jsdoc.js");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("let n = 0;", "let n = 0; // touched"));
  assert.equal(cli(["graph", "update", "--dir", root]).status, 0);

  const j = json(graph(root, "ctx", "totalOf", "--json"));
  assert.equal(j.note.source, "doc");
  assert.match(j.card, /doc {3}Validates the cart/);
  assert.doesNotMatch(j.card, /An old sentence/, "a stale model note is never repeated as a fact");
});

// ── N1 + the notes batch ────────────────────────────────────────────────────

test("notes pending — a documented symbol is never in the batch, and the answer says how many it skipped", () => {
  const root = documented();
  const r = graph(root, "notes", "pending", "--files", "src/jsdoc.js,src/mod.py,src/lib.go", "--min", "1", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  const named = j.rows.map((x) => x.sym.split("#").pop()).sort();
  assert.deepStrictEqual(named, ["bare", "undocumented"], "only the code nobody documented");
  assert.equal(j.documented, 5, JSON.stringify(j));
  assert.match(j.line, /5 already documented in the source — no note is paid for them/);
});

// ── N2 ──────────────────────────────────────────────────────────────────────

test("notes pending --with-source — each row carries its own code, so the noter reads nothing", () => {
  const root = documented();
  const plain = json(graph(root, "notes", "pending", "--files", "src/jsdoc.js", "--min", "1", "--json"));
  assert.equal(plain.with_source, false);
  assert.equal(plain.rows[0].source, undefined);

  const j = json(graph(root, "notes", "pending", "--files", "src/jsdoc.js", "--min", "1", "--with-source", "--json"));
  assert.equal(j.with_source, true);
  const row = j.rows.find((x) => x.sym.endsWith("#undocumented"));
  assert.equal(row.source.from, row.lines[0]);
  assert.equal(row.source.to, row.lines[1]);
  assert.equal(row.source.cut, 0);
  assert.match(row.source.text, /function undocumented\(a\)/);
  assert.match(row.source.text, /return b \* 2;/);
});

test("notes pending --with-source — a row whose file moved is null, never a wrong range", () => {
  const root = documented();
  fs.rmSync(path.join(root, "src", "jsdoc.js"));
  const j = json(graph(root, "notes", "pending", "--files", "src/jsdoc.js", "--min", "1", "--with-source", "--json"));
  assert.equal(j.rows.length, 1);
  assert.equal(j.rows[0].source, null, "the noter reads it itself rather than being handed a guess");
});

// ── N3 ──────────────────────────────────────────────────────────────────────

test("notes pending — a batch under the minimum says the same sentence every time", () => {
  const root = documented();
  const r = graph(root, "notes", "pending", "--files", "src/jsdoc.js", "--min", "5", "--json");
  assert.equal(r.status, 5, "a batch that waits is exit 5 — an answer, never an error");
  const j = json(r);
  assert.equal(j.state, "below-min");
  assert.match(j.line, /^graph notes: 1 pending, waiting \(min 5\)/);
  assert.deepStrictEqual(j.rows, [], "nothing is dispatched, and nothing is lost");
});
