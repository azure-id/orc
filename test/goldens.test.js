"use strict";
// @test-pool spawn  — shells node bin/cli.js; parses bin/cli.js as source
// W1 — THE FREEZE. (v1.0.0 W1; orc-v1-build/orc-v1-plan.md §6.)
//
// Plan rule 6: **no behaviour change without a golden test first.** W2 rewrites
// `shadowReason()` to derive from a family table, W4 moves the score ladder, W5
// reads the `timeline` fields, W6 rewrites the config FILE and W13 recompiles
// DIY from a phase library. Every one of those is a refactor under user-visible
// output, and a refactor you cannot diff is a rewrite.
//
// So this file pins the CURRENT strings, the CURRENT tables and the CURRENT
// shapes, byte for byte, BEFORE any of it moves. A golden here failing is not
// automatically a bug — it is a change somebody has to look at and either
// accept (by regenerating the golden in the same commit that changes the
// behaviour) or revert. What it must never be is invisible.
//
// ONE of these freezes behaviour that is WRONG today, and says so where it sits
// (`orc config set` against a hand-edited advanced key). A golden's job is to
// make a change visible, not to bless it — freezing only the parts we like
// would leave the data loss exactly as invisible as it is now.
//
// REGENERATING a golden file, when a wave deliberately changes one:
//   node bin/cli.js init --dir <tmp> && node bin/cli.js config list --json --dir <tmp>
//   node bin/cli.js diy init --dir <tmp> && node bin/cli.js diy compile --dir <tmp>
// then normalise `> compiled:` and the `orc payload:` version, as below. There
// is deliberately no ORC_UPDATE_GOLDENS flag: a golden that regenerates itself
// on request is a golden nobody reads the diff of.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, freshInstall, tmpdir, CLI } = require("./_helpers");

const GOLDENS = path.join(__dirname, "goldens");
const golden = (name) => fs.readFileSync(path.join(GOLDENS, name), "utf8").replace(/\r\n/g, "\n");
const src = () => fs.readFileSync(CLI, "utf8").replace(/\r\n/g, "\n");
const json = (r) => JSON.parse(r.stdout);

// A config file written by hand, the way the docs tell an advanced user to.
function project(configText) {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  if (configText !== undefined)
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), configText);
  return root;
}

// ---- 1. shadowReason(), verbatim -------------------------------------------
//
// W2 rewrites this function to DERIVE from `CONFIG_FAMILIES` instead of
// branching on key names. That is a refactor, not a re-word, and these strings
// are how the difference is told apart. The `extra_enabled` both-ways case
// needs a verified profile, so it is frozen next to the fake provider in
// test/cli/extra-routing.test.js instead of here.

const RUBRIC_SHADOW = "shadowed by opus5_only — executors use the fixed 2-band Opus 5 ladder";

// W3 REMOVED the Fable 5 role override, and with it the three keys this golden
// used to pin. A golden is deleted only when the behaviour it froze was
// deliberately removed, and then the removal itself gets frozen in its place —
// otherwise the freeze quietly stops covering the thing that changed. So:
// nothing in the registry is shadowed by a `replace` rank any more, and the
// retired names have their own user-facing sentences, pinned below.
test("GOLDEN: opus5_only shadows no registry key, and says why on the hand-written table", () => {
  const root = project("opus5_only: true\n");
  try {
    const j = json(cli(["config", "list", "--json", "--dir", root]));
    // The SET is the golden: a key quietly becoming shadowed is exactly the
    // kind of change a per-key assertion would not notice.
    assert.deepStrictEqual(j.keys.filter((k) => k.is_shadowed).map((k) => k.key), []);
    assert.deepStrictEqual(j.families["fixed-role-model"].ranks.map((r) => r.key), [
      "extra_enabled",
      "opus5_only",
      null,
    ]);
  } finally {
    rmrf(root);
  }
});

test("GOLDEN: a retired key's sentences, byte for byte", () => {
  const root = project("fable5_enabled: true\n");
  try {
    const j = json(cli(["config", "list", "--json", "--dir", root]));
    assert.deepStrictEqual(j.retired_keys, [
      {
        key: "fable5_enabled",
        value: "true",
        removed_in: "1.0.0",
        why: "the Fable 5 role override was removed — every role dispatches its shipped Claude agent, or the Opus 5 variant under opus5_only",
      },
    ]);

    const set = cli(["config", "set", "fable5_enabled", "false", "--dir", root]);
    assert.notStrictEqual(set.status, 0);
    assert.strictEqual(
      set.stderr.trim(),
      "❌ fable5_enabled was removed in v1.0.0 — the Fable 5 role override was removed — every role dispatches its shipped Claude agent, or the Opus 5 variant under opus5_only.\n" +
        "   Nothing reads it. A line already in orc.config.yaml is left alone; delete it when you like."
    );
  } finally {
    rmrf(root);
  }
});

test("GOLDEN: a hand-edited rubric_bands_override is reported shadowed, and read-only", () => {
  const root = project('opus5_only: true\nrubric_bands_override: "[[0,50]]"\n');
  try {
    const j = json(cli(["config", "list", "--json", "--dir", root]));
    assert.deepStrictEqual(
      j.hand_edited.map((h) => h.key),
      ["rubric_bands_override"],
      "CONFIG_META does not know this key, so it lands in hand_edited"
    );
    const h = j.hand_edited[0];
    assert.strictEqual(h.shadow_reason, RUBRIC_SHADOW);
    assert.strictEqual(h.is_shadowed, true);
    // `orc config set` refuses it, so an editor offering to write one would be
    // lying about what happens next.
    assert.strictEqual(h.editable, false);
  } finally {
    rmrf(root);
  }
});

// ---- 2. `orc config list --json`, the whole computed object ----------------
//
// `--json is not a summary` (v0.49.1). W2 adds `answers`, `family`, `prio` and
// `lanes` to every key; W3 REMOVES the three `fable5_*` keys and adds
// `retired_keys`; W5 ADDS the two demotion clocks; W6 regroups the FILE. A key
// leaves this golden only when the release that removed it says so — never in
// passing.

test("GOLDEN: the 72 config keys, their tiers and their defaults", () => {
  const { root } = freshInstall();
  try {
    const j = json(cli(["config", "list", "--json", "--dir", root]));
    const now = j.keys.map((k) => ({ key: k.key, tier: k.tier, default: k.default }));
    const then = JSON.parse(golden("config-keys.json"));
    // ORDER is part of it: CONFIG_META's order is the order the human menu
    // walks, and W6 regroups the FILE without reordering the registry.
    assert.deepStrictEqual(now, then);
    assert.strictEqual(now.length, 72, "the key COUNT is a number the release reports");
  } finally {
    rmrf(root);
  }
});

test("GOLDEN: the top-level shape of config list --json", () => {
  const { root } = freshInstall();
  try {
    const j = json(cli(["config", "list", "--json", "--dir", root]));
    // CHANGED IN W2, deliberately and in the commit that changed it: `families`
    // top-level, and `answers`/`family`/`prio`/`lanes`/`gated_by` per key. The
    // rest of this file — the shadow sentences, the 73 keys, the tables — is
    // unchanged, which is exactly the split a shape golden exists to show.
    //
    // CHANGED AGAIN IN W16, deliberately: `families_resolved` and `rank_states`.
    // `families` above is the static REGISTRY — which ranks exist and in what
    // order; the new key is what those ranks actually DID against the config on
    // disk. It closes a `--json is not a summary` gap in the release that named
    // the rule: the human branch has always printed the resolution ("resolves on
    // P3 the shipped default"), while `--json` carried only the registry a
    // reader would have had to re-run the precedence over. Both halves live in
    // one function, so no lint could have seen it — which is what a shape golden
    // is for. Every pre-existing key keeps its NAME and its POSITION.
    assert.deepStrictEqual(Object.keys(j), [
      "config_path",
      "exists",
      "keys",
      "hand_edited",
      "legacy_keys",
      "retired_keys",
      "score_table",
      "families",
      "families_resolved",
      "rank_states",
      "behavior_trace",
    ]);
    assert.deepStrictEqual(Object.keys(j.keys[0]), [
      "key",
      "tier",
      "answers",
      "family",
      "prio",
      "lanes",
      "gated_by",
      "value",
      "default",
      "is_overridden",
      "is_shadowed",
      "shadow_reason",
      // CHANGED IN W6, deliberately and in the commit that changed it. The
      // human table now prints a RESOLUTION state per row, and rule 10 says
      // `--json is not a summary`, so the JSON carries the same computed
      // fields. `source` keeps the old two-value source answer that
      // `is_overridden` also carries; `state` is the one that can say a row is
      // read by nothing at all.
      "state",
      "state_reason",
      "source",
      "desc",
      "options",
      "control",
    ]);
    assert.deepStrictEqual(Object.keys(j.score_table), [
      "active",
      "base",
      "default",
      "opus5_only",
      "extra",
      "extra_slots",
      "resolve_order",
      "slot_resolve_order",
    ]);
    // The one place precedence is written down as data. W4 changes the TABLES;
    // it must not touch the order they resolve in.
    assert.deepStrictEqual(j.score_table.resolve_order, [
      "extra",
      "opus5_only",
      "rubric_bands_override",
      "default",
    ]);
    assert.deepStrictEqual(j.score_table.slot_resolve_order, [
      "extra slot row",
      "opus5_only variant of that slot's agent",
      "the shipped agent",
    ]);
    // Permanently on and deliberately not a key. A later wave that adds a
    // `behavior_trace` config key has to delete this line to do it.
    assert.deepStrictEqual(j.behavior_trace, { always_on: true, configurable_key: "log_dir" });
  } finally {
    rmrf(root);
  }
});

// ---- 3. The config round trip, including what it LOSES ---------------------
//
// W6 rewrites this file to carry priority-group comments. The read path already
// skips comments; the WRITE path is the problem, and this is the golden that
// says so out loud.

test("GOLDEN: `config set` resolves a legacy key away and drops its line", () => {
  const root = project("opus5_executor_only: true\nmax_scouts: 5\n");
  try {
    let j = json(cli(["config", "list", "--json", "--dir", root]));
    assert.deepStrictEqual(j.legacy_keys, [{ key: "opus5_executor_only", renamed_to: "opus5_only" }]);
    assert.strictEqual(j.keys.find((k) => k.key === "opus5_only").value, "true");

    assert.strictEqual(cli(["config", "set", "max_scouts", "3", "--dir", root]).status, 0);

    const after = fs.readFileSync(path.join(root, ".claude", "orc.config.yaml"), "utf8");
    assert.ok(!/opus5_executor_only/.test(after), "the retired NAME does not survive a write");
    // W6 — the line now carries its RANK, because `opus5_only` sits in a
    // contested family and a file grouped by family says where each key sits in
    // it. The marker is appended, never stacked: a second write finds it there.
    assert.match(after, /^opus5_only: true\s+# P1$/m, "but the VALUE it resolved to does");
    assert.match(after, /^max_scouts: 3$/m);
    j = json(cli(["config", "list", "--json", "--dir", root]));
    assert.deepStrictEqual(j.legacy_keys, [], "so the listing stops reporting it");
  } finally {
    rmrf(root);
  }
});

// W6 · D24 — THE DEFECT ABOVE, FIXED. This test replaces
// `GOLDEN (known defect): a documented multi-line rubric_bands_override does
// not survive a set`, which asserted, line by line, that a user's comment was
// deleted, that the override came back as `""`, and that the file was left
// invalid YAML. W1 froze it so the fixing wave would have to DELETE assertions
// that named the loss rather than quietly make a golden pass; this is that
// deletion, and these are the assertions that replace it.
//
// The fixture is byte-identical to the one W1 measured
// (orc-v1-build/findings/W1-baseline.md §3), so the two tests are comparable.
test("GOLDEN: a hand-written config file survives a set — comments, blocks and all", () => {
  const root = project(
    "# a note the user wrote\n" +
      "max_scouts: 5\n" +
      "rubric_bands_override:\n" +
      "  - { min: 0, max: 50, agent: orc-executor-haiku-4-5 }\n" +
      "  - { min: 50, max: 100, agent: orc-executor-opus-5-high }\n"
  );
  const cfg = path.join(root, ".claude", "orc.config.yaml");
  try {
    // The READ is right first. A block value is its own text — not `""` — so
    // presence and truthiness now agree about the same file, and a list row is
    // never reported as if it were a config key.
    const before = json(cli(["config", "list", "--json", "--dir", root]));
    const hand = Object.fromEntries(before.hand_edited.map((h) => [h.key, h.value]));
    assert.match(hand.rubric_bands_override, /min: 0, max: 50/);
    assert.ok(!("- { min" in hand), "a list row is not a config key");
    assert.deepStrictEqual(Object.keys(hand), ["rubric_bands_override"]);

    assert.strictEqual(cli(["config", "set", "gotchas", "on", "--dir", root]).status, 0);
    const after = fs.readFileSync(cfg, "utf8");

    assert.match(after, /^# a note the user wrote$/m, "the user's comment survives");
    assert.match(
      after,
      /^rubric_bands_override:\n {2}- \{ min: 0, max: 50, agent: orc-executor-haiku-4-5 \}\n {2}- \{ min: 50, max: 100, agent: orc-executor-opus-5-high \}$/m,
      "the documented multi-line form survives BYTE FOR BYTE"
    );
    assert.match(after, /^max_scouts: 5$/m, "an untouched value is not re-serialised");
    assert.match(after, /^gotchas: on$/m, "and the key that was set is written");
    // The comment travels with the key it sits above, wherever the regroup puts
    // it. Hard rule 9: only the comments AROUND a value may move.
    assert.match(after, /# a note the user wrote\nmax_scouts: 5/);

    // Idempotent: a second write does not stack a second copy of anything.
    assert.strictEqual(cli(["config", "set", "gotchas", "off", "--dir", root]).status, 0);
    const twice = fs.readFileSync(cfg, "utf8");
    assert.strictEqual(
      (twice.match(/# a note the user wrote/g) || []).length,
      1,
      "the comment is not duplicated by a regroup"
    );
    assert.strictEqual(twice.replace(/^gotchas: off$/m, "gotchas: on"), after);
  } finally {
    rmrf(root);
  }
});

// The other half of D24: the group comments ORC writes are REGENERATED on every
// write, never accumulated. W1's finding says the read path skips comments for
// free while the WRITE path drops them — so a writer that emitted its headers
// once would grow a stale header every time a key moved family.
test("GOLDEN: ORC's own group comments are regenerated, never accumulated", () => {
  const root = project("max_scouts: 5\n");
  const cfg = path.join(root, ".claude", "orc.config.yaml");
  try {
    for (const [k, v] of [["gotchas", "on"], ["max_scouts", "4"], ["gotchas", "off"]])
      assert.strictEqual(cli(["config", "set", k, v, "--dir", root]).status, 0);
    const after = fs.readFileSync(cfg, "utf8");
    const headers = after.split("\n").filter((l) => l.startsWith("# ──"));
    assert.deepStrictEqual(
      headers.length,
      new Set(headers).size,
      "no group header appears twice"
    );
    assert.strictEqual(
      (after.match(/^# \.claude\/orc\.config\.yaml/gm) || []).length,
      1,
      "and the file header is written exactly once"
    );
    // Every group header names a family the registry knows, and the header
    // sentence about ranks sits above a file that is grouped by family.
    assert.match(after, /^# Grouped by the QUESTION each key answers\./m);
    const declared = Object.keys(json(cli(["config", "list", "--json", "--dir", root])).families);
    for (const h of headers) {
      const name = h.replace(/^# ── /, "").split(" · ")[0].split(" — ")[0].trim();
      assert.ok(
        declared.includes(name) || ["hand-edited", "retired"].includes(name),
        `${name} is a family the registry declares`
      );
    }
  } finally {
    rmrf(root);
  }
});

// ---- 4. `orc diy compile`'s stitched output --------------------------------
//
// W13 recompiles DIY from `_shared/phases/` and deletes `blocks/`. The compiled
// artifact is the contract with the user; this is the file W13 diffs against.

test("GOLDEN: the compiled DIY flow at the wizard's default config", () => {
  const root = tmpdir();
  try {
    assert.strictEqual(cli(["init", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "init", "--dir", root]).status, 0);
    assert.strictEqual(cli(["diy", "compile", "--dir", root]).status, 0);
    const out = fs
      .readFileSync(path.join(root, ".claude", "orc", "diy", "FLOW-COMPILED.md"), "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/^> compiled: .*$/m, "> compiled: <NORMALIZED>")
      .replace(/orc payload: `[0-9.]+`/, "orc payload: `<VERSION>`");
    assert.strictEqual(out, golden("diy-compile-default.md"));
  } finally {
    rmrf(root);
  }
});

// ---- 5. The three score tables, as they are TODAY --------------------------
//
// W4 CHANGED the ladder. These are the values it edited, spelled out here so
// the change was a visible diff of numbers and agent names rather than a regex
// that kept passing. `bin/cli.js` used to carry the opus5_only ladder TWICE
// (OPUS5_BANDS fed bandFor, OPUS5_SCORE_TABLE fed scoreTableJson); W4 collapsed
// them into one binding, and the identity assertion below is what proves they
// can never drift apart again.
//
// The edge is 90 and it is ROUND (D13). Every other edge in the default table
// is round and half-open, so a score of exactly 90 resolves to `med`.

const DEFAULT_TABLE = [
  [0, 30, "orc-executor-haiku-4-5"],
  [30, 40, "orc-executor-sonnet-4-6-med"],
  [40, 55, "orc-executor-sonnet-4-6-high"],
  [55, 65, "orc-executor-sonnet-5-high"],
  [65, 90, "orc-executor-opus-5-low"],
  [90, 101, "orc-executor-opus-5-med"],
];
const OPUS5_LADDER = [
  [0, 90, "orc-executor-opus-5-low"],
  [90, 101, "orc-executor-opus-5-med"],
];
// Named by no band since W4, and still shipped (D14). They are reachable only
// when a user names one explicitly, so the SET is frozen: an agent quietly
// rejoining a default table, or quietly disappearing from disk, are both
// changes somebody has to mean.
const UNBANDED_EXECUTORS = [
  "orc-executor-opus-4-7-high",
  "orc-executor-opus-4-7-med",
  "orc-executor-opus-4-8-high",
  "orc-executor-opus-5-high",
];

// The constants are read out of the source because bin/cli.js is a script, not
// a module - the same technique test/webui/api.test.js already uses.
function constTable(name) {
  const s = src();
  const i = s.indexOf("const " + name + " = [");
  assert.ok(i !== -1, name + " no longer exists in bin/cli.js");
  const block = s.slice(i, s.indexOf("\n];", i));
  return [...block.matchAll(/\[(\d+), (\d+), "([a-z0-9-]+)"\]/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
    m[3],
  ]);
}

test("GOLDEN: DIY_SCORE_TABLE is the 6-band default ladder", () => {
  assert.deepStrictEqual(constTable("DIY_SCORE_TABLE"), DEFAULT_TABLE);
});

test("GOLDEN: the opus5_only ladder is TWO bands, and there is now only ONE copy", () => {
  assert.deepStrictEqual(constTable("OPUS5_SCORE_TABLE"), OPUS5_LADDER);
  // W4's single-source gate. Before it, OPUS5_BANDS was a second array with the
  // same rows — v0.50.0's own comment recorded that the two had already drifted
  // in NAME. It is now an alias, asserted by IDENTITY (`===`) and not by deep
  // equality: two arrays that happen to be equal today are exactly the state
  // that produced the drift, so equality is not a strong enough assertion.
  const s = src();
  assert.match(
    s,
    /const OPUS5_BANDS = OPUS5_SCORE_TABLE;/,
    "OPUS5_BANDS must be an alias binding, never a second array"
  );
  assert.strictEqual(
    (s.match(/const OPUS5_BANDS = \[/g) || []).length,
    0,
    "OPUS5_BANDS was re-declared as an array — that is the drift W4 deleted"
  );
});

test("GOLDEN: an executor no band names still ships, and the set is frozen", () => {
  const { root } = freshInstall();
  try {
    const named = new Set([...DEFAULT_TABLE, ...OPUS5_LADDER].map((r) => r[2]));
    const onDisk = fs
      .readdirSync(path.join(root, ".claude", "agents"))
      .filter((f) => f.startsWith("orc-executor-"))
      .map((f) => f.replace(/\.md$/, ""));
    const unbanded = onDisk.filter((a) => !named.has(a)).sort();
    // D14: they are NOT deleted. A table change is not a model change, and an
    // agent's model change is always a rename — conflating the two is how the
    // downgrade check breaks.
    assert.deepStrictEqual(unbanded, UNBANDED_EXECUTORS);
    for (const a of UNBANDED_EXECUTORS)
      assert.ok(onDisk.includes(a), a + " left disk — D14 says it stays");
  } finally {
    rmrf(root);
  }
});

test("GOLDEN: the tables the CLI SHOWS are the tables the source declares", () => {
  const { root } = freshInstall();
  try {
    const t = json(cli(["config", "list", "--json", "--dir", root])).score_table;
    const rows = (band) => band.map((r) => [r.from, r.inclusive_to ? 101 : r.to, r.agent]);
    assert.deepStrictEqual(rows(t.default), DEFAULT_TABLE);
    assert.deepStrictEqual(rows(t.opus5_only), OPUS5_LADDER);
    assert.strictEqual(t.active, "default");
    assert.strictEqual(t.base, "default");
    assert.strictEqual(t.extra, null);
    assert.strictEqual(t.extra_slots, null);
  } finally {
    rmrf(root);
  }
});

test("GOLDEN: every band edge in the source appears in the two payload copies", () => {
  // The cross-copy gate (design-04 §7.3). CLAUDE.md says this drift is
  // "table-shaped rather than token-shaped" and so invisible to the contract
  // lint. That is true of a whole table; it is NOT true of the edges, which are
  // just numbers — so W4 gives the lint eyes for the part that can have them.
  const payload = path.join(__dirname, "..", "templates");
  const config = fs.readFileSync(path.join(payload, "skills", "orc", "config.md"), "utf8");
  const mapping = fs.readFileSync(path.join(payload, "agents", "MODEL-MAPPING.md"), "utf8");
  const label = ([lo, hi]) => `[${lo},${hi === 101 ? "100]" : hi + ")"}`;

  for (const row of DEFAULT_TABLE) {
    const band = label(row);
    assert.ok(config.includes(band), `orc/config.md is missing the band ${band}`);
    assert.ok(mapping.includes(band), `MODEL-MAPPING.md is missing the band ${band}`);
    assert.ok(config.includes(row[2]), `orc/config.md is missing ${row[2]}`);
    assert.ok(mapping.includes(row[2]), `MODEL-MAPPING.md is missing ${row[2]}`);
  }
  for (const row of OPUS5_LADDER) {
    const band = label(row);
    assert.ok(config.includes(band), `orc/config.md is missing the opus5_only band ${band}`);
  }
  // And the reverse: a RETIRED edge must not still be documented as live. This
  // is the half that catches a half-finished table change.
  for (const dead of ["[65,70)", "[70,80)", "[80,90)", "[40,80)", "[0,40)", "[80,100]"]) {
    assert.ok(!config.includes(dead), `orc/config.md still documents the retired band ${dead}`);
    assert.ok(!mapping.includes(dead), `MODEL-MAPPING.md still documents the retired band ${dead}`);
  }
});

// ---- 6. The stall classification and the timeline shape --------------------
//
// W5 builds the demotion on top of exactly these fields: two consecutive stalls
// or a stale last_progress sends a profile to the bottom of the ladder. It reads
// them; it does not get to rename them, and a field it silently stopped
// emitting would make the trigger unreachable rather than noisy.

test("GOLDEN: EXTRA_FAILURES - the whole taxonomy and every retry flag", () => {
  const s = src();
  const i = s.indexOf("const EXTRA_FAILURES = {");
  const block = s.slice(i, s.indexOf("\n};", i));
  const rows = [...block.matchAll(/^\s*"?([a-z_-]+)"?:\s*\{\s*retry:\s*(true|false),/gm)].map((m) => [
    m[1],
    m[2] === "true",
  ]);
  assert.deepStrictEqual(Object.fromEntries(rows), {
    rate_limit: true,
    overloaded: true,
    server_error: true,
    timeout: true,
    authentication_failed: false,
    model_not_found: false,
    billing_error: false,
    invalid_request: false,
    oauth_org_not_allowed: false,
    max_output_tokens: false,
    "managed-login-conflict": false,
    "engine-unavailable": false,
    "spawn-failed": false,
    "malformed-return": true,
    unreachable: true,
    "stream-interrupted": true,
    "connection-lost-local": true,
    "redirect-refused": false,
    "response-truncated": true,
    // The row W5 triggers on. RETRYABLE is the point: a stall is a position to
    // resume from, not a budget to raise.
    stalled: true,
    unknown: false,
  });
  assert.strictEqual(rows.length, 21, "a new failure class is a change W5 has to see");
});

test("GOLDEN: the timeline field set, on the health report and on a dispatch", () => {
  const s = src();
  // The two blocks sit at different indents, so the close is found by matching
  // braces rather than by guessing how many spaces precede it.
  const fieldsAt = (from) => {
    const i = s.indexOf("timeline: {", from);
    assert.ok(i !== -1, "a timeline block no longer exists after offset " + from);
    let depth = 0;
    let j = i + "timeline: ".length;
    for (; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}" && --depth === 0) break;
    }
    const block = s.slice(i, j);
    return [...block.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).filter((f) => f !== "timeline");
  };
  const health = fieldsAt(s.indexOf('command: "extra health"'));
  assert.deepStrictEqual(health, [
    "total_ms",
    "first_byte_ms",
    "last_progress_ms",
    "longest_gap_ms",
    "quiet_for_ms",
    "stall_budget_ms",
    "wall_budget_ms",
    "stall_budget_clamped",
  ]);
  const dispatch = fieldsAt(s.indexOf("const stopEvidence = {"));
  assert.deepStrictEqual(dispatch, [
    "first_byte_ms",
    "last_progress_ms",
    "longest_gap_ms",
    "quiet_for_ms",
    "stall_budget_ms",
    "wall_budget_ms",
  ]);
});

test("GOLDEN: the watchdog's own return fields, and null as the honest first byte", () => {
  const s = src();
  const i = s.indexOf("const done = (status, err) => {");
  const block = s.slice(i, s.indexOf("\n    };", i));
  const fields = [...block.matchAll(/^\s{8}([a-z_]+)[,:]/gm)].map((m) => m[1]);
  assert.deepStrictEqual(fields, [
    "error",
    "status",
    "stdout",
    "stderr",
    "stopped_by",
    "stall_ms",
    "longest_gap_ms",
    "first_byte_ms",
    "last_progress_ms",
  ]);
  // A worker that never spoke has NO first byte. `null`, never 0 - those are
  // different facts and /orc-budget must not read one as the other. The live
  // proof is in test/cli/extra-journal.test.js; this pins the expression.
  assert.match(block, /first_byte_ms: firstByteAt === null \? null :/);
});
