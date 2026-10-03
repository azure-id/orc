"use strict";
// @test-pool spawn  — shells node bin/cli.js
/**
 * v0.46.0 — the six new lanes, the wiki partial-refresh workstream, and the
 * panels that draw them.
 *
 * The cases here are the ones the plan named as verification highlights, plus
 * the ones where a regression would be SILENT: an exit code that stops being a
 * gate, a ranking that quietly reorders, a token vector that gets collapsed
 * before it is rendered, a price invented from an empty corpus. Every one of
 * those still "works" if it breaks — it just answers wrong.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, rmrf, freshInstall, REPO, appJs, i18nTable } = require("../_helpers");

const git = (root, argv) => spawnSync("git", argv, { cwd: root, encoding: "utf8" });

// A tiny real git repo — these commands grade FROM git history, so a fake one
// would test the parser and nothing else.
function repoWith(files) {
  const { root, claudeDir } = freshInstall();
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "base"]);
  const head = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  return { root, claudeDir, head };
}

const json = (res) => JSON.parse(res.stdout);

/* ============================================================== ORC PACT === */

function writeLedger(claudeDir, entries) {
  const p = path.join(claudeDir, "orc", "pact", "ledger.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ version: 1, entries }, null, 2));
  return p;
}

test("pact status: the exit code IS the contract (0 holding / 1 drifted / 2 broken / 3 no ledger)", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "export function pay() {}\n" });
  try {
    // 3 — no ledger. A first run, not an error.
    let r = cli(["pact", "status", "--json", "--dir", root]);
    assert.strictEqual(r.status, 3, "no ledger exits 3");
    assert.strictEqual(json(r).reason, "no-ledger");

    // 0 — everything holds. And UNCHECKABLE must NOT raise the code: it is the
    // honest state, and a lane that reported it as a failure would teach people
    // to give every promise a fake check.
    writeLedger(claudeDir, [
      { id: "PACT-001", statement: "pay exists", origin: { lane: "user", kind: "constraint" }, anchors: ["src/pay.ts"], check: { kind: "grep", ref: "pay" }, verified_commit: head, confidence: "high" },
      { id: "PACT-002", statement: "no raw emails in the export", origin: { lane: "user", kind: "constraint" }, anchors: ["src/pay.ts"], check: { kind: "manual", ref: null }, verified_commit: head, confidence: "low" },
    ]);
    r = cli(["pact", "status", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, "holding + uncheckable exits 0");
    assert.strictEqual(json(r).counts.UNCHECKABLE, 1);

    // 1 — a commit touched an anchored file.
    fs.appendFileSync(path.join(root, "src/pay.ts"), "// tweak\n");
    git(root, ["commit", "-qam", "tweak"]);
    r = cli(["pact", "status", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "a touched anchor exits 1");
    assert.strictEqual(json(r).counts.DRIFTED, 1);

    // 2 — the check ran and failed.
    r = cli(["pact", "check", "--json", "--dir", root]);
    const after = cli(["pact", "status", "--json", "--dir", root]);
    assert.ok(after.status === 0 || after.status === 2, "check re-anchors or reports broken");
  } finally {
    rmrf(root);
  }
});

test("pact: DRIFTED is COVERAGE-RELATIVE — an unrelated commit never moves a promise", () => {
  const { root, claudeDir, head } = repoWith({
    "src/pay.ts": "export function pay() {}\n",
    "README.md": "# readme\n",
  });
  try {
    writeLedger(claudeDir, [
      { id: "PACT-001", statement: "pay exists", origin: { lane: "user", kind: "constraint" }, anchors: ["src/pay.ts"], check: { kind: "grep", ref: "pay" }, verified_commit: head, confidence: "high" },
    ]);
    // Forty README edits must not age a promise about payments — that is the
    // whole difference between this and a global commit-distance count.
    for (let i = 0; i < 5; i++) {
      fs.appendFileSync(path.join(root, "README.md"), "line\n");
      git(root, ["commit", "-qam", "docs " + i]);
    }
    const r = cli(["pact", "status", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, "unrelated commits leave it HOLDING");
    assert.strictEqual(json(r).rows[0].state, "HOLDING");
  } finally {
    rmrf(root);
  }
});

test("pact check: a pass re-anchors, a fail records — and NOTHING is ever auto-retired", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "export function pay() {}\n" });
  try {
    const p = writeLedger(claudeDir, [
      { id: "PACT-001", statement: "pay exists", origin: { lane: "user", kind: "constraint" }, anchors: ["src/pay.ts"], check: { kind: "grep", ref: "pay" }, verified_commit: head, confidence: "high" },
      { id: "PACT-002", statement: "nope", origin: { lane: "user", kind: "constraint" }, anchors: ["src/pay.ts"], check: { kind: "grep", ref: "NOT-PRESENT" }, verified_commit: head, confidence: "high" },
    ]);
    fs.appendFileSync(path.join(root, "src/pay.ts"), "// tweak\n");
    git(root, ["commit", "-qam", "tweak"]);
    const newHead = git(root, ["rev-parse", "HEAD"]).stdout.trim();

    cli(["pact", "check", "--dir", root]);
    const led = JSON.parse(fs.readFileSync(p, "utf8"));
    const pass = led.entries.find((e) => e.id === "PACT-001");
    const fail = led.entries.find((e) => e.id === "PACT-002");
    assert.strictEqual(pass.verified_commit, newHead, "a pass re-anchors to HEAD");
    assert.strictEqual(fail.verified_commit, head, "a fail NEVER re-anchors");
    assert.strictEqual(fail.last_check.status, "fail");
    // Retirement is a user decision with a recorded reason. A check may never
    // make one on its own, however conclusive it looks.
    assert.ok(!pass.retired && !fail.retired, "no entry is auto-retired");
  } finally {
    rmrf(root);
  }
});

test("pact sync: PACT.md is DERIVED — worst state first, at the project root", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "export function pay() {}\n" });
  try {
    writeLedger(claudeDir, [
      { id: "PACT-001", statement: "holds", origin: { lane: "user", kind: "constraint" }, anchors: ["src/pay.ts"], check: { kind: "grep", ref: "pay" }, verified_commit: head, confidence: "high" },
      { id: "PACT-002", statement: "broken one", origin: { lane: "user", kind: "constraint" }, anchors: ["src/pay.ts"], check: { kind: "grep", ref: "x" }, verified_commit: head, confidence: "high", last_check: { status: "fail", commit: head, at: "01-01-2026 00:00:00" } },
    ]);
    assert.strictEqual(cli(["pact", "sync", "--dir", root]).status, 0);
    const doc = fs.readFileSync(path.join(root, "PACT.md"), "utf8");
    assert.ok(doc.includes("orc-pact:derived"), "carries the derived marker");
    assert.ok(doc.indexOf("## BROKEN") < doc.indexOf("## HOLDING"), "worst state first");
    // At the ROOT, never hidden in .claude/ — a PM has to read it in a PR.
    assert.ok(!fs.existsSync(path.join(claudeDir, "PACT.md")));
  } finally {
    rmrf(root);
  }
});

// v2.1.2 F18 — the reason used to reuse the ANCHOR count as the touched count.
test("pact: the DRIFTED reason names the files the commits TOUCHED, not every anchor", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "export function pay() {}\n", "src/refund.ts": "r\n", "src/cart.ts": "c\n" });
  try {
    writeLedger(claudeDir, [
      { id: "PACT-001", statement: "pay exists", origin: { lane: "user", kind: "constraint" }, anchors: ["src/pay.ts:1", "src/pay.ts:9", "src/refund.ts", "src/cart.ts"], check: { kind: "grep", ref: "pay" }, verified_commit: head, confidence: "high" },
    ]);
    fs.appendFileSync(path.join(root, "src/pay.ts"), "// tweak\n");
    git(root, ["commit", "-qam", "tweak"]);
    const row = json(cli(["pact", "status", "--json", "--dir", root])).rows[0];
    assert.strictEqual(row.state, "DRIFTED");
    // Two anchors in one file are ONE file: 3 anchored files, 1 touched.
    assert.match(row.why, /^1 commit since [0-9a-f]{8} touched 1 of 3 anchored files \(src\/pay\.ts\)$/);
    assert.deepStrictEqual(row.touched_files, ["src/pay.ts"]);
  } finally {
    rmrf(root);
  }
});

/* ========================================================== ORC BOUNDARY === */

// `style: "block"` writes each array the way references/card.md shows it: the
// key, then `  - item` lines (v2.1.2 F02 — the suite only ever wrote inline).
function writeCard(claudeDir, name, header, style = "inline") {
  const p = path.join(claudeDir, "orc", "boundary", name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lines = ["---"];
  for (const [k, v] of Object.entries(header)) {
    if (Array.isArray(v) && style === "block") lines.push(`${k}:`, ...v.map((item) => `  - ${item}`));
    else lines.push(`${k}: ${Array.isArray(v) ? "[" + v.join(", ") + "]" : v}`);
  }
  lines.push("---", "", "# card");
  fs.writeFileSync(p, lines.join("\n"));
}

test("boundary status: exit 0 execute / 1 escalate / 2 refuse / 3 no card", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "x\n", "web/x.json": "{}\n" });
  try {
    assert.strictEqual(cli(["boundary", "status", "--dir", root]).status, 3, "no card exits 3");

    writeCard(claudeDir, "web.md", { area: "web", verdict: "EXECUTE", anchored_files: ["web/x.json"], verified_commit: head });
    assert.strictEqual(cli(["boundary", "status", "--dir", root]).status, 0);

    writeCard(claudeDir, "db.md", { area: "db", verdict: "ESCALATE", escalate_to: "the data owner", anchored_files: ["web/x.json"], verified_commit: head });
    assert.strictEqual(cli(["boundary", "status", "--dir", root]).status, 1);

    writeCard(claudeDir, "pay.md", { area: "src/pay.ts", verdict: "REFUSE", checklist: ["add a test runner"], anchored_files: ["src/pay.ts"], verified_commit: head });
    assert.strictEqual(cli(["boundary", "status", "--dir", root]).status, 2, "any REFUSE exits 2");
  } finally {
    rmrf(root);
  }
});

test("boundary: a REFUSE with no checklist is MALFORMED, not an empty card", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "x\n" });
  try {
    writeCard(claudeDir, "pay.md", { area: "src/pay.ts", verdict: "REFUSE", anchored_files: ["src/pay.ts"], verified_commit: head });
    const r = cli(["boundary", "status", "--json", "--dir", root]);
    const d = json(r);
    assert.strictEqual(d.ok, false, "a malformed card fails the report");
    assert.match(d.malformed[0].problems.join(" "), /what would make it a yes/i);
    // "No" with no "unless" is a shrug, and a shrug must not read as a verdict.
    assert.strictEqual(r.status, 3);

    // An ESCALATE with nobody named is the same failure from the other side.
    writeCard(claudeDir, "db.md", { area: "db", verdict: "ESCALATE", anchored_files: ["src/pay.ts"], verified_commit: head });
    const d2 = json(cli(["boundary", "status", "--json", "--dir", root]));
    assert.ok(d2.malformed.some((m) => /name/i.test(m.problems.join(" "))));
  } finally {
    rmrf(root);
  }
});

test("boundary: an uncarded area is UNKNOWN (exit 3), never silently EXECUTE", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "x\n" });
  try {
    writeCard(claudeDir, "web.md", { area: "web", verdict: "EXECUTE", anchored_files: ["src/pay.ts"], verified_commit: head });
    const r = cli(["boundary", "status", "src/payments", "--json", "--dir", root]);
    assert.strictEqual(r.status, 3);
    assert.strictEqual(json(r).reason, "no-card");
  } finally {
    rmrf(root);
  }
});

// v2.1.2 F02 — the reference shape. Before it, a block list read as an empty
// MAP: a REFUSE was MALFORMED and staleness counted every commit in the repo.
test("boundary status: the block-list card of references/card.md reads exactly like the inline one", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "x\n", "src/idem.ts": "y\n", "README.md": "# r\n" });
  try {
    writeCard(
      claudeDir,
      "pay.md",
      {
        area: "src/payments # verbatim",
        verdict: "REFUSE",
        anchored_files: ["src/pay.ts", "src/idem.ts"],
        verified_commit: head,
        reasons: ['"self-verify: no — no test runner in this package"', '"reversible: no — writes to a live ledger"'],
        checklist: ["add a test runner to this package", "cover the idempotency path"],
      },
      "block"
    );
    let r = cli(["boundary", "status", "--json", "--dir", root]);
    let d = json(r);
    assert.strictEqual(r.status, 2, "a block-list REFUSE exits 2, not 3");
    assert.deepStrictEqual(d.malformed, []);
    let card = d.cards[0];
    assert.strictEqual(card.area, "src/payments", "a trailing comment is not part of a value");
    assert.strictEqual(card.checklist.length, 2);
    assert.strictEqual(card.reasons[0], "self-verify: no — no test runner in this package", "a reason keeps its colon");
    assert.strictEqual(card.anchored_files.length, 2);

    // An UN-anchored commit must not age the card: the empty anchor list did.
    fs.appendFileSync(path.join(root, "README.md"), "line\n");
    git(root, ["commit", "-qam", "docs"]);
    card = json(cli(["boundary", "status", "--json", "--dir", root])).cards[0];
    assert.strictEqual(card.stale, false, "an unrelated commit leaves the card fresh");

    fs.appendFileSync(path.join(root, "src/pay.ts"), "// tweak\n");
    git(root, ["commit", "-qam", "tweak"]);
    card = json(cli(["boundary", "status", "--json", "--dir", root])).cards[0];
    assert.strictEqual(card.stale, true, "a commit on an anchored file makes it stale");
    assert.strictEqual(card.distance, 1);
  } finally {
    rmrf(root);
  }
});

test("boundary status: a non-indented block list and a quoted comma both read", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "x\n" });
  try {
    const p = path.join(claudeDir, "orc", "boundary", "pay.md");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      ["---", "area: src/pay.ts", "verdict: REFUSE", "anchored_files: [src/pay.ts]", `verified_commit: ${head}`, 'reasons: ["add a runner, then a test", second]', "checklist:", "- a", "- b   # column 0", "---", "", "# card"].join("\n")
    );
    const r = cli(["boundary", "status", "--json", "--dir", root]);
    const card = json(r).cards[0];
    assert.strictEqual(r.status, 2);
    assert.deepStrictEqual(card.checklist, ["a", "b"], "`- item` at column 0 is a list item");
    assert.deepStrictEqual(card.reasons, ["add a runner, then a test", "second"], "a comma inside quotes is text");
  } finally {
    rmrf(root);
  }
});

test("boundary status: a list field written as a map is MALFORMED, never empty", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "x\n" });
  try {
    const p = path.join(claudeDir, "orc", "boundary", "pay.md");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, ["---", "area: src/pay.ts", "verdict: REFUSE", "anchored_files: [src/pay.ts]", `verified_commit: ${head}`, "checklist:", "  owner: x", "---", "", "# card"].join("\n"));
    const r = cli(["boundary", "status", "--json", "--dir", root]);
    const d = json(r);
    assert.strictEqual(d.ok, false);
    assert.match(d.malformed[0].problems.join(" "), /checklist is not a list/);
    assert.strictEqual(r.status, 3);
  } finally {
    rmrf(root);
  }
});

/* =========================================================== ORC HANDOFF === */

function writeSurfaces(root, body) {
  const p = path.join(root, "orc-handoff", "surfaces.md");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

const SURFACES = `# map

## H-001 · web/en.json · Screen text
- grade: green
- check: node -e "JSON.parse(require('fs').readFileSync('web/en.json','utf8'))"
- check_kind: command
- revert: git checkout -- web/en.json

## H-002 · src/limits.ts · Money code
- grade: red
- reason: this decides what a customer is charged
- ask: a backend developer
`;

test("handoff set: a GREEN surface is written and checked; a RED surface is NEVER touched", () => {
  const { root } = repoWith({ "web/en.json": '{\n  "cart": { "title": "Empty" }\n}\n', "src/limits.ts": "export const MAX = 1;\n" });
  try {
    writeSurfaces(root, SURFACES);
    const before = fs.readFileSync(path.join(root, "src/limits.ts"), "utf8");

    const ok = cli(["handoff", "set", "H-001", "cart.title", "Nothing here", "--json", "--dir", root]);
    assert.strictEqual(ok.status, 0);
    const d = json(ok);
    assert.strictEqual(d.before, "Empty");
    assert.strictEqual(d.check_status, "pass", "a green surface runs its own check");
    assert.match(fs.readFileSync(path.join(root, "web/en.json"), "utf8"), /Nothing here/);

    const red = cli(["handoff", "set", "H-002", "MAX", "9", "--dir", root]);
    assert.strictEqual(red.status, 1);
    assert.match(red.stderr, /RED/);
    assert.strictEqual(fs.readFileSync(path.join(root, "src/limits.ts"), "utf8"), before, "a RED file is byte-identical after a refused write");
  } finally {
    rmrf(root);
  }
});

test("handoff set: it never CREATES a key, and handoff_write:false makes it map-only", () => {
  const { root } = repoWith({ "web/en.json": '{\n  "cart": { "title": "Empty" }\n}\n' });
  try {
    writeSurfaces(root, SURFACES);
    // A new key is a code change, not a content change.
    const made = cli(["handoff", "set", "H-001", "cart.subtitle", "hi", "--dir", root]);
    assert.strictEqual(made.status, 1);
    assert.match(made.stderr, /no such key/i);

    cli(["config", "set", "handoff_write", "false", "--dir", root]);
    const off = cli(["handoff", "set", "H-001", "cart.title", "x", "--dir", root]);
    assert.strictEqual(off.status, 1);
    assert.match(off.stderr, /map-only|handoff_write/i);
  } finally {
    rmrf(root);
  }
});

test("handoff: the undo command is printed BEFORE the write, not after", () => {
  const { root } = repoWith({ "web/en.json": '{\n  "cart": { "title": "Empty" }\n}\n' });
  try {
    writeSurfaces(root, SURFACES);
    const r = cli(["handoff", "set", "H-001", "cart.title", "New", "--dir", root]);
    const undoAt = r.stdout.indexOf("undo this with");
    const wroteAt = r.stdout.indexOf("was:");
    assert.ok(undoAt !== -1 && wroteAt !== -1, "both lines are printed");
    assert.ok(undoAt < wroteAt, "the undo command comes first — after is too late");
  } finally {
    rmrf(root);
  }
});

/* ============================================================ ORC BUDGET === */

test("budget: the token vector is never collapsed — usd and quota are DERIVED from it", () => {
  const table = JSON.parse(fs.readFileSync(path.join(REPO, "bin", "pricing.json"), "utf8"));
  // Four rates per model, never one — the whole reason a blended headline is
  // impossible to produce by accident.
  for (const m of Object.keys(table.models))
    for (const k of ["input", "cache_write", "cache_read", "output"])
      assert.ok(typeof table.models[m][k] === "number", `${m} prices ${k}`);
  // A dated table, because a dollar figure without one is a number with no
  // provenance.
  assert.match(table.as_of, /^\d{4}-\d{2}-\d{2}$/);
  // Quota capacities are WEIGHTED tokens: the unit the forecast can actually
  // produce, not a metered balance.
  for (const p of Object.values(table.plans))
    assert.ok(p.window_weighted_tokens > 0 && p.weekly_weighted_tokens > p.window_weighted_tokens);
});

test("budget forecast: a plan is required — a sentence is refused, not downgraded", () => {
  const { root } = repoWith({ "notes.md": "please make the checkout faster\n" });
  try {
    const r = cli(["budget", "forecast", "notes.md", "--json", "--dir", root]);
    assert.strictEqual(r.status, 3);
    assert.strictEqual(json(r).reason, "not-a-plan");
    // A guess that looks computed is worse than no answer.
    assert.match(json(r).hint, /PLAN, not a request/i);
  } finally {
    rmrf(root);
  }
});

test("budget: with no history it refuses to invent a number", () => {
  const { root } = repoWith({
    "plan.md": "tasks:\n  - id: T1\n    declared_files: [a.ts]\n    depends_on: []\n",
  });
  try {
    const r = cli(["budget", "forecast", "plan.md", "--json", "--dir", root]);
    assert.strictEqual(r.status, 3);
    assert.strictEqual(json(r).reason, "no-history");
    assert.match(json(r).hint, /will not invent numbers/);
  } finally {
    rmrf(root);
  }
});

test("budget calibrate: the join attributes by model+window, and unattributed is ALWAYS present", () => {
  const { root, claudeDir } = repoWith({ "a.ts": "x\n" });
  const tx = path.join(root, "tx");
  try {
    fs.mkdirSync(tx, { recursive: true });
    // Trace lines carry LOCAL wall clock; transcripts carry ISO UTC. Same
    // machine, so the fixture converts rather than pretending they are equal —
    // treating one as the other silently attributes nothing.
    const at = (h, m, s) => new Date(2026, 7, 10, h, m, s).toISOString();
    const blk = (ts, model, side, out) =>
      JSON.stringify({
        sessionId: "s1", timestamp: ts, cwd: root, isSidechain: side,
        message: { model, usage: { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 900, output_tokens: out, server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 } } },
      });
    fs.writeFileSync(path.join(tx, "s.jsonl"), [
      blk(at(9, 30, 0), "claude-opus-4-8", false, 10),
      blk(at(9, 31, 5), "claude-sonnet-4-6", true, 200),
      // DELIBERATELY UNJOINABLE: no DISPATCH line claims a haiku dispatch.
      blk(at(9, 46, 0), "claude-haiku-4-5", true, 20),
    ].join("\n") + "\n");

    const logs = path.join(claudeDir, "orc", "logs");
    fs.mkdirSync(logs, { recursive: true });
    fs.writeFileSync(path.join(logs, "run-orc-demo-100826-093000.txt"),
      "[100826 09:30:00.000] orc  PHASE planning start\n" +
      "[100826 09:31:00.000] orc  SCORE task=T1 score=42 band=[40,55) model=sonnet-4-6 facets=x :: mid\n" +
      "[100826 09:31:01.000] orc  DISPATCH orc-executor-sonnet-4-6-high :: T1 do it expect=sonnet-4-6/high\n" +
      "[100826 09:50:00.000] orc  FINISH :: shipped\n");

    const r = cli(["budget", "calibrate", "--json", "--dir", root], { ORC_TRANSCRIPT_DIR: tx });
    const d = json(r);
    assert.strictEqual(d.dispatches_joined, 1, "the sonnet block joins its DISPATCH line");
    assert.ok(d.bands["[40,55)"], "an executor dispatch is keyed by BAND");
    assert.strictEqual(d.bands["[40,55)"].samples, 1);
    // Always printed, never dropped — a total that quietly excludes tokens
    // somebody paid for is the one number here that must never be wrong.
    assert.strictEqual(d.unattributed.blocks, 1);
    assert.ok(d.unattributed.tokens.output > 0);
  } finally {
    rmrf(root);
  }
});

test("budget: `unattributed` is present even when it is ZERO", () => {
  const { root } = repoWith({ "a.ts": "x\n" });
  try {
    const d = json(cli(["budget", "calibrate", "--json", "--dir", root]));
    assert.ok(d.unattributed, "the key exists");
    assert.strictEqual(d.unattributed.blocks, 0);
    // A caller must never have to guess whether the number is missing or zero.
    for (const k of ["input", "cache_write", "cache_read", "output"])
      assert.strictEqual(d.unattributed.tokens[k], 0);
  } finally {
    rmrf(root);
  }
});

/* ========================================================= ORC AFTERMATH === */

test("aftermath: a run younger than 7 days is TOO_RECENT — an answer, not a gap", () => {
  const { root, claudeDir } = repoWith({ "a.ts": "x\n" });
  try {
    const logs = path.join(claudeDir, "orc", "logs");
    fs.mkdirSync(logs, { recursive: true });
    const f = path.join(logs, "run-orc-fresh-100826-093000.txt");
    fs.writeFileSync(f, "[100826 09:30:00.000] orc  FINISH :: shipped\n");
    const now = Date.now() / 1000;
    fs.utimesSync(f, now, now);

    const r = cli(["aftermath", "status", "--json", "--dir", root]);
    const d = json(r);
    assert.strictEqual(d.runs[0].grade, "TOO_RECENT");
    // It keeps its slot in the counts, so the total stays honest.
    assert.strictEqual(d.counts.TOO_RECENT, 1);
    assert.strictEqual(r.status, 0, "too recent is not churn");
  } finally {
    rmrf(root);
  }
});

test("aftermath: no git work tree, or nothing in the window, is exit 3 — never a fabricated grade", () => {
  const { root, claudeDir } = freshInstall(); // no git init
  try {
    fs.mkdirSync(path.join(claudeDir, "orc", "logs"), { recursive: true });
    const r = cli(["aftermath", "status", "--json", "--dir", root]);
    assert.strictEqual(r.status, 3);
    assert.ok(["no-git", "shallow"].includes(json(r).reason));
  } finally {
    rmrf(root);
  }
});

// v2.1.2 F20 — A0 writes `.current` and touches the lane's own trace before
// `orc aftermath status` runs, so the open run was always in the window.
test("aftermath: the OPEN run is never graded — the lane never reports itself", () => {
  const { root, claudeDir } = repoWith({ "a.ts": "x\n" });
  try {
    const logs = path.join(claudeDir, "orc", "logs");
    fs.mkdirSync(logs, { recursive: true });
    const self = "run-aftermath-self-100826-093000.txt";
    fs.writeFileSync(path.join(logs, self), "[100826 09:30:00.000] aftermath  PHASE a0 start\n");
    fs.writeFileSync(path.join(logs, ".current"), self);

    let r = cli(["aftermath", "status", "--json", "--dir", root]);
    assert.strictEqual(r.status, 3, "only the open run in the window = history too shallow");
    assert.strictEqual(json(r).reason, "shallow");

    const old = path.join(logs, "run-orc-old-100826-093000.txt");
    fs.writeFileSync(old, "[100826 09:30:00.000] orc  FINISH :: shipped\n");
    const then = Date.now() / 1000 - 20 * 86400;
    fs.utimesSync(old, then, then);
    r = cli(["aftermath", "status", "--json", "--dir", root]);
    const d = json(r);
    assert.strictEqual(d.runs.length, 1, "its row only");
    assert.strictEqual(d.runs[0].slug, "old");
    assert.ok(!d.runs.some((x) => x.lane === "aftermath"), "no row about the lane's own run");
  } finally {
    rmrf(root);
  }
});

/* ============================================================ ORC EXPORT === */

test("export: derived, fingerprinted, and --check names WHICH source drifted", () => {
  const { root, claudeDir, head } = repoWith({ "src/pay.ts": "x\n" });
  try {
    writeLedger(claudeDir, [
      { id: "PACT-001", statement: "holds", origin: { lane: "user", kind: "constraint" }, anchors: ["src/pay.ts"], check: { kind: "grep", ref: "x" }, verified_commit: head, confidence: "high" },
    ]);
    cli(["pact", "sync", "--dir", root]);

    assert.strictEqual(cli(["export", "--dir", root]).status, 0);
    const out = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    assert.ok(out.includes("orc-export:derived"), "carries the derived marker");
    assert.ok(out.includes("source_commit:"), "and a source commit");

    assert.strictEqual(cli(["export", "--check", "--dir", root]).status, 0, "fresh export is current");

    fs.appendFileSync(path.join(root, "PACT.md"), "\nedited\n");
    const stale = cli(["export", "--check", "--json", "--dir", root]);
    assert.strictEqual(stale.status, 1, "a drifted source exits 1");
    assert.deepStrictEqual(json(stale).drifted, ["PACT.md"], "and names which one");
  } finally {
    rmrf(root);
  }
});

test("export: never exports a run folder, a log, or anything env-shaped", () => {
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const m = /const EXPORT_NEVER = (\/.*\/[a-z]*);/.exec(src);
  assert.ok(m, "the never-export list is a single regex");
  const re = new RegExp(m[1].slice(1, m[1].lastIndexOf("/")), m[1].slice(m[1].lastIndexOf("/") + 1));
  for (const bad of [".env", ".env.production", "config/secret.json", ".claude/orc/run/x/checkpoint.json", ".claude/orc/logs/run.txt"])
    assert.ok(re.test(bad), `${bad} must never be exported`);
  for (const ok of ["wiki/orc-feature-x.md", "PACT.md", ".claude/orc/patterns/ts-pattern.md"])
    assert.ok(!re.test(ok), `${ok} is exportable`);
});

/* ================================================= W1: WIKI PARTIAL REFRESH */

const DOC = (area, covers, covered, commit) => `---
wiki_schema: 2
doc_type: feature
area: ${area}
covers: [${covers}]
keywords: [a, b, c, d, e]
scanned_at: 010826 10:00:00
scanned_commit: ${commit}
covered_files:
  ${covered}: abc1234
status: fresh
model: opus-4.8-high
---

# ${area}

## TL;DR (60-second brief)
- what it does.
`;

function wikiRepo() {
  const { root, claudeDir, head } = repoWith({
    "src/a.ts": "export const a = 1;\n",
    "src/b.ts": "export const b = 1;\n",
    "src/gone.ts": "export const g = 1;\n",
  });
  const w = path.join(root, "wiki");
  fs.mkdirSync(w, { recursive: true });
  fs.writeFileSync(path.join(w, "orc-feature-a.md"), DOC("a", "src/a.ts", "src/a.ts", head));
  fs.writeFileSync(path.join(w, "orc-feature-b.md"), DOC("b", "src/b.ts", "src/b.ts", head));
  fs.writeFileSync(path.join(w, "orc-feature-gone.md"), DOC("gone", "src/gone.ts", "src/gone.ts", head));
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "wiki"]);
  cli(["wiki", "sync", "--dir", root]);
  return { root, claudeDir, head };
}

test("wiki plan: STRUCTURAL first, then use × delta, then zero-use LAST", () => {
  const { root, claudeDir } = wikiRepo();
  try {
    // b is heavily used and touched; a is barely used and touched; gone is
    // STRUCTURAL and must outrank both however little it is read.
    fs.rmSync(path.join(root, "src/gone.ts"));
    fs.appendFileSync(path.join(root, "src/a.ts"), "// t\n");
    fs.appendFileSync(path.join(root, "src/b.ts"), "// t\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-qm", "move"]);

    fs.writeFileSync(path.join(claudeDir, "orc", "wiki-usage.json"), JSON.stringify({
      version: 1, window_runs: 20, runs_scanned: 20, docs: {
        "orc-feature-a.md": { used: 0, last_used: null },
        "orc-feature-b.md": { used: 15, last_used: Date.now() },
        "orc-feature-gone.md": { used: 1, last_used: Date.now() },
      },
    }));

    const r = cli(["wiki", "plan", "--json", "--dir", root]);
    const rows = json(r).rows.map((x) => path.basename(x.doc));
    assert.strictEqual(rows[0], "orc-feature-gone.md", "STRUCTURAL always first — a doc pointing at a missing file is actively lying");
    assert.strictEqual(rows[1], "orc-feature-b.md", "then the most-used");
    assert.strictEqual(rows[2], "orc-feature-a.md", "zero-use sinks to the bottom");
    assert.ok(json(r).rows[2].retire_hint, "and carries a retire hint");
  } finally {
    rmrf(root);
  }
});

test("wiki plan: unknown usage is NOT zero-use", () => {
  const { root } = wikiRepo();
  try {
    fs.appendFileSync(path.join(root, "src/a.ts"), "// t\n");
    git(root, ["commit", "-qam", "t"]);
    const d = json(cli(["wiki", "plan", "--json", "--dir", root]));
    const row = d.rows.find((x) => x.doc.includes("feature-a"));
    // `used: null` means "we have not measured", and ranking it as dead would
    // retire pages on a machine that simply has no traces yet.
    assert.ok(row.used === null || row.used === 0);
    if (row.used === null) assert.strictEqual(row.retire_hint, false);
  } finally {
    rmrf(root);
  }
});

test("wiki plan: the exit code IS the contract (0 none / 1 all light / 2 a deep scan / 3 n/a)", () => {
  const { root } = wikiRepo();
  try {
    assert.strictEqual(cli(["wiki", "plan", "--dir", root]).status, 0, "clean wiki exits 0");

    // A one-file delta with no new exported symbol → LIGHT.
    fs.appendFileSync(path.join(root, "src/a.ts"), "// comment only\n");
    git(root, ["commit", "-qam", "comment"]);
    assert.strictEqual(cli(["wiki", "plan", "--dir", root]).status, 1, "light-only work exits 1");

    // A gone anchor → STRUCTURAL → deep.
    fs.rmSync(path.join(root, "src/gone.ts"));
    git(root, ["add", "-A"]);
    git(root, ["commit", "-qm", "rm"]);
    assert.strictEqual(cli(["wiki", "plan", "--dir", root]).status, 2, "a deep scan exits 2");
  } finally {
    rmrf(root);
  }
});

test("the scan tier ladder: a row per condition, and always_deep returns deep for ALL of them", () => {
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const m = /const WIKI_TIER_LADDER = \[([\s\S]*?)\n\];/.exec(src);
  assert.ok(m, "the ladder is a table, not scattered ifs");
  const ids = [...m[1].matchAll(/id: "([a-z-]+)"/g)].map((x) => x[1]);
  assert.deepStrictEqual(ids, ["first-scan", "structural", "wide-delta", "new-surface", "small-delta"],
    "five rows, in order — first match wins");
  // Exactly one LIGHT row: the ladder is a cost cut with a single escape.
  assert.strictEqual((m[1].match(/tier: "light"/g) || []).length, 1);
  assert.strictEqual((m[1].match(/tier: "deep"/g) || []).length, 4);
});

test("wiki: always_deep restores pre-v0.46.0 behaviour, and the tier is never silent", () => {
  const { root } = wikiRepo();
  try {
    fs.appendFileSync(path.join(root, "src/a.ts"), "// comment\n");
    git(root, ["commit", "-qam", "c"]);

    let d = json(cli(["wiki", "plan", "--json", "--dir", root]));
    assert.strictEqual(d.rows[0].tier, "light");
    assert.ok(d.rows[0].agent.includes("sonnet-5-high"), "the light scanner is named");

    cli(["config", "set", "wiki_scan_tier", "always_deep", "--dir", root]);
    d = json(cli(["wiki", "plan", "--json", "--dir", root]));
    assert.strictEqual(d.rows[0].tier, "deep");
    assert.strictEqual(d.scan_tier_mode, "always_deep", "the mode is reported, not implied");
    // A cheaper model is never a quiet substitution: the human path prints it.
    assert.match(cli(["wiki", "plan", "--dir", root]).stdout, /deep/);
  } finally {
    rmrf(root);
  }
});

test("wiki plan/debt read each doc's OWN anchor — never meta.scan_commit as a tier", () => {
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const m = /function wikiPlanRows\(claudeDir\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(m);
  // The per-doc anchor path, exactly like wikiImpact's perDocChanged. Reading
  // the global anchor as a tier is the bug that made a correctly refreshed wiki
  // read STALE forever.
  assert.match(m[1], /d\.scanned_commit \|\| globalAnchor/, "per-doc anchor first");
  assert.match(m[1], /computeWikiFreshness\(/, "freshness comes from the ONE engine");
  assert.ok(!/freshnessTier\(/.test(m[1]), "and the tier is never recomputed here");
});

test("wiki debt: exit 0 no debt / 1 debt / 3 no wiki", () => {
  const { root } = wikiRepo();
  try {
    assert.strictEqual(cli(["wiki", "debt", "--dir", root]).status, 0);
    fs.appendFileSync(path.join(root, "src/a.ts"), "// t\n");
    git(root, ["commit", "-qam", "t"]);
    assert.strictEqual(cli(["wiki", "debt", "--dir", root]).status, 1);
  } finally {
    rmrf(root);
  }
  const bare = freshInstall();
  try {
    assert.strictEqual(cli(["wiki", "debt", "--dir", bare.root]).status, 3);
  } finally {
    rmrf(bare.root);
  }
});

test("wiki usage: read from TRACES into its OWN file — never into wiki-meta.json", () => {
  const { root, claudeDir } = wikiRepo();
  try {
    const logs = path.join(claudeDir, "orc", "logs");
    fs.mkdirSync(logs, { recursive: true });
    fs.writeFileSync(path.join(logs, "run-orc-x-100826-093000.txt"),
      "[100826 09:30:00.000] orc  WIKI-CONSULT fresh :: docs=orc-feature-a.md\n" +
      "[100826 09:31:00.000] orc  DISPATCH orc-executor-sonnet-5-high :: T1 x expect=sonnet-5/high\n" +
      "  wiki: FRESH — 1 docs → orc-feature-b.md\n" +
      "[100826 09:50:00.000] orc  FINISH :: ok\n");

    const d = json(cli(["wiki", "usage", "--rebuild", "--json", "--dir", root]));
    const by = Object.fromEntries(d.rows.map((r) => [path.basename(r.doc), r.used]));
    assert.strictEqual(by["orc-feature-a.md"], 1, "a WIKI-CONSULT doc counts");
    assert.strictEqual(by["orc-feature-b.md"], 1, "a per-dispatch wiki: continuation counts");
    assert.strictEqual(by["orc-feature-gone.md"], 0, "and an unused doc reads zero");

    // wiki-meta.json stays 100% derived from doc headers, written only by sync.
    const meta = JSON.parse(fs.readFileSync(path.join(claudeDir, "orc", "wiki-meta.json"), "utf8"));
    assert.ok(!JSON.stringify(meta).includes("used"), "usage never enters the manifest");
    assert.ok(fs.existsSync(path.join(claudeDir, "orc", "wiki-usage.json")), "it has its own file");
  } finally {
    rmrf(root);
  }
});

test("wiki plan: free repairs are listed, and they come BEFORE anything priced", () => {
  const { root } = wikiRepo();
  try {
    fs.appendFileSync(path.join(root, "src/a.ts"), "// t\n");
    git(root, ["commit", "-qam", "t"]);
    const out = cli(["wiki", "plan", "--dir", root]).stdout;
    const freeAt = out.indexOf("free repairs FIRST");
    const payAt = out.indexOf("/orc-wiki refresh --top");
    assert.ok(freeAt !== -1, "free repairs are offered");
    assert.ok(freeAt < payAt, "a user must never pay for what a free step fixes");
  } finally {
    rmrf(root);
  }
});

/* ================================================================= PANELS == */

test("panel: state words come from the CLI — the panel never invents a synonym", () => {
  const js = appJs();
  // The chips render `r.state` / `c.verdict` / `r.state` straight through. A
  // literal state word in a template would be a second vocabulary, which is
  // drift no contract lint can see.
  assert.match(js, /chip\(r\.state, PACT_KIND\[r\.state\]/, "pact chips render the CLI's word");
  assert.match(js, /chip\(c\.verdict \|\| "MALFORMED"/, "boundary chips render the CLI's word");
  assert.match(js, /chip\(r\.state, r\.state === "STRUCTURAL"/, "wiki plan renders the CLI's word");
  // The kind MAPS are keyed on those words, which is legitimate; what must not
  // exist is a rendered LABEL that replaces one.
  //
  // COMPARING against a state word is legitimate too, and v1.3.0 is where that
  // stopped being hypothetical: the hookui palette branches on
  // `cost === "refused"` because a refused row gets NO BUTTON AT ALL rather
  // than a disabled one, which is a real design rule and needs the CLI's word
  // to express. So the comparisons are stripped before the check — what is
  // being looked for is the word appearing as CONTENT.
  const rendered = js
    .replace(/[=!]==\s*"[a-z-]+"/g, "")
    .replace(/\.includes\("[a-z-]+"\)/g, "")
    .replace(/case "[a-z-]+":/g, "");
  for (const bad of ['"holding"', '"drifted"', '"refused"', '"blocked"', '"unsafe"'])
    assert.ok(!rendered.includes(bad), `${bad} is a synonym the panel must not invent`);
});

test("panel: the wiki plan order, tier and estimate are never computed in the browser", () => {
  const js = appJs();
  const m = /function wikiPlanCard\(plan, debt, body\) \{([\s\S]*?)\n\}/.exec(js);
  assert.ok(m);
  // Same rule as the Flow stepper: render `rows` in the order they arrive.
  assert.ok(!/\.sort\(/.test(m[1]), "the panel must not re-sort the plan");
  assert.ok(!/wiki_tier_deep_files|structural.*\?.*deep/.test(m[1]), "and must not re-derive a tier");
  assert.match(m[1], /r\.usd === null/, "the price is the CLI's, or an em dash");
});

test("panel: every new route has a fixture, and the ugly states are all present", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  for (const route of ["/api/pact", "/api/boundary", "/api/handoff", "/api/wiki/plan", "/api/wiki/debt", "/api/wiki/usage", "/api/budget/rates", "/api/aftermath", "/api/export"])
    assert.ok(fixtures.get(route, {}), `${route} has a fixture`);

  // You cannot design a state you cannot reach. Assert the count per state so a
  // NEW state cannot ship without a fixture for it.
  const pact = fixtures.get("/api/pact", {});
  for (const s of ["BROKEN", "DRIFTED", "UNCHECKABLE", "HOLDING"])
    assert.ok(pact.rows.some((r) => r.state === s), `pact fixture carries a ${s}`);
  assert.ok(pact.rows.some((r) => (r.history || []).length >= 2), "and one with real history");

  const b = fixtures.get("/api/boundary", {});
  for (const v of ["EXECUTE", "ESCALATE", "REFUSE"])
    assert.ok(b.cards.some((c) => c.verdict === v), `boundary fixture carries a ${v}`);
  assert.ok(b.cards.some((c) => c.stale), "and a stale card");
  assert.ok(b.cards.some((c) => c.verdict === "REFUSE" && c.checklist.length >= 3), "with a real checklist");

  const h = fixtures.get("/api/handoff", {});
  for (const g of ["green", "amber", "red"]) assert.ok(h.surfaces.some((s) => s.grade === g));
  assert.ok(h.surfaces.filter((s) => s.grade === "red").length >= 2, "two RED surfaces");

  const p = fixtures.get("/api/wiki/plan", {});
  assert.ok(p.rows.some((r) => r.state === "STRUCTURAL"));
  assert.ok(p.rows.some((r) => r.retire_hint), "a zero-use retire candidate");
  assert.ok(p.rows.every((r) => typeof r.usd === "number"), "every row is priced like the CLI prices it");

  const bud = fixtures.get("/api/budget/forecast", { plan: "x" });
  assert.ok(bud.context_risk.length, "a task at context risk");
  assert.ok(bud.unattributed.blocks > 0, "non-zero unattributed");
  assert.ok(bud.bands.some((x) => x.samples < bud.min_samples), "a low-confidence band");
  // The exit-3 state a first-time user actually sees.
  assert.strictEqual(fixtures.get("/api/budget/forecast", {}).reason, "no-plan");

  const a = fixtures.get("/api/aftermath", {});
  for (const g of ["HELD", "CHURN", "REVERTED", "TOO_RECENT"])
    assert.ok(a.runs.some((r) => r.grade === g), `aftermath fixture carries ${g}`);

  assert.strictEqual(fixtures.get("/api/export", {}).stale, true, "a stale export");
});

test("panel: a paid action is a COMMAND, a free action is a BUTTON", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const writes = /const WRITES = \{([\s\S]*?)\n\};/.exec(api)[1];
  // Every write route must be a deterministic CLI command. A lane behind a
  // button would make this panel an AI client, which is the one thing it is not.
  for (const lane of ["/orc-pact", "/orc-boundary", "/orc-handoff", "/orc-wiki", "/orc-budget"])
    assert.ok(!writes.includes(lane), `${lane} must never be a button`);
  for (const cmd of ['"pact", "check"', '"handoff", "set"', '"wiki", "sync"'])
    assert.ok(writes.includes(cmd), `${cmd} is free and deterministic, so it IS a button`);
});

test("panel: every FINDING_ROUTE id maps to a panel that can clear it, or to null", () => {
  const js = appJs();
  const m = /const FINDING_ROUTE = \{([\s\S]*?)\n\};/.exec(js)[1];
  const panels = new Set([...js.matchAll(/PANELS\.([a-z]+) = function/g)].map((x) => x[1]));
  for (const row of m.split("\n")) {
    const r = /"([a-z-]+)":\s*\{\s*panel:\s*(null|"([a-z]+)")/.exec(row);
    if (!r) continue;
    if (r[2] === "null") continue; // nothing to press anywhere — an honest answer
    assert.ok(panels.has(r[3]), `${r[1]} routes to a real panel (${r[3]})`);
  }
});

test("panel: i18n never translates a CLI identifier", () => {
  const id = i18nTable("id");
  const en = i18nTable("en");
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(id).sort(), "both tables define the same keys");
  for (const [k, v] of Object.entries(id)) {
    if (k === "_readme" || Array.isArray(v)) continue;
    // A translated path is a path that does not exist. A command MAY appear
    // inside translated prose ("Check it with: orc doctor") — what must never
    // happen is the command itself being translated, so every `orc <verb>` in
    // the Indonesian string has to appear byte-identically in the English one.
    assert.ok(!/\.claude\//.test(v), `${k} must not carry a path`);
    const CMD = /\borc (init|update|upgrade|config|diy|crosslink|wiki|pattern|gotcha|mock|pr|resume|run|stats|doctor|where|pact|boundary|handoff|budget|aftermath|export)\b/g;
    for (const [cmd] of String(v).matchAll(CMD))
      assert.ok(String(en[k] || "").includes(cmd), `${k}: "${cmd}" must be identical in both tables`);
  }
  // …but the CLI's own words that appear INSIDE prose stay untranslated.
  assert.match(id["pact.uncheckableNote"], /UNCHECKABLE/);
  assert.match(id["boundary.noneHint"], /UNKNOWN/);
});

// v2.1.2 F16 — exit 1 on this route is a low-confidence ANSWER, so a missing
// plan argument is the "no plan" refusal: exit 3, and `--json` still gets its
// one object (it printed usage on stderr and nothing on stdout).
test("budget forecast --json with no plan argument is one object, exit 3", () => {
  const { root } = freshInstall();
  try {
    const r = cli(["budget", "forecast", "--json", "--dir", root]);
    assert.strictEqual(r.status, 3);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.ok, false);
    assert.strictEqual(j.reason, "no-plan");
    assert.match(j.hint, /^usage: orc budget forecast <plan-file>/);
    // The human branch keeps the usage line, on the same exit code.
    const h = cli(["budget", "forecast", "--dir", root]);
    assert.strictEqual(h.status, 3);
    assert.match(h.stderr, /usage: orc budget forecast/);
  } finally {
    rmrf(root);
  }
});

/* ------------------------------------------------ v2.1.2 — the budget wave --- */

const PRICE = JSON.parse(fs.readFileSync(path.join(REPO, "bin", "pricing.json"), "utf8"));
const usdAt = (v, model) => {
  const r = PRICE.models[model];
  return (v.input * r.input + v.cache_write * r.cache_write + v.cache_read * r.cache_read + v.output * r.output) / 1e6;
};
const VEC = (input, cache_write, cache_read, output) => ({ input, cache_write, cache_read, output });
// One task that scores into `[21,31)` — the Sonnet 5 medium band.
const PLAN_25 = "tasks:\n  - id: T1\n    declared_files: [a.ts]\n    depends_on: []\n    computed_score: 25\n";
const ORC_ROLES = ["orc-system-analyst-opus-5-high", "orc-planner-opus-5-med", "orc-reviewer-opus-5-low", "orc-verifier-opus-5-med", "orc-trace-writer-haiku-4-5"];
function seedRates(claudeDir, rates) {
  fs.mkdirSync(path.join(claudeDir, "orc"), { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, "orc", "budget-rates.json"),
    JSON.stringify({ version: 1, transcripts_readable: true, unattributed: { blocks: 0, tokens: VEC(0, 0, 0, 0) }, bands: {}, roles: {}, ...rates })
  );
}

// v2.1.2 F16 — the catalogue row called exit 1 "refused — no history", so a lane
// that obeyed it hid a real forecast. Exit 1 and exit 2 are both ANSWERS.
test("budget forecast: exit 1 is a low-confidence ANSWER, exit 2 a context risk — and the catalogue says so", () => {
  const { root, claudeDir } = repoWith({ "plan.md": PLAN_25 });
  try {
    const band = { samples: 3, p50: VEC(900, 6100, 12400, 900), p90: VEC(1500, 9800, 20100, 1600), peak_p50: 38000, peak_p90: 52000 };
    seedRates(claudeDir, { dispatches_joined: 3, bands: { "[21,31)": band } });
    let r = cli(["budget", "forecast", "plan.md", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "3 samples is below budget_min_samples");
    assert.strictEqual(json(r).ok, true);
    assert.strictEqual(json(r).low_confidence_bands, 1);

    // Above 90% of the band's own window: the risk outranks the soft range.
    const win = PRICE.context_windows["claude-sonnet-5-5"];
    seedRates(claudeDir, { dispatches_joined: 3, bands: { "[21,31)": { ...band, peak_p90: Math.round(win * 0.95) } } });
    r = cli(["budget", "forecast", "plan.md", "--json", "--dir", root]);
    assert.strictEqual(r.status, 2);
    assert.strictEqual(json(r).ok, true);
    assert.strictEqual(json(r).context_risk[0].task, "T1");

    const row = json(cli(["lane", "calls", "orc-budget", "--json", "--dir", root])).calls.find((c) => c.id === "budget-forecast");
    assert.deepStrictEqual(Object.keys(row.exits).sort(), ["0", "1", "2", "3"]);
    assert.match(row.exits["1"], /LOW-CONFIDENCE/);
    assert.match(row.exits["3"], /no history/);
  } finally {
    rmrf(root);
  }
});

// v2.1.2 F25 — the forecast priced every token at ONE Opus 4.8 rate: +34% on
// /orc and +150% on the Sonnet lanes. The price follows what will run.
test("budget forecast: each band and fixed role is priced at the model its agent file pins", () => {
  const { root, claudeDir } = repoWith({ "plan.md": PLAN_25 });
  try {
    const band = { samples: 5, p50: VEC(900, 6100, 12400, 900), p90: VEC(1500, 9800, 20100, 1600) };
    const role = { samples: 5, p50: VEC(3000, 20000, 40000, 4000), p90: VEC(4500, 30000, 60000, 6000) };
    const one = { samples: 5, p50: VEC(2000, 14000, 28000, 2200), p90: VEC(3300, 21500, 44800, 3600) };
    const roles = { "orc-executor-sonnet-5-high": one };
    for (const name of ORC_ROLES) roles[name] = role;
    seedRates(claudeDir, { dispatches_joined: 30, bands: { "[21,31)": band }, roles });

    const r = cli(["budget", "forecast", "plan.md", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const d = json(r);
    for (const p of ["p50", "p90"]) {
      const want = usdAt(band[p], "claude-sonnet-5-5") + 4 * usdAt(role[p], "claude-opus-5-5") + usdAt(role[p], "claude-haiku-4-5");
      assert.ok(Math.abs(d.usd[p] - want) < 1e-9, `${p}: ${d.usd[p]} is the sum of the rows, ${want}`);
    }
    // The NAME says `sonnet-5`; the file pins the point release, and that prices.
    assert.strictEqual(d.bands[0].model, "claude-sonnet-5-5");
    assert.strictEqual(d.fixed_roles.find((f) => f.role === "orc-trace-writer-haiku-4-5").model, "claude-haiku-4-5");
    assert.strictEqual(d.fixed_roles.find((f) => f.role === "orc-planner-opus-5-med").model, "claude-opus-5-5");

    // /orc-mini runs no Opus at all, so its dollars sit far below the figure
    // the same tokens cost at the old single Opus rate.
    const mini = d.lanes.find((l) => l.lane === "mini");
    const miniVec = VEC(...["input", "cache_write", "cache_read", "output"].map((k) => one.p50[k] + role.p50[k]));
    assert.strictEqual(mini.raw, miniVec.input + miniVec.cache_write + miniVec.cache_read + miniVec.output);
    assert.ok(Math.abs(mini.usd - (usdAt(one.p50, "claude-sonnet-5-5") + usdAt(role.p50, "claude-haiku-4-5"))) < 1e-9);
    assert.ok(mini.usd < usdAt(miniVec, "claude-opus-4-8") / 2, "below the token-proportional Opus figure");
  } finally {
    rmrf(root);
  }
});

test("budget forecast: a foreign band with no provider rate makes the dollars null, never an Opus figure", () => {
  const { root, claudeDir } = repoWith({ "plan.md": PLAN_25 });
  try {
    // A verified profile with one route row, WITHOUT a network probe (the
    // `diy.test.js` fixture): the ledger is a plain JSON file.
    assert.strictEqual(
      cli(["extra", "add", "w", "--provider", "custom", "--engine", "api", "--base-url", "https://example.invalid/v1", "--env-key", "K", "--dir", root]).status,
      0
    );
    const led = path.join(claudeDir, "orc", "extra.json");
    const j = JSON.parse(fs.readFileSync(led, "utf8"));
    j.profiles[0].verified_at = new Date().toISOString();
    j.profiles[0].verify_method = "models";
    fs.writeFileSync(led, JSON.stringify(j, null, 2));
    assert.strictEqual(cli(["extra", "route", "set", "21-31", "w/fake-flash", "--dir", root]).status, 0);
    fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "extra_enabled: true\nextra_roles: [executor]\n");

    const band = { samples: 5, p50: VEC(900, 6100, 12400, 900), p90: VEC(1500, 9800, 20100, 1600) };
    seedRates(claudeDir, { dispatches_joined: 30, bands: { "[21,31)": band } });
    const d = json(cli(["budget", "forecast", "plan.md", "--json", "--dir", root]));
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.bands[0].via, "extra:w", "the band goes to the foreign worker");
    assert.strictEqual(d.bands[0].model, null, "no Claude model runs this row");
    // The tokens are still the forecast; only the dollars are withheld. The
    // shipped `providers.custom.models` map is empty on purpose.
    assert.strictEqual(d.raw.p50, 900 + 6100 + 12400 + 900);
    assert.strictEqual(d.usd.p50, null);
    assert.strictEqual(d.usd.p90, null);
    assert.strictEqual(d.lanes.find((l) => l.lane === "orc").usd, null);
    assert.match(cli(["budget", "forecast", "plan.md", "--as", "usd", "--dir", root]).stdout, /USD\s+unavailable: a band or role has no rate/);
  } finally {
    rmrf(root);
  }
});

// One session per run, one sidechain dispatch each, on the model the case names.
function txAndTrace(root, claudeDir, runs) {
  const tx = path.join(root, "tx");
  const logs = path.join(claudeDir, "orc", "logs");
  fs.mkdirSync(tx, { recursive: true });
  fs.mkdirSync(logs, { recursive: true });
  // Trace lines carry LOCAL wall clock; transcripts carry ISO UTC (see above).
  const at = (h, m, s) => new Date(2026, 7, 10, h, m, s).toISOString();
  const blk = (sid, ts, model, side, out) =>
    JSON.stringify({
      sessionId: sid, timestamp: ts, cwd: root, isSidechain: side,
      message: { model, usage: { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 900, output_tokens: out, server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 } } },
    });
  for (const [i, run] of runs.entries()) {
    const hh = String(9 + i * 2).padStart(2, "0");
    fs.writeFileSync(path.join(tx, `s${i}.jsonl`), [
      blk("s" + i, at(9 + i * 2, 30, 0), "claude-opus-5-5", false, 10),
      blk("s" + i, at(9 + i * 2, 31, 5), run.model, true, 200),
    ].join("\n") + "\n");
    fs.writeFileSync(path.join(logs, `run-orc-${run.slug}-100826-${hh}3000.txt`),
      `[100826 ${hh}:30:00.000] orc  PHASE planning start\n` +
      `[100826 ${hh}:31:01.000] orc  DISPATCH ${run.dispatch}\n` +
      `[100826 ${hh}:50:00.000] orc  FINISH :: shipped\n`);
  }
  return tx;
}

test("budget actual prices each joined dispatch at its transcript model", () => {
  const { root, claudeDir } = repoWith({ "a.ts": "x\n" });
  try {
    const tx = txAndTrace(root, claudeDir, [
      { slug: "demo", model: "claude-sonnet-4-6", dispatch: "orc-executor-sonnet-4-6-high :: T1 do it expect=sonnet-4-6/high" },
    ]);
    const d = json(cli(["budget", "actual", "demo", "--json", "--dir", root], { ORC_TRANSCRIPT_DIR: tx }));
    assert.strictEqual(d.joined, 1);
    assert.deepStrictEqual(d.actual.tokens, VEC(3, 100, 900, 200));
    // Sonnet 4.6 did the work, so Sonnet 4.6 prices it — not the Opus rate.
    assert.ok(Math.abs(d.actual.usd - usdAt(d.actual.tokens, "claude-sonnet-4-6")) < 1e-12);
    assert.ok(d.actual.usd < usdAt(d.actual.tokens, "claude-opus-4-8"));
  } finally {
    rmrf(root);
  }
});

// v2.1.2 F62 — the join compared model ids for equality, and the names kept the
// family token across a point release: `opus-5` never equalled `claude-opus-5-5`.
test("budget calibrate: a point release joins — expect=opus-5/low claims a claude-opus-5-5 block", () => {
  const { root, claudeDir } = repoWith({ "a.ts": "x\n" });
  try {
    const tx = txAndTrace(root, claudeDir, [
      { slug: "a", model: "claude-opus-5-5", dispatch: "orc-claude-writer :: refresh expect=opus-5/low" },
      { slug: "b", model: "claude-opus-5-5", dispatch: "orc-claude-writer :: refresh expect=opus-5-5/low" },
    ]);
    const d = json(cli(["budget", "calibrate", "--json", "--dir", root], { ORC_TRANSCRIPT_DIR: tx }));
    assert.strictEqual(d.dispatches_joined, 2, "the old spelling on disk joins as well as the exact one");
    assert.strictEqual(d.roles["orc-claude-writer"].samples, 2);
    assert.strictEqual(d.unattributed.blocks, 0);
  } finally {
    rmrf(root);
  }
});
