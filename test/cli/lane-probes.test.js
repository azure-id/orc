"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf } = require("../_helpers");
const { fixtureRepo } = require("./_graph-fixture");

// ── v2.0.0 T20 — `probes{}` in `orc lane config <lane> --json` ─────────────
//
// One preflight call instead of 4–6. Each entry must be the stand-alone
// command's OWN answer: the same exit code, the same branch fields, and the
// same `line` where the command has one. The separate commands still work.

const j = (r) => JSON.parse(r.stdout);

// The stand-alone form of each probe. `--dir` is added by the runner.
const STANDALONE = {
  "wiki-status": ["wiki", "status"],
  "pattern-status": ["pattern", "status"],
  "gotcha-status": ["gotcha", "status"],
  "pact-status": ["pact", "status"],
  "boundary-status": ["boundary", "status"],
  "aftermath-status": ["aftermath", "status"],
  "diy-status": ["diy", "status"],
  "run-list": ["run", "list"],
  "graph-status": ["graph", "status", "--if-enabled", "--brief"],
  "rules-slice": (lane) => ["rules", "slice", "--lane", lane],
  "extra-slot": ["extra", "resolve", "--slot", "quick-executor"],
};
// Fields the probe DERIVES from the answer rather than copies.
const DERIVED = { "pattern-status": ["langs"], "graph-status": ["heal_needed"] };
// The probe set each lane is REQUIRED to carry (W0's measured preflight calls).
const EXPECT = {
  orc: ["wiki-status", "pattern-status", "gotcha-status", "pact-status", "boundary-status", "aftermath-status", "graph-status", "rules-slice"],
  "orc-mini": ["wiki-status", "pattern-status", "gotcha-status", "graph-status", "rules-slice"],
  "orc-fast": ["wiki-status", "pattern-status", "gotcha-status", "graph-status", "rules-slice"],
  "orc-quick": ["wiki-status", "pattern-status", "graph-status", "rules-slice", "extra-slot"],
};

function project() {
  const fx = fixtureRepo({ history: false });
  const orc = path.join(fx.claudeDir, "orc");
  fs.mkdirSync(path.join(orc, "patterns"), { recursive: true });
  fs.writeFileSync(path.join(orc, "patterns", "express-pattern.md"), "# Express — project pattern\n\nCONVENTION: one router per file.\n");
  fs.writeFileSync(path.join(orc, "gotchas.md"), ["## G-001 · express · repair", "- trigger: t1", "- hits: 2", "- last_seen: 05-08-2026", ""].join("\n"));
  return fx;
}

function compare(root, lane) {
  const r = cli(["lane", "config", lane, "--json", "--dir", root]);
  assert.strictEqual(r.status, 0, lane + ": lane config keeps its own exit code");
  const o = JSON.parse(r.stdout);
  assert.deepStrictEqual(Object.keys(o.probes), EXPECT[lane], lane + ": the probe set, in order");
  for (const [id, p] of Object.entries(o.probes)) {
    const a = STANDALONE[id];
    const s = cli([...(typeof a === "function" ? a(lane) : a), "--json", "--dir", root]);
    const sj = JSON.parse(s.stdout);
    assert.strictEqual(p.exit, s.status, `${lane} ${id}: the probe's own exit code`);
    assert.ok(!("error" in p), `${lane} ${id}: no error`);
    assert.ok(typeof p.line === "string" && p.line.length, `${lane} ${id}: one line`);
    if (typeof sj.line === "string") assert.strictEqual(p.line, sj.line, `${lane} ${id}: the command's own line, verbatim`);
    for (const k of Object.keys(p)) {
      if (k === "exit" || k === "line" || (DERIVED[id] || []).includes(k)) continue;
      assert.deepStrictEqual(p[k], sj[k], `${lane} ${id}: field ${k} is the stand-alone value`);
    }
    // BRIEF: never the whole answer.
    assert.ok(JSON.stringify(p).length < JSON.stringify(sj).length || JSON.stringify(sj).length < 200, `${lane} ${id}: brief`);
  }
  return o;
}

test("probes{}: every entry is the stand-alone command's answer (orc, orc-mini, orc-quick, orc-fast)", () => {
  const { root } = project();
  try {
    for (const lane of Object.keys(EXPECT)) compare(root, lane);
    const o = j(cli(["lane", "config", "orc", "--json", "--dir", root]));
    assert.strictEqual(o.probes["graph-status"].state, "fresh");
    assert.strictEqual(o.probes["graph-status"].heal_needed, false);
    assert.deepStrictEqual(o.probes["pattern-status"].langs, ["express"]);
    assert.strictEqual(o.probes["gotcha-status"].count, 1);
    assert.strictEqual(o.probes["pact-status"].exit, 3, "no ledger is an ANSWER, kept as data");
  } finally {
    rmrf(root);
  }
});

test("probes{}: a drifted graph is reported, not healed — the probe is READ-ONLY", () => {
  const { root, claudeDir } = project();
  try {
    const meta = path.join(claudeDir, "orc", "graph", "meta.json");
    const before = fs.existsSync(meta) ? fs.readFileSync(meta, "utf8") : null;
    fs.appendFileSync(path.join(root, "src", "auth.js"), "\n// drift\n");
    const o = compare(root, "orc-mini");
    const g = o.probes["graph-status"];
    assert.strictEqual(g.state, "drifted");
    assert.strictEqual(g.exit, 2);
    assert.strictEqual(g.heal_needed, true, "the lane still makes the one --heal call");
    if (before !== null) assert.strictEqual(fs.readFileSync(meta, "utf8"), before, "lane config wrote nothing");
  } finally {
    rmrf(root);
  }
});

test("probes{}: a failing probe is {exit, error}, never a thrown error; --no-probes and --probes-full", () => {
  const { root } = project();
  try {
    // `--global` makes every project-scoped probe refuse. lane config still answers.
    const g = cli(["lane", "config", "orc-mini", "--json", "--global"]);
    assert.strictEqual(g.status, 0);
    const w = j(g).probes["wiki-status"];
    assert.strictEqual(w.exit, 1);
    assert.match(w.error, /project-scoped/);
    assert.ok(!("probes" in j(cli(["lane", "config", "orc", "--json", "--no-probes", "--dir", root]))));
    const full = j(cli(["lane", "config", "orc-mini", "--json", "--probes-full", "--dir", root]));
    assert.strictEqual(full.probes["gotcha-status"].full.gotchas.length, 1, "--probes-full carries the whole answer");
    // The text form prints one line per probe.
    assert.match(cli(["lane", "config", "orc", "--dir", root]).stdout, /Probes[\s\S]*wiki-status\s+exit 0/);
  } finally {
    rmrf(root);
  }
});

// Every lane: the 1.9.2 fields are unchanged. `probes` is LAST, and the answer
// without it is byte-for-byte the `--no-probes` answer.
test("probes{}: every lane keeps its 1.9.2 fields, byte-identical, with probes appended last", () => {
  const { root } = project();
  try {
    const lanes = j(cli(["lane", "list", "--json"])).lanes.map((l) => l.lane);
    assert.ok(lanes.length > 20);
    for (const lane of lanes) {
      const a = JSON.parse(cli(["lane", "config", lane, "--json", "--dir", root]).stdout);
      const b = cli(["lane", "config", lane, "--json", "--no-probes", "--dir", root]).stdout;
      const keys = Object.keys(a);
      assert.strictEqual(keys[keys.length - 1], "probes", lane + ": probes is the last field");
      delete a.probes;
      assert.strictEqual(JSON.stringify(a, null, 2) + "\n", b, lane + ": the rest is the 1.9.2 answer");
    }
  } finally {
    rmrf(root);
  }
});
