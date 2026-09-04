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
    assert.strictEqual(adv.not_read.length, 79, "it reads none of the 79 keys");
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

// ── `orc lane calls` — the call catalogue (v1.0.0 W10) ──────────────────────
//
// A CLI invocation restated per lane is an exit-code contract restated per
// lane, and this repo has paid for that twice: `orc diy status` INVERTED its
// exit code for a release (v0.34.7), and `orc pattern status` needed a third
// code (v0.34.8) because lanes passed a file extension where a framework key
// was required. The catalogue is the one copy; these tests are the contract
// that makes reading it safe.

test("lane calls: the exit-code contract — 0 answered, 2 unknown lane or no argument", () => {
  const { root } = freshInstall();
  try {
    assert.strictEqual(cli(["lane", "calls", "orc-fast", "--dir", root]).status, 0);
    assert.strictEqual(cli(["lane", "calls", "--all", "--dir", root]).status, 0);
    assert.strictEqual(cli(["lane", "calls", "no-such-lane", "--dir", root]).status, 2);
    assert.strictEqual(cli(["lane", "calls", "--dir", root]).status, 2, "no lane and no --all is a usage error");
    // A lane that makes no CATALOGUED call still ANSWERS. An empty answer is an
    // answer (v0.43.0) — and it is not the same as making no call at all.
    const none = cli(["lane", "calls", "orc-advisor", "--dir", root]);
    assert.strictEqual(none.status, 0);
    assert.match(none.stdout, /No catalogued call/);
  } finally {
    rmrf(root);
  }
});

test("lane calls: --json is not a summary — every field the human branch prints", () => {
  const { root } = freshInstall();
  try {
    const j = JSON.parse(cli(["lane", "calls", "orc-fast", "--json", "--dir", root]).stdout);
    assert.deepStrictEqual(Object.keys(j), ["ok", "lane", "all", "count", "calls"]);
    assert.strictEqual(j.lane, "orc-fast");
    assert.ok(j.count > 0);
    for (const c of j.calls) {
      assert.deepStrictEqual(Object.keys(c), [
        "id", "cmd", "what", "exits", "states", "cost", "when",
        "on_absent", "never", "canonical", "lanes",
      ]);
      assert.ok(c.lanes.includes("orc-fast"), `${c.id} is listed for the lane that was asked`);
      assert.ok(Object.keys(c.exits).length, `${c.id} documents at least one exit code`);
    }
    // `--all` is the whole catalogue and is a superset of any one lane's.
    const all = JSON.parse(cli(["lane", "calls", "--all", "--json", "--dir", root]).stdout);
    assert.strictEqual(all.lane, null);
    assert.strictEqual(all.all, true);
    assert.ok(all.count >= j.count);
    const ids = new Set(all.calls.map((c) => c.id));
    for (const c of j.calls) assert.ok(ids.has(c.id), `${c.id} is in the full catalogue`);
  } finally {
    rmrf(root);
  }
});

// THE BEHAVIOUR TEST (design-05 §6). A documented exit code that the route
// cannot actually return is worse than no documentation: a lane branches on a
// number nothing produces. Exit codes are already gates in six places, and
// every one of them is a decision some lane makes from a number.
test("lane calls: a documented exit code is a code the route can really return", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const all = JSON.parse(cli(["lane", "calls", "--all", "--json", "--dir", root]).stdout);
    const byId = Object.fromEntries(all.calls.map((c) => [c.id, c]));

    // Each probe drives a REAL invocation into a state the catalogue documents,
    // in a project where that state is reachable without paying for anything.
    const probes = [
      // absent everything, on a fresh install
      ["pattern-status", ["pattern", "status", "nextjs"], 1],
      ["pattern-status", ["pattern", "status", "not-a-framework"], 2],
      ["diy-status", ["diy", "status"], 1], // UNCONFIGURED
      ["lane-config", ["lane", "config", "orc"], 0],
      ["lane-config", ["lane", "config", "nope"], 2],
      ["wiki-status", ["wiki", "status"], 0], // answers in EVERY state
      // 0/1 probe, not an "it answered" route — the catalogue claimed 0 only
      // and this assertion is why we know otherwise.
      ["gotcha-status", ["gotcha", "status"], 1],
    ];
    for (const [id, argv, code] of probes) {
      assert.ok(byId[id], `${id} is catalogued`);
      const got = cli([...argv, "--dir", root]).status;
      assert.strictEqual(got, code, `${id}: \`orc ${argv.join(" ")}\` exited ${got}, expected ${code}`);
      assert.ok(
        Object.prototype.hasOwnProperty.call(byId[id].exits, String(code)),
        `${id}: exit ${code} really happens but the catalogue does not document it`
      );
    }
    assert.ok(fs.existsSync(claudeDir), "the probes ran against a real install");
  } finally {
    rmrf(root);
  }
});

// ── `orc lane phases` — the phase library manifest (v1.0.0 W11) ─────────────
//
// The CLI owns the pipeline, not the prose (design-02 §6, the Flow-stepper
// rule). These tests are about the three things a lane bets on when it stops
// carrying its own copy: the exit code never varies, the manifest points at a
// file that really contains the layers it declares, and the human branch is
// never less detailed than the JSON.

test("lane phases: the exit-code contract — 0 answered, 2 unknown lane, alias, or no argument", () => {
  const { root } = freshInstall();
  try {
    assert.strictEqual(cli(["lane", "phases", "orc", "--dir", root]).status, 0);
    assert.strictEqual(cli(["lane", "phases", "--all", "--dir", root]).status, 0);
    assert.strictEqual(cli(["lane", "phases", "no-such-lane", "--dir", root]).status, 2);
    assert.strictEqual(cli(["lane", "phases", "--dir", root]).status, 2, "no lane and no --all is a usage error");
    // An entry point is not a typo — the `orc lane config` precedent.
    const alias = cli(["lane", "phases", "ultra", "--dir", root]);
    assert.strictEqual(alias.status, 2);
    assert.match(alias.stderr, /entry point, not a lane/);
    // A lane that runs NO shared phase still ANSWERS. /orc-retro mines traces
    // and writes none (its hard rule 4), so it is in no trace row on purpose.
    const none = cli(["lane", "phases", "orc-retro", "--dir", root]);
    assert.strictEqual(none.status, 0);
    assert.match(none.stdout, /No shared phase/);
    assert.match(none.stdout, /owns no trace/);
  } finally {
    rmrf(root);
  }
});

test("lane phases: --json is not a summary — every field the human branch prints", () => {
  const { root } = freshInstall();
  try {
    const j = JSON.parse(cli(["lane", "phases", "orc", "--json", "--dir", root]).stdout);
    assert.deepStrictEqual(Object.keys(j), [
      "ok", "lane", "all", "count", "layer_set", "phase_files", "lanes",
    ]);
    assert.deepStrictEqual(j.layer_set, ["core", "full", "trim", "composed"]);
    const l = j.lanes[0];
    assert.deepStrictEqual(Object.keys(l), [
      "lane", "trace_tier", "trace_token", "phases", "shared_phase_count",
      "own_phases", "own_phases_status",
    ]);
    assert.strictEqual(l.trace_tier, "Build lanes");
    assert.strictEqual(l.trace_token, "orc");
    // own_phases is never an empty ARRAY: a lane whose own pipeline is still in
    // its spine reports `null` + `in-spine`, because `[]` would claim it has
    // none. /orc's twelve left the spine at W12; at W13 ten of them gained
    // orc-diy as a second reader and moved to the library, so `own_phases` is
    // down to the two nothing else runs — intake and integration (worktrees).
    assert.strictEqual(l.own_phases_status, "declared");
    assert.deepStrictEqual(
      l.own_phases.map((p) => p.id),
      ["intake", "integration"],
      "/orc's own phases are the two no other lane runs"
    );
    const oo = l.own_phases.map((p) => p.ord);
    assert.deepStrictEqual(oo, [...oo].sort((a, b) => a - b), "own phases are in run order");
    for (const p of l.own_phases) {
      assert.deepStrictEqual(Object.keys(p), ["ord", "id", "file", "layers", "trace_verbs"]);
      assert.ok(p.file.startsWith("orc/"), p.id + " stays in its own lane");
      assert.ok(!/:\d/.test(p.file), "a manifest never carries a line number");
    }
    // A lane that has NOT moved its pipeline still says so honestly.
    const mini = JSON.parse(cli(["lane", "phases", "orc-mini", "--json", "--dir", root]).stdout).lanes[0];
    assert.strictEqual(mini.own_phases, null);
    assert.strictEqual(mini.own_phases_status, "in-spine");
    for (const p of l.phases) {
      assert.deepStrictEqual(Object.keys(p), [
        "ord", "id", "file", "layers", "read", "when", "optional_when", "calls",
      ]);
      assert.ok(p.file.startsWith("_shared/phases/"), p.id + " lives in the library");
      // NOT "every phase carries core". W13's build phases have `full` and
      // `composed` and no `core`: /orc's procedure and orc-diy's compiled
      // variant are DIFFERENT CONTENT for one phase, not two skins on a shared
      // invariant, and inventing a `core` for them would mean writing prose no
      // lane actually reads. What must hold is that a lane is handed a NON-EMPTY
      // layer set drawn from the closed set — being told to read nothing, or to
      // read a layer that is not a layer, is the failure worth catching.
      assert.ok(p.layers.length > 0, p.id + " gives this lane at least one layer to read");
      for (const ln of p.layers) assert.ok(j.layer_set.includes(ln), p.id + " declares layer " + ln + ", which is outside the closed set");
      // /orc-doc rule 2 — a manifest names a FILE and a LAYER, never a line.
      assert.ok(!/:\d/.test(p.file), "a manifest never carries a line number");
    }
    const ords = l.phases.map((p) => p.ord);
    assert.deepStrictEqual(ords, [...ords].sort((a, b) => a - b), "ord is the run order");
    assert.strictEqual(l.shared_phase_count, l.phases.length);

    const all = JSON.parse(cli(["lane", "phases", "--all", "--json", "--dir", root]).stdout);
    assert.strictEqual(all.lane, null);
    assert.strictEqual(all.all, true);
    assert.ok(all.count >= 30, "every lane is in --all");
  } finally {
    rmrf(root);
  }
});

// THE BEHAVIOUR TEST. A manifest is only worth reading if what it names is
// really on disk with really those layers — the failure it prevents has no
// error message: a lane opens a file and finds nothing under the marker it was
// told to read, and improvises.
test("lane phases: every manifested file is INSTALLED and carries the layers it declares", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const j = JSON.parse(cli(["lane", "phases", "--all", "--json", "--dir", root]).stdout);
    const seen = new Set();
    // A lane's OWN phases are installed too — /orc's spine stopped carrying the
    // procedure at W12, so a missing file here is a phase that silently does
    // nothing, with no error message anywhere.
    for (const l of j.lanes)
      for (const p of l.own_phases || []) {
        const abs = path.join(claudeDir, "skills", p.file);
        assert.ok(fs.existsSync(abs), `${p.file} is INSTALLED, not just in the repo`);
        assert.ok(p.file.startsWith(l.lane + "/"), `${p.file} stays in ${l.lane}`);
        const body = fs.readFileSync(abs, "utf8");
        // A row is a FILE with layers, or a SECTION of the lane's own spine
        // named by its heading. For a heading row the stronger assertion is
        // that the INSTALLED spine really contains it: a renamed heading is a
        // pointer into nothing, and nothing at runtime would say so.
        if (p.heading) {
          assert.strictEqual(p.read, "section", `${p.id} names a heading, so it reads a section`);
          assert.ok(
            body.replace(/\r\n/g, "\n").split("\n").includes(p.heading),
            `${p.file} still carries the heading ${l.lane} is told to read: ${p.heading}`
          );
        }
        for (const layer of p.layers || [])
          assert.ok(
            body.includes(`<!-- orc:layer ${layer} -->`),
            `${p.file} carries the \`${layer}\` layer ${l.lane} is told to read`
          );
      }
    for (const l of j.lanes)
      for (const p of l.phases) {
        const abs = path.join(claudeDir, "skills", p.file);
        assert.ok(fs.existsSync(abs), `${p.file} is INSTALLED, not just in the repo`);
        const body = fs.readFileSync(abs, "utf8");
        for (const layer of p.layers) {
          assert.ok(j.layer_set.includes(layer), `${layer} is in the closed set`);
          assert.ok(
            body.includes(`<!-- orc:layer ${layer} -->`),
            `${p.file} carries the \`${layer}\` layer ${l.lane} is told to read`
          );
        }
        seen.add(p.file);
      }
    // Every file in the library is claimed by the manifest — a file nothing
    // points at is a file nobody reads.
    const dir = path.join(claudeDir, "skills", "_shared", "phases");
    for (const f of fs.readdirSync(dir))
      if (f !== "README.md")
        assert.ok(seen.has("_shared/phases/" + f), `_shared/phases/${f} is claimed by LANE_PHASES`);
  } finally {
    rmrf(root);
  }
});
