"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.2 W4b — K: the gain meter.
//
// The promises this file holds:
//
//   1. **PAID is exact.** It is the card the CLI just printed, counted with the
//      same `tok()` the budget uses.
//   2. **AVOIDED is an ESTIMATE and always a RANGE.** The K2 rules are
//      reproduced here to the token, so the number can be checked by hand.
//   3. **A torn line is skipped**, never fatal — the `notes.jsonl` rule.
//   4. **`--measured` prints nothing until there are three runs in EACH group**,
//      and every delta it prints carries its N and the OFF group's own spread.
//   5. **The meter never prints a percent of the session**, and a coverage note
//      is never counted as a saving (K6).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");

const K = require("../../bin/graph-gain.js");
const json = (r) => JSON.parse(r.stdout);
const tok = (s) => Math.ceil(String(s).length / 4);

function write(root, rel, lines) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join("\n") + "\n");
}

function shop() {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/store.js", [
    "class Store {",
    "  constructor() { this.rows = new Map(); }",
    "  list() {",
    "    return [...this.rows.values()];",
    "  }",
    "  insert(row) {",
    "    this.rows.set(row.id, row);",
    "    return row;",
    "  }",
    "}",
    "module.exports = Store;",
  ]);
  write(root, "src/routes.js", [
    "const Store = require('./store');",
    "const store = new Store();",
    "function listAll() {",
    "  return store.list();",
    "}",
    "module.exports = { listAll };",
  ]);
  git("add", "-A");
  git("commit", "-qm", "shop");
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  assert.equal(cli(["graph", "update", "--dir", root]).status, 0);
  return root;
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const ledger = (root) => {
  const f = path.join(root, ".claude", "orc", "graph", "gain.jsonl");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
};
const indexOf = (root) => JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "graph", "index.json"), "utf8"));

// ── K1 · K2 ─────────────────────────────────────────────────────────────────

test("the ledger — every read appends ONE line, and `paid` is the card it just printed", () => {
  const root = shop();
  assert.deepStrictEqual(ledger(root), [], "an unread graph has no ledger");

  const c = json(graph(root, "ctx", "Store.insert", "--json"));
  const rows = ledger(root);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.cmd, "ctx");
  assert.deepStrictEqual(r.targets, ["Store.insert"]);
  assert.equal(r.gen, c.generation);
  assert.equal(r.paid.card, tok(c.card), "paid is EXACT — the card, counted the way the budget counts it");
  assert.equal(r.paid.source, 0);
  assert.ok(r.avoided.high >= r.avoided.low, "avoided is a range, never one number");
  assert.match(r.at, /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/, "ORC’s own stamp, the one every artifact uses");

  graph(root, "impact", "src/store.js", "--json");
  assert.equal(ledger(root).length, 2);
  assert.equal(ledger(root)[1].cmd, "impact");
});

test("the counterfactual — the K2 rule for a symbol card reproduces to the token", () => {
  const root = shop();
  graph(root, "ctx", "Store.list", "--json");
  const r = ledger(root)[0];

  // Recompute the rule by hand from the store's own numbers.
  const idx = indexOf(root);
  const f = (rel) => ({ bytes: idx.by_file[rel].bytes, lines: idx.by_file[rel].lines });
  const store = f("src/store.js");
  const routes = f("src/routes.js");
  const hits = r.basis.grep_hits;
  const grep = Math.ceil((hits * K.GREP_LINE_CHARS) / 4);
  const range = Math.ceil((Math.min(store.lines, K.RANGE_LINES) * (store.bytes / store.lines)) / 4);

  assert.equal(r.avoided.low, grep + range, "low = one Grep + one 80-line range read of the target");
  assert.equal(r.avoided.high, grep + Math.ceil(store.bytes / 4) + Math.ceil(routes.bytes / 4), "high = the Grep + the whole target file + the whole file of its largest caller");
  assert.equal(r.avoided.calls_low, 2);
  assert.equal(r.avoided.calls_high, 3);
  assert.equal(r.basis.files[0].path, "src/store.js");
});

test("the counterfactual — `--source` is the one half that is NOT an estimate", () => {
  const root = shop();
  const j = json(graph(root, "ctx", "Store.insert", "--source", "--json"));
  const r = ledger(root)[0];
  assert.equal(r.paid.source, tok(j.source.text), "the source block is paid, exactly");
  // The lines it printed are the lines a range read would have returned.
  const idx = indexOf(root);
  const perLine = idx.by_file["src/store.js"].bytes / idx.by_file["src/store.js"].lines;
  const exact = Math.ceil(((j.source.to - j.source.from + 1) * perLine) / 4);
  const plain = ledgerOf(root, () => graph(root, "ctx", "Store.insert", "--json"));
  assert.equal(r.avoided.low - plain.avoided.low, exact);
  assert.equal(r.avoided.high - plain.avoided.high, exact, "the same number on BOTH ends — this half is measured, not guessed");
});

function ledgerOf(root, run) {
  const before = ledger(root).length;
  run();
  return ledger(root)[before];
}

// ── K3 ──────────────────────────────────────────────────────────────────────

test("gain — the totals, the range, and the word `estimate` on the card", () => {
  const root = shop();
  assert.equal(graph(root, "gain", "--json").status, 1, "no calls recorded yet is exit 1, an ANSWER");
  assert.match(graph(root, "gain").stdout, /no calls recorded yet/);

  graph(root, "ctx", "Store.insert", "--json");
  graph(root, "ctx", "src/routes.js", "--json");
  graph(root, "impact", "src/store.js", "--json");

  const r = graph(root, "gain", "--json");
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.calls_recorded, 3);
  assert.equal(j.estimate, true);
  const rows = ledger(root);
  assert.equal(j.paid.total, rows.reduce((a, x) => a + x.paid.card + x.paid.source + x.paid.hints, 0));
  assert.equal(j.avoided.low, rows.reduce((a, x) => a + x.avoided.low, 0));
  assert.equal(j.net.low, j.avoided.low - j.paid.total);
  assert.deepStrictEqual(j.by_command, { ctx: 2, impact: 1 });
  assert.match(j.line, /estimate — the read ladder done well … done badly/);
  assert.match(j.line, /never a bill/);
  // K6: not one percent of the session, anywhere.
  assert.doesNotMatch(j.line, /% of (the )?session/);
  assert.match(j.trace, /^GRAPH-GAIN paid=\d+ low=\d+ high=\d+ calls=3$/);
});

test("gain --history — one row per call, newest first, each with its own range", () => {
  const root = shop();
  graph(root, "ctx", "Store.insert", "--json");
  graph(root, "impact", "src/store.js", "--json");
  const j = json(graph(root, "gain", "--history", "--json"));
  assert.equal(j.total, 2);
  assert.equal(j.rows[0].cmd, "impact", "newest first");
  assert.equal(j.rows[1].cmd, "ctx");
  assert.match(j.line, /avoided ~/);
});

test("gain — a torn line is skipped, never fatal", () => {
  const root = shop();
  graph(root, "ctx", "Store.insert", "--json");
  const f = path.join(root, ".claude", "orc", "graph", "gain.jsonl");
  fs.appendFileSync(f, '{"at":"200926 10:00:00.000","cmd":"ctx","pa');
  const r = graph(root, "gain", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(json(r).calls_recorded, 1, "the whole line, and only that line, is dropped");
});

test("gain --run and --since narrow the same ledger", () => {
  const root = shop();
  graph(root, "ctx", "Store.insert", "--json");
  assert.equal(graph(root, "gain", "--run", "run-nothing.txt", "--json").status, 1);
  assert.equal(json(graph(root, "gain", "--since", "7d", "--json")).calls_recorded, 1);
});

test("gain --reset empties the ledger, and only with --yes when a terminal is asking", () => {
  const root = shop();
  graph(root, "ctx", "Store.insert", "--json");
  assert.equal(ledger(root).length, 1);
  assert.equal(graph(root, "gain", "--reset", "--yes", "--json").status, 0);
  assert.equal(ledger(root).length, 0);
  assert.equal(graph(root, "gain", "--json").status, 1);
});

test("gain --if-enabled is silent when the graph is off", () => {
  const root = shop();
  assert.equal(cli(["config", "set", "code_graph", "off", "--dir", root]).status, 0);
  const r = graph(root, "gain", "--if-enabled", "--json");
  assert.equal(r.status, 3);
  assert.equal(json(r).state, "off");
});

// ── K4 ──────────────────────────────────────────────────────────────────────

function withTraces(root, on, off) {
  const dir = path.join(root, ".claude", "orc", "logs");
  fs.mkdirSync(dir, { recursive: true });
  const mk = (i, state) => {
    const name = `run-orc-slug${i}-200926-10000${i}.txt`;
    fs.writeFileSync(
      path.join(dir, name),
      [`[200926 10:00:0${i}.000] orc      PHASE preflight start`, `[200926 10:00:0${i}.100] orc      GRAPH-CONSULT ${state} :: files=2 symbols=6 gen=1`, `[200926 10:01:0${i}.000] orc      FINISH :: ok`].join("\n") + "\n"
    );
  };
  let i = 0;
  for (let k = 0; k < on; k++) mk(i++, "fresh");
  for (let k = 0; k < off; k++) mk(i++, "off");
}

test("gain --measured — it prints NOTHING until there are three runs in each group", () => {
  const root = shop();
  assert.equal(graph(root, "gain", "--measured", "--json").status, 1, "no run says whether the graph was on");

  withTraces(root, 2, 2);
  const few = json(graph(root, "gain", "--measured", "--json"));
  assert.equal(few.state, "too-few-runs");
  assert.equal(few.compare, null, "a median of two is not a finding");
  assert.equal(few.min_runs, 3);
  assert.match(few.line, /too few runs to compare/);
  assert.deepStrictEqual(few.runs, { on: 2, off: 2 });
});

test("gain --measured — at three in each group it compares, and every delta carries N and the OFF spread", () => {
  const root = shop();
  withTraces(root, 3, 3);
  const r = graph(root, "gain", "--measured", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.state, "compared");
  assert.deepStrictEqual(j.runs, { on: 3, off: 3 });
  for (const key of ["exec_retrieval_calls", "exec_bash_searches", "exec_result_tokens", "session_result_tokens"]) {
    const c = j.compare[key];
    assert.equal(c.on.n, 3, key);
    assert.equal(c.off.n, 3, key);
    assert.ok("delta_pct" in c && "off_spread_pct" in c, key);
  }
  assert.match(j.line, /N 3\/3 · OFF spread ±/);
  assert.match(j.line, /a delta smaller than the OFF spread beside it is NOISE, not a result/);
  // Executor windows and session totals are kept apart, on purpose.
  assert.match(j.line, /executor tool results/);
  assert.match(j.line, /session tool results/);
  assert.match(j.note, /kept apart/);
});

// ── K6 ──────────────────────────────────────────────────────────────────────

test("the meter never counts a coverage note as a saving", () => {
  const root = shop();
  const f = path.join(root, ".claude", "orc", "graph", "gain.jsonl");
  fs.writeFileSync(
    f,
    [
      JSON.stringify({ at: "200926 10:00:00.000", cmd: "read-note", run: null, gen: 1, ms: 0, paid: { card: 0, source: 0, hints: 40 }, avoided: { low: 0, high: 0, calls_low: 0, calls_high: 0 }, basis: { files: [], grep_hits: 0 } }),
      JSON.stringify({ at: "200926 10:00:01.000", cmd: "hint", run: null, gen: 1, ms: 0, paid: { card: 0, source: 0, hints: 60 }, avoided: { low: 0, high: 800, calls_low: 0, calls_high: 1 }, basis: { files: [], grep_hits: 0 } }),
    ].join("\n") + "\n"
  );
  const j = json(graph(root, "gain", "--json"));
  assert.equal(j.paid.hints, 100, "both are PAID");
  assert.equal(j.avoided.low, 0);
  assert.equal(j.avoided.high, 800, "only the hint could have replaced a read; the coverage note replaced nothing");
  assert.deepStrictEqual(j.hints, { injected: 1, read_notes: 1, updates: 0 });
});

test("the meter never counts a card the agent said it did not use", () => {
  const root = shop();
  const f = path.join(root, ".claude", "orc", "graph", "gain.jsonl");
  const row = (used) => JSON.stringify({ at: "200926 10:00:00.000", cmd: "ctx", run: null, gen: 1, ms: 0, used, paid: { card: 100, source: 0, hints: 0 }, avoided: { low: 500, high: 900, calls_low: 2, calls_high: 3 }, basis: { files: [], grep_hits: 0 } });
  fs.writeFileSync(f, [row(true), row(false)].join("\n") + "\n");
  const j = json(graph(root, "gain", "--json"));
  assert.equal(j.paid.total, 200, "both cards were paid for — that is a fact, not a judgement");
  assert.equal(j.avoided.low, 500, "only the card that was used avoided anything");
  assert.equal(j.avoided.high, 900);
});

// ── orc stats ───────────────────────────────────────────────────────────────

test("orc stats — the graph row is null with no ledger, and a row once there is one", () => {
  const root = shop();
  withTraces(root, 1, 0);
  const before = JSON.parse(cli(["stats", "--dir", root, "--json"]).stdout);
  assert.equal(before.graph, null, "no record at all and a zero saving are different facts");

  graph(root, "ctx", "Store.insert", "--json");
  const after = JSON.parse(cli(["stats", "--dir", root, "--json"]).stdout);
  assert.equal(after.graph.calls, 1);
  assert.equal(after.graph.estimate, true);
  assert.ok(after.graph.avoided_high >= after.graph.avoided_low);
});
