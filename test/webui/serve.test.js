"use strict";
// @test-pool net  — starts the real `orc ui` server on loopback
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
const zlib = require("zlib");
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
    let out = "";
    let exit = null;
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => (out += d));
    child.on("exit", (c, sig) => (exit = sig || c));
    const started = Date.now();
    const poll = setInterval(() => {
      let lock = null;
      try {
        lock = JSON.parse(fs.readFileSync(path.join(root, LOCK_REL), "utf8"));
      } catch (_) {}
      if (lock && lock.port && (!until || until(lock))) {
        clearInterval(poll);
        resolve({
          child,
          lock,
          // What the server said, for any assertion that fails later. A
          // transport error on loopback is unreadable without knowing whether
          // the process on the other end is still alive.
          state: () => "exit=" + exit + " killed=" + child.killed + "\n--- stderr ---\n" + err.trim() + "\n--- stdout ---\n" + out.trim(),
        });
        return;
      }
      // THE BOOT BUDGET IS NOT PART OF THE CONTRACT (v1.0.0 W0).
      //
      // This was 20 s, and 20 s is how long `orc ui` takes to boot on an idle
      // box times a comfortable margin — on a LOADED one it is a coin flip.
      // That is the starvation class `_helpers.js` documents in its own words,
      // and it is what made `server: every asset the shell references loads`
      // the suite's one intermittent failure: a full run went red at 20.9 s
      // with a message about the wrong thing entirely. What is under test here
      // is that the server STARTS and answers correctly, never that it starts
      // inside a particular number of seconds — the same reasoning that
      // un-slept the two watchdog tests in the same wave.
      //
      // And when it does fail, it now says why: the child's exit code, its
      // stderr and its stdout. "server never wrote its lock: " with an empty
      // string after it has cost more than one debugging round.
      if (Date.now() - started > 90000) {
        clearInterval(poll);
        try {
          child.kill();
        } catch (_) {}
        reject(
          new Error(
            "server never wrote its lock in 90s (exit=" +
              exit +
              ")\n--- stderr ---\n" +
              err.trim() +
              "\n--- stdout ---\n" +
              out.trim()
          )
        );
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
          // A BROWSER ALWAYS SENDS THIS, so the test client does too — it is
          // what makes this exercise the path the panel actually takes. It is
          // also load-bearing: an uncompressed `/api/config` is ~69 KB, and on
          // Windows loopback a response over the 64 KiB socket buffer loses its
          // tail roughly one time in six (measured with a plain twenty-line
          // http.createServer — it is a platform bug, not this server's). The
          // gzip path answers in ~8 KB, well under that line.
          { "accept-encoding": "gzip" },
          token ? { "x-orc-token": token } : {},
          host ? { host } : {},
          body ? { "content-type": "application/json" } : {}
        ),
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const enc = String(res.headers["content-encoding"] || "");
          let raw;
          try {
            raw = enc === "gzip" ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8");
          } catch (e) {
            return reject(e);
          }
          resolve({ status: res.statusCode, raw, headers: res.headers });
        });
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
      http.get({ host: "127.0.0.1", port, path: "/api/config?t=" + token, agent: false, headers: { "accept-encoding": "gzip" } }, (r) => {
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

// v1.5.0 — EVERY BODY THIS SERVER WRITES DECLARES ITS LENGTH, and a large one
// is compressed for a client that asked. Both are the answer to a measured
// Windows-loopback failure: a response over the 64 KiB socket buffer loses its
// tail roughly one time in six and the client sees ECONNRESET nineteen seconds
// later with nothing logged. It reproduces on a plain twenty-line
// `http.createServer`, so it is not this server's bug — but `/api/config` was
// 64,934 bytes, six hundred short of the line, and one release's config keys
// crossed it. The fix is not a cap on what the API may say: it is that a JSON
// answer says how long it is, and that the browser's own `accept-encoding`
// takes the big ones far below the cliff.
test("server: every response declares its length, and a big one gzips for a client that asks", async () => {
  const { root } = freshInstall();
  let srv;
  try {
    srv = await startServer(root);
    const { port, token } = srv.lock;

    const small = await request(port, "/api/meta", { token });
    assert.strictEqual(small.status, 200);
    assert.ok(small.headers["content-length"], "a JSON response must carry content-length");
    assert.ok(!small.headers["content-encoding"], "a small body is not worth compressing");

    // The big one. `request()` sends `accept-encoding: gzip` exactly as a
    // browser does, and gunzips what comes back.
    const big = await request(port, "/api/config", { token });
    assert.strictEqual(big.status, 200);
    assert.ok(big.headers["content-length"], "a JSON response must carry content-length");
    const parsed = JSON.parse(big.raw);
    assert.ok(parsed.data.keys.length > 20, "the gzip path must round-trip the real object");
    if (parsed.data.keys.length && Buffer.byteLength(big.raw, "utf8") >= 32 * 1024) {
      assert.strictEqual(big.headers["content-encoding"], "gzip", "a body over 32 KiB is compressed when asked");
      assert.match(String(big.headers["vary"] || ""), /accept-encoding/i, "a compressed answer varies on accept-encoding");
      assert.ok(
        Number(big.headers["content-length"]) < Buffer.byteLength(big.raw, "utf8"),
        "content-length describes the bytes on the wire, not the bytes after gunzip"
      );
    }

    // And a client that did NOT ask is still served — identity, correct length.
    const plain = await new Promise((res, rej) => {
      const r = http.request({ host: "127.0.0.1", port, path: "/api/meta?t=" + token, agent: false }, (x) => {
        let n = 0;
        x.on("data", (c) => (n += c.length));
        x.on("end", () => res({ headers: x.headers, n }));
      });
      r.on("error", rej);
      r.end();
    });
    assert.ok(!plain.headers["content-encoding"], "a client that did not ask never gets gzip");
    assert.strictEqual(Number(plain.headers["content-length"]), plain.n, "content-length must match the bytes sent");
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

    let i = 0;
    for (const ref of refs) {
      i++;
      const res = await request(port, "/" + ref.replace(/^\.?\//, "")).catch((e) => {
        throw new Error("asset " + i + "/" + refs.length + " (" + ref + ") failed: " + e.code + " " + e.message + "\n" + srv.state());
      });
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

// v1.5.0 — THE 64 KiB CLIFF APPLIES TO STATIC FILES TOO.
//
// `api.js` learned this on `/api/config` and fixed the JSON path: on Windows
// loopback a response over the socket buffer loses its tail roughly one time in
// six, with nothing in any log to say so. The static path kept a comment saying
// "no asset is over 64 KiB today" — and that had been FALSE for two releases:
// `js/panels/extra.js` is 138 KB and `js/panels/hookui.js` is 76 KB.
//
// The symptom was an intermittent ECONNRESET in the asset walk above, which is
// the harmless half. The other half is a real browser receiving a panel script
// that stops in the middle of a function.
test("server: a large asset is COMPRESSED, so nothing rides the 64 KiB cliff", async () => {
  const { root } = freshInstall();
  let srv;
  try {
    srv = await startServer(root);
    const { port, token } = srv.lock;

    // The two files this was found on. Asserted BY NAME, because the point is
    // not that some file is big — it is that the biggest ones this app ships
    // must not go out raw.
    const CLIFF = 64 * 1024;
    for (const rel of ["js/panels/extra.js", "js/panels/hookui.js"]) {
      const onDisk = fs.statSync(path.join(WEBUI, ...rel.split("/"))).size;
      assert.ok(onDisk > CLIFF, `${rel} is the case this test exists for — it must still be over ${CLIFF}`);

      const res = await request(port, "/" + rel + "?t=" + token);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(
        String(res.headers["content-encoding"] || ""),
        "gzip",
        `${rel} is ${onDisk} bytes and must be compressed — raw, it is intermittently truncated`
      );
      // The wire length is what actually has to clear the cliff.
      assert.ok(
        Number(res.headers["content-length"]) < CLIFF,
        `${rel} must go out under ${CLIFF} bytes on the wire`
      );
      // A cache keyed on the URL alone would hand a gzip body to a client that
      // cannot read one.
      assert.match(String(res.headers.vary || ""), /accept-encoding/i);
    }

    // A SMALL file is NOT compressed — the CPU is not worth it, and a rule that
    // gzips everything is a rule nobody can reason about.
    const small = await request(port, "/css/00-tokens.css?t=" + token);
    assert.strictEqual(small.status, 200);
    assert.ok(!small.headers["content-encoding"], "a small asset goes out as-is");

    // And a client that did NOT ask for gzip never gets it, whatever the size.
    const raw = await new Promise((resolve, reject) => {
      const r = http.request(
        {
          host: "127.0.0.1",
          port,
          path: "/js/panels/extra.js?t=" + token,
          agent: false,
          headers: { "accept-encoding": "identity" },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.headers));
        }
      );
      r.on("error", reject);
      r.end();
    });
    assert.ok(!raw["content-encoding"], "a client that did not ask never receives gzip");
  } finally {
    if (srv) srv.child.kill();
    rmrf(root);
  }
});

test("server: the static path and the JSON path share ONE encoder", () => {
  // A second implementation is how the two drift apart again — which is exactly
  // what happened: the JSON path was fixed and the static path was not, for two
  // releases, with a stale comment standing where the fix should have been.
  const serve = fs.readFileSync(path.join(WEBUI, "serve.js"), "utf8");
  const api = fs.readFileSync(path.join(WEBUI, "api.js"), "utf8");
  assert.match(serve, /const \{ handleApi, encodeBody \} = require\("\.\/api\.js"\)/);
  assert.match(serve, /encodeBody\(body, req\.headers\["accept-encoding"\]\)/);
  assert.match(api, /module\.exports = \{[^}]*encodeBody/);
  // One definition, one threshold, one accept check.
  assert.strictEqual((api.match(/function encodeBody\(/g) || []).length, 1);
  assert.ok(!/zlib\.gzipSync/.test(serve), "serve.js must not gzip on its own");
  // And the stale claim that guarded the bug is gone for good.
  assert.ok(!/No asset is over 64 KiB today/.test(serve), "that sentence was false and is what hid the bug");
});
