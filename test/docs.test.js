"use strict";
// @test-pool pure  — reads shipped markdown only
// The `§` pointer guard (v0.48.1).
//
// `knowledge.md` is referenced by `§4x` pointers from ~120 places across
// CLAUDE.md, templates/**, mock-run/** and bin/** comments. Nothing has ever
// checked that those resolve, so a section that got renumbered took every
// pointer to it down silently — and the symptom is a future session reading the
// WRONG section and acting on it, which is worse than reading none.
//
// THE PATTERN IS `§4<letter>` and not `§4.<n>`: `§4.2` in the /orc-challenge
// payload is a section of a FIXTURE DOCUMENT being graded, not an anchor into
// this repo's knowledge base. Matching it would fail on content that is
// deliberately about somebody else's TSD.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { REPO } = require("./_helpers");

const KNOWLEDGE = path.join(REPO, "knowledge.md");
const SEARCH = ["CLAUDE.md", "templates", "mock-run", "bin", "guides"];
const REF = /§\s?(4[a-z](?:\.\d+)*)/g;

function walk(rel, out) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) return out;
  const st = fs.statSync(abs);
  if (st.isFile()) {
    if (/\.(md|js|json|ya?ml)$/.test(abs)) out.push(rel);
    return out;
  }
  for (const e of fs.readdirSync(abs)) walk(path.join(rel, e), out);
  return out;
}

test("every §4x pointer resolves to a heading in knowledge.md", () => {
  // knowledge.md is git-ignored, so a fresh clone legitimately has none. Skip
  // CLEANLY and say so — a clone must never fail on a file it was never given.
  if (!fs.existsSync(KNOWLEDGE)) {
    console.log("    (skipped: knowledge.md is git-ignored and absent — nothing to resolve against)");
    return;
  }

  const km = fs.readFileSync(KNOWLEDGE, "utf8");
  // A heading owns an id if it STARTS with it: `## 4b.1 Analyst evidence gate`
  // and `## 4b. Behavior-trace logging` are two different anchors.
  const headings = new Set();
  for (const m of km.matchAll(/^#{1,4}\s+(4[a-z](?:\.\d+)*)\b/gm)) headings.add(m[1]);
  assert.ok(headings.size >= 20, "knowledge.md must still carry its § headings");

  const files = [];
  for (const s of SEARCH) walk(s, files);

  const broken = new Map();
  for (const rel of files) {
    const src = fs.readFileSync(path.join(REPO, rel), "utf8");
    for (const m of src.matchAll(REF)) {
      const id = m[1];
      if (headings.has(id)) continue;
      // A pointer may name a subsection whose parent survives — that still
      // resolves for a reader, so only a fully unresolvable id is a break.
      const parent = id.split(".")[0];
      if (headings.has(parent)) continue;
      if (!broken.has(id)) broken.set(id, new Set());
      broken.get(id).add(rel);
    }
  }

  assert.deepStrictEqual(
    [...broken.entries()].map(([id, where]) => `§${id} (cited in ${[...where].join(", ")})`),
    [],
    "a § pointer names a section knowledge.md does not have"
  );
});

// v2.1.2 — text fixes F28-F33. Each case pins one sentence that told the lane
// to do something the CLI does not do.
const T = (...p) => fs.readFileSync(path.join(REPO, "templates", ...p), "utf8");
const flat = (s) => s.replace(/\s+/g, " ");

test("F28 orc-doc: the D1 request is logged after `orc doc init`, not at D1", () => {
  const skill = flat(T("skills", "orc-doc", "SKILL.md"));
  assert.ok(!skill.includes("log the request: at **D1**"), "the slug does not exist at D1");
  assert.ok(skill.includes("right after `orc doc init` (D5) log the D1 request"));
  for (const ref of ["gates.md", "resume-protocol.md"]) {
    const t = flat(T("skills", "orc-doc", "references", ref));
    assert.ok(!/calls it at D1|`orc doc log` at D1/.test(t), `${ref} still logs at D1`);
  }
});

test("F29 orc-doc: a D8 edit round confirms the sections it touched", () => {
  const skill = T("skills", "orc-doc", "SKILL.md");
  const d8 = skill.slice(skill.indexOf("## D8 "), skill.indexOf("## D9 "));
  assert.ok(d8.includes("--confirm"), "D8 must run `orc doc parts <slug> --confirm <ids>`");
  assert.ok(flat(T("skills", "orc-doc", "references", "chunking.md")).includes("and after each D8 edit round"));
});

test("F30 orc-doc: a checker reads the part files of its slice, not ONE file", () => {
  const dir = path.join(REPO, "templates", "skills", "orc-doc");
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) files.push(p);
    }
  })(dir);
  const agents = path.join(REPO, "templates", "agents");
  for (const a of fs.readdirSync(agents)) if (a.startsWith("orc-doc-checker")) files.push(path.join(agents, a));
  const bad = files.filter((f) => /one bounded part (file )?(per checker|and nothing|,)/i.test(flat(fs.readFileSync(f, "utf8"))) ||
    /ONE bounded part/.test(flat(fs.readFileSync(f, "utf8"))));
  assert.deepStrictEqual(bad.map((f) => path.relative(REPO, f)), []);
  assert.ok(flat(T("skills", "orc-doc", "SKILL.md")).includes("bounded part files** (`files[]`, one or more)"));
});

test("F31 orc-export: the challenge-cycle source row says it is not read", () => {
  const row = T("skills", "orc-export", "SKILL.md").split("\n").find((l) => l.includes("orc/orc-challenge/<slug>/"));
  assert.ok(row && row.includes("Not read in 2.1.x"), "the row must say the source is not read");
});

test("F32 orc-export: the lane runs --check before a write that overwrites", () => {
  for (const rel of [["skills", "orc-export", "SKILL.md"], ["commands", "orc-export.md"]]) {
    const t = flat(T(...rel));
    assert.ok(!t.includes("rather than overwriting it silently"), `${rel.join("/")} promises a guard the CLI lacks`);
    assert.ok(t.includes("OVERWRITES"), `${rel.join("/")} must say the write overwrites`);
    assert.ok(/ALWAYS runs? `orc export --check --json` first/.test(t), `${rel.join("/")} must run --check first`);
    assert.ok(/asks? the user before/.test(t), `${rel.join("/")} must ask before the write`);
  }
});

test("F33 orc-export: import does not claim a manifest command check", () => {
  for (const rel of [["skills", "orc-export", "SKILL.md"], ["commands", "orc-export.md"]]) {
    const t = flat(T(...rel));
    assert.ok(!t.includes("the manifest does not have"), `${rel.join("/")} describes a check the CLI does not do`);
    assert.ok(t.includes("`seed_invariants[]`") && t.includes("`wrong[]`"));
  }
});

test("knowledge.md's own § ids are unique", () => {
  if (!fs.existsSync(KNOWLEDGE)) {
    console.log("    (skipped: knowledge.md is git-ignored and absent)");
    return;
  }
  const km = fs.readFileSync(KNOWLEDGE, "utf8");
  const seen = new Map();
  for (const m of km.matchAll(/^(#{1,4})\s+(4[a-z](?:\.\d+)*)[.\s]/gm)) {
    const id = m[2];
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  // Two headings claiming one id means `§4z` is ambiguous, and a reader
  // following it lands on whichever came first — which is a coin flip, not a
  // pointer.
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `§${id} × ${n}`);
  assert.deepStrictEqual(dupes, [], "two headings claim the same § id — a pointer to it is a coin flip");
});
