"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.7.0 W6 — `orc wiki resolve | add | refs`: one doc at a time.
//
// The three promises this file holds, because each one is a way the new flow
// could leave the wiki WORSE than a full refresh would have:
//
//   1. AMBIGUOUS is a question, never a guess. Scanning the wrong area costs
//      real money and writes a doc that documents something else.
//   2. A reservation that never got its scan is REPORTED. A stub that looks
//      like a page is the one thing a wiki must never contain.
//   3. `refs` repairs only what is free and derived, and says what it did not
//      repair. A sweep that silently regenerated prose would be spending money
//      nobody asked it to spend.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, tmpdir } = require("../_helpers");

const json = (r) => JSON.parse(r.stdout);

function doc(area, covers, keywords) {
  return [
    "---",
    "wiki_schema: 2",
    "doc_type: feature",
    `area: ${area}`,
    `covers: [${covers.join(", ")}]`,
    `keywords: [${keywords.join(", ")}]`,
    "scanned_at: 010926 10:00:00",
    "scanned_commit: deadbeef",
    "status: fresh",
    "---",
    "",
    `# ${area} Overview`,
    "",
    "## TL;DR (60-second brief)",
    `- What ${area} does.`,
    "",
  ].join("\n");
}

// A repo with a registered two-doc wiki and one undocumented area.
function wikiFixture() {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, "wiki"), { recursive: true });
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  for (const [dir, files] of [
    ["src/auth", ["login.js", "session.js"]],
    ["src/billing", ["invoice.js"]],
    ["src/remittance", ["send.js", "track.js"]],
  ]) {
    fs.mkdirSync(path.join(root, ...dir.split("/")), { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(root, ...dir.split("/"), f), "module.exports = 1;\n");
  }
  fs.writeFileSync(path.join(root, "wiki", "orc-feature-auth-overview.md"), doc("auth", ["src/auth/**"], ["login", "session", "token"]));
  fs.writeFileSync(path.join(root, "wiki", "orc-feature-billing-overview.md"), doc("billing", ["src/billing/**"], ["invoice", "charge"]));
  git("add", "-A");
  git("commit", "-qm", "base");
  assert.equal(cli(["wiki", "sync", "--dir", root]).status, 0);
  return root;
}

test("wiki resolve — a clear winner is a MATCH, and it routes to update", () => {
  const root = wikiFixture();
  const r = cli(["wiki", "resolve", "login", "session", "--dir", root, "--json"]);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.verdict, "match");
  assert.match(j.match.file, /auth/);
  assert.ok(j.match.why.length, "a match says WHY, so the user can disagree with it");
  assert.match(j.next, /^\/orc-wiki update /);
});

test("wiki resolve — nothing covering it is NEW, with a proposed scope from path names", () => {
  const root = wikiFixture();
  const r = cli(["wiki", "resolve", "remittance", "--dir", root, "--json"]);
  assert.equal(r.status, 1); // 1 = new. An answer, not a failure.
  const j = json(r);
  assert.equal(j.verdict, "new");
  assert.equal(j.suggested_slug, "remittance");
  assert.ok(j.suggested_covers.some((c) => c.glob.startsWith("src/remittance")));
  // The proposal must never present itself as an answer.
  assert.match(j.note, /STARTING POINT/);
  assert.match(j.next, /^\/orc-wiki add /);
});

test("wiki resolve — two docs that cover it about equally is AMBIGUOUS, never a guess", () => {
  const root = wikiFixture();
  // A term that lands in both docs' areas with the same weight.
  fs.writeFileSync(
    path.join(root, "wiki", "orc-feature-payments-overview.md"),
    doc("payments", ["src/billing/**"], ["invoice", "charge", "refund"])
  );
  cli(["wiki", "sync", "--dir", root]);
  const r = cli(["wiki", "resolve", "invoice", "--dir", root, "--json"]);
  assert.equal(r.status, 2);
  const j = json(r);
  assert.equal(j.verdict, "ambiguous");
  assert.ok(j.candidates.length >= 2);
  assert.match(j.next, /ask which doc/);
});

test("wiki resolve — no wiki and no topic are different answers", () => {
  const bare = tmpdir();
  fs.mkdirSync(bare, { recursive: true });
  assert.equal(cli(["wiki", "resolve", "anything", "--dir", bare]).status, 3);
  assert.equal(cli(["wiki", "resolve", "--dir", wikiFixture()]).status, 2);
});

test("wiki add — reserves a stub that can never be mistaken for a page", () => {
  const root = wikiFixture();
  const r = cli(["wiki", "add", "remittance", "--title", "Remittance", "--covers", "src/remittance/**", "--dir", root, "--json"]);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.reserved, "wiki/orc-feature-remittance-overview.md");
  const body = fs.readFileSync(path.join(root, ...j.reserved.split("/")), "utf8");
  assert.match(body, /status: reserved/);
  assert.match(body, /RESERVED by `orc wiki add`/);
  assert.match(body, /nothing below is evidence/);
  assert.match(body, /covers: \[src\/remittance\/\*\*\]/);
  // It is a reservation, and the output says so rather than reporting success.
  assert.match(j.note, /RESERVATION, not a doc/);
});

test("wiki add — refuses a second reservation, and refuses one with no coverage", () => {
  const root = wikiFixture();
  cli(["wiki", "add", "remittance", "--covers", "src/remittance/**", "--dir", root]);
  const again = cli(["wiki", "add", "remittance", "--covers", "src/remittance/**", "--dir", root]);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already exists/);
  assert.match(again.stderr, /orc-wiki update/, "a refusal names what to do instead");

  const nocov = cli(["wiki", "add", "nothing", "--dir", root]);
  assert.equal(nocov.status, 2);
  assert.match(nocov.stderr, /can never be marked stale/);

  assert.equal(cli(["wiki", "add", "x", "--covers", "a/**", "--type", "nope", "--dir", root]).status, 2);
});

test("wiki add — refuses in a repo with no wiki at all", () => {
  const bare = tmpdir();
  fs.mkdirSync(bare, { recursive: true });
  const r = cli(["wiki", "add", "x", "--covers", "a/**", "--dir", bare]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /wiki that exists/);
});

test("wiki refs — repairs registration, reports everything else with its command", () => {
  const root = wikiFixture();
  cli(["wiki", "add", "remittance", "--covers", "src/remittance/**", "--dir", root]);
  const r = cli(["wiki", "refs", "--dir", root, "--json"]);
  assert.equal(r.status, 1); // work pending
  const j = json(r);
  assert.equal(j.mode, "repair");
  assert.ok(j.repaired.includes("registration"), "a drifted registration is free to fix, so it is fixed");
  assert.ok(j.open.includes("reserved"), "a reservation with no scan behind it is outstanding");
  const ids = j.items.map((i) => i.id);
  for (const id of ["registration", "reserved", "orientation", "architecture", "claude-md", "crosslink"])
    assert.ok(ids.includes(id), id + " must be swept");
  for (const i of j.items) if (i.state !== "clean" && i.state !== "absent" && i.state !== "repaired") assert.ok(i.fix, i.id + " must name its fix");
  assert.match(j.note, /only registration is repaired/);
});

test("wiki refs --check repairs nothing", () => {
  const root = wikiFixture();
  cli(["wiki", "add", "remittance", "--covers", "src/remittance/**", "--dir", root]);
  const before = fs.readFileSync(path.join(root, "wiki", "INDEX.md"), "utf8");
  const j = json(cli(["wiki", "refs", "--dir", root, "--check", "--json"]));
  assert.equal(j.mode, "check");
  assert.deepEqual(j.repaired, []);
  assert.equal(fs.readFileSync(path.join(root, "wiki", "INDEX.md"), "utf8"), before);
});

test("wiki refs — the CLAUDE.md pointer's doc count is checked against the registry", () => {
  const root = wikiFixture();
  fs.writeFileSync(
    path.join(root, "CLAUDE.md"),
    "# P\n\n<!-- ORC-WIKI:START (managed by orc-wiki — do not edit by hand) -->\nLast updated: 010926 10:00:00 · 9 docs · block: v2.\n<!-- ORC-WIKI:END -->\n"
  );
  const j = json(cli(["wiki", "refs", "--dir", root, "--check", "--json"]));
  const cm = j.items.find((i) => i.id === "claude-md");
  assert.equal(cm.state, "behind");
  assert.match(cm.what, /says 9 docs/);
});

test("wiki refs — a repo with no wiki says so rather than reporting clean", () => {
  const bare = tmpdir();
  fs.mkdirSync(bare, { recursive: true });
  const r = cli(["wiki", "refs", "--dir", bare]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /no wiki/);
});

test("the new commands are in the wiki usage text", () => {
  const r = cli(["wiki", "frobnicate"]);
  assert.equal(r.status, 1);
  for (const s of ["orc wiki resolve", "orc wiki add", "orc wiki refs"]) assert.ok(r.stderr.includes(s), s + " must be documented");
});

test("the lane's own prose names the new entries", () => {
  const sk = path.join(__dirname, "..", "..", "templates", "skills", "orc-wiki");
  const spine = fs.readFileSync(path.join(sk, "SKILL.md"), "utf8");
  assert.match(spine, /\/orc-wiki update/);
  assert.match(spine, /\/orc-wiki add/);
  const flow = fs.readFileSync(path.join(sk, "references", "partial-refresh.md"), "utf8");
  for (const step of ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"]) assert.ok(flow.includes(step), step + " must be in the flow");
  assert.match(flow, /orc wiki refs/);
  const phase0 = fs.readFileSync(path.join(sk, "references", "phases", "phase-0.md"), "utf8");
  assert.match(phase0, /ADD ONE TOPIC/);
  const cmd = fs.readFileSync(path.join(__dirname, "..", "..", "templates", "commands", "orc-wiki.md"), "utf8");
  assert.match(cmd, /update <doc>/);
  assert.match(cmd, /add "<topic>"/);
});
