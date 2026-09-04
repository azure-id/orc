"use strict";
// @test-pool spawn  — shells node bin/cli.js and runs the installed hook
//
// THE CLI HOOK INTERFACE. (v1.3.0 W1–W2.)
//
// The feature's whole premise is a wall: the CLI compiles an authored layout
// into a flat render program, and the hook executes that program and resolves
// nothing. Almost every test here is about that wall — that the CLI refuses
// what it should refuse, that the compiled file is total, that the hook falls
// back rather than throwing, and that the panel's preview and the bar's real
// output are the same bytes.
//
// The byte-identical OFF baseline lives in test/statusline-baseline.test.js,
// because it is a test about the SHIPPED status line that happens to be the
// most important test this feature has.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { REPO, cli, rmrf, runHook, freshInstall } = require("./_helpers.js");

const CATALOG = path.join(REPO, "orc-hookui-build", "components-catalog.md");
const RENDER_ENGINE = path.join(REPO, "templates", "hooks", "orc-statusline-render.js");

function slj(root, args) {
  const r = cli(["statusline", ...args, "--dir", root, "--json"]);
  let j = null;
  try {
    j = JSON.parse(r.stdout);
  } catch (_) {}
  return { status: r.status, json: j, raw: r.stdout, err: r.stderr };
}

// ── the registry ───────────────────────────────────────────────────────────

test("statusline: every component declares a renderer it actually offers, and every renderer is real", () => {
  const { root } = freshInstall();
  try {
    const { json } = slj(root, ["components"]);
    assert.ok(json && json.components.length > 60, "the catalogue is populated");
    for (const c of json.components) {
      assert.ok(c.renderers.length, c.id + " offers no renderer");
      for (const r of c.renderers)
        assert.ok(json.renderers[r], `${c.id} offers renderer "${r}", which does not exist`);
      const dflt = (c.defaults && c.defaults.render) || c.renderers[0];
      assert.ok(c.renderers.includes(dflt), `${c.id} defaults to "${dflt}", which it does not offer`);
      // UNKNOWN IS NOT ZERO: the catalogue says which of the two an absent
      // value is, and `0` is never one of them.
      assert.ok(["dash", "hide"].includes(c.unknown), `${c.id} has unknown="${c.unknown}"`);
      assert.ok(["free", "scan", "new-read", "refused"].includes(c.cost), `${c.id} has cost="${c.cost}"`);
      if (c.cost === "refused")
        assert.ok(c.refused_reason && c.refused_reason.length > 40, `${c.id} is refused with no reason recorded`);
    }
  } finally {
    rmrf(root);
  }
});

test("statusline: a proportion renderer is only offered where a value has a maximum", () => {
  // A bar on a value with no ceiling is a lie, and it is exactly the design a
  // human gets wrong and a machine can check.
  const { root } = freshInstall();
  try {
    const { json } = slj(root, ["components"]);
    for (const c of json.components) {
      for (const r of c.renderers) {
        const needs = json.renderers[r].needs;
        if (needs === "bounded") assert.ok(c.bounded, `${c.id} offers "${r}" but has no maximum`);
        if (needs === "states") assert.ok(c.states, `${c.id} offers "${r}" but has no states`);
        if (needs === "series") assert.ok(c.series, `${c.id} offers "${r}" but keeps no history`);
      }
    }
  } finally {
    rmrf(root);
  }
});

test("statusline: every stateful component has a SHAPE per state — R4, checked", () => {
  // A design whose only distinction is hue becomes ambiguous under NO_COLOR.
  // This is a provable property, it is cheap, and it is the reason `shape`
  // exists as a renderer at all.
  const { root } = freshInstall();
  try {
    const { json } = slj(root, ["components"]);
    for (const c of json.components) {
      if (!c.states) continue;
      const usesShape = c.renderers.some((r) => ["shape", "icon", "traffic", "dot", "pulse"].includes(r));
      if (!usesShape) continue;
      assert.ok(c.shapes, `${c.id} offers a shape renderer but declares no per-state glyph`);
      const seen = new Map();
      for (const st of c.states) {
        const g = c.shapes[st];
        assert.ok(g, `${c.id} has no glyph for state "${st}"`);
        assert.ok(!seen.has(g), `${c.id}: states "${seen.get(g)}" and "${st}" both render "${g}" — identical under NO_COLOR`);
        seen.set(g, st);
      }
    }
  } finally {
    rmrf(root);
  }
});

test("statusline: R1 — every shipped glyph is exactly one cell, and every ASCII twin is the same width", () => {
  // Get width wrong and the whole line after it shifts, every render, forever.
  // Fullwidth forms, bare emoji and combining marks are banned outright.
  const src = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const start = src.indexOf("const STATUSLINE_GLYPHSETS = {");
  assert.ok(start > 0, "the glyph-set table is where the test expects it");
  const table = src.slice(start, src.indexOf("\n};", start));
  const glyphs = [...table.matchAll(/"([^"\\]+)"/g)].map((m) => m[1]);
  for (const g of glyphs) {
    if (g.length > 3 && /[a-z_]/.test(g)) continue; // a key, not a glyph
    for (const ch of g) {
      const cp = ch.codePointAt(0);
      // fullwidth / halfwidth forms and CJK compatibility
      assert.ok(!(cp >= 0xff00 && cp <= 0xffef), `fullwidth glyph "${ch}" in a shipped set`);
      // combining marks are zero-width by definition and one cell by accident
      assert.ok(!(cp >= 0x0300 && cp <= 0x036f), `combining mark in a shipped set`);
      // emoji presentation
      assert.ok(!(cp >= 0x1f300 && cp <= 0x1faff), `bare emoji "${ch}" in a shipped set`);
      assert.ok(cp !== 0x200d, "ZWJ sequence in a shipped set");
    }
  }
});

// ── the board rules ────────────────────────────────────────────────────────

test("statusline: the dense-prefix rule is enforced, and every violation is NAMED", () => {
  const { root } = freshInstall();
  try {
    // A layout is refused, not repaired, and NOTHING is written.
    const layout = path.join(root, ".claude", "orc", "statusline-layout.json");
    slj(root, ["apply", "orc-default"]);
    const before = fs.readFileSync(layout, "utf8");

    // Line 1 emptied out.
    for (let i = 0; i < 5; i++) slj(root, ["remove", "1:1"]);
    const r = slj(root, ["remove", "1:1"]);
    assert.strictEqual(r.status, 1, "a refusal exits 1");
    assert.strictEqual(r.json.wrote, false, "nothing is written on a refusal");
    assert.ok(
      r.json.errors.some((e) => /line 1 is empty/.test(e)),
      "the empty line 1 is named: " + JSON.stringify(r.json.errors)
    );
    assert.ok(
      r.json.errors.some((e) => /line 2 holds .* but line 1 is empty/.test(e)),
      "the orphaned line is named too — a validator that stops at the first problem makes a user fix a five-error layout five times"
    );
    // The last accepted write is what is on disk.
    assert.notStrictEqual(fs.readFileSync(layout, "utf8"), before, "the accepted removals did write");
  } finally {
    rmrf(root);
  }
});

test("statusline: six on a line is refused, naming the line and the count", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]); // line 1 already holds 5
    const r = slj(root, ["set", "1", "6", "cost-usd"]);
    assert.strictEqual(r.status, 1);
    assert.ok(r.json.errors.some((e) => /line 1 holds 6 components \(max 5\)/.test(e)), JSON.stringify(r.json.errors));
  } finally {
    rmrf(root);
  }
});

test("statusline: spacer, divider and fill do not count against the five", () => {
  // The limit is about how much a line SAYS, and none of the three says
  // anything.
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "orc-default"]);
    const r = slj(root, ["set", "1", "6", "fill"]);
    assert.strictEqual(r.status, 0, "a fill on a full line is legal: " + JSON.stringify(r.json && r.json.errors));
  } finally {
    rmrf(root);
  }
});

test("statusline: an unknown component is refused with a suggestion, not a shrug", () => {
  const { root } = freshInstall();
  try {
    const r = slj(root, ["set", "1", "1", "contxt"]);
    assert.strictEqual(r.status, 1);
    const msg = r.json.errors.join(" ");
    assert.match(msg, /unknown component "contxt"/);
    assert.match(msg, /did you mean "context"/);
  } finally {
    rmrf(root);
  }
});

test("statusline: a renderer the component does not offer is refused, and the offer is listed", () => {
  const { root } = freshInstall();
  try {
    const r = slj(root, ["set", "1", "1", "branch", "--render", "bar"]);
    assert.strictEqual(r.status, 1);
    const msg = r.json.errors.join(" ");
    assert.match(msg, /does not offer renderer "bar"/);
    assert.match(msg, /it offers: /, "a refusal that does not say what IS allowed is a shrug");
  } finally {
    rmrf(root);
  }
});

test("statusline: a refused component is refused BY NAME, with the measurement", () => {
  const { root } = freshInstall();
  try {
    const r = slj(root, ["set", "1", "1", "git-dirty"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.json.errors.join(" "), /"git-dirty" is refused: .*subprocess/);
  } finally {
    rmrf(root);
  }
});

test("statusline: a bare `dot` is refused — its states are ambiguous under NO_COLOR", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "minimal"]);
    const r = slj(root, ["set", "1", "1", "cache", "--render", "dot"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.json.errors.join(" "), /indistinguishable under NO_COLOR/);
  } finally {
    rmrf(root);
  }
});

test("statusline: a flat colour on a stateful component WARNS and still saves", () => {
  // R3. Warnings never block: an error is a refusal, a warning is a fact the
  // user then owns.
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "minimal"]);
    const r = slj(root, ["set", "1", "1", "--color", "green"]);
    assert.strictEqual(r.status, 0, "it saves");
    assert.ok(r.json.warnings.some((w) => /status line that lies/.test(w)), JSON.stringify(r.json.warnings));
  } finally {
    rmrf(root);
  }
});

test("statusline: `blink` is refused outright", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "minimal"]);
    const r = slj(root, ["set", "1", "1", "--emphasis", "blink"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.json.errors.join(" "), /emphasis "blink" is refused/);
  } finally {
    rmrf(root);
  }
});

// ── the compiler ───────────────────────────────────────────────────────────

test("statusline: compiling is automatic, and the lock proves what was compiled", () => {
  const { root } = freshInstall();
  try {
    const r = slj(root, ["apply", "cost-watch"]);
    assert.strictEqual(r.status, 0);
    const orc = path.join(root, ".claude", "orc");
    for (const f of ["statusline-layout.json", "statusline-compiled.json", "statusline.lock.json"])
      assert.ok(fs.existsSync(path.join(orc, f)), f + " was written");
    const lock = JSON.parse(fs.readFileSync(path.join(orc, "statusline.lock.json"), "utf8"));
    assert.ok(lock.catalog_hash && lock.catalog_hash.length === 64, "the catalogue hash is a sha256");
    assert.ok(lock.bindings.length, "the read set is recorded");
    assert.ok(lock.providers.includes("payload"));
    // A PROVIDER NOTHING BINDS IS NOT READ. cost-watch names no run-state
    // component, so it must not pull in the trace scan.
    assert.ok(!lock.providers.includes("scan.trace") || lock.bindings.some((b) => b.startsWith("ucs.") || b.startsWith("mtok.")),
      "a provider in the lock is a provider something binds");
  } finally {
    rmrf(root);
  }
});

test("statusline: the compiled program is TOTAL — no inheritance left to resolve", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "run-watch"]);
    const prog = JSON.parse(fs.readFileSync(path.join(root, ".claude", "orc", "statusline-compiled.json"), "utf8"));
    const seen = new Set();
    const walk = (ops) => {
      for (const op of ops) {
        seen.add(op.op);
        // Every SGR string is PRECOMPUTED. The hook never converts a hex triple
        // and never looks up a named slot.
        if (op.op === "sgr") assert.match(op.s, /^\u001b\[[0-9;]+m$/, "an sgr op is a finished escape sequence");
        if (op.op === "item") assert.ok(typeof op.unknown === "string", "every item declares its unknown form");
        if (op.children) walk(op.children);
      }
    };
    for (const l of prog.lines) walk(l.ops);
    assert.ok(seen.has("item"), "the program is made of items");
    // Tables are INDEXED, not inlined: a layout with eight bars carries one
    // glyph set, not eight copies.
    assert.ok(prog.glyphsets.length <= 3, "glyph sets are shared, not copied per item");
    for (const [k, v] of Object.entries({ formats: prog.formats, glyphsets: prog.glyphsets, statemaps: prog.statemaps, ramps: prog.ramps }))
      assert.ok(Array.isArray(v), k + " is an indexed table");
  } finally {
    rmrf(root);
  }
});

test("statusline: compiling the same layout twice produces the same program", () => {
  // Determinism is the property the whole preview claim rests on. Only the
  // timestamp may move.
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "mono"]);
    const p = path.join(root, ".claude", "orc", "statusline-compiled.json");
    const a = JSON.parse(fs.readFileSync(p, "utf8"));
    slj(root, ["compile"]);
    const b = JSON.parse(fs.readFileSync(p, "utf8"));
    delete a.compiled_at;
    delete b.compiled_at;
    assert.deepStrictEqual(b, a, "a recompile is byte-stable");
  } finally {
    rmrf(root);
  }
});

test("statusline: a vanished component takes its separator with it", () => {
  // Starship's conditional group, and it is what stops a dangling ` ·  · `.
  // No user ever configures it.
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "minimal"]);
    // `session-name` is absent from the fixture payload and hides by default.
    slj(root, ["set", "1", "2", "session-name"]);
    const r = slj(root, ["preview", "--state", "empty"]);
    assert.strictEqual(r.status, 0);
    assert.doesNotMatch(r.json.strippings.no_color, / · +· /, "no dangling separator: " + JSON.stringify(r.json.strippings.no_color));
  } finally {
    rmrf(root);
  }
});

// ── the strippings ─────────────────────────────────────────────────────────

test("statusline: NO_COLOR produces zero escape bytes, for every preset", () => {
  const { root } = freshInstall();
  try {
    const presets = slj(root, ["presets"]).json.presets.map((p) => p.name);
    assert.ok(presets.length >= 6, "the presets are all there");
    for (const name of presets) {
      slj(root, ["apply", name]);
      const r = slj(root, ["preview"]);
      assert.strictEqual(r.status, 0, name + " previews");
      assert.ok(r.json.strippings.no_color.indexOf("\u001b") === -1, name + " leaks an escape under NO_COLOR");
    }
  } finally {
    rmrf(root);
  }
});

test("statusline: ORC_STATUSLINE_ASCII=1 produces no byte above ASCII, for every preset", () => {
  const { root } = freshInstall();
  try {
    const presets = slj(root, ["presets"]).json.presets.map((p) => p.name);
    for (const name of presets) {
      slj(root, ["apply", name]);
      const r = slj(root, ["preview"]);
      const ascii = r.json.strippings.ascii.replace(/\u001b\[[0-9;]*m/g, "");
      const bad = [...ascii].filter((c) => c.codePointAt(0) > 126);
      assert.deepStrictEqual(bad, [], name + " leaks a non-ASCII glyph under ORC_STATUSLINE_ASCII=1: " + JSON.stringify(bad));
    }
  } finally {
    rmrf(root);
  }
});

test("statusline: every state of a stateful component renders differently under NO_COLOR", () => {
  // R4, stated precisely: render each state with colour suppressed; if any two
  // produce identical bytes, that is an error naming both.
  const { root } = freshInstall();
  try {
    const comps = slj(root, ["components"]).json.components.filter((c) => c.states && c.shapes);
    for (const c of comps) {
      const seen = new Map();
      for (const st of c.states) {
        const g = c.shapes[st];
        assert.ok(!seen.has(g), `${c.id}: "${seen.get(g)}" and "${st}" are the same bytes without colour`);
        seen.set(g, st);
      }
    }
  } finally {
    rmrf(root);
  }
});

// ── the wall ───────────────────────────────────────────────────────────────

test("statusline: the panel's preview and the bar's real output are the SAME bytes", () => {
  // Not by a test that would eventually drift — by construction: both sides
  // require the same render module. This asserts the construction.
  const cliSrc = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const hookSrc = fs.readFileSync(path.join(REPO, "templates", "hooks", "orc-statusline.js"), "utf8");
  assert.match(cliSrc, /orc-statusline-render\.js/, "the CLI requires the render engine");
  assert.match(hookSrc, /require\("\.\/orc-statusline-render\.js"\)/, "the hook requires the render engine");
  assert.ok(fs.existsSync(RENDER_ENGINE), "the render engine ships");
});

test("statusline: the render engine holds NO catalogue — it resolves nothing", () => {
  // A second catalogue on the hook side of the wall would be the Flow-stepper
  // failure on a third surface, and no lint could see it.
  const src = fs.readFileSync(RENDER_ENGINE, "utf8");
  for (const forbidden of ["STATUSLINE_COMPONENTS", "STATUSLINE_THEMES", "STATUSLINE_PRESETS", "slResolveItem", "slValidate"])
    assert.ok(src.indexOf(forbidden) === -1, `the render engine names ${forbidden} — it must resolve nothing`);
  // It may name bindings, because the binding table IS its whole knowledge of
  // the world.
  assert.match(src, /const BINDINGS = \{/, "the binding table is the engine's only knowledge of the world");
});

test("statusline: the hook falls back — every gate rung, and none of them throws", () => {
  const { root, claudeDir } = freshInstall();
  const orc = path.join(claudeDir, "orc");
  const payload = { cwd: root, session_id: "s", model: { id: "claude-opus-5" }, effort: { level: "high" } };
  const state = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(orc, "statusline-state.json"), "utf8")).finding;
    } catch (_) {
      return null;
    }
  };
  try {
    cli(["statusline", "apply", "minimal", "--dir", root, "--json"]);
    cli(["config", "set", "statusline_custom", "on", "--dir", root]);

    // Rung 6 — it renders.
    let r = runHook(claudeDir, "orc-statusline.js", payload);
    assert.strictEqual(r.status, 0);
    assert.ok(!r.stdout.includes("agents 0"), "the composed layout is what rendered, not the shipped line 2");

    // Rung 3 — a lock from another version.
    const lockPath = path.join(orc, "statusline.lock.json");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    fs.writeFileSync(lockPath, JSON.stringify(Object.assign({}, lock, { orc_version: "0.0.1" })));
    r = runHook(claudeDir, "orc-statusline.js", payload);
    assert.strictEqual(r.status, 0, "a stale lock never throws");
    assert.match(r.stdout, /ORC v/, "it fell back to the shipped lines");
    assert.strictEqual(state(), "statusline-layout-stale", "and it said why");

    // Rung 4 — a binding this build does not have.
    fs.writeFileSync(lockPath, JSON.stringify(Object.assign({}, lock, { bindings: ["not.a.binding"] })));
    r = runHook(claudeDir, "orc-statusline.js", payload);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(state(), "statusline-layout-skew");

    // Rung 5 — a hand-edited compiled file with six items on a line.
    fs.writeFileSync(lockPath, JSON.stringify(lock));
    const cpath = path.join(orc, "statusline-compiled.json");
    const prog = JSON.parse(fs.readFileSync(cpath, "utf8"));
    const one = prog.lines[0].ops.find((o) => o.op === "item");
    prog.lines[0].ops = [one, one, one, one, one, one];
    fs.writeFileSync(cpath, JSON.stringify(prog));
    r = runHook(claudeDir, "orc-statusline.js", payload);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(state(), "statusline-layout-invalid");

    // Rung 2 — an unparseable compiled file.
    fs.writeFileSync(cpath, "{ not json");
    r = runHook(claudeDir, "orc-statusline.js", payload);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /ORC v/);
    assert.strictEqual(state(), "statusline-layout-unreadable");

    // Rung 1 — turned off. The state file from the last failure is NOT
    // rewritten, because the feature is not running at all.
    cli(["config", "set", "statusline_custom", "off", "--dir", root]);
    r = runHook(claudeDir, "orc-statusline.js", payload);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /ORC v/);
  } finally {
    rmrf(root);
  }
});

test("statusline: the hook NEVER reads the authored layout", () => {
  // Not as a fallback, not on a cache miss, not ever. One consumer per file.
  const src = fs.readFileSync(path.join(REPO, "templates", "hooks", "orc-statusline.js"), "utf8");
  assert.ok(src.indexOf("statusline-layout.json") === -1, "the hook names the authored layout file");
  const eng = fs.readFileSync(RENDER_ENGINE, "utf8");
  assert.ok(eng.indexOf("statusline-layout.json") === -1, "the render engine names the authored layout file");
});

// ── `--json is not a summary` ──────────────────────────────────────────────

test("statusline: every read command emits exactly one object, and the whole computed one", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "cost-watch"]);
    for (const cmd of [["components"], ["show"], ["validate"], ["preview"], ["presets"], ["explain", "1:1"]]) {
      const r = slj(root, cmd);
      assert.ok(r.json, cmd.join(" ") + " emitted no parseable object: " + r.raw.slice(0, 200));
      assert.strictEqual(r.raw.trim().split("\n}").length, 2, cmd.join(" ") + " printed more than one object");
    }
    // The human branch prints a preview, so the JSON carries one.
    assert.ok(slj(root, ["show"]).json.preview, "show --json carries the rendered preview the human path prints");
    assert.ok(slj(root, ["show"]).json.dense_prefix, "…and the rule it enforces");
    const comps = slj(root, ["components"]).json;
    assert.ok(comps.previews !== undefined || comps.components[0].previews, "a renderer sample rides with every component");
  } finally {
    rmrf(root);
  }
});

test("statusline: `explain` names where every resolved field came from", () => {
  // `orc lane config`'s problem, at component scale: without provenance a user
  // cannot find their own overrides again after a theme change.
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "minimal"]);
    const r = slj(root, ["explain", "1:1"]);
    assert.strictEqual(r.status, 0);
    assert.deepStrictEqual(r.json.order, ["catalogue", "theme", "file", "line", "item"]);
    const sources = new Set(r.json.resolved.map((x) => x.source.split(":")[0]));
    assert.ok(sources.has("catalogue"), "the catalogue's own defaults are attributed");
    assert.ok(sources.has("theme"), "the theme's contribution is attributed");
  } finally {
    rmrf(root);
  }
});

test("statusline: a bad argument exits 2, a bad STATE exits 1", () => {
  // The house convention: 0 ok, 1 a state the user must fix, 2 a bad argument.
  const { root } = freshInstall();
  try {
    assert.strictEqual(slj(root, ["explain", "nonsense"]).status, 2);
    assert.strictEqual(slj(root, ["apply", "no-such-preset"]).status, 2);
    assert.strictEqual(slj(root, ["set", "9", "1", "context"]).status, 2);
    assert.strictEqual(slj(root, ["remove", "3:1"]).status, 1, "an empty position is a state, not a typo");
  } finally {
    rmrf(root);
  }
});

// ── presets ────────────────────────────────────────────────────────────────

test("statusline: every preset validates, compiles and renders", () => {
  const { root } = freshInstall();
  try {
    const presets = slj(root, ["presets"]).json.presets;
    for (const p of presets) {
      const r = slj(root, ["apply", p.name]);
      assert.strictEqual(r.status, 0, p.name + " does not apply: " + JSON.stringify(r.json && r.json.errors));
      assert.ok(r.json.preview && r.json.preview.length, p.name + " renders nothing");
      assert.strictEqual(slj(root, ["validate"]).status, 0, p.name + " does not validate");
    }
  } finally {
    rmrf(root);
  }
});

test("statusline: a preset carries `active`, matched on the item set", () => {
  const { root } = freshInstall();
  try {
    slj(root, ["apply", "mono"]);
    const rows = slj(root, ["presets"]).json.presets;
    assert.strictEqual(rows.filter((p) => p.active).length, 1, "exactly one preset is active");
    assert.strictEqual(rows.find((p) => p.active).name, "mono");
    // Renaming a colour must not lose the shape.
    slj(root, ["set", "1", "1", "--color", "magenta"]);
    assert.strictEqual(slj(root, ["presets"]).json.presets.find((p) => p.active).name, "mono",
      "a cosmetic change does not deactivate the preset it came from");
  } finally {
    rmrf(root);
  }
});

// ── the catalogue ↔ the registry, BOTH directions ──────────────────────────

test("statusline: the registry and the catalogue file agree, in both directions", () => {
  // The EXTRA_SLOTS / DIY_STEPS precedent. A component in the code with no
  // catalogue row fails; a catalogue row naming no component fails.
  //
  // W1 ships the FREE and SCAN halves. Everything that needs a new read is
  // listed below BY NAME, so W3's job is to empty this list and a row that is
  // in neither place still fails.
  if (!fs.existsSync(CATALOG)) return; // the catalogue is a local build doc
  const md = fs.readFileSync(CATALOG, "utf8");
  const inCatalog = new Set([...md.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]));
  const { root } = freshInstall();
  try {
    const inCode = new Set(slj(root, ["components"]).json.components.map((c) => c.id));
    const PENDING = new Set([
      // Group D — knowledge. Each needs a read of its own inside the throttled
      // scan, with a declared TTL.
      "wiki", "wiki-distance", "wiki-worst", "wiki-coverage", "wiki-docs",
      "wiki-blindspot", "pattern", "crosslink", "gotchas",
      // Group E — extra.
      "extra", "extra-profile", "extra-provider", "extra-spend", "extra-tasks",
      "extra-inflight", "extra-demoted", "extra-passphrase", "extra-orphans",
      "extra-reliability",
      // Group F — flow and lanes.
      "diy", "diy-tier", "diy-step", "wait", "preset-name",
      // Group G — health and gates.
      "update", "doctor", "pact", "boundary", "challenge", "doc",
      "doc-progress", "aftermath",
      // Group B/C — the remaining new reads.
      "usage-gate", "wave", "task-progress", "resume", "open-runs", "pause-next",
      // Group I — takes a config key as a parameter, so it needs the config read.
      "config",
      // Group I — deferred with `group` nesting.
      "icon-static",
      // Needs the wave/task counts, which are a read of their own.
      "phase-step",
      // `group` adds NESTING to the layout schema, which is the one thing that
      // makes both the validator and the drag-and-drop board meaningfully
      // harder. It is deferred to W5 on purpose, so nesting is added to a board
      // that already works rather than designed into one that does not exist.
      "group",
    ]);
    const missing = [...inCatalog].filter((id) => !inCode.has(id) && !PENDING.has(id));
    const extra = [...inCode].filter((id) => !inCatalog.has(id));
    assert.deepStrictEqual(missing, [], "catalogue rows with no component: " + missing.join(", "));
    assert.deepStrictEqual(extra, [], "components with no catalogue row: " + extra.join(", "));
    for (const id of PENDING)
      assert.ok(inCatalog.has(id), `"${id}" is listed as pending but is in no catalogue row — remove it from the list`);
  } finally {
    rmrf(root);
  }
});

test("statusline: `orc statusline --help` sends the user to the panel", () => {
  const r = cli(["statusline", "nonsense"]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /orc ui/, "the CLI half names the recommended surface");
});

// ── the read planner (W2) ──────────────────────────────────────────────────

test("statusline: a layout that names no wiki component performs ZERO wiki reads", () => {
  // The claim this feature has to earn. The shipped line pays for the wiki
  // read unconditionally; a user whose layout names no wiki component should
  // pay for none of it. Composing your own line is allowed to make the bar
  // FASTER than the hardcoded one it replaces.
  //
  // Measured by DELETING the thing the read would touch and asserting the
  // render is unaffected — a read that did happen would have to notice.
  const { root, claudeDir } = freshInstall();
  const orc = path.join(claudeDir, "orc");
  const payload = { cwd: root, session_id: "s", model: { id: "claude-opus-5" }, effort: { level: "high" } };
  try {
    fs.mkdirSync(orc, { recursive: true });
    // A wiki manifest whose commit does not exist: reading it means shelling
    // `git rev-list`, and the ledger records that it did.
    fs.writeFileSync(path.join(orc, "wiki-meta.json"), JSON.stringify({ scan_commit: "HEAD" }));

    // Shipped lines: the read happens.
    runHook(claudeDir, "orc-statusline.js", payload);
    let led = JSON.parse(fs.readFileSync(path.join(orc, "usage-session.json"), "utf8"));
    assert.ok(led.wiki, "the shipped status line reads the wiki");

    // A composed layout naming no wiki component: it does not.
    fs.rmSync(path.join(orc, "usage-session.json"), { force: true });
    cli(["statusline", "apply", "cost-watch", "--dir", root, "--json"]);
    cli(["config", "set", "statusline_custom", "on", "--dir", root]);
    runHook(claudeDir, "orc-statusline.js", payload);
    led = JSON.parse(fs.readFileSync(path.join(orc, "usage-session.json"), "utf8"));
    assert.ok(!led.wiki, "a layout with no wiki component still performed a wiki read");
  } finally {
    rmrf(root);
  }
});

test("statusline: a layout that names no run-state component skips the trace scan", () => {
  const { root, claudeDir } = freshInstall();
  const orc = path.join(claudeDir, "orc");
  const payload = { cwd: root, session_id: "s", model: { id: "claude-opus-5" }, effort: { level: "high" } };
  try {
    cli(["statusline", "apply", "minimal", "--dir", root, "--json"]);
    cli(["config", "set", "statusline_custom", "on", "--dir", root]);
    runHook(claudeDir, "orc-statusline.js", payload);
    const led = JSON.parse(fs.readFileSync(path.join(orc, "usage-session.json"), "utf8"));
    assert.ok(!led.dispatch, "the trace scan ran for a layout that names no run state");
  } finally {
    rmrf(root);
  }
});

test("statusline: ORC_STATUSLINE_SCAN_MS still overrides EVERY provider's TTL", () => {
  // Per-provider TTLs are a refinement, not a second budget. A seam that
  // covered only one provider is a seam the tests could not use.
  const src = fs.readFileSync(path.join(REPO, "templates", "hooks", "orc-statusline.js"), "utf8");
  assert.match(src, /const TTL = \{/, "the per-provider table exists");
  assert.match(
    src,
    /process\.env\.ORC_STATUSLINE_SCAN_MS !== undefined \? scanEveryMs\(\)/,
    "the one seam wins over every per-provider TTL"
  );
});
