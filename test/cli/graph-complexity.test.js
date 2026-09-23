"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.9.1 W2 — V1, V2 and V3: the CLI computes the line.
//
// The promises this file holds:
//
//   1. **The thresholds live in ONE place.** `bin/graph-signals.js` holds the
//      four constants with their reasons; the lane prints what it is handed.
//      Each one is tested at its EDGE — one under, one at — because a threshold
//      nobody tested at its edge is a threshold nobody knows the value of.
//   2. **`maybe` alone never trips a verdict.** An AMBIGUOUS caller is a call
//      the resolver could not place; recommending the full lane on it would
//      recommend it for being unsure.
//   3. **The line is the CLI's.** Its grammar is asserted here word for word,
//      because `orc-mini/references/complexity.md` §3 quotes it.
//   4. **One call, one process.** `impact --complexity` answers what `impact`
//      plus one `cochange` per declared file used to answer, with ONE
//      `rev-parse` however many files it is given.
//   5. **`changes` computes its own two lines**, and `--files=` restricts the
//      rows, the totals and both lines together.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");
const SIG = require("../../bin/graph-signals.js");

const json = (r) => JSON.parse(r.stdout);
const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);

function write(root, rel, body) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Array.isArray(body) ? body.join("\n") + "\n" : body);
}

// A repository whose fan-out is built to order: `core.js` exports one function
// and `n` files call it, one call each. That makes both spread (caller files)
// and weight (callers) exactly countable at the threshold.
function repo(opts) {
  const o = opts || {};
  const callerFiles = o.callerFiles === undefined ? 1 : o.callerFiles;
  const callsEach = o.callsEach === undefined ? 1 : o.callsEach;
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/core.js", ["export function coreOp(x) { return x + 1; }"]);
  for (let i = 0; i < callerFiles; i++) {
    const body = ["import { coreOp } from '../core.js';"];
    for (let k = 0; k < callsEach; k++) body.push(`export function use${i}_${k}(v) { return coreOp(v + ${k}); }`);
    write(root, `src/callers/c${i}.js`, body);
  }
  if (o.extra) for (const [rel, body] of Object.entries(o.extra)) write(root, rel, body);
  git("add", "-A");
  git("commit", "-qm", "base");
  // Extra commits that pair `src/partner.js` with `src/core.js`, so co-change
  // has a partner to find — `n` of them, so the threshold can be tested at its
  // edge from either side.
  for (let i = 0; i < (o.pairCommits || 0); i++) {
    fs.appendFileSync(path.join(root, "src", "core.js"), `// pass ${i}\n`);
    write(root, "src/partner.js", [`export const PARTNER = ${i};`]);
    git("add", "-A");
    git("commit", "-qm", `pair ${i}`);
  }
  assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);
  assert.equal(graph(root, "update", "--json").status, 0);
  return root;
}

const complexity = (root, files, ...a) => json(graph(root, "impact", ...files, "--complexity", "--json", "--brief", ...a)).complexity;

// ── the four thresholds, each at its edge ───────────────────────────────────

test("complexity — caller FILES: three is mini-ok, four recommends the full lane", () => {
  const under = complexity(repo({ callerFiles: 3 }), ["src/core.js"]);
  assert.equal(under.numbers.caller_files_outside, 3);
  assert.equal(under.verdict, "mini-ok");

  const at = complexity(repo({ callerFiles: SIG.COMPLEXITY_CALLER_FILES }), ["src/core.js"]);
  assert.equal(at.numbers.caller_files_outside, SIG.COMPLEXITY_CALLER_FILES);
  assert.equal(at.verdict, "recommend-orc");
  assert.ok(at.why.includes(`callers in ${SIG.COMPLEXITY_CALLER_FILES} files (≥ ${SIG.COMPLEXITY_CALLER_FILES})`));
});

test("complexity — caller COUNT: seven is mini-ok, eight recommends the full lane", () => {
  // Three files, so the FILES threshold cannot be what tripped it.
  const under = complexity(repo({ callerFiles: 3, callsEach: 2 }), ["src/core.js"]);
  assert.equal(under.numbers.callers_outside, 6);
  assert.equal(under.verdict, "mini-ok");

  const at = complexity(repo({ callerFiles: 3, callsEach: 3 }), ["src/core.js"]);
  assert.equal(at.numbers.callers_outside, 9);
  assert.equal(at.verdict, "recommend-orc");
  assert.ok(at.why.includes(`callers ${at.numbers.callers_outside} (≥ ${SIG.COMPLEXITY_CALLERS})`));
  assert.ok(!at.why.some((w) => w.startsWith("callers in ")), "three caller files must not trip the spread threshold");
});

test("complexity — co-change: two commits together is mini-ok, three is not", () => {
  const under = complexity(repo({ pairCommits: 2 }), ["src/core.js"]);
  assert.deepStrictEqual(under.numbers.cochange_missing, []);
  assert.equal(under.verdict, "mini-ok");

  const at = complexity(repo({ pairCommits: SIG.COMPLEXITY_COCHANGE_MIN }), ["src/core.js"]);
  assert.equal(at.numbers.cochange_missing.length, 1);
  assert.equal(at.numbers.cochange_missing[0].path, "src/partner.js");
  assert.equal(at.verdict, "recommend-orc");
  assert.ok(at.why.includes(`cochange src/partner.js x${SIG.COMPLEXITY_COCHANGE_MIN} not in plan`));
});

test("complexity — a partner NAMED in the plan is not a missing partner", () => {
  const root = repo({ pairCommits: SIG.COMPLEXITY_COCHANGE_MIN });
  const both = complexity(root, ["src/core.js", "src/partner.js"]);
  assert.deepStrictEqual(both.numbers.cochange_missing, [], "the plan already names it");
});

test("complexity — one risk class alone recommends the full lane", () => {
  const r = complexity(repo({ callerFiles: 1 }), ["src/core.js"], "--risk=auth@src/core.js:1");
  assert.equal(r.verdict, "recommend-orc");
  assert.deepStrictEqual(r.numbers.risk, [{ class: "auth", at: "src/core.js:1" }]);
  assert.equal(r.numbers.risk_given, true);
  assert.ok(r.why.includes("risk auth"));
});

test("complexity — an unparsable risk item is dropped and NAMED, never guessed at", () => {
  const r = complexity(repo({ callerFiles: 1 }), ["src/core.js"], "--risk=auth,NOT A CLASS,pii@a.js:2");
  assert.deepStrictEqual(r.numbers.risk.map((x) => x.class), ["auth", "pii"]);
  assert.ok(r.why.includes("risk item ignored: NOT A CLASS"));
});

test("complexity — without --risk= the verdict says so, so a reader knows it is partial", () => {
  const r = complexity(repo({ callerFiles: 1 }), ["src/core.js"]);
  assert.equal(r.numbers.risk_given, false);
  assert.equal(r.why[r.why.length - 1], "risk: not given");
  assert.match(r.line, /risk not given/);
});

test("complexity — an AMBIGUOUS caller never trips a threshold on its own", () => {
  // Two files define `coreOp`, so every call to it is AMBIGUOUS and none of
  // them is confident.
  const root = repo({
    callerFiles: 3,
    extra: { "src/other.js": ["export function coreOp(x) { return x - 1; }"] },
  });
  const r = complexity(root, ["src/core.js"]);
  assert.equal(r.verdict, "mini-ok", `maybe ${r.numbers.maybe} must not decide anything`);
  assert.ok(!r.why.some((w) => w.includes("maybe")), "maybe is reported, never a reason");
});

// ── the line ────────────────────────────────────────────────────────────────

test("complexity — the line is the grammar `complexity.md` §3 prints, word for word", () => {
  const mini = complexity(repo({ callerFiles: 1 }), ["src/core.js"], "--risk=");
  assert.equal(
    mini.line,
    `complexity: mini-ok — 1 files · confident callers ${mini.numbers.callers_outside} in ${mini.numbers.caller_files_outside} files` +
      ` · tests reach ${mini.numbers.tests_reaching} · risk none · cochange none`
  );

  const full = complexity(repo({ callerFiles: SIG.COMPLEXITY_CALLER_FILES }), ["src/core.js"], "--risk=auth@a.js:1");
  assert.equal(
    full.line,
    `complexity: recommend /orc — 1 files · callers ${full.numbers.callers_outside} in ${full.numbers.caller_files_outside} files` +
      ` · tests reach ${full.numbers.tests_reaching} · risk auth (a.js:1) · cochange none`
  );
});

test("complexity — `maybe` is printed only when there is one", () => {
  const none = complexity(repo({ callerFiles: 1 }), ["src/core.js"]);
  assert.ok(!/ · maybe /.test(none.line), none.line);
  const some = complexity(repo({ callerFiles: 3, extra: { "src/other.js": ["export function coreOp(x) { return x - 1; }"] } }), ["src/core.js"]);
  if (some.numbers.maybe > 0) assert.match(some.line, new RegExp(` · maybe ${some.numbers.maybe} · `));
});

test("complexity — the thresholds travel WITH the answer, so a reader can check it", () => {
  const r = complexity(repo({ callerFiles: 1 }), ["src/core.js"]);
  assert.deepStrictEqual(r.thresholds, {
    caller_files: SIG.COMPLEXITY_CALLER_FILES,
    callers: SIG.COMPLEXITY_CALLERS,
    cochange_min: SIG.COMPLEXITY_COCHANGE_MIN,
  });
});

test("complexity — the trace is a new verb with every number on it", () => {
  const root = repo({ callerFiles: 2 });
  const r = json(graph(root, "impact", "src/core.js", "--complexity", "--json"));
  assert.match(r.trace, /^GRAPH-COMPLEXITY (mini-ok|recommend-orc) :: files=\d+ callers=\d+ caller_files=\d+ maybe=\d+ tests=\d+ risk=\d+ cochange=\d+ gen=\d+$/);
  assert.ok(!/gen=0$/.test(r.trace), "the generation is the one the answer was computed from, never 0");
});

// ── V3 — the facts ──────────────────────────────────────────────────────────

test("facts — one call carries what `graph_facts` needs, with `map` left for the lane", () => {
  const root = repo({ callerFiles: 2, pairCommits: SIG.COMPLEXITY_COCHANGE_MIN });
  const r = json(graph(root, "impact", "src/core.js", "--complexity", "--json", "--brief"));
  const f = r.facts;
  assert.equal(f.map, null, "the lane already holds the map card and fills it there");
  assert.equal(f.impact.length, 1);
  assert.deepStrictEqual(Object.keys(f.impact[0]).sort(), ["caller_files", "confident_callers", "file", "tests_reaching"]);
  assert.equal(f.cochange.length, 1);
  assert.equal(f.cochange[0].file, "src/core.js");
  assert.equal(f.cochange[0].partners[0].path, "src/partner.js");
  assert.equal(f.generation, r.generation);
});

test("facts and complexity survive --brief whole — they ARE the answer", () => {
  const root = repo({ callerFiles: 2, pairCommits: SIG.COMPLEXITY_COCHANGE_MIN });
  const full = json(graph(root, "impact", "src/core.js", "--complexity", "--json"));
  const brief = json(graph(root, "impact", "src/core.js", "--complexity", "--json", "--brief"));
  assert.deepStrictEqual(brief.complexity, full.complexity);
  assert.deepStrictEqual(brief.facts, full.facts);
  assert.ok(!brief.callers, "the row array is still dropped");
});

test("one call, one process — however many declared files, git is asked for HEAD once", () => {
  const root = repo({ callerFiles: 2, pairCommits: SIG.COMPLEXITY_COCHANGE_MIN });
  const claudeDir = path.join(root, ".claude");
  const Q = require("../../bin/graph-query.js");
  const model = Q.loadModel(claudeDir, root);
  // Warm the per-HEAD cache, so the measured call cannot be the one that builds it.
  SIG.graphCochange(claudeDir, root, { file: "src/core.js" });

  // Counted in this process, not through a stand-in on PATH: a `.cmd` shim
  // cannot be spawned without a shell on Windows. `graph-signals.js` binds
  // `spawnSync` when it loads, so the module is dropped from the cache and
  // loaded again over the counter.
  const cp = require("child_process");
  const real = cp.spawnSync;
  const calls = [];
  cp.spawnSync = function (cmd, a) {
    if (cmd === "git") calls.push((a || []).join(" "));
    return real.apply(this, arguments);
  };
  const key = require.resolve("../../bin/graph-signals.js");
  delete require.cache[key];
  try {
    const counted = require("../../bin/graph-signals.js");
    const r = counted.complexityOf(claudeDir, root, model, ["src/core.js", "src/partner.js", "src/callers/c0.js"], {});
    assert.equal(r.facts.cochange.length, 3);
  } finally {
    cp.spawnSync = real;
    delete require.cache[key];
  }
  assert.equal(calls.filter((c) => c.startsWith("rev-parse")).length, 1, `one HEAD question for three files, not one each: ${JSON.stringify(calls)}`);
  assert.deepStrictEqual(calls.filter((c) => c.startsWith("log")), [], "a warm per-HEAD cache is never rebuilt");
});

// ── V1 — changes ────────────────────────────────────────────────────────────

function touched() {
  const root = repo({ callerFiles: 2, extra: { "src/core.test.js": ["import { coreOp } from './core.js';", "it('works', () => coreOp(1));"] } });
  const p = path.join(root, "src", "core.js");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("return x + 1;", "return x + 2;"));
  fs.appendFileSync(path.join(root, "src", "callers", "c0.js"), "export function extra() { return 1; }\n");
  return root;
}

test("changes — totals count what the lane used to count for itself", () => {
  const r = json(graph(touched(), "changes", "--json", "--brief"));
  const t = r.totals;
  assert.equal(t.symbols, r.counts.high + r.counts.medium + r.counts.low);
  assert.equal(t.high, r.counts.high);
  assert.equal(t.not_in_graph, r.not_in_graph.length);
  assert.equal(t.tests, t.tests_by_kind.route + t.tests_by_kind.call + t.tests_by_kind.name, "a test file is counted ONCE, under its strongest edge");
  assert.ok(!r.symbols, "--brief drops the rows the totals replaced");
});

test("changes — blast_line, both forms, exactly as the lane prints them", () => {
  const r = json(graph(touched(), "changes", "--json"));
  const worst = r.symbols[0];
  assert.equal(
    r.blast_line,
    `blast radius   ${r.totals.symbols} symbol${r.totals.symbols === 1 ? "" : "s"} · callers ${r.totals.callers} in ${r.totals.caller_files} file${r.totals.caller_files === 1 ? "" : "s"}` +
      (r.totals.maybe ? ` · maybe ${r.totals.maybe}` : "") +
      ` · tests reach ${r.totals.tests} · risk ${worst.risk}: ${worst.qname} (${worst.why.join(", ")})`
  );

  // Nothing touched: the other form, and it says how many files it could not see.
  const clean = json(graph(repo({ callerFiles: 1 }), "changes", "--json"));
  assert.equal(clean.blast_line, "blast radius   none indexed");
});

test("changes — tests_line names the kind of edge each test reached by", () => {
  const r = json(graph(touched(), "changes", "--json"));
  assert.match(r.tests_line, /^tests reached  \d+ files? \(ROUTE \d+ · call \d+( · name \d+)?\)$|^tests reached  none$/);
  const none = json(graph(repo({ callerFiles: 1 }), "changes", "--json"));
  assert.equal(none.tests_line, "tests reached  none");
});

test("changes --files= restricts the rows, the totals and both lines together", () => {
  const root = touched();
  const all = json(graph(root, "changes", "--json"));
  const one = json(graph(root, "changes", "--files=src/core.js", "--json"));
  assert.deepStrictEqual(one.files, ["src/core.js"]);
  assert.ok(one.symbols.every((s) => s.file === "src/core.js"));
  assert.ok(one.totals.symbols < all.totals.symbols, "the other file's symbols are gone");
  assert.equal(one.totals.symbols, one.symbols.length);
  assert.ok(one.blast_line.startsWith("blast radius   "));

  const miss = json(graph(root, "changes", "--files=src/nothing-here.js", "--json"));
  assert.deepStrictEqual(miss.files, []);
  assert.equal(miss.totals.symbols, 0);
  assert.equal(miss.blast_line, "blast radius   none indexed");
});

test("changes — the human line is unchanged: the two new lines are the --json half", () => {
  const root = touched();
  const human = graph(root, "changes").stdout;
  assert.ok(!human.includes("blast radius"), "the human path already lists every symbol with its risk");
  assert.ok(!human.includes("tests reached"));
  assert.match(human, /graph changes vs HEAD/);
});
