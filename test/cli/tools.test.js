"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir, REPO, FAKE_HOME, webuiFiles } = require("../_helpers");


// The smaller CLI surfaces: `pattern status`, `onboarding`, `gotcha`, and the
// stacked-PR plan commands.
//
// Split out of cli.test.js in v0.48.1: a suite you have to scroll
// past 1 200 lines of to find one case is a suite nobody adds a case to.

test("orc pattern status: 0 cached, 1 absent, 2 unknown key", () => {
  const { root, claudeDir } = freshInstall();
  try {
    // A real INDEX.md key with nothing cached → absent.
    assert.strictEqual(cli(["pattern", "status", "express", "--dir", root]).status, 1, "absent → 1");

    // A key the payload has never heard of is a CALLER bug, not an absent
    // cache: probing `js` (a file extension) used to answer a clean "absent",
    // so the gate fell back correctly and the caller's bug read as a lane
    // defect for two whole evals.
    const unknown = cli(["pattern", "status", "js", "--dir", root]);
    assert.strictEqual(unknown.status, 2, "unknown language key → 2");
    assert.match(unknown.stdout, /unknown language key/);
    assert.match(unknown.stdout, /express/, "lists the real keys");

    // No argument, empty cache → the same absent contract.
    assert.strictEqual(cli(["pattern", "status", "--dir", root]).status, 1, "empty cache → 1");

    const dir = path.join(claudeDir, "orc", "patterns");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "express-pattern.md"), "# express pattern\n");
    assert.strictEqual(cli(["pattern", "status", "express", "--dir", root]).status, 0, "cached → 0");
    assert.strictEqual(cli(["pattern", "status", "--dir", root]).status, 0, "non-empty cache → 0");
  } finally {
    rmrf(root);
  }
});

test("orc onboarding prints all sections when piped, and jumps to a topic", () => {
  const dir = tmpdir();
  try {
    const all = cli(["onboarding"]);
    assert.strictEqual(all.status, 0);
    assert.match(all.stdout, /What ORC is/, "prints the overview section");
    assert.match(all.stdout, /Troubleshooting/, "prints the last section");

    const topic = cli(["onboarding", "upgrade"]);
    assert.strictEqual(topic.status, 0);
    assert.match(topic.stdout, /Upgrade & after-upgrade/);

    const bad = cli(["onboarding", "nosuchtopic"]);
    assert.notStrictEqual(bad.status, 0, "unknown topic exits non-zero");
  } finally {
    rmrf(dir);
  }
});

function gotchaEntry(n, opts) {
  const o = opts || {};
  return [
    `## G-${String(n).padStart(3, "0")} · ${o.area || "express"} · ${o.kind || "repair"}`,
    `- trigger:   trigger ${n}`,
    `- symptom:   symptom ${n}`,
    `- cause:     cause ${n}`,
    `- fix:       fix ${n}`,
    "- scope:     src/routes/**/*.js",
    "- origin:    run-orc-probe-050826-141233 · TDD repair round 2",
    `- hits:      ${o.hits === undefined ? 1 : o.hits}`,
    `- last_seen: ${o.last_seen || "05-08-2026"}`,
    "",
  ].join("\n");
}

function writeGotchas(claudeDir, body) {
  const f = path.join(claudeDir, "orc", "gotchas.md");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "# Gotchas — repair memory\n\n" + body);
  return f;
}

test("orc gotcha status: 1 when empty, 0 with an entry", () => {
  const { root, claudeDir } = freshInstall();
  try {
    // A fresh install ships NO gotchas file — absence is the normal state, and
    // the exit code IS the contract (same convention as `orc pattern status`).
    assert.ok(!fs.existsSync(path.join(claudeDir, "orc", "gotchas.md")), "fresh install has no gotchas file");
    const empty = cli(["gotcha", "status", "--dir", root]);
    assert.strictEqual(empty.status, 1, "no entries → 1");
    assert.match(empty.stdout, /no gotchas recorded yet/);

    const f = writeGotchas(claudeDir, gotchaEntry(1));
    const hit = cli(["gotcha", "status", "--dir", root]);
    assert.strictEqual(hit.status, 0, "one entry → 0");
    assert.ok(hit.stdout.includes(f), "names the file the entries live in");

    // `list` obeys the same contract and prints the rows.
    const list = cli(["gotcha", "list", "--dir", root]);
    assert.strictEqual(list.status, 0);
    assert.match(list.stdout, /G-001 · express · repair/);
    assert.match(list.stdout, /trigger 1/, "prints the trigger, not just the id");

    // A file with a heading but zero parsable entries is the ABSENT state.
    fs.writeFileSync(path.join(claudeDir, "orc", "gotchas.md"), "# Gotchas — repair memory\n\nnothing yet\n");
    assert.strictEqual(cli(["gotcha", "status", "--dir", root]).status, 1, "no parsable entry → 1");

    // Project-scoped: the memory is this repo's.
    assert.notStrictEqual(cli(["gotcha", "status", "--global"]).status, 0, "--global is refused");
    assert.notStrictEqual(cli(["gotcha", "nosuchsub", "--dir", root]).status, 0, "unknown subcommand exits non-zero");
  } finally {
    rmrf(root);
  }
});

test("orc gotcha prune archives the tail and never deletes", () => {
  const { root, claudeDir } = freshInstall();
  try {
    assert.strictEqual(cli(["config", "set", "gotchas_max", "5", "--dir", root]).status, 0);

    // 8 entries: hits vary 0..3, last_seen varies — so the ranking (fewest hits,
    // then oldest last_seen) has something to actually rank.
    let body = "";
    const all = [];
    for (let i = 1; i <= 8; i++) {
      all.push(`G-${String(i).padStart(3, "0")}`);
      body += gotchaEntry(i, { hits: i % 4, last_seen: `0${(i % 9) + 1}-08-2026` }) + "\n";
    }
    const live = writeGotchas(claudeDir, body);
    const archive = path.join(claudeDir, "orc", "gotchas-archive.md");

    const r = cli(["gotcha", "prune", "--dir", root]);
    assert.strictEqual(r.status, 0);

    const ids = (f) => [...fs.readFileSync(f, "utf8").matchAll(/^## (G-\d{3})/gm)].map((m) => m[1]);
    const kept = ids(live);
    const evicted = ids(archive);
    assert.strictEqual(kept.length, 5, "live file holds exactly gotchas_max");
    assert.strictEqual(evicted.length, 3, "the overflow was archived");
    assert.deepStrictEqual(
      [...kept, ...evicted].sort(),
      all.sort(),
      "the union of ids is unchanged — an eviction is an ARCHIVE, never a delete"
    );
    // Lowest value goes first: hits 0 (G-004, G-008) before any hits 1, and
    // among hits 1 the oldest last_seen (G-001, 02-08) before G-005 (06-08).
    assert.deepStrictEqual(evicted.sort(), ["G-001", "G-004", "G-008"], "ranked fewest hits, then oldest");
    assert.match(fs.readFileSync(live, "utf8"), /^# Gotchas/, "the file preamble survives");

    // Already within the cap → nothing moves.
    const again = cli(["gotcha", "prune", "--dir", root]);
    assert.strictEqual(again.status, 0);
    assert.match(again.stdout, /nothing archived/);
    assert.strictEqual(ids(live).length, 5, "a second prune is a no-op");
  } finally {
    rmrf(root);
  }
});

test("orc update never touches a gotchas file", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const live = writeGotchas(claudeDir, gotchaEntry(1) + "\n" + gotchaEntry(2));
    const archive = path.join(claudeDir, "orc", "gotchas-archive.md");
    fs.writeFileSync(archive, "# Gotchas — archive\n\n" + gotchaEntry(3));
    const before = { live: fs.readFileSync(live), archive: fs.readFileSync(archive) };

    assert.strictEqual(cli(["update", "--dir", root]).status, 0);
    assert.ok(before.live.equals(fs.readFileSync(live)), "gotchas.md byte-identical after update");
    assert.ok(before.archive.equals(fs.readFileSync(archive)), "gotchas-archive.md byte-identical");

    // --prune is the destructive path, and doctor --fix is what users actually
    // run mid-project. Neither may reach user data under .claude/orc/.
    assert.strictEqual(cli(["update", "--prune", "--dir", root]).status, 0);
    assert.ok(before.live.equals(fs.readFileSync(live)), "survives update --prune");
    cli(["doctor", "--fix", "--dir", root]);
    assert.ok(before.live.equals(fs.readFileSync(live)), "survives doctor --fix");
    assert.ok(before.archive.equals(fs.readFileSync(archive)), "archive survives doctor --fix");

    // And the DATA files are never claimed as ORC's own — which is exactly why
    // the prune can never reach them. (The CONTRACT, skills/_shared/gotchas.md,
    // does ship and IS in the manifest; that distinction is the whole point.)
    const m = JSON.parse(fs.readFileSync(path.join(claudeDir, "orc", "install-manifest.json"), "utf8"));
    assert.ok(!m.files.includes("orc/gotchas.md"), "the live file is not in the install manifest");
    assert.ok(!m.files.includes("orc/gotchas-archive.md"), "the archive is not in the install manifest");
    assert.ok(m.files.includes("skills/_shared/gotchas.md"), "the shipped CONTRACT is in the manifest");
  } finally {
    rmrf(root);
  }
});

// ── orc wiki impact golden fixture ──────────────────────────────────────────
// A tiny git repo with one registered doc covering src/a.js. Impact must read
// CLEAN before any commit, DELTA (exit 2) after a covered-file commit, and
// FULL-recommended (exit 3) when an uncovered file lands (STRUCTURAL blind spot).

const FILLED_PLAN = `# Stack plan: refund adapter

- ticket: PAY-4211
- repo: acme/payment_service
- trunk: main
- entry mode: orc-run
- pr template: project:.github/pull_request_template.md
- totals: 850 LoC · 13 files · 2 layers

## Layers

| # | branch | purpose | value class | files | LoC | depends on | build-alone? |
|---|--------|---------|-------------|-------|-----|------------|--------------|
| 1 | PAY-4211-schema | refund tables | FOUNDATION (consumer: 2) | 4 | 210 | — | yes |
| 2 | PAY-4211-handler | POST refunds | CONTRACT | 9 | 640 | 1 | yes |

## Layer 1 — refund schema

- Purpose: land reversible DDL ahead of code
- Value class: FOUNDATION (consumer: layer 2)
- Files: migrations/0042_refunds.up.sql
- Gate status: NOT RUN

## Layer 2 — refund handler

- Purpose: expose the refund endpoint
- Value class: CONTRACT
- Files: internal/http/refund_handler.go
- Gate status: NOT RUN

## Decisions

Schema vs handler seam: user chose two layers; review owners differ.

## Accepted exceptions

none
`;

test("pr stack template: writes the skeleton, refuses to clobber a plan, alias agrees", () => {
  const root = tmpdir();
  try {
    const plan = path.join(root, "stacked-pr", "demo", "stack-plan.md");
    const first = cli(["pr", "stack", "template", "demo", "--dir", root]);
    assert.strictEqual(first.status, 0);
    assert.ok(fs.existsSync(plan), "skeleton lands at stacked-pr/<slug>/stack-plan.md");
    const body = fs.readFileSync(plan, "utf8");
    assert.match(body, /## Decisions/, "skeleton carries the Decisions section");
    assert.match(body, /## Layer 2 —/, "skeleton is a 2+ layer shape");

    // A plan is user-authored work — an overwrite would destroy it silently.
    fs.writeFileSync(plan, FILLED_PLAN);
    const again = cli(["pr", "stack", "template", "demo", "--dir", root]);
    assert.strictEqual(again.status, 1, "refuses to overwrite");
    assert.strictEqual(fs.readFileSync(plan, "utf8"), FILLED_PLAN, "bytes untouched");
    assert.strictEqual(cli(["pr", "stack", "template", "demo", "--dir", root, "--force"]).status, 0);

    // the flat alias is the same command
    const alias = cli(["pr-stack-template", "other", "--dir", root]);
    assert.strictEqual(alias.status, 0);
    assert.ok(fs.existsSync(path.join(root, "stacked-pr", "other", "stack-plan.md")));
  } finally {
    rmrf(root);
  }
});

test("pr stack status: the exit code IS the contract (0 READY, 1 absent | unfilled | ambiguous)", () => {
  const root = tmpdir();
  try {
    // absent
    const none = cli(["pr", "stack", "status", "--dir", root]);
    assert.strictEqual(none.status, 1);
    assert.match(none.stdout, /no stack plan/);

    // generated but unfilled — the whole reason a hand-filled plan needs a probe
    assert.strictEqual(cli(["pr", "stack", "template", "demo", "--dir", root]).status, 0);
    const unfilled = cli(["pr", "stack", "status", "--dir", root]);
    assert.strictEqual(unfilled.status, 1, "placeholders left = NOT READY");
    assert.match(unfilled.stdout, /unfilled placeholder/);

    // filled → READY
    fs.writeFileSync(path.join(root, "stacked-pr", "demo", "stack-plan.md"), FILLED_PLAN);
    const ready = cli(["pr", "stack", "status", "demo", "--dir", root]);
    assert.strictEqual(ready.status, 0, "a filled plan is READY");
    assert.match(ready.stdout, /READY/);
    assert.match(ready.stdout, /PAY-4211/, "names the ticket it found");

    // a single-layer plan is not a stack
    const oneLayer = FILLED_PLAN.replace(/## Layer 2 —[\s\S]*?(?=## Decisions)/, "");
    fs.writeFileSync(path.join(root, "stacked-pr", "demo", "stack-plan.md"), oneLayer);
    assert.strictEqual(cli(["pr", "stack", "status", "demo", "--dir", root]).status, 1);

    // two plans and no slug → ambiguous, never a coin flip
    fs.writeFileSync(path.join(root, "stacked-pr", "demo", "stack-plan.md"), FILLED_PLAN);
    fs.mkdirSync(path.join(root, "stacked-pr", "second"), { recursive: true });
    fs.writeFileSync(path.join(root, "stacked-pr", "second", "stack-plan.md"), FILLED_PLAN);
    const ambiguous = cli(["pr", "stack", "status", "--dir", root]);
    assert.strictEqual(ambiguous.status, 1);
    assert.match(ambiguous.stdout, /name one: demo, second/);
  } finally {
    rmrf(root);
  }
});

// A LARGE `--json` payload must survive the pipe. `emitJson` used to
// `process.stdout.write(...)` and then `process.exit(...)`; on macOS and Linux a
// pipe write is asynchronous, so the exit discarded the tail. `orc ui` reads
// every panel through a pipe, so `wiki coverage --json` (30 KB) arrived as a
// 9 KB fragment, failed to parse, 500'd, and the Coverage tab reported that the
// repo had neither a wiki nor a git repository (v0.49.4).
test("a large --json payload is not truncated when stdout is a pipe", () => {
  // spawnSync gives the child a PIPE for stdout — the exact condition.
  const r = cli(["config", "list", "--json"]);
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.length > 20000, "config list --json should be a big payload, got " + r.stdout.length);
  const parsed = JSON.parse(r.stdout); // throws on a truncated tail
  assert.ok(Array.isArray(parsed.keys) || typeof parsed === "object");
});

// Windows pipes are synchronous, so the runtime test above cannot fail there.
// This one can: the fix is that `emitJson` writes through fd 1 synchronously,
// and nothing may quietly put the async write back.
test("emitJson writes stdout synchronously before it exits", () => {
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const fn = src.slice(src.indexOf("function emitJson"), src.indexOf("function resolveClaudeDir"));
  assert.match(fn, /writeStdoutSync\(/, "emitJson must use the synchronous writer");
  assert.doesNotMatch(fn, /process\.stdout\.write/, "an async write before process.exit truncates on a pipe");
  assert.match(src, /function writeStdoutSync\(str\) \{[\s\S]*fs\.writeSync\(1,/, "writeStdoutSync must write fd 1");
});
