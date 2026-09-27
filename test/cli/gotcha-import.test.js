"use strict";
// @test-pool spawn  — shells node bin/cli.js with a fake `gh`
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, rmrf, freshInstall, tmpdir } = require("../_helpers");
const I = require("../../bin/gotcha-import.js");

// ── W6a — the gotcha importers, `orc gotcha sync`, `orc pr threads`, `orc ci failed`
//
// The spec is `05-gotchas-v2-spec.md` §3.1 (the outcome table) + §7 / §7.1 and
// `08-qol-spec.md` Q1 / Q3 / Q4. Decisions: DE-29 (sync at every review step,
// never blocking) and DE-14 (Sonar via REST, the token from the ENVIRONMENT
// only, `--file` reads a saved answer offline). Every parser is tested PURE
// against test/fixtures/importers/; the CLI half runs a fake `gh`
// (test/cli/_fake-gh.js) and never the network.

const REPO = path.join(__dirname, "..", "..");
const CLI = path.join(REPO, "bin", "cli.js");
const FX = path.join(REPO, "test", "fixtures", "importers");
const FAKE_GH = path.join(__dirname, "_fake-gh.js");
const fx = (f) => path.join(FX, f);
const load = (f) => JSON.parse(fs.readFileSync(fx(f), "utf8"));
const j = (r) => JSON.parse(r.stdout);

function run(args, env) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: Object.assign({}, process.env, { NO_COLOR: "1", ORC_NO_UPDATE_CHECK: "1", SONAR_TOKEN: "" }, env || {}),
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}
function project() {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, ".claude", "orc"), { recursive: true });
  return root;
}
const obsLines = (root) => {
  const f = path.join(root, ".claude", "orc", "observations.jsonl");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const ghEnv = (root, extra) => Object.assign({ ORC_GH: FAKE_GH, ORC_FAKE_GH_LOG: path.join(root, "gh.log") }, extra || {});
const ghCalls = (root) => (fs.existsSync(path.join(root, "gh.log")) ? fs.readFileSync(path.join(root, "gh.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
// ORC only READS GitHub: no reply, no resolve, no review, no merge, no mutation.
function assertReadOnly(root) {
  for (const a of ghCalls(root)) {
    const s = a.join(" ");
    assert.ok(!/\b(pr (comment|review|merge|create|close|edit)|issue (comment|close|edit)|run (rerun|cancel))\b/.test(s), `never a gh write: ${s}`);
    assert.ok(!/mutation/i.test(s), `never a GraphQL mutation: ${s.slice(0, 80)}`);
    assert.ok(!/(-X|--method)\s+(POST|PATCH|PUT|DELETE)/i.test(s), `never a REST write: ${s}`);
  }
}

// ── 1. SARIF — pure ─────────────────────────────────────────────────────────
test("sarif: ESLint — level → rule default → warning, ruleIndex-only rule, messageStrings, file:// uri, suppression → disputed", () => {
  const p = I.parseSarif(load("sarif-eslint.json"), {});
  assert.ok(!p.err);
  const by = Object.fromEntries(p.items.map((x) => [x.body.path, x.body]));
  assert.strictEqual(p.items.length, 4);
  // no `level`, the rule's defaultConfiguration says error
  assert.strictEqual(by["src/orders/list.js"].rule, "eslint:no-unused-vars");
  assert.strictEqual(by["src/orders/list.js"].severity, "P1");
  // no `level`, no rule default → warning; a file:/// uri becomes a repo path
  assert.strictEqual(by["src/orders/total.js"].severity, "P2");
  assert.deepStrictEqual(by["src/orders/total.js"].lines, [40, 41]);
  // ruleIndex only (no ruleId), message by id from the rule's messageStrings
  assert.strictEqual(by["src/admin/run.js"].rule, "eslint:no-eval");
  assert.strictEqual(by["src/admin/run.js"].sig, "eval can be harmful.");
  // a non-empty suppressions[] → disputed; the others → open
  assert.strictEqual(by["src/legacy/old.js"].outcome, "disputed");
  assert.strictEqual(by["src/orders/list.js"].outcome, "open");
  for (const x of p.items) assert.strictEqual(x.body.source, "sarif");
  for (const x of p.items) assert.strictEqual(x.body.author, "bot");
});

test("sarif: Semgrep — baselineState absent → addressed, a CWE tag → security + cwe, uriBaseId root stripped; not SARIF is refused", () => {
  const p = I.parseSarif(load("sarif-semgrep.json"), {});
  const xss = p.items.find((x) => /xss/.test(x.body.rule)).body;
  assert.strictEqual(xss.rule, "semgrep:javascript.express.security.audit.xss.direct-response-write");
  assert.strictEqual(xss.outcome, "addressed");
  assert.strictEqual(xss.category, "security");
  assert.strictEqual(xss.cwe, "CWE-79");
  assert.strictEqual(xss.path, "src/routes/export.js");
  const con = p.items.find((x) => /no-console/.test(x.body.rule)).body;
  assert.strictEqual(con.outcome, "open");
  assert.strictEqual(con.path, "src/routes/export.js", "an absolute uri under the uriBaseId root becomes relative");
  assert.match(I.parseSarif({ runs: [] }, {}).err, /not SARIF 2\.1\.0/);
  assert.match(I.parseSarif({ version: "2.1.0" }, {}).err, /not SARIF/);
});

test("sarif: a fingerprint the previous import of the SAME tool had and this one lacks → addressed", () => {
  const doc = load("sarif-eslint.json");
  const first = I.parseSarif(doc, {});
  const second = JSON.parse(JSON.stringify(doc));
  second.runs[0].results = second.runs[0].results.filter((r) => r.ruleId !== "no-unused-vars");
  const p = I.parseSarif(second, first.state);
  const gone = p.items.filter((x) => x.body.outcome === "addressed");
  assert.strictEqual(gone.length, 1);
  assert.strictEqual(gone[0].body.rule, "eslint:no-unused-vars");
  assert.strictEqual(gone[0].body.path, "src/orders/list.js");
  // A file from ANOTHER tool says nothing about eslint's findings.
  const other = I.parseSarif(load("sarif-semgrep.json"), first.state);
  assert.ok(!other.items.some((x) => /^eslint:/.test(x.body.rule || "")));
});

// ── 2. Sonar — pure ─────────────────────────────────────────────────────────
test("sonar: issueStatus FIXED → addressed · FALSE_POSITIVE → disputed · ACCEPTED → wontfix · OPEN/CONFIRMED → open", () => {
  const p = I.parseSonar([load("sonar-issues.json")], { pr: 142 });
  const by = Object.fromEntries(p.items.map((x) => [x.body.ref, x.body]));
  assert.strictEqual(by["sonar AX-001"].outcome, "addressed");
  assert.strictEqual(by["sonar AX-002"].outcome, "disputed");
  assert.strictEqual(by["sonar AX-003"].outcome, "wontfix");
  assert.strictEqual(by["sonar AX-004"].outcome, "open");
  assert.strictEqual(by["sonar AX-005"].outcome, "open");
  assert.strictEqual(by["sonar AX-001"].rule, "sonar:javascript:S2068");
  assert.strictEqual(by["sonar AX-001"].category, "security");
  assert.strictEqual(by["sonar AX-001"].impact, "HIGH");
  assert.strictEqual(by["sonar AX-001"].path, "src/config/db.js");
  assert.strictEqual(by["sonar AX-002"].pr, "142");
  assert.deepStrictEqual(by["sonar AX-002"].lines, [30, 31]);
  // the pre-10.4 shape: status + resolution only
  assert.strictEqual(I.parseSonar([{ issues: [{ key: "K", rule: "r", component: "p:a.js", status: "RESOLVED", resolution: "WONTFIX", message: "m" }] }]).items[0].body.outcome, "wontfix");
  assert.match(I.parseSonar([{ nope: 1 }]).err, /issues\[\]/);
  // Q4: grouped by RULE — one rule's issues fixed together
  const groups = I.groupByRule(p.items.map((x) => x.view));
  const s1854 = groups.find((g) => g.rule === "sonar:javascript:S1854");
  assert.strictEqual(s1854.count, 3);
  assert.deepStrictEqual(s1854.files.sort(), ["src/orders/cart.js", "src/orders/list.js", "src/orders/total.js"]);
});

// ── 3. PR threads — pure: every isResolved × isOutdated pair ────────────────
test("pr threads: resolved+outdated → addressed; resolved-only, outdated-only and open → open; unresolved at merge → wontfix; bots never mined", () => {
  const pages = I.parseJsonStream(fs.readFileSync(fx("pr-threads.graphql.json"), "utf8"));
  assert.strictEqual(pages.length, 2, "two concatenated --paginate pages");
  const t = I.parseThreads(pages);
  assert.strictEqual(t.pr.number, 142);
  assert.strictEqual(t.rows.length, 5);
  const byId = Object.fromEntries(t.rows.map((r) => [r.id, r]));
  assert.strictEqual(I.threadOutcome(byId.PRRT_open_current, "OPEN"), "open");
  assert.strictEqual(I.threadOutcome(byId.PRRT_open_outdated, "OPEN"), "open");
  assert.strictEqual(I.threadOutcome(byId.PRRT_resolved_current, "OPEN"), "open", "a click is not a change");
  assert.strictEqual(I.threadOutcome(byId.PRRT_resolved_outdated, "OPEN"), "addressed");
  assert.strictEqual(I.threadOutcome(byId.PRRT_open_current, "MERGED"), "wontfix");
  assert.strictEqual(I.threadOutcome(byId.PRRT_resolved_outdated, "MERGED"), "addressed");
  assert.strictEqual(byId.PRRT_bot_open.author_kind, "bot", "__typename Bot is a bot even without a [bot] suffix");
  assert.strictEqual(byId.PRRT_open_current.first.untrusted, true);
  assert.strictEqual(byId.PRRT_open_outdated.original_line, 12);
  const obs = I.threadObservations(t.pr, t.rows);
  assert.strictEqual(obs.length, 4, "humans only");
  for (const o of obs) {
    assert.strictEqual(o.author, "human");
    assert.ok(!/dana|sam|yoshua/.test(JSON.stringify(o)), "never a person's name in an observation");
  }
  assert.strictEqual(obs.filter((o) => o.outcome === "addressed").length, 1);
});

test("issues: COMPLETED with a closing PR → addressed on the PR's non-test file · NOT_PLANNED → disputed · no PR → nothing", () => {
  const obs = I.issueObservations(load("issues.json"), (n) => (n === 77 ? load("pr-files-77.json").files.map((f) => f.path) : []));
  assert.strictEqual(obs.length, 2);
  const a = obs.find((o) => o.ref === "issue #501");
  assert.strictEqual(a.outcome, "addressed");
  assert.strictEqual(a.path, "src/routes/export.js");
  assert.strictEqual(a.pr, "77");
  assert.strictEqual(obs.find((o) => o.ref === "issue #502").outcome, "disputed");
});

// ── 4. CI logs — pure ───────────────────────────────────────────────────────
test("ci: a test re-attempted then green is FLAKY, never a failure; secrets redacted; signature ignores timestamps / SHAs / temp paths", () => {
  const log = fs.readFileSync(fx("ci-9001.log"), "utf8");
  const f = I.parseCiLog(log);
  assert.strictEqual(f.length, 1);
  assert.deepStrictEqual(f[0].tests_failed, ["export rate limit returns 429"]);
  assert.deepStrictEqual(f[0].tests_flaky, ["export streams rows with a cursor"]);
  assert.strictEqual(f[0].flaky, false, "one real failure remains");
  assert.ok(!f[0].lines.some((l) => l.includes("streams rows")), "a flaky test's lines are not failure lines");
  assert.ok(!JSON.stringify(f).includes("ghp_"), "a token never reaches the output");
  assert.strictEqual(f[0].repro, "npm test");
  assert.strictEqual(f[0].path, "src/routes/export.js", "the runner's _temp prefix is removed");
  assert.match(f[0].rule, /^ci:[0-9a-f]{12}$/);
  const moved = log.replace(/2026-09-25T10/g, "2026-10-01T22").replace(/shop-4411/g, "shop-9");
  assert.strictEqual(I.parseCiLog(moved)[0].signature, f[0].signature);
  // A step that only fails a flaky test is flaky as a whole.
  const onlyFlaky = log.split("\n").filter((l) => !/rate limit|AssertionError|1 failed/.test(l)).join("\n");
  const g = I.parseCiLog(onlyFlaky);
  assert.ok(g.every((x) => x.flaky || !x.tests_failed.length));
  // No local command in the step → repro none, with the reason.
  const lint = I.parseCiLog(fs.readFileSync(fx("ci-8990.log"), "utf8"));
  assert.strictEqual(lint[0].repro, "none");
  assert.match(lint[0].repro_reason, /names no local command/);
});

// ── 5. The CLI: import sarif / sonar ────────────────────────────────────────
test("cli: import sarif records observations (exit 0) and promotes a CWE-tagged fix at 1 case; not SARIF → exit 2", () => {
  const root = project();
  try {
    const r = run(["gotcha", "import", "sarif", fx("sarif-semgrep.json"), "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stderr);
    const o = j(r);
    assert.strictEqual(o.recorded, 2);
    assert.strictEqual(o.promoted.length, 1, "security with a CWE tag promotes at 1 case (§4 c)");
    assert.ok(Array.isArray(o.groups) && o.groups.length === 2);
    assert.strictEqual(obsLines(root).length, 2);
    // Re-importing the same file appends nothing.
    const again = j(run(["gotcha", "import", "sarif", fx("sarif-semgrep.json"), "--json", "--dir", root]));
    assert.strictEqual(again.recorded, 0);
    assert.strictEqual(again.unchanged, 2);
    assert.strictEqual(obsLines(root).length, 2);
    const bad = run(["gotcha", "import", "sarif", fx("sonar-issues.json"), "--json", "--dir", root]);
    assert.strictEqual(bad.status, 2);
    assert.strictEqual(j(bad).reason, "not-sarif");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "gotchas-sync.json"), "utf8"));
    assert.ok(state.sarif.semgrep, "the fingerprints are kept for the next compare");
  } finally {
    rmrf(root);
  }
});

test("cli: import sonar --file reads a saved answer OFFLINE (no token needed); without it: no url → 2, no token → 5; the token is never printed", () => {
  const root = project();
  try {
    const r = run(["gotcha", "import", "sonar", "--file", fx("sonar-issues.json"), "--pr", "142", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stderr);
    const o = j(r);
    assert.strictEqual(o.offline, true);
    assert.strictEqual(o.recorded, 5);
    assert.strictEqual(o.groups[0].rule, "sonar:javascript:S1854", "the rule with the most open issues first");
    assert.strictEqual(run(["gotcha", "import", "sonar", "--json", "--dir", root]).status, 2);
    const noTok = run(["gotcha", "import", "sonar", "--url", "https://sonar.example.test", "--project", "shop", "--json", "--dir", root]);
    assert.strictEqual(noTok.status, 5);
    assert.match(j(noTok).message, /SONAR_TOKEN in the environment/);
    // A loopback port nothing listens on — never a real Sonar.
    const secret = "sqp_secret_do_not_print_0123456789";
    const net = run(["gotcha", "import", "sonar", "--url", "http://127.0.0.1:9", "--project", "shop", "--json", "--dir", root], { SONAR_TOKEN: secret });
    assert.strictEqual(net.status, 6, net.stdout + net.stderr);
    assert.ok(!(net.stdout + net.stderr).includes(secret), "the token is never printed");
  } finally {
    rmrf(root);
  }
});

// ── 6. The CLI: gh-based reads ──────────────────────────────────────────────
test("cli: orc pr threads — unresolved + not outdated by people by default, bots apart, --all shows each state; read-only", () => {
  const root = project();
  try {
    const r = run(["pr", "threads", "142", "--json", "--dir", root], ghEnv(root));
    assert.strictEqual(r.status, 0, r.stderr);
    const o = j(r);
    assert.strictEqual(o.threads.length, 1);
    assert.strictEqual(o.threads[0].path, "src/routes/export.js");
    assert.strictEqual(o.threads[0].author_kind, "human");
    assert.strictEqual(o.threads[0].first.untrusted, true);
    assert.strictEqual(o.bots.length, 1, "bot threads are listed apart, never mixed");
    assert.strictEqual(o.reviews.length, 1, "CHANGES_REQUESTED review bodies");
    assert.deepStrictEqual(o.counts, { threads: 5, open: 1, resolved: 2, outdated: 2, bots: 1 });
    const all = j(run(["pr", "threads", "142", "--all", "--json", "--dir", root], ghEnv(root)));
    assert.deepStrictEqual(all.threads.map((t) => t.state).sort(), ["open", "outdated", "resolved", "resolved+outdated"]);
    const human = run(["pr", "threads", "142", "--dir", root], ghEnv(root));
    assert.match(human.stdout, /\(untrusted\)/);
    assertReadOnly(root);
    // gh not logged in / not installed → 5 (quick then offers the paste path)
    assert.strictEqual(run(["pr", "threads", "142", "--json", "--dir", root], ghEnv(root, { ORC_FAKE_GH_MODE: "noauth" })).status, 5);
    assert.strictEqual(run(["pr", "threads", "142", "--json", "--dir", root], { ORC_GH: path.join(root, "no-such-gh") }).status, 5);
    assert.strictEqual(run(["pr", "threads", "x", "--json", "--dir", root], ghEnv(root)).status, 2);
  } finally {
    rmrf(root);
  }
});

test("cli: orc ci failed — the newest failing run per workflow; flaky runs and flaky tests named, never a failure; --run on a flaky run → exit 1", () => {
  const root = project();
  try {
    const r = run(["ci", "failed", "--json", "--dir", root], ghEnv(root));
    assert.strictEqual(r.status, 0, r.stderr);
    const o = j(r);
    const byId = Object.fromEntries(o.runs.map((x) => [x.id, x]));
    assert.strictEqual(byId[9002].flaky, true, "the same sha passed on another run");
    assert.strictEqual(byId[9001].flaky, false);
    assert.deepStrictEqual(byId[9001].failures[0].tests_flaky, ["export streams rows with a cursor"]);
    assert.strictEqual(o.counts.failures, 1);
    assert.ok(o.counts.flaky >= 1);
    assert.ok(!r.stdout.includes("ghp_"));
    assert.strictEqual(run(["ci", "failed", "--run", "9002", "--json", "--dir", root], ghEnv(root)).status, 1, "only flaky → nothing to repair");
    assert.strictEqual(run(["ci", "failed", "--json", "--dir", root], ghEnv(root, { ORC_FAKE_GH_MODE: "noauth" })).status, 5);
    assertReadOnly(root);
  } finally {
    rmrf(root);
  }
});

test("cli: import pr and import issues feed observe — humans only, the §3.1 outcomes", () => {
  const root = project();
  try {
    const p = run(["gotcha", "import", "pr", "142", "--json", "--dir", root], ghEnv(root));
    assert.strictEqual(p.status, 0, p.stderr);
    assert.strictEqual(j(p).recorded, 4);
    assert.strictEqual(j(p).bots_skipped, 1);
    const i = run(["gotcha", "import", "issues", "--json", "--dir", root], ghEnv(root));
    assert.strictEqual(i.status, 0, i.stderr);
    assert.strictEqual(j(i).recorded, 2);
    const lines = obsLines(root);
    assert.deepStrictEqual(lines.filter((o) => o.source === "pr").map((o) => o.outcome).sort(), ["addressed", "open", "open", "open"]);
    assert.ok(lines.some((o) => o.source === "defect" && o.outcome === "addressed" && o.path === "src/routes/export.js"));
    assert.strictEqual(run(["gotcha", "import", "pr", "142", "--json", "--dir", root], ghEnv(root, { ORC_FAKE_GH_MODE: "noauth" })).status, 5);
    assertReadOnly(root);
  } finally {
    rmrf(root);
  }
});

// ── 7. sync (§7.1, DE-29) ───────────────────────────────────────────────────
test("sync: runs every available source once per gotcha_sync_hours; not due → 1; nothing new → 1; a timed-out source is NAMED → 6", () => {
  const root = project();
  try {
    const first = run(["gotcha", "sync", "--json", "--dir", root], ghEnv(root));
    assert.strictEqual(first.status, 0, first.stderr);
    const o = j(first);
    const src = Object.fromEntries(o.sources.map((s) => [s.name, s]));
    assert.strictEqual(src.sonar.ran, false);
    assert.match(src.sonar.skipped, /sonar_url/);
    for (const n of ["pr", "defects", "ci"]) assert.strictEqual(src[n].ok, true, n);
    assert.ok(o.new > 0);
    // flaky CI is recorded as flaky — never a gotcha
    assert.ok(obsLines(root).some((x) => x.source === "ci" && x.outcome === "flaky"));
    const state = JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "gotchas-sync.json"), "utf8"));
    assert.ok(state.last_sync && state.sources.ci.cursor, "last_sync + per-source cursors");
    const notDue = run(["gotcha", "sync", "--json", "--dir", root], ghEnv(root));
    assert.strictEqual(notDue.status, 1);
    assert.strictEqual(j(notDue).due, false);
    const same = run(["gotcha", "sync", "--force", "--json", "--dir", root], ghEnv(root));
    assert.strictEqual(same.status, 1, "nothing new");
    const slow = run(["gotcha", "sync", "--force", "--dir", root], ghEnv(root, { ORC_FAKE_GH_MODE: "slow", ORC_TEST_SYNC_BOX_MS: "600" }));
    assert.strictEqual(slow.status, 6);
    assert.match(slow.stdout, /^gotchas: sync — .*pr timed out/m);
    const noauth = run(["gotcha", "sync", "--force", "--json", "--dir", root], ghEnv(root, { ORC_FAKE_GH_MODE: "noauth" }));
    assert.strictEqual(noauth.status, 1, "gh not logged in is a SKIP, not a failure");
    assert.ok(j(noauth).sources.every((s) => !s.ran));
    assertReadOnly(root);
  } finally {
    rmrf(root);
  }
});

test("sync: the state file survives update, --prune and doctor --fix, and is never in the manifest", () => {
  const { root, claudeDir } = freshInstall();
  try {
    run(["gotcha", "sync", "--dir", root], ghEnv(root));
    const f = path.join(claudeDir, "orc", "gotchas-sync.json");
    const before = fs.readFileSync(f, "utf8");
    assert.ok(!/gotchas-sync/.test(fs.readFileSync(path.join(claudeDir, "orc", "install-manifest.json"), "utf8")));
    for (const a of [["update"], ["update", "--prune"], ["doctor", "--fix"]]) {
      cli([...a, "--dir", root]);
      assert.strictEqual(fs.readFileSync(f, "utf8"), before, `survives ${a.join(" ")}`);
    }
  } finally {
    rmrf(root);
  }
});

// ── 8. The payload reaches it ───────────────────────────────────────────────
test("payload: every review step reaches `orc gotcha sync` before the card; quick's gh-mode uses `orc pr threads`, `orc ci failed` and the Sonar import", () => {
  const T = (p) => fs.readFileSync(path.join(REPO, "templates", p), "utf8");
  const slice = T("skills/_shared/review-slice.md");
  assert.ok(slice.indexOf("orc gotcha sync --json") !== -1 && slice.indexOf("orc gotcha sync --json") < slice.indexOf("§3"), "sync sits in §2, before the card");
  assert.match(T("skills/orc-pr-driver/references/green-gate.md"), /orc gotcha sync --json/);
  for (const f of ["skills/_shared/phases/review.md", "skills/orc-mini/SKILL.md", "skills/orc-quick/references/dispatch-gate.md", "skills/orc-pr-driver/references/green-gate.md"])
    assert.match(T(f), /review-slice\.md/, `${f} points at the slice`);
  const gh = T("skills/orc-quick/references/gh-mode.md");
  assert.match(gh, /orc pr threads <n> --json/);
  assert.match(gh, /orc ci failed/);
  assert.match(gh, /orc gotcha import sonar/);
  assert.doesNotMatch(gh, /pulls\/\{n\}\/comments/, "REST comments cannot tell resolved from unresolved");
});
