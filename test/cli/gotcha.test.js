"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const { cli, rmrf, freshInstall, tmpdir } = require("../_helpers");
const G = require("../../bin/gotcha.js");

// ── `orc gotcha` v2 — the gotchas engine (v2.0.0 W4) ────────────────────────
//
// The spec is `05-gotchas-v2-spec.md` §1–§4 and §7–§9. Decisions in force:
// DE-9 (a `source:` field, the kinds unchanged), DE-10 (review learning is
// ALWAYS ON — the card budget is a size, min 200), DE-11 (promotion), DE-27
// (the v0.40.0 `gotchas` key stays, not a switch), DE-28 (watch lines, misses at 1).

const CLI = path.join(__dirname, "..", "..", "bin", "cli.js");
const DAY = 86400000;
const iso = (agoDays) => new Date(Date.now() - agoDays * DAY).toISOString().slice(0, 10);
const j = (r) => JSON.parse(r.stdout);
function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    input: input === undefined ? undefined : typeof input === "string" ? input : JSON.stringify(input),
    env: Object.assign({}, process.env, { NO_COLOR: "1", ORC_NO_UPDATE_CHECK: "1" }),
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}
function project(files) {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, ".claude", "orc"), { recursive: true });
  for (const f of files || []) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), "x\n");
  }
  return root;
}
function gitInit(root) {
  const g = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
  g("init", "-q");
  g("add", "-A");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base", "--allow-empty");
}
const ledger = (root) => path.join(root, ".claude", "orc", "gotchas.md");
const add = (root, body) => run(["gotcha", "add", "-", "--json", "--dir", root], body);
const observe = (root, body) => run(["gotcha", "observe", "-", "--json", "--dir", root], body);
const V1_BODY = {
  area: "express",
  kind: "repair",
  trigger: "adding a route handler that awaits a Mongoose query",
  symptom: "Cannot read properties of undefined (reading 'session') in tests",
  cause: "the test harness stubs req.session only for authed routes",
  fix: "register the route under authedRouter, not app",
  scope: "src/routes/**/*.js",
  origin: "run-orc-add-billing-050826-141233 · TDD repair round 2",
  hits: 3,
  last_seen: "05-08-2026",
};
// The entry exactly as `_shared/gotchas.md` §2 prints it.
const V1_TEXT = [
  "## G-001 · express · repair",
  "- trigger:   adding a route handler that awaits a Mongoose query",
  "- symptom:   Cannot read properties of undefined (reading 'session') in tests",
  "- cause:     the test harness stubs req.session only for authed routes",
  "- fix:       register the route under authedRouter, not app",
  "- scope:     src/routes/**/*.js",
  "- origin:    run-orc-add-billing-050826-141233 · TDD repair round 2",
  "- hits:      3",
  "- last_seen: 05-08-2026",
].join("\n");

// ── 1. A v1 file parses identically ─────────────────────────────────────────
test("v1: a v1 file parses identically, CRLF or LF, and a v1 body is written in the v1 format", () => {
  for (const eol of ["\n", "\r\n"]) {
    const root = project();
    try {
      fs.writeFileSync(ledger(root), ("# Gotchas\n\n" + V1_TEXT + "\n").replace(/\n/g, eol));
      const r = run(["gotcha", "list", "--json", "--dir", root]);
      assert.strictEqual(r.status, 0);
      const e = j(r).gotchas[0];
      assert.deepStrictEqual(Object.keys(e.fields), G.REQUIRED, "the 8 required fields, in order, nothing else");
      assert.strictEqual(e.fields.scope, "src/routes/**/*.js");
      assert.strictEqual(e.hits, 3);
      // v2 defaults on a v1 entry: source = kind, polarity = flag, counters 0.
      const v = G.entryView({ id: e.id, area: e.area, kind: e.kind, hits: e.hits, fields: e.fields, lines: [], text: "" });
      assert.strictEqual(v.source, "repair");
      assert.strictEqual(v.polarity, "flag");
      assert.strictEqual(v.helpful + v.harmful, 0);
    } finally {
      rmrf(root);
    }
  }
  const root = project();
  try {
    assert.strictEqual(add(root, V1_BODY).status, 0);
    const text = fs.readFileSync(ledger(root), "utf8");
    assert.ok(text.includes(V1_TEXT + "\n"), "a v1 body renders exactly as the v1 contract prints it");
  } finally {
    rmrf(root);
  }
});

// ── 2. Today's regex parses a v2 file ───────────────────────────────────────
// Copied VERBATIM from bin/cli.js at 1.9.2 (ce91ecb). If a v2 heading did not
// match it, a 1.9.2 CLI would FOLD the entry into the one above it.
const GOTCHA_HEAD_192 = /^##\s+(G-\d{3})\s+·\s+([^·]+?)\s+·\s+(repair|drift|review|verify)\s*$/;
function parse192(text) {
  const entries = [];
  let cur = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = line.match(GOTCHA_HEAD_192);
    if (m) {
      if (cur) entries.push(cur);
      cur = { id: m[1], kind: m[3], fields: {} };
      continue;
    }
    if (!cur) continue;
    const f = line.match(/^-\s+([a-z_]+):\s*(.*)$/);
    if (f) cur.fields[f[1]] = f[2].trim();
  }
  if (cur) entries.push(cur);
  return entries;
}
test("v2: the 1.9.2 heading regex parses a v2 file — every new source files under an old kind", () => {
  const root = project();
  try {
    assert.strictEqual(add(root, V1_BODY).status, 0);
    const srcs = ["sonar", "pr", "defect", "ci", "sarif", "dismissal"];
    srcs.forEach((source, i) =>
      assert.strictEqual(
        add(root, {
          area: "vue",
          source,
          trigger: `trigger ${i}`,
          symptom: `a distinct failure number word ${"abcdef"[i]} here`,
          cause: "c",
          fix: "f",
          scope: `client/src/views${i}/**`,
          origin: "sonar import 12-09-2026 · 6 issues",
          rule: `sonar:javascript:S37${i}`,
          category: "evolvability.structure",
          severity: "P2",
          polarity: source === "dismissal" ? "suppress" : "flag",
          evidence: "client/src/views/Orders.vue:120",
          helpful: 4,
          harmful: 0,
        }).status,
        0,
        source
      )
    );
    const text = fs.readFileSync(ledger(root), "utf8");
    const old = parse192(text);
    assert.strictEqual(old.length, 1 + srcs.length, "no entry folds into the one above it");
    assert.deepStrictEqual(old.slice(1).map((e) => e.fields.source), srcs);
    assert.deepStrictEqual(old.slice(1).map((e) => e.kind), srcs.map((s) => G.SOURCE_KIND[s]));
    for (const e of old) assert.deepStrictEqual(Object.keys(e.fields).slice(0, 8), G.REQUIRED, "the 8 required fields stay first, in order");
    assert.deepStrictEqual(Object.keys(old[1].fields).slice(8), ["source", "rule", "category", "severity", "polarity", "evidence", "helpful", "harmful"]);
    // Today's CLI reads the same file the same way.
    assert.strictEqual(j(run(["gotcha", "status", "--json", "--dir", root])).count, 1 + srcs.length);
  } finally {
    rmrf(root);
  }
});

// ── 3. `add` dedupes on the key ─────────────────────────────────────────────
test("add: dedupes on (rule or symptom, category, scope), names a malformed field, never reuses an id", () => {
  const root = project();
  try {
    const a = add(root, V1_BODY);
    assert.strictEqual(a.status, 0);
    assert.deepStrictEqual(Object.keys(j(a)), ["ok", "action", "id", "hits", "last_seen", "file", "text"]);
    // The same failure again: a bump, never a second entry.
    const b = add(root, Object.assign({}, V1_BODY, { hits: 1, last_seen: "20-09-2026", symptom: V1_BODY.symptom + " again" }));
    assert.strictEqual(b.status, 3, "3 = bumped an existing entry");
    assert.strictEqual(j(b).id, "G-001");
    assert.strictEqual(j(b).hits, 4);
    assert.strictEqual(j(b).last_seen, "20-09-2026");
    // Another scope is another gotcha.
    const c = add(root, Object.assign({}, V1_BODY, { scope: "src/billing/**" }));
    assert.strictEqual(c.status, 0);
    assert.strictEqual(j(c).id, "G-002");
    // A rule dedupes on the rule.
    const s = { area: "ts", source: "sonar", trigger: "t", symptom: "one text", cause: "c", fix: "f", scope: "src/a/**", origin: "o 12-09-2026", rule: "sonar:ts:S1" };
    assert.strictEqual(add(root, s).status, 0);
    assert.strictEqual(add(root, Object.assign({}, s, { symptom: "a wholly different text" })).status, 3);
    assert.strictEqual(j(run(["gotcha", "status", "--json", "--dir", root])).count, 3);
    // Malformed: the field is NAMED.
    const bad = add(root, Object.assign({}, V1_BODY, { fix: "" }));
    assert.strictEqual(bad.status, 2);
    assert.strictEqual(j(bad).field, "fix");
    assert.strictEqual(j(add(root, Object.assign({}, V1_BODY, { scope: "**" }))).field, "scope", "a whole-repo scope is refused");
    assert.strictEqual(j(add(root, Object.assign({}, V1_BODY, { source: "sonar" }))).field, "kind", "sonar files under review, not repair");
    assert.strictEqual(j(add(root, Object.assign({}, V1_BODY, { category: "style" }))).field, "category");
    // IDs are monotonic and never reused, even after archival.
    fs.writeFileSync(path.join(root, ".claude", "orc", "gotchas-archive.md"), "## G-040 · js · repair\n- scope: x\n");
    assert.strictEqual(j(add(root, Object.assign({}, V1_BODY, { scope: "src/other/**" }))).id, "G-041");
  } finally {
    rmrf(root);
  }
});

// ── 4. `match` = the v1 rule ────────────────────────────────────────────────
test("match: the v1 rule — scope vs declared files, cap 3, highest hits, zero = no block; source gating; `gotchas: off` → 4", () => {
  const root = project();
  try {
    [5, 1, 9, 3].forEach((hits, i) =>
      add(root, Object.assign({}, V1_BODY, { symptom: `failure ${"wxyz"[i]} unique words`, scope: "src/routes/**", hits }))
    );
    // An imported sonar gotcha seen twice is a review item, never an executor line.
    add(root, { area: "ts", source: "sonar", trigger: "t", symptom: "s", cause: "c", fix: "f", scope: "src/routes/**", origin: "sonar import 12-09-2026", hits: 9, rule: "sonar:ts:S2" });
    const m = run(["gotcha", "match", "--files", "src/routes/a.js,lib/b.js", "--json", "--dir", root]);
    assert.strictEqual(m.status, 0);
    const o = j(m);
    assert.deepStrictEqual(Object.keys(o), ["ok", "text", "ids", "matched", "known"]);
    assert.deepStrictEqual(o.ids, ["G-003", "G-001", "G-004"], "cap 3, highest hits first");
    assert.strictEqual(o.matched, 4, "the sonar entry is not executor-eligible");
    assert.strictEqual(o.known, 5);
    assert.ok(o.text.startsWith("## G-003 · express · repair\n"), "injected LITERALLY");
    const none = run(["gotcha", "match", "--files", "lib/b.js", "--json", "--dir", root]);
    assert.strictEqual(none.status, 1, "zero matches = no block (an answer)");
    assert.strictEqual(j(none).text, "");
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "gotchas: off\n");
    assert.strictEqual(run(["gotcha", "match", "--files", "src/routes/a.js", "--json", "--dir", root]).status, 4);
    assert.strictEqual(run(["gotcha", "card", "--files", "src/routes/a.js", "--json", "--dir", root]).status, 0, "the card has no off answer (DE-10)");
  } finally {
    rmrf(root);
  }
});

// ── 5. `card` — budget, dropped, orphaned, watch, suppress ──────────────────
test("card: ≤ 6 flag + watch lines, ≤ 2 suppress, the budget, dropped COUNTED, orphaned left out", () => {
  const root = project(["src/app/a.ts", "src/app/b.ts", "src/pay/order.ts"]);
  try {
    gitInit(root);
    for (let i = 0; i < 8; i++)
      add(root, Object.assign({}, V1_BODY, { area: "ts", symptom: `symptom number ${"abcdefgh"[i]} is here`, scope: "src/app/**", hits: i + 1, last_seen: new Date().toISOString().slice(0, 10).split("-").reverse().join("-") }));
    add(root, Object.assign({}, V1_BODY, { symptom: "gone away", scope: "src/removed/**" })); // orphaned: no tracked file
    for (let i = 0; i < 3; i++)
      add(root, { area: "ts", source: "dismissal", trigger: "t", symptom: `long names ${"xyz"[i]} disputed`, cause: "c", fix: "do not flag it here", scope: "src/**", origin: "accepted 12-09-2026", hits: 3, category: "test", polarity: "suppress" });
    // A strong-signal candidate: a human PR thread that was FIXED.
    observe(root, { source: "pr", ref: "PR 142 · thread 3", at: iso(1), sig: "null-check missing before charge", category: "functional.check", severity: "P1", path: "src/pay/order.ts", lines: [40, 44], outcome: "addressed", author: "human" });
    const files = "src/app/a.ts,src/pay/order.ts,src/removed/x.ts";
    const r = run(["gotcha", "card", "--files", files, "--lane", "orc", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    const c = j(r);
    assert.deepStrictEqual(Object.keys(c), ["ok", "lane", "text", "ids", "matched", "known", "dropped", "orphaned", "quiet", "budget", "tokens"], "BRIEF by default");
    assert.deepStrictEqual(c.orphaned, ["G-009"]);
    assert.ok(!c.ids.includes("G-009"));
    assert.strictEqual(c.matched, 8 + 1 + 3, "8 flag + 1 watch + 3 suppress");
    const lines = c.text.split("\n");
    assert.match(lines[0], /^gotchas \(12 of 12 match · \d+ dropped by budget\):$/);
    const flag = lines.filter((l) => /^G-/.test(l));
    const watch = lines.filter((l) => l.startsWith("watch: "));
    const sup = lines.filter((l) => l.startsWith("do not flag: "));
    assert.ok(flag.length + watch.length <= 6);
    assert.strictEqual(sup.length, 2, "≤ 2 suppress lines");
    assert.strictEqual(flag.length, 6, "flag lines come first and fill the 6 lines");
    assert.strictEqual(watch.length, 0, "so the watch line is dropped — and counted");
    assert.strictEqual(c.dropped, c.matched - c.ids.length, "dropped is counted, never silent");
    assert.ok(c.tokens <= 600);
    assert.strictEqual(flag[0].slice(0, 5), "G-008", "the highest-ranked flag first");
    // A tight budget drops more — and says so.
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "gotcha_card_budget: 200\n");
    const t = j(run(["gotcha", "card", "--files", files, "--json", "--dir", root]));
    assert.ok(t.tokens <= 200);
    assert.ok(t.dropped > c.dropped);
    // --full adds the rows.
    const full = j(run(["gotcha", "card", "--files", files, "--full", "--json", "--dir", root]));
    assert.strictEqual(full.rows.length, 12);
    assert.ok(full.rows.every((x) => x.kept === !x.dropped));
    assert.strictEqual(full.rows.find((x) => x.type === "watch").dropped, "line cap");
    // With no active flag line in the way, the strong candidate shows at once.
    const w = j(run(["gotcha", "card", "--files", "src/pay/order.ts", "--json", "--dir", root]));
    const wl = w.text.split("\n").filter((l) => l.startsWith("watch: "));
    assert.strictEqual(wl.length, 1);
    assert.match(wl[0], /^watch: C-[0-9a-f]{6} pr · src\/pay\/order\.ts · null-check missing before charge \(seen 1×\)$/);
    assert.strictEqual(run(["gotcha", "card", "--files", "docs/x.md", "--json", "--dir", root]).status, 1, "no match = no card");
  } finally {
    rmrf(root);
  }
});

// ── 6. `filter` never removes a P0/P1 ───────────────────────────────────────
test("filter: suppress, fold P3 past 5, and NEVER touch a P0 or P1", () => {
  const root = project();
  try {
    add(root, { area: "ts", source: "dismissal", trigger: "t", symptom: "deep nesting", cause: "c", fix: "do not flag it here", scope: "src/**", origin: "accepted 12-09-2026", hits: 2, category: "evolvability.structure", polarity: "suppress" });
    const f = (severity, i, category = "evolvability.structure", p = "src/a.ts") => ({ id: `F${i}`, severity, category, path: p, title: `finding ${i}` });
    const findings = [f("P0", 1), f("P1", 2), f("P2", 3), f("P3", 4), f("P2", 5, "evolvability.structure", "lib/x.ts")];
    for (let i = 10; i < 17; i++) findings.push(f("P3", i, "test"));
    const file = path.join(root, "findings.json");
    fs.writeFileSync(file, JSON.stringify(findings));
    const r = run(["gotcha", "filter", "--findings", file, "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    const o = j(r);
    assert.deepStrictEqual(Object.keys(o), ["ok", "kept", "removed", "folded", "suppressed", "noisy", "counts"]);
    const kept = o.kept.map((x) => x.id);
    assert.ok(kept.includes("F1") && kept.includes("F2"), "a P0 and a P1 in a suppressed category + scope stay");
    assert.deepStrictEqual(o.removed.filter((x) => x.by === "G-001").map((x) => x.finding.id), ["F3", "F4"]);
    assert.ok(kept.includes("F5"), "outside the scope, kept");
    assert.strictEqual(o.folded, 2, "7 P3 → 5 kept, 2 folded");
    assert.deepStrictEqual(o.suppressed, { "G-001": 2 });
    // stdin works too, and a non-array is malformed.
    assert.strictEqual(run(["gotcha", "filter", "--findings", "-", "--json", "--dir", root], JSON.stringify({ findings })).status, 0);
    assert.strictEqual(run(["gotcha", "filter", "--findings", "-", "--json", "--dir", root], "{}").status, 2);
  } finally {
    rmrf(root);
  }
});

// ── 7. The promotion table (`05` §4), exactly ───────────────────────────────
test("promotion: the §4 table, exactly (DE-11, DE-28)", () => {
  let n = 0;
  const o = (x) => Object.assign({ obs: "o" + ++n, source: "pr", author: "human", outcome: "addressed", at: iso(1), category: "functional.check" }, x);
  const table = [
    ["1 addressed case", [o({ pr: 1 })], false, null],
    ["3 cases in 1 PR", [o({ pr: 1 }), o({ pr: 1 }), o({ pr: 1 })], false, null],
    ["2 cases in 2 PRs", [o({ pr: 1 }), o({ pr: 2 })], false, null],
    ["3 cases in 2 PRs within 90 days", [o({ pr: 1 }), o({ pr: 1 }), o({ pr: 2 })], true, "b"],
    ["3 cases in 2 PRs, one 120 days old", [o({ pr: 1 }), o({ pr: 1 }), o({ pr: 2, at: iso(120) })], false, null],
    ["PR number from the ref", [o({ ref: "PR 7 · thread 1" }), o({ ref: "PR 7 · thread 2" }), o({ ref: "PR 8 · thread 1" })], true, "b"],
    ["3 cases in 2 PRs, one disputed", [o({ pr: 1 }), o({ pr: 1 }), o({ pr: 2, outcome: "disputed" })], false, null],
    ["in-lane red → green (repair)", [o({ source: "repair", author: "orc", reproduced: true })], true, "a"],
    ["in-lane red → green (defect)", [o({ source: "defect", author: "orc", reproduced: true })], true, "a"],
    ["in-lane red → green (ci)", [o({ source: "ci", author: "orc", reproduced: true })], true, "a"],
    ["a 'reproduced' sonar case is not in-lane", [o({ source: "sonar", reproduced: true })], false, null],
    ["an in-lane loop that did not go green", [o({ source: "repair", author: "orc", reproduced: true, outcome: "open" })], false, null],
    ["a miss at 1 case", [o({ miss: true })], true, "miss"],
    ["security + CWE at 1 case", [o({ category: "security", cwe: "CWE-89" })], true, "c"],
    ["security + impact HIGH at 1 case", [o({ source: "sonar", category: "security", impact: "HIGH" })], true, "c"],
    ["security + impact BLOCKER at 1 case", [o({ source: "sonar", category: "security", impact: "blocker" })], true, "c"],
    ["security with no CWE and a MEDIUM impact", [o({ category: "security", impact: "MEDIUM" })], false, null],
    ["a CWE outside the security category", [o({ cwe: "CWE-89" })], false, null],
  ];
  for (const [name, cases, promote, rule] of table) {
    const p = G.promotion(cases);
    assert.strictEqual(p.promote, promote, name);
    assert.strictEqual(p.rule, rule, name);
    if (!promote) assert.ok(p.needs, `${name}: a candidate says what it still needs`);
  }
});

test("promotion via the CLI: observe → candidate → active (origin names why) → bumps; suppression; lint rule; accept", () => {
  const root = project();
  try {
    const base = { source: "pr", sig: "null-check missing before the charge call", category: "functional.check", severity: "P2", outcome: "addressed", author: "human", lang: "ts" };
    const r1 = observe(root, Object.assign({}, base, { ref: "PR 1 · thread 1", path: "src/pay/order.ts", lines: [40, 44], at: iso(3) }));
    assert.strictEqual(r1.status, 0);
    assert.deepStrictEqual(Object.keys(j(r1)), ["ok", "obs", "replaced", "observation", "candidate", "watch", "bumped", "promoted", "helpful", "harmful", "file"]);
    assert.strictEqual(j(r1).watch, true, "a fixed human PR thread is a watch line at once");
    assert.match(j(r1).candidate.id, /^C-[0-9a-f]{6}$/);
    assert.deepStrictEqual(j(r1).promoted, []);
    observe(root, Object.assign({}, base, { ref: "PR 1 · thread 2", path: "src/pay/refund.ts", at: iso(2) }));
    const r3 = j(observe(root, Object.assign({}, base, { ref: "PR 2 · thread 1", path: "src/pay/charge.ts", at: iso(1) })));
    assert.strictEqual(r3.promoted.length, 1);
    assert.strictEqual(r3.promoted[0].rule, "b");
    const e = j(run(["gotcha", "show", r3.promoted[0].id, "--json", "--dir", root]));
    assert.strictEqual(e.fields.scope, "src/pay/**", "the narrowest glob that covers every case");
    assert.strictEqual(e.fields.source, "pr");
    assert.strictEqual(e.kind, "review");
    assert.match(e.fields.origin, /^promoted \(3 addressed cases in 2 PRs within 90 days\)/);
    assert.doesNotMatch(e.text, /@|login/);
    // The next case bumps it — never a second entry.
    const r4 = j(observe(root, Object.assign({}, base, { ref: "PR 3 · thread 1", path: "src/pay/x.ts" })));
    assert.deepStrictEqual(r4.bumped, [e.id]);
    assert.strictEqual(j(run(["gotcha", "show", e.id, "--json", "--dir", root])).hits, 4);
    // Re-reporting the SAME thread replaces its line and bumps nothing.
    const again = j(observe(root, Object.assign({}, base, { ref: "PR 3 · thread 1", path: "src/pay/x.ts" })));
    assert.strictEqual(again.replaced, true);
    assert.deepStrictEqual(again.bumped, []);
    assert.strictEqual(j(run(["gotcha", "why", e.id, "--json", "--dir", root])).count, 4);

    // 2 disputed for the same (category, scope) → a PROPOSED suppression, never applied.
    const d = { source: "pr", sig: "test names are far too long to read", category: "test", severity: "P3", outcome: "disputed", author: "human" };
    observe(root, Object.assign({}, d, { ref: "PR 4 · t1", path: "test/a.spec.ts" }));
    observe(root, Object.assign({}, d, { ref: "PR 5 · t1", path: "test/b.spec.ts" }));
    // A recurring lint rule → a PROJECT action, never a review item.
    for (const i of [1, 2, 3]) observe(root, { source: "sarif", ref: `sarif · ${i}`, rule: "eslint:no-floating-promises", category: "functional.timing", outcome: "addressed", author: "bot", pr: i, path: `src/lib/f${i}.ts` });
    // A bot PR comment is MEASURED, not mined.
    observe(root, { source: "pr", ref: "PR 9 · bot", sig: "consider a better variable name", category: "evolvability.documentation", outcome: "addressed", author: "bot", path: "src/z.ts" });
    const l = run(["gotcha", "list", "--candidates", "--json", "--dir", root]);
    assert.strictEqual(l.status, 0);
    const L = j(l);
    assert.deepStrictEqual(Object.keys(L), ["ok", "count", "candidates", "suppressions", "project_actions", "retire", "quiet", "orphaned", "observations", "rules"]);
    assert.strictEqual(L.suppressions.length, 1);
    assert.strictEqual(L.suppressions[0].scope, "test/**");
    assert.strictEqual(L.project_actions.length, 1);
    assert.strictEqual(L.project_actions[0].promote, false);
    assert.ok(!L.candidates.some((c) => /variable name/.test(c.sig || "")), "a bot finding is not mined");
    const acc = run(["gotcha", "accept", L.suppressions[0].id, "--json", "--dir", root]);
    assert.strictEqual(acc.status, 0);
    assert.strictEqual(j(acc).polarity, "suppress");
    assert.strictEqual(run(["gotcha", "accept", "C-000000", "--json", "--dir", root]).status, 2);
    assert.strictEqual(run(["gotcha", "accept", L.project_actions[0].id, "--json", "--dir", root]).status, 2, "a lint rule is never accepted as a gotcha");
    // Security at 1 case, and a miss at 1 case (DE-28).
    const s = j(observe(root, { source: "sonar", ref: "sonar · AX1", rule: "sonar:ts:S2077", category: "security", cwe: "CWE-89", outcome: "addressed", author: "bot", path: "src/db/q.ts" }));
    assert.strictEqual(s.promoted[0].rule, "c");
    const m = j(observe(root, { source: "pr", ref: "PR 11 · t1", sig: "the retry loop never backs off at all", category: "functional.timing", outcome: "addressed", author: "human", miss: true, path: "src/net/retry.ts" }));
    assert.strictEqual(m.promoted[0].rule, "miss");
    // Malformed observations name the field.
    assert.strictEqual(j(observe(root, { source: "slack", ref: "x", outcome: "addressed", author: "human", sig: "x y z" })).field, "source");
    assert.strictEqual(j(observe(root, { source: "pr", ref: "x", outcome: "fixed", author: "human", sig: "x y z" })).field, "outcome");
    assert.strictEqual(j(observe(root, { source: "pr", ref: "x", outcome: "open", author: "human" })).field, "rule");
  } finally {
    rmrf(root);
  }
});

test("observe: `sig` is normalized — secrets, identifiers, numbers, code and names never land in the file", () => {
  assert.strictEqual(G.normalizeSig("Null-check missing before `charge(order)` in chargeOrder() line 42 @alice"), "null-check missing before in line");
  assert.doesNotMatch(G.normalizeSig("token: ghp_abcdefghijklmnopqrstuvwxyz0123 leaked here"), /ghp|abcdef/);
  assert.ok(G.normalizeSig("word ".repeat(80)).length <= 120);
  assert.ok(G.jaccard("null check missing before charge", "null check missing before the charge") >= 0.3);
  assert.strictEqual(G.jaccard("a b c d", "a b c d"), 1);
  assert.deepStrictEqual(G.deriveScope(["src/a/x.ts"]), { scope: "src/a/x.ts", refused: null });
  assert.deepStrictEqual(G.deriveScope(["src/a/x.ts", "src/b/y.ts"]), { scope: "src/**", refused: null });
  assert.deepStrictEqual(G.deriveScope(["a/x.ts", "b/y.ts"]), { scope: "**/*.ts", refused: null });
  assert.strictEqual(G.deriveScope(["a/x.ts", "b/y.js"]).scope, null, "a whole-repo glob is refused");
});

// v2.1.0 W3 — the "0 so far" defect. A review is also read from the traces: a
// FINDING-OUTCOME line (a clean review too, DE-11) or a hook RETURN of the
// reviewer (a bootstrap trace when the user spawned it directly).
function traceDay(agoDays) {
  const d = new Date(Date.now() - agoDays * DAY);
  return String(d.getUTCDate()).padStart(2, "0") + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCFullYear()).slice(2);
}
function writeTrace(root, name, lines) {
  const dir = path.join(root, ".claude", "orc", "logs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), lines.join("\n") + "\n");
}

test("quality counts a review from the traces: a clean FINDING-OUTCOME, and a bare reviewer RETURN", () => {
  const root = project();
  try {
    const day = traceDay(1);
    writeTrace(root, `run-orc-clean-review-${day}-101010.txt`, [
      `[${day} 10:10:10.000] orc      PHASE review start`,
      `[${day} 10:20:00.000] orc      FINDING-OUTCOME addressed=0 disputed=0 wontfix=0 open=0 pre=0 suppressed=0 :: clean`,
    ]);
    let Q = j(run(["gotcha", "quality", "--json", "--dir", root]));
    assert.strictEqual(Q.reviews, 1, "a clean review is a review");
    assert.strictEqual(Q.reviews_traced, 1);
    assert.strictEqual(Q.reviews_observed, 0);
    assert.strictEqual(Q.findings, 0, "and it adds to nothing else");
    assert.strictEqual(Q.floor_line, "5 reviews needed — 1 so far.");

    writeTrace(root, `run-quick-direct-${day}-111111.txt`, [
      `[${day} 11:11:11.000] hook     SPAWN orc-reviewer-opus-5-low :: review the diff`,
      `[${day} 11:15:00.000] hook     RETURN orc-reviewer-opus-5-low :: review the diff dur=3m49s`,
    ]);
    // A trace with neither line is not a review.
    writeTrace(root, `run-orc-no-review-${day}-121212.txt`, [`[${day} 12:12:12.000] orc      PHASE execution start`]);
    Q = j(run(["gotcha", "quality", "--json", "--dir", root]));
    assert.strictEqual(Q.reviews, 2, "the bootstrap SPAWN/RETURN pair counts; a trace with no review does not");

    // An observation for the SAME run is one review, not two (set union by run).
    const r = observe(root, { source: "review", ref: `run-orc-clean-review-${day}-101010 · F1`, sig: "a finding", category: "functional.check", severity: "P2", outcome: "addressed", author: "orc" });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(j(r).observation.run, `run-orc-clean-review-${day}-101010`, "a ref that starts with the run id fills run");
    Q = j(run(["gotcha", "quality", "--json", "--dir", root]));
    assert.deepStrictEqual([Q.reviews, Q.reviews_traced, Q.reviews_observed], [2, 2, 1]);

    // v2.1.0 W4 — a review the PROJECT asked for is counted on its own line.
    const ext = observe(root, { source: "review", ref: "run-orc-ext-011026-131313 · F1", sig: "an external finding", outcome: "addressed", author: "orc", reviewer: "/code-review" });
    assert.strictEqual(ext.status, 0, ext.stdout + ext.stderr);
    assert.strictEqual(j(ext).observation.reviewer, "/code-review", "the optional field survives normalize");
    Q = j(run(["gotcha", "quality", "--json", "--dir", root]));
    assert.strictEqual(Q.reviews, 2, "the headline counts ORC reviews only");
    assert.deepStrictEqual(Q.by_reviewer, { orc: 2, "/code-review": 1 });
    assert.strictEqual(Q.project_reviews, 1);
  } finally {
    rmrf(root);
  }
});

test("observe refuses author orc without run, by name", () => {
  const root = project();
  try {
    const r = observe(root, { source: "review", ref: "PR 9 · thread 1", sig: "a finding", outcome: "addressed", author: "orc" });
    assert.strictEqual(r.status, 2);
    assert.strictEqual(j(r).field, "run");
    assert.strictEqual(observe(root, { source: "review", ref: "PR 9 · thread 2", sig: "a finding", outcome: "addressed", author: "human" }).status, 0, "a human finding needs no run");
  } finally {
    rmrf(root);
  }
});

test("quality + why + export --review-md: the reads answer one object", () => {
  const root = project();
  try {
    const low = run(["gotcha", "quality", "--json", "--dir", root]);
    assert.strictEqual(low.status, 1, "below the 5-review floor");
    assert.strictEqual(j(low).floor_line, "5 reviews needed — 0 so far.", "the slot keeps the CLI's floor sentence");
    for (let r = 0; r < 5; r++)
      for (let i = 0; i < 3; i++)
        observe(root, { source: "review", ref: `run ${r} · f${i}`, run: `run-${r}`, sig: `finding ${i} words here`, category: "test", severity: "P3", outcome: i ? "disputed" : "addressed", author: "orc", at: iso(5 - r) });
    const q = run(["gotcha", "quality", "--json", "--dir", root]);
    assert.strictEqual(q.status, 0);
    const Q = j(q);
    assert.deepStrictEqual(Object.keys(Q), ["ok", "window_days", "reviews", "reviews_traced", "reviews_observed", "by_reviewer", "project_reviews", "fixes", "misses", "floor", "below_floor", "findings", "categories", "gotchas", "p3_per_review", "trend", "target", "bands", "series", "floor_line"]);
    assert.strictEqual(Q.categories[0].category, "test");
    assert.strictEqual(Q.categories[0].noisy, true, "15 findings at 33 % acceptance");
    assert.strictEqual(Q.p3_per_review, 3);
    assert.deepStrictEqual([Q.target, Q.bands, Q.floor_line], [0.6, { ok: 0.6, warn: 0.35 }, null]);
    assert.strictEqual(Q.series.length, 5, "one point per review");
    assert.deepStrictEqual(Object.keys(Q.series[0]), ["run", "at", "findings", "acceptance", "p3"]);
    assert.strictEqual(Q.series[0].p3, 3);
    assert.strictEqual(run(["gotcha", "why", "G-404", "--json", "--dir", root]).status, 2);
    assert.strictEqual(run(["gotcha", "export", "--review-md", "--json", "--dir", root]).status, 1, "nothing active yet");
    add(root, V1_BODY);
    const x = j(run(["gotcha", "export", "--review-md", "--json", "--dir", root]));
    assert.deepStrictEqual(x.ids, ["G-001"]);
    assert.match(x.markdown, /^# REVIEW\.md/);
    assert.match(x.markdown, /## Always check\n\n- G-001 repair · src\/routes\/\*\*\/\*\.js · /);
  } finally {
    rmrf(root);
  }
});

// v2.0.0 W7 — the Behaviour panel reads `list --json` and derives nothing.
test("list --json carries the panel view: source, status, a 7-week hits line and the last sync state", () => {
  const root = project();
  try {
    fs.writeFileSync(ledger(root), "# Gotchas\n\n" + V1_TEXT + "\n");
    const P = j(run(["gotcha", "list", "--json", "--dir", root])).panel;
    assert.deepStrictEqual(P.statuses, ["active", "candidate", "quiet", "orphaned"]);
    assert.deepStrictEqual(P.sources, Object.keys(G.SOURCE_KIND));
    assert.strictEqual(P.rows[0].source, "repair");
    assert.ok(["active", "quiet", "orphaned"].includes(P.rows[0].status));
    assert.strictEqual(P.rows[0].weeks.length, 7);
    assert.strictEqual(P.sync, null, "no sync has run — no sync state, and list never runs one");
    assert.ok(!fs.existsSync(path.join(root, ".claude", "orc", "gotchas-sync.json")));
    assert.ok(!("panel" in j(run(["gotcha", "status", "--json", "--dir", root]))), "status (a lane preflight) skips the panel view");
  } finally {
    rmrf(root);
  }
});

// ── 8. The files survive update / prune / doctor --fix ──────────────────────
test("files: gotchas.md and observations.jsonl survive update, --prune and doctor --fix, and are never in the manifest", () => {
  const { root, claudeDir } = freshInstall();
  try {
    add(root, V1_BODY);
    observe(root, { source: "pr", ref: "PR 1 · t1", sig: "a b c d e", category: "test", outcome: "addressed", author: "human", path: "test/a.ts" });
    const files = [path.join(claudeDir, "orc", "gotchas.md"), path.join(claudeDir, "orc", "observations.jsonl")];
    const before = files.map((f) => fs.readFileSync(f, "utf8"));
    const manifest = fs.readFileSync(path.join(claudeDir, "orc", "install-manifest.json"), "utf8");
    assert.ok(!/observations\.jsonl|"orc\/gotchas\.md/.test(manifest), "never in the install manifest");
    for (const a of [["update"], ["update", "--prune"], ["doctor", "--fix"]]) {
      cli([...a, "--dir", root]);
      files.forEach((f, i) => assert.strictEqual(fs.readFileSync(f, "utf8"), before[i], `${path.basename(f)} survives ${a.join(" ")}`));
    }
  } finally {
    rmrf(root);
  }
});

// ── 9. Config: the budget is a SIZE, and `gotchas off` is not a switch ──────
test("config: gotcha_card_budget below 200 is refused BY NAME; `gotchas off` prints the always-on notice and still writes (DE-27)", () => {
  const root = project();
  try {
    const low = run(["config", "set", "gotcha_card_budget", "150", "--dir", root]);
    assert.notStrictEqual(low.status, 0);
    assert.match(low.stderr, /gotcha_card_budget must be 200 or more \(got 150\)/);
    assert.match(low.stderr, /not an off switch/);
    assert.strictEqual(run(["config", "set", "gotcha_card_budget", "200", "--dir", root]).status, 0);
    assert.strictEqual(run(["config", "set", "gotcha_sync_hours", "0", "--dir", root]).status, 1);
    assert.strictEqual(run(["config", "set", "sonar_url", "https://sonarcloud.io/", "--dir", root]).status, 0);
    assert.notStrictEqual(run(["config", "set", "sonar_url", "sonarcloud", "--dir", root]).status, 0);
    const off = run(["config", "set", "gotchas", "off", "--dir", root]);
    assert.strictEqual(off.status, 0, "compat: a 1.x value still writes");
    assert.match(off.stderr, /review learning is designed to stay on/);
    const cfg = fs.readFileSync(path.join(root, ".claude", "orc.config.yaml"), "utf8");
    assert.match(cfg, /gotchas:\s*off/);
    assert.match(cfg, /sonar_url:\s*"?https:\/\/sonarcloud\.io"?\s*$/m);
    assert.doesNotMatch(run(["config", "set", "gotchas", "on", "--dir", root]).stderr, /designed to stay on/);
  } finally {
    rmrf(root);
  }
});
