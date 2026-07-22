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

test("effort-guard: medium /orc blocked without bridge, allowed with a fresh Fable 5 bridge", () => {
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

    // Stale bridge (old written_at) → treated as absent → blocked again.
    fs.writeFileSync(bridge, JSON.stringify({ model_id: "claude-fable-5", effort: "medium", written_at: Date.now() - 60 * 60 * 1000 }));
    assert.strictEqual(runHook(claudeDir, "orc-effort-guard.js", payload).status, 2, "a stale bridge never unblocks");
  } finally {
    rmrf(root);
  }
});

test("statusline: verdict matrix — boosted for opus-4.8 xhigh/max and fable-5 medium+, degrade for fable-5 low", () => {
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
    assert.match(render("claude-sonnet-5", "high"), /DEGRADE/, "sonnet-5/high = degrade");
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
