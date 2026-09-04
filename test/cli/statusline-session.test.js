"use strict";
// @test-pool spawn  — shells the installed hook
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { rmrf, freshInstall, runHook } = require("../_helpers");

// The statusline's second line — what this SESSION has been doing: which phase
// is running, agents spawned, whether work can leave Claude, how long, what it
// cost, and where it is committing.
//
// The dispatch count is the one that earns its place: v1.2.0 exists because a
// retry cloned a live agent three times over and nothing surfaced it. v1.2.1
// put `status:` in front of it and replaced the `lanes:` list — the running
// lane is now the first word of `status:`, and `orc stats` / `orc run list`
// still hold the session's whole history.

// The scan is throttled in production; proving that by SLEEPING past the window
// makes every assertion below a wall-clock race on a loaded machine. The seam
// turns the throttle off instead, so these tests measure BEHAVIOUR and nothing
// else — and the last test below proves the throttle itself, also without
// sleeping, by setting the window so wide the cache must be used.
const NO_THROTTLE = { ORC_STATUSLINE_SCAN_MS: "0" };
const ALWAYS_THROTTLED = { ORC_STATUSLINE_SCAN_MS: "999999999" };
// Same reasoning for the ANIMATION: a frame picked off the wall clock cannot be
// asserted without freezing it first. `ORC_STATUSLINE_MOTION=0` removes the
// motion rather than slowing it, so the still frame is deterministic.
const NO_THROTTLE_STILL = { ORC_STATUSLINE_SCAN_MS: "0", ORC_STATUSLINE_MOTION: "0" };

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

test("the second line reports agents, extra, duration, tokens and branch", () => {
  const { root, claudeDir } = freshInstall();
  const logs = path.join(claudeDir, "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "extra_enabled: true\n");

  // Render once so the session ledger exists and started_at is set.
  const first = runHook(claudeDir, "orc-statusline.js", payload(root, "s1", 10), NO_THROTTLE);
  assert.equal(lines(first).length, 2, "the hook emits exactly two lines");
  assert.match(lines(first)[1], /agents 0/);
  assert.match(lines(first)[1], /orc-extra: on/);
  // With no run in flight there is no phase, and `status:` is the ONE segment
  // allowed to vanish: a phase the disk cannot prove is hidden, not guessed.
  assert.ok(!/status:/.test(lines(first)[1]), "no active run, no status segment");
  assert.match(lines(first)[1], /Dur \d+m/, "the duration is labelled");
  // MTok keeps its slot in every state. An em dash says NOT MEASURED; a `0`
  // would say the session was free, which is a different claim.
  assert.match(lines(first)[1], /MTok —/, "no transcript reads as an em dash, never 0");

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
  assert.ok(!/wiki/.test(l2), "a trace from before this session is not this session's spend");
  // The segments keep the order the request asked for.
  assert.match(
    l2,
    /agents 3 · orc-extra: on · Dur \d+m · MTok/,
    "agents, then extra, then duration, then tokens"
  );
  rmrf(root);
});

test("`status:` names the running lane and its phase, and hides when it cannot", () => {
  const { root, claudeDir } = freshInstall();
  const logs = path.join(claudeDir, "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  const render = (id, pct) =>
    lines(runHook(claudeDir, "orc-statusline.js", payload(root, id, pct), NO_THROTTLE_STILL))[1];

  const trace = "run-quick-fix-thing-040926-101010.txt";
  const now = new Date();
  const write = (body) => fs.writeFileSync(path.join(logs, trace), body.join("\n") + "\n");

  // Rung 3 — the hook-written PHASE-EDGE. This is the deterministic floor: it
  // needs no cooperation from the model at all.
  write(["[" + stamp(now) + "] hook     PHASE-EDGE execution :: first=orc-executor-opus-5-low"]);
  fs.writeFileSync(path.join(logs, ".current"), trace + "\n");
  assert.match(render("p1", 10), /status: quick · execution/, "a phase edge answers on its own");

  // Rung 2 — a narrated verb this lane's rail publishes REFINES the edge, but
  // only because it is later in the file. It is more specific (Q3 DO, not
  // `execution`) and it can never invent a phase the rail does not carry.
  write([
    "[" + stamp(now) + "] hook     PHASE-EDGE execution :: first=orc-executor-opus-5-low",
    "[" + stamp(now) + "] orc      FINISH :: entry 1 done",
  ]);
  assert.match(render("p2", 11), /status: quick · Q3 DO/, "a published verb sharpens the edge");

  // A trace nobody has written to for half an hour is not a run in progress,
  // whatever its last line says. A stale phase word gets believed.
  const old = new Date(Date.now() - 30 * 60000);
  write(["[" + stamp(old) + "] hook     PHASE-EDGE execution :: first=orc-executor-opus-5-low"]);
  assert.ok(!/status:/.test(render("p3", 12)), "a stale trace hides the segment");

  // And with no rail manifest there is no phase vocabulary at all.
  write(["[" + stamp(new Date()) + "] hook     PHASE-EDGE execution :: first=orc-executor-opus-5-low"]);
  assert.match(render("p4", 13), /status: quick/, "control: it renders with the manifest present");
  fs.rmSync(path.join(claudeDir, "hooks", "orc-lane-rails.json"), { force: true });
  assert.ok(!/status:/.test(render("p5", 14)), "no manifest, no status — never a guess");
  rmrf(root);
});

test("the phase glyph is one cell, has an ASCII twin, and can be frozen", () => {
  const { root, claudeDir } = freshInstall();
  const logs = path.join(claudeDir, "orc", "logs");
  fs.mkdirSync(logs, { recursive: true });
  const trace = "run-quick-fix-thing-040926-101010.txt";
  fs.writeFileSync(
    path.join(logs, trace),
    "[" + stamp(new Date()) + "] hook     PHASE-EDGE execution :: first=orc-executor-opus-5-low\n"
  );
  fs.writeFileSync(path.join(logs, ".current"), trace + "\n");

  const seg = (env, id) => {
    const l2 = lines(runHook(claudeDir, "orc-statusline.js", payload(root, id, 10), env))[1];
    return /^\s*(\S+) status:/.exec(l2);
  };

  const uni = seg(NO_THROTTLE_STILL, "g1");
  assert.ok(uni, "a glyph precedes the status segment");
  assert.equal([...uni[1]].length, 1, "exactly one cell — a wider glyph wraps the line");

  // no-motion REMOVES motion rather than slowing it, so the still frame is
  // stable across renders. A frozen frame of a cycling animation is a bug that
  // looks like a hang, which is why frame 0 is designed as a still frame.
  const a = seg(NO_THROTTLE_STILL, "g2")[1];
  const b = seg(NO_THROTTLE_STILL, "g3")[1];
  assert.equal(a, b, "with motion off the frame never changes");

  const ascii = seg(Object.assign({ ORC_STATUSLINE_ASCII: "1" }, NO_THROTTLE_STILL), "g4");
  assert.ok(/^[\x20-\x7e]$/.test(ascii[1]), "the ASCII twin is plain ASCII");
  rmrf(root);
});

test("MTok counts the MAIN session's tokens, incrementally, and never as 0", () => {
  const { root, claudeDir } = freshInstall();
  const tp = path.join(root, "transcript.jsonl");
  const usage = (o) => JSON.stringify({ message: { usage: o } }) + "\n";
  fs.writeFileSync(
    tp,
    usage({ input_tokens: 1000, cache_creation_input_tokens: 2000, cache_read_input_tokens: 300000, output_tokens: 500 })
  );
  const pl = (id) => Object.assign(payload(root, id, 10), { transcript_path: tp });

  const one = lines(runHook(claudeDir, "orc-statusline.js", pl("t1"), NO_THROTTLE))[1];
  assert.match(one, /MTok 304K/, "all four kinds are summed — any subset would be a weighting ORC invented");

  // Append: only the new bytes are read, and the running total grows.
  fs.appendFileSync(tp, usage({ input_tokens: 200, cache_read_input_tokens: 96000, output_tokens: 800 }));
  const two = lines(runHook(claudeDir, "orc-statusline.js", pl("t1"), NO_THROTTLE))[1];
  assert.match(two, /MTok 401K/, "the second read adds to the first, it does not replace it");
  const led = JSON.parse(fs.readFileSync(path.join(claudeDir, "orc", "usage-session.json"), "utf8"));
  assert.ok(led.tok.offset > 0, "the byte offset advanced — a transcript is never re-read whole");
  assert.equal(led.tok.cache_read, 396000, "all four kinds are kept apart in the ledger");

  // A transcript that is not there is NOT measured. It is not zero.
  const missing = lines(
    runHook(claudeDir, "orc-statusline.js", Object.assign(payload(root, "t2", 10), {
      transcript_path: path.join(root, "gone.jsonl"),
    }), NO_THROTTLE)
  )[1];
  assert.match(missing, /MTok —/, "unmeasured is an em dash; 0 would say the session was free");
  rmrf(root);
});

test("the branch comes off .git/HEAD, with no subprocess, and is absent outside a repo", () => {
  const { root, claudeDir } = freshInstall();
  const bare = lines(runHook(claudeDir, "orc-statusline.js", payload(root, "b1", 10), NO_THROTTLE))[1];
  assert.ok(!/ · main/.test(bare), "no .git, no branch segment — absent, not empty");

  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  fs.writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/feature/x\n");
  const named = lines(runHook(claudeDir, "orc-statusline.js", payload(root, "b2", 10), NO_THROTTLE))[1];
  assert.match(named, /· feature\/x$/, "the branch closes the line");

  // Detached HEAD is a short sha, marked so it cannot be read as a branch name.
  fs.writeFileSync(path.join(root, ".git", "HEAD"), "a".repeat(40) + "\n");
  const detached = lines(runHook(claudeDir, "orc-statusline.js", payload(root, "b3", 10), NO_THROTTLE))[1];
  assert.match(detached, /· @aaaaaaa$/, "a detached HEAD reads as a sha, not a branch");

  // A worktree or submodule: `.git` is a POINTER FILE, not a directory.
  const real = path.join(root, "gitdir");
  fs.mkdirSync(real, { recursive: true });
  fs.writeFileSync(path.join(real, "HEAD"), "ref: refs/heads/wt-branch\n");
  fs.rmSync(path.join(root, ".git"), { recursive: true, force: true });
  fs.writeFileSync(path.join(root, ".git"), "gitdir: " + real + "\n");
  const wt = lines(runHook(claudeDir, "orc-statusline.js", payload(root, "b4", 10), NO_THROTTLE))[1];
  assert.match(wt, /· wt-branch$/, "a .git pointer file resolves");
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

test("`ucs` shows how far the window moved this session, and keeps its slot at 0", () => {
  const { root, claudeDir } = freshInstall();
  const first = runHook(claudeDir, "orc-statusline.js", payload(root, "s3", 12));
  // Zero KEEPS ITS SLOT (v1.2.1): "nothing consumed yet" and "this build has no
  // ucs segment" are different facts and must not look the same.
  assert.match(lines(first)[0], /ucs 0%/, "zero is an answer, not a gap");

  const later = runHook(claudeDir, "orc-statusline.js", payload(root, "s3", 71));
  assert.match(lines(later)[0], /ucs 59%/);

  // A window reset mid-session is not a refund: 12 -> 71 banked, then 4 -> 9.
  runHook(claudeDir, "orc-statusline.js", payload(root, "s3", 4));
  const after = runHook(claudeDir, "orc-statusline.js", payload(root, "s3", 9));
  assert.match(lines(after)[0], /ucs 64%/, "59 banked plus 5 since the reset");
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
  assert.match(out[1], /agents 0 · orc-extra: off · Dur \d+m · MTok/);
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
