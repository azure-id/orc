"use strict";
// A stand-in provider for the `orc extra` connection-gate tests.
//
// `node --test test/` DOES execute this file — it runs every .js under test/ as
// a test file — which is why the server half is gated on an explicit mode
// argument. See the guard near the bottom.
//
// It runs in ITS OWN PROCESS on purpose. The tests drive the CLI through
// spawnSync, which BLOCKS the calling process's event loop — an HTTP server
// listening inside the test process could never answer the child it is waiting
// on, and the whole file would hang with no output. Two processes, no deadlock.
//
// Modes:
//   models     serves /v1/models  → rung 1
//   nomodels   404s /v1/models    → rung 2, incl. the unknown-model escape
//   redirect   302s everything    → the credential must never follow one
//   publicmodels  serves /v1/models to ANYONE and 401s /chat/completions.
//              This is the shape that breaks rung 1's assumption: a 200 on the
//              model list is a URL proof and NOT a credential proof, so a
//              profile probing this one must NOT end up verified with a
//              garbage key. Verified against a real provider before it was
//              written down (v0.51.0, F8).
//
// Engine C (`api`) modes. These serve /chat/completions with OpenAI function
// calling, and each one exists to make ONE engine rule fail if it is broken:
//   chat       one tool call, then a final message  → the happy loop
//   chat-esc   asks to Read an absolute path outside the root → the fence
//   chat-undec asks to Write a file the slice never declared → the declaration
//   chat-loop  NEVER stops calling a tool  → the max_turns cap → PARTIAL
//   chat-nowr  finishes cleanly having written nothing → the empty-diff answer
//   chat-route echoes a DIFFERENT `provider` on turn 2 → ⚠ REROUTE (U4)
//   chat-429   429s twice, then answers  → the in-turn retry ladder
//   chat-400   400s with a model complaint → model_not_found, retry:false
//   chat-drop  THE USER'S OWN SCENARIO (v0.54.0). Turn 1 serves ONE Write of a
//              six-line src/routes/health.js that is missing its last line; turn
//              2 DROPS THE SOCKET MID-BODY, after the headers, which is how a
//              real 502 / dead wifi / rate-limited stream actually ends. A fake
//              that closed cleanly would certify the adapter rather than test
//              it (the v0.53.0 rule), because a clean close parses as a
//              malformed answer instead of a lost connection.
//
// Prints `PORT <n>` on stdout once listening; the parent reads that and starts.
//
// This file is BOTH the server and the spawn helper — `start(mode, key)` is
// what the test files call. One copy, because W5-W7 will add more callers and
// a forked helper is exactly the drift this repo lints for everywhere else.
const http = require("http");
const { spawn } = require("child_process");

const MODE = process.argv[2] || null;
const GOOD = process.argv[3] || "sk-live-PLANTEDSECRET0123456789";

// ── the spawn side ─────────────────────────────────────────────────────────
// Returns { port, stop }. THREE things keep a leaked child from hanging the
// run: the parent unrefs the pipe it is holding, the child is killed on the
// parent's exit as well as by stop(), and the child has its own idle watchdog.
// Any one of them alone has already failed once.
const CHILDREN = new Set();
process.on("exit", () => {
  for (const c of CHILDREN) {
    try {
      c.kill();
    } catch (_) {}
  }
});

function start(mode, key) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, mode || "models", key || GOOD], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    CHILDREN.add(child);
    child.on("exit", () => CHILDREN.delete(child));
    let buf = "";
    const t = setTimeout(() => reject(new Error("fake provider never reported a port")), 10000);
    child.stdout.on("data", (d) => {
      buf += d;
      const m = /PORT (\d+)/.exec(buf);
      if (!m) return;
      clearTimeout(t);
      // The parent's own event loop must not be held open by a pipe to a
      // server that runs forever. Without this, a passing test file still
      // never exits.
      child.stdout.unref();
      child.unref();
      resolve({
        port: Number(m[1]),
        stop: () => {
          try {
            child.kill();
          } catch (_) {}
        },
      });
    });
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

module.exports = { start };

// Everything below runs only when this file IS the process AND a mode was
// asked for.
//
// THE SECOND HALF OF THAT CONDITION IS LOAD-BEARING. `node --test test/` treats
// EVERY .js file under test/ as a test file and executes it — `_helpers.js`
// included; that one survives only because it has no side effects. A fixture
// that started a server on being loaded turned into a 90-second "passing test"
// (the idle watchdog was the only thing ending it), and the sibling fake
// `claude` turned into a hard failure. Requiring an explicit mode makes both
// inert under the runner and unchanged for their real callers.
if (require.main !== module || !MODE) return;

// The six lines the worker gets written before the wire dies. It is missing
// `module.exports = router;` — nothing mounts the route, and the build may even
// still pass, which is exactly why a half-finished write is worse than none.
const HEALTH_PARTIAL = [
  'const { Router } = require("express");',
  "",
  "const router = Router();",
  "",
  'router.get("/", (req, res) => {',
  '  res.status(200).json({ status: "ok" });',
  "});",
  "",
].join("\n");

const srv = http.createServer((req, res) => {
  const auth = req.headers.authorization || req.headers["x-api-key"] || "";
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (MODE === "redirect") {
    res.writeHead(302, { location: "https://elsewhere.invalid/v1/models" });
    return res.end();
  }
  // The models list answers BEFORE the credential check on this one, on
  // purpose: that is exactly what a public catalogue looks like from outside.
  if (MODE === "publicmodels" && /^\/(v1\/)?models/.test(req.url))
    return send(200, { data: [{ id: "fake-flash" }, { id: "fake-pro" }] });
  if (!auth.includes(GOOD)) return send(401, { error: { message: "invalid api key" } });
  if (req.url.startsWith("/v1/models")) {
    if (MODE === "nomodels") return send(404, { error: { message: "no models endpoint" } });
    return send(200, { data: [{ id: "fake-flash" }, { id: "fake-pro" }] });
  }
  // v0.53.3 — THE PATH IS PART OF THE CONTRACT, and a fake more permissive than
  // the provider certifies the adapter instead of testing it. This one answered
  // a completion on ANY path, which is exactly why `ping` rung 2 and
  // `models --test` could hardcode `{base}/chat/completions` for three releases
  // while dispatch derived `{base}/v1/chat/completions` — a profile that
  // verifies GREEN and dispatches into a 404 on any provider that accepts only
  // one spelling. The base here carries no version segment, so the ONE correct
  // path is /v1/chat/completions.
  if (/chat\/completions$/.test(req.url) && req.url !== "/v1/chat/completions")
    return send(404, { error: { message: `Unknown request URL: POST ${req.url}` } });
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let j = {};
    try {
      j = JSON.parse(body || "{}");
    } catch (_) {}
    if (/no-such-model/.test(j.model || ""))
      return send(404, { error: { message: `model \`${j.model}\` does not exist` } });
    if (/^chat/.test(MODE) && /chat\/completions/.test(req.url)) return chat(j, send, res);
    send(200, { model: j.model, choices: [{ message: { content: "hi" } }] });
  });
});

// ── the engine-C half ──────────────────────────────────────────────────────
// A usage block on EVERY turn, because the engine accumulates across turns and
// a fixture that reported it once could not catch a loop that overwrote instead
// of adding. prompt_tokens INCLUDES the cached count here, exactly as a real
// endpoint reports it — which is the arithmetic the vector has to undo.
let turn = 0;
let seen429 = 0;
const USAGE = {
  prompt_tokens: 1000,
  prompt_tokens_details: { cached_tokens: 600 },
  completion_tokens: 120,
  completion_tokens_details: { reasoning_tokens: 40 },
};
function chat(j, send, res) {
  turn++;
  const tools = (j.tools || []).map((t) => t.function && t.function.name);
  const has = (n) => tools.includes(n);
  const call = (name, argsObj) => ({
    model: j.model,
    provider: MODE === "chat-route" && turn > 1 ? "SomeoneElseInc" : "FakeProviderCo",
    usage: USAGE,
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "c" + turn, type: "function", function: { name, arguments: JSON.stringify(argsObj) } }],
        },
      },
    ],
  });
  const done = (text) => ({
    model: j.model,
    provider: MODE === "chat-route" && turn > 1 ? "SomeoneElseInc" : "FakeProviderCo",
    usage: USAGE,
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }],
  });

  // The privacy block is echoed into the FINAL TEXT (see `done` below), so a
  // test can prove the request BODY carried it. Engine A cannot compose one at
  // all, which is the whole reason engine C exists.

  // A 429 is not a turn — the engine retries INSIDE the turn — so the counter
  // is rolled back, and the mode then falls through to the ordinary flow. That
  // keeps the retry test about the retry, not about what happens afterwards.
  if (MODE === "chat-429" && seen429++ < 2) {
    turn--;
    return send(429, { error: { message: "slow down" } });
  }
  if (MODE === "chat-400") return send(400, { error: { message: "model `" + j.model + "` is not supported here" } });
  if (MODE === "chat-esc") {
    if (turn === 1) return send(200, call("Read", { path: process.platform === "win32" ? "C:/Windows/win.ini" : "/etc/passwd" }));
    return send(200, done("refused, stopping"));
  }
  if (MODE === "chat-undec") {
    if (turn === 1) return send(200, call("Write", { path: "src/NOT-DECLARED.js", content: "x" }));
    return send(200, done("refused, stopping"));
  }
  // ONE Write, and then the wire dies. Headers first, then a partial body, then
  // the socket is destroyed — a real 502 or a dropped link does not send a
  // well-formed close, and a fake that did would be exercising the malformed-
  // answer path instead of the lost-connection one.
  if (MODE === "chat-drop") {
    if (turn === 1) return send(200, call("Write", { path: "src/routes/health.js", content: HEALTH_PARTIAL }));
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"model":"' + (j.model || "") + '","choices":[{"message":{"role":"assist');
    return res.socket.destroy();
  }
  if (MODE === "chat-loop") return send(200, call("Read", { path: "src/a.js" }));
  if (MODE === "chat-nowr") return send(200, done("I looked and decided nothing needed changing."));
  if (MODE === "chat-route") {
    if (turn === 1) return send(200, call("Read", { path: "src/a.js" }));
    return send(200, done("read it"));
  }
  // chat / chat-* default: one real write, then a report.
  if (turn === 1 && has("Write")) return send(200, call("Write", { path: "src/a.js", content: "// rewritten by the fake worker\n" }));
  if (turn === 2 && has("Bash")) return send(200, call("Bash", { command: "echo built" }));
  return send(200, done("Renamed the helper in src/a.js. POLICY=" + JSON.stringify(j.provider || null)));
}

// A WATCHDOG, because a leaked provider is not a harmless orphan: the parent
// keeps its stdout pipe open, so a child that never exits keeps the node:test
// WORKER alive after every assertion has passed, and the whole run hangs with
// no output and no failing test to point at. Belt and braces with the parent's
// kill(): if nobody has asked for anything in 90 seconds, nobody is going to.
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
