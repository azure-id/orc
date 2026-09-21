"use strict";
// @test-pool spawn  — shells node bin/cli.js
// v1.7.0 — `orc rules`, the anti-slop rule surface.
//
// THREE THINGS THIS FILE EXISTS TO HOLD, because each one is a promise the
// surface makes in prose and could quietly stop keeping:
//
//   1. The ORC packs are READ-ONLY. A write aimed at them is refused BY NAME,
//      not quietly dropped — the `orc doc rules remove` lesson, applied before
//      anyone has the chance to learn it the expensive way here.
//   2. Precedence is REAL, not documentation. A user rule that names an ORC id
//      removes that rule from the dispatched slice, and the removal is stated
//      in the slice rather than being visible only by its absence.
//   3. `--json` is the WHOLE computed object. A field the human path prints and
//      the JSON omits is drift no lint can see, because both halves live in one
//      function.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, freshInstall, tmpdir } = require("../_helpers");

const json = (r) => JSON.parse(r.stdout);
// Every read here answers about a PROJECT, so `--dir` is how the CLI is told
// which one. A bare temp dir with no install still answers: the packs fall back
// to the package's own tree, which is the `phaseFilesRoot` precedent.
const at = (dir, ...a) => cli(["rules", ...a, "--dir", dir]);

test("orc rules — 65 rules in 4 packs, and the count comes from the files", () => {
  const dir = tmpdir();
  const r = at(dir, "packs", "--json");
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.count, 65);
  assert.equal(j.read_only, true);
  assert.deepEqual(
    j.packs.map((p) => [p.prefix, p.count]),
    [["OSW", 23], ["OSC", 22], ["OSD", 10], ["OSU", 10]]
  );
  // The tiers are the mechanism, so every pack must actually carry all three
  // populated or explain itself by being small. Only the totals are asserted.
  const tiers = j.packs.reduce((a, p) => a + p.tiers.HARD + p.tiers.PURPOSE + p.tiers.LOCK, 0);
  assert.equal(tiers, 65);
});

test("orc rules — an empty ledger is an ANSWER, not a failure", () => {
  const dir = tmpdir();
  const r = at(dir, "--json");
  // exit 1 = no project rules yet. The object is still whole, template included.
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.user.empty, true);
  assert.ok(j.user.template.includes("## P0"));
  assert.equal(j.precedence.length, 3);
  assert.match(j.line, /yours none/);
  assert.ok(j.boundary.includes("unsupported_request"));
});

test("orc rules — the three-layer ladder is in the object, in order", () => {
  const dir = tmpdir();
  const j = json(at(dir, "--json"));
  assert.deepEqual(j.precedence.map((p) => p.rank), [1, 2, 3]);
  assert.match(j.precedence[0].scope, /CODE and agent BEHAVIOUR only/);
  assert.match(j.precedence[1].beats, /OUTRIGHT/);
});

test("orc rules set/add/clear — the ledger is plain text, blocks are verbatim", () => {
  const dir = tmpdir();
  const body = "Never write a comment in Indonesian.\nMoney always carries its currency.";
  assert.equal(at(dir, "set", "--priority", "P0", "--text", body).status, 0);
  const j = json(at(dir, "user", "--json"));
  assert.equal(j.blocks.P0, body); // VERBATIM — not re-wrapped, not re-ordered
  assert.equal(j.counts.P0, 2);

  assert.equal(at(dir, "add", "--priority", "P0", "--text", "A third line.").status, 0);
  assert.equal(json(at(dir, "user", "--json")).counts.P0, 3);

  assert.equal(at(dir, "clear", "--priority", "P0").status, 0);
  assert.equal(json(at(dir, "user", "--json")).blocks.P0, "");
});

test("orc rules — a user's own notes above the first heading survive a round trip", () => {
  const dir = tmpdir();
  at(dir, "set", "--priority", "P0", "--text", "one");
  const file = json(at(dir, "user", "--json")).file;
  const withNote = "# my own notes\n# do not delete\n\n## P0\n\none\n";
  fs.writeFileSync(file, withNote);
  // set-all is the panel's writer, and the panel round-trips the whole file.
  assert.equal(at(dir, "set-all", "--text", withNote).status, 0);
  assert.ok(fs.readFileSync(file, "utf8").includes("# do not delete"));
});

test("orc rules — ORC packs are READ-ONLY and the refusal names what replaced it", () => {
  const dir = tmpdir();
  for (const sub of ["set", "add", "clear", "set-all"]) {
    const r = at(dir, sub, "--pack", "writing", "--priority", "P0", "--text", "x");
    assert.equal(r.status, 2, sub);
    assert.match(r.stderr, /read-only/);
    assert.match(r.stderr, /orc update/);
    assert.match(r.stderr, /orc rules add/); // it says what to do instead
  }
});

test("orc rules slice — the user's block rides ABOVE the ORC packs", () => {
  const dir = tmpdir();
  at(dir, "set", "--priority", "P0", "--text", "House voice: blunt.");
  const j = json(at(dir, "slice", "--lane", "orc", "--json"));
  const yours = j.text.indexOf("YOUR PROJECT'S RULES");
  const orc = j.text.indexOf("ORC RULES");
  assert.ok(yours >= 0 && orc > yours, "the user's rules must come first");
  assert.ok(j.text.includes("House voice: blunt."));
  assert.deepEqual(j.packs, ["writing", "code", "delivery"]);
  // The credit rides in the slice itself, not only in a docs file.
  assert.match(j.text, /petergyang\/no-ai-slop/);
  assert.match(j.text, /miqdadbadjuber\/anti-slop/);
});

test("orc rules slice — a named ORC id is REMOVED from the slice and the removal is stated", () => {
  const dir = tmpdir();
  at(dir, "set", "--priority", "P1", "--text", "OSW-13: em dashes are our house voice.");
  const j = json(at(dir, "slice", "--lane", "orc-wiki", "--json"));
  assert.equal(j.overrides.length, 1);
  assert.equal(j.overrides[0].id, "OSW-13");
  assert.equal(j.overrides[0].known, true);
  assert.ok(j.text.includes("OVERRIDDEN"));
  // The rule itself is gone from the pack listing — an override that left the
  // rule in the slice would be a label, not an override.
  assert.ok(!/^OSW-13 (HARD|PURPOSE|LOCK)/m.test(j.text));
});

test("orc rules slice — `ui` never rides unless the task asks for it", () => {
  const dir = tmpdir();
  assert.ok(!json(at(dir, "slice", "--lane", "orc", "--json")).packs.includes("ui"));
  assert.ok(json(at(dir, "slice", "--lane", "orc", "--pack", "ui", "--json")).packs.includes("ui"));
});

test("orc rules slice — HARD carries its body, PURPOSE and LOCK carry one line", () => {
  const dir = tmpdir();
  const text = json(at(dir, "slice", "--lane", "orc-wiki", "--json")).text;
  // OSW-01 is HARD: its body must be there.
  assert.match(text, /OSW-01 HARD · Lead with the point\nNo throat-clearing opener/);
  // OSW-04 is LOCK: the line is there and the next line is another rule.
  const i = text.indexOf("OSW-04 LOCK");
  assert.ok(i > 0);
  assert.match(text.slice(i).split("\n")[1], /^OS[WCDU]-\d{2} /);
});

test("orc rules slice — orc-doc is refused BY NAME, and the refusal points at its own ledger", () => {
  const dir = tmpdir();
  const r = at(dir, "slice", "--lane", "orc-doc");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /orc doc rules/);
});

test("orc rules slice — an unknown lane and an unknown pack both fail with a list", () => {
  const dir = tmpdir();
  assert.equal(at(dir, "slice", "--lane", "nope").status, 2);
  assert.match(at(dir, "slice", "--lane", "nope").stderr, /Lanes that do:/);
  assert.equal(at(dir, "slice", "--lane", "orc", "--pack", "nope").status, 2);
  assert.equal(at(dir, "show", "nope").status, 2);
  assert.equal(at(dir, "slice").status, 2); // no --lane at all
});

test("orc rules credits — every source is named, with its licence and what was taken", () => {
  const dir = tmpdir();
  const j = json(at(dir, "credits", "--json"));
  assert.equal(j.ok, true);
  const authors = j.sources.map((s) => s.author);
  for (const who of ["Peter G. Yang", "Miqdad Badjuber", "@ehmo", "@BioInfo", "Andrej Karpathy", "Matty Cartwright"])
    assert.ok(authors.includes(who), who + " must be credited");
  for (const s of j.sources) {
    assert.ok(s.repo, "every source carries a link");
    assert.ok(s.took, "every source says what ORC took from it");
    assert.ok(s.read, "every source records the date it was read");
  }
  assert.ok(j.text.includes("MIT"));
});

test("orc rules — the packs resolve to the INSTALLED copy when there is one", () => {
  const { root } = freshInstall();
  const j = json(at(root, "packs", "--json"));
  assert.equal(j.source, "installed");
  assert.ok(j.dir.includes(path.join(".claude", "skills", "_shared", "rules")));
  assert.equal(j.count, 65);
});

test("orc rules — the lane table and the pack layers agree with the files on disk", () => {
  const dir = tmpdir();
  const j = json(at(dir, "--json"));
  // `orc-doc` is excluded BY DESIGN, and the object says so rather than simply
  // omitting the row — an absence nobody can read is not an answer.
  assert.ok(!j.lanes["orc-doc"]);
  assert.ok(j.excluded["orc-doc"].includes("orc doc rules"));
  // Every pack a lane asks for must be a pack that exists.
  const ids = j.orc.packs.map((p) => p.id);
  for (const [lane, want] of Object.entries(j.lanes))
    for (const w of want) assert.ok(ids.includes(w), `${lane} wants unknown pack ${w}`);
});

test("orc rules --reset and --set-file", () => {
  const dir = tmpdir();
  at(dir, "set", "--priority", "P0", "--text", "something");
  assert.equal(at(dir, "--reset").status, 0);
  assert.equal(json(at(dir, "user", "--json")).empty, true);

  const src = path.join(tmpdir(), "rules-in.md");
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, "## P0\n\nfrom a file\n");
  assert.equal(at(dir, "--set-file", src).status, 0);
  assert.equal(json(at(dir, "user", "--json")).blocks.P0, "from a file");

  assert.equal(at(dir, "--set-file", path.join(dir, "nope.md")).status, 2);
});

test("orc rules — an unknown subcommand prints the usage, it does not guess", () => {
  const dir = tmpdir();
  const r = at(dir, "frobnicate");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage: orc rules/);
});

test("the call catalogue's lane list and RULE_LANE_PACKS cannot drift", () => {
  // The catalogue entry is spelled out rather than derived, because the table is
  // declared far below it and reading it there is a temporal dead zone. That
  // duplication is the reason this assertion exists.
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "cli.js"), "utf8");
  const table = /const RULE_LANE_PACKS = \{([\s\S]*?)\n\};/.exec(src);
  assert.ok(table, "RULE_LANE_PACKS must exist");
  const keys = [...table[1].matchAll(/^ {2}"?([a-z-]+)"?:/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 25);
  assert.ok(!keys.includes("orc-doc"), "orc-doc must never appear in the rules lane table");
});

// ── W4 · orc rules lint ────────────────────────────────────────────────────
// The lint's job is small on purpose. These tests hold the two promises that
// make a small lint trustworthy: it finds what it says it finds, and it never
// lets a clean exit stand in for a review nobody did.

function slopFixture() {
  const dir = tmpdir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "a.js"),
    [
      "// ==========================",
      "// MAIN LOGIC",
      "// Step 1: Validate input",
      "let count = 0;",
      "// TODO: improve this",
      "// \u{1F680} Performance",
      "function f() { if (count) { return 1; } } // end if",
      "// This will leverage a robust approach",
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(dir, "b.md"),
    "# \u{1F680} Getting Started\n\nIt's worth noting that this is a pivotal moment.\n"
  );
  fs.writeFileSync(path.join(dir, "c.css"), ".btn:focus { outline: none; }\n.h::after { content: 'AI Powered'; }\n");
  return dir;
}

const ids = (j) => [...new Set(j.findings.map((f) => f.rule))].sort();

test("orc rules lint — every checkable class actually fires", () => {
  const dir = slopFixture();
  const r = cli(["rules", "lint", dir, "--json"]);
  assert.equal(r.status, 1); // 1 = findings, and that is an answer, not a crash
  const j = json(r);
  for (const id of [
    "OSC-02", "OSC-03", "OSC-04", "OSC-05", "OSC-06", "OSC-07",
    "OSU-03", "OSU-06", "OSW-10", "OSW-11", "OSW-18",
  ])
    assert.ok(ids(j).includes(id), id + " must fire on the fixture");
  for (const f of j.findings) {
    assert.ok(f.file && f.line >= 1, "every finding is anchored");
    assert.ok(f.fix, "every finding says what to do instead");
    assert.ok(f.tier && f.title, "every finding carries its rule's tier and title");
  }
});

test("orc rules lint — the coverage line is mandatory, clean or not", () => {
  const dir = tmpdir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ok.md"), "# Title\n\nThe deploy takes four minutes.\n");
  const r = cli(["rules", "lint", dir, "--json"]);
  assert.equal(r.status, 0);
  const j = json(r);
  assert.equal(j.count, 0);
  // A clean exit that does not say what it did not check is the failure this
  // assertion exists to prevent.
  assert.match(j.coverage, /not checked here: \d+ rules/);
  assert.equal(j.checked_count + j.not_checked_count, j.total_rules);
  assert.equal(j.total_rules, 65);
  // And it must reach the HUMAN path too, not only the JSON.
  assert.match(cli(["rules", "lint", dir]).stdout, /not checked here/);
});

test("orc rules lint — the rules packs are skipped, and the skip is stated", () => {
  const packs = path.join(__dirname, "..", "..", "templates", "skills", "_shared", "rules");
  const j = json(cli(["rules", "lint", packs, "--json"]));
  assert.equal(j.count, 0, "a pack must not fail its own lint");
  assert.equal(j.exempt.packs.length, 6);
  assert.ok(j.exempt_note.includes("banned word"));
});

test("orc rules lint — orc-rules-ignore, by line and by file", () => {
  const dir = tmpdir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "line.md"), "# T\n\nWe leverage it.  <!-- orc-rules-ignore -->\n");
  assert.equal(json(cli(["rules", "lint", path.join(dir, "line.md"), "--json"])).count, 0);

  fs.writeFileSync(path.join(dir, "whole.md"), "<!-- orc-rules-ignore-file -->\n\nWe leverage a robust tapestry.\n");
  const j = json(cli(["rules", "lint", path.join(dir, "whole.md"), "--json"]));
  assert.equal(j.count, 0);
  assert.equal(j.exempt.files.length, 1);
});

test("orc rules lint — a user rule that NAMES a checkable id turns that check off", () => {
  const dir = slopFixture();
  const before = json(cli(["rules", "lint", dir, "--json"]));
  assert.ok(ids(before).includes("OSW-10"));

  // The ledger lives under the project the lint is run against.
  assert.equal(
    cli(["rules", "add", "--dir", dir, "--priority", "P0", "--text", "OSW-10: our house words are fine."]).status,
    0
  );
  const after = json(cli(["rules", "lint", dir, "--json", "--dir", dir]));
  assert.ok(after.suppressed.includes("OSW-10"));
  assert.ok(!ids(after).includes("OSW-10"), "a named id is not checked");
  assert.ok(after.suppressed_note, "and the suppression is never silent");
  assert.ok(after.checked_count < before.checked_count);
});

test("orc rules lint — --pack narrows the CHECKS, not the files", () => {
  const dir = slopFixture();
  const j = json(cli(["rules", "lint", dir, "--pack", "c", "--json"]));
  assert.equal(j.files, 3, "every file is still read");
  assert.ok(ids(j).every((id) => id.startsWith("OSC-")), "only the code pack's checks ran");
  assert.equal(cli(["rules", "lint", dir, "--pack", "nope"]).status, 2);
});

test("orc rules lint — no target and no lintable target are different answers", () => {
  assert.equal(cli(["rules", "lint"]).status, 2);
  assert.match(cli(["rules", "lint"]).stderr, /--staged/);
  const dir = tmpdir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "x.bin"), "  ");
  assert.equal(cli(["rules", "lint", dir]).status, 2);
});

test("orc rules lint — OSW-13 is a DOSE rule, measured per file", () => {
  const dir = tmpdir();
  fs.mkdirSync(dir, { recursive: true });
  // Short output carries none at all.
  fs.writeFileSync(path.join(dir, "short.md"), "# T\n\nThe build — finally — passes.\n");
  const j = json(cli(["rules", "lint", path.join(dir, "short.md"), "--json"]));
  const d = j.findings.filter((f) => f.rule === "OSW-13");
  assert.equal(d.length, 1, "one finding per FILE, never one per dash");
  assert.match(d[0].evidence, /em dashes/);
});

// ── W5 · the injection ─────────────────────────────────────────────────────
// The manifest already lints itself in `verify-contracts.js`. What it cannot
// see is whether the three registries that must agree — the lane→pack table,
// the phase manifest, and the call catalogue — say the same thing, because each
// one is legitimate on its own.

const CLI_SRC = () => fs.readFileSync(path.join(__dirname, "..", "..", "bin", "cli.js"), "utf8");
const block = (name, open, close) => {
  const src = CLI_SRC();
  const i = src.indexOf(name);
  assert.ok(i > 0, name + " must exist in bin/cli.js");
  return src.slice(i, src.indexOf("\n" + close, i));
};

test("the three registries name the same lanes", () => {
  const packTable = [...block("const RULE_LANE_PACKS = {", "{", "};").matchAll(/^ {2}"?([a-z-]+)"?:/gm)].map((m) => m[1]).sort();
  const phaseRow = [...block("  rules: [", "[", "  ],").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).sort();
  const catalogue = [...block('"rules-slice": {', "{", "  },").matchAll(/lanes: \[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1]))
    .sort();

  assert.equal(packTable.length, 28);
  assert.deepEqual(phaseRow, packTable, "LANE_PHASES.rules must equal RULE_LANE_PACKS");
  assert.deepEqual(catalogue, packTable, "the call catalogue's lanes[] must equal RULE_LANE_PACKS");
  for (const set of [packTable, phaseRow, catalogue])
    assert.ok(!set.includes("orc-doc"), "orc-doc is excluded from the rules surface by design");
});

test("every lane that runs the phase points at the file", () => {
  const packTable = [...block("const RULE_LANE_PACKS = {", "{", "};").matchAll(/^ {2}"?([a-z-]+)"?:/gm)].map((m) => m[1]);
  const skills = path.join(__dirname, "..", "..", "templates", "skills");
  for (const lane of packTable) {
    const spine = fs.readFileSync(path.join(skills, lane, "SKILL.md"), "utf8");
    assert.ok(spine.includes("_shared/phases/rules.md"), lane + " must point at the phase file");
    assert.ok(spine.includes("orc rules slice --lane " + lane), lane + " must name its own slice call");
  }
});

test("the phase file declares exactly the layers the manifest says", () => {
  const f = path.join(__dirname, "..", "..", "templates", "skills", "_shared", "phases", "rules.md");
  const body = fs.readFileSync(f, "utf8");
  assert.ok(body.includes("<!-- orc:layer core -->"));
  assert.ok(!/<!-- orc:layer (full|trim|composed) -->/.test(body), "rules.md is single-layer by design");
  // The three things a reader must not have to go and look up.
  assert.match(body, /house rules\s+>\s+your rules\s+>\s+ORC rules/);
  assert.match(body, /unsupported_request/);
  assert.match(body, /rules_conflicts\[\]/);
});

test("the rules phase is ordered immediately after the house card", () => {
  const order = [...block("const PHASE_ORDER = [", "[", "];").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  assert.equal(order[order.indexOf("house-rules") + 1], "rules", "the order in a slice IS the contract");
});

test("the preflight and return contracts name the new fields", () => {
  const shared = path.join(__dirname, "..", "..", "templates", "skills", "_shared");
  const pre = fs.readFileSync(path.join(shared, "phases", "preflight.md"), "utf8");
  assert.match(pre, /rules: {4}ORC 65/);
  assert.match(pre, /yours none/);
  const ret = fs.readFileSync(path.join(shared, "return-validation.md"), "utf8");
  for (const f of ["rules_applied[]", "rules_conflicts[]", "rules_overridden[]"])
    assert.ok(ret.includes(f), "return-validation.md must define " + f);
  assert.match(ret, /absent is malformed/i);
});

test("the slash command exists and never tells anyone to edit the ledger by hand", () => {
  const f = path.join(__dirname, "..", "..", "templates", "commands", "orc-rules.md");
  const body = fs.readFileSync(f, "utf8");
  assert.match(body, /^---\ndescription: /);
  assert.match(body, /house rules\s+>\s+your rules\s+>\s+ORC rules/);
  assert.match(body, /orc rules .* is its only\s*\nwriter/s);
  // The credit is in the command a user actually reads, not only in a docs file.
  for (const who of ["petergyang/no-ai-slop", "miqdadbadjuber/anti-slop", "ehmo/slopkit"])
    assert.ok(body.includes(who), who + " must be credited where the user reads it");
});

// ── v1.9.0 — the compact card, and who decides it ──────────────────────────
// The card rides on EVERY spawn, and /orc-quick is the lane with the smallest
// tasks under the largest fixed card. `rules.md` names `rulesSlice()` as the
// only lever on that cost, so the compact form is the CLI's decision and the
// lane can neither ask for it nor refuse it. What it may never do is drop a
// rule: a shorter card that silently stops carrying a HARD id is not a saving,
// it is a gate that stopped firing.
test("orc rules slice — the compact form drops examples, never a rule", () => {
  const dir = tmpdir();
  const q = json(at(dir, "slice", "--lane", "orc-quick", "--json"));
  const m = json(at(dir, "slice", "--lane", "orc-mini", "--json"));

  assert.equal(q.compact, true, "orc-quick gets the compact card");
  assert.equal(m.compact, false, "every other lane gets the full card");
  assert.ok(q.text.length < m.text.length * 0.6, "compact is not meaningfully shorter");
  // The measured target the release states. A card over this is the cost this
  // change exists to cut, quietly back.
  assert.ok(q.text.length <= 6200, "the compact card is " + q.text.length + " chars");

  // Every HARD id the full card carries is still THERE, with its title.
  const hardIds = [...m.text.matchAll(/^([A-Z]{3}-\d+) HARD · (.+)$/gm)].map((x) => [x[1], x[2]]);
  assert.ok(hardIds.length >= 20, "the full card should carry many HARD rules");
  for (const [id, title] of hardIds) {
    assert.ok(q.text.includes(id + " HARD · "), "the compact card dropped " + id);
    assert.ok(q.text.includes(title.split(" — ")[0]), "the compact card dropped " + id + "'s title");
  }
  // And every HARD rule is now ONE line: no body paragraph rode along.
  for (const line of q.text.split("\n"))
    if (/ HARD · /.test(line)) assert.ok(line.length <= 200, "a compact HARD line is still long: " + line.slice(0, 80));

  // The pack file is NAMED, so nothing is hidden — it is one Read away.
  for (const pack of ["writing.md", "code.md", "delivery.md"])
    assert.ok(q.text.includes(pack + " for the body"), "the compact card never names " + pack);

  // `line` counts the rules IN FORCE. Compacting changes how a rule is written,
  // never whether it applies, so the two lanes must report the same line.
  assert.equal(q.line, m.line, "the compact card changed the rules-in-force line");
  // The boundary and the three return fields survive in both.
  for (const f of ["rules_applied[]", "rules_conflicts[]", "rules_overridden[]"])
    assert.ok(q.text.includes(f), "the compact card dropped " + f);
  assert.ok(q.text.includes("unsupported_request"), "the compact card dropped the boundary");
});
