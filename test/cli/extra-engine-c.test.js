"use strict";
// @test-pool net  — stands up the fake provider on loopback
// `orc extra` — ENGINE C (`api`), ORC's own tool loop.
//
// Engine C exists for two things engine A structurally cannot do, and both are
// asserted here rather than described: it COMPOSES THE REQUEST BODY (so a
// routing policy is enforced, F6) and it SEES the response's `provider` echo
// (so a provider-level reroute that preserves the model id is visible, U4).
//
// The rest of this file is the fence and the caps. Every assertion is about a
// rule that is cheap to state and expensive to discover live:
//
//   · a read outside the repository root is REFUSED, not just a write
//   · a write outside declared_files is REFUSED — the conflict graph is what
//     makes a parallel wave safe, and a stray write invalidates the wave
//   · prompt_tokens INCLUDES cached tokens, so fresh input is the difference
//   · every cap answers PARTIAL, never `done` — a `done` with nothing in the
//     tree would sail through the smoke gate downstream
//   · a clean finish that wrote nothing is ALSO partial (`empty-diff`)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tmpdir, cli } = require("../_helpers.js");
const { start: fakeProvider } = require("./_fake-provider.js");

const SECRET_KEY = "sk-live-PLANTEDSECRET0123456789";

function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "// the original helper\n");
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, a, env) => cli([...a, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);

// A verified profile on engine `api`, one route row, master gate on. Returns
// the fake provider handle so the caller can stop it when it is done — engine C
// talks to it for the WHOLE dispatch, unlike engine A which only needs it up.
async function armedApi(p, mode, opts) {
  const o = opts || {};
  const f = await fakeProvider(mode || "chat");
  const base = `http://127.0.0.1:${f.port}`;
  const add = ["extra", "add", "ds", "--provider", o.provider || "custom", "--engine", "api", "--base-url", base, "--env-key", "K"];
  assert.equal(run(p, add).status, 0);
  const ping = run(p, ["extra", "ping", "ds", "--json"], { K: SECRET_KEY });
  assert.equal(ping.status, 0, "fixture must verify: " + ping.stdout + ping.stderr);
  const set = ["extra", "route", "set", "0-30", "ds/fake-flash", "--json"];
  if (o.maxTurns) set.push("--max-turns", String(o.maxTurns));
  assert.equal(run(p, set).status, 0);
  fs.writeFileSync(
    path.join(p.root, ".claude", "orc.config.yaml"),
    "extra_enabled: true\nextra_roles: [executor]\n" + (o.cfg || "")
  );
  return f;
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
          prompt: "Rename the helper in src/a.js.",
          standing_rules: "# ORC standing rules\nReturn the contract.\n",
          declared_files: ["src/a.js"],
        },
        over || {}
      )
    )
  );
  return file;
}
const dispatch = (p, over) => run(p, ["extra", "dispatch", "--task", slice(p, over), "--json"], { K: SECRET_KEY });

test("engine C: the loop runs a tool, writes a declared file and reports done", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    const r = dispatch(p);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const j = json(r);
    assert.equal(j.engine, "api");
    assert.equal(j.outcome, "done");
    assert.equal(j.format, "chat-completions");
    assert.equal(j.via, "extra:ds");
    // Zero dependencies is the other half of this engine's reason to exist:
    // no `claude` on PATH, no third-party CLI. Nothing was spawned to talk.
    assert.deepEqual(j.files_written, ["src/a.js"]);
    assert.match(fs.readFileSync(path.join(p.root, "src", "a.js"), "utf8"), /rewritten by the fake worker/);
    // Bash IS run, and every command is recorded verbatim — the honest promise
    // in place of a sandbox the CLI cannot actually provide.
    assert.equal(j.bash_calls.length, 1);
    assert.equal(j.bash_calls[0].command, "echo built");

    // The four kinds, accumulated across THREE turns and never blended.
    // prompt_tokens is 1000 with 600 cached per turn, so fresh input is 400.
    assert.deepEqual(j.usage, { input: 1200, cache_write: 0, cache_read: 1800, output: 360 });
    assert.equal(j.reasoning_tokens, 120);
    assert.match(j.cache_note, /ZERO IS A MEASUREMENT/);

    // P9 — no cost figure ORC did not price itself, on any engine.
    assert.equal(j.cost_usd, null);
    assert.equal(j.model_requested, "fake-flash");
    assert.equal(j.model_reported, "fake-flash");

    // The key never appears in the output, on any path.
    assert.ok(!r.stdout.includes(SECRET_KEY) && !r.stderr.includes(SECRET_KEY));

    // W8 — the EXTRA line is composed HERE and copied verbatim by the lane (the
    // `orc challenge record` precedent). It is also PRINTED, because the
    // orchestrator reads the human output too and a line it has to retype is a
    // line it will retype differently.
    assert.match(j.trace_line, /^EXTRA ds\/fake-flash engine=api task=T1 band=\S+ tok=1200\/0\/1800\/360 outcome=done dur=\d+m\d\ds$/);
    assert.ok(r.stdout.includes(j.trace_line));
    assert.deepEqual(j.trace_extras, [], "no substitution, no reroute, no fallback — so none of those lines exist");
  } finally {
    f.stop();
  }
});

test("engine C: the fence refuses a READ outside the root, and the run recovers", async () => {
  const p = project();
  const f = await armedApi(p, "chat-esc");
  try {
    const r = dispatch(p);
    const j = json(r);
    // A refusal is a tool RESULT, not a torn-down run: the worker read it and
    // stopped. Reading outside the root is the leak — the write is not the
    // only way source escapes.
    const fenceHit = j.tool_calls.find((c) => c.name === "Read");
    assert.equal(fenceHit.ok, false);
    assert.equal(fenceHit.error, "fence");
    assert.deepEqual(j.files_written, []);
    // Nothing was written and files were declared, so this is honestly PARTIAL.
    assert.equal(j.outcome, "partial");
    assert.equal(j.reason, "empty-diff");
  } finally {
    f.stop();
  }
});

test("engine C: a write outside declared_files is refused BY NAME", async () => {
  const p = project();
  const f = await armedApi(p, "chat-undec");
  try {
    const j = json(dispatch(p));
    const hit = j.tool_calls.find((c) => c.name === "Write");
    assert.equal(hit.ok, false);
    assert.equal(hit.error, "undeclared");
    assert.ok(!fs.existsSync(path.join(p.root, "src", "NOT-DECLARED.js")));
    assert.deepEqual(j.files_written, []);
  } finally {
    f.stop();
  }
});

test("engine C: the turn cap answers PARTIAL, never done", async () => {
  const p = project();
  const f = await armedApi(p, "chat-loop", { maxTurns: 3 });
  try {
    const r = dispatch(p);
    // exit 4 is partial — the caller must be able to tell "unfinished with work
    // in the tree" from "failed" without parsing prose.
    assert.equal(r.status, 4);
    const j = json(r);
    assert.equal(j.outcome, "partial");
    assert.equal(j.reason, "max-turns");
    assert.equal(j.max_turns, 3);
    assert.equal(j.turns, 3);
    assert.match(j.error, /nothing was written/);
  } finally {
    f.stop();
  }
});

test("engine C: a clean finish that wrote nothing is PARTIAL, not done", async () => {
  const p = project();
  const f = await armedApi(p, "chat-nowr");
  try {
    const r = dispatch(p);
    assert.equal(r.status, 4);
    const j = json(r);
    assert.equal(j.reason, "empty-diff");
    // The exact confusion this guards against: the worker's own words say it
    // finished. That is not evidence the work happened.
    assert.match(j.error, /different facts/);
    assert.match(j.text, /nothing needed changing/);
  } finally {
    f.stop();
  }
});

test("engine C: the provider echo makes a REROUTE visible (U4)", async () => {
  const p = project();
  const f = await armedApi(p, "chat-route");
  try {
    const j = json(dispatch(p));
    // The model id was honoured on every turn — a model check reads CLEAN.
    assert.equal(j.model_reported, j.model_requested);
    // …and the code still went to two different companies.
    assert.deepEqual(j.served_by, ["FakeProviderCo", "SomeoneElseInc"]);
    assert.equal(j.reroute, true);
    assert.match(j.reroute_note, /PRESERVES the model id/);
    // …and it reaches the trace as its own continuation line, because a
    // reroute is a different fact from a failure and `/orc-retro` counts them
    // separately.
    assert.ok(j.trace_extras.some((x) => /^EXTRA reroute task=T1 :: FakeProviderCo,SomeoneElseInc$/.test(x)));
  } finally {
    f.stop();
  }
});

test("engine C: the privacy block is COMPOSED INTO THE BODY (F6)", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    // Default is NO policy, and it says so rather than reading as clean.
    const before = json(dispatch(p));
    assert.equal(before.privacy.applied, null);
    assert.match(before.privacy.summary, /allow_fallbacks is ON/);

    const set = run(p, ["extra", "privacy", "ds", "--zdr", "on", "--data-collection", "deny", "--require-parameters", "on", "--json"]);
    assert.equal(set.status, 0, set.stdout + set.stderr);
    assert.deepEqual(json(set).block, { zdr: true, data_collection: "deny", require_parameters: true });

    const after = json(dispatch(p));
    assert.deepEqual(after.privacy.applied, { zdr: true, data_collection: "deny", require_parameters: true });
    // The fixture echoes the body's `provider` field back in its final message,
    // so this proves the block was ON THE WIRE and not merely stored.
    assert.match(after.text, /"zdr":true/);
    assert.match(after.text, /"data_collection":"deny"/);
  } finally {
    f.stop();
  }
});

test("engine C: a routing policy is REFUSED on claude-shim and on a provider without the block", async () => {
  const p = project();
  const f = await fakeProvider("models");
  try {
    const base = `http://127.0.0.1:${f.port}`;
    run(p, ["extra", "add", "sh", "--provider", "custom", "--engine", "claude-shim", "--anthropic-base-url", base, "--env-key", "K"]);
    const shim = run(p, ["extra", "privacy", "sh", "--zdr", "on", "--json"]);
    assert.equal(shim.status, 1);
    // The asymmetry is NAMED. Storing a policy engine A would silently drop
    // would make engine A look safer than it is.
    assert.equal(json(shim).reason, "not-applicable");
    assert.match(json(shim).error, /headers, not body fields/);

    run(p, ["extra", "add", "dk", "--provider", "deepseek", "--engine", "api", "--env-key", "K"]);
    const nope = run(p, ["extra", "privacy", "dk", "--zdr", "on", "--json"]);
    assert.equal(nope.status, 1);
    assert.equal(json(nope).reason, "provider-unsupported");
    assert.match(json(nope).error, /400 in the middle of a wave/);
  } finally {
    f.stop();
  }
});

test("engine C: a 429 is retried inside the turn; a model complaint is not retried at all", async () => {
  const p = project();
  const f = await armedApi(p, "chat-429");
  try {
    const j = json(dispatch(p));
    assert.equal(j.outcome, "done");
    // Two 429s were recorded and then it worked — the retries are evidence,
    // not a swallowed detail.
    assert.equal(j.api_retries.filter((x) => x.error === "rate_limit").length, 2);
    f.stop();

    const p2 = project();
    const f2 = await armedApi(p2, "chat-400");
    try {
      const r = dispatch(p2);
      assert.equal(r.status, 1);
      const k = json(r);
      assert.equal(k.reason, "model_not_found");
      assert.equal(k.retry, false, "retrying a model id the endpoint does not serve cannot help");
      // P6 — a failed foreign dispatch is never a dead run: the Claude agent
      // this task would have had comes back with the failure, no second lookup.
      assert.ok(k.fallback_to && k.fallback_to.agent);
    } finally {
      f2.stop();
    }
  } finally {
    f.stop();
  }
});

test("engine C: an unimplemented tool is refused at dispatch, before a token is spent", async () => {
  const p = project();
  const f = await armedApi(p, "chat");
  try {
    const r = dispatch(p, { allowed_tools: ["Read", "WebFetch"] });
    assert.equal(r.status, 1);
    const j = json(r);
    assert.equal(j.reason, "invalid_request");
    assert.match(j.error, /WebFetch/);
    // Engine C runs the tools itself rather than borrowing a harness, so its
    // set is the six it implements — and it says which six.
    assert.match(j.error, /Read, Write, Edit, Glob, Grep, Bash/);
  } finally {
    f.stop();
  }
});

test("engine C: the completions URL is derived from the base, and overridable", async () => {
  const p = project();
  const f = await fakeProvider("models");
  try {
    // A base with no version segment wants /v1/chat/completions…
    run(p, ["extra", "add", "a", "--provider", "custom", "--engine", "api", "--base-url", "https://x.test", "--env-key", "K"]);
    // …and one that already carries it must not get a second copy.
    run(p, ["extra", "add", "b", "--provider", "custom", "--engine", "api", "--base-url", "https://y.test/api/v1", "--env-key", "K"]);
    run(p, ["extra", "add", "c", "--provider", "custom", "--engine", "api", "--base-url", "https://z.test", "--completions-path", "/openai/v1/chat/completions", "--env-key", "K"]);
    const show = (n) => json(run(p, ["extra", "show", n, "--json"])).profile;
    assert.equal(show("a").completions_path, null);
    assert.equal(show("c").completions_path, "/openai/v1/chat/completions");
    assert.equal(show("b").base_url, "https://y.test/api/v1");
  } finally {
    f.stop();
  }
});
