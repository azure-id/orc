"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir } = require("../_helpers");

// ── `orc lane` — the noun (v1.0.0 W3) ───────────────────────────────────────
//
// The whole point of pillar 1: a lane asks instead of deriving. These tests are
// about the CONTRACT that makes asking safe — an exit code that never varies, a
// closed set of state words, and a human branch that is never less detailed
// than the JSON.

function project(configText) {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  if (configText !== undefined)
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), configText);
  return root;
}

test("lane list: every skill is a lane, and a lane with no command says what opens it", () => {
  const { root } = freshInstall();
  try {
    const r = cli(["lane", "list", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.ok, true);

    // BOTH directions, the same assertion the contract lint makes — here
    // against the INSTALLED payload rather than the repo, because that is what
    // a user's `orc lane list` actually answers for.
    const skills = fs
      .readdirSync(path.join(root, ".claude", "skills"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "_shared")
      .map((d) => d.name)
      .sort();
    assert.deepStrictEqual(j.lanes.map((l) => l.lane).sort(), skills);
    assert.strictEqual(j.count, j.lanes.length);

    for (const l of j.lanes) {
      if (l.command) assert.match(l.command, /^\//, "a command is printed the way a user types it");
      else assert.ok(l.command_note, `${l.lane} has no command and no note — an unexplained null reads as an oversight`);
    }
    // The three lanes nothing opens directly are the ones that must carry a note.
    const noCommand = j.lanes.filter((l) => !l.command).map((l) => l.lane).sort();
    assert.deepStrictEqual(noCommand, ["context-combiner", "orc-advisor", "orc-analyze-mini", "orc-judge"]);

    // The state words are part of the contract, not a rendering detail.
    assert.deepStrictEqual(j.rank_states, [
      "resolved",
      "partly-resolved",
      "not-read",
      "inert",
      "demoted",
      "absent",
    ]);
  } finally {
    rmrf(root);
  }
});

test("lane config: exit 0 in every state, 2 unknown, and an entry point is not a typo", () => {
  const root = project();
  try {
    assert.strictEqual(cli(["lane", "config", "orc", "--dir", root]).status, 0, "a lane with keys");
    assert.strictEqual(cli(["lane", "config", "orc-advisor", "--dir", root]).status, 0, "a lane with none");
    assert.strictEqual(cli(["lane", "config", "orc-explain", "--dir", root]).status, 0, "no config file either");

    const bad = cli(["lane", "config", "orc-nope", "--dir", root]);
    assert.strictEqual(bad.status, 2, "unknown lane is 2, the `orc pattern status` convention");
    assert.match(bad.stderr, /Unknown lane/);

    // `/orc-ultra` is a real thing a user types. Answering "unknown lane" would
    // send them hunting for a spelling mistake in a name that is correct.
    for (const [typed, resolves] of [["orc-ultra", "orc"], ["ultra", "orc"], ["quick", "orc-quick"]]) {
      const a = cli(["lane", "config", typed, "--json", "--dir", root]);
      assert.strictEqual(a.status, 2, typed + " is not a config lane");
      const j = JSON.parse(a.stdout);
      assert.strictEqual(j.reason, "alias");
      assert.strictEqual(j.resolves_to, resolves);
      assert.ok(j.why.length, "and it says why");
    }

    const noArg = cli(["lane", "config", "--dir", root]);
    assert.strictEqual(noArg.status, 2);
  } finally {
    rmrf(root);
  }
});

test("lane config: a family is read top-down and STOPS at the first rank that resolves", () => {
  const root = project("opus5_only: true\nrubric_bands_override: [[0,100]]\n");
  try {
    const j = JSON.parse(cli(["lane", "config", "orc", "--json", "--dir", root]).stdout);
    const band = j.families["executor-band"];
    assert.strictEqual(band.resolved_by, "opus5_only");
    assert.strictEqual(band.resolved_at, "P1");
    assert.deepStrictEqual(
      band.ranks.map((r) => [r.prio, r.state]),
      [["P0", "absent"], ["P1", "resolved"], ["P2", "not-read"], ["P3", "not-read"]]
    );
    // `not-read` is the word that makes the rule visible. It is not "false" and
    // it is not "default" — it is *nobody looked at this*, and a rank that WAS
    // consulted and declined must never wear it.
    assert.match(band.ranks[2].why, /a higher rank resolved/);
    assert.match(band.ranks[0].why, /not present in the config file/);

    // An uncontested family has no ladder at all — a P0 where nothing competes
    // is a ladder somebody invented.
    assert.strictEqual(j.families.waves.ranks, null);
    assert.strictEqual(j.families.waves.contested, false);

    for (const f of Object.values(j.families))
      for (const r of f.ranks || []) assert.ok(j.rank_states.includes(r.state), "state " + r.state + " is outside the closed set");
  } finally {
    rmrf(root);
  }
});

test("lane config: lane-level inertness is a THIRD thing, and keeps its exact words", () => {
  const root = project("opus5_only: true\n");
  try {
    // /orc-quick: the whole FAMILY goes inert, because the lane asks which
    // agent before every dispatch.
    const q = JSON.parse(cli(["lane", "config", "orc-quick", "--json", "--dir", root]).stdout);
    const band = q.families["executor-band"];
    assert.strictEqual(band.inert, true);
    assert.ok(band.ranks.every((r) => r.state === "inert"), "every rank of an inert family is inert");
    assert.match(band.inert_reason, /asks WHICH AGENT before every dispatch/);
    const o5 = q.keys.find((k) => k.key === "opus5_only");
    assert.strictEqual(o5.is_inert, true);
    assert.match(q.announce.join("\n"), /opus5_only: ON, and INERT in this lane/, "and it is announced");

    // /orc-challenge and /orc-doc: ONE key, and the reason must survive
    // verbatim. "Unaffected, not exempt" is a distinction the docs make
    // deliberately — a generic "not applicable" loses the fact that turning the
    // key on breaks nothing here.
    for (const lane of ["orc-challenge", "orc-doc"]) {
      const j = JSON.parse(cli(["lane", "config", lane, "--json", "--dir", root]).stdout);
      const k = j.keys.find((x) => x.key === "opus5_only");
      assert.strictEqual(k.is_inert, true, lane);
      assert.match(k.inert_reason, /no-op — the lane is unaffected, not exempt/, lane);
    }

    // A lane with no rule about it is untouched.
    const orc = JSON.parse(cli(["lane", "config", "orc", "--json", "--dir", root]).stdout);
    assert.strictEqual(orc.keys.find((k) => k.key === "opus5_only").is_inert, false);
    assert.strictEqual(orc.families["executor-band"].inert, false);
  } finally {
    rmrf(root);
  }
});

test("lane config: effective, not_read and stops are answers, including when empty", () => {
  const root = project("run_budget_dispatches: 12\n");
  try {
    const j = JSON.parse(cli(["lane", "config", "orc", "--json", "--dir", root]).stdout);

    // `effective` is the flat answer a lane obeys without reasoning.
    assert.deepStrictEqual(Object.keys(j.effective).sort(), j.keys.map((k) => k.key).sort());
    assert.strictEqual(j.effective.run_budget_dispatches, "12");

    // A key this lane reads is never also in not_read, and every key is in
    // exactly one of the two — that partition is what the two-way lint rests on.
    const read = new Set(j.keys.map((k) => k.key));
    for (const k of j.not_read) assert.ok(!read.has(k), k + " is in both lists");
    assert.ok(j.not_read.includes("doc_language"), "orc does not read a doc key");

    const stop = j.stops.find((s) => s.key === "run_budget_dispatches");
    assert.ok(stop, "an armed budget is a STOP");
    assert.ok(stop.when && stop.action, "a stop says when, and what happens");

    // An empty answer is an ANSWER. A lane that reads nothing must still return
    // the fields, or a consumer cannot tell "none" from "not computed".
    const adv = JSON.parse(cli(["lane", "config", "orc-advisor", "--json", "--dir", root]).stdout);
    assert.deepStrictEqual(adv.keys, []);
    assert.deepStrictEqual(adv.stops, []);
    assert.deepStrictEqual(adv.roles, {});
    assert.strictEqual(adv.not_read.length, 70, "it reads none of the 70 keys");
  } finally {
    rmrf(root);
  }
});

test("lane config: roles are resolved, and a lane never maps a role to an agent itself", () => {
  const plain = project();
  const forced = project("opus5_only: true\n");
  try {
    const a = JSON.parse(cli(["lane", "config", "orc", "--json", "--dir", plain]).stdout);
    assert.ok(a.roles["orc-planner-opus-5-med"], "the shipped planner is named");
    assert.strictEqual(a.roles["orc-planner-opus-5-med"].forced_by, null);

    const b = JSON.parse(cli(["lane", "config", "orc-mini", "--json", "--dir", forced]).stdout);
    const mini = b.roles["orc-analyze-mini-sonnet-5-high"];
    assert.strictEqual(mini.agent, "orc-analyze-mini-opus-5-med", "the forced variant resolves");
    assert.strictEqual(mini.forced_by, "opus5_only");
    // The shipped agent keeps its slot: "I forced this" and "this is what ships"
    // are different facts, and a report that keeps only one cannot be undone.
    assert.strictEqual(mini.shipped, "orc-analyze-mini-sonnet-5-high");

    // The trace writer transcribes a packet and is NEVER forced.
    assert.strictEqual(b.roles["orc-trace-writer-haiku-4-5"].forced_by, null);
    assert.strictEqual(b.roles["orc-trace-writer-haiku-4-5"].agent, "orc-trace-writer-haiku-4-5");
  } finally {
    rmrf(plain);
    rmrf(forced);
  }
});

test("lane config: `--json is not a summary` runs BOTH ways", () => {
  const root = project("opus5_only: true\nrubric_bands_override: [[0,100]]\nrun_budget_dispatches: 9\nfable5_enabled: true\n");
  try {
    const human = cli(["lane", "config", "orc", "--dir", root]);
    const j = JSON.parse(cli(["lane", "config", "orc", "--json", "--dir", root]).stdout);
    assert.strictEqual(human.status, 0);

    // Every field the JSON carries has a visible home in the terminal, or the
    // terminal is the half-blind surface instead of the panel.
    for (const a of j.announce) assert.ok(human.stdout.includes(a), "announce line printed verbatim: " + a);
    for (const s of j.stops) {
      assert.ok(human.stdout.includes(s.when), "stop `when` printed");
      assert.ok(human.stdout.includes(s.action), "stop `action` printed");
    }
    for (const k of j.keys) assert.ok(human.stdout.includes(k.key), "key printed: " + k.key);
    for (const [name, f] of Object.entries(j.families)) {
      if (!f.ranks) continue;
      assert.ok(human.stdout.includes(name), "family printed: " + name);
      for (const r of f.ranks) assert.ok(human.stdout.includes(r.state), "state printed: " + r.state);
    }
    assert.ok(human.stdout.includes(String(j.not_read.length)), "the not-read COUNT is printed");
    assert.ok(human.stdout.includes("retired keys still in your config"), "a retired key is announced");
  } finally {
    rmrf(root);
  }
});
