"use strict";
// @test-pool pure  — reads bin/webui sources as strings
// v0.43.0 — `orc ui` and the `--json` surface it stands on.
//
// Two failure modes drive every case here.
//
// (1) The --json contract is what makes the UI possible AT ALL: the server
//     parses stdout, so a command that prints one stray banner line beside its
//     object breaks a panel — and it does so silently, because the human path
//     still looks perfect. Every flagged command is therefore checked for
//     EXACTLY ONE object and an UNCHANGED exit code (several of those codes are
//     already contracts: pattern status, wiki impact, pr stack status).
//
// (2) The server can WRITE config, so it is a write surface on a machine that
//     may be shared. Auth, the loopback Host guard and the method guard are not
//     nice-to-haves; a regression in any of them is the whole vulnerability.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { cli, rmrf, tmpdir, freshInstall, REPO, WEBUI, appJs, appCss, appHtml, assetRefs, panelJs, panelCss, fixtureSrc, i18nNamespaces, i18nTable, webuiFiles } = require("../_helpers");

const CLI = path.join(REPO, "bin", "cli.js");
const LOCK_REL = path.join(".claude", "orc", "ui.lock");

// The shipped string tables. English is the FALLBACK table every other language
// falls back to, so it is loaded separately as well as in the pair.
const en = i18nTable("en");
const TABLES = { en, id: i18nTable("id") };

// Per-panel invariants, and they are all the same rule: the panel RENDERS what
// the CLI COMPUTES and decides nothing about it. It never derives an order, a
// tier, an estimate or a price the CLI already emits, and the CLI's state words
// are the ONLY state words — never a friendlier synonym.
//
// Split out of webui.test.js in v0.48.1, alongside bin/webui/ itself.

test("experiment: the lane list the tour points at is expanded", () => {
  const panel = panelJs("experiment");
  assert.match(panel, /collapsed:\s*false/, "the Lanes section must render expanded");
  assert.ok(!/collapsed:\s*true/.test(panel), "nothing on this panel may ship collapsed while the tour targets it");
  // And the tour really does target it, so the two stay tied together.
  assert.match(appJs(), /selector: "\.lane-list", title: "tour\.7\.title"/, "the tour step must still point at .lane-list");
});

// v0.43.4 — the Experiment panel moves the "never spawns claude" boundary by
// exactly one step, and these are the rails that keep it there.
test("experiment: the launcher takes no command from the browser", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const i = api.indexOf("function launchClaude");
  assert.ok(i > 0, "the launcher must exist");
  const fn = api.slice(i, api.indexOf("\n}", i));

  // The cwd is the server's own project root, never anything from a request.
  assert.match(fn, /const cwd = ctx\.projectRoot/, "cwd must come from the server, never the client");
  assert.ok(!/body\.|req\./.test(fn), "no request data may reach the spawn");
  // `claude` is a literal in every branch — never interpolated from input.
  assert.ok(!/\$\{(?!JSON)/.test(fn.replace(/JSON\.stringify\(cwd\)/g, "")) || /claude/.test(fn), "the binary must be a literal");

  // The route resolves a lane id against a server-side catalog and 400s
  // otherwise, so an arbitrary string can never become a command.
  const route = api.slice(api.indexOf('"/api/experiment/launch"'));
  assert.match(route, /LANES\.find/, "the lane must be looked up in the server's catalog");
  assert.match(route, /unknown lane/, "an unrecognised lane must be refused");
});

test("experiment: the panel still renders no model output", () => {
  const js = appJs();
  const i = js.indexOf("PANELS.experiment");
  const panel = js.slice(i, js.indexOf("PANELS.maintenance"));
  // The handoff is fire-and-forget. If this panel ever starts polling a job or
  // streaming output, the boundary has moved again and that must be deliberate.
  assert.ok(!/api\/job|refreshJob|EventSource|WebSocket/.test(panel), "the panel must not follow the session it launched");
});

test("crosslink: the UI writes only by shelling the CLI's own add", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");

  assert.match(api, /"\/api\/crosslink\/add":/, "the UI needs a write route");
  const build = api.slice(api.indexOf('"/api/crosslink/add":'), api.indexOf('"/api/crosslink/add":') + 600);
  assert.match(build, /"crosslink",\s*"add"/, "it must shell `orc crosslink add`");
  // The panel must never learn to write the YAML itself — that config has one
  // writer by contract, and a second one is the drift the whole design avoids.
  assert.ok(!/orc-crosslink\.config\.yaml/.test(api), "the API must never touch the crosslink config directly");

  // The non-interactive add must reject exactly what the prompt rejects.
  const add = cli.slice(cli.indexOf("function crosslinkAdd"));
  for (const guard of ["invalid slug", "is taken", "at least one kind", "--via must be one of", "is not this repo"]) {
    assert.ok(add.includes(guard), `crosslink add must guard: ${guard}`);
  }
});

// v0.43.7 — the Flow stepper draws the pipeline, and it must draw the REAL one.
//
// The whole value of the picture is that it agrees with what compiles. The
// panel is only allowed to render `steps[]`; the moment it starts deciding the
// order (or which phases are on) from the raw keys, there are two ideas of the
// pipeline and no lint that can see the difference.
test("flow stepper: the panel renders the CLI's steps[], it never derives them", () => {
  const js = appJs();
  const i = js.indexOf("function stepperCard");
  assert.ok(i > 0, "the stepper must exist");
  const fn = js.slice(i, js.indexOf("function jumpToKey"));

  assert.match(fn, /d\.steps\.forEach/, "it must iterate the CLI's steps[]");
  // A hardcoded phase list in the panel IS the drift this design forbids.
  for (const phase of ["analyze", "planning", "scoring", "testgen", "mock-example"]) {
    assert.ok(!fn.includes(`"${phase}"`), `the panel must not name the phase "${phase}" itself`);
  }
  // OFF is a state of a step that is still drawn, never a filter.
  assert.ok(!/steps\.filter\([^)]*\.on\)\s*\.forEach/.test(fn), "an off phase must keep its slot, not be filtered out");
  assert.match(fn, /step-off/, "off phases must be marked so the stylesheet can red them");

  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.step-off\s*\{[^}]*border-color:\s*var\(--bad\)/, "an off phase is drawn RED, not merely dimmed");
  assert.match(css, /\.step-link/, "the connectors carry the left-to-right sweep");

  // v0.44.0 — the sweep LOOPS. It was one-shot, and said the one thing this
  // card exists to say ("these run in this order") before the card had finished
  // arriving, with no way to see it again short of a recompile.
  const sweep = css.slice(css.indexOf(".step-flow {"), css.indexOf(".step-flow {") + 400);
  assert.match(sweep, /infinite/, "the connector sweep must loop");
  assert.match(css, /--sweep:/, "the cycle length must be one variable, shared by the steps and the connectors");
  // A loop is only tolerable because it is mostly IDLE. Both pulse keyframes
  // must return to rest well before the cycle ends — a pulse that fills its
  // cycle is a flashing sign above a form.
  for (const name of ["step-pulse", "step-pulse-off"]) {
    const kf = css.slice(css.indexOf("@keyframes " + name + " {"), css.indexOf("@keyframes " + name + " {") + 400);
    assert.match(kf, /0%,\s*1[0-9]%,\s*100%/, `${name} must be at rest for most of the cycle`);
  }
  // Reduced motion means NO motion. Capping the iteration count would still
  // fire it once and leave the connector collapsed at its last keyframe, so
  // both halves are removed outright.
  const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(rm, /\.step, \.step::before\s*\{\s*animation:\s*none/, "reduced motion must remove the step pulse outright");
  assert.match(rm, /\.step-flow\s*\{\s*display:\s*none/, "reduced motion must remove the connector sweep outright");

  // The pulse rides an OVERLAY, never the step's own border/background: a
  // running animation beats a transition on the same property, so pulsing the
  // step itself forever would have silently killed `button.step:hover`.
  assert.match(css, /\.step::before\s*\{[^}]*animation:\s*step-pulse/, "the pulse must live on the overlay");
  const stepRule = css.slice(css.indexOf(".step {"), css.indexOf(".step {") + 700);
  assert.ok(!/animation:[^;]*step-pulse/.test(stepRule), ".step must not animate its own colours");
  assert.match(stepRule, /isolation:\s*isolate/, "the overlay's negative z-index must be scoped to the step");
  assert.match(css, /button\.step:hover\s*\{[^}]*border-color/, "hover feedback must survive the loop");
});

// v0.44.0 — the scrollbar under the stepper was the loudest thing on a card
// whose whole job is to be read as a diagram: an opaque platform slab with its
// own track colour, cutting a hard band across the bottom of the rail.

test("flow keys: a closed set renders as a dropdown built from the CLI's options", () => {
  const js = appJs();
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");

  const fn = js.slice(js.indexOf("async function renderFlow"), js.indexOf("function bannerLine"));
  assert.match(fn, /k\.options && k\.options\.length/, "a key with options must become a select");
  assert.match(fn, /el\("select", "select-input"\)/, "the control is a real <select>");
  // No hardcoded value list anywhere in the panel.
  for (const v of ["blocking-only", "own-planner", "report-only", "hands-off"]) {
    assert.ok(!js.includes(`"${v}"`), `the panel must not name the flow value "${v}" itself`);
  }
  // A value outside its own set (an unset fixed_executor) is still SHOWN, and
  // shown as unpickable — the validator would refuse it back.
  assert.match(fn, /ph\.disabled = true/, "an out-of-set value must be shown but not offered");

  // The CLI half: `options` is emitted straight off DIY_META.
  const show = cli.slice(cli.indexOf("function diyShow"), cli.indexOf("function diyInteractive"));
  // v0.52.0 (D8): `fixed_executor` may also name a FOREIGN target, so its list is
  // DIY_META's plus the project's verified profiles. The rule is unchanged — the
  // set is still the CLI's and the panel still names no value of its own.
  assert.match(show, /options: m\.options$/m, "diy show --json must publish each key's closed set");
  assert.match(show, /extraFixedTargets\(claudeDir\)/, "a foreign target is offered from the ledger, not from DIY_EXECUTORS");
  assert.match(show, /m\.options\.map\(String\)/);
});

// v0.44.0 — the panel could tune a flow key by key but never START one from a
// known shape, which is the terminal composer's very first question.
test("flow presets: the bootstrap shapes are the CLI's, and applying one is confirmed", () => {
  const js = appJs();
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");

  assert.match(cli, /\.\.\.Object\.entries\(DIY_PRESETS\)\.map/, "diy show --json must publish the preset catalog");
  const fn = js.slice(js.indexOf("function presetCard"), js.indexOf("function confirmPreset"));
  assert.match(fn, /d\.presets/, "the panel must render the CLI's presets, not its own list");
  // The names are the CLI's; the panel must not carry a copy of them.
  for (const name of ["paranoid", "solo-fast"]) {
    assert.ok(!js.includes(`"${name}"`), `the panel must not name the preset "${name}" itself`);
  }
  // It sits directly under the gate card, which is what the deep-link anchors on.
  assert.match(js, /out\.append\(gate\);[\s\S]{0,400}presetCard\(d, body\)/, "the presets belong immediately below the gate");

  // `--force` is what makes this an answer on an already-configured project,
  // and it REPLACES the config — so it is confirmed, and the loss is named.
  const route = api.slice(api.indexOf('"/api/diy/preset"'), api.indexOf('"/api/diy/preset"') + 400);
  assert.match(route, /"diy", "init", "--force"/, "it must shell the CLI's own bootstrap");
  assert.match(route, /if \(b\.name\) argv\.push\("--preset"/, "an empty name is the wizard's full-lane defaults");
  const confirm = js.slice(js.indexOf("function confirmPreset"), js.indexOf("function confirmPreset") + 1600);
  assert.match(confirm, /modal\(/, "applying a preset must be confirmed");
  assert.ok(en["flow.presetOverwrite"], "the confirmation must say what is replaced");
});

// v0.44.1 — the preset you are already on must not offer to overwrite itself.
test("flow presets: the active shape is CLI-detected and ignores the flow's name", () => {
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const js = appJs();

  const show = cli.slice(cli.indexOf("function diyShow"), cli.indexOf("function diyInteractive"));
  // flow_name is a LABEL. Renaming `solo-fast` to `solo` must not make the
  // panel forget which shape the flow came from, so it is excluded from the
  // match on both the defaults row and every preset row.
  const excl = show.match(/k === "flow_name"/g) || [];
  const exclDefaults = show.match(/m\.key === "flow_name"/g) || [];
  assert.ok(excl.length >= 1 && exclDefaults.length >= 1, "the match must exclude flow_name on both rows");
  assert.match(show, /active: !!cfg && Object\.entries\(changes\)\.every/, "a preset is active when every key it sets still holds that value");
  // The empty-name row is the wizard's own first option, not a UI invention.
  assert.match(show, /\{ name: "", changes: \{\}, active:/, "the catalog must lead with full-lane defaults");

  const fn = js.slice(js.indexOf("function presetCard"), js.indexOf("const presetCommand"));
  assert.match(fn, /p\.active/, "the panel must read the CLI's verdict, not recompute it");
  assert.match(fn, /if \(!p\.active\)/, "the active row must not render a Use button");
  assert.match(fn, /preset-active/, "the active row is marked so the stylesheet can show it");
  // It keeps its ROW: removing it would make "you are on lean" and "lean does
  // not exist" render identically.
  assert.ok(!/presets\.filter/.test(fn), "an active preset keeps its row, it is never filtered out");
});

// v0.44.1 — writes are BATCHED. Every control used to commit on the spot: one
// click, one subprocess, one full re-render that scrolled the list away.
test("edits: nothing is written until Apply, on Settings and on Flow alike", () => {
  const js = appJs();

  assert.match(js, /function editSet\(/, "there must be one staging mechanism");
  assert.match(js, /function editBar\(/, "and one bar that commits it");
  // Staging a value back to what it already was must CLEAR the edit, or Cancel
  // and "set it back by hand" would disagree about whether anything is pending.
  const set = js.slice(js.indexOf("    set(key, value, original) {"), js.indexOf("    reset(key) {"));
  assert.match(set, /map\.delete\(key\)/, "re-staging the original value must drop the edit");

  // No control may write directly any more.
  const control = js.slice(js.indexOf("function controlFor(k, edits)"), js.indexOf("// The Settings edit bar."));
  assert.ok(!/post\(/.test(control), "a Settings control must stage, never post");
  assert.match(control, /edits\.set\(k\.key/, "it stages against the edit set");
  // Nothing re-renders until Apply, so a control has to repaint its own state.
  assert.match(control, /const paint = \(v\) =>/, "a segmented control must follow its own click");

  const flow = js.slice(js.indexOf("async function renderFlow"), js.indexOf("function bannerLine"));
  assert.match(flow, /editSet\(/, "the flow keys stage too");
  assert.match(flow, /keys\.append\(bar\)/, "the flow bar sits at the bottom of the keys card");

  // Apply runs the staged writes one at a time and never aborts the rest — the
  // remaining writes are independent, and stopping halfway leaves a state
  // nobody chose.
  const apply = js.slice(js.indexOf("async function applyEdits"), js.indexOf("function settingRow"));
  assert.match(apply, /for \(const \[key, e\] of list\)/, "writes run in staged order");
  assert.ok(!/break;/.test(apply), "a refused write must not abort the remaining ones");
  assert.match(apply, /failed\.push/, "every failure is reported by key");

  // Cancel is offered ONLY when there is something to cancel.
  const bar = js.slice(js.indexOf("function editBar(edits,"), js.indexOf("// Apply runs the staged writes"));
  assert.match(bar, /if \(n\) actions\.append\(cancel\)/, "Cancel appears only while dirty");
  assert.match(bar, /apply\.disabled = n === 0/, "Apply is inert with nothing staged");
  // A count is not a change list: the pending keys are named.
  assert.match(bar, /edit-chip/, "the pending edits must be named, not counted");

  for (const k of ["edits.apply", "edits.cancel", "edits.resetAll", "edits.pending"]) {
    assert.ok(en[k], `the edit bar needs a label for ${k}`);
  }
});

// v0.44.1 — the ring is `position: fixed` at coordinates measured ONCE, and
// this page grows things above the fold on its own schedule: the update banner
// lands after a network check, doctor's banners after that, and the upgrade row
// fills in a version chip of its own. Every one pushed the target down and left
// the spotlight framing empty space.

test("maintenance: the global update is boxed off, previewed globally, and labelled", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const js = appJs();

  const entry = api.slice(api.indexOf('"update-global": {'), api.indexOf('"update-global": {') + 300);
  assert.match(entry, /apply: \["update", "--global"\]/, "it must shell the real command");
  // The preview has to read the SAME place the apply would write, or it is a
  // report about the project dressed up as one about ~/.claude.
  assert.match(entry, /preview: \["doctor", "--global"\]/, "the preview must target the global install too");
  assert.match(entry, /advanced: true/, "it must be flagged advanced so the panel boxes it off");

  // It is the ONLY global reach: config never merges, so a global config write
  // would silently outrank the project file every other panel here edits.
  assert.ok(!/"config",\s*"set"[^\]]*--global/.test(api), "config is never written globally");

  assert.match(js, /if \(anyAdvanced\) out\.append\(advanced\)/, "the advanced box appears only when something is in it");
  assert.match(js, /t\("maintenance\.globalWarn"\)/, "the preview must say it writes outside this project");
  assert.ok(en["maintenance.advanced"] && en["maintenance.globalNote"], "the advanced section needs its labels");
});

// v0.44.0 — a spotlight can only work on something you can SEE.
//
// The upgrade row is the fourth action on Maintenance and sits below the fold
// on a normal window, so arriving from the changelog's "go upgrade" drew the
// ring off screen and left the popover pointing at nothing.

test("crosslink design: a computed layout, and the CLI's own state words", () => {
  const js = appJs();
  const i = js.indexOf("function vaultCard");
  assert.ok(i > 0, "the vault graph must exist");
  const fn = js.slice(i, js.indexOf("function svgEl"));

  assert.match(fn, /Math\.cos|Math\.sin/, "peers sit at computed angles");
  // A sim would place the same config differently on every open.
  for (const sim of ["requestAnimationFrame(function tick", "velocity", "repulsion"]) {
    assert.ok(!fn.includes(sim), `the layout must be computed, not simulated (${sim})`);
  }
  // Both spellings of "this repo" must resolve, or an edge silently vanishes.
  assert.match(fn, /pos = \{ \[d\.self\]: hub, self: hub \}/, "links name self as either the literal 'self' or the repo name");
  assert.match(fn, /if \(!a \|\| !b\) return/, "an edge naming an unknown repo is skipped, never drawn to nowhere");
  assert.ok(!/preserveAspectRatio/.test(fn), "stretching a viewBox squashes every label and stroke with it");
  for (const word of ["missing", "no wiki", "unregistered", "corrupt"]) {
    assert.ok(fn.includes(`"${word}"`), `the chip must repeat the CLI's own state word: ${word}`);
  }

  // Two tabs, and the empty Design tab must point at the one that fills it.
  const panel = js.slice(js.indexOf("async function renderCrosslink"), js.indexOf("function designView"));
  assert.match(panel, /crosslink\.tab\.design/, "a Design tab");
  assert.match(panel, /crosslink\.tab\.settings/, "a Settings tab");
  assert.match(panel, /tab-spot/, "with nothing linked, the tab that can fix that is spotlighted");
  assert.match(panel, /select\(live \? "design" : "settings"\)/, "nothing to draw → Settings opens selected");
  // The Settings tab holds several cards; the container owns the gap.
  assert.match(panel, /el\("div", "tab-pane stack"\)/, "the pane must space the blocks it holds");

  const css = appCss();
  const rm = css.slice(css.indexOf("@media (prefers-reduced-motion"));
  assert.match(rm, /\.vault-pulse\s*\{\s*display:\s*none/, "the one infinite animation must be removed, not merely capped");
});

// v0.43.7 — repo boxes overlapped, and the reason is worth pinning: the ring
// radius was a FRACTION of the container ("0.34 of the height") while the boxes
// were fixed pixels, so nothing in the layout knew how big a box was. Three
// peers were enough to pile them on top of each other.
//
// The radii are solved from the box size now, so "no two repos overlap" is a
// property that can be CHECKED rather than eyeballed — which is what this does,
// by running the shipped ringRadii() over every node count that fits on screen.
test("crosslink design: no two repo boxes can overlap, at any node count", () => {
  const js = appJs();
  const m = js.match(/const VAULT = \{ W: (\d+), H: (\d+), GAP: (\d+), PAD: (\d+) \}/);
  assert.ok(m, "the box metrics must be declared in one place");
  const VAULT = { W: +m[1], H: +m[2], GAP: +m[3], PAD: +m[4] };

  // The CSS box and the box the maths solves for MUST be the same box. This is
  // the drift that reintroduces the bug: widen the card in CSS alone and the
  // radii are computed against a box that no longer exists.
  const css = appCss();
  const rule = css.slice(css.indexOf(".vault-node {"), css.indexOf(".vault-node {") + 500);
  assert.strictEqual(+rule.match(/width:\s*(\d+)px/)[1], VAULT.W, "CSS width must equal VAULT.W");
  assert.strictEqual(+rule.match(/height:\s*(\d+)px/)[1], VAULT.H, "CSS height must equal VAULT.H");
  assert.match(rule, /box-sizing:\s*border-box/, "padding and border must count inside the fixed size");

  // Run the real function, not a copy of its arithmetic.
  const ringRadii = new Function(
    "VAULT",
    js.slice(js.indexOf("function ringRadii"), js.indexOf("function vaultCard")) + "; return ringRadii;"
  )(VAULT);

  for (let n = 1; n <= 16; n++) {
    const { rx, ry } = ringRadii(n);
    assert.ok(Number.isFinite(rx) && Number.isFinite(ry), `n=${n}: radii must be finite (n=1 has no neighbour pair)`);

    const pts = [[0, 0, "hub"]];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      pts.push([rx * Math.cos(a), ry * Math.sin(a), "peer" + i]);
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = Math.abs(pts[i][0] - pts[j][0]);
        const dy = Math.abs(pts[i][1] - pts[j][1]);
        // Boxes are centred on their point: they miss each other only if they
        // are clear on one axis or the other.
        assert.ok(
          dx - VAULT.W >= -0.01 || dy - VAULT.H >= -0.01,
          `n=${n}: ${pts[i][2]} and ${pts[j][2]} overlap (dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}, box ${VAULT.W}x${VAULT.H})`
        );
      }
    }
  }

  // A ring wide enough not to collide can exceed the panel — that must scroll,
  // never squeeze the ring back into a collision.
  const fn = js.slice(js.indexOf("function vaultCard"), js.indexOf("function svgEl"));
  assert.match(fn, /el\("div", "scroll-x"\)/, "a graph wider than the panel scrolls in its own container");
  assert.ok(!/max-width/.test(rule), "a max-width on the box would shrink it below the size the maths assumes");
});

// v0.43.4 — a finding must name a command that actually clears it.
//
// `global-retired-agents` told users to run `orc update --global`. That can
// never work: the names it reports were retired BEFORE the manifest now on disk
// was written, so no manifest claims them, and the auto-prune only deletes what
// a previous manifest proves ORC owned. The candidate sweep that does catch
// them is gated on `--prune`. So the finding reappeared after every "fix",
// which reads as a broken tool rather than a wrong instruction.
test("doctor: the retired-agent finding names a command that actually deletes them", () => {
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const i = cli.indexOf("global-retired-agents");
  assert.ok(i > 0, "the finding must exist");
  // The message and its structured fix_command, up to the end of the warn call.
  const block = cli.slice(i, i + 1400);

  assert.match(block, /orc update --global --prune/, "the advice must include --prune, or it never clears");
  assert.match(block, /fix_command/, "the working command must also be machine-readable for the UI");
  // A bare `orc update --global` recommendation is the exact regression: it is
  // only correct for version skew, never for an unowned orphan.
  assert.ok(
    !/`orc update --global`(?! --prune)/.test(block),
    "a bare `orc update --global` cannot clear an orphan no manifest claims"
  );
});

// v0.43.3 — the motion added here is only acceptable because it is all
// switchable off, and one of these rules is load-bearing rather than tidy.

test("ui: the update check is surfaced, and never invented in the browser", () => {
  const js = appJs();
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");

  // The comparison belongs to the CLI, which owns the semver rules and the
  // cache. The browser must never diff version strings itself.
  assert.match(api, /"\/api\/version":\s*\(\)\s*=>\s*\["version"\]/, "the version route must shell the real CLI");
  assert.ok(
    !/semver|localeCompare\(.*version|parseInt\(.*version/i.test(js),
    "the panel must not compare versions itself — `update_available` comes from the CLI"
  );
  assert.match(js, /update_available/, "the CLI's own verdict must be what the UI reads");

  // One check per page load, shared by the tile, the rail and the upgrade row.
  assert.match(js, /versionPromise\s*=\s*versionPromise\s*\|\|/, "the version check must be shared, not repeated per consumer");
});

test("overview: a finding routes to the panel that owns its fix", () => {
  const js = appJs();
  const cliSrc = fs.readFileSync(CLI, "utf8");

  assert.match(js, /const FINDING_ROUTE = \{/, "the routing table must exist");
  const table = js.slice(js.indexOf("const FINDING_ROUTE = {"), js.indexOf("const DEFAULT_FINDING_ROUTE"));
  assert.match(table, /"diy-stale":\s*\{\s*panel:\s*"flow"/, "a stale DIY flow is recompiled on Flow, not Maintenance");
  // A finding with nothing to press anywhere must offer no button at all rather
  // than a button that goes somewhere useless.
  assert.match(table, /"trace-pointer-dangling":\s*\{\s*panel:\s*null/, "a self-clearing finding gets no destination");
  assert.match(js, /const DEFAULT_FINDING_ROUTE = \{ panel: "maintenance"/, "install-footprint findings still go to Maintenance");

  // The ids are the CLI's. A renamed finding must not silently fall back to the
  // default route, so both routed ids are checked against the source.
  for (const id of ["diy-stale", "trace-pointer-dangling"]) {
    assert.ok(cliSrc.includes(`"${id}"`), `orc doctor must still emit the finding id "${id}"`);
  }
});

// v0.43.6 — an AGING wiki is not an error, it is the moment a refresh is still
// cheap. The Overview said so with a colour and nothing else.
test("overview: the wiki tier turns into advice, not just a colour", () => {
  const fn = panelJs("overview");

  assert.match(fn, /w\.tier === "AGING"/, "an AGING wiki must produce a recommendation");
  assert.match(fn, /overview\.item\.wikiAging/, "and it must be a titled, explained item");
  assert.match(fn, /w\.state !== "registered"/, "an unregistered wiki must be offered the free sync");
  assert.match(fn, /p\.patterns \|\| \[\]/, "a missing code pattern is worth surfacing too");

  // The refresh itself costs a model, so the panel must never claim it can do
  // it — every language has to keep that caveat.
  for (const [code, table] of Object.entries(TABLES)) {
    assert.match(table["overview.item.wikiAging.body"] || "", /model|Claude Code/i, `${code} must say a refresh runs in Claude Code`);
  }
});

// v0.43.6 — Runs is an accordion. The old list-plus-detail-box put the detail
// further from the row the longer the list got.
test("runs: a row expands in place instead of rendering a box below the list", () => {
  const js = appJs();
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");

  // The split layout is gone — there is no second column to render into.
  assert.ok(!/const detailSlot/.test(js), "there must be no separate detail slot");
  assert.ok(!/function showRun\(/.test(js), "the detail renderer must fill the row's own pane");
  // The signature grew a third parameter in v0.46.0 (the aftermath grade, which
  // renders INSIDE the expanded row), so the assertion pins the first two — the
  // pane and the slug are what make this "the row that asked for it".
  assert.match(js, /function loadRunDetail\(pane, slug(, \w+)?\)/, "detail is loaded into the row that asked for it");
  // …and the aftermath detail goes in that same pane, not a box below the list.
  assert.match(js, /const ab = afterBox\(grade\);/, "the aftermath detail renders inside the expanded row");

  // The fold animates the same way the settings tiers do: `height: auto` cannot
  // be transitioned, and the inner element is what collapses against.
  assert.match(css, /\.run-body\s*\{[^}]*grid-template-rows:\s*0fr/, "the fold must start closed");
  assert.match(css, /\.run-row\.open > \.run-body\s*\{[^}]*grid-template-rows:\s*1fr/, "and open to 1fr");
  assert.match(css, /\.run-body-inner\s*\{[^}]*min-height:\s*0/, "the inner element is what collapses against");

  // One row at a time: two open rows re-create the scrolling problem.
  assert.match(js, /const collapseAll = \(except\)/, "opening a row must close the others");
  // Detail is fetched once per row and kept, so re-opening costs nothing.
  assert.match(js, /if \(open && !entry\.loaded\)/, "a row must fetch its detail only on first open");
});

// v0.43.6 — the folder picker. A browser cannot hand back a real path, so the
// server walks the filesystem and the page renders the walk.
test("crosslink: the folder picker lists directories and nothing else", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const js = appJs();
  const fn = api.slice(api.indexOf("function fsList"), api.indexOf("// Open a terminal running"));

  assert.match(fn, /e\.isDirectory\(\)/, "only directories may be listed");
  assert.ok(!/readFileSync|createReadStream/.test(fn), "the picker must never read a file's contents");
  assert.ok(!/spawn|exec/.test(fn), "no path may reach a shell");
  // A path it cannot read is an ANSWER, not a 500 — an unreadable folder is a
  // normal thing to click on.
  assert.match(fn, /return \{ path: target, error:/, "an unreadable folder must return an error field, not throw");
  // The relative path is computed SERVER-side: only the server knows the real
  // separator, and a Windows path assembled with "/" works until it does not.
  assert.match(fn, /path\.relative\(ctx\.projectRoot, target\)/, "the stored relative path is the server's to compute");
  assert.match(fn, /split\(path\.sep\)\.join\("\/"\)/, "and it must be normalised for the config file");

  // GET only, and it never appears in the write table.
  assert.ok(!/\/api\/fs\/list/.test((api.match(/const WRITES = \{[\s\S]*?\n\};/) || [""])[0]), "the picker must not be a write route");
  // Typing a path by hand still works — browsing is an addition, not the gate.
  assert.match(js, /const repoPath = el\("input", "text-input"\)/, "the path field must remain a plain text input");
  assert.match(js, /function pickFolder\(onPick\)/, "and the picker hands back a path to put in it");
});

test("learn: one section at a time, with a contents rail", () => {
  const panel = panelJs("learn");

  // The old shape was every section rendered as a card of monospace text.
  assert.ok(!/for \(const s of d\.sections\) \{\s*\n\s*const c = card\(s\.title\)/.test(panel), "sections must not all render at once");
  assert.match(panel, /learn-nav-item/, "there must be a contents rail");
  assert.match(panel, /function goTo\(i\)/, "and a position you move through");
  assert.match(panel, /LEARN_POS_KEY/, "where you are must survive leaving the panel");

  // The content itself is still the shipped walkthrough — one source, two
  // surfaces. The panel formats it; it never rewrites it.
  const content = fs.readFileSync(path.join(REPO, "bin", "onboarding-content.js"), "utf8");
  assert.match(content, /SECTIONS/, "the walkthrough must still come from onboarding-content.js");
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(panel), "walkthrough text must never be parsed as markup");
});

// bin/ui.js is the TERMINAL styling kit; bin/webui/ is this. Two different
// things, one letter apart — each header names the other so the next reader
// does not have to find that out the hard way.

test("mock-run: every walkthrough on disk is in the catalogue", () => {
  const catalog = require(path.join(REPO, "bin", "mockrun-catalog.js"));
  const cat = catalog.catalogue();

  const files = fs
    .readdirSync(path.join(REPO, "mock-run"))
    .filter((f) => f.endsWith(".md") && f !== "INDEX.md" && f !== "README.md");
  assert.ok(files.length >= 10, `expected the shipped walkthroughs, got ${files.length}`);
  for (const f of files) {
    const slug = f.replace(/\.md$/, "");
    assert.ok(
      cat.docs.some((d) => d.slug === slug),
      `${f} is on disk but not in the catalogue`
    );
  }

  // Grouping decides reading order, and `other` is the honest fallback — but a
  // doc landing there means GROUP_OF was not updated, so the shipped set must
  // never use it.
  const stray = cat.docs.filter((d) => d.group === "other").map((d) => d.slug);
  assert.deepStrictEqual(stray, [], "every shipped walkthrough needs a group in GROUP_OF");

  // Every doc must carry the two things the panel renders it by.
  for (const d of cat.docs) {
    assert.ok(d.title && d.title !== d.slug, `${d.slug} needs a "# " heading`);
    assert.ok(d.summary, `${d.slug} needs a summary line`);
    assert.ok(fs.existsSync(path.join(REPO, d.path)), `${d.slug} points at a missing file`);
  }

  // A lane name is claimed only when the payload really ships that command.
  for (const d of cat.docs.filter((x) => x.lane))
    assert.ok(
      fs.existsSync(path.join(REPO, "templates", "commands", d.lane.slice(1) + ".md")),
      `${d.slug} claims ${d.lane}, which is not a shipped command`
    );

  // One doc, with its body; an unknown slug is null, never a guess.
  assert.ok(catalog.get("orc-pact").body.length > 500);
  assert.strictEqual(catalog.get("no-such-doc"), null);
});

test("mock-run: the CLI and the panel read the same module", () => {
  const cliSrc = fs.readFileSync(CLI, "utf8");
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const fixtures = fixtureSrc();

  assert.match(cliSrc, /require\("\.\/mockrun-catalog\.js"\)/, "the CLI must read the catalogue module");
  assert.match(api, /require\("\.\.\/mockrun-catalog\.js"\)/, "and so must the panel's API");
  // Fixture mode serves the REAL catalogue: it is package content, identical on
  // every machine, so a canned copy could only go stale.
  // fixtures/ is one level deeper than api.js since v0.48.1, hence ../../.
  assert.match(fixtures, /require\("\.\.\/\.\.\/mockrun-catalog\.js"\)/, "fixtures serve the real thing");

  // It is a DIFFERENT command from `orc mock`, which reads mock-examples/ in
  // the user's project. Collapsing the two would make a package doc look like
  // something a run produced.
  assert.match(cliSrc, /case "mock-run":/, "orc mock-run must be its own command");
  assert.match(cliSrc, /case "mock":/, "and orc mock must still exist beside it");
});

test("mock-run: the panel renders markdown as DOM, never as HTML", () => {
  const panel = panelJs("mockrun");
  // renderMd is shared (js/03-md.js) — the assertion is that a renderer exists
  // and that this panel goes through it, never that it owns one.
  const md = fs.readFileSync(path.join(WEBUI, "js", "03-md.js"), "utf8");

  for (const [what, src] of [["the panel", panel], ["the renderer", md]])
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(src), `${what} must never parse walkthrough text as markup`);
  assert.match(md, /function renderMd\(/, "there must be a markdown renderer");
  assert.match(panel, /renderMd\(/, "and this panel must render through it rather than rolling its own");
  assert.match(md, /md-codebox/, "a transcript must render as a code block");
  assert.match(md, /md-table/, "and a table as a table");

  // The panel names no document, no group and no order of its own — same rule
  // as the Flow stepper.
  assert.ok(!/"orc-pact"|"orc-grill"|"Start here"/.test(panel), "the panel must not name a doc or a group itself");

  // Panel prose is translated; CLI-side data never is.
  for (const [code, table] of Object.entries(TABLES)) {
    for (const k of ["nav.mockrun", "mockrun.title", "mockrun.sub", "mockrun.back", "mockrun.lines", "mockrun.linesPlural"])
      assert.ok(table[k], `${code} is missing ${k}`);
  }
});

// The renderer runs over files a maintainer edits by hand, so its failure mode
// is a HANG: one line that every branch declines leaves the cursor where it
// was. This drives it over every shipped document with a tiny DOM shim.
test("mock-run: the markdown renderer terminates on every shipped document", () => {
  const src = appJs();
  const from = src.indexOf("function renderMd(");
  const to = src.indexOf("/* ============================================================== EXPERIMENT ==", from);
  assert.ok(from > 0 && to > from, "the renderer must exist");

  const nodes = [];
  const mk = (tag) => {
    const n = {
      tag,
      className: "",
      textContent: "",
      children: [],
      style: { setProperty() {} },
      classList: { toggle() {}, add() {} },
      setAttribute() {},
      addEventListener() {},
      append(...c) {
        for (const x of c) (x && x.__frag ? n.children.push(...x.children) : n.children.push(x));
      },
      get lastChild() {
        return n.children[n.children.length - 1];
      },
    };
    nodes.push(n);
    return n;
  };
  global.document = {
    createElement: mk,
    createDocumentFragment: () => Object.assign(mk("#frag"), { __frag: true }),
    createTextNode: (s) => ({ data: s }),
  };
  const prelude =
    "const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;" +
    "if(text!==undefined)n.textContent=text;return n;};" +
    "const frag=()=>document.createDocumentFragment();const t=(k)=>k;const copy=()=>{};";
  const renderMd = new Function(prelude + src.slice(from, to) + "\nreturn renderMd;")();
  const docs = require(path.join(REPO, "bin", "mockrun-catalog.js")).list();

  for (const d of docs) {
    nodes.length = 0;
    const body = fs.readFileSync(path.join(REPO, d.path), "utf8");
    renderMd(body, { title: d.title, docs, open() {} });
    assert.ok(nodes.length > 3, `${d.slug} rendered almost nothing`);
  }

  // A malformed table row — a row with no divider under it — is the shape that
  // hung it: every block branch declines it and the paragraph branch used to
  // decline it too.
  nodes.length = 0;
  renderMd("| a | b |\n\ntext after\n", { docs: [], open() {} });
  assert.ok(nodes.length > 0, "a stray table row must still render");

  // A relative link into the catalogue becomes a button; anything else does not
  // pretend to be a link.
  nodes.length = 0;
  renderMd("see [it](orc-pact.md) and [that](../bin/cli.js)\n", { docs, open() {} });
  assert.ok(nodes.some((n) => n.className === "md-doclink"), "a catalogue link opens in the panel");
  assert.ok(nodes.some((n) => n.className === "md-link-flat"), "an unresolvable link renders as plain text");

  delete global.document;
});

// ── v0.49.1 — the council, and the knowledge deepening ──────────────────────

test("challenge panel: it draws the council, it never NAMES a lens", () => {
  const js = panelJs("challenge");

  // THE CATALOGUE IS THE CLI'S. `orc challenge roles --json` is the one list,
  // and the panel is one of its three renderers — the Flow-stepper rule applied
  // to a second table.
  for (const display of [
    "The Contrarian",
    "The Cold Reader",
    "The Outsider",
    "The Executor",
    "The First Principles Thinker",
    "The Expansionist",
  ])
    assert.ok(!js.includes(display), `the panel must not name the lens "${display}" itself`);
  for (const disp of ["out-of-goal", '"adopted"', '"merged"', '"rejected"'])
    assert.ok(!js.includes(disp), `the panel must not carry the disposition word ${disp}`);
  // The agent name and the effort come from the payload, never from here.
  assert.ok(!/orc-challenge-(contrarian|outsider|executor|principles|expansionist)/.test(js), "no agent name in the panel");

  // A NOT-RUN row KEEPS ITS SLOT with its reason, and a NOT-SELECTED row is
  // muted rather than dropped: filtering either out makes "found nothing" and
  // "never ran" identical.
  assert.match(js, /challengeCouncilCard/, "the council has its own card");
  assert.ok(!/council\.filter\([^)]*status === "RAN"\)\s*\.map/.test(js), "a NOT-RUN row is never filtered out of the list");
  assert.match(js, /r\.status === "NOT-RUN" && r\.reason/, "and it carries its reason");

  // An opportunity NEVER blocks and never has a severity, so its card carries
  // no severity colour at all.
  const css = panelCss("challenge").replace(/\/\*[\s\S]*?\*\//g, "");
  const opp = css.slice(css.indexOf(".ch-opportunity"), css.indexOf(".ch-opportunity") + 300);
  assert.ok(opp.length, "the opportunity card is styled");
  assert.ok(!/--bad|--warn|ch-sev-/.test(opp), "no severity colour anywhere in an opportunity");

  // A premise disputes the yardstick every finding was measured against, so it
  // is the loudest thing here when one is open.
  assert.match(css, /\.ch-premise-loud/, "an open premise gets a loud card");
});

test("challenge panel: the version break has a THIRD trigger", () => {
  const js = panelJs("challenge");
  // Comparing an iteration judged by three lenses to one judged by six is not a
  // comparison, so the rail breaks for it exactly as it does for a regoal.
  assert.match(js, /graded_against_council/, "the council version is a break trigger");
  assert.match(js, /`c\$\{it\.graded_against_council/, "and the break is LABELLED as a council change");
});

test("knowledge panel: five tabs, and it derives no tier, order or arithmetic", () => {
  const js = panelJs("knowledge");

  // Five tabs, the Crosslink two-tab precedent. The keys are written out in
  // full — a key assembled from the tab id is invisible to every check.
  for (const key of [
    "knowledge.tab.wiki",
    "knowledge.tab.coverage",
    "knowledge.tab.patterns",
    "knowledge.tab.memory",
    "knowledge.tab.peers",
  ])
    assert.ok(js.includes(`"${key}"`), `the tab key ${key} is written out in full`);

  // It never computes a tier, a coverage percentage or an order.
  assert.ok(!/freshMax\s*[<>]/.test(js), "no freshness arithmetic in the panel");
  assert.ok(!/covered\s*\/\s*tracked/.test(js), "the coverage percentage is the CLI's");
  assert.ok(!/\.sort\(/.test(js), "the panel never re-ranks what the CLI ordered");

  // A value the CLI could not compute is an em dash, never a zero.
  assert.match(js, /=== undefined \? "—"/, "an uncomputable value renders as an em dash");

  // A `used: null` row is NOT zero-use, and coverage says out loud that it is
  // not a target — that line is not optional chrome.
  assert.match(js, /used === null \? "\?"/);
  assert.match(js, /knowledge\.coverage\.notATarget/);

  // Prose is DOM, never HTML, and only on an explicit request.
  assert.match(js, /renderMd\(/, "revealed bodies go through renderMd");
  assert.ok(!/innerHTML/.test(js), "never as HTML");
  assert.match(js, /&body=1/, "the body is opt-in, one artifact at a time");

  // A COUNT IS NOT CONSENT: apply stays disabled until a preview was fetched.
  assert.match(js, /apply\.disabled = true/, "the apply button starts disabled");
  assert.match(js, /gotcha\/prune\/preview/, "and it is a preview endpoint that enables it");
});

test("knowledge panel: both new doctor findings route to the panel that can CLEAR them", () => {
  const js = panelJs("overview");
  // `orc wiki sync` is a BUTTON on Knowledge and `orc wiki plan` is the card
  // above it, so Knowledge genuinely clears both — it is not the fallback.
  assert.match(js, /"wiki-unregistered":\s*\{\s*panel:\s*"knowledge"/);
  assert.match(js, /"wiki-debt":\s*\{\s*panel:\s*"knowledge"/);
});

/* ══════════════════════════════════════════════════════════ v0.49.2 ═══════
   THE CARD CONTRACT. `.run-card` is a GRID, and a grid never complains: the
   Overview built a three-child card against a four-column template, so the
   chip landed in the 16px caret column and printed straight over an 88px-wide
   slug. One column short is not a rounding error, it is the whole card. */

test("run cards: every variant declares its own column count", () => {
  const js = appJs();
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");

  // The base grid, and one explicit variant per optional child.
  assert.match(css, /\.run-card\s*\{[^}]*grid-template-columns:\s*16px 88px minmax\(0, 1fr\) auto/);
  assert.match(css, /\.run-card\.no-caret\s*\{[^}]*grid-template-columns:\s*88px minmax\(0, 1fr\) auto/,
    "a row that NAVIGATES has no caret, so it declares one fewer column");
  assert.match(css, /\.run-card\.has-extra\s*\{[^}]*grid-template-columns:\s*16px 88px auto minmax\(0, 1fr\) auto/,
    "an optional second chip is a fifth child and gets a fifth column");
  assert.match(css, /\.run-card\.no-caret\.has-extra\s*\{/, "and the two combine");

  // Every builder either has a caret or declares `no-caret`; every builder that
  // appends a second chip declares `has-extra`. Both were real collisions.
  assert.match(js, /el\("button", "run-card no-caret"\)/, "the Overview waiting row declares its variant");
  assert.match(js, /headBtn\.classList\.add\("has-extra"\)/, "and a fifth child declares its column");
  // Overview's row fills the three columns its variant HAS, in order.
  assert.match(js, /chip\("waiting", "warn"\)[\s\S]{0,400}el\("div", "run-mid"\)[\s\S]{0,600}el\("div", "run-age"/,
    "chip, mid, age — the same class sequence a Runs row uses, minus the caret");
  // The age column existed and rendered empty. `run list --json` always knew.
  assert.match(js, /overview\.waiting\.since/, "the age column carries the age it never had");

  // Under 900px every variant collapses EXPLICITLY. A variant that inherits a
  // column count it does not have is the same collision at a narrower width.
  const narrow = css.slice(css.indexOf("@media (max-width: 900px)"));
  assert.match(narrow, /\.run-card\.no-caret\s*\{[^}]*grid-template-columns/);
  assert.match(narrow, /\.run-card\.has-extra\s*\{[^}]*grid-template-columns/);
});

test("runs: marking a run done names the file that MOVES, and never says delete", () => {
  const js = appJs();
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");

  // FREE, deterministic and reversible, so it is a button — and the CLI is the
  // only validator: the form does not have a second idea of a valid close.
  assert.match(api, /"\/api\/run\/close":\s*\(b\) => \["run", "close", String\(b\.slug\), "--reason"/);
  assert.match(api, /"\/api\/run\/reopen":\s*\(b\) => \["run", "reopen", String\(b\.slug\)\]/);

  // The confirmation shows the exact command, live, and requires the reason.
  assert.match(js, /function confirmRunClose\(slug, onDone\)/);
  assert.match(js, /orc run close \$\{slug\} --reason/, "the exact command is always visible");
  assert.match(js, /if \(!reason\) return toast\(t\("runs\.close\.needReason"\)/, "a reason is required");

  // It MOVES one file. Never the word "delete" in the strings a user reads.
  const en = JSON.parse(fs.readFileSync(path.join(REPO, "bin", "webui", "i18n", "en", "runs.json"), "utf8"));
  assert.match(en["runs.close.moves"], /MOVED/);
  assert.match(en["runs.close.moves"], /Nothing is deleted/);
  for (const k of Object.keys(en).filter((x) => x.startsWith("runs.close.")))
    assert.ok(!/\bdelet(e|ing)\b/i.test(en[k]) || /Nothing is deleted/.test(en[k]), `${k} must not promise a delete`);

  // The caution routes to the panel that can CLEAR it — and here that is
  // Overview itself, so the button is inline there too.
  assert.match(js, /confirmRunClose\(r\.slug, \(\) => route\(\)\)/, "the Overview waiting card carries the same action");
});

test("docs: the house rules are a TEXT CONFIG, edited as text and staged like every other write", () => {
  const js = appJs();
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");

  // v0.49.5 — ONE write route, because the ledger is one file. The per-priority
  // `set`/`add`/`clear` commands stay a CLI convenience, and `--set-file` /
  // `--reset` still have NO route: throwing away a project's standing rules is
  // a CLI act.
  for (const r of ["setAll", "sync"]) assert.ok(api.includes(`"/api/doc/rules/${r}"`), `the ${r} write is a real route`);
  for (const gone of ["add", "remove", "toggle", "move"])
    assert.ok(!api.includes(`"/api/doc/rules/${gone}"`), `the row-store ${gone} route is gone`);
  // As ARGV, not as prose: the comment above the block names both on purpose.
  assert.ok(!/"--set-file"/.test(api), "a bulk replace is never a panel button");
  assert.ok(!/"--reset"/.test(api), "and neither is a reset");

  // THE CONTROL IS A TEXTAREA, not a form. No priority dropdown, no per-rule
  // Add — that is the whole fix.
  assert.match(js, /el\("textarea", "rule-editor"\)/);
  assert.ok(!/docs\.rules\.addPlaceholder/.test(js), "there is no one-line rule input any more");

  // Nothing is written until Apply, and the pending list is NAMED.
  assert.match(js, /const edits = editSet\(\(\) => bar\.paint\(\)\);/);
  assert.match(js, /await applyActions\(edits, btn\);/);
  assert.match(js, /function applyActions\(edits, button\)/);
  // Typing the text back to what it was CLEARS the edit rather than staging a
  // no-op — the v0.44.1 rule, applied to a textarea.
  assert.match(js, /if \(ta\.value === original\) edits\.drop\("doc-house-rules\.md"\);/);
  // A refused write NEVER aborts the rest, and every failure is reported by key.
  const fn = js.slice(js.indexOf("async function applyActions"));
  assert.match(fn.slice(0, 1200), /failed\.push\(`\$\{key\}:/);

  // THE BOUNDARY IS ALWAYS SHOWN, never on hover — and it is the CLI's words.
  assert.match(js, /el\("div", "note rule-boundary", d\.boundary\)/);
  // The editor is monospaced and resizable: the file has a shape the user edits
  // directly, and a P0 is as long as it needs to be.
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.rule-editor\s*\{[^}]*resize:\s*vertical/);
  assert.match(css, /\.rule-block\s*\{[^}]*white-space:\s*pre-wrap/);
});

test("docs: the run map and the cost report render CLI numbers and compute none", () => {
  const js = appJs();
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");

  // FOUR TOKEN KINDS, NEVER BLENDED — and they are the CLI's own field names,
  // so they are never translated.
  assert.match(js, /const DOC_VEC_KINDS = \["input", "cache_write", "cache_read", "output"\]/);
  for (const k of ["tok-input", "tok-cache-write", "tok-cache-read", "tok-output"])
    assert.ok(css.includes("." + k), `${k} is its own band`);
  // The bar is sized by a CUSTOM PROPERTY: the panel's CSP is `style-src
  // 'self'`, so an inline width is blocked outright.
  assert.match(js, /seg\.style\.setProperty\("--w"/);
  assert.match(css, /\.tok-seg\s*\{[^}]*width:\s*var\(--w\)/);

  // A section nothing joins reads an em dash and KEEPS ITS SLOT.
  assert.match(js, /s\.joined \? kNum\(s\.weighted\) : "—"/);
  assert.match(css, /\.fc-row-unknown/);
  // `unattributed` is ALWAYS printed, including when zero — no conditional.
  assert.match(js, /t\("docs\.cost\.unattributed", \{ blocks: cost\.unattributed\.blocks \}\)/);

  // The low-confidence warning is not optional chrome, and a FREE recompute
  // gets a button while the naive floor is a copy-able command.
  assert.match(js, /docs\.forecast\.lowConfidence/);
  assert.match(js, /laneCommand\(`orc doc forecast \$\{slug\} --naive`/);
});

/* ================================================================= EXTRA ==
   v0.50.0 — `orc ui ▸ Extra`. The panel that can send this repo's source code to
   a third party, so the assertions here are about restraint rather than shape:
   it names nothing the CLI owns, it computes no state, it writes nothing until
   Apply, and a key never reaches argv. */

test("extra panel: it names no provider, no model and no agent", () => {
  const js = panelJs("extra");
  const cat = JSON.parse(fs.readFileSync(path.join(REPO, "bin", "providers.json"), "utf8"));

  // The Flow-stepper rule, applied to a catalog: the panel renders
  // `orc extra providers --json` and derives nothing. A provider id in this file
  // would be a second catalog, and a stale one within a quarter.
  for (const row of cat.providers) {
    assert.ok(!new RegExp('["\']' + row.id + '["\']').test(js), `the panel must not name provider ${row.id}`);
    if (row.label) assert.ok(!js.includes(row.label), `the panel must not name the label ${row.label}`);
  }
  // Model ids are not shipped AT ALL (they rot within a quarter), and an agent
  // name is the resolver's answer, never the panel's.
  assert.ok(!/orc-executor-/.test(js), "an agent name is the CLI's answer, never the panel's");
  assert.ok(!/claude-opus|claude-sonnet|claude-haiku/.test(js), "the panel names no model id");

  // Neither does either string table.
  for (const code of ["en", "id"]) {
    const table = JSON.parse(fs.readFileSync(path.join(WEBUI, "i18n", code, "extra.json"), "utf8"));
    for (const [k, v] of Object.entries(table)) {
      if (typeof v !== "string") continue;
      for (const row of cat.providers)
        if (row.id !== "custom")
          assert.ok(!new RegExp("\\b" + row.id + "\\b", "i").test(v), `${code}.extra.json ${k} names a provider`);
    }
  }
});

test("extra ladder: one vertical row per band, honest widths, and the row you read is the row you edit", () => {
  const js = panelJs("extra");
  const css = panelCss("extra").replace(/\/\*[\s\S]*?\*\//g, "");

  // The v0.43.7 OFF-phase rule: filtering the gaps out would make "I left the
  // top band on Claude on purpose" and "there is no top band" identical. The
  // ladder renders `rows`, which the CLI already fills with the Claude
  // fall-through — so there is no filter here at all, and that is the assertion.
  assert.ok(!/\.filter\([^)]*via === "claude"[^)]*\)\s*\)/.test(js), "the ladder must not filter the Claude rows out");
  assert.match(css, /\.ex-band-claude\s*\{/, "a Claude range is DRAWN, in its own colour");

  // v0.53.0 — THE GEOMETRY MOVED INSIDE THE ROW, and that is the whole fix. The
  // old rail gave each segment `flex: 0 0 var(--w)` with `min-width: 128px`, so
  // the floor fought the percentage: a 10-point band and a 30-point band came
  // out nearly the same width while the axis underneath promised they were to
  // scale. A full-width track holding a `var(--w)` bar needs no floor, needs no
  // horizontal scroll, and can never clip the target name.
  assert.match(js, /bar\.style\.setProperty\("--w"/, "the bar is sized by a CUSTOM PROPERTY, never an inline width");
  assert.match(css, /\.ex-band-bar\s*\{[\s\S]*?width:\s*var\(--w\)/, "the bar is a width INSIDE the row");
  assert.ok(!/min-width/.test(/\.ex-band-bar\s*\{[^}]*\}/.exec(css)[0]), "no floor may fight the percentage");
  assert.ok(!/\.ex-rail\b/.test(css) && !/exRail\b/.test(js), "the horizontal rail is gone, not kept beside its replacement");
  // The target is the most important fact in the row and was the one thing the
  // old rail clipped. It must never be truncated.
  assert.ok(
    !/text-overflow:\s*ellipsis/.test(/\.ex-band-target\s*\{[^}]*\}/.exec(css)[0]),
    "the target is never truncated"
  );

  // The Runs-row / Knowledge-doc rule: the row you read is the row you edit,
  // one open at a time, and there is no second list of the same data below.
  assert.match(js, /headBtn\.setAttribute\("aria-expanded"/, "a band row expands IN PLACE");
  assert.ok(!/exRouteRow\b/.test(js), "the duplicate rows section is deleted, not hidden");

  // THE ONE THE PREVIEW MUST NEVER GUESS. Un-routing a band hands it back to the
  // Claude ladder, and which agent it lands on is `claudeGaps`'s answer, split
  // at the resolving table's own edges. The panel does not know it and must not
  // learn it: a staged un-route draws an em dash.
  assert.match(js, /via: "claude", agent: null, staged: true/, "a staged un-route carries NO agent");
  assert.match(js, /p\.agent \|\| "—"/, "and it renders as an em dash");

  // THE LEGEND. Green against blue carried the whole meaning of the picture and
  // was never named anywhere on the page — green is "this work leaves your
  // machine".
  assert.match(js, /exBandLegend/, "the colours are explained");
  assert.match(css, /\.ex-legend-swatch\s*\{/);

  // AND THE PLAIN-LANGUAGE LABEL IS THE CLI'S. Writing "simple work" beside a
  // score range here would be the panel deciding what a score means — the
  // Flow-stepper rule. It renders `range` and `meaning` off the route row and
  // composes neither.
  assert.match(js, /raw\.range/, "the readable range comes from the CLI");
  assert.match(js, /raw\.meaning/, "and so does what a score in it describes");
  const jsCode = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/simple work|mechanical work|hardest work/i.test(jsCode), "the panel writes no prose about a score");
});

test("extra tabs: six of them, the open one survives a re-render, and the gate decides what exists", () => {
  const js = panelJs("extra");

  // Knowledge (five tabs) and Crosslink (two) are the precedent, down to the
  // shared `.tabs` / `.tab-pane` in runs.css. Extra was the largest panel in
  // the app and the only big one that never adopted it — nine cards in one
  // 8,800px scroll, with no first step and no way to be done with a section.
  // v0.54.0 adds the SIXTH — Recovery, not a tenth card.
  for (const key of ["setup", "routing", "limits", "spending", "recovery", "providers"])
    assert.match(js, new RegExp('t\\("extra\\.tab\\.' + key + '"\\)'), `the ${key} tab label is a key written out in full`);
  // A write that re-renders must not throw you back to Setup — the KN_TAB rule.
  assert.match(js, /let EX_TAB = "setup";/);
  assert.match(js, /EX_TAB = which;/);
  assert.match(js, /select\(views\[EX_TAB\] \? EX_TAB : "setup"\)/);

  // THE GATE STILL DECIDES WHAT EXISTS. With nothing connected there is no
  // routing, no limits and nothing spent, so those tabs are NOT RENDERED as
  // empty shells — and Setup's own tab is spotlighted (the Crosslink
  // "nothing linked" rule).
  assert.match(js, /const views = connected\s*\?/);
  assert.match(js, /: \{ setup: \(\) => exSetupTab\(d, body\) \};/);
  assert.match(js, /if \(!connected && which === "setup"\) b\.classList\.add\("tab-spot"\)/);

  // "What needs your attention" is the one card that must not be behind a tab.
  const render = js.slice(js.indexOf("async function renderExtra"), js.indexOf("function exSetupTab"));
  assert.ok(
    render.indexOf("exFindingsCard(d)") < render.indexOf('el("div", "tabs")'),
    "the findings card sits above the tabs, on every one of them"
  );
  assert.ok(render.indexOf("exStrip(d)") < render.indexOf('el("div", "tabs")'), "and so does the header strip");
});

test("extra: nothing is written until Apply, and every staged edit is an ACTION", () => {
  const js = panelJs("extra");

  // The v0.44.1 rule. Staging repaints the BAR, not the panel: a full re-render
  // per click re-fetches every endpoint and scrolls the list out from under the
  // person using it.
  assert.match(js, /editSet\(\(\) => EX_BAR && EX_BAR\.paint\(\)\)/);
  assert.match(js, /await applyActions\(edits, btn\)/);
  // Config edits stage as ACTIONS rather than through `applyEdits`, which is
  // what lets ONE bar carry a routing change and a guardrail change together —
  // and what left the shared helper untouched.
  assert.match(js, /edits\.action\(key, "\/api\/config\/set"/);
  assert.match(js, /edits\.action\(key, "\/api\/config\/reset"/);
  // Staging a value back to what it was CLEARS the edit rather than staging a
  // no-op, restated in the adapter because that is what `controlFor` now talks to.
  assert.match(js, /if \(String\(value\) === String\(original\)\) edits\.drop\(key\)/);
  // The guardrail rows come from the SHARED renderer: adding a tenth config key
  // is still zero steps in this panel.
  assert.match(js, /settingRow\(k, body, proxy\)/);
});

test("extra: the connection test is the CLI's, and a key never reaches argv", () => {
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const js = panelJs("extra");
  // COMMENTS ARE STRIPPED FOR EVERY NEGATIVE ASSERTION below. This suite has
  // three greps that read a comment as code, and they have cost a debugging
  // round each — a comment explaining why the panel does NOT do a thing is
  // exactly the text a naive `!includes` trips on.
  const bare = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // A ping MUTATES (a green test writes `verified_at`; a red one on a
  // never-verified profile removes the profile), so it is POST-only — a GET that
  // did that would be reachable by a prefetch.
  assert.match(api, /if \(route === "\/api\/extra\/ping"\)/);
  assert.ok(!/"\/api\/extra\/ping"/.test((api.match(/const READS = \{[\s\S]*?\n\};/) || [""])[0]), "ping is never a READ");

  // The secret travels on STDIN. Never argv (world-readable in a process list),
  // never a temp file, never a log line — and the CLI refuses `--key <value>` by
  // name, so no route here can build one.
  assert.match(api, /argv\.push\("--key-stdin"\)/);
  assert.match(api, /argv\.push\("--passphrase-stdin"\)/);
  assert.ok(!/"--key"[,\s]/.test(api), "`--key <value>` must never be built by the panel");
  assert.match(api, /input = String\(body\.key\)/);

  // And the panel drops it the moment it has been sent: never kept past the
  // request, never in localStorage, never re-rendered as a field value.
  assert.match(js, /key\.value = "";/);
  assert.ok(!/localStorage/.test(bare), "no credential and no passphrase may be remembered in the browser");
  assert.match(js, /i\.autocomplete = "off"/);
});

test("extra fixtures: one of every state, including the two the mode could not reach", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  const list = fixtures.get("/api/extra", {});
  const profiles = list.profiles;

  // The vault's four states are DIFFERENT facts and must never collapse: no
  // record, a clean stored key, a counter part-used, and a tombstone.
  const vaultStates = profiles.map((p) => p.credential.vault && p.credential.vault.state).filter(Boolean);
  for (const st of ["stored", "wiped"]) assert.ok(vaultStates.includes(st), `a ${st} vault must be designable`);
  assert.ok(
    profiles.some((p) => (p.credential.vault || {}).attempts_used > 0),
    "a countdown toward a destructive action must be designable"
  );
  assert.ok(profiles.some((p) => !p.verified_at), "a never-tested connection");
  assert.ok(profiles.some((p) => p.credential.source === "env" && !p.credential.present), "a missing environment key");
  assert.ok(profiles.some((p) => p.engine === "cli"), "an engine with a binary rather than an endpoint");

  // The routing states the doctor findings are about.
  const route = fixtures.get("/api/extra/route", {});
  assert.ok(route.rows.some((r) => r.via === "claude"), "an unmapped range keeps its slot");
  assert.ok(route.rows.some((r) => r.via === "extra" && r.model_known === false), "a routed model the provider no longer lists");
  assert.ok(route.rows.some((r) => r.verify_state === "STALE"), "a stale verification that STILL routes");

  // The cost states: a vector assembled from fewer dispatches than were sent,
  // and a provider with no rate at all so `usd` is null rather than 0.
  const stats = fixtures.get("/api/extra/stats", {});
  assert.ok(stats.bands.some((b) => b.usage_reported < b.dispatches), "a partial vector must be designable");
  assert.ok(stats.bands.some((b) => b.usd === null), "an UNPRICED band must be designable");
  for (const k of ["substitutions", "reroutes", "fallbacks"]) assert.ok(stats[k].length, `a ${k} row`);

  // The POST half (v0.50.0). Fixture mode runs nothing, which made the
  // connection test's OUTCOME undesignable — and that outcome is most of what
  // this panel is about. Exactly three answers, chosen deterministically.
  assert.equal(fixtures.post("/api/extra/ping", { profile: "cheap" }).data.ok, true);
  assert.equal(fixtures.post("/api/extra/ping", { profile: "router" }).data.ok, false);
  assert.equal(fixtures.post("/api/extra/ping", { profile: "router" }).data.profile_reverted, true);
  assert.equal(fixtures.post("/api/extra/ping", { profile: "n", key: "k" }).data.vault.reason, "no-passphrase");
  // Every OTHER write still answers "nothing ran", which is the honest reply in
  // a mode that runs nothing.
  assert.equal(fixtures.post("/api/config/set", { key: "x", value: "y" }), undefined);
  assert.equal(fixtures.post("/api/extra/route/set", {}), undefined);
});

test("extra: the boundary card renders ALWAYS, and the countdown is never silent", () => {
  const js = panelJs("extra");
  const bare = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const css = panelCss("extra").replace(/\/\*[\s\S]*?\*\//g, "");

  // The house-rules precedent: somebody about to send their source code to a
  // third party should not have to go looking for the paragraph that says so.
  // It is appended unconditionally, before anything that can fail to load.
  assert.match(js, /out\.append\(exBoundaryCard\(\)\);/);
  assert.ok(!/if \([^)]*\)\s*out\.append\(exBoundaryCard/.test(bare), "the boundary card has no condition");
  assert.match(css, /\.ex-boundary\s*\{/);

  // `attempt N of 10` is the point of the feature, so it is the CLI's message
  // rendered verbatim — a panel that summarised it would delete the one number
  // this exists to show. A zero countdown keeps its slot and reads as none used.
  assert.match(js, /t\("extra\.vault\.attemptsNone"\)/);
  assert.match(js, /d\.error \|\| t\("common\.loadFail"\)/);
  assert.match(js, /if \(d\.honesty\) out\.append\(el\("div", "note", d\.honesty\)\)/);

  // UNVERIFIED and STALE are the CLI's states, arriving as doctor findings keyed
  // by profile. This panel has no idea what `extra_verify_max_days` means.
  assert.ok(!/extra_verify_max_days/.test(bare), "the panel must not know the freshness edge");
  assert.match(js, /f\.id === "extra-stale-verify"/);
  assert.match(js, /counts\.verified/, "the verified COUNT is the CLI's, never a re-filter");
});

/* ============================================ EXTRA · local tools (v0.51.0) ==
   Some providers are a program on this machine rather than an endpoint, and a
   program can simply not be there. The assertions here are all about the panel
   REFUSING TO OFFER what cannot work — a Connect box on an absent tool, a
   routing table before anything has answered, a model dropdown the CLI did not
   build — because every one of those teaches somebody to configure something
   that will never fire. */

test("extra tools card: the panel switches on `state` and derives nothing, and names no tool", () => {
  const js = panelJs("extra");
  const cat = JSON.parse(fs.readFileSync(path.join(REPO, "bin", "providers.json"), "utf8"));

  // The Flow-stepper rule, applied to a local tool. Four states arrive from
  // `orc extra tools --json`; the panel renders them and computes none of them.
  assert.match(js, /tool\.state === "absent"/);
  assert.match(js, /tool\.state === "outdated"/);
  assert.match(js, /tool\.state === "unauthenticated"/);
  assert.match(js, /read\("\/api\/extra\/tools"\)/);

  // The card names NO tool, NO binary and NO install command. Every one of them
  // arrives in the JSON, which is the only thing that keeps this panel from
  // becoming a second catalog that is stale within a quarter.
  for (const row of cat.providers.filter((p) => p.cli_bin)) {
    assert.ok(!new RegExp('["\']' + row.id + '["\']').test(js), `the panel must not name provider ${row.id}`);
    assert.ok(!js.includes(row.cli_bin + '"'), `the panel must not name the binary ${row.cli_bin}`);
  }
  assert.ok(!/npm i -g|brew install|winget install|curl -fsSL/.test(js), "an install command is catalog data, never panel text");
  // The launcher is the CLI's job too: the panel knows nothing about terminals.
  assert.ok(!/wt\.exe|osascript|gnome-terminal|x-terminal-emulator/.test(js), "the terminal ladder belongs to bin/cli.js");
  assert.ok(!/\bsudo\b|\brunas\b/i.test(js), "ORC never elevates, and the panel never suggests it");

  // An ABSENT box offers the install and NOTHING else — no Connect, no Test, no
  // model list. A button that cannot succeed is worse than no button.
  const at = js.indexOf('if (tool.state === "absent")');
  const absent = js.slice(at, js.indexOf("const kv = [", at));
  assert.ok(!/exTestModal|exAddModal/.test(absent), "an absent tool gets no Connect and no Test control");
  assert.match(absent, /exInstallRow/);
  // `null` MEANS THERE IS NONE, and the two must not render the same. Neither
  // may render as an empty slot.
  assert.match(absent, /if \(tool\.no_install_alternative\) \{/);
  assert.match(absent, /extra\.tools\.altNone/);

  // PREVIEW THEN APPLY, unchanged: the exact command is on screen before the
  // button that runs it.
  assert.match(js, /el\("div", "action-cmd", cmds\[0\]\.cmd\)/);
  // The user installs in another window and comes back, so the card can be
  // re-read without a full page load.
  assert.match(js, /extra\.tools\.recheck/);
});

test("extra tools card: a CONNECTED tool has no Connect button, and the add form has three sources", () => {
  const js = panelJs("extra");

  // D1 — `connected` / `verified` arrive from `orc extra tools --json`. The
  // panel switches on them and joins nothing: `d.list.profiles` was sitting
  // right there and a second idea of "connected" is exactly the drift this
  // panel exists to prevent.
  assert.match(js, /if \(tool\.verified\) \{/);
  assert.match(js, /\} else if \(tool\.connected\) \{/);
  assert.match(js, /extra\.tools\.connectedAs/);
  assert.match(js, /extra\.tools\.connectedUntested/);
  // AN ABSENT CONTROL AND A DEAD CONTROL MUST NOT LOOK THE SAME. The verified
  // branch removes Connect; it never disables it.
  const ready = js.slice(js.indexOf("if (tool.verified) {"), js.indexOf("box.append(actions);"));
  assert.ok(!/extra\.tools\.connect"/.test(ready.slice(0, ready.indexOf("} else {"))),
    "a verified tool must not offer Connect at all");
  assert.ok(!/disabled = true/.test(ready), "a dead Connect button is worse than none");
  // A second connection to the same tool is legitimate, and it is a SECONDARY.
  assert.match(js, /extra\.tools\.addAnother/);

  // D3.1 — the THIRD credential source, offered only where it can be true, and
  // asking for neither field when it is chosen. ORC never writes another tool's
  // credential store.
  assert.match(js, /extra\.add\.sourceTool/);
  assert.match(js, /const toolable = isCli && !!\(r && r\.cli_bin\)/);
  assert.match(js, /tool_auth: srcTool\.checked/);
  // Pre-selected when the card the user pressed Connect on says the tool is
  // already signed in — the form opens on the state they were looking at.
  assert.match(js, /if \(tool\.authed\) srcTool\.checked = true/);
});

test("extra passphrase: the save modal has no exit but Save, and the panel names no TTL", () => {
  const js = panelJs("extra");
  const ui = appJs();

  // D11. A green test on a vaulted connection opens a modal that cannot be
  // walked away from half-done: no Escape handler, no backdrop click, and the
  // Escape key swallowed in the CAPTURE phase (the `.tour-block` precedent).
  assert.match(ui, /function modal\(\{ title, body, actions, dismissible \}\)/);
  assert.match(ui, /const locked = dismissible === false/);
  assert.match(ui, /document\.addEventListener\("keydown", onKey, true\)/);
  assert.match(ui, /\$\("#modal-backdrop"\)\.onclick = locked \? null : closeModal/);

  // EXACTLY ONE other button, and it is destructive and NAMED. A modal with
  // genuinely no way out is a trap the first time a write fails; an escape that
  // destroys what you were configuring cannot be pressed by accident.
  assert.match(js, /extra\.session\.abandon/);
  const modalFn = js.slice(js.indexOf("function exSessionModal("), js.indexOf("function exSessionForgetModal("));
  assert.ok(!/common\.cancel/.test(modalFn.slice(modalFn.indexOf("const actions = []"), modalFn.indexOf("actions.push({ label: t(\"extra.session.save\")"))) ||
    /if \(dismissible\) actions\.push/.test(modalFn), "a Cancel exists only when the modal is dismissible");

  // THE PANEL NAMES NO NUMBER. The eight deadlines come from the config key's
  // own `options`, the same rule the flow dropdowns are built under.
  assert.match(js, /exConfigOptions\(cfg, "extra_passphrase_ttl_days"\)/);
  for (const n of [14, 30, 90, 180, 360])
    assert.ok(!new RegExp("\b" + n + "\b").test(modalFn.replace(/86400000/g, "")),
      `the panel must not name the TTL value ${n} itself`);

  // The deadline is shown as a DATE, live, because "30 days" is not something a
  // person can plan around.
  assert.match(js, /extra\.session\.until/);
  // Four states, all the CLI's, and `not saved` KEEPS ITS SLOT on a vaulted
  // connection — that is the state a run STOPS on.
  for (const k of ["active", "expiring", "expired", "none"]) assert.match(js, new RegExp("extra\\.session\\." + k));
  // TWO CALLS, because storing the KEY and caching the PASSPHRASE are two
  // different acts and only one of them has a deadline.
  assert.match(js, /\/api\/extra\/session\/save/);
  assert.match(js, /\/api\/extra\/session\/forget/);
  // NO AUTO-EXTEND: the only way to move a deadline is to set a new one, which
  // is a write the user makes. (Comments are stripped first — this panel
  // DOCUMENTS the rule, which is not the same as breaking it.)
  const code = js.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/auto.?extend/i.test(code));
});

test("extra passphrase fixtures: one profile per state, and a tool profile with no row at all", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  const profiles = fixtures.get("/api/extra", {}).profiles;
  const states = profiles.map((p) => (p.session ? p.session.state : null));
  for (const st of ["ACTIVE", "EXPIRING", "EXPIRED", "ABSENT"])
    assert.ok(states.includes(st), `a ${st} passphrase must be designable`);
  // A tool that signs itself in has NO passphrase row at all, and that is not a
  // gap — it is the whole reason the third credential source exists.
  const tool = profiles.find((p) => p.credential.source === "tool");
  assert.ok(tool, "a tool-auth profile is designable");
  assert.equal(tool.session, null);
});

test("extra gate: the sections below it are ABSENT, not hidden, until something has answered", () => {
  const js = panelJs("extra");

  // W8. `connected` is the CLI's answer — the same one the config gate and the
  // doctor finding read — so there is no second idea of it in this panel.
  assert.match(js, /const connected = !!\(d\.list && d\.list\.gate && d\.list\.gate\.connected\)/);
  // v0.53.0 — the gated sections are now gated TABS, and the rule is unchanged:
  // they are not built at all, never built and then hidden. A disabled routing
  // table still teaches you to fill it in.
  const render = js.slice(js.indexOf("const out = frag();"), js.indexOf("body.replaceChildren(out);"));
  assert.match(render, /const views = connected\s*\?[\s\S]*routing:[\s\S]*limits:[\s\S]*spending:[\s\S]*providers:[\s\S]*\}\s*: \{ setup:/);
  // The strip and "what needs your attention" stay OUTSIDE the tabs, so the
  // panel never looks broken and a caution is never behind a tab.
  assert.match(render, /exStrip\(d\)/);
  assert.match(render, /exFindingsCard\(d\)/);
  // …and the boundary card and the tools card are on the tab that always
  // exists — the first-time user's whole path, in the order they walk it.
  const setup = js.slice(js.indexOf("function exSetupTab"), js.indexOf("function exRoutingTab"));
  assert.match(setup, /exBoundaryCard\(\)/);
  assert.match(setup, /exToolsCard\(d, body\)/);
  assert.match(setup, /exProfilesCard\(d, body\)/);
  // The two FLOORS say different things, because the instruction differs.
  assert.match(js, /gate\.floor === "never-tested"/);
  assert.match(js, /extra\.gate\.noConnection/);
});

test("extra model box: the CLI decides dropdown vs text box, and a listed model is never assumed to work", () => {
  const js = panelJs("extra");

  // The Flow-stepper rule applied to models: `entry` is the CLI's answer.
  assert.match(js, /j\.entry === "list" \? "list" : "free-text"/);
  // Grouped by the CLI's own `group`, labelled from data the panel was handed —
  // never by splitting a model id this panel does not own.
  assert.match(js, /m\.label \+ \(m\.group \? " \(" \+ m\.group \+ "\)" : ""\)/);
  assert.ok(!/\.split\("\/"\)/.test(js), "the panel must not derive a model's group itself");
  // F5 — the caveat is the CLI's sentence and rides beside the picker.
  assert.match(js, /note\.textContent = j\.caveat/);

  // The PAID rung is its own button, so it can never be pressed by accident, and
  // the two rungs are quoted separately BEFORE either one.
  assert.match(js, /extra\.test\.live/);
  assert.match(js, /live: !!live/);
  assert.match(js, /extra\.probe\.cliPaid/);

  // `model_reported: null` WITH `reports_model: false` is an honest PAIR and
  // must render as a sentence. A blank reads as "nothing went wrong".
  assert.match(js, /d\.reports_model === false \? t\("extra\.live\.noReport"\)/);
  // Four token kinds, never blended, and a kind the tool cannot report reads an
  // em dash rather than a zero.
  assert.match(js, /extra\.live\.cacheWrite/);
  assert.match(js, /v === null \|\| v === undefined \? "—"/);
  // The reply is FOREIGN INPUT: DOM text, never HTML, and never acted on.
  assert.match(js, /el\("pre", "block wrap ex-live-reply", d\.reply_excerpt\)/);
  assert.ok(!/innerHTML/.test(js), "a third party's text is never HTML");
});

test("extra fixtures: one of every tool state, both gate floors, and the ugly live outcomes", () => {
  const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
  const tools = fixtures.get("/api/extra/tools", {});

  // ONE FIXTURE PER STATE — you cannot design the "not installed" box on a
  // machine where it is installed. A test per state is what stops a new state
  // shipping without one.
  for (const st of tools.states)
    assert.ok(tools.tools.some((x) => x.state === st), `a ${st} tool must be designable`);
  // Both halves of the install-free asymmetry, on screen at once.
  assert.ok(tools.tools.some((x) => x.no_install_alternative), "a tool you can skip installing");
  assert.ok(tools.tools.some((x) => x.no_install_alternative === null), "and one you cannot");
  // A version ORC could not parse must read UNKNOWN, never too-old.
  assert.ok(tools.tools.some((x) => x.installed && x.version === null && x.outdated === false), "an unreadable version");
  assert.ok(tools.tools.some((x) => x.probe_error), "a probe that timed out");

  // The gate's THREE states, because the panel a first-time user sees is the one
  // that has never been designed.
  assert.equal(fixtures.get("/api/extra", {}).gate.connected, true);
  assert.equal(fixtures.get("/api/extra", { gate: "none" }).gate.floor, "no-connection");
  assert.equal(fixtures.get("/api/extra", { gate: "untested" }).gate.floor, "never-tested");

  // Both model-entry shapes.
  assert.equal(fixtures.get("/api/extra/models", { profile: "local" }).entry, "list");
  assert.equal(fixtures.get("/api/extra/models", { profile: "custom" }).entry, "free-text");
  // `env_var` is non-null exactly on the env route, in the fixtures too.
  for (const p of ["local", "toold"]) {
    const k = fixtures.get("/api/extra/keyhelp", { profile: p });
    assert.equal(k.route === "env", k.env_var !== null);
  }

  // The three live outcomes worth designing: it worked and STILL cannot say
  // which model answered, the model was listed and is DEAD, and the tool is not
  // installed at all.
  const live = fixtures.post("/api/extra/ping", { profile: "local", live: true, model: "big-pickle" }).data;
  assert.equal(live.model_reported, null);
  assert.equal(live.reports_model, false);
  assert.equal(live.tokens.cache_write, null, "a token kind the tool cannot report is null, never 0");
  assert.equal(
    fixtures.post("/api/extra/ping", { profile: "local", live: true, model: "x/y-free" }).data.reason,
    "model_not_found"
  );
  assert.equal(fixtures.post("/api/extra/ping", { profile: "toolc", live: true, model: "m" }).data.reason, "not-installed");
  // A launch that could NOT happen is exit 0 with the command still on the card.
  assert.equal(fixtures.post("/api/extra/install", { provider: "codex" }).data.launched, false);
  assert.ok(fixtures.post("/api/extra/install", { provider: "codex" }).data.fallback_cmd);
});

// ── v0.54.0 — RECOVERY ──────────────────────────────────────────────────────

test("extra recovery: the free read is a button, the paid one is a copy-able command", () => {
  const js = panelJs("extra");
  const tab = js.slice(js.indexOf("function exRecoveryTab"), js.indexOf("function exReliabilityStrip"));

  // The panel NEVER RUNS A LANE. `reconcile` costs nothing, so the row opening
  // it is a real control; `resume-slice` composes a slice for a dispatch that
  // will cost money, so it is a command you copy.
  assert.match(tab, /laneCommand\("orc extra resume-slice /);
  assert.match(tab, /laneCommand\("orc extra reconcile /);
  assert.ok(!/post\("\/api\/extra\/dispatch/.test(js), "the panel never dispatches");
  assert.ok(!/post\("\/api\/extra\/resume/.test(js), "and never composes a resume slice for you");

  // EXPANDED IN PLACE — the Runs-row rule. One row open at a time, detail
  // fetched on first open, and there is no detail box below the list.
  assert.match(tab, /let EX_JOURNAL_OPEN = null;/);
  assert.match(tab, /entry\.row\.classList\.toggle\("open", open\)/);
  assert.match(tab, /if \(!open \|\| entry\.loaded\) return;/);

  // A REFUSAL IS RENDERED AS A REFUSAL WITH ITS REASON, never as a dead control.
  assert.match(tab, /t\("extra\.recovery\.blocked", \{ why: v\.blocked_by \}\)/);
  // A HOLD says what it means, in the CLI's words.
  assert.match(tab, /v\.attribution\.fallback_would_also_fail/);
  assert.match(tab, /t\("extra\.recovery\.holdWave"\)/);

  // EVERY STATE WORD DRAWN HERE IS THE CLI'S OWN STRING, passed straight
  // through. The panel may branch on one to pick a colour — every card here
  // already does — but it may never RENDER a word of its own for a state.
  assert.match(tab, /chip\(v\.state,/, "the state chip is the CLI's own string");
  assert.match(tab, /chip\(f\.state,/, "and so is each file's");
  assert.match(tab, /chip\(v\.resume_target\.kind,/, "and the resume target's");
  assert.match(tab, /chip\(v\.attribution\.verdict,/, "and the attribution verdict's");
  // AND NEITHER STRING TABLE MAY CONTAIN ONE. A translated state word is a
  // state that does not exist — the rule that keeps `resumable` from becoming
  // a friendlier synonym on one surface and not the other.
  for (const lang of ["en", "id"]) {
    const table = JSON.stringify(i18nTable(lang));
    for (const w of ["resumable", "nothing-to-resume", "no-journal", "in-flight", "streamed-opaque", "per-turn"])
      assert.ok(!table.includes(w), `the ${lang} table must not contain the CLI state word \`${w}\``);
  }

  // UNKNOWN IS NOT ZERO: a line count ORC could not compute exactly reads as an
  // em dash, never as `+0 −0`.
  assert.match(tab, /f\.numstat\.added === null \? "—"/);

  // A RECOVERED VECTOR IS A FLOOR, and the note is not optional chrome.
  assert.match(tab, /v\.partial_usage_note/);
  // FIDELITY IS NEVER RENDERED STRONGER THAN IT IS.
  assert.match(tab, /r\.journal_fidelity/);
  assert.match(tab, /v\.journal_fidelity_note/);

  // Preview-then-apply, and the preview NAMES EVERY DIRECTORY. A count is not
  // consent, and the apply stays disabled until a preview was fetched.
  assert.match(tab, /apply\.disabled = true;/);
  assert.match(tab, /read\("\/api\/extra\/journal\/prune\/preview"\)/);
  assert.match(tab, /for \(const x of d\.candidates\) list\.append/);
  assert.match(tab, /for \(const k of d\.kept \|\| \[\]\)/, "why a record is KEPT is as much of the answer");
});

test("extra recovery: reliability has no percentage below the sample floor, and unattributed is always drawn", () => {
  const js = panelJs("extra");
  // BOUNDED. A slice that ran to end-of-file would be testing the whole panel
  // and would fail on the first unrelated number it met.
  const strip = js.slice(js.indexOf("function exReliabilityStrip"), js.indexOf("// Which tab was open"));

  // The FLOOR IS THE CLI'S NUMBER, never one written here.
  assert.match(strip, /rel\.sample_floor/);
  assert.ok(!/\b10\b/.test(strip.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")), "the floor is never hard-coded in the panel");
  assert.match(strip, /if \(g\.sample_too_small\)/);
  // `unattributed` is ALWAYS printed, including when zero — the /orc-budget
  // rule, and `|| 0` is what keeps an absent count from vanishing.
  assert.match(strip, /unattributed: g\.unattributed \|\| 0,/);
  // The two ABSENT counts are named rather than absorbed.
  assert.match(strip, /rel\.unreadable_journals/);
  assert.match(strip, /rel\.journals_without_result/);

  // It hangs on the SPENDING tab, beside the cost it belongs with.
  assert.match(js, /if \(st\.reliability\) c\.append\(exReliabilityStrip\(st\.reliability\)\);/);
});

test("extra recovery: a card whose child count changes with its state does not declare its rows", () => {
  const css = panelCss("extra");
  const block = css.slice(css.indexOf(".ex-rec-list"));
  // `.ex-tool`'s 250px ellipse: FOUR states carried four different numbers of
  // children against a declared row template, and a chip stretched into an
  // ellipse. A recovery row has five states, so it is a flex column.
  assert.match(block, /\.ex-rec-head \{[^}]*display: flex;/s);
  assert.ok(!/\.ex-rec-head \{[^}]*grid-template-rows/s.test(block), "a row with a variable child count may not declare its rows");
  assert.ok(!/\.ex-rec-row \{[^}]*grid-template-rows/s.test(block));
  // Every variant collapses EXPLICITLY at the narrow widths.
  const resp = appCss();
  assert.match(resp, /\.ex-rec-head \{ flex-wrap: wrap; \}/);
  assert.match(resp, /\.ex-rec-file \{ flex-direction: column;/);
});

test("overview: an orphaned dispatch gets ONE line, and it navigates rather than expands", () => {
  const js = panelJs("overview");
  const block = js.slice(js.indexOf("const ej = d.extra_journal;"), js.indexOf("/* --- the raw doctor list"));
  // ONLY WHEN THERE IS SOMETHING TO SAY.
  assert.match(block, /if \(ej && ej\.orphans\) \{/);
  // THE CARD CONTRACT: this row navigates, so it declares `.no-caret` and fills
  // the three columns that variant has. One column short is the whole card.
  assert.match(block, /el\("button", "run-card no-caret"\)/);
  assert.match(block, /location\.hash = "#\/extra"/);
  // It REPORTS. It never resumes.
  assert.ok(!/resume/.test(block), "the Overview never offers to continue a dispatch");
});

test("extra positions: a slot is a POINT, it keeps its row, and the panel names none of it", () => {
  const js = panelJs("extra");
  const css = panelCss("extra").replace(/\/\*[\s\S]*?\*\//g, "");
  const { extraRole } = require(path.join(WEBUI, "fixtures", "extra.js"));

  // v0.55.0 — A SLOT IS A POINT, NOT AN INTERVAL. Drawing it a proportional bar
  // would be the panel inventing a range the CLI never computed, so the row
  // reuses `.ex-band` and simply declares one fewer column.
  assert.match(js, /exSlotCard/, "the positions ladder exists");
  assert.match(css, /\.ex-slot-head\s*\{[\s\S]*?grid-template-columns:/, "a row whose child count differs DECLARES its own columns");
  const slotFns = js.slice(js.indexOf("function exSlotRow"), js.indexOf("function exLanesCard"));
  assert.ok(!/setProperty\("--w"/.test(slotFns), "a position has no width — it covers nothing");

  // EVERY STRING IS THE CLI'S. `meaning`, `why`, `announce_point` and the state
  // words all come off the row — writing "cheap work" beside a position would be
  // the panel deciding what a position means (the Flow-stepper rule).
  for (const field of ["raw.meaning", "raw.why", "raw.announce_point", "raw.claude.agent", "raw.verify_state"])
    assert.ok(slotFns.includes(field), "the row must render " + field);
  const bare = slotFns.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/orc-doc-|orc-wiki-|orc-executor-/.test(bare), "an agent name is the CLI's answer, never the panel's");
  assert.ok(!/doc-writer|wiki-scanner|quick-executor|fast-executor/.test(bare), "and neither is a slot id");

  // AN UNROUTED POSITION KEEPS ITS ROW — the OFF-phase rule. The card renders
  // `slots` whole, so there is no filter at all, and that is the assertion.
  assert.ok(!/slots\s*\|\|\s*\[\]\)\.filter\(/.test(js), "the positions ladder must not filter a row out");

  // REPLACING A POSITION IS A ROUTING CHANGE, so the confirmation NAMES what it
  // replaces. A count is not consent, and neither is a slot id on its own.
  assert.match(js, /extra\.slots\.confirmReplace/, "a replace is confirmed");
  for (const code of ["en", "id"]) {
    const table = JSON.parse(fs.readFileSync(path.join(WEBUI, "i18n", code, "extra.json"), "utf8"));
    assert.ok(/\{old\}/.test(table["extra.slots.confirmReplace"]), code + ": the confirmation must name what it replaces");
    assert.ok(/\{next\}/.test(table["extra.slots.confirmReplace"]), code + ": and what it becomes");
  }

  // ONE OF EVERY STATE IN THE FIXTURES, including the ugly ones — you cannot
  // design a STALE chip on a fresh connection.
  const rows = extraRole.slots;
  assert.equal(rows.length, 6, "all six positions, always");
  const has = (fn) => rows.filter(fn).length;
  assert.ok(has((r) => r.resolved === "extra" && r.verify_state === "VERIFIED") >= 1, "a routed + VERIFIED position");
  assert.equal(has((r) => r.verify_state === "STALE"), 1, "a routed + STALE position");
  assert.equal(has((r) => r.routed && r.held_back === "unverified"), 1, "a position whose profile lost its verification");
  assert.equal(has((r) => r.routed && r.model_known === false), 1, "a position whose model left models_seen");
  assert.ok(has((r) => !r.routed) >= 2, "and unrouted positions, which keep their slot");
  assert.equal(has((r) => r.asks), 1, "exactly one lane ASKS — the other three announce");
  // An unrouted position falls through to a NAMED agent. It is never null and it
  // is never an interval.
  for (const r of rows) assert.ok(r.claude && /^orc-/.test(r.claude.agent), r.slot + " must fall through to a named agent");
});


/* ── v1.0.0 W16 ──────────────────────────────────────────────────────────────
   The Config panel's rank ladder, the Lanes panel, and Extra's demotion row.
   Every one of them renders something the CLI already computes, so every test
   here is a version of the same assertion: the panel must not have a second
   idea of it. That is the Flow-stepper rule above, applied three more times. */

// The rank ladder answers "which setting actually decided this", which a flat
// key list structurally cannot. The CLI resolves it; the panel draws it.
test("settings ranks: the panel renders families_resolved, it never re-derives a precedence", () => {
  const js = appJs();
  const i = js.indexOf("function ranksCard");
  assert.ok(i > 0, "the rank card must exist");
  const fn = js.slice(i, js.indexOf("function ladderCard"));

  assert.match(fn, /res\.ranks \|\| fam\.ranks/, "it must iterate the CLI's resolved ranks");
  // A precedence re-implemented in the browser is exactly the drift this panel
  // exists to make impossible. None of these may be decided here.
  assert.ok(!/\bfor\s*\(.*of.*\)\s*\{[^}]*break/.test(fn), "the panel must not walk the ladder itself");
  for (const key of ["extra_enabled", "opus5_only", "rubric_bands_override"]) {
    assert.ok(!fn.includes(key), `the panel must not name the contested key "${key}" itself`);
  }
  // A state word is the CLI's. A friendlier synonym is a state that does not exist.
  assert.match(fn, /RANK_STATE_KIND\[st\]/, "the chip kind is looked up per state, never invented");
  assert.match(js, /const RANK_STATE_KIND = \{[\s\S]*?"not-read":[\s\S]*?demoted:/, "the map must cover the CLI's closed set");
  // An unknown state RENDERS. A panel that silently drops a word it does not
  // recognise hides the next state somebody adds.
  assert.match(fn, /RANK_STATE_KIND\[st\] === undefined \? null : RANK_STATE_KIND\[st\]/, "an unknown state is drawn, not swallowed");
  // The terminal floor is not a key and must not read as one.
  assert.match(fn, /is-terminal/, "the terminal rank is marked so it cannot be mistaken for a key");

  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.rank-row\.is-resolved\s*\{[^}]*border-color:\s*var\(--ok\)/, "the rank that answered is the one given weight");
  // A grid whose child count varies must not put an optional child in a column.
  assert.match(css, /\.rank-why\s*\{[^}]*grid-column:\s*1 \/ -1/, "the optional `why` takes its own line, never a column it leaves empty");
});

// `lanes[]` answers "I changed this, so what did I just change?".
test("settings lanes: an EMPTY lanes[] is an answer and keeps its row", () => {
  const js = appJs();
  const i = js.indexOf("function settingRow");
  const fn = js.slice(i, js.indexOf("function controlFor"));
  assert.match(fn, /k\.lanes/, "the row must render the CLI's lanes[]");
  // Ten keys are permanently empty — they are operating keys of the `orc extra`
  // bridge. Skipping the line makes "no lane reads this" and "we did not render
  // it" identical, which is the distinction the row exists to draw.
  assert.match(fn, /settings\.lanes\.none/, "an empty lanes[] must render its own stated answer");
  assert.ok(
    !/if \(\(k\.lanes \|\| \[\]\)\.length\) \{\s*const lanes/.test(fn),
    "the row must not be skipped when lanes[] is empty"
  );
});

// The two commands behind the Lanes panel already existed; the panel is the
// half that was missing. It may render them and decide nothing about them.
test("lanes panel: it renders the CLI's phases and calls, and names neither itself", () => {
  const js = appJs();
  assert.ok(js.indexOf("PANELS.lanes") > 0, "the panel must register itself");
  const i = js.indexOf("function phasesCard");
  const fn = js.slice(i, js.indexOf("function callsTab"));

  assert.match(fn, /one\.phases \|\| \[\]/, "it must iterate the CLI's phases[]");
  // A hardcoded phase or lane list in the panel is the Flow-stepper drift again.
  for (const phase of ["preflight", "intake", "plan-handoff", "wiki-consult", "stop-resume"]) {
    assert.ok(!fn.includes(`"${phase}"`), `the panel must not name the phase "${phase}" itself`);
  }
  // NO SHARED PHASES is an ANSWER — five lanes are deliberately like this, and
  // a blank card would make it look like the read failed.
  assert.match(fn, /lanes\.phases\.inSpine/, "a lane with no shared phase must say so");
  // `when` is one of the CLI's own words (`always`, `on-phase`, `compile-time`)
  // and is rendered verbatim. A lookup table mapping it to friendlier words
  // would be a state word the CLI does not have.
  assert.match(fn, /chip\(p\.when,/, "the CLI's `when` is chipped verbatim");
  assert.ok(!/WHEN_LABEL|whenLabel|t\("lanes\.when\./.test(fn), "the panel must not translate or relabel `when`");

  const calls = js.slice(js.indexOf("function callsCard"));
  assert.match(calls, /d\.calls \|\| \[\]/, "the catalogue comes from the CLI");
  // EXPANDS IN PLACE, one row at a time — the Runs-row rule.
  assert.match(calls, /aria-expanded='true'/, "only one row stays open");
  assert.ok(!calls.includes("showCall"), "there is no detail box below the list");
});

// The mirror of `a lane that sends work off Claude without saying so` is a lane
// that quietly STOPS.
test("extra demotion: both clocks, the counter at zero, and Promote needs a reason", () => {
  const js = appJs();
  const i = js.indexOf("function exDemotionCard");
  assert.ok(i > 0, "the demotion card must exist");
  const fn = js.slice(i, js.indexOf("function exPromoteModal"));

  // TWO CLOCKS, NEVER MERGED: one about attempts that ended, one about an
  // attempt that has not. Each has its own key and its own zero.
  assert.match(fn, /clocks\.consecutive/, "the consecutive clock is rendered");
  assert.match(fn, /clocks\.stale/, "the stale clock is rendered");
  assert.ok(!/consecutive \+ |clocks\.consecutive\.threshold \+ clocks\.stale/.test(fn), "the two clocks must never be combined");
  // A `0` silently disables a clock, so `off` is STATED rather than blank.
  assert.match(fn, /extra\.demotion\.clockOff/, "an off clock says so");
  // THE COUNTER RENDERS AT ZERO. A badge that only appears when something is
  // wrong cannot tell you the clock is running.
  assert.match(fn, /extra\.demotion\.stalls/, "the counter is always rendered");
  assert.ok(!/if \(p\.consecutive_stalls\)/.test(fn), "the counter must not be hidden at zero");
  // Both ABSENT counts are named (v0.53.2).
  assert.match(fn, /skipped_unattributed/, "attempts belonging to no run are named");
  // The card renders even when nothing is demoted — a demotion nobody can see
  // is a subsystem that went quiet.
  assert.match(fn, /stateArmed/, "an armed run is rendered too, not only a demoted one");
  // A disabled button for an action that cannot apply is what this panel
  // refuses everywhere else.
  assert.match(fn, /if \(st\.demoted\) \{/, "Promote exists only while something is demoted");
  // There is deliberately NO demote button.
  assert.ok(!/extra\.demotion\.demoteButton|"\/api\/extra\/demote"/.test(js), "there is no hand-demote button");

  const modal = js.slice(js.indexOf("function exPromoteModal"));
  assert.match(modal, /reasonRequired/, "an empty reason is refused");
  assert.match(modal, /promoteWatermark/, "a promote is a watermark, and it says so before the click");
  assert.match(modal, /"\/api\/extra\/promote"/, "it posts to the CLI, which is the authority");
});
