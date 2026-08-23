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
const { cli, rmrf, tmpdir, freshInstall, REPO, WEBUI, appJs, appCss, appHtml, assetRefs, panelJs, panelCss, fixtureSrc, i18nNamespaces, i18nTable, webuiFiles } = require("../_helpers");

const CLI = path.join(REPO, "bin", "cli.js");
const LOCK_REL = path.join(".claude", "orc", "ui.lock");

// The shipped string tables. English is the FALLBACK table every other language
// falls back to, so it is loaded separately as well as in the pair.
const en = i18nTable("en");
const TABLES = { en, id: i18nTable("id") };

// The server is a WRITE surface on a machine that may be shared, so auth, the
// loopback Host guard and the method guard are not nice-to-haves — a
// regression in any one of them is the whole vulnerability. Plus the STATIC
// walk, generic token stamping, and the lock that makes `--stop` possible.
//
// Split out of webui.test.js in v0.48.1, alongside bin/webui/ itself.

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
    // v0.48.1 — the panel is ~55 files, so "app.css and app.js are referenced"
    // is no longer the assertion worth making. EVERY reference in the shipped
    // app.html must come back stamped, and every one must resolve. That is what
    // makes a forgotten <script> tag impossible to ship: it would be unstamped
    // (401) or missing (404), and this walks all of them.
    const shipped = assetRefs("css").concat(assetRefs("js"));
    assert.ok(shipped.length >= 20, "the shell must reference the whole css/ and js/ manifest");
    for (const rel of shipped)
      assert.ok(
        refs.includes(rel + "?t=" + token),
        `${rel} must go out with the session token stamped on it — an unstamped reference 401s`
      );
    assert.strictEqual(refs.length, shipped.length, "every reference in the shell must be a stamped asset");

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

// ── restarting in place (v0.53.2) ──────────────────────────────────────────
//
// `orc upgrade` replaces the package this server is RUNNING FROM, and node
// loaded bin/webui at require time while `STATIC` is a one-time walk at boot —
// so an upgraded panel keeps serving the old bytes. The fix used to be three
// manual steps: stop the server, re-run `orc ui`, open the new URL.
//
// The handover is only correct if the SAME port and the SAME token survive it.
// A successor on a new address is not a restart, it is a second server, and the
// tab the user is looking at would still be pointing at the corpse.
test("server: /api/ui/restart hands over on the SAME port and token", async () => {
  const { root } = freshInstall();
  let srv;
  let successorPid = null;
  try {
    srv = await startServer(root);
    const { port, token, pid } = srv.lock;

    // POST-only, like every other mutation.
    assert.strictEqual(
      (await request(port, "/api/ui/restart?t=" + token)).status,
      404,
      "a restart is a mutation and is never reachable by GET"
    );

    const r = await request(port, "/api/ui/restart", { token, method: "POST", body: {} });
    assert.strictEqual(r.status, 200);
    const out = JSON.parse(r.raw);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.port, port, "a successor on a different port is not a restart");
    successorPid = out.pid;
    assert.ok(successorPid && successorPid !== pid, "a NEW process answers the next request");

    // Wait for the lock to name the successor, then talk to it with the ORIGINAL
    // token — which is the whole point: the URL already in the address bar has
    // to keep working, so the tab only has to reload.
    const deadline = Date.now() + 30000;
    let lock = null;
    for (;;) {
      try {
        lock = JSON.parse(fs.readFileSync(path.join(root, LOCK_REL), "utf8"));
      } catch (_) {}
      if (lock && lock.pid === successorPid) break;
      if (Date.now() > deadline) throw new Error("the successor never wrote its lock");
      await new Promise((res) => setTimeout(res, 200));
    }
    assert.strictEqual(lock.port, port);
    assert.strictEqual(lock.token, token, "the token is inherited, so the open tab's URL stays valid");

    const after = await request(port, "/api/meta", { token });
    assert.strictEqual(after.status, 200, "the original token authenticates against the new process");
  } finally {
    for (const id of [srv && srv.lock && srv.lock.pid, successorPid]) {
      if (!id) continue;
      try {
        process.kill(id);
      } catch (_) {}
    }
    try {
      srv && srv.child.kill();
    } catch (_) {}
    rmrf(root);
  }
});

// The token authenticates a WRITE surface, which puts it in the same class as
// the credentials `orc extra` refuses on a command line: argv is world-readable
// in a process list and lands in shell history.
test("server: the restart token travels in the environment, never in argv", () => {
  const src = fs.readFileSync(path.join(WEBUI, "serve.js"), "utf8");
  assert.match(src, /RESTART_ENV_TOKEN = "ORC_UI_TOKEN"/);
  assert.ok(
    !/argv\.push\((["'])--token/.test(src) && !src.includes('"--token"'),
    "a --token flag would put a live credential in every process list on the machine"
  );
  // Read once and dropped, so no CLI subprocess this server shells out ever
  // inherits it.
  assert.match(src, /delete process\.env\[RESTART_ENV_TOKEN\]/);
});

// A restart is worth doing only after a command that replaced what the panel is
// serving, and only if that command SUCCEEDED — a failed upgrade changed
// nothing. `update-global` writes to ~/.claude, which is not what runs here.
test("api: restarts_ui is DECLARED per maintenance action, never inferred", () => {
  const src = fs.readFileSync(path.join(WEBUI, "api.js"), "utf8");
  const block = src.slice(src.indexOf("const MAINTENANCE = {"), src.indexOf("// ── the Experiment panel"));
  for (const id of ["update", "prune", "fix", "upgrade"]) {
    const row = block.slice(block.indexOf("\n  " + id + ": {"));
    assert.match(row.slice(0, 400), /restarts_ui: true/, id + " replaces what the panel serves");
  }
  const g = block.slice(block.indexOf('"update-global": {'));
  assert.ok(!/restarts_ui/.test(g.slice(0, 400)), "update-global targets ~/.claude, not the running panel");
  // Reported only on success, so a failed upgrade never reloads the page.
  assert.match(src, /restart_pending: !!\(job\.restart_ui && !job\.running && job\.exit_code === 0\)/);
});
