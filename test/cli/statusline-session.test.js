"use strict";
// @test-pool spawn  — shells the installed hook
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { rmrf, freshInstall, runHook } = require("../_helpers");

// The statusline's second line (v1.2.0) — what this SESSION has been doing:
// agents spawned, whether work can leave Claude, which lanes ran, how long.
// The dispatch count is the one that earns its place: v1.2.0 exists because a
// retry cloned a live agent three times over and nothing surfaced it.

// The scan is throttled in production; proving that by SLEEPING past the window
// makes every assertion below a wall-clock race on a loaded machine. The seam
// turns the throttle off instead, so these tests measure BEHAVIOUR and nothing
// else — and the last test below proves the throttle itself, also without
// sleeping, by setting the window so wide the cache must be used.
const NO_THROTTLE = { ORC_STATUSLINE_SCAN_MS: "0" };
const ALWAYS_THROTTLED = { ORC_STATUSLINE_SCAN_MS: "999999999" };

function payload(root, sessionId, fivePct) {
  return {
    session_id: sessionId,
    workspace: { project_dir: root },
    model: { id: "claude-opus-5", display_name: "Opus 5" },
    effort: { level: "high" },
    context_window: { used_percentage: 22 },
    rate_limits: {
      five_hour: { used_percentage: fivePct, resets_at: null },
      seven_day: { used_percentage: 30, resets_at: null },
    },
  };
}

// The trace hook's own stamp format: [DDMMYY HH:MM:SS.mmm].
function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    p(d.getDate()) + p(d.getMonth() + 1) + String(d.getFullYear()).slice(2) +
    " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + ".000"
  );
}
const spawnLine = (at, agent) => "[" + stamp(at) + "] hook     SPAWN " + agent + " :: task";

function lines(res) {
  return res.stdout.split("\n");
}

test("the second line reports agents, extra, lanes and duration", () => {
  const { root, claudeDir } = freshInstall();
  const logs = path.join(claudeDir, "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "extra_enabled: true\n");

  // Render once so the session ledger exists and started_at is set.
  const first = runHook(claudeDir, "orc-statusline.js", payload(root, "s1", 10), NO_THROTTLE);
  assert.equal(lines(first).length, 2, "the hook emits exactly two lines");
  assert.match(lines(first)[1], /agents 0/);
  assert.match(lines(first)[1], /orc-extra: on/);
  // An empty lane list is an ANSWER and keeps its slot.
  assert.match(lines(first)[1], /lanes: none yet/);

  // Now two lanes dispatch, plus one trace from BEFORE this session.
  const now = new Date();
  fs.writeFileSync(
    path.join(logs, "run-quick-fix-thing-040926-101010.txt"),
    [spawnLine(now, "orc-executor-opus-5-low"), spawnLine(now, "orc-executor-opus-5-low"), ""].join("\n")
  );
  fs.writeFileSync(
    path.join(logs, "run-mini-other-040926-110000.txt"),
    [spawnLine(now, "orc-executor-sonnet-4-6-med"), ""].join("\n")
  );
  fs.writeFileSync(
    path.join(logs, "run-wiki-old-010926-090000.txt"),
    ["[010926 09:00:00.000] hook     SPAWN orc-wiki-scanner-opus-4-8-high :: old", ""].join("\n")
  );

  const second = runHook(claudeDir, "orc-statusline.js", payload(root, "s1", 69), NO_THROTTLE);
  const l2 = lines(second)[1];
  assert.match(l2, /agents 3/, "spawns are counted across every lane this session ran");
  assert.match(l2, /lanes: /);
  assert.ok(/quick/.test(l2) && /mini/.test(l2), "both dispatching lanes are named");
  assert.ok(!/wiki/.test(l2), "a trace from before this session is not this session's spend");
  rmrf(root);
});

test("an agent still in flight is never hidden", () => {
  const { root, claudeDir } = freshInstall();
  const logs = path.join(claudeDir, "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  runHook(claudeDir, "orc-statusline.js", payload(root, "s2", 10), NO_THROTTLE);

  const trace = "run-quick-thing-040926-101010.txt";
  fs.writeFileSync(path.join(logs, trace), [spawnLine(new Date(), "orc-executor-opus-5-low"), ""].join("\n"));
  fs.writeFileSync(
    path.join(logs, trace + ".pending.json"),
    JSON.stringify([
      { agent: "orc-executor-opus-5-low", desc: "a", ts: Date.now() - 60000 },
      { agent: "orc-executor-opus-5-low", desc: "b", ts: Date.now() - 30000 },
    ])
  );

  const res = runHook(claudeDir, "orc-statusline.js", payload(root, "s2", 20), NO_THROTTLE);
  assert.match(lines(res)[1], /\(2 running\)/, "two live dispatches are shown, not summarised away");
  rmrf(root);
});

test("`sess +X%` shows how far the window moved, and only when it moved", () => {
  const { root, claudeDir } = freshInstall();
  const first = runHook(claudeDir, "orc-statusline.js", payload(root, "s3", 12));
  assert.ok(!/sess \+/.test(lines(first)[0]), "zero movement prints nothing");

  const later = runHook(claudeDir, "orc-statusline.js", payload(root, "s3", 71));
  assert.match(lines(later)[0], /sess \+59%/);

  // A window reset mid-session is not a refund: 12 -> 71 banked, then 4 -> 9.
  runHook(claudeDir, "orc-statusline.js", payload(root, "s3", 4));
  const after = runHook(claudeDir, "orc-statusline.js", payload(root, "s3", 9));
  assert.match(lines(after)[0], /sess \+64%/, "59 banked plus 5 since the reset");
  rmrf(root);
});

test("extra reads off when the config says so, and when there is no config", () => {
  const { root, claudeDir } = freshInstall();
  const off = runHook(claudeDir, "orc-statusline.js", payload(root, "s4", 10), NO_THROTTLE);
  assert.match(lines(off)[1], /orc-extra: off/, "no config takes the documented default");

  fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "extra_enabled: false\n");
  const explicit = runHook(claudeDir, "orc-statusline.js", payload(root, "s4", 11), NO_THROTTLE);
  assert.match(lines(explicit)[1], /orc-extra: off/);
  rmrf(root);
});

test("no rate_limits at all still yields a second line, never a broken one", () => {
  // Older Claude Code sends no usage headers. The session line must not depend
  // on them — an absent reading is absent, not a reason to drop the line.
  const { root, claudeDir } = freshInstall();
  const res = runHook(claudeDir, "orc-statusline.js", {
    session_id: "s5",
    workspace: { project_dir: root },
    model: { id: "claude-opus-5", display_name: "Opus 5" },
    effort: { level: "high" },
  });
  const out = lines(res);
  assert.equal(out.length, 2);
  assert.match(out[1], /agents 0 · orc-extra: off · lanes: none yet/);
  assert.ok(!/undefined/.test(res.stdout), "the statusline never prints undefined");
  rmrf(root);
});

test("the scan is throttled — a statusline re-renders on every keystroke", () => {
  // Proven by widening the window rather than by sleeping past it: with the
  // scan interval set beyond the test's lifetime, the second render MUST answer
  // from the cached ledger even though three new dispatches are on disk.
  const { root, claudeDir } = freshInstall();
  const logs = path.join(claudeDir, "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });

  const first = runHook(claudeDir, "orc-statusline.js", payload(root, "s6", 10), ALWAYS_THROTTLED);
  assert.match(lines(first)[1], /agents 0/);

  const now = new Date();
  fs.writeFileSync(
    path.join(logs, "run-quick-later-040926-101010.txt"),
    [
      spawnLine(now, "orc-executor-opus-5-low"),
      spawnLine(now, "orc-executor-opus-5-low"),
      spawnLine(now, "orc-executor-opus-5-low"),
      "",
    ].join("\n")
  );

  const cached = runHook(claudeDir, "orc-statusline.js", payload(root, "s6", 11), ALWAYS_THROTTLED);
  assert.match(lines(cached)[1], /agents 0/, "inside the window the cached answer is reused");

  // ...and the same disk, scanned, gives the real number. The throttle delays
  // the answer; it never changes it.
  const scanned = runHook(claudeDir, "orc-statusline.js", payload(root, "s6", 12), NO_THROTTLE);
  assert.match(lines(scanned)[1], /agents 3/);
  rmrf(root);
});
