"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, tmpdir } = require("../_helpers");
const H = require("../../bin/habit.js");

// ── The W3 gate: the payload marks and the registry are ONE list ────────────
//
// A lane records a habit answer only at a question marked `(H <qid>)`, and the
// CLI learns only from a qid `ASK_POINTS` knows. The two drift apart silently:
// a marked question the registry lacks is dropped by the parser, and a registry
// row no question marks is a habit that can never form. So the test is two-way,
// and it also pins WHERE each point lives (`ASK_POINTS[qid].file`).

const TEMPLATES = path.join(__dirname, "..", "..", "templates");
const SKILLS = path.join(TEMPLATES, "skills");

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}
// A path as `ASK_POINTS.file` spells it: relative to templates/skills/.
const rel = (p) => path.relative(SKILLS, p).split(path.sep).join("/");

// `(H `a`)` and `(H `a` · `b`)`, then anything (a `;` note, a `:` question).
const MARK_RE = /\(H ((?:`[a-z0-9.-]+`(?:\s*·\s*)?)+)/g;
function marks() {
  const found = new Map(); // qid → Set of files
  for (const f of walk(TEMPLATES)) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(MARK_RE))
      for (const q of m[1].matchAll(/`([a-z0-9.-]+)`/g)) {
        if (!found.has(q[1])) found.set(q[1], new Set());
        found.get(q[1]).add(rel(f));
      }
  }
  return found;
}

test("registry: every (H <qid>) in templates/** is an ASK_POINTS qid, and every qid is marked", () => {
  const found = marks();
  const meta = new Set(H.HABIT_META_QIDS);
  const registry = Object.keys(H.ASK_POINTS);
  const unknown = [...found.keys()].filter((q) => !H.ASK_POINTS[q] && !meta.has(q));
  assert.deepStrictEqual(unknown, [], "marked in templates/, missing from ASK_POINTS");
  const unmarked = registry.filter((q) => !found.has(q));
  assert.deepStrictEqual(unmarked, [], "in ASK_POINTS, marked by no template");
  assert.ok(!found.has("habit.proposal"), "the meta qid is the proposal's own answer, never a question mark");
});

test("registry: each marked qid lives in the file ASK_POINTS names (and each named file marks it)", () => {
  const found = marks();
  for (const [qid, pt] of Object.entries(H.ASK_POINTS)) {
    const want = [].concat(pt.file);
    for (const f of want) assert.ok(fs.existsSync(path.join(SKILLS, f)), `${qid}: file ${f} does not exist`);
    for (const f of found.get(qid) || []) assert.ok(want.includes(f), `${qid} is marked in ${f}, which ASK_POINTS.file does not list`);
    for (const f of want) assert.ok((found.get(qid) || new Set()).has(f), `${qid}: ASK_POINTS.file lists ${f}, which does not mark it`);
  }
});

test("registry: fast.f0.stale-wiki never proposes `continue` (never auto continue)", () => {
  const pt = H.ASK_POINTS["fast.f0.stale-wiki"];
  assert.strictEqual(H.effectiveClass(pt, "continue", {}), "never");
  assert.strictEqual(H.effectiveClass(pt, "refresh", {}), "suggest");
  assert.strictEqual(H.effectiveClass(pt, "mini", {}), "suggest");
});

// ── The W3 gate, static half: `habits: off` costs zero tokens (DE-16) ───────

const HABIT_LANES = ["orc", "orc-mini", "orc-fast", "orc-quick", "orc-diy", "orc-analyze"];

test("zero-token: _shared/habits.md is in no phase manifest, so never an `always` row", () => {
  for (const lane of HABIT_LANES) {
    const r = cli(["lane", "phases", lane, "--json"]);
    assert.strictEqual(r.status, 0, lane);
    const o = JSON.parse(r.stdout);
    for (const f of Object.values(o.phase_files || {})) assert.ok(!/habits\.md/.test(f.file || ""), lane + ": a PHASE_FILES row names habits.md");
    for (const l of o.lanes)
      for (const row of l.phases) assert.ok(!/habits\.md/.test(row.file || ""), `${lane}: phase row ${row.id} (${row.when}) names habits.md`);
  }
});

test("zero-token: every sentence that points at habits.md is conditional on habits{}", () => {
  const hits = [];
  for (const f of walk(TEMPLATES)) {
    if (f.endsWith(path.join("_shared", "habits.md"))) continue;
    const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((l, i) => {
      if (!/habits\.md/.test(l)) return;
      const win = lines.slice(Math.max(0, i - 2), i + 3).join(" ");
      if (!/habits\{\}|habits\.[a-z]/.test(win.replace(/habits\.md/g, ""))) hits.push(`${rel(f)}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(hits, [], "a pointer at habits.md with no `habits{}` condition beside it");
});

// v2.1.0 W5 (A4, A5) — the v2.0.1 rule, now for every lane: the pointer lives
// in the step that READS `orc lane config`, never only in a reference block.
test("the habits pointer sits in the step that reads lane config (fast, analyze, diy, quick, mini)", () => {
  const STEP = {
    "orc-fast": "## Phase F0",
    "orc-analyze": "## Phase A —",
    "orc-diy": "## Step 2",
    "orc-quick": "## Q0",
    "orc-mini": "## Mini flow",
  };
  for (const [lane, heading] of Object.entries(STEP)) {
    const text = fs.readFileSync(path.join(TEMPLATES, "skills", lane, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
    const sections = text.split(/\n(?=## )/);
    const sec = sections.find((s) => s.startsWith(heading));
    assert.ok(sec, `${lane}: no section "${heading}"`);
    assert.match(sec, /lane config/, `${lane}: "${heading}" reads lane config`);
    assert.match(sec, /habits\{\}[^\n]*\n?[^\n]*habits\.md/, `${lane}: "${heading}" carries the habits pointer`);
  }
});

test("zero-token: the default config answers with no `habits` key in any habit lane", () => {
  const root = tmpdir();
  try {
    for (const lane of HABIT_LANES) {
      const r = cli(["lane", "config", lane, "--json", "--no-probes", "--dir", root]);
      assert.strictEqual(r.status, 0, lane);
      assert.ok(!("habits" in JSON.parse(r.stdout)), lane + ": habits{} under the default config");
    }
  } finally {
    rmrf(root);
  }
});
