"use strict";
// @test-pool pure  — a fixture the CHILD runs; registers zero tests here
// A stand-in `gh` for the W6a importer tests (`orc gotcha import pr|issues`,
// `orc gotcha sync`, `orc pr threads`, `orc ci failed`). bin/gotcha-import.js
// runs it when ORC_GH points here (a .js path runs through node).
//
// It answers from test/fixtures/importers/ and NEVER from the network. Every
// call is appended to ORC_FAKE_GH_LOG (one JSON argv per line), so a test can
// assert that ORC only READ — never a reply, a resolve, a review or a merge.
//
// ORC_FAKE_GH_MODE:
//   ok      the fixtures (default)
//   noauth  every call fails the way an unauthenticated gh does
//   slow    blocks for 5 s first — the sync time box must cut it
//   nopr    `gh pr view` with no number says the branch has no PR
//
// `node --test test/` executes every .js under test/, so the body is gated on
// being invoked with real arguments.
const fs = require("fs");
const path = require("path");

const ARGV = process.argv.slice(2);
if (ARGV.length) main();

function main() {
  const MODE = process.env.ORC_FAKE_GH_MODE || "ok";
  const DIR = path.join(__dirname, "..", "fixtures", "importers");
  if (process.env.ORC_FAKE_GH_LOG) fs.appendFileSync(process.env.ORC_FAKE_GH_LOG, JSON.stringify(ARGV) + "\n");
  const send = (file) => {
    process.stdout.write(fs.readFileSync(path.join(DIR, file), "utf8"));
    process.exit(0);
  };
  const die = (code, msg) => {
    process.stderr.write(msg + "\n");
    process.exit(code);
  };
  if (MODE === "noauth") die(4, "You are not logged into any GitHub hosts. To log in, run: gh auth login");
  if (MODE === "slow") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  const [a, b, c] = ARGV;
  const has = (f) => ARGV.includes(f);
  const val = (f) => (ARGV.indexOf(f) === -1 ? null : ARGV[ARGV.indexOf(f) + 1]);
  if (a === "auth" && b === "status") {
    process.stdout.write("github.com\n  ✓ Logged in to github.com account fake (keyring)\n");
    process.exit(0);
  }
  if (a === "api" && b === "graphql") {
    if (!has("--paginate") || !String(ARGV.find((x) => x.startsWith("query=")) || "").includes("reviewThreads")) die(64, "fake gh: the threads query must be a paginated reviewThreads query");
    send("pr-threads.graphql.json");
  }
  if (a === "api" && /\/pulls\/\d+\/reviews$/.test(b || "")) send("pr-reviews.json");
  if (a === "pr" && b === "view") {
    const num = c && /^\d+$/.test(c) ? c : null;
    if (val("--json") === "files") send(`pr-files-${num}.json`);
    if (!num && MODE === "nopr") die(1, 'no pull requests found for branch "main"');
    send("pr-view.json");
  }
  if (a === "issue" && b === "list") send("issues.json");
  if (a === "run" && b === "list") send("runs.json");
  if (a === "run" && b === "view") {
    if (has("--log-failed")) send(`ci-${c}.log`);
    const runs = JSON.parse(fs.readFileSync(path.join(DIR, "runs.json"), "utf8"));
    const r = runs.find((x) => String(x.databaseId) === String(c));
    if (!r) die(1, `could not find any workflow run with ID ${c}`);
    process.stdout.write(JSON.stringify(r));
    process.exit(0);
  }
  die(64, "fake gh: unknown call " + ARGV.join(" "));
}
