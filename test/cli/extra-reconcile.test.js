"use strict";
// `orc extra reconcile` — THE POSITION, and whose fault it was (v0.54.0).
//
// Zero tokens, deterministic, and the free check runs before the paid one. Every
// assertion here is about a rule that decides a RECOVERY:
//
//   · five states, five exit codes, and 0 is the answer the command exists to
//     give — not "healthy" (the `orc pattern status` convention)
//   · `resumable` means the worktree moved off the baseline. `nothing-to-resume`
//     means it did not, and re-dispatching the original slice is then correct
//   · a LIVE attempt is a HARD REFUSAL, never a warning: two writers on one file
//     is worse than a lost dispatch
//   · a `reverted` declared file BLOCKS, naming the paths
//   · attribution is decided by the network probe, because "your wifi is down"
//     and "the provider is down" produce the same socket error and want
//     OPPOSITE recoveries
//   · `--json` carries every field the human path prints (v0.49.1)
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

async function armed(p, mode) {
  const f = await fakeProvider(mode || "chat");
  const base = `http://127.0.0.1:${f.port}`;
  assert.equal(run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K"]).status, 0);
  assert.equal(run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY }).status, 0);
  assert.equal(run(p, ["extra", "route", "set", "0-30", "ds/fake-flash", "--json"]).status, 0);
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: true\nextra_roles: [executor]\n");
  return f;
}

function slice(p, over) {
  const file = path.join(p.root, "slice.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      Object.assign(
        {
          task_id: "T-2",
          score: 20,
          role: "executor",
          prompt: "Add a health route.",
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
const reconcile = (p, task, extra) => run(p, ["extra", "reconcile", task || "T-2", ...(extra || [])]);

// ── THE USER'S OWN SCENARIO ────────────────────────────────────────────────
test("the socket dies after one Write: `resumable`, with the exact per-file position", async () => {
  const p = project();
  assert.ok(gitRepo(p.root));
  const f = await armed(p, "chat-drop");
  try {
    const d = json(dispatch(p));
    assert.equal(d.ok, false, "the dispatch failed: " + JSON.stringify(d.reason));
    // The connection OPENED, served a tool call, and then died. That is not
    // `unreachable`, which means it never opened — and the two want opposite
    // recoveries.
    assert.ok(
      d.reason === "stream-interrupted" || d.reason === "connection-lost-local",
      "expected an established-then-died classification, got " + d.reason
    );
    // The half-written file is really on disk. That is the whole problem.
    const wrote = fs.readFileSync(path.join(p.root, "src", "routes", "health.js"), "utf8");
    assert.match(wrote, /router\.get/);
    assert.ok(!/module\.exports/.test(wrote), "the worker never got to the last line");

    const r = reconcile(p, "T-2", ["--json"]);
    assert.equal(r.status, 0, "resumable is exit 0 — the answer the command exists to give");
    const v = json(r);
    assert.equal(v.state, "resumable");
    assert.equal(v.task_id, "T-2");
    assert.equal(v.attempt, 1);
    assert.equal(v.attempts_total, 1);
    assert.equal(v.reported_back, true);
    assert.equal(v.orphan, false);
    assert.equal(v.blocked_by, null);

    const health = v.files.find((x) => x.path === "src/routes/health.js");
    assert.equal(health.state, "created");
    assert.equal(health.baseline.exists, false);
    assert.equal(health.now.exists, true);
    assert.equal(health.numstat.added, 7);
    assert.equal(health.numstat.removed, 0);

    const app = v.files.find((x) => x.path === "src/app.js");
    assert.equal(app.state, "untouched", "the strongest signal there is");
    assert.deepEqual({ a: app.numstat.added, r: app.numstat.removed }, { a: 0, r: 0 });

    // LAST ACTION — what makes a resume preamble mean anything.
    assert.match(v.last_action, /Write src\/routes\/health\.js/);
    assert.match(v.last_action, /· ok$/);
    assert.equal(v.turns_used >= 1, true);

    // THE FLOOR, and it says so.
    assert.ok(v.partial_usage && v.partial_usage.input > 0);
    assert.match(v.partial_usage_note, /FLOOR/);

    // CARRIED FORWARD, UNEVALUATED. Whether a criterion is met is not a
    // question this command can answer.
    assert.deepEqual(v.acceptance, ["GET /health returns 200 {status:'ok'}"]);
    assert.match(v.acceptance_note, /unevaluated/);
    assert.deepEqual(v.touched_undeclared, []);
    assert.deepEqual(v.reverted, []);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("attribution: a reachable probe says PROVIDER, an unreachable one says NETWORK and holds", async () => {
  // The provider is UP: it served a turn and then dropped the wire, and the
  // probe reaches it. That is the endpoint, not the network — and a Claude
  // fallback is exactly right.
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    const d = json(dispatch(p));
    assert.equal(d.attribution.verdict, "provider");
    assert.equal(d.attribution.fallback_would_also_fail, false);
    assert.equal(d.network_probe.ran, true);
    assert.equal(d.network_probe.reachable, true);
    assert.ok(d.attribution.evidence.some((e) => /network probe: HTTP/.test(e)));
    assert.equal(json(reconcile(p, "T-2", ["--json"])).attribution.verdict, "provider");
  } finally {
    f.stop();
    rmrf(p.root);
  }
  rmrf(p.root);

  // Now the same shape with NOTHING on the other end: the profile verified while
  // the fixture was up, then the whole host went away.
  const q = project();
  const g = await armed(q, "chat");
  g.stop();
  await new Promise((r) => setTimeout(r, 200));
  const d = json(dispatch(q));
  assert.equal(d.ok, false);
  assert.equal(d.network_probe.ran, true);
  assert.equal(d.network_probe.reachable, false);
  assert.equal(d.attribution.verdict, "network");
  // THE FIELD THAT CHANGES THE RECOVERY.
  assert.equal(d.attribution.fallback_would_also_fail, true);
  // The connection never opened AND the probe failed — that is its own row, and
  // it is the row that must never quietly fall back to Claude.
  assert.equal(d.reason, "connection-lost-local");
  assert.equal(d.reason_original, "unreachable");
  assert.equal(d.retry, true);
  rmrf(q.root);
});

test("attribution: a clean HTTP conversation that under-performed is the WORKER, and no probe is spent", async () => {
  const p = project();
  const f = await armed(p, "chat-nowr");
  try {
    // The worker finished, reported back, and wrote none of its declared files.
    const d = json(dispatch(p));
    assert.equal(d.outcome, "partial");
    assert.equal(d.reason, "empty-diff");
    assert.equal(d.attribution.verdict, "worker");
    assert.equal(d.attribution.fallback_would_also_fail, false);
    // The probe is spent ONLY on the reasons that cannot be told apart without
    // it. Spending one here would be a request that answers nothing.
    assert.equal(d.network_probe, null);

    // And nothing moved, so there is nothing to resume — re-dispatching the
    // ORIGINAL slice is correct here, which is exit 1.
    const r = reconcile(p, "T-2", ["--json"]);
    assert.equal(r.status, 1);
    assert.equal(json(r).state, "nothing-to-resume");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("attribution: a model the endpoint does not serve is the PROVIDER, and `orc` is a verdict ORC will give about itself", async () => {
  const p = project();
  const f = await armed(p, "chat-400");
  try {
    const d = json(dispatch(p));
    assert.equal(d.reason, "model_not_found");
    assert.equal(d.attribution.verdict, "provider");
    assert.ok(d.attribution.evidence.some((e) => /HTTP 400/.test(e)));
  } finally {
    f.stop();
    rmrf(p.root);
  }
  rmrf(p.root);

  // ORC composed a request the endpoint refused → ORC says so about itself. A
  // report with no way to blame its own author is not a report anybody should
  // trust (v0.53.3 was exactly an ORC bug that presented as a bad key).
  const q = project();
  const g = await armed(q, "chat");
  try {
    const d = json(dispatch(q, { allowed_tools: ["Telepathy"] }));
    assert.equal(d.reason, "invalid_request");
    assert.equal(d.attribution.verdict, "orc");
    assert.match(d.attribution.why, /ORC composed the request/);
  } finally {
    g.stop();
    rmrf(q.root);
  }
});

// ── the five states ────────────────────────────────────────────────────────
test("`complete` is exit 3 — resuming would duplicate work that is already done", async () => {
  const p = project();
  const f = await armed(p, "chat");
  try {
    assert.equal(dispatch(p, { declared_files: ["src/a.js"] }).status, 0);
    const r = reconcile(p, "T-2", ["--json"]);
    assert.equal(r.status, 3);
    const v = json(r);
    assert.equal(v.state, "complete");
    assert.equal(v.outcome, "done");
    assert.equal(v.attribution.verdict, null, "there is nothing to attribute about a dispatch that finished");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("`no-journal` is exit 2 — an unknown id and a pre-0.54.0 dispatch are the same answer", () => {
  const p = project();
  const r = reconcile(p, "NOPE", ["--json"]);
  assert.equal(r.status, 2);
  const v = json(r);
  assert.equal(v.ok, false);
  assert.equal(v.state, "no-journal");
  assert.equal(v.attempts_total, 0);
  // An empty result is an ANSWER, so it still returns its object.
  assert.equal(v.task_id, "NOPE");
  assert.match(v.error, /predates the journal/);
  rmrf(p.root);
});

test("`in-flight` is a HARD REFUSAL — two writers on one file is worse than a lost dispatch", async () => {
  const p = project();
  const f = await armed(p, "chat");
  try {
    assert.equal(dispatch(p, { declared_files: ["src/a.js"] }).status, 0);
    // Re-stamp the attempt as a LIVE process inside its lease. This process is
    // certainly alive, which is what makes it a usable stand-in.
    const hp = path.join(p.root, ".claude", "orc", "extra-journal", "T-2", "attempt-01.json");
    const h = JSON.parse(fs.readFileSync(hp, "utf8"));
    h.pid = process.pid;
    h.lease_expires_at = new Date(Date.now() + 600000).toISOString();
    fs.writeFileSync(hp, JSON.stringify(h));

    const r = reconcile(p, "T-2", ["--json"]);
    assert.equal(r.status, 4);
    const v = json(r);
    assert.equal(v.state, "in-flight");
    assert.equal(v.liveness.live, true);
    assert.equal(v.liveness.pid_alive, true);
    assert.equal(v.liveness.lease_expired, false);
    // blocked_by NAMES THE HUMAN DECISION, never a generic "waiting".
    assert.match(v.blocked_by, new RegExp("pid " + process.pid));
    assert.match(v.blocked_by, /A human decides/);

    // Past the lease, the SAME live pid is somebody else's process — an honest
    // bound, and the text says which.
    h.lease_expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(hp, JSON.stringify(h));
    const after = json(reconcile(p, "T-2", ["--json"]));
    assert.equal(after.liveness.live, false);
    assert.equal(after.liveness.pid_alive, true);
    assert.match(after.liveness.note, /Pid reuse is real/);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a dispatch that never reported back is an ORPHAN, and it is named rather than inferred", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    // What a killed process leaves: a header, a progress log, and no result.
    fs.rmSync(path.join(p.root, ".claude", "orc", "extra-journal", "T-2", "attempt-01.result.json"));
    const hp = path.join(p.root, ".claude", "orc", "extra-journal", "T-2", "attempt-01.json");
    const h = JSON.parse(fs.readFileSync(hp, "utf8"));
    h.pid = 0; // no pid to signal
    h.lease_expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(hp, JSON.stringify(h));

    const v = json(reconcile(p, "T-2", ["--json"]));
    assert.equal(v.state, "resumable", "the worktree still moved — the position outlived the process");
    assert.equal(v.reported_back, false);
    assert.equal(v.orphan, true);
    assert.equal(v.outcome, null);
    assert.equal(v.attribution, null, "nothing attributed it, because nothing lived long enough to");
    assert.match(v.last_action, /Write src\/routes\/health\.js/, "the progress log survived the process that wrote it");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── the two things that stop a resume ──────────────────────────────────────
test("a `reverted` declared file BLOCKS and names the path — the §6 revert signature", async () => {
  const p = project();
  assert.ok(gitRepo(p.root));
  const f = await armed(p, "chat");
  try {
    // A file that already differed from HEAD when the dispatch started…
    fs.writeFileSync(path.join(p.root, "src", "app.js"), "// app\nconst x = 1;\nconst y = 2;\n");
    assert.equal(dispatch(p, { declared_files: ["src/app.js"] }).status, 4, "empty-diff — nothing was written");
    // …and came back CLOSER TO HEAD than the baseline was. That is how a
    // destructive git command inside a slice disguises itself.
    spawnSync("git", ["checkout", "--", "src/app.js"], { cwd: p.root });

    const r = reconcile(p, "T-2", ["--json"]);
    assert.equal(r.status, 0, "the worktree moved, so the state is still resumable");
    const v = json(r);
    assert.deepEqual(v.reverted, ["src/app.js"]);
    assert.equal(v.files[0].state, "reverted");
    assert.match(v.blocked_by, /src\/app\.js/);
    assert.match(v.blocked_by, /worse than starting over/);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a write outside the fence is caught here too — a crashed dispatch is when §6 never ran", async () => {
  const p = project();
  assert.ok(gitRepo(p.root));
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    // Something changed that nobody declared. §6 reads git status, and §6 is
    // exactly what a crashed dispatch skips.
    fs.writeFileSync(path.join(p.root, "src", "stray.js"), "// nobody declared me\n");
    const v = json(reconcile(p, "T-2", ["--json"]));
    assert.equal(v.git, true);
    assert.deepEqual(
      v.touched_undeclared.map((t) => t.path),
      ["src/stray.js"]
    );
    // ORC'S OWN BOOKKEEPING IS NOT THE WORKER'S STRAY WRITE. The journal and the
    // spend log are written BY THIS DISPATCH, between the baseline and this
    // read — so without the exclusion every single dispatch reports itself as a
    // fence breach, and a warning that always fires is a warning nobody reads.
    assert.ok(
      !v.touched_undeclared.some((t) => t.path.startsWith(".claude/")),
      "ORC's own run state must never be reported as a foreign worker's write"
    );
    // The declared file lives in a directory that did not exist at baseline.
    // `git status --short` COLLAPSES that into `?? src/routes/`, which would
    // name the directory as an undeclared change and never name the file.
    assert.ok(!v.touched_undeclared.some((t) => t.path === "src/routes/" || t.path === "src/routes"));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("outside a git repository the gap is REPORTED, never guessed at", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    const v = json(reconcile(p, "T-2", ["--json"]));
    assert.equal(v.git, false);
    assert.match(v.git_note, /cannot be detected/);
    assert.deepEqual(v.touched_undeclared, [], "no repository means no evidence, and no evidence means no claim");
    // The per-file table still works: it is hashes, not git.
    assert.equal(v.files.find((x) => x.path === "src/routes/health.js").state, "created");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a line count that would mix two people's changes is UNKNOWN, and unknown is not zero", async () => {
  const p = project();
  assert.ok(gitRepo(p.root));
  const f = await armed(p, "chat");
  try {
    // The file already differed from HEAD before the dispatch started, so a
    // numstat here would describe this dispatch's change PLUS somebody else's.
    fs.writeFileSync(path.join(p.root, "src", "a.js"), "// edited before the dispatch\n");
    assert.equal(dispatch(p, { declared_files: ["src/a.js"] }).status, 0);
    const v = json(reconcile(p, "T-2", ["--json"]));
    const a = v.files[0];
    assert.equal(a.state, "modified");
    assert.equal(a.numstat.added, null);
    assert.equal(a.numstat.removed, null);
    assert.match(a.numstat.source, /unknown is not zero/);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── the two renderers describe ONE state ───────────────────────────────────
test("--json carries every field the human path prints", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    const human = reconcile(p, "T-2");
    assert.equal(human.status, 0);
    const v = json(reconcile(p, "T-2", ["--json"]));
    // Everything the terminal shows is a field somebody can read back.
    assert.ok(human.stdout.includes("RESUMABLE"));
    assert.ok(human.stdout.includes(v.last_action));
    assert.ok(human.stdout.includes(v.attribution.why));
    assert.ok(human.stdout.includes(v.journal_fidelity));
    assert.ok(human.stdout.includes(v.acceptance[0]));
    assert.ok(human.stdout.includes("src/routes/health.js — created (+7 −0)"));
    assert.ok(human.stdout.includes("src/app.js — untouched"));
    for (const e of v.attribution.evidence) assert.ok(human.stdout.includes(e), "missing evidence line: " + e);
    // And the exit code is the SAME on both paths — the flag changes the
    // rendering, never the semantics.
    assert.equal(reconcile(p, "T-2", ["--json"]).status, human.status);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── orc extra journal ──────────────────────────────────────────────────────
test("`journal list` names the orphans; `prune` names every directory before deleting one", async () => {
  const p = project();
  const f = await armed(p, "chat");
  try {
    assert.equal(dispatch(p, { task_id: "T-done", declared_files: ["src/a.js"] }).status, 0);
    // The second dispatch's OUTCOME is not what is being tested here, and the
    // fixture's turn counter is shared across the whole server process, so it is
    // deliberately not asserted. What matters is that it left a journal — which
    // is then stripped of its result to produce the orphan.
    dispatch(p, { task_id: "T-orphan", declared_files: ["src/a.js"] });
    const od = path.join(p.root, ".claude", "orc", "extra-journal", "T-orphan");
    assert.ok(fs.existsSync(od));
    fs.rmSync(path.join(od, "attempt-01.result.json"));
    const h = JSON.parse(fs.readFileSync(path.join(od, "attempt-01.json"), "utf8"));
    h.pid = 0;
    h.lease_expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(path.join(od, "attempt-01.json"), JSON.stringify(h));

    const list = json(run(p, ["extra", "journal", "list", "--json"]));
    assert.equal(list.entries, 2);
    assert.equal(list.orphans, 1);
    assert.equal(list.in_flight, 0);
    assert.equal(list.retention_days, 30);
    assert.equal(list.journals.find((r) => r.task_id === "T-orphan").orphan, true);
    assert.equal(list.journals.find((r) => r.task_id === "T-done").orphan, false);

    // NOTHING IS A CANDIDATE YET — both are inside the 30-day floor.
    const dry = json(run(p, ["extra", "journal", "prune", "--dry-run", "--json"]));
    assert.equal(dry.dry_run, true);
    assert.deepEqual(dry.candidates, []);
    assert.deepEqual(dry.removed, []);
    assert.ok(dry.kept.length === 2);

    // Age BOTH past the floor. Only the one that closed `done` may go.
    const old = (Date.now() - 40 * 86400000) / 1000;
    for (const t of ["T-done", "T-orphan"]) {
      const dir = path.join(p.root, ".claude", "orc", "extra-journal", t);
      for (const n of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, n), old, old);
    }
    const preview = json(run(p, ["extra", "journal", "prune", "--dry-run", "--json"]));
    assert.deepEqual(
      preview.candidates.map((c) => c.task_id),
      ["T-done"]
    );
    assert.deepEqual(preview.removed, [], "a preview deletes nothing");
    assert.ok(fs.existsSync(path.join(p.root, ".claude", "orc", "extra-journal", "T-done")));
    assert.match(preview.kept.find((k) => k.task_id === "T-orphan").why, /orphan is never swept/);

    const applied = json(run(p, ["extra", "journal", "prune", "--json"]));
    assert.deepEqual(applied.removed, ["T-done"]);
    assert.ok(!fs.existsSync(path.join(p.root, ".claude", "orc", "extra-journal", "T-done")));
    assert.ok(fs.existsSync(path.join(p.root, ".claude", "orc", "extra-journal", "T-orphan")));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("`journal show` keeps the raw log OPT-IN and never renders fidelity stronger than it is", async () => {
  const p = project();
  const f = await armed(p, "chat-drop");
  try {
    dispatch(p);
    const v = json(run(p, ["extra", "journal", "show", "T-2", "--json"]));
    assert.equal(v.task_id, "T-2");
    assert.equal(v.attempt, 1);
    assert.equal(v.reported_back, true);
    assert.equal(v.header.journal_fidelity, "per-turn");
    assert.ok(v.progress.length > 0);
    assert.equal(v.body, null);
    assert.match(v.body_note, /opt-in/);

    const withBody = json(run(p, ["extra", "journal", "show", "T-2", "--body", "--json"]));
    assert.equal(typeof withBody.body, "string");
    assert.ok(withBody.body.includes("health.js"));

    assert.equal(run(p, ["extra", "journal", "show", "NOPE", "--json"]).status, 2);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── the registered sets ────────────────────────────────────────────────────
test("the two new failure classes are RETRYABLE and are distinct from `unreachable`", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "cli.js"), "utf8");
  for (const k of ["stream-interrupted", "connection-lost-local"])
    assert.ok(new RegExp(`"${k}": \\{ retry: true`).test(src), `${k} must be in EXTRA_FAILURES and retryable`);
  // The five-value attribution set is closed, and the reconcile renderer speaks
  // exactly those words.
  assert.match(src, /const EXTRA_ATTRIBUTION = \["provider", "network", "local", "worker", "orc"\];/);
});
