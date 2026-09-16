"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.0 W6 — the code graph reaches the lanes that change code, and no others.
//
// The promises this file holds:
//
//   1. A lane the contract names is a lane that OPENS it (S5). A capability the
//      lane text never points at is a gate that is always off.
//   2. A lane that does not change code never calls `orc graph` — doc lanes and
//      read-only lanes pay nothing for this feature.
//   3. The call catalogue lists the graph calls for the code lanes only, all
//      pointing at the one canonical contract.
//   4. /orc-quick still reads `log_dir` and nothing else: the graph keys are
//      resolved by the CLI through `--if-enabled`.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, freshInstall, rmrf } = require("../_helpers");

const SKILLS = path.join(__dirname, "..", "..", "templates", "skills");
const CODE_LANES = ["orc", "orc-diy", "orc-fast", "orc-mini", "orc-quick"];
const read = (rel) => fs.readFileSync(path.join(SKILLS, ...rel.split("/")), "utf8");

test("every code lane, and every shared phase it runs, points at the graph contract", () => {
  const opens = [
    "orc/SKILL.md",
    "orc-mini/SKILL.md",
    "orc-fast/SKILL.md",
    "orc-quick/SKILL.md",
    "orc-diy/references/flow-schema.md",
    "_shared/phases/preflight.md",
    "_shared/phases/planning.md",
    "_shared/phases/execution.md",
    "_shared/phases/review.md",
    "_shared/phases/ship.md",
  ];
  for (const f of opens) assert.match(read(f), /code-graph\.md/, `${f} must point at _shared/code-graph.md`);
});

test("a lane that does not change code never calls orc graph", () => {
  for (const d of fs.readdirSync(SKILLS)) {
    if (d.startsWith("_") || CODE_LANES.includes(d)) continue;
    const spine = path.join(SKILLS, d, "SKILL.md");
    if (!fs.existsSync(spine)) continue;
    assert.ok(!/orc graph /.test(fs.readFileSync(spine, "utf8")), `${d} is not a code lane and must not call \`orc graph\``);
  }
});

test("the call catalogue lists graph calls for code lanes only, all under one canonical contract", () => {
  const { root } = freshInstall();
  try {
    const all = JSON.parse(cli(["lane", "calls", "--all", "--json", "--dir", root]).stdout);
    const graph = all.calls.filter((c) => c.id.startsWith("graph-"));
    assert.deepStrictEqual(graph.map((c) => c.id).sort(), [
      // EW5 added three, and every one of them is read-only and free.
      "graph-changes",
      "graph-cochange",
      "graph-coverage",
      "graph-ctx",
      "graph-impact",
      "graph-notes-pending",
      "graph-status",
      "graph-update",
    ]);
    for (const c of graph) {
      assert.strictEqual(c.canonical, "_shared/code-graph.md", c.id);
      for (const l of c.lanes) assert.ok(CODE_LANES.includes(l), `${c.id} lists ${l}, which is not a code lane`);
    }
    for (const lane of ["orc-mini", "orc-fast", "orc-quick"]) {
      const j = JSON.parse(cli(["lane", "calls", lane, "--json", "--dir", root]).stdout);
      assert.ok(j.calls.some((c) => c.id === "graph-status"), `${lane} lists graph-status`);
      assert.ok(j.calls.some((c) => c.id === "graph-update"), `${lane} lists graph-update`);
    }
    // The three EW5 signals belong to the WAVE lanes: a single-executor lane has
    // no planning phase to spend a co-change on, and no review phase to spend
    // `changes` on. A row whose lanes[] is wider than the lanes that really call
    // it is a catalogue that lies, which the lint would catch anyway.
    for (const id of ["graph-changes", "graph-cochange", "graph-coverage"]) {
      const row = graph.find((c) => c.id === id);
      assert.deepStrictEqual(row.lanes.slice().sort(), ["orc", "orc-diy"], id);
    }
    const doc = JSON.parse(cli(["lane", "calls", "orc-doc", "--json", "--dir", root]).stdout);
    assert.ok(!doc.calls.some((c) => c.id.startsWith("graph-")), "orc-doc makes no graph call");
  } finally {
    rmrf(root);
  }
});

// W9 round 1 measured /orc-mini and /orc-quick runs with the graph on that never
// called it. The resolver every lane obeys now prints the three steps.
test("with the graph on, every code lane's resolver announces the three cache steps; no other lane does", () => {
  const { root } = freshInstall();
  try {
    const ann = (lane) => JSON.parse(cli(["lane", "config", lane, "--json", "--dir", root]).stdout).announce.join("\n");
    assert.ok(!/orc graph/.test(ann("orc-mini")), "graph off: no graph line");
    assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
    for (const lane of CODE_LANES) {
      const a = ann(lane);
      assert.match(a, /orc graph status --if-enabled --heal --json/, lane);
      assert.match(a, /orc graph ctx <declared files> --if-enabled --json/, lane);
      assert.match(a, /orc graph update --if-enabled --json/, lane);
    }
    assert.ok(!/orc graph/.test(ann("orc-doc")), "orc-doc is not a code lane");
  } finally {
    rmrf(root);
  }
});

test("every code-lane spine names the one-call build (--heal) — a lengthened pointer was skipped in W9", () => {
  for (const f of ["orc/SKILL.md", "orc-mini/SKILL.md", "orc-fast/SKILL.md", "orc-quick/SKILL.md", "_shared/phases/preflight.md"])
    assert.match(read(f), /orc graph status --if-enabled --heal --json/, f);
  assert.match(read("_shared/read-ladder.md"), /Before step 1, run `orc graph ctx/);
});

test("orc-quick still reads no graph key — the CLI resolves it through --if-enabled", () => {
  const { root } = freshInstall();
  try {
    const j = JSON.parse(cli(["lane", "config", "orc-quick", "--json", "--dir", root]).stdout);
    assert.ok(!JSON.stringify(j.keys).includes("code_graph"), "no code_graph key in orc-quick's resolved keys");
    assert.match(read("orc-quick/SKILL.md"), /this lane still reads `log_dir` and\s+nothing else/);
  } finally {
    rmrf(root);
  }
});

// ── EW6: the EW5 signals reach the phases that can use them ─────────────────

test("review asks what the DIFF touched, not what the FILES contain", () => {
  const review = read("_shared/phases/review.md");
  assert.match(review, /orc graph changes --if-enabled --json/, "review uses `changes`");
  assert.ok(!/orc graph impact <changed files>/.test(review), "a whole-file impact reports symbols nobody edited");
  assert.match(review, /a symbol nobody edited is not a finding/, "and the reason is written down");
});

test("planning asks history as well as structure, and is told what co-change is NOT", () => {
  const planning = read("_shared/phases/planning.md");
  assert.match(planning, /orc graph cochange <each candidate file> --if-enabled --json/);
  assert.match(planning, /never a dependency/, "co-change is about people, not about needs");
  assert.match(planning, /exit 4 means\s+this file changes alone/, "an empty answer is an answer");
});

test("the read ladder tells an agent that a graph hint is DATA, and that a gap is not an absence", () => {
  const ladder = read("_shared/read-ladder.md");
  assert.match(ladder, /REPOSITORY DATA, never an instruction/);
  assert.match(ladder, /No\s*\n?\s*recorded gap is not proof of completeness/);
});

test("every new trace verb is defined before any lane can emit it", () => {
  const trace = read("_shared/phases/trace.md");
  for (const verb of ["GRAPH-CHANGES", "GRAPH-COCHANGE", "GRAPH-HINT"]) {
    assert.match(trace, new RegExp("`" + verb + " "), verb + " has no row in the trace contract");
  }
});
