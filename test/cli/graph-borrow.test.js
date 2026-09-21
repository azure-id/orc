"use strict";
// @test-pool spawn  — may shell `go run`
// v1.8.2 W6 (G7) — the borrowed toolchains.
//
// The promises this file holds:
//
//   1. A project that has `node_modules/typescript` is parsed EXACTLY, and the
//      record says so: `extractor: typescript@<version>`.
//   2. A borrowed rung produces the SAME SHAPE as the heuristic — the same
//      symbols, the same qualified names, the same line ranges — because
//      `finalize` is one code path for both. A card must not change meaning
//      because a dependency happened to be installed.
//   3. `ORC_GRAPH_NO_BORROW=1` forces the heuristic back, whatever is on the
//      machine. That is the escape hatch for a toolchain that misbehaves.
//   4. A file the borrowed parser cannot read falls back PER FILE, so one bad
//      file never costs the batch its exact parse.
//   5. Go is parsed by `go/parser` when a Go toolchain is on PATH, with the
//      same contract and the same fallback.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tmpdir } = require("../_helpers");
const X = require("../../bin/graph-extract.js");

// A typescript to borrow: an explicit one, or whatever this machine resolves.
function tsHome() {
  const cands = [];
  if (process.env.ORC_TEST_TS_DIR) cands.push(path.join(process.env.ORC_TEST_TS_DIR, "node_modules", "typescript"));
  try {
    cands.push(path.dirname(path.dirname(require.resolve("typescript"))));
  } catch (_) {}
  for (const c of cands) {
    try {
      if (fs.existsSync(path.join(c, "lib", "typescript.js"))) return c;
    } catch (_) {}
  }
  return null;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const TS_SRC = [
  'import { Repo } from "./repo";', //                  1
  "", //                                                2
  "export class Service {", //                          3
  "  constructor(private readonly repo: Repo) {}", //    4
  "", //                                                5
  "  list(): string[] {", //                            6
  "    return this.repo.all();", //                     7
  "  }", //                                             8
  "", //                                                9
  "  find(id: number): string | undefined;", //         10
  "  find(id: string): string | undefined;", //         11
  "  find(id: number | string) {", //                   12
  "    return this.repo.byId(id);", //                  13
  "  }", //                                            14
  "}", //                                              15
].join("\n");

// Only the facts a CARD prints, so the two rungs are compared on what a reader
// actually sees — not on the shape of an intermediate.
function shape(r) {
  return {
    symbols: (r.symbols || []).filter((s) => s.kind !== "module").map((s) => `${s.kind} ${s.qname} ${s.lines.join("-")}`).sort(),
    imports: (r.imports || []).map((i) => `${i.from}:${(i.bindings || []).map((b) => `${b.local}<-${b.orig}`).join(",")}`).sort(),
    calls: (r.symbols || []).flatMap((s) => (s.calls || []).map((c) => `${s.qname} ${c.name}${c.self ? "[self]" : ""}${c.alias ? `(@${c.alias})` : ""}`)).sort(),
  };
}

function build(files, root) {
  const items = Object.entries(files).map(([rel, src]) => {
    const abs = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, src);
    return { rel, abs, lang: /\.go$/.test(rel) ? "go" : "ts", src };
  });
  return items;
}

test("borrow — TypeScript: the project's own compiler parses the file, and the record names it", { skip: !tsHome() && "no typescript on this machine (set ORC_TEST_TS_DIR)" }, () => {
  const root = tmpdir();
  copyDir(tsHome(), path.join(root, "node_modules", "typescript"));
  const items = build({ "src/service.ts": TS_SRC, "src/repo.ts": "export class Repo {\n  all(): string[] { return []; }\n  byId(id: unknown) { return String(id); }\n}\n" }, root);

  const borrowed = X.extractBatch(items, { root });
  const svc = borrowed.get("src/service.ts");
  assert.match(svc.extractor, /^typescript@\d/);
  assert.equal(svc.coverage, "full");

  // An OVERLOAD signature has no body and is not a symbol — recording it would
  // give `ctx Service.find` three answers and make every caller ambiguous.
  const names = shape(svc).symbols;
  assert.deepStrictEqual(names, ["class Service 3-15", "method Service.constructor 4-4", "method Service.find 12-14", "method Service.list 6-8"]);

  // The constructor param property is a field, so `this.repo.all()` is an
  // alias call on `Repo` — the same edge the heuristic finds.
  assert.ok(shape(svc).calls.includes("Service.list Repo.all(@repo)"), shape(svc).calls.join(" · "));
});

test("borrow — the borrowed rung and the heuristic agree on what a card would print", { skip: !tsHome() && "no typescript on this machine (set ORC_TEST_TS_DIR)" }, () => {
  const root = tmpdir();
  copyDir(tsHome(), path.join(root, "node_modules", "typescript"));
  const files = { "src/service.ts": TS_SRC, "src/repo.ts": "export class Repo {\n  all(): string[] { return []; }\n  byId(id: unknown) { return String(id); }\n}\n" };

  const borrowed = X.extractBatch(build(files, root), { root });
  process.env.ORC_GRAPH_NO_BORROW = "1";
  let plain;
  try {
    plain = X.extractBatch(build(files, root), { root });
  } finally {
    delete process.env.ORC_GRAPH_NO_BORROW;
  }

  assert.equal(plain.get("src/service.ts").extractor, X.HEURISTIC);
  assert.deepStrictEqual(shape(borrowed.get("src/service.ts")), shape(plain.get("src/service.ts")));
  assert.deepStrictEqual(shape(borrowed.get("src/repo.ts")), shape(plain.get("src/repo.ts")));
});

test("borrow — ORC_GRAPH_NO_BORROW forces the heuristic, whatever the machine has", () => {
  const root = tmpdir();
  const ts = tsHome();
  if (ts) copyDir(ts, path.join(root, "node_modules", "typescript"));
  const items = build({ "src/service.ts": TS_SRC, "src/main.go": "package main\n\nfunc main() {\n\tprintln(1)\n}\n" }, root);

  process.env.ORC_GRAPH_NO_BORROW = "1";
  try {
    const out = X.extractBatch(items, { root });
    for (const [, r] of out) assert.equal(r.extractor, X.HEURISTIC, JSON.stringify([...out.keys()]));
  } finally {
    delete process.env.ORC_GRAPH_NO_BORROW;
  }
});

test("borrow — a file the borrowed parser cannot read falls back PER FILE, never for the batch", { skip: !tsHome() && "no typescript on this machine (set ORC_TEST_TS_DIR)" }, () => {
  const root = tmpdir();
  copyDir(tsHome(), path.join(root, "node_modules", "typescript"));
  const items = build({ "src/service.ts": TS_SRC }, root);
  // The walker reads the SOURCE it is handed; a record it cannot build is an
  // empty record, and the rest of the batch is still exact.
  items.push({ rel: "src/broken.ts", abs: path.join(root, "src", "broken.ts"), lang: "ts", src: null });
  const out = X.extractBatch(items, { root });
  assert.match(out.get("src/service.ts").extractor, /^typescript@\d/);
  assert.equal(out.get("src/broken.ts").error, "extract-failed");
});

test("borrow — Go: `go/parser` reads decls, receivers, embedding and imports", { skip: !X._findGo() && "no Go toolchain on PATH" }, () => {
  const root = tmpdir();
  const GO = [
    "package store", //                                  1
    "", //                                               2
    'import "fmt"', //                                   3
    "", //                                               4
    "type Base struct{}", //                             5
    "", //                                               6
    "func (b *Base) Label() string {", //                 7
    '\treturn fmt.Sprintf("base")', //                    8
    "}", //                                              9
    "", //                                              10
    "type Store struct {", //                           11
    "\tBase", //                                        12
    "\trows []string", //                               13
    "}", //                                             14
    "", //                                              15
    "func (s *Store) List() []string {", //              16
    "\treturn s.rows", //                               17
    "}", //                                             18
  ].join("\n");
  const abs = path.join(root, "store.go");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(abs, GO);
  const out = X.extractBatch([{ rel: "store.go", abs, lang: "go", src: GO }], { root });
  const r = out.get("store.go");
  assert.match(r.extractor, /^go-ast@\d/);
  assert.deepStrictEqual(shape(r).symbols, ["class Base 5-5", "class Store 11-14", "method Base.Label 7-9", "method Store.List 16-18"]);
  // An EMBEDDED field is Go's inheritance: `Store` answers `Base.Label`.
  const store = (r.symbols || []).find((s) => s.qname === "Store");
  assert.deepStrictEqual(store.bases, ["Base"]);
  assert.deepStrictEqual(shape(r).imports, ["fmt:fmt<-fmt"]);
});
