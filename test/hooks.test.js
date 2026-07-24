"use strict";
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
    spawn("orc-planner-opus-4-8-med");
    spawn("orc-trace-writer-haiku-4-5"); // narration — never an edge
    spawn("orc-executor-sonnet-5-high");
    spawn("orc-executor-haiku-4-5"); // same family — no second edge
    spawn("orc-reviewer-opus-4-8-high");
    const { texts } = traceFiles(claudeDir);
    assert.match(texts, /PHASE-EDGE planning :: first=orc-planner-opus-4-8-med/);
    assert.match(texts, /PHASE-EDGE execution :: first=orc-executor-sonnet-5-high/);
    assert.match(texts, /PHASE-EDGE review :: first=orc-reviewer-opus-4-8-high/);
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
      tool_input: { subagent_type: "orc-planner-opus-4-8-med", description: "plan it" },
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
    assert.match(text, /SPAWN orc-planner-opus-4-8-med/, "pre-rename lines survive");
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
