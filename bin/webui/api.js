"use strict";
/**
 * api.js — the /api router for `orc ui`.
 *
 * THE ONE ARCHITECTURAL RULE: this file never re-implements CLI logic. Every
 * endpoint spawns `node bin/cli.js <cmd> --json` and forwards the parsed
 * object. That makes UI/CLI drift structurally impossible — the UI *is* the
 * CLI — and it means every write inherits the CLI's validators, the LEGACY_KEYS
 * aliasing, the shadowing announcements and the fable5_effort frontmatter
 * rewrite for free, with zero duplicated logic.
 *
 * The alternative (requiring cli.js as a library) is off the table: cli.js ends
 * with a bare IIFE, has no require.main guard, prints and process.exit()s
 * directly, and is pinned by contract tokens with binFiles: ["bin/cli.js"].
 *
 * It also never RUNS a lane and never calls a model API. Since v0.43.4 there is
 * exactly one deliberate exception to "never spawns claude": the Experiment
 * panel can open a TERMINAL with `claude` in it and then forget about it (see
 * `launchClaude`). No model output ever flows back through this server, no
 * session is proxied, no API key is held — the panel is still not an AI client.
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const fixtures = require("./fixtures/index.js");

const CLI = path.join(__dirname, "..", "cli.js");

// A single-user localhost panel re-reads the same command several times while
// one page renders. A short TTL collapses that without ever showing stale data
// across a user action: every mutation clears the cache outright.
const READ_TTL_MS = 2500;
const chr10 = String.fromCharCode(10);
const CLI_TIMEOUT_MS = 30_000;

const cache = new Map();

function cacheKey(argv) {
  return argv.join("\u0000");
}

function clearCache() {
  cache.clear();
}

// ── running the CLI ─────────────────────────────────────────────────────────

// Several commands use a NON-ZERO exit as a normal answer, not a failure:
// `pattern status` (1 = absent, 2 = unknown key), `gotcha list` (1 = none),
// `wiki impact` (2 = delta, 3 = full), `pr stack status` (1 = not ready),
// `doctor` (1 = issues found), `resume` (1 = nothing waiting). So the exit code
// is DATA here, never an error condition — a run counts as failed only when it
// produced no parseable object.
function runCli(argv, ctx, { json = false } = {}) {
  const args = [...argv];
  if (json) args.push("--json");
  // Always target the project explicitly: the server's cwd is not a reliable
  // way to reach the same .claude the launching command resolved.
  if (ctx.projectRoot) args.push("--dir", ctx.projectRoot);
  // ORC_NO_UPDATE_CHECK exists here to protect the --json contract: most
  // commands end with `maybeNudge()`, which prints an "update available" line to
  // STDOUT and would sit beside the object this parses.
  //
  // `version` and `changelog` are the exceptions, and forcing the flag on them
  // was a real bug: neither nudges, and for both the check IS the payload — so
  // the panel asked whether an update existed with the check switched off and
  // was told `check_disabled: true` forever. A blanket env var silenced the one
  // command whose entire job is to answer that question.
  const CHECKS_UPDATES = argv[0] === "version" || argv[0] === "changelog";
  const env = { ...process.env, NO_COLOR: "1" };
  if (!CHECKS_UPDATES) env.ORC_NO_UPDATE_CHECK = "1";
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: CLI_TIMEOUT_MS,
    windowsHide: true,
    env,
  });
  const stdout = r.stdout || "";
  let data = null;
  try {
    data = JSON.parse(stdout);
  } catch (_) {}
  return {
    ok: data !== null,
    exit_code: r.status === null ? -1 : r.status,
    data,
    stderr: (r.stderr || "").trim(),
    stdout: data === null ? stdout.trim() : "",
    command: "orc " + argv.join(" "),
  };
}

// The one-line reason a read failed, in the CLI's own words. `crashed` is the
// envelope the CLI itself emits when a `--json` route throws (v0.49.2); anything
// else is a command that wrote nothing parseable at all.
function readFailReason(out) {
  const first = (out.stderr || out.stdout || "")
    .split(chr10)
    .map((l) => l.trim())
    .filter(Boolean)[0];
  const tail = first ? " \u2014 " + first : "";
  return `${out.command} produced no JSON (exit ${out.exit_code})${tail}`;
}

function readCli(argv, ctx) {
  const key = cacheKey([ctx.projectRoot || "", ...argv]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < READ_TTL_MS) return hit.value;
  const value = runCli(argv, ctx, { json: true });
  cache.set(key, { at: Date.now(), value });
  return value;
}

// ── jobs (the mutation half) ────────────────────────────────────────────────
// SINGLE-FLIGHT: one mutation at a time, process-wide. The client goes
// read-only while a job runs, so a second one is a bug, not a race to win.
// Output accumulates in memory and the client polls /api/job — which is what
// makes `orc update` and `orc upgrade` show their real output as it happens
// instead of a spinner and a verdict.

let job = null;
let jobSeq = 0;

function jobView() {
  if (!job) return { id: null, running: false };
  return {
    id: job.id,
    command: job.command,
    running: job.running,
    exit_code: job.exit_code,
    output: job.output,
    started_ms: job.started_ms,
  };
}

function startJob(argv, ctx) {
  if (job && job.running) return { error: "busy", job: jobView() };
  const args = [...argv];
  if (ctx.projectRoot) args.push("--dir", ctx.projectRoot);
  const id = ++jobSeq;
  job = {
    id,
    command: "orc " + argv.join(" "),
    running: true,
    exit_code: null,
    output: "",
    started_ms: Date.now(),
  };
  const child = spawn(process.execPath, [CLI, ...args], {
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" },
  });
  const append = (buf) => {
    job.output += buf.toString("utf8");
    // A runaway job must not grow the server's heap without bound.
    if (job.output.length > 400_000) job.output = job.output.slice(-400_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("error", (e) => {
    job.output += "\n" + String(e.message);
    job.exit_code = -1;
    job.running = false;
  });
  child.on("close", (code) => {
    job.exit_code = code === null ? -1 : code;
    job.running = false;
    clearCache(); // every panel refetches against the new truth
  });
  return { job: jobView() };
}

// ── the endpoint table ──────────────────────────────────────────────────────
// READS map a route to CLI argv. WRITES are separate and POST-only — a GET can
// never mutate, so a prefetch, a bookmark or a browser retry is always safe.

const READS = {
  "/api/version": () => ["version"],
  "/api/changelog": () => ["changelog"],
  "/api/where": () => ["where"],
  "/api/doctor": () => ["doctor"],
  "/api/config": () => ["config", "list"],
  "/api/config/profiles": () => ["config", "profile"],
  "/api/config/recommend": () => ["config", "recommend"],
  "/api/runs": (q) => ["run", "list", "--limit", String(Math.min(200, Number(q.limit) || 40))],
  "/api/run": (q) => ["run", "show", String(q.slug || "")],
  "/api/wiki": () => ["wiki", "status"],
  "/api/wiki/impact": () => ["wiki", "impact"],
  // v0.46.0. Every one is a READ with an exit-code contract, so the exit code is
  // DATA here exactly like `pattern status` and `wiki impact` above: pact 0/1/2/3,
  // boundary 0/1/2/3, handoff 0/1, budget 0/1/2/3, aftermath 0/1/2/3,
  // wiki plan 0/1/2/3, wiki debt 0/1/3, export --check 0/1.
  "/api/wiki/plan": () => ["wiki", "plan"],
  "/api/wiki/debt": () => ["wiki", "debt"],
  "/api/wiki/usage": () => ["wiki", "usage"],
  // v0.49.1 — the wiki's CONTENTS, not only its temperature. All three are
  // READS whose exit code is DATA (docs 0/1/3, show 0/2/3, coverage 0/1), and
  // `coverage` deliberately has no threshold: nothing branches on it, here or
  // anywhere else. `--body` is opt-in and one artifact at a time — the
  // /api/doc/section precedent.
  "/api/wiki/docs": () => ["wiki", "docs"],
  "/api/wiki/show": (q) => ["wiki", "show", String(q.doc || ""), ...(q.body ? ["--body"] : [])],
  "/api/wiki/coverage": () => ["wiki", "coverage"],
  // The pattern file is injected LITERALLY into every executor slice, and until
  // now nothing would show you a line of it. Same 0/1/2 contract `pattern
  // status` has had since v0.34.8.
  "/api/pattern/show": (q) => ["pattern", "show", String(q.lang || ""), ...(q.body ? ["--body"] : [])],
  "/api/gotcha/show": (q) => ["gotcha", "show", String(q.id || "")],
  "/api/gotchas/archived": () => ["gotcha", "list", "--archived"],
  // Preview-then-apply: A COUNT IS NOT CONSENT. The Apply button stays disabled
  // until this has been fetched, and it names every entry eviction would touch.
  "/api/gotcha/prune/preview": () => ["gotcha", "prune", "--dry-run"],
  "/api/pact": () => ["pact", "status"],
  "/api/boundary": (q) => (q.path ? ["boundary", "status", String(q.path)] : ["boundary", "status"]),
  "/api/handoff": () => ["handoff", "surfaces"],
  "/api/budget/rates": () => ["budget", "rates"],
  // A forecast takes a PLAN PATH. The browser sends a path the folder picker
  // produced; the server passes it straight to the CLI and never opens the file
  // itself — /api/fs/list stays a directory LISTER, and widening it to read a
  // plan would be the one change that turns this panel into a file reader.
  "/api/budget/forecast": (q) => ["budget", "forecast", String(q.plan || "")],
  "/api/budget/actual": (q) => ["budget", "actual", String(q.slug || "")],
  "/api/aftermath": (q) => (q.since ? ["aftermath", "status", "--since", String(q.since)] : ["aftermath", "status"]),
  "/api/export": () => ["export", "--check"],
  // v0.47.0 — /orc-challenge. Same shape: every one is a READ whose exit code is
  // DATA (list 0/1/3, status 0/1/2/3, diff 0/1/2/3, lint 0/1/2), and the panel
  // derives nothing from them — not the state word, not the iteration order, not
  // the pass decision, not the expected revision path.
  "/api/challenge": () => ["challenge", "list"],
  "/api/challenge/one": (q) => ["challenge", "status", String(q.slug || "")],
  "/api/challenge/show": (q) => [
    "challenge",
    "show",
    String(q.slug || ""),
    ...(q.iteration ? ["--iteration", String(q.iteration)] : []),
  ],
  "/api/challenge/diff": (q) => ["challenge", "diff", String(q.slug || "")],
  // v0.49.1 — the council. `roles` is STATIC (it works with no cycle at all),
  // and it is the ONE catalogue: the panel names no lens, no class and no
  // disposition itself, exactly as it names no flow step. `council` is 0 set /
  // 1 unset / 3 unknown, and UNSET is an ANSWER, not an error.
  "/api/challenge/roles": (q) => ["challenge", "roles", ...(q.kind ? ["--kind", String(q.kind)] : [])],
  "/api/challenge/council": (q) => ["challenge", "council", String(q.slug || "")],
  "/api/challenge/lint": (q) => [
    "challenge",
    "lint",
    String(q.path || ""),
    ...(q.template ? ["--template", String(q.template)] : []),
  ],
  // v0.48.0 — /orc-doc. Same shape again: every one is a READ whose exit code is
  // DATA (list 0, status 0/1/2, map 0/2, plan 0/1, lint 0/1/2), and the panel
  // derives nothing from them — not the section order, not a line range, not a
  // state word, not the batching, not a lint rule name. It draws what the CLI
  // computed.
  //
  // `/api/doc/section` is the ONE route that returns any of the document's
  // prose, it returns exactly ONE section, and only on an explicit Reveal click.
  // The rule this lane lives by is that nothing HOLDS the document — not that
  // the text is secret — and the panel renders it as DOM through `renderMd`,
  // never as HTML.
  "/api/doc": () => ["doc", "list"],
  "/api/doc/one": (q) => ["doc", "status", String(q.slug || "")],
  "/api/doc/show": (q) => ["doc", "show", String(q.slug || "")],
  "/api/doc/section": (q) => ["doc", "show", String(q.slug || ""), "--section", String(q.section || "")],
  "/api/doc/map": (q) => ["doc", "map", String(q.slug || "")],
  "/api/doc/lint": (q) => [
    "doc",
    "lint",
    String(q.slug || ""),
    ...(q.target ? ["--target", String(q.target)] : []),
  ],
  "/api/doc/plan": (q) => ["doc", "plan", String(q.slug || ""), "--role", String(q.role || "write")],
  "/api/doc/templates": () => ["doc", "templates"],
  "/api/doc/targets": () => ["doc", "targets"],
  // v0.48.1 — the score, the drift report and the memory surface. Every one is
  // a subprocess of the real command: the panel decides nothing about the
  // pipeline order, nothing about which drift classes exist, and nothing about
  // which journal rows are the user's own words.
  //
  // There is deliberately NO route for `orc doc log`: the SKILL records a
  // request, because the skill is what took one. A panel that could write a
  // journal entry could write one nobody said.
  // v0.49.0 — the SECTION FILES. This is the one read that works before a
  // single compile has ever run, because the files ARE the progress.
  "/api/doc/parts": (q) => ["doc", "parts", String(q.slug || "")],
  "/api/doc/next": (q) => ["doc", "next", String(q.slug || "")],
  "/api/doc/audit": (q) => ["doc", "audit", String(q.slug || "")],
  "/api/doc/journal": (q) => ["doc", "journal", String(q.slug || "")],
  "/api/doc/context": (q) => ["doc", "context", String(q.slug || "")],
  // v0.49.2 — the project's own house rules, the frozen set of one document,
  // the run map and the cost report. All four are READS; the panel decides
  // nothing about a priority, an order, a wave shape or a number.
  "/api/doc/rules": () => ["doc", "rules"],
  "/api/doc/rules/one": (q) => ["doc", "rules", String(q.slug || "")],
  "/api/doc/forecast": (q) => ["doc", "forecast", String(q.slug || "")],
  "/api/doc/cost": (q) => ["doc", "cost", String(q.slug || "")],
  "/api/patterns": () => ["pattern", "status"],
  "/api/gotchas": () => ["gotcha", "list"],
  "/api/stats": (q) => (q.since ? ["stats", "--since", String(q.since)] : ["stats"]),
  "/api/diy": () => ["diy", "show"],
  "/api/crosslink": () => ["crosslink", "list"],
  "/api/crosslink/kinds": () => ["crosslink", "kinds"],
  "/api/mocks": () => ["mock", "list"],
  "/api/mock": (q) => ["mock", "show", String(q.slug || "")],
  "/api/stack": (q) => (q.slug ? ["pr", "stack", "status", String(q.slug)] : ["pr", "stack", "status"]),
};

// v0.46.0 writes. THE LINE THIS PANEL DOES NOT CROSS: a button exists only for an
// action that costs NO model tokens. `orc pact check` runs the ledger's own cheap
// proofs (a test, a command, a grep the user wrote); `orc handoff set` edits one
// graded surface; `orc export` compiles files already on disk. Every one is
// deterministic and every one is a real CLI command.
//
// The conversational half of each lane — reconciling a promise, deciding a
// verdict, walking somebody through a change — costs model tokens, so the panel
// COPIES those commands and never runs them. A test greps this object to make
// sure no lane name ever appears inside it.
const WRITES = {
  "/api/config/set": (b) => ["config", "set", String(b.key), String(b.value)],
  "/api/config/reset": (b) => (b.key ? ["config", "reset", String(b.key)] : ["config", "reset"]),
  "/api/config/profile": (b) => ["config", "profile", String(b.name)],
  "/api/diy/set": (b) => ["diy", "set", String(b.key), String(b.value)],
  "/api/diy/compile": () => ["diy", "compile"],
  // The bootstrap the TTY composer offers as its first question, and the one
  // piece of DIY the panel had no way to reach (v0.44.0). `--force` is what
  // makes it an ANSWER rather than an error on an already-configured project:
  // `orc diy init` refuses to overwrite without it. That is destructive, so the
  // UI confirms with the preset's own diff and the exact command on screen.
  // An empty name is the wizard's "full-lane defaults" — a real invocation,
  // not a synthesised one.
  "/api/diy/preset": (b) => {
    const argv = ["diy", "init", "--force"];
    if (b.name) argv.push("--preset", String(b.name));
    return argv;
  },
  "/api/wiki/sync": () => ["wiki", "sync"],
  "/api/wiki/usage/rebuild": () => ["wiki", "usage", "--rebuild"],
  "/api/gotcha/prune": () => ["gotcha", "prune"],
  "/api/pact/check": (b) => (b.id ? ["pact", "check", String(b.id)] : ["pact", "check"]),
  "/api/pact/sync": () => ["pact", "sync"],
  // The surface id, the key and the value all come from the browser — and all
  // three are validated by the CLI, which refuses a RED surface, an unknown id,
  // a key that does not already exist, and a write at all when handoff_write is
  // false. There is no second idea of a safe edit anywhere in this panel.
  "/api/handoff/set": (b) => ["handoff", "set", String(b.id), String(b.key), String(b.value)],
  "/api/budget/calibrate": () => ["budget", "calibrate"],
  // v0.47.0. All three are FREE and deterministic, so all three get a button.
  // Running an ITERATION costs model tokens, so it is a copy-able command and
  // there is deliberately no route for it here. `accept` and `rebut` both refuse
  // without a reason — the CLI decides that, not the form.
  "/api/challenge/accept": (b) => ["challenge", "accept", String(b.slug), String(b.id), String(b.reason || "")],
  "/api/challenge/rebut": (b) => ["challenge", "rebut", String(b.slug), String(b.id), String(b.reason || "")],
  "/api/challenge/report": (b) => ["challenge", "report", String(b.slug)],
  // v0.49.1. Both are FREE and both REFUSE without a reason, so both are
  // buttons. There is deliberately NO route for `council --set`: changing the
  // roster mid-cycle is a decision with a recorded reason that the LANE takes in
  // the conversation — the same reasoning that keeps `orc doc log` and
  // `orc doc mode` off the panel. Adopting a premise needs a goals FILE, which
  // the panel must not invent, so that one stays a copy-able command too.
  "/api/challenge/premise": (b) => [
    "challenge", "premise", String(b.slug), String(b.id), "--dismiss", "--reason", String(b.reason || ""),
  ],
  "/api/challenge/opportunity": (b) => [
    "challenge", "opportunity", String(b.slug), String(b.id), b.take ? "--take" : "--drop", "--reason", String(b.reason || ""),
  ],
  // v0.48.0. `assemble` — now `compile` — is the ONE /orc-doc write that costs
  // nothing: it concatenates section files that are already on disk, in an order
  // the outline already fixed. Writing a section, checking one and editing one
  // all cost model tokens, so they are copy-able commands and there is
  // deliberately no route for any of them.
  "/api/doc/assemble": (b) => ["doc", "assemble", String(b.slug)],
  // v0.49.0. Both free, both non-destructive: `compile` rebuilds the artifact
  // from disk, and `migrate` never deletes document.md and refuses what it
  // cannot parse. `orc doc mode` deliberately has NO route — it is a USER
  // decision the skill asks (the `orc doc log` precedent).
  "/api/doc/compile": (b) => {
    const argv = ["doc", "compile", String(b.slug)];
    if (b.partial) argv.push("--partial");
    return argv;
  },
  "/api/doc/migrate": (b) => ["doc", "migrate", String(b.slug)],
  // v0.48.1. Shipping is a DECISION, so it is a write — and `--where` has no
  // default here either, because the CLI refuses without it and the panel must
  // never invent an argument the human path demands.
  "/api/doc/ship": (b) => {
    const argv = ["doc", "ship", String(b.slug), "--where", String(b.where || "")];
    if (b.note) argv.push("--note", String(b.note));
    if (b.force) argv.push("--force", "--reason", String(b.reason || ""));
    return argv;
  },
  "/api/doc/unship": (b) => ["doc", "unship", String(b.slug), "--reason", String(b.reason || "")],
  // v0.49.5 — the house-rule ledger is a PLAIN TEXT config, so the panel writes
  // it the way a text config is written: the whole file, once, from one
  // textarea. `set-all` is the only write route it needs — the per-priority
  // `set`/`add`/`clear` commands stay a CLI convenience, and `--reset` still has
  // no route because throwing away a project's standing rules is a CLI act.
  //
  // Every validator is still the CLI's. The panel has no second idea of what a
  // house rule looks like, and the argv is a plain array, so a multi-line value
  // needs no escaping and no temp file.
  "/api/doc/rules/setAll": (b) => ["doc", "rules", "set-all", "--text", String(b.text || "")],
  "/api/doc/rules/sync": (b) => ["doc", "rules", String(b.slug), "--sync"],
  // v0.49.2. Closing a run is FREE, deterministic, reversible, and it DELETES
  // NOTHING — `RESUME.md` is moved aside, not removed. The CLI refuses without a
  // reason, so the form does not have to: there is one idea of a valid close and
  // it lives in `bin/cli.js`.
  "/api/run/close": (b) => ["run", "close", String(b.slug), "--reason", String(b.reason || "")],
  "/api/run/reopen": (b) => ["run", "reopen", String(b.slug)],
  "/api/crosslink/remove": (b) => ["crosslink", "remove", String(b.name)],
  // The UI assembles no YAML. It hands the CLI the same arguments the
  // interactive prompt collects, and every rejection the user sees is the
  // CLI's own validator speaking — there is no second idea of a valid slug,
  // a valid kind or a valid edge target anywhere in this panel.
  "/api/crosslink/add": (b) => {
    const argv = ["crosslink", "add", String(b.name), String(b.repo_path), "--kinds", String(b.kinds)];
    if (b.direction) argv.push("--direction", String(b.direction));
    if (b.via) argv.push("--via", String(b.via));
    if (b.target) argv.push("--target", String(b.target));
    return argv;
  },
};

// Maintenance: the safety-critical panel. Each action is a PAIR — a read-only
// preview and the apply that the preview is consent for. The apply route can
// never be reached without the UI having fetched the preview first, and the
// exact command is part of the preview payload so it is always visible in the
// confirmation, and always typeable by hand instead.
const MAINTENANCE = {
  update: {
    apply: ["update"],
    label: "Re-copy this package's payload over the installed one",
    // `orc doctor --json` already itemises exactly what an update would change
    // (version skew, missing files, orphans) — a preview with no second engine.
    preview: ["doctor"],
  },
  prune: {
    apply: ["update", "--prune"],
    label: "Update AND delete ORC-named orphans from a pre-manifest install",
    preview: ["doctor"],
    // A count is not consent for a deletion: the UI must name every file, and
    // doctor's findings carry `paths` for exactly the two orphan findings.
    names_files: true,
  },
  fix: {
    apply: ["doctor", "--fix"],
    label: "Apply every fix orc doctor found (= update + prune + settings re-merge)",
    preview: ["doctor"],
  },
  upgrade: {
    apply: ["upgrade"],
    label: "Fetch the LATEST package from the network, then apply it",
    preview: ["version"],
    network: true,
  },
  // v0.46.0 — the portable export. It belongs on Maintenance by the v0.43.6 rule
  // (a caution routes to the panel that can CLEAR it): `export-stale` is cleared
  // by `orc export`, which is a CLI write this panel can run. Its preview is the
  // `--check` report, which names WHICH source drifted — a count of stale sources
  // would not be consent to overwrite a committed file.
  export: {
    apply: ["export"],
    label: "Recompile AGENTS.md from the wiki, patterns, PACT.md and boundary cards",
    preview: ["export", "--check"],
  },
  // ADVANCED (v0.44.0) — the one action on this panel that does not target the
  // project. Every other route pins `--dir <projectRoot>`; `--global` outranks
  // `--dir` in `resolveClaudeDir`, so this pair reaches ~/.claude and its
  // preview reports on the same place it would write.
  //
  // It is here because a stale GLOBAL install is a real failure this panel
  // already REPORTS (the persistent banner, and doctor's global-skew finding)
  // and previously could not act on — the fix was "go type it in a terminal".
  // It stays boxed off as advanced, and it is still the only global reach the
  // panel has: config is never written globally, because config does not merge
  // and a global write would silently outrank the file every panel here edits.
  "update-global": {
    apply: ["update", "--global"],
    label: "Re-copy this package's payload over the GLOBAL install in ~/.claude",
    preview: ["doctor", "--global"],
    advanced: true,
  },
};

// ── the Experiment panel ────────────────────────────────────────────────────
//
// THE BOUNDARY MOVES EXACTLY ONE STEP, AND NO FURTHER. `orc ui` still renders
// no model output, proxies no session and holds no API key — it does not become
// an AI client. What it gains is a HANDOFF: it can open a terminal, in this
// project, with `claude` running in it, and then forget about it. The spawned
// process is not a child this server manages, reads or reports on; it is the
// same detached-launch mechanism `openBrowser()` has always used.
//
// The lanes are a SERVER-SIDE catalog and the browser sends only an id. No
// string typed in a browser ever reaches a shell — the cwd is always the
// server's own projectRoot, and an unknown id is a 400. That constraint is the
// only reason a launch button is safe on a write surface at all.
const LANES = [
  { id: "orc", cmd: "/orc", what: "Full pipeline: intake → plan → scored parallel waves → review → verify → ship." },
  { id: "orc-quick", cmd: "/orc-quick", what: "Ask for anything. Look → ask once → do, and it always asks which agent." },
  { id: "orc-mini", cmd: "/orc-mini", what: "One executor, smoke gate, ship. No full review or verify phase." },
  { id: "orc-fast", cmd: "/orc-fast", what: "Fastest lane. Needs a fresh wiki AND a cached pattern, or it falls back." },
  { id: "orc-ultra", cmd: "/orc-ultra", what: "Maximum rigor: an advisor plus three judgment gates. Cost accepted." },
  { id: "orc-plan", cmd: "/orc-plan", what: "Turn a request or analyst spec into a grounded task plan. Plan only." },
  { id: "orc-analyze", cmd: "/orc-analyze", what: "Turn a document or a vague requirement into code-grounded requirements." },
  { id: "orc-wiki", cmd: "/orc-wiki", what: "Build or refresh the project wiki. Expensive; always asks first." },
  { id: "orc-pattern", cmd: "/orc-pattern", what: "Learn this project's real code conventions and cache them per language." },
  { id: "orc-verify", cmd: "/orc-verify", what: "Verify the git-modified changes in the working tree. Read-only." },
  { id: "orc-learn", cmd: "/orc-learn", what: "Generate per-feature onboarding docs. Local and git-ignored." },
  { id: "orc-retro", cmd: "/orc-retro", what: "Mine the behavior traces for calibration. Read-only, report-only." },
];

// ── the folder picker ───────────────────────────────────────────────────────
//
// The THIRD endpoint with no CLI behind it (after /api/learn's shipped content
// and /api/experiment's lane catalog), and for the same reason: there is no
// `orc` command that lists directories, so there is nothing to shell. It exists
// because a crosslink repo path typed by hand is the one field in this panel
// where a typo is invisible until the edge silently resolves to nothing — the
// CLI then saves it as a PENDING edge and you find out much later.
//
// It is a DIRECTORY LISTER and nothing more, and the limits are the design:
//   · directory names only — never a file list, never file contents, never a
//     stat beyond "does .git / .claude/wiki exist here";
//   · dotfolders are hidden (`.git`, `node_modules` and friends are noise here);
//   · it reads, it never writes, and no path it is handed can reach a shell;
//   · a path that cannot be read is an ANSWER (`error`), never a 500.
// Nothing is copied out of the folders it lists, so a wrong click costs a
// re-click. The browser is already loopback + token gated; this adds no reach
// beyond what the person at the keyboard already has.
const FS_LIST_MAX = 400;

function fsList(dir, ctx) {
  const target = path.resolve(dir || ctx.projectRoot || os.homedir());
  let entries;
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch (e) {
    return { path: target, error: String(e.code || e.message), dirs: [] };
  }
  const dirs = [];
  for (const e of entries) {
    if (dirs.length >= FS_LIST_MAX) break;
    if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(target, e.name);
    dirs.push({
      name: e.name,
      path: full,
      // The two facts that decide whether a folder is worth linking at all.
      // Both are a single existsSync — nothing inside either one is read.
      is_repo: fs.existsSync(path.join(full, ".git")),
      has_wiki: fs.existsSync(path.join(full, ".claude", "wiki")),
    });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  const parent = path.dirname(target);
  return {
    path: target,
    parent: parent === target ? null : parent, // null AT a filesystem root
    sep: path.sep,
    home: os.homedir(),
    project_root: ctx.projectRoot || null,
    is_project_root: !!ctx.projectRoot && path.resolve(ctx.projectRoot) === target,
    // What the crosslink config actually stores. Computed here rather than in
    // the browser because only the server knows the real path separator, and a
    // Windows path assembled with "/" is the kind of thing that works until it
    // does not.
    relative: ctx.projectRoot ? path.relative(ctx.projectRoot, target).split(path.sep).join("/") || "." : null,
    truncated: dirs.length >= FS_LIST_MAX,
    dirs,
  };
}

// Open a terminal running `claude` in the project root. Best-effort and never
// fatal — a failed launch is reported so the user can copy the command instead,
// which is why the command is always on screen anyway.
function launchClaude(ctx) {
  const cwd = ctx.projectRoot;
  let cmd, args;
  if (process.platform === "win32") {
    // `start` needs an empty title argument first, or a quoted path becomes it.
    cmd = "cmd";
    args = ["/c", "start", "", "cmd", "/k", "claude"];
  } else if (process.platform === "darwin") {
    cmd = "osascript";
    args = ["-e", `tell application "Terminal" to do script "cd ${JSON.stringify(cwd).slice(1, -1)} && claude"`, "-e", 'tell application "Terminal" to activate'];
  } else {
    cmd = "x-terminal-emulator";
    args = ["-e", "claude"];
  }
  try {
    const child = spawn(cmd, args, { cwd, detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
}

// ── request handling ────────────────────────────────────────────────────────

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    // Belt and braces on top of the loopback + token checks in serve.js.
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 64_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error("body is not JSON"));
      }
    });
    req.on("error", reject);
  });
}

// The Overview panel needs four commands at once. Doing that in one request
// keeps the first paint to a single round trip.
function overview(ctx) {
  const doctor = readCli(["doctor"], ctx);
  const runs = readCli(["run", "list", "--limit", "200"], ctx);
  const waiting = runs.data ? runs.data.runs.filter((r) => r.status === "waiting") : [];
  return {
    where: readCli(["where"], ctx).data,
    doctor: doctor.data,
    wiki: readCli(["wiki", "status"], ctx).data,
    patterns: readCli(["pattern", "status"], ctx).data,
    runs_total: runs.data ? runs.data.total : 0,
    // Rows, not bare slugs (v0.49.2). The Overview card has an age column and
    // rendered it empty because the payload never carried the number — and the
    // "mark as done" button needs the slug beside a real timestamp to be worth
    // showing at all.
    waiting: waiting.map((r) => ({ slug: r.slug, updated_ms: r.updated_ms, lane: r.lane || null })),
    diy: readCli(["diy", "show"], ctx).data,
    // v0.46.0 chips. Each is the CLI's OWN answer — the panel repeats the state
    // words and never derives them. A chip with nothing to say still renders its
    // good state, so "healthy" and "not measured" never look the same.
    pact: readCli(["pact", "status"], ctx).data,
    boundary: readCli(["boundary", "status"], ctx).data,
    wiki_debt: readCli(["wiki", "debt"], ctx).data,
  };
}

async function handleApi(req, res, url, ctx) {
  const route = url.pathname;
  const q = Object.fromEntries(url.searchParams);

  // Liveness. The page pings this every 15s; no ping from any client for the
  // grace window and the server exits, so a closed tab does not leave a write
  // surface holding a valid token.
  if (route === "/api/ping") {
    ctx.onHeartbeat();
    return json(res, 200, { ok: true, job: jobView() });
  }

  // sendBeacon on beforeunload — a best-effort fast path to the same shutdown
  // the heartbeat timeout would reach a minute later.
  if (route === "/api/bye") {
    ctx.onBye();
    return json(res, 200, { ok: true });
  }

  if (route === "/api/meta") {
    return json(res, 200, {
      project_root: ctx.projectRoot,
      fixtures: ctx.fixtures,
      version: ctx.version,
      port: ctx.port,
      idle_minutes: ctx.idleMinutes,
      started_ms: ctx.startedMs,
    });
  }

  if (route === "/api/job") return json(res, 200, jobView());

  // Fixture mode short-circuits every data route: canned JSON, no project, no
  // spawn. This is what makes the STALE chip and the unhealthy doctor panel
  // designable on a machine where everything is green (see the plan, §9).
  if (ctx.fixtures) {
    if (req.method !== "GET") return json(res, 200, { ok: true, fixture: true, command: "(fixtures — nothing ran)" });
    const canned = fixtures.get(route, q);
    if (canned === undefined) return json(res, 404, { error: "no fixture for " + route });
    return json(res, 200, { ok: true, exit_code: 0, data: canned, fixture: true });
  }

  if (req.method === "GET") {
    if (route === "/api/overview") return json(res, 200, { ok: true, exit_code: 0, data: overview(ctx) });
    if (route === "/api/learn") {
      // The only endpoint with no CLI behind it: the onboarding topics are
      // static content already shipped as a module, so spawning to read them
      // would be ceremony with a cost.
      const { SECTIONS } = require("../onboarding-content.js");
      return json(res, 200, { ok: true, exit_code: 0, data: { sections: SECTIONS } });
    }
    // The mocked runs (v0.46.x). Same shape as /api/learn above and for the
    // same reason: this is static content that ships inside this package, so
    // spawning a subprocess to read files sitting next to this one would be
    // ceremony with a cost. `orc mock-run` reads the identical module, so the
    // terminal and the panel cannot disagree.
    if (route === "/api/mockruns") {
      return json(res, 200, { ok: true, exit_code: 0, data: require("../mockrun-catalog.js").catalogue() });
    }
    if (route === "/api/mockrun") {
      const doc = require("../mockrun-catalog.js").get(String(q.slug || ""));
      if (!doc) return json(res, 200, { ok: true, exit_code: 1, data: { slug: String(q.slug || ""), found: false } });
      return json(res, 200, { ok: true, exit_code: 0, data: { ...doc, found: true } });
    }
    if (route === "/api/fs/list") {
      return json(res, 200, { ok: true, exit_code: 0, data: fsList(q.path, ctx) });
    }
    if (route === "/api/experiment") {
      return json(res, 200, {
        ok: true,
        exit_code: 0,
        data: {
          lanes: LANES,
          project_root: ctx.projectRoot,
          platform: process.platform,
          // Fixture mode must never spawn a real terminal on a machine that has
          // no project — the button says so instead of lying about it.
          can_launch: !ctx.fixtures,
        },
      });
    }
    if (route === "/api/maintenance") {
      const actions = Object.entries(MAINTENANCE).map(([id, m]) => ({
        id,
        label: m.label,
        command: "orc " + m.apply.join(" "),
        network: !!m.network,
        names_files: !!m.names_files,
        advanced: !!m.advanced,
      }));
      return json(res, 200, { ok: true, exit_code: 0, data: { actions } });
    }
    if (route === "/api/maintenance/preview") {
      const m = MAINTENANCE[String(q.action)];
      if (!m) return json(res, 400, { error: "unknown action" });
      const probe = readCli(m.preview, ctx);
      return json(res, 200, {
        ok: true,
        exit_code: 0,
        data: {
          action: String(q.action),
          label: m.label,
          command: "orc " + m.apply.join(" "),
          network: !!m.network,
          names_files: !!m.names_files,
          advanced: !!m.advanced,
          preview_command: "orc " + m.preview.join(" "),
          preview: probe.data,
          // Only the UI can know a run is mid-flight; updating changes the
          // skills that run would resume into.
          waiting_runs: (readCli(["run", "list", "--limit", "200"], ctx).data || { runs: [] }).runs
            .filter((r) => r.status === "waiting")
            .map((r) => r.slug),
          dirty_tree: m.network ? isDirtyTree(ctx) : false,
        },
      });
    }
    const build = READS[route];
    if (!build) return json(res, 404, { error: "unknown endpoint " + route });
    const out = readCli(build(q), ctx);
    // v0.49.2 — a read that produced no parseable object still has to SAY why.
    // The body already carried `stderr` and `stdout`; nothing named `error`, so
    // the client fell through to "request failed (500)" and one corrupt ledger
    // looked like a broken panel. The reason the CLI printed is what is shown.
    return json(res, out.ok ? 200 : 500, out.ok ? out : { ...out, error: readFailReason(out) });
  }

  if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { error: e.message });
  }

  // The handoff. It takes NO command from the browser: the lane id is looked up
  // in the server's own catalog and is used only to echo back what to type. The
  // process spawned is always a bare `claude` in the server's own projectRoot,
  // so there is no path by which browser input reaches a shell.
  if (route === "/api/experiment/launch") {
    if (ctx.fixtures) return json(res, 400, { error: "fixture mode never launches anything real" });
    const lane = body.lane ? LANES.find((l) => l.id === String(body.lane)) : null;
    if (body.lane && !lane) return json(res, 400, { error: "unknown lane" });
    const r = launchClaude(ctx);
    if (!r.ok) return json(res, 500, { error: "could not open a terminal: " + r.error });
    return json(res, 200, {
      ok: true,
      // What to type once it is open. The UI shows this; the server never runs it.
      type_this: lane ? lane.cmd : null,
      cwd: ctx.projectRoot,
    });
  }

  if (route === "/api/maintenance/apply") {
    const m = MAINTENANCE[String(body.action)];
    if (!m) return json(res, 400, { error: "unknown action" });
    const started = startJob(m.apply, ctx);
    if (started.error) return json(res, 409, started);
    return json(res, 200, { ok: true, ...started });
  }

  const build = WRITES[route];
  if (!build) return json(res, 404, { error: "unknown endpoint " + route });
  if (job && job.running) return json(res, 409, { error: "busy", job: jobView() });
  let argv;
  try {
    argv = build(body);
  } catch (_) {
    return json(res, 400, { error: "bad request body" });
  }
  if (argv.some((a) => a === "undefined" || a === "null" || a === ""))
    return json(res, 400, { error: "missing argument" });
  const out = runCli(argv, ctx);
  clearCache();
  // A write's exit code is a REAL failure signal (validators exit 1), unlike a
  // read's — so it is reported as such, with the CLI's own message.
  return json(res, 200, {
    ok: out.exit_code === 0,
    exit_code: out.exit_code,
    command: out.command,
    // Writes print human text, not JSON — that IS the confirmation to show.
    output: (out.stdout + (out.stderr ? "\n" + out.stderr : "")).trim(),
  });
}

// `orc upgrade` replaces the package while your working tree may hold changes.
// Worth a warning before, not a surprise after.
function isDirtyTree(ctx) {
  try {
    const r = spawnSync("git", ["status", "--porcelain"], {
      cwd: ctx.projectRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    return r.status === 0 && !!(r.stdout || "").trim();
  } catch (_) {
    return false;
  }
}

module.exports = { handleApi, clearCache, READS, WRITES, MAINTENANCE };
