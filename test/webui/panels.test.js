"use strict";
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
  assert.match(show, /options: m\.options \? m\.options\.map\(String\) : null/, "diy show --json must publish each key's closed set");
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
