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

// The guided tour: a step is MODAL, a spotlight re-places on ANY layout change,
// and it scrolls its target into view INSTANTLY (a smooth scroll needs frames,
// and a spotlight correct only in a foregrounded tab is not correct).
//
// Split out of webui.test.js in v0.48.1, alongside bin/webui/ itself.

test("tour: the spotlight always stacks above what it points at", () => {
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (sel) => {
    const m = css.match(new RegExp("\\" + sel + "\\s*\\{([^}]*)\\}"));
    return m ? m[1] : "";
  };
  const z = (sel) => {
    const m = rule(sel).match(/z-index:\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };

  // The wrapper must generate no box — anything positioned here re-creates the
  // stacking context that caused the bug.
  assert.match(rule(".tour-layer"), /display:\s*contents/, "the tour wrapper must not create a stacking context");
  assert.ok(!/position:\s*(fixed|absolute|relative|sticky)/.test(rule(".tour-layer")), "the wrapper must not be positioned");

  const ring = z(".tour-ring");
  const targetZ = z(".tour-target");
  const pop = z(".tour-pop");
  const modal = z(".modal-host");
  assert.ok(ring && targetZ && pop && modal, "every tour layer needs an explicit z-index");
  assert.ok(ring < targetZ, "the highlighted element must sit above the scrim");
  assert.ok(targetZ < pop, "the popover must never be buried by what it points at");
  assert.ok(pop < modal, "a modal still wins over the tour");

  // Forcing position on the target is what unstuck the rail.
  assert.ok(!/position:/.test(rule(".tour-target")), ".tour-target must not force a position");
  assert.match(rule(".tour-target-rel"), /position:\s*relative/, "static targets get relative separately");

  const js = appJs();
  assert.match(
    js,
    /getComputedStyle\(target\)\.position === "static"/,
    "the relative fallback must apply only to targets that are actually static"
  );
});

test("handover: the reload puts the token back on the URL", () => {
  const js = appJs();

  // The boot strips `?t=` out of the address bar, so a plain `location.reload()`
  // re-requests an address with NO token and the server answers with the
  // "missing its session token" page. Every post-update hand-over did that.
  assert.match(js, /function reloadWithToken\(\)/, "a reload helper must exist");
  assert.match(
    js,
    /location\.replace\(location\.pathname \+ q \+ location\.hash\)/,
    "the helper must re-attach the token to the URL it reloads"
  );
  assert.ok(
    !/location\.reload\(\)/.test(js),
    "location.reload() drops the token — every reload must go through reloadWithToken()"
  );
  assert.match(js, /reloadWithToken\(\);/, "the hand-over must use it");
});

test("tour: it is per-project, skippable, and replayable", () => {
  const js = appJs();

  // Keyed by project root: a second repo gets its own tour.
  assert.match(js, /function tourSeen\(root\)/, "seen-state must be per project");
  assert.match(js, /\[root \|\| "\?"\]/, "the project root must be the key");
  // Never a one-way door. The prose now lives in the string table, so that is
  // where the affordance is asserted — a replay button with no label is the
  // same regression as no replay button.
  assert.match(js, /t\("shortcuts\.replay"\)/, "a dismissed tour must be replayable");
  assert.ok(en["shortcuts.replay"], "the replay action needs a label in the string table");
  // Fixture mode teaches the panel with numbers that are not real.
  assert.match(js, /!metaInfo\.fixtures && !tourSeen/, "the tour must not run on fixtures");

  // The upgrade spotlight ends because you did the thing — so it has no Next
  // and no Skip, and it names the click that clears it.
  const i = js.indexOf("function startUpgradeSpotlight");
  const fn = js.slice(i, i + 800);
  assert.match(fn, /dismissOnClickSelector/, "the upgrade spotlight must clear on the real click");
  assert.ok(!/onNext|onSkip/.test(fn), "the upgrade spotlight must have no next/skip");
});

// v0.43.6 — the guided tour is MODAL.
//
// It shipped fully click-through, which sounds friendlier and is not: clicking
// the sidebar mid-tour swapped the panel out from under the popover, so the
// ring was left pointing at an element that no longer existed and the step's
// text described a page you were no longer on. Next and Skip must be the only
// live controls while a step is up.
test("tour: a guided step blocks everything except its own buttons", () => {
  const js = appJs();
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");

  // The blocker exists, and it is created for every step that did not opt out.
  assert.match(js, /const blocker = interactive \? null : el\("div", "tour-block"\)/, "a non-interactive step must build a blocker");

  const rule = (sel) => {
    const m = css.match(new RegExp("\\" + sel + "\\s*\\{([^}]*)\\}"));
    return m ? m[1] : "";
  };
  const z = (sel) => {
    const m = rule(sel).match(/z-index:\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };
  const block = z(".tour-block");
  assert.ok(block, ".tour-block needs an explicit z-index");
  // ABOVE the highlighted element: lifting the target to 46 is what keeps it
  // visible through the scrim, and a blocker underneath it would leave exactly
  // one element clickable — the one that navigates away mid-tour.
  assert.ok(block > z(".tour-target"), "the blocker must cover the highlighted element too");
  assert.ok(block < z(".tour-pop"), "the popover must stay above the blocker, or Next is unclickable");
  assert.match(rule(".tour-block"), /position:\s*fixed/, "the blocker must cover the viewport");
  assert.ok(!/pointer-events:\s*none/.test(rule(".tour-block")), "the blocker must RECEIVE clicks, not pass them through");

  // The keyboard is blocked too: 1-9 navigating the rail is the same failure.
  assert.match(js, /if \(tourActive && tourActive\.blocking\) return;/, "shortcuts must be inert during a blocking step");
  assert.match(js, /tourActive = \{\s*\n?\s*blocking:/, "the tour must publish whether it is blocking");

  // The upgrade spotlight is the ONE opt-out — blocking it would block the very
  // click that dismisses it.
  const up = js.slice(js.indexOf("function startUpgradeSpotlight"), js.indexOf("function startUpgradeSpotlight") + 800);
  assert.match(up, /interactive:\s*true/, "the upgrade spotlight must stay click-through");
});

// v0.43.6 — a tour step must point at something that HAS a size. The Experiment
// lanes shipped collapsed, and a collapsed section is zero-height: the step that
// teaches it drew a ring around nothing.

test("tour: a spotlight re-places itself when the page grows under it", () => {
  const js = appJs();
  const fn = js.slice(js.indexOf("function spotlight({"), js.indexOf("// The first-run walkthrough"));

  assert.match(fn, /new ResizeObserver\(reflow\)/, "a height change anywhere must re-place the ring");
  assert.match(fn, /getElementById\("banners"\)/, "the banner host is the one that grows late");

  // A ResizeObserver alone is not enough: it is delivered from the RENDERING
  // lifecycle, so a throttled tab — exactly the tab somebody comes back to —
  // never gets the callback. The MutationObserver runs off the microtask queue.
  assert.match(fn, /new MutationObserver\(/, "there must be a frame-independent trigger too");
  assert.match(fn, /mo\.observe\(document\.body, \{ childList: true, subtree: true/, "it must watch the whole document, not one host");
  // Attributes are the one thing it must NOT watch: `place()` writes inline
  // styles on the ring and popover, so observing them is an infinite loop.
  assert.ok(!/attributes:\s*true/.test(fn), "observing attributes would make place() trigger itself forever");
  assert.match(fn, /if \(queued\) return;/, "mutations must coalesce to one reflow per task");
  assert.match(fn, /ro\.disconnect\(\)/, "the observers must be released on cleanup");
  assert.match(fn, /mo\.disconnect\(\)/, "the observers must be released on cleanup");

  // keepInView must NOT be wired to the scroll listener — a spotlight that
  // scrolls back every time you scroll away is one you cannot get out of.
  assert.match(fn, /const onResize = \(\) => place\(\);/, "scrolling only re-places, it never re-scrolls");
  assert.match(fn, /if \(!target \|\| adjusting\) return;/, "the re-scroll must not recurse through its own scroll event");
});

// v0.44.1 — the changelog is this repo's README, hard-wrapped at ~78 columns,
// rendered `pre-wrap` into a 660px box: every authoring line break survived and
// the paragraphs came out as a ragged stack ending nowhere near the right edge.

test("tour: a spotlight scrolls its target into view and freezes the panel entrance", () => {
  const js = appJs();
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, "");

  const fn = js.slice(js.indexOf("function spotlight({"), js.indexOf("// The first-run walkthrough"));
  assert.match(fn, /target\.scrollIntoView\(\{ block: "center"/, "the target must be scrolled into view first");
  // Smooth needs frames to land; a spotlight that is only correct in a
  // foregrounded, unthrottled tab is not correct.
  assert.ok(!/scrollIntoView\(\{[^}]*behavior:\s*"smooth"/.test(fn), "the scroll must be instant, not animated");

  // `panel-in` and `block-in` both animate transform, and a running transform
  // animation is a stacking context — which decides the ring/popover ladder by
  // accident of timing rather than by the documented z-index order.
  assert.match(fn, /classList\.add\("tour-on"\)/, "the panel entrance must be frozen while a step is up");
  assert.match(fn, /classList\.remove\("tour-on"\)/, "and unfrozen on cleanup");
  assert.match(css, /body\.tour-on \.panel[^{]*\{\s*animation:\s*none/, "the freeze must cover the panel and its blocks");
});

// v0.43.7 — the Crosslink Design tab.
//
// The picture must stay comparable between openings (a computed layout, not a
// physics sim) and must never become a second opinion about peer state: the
// chips repeat the CLI's own words.
