"use strict";
// @test-pool spawn  — shells node bin/cli.js and runs the installed hook
//
// THE SECOND BOARD. (v1.4.0.)
//
// Claude Code renders a custom row per subagent in the agent panel and hands
// this hook the whole task list. It reuses the compiler, the IR, every
// renderer, the glyph sets, the colour model and the validator — a different
// binding table and a different config key, and that is the whole difference.
// Several tests here exist to keep it that way, because the cheap mistake is a
// second compiler.
//
// The other half is the measurement. v1.2.0 established that the TRANSCRIPT
// records no token usage for a dispatched subagent; that stands. The agent
// panel reports one, and the hook writes down what it is handed — as a FLOOR,
// labelled one everywhere it appears.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { REPO, cli, rmrf, runHook, freshInstall } = require("./_helpers.js");

function slj(root, args) {
  const r = cli(["statusline", ...args, "--dir", root, "--json"]);
  let j = null;
  try {
    j = JSON.parse(r.stdout);
  } catch (_) {}
  return { status: r.status, json: j, raw: r.stdout };
}

function tasks(over) {
  return [
    Object.assign(
      {
        id: "a1",
        name: "orc-executor-opus-5-low",
        type: "orc-executor-opus-5-low",
        status: "running",
        model: "claude-opus-5",
        effort: "low",
        tokenCount: 84000,
        contextWindowSize: 200000,
        startTime: Date.now() - 600000,
      },
      over || {}
    ),
    {
      id: "a2",
      name: "orc-reviewer-opus-5-med",
      status: "completed",
      model: "claude-opus-5",
      effort: "medium",
      tokenCount: 31000,
    },
  ];
}

// ── one compiler ───────────────────────────────────────────────────────────

test("subagent line: there is ONE compiler and ONE render engine, not two", () => {
  // The cheap mistake this whole design exists to avoid. The second board is a
  // TABLE — a component set, three filenames and a config key — and if it ever
  // grows its own renderer the two boards start disagreeing about what a bar
  // looks like.
  const hook = fs.readFileSync(path.join(REPO, "templates", "hooks", "orc-subagent-line.js"), "utf8");
  assert.match(hook, /require\("\.\/orc-statusline-render\.js"\)/, "it renders through the shared engine");
  for (const forbidden of ["STATUSLINE_COMPONENTS", "function barCells", "function renderVal", "glyphsets = {"])
    assert.ok(hook.indexOf(forbidden) === -1, "the second board grew its own " + forbidden);
  const cliSrc = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  assert.match(cliSrc, /const SL_BOARDS = \{/, "the boards are a table");
  assert.strictEqual(
    (cliSrc.match(/function slCompile\(/g) || []).length,
    1,
    "there is more than one compiler"
  );
});

test("subagent line: a component belongs to ONE board, and the other refuses it by name", () => {
  // Two catalogues would be two lists somebody has to keep in step. It is one
  // catalogue with a column.
  const { root } = freshInstall();
  try {
    const main = slj(root, ["components"]).json;
    const sub = slj(root, ["components", "--board", "subagent"]).json;
    assert.strictEqual(main.board, "status");
    assert.strictEqual(sub.board, "subagent");
    assert.strictEqual(sub.lines, 1, "a subagent row is one line by construction");
    assert.ok(sub.components.length >= 10, "the second board has a catalogue");
    const mainIds = new Set(main.components.map((c) => c.id));
    for (const c of sub.components)
      assert.ok(!mainIds.has(c.id), c.id + " is on both boards — a component belongs to one");

    // Placing one on the wrong board is refused BY NAME, with the board it
    // belongs to.
    slj(root, ["apply", "minimal"]);
    const r = slj(root, ["set", "1", "1", "task-tokens"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.json.errors.join(" "), /belongs to the subagent board/);
  } finally {
    rmrf(root);
  }
});

test("subagent line: each board has its own files, presets and config key", () => {
  const { root } = freshInstall();
  const orc = path.join(root, ".claude", "orc");
  try {
    slj(root, ["apply", "minimal"]);
    slj(root, ["apply", "agent-default", "--board", "subagent"]);
    for (const f of ["statusline-layout.json", "subagent-layout.json", "statusline-compiled.json", "subagent-compiled.json"])
      assert.ok(fs.existsSync(path.join(orc, f)), f + " was written");
    // Editing one board never touches the other.
    const before = fs.readFileSync(path.join(orc, "statusline-compiled.json"), "utf8");
    slj(root, ["apply", "agent-tier", "--board", "subagent"]);
    assert.strictEqual(fs.readFileSync(path.join(orc, "statusline-compiled.json"), "utf8"), before);

    // A preset from the other board is refused by name, with the flag that
    // would have worked — applying it would fill this board with components it
    // cannot hold.
    const r = slj(root, ["apply", "agent-default"]);
    assert.strictEqual(r.status, 2);
    assert.strictEqual(r.json.reason, "wrong-board");
    assert.match(r.json.hint, /--board subagent/);
  } finally {
    rmrf(root);
  }
});

// ── the row ────────────────────────────────────────────────────────────────

test("subagent line: one JSON row per task, and an unrenderable task keeps the default row", () => {
  // Omitting an id keeps Claude Code's own row, which is a real answer. An
  // empty `content` HIDES the task, which is almost never what anybody meant.
  const { root, claudeDir } = freshInstall();
  try {
    slj(root, ["apply", "agent-default", "--board", "subagent"]);
    cli(["config", "set", "subagent_line_custom", "on", "--dir", root]);
    const r = runHook(claudeDir, "orc-subagent-line.js", { cwd: root, session_id: "s", tasks: tasks() });
    assert.strictEqual(r.status, 0);
    const rows = r.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.strictEqual(rows.length, 2, "one row per task: " + r.stdout);
    assert.deepStrictEqual(rows.map((x) => x.id), ["a1", "a2"]);
    assert.match(rows[0].content, /orc-executor-opus-5-low/);
    assert.match(rows[0].content, /84K/, "the token count is on the row");
    assert.ok(rows[0].content.indexOf("\n") === -1, "a row is ONE line — Claude Code renders one per task");
  } finally {
    rmrf(root);
  }
});

test("subagent line: with the board off it renders NOTHING and Claude Code's row stands", () => {
  const { root, claudeDir } = freshInstall();
  try {
    slj(root, ["apply", "agent-default", "--board", "subagent"]);
    const r = runHook(claudeDir, "orc-subagent-line.js", { cwd: root, session_id: "s", tasks: tasks() });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), "", "it printed a row with the board off");
  } finally {
    rmrf(root);
  }
});

test("subagent line: every gate rung falls back to the default row, and none throws", () => {
  const { root, claudeDir } = freshInstall();
  const orc = path.join(claudeDir, "orc");
  const payload = { cwd: root, session_id: "s", tasks: tasks() };
  try {
    slj(root, ["apply", "agent-default", "--board", "subagent"]);
    cli(["config", "set", "subagent_line_custom", "on", "--dir", root]);
    assert.ok(runHook(claudeDir, "orc-subagent-line.js", payload).stdout.trim(), "it renders when it can");

    // A lock from another version.
    const lp = path.join(orc, "subagent.lock.json");
    const lock = JSON.parse(fs.readFileSync(lp, "utf8"));
    fs.writeFileSync(lp, JSON.stringify(Object.assign({}, lock, { orc_version: "0.0.1" })));
    let r = runHook(claudeDir, "orc-subagent-line.js", payload);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), "", "a stale lock must fall back to the default row");

    // A binding this build does not have.
    fs.writeFileSync(lp, JSON.stringify(Object.assign({}, lock, { bindings: ["not.a.binding"] })));
    r = runHook(claudeDir, "orc-subagent-line.js", payload);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), "");

    // An unparseable compiled file.
    fs.writeFileSync(lp, JSON.stringify(lock));
    fs.writeFileSync(path.join(orc, "subagent-compiled.json"), "{ not json");
    r = runHook(claudeDir, "orc-subagent-line.js", payload);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), "");

    // And a payload with no tasks at all.
    r = runHook(claudeDir, "orc-subagent-line.js", { cwd: root, session_id: "s" });
    assert.strictEqual(r.status, 0);
  } finally {
    rmrf(root);
  }
});

// ── the measurement ────────────────────────────────────────────────────────

test("subagent line: the token record is written EVEN WITH THE BOARD OFF", () => {
  // It is not part of the feature. It is a measurement Claude Code hands over
  // either way, and throwing it out because a DISPLAY setting is off would be
  // the wrong trade by a wide margin.
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-subagent-line.js", { cwd: root, session_id: "s", tasks: tasks() });
    const j = JSON.parse(fs.readFileSync(path.join(claudeDir, "orc", "subagent-usage.json"), "utf8"));
    assert.strictEqual(j.session_id, "s");
    assert.strictEqual(j.tasks.a1.tokens, 84000);
    assert.strictEqual(j.tasks.a1.model, "claude-opus-5", "the OBSERVED model, not one derived from the agent name");
    assert.strictEqual(j.tasks.a1.effort, "low");
    assert.strictEqual(j.tasks.a1.floor, true, "the floor flag is STORED, not inferred later");
  } finally {
    rmrf(root);
  }
});

test("subagent line: a count can only go UP, so a lower reading is a stale one", () => {
  const { root, claudeDir } = freshInstall();
  const led = () => JSON.parse(fs.readFileSync(path.join(claudeDir, "orc", "subagent-usage.json"), "utf8"));
  try {
    runHook(claudeDir, "orc-subagent-line.js", { cwd: root, session_id: "s", tasks: tasks() });
    assert.strictEqual(led().tasks.a1.tokens, 84000);
    // A render arriving with a smaller number is a stale reading, not a refund.
    runHook(claudeDir, "orc-subagent-line.js", { cwd: root, session_id: "s", tasks: tasks({ tokenCount: 12000 }) });
    assert.strictEqual(led().tasks.a1.tokens, 84000, "a lower reading overwrote a higher one");
    runHook(claudeDir, "orc-subagent-line.js", { cwd: root, session_id: "s", tasks: tasks({ tokenCount: 99000 }) });
    assert.strictEqual(led().tasks.a1.tokens, 99000, "a higher reading did not land");
    // A re-render UPDATES rather than appends.
    assert.strictEqual(Object.keys(led().tasks).length, 2);
  } finally {
    rmrf(root);
  }
});

test("subagent line: `orc usage report` reports a FLOOR, and says so", () => {
  // The number v1.2.0 concluded could not be measured. The transcript half of
  // that finding stands; this is the agent panel's, and it is a floor.
  const { root, claudeDir } = freshInstall();
  try {
    // No record yet: `unavailable` becomes `not-seen` once the hook is wired,
    // because "no rows" and "no agents ran" are different facts.
    let j = JSON.parse(cli(["usage", "report", "--dir", root, "--json"]).stdout);
    assert.strictEqual(j.tokens_floor, true, "the hook ships wired, so the note is the floor one");
    assert.match(j.tokens_note, /FLOOR, not a total/);
    assert.match(j.tokens_note, /never 0/);
    assert.strictEqual(j.tokens_observed_tasks, 0);

    runHook(claudeDir, "orc-subagent-line.js", { cwd: root, session_id: "s", tasks: tasks() });
    j = JSON.parse(cli(["usage", "report", "--dir", root, "--json"]).stdout);
    assert.strictEqual(j.tokens_observed_tasks, 2, "both tasks were recorded");
  } finally {
    rmrf(root);
  }
});

test("subagent line: a record from ANOTHER session is not this session's spend", () => {
  // Session-scoped, like every other bridge in these hooks.
  const { root, claudeDir } = freshInstall();
  try {
    runHook(claudeDir, "orc-subagent-line.js", { cwd: root, session_id: "old", tasks: tasks() });
    const sfile = path.join(claudeDir, "orc", "usage-session.json");
    fs.mkdirSync(path.dirname(sfile), { recursive: true });
    fs.writeFileSync(sfile, JSON.stringify({ session_id: "new", started_at: Date.now() }));
    const j = JSON.parse(cli(["usage", "report", "--dir", root, "--json"]).stdout);
    assert.strictEqual(j.tokens_observed_tasks, 0, "another session's record was counted as this one's");
  } finally {
    rmrf(root);
  }
});

test("subagent line: `orc init` wires subagentStatusLine, and never clobbers one you have", () => {
  const { root, claudeDir } = freshInstall();
  try {
    const sp = path.join(claudeDir, "settings.json");
    let st = JSON.parse(fs.readFileSync(sp, "utf8"));
    assert.ok(st.subagentStatusLine, "it is wired on a fresh install");
    assert.match(st.subagentStatusLine.command, /orc-subagent-line\.js/);

    // A user's own is never replaced.
    st.subagentStatusLine = { type: "command", command: "mine.sh" };
    fs.writeFileSync(sp, JSON.stringify(st, null, 2));
    cli(["update", "--dir", root]);
    st = JSON.parse(fs.readFileSync(sp, "utf8"));
    assert.strictEqual(st.subagentStatusLine.command, "mine.sh", "it clobbered a setting the user owned");
  } finally {
    rmrf(root);
  }
});

test("subagent line: `subagent_line_custom` is an operating key of a hook", () => {
  // Same answer as `statusline_custom`: a hook has no lane and cannot resolve
  // config, so it reads the raw key off the file. An empty lanes[] is an
  // answer, not a to-do.
  const { root } = freshInstall();
  try {
    const j = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    const k = j.keys.find((x) => x.key === "subagent_line_custom");
    assert.ok(k, "the key is registered");
    assert.strictEqual(k.default, "off");
    assert.deepStrictEqual(k.lanes, []);
    const lint = fs.readFileSync(path.join(REPO, "bin", "verify-contracts.js"), "utf8");
    assert.match(lint, /"subagent_line_custom",/, "it is on the seed-empty allowlist");
  } finally {
    rmrf(root);
  }
});
