"use strict";
// @test-pool spawn  — no CLI shell, but every step drives real `git` subprocesses
// v1.8.0 EW2 — the resolution cache.
//
// The one promise this file exists for:
//
//   **A cached answer is BYTE-IDENTICAL to a computed one.**
//
// A stored resolution that quietly drifts from the truth is worse than no
// stored resolution at all: every card after the drift is confidently wrong and
// nothing says so. So a seeded random edit script runs over a fixture repo and,
// after EVERY step, every read command is run twice — once through the cache
// and once with the cache refused — and the two answers are compared whole,
// order included. An error has to survive being compounded, not just made once.
//
// It also holds the rules around that:
//   · the cache is used ONLY at the matching generation
//   · a missing, truncated or foreign-engine cache changes no answer
//   · a symbol named `constructor` is a name, not `Object.prototype.constructor`
//   · `names.json` is written beside it, keyed by bare name
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { tmpdir } = require("../_helpers");
const G = require("../../bin/graph.js");
const R = require("../../bin/graph-resolve.js");
const Q = require("../../bin/graph-query.js");

function write(root, rel, body) {
  const f = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
}

function repo(files) {
  const root = tmpdir();
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  for (const [rel, body] of Object.entries(files)) write(root, rel, body);
  git("add", "-A");
  git("commit", "-qm", "base");
  return { root, claudeDir: path.join(root, ".claude"), git };
}

const update = (c) => G.graphUpdate(c.claudeDir, c.root, { enabled: true });

// Every read command, both ways, compared whole.
function assertCachedEqualsComputed(c, step) {
  const hot = Q.loadModel(c.claudeDir, c.root);
  const cold = Q.loadModel(c.claudeDir, c.root, { noCache: true });
  assert.ok(hot.callersCache, `step ${step}: the cache should be in use`);
  const same = (label, a, b) => assert.deepStrictEqual(a, b, `step ${step}: ${label} differs between the cached and the computed answer`);
  for (const rel of Object.keys(cold.byFile)) {
    same(`ctx ${rel}`, Q.ctx(hot, rel, { budget: 4000 }), Q.ctx(cold, rel, { budget: 4000 }));
    same(`impact ${rel}`, Q.impact(hot, [rel], { depth: 3, budget: 4000 }), Q.impact(cold, [rel], { depth: 3, budget: 4000 }));
    for (const s of (cold.byFile[rel].symbols || []).filter((x) => x.kind !== "module")) {
      same(`ctx ${s.id}`, Q.ctx(hot, s.id, { budget: 4000 }), Q.ctx(cold, s.id, { budget: 4000 }));
    }
  }
}

// A small deterministic generator — the same seed gives the same script, so a
// failure is reproducible from the step number alone.
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

const BASE = {
  "src/core.js": "export function alpha(a) { return beta(a); }\nexport function beta(b) { return b + 1; }\n",
  "src/use.js": "import { alpha } from './core.js';\nexport function run(x) { return alpha(x); }\n",
  "src/other.js": "import { beta } from './core.js';\nexport function twice(x) { return beta(beta(x)); }\n",
  "src/loose.js": "export function orphan() { return missingThing(); }\n",
  "tests/core.test.js": "import { alpha } from '../src/core.js';\nit('works', () => alpha(1));\n",
  // v1.8.2 W2: an alias, a base chain, a barrel, a route and a URL — every
  // new edge kind is under the same byte-identical promise.
  "src/base.js": "export class Base {\n  log(x) { return x; }\n}\n",
  "src/repo.js": "import { Base } from './base.js';\nexport class Repo extends Base {\n  save(x) { this.log(x); return super.log(x); }\n}\n",
  "src/svc.js": "import { Repo } from './repo.js';\nexport class Service {\n  constructor() { this.repo = new Repo(); }\n  run(x) { return this.repo.save(x); }\n}\n",
  "src/index.js": "export * from './core.js';\nexport { Service } from './svc.js';\n",
  "src/consumer.js": "import { alpha, Service } from './index.js';\nexport function go() { const s = new Service(); return s.run(alpha(1)); }\n",
  "src/routes.js": "import { Router } from 'express';\nimport { go } from './consumer.js';\nconst router = Router();\nrouter.get('/go', (req, res) => res.json(go()));\nexport default router;\n",
  "src/app.js": "import router from './routes.js';\napp.use('/api', router);\n",
  "tests/api.test.js": "import request from 'supertest';\nit('goes', () => request(app).get('/api/go'));\n",
};

test("graph resolve — update writes the cache and names.json, and the route says which", () => {
  const c = repo(BASE);
  const first = update(c);
  assert.equal(first.route, "full");
  assert.ok(fs.existsSync(R.resolvedPath(c.claudeDir)));
  assert.ok(fs.existsSync(R.namesPath(c.claudeDir)));

  // Nothing moved: the index is not rewritten and neither is the cache.
  const again = update(c);
  assert.equal(again.state, "unchanged");
  assert.equal(again.route, "unchanged");

  const res = JSON.parse(fs.readFileSync(R.resolvedPath(c.claudeDir), "utf8"));
  assert.equal(res.generation, again.generation);
  assert.ok(Object.prototype.hasOwnProperty.call(res.callers, "src/core.js#alpha"), "who calls alpha is stored");
});

test("graph resolve — the cache is used ONLY at the matching generation, and never changes an answer", () => {
  const c = repo(BASE);
  update(c);
  const meta = JSON.parse(fs.readFileSync(G.graphPaths(c.claudeDir).meta, "utf8"));
  assert.ok(R.load(c.claudeDir, meta), "a matching generation is usable");
  assert.equal(R.load(c.claudeDir, { ...meta, generation: meta.generation + 1 }), null, "a moved generation is never used");
  assert.equal(R.load(c.claudeDir, { ...meta, generation: 0 }), null);

  const computed = Q.ctx(Q.loadModel(c.claudeDir, c.root, { noCache: true }), "src/core.js", { budget: 2000 });
  assert.deepStrictEqual(Q.ctx(Q.loadModel(c.claudeDir, c.root), "src/core.js", { budget: 2000 }), computed);

  // Truncated, foreign, or gone: the answer is identical, only slower.
  fs.writeFileSync(R.resolvedPath(c.claudeDir), "{ not json");
  assert.deepStrictEqual(Q.ctx(Q.loadModel(c.claudeDir, c.root), "src/core.js", { budget: 2000 }), computed);
  fs.writeFileSync(R.resolvedPath(c.claudeDir), JSON.stringify({ schema: R.RESOLVE_SCHEMA, engine: "graph@0", generation: meta.generation, callers: {} }));
  assert.deepStrictEqual(Q.ctx(Q.loadModel(c.claudeDir, c.root), "src/core.js", { budget: 2000 }), computed);
  fs.rmSync(R.resolvedPath(c.claudeDir));
  assert.deepStrictEqual(Q.ctx(Q.loadModel(c.claudeDir, c.root), "src/core.js", { budget: 2000 }), computed);
});

test("graph resolve — a symbol named `constructor` is a name, not a prototype member", () => {
  const c = repo({
    "src/proto.js": "export function constructor() { return toString(); }\nexport function valueOf() { return 1; }\n",
    "src/callsit.js": "import { constructor } from './proto.js';\nexport function go() { return constructor(); }\n",
  });
  assert.equal(update(c).route, "full");
  const res = JSON.parse(fs.readFileSync(R.resolvedPath(c.claudeDir), "utf8"));
  assert.ok(Object.prototype.hasOwnProperty.call(res.callers, "src/proto.js#constructor"));
  const names = JSON.parse(fs.readFileSync(R.namesPath(c.claudeDir), "utf8"));
  assert.ok(Array.isArray(R.own(names.names, "constructor")), "a bare name lookup never returns a prototype member");
  assert.equal(R.own(names.names, "hasOwnProperty"), undefined);
  assert.deepStrictEqual(R.own(names.names, "valueOf")[0].slice(0, 3), ["valueOf", "function", "src/proto.js"]);
});

test("graph resolve — a seeded edit script: every cached answer equals the computed one", () => {
  const c = repo(BASE);
  update(c);
  assertCachedEqualsComputed(c, 0);

  const rand = rng(20260915);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const targets = ["src/core.js", "src/use.js", "src/other.js", "src/loose.js", "src/consumer.js", "src/repo.js"];
  const deleted = new Map();
  let extra = 0;
  const toggle = (file, a, b) => {
    const p = path.join(c.root, ...file.split("/"));
    const s = fs.readFileSync(p, "utf8");
    fs.writeFileSync(p, s.includes(a) ? s.replace(a, b) : s.replace(b, a));
  };

  const STEPS = Number(process.env.ORC_GRAPH_RESOLVE_STEPS || 30);
  for (let step = 1; step <= STEPS; step++) {
    const op = Math.floor(rand() * 11);
    const rel = pick(targets);
    const abs = path.join(c.root, ...rel.split("/"));
    const live = fs.existsSync(abs);

    if (op === 7) {
      // W2: the alias comes and goes — `new Service()` ↔ a factory nobody defines
      toggle("src/consumer.js", "const s = new Service();", "const s = makeService();");
    } else if (op === 8) {
      // W2: the base chain moves under the subclass
      toggle("src/repo.js", "extends Base", "extends Other");
    } else if (op === 9) {
      // W2: the barrel renames on the way through
      toggle("src/index.js", "export { Service } from './svc.js';", "export { Service as Svc } from './svc.js';");
    } else if (op === 10) {
      // W1: the mount prefix changes, so the URL reaches the route or misses it
      toggle("src/app.js", "app.use('/api', router);", "app.use('/v2', router);");
    } else if (op === 0 && live) {
      fs.writeFileSync(abs, fs.readFileSync(abs, "utf8").replace(/return /, `return /* ${step} */ `));
    } else if (op === 1 && live) {
      // rename an exported function — a surface change
      fs.writeFileSync(abs, fs.readFileSync(abs, "utf8").replace(/export function (\w+)/, `export function $1x${step}`));
    } else if (op === 2 && live && deleted.size < 2) {
      deleted.set(rel, fs.readFileSync(abs, "utf8"));
      fs.rmSync(abs);
    } else if (op === 3 && deleted.size) {
      const [k, v] = [...deleted.entries()][0];
      write(c.root, k, v);
      deleted.delete(k);
    } else if (op === 4) {
      // a new file that defines a name someone already calls — ambiguity
      write(c.root, `src/gen${extra}.js`, `export function beta(x) { return x - ${step}; }\nexport function g${extra}() { return beta(1); }\n`);
      extra++;
    } else if (op === 5 && live) {
      const src = fs.readFileSync(abs, "utf8");
      fs.writeFileSync(abs, src.includes("./core.js") ? src.replace("./core.js", "./other.js") : `import { orphan } from './loose.js';\n${src}`);
    } else if (live) {
      // a call to a name nothing defines
      fs.writeFileSync(abs, `${fs.readFileSync(abs, "utf8")}export function p${step}() { return ghost${step % 3}(); }\n`);
    }

    update(c);
    assertCachedEqualsComputed(c, step);
  }
});
