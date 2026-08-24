"use strict";
// `orc extra resume-slice` — the continuation, and the loop around it (v0.54.0).
//
// `a lane that re-does work the worktree already contains` has broken this
// contract. A resume is a NEW DISPATCH OF A DERIVED SLICE through the ordinary
// bridge — zero new engines, zero new agents — so the assertions here are about
// what the derivation may and may not change:
//
//   · `declared_files` is never widened, `acceptance[]` never moves, the score
//     never moves, and the original slice's hash is carried and compared
//   · six refusals, each NAMED, and every one of them writes NOTHING
//   · the target is DERIVED from the failure classification plus the
//     attribution — a `network` verdict HOLDS the wave rather than falling back
//   · a non-retryable failure still gets a RESUME slice, on Claude
//   · `extra_resume: off` reproduces 0.53.4 behaviour
//   · a killed dispatch's spend is recovered as a FLOOR and says so
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { tmpdir, rmrf, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const SECRET_KEY = "sk-live-PLANTEDSECRET0123456789";

function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "// the original helper\n");
  fs.writeFileSync(path.join(root, "src", "app.js"), "// app\nconst x = 1;\n");
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, a, env) => cli([...a, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);

function gitRepo(root) {
  const g = (...argv) => spawnSync("git", argv, { cwd: root, encoding: "utf8" });
  if (g("init", "-q").status !== 0) return false;
  g("config", "user.email", "t@example.invalid");
  g("config", "user.name", "t");
  g("config", "commit.gpgsign", "false");
  g("add", "-A");
  g("commit", "-qm", "baseline");
  return true;
}

async function armed(p, mode, cfgExtra) {
  const f = await fakeProvider(mode || "chat");
  const base = `http://127.0.0.1:${f.port}`;
  assert.equal(run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K"]).status, 0);
  assert.equal(run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY }).status, 0);
  assert.equal(run(p, ["extra", "route", "set", "0-30", "ds/fake-flash", "--json"]).status, 0);
  fs.writeFileSync(
    path.join(p.root, ".claude", "orc.config.yaml"),
    "extra_enabled: true\nextra_roles: [executor]\n" + (cfgExtra || "")
  );
  return f;
}

const SLICE = path.sep === "\\" ? "slice.json" : "slice.json";
function slice(p, over) {
  const file = path.join(p.root, SLICE);
  fs.writeFileSync(
    file,
    JSON.stringify(
      Object.assign(
        {
          task_id: "T-2",
          score: 20,
          role: "executor",
          prompt: "Add a health route that returns 200.",
          standing_rules: "# ORC standing rules\nReturn the contract.\n",
          declared_files: ["src/routes/health.js", "src/app.js"],
          acceptance: ["GET /health returns 200 {status:'ok'}"],
        },
        over || {}
      )
    )
  );
  return file;
}
const dispatch = (p, over) => run(p, ["extra", "dispatch", "--task", slice(p, over), "--json"], { K: SECRET_KEY });
const outPath = (p) => path.join(p.root, "T-2.resume.json");
const resumeSlice = (p, extra) => run(p, ["extra", "resume-slice", "T-2", "--out", outPath(p), ...(extra || [])]);

// ── the happy path ─────────────────────────────────────────────────────────
test("the derived slice CONTINUES: it carries the position and changes nothing it may not", async () => {
  const p = project();
  assert.ok(gitRepo(p.root));
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    const r = resumeSlice(p, ["--json"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const v = json(r);
    assert.equal(v.ok, true);
    assert.equal(v.slice_path, outPath(p));
    assert.equal(v.next_attempt, 2);

    const derived = JSON.parse(fs.readFileSync(outPath(p), "utf8"));
    const original = JSON.parse(fs.readFileSync(path.join(p.root, SLICE), "utf8"));

    // NEVER WIDENED. A resume that could add a path is a fence expansion nobody
    // approved, arriving through the one door where nobody is watching.
    assert.deepEqual(derived.declared_files, original.declared_files);
    // NEVER MOVES. A resume that could relax the definition of done would let a
    // failure rewrite its own grade.
    assert.deepEqual(derived.acceptance, original.acceptance);
    // NEVER MOVES — so the resume resolves through the SAME resolver and lands
    // on the SAME band. A resume is not a discount.
    assert.equal(derived.score, original.score);
    assert.equal(derived.role, original.role);
    assert.equal(derived.standing_rules, original.standing_rules);

    // The preamble is ABOVE the original prompt, never replacing it.
    assert.ok(derived.prompt.endsWith(original.prompt));
    assert.match(derived.prompt, /already contains its partial work/);
    assert.match(derived.prompt, /Do not start over/);
    assert.match(derived.prompt, /`src\/routes\/health\.js` — \*\*created\*\* by the previous attempt \(\+7 \/ −0 lines\)/);
    assert.match(derived.prompt, /`src\/app\.js` — \*\*untouched\*\*/);
    assert.match(derived.prompt, /Last recorded action: .*Write src\/routes\/health\.js/);
    assert.match(derived.prompt, /resume_state/);

    // Machine-readable, beside the prose.
    assert.deepEqual(
      derived.preexisting.map((x) => [x.path, x.state]),
      [
        ["src/routes/health.js", "created"],
        ["src/app.js", "untouched"],
      ]
    );
    assert.deepEqual(derived.resume_readonly_hint, ["src/routes/health.js"]);
    assert.equal(derived.resumed_from.attempt, 1);
    assert.ok(derived.resumed_from.reason);

    // ONE WORDING. The renderer prints what the CLI composed; nobody writes a
    // second one.
    assert.equal(v.preamble, derived.prompt.slice(0, v.preamble.length));
    assert.equal(v.next, `orc extra dispatch --task ${outPath(p)} --json`);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("the resumed dispatch is an ORDINARY dispatch: new attempt, same band, `EXTRA resume` in the trace", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    const first = json(dispatch(p));
    assert.equal(first.attempt, 1);
    assert.equal(resumeSlice(p, ["--json"]).status, 0);

    const r = run(p, ["extra", "dispatch", "--task", outPath(p), "--json"], { K: SECRET_KEY });
    const v = json(r);
    assert.equal(v.dispatched, true);
    assert.equal(v.attempt, 2, "a resume is a NEW attempt, never an overwrite");
    assert.equal(v.band, first.band, "the score never moved, so neither did the band");
    assert.equal(v.via, first.via);
    assert.equal(v.resume_expected, true);
    assert.equal(v.files_preexisting, 1);
    assert.equal(v.resumed_from.attempt, 1);

    // Composed by the CLI, copied VERBATIM by the lane — three readers parse
    // this format.
    const line = v.trace_extras.find((x) => x.startsWith("EXTRA resume"));
    assert.ok(line, "a resume that leaves no trace line cannot be counted: " + JSON.stringify(v.trace_extras));
    assert.match(
      line,
      /^EXTRA resume task=T-2 attempt=2 :: from=\S+ attribution=\S+ target=extra:ds files_preexisting=1$/
    );
    // Attempt 1's header is still exactly where it was.
    assert.ok(fs.existsSync(path.join(p.root, ".claude", "orc", "extra-journal", "T-2", "attempt-01.json")));
    assert.ok(fs.existsSync(path.join(p.root, ".claude", "orc", "extra-journal", "T-2", "attempt-02.json")));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── the target, DERIVED ────────────────────────────────────────────────────
test("a retryable failure resumes on the SAME profile in a new session", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    const v = json(resumeSlice(p, ["--json"]));
    assert.equal(v.resume_target.kind, "extra");
    assert.equal(v.resume_target.profile, "ds");
    assert.match(v.resume_target.why, /retryable/);
    assert.match(v.announce, /NEW session/);
    // And reconcile agrees, because both call the same function.
    assert.deepEqual(json(run(p, ["extra", "reconcile", "T-2", "--json"])).resume_target, v.resume_target);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a NON-retryable failure goes to Claude — and STILL as a resume slice", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    // Re-stamp the recorded failure as a non-retryable one. The classification
    // is the input the target is derived from, so this is the honest way to
    // drive the branch.
    const rp = path.join(p.root, ".claude", "orc", "extra-journal", "T-2", "attempt-01.result.json");
    const res = JSON.parse(fs.readFileSync(rp, "utf8"));
    res.reason = "authentication_failed";
    res.retry = false;
    res.fallback_to = { agent: "orc-executor-sonnet-4-6-med" };
    res.attribution = { verdict: "provider", why: "the endpoint rejected the credential.", evidence: [], fallback_would_also_fail: false };
    fs.writeFileSync(rp, JSON.stringify(res));

    const v = json(resumeSlice(p, ["--json"]));
    assert.equal(v.resume_target.kind, "claude");
    assert.equal(v.resume_target.agent, "orc-executor-sonnet-4-6-med");
    // THE CASE THAT FIXES GAP 1. A Claude executor landing on a two-thirds
    // written file with a from-scratch slice is what this release removes.
    const derived = JSON.parse(fs.readFileSync(outPath(p), "utf8"));
    assert.match(derived.prompt, /already contains its partial work/);
    assert.equal(derived.preexisting.length, 2);
    assert.match(v.announce, /still as a RESUME slice/);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("attribution `network` HOLDS the wave — a fallback that cannot succeed is a second cost for nothing", async () => {
  const p = project();
  // Verified while the fixture was up, then the whole host goes away: the
  // connection never opens AND the probe fails.
  const f = await armed(p, "chat");
  f.stop();
  await new Promise((r) => setTimeout(r, 200));
  const d = json(dispatch(p, { declared_files: ["src/a.js"] }));
  assert.equal(d.attribution.verdict, "network");
  // Nothing was written, so this one is `nothing-to-resume` — and even the
  // reconcile says the network is the thing to fix.
  assert.equal(run(p, ["extra", "reconcile", "T-2", "--json"]).status, 1);

  // Now the same verdict on a worktree that DID move: the hold is what matters.
  const rp = path.join(p.root, ".claude", "orc", "extra-journal", "T-2", "attempt-01.result.json");
  fs.writeFileSync(path.join(p.root, "src", "a.js"), "// half-written by the worker\n");
  const v = json(run(p, ["extra", "reconcile", "T-2", "--json"]));
  assert.equal(v.state, "resumable");
  assert.equal(v.resume_target.kind, "hold");
  assert.match(v.resume_target.why, /Claude fallback would fail too/);
  assert.equal(v.next, null, "there is no next command while the wave is held");

  const r = resumeSlice(p, ["--json"]);
  assert.equal(r.status, 1);
  const ref = json(r);
  assert.equal(ref.reason, "not-resumable");
  assert.equal(ref.slice_path, null, "a refusal writes NOTHING");
  assert.ok(!fs.existsSync(outPath(p)));
  assert.match(ref.error, /NETWORK/);
  fs.rmSync(rp, { force: true });
  rmrf(p.root);
});

test("`extra_resume_max` STOPS with an honest report and names the Claude agent", async () => {
  const p = project();
  const f = await armed(p, "chat-drop", "extra_resume_max: 1\n");
  try {
    dispatch(p);
    // One resume is allowed…
    assert.equal(resumeSlice(p, ["--json"]).status, 0);
    assert.equal(run(p, ["extra", "dispatch", "--task", outPath(p), "--json"], { K: SECRET_KEY }).status, 1);
    // Attempt 2's slice is the DERIVED one, and it is immutable for attempt 2
    // exactly as the original was for attempt 1 — deleting it would be
    // `slice-drifted`, correctly, so the second resume writes somewhere else.
    const out2 = path.join(p.root, "T-2.resume-2.json");
    // …and the SECOND worker was cut off mid-write as well, so attempt 2 left a
    // position of its own. Without that the honest answer would be
    // `not-resumable` — attempt 2's baseline already contains attempt 1's file,
    // so a second worker that wrote nothing has nothing to continue, and the
    // state check correctly answers before the cap ever applies.
    fs.appendFileSync(path.join(p.root, "src", "routes", "health.js"), "// and a little more\n");

    // …so now it is the cap that answers.
    const r = run(p, ["extra", "resume-slice", "T-2", "--out", out2, "--json"]);
    assert.equal(r.status, 1);
    const v = json(r);
    assert.equal(v.reason, "resume-cap");
    assert.equal(v.slice_path, null);
    assert.ok(!fs.existsSync(out2), "a capped resume writes nothing, and never a silent third loop");
    assert.match(v.error, /extra_resume_max` is 1/);
    assert.match(v.blocked_by, /a human decides/);
    assert.equal(v.resume_target.capped, true);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── the refusals ───────────────────────────────────────────────────────────
test("every refusal is NAMED and writes nothing", async () => {
  // not-resumable — the worktree never moved.
  const a = project();
  const fa = await armed(a, "chat-nowr");
  try {
    dispatch(a);
    const v = json(run(a, ["extra", "resume-slice", "T-2", "--out", outPath(a), "--json"]));
    assert.equal(v.reason, "not-resumable");
    assert.equal(v.state, "nothing-to-resume");
    assert.match(v.blocked_by, /re-dispatching the ORIGINAL slice is the correct move/);
    assert.ok(!fs.existsSync(outPath(a)));
  } finally {
    fa.stop();
    rmrf(a.root);
  }

  // in-flight — a live pid inside its lease.
  const b = project();
  const fb = await armed(b, "chat-drop");
  try {
    dispatch(b);
    const hp = path.join(b.root, ".claude", "orc", "extra-journal", "T-2", "attempt-01.json");
    const h = JSON.parse(fs.readFileSync(hp, "utf8"));
    h.pid = process.pid;
    h.lease_expires_at = new Date(Date.now() + 600000).toISOString();
    fs.writeFileSync(hp, JSON.stringify(h));
    const v = json(run(b, ["extra", "resume-slice", "T-2", "--out", outPath(b), "--json"]));
    assert.equal(v.reason, "in-flight");
    assert.match(v.error, /worse than a lost dispatch/);
    assert.ok(!fs.existsSync(outPath(b)));
  } finally {
    fb.stop();
    rmrf(b.root);
  }

  // reverted-file — the §6 revert signature.
  const c = project();
  assert.ok(gitRepo(c.root));
  const fc = await armed(c, "chat");
  try {
    fs.writeFileSync(path.join(c.root, "src", "app.js"), "// app\nconst x = 1;\nconst y = 2;\n");
    dispatch(c, { declared_files: ["src/app.js"] });
    spawnSync("git", ["checkout", "--", "src/app.js"], { cwd: c.root });
    const v = json(run(c, ["extra", "resume-slice", "T-2", "--out", outPath(c), "--json"]));
    assert.equal(v.reason, "reverted-file");
    assert.deepEqual(v.reverted, ["src/app.js"]);
    assert.match(v.error, /CLOSER TO HEAD/);
    assert.ok(!fs.existsSync(outPath(c)));
  } finally {
    fc.stop();
    rmrf(c.root);
  }

  // slice-drifted — the plan moved between attempts.
  const d = project();
  const fd = await armed(d, "chat-drop");
  try {
    dispatch(d);
    slice(d, { prompt: "Add a health route AND a metrics route." });
    const v = json(run(d, ["extra", "resume-slice", "T-2", "--out", outPath(d), "--json"]));
    assert.equal(v.reason, "slice-drifted");
    assert.ok(v.slice_sha256_then !== v.slice_sha256_now);
    assert.match(v.blocked_by, /work nobody asked for/);
    assert.ok(!fs.existsSync(outPath(d)));
  } finally {
    fd.stop();
    rmrf(d.root);
  }

  // resume-disabled — the switch, and it is its own word.
  const e = project();
  const fe = await armed(e, "chat-drop", "extra_resume: off\n");
  try {
    dispatch(e);
    const v = json(run(e, ["extra", "resume-slice", "T-2", "--out", outPath(e), "--json"]));
    assert.equal(v.reason, "resume-disabled");
    assert.match(v.blocked_by, /orc config set extra_resume on/);
    assert.ok(!fs.existsSync(outPath(e)));
    // 0.53.4 BEHAVIOUR: reconcile still reports the position honestly, and the
    // target names the key rather than pretending there is nothing there.
    const rec = json(run(e, ["extra", "reconcile", "T-2", "--json"]));
    assert.equal(rec.state, "resumable");
    assert.equal(rec.resume_target.kind, "off");
    assert.match(rec.resume_target.why, /re-dispatches the ORIGINAL slice/);
    assert.equal(rec.next, null);
  } finally {
    fe.stop();
    rmrf(e.root);
  }

  // no-journal — exit 2, distinct from a refusal.
  const g = project();
  const r = run(g, ["extra", "resume-slice", "NOPE", "--out", outPath(g), "--json"]);
  assert.equal(r.status, 2);
  assert.equal(json(r).reason, "no-journal");
  rmrf(g.root);
});

// ── spend recovery ─────────────────────────────────────────────────────────
test("a killed dispatch's spend is recovered ONCE, as a FLOOR, and says so", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    // What a killed parent leaves: a header, a progress log, and no result —
    // and no spend record, because appendExtraSpend runs after the engine
    // returns.
    const dir = path.join(p.root, ".claude", "orc", "extra-journal", "T-2");
    fs.rmSync(path.join(dir, "attempt-01.result.json"));
    const h = JSON.parse(fs.readFileSync(path.join(dir, "attempt-01.json"), "utf8"));
    h.pid = 0;
    h.lease_expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(path.join(dir, "attempt-01.json"), JSON.stringify(h));
    const spendPath = path.join(p.root, ".claude", "orc", "extra-spend.jsonl");
    fs.writeFileSync(spendPath, "");

    const v = json(run(p, ["extra", "reconcile", "T-2", "--json"]));
    assert.equal(v.orphan, true);
    assert.equal(v.spend_recovered.already, false);
    const rows = fs
      .readFileSync(spendPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    assert.equal(rows.length, 1);
    // MEASURED IS NOT UNKNOWN; UNKNOWN IS NOT ZERO. A recovered vector is a
    // floor, and `complete: false` is what stops a renderer summing it into a
    // total that reads as measured.
    assert.equal(rows[0].recovered, true);
    assert.equal(rows[0].complete, false);
    assert.equal(rows[0].outcome, "orphaned");
    assert.equal(rows[0].reason, "never-reported-back");
    assert.ok(rows[0].usage.input > 0);

    // IDEMPOTENT. Reconcile is a read somebody will run repeatedly.
    const again = json(run(p, ["extra", "reconcile", "T-2", "--json"]));
    assert.equal(again.spend_recovered.already, true);
    assert.equal(
      fs.readFileSync(spendPath, "utf8").split(/\r?\n/).filter((l) => l.trim()).length,
      1,
      "a second reconcile must not double-count a dispatch"
    );
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── preflight, stats, doctor ───────────────────────────────────────────────
function orphanise(p, task) {
  const dir = path.join(p.root, ".claude", "orc", "extra-journal", task);
  fs.rmSync(path.join(dir, "attempt-01.result.json"), { force: true });
  const h = JSON.parse(fs.readFileSync(path.join(dir, "attempt-01.json"), "utf8"));
  h.pid = 0;
  h.lease_expires_at = new Date(Date.now() - 1000).toISOString();
  fs.writeFileSync(path.join(dir, "attempt-01.json"), JSON.stringify(h));
}

test("preflight REPORTS an orphan and never acts on it — and the exit code is unchanged", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    orphanise(p, "T-2");
    const before = fs.readFileSync(path.join(p.root, "src", "routes", "health.js"), "utf8");

    const r = run(p, ["extra", "preflight", "--json"]);
    assert.equal(r.status, 0, "an orphan is a FINDING, not a stop");
    const v = json(r);
    assert.equal(v.ok, true);
    assert.equal(v.orphans.length, 1);
    assert.equal(v.orphans[0].task_id, "T-2");
    assert.equal(v.orphans[0].files_changed, 1);
    assert.equal(v.orphans[0].state, "resumable");
    assert.equal(v.orphans[0].next, "orc extra reconcile T-2");
    assert.match(v.orphan_note, /never resumed/);
    // Pre-composed by the CLI, emitted by the LANE — the `EXTRA fallback`
    // ownership rule, for the same reason.
    assert.deepEqual(v.trace_extras, [v.orphans[0].trace_line]);
    assert.match(v.orphans[0].trace_line, /^EXTRA orphan task=T-2 :: attempt=1 lease-expired files_changed=1 state=resumable$/);

    // IT REPORTS. It never resumes.
    assert.equal(fs.readFileSync(path.join(p.root, "src", "routes", "health.js"), "utf8"), before);
    assert.ok(!fs.existsSync(outPath(p)));

    // The human path says the same thing.
    const human = run(p, ["extra", "preflight"]);
    assert.ok(human.stdout.includes("never reported back"));
    assert.ok(human.stdout.includes("orc extra reconcile T-2"));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("reliability is MEASURED, and below the sample floor there is no rate at all", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    const v = json(run(p, ["extra", "stats", "--json"]));
    const rel = v.reliability;
    assert.equal(rel.sample_floor, 10);
    const g = rel.profiles.find((x) => x.profile === "ds");
    assert.ok(g, JSON.stringify(rel));
    assert.equal(g.sample_too_small, true);
    // NO PERCENTAGE. A rate computed from one dispatch is noise with a percent
    // sign on it.
    assert.equal(g.failure_rate, null);
    assert.equal(g.failed, 1);
    assert.equal(g.resumed, 0);
    // ALWAYS PRINTED, INCLUDING WHEN ZERO.
    assert.equal(typeof g.unattributed, "number");
    assert.deepEqual(Object.keys(g.attribution).sort(), ["local", "network", "orc", "provider", "worker"]);
    assert.equal(g.attribution.provider, 1);
    // The two ABSENT counts are named rather than absorbed.
    assert.equal(rel.unreadable_journals, 0);
    assert.equal(rel.journals_without_result, 0);

    // A resume is COUNTED as one.
    assert.equal(resumeSlice(p, ["--json"]).status, 0);
    run(p, ["extra", "dispatch", "--task", outPath(p), "--json"], { K: SECRET_KEY });
    const after = json(run(p, ["extra", "stats", "--json"])).reliability.profiles.find((x) => x.profile === "ds");
    assert.equal(after.resumed, 1);

    const human = run(p, ["extra", "stats"]);
    assert.ok(human.stdout.includes("sample too small"));
    assert.ok(human.stdout.includes("unattributed"));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("`orc extra doctor` reports an orphan, and never a failure rate below the floor", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    orphanise(p, "T-2");
    const r = run(p, ["extra", "doctor", "--json"]);
    assert.equal(r.status, 1);
    const ids = json(r).findings.map((x) => x.id);
    assert.ok(ids.includes("extra-orphan-dispatch"));
    // ONE dispatch is not a failure rate. A doctor that warns about noise is a
    // doctor people learn to ignore.
    assert.ok(!ids.includes("extra-profile-unreliable"));
    const finding = json(r).findings.find((x) => x.id === "extra-orphan-dispatch");
    assert.equal(finding.task_id, "T-2");
    assert.match(finding.message, /never reported back/);
    assert.match(finding.message, /orc extra reconcile T-2/);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("`extra-profile-unreliable` fires only ABOVE the floor, and carries the attribution split", async () => {
  const p = project();
  const f = await armed(p, "chat");
  try {
    // Twelve recorded dispatches, five of them failed. Written straight into the
    // spend log, which is where the counts come from.
    const spendPath = path.join(p.root, ".claude", "orc", "extra-spend.jsonl");
    fs.mkdirSync(path.dirname(spendPath), { recursive: true });
    const rows = [];
    for (let i = 0; i < 12; i++)
      rows.push(
        JSON.stringify({
          v: 1,
          ts: new Date().toISOString(),
          date: "2026-08-01",
          profile: "ds",
          provider: "custom",
          model: "fake-flash",
          engine: "api",
          task: "T" + i,
          band: "[0,30)",
          usage: { input: 10, cache_write: 0, cache_read: 0, output: 5 },
          outcome: i < 5 ? "failed" : "done",
          duration_ms: 4000,
          dur: "0m04s",
          reason: i < 5 ? "server_error" : null,
        })
      );
    fs.writeFileSync(spendPath, rows.join("\n") + "\n");

    const r = run(p, ["extra", "doctor", "--json"]);
    const finding = json(r).findings.find((x) => x.id === "extra-profile-unreliable");
    assert.ok(finding, "12 dispatches at 5 failures is above both the floor and the rate");
    assert.equal(finding.dispatches, 12);
    assert.equal(finding.failed, 5);
    assert.ok(finding.failure_rate > 0.3);
    assert.match(finding.message, /Attribution:/);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── the registered sets ────────────────────────────────────────────────────
test("the refusal list and the target set are closed, and the CLI is their only author", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "cli.js"), "utf8");
  assert.match(
    src,
    /const EXTRA_RESUME_REFUSALS = \[\s*"not-resumable",\s*"in-flight",\s*"reverted-file",\s*"slice-drifted",\s*"resume-cap",\s*"resume-disabled",\s*\];/
  );
  assert.match(src, /const EXTRA_RESUME_TARGETS = \["extra", "claude", "hold", "off"\];/);
  // Every refusal name the code can emit is in the registered list.
  const emitted = [...src.matchAll(/refuse\(\s*"([a-z-]+)"/g)].map((m) => m[1]);
  for (const e of emitted)
    assert.ok(
      e === "no-journal" || /"not-resumable"|"in-flight"|"reverted-file"|"slice-drifted"|"resume-cap"|"resume-disabled"/.test(`"${e}"`),
      "unregistered refusal reason: " + e
    );
});
