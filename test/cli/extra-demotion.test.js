"use strict";
// @test-pool spawn  — shells node bin/cli.js; no provider, no socket
// `orc extra demotion` — THE STALL DEMOTION (v1.0.0 W5).
//
// The priority ladder moves at runtime, and nothing else about it moves. Every
// assertion here is about one of the four things the demotion must never do, or
// about the trigger itself:
//
//   · TWO consecutive `stalled` dispatches on one profile in one run demote it,
//     and one does not
//   · a resume of the same stalled attempt is the SAME stall — it neither
//     increments the counter nor resets it
//   · ONLY `stalled` counts: a 401 and a rate limit do not demote, and either
//     one RESETS the counter
//   · the two clocks stay two clocks — `extra_stall_s: 0` leaves only the stale
//     clock, and `extra_demote_after: 0` turns the consecutive clock off
//   · the RESOLVER holds back, with `held_back: "demoted"`, and the task lands
//     on the SAME Claude agent it would have had — the score does not move
//   · a demotion NEVER writes the user's config
//   · promote/demote REQUIRE a reason, and a promote is a WATERMARK, not a mute
//   · preflight reports it and does NOT move its exit code; doctor names it;
//     `orc lane config` renders the rank as `demoted` and announces it
//
// NOTHING HERE SPAWNS A PROVIDER. The journal is written straight to disk — the
// `extra-slots.test.js` reasoning verbatim: every case in this file is about the
// COMPUTATION over that journal, and a fake provider missing its probe timeout
// fails in a way that looks exactly like a real regression.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tmpdir, rmrf, cli } = require("../_helpers.js");

const RUN = "add-health-route";
const TRACE = `run-orc-${RUN}-290826-101500.txt`;

function project(cfgExtra) {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  const claude = path.join(root, ".claude");
  const logs = path.join(claude, "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  // The run pointer is how the CLI learns which run this is — read from disk,
  // exactly as `appendExtraSpend` reads it. No caller ever hands it in.
  fs.writeFileSync(path.join(logs, ".current"), TRACE);
  fs.writeFileSync(path.join(logs, TRACE), "trace\n");
  fs.writeFileSync(
    path.join(claude, "orc.config.yaml"),
    "extra_enabled: true\nextra_roles: [executor]\nlog_dir: .claude/orc/logs\n" + (cfgExtra || "")
  );
  return { root, home, env: { HOME: home, USERPROFILE: home }, t: Date.now() - 6 * 3600 * 1000 };
}
const run = (p, args, env) => cli([...args, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);
const cfgText = (p) => fs.readFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "utf8");

// One journal attempt, written the way `orc extra dispatch` writes it.
// `reason: null` + `result: false` is an attempt that never reported back.
function attempt(p, task, n, o) {
  const opt = o || {};
  const dir = path.join(p.root, ".claude", "orc", "extra-journal", task);
  fs.mkdirSync(dir, { recursive: true });
  const nn = String(n).padStart(2, "0");
  p.t += 60000;
  const started = opt.startedMs === undefined ? p.t : opt.startedMs;
  // A dead pid and an expired lease: these attempts are OVER unless a case says
  // otherwise. `extraAttemptLive` treats an expired lease as "somebody else's
  // process" whatever the pid says.
  const live = !!opt.live;
  fs.writeFileSync(
    path.join(dir, `attempt-${nn}.json`),
    JSON.stringify(
      {
        v: 1,
        task_id: task,
        attempt: n,
        run: opt.run === undefined ? RUN : opt.run,
        lane: "orc",
        profile: opt.profile || "ds",
        provider: "custom",
        engine: "api",
        model_requested: "fake-flash",
        started_at: new Date(started).toISOString(),
        resumed_from: opt.resumed ? { reason: "stalled", attempt: n - 1 } : null,
        pid: live ? process.pid + 0 : 999999,
        lease_expires_at: new Date(live ? Date.now() + 600000 : started - 1000).toISOString(),
      },
      null,
      2
    )
  );
  const prog = path.join(dir, `attempt-${nn}.progress.jsonl`);
  fs.writeFileSync(prog, "");
  // The stale clock reads the progress file's mtime — the last time anything
  // happened — so a case that wants a quiet worker backdates it.
  if (opt.quietMs) {
    const at = new Date(Date.now() - opt.quietMs);
    fs.utimesSync(prog, at, at);
  }
  if (opt.result !== false)
    fs.writeFileSync(
      path.join(dir, `attempt-${nn}.result.json`),
      JSON.stringify({ outcome: opt.outcome || "failed", reason: opt.reason === undefined ? "stalled" : opt.reason }, null, 2)
    );
}

// A verified profile, WITHOUT SPAWNING ANYTHING, plus a route row for [0,30).
function verified(p, name) {
  const dir = path.join(p.root, ".claude", "orc");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "extra.json");
  const ledger = { version: 2, profiles: [], routes: [], slots: [], history: [] };
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
  ledger.routes.push({ from: 0, to: 30, profile: name || "ds", model: "fake-flash", small_model: null, max_turns: null });
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2) + "\n");
}

// ── the trigger ────────────────────────────────────────────────────────────

test("ONE stall is not two — the counter moves and the ladder does not", () => {
  const p = project();
  attempt(p, "T-1", 1, {});
  const r = run(p, ["extra", "demotion", "--json"]);
  assert.equal(r.status, 0, "0 is `armed`, and the exit code IS the answer");
  const j = json(r);
  assert.equal(j.demoted, false);
  assert.equal(j.profiles[0].consecutive_stalls, 1);
  assert.equal(j.trace_line, null, "no demotion, no line — a clean run must not emit one");
  assert.equal(j.ladder.effective_now, "extra_enabled (P0)");
  rmrf(p.root);
});

test("TWO consecutive stalls demote the profile, and the CLI composes the line", () => {
  const p = project();
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  const r = run(p, ["extra", "demotion", "--json"]);
  assert.equal(r.status, 1, "1 is `demoted`");
  const j = json(r);
  assert.equal(j.demoted, true);
  assert.deepEqual(j.demoted_profiles, ["ds"]);
  assert.equal(j.reasons[0].reason, "consecutive-stall");
  // The evidence is NAMED. A verdict with no task ids is a verdict nobody can
  // check against the journal it came from.
  assert.match(j.reasons[0].why, /T-1, T-2/);
  // CLI-composed, because a demotion that leaves no line cannot be counted.
  assert.match(j.trace_line, /^EXTRA demote run=add-health-route :: profile=ds reason=consecutive-stall n=2 → /);
  // The ladder moved, and BOTH halves are reported.
  assert.ok(j.ladder.before[0].startsWith("extra_enabled"));
  assert.match(j.ladder.after[j.ladder.after.length - 1], /extra_enabled — DEMOTED/);
  rmrf(p.root);
});

test("a resume of the SAME stalled attempt is the same stall — it neither counts nor resets", () => {
  const p = project();
  attempt(p, "T-1", 1, {});
  attempt(p, "T-1", 2, { resumed: true });
  attempt(p, "T-1", 3, { resumed: true, outcome: "done", reason: null });
  const j = json(run(p, ["extra", "demotion", "--json"]));
  assert.equal(j.demoted, false, "one stall, however many continuations");
  assert.equal(j.profiles[0].consecutive_stalls, 1);
  assert.equal(j.profiles[0].resumes_of_the_same_stall, 2);
  // And a successful resume does NOT erase the stall: a profile that needs a
  // continuation twice in a row is still costing more than it saves.
  attempt(p, "T-2", 1, {});
  assert.equal(run(p, ["extra", "demotion", "--json"]).status, 1);
  rmrf(p.root);
});

test("ONLY `stalled` counts — a 401 and a rate limit never demote, and both RESET", () => {
  const p = project();
  attempt(p, "T-1", 1, { reason: "authentication_failed" });
  attempt(p, "T-2", 1, { reason: "rate_limit" });
  attempt(p, "T-3", 1, { reason: "timeout" });
  let j = json(run(p, ["extra", "demotion", "--json"]));
  assert.equal(j.demoted, false, "a demotion on a 401 would hide a credential problem behind a routing change");
  assert.equal(j.profiles[0].consecutive_stalls, 0);

  // one stall, then a NON-stall, then a stall — that is not two in a row.
  attempt(p, "T-4", 1, {});
  attempt(p, "T-5", 1, { reason: "rate_limit" });
  attempt(p, "T-6", 1, {});
  j = json(run(p, ["extra", "demotion", "--json"]));
  assert.equal(j.demoted, false);
  assert.equal(j.profiles[0].consecutive_stalls, 1);
  rmrf(p.root);
});

test("the counter is per PROFILE, not global", () => {
  const p = project();
  attempt(p, "T-1", 1, { profile: "ds" });
  attempt(p, "T-2", 1, { profile: "other" });
  const j = json(run(p, ["extra", "demotion", "--json"]));
  assert.equal(j.demoted, false, "one stall each is not two on either");
  assert.equal(j.profiles.length, 2);
  for (const g of j.profiles) assert.equal(g.consecutive_stalls, 1);
  rmrf(p.root);
});

test("an attempt with NO run belongs to no run's clock, and is COUNTED and named", () => {
  const p = project();
  attempt(p, "T-1", 1, {});
  attempt(p, "T-old", 1, { run: null });
  attempt(p, "T-other", 1, { run: "some-other-run" });
  const j = json(run(p, ["extra", "demotion", "--json"]));
  assert.equal(j.demoted, false, "neither of those two is this run's evidence");
  assert.equal(j.profiles[0].consecutive_stalls, 1);
  // Both ABSENT counts are named — a report quietly short by rows is the exact
  // failure this rule exists to prevent.
  assert.equal(j.skipped_unattributed, 1);
  rmrf(p.root);
});

// ── the two clocks stay two clocks ─────────────────────────────────────────

test("a LIVE attempt quiet past extra_demote_stale_min demotes on the OTHER clock", () => {
  const p = project();
  attempt(p, "T-1", 1, { result: false, live: true, quietMs: 25 * 60000 });
  const r = run(p, ["extra", "demotion", "--json"]);
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.reasons[0].reason, "stale-live-attempt");
  assert.equal(j.profiles[0].consecutive_stalls, 0, "the stale clock is not the consecutive clock");
  assert.ok(j.profiles[0].stale.quiet_min >= 25);
  assert.match(j.trace_line, /reason=stale-live-attempt n=2[0-9]/);
  rmrf(p.root);
});

test("a live attempt UNDER the threshold is reported and does not demote", () => {
  const p = project();
  attempt(p, "T-1", 1, { result: false, live: true, quietMs: 5 * 60000 });
  const j = json(run(p, ["extra", "demotion", "--json"]));
  assert.equal(j.demoted, false);
  assert.equal(j.profiles[0].stale.over_threshold, false);
  rmrf(p.root);
});

test("`extra_stall_s: 0` leaves ONLY the stale clock, and the report SAYS SO", () => {
  const p = project("extra_stall_s: 0\n");
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  const j = json(run(p, ["extra", "demotion", "--json"]));
  // The consecutive threshold is still armed — but no dispatch can ever be
  // classified `stalled`, so it can never fire. A clock that cannot fire must
  // never be reported as a clock that is watching.
  assert.equal(j.clocks.consecutive.on, true);
  assert.match(j.clocks.consecutive.note, /extra_stall_s is 0/);
  assert.match(j.clocks.consecutive.note, /Only the stale clock remains/);
  rmrf(p.root);
});

test("`extra_demote_after: 0` and `extra_demote_stale_min: 0` are the honest off switch", () => {
  const p = project("extra_demote_after: 0\nextra_demote_stale_min: 0\n");
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  attempt(p, "T-3", 1, { result: false, live: true, quietMs: 90 * 60000 });
  const r = run(p, ["extra", "demotion", "--json"]);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.demoted, false, "both clocks off is the whole mechanism off — no third key needed");
  assert.equal(j.clocks.consecutive.on, false);
  assert.equal(j.clocks.stale.on, false);
  rmrf(p.root);
});

// ── what it does, and the four things it must never do ─────────────────────

test("the RESOLVER holds back with `held_back: demoted`, and the score does not move", () => {
  const p = project();
  verified(p, "ds");
  const before = json(run(p, ["extra", "resolve", "20", "--json"]));
  assert.equal(before.resolved, "extra", "the route row covers 20 before anything stalls");

  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  const r = run(p, ["extra", "resolve", "20", "--json"]);
  assert.equal(r.status, 1, "1 is `claude`");
  const j = json(r);
  assert.equal(j.resolved, "claude");
  assert.equal(j.held_back, "demoted");
  // A DEMOTION CHANGES WHERE, NOT WHAT. Same score, and the SAME Claude agent
  // the fall-through would always have named.
  assert.equal(j.score, 20);
  assert.equal(j.claude.agent, before.claude.agent);
  assert.deepEqual(j.would_have_been, { profile: "ds", model: "fake-flash" });
  assert.match(j.why, /orc extra promote add-health-route/);
  rmrf(p.root);
});

test("a demotion NEVER writes the user's config", () => {
  const p = project();
  verified(p, "ds");
  const before = cfgText(p);
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  run(p, ["extra", "demotion", "--json"]);
  run(p, ["extra", "resolve", "20", "--json"]);
  assert.equal(cfgText(p), before, "run state, like ultra_mode — never a config edit");
  // And it lands in the RUN folder, beside RESUME.md.
  run(p, ["extra", "demote", RUN, "--reason", "the provider is down", "--json"]);
  assert.ok(fs.existsSync(path.join(p.root, ".claude", "orc", "run", RUN, "extra-demotion.json")));
  assert.equal(cfgText(p), before);
  rmrf(p.root);
});

test("`orc lane config` renders the rank as `demoted` and ANNOUNCES it", () => {
  const p = project();
  verified(p, "ds");
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  const j = json(run(p, ["lane", "config", "orc", "--json"]));
  const rank = j.families["executor-band"].ranks.find((x) => x.key === "extra_enabled");
  // Its own word, keeping its slot. Rendering it as `extra: off` would make "I
  // turned this off" and "this run left your provider" look identical.
  assert.equal(rank.state, "demoted");
  assert.match(rank.why, /demoted for run add-health-route/);
  assert.match(rank.why, /orc extra promote/);
  assert.ok(
    j.announce.some((a) => /extra: DEMOTED for the rest of this run/.test(a)),
    "a lane that quietly STOPS is the mirror of one that quietly routes off Claude"
  );
  rmrf(p.root);
});

// ── the human half ─────────────────────────────────────────────────────────

test("promote and demote both REFUSE without a reason", () => {
  const p = project();
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  for (const verb of ["promote", "demote"]) {
    const r = run(p, ["extra", verb, RUN, "--json"]);
    assert.equal(r.status, 2);
    assert.equal(json(r).reason, "reason-required");
  }
  rmrf(p.root);
});

test("promote on a run that is NOT demoted exits 1 and writes nothing", () => {
  const p = project();
  const r = run(p, ["extra", "promote", RUN, "--reason", "just in case", "--json"]);
  assert.equal(r.status, 1);
  assert.equal(json(r).reason, "not-demoted");
  assert.ok(!fs.existsSync(path.join(p.root, ".claude", "orc", "run", RUN, "extra-demotion.json")));
  rmrf(p.root);
});

test("a promote is a WATERMARK, not a mute — it forgives what it saw and re-arms", () => {
  const p = project();
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  assert.equal(run(p, ["extra", "demotion", "--json"]).status, 1);

  const r = run(p, ["extra", "promote", RUN, "--reason", "provider says it is back"]);
  assert.equal(r.status, 0);
  assert.equal(run(p, ["extra", "demotion", "--json"]).status, 0, "the evidence it saw is forgiven");

  // TWO FRESH STALLS AFTER IT demote again — a promote that suppressed the
  // clock for the rest of the run would be an auto-off switch wearing a
  // human's name.
  p.t = Date.now() + 1000;
  attempt(p, "T-3", 1, {});
  attempt(p, "T-4", 1, {});
  const j = json(run(p, ["extra", "demotion", "--json"]));
  assert.equal(j.demoted, true);
  assert.match(j.reasons[0].why, /T-3, T-4/);
  assert.ok(!/T-1/.test(j.reasons[0].why), "the forgiven stalls are gone, not re-counted");
  assert.match(j.reasons[0].why, /evidence from AFTER the promote/);
  rmrf(p.root);
});

test("a manual demote holds a run that has stalled nothing, and records the reason", () => {
  const p = project();
  verified(p, "ds");
  assert.equal(run(p, ["extra", "resolve", "20", "--json"]).status, 0, "routing before");
  const r = run(p, ["extra", "demote", RUN, "--reason", "their status page is red", "--json"]);
  assert.equal(r.status, 0);
  assert.equal(json(r).now_demoted, true);
  const j = json(run(p, ["extra", "demotion", "--json"]));
  assert.equal(j.reasons[0].reason, "manual");
  assert.match(j.reasons[0].why, /their status page is red/);
  assert.equal(run(p, ["extra", "resolve", "20", "--json"]).status, 1, "and the resolver honours it");
  rmrf(p.root);
});

test("an unknown run is REFUSED with exit 2, never answered as `armed`", () => {
  const p = project();
  // No pointer, no argument: there is no run to scope a demotion to, and
  // saying "nothing is demoted" would be answering a question nobody asked.
  fs.rmSync(path.join(p.root, ".claude", "orc", "logs", ".current"));
  const r = run(p, ["extra", "demotion", "--json"]);
  assert.equal(r.status, 2);
  assert.equal(json(r).reason, "unknown-run");
  rmrf(p.root);
});

// ── who reports it ─────────────────────────────────────────────────────────

test("preflight REPORTS a demotion and does NOT move its exit code", () => {
  const p = project();
  verified(p, "ds");
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  const r = run(p, ["extra", "preflight", "--json"]);
  assert.equal(r.status, 0, "a demotion is a FINDING, not a stop — the orphan precedent");
  const j = json(r);
  assert.ok(j.demotion);
  assert.deepEqual(j.demotion.demoted_profiles, ["ds"]);
  assert.match(j.demotion.promote, /^orc extra promote add-health-route/);
  assert.match(j.demotion_note, /not a stop/);
  rmrf(p.root);
});

test("`orc extra doctor` names the demoted run and the command that clears it", () => {
  const p = project();
  verified(p, "ds");
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  const r = run(p, ["extra", "doctor", "--json"]);
  assert.equal(r.status, 1);
  const f = json(r).findings.find((x) => x.id === "extra-demoted-run");
  assert.ok(f, "a demotion nobody can see is a subsystem that went quiet");
  assert.deepEqual(f.profiles, ["ds"]);
  assert.equal(f.run, RUN);
  assert.match(f.fix_command, /^orc extra promote/);
  rmrf(p.root);
});

test("`orc extra stats` counts demotions per profile, with NO rate below the floor", () => {
  const p = project();
  verified(p, "ds");
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  const j = json(run(p, ["extra", "stats", "--json"]));
  const g = j.demotions.profiles.find((x) => x.profile === "ds");
  assert.equal(g.runs_seen, 1);
  assert.equal(g.runs_demoted, 1);
  // One demotion out of one run is not a 100% demotion rate — it is one bad
  // afternoon with a percent sign bolted on (the `extra-profile-unreliable`
  // restraint, verbatim).
  assert.equal(g.demote_rate, null);
  assert.equal(j.demotions.rate_floor, 3);
  assert.equal(g.reasons["consecutive-stall"], 1);
  rmrf(p.root);
});

test("with extra_enabled false nothing is demoted, and no work was done to find out", () => {
  const p = project();
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: false\nlog_dir: .claude/orc/logs\n");
  attempt(p, "T-1", 1, {});
  attempt(p, "T-2", 1, {});
  // The state is still COMPUTED honestly — the journal says what it says — but
  // the master gate means nothing routes anyway, so `orc lane config` must not
  // announce a demotion of a subsystem that is off.
  const j = json(run(p, ["lane", "config", "orc", "--json"]));
  assert.ok(!j.announce.some((a) => /DEMOTED/.test(a)));
  rmrf(p.root);
});
