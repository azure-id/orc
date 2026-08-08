"use strict";
/**
 * serve.js — the `orc ui` http server.
 *
 * NOTE THE NAME: this is `bin/webui/`, not `bin/ui/`. `bin/ui.js` is the
 * TERMINAL styling kit (colors, glyphs, boxes) the CLI prints through. Two
 * different things; the user-facing command is still `orc ui`.
 *
 * The server can write config, so it is treated as a write surface throughout:
 * loopback bind only, a per-launch token on every /api call, a Host-header
 * check against DNS rebinding, no CORS headers at all, POST-only mutations,
 * and a token that is never logged.
 *
 * It never runs a lane, never spawns `claude`, never calls a model API. Every
 * byte it serves or writes comes from `bin/cli.js`.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { handleApi } = require("./api.js");

const DEFAULT_PORT = 9921;
const PORT_WALK_MAX = 9930;
// No heartbeat from ANY client for this long → exit. Closing the tab shuts the
// server down within about a minute.
const HEARTBEAT_GRACE_MS = 60_000;
// Backstop for a client that died without a beacon (laptop sleep, browser
// crash, killed tab process) — it never sent a heartbeat OR a bye.
const DEFAULT_IDLE_MIN = 30;
const LOCK_REL = path.join("orc", "ui.lock");

const STATIC = {
  "/": { file: "app.html", type: "text/html; charset=utf-8" },
  "/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
};

// ── the lock file ───────────────────────────────────────────────────────────
// `.claude/orc/ui.lock` — project-scoped like everything else, and the thing
// that makes re-running `orc ui` idempotent, `--stop` possible, and a forgotten
// server findable. It lives under .claude/orc/, which `isPrunable` in cli.js
// can never match, so `orc update --prune` will not delete it.

function lockPath(claudeDir) {
  return path.join(claudeDir, LOCK_REL);
}

function readLock(claudeDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(lockPath(claudeDir), "utf8"));
    if (raw && raw.pid && raw.port && raw.token) return raw;
  } catch (_) {}
  return null;
}

function writeLock(claudeDir, data) {
  const p = lockPath(claudeDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function removeLock(claudeDir) {
  try {
    fs.rmSync(lockPath(claudeDir));
  } catch (_) {}
}

function pidAlive(pid) {
  try {
    // Signal 0 tests for existence without touching the process.
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means it exists and belongs to someone else — still alive.
    return e.code === "EPERM";
  }
}

// A lock whose pid is dead is stale: delete it and start fresh.
function liveLock(claudeDir) {
  const lock = readLock(claudeDir);
  if (!lock) return null;
  if (pidAlive(lock.pid)) return lock;
  removeLock(claudeDir);
  return null;
}

function urlFor(port, token) {
  return `http://127.0.0.1:${port}/?t=${token}`;
}

// ── open a browser ──────────────────────────────────────────────────────────
// Best-effort and never fatal: the URL is always printed, so a failed open is
// an inconvenience, not an error.
function openBrowser(url) {
  try {
    const [cmd, args] =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    return true;
  } catch (_) {
    return false;
  }
}

// ── `orc ui --stop` ─────────────────────────────────────────────────────────
// Exit 0 if something was stopped, 1 if nothing was running — the same
// exit-code convention as `orc resume` and `orc pattern status`.
function stop(claudeDir) {
  const lock = liveLock(claudeDir);
  if (!lock) {
    removeLock(claudeDir);
    console.log("No orc ui server is running for this project.");
    return 1;
  }
  try {
    process.kill(lock.pid);
  } catch (_) {}
  removeLock(claudeDir);
  console.log(`Stopped the orc ui server (pid ${lock.pid}, port ${lock.port}).`);
  return 0;
}

// ── binding ─────────────────────────────────────────────────────────────────
// Port free → bind it. Port held by anything else → walk 9922…9930 — but ONLY
// when the port was the default. An EXPLICIT --port never auto-increments: if
// you asked for a specific port and it is taken, that is an error, not a silent
// move to somewhere you are not looking.
function listen(server, port, explicit) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      const onError = (err) => {
        server.removeListener("listening", onOk);
        if (err.code !== "EADDRINUSE") return reject(err);
        if (explicit)
          return reject(
            Object.assign(new Error(`port ${p} is already in use`), { code: "EADDRINUSE", port: p })
          );
        if (p >= PORT_WALK_MAX)
          return reject(
            Object.assign(new Error(`ports ${DEFAULT_PORT}-${PORT_WALK_MAX} are all in use`), {
              code: "ENOPORT",
            })
          );
        tryPort(p + 1);
      };
      const onOk = () => {
        server.removeListener("error", onError);
        resolve(p);
      };
      server.once("error", onError);
      server.once("listening", onOk);
      // 127.0.0.1 ONLY — never 0.0.0.0. This is a write surface.
      server.listen(p, "127.0.0.1");
    };
    tryPort(port);
  });
}

// ── security ────────────────────────────────────────────────────────────────

// DNS-rebinding guard. A page on evil.example can make a browser resolve a
// hostname to 127.0.0.1 and reach this server; the Host header it sends is that
// attacker hostname, never a loopback literal. Anything but a loopback Host is
// refused before routing.
function loopbackHost(hostHeader, port) {
  if (!hostHeader) return false;
  const h = String(hostHeader).trim().toLowerCase();
  return (
    h === `127.0.0.1:${port}` ||
    h === `localhost:${port}` ||
    h === `[::1]:${port}` ||
    h === "127.0.0.1" ||
    h === "localhost"
  );
}

// Constant-time compare so a token cannot be recovered by timing the reply.
function tokenOk(given, expected) {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// ── the server ──────────────────────────────────────────────────────────────

async function serve(opts) {
  const {
    claudeDir,
    projectRoot,
    port: wantPort,
    explicitPort,
    open = true,
    idleMinutes = DEFAULT_IDLE_MIN,
    fixtures = false,
    version = "",
  } = opts;

  // Idempotent relaunch: a live server for THIS project is not replaced by a
  // second one — read its lock, verify the pid, and just open the browser at
  // the recorded port and token.
  if (!fixtures) {
    const existing = liveLock(claudeDir);
    if (existing) {
      const url = urlFor(existing.port, existing.token);
      console.log(`orc ui is already running for this project (pid ${existing.pid}).`);
      console.log(`  ${url}`);
      if (open) openBrowser(url);
      console.log("  Stop it with: orc ui --stop");
      return 0;
    }
  }

  const token = crypto.randomBytes(32).toString("hex");
  const startedMs = Date.now();
  let lastContact = Date.now();
  let boundPort = wantPort;
  // Has a browser ever talked to us? Until one has, only the idle timeout
  // applies — otherwise a `--no-open` launch would shut itself down in 60s.
  let sawClient = false;

  const ctx = {
    claudeDir,
    projectRoot,
    fixtures,
    version,
    startedMs,
    idleMinutes,
    get port() {
      return boundPort;
    },
    onHeartbeat() {
      lastContact = Date.now();
      sawClient = true;
    },
    onBye() {
      // A beacon is a hint, not a command: another tab may still be open, so
      // the heartbeat window — not this call — decides the actual shutdown.
      lastContact = Date.now() - HEARTBEAT_GRACE_MS + 3000;
    },
  };

  const server = http.createServer((req, res) => {
    lastContact = Date.now();
    let url;
    try {
      url = new URL(req.url, `http://127.0.0.1:${boundPort}`);
    } catch (_) {
      res.writeHead(400).end();
      return;
    }

    if (!loopbackHost(req.headers.host, boundPort)) {
      // Deliberately terse: an attacker learns nothing, and this can only be
      // hit by something that is not the local browser we opened.
      res.writeHead(403, { "content-type": "text/plain" }).end("forbidden\n");
      return;
    }

    // No CORS headers at ALL — no Access-Control-Allow-*, ever. A cross-origin
    // page must not be able to read a single byte of this.
    const given = url.searchParams.get("t") || req.headers["x-orc-token"];
    const authed = tokenOk(given, token);

    const stat = STATIC[url.pathname];
    if (stat) {
      if (!authed) {
        res
          .writeHead(401, { "content-type": "text/html; charset=utf-8" })
          .end(
            "<h1>orc ui</h1><p>This link is missing its session token. Re-run <code>orc ui</code> " +
              "in your project to get a fresh URL.</p>"
          );
        return;
      }
      let body;
      try {
        body = fs.readFileSync(path.join(__dirname, stat.file));
      } catch (_) {
        res.writeHead(500, { "content-type": "text/plain" }).end("missing asset\n");
        return;
      }
      // The token is required on EVERY request, and a <link>/<script> in the
      // HTML carries no query string of its own — so app.css and app.js would
      // 401 and the page would render as unstyled, scriptless markup. Stamp the
      // live token onto the two asset references as the shell goes out. Doing it
      // here (rather than with a cookie) keeps the token explicit per request:
      // there is no ambient credential a cross-origin page could ever ride on.
      if (stat.file === "app.html") {
        body = Buffer.from(
          body
            .toString("utf8")
            .replace('href="app.css"', `href="app.css?t=${token}"`)
            .replace('src="app.js"', `src="app.js?t=${token}"`),
          "utf8"
        );
      }
      res.writeHead(200, {
        "content-type": stat.type,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        // The page loads only its own inline-free assets and talks only to
        // itself; nothing external is ever fetched.
        "content-security-policy":
          "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
        "referrer-policy": "no-referrer",
      });
      res.end(body);
      return;
    }

    if (!url.pathname.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found\n");
      return;
    }
    if (!authed) {
      res
        .writeHead(401, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "bad or missing token" }));
      return;
    }
    // Mutations are POST-only, enforced here as well as in the router, so a GET
    // can never reach a write path however the table is later edited.
    if (req.method !== "GET" && req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json" }).end(JSON.stringify({ error: "method not allowed" }));
      return;
    }
    Promise.resolve(handleApi(req, res, url, ctx)).catch((e) => {
      if (res.headersSent) return;
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: String(e && e.message) }));
    });
  });

  try {
    boundPort = await listen(server, wantPort, explicitPort);
  } catch (e) {
    if (e.code === "EADDRINUSE")
      console.error(
        `❌ port ${e.port} is already in use.\n` +
          "   You asked for that port explicitly, so orc ui will not move to another one.\n" +
          "   Pick a different one with --port <n>, or stop whatever holds it."
      );
    else if (e.code === "ENOPORT")
      console.error(
        `❌ ports ${DEFAULT_PORT}-${PORT_WALK_MAX} are all in use.\n` +
          "   Choose one yourself with: orc ui --port <n>"
      );
    else console.error("❌ could not start the orc ui server: " + e.message);
    return 1;
  }

  const url = urlFor(boundPort, token);
  if (!fixtures) writeLock(claudeDir, { pid: process.pid, port: boundPort, token, started_ms: startedMs });

  // The token is part of the URL the user needs; it is never written to a log
  // line of its own, and never echoed by any /api response.
  console.log(`\norc ui — ${fixtures ? "FIXTURE MODE (canned data, nothing real is read)" : projectRoot}`);
  console.log(`  ${url}`);
  console.log(
    "  " +
      (idleMinutes > 0
        ? `Shuts down ~1 min after the last tab closes, or after ${idleMinutes} idle minutes.`
        : "Idle timeout disabled (--idle 0) — stop it with `orc ui --stop`.")
  );
  console.log("  Stop it now with: orc ui --stop  (or Ctrl-C here)\n");
  if (open) openBrowser(url);

  // A shutdown is never mysterious: the reason is printed to the terminal this
  // was launched from.
  const shutdown = (reason, code = 0) => {
    console.log(`\norc ui stopped — ${reason}`);
    if (!fixtures) removeLock(claudeDir);
    try {
      server.close();
    } catch (_) {}
    process.exit(code);
  };

  const idleMs = idleMinutes > 0 ? idleMinutes * 60_000 : 0;
  const timer = setInterval(() => {
    const quiet = Date.now() - lastContact;
    // 1) Heartbeat: a client WAS here and has stopped pinging → the tab closed.
    if (sawClient && quiet > HEARTBEAT_GRACE_MS) shutdown("the browser tab closed");
    // 2) Idle: nothing at all for the whole window → nobody is using this.
    if (idleMs && quiet > idleMs) shutdown(`idle for ${idleMinutes} minutes`);
  }, 5000);
  timer.unref();

  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => shutdown(`received ${sig}`));

  return new Promise(() => {}); // run until a shutdown path exits
}

module.exports = { serve, stop, readLock, liveLock, lockPath, removeLock, loopbackHost, DEFAULT_PORT, PORT_WALK_MAX, HEARTBEAT_GRACE_MS, DEFAULT_IDLE_MIN };
