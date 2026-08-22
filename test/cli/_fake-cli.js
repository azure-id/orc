"use strict";
// A stand-in `opencode` / `codex` for the engine-B tests.
//
// It asserts ORC's half of the contract FROM THE CHILD'S SIDE and exits 90 with
// `ORC-CONTRACT: <rule>` when the parent breaks one — the `_fake-claude.js`
// pattern, and it is deliberate: a missing `--output-schema` should fail BY
// NAME, not as a puzzling downstream symptom.
//
// `node --test test/` executes EVERY .js under test/ as a test file, so the
// whole body is gated on being invoked with real arguments. A fixture that did
// something on load became a hard fake failure once already.
//
// Which tool it pretends to be comes from argv[2] (`run` → opencode,
// `exec` → codex). Behaviour comes from ORC_FAKE_CLI_MODE:
//   ok        the happy path
//   nousage   opencode with NO token counts anywhere → usage must be null
//   partial   the structured answer says `partial`
//   blocked   the structured answer says `blocked` and the tool still exits 0
//   silent    exits 0 having said nothing parseable → malformed-return
//   authfail  exits 1 with a 401 on stderr → classified, and NOT retried
const fs = require("fs");
const path = require("path");

const ARGV = process.argv.slice(2);
const MODE = process.env.ORC_FAKE_CLI_MODE || "ok";

function die(rule) {
  process.stderr.write("ORC-CONTRACT: " + rule + "\n");
  process.exit(90);
}
const has = (f) => ARGV.includes(f);
const val = (f) => {
  const i = ARGV.indexOf(f);
  return i === -1 ? null : ARGV[i + 1];
};

// ── opencode ───────────────────────────────────────────────────────────────
function opencode() {
  if (!has("--format") || val("--format") !== "json") die("opencode must be asked for --format json");
  if (!has("--auto")) die("opencode needs --auto or it blocks on a permission prompt in headless mode");
  if (!has("--model")) die("opencode needs --model provider/model");
  if (!has("--dir")) die("opencode needs --dir <repo root>");
  const f = val("-f");
  if (!f) die("the task text must be attached with -f, never pasted into argv");
  let task = "";
  try {
    task = fs.readFileSync(f, "utf8");
  } catch (_) {
    die("the -f task file does not exist: " + f);
  }
  if (!/# Task/.test(task)) die("the -f task file is not the task brief");
  // THE RULE THIS FIXTURE EXISTS FOR: the slice's prompt is not ORC's own text,
  // so it must never reach a command line — Windows caps argv at 32,767 bytes
  // and a .cmd shim goes through cmd.exe's quoting rules.
  const joined = ARGV.join(" ");
  const marker = (/^PROMPT-MARKER:(\S+)/m.exec(task) || [])[1];
  if (marker && joined.includes(marker)) die("the task prompt reached argv");
  if (/API_KEY|sk-live-/.test(joined)) die("a credential reached argv");

  if (MODE === "silent") process.exit(0);
  if (MODE === "authfail") {
    process.stderr.write("error: 401 Unauthorized: invalid api key\n");
    process.exit(1);
  }
  const status = MODE === "partial" ? "partial" : MODE === "blocked" ? "blocked" : "done";
  const answer = JSON.stringify({
    status,
    summary: "fake opencode " + status,
    files_changed: ["src/a.js"],
    unmet: [],
    notes: "",
  });
  const lines = [{ type: "session.start", model: val("--model") }];
  if (MODE !== "nousage")
    lines.push({ type: "message.part", usage: { input_tokens: 900, cached_input_tokens: 400, output_tokens: 70 } });
  lines.push({ type: "message.done", text: answer });
  process.stdout.write(lines.map((x) => JSON.stringify(x)).join("\n") + "\n");
  process.exit(0);
}

// ── codex ──────────────────────────────────────────────────────────────────
function codex() {
  if (!has("--json")) die("codex exec must be asked for --json or there is no token vector to read");
  if (val("--sandbox") !== "workspace-write") die("codex exec defaults to READ-ONLY; workspace-write is required to edit");
  if (!has("--ephemeral")) die("codex exec needs --ephemeral or session state accumulates between dispatches");
  const sf = val("--output-schema");
  if (!sf) die("codex exec needs --output-schema — that is how a foreign worker returns ORC's contract instead of prose");
  let schema = null;
  try {
    schema = JSON.parse(fs.readFileSync(sf, "utf8"));
  } catch (_) {
    die("the --output-schema file is missing or not JSON: " + sf);
  }
  if (!schema.properties || !schema.properties.status) die("the --output-schema does not describe ORC's return");
  const om = val("--output-last-message");
  if (!om) die("codex exec needs --output-last-message so the final answer is read from a file, not scraped");
  const joined = ARGV.join(" ");
  if (/API_KEY|sk-live-/.test(joined)) die("a credential reached argv");
  if (!process.env.CODEX_API_KEY) die("CODEX_API_KEY must be in the child's env, not in its argv");

  if (MODE === "silent") {
    process.stdout.write("\n");
    process.exit(0);
  }
  if (MODE === "authfail") {
    process.stderr.write("stream error: unexpected status 401 Unauthorized\n");
    process.exit(1);
  }
  const status = MODE === "partial" ? "partial" : MODE === "blocked" ? "blocked" : "done";
  const answer = JSON.stringify({ status, summary: "fake codex " + status, files_changed: ["src/a.js"], unmet: [], notes: "" });
  try {
    fs.mkdirSync(path.dirname(om), { recursive: true });
    fs.writeFileSync(om, answer, "utf8");
  } catch (_) {}
  const ev = [
    { type: "thread.started", thread_id: "t1" },
    { type: "turn.started" },
    { type: "item.completed", item: { type: "file_change" } },
    {
      type: "turn.completed",
      usage: { input_tokens: 2000, cached_input_tokens: 1500, output_tokens: 210 },
      model: "fake-codex-model",
    },
  ];
  process.stdout.write(ev.map((x) => JSON.stringify(x)).join("\n") + "\n");
  process.exit(0);
}

// Inert with no arguments — see the header. This is the load-bearing half.
if (require.main === module && ARGV.length) {
  if (ARGV[0] === "run") opencode();
  else if (ARGV[0] === "exec") codex();
  else die("unexpected first argument: " + ARGV[0]);
}
