"use strict";
// @test-pool spawn  — shells node bin/cli.js stats
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, tmpdir } = require("../_helpers");

// ── W6b (08 Q7) — "fewer questions", measured ───────────────────────────────
// `orc stats --json` → questions{} from the ASK lines (04-habits-spec §1) and
// the subagent QUESTION lines, read by the habit engine's ONE pass (`collect`).
// ASKED = by=user|learned + QUESTION count · ANSWERED FOR YOU = by=ledger|config|default.

function project() {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, ".claude", "orc", "logs"), { recursive: true });
  return root;
}
const put = (root, name, lines) => fs.writeFileSync(path.join(root, ".claude", "orc", "logs", name), lines.join("\r\n") + "\r\n");

test("stats: questions per run, per lane and per point, from a fixture trace with ASK lines", () => {
  const root = project();
  try {
    put(root, "run-quick-fix-a-250926-100000.txt", [
      "[250926 10:00:00.000] quick  PHASE q0 start",
      "[250926 10:01:00.000] quick  ASK quick.q3.offer.review :: offered=review-first|commit-direct|stop rec=review-first chose=review-first by=user",
      "[250926 10:02:00.000] quick  ASK quick.q3.offer.review :: offered=review-first|commit-direct|stop rec=review-first chose=commit-direct by=ledger",
      "[250926 10:03:00.000] quick  QUESTION count=2 :: which endpoint",
      "[250926 10:04:00.000] quick  FINISH",
    ]);
    put(root, "run-mini-add-b-260926-110000.txt", [
      "[260926 11:00:00.000] mini  ASK mini.phase-x.mock :: offered=build|skip rec=skip chose=skip by=learned pre=skip",
      "[260926 11:01:00.000] mini  ASK mini.phase-x.mock :: offered=build|skip rec=skip chose=skip by=config",
      "[260926 11:02:00.000] mini  FINISH",
    ]);
    put(root, "run-mini-add-c-270926-120000.txt", ["[270926 12:00:00.000] mini  FINISH"]);
    // A dry run is excluded, exactly as the habit engine excludes it.
    put(root, "run-mini-dry-d-270926-130000.txt", [
      "[270926 13:00:00.000] mini  ASK mini.phase-x.mock :: offered=build|skip rec=skip chose=skip by=user",
      "[270926 13:01:00.000] mini  FINISH dry-run",
    ]);
    const r = cli(["stats", "--dir", root, "--json"]);
    assert.strictEqual(r.status, 0, r.stderr);
    const q = JSON.parse(r.stdout).questions;
    assert.ok(q, "questions{} is present");
    assert.strictEqual(q.runs, 3, "three included runs — a run with no question counts as 0");
    assert.strictEqual(q.asked, 4, "1 by=user + 2 QUESTION + 1 by=learned");
    assert.strictEqual(q.answered_for_you, 2, "by=ledger + by=config");
    assert.strictEqual(q.subagent_questions, 2);
    assert.deepStrictEqual(q.by, { user: 1, ledger: 1, learned: 1, config: 1, default: 0 });
    assert.strictEqual(q.per_run_p50, 1, "per run 3 · 1 · 0 → median 1");
    assert.deepStrictEqual(q.per_run_trend.map((x) => x.asked), [3, 1, 0], "oldest first");
    assert.strictEqual(q.by_lane.quick.asked, 3);
    assert.strictEqual(q.by_lane.mini.runs, 2);
    assert.strictEqual(q.by_lane.mini.per_run_p50, 0.5);
    assert.deepStrictEqual(q.by_point["quick.q3.offer.review"], { asked: 1, answered_for_you: 1, lanes: ["quick"] });
    assert.deepStrictEqual(q.by_point["mini.phase-x.mock"], { asked: 1, answered_for_you: 1, lanes: ["mini"] });

    // --since filters on the filename date, the same as every other stats row.
    const s = JSON.parse(cli(["stats", "--dir", root, "--since", "2026-09-26", "--json"]).stdout).questions;
    assert.strictEqual(s.runs, 2);
    assert.strictEqual(s.asked, 1);

    // The human path prints what --json carries (`--json is not a summary`, both halves).
    const h = cli(["stats", "--dir", root]).stdout;
    assert.match(h, /Questions\s+4 asked · 2 answered for you/);
    assert.match(h, /per run \(median\)\s+1/);
    assert.match(h, /quick\.q3\.offer\.review\s+1 asked · 1 answered for you/);
  } finally {
    rmrf(root);
  }
});

test("stats: no traces → questions is null, never a guessed zero", () => {
  const root = project();
  try {
    const r = cli(["stats", "--dir", root, "--json"]);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(JSON.parse(r.stdout).questions, null);
  } finally {
    rmrf(root);
  }
});
