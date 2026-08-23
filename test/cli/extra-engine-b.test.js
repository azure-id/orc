"use strict";
// `orc extra` — ENGINE B (`cli`), driving a third-party agentic CLI.
//
// This is the engine with the LEAST control, so most of these assertions are
// about ORC being honest about that rather than about ORC being in charge:
//
//   · the slice's prompt NEVER reaches argv (Windows caps a command line at
//     32,767 bytes, and a `.cmd` shim goes through cmd.exe's quoting rules —
//     the same hazard engine A removed rather than lived with)
//   · a tool that reports no token counts gets `usage: null`, NEVER four zeros
//   · `fence: {paths:false, declared_files:false}` is ON THE RECORD, because a
//     capability gap that is not reported reads as a capability
//   · exit 0 is still not success (F3), on this engine too
//   · codex's `--output-schema` is how a foreign worker returns ORC's contract
//     instead of prose, and `wire_api = "chat"` is a REFUSAL, not a warning
//
// The child asserts its own half — see `_fake-cli.js`, which exits 90 with
// `ORC-CONTRACT: <rule>` so a broken rule fails by NAME.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { tmpdir, cli } = require("../_helpers.js");

const SECRET_KEY = "sk-live-PLANTEDSECRET0123456789";
const FAKE_CLI = path.join(__dirname, "_fake-cli.js");
// A long, unique token that must appear in the task FILE and never in argv.
const PROMPT_MARKER = "MARKER7f3a91c4bd";

// The stand-in binaries live on PATH under their real names. On Windows they
// MUST be .cmd, because that is what an npm shim is — and the Windows `.cmd`
// branch is the one platform detail most likely to break.
function fakeBinDir(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orc-fake-cli-"));
  for (const n of names) {
    if (process.platform === "win32")
      fs.writeFileSync(path.join(dir, n + ".cmd"), `@echo off\r\n"${process.execPath}" "${FAKE_CLI}" %*\r\n`);
    else {
      const f = path.join(dir, n);
      fs.writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CLI}" "$@"\n`);
      fs.chmodSync(f, 0o755);
    }
  }
  return dir;
}

function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "// original\n");
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, a, env) => cli([...a, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);

function armedCli(p, bin, opts) {
  const o = opts || {};
  const add = ["extra", "add", "w", "--provider", "custom", "--engine", "cli", "--cli", bin, "--env-key", "K"];
  if (o.agent) add.push("--cli-agent", o.agent);
  if (o.attach) add.push("--cli-attach", o.attach);
  if (o.base) add.push("--base-url", o.base);
  const a = run(p, add);
  assert.equal(a.status, 0, a.stdout + a.stderr);
  // Engine `cli` verifies by the BINARY existing, and nothing more — that is
  // its own `verify_method` so nobody reads it as a network proof it never was.
  const ping = run(p, ["extra", "ping", "w", "--json"], { PATH: fakeBinDir([bin]) + path.delimiter + process.env.PATH });
  assert.equal(ping.status, 0, ping.stdout + ping.stderr);
  assert.equal(json(ping).verify_method, "cli-bin");
  assert.equal(run(p, ["extra", "route", "set", "0-30", "w/" + (o.model || "deepseek/fake-flash"), "--json"]).status, 0);
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "extra_enabled: true\nextra_roles: [executor]\n");
}

function slice(p, over) {
  const file = path.join(p.root, "slice.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      Object.assign(
        {
          task_id: "T1",
          score: 20,
          role: "executor",
          prompt:
            "PROMPT-MARKER:" +
            PROMPT_MARKER +
            "\nRename the helper in src/a.js. This brief is long enough to matter and is not ORC's own text.",
          standing_rules: "# ORC standing rules\nReturn the contract.\n",
          declared_files: ["src/a.js"],
        },
        over || {}
      )
    )
  );
  return file;
}
const dispatch = (p, bin, mode, over) =>
  run(p, ["extra", "dispatch", "--task", slice(p, over), "--json"], {
    K: SECRET_KEY,
    PATH: fakeBinDir([bin]) + path.delimiter + process.env.PATH,
    ORC_FAKE_CLI_MODE: mode || "ok",
  });

test("engine B / opencode: a clean run, and the CHILD confirms the prompt never reached argv", () => {
  const p = project();
  armedCli(p, "opencode", { agent: "build" });
  const r = dispatch(p, "opencode", "ok");
  assert.ok(!r.stderr.includes("ORC-CONTRACT:"), "the child reported a broken contract: " + r.stderr);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.engine, "cli");
  assert.equal(j.adapter, "opencode");
  assert.equal(j.outcome, "done");
  // The route target's model string arrives already in opencode's own
  // provider/model shape, because `route set` splits on the FIRST slash.
  assert.equal(j.model_requested, "deepseek/fake-flash");
  assert.ok(j.argv.includes("--dangerously-skip-permissions") && j.argv.includes("--format"));
  assert.ok(!j.argv.join(" ").includes(PROMPT_MARKER), "the slice prompt must never be in argv");
  assert.ok(!r.stdout.includes(SECRET_KEY) && !r.stderr.includes(SECRET_KEY));

  // input_tokens INCLUDES the cached count, so fresh input is the difference —
  // the same arithmetic engine C does, and the same trap.
  assert.deepEqual(j.usage, { input: 500, cache_write: 0, cache_read: 400, output: 70 });
  assert.equal(j.cost_usd, null);

  // THE CAPABILITY GAP, ON THE RECORD. This engine asks; engine `api` enforces.
  assert.equal(j.fence.paths, false);
  assert.equal(j.fence.declared_files, false);
  assert.match(j.fence.note, /INSTRUCTION, which is advice, not enforcement/);
  assert.match(j.privacy.summary, /composes no request body/);

  // The gitignored work directory is CLEANED UP, and the ignore line is there
  // so a crashed run leaves an ignored file rather than a staged one.
  assert.ok(!fs.existsSync(path.join(p.root, ".orc-extra")));
  assert.match(fs.readFileSync(path.join(p.root, ".gitignore"), "utf8"), /\.orc-extra\//);
});

test("engine B / opencode: the MESSAGE survives the greedy -f, and comes first in argv", () => {
  // v0.52.0 REGRESSION. `opencode run` is `run [message..]` with
  // `-f, --file [array]`, and a yargs array is GREEDY: every following non-flag
  // token is swallowed as another file path. ORC pushed the message LAST, so it
  // was parsed as a SECOND FILE, `message..` arrived empty, and opencode exited
  // 1 in its own parser — dur=0m01s, tok=none, outcome=failed, looking exactly
  // like a model problem. Engine `cli` on opencode was 100% dead for a release.
  const p = project();
  armedCli(p, "opencode");
  const r = dispatch(p, "opencode", "ok");
  assert.ok(!r.stderr.includes("ORC-CONTRACT:"), "the child reported a broken contract: " + r.stderr);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.outcome, "done");

  const msg = j.argv.findIndex((x) => /whole brief/.test(x));
  const f = j.argv.indexOf("-f");
  assert.ok(msg !== -1, "the message must be in argv — it is ORC's own fixed text, not the slice");
  assert.ok(f !== -1, "the task file must still be attached with -f");
  // The ORDER is the fix: the message ahead of the array flag, and the array
  // flag at the very end where it has nothing left to eat.
  assert.ok(msg < f, "the message must come BEFORE -f or the greedy array swallows it");
  assert.equal(f, j.argv.length - 2, "-f <file> must be the LAST pair in argv");
});

test("engine B: a tool that reports no tokens gets usage NULL, never four zeros", () => {
  const p = project();
  armedCli(p, "opencode");
  const j = json(dispatch(p, "opencode", "nousage"));
  assert.equal(j.outcome, "done");
  assert.equal(j.usage, null, '"did not report" and "reported zero" are different facts');
  assert.match(j.usage_note, /NO vector — not a zero one/);
  // W8 — and the trace says `tok=none`, not `tok=0/0/0/0`. `orc extra stats`
  // reads that word and refuses to sum it as a zero, which is the only reason
  // an unknown cost cannot masquerade as a free one.
  assert.match(j.trace_line, /tok=none /);
});

test("engine B: exit 0 is still not success — a structured `blocked` is a failure", () => {
  const p = project();
  armedCli(p, "opencode");
  const r = dispatch(p, "opencode", "blocked");
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.exit_code, 0, "the tool exited 0 and had still not done the work");
  assert.equal(j.outcome, "failed");
  assert.equal(j.structured_output.status, "blocked");
  // P6 — a failed foreign dispatch is never a dead run, and the pre-composed
  // fallback line is handed to the caller so the two wordings cannot diverge.
  assert.ok(j.fallback_to && j.fallback_to.agent);
  assert.ok(j.trace_extras.some((x) => x.startsWith("EXTRA fallback task=T1 ::")));
});

test("engine B: a structured `partial` is PARTIAL, and exit 4 says so", () => {
  const p = project();
  armedCli(p, "opencode");
  const r = dispatch(p, "opencode", "partial");
  assert.equal(r.status, 4);
  assert.equal(json(r).outcome, "partial");
});

test("engine B: exit 0 with nothing parseable is malformed-return, and retryable", () => {
  const p = project();
  armedCli(p, "opencode");
  const j = json(dispatch(p, "opencode", "silent"));
  assert.equal(j.reason, "malformed-return");
  assert.equal(j.retry, true);
});

test("engine B: a 401 on stderr is classified, and NOT retried", () => {
  const p = project();
  armedCli(p, "opencode");
  const j = json(dispatch(p, "opencode", "authfail"));
  assert.equal(j.reason, "authentication_failed");
  assert.equal(j.retry, false);
  // Neither tool documents an exit-code table, so ORC says what it classified
  // FROM rather than implying a mapping it does not have.
  assert.match(j.classified_from, /stderr pattern/);
});

test("engine B / codex: --output-schema carries ORC's contract, and the vector is read by name", () => {
  const p = project();
  armedCli(p, "codex", { model: "fake-codex-model" });
  const r = dispatch(p, "codex", "ok");
  assert.ok(!r.stderr.includes("ORC-CONTRACT:"), "the child reported a broken contract: " + r.stderr);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.adapter, "codex");
  assert.equal(j.structured_output_ok, true);
  assert.equal(j.structured_output.status, "done");
  // The DOCUMENTED shape is read by name, not dug for — a dig would silently
  // accept the wrong field the day the shape changes.
  assert.equal(j.usage_note, "token counts read from the tool's own `turn.completed.usage` field");
  // v0.53.0 — FOUR numbers. codex DOES report `cache_write_input_tokens`
  // (observed live on codex-cli 0.149.0); the adapter used to declare three
  // kinds, so a real measurement was thrown away and then reported as never
  // measured. `reasoning_output_tokens` is emitted too and is deliberately NOT
  // added to `output` — the Responses API counts it inside `output_tokens`, so
  // reading it would double-count and over-price every codex run.
  assert.deepEqual(j.usage, { input: 500, cache_write: 640, cache_read: 1500, output: 210 });
  assert.equal(j.model_reported, "fake-codex-model");
  // The default sandbox is READ-ONLY; without workspace-write the worker cannot
  // edit and the run looks like a model that refused to work.
  assert.ok(j.argv.includes("--sandbox") && j.argv.includes("workspace-write"));
  assert.ok(j.argv.includes("--ephemeral"));
});

test("engine B / codex: the schema codex is handed is one OpenAI would accept", () => {
  // The regression that cost a release. `additionalProperties: true` is an HTTP
  // 400 raised before the model is reached; flipping only that flag is a SECOND
  // 400 naming `files_changed`. The fake now enforces both rules from the
  // child's side, so this reads the file ORC actually wrote.
  const p = project();
  armedCli(p, "codex", { model: "fake-codex-model" });
  const r = dispatch(p, "codex", "ok");
  assert.ok(!r.stderr.includes("ORC-CONTRACT:"), "the child reported a broken contract: " + r.stderr);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // And the shape itself, read straight off the constant the dispatch writes.
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "bin", "cli.js"), "utf8");
  const m = /const EXTRA_CLI_RETURN_SCHEMA = (\{[\s\S]*?\n\};)/.exec(src);
  assert.ok(m, "EXTRA_CLI_RETURN_SCHEMA not found");
  // eslint-disable-next-line no-eval
  const schema = eval("(" + m[1].replace(/;\s*$/, "") + ")");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    Object.keys(schema.properties).filter((k) => schema.required.indexOf(k) === -1),
    [],
    "structured outputs require `required` to list EVERY key in `properties`"
  );
  // An optional field is a NULLABLE UNION, never an omission from `required`.
  assert.deepEqual(schema.properties.files_changed.type, ["array", "null"]);
  assert.deepEqual(schema.properties.notes.type, ["string", "null"]);
});

test("engine B / codex: the upstream error object classifies the failure, not the stderr string", () => {
  // The exact live failure: codex relays the provider's own
  // `invalid_request_error` in its event stream on STDOUT while printing the
  // benign `Reading additional input from stdin...` on STDERR. Nothing in the
  // stderr patterns matches that, so the old classifier said `unknown` about a
  // failure ORC has a precise bucket for — and reached `retry: false` by luck.
  const p = project();
  armedCli(p, "codex", { model: "fake-codex-model" });
  const r = dispatch(p, "codex", "apireject");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const j = json(r);
  assert.equal(j.reason, "invalid_request");
  assert.equal(j.retry, false);
  // A field that says where a verdict came from must not lie about it.
  assert.match(j.classified_from, /the provider's own error object/);
  assert.doesNotMatch(j.classified_from, /stderr pattern/);
  // And the message a human reads is the provider's, not the benign notice.
  assert.match(j.error, /codex_output_schema/);
});

test("engine B / codex: wire_api = \"chat\" is a REFUSAL before the binary is spawned", () => {
  const p = project();
  armedCli(p, "codex", { model: "fake-codex-model", base: "https://provider.test/v1" });
  fs.writeFileSync(
    path.join(p.home, ".codex", "config.toml"),
    '[model_providers.x]\nname = "x"\nbase_url = "https://provider.test/v1"\nwire_api = "chat"\n'
  );
  const r = dispatch(p, "codex", "ok");
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.reason, "invalid_request");
  // The trap, named: OpenAI removed chat/completions in February 2026 and codex
  // now fails at STARTUP on that row, so this would have died mid-wave.
  assert.match(j.error, /February 2026/);
  assert.match(j.error, /FAILS AT STARTUP/);
  // A refusal that does not say what would make it a yes is half an answer.
  assert.match(j.remedy, /wire_api = "responses"/);
  assert.match(j.remedy, /\[model_providers\./);
});

test("engine B / codex: a missing model_providers WARNS and still runs", () => {
  const p = project();
  armedCli(p, "codex", { model: "fake-codex-model", base: "https://provider.test/v1" });
  const r = dispatch(p, "codex", "ok");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = json(r);
  assert.match(j.preflight_warning, /USER-level config only/);
  assert.match(j.preflight_remedy, /wire_api = "responses"/);
  assert.equal(j.outcome, "done", "a warning must never become a refusal — codex's built-in providers work without that key");
});

test("engine B: an unknown binary is refused at ADD time, naming what ships", () => {
  const p = project();
  const r = run(p, ["extra", "add", "z", "--provider", "custom", "--engine", "cli", "--cli", "aider", "--env-key", "K", "--json"]);
  assert.equal(r.status, 1);
  const j = json(r);
  assert.equal(j.reason, "no-adapter");
  assert.match(j.error, /opencode, codex/);
  // An adapter is a table row, and the refusal says so — the message is a
  // pointer to the fix, not a dead end.
  assert.match(j.error, /table row/);
});

test("engine B: --cli-attach is refused on a tool that has no server to join", () => {
  const p = project();
  const bad = run(p, [
    "extra", "add", "z", "--provider", "custom", "--engine", "cli",
    "--cli", "codex", "--cli-attach", "http://localhost:4096", "--env-key", "K", "--json",
  ]);
  assert.equal(bad.status, 1);
  assert.equal(json(bad).reason, "no-attach");
  assert.match(json(bad).error, /opencode/);

  // …and accepted on the one that does. `opencode serve` + `--attach` is what
  // removes cold-boot cost from every dispatch in a wave.
  const good = run(p, [
    "extra", "add", "oc", "--provider", "custom", "--engine", "cli",
    "--cli", "opencode", "--cli-attach", "http://localhost:4096", "--env-key", "K", "--json",
  ]);
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.equal(json(good).profile.cli.attach, "http://localhost:4096");
});
