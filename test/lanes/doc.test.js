"use strict";
/**
 * /orc-doc (v0.48.0).
 *
 * Steps 1–3 of the build order are the whole risk: if the map/splice pair is not
 * byte-exact under adversarial fixtures, nothing above it is safe. So the tests
 * that matter here are the arithmetic ones — contiguous ranges, a bottom-up
 * splice where one section grows and another shrinks, and a refusal when the
 * file moved under us.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { REPO, cli, rmrf, freshInstall, appJs, appCss, panelJs, panelCss } = require("../_helpers.js");

// ── helpers ────────────────────────────────────────────────────────────────

function json(res) {
  return JSON.parse(res.stdout);
}

function initDoc(root, slug, type, extra) {
  const r = cli(["doc", "init", slug, "--type", type || "prd", "--json", "--dir", root, ...(extra || [])]);
  return { res: r, data: r.status === 0 ? json(r) : null };
}

// Fill every SECTION FILE with a body of `n` prose lines. Deliberately
// unwrapped: the lint's hard-wrap rule is an ERROR, and a fixture that trips it
// would make every other assertion here read as a failure.
//
// v0.49.0 — these land in `sections/`, not `.work/`. That folder IS the source
// of truth now, and `document.md` is what `orc doc compile` builds from it.
function writeParts(root, slug, opts) {
  const o = opts || {};
  const show = json(cli(["doc", "show", slug, "--json", "--dir", root]));
  const dir = path.join(root, "orc", "orc-doc", slug, "sections");
  fs.mkdirSync(dir, { recursive: true });
  for (const sec of show.outline) {
    if (o.skip && o.skip.includes(sec.id)) continue;
    const n = (o.lines && o.lines[sec.id]) || 3;
    const body = ["## " + sec.heading, ""];
    // ONE PARAGRAPH, ONE LINE — and therefore a blank line between them. Two
    // consecutive prose lines IS the hard-wrap rule, so a fixture written the
    // other way would trip an ERROR and make every lint assertion below read as
    // a failure of something else.
    for (let i = 0; i < n; i++) body.push(`Line ${i + 1} of ${sec.heading}, written as one unwrapped line.`, "");
    fs.writeFileSync(path.join(dir, sec.id + ".md"), body.join("\n"));
  }
  return show;
}

// Every section file, hash-recorded from a "validated return" — the state a
// wave reaches at its stop sequence. Without it every part is `unconfirmed`,
// which is correct but is not the state most of these fixtures are about.
function confirmAll(root, slug) {
  const ids = json(cli(["doc", "parts", slug, "--json", "--dir", root])).parts.filter((p) => p.exists).map((p) => p.id);
  if (ids.length) cli(["doc", "parts", slug, "--confirm", ids.join(","), "--json", "--dir", root]);
  return ids;
}

// Flip a compiled v2 document back to v1, keeping document.md exactly as it is.
// The extract/splice ALIASES are asserted against this: they must exit
// identically to v0.48.1 on a document that has not migrated yet.
function toV1(root, slug) {
  const statePath = path.join(root, "orc", "orc-doc", slug, "doc.json");
  const d = JSON.parse(fs.readFileSync(statePath, "utf8"));
  d.version = 1;
  fs.writeFileSync(statePath, JSON.stringify(d, null, 2) + "\n");
  fs.mkdirSync(path.join(root, "orc", "orc-doc", slug, ".work"), { recursive: true });
}

// A v1 document on disk: doc.json version 1, one monolithic document.md, and
// nothing under sections/. This is what a document in flight looked like before
// v0.49.0, and every backward-compatibility assertion starts from it.
function makeV1(root, slug, opts) {
  const o = opts || {};
  const dir = path.join(root, "orc", "orc-doc", slug);
  const statePath = path.join(dir, "doc.json");
  const d = JSON.parse(fs.readFileSync(statePath, "utf8"));
  d.version = 1;
  const out = [`# ${d.title}`, ""];
  for (const sec of d.outline) {
    out.push("## " + sec.heading, "");
    if (o.openStub && o.openStub.includes(sec.id)) out.push("> **Open:** nobody has decided this yet", "");
    else out.push(`Body of ${sec.heading} on one unwrapped line.`, "");
  }
  fs.writeFileSync(path.join(dir, "document.md"), out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "") + "\n");
  fs.rmSync(path.join(dir, "sections"), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, ".work"), { recursive: true });
  if (o.extract) {
    fs.writeFileSync(path.join(dir, ".work", o.extract + ".md"), `## ${o.extractHeading}\n\nThe NEWER edit, extracted and never spliced.\n`);
    d.extracts = { [o.extract]: { file: `.work/${o.extract}.md`, hash: "deadbeef", start: 3, end: 6, at: "x" } };
  }
  if (o.resume)
    fs.writeFileSync(
      path.join(dir, "RESUME.md"),
      `# Resume this document\n\n    /orc-doc resume ${slug}\n\n## Where it stands:  /orc-doc · PRD · cycle 1 · 3 of 17 sections written\n`
    );
  fs.writeFileSync(statePath, JSON.stringify(d, null, 2) + "\n");
  return dir;
}

// ── 1. the golden: shipped templates == DOC_TEMPLATES ──────────────────────

test("doc: every shipped template's heading list IS the CLI's batching table", () => {
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const m = src.match(/const DOC_TEMPLATES = (\[[\s\S]*?\n\]);\nconst DOC_TYPES/);
  assert.ok(m, "DOC_TEMPLATES is parseable");
  // eslint-disable-next-line no-eval
  const table = eval(m[1]);
  assert.ok(table.length >= 5, "five base templates ship");

  for (const t of table) {
    const file = path.join(REPO, "templates", "skills", "orc-doc", "references", "templates", t.type + ".md");
    assert.ok(fs.existsSync(file), `templates/${t.type}.md ships`);
    const heads = fs
      .readFileSync(file, "utf8")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => /^##\s/.test(l))
      .map((l) => l.replace(/^##\s+/, "").trim());
    assert.deepStrictEqual(
      heads,
      t.sections.map((s) => s.heading),
      `templates/${t.type}.md must carry exactly DOC_TEMPLATES' headings, in order — ` +
        "a skeleton that disagrees with the batching table plans a document nobody is writing"
    );
  }

  // …and `orc doc templates --json` is that same table, not a third copy.
  const out = json(cli(["doc", "templates", "--json"]));
  assert.deepStrictEqual(
    out.templates.map((x) => x.type),
    table.map((x) => x.type)
  );
});

// ── 2. the map: contiguous, gapless, overlap-free ──────────────────────────

test("doc map: ranges are contiguous, cover the file, and never overlap", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "map-fixture", "prd");
    const slug = data.slug;
    writeParts(root, slug, { lines: { "02-summary": 9, "08-functional-requirements": 21 } });
    assert.strictEqual(cli(["doc", "compile", slug, "--dir", root]).status, 0);

    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    assert.ok(map.sections.length >= 17);
    const text = fs.readFileSync(path.join(root, "orc", "orc-doc", slug, "document.md"), "utf8");
    const lines = text.replace(/\r\n/g, "\n").split("\n");

    for (let i = 0; i < map.sections.length; i++) {
      const s = map.sections[i];
      assert.ok(s.start <= s.end, `${s.id} start <= end`);
      assert.strictEqual(s.lines, s.end - s.start + 1, `${s.id} lines == the range it names`);
      // The heading really is on the line the map says it is.
      assert.match(lines[s.start - 1], /^##\s/, `${s.id} starts on its own heading line`);
      if (i > 0)
        assert.strictEqual(
          s.start,
          map.sections[i - 1].end + 1,
          `${s.id} starts exactly where ${map.sections[i - 1].id} ended — no gap, no overlap`
        );
    }
    assert.strictEqual(map.sections[0].start, map.preamble_end + 1, "the first section starts after the preamble");
    assert.strictEqual(
      map.sections[map.sections.length - 1].end,
      map.lines,
      "the last section runs to the last line of the file"
    );
  } finally {
    rmrf(root);
  }
});

// ── 3. splice, bottom-up, byte-correct ─────────────────────────────────────

test("doc splice: an early section grows and a later one shrinks, and both land exactly", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "splice-fixture", "prd");
    const slug = data.slug;
    writeParts(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);

    const before = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const early = before.sections[1]; // 02-summary
    const late = before.sections[6]; // 07-…
    const folder = path.join(root, "orc", "orc-doc", slug);
    // The extract/splice pair is the V1 shape, kept as an alias for one release.
    // Every other subcommand migrates on sight, so the flip goes last.
    toV1(root, slug);

    assert.strictEqual(cli(["doc", "extract", slug, "--section", early.id, "--dir", root]).status, 0);
    assert.strictEqual(cli(["doc", "extract", slug, "--section", late.id, "--dir", root]).status, 0);

    // +30 lines on the early one, −2 on the later one. If the splice were
    // top-down, the later range would already have shifted by 30 and the write
    // would land in the middle of a neighbour.
    const grown = ["## " + early.heading, ""];
    for (let i = 0; i < 30; i++) grown.push(`Grown line ${i + 1}, one idea and one line.`);
    fs.writeFileSync(path.join(folder, ".work", early.id + ".md"), grown.join("\n") + "\n");
    fs.writeFileSync(path.join(folder, ".work", late.id + ".md"), `## ${late.heading}\n\nShrunk to a single line.\n`);

    const r = cli(["doc", "splice", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);

    const after = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const map = new Map(after.sections.map((s) => [s.id, s]));
    assert.strictEqual(map.get(early.id).lines, 32, "heading + blank + 30 lines");
    assert.strictEqual(map.get(late.id).lines, 3, "heading + blank + 1 line");

    const body = fs.readFileSync(path.join(folder, "document.md"), "utf8").replace(/\r\n/g, "\n").split("\n");
    // Every OTHER section is byte-identical to what it was.
    for (const s of before.sections) {
      if (s.id === early.id || s.id === late.id) continue;
      const now = map.get(s.id);
      assert.ok(now, `${s.id} survived the splice`);
      assert.strictEqual(now.hash, s.hash, `${s.id} was not touched by a splice of two other sections`);
    }
    // And the neighbours still start on their own heading lines.
    for (const s of after.sections) assert.match(body[s.start - 1], /^##\s/, `${s.id} still starts on its heading`);
  } finally {
    rmrf(root);
  }
});

// ── 4. splice refuses on a hash conflict, and names the section ────────────

test("doc splice: REFUSES when the section moved on disk, and names it", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "conflict-fixture", "prd");
    const slug = data.slug;
    writeParts(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const target = map.sections[2];
    const folder = path.join(root, "orc", "orc-doc", slug);
    toV1(root, slug);

    cli(["doc", "extract", slug, "--section", target.id, "--dir", root]);
    // A human types straight into the document while we are working.
    const doc = path.join(folder, "document.md");
    const lines = fs.readFileSync(doc, "utf8").replace(/\r\n/g, "\n").split("\n");
    lines.splice(target.start, 0, "A human typed this in while the part file was out.");
    fs.writeFileSync(doc, lines.join("\n"));
    const beforeBytes = fs.readFileSync(doc, "utf8");

    fs.writeFileSync(path.join(folder, ".work", target.id + ".md"), `## ${target.heading}\n\nRewritten by an agent.\n`);
    const r = cli(["doc", "splice", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "a conflict is exit 1");
    const out = json(r);
    assert.strictEqual(out.reason, "hash-conflict");
    assert.ok(
      out.conflicts.some((c) => c.heading === target.heading),
      "the conflict is reported by SECTION NAME, not by an id or a count"
    );
    assert.strictEqual(fs.readFileSync(doc, "utf8"), beforeBytes, "NOTHING was written — a human's wording is not recoverable from here");
  } finally {
    rmrf(root);
  }
});

// ── 5. the batching rules ──────────────────────────────────────────────────

test("doc plan: never splits a section, never exceeds 2 agents, honours the budget", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "plan-fixture", "tsd");
    const slug = data.slug;
    // A value above the hard cap must be CLAMPED and the clamp announced.
    cli(["config", "set", "doc_max_parallel", "9", "--dir", root]);
    const plan = json(cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]));

    // v0.49.0 lowered the hard cap from 4 to 2.
    assert.strictEqual(plan.parallel, 2, "the hard cap is 2");
    assert.deepStrictEqual(plan.clamped, { from: 9, to: 2 }, "the clamp is DATA, so the panel and the terminal can both say it");

    const seen = new Set();
    for (const w of plan.waves) {
      assert.ok(w.agents.length <= 2, "no wave exceeds the cap");
      for (const a of w.agents) {
        assert.ok(a.sections.length >= 1);
        for (const id of a.sections) {
          assert.ok(!seen.has(id), `${id} appears in exactly one slice — a section is never split across agents`);
          seen.add(id);
        }
        if (!a.oversized)
          assert.ok(a.budget_lines <= plan.budget_lines, `${a.sections.join("+")} is inside the per-agent budget`);
      }
    }
    // Every outline section is planned exactly once.
    const show = json(cli(["doc", "show", slug, "--json", "--dir", root]));
    assert.deepStrictEqual([...seen].sort(), show.outline.map((o) => o.id).sort());

    // The single-oversized-section case is FLAGGED, never quietly dispatched.
    cli(["config", "set", "doc_max_lines_per_agent", "60", "--dir", root]);
    const tight = json(cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]));
    assert.ok(tight.oversized.length, "a section over the cap is reported as a planning smell");
    for (const id of tight.oversized) {
      const slice = tight.waves.flatMap((w) => w.agents).find((a) => a.sections[0] === id);
      assert.strictEqual(slice.oversized, true, "and the slice carries the flag");
      assert.strictEqual(slice.sections.length, 1, "an oversized section is alone in its slice");
    }
  } finally {
    rmrf(root);
  }
});

test("doc plan: an empty result is an ANSWER — same object, exit 1", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "empty-plan", "report");
    const slug = data.slug;
    writeParts(root, slug);
    // A part with no validated return is `unconfirmed` and IS still work.
    confirmAll(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const r = cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "nothing to do is exit 1");
    const out = json(r);
    // Same keys as the work-to-do shape: a caller must never special-case this
    // by parsing prose or by finding half the keys missing.
    for (const k of ["ok", "slug", "role", "agent", "budget_lines", "parallel", "clamped", "waves", "agents", "more_waves", "write_mode", "oversized", "hint", "note"])
      assert.ok(k in out, `the empty result still carries "${k}"`);
    assert.deepStrictEqual(out.waves, []);
    assert.match(out.hint, /\S/);
  } finally {
    rmrf(root);
  }
});

test("doc plan --role check: a checker gets ONE bounded part file, and never shares it", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "check-plan", "report");
    const slug = data.slug;
    writeParts(root, slug);
    confirmAll(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);

    // v2 — the section file IS the unit, so no line arithmetic exists anywhere
    // in the check loop, and no two checkers ever share a file.
    const plan = json(cli(["doc", "plan", slug, "--role", "check", "--json", "--dir", root]));
    assert.strictEqual(plan.agent, "orc-doc-checker-opus-5-low");
    const seenFiles = new Set();
    for (const a of plan.waves.flatMap((w) => w.agents)) {
      assert.ok(Array.isArray(a.files) && a.files.length, "every check slice names its part files");
      assert.strictEqual(a.range, undefined, "and carries no line range at all");
      for (const f of a.files) {
        assert.ok(!seenFiles.has(f), `${f} is read by exactly one checker`);
        seenFiles.add(f);
      }
    }

    // The v1 RANGE form still exists in the CLI, but it is only reachable by a
    // document the migration REFUSED (an unparseable one): `orc doc plan`
    // migrates on sight, so a v1 document never plans as v1 twice.
  } finally {
    rmrf(root);
  }
});

// ── 6/7. the lint, and the target profiles that come from real product limits ──

test("doc lint: the target profile decides, and front matter flips with it", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "lint-fixture", "report", ["--target", "notion"]);
    const slug = data.slug;
    writeParts(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const doc = path.join(root, "orc", "orc-doc", slug, "document.md");
    fs.appendFileSync(doc, "\n#### A heading four levels deep\n\nA sentence.\n");

    const notion = json(cli(["doc", "lint", slug, "--target", "notion", "--json", "--dir", root]));
    assert.ok(
      notion.findings.some((f) => f.rule === "heading-too-deep" && f.severity === "error"),
      "under --target notion an H4 is an ERROR, not a style note"
    );
    assert.ok(
      notion.findings.some((f) => f.rule === "front-matter-banned") === false,
      "…and there is no front matter to ban here"
    );

    // Docusaurus is the one case where the default flips.
    const docu = json(cli(["doc", "lint", slug, "--target", "docusaurus", "--json", "--dir", root]));
    assert.ok(
      docu.findings.some((f) => f.rule === "front-matter-required" && f.severity === "error"),
      "--target docusaurus REQUIRES front matter"
    );
    assert.ok(
      !docu.findings.some((f) => f.rule === "heading-too-deep"),
      "…and it has six heading levels, so the H4 is fine there"
    );

    // Now give it front matter and check generic bans it.
    const body = fs.readFileSync(doc, "utf8");
    fs.writeFileSync(doc, "---\ntitle: x\n---\n" + body);
    const generic = json(cli(["doc", "lint", slug, "--target", "generic", "--json", "--dir", root]));
    assert.ok(
      generic.findings.some((f) => f.rule === "front-matter-banned" && f.severity === "error"),
      "--target generic bans it — Notion and Docs render it as visible junk"
    );
    const docu2 = json(cli(["doc", "lint", slug, "--target", "docusaurus", "--json", "--dir", root]));
    assert.ok(!docu2.findings.some((f) => /front-matter/.test(f.rule)), "and docusaurus is now happy");
  } finally {
    rmrf(root);
  }
});

test("doc lint: the portability rules that actually mangle an import", () => {
  const { root } = freshInstall();
  try {
    const file = path.join(root, "sample.md");
    fs.writeFileSync(
      file,
      [
        "# Title",
        "",
        "## One",
        "",
        "This paragraph is hard wrapped at roughly seventy characters, which is",
        "exactly the mistake every importer turns into a line break.",
        "",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 | 3 |",
        "",
        "<!-- a comment -->",
        "",
        "Some <b>raw html</b> and a [[wikilink]] and a TODO left behind.",
        "",
        "~~~",
        "code",
        "~~~",
        "",
        "![](img/x.png)",
        "",
      ].join("\n")
    );
    const r = cli(["doc", "lint", "sample.md", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "findings is exit 1");
    const rules = new Set(json(r).findings.map((f) => f.rule));
    for (const rule of ["hard-wrap", "ragged-table", "html-comment", "raw-html", "wikilink", "placeholder", "tilde-fence", "image-no-alt"])
      assert.ok(rules.has(rule), `the lint catches ${rule}`);

    // …and it says so about itself, every time. A signal is not a verdict.
    const out = json(r);
    assert.strictEqual(out.honesty.length, 2);
    assert.match(out.honesty[0], /SIGNAL, not a verdict/);
    assert.match(out.honesty[1], /heuristic/);
  } finally {
    rmrf(root);
  }
});

test("doc lint: a clean document is exit 0, and a missing one is exit 2", () => {
  const { root } = freshInstall();
  try {
    const file = path.join(root, "clean.md");
    fs.writeFileSync(file, "# Title\n\n## One\n\nOne short sentence on one line.\n\n## Two\n\nAnother short sentence.\n");
    assert.strictEqual(cli(["doc", "lint", "clean.md", "--dir", root]).status, 0, "clean is 0");
    const missing = cli(["doc", "lint", "nope.md", "--json", "--dir", root]);
    assert.strictEqual(missing.status, 2, "unreadable is 2");
    assert.strictEqual(json(missing).reason, "no-document");
  } finally {
    rmrf(root);
  }
});

// ── 8. exit-code contracts ─────────────────────────────────────────────────

test("doc status: 0 complete · 1 in progress · 2 unknown slug", () => {
  const { root } = freshInstall();
  try {
    assert.strictEqual(cli(["doc", "status", "nothing-here", "--dir", root]).status, 2, "unknown slug is 2");

    const { data } = initDoc(root, "exit-codes", "report");
    const slug = data.slug;
    assert.strictEqual(cli(["doc", "status", slug, "--dir", root]).status, 1, "created but not assembled is 1");

    // Leave one REQUIRED section unwritten: still in progress.
    const show = json(cli(["doc", "show", slug, "--json", "--dir", root]));
    const optional = show.outline.filter((o) => !o.required).map((o) => o.id);
    writeParts(root, slug, { skip: optional });
    // A file with no validated return is `unconfirmed`, and unconfirmed IS work.
    const unconfirmed = cli(["doc", "status", slug, "--json", "--dir", root]);
    assert.strictEqual(unconfirmed.status, 1, "a part nobody confirmed keeps the document in progress");
    assert.ok(
      json(unconfirmed).open_sections.length,
      "and it is NAMED — a half-written section never silently becomes the deliverable"
    );

    confirmAll(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const done = cli(["doc", "status", slug, "--json", "--dir", root]);
    assert.strictEqual(done.status, 0, "every required section written, confirmed, compiled and lint-clean is 0");
    assert.strictEqual(json(done).state, "complete");

    // v0.49.0 — ORC's own bookkeeping in the body is a LINT ERROR now, not a
    // section state. The deliverable carries content only.
    const sections = path.join(root, "orc", "orc-doc", slug, "sections");
    const first = show.outline[1];
    fs.writeFileSync(path.join(sections, first.id + ".md"), `## ${first.heading}\n\n> **Open:** nobody has decided this yet.\n`);
    confirmAll(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const open = cli(["doc", "status", slug, "--json", "--dir", root]);
    assert.strictEqual(open.status, 1, "an annotation left in the body keeps the document in progress");
    assert.ok(json(open).lint.errors > 0, "and it is the FREE check that says so");
  } finally {
    rmrf(root);
  }
});

test("doc list: it may only claim what the disk proves", () => {
  const { root } = freshInstall();
  try {
    assert.strictEqual(cli(["doc", "list", "--dir", root]).status, 0, "an empty list is a normal answer, not an error");
    assert.deepStrictEqual(json(cli(["doc", "list", "--json", "--dir", root])).documents, []);

    const { data } = initDoc(root, "disk-truth", "prd");
    const row = json(cli(["doc", "list", "--json", "--dir", root])).documents[0];
    assert.strictEqual(row.document, "not started", "a missing document.md is NOT STARTED — never `failed`");
    assert.match(row.where, /^Where it stands:  \/orc-doc · PRD · cycle \d+ · \d+ of \d+ sections written$/);
    assert.strictEqual(row.slug, data.slug);
  } finally {
    rmrf(root);
  }
});

// ── 9. rename repair ───────────────────────────────────────────────────────

test("doc map: a renamed heading keeps its section identity and its history", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "rename-fixture", "report");
    const slug = data.slug;
    writeParts(root, slug);
    confirmAll(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const before = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const target = before.sections[3];
    assert.strictEqual(target.state, "written");

    const doc = path.join(root, "orc", "orc-doc", slug, "document.md");
    const text = fs.readFileSync(doc, "utf8");
    fs.writeFileSync(doc, text.replace("## " + target.heading, "## A completely different name"));

    const after = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const moved = after.sections[3];
    assert.strictEqual(moved.heading, "A completely different name");
    assert.strictEqual(moved.renamed_from, target.id, "the repair is REPORTED, not silent");
    // The history followed it: it is `user-edited` (the heading really did
    // change), not `planned`, which is what losing the identity would look like.
    assert.strictEqual(moved.state, "user-edited");
    assert.ok(
      after.repaired.some((r) => r.from === target.id && r.to === moved.id),
      "and the repair is in the payload"
    );

    // Persisted: a second read shows the same identity without re-repairing.
    const again = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    assert.deepStrictEqual(again.repaired, [], "the repair happened once");
    assert.strictEqual(again.sections[3].renamed_from, target.id);
  } finally {
    rmrf(root);
  }
});

// ── assemble ───────────────────────────────────────────────────────────────

test("doc assemble: it refuses while a required part is missing, and NAMES them", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "assemble-gate", "prd");
    const slug = data.slug;
    const show = writeParts(root, slug, { skip: ["03-problem-and-context", "12-risks-and-open-questions"] });
    const r = cli(["doc", "assemble", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 1);
    const out = json(r);
    assert.deepStrictEqual(out.missing.sort(), ["03-problem-and-context", "12-risks-and-open-questions"]);
    assert.ok(!fs.existsSync(path.join(root, "orc", "orc-doc", slug, "document.md")), "and it wrote nothing");
    assert.ok(show.outline.length > 2);
  } finally {
    rmrf(root);
  }
});

test("doc assemble: the template's purpose comments never reach the deliverable", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "purpose-strip", "report");
    const slug = data.slug;
    const show = json(cli(["doc", "show", slug, "--json", "--dir", root]));
    const sections = path.join(root, "orc", "orc-doc", slug, "sections");
    for (const o of show.outline)
      fs.writeFileSync(
        path.join(sections, o.id + ".md"),
        `## ${o.heading}\n\n<!-- purpose: ${o.purpose} -->\n\nA line of prose.\n`
      );
    cli(["doc", "compile", slug, "--dir", root]);
    const body = fs.readFileSync(path.join(root, "orc", "orc-doc", slug, "document.md"), "utf8");
    assert.ok(!/purpose:/.test(body), "the writer's instructions are stripped");
    assert.ok(!/<!--/.test(body), "and an HTML comment is a lint error anyway");
  } finally {
    rmrf(root);
  }
});

test("doc assemble: the same parts always produce the same file", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "deterministic", "workflow");
    const slug = data.slug;
    writeParts(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const doc = path.join(root, "orc", "orc-doc", slug, "document.md");
    const first = fs.readFileSync(doc, "utf8");
    cli(["doc", "compile", slug, "--dir", root]);
    assert.strictEqual(fs.readFileSync(doc, "utf8"), first, "assemble is deterministic");
  } finally {
    rmrf(root);
  }
});

// ── init: the gates the CLI enforces so a skill cannot skip them ───────────

test("doc init: a type is required, and a template with no headings is refused", () => {
  const { root } = freshInstall();
  try {
    const noType = cli(["doc", "init", "x", "--json", "--dir", root]);
    assert.strictEqual(noType.status, 2);
    assert.strictEqual(json(noType).reason, "no-type");

    const badType = cli(["doc", "init", "x", "--type", "novel", "--json", "--dir", root]);
    assert.strictEqual(json(badType).reason, "bad-type");

    // A structure is NEVER guessed out of prose.
    const prose = path.join(root, "prose.md");
    fs.writeFileSync(prose, "Just some prose with no headings at all.\n");
    const noHeads = cli(["doc", "init", "x", "--type", "prd", "--template", "prose.md", "--json", "--dir", root]);
    assert.strictEqual(json(noHeads).reason, "no-headings");

    // A supplied template REPLACES the shipped one entirely — never a merge.
    const mine = path.join(root, "mine.md");
    fs.writeFileSync(mine, "# Mine\n\n## Alpha\n\n## Beta\n\n## Gamma\n");
    const ok = json(cli(["doc", "init", "mine", "--type", "prd", "--template", "mine.md", "--json", "--dir", root]));
    assert.deepStrictEqual(
      ok.outline.map((o) => o.heading),
      ["Alpha", "Beta", "Gamma"],
      "the user's headings BECOME the outline; none of the shipped PRD sections survive"
    );

    // A second init on the same slug is refused, not silently merged.
    const again = cli(["doc", "init", ok.slug, "--type", "prd", "--template", "mine.md", "--json", "--dir", root]);
    assert.strictEqual(again.status, 1);
    assert.strictEqual(json(again).reason, "exists");
  } finally {
    rmrf(root);
  }
});

test("doc: it is project-scoped — --global is refused, never reinterpreted", () => {
  const r = cli(["doc", "list", "--global"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /project-scoped/);
});

// ── the section-state word list, mirrored in the reference ─────────────────

test("doc: DOC_STATES and references/chunking.md name the same states", () => {
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const m = src.match(/const DOC_STATES = \[([\s\S]*?)\];/);
  assert.ok(m, "DOC_STATES is parseable");
  const states = [...m[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1]);
  const ref = fs.readFileSync(
    path.join(REPO, "templates", "skills", "orc-doc", "references", "chunking.md"),
    "utf8"
  );
  const row = ref.match(/`state`\*\* ∈ `([^`]+)`/);
  assert.ok(row, "chunking.md states the list");
  assert.deepStrictEqual(
    row[1].split("|").map((s) => s.trim()),
    states,
    "a word list is not a single token, so the contract lint cannot see this — the golden test can"
  );
});

// ── the section reveal: ONE section, on an explicit request ────────────────

test("doc show --section: exactly one section's text, and an unknown id is exit 2", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "reveal", "report");
    const slug = data.slug;
    writeParts(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const s = map.sections[2];

    const one = json(cli(["doc", "show", slug, "--section", s.id, "--json", "--dir", root]));
    assert.strictEqual(one.section, s.id);
    assert.strictEqual(one.lines, s.lines);
    assert.match(one.text, new RegExp("^## " + s.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    // It is ONE section, not the file: nothing from a neighbour rides along.
    assert.ok(!one.text.includes("## " + map.sections[3].heading));

    const bad = cli(["doc", "show", slug, "--section", "99-nope", "--json", "--dir", root]);
    assert.strictEqual(bad.status, 2);
    assert.strictEqual(json(bad).reason, "no-such-section");
  } finally {
    rmrf(root);
  }
});

// ── the panel (v0.48.0) ────────────────────────────────────────────────────
// Same rule as the Flow stepper and the Challenge panel: it draws `--json` and
// decides nothing about it.

test("docs panel: it derives no section state of its own", () => {
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const states = [...(src.match(/const DOC_STATES = \[([\s\S]*?)\];/) || ["", ""])[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  const panel = panelJs("docs");

  // Whatever the panel KEYS on must be a state the CLI can actually emit.
  const keyed = [...(panel.match(/const DOC_STATE_KIND = \{([\s\S]*?)\n\};/) || ["", ""])[1].matchAll(/"?([a-z-]+)"?:/g)].map((m) => m[1]);
  assert.deepStrictEqual(keyed.sort(), [...states].sort(), "the panel's state map IS the CLI's state list");

  // It must not name a template type, a target id, an agent or a lint rule —
  // every one of those arrives from --json.
  for (const literal of ["orc-doc-writer-opus-5-med", "orc-doc-checker-opus-5-low", "hard-wrap", "heading-too-deep", "docusaurus"])
    assert.ok(!panel.includes('"' + literal + '"'), `the panel must not name ${literal} — the CLI emits it`);

  // A paid action is never a button: writing or checking a section has no route.
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const writes = (api.match(/const WRITES = \{[\s\S]*?\n\};/) || [""])[0];
  assert.ok(!/orc-doc"/.test(writes) && !/"\/api\/doc\/plan"/.test(writes), "no lane invocation may be a write route");
  assert.ok(writes.includes("doc/assemble"), "assemble is free and deterministic, so it is a real button");
  // v0.49.0 — compile and migrate are both FREE and non-destructive, so both
  // are buttons. `orc doc mode` deliberately is NOT: it is a user decision the
  // skill asks (the `orc doc log` precedent).
  assert.ok(writes.includes("doc/compile"), "compile is free, so it is a real button");
  assert.ok(writes.includes("doc/migrate"), "migrate is free and never deletes document.md, so it is a real button");
  assert.ok(!writes.includes("doc/mode"), "the write mode is a USER decision the skill asks, never a panel toggle");
  // …and `parts` is a READ.
  assert.ok(/"\/api\/doc\/parts"/.test(api), "the section files are a read route");
});

test("docs fixtures: one of every section state, and the ugly ones", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const states = [...(src.match(/const DOC_STATES = \[([\s\S]*?)\];/) || ["", ""])[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  const sections = fixtures.get("/api/doc/map", {}).sections;
  for (const s of states)
    assert.ok(sections.some((x) => x.state === s), `a ${s} section must be designable`);

  // A repaired rename, and a section carrying findings.
  assert.ok(sections.some((s) => s.renamed_from), "a repaired rename must be designable");
  assert.ok(sections.some((s) => s.findings > 0), "a section with findings must be designable");
  assert.ok(fixtures.get("/api/doc/map", {}).repaired.length, "…and the repair is in the payload");

  const docs = fixtures.get("/api/doc", {}).documents;
  assert.ok(docs.some((d) => d.document === "not started"), "a document with nothing assembled must be designable");
  assert.ok(docs.some((d) => (d.user_edited || []).length), "the you-edited-it chip must be designable");
  assert.ok(docs.some((d) => d.sections_total >= 40), "ribbon overflow needs a document long enough to overflow");
  assert.ok(docs.some((d) => d.language !== "en"), "a non-English document must be designable");

  // Every state the CLI can compute, including the two v0.48.1 added. A state
  // with no fixture is a state nobody has ever looked at — and you cannot
  // design a `shipped-drifted` chip on a document that never shipped.
  const statuses = ["complete", "in-progress", "not-started", "shipped", "shipped-drifted"];
  for (const st of statuses)
    assert.ok(
      docs.some((d) => (fixtures.get("/api/doc/one", { slug: d.slug }) || {}).state === st),
      `a ${st} document must be designable`
    );

  // ── v0.49.0 — the section files, and the ugly ones ────────────────────────
  const allStatuses = docs.map((d) => fixtures.get("/api/doc/one", { slug: d.slug })).filter(Boolean);
  assert.ok(allStatuses.some((s) => s.version === 1), "a v1 document awaiting migration must be designable");
  assert.ok(allStatuses.some((s) => (s.document_stale || []).length), "a document behind its own sections must be designable");
  assert.ok(allStatuses.some((s) => s.wave && s.wave.done < s.wave.total), "a PAUSED wave must be designable");
  assert.ok(allStatuses.some((s) => s.write_mode === "partial"), "partial mode must be designable");

  const partsSets = docs.map((d) => fixtures.get("/api/doc/parts", { slug: d.slug })).filter(Boolean);
  const rows = partsSets.flatMap((p) => p.parts);
  for (const st of states)
    if (st !== "open")
      assert.ok(rows.some((r) => r.state === st), `a ${st} PART must be designable`);
  assert.ok(rows.some((r) => r.nested && r.subsections.length), "a section stored as sub-parts must be designable");
  assert.ok(rows.some((r) => (r.subsections || []).some((x) => x.changed)), "…and ONE changed sub-part, which is what makes a re-check cheap");
  assert.ok(rows.some((r) => !r.exists), "a not-written-yet row KEEPS ITS SLOT, so it must be designable");
  assert.ok(rows.some((r) => !r.ordinal_ok), "a misnumbered part must be designable");
  assert.ok(partsSets.some((p) => p.wave === null), "a document with no plan yet must be designable");

  // And the ugly halves of each: a FORCED ship with its verbatim reason, a
  // drift that NAMES its sections, a journal with nothing recorded (the gap
  // rows), a reference file that moved, and a D2 answered "none".
  const drifted = docs.map((d) => fixtures.get("/api/doc/one", { slug: d.slug })).find((s) => s && s.state === "shipped-drifted");
  assert.ok(drifted.shipped.forced, "a forced ship must be designable");
  assert.ok(drifted.shipped.force_reason, "…and it carries the reason verbatim");
  assert.ok(drifted.drifted_sections.length, "a drift NAMES its sections, never just that something changed");

  const journals = docs.map((d) => fixtures.get("/api/doc/journal", { slug: d.slug }));
  assert.ok(journals.some((j) => j.recorded > 0), "a rich multi-session journal must be designable");
  assert.ok(journals.some((j) => j.recorded === 0 && j.gaps > 0), "…and one with NOTHING recorded, so the gap rows are too");

  const contexts = docs.map((d) => fixtures.get("/api/doc/context", { slug: d.slug }));
  const srcStates = new Set(contexts.flatMap((c) => (c.context.sources || []).map((s) => s.state)));
  for (const want of ["ok", "SOURCE-DRIFTED", "MISSING"]) assert.ok(srcStates.has(want), `a ${want} reference file must be designable`);
  assert.ok(contexts.some((c) => !(c.context.sources || []).length), 'a D2 answered "none" must be designable — it is an ANSWER and keeps its slot');

  // `orc doc next` in all three shapes: free, paid, and blocked on a human.
  const nexts = docs.map((d) => fixtures.get("/api/doc/next", { slug: d.slug }));
  assert.ok(nexts.some((n) => n.command && !n.paid), "a FREE next action must be designable — it renders as a button");
  assert.ok(nexts.some((n) => n.command && n.paid), "a PAID next action must be designable — it renders as a copy-able command");
  assert.ok(nexts.some((n) => n.blocked_by && !n.command), "a next BLOCKED on a human must be designable — it renders as neither");

  const audits = docs.map((d) => fixtures.get("/api/doc/audit", { slug: d.slug }));
  assert.ok(audits.some((a) => a.clean), "a clean audit must be designable — it is a one-line answer, not an empty card");
  const dirty = audits.find((a) => !a.clean);
  assert.ok(dirty, "and a dirty one");
  assert.ok(dirty.findings.some((f) => f.panel === null), "a finding with nowhere to go must be designable — it gets NO button, not a useless one");
  for (const f of dirty.findings) assert.ok(f.fix, `${f.id} must name a command that clears it`);

  // A lint-RED card, a clamp, and an oversized slice — none of which exist on a
  // healthy document.
  const lint = fixtures.get("/api/doc/lint", {});
  assert.ok(lint.errors > 0, "a lint-RED health card must be designable");
  assert.ok(lint.findings.some((f) => f.severity === "warn"), "…and a warning beside it");
  const plan = fixtures.get("/api/doc/plan", {});
  assert.ok(plan.clamped, "the doc_max_parallel clamp must be designable");
  assert.ok(plan.oversized.length, "an over-budget slice must be designable");
});

test("docs panel: the ribbon animations are REMOVED under reduced motion", () => {
  const css = appCss();
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  // Capping an iteration count would freeze a segment mid-`scaleY`, and a
  // segment drawn at 40% height misreports the line count it is drawn from.
  assert.match(block, /\.doc-seg[^{]*\{[^}]*animation:\s*none/, "the ribbon's animations are removed, not capped");
  assert.match(block, /\.doc-bar-seg/, "and so is the health bar's growth");

  // Every scrolling box gets BOTH syntaxes — neither falls back to the other.
  for (const sel of [".doc-ribbon-wrap", ".doc-reveal"]) {
    assert.match(css, new RegExp(sel.replace(".", "\.") + "[^{]*\{[^}]*scrollbar-color:[^}]*transparent"), `${sel} sets a transparent track for Firefox`);
    assert.match(css, new RegExp(sel.replace(".", "\.") + "::-webkit-scrollbar-track \{ background: transparent"), `${sel} sets a transparent track for WebKit`);
  }
});

// ── v0.48.1: the score, the finish line, the drift report, the memory ──────
//
// Everything below rests on the lane's existing constitution — the
// orchestrator never reads the document body, the context is frozen, no line
// number is ever stored, `doc.json` has exactly one writer — and one added
// here: THE JOURNAL NEVER INVENTS AN ENTRY.

// A document with a frozen brief, every section written, and one supporting
// file whose hash was recorded at freeze time.
function shipReady(root, slug) {
  const dir = path.join(root, "orc", "orc-doc", slug);
  fs.writeFileSync(path.join(root, "policy.md"), "# Policy\n\nOriginal.\n");
  const sha = require("crypto").createHash("sha256").update("# Policy\n\nOriginal.").digest("hex");
  fs.writeFileSync(
    path.join(dir, "context.md"),
    "# Context — " + slug + "\n<!-- frozen 16-08-2026 · cycle 1 · do not edit by hand -->\n\n" +
      "## The request (verbatim)\n> write the refund PRD, and do not invent the SLA\n\n" +
      "## Purpose (D4)\n- **Intent:** hand to a backend team\n- **Audience:** backend engineers\n\n" +
      "## Supporting documents (D2)\n| Path | Read? | Digest |\n|---|---|---|\n| policy.md | yes | context-sources.md §1 |\n"
  );
  fs.writeFileSync(
    path.join(dir, "context-sources.md"),
    "<!-- source: policy.md sha: " + sha + " -->\n\n## 1. policy.md\nRefunds within 30 days.\n"
  );
  writeParts(root, slug);
  // The wave's stop sequence: validate the returns, THEN record the hashes.
  // Without it every part is `unconfirmed` and the document is correctly, and
  // unhelpfully, never finished.
  confirmAll(root, slug);
  cli(["doc", "mode", slug, "--set", "all", "--dir", root]);
  assert.strictEqual(cli(["doc", "compile", slug, "--dir", root]).status, 0);
  return dir;
}

test("doc next: the exit code IS the contract, and it names the human decision", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "score", "prd").data.slug;

    // No frozen brief → 1, and `blocked_by` is never a generic "waiting".
    let n = cli(["doc", "next", slug, "--json", "--dir", root]);
    assert.strictEqual(n.status, 1, "a human decision exits 1");
    let d = json(n);
    assert.strictEqual(d.phase, "D1");
    assert.match(d.blocked_by, /context\.md/, "it must name WHAT is blocking, in one sentence");
    assert.strictEqual(d.command, null, "a blocked step offers no command to run");

    shipReady(root, slug);
    n = cli(["doc", "next", slug, "--json", "--dir", root]);
    assert.strictEqual(n.status, 0, "an available action exits 0");
    d = json(n);
    assert.ok(d.command, "an available action always names its command");
    assert.strictEqual(typeof d.paid, "boolean", "paid decides button vs copy-able command in the panel");

    // 2 = unknown slug, the pattern-status / diy-status convention.
    assert.strictEqual(cli(["doc", "next", "nope", "--json", "--dir", root]).status, 2);
  } finally {
    rmrf(root);
  }
});

test("doc next: every command it can emit is a real `orc doc` subcommand", () => {
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  // The dispatch table is the registry: a `case "x":` inside doc()'s switch.
  const fn = src.slice(src.indexOf("\nfunction doc() {"), src.indexOf("\nfunction where()"));
  const subs = new Set([...fn.matchAll(/case "([a-z]+)":/g)].map((m) => m[1]));
  assert.ok(subs.size >= 15, "the dispatch table parsed");

  const next = src.slice(src.indexOf("function docNextAction"), src.indexOf("function docNextCmd"));
  const emitted = [...next.matchAll(/`orc doc ([a-z]+)[^`]*`/g)].map((m) => m[1]);
  assert.ok(emitted.length >= 5, "next emits commands");
  for (const s of new Set(emitted))
    assert.ok(subs.has(s), "`orc doc next` can emit \"orc doc " + s + "\", which is not a real subcommand");

  // And every phase it can report is a phase SKILL.md documents. Compared
  // file-to-code, so a phase added to one and not the other fails here.
  const skill = fs.readFileSync(path.join(REPO, "templates", "skills", "orc-doc", "SKILL.md"), "utf8");
  const documented = new Set([...skill.matchAll(/^## (D\d)\b/gm)].map((m) => m[1]));
  for (const p of new Set([...next.matchAll(/\b(?:A|BLOCK)\("(D\d)"/g)].map((m) => m[1])))
    assert.ok(documented.has(p), "next reports phase " + p + ", which SKILL.md does not document");
});

test("doc ship: --where has NO DEFAULT, and an incomplete ship needs a reason", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "shipme", "prd").data.slug;

    // Incomplete AND no --where: --where is checked first, because a
    // destination is the thing that makes "shipped" a fact at all.
    let r = cli(["doc", "ship", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 2);
    assert.strictEqual(json(r).reason, "no-where");
    assert.match(json(r).hint, /--where/, "the refusal must NAME the flag");

    r = cli(["doc", "ship", slug, "--where", "Notion", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "an incomplete document refuses to ship");
    assert.strictEqual(json(r).reason, "not-complete");
    assert.ok(json(r).open_sections.length, "and it NAMES the open sections");

    r = cli(["doc", "ship", slug, "--where", "Notion", "--force", "--json", "--dir", root]);
    assert.strictEqual(json(r).reason, "no-force-reason", "--force alone is not consent");

    r = cli(["doc", "ship", slug, "--where", "Notion", "--force", "--reason", "deadline", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(json(r).shipped.forced, true);
    assert.strictEqual(json(r).shipped.force_reason, "deadline", "the override reason is recorded verbatim");
  } finally {
    rmrf(root);
  }
});

test("doc ship: shipped → shipped-drifted after one byte, and the section is NAMED", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "drifty", "prd").data.slug;
    shipReady(root, slug);

    assert.strictEqual(cli(["doc", "ship", slug, "--where", "Notion › Platform", "--dir", root]).status, 0);
    let s = json(cli(["doc", "status", slug, "--json", "--dir", root]));
    assert.strictEqual(s.state, "shipped");
    assert.deepStrictEqual(s.drifted_sections, []);

    // `shipped` is a 0 — there is nothing to do.
    assert.strictEqual(cli(["doc", "status", slug, "--dir", root]).status, 0);

    const doc = path.join(root, "orc", "orc-doc", slug, "document.md");
    const before = fs.readFileSync(doc, "utf8");
    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const target = map.sections[2];
    fs.writeFileSync(doc, before.replace("Line 1 of " + target.heading, "Line 1 of " + target.heading + " (edited)"));

    const r = cli(["doc", "status", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "shipped-drifted is a 1: the document moved after it was delivered");
    s = json(r);
    assert.strictEqual(s.state, "shipped-drifted");
    assert.deepStrictEqual(
      s.drifted_sections.map((x) => x.id),
      [target.id],
      "COVERAGE-RELATIVE: it names the section that moved, not just that something did"
    );
  } finally {
    rmrf(root);
  }
});

test("doc unship: needs a reason, and preserves ship_history", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "undo", "prd").data.slug;
    const dir = shipReady(root, slug);
    cli(["doc", "ship", slug, "--where", "Slack #platform", "--dir", root]);

    let r = cli(["doc", "unship", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 2);
    assert.strictEqual(json(r).reason, "no-reason");

    r = cli(["doc", "unship", slug, "--reason", "the squad asked for one more section", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    const d = JSON.parse(fs.readFileSync(path.join(dir, "doc.json"), "utf8"));
    assert.strictEqual(d.shipped, null);
    assert.strictEqual(d.ship_history.length, 1, "nothing is ever silently erased");
    assert.strictEqual(d.ship_history[0].where, "Slack #platform");
    assert.match(d.ship_history[0].unship_reason, /one more section/);
  } finally {
    rmrf(root);
  }
});

test("doc: docWhereLine's PREFIX is byte-stable with and without a ship record", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "whereline", "prd").data.slug;
    shipReady(root, slug);
    const before = json(cli(["doc", "status", slug, "--json", "--dir", root])).where;
    cli(["doc", "ship", slug, "--where", "Notion", "--dir", root]);
    const after = json(cli(["doc", "status", slug, "--json", "--dir", root])).where;

    // `orc doc list` parses the prefix — that is how a listing never has to
    // open doc.json. v0.48.1 appends a SUFFIX and touches nothing before it.
    // The PREFIX is what a listing parses. v0.48.1 appends the ship suffix and
    // v0.49.0 appends phase/wave after it — neither may touch the prefix.
    const prefix = /^Where it stands:  \/orc-doc · PRD · cycle \d+ · \d+ of \d+ sections written/;
    assert.match(before, prefix);
    assert.match(after, prefix);
    assert.strictEqual(before.match(prefix)[0], after.match(prefix)[0], "the parsed prefix is byte-identical either way");
    assert.match(after, / · shipped \d{2}-\d{2}-\d{4} → Notion/);
    // …and `parseStands` — the real one — still reads it.
    const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
    // eslint-disable-next-line no-eval
    const parseStands = eval("(" + src.match(/function parseStands\(text\) \{[\s\S]*?\n\}/)[0] + ")");
    assert.strictEqual(parseStands(after).lane, "/orc-doc");
  } finally {
    rmrf(root);
  }
});

test("doc audit: it detects each drift class, and user-edited is NOT one of them", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "audited", "prd").data.slug;
    const dir = shipReady(root, slug);
    const doc = path.join(dir, "document.md");

    assert.strictEqual(cli(["doc", "audit", slug, "--dir", root]).status, 0, "a clean document audits clean");

    // ship-drifted + source-drifted, from a hand edit straight into the artifact
    cli(["doc", "ship", slug, "--where", "Notion", "--dir", root]);
    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    fs.writeFileSync(doc, fs.readFileSync(doc, "utf8").replace("Line 1 of " + map.sections[1].heading, "changed"));
    fs.writeFileSync(path.join(root, "policy.md"), "# Policy\n\nCHANGED.\n");

    // v0.49.0 — document-stale: a section file moved and nothing rebuilt.
    const sections = path.join(dir, "sections");
    const stale = map.sections[3];
    fs.appendFileSync(path.join(sections, stale.id + ".md"), "\nA line added straight into the section file.\n");

    // part-missing: a required section whose source file is gone.
    const gone = map.sections[5];
    fs.unlinkSync(path.join(sections, gone.id + ".md"));

    // section-unlisted: a heading nobody planned.
    fs.appendFileSync(doc, "\n## Appendix nobody planned\n\nText.\n");
    // annotation-in-body: ORC's own bookkeeping, in the deliverable.
    fs.appendFileSync(doc, "\n> **Open:** nobody decided the fraud limit\n");

    const r = cli(["doc", "audit", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 1);
    const ids = new Set(json(r).findings.map((f) => f.id));
    for (const want of ["ship-drifted", "source-drifted", "section-unlisted", "document-stale", "part-missing", "annotation-in-body"])
      assert.ok(ids.has(want), "audit must detect " + want + " — it found " + [...ids].join(", "));
    // …and document-stale NAMES the section that moved. Coverage-relative, the
    // `computeWikiFreshness` lesson: a whole-file "something changed" cannot
    // tell you what to re-read.
    const staleFinding = json(r).findings.find((f) => f.id === "document-stale");
    assert.ok(staleFinding.summary.includes(stale.heading), "the stale finding names the section, never just a count");

    // Rule 4: a human's wording is not recoverable from this side, so their
    // edits are REPORTED and never counted as drift. Flagging them would teach
    // people to stop editing their own document.
    assert.ok(!ids.has("user-edited"), "a hand edit is never a finding");
    assert.ok(json(r).user_edited.length, "…but it is always reported");

    // Every finding carries a fix and a route (FINDING_ROUTE: a caution points
    // at the panel that can CLEAR it; null when there is genuinely no button).
    for (const f of json(r).findings) {
      assert.ok(f.fix, f.id + " must name a command that clears it");
      assert.ok("panel" in f, f.id + " must decide where it routes, even if the answer is nowhere");
    }
  } finally {
    rmrf(root);
  }
});

test("doc: doc.json still has exactly ONE writer — `log` included", () => {
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const fn = src.slice(src.indexOf("function docWrite("), src.indexOf("function docList("));
  assert.match(fn, /fs\.writeFileSync\(p\.state/, "docWrite is the one that writes it");
  // Nothing else in the file may name the state file in a write.
  const others = src.split("function docWrite(")[0] + src.slice(src.indexOf("function docList("));
  assert.ok(!/writeFileSync\([^)]*\.state\b/.test(others), "doc.json is written outside docWrite");

  // And `orc doc log` appends THROUGH it rather than writing its own file.
  const log = src.slice(src.indexOf("function docLogCmd("), src.indexOf("function docJournalRows("));
  assert.match(log, /docWrite\(claudeDir, slug, d\)/, "orc doc log must append through docWrite");
  assert.ok(!/writeFileSync/.test(log), "orc doc log must not write any file itself");
});

test("doc journal: it NEVER fabricates a row it has no record of", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "gaps", "prd").data.slug;
    const dir = shipReady(root, slug);

    // A cycle that ran with nothing logged. This is the fixture the design
    // forbids "helpfully" reconstructing.
    const d = JSON.parse(fs.readFileSync(path.join(dir, "doc.json"), "utf8"));
    d.cycle = 2;
    d.cycles = [
      { n: 1, at: "16-08-2026 09:00:00", role: "write", sections: ["01-a"], agents: 3 },
      { n: 2, at: "16-08-2026 10:00:00", role: "check", sections: ["01-a"], agents: 2 },
    ];
    d.journal = [];
    fs.writeFileSync(path.join(dir, "doc.json"), JSON.stringify(d, null, 2));

    const j = json(cli(["doc", "journal", slug, "--json", "--dir", root]));
    assert.strictEqual(j.recorded, 0, "no journal[] means NO recorded rows — not invented ones");
    assert.ok(!j.journal.some((r) => r.origin === "recorded"), "every row must be derived or observed");
    assert.strictEqual(j.gaps, 2, "both cycles must render AS gaps");
    for (const r of j.journal.filter((x) => x.gap))
      assert.strictEqual(r.text, null, "a gap carries no text — a reconstruction would read like a fact");

    // With entries, provenance is per row.
    cli(["doc", "log", slug, "--kind", "request", "--text", "make the goals section sharper", "--dir", root]);
    const j2 = json(cli(["doc", "journal", slug, "--json", "--dir", root]));
    assert.strictEqual(j2.recorded, 1);
    const rec = j2.journal.find((r) => r.origin === "recorded");
    assert.strictEqual(rec.text, "make the goals section sharper", "recorded rows are the user's own words, verbatim");
    assert.ok(["recorded", "derived", "observed"].includes(rec.origin));
  } finally {
    rmrf(root);
  }
});

test("doc show --json: it finally emits created_at, and the rest of the memory", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "memory", "prd").data.slug;
    shipReady(root, slug);
    cli(["doc", "log", slug, "--kind", "request", "--text", "the original ask", "--dir", root]);

    const s = json(cli(["doc", "show", slug, "--json", "--dir", root]));
    // A regression test: doc.json always carried created_at and `show --json`
    // never emitted it. The CLI knew when a document started and never said so.
    assert.ok(s.created_at, "created_at must be emitted — it was always in doc.json");
    assert.ok(s.last_touched_at, "last_touched_at");
    assert.strictEqual(typeof s.sessions, "number", "sessions is counted from the traces, never from a model's counter");
    assert.ok(s.context && s.context.exists, "the frozen brief must be readable through the CLI");
    assert.match(s.context.request, /do not invent the SLA/, "and the VERBATIM request is the payload");
    assert.ok(Array.isArray(s.journal) && s.journal.length, "the journal rides along");
    assert.ok(Array.isArray(s.cycles), "cycles[] detail");
  } finally {
    rmrf(root);
  }
});

test("doc context: 1 when a reference file moved, 0 when D2 was answered none", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "ctx", "prd").data.slug;
    shipReady(root, slug);

    let r = cli(["doc", "context", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, "an intact brief exits 0");
    assert.strictEqual(json(r).context.sources[0].state, "ok");

    fs.writeFileSync(path.join(root, "policy.md"), "# Policy\n\nCHANGED.\n");
    r = cli(["doc", "context", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "a moved source exits 1");
    assert.deepStrictEqual(json(r).drifted, ["policy.md"], "and it NAMES the file");
    assert.strictEqual(json(r).context.sources[0].state, "SOURCE-DRIFTED");

    // Coverage-relative: a source is stale only when THAT FILE moved, never
    // because the repository did.
    fs.writeFileSync(path.join(root, "unrelated.md"), "noise\n");
    assert.strictEqual(json(cli(["doc", "context", slug, "--json", "--dir", root])).drifted.length, 1);

    // "none" is an ANSWER and keeps its slot — an empty table is not a gap.
    const slug2 = initDoc(root, "nosources", "prd").data.slug;
    fs.writeFileSync(
      path.join(root, "orc", "orc-doc", slug2, "context.md"),
      "# Context\n<!-- frozen 16-08-2026 · cycle 1 -->\n\n## The request (verbatim)\n> just write it\n\n" +
        "## Supporting documents (D2)\n| Path | Read? | Digest |\n|---|---|---|\n| *none* | — | — |\n"
    );
    const r2 = cli(["doc", "context", slug2, "--json", "--dir", root]);
    assert.strictEqual(r2.status, 0, "D2 answered none is a clean 0");
    assert.deepStrictEqual(json(r2).context.sources, []);
  } finally {
    rmrf(root);
  }
});

test("doc: the audit routes into doctor, and the panel knows where to send it", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "doctored", "prd").data.slug;
    shipReady(root, slug);
    cli(["doc", "ship", slug, "--where", "Notion", "--dir", root]);
    const doc = path.join(root, "orc", "orc-doc", slug, "document.md");
    fs.writeFileSync(doc, fs.readFileSync(doc, "utf8").replace("Line 1", "Changed line 1"));

    const d = JSON.parse(cli(["doctor", "--json", "--dir", root]).stdout);
    const finding = d.findings.find((f) => f.id === "doc-drifted");
    assert.ok(finding, "a drifted document must surface in `orc doctor`");
    assert.match(finding.message, /orc doc audit/, "and it must name the command that explains it");

    // FINDING_ROUTE: a caution routes to the panel that can CLEAR it.
    const overview = panelJs("overview");
    const route = overview.slice(overview.indexOf("const FINDING_ROUTE"));
    assert.match(route, /"doc-drifted":\s*\{\s*panel:\s*"docs"/, "and it routes to Docs, where ship and audit both live");
  } finally {
    rmrf(root);
  }
});

// ── v0.49.0 — the document is a FOLDER, and the file is a build artifact ────

test("doc compile: the same sources always produce the same file, nesting included", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "determinism", "tsd").data.slug;
    const dir = path.join(root, "orc", "orc-doc", slug);
    writeParts(root, slug);
    // One section stored as SUB-PARTS: a nested join must be as deterministic
    // as a flat one, and must normalise blank lines exactly ONCE.
    const nested = json(cli(["doc", "show", slug, "--json", "--dir", root])).outline[4];
    fs.writeFileSync(
      path.join(dir, "sections", nested.id + ".md"),
      `## ${nested.heading}\n\nIntro prose on one line.\n\n### Data model\n\nOne table, one row per account.\n\n### API surface\n\nTwo endpoints, both idempotent.\n`
    );
    assert.strictEqual(cli(["doc", "split", slug, "--section", nested.id, "--by-heading", "--dir", root]).status, 0);

    assert.strictEqual(cli(["doc", "compile", slug, "--dir", root]).status, 0);
    const once = fs.readFileSync(path.join(dir, "document.md"));
    assert.strictEqual(cli(["doc", "compile", slug, "--dir", root]).status, 0);
    const twice = fs.readFileSync(path.join(dir, "document.md"));
    assert.ok(once.equals(twice), "compile is deterministic — nothing in it reads a clock or a readdir order");

    // The nesting is invisible ABOVE and BELOW: exactly one `## ` for it.
    const body = once.toString().replace(/\r\n/g, "\n");
    assert.strictEqual(body.split("\n").filter((l) => l === "## " + nested.heading).length, 1);
    assert.ok(body.includes("### Data model") && body.includes("### API surface"));
    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    assert.strictEqual(map.sections.filter((s) => s.id === nested.id).length, 1, "a split section is ONE section to the map");
  } finally {
    rmrf(root);
  }
});

test("doc split then compile reproduces the document byte-for-byte", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "roundtrip", "report").data.slug;
    const doc = path.join(root, "orc", "orc-doc", slug, "document.md");
    writeParts(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const before = fs.readFileSync(doc);

    assert.strictEqual(cli(["doc", "split", slug, "--dir", root]).status, 0);
    assert.strictEqual(cli(["doc", "compile", slug, "--dir", root]).status, 0);
    assert.ok(before.equals(fs.readFileSync(doc)), "split then compile is the identity — that is what makes recovery safe");

    // …and 00-front.md is what carries everything above the first heading, so
    // the H1 survives a round trip instead of being regenerated twice.
    const front = path.join(root, "orc", "orc-doc", slug, "sections", "00-front.md");
    assert.ok(fs.existsSync(front));
    assert.match(fs.readFileSync(front, "utf8"), /^#\s/m);
    assert.strictEqual(before.toString().split("\n").filter((l) => /^#\s/.test(l)).length, 1, "exactly one H1, never two");
  } finally {
    rmrf(root);
  }
});

test("doc compile --partial: exactly what exists, and the rest is NAMED, never stubbed", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "partial", "report").data.slug;
    const show = json(cli(["doc", "show", slug, "--json", "--dir", root]));
    const keep = show.outline.slice(0, 3).map((o) => o.id);
    writeParts(root, slug, { skip: show.outline.slice(3).map((o) => o.id) });

    // Without --partial it REFUSES and names every missing required section.
    const refused = cli(["doc", "compile", slug, "--json", "--dir", root]);
    assert.strictEqual(refused.status, 1);
    assert.strictEqual(json(refused).reason, "missing-part");
    assert.ok(json(refused).missing.length >= 1);

    const r = cli(["doc", "compile", slug, "--partial", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    const out = json(r);
    assert.deepStrictEqual(out.missing.map((m) => m.id).filter((id) => keep.includes(id)), [], "nothing kept is reported missing");
    assert.ok(out.missing.length, "and what is missing is NAMED, outside the document");

    const body = fs.readFileSync(path.join(root, "orc", "orc-doc", slug, "document.md"), "utf8");
    const heads = body.replace(/\r\n/g, "\n").split("\n").filter((l) => /^##\s/.test(l));
    assert.strictEqual(heads.length, keep.length, "exactly the sections that exist, in outline order");
    // The document carries CONTENT ONLY: no stub, no Open line, no note.
    assert.ok(!/>\s*\*\*Open:/.test(body), "a missing section is ABSENT, never stubbed with a note");
    assert.ok(!/>\s*\*\*Assumption:/.test(body));
    assert.strictEqual(out.annotations.length, 0);
  } finally {
    rmrf(root);
  }
});

test("doc plan: ONE FILE PER SECTION — a two-section slice returns two paths", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "one-file", "prd").data.slug;
    const plan = json(cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]));
    const multi = plan.waves.flatMap((w) => w.agents).find((a) => a.sections.length > 1);
    assert.ok(multi, "the fixture really does produce a multi-section slice");
    assert.strictEqual(multi.parts.length, multi.sections.length, "one part entry per SECTION, never one per slice");
    assert.strictEqual(new Set(multi.parts.map((p) => p.file)).size, multi.parts.length, "and every path is distinct");
    // Regression guard: before v0.49.0 the slice named ONE file after its first
    // section while compile looked one up per outline id, so the second
    // section's file never existed at all.
    assert.strictEqual(multi.part, multi.parts[0].file, "the singular `part` is kept as parts[0].file for one release");
    const seen = new Set();
    for (const a of plan.waves.flatMap((w) => w.agents))
      for (const pt of a.parts) {
        assert.ok(!seen.has(pt.file), `${pt.file} is owned by exactly one agent`);
        seen.add(pt.file);
      }
  } finally {
    rmrf(root);
  }
});

test("doc compile: a sub-part that would restructure the document is REFUSED, by file", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "subparts", "tsd").data.slug;
    const dir = path.join(root, "orc", "orc-doc", slug);
    writeParts(root, slug);
    const target = json(cli(["doc", "show", slug, "--json", "--dir", root])).outline[4];
    const sub = path.join(dir, "sections", target.id);
    fs.mkdirSync(sub, { recursive: true });
    fs.rmSync(path.join(dir, "sections", target.id + ".md"));
    fs.writeFileSync(path.join(sub, "00-head.md"), `## ${target.heading}\n\nIntro on one line.\n`);
    fs.writeFileSync(path.join(sub, "01-data-model.md"), "### Data model\n\nOne row per account.\n");
    // The outline has to know the order — it is NEVER readdir.
    const state = path.join(dir, "doc.json");
    const d = JSON.parse(fs.readFileSync(state, "utf8"));
    d.outline.find((o) => o.id === target.id).subsections = [{ id: "01-data-model", heading: "Data model", level: 3 }];
    fs.writeFileSync(state, JSON.stringify(d, null, 2) + "\n");
    assert.strictEqual(cli(["doc", "compile", slug, "--partial", "--dir", root]).status, 0, "the well-formed nesting compiles");

    // A child that starts with `##` — demoting it restructures the document,
    // promoting it splits one section in two. Neither is this lane's to choose.
    fs.writeFileSync(path.join(sub, "01-data-model.md"), "## Data model\n\nOne row per account.\n");
    let r = cli(["doc", "compile", slug, "--partial", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(json(r).reason, "subpart-shape");
    assert.ok(json(r).problems.some((p) => p.file.includes("01-data-model.md")), "the refusal names the FILE");

    // A child with no sub-heading at all is the same refusal.
    fs.writeFileSync(path.join(sub, "01-data-model.md"), "One row per account.\n");
    r = cli(["doc", "compile", slug, "--partial", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(json(r).problems[0].rule, "subpart-bad-level");

    // `00-head.md` absent → the `## ` heading is generated exactly ONCE.
    fs.writeFileSync(path.join(sub, "01-data-model.md"), "### Data model\n\nOne row per account.\n");
    fs.rmSync(path.join(sub, "00-head.md"));
    assert.strictEqual(cli(["doc", "compile", slug, "--partial", "--dir", root]).status, 0);
    const body = fs.readFileSync(path.join(dir, "document.md"), "utf8").replace(/\r\n/g, "\n");
    assert.strictEqual(body.split("\n").filter((l) => l === "## " + target.heading).length, 1);
  } finally {
    rmrf(root);
  }
});

test("doc parts: a sub-part hash marks only that sub-part", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "subhash", "tsd").data.slug;
    const dir = path.join(root, "orc", "orc-doc", slug);
    writeParts(root, slug);
    const target = json(cli(["doc", "show", slug, "--json", "--dir", root])).outline[4];
    fs.writeFileSync(
      path.join(dir, "sections", target.id + ".md"),
      `## ${target.heading}\n\nIntro on one line.\n\n### Data model\n\nOne row per account.\n\n### API surface\n\nTwo endpoints.\n`
    );
    cli(["doc", "split", slug, "--section", target.id, "--by-heading", "--dir", root]);
    confirmAll(root, slug);

    let row = json(cli(["doc", "parts", slug, "--json", "--dir", root])).parts.find((p) => p.id === target.id);
    assert.ok(row.nested && row.subsections.length === 2);
    assert.ok(row.subsections.every((s) => !s.changed), "nothing has moved yet");

    fs.appendFileSync(path.join(dir, "sections", target.id, "02-api-surface.md"), "\nA third endpoint.\n");
    row = json(cli(["doc", "parts", slug, "--json", "--dir", root])).parts.find((p) => p.id === target.id);
    assert.deepStrictEqual(row.subsections.filter((s) => s.changed).map((s) => s.id), ["02-api-surface"], "only the sub-part that moved");

    // …and the check dispatch re-reads only it.
    const plan = json(cli(["doc", "plan", slug, "--role", "check", "--json", "--dir", root]));
    const slice = plan.waves.flatMap((w) => w.agents).find((a) => a.sections.includes(target.id));
    assert.deepStrictEqual(slice.changed_subparts, [`sections/${target.id}/02-api-surface.md`]);
  } finally {
    rmrf(root);
  }
});

test("doc migrate: a v1 document opens, migrates and continues without losing a byte", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "legacy", "report").data.slug;
    const show = json(cli(["doc", "show", slug, "--json", "--dir", root]));
    const stub = show.outline[8].id;
    const extract = show.outline[1];
    const dir = makeV1(root, slug, { openStub: [stub], extract: extract.id, extractHeading: extract.heading, resume: true });
    const beforeDoc = fs.readFileSync(path.join(dir, "document.md"));

    const r = cli(["doc", "migrate", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(json(r).migrated, true);

    // document.md is NEVER deleted — it becomes the build artifact.
    assert.ok(fs.readFileSync(path.join(dir, "document.md")).equals(beforeDoc), "the old file is untouched");

    const sections = path.join(dir, "sections");
    assert.ok(fs.existsSync(path.join(sections, "00-front.md")));
    // The pending extract is the NEWER edit, so it won.
    assert.match(fs.readFileSync(path.join(sections, extract.id + ".md"), "utf8"), /The NEWER edit/);
    // An `> **Open:**` stub does NOT survive: it becomes `planned`.
    assert.ok(!fs.existsSync(path.join(sections, stub + ".md")), "the stub is not carried into v2");
    const parts = json(cli(["doc", "parts", slug, "--json", "--dir", root])).parts;
    assert.strictEqual(parts.find((p) => p.id === stub).state, "planned");

    // RESUME.md moved to the ONE place `orc resume` looks, and its line parses.
    assert.ok(!fs.existsSync(path.join(dir, "RESUME.md")), "no second copy — two copies is two ideas, and they drift");
    const moved = path.join(root, ".claude", "orc", "run", slug, "RESUME.md");
    assert.ok(fs.existsSync(moved), "it lives in the registered v0.42.0 home");
    const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
    // eslint-disable-next-line no-eval
    const parseStands = eval("(" + src.match(/function parseStands\(text\) \{[\s\S]*?\n\}/)[0] + ")");
    assert.strictEqual(parseStands(fs.readFileSync(moved, "utf8")).lane, "/orc-doc", "the `## ` prefix made this unmatchable, forever");
    assert.strictEqual(json(cli(["run", "list", "--json", "--dir", root])).runs.filter((x) => x.slug === slug).length, 1);

    // version 2, migrations recorded, and the JOURNAL untouched: `orc doc log`
    // records what the USER said, and a migration is a machine fact.
    const d = JSON.parse(fs.readFileSync(path.join(dir, "doc.json"), "utf8"));
    assert.strictEqual(d.version, 2);
    assert.strictEqual(d.migrations.length, 1);
    assert.ok(!(d.journal || []).length, "a migration is never a journal entry");

    // Idempotent.
    assert.strictEqual(json(cli(["doc", "migrate", slug, "--json", "--dir", root])).migrated, false);
  } finally {
    rmrf(root);
  }
});

test("doc migrate: an unparseable document is REFUSED, and stays on v1", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "unparseable", "report").data.slug;
    const dir = makeV1(root, slug, {});
    fs.writeFileSync(path.join(dir, "document.md"), "Just prose. No headings anywhere.\n\nAnother paragraph.\n");

    const r = cli(["doc", "migrate", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(json(r).reason, "unparseable-document");
    const d = JSON.parse(fs.readFileSync(path.join(dir, "doc.json"), "utf8"));
    assert.strictEqual(d.version, 1, "a guessed structure is worse than none");
    assert.ok(!fs.existsSync(path.join(dir, "sections", "01-document-info.md")), "and nothing was written");
  } finally {
    rmrf(root);
  }
});

test("doc: the shipped RESUME.md template parses with the REAL parseStands", () => {
  const ref = fs
    .readFileSync(path.join(REPO, "templates", "skills", "orc-doc", "references", "resume-protocol.md"), "utf8")
    .replace(/\r\n/g, "\n");
  const line = ref.split("\n").find((l) => l.includes("Where it stands:"));
  assert.ok(line, "the template still carries the one line every listing parses");
  assert.ok(!/^#{1,6}\s/.test(line), "at COLUMN 0 — `parseStands` is line-anchored, so a `## ` prefix never matched");

  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  // eslint-disable-next-line no-eval
  const parseStands = eval("(" + src.match(/function parseStands\(text\) \{[\s\S]*?\n\}/)[0] + ")");
  const got = parseStands(ref);
  assert.strictEqual(got.lane, "/orc-doc");
  assert.ok(got.phase, "phase is what a person returning after a usage-limit reset needs");
  assert.ok(got.wave, "…and so is the wave");
});

test("doc: the wave is COMPUTED from confirmed parts, never claimed", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "waves", "prd").data.slug;
    cli(["doc", "mode", slug, "--set", "all", "--dir", root]);
    const plan = json(cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]));
    const total = plan.waves.length;
    writeParts(root, slug);

    // Files on disk with no validated return do NOT count as a finished wave.
    let parts = json(cli(["doc", "parts", slug, "--json", "--dir", root]));
    assert.strictEqual(parts.wave.done, 0, "an unconfirmed file is not a done wave");
    assert.strictEqual(parts.wave.total, total);
    assert.strictEqual(parts.unconfirmed.length, parts.parts.length);

    cli(["doc", "parts", slug, "--confirm", plan.waves[0].agents.flatMap((a) => a.sections).join(","), "--json", "--dir", root]);
    parts = json(cli(["doc", "parts", slug, "--json", "--dir", root]));
    assert.strictEqual(parts.wave.done, 1, "one wave, all of it hash-confirmed");

    // And the resume line carries it, so `orc run list` can show it.
    assert.match(json(cli(["doc", "status", slug, "--json", "--dir", root])).where, / · wave 1 of \d+$/);
  } finally {
    rmrf(root);
  }
});

test("doc: staleness is coverage-relative — it names the section that moved", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "stale", "report").data.slug;
    const dir = shipReady(root, slug);
    // Nothing moved: it audits clean on this class.
    assert.ok(!/document-stale/.test(cli(["doc", "audit", slug, "--json", "--dir", root]).stdout));

    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const moved = map.sections[2];
    fs.appendFileSync(path.join(dir, "sections", moved.id + ".md"), "\nOne more line, typed straight into the section file.\n");

    const st = json(cli(["doc", "status", slug, "--json", "--dir", root]));
    assert.deepStrictEqual(
      st.document_stale.map((s) => s.id),
      [moved.id],
      "ONE section, named — a whole-file `something changed` cannot tell you what to re-read"
    );

    // `ship` refuses on it, because a document.md behind its own sections/ is
    // not the document that would be delivered.
    const r = cli(["doc", "ship", slug, "--where", "Notion", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(json(r).reason, "document-stale");
    assert.ok(json(r).hint.includes(moved.heading), "and it names the section");

    cli(["doc", "compile", slug, "--dir", root]);
    assert.strictEqual(json(cli(["doc", "status", slug, "--json", "--dir", root])).document_stale.length, 0);
    assert.strictEqual(cli(["doc", "ship", slug, "--where", "Notion", "--dir", root]).status, 0);
  } finally {
    rmrf(root);
  }
});

test("doc outline --set: a renumber RENAMES the files on disk, and audit stays clean", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "renumber", "report").data.slug;
    const dir = path.join(root, "orc", "orc-doc", slug);
    const show = json(cli(["doc", "show", slug, "--json", "--dir", root]));
    writeParts(root, slug);
    confirmAll(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);

    // Drop the SECOND section: every ordinal after it shifts by one.
    const kept = show.outline.filter((_, i) => i !== 1);
    fs.writeFileSync(path.join(root, "new-outline.md"), kept.map((o) => `## ${o.heading}\n\nx\n`).join("\n"));
    assert.strictEqual(cli(["doc", "outline", slug, "--set", "new-outline.md", "--json", "--dir", root]).status, 0);

    const parts = json(cli(["doc", "parts", slug, "--json", "--dir", root]));
    for (const p of parts.parts) {
      assert.ok(p.ordinal_ok, `${p.id} mirrors its outline position`);
      if (p.exists) assert.ok(fs.existsSync(path.join(dir, p.files[0])), `${p.files[0]} really is on disk under its new name`);
    }
    assert.strictEqual(parts.misnumbered.length, 0);
    const ids = new Set(json(cli(["doc", "audit", slug, "--json", "--dir", root])).findings.map((f) => f.id));
    assert.ok(!ids.has("part-misnumbered"), "a renumber nobody asked about is never reported as drift");
  } finally {
    rmrf(root);
  }
});

test("doc lint: `annotation-in-body` is EXACT, and never argues with the author", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "annot", "report").data.slug;
    const dir = path.join(root, "orc", "orc-doc", slug);
    writeParts(root, slug);
    cli(["doc", "compile", slug, "--partial", "--dir", root]);
    const doc = path.join(dir, "document.md");

    // A user's OWN prose. A narrow rule that is always right beats a broad one
    // that argues with the author.
    fs.appendFileSync(doc, "\nNote: refunds settle overnight.\n\nNote to reviewers, please read the appendix.\n\nOpen questions are tracked in Jira.\n");
    let res = json(cli(["doc", "lint", slug, "--json", "--dir", root]));
    assert.strictEqual(res.findings.filter((f) => f.rule === "annotation-in-body").length, 0, "a line beginning `Note:` is CONTENT");

    // ORC's own markers, and only those.
    fs.appendFileSync(
      doc,
      "\n> **Open:** nobody decided the fraud limit\n\n> **Assumption:** refunds settle in one banking day\n\n> **Note (ORC):** carried over from cycle 1\n"
    );
    res = json(cli(["doc", "lint", slug, "--json", "--dir", root]));
    const hits = res.findings.filter((f) => f.rule === "annotation-in-body");
    assert.strictEqual(hits.length, 3, "exactly the three ORC markers");
    assert.ok(hits.every((f) => f.severity === "error"));

    // compile REPORTS them and never strips — rule 4 outranks tidiness, because
    // we cannot tell whose line it is.
    const c = json(cli(["doc", "compile", slug, "--partial", "--json", "--dir", root]));
    assert.strictEqual(c.stripped.length, 0, "a silent strip can delete a user's real line");
  } finally {
    rmrf(root);
  }
});

test("doc: doc_max_parallel is a HARD CAP of 2, and the clamp is announced", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "cap", "prd").data.slug;
    cli(["config", "set", "doc_max_parallel", "4", "--dir", root]);
    const plan = json(cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]));
    assert.strictEqual(plan.parallel, 2);
    assert.deepStrictEqual(plan.clamped, { from: 4, to: 2 });
    const human = cli(["doc", "plan", slug, "--role", "write", "--dir", root]).stdout;
    assert.match(human, /clamped to the hard cap 2/, "a clamped setting is never silent");
    // …and the config's own options no longer offer a value that cannot happen.
    const keys = json(cli(["config", "list", "--json", "--dir", root])).keys;
    const key = keys.find((k) => k.key === "doc_max_parallel");
    assert.deepStrictEqual(key.options, [1, 2]);
  } finally {
    rmrf(root);
  }
});

test("doc next: partial mode BLOCKS after each wave, and names the human decision", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "partialnext", "prd").data.slug;
    const dir = path.join(root, "orc", "orc-doc", slug);
    fs.writeFileSync(path.join(dir, "context.md"), "# Context\n\n## The request (verbatim)\n> write it\n");

    // write_mode unset is a HUMAN decision, named — never a model's default.
    let n = cli(["doc", "next", slug, "--json", "--dir", root]);
    assert.strictEqual(n.status, 1);
    assert.match(json(n).blocked_by, /partial or all/);
    assert.ok(json(n).alternatives.some((a) => /orc doc mode/.test(a)));

    cli(["doc", "mode", slug, "--set", "partial", "--dir", root]);

    // v0.49.2 — the run map comes first, ONCE, and it is FREE. A refusal for no
    // history is still an answer and is still shown once: without that this step
    // is one the lane can never get past.
    n = cli(["doc", "next", slug, "--json", "--dir", root]);
    assert.strictEqual(n.status, 0);
    assert.strictEqual(json(n).action, "forecast", "the user is told what the whole document costs before the first paid wave");
    assert.strictEqual(json(n).paid, false);
    cli(["doc", "forecast", slug, "--json", "--dir", root]);

    n = cli(["doc", "next", slug, "--json", "--dir", root]);
    assert.strictEqual(n.status, 0);
    assert.strictEqual(json(n).action, "plan-write", "and it is never named twice");

    // Wave 1 written and confirmed → it STOPS so you can read it and redirect.
    const plan = json(cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]));
    assert.strictEqual(plan.waves.length, 1, "partial returns wave 1 only — the rest cannot be bought by accident");
    assert.ok(plan.more_waves > 0);
    const wave1 = plan.waves[0].agents.flatMap((a) => a.sections);
    const all = json(cli(["doc", "show", slug, "--json", "--dir", root])).outline.map((o) => o.id);
    writeParts(root, slug, { skip: all.filter((id) => !wave1.includes(id)) });
    cli(["doc", "parts", slug, "--confirm", wave1.join(","), "--json", "--dir", root]);

    n = cli(["doc", "next", slug, "--json", "--dir", root]);
    assert.strictEqual(n.status, 1, "a wave boundary is a real STOP, not a loop iteration");
    assert.match(json(n).blocked_by, /wave 1 of \d+/);
    assert.ok(json(n).alternatives.some((a) => /compile .* --partial/.test(a)), "and it offers the free look");

    // Every command it can emit is a real subcommand.
    const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
    const subs = new Set([...src.matchAll(/^    case "([a-z-]+)":$/gm)].map((m) => m[1]));
    for (const cmd of [json(n).command, ...json(n).alternatives].filter(Boolean))
      if (cmd.startsWith("orc doc ")) assert.ok(subs.has(cmd.split(/\s+/)[2]), `${cmd} names a real subcommand`);
  } finally {
    rmrf(root);
  }
});

test("doc: assemble / extract / splice still exit as they did, on a v1 document", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "aliases", "report").data.slug;
    writeParts(root, slug);
    cli(["doc", "compile", slug, "--dir", root]);
    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    toV1(root, slug);

    // v1 extract still copies to .work/ and records the hash.
    const r = cli(["doc", "extract", slug, "--section", map.sections[2].id, "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(json(r).file, `.work/${map.sections[2].id}.md`);
    assert.strictEqual(cli(["doc", "splice", slug, "--json", "--dir", root]).status, 0);

    // `assemble` is an alias for `compile` and keeps its exit codes.
    assert.strictEqual(cli(["doc", "assemble", slug, "--dir", root]).status, 0);
    fs.rmSync(path.join(root, "orc", "orc-doc", slug, "sections", map.sections[3].id + ".md"));
    const missing = cli(["doc", "assemble", slug, "--json", "--dir", root]);
    assert.strictEqual(missing.status, 1, "a missing required part is still exit 1");
    assert.strictEqual(json(missing).reason, "missing-part");

    // And in v2 the section file IS the extract, so nothing is copied.
    const v2 = cli(["doc", "extract", slug, "--section", map.sections[2].id, "--json", "--dir", root]);
    assert.strictEqual(v2.status, 0);
    assert.match(json(v2).file, /^sections\//);
  } finally {
    rmrf(root);
  }
});

/* ══════════════════════════════════════════════════════════ v0.49.2 ═══════
   House rules, the four generation rules, the template lock, the run map,
   the cost report, and the revision anchor. */

test("doc rules: an empty ledger is an ANSWER, and add/move/disable round-trip", () => {
  const { root } = freshInstall();
  try {
    // NO RULES IS AN ANSWER. The object still comes back; only the exit code
    // says there is nothing here yet.
    let r = cli(["doc", "rules", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(json(r).ok, true, "an empty ledger still returns the whole object");
    assert.deepStrictEqual(json(r).rules, []);
    assert.match(json(r).line, /house rules: none/);
    // THE BOUNDARY IS ALWAYS DECLARED, including when there is nothing in it.
    assert.match(json(r).boundary, /never change how this lane runs/);

    r = cli(["doc", "rules", "add", "--priority", "P0", "--text", "open with a one-paragraph summary", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(json(r).id, "H-001");

    cli(["doc", "rules", "add", "--priority", "P2", "--text", "prefer a table over a long list", "--json", "--dir", root]);
    r = cli(["doc", "rules", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(json(r).rules.length, 2);
    // VERBATIM in, verbatim out — the context.md rule.
    assert.strictEqual(json(r).rules[0].text, "open with a one-paragraph summary");
    assert.deepStrictEqual(json(r).counts, { P0: 1, P1: 0, P2: 1 });

    // A re-prioritise is recorded, not re-typed.
    cli(["doc", "rules", "move", "H-002", "--priority", "P1", "--json", "--dir", root]);
    r = cli(["doc", "rules", "--json", "--dir", root]);
    assert.strictEqual(json(r).rules.find((x) => x.id === "H-002").priority, "P1");

    // A disabled rule KEEPS ITS SLOT: "I switched that off" and "there is no
    // such rule" must never look the same.
    cli(["doc", "rules", "disable", "H-002", "--json", "--dir", root]);
    r = cli(["doc", "rules", "--json", "--dir", root]);
    assert.strictEqual(json(r).rules.length, 2, "a disabled rule is still in the ledger");
    assert.strictEqual(json(r).enabled.length, 1, "but it is not in the enabled set");

    cli(["doc", "rules", "remove", "H-002", "--json", "--dir", root]);
    assert.strictEqual(json(cli(["doc", "rules", "--json", "--dir", root])).rules.length, 1);
  } finally {
    rmrf(root);
  }
});

test("doc rules: a multi-line rule is REFUSED by name, and so is a bad priority", () => {
  const { root } = freshInstall();
  try {
    // Two rules stapled together are two rules. Flattening it silently would
    // make the panel's plain-argv write path a lie.
    let r = cli(["doc", "rules", "add", "--priority", "P0", "--text", "one line\nand another", "--json", "--dir", root]);
    assert.strictEqual(r.status, 2);
    assert.strictEqual(json(r).reason, "multiline");
    assert.match(json(r).hint, /two rules/);

    r = cli(["doc", "rules", "add", "--priority", "P9", "--text", "nope", "--json", "--dir", root]);
    assert.strictEqual(r.status, 2);
    assert.strictEqual(json(r).reason, "bad-priority");

    r = cli(["doc", "rules", "remove", "H-404", "--json", "--dir", root]);
    assert.strictEqual(r.status, 2);
    assert.strictEqual(json(r).reason, "no-such-rule");
  } finally {
    rmrf(root);
  }
});

test("doc rules: a document FREEZES the rules, and the drift NAMES every one that moved", () => {
  const { root } = freshInstall();
  try {
    cli(["doc", "rules", "add", "--priority", "P0", "--text", "always name the owning team", "--json", "--dir", root]);
    const slug = initDoc(root, "frozen", "prd").data.slug;

    // FROZEN AT INIT — a document is written against the rules that were true
    // when it started.
    let r = cli(["doc", "rules", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, "no drift yet");
    assert.strictEqual(json(r).frozen.length, 1);
    assert.strictEqual(json(r).drift.drifted, false);
    assert.ok(fs.existsSync(path.join(root, "orc", "orc-doc", slug, "house-rules.md")), "the frozen set is readable beside the document");

    // The project ledger moves under it.
    cli(["doc", "rules", "add", "--priority", "P1", "--text", "use the customer's words", "--json", "--dir", root]);
    cli(["doc", "rules", "move", "H-001", "--priority", "P1", "--json", "--dir", root]);
    r = cli(["doc", "rules", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "a drifted frozen set wants attention");
    const d = json(r).drift;
    // COVERAGE-RELATIVE, never a boolean: it names each one.
    assert.strictEqual(d.added.length, 1);
    assert.strictEqual(d.added[0].id, "H-002");
    assert.strictEqual(d.changed.length, 1);
    assert.strictEqual(d.changed[0].from.priority, "P0");
    assert.strictEqual(d.changed[0].to.priority, "P1");

    // The audit says so too, with its fix command and its panel.
    const a = json(cli(["doc", "audit", slug, "--json", "--dir", root]));
    const f = a.findings.find((x) => x.id === "house-rules-drifted");
    assert.ok(f, "the audit reports the drift");
    assert.strictEqual(f.level, "warn", "a drift is a fact about the document, not an error");
    assert.strictEqual(f.panel, "docs");
    assert.match(f.fix, /orc doc rules .* --sync/);
  } finally {
    rmrf(root);
  }
});

test("doc rules --sync: it re-freezes, NAMES the sections that predate it, and re-writes nothing", () => {
  const { root } = freshInstall();
  try {
    cli(["doc", "rules", "add", "--priority", "P0", "--text", "first rule", "--json", "--dir", root]);
    const slug = initDoc(root, "syncme", "prd").data.slug;
    const show = writeParts(root, slug, {});
    confirmAll(root, slug);
    const first = show.outline[0].id;
    const before = fs.readFileSync(path.join(root, "orc", "orc-doc", slug, "sections", first + ".md"), "utf8");

    cli(["doc", "rules", "add", "--priority", "P0", "--text", "second rule", "--json", "--dir", root]);
    const r = cli(["doc", "rules", slug, "--sync", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(json(r).synced, 2);
    // IT NAMES THEM. Auto-rewriting would be ORC spending money applying a rule
    // change nobody asked it to apply retroactively.
    assert.ok(json(r).predate.length, "the already-written sections are named");
    assert.strictEqual(
      fs.readFileSync(path.join(root, "orc", "orc-doc", slug, "sections", first + ".md"), "utf8"),
      before,
      "and not one of them is re-written"
    );
    // Re-frozen, so the drift is gone.
    assert.strictEqual(cli(["doc", "rules", slug, "--json", "--dir", root]).status, 0);
    assert.ok(json(cli(["doc", "show", slug, "--json", "--dir", root])).ok);
  } finally {
    rmrf(root);
  }
});

test("doc rules: the enabled set rides on every plan, above ORC's own rules", () => {
  const { root } = freshInstall();
  try {
    cli(["doc", "rules", "add", "--priority", "P0", "--text", "money always carries its currency", "--json", "--dir", root]);
    const slug = initDoc(root, "sliced", "prd").data.slug;
    const p = json(cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]));
    assert.strictEqual(p.doc_rules.length, 1);
    assert.strictEqual(p.doc_rules[0].text, "money always carries its currency");
    assert.match(p.doc_rules_boundary, /unsupported_request/);
    // Even an EMPTY result carries them — a caller must never special-case
    // "nothing to do" by finding half the keys missing.
    writeParts(root, slug, {});
    confirmAll(root, slug);
    const empty = cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]);
    assert.strictEqual(empty.status, 1);
    assert.ok(Array.isArray(json(empty).doc_rules), "the empty shape carries the same keys");
  } finally {
    rmrf(root);
  }
});

test("doc lint: the four generation rules are free, narrow, and exempt what they must", () => {
  const { root } = freshInstall();
  try {
    const f = path.join(root, "gen.md");
    fs.writeFileSync(
      f,
      [
        "# A document",
        "",
        "## Goals",
        "",
        "The retry logic lives in src/payments/retry.ts:42 and is worth reading.",
        "",
        "Should we ship this in one release?",
        "",
        "The rollout date is TBA.",
        "",
        "## Non-goals",
        "",
        "N/A",
        "",
        "There is no plan here yet.",
        "",
        "We might revisit it later.",
        "",
        "Nothing is decided about reconciliation.",
        "",
        "Somebody will look at it.",
        "",
        "## Open questions",
        "",
        "Should we support partial settlement first?",
        "",
        "## Rollout",
        "",
        "```bash",
        "cd ./src && node bin/cli.js",
        "```",
        "",
        "Point a browser at localhost to see the staging build.",
        "",
      ].join("\n")
    );
    const r = cli(["doc", "lint", "gen.md", "--json", "--dir", root]);
    const rules = json(r).findings.map((x) => x.rule);
    const at = (rule) => json(r).findings.filter((x) => x.rule === rule).map((x) => x.line);

    // 5b — an approval question and a confirmation marker, both errors.
    assert.ok(rules.includes("question-in-body"));
    assert.ok(at("question-in-body").includes(7), "a line that is only a question to an approver");
    assert.ok(at("question-in-body").includes(9), "and a TBA");
    // …but NOT inside a section the outline declares as open questions.
    assert.ok(!at("question-in-body").includes(23), "a declared questions section is allowed to have one");

    // 5c — N/A followed by filler.
    assert.ok(rules.includes("na-padded"));

    // 5d — a file:line anchor and a localhost, both outside fenced code.
    const local = at("local-reference");
    assert.ok(local.includes(5), "a file:line anchor");
    assert.ok(local.includes(33), "and a localhost in prose");
    assert.ok(!local.includes(30), "but NOT the same shapes inside a fence — a code example is content");

    for (const rule of ["question-in-body", "local-reference"])
      assert.strictEqual(json(r).findings.find((x) => x.rule === rule).severity, "error");
    assert.strictEqual(json(r).findings.find((x) => x.rule === "na-padded").severity, "warn");
  } finally {
    rmrf(root);
  }
});

test("doc_local_refs: off, warn and error are all real states", () => {
  const { root } = freshInstall();
  try {
    const f = path.join(root, "loc.md");
    fs.writeFileSync(f, "# T\n\nSee src/app/main.ts:12 for the handler.\n");
    assert.strictEqual(json(cli(["doc", "lint", "loc.md", "--json", "--dir", root])).local_refs, "error");
    assert.strictEqual(json(cli(["doc", "lint", "loc.md", "--json", "--dir", root])).errors, 1);

    cli(["config", "set", "doc_local_refs", "warn", "--dir", root]);
    let d = json(cli(["doc", "lint", "loc.md", "--json", "--dir", root]));
    assert.strictEqual(d.local_refs, "warn");
    assert.strictEqual(d.findings.find((x) => x.rule === "local-reference").severity, "warn");

    cli(["config", "set", "doc_local_refs", "off", "--dir", root]);
    d = json(cli(["doc", "lint", "loc.md", "--json", "--dir", root]));
    assert.strictEqual(d.local_refs, "off");
    assert.ok(!d.findings.some((x) => x.rule === "local-reference"), "off means off");
  } finally {
    rmrf(root);
  }
});

test("template lock: a supplied template is a cage — lint, --confirm and audit all say so", () => {
  const { root } = freshInstall();
  try {
    const tpl = path.join(root, "tpl.md");
    fs.writeFileSync(tpl, "# My template\n\n## Overview\n\n## Interfaces\n\n## Risks\n");
    const slug = initDoc(root, "caged", "tsd", ["--template", "tpl.md"]).data.slug;

    // LOCKED BY DEFAULT whenever a user template is supplied.
    const p = json(cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]));
    assert.strictEqual(p.template_locked, true);
    assert.deepStrictEqual(p.allowed_headings, ["Overview", "Interfaces", "Risks"]);

    const sec = path.join(root, "orc", "orc-doc", slug, "sections");
    fs.mkdirSync(sec, { recursive: true });
    fs.writeFileSync(path.join(sec, "01-overview.md"), "## Overview\n\nA short overview line.\n\n### Extra thing\n\nSomething new.\n");

    // The lint errors on it.
    const lint = json(cli(["doc", "lint", slug, "--section", "01-overview", "--json", "--dir", root]));
    assert.ok(lint.findings.some((x) => x.rule === "heading-outside-template"));

    // `parts --confirm` REFUSES and writes NOTHING — the splice refusal shape.
    const c = cli(["doc", "parts", slug, "--confirm", "01-overview", "--json", "--dir", root]);
    assert.strictEqual(c.status, 1);
    assert.strictEqual(json(c).reason, "template-drift");
    assert.deepStrictEqual(json(c).drifted[0].headings, ["Extra thing"]);
    assert.deepStrictEqual(json(c).confirmed, [], "nothing was written");
    const after = json(cli(["doc", "parts", slug, "--json", "--dir", root]));
    assert.strictEqual(after.parts.find((x) => x.id === "01-overview").state, "unconfirmed");

    // And the audit reports it, by heading.
    const a = json(cli(["doc", "audit", slug, "--json", "--dir", root]));
    const f = a.findings.find((x) => x.id === "template-drift");
    assert.ok(f && /Extra thing/.test(f.summary));
  } finally {
    rmrf(root);
  }
});

test("template lock: --template-soft opts out, and a shipped template is never a cage", () => {
  const { root } = freshInstall();
  try {
    const tpl = path.join(root, "tpl2.md");
    fs.writeFileSync(tpl, "# T\n\n## Alpha\n\n## Beta\n");
    const soft = initDoc(root, "softly", "tsd", ["--template", "tpl2.md", "--template-soft"]).data;
    assert.strictEqual(soft.template_locked, false);
    assert.strictEqual(soft.allowed_headings, null);

    // A SHIPPED base template is a floor, not a cage — that sentence in
    // `orc doc templates` stays true.
    const base = initDoc(root, "shipped", "tsd").data;
    assert.strictEqual(base.template_locked, false);
  } finally {
    rmrf(root);
  }
});

test("doc forecast: no history REFUSES rather than inventing, and --naive is the floor", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "mapped", "prd").data.slug;
    // I WILL NOT INVENT NUMBERS.
    const r = cli(["doc", "forecast", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 3);
    assert.strictEqual(json(r).reason, "no-history");
    assert.match(json(r).hint, /will not invent numbers/);

    const n = cli(["doc", "forecast", slug, "--naive", "--json", "--dir", root]);
    assert.strictEqual(n.status, 1, "a floor is low-confidence by construction");
    const d = json(n);
    assert.strictEqual(d.naive, true);
    assert.ok(d.low_confidence_roles.length, "and it says so");
    // FOUR TOKEN KINDS, NEVER BLENDED.
    for (const k of ["input", "cache_write", "cache_read", "output"]) assert.ok(k in d.tokens.p50);
    assert.ok(d.waves.length, "the wave shape comes from the same batcher the dispatch uses");
    assert.ok("unattributed" in d, "unattributed is ALWAYS reported");
  } finally {
    rmrf(root);
  }
});

test("doc next: the run map is named ONCE, and a changed outline invalidates it", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "onceonly", "prd").data.slug;
    fs.writeFileSync(path.join(root, "orc", "orc-doc", slug, "context.md"), "# Context\n\n## The request (verbatim)\n> write it\n");
    cli(["doc", "mode", slug, "--set", "all", "--dir", root]);

    let n = json(cli(["doc", "next", slug, "--json", "--dir", root]));
    assert.strictEqual(n.action, "forecast");
    assert.strictEqual(n.paid, false, "the run map is free");

    // Even a REFUSAL is shown once — otherwise this is a step the lane can
    // never get past.
    cli(["doc", "forecast", slug, "--json", "--dir", root]);
    n = json(cli(["doc", "next", slug, "--json", "--dir", root]));
    assert.strictEqual(n.action, "plan-write", "and it is never named twice");

    // A forecast for a DIFFERENT SHAPE is not a forecast.
    cli(["doc", "mode", slug, "--set", "partial", "--dir", root]);
    n = json(cli(["doc", "next", slug, "--json", "--dir", root]));
    assert.strictEqual(n.action, "forecast");
    assert.match(n.why, /changed since the last forecast/);
  } finally {
    rmrf(root);
  }
});

test("doc cost: no trace is an ANSWER, and a section nothing joins reads — never 0", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "costed", "prd").data.slug;
    const r = cli(["doc", "cost", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 3);
    assert.strictEqual(json(r).reason, "no-trace");
    assert.match(json(r).hint, /never estimated/);

    // A trace with a doc DISPATCH whose tail names its sections. Nothing can be
    // joined to a transcript here, so every section must read `—`.
    const first = json(cli(["doc", "show", slug, "--json", "--dir", root])).outline[0].id;
    const logs = path.join(root, ".claude", "orc", "logs");
    fs.mkdirSync(logs, { recursive: true });
    fs.writeFileSync(
      path.join(logs, `run-doc-${slug}-180826-120000.txt`),
      "[180826 12:00:00] PHASE write start\n" +
        `[180826 12:00:01] DISPATCH orc-doc-writer-opus-5-med :: doc write sections=${first} part=sections/${first}.md expect=claude-opus-5/medium\n` +
        "[180826 12:10:00] FINISH :: done\n"
    );
    const c = cli(["doc", "cost", slug, "--json", "--dir", root]);
    const d = json(c);
    const row = d.by_section.find((x) => x.id === first);
    assert.ok(row, "every outline section keeps its slot");
    assert.strictEqual(row.dispatches, 1, "the dispatch WAS seen");
    assert.strictEqual(row.joined, false);
    assert.strictEqual(row.tokens, null, "an unknown is an unknown, never a zero");
    assert.ok("unattributed" in d, "and unattributed is always present");
    assert.ok(d.honesty.some((h) => /never 0/.test(h)));
  } finally {
    rmrf(root);
  }
});

test("doc lint --section: part-local line numbers, and no document-level rules", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "perpart", "prd").data.slug;
    const show = writeParts(root, slug, {});
    const first = show.outline[0].id;
    const r = cli(["doc", "lint", slug, "--section", first, "--json", "--dir", root]);
    const d = json(r);
    assert.strictEqual(d.section, first);
    assert.strictEqual(d.part_local, true);
    assert.strictEqual(d.file, `sections/${first}.md`);
    // A PART IS NOT A DOCUMENT: it has no H1 and no front matter by design.
    assert.ok(!d.findings.some((x) => x.rule === "no-h1"), "a section file is not missing a title");
    assert.ok(!d.findings.some((x) => x.rule === "front-matter-required"));

    const bad = cli(["doc", "lint", slug, "--section", "99-nope", "--json", "--dir", root]);
    assert.strictEqual(bad.status, 2);
    assert.strictEqual(json(bad).reason, "no-such-section");
  } finally {
    rmrf(root);
  }
});

test("doc plan --role edit: every finding names its FILE and its part-local line", () => {
  const { root } = freshInstall();
  try {
    const slug = initDoc(root, "anchored", "prd").data.slug;
    const show = writeParts(root, slug, {});
    const first = show.outline[0].id;
    const sec = path.join(root, "orc", "orc-doc", slug, "sections", first + ".md");
    fs.writeFileSync(sec, `## ${show.outline[0].heading}\n\nThe handler lives in src/app/main.ts:12 and is worth a read.\n`);
    confirmAll(root, slug);

    // Give the section an open finding so the edit role picks it up.
    const state = path.join(root, "orc", "orc-doc", slug, "doc.json");
    const d0 = JSON.parse(fs.readFileSync(state, "utf8"));
    d0.sections[first] = { ...(d0.sections[first] || {}), findings: 1 };
    fs.writeFileSync(state, JSON.stringify(d0, null, 2));

    const p = json(cli(["doc", "plan", slug, "--role", "edit", "--json", "--dir", root]));
    const part = p.waves[0].agents[0].parts[0];
    assert.strictEqual(part.file, `sections/${first}.md`);
    const f = (part.findings || []).find((x) => x.rule === "local-reference");
    assert.ok(f, "the anchor rides on the part the writer will open");
    assert.strictEqual(f.file, `sections/${first}.md`);
    assert.strictEqual(typeof f.line, "number");
    assert.ok(f.line <= 3, "PART-LOCAL — the compiled document's line number is deliberately not carried");
  } finally {
    rmrf(root);
  }
});
