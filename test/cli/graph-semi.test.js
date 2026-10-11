"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v2.2.0 — `code_graph: semi`. The graph is BUILT and KEPT CURRENT (status
// --heal, update, the SubagentStop hook), but every lane-gated read
// (`--if-enabled`) answers exit 3 exactly as `off` does. A person who types a
// read without `--if-enabled` still gets an answer.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf } = require("../_helpers");
const { fixtureRepo } = require("./_graph-fixture");

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const j = (r) => JSON.parse(r.stdout);

function semiRepo() {
  const fx = fixtureRepo({ build: false });
  const r = cli(["config", "set", "code_graph", "semi", "--dir", fx.root]);
  assert.strictEqual(r.status, 0, r.stderr);
  return fx;
}

test("semi: config accepts semi and rejects half", () => {
  const { root } = semiRepo();
  try {
    assert.notStrictEqual(cli(["config", "set", "code_graph", "half", "--dir", root]).status, 0);
  } finally {
    rmrf(root);
  }
});

test("semi: status --heal builds the index, then answers exit 3 state semi; update runs; reads are gated", () => {
  const { root, claudeDir } = semiRepo();
  try {
    const s = graph(root, "status", "--if-enabled", "--heal", "--json", "--brief");
    assert.strictEqual(s.status, 3, s.stdout + s.stderr);
    assert.ok(fs.existsSync(path.join(claudeDir, "orc", "graph", "meta.json")), "the heal built the index");
    const o = j(s);
    assert.strictEqual(o.state, "semi");
    assert.match(o.line, /^graph: semi — kept current \(\d+ files? · \d+ symbols?\); lanes do not read it$/);
    assert.match(o.trace, /^GRAPH-CONSULT semi :: files=\d+ symbols=\d+ gen=\d+$/);

    assert.strictEqual(graph(root, "update", "--if-enabled", "--json").status, 0);

    const gated = graph(root, "ctx", "searchByItemPrefix", "--if-enabled", "--json");
    assert.strictEqual(gated.status, 3);
    assert.strictEqual(j(gated).line, "graph: semi (kept current; lanes do not read it)");
    assert.match(j(gated).trace, /^GRAPH-CTX off :: mode=semi$/);
    const typed = graph(root, "ctx", "searchByItemPrefix", "--json");
    assert.strictEqual(typed.status, 0, typed.stdout + typed.stderr);
    assert.ok(j(typed).card, "a person may read a semi graph");

    for (const verb of ["map", "changes", "gain"]) {
      const r = graph(root, verb, "--if-enabled", "--json");
      assert.strictEqual(r.status, 3, `${verb} --if-enabled is gated under semi`);
    }
  } finally {
    rmrf(root);
  }
});

test("semi: the graph-status probe carries update_step", () => {
  const { root } = semiRepo();
  const probe = () => {
    const r = cli(["lane", "config", "orc-quick", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stderr);
    return j(r).probes["graph-status"];
  };
  try {
    const p = probe();
    assert.ok(Object.prototype.hasOwnProperty.call(p, "update_step"));
    assert.strictEqual(p.update_step, "hook", "semi + hooks on");
    cli(["config", "set", "code_graph", "on", "--dir", root]);
    cli(["config", "set", "code_graph_notes", "end", "--dir", root]);
    assert.strictEqual(probe().update_step, "lane", "on + notes end");
    cli(["config", "set", "code_graph", "off", "--dir", root]);
    assert.strictEqual(probe().update_step, "none", "off");
  } finally {
    rmrf(root);
  }
});
