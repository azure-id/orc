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
