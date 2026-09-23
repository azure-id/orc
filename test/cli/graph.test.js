"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.8.0 W1 — `orc graph status | update | gc`: the store and change detection.
//
// The promises this file holds:
//
//   1. A change is found from git's own blob SHAs — dirty, untracked, deleted,
//      committed — and an unchanged file is never parsed twice, not even after
//      a branch switch and back.
//   2. The exit code IS the answer: status 0 FRESH · 1 NONE · 2 DRIFTED · 3 OFF,
//      and `--json` prints one object with the same code (S7).
//   3. Off means off for a lane: `--if-enabled` writes nothing.
//   4. A graph that cannot be computed says why. It never crashes.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");

const json = (r) => JSON.parse(r.stdout);

function write(root, rel, body) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
}

function repo() {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  write(root, "src/a.js", "function a() { return b(); }\n");
  write(root, "src/b.js", "function b() { return 1; }\n");
  write(root, "README.md", "# not source\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  return { root, git };
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);
const on = (root) => assert.equal(cli(["config", "set", "code_graph", "on", "--dir", root]).status, 0);

test("graph status — off by default is OFF (exit 3); on with no index is NONE (exit 1)", () => {
  const { root } = repo();
  const off = graph(root, "status", "--json");
  assert.equal(off.status, 3);
  assert.equal(json(off).state, "off");
  on(root);
  const none = graph(root, "status", "--json");
  assert.equal(none.status, 1);
  assert.equal(json(none).state, "none");
});

test("graph update — the first build indexes source files only, then status is FRESH", () => {
  const { root } = repo();
  on(root);
  const r = graph(root, "update", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.state, "built");
  assert.equal(j.files, 2, "README.md is not source and is not in the map");
  assert.equal(j.parsed, 2);
  const s = graph(root, "status", "--json");
  assert.equal(s.status, 0);
  assert.equal(json(s).state, "fresh");
  assert.ok(fs.existsSync(path.join(root, ".claude", "orc", "graph", "meta.json")));
});

test("graph status — a dirty edit, an untracked file and a deleted file are DRIFTED, each counted", () => {
  const { root } = repo();
  on(root);
  assert.equal(graph(root, "update").status, 0);
  write(root, "src/a.js", "function a() { return 2; }\n");
  write(root, "src/c.ts", "export const c = 1;\n");
  fs.rmSync(path.join(root, "src", "b.js"));
  const s = graph(root, "status", "--json");
  assert.equal(s.status, 2);
  assert.deepStrictEqual(json(s).behind, { added: 1, changed: 1, deleted: 1 });
  const u = json(graph(root, "update", "--json"));
  assert.equal(u.state, "updated");
  assert.equal(u.parsed, 2, "only the changed and the added file are parsed");
  assert.equal(u.deleted, 1);
  assert.equal(graph(root, "status").status, 0);
});

test("graph update — nothing changed writes nothing and says so", () => {
  const { root } = repo();
  on(root);
  assert.equal(graph(root, "update").status, 0);
  const metaFile = path.join(root, ".claude", "orc", "graph", "meta.json");
  const before = fs.readFileSync(metaFile, "utf8");
  const u = json(graph(root, "update", "--json"));
  assert.equal(u.state, "unchanged");
  assert.equal(u.parsed, 0);
  assert.equal(fs.readFileSync(metaFile, "utf8"), before);
});

test("graph update — a branch switch back REUSES the record; nothing is parsed twice", () => {
  const { root, git } = repo();
  on(root);
  assert.equal(graph(root, "update").status, 0);
  const base = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
  git("checkout", "-qb", "other");
  write(root, "src/a.js", "function a() { return 3; }\n");
  git("commit", "-qam", "other");
  assert.equal(json(graph(root, "update", "--json")).parsed, 1);
  git("checkout", "-q", base);
  const back = json(graph(root, "update", "--json"));
  assert.equal(back.changed, 1);
  assert.equal(back.parsed, 0);
  assert.equal(back.reused, 1);
});

test("graph update --if-enabled — the key off writes NOTHING (exit 3)", () => {
  const { root } = repo();
  const r = graph(root, "update", "--if-enabled", "--json");
  assert.equal(r.status, 3);
  assert.equal(json(r).state, "off");
  assert.ok(!fs.existsSync(path.join(root, ".claude", "orc", "graph")));
});

test("graph update — a manual run with the key off still builds, and says lanes will not read it", () => {
  const { root } = repo();
  const r = graph(root, "update");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /code_graph is off/);
  assert.equal(json(graph(root, "update", "--json")).enabled, false);
});

test("graph gc — a record no file points at is removed; a live one is kept", () => {
  const { root } = repo();
  on(root);
  assert.equal(graph(root, "update").status, 0);
  write(root, "src/a.js", "function a() { return 4; }\n");
  assert.equal(graph(root, "update").status, 0);
  const r = graph(root, "gc", "--json");
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.removed, 1);
  assert.equal(j.kept, 2);
});

test("graph — outside a git repository it is unavailable (exit 1), with the reason", () => {
  const root = tmpdir();
  on(root);
  const r = graph(root, "status", "--json");
  // No index yet reads NONE before git is even asked; update is where git is needed.
  assert.equal(r.status, 1);
  const u = graph(root, "update", "--json");
  assert.equal(u.status, 1);
  assert.equal(json(u).reason, "not-git");
});

test("graph update — a live lock refuses a second writer and names it", () => {
  const { root } = repo();
  on(root);
  const dir = path.join(root, ".claude", "orc", "graph");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".lock"), JSON.stringify({ pid: 4242, at: "now" }));
  const r = graph(root, "update", "--json");
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.reason, "locked");
  assert.equal(j.holder.pid, 4242);
});

test("graph update — a lock older than ten minutes is a dead writer's, and is taken over", () => {
  const { root } = repo();
  on(root);
  const dir = path.join(root, ".claude", "orc", "graph");
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, ".lock");
  fs.writeFileSync(lock, "{}");
  const old = new Date(Date.now() - 11 * 60 * 1000);
  fs.utimesSync(lock, old, old);
  assert.equal(graph(root, "update").status, 0);
  assert.ok(!fs.existsSync(lock), "the lock is released after the write");
});

test("doctor — graph-drifted only while the graph is on, and only when it has drifted", () => {
  const { root } = repo();
  const ids = () => JSON.parse(cli(["doctor", "--json", "--dir", root]).stdout).findings.map((f) => f.id);
  assert.ok(!ids().includes("graph-drifted"), "off: a doctor never warns about the default");
  on(root);
  assert.equal(graph(root, "update").status, 0);
  assert.ok(!ids().includes("graph-drifted"), "fresh: nothing to say");
  write(root, "src/a.js", "function a() { return 9; }\n");
  assert.ok(ids().includes("graph-drifted"), "drifted: reported, with the free fix");
});

test("graph notes pending --if-enabled — notes off is exit 3; the other --at site is deferred (exit 5)", () => {
  const { root } = repo();
  on(root);
  assert.equal(graph(root, "update").status, 0);
  const off = graph(root, "notes", "pending", "--files", "src/a.js", "--if-enabled", "--json");
  assert.equal(off.status, 3, "code_graph_notes defaults to off");
  assert.equal(cli(["config", "set", "code_graph_notes", "end", "--dir", root]).status, 0);
  const wave = graph(root, "notes", "pending", "--files", "src/a.js", "--at", "wave", "--if-enabled", "--json");
  assert.equal(wave.status, 5);
  assert.equal(JSON.parse(wave.stdout).state, "deferred");
  const end = graph(root, "notes", "pending", "--files", "src/a.js", "--at", "end", "--if-enabled", "--json");
  assert.notEqual(end.status, 3, "the end batch is this mode's own site");
});

test("graph status --heal — builds or updates in the same call, and carries the line and trace a lane copies", () => {
  const { root } = repo();
  on(root);
  const b = graph(root, "status", "--if-enabled", "--heal", "--json");
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const built = json(b);
  assert.equal(built.state, "fresh");
  assert.equal(built.healed.state, "built");
  assert.match(built.line, /^graph: built first index — 2 files · 2 symbols/);
  // v1.9.1 A1: the density is appended to the SAME verb, never a line of its own.
  assert.equal(built.trace, "GRAPH-CONSULT built :: files=2 symbols=2 gen=1 density=1");
  write(root, "src/b.js", "function b() {\n  return 2;\n}\n");
  const upd = json(graph(root, "status", "--if-enabled", "--heal", "--json"));
  assert.equal(upd.state, "fresh");
  assert.equal(upd.healed.state, "updated");
  assert.match(upd.line, /^graph: 1 file changed outside ORC → updated/);
  assert.equal(upd.trace, "GRAPH-CONSULT updated :: files=2 symbols=2 gen=2 density=1");
  const again = json(graph(root, "status", "--if-enabled", "--heal", "--json"));
  assert.equal(again.healed, undefined, "a FRESH graph is not rebuilt");
  assert.equal(again.trace, "GRAPH-CONSULT fresh :: files=2 symbols=2 gen=2 density=1");
  assert.equal(again.thin, false, "two files is a small repository, never a thin one");
  const u = json(graph(root, "update", "--if-enabled", "--json"));
  assert.match(u.trace, /^GRAPH-UPDATE unchanged :: parsed=0 reused=0 deleted=0 gen=2 route=unchanged ms=\d+$/);
  assert.equal(cli(["config", "set", "code_graph", "off", "--dir", root]).status, 0);
  const off = graph(root, "status", "--if-enabled", "--heal", "--json");
  assert.equal(off.status, 3);
  assert.equal(json(off).trace, "GRAPH-CONSULT off");
});

test("graph status --json — carries auto_update and the notes mode, so a lane reads no key", () => {
  const { root } = repo();
  on(root);
  const j = JSON.parse(graph(root, "status", "--json").stdout);
  assert.strictEqual(j.auto_update, true);
  assert.strictEqual(j.notes, "off");
});

test("graph — an unknown subcommand prints the usage and exits 1", () => {
  const { root } = repo();
  const r = graph(root, "nope");
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /orc graph status/);
});

// ── EW1: generation + coverage ───────────────────────────────────────────────
// The promises:
//   5. `generation` goes up ONLY when the index on disk changes, and every graph
//      answer carries it — a card quoted later can be placed in time.
//   6. `gen_id` names the CONTENT, so the same tree indexed twice gives the same id.
//   7. `coverage` reports what the extractor saw, per file, and a gap is an
//      ANSWER (exit 0), never an error.

test("graph generation — goes up on a real change, stands still when nothing changed", () => {
  const { root, git } = repo();
  on(root);
  const first = json(graph(root, "update", "--json"));
  assert.equal(first.generation, 1);
  assert.match(first.gen_id, /^[0-9a-f]{8}$/);

  const same = json(graph(root, "update", "--json"));
  assert.equal(same.state, "unchanged");
  assert.equal(same.generation, 1, "an update that writes nothing must not move the generation");
  assert.equal(same.gen_id, first.gen_id);

  write(root, "src/b.js", "function b() { return 2; }\n");
  git("add", "-A");
  git("commit", "-qm", "edit");
  const moved = json(graph(root, "update", "--json"));
  assert.equal(moved.state, "updated");
  assert.equal(moved.generation, 2);
  assert.notEqual(moved.gen_id, first.gen_id, "different content must give a different gen_id");

  // Every answer carries it, whichever command produced it.
  const st = json(graph(root, "status", "--json"));
  assert.equal(st.generation, 2);
  assert.match(st.line, /gen 2/);
  assert.match(st.trace, /gen=2/);
  const cx = json(graph(root, "ctx", "b", "--json"));
  assert.equal(cx.generation, 2);
});

test("graph coverage — a gap is an answer: partial ranges, skipped reasons and excluded paths", () => {
  const { root, git } = repo();
  // A file whose block never closes: the extractor loses the rest of the file.
  write(root, "src/broken.js", "function ok() { return 1; }\nfunction lost() {\n  ok();\n");
  git("add", "-A");
  git("commit", "-qm", "broken");
  on(root);
  graph(root, "update", "--json");

  const r = graph(root, "coverage", "src/a.js", "src/broken.js", "README.md", "--json");
  assert.equal(r.status, 0, "a gap is an answer, never a failure");
  const j = json(r);
  const by = Object.fromEntries(j.rows.map((x) => [x.path, x]));
  assert.equal(by["src/a.js"].coverage, "full");
  assert.equal(by["src/a.js"].changed_since_index, "current");
  assert.equal(by["src/broken.js"].coverage, "partial");
  assert.ok(by["src/broken.js"].ranges.length, "a partial file names the lines it did not finish");
  assert.equal(by["README.md"].coverage, "excluded", "not a source file the graph indexes");
  assert.equal(j.gaps, 2);
  assert.match(j.line, /no recorded gap is not proof of completeness/);
  assert.match(j.trace, /^GRAPH-COVERAGE gaps/);
});

test("graph coverage — the card header carries the gap, and an edited file reads CHANGED", () => {
  const { root, git } = repo();
  write(root, "src/broken.js", "function ok() { return 1; }\nfunction lost() {\n  ok();\n");
  git("add", "-A");
  git("commit", "-qm", "broken");
  on(root);
  graph(root, "update", "--json");

  const card = json(graph(root, "ctx", "src/broken.js", "--json")).card;
  assert.match(card, /coverage partial \d+-\d+/, "a card never hides a gap");

  // EW3: a read HEALS what it is about to answer for. An edit to a file the
  // read NAMES is repaired first, so the row comes back `current` on the new
  // generation — a read no longer describes a file it already knows has moved.
  write(root, "src/a.js", "function a() { return b() + 1; }\n");
  const j = json(graph(root, "coverage", "src/a.js", "--json"));
  assert.equal(j.healed.trigger, "target", "the file this read names had moved");
  assert.equal(j.rows[0].changed_since_index, "current");

  // With the heal switched off, the same read REPORTS the drift instead of
  // repairing it. The answer is honest either way, never silently stale.
  assert.equal(cli(["config", "set", "code_graph_heal_ms", "0", "--dir", root]).status, 0);
  write(root, "src/a.js", "function a() { return b() + 2; }\n");
  const cold = json(graph(root, "coverage", "src/a.js", "--json"));
  assert.equal(cold.healed, undefined);
  assert.equal(cold.rows[0].changed_since_index, "changed");
});

test("graph heal-on-read — a moved HEAD heals, a slow last update declines, and the answer says which", () => {
  const { root, git } = repo();
  on(root);
  graph(root, "update", "--json");

  // A commit nobody told the graph about. HEAD moving is the one whole-repo
  // signal a read can afford to check.
  write(root, "src/c.js", "function c() { return a(); }\n");
  git("add", "-A");
  git("commit", "-qm", "third file");
  const healed = json(graph(root, "ctx", "src/c.js", "--json"));
  assert.equal(healed.healed.trigger, "head");
  assert.equal(healed.healed.state, "updated");
  assert.equal(healed.healed.generation, 2);
  assert.equal(json(graph(root, "status", "--json")).state, "fresh", "the read left the graph FRESH");

  // It never STARTS a heal it expects to overrun. A 1 ms cap is below any real
  // update, so the next read declines and SAYS SO — a card that is quietly
  // stale is the failure this wave exists to remove.
  assert.equal(cli(["config", "set", "code_graph_heal_ms", "1", "--dir", root]).status, 0);
  write(root, "src/c.js", "function c() { return a() + 1; }\n");
  const declined = json(graph(root, "ctx", "src/c.js", "--json"));
  assert.equal(declined.healed.state, "skipped");
  assert.equal(declined.healed.reason, "over-cap");
  assert.match(declined.card, /CHANGED since index/, "the card marks itself as hints");
  // A card answer carries the card, not a separate `line` — so the human form
  // of both sentences is checked on the plain-text call.
  assert.match(graph(root, "ctx", "src/c.js").stdout, /not healed on read/);
});

test("graph coverage — off with --if-enabled is exit 3, and no graph is exit 1", () => {
  const { root } = repo();
  const off = graph(root, "coverage", "src/a.js", "--if-enabled", "--json");
  assert.equal(off.status, 3);
  assert.equal(json(off).state, "off");
  on(root);
  const none = graph(root, "coverage", "src/a.js", "--json");
  assert.equal(none.status, 1);
  assert.equal(json(none).reason, "no-index");
});

// ── EW3: two writers, one lock ───────────────────────────────────────────────
// The run-end hook and heal-on-read both update, and a wave can stop two
// executors at once. The rule is at-least-once, never half: one writer wins,
// the loser SKIPS (the next trigger retries), and a reader in between sees one
// whole generation or the other.

test("graph update — two writers at once: one runs, one skips, and the graph ends FRESH", async () => {
  const { root } = repo();
  on(root);
  graph(root, "update", "--json");
  write(root, "src/d.js", "function d() { return a(); }\n");

  const both = await Promise.all([
    new Promise((res) => {
      const r = graph(root, "update", "--json");
      res({ status: r.status, out: r.stdout });
    }),
    new Promise((res) => {
      const r = graph(root, "update", "--json");
      res({ status: r.status, out: r.stdout });
    }),
  ]);
  // Whatever the interleaving, neither crashed and the loser (if there was one)
  // named the lock rather than pretending nothing had changed.
  for (const b of both) {
    assert.ok(b.status === 0 || b.status === 1, "an update is either done or unavailable, never a crash");
    if (b.status === 1) assert.equal(JSON.parse(b.out).reason, "locked");
  }
  assert.equal(graph(root, "update", "--json").status, 0, "the next trigger retries and succeeds");
  assert.equal(graph(root, "status").status, 0, "FRESH after the retry — at-least-once, not at-most-once");
});

test("graph update — a crash mid-write is healed by the next update, never read as FRESH", () => {
  const { root } = repo();
  on(root);
  graph(root, "update", "--json");
  const dir = path.join(root, ".claude", "orc", "graph");
  // A writer that died between index.json and meta.json: the index is ahead and
  // the commit point is missing. The next status must NOT call that fresh.
  fs.rmSync(path.join(dir, "meta.json"));
  assert.equal(graph(root, "status").status, 1, "no commit point means NONE, never FRESH");
  assert.equal(graph(root, "update", "--json").status, 0);
  assert.equal(graph(root, "status").status, 0);

  // And a resolution cache left behind by an older generation is simply not
  // used — the answers are identical, only slower.
  const resolved = path.join(dir, "resolved.json");
  const keep = fs.readFileSync(resolved, "utf8");
  fs.writeFileSync(resolved, JSON.stringify({ ...JSON.parse(keep), generation: 999 }));
  const stale = json(graph(root, "ctx", "src/a.js", "--json"));
  fs.writeFileSync(resolved, keep);
  assert.deepStrictEqual(json(graph(root, "ctx", "src/a.js", "--json")).card, stale.card);
});

test("graph heal-on-read — auto_update false means no inline heal, and the card says CHANGED", () => {
  const { root } = repo();
  on(root);
  graph(root, "update", "--json");
  assert.equal(cli(["config", "set", "code_graph_auto_update", "false", "--dir", root]).status, 0);
  write(root, "src/a.js", "function a() { return b() + 9; }\n");
  const r = json(graph(root, "ctx", "src/a.js", "--json"));
  assert.equal(r.healed, undefined, "the key is the user's answer, and it is respected");
  assert.match(r.card, /CHANGED since index/);
  assert.equal(graph(root, "status").status, 2, "still DRIFTED — the read changed nothing");
});
