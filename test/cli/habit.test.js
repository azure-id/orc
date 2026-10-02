"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir } = require("../_helpers");
const H = require("../../bin/habit.js");

// ── `orc habit` — the habit engine (v2.0.0 W2) ─────────────────────────────
//
// The spec is `04-habits-spec.md` §3.3's worked values. The decisions in force:
// ONE threshold (propose) and NO automatic level (DE-4), `habits: off` by
// default and off = ZERO BYTES in `orc lane config` (DE-16), an accepted habit
// is the `learned` rank and never a config write (DE-6).

const DAY = 86400000;
const p2 = (n) => String(n).padStart(2, "0");
function stamp(ms) {
  const d = new Date(ms);
  return `[${p2(d.getDate())}${p2(d.getMonth() + 1)}${p2(d.getFullYear() % 100)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.000]`;
}
function project(configText) {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, ".claude", "orc", "logs"), { recursive: true });
  if (configText !== undefined) fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), configText);
  return root;
}
let seq = 0;
// One trace file per call. `answers` is [{qid, chose, by?, pre?, ctx?, offered?, at?}].
function trace(root, lane, answers, extra) {
  seq++;
  const d = new Date();
  const name = `run-${lane}-t${seq}-${p2(d.getDate())}${p2(d.getMonth() + 1)}${p2(d.getFullYear() % 100)}-${p2(seq % 60)}0000.txt`;
  const lines = [];
  for (const a of answers) {
    const pt = H.ASK_POINTS[a.qid];
    const offered = a.offered || (pt && pt.options ? Object.keys(pt.options) : [a.chose]);
    let l = `${stamp(a.at || Date.now())} ${lane}  ASK ${a.qid} :: offered=${offered.join("|")} rec=${a.rec || "none"} chose=${a.chose} by=${a.by || "user"}`;
    if (a.pre) l += ` pre=${a.pre}`;
    if (a.ctx) l += ` ctx=${a.ctx}`;
    lines.push(l);
  }
  if (extra) lines.push(`${stamp(Date.now())} ${lane}  ${extra}`);
  lines.push(`${stamp(Date.now())} ${lane}  FINISH :: done`);
  fs.writeFileSync(path.join(root, ".claude", "orc", "logs", name), lines.join("\r\n") + "\r\n");
  return name;
}
// n answers, oldest first, spaced one minute apart ending `endAgo` ms ago.
function series(qid, choices, endAgo = 60000, extra = {}) {
  const now = Date.now();
  return choices.map((c, i) => Object.assign({ qid, chose: c, at: now - endAgo - (choices.length - 1 - i) * 60000 }, extra));
}
function writeState(root, habits, history) {
  fs.writeFileSync(path.join(root, ".claude", "orc", "habits-state.json"), JSON.stringify({ version: 1, purged_at: null, habits, history: history || [] }));
}
const j = (r) => JSON.parse(r.stdout);
const MOCK = "mini.phase-x.mock";
const MOCK_ID = H.habitId(MOCK, {});

// ── 1. The rule table in §3.3, exactly ──────────────────────────────────────
test("rule: the §3.3 worked values, exactly", () => {
  const table = [
    [5, 5, 0.566, true],
    [9, 10, 0.596, true],
    [8, 9, 0.565, true],
    [7, 9, 0.453, false],
    [12, 15, 0.548, false],
    [10, 10, 0.722, true],
    [16, 16, 0.806, true],
  ];
  for (const [k, n, lb, yes] of table) {
    const r = H.ruleOnCounts(k, n);
    assert.strictEqual(r.lb, lb, `${k}/${n} → ${lb}`);
    assert.strictEqual(r.propose, yes, `${k}/${n} → ${yes ? "propose" : "no"}`);
  }
  // ONE threshold, and no automatic level.
  assert.strictEqual(H.HABIT_RULE.lb, 0.55);
  assert.strictEqual(H.HABIT_RULE.min_n, 5);
  assert.strictEqual(H.HABIT_RULE.last_agree, 3);
  assert.ok(!("act" in H.HABIT_RULE) && !("auto" in H.HABIT_RULE), "there is no second, automatic threshold");
});

test("rule: the same table through the weighted pipeline (recency on)", () => {
  // The worked values are unweighted. With recency, the verdict holds when the
  // off answers are the OLDEST (yes rows) or sit just before the last 3 (no rows).
  const mk = (k, n, oldest) => {
    const a = Array(n).fill("a");
    for (let i = 0; i < n - k; i++) a[oldest ? i : n - 4 - i] = "b";
    return a.map((c) => ({ chose: c, by: "user", pre: null }));
  };
  for (const [k, n, yes] of [[5, 5, true], [9, 10, true], [8, 9, true], [10, 10, true], [16, 16, true], [7, 9, false], [12, 15, false]]) {
    const ev = H.evaluate(mk(k, n, yes));
    assert.strictEqual(ev.passes, yes, `${k}/${n} pipeline lb=${ev.lb}`);
  }
});

test("rule: weights — a learned streak alone never proposes; a pre-selected Enter counts a quarter", () => {
  const learned = Array(30).fill({ chose: "a", by: "learned", pre: "a" });
  assert.strictEqual(H.evaluate(learned).passes, false, "30 by=learned answers never propose");
  assert.strictEqual(H.evaluate(learned).n, 0, "none of them is raw evidence");
  assert.strictEqual(H.evidenceWeight({ by: "user", pre: "a", chose: "a" }), 0.25, "Enter on the pre-selected option");
  assert.strictEqual(H.evidenceWeight({ by: "user", pre: "a", chose: "b" }), 1, "an override counts in full");
  assert.strictEqual(H.evidenceWeight({ by: "ledger", chose: "a" }), 1);
  assert.strictEqual(H.evidenceWeight({ by: "config", chose: "a" }), 0, "config is not a choice");
  assert.strictEqual(H.evidenceWeight({ by: "default", chose: "a" }), 0, "default is not a choice");
});

test("rule: the last-3 guard and the 30-answer window", () => {
  const nine = Array(9).fill({ chose: "a", by: "user" }).concat([{ chose: "b", by: "user" }]);
  assert.strictEqual(H.evaluate(nine).passes, false, "9/10 with the newest answer different never proposes");
  const forty = Array(40).fill({ chose: "a", by: "user" });
  assert.strictEqual(H.evaluate(forty).total, 30, "only the last 30 answers count");
});

test("rule: the ratchet — away from `careful` an apply habit is class never", () => {
  const P = H.ASK_POINTS;
  assert.strictEqual(H.effectiveClass(P["orc.intake.testgen"], "skip", {}), "never");
  assert.strictEqual(H.effectiveClass(P["orc.intake.testgen"], "author", {}), "apply");
  assert.strictEqual(H.effectiveClass(P["orc.phase-2.pause"], "every-2", {}), "never");
  assert.strictEqual(H.effectiveClass(P["orc.phase-2.pause"], "straight", {}), "never");
  assert.strictEqual(H.effectiveClass(P["orc.phase-5-5.security"], "skip", {}), "never");
  assert.strictEqual(H.effectiveClass(P["quick.q3.offer.review"], "commit-direct", {}), "suggest", "suggest stays suggest");
  assert.strictEqual(H.effectiveClass(P["mini.phase-1.complexity"], "continue", { risk: "cited" }), "never", "never when a risk is cited");
  assert.strictEqual(H.effectiveClass(H.pointFor("no.such.point"), "a", {}), "never", "an unknown point is never");
  // Every apply value is on the careful side, so a learned value can only make ORC more careful.
  for (const [qid, p] of Object.entries(P))
    if (p.class === "apply" && p.careful) assert.deepStrictEqual(Object.keys(p.values), [p.careful], qid + " learns only its careful option");
});

// v2.1.0 W5 (A1) — one agent, one spelling. A short form maps to the shipped
// agent it can only mean; an extra slot and an ambiguous family word stay.
test("parser: a gate answer is stored with the canonical agent name", () => {
  const P = (t) => H.parseAskLine("[011026 10:00:00.000] quick  ASK quick.q2.gate.code :: " + t);
  const a = P("offered=sonnet-4-6-med|opus-5-low|deepseek-v4-flash rec=sonnet-4-6-med chose=sonnet-4-6-med by=user");
  assert.deepStrictEqual([a.chose, a.rec, a.offered], ["orc-executor-sonnet-4-6-med", "orc-executor-sonnet-4-6-med", ["orc-executor-sonnet-4-6-med", "orc-executor-opus-5-low", "deepseek-v4-flash"]]);
  assert.strictEqual(P("offered=deepseek-v4-flash|opus-5-low rec=deepseek-v4-flash chose=deepseek-v4-flash by=user").chose, "deepseek-v4-flash", "an extra slot stays");
  assert.strictEqual(P("offered=sonnet|sonnet-5-high|sonnet-4-6-med rec=sonnet chose=sonnet by=user").chose, "sonnet", "two Sonnet agents on the menu: the family word stays");
  assert.strictEqual(P("offered=sonnet|opus|extra rec=sonnet chose=sonnet by=user").chose, "sonnet", "a bare family word with no menu match is never guessed");
  const full = P("offered=orc-executor-sonnet-4-6-med|orc-executor-opus-5-low rec=orc-executor-sonnet-4-6-med chose=orc-executor-sonnet-4-6-med by=user");
  assert.strictEqual(full.chose, a.chose, "the full and the short spelling are ONE option");
  const recon = H.parseAskLine("[011026 10:00:00.000] quick  ASK quick.q2.gate.recon :: offered=sonnet-5-med|opus-5-low rec=sonnet-5-med chose=sonnet-5-med by=user");
  assert.strictEqual(recon.chose, "orc-recon-sonnet-5-med", "the recon gate maps to the recon agent, never the executor");
});

// v2.1.0 W5 (A10, A11) — a run is dated by its trace NAME, and a lane has ONE name.
test("panel data: the trace name dates a run (not mtime), and the lane name is the full one", () => {
  const t = new Date(H.nameTime({ name: "run-quick-ping-route-280926-012109.txt" }));
  assert.deepStrictEqual([t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes()], [2026, 9, 28, 1, 21], "local 28-09-2026 01:21");
  assert.strictEqual(H.nameTime({ name: "notes.txt" }), 0, "no date in the name → the caller falls back to mtime");
  assert.deepStrictEqual(["quick", "orc-quick", "orc", "ultra", "mini"].map(H.laneName), ["orc-quick", "orc-quick", "orc", "orc", "orc-mini"]);
});

// ── 2. The registry and the parser ──────────────────────────────────────────
test("registry: 32 points (v2.1.0 adds any.review.which and fix.f1.class); the parser is CRLF-safe and drops what it cannot read", () => {
  assert.strictEqual(Object.keys(H.ASK_POINTS).length, 32);
  assert.strictEqual(H.ASK_POINTS["fix.f1.class"].class, "never", "a fact is never a habit");
  const ok = H.parseAskLine("[260926 10:00:00.000] quick  ASK quick.q3.offer.review :: offered=review-first|commit-direct|stop rec=review-first chose=review-first by=user ctx=kind=pr,branch=feature\r");
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(ok.ctx, { kind: "pr", branch: "feature" });
  assert.strictEqual(H.parseAskLine("[260926 10:00:00.000] mini  ASK mini.phase-x.mock :: offered=build|skip rec=skip chose=skip by=learned pre=skip").pre, "skip");
  assert.strictEqual(H.parseAskLine("[260926 10:00:00.000] orc  PHASE intake start"), null);
  assert.strictEqual(H.parseAskLine("ASK mini.phase-x.mock :: offered=build|skip rec=skip chose=maybe by=user").ok, false);
  assert.strictEqual(H.parseAskLine("ASK mini.phase-x.mock :: offered=build|skip rec=skip chose=skip by=robot").ok, false);
  assert.strictEqual(H.parseAskLine("ASK mini.phase-x.mock :: offered=build|skip rec=skip chose=skip by=user ctx=mood=good").ok, false);
  assert.strictEqual(H.parseAskLine("ASK some.new.point :: offered=a|b rec=a chose=a by=user").known, false);
  assert.strictEqual(H.parseAskLine("ASK mini.phase-x.mock :: offered=build|skip rec=none chose=other by=user").chose, "other", "free text is `other`, never the words");
});

// ── 3. `habits: off` is ZERO BYTES ──────────────────────────────────────────
// Every field `orc lane config --json` had in 1.9.2, pinned. A new field in the
// off answer fails here.
const FIELDS_192 = ["ok", "lane", "command", "command_note", "config_path", "exists", "keys", "effective", "families", "roles", "announce", "stops", "not_read", "rank_states"];
const KEY_FIELDS_192 = ["key", "value", "default", "prio", "family", "answers", "tier", "gated_by", "is_overridden", "is_shadowed", "shadow_reason", "is_inert", "inert_reason"];

test("off: lane config carries NO habits key, and every 1.9.2 field is unchanged", () => {
  const plain = project("mock_example: off\n");
  const off = project("mock_example: off\nhabits: off\n");
  try {
    // Evidence and a decision on disk must change nothing while habits is off.
    trace(off, "mini", series(MOCK, Array(10).fill("skip")));
    writeState(off, { [MOCK_ID]: { id: MOCK_ID, qid: MOCK, bucket: {}, state: "applied", option: "skip", at: Date.now() - 1000 } });
    for (const lane of ["orc", "orc-mini", "orc-quick", "orc-fast", "orc-advisor"]) {
      // v2.0.0 T20 — `probes{}` is appended LAST and answers from the project's
      // own state (the trace above moves `aftermath-status`), so the 1.9.2 pin
      // reads `--no-probes`; lane-probes.test.js pins that the two differ by
      // that one trailing field only.
      const a = cli(["lane", "config", lane, "--json", "--no-probes", "--dir", plain]).stdout;
      const b = cli(["lane", "config", lane, "--json", "--no-probes", "--dir", off]).stdout;
      const withProbes = Object.keys(JSON.parse(cli(["lane", "config", lane, "--json", "--dir", off]).stdout));
      assert.deepStrictEqual(withProbes, FIELDS_192.concat("probes"), lane + ": the default adds `probes` last, and nothing else");
      const norm = (s, r) => s.split(JSON.stringify(r).slice(1, -1)).join("<root>").split(r).join("<root>");
      assert.strictEqual(norm(b, off), norm(a, plain), lane + ": off is byte-identical to no key at all");
      const o = JSON.parse(b);
      assert.deepStrictEqual(Object.keys(o), FIELDS_192, lane + ": exactly the 1.9.2 fields");
      assert.ok(!("habits" in o), "no habits key");
      for (const k of o.keys) assert.deepStrictEqual(Object.keys(k), KEY_FIELDS_192, lane + " key " + k.key);
      assert.deepStrictEqual(o.rank_states, ["resolved", "partly-resolved", "not-read", "inert", "demoted", "absent"]);
      for (const hk of H.HABIT_KEYS) assert.ok(!o.not_read.includes(hk), hk + " is left out of not_read");
      for (const f of H.HABIT_FAMILIES) assert.ok(!(f in o.families), f + " family is left out");
      assert.ok(!o.announce.some((l) => /learned/.test(l)));
    }
    const adv = j(cli(["lane", "config", "orc-advisor", "--json", "--dir", off]));
    assert.strictEqual(adv.not_read.length, 105, "the 1.9.2 not_read count + the 5 W4 gotcha engine keys + the 2 W6c keys (notify, rules_card_compact) + the 2 v2.1.0 W7 keys (log_retention_days, log_retention_auto) + the v2.1.0 W8 key (statusline_refresh)");
    assert.strictEqual(j(cli(["lane", "config", "orc-mini", "--json", "--dir", off])).effective.mock_example, "off");
    const show = cli(["habit", "show", "--json", "--dir", off]);
    assert.strictEqual(show.status, 3, "show exits 3 under off");
    assert.strictEqual(j(show).reason, "off");
  } finally {
    rmrf(plain);
    rmrf(off);
  }
});

test("config: `auto` is refused BY NAME; off · observe · propose are accepted; the default is off", () => {
  const root = project();
  try {
    const r = cli(["config", "set", "habits", "auto", "--dir", root]);
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /`auto` is not a habits level/);
    assert.match(r.stdout + r.stderr, /never applies a habit without your yes/);
    for (const v of ["observe", "propose", "off"]) assert.strictEqual(cli(["config", "set", "habits", v, "--dir", root]).status, 0, v);
    fs.unlinkSync(path.join(root, ".claude", "orc.config.yaml"));
    const list = j(cli(["config", "list", "--json", "--dir", root]));
    const byKey = Object.fromEntries(list.keys.map((k) => [k.key, k]));
    assert.strictEqual(byKey.habits.default, "off");
    assert.deepStrictEqual(byKey.habits.control.choices, ["off", "observe", "propose"]);
    assert.strictEqual(byKey.review_before_push.default, "ask");
    assert.strictEqual(byKey.mini_tdd.default, "ask");
    assert.deepStrictEqual(byKey.quick_update_tests.control.choices, ["ask", "on"], "no `off` — tests are the careful side");
    assert.notStrictEqual(cli(["config", "set", "quick_update_tests", "off", "--dir", root]).status, 0);
  } finally {
    rmrf(root);
  }
});

// ── 4. The learned rank ─────────────────────────────────────────────────────
test("learned: an accepted apply habit is the `learned` rank; your config file shadows it", () => {
  const root = project("habits: propose\n");
  try {
    trace(root, "mini", series(MOCK, Array(10).fill("skip")));
    const show = j(cli(["habit", "show", "--json", "--dir", root]));
    const row = show.rows.find((r) => r.id === MOCK_ID);
    assert.strictEqual(row.state, "proposed");
    assert.strictEqual(show.proposal.id, MOCK_ID);
    assert.match(show.proposal.line, /in 10 of your last 10 answers/);
    assert.match(show.proposal.line, /\[yes · not now · never\]/);

    // Before a yes, NOTHING is applied.
    let lc = j(cli(["lane", "config", "orc-mini", "--json", "--dir", root]));
    assert.strictEqual(lc.effective.mock_example, "ask", "a proposal is not an answer");
    assert.strictEqual(lc.habits.proposal.id, MOCK_ID, "≤ 1 proposal, for the end of the run");

    const acc = cli(["habit", "accept", MOCK_ID, "--json", "--dir", root]);
    assert.strictEqual(acc.status, 0);
    assert.deepStrictEqual([j(acc).to, j(acc).value], ["applied", "off"]);
    assert.ok(!fs.readFileSync(path.join(root, ".claude", "orc.config.yaml"), "utf8").includes("mock_example"), "the config file is never written");

    lc = j(cli(["lane", "config", "orc-mini", "--json", "--dir", root]));
    const k = lc.keys.find((x) => x.key === "mock_example");
    assert.strictEqual(k.value, "off");
    assert.strictEqual(k.source, "learned:" + MOCK_ID);
    assert.strictEqual(k.state, "learned");
    assert.strictEqual(k.is_overridden, false);
    assert.strictEqual(lc.effective.mock_example, "off");
    assert.ok(lc.rank_states.includes("learned"));
    assert.ok(lc.announce.includes(`mock_example: off — learned (${MOCK_ID}, 10 of 10) · undo: orc habit forget ${MOCK_ID}`));
    assert.deepStrictEqual(Object.keys(lc.habits), ["mode", "learned", "suggestions", "proposal", "line"]);
    assert.strictEqual(lc.habits.learned[0].id, MOCK_ID);
    assert.strictEqual(lc.habits.proposal, null, "an applied habit is not proposed again");
    // Another lane's point never answers this lane's key.
    assert.strictEqual(j(cli(["lane", "config", "orc", "--json", "--dir", root])).effective.mock_example, "ask");
    // The human branch prints what the JSON carries.
    const human = cli(["lane", "config", "orc-mini", "--dir", root]).stdout;
    for (const a of lc.announce) assert.ok(human.includes(a), "announce printed: " + a);
    assert.ok(human.includes(lc.habits.line));

    const cl = j(cli(["config", "list", "--json", "--dir", root])).keys.find((x) => x.key === "mock_example");
    assert.deepStrictEqual([cl.value, cl.source, cl.state], ["off", "learned:" + MOCK_ID, "learned"]);

    // Your own config wins at once, and the habit says it is shadowed.
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "habits: propose\nmock_example: on\n");
    lc = j(cli(["lane", "config", "orc-mini", "--json", "--dir", root]));
    assert.strictEqual(lc.effective.mock_example, "on");
    assert.strictEqual(lc.keys.find((x) => x.key === "mock_example").source, "overridden");
    const sh = j(cli(["habit", "show", "--json", "--dir", root])).rows.find((r) => r.id === MOCK_ID);
    assert.strictEqual(sh.state, "shadowed");
    assert.match(sh.why, /the file wins/);

    // forget → observed, and past answers stop counting.
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "habits: propose\n");
    assert.strictEqual(cli(["habit", "forget", MOCK_ID, "--dir", root, "--json"]).status, 0);
    lc = j(cli(["lane", "config", "orc-mini", "--json", "--dir", root]));
    assert.strictEqual(lc.effective.mock_example, "ask");
    assert.strictEqual(j(cli(["habit", "show", "--json", "--dir", root])).rows.find((r) => r.id === MOCK_ID).total, 0);
  } finally {
    rmrf(root);
  }
});

test("learned: a habit away from `careful` is never proposable, and accept refuses it (exit 4)", () => {
  const root = project("habits: propose\n");
  try {
    trace(root, "mini", series("mini.phase-t.testgen", Array(12).fill("skip")));
    const id = H.habitId("mini.phase-t.testgen", {});
    const row = j(cli(["habit", "show", "--json", "--dir", root])).rows.find((r) => r.id === id);
    assert.strictEqual(row.effective_class, "never");
    assert.strictEqual(row.state, "never");
    assert.strictEqual(row.proposable, false);
    const acc = cli(["habit", "accept", id, "--json", "--dir", root]);
    assert.strictEqual(acc.status, 4);
    assert.match(j(acc).message, /class never/);
    assert.strictEqual(j(cli(["lane", "config", "orc-mini", "--json", "--dir", root])).effective.generate_tests, false);
  } finally {
    rmrf(root);
  }
});

test("observe: the rule is computed and shown, and nothing is ever proposed", () => {
  const root = project("habits: observe\n");
  try {
    trace(root, "mini", series(MOCK, Array(10).fill("build")));
    const show = j(cli(["habit", "show", "--json", "--dir", root]));
    const row = show.rows.find((r) => r.id === MOCK_ID);
    assert.strictEqual(row.state, "observed");
    assert.strictEqual(row.passes, true);
    assert.strictEqual(show.proposal, null);
    assert.strictEqual(j(cli(["lane", "config", "orc-mini", "--json", "--dir", root])).habits.proposal, null);
  } finally {
    rmrf(root);
  }
});

test("window: answers older than 180 days and untrusted runs do not count", () => {
  const root = project("habits: propose\n");
  try {
    trace(root, "mini", series(MOCK, Array(10).fill("skip"), 200 * DAY));
    trace(root, "mini", series(MOCK, ["skip", "skip"]));
    const untrusted = trace(root, "mini", series(MOCK, Array(10).fill("skip")), "NOTE :: untrusted_context=pr-body");
    const show = j(cli(["habit", "show", "--json", "--dir", root]));
    const row = show.rows.find((r) => r.id === MOCK_ID);
    assert.strictEqual(row.total, 2, "only the 2 recent trusted answers count");
    assert.strictEqual(row.state, "observed");
    assert.ok(show.excluded_runs.some((x) => x.run === untrusted && x.reason === "untrusted_context"));
  } finally {
    rmrf(root);
  }
});

// ── 5. States: stale, expiry, cooldown ──────────────────────────────────────
test("stale: 2 overrides in the last 3 pause the habit — never a silent flip", () => {
  const root = project("habits: propose\n");
  try {
    const t0 = Date.now() - 2 * DAY;
    trace(root, "mini", series(MOCK, Array(8).fill("skip"), 3 * DAY));
    writeState(root, { [MOCK_ID]: { id: MOCK_ID, qid: MOCK, bucket: {}, state: "applied", option: "skip", at: t0, renewed_at: t0 } });
    trace(root, "mini", series(MOCK, ["build", "skip", "build"], 60000, { by: "user", pre: "skip" }));
    const row = j(cli(["habit", "show", "--json", "--dir", root])).rows.find((r) => r.id === MOCK_ID);
    assert.strictEqual(row.state, "stale");
    assert.strictEqual(row.stale_reason, "override");
    const lc = j(cli(["lane", "config", "orc-mini", "--json", "--dir", root]));
    assert.strictEqual(lc.effective.mock_example, "ask", "a stale habit is paused, not flipped");
    assert.strictEqual(lc.habits.proposal.kind, "re-ask");
    assert.match(lc.habits.proposal.line, /Switch to build the example · keep skip it · ask every time\?/);
  } finally {
    rmrf(root);
  }
});

test("expiry: an applied habit not used for 90 days is stale; a use renews it", () => {
  const root = project("habits: propose\n");
  try {
    const t0 = Date.now() - 100 * DAY;
    trace(root, "mini", series(MOCK, Array(8).fill("skip"), 101 * DAY));
    writeState(root, { [MOCK_ID]: { id: MOCK_ID, qid: MOCK, bucket: {}, state: "applied", option: "skip", at: t0, renewed_at: t0 } });
    let row = j(cli(["habit", "show", "--json", "--dir", root])).rows.find((r) => r.id === MOCK_ID);
    assert.strictEqual(row.state, "stale");
    assert.strictEqual(row.stale_reason, "expired");
    trace(root, "mini", series(MOCK, ["skip"], 5 * DAY, { by: "learned", pre: "skip" }));
    row = j(cli(["habit", "show", "--json", "--dir", root])).rows.find((r) => r.id === MOCK_ID);
    assert.strictEqual(row.state, "applied", "a use 5 days ago renews it");
  } finally {
    rmrf(root);
  }
});

test("cooldown: a declined habit comes back only after 10 more answers AND 14 days", () => {
  const cases = [
    [20, 10, "proposed"],
    [20, 5, "declined"],
    [3, 10, "declined"],
  ];
  for (const [daysAgo, more, want] of cases) {
    const root = project("habits: propose\n");
    try {
      trace(root, "mini", series(MOCK, Array(6).fill("skip"), (daysAgo + 1) * DAY));
      writeState(root, { [MOCK_ID]: { id: MOCK_ID, qid: MOCK, bucket: {}, state: "declined", at: Date.now() - daysAgo * DAY } });
      trace(root, "mini", series(MOCK, Array(more).fill("skip")));
      const row = j(cli(["habit", "show", "--json", "--dir", root])).rows.find((r) => r.id === MOCK_ID);
      assert.strictEqual(row.state, want, `${daysAgo} days, ${more} answers → ${want}`);
    } finally {
      rmrf(root);
    }
  }
});

// ── 6. The files survive the installer ──────────────────────────────────────
test("files: habits-state.json, habits-cache.json and the traces survive update, --prune and doctor --fix", () => {
  const { root, claudeDir } = freshInstall();
  try {
    fs.mkdirSync(path.join(claudeDir, "orc", "logs"), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "habits: observe\n");
    const tname = trace(root, "mini", series(MOCK, Array(6).fill("skip")));
    writeState(root, { [MOCK_ID]: { id: MOCK_ID, qid: MOCK, bucket: {}, state: "declined", at: Date.now() } });
    assert.strictEqual(cli(["habit", "show", "--json", "--dir", root]).status, 0);
    const files = [path.join(claudeDir, "orc", "habits-state.json"), path.join(claudeDir, "orc", "habits-cache.json"), path.join(claudeDir, "orc", "logs", tname)];
    const before = files.map((f) => fs.readFileSync(f, "utf8"));
    const manifest = fs.readFileSync(path.join(claudeDir, "orc", "install-manifest.json"), "utf8");
    assert.ok(!/habits-/.test(manifest), "never in the install manifest");
    for (const args of [["update"], ["update", "--prune"], ["doctor", "--fix"]]) {
      cli([...args, "--dir", root]);
      files.forEach((f, i) => assert.strictEqual(fs.readFileSync(f, "utf8"), before[i], `${path.basename(f)} survives ${args.join(" ")}`));
    }
  } finally {
    rmrf(root);
  }
});

// ── 7. Every subcommand's `--json` shape ────────────────────────────────────
test("cli: every `orc habit` subcommand answers one object with its exit code", () => {
  const root = project("habits: propose\n");
  try {
    const empty = cli(["habit", "show", "--json", "--dir", root]);
    assert.strictEqual(empty.status, 1, "show exits 1 with no ASK lines yet");
    assert.strictEqual(cli(["habit", "log", "--json", "--dir", root]).status, 1);

    trace(root, "mini", series(MOCK, Array(10).fill("skip")));
    fs.appendFileSync(
      path.join(root, ".claude", "orc", "logs", fs.readdirSync(path.join(root, ".claude", "orc", "logs"))[0]),
      `${stamp(Date.now())} mini  ASK some.unknown.point :: offered=a|b rec=a chose=a by=user\r\n${stamp(Date.now())} mini  ASK mini.phase-x.mock :: offered=build|skip chose=skip by=user\r\n`
    );
    const show = cli(["habit", "show", "--json", "--dir", root]);
    assert.strictEqual(show.status, 0);
    assert.deepStrictEqual(Object.keys(j(show)), ["ok", "mode", "lane", "window", "log_dir", "state_path", "cache_path", "traces", "answers", "excluded_runs", "count", "rows", "tiles", "rhythm", "portrait", "proposal", "state_words", "rule", "modes", "classes", "counts", "next_run", "files"]);
    assert.deepStrictEqual(Object.keys(j(show).rows[0]), ["id", "qid", "lanes", "title", "class", "effective_class", "careful", "key", "bucket", "state", "why", "stale_reason", "stale_detail", "top", "top_label", "count", "total", "n", "n_eff", "p", "lb", "last_agree", "passes", "proposable", "option", "value", "decided_at", "last_used", "line", "rule", "undo", "options", "share", "streak", "context", "effect", "commands"]);

    const pts = j(cli(["habit", "points", "--json", "--dir", root]));
    assert.strictEqual(pts.count, 32);
    assert.deepStrictEqual(pts.classes, ["apply", "suggest", "never"]);

    const log = j(cli(["habit", "log", "--json", "--limit", "3", "--dir", root]));
    assert.deepStrictEqual([log.ok, log.count, log.total], [true, 3, 10]);

    const why = cli(["habit", "why", MOCK_ID, "--json", "--dir", root]);
    assert.strictEqual(why.status, 0);
    assert.strictEqual(j(why).habits[0].answers.length, 10);
    assert.deepStrictEqual(Object.keys(j(why).habits[0].answers[0]), ["run", "at", "chose", "by", "pre", "ctx", "counted", "evidence", "recency", "weight", "reason"]);
    assert.strictEqual(cli(["habit", "why", MOCK, "--json", "--dir", root]).status, 0, "a qid works too");
    assert.strictEqual(cli(["habit", "why", "H-000000", "--json", "--dir", root]).status, 2);

    const doc = cli(["habit", "doctor", "--json", "--dir", root]);
    assert.strictEqual(doc.status, 1);
    assert.strictEqual(j(doc).unknown_qids[0].qid, "some.unknown.point");
    assert.strictEqual(j(doc).bad_lines.length, 1, "the line with no rec= is bad grammar");
    assert.ok(j(doc).silent_points.includes("orc.phase-8.ship"));

    for (const [args, to] of [
      [["decline", MOCK_ID], "declined"],
      [["reset", MOCK_ID], "observed"],
      [["decline", MOCK_ID, "--never"], "never-ask"],
      [["reset", MOCK_ID], "observed"],
      [["accept", MOCK_ID], "applied"],
      [["forget", MOCK_ID], "observed"],
    ]) {
      const r = cli(["habit", ...args, "--json", "--dir", root]);
      assert.strictEqual(r.status, 0, args.join(" ") + ": " + r.stdout);
      assert.deepStrictEqual(Object.keys(j(r)), ["ok", "id", "qid", "from", "to", "option", "value", "undo"]);
      assert.strictEqual(j(r).to, to);
    }
    assert.strictEqual(cli(["habit", "accept", "H-000000", "--json", "--dir", root]).status, 2);
    const states = j(cli(["habit", "log", "--states", "--json", "--dir", root]));
    assert.strictEqual(states.count, 6);
    assert.deepStrictEqual(Object.keys(states.history[0]), ["id", "from", "to", "by", "at", "reason", "inverse"]);

    const exp = j(cli(["habit", "export", "--json", "--dir", root]));
    assert.deepStrictEqual(Object.keys(exp), ["ok", "state_path", "state", "events"]);
    assert.strictEqual(cli(["habit", "purge", "--json", "--dir", root]).status, 1, "purge needs --yes");
    const pur = cli(["habit", "purge", "--yes", "--json", "--dir", root]);
    assert.strictEqual(pur.status, 0);
    assert.strictEqual(j(pur).traces_touched, false);
    const after = j(cli(["habit", "show", "--json", "--dir", root])).rows.find((r) => r.id === MOCK_ID);
    assert.strictEqual(after ? after.total : 0, 0, "after a purge, past answers stop counting");
  } finally {
    rmrf(root);
  }
});

// ── 9. The Behaviour panel fields (v2.0.0 W7) ───────────────────────────────
// The panel renders these and derives nothing, so each one is the CLI's.
test("show: the panel fields — tiles, rhythm, portrait sentences, counts, next run and per-row commands", () => {
  const root = project("habits: propose\n");
  try {
    trace(root, "orc-mini", series(MOCK, ["build", ...Array(9).fill("skip")]));
    const S = j(cli(["habit", "show", "--json", "--window", "30d", "--dir", root]));
    assert.deepStrictEqual(Object.keys(S.tiles), ["runs", "answers", "saved", "saved_prev", "qpr", "qpr_prev"]);
    assert.strictEqual(S.tiles.runs, 1);
    assert.strictEqual(S.tiles.answers, 10);
    assert.strictEqual(S.tiles.qpr, 10, "ten by=user answers in one run");
    assert.strictEqual(S.rhythm.heat.length, 7);
    assert.ok(S.rhythm.heat.every((r) => r.length === 24));
    assert.strictEqual(S.rhythm.heat.flat().reduce((a, b) => a + b, 0), 1, "one run in the heat map");
    assert.deepStrictEqual(S.rhythm.lanes.map((l) => l.n), [1], "one lane, one run");
    assert.strictEqual(S.rhythm.qpr.length, 12);
    assert.strictEqual(S.rhythm.how.length, 12);
    assert.deepStrictEqual(Object.keys(S.rhythm.how[11]), ["user", "ledger", "learned", "config", "default"]);
    assert.strictEqual(S.rhythm.days.length, 14, "the 14-day list is kept");
    assert.ok(S.portrait.length >= 2 && S.portrait.length <= 5);
    for (const p of S.portrait) assert.ok(p.k && /\.$/.test(p.line), "every portrait entry is one CLI sentence");
    assert.strictEqual(S.counts.proposed, 1);
    const r = S.rows[0];
    assert.strictEqual(r.state, "proposed");
    assert.deepStrictEqual(r.options.map((o) => o.v), ["skip", "build"], "the top choice first");
    assert.strictEqual(r.share, 0.9);
    assert.strictEqual(r.streak.length, 10);
    assert.deepStrictEqual(r.commands, { accept: `orc habit accept ${r.id}`, decline: `orc habit decline ${r.id}`, never: `orc habit decline ${r.id} --never`, forget: null, reset: null, manual: null });
    assert.match(r.effect, /mock_example/);
    assert.deepStrictEqual(S.next_run, [], "nothing is applied yet");
    assert.strictEqual(cli(["habit", "accept", r.id, "--json", "--dir", root]).status, 0);
    const A = j(cli(["habit", "show", "--json", "--dir", root]));
    assert.strictEqual(A.rows[0].commands.forget, `orc habit forget ${r.id}`);
    assert.deepStrictEqual(A.next_run.map((n) => n.lane), ["orc-mini"]);
    assert.match(A.next_run[0].line, /^mock_example: off — learned/);
    const L = j(cli(["habit", "log", "--states", "--json", "--dir", root]));
    assert.strictEqual(L.history[0].inverse, `orc habit forget ${r.id}`);
  } finally {
    rmrf(root);
  }
});

test("show under habits: off answers exit 3 with the modes, the commands to turn it on, and the kept count", () => {
  const root = project("habits: off\n");
  try {
    const r = cli(["habit", "show", "--json", "--dir", root]);
    assert.strictEqual(r.status, 3);
    const O = j(r);
    assert.deepStrictEqual([O.reason, O.mode, O.kept], ["off", "off", 0]);
    assert.deepStrictEqual(O.on, ["orc config set habits observe", "orc config set habits propose"]);
  } finally {
    rmrf(root);
  }
});

test("a never-class row carries no accept command, and the manual one only when the CLI can name the value", () => {
  const root = project("habits: propose\n");
  try {
    trace(root, "orc", series("orc.phase-5-5.security", Array(10).fill("skip")));
    const S = j(cli(["habit", "show", "--json", "--dir", root]));
    const r = S.rows.find((x) => x.qid === "orc.phase-5-5.security");
    assert.strictEqual(r.state, "never");
    assert.strictEqual(r.commands.accept, null);
    assert.strictEqual(r.commands.manual, "orc config set security_review off");
  } finally {
    rmrf(root);
  }
});
