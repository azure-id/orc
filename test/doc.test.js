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
const { REPO, cli, rmrf, freshInstall } = require("./_helpers.js");

// ── helpers ────────────────────────────────────────────────────────────────

function json(res) {
  return JSON.parse(res.stdout);
}

function initDoc(root, slug, type, extra) {
  const r = cli(["doc", "init", slug, "--type", type || "prd", "--json", "--dir", root, ...(extra || [])]);
  return { res: r, data: r.status === 0 ? json(r) : null };
}

// Fill every part file with a body of `n` prose lines. Deliberately unwrapped:
// the lint's hard-wrap rule is an ERROR, and a fixture that trips it would make
// every other assertion here read as a failure.
function writeParts(root, slug, opts) {
  const o = opts || {};
  const show = json(cli(["doc", "show", slug, "--json", "--dir", root]));
  const work = path.join(root, "orc", "orc-doc", slug, ".work");
  for (const sec of show.outline) {
    if (o.skip && o.skip.includes(sec.id)) continue;
    const n = (o.lines && o.lines[sec.id]) || 3;
    const body = ["## " + sec.heading, ""];
    // ONE PARAGRAPH, ONE LINE — and therefore a blank line between them. Two
    // consecutive prose lines IS the hard-wrap rule, so a fixture written the
    // other way would trip an ERROR and make every lint assertion below read as
    // a failure of something else.
    for (let i = 0; i < n; i++) body.push(`Line ${i + 1} of ${sec.heading}, written as one unwrapped line.`, "");
    fs.writeFileSync(path.join(work, sec.id + ".md"), body.join("\n"));
  }
  return show;
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
    assert.strictEqual(cli(["doc", "assemble", slug, "--dir", root]).status, 0);

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
    cli(["doc", "assemble", slug, "--dir", root]);

    const before = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const early = before.sections[1]; // 02-summary
    const late = before.sections[6]; // 07-…
    const folder = path.join(root, "orc", "orc-doc", slug);

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
    cli(["doc", "assemble", slug, "--dir", root]);
    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    const target = map.sections[2];
    const folder = path.join(root, "orc", "orc-doc", slug);

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

test("doc plan: never splits a section, never exceeds 4 agents, honours the budget", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "plan-fixture", "tsd");
    const slug = data.slug;
    // A value above the hard cap must be CLAMPED and the clamp announced.
    cli(["config", "set", "doc_max_parallel", "9", "--dir", root]);
    const plan = json(cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]));

    assert.strictEqual(plan.parallel, 4, "the hard cap is 4");
    assert.deepStrictEqual(plan.clamped, { from: 9, to: 4 }, "the clamp is DATA, so the panel and the terminal can both say it");

    const seen = new Set();
    for (const w of plan.waves) {
      assert.ok(w.agents.length <= 4, "no wave exceeds the cap");
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
    cli(["doc", "assemble", slug, "--dir", root]);
    const r = cli(["doc", "plan", slug, "--role", "write", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "nothing to do is exit 1");
    const out = json(r);
    // Same keys as the work-to-do shape: a caller must never special-case this
    // by parsing prose or by finding half the keys missing.
    for (const k of ["ok", "slug", "role", "agent", "budget_lines", "parallel", "clamped", "waves", "agents", "oversized", "hint", "note"])
      assert.ok(k in out, `the empty result still carries "${k}"`);
    assert.deepStrictEqual(out.waves, []);
    assert.match(out.hint, /\S/);
  } finally {
    rmrf(root);
  }
});

test("doc plan --role check: a checker gets a LINE RANGE, never the whole file", () => {
  const { root } = freshInstall();
  try {
    const { data } = initDoc(root, "check-plan", "report");
    const slug = data.slug;
    writeParts(root, slug);
    cli(["doc", "assemble", slug, "--dir", root]);
    const plan = json(cli(["doc", "plan", slug, "--role", "check", "--json", "--dir", root]));
    assert.strictEqual(plan.agent, "orc-doc-checker-opus-5-low");
    for (const a of plan.waves.flatMap((w) => w.agents)) {
      assert.ok(Array.isArray(a.range) && a.range.length === 2, "every check slice carries a range");
      assert.strictEqual(a.read_limit, a.range[1] - a.range[0] + 1, "…and the Read(offset, limit) that goes with it");
    }
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
    cli(["doc", "assemble", slug, "--dir", root]);
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
    cli(["doc", "assemble", slug, "--dir", root]);
    const done = cli(["doc", "status", slug, "--json", "--dir", root]);
    assert.strictEqual(done.status, 0, "every required section written and a clean lint is 0");
    assert.strictEqual(json(done).state, "complete");

    // An `> **Open:**` section is a REAL state, and it holds the document open.
    const work = path.join(root, "orc", "orc-doc", slug, ".work");
    const first = show.outline[1];
    fs.writeFileSync(path.join(work, first.id + ".md"), `## ${first.heading}\n\n> **Open:** nobody has decided this yet.\n`);
    cli(["doc", "assemble", slug, "--dir", root]);
    const open = cli(["doc", "status", slug, "--json", "--dir", root]);
    assert.strictEqual(open.status, 1, "an open section keeps the document in progress");
    assert.ok(json(open).open_sections.some((o) => o.heading === first.heading));
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
    cli(["doc", "assemble", slug, "--dir", root]);
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
    const work = path.join(root, "orc", "orc-doc", slug, ".work");
    for (const o of show.outline)
      fs.writeFileSync(
        path.join(work, o.id + ".md"),
        `## ${o.heading}\n\n<!-- purpose: ${o.purpose} -->\n\nA line of prose.\n`
      );
    cli(["doc", "assemble", slug, "--dir", root]);
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
    cli(["doc", "assemble", slug, "--dir", root]);
    const doc = path.join(root, "orc", "orc-doc", slug, "document.md");
    const first = fs.readFileSync(doc, "utf8");
    cli(["doc", "assemble", slug, "--dir", root]);
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
    cli(["doc", "assemble", slug, "--dir", root]);
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
  const app = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const states = [...(src.match(/const DOC_STATES = \[([\s\S]*?)\];/) || ["", ""])[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  const panel = app.slice(app.indexOf("DOCS =="), app.indexOf("// While a mutation runs"));
  assert.ok(panel.length > 2000, "the Docs panel was found");

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
});

test("docs fixtures: one of every section state, and the ugly ones", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures.js"));
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

  const statuses = ["complete", "in-progress", "not-started"];
  for (const st of statuses)
    assert.ok(
      docs.some((d) => (fixtures.get("/api/doc/one", { slug: d.slug }) || {}).state === st),
      `a ${st} document must be designable`
    );

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
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8");
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
