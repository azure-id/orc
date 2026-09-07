"use strict";
// @test-pool pure  — the loopback server runs in a CHILD; this file registers zero tests
// A stand-in SYSTEM UNDER TEST for the `/orc-test` runner tests (v1.5.0).
//
// It runs in ITS OWN PROCESS on purpose, and that is not a style choice. The
// tests drive the CLI through `spawnSync`, which BLOCKS the calling process's
// event loop — an HTTP server listening inside the test process could never
// answer the child it is waiting on, so every request times out, every case
// reports `unknown`, and the file "passes" having measured nothing. That is the
// exact deadlock `_fake-provider.js` was already written around; this is the
// same shape for a different kind of endpoint, deliberately rather than by
// copying it, because a target is not a provider and the two will drift.
//
// A FAKE THAT IS MORE PERMISSIVE THAN THE REAL THING CERTIFIES THE ADAPTER; IT
// DOES NOT TEST IT (v0.53.0, learned on three third-party surfaces running). So
// this one answers on the paths it is asked about and 404s the rest, rather
// than returning 200 to anything.
//
// Modes:
//   ok         200 `[]` on every known path            → the green course
//   err500     500 everywhere                          → the ladder's stop
//   cookie     200 AND hands a credential straight back in Set-Cookie
//              → redaction, which must happen before the bytes reach disk
//   ratelimit  429 + Retry-After on everything         → a 429 IS a result
//   flaky      200 for the first two requests, 500 after
//              → a flake is RECORDED, never retried away
//   silent     accepts and answers, and is never supposed to be asked
//              → the origin fence. Anything it sees is the fence failing.
//
// Prints `PORT <n>` on stdout once listening, and APPENDS one `<method> <url>`
// line per request to a log FILE the parent names — so "was this ever sent?" is
// ANSWERABLE rather than inferred from a verdict. The origin-fence case is the
// whole reason: proving a request was NOT sent needs the receiving end's own
// account of it.
//
// THE LOG IS A FILE AND NOT THE STDOUT PIPE, and that is the load-bearing half.
// The parent drives the CLI through `spawnSync`, which blocks its event loop —
// so a `data` event carrying `HIT` lines cannot be delivered until after the
// assertion that wanted it has already run. An in-memory array fed by that pipe
// reads EMPTY every time, which does not fail loudly: it makes
// `assert.equal(hits.length, 0)` pass for the wrong reason, and an origin-fence
// test that passes because it measured nothing is worse than no test at all.
// A file is written by the child and read synchronously by the parent, so it is
// correct at exactly the moment it is asked.
//
// This file is BOTH the server and the spawn helper — `start(mode)` is what the
// test files call. One copy, for the reason the provider fixture gives: a forked
// helper is exactly the drift this repo lints for everywhere else.
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const MODE = process.argv[2] || "";

// The credential `cookie` mode hands back. It is a PLANTED secret: the
// redaction assertions look for this exact string in every byte the run wrote.
const PLANTED = process.argv[3] || "sk-live-do-not-log-me-4471";

// Where the child records what reached it. The parent names it, so the parent
// can read it synchronously between blocking CLI calls.
const HITS_LOG = process.argv[4] || "";

/* ── the spawn side ──────────────────────────────────────────────────────── */
// Returns { port, hits, log, stop }. `hits()` READS THE LOG FILE each time it is
// called, so it is correct the instant a blocking `cli()` returns — the child's
// own account of what reached it, never a verdict ORC wrote about itself.
//
// Three things keep a leaked child from hanging the run, and each one has
// already failed alone somewhere in this suite: the parent unrefs the pipe it
// holds, the child is killed on the parent's exit as well as by stop(), and the
// child has its own idle watchdog.
const CHILDREN = new Set();
process.on("exit", () => {
  for (const c of CHILDREN) {
    try {
      c.kill();
    } catch (_) {}
  }
});

function start(mode) {
  return new Promise((resolve, reject) => {
    const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "orc-target-")), "hits.log");
    const child = spawn(process.execPath, [__filename, mode || "ok", PLANTED, log], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    CHILDREN.add(child);
    child.on("exit", () => CHILDREN.delete(child));

    let buf = "";
    let started = false;
    // Read synchronously, so it is correct the instant a blocking cli() returns.
    const hits = () => {
      let raw = "";
      try {
        raw = fs.readFileSync(log, "utf8");
      } catch (_) {
        return [];
      }
      return raw
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const i = l.indexOf(" ");
          return { method: l.slice(0, i), url: l.slice(i + 1) };
        });
    };
    // The same wall clock, and the same rule, as the provider fixture: 10 s for
    // a node process to boot is a fact about the box, so it honours
    // ORC_TEST_PROBE_MS as a FLOOR and is never shortened.
    const bootMs = Math.max(10000, Number(process.env.ORC_TEST_PROBE_MS) || 0);
    const timer = setTimeout(() => reject(new Error("fake target never reported a port")), bootMs);

    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        const p = /^PORT (\d+)$/.exec(line);
        if (p && !started) {
          started = true;
          clearTimeout(timer);
          // The parent's own event loop must not be held open by a pipe to a
          // server that runs forever. Without this a passing file never exits.
          child.unref();
          resolve({
            port: Number(p[1]),
            hits,
            log,
            stop: () => {
              try {
                child.kill();
              } catch (_) {}
            },
          });
        }
      }
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

module.exports = { start, PLANTED };

// Everything below runs only when this file IS the process AND a mode was asked
// for. The second half is load-bearing: `node --test test/` executes EVERY .js
// under test/, so a fixture that started a server on being loaded becomes a
// 90-second "passing test" ended only by its own watchdog.
if (require.main !== module || !MODE) return;

let n = 0;

const srv = http.createServer((req, res) => {
  n++;
  // Drain the body before answering. A server that replies without reading can
  // reset the connection under a body the runner is still writing, which would
  // look like a network failure the runner is supposed to report honestly.
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    // Appended, never printed: see the header. The parent's event loop is
    // blocked while the CLI runs, so a pipe cannot deliver this in time.
    try {
      fs.appendFileSync(HITS_LOG, `${req.method} ${req.url}\n`);
    } catch (_) {}

    if (MODE === "ratelimit") {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
      return res.end(JSON.stringify({ error: "slow down" }));
    }
    if (MODE === "err500") {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "boom" }));
    }
    if (MODE === "flaky" && n > 2) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "boom" }));
    }

    // STRICTER THAN A PERMISSIVE STUB. Only the paths this fake actually models
    // answer; everything else is a 404, which is what a real router does and
    // what several derived cases are written to expect.
    const path = String(req.url).split("?")[0];
    const known = path === "/users" || /^\/users\/[^/]+$/.test(path);
    if (!known) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "not found" }));
    }

    const headers = { "content-type": "application/json" };
    // `cookie` hands a credential straight back, which real systems do. The
    // point of the mode is that ORC must redact what it RECEIVED as well as
    // what it sent.
    if (MODE === "cookie") headers["set-cookie"] = `session=${PLANTED}; Path=/; HttpOnly`;
    res.writeHead(200, headers);
    res.end(path === "/users" ? "[]" : "{}");
  });
});

// A WATCHDOG, for the reason the provider fixture states: a leaked child keeps
// the parent's stdout pipe open, which keeps the node:test WORKER alive after
// every assertion has passed — the run hangs with no output and no failing test
// to point at. Belt and braces with the parent's kill().
let idle = null;
const resetIdle = () => {
  clearTimeout(idle);
  idle = setTimeout(() => process.exit(0), 90000);
  idle.unref();
};

srv.on("request", resetIdle);
srv.listen(0, "127.0.0.1", () => {
  process.stdout.write(`PORT ${srv.address().port}\n`);
  resetIdle();
});
