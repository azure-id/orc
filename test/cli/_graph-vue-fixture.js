"use strict";
// @test-pool pure  — a fixture the graph tests share; registers zero tests here
//
// v2.2.0 — a Vue 2.7 SPA whose code lives under `client/` (NOT the repository
// root): the `@/` alias, SFC props/emits/templates, SPA routes, a test file
// beside the source it tests, and a second package (`server/`) that must not
// take `client/src` aliases.
//
// The bundle is `test/fixtures/graph-vue/fixture.json`. `opts.extra` is an
// object of extra files, written over the bundle, so a test can add a
// `jsconfig.json` or a `vue.config.js` variant.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { REPO, cli, tmpdir } = require("../_helpers");

const FIXTURE = path.join(REPO, "test", "fixtures", "graph-vue", "fixture.json");

function vueRepo(opts) {
  const o = opts || {};
  const root = tmpdir();
  const files = { ...JSON.parse(fs.readFileSync(FIXTURE, "utf8")), ...(o.extra || {}) };
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
  cli(["config", "set", "code_graph", "on", "--dir", root]);
  if (o.build !== false) cli(["graph", "update", "--json", "--dir", root]);
  return { root, git, claudeDir: path.join(root, ".claude"), files };
}

module.exports = { FIXTURE, vueRepo };
