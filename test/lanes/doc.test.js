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
  assert.strictEqual(cli(["doc", "assemble", slug, "--dir", root]).status, 0);
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
    assert.ok(after.startsWith(before), "the ship state is a SUFFIX; the parsed prefix must not move");
    assert.match(before, /^Where it stands:  \/orc-doc · PRD · cycle \d+ · \d+ of \d+ sections written$/);
    assert.match(after, / · shipped \d{2}-\d{2}-\d{4} → Notion$/);
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

    // ship-drifted + source-drifted + orphan-extract
    cli(["doc", "ship", slug, "--where", "Notion", "--dir", root]);
    const map = json(cli(["doc", "map", slug, "--json", "--dir", root]));
    fs.writeFileSync(doc, fs.readFileSync(doc, "utf8").replace("Line 1 of " + map.sections[1].heading, "changed"));
    fs.writeFileSync(path.join(root, "policy.md"), "# Policy\n\nCHANGED.\n");
    assert.strictEqual(cli(["doc", "extract", slug, "--section", map.sections[3].id, "--dir", root]).status, 0);

    // section-unlisted: a heading nobody planned.
    fs.appendFileSync(doc, "\n## Appendix nobody planned\n\nText.\n");

    const r = cli(["doc", "audit", slug, "--json", "--dir", root]);
    assert.strictEqual(r.status, 1);
    const ids = new Set(json(r).findings.map((f) => f.id));
    for (const want of ["ship-drifted", "source-drifted", "orphan-extract", "section-unlisted"])
      assert.ok(ids.has(want), "audit must detect " + want + " — it found " + [...ids].join(", "));

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
