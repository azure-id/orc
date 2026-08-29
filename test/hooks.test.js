"use strict";
// @test-pool spawn  — runs the installed hooks as child processes
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { runHook, rmrf, freshInstall } = require("./_helpers");

// The trace hook writes under <project>/.claude/orc/logs (default). freshInstall
// gives us <root>/.claude, so PROJECT_ROOT for the installed hook is <root>.
function traceFiles(claudeDir) {
  const dir = path.join(claudeDir, "orc", "logs");
  if (!fs.existsSync(dir)) return { dir, texts: "" };
  const texts = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  return { dir, texts };
}

test("trace: SPAWN written for an orc agent on PreToolUse+Task, RETURN survives a tool_name on SubagentStop", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const spawn = runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Task",
      tool_input: { subagent_type: "orc-executor-sonnet-5-high", description: "do a thing" },
    });
    assert.strictEqual(spawn.status, 0, "hook always exits 0");

    // A2 regression: a SubagentStop that ALSO carries tool_name must route to
    // RETURN, not into the SPAWN branch (which would drop it).
    const ret = runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      tool_name: "Task",
    });
    assert.strictEqual(ret.status, 0);

    const { dir, texts } = traceFiles(claudeDir);
    assert.ok(fs.existsSync(path.join(dir, ".current")), "run pointer bootstrapped");
    assert.match(texts, /SPAWN orc-executor-sonnet-5-high/, "SPAWN line recorded");
    assert.match(texts, /hook\s+RETURN/, "RETURN line recorded despite tool_name on SubagentStop");
  } finally {
    rmrf(root);
  }
});

test("trace: RETURN carries agent name + desc + dur + model when agent_type is present", () => {
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-executor-opus-4-8-high", description: "build auth" },
    });
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-executor-sonnet-5-high", description: "wire ui" },
    });
    const ret = runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "orc-executor-sonnet-5-high",
      last_assistant_message: 'done. actual_model: "claude-sonnet-5", actual_effort: high',
    });
    assert.strictEqual(ret.status, 0);
    const { texts } = traceFiles(claudeDir);
    assert.match(texts, /RETURN orc-executor-sonnet-5-high :: wire ui/, "RETURN attributed with its desc");
    assert.match(texts, /dur=\d+m\d+s/, "wall-clock duration appended");
    assert.match(texts, /model=claude-sonnet-5/, "actual_model captured from last_assistant_message");
    assert.doesNotMatch(texts, /RETURN ~/, "an exact agent_type match is never marked approximate");
  } finally {
    rmrf(root);
  }
});

test("trace: without agent_type, RETURN falls back to FIFO and marks it approximate (~)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-executor-haiku-4-5", description: "tiny task" },
    });
    runHook(claudeDir, "orc-trace.js", { hook_event_name: "SubagentStop" });
    const { texts } = traceFiles(claudeDir);
    assert.match(texts, /RETURN ~orc-executor-haiku-4-5 :: tiny task/, "FIFO fallback attributes + marks ~");
  } finally {
    rmrf(root);
  }
});

test("trace: a missing sidecar still writes a (bare) RETURN", () => {
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-executor-opus-4-8-high", description: "build auth" },
    });
    // Simulate a lost/corrupt sidecar: delete every .pending.json in the log dir.
    const logDir = path.join(claudeDir, "orc", "logs");
    for (const f of fs.readdirSync(logDir).filter((f) => f.endsWith(".pending.json")))
      fs.unlinkSync(path.join(logDir, f));
    const ret = runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "orc-executor-opus-4-8-high",
    });
    assert.strictEqual(ret.status, 0);
    const { texts } = traceFiles(claudeDir);
    assert.match(texts, /RETURN orc-executor-opus-4-8-high/, "RETURN still written without the sidecar");
  } finally {
    rmrf(root);
  }
});

test("trace: a duplicate agent_type stop is dropped, not written as a desc-less RETURN", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const spawn = (agent, desc) =>
      runHook(claudeDir, "orc-trace.js", {
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: { subagent_type: agent, description: desc },
      });
    spawn("orc-executor-sonnet-4-6-high", "T2 pairs");
    spawn("orc-executor-sonnet-5-high", "T5 providers");
    // Real stop for T2 → consumes T2's record.
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "orc-executor-sonnet-4-6-high",
    });
    // The SAME stop fires again (the observed double-fire). T5 is still in
    // flight, so T2 has no record left → duplicate → dropped.
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "orc-executor-sonnet-4-6-high",
    });
    const { texts } = traceFiles(claudeDir);
    const t2Returns = (texts.match(/RETURN orc-executor-sonnet-4-6-high/g) || []).length;
    assert.strictEqual(t2Returns, 1, "the duplicate stop writes no second RETURN");

    // …and T5's own RETURN is still available (it was never starved).
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "orc-executor-sonnet-5-high",
    });
    assert.match(traceFiles(claudeDir).texts, /RETURN orc-executor-sonnet-5-high :: T5 providers/);
  } finally {
    rmrf(root);
  }
});

test("trace: with >=2 in flight, an agent_type-less stop consumes no record (no starved RETURN)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const spawn = (agent, desc) =>
      runHook(claudeDir, "orc-trace.js", {
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: { subagent_type: agent, description: desc },
      });
    spawn("orc-executor-sonnet-4-6-high", "T2 pairs");
    spawn("orc-executor-sonnet-5-high", "T5 providers");
    // Blind stop (older Claude Code shape) — must NOT pop T2's record.
    runHook(claudeDir, "orc-trace.js", { hook_event_name: "SubagentStop" });
    const mid = traceFiles(claudeDir).texts;
    assert.match(mid, /RETURN ~agent :: unattributed/, "records the stop without claiming an agent");
    assert.doesNotMatch(mid, /RETURN ~orc-executor-sonnet-4-6-high/, "no blind FIFO pop with >=2 in flight");

    // Both real stops can still claim their own records.
    for (const a of ["orc-executor-sonnet-4-6-high", "orc-executor-sonnet-5-high"])
      runHook(claudeDir, "orc-trace.js", { hook_event_name: "SubagentStop", agent_type: a });
    const texts = traceFiles(claudeDir).texts;
    assert.match(texts, /RETURN orc-executor-sonnet-4-6-high :: T2 pairs/, "T2 keeps its RETURN");
    assert.match(texts, /RETURN orc-executor-sonnet-5-high :: T5 providers/, "T5 is not starved");
  } finally {
    rmrf(root);
  }
});

// ── v0.34.2: the .current clobber, and the unbounded unattributed RETURN ────

test("trace: a FRESH pointer to a not-yet-created file is HONORED, not rotated", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const dir = path.join(claudeDir, "orc", "logs");
    fs.mkdirSync(dir, { recursive: true });
    const rich = "run-orc-my-feature-010126-101010.txt";
    // Exactly the state a lane's run-start step creates one instant before it
    // touches the file — and the state that used to split every run in two.
    fs.writeFileSync(path.join(dir, ".current"), rich + "\n");

    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-trace-writer-haiku-4-5", description: "packet 1" },
    });

    assert.strictEqual(
      fs.readFileSync(path.join(dir, ".current"), "utf8").trim(),
      rich,
      "the pointer is left alone"
    );
    assert.ok(fs.existsSync(path.join(dir, rich)), "the SPAWN lands in the registered name");
    const strays = fs.readdirSync(dir).filter((f) => /^run-\d{6}-\d{6}\.txt$/.test(f));
    assert.deepStrictEqual(strays, [], "no generic bootstrap file is created alongside");
  } finally {
    rmrf(root);
  }
});

test("trace: a STALE pointer to a missing file still rotates to a fresh bootstrap", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const dir = path.join(claudeDir, "orc", "logs");
    fs.mkdirSync(dir, { recursive: true });
    const cur = path.join(dir, ".current");
    fs.writeFileSync(cur, "run-orc-yesterday-311225-090000.txt\n");
    // Age the POINTER past STALE_MS (6h) — a genuinely dangling leftover.
    const old = Date.now() - 8 * 60 * 60 * 1000;
    fs.utimesSync(cur, old / 1000, old / 1000);

    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-executor-haiku-4-5", description: "new run" },
    });

    assert.notStrictEqual(
      fs.readFileSync(cur, "utf8").trim(),
      "run-orc-yesterday-311225-090000.txt",
      "a dangling pointer rotates"
    );
    const strays = fs.readdirSync(dir).filter((f) => /^run-\d{6}-\d{6}\.txt$/.test(f));
    assert.strictEqual(strays.length, 1, "exactly one fresh bootstrap file");
  } finally {
    rmrf(root);
  }
});

test("trace: the first writer dispatch's SPAWN and RETURN both land in the registered file", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const dir = path.join(claudeDir, "orc", "logs");
    fs.mkdirSync(dir, { recursive: true });
    const rich = "run-orc-first-packet-010126-111111.txt";
    fs.writeFileSync(path.join(dir, ".current"), rich + "\n");

    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-trace-writer-haiku-4-5", description: "run_meta packet" },
    });
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "orc-trace-writer-haiku-4-5",
    });

    const text = fs.readFileSync(path.join(dir, rich), "utf8");
    assert.match(text, /SPAWN orc-trace-writer-haiku-4-5/, "SPAWN in the rich file");
    assert.match(text, /RETURN orc-trace-writer-haiku-4-5/, "RETURN in the SAME file (was dropped)");
    const pend = JSON.parse(fs.readFileSync(path.join(dir, rich + ".pending.json"), "utf8"));
    assert.deepStrictEqual(pend, [], "no unconsumable pending record left behind");
  } finally {
    rmrf(root);
  }
});

test("trace: unattributed RETURNs are bounded by the records in flight", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const spawn = (agent, desc) =>
      runHook(claudeDir, "orc-trace.js", {
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: { subagent_type: agent, description: desc },
      });
    spawn("orc-executor-sonnet-4-6-high", "T1");
    spawn("orc-executor-sonnet-5-high", "T2");
    // Three blind stops (no agent_type) against a 2-agent wave.
    for (let i = 0; i < 3; i++)
      runHook(claudeDir, "orc-trace.js", { hook_event_name: "SubagentStop" });

    const texts = traceFiles(claudeDir).texts;
    const loose = (texts.match(/RETURN ~agent :: unattributed/g) || []).length;
    assert.strictEqual(loose, 2, "2 spawns → at most 2 unattributed RETURNs; the stray writes nothing");
  } finally {
    rmrf(root);
  }
});

test("trace: context-combiner opens its own PHASE-EDGE (combine), not analysis", () => {
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-context-combiner-opus-5-high", description: "merge 2 specs" },
    });
    assert.match(traceFiles(claudeDir).texts, /PHASE-EDGE combine/, "combine is its own family");
  } finally {
    rmrf(root);
  }
});

test("payload: every GATE name and lane token used in the payload is a declared member", () => {
  const proto = fs
    .readFileSync(
      path.join(__dirname, "..", "templates", "skills", "_shared", "phases", "trace.md"),
      "utf8"
    )
    .replace(/\r\n/g, "\n");

  const gateRow = proto.split("\n").find((l) => l.includes("| `GATE <name>"));
  assert.ok(gateRow, "found the GATE verb row");
  for (const name of ["grounding", "coverage", "graph", "evidence", "derivation", "facet", "schema", "judgment", "wave-boundary", "budget"])
    assert.ok(gateRow.includes(name), `GATE name "${name}" is declared`);

  const laneRow = proto.match(/lane: orc {2,}#([\s\S]*?)\n\S/);
  assert.ok(laneRow, "found the lane enum");
  for (const lane of ["diy", "orc", "ultra", "mini", "fast", "wiki", "quick"])
    assert.ok(laneRow[1].includes(lane), `lane "${lane}" is declared`);

  // v0.42.0: `combine` must NOT be here. The context-combiner has no slash
  // command and is only ever dispatched from inside an open orc-analyze run, so
  // a `combine` lane is one nothing can open — and a lane no entry point opens
  // is a lane every counting tool (`orc stats`, `/orc-retro`) reports as
  // permanently zero. It stays a PHASE: the hook still gives it its own
  // PHASE-EDGE family (asserted above), inside the analyze trace.
  assert.ok(!/\bcombine\b/.test(laneRow[1]), "`combine` is a phase, not a lane");
});

test("payload: every lane in the trace.md lane enum is one some skill actually opens", () => {
  const skillsRoot = path.join(__dirname, "..", "templates", "skills");
  const proto = fs
    .readFileSync(path.join(skillsRoot, "_shared", "phases", "trace.md"), "utf8")
    .replace(/\r\n/g, "\n");
  const laneRow = proto.match(/lane: orc {2,}#([\s\S]*?)\n\S/);
  const declared = laneRow[1]
    .replace(/#|\(.*?\)/gs, " ")
    .split(/[|\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[a-z]{2,10}$/.test(s));

  // Every `run-<lane>-<slug>-…` pointer any payload file tells a lane to write.
  const opened = new Set();
  const walkAll = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkAll(p);
      else if (e.name.endsWith(".md"))
        for (const m of fs.readFileSync(p, "utf8").matchAll(/run-([a-z0-9]+)-<slug>/g)) opened.add(m[1]);
    }
  };
  walkAll(skillsRoot);

  const phantom = declared.filter((l) => !opened.has(l) && !["lane", "the", "and", "orc"].includes(l));
  assert.deepStrictEqual(
    phantom,
    [],
    `these lanes are declared in _shared/phases/trace.md but no skill writes a run-<lane>-<slug> pointer for them: ${phantom.join(", ")}. ` +
      "A lane nothing opens is counted as permanently zero by orc stats and /orc-retro."
  );
});

// ── v0.45.0: the SUSPEND round trip (RETURN-TO) ────────────────────────────

test("trace: a suspended lane that re-writes its pointer on RESUME keeps ONE file", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const dir = path.join(claudeDir, "orc", "logs");
    fs.mkdirSync(dir, { recursive: true });
    const sender = "run-brainstorm-merchant-onboarding-010126-101010.txt";
    const cur = path.join(dir, ".current");

    // The sender's run-start step: pointer + file, in the same step.
    fs.writeFileSync(cur, sender + "\n");
    fs.writeFileSync(path.join(dir, sender), "");
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-trace-writer-haiku-4-5", description: "brainstorm packet" },
    });

    // It suspends into the receiving lane, which runs its own normal run and —
    // at ITS FINISH — deletes the pointer. That is the whole hazard: from here
    // on, every line the RESUMING lane writes would land somewhere else.
    fs.unlinkSync(cur);

    // The _shared/lane-suspend.md resume rule: re-write .current AND touch the
    // trace file, in the SAME step. Both, or neither.
    fs.writeFileSync(cur, sender + "\n");
    const now = Date.now() / 1000;
    fs.utimesSync(path.join(dir, sender), now, now);

    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-trace-writer-haiku-4-5", description: "post-return packet" },
    });

    const runFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
    assert.deepStrictEqual(runFiles, [sender], "the resumed run stays in ONE file");
    const body = fs.readFileSync(path.join(dir, sender), "utf8");
    assert.match(body, /brainstorm packet/, "the pre-suspend half survives");
    assert.match(body, /post-return packet/, "…and the post-return half joins it");
  } finally {
    rmrf(root);
  }
});

test("payload: the suspend contract states BOTH halves of the resume pointer rule", () => {
  const suspend = fs.readFileSync(
    path.join(__dirname, "..", "templates", "skills", "_shared", "lane-suspend.md"),
    "utf8"
  );
  const rule = suspend.slice(suspend.indexOf("On RESUME"));
  assert.match(rule, /\.current/, "the pointer half is stated");
  assert.match(rule, /touch the trace file/, "the file-creation half is stated");
  assert.match(rule, /SAME step/, "…and they are one step, not two");
  // The receiver deleting the pointer is the reason the rule exists at all —
  // stated, or the next reader deletes the rule as redundant with run start.
  assert.match(suspend, /deletes `log_dir\/\.current` at its `FINISH`/, "the cause is named");
});

test("payload: every numbered menu orc-brainstorm prints ends with the user's own slot", () => {
  const skill = fs
    .readFileSync(
      path.join(__dirname, "..", "templates", "skills", "orc-brainstorm", "SKILL.md"),
      "utf8"
    )
    .replace(/\r\n/g, "\n");

  const blocks = [...skill.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
  let menus = 0;
  for (const b of blocks) {
    const options = b.split("\n").filter((l) => /^\d+\s{2}\S/.test(l));
    if (options.length < 2) continue;
    menus++;
    assert.match(
      options[options.length - 1],
      /Your own/,
      `a menu ends without the open slot:\n${b}`
    );
  }
  // A regex that silently matches nothing would pass forever.
  assert.ok(menus >= 3, `expected the P0 gate, the exit and the suspend offer; found ${menus}`);
});

test("trace: orc-retro is never traced (the miner must not pollute its own data)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-retro-sonnet-5-high", description: "mine traces" },
    });
    const dir = path.join(claudeDir, "orc", "logs");
    assert.ok(!fs.existsSync(path.join(dir, ".current")), "no run pointer bootstrapped for the miner");
    assert.doesNotMatch(traceFiles(claudeDir).texts, /orc-retro/, "no SPAWN for orc-retro");

    // A live run must not absorb a retro RETURN either.
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-executor-haiku-4-5", description: "tiny" },
    });
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "orc-retro-sonnet-5-high",
    });
    assert.doesNotMatch(traceFiles(claudeDir).texts, /RETURN/, "a retro stop never claims an ORC RETURN");
  } finally {
    rmrf(root);
  }
});

test("trace: PHASE-EDGE on a role change, suppressed within a role and for the writer", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const spawn = (agent) =>
      runHook(claudeDir, "orc-trace.js", {
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: { subagent_type: agent, description: "d" },
      });
    spawn("orc-planner-opus-5-med");
    spawn("orc-trace-writer-haiku-4-5"); // narration — never an edge
    spawn("orc-executor-sonnet-5-high");
    spawn("orc-executor-haiku-4-5"); // same family — no second edge
    spawn("orc-reviewer-opus-5-med");
    const { texts } = traceFiles(claudeDir);
    assert.match(texts, /PHASE-EDGE planning :: first=orc-planner-opus-5-med/);
    assert.match(texts, /PHASE-EDGE execution :: first=orc-executor-sonnet-5-high/);
    assert.match(texts, /PHASE-EDGE review :: first=orc-reviewer-opus-5-med/);
    assert.doesNotMatch(texts, /PHASE-EDGE \S+ :: first=orc-trace-writer/, "the writer never opens a phase");
    assert.strictEqual((texts.match(/PHASE-EDGE execution/g) || []).length, 1, "same-family spawns emit one edge");
    assert.strictEqual((texts.match(/PHASE-EDGE /g) || []).length, 3, "exactly one edge per role change");
  } finally {
    rmrf(root);
  }
});

test("trace: after the writer's rename repair, the hook appends to the rich filename", () => {
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

    // Simulate the first orc-trace-writer dispatch's rename duty.
    const rich = "run-orc-cas-multi-exchange-withdrawal-240726-002352.txt";
    fs.renameSync(path.join(dir, boot), path.join(dir, rich));
    fs.renameSync(path.join(dir, boot + ".pending.json"), path.join(dir, rich + ".pending.json"));
    fs.writeFileSync(path.join(dir, ".current"), rich + "\n");

    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-executor-sonnet-5-high", description: "build it" },
    });
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "orc-executor-sonnet-5-high",
    });
    assert.ok(!fs.existsSync(path.join(dir, boot)), "no orphan bootstrap file left behind");
    const text = fs.readFileSync(path.join(dir, rich), "utf8");
    assert.match(text, /SPAWN orc-planner-opus-5-med/, "pre-rename lines survive");
    assert.match(text, /SPAWN orc-executor-sonnet-5-high/, "post-rename SPAWN lands in the rich file");
    assert.match(text, /RETURN orc-executor-sonnet-5-high :: build it/, "attribution survives the rename");
  } finally {
    rmrf(root);
  }
});

test("trace: a SubagentStop with a non-ORC agent_type is dropped", () => {
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { subagent_type: "orc-executor-sonnet-5-high", description: "do a thing" },
    });
    runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "SubagentStop",
      agent_type: "Explore",
    });
    const { texts } = traceFiles(claudeDir);
    assert.doesNotMatch(texts, /hook\s+RETURN/, "a non-ORC subagent never claims an ORC RETURN");
  } finally {
    rmrf(root);
  }
});

test("trace: a non-ORC agent dispatch is never logged", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const r = runHook(claudeDir, "orc-trace.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Task",
      tool_input: { subagent_type: "Explore", description: "search" },
    });
    assert.strictEqual(r.status, 0);
    const { texts } = traceFiles(claudeDir);
    assert.doesNotMatch(texts, /SPAWN/, "non-ORC dispatch writes no SPAWN");
  } finally {
    rmrf(root);
  }
});

test("trace: garbage stdin still exits 0", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const r = runHook(claudeDir, "orc-trace.js", "this is not json{{{");
    assert.strictEqual(r.status, 0);
  } finally {
    rmrf(root);
  }
});

test("effort-guard: /orc blocked below high (exit 2), allowed at high (exit 0)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const low = runHook(claudeDir, "orc-effort-guard.js", {
      tool_name: "Skill",
      tool_input: { skill: "orc" },
      effort: { level: "low" },
    });
    assert.strictEqual(low.status, 2, "low effort /orc is hard-blocked");
    assert.match(low.stderr, /blocked/i);

    const high = runHook(claudeDir, "orc-effort-guard.js", {
      tool_name: "Skill",
      tool_input: { skill: "orc" },
      effort: { level: "high" },
    });
    assert.strictEqual(high.status, 0, "high effort /orc passes");
  } finally {
    rmrf(root);
  }
});

test("effort-guard: a non-orc skill is never gated, garbage never blocks", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const mini = runHook(claudeDir, "orc-effort-guard.js", {
      tool_name: "Skill",
      tool_input: { skill: "orc-mini" },
      effort: { level: "low" },
    });
    assert.strictEqual(mini.status, 0, "orc-mini is not gated");

    const junk = runHook(claudeDir, "orc-effort-guard.js", "not json");
    assert.strictEqual(junk.status, 0, "unparseable payload never blocks");
  } finally {
    rmrf(root);
  }
});

test("effort-guard: xhigh and max clear the /orc baseline (exit 0)", () => {
  const { root, claudeDir } = freshInstall();
  try {
    for (const level of ["xhigh", "max"]) {
      const r = runHook(claudeDir, "orc-effort-guard.js", {
        tool_name: "Skill",
        tool_input: { skill: "orc" },
        effort: { level },
      });
      assert.strictEqual(r.status, 0, `${level} effort must clear the baseline`);
    }
  } finally {
    rmrf(root);
  }
});

test("effort-guard: medium /orc blocked without bridge, allowed with a fresh Fable 5 / Opus 5 bridge", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const payload = {
      tool_name: "Skill",
      tool_input: { skill: "orc" },
      effort: { level: "medium" },
      cwd: root,
    };
    // No bridge → medium is below the Opus baseline → blocked.
    assert.strictEqual(runHook(claudeDir, "orc-effort-guard.js", payload).status, 2);

    // Fresh Fable 5 bridge → medium clears (Fable 5's allowance).
    const bridge = path.join(claudeDir, "orc", "session-model.json");
    fs.mkdirSync(path.dirname(bridge), { recursive: true });
    fs.writeFileSync(bridge, JSON.stringify({ model_id: "claude-fable-5", effort: "medium", written_at: Date.now() }));
    assert.strictEqual(runHook(claudeDir, "orc-effort-guard.js", payload).status, 0, "fable-5 medium clears with a fresh bridge");

    // Fresh Opus 5 bridge → medium clears too (v0.34.0).
    fs.writeFileSync(bridge, JSON.stringify({ model_id: "claude-opus-5", effort: "medium", written_at: Date.now() }));
    assert.strictEqual(runHook(claudeDir, "orc-effort-guard.js", payload).status, 0, "opus-5 medium clears with a fresh bridge");

    // Opus 4.8 is NOT in the allowance — medium stays blocked on the baseline model.
    fs.writeFileSync(bridge, JSON.stringify({ model_id: "claude-opus-4-8", effort: "medium", written_at: Date.now() }));
    assert.strictEqual(runHook(claudeDir, "orc-effort-guard.js", payload).status, 2, "opus-4.8 medium is still blocked");

    // Stale bridge (old written_at) → treated as absent → blocked again.
    fs.writeFileSync(bridge, JSON.stringify({ model_id: "claude-fable-5", effort: "medium", written_at: Date.now() - 60 * 60 * 1000 }));
    assert.strictEqual(runHook(claudeDir, "orc-effort-guard.js", payload).status, 2, "a stale bridge never unblocks");
  } finally {
    rmrf(root);
  }
});

test("statusline: verdict matrix — boosted for opus-4.8 xhigh/max and opus-5/fable-5 medium+, degrade below", () => {
  const { root, claudeDir } = freshInstall();
  const render = (model, effort) =>
    runHook(claudeDir, "orc-statusline.js", {
      cwd: root,
      model: { id: model, display_name: model },
      effort: { level: effort },
    }).stdout;
  try {
    assert.match(render("claude-opus-4-8", "high"), /ORC-ready/, "opus-4.8/high = ready");
    assert.match(render("claude-opus-4-8", "xhigh"), /ORC-boosted/, "opus-4.8/xhigh = boosted");
    assert.match(render("claude-opus-4-8", "max"), /ORC-boosted/, "opus-4.8/max = boosted");
    assert.match(render("claude-fable-5", "medium"), /ORC-boosted/, "fable-5/medium = boosted");
    assert.match(render("claude-fable-5", "max"), /ORC-boosted/, "fable-5/max = boosted");
    assert.match(render("claude-fable-5", "low"), /DEGRADE/, "fable-5/low = degrade");
    assert.match(render("claude-opus-5", "medium"), /ORC-boosted/, "opus-5/medium = boosted");
    assert.match(render("claude-opus-5", "max"), /ORC-boosted/, "opus-5/max = boosted");
    assert.match(render("claude-opus-5", "low"), /DEGRADE/, "opus-5/low = degrade");
    assert.match(render("claude-sonnet-5", "high"), /DEGRADE/, "sonnet-5/high = degrade");
    assert.match(render("claude-opus-4-7", "high"), /DEGRADE/, "opus-4.7 never reads as opus-5");
  } finally {
    rmrf(root);
  }
});

test("statusline: writes the session-model bridge the guard reads", () => {
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-statusline.js", {
      cwd: root,
      model: { id: "claude-fable-5", display_name: "Fable 5" },
      effort: { level: "medium" },
    });
    const bridge = path.join(claudeDir, "orc", "session-model.json");
    assert.ok(fs.existsSync(bridge), "bridge file written");
    const j = JSON.parse(fs.readFileSync(bridge, "utf8"));
    assert.strictEqual(j.model_id, "claude-fable-5");
    assert.ok(typeof j.written_at === "number", "written_at stamped");
  } finally {
    rmrf(root);
  }
});

test("statusline: never prints 'undefined'; renders a rate-limit segment", () => {
  const { root, claudeDir } = freshInstall();
  try {
    // empty payload
    const empty = runHook(claudeDir, "orc-statusline.js", {});
    assert.strictEqual(empty.status, 0);
    assert.doesNotMatch(empty.stdout, /undefined/, "no 'undefined' leaks");

    // Opus 4.8 / high with a 5-hour usage window (epoch-seconds reset in the future)
    const resetEpochS = Math.floor(Date.now() / 1000) + 3600;
    const ok = runHook(claudeDir, "orc-statusline.js", {
      cwd: root,
      model: { id: "claude-opus-4-8", display_name: "Opus 4.8" },
      effort: { level: "high" },
      rate_limits: { five_hour: { used_percentage: 42, resets_at: resetEpochS } },
    });
    assert.strictEqual(ok.status, 0);
    assert.doesNotMatch(ok.stdout, /undefined/);
    assert.match(ok.stdout, /5h 42%/, "renders the 5h usage segment");
    assert.match(ok.stdout, /ORC-ready/, "Opus 4.8/high reads as ORC-ready");
  } finally {
    rmrf(root);
  }
});

test("statusline: a non-Opus model reads as DEGRADE, still no 'undefined'", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const r = runHook(claudeDir, "orc-statusline.js", {
      cwd: root,
      model: { id: "claude-sonnet-5", display_name: "Sonnet 5" },
      effort: { level: "high" },
    });
    assert.strictEqual(r.status, 0);
    assert.doesNotMatch(r.stdout, /undefined/);
    assert.match(r.stdout, /DEGRADE/, "wrong tier warns");
  } finally {
    rmrf(root);
  }
});
