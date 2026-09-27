"use strict";
// @test-pool spawn  — shells node bin/cli.js and the trace hook
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { cli, rmrf, freshInstall, tmpdir, runHook, CLI } = require("../_helpers");
const H = require("../../bin/habit.js");
const T = require("../../bin/trace-write.js");

// ── `orc trace write --packet -` — the CLI holds the trace pen (v2.0.0 T21) ──
//
// The golden PAIR below is hand-made in the writer's formats
// (agents/orc-trace-writer-haiku-4-5.md): `[<ts>] <actor padded to 8> <VERB> :: <tail>`
// and `{"ts","actor","phase","verb","tail",…}`. The CLI must produce exactly it.

const PACKET = `phase: execution wave 2
run_meta:                 # FIRST packet of the run ONLY
  lane: orc               # orc | ultra | mini
  slug: Cas Multi-Exchange Withdrawal
  trace_path: .claude/orc/logs/run-orc-cas-multi-exchange-withdrawal-240726-002352.txt
events:
  - {ts: "240726 00:30:39.881", verb: "VERIFY T2", tail: "actual=claude-sonnet-4-6/high ✅ MATCH"}
  - {ts: "240726 00:30:40.000", verb: "SCORE task=T3 score=62 band=[55,65) model=sonnet-5", tail: "two files, one contract", task: "T3", score: 62}
  - ts: "240726 00:31:00.000"
    actor: orc
    verb: ASK orc.phase-8.ship
    tail: offered=pr|commit|leave rec=pr chose=pr by=user ctx=branch=feature
decisions: >
  User answered "no new deps" verbatim;
  rejected the adapter split.
`;

const GOLDEN_TXT = [
  "[240726 00:30:39.881] orc      VERIFY T2 :: actual=claude-sonnet-4-6/high ✅ MATCH",
  "[240726 00:30:40.000] orc      SCORE task=T3 score=62 band=[55,65) model=sonnet-5 :: two files, one contract",
  "[240726 00:31:00.000] orc      ASK orc.phase-8.ship :: offered=pr|commit|leave rec=pr chose=pr by=user ctx=branch=feature",
  '[240726 00:31:00.000] writer   NOTE :: User answered "no new deps" verbatim; rejected the adapter split.',
];
const GOLDEN_JSONL = [
  '{"ts":"240726 00:30:39.881","actor":"orc","phase":"execution wave 2","verb":"VERIFY T2","tail":"actual=claude-sonnet-4-6/high ✅ MATCH"}',
  '{"ts":"240726 00:30:40.000","actor":"orc","phase":"execution wave 2","verb":"SCORE task=T3 score=62 band=[55,65) model=sonnet-5","tail":"two files, one contract","task":"T3","score":62}',
  '{"ts":"240726 00:31:00.000","actor":"orc","phase":"execution wave 2","verb":"ASK orc.phase-8.ship","tail":"offered=pr|commit|leave rec=pr chose=pr by=user ctx=branch=feature"}',
  '{"ts":"240726 00:31:00.000","actor":"writer","phase":"execution wave 2","verb":"NOTE","tail":"User answered \\"no new deps\\" verbatim; rejected the adapter split."}',
];
const RICH = "run-orc-cas-multi-exchange-withdrawal-240726-002352.txt";
const FINISH = JSON.stringify({
  phase: "ship",
  events: [
    { ts: "240726 00:50:00.000", verb: "STATS lane=orc slug=cas-multi-exchange-withdrawal dispatches=3 waves=1 tasks=1 bands=h:0,m:1,l:0 downgrades=0 duration_ms=1200000" },
    { ts: "240726 00:50:00.100", verb: "FINISH", tail: "shipped" },
  ],
});

function project() {
  const root = tmpdir();
  const logs = path.join(root, ".claude", "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  return { root, logs };
}
function write(root, text, extra) {
  const f = path.join(root, `packet-${Math.random().toString(36).slice(2)}.yaml`);
  fs.writeFileSync(f, text);
  return cli(["trace", "write", "--packet", f, "--dir", root, ...(extra || [])]);
}
const lines = (f) => fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean);

test("trace write: the golden pair — the CLI writes exactly the writer's .txt and .jsonl", () => {
  const v = T.validatePacket(T.parsePacket(PACKET), require_verbs());
  const b = T.renderBlock(v);
  assert.deepStrictEqual(b.txt, GOLDEN_TXT);
  assert.deepStrictEqual(b.jsonl, GOLDEN_JSONL);

  const { root, logs } = project();
  try {
    fs.writeFileSync(path.join(logs, ".current"), RICH + "\n");
    fs.writeFileSync(path.join(logs, RICH), ""); // run start: `touch the trace file`
    const r = write(root, PACKET.replace(/\n/g, "\r\n"), ["--json"]); // CRLF-safe
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.lines_written, 4);
    assert.strictEqual(j.jsonl_written, 4);
    assert.strictEqual(j.renamed, false);
    assert.deepStrictEqual(lines(path.join(logs, RICH)), GOLDEN_TXT);
    assert.deepStrictEqual(lines(path.join(logs, RICH + ".jsonl")), GOLDEN_JSONL);
    // A later packet finds the file through `.current` and only appends.
    assert.strictEqual(write(root, FINISH).status, 0);
    const txt = lines(path.join(logs, RICH));
    assert.deepStrictEqual(txt.slice(0, 4), GOLDEN_TXT, "earlier lines are never rewritten");
    assert.strictEqual(txt.length, 6);
    assert.strictEqual(lines(path.join(logs, RICH + ".jsonl")).length, 6, "same count in both halves");
  } finally {
    rmrf(root);
  }
});

function require_verbs() {
  // The registry lives in cli.js; read it through `orc lane` would cost a spawn.
  // The verbs the golden packet uses are enough, plus one hook verb.
  return {
    VERIFY: { emitter: "orc → writer" },
    SCORE: { emitter: "orc → writer" },
    ASK: { emitter: "orc → writer" },
    SPAWN: { emitter: "hook" },
  };
}

test("trace write: an unknown verb is refused by name, and NOTHING is written", () => {
  const { root, logs } = project();
  try {
    fs.writeFileSync(path.join(logs, ".current"), RICH + "\n");
    fs.writeFileSync(path.join(logs, RICH), "");
    const bad = 'phase: x\nevents:\n  - {ts: "240726 00:30:39.881", verb: "VERIFY T1", tail: "ok"}\n  - {ts: "240726 00:30:40.000", verb: "BOGUS thing"}\n';
    const r = write(root, bad, ["--json"]);
    assert.strictEqual(r.status, 2);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.state, "invalid");
    assert.match(j.reason, /unknown verb BOGUS/);
    assert.strictEqual(fs.readFileSync(path.join(logs, RICH), "utf8"), "", "the valid event is not written either");
    assert.ok(!fs.existsSync(path.join(logs, RICH + ".jsonl")));
    // A hook verb and a "now" stamp are refused the same way.
    const r2 = write(root, 'phase: x\nevents:\n  - {ts: "240726 00:30:39.881", verb: "SPAWN orc-planner-opus-5-med"}\n  - {ts: now, verb: FINISH}\n');
    assert.strictEqual(r2.status, 2);
    assert.match(r2.stderr, /written by the hook/);
    assert.match(r2.stderr, /never "now"/);
    // A later packet with no `.current` (FINISH after the pointer was deleted).
    fs.unlinkSync(path.join(logs, ".current"));
    const r3 = write(root, FINISH);
    assert.strictEqual(r3.status, 3);
    assert.match(r3.stderr, /BEFORE \.current is deleted/);
  } finally {
    rmrf(root);
  }
});

test("trace write: `--packet -` reads stdin", () => {
  const { root, logs } = project();
  try {
    fs.writeFileSync(path.join(logs, ".current"), RICH + "\n");
    fs.writeFileSync(path.join(logs, RICH), "");
    const r = spawnSync(process.execPath, [CLI, "trace", "write", "--packet", "-", "--dir", root], {
      input: PACKET,
      encoding: "utf8",
      env: { ...process.env, ORC_NO_UPDATE_CHECK: "1" },
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.deepStrictEqual(lines(path.join(logs, RICH)), GOLDEN_TXT);
  } finally {
    rmrf(root);
  }
});

test("trace write: `orc stats` and `orc habit` read a CLI-written trace the same as a writer trace", () => {
  const cliP = project();
  const penP = project();
  try {
    // CLI half.
    fs.writeFileSync(path.join(cliP.logs, ".current"), RICH + "\n");
    fs.writeFileSync(path.join(cliP.logs, RICH), "");
    assert.strictEqual(write(cliP.root, PACKET).status, 0);
    assert.strictEqual(write(cliP.root, FINISH).status, 0);
    // Writer half — the same events, hand-written in the writer's format.
    const finishTxt = [
      "[240726 00:50:00.000] orc      STATS lane=orc slug=cas-multi-exchange-withdrawal dispatches=3 waves=1 tasks=1 bands=h:0,m:1,l:0 downgrades=0 duration_ms=1200000",
      "[240726 00:50:00.100] orc      FINISH :: shipped",
    ];
    fs.writeFileSync(path.join(penP.logs, RICH), GOLDEN_TXT.concat(finishTxt).join("\n") + "\n");
    assert.strictEqual(fs.readFileSync(path.join(cliP.logs, RICH), "utf8"), fs.readFileSync(path.join(penP.logs, RICH), "utf8"));

    const strip = (o) => JSON.parse(JSON.stringify(o).split(cliP.root.replace(/\\/g, "\\\\")).join("R").split(penP.root.replace(/\\/g, "\\\\")).join("R"));
    const s1 = JSON.parse(cli(["stats", "--json", "--dir", cliP.root]).stdout);
    const s2 = JSON.parse(cli(["stats", "--json", "--dir", penP.root]).stdout);
    assert.strictEqual(s1.runs, 1);
    assert.strictEqual(s1.dispatches, 3, "the STATS line is read");
    assert.deepStrictEqual(strip(s1), strip(s2));

    const h1 = JSON.parse(cli(["habit", "log", "--json", "--dir", cliP.root]).stdout);
    const h2 = JSON.parse(cli(["habit", "log", "--json", "--dir", penP.root]).stdout);
    assert.strictEqual(h1.count, 1);
    assert.strictEqual(h1.events[0].qid, "orc.phase-8.ship");
    assert.deepStrictEqual(h1.events, h2.events);
  } finally {
    rmrf(cliP.root);
    rmrf(penP.root);
  }
});

test("trace write: an ASK event round-trips (write → parseAskLine)", () => {
  const { root, logs } = project();
  try {
    fs.writeFileSync(path.join(logs, ".current"), RICH + "\n");
    fs.writeFileSync(path.join(logs, RICH), "");
    const ask = 'phase: ship\nevents:\n  - {ts: "240726 00:40:00.000", verb: "ASK orc.phase-5-5.security", tail: "offered=run|skip rec=run chose=skip by=user ctx=risk=cited"}\n';
    assert.strictEqual(write(root, ask).status, 0);
    const line = lines(path.join(logs, RICH)).find((l) => /ASK /.test(l));
    const a = H.parseAskLine(line);
    assert.ok(a && a.ok, JSON.stringify(a));
    assert.strictEqual(a.qid, "orc.phase-5-5.security");
    assert.strictEqual(a.chose, "skip");
    assert.strictEqual(a.by, "user");
    assert.deepStrictEqual(a.ctx, { risk: "cited" });
    const row = JSON.parse(lines(path.join(logs, RICH + ".jsonl"))[0]);
    assert.strictEqual(row.verb, "ASK orc.phase-5-5.security");
  } finally {
    rmrf(root);
  }
});

test("trace write: the first packet renames a hook-bootstrapped file, and the hook follows it", () => {
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-planner-opus-5-med", description: "plan it" },
    });
    const dir = path.join(claudeDir, "orc", "logs");
    const boot = fs.readFileSync(path.join(dir, ".current"), "utf8").trim();
    assert.match(boot, /^run-\d{6}-\d{6}\.txt$/, "hook bootstraps its generic slug");
    const stamp = boot.slice(4, -4);

    const r = write(root, PACKET, ["--json"]);
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    const j = JSON.parse(r.stdout);
    const rich = `run-orc-cas-multi-exchange-withdrawal-${stamp}.txt`;
    assert.strictEqual(j.renamed, true);
    assert.strictEqual(path.basename(j.trace_path), rich, "the bootstrap stamp is reused");
    assert.strictEqual(fs.readFileSync(path.join(dir, ".current"), "utf8").trim(), rich);
    assert.ok(!fs.existsSync(path.join(dir, boot)), "a MOVE, never a fresh create");
    assert.ok(fs.existsSync(path.join(dir, rich + ".pending.json")), "the pending sidecar moved too");

    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "orc-planner-opus-5-med",
    });
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-executor-sonnet-5-high", description: "build it" },
    });
    const text = fs.readFileSync(path.join(dir, rich), "utf8");
    assert.match(text, /SPAWN orc-planner-opus-5-med/, "pre-rename hook lines survive");
    assert.match(text, /RETURN orc-planner-opus-5-med :: plan it/, "attribution survives the rename");
    assert.match(text, /SPAWN orc-executor-sonnet-5-high/, "post-rename SPAWN lands in the rich file");
    assert.match(text, /writer   NOTE :: /, "the narration is in the same file");
    assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".txt")), [rich], "one file, not a split run");
  } finally {
    rmrf(root);
  }
});

// The packet shapes a live lane actually sent (eval E1, 27-09-2026): `note:` for the
// tail, a bare `GATE`, a tail that starts with `::`, and a no-`::` verb with only a tail.
test("trace write: a live packet's shape is repaired from the grammar, and a bare GATE with no head is refused", () => {
  const { root, logs } = project();
  try {
    fs.writeFileSync(path.join(logs, ".current"), RICH + "\n");
    fs.writeFileSync(path.join(logs, RICH), "");
    const live = [
      "phase: preflight",
      "events:",
      '  - {ts: "270926 13:54:23.000", verb: "GATE grounding pass", note: "src/app.js globbed"}',
      '  - {ts: "270926 13:54:24.000", verb: "GATE", tail: "coverage pass :: 0 orphans"}',
      '  - {ts: "270926 13:54:25.000", verb: "GATE complexity pass", tail: ":: mini-ok"}',
      '  - {ts: "270926 13:54:26.000", verb: "OUTCOME", tail: "task=T1 score=12 band=[0,30) model=claude-haiku-4-5 retries=0 requeues=0 needs_context=0 unmet=0"}',
      '  - {ts: "270926 13:54:27.000", verb: "ASK", tail: "quick.q3.offer.review :: offered=review-first|commit-direct|stop rec=review-first chose=review-first by=user"}',
      "",
    ].join("\n");
    const r = write(root, live, ["--json"]);
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    const txt = lines(path.join(logs, RICH));
    assert.deepStrictEqual(txt.map((l) => l.replace(/^\[[^\]]+\]\s+\S+\s+/, "")), [
      "GATE grounding pass :: src/app.js globbed",
      "GATE coverage pass :: 0 orphans",
      "GATE complexity pass :: mini-ok",
      "OUTCOME task=T1 score=12 band=[0,30) model=claude-haiku-4-5 retries=0 requeues=0 needs_context=0 unmet=0",
      "ASK quick.q3.offer.review :: offered=review-first|commit-direct|stop rec=review-first chose=review-first by=user",
    ]);
    const rows = lines(path.join(logs, RICH + ".jsonl")).map((l) => JSON.parse(l));
    assert.strictEqual(rows[0].tail, "src/app.js globbed");
    assert.strictEqual(rows[0].note, undefined, "the alias is not copied a second time");
    const ask = H.parseAskLine(txt[4].replace(/^\[[^\]]+\]\s+\S+\s+/, ""));
    assert.ok(ask && ask.ok !== false, "the repaired ASK line parses: " + JSON.stringify(ask));
    // A GATE with no name and no `args :: detail` split cannot be repaired — refused, nothing written.
    const before = fs.readFileSync(path.join(logs, RICH), "utf8");
    const bad = write(root, 'phase: x\nevents:\n  - {ts: "270926 13:55:00.000", verb: "GATE", note: "phase-1 exit ok"}\n', ["--json"]);
    assert.notStrictEqual(bad.status, 0);
    assert.match(bad.stdout + bad.stderr, /GATE needs its head arguments/);
    assert.strictEqual(fs.readFileSync(path.join(logs, RICH), "utf8"), before);
  } finally {
    rmrf(root);
  }
});

// eval E2 (27-09-2026): a live lane read habits.md and then wrote no ASK. At the FINISH
// packet, with habits on and zero ASK lines, the CLI names the lane's questions (exit 0).
test("trace write: a FINISH with habits on and no ASK line asks for the missing ASKs; none when off or when an ASK exists", () => {
  const Q = "run-quick-ping-endpoint-270926-152042.txt";
  const fin = 'phase: FINISH\nevents:\n  - {ts: "270926 15:29:07.002", verb: "FINISH", tail: "done"}\n';
  const cfg = (root, mode) => fs.writeFileSync(path.join(root, ".claude", "orc.config.yaml"), `habits: ${mode}\n`);
  const setup = (mode, firstLine) => {
    const p = project();
    cfg(p.root, mode);
    fs.writeFileSync(path.join(p.logs, ".current"), Q + "\n");
    fs.writeFileSync(path.join(p.logs, Q), firstLine || "");
    return p;
  };
  const a = setup("propose");
  try {
    const r = write(a.root, fin, ["--json"]);
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    const j = JSON.parse(r.stdout);
    assert.ok(j.ask_missing, "the nudge is in the --json answer");
    assert.ok(j.ask_missing.qids.includes("quick.q3.offer.review"));
    assert.match(j.ask_missing.line, /wrote NO ASK line/);
    assert.strictEqual(Object.keys(j)[0], "ask_missing_line", "the nudge is the FIRST key — a lane pipes through head");
    const t = write(a.root, fin.replace("15:29:07.002", "15:29:08.000"));
    assert.match(t.stdout.split("\n")[0], /habits: propose — this run wrote NO ASK line/, "the text form prints it first");
    // The lane already removed .current: a late packet naming its run still appends.
    fs.unlinkSync(path.join(a.logs, ".current"));
    const late = `run: ${Q.replace(/\.txt$/, "")}\nphase: habits\nevents:\n  - {ts: "270926 15:29:09.000", verb: "ASK quick.q3.offer.review", tail: "offered=review-first|commit-direct|stop rec=review-first chose=review-first by=user"}\n`;
    const lr = write(a.root, late, ["--json"]);
    assert.strictEqual(lr.status, 0, lr.stderr + lr.stdout);
    assert.match(fs.readFileSync(path.join(a.logs, Q), "utf8"), /ASK quick\.q3\.offer\.review :: offered=/);
    assert.strictEqual(write(a.root, late.replace(/run: .*\n/, "run: run-quick-nope-270926-000000\n")).status, 3, "a run that names no existing trace is still refused");
  } finally { rmrf(a.root); }
  const b = setup("off");
  try {
    const j = JSON.parse(write(b.root, fin, ["--json"]).stdout);
    assert.strictEqual(j.ask_missing, undefined, "habits off → zero bytes");
  } finally { rmrf(b.root); }
  const c = setup("propose", "[270926 15:25:00.000] orc      ASK quick.q3.offer.review :: offered=review-first|commit-direct|stop rec=review-first chose=review-first by=user\n");
  try {
    const j = JSON.parse(write(c.root, fin, ["--json"]).stdout);
    assert.ok(!j.ask_missing.qids.includes("quick.q3.offer.review"), "a recorded question is not asked for again");
    assert.ok(j.ask_missing.qids.includes("quick.q2.gate.code"), "the others still are");
    assert.match(j.ask_missing.line, /recorded ASK for quick\.q3\.offer\.review only/);
  } finally { rmrf(c.root); }
});

// eval E2: a live lane wrote `chose=orc-reviewer-opus-5-med` for quick.q3.offer.review.
// An invalid ASK stays OUT of the trace and comes back with the option ids; the
// packet's other events are still written.
test("trace write: an ASK with the wrong option ids is rejected with the right ones, the rest of the packet is written", () => {
  const { root, logs } = project();
  try {
    fs.writeFileSync(path.join(logs, ".current"), RICH + "\n");
    fs.writeFileSync(path.join(logs, RICH), "");
    const pk = [
      "phase: q3",
      "events:",
      '  - {ts: "270926 17:27:00.000", verb: "GATE review pass", tail: "offer shown"}',
      '  - {ts: "270926 17:27:01.000", verb: "ASK quick.q3.offer.review", tail: "offered=orc-reviewer-opus-5-med|adhoc rec=orc-reviewer-opus-5-med chose=orc-reviewer-opus-5-med by=user"}',
      "",
    ].join("\n");
    const r = write(root, pk, ["--json"]);
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(Object.keys(j)[0], "ask_rejected_line");
    assert.strictEqual(j.ask_rejected[0].options, "review-first|commit-direct|stop");
    const txt = fs.readFileSync(path.join(logs, RICH), "utf8");
    assert.match(txt, /GATE review pass :: offer shown/);
    assert.doesNotMatch(txt, / ASK /, "the invalid ASK is not written");
    // An ASK-only packet that is all invalid writes nothing and still exits 0.
    const only = write(root, 'phase: q3\nevents:\n  - {ts: "270926 17:28:00.000", verb: "ASK quick.q3.offer.review", tail: "offered=a|b rec=a chose=a by=user"}\n', ["--json"]);
    assert.strictEqual(only.status, 0);
    assert.strictEqual(JSON.parse(only.stdout).lines_written, 0);
  } finally {
    rmrf(root);
  }
});

// eval E2: `stop` at the commit offer AFTER the review was recorded as the same
// qid. A repeat ASK with no new executor SPAWN since the last one is a follow-up.
test("trace write: a repeat ASK in the same entry is a follow-up and is kept out; a new entry's ASK counts", () => {
  const { root, logs } = project();
  try {
    fs.writeFileSync(path.join(logs, ".current"), RICH + "\n");
    fs.writeFileSync(path.join(logs, RICH),
      "[270926 17:40:00.000] hook     SPAWN orc-executor-sonnet-4-6-med :: entry 1\n" +
      "[270926 17:45:00.000] orc      ASK quick.q3.offer.review :: offered=review-first|commit-direct|stop rec=none chose=review-first by=user\n" +
      "[270926 17:46:00.000] hook     SPAWN orc-reviewer-opus-5-med :: review entry 1\n");
    const ask = (ts, chose) => `phase: q3\nevents:\n  - {ts: "${ts}", verb: "ASK quick.q3.offer.review", tail: "offered=review-first|commit-direct|stop rec=none chose=${chose} by=user"}\n`;
    const r = JSON.parse(write(root, ask("270926 17:48:00.000", "stop"), ["--json"]).stdout);
    assert.match(r.ask_rejected[0].error, /follow-up/);
    assert.strictEqual((fs.readFileSync(path.join(logs, RICH), "utf8").match(/ ASK /g) || []).length, 1);
    fs.appendFileSync(path.join(logs, RICH), "[270926 17:50:00.000] hook     SPAWN orc-executor-sonnet-4-6-med :: entry 2\n");
    const r2 = JSON.parse(write(root, ask("270926 17:55:00.000", "review-first"), ["--json"]).stdout);
    assert.strictEqual(r2.ask_rejected, undefined, "a new entry answers again");
    assert.strictEqual((fs.readFileSync(path.join(logs, RICH), "utf8").match(/ ASK /g) || []).length, 2);
  } finally {
    rmrf(root);
  }
});

// eval E2: a live lane invented `q3-review`. An unknown qid is refused with the lane's ids.
test("trace write: an ASK with an unknown question id is refused and the lane's real ids are named", () => {
  const { root, logs } = project();
  try {
    const Q = "run-quick-get-random-270926-191359.txt";
    fs.writeFileSync(path.join(logs, ".current"), Q + "\n");
    fs.writeFileSync(path.join(logs, Q), "");
    const r = JSON.parse(write(root, 'phase: q3\nevents:\n  - {ts: "270926 19:23:00.000", verb: "ASK q3-review", tail: "offered=yes|no rec=none chose=yes by=user"}\n', ["--json"]).stdout);
    assert.match(r.ask_rejected[0].error, /unknown question id — use one of: .*quick\.q3\.offer\.review/);
    assert.doesNotMatch(r.ask_rejected[0].error, /orc\.intake\.testgen/, "only this lane's ids");
    assert.strictEqual(fs.readFileSync(path.join(logs, Q), "utf8"), "");
  } finally {
    rmrf(root);
  }
});
