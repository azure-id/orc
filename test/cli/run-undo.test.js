"use strict";
// @test-pool spawn  — shells node bin/cli.js and git in temp repos
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, rmrf, tmpdir } = require("../_helpers");

// ── W6b (08-qol-spec Q2) — `orc run snapshot` + `orc undo` ───────────────────
// The defect: quick printed `git checkout -- .` as the undo, which also throws
// away every UNRELATED edit the user had. The undo may revert ONLY what the run
// changed, and must never destroy a user edit — made before the run, or during
// it to a file the run did not touch. Every test runs in its own temp git repo.

function git(root, ...a) {
  const r = spawnSync("git", a, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
function repo() {
  const root = tmpdir();
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "config", "core.autocrlf", "false");
  for (const f of ["a.txt", "b.txt", "c.txt"]) fs.writeFileSync(path.join(root, f), `${f} base\n`);
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  return root;
}
const rd = (root, f) => fs.readFileSync(path.join(root, f), "utf8");
const wr = (root, f, s) => fs.writeFileSync(path.join(root, f), s);
const J = (r) => JSON.parse(r.stdout);
const runDir = (root, slug) => path.join(root, ".claude", "orc", "run", slug);
function checkpoint(root, slug, files) {
  fs.mkdirSync(runDir(root, slug), { recursive: true });
  fs.writeFileSync(path.join(runDir(root, slug), "checkpoint.json"), JSON.stringify({ tasks: [{ id: "T1", status: "done", actual_files: files }] }));
}
// A file's mtime moved clear of the run's last write, so the test does not
// depend on the clock resolution of the file system it runs on.
const age = (root, f, deltaMs) => {
  const t = new Date(Date.now() + deltaMs);
  fs.utimesSync(path.join(root, f), t, t);
};

test("undo: a user edit made BEFORE the run survives, and so does one made DURING the run to a file the run did not touch", () => {
  const root = repo();
  try {
    // Before the run: a tracked edit and an untracked file of the user's.
    wr(root, "a.txt", "a.txt base\nuser before the run\n");
    wr(root, "notes.txt", "user notes\n");
    const s = cli(["run", "snapshot", "--run", "t1", "--dir", root, "--json"]);
    assert.strictEqual(s.status, 0, s.stderr);
    const snap = J(s);
    assert.strictEqual(snap.ref, "refs/orc/runs/t1/pre");
    assert.strictEqual(snap.clean, false);
    assert.deepStrictEqual(snap.dirty, ["a.txt"]);
    assert.ok(snap.untracked >= 1, "the untracked file is copied into the object store");
    assert.strictEqual(git(root, "stash", "list"), "", "never visible in git stash list");
    // The run: edits a.txt (on top of the user's edit), b.txt, notes.txt, creates new.txt.
    wr(root, "a.txt", rd(root, "a.txt") + "run edit\n");
    wr(root, "b.txt", "b.txt base\nrun edit\n");
    wr(root, "notes.txt", "user notes\nrun edit\n");
    wr(root, "new.txt", "made by the run\n");
    for (const f of ["a.txt", "b.txt", "notes.txt", "new.txt"]) age(root, f, -5000);
    checkpoint(root, "t1", ["a.txt", "b.txt", "notes.txt", "new.txt"]);
    // During the run, the user edits c.txt — a file the run never touched.
    wr(root, "c.txt", "c.txt base\nuser during the run\n");

    // The DEFAULT prints and changes nothing (08 Q2, S6: nothing runs by itself).
    const before = ["a.txt", "b.txt", "c.txt", "notes.txt", "new.txt"].map((f) => rd(root, f));
    const d = cli(["undo", "--run", "t1", "--dir", root, "--json"]);
    assert.strictEqual(d.status, 0, d.stderr);
    const dj = J(d);
    assert.strictEqual(dj.applied, false);
    assert.strictEqual(dj.files_source, "checkpoint.json");
    assert.ok(dj.commands.some((c) => c === "git restore --source=refs/orc/runs/t1/pre --worktree -- a.txt"));
    assert.ok(!dj.commands.some((c) => /checkout -- \./.test(c)), "never `git checkout -- .`");
    assert.deepStrictEqual(["a.txt", "b.txt", "c.txt", "notes.txt", "new.txt"].map((f) => rd(root, f)), before, "the default (print-only) changes no file");
    assert.strictEqual(rd(root, "a.txt"), "a.txt base\nuser before the run\nrun edit\n", "print path: the pre-run user edit is still there");
    assert.ok(fs.existsSync(path.join(root, "new.txt")), "print path: nothing deleted");
    assert.match(cli(["undo", "--run", "t1", "--dir", root]).stdout, /PRINT ONLY, nothing changed \(--apply runs these commands\)/);

    const u = cli(["undo", "--run", "t1", "--dir", root, "--apply", "--json"]);
    assert.strictEqual(J(u).applied, true);
    assert.strictEqual(u.status, 0, u.stderr + u.stdout);
    const uj = J(u);
    assert.deepStrictEqual(uj.restored.sort(), ["a.txt", "b.txt", "notes.txt"]);
    assert.deepStrictEqual(uj.deleted, ["new.txt"]);
    assert.strictEqual(rd(root, "a.txt"), "a.txt base\nuser before the run\n", "the pre-run user edit survives (back to the snapshot, NOT to HEAD)");
    assert.strictEqual(rd(root, "notes.txt"), "user notes\n", "the pre-run untracked file comes back as the user left it");
    assert.strictEqual(rd(root, "b.txt"), "b.txt base\n");
    assert.ok(!fs.existsSync(path.join(root, "new.txt")), "the file the run created is gone");
    assert.strictEqual(rd(root, "c.txt"), "c.txt base\nuser during the run\n", "a file outside the run is never touched");
    assert.ok(!uj.files.some((r) => r.path === "c.txt"));
  } finally {
    rmrf(root);
  }
});

test("undo: a run file the user edited AFTER the run's last write is KEPT and named (exit 4); --files is the record when there is no checkpoint", () => {
  const root = repo();
  try {
    assert.strictEqual(cli(["run", "snapshot", "--run", "t2", "--dir", root]).status, 0);
    wr(root, "a.txt", "run edit\n");
    wr(root, "b.txt", "run edit\n");
    age(root, "a.txt", -5000);
    // The run's own last write: a lane record in its run folder.
    fs.mkdirSync(runDir(root, "t2"), { recursive: true });
    fs.writeFileSync(path.join(runDir(root, "t2"), "quick-checkpoint.md"), "10:00:00 entry 1\n");
    // …then the user edits b.txt, later than that.
    wr(root, "b.txt", "run edit\nthe user's own later edit\n");
    age(root, "b.txt", 60000);
    const none = cli(["undo", "--run", "t2", "--dir", root, "--json"]);
    assert.strictEqual(none.status, 3, "no checkpoint, no --files → no record, nothing guessed from git status");
    assert.strictEqual(J(none).reason, "no-record");
    const p = cli(["undo", "--run", "t2", "--dir", root, "--files", "a.txt,b.txt", "--json"]);
    assert.strictEqual(p.status, 4, "the print path computes the same answer");
    assert.strictEqual(J(p).applied, false);
    assert.deepStrictEqual([rd(root, "a.txt"), rd(root, "b.txt")], ["run edit\n", "run edit\nthe user's own later edit\n"], "the default changes no file");
    const u = cli(["undo", "--run", "t2", "--dir", root, "--files", "a.txt,b.txt", "--apply", "--json"]);
    assert.strictEqual(u.status, 4, u.stdout);
    const uj = J(u);
    assert.strictEqual(uj.files_source, "--files");
    assert.deepStrictEqual(uj.restored, ["a.txt"]);
    assert.strictEqual(uj.skipped.length, 1);
    assert.strictEqual(uj.skipped[0].path, "b.txt");
    assert.match(uj.skipped[0].hint, /git restore --source=refs\/orc\/runs\/t2\/pre -- b\.txt/);
    assert.strictEqual(rd(root, "a.txt"), "a.txt base\n");
    assert.strictEqual(rd(root, "b.txt"), "run edit\nthe user's own later edit\n", "never destroy a user edit");
  } finally {
    rmrf(root);
  }
});

test("snapshot: a second snapshot of the same run keeps the FIRST; no snapshot → undo exits 2; not a git repo → snapshot exits 2", () => {
  const root = repo();
  const plain = tmpdir();
  try {
    const first = J(cli(["run", "snapshot", "--run", "t3", "--dir", root, "--json"]));
    wr(root, "a.txt", "changed later\n");
    const again = cli(["run", "snapshot", "--run", "t3", "--dir", root, "--json"]);
    assert.strictEqual(again.status, 0);
    assert.strictEqual(J(again).existing, true);
    assert.strictEqual(J(again).pre, first.pre, "a resumed run never moves the pre-run tree");
    assert.strictEqual(first.pre, git(root, "rev-parse", "HEAD"), "a clean tree snapshots HEAD");
    const miss = cli(["undo", "--run", "never-ran", "--dir", root, "--json"]);
    assert.strictEqual(miss.status, 2);
    assert.strictEqual(J(miss).reason, "no-snapshot");
    const ng = cli(["run", "snapshot", "--run", "t4", "--dir", plain, "--json"]);
    assert.strictEqual(ng.status, 2);
    assert.strictEqual(J(ng).reason, "not-a-git-repo");
    assert.strictEqual(cli(["run", "snapshot", "--dir", root, "--json"]).status, 1, "no --run → usage");
  } finally {
    rmrf(root);
    rmrf(plain);
  }
});

test("snapshot: a ref older than 30 days is removed at the next snapshot, and only on its own snapshot's word", () => {
  const root = repo();
  try {
    assert.strictEqual(cli(["run", "snapshot", "--run", "old", "--dir", root]).status, 0);
    const f = path.join(runDir(root, "old"), "snapshot.json");
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    j.taken_ms = Date.now() - 31 * 86400000;
    fs.writeFileSync(f, JSON.stringify(j));
    const r = J(cli(["run", "snapshot", "--run", "new", "--dir", root, "--json"]));
    assert.deepStrictEqual(r.pruned, ["old"]);
    assert.strictEqual(spawnSync("git", ["rev-parse", "--verify", "-q", "refs/orc/runs/old/pre"], { cwd: root }).status, 1);
    assert.strictEqual(git(root, "rev-parse", "--verify", "-q", "refs/orc/runs/new/pre"), git(root, "rev-parse", "HEAD"));
  } finally {
    rmrf(root);
  }
});

test("payload: the snapshot is wired at the run-start pointer step, and no coding lane prints `git checkout -- .` as its undo", () => {
  const T = path.join(__dirname, "..", "..", "templates", "skills");
  const trace = fs.readFileSync(path.join(T, "_shared", "phases", "trace.md"), "utf8");
  const core = trace.slice(trace.indexOf("<!-- orc:layer core -->"), trace.indexOf("<!-- orc:layer composed -->"));
  const composed = trace.slice(trace.indexOf("<!-- orc:layer composed -->"));
  assert.match(core.slice(core.indexOf("Run pointer")), /^[\s\S]{0,600}orc run snapshot --run <run-slug>/, "core layer: in the pointer step");
  assert.match(composed, /orc run snapshot --run <run-slug>/, "composed layer (orc-diy): in its run start");
  for (const f of ["orc-quick/SKILL.md", "orc-mini/SKILL.md", "orc-fast/SKILL.md", "orc/SKILL.md"])
    assert.ok(!/print `git checkout -- \.`/.test(fs.readFileSync(path.join(T, f), "utf8")), `${f} never prints git checkout -- . as the undo`);
});
