"use strict";
// v0.42.0 quality-of-life surface: `orc resume`, `orc run list|show`,
// `orc stats`, `orc config profile|recommend`.
//
// These commands present RUN STATE and USAGE as fact to a user who has lost the
// original session, so their failure mode is a CONFIDENT WRONG ANSWER, not a
// crash — a stale pointer sends someone to resume a run that already shipped,
// and a miscounted lane makes a usage report quietly lie. Every case below pins
// a claim these commands must never make.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cli, rmrf, tmpdir, REPO } = require("./_helpers");

const RUN_REL = path.join(".claude", "orc", "run");
const LOG_REL = path.join(".claude", "orc", "logs");

function seedRun(root, slug, { resume, files } = {}) {
  const dir = path.join(root, RUN_REL, slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files || {})) fs.writeFileSync(path.join(dir, name), body);
  if (resume) fs.writeFileSync(path.join(dir, "RESUME.md"), resume);
  return dir;
}

function seedTrace(root, name, body) {
  const dir = path.join(root, LOG_REL);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
}

const RESUME_BODY = [
  "Continue ORC run `merchant-notifications`.",
  "",
  "Read .claude/orc/run/merchant-notifications/state-of-play.md,",
  "then .claude/orc/run/merchant-notifications/checkpoint.json.",
  "Resume from the checkpoint's phase and wave.",
  "",
  "Where it stands:  /orc · phase execution · wave 2 of 4 done",
  "Done:             T1, T2",
  "Next action:      dispatch wave 3",
  "",
].join("\n");

test("resume: nothing waiting is a real answer with exit 1, not an error", () => {
  const root = tmpdir();
  try {
    seedRun(root, "already-shipped", { files: { "state-of-play.md": "# done\n" } });
    const r = cli(["resume", "--dir", root]);
    assert.strictEqual(r.status, 1, "exit 1 = nothing waiting (same convention as pattern status)");
    assert.match(r.stdout, /No runs are waiting/);
  } finally {
    rmrf(root);
  }
});

test("resume: RESUME.md is what marks a run waiting — <n> and <slug> both reach it", () => {
  const root = tmpdir();
  try {
    seedRun(root, "already-shipped", { files: { "state-of-play.md": "# done\n" } });
    seedRun(root, "merchant-notifications", { resume: RESUME_BODY });

    // Non-TTY: the plain list, never a prompt that would hang a script or model.
    const list = cli(["resume", "--dir", root]);
    assert.strictEqual(list.status, 0, "exit 0 = at least one resume exists");
    assert.match(list.stdout, /1 run is waiting/);
    assert.match(list.stdout, /merchant-notifications/);
    assert.ok(!/already-shipped/.test(list.stdout), "a finished run is never listed as waiting");
    assert.match(list.stdout, /\/orc/, "lane comes from the `Where it stands:` line");
    assert.match(list.stdout, /wave 2 of 4/, "so does the wave — without opening checkpoint.json");

    for (const sel of ["1", "merchant-notifications"]) {
      const one = cli(["resume", sel, "--no-clipboard", "--dir", root]);
      assert.strictEqual(one.status, 0, `selector ${sel} exits 0`);
      assert.match(one.stdout, /Continue ORC run `merchant-notifications`/, `selector ${sel} prints the prompt`);
    }

    const bad = cli(["resume", "nope", "--dir", root]);
    assert.strictEqual(bad.status, 1, "an unknown selector fails loudly rather than picking something");
    assert.match(bad.stderr, /No waiting run matches/);
  } finally {
    rmrf(root);
  }
});

test("resume: --no-clipboard still prints the whole prompt (clipboard is never fatal)", () => {
  const root = tmpdir();
  try {
    seedRun(root, "merchant-notifications", { resume: RESUME_BODY });
    const r = cli(["resume", "1", "--no-clipboard", "--dir", root]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Next action:\s+dispatch wave 3/, "the full body, not a summary");
    assert.ok(!/Copied to clipboard/.test(r.stdout));
  } finally {
    rmrf(root);
  }
});

test("run list: status claims only what the disk proves", () => {
  const root = tmpdir();
  try {
    // Shipped straight through: no stop ever fired, so no state-of-play.md was
    // written. Labelling this "incomplete" was a real bug — this case pins it.
    seedRun(root, "shipped-no-pause", { files: { "planning-output.md": "tasks:\n" } });
    seedRun(root, "paused-run", { resume: RESUME_BODY });
    seedRun(root, "abandoned", {});

    const r = cli(["run", "list", "--dir", root]);
    assert.strictEqual(r.status, 0);
    const row = (slug) => r.stdout.split("\n").find((l) => l.includes(slug)) || "";
    assert.match(row("paused-run"), /waiting/);
    assert.match(row("shipped-no-pause"), /done/);
    assert.ok(!/incomplete/.test(row("shipped-no-pause")), "a run that never paused is not incomplete");
    assert.match(row("abandoned"), /empty/);
    assert.match(r.stdout, /waiting = a resume pointer is on disk/, "the labels are explained, not assumed");
  } finally {
    rmrf(root);
  }
});

test("run list: paginates by default, and --json carries no picker", () => {
  const root = tmpdir();
  try {
    for (let i = 0; i < 25; i++) seedRun(root, `run-${String(i).padStart(3, "0")}`, { files: { "x.md": "x" } });

    const page = cli(["run", "list", "--dir", root]);
    assert.match(page.stdout, /orc runs — 25 total/);
    assert.match(page.stdout, /showing 1-20 of 25/, "default page is 20");

    const all = cli(["run", "list", "--all", "--dir", root]);
    assert.match(all.stdout, /run-000/);
    assert.ok(!/showing 1-/.test(all.stdout), "--all has no pagination footer");

    const j = JSON.parse(cli(["run", "list", "--json", "--limit", "5", "--dir", root]).stdout);
    assert.strictEqual(j.total, 25);
    assert.strictEqual(j.shown, 5);
    assert.strictEqual(j.runs.length, 5);
    assert.ok("status" in j.runs[0] && "slug" in j.runs[0]);
  } finally {
    rmrf(root);
  }
});

test("run show: is the only path that opens checkpoint.json", () => {
  const root = tmpdir();
  try {
    seedRun(root, "one", {
      files: {
        "state-of-play.md": "# State of play\n\nPhase 3.\n",
        "checkpoint.json": JSON.stringify({ phase: "execution", wave: 2, updated_at: "x", trace_path: "t.txt" }),
      },
    });
    const show = cli(["run", "show", "one", "--dir", root]);
    assert.strictEqual(show.status, 0);
    assert.match(show.stdout, /State of play/);
    assert.match(show.stdout, /execution/, "the checkpoint phase appears here and nowhere else");

    // The listing path must not surface checkpoint-only fields.
    const list = cli(["run", "list", "--json", "--dir", root]);
    assert.ok(!/updated_at/.test(list.stdout), "a listing never reads checkpoint.json");

    assert.strictEqual(cli(["run", "show", "nope", "--dir", root]).status, 1);
  } finally {
    rmrf(root);
  }
});

const TRACE_WITH_STATS = [
  "[080826 12:00:00.000] hook     SPAWN orc-executor-opus-5-med :: T1",
  "[080826 12:05:00.000] orc      DISPATCH orc-executor-opus-5-med :: T1 expect=claude-opus-5/medium",
  "[080826 12:06:00.000] orc      STATS lane=orc slug=demo dispatches=17 waves=4 tasks=7 downgrades=2",
  "[080826 12:06:01.000] orc      FINISH :: shipped",
  "",
].join("\n");

const LEGACY_TRACE = [
  "[010726 09:00:00.000] orc      DISPATCH orc-planner-opus-5-med :: plan expect=claude-opus-5/medium",
  "[010726 09:10:00.000] orc      DISPATCH orc-reviewer-opus-5-med :: review expect=claude-opus-5/medium",
  "[010726 09:20:00.000] orc      VERIFY T1 actual=claude-sonnet-5/high ⛔ DOWNGRADE expected=claude-opus-5/medium",
  "[010726 09:30:00.000] orc      FINISH :: done",
  "",
].join("\n");

test("stats: lane and date come from the filename; the STATS line supplies depth", () => {
  const root = tmpdir();
  try {
    seedTrace(root, "run-orc-demo-080826-120000.txt", TRACE_WITH_STATS);
    seedTrace(root, "run-mini-other-080826-130000.txt", TRACE_WITH_STATS.replace("lane=orc", "lane=mini"));

    const r = cli(["stats", "--dir", root]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /ORC usage — 2 runs/);
    assert.match(r.stdout, /\/orc\s+1 run/);
    assert.match(r.stdout, /\/mini\s+1 run/);

    const j = JSON.parse(cli(["stats", "--json", "--dir", root]).stdout);
    assert.strictEqual(j.dispatches, 34, "17 per run, read from the STATS line only");
    assert.strictEqual(j.downgrades, 4);
    assert.strictEqual(j.unfinished, 0);
  } finally {
    rmrf(root);
  }
});

test("stats: a legacy trace with no STATS line still counts, via DISPATCH lines", () => {
  const root = tmpdir();
  try {
    seedTrace(root, "run-orc-legacy-010726-090000.txt", LEGACY_TRACE);
    const j = JSON.parse(cli(["stats", "--json", "--dir", root]).stdout);
    assert.strictEqual(j.runs, 1);
    assert.strictEqual(j.dispatches, 2, "counted from DISPATCH lines — never invented");
    assert.strictEqual(j.downgrades, 1);
    assert.ok(j.agents["orc-planner"] >= 1, "agent families still aggregate on a legacy trace");
  } finally {
    rmrf(root);
  }
});

test("stats: an unfinished run and a lane-less orphan are reported, never hidden", () => {
  const root = tmpdir();
  try {
    seedTrace(root, "run-orc-open-080826-140000.txt", "[080826 14:00:00.000] hook  SPAWN orc-planner-opus-5-med :: p\n");
    seedTrace(root, "run-080826-150000.txt", "[080826 15:00:00.000] hook  SPAWN orc-executor-opus-5-med :: t\n");

    const j = JSON.parse(cli(["stats", "--json", "--dir", root]).stdout);
    assert.strictEqual(j.unfinished, 2, "no FINISH line = unfinished, for both");
    assert.strictEqual(j.unknown_lane, 1);
    assert.strictEqual(j.lanes.unknown, 1, "a pre-v0.34.2 bootstrap is never counted as a real lane");

    const human = cli(["stats", "--dir", root]);
    assert.match(human.stdout, /\(no lane\)/, "an orphan is never printed as if it were a command");
    assert.match(human.stdout, /runs that never finished/);
    assert.match(human.stdout, /never write one/, "states the /orc-retro + /orc-explain blind spot");
  } finally {
    rmrf(root);
  }
});

test("stats: --since filters on the filename date, and an empty result is exit 1", () => {
  const root = tmpdir();
  try {
    seedTrace(root, "run-orc-old-010726-090000.txt", TRACE_WITH_STATS);
    seedTrace(root, "run-orc-new-080826-120000.txt", TRACE_WITH_STATS);

    const j = JSON.parse(cli(["stats", "--json", "--since", "2026-08-01", "--dir", root]).stdout);
    assert.strictEqual(j.runs, 1, "the July trace is filtered out before it is opened");

    const none = cli(["stats", "--since", "2027-01-01", "--dir", root]);
    assert.strictEqual(none.status, 1);
    assert.match(none.stdout, /No traces on or after 2027-01-01/);
  } finally {
    rmrf(root);
  }
});

test("config profile: writes only real validated keys, and applying twice is a no-op", () => {
  const root = tmpdir();
  try {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    const first = cli(["config", "profile", "paranoid", "--dir", root]);
    assert.strictEqual(first.status, 0);
    assert.match(first.stdout, /security_review/);

    const yaml = fs.readFileSync(path.join(root, ".claude", "orc.config.yaml"), "utf8");
    const written = [...yaml.matchAll(/^([a-z0-9_]+):/gm)].map((m) => m[1]);
    assert.ok(written.length, "the profile actually wrote something");
    const known = new Set(
      [...fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8").matchAll(/\{\s*key:\s*"([a-z0-9_]+)"/g)].map(
        (m) => m[1]
      )
    );
    for (const k of written)
      assert.ok(known.has(k), `a profile can only write an existing CONFIG_META key — "${k}" is not one`);

    assert.match(
      cli(["config", "profile", "paranoid", "--dir", root]).stdout,
      /Nothing changed/,
      "a profile is a shortcut, not a state machine"
    );

    const bad = cli(["config", "profile", "turbo", "--dir", root]);
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stdout, /solo-fast/, "an unknown name lists the real ones instead of guessing");
  } finally {
    rmrf(root);
  }
});

test("config recommend: read-only — it suggests, it never writes", () => {
  const root = tmpdir();
  try {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    const r = cli(["config", "recommend", "--dir", root]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /What I looked at/, "shows its evidence, not just a verdict");
    assert.match(r.stdout, /orc config profile /, "names the command that would apply it");
    assert.strictEqual(
      fs.existsSync(path.join(root, ".claude", "orc.config.yaml")),
      false,
      "recommend must never write the override file"
    );
  } finally {
    rmrf(root);
  }
});

test("every profile names a lane-safe, existing key set (no decorative keys)", () => {
  const cliText = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const block = cliText.match(/const CONFIG_PROFILES = \{([\s\S]*?)\n\};/);
  assert.ok(block, "found CONFIG_PROFILES");
  const known = new Set([...cliText.matchAll(/\{\s*key:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
  const used = [...block[1].matchAll(/^\s{6}([a-z0-9_]+):/gm)].map((m) => m[1]);
  assert.ok(used.length > 10, "profiles actually set keys");
  for (const k of used) assert.ok(known.has(k), `profile key "${k}" is a real CONFIG_META key`);
});
