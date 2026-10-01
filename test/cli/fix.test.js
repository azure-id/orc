"use strict";
// @test-pool spawn  — shells node bin/cli.js and git
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync, execFileSync } = require("child_process");
const { rmrf, tmpdir } = require("../_helpers");

// ── v2.1.0 W6 — `/orc-fix` and the fixes the review can see (04 §4.2, §5) ────
//
// DE-12 (c): a run open → record only; none → may fix. DE-13 (a): the reviewed
// ranges live in review-scope.jsonl and `miss` is COMPUTED. DE-14 (a): ONE `FIX`
// line in the HOST run's trace, and `.current` is never touched.

const CLI = path.join(__dirname, "..", "..", "bin", "cli.js");
const j = (r) => JSON.parse(r.stdout);
function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    input: input === undefined ? undefined : typeof input === "string" ? input : JSON.stringify(input),
    env: Object.assign({}, process.env, { NO_COLOR: "1", ORC_NO_UPDATE_CHECK: "1", SONAR_TOKEN: "" }),
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}
const GIT_ID = ["-c", "user.email=t@t", "-c", "user.name=t"];
function git(root, ...a) {
  return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function project() {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, ".claude", "orc", "logs"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.ts"), Array.from({ length: 30 }, (_, i) => `const v${i} = ${i};`).join("\n") + "\n");
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, ...GIT_ID, "commit", "-q", "-m", "base");
  return root;
}
// A change to lines 10-20, committed with the given message.
function change(root, msg) {
  const f = path.join(root, "src", "a.ts");
  const lines = fs.readFileSync(f, "utf8").split("\n");
  for (let i = 9; i < 20; i++) lines[i] = `const w${i} = ${i} * 2;`;
  fs.writeFileSync(f, lines.join("\n"));
  git(root, "add", "-A");
  git(root, ...GIT_ID, "commit", "-q", "-m", msg);
}
const p2 = (n, w) => String(n).padStart(w || 2, "0");
const stamp = (d) => `${p2(d.getDate())}${p2(d.getMonth() + 1)}${p2(d.getFullYear() % 100)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.000`;
const logs = (root) => path.join(root, ".claude", "orc", "logs");
// A trace whose window spans now ± 1 h.
function trace(root, name, extra) {
  const t0 = new Date(Date.now() - 3600000);
  const t1 = new Date(Date.now() + 3600000);
  const body = `[${stamp(t0)}] orc      PHASE intake start\n` + (extra || "") + `[${stamp(t1)}] orc      NOTE :: still running\n`;
  fs.writeFileSync(path.join(logs(root), name), body);
  return path.join(logs(root), name);
}
const obsLines = (root) => {
  const f = path.join(root, ".claude", "orc", "observations.jsonl");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const classify = (root, text) => run(["fix", "classify", "--text", text, "--json", "--dir", root]);
const record = (root, body) => run(["fix", "record", "-", "--json", "--dir", root], body);

test("classify: a Sonar rule key → source sonar; no lines → introduced_by unknown", () => {
  const root = project();
  try {
    const r = classify(root, "fix Sonar typescript:S3776 in src/a.ts:10-20");
    assert.strictEqual(r.status, 0, r.stderr);
    const o = j(r);
    assert.strictEqual(o.source, "sonar");
    assert.strictEqual(o.rule, "sonar:typescript:S3776");
    assert.deepStrictEqual(o.lines, [10, 20]);
    assert.strictEqual(o.introduced_by, "human", "a plain base commit: no ORC run, no AI trailer");
    assert.strictEqual(o.mode, "may-fix", "no run is open → it may offer the fix (DE-12 c)");
    assert.strictEqual(o.record.class_by, "evidence");
    const none = j(classify(root, "the cart total is wrong"));
    assert.strictEqual(none.introduced_by, "unknown");
    assert.strictEqual(none.source, "other");
    assert.strictEqual(classify(root, "").status, 2);
  } finally {
    rmrf(root);
  }
});

test("classify: a blame commit inside an ORC run's window and changed set → introduced_by orc", () => {
  const root = project();
  try {
    git(root, "update-ref", "refs/orc/runs/total/pre", "HEAD");
    trace(root, "run-mini-total-290926-101500.txt");
    change(root, "tidy the totals");
    const o = j(classify(root, "fix Sonar typescript:S3776 in src/a.ts:10-20"));
    assert.strictEqual(o.introduced_by, "orc");
    assert.strictEqual(o.run, "run-mini-total-290926-101500");
    assert.ok(o.evidence.some((e) => /changed set/.test(e)), o.evidence.join(" | "));
  } finally {
    rmrf(root);
  }
});

test("classify: a Co-Authored-By Claude trailer and no ORC run → introduced_by ai", () => {
  const root = project();
  try {
    change(root, "speed up totals\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
    const o = j(classify(root, "this bug in src/a.ts:12-14 came from AI-generated code"));
    assert.strictEqual(o.introduced_by, "ai");
    assert.strictEqual(o.source, "defect");
  } finally {
    rmrf(root);
  }
});

test("record: ONE observation, author bot (never orc), and gotcha quality's reviews do not change", () => {
  const root = project();
  try {
    const before = j(run(["gotcha", "quality", "--json", "--dir", root]));
    const r = record(root, { source: "sonar", introduced_by: "orc", run: "run-mini-total-290926-101500", rule: "typescript:S3776", sonar_key: "AX1", path: "src/a.ts", lines: [10, 20] });
    assert.strictEqual(r.status, 0, r.stderr);
    const o = j(r);
    assert.match(o.line, /^recorded F-[0-9a-f]{8} · sonar typescript:S3776 · introduced by ORC \(run-mini-total-290926-101500\) · the next review sees it$/);
    const rows = obsLines(root);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].author, "bot");
    assert.strictEqual(rows[0].via, "orc-fix");
    assert.strictEqual(rows[0].introduced_by, "orc");
    const after = j(run(["gotcha", "quality", "--json", "--dir", root]));
    assert.strictEqual(after.reviews, before.reviews, "a fix is never counted as a review");
    assert.strictEqual(after.fixes.total, 1);
    assert.deepStrictEqual(after.fixes.causes.map((c) => c.id), ["sonar", "orc", "ai", "other"]);
    assert.strictEqual(after.fixes.causes[0].share, 1);
    assert.strictEqual(after.misses.total, 0);
    // An orc author is refused by name, and nothing is written.
    const bad = record(root, { source: "defect", introduced_by: "orc", author: "orc", path: "src/a.ts", lines: [1] });
    assert.strictEqual(bad.status, 2);
    assert.strictEqual(j(bad).field, "author");
    assert.strictEqual(obsLines(root).length, 1);
  } finally {
    rmrf(root);
  }
});

test("record: the Sonar id equals the importer's id; a later import upserts the SAME row and keeps introduced_by", () => {
  const root = project();
  try {
    const r = j(record(root, { source: "sonar", introduced_by: "ai", rule: "typescript:S3776", sonar_key: "AX1", path: "src/a.ts", lines: [10, 20], outcome: "open" }));
    const id = crypto.createHash("sha1").update("sonar|sonar AX1").digest("hex");
    assert.strictEqual(r.obs, id);
    const fx = path.join(root, "sonar.json");
    fs.writeFileSync(
      fx,
      JSON.stringify({
        issues: [{ key: "AX1", rule: "typescript:S3776", component: "shop:src/a.ts", textRange: { startLine: 10, endLine: 20 }, issueStatus: "FIXED", message: "Refactor this function", updateDate: new Date().toISOString() }],
        components: [{ key: "shop:src/a.ts", path: "src/a.ts" }],
      })
    );
    const imp = run(["gotcha", "import", "sonar", "--file", fx, "--json", "--dir", root]);
    assert.strictEqual(imp.status, 0, imp.stdout + imp.stderr);
    const last = obsLines(root).filter((o) => o.obs === id).pop();
    assert.strictEqual(last.outcome, "addressed", "the import adds the outcome");
    assert.strictEqual(last.introduced_by, "ai", "the fix record keeps introduced_by");
    assert.strictEqual(last.via, "orc-fix");
    const list = j(run(["fix", "list", "--json", "--dir", root]));
    assert.strictEqual(list.count, 1, "one row, not two");
  } finally {
    rmrf(root);
  }
});

test("miss: a fix inside a stored review scope of an EARLIER run → miss true, first in the card, and the fix line shows", () => {
  const root = project();
  try {
    const scope = run(["gotcha", "observe", "-", "--json", "--dir", root], { kind: "review-scope", run: "run-mini-total-290926-101500", commit: "abc1234", files: { "src/a.ts": [[5, 30]] } });
    assert.strictEqual(scope.status, 0, scope.stderr);
    assert.strictEqual(j(scope).kind, "review-scope");
    assert.ok(fs.existsSync(path.join(root, ".claude", "orc", "review-scope.jsonl")));
    const r = j(record(root, { source: "sonar", introduced_by: "orc", run: "run-mini-total-290926-101500", rule: "typescript:S3776", sonar_key: "AX2", path: "src/a.ts", lines: [10, 20] }));
    assert.strictEqual(r.miss, true);
    assert.strictEqual(r.missed_by, "run-mini-total-290926-101500");
    assert.match(r.line, /missed by review run-mini-total-290926-101500/);
    const card = j(run(["gotcha", "card", "--files", "src/a.ts", "--full", "--json", "--dir", root]));
    assert.strictEqual(card.rows[0].type, "flag", "the promoted entry leads");
    assert.strictEqual(card.rows[0].miss, true, "a miss is promoted at 1 case and goes first");
    const fixRow = card.rows.find((x) => x.type === "fix");
    assert.ok(fixRow && fixRow.kept, "the fix line is in the card");
    assert.match(card.text, /fix: src\/a\.ts — Sonar typescript:S3776 after ORC run run-mini-total-290926-101500 · missed by review/);
    // A fix outside the reviewed ranges is no miss.
    const out = j(record(root, { source: "defect", introduced_by: "human", path: "src/b.ts", lines: [1, 2], text: "null total" }));
    assert.strictEqual(out.miss, false);
    const q = j(run(["gotcha", "quality", "--json", "--dir", root]));
    assert.strictEqual(q.misses.total, 1);
    assert.strictEqual(q.misses.list[0].missed_by, "run-mini-total-290926-101500");
  } finally {
    rmrf(root);
  }
});

test("card: over the budget, a fix line is COUNTED, never dropped in silence", () => {
  const root = project();
  try {
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "gotcha_card_budget: 200\n");
    const files = [];
    for (let i = 0; i < 14; i++) {
      const f = `src/module-with-a-long-name-${i}/handler-${i}.ts`;
      files.push(f);
      assert.strictEqual(record(root, { source: "defect", introduced_by: "human", path: f, lines: [1, 3], text: `a long description of defect number ${i} in this handler` }).status, 0);
    }
    const card = j(run(["gotcha", "card", "--files", files.join(","), "--full", "--json", "--dir", root]));
    assert.strictEqual(card.rows.filter((r) => r.type === "fix").length, 14, "one fix line per changed file");
    assert.ok(card.rows.some((r) => r.type === "fix" && !r.kept && r.dropped === "token budget"), "some fix lines do not fit");
    assert.strictEqual(card.dropped, card.rows.filter((r) => !r.kept).length);
    assert.match(card.text, /dropped by budget/);
  } finally {
    rmrf(root);
  }
});

test("inflight: a pending dispatch → classify exits 1 and record refuses (exit 1, nothing written)", () => {
  const root = project();
  try {
    const name = "run-quick-total-fix-021026-091200.txt";
    trace(root, name, `[${stamp(new Date())}] hook     SPAWN orc-executor-sonnet-4-6-med\n`);
    fs.writeFileSync(path.join(logs(root), ".current"), name);
    fs.writeFileSync(path.join(logs(root), name + ".pending.json"), JSON.stringify([{ agent: "orc-executor-sonnet-4-6-med", desc: "fix", ts: Date.now() }]));
    const c = classify(root, "fix Sonar typescript:S3776 in src/a.ts:10-20");
    assert.strictEqual(c.status, 1);
    assert.strictEqual(j(c).inflight, "in-flight");
    const r = record(root, { source: "sonar", introduced_by: "human", rule: "typescript:S3776", path: "src/a.ts", lines: [10, 20] });
    assert.strictEqual(r.status, 1);
    assert.strictEqual(j(r).reason, "in-flight");
    assert.strictEqual(obsLines(root).length, 0);
  } finally {
    rmrf(root);
  }
});

test("host run: record writes ONE FIX line into that trace and does not touch .current", () => {
  const root = project();
  try {
    const name = "run-quick-total-fix-021026-091200.txt";
    const tp = trace(root, name);
    const cur = path.join(logs(root), ".current");
    fs.writeFileSync(cur, name);
    fs.writeFileSync(tp + ".pending.json", "[]");
    const old = new Date(Date.now() - 600000);
    fs.utimesSync(cur, old, old);
    const mtime = fs.statSync(cur).mtimeMs;
    const c = j(classify(root, "fix Sonar typescript:S3776 in src/a.ts:10-20"));
    assert.strictEqual(c.mode, "record-only", "a run is open → record only (DE-12 c)");
    assert.strictEqual(c.record.fix_run, "run-quick-total-fix-021026-091200");
    const r = j(record(root, Object.assign({}, c.record, { class_by: "user", introduced_by: "orc" })));
    assert.strictEqual(r.host, "run-quick-total-fix-021026-091200");
    const fixLines = fs.readFileSync(tp, "utf8").split("\n").filter((l) => /\] cli\s+FIX /.test(l));
    assert.strictEqual(fixLines.length, 1);
    assert.match(fixLines[0], /FIX source=sonar introduced_by=orc by=user obs=[0-9a-f]{8} :: src\/a\.ts:10-20 typescript:S3776$/);
    assert.strictEqual(fs.readFileSync(cur, "utf8"), name, ".current is unchanged");
    assert.strictEqual(fs.statSync(cur).mtimeMs, mtime, ".current is never written");
    assert.strictEqual(obsLines(root)[0].class_by, "user");
    // A packet that carries FIX is refused: the CLI writes it, never a packet.
    const pk = run(["trace", "write", "--packet", "-", "--json", "--dir", root], { phase: "q3", events: [{ ts: stamp(new Date()), verb: "FIX source=sonar introduced_by=orc by=user obs=00000000", tail: "src/a.ts:1" }] });
    assert.strictEqual(pk.status, 2);
    assert.match(pk.stdout + pk.stderr, /written by the CLI/);
  } finally {
    rmrf(root);
  }
});

test("review-scope: the store keeps the last 500 reviews and COUNTS what it drops", () => {
  const G = require("../../bin/gotcha.js");
  const root = tmpdir();
  try {
    const claudeDir = path.join(root, ".claude");
    fs.mkdirSync(path.join(claudeDir, "orc"), { recursive: true });
    for (let i = 0; i < G.SCOPE_CAP + 3; i++) {
      const n = G.normalizeScope({ run: `run-orc-r${i}-010126-101010`, files: { "src/a.ts": [[1, 2]] } }, Date.now());
      G.recordScope(claudeDir, n.row);
    }
    const s = G.readScopes(claudeDir);
    assert.strictEqual(s.rows.length, G.SCOPE_CAP);
    assert.strictEqual(s.dropped, 3);
    assert.strictEqual(s.rows[0].run, "run-orc-r3-010126-101010", "the oldest go first");
    assert.ok(G.normalizeScope({ run: "x", files: { "a.ts": [[5, 2]] } }, Date.now()).err, "a reversed range is refused");
  } finally {
    rmrf(root);
  }
});

test("panel: the fixture carries fixes and misses, and the block's words exist in en and id", () => {
  const fx = require("../../bin/webui/fixtures/behaviour.js");
  const q = Object.values(fx).find((v) => v && v.fixes && v.fixes.total > 0) || (fx.gotchaQuality || {});
  assert.ok(q.fixes && Array.isArray(q.fixes.causes), "the fixture has fixes.causes");
  assert.ok(q.misses && Array.isArray(q.misses.list), "the fixture has misses.list");
  for (const code of ["en", "id"]) {
    const t = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "bin", "webui", "i18n", code, "behaviour.json"), "utf8"));
    for (const k of ["behaviour.q.fixes", "behaviour.q.fixesNone", "behaviour.q.misses", "behaviour.q.missedBy", "behaviour.q.cause.sonar", "behaviour.q.cause.orc", "behaviour.q.cause.ai", "behaviour.q.cause.other"])
      assert.ok(t[k], `${code}: ${k}`);
  }
  const panel = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "webui", "js", "panels", "behaviour.js"), "utf8");
  assert.match(panel, /function bhFixes\(/);
  assert.match(panel, /c\.share/, "the bar width is the CLI's share");
});
