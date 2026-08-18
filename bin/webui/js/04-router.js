"use strict";
/* 04-router.js — orc ui client
   PANELS, currentPanel, metaInfo, route(), section().
   A panel registers itself by assigning PANELS.<name> in its own file.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


/* ----------------------------------------------------------------- router -- */

const PANELS = {};
let currentPanel = null;
// Filled by boot(). The tour needs the project root to remember "seen" per
// project, and needs to know it is not looking at fixtures.
let metaInfo = { fixtures: false, project_root: "" };

function route() {
  const name = (location.hash.replace(/^#\//, "") || "overview").split("?")[0];
  const panel = PANELS[name] ? name : "overview";
  currentPanel = panel;
  for (const a of document.querySelectorAll("#nav a"))
    a.setAttribute("aria-current", a.dataset.panel === panel ? "page" : "false");
  const host = $("#panel");
  host.replaceChildren();
  // Re-trigger the 180ms panel animation on every navigation.
  host.style.animation = "none";
  void host.offsetHeight;
  host.style.animation = "";
  PANELS[panel](host);
  renderBanners();
}

// Every panel body is rendered async; this keeps the skeleton/error handling in
// ONE place instead of nine.
async function section(host, loader, render) {
  // `stack` is not decoration: it is what spaces the blocks a panel renders.
  // Without it the children collide unless they happen to be two cards in a row.
  const slot = el("div", "stack");
  slot.append(skeleton(4));
  host.append(slot);
  try {
    const data = await loader();
    const out = render(data);
    slot.replaceChildren(out || el("div"));
  } catch (e) {
    slot.replaceChildren(failBox(e));
  }
  return slot;
}
