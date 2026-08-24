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
//   apireject codex relays the upstream API's own 400 in its event stream while
//             printing something benign on STDERR → the classification must
//             come from the PROVIDER'S ERROR OBJECT, not from the stderr string
//   slow      prints one real event and then blocks past the dispatch wall
//             clock → the timeout must leave those bytes ON DISK (v0.54.0)
//
// v0.51.0 — it also answers the FREE RUNGS of the connection ladder, because
// "the binary exists" was never evidence of anything and the ladder is what
// replaced it:
//   --version      → rung 1 (cli-bin), and the version is what picks the
//                    permission flag, so ORC_FAKE_CLI_VERSION can make this
//                    build TOO OLD
//   auth list      → rung 2 (cli-auth);  ORC_FAKE_CLI_MODE=noauth says no
//   models         → rung 3 (cli-models); ORC_FAKE_CLI_MODE=nomodels says none
// A run with the OLD permission flag prints the tool's own HELP TEXT and exits
// 1 — which is the real failure mode ORC must classify as a FLAG problem and
// never as a model problem.
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
// v0.52.0 — this fixture now parses argv THE WAY YARGS DOES, because the old
// flag-spotting checks (`--format` present, `--model` present, `-f` followed by
// a path) were all green while the dispatch was 100% dead. `opencode run` is
// `run [message..]` with `-f, --file [array]`, and a yargs array is GREEDY: it
// swallows every following non-flag token. With the message pushed LAST it was
// parsed as a SECOND FILE, `message..` arrived empty, and opencode exited 1
// before any network call. Nothing in this file noticed, so the assertion that
// matters is: A MESSAGE ARRIVED.
const OPENCODE_VALUE_FLAGS = ["--model", "--format", "--dir", "--agent", "--attach"];
function opencodeParse() {
  const message = [];
  const files = [];
  let i = 1; // ARGV[0] === "run"
  while (i < ARGV.length) {
    const tok = ARGV[i];
    if (tok === "-f" || tok === "--file") {
      i++;
      // THE GREED: every non-flag token from here is another file path.
      while (i < ARGV.length && !/^-/.test(ARGV[i])) files.push(ARGV[i++]);
      continue;
    }
    if (OPENCODE_VALUE_FLAGS.indexOf(tok) !== -1) {
      i += 2;
      continue;
    }
    if (/^-/.test(tok)) {
      i++;
      continue;
    }
    message.push(tok);
    i++;
  }
  return { message, files };
}

function opencode() {
  if (!has("--format") || val("--format") !== "json") die("opencode must be asked for --format json");
  // v0.51.0 — `--auto` was REMOVED and replaced by
  // `--dangerously-skip-permissions`, and this tool's argument parser is STRICT:
  // an unknown flag prints the help text and exits 1 before any network call. So
  // every dispatch on this adapter failed for a release, and failed looking like
  // a model problem. ORC picks the flag from the PROBED VERSION and takes the
  // current one when the version is unknown — which is this case.
  if (!has("--dangerously-skip-permissions"))
    die("opencode needs --dangerously-skip-permissions (it replaced --auto) or it blocks on a permission prompt");
  if (has("--auto")) die("--auto was removed; passing it makes this tool print its help text and exit 1");
  if (!has("--model")) die("opencode needs --model provider/model");
  if (!has("--dir")) die("opencode needs --dir <repo root>");
  const parsed = opencodeParse();
  // The one assertion this whole rewrite exists for. An empty `message..` is
  // what a greedy `-f` leaves behind, and it is indistinguishable from a model
  // problem once the process has exited.
  if (!parsed.message.length)
    die("opencode got no message: every token after -f was swallowed as a file path");
  for (const cand of parsed.files) if (!fs.existsSync(cand)) die("the -f file does not exist: " + cand);
  const f = parsed.files[0] || null;
  // v0.51.0 — the LIVE PROBE has no task file: its prompt is a fixed constant
  // ORC wrote, which is the one kind of text that may be in argv. A dispatch
  // still may not, and the check below is what proves it.
  if (!f && has("--dir") && parsed.message.join(" ") === "Reply with exactly: OK") {
    process.stdout.write(
      JSON.stringify({ type: "message.done", text: "OK", tokens: { input: 15649, output: 48, cache: { write: 0, read: 64 } } }) + "\n"
    );
    process.exit(0);
  }
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

  // v0.54.0 — THE WALL-CLOCK CASE. It prints a real event FIRST and then blocks
  // past the dispatch timeout, so the parent's kill lands on a child that has
  // already produced bytes. That is the whole assertion: a timeout must leave a
  // position on disk, not an empty failure. `fs.writeSync(1, …)` rather than
  // process.stdout.write, because fd 1 is a FILE the parent redirected and the
  // bytes have to be there before the kill, not after a flush that never comes.
  //
  // Atomics.wait blocks with no CPU and no JS handler, so the parent's SIGTERM
  // takes the DEFAULT action and ends this process — a busy loop would peg a
  // core for the whole timeout.
  if (MODE === "slow") {
    fs.writeSync(1, JSON.stringify({ type: "session.start", model: val("--model") }) + "\n");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 45000);
    process.exit(0);
  }
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
  // v0.53.0 — AND IT MUST BE A SCHEMA THE REAL PROVIDER WOULD ACCEPT. The two
  // checks above are the whole reason engine `cli` on codex was 100% dead for a
  // release while this suite was green: they assert the schema EXISTS and
  // MENTIONS status, and model not one of OpenAI's structured-output rules. A
  // fake that is more permissive than the provider does not test the adapter,
  // it certifies it. So the two rules that produced two consecutive HTTP 400s
  // are enforced here, from the child's side, BY NAME.
  const badSchema = (node, where) => {
    if (!node || typeof node !== "object") return;
    const types = [].concat(node.type || []);
    if (types.indexOf("object") !== -1 || node.properties) {
      if (node.additionalProperties !== false)
        die("structured outputs require `additionalProperties: false` on every object — " + where + " does not set it");
      const props = Object.keys(node.properties || {});
      const req = [].concat(node.required || []);
      const missing = props.filter((k) => req.indexOf(k) === -1);
      if (missing.length)
        die(
          "structured outputs require `required` to list EVERY key in `properties` — " +
            where +
            " is missing " +
            missing.map((k) => "'" + k + "'").join(", ") +
            ". An optional field is a nullable union, not an omission from required"
        );
      for (const k of props) badSchema(node.properties[k], where + "." + k);
    }
    if (node.items) badSchema(node.items, where + "[]");
  };
  badSchema(schema, "the root object");
  const om = val("--output-last-message");
  if (!om) die("codex exec needs --output-last-message so the final answer is read from a file, not scraped");
  const joined = ARGV.join(" ");
  if (/API_KEY|sk-live-/.test(joined)) die("a credential reached argv");
  if (!process.env.CODEX_API_KEY) die("CODEX_API_KEY must be in the child's env, not in its argv");
  // v0.51.0 — `-m` sets the MODEL and NOT the compute budget: `model_reasoning_effort`
  // is an independent key that otherwise falls through to this user's own config
  // and finally to `medium`. A dispatch that named only the model would run at
  // an effort ORC never chose — a SILENT DOWNGRADE, the exact failure class the
  // `expect=<model>/<effort>` trace design exists to catch.
  const eff = ARGV.filter((x, i) => ARGV[i - 1] === "-c").find((x) => /^model_reasoning_effort=/.test(x));
  if (!eff) die("codex exec needs -c model_reasoning_effort=\"<effort>\" — the model alone does not set the compute budget");

  if (MODE === "silent") {
    process.stdout.write("\n");
    process.exit(0);
  }
  if (MODE === "authfail") {
    process.stderr.write("stream error: unexpected status 401 Unauthorized\n");
    process.exit(1);
  }
  // The real thing, verbatim: the upstream error object on STDOUT and a benign
  // notice on STDERR. Nothing in the stderr patterns can match this, which is
  // exactly why the adapter classifies from the events first.
  if (MODE === "apireject") {
    process.stderr.write("Reading additional input from stdin...\n");
    const err = {
      error: { type: "invalid_request_error", code: "invalid_json_schema", message: "Invalid schema for response_format 'codex_output_schema'.", param: "text.format.schema" },
      status: 400,
    };
    const ev = [
      { type: "thread.started", thread_id: "t1" },
      { type: "turn.started" },
      Object.assign({ type: "error" }, err),
      { type: "turn.failed", error: err.error },
    ];
    process.stdout.write(ev.map((x) => JSON.stringify(x)).join("\n") + "\n");
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
      // v0.53.0 — FOUR numbers, not three. `cache_write_input_tokens` is
      // reported by codex-cli 0.149.0 and was observed live; the adapter used to
      // declare three kinds and threw this one away, which reported a real
      // measurement as unknown. `reasoning_output_tokens` is emitted too and is
      // deliberately NOT read — the Responses API counts it inside
      // `output_tokens`, so reading it would double-count.
      usage: { input_tokens: 2000, cached_input_tokens: 1500, cache_write_input_tokens: 640, output_tokens: 210, reasoning_output_tokens: 96 },
      model: "fake-codex-model",
    },
  ];
  process.stdout.write(ev.map((x) => JSON.stringify(x)).join("\n") + "\n");
  process.exit(0);
}

// ── the free rungs ─────────────────────────────────────────────────────────
function freeRungs() {
  if (has("--version")) {
    process.stdout.write((process.env.ORC_FAKE_CLI_VERSION || "1.17.4") + "\n");
    process.exit(0);
  }
  if (ARGV[0] === "auth" || (ARGV[0] === "login" && ARGV[1] === "status")) {
    if (MODE === "noauth") {
      process.stdout.write("not logged in\n");
      process.exit(1);
    }
    process.stdout.write("Credentials\n  fake-provider api\n");
    process.exit(0);
  }
  if (ARGV[0] === "models" || (ARGV[0] === "debug" && ARGV[1] === "models")) {
    if (MODE === "nomodels") {
      process.stdout.write("\n");
      process.exit(0);
    }
    // One `provider/model` per line — the shape a grouped dropdown is built
    // from, and the group falls out of the id's own prefix so the CLI computes
    // it and no renderer splits a string it does not own.
    process.stdout.write("fakeco/fake-flash\nfakeco/fake-pro\nfakeco-go/fake-free\n");
    process.exit(0);
  }
  return false;
}

// Inert with no arguments — see the header. This is the load-bearing half.
if (require.main === module && ARGV.length) {
  freeRungs();
  if (ARGV[0] === "run") opencode();
  else if (ARGV[0] === "exec") codex();
  else die("unexpected first argument: " + ARGV[0]);
}
