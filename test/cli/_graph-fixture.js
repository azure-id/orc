"use strict";
// @test-pool pure  — a fixture the graph tests share; registers zero tests here
//
// v1.9.1 W0 — the ONE Express fixture every `orc graph … --json` golden is
// measured on, and the ONE normaliser that takes the clock, the temp path and
// the commit hash out of an answer so two runs of the same command compare.
//
// The source bundle is `test/goldens/graph-1.8.1/fixture.json` — the same
// Express toy the upgrade test builds, reused here on purpose: one fixture,
// one set of symbols, one answer shape to reason about.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { REPO, cli, tmpdir } = require("../_helpers");

const FIXTURE = path.join(REPO, "test", "goldens", "graph-1.8.1", "fixture.json");
const GOLD_DIR = path.join(REPO, "test", "goldens", "graph-json-1.9.0");

// The fixture as a git repository with the graph built. `autocrlf` is off so
// the bytes on disk are the bytes the bundle holds on every platform.
//
// The history is deliberately more than one commit: `cochange` answers from
// git history, and a one-commit repository can only ever answer "it changes
// alone". Three extra commits touch the SAME pair, which is exactly the
// `COCHANGE_MIN` threshold.
function fixtureRepo(opts) {
  const o = opts || {};
  const root = tmpdir();
  const files = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  if (o.history !== false) {
    for (let i = 1; i <= 3; i++) {
      for (const rel of ["src/auth.js", "src/reports.js"]) {
        const f = path.join(root, ...rel.split("/"));
        fs.appendFileSync(f, `// pass ${i}\n`);
      }
      git("add", "-A");
      git("commit", "-qm", `pass ${i}`);
    }
  }
  cli(["config", "set", "code_graph", "on", "--dir", root]);
  if (o.build !== false) cli(["graph", "update", "--json", "--dir", root]);
  return { root, git, claudeDir: path.join(root, ".claude") };
}

// The deterministic working-tree edit `changes` answers about: it touches ONE
// exported function that has callers and a test, inside a file that is in the
// graph. Applied AFTER the clean-phase reads, so `status` still has a FRESH
// golden of its own.
function editFixture(root) {
  const p = path.join(root, "src", "stores", "orderStore.js");
  const body = fs.readFileSync(p, "utf8");
  fs.writeFileSync(p, body.replace("function searchByItemPrefix(", "function searchByItemPrefix(/* edited */"));
}

const graph = (root, ...a) => cli(["graph", ...a, "--dir", root]);

// ── the command matrix ──────────────────────────────────────────────────────
// Every read the plan freezes, with the operands this fixture answers. `name`
// is the golden's file name; `args` never carries `--dir` (the runner adds it).
// `phase: "edited"` runs after `editFixture` — the rest run on the clean tree,
// so a card never says CHANGED for a reason the golden cannot explain.
// `gain` is last on purpose: its answer is the ledger every row above wrote.
const COMMANDS = [
  { name: "status", args: ["status", "--json"] },
  { name: "ctx-symbol", args: ["ctx", "searchByItemPrefix", "--json"] },
  { name: "ctx-file", args: ["ctx", "src/stores/orderStore.js", "--json"] },
  { name: "ctx-multi", args: ["ctx", "searchByItemPrefix", "requireAuth", "--json"] },
  { name: "ctx-for-slice", args: ["ctx", "--for-slice", "src/stores/orderStore.js", "src/auth.js", "src/routes/orders.js", "--json"] },
  { name: "ctx-not-found", args: ["ctx", "noSuchSymbolHere", "--json"] },
  { name: "ctx-source", args: ["ctx", "searchByItemPrefix", "--source", "--json"] },
  { name: "impact", args: ["impact", "src/stores/orderStore.js", "src/auth.js", "src/handlers/base.js", "--json"] },
  { name: "map", args: ["map", "--json"] },
  { name: "map-focus", args: ["map", "--focus", "orders", "--json"] },
  { name: "coverage", args: ["coverage", "src/stores/orderStore.js", "src/auth.js", "--json"] },
  { name: "cochange", args: ["cochange", "src/auth.js", "--json"] },
  { name: "cochange-none", args: ["cochange", "src/stores/orderStore.js", "--json"] },
  { name: "path", args: ["path", "OrdersHandler.list", "OrderStore.list", "--json"] },
  { name: "notes-pending", args: ["notes", "pending", "--files", "src/stores/orderStore.js", "--min", "1", "--json"] },
  { name: "notes-below-min", args: ["notes", "pending", "--files", "src/stores/orderStore.js", "--json"] },
  { name: "changes", args: ["changes", "--json"], phase: "edited" },
  { name: "update", args: ["update", "--json"], phase: "edited" },
  { name: "gain", args: ["gain", "--json"], phase: "edited" },
];

// Run the whole matrix on one fresh fixture, in order, applying the edit
// between the two phases. Returns `{ root, results: { name: {status, json, raw} } }`.
function runMatrix(select) {
  const c = fixtureRepo();
  const want = select ? new Set(select) : null;
  const results = {};
  for (const phase of ["clean", "edited"]) {
    if (phase === "edited") editFixture(c.root);
    for (const cmd of COMMANDS) {
      if ((cmd.phase || "clean") !== phase) continue;
      const r = runCommand(c.root, cmd);
      if (!want || want.has(cmd.name)) results[cmd.name] = r;
    }
  }
  return { ...c, results };
}

// ── the normaliser ──────────────────────────────────────────────────────────
// A golden must not move because a run took one millisecond longer, because the
// temp directory has another name, or because the clock ticked. Everything else
// — every count, every path, every card line — is compared as it is written.
const VOLATILE_KEYS = new Set(["ms", "last_ms", "gen_id", "updated_at", "head_commit", "at", "bytes_freed", "head", "since_ms"]);

function scrubString(s, root) {
  let out = String(s);
  if (root) {
    const r = String(root).split("\\").join("/");
    out = out.split(r).join("<root>").split(root).join("<root>");
  }
  return out
    .replace(/\b[0-9a-f]{40}\b/g, "<sha>")
    .replace(/\b\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}\b/g, "<stamp>")
    .replace(/\(\d+ ms\)/g, "(<n> ms)")
    .replace(/\b\d+ ms\b/g, "<n> ms")
    .replace(/\bms=\d+/g, "ms=<n>")
    .replace(/updated [^)\n]+/g, "updated <stamp>");
}

function normalise(value, root) {
  if (Array.isArray(value)) return value.map((v) => normalise(v, root));
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = VOLATILE_KEYS.has(k) ? `<${k}>` : normalise(value[k], root);
    }
    return out;
  }
  if (typeof value === "string") return scrubString(value, root);
  return value;
}

// Run one matrix row and return `{ status, json }` with the answer normalised.
function runCommand(root, cmd) {
  const r = graph(root, ...cmd.args);
  let obj = null;
  try {
    obj = JSON.parse(r.stdout);
  } catch (_) {
    obj = { PARSE_ERROR: r.stdout };
  }
  return { status: r.status, json: normalise(obj, root), raw: r.stdout };
}

const goldenPath = (name) => path.join(GOLD_DIR, `${name}.json`);

function readGolden(name) {
  return JSON.parse(fs.readFileSync(goldenPath(name), "utf8"));
}

function writeGolden(name, payload) {
  fs.mkdirSync(GOLD_DIR, { recursive: true });
  fs.writeFileSync(goldenPath(name), JSON.stringify(payload, null, 2) + "\n");
}

module.exports = { FIXTURE, GOLD_DIR, fixtureRepo, editFixture, graph, COMMANDS, runMatrix, normalise, scrubString, runCommand, goldenPath, readGolden, writeGolden };
