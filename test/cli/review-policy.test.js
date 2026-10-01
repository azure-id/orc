"use strict";
// @test-pool spawn  — shells node bin/cli.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, tmpdir } = require("../_helpers");

// ── `orc review policy` — does the PROJECT name its own review? (v2.1.0 W4) ──
//
// A heuristic that only ever ADDS an option to the §0 question; it never picks
// the reviewer. A line counts when it has a review word, a duty word and a name.
// The table pins the rule, so a "smarter" detector cannot quietly drift.

function project(files) {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, ".claude", "orc", "logs"), { recursive: true });
  for (const [rel, body] of Object.entries(files || {})) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}
const policy = (root) => JSON.parse(cli(["review", "policy", "--json", "--dir", root]).stdout);

const TABLE = [
  // [line, counts?, first name]
  ["All code review must go through /code-review before a PR.", true, "/code-review"],
  ["Reviews should always use the `pr-review-toolkit:code-reviewer` agent.", true, "pr-review-toolkit:code-reviewer"],
  ["Every PR needs a review with the security-review skill.", true, "security-review"],
  ["CR is required: run `review-bot` on each change.", true, "review-bot"],
  ["We like reviews.", false, null], // no duty word, no name
  ["You must run /lint before you push.", false, null], // no review word
  ["Code review is important to us.", false, null], // no duty word, no name
  ["Review must use the orc-reviewer-opus-5-low agent.", false, null], // ORC's own reviewer
  ["Always review with /orc-quick.", false, null], // an ORC command is ORC review
];

test("review policy: the detection table", () => {
  for (const [line, counts, name] of TABLE) {
    const root = project({ "CLAUDE.md": `# Rules\n\n${line}\n` });
    try {
      const p = policy(root);
      assert.strictEqual(p.policy, counts ? "project" : "orc", line);
      if (counts) {
        assert.strictEqual(p.found[0].names[0], name, line);
        assert.deepStrictEqual([p.found[0].file, p.found[0].line], ["CLAUDE.md", 3]);
        assert.match(p.line, /before ship, ask which review \(_shared\/review-slice\.md §0\)/);
      } else assert.strictEqual(p.line, null, line);
    } finally {
      rmrf(root);
    }
  }
});

test("review policy: fenced code is skipped, every candidate file is read, exit 0 in every state", () => {
  const root = project({
    "CLAUDE.md": "```\nreview must use /fake\n```\n",
    "AGENTS.md": "Review must use /team-review.\n",
    ".claude/CLAUDE.md": "Code review should go through /local-review.\n",
  });
  try {
    const r = cli(["review", "policy", "--json", "--dir", root]);
    assert.strictEqual(r.status, 0);
    const p = JSON.parse(r.stdout);
    assert.deepStrictEqual(p.found.map((f) => f.file), ["AGENTS.md", ".claude/CLAUDE.md"], "the fenced line never counts");
    const none = project();
    try {
      const n = cli(["review", "policy", "--json", "--dir", none]);
      assert.strictEqual(n.status, 0);
      assert.deepStrictEqual(JSON.parse(n.stdout), { ok: true, policy: "orc", found: [], line: null });
    } finally {
      rmrf(none);
    }
    assert.strictEqual(cli(["review", "--dir", root]).status, 1, "a bare `orc review` is a usage error");
  } finally {
    rmrf(root);
  }
});

test("review policy: the probe reaches every coding lane through lane config, and only there", () => {
  const root = project({ "CLAUDE.md": "All code review must go through /code-review.\n" });
  try {
    for (const lane of ["orc", "orc-mini", "orc-fast", "orc-quick", "orc-diy"]) {
      const o = JSON.parse(cli(["lane", "config", lane, "--json", "--dir", root]).stdout);
      assert.ok(o.probes && o.probes["review-policy"], lane + " carries the probe");
      assert.strictEqual(o.probes["review-policy"].policy, "project", lane);
      assert.match(o.probes["review-policy"].line, /names \/code-review/);
    }
    const v = JSON.parse(cli(["lane", "config", "orc-verify", "--json", "--dir", root]).stdout);
    assert.ok(!v.probes || !v.probes["review-policy"], "a lane that never ships code does not ask");
  } finally {
    rmrf(root);
  }
});

// E21 live-run defects D2–D4 (02-10-2026): lanes wrote REVIEW-WHICH and ASK
// any.review.which with no project rule, `name=none`, a non-file:line tail, and a
// free-text FINDING head. Each is handed back by name; the rest is written.
test("review policy: REVIEW-WHICH needs a rule, a name and file:line; FINDING needs its counts", () => {
  const Q = "run-fast-x-021026-101010.txt";
  const pk = (events) => "phase: f4\nevents:\n" + events.map((e) => `  - {ts: "021026 10:20:00.000", verb: "${e[0]}", tail: "${e[1]}"}`).join("\n") + "\n";
  const setup = (claudeMd) => {
    const root = project(claudeMd ? { "CLAUDE.md": claudeMd } : {});
    fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), "habits: propose\n");
    const logs = path.join(root, ".claude", "orc", "logs");
    fs.writeFileSync(path.join(logs, ".current"), Q + "\n");
    fs.writeFileSync(path.join(logs, Q), "");
    return { root, trace: path.join(logs, Q) };
  };
  const send = (root, events) => {
    const f = path.join(root, "p.yaml");
    fs.writeFileSync(f, pk(events));
    return cli(["trace", "write", "--packet", f, "--json", "--dir", root]);
  };
  const none = setup(null);
  try {
    const r = send(none.root, [["REVIEW-WHICH chose=orc name=/code-review by=user", "CLAUDE.md:1"], ["ASK any.review.which", "offered=orc|project|skip rec=orc chose=orc by=user"], ["OUTCOME task=T1", "ok"]]);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.deepStrictEqual(j.ask_rejected.map((a) => a.qid).sort(), ["REVIEW-WHICH", "any.review.which"], "no rule → both handed back");
    const t = fs.readFileSync(none.trace, "utf8");
    assert.doesNotMatch(t, /REVIEW-WHICH|any\.review\.which/);
    assert.match(t, /OUTCOME task=T1/, "the rest of the packet is written");
  } finally {
    rmrf(none.root);
  }
  const rule = setup("All code review must go through /code-review.\n");
  try {
    assert.strictEqual(send(rule.root, [["REVIEW-WHICH chose=orc name=none by=user", "CLAUDE.md:1"]]).status, 2, "name=none is refused");
    assert.strictEqual(send(rule.root, [["REVIEW-WHICH chose=orc name=/code-review by=user", "CLAUDE.md:Review policy"]]).status, 2, "a tail that is not file:line is refused");
    assert.strictEqual(send(rule.root, [["FINDING 9 findings — P0×2 P1×1", "none fixed"]]).status, 2, "a free-text FINDING head is refused");
    const ok = send(rule.root, [["REVIEW-WHICH chose=orc name=/code-review by=user", "CLAUDE.md:1"], ["FINDING p0=2 p1=1 p2=5 p3=1 pre=8", "none fixed"]]);
    assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(fs.readFileSync(rule.trace, "utf8"), /REVIEW-WHICH chose=orc name=\/code-review by=user :: CLAUDE\.md:1/);
  } finally {
    rmrf(rule.root);
  }
});

test("review policy: a FINISH after code changes with no REVIEW-WHICH gets one nudge; none with the line or without a rule", () => {
  const Q = "run-mini-add-flag-011026-101010.txt";
  const fin = 'phase: FINISH\nevents:\n  - {ts: "011026 10:40:00.000", verb: "FINISH", tail: "done"}\n';
  const SPAWN = "[011026 10:15:00.000] hook     SPAWN orc-executor-sonnet-5-high :: T1 add the flag\n";
  const setup = (claudeMd, body) => {
    const root = project(claudeMd ? { "CLAUDE.md": claudeMd } : {});
    const logs = path.join(root, ".claude", "orc", "logs");
    fs.writeFileSync(path.join(logs, ".current"), Q + "\n");
    fs.writeFileSync(path.join(logs, Q), body);
    return root;
  };
  const write = (root) => {
    const f = path.join(root, "packet.yaml");
    fs.writeFileSync(f, fin);
    const r = cli(["trace", "write", "--packet", f, "--json", "--dir", root]);
    assert.strictEqual(r.status, 0, "it never blocks: " + r.stdout + r.stderr);
    return JSON.parse(r.stdout);
  };
  const RULE = "All code review must go through /code-review.\n";
  const a = setup(RULE, SPAWN);
  try {
    const j = write(a);
    assert.ok(j.review_which_missing, "the nudge is in the --json answer");
    assert.strictEqual(j.review_which_missing.rule, "CLAUDE.md:1");
    assert.match(j.review_which_missing_line, /REVIEW-WHICH/);
  } finally {
    rmrf(a);
  }
  const b = setup(RULE, SPAWN + "[011026 10:30:00.000] orc      REVIEW-WHICH chose=project name=/code-review by=user :: CLAUDE.md:1\n");
  try {
    assert.strictEqual(write(b).review_which_missing, undefined, "the answer is recorded");
  } finally {
    rmrf(b);
  }
  const c = setup(null, SPAWN);
  try {
    assert.strictEqual(write(c).review_which_missing, undefined, "no project rule, nothing to ask");
  } finally {
    rmrf(c);
  }
  const d = setup(RULE, "[011026 10:15:00.000] orc      PHASE intake start\n");
  try {
    assert.strictEqual(write(d).review_which_missing, undefined, "no code changed, nothing to review");
  } finally {
    rmrf(d);
  }
});
