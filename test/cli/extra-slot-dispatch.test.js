"use strict";
// @test-pool net  — stands up the fake provider on loopback
// `orc extra dispatch` — THE BRIDGE ACCEPTS A POSITION (v0.55.0).
//
// Before this release `bin/cli.js` required a `score` unconditionally, so a doc
// section, a wiki scan-task and a quick entry could not reach the bridge at all
// — and the bridge is the ONE place a request body is composed, the fence
// enforced, the spend logged and the journal written. Whatever the lane tables
// claimed, NO NON-SCORED DISPATCH HAD EVER GONE FOREIGN.
//
// So the assertions here are about the SAME machinery being reached, not about
// new machinery: zero new engines, zero new dispatch paths, zero new agents.
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
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "// original\n");
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, a, env) => cli([...a, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);

// A verified profile written STRAIGHT INTO THE LEDGER, for the cases that never
// reach the wire: a refusal, an unrouted position, the preflight stop, a doctor
// finding. Only the cases that really dispatch stand up a fake provider, because
// only those are testing it — and every extra spawning case is a bite out of the
// suite's concurrency budget (`test/_helpers.js` explains what that costs).
function seedProfile(p, over) {
  const dir = path.join(p.root, ".claude", "orc");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "extra.json");
  const ledger = { version: 2, profiles: [], routes: [], slots: [], history: [] };
  if (fs.existsSync(file)) Object.assign(ledger, JSON.parse(fs.readFileSync(file, "utf8")));
  ledger.profiles.push(
    Object.assign(
      {
        name: "ds",
        provider: "custom",
        engine: "api",
        region: "default",
        base_url: "http://127.0.0.1:9",
        credential: { source: "env", key_name: "K" },
        verified_at: new Date().toISOString(),
        verify_method: "models",
        models_seen: ["fake-flash"],
        model_map: { opus: null, sonnet: null, haiku: null, subagent: null },
      },
      over || {}
    )
  );
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2) + "\n");
}

function seedSlot(p, slot, model) {
  const file = path.join(p.root, ".claude", "orc", "extra.json");
  const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
  ledger.slots = (ledger.slots || []).filter((x) => x.slot !== slot).concat([{ slot, profile: "ds", model: model || "fake-flash" }]);
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2) + "\n");
}

function armedNoWire(p, slot) {
  seedProfile(p);
  seedSlot(p, slot);
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: true\n");
}

// A verified `api` profile holding ONE POSITION. No band row anywhere: that is
// the point — this dispatch has no score to resolve.
async function armedSlot(p, slot, cfgExtra) {
  const f = await fakeProvider("chat");
  const base = `http://127.0.0.1:${f.port}`;
  assert.equal(run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K"]).status, 0);
  const ping = run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY });
  assert.equal(ping.status, 0, "fixture must verify: " + ping.stdout + ping.stderr);
  assert.equal(run(p, ["extra", "role", "set", slot, "ds/fake-flash", "--json"]).status, 0);
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: true\n" + (cfgExtra || ""));
  return f;
}

function slice(p, over) {
  const file = path.join(p.root, "slice.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      Object.assign(
        {
          task_id: "D1",
          slot: "doc-writer",
          prompt: "Write section 03 from the frozen context.",
          standing_rules: "# ORC standing rules\nReturn the contract.\n",
          declared_files: ["src/a.js"],
        },
        over || {}
      )
    )
  );
  return file;
}
const dispatch = (p, over) => run(p, ["extra", "dispatch", "--task", slice(p, over), "--json"], { K: SECRET_KEY });

test("a slice with a SLOT and no score dispatches, spends and journals", async () => {
  const p = project();
  const f = await armedSlot(p, "doc-writer");
  try {
    const r = dispatch(p);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const j = json(r);
    assert.equal(j.dispatched, true);
    assert.equal(j.outcome, "done");
    assert.equal(j.engine, "api");
    assert.equal(j.via, "extra:ds");

    // THE TRACE BAND SPELLING. The field NAME is unchanged, so the parser, the
    // eight-field dedupe and the ` :: ` tolerance keep working untouched.
    assert.equal(j.band, "slot:doc-writer");
    assert.equal(j.slot, "doc-writer");
    // NOT DERIVED FROM ANYTHING.
    assert.equal(j.score, null);
    assert.ok(j.trace_line.includes("band=slot:doc-writer"), j.trace_line);

    // The fallback target is a NAME, not a band lookup — strictly more honest
    // than what the scored half can offer.
    assert.equal(j.fallback_to.agent, "orc-doc-writer-opus-5-med");

    // The SAME machinery: the fence, the spend log, the journal.
    assert.deepEqual(j.files_written, ["src/a.js"]);
    assert.equal(j.spend_logged, true);
    assert.ok(j.journal, "the journal header is written before the first byte leaves the machine");
    const spend = fs
      .readFileSync(path.join(p.root, ".claude", "orc", "extra-spend.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.equal(spend.length, 1);
    assert.equal(spend[0].band, "slot:doc-writer");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("BOTH a score and a slot is refused BY NAME, and nothing is dispatched", () => {
  const p = project();
  armedNoWire(p, "doc-writer");
  const r = dispatch(p, { score: 20 });
  assert.equal(r.status, 2);
  const j = json(r);
  assert.equal(j.reason, "bad-slice");
  assert.match(j.error, /BOTH a `score` and a `slot`/);
  rmrf(p.root);
});

test("NEITHER a score nor a slot is refused, and the message LISTS the slots", () => {
  const p = project();
  armedNoWire(p, "doc-writer");
  const r = dispatch(p, { slot: undefined });
  assert.equal(r.status, 2);
  const j = json(r);
  assert.equal(j.reason, "bad-slice");
  for (const s of ["quick-executor", "fast-executor", "doc-writer", "doc-checker", "wiki-scanner-deep", "wiki-scanner-light"])
    assert.ok(j.error.includes(s), "the refusal must name " + s);
  rmrf(p.root);
});

test("an unknown slot on a slice is refused with exit 2 and the six are listed", () => {
  const p = project();
  armedNoWire(p, "doc-writer");
  const r = dispatch(p, { slot: "not-a-slot" });
  assert.equal(r.status, 2);
  const j = json(r);
  assert.equal(j.reason, "bad-slice");
  assert.deepEqual(j.known.length, 6);
  rmrf(p.root);
});

test("an UNROUTED slot exits 3 (not routed) and names the Claude agent to fall back to", () => {
  const p = project();
  armedNoWire(p, "doc-writer");
  // The WRITER holds a position; the CHECKER does not. This is `00-problem.md`
  // P2 fixed by construction — the checker used to resolve the WRITER's band.
  const r = dispatch(p, { slot: "doc-checker", task_id: "D2" });
  assert.equal(r.status, 3);
  const j = json(r);
  assert.equal(j.dispatched, false);
  assert.equal(j.reason, "not-routed");
  assert.equal(j.claude.agent, "orc-doc-checker-opus-5-low");
  rmrf(p.root);
});

test("`orc extra stats` gives a slot dispatch its OWN row, keyed on the band string", async () => {
  const p = project();
  const f = await armedSlot(p, "wiki-scanner-light");
  try {
    assert.equal(dispatch(p, { slot: "wiki-scanner-light", task_id: "W1" }).status, 0);
    const j = json(run(p, ["extra", "stats", "--json"]));
    const row = j.bands.find((b) => b.band === "slot:wiki-scanner-light");
    assert.ok(row, "a slot dispatch groups on its own band string: " + JSON.stringify(j.bands));
    assert.equal(row.dispatches, 1);
    assert.equal(row.profile, "ds");
    // Both ABSENT counts keep their names — a report quietly short by three rows
    // is the exact failure v0.53.2 was fixed to stop.
    assert.ok("unreadable_spend_lines" in j.sources, Object.keys(j.sources).join(","));
    assert.ok("run_returns_undated_skipped" in j.sources, Object.keys(j.sources).join(","));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("`orc extra preflight` STOPS on a vaulted EXPIRED profile a SLOT row names", () => {
  const p = project();
  // A VAULTED profile with no saved passphrase, held by a POSITION and by
  // nothing else. Before this release preflight walked `routes` alone, so this
  // stop leaked through a brand new door.
  seedProfile(p, { credential: { source: "vault", key_name: "ds" } });
  seedSlot(p, "fast-executor");
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: true\n");
  const lp = path.join(p.root, ".claude", "orc", "extra.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(lp, "utf8")).routes, [], "the fixture must have NO band row");

  const r = run(p, ["extra", "preflight", "--json"]);
  assert.equal(r.status, 1, "an ABSENT passphrase on a vaulted profile a slot row names must STOP");
  const j = json(r);
  assert.deepEqual(j.stops, ["ds"]);
  assert.match(j.on_failure_note, /extra_on_failure covers an endpoint that FAILED/);
  rmrf(p.root);
});

test("`orc extra doctor` reports a slot whose profile lost verification, and one whose model left models_seen", () => {
  const p = project();
  seedProfile(p);
  seedSlot(p, "doc-writer");
  seedSlot(p, "doc-checker", "vanished-model");

  const ids = json(run(p, ["extra", "doctor", "--json"])).findings.map((x) => x.id);
  assert.ok(ids.includes("extra-slot-model-unknown"), ids.join(","));
  // There is deliberately NO `extra-slot-missing`: nagging a user to route a
  // slot they chose not to route is a doctor people learn to ignore.
  assert.ok(!ids.includes("extra-slot-missing"));

  const lp = path.join(p.root, ".claude", "orc", "extra.json");
  const l = JSON.parse(fs.readFileSync(lp, "utf8"));
  l.profiles[0].verified_at = null;
  fs.writeFileSync(lp, JSON.stringify(l, null, 2));
  const ids2 = json(run(p, ["extra", "doctor", "--json"])).findings.map((x) => x.id);
  assert.ok(ids2.includes("extra-slot-unverified-profile"), ids2.join(","));
  rmrf(p.root);
});
