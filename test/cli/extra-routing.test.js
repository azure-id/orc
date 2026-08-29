"use strict";
// @test-pool net  — stands up the fake provider on loopback
// `orc extra` — the routing table and THE resolver.
//
// The load-bearing assertion here is the THREE-WAY agreement. `bin/cli.js` used
// to hold two copies of the score ladder that had already drifted in NAME
// (OPUS5_SCORE_TABLE vs OPUS5_BANDS), one feeding the config/UI view and one
// feeding /orc-budget's forecast. Extra adds a third consumer — the dispatch
// resolver — and a disagreement between them is not a cosmetic bug: it is a
// forecast priced at Opus rates for a run that will execute on DeepSeek.
//
// So: for every band edge, what `orc config list --json` SHOWS, what
// `orc extra resolve` DISPATCHES to, and what `orc extra route` prints as the
// Claude fall-through must be the same agent.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tmpdir, rmrf, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const SECRET_KEY = "sk-live-PLANTEDSECRET0123456789";


function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, args, env) => cli([...args, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);
const setCfg = (p, text) => {
  fs.mkdirSync(path.join(p.root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), text);
};

// A verified profile with one route row, without spending a cent.
async function armed(p, band, model) {
  const f = await fakeProvider("models");
  run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", `http://127.0.0.1:${f.port}`, "--env-key", "K"]);
  const ping = run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY });
  assert.equal(ping.status, 0, "the fixture profile must verify: " + ping.stdout + ping.stderr);
  if (band) {
    const r = run(p, ["extra", "route", "set", band, `ds/${model || "fake-flash"}`, "--json"]);
    assert.equal(r.status, 0, "route set failed: " + r.stdout + r.stderr);
  }
  f.stop();
}

// Every edge of the default 8-band table and of the opus5_only 3-band ladder.
const EDGES = [0, 29, 30, 39, 40, 54, 55, 64, 65, 69, 70, 79, 80, 89, 90, 100];
const agentAt = (rows, score) =>
  (rows.find((r) => score >= r.from && (r.inclusive_to ? score <= r.to : score < r.to)) || {}).agent;

test("GOLDEN: the config view, the resolver and the route fall-through name the SAME agent", () => {
  for (const forced of [false, true]) {
    const p = project();
    if (forced) setCfg(p, "opus5_only: true\n");
    const table = json(run(p, ["config", "list", "--json"])).score_table;
    const shown = forced ? table.opus5_only : table.default;
    assert.equal(table.active, forced ? "opus5_only" : "default");
    assert.equal(table.extra, null, "no route rows, so no overlay");

    // The fall-through rows `orc extra route` prints must tile 0-100 with the
    // same agents — a table that showed only foreign bands would not be the
    // routing table.
    const fall = json(run(p, ["extra", "route", "--json"])).claude_fallthrough;
    assert.equal(fall[0].from, 0);
    assert.equal(fall[fall.length - 1].to, 100);

    for (const score of EDGES) {
      const resolved = json(run(p, ["extra", "resolve", String(score), "--json"]));
      const expected = agentAt(shown, score);
      assert.equal(resolved.claude.agent, expected, `score ${score} (${forced ? "opus5_only" : "default"}): resolver says ${resolved.claude.agent}, the config view says ${expected}`);
      const gap = fall.find((g) => score >= g.from && (g.to >= 100 ? score <= 100 : score < g.to));
      assert.equal(gap.agent, expected, `score ${score}: the route fall-through says ${gap.agent}`);
      assert.equal(resolved.claude.table, forced ? "opus5_only" : "default");
    }
    rmrf(p.root);
  }
});

test("R17: every route row carries a plain reading of its range, in BOTH surfaces", async () => {
  // `[0,30)` is developer notation. The half-open bracket is load-bearing so it
  // stays, but a routing table nobody can read is a routing table nobody sets —
  // and the plain-language label must be computed HERE, never written in the
  // panel: prose beside a score is the panel deciding what a score means.
  const p = project();
  const j = json(run(p, ["extra", "route", "--json"]));
  assert.ok(j.rows.length, "the Claude fall-through is always printed");
  for (const r of j.rows) {
    // Scores are integers, so the half-open edge translates EXACTLY. This is a
    // reading of the notation, never an approximation of it.
    const hi = r.to >= 100 ? 100 : r.to - 1;
    assert.equal(r.range, r.from === hi ? `score ${r.from}` : `scores ${r.from} to ${hi}`, r.band);
    assert.equal(typeof r.meaning, "string", `${r.band} says what a score in it describes`);
    assert.ok(r.meaning.length > 10, r.band);
  }
  // The anchors the per-row meaning is built from, so a reader can see the whole
  // ladder rather than only the rows they happen to have.
  assert.ok(Array.isArray(j.band_meanings) && j.band_meanings.length >= 4);
  assert.equal(j.band_meanings[0].from, 0);
  assert.equal(j.band_meanings[j.band_meanings.length - 1].to, 100);

  // "--json is not a summary" (v0.49.1), and it runs in BOTH directions: a field
  // one surface prints and the other omits is drift no lint can see.
  const human = run(p, ["extra", "route"]).stdout;
  for (const r of j.rows) assert.ok(human.includes(r.range), `the human path prints ${r.band}'s range`);
  for (const m of j.band_meanings) assert.ok(human.includes(m.meaning), "and every anchor's sentence");
});

test("route set: overlap is refused BY NAME; a gap is Claude and keeps its slot", async () => {
  const p = project();
  await armed(p, "0-30");

  let r = run(p, ["extra", "route", "set", "20-50", "ds/fake-pro", "--json"]);
  assert.equal(r.status, 1);
  let j = json(r);
  assert.equal(j.reason, "overlap");
  assert.equal(j.conflicts_with.from, 0, "the refusal names the row it clashes with");
  assert.match(j.error, /orc extra route rm 0-30/, "and names the command that clears it");

  // Tiling is NOT required. The gaps are the point, and they are PRINTED —
  // "I left the top band on Opus on purpose" and "there is no top band" must
  // never look the same.
  j = json(run(p, ["extra", "route", "--json"]));
  assert.equal(j.foreign.length, 1);
  assert.ok(j.claude_fallthrough.length > 0);
  assert.equal(j.claude_fallthrough[0].from, 30, "the fall-through starts where the foreign row ends");
  assert.equal(j.claude_fallthrough[j.claude_fallthrough.length - 1].to, 100);

  // A band spec that is empty or backwards is refused with the shape it wanted.
  for (const bad of ["50-50", "70-30", "banana", "0-200"]) {
    const bad_r = run(p, ["extra", "route", "set", bad, "ds/fake-flash", "--json"]);
    assert.equal(bad_r.status, 1, `"${bad}" must be refused`);
  }
  rmrf(p.root);
});

test("route set: an UNVERIFIED profile is refused; a model outside models_seen only WARNS", async () => {
  const f = await fakeProvider("models");
  const p = project();
  run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", `http://127.0.0.1:${f.port}`, "--env-key", "K"]);

  let r = run(p, ["extra", "route", "set", "0-30", "ds/fake-flash", "--json"]);
  assert.equal(r.status, 1);
  assert.equal(json(r).reason, "unverified", "nothing routes to an unproven endpoint");

  run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY });
  // A provider may add a model between pings. Refusing would make ORC's cache
  // the authority on someone else's catalogue.
  r = run(p, ["extra", "route", "set", "0-30", "ds/fake-turbo", "--json"]);
  assert.equal(r.status, 0);
  assert.equal(json(r).model_known, false);

  // …but it IS a doctor finding, so it surfaces before a mid-wave 404.
  const doc = run(p, ["extra", "doctor", "--json"]);
  assert.equal(doc.status, 1);
  assert.ok(json(doc).findings.some((x) => x.id === "extra-model-gone"));

  f.stop();
  rmrf(p.root);
});

test("THE RESOLVER explains every answer, and four gates can hold a task back", async () => {
  const p = project();
  await armed(p, "0-30");

  // 1. The master gate. Nothing changes unless extra_enabled is true.
  let j = json(run(p, ["extra", "resolve", "25", "--json"]));
  assert.equal(j.resolved, "claude");
  assert.match(j.why, /extra_enabled is false/);

  setCfg(p, "extra_enabled: true\n");

  // 2. The role gate — executor only by default.
  j = json(run(p, ["extra", "resolve", "25", "--role", "reviewer", "--json"]));
  assert.equal(j.resolved, "claude");
  assert.equal(j.held_back, "role");

  // Armed, in role, in band: it goes foreign — and says so.
  const r = run(p, ["extra", "resolve", "25", "--json"]);
  assert.equal(r.status, 0, "exit 0 = extra");
  j = json(r);
  assert.equal(j.resolved, "extra");
  assert.equal(j.via, "extra:ds");
  assert.match(j.announce, /sends the slice to a third party/, "P0's sentence is composed HERE, so no lane writes a second wording");
  assert.ok(j.claude.agent, "the Claude answer it displaced is always carried, so a fallback needs no second lookup");

  // 3. The risk gate. The SAME score, held back — and the hold-back is named,
  // never silent.
  const risky = run(p, ["extra", "resolve", "25", "--risk", "1", "--json"]);
  assert.equal(risky.status, 1);
  j = json(risky);
  assert.equal(j.resolved, "claude");
  assert.equal(j.held_back, "risk");
  assert.equal(j.would_have_been.profile, "ds", "it says what it refused, not just that it refused");
  assert.match(j.why, /extra_risk_tasks is off/);

  // …and the gate opens when the user says so.
  setCfg(p, "extra_enabled: true\nextra_risk_tasks: on\n");
  assert.equal(json(run(p, ["extra", "resolve", "25", "--risk", "1", "--json"])).resolved, "extra");

  // 4. Extra is an OVERLAY: a score no row covers falls straight through.
  j = json(run(p, ["extra", "resolve", "85", "--json"]));
  assert.equal(j.resolved, "claude");
  assert.match(j.why, /OVERLAY/);
  rmrf(p.root);
});

test("the shadow runs BOTH WAYS and is never silent", async () => {
  const p = project();
  await armed(p, "0-30");
  setCfg(p, "extra_enabled: true\nopus5_only: true\n");

  const cfg = json(run(p, ["config", "list", "--json"]));
  // The truth is a composite, and a single word would be a lie about what the
  // next dispatch does.
  assert.equal(cfg.score_table.active, "extra+opus5_only");
  assert.equal(cfg.score_table.base, "opus5_only");
  assert.deepEqual(cfg.score_table.resolve_order, ["extra", "opus5_only", "rubric_bands_override", "default"]);
  assert.equal(cfg.score_table.extra.length, 1);
  assert.equal(cfg.score_table.extra[0].agent, null, "no Claude agent runs a foreign band");

  const o5 = cfg.keys.find((k) => k.key === "opus5_only");
  assert.equal(o5.is_shadowed, true);
  assert.match(o5.shadow_reason, /partly shadowed by extra_enabled/);
  assert.match(o5.shadow_reason, /\[0,30\)/, "the honest report is WHICH RANGES were taken");
  // v0.55.0 — the sentence names the taken POSITIONS beside the taken bands.
  assert.match(o5.shadow_reason, /every other score and position still resolves here/);
  // v1.0.0 W1 — AND THE WHOLE SENTENCE, byte for byte. W2 rewrites
  // `shadowReason()` to derive from a family table instead of branching on key
  // names; the regexes above would keep passing through a re-word, and a
  // re-word is the one thing that refactor is not allowed to be. The rest of
  // the freeze is in test/goldens.test.js — this half lives here because it is
  // the only shadow sentence that needs a verified profile to produce.
  assert.strictEqual(
    o5.shadow_reason,
    "partly shadowed by extra_enabled — [0,30) is routed to a non-Claude worker; " +
      "every other score and position still resolves here"
  );
  // The OTHER half of the both-ways case: a hand-edited table is partly
  // shadowed by the same rows, and its sentence carries no position clause —
  // `opus5_only` is the only key a taken SLOT can shadow.
  setCfg(p, "extra_enabled: true\nrubric_bands_override: \"[[0,50]]\"\n");
  const rb = json(run(p, ["config", "list", "--json"])).hand_edited.find(
    (h) => h.key === "rubric_bands_override"
  );
  assert.strictEqual(
    rb.shadow_reason,
    "partly shadowed by extra_enabled — [0,30) is routed to a non-Claude worker; " +
      "every other score and position still resolves here"
  );
  setCfg(p, "extra_enabled: true\nopus5_only: true\n");

  // And at SET time, both directions.
  let r = run(p, ["config", "set", "opus5_only", "true"]);
  assert.match(r.stderr, /\[0,30\).*routed to a non-Claude worker/s);
  assert.match(r.stderr, /INERT in \/orc-quick/, "a shadowed setting must never be silent");
  rmrf(p.root);
});

test("the fifteen config keys exist, with the defaults the contract states", () => {
  const p = project();
  const keys = json(run(p, ["config", "list", "--json"])).keys.filter((k) => k.key.startsWith("extra_"));
  const by = Object.fromEntries(keys.map((k) => [k.key, k]));
  // v0.52.0 added the TENTH: the deadline the passphrase picker opens on.
  // v0.54.0 adds the eleventh and twelfth — recovery — and BOTH are justified
  // rather than assumed (the contract lists the four keys it refused to add).
  // The count is still the feature: the combinatorial part (providers x models
  // x bands) is a LEDGER with a CLI and a panel, not a YAML block.
  // v0.56.1 adds the thirteenth and fourteenth entries here — `extra_stall_s`
  // and `extra_fallback_agent` — and both come from the same observed failure:
  // a foreign worker that goes quiet mid-task. (The contract counts the keys a
  // user configures; this list also carries the deprecated members.)
  // v1.0.0 W5 adds the fifteenth and sixteenth entries here —
  // `extra_demote_after` and `extra_demote_stale_min` — and both are NUMBERS
  // WITH A DOCUMENTED OFF VALUE rather than a switch: the two zeros already are
  // the off switch, and a master key over them would be a third spelling of one
  // thing.
  assert.equal(keys.length, 16, "the combinatorial part is a ledger, not YAML");
  // THE DEMOTION CLOCKS. Two clocks, because they measure different things: one
  // counts attempts that ENDED, the other watches an attempt that has NOT.
  assert.equal(by.extra_demote_after.default, 2);
  assert.equal(by.extra_demote_stale_min.default, 20);
  assert.ok(by.extra_demote_after.options.includes(0), "0 must be offered — it is half the off switch");
  assert.ok(by.extra_demote_stale_min.options.includes(0), "and 0 here is the other half");
  assert.equal(by.extra_demote_after.gated_by, "extra_enabled");
  assert.equal(by.extra_demote_stale_min.gated_by, "extra_enabled");
  // A demotion is RUN state. The description has to say so, or somebody reads
  // it as a setting that turned their subsystem off.
  assert.match(by.extra_demote_after.desc, /never writes your config|RUN state|run state/i);
  // THE STALL CLOCK. Not a second wall clock: it is reset by observable
  // progress, so it never fires on a worker that is merely slow.
  assert.equal(by.extra_stall_s.default, 180);
  assert.ok(by.extra_stall_s.options.includes(0), "0 must be offered — it is how you turn the clock off");
  assert.match(by.extra_stall_s.desc, /reset by observable progress/i);
  // WHO PICKS THE TASK UP. `band` is the pre-v0.56.1 behaviour and stays the
  // default: a fallback that changes tier is a re-plan nobody asked for.
  assert.equal(by.extra_fallback_agent.default, "band");
  assert.equal(run(p, ["config", "set", "extra_fallback_agent", "ask"]).status, 0);
  assert.equal(run(p, ["config", "set", "extra_fallback_agent", "orc-executor-opus-5-low"]).status, 0);
  // A typo must land as a refusal, never as a dispatch to a name nothing
  // answers to.
  assert.equal(run(p, ["config", "set", "extra_fallback_agent", "opus5"]).status, 1);
  // DEFAULT `on`, because `off` is what is broken: a from-scratch re-dispatch
  // onto a half-written file either discards work already paid for or
  // improvises against a stale mental model.
  assert.equal(by.extra_resume.default, "on");
  assert.deepEqual(by.extra_resume.options, ["on", "off"]);
  // Bounded: the cap STOPS with an honest report, never a silent third loop.
  assert.equal(by.extra_resume_max.default, 2);
  assert.equal(run(p, ["config", "set", "extra_resume", "maybe"]).status, 1);
  assert.equal(run(p, ["config", "set", "extra_resume", "off"]).status, 0);
  assert.equal(by.extra_enabled.default, false, "nothing changes unless it is armed");
  assert.equal(by.extra_roles.default, "[executor]", "a reviewer you cannot trust is worse than no reviewer");
  assert.equal(by.extra_risk_tasks.default, "off");
  assert.equal(by.extra_on_failure.default, "fallback", "a failed foreign dispatch is never a dead run");
  assert.equal(by.extra_max_concurrent.default, 1);
  assert.equal(by.extra_unlock.default, "per-run");
  assert.equal(by.extra_vault_max_attempts.default, 10);
  assert.equal(by.extra_verify_max_days.default, 7);
  assert.equal(by.extra_timeout_s.default, 900);
  // A passphrase saved beside the vault it opens is a DEADLINE, not a second
  // factor. There is no 0 and no "forever" in the set.
  assert.equal(by.extra_passphrase_ttl_days.default, 30);
  assert.deepEqual(by.extra_passphrase_ttl_days.options, [1, 3, 7, 14, 30, 90, 180, 360]);
  assert.equal(run(p, ["config", "set", "extra_passphrase_ttl_days", "0"]).status, 1);
  assert.equal(run(p, ["config", "set", "extra_passphrase_ttl_days", "90"]).status, 0);

  // The counter is inspectable, NOT disableable.
  assert.equal(run(p, ["config", "set", "extra_vault_max_attempts", "0"]).status, 1);
  assert.equal(run(p, ["config", "set", "extra_vault_max_attempts", "3"]).status, 0);
  // A role that is not a dispatched role is refused by name.
  assert.equal(run(p, ["config", "set", "extra_roles", "executor,orchestrator"]).status, 1);
  assert.equal(run(p, ["config", "set", "extra_roles", "executor,reviewer"]).status, 0);
  rmrf(p.root);
});

test("orc extra lanes: the lane table is CODE, and it matches the markdown BOTH WAYS", () => {
  // D6. The routing table says `[40,55) -> opencode/big-pickle`, which is true
  // for `/orc` and is not how `/orc-fast` works: that lane pins ONE executor and
  // resolves its BAND at both edges. The rule was implemented and written down,
  // and rendered nowhere. `EXTRA_LANE_SHAPES` is the machine-readable copy of
  // the markdown table, and this is the DIY_STEPS <-> stitch-order golden test
  // applied to it: a lane in one and not the other fails.
  const cliSrc = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "cli.js"), "utf8");
  const md = fs.readFileSync(
    path.join(__dirname, "..", "..", "templates", "skills", "_shared", "extra-dispatch.md"),
    "utf8"
  );

  const constBlock = (cliSrc.match(/const EXTRA_LANE_SHAPES = \[([\s\S]*?)\n\];/) || ["", ""])[1];
  const inCode = new Set([...constBlock.matchAll(/lane: "(\/[a-z-]+)"/g)].map((m) => m[1]));

  const table = (md.match(/## Which lanes route foreign([\s\S]*?)\n---/) || ["", ""])[1];
  const inMd = new Set();
  for (const m of table.matchAll(/`(\/orc[a-z-]*)`/g)) inMd.add(m[1]);

  for (const lane of inMd) assert.ok(inCode.has(lane), `${lane} is in the markdown table and not in EXTRA_LANE_SHAPES`);
  for (const lane of inCode) assert.ok(inMd.has(lane), `${lane} is in EXTRA_LANE_SHAPES and not in the markdown table`);
  assert.ok(inCode.size >= 12, "the table is the whole set of lanes, not a sample");
});

test("orc extra lanes: a fixed-executor lane resolves BOTH EDGES, and disagreement stays on Claude", async () => {
  const p = project();
  const f = await fakeProvider("models");
  const base = `http://127.0.0.1:${f.port}`;

  // Nothing armed: every lane answers, and none of them answers `foreign`.
  let j = json(run(p, ["extra", "lanes", "--json"]));
  assert.equal(j.ok, true);
  assert.ok(j.lanes.every((l) => l.routes !== "foreign"));
  // The lanes that NEVER route say so whatever the config is — a measuring
  // instrument you swapped for a different model is measuring something else.
  assert.equal(j.lanes.find((l) => l.lane === "/orc-challenge").routes, "never");
  // v0.55.0 — /orc-quick is `gated-choice`, not inert: the slot adds a THIRD
  // OPTION to the menu it already shows, and never a default.
  assert.equal(j.lanes.find((l) => l.lane === "/orc-quick").shape, "gated-choice");
  assert.equal(j.lanes.find((l) => l.lane === "/orc-quick").routes, "claude");

  assert.equal(
    run(p, ["extra", "add", "w", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K"]).status,
    0
  );
  const pinged = run(p, ["extra", "ping", "w", "--json"], { K: SECRET_KEY });
  assert.equal(pinged.status, 0, pinged.stdout + pinged.stderr);
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: true\nextra_roles: [executor]\n");

  // A row covering only PART of `/orc-mini`'s band [55,65): one edge foreign,
  // one edge not. The lane stays on Claude and NAMES the row that partially
  // covered it — a midpoint would have captured the whole lane on the strength
  // of a few scores out of ten.
  //
  // v0.55.0 — `/orc-mini` is the LAST lane on this shape, and deliberately so:
  // mini SCORES its tasks and then pins one executor over them, so both edges
  // of that agent's band is a question about numbers the run really produced.
  // `/orc-fast` produces none, so it became a POSITION instead.
  run(p, ["extra", "route", "set", "55-58", "w/m1", "--json"]);
  j = json(run(p, ["extra", "lanes", "--json"]));
  let mini = j.lanes.find((l) => l.lane === "/orc-mini");
  assert.equal(mini.shape, "fixed-executor");
  assert.deepEqual(mini.edges, [55, 64]);
  assert.equal(mini.agree, false);
  assert.equal(mini.routes, "claude");
  assert.match(mini.detail, /covers only part of this band/);

  // Widen it to the whole band and both edges agree, so the lane goes foreign.
  run(p, ["extra", "route", "rm", "55-58", "--json"]);
  run(p, ["extra", "route", "set", "55-65", "w/m1", "--json"]);
  j = json(run(p, ["extra", "lanes", "--json"]));
  mini = j.lanes.find((l) => l.lane === "/orc-mini");
  assert.equal(mini.agree, true);
  assert.equal(mini.routes, "foreign");
  assert.equal(mini.resolved.profile, "w");
  assert.equal(mini.resolved.model, "m1");
  // `/orc` is SCORED, so it has no band and no edges — per-task is the answer.
  assert.equal(j.lanes.find((l) => l.lane === "/orc").routes, "per-task");
  // v0.55.0 — /orc-ultra runs the `orc` skill and writes its own trace, so its
  // absence from this table was a gap.
  assert.equal(j.lanes.find((l) => l.lane === "/orc-ultra").routes, "per-task");

  // A SLOT lane resolves POSITIONS, not a band: no `edges`, no `agree`, and one
  // row per position each carrying the agent it displaces.
  const doc = j.lanes.find((l) => l.lane === "/orc-doc");
  assert.equal(doc.shape, "slot");
  assert.equal(doc.band, undefined, "a slot is a point, not an interval");
  assert.deepEqual(doc.slots.map((x) => x.slot), ["doc-writer", "doc-checker"]);
  assert.ok(doc.slots.every((x) => x.routes === false));
  assert.equal(doc.slots[0].claude, "orc-doc-writer-opus-5-med");
  assert.equal(doc.slots[1].claude, "orc-doc-checker-opus-5-low");
  assert.equal(doc.routes, "claude");

  // And once a position is held, the lane says which one.
  assert.equal(run(p, ["extra", "role", "set", "doc-writer", "w/m1", "--json"]).status, 0);
  j = json(run(p, ["extra", "lanes", "--json"]));
  const doc2 = j.lanes.find((l) => l.lane === "/orc-doc");
  assert.equal(doc2.routes, "roles");
  assert.equal(doc2.slots[0].routes, true);
  assert.equal(doc2.slots[1].routes, false, "the checker resolves its OWN position, never the writer's");
  assert.match(doc2.detail, /doc-writer/);

  // /orc-quick is OFFERED, never applied: the verdict word is its own.
  assert.equal(run(p, ["extra", "role", "set", "quick-executor", "w/m1", "--json"]).status, 0);
  j = json(run(p, ["extra", "lanes", "--json"]));
  const q = j.lanes.find((l) => l.lane === "/orc-quick");
  assert.equal(q.routes, "offered");
  assert.match(q.detail, /never becomes a default/);
  f.stop();
  rmrf(p.root);
});

test("orc extra doctor: 0 clean / 1 findings, and an unrecoverable one says so", async () => {
  const p = project();
  // No ledger at all is not a finding — there is nothing to be wrong about.
  assert.equal(run(p, ["extra", "doctor", "--json"]).status, 0);

  const f = await fakeProvider("models");
  run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", `http://127.0.0.1:${f.port}`, "--env-key", "NOT_SET_ANYWHERE"]);
  const j = json(run(p, ["extra", "doctor", "--json"]));
  const ids = j.findings.map((x) => x.id);
  assert.ok(ids.includes("extra-unverified"), "a profile nothing can route to is worth saying");
  assert.ok(ids.includes("extra-missing-key"));
  f.stop();
  rmrf(p.root);
});
