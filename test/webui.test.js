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

// The shipped string tables. English is the FALLBACK table every other language
// falls back to, so it is loaded separately as well as in the pair.
const i18nPath = (code) => path.join(REPO, "bin", "webui", "i18n", code + ".json");
const readTable = (code) => JSON.parse(fs.readFileSync(i18nPath(code), "utf8"));
const en = readTable("en");
const TABLES = { en, id: readTable("id") };

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
// `until` exists for the one test that starts a server against a lock file that
// ALREADY EXISTS (the stale-pid case). Without it this polls, reads the stale
// lock before the server has replaced it, and resolves with the very token the
// test is asserting must never be reused — a flake in the test, not the product.
function startServer(root, extraArgs, until) {
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
      if (lock && lock.port && (!until || until(lock))) {
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
        // `agent: false` is load-bearing, not tidiness. Since Node 19
        // `http.globalAgent` defaults to keepAlive:true, so every request here
        // leaves a POOLED socket open; the test then kills the server in its
        // `finally`, the pooled socket errors, and the ECONNRESET lands AFTER
        // the test ended — which node:test reports as an uncaughtException that
        // fails the whole FILE with no failing assertion in it. One socket per
        // request, closed with the response, and the file is deterministic.
        agent: false,
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
      http.get({ host: "127.0.0.1", port, path: "/api/config?t=" + token, agent: false }, (r) => {
        r.resume();
        // Resolve on `end`, not on the headers: resolving early lets the test
        // finish while the body is still arriving, which is the same
        // after-the-test socket error by a different route.
        r.on("end", () => res(r.headers));
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
  // Never a one-way door. The prose now lives in the string table, so that is
  // where the affordance is asserted — a replay button with no label is the
  // same regression as no replay button.
  assert.match(js, /t\("shortcuts\.replay"\)/, "a dismissed tour must be replayable");
  assert.ok(en["shortcuts.replay"], "the replay action needs a label in the string table");
  // Fixture mode teaches the panel with numbers that are not real.
  assert.match(js, /!metaInfo\.fixtures && !tourSeen/, "the tour must not run on fixtures");

  // The upgrade spotlight ends because you did the thing — so it has no Next
  // and no Skip, and it names the click that clears it.
  const i = js.indexOf("function startUpgradeSpotlight");
  const fn = js.slice(i, i + 800);
  assert.match(fn, /dismissOnClickSelector/, "the upgrade spotlight must clear on the real click");
  assert.ok(!/onNext|onSkip/.test(fn), "the upgrade spotlight must have no next/skip");
});

// v0.43.6 — the guided tour is MODAL.
//
// It shipped fully click-through, which sounds friendlier and is not: clicking
// the sidebar mid-tour swapped the panel out from under the popover, so the
// ring was left pointing at an element that no longer existed and the step's
// text described a page you were no longer on. Next and Skip must be the only
// live controls while a step is up.
test("tour: a guided step blocks everything except its own buttons", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  // The blocker exists, and it is created for every step that did not opt out.
  assert.match(js, /const blocker = interactive \? null : el\("div", "tour-block"\)/, "a non-interactive step must build a blocker");

  const rule = (sel) => {
    const m = css.match(new RegExp("\\" + sel + "\\s*\\{([^}]*)\\}"));
    return m ? m[1] : "";
  };
  const z = (sel) => {
    const m = rule(sel).match(/z-index:\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };
  const block = z(".tour-block");
  assert.ok(block, ".tour-block needs an explicit z-index");
  // ABOVE the highlighted element: lifting the target to 46 is what keeps it
  // visible through the scrim, and a blocker underneath it would leave exactly
  // one element clickable — the one that navigates away mid-tour.
  assert.ok(block > z(".tour-target"), "the blocker must cover the highlighted element too");
  assert.ok(block < z(".tour-pop"), "the popover must stay above the blocker, or Next is unclickable");
  assert.match(rule(".tour-block"), /position:\s*fixed/, "the blocker must cover the viewport");
  assert.ok(!/pointer-events:\s*none/.test(rule(".tour-block")), "the blocker must RECEIVE clicks, not pass them through");

  // The keyboard is blocked too: 1-9 navigating the rail is the same failure.
  assert.match(js, /if \(tourActive && tourActive\.blocking\) return;/, "shortcuts must be inert during a blocking step");
  assert.match(js, /tourActive = \{\s*\n?\s*blocking:/, "the tour must publish whether it is blocking");

  // The upgrade spotlight is the ONE opt-out — blocking it would block the very
  // click that dismisses it.
  const up = js.slice(js.indexOf("function startUpgradeSpotlight"), js.indexOf("function startUpgradeSpotlight") + 800);
  assert.match(up, /interactive:\s*true/, "the upgrade spotlight must stay click-through");
});

// v0.43.6 — a tour step must point at something that HAS a size. The Experiment
// lanes shipped collapsed, and a collapsed section is zero-height: the step that
// teaches it drew a ring around nothing.
test("experiment: the lane list the tour points at is expanded", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const panel = js.slice(js.indexOf("PANELS.experiment"), js.indexOf("PANELS.maintenance"));
  assert.match(panel, /collapsed:\s*false/, "the Lanes section must render expanded");
  assert.ok(!/collapsed:\s*true/.test(panel), "nothing on this panel may ship collapsed while the tour targets it");
  // And the tour really does target it, so the two stay tied together.
  assert.match(js, /selector: "\.lane-list", title: "tour\.7\.title"/, "the tour step must still point at .lane-list");
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

// v0.43.7 — the Flow stepper draws the pipeline, and it must draw the REAL one.
//
// The whole value of the picture is that it agrees with what compiles. The
// panel is only allowed to render `steps[]`; the moment it starts deciding the
// order (or which phases are on) from the raw keys, there are two ideas of the
// pipeline and no lint that can see the difference.
test("flow stepper: the panel renders the CLI's steps[], it never derives them", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const i = js.indexOf("function stepperCard");
  assert.ok(i > 0, "the stepper must exist");
  const fn = js.slice(i, js.indexOf("function jumpToKey"));

  assert.match(fn, /d\.steps\.forEach/, "it must iterate the CLI's steps[]");
  // A hardcoded phase list in the panel IS the drift this design forbids.
  for (const phase of ["analyze", "planning", "scoring", "testgen", "mock-example"]) {
    assert.ok(!fn.includes(`"${phase}"`), `the panel must not name the phase "${phase}" itself`);
  }
  // OFF is a state of a step that is still drawn, never a filter.
  assert.ok(!/steps\.filter\([^)]*\.on\)\s*\.forEach/.test(fn), "an off phase must keep its slot, not be filtered out");
  assert.match(fn, /step-off/, "off phases must be marked so the stylesheet can red them");

  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.step-off\s*\{[^}]*border-color:\s*var\(--bad\)/, "an off phase is drawn RED, not merely dimmed");
  assert.match(css, /\.step-link/, "the connectors carry the left-to-right sweep");

  // v0.44.0 — the sweep LOOPS. It was one-shot, and said the one thing this
  // card exists to say ("these run in this order") before the card had finished
  // arriving, with no way to see it again short of a recompile.
  const sweep = css.slice(css.indexOf(".step-flow {"), css.indexOf(".step-flow {") + 400);
  assert.match(sweep, /infinite/, "the connector sweep must loop");
  assert.match(css, /--sweep:/, "the cycle length must be one variable, shared by the steps and the connectors");
  // A loop is only tolerable because it is mostly IDLE. Both pulse keyframes
  // must return to rest well before the cycle ends — a pulse that fills its
  // cycle is a flashing sign above a form.
  for (const name of ["step-pulse", "step-pulse-off"]) {
    const kf = css.slice(css.indexOf("@keyframes " + name + " {"), css.indexOf("@keyframes " + name + " {") + 400);
    assert.match(kf, /0%,\s*1[0-9]%,\s*100%/, `${name} must be at rest for most of the cycle`);
  }
  // Reduced motion means NO motion. Capping the iteration count would still
  // fire it once and leave the connector collapsed at its last keyframe, so
  // both halves are removed outright.
  const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(rm, /\.step, \.step::before\s*\{\s*animation:\s*none/, "reduced motion must remove the step pulse outright");
  assert.match(rm, /\.step-flow\s*\{\s*display:\s*none/, "reduced motion must remove the connector sweep outright");

  // The pulse rides an OVERLAY, never the step's own border/background: a
  // running animation beats a transition on the same property, so pulsing the
  // step itself forever would have silently killed `button.step:hover`.
  assert.match(css, /\.step::before\s*\{[^}]*animation:\s*step-pulse/, "the pulse must live on the overlay");
  const stepRule = css.slice(css.indexOf(".step {"), css.indexOf(".step {") + 700);
  assert.ok(!/animation:[^;]*step-pulse/.test(stepRule), ".step must not animate its own colours");
  assert.match(stepRule, /isolation:\s*isolate/, "the overlay's negative z-index must be scoped to the step");
  assert.match(css, /button\.step:hover\s*\{[^}]*border-color/, "hover feedback must survive the loop");
});

// v0.44.0 — the scrollbar under the stepper was the loudest thing on a card
// whose whole job is to be read as a diagram: an opaque platform slab with its
// own track colour, cutting a hard band across the bottom of the rail.
test("css: a scrolling box has a transparent track, not a grey gutter", () => {
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  // Both syntaxes, because neither falls back to the other: Firefox reads the
  // properties, WebKit and Chromium read the pseudo-elements.
  assert.match(css, /scrollbar-width:\s*thin/, "Firefox needs scrollbar-width");
  assert.match(css, /scrollbar-color:\s*var\(--line\) transparent/, "Firefox needs a transparent track colour");
  assert.match(css, /::-webkit-scrollbar-track[^{]*\{[^}]*background:\s*transparent/, "the WebKit track must be transparent");
  assert.match(css, /::-webkit-scrollbar-thumb[^{]*\{[^}]*border-radius:\s*999px/, "the thumb is rounded");
  // The card behind it must show through — a track painted in a surface colour
  // is the grey band this replaced.
  assert.ok(
    !/::-webkit-scrollbar-track[^{]*\{[^}]*background:\s*var\(--surface/.test(css),
    "the track must never be painted in a surface colour"
  );
});

// v0.44.0 — a flow key accepts a CLOSED SET, so it gets a dropdown.
//
// The list is the CLI's `options`, never a copy: a second idea of what a key
// accepts is the same drift the stepper's steps[] rule exists to prevent, and
// here it would show a value that `orc diy set` then refuses.
test("flow keys: a closed set renders as a dropdown built from the CLI's options", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");

  const fn = js.slice(js.indexOf("async function renderFlow"), js.indexOf("function bannerLine"));
  assert.match(fn, /k\.options && k\.options\.length/, "a key with options must become a select");
  assert.match(fn, /el\("select", "select-input"\)/, "the control is a real <select>");
  // No hardcoded value list anywhere in the panel.
  for (const v of ["blocking-only", "own-planner", "report-only", "hands-off"]) {
    assert.ok(!js.includes(`"${v}"`), `the panel must not name the flow value "${v}" itself`);
  }
  // A value outside its own set (an unset fixed_executor) is still SHOWN, and
  // shown as unpickable — the validator would refuse it back.
  assert.match(fn, /ph\.disabled = true/, "an out-of-set value must be shown but not offered");

  // The CLI half: `options` is emitted straight off DIY_META.
  const show = cli.slice(cli.indexOf("function diyShow"), cli.indexOf("function diyInteractive"));
  assert.match(show, /options: m\.options \? m\.options\.map\(String\) : null/, "diy show --json must publish each key's closed set");
});

// v0.44.0 — the panel could tune a flow key by key but never START one from a
// known shape, which is the terminal composer's very first question.
test("flow presets: the bootstrap shapes are the CLI's, and applying one is confirmed", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");

  assert.match(cli, /\.\.\.Object\.entries\(DIY_PRESETS\)\.map/, "diy show --json must publish the preset catalog");
  const fn = js.slice(js.indexOf("function presetCard"), js.indexOf("function confirmPreset"));
  assert.match(fn, /d\.presets/, "the panel must render the CLI's presets, not its own list");
  // The names are the CLI's; the panel must not carry a copy of them.
  for (const name of ["paranoid", "solo-fast"]) {
    assert.ok(!js.includes(`"${name}"`), `the panel must not name the preset "${name}" itself`);
  }
  // It sits directly under the gate card, which is what the deep-link anchors on.
  assert.match(js, /out\.append\(gate\);[\s\S]{0,400}presetCard\(d, body\)/, "the presets belong immediately below the gate");

  // `--force` is what makes this an answer on an already-configured project,
  // and it REPLACES the config — so it is confirmed, and the loss is named.
  const route = api.slice(api.indexOf('"/api/diy/preset"'), api.indexOf('"/api/diy/preset"') + 400);
  assert.match(route, /"diy", "init", "--force"/, "it must shell the CLI's own bootstrap");
  assert.match(route, /if \(b\.name\) argv\.push\("--preset"/, "an empty name is the wizard's full-lane defaults");
  const confirm = js.slice(js.indexOf("function confirmPreset"), js.indexOf("function confirmPreset") + 1600);
  assert.match(confirm, /modal\(/, "applying a preset must be confirmed");
  assert.ok(en["flow.presetOverwrite"], "the confirmation must say what is replaced");
});

// v0.44.1 — the preset you are already on must not offer to overwrite itself.
test("flow presets: the active shape is CLI-detected and ignores the flow's name", () => {
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");

  const show = cli.slice(cli.indexOf("function diyShow"), cli.indexOf("function diyInteractive"));
  // flow_name is a LABEL. Renaming `solo-fast` to `solo` must not make the
  // panel forget which shape the flow came from, so it is excluded from the
  // match on both the defaults row and every preset row.
  const excl = show.match(/k === "flow_name"/g) || [];
  const exclDefaults = show.match(/m\.key === "flow_name"/g) || [];
  assert.ok(excl.length >= 1 && exclDefaults.length >= 1, "the match must exclude flow_name on both rows");
  assert.match(show, /active: !!cfg && Object\.entries\(changes\)\.every/, "a preset is active when every key it sets still holds that value");
  // The empty-name row is the wizard's own first option, not a UI invention.
  assert.match(show, /\{ name: "", changes: \{\}, active:/, "the catalog must lead with full-lane defaults");

  const fn = js.slice(js.indexOf("function presetCard"), js.indexOf("const presetCommand"));
  assert.match(fn, /p\.active/, "the panel must read the CLI's verdict, not recompute it");
  assert.match(fn, /if \(!p\.active\)/, "the active row must not render a Use button");
  assert.match(fn, /preset-active/, "the active row is marked so the stylesheet can show it");
  // It keeps its ROW: removing it would make "you are on lean" and "lean does
  // not exist" render identically.
  assert.ok(!/presets\.filter/.test(fn), "an active preset keeps its row, it is never filtered out");
});

// v0.44.1 — writes are BATCHED. Every control used to commit on the spot: one
// click, one subprocess, one full re-render that scrolled the list away.
test("edits: nothing is written until Apply, on Settings and on Flow alike", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");

  assert.match(js, /function editSet\(/, "there must be one staging mechanism");
  assert.match(js, /function editBar\(/, "and one bar that commits it");
  // Staging a value back to what it already was must CLEAR the edit, or Cancel
  // and "set it back by hand" would disagree about whether anything is pending.
  const set = js.slice(js.indexOf("    set(key, value, original) {"), js.indexOf("    reset(key) {"));
  assert.match(set, /map\.delete\(key\)/, "re-staging the original value must drop the edit");

  // No control may write directly any more.
  const control = js.slice(js.indexOf("function controlFor(k, edits)"), js.indexOf("// The Settings edit bar."));
  assert.ok(!/post\(/.test(control), "a Settings control must stage, never post");
  assert.match(control, /edits\.set\(k\.key/, "it stages against the edit set");
  // Nothing re-renders until Apply, so a control has to repaint its own state.
  assert.match(control, /const paint = \(v\) =>/, "a segmented control must follow its own click");

  const flow = js.slice(js.indexOf("async function renderFlow"), js.indexOf("function bannerLine"));
  assert.match(flow, /editSet\(/, "the flow keys stage too");
  assert.match(flow, /keys\.append\(bar\)/, "the flow bar sits at the bottom of the keys card");

  // Apply runs the staged writes one at a time and never aborts the rest — the
  // remaining writes are independent, and stopping halfway leaves a state
  // nobody chose.
  const apply = js.slice(js.indexOf("async function applyEdits"), js.indexOf("function settingRow"));
  assert.match(apply, /for \(const \[key, e\] of list\)/, "writes run in staged order");
  assert.ok(!/break;/.test(apply), "a refused write must not abort the remaining ones");
  assert.match(apply, /failed\.push/, "every failure is reported by key");

  // Cancel is offered ONLY when there is something to cancel.
  const bar = js.slice(js.indexOf("function editBar(edits,"), js.indexOf("// Apply runs the staged writes"));
  assert.match(bar, /if \(n\) actions\.append\(cancel\)/, "Cancel appears only while dirty");
  assert.match(bar, /apply\.disabled = n === 0/, "Apply is inert with nothing staged");
  // A count is not a change list: the pending keys are named.
  assert.match(bar, /edit-chip/, "the pending edits must be named, not counted");

  for (const k of ["edits.apply", "edits.cancel", "edits.resetAll", "edits.pending"]) {
    assert.ok(en[k], `the edit bar needs a label for ${k}`);
  }
});

// v0.44.1 — the ring is `position: fixed` at coordinates measured ONCE, and
// this page grows things above the fold on its own schedule: the update banner
// lands after a network check, doctor's banners after that, and the upgrade row
// fills in a version chip of its own. Every one pushed the target down and left
// the spotlight framing empty space.
test("tour: a spotlight re-places itself when the page grows under it", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const fn = js.slice(js.indexOf("function spotlight({"), js.indexOf("// The first-run walkthrough"));

  assert.match(fn, /new ResizeObserver\(reflow\)/, "a height change anywhere must re-place the ring");
  assert.match(fn, /getElementById\("banners"\)/, "the banner host is the one that grows late");

  // A ResizeObserver alone is not enough: it is delivered from the RENDERING
  // lifecycle, so a throttled tab — exactly the tab somebody comes back to —
  // never gets the callback. The MutationObserver runs off the microtask queue.
  assert.match(fn, /new MutationObserver\(/, "there must be a frame-independent trigger too");
  assert.match(fn, /mo\.observe\(document\.body, \{ childList: true, subtree: true/, "it must watch the whole document, not one host");
  // Attributes are the one thing it must NOT watch: `place()` writes inline
  // styles on the ring and popover, so observing them is an infinite loop.
  assert.ok(!/attributes:\s*true/.test(fn), "observing attributes would make place() trigger itself forever");
  assert.match(fn, /if \(queued\) return;/, "mutations must coalesce to one reflow per task");
  assert.match(fn, /ro\.disconnect\(\)/, "the observers must be released on cleanup");
  assert.match(fn, /mo\.disconnect\(\)/, "the observers must be released on cleanup");

  // keepInView must NOT be wired to the scroll listener — a spotlight that
  // scrolls back every time you scroll away is one you cannot get out of.
  assert.match(fn, /const onResize = \(\) => place\(\);/, "scrolling only re-places, it never re-scrolls");
  assert.match(fn, /if \(!target \|\| adjusting\) return;/, "the re-scroll must not recurse through its own scroll event");
});

// v0.44.1 — the changelog is this repo's README, hard-wrapped at ~78 columns,
// rendered `pre-wrap` into a 660px box: every authoring line break survived and
// the paragraphs came out as a ragged stack ending nowhere near the right edge.
test("changelog: the body is reflowed to the box, and the banner lines up", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(js, /function reflowMd\(/, "the body must be reflowed before it is rendered");
  assert.match(js, /reflowMd\(stripMd\(e\.body\)\)/, "and the modal must actually use it");

  // The three children of the update banner used to sit on three different
  // alignments: badge at the top, text at the top, CTA on the centre.
  assert.ok(
    !/\.banner-badge\s*\{[^}]*align-self:\s*flex-start/.test(css),
    "the NEW pill must not be pinned to the top of a two-line message"
  );
  assert.match(css, /\.banner-update\s*\{[^}]*align-items:\s*center/, "the banner row centres its children");
});

// v0.44.0 — the one action on Maintenance that does not target this project.
test("maintenance: the global update is boxed off, previewed globally, and labelled", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");

  const entry = api.slice(api.indexOf('"update-global": {'), api.indexOf('"update-global": {') + 300);
  assert.match(entry, /apply: \["update", "--global"\]/, "it must shell the real command");
  // The preview has to read the SAME place the apply would write, or it is a
  // report about the project dressed up as one about ~/.claude.
  assert.match(entry, /preview: \["doctor", "--global"\]/, "the preview must target the global install too");
  assert.match(entry, /advanced: true/, "it must be flagged advanced so the panel boxes it off");

  // It is the ONLY global reach: config never merges, so a global config write
  // would silently outrank the project file every other panel here edits.
  assert.ok(!/"config",\s*"set"[^\]]*--global/.test(api), "config is never written globally");

  assert.match(js, /if \(anyAdvanced\) out\.append\(advanced\)/, "the advanced box appears only when something is in it");
  assert.match(js, /t\("maintenance\.globalWarn"\)/, "the preview must say it writes outside this project");
  assert.ok(en["maintenance.advanced"] && en["maintenance.globalNote"], "the advanced section needs its labels");
});

// v0.44.0 — a spotlight can only work on something you can SEE.
//
// The upgrade row is the fourth action on Maintenance and sits below the fold
// on a normal window, so arriving from the changelog's "go upgrade" drew the
// ring off screen and left the popover pointing at nothing.
test("tour: a spotlight scrolls its target into view and freezes the panel entrance", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  const fn = js.slice(js.indexOf("function spotlight({"), js.indexOf("// The first-run walkthrough"));
  assert.match(fn, /target\.scrollIntoView\(\{ block: "center"/, "the target must be scrolled into view first");
  // Smooth needs frames to land; a spotlight that is only correct in a
  // foregrounded, unthrottled tab is not correct.
  assert.ok(!/scrollIntoView\(\{[^}]*behavior:\s*"smooth"/.test(fn), "the scroll must be instant, not animated");

  // `panel-in` and `block-in` both animate transform, and a running transform
  // animation is a stacking context — which decides the ring/popover ladder by
  // accident of timing rather than by the documented z-index order.
  assert.match(fn, /classList\.add\("tour-on"\)/, "the panel entrance must be frozen while a step is up");
  assert.match(fn, /classList\.remove\("tour-on"\)/, "and unfrozen on cleanup");
  assert.match(css, /body\.tour-on \.panel[^{]*\{\s*animation:\s*none/, "the freeze must cover the panel and its blocks");
});

// v0.43.7 — the Crosslink Design tab.
//
// The picture must stay comparable between openings (a computed layout, not a
// physics sim) and must never become a second opinion about peer state: the
// chips repeat the CLI's own words.
test("crosslink design: a computed layout, and the CLI's own state words", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const i = js.indexOf("function vaultCard");
  assert.ok(i > 0, "the vault graph must exist");
  const fn = js.slice(i, js.indexOf("function svgEl"));

  assert.match(fn, /Math\.cos|Math\.sin/, "peers sit at computed angles");
  // A sim would place the same config differently on every open.
  for (const sim of ["requestAnimationFrame(function tick", "velocity", "repulsion"]) {
    assert.ok(!fn.includes(sim), `the layout must be computed, not simulated (${sim})`);
  }
  // Both spellings of "this repo" must resolve, or an edge silently vanishes.
  assert.match(fn, /pos = \{ \[d\.self\]: hub, self: hub \}/, "links name self as either the literal 'self' or the repo name");
  assert.match(fn, /if \(!a \|\| !b\) return/, "an edge naming an unknown repo is skipped, never drawn to nowhere");
  assert.ok(!/preserveAspectRatio/.test(fn), "stretching a viewBox squashes every label and stroke with it");
  for (const word of ["missing", "no wiki", "unregistered", "corrupt"]) {
    assert.ok(fn.includes(`"${word}"`), `the chip must repeat the CLI's own state word: ${word}`);
  }

  // Two tabs, and the empty Design tab must point at the one that fills it.
  const panel = js.slice(js.indexOf("async function renderCrosslink"), js.indexOf("function designView"));
  assert.match(panel, /crosslink\.tab\.design/, "a Design tab");
  assert.match(panel, /crosslink\.tab\.settings/, "a Settings tab");
  assert.match(panel, /tab-spot/, "with nothing linked, the tab that can fix that is spotlighted");
  assert.match(panel, /select\(live \? "design" : "settings"\)/, "nothing to draw → Settings opens selected");
  // The Settings tab holds several cards; the container owns the gap.
  assert.match(panel, /el\("div", "tab-pane stack"\)/, "the pane must space the blocks it holds");

  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8");
  const rm = css.slice(css.indexOf("@media (prefers-reduced-motion"));
  assert.match(rm, /\.vault-pulse\s*\{\s*display:\s*none/, "the one infinite animation must be removed, not merely capped");
});

// v0.43.7 — repo boxes overlapped, and the reason is worth pinning: the ring
// radius was a FRACTION of the container ("0.34 of the height") while the boxes
// were fixed pixels, so nothing in the layout knew how big a box was. Three
// peers were enough to pile them on top of each other.
//
// The radii are solved from the box size now, so "no two repos overlap" is a
// property that can be CHECKED rather than eyeballed — which is what this does,
// by running the shipped ringRadii() over every node count that fits on screen.
test("crosslink design: no two repo boxes can overlap, at any node count", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const m = js.match(/const VAULT = \{ W: (\d+), H: (\d+), GAP: (\d+), PAD: (\d+) \}/);
  assert.ok(m, "the box metrics must be declared in one place");
  const VAULT = { W: +m[1], H: +m[2], GAP: +m[3], PAD: +m[4] };

  // The CSS box and the box the maths solves for MUST be the same box. This is
  // the drift that reintroduces the bug: widen the card in CSS alone and the
  // radii are computed against a box that no longer exists.
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8");
  const rule = css.slice(css.indexOf(".vault-node {"), css.indexOf(".vault-node {") + 500);
  assert.strictEqual(+rule.match(/width:\s*(\d+)px/)[1], VAULT.W, "CSS width must equal VAULT.W");
  assert.strictEqual(+rule.match(/height:\s*(\d+)px/)[1], VAULT.H, "CSS height must equal VAULT.H");
  assert.match(rule, /box-sizing:\s*border-box/, "padding and border must count inside the fixed size");

  // Run the real function, not a copy of its arithmetic.
  const ringRadii = new Function(
    "VAULT",
    js.slice(js.indexOf("function ringRadii"), js.indexOf("function vaultCard")) + "; return ringRadii;"
  )(VAULT);

  for (let n = 1; n <= 16; n++) {
    const { rx, ry } = ringRadii(n);
    assert.ok(Number.isFinite(rx) && Number.isFinite(ry), `n=${n}: radii must be finite (n=1 has no neighbour pair)`);

    const pts = [[0, 0, "hub"]];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      pts.push([rx * Math.cos(a), ry * Math.sin(a), "peer" + i]);
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = Math.abs(pts[i][0] - pts[j][0]);
        const dy = Math.abs(pts[i][1] - pts[j][1]);
        // Boxes are centred on their point: they miss each other only if they
        // are clear on one axis or the other.
        assert.ok(
          dx - VAULT.W >= -0.01 || dy - VAULT.H >= -0.01,
          `n=${n}: ${pts[i][2]} and ${pts[j][2]} overlap (dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}, box ${VAULT.W}x${VAULT.H})`
        );
      }
    }
  }

  // A ring wide enough not to collide can exceed the panel — that must scroll,
  // never squeeze the ring back into a collision.
  const fn = js.slice(js.indexOf("function vaultCard"), js.indexOf("function svgEl"));
  assert.match(fn, /el\("div", "scroll-x"\)/, "a graph wider than the panel scrolls in its own container");
  assert.ok(!/max-width/.test(rule), "a max-width on the box would shrink it below the size the maths assumes");
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
    // Wait for the lock the SERVER wrote, not the stale one already on disk.
    srv = await startServer(root, [], (lock) => lock.pid !== 999999);
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
  // The honesty line moved into the string table with everything else, so it is
  // asserted where it now lives — in EVERY language, because a missing
  // translation here would silently become an empty state that reads as "one is
  // missing" rather than "none was ever generated".
  assert.match(app, /t\("runs\.mock\.none"\)/, "the panel must render the not-generated line");
  for (const [code, table] of Object.entries(TABLES)) {
    assert.match(table["runs.mock.none"] || "", /\S/, `${code} must say a run has no mock example`);
    assert.match(table["runs.mock.noneHint"] || "", /mock_example/, `${code} must name the config key that controls it`);
  }
});

// ── i18n (v0.43.6) ──────────────────────────────────────────────────────────
//
// THE SCOPE RULE is the thing worth protecting here, and it is not obvious:
// only the panel's OWN prose is translated. Everything that arrives from
// `bin/cli.js --json` — config keys, their descriptions, values, agent names,
// model ids, paths, commands, doctor messages — is machine text and stays
// exactly as the CLI wrote it. A translated config key is a key that does not
// exist; a translated command is a command you cannot type.

test("i18n: every key the panel asks for exists in English", () => {
  // Comments are stripped first. This file DOCUMENTS the fragment-built key
  // form it forbids ("t(\"settings.tier.\" + tier)"), and a scan that cannot
  // tell a call from a comment about that call fails on its own explanation.
  const js = fs
    .readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const keys = new Set();
  for (const m of js.matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)) keys.add(m[1]);
  // tn() picks `key` or `key + "Plural"`, so BOTH must exist or a plural count
  // renders as a raw dotted key at exactly the moment there is more than one.
  for (const m of js.matchAll(/\btn\([^,]+,\s*"([a-zA-Z0-9_.]+)"/g)) {
    keys.add(m[1]);
    keys.add(m[1] + "Plural");
  }
  assert.ok(keys.size > 200, `expected the panel to use the table heavily, saw ${keys.size}`);
  const missing = [...keys].filter((k) => !(k in en));
  assert.deepStrictEqual(missing, [], "these keys are used but not defined in en.json");
});

test("i18n: every language defines exactly the same keys", () => {
  // A key present in en and absent in id is not a crash — t() falls back — but
  // it IS a half-translated screen nobody notices. Parity is the only way that
  // stays visible.
  const enKeys = Object.keys(en).filter((k) => k !== "_readme").sort();
  for (const [code, table] of Object.entries(TABLES)) {
    if (code === "en") continue;
    const keys = Object.keys(table).filter((k) => k !== "_readme").sort();
    assert.deepStrictEqual(keys, enKeys, `${code}.json must define exactly the keys en.json defines`);
  }
});

test("i18n: placeholders survive translation", () => {
  // `{n}`, `{version}`, `{command}` are substituted by t(). A translation that
  // drops one silently loses the number or the command it was carrying.
  for (const [code, table] of Object.entries(TABLES)) {
    if (code === "en") continue;
    for (const [key, value] of Object.entries(en)) {
      if (key === "_readme" || typeof value !== "string") continue;
      const want = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const got = [...String(table[key]).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepStrictEqual(got, want, `${code}.json "${key}" must carry the same placeholders`);
    }
  }
});

test("i18n: config keys and CLI vocabulary are never translated", () => {
  const cliSrc = fs.readFileSync(CLI, "utf8");
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");

  // The real registry key names, straight from the CLI. If any of them ever
  // became a translatable STRING VALUE rather than an id quoted inside a
  // sentence, the panel would be writing a key that does not exist.
  const registryKeys = [...cliSrc.matchAll(/\{\s*key:\s*"(\w+)",[^}]*tier:\s*"/g)].map((m) => m[1]);
  assert.ok(registryKeys.length > 20, `expected to find the config registry, saw ${registryKeys.length}`);
  for (const [code, table] of Object.entries(TABLES)) {
    for (const [key, value] of Object.entries(table)) {
      if (key === "_readme" || typeof value !== "string") continue;
      assert.ok(!registryKeys.includes(value.trim()), `${code}.json "${key}" is a bare config key — those are ids, not prose`);
    }
  }

  // The values the panel reads out of a payload go through as-is. These are the
  // spots where a t() call would translate DATA, so they are named explicitly.
  for (const expr of ["k.desc", "k.shadow_reason", "f.message", "a.label", "l.what", "p.desc", "d.reason"]) {
    assert.ok(
      !new RegExp("t\\(\\s*" + expr.replace(".", "\\.") + "\\s*\\)").test(js),
      `${expr} comes from the CLI — it must never be passed through t()`
    );
  }
});

test("i18n: the language switch is a browser preference, never project config", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "bin", "webui", "app.html"), "utf8");

  // Remembered in localStorage, exactly like the theme — never written to
  // orc.config.yaml, which is a file the whole team shares.
  assert.match(js, /const LANG_KEY = "orc-ui-lang"/, "the language must be a named localStorage key");
  assert.match(js, /localStorage\.setItem\(LANG_KEY/, "the choice must be remembered in the browser");
  assert.ok(!/lang/i.test((api.match(/const WRITES = \{[\s\S]*?\n\};/) || [""])[0]), "no write route may carry a language");

  // The button lives in the rail, under the theme toggle, and ships an English
  // fallback in the markup so a failed fetch still renders a readable rail.
  assert.match(html, /id="lang-toggle"/, "the rail needs a language button");
  assert.match(html, /data-i18n="nav\.overview">Overview</, "nav labels need an in-markup English fallback");
});

test("i18n: the string tables are served, and only those two", () => {
  const serve = fs.readFileSync(path.join(REPO, "bin", "webui", "serve.js"), "utf8");
  const table = serve.slice(serve.indexOf("const STATIC = {"), serve.indexOf("};", serve.indexOf("const STATIC = {")));
  assert.match(table, /"\/i18n\/en\.json"/, "English must be served — it is the fallback table");
  assert.match(table, /"\/i18n\/id\.json"/, "Indonesian must be served");
  // A FIXED map, never a path join against the request: a static table is what
  // stops a URL naming a file of its own choosing.
  assert.ok(!/req\.|url\.|pathname/.test(table), "the static map must not interpolate anything from a request");
});

// v0.43.6 — a caution must point at the panel that can actually clear it.
//
// `orc doctor` reports every problem in one list, and the Overview sent all of
// them to Maintenance. That is right for the install-footprint findings and
// WRONG for `diy-stale`: the flow is recompiled with `orc diy compile`, which
// is a button on FLOW. The panel was telling people to go to a page with no
// control for the thing it was complaining about.
test("overview: a finding routes to the panel that owns its fix", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const cliSrc = fs.readFileSync(CLI, "utf8");

  assert.match(js, /const FINDING_ROUTE = \{/, "the routing table must exist");
  const table = js.slice(js.indexOf("const FINDING_ROUTE = {"), js.indexOf("const DEFAULT_FINDING_ROUTE"));
  assert.match(table, /"diy-stale":\s*\{\s*panel:\s*"flow"/, "a stale DIY flow is recompiled on Flow, not Maintenance");
  // A finding with nothing to press anywhere must offer no button at all rather
  // than a button that goes somewhere useless.
  assert.match(table, /"trace-pointer-dangling":\s*\{\s*panel:\s*null/, "a self-clearing finding gets no destination");
  assert.match(js, /const DEFAULT_FINDING_ROUTE = \{ panel: "maintenance"/, "install-footprint findings still go to Maintenance");

  // The ids are the CLI's. A renamed finding must not silently fall back to the
  // default route, so both routed ids are checked against the source.
  for (const id of ["diy-stale", "trace-pointer-dangling"]) {
    assert.ok(cliSrc.includes(`"${id}"`), `orc doctor must still emit the finding id "${id}"`);
  }
});

// v0.43.6 — an AGING wiki is not an error, it is the moment a refresh is still
// cheap. The Overview said so with a colour and nothing else.
test("overview: the wiki tier turns into advice, not just a colour", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const fn = js.slice(js.indexOf("function attentionCard"), js.indexOf("function statTile"));

  assert.match(fn, /w\.tier === "AGING"/, "an AGING wiki must produce a recommendation");
  assert.match(fn, /overview\.item\.wikiAging/, "and it must be a titled, explained item");
  assert.match(fn, /w\.state !== "registered"/, "an unregistered wiki must be offered the free sync");
  assert.match(fn, /p\.patterns \|\| \[\]/, "a missing code pattern is worth surfacing too");

  // The refresh itself costs a model, so the panel must never claim it can do
  // it — every language has to keep that caveat.
  for (const [code, table] of Object.entries(TABLES)) {
    assert.match(table["overview.item.wikiAging.body"] || "", /model|Claude Code/i, `${code} must say a refresh runs in Claude Code`);
  }
});

// v0.43.6 — Runs is an accordion. The old list-plus-detail-box put the detail
// further from the row the longer the list got.
test("runs: a row expands in place instead of rendering a box below the list", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(REPO, "bin", "webui", "app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  // The split layout is gone — there is no second column to render into.
  assert.ok(!/const detailSlot/.test(js), "there must be no separate detail slot");
  assert.ok(!/function showRun\(/.test(js), "the detail renderer must fill the row's own pane");
  // The signature grew a third parameter in v0.46.0 (the aftermath grade, which
  // renders INSIDE the expanded row), so the assertion pins the first two — the
  // pane and the slug are what make this "the row that asked for it".
  assert.match(js, /function loadRunDetail\(pane, slug(, \w+)?\)/, "detail is loaded into the row that asked for it");
  // …and the aftermath detail goes in that same pane, not a box below the list.
  assert.match(js, /const ab = afterBox\(grade\);/, "the aftermath detail renders inside the expanded row");

  // The fold animates the same way the settings tiers do: `height: auto` cannot
  // be transitioned, and the inner element is what collapses against.
  assert.match(css, /\.run-body\s*\{[^}]*grid-template-rows:\s*0fr/, "the fold must start closed");
  assert.match(css, /\.run-row\.open > \.run-body\s*\{[^}]*grid-template-rows:\s*1fr/, "and open to 1fr");
  assert.match(css, /\.run-body-inner\s*\{[^}]*min-height:\s*0/, "the inner element is what collapses against");

  // One row at a time: two open rows re-create the scrolling problem.
  assert.match(js, /const collapseAll = \(except\)/, "opening a row must close the others");
  // Detail is fetched once per row and kept, so re-opening costs nothing.
  assert.match(js, /if \(open && !entry\.loaded\)/, "a row must fetch its detail only on first open");
});

// v0.43.6 — the folder picker. A browser cannot hand back a real path, so the
// server walks the filesystem and the page renders the walk.
test("crosslink: the folder picker lists directories and nothing else", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const fn = api.slice(api.indexOf("function fsList"), api.indexOf("// Open a terminal running"));

  assert.match(fn, /e\.isDirectory\(\)/, "only directories may be listed");
  assert.ok(!/readFileSync|createReadStream/.test(fn), "the picker must never read a file's contents");
  assert.ok(!/spawn|exec/.test(fn), "no path may reach a shell");
  // A path it cannot read is an ANSWER, not a 500 — an unreadable folder is a
  // normal thing to click on.
  assert.match(fn, /return \{ path: target, error:/, "an unreadable folder must return an error field, not throw");
  // The relative path is computed SERVER-side: only the server knows the real
  // separator, and a Windows path assembled with "/" works until it does not.
  assert.match(fn, /path\.relative\(ctx\.projectRoot, target\)/, "the stored relative path is the server's to compute");
  assert.match(fn, /split\(path\.sep\)\.join\("\/"\)/, "and it must be normalised for the config file");

  // GET only, and it never appears in the write table.
  assert.ok(!/\/api\/fs\/list/.test((api.match(/const WRITES = \{[\s\S]*?\n\};/) || [""])[0]), "the picker must not be a write route");
  // Typing a path by hand still works — browsing is an addition, not the gate.
  assert.match(js, /const repoPath = el\("input", "text-input"\)/, "the path field must remain a plain text input");
  assert.match(js, /function pickFolder\(onPick\)/, "and the picker hands back a path to put in it");
});

test("learn: one section at a time, with a contents rail", () => {
  const js = fs.readFileSync(path.join(REPO, "bin", "webui", "app.js"), "utf8");
  const panel = js.slice(js.indexOf("PANELS.learn"), js.indexOf("PANELS.experiment"));

  // The old shape was every section rendered as a card of monospace text.
  assert.ok(!/for \(const s of d\.sections\) \{\s*\n\s*const c = card\(s\.title\)/.test(panel), "sections must not all render at once");
  assert.match(panel, /learn-nav-item/, "there must be a contents rail");
  assert.match(panel, /function goTo\(i\)/, "and a position you move through");
  assert.match(panel, /LEARN_POS_KEY/, "where you are must survive leaving the panel");

  // The content itself is still the shipped walkthrough — one source, two
  // surfaces. The panel formats it; it never rewrites it.
  const content = fs.readFileSync(path.join(REPO, "bin", "onboarding-content.js"), "utf8");
  assert.match(content, /SECTIONS/, "the walkthrough must still come from onboarding-content.js");
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(panel), "walkthrough text must never be parsed as markup");
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
