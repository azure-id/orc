"use strict";
// @test-pool pure  — a fixture the CHILD runs; registers zero tests here
// A stand-in `claude` for the `orc extra` engine-A tests.
//
// `node --test test/` DOES execute this file — it runs every .js under test/ as
// a test file — which is why it exits clean when it is handed no arguments.
//
// Engine A spawns a NESTED `claude` against a foreign base URL. Testing that
// against a real one would need a key, a network and a few cents per assertion,
// and would still not let us reproduce the failures that matter — a shim that
// mangles tool blocks, a 401 arriving as a normal result, a turn cap. So this
// binary emulates the documented surface instead, and every scenario it can be
// asked for maps to one row of the failure taxonomy the engine classifies.
//
// It also ASSERTS the contract from the child's side, which is the half a
// parent-side test cannot see: --bare present (P8), no secret in argv (P2),
// the six model variables set (F2), the F4 mitigation flags set, the prompt
// arriving on STDIN and the standing rules arriving as a FILE (R3). A run that
// breaks any of those exits 90 with `ORC-CONTRACT:` on stderr, so the test
// failure names the rule rather than a symptom.
//
// Scenario comes from ORC_FAKE_CLAUDE_MODE:
//   ok            a clean run with a tool round trip and a usage vector
//   maxturns      is_error + error_max_turns  → the engine must call it PARTIAL
//   authfail      an in-run 401 printed AS THE RESULT with exit 0 (F3)
//   ratelimit     system/api_retry error=rate_limit, then a failed result
//   nostream      refuses --output-format stream-json → the engine degrades
//   nocache       a clean run whose usage reports cache_read 0 (a MEASUREMENT)
//   garbage       prints prose, never a result object → malformed-return
//   picky         a WEAK shim: 400s whenever a mitigation flag is turned off,
//                 which is how the conformance matrix's FALSE arm gets tested
const fs = require("fs");

const argv = process.argv.slice(2);
const MODE = process.env.ORC_FAKE_CLAUDE_MODE || "ok";

// `node --test test/` executes EVERY .js file under test/ as a test file, this
// one included. With no arguments it is not being used as a `claude`, it is
// being enumerated — so do nothing and exit clean. Without this the runner
// reports a hard failure from the --bare assertion below, which is a true
// statement about a call nobody made.
if (!argv.length) process.exit(0);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i === -1 ? null : argv[i + 1];
};

function breach(rule) {
  process.stderr.write(`ORC-CONTRACT: ${rule}\n`);
  process.exit(90);
}

// P8 — a nested claude that inherits ORC's own hooks has broken the contract.
if (!has("--bare")) breach("--bare missing: the child would load ORC's hooks, skills and CLAUDE.md");
if (!has("-p")) breach("-p missing: this is meant to be a headless run");

// P2 / R3 — no secret in argv, ever. argv is world-readable in a process list.
for (const a of argv)
  if (/sk-[A-Za-z0-9_-]{8,}|PLANTEDSECRET/.test(a)) breach("a credential appeared in argv");

// R3 — the standing rules arrive as a FILE and the prompt on STDIN, so argv
// stays far under Windows' 32,767-character command-line cap.
const rulesFile = val("--append-system-prompt-file");
if (!rulesFile) breach("--append-system-prompt-file missing: standing rules must not travel in argv");
if (!fs.existsSync(rulesFile)) breach("--append-system-prompt-file points at a file that does not exist");
let prompt = "";
try {
  prompt = fs.readFileSync(0, "utf8");
} catch (_) {}
if (!prompt.trim()) breach("the prompt did not arrive on stdin");

// F2 — six model variables, not one. Claude Code makes background calls on the
// `haiku` alias, so a missing one is a 404 in the middle of a wave.
for (const v of [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
])
  if (!process.env[v]) breach(`${v} is not set`);

// F4 — the mitigations. The assertion is that the engine SETS them, not that
// it sets them to 1: the conformance probe deliberately sends "0" to find out
// whether this endpoint actually needs the flag, and a stub that refused that
// would make "the endpoint rejected it" and "my fixture refused" the same
// observation. Forgetting them entirely is the real bug, and that is what this
// catches.
const MITIGATIONS = ["CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING", "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"];
for (const v of MITIGATIONS) if (process.env[v] === undefined) breach(`${v} is not set at all`);

// `picky` emulates a weak shim: one that 400s on the very body fields the
// mitigations suppress. It is how the FALSE arm of the conformance matrix gets
// tested for the right reason instead of by accident.
if (MODE === "picky")
  for (const v of MITIGATIONS)
    if (process.env[v] === "0") {
      process.stdout.write(
        JSON.stringify({
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          model: process.env.ANTHROPIC_MODEL,
          result: "API Error: 400 Input tag 'adaptive' found using 'type' does not match any of the expected tags",
        }) + "\n"
      );
      process.exit(1);
    }

const format = val("--output-format") || "text";
const model = process.env.ANTHROPIC_MODEL;
const say = (o) => process.stdout.write(JSON.stringify(o) + "\n");

if (MODE === "nostream" && format === "stream-json") {
  process.stderr.write("error: unknown option --output-format stream-json\n");
  process.exit(1);
}
if (MODE === "garbage") {
  process.stdout.write("I have completed the task.\nLet me know if you need anything else.\n");
  process.exit(0);
}

const usage = {
  input_tokens: 1200,
  cache_creation_input_tokens: 300,
  cache_read_input_tokens: MODE === "nocache" ? 0 : 9000,
  output_tokens: 450,
};

// `total_cost_usd` is HERE ON PURPOSE. It is what the real client emits, priced
// against Anthropic's table, and P9 says ORC must ignore it on a foreign
// endpoint. A test asserts ORC never echoes this number.
const RESULT_COST = 0.4242;

function emitResult(extra) {
  const base = {
    type: "result",
    subtype: "success",
    is_error: false,
    model,
    session_id: "fake-session-0001",
    result: "done",
    usage,
    total_cost_usd: RESULT_COST,
  };
  say(Object.assign(base, extra || {}));
}

if (format === "stream-json") {
  say({ type: "system", subtype: "init", model, tools: (val("--allowedTools") || "").split(",") });
  if (MODE === "ratelimit")
    say({ type: "system", subtype: "api_retry", error: "rate_limit", attempt: 3, max_retries: 3, retry_delay_ms: 4000 });
  // A real tool round trip, so tool fidelity is MEASURED rather than assumed.
  if (MODE === "ok" || MODE === "nocache") {
    say({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "README.md" } }] } });
    say({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } });
  }
}

if (MODE === "maxturns") {
  emitResult({ subtype: "error_max_turns", is_error: true, result: "Reached max turns (3)" });
  process.exit(1); // the real client exits non-zero here — and it is PARTIAL, not failed
}
if (MODE === "authfail") {
  // F3: an in-run failure is printed AS THE RESULT, and the process still
  // exits 0. An exit-code-only check reads this as success.
  emitResult({ is_error: true, subtype: "error_during_execution", result: "API Error: 401 invalid api key" });
  process.exit(0);
}
if (MODE === "ratelimit") {
  emitResult({ is_error: true, subtype: "error_during_execution", result: "API Error: 429 rate limited" });
  process.exit(1);
}
emitResult();
process.exit(0);
