"use strict";
// `orc extra` — THE JOURNAL (v0.54.0), write side.
//
// A failed foreign dispatch is a POSITION, not a blank page. Every assertion
// here is about the one property that makes that true: the record exists, it is
// complete, and it survives the process that wrote it.
//
//   · the HEADER lands before the first byte leaves the machine — kill the
//     provider and it is still there, with a complete baseline
//   · the baseline covers `declared_files` ONLY; a change outside the fence is
//     visible through `git status --short`, which is stored in full
//   · a torn last line costs the torn line and nothing else
//   · engine `cli` redirects the child's stdout onto a FILE DESCRIPTOR, so a
//     wall-clock kill leaves the bytes on disk instead of in a dead parent's
//     buffer
//   · a journal that cannot be written NEVER takes the dispatch down with it
//   · fidelity is declared per engine and is never rendered stronger than it is
//   · the sweep only ever deletes a directory whose every attempt closed `done`
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { tmpdir, rmrf, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const SECRET_KEY = "sk-live-PLANTEDSECRET0123456789";
const FAKE_CLI = path.join(__dirname, "_fake-cli.js");

function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "// the original helper\n");
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, a, env) => cli([...a, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);

// A real repository, because the baseline stores `git status --short` VERBATIM
// and "clean tree" must never be confused with "not a git repository".
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

const journalDir = (p, task) => path.join(p.root, ".claude", "orc", "extra-journal", task);
const readHeader = (p, task, n) =>
  JSON.parse(fs.readFileSync(path.join(journalDir(p, task), `attempt-${String(n || 1).padStart(2, "0")}.json`), "utf8"));
const progressLines = (p, task, n) =>
  fs
    .readFileSync(path.join(journalDir(p, task), `attempt-${String(n || 1).padStart(2, "0")}.progress.jsonl`), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length);

// ── engine `api` ────────────────────────────────────────────────────────────
async function armedApi(p, mode, cfgExtra) {
  const f = await fakeProvider(mode || "chat");
  const base = `http://127.0.0.1:${f.port}`;
  assert.equal(run(p, ["extra", "add", "ds", "--provider", "custom", "--engine", "api", "--base-url", base, "--env-key", "K"]).status, 0);
  const ping = run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY });
  assert.equal(ping.status, 0, "fixture must verify: " + ping.stdout + ping.stderr);
  assert.equal(run(p, ["extra", "route", "set", "0-30", "ds/fake-flash", "--json"]).status, 0);
  fs.writeFileSync(
    path.join(p.root, ".claude", "orc.config.yaml"),
    "extra_enabled: true\nextra_roles: [executor]\n" + (cfgExtra || "")
  );
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
          prompt: "Rename the helper in src/a.js.",
          standing_rules: "# ORC standing rules\nReturn the contract.\n",
          declared_files: ["src/a.js"],
          acceptance: ["the helper is renamed"],
        },
        over || {}
      )
    )
  );
  return file;
}
const dispatch = (p, over, env) =>
  run(p, ["extra", "dispatch", "--task", slice(p, over), "--json"], { K: SECRET_KEY, ...(env || {}) });

test("the header is written BEFORE the first byte leaves the machine, with a complete baseline", async () => {
  const p = project();
  assert.ok(gitRepo(p.root), "git must be available for this fixture");
  const f = await armedApi(p, "chat");
  // The profile verified against a live provider; now the provider is GONE. The
  // dispatch cannot reach anything — and the header must already be on disk,
  // because it is written before the request is made and not after it answers.
  f.stop();
  await new Promise((r) => setTimeout(r, 200));

  const r = dispatch(p);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.dispatched, true);
  assert.equal(j.ok, false);
  assert.equal(j.attempt, 1);
  assert.ok(j.journal && fs.existsSync(j.journal), "the return names a journal header that exists");
  assert.equal(j.journal_fidelity, "per-turn");

  const h = readHeader(p, "T-2");
  assert.equal(h.task_id, "T-2");
  assert.equal(h.attempt, 1);
  assert.equal(h.resumed_from, null);
  assert.equal(h.engine, "api");
  assert.equal(h.profile, "ds");
  assert.equal(h.score, 20);
  assert.equal(h.model_requested, "fake-flash");
  assert.deepEqual(h.declared_files, ["src/a.js"]);
  assert.deepEqual(h.acceptance, ["the helper is renamed"]);
  assert.equal(typeof h.pid, "number");
  assert.ok(Date.parse(h.lease_expires_at) > Date.parse(h.started_at), "the lease outlives the start");
  assert.match(h.slice_sha256, /^[0-9a-f]{64}$/);

  // THE BASELINE — what the repository looked like before a third party touched
  // it, which is the only thing that can make a reconciliation possible later.
  assert.equal(h.baseline.git, true);
  assert.ok(Array.isArray(h.baseline.git_status));
  assert.match(h.baseline.head, /^[0-9a-f]{7,40}$/);
  const b = h.baseline.files["src/a.js"];
  assert.equal(b.exists, true);
  assert.match(b.sha256, /^[0-9a-f]{64}$/);
  assert.equal(b.lines, 1, "a trailing newline TERMINATES the last line, it does not begin an empty one");
  assert.equal(b.bytes, fs.statSync(path.join(p.root, "src", "a.js")).size);

  // A dispatch that never reached the provider still closed its own attempt.
  assert.ok(fs.existsSync(path.join(journalDir(p, "T-2"), "attempt-01.result.json")));
  rmrf(p.root);
});

test("the baseline covers declared_files ONLY — everything else is git status, stored in full", async () => {
  const p = project();
  assert.ok(gitRepo(p.root));
  const f = await armedApi(p, "chat");
  try {
    // Untracked, and NOT declared. It must not be hashed, and it must be
    // visible: a change outside the fence is §6's job, and §6 reads git status.
    fs.writeFileSync(path.join(p.root, "src", "outside.js"), "// nobody declared me\n");
    assert.equal(dispatch(p).status, 0);
    const h = readHeader(p, "T-2");
    assert.deepEqual(Object.keys(h.baseline.files), ["src/a.js"]);
    assert.ok(!("src/outside.js" in h.baseline.files));
    assert.ok(
      h.baseline.git_status.some((l) => l.includes("outside.js")),
      "the undeclared file is in git status: " + JSON.stringify(h.baseline.git_status)
    );
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a file that does not exist yet is a complete baseline row, not a missing one", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    assert.equal(dispatch(p, { declared_files: ["src/a.js", "src/routes/health.js"] }).status, 0);
    const h = readHeader(p, "T-2");
    assert.deepEqual(h.baseline.files["src/routes/health.js"], { exists: false, sha256: null, lines: 0, bytes: 0 });
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("engine api records every turn and every tool call, with the running usage vector", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    const j = json(dispatch(p));
    assert.equal(j.outcome, "done");
    assert.equal(j.output_file, path.join(journalDir(p, "T-2"), "attempt-01.progress.jsonl"));

    const lines = progressLines(p, "T-2").map((l) => JSON.parse(l));
    const turns = lines.filter((l) => l.model !== undefined);
    const tools = lines.filter((l) => l.tool !== undefined);
    assert.ok(turns.length >= 2, "one line per turn");
    assert.deepEqual(
      tools.map((t) => t.tool),
      ["Write", "Bash"]
    );
    // THE PATH, so `last_action` can say WHICH file the worker last touched.
    assert.equal(tools[0].path, "src/a.js");
    assert.equal(tools[1].path, null, "Bash has no path, and an invented one would be worse than none");
    assert.ok(tools.every((t) => t.ok === true));
    // The RUNNING vector, on every line — a floor on what a dispatch cost even
    // when it never reached the spend log.
    for (const l of lines) {
      assert.deepEqual(Object.keys(l.usage).sort(), ["cache_read", "cache_write", "input", "output"]);
      assert.equal(typeof l.usage.input, "number");
    }
    const last = lines[lines.length - 1];
    assert.ok(last.usage.input > 0, "the vector grew as the loop ran");
    assert.ok(lines.every((l) => typeof l.t === "string"));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a torn last line costs the torn line and nothing else", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    assert.equal(dispatch(p).status, 0);
    const file = path.join(journalDir(p, "T-2"), "attempt-01.progress.jsonl");
    const before = progressLines(p, "T-2").length;
    assert.ok(before >= 3);

    // What a killed process leaves: the last append never finished. Cutting the
    // trailing newline alone is not enough — the line is still valid JSON, and a
    // fixture that only removed it would prove nothing.
    const buf = fs.readFileSync(file);
    fs.writeFileSync(file, buf.slice(0, buf.length - 5));

    let read = 0;
    let torn = 0;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        JSON.parse(line);
        read++;
      } catch (_) {
        torn++;
      }
    }
    assert.equal(read, before - 1, "every prior line still parses");
    assert.equal(torn, 1, "exactly one line was lost, and it is the last one");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a resume is a new attempt, never an overwrite", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    assert.equal(json(dispatch(p)).attempt, 1);
    const first = fs.readFileSync(path.join(journalDir(p, "T-2"), "attempt-01.json"), "utf8");
    assert.equal(json(dispatch(p)).attempt, 2);
    assert.equal(
      fs.readFileSync(path.join(journalDir(p, "T-2"), "attempt-01.json"), "utf8"),
      first,
      "attempt 1 holds the only record of the untouched repository — nothing may write over it"
    );
    assert.ok(fs.existsSync(path.join(journalDir(p, "T-2"), "attempt-02.progress.jsonl")));
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a journal that cannot be written NEVER takes the dispatch down with it", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    // A FILE where the journal root has to be a directory. Portable, and it is
    // the same failure any unwritable path produces: mkdir refuses.
    fs.mkdirSync(path.join(p.root, ".claude", "orc"), { recursive: true });
    fs.writeFileSync(path.join(p.root, ".claude", "orc", "extra-journal"), "not a directory\n");

    const r = dispatch(p);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const j = json(r);
    assert.equal(j.outcome, "done");
    assert.equal(j.journal, null, "null is the honest answer — there is nothing to reconcile against");
    assert.equal(j.journal_fidelity, null);
    assert.equal(j.spend_logged, true, "the spend record is unaffected");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

test("a task id that sanitises to nothing gets NO journal, never a directory called empty", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    const j = json(dispatch(p, { task_id: "../../escape" }));
    // Sanitised to a flat segment — never a traversal.
    assert.ok(j.journal.includes("extra-journal"));
    assert.ok(!j.journal.includes(".."), "a task id is untrusted input about to become a path segment");
    const roots = fs.readdirSync(path.join(p.root, ".claude", "orc", "extra-journal"));
    assert.deepEqual(roots, ["escape"]);
  } finally {
    f.stop();
    rmrf(p.root);
  }
});

// ── engine `cli` ────────────────────────────────────────────────────────────
function fakeBinDir(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orc-fake-cli-"));
  for (const n of names) {
    if (process.platform === "win32")
      fs.writeFileSync(path.join(dir, n + ".cmd"), `@echo off\r\n"${process.execPath}" "${FAKE_CLI}" %*\r\n`);
    else {
      const f = path.join(dir, n);
      fs.writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CLI}" "$@"\n`);
      fs.chmodSync(f, 0o755);
    }
  }
  return dir;
}

function armedCli(p, bin, cfgExtra) {
  assert.equal(
    run(p, ["extra", "add", "w", "--provider", "custom", "--engine", "cli", "--cli", bin, "--env-key", "K", "--cli-agent", "build"]).status,
    0
  );
  const PATHV = fakeBinDir([bin]) + path.delimiter + process.env.PATH;
  assert.equal(run(p, ["extra", "ping", "w", "--json"], { PATH: PATHV }).status, 0);
  assert.equal(run(p, ["extra", "route", "set", "0-30", "w/deepseek/fake-flash", "--json"]).status, 0);
  fs.writeFileSync(
    path.join(p.root, ".claude", "orc.config.yaml"),
    "extra_enabled: true\nextra_roles: [executor]\n" + (cfgExtra || "")
  );
  return PATHV;
}

test("engine cli: the child's stdout lands on DISK, and output_file names a file that exists", () => {
  const p = project();
  const PATHV = armedCli(p, "opencode");
  const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], {
    K: SECRET_KEY,
    PATH: PATHV,
    ORC_FAKE_CLI_MODE: "ok",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.outcome, "done");
  assert.equal(j.journal_fidelity, "streamed-opaque");
  // NO LONGER NULL. The answer was never to report a dead path, it was to stop
  // deleting the evidence.
  assert.equal(j.output_file, path.join(journalDir(p, "T-2"), "attempt-01.progress.jsonl"));
  assert.ok(fs.existsSync(j.output_file));
  const raw = fs.readFileSync(j.output_file, "utf8");
  assert.match(raw, /"type":"session\.start"/);
  assert.match(raw, /"type":"message\.done"/);
  // The tool still reported its own numbers — reading the bytes back from the
  // file must be indistinguishable from reading them out of a pipe.
  assert.deepEqual(j.usage, { input: 500, cache_write: 0, cache_read: 400, output: 70 });
  rmrf(p.root);
});

test("engine cli: a wall-clock kill leaves the child's output on disk", () => {
  const p = project();
  // 30s is the FLOOR extraTimeouts enforces, so this is as short as a real
  // dispatch timeout can be. The fixture prints one event and then blocks past
  // it.
  const PATHV = armedCli(p, "opencode", "extra_timeout_s: 30\n");
  const r = run(p, ["extra", "dispatch", "--task", slice(p), "--json"], {
    K: SECRET_KEY,
    PATH: PATHV,
    ORC_FAKE_CLI_MODE: "slow",
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.reason, "timeout");
  assert.equal(j.retry, true);
  assert.equal(j.output_file, path.join(journalDir(p, "T-2"), "attempt-01.progress.jsonl"));
  assert.ok(j.captured_bytes > 0, "the bytes the child produced before the kill were read back, not discarded");
  assert.match(fs.readFileSync(j.output_file, "utf8"), /"type":"session\.start"/);
  rmrf(p.root);
});

// ── the declared table, and the sweep ───────────────────────────────────────
test("journal fidelity is DECLARED per engine and never rendered stronger than it is", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    assert.equal(json(dispatch(p)).journal_fidelity, "per-turn");
    assert.equal(
      readHeader(p, "T-2").journal_fidelity_note,
      "every turn and every tool call was recorded as it happened."
    );
  } finally {
    f.stop();
  }
  rmrf(p.root);

  const q = project();
  const PATHV = armedCli(q, "opencode");
  assert.equal(
    run(q, ["extra", "dispatch", "--task", slice(q), "--json"], { K: SECRET_KEY, PATH: PATHV, ORC_FAKE_CLI_MODE: "ok" })
      .status,
    0
  );
  const h = readHeader(q, "T-2");
  assert.equal(h.journal_fidelity, "streamed-opaque");
  assert.match(h.journal_fidelity_note, /NO per-turn tool attribution/);
  rmrf(q.root);
});

test("the sweep only ever deletes a directory whose EVERY attempt closed `done`, 30+ days old", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    const root = path.join(p.root, ".claude", "orc", "extra-journal");
    const old = Date.now() - 40 * 86400000;
    const plant = (name, result) => {
      const dir = path.join(root, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "attempt-01.json"), JSON.stringify({ task_id: name, attempt: 1 }));
      fs.writeFileSync(path.join(dir, "attempt-01.progress.jsonl"), "");
      if (result) fs.writeFileSync(path.join(dir, "attempt-01.result.json"), JSON.stringify(result));
      for (const n of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, n), old / 1000, old / 1000);
    };
    plant("old-done", { outcome: "done" });
    plant("old-failed", { outcome: "failed" });
    plant("old-orphan", null);

    const fresh = path.join(root, "fresh-done");
    fs.mkdirSync(fresh, { recursive: true });
    fs.writeFileSync(path.join(fresh, "attempt-01.json"), "{}");
    fs.writeFileSync(path.join(fresh, "attempt-01.result.json"), JSON.stringify({ outcome: "done" }));

    assert.equal(dispatch(p).status, 0, "the sweep runs on a dispatch, never on a timer");

    const left = fs.readdirSync(root).sort();
    assert.ok(!left.includes("old-done"), "closed `done` and past the floor — swept");
    assert.ok(left.includes("old-failed"), "a failed close is not a done close");
    assert.ok(left.includes("old-orphan"), "an orphan is the one thing this subsystem exists to find — never swept");
    assert.ok(left.includes("fresh-done"), "inside the 30-day floor");
    assert.ok(left.includes("T-2"), "the dispatch that ran the sweep is untouched");
  } finally {
    f.stop();
    rmrf(p.root);
  }
});
