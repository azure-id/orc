"use strict";
// v0.43.0 — `orc ui` and the `--json` surface it stands on.
//
// Two failure modes drive every case here.
//
// (1) The --json contract is what makes the UI possible AT ALL: the server
//     parses stdout, so a command that prints one stray banner line beside its
//     object breaks a panel — and it does so silently, because the human path
//     still looks perfect. Every flagged command is therefore checked for
//     EXACTLY ONE object and an UNCHANGED exit code (several of those codes are
//     already contracts: pattern status, wiki impact, pr stack status).
//
// (2) The server can WRITE config, so it is a write surface on a machine that
//     may be shared. Auth, the loopback Host guard and the method guard are not
//     nice-to-haves; a regression in any of them is the whole vulnerability.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { cli, rmrf, tmpdir, freshInstall, REPO } = require("./_helpers");

const CLI = path.join(REPO, "bin", "cli.js");
const LOCK_REL = path.join(".claude", "orc", "ui.lock");

// ── the --json contract ─────────────────────────────────────────────────────

// Every command the help text advertises as --json-capable. `exit` is the code
// the HUMAN path uses in the seeded state, so a mismatch means --json changed
// semantics rather than rendering.
const JSON_COMMANDS = [
  { argv: ["where"], exit: 0 },
  { argv: ["doctor"], exit: 0 },
  { argv: ["config", "list"], exit: 0 },
  { argv: ["config", "profile"], exit: 0 },
  { argv: ["config", "recommend"], exit: 0 },
  { argv: ["wiki", "status"], exit: 0 },
  { argv: ["wiki", "impact"], exit: 1 }, // no wiki → "cannot compute"
  { argv: ["pattern", "status"], exit: 1 }, // empty cache IS the absent state
  { argv: ["gotcha", "list"], exit: 1 }, // none recorded
  { argv: ["crosslink", "list"], exit: 0 },
  { argv: ["diy", "show"], exit: 0 },
  { argv: ["diy", "status"], exit: 1 }, // UNCONFIGURED
  { argv: ["run", "list"], exit: 0 },
  { argv: ["stats"], exit: 1 }, // no traces
  { argv: ["pr", "stack", "status"], exit: 1 }, // no plan
  { argv: ["mock", "list"], exit: 0 },
];

test("--json prints exactly one object and never changes the exit code", () => {
  const { root } = freshInstall();
  try {
    for (const c of JSON_COMMANDS) {
      const human = cli([...c.argv, "--dir", root]);
      const j = cli([...c.argv, "--json", "--dir", root]);
      assert.strictEqual(
        j.status,
        human.status,
        `${c.argv.join(" ")}: --json changed the exit code (${human.status} → ${j.status})`
      );
      assert.strictEqual(j.status, c.exit, `${c.argv.join(" ")}: expected exit ${c.exit}, got ${j.status}`);
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(j.stdout);
      }, `${c.argv.join(" ")}: stdout is not a single JSON value — got ${JSON.stringify(j.stdout.slice(0, 160))}`);
      assert.ok(parsed && typeof parsed === "object" && !Array.isArray(parsed), `${c.argv.join(" ")}: not an object`);
      // "one object, nothing else" — a trailing banner would still parse if we
      // only checked the head, so the whole stream must round-trip.
      assert.strictEqual(
        j.stdout.trim(),
        JSON.stringify(parsed, null, 2).trim(),
        `${c.argv.join(" ")}: stdout carries more than the object`
      );
    }
  } finally {
    rmrf(root);
  }
});

// The risk the plan names outright: a new CONFIG_META key silently missing from
// the UI. The panel renders from this payload, so a key that appears here
// appears there automatically — and this test is what keeps that true.
test("config list --json exposes EVERY CONFIG_META key, with a control shape", () => {
  const { root } = freshInstall();
  try {
    const src = fs.readFileSync(CLI, "utf8");
    const block = src.slice(src.indexOf("const CONFIG_META = ["), src.indexOf("const metaFor ="));
    const declared = [...block.matchAll(/\{ key: "([a-z0-9_]+)"/g)].map((m) => m[1]);
    assert.ok(declared.length > 20, "sanity: found the CONFIG_META table");

    const out = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    const shown = out.keys.map((k) => k.key);
    for (const key of declared) assert.ok(shown.includes(key), `config list --json is missing ${key}`);
    assert.deepStrictEqual(shown.slice().sort(), declared.slice().sort(), "extra or missing keys in the JSON listing");

    for (const k of out.keys) {
      assert.ok(k.control && typeof k.control.kind === "string", `${k.key}: no control kind`);
      assert.ok(
        ["enum", "int", "range", "path", "repo", "subset", "text"].includes(k.control.kind),
        `${k.key}: unknown control kind ${k.control.kind}`
      );
      assert.ok("is_shadowed" in k && "shadow_reason" in k, `${k.key}: no shadow fields`);
    }
  } finally {
    rmrf(root);
  }
});

// Shadowing is the feature (plan §6.2): the CLI already announces it in prose,
// and the JSON must carry the SAME rule as data or the lock icon lies.
test("config list --json marks fable5_* and rubric_bands_override shadowed by opus5_only", () => {
  const { root, claudeDir } = freshInstall();
  try {
    fs.writeFileSync(
      path.join(claudeDir, "orc.config.yaml"),
      "opus5_only: true\nfable5_enabled: true\nrubric_bands_override: [[0,100,'orc-executor-opus-5-high']]\n"
    );
    const on = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    for (const k of on.keys.filter((x) => x.tier === "fable5"))
      assert.ok(k.is_shadowed && /opus5_only/.test(k.shadow_reason), `${k.key} should be shadowed`);
    const hand = on.hand_edited.find((h) => h.key === "rubric_bands_override");
    assert.ok(hand && hand.is_shadowed, "rubric_bands_override should be shadowed");
    // Registry-less by design — the UI must never offer to write it.
    assert.strictEqual(hand.editable, false, "rubric_bands_override must be reported read-only");
    assert.strictEqual(on.score_table.active, "opus5_only", "the 3-band ladder should resolve");

    fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "fable5_enabled: true\n");
    const off = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    assert.ok(
      off.keys.filter((x) => x.tier === "fable5").every((k) => !k.is_shadowed),
      "nothing is shadowed once opus5_only is off"
    );
    assert.strictEqual(off.score_table.active, "default");
  } finally {
    rmrf(root);
  }
});

// A retired name still on disk is resolved away by readOverride, so without
// this the file says one thing and the listing says another.
test("config list --json surfaces a legacy key rather than hiding it", () => {
  const { root, claudeDir } = freshInstall();
  try {
    fs.writeFileSync(path.join(claudeDir, "orc.config.yaml"), "opus5_executor_only: true\n");
    const out = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    const legacy = out.legacy_keys.find((l) => l.key === "opus5_executor_only");
    assert.ok(legacy, "the retired name should be reported");
    assert.strictEqual(legacy.renamed_to, "opus5_only");
  } finally {
    rmrf(root);
  }
});

// The ladder is mirrored in five places already; the UI reads the CLI's own
// table so it adds no sixth copy. This pins that it really is the same table.
test("config list --json's score table is DIY_SCORE_TABLE, not a copy", () => {
  const { root } = freshInstall();
  try {
    const src = fs.readFileSync(CLI, "utf8");
    const block = src.slice(src.indexOf("const DIY_SCORE_TABLE = ["), src.indexOf("function diyScoreTable"));
    const rows = [...block.matchAll(/\[(\d+), (\d+), "([a-z0-9-]+)"\]/g)].map((m) => [Number(m[1]), Number(m[2]), m[3]]);
    const out = JSON.parse(cli(["config", "list", "--json", "--dir", root]).stdout);
    assert.strictEqual(out.score_table.default.length, rows.length);
    out.score_table.default.forEach((r, i) => {
      assert.strictEqual(r.from, rows[i][0]);
      assert.strictEqual(r.agent, rows[i][2]);
    });
  } finally {
    rmrf(root);
  }
});

// ── orc mock ────────────────────────────────────────────────────────────────

test("mock list: an empty mock-examples/ is a normal answer, not an error", () => {
  const { root } = freshInstall();
  try {
    const r = cli(["mock", "list", "--dir", root]);
    assert.strictEqual(r.status, 0, "no mock examples must not be an error state");
    assert.match(r.stdout, /Nothing is wrong/, "an empty list must not imply something is missing");
    const j = JSON.parse(cli(["mock", "list", "--json", "--dir", root]).stdout);
    assert.strictEqual(j.total, 0);
    assert.deepStrictEqual(j.mocks, []);
  } finally {
    rmrf(root);
  }
});

test("mock show: reads EXAMPLE.md and the tree; a missing slug exits 1", () => {
  const { root } = freshInstall();
  try {
    const dir = path.join(root, "mock-examples", "merchant-notifications");
    fs.mkdirSync(path.join(dir, "mocks"), { recursive: true });
    fs.writeFileSync(path.join(dir, "EXAMPLE.md"), "# Mocked example\n\nRun it with `node run.js`.\n");
    fs.writeFileSync(path.join(dir, "run.js"), "console.log('hi')\n");
    fs.writeFileSync(path.join(dir, "mocks", "gateway.js"), "module.exports = {}\n");

    const list = JSON.parse(cli(["mock", "list", "--json", "--dir", root]).stdout);
    assert.strictEqual(list.total, 1);
    assert.strictEqual(list.mocks[0].slug, "merchant-notifications");
    assert.strictEqual(list.mocks[0].has_readme, true);

    const show = JSON.parse(cli(["mock", "show", "merchant-notifications", "--json", "--dir", root]).stdout);
    assert.strictEqual(show.found, true);
    assert.match(show.readme, /Mocked example/);
    assert.deepStrictEqual(
      show.files.map((f) => f.path).sort(),
      ["EXAMPLE.md", "mocks/gateway.js", "run.js"]
    );

    const missing = cli(["mock", "show", "nope", "--json", "--dir", root]);
    assert.strictEqual(missing.status, 1);
    assert.strictEqual(JSON.parse(missing.stdout).found, false);
  } finally {
    rmrf(root);
  }
});

test("run show --json carries the resume text, the checkpoint and the trace tail", () => {
  const { root } = freshInstall();
  try {
    const runDir = path.join(root, ".claude", "orc", "run", "merchant-notifications");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "RESUME.md"),
      "Continue the run.\n\nWhere it stands:  /orc · phase execution · wave 2 of 4 done\n"
    );
    const traceRel = path.join(".claude", "orc", "logs", "run-orc-merchant-notifications-080826-094501.txt");
    fs.mkdirSync(path.join(root, path.dirname(traceRel)), { recursive: true });
    fs.writeFileSync(path.join(root, traceRel), "PHASE-EDGE execution\nDISPATCH orc-executor-opus-5-high\n");
    fs.writeFileSync(
      path.join(runDir, "checkpoint.json"),
      JSON.stringify({ phase: "execution", wave: 2, trace_path: traceRel.split(path.sep).join("/") })
    );

    const j = JSON.parse(cli(["run", "show", "merchant-notifications", "--json", "--dir", root]).stdout);
    assert.strictEqual(j.status, "waiting", "RESUME.md existing IS the unfinished flag");
    assert.deepStrictEqual(j.stands, { lane: "/orc", phase: "execution", wave: "wave 2 of 4 done" });
    assert.match(j.resume, /Continue the run/);
    assert.strictEqual(j.checkpoint.wave, 2);
    assert.match(j.trace, /DISPATCH orc-executor-opus-5-high/, "the trace tail should resolve from trace_path");
  } finally {
    rmrf(root);
  }
});

// ── the server ──────────────────────────────────────────────────────────────

// Start `orc ui` and wait for its lock file, which is written only after a
// successful bind — so this never races the listen.
function startServer(root, extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, "ui", "--dir", root, "--no-open", ...(extraArgs || [])], {
      env: { ...process.env, ORC_NO_UPDATE_CHECK: "1", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", () => {});
    const started = Date.now();
    const poll = setInterval(() => {
      let lock = null;
      try {
        lock = JSON.parse(fs.readFileSync(path.join(root, LOCK_REL), "utf8"));
      } catch (_) {}
      if (lock && lock.port) {
        clearInterval(poll);
        resolve({ child, lock });
        return;
      }
      if (Date.now() - started > 20000) {
        clearInterval(poll);
        try {
          child.kill();
        } catch (_) {}
        reject(new Error("server never wrote its lock: " + err));
      }
    }, 120);
  });
}

function request(port, pathname, { token, method = "GET", host, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: Object.assign(
          {},
          token ? { "x-orc-token": token } : {},
          host ? { host } : {},
          body ? { "content-type": "application/json" } : {}
        ),
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, raw }));
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("server: rejects a missing/bad token, a non-loopback Host, and a bad method", async () => {
  const { root } = freshInstall();
  let srv;
  try {
    srv = await startServer(root);
    const { port, token } = srv.lock;

    assert.strictEqual((await request(port, "/api/config")).status, 401, "no token must be rejected");
    assert.strictEqual((await request(port, "/api/config", { token: "0".repeat(64) })).status, 401, "a wrong token must be rejected");
    assert.strictEqual((await request(port, "/", {})).status, 401, "even the page needs the token");

    // DNS-rebinding guard: the Host a rebound request carries is never a
    // loopback literal, and it is refused before any routing happens.
    assert.strictEqual(
      (await request(port, "/api/config", { token, host: "evil.example" })).status,
      403,
      "a non-loopback Host must be refused"
    );

    // Mutations are POST-only, so a GET can never reach a write path.
    assert.strictEqual((await request(port, "/api/config/set?t=" + token)).status, 404, "a write route is not a GET route");
    assert.strictEqual(
      (await request(port, "/api/config", { token, method: "PUT" })).status,
      405,
      "only GET and POST are routed at all"
    );

    const ok = await request(port, "/api/config", { token });
    assert.strictEqual(ok.status, 200);
    assert.ok(JSON.parse(ok.raw).data.keys.length > 20, "a token'd read returns the real config");

    // No CORS headers at all — a cross-origin page must not read a byte.
    const raw = await new Promise((res) =>
      http.get({ host: "127.0.0.1", port, path: "/api/config?t=" + token }, (r) => {
        r.resume();
        res(r.headers);
      })
    );
    assert.ok(!Object.keys(raw).some((h) => h.startsWith("access-control-")), "no CORS headers may be sent");
  } finally {
    if (srv) srv.child.kill();
    rmrf(root);
  }
});

// The auth test above proves an UNTOKENED asset is refused. That is only half
// the contract, and the half that shipped broken: the shell references app.css
// and app.js, a <link>/<script> sends no token of its own, and so the browser
// got 401 on BOTH while the page itself was a clean 200. The result renders as
// unstyled, scriptless markup — every panel dead, every button inert — and no
// existing case saw it, because each one fetched assets with a token the real
// browser never has. So follow the reference chain the browser actually walks:
// load the page, then fetch every URL it points at EXACTLY as written.
test("server: every asset the shell references loads as the browser requests it", async () => {
  const { root } = freshInstall();
  let srv;
  try {
    srv = await startServer(root);
    const { port, token } = srv.lock;

    const page = await request(port, "/?t=" + token);
    assert.strictEqual(page.status, 200, "the shell itself must load");

    const refs = [...page.raw.matchAll(/(?:href|src)="((?!https?:|\/\/|#|data:)[^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.length >= 2, "the shell must reference its stylesheet and its script");
    assert.ok(
      refs.some((r) => r.startsWith("app.css")) && refs.some((r) => r.startsWith("app.js")),
      "app.css and app.js must both be referenced"
    );

    for (const ref of refs) {
      const res = await request(port, "/" + ref.replace(/^\.?\//, ""));
      assert.strictEqual(res.status, 200, `${ref} must load with no extra credential — the browser has none to add`);
      assert.ok(res.raw.length > 0, `${ref} must not be empty`);
    }
  } finally {
    if (srv) srv.child.kill();
    rmrf(root);
  }
});

// v0.43.2 — spacing belongs to the CONTAINER, not to adjacent-sibling pairs.
//
// The panel bodies originally spaced their children with `.card + .card`, which
// matches only two cards in a row. The actual sequences these panels render are
// a stat `.grid` then a card, a `.tier` then a card, a `.run-list` then a card —
// none of which that selector sees, so those boxes touched with no gap at all.
// A pair-based rule has to be re-stated for every new combination of block
// types, which means it is one new panel away from being wrong again.
//
// So the contract is asserted from both ends: the fragile pair rules must stay
// gone, and every container that holds panel blocks must carry `stack`.
test("css: block spacing is owned by the container, not by sibling pairs", () => {
  // Comments are stripped first: this file DOCUMENTS the dead selectors by
  // name, and a test that cannot tell a rule from a comment about that rule
  // would fail on its own explanation.
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(css, /\.stack\s*\{[^}]*display:\s*flex/, "`.stack` must exist and be a flex container");
  assert.match(css, /\.stack\s*\{[^}]*gap:/, "`.stack` must space its children with gap");

  // Each of these spaced exactly one pair of block types and nothing else.
  // Re-adding one means a block type has an outer margin again, which double-
  // spaces inside a gapped container instead of fixing the collision.
  for (const dead of [".card + .card", ".action + .action", ".skeleton + .skeleton"]) {
    assert.ok(!css.includes(dead), `${dead} is pair-based spacing — the container owns the gap now`);
  }
  assert.ok(!/\.tier\s*\{[^}]*margin/.test(css), "`.tier` must not carry an outer margin");
  assert.ok(!/\.tabs\s*\{[^}]*margin/.test(css), "`.tabs` must not carry an outer margin");
});

test("js: every panel container carries the class that spaces its children", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");

  // These four names ARE the panel containers: `section`'s async slot, each
  // panel's `body`, and the two halves of the Runs split. A new panel written
  // as `const body = el("div")` renders its cards flush against each other and
  // looks like a CSS bug — it is this test, not the stylesheet, that catches it.
  const containers = [...js.matchAll(/const (body|slot|listSlot|detailSlot) = el\("div"([^)]*)\)/g)];
  assert.ok(containers.length >= 10, `expected the panel containers to be found, saw ${containers.length}`);

  for (const m of containers) {
    assert.match(
      m[2],
      /"stack/,
      `\`const ${m[1]} = el("div"${m[2]})\` must carry "stack" — without it its children collide`
    );
  }
});

// v0.43.5 — the panel asked whether an update existed with the check turned off.
//
// runCli forced ORC_NO_UPDATE_CHECK=1 on every subprocess to keep maybeNudge's
// stdout line out of the --json object. `version` has no nudge and the check IS
// its payload, so the blanket flag silenced the one command whose entire job is
// to answer the question the UI was asking.
test("ui: the update-check env var never gags the commands that check updates", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const i = api.indexOf("function runCli");
  const fn = api.slice(i, api.indexOf("\nfunction readCli"));

  assert.match(fn, /ORC_NO_UPDATE_CHECK/, "the guard must still exist for commands that nudge");
  // Conditional, never unconditional — that was the bug.
  assert.ok(
    !/env:\s*\{[^}]*ORC_NO_UPDATE_CHECK/.test(fn),
    "the flag must not be set inline for every command"
  );
  assert.match(fn, /argv\[0\] === "version"/, "`version` must be exempt");
  assert.match(fn, /argv\[0\] === "changelog"/, "`changelog` must be exempt");
});

test("changelog: the parser reads this repo's own README", () => {
  // The parser's contract is THIS file's format — the one CLAUDE.md mandates.
  // Testing it against the real README is what stops the two drifting.
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const start = cli.indexOf("function parseChangelog");
  const end = cli.indexOf("\nasync function changelog");
  assert.ok(start > 0 && end > start, "the parser must exist");
  const parseChangelog = new Function(cli.slice(start, end) + "\nreturn parseChangelog;")();

  const readme = fs.readFileSync(path.join(REPO, "README.md"), "utf8");
  const entries = parseChangelog(readme);
  assert.ok(entries.length > 20, `expected the real changelog to parse, got ${entries.length}`);
  assert.match(entries[0].version, /^\d+\.\d+\.\d+$/, "the newest entry must have a semver");
  assert.match(entries[0].date || "", /^\d{4}-\d{2}-\d{2}$/, "and a parsed date");
  assert.ok(entries[0].body.length > 0, "and a body to show in the modal");
  // Newest first is what makes "entries newer than mine" a prefix, not a scan.
  assert.ok(
    entries[0].version.localeCompare(entries[entries.length - 1].version, undefined, { numeric: true }) > 0,
    "entries must come out newest-first"
  );

  // Malformed input degrades to nothing, never to a wrong entry or a throw.
  assert.deepStrictEqual(parseChangelog(""), []);
  assert.deepStrictEqual(parseChangelog(null), []);
  assert.deepStrictEqual(parseChangelog("## Changelog\n\nno entries here\n"), []);
});

test("changelog: fetched content is never parsed as HTML", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const i = js.indexOf("async function showChangelog");
  const fn = js.slice(i, js.indexOf("\nfunction stripMd"));
  // This text comes off the network. It goes in as TEXT — never innerHTML, and
  // never through a markdown renderer that would emit tags.
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(fn), "changelog text must never be set as HTML");
  assert.match(js, /function stripMd/, "markdown markers are stripped, not rendered");
});

// v0.43.6 — the first spotlight rendered UNDERNEATH the sidebar.
//
// Two compounding causes, both invisible in the numbers alone: the wrapper was
// `position: fixed`, which ALWAYS creates a stacking context, trapping the ring
// and popover at the layer's z-index while the highlighted element (46) painted
// over them; and `.tour-target` forced `position: relative`, which unsticks the
// sticky rail — step one's target.
test("tour: the spotlight always stacks above what it points at", () => {
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (sel) => {
    const m = css.match(new RegExp("\\" + sel + "\\s*\\{([^}]*)\\}"));
    return m ? m[1] : "";
  };
  const z = (sel) => {
    const m = rule(sel).match(/z-index:\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };

  // The wrapper must generate no box — anything positioned here re-creates the
  // stacking context that caused the bug.
  assert.match(rule(".tour-layer"), /display:\s*contents/, "the tour wrapper must not create a stacking context");
  assert.ok(!/position:\s*(fixed|absolute|relative|sticky)/.test(rule(".tour-layer")), "the wrapper must not be positioned");

  const ring = z(".tour-ring");
  const targetZ = z(".tour-target");
  const pop = z(".tour-pop");
  const modal = z(".modal-host");
  assert.ok(ring && targetZ && pop && modal, "every tour layer needs an explicit z-index");
  assert.ok(ring < targetZ, "the highlighted element must sit above the scrim");
  assert.ok(targetZ < pop, "the popover must never be buried by what it points at");
  assert.ok(pop < modal, "a modal still wins over the tour");

  // Forcing position on the target is what unstuck the rail.
  assert.ok(!/position:/.test(rule(".tour-target")), ".tour-target must not force a position");
  assert.match(rule(".tour-target-rel"), /position:\s*relative/, "static targets get relative separately");

  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  assert.match(
    js,
    /getComputedStyle\(target\)\.position === "static"/,
    "the relative fallback must apply only to targets that are actually static"
  );
});

test("tour: it is per-project, skippable, and replayable", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");

  // Keyed by project root: a second repo gets its own tour.
  assert.match(js, /function tourSeen\(root\)/, "seen-state must be per project");
  assert.match(js, /\[root \|\| "\?"\]/, "the project root must be the key");
  // Never a one-way door.
  assert.match(js, /Replay the tour/, "a dismissed tour must be replayable");
  // Fixture mode teaches the panel with numbers that are not real.
  assert.match(js, /!metaInfo\.fixtures && !tourSeen/, "the tour must not run on fixtures");

  // The upgrade spotlight ends because you did the thing — so it has no Next
  // and no Skip, and it names the click that clears it.
  const i = js.indexOf("function startUpgradeSpotlight");
  const fn = js.slice(i, i + 700);
  assert.match(fn, /dismissOnClickSelector/, "the upgrade spotlight must clear on the real click");
  assert.ok(!/onNext|onSkip/.test(fn), "the upgrade spotlight must have no next/skip");
});

// v0.43.4 — the Experiment panel moves the "never spawns claude" boundary by
// exactly one step, and these are the rails that keep it there.
test("experiment: the launcher takes no command from the browser", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const i = api.indexOf("function launchClaude");
  assert.ok(i > 0, "the launcher must exist");
  const fn = api.slice(i, api.indexOf("\n}", i));

  // The cwd is the server's own project root, never anything from a request.
  assert.match(fn, /const cwd = ctx\.projectRoot/, "cwd must come from the server, never the client");
  assert.ok(!/body\.|req\./.test(fn), "no request data may reach the spawn");
  // `claude` is a literal in every branch — never interpolated from input.
  assert.ok(!/\$\{(?!JSON)/.test(fn.replace(/JSON\.stringify\(cwd\)/g, "")) || /claude/.test(fn), "the binary must be a literal");

  // The route resolves a lane id against a server-side catalog and 400s
  // otherwise, so an arbitrary string can never become a command.
  const route = api.slice(api.indexOf('"/api/experiment/launch"'));
  assert.match(route, /LANES\.find/, "the lane must be looked up in the server's catalog");
  assert.match(route, /unknown lane/, "an unrecognised lane must be refused");
});

test("experiment: the panel still renders no model output", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const i = js.indexOf("PANELS.experiment");
  const panel = js.slice(i, js.indexOf("PANELS.maintenance"));
  // The handoff is fire-and-forget. If this panel ever starts polling a job or
  // streaming output, the boundary has moved again and that must be deliberate.
  assert.ok(!/api\/job|refreshJob|EventSource|WebSocket/.test(panel), "the panel must not follow the session it launched");
});

test("crosslink: the UI writes only by shelling the CLI's own add", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");

  assert.match(api, /"\/api\/crosslink\/add":/, "the UI needs a write route");
  const build = api.slice(api.indexOf('"/api/crosslink/add":'), api.indexOf('"/api/crosslink/add":') + 600);
  assert.match(build, /"crosslink",\s*"add"/, "it must shell `orc crosslink add`");
  // The panel must never learn to write the YAML itself — that config has one
  // writer by contract, and a second one is the drift the whole design avoids.
  assert.ok(!/orc-crosslink\.config\.yaml/.test(api), "the API must never touch the crosslink config directly");

  // The non-interactive add must reject exactly what the prompt rejects.
  const add = cli.slice(cli.indexOf("function crosslinkAdd"));
  for (const guard of ["invalid slug", "is taken", "at least one kind", "--via must be one of", "is not this repo"]) {
    assert.ok(add.includes(guard), `crosslink add must guard: ${guard}`);
  }
});

// v0.43.4 — a finding must name a command that actually clears it.
//
// `global-retired-agents` told users to run `orc update --global`. That can
// never work: the names it reports were retired BEFORE the manifest now on disk
// was written, so no manifest claims them, and the auto-prune only deletes what
// a previous manifest proves ORC owned. The candidate sweep that does catch
// them is gated on `--prune`. So the finding reappeared after every "fix",
// which reads as a broken tool rather than a wrong instruction.
test("doctor: the retired-agent finding names a command that actually deletes them", () => {
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const i = cli.indexOf("global-retired-agents");
  assert.ok(i > 0, "the finding must exist");
  // The message and its structured fix_command, up to the end of the warn call.
  const block = cli.slice(i, i + 1400);

  assert.match(block, /orc update --global --prune/, "the advice must include --prune, or it never clears");
  assert.match(block, /fix_command/, "the working command must also be machine-readable for the UI");
  // A bare `orc update --global` recommendation is the exact regression: it is
  // only correct for version skew, never for an unowned orphan.
  assert.ok(
    !/`orc update --global`(?! --prune)/.test(block),
    "a bare `orc update --global` cannot clear an orphan no manifest claims"
  );
});

// v0.43.3 — the motion added here is only acceptable because it is all
// switchable off, and one of these rules is load-bearing rather than tidy.
test("css: prefers-reduced-motion disables motion, including the stagger delay", () => {
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8");
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(block, "the reduced-motion block must exist");

  for (const prop of ["animation-duration", "animation-iteration-count", "transition-duration"]) {
    assert.match(block, new RegExp(prop + ":[^;]*!important"), `${prop} must be neutralised`);
  }
  // The staggered entrance fills `backwards`. Without this reset the delay
  // survives, and a reduced-motion user watches blocks stay invisible for the
  // length of their delay — motion "off" would mean content missing.
  assert.match(block, /animation-delay:\s*0ms\s*!important/, "the stagger delay must be reset, or blocks never appear");
  assert.match(block, /transform:\s*none\s*!important/, "hover/press nudges must be removed, not merely sped up");
});

test("ui: the update check is surfaced, and never invented in the browser", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");

  // The comparison belongs to the CLI, which owns the semver rules and the
  // cache. The browser must never diff version strings itself.
  assert.match(api, /"\/api\/version":\s*\(\)\s*=>\s*\["version"\]/, "the version route must shell the real CLI");
  assert.ok(
    !/semver|localeCompare\(.*version|parseInt\(.*version/i.test(js),
    "the panel must not compare versions itself — `update_available` comes from the CLI"
  );
  assert.match(js, /update_available/, "the CLI's own verdict must be what the UI reads");

  // One check per page load, shared by the tile, the rail and the upgrade row.
  assert.match(js, /versionPromise\s*=\s*versionPromise\s*\|\|/, "the version check must be shared, not repeated per consumer");
});

test("server: a write shells the real CLI, so its validators still decide", async () => {
  const { root } = freshInstall();
  let srv;
  try {
    srv = await startServer(root);
    const { port, token } = srv.lock;

    const good = await request(port, "/api/config/set", {
      token,
      method: "POST",
      body: { key: "max_wave_tasks", value: "5" },
    });
    assert.strictEqual(JSON.parse(good.raw).ok, true);
    assert.match(fs.readFileSync(path.join(root, ".claude", "orc.config.yaml"), "utf8"), /max_wave_tasks: 5/);

    const bad = await request(port, "/api/config/set", {
      token,
      method: "POST",
      body: { key: "max_wave_tasks", value: "banana" },
    });
    const payload = JSON.parse(bad.raw);
    assert.strictEqual(payload.ok, false, "an invalid value must be reported as a failure");
    assert.match(payload.output, /must be an integer/, "the CLI's own message is what the user sees");
    assert.match(
      fs.readFileSync(path.join(root, ".claude", "orc.config.yaml"), "utf8"),
      /max_wave_tasks: 5/,
      "a rejected write must not have touched the file"
    );

    // Unknown keys are the CLI's to refuse too — the server never allow-lists.
    const unknown = await request(port, "/api/config/set", {
      token,
      method: "POST",
      body: { key: "not_a_key", value: "1" },
    });
    assert.strictEqual(JSON.parse(unknown.raw).ok, false);
  } finally {
    if (srv) srv.child.kill();
    rmrf(root);
  }
});

test("ui --stop: exit 0 when it stopped something, 1 when nothing was running", async () => {
  const { root } = freshInstall();
  let srv;
  try {
    srv = await startServer(root);
    assert.ok(fs.existsSync(path.join(root, LOCK_REL)), "a running server holds a lock");

    const stopped = cli(["ui", "--stop", "--dir", root]);
    assert.strictEqual(stopped.status, 0, "stopping a live server exits 0");
    assert.ok(!fs.existsSync(path.join(root, LOCK_REL)), "the lock is removed");

    const again = cli(["ui", "--stop", "--dir", root]);
    assert.strictEqual(again.status, 1, "nothing to stop exits 1 (the orc resume convention)");
  } finally {
    if (srv) try { srv.child.kill(); } catch (_) {}
    rmrf(root);
  }
});

test("ui: a lock whose pid is dead is stale — cleaned, never trusted", async () => {
  const { root, claudeDir } = freshInstall();
  let srv;
  try {
    fs.mkdirSync(path.join(claudeDir, "orc"), { recursive: true });
    // A pid that cannot exist; the guard must not hand out its port/token.
    fs.writeFileSync(
      path.join(root, LOCK_REL),
      JSON.stringify({ pid: 999999, port: 9999, token: "stale", started_ms: 1 })
    );
    srv = await startServer(root);
    assert.notStrictEqual(srv.lock.token, "stale", "a stale lock must never be reused");
    assert.ok(srv.lock.pid !== 999999, "the new lock records the live pid");
  } finally {
    if (srv) srv.child.kill();
    rmrf(root);
  }
});

test("ui: an explicit --port never auto-walks; a collision is an error", async () => {
  const { root } = freshInstall();
  const other = tmpdir();
  let srv;
  try {
    srv = await startServer(root, ["--port", "9931"]);
    assert.strictEqual(srv.lock.port, 9931);
    cli(["init", "--dir", other]);
    const clash = cli(["ui", "--port", "9931", "--no-open", "--dir", other]);
    assert.strictEqual(clash.status, 1, "an explicit port that is taken must fail");
    assert.match(clash.stderr, /will not move to another one/, "and say why it did not silently move");
  } finally {
    if (srv) srv.child.kill();
    rmrf(root);
    rmrf(other);
  }
});

test("ui is project-scoped: --global is refused, never reinterpreted", () => {
  const r = cli(["ui", "--global"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /project-scoped/);
  assert.match(r.stderr, /Config does not merge/, "the refusal must say WHY, since the trap is invisible");
});

// ── fixtures ────────────────────────────────────────────────────────────────

// A fixture that has drifted from the CLI is worse than no fixture: you design
// against a shape that does not exist. This pins the shared routes' key sets to
// what the live CLI actually emits.
test("fixtures match the live --json shapes for the routes they stand in for", () => {
  const { root } = freshInstall();
  try {
    const fixtures = require(path.join(REPO, "bin", "webui", "fixtures.js"));
    const pairs = [
      ["/api/where", ["where"]],
      ["/api/doctor", ["doctor"]],
      ["/api/config", ["config", "list"]],
      ["/api/wiki", ["wiki", "status"]],
      ["/api/patterns", ["pattern", "status"]],
      ["/api/gotchas", ["gotcha", "list"]],
      ["/api/stats", ["stats"]],
      ["/api/runs", ["run", "list"]],
      ["/api/diy", ["diy", "show"]],
      ["/api/crosslink", ["crosslink", "list"]],
      ["/api/mocks", ["mock", "list"]],
      ["/api/version", ["version"]],
    ];
    for (const [route, argv] of pairs) {
      const live = JSON.parse(cli([...argv, "--json", "--dir", root]).stdout);
      const canned = fixtures.get(route, {});
      assert.ok(canned, `no fixture for ${route}`);
      for (const key of Object.keys(live))
        assert.ok(key in canned, `fixture ${route} is missing the live key "${key}"`);
    }
  } finally {
    rmrf(root);
  }
});

// The whole point of fixture mode is designing states you cannot otherwise
// reach. If they all read healthy, the mode is decoration.
test("fixtures carry the UGLY states, not just the happy ones", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures.js"));
  assert.strictEqual(fixtures.get("/api/wiki", {}).tier, "STALE", "a STALE wiki must be designable");
  assert.strictEqual(
    fixtures.get("/api/version", {}).update_available,
    true,
    "an AVAILABLE update must be designable — 'up to date' is the state that needs no design"
  );
  assert.strictEqual(fixtures.get("/api/doctor", {}).ok, false, "an unhealthy doctor must be designable");
  assert.ok(fixtures.get("/api/doctor", {}).global_install.shadows, "the global-install banner must be designable");
  assert.ok(
    fixtures.get("/api/runs", {}).runs.some((r) => r.status === "waiting"),
    "a waiting run card must be designable"
  );
  assert.ok(
    fixtures.get("/api/config", {}).keys.some((k) => k.is_shadowed),
    "the shadowed-setting lock must be designable"
  );
  assert.strictEqual(fixtures.get("/api/diy", {}).state, "STALE", "a stale DIY gate must be designable");
  assert.ok(
    fixtures.get("/api/crosslink", {}).nodes.some((n) => n.provider.state === "missing"),
    "an unresolvable peer must be designable"
  );
});

// The panel never claims a mock example is missing when none was ever asked
// for, and it never offers to run one.
test("the ui never offers to run a mock example", () => {
  const app = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  assert.ok(!/Run mock|runMock|\/api\/mock\/run/.test(app), "there must be no run affordance for a mock example");
  assert.match(app, /Not generated for this run/, "a run with no mock example says so plainly");
});

// bin/ui.js is the TERMINAL styling kit; bin/webui/ is this. Two different
// things, one letter apart — each header names the other so the next reader
// does not have to find that out the hard way.
test("bin/ui.js and bin/webui/ each name the other", () => {
  assert.match(fs.readFileSync(path.join(REPO, "bin", "ui.js"), "utf8"), /webui/, "bin/ui.js should point at bin/webui/");
  assert.match(
    fs.readFileSync(path.join(REPO, "bin", "webui", "serve.js"), "utf8"),
    /bin\/ui\.js/,
    "bin/webui/serve.js should point at bin/ui.js"
  );
});
