"use strict";
/* 02-ui.js — orc ui client
   The shared furniture: chip, card, kvList, collapsible, skeleton, empty, toast,
   copy, modal, head, statTile. Paired with css/03-components.css.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


function chip(text, kind, pulse) {
  const c = el("span", "chip" + (kind ? " chip-" + kind : "") + (pulse ? " chip-pulse" : ""), text);
  return c;
}

function card(title, right) {
  const c = el("div", "card");
  if (title) {
    const head = el("div", "card-head");
    head.append(el("h2", null, title));
    if (right) head.append(right);
    c.append(head);
  }
  return c;
}

// `copyable` marks the rows whose whole purpose is to be pasted somewhere else
// — filesystem paths, config locations, install specs. Selecting a wrapped
// monospace path by hand is the kind of small friction nobody reports.
function kvList(rows, copyable) {
  const dl = el("dl", "kv");
  for (const [k, v] of rows) {
    if (v === undefined || v === null || v === "") continue;
    const dd = el("dd", null, esc(v));
    if (copyable) {
      dd.classList.add("kv-copy");
      const b = el("button", "copy-btn", t("common.copy").toLowerCase());
      b.type = "button";
      b.title = t("common.copy");
      b.addEventListener("click", () => copy(String(v), k));
      dd.append(b);
    }
    dl.append(el("dt", null, k), dd);
  }
  return dl;
}

// A collapsible card. Extracted from the settings tiers so a second caller does
// not fork the fold behaviour — the `1fr → 0fr` grid trick needs a real element
// child to collapse against, and getting that subtly wrong twice is how two
// sections end up animating differently.
function collapsible({ title, count, desc, content, collapsed, chipEl }) {
  const wrap = el("div", "card tier" + (collapsed ? " collapsed" : ""));

  const h = el("button", "tier-head");
  h.type = "button";
  h.setAttribute("aria-expanded", String(!collapsed));
  h.append(el("span", "tier-caret", "▸"));
  h.append(el("h2", null, title));
  if (count) h.append(el("span", "tier-count", count));
  if (chipEl) h.append(chipEl);
  h.addEventListener("click", () => {
    const open = h.getAttribute("aria-expanded") === "true";
    h.setAttribute("aria-expanded", String(!open));
    wrap.classList.toggle("collapsed", open);
  });

  const inner = el("div", "tier-body-inner");
  if (desc) inner.append(el("div", "tier-desc", desc));
  const rows = el("div", "tier-rows");
  rows.append(content);
  inner.append(rows);
  const bodyWrap = el("div", "tier-body");
  bodyWrap.append(inner);

  wrap.append(h, bodyWrap);
  return wrap;
}

function skeleton(n) {
  const f = frag();
  for (let i = 0; i < (n || 4); i++) f.append(el("div", "skeleton" + (i % 3 === 2 ? " w-60" : i % 3 === 1 ? " w-40" : "")));
  return f;
}

function empty(msg, hint) {
  const box = el("div", "empty");
  box.append(el("div", null, msg));
  if (hint) box.append(el("div", "note", hint));
  return box;
}

// Every panel's load-failure box. It shows the reason AND the output the CLI
// actually produced — a 500 with no message is what the user saw before v0.49.2.
function failBox(e) {
  const box = empty(t("common.loadFail"), String((e && e.message) || e));
  const detail = e && e.detail ? String(e.detail).trim() : "";
  if (detail) box.append(el("pre", "block wrap fail-detail", detail.slice(0, 2000)));
  return box;
}

function toast(msg, kind, detail) {
  const t = el("div", "toast" + (kind ? " toast-" + kind : ""));
  t.append(el("div", null, msg));
  if (detail) t.append(el("pre", null, detail.slice(0, 900)));
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "bad" ? 9000 : 4200);
}

function copy(text, label) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast(t("common.clipboardOk", { label: label || t("common.copied") }), "ok"))
    .catch(() => toast(t("common.clipboardFail"), "bad"));
}

/* ----------------------------------------------------------------- modal -- */

function modal({ title, body, actions }) {
  const host = $("#modal-host");
  $("#modal-title").textContent = title;
  const b = $("#modal-body");
  const f = $("#modal-foot");
  b.replaceChildren(body);
  f.replaceChildren();
  // Two call shapes exist in this file: an ARRAY of {label,onClick}, and an
  // OBJECT keyed by label whose value is the handler (`null` = just close).
  // `for…of` over the object form throws, which silently killed the confirm
  // dialogs on Promises, Self-serve and Challenge — a dead button that logs
  // nothing. Normalising here is what stops a third shape appearing.
  const list = Array.isArray(actions)
    ? actions
    : Object.entries(actions || {}).map(([label, fn]) => ({
        label,
        onClick: (close) => {
          close();
          if (typeof fn === "function") fn();
        },
      }));
  for (const a of list) {
    const btn = el("button", "btn btn-allow-busy " + (a.cls || ""), a.label);
    btn.type = "button";
    if (a.id) btn.id = a.id;
    btn.disabled = !!a.disabled;
    btn.addEventListener("click", () => a.onClick(closeModal));
    f.append(btn);
  }
  host.hidden = false;
  const onKey = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", onKey);
  $("#modal-backdrop").onclick = closeModal;
  function closeModal() {
    host.hidden = true;
    document.removeEventListener("keydown", onKey);
  }
  return closeModal;
}

function head(host, title, sub, right) {
  const h = el("div", "page-head");
  const left = el("div");
  left.append(el("h1", null, title));
  if (sub) left.append(el("div", "page-sub", sub));
  h.append(left);
  if (right) h.append(right);
  host.append(h);
  return h;
}

// A tile can now be a LINK to the panel that owns its number. It stays a plain
// div when there is nowhere useful to go — a tile that reacts to the pointer
// and then does nothing is worse than one that never moved.
function statTile(label, value, note, kind, panel) {
  const tile = el(panel ? "button" : "div", "stat" + (panel ? " stat-link" : ""));
  if (panel) {
    tile.type = "button";
    tile.addEventListener("click", () => (location.hash = "#/" + panel));
  }
  tile.append(el("div", "stat-label", label));
  const v = el("div", "stat-value", value);
  if (kind === "ok") v.style.color = "var(--ok)";
  if (kind === "warn") v.style.color = "var(--warn)";
  if (kind === "bad") v.style.color = "var(--bad)";
  tile.append(v);
  if (note) tile.append(el("div", "stat-note", note));
  return tile;
}
