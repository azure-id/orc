"use strict";
/* 90-tour.js — orc ui client
   refreshJob (the maintenance job poller) plus the guided tour.
   
   A tour step is MODAL: .tour-block sits ABOVE the highlighted element and a
   capture-phase key handler makes Next/Skip the only live controls. The upgrade
   spotlight is the ONE opt-out, because blocking it would block the click that
   dismisses it. A spotlight re-places on ANY layout change via a ResizeObserver
   AND a MutationObserver — never RO alone.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


let jobPoll = null;
async function refreshJob() {
  const host = document.getElementById("job-card");
  if (!host) return;
  let j;
  try {
    j = await api("/api/job");
  } catch (_) {
    return;
  }
  host.replaceChildren();
  if (!j.id) {
    const h0 = el("div", "card-head");
    h0.append(el("h2", null, t("maintenance.lastRun")));
    host.append(h0, el("div", "note", t("maintenance.nothingRun")));
    return;
  }
  const h = el("div", "card-head");
  h.append(el("h2", null, j.command));
  h.append(
    chip(
      j.running ? t("maintenance.running") : j.exit_code === 0 ? t("common.done") : t("maintenance.failed"),
      j.running ? "info" : j.exit_code === 0 ? "ok" : "bad"
    )
  );
  host.append(h);
  const out = el("pre", "job-output", j.output || t("maintenance.noOutput"));
  host.append(out);
  out.scrollTop = out.scrollHeight;

  if (j.running) {
    setBusy(true);
    clearTimeout(jobPoll);
    jobPoll = setTimeout(refreshJob, 700);
  } else {
    setBusy(false);
    clearTimeout(jobPoll);
    jobPoll = null;
  }
}

/* ==================================================================== tour == */

// A spotlight tour. Two callers, two shapes:
//   · the first-run walkthrough — next/skip, remembered once finished or skipped
//   · the upgrade spotlight — no buttons at all; it clears when you do the thing
//
// Seen-state is per PROJECT, keyed on the project root, so a second repo gets
// its own tour and clearing it for one does not clear it for the rest. It lives
// in localStorage rather than a config key on purpose: this panel writes config
// only by shelling the CLI, and "this browser has seen the tour" is not a fact
// about the project that belongs in a file the whole team shares.
const TOUR_KEY = "orc-ui-tour-seen";

function tourSeen(root) {
  try {
    return JSON.parse(localStorage.getItem(TOUR_KEY) || "{}")[root || "?"] === true;
  } catch (_) {
    return false;
  }
}
function markTourSeen(root) {
  try {
    const all = JSON.parse(localStorage.getItem(TOUR_KEY) || "{}");
    all[root || "?"] = true;
    localStorage.setItem(TOUR_KEY, JSON.stringify(all));
  } catch (_) {}
}

let tourActive = null;

function clearTour() {
  if (!tourActive) return;
  tourActive.cleanup();
  tourActive = null;
}

// One spotlight over one element. The target is found at SHOW time, never
// captured up front: panels re-render, and a held reference points at a node
// that is no longer in the document.
//
// MODALITY (v0.43.6). The guided tour is now a MODAL spotlight: while a step is
// up, Next and Skip are the only things you can click, the rail is inert, and
// the panel underneath cannot be navigated. It shipped fully click-through,
// which sounds friendlier and is not: clicking the sidebar mid-tour swapped the
// panel out from under the popover, so the ring was left pointing at an element
// that no longer existed and the step's text described a page you were no
// longer on. A tour that can be walked away from without ending is a tour that
// silently breaks.
//
// The ONE exception is the upgrade spotlight, which has no buttons and whose
// entire design is "do the thing and I go away" — it passes `interactive: true`
// and keeps the page live underneath. Modality is opt-out precisely because
// that variant is the odd one, not the rule.
function spotlight({ selector, title, text, step, total, onNext, onSkip, dismissOnClickSelector, interactive }) {
  clearTour();

  const target = selector ? document.querySelector(selector) : null;
  // A step whose target is missing is SKIPPED, never shown floating in the
  // middle of the screen pointing at nothing.
  if (selector && !target) return false;

  // OFF-SCREEN TARGETS (v0.44.0). A spotlight only works on something you can
  // SEE. The upgrade row is the fourth action on Maintenance and sits below the
  // fold on a normal window, so arriving from the changelog's "go upgrade" drew
  // the ring at y≈760 in a 720px viewport — the popover floated near the bottom
  // pointing at nothing, and the thing it was pointing at was off screen.
  // Scroll FIRST, place after; `place()` also re-runs on every scroll, so the
  // ring keeps tracking if the user scrolls away.
  //
  // INSTANT, not smooth. A smooth scroll needs animation frames to finish, so
  // the ring's position would depend on frames arriving — and a spotlight that
  // is correct only when the tab is in the foreground and unthrottled is not
  // correct. The step appears in place instead of gliding to it, which is the
  // right trade for the one control that has to be pointing at something.
  if (target) target.scrollIntoView({ block: "center", inline: "nearest" });
  // A spotlight also freezes the panel's entrance animations. `panel-in` and
  // `block-in` both animate `transform`, and a running transform animation makes
  // its element a STACKING CONTEXT — which traps the highlighted element's
  // z-index inside the panel and decides the ring/popover ladder by accident of
  // timing. With the animations off, the documented ladder is the only thing
  // that orders these layers.
  document.body.classList.add("tour-on");

  const layer = el("div", "tour-layer");
  // The blocker sits ABOVE the highlighted element and below the popover, so
  // the only live controls on screen are the ones inside the popover. It is a
  // real element rather than a `pointer-events: none` trick because it also
  // has to swallow the click, not merely fail to receive it.
  const blocker = interactive ? null : el("div", "tour-block");
  const ring = el("div", "tour-ring");
  const pop = el("div", "tour-pop");

  const place = () => {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const pad = 6;
    ring.style.top = r.top - pad + "px";
    ring.style.left = r.left - pad + "px";
    ring.style.width = r.width + pad * 2 + "px";
    ring.style.height = r.height + pad * 2 + "px";
    // Below the target unless that would run off-screen, then above it.
    const below = r.bottom + 12;
    const wantAbove = below + 150 > window.innerHeight;
    pop.style.top = (wantAbove ? Math.max(8, r.top - 12 - pop.offsetHeight) : below) + "px";
    pop.style.left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - pop.offsetWidth - 8)) + "px";
  };

  if (title) pop.append(el("div", "tour-title", title));
  pop.append(el("div", "tour-text", text));

  const foot = el("div", "tour-foot");
  if (total) foot.append(el("span", "tour-count", t("common.step", { n: step, total })));
  let nextBtn = null;
  if (onSkip) {
    const skip = el("button", "btn btn-ghost btn-sm btn-allow-busy", t("common.skipTour"));
    skip.type = "button";
    skip.addEventListener("click", onSkip);
    foot.append(skip);
  }
  if (onNext) {
    nextBtn = el("button", "btn btn-primary btn-sm btn-allow-busy", step === total ? t("common.done") : t("common.next"));
    nextBtn.type = "button";
    nextBtn.addEventListener("click", onNext);
    foot.append(nextBtn);
  }
  // The upgrade spotlight has no buttons — it says what to do and waits.
  if (!onNext && !onSkip) foot.append(el("span", "tour-waiting", t("common.waiting")));
  pop.append(foot);

  if (blocker) layer.append(blocker);
  layer.append(ring, pop);
  document.body.append(layer);
  // Focus moves into the popover so the keyboard agrees with the mouse about
  // what is live — and Enter/Space advance the tour without reaching for it.
  if (nextBtn) nextBtn.focus({ preventScroll: true });
  place();
  // Re-place after layout settles, so the popover's own height is known — and
  // again once the smooth scroll above has finished moving the target.
  requestAnimationFrame(place);
  const settle = [setTimeout(place, 160), setTimeout(place, 420)];

  const onResize = () => place();
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onResize, true);

  // LAYOUT SHIFTS UNDER THE SPOTLIGHT (v0.44.1). The ring and the popover are
  // `position: fixed` at coordinates measured ONCE, and this page grows things
  // above the fold on its own schedule: the blue update banner lands after a
  // network check, `orc doctor` adds its own banners after that, and on
  // Maintenance the upgrade row fills in a version chip and a "Check again"
  // button of its own. Every one of those pushes the target down by tens of
  // pixels — and the ring stayed where it was, so the spotlight ended up
  // framing empty space above the thing it was pointing at.
  //
  // Re-place on any of it. `place()` alone handles a target that merely MOVED;
  // `keepInView()` handles one shoved off the viewport entirely, and is
  // deliberately NOT wired to the scroll listener — a spotlight that scrolls
  // back every time you scroll away is a spotlight you cannot get out of.
  let adjusting = false;
  const keepInView = () => {
    if (!target || adjusting) return;
    const r = target.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    adjusting = true;
    target.scrollIntoView({ block: "center", inline: "nearest" });
    requestAnimationFrame(() => {
      adjusting = false;
    });
  };
  const reflow = () => {
    keepInView();
    place();
  };

  // TWO observers, because one of them is not enough on its own.
  //
  // A ResizeObserver is the right instrument — it fires on the height change
  // however it was caused, without this file having to know every place that
  // can grow. But it is delivered from the RENDERING lifecycle, so a tab the
  // browser has throttled (backgrounded, or not compositing) never gets the
  // callback, and that is exactly a tab somebody comes back to.
  //
  // A MutationObserver runs off the microtask queue and needs no frames at all.
  // It watches the whole document because the growth is never in one place: the
  // update banner is inserted into `#banners`, doctor's banners after it, and
  // the upgrade row grows a version chip INSIDE itself. Coalesced to one reflow
  // per task, so a panel re-render costs one re-place, not one per node.
  let ro = null;
  let mo = null;
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(reflow);
    for (const n of [document.body, document.getElementById("banners"), document.getElementById("panel"), target]) {
      if (n) ro.observe(n);
    }
  }
  let queued = null;
  if (typeof MutationObserver === "function") {
    mo = new MutationObserver(() => {
      if (queued) return;
      queued = setTimeout(() => {
        queued = null;
        reflow();
      }, 0);
    });
    // Attributes are NOT observed on purpose: `place()` writes inline styles on
    // the ring and the popover, and observing them would make this trigger
    // itself forever.
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // The "do the thing and I go away" variant. Capture phase, so it fires even
  // though the layer sits above the page.
  let onDo = null;
  if (dismissOnClickSelector) {
    onDo = (e) => {
      const hit = e.target.closest && e.target.closest(dismissOnClickSelector);
      if (hit) clearTour();
    };
    document.addEventListener("click", onDo, true);
  }

  if (target) {
    target.classList.add("tour-target");
    // z-index only applies to positioned elements, so a static target needs
    // `position: relative` to lift above the scrim. A target that is ALREADY
    // positioned (the rail is sticky) must keep what it has — overriding it
    // unsticks the sidebar for the duration of the tour.
    if (getComputedStyle(target).position === "static") target.classList.add("tour-target-rel");
  }

  // A blocked tour also owns the KEYBOARD: without this, `1`–`9` still navigate
  // the rail and `r` still reloads the panel, which is the same "the page moved
  // out from under the step" failure the blocker exists to prevent. Only Escape
  // gets through, and it means the same thing Skip does.
  let onKey = null;
  if (blocker) {
    onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        (onSkip || clearTour)();
        return;
      }
      if (e.key === "Tab") return; // focus stays reachable inside the popover
      if (pop.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
  }

  tourActive = {
    blocking: !!blocker,
    cleanup() {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      if (onDo) document.removeEventListener("click", onDo, true);
      if (onKey) document.removeEventListener("keydown", onKey, true);
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      if (queued) clearTimeout(queued);
      for (const id of settle) clearTimeout(id);
      if (target) target.classList.remove("tour-target", "tour-target-rel");
      document.body.classList.remove("tour-on");
      layer.remove();
    },
  };
  return true;
}

// The first-run walkthrough. Each step names the panel it lives on, so the tour
// navigates for you rather than telling you to go somewhere. Titles and text are
// keys, not sentences — the tour is panel prose, so it translates with the rest.
// Both keys are spelled out rather than derived from a step number, for the
// same reason the tier labels are: a key assembled from a fragment is invisible
// to the coverage check that keeps the tables honest.
const TOUR_STEPS = [
  { panel: "overview", selector: ".rail", title: "tour.1.title", text: "tour.1.text" },
  { panel: "overview", selector: ".grid-3", title: "tour.2.title", text: "tour.2.text" },
  { panel: "settings", selector: ".toolbar", title: "tour.3.title", text: "tour.3.text" },
  { panel: "settings", selector: "#ladder-card", title: "tour.4.title", text: "tour.4.text" },
  { panel: "runs", selector: ".run-list, .empty", title: "tour.5.title", text: "tour.5.text" },
  { panel: "knowledge", selector: ".stack", title: "tour.6.title", text: "tour.6.text" },
  { panel: "experiment", selector: ".lane-list", title: "tour.7.title", text: "tour.7.text" },
  { panel: "maintenance", selector: ".action", title: "tour.8.title", text: "tour.8.text" },
  /* v0.46.0 — four steps for the four new surfaces. Each MUST point at something
     with a SIZE: the fallbacks are the reason a `.lane-cmd` is listed second in
     every selector, because an empty Promises panel still renders the /orc-pact
     command box and a zero-height target makes the spotlight land on nothing. */
  { panel: "pact", selector: ".promise, .lane-cmd", title: "tour.9.title", text: "tour.9.text" },
  { panel: "boundary", selector: ".checklist, .lane-cmd, .card", title: "tour.10.title", text: "tour.10.text" },
  { panel: "handoff", selector: ".promise, .lane-cmd", title: "tour.11.title", text: "tour.11.text" },
  { panel: "knowledge", selector: ".free-box, .tbl, .stack", title: "tour.12.title", text: "tour.12.text" },
  /* v0.48.0 — the ribbon. Same rule as every step above: it must point at
     something with a SIZE, and the ribbon only exists once a document has been
     assembled — so `.lane-cmd` and `.doc-list` are the fallbacks, because an
     empty Docs panel still renders the /orc-doc command box. */
  { panel: "docs", selector: ".doc-ribbon-wrap, .doc-list, .lane-cmd", title: "tour.13.title", text: "tour.13.text" },
];

function startFirstRunTour(root) {
  let i = 0;
  const finish = () => {
    clearTour();
    markTourSeen(root);
    toast(t("tour.finished"), "ok");
  };
  const show = () => {
    if (i >= TOUR_STEPS.length) return finish();
    const s = TOUR_STEPS[i];
    const go = () => {
      const ok = spotlight({
        selector: s.selector,
        title: t(s.title),
        text: t(s.text),
        step: i + 1,
        total: TOUR_STEPS.length,
        onNext: () => {
          i++;
          show();
        },
        onSkip: finish,
      });
      // A step whose target never appeared is skipped rather than shown empty.
      if (!ok) {
        i++;
        show();
      }
    };
    if (currentPanel !== s.panel) {
      location.hash = "#/" + s.panel;
      // Panels render async; wait for the body rather than guessing a delay.
      waitFor(s.selector, go);
    } else {
      waitFor(s.selector, go);
    }
  };
  show();
}

// Poll briefly for a selector — panels fetch before they render, so a step must
// wait for its target instead of assuming it is already there.
function waitFor(selector, cb, tries) {
  const n = tries === undefined ? 40 : tries;
  if (!selector || document.querySelector(selector)) return cb();
  if (n <= 0) return cb();
  setTimeout(() => waitFor(selector, cb, n - 1), 50);
}

// The upgrade spotlight: no next, no skip. It points at the upgrade row and
// clears the moment you click its Preview button — the tour ends because you
// did the thing, not because you dismissed it. That makes it the ONE spotlight
// that must stay click-through (`interactive: true`): blocking the page here
// would block the very click that dismisses it.
function startUpgradeSpotlight() {
  waitFor("[data-action='upgrade']", () => {
    spotlight({
      selector: "[data-action='upgrade']",
      title: t("tour.upgrade.title"),
      text: t("tour.upgrade.text"),
      dismissOnClickSelector: "[data-action='upgrade'] button",
      interactive: true,
    });
  });
}
