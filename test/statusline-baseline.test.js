"use strict";
// @test-pool spawn  — runs the installed statusline hook as a child process
//
// THE BYTE-IDENTICAL BASELINE. (v1.3.0 W0; orc-hookui-build/orc-hookui-plan.md
// §8, §9 W0.)
//
// The CLI Hook Interface makes the status line user-composed. Its default is
// OFF, and "off" is specified as **byte-identical to what ships today** — that
// is a test, not an intention. This file is that test.
//
// It renders the hook across a set of named states and freezes the EXACT bytes
// it writes to stdout. W1 builds a component registry, W2 rewires the hook
// around a compiled layout, and W3–W7 keep moving underneath it. Every one of
// those is a refactor under user-visible output, and a refactor you cannot diff
// is a rewrite.
//
// A golden here failing is not automatically a bug. It is a change somebody has
// to look at and either accept — by regenerating the golden in the SAME commit
// that changes the behaviour, with `ORC_UPDATE_GOLDENS=1` — or revert. What it
// must never be is invisible.
//
// TWO THINGS ARE NORMALISED, AND ONLY TWO, each because it is not a property of
// the status line:
//   - the installed ORC version (`ORC v1.3.0` → `ORC v<VERSION>`), which moves
//     every release and is asserted separately in test/hooks.test.js;
//   - the 5-hour reset clock (`(1h)` etc.), which is derived from the wall
//     clock at render time.
// Everything else — every glyph, every separator, every space, the em dash, the
// three-space indent on line 2 — is frozen as written.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { REPO, tmpdir, rmrf, runHook, freshInstall } = require("./_helpers.js");

const GOLDEN = path.join(REPO, "test", "goldens", "statusline-baseline.txt");
const VERSION = require("../package.json").version;

// A reset an hour out, so the `(Nh)` shape is exercised rather than skipped.
const RESET = Math.floor(Date.now() / 1000) + 3600;

// The states. Each one is a fact about the line that a later wave could break
// without any other test noticing.
const STATES = [
  ["empty payload", {}],
  ["ready — opus 4.8 high", {
    model: { id: "claude-opus-4-8", display_name: "Opus 4.8" },
    effort: { level: "high" },
  }],
  ["boosted — opus 5 medium", {
    model: { id: "claude-opus-5", display_name: "Opus 5" },
    effort: { level: "medium" },
  }],
  ["degrade — sonnet 5 high, every reason named", {
    model: { id: "claude-sonnet-5", display_name: "Sonnet 5" },
    effort: { level: "high" },
  }],
  ["degrade — right model, sub-baseline effort", {
    model: { id: "claude-opus-4-8", display_name: "Opus 4.8" },
    effort: { level: "low" },
  }],
  ["context keeps its slot at 0%", {
    model: { id: "claude-opus-5", display_name: "Opus 5" },
    effort: { level: "high" },
    context_window: { used_percentage: 0 },
  }],
  ["both usage windows", {
    model: { id: "claude-opus-5", display_name: "Opus 5" },
    effort: { level: "high" },
    context_window: { used_percentage: 34 },
    rate_limits: {
      five_hour: { used_percentage: 42, resets_at: RESET },
      seven_day: { used_percentage: 7, resets_at: RESET },
    },
  }],
  ["a window at 90% folds into the verdict", {
    model: { id: "claude-opus-5", display_name: "Opus 5" },
    effort: { level: "high" },
    rate_limits: { five_hour: { used_percentage: 91, resets_at: RESET } },
  }],
  ["unknown model, unknown effort — never a guess", {
    model: {},
    effort: {},
    context_window: { used_percentage: 12 },
  }],
];

// Render every state in ONE fresh project, in order. The ledger persists across
// the renders on purpose: `ucs`, `Dur` and `MTok` are session-scoped, and a
// suite that wiped the ledger between renders would freeze a state no real user
// is ever in.
function renderAll() {
  const { root, claudeDir } = freshInstall();
  try {
    const out = [];
    for (const [name, payload] of STATES) {
      const r = runHook(claudeDir, "orc-statusline.js", {
        cwd: root,
        session_id: "baseline-session",
        ...payload,
      });
      assert.strictEqual(r.status, 0, name + ": the status line must never exit non-zero");
      out.push("### " + name + "\n" + normalise(r.stdout));
    }
    return out.join("\n\n") + "\n";
  } finally {
    rmrf(root);
  }
}

function normalise(s) {
  return s
    .split("ORC v" + VERSION)
    .join("ORC v<VERSION>")
    // `5h 42% (1h) ↔ wk 7%` — the parenthesised reset is a clock reading.
    .replace(/ \(\d+[hm]\)/g, " (<RESET>)");
}

test("statusline: the rendered bytes are frozen, state by state", () => {
  const got = renderAll();
  if (process.env.ORC_UPDATE_GOLDENS === "1") {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, got);
  }
  assert.ok(
    fs.existsSync(GOLDEN),
    "the baseline golden is missing — regenerate it with ORC_UPDATE_GOLDENS=1"
  );
  assert.strictEqual(
    got,
    fs.readFileSync(GOLDEN, "utf8"),
    "the status line's bytes moved. Accept it by regenerating the golden in the " +
      "SAME commit as the behaviour change, or revert."
  );
});

test("statusline: no state leaks a placeholder word", () => {
  const all = renderAll();
  for (const bad of ["undefined", "null", "NaN", "[object Object]"]) {
    assert.ok(all.indexOf(bad) === -1, "the status line printed `" + bad + "`");
  }
});

test("statusline: the wiki distance rides INSIDE the throttled scan", () => {
  // v1.3.0 W0. The wiki segment used to shell `git rev-list --count` on every
  // render — one child process PER KEYSTROKE in any repo with a wiki, which is
  // the exact hazard the 5-second throttle exists to prevent. The distance is
  // cached in the per-session ledger now, as a RAW commit count; the word
  // (`fresh` / `AGING` / `STALE`) is still computed on every read.
  const { root, claudeDir } = freshInstall();
  try {
    fs.mkdirSync(path.join(claudeDir, "orc"), { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "orc", "wiki-meta.json"),
      JSON.stringify({ scan_commit: "HEAD" })
    );
    const payload = { cwd: root, session_id: "s", model: { id: "claude-opus-5" }, effort: { level: "high" } };
    runHook(claudeDir, "orc-statusline.js", payload);
    const led = JSON.parse(
      fs.readFileSync(path.join(claudeDir, "orc", "usage-session.json"), "utf8")
    );
    assert.ok(led.wiki, "the ledger carries a wiki entry");
    assert.strictEqual(typeof led.wiki.scanned_at, "number", "…stamped, so the throttle can read it");
    // RAW numbers only, never a computed word — the rule every other bridge in
    // this hook already follows.
    for (const word of ["fresh", "AGING", "STALE"]) {
      assert.ok(
        JSON.stringify(led.wiki).indexOf(word) === -1,
        "the ledger stored the word `" + word + "`; it must store the count and compute the word"
      );
    }
  } finally {
    rmrf(root);
  }
});

test("statusline: one render writes the session ledger exactly once", () => {
  // Three blocks want the ledger — the rate-limit tracker, `ucs`, and the
  // line-2 scan. Before v1.3.0 W0 each opened the file itself and two of them
  // wrote it. It is memoised and flushed once now; this pins that, because the
  // regression is invisible in the output and costs a write per keystroke.
  const src = fs.readFileSync(
    path.join(REPO, "templates", "hooks", "orc-statusline.js"),
    "utf8"
  );
  const writes = src.split('"usage-session.json"').length - 1;
  assert.strictEqual(
    writes,
    1,
    "`usage-session.json` is named " + writes + " times; the ledger has ONE reader/writer (`ledger()`)"
  );
});
