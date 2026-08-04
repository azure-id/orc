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

test("the Opus-5-only ladder is 3 contiguous bands covering 0..100 with no gap or overlap", () => {
  const cfg = read("skills/orc/config.md");
  const rows = bandTable(cfg, "### The Opus-5-only ladder");
  assert.strictEqual(rows.length, 3, "three bands");
  assert.deepStrictEqual(
    rows.map((r) => [r.lo, r.hi, r.agent]),
    [
      [0, 40, "orc-executor-opus-5-low"],
      [40, 80, "orc-executor-opus-5-med"],
      [80, 100, "orc-executor-opus-5-high"],
    ],
    "the resolved 3-band table"
  );
  // Contiguity is the property the requested edges got wrong (a 30–40 gap and a
  // doubly-owned 80): each band starts where the previous ended, top is closed.
  assert.strictEqual(rows[0].lo, 0, "starts at 0");
  for (let i = 1; i < rows.length; i++)
    assert.strictEqual(rows[i].lo, rows[i - 1].hi, `band ${i} starts where band ${i - 1} ends`);
  assert.ok(rows[2].closed, "the top band is CLOSED at 100");

  // Band-edge exactness, stated as the resolution a scorer must perform.
  const resolve = (score) => {
    const hit = rows.find((r) => score >= r.lo && (r.closed ? score <= r.hi : score < r.hi));
    return hit && hit.agent;
  };
  for (const [score, want] of [
    [0, "orc-executor-opus-5-low"],
    [39, "orc-executor-opus-5-low"],
    [40, "orc-executor-opus-5-med"],
    [79, "orc-executor-opus-5-med"],
    [80, "orc-executor-opus-5-high"],
    [100, "orc-executor-opus-5-high"],
    // the risk floor raises the SCORE, then the table maps it
    [70, "orc-executor-opus-5-med"],
  ])
    assert.strictEqual(resolve(score), want, `score ${score}`);
});

test("the default 8-band table is untouched by the preset", () => {
  const cfg = read("skills/orc/config.md");
  const rows = bandTable(cfg, "## Score → model table");
  assert.strictEqual(rows.length, 8, "still eight default bands");
  assert.strictEqual(rows[0].agent, "orc-executor-haiku-4-5");
  assert.strictEqual(rows[7].agent, "orc-executor-opus-5-high");
  assert.ok(rows[7].closed, "top band closed at 100");
});

test("table resolution states its precedence, and the pinned interactions", () => {
  const cfg = read("skills/orc/config.md");
  const res = cfg.slice(cfg.indexOf("### Resolution — highest wins"), cfg.indexOf("### Override"));
  // v0.36.0 inverted the top two: opus5_only FORCES, so it outranks a
  // hand-written table instead of yielding to it.
  const order = ["opus5_only", "rubric_bands_override", "default 8-band"];
  let at = -1;
  for (const t of order) {
    const i = res.indexOf(t);
    assert.ok(i > at, `${t} appears, after the higher-precedence entry`);
    at = i;
  }
  assert.match(res, /FORCES/, "the resolution section says the mode forces");

  // Each interaction the preset could silently contradict.
  const eam = read("skills/orc/references/effort-and-mode.md");
  assert.match(eam, /risk floor still applies/i, "the risk floor still applies");
  assert.match(eam, /opus-5-med.*not.*opus-4-7-high|not\s+`?opus-4-7-high/s, "…and where a floored task lands");
  assert.match(eam, /fable5_roles` never covers executors/, "fable5 is orthogonal");

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
  const gates = read("skills/orc/references/analyst-gates.md");
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

// ── v0.37.0 stacked PRs ────────────────────────────────────────────────────

test("the stacked-PR config defaults agree between the CLI and the documented config", () => {
  // Documented drift the token lint cannot see: it asserts a key is REFERENCED,
  // never that the two sides agree on its VALUE. A CLI default of 1000 beside a
  // documented 2000 makes the ship gate fire at a threshold nobody expects.
  const cli = fs.readFileSync(path.join(__dirname, "..", "bin", "cli.js"), "utf8");
  const cfg = read("skills/orc/config.md");
  const defs = { stacked_pr: "ask", stacked_pr_loc: "1000", stacked_pr_files: "20", stacked_pr_max_layers: "6" };
  for (const [key, want] of Object.entries(defs)) {
    const m = new RegExp('\\{\\s*key:\\s*"' + key + '",\\s*def:\\s*"?([^",]+)"?,').exec(cli);
    assert.ok(m, `${key} is a CONFIG_META row`);
    assert.strictEqual(m[1].trim(), want, `${key} CLI default`);
    const doc = new RegExp("^" + key + ":\\s*(\\S+)", "m").exec(cfg);
    assert.ok(doc, `${key} is documented in config.md`);
    assert.strictEqual(doc[1], want, `${key} documented default matches the CLI`);
  }
});

test("the ship gate is an OR of two thresholds, degrades to a regular PR, and never lives in a speed lane", () => {
  const gate = read("skills/orc/subskills/orc-pr/stack-gate.md");
  const spine = read("skills/orc/SKILL.md");
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
