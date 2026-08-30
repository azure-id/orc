"use strict";
// @test-pool pure  — walks templates/ and reads files only
// Payload-contract tests: the parts of the shipped markdown whose SHAPE is a
// contract (closed vocabularies, policy tables, mandated report lines). The
// contract lint pins single tokens across files; these cover the grammar-shaped
// drift it cannot see.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const T = path.join(__dirname, "..", "templates");
const read = (rel) => fs.readFileSync(path.join(T, rel), "utf8").replace(/\r\n/g, "\n");

// The closed facet vocabularies, as the payload declares them. Parsed from the
// canonical table so the fixtures below can never drift from the contract.
function facetVocab() {
  const md = read("skills/orc/references/effort-and-mode.md");
  const row = (name) => {
    const m = md.match(new RegExp("^\\| `" + name + "` \\| (.+?) \\|$", "m"));
    assert.ok(m, `facet table has a row for ${name}`);
    return m[1];
  };
  const values = (name) =>
    row(name)
      .split("·")
      .map((s) => s.trim())
      .filter((s) => /^[a-z-]+$/.test(s));
  return {
    novelty: values("novelty"),
    logic: values("logic"),
    test_surface: values("test_surface"),
    riskClasses: (row("risk").match(/class ∈ ([a-z·-]+)/) || [, ""])[1]
      .split("·")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

test("facet vocabularies are closed sets, and the score formula has a term for every member", () => {
  const v = facetVocab();
  assert.deepStrictEqual(v.novelty, ["mechanical", "imitate", "new-surface", "novel-algorithm"]);
  assert.deepStrictEqual(v.logic, ["none", "branching", "stateful", "algorithmic"]);
  assert.deepStrictEqual(v.test_surface, ["none", "update-existing", "new-tests"]);
  assert.deepStrictEqual(v.riskClasses, [
    "auth", "money", "migration", "security", "concurrency", "data-integrity",
  ]);

  // Every member must have a coefficient in the formula — this is what makes a
  // plan scorable. An invented value (low/medium/high) has no N(), which is the
  // whole defect: the score becomes literally uncomputable.
  const formula = read("skills/orc/references/effort-and-mode.md");
  const block = formula.match(/```\n(score = [\s\S]*?)```/);
  assert.ok(block, "the fixed formula block is present");
  for (const n of v.novelty) assert.ok(new RegExp(n + "=\\d").test(block[1]), `N(${n}) defined`);
  for (const l of v.logic) assert.ok(new RegExp(l + "=\\d").test(block[1]), `L(${l}) defined`);
  for (const t of v.test_surface) assert.ok(new RegExp(t + "=\\d").test(block[1]), `T(${t}) defined`);
  for (const bad of ["low", "medium", "high"])
    assert.ok(!new RegExp("\\bN?[NLT]\\(" + bad + "\\)").test(block[1]), `no ${bad} term (invented scale)`);
});

test("the Phase 2 facet gate checks MEMBERSHIP, not just the two recomputable facets", () => {
  const md = read("skills/orc/references/effort-and-mode.md");
  const gate = md.slice(md.indexOf("**2. Orchestrator validation gate"), md.indexOf("**3. The fixed formula"));
  assert.match(gate, /MEMBERSHIP/, "the gate states a membership check");
  for (const f of ["novelty", "logic", "test_surface", "uncertainty"])
    assert.ok(gate.includes(f), `gate names ${f}`);
  assert.match(gate, /risk\[\]\.class/, "gate checks the risk class");
  assert.match(gate, /FIELD-SHAPE bounce/, "a vocabulary miss is a field-shape bounce, not a re-plan");
  assert.match(gate, /do not re-plan/i, "…and says so explicitly");
});

test("the planners carry the vocabularies INLINE (values must not live one hop away)", () => {
  const v = facetVocab();
  for (const agent of [
    "agents/orc-planner-opus-5-med.md",
    "agents/orc-planner-mini-sonnet-5-high.md",
  ]) {
    const md = read(agent);
    for (const n of v.novelty) assert.ok(md.includes(n), `${agent} names novelty:${n}`);
    for (const l of v.logic) assert.ok(md.includes(l), `${agent} names logic:${l}`);
    for (const c of v.riskClasses) assert.ok(md.includes(c), `${agent} names risk class ${c}`);
  }
});

test("tdd_spec entries carry a disposition, and both branches of pre-implementation green are defined", () => {
  const schema = read("skills/orc/schemas/planning-output.md");
  // Collapse the YAML comment continuations: a phrase that wraps across `#`
  // lines is the same contract, and the test must not pin the line breaks.
  const raw = schema.slice(schema.indexOf("tdd_spec:"), schema.indexOf("facets:"));
  const spec = raw.replace(/\n\s*#\s*/g, " ");
  assert.match(spec, /disposition:\s*enum/, "tdd_spec entries carry a disposition (v0.41.0, replacing `kind`)");
  assert.match(spec, /new-surface/, "new-surface disposition defined");
  assert.match(spec, /behavior-change/, "behavior-change disposition defined");
  assert.match(spec, /MUST be red/, "new-surface must be red pre-implementation");
  assert.match(spec, /EXPECTED green/, "a regression guard is expected green");
  // The retained meaning of the old `kind` field must not be silently dropped.
  assert.match(spec, /regression-guard/, "the regression-guard half of behavior-change survives the rename");

  // …and the orchestrator's red-proof step must READ the disposition, not blanket-block.
  // v1.0.0 W12: Phase 3's procedure left the spine for its phase file. The
  // spine now carries the manifest row; the rule lives where the phase does.
  const spine = read("skills/_shared/phases/execution.md");
  const proof = spine.slice(spine.indexOf("TDD red proof"), spine.indexOf("1. Dispatch EVERY task"));
  assert.match(proof, /per `disposition`/, "the red proof reads the entry disposition");
  assert.match(proof, /regression-guard.*EXPECTED|EXPECTED.*regression-guard/s, "a regression guard passing blocks nothing");
});

test("the Phase 1 exit gate bounces a tdd_spec / new-tests task collision", () => {
  const gates = read("skills/_shared/phases/analyst-gates.md");
  const exit = gates.slice(gates.indexOf("## Phase 1 exit gate"));
  assert.match(exit, /tdd_spec/, "the gate knows about tdd_spec");
  assert.match(exit, /new-tests/, "…and about a new-tests task targeting the same file");
});

test("orchestrator-synthesized tasks have ONE derived scoring rule, referenced from both sites", () => {
  const wg = read("skills/_shared/phases/wave-grouping.md");
  const sec = wg.slice(wg.indexOf("## Orchestrator-synthesized tasks"));
  assert.ok(sec, "the general rule exists");
  assert.match(sec, /DERIVED, never judged/, "the vector is derived");
  assert.match(sec, /mechanical/, "novelty is pinned to mechanical");
  // v0.41.0: the TDD red proof is no longer synthesized (it is a planner-emitted
  // paired task), so the mock example is the remaining instance. The risk-floor
  // answer moved with it, into the TDD-tasks section of the same file.
  assert.match(wg, /does NOT inherit the risk floor/, "the risk-floor question is still answered");
  assert.match(wg, /## TDD tasks are ORDINARY tasks/, "…in the section that now owns it");

  const drift = read("skills/_shared/drift-recovery.md");
  assert.match(drift, /DISPATCHED like any task/, "the mock example names its actor");
  assert.match(drift, /wave-grouping\.md/, "…and points at the same scoring rule");
  assert.match(drift, /DELETE or overwrite the previous `EXAMPLE\.md`/, "the stale example is removed on re-offer");
});

// ── v0.35.0 the opus5_executor_only ladder ────────────────────────────────

// Parse a `| [lo,hi) | … | <agent> |` band table out of ONE markdown section —
// bounded at the next heading, or the tables run into each other.
function bandTable(md, heading) {
  const from = md.indexOf(heading);
  assert.ok(from >= 0, `section "${heading}" exists`);
  const after = md.slice(from + heading.length);
  const end = after.search(/\n#{2,3} /);
  const sec = end === -1 ? after : after.slice(0, end);
  const rows = [...sec.matchAll(/^\|\s*\[(\d+),(\d+)([)\]])\s*\|.*\|\s*(orc-executor-[a-z0-9-]+)\s*\|\s*$/gm)];
  return rows.map((m) => ({ lo: +m[1], hi: +m[2], closed: m[3] === "]", agent: m[4] }));
}

test("the Opus-5-only ladder is 2 contiguous bands covering 0..100 with no gap or overlap", () => {
  const cfg = read("skills/orc/config.md");
  const rows = bandTable(cfg, "### The Opus-5-only ladder");
  assert.strictEqual(rows.length, 2, "two bands since v1.0.0 W4");
  assert.deepStrictEqual(
    rows.map((r) => [r.lo, r.hi, r.agent]),
    [
      [0, 90, "orc-executor-opus-5-low"],
      [90, 100, "orc-executor-opus-5-med"],
    ],
    "the resolved 2-band table"
  );
  // Contiguity is the property a hand-edited table gets wrong (a gap, or a
  // doubly-owned edge): each band starts where the previous ended, top closed.
  assert.strictEqual(rows[0].lo, 0, "starts at 0");
  for (let i = 1; i < rows.length; i++)
    assert.strictEqual(rows[i].lo, rows[i - 1].hi, `band ${i} starts where band ${i - 1} ends`);
  assert.ok(rows[rows.length - 1].closed, "the top band is CLOSED at 100");

  // Band-edge exactness, stated as the resolution a scorer must perform. 90 is
  // the D13 edge and it is round: a score of exactly 90 is MED.
  const resolve = (score) => {
    const hit = rows.find((r) => score >= r.lo && (r.closed ? score <= r.hi : score < r.hi));
    return hit && hit.agent;
  };
  for (const [score, want] of [
    [0, "orc-executor-opus-5-low"],
    [89, "orc-executor-opus-5-low"],
    [90, "orc-executor-opus-5-med"],
    [100, "orc-executor-opus-5-med"],
    // the risk floor raises the SCORE, then the table maps it
    [70, "orc-executor-opus-5-low"],
  ])
    assert.strictEqual(resolve(score), want, `score ${score}`);
});

test("the default table is 6 bands, and shares its top edge with the preset", () => {
  const cfg = read("skills/orc/config.md");
  const rows = bandTable(cfg, "## Score → model table");
  assert.strictEqual(rows.length, 6, "six default bands since v1.0.0 W4");
  assert.strictEqual(rows[0].agent, "orc-executor-haiku-4-5");
  assert.strictEqual(rows[5].agent, "orc-executor-opus-5-med");
  assert.ok(rows[5].closed, "top band closed at 100");
  for (let i = 1; i < rows.length; i++)
    assert.strictEqual(rows[i].lo, rows[i - 1].hi, `band ${i} starts where band ${i - 1} ends`);

  // The two tables agree above 65, which is the whole reason the preset is two
  // bands and not three: once the default's high end is already Opus 5 with
  // effort as the dial, a third band here would be a distinction the default
  // table stopped making.
  const preset = bandTable(cfg, "### The Opus-5-only ladder");
  assert.strictEqual(rows[4].lo, 65);
  assert.strictEqual(rows[4].hi, 90);
  assert.strictEqual(rows[4].agent, preset[0].agent);
  assert.strictEqual(rows[5].lo, preset[1].lo);
  assert.strictEqual(rows[5].agent, preset[1].agent);
});

test("table resolution states its precedence, and the pinned interactions", () => {
  const cfg = read("skills/orc/config.md");
  // v1.0.0 W7 - the precedence MOVED. `orc/config.md` stopped carrying a
  // hand-written "highest wins" list; the ranks live once, in the shared
  // contract, as the executor-band family table. The invariant is the same and
  // the table is strictly richer: the old list could not see `extra_enabled`,
  // which has outranked `opus5_only` since v0.50.0 and was simply absent here.
  const prec = read("skills/_shared/config-precedence.md");
  const band = prec.slice(prec.indexOf("`executor-band`"), prec.indexOf("`fixed-role-model`"));
  const order = ["extra_enabled", "opus5_only", "rubric_bands_override", "terminal"];
  let at = -1;
  for (const t of order) {
    const i = band.indexOf(t);
    assert.ok(i > at, `${t} appears, after the higher-precedence entry`);
    at = i;
  }
  assert.match(prec, /stop at the first rank that resolves/, "the rule the ranks mean something under");
  assert.match(prec, /compares only INSIDE its family/, "...and the limit on comparing them");

  // Each interaction the preset could silently contradict.
  const eam = read("skills/orc/references/effort-and-mode.md");
  assert.match(eam, /risk floor still applies/i, "the risk floor still applies");
  assert.match(eam, /floored task .*lands `opus-5-low`/s, "…and where a floored task lands");

  const ultra = read("skills/orc/references/ultra-mode.md");
  assert.match(ultra, /raises EFFORT, not model/, "ultra's floor is defined under the preset");

  // Scope (v0.36.0): NOT executor-only — it reaches every fixed role too, and
  // the two exclusions are named where a maintainer would look for them.
  assert.match(cfg, /NOT executor-only/, "scope stated as wider than executors");
  assert.match(cfg, /orc-diy.s table\s*\n?stays compile-owned/, "orc-diy excluded");
});

// ── v0.36.0 opus5_only: one forcing mode across every dispatched role ──────

test("the opus5-only mapping names only agents that exist, and never the trace writer", () => {
  const shared = read("skills/_shared/opus5-only.md");
  const onDisk = new Set(
    fs.readdirSync(path.join(T, "agents")).map((f) => f.replace(/\.md$/, ""))
  );
  // Every agent the contract promises to dispatch must ship — a typo'd rename
  // here dispatches a nonexistent agent for that role the moment the mode is on.
  // Agent names only — a bare lane name like `orc-diy` is prose, not a dispatch.
  const named = [...shared.matchAll(/`(orc-[a-z0-9-]+-(?:opus|sonnet|haiku)-[0-9-]+(?:low|med|high)?)`/g)]
    .map((m) => m[1])
    .filter((n) => !/-$/.test(n));
  assert.ok(named.length >= 18, "both columns of the mapping are present");
  for (const n of named) assert.ok(onDisk.has(n), `${n} is a shipped agent file`);

  // Every right-hand (forced) agent is actually an Opus 5 agent.
  const forced = [...shared.matchAll(/\|\s*`?(orc-[a-z0-9-]+)`?\s*\|\s*$/gm)].map((m) => m[1]);
  for (const n of forced.filter((x) => x.startsWith("orc-")))
    assert.ok(/-opus-5-(low|med|high)$/.test(n), `${n} is an opus-5 variant`);

  // The one role the mode must never touch.
  assert.match(shared, /orc-trace-writer-haiku-4-5` stays Haiku/, "trace writer excluded");
  assert.ok(!/orc-trace-writer-opus/.test(shared), "no opus trace-writer variant is promised");
});

test("every opus5-only variant is pinned to claude-opus-5 and NAMED for its effort", () => {
  // A trace derives expect=<model>/<effort> from the agent NAME, so a file whose
  // name disagrees with its frontmatter breaks the downgrade check.
  const variants = fs
    .readdirSync(path.join(T, "agents"))
    .filter((f) => /-opus-5-(low|med|high)\.md$/.test(f));
  assert.ok(variants.length >= 10, "the full opus-5 roster ships");
  for (const f of variants) {
    const text = read("agents/" + f);
    const base = f.replace(/\.md$/, "");
    assert.match(text, /^model: claude-opus-5$/m, `${f} is pinned to claude-opus-5`);
    assert.match(text, new RegExp("^name: " + base + "$", "m"), `${f} name matches its filename`);
    const effort = base.match(/-(low|med|high)$/)[1];
    const want = { low: "low", med: "medium", high: "high" }[effort];
    assert.match(text, new RegExp("^effort: " + want + "$", "m"), `${f} effort matches its name`);
  }
});

test("the CLI role table and the shared contract agree on every forced agent", () => {
  // Documented drift the token lint cannot see: cli.js prints the roster at
  // set-time, the contract is what a run reads. A disagreement means the notice
  // promises an agent the run never dispatches.
  const cli = fs.readFileSync(path.join(__dirname, "..", "bin", "cli.js"), "utf8");
  const block = cli.match(/const OPUS5_ONLY_ROLES = \[([\s\S]*?)\n\];/);
  assert.ok(block, "OPUS5_ONLY_ROLES is parseable");
  const rows = [...block[1].matchAll(/\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\]/g)];
  assert.strictEqual(rows.length, 9, "nine fixed roles are forced");
  const shared = read("skills/_shared/opus5-only.md");
  for (const [role, def, forced] of rows) {
    assert.ok(shared.includes(def), `${role}: default ${def} is in the contract`);
    assert.ok(shared.includes(forced), `${role}: forced ${forced} is in the contract`);
  }
});

test("both opus5-only executors are generated from the template and documented", () => {
  const build = fs.readFileSync(path.join(__dirname, "..", "bin", "build-agents.js"), "utf8");
  const variants = [...build.matchAll(/name:\s*"(orc-executor-[a-z0-9-]+)"/g)].map((m) => m[1]);
  for (const n of ["orc-executor-opus-5-low", "orc-executor-opus-5-med"])
    assert.ok(variants.includes(n), `${n} is a VARIANTS row`);

  // set equality: every variant has a file, every executor file is a variant
  const onDisk = fs
    .readdirSync(path.join(T, "agents"))
    .filter((f) => f.startsWith("orc-executor-"))
    .map((f) => f.replace(/\.md$/, ""));
  assert.deepStrictEqual(onDisk.slice().sort(), variants.slice().sort(), "VARIANTS == executor files");

  const mapping = read("agents/MODEL-MAPPING.md");
  for (const n of ["orc-executor-opus-5-low", "orc-executor-opus-5-med"])
    assert.ok(mapping.includes(n), `${n} is in MODEL-MAPPING`);
});

// ── v0.34.6 analyze: gate coverage + shipped model literals ────────────────

test("no shipped schema template names a model/effort pair that no agent has", () => {
  // Generalizes past the two instances that shipped stale: a template literal
  // is copied by whoever fills the template, so a wrong one propagates. This is
  // the same class as the score->model table drift the token lint cannot see.
  const agentDir = path.join(T, "agents");
  const pairs = new Set();
  for (const f of fs.readdirSync(agentDir).filter((n) => n.endsWith(".md") && n.startsWith("orc-"))) {
    const md = fs.readFileSync(path.join(agentDir, f), "utf8");
    const model = (md.match(/^model:\s*claude-([a-z0-9-]+)\s*$/m) || [])[1];
    const effort = (md.match(/^effort:\s*([a-z]+)\s*$/m) || [])[1];
    if (!model) continue;
    pairs.add(effort ? `${model}-${effort}` : model);
  }
  assert.ok(pairs.size > 5, "parsed the agent roster");

  const schemas = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md") && /[\\/]schemas[\\/]/.test(p)) schemas.push(p);
    }
  };
  walk(path.join(T, "skills"));
  assert.ok(schemas.length, "found schema templates");

  // A template whose literal is merely SOME valid pair is not enough — the
  // shipped defect was `opus-4.8-high` (a real pair, wrong agent) sitting in
  // the analyst's own report template after the role was re-pinned to Opus 5.
  // So schemas with a knowable producer are checked against THAT agent.
  const PRODUCER = {
    "skills/orc-analyze/schemas/report-audit.md": "orc-system-analyst-opus-5-high",
    "skills/orc-analyze/schemas/report-prose.md": "orc-system-analyst-opus-5-high",
    "skills/orc-analyze/schemas/report-requirement.md": "orc-system-analyst-opus-5-high",
    "skills/context-combiner/schemas/combined-report.md": "orc-context-combiner-opus-5-high",
  };
  const slugOf = (agent) => {
    const md = fs.readFileSync(path.join(agentDir, agent + ".md"), "utf8");
    const model = (md.match(/^model:\s*claude-([a-z0-9-]+)\s*$/m) || [])[1];
    const effort = (md.match(/^effort:\s*([a-z]+)\s*$/m) || [])[1];
    assert.ok(model, `${agent} exists and declares a model`);
    return effort ? `${model}-${effort}` : model;
  };

  const bad = [];
  for (const p of schemas) {
    const rel = path.relative(T, p).split(path.sep).join("/");
    const md = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    for (const m of md.matchAll(/^model:\s*([a-z0-9.\-]+)\s*(?:#.*)?$/gm)) {
      const lit = m[1].replace(/\./g, "-").replace(/^claude-/, "");
      // `<...>` placeholders and enum lines are not literals.
      if (!/^[a-z]/.test(lit) || lit.includes("|")) continue;
      if (PRODUCER[rel]) {
        const want = slugOf(PRODUCER[rel]);
        if (lit !== want) bad.push(`${rel} → model: ${m[1]} (its producer ${PRODUCER[rel]} is ${want})`);
      } else if (!pairs.has(lit)) {
        bad.push(`${rel} → model: ${m[1]} (no shipped agent has that model/effort)`);
      }
    }
  }
  assert.deepStrictEqual(bad, [], "every schema model literal matches the agent that fills it");
});

test("the analyst evidence gate verifies EVERY quote-anchored ref, not one status pair", () => {
  const gates = read("skills/_shared/phases/analyst-gates.md");
  const spot = gates.slice(gates.indexOf("1. **Evidence spot-check:"), gates.indexOf("2. **Derivation lint:"));
  assert.match(spot, /EVERY quote-anchored ref/, "coverage is status-independent");
  // The old restriction must not survive as the operative rule.
  assert.doesNotMatch(
    spot.split("(v0.34.6)")[0],
    /Grep-verify the quoted snippet on every `status: exists\|conflict` entry/,
    "the exists|conflict-only rule is gone"
  );
  for (const s of ["resolved", "buildable"])
    assert.ok(spot.includes(s), `names ${s} — the statuses a good audit actually produces`);
});

test("the report handoff checklist marks its post-confirmation items", () => {
  const md = read("skills/orc-analyze/schemas/report-audit.md");
  const list = md.slice(md.indexOf("## Handoff readiness"));
  const post = list.split("\n").filter((l) => l.includes("satisfied\n") || l.includes("satisfied post-confirmation"));
  assert.ok(post.length >= 1, "post-confirmation items are labelled, so a correct run does not read as a failed checklist");
  assert.match(list, /can only become true\s*\nAFTER/, "the reason is stated, not just the label");
  // R# stays the spec's namespace.
  assert.match(md, /`R#` is the SPEC's namespace/, "report rows are 'row N', never R#");
});

test("every lane has a TDD policy row, and the preflight block defines a rule per printed key", () => {
  const cfg = read("skills/orc/config.md");
  // W7 - the same sentence, no longer inside the deleted yaml defaults fence.
  const policy = cfg.slice(cfg.indexOf("Lane policy (fixed"), cfg.indexOf("**Behavior-trace logging"));
  for (const lane of ["orc", "ultra", "orc-mini", "orc-fast", "orc-diy", "/orc-plan"])
    assert.ok(policy.includes(lane), `TDD policy names ${lane}`);

  // The preflight template and its line rules must be the same key set — a key
  // printed with no rule (or mandated elsewhere with no producer here) is how
  // the TDD line came to be invented at runtime.
  const pf = read("skills/orc/references/preflight-report.md");
  const tpl = pf.match(/── run preflight ──\n([\s\S]*?)```/);
  assert.ok(tpl, "preflight template present");
  const printed = [...tpl[1].matchAll(/^([a-z]+):/gm)].map((m) => m[1]);
  const ruled = [...pf.matchAll(/^- \*\*([a-z]+):\*\*/gm)].map((m) => m[1]);
  assert.deepStrictEqual(printed.slice().sort(), ruled.slice().sort(), "every printed key has a line rule");
  assert.ok(printed.includes("tdd"), "the TDD line is part of the block");
  const tddRule = pf.slice(pf.indexOf("- **tdd:**"), pf.indexOf("- **trace:**"));
  assert.match(tddRule, /EXEMPT \(whole run\)/, "the exemption branch is defined");
  assert.match(tddRule, /tasks with tests/, "the normal branch is defined too");
  // v0.41.0: scoping TDD down is only safe if the scoping is visible. A silently
  // skipped test is indistinguishable from a forgotten one.
  assert.match(tddRule, /skipped:/, "the skipped breakdown is part of the line");
  assert.match(tddRule, /REQUIRED whenever/, "…and it is mandatory, not optional decoration");
  for (const d of ["covered-by-existing", "no-behavior"])
    assert.ok(tddRule.includes(d), `the rule names the ${d} branch it must report`);
});

// ── v0.37.0 stacked PRs ────────────────────────────────────────────────────

test("the stacked-PR config defaults agree between the CLI and the documented config", () => {
  // W7 DELETED the second side. This used to compare the CLI default against a
  // documented one, because "a CLI default of 1000 beside a documented 2000
  // makes the ship gate fire at a threshold nobody expects" - a drift the token
  // lint cannot see, since it asserts a key is REFERENCED and never that two
  // copies agree on its VALUE. The fix for that class of drift is not a better
  // comparison, it is ONE copy. So this asserts both halves of the removal: the
  // CLI still holds the values, and the payload does not hold them any more.
  const cli = fs.readFileSync(path.join(__dirname, "..", "bin", "cli.js"), "utf8");
  const cfg = read("skills/orc/config.md");
  const defs = { stacked_pr: "ask", stacked_pr_loc: "1000", stacked_pr_files: "20", stacked_pr_max_layers: "6" };
  for (const [key, want] of Object.entries(defs)) {
    const m = new RegExp('\\{\\s*key:\\s*"' + key + '",\\s*def:\\s*"?([^",]+)"?,').exec(cli);
    assert.ok(m, `${key} is a CONFIG_META row`);
    assert.strictEqual(m[1].trim(), want, `${key} CLI default`);
    assert.doesNotMatch(
      cfg,
      new RegExp("^" + key + ":\s*\S", "m"),
      `${key} must not be given a value in config.md - the registry is the one copy`
    );
  }
  // The keys are still NAMED there, as the rule they participate in. Naming a
  // key without restating its value is the whole point of the split.
  assert.match(cfg, /stacked_pr\*` keys/, "the payload still says which subsystem the keys belong to");
});

test("the ship gate is an OR of two thresholds, degrades to a regular PR, and never lives in a speed lane", () => {
  const gate = read("skills/orc/subskills/orc-pr/stack-gate.md");
  const spine = read("skills/_shared/phases/ship.md"); // W12: Phase 8's own file
  // The trigger is OR, not AND: a 40-file / 300-LoC change is just as unreviewable.
  assert.match(gate, /LoC >= stacked_pr_loc`? OR `?files >= stacked_pr_files/);
  // Both prerequisites degrade to one regular PR — neither is a failure.
  for (const md of [gate, spine]) {
    assert.match(md, /ticket/i);
    assert.match(md, /regular PR/);
  }
  assert.match(gate, /three options/, "no template found → recommend three");
  // Scope: the fast lane never stops the chat; diy's shape is compile-owned.
  assert.match(gate, /never in orc-mini/i);
  for (const lane of ["skills/orc-mini/SKILL.md", "skills/orc-fast/SKILL.md"])
    assert.doesNotMatch(read(lane), /stacked_pr/, `${lane} does not run the stack gate`);
});

test("the driver's hard gate and the plan contract name the same refusal conditions", () => {
  const driver = read("skills/orc-pr-driver/SKILL.md");
  const contract = read("skills/_shared/stack-plan.md");
  for (const cond of ["UNCERTAIN", "ticket", "value class", "consumer", "2 layers"]) {
    assert.ok(driver.includes(cond), `driver names "${cond}"`);
    assert.ok(contract.includes(cond), `the contract names "${cond}"`);
  }
  // The gate is per-layer at its OWN base — the rule the whole lane exists for.
  assert.match(read("skills/orc-pr-driver/references/green-gate.md"), /own base/);
  assert.match(driver, /--no-verify/, "the forbidden bypass is named in the spine");
});

test("both stacked-PR lanes ship a human guide, and each spine points at its own", () => {
  // The guides are the user-facing half of the feature: a lane whose spine does
  // not name its README leaves a user with a contract file and no walkthrough.
  for (const lane of ["orc-pr-setup", "orc-pr-driver"]) {
    const guide = read(`skills/${lane}/README.md`);
    assert.ok(guide.length > 4000, `${lane}/README.md is a real guide, not a stub`);
    assert.match(guide, /^## 1\./m, "starts with a numbered walkthrough");
    assert.match(guide, /FAQ/i, "answers the common questions");
    const spine = read(`skills/${lane}/SKILL.md`);
    assert.match(spine, /README\.md/, `${lane} spine points the user at its guide`);
    // …and never loads it to drive the run (it is prose for humans, not contract).
    assert.match(spine, /never load it to drive the run/);
  }
  // Each guide links the other, so a user landing on either finds the whole flow.
  assert.match(read("skills/orc-pr-setup/README.md"), /orc-pr-driver\/README\.md/);
  assert.match(read("skills/orc-pr-driver/README.md"), /orc-pr-setup\/README\.md/);
});

// ── TDD scoping (v0.41.0) ───────────────────────────────────────────────────
// The disposition set is a CLOSED vocabulary spread across the schema, the
// Phase-1 gate, four planner agents and two lane spines. The token lint pins
// the word `disposition`; only a golden comparison catches a value added in one
// place and missing in another — which would silently let a plan skip a test
// the gate never learned to check.
const TDD_DISPOSITIONS = [
  "new-surface",
  "behavior-change",
  "covered-by-existing",
  "no-behavior",
  "no-runner",
];

test("the TDD disposition vocabulary is identical everywhere it is stated", () => {
  const schema = read("skills/orc/schemas/planning-output.md");
  for (const d of TDD_DISPOSITIONS)
    assert.ok(schema.includes(d), `schema declares ${d}`);

  // Every file that decides or enforces the disposition must know all five.
  for (const rel of [
    "skills/_shared/phases/analyst-gates.md",
    "skills/orc/subskills/orc-planner/SKILL.md",
    "agents/orc-planner-opus-5-med.md",
    "agents/orc-planner-mini-sonnet-5-high.md",
    "agents/orc-planner-mini-opus-5-med.md",
    "skills/_shared/phases/planning.md", // W12: was the spine's Phase 1
    "skills/orc-mini/SKILL.md",
  ]) {
    const md = read(rel);
    for (const d of TDD_DISPOSITIONS)
      assert.ok(md.includes(d), `${rel} names the ${d} disposition`);
  }
});

test("the facet -> disposition derivation is stated identically wherever it is derived", () => {
  // The whole saving rests on this table: `mechanical` + `none` means a constant
  // or a translation string, `mechanical` + `update-existing` means a pure
  // refactor. A file that states one pairing and not the other would author
  // tests for exactly the cases the fix exists to skip.
  for (const rel of [
    "skills/orc/schemas/planning-output.md",
    "skills/orc/subskills/orc-planner/SKILL.md",
    "agents/orc-planner-opus-5-med.md",
    "agents/orc-planner-mini-sonnet-5-high.md",
    "agents/orc-planner-mini-opus-5-med.md",
  ]) {
    const md = read(rel);
    assert.match(md, /test_surface: none/, `${rel} states the no-behavior antecedent`);
    assert.match(md, /test_surface: update-existing/, `${rel} states the covered-by-existing antecedent`);
    assert.match(md, /novelty: mechanical/, `${rel} states the shared novelty antecedent`);
  }
});

test("every place that can skip a test also states the risk safety floor", () => {
  // A skip rule without its floor is a coverage hole: an auth or money
  // requirement must never ride on another test's coincidence.
  for (const rel of [
    "skills/orc/schemas/planning-output.md",
    "skills/_shared/phases/analyst-gates.md",
    "skills/orc/subskills/orc-planner/SKILL.md",
    "agents/orc-planner-opus-5-med.md",
    "agents/orc-planner-mini-sonnet-5-high.md",
    "agents/orc-planner-mini-opus-5-med.md",
    "skills/_shared/phases/planning.md", // W12: was the spine's Phase 1
    "skills/orc-mini/SKILL.md",
  ]) {
    const md = read(rel);
    assert.match(md, /risk\[\]/, `${rel} names the risk facet in its skip rule`);
  }
  // The gate is the only party that ENFORCES it, so it must say so in full.
  const gate = read("skills/_shared/phases/analyst-gates.md");
  assert.match(gate, /covered_by/, "the gate resolves the cited existing test");
  assert.match(gate.replace(/\s+/g, " "),
    /Auth, money, migration, security, concurrency and data-integrity/i,
    "the gate enumerates the protected risk classes");
});

test("the monolithic Wave-0 red proof is gone from every lane that had one", () => {
  // A leftover "Wave 0 materializes every tdd_spec" instruction would re-create
  // the up-front cost this release removed, and would contradict the paired-task
  // dependency the planner now emits.
  for (const rel of [
    "skills/orc/SKILL.md",
    "skills/_shared/phases/execution.md", // W12
    "skills/_shared/phases/planning.md", // W12
    "skills/orc/schemas/planning-output.md",
    "skills/_shared/phases/wave-grouping.md",
    "skills/orc/subskills/orc-planner/SKILL.md",
    "skills/orc/subskills/orc-execution/core.md",
    "skills/_shared/phases/execution.md",
  ]) {
    const md = read(rel);
    assert.doesNotMatch(md, /Wave 0 materializes/, `${rel} no longer dispatches a monolithic Wave 0`);
    assert.doesNotMatch(md, /Wave-0-materialized/, `${rel} no longer refers to Wave-0 materialization`);
  }
  // …and the replacement is stated where the waves are actually computed.
  const waves = read("skills/_shared/phases/wave-grouping.md");
  assert.match(waves, /depends_on/, "the ordering guarantee is the dependency, not a special wave");
  assert.match(waves, /share a wave/, "independent red proofs are allowed to parallelize");
});

// ── Wiki visibility (v0.41.0) ───────────────────────────────────────────────

test("the freshness tier is read from the CLI probe, never hand-computed", () => {
  // A model-computed tier is one that gets skipped under load or measured from
  // the wrong anchor — the failure this release fixed on the CLI side.
  for (const rel of [
    "skills/_shared/phases/wiki-consult.md",
    "skills/_shared/detecting-artifacts.md",
    "skills/orc-wiki/references/staleness.md",
    "skills/_shared/phases/planning.md", // W12: was the spine's Phase 1
  ]) {
    const md = read(rel);
    assert.match(md, /orc wiki status/, `${rel} names the probe`);
  }
  const consult = read("skills/_shared/phases/wiki-consult.md");
  assert.match(consult, /never/i, "the consult forbids the hand-computed path");
  assert.doesNotMatch(
    consult,
    /compute\s+\n?`git rev-list --count <scan_commit>\.\.HEAD`/,
    "the old hand-run rev-list instruction is gone"
  );
});

test("wiki use is attested per dispatch, not assumed from the Phase-1 line", () => {
  const consult = read("skills/_shared/phases/wiki-consult.md");
  assert.match(consult, /wiki_used/, "the consult names the return field");
  assert.match(consult, /DISPATCH/, "attribution rides the dispatch line");

  const ret = read("skills/_shared/return-validation.md");
  assert.match(ret, /wiki_used/, "the return contract defines the field");
  assert.match(ret, /`none` is a valid and INFORMATIVE return/,
    "a wiki nobody reads must stay visible, so `none` is never dropped");

  // Every executor must be able to produce it.
  for (const f of fs.readdirSync(path.join(T, "agents")).filter((x) => x.startsWith("orc-executor-")))
    assert.match(read(`agents/${f}`), /wiki_used/, `${f} returns wiki_used`);

  // …and the slice contract has to actually carry the wiki for that to mean anything.
  assert.match(read("skills/orc/subskills/orc-execution/core.md"), /^- wiki\s/m,
    "the slice contract declares the wiki field");
});

// ── v0.47.0 /orc-challenge: the sealed slice, and the three instruments ─────

test("the challenge judge's dispatch block carries ONLY paths and ids", () => {
  // A fix is a CLAIM; a verdict is EVIDENCE. The moment the judge is handed a
  // summary of what changed, it is grading the summary — written by the party
  // with an interest in passing.
  const spine = read("skills/orc-challenge/SKILL.md");
  const sealed = read("skills/orc-challenge/references/sealed-slice.md");
  for (const f of [spine, sealed]) assert.match(f, /judge slice is SEALED/, "the token is present");

  // The permitted field list, from the reference's own fenced example.
  const block = sealed.match(/```\n(goals:[\s\S]*?)```/);
  assert.ok(block, "the reference shows the exact dispatch block");
  const fields = block[1].split("\n").filter((l) => l.trim());
  assert.ok(fields.length >= 6, "the whole slice is shown, not a fragment");
  for (const line of fields) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").replace(/\(.*?\)/g, "").trim();
    const pathShaped = /[\/]|\.md$|\.json$|<skill>/.test(value);
    // v0.49.1: a council lens signs its findings with its own prefix, and an
    // ADOPTED finding keeps the raiser's id — so `carry_ids` legitimately mixes
    // F-, R-, C-, O- and E-. Still id-shaped, still never prose.
    const idShaped = /^([A-Z]-\d+\s*)+$/.test(value) || /^\(none[^)]*\)?$/.test(value);
    assert.ok(pathShaped || idShaped, `slice field "${key.trim()}" is a path or an id, not prose: ${value}`);
  }

  // And the things that may NEVER appear are named, so a later editor cannot
  // add one by accident.
  for (const forbidden of ["the diff", "the fix brief", "the user says"])
    assert.ok(sealed.includes(forbidden), `the reference forbids "${forbidden}" by name`);

  // v0.49.1 — the two council reports that may NEVER be in the judge's slice.
  // A judge handed a document arguing that the frozen goal is wrong is biased
  // on every finding it produces afterwards, and an opportunity is not a defect.
  for (const f of [spine, sealed])
    for (const forbidden of ["principles.md", "expansionist.md"])
      assert.ok(f.includes(forbidden), `the excluded council report ${forbidden} is named`);
  assert.ok(
    !/^principles:|^expansionist:/m.test(block[1]),
    "neither non-finding lens appears as a slice row"
  );
});

test("the challenge reader is deliberately WEAK, and nothing may upgrade it", () => {
  // A stronger, harder-thinking cold reader reasons AROUND the gaps D4 exists
  // to find, so a "helpful" model bump here silently breaks the measurement.
  const agent = read("agents/orc-challenge-reader-opus-5-low.md");
  assert.match(agent, /^model: claude-opus-5$/m);
  assert.match(agent, /^effort: low$/m);
  assert.match(agent, /^tools: Read$/m, "Read and nothing else — the instrument is defined by what it cannot reach");
  assert.ok(!/Glob|Grep|Bash/.test(agent.split("---")[1] || ""), "no search tool in the frontmatter");

  const dims = read("skills/orc-challenge/references/dimensions.md");
  assert.match(dims, /WORSE instrument/, "the reference states WHY low is correct");

  // The judge and the advisor are read-only, and the advisor never writes prose.
  const advisor = read("agents/orc-challenge-advisor-opus-5-med.md");
  assert.match(advisor, /no rewritten prose|no prose|never.*prose/i, "the advisor may not hand over wording");
});

test("the challenge judge can never declare a pass", () => {
  const judge = read("agents/orc-challenge-judge-opus-5-high.md");
  assert.match(judge, /cannot pass anything|Declare PASS/i, "the agent says it outright");
  const rubric = read("skills/orc-challenge/references/rubric.md");
  assert.match(rubric, /PASS is computed, never declared/);
  assert.match(rubric, /can only find, or fail to find/, "the reason is stated, not just the rule");
});

// ── v0.54.0 — recovery: a failure is a POSITION, not a blank page ───────────

test("the recovery token is the SIXTH member of its family, and it lives in ONE file", () => {
  const shared = read("skills/_shared/extra-dispatch.md");
  assert.match(shared, /`a lane that re-does work the worktree already contains` has broken this\s+contract/);
  // The family is named, so a reader meets the rule as one of a set rather than
  // as a slogan invented for this release.
  for (const sibling of [
    "a lane that answers its own interview question",
    "a lane that picks its own favourite",
    "a lane that fixes what it judged",
    "a lane that picks its own council",
    "a lane that reads its own document",
    "a lane that sends work off Claude without saying so",
  ])
    assert.ok(shared.includes(sibling), "the family is incomplete without: " + sibling);

  // ONE COPY. A spine keeps the token and a pointer; it never forks the prose.
  const forked = ["skills/orc/SKILL.md", "skills/orc-mini/SKILL.md", "skills/orc-fast/SKILL.md"].filter((f) =>
    read(f).includes("a lane that re-does work the worktree already contains")
  );
  assert.deepEqual(forked, [], "the canonical prose was forked back into a spine");
});

test("every lane that dispatches foreign points at reconcile FIRST — one sentence, no forked prose", () => {
  for (const f of [
    "skills/_shared/phases/execution.md", // W12: was the spine's Phase 3
    "skills/orc-mini/SKILL.md",
    "skills/orc-fast/SKILL.md",
    "skills/orc-diy/references/blocks/extra.md",
  ]) {
    const md = read(f);
    assert.ok(md.includes("orc extra reconcile"), `${f} never names the free first step`);
    assert.match(md, /RESUMED, never re-done/, `${f} states the rule rather than only the command`);
  }
});

test("`extra_resume` is INERT in /orc-quick, and the shadowing is announced on both sides", () => {
  // A shadowed setting must never be silent — and the lane that asks which agent
  // before every dispatch is exactly the lane a resume config would break.
  const quick = read("skills/orc-quick/SKILL.md");
  assert.match(quick, /These config keys \*\*do nothing here\*\*/);
  for (const k of ["extra_resume", "extra_on_failure", "opus5_only", "rubric_bands_override"])
    assert.ok(quick.includes(k), "/orc-quick's INERT list is missing " + k);
  const shared = read("skills/_shared/extra-dispatch.md");
  assert.match(shared, /INERT there/, "the shared contract registers the same exception");
  assert.match(shared, /`extra_resume` stay INERT/, "and names the resume key in that list");

  // v0.55.0 — `extra_enabled` is the ONE key that LEFT the inert list, and an
  // un-shadowed setting must not be silent either. It is not an answer to the
  // gate's question; it is one more option on the menu the gate already shows.
  assert.ok(!/`extra_enabled`[^\n]*do nothing here/.test(quick));
  assert.match(quick, /third option/i, "/orc-quick says what extra_enabled does here");
  assert.match(shared, /GATED CHOICE/, "the shared contract says what shape that lane is");
  assert.match(shared, /ADDS AN OPTION and nothing else/, "and that it adds an option, never an answer");
});

test("the config surface says FIFTEEN keys, and names what it refused to add", () => {
  const shared = read("skills/_shared/extra-dispatch.md");
  assert.match(shared, /## The config surface — fifteen keys/);
  assert.ok(shared.includes("`config.extra_demote_after`"));
  assert.ok(shared.includes("`config.extra_demote_stale_min`"));
  // v1.0.0 W5's two refusals, written down for the same reason as every other
  // set: a reader who cannot see them will propose them again.
  assert.match(shared, /REFUSED — `extra_demote` \(`on`\/`off`\)/);
  assert.match(shared, /REFUSED — `extra_promote_after`/);
  assert.ok(shared.includes("`config.extra_stall_s`"));
  assert.ok(shared.includes("`config.extra_fallback_agent`"));
  // The v0.56.1 refusals, written down for the same reason as every other set:
  // a reader who cannot see them will propose them again.
  assert.match(shared, /a keystroke nobody reads is a fake fix/);
  assert.ok(shared.includes("`config.extra_resume`"));
  assert.ok(shared.includes("`config.extra_resume_max`"));
  // The refusals are the interesting half: each one is a trap that was
  // considered and declined, and a reader who cannot see them will propose it
  // again.
  assert.match(shared, /Keys deliberately NOT added/);
  assert.match(shared, /a record you can switch off is off on the run you needed it for/);
});

test("the stall contract: its own failure class, retryable, and engine cli only", () => {
  const shared = read("skills/_shared/extra-dispatch.md");
  const cli = fs.readFileSync(path.join(__dirname, "..", "bin", "cli.js"), "utf8");

  // The registered token — a wall clock cannot tell a worker that is thinking
  // hard from one that stopped, and reporting the second as the first hid that
  // it was a POSITION rather than a budget somebody should raise.
  assert.match(shared, /a lane that waits out a wall clock on a worker that stopped/);

  // RETRYABLE is the whole point: it is what makes `extra_resume` — ORC's own
  // spelling of typing `continue` — apply to a stall unchanged.
  const row = /stalled: \{ retry: (true|false)/.exec(cli);
  assert.ok(row, "EXTRA_FAILURES must carry a `stalled` row");
  assert.equal(row[1], "true", "a stall is a position to continue from, not a dead end");

  // Ordered once, in ONE function: stall < idle < api < wall. Three timeouts
  // that disagree about which fires first is the bug extraTimeouts exists to
  // prevent, and a budget at or past the wall clock could never fire at all.
  assert.match(cli, /stall_clamped/);
  assert.match(shared, /stall < idle < api <\s+wall/);
  assert.match(shared, /Engine `cli` only/);

  // THE THREE PROGRESS SIGNALS. The third is the one that stops the clock
  // firing on a worker that thinks for four minutes and then writes in one go.
  for (const sig of ["stream", "stderr", "declared file"])
    assert.ok(shared.includes(sig), "the contract must name the progress signal: " + sig);
  assert.match(cli, /function declaredFilesFingerprint/);
});

test("the fallback menu is computed, and `ask` never answers itself", () => {
  const shared = read("skills/_shared/extra-dispatch.md");
  const cli = fs.readFileSync(path.join(__dirname, "..", "bin", "cli.js"), "utf8");

  // BOTH DIRECTIONS, the DIY_STEPS precedent: an alternate the CLI offers and
  // the contract never names is an option the lane cannot explain.
  const declared = /const EXTRA_FALLBACK_ALTERNATES = \[([\s\S]*?)\];/.exec(cli);
  assert.ok(declared, "EXTRA_FALLBACK_ALTERNATES must exist in bin/cli.js");
  const names = [...declared[1].matchAll(/agent: "([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.equal(names.length, 3);
  for (const n of names) assert.ok(shared.includes("`" + n + "`"), "the contract never names the alternate: " + n);

  // Under `ask` NOTHING has been chosen. A trace line naming an agent would be
  // a decision /orc-retro aggregates as one that was made.
  assert.match(cli, /pending \(extra_fallback_agent=ask\)/);
  assert.match(shared, /the lane does not choose/);
  // It changes WHO, never WHAT.
  assert.match(shared, /It changes WHO, never WHAT/);
});

test("the six refusals in the contract are the six the CLI can emit", () => {
  const shared = read("skills/_shared/extra-dispatch.md");
  const cli = fs.readFileSync(path.join(__dirname, "..", "bin", "cli.js"), "utf8");
  const declared = /const EXTRA_RESUME_REFUSALS = \[([\s\S]*?)\];/.exec(cli);
  assert.ok(declared, "EXTRA_RESUME_REFUSALS must exist in bin/cli.js");
  const names = [...declared[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  assert.equal(names.length, 6);
  // BOTH DIRECTIONS — the DIY_STEPS precedent. A refusal the code can emit and
  // the contract never names is a refusal the lane cannot render.
  for (const n of names) assert.ok(shared.includes("`" + n + "`"), "the contract never names the refusal: " + n);
});

test("the attribution verdicts and the fidelity table match the CLI in both directions", () => {
  const shared = read("skills/_shared/extra-dispatch.md");
  const cli = fs.readFileSync(path.join(__dirname, "..", "bin", "cli.js"), "utf8");

  const verdicts = /const EXTRA_ATTRIBUTION = \[([\s\S]*?)\];/.exec(cli);
  const names = [...verdicts[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["provider", "network", "local", "worker", "orc"]);
  for (const n of names) assert.ok(shared.includes("| `" + n + "` |"), "the verdict table is missing a row for " + n);
  // The one that changes the recovery.
  assert.match(shared, /Attribution `network` HOLDS THE WAVE/);
  assert.match(shared, /a report with no way to blame its own author is\s+not a report anybody should trust/);

  const fid = /const EXTRA_JOURNAL_FIDELITY = \{([\s\S]*?)\};/.exec(cli);
  assert.match(fid[1], /api: "per-turn"/);
  assert.match(fid[1], /"claude-shim": "per-turn"/);
  assert.match(fid[1], /cli: "streamed-opaque"/);
  for (const row of ["| `api` |", "| `claude-shim` |", "| `cli` |"]) assert.ok(shared.includes(row));
  assert.match(shared, /A gap that is not reported reads as a capability/);
});

test("a resumed return owes `resume_state`, and §6's before-side moves to the journal baseline", () => {
  const rv = read("skills/_shared/return-validation.md");
  for (const f of ["`resume_state`", "`preexisting_read[]`", "`journal_fidelity`"])
    assert.ok(rv.includes(f), "§2b never mentions " + f);
  assert.match(rv, /absent on a resume slice is MALFORMED/i);
  // WITHOUT THIS SENTENCE the first resumed wave gates itself on the work it
  // just recovered.
  assert.match(rv, /On a RESUMED task the "before" side of the delta is the JOURNAL\s+BASELINE/);
});

test("the two new trace verbs are registered where the lane reads them", () => {
  const proto = read("skills/_shared/phases/trace.md");
  assert.ok(proto.includes("EXTRA resume task="));
  assert.ok(proto.includes("EXTRA orphan task="));
  assert.match(proto, /A resume that leaves no line cannot be counted/);
  const shared = read("skills/_shared/extra-dispatch.md");
  assert.ok(shared.includes("EXTRA resume task=T-2 attempt=2 :: from=stream-interrupted"));
  // Ownership: the CLI composes, the LANE emits the two it alone can know about.
  assert.match(shared, /`EXTRA fallback` and `EXTRA orphan` lines are the \*\*lane's\*\* to emit/);
});
