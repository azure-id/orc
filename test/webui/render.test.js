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

// The stylesheet layers and the markdown renderer. The half that shipped broken
// once: a <link>/<script> sends no token of its own, so every asset 401'd while
// the page itself was a clean 200 — unstyled, scriptless markup that no test
// saw, because each one fetched with a token the real browser never has.
//
// Split out of webui.test.js in v0.48.1, alongside bin/webui/ itself.

test("css: block spacing is owned by the container, not by sibling pairs", () => {
  // Comments are stripped first: this file DOCUMENTS the dead selectors by
  // name, and a test that cannot tell a rule from a comment about that rule
  // would fail on its own explanation.
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(css, /\.stack\s*\{[^}]*display:\s*flex/, "`.stack` must exist and be a flex container");
  assert.match(css, /\.stack\s*\{[^}]*gap:/, "`.stack` must space its children with gap");

  // Each of these spaced exactly one pair of block types and nothing else.
  // Re-adding one means a block type has an outer margin again, which double-
  // spaces inside a gapped container instead of fixing the collision.
  for (const dead of [".card + .card", ".action + .action", ".skeleton + .skeleton"]) {
    assert.ok(!css.includes(dead), `${dead} is pair-based spacing — the container owns the gap now`);
  }
  assert.ok(!/\.tier\s*\{[^}]*margin/.test(css), "`.tier` must not carry an outer margin");
  assert.ok(!/\.tabs\s*\{[^}]*margin/.test(css), "`.tabs` must not carry an outer margin");
});

test("js: every panel container carries the class that spaces its children", () => {
  const js = appJs();

  // These four names ARE the panel containers: `section`'s async slot, each
  // panel's `body`, and the two halves of the Runs split. A new panel written
  // as `const body = el("div")` renders its cards flush against each other and
  // looks like a CSS bug — it is this test, not the stylesheet, that catches it.
  const containers = [...js.matchAll(/const (body|slot|listSlot|detailSlot) = el\("div"([^)]*)\)/g)];
  assert.ok(containers.length >= 10, `expected the panel containers to be found, saw ${containers.length}`);

  for (const m of containers) {
    assert.match(
      m[2],
      /"stack/,
      `\`const ${m[1]} = el("div"${m[2]})\` must carry "stack" — without it its children collide`
    );
  }
});

// v0.43.5 — the panel asked whether an update existed with the check turned off.
//
// runCli forced ORC_NO_UPDATE_CHECK=1 on every subprocess to keep maybeNudge's
// stdout line out of the --json object. `version` has no nudge and the check IS
// its payload, so the blanket flag silenced the one command whose entire job is
// to answer the question the UI was asking.

test("css: a modal contains its own scroll, and the page behind it is locked", () => {
  // v0.52.0 / D2. Scrolling inside a modal scrolled the page behind it, in every
  // modal in the app — the Extra ones are simply the tallest. Two things were
  // missing: the modal's scroll CHAINED to <body> at either end, and a wheel
  // over the backdrop was never the modal's to begin with.
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.modal-host\s*\{[^}]*overscroll-behavior:\s*contain/);
  assert.match(css, /\.modal\s*\{[^}]*overscroll-behavior:\s*contain/);
  assert.match(css, /body\.modal-open\s*\{[^}]*overflow:\s*hidden/);
  // The scroll position survives because the gutter never collapses — cheaper
  // than saving a number and putting it back.
  assert.match(css, /html\s*\{[^}]*scrollbar-gutter:\s*stable/);

  // ONE add and ONE remove. `closeModal` is the single exit, so there is no path
  // around either.
  const js = appJs();
  assert.match(js, /document\.body\.classList\.add\("modal-open"\)/);
  assert.match(js, /document\.body\.classList\.remove\("modal-open"\)/);
});

test("css: a tool card has NO row template, and a chip in it can never be stretched", () => {
  // v0.53.0. v0.52.0 gave `.ex-tool` `grid-template-rows: auto auto auto 1fr
  // auto` and this test asserted the property was PRESENT — which it was, while
  // the panel drew a 250px green ellipse. FOUR STATES CARRY FOUR DIFFERENT
  // NUMBERS OF CHILDREN, so a ready+verified card's "connected as" chip landed
  // in the `1fr` slack row, stretched (a grid item's default), and its 999px
  // radius did the rest. A property-presence assertion cannot see which child
  // is sitting in the stretch row, so these two assert the BEHAVIOUR instead.
  const css = panelCss("extra").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /\.ex-tool\s*\{[^}]*\}/.exec(css);
  assert.ok(rule, ".ex-tool must be styled");
  assert.ok(
    !/grid-template-rows:/.test(rule[0]),
    "no positional row template on a card whose child count changes per state"
  );
  // The footer is pushed down by the FREE SPACE, not by a declared row.
  assert.match(css, /\.ex-tool > \.row-actions:last-child\s*\{[^}]*margin-top:\s*auto/);
  // A chip states a fact; it is never a layout element.
  assert.match(css, /\.ex-tool > \.chip\s*\{[^}]*align-self:/);
  // The one unbounded field is clamped rather than allowed to set the height.
  assert.match(css, /dd\.ex-auth-detail/);
  assert.ok(!/subgrid/.test(css), "subgrid breaks the moment a card in a different state joins the row");
  // …and the two files agree BY NAME: the verified branch appends a `chip` as a
  // direct child of the card, which is what the selector above is written for.
  const js = panelJs("extra");
  assert.match(js, /box\.append\(chip\(t\("extra\.tools\.connectedAs"\)/);
  // `.ex-tool` was the one `.ex-*` block with no narrow-viewport entry at all.
  assert.match(appCss(), /\.ex-tool > \.row-actions:last-child \{[^}]*align-items:\s*stretch/);
});

test("changelog: the parser reads this repo's own CHANGELOG.md", () => {
  // The parser's contract is THIS file's format — the one CLAUDE.md mandates.
  // Testing it against the real CHANGELOG.md is what stops the two drifting.
  // (It read the README until the README was compacted to the newest entry
  // only; a parser pointed at the README would answer "one entry" to a user
  // ten releases behind.)
  const cli = fs.readFileSync(path.join(REPO, "bin", "cli.js"), "utf8");
  const start = cli.indexOf("function parseChangelog");
  const end = cli.indexOf("\nasync function changelog");
  assert.ok(start > 0 && end > start, "the parser must exist");
  const parseChangelog = new Function(cli.slice(start, end) + "\nreturn parseChangelog;")();

  const changelogMd = fs.readFileSync(path.join(REPO, "CHANGELOG.md"), "utf8");
  const entries = parseChangelog(changelogMd);
  assert.ok(entries.length > 20, `expected the real changelog to parse, got ${entries.length}`);
  assert.match(entries[0].version, /^\d+\.\d+\.\d+$/, "the newest entry must have a semver");
  assert.match(entries[0].date || "", /^\d{4}-\d{2}-\d{2}$/, "and a parsed date");
  assert.ok(entries[0].body.length > 0, "and a body to show in the modal");
  // Newest first is what makes "entries newer than mine" a prefix, not a scan.
  assert.ok(
    entries[0].version.localeCompare(entries[entries.length - 1].version, undefined, { numeric: true }) > 0,
    "entries must come out newest-first"
  );

  // An entry stops at the next SECTION heading, not only at the next release.
  // `## Earlier releases` and the rule above it are document furniture, and
  // they used to be glued onto the end of the newest entry in the upgrade
  // modal — the one place a user reads a release body in full.
  for (const e of entries) {
    assert.ok(!/\n##(?!#)\s/.test(e.body), `v${e.version} swallowed a section heading`);
    assert.ok(!/-{3,}\s*$/.test(e.body), `v${e.version} ends on a horizontal rule`);
  }

  // The installed version must have an entry, or `orc changelog` tells everyone
  // upgrading to it that there is nothing new — and `orc upgrade` never fires
  // for anyone at all, because the version gate is what triggers it.
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  assert.ok(
    entries.some((e) => e.version === pkg.version),
    `package.json is ${pkg.version} but CHANGELOG.md has no entry for it`
  );
  assert.strictEqual(entries[0].version, pkg.version, "the newest entry must be the shipped version");

  // Malformed input degrades to nothing, never to a wrong entry or a throw.
  assert.deepStrictEqual(parseChangelog(""), []);
  assert.deepStrictEqual(parseChangelog(null), []);
  assert.deepStrictEqual(parseChangelog("## Changelog\n\nno entries here\n"), []);
});

test("changelog: fetched content is never parsed as HTML", () => {
  const js = appJs();
  const i = js.indexOf("async function showChangelog");
  const fn = js.slice(i, js.indexOf("\nfunction stripMd"));
  // This text comes off the network. It goes in as TEXT — never innerHTML, and
  // never through a markdown renderer that would emit tags.
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(fn), "changelog text must never be set as HTML");
  assert.match(js, /function stripMd/, "markdown markers are stripped, not rendered");
});

// v0.43.6 — the first spotlight rendered UNDERNEATH the sidebar.
//
// Two compounding causes, both invisible in the numbers alone: the wrapper was
// `position: fixed`, which ALWAYS creates a stacking context, trapping the ring
// and popover at the layer's z-index while the highlighted element (46) painted
// over them; and `.tour-target` forced `position: relative`, which unsticks the
// sticky rail — step one's target.

test("css: a scrolling box has a transparent track, not a grey gutter", () => {
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");

  // Both syntaxes, because neither falls back to the other: Firefox reads the
  // properties, WebKit and Chromium read the pseudo-elements.
  assert.match(css, /scrollbar-width:\s*thin/, "Firefox needs scrollbar-width");
  assert.match(css, /scrollbar-color:\s*var\(--line\) transparent/, "Firefox needs a transparent track colour");
  assert.match(css, /::-webkit-scrollbar-track[^{]*\{[^}]*background:\s*transparent/, "the WebKit track must be transparent");
  assert.match(css, /::-webkit-scrollbar-thumb[^{]*\{[^}]*border-radius:\s*999px/, "the thumb is rounded");
  // The card behind it must show through — a track painted in a surface colour
  // is the grey band this replaced.
  assert.ok(
    !/::-webkit-scrollbar-track[^{]*\{[^}]*background:\s*var\(--surface/.test(css),
    "the track must never be painted in a surface colour"
  );
});

// v0.44.0 — a flow key accepts a CLOSED SET, so it gets a dropdown.
//
// The list is the CLI's `options`, never a copy: a second idea of what a key
// accepts is the same drift the stepper's steps[] rule exists to prevent, and
// here it would show a value that `orc diy set` then refuses.

test("changelog: the body is reflowed to the box, and the banner lines up", () => {
  const js = appJs();
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(js, /function reflowMd\(/, "the body must be reflowed before it is rendered");
  assert.match(js, /reflowMd\(stripMd\(e\.body\)\)/, "and the modal must actually use it");

  // The three children of the update banner used to sit on three different
  // alignments: badge at the top, text at the top, CTA on the centre.
  assert.ok(
    !/\.banner-badge\s*\{[^}]*align-self:\s*flex-start/.test(css),
    "the NEW pill must not be pinned to the top of a two-line message"
  );
  assert.match(css, /\.banner-update\s*\{[^}]*align-items:\s*center/, "the banner row centres its children");
});

// v0.44.0 — the one action on Maintenance that does not target this project.

test("css: prefers-reduced-motion disables motion, including the stagger delay", () => {
  const css = appCss();
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(block, "the reduced-motion block must exist");

  for (const prop of ["animation-duration", "animation-iteration-count", "transition-duration"]) {
    assert.match(block, new RegExp(prop + ":[^;]*!important"), `${prop} must be neutralised`);
  }
  // The staggered entrance fills `backwards`. Without this reset the delay
  // survives, and a reduced-motion user watches blocks stay invisible for the
  // length of their delay — motion "off" would mean content missing.
  assert.match(block, /animation-delay:\s*0ms\s*!important/, "the stagger delay must be reset, or blocks never appear");
  assert.match(block, /transform:\s*none\s*!important/, "hover/press nudges must be removed, not merely sped up");
});

// v0.48.1 — the stylesheet is 22 files now. Two rules keep the split honest.
test("css: there is exactly ONE reduced-motion block, and it loads last", () => {
  const files = webuiFiles("css");
  const hits = files.filter((f) =>
    fs.readFileSync(path.join(WEBUI, "css", ...f.split("/")), "utf8").includes("prefers-reduced-motion")
  );
  assert.deepStrictEqual(
    hits,
    ["04-motion.css"],
    "scattering reduced-motion per panel is how the rule gets quietly broken — it lives in 04-motion.css and nowhere else"
  );

  // Several of its declarations are deliberately NOT !important: an infinite
  // animation capped at one iteration freezes mid-cycle, so .vault-pulse and
  // .step-flow are removed with a plain `display: none`. An equal-specificity
  // rule in a stylesheet loading afterwards would win on ORDER and switch the
  // animation back on — so this file has to be the last <link> on the page.
  const links = assetRefs("css");
  assert.strictEqual(links[links.length - 1], "css/04-motion.css", "04-motion.css must be the LAST stylesheet loaded");
  assert.strictEqual(
    links[links.length - 2],
    "css/06-responsive.css",
    "the cross-panel breakpoints must load after every panel they override"
  );
  for (const decl of [".vault-pulse", ".step-flow"])
    assert.match(
      block(),
      new RegExp(decl.replace(".", "\\.") + "\\s*\\{\\s*display:\\s*none"),
      `${decl} must be REMOVED, not capped — a capped infinite animation freezes mid-cycle`
    );

  function block() {
    const css = appCss();
    return css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  }
});

test("css: colour tokens are defined once, on bare :root, and never in a panel file", () => {
  for (const f of webuiFiles("css")) {
    const src = fs.readFileSync(path.join(WEBUI, "css", ...f.split("/")), "utf8");
    if (f !== "00-tokens.css")
      assert.ok(
        !/^:root\s*\{/m.test(src),
        `${f} defines tokens on bare :root — every token belongs in 00-tokens.css so a re-skin is one file`
      );
    if (!f.startsWith("panels/")) continue;
    // A token redefined inside a panel's theme block is invisible to the theme
    // toggle's other direction: the three theme states (light / dark /
    // unset-system) each need the same token set, and only 00-tokens.css has it.
    const themed = src.match(/@media \(prefers-color-scheme[\s\S]*?\n\}/g) || [];
    for (const b of themed)
      assert.ok(!/--[\w-]+\s*:/.test(b), `${f} redefines a custom property inside a theme block`);
  }
});

test("bin/ui.js and bin/webui/ each name the other", () => {
  assert.match(fs.readFileSync(path.join(REPO, "bin", "ui.js"), "utf8"), /webui/, "bin/ui.js should point at bin/webui/");
  assert.match(
    fs.readFileSync(path.join(REPO, "bin", "webui", "serve.js"), "utf8"),
    /bin\/ui\.js/,
    "bin/webui/serve.js should point at bin/ui.js"
  );
});

// ── Mocked Skill Use (v0.46.x) ──────────────────────────────────────────────
//
// The catalogue is DERIVED from the files on disk, so the failure this guards
// is a doc that exists and is invisible: a walkthrough in mock-run/ that no
// surface lists is the same as a walkthrough nobody wrote.
