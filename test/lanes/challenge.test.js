"use strict";
// v0.47.0 — /orc-challenge's deterministic half.
//
// The rules worth a test are the ones a model could route around if they lived
// only in prose: `init` refusing without a goal, `record` dropping a finding
// with no `serves`, the conservation gate, the rebuttal gate, the silent-
// dimension gate, and the fact that PASS is arithmetic the CLI does — not a
// verdict the judge announces.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, rmrf, tmpdir, REPO } = require("../_helpers");

const ARTIFACT = [
  "# TSD — Payments",
  "",
  "## Overview",
  "",
  "The payments service handles refunds for merchants across two regions.",
  "",
  "## Scope",
  "",
  "TBD",
  "",
  "## Low-level design",
  "",
  "The SoR is updated by the worker when a refund is processed, and the idempotency",
  "window is applied appropriately so that duplicate writes are prevented in most of",
  "the cases that we have seen so far in production over the last several quarters.",
  "",
  "## Rollout",
  "",
  "We will spin up the new worker and roll out to some merchants.",
  "",
].join("\n");

const TEMPLATE = ["# TSD Template", "", "## Overview", "", "## Scope", "", "## Low-level design", "", "## Error handling", "", "## Rollout", ""].join("\n");

function project() {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, "docs", "templates"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "tsd.md"), ARTIFACT);
  fs.writeFileSync(path.join(root, "docs", "templates", "tsd.md"), TEMPLATE);
  spawnSync("git", ["init", "-q", "."], { cwd: root });
  spawnSync("git", ["add", "-A"], { cwd: root });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: root });
  return root;
}

const INIT = (root, extra) => [
  "challenge", "init", "tsd", "--dir", root,
  "--artifact", "docs/tsd.md",
  "--kind", "tsd",
  "--goal", "a backend team implements this without asking me anything",
  "--audience", "backend engineers, 2 of 5 non-native English readers",
  "--done-means", "no open interface question and no TBD in the design sections",
  "--template", "docs/templates/tsd.md",
  // v0.49.1 — `--council` has no default either (rule 12). `none` reproduces
  // the v0.47.0 judge-plus-reader review EXACTLY, which is what every test
  // written before the council is asserting about.
  "--council", "none",
  ...(extra || []),
];

const cyc = (root) => path.join(root, "orc", "orc-challenge", "tsd");

function writeVerdict(root, n, body) {
  const dir = path.join(cyc(root), "iteration-" + String(n).padStart(2, "0"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "verdict.md"), body || `# Verdict — iteration ${n}\n`);
}

function record(root, n, payload) {
  const f = path.join(root, `v${n}.json`);
  fs.writeFileSync(f, JSON.stringify(payload));
  return cli(["challenge", "record", "tsd", "--dir", root, "--iteration", String(n), "--from", `v${n}.json`, "--json"]);
}

const DIMS_OK = ["D1", "D2", "D3", "D4", "D5", "D6"].map((id) => ({ id, status: "CHECKED", findings: 0 }));

// ── rule 0: the goal has no default, and `init` says which flag is missing ───

test("init refuses without a goal, and NAMES the flag it is missing", () => {
  const root = project();
  try {
    for (const drop of ["--goal", "--audience", "--done-means"]) {
      const argv = INIT(root).filter((a, i, all) => a !== drop && all[i - 1] !== drop);
      const r = cli(argv);
      assert.strictEqual(r.status, 2, `${drop} missing must be a hard error`);
      assert.ok(r.stderr.includes(drop), `the error names ${drop}`);
      assert.ok(!fs.existsSync(cyc(root)), "nothing is created on a refusal");
    }
    // And it never substitutes a default: no goals.md exists to fall back on.
    assert.ok(!fs.existsSync(path.join(cyc(root), "goals.md")));
  } finally {
    rmrf(root);
  }
});

test("init freezes goals.md and template.md, and refuses without a template decision", () => {
  const root = project();
  try {
    const noTpl = INIT(root).filter((a, i, all) => a !== "--template" && all[i - 1] !== "--template");
    assert.strictEqual(cli(noTpl).status, 2, "a template decision is required");

    assert.strictEqual(cli(INIT(root)).status, 0);
    const goals = fs.readFileSync(path.join(cyc(root), "goals.md"), "utf8");
    assert.match(goals, /a backend team implements this/, "the goal is frozen verbatim");
    assert.match(goals, /non-native English readers/, "the audience is frozen");
    assert.strictEqual(fs.readFileSync(path.join(cyc(root), "template.md"), "utf8"), TEMPLATE, "the template is COPIED, not pointed at");

    // --no-template is allowed, and D1 becomes NOT-CHECKED with that reason.
    const root2 = project();
    const argv = INIT(root2).filter((a, i, all) => a !== "--template" && all[i - 1] !== "--template");
    argv.push("--no-template");
    assert.strictEqual(cli(argv).status, 0);
    const st = JSON.parse(cli(["challenge", "status", "tsd", "--dir", root2, "--json"]).stdout);
    assert.strictEqual(st.no_template, true);
    rmrf(root2);
  } finally {
    rmrf(root);
  }
});

// ── the gates in `record` ────────────────────────────────────────────────────

test("record DROPS a finding with no `serves`, and keeps the rest", () => {
  const root = project();
  try {
    cli(INIT(root));
    writeVerdict(root, 1);
    const r = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      dimensions: DIMS_OK,
      findings: [
        { id: "F-001", dimension: "D2", severity: "P1", anchor: "docs/tsd.md:13", serves: "done_means" },
        { id: "F-099", dimension: "D2", severity: "P0", anchor: "docs/tsd.md:5" },
      ],
    });
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.dropped.length, 1, "the untraceable finding is dropped");
    assert.strictEqual(out.dropped[0].id, "F-099");
    assert.strictEqual(out.severities.P0, 0, "a dropped P0 never counts");
    assert.strictEqual(out.blocking, 1);
  } finally {
    rmrf(root);
  }
});

test("record rejects coverage below 100 and names the missing ids", () => {
  const root = project();
  try {
    cli(INIT(root));
    writeVerdict(root, 1);
    record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      dimensions: DIMS_OK,
      findings: [
        { id: "F-001", dimension: "D2", severity: "P1", anchor: "a:1", serves: "goal" },
        { id: "F-002", dimension: "D3", severity: "P1", anchor: "a:2", serves: "goal" },
      ],
    });
    writeVerdict(root, 2);
    const r = record(root, 2, {
      verdict_file: "iteration-02/verdict.md",
      dimensions: DIMS_OK,
      findings: [{ id: "F-001", dimension: "D2", severity: "P1", anchor: "a:1", serves: "goal", outcome: "resolved" }],
    });
    assert.strictEqual(r.status, 2);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.reason, "coverage");
    assert.deepStrictEqual(out.missing, ["F-002"], "the missing id is named, not counted");
  } finally {
    rmrf(root);
  }
});

test("record rejects an unknown carry id, a reasonless withdrawal and an uncited supersede", () => {
  const root = project();
  try {
    cli(INIT(root));
    writeVerdict(root, 1);
    record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      dimensions: DIMS_OK,
      findings: [{ id: "F-001", dimension: "D2", severity: "P1", anchor: "a:1", serves: "goal" }],
    });
    writeVerdict(root, 2);
    const base = { verdict_file: "iteration-02/verdict.md", dimensions: DIMS_OK };
    const F = (o) => ({ id: "F-001", dimension: "D2", severity: "P1", anchor: "a:1", serves: "goal", ...o });

    let r = record(root, 2, { ...base, findings: [F({ outcome: "resolved" }), { id: "F-777", dimension: "D2", severity: "P1", anchor: "a:9", serves: "goal", outcome: "resolved" }] });
    assert.strictEqual(JSON.parse(r.stdout).reason, "unknown-carry-id");

    r = record(root, 2, { ...base, findings: [F({ outcome: "withdrawn" })] });
    assert.strictEqual(JSON.parse(r.stdout).reason, "withdrawn-no-reason");

    r = record(root, 2, { ...base, findings: [F({ outcome: "superseded" })] });
    assert.strictEqual(JSON.parse(r.stdout).reason, "superseded-no-id");
  } finally {
    rmrf(root);
  }
});

test("record rejects an IGNORED rebuttal — one bad finding must not loop forever", () => {
  const root = project();
  try {
    cli(INIT(root));
    writeVerdict(root, 1);
    record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      dimensions: DIMS_OK,
      findings: [{ id: "F-001", dimension: "D5", severity: "P1", anchor: "a:1", serves: "audience" }],
    });
    assert.strictEqual(cli(["challenge", "rebut", "tsd", "F-001", "it is a quotation", "--dir", root]).status, 0);
    assert.strictEqual(cli(["challenge", "rebut", "tsd", "F-001", "--dir", root]).status, 2, "a rebuttal needs a reason");

    writeVerdict(root, 2);
    const F = { id: "F-001", dimension: "D5", severity: "P1", anchor: "a:1", serves: "audience", outcome: "still-open" };
    let r = record(root, 2, { verdict_file: "iteration-02/verdict.md", dimensions: DIMS_OK, findings: [F] });
    assert.strictEqual(JSON.parse(r.stdout).reason, "rebuttal-ignored");

    r = record(root, 2, {
      verdict_file: "iteration-02/verdict.md",
      dimensions: DIMS_OK,
      findings: [{ ...F, outcome: "withdrawn", reason: "agreed — it is a quotation" }],
      rebuttals_addressed: [{ id: "F-001", result: "withdrawn", reason: "agreed — it is a quotation" }],
    });
    assert.strictEqual(r.status, 0, "an answered rebuttal records normally");
    assert.strictEqual(JSON.parse(r.stdout).passed, true, "withdrawing the last blocker passes");
  } finally {
    rmrf(root);
  }
});

test("record rejects a SILENT dimension, and accepts NOT-CHECKED with a reason", () => {
  const root = project();
  try {
    cli(INIT(root));
    writeVerdict(root, 1);
    let r = record(root, 1, { verdict_file: "iteration-01/verdict.md", dimensions: DIMS_OK.slice(0, 5), findings: [] });
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.reason, "dimension-silent");
    assert.strictEqual(out.dimension, "D6");

    r = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      dimensions: [...DIMS_OK.slice(0, 5), { id: "D6", status: "NOT-CHECKED" }],
      findings: [],
    });
    assert.strictEqual(JSON.parse(r.stdout).reason, "dimension-no-reason");

    r = record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      dimensions: [...DIMS_OK.slice(0, 5), { id: "D6", status: "NOT-CHECKED", reason: "challenge_reader is off" }],
      findings: [],
    });
    assert.strictEqual(r.status, 0, "NOT-CHECKED with a reason is legal");
  } finally {
    rmrf(root);
  }
});

test("record rejects a verdict body that is not on disk", () => {
  const root = project();
  try {
    cli(INIT(root));
    const r = record(root, 1, { verdict_file: "iteration-01/verdict.md", dimensions: DIMS_OK, findings: [] });
    assert.strictEqual(JSON.parse(r.stdout).reason, "no-verdict-file");
  } finally {
    rmrf(root);
  }
});

// ── PASS is arithmetic, and the escape valves change it ─────────────────────

test("PASS is computed from challenge_pass_severity, and accepted findings are subtracted", () => {
  const root = project();
  try {
    cli(INIT(root));
    writeVerdict(root, 1);
    const F = (id, sev) => ({ id, dimension: "D2", severity: sev, anchor: "a:1", serves: "goal" });
    let r = record(root, 1, { verdict_file: "iteration-01/verdict.md", dimensions: DIMS_OK, findings: [F("F-001", "P2")] });
    assert.strictEqual(JSON.parse(r.stdout).passed, true, "at the default p1, a P2 does not block");

    // Raise the bar: p2 blocks, and the SAME open finding now fails.
    assert.strictEqual(cli(["challenge", "set-nothing"], {}).status, 1); // unknown subcommand still exits 1
    cli(["config", "set", "challenge_pass_severity", "p2", "--dir", root]);
    const st = JSON.parse(cli(["challenge", "status", "tsd", "--dir", root, "--json"]).stdout);
    assert.notStrictEqual(st.state, "PASSED", "the same finding blocks once the bar moves");

    // Accepting it clears the block IMMEDIATELY — otherwise the escape valve
    // does not escape until one more paid iteration has run.
    assert.strictEqual(cli(["challenge", "accept", "tsd", "F-001", "known gap", "--dir", root]).status, 0);
    assert.strictEqual(cli(["challenge", "accept", "tsd", "F-001", "--dir", root]).status, 2, "an acceptance needs a reason");
    assert.strictEqual(cli(["challenge", "accept", "tsd", "F-404", "x", "--dir", root]).status, 3, "an unknown id is exit 3");
    const st2 = JSON.parse(cli(["challenge", "status", "tsd", "--dir", root, "--json"]).stdout);
    assert.strictEqual(st2.state, "PASSED");
    assert.strictEqual(st2.counts.accepted, 1, "it stops blocking but stays visible");
  } finally {
    rmrf(root);
  }
});

// ── the state machine ───────────────────────────────────────────────────────

test("the state machine: AWAITING-JUDGE → AWAITING-FIX → AWAITING-RECHECK, TAMPERED, MISSING-REVISION", () => {
  const root = project();
  try {
    cli(INIT(root));
    const state = () => JSON.parse(cli(["challenge", "status", "tsd", "--dir", root, "--json"]).stdout).state;
    assert.strictEqual(state(), "AWAITING-JUDGE", "created, not yet judged");

    writeVerdict(root, 1);
    record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      dimensions: DIMS_OK,
      findings: [{ id: "F-001", dimension: "D2", severity: "P1", anchor: "docs/tsd.md:13", serves: "goal" }],
    });
    assert.strictEqual(state(), "AWAITING-FIX", "nothing has changed yet");

    fs.appendFileSync(path.join(root, "docs", "tsd.md"), "\n## Error handling\n\nRetry three times.\n");
    assert.strictEqual(state(), "AWAITING-RECHECK", "the artifact moved");

    // A verdict that changed under us is REPORTED, never silently re-graded.
    fs.appendFileSync(path.join(cyc(root), "iteration-01", "verdict.md"), "\nedited by the fix session\n");
    assert.strictEqual(state(), "TAMPERED");
    const r = cli(["challenge", "status", "tsd", "--dir", root, "--json"]);
    assert.strictEqual(r.status, 2, "TAMPERED is never a passing exit code");
  } finally {
    rmrf(root);
  }
});

test("MISSING-REVISION lists candidates and NEVER adopts one", () => {
  const root = project();
  try {
    const argv = INIT(root, ["--revision", "new-file", "--revision-pattern", "docs/tsd-v{n}.md"]);
    assert.strictEqual(cli(argv).status, 0);
    writeVerdict(root, 1);
    record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      dimensions: DIMS_OK,
      findings: [{ id: "F-001", dimension: "D2", severity: "P1", anchor: "docs/tsd.md:13", serves: "goal" }],
    });
    fs.writeFileSync(path.join(root, "docs", "tsd-v2.draft.md"), "a draft\n");

    const d = cli(["challenge", "diff", "tsd", "--dir", root, "--json"]);
    assert.strictEqual(d.status, 2, "MISSING-REVISION is exit 2");
    const out = JSON.parse(d.stdout);
    assert.strictEqual(out.expected, "docs/tsd-v2.md", "{n} resolves to the iteration the revision answers");
    assert.strictEqual(out.found, false);
    assert.ok(out.candidates.some((c) => c.path === "docs/tsd-v2.draft.md"), "the draft is LISTED");
    assert.ok(!out.candidates.some((c) => c.path.startsWith("orc/")), "the review trail is never a candidate");
    assert.match(out.note, /never adopted/);

    // The escape is a RECORDED command, and it refuses a path inside the trail.
    assert.strictEqual(cli(["challenge", "expect", "tsd", "--set", "orc/orc-challenge/tsd/x.md", "--dir", root]).status, 2);
    assert.strictEqual(cli(["challenge", "expect", "tsd", "--set", "docs/tsd-v2.draft.md", "--dir", root]).status, 0);
    const d2 = JSON.parse(cli(["challenge", "diff", "tsd", "--dir", root, "--json"]).stdout);
    assert.strictEqual(d2.expected, "docs/tsd-v2.draft.md");
    assert.strictEqual(d2.found, true);
  } finally {
    rmrf(root);
  }
});

test("the state word list in the CLI and in cycle-state.md are the same list", () => {
  // Documented drift the token lint cannot see: a word list is not a token.
  const cliText = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const doc = fs.readFileSync(path.join(REPO, "templates", "skills", "orc-challenge", "references", "cycle-state.md"), "utf8");
  const states = [...(cliText.match(/const CHALLENGE_STATES = \[([\s\S]*?)\n\];/) || ["", ""])[1].matchAll(/"([A-Z-]+)"/g)].map((m) => m[1]);
  assert.strictEqual(states.length, 7);
  for (const s of states) assert.ok(doc.includes(s), `${s} is documented in cycle-state.md`);
});

test("the dimension enum in the CLI and in dimensions.md are the same list", () => {
  const cliText = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const doc = fs.readFileSync(path.join(REPO, "templates", "skills", "orc-challenge", "references", "dimensions.md"), "utf8");
  const dims = [...(cliText.match(/const CHALLENGE_DIMS = \[([\s\S]*?)\];/) || ["", ""])[1].matchAll(/"(D\d)"/g)].map((m) => m[1]);
  assert.strictEqual(dims.length, 7);
  for (const d of dims) assert.ok(new RegExp("`" + d + "`").test(doc), `${d} is defined in dimensions.md`);
  assert.strictEqual(cli(["challenge", "init", "x", "--artifact", "docs/tsd.md", "--goal", "g", "--audience", "a", "--done-means", "d", "--no-template", "--dimensions", "D9"]).status, 2);
});

// ── the lint: a signal, never a verdict ─────────────────────────────────────

test("lint finds the structural and prose defects, and says it is heuristic", () => {
  const root = project();
  try {
    const r = cli(["challenge", "lint", path.join(root, "docs", "tsd.md"), "--template", path.join(root, "docs", "templates", "tsd.md"), "--json"]);
    assert.strictEqual(r.status, 1, "findings are exit 1");
    const out = JSON.parse(r.stdout);
    const what = out.findings.map((f) => f.what).join("\n");

    assert.match(what, /required section missing: "error handling"/, "a missing required section");
    assert.match(what, /placeholder marker: "TBD"/, "a placeholder marker");
    assert.match(what, /idiom \/ phrasal verb: "spin up"/, "an idiom");
    assert.match(what, /ambiguous quantifier: "some"/, "an ambiguous quantifier");
    // Sentences are measured over PARAGRAPHS: this one is hard-wrapped across
    // three lines and is still a 43-word sentence.
    assert.match(what, /sentence is 4\d words \(over 25\)/, "a wrapped long sentence is still long");
    assert.ok(out.metrics.sentence_p90 > 25, "the distribution reflects it");

    // The H1 is a TITLE, not a section: it is never "missing" and never "invented".
    assert.ok(!/tsd template/i.test(what), "the template's own H1 is not a required section");
    assert.ok(!/section not in the template: "TSD — Payments"/.test(what), "the document title is not an invention");

    assert.strictEqual(out.structure.missing.length, 1);
    assert.match(out.honesty[0], /SIGNAL, not a verdict/);
    assert.match(out.honesty[1], /heuristic/);

    // A clean file is exit 0, and an unreadable path is exit 2 — never a crash.
    const clean = path.join(root, "clean.md");
    fs.writeFileSync(clean, "# Title\n\n## One\n\nThis section explains the retry budget, which is three attempts before the dead letter queue.\n");
    assert.strictEqual(cli(["challenge", "lint", clean]).status, 0);
    assert.strictEqual(cli(["challenge", "lint", path.join(root, "nope.md")]).status, 2);
  } finally {
    rmrf(root);
  }
});

test("outline and the read commands keep their exit-code contract", () => {
  const root = project();
  try {
    assert.strictEqual(cli(["challenge", "list", "--dir", root, "--json"]).status, 3, "no cycles is exit 3");
    assert.strictEqual(cli(["challenge", "status", "nope", "--dir", root, "--json"]).status, 3);
    assert.strictEqual(cli(["challenge", "show", "nope", "--dir", root, "--json"]).status, 3);
    assert.strictEqual(cli(["challenge", "diff", "nope", "--dir", root, "--json"]).status, 3);
    assert.strictEqual(cli(["challenge", "report", "nope", "--dir", root, "--json"]).status, 3);

    cli(INIT(root));
    assert.strictEqual(cli(["challenge", "list", "--dir", root, "--json"]).status, 1, "an in-flight cycle is exit 1");
    assert.strictEqual(cli(["challenge", "outline", path.join(root, "docs", "tsd.md"), "--json"]).status, 0);
    assert.strictEqual(cli(["challenge", "outline", path.join(root, "nope.md")]).status, 2);
    assert.strictEqual(cli(["challenge", "--global"]).status, 1, "the lane is project-scoped");
  } finally {
    rmrf(root);
  }
});

// ── the frozen yardsticks ───────────────────────────────────────────────────

test("re-freezing a goal or a template is a RECORDED event and needs a reason", () => {
  const root = project();
  try {
    cli(INIT(root));
    writeVerdict(root, 1);
    record(root, 1, { verdict_file: "iteration-01/verdict.md", dimensions: DIMS_OK, findings: [] });

    fs.writeFileSync(path.join(root, "docs", "goals-v2.md"), "# Goal\n\nsomething else entirely\n");
    assert.strictEqual(cli(["challenge", "goals", "tsd", "--set", "docs/goals-v2.md", "--dir", root]).status, 2, "no reason, no re-freeze");
    assert.strictEqual(
      cli(["challenge", "goals", "tsd", "--set", "docs/goals-v2.md", "--reason", "the board moved", "--dir", root]).status,
      0
    );
    const show = JSON.parse(cli(["challenge", "show", "tsd", "--dir", root, "--json"]).stdout);
    assert.strictEqual(show.goals.version, 2);
    assert.ok(show.events.some((e) => e.kind === "regoal"), "the regoal is an event on the record");
    // The PRIOR iteration keeps its stamp — a history against a moving goal is
    // not a history.
    assert.strictEqual(show.iterations[0].graded_against_goal, 1);
  } finally {
    rmrf(root);
  }
});

test("report derives CHALLENGE.md from the ledger, and a final report only on a pass", () => {
  const root = project();
  try {
    cli(INIT(root));
    writeVerdict(root, 1);
    record(root, 1, {
      verdict_file: "iteration-01/verdict.md",
      dimensions: [...DIMS_OK.slice(0, 5), { id: "D6", status: "NOT-CHECKED", reason: "challenge_reader is off" }],
      findings: [{ id: "F-001", dimension: "D2", severity: "P1", anchor: "docs/tsd.md:13", serves: "goal", what_is_wrong: "no value", consequence: "two teams differ", acceptance_line: "names the window" }],
    });
    assert.strictEqual(cli(["challenge", "report", "tsd", "--dir", root]).status, 0);
    const md = fs.readFileSync(path.join(cyc(root), "CHALLENGE.md"), "utf8");
    assert.match(md, /orc-challenge:derived/, "it says it is derived and must not be hand-edited");
    assert.match(md, /a backend team implements this/, "the goal is restated");
    assert.match(md, /NOT-CHECKED — challenge_reader is off/, "a skipped dimension keeps its reason");
    assert.match(md, /^## Convergence$/m);
    assert.ok(!fs.readdirSync(cyc(root)).some((f) => f.startsWith("final-report-")), "no final report on a fail");

    cli(["challenge", "accept", "tsd", "F-001", "known gap", "--dir", root]);
    cli(["challenge", "report", "tsd", "--dir", root]);
    const files = fs.readdirSync(cyc(root));
    assert.ok(files.some((f) => /^final-report-\d{6}-\d{6}\.md$/.test(f)), "the final report is DDMMYY-HHMMSS, legal on Windows");
    const md2 = fs.readFileSync(path.join(cyc(root), "CHALLENGE.md"), "utf8");
    assert.match(md2, /## Accepted exceptions/, "an accepted finding stays visible forever");
    assert.match(md2, /known gap/, "with its reason");
  } finally {
    rmrf(root);
  }
});

/* ══════════════════════════════════════════════════════════ v0.49.2 ═══════
   ONE BAD LEDGER MUST NOT TAKE THE WHOLE LISTING DOWN.

   Two distinct crash classes were reproducible against `orc challenge list`:
   a truncated ledger (a session killed mid-write) made `readCycle` return null
   and `challengeList` read `.cyc` off it; a ledger with no `goals` key read
   `.goal` off undefined. Both exited 1 with a Node stack and NOTHING parseable
   on stdout, so `orc ui` showed a bare 500 — and every HEALTHY cycle vanished
   with it, which is the opposite of what a listing is for. */

test("challenge list: a truncated ledger becomes a ROW, and the good cycles stay visible", () => {
  const root = project();
  try {
    cli(INIT(root));
    // A session killed mid-write.
    const broken = path.join(root, "orc", "orc-challenge", "broken");
    fs.mkdirSync(broken, { recursive: true });
    fs.writeFileSync(path.join(broken, "challenge.json"), '{"version":2,"kind":"tsd","goa');

    const r = cli(["challenge", "list", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, "something wants attention, and the exit code says so");
    const d = JSON.parse(r.stdout);
    assert.strictEqual(d.ok, true, "the listing still answers");
    assert.strictEqual(d.unreadable, 1);

    const bad = d.cycles.find((c) => c.slug === "broken");
    assert.ok(bad, "the broken cycle is a ROW, not an exception");
    // UNREADABLE is a LIST-level state: it never reaches the pass gate and it
    // never claims a verdict.
    assert.strictEqual(bad.state, "UNREADABLE");
    assert.match(bad.why, /could not be parsed/);
    assert.strictEqual(bad.next, null, "it never offers to continue a cycle it cannot read");

    const good = d.cycles.find((c) => c.slug === "tsd");
    assert.ok(good, "and the healthy cycle is still listed");
    assert.strictEqual(good.state, "AWAITING-JUDGE");
  } finally {
    rmrf(root);
  }
});

test("challenge list: a ledger with no goals reads —, and never invents one", () => {
  const root = project();
  try {
    cli(INIT(root));
    const nog = path.join(root, "orc", "orc-challenge", "nogoals");
    fs.mkdirSync(nog, { recursive: true });
    fs.writeFileSync(path.join(nog, "challenge.json"), '{"version":2,"iterations":[],"artifacts":[]}');

    const r = cli(["challenge", "list", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1);
    const d = JSON.parse(r.stdout);
    const row = d.cycles.find((c) => c.slug === "nogoals");
    assert.ok(row, "it lists rather than crashing");
    // A missing goal renders as nothing — it is never invented, and `record`
    // still refuses without a frozen goal, so nothing downstream is loosened.
    assert.strictEqual(row.goal, null);
    assert.strictEqual(row.kind, "unknown");
    assert.ok(d.cycles.find((c) => c.slug === "tsd"), "the healthy cycle survives");

    // The human path renders it too.
    const h = cli(["challenge", "list", "--dir", root]);
    assert.match(h.stdout, /nogoals/);
  } finally {
    rmrf(root);
  }
});

test("--json never emits a stack: an unexpected throw comes back as an OBJECT", () => {
  const root = project();
  try {
    cli(INIT(root));
    // Force a real throw INSIDE a `--json` route, at an unguarded read. A read
    // that was asked for JSON must answer in JSON or not at all — before this,
    // the panel got a 500 with no reason in it.
    const preload = path.join(root, "crash.js");
    fs.writeFileSync(
      preload,
      'const fs = require("fs");\n' +
        "const real = fs.readdirSync;\n" +
        "fs.readdirSync = function (p, o) {\n" +
        '  if (String(p).includes("orc-challenge")) throw new Error("boom from the test");\n' +
        "  return real.call(fs, p, o);\n" +
        "};\n"
    );
    const r = spawnSync(
      process.execPath,
      ["-r", preload, path.join(REPO, "bin", "cli.js"), "challenge", "list", "--json", "--dir", root],
      { encoding: "utf8", env: { ...process.env, ORC_NO_UPDATE_CHECK: "1" } }
    );
    const d = JSON.parse(r.stdout);
    assert.strictEqual(d.ok, false);
    assert.strictEqual(d.reason, "crashed");
    assert.match(d.error, /boom from the test/);
    assert.match(d.command, /challenge list/);
    assert.ok(d.hint, "and it says this is a bug rather than leaving the caller guessing");
    assert.notStrictEqual(r.status, 0);
  } finally {
    rmrf(root);
  }
});
