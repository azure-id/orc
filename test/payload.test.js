"use strict";
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
    "agents/orc-planner-fable-5.md",
    "agents/orc-planner-mini-sonnet-5-high.md",
  ]) {
    const md = read(agent);
    for (const n of v.novelty) assert.ok(md.includes(n), `${agent} names novelty:${n}`);
    for (const l of v.logic) assert.ok(md.includes(l), `${agent} names logic:${l}`);
    for (const c of v.riskClasses) assert.ok(md.includes(c), `${agent} names risk class ${c}`);
  }
});

test("tdd_spec entries carry a kind, and both branches of pre-implementation green are defined", () => {
  const schema = read("skills/orc/schemas/planning-output.md");
  const spec = schema.slice(schema.indexOf("tdd_spec:"), schema.indexOf("facets:"));
  assert.match(spec, /kind:\s*enum/, "tdd_spec entries carry a kind");
  assert.match(spec, /new-surface/, "new-surface kind defined");
  assert.match(spec, /regression-guard/, "regression-guard kind defined");
  assert.match(spec, /MUST be red/, "new-surface must be red pre-implementation");
  assert.match(spec, /EXPECTED green/, "regression-guard is expected green");

  // …and the orchestrator's Wave 0 step must READ the kind, not blanket-block.
  const spine = read("skills/orc/SKILL.md");
  const wave0 = spine.slice(spine.indexOf("Wave 0 — TDD red proof"), spine.indexOf("1. Dispatch EVERY task"));
  assert.match(wave0, /per entry `kind`/, "Wave 0 reads the entry kind");
  assert.match(wave0, /regression-guard.*EXPECTED|EXPECTED.*regression-guard/s, "a regression guard passing blocks nothing");
});

test("the Phase 1 exit gate bounces a tdd_spec / new-tests task collision", () => {
  const gates = read("skills/orc/references/analyst-gates.md");
  const exit = gates.slice(gates.indexOf("## Phase 1 exit gate"));
  assert.match(exit, /tdd_spec/, "the gate knows about tdd_spec");
  assert.match(exit, /new-tests/, "…and about a new-tests task targeting the same file");
});

test("orchestrator-synthesized tasks have ONE derived scoring rule, referenced from both sites", () => {
  const wg = read("skills/orc/references/wave-grouping.md");
  const sec = wg.slice(wg.indexOf("## Orchestrator-synthesized tasks"));
  assert.ok(sec, "the general rule exists");
  assert.match(sec, /DERIVED, never judged/, "the vector is derived");
  assert.match(sec, /mechanical/, "novelty is pinned to mechanical");
  assert.match(sec, /does NOT inherit the risk floor/, "Wave 0's risk-floor question is answered");

  // Both instances must point at it rather than re-deciding locally.
  assert.match(read("skills/orc/SKILL.md"), /orchestrator-SYNTHESIZED/i, "Wave 0 points at the rule");
  const drift = read("skills/_shared/drift-recovery.md");
  assert.match(drift, /DISPATCHED like any task/, "the mock example names its actor");
  assert.match(drift, /wave-grouping\.md/, "…and points at the same scoring rule");
  assert.match(drift, /DELETE or overwrite the previous `EXAMPLE\.md`/, "the stale example is removed on re-offer");
});

test("every lane has a TDD policy row, and the preflight block defines a rule per printed key", () => {
  const cfg = read("skills/orc/config.md");
  const policy = cfg.slice(cfg.indexOf("Lane policy (fixed"), cfg.indexOf("# --- Security pass"));
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
  assert.match(tddRule, /ON —/, "the normal branch is defined too");
});
