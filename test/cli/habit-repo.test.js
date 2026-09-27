"use strict";
// @test-pool spawn  — shells node bin/cli.js and git
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { cli, rmrf, tmpdir } = require("../_helpers");

// ── `orc habit repo` + the LEARNED tier in `orc rules slice` (v2.0.0 W6c) ───
//
// `04-habits-spec.md` §7 and DE-8: soft preferences are computed from git with
// no model, proposed only at share ≥ 0.8 over ≥ 20 samples, applied only after
// a yes, and they ride in the ONE assembler below the user's own rules. DE-16:
// `habits: off` = NOTHING — no row, and no byte in `rules slice`.

const j = (r) => JSON.parse(r.stdout);
const G = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];
const git = (root, ...a) => execFileSync("git", [...G, ...a], { cwd: root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

function repo(configText, subjects) {
  const root = tmpdir();
  git(root, "init", "-q");
  fs.mkdirSync(path.join(root, ".claude", "orc"), { recursive: true });
  if (configText !== undefined) fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), configText);
  commits(root, subjects);
  return root;
}
let n = 0;
function commits(root, subjects) {
  for (const s of subjects) {
    n++;
    fs.writeFileSync(path.join(root, `f${n}.test.js`), String(n));
    git(root, "add", "-A", "--", `f${n}.test.js`);
    git(root, "commit", "-q", "-m", s);
  }
}
const cc = (k) => Array.from({ length: k }, (_, i) => `feat(core): add thing ${i}`);

test("repo: habits off produces NOTHING — exit 3, and rules slice carries no learned field", () => {
  const root = repo(undefined, cc(22));
  try {
    const r = cli(["habit", "repo", "--json", "--dir", root]);
    assert.strictEqual(r.status, 3);
    assert.strictEqual(j(r).reason, "off");
    assert.ok(!("rows" in j(r)), "no row under off");
    const s = j(cli(["rules", "slice", "--lane", "orc-mini", "--json", "--dir", root]));
    assert.ok(!("learned" in s), "DE-16: zero bytes — the field is not even present");
    assert.doesNotMatch(s.text, /LEARNED/);
  } finally {
    rmrf(root);
  }
});

test("repo: share ≥ 0.8 over ≥ 20 samples proposes, with the evidence in the row", () => {
  const root = repo("habits: propose\n", cc(22));
  try {
    const r = cli(["habit", "repo", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const rows = Object.fromEntries(j(r).rows.map((x) => [x.id, x]));
    assert.deepStrictEqual(Object.keys(rows), ["commit.conventional", "commit.scope", "commit.ticket", "commit.body", "branch.naming", "test.naming"]);
    assert.strictEqual(rows["commit.conventional"].state, "proposed");
    assert.strictEqual(rows["commit.conventional"].n, 22);
    assert.strictEqual(rows["commit.conventional"].evidence.length, 10);
    assert.match(rows["commit.conventional"].evidence[0], /^[0-9a-f]{7,}$/, "the evidence is commit SHAs");
    assert.strictEqual(rows["test.naming"].value, "test");
    assert.strictEqual(rows["commit.ticket"].state, "observed", "share 0 never proposes");
    assert.strictEqual(rows["branch.naming"].proposable, false, "0 branches < 20 samples");
    assert.ok("facts" in j(r) && typeof j(r).facts.subject_p90 === "number");

    // observe computes the same rows and proposes nothing.
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "habits: observe\n");
    const obs = j(cli(["habit", "repo", "--json", "--dir", root]));
    assert.ok(obs.rows.every((x) => x.state !== "proposed"));
  } finally {
    rmrf(root);
  }
});

test("repo: 19 samples do not propose, and accept refuses with exit 4", () => {
  const root = repo("habits: propose\n", cc(19));
  try {
    const row = j(cli(["habit", "repo", "--json", "--dir", root])).rows.find((x) => x.id === "commit.conventional");
    assert.strictEqual(row.proposable, false);
    assert.match(row.why, /needs 20/);
    assert.strictEqual(cli(["habit", "repo", "accept", "commit.conventional", "--json", "--dir", root]).status, 4);
    assert.strictEqual(cli(["habit", "repo", "accept", "no.such", "--json", "--dir", root]).status, 2);
  } finally {
    rmrf(root);
  }
});

test("learned tier: an accepted preference rides BELOW your rules and above the ORC rules; stale leaves the card", () => {
  const root = repo("habits: propose\n", cc(22));
  try {
    const acc = cli(["habit", "repo", "accept", "commit.conventional", "--json", "--dir", root]);
    assert.strictEqual(acc.status, 0, acc.stdout);
    assert.strictEqual(j(acc).to, "applied");
    assert.strictEqual(j(acc).undo, "orc habit repo forget commit.conventional");

    assert.strictEqual(cli(["rules", "add", "--priority", "P0", "--text", "Never commit on Fridays.", "--dir", root]).status, 0);
    const s = j(cli(["rules", "slice", "--lane", "orc-mini", "--json", "--dir", root]));
    assert.strictEqual(s.learned.length, 1);
    assert.strictEqual(s.learned[0].state, "applied");
    const iYours = s.text.indexOf("YOUR PROJECT'S RULES");
    const iLearned = s.text.indexOf("LEARNED PREFERENCES");
    const iOrc = s.text.indexOf("ORC RULES");
    assert.ok(iYours >= 0 && iYours < iLearned && iLearned < iOrc, "house > yours > learned > ORC");
    assert.match(s.text, /commit\.conventional · Write the commit subject as a Conventional Commit/);

    // The ladder names the tier while habits is on.
    const ladder = j(cli(["rules", "--json", "--dir", root])).precedence.map((p) => p.layer);
    assert.deepStrictEqual(ladder, ["house rules", "your rules", "learned", "ORC rules"]);

    // Re-checked on use: 2 of the last 5 commits match → stale, out of the card.
    commits(root, ["wip 1", "wip 2", "wip 3"]);
    const s2 = j(cli(["rules", "slice", "--lane", "orc-mini", "--json", "--dir", root]));
    assert.strictEqual(s2.learned[0].state, "stale");
    assert.match(s2.learned[0].why, /2 of the last 5/);
    assert.doesNotMatch(s2.text, /LEARNED PREFERENCES/);
    const row = j(cli(["habit", "repo", "--json", "--dir", root])).rows.find((x) => x.id === "commit.conventional");
    assert.strictEqual(row.state, "stale");

    // forget removes it; the history keeps the decision.
    assert.strictEqual(cli(["habit", "repo", "forget", "commit.conventional", "--json", "--dir", root]).status, 0);
    assert.deepStrictEqual(j(cli(["rules", "slice", "--lane", "orc-mini", "--json", "--dir", root])).learned, []);
    const hist = j(cli(["habit", "log", "--states", "--json", "--dir", root])).history.map((h) => h.id);
    assert.deepStrictEqual(hist, ["commit.conventional", "commit.conventional"]);

    // habits back to off: the field and the ladder row are gone again.
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "habits: off\n");
    assert.ok(!("learned" in j(cli(["rules", "slice", "--lane", "orc-mini", "--json", "--dir", root]))));
    assert.strictEqual(j(cli(["rules", "--json", "--dir", root])).precedence.length, 3);
  } finally {
    rmrf(root);
  }
});

test("repo: a folder that is not a git repo answers exit 1", () => {
  const root = tmpdir();
  try {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "habits: observe\n");
    const r = cli(["habit", "repo", "--json", "--dir", root]);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.strictEqual(j(r).reason, "not-git");
  } finally {
    rmrf(root);
  }
});
