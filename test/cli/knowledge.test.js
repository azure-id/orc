"use strict";
// v0.49.1 — the reads that stopped discarding what the CLI already computed.
//
// THE RULE THIS FILE EXISTS FOR: a read's `--json` is the WHOLE computed
// object, not a summary. A field the human path prints and the JSON omits is
// drift, and it is drift NO LINT CAN SEE, because both halves live in one
// function — so it gets a real test per read instead.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir } = require("../_helpers");

// The same fixture shape `wiki.test.js` uses: four docs, one covered file each.
function wikiFixture() {
  const { root, claudeDir } = freshInstall();
  const git = (args) => require("child_process").spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "t@t"]);
  git(["config", "user.name", "t"]);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  for (const n of ["a", "b", "c", "d"]) fs.writeFileSync(path.join(root, "src", n + ".js"), "module.exports = 1;\n");
  // An uncovered folder, so coverage is never trivially 100%.
  fs.mkdirSync(path.join(root, "vendor"), { recursive: true });
  for (const n of ["x", "y"]) fs.writeFileSync(path.join(root, "vendor", n + ".js"), "module.exports = 1;\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"]);
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  fs.mkdirSync(path.join(root, "wiki"), { recursive: true });
  for (const n of ["a", "b", "c", "d"])
    fs.writeFileSync(
      path.join(root, "wiki", `orc-feature-${n}.md`),
      [
        "---",
        "wiki_schema: 2",
        "doc_type: feature",
        `area: ${n}`,
        `covers: [src/${n}.js]`,
        `keywords: [${n}]`,
        "scanned_at: 010126 00:00:00",
        `scanned_commit: ${head}`,
        "covered_files:",
        `  src/${n}.js: abc123`,
        "status: fresh",
        "---",
        "",
        `# ${n.toUpperCase()} Overview`,
        "",
        "## TL;DR",
        `- covers src/${n}.js`,
        "",
      ].join("\n")
    );
  const sync = cli(["wiki", "sync", "--dir", root]);
  assert.strictEqual(sync.status, 0, "sync registers the fixture: " + sync.stdout + sync.stderr);
  return { root, claudeDir, git, head };
}

const j = (r) => JSON.parse(r.stdout);

// ── `--json is not a summary` ───────────────────────────────────────────────

test("wiki status --json carries the WHOLE computed object, and every legacy key", () => {
  const { root } = wikiFixture();
  try {
    const d = j(cli(["wiki", "status", "--json", "--dir", root]));

    // The legacy set keeps its names and meanings — `orc doctor`, the overview
    // tile and _shared/detecting-artifacts.md all read them.
    for (const k of ["state", "docs", "tier", "distance", "anchor", "last_scan", "reasons", "blind", "edges"])
      assert.ok(k in d, `legacy key ${k} survives`);
    assert.strictEqual(d.state, "registered");
    assert.strictEqual(typeof d.blind, "number", "`blind` is still the COUNT it always was");

    // Everything the TTY branch printed and `--json` used to throw away.
    for (const k of ["counts", "worst", "per_doc", "blind_spot", "orientation", "crosslink", "free_repairs"])
      assert.ok(k in d, `additive key ${k}`);
    assert.strictEqual(d.per_doc.length, d.docs, "one row per registered doc");
    assert.ok(Array.isArray(d.blind_spot), "the blind spot is the FILE LIST, not the number");
    assert.strictEqual(d.counts.FRESH + d.counts.AGING + d.counts.STALE + d.counts.unknown, d.docs);
    // The doc that actually pins the tier, BY NAME. A hash is not a thing
    // anybody can go and refresh.
    if (d.worst) assert.match(d.worst.file, /^wiki\//);
    for (const r of d.per_doc) {
      assert.ok(typeof r.file === "string" && "tier" in r && "covers" in r && "crosslink_tags" in r);
      assert.ok("used" in r, "usage rides along; `used: null` is NOT zero-use");
    }
    assert.strictEqual(d.orientation.present, false, "this fixture has none, and it says so with the free fix");
    assert.match(d.orientation.regenerate, /orc-orientation/);
  } finally {
    rmrf(root);
  }
});

// ── orc wiki docs ───────────────────────────────────────────────────────────

test("wiki docs: 0 registered / 1 no wiki / 3 unregistered, and the CLI's own order", () => {
  const bare = tmpdir();
  try {
    const none = cli(["wiki", "docs", "--json", "--dir", bare]);
    assert.strictEqual(none.status, 1, "no wiki at all");
    assert.strictEqual(j(none).reason, "no-wiki");
  } finally {
    rmrf(bare);
  }

  const { root } = wikiFixture();
  try {
    const ok = cli(["wiki", "docs", "--json", "--dir", root]);
    assert.strictEqual(ok.status, 0);
    const d = j(ok);
    assert.strictEqual(d.docs.length, 4);
    // The panel renders this ORDER and never invents a rank of its own.
    assert.deepStrictEqual(
      d.docs.map((x) => x.file),
      j(cli(["wiki", "status", "--json", "--dir", root])).per_doc.map((x) => x.file)
    );
    // `used: null` is unknown, NOT zero-use — unknown must never be reported as
    // dead, and no row may carry a retire hint on the strength of it.
    for (const r of d.docs) if (r.used === null) assert.strictEqual(r.retire_hint, false);

    // UNREGISTERED is its own state, and it exits 3.
    fs.rmSync(path.join(root, ".claude", "orc", "wiki-meta.json"));
    const un = cli(["wiki", "docs", "--json", "--dir", root]);
    assert.strictEqual(un.status, 3);
    assert.strictEqual(j(un).reason, "not-registered");
    assert.match(j(un).hint, /orc wiki sync/, "the FREE fix is named");
  } finally {
    rmrf(root);
  }
});

// ── orc wiki show ───────────────────────────────────────────────────────────

test("wiki show: 3 on an unknown doc, and --body is OPT-IN", () => {
  const { root } = wikiFixture();
  try {
    const missing = cli(["wiki", "show", "wiki/nope.md", "--json", "--dir", root]);
    assert.strictEqual(missing.status, 3);
    assert.strictEqual(j(missing).reason, "no-such-doc");
    assert.ok(j(missing).known.length, "and it lists the ones that exist");

    const plain = cli(["wiki", "show", "wiki/orc-feature-a.md", "--json", "--dir", root]);
    assert.strictEqual(plain.status, 0);
    assert.ok(!("body" in j(plain)), "prose is returned only on an explicit request");
    assert.deepStrictEqual(j(plain).covers, ["src/a.js"]);

    const withBody = cli(["wiki", "show", "wiki/orc-feature-a.md", "--body", "--json", "--dir", root]);
    assert.strictEqual(withBody.status, 0);
    assert.match(j(withBody).body, /# A Overview/);

    // The short form resolves too — the panel sends whatever the table showed.
    assert.strictEqual(cli(["wiki", "show", "orc-feature-a", "--json", "--dir", root]).status, 0);
  } finally {
    rmrf(root);
  }
});

// ── orc wiki coverage — A REPORT, NEVER A GATE ─────────────────────────────

test("wiki coverage: arithmetic, IMPACT_NOISE excluded, exit 1 with gaps and 0 without", () => {
  const { root, git } = wikiFixture();
  try {
    const gaps = cli(["wiki", "coverage", "--json", "--dir", root]);
    assert.strictEqual(gaps.status, 1, "blind spots exist — a BRANCH, not a failure");
    const d = j(gaps);
    assert.strictEqual(d.covered, 4, "four src files, one per doc");
    assert.ok(d.uncovered >= 2, "vendor/ is not covered");
    assert.strictEqual(d.coverage_pct, Math.round((d.covered / d.tracked) * 100));
    // ORC's own artifacts are covered by no doc BY DESIGN and must never read
    // as a documentation gap.
    assert.ok(!d.uncovered_dirs.some((r) => /^wiki|^\.claude/.test(r.dir)), "IMPACT_NOISE is excluded");
    // Collapsed to DIRECTORIES and ranked by file count.
    const counts = d.uncovered_dirs.map((r) => r.files);
    assert.deepStrictEqual(counts, [...counts].sort((a, b) => b - a), "biggest first");
    // NOT A TARGET. There is no threshold anywhere in the payload.
    assert.match(d.honesty, /report, not a target/);
    assert.ok(!("threshold" in d), "nothing to game");

    // Cover everything and it exits 0.
    fs.rmSync(path.join(root, "vendor"), { recursive: true, force: true });
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "drop vendor"]);
    const full = cli(["wiki", "coverage", "--json", "--dir", root]);
    assert.strictEqual(full.status, 0);
    assert.strictEqual(j(full).coverage_pct, 100);
  } finally {
    rmrf(root);
  }
});

// ── orc pattern show ────────────────────────────────────────────────────────

test("pattern show keeps the 0/1/2 contract, and NEVER invents a date", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const absent = cli(["pattern", "show", "react", "--json", "--dir", root]);
    assert.strictEqual(absent.status, 1, "absent, not an error");
    assert.strictEqual(j(absent).reason, "absent");

    // Exit 2 is a CALLER bug (a key the payload never heard of), unchanged
    // since v0.34.8 — a file extension is not a FRAMEWORK key.
    const unknown = cli(["pattern", "show", "js", "--json", "--dir", root]);
    assert.strictEqual(unknown.status, 2);
    assert.strictEqual(j(unknown).reason, "unknown-language");

    const dir = path.join(claudeDir, "orc", "patterns");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "react-pattern.md"),
      [
        "# React — project pattern",
        "",
        "## Component shape",
        "",
        "CONVENTION: function components, named export.",
        "",
        "## Invariants",
        "",
        "INVARIANT: never disable exhaustive-deps.",
        "CONFLICT — the project puts hooks in the component file; the playbook wants hooks/.",
        "",
      ].join("\n")
    );
    const d = j(cli(["pattern", "show", "react", "--json", "--dir", root]));
    assert.strictEqual(d.headered, false, "this file has no parseable header, and it says so");
    // THE RULE: a date is never reconstructed from an mtime (the /orc-pact
    // UNCHECKABLE rule, and the /orc-doc journal rule).
    assert.strictEqual(d.codified_at, null);
    assert.ok(d.header_note.includes("mtime"), "and it explains why there is no date");
    assert.ok(d.headings.includes("Component shape"), "it reports what it COULD parse");
    assert.strictEqual(d.conventions, 1);
    assert.strictEqual(d.invariants, 1);
    assert.strictEqual(d.conflicts.length, 1, "the most decision-shaped thing in the file gets its own field");
    assert.ok(!("body" in d), "--body is opt-in here too");
    assert.match(j(cli(["pattern", "show", "react", "--body", "--json", "--dir", root])).body, /React/);
  } finally {
    rmrf(root);
  }
});

// ── the gotcha reads ────────────────────────────────────────────────────────

test("gotcha prune --dry-run NAMES every entry and archives nothing", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const g = path.join(claudeDir, "orc", "gotchas.md");
    fs.mkdirSync(path.dirname(g), { recursive: true });
    const entry = (id, hits, seen) =>
      [`## ${id} · express · repair`, `- trigger: t${id}`, `- hits: ${hits}`, `- last_seen: ${seen}`, ""].join("\n");
    // `gotchas_max` has a floor of 5, so the fixture is six entries against it.
    fs.writeFileSync(
      g,
      entry("G-001", 9, "05-08-2026") +
        entry("G-002", 0, "01-01-2026") +
        entry("G-003", 1, "02-02-2026") +
        entry("G-004", 4, "03-03-2026") +
        entry("G-005", 5, "04-04-2026") +
        entry("G-006", 6, "05-05-2026")
    );
    assert.strictEqual(cli(["config", "set", "gotchas_max", "5", "--dir", root]).status, 0);

    const before = fs.readFileSync(g, "utf8");
    const dry = cli(["gotcha", "prune", "--dry-run", "--json", "--dir", root]);
    assert.strictEqual(dry.status, 1, "1 = it would prune");
    const d = j(dry);
    assert.strictEqual(d.dry_run, true);
    // A COUNT IS NOT CONSENT: the preview names the entry, its area, its hits
    // and WHY it is in the tail.
    assert.strictEqual(d.would_archive.length, 1);
    assert.strictEqual(d.would_archive[0].id, "G-002", "fewest hits first, then oldest");
    assert.ok(d.would_archive[0].why.includes("0 hit"));
    assert.strictEqual(fs.readFileSync(g, "utf8"), before, "and it wrote NOTHING");
    assert.match(d.honesty, /ARCHIVE, never a delete/);

    // The live list carries the cap, so "n of max" is renderable.
    assert.strictEqual(j(cli(["gotcha", "list", "--json", "--dir", root])).gotchas_max, 5);

    // show: every field, and 3 on an unknown id.
    const one = j(cli(["gotcha", "show", "G-001", "--json", "--dir", root]));
    assert.strictEqual(one.archived, false);
    assert.strictEqual(one.fields.trigger, "tG-001");
    assert.strictEqual(cli(["gotcha", "show", "G-404", "--json", "--dir", root]).status, 3);

    // The archive is reachable, and an eviction is recoverable from it.
    assert.strictEqual(cli(["gotcha", "list", "--archived", "--json", "--dir", root]).status, 1, "nothing archived yet");
    cli(["gotcha", "prune", "--dir", root]);
    const arch = cli(["gotcha", "list", "--archived", "--json", "--dir", root]);
    assert.strictEqual(arch.status, 0);
    assert.strictEqual(j(arch).count, 1);
    assert.strictEqual(j(cli(["gotcha", "show", "G-002", "--json", "--dir", root])).archived, true);
  } finally {
    rmrf(root);
  }
});

// ── doctor: exactly two wiki findings, and the restraint is the design ─────

test("doctor: wiki-unregistered fires, and wiki-debt fires on STALE but NEVER on AGING", () => {
  const { root, git } = wikiFixture();
  try {
    const ids = (r) => (j(r).findings || []).map((f) => f.id);

    // A registered, fresh wiki warns about nothing.
    assert.ok(!ids(cli(["doctor", "--json", "--dir", root])).includes("wiki-debt"));
    assert.ok(!ids(cli(["doctor", "--json", "--dir", root])).includes("wiki-unregistered"));

    // AGING is a NORMAL state. A doctor that warns about it is a doctor people
    // learn to ignore, so this must stay quiet.
    cli(["config", "set", "wiki_fresh_max", "1", "--dir", root]);
    cli(["config", "set", "wiki_aging_max", "50", "--dir", root]);
    for (let i = 0; i < 4; i++) {
      fs.appendFileSync(path.join(root, "src", "a.js"), "// x\n");
      git(["add", "-A"]);
      git(["commit", "-q", "-m", "touch " + i]);
    }
    const aging = j(cli(["wiki", "status", "--json", "--dir", root])).tier;
    assert.strictEqual(aging, "AGING", "the fixture is AGING at these edges");
    assert.ok(!ids(cli(["doctor", "--json", "--dir", root])).includes("wiki-debt"), "NEVER on AGING");

    // STALE with pending rows does warn, and it names the free-first plan.
    cli(["config", "set", "wiki_aging_max", "2", "--dir", root]);
    assert.strictEqual(j(cli(["wiki", "status", "--json", "--dir", root])).tier, "STALE");
    const stale = ids(cli(["doctor", "--json", "--dir", root]));
    assert.ok(stale.includes("wiki-debt"), "STALE with pending refreshes is real debt");

    // UNREGISTERED is the one a user can clear for ZERO tokens.
    fs.rmSync(path.join(root, ".claude", "orc", "wiki-meta.json"));
    const un = cli(["doctor", "--json", "--dir", root]);
    assert.ok(ids(un).includes("wiki-unregistered"));
    const f = j(un).findings.find((x) => x.id === "wiki-unregistered");
    assert.strictEqual(f.fix_command, "orc wiki sync");
    assert.match(f.message, /FREE/, "free, instant, and no re-scan");

    // Deliberately absent: a `pattern-missing` finding. A project with no cached
    // pattern is not misconfigured, and warning would be ORC nagging for a paid
    // scan.
    assert.ok(!ids(un).includes("pattern-missing"));
  } finally {
    rmrf(root);
  }
});
