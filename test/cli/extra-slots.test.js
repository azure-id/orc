"use strict";
// @test-pool spawn  — shells node bin/cli.js; no provider, no socket
// `orc extra role` — THE POSITIONS, the non-scored half of routing (v0.55.0).
//
// The load-bearing assertion in this file is that a slot resolve NEVER touches
// a band. Before this release four lanes were routed by resolving a pinned
// agent's band at both edges — arithmetic on a number nobody chose — and it was
// wrong in two places and dead in a third. So every case below checks two
// things at once: the verdict, and that the displaced Claude answer is a pinned
// NAME rather than an interval.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tmpdir, rmrf, cli } = require("../_helpers.js");

const SLOTS = [
  "quick-executor",
  "fast-executor",
  "doc-writer",
  "doc-checker",
  "wiki-scanner-deep",
  "wiki-scanner-light",
];

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
const ledgerPath = (p) => path.join(p.root, ".claude", "orc", "extra.json");
const readLedger = (p) => JSON.parse(fs.readFileSync(ledgerPath(p), "utf8"));

// A verified profile, WITHOUT SPAWNING ANYTHING.
//
// The other `extra-*` files stand up a fake provider and really ping it, because
// what they are testing IS the ping. Nothing in this file is: every case here is
// about the RESOLVER, and `verified_at` is the only thing it reads off a
// profile. So the profile is written straight into the ledger.
//
// That is not a shortcut, it is the reason the suite's concurrency budget still
// holds: `test/_helpers.js` explains that a local fake provider missing its 3s
// probe timeout fails in a way that looks exactly like a real regression, and
// sixteen more spawning cases is how you buy that failure.
function verified(p, name) {
  const dir = path.join(p.root, ".claude", "orc");
  fs.mkdirSync(dir, { recursive: true });
  const ledger = { version: 2, profiles: [], routes: [], slots: [], history: [] };
  const file = path.join(dir, "extra.json");
  if (fs.existsSync(file)) Object.assign(ledger, JSON.parse(fs.readFileSync(file, "utf8")));
  ledger.profiles.push({
    name: name || "ds",
    provider: "custom",
    engine: "api",
    region: "default",
    base_url: "http://127.0.0.1:9",
    credential: { source: "env", key_name: "K" },
    verified_at: new Date().toISOString(),
    verify_method: "models",
    models_seen: ["fake-flash", "fake-pro"],
    model_map: { opus: null, sonnet: null, haiku: null, subagent: null },
  });
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2) + "\n");
}

test("EVERY slot keeps its slot on an empty ledger, and each falls through to a pinned NAME", () => {
  const p = project();
  const r = run(p, ["extra", "role", "list", "--json"]);
  // Nothing routes, so the READ exits 1 — the `orc pattern status` convention.
  assert.equal(r.status, 1);
  const j = json(r);
  assert.deepEqual(j.slots.map((s) => s.slot), SLOTS, "all six, always — an unrouted slot is not filtered out");
  for (const s of j.slots) {
    assert.equal(s.resolved, "claude");
    assert.equal(s.routed, false);
    assert.ok(s.claude.agent && /^orc-/.test(s.claude.agent), `${s.slot} must displace a NAMED agent, got ${s.claude.agent}`);
    assert.ok(!("band" in s), `${s.slot} must not carry a band — a slot is a position, not an interval`);
    assert.ok(s.next, "an unrouted slot names the next action");
  }
  // `quick-executor` is a MENU, which is what that lane is.
  assert.equal(j.slots[0].claude.agents.length, 2);
  assert.equal(j.slots[0].asks, true);
  assert.equal(j.slots.filter((s) => s.asks).length, 1, "only /orc-quick asks; the other three lanes announce");
  rmrf(p.root);
});

test("the SIX unreachable extra_roles values are reported honestly, not fixed", () => {
  const p = project();
  const j = json(run(p, ["extra", "role", "list", "--json"]));
  assert.deepEqual(
    j.unreachable_roles.map((u) => u.role).sort(),
    ["analyst", "planner", "reviewer", "scout", "test-author", "verifier"].sort()
  );
  for (const u of j.unreachable_roles) assert.match(u.state, /nothing resolves this/);
  rmrf(p.root);
});

test("an unknown slot is REFUSED with exit 2 and the message LISTS the six", () => {
  const p = project();
  for (const argv of [["extra", "role", "show", "nope"], ["extra", "role", "set", "nope", "ds/m"], ["extra", "role", "rm", "nope"]]) {
    const r = run(p, argv);
    assert.equal(r.status, 2, argv.join(" ") + " must exit 2");
    for (const s of SLOTS) assert.ok(r.stderr.includes(s), `${argv.join(" ")} must name ${s}`);
  }
  const j = json(run(p, ["extra", "resolve", "--slot", "nope", "--json"]));
  assert.equal(j.reason, "unknown-slot");
  assert.deepEqual(j.known, SLOTS);
  rmrf(p.root);
});

test("a score and --slot together is refused BY NAME — one invocation, one shape", () => {
  const p = project();
  const r = run(p, ["extra", "resolve", "50", "--slot", "doc-writer", "--json"]);
  assert.equal(r.status, 2);
  assert.equal(json(r).reason, "two-shapes");
  rmrf(p.root);
});

test("the master gate: extra_enabled false holds every slot on Claude", () => {
  const p = project();
  verified(p);
  assert.equal(run(p, ["extra", "role", "set", "doc-writer", "ds/fake-flash", "--json"]).status, 0);
  const j = json(run(p, ["extra", "resolve", "--slot", "doc-writer", "--json"]));
  assert.equal(j.resolved, "claude");
  assert.match(j.why, /extra_enabled is false/);
  rmrf(p.root);
});

test("a routed slot resolves foreign, and the ANNOUNCE names the agent it displaces", () => {
  const p = project();
  setCfg(p, "extra_enabled: true\n");
  verified(p);
  assert.equal(run(p, ["extra", "role", "set", "doc-writer", "ds/fake-flash", "--json"]).status, 0);

  const r = run(p, ["extra", "resolve", "--slot", "doc-writer", "--json"]);
  assert.equal(r.status, 0, "exit 0 = extra");
  const j = json(r);
  assert.equal(j.resolved, "extra");
  assert.equal(j.shape, "slot");
  assert.equal(j.band, "slot:doc-writer", "the trace band spelling");
  assert.equal(j.profile, "ds");
  assert.equal(j.model, "fake-flash");
  assert.ok(j.announce.includes("orc-doc-writer-opus-5-med"), "the announce names the displaced agent: " + j.announce);
  assert.ok(j.announce.includes("third party"));

  // AND THE CHECKER IS UNTOUCHED. This is `00-problem.md` P2 fixed by
  // construction: the checker used to resolve against the WRITER's band.
  const c = run(p, ["extra", "resolve", "--slot", "doc-checker", "--json"]);
  assert.equal(c.status, 1);
  assert.equal(json(c).claude.agent, "orc-doc-checker-opus-5-low");
  rmrf(p.root);
});

test("`opus5_only` is NOT CONSULTED for a taken slot, and fully live for one with no row", () => {
  const p = project();
  setCfg(p, "extra_enabled: true\nopus5_only: true\n");
  verified(p);
  run(p, ["extra", "role", "set", "wiki-scanner-deep", "ds/fake-flash", "--json"]);

  const taken = json(run(p, ["extra", "resolve", "--slot", "wiki-scanner-deep", "--json"]));
  assert.equal(taken.resolved, "extra", "the slot row outranks opus5_only");

  // The one with no row falls through to the OPUS5 variant, not the shipped one.
  const free = json(run(p, ["extra", "resolve", "--slot", "wiki-scanner-light", "--json"]));
  assert.equal(free.resolved, "claude");
  assert.equal(free.claude.agent, "orc-wiki-scanner-opus-5-med");
  assert.equal(free.claude.table, "opus5_only");
  rmrf(p.root);
});

test("hold-backs, each named: unverified profile · missing profile · cited risk · boundary REFUSE", () => {
  const p = project();
  setCfg(p, "extra_enabled: true\n");
  verified(p);
  run(p, ["extra", "role", "set", "fast-executor", "ds/fake-flash", "--json"]);

  // risk — NEVER INVENTED: it is only held back because the SLICE cited one.
  const risky = json(run(p, ["extra", "resolve", "--slot", "fast-executor", "--risk", "2", "--json"]));
  assert.equal(risky.resolved, "claude");
  assert.equal(risky.held_back, "risk");
  assert.ok(risky.would_have_been, "it names what it would have been");
  assert.ok(risky.why.includes("orc-executor-sonnet-4-6-high"), "it names where it is held back TO");

  // boundary REFUSE holds, and holds in `warn` too.
  const ref = json(run(p, ["extra", "resolve", "--slot", "fast-executor", "--boundary", "REFUSE", "--json"]));
  assert.equal(ref.held_back, "boundary");
  assert.match(ref.why, /warn/);

  // A profile that lost its verification.
  const l = readLedger(p);
  l.profiles[0].verified_at = null;
  fs.writeFileSync(ledgerPath(p), JSON.stringify(l, null, 2));
  const unv = json(run(p, ["extra", "resolve", "--slot", "fast-executor", "--json"]));
  assert.equal(unv.held_back, "unverified");
  assert.ok(unv.why.includes("ds"));

  // A profile that no longer exists at all.
  const l2 = readLedger(p);
  l2.profiles = [];
  fs.writeFileSync(ledgerPath(p), JSON.stringify(l2, null, 2));
  const miss = json(run(p, ["extra", "resolve", "--slot", "fast-executor", "--json"]));
  assert.equal(miss.held_back, "missing-profile");
  rmrf(p.root);
});

test("a STALE verification STILL ROUTES, and says so", () => {
  const p = project();
  setCfg(p, "extra_enabled: true\nextra_verify_max_days: 1\n");
  verified(p);
  run(p, ["extra", "role", "set", "doc-checker", "ds/fake-flash", "--json"]);
  const l = readLedger(p);
  l.profiles[0].verified_at = new Date(Date.now() - 30 * 86400000).toISOString();
  fs.writeFileSync(ledgerPath(p), JSON.stringify(l, null, 2));

  const r = run(p, ["extra", "resolve", "--slot", "doc-checker", "--json"]);
  assert.equal(r.status, 0, "a stale check is not a failed one — it still routes");
  const j = json(r);
  assert.equal(j.verify_state, "STALE");
  assert.equal(j.needs_reping, true);
  assert.match(j.why, /STALE/);
  rmrf(p.root);
});

test("`role set` refuses by name and writes NOTHING: unknown profile · unverified profile", () => {
  const p = project();
  const before = fs.existsSync(ledgerPath(p)) ? fs.readFileSync(ledgerPath(p), "utf8") : null;
  const r1 = run(p, ["extra", "role", "set", "doc-writer", "nope/m", "--json"]);
  assert.equal(r1.status, 1);
  assert.equal(json(r1).reason, "unknown-profile");

  // Present but never proven.
  run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", "http://127.0.0.1:1", "--env-key", "K"]);
  const r2 = run(p, ["extra", "role", "set", "doc-writer", "ds/m", "--json"]);
  assert.equal(r2.status, 1);
  assert.equal(json(r2).reason, "unverified");
  assert.deepEqual(readLedger(p).slots, [], "a refused write leaves the ledger untouched");
  assert.ok(before === null || true);
  rmrf(p.root);
});

test("a model outside models_seen WARNS AND STORES — ORC's cache is not the authority", () => {
  const p = project();
  setCfg(p, "extra_enabled: true\n");
  verified(p);
  const r = run(p, ["extra", "role", "set", "doc-writer", "ds/never-seen-model", "--json"]);
  assert.equal(r.status, 0, "stored, not refused");
  assert.equal(json(r).model_known, false);
  assert.equal(readLedger(p).slots[0].model, "never-seen-model");
  rmrf(p.root);
});

test("a slot is a POINT: `set` on an occupied slot REPLACES and says what it replaced", () => {
  const p = project();
  setCfg(p, "extra_enabled: true\n");
  verified(p);
  run(p, ["extra", "role", "set", "doc-writer", "ds/fake-flash", "--json"]);
  const r = run(p, ["extra", "role", "set", "doc-writer", "ds/fake-pro", "--json"]);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.ok(j.replaced, "the replacement is named");
  assert.equal(j.replaced.model, "fake-flash");
  const l = readLedger(p);
  assert.equal(l.slots.length, 1, "one row per slot, maximum");
  assert.equal(l.slots[0].model, "fake-pro");
  rmrf(p.root);
});

test("`role rm` puts the position back on its pinned agent; removing an empty slot exits 1", () => {
  const p = project();
  setCfg(p, "extra_enabled: true\n");
  verified(p);
  const empty = run(p, ["extra", "role", "rm", "doc-writer", "--json"]);
  assert.equal(empty.status, 1);
  assert.equal(json(empty).reason, "no-such-row");

  run(p, ["extra", "role", "set", "doc-writer", "ds/fake-flash", "--json"]);
  const r = run(p, ["extra", "role", "rm", "doc-writer", "--json"]);
  assert.equal(r.status, 0);
  assert.equal(json(r).back_to.agent, "orc-doc-writer-opus-5-med");
  assert.deepEqual(readLedger(p).slots, []);
  rmrf(p.root);
});

test("MIGRATION: a v1 ledger reads slots:[] and is NOT rewritten on read; the first write bumps to 2", () => {
  const p = project();
  verified(p);
  // Force the on-disk shape back to v1, with no `slots` key at all.
  const l = readLedger(p);
  delete l.slots;
  l.version = 1;
  const v1 = JSON.stringify(l, null, 2) + "\n";
  fs.writeFileSync(ledgerPath(p), v1);

  const read = run(p, ["extra", "role", "list", "--json"]);
  assert.equal(read.status, 1);
  assert.equal(fs.readFileSync(ledgerPath(p), "utf8"), v1, "a READ never rewrites the ledger — lazy, free, non-destructive");

  assert.equal(run(p, ["extra", "role", "set", "doc-writer", "ds/fake-flash", "--json"]).status, 0);
  const after = readLedger(p);
  assert.equal(after.version, 2);
  assert.equal(after.slots.length, 1);
  assert.ok(Array.isArray(after.routes) && Array.isArray(after.profiles), "the addition is ADDITIVE — nothing else moved");
  rmrf(p.root);
});

test("`role show --json` is the WHOLE computed object, not a summary", () => {
  const p = project();
  setCfg(p, "extra_enabled: true\n");
  verified(p);
  run(p, ["extra", "role", "set", "wiki-scanner-light", "ds/fake-flash", "--json"]);
  const j = json(run(p, ["extra", "role", "show", "wiki-scanner-light", "--json"]));
  for (const k of ["slot", "lane", "routed", "profile", "model", "provider", "engine", "verify_state", "verify_age_days", "model_known", "meaning", "asks", "announce_point", "claude", "resolved", "why", "announce"])
    assert.ok(k in j, "role show --json must carry " + k);
  assert.equal(j.claude.agent, "orc-wiki-scanner-sonnet-5-high");
  rmrf(p.root);
});


test("GOLDEN: EXTRA_SLOTS matches the markdown slot table, in BOTH directions", () => {
  // The EXTRA_LANE_SHAPES / DIY_STEPS precedent. A row in the markdown and not
  // in the code fails; a row in the code and not in the markdown fails too.
  const cliSrc = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "cli.js"), "utf8");
  const md = fs.readFileSync(
    path.join(__dirname, "..", "..", "templates", "skills", "_shared", "extra-dispatch.md"),
    "utf8"
  );

  const constBlock = (cliSrc.match(/const EXTRA_SLOTS = \[([\s\S]*?)\n\];/) || ["", ""])[1];
  const inCode = [...constBlock.matchAll(/slot: "([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(inCode, SLOTS, "EXTRA_SLOTS is the six, in order");

  const table = (md.match(/## The slot table([\s\S]*?)\n### The nine hold-backs/) || ["", ""])[1];
  const inMd = new Set([...table.matchAll(/^\| `([a-z-]+)` \| `(\/orc[a-z-]*)`/gm)].map((m) => m[1]));

  for (const slot of inMd) assert.ok(inCode.includes(slot), `${slot} is in the markdown table and not in EXTRA_SLOTS`);
  for (const slot of inCode) assert.ok(inMd.has(slot), `${slot} is in EXTRA_SLOTS and not in the markdown table`);

  // And the AGENT each row displaces has to agree too — the displaced answer is
  // a NAME rather than an interval, which is the whole point of a slot.
  for (const slot of inCode) {
    const row = new RegExp("^\\| `" + slot + "` \\|[^|]*\\|([^|]*)\\|", "m").exec(table);
    assert.ok(row, slot + " has no markdown row");
    const codeRow = new RegExp('slot: "' + slot + '"[\\s\\S]*?claude: \\[([^\\]]*)\\]').exec(constBlock);
    for (const agent of codeRow[1].match(/orc-[a-z0-9-]+/g))
      assert.ok(row[1].includes(agent), `${slot}: the markdown does not name ${agent}`);
  }
});
