"use strict";
/* ===========================================================================
   app.js — orc ui client
   ---------------------------------------------------------------------------
   Four rules keep this hackable (the plan, §9):
     1. No build step. Edit, refresh.
     2. Panels are INDEPENDENT — each is its own render function against its own
        endpoint, with no shared mutable state. Rewriting Runs must not be able
        to break Settings.
     3. Everything rendered comes from `bin/cli.js --json`. No knowledge about
        ORC is encoded here that the CLI does not already own — notably the
        config key list, the score ladder and the shadowing rules.
     4. All motion is CSS. This file toggles classes; app.css owns the timing,
        and `prefers-reduced-motion` turns the lot off.
   =========================================================================== */

/* ------------------------------------------------------------ fetch layer -- */

// The per-launch token arrives in the opened URL and is required on every /api
// call. It is kept in memory and stripped from the visible address bar so it
// does not end up in a screenshot or a pasted link.
const TOKEN = new URLSearchParams(location.search).get("t") || "";
try {
  if (TOKEN) history.replaceState(null, "", location.pathname + location.hash);
} catch (_) {}

async function api(path, opts) {
  const res = await fetch(path, {
    method: (opts && opts.method) || "GET",
    headers: Object.assign({ "x-orc-token": TOKEN }, opts && opts.body ? { "content-type": "application/json" } : {}),
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch (_) {}
  if (!res.ok) throw new Error((payload && payload.error) || `request failed (${res.status})`);
  return payload;
}

// Reads unwrap to `.data`; a non-zero exit is DATA for several commands, never
// an error, so it is passed through beside the payload.
async function read(path) {
  const r = await api(path);
  return { data: r.data, exit: r.exit_code, ok: r.ok, fixture: !!r.fixture };
}

const post = (path, body) => api(path, { method: "POST", body });

/* ------------------------------------------------------------------- i18n -- */
/*
   THE SCOPE RULE, and it is deliberately narrow: only the panel's OWN prose is
   translated. Everything that arrives from `bin/cli.js --json` stays exactly as
   the CLI wrote it — config keys and their descriptions, values, agent names,
   model ids, file paths, commands, `orc doctor` messages, command output. Those
   are identifiers, not sentences: a translated config key is a key that does not
   exist, and a translated command is a command you cannot type. So `t()` is
   never applied to a value read out of a payload, and neither string table
   contains a single ORC key name.

   The tables are plain JSON served as static assets. Adding a language is a file
   in i18n/ plus one row in LANGS and one row in serve.js's STATIC map — no build
   step, no library, no dependency.
*/
const LANGS = [
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
];
const LANG_KEY = "orc-ui-lang";

let lang = "en";
// English is loaded first and kept as the FALLBACK table: a key the other
// language has not translated yet renders in English rather than as a raw
// dotted key. A half-finished translation degrades to mixed prose, never to
// debug output on somebody's screen.
let DICT = {};
let DICT_EN = {};

function loadLang(code) {
  return fetch(`/i18n/${code}.json`, { headers: { "x-orc-token": TOKEN }, cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`i18n ${code} ${r.status}`);
    return r.json();
  });
}

// A missing or broken table must never blank the UI. Every failure path here
// lands on English, so the worst case is untranslated text — never empty text.
async function setLang(code, opts) {
  const rerender = !opts || opts.rerender !== false;
  const want = LANGS.some((l) => l.code === code) ? code : "en";
  try {
    DICT = want === "en" ? DICT_EN : await loadLang(want);
    lang = want;
  } catch (_) {
    DICT = DICT_EN;
    lang = "en";
  }
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch (_) {}
  document.documentElement.setAttribute("lang", lang);
  applyStaticText();
  if (rerender) route();
}

function t(key, vars) {
  let s = DICT[key];
  if (s === undefined) s = DICT_EN[key];
  if (s === undefined) s = key;
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  return s;
}

// English has one plural form and Indonesian has none, so count-aware lookup is
// a second key rather than a plural-rules engine: `n === 1` picks the singular.
const tn = (n, key, vars) => t(n === 1 ? key : key + "Plural", Object.assign({ n }, vars || {}));

// The parts of the shell that are markup rather than a render function. Called
// on every language change; panels re-render themselves through `route()`.
function applyStaticText() {
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  const tt = $("#theme-toggle");
  if (tt) tt.textContent = document.documentElement.getAttribute("data-theme") === "light" ? t("rail.dark") : t("rail.light");
  const hint = $("#shortcut-hint");
  if (hint) hint.title = t("rail.shortcuts");
  const label = $("#lang-label");
  if (label) label.textContent = (LANGS.find((l) => l.code === lang) || LANGS[0]).label;
  const btn = $("#lang-toggle");
  if (btn) btn.title = t("lang.title");
}

// Two languages, so the control is a TOGGLE rather than a menu: one click, no
// dropdown to open. A third language would make this a <select>; two do not.
function cycleLang() {
  const i = LANGS.findIndex((l) => l.code === lang);
  setLang(LANGS[(i + 1) % LANGS.length].code);
}

/* --------------------------------------------------------------- version -- */
// `orc version --json` performs a REAL bounded network check against the
// install source and reports {version, latest, update_available}. Three places
// want that answer — the Overview tile, the rail badge and the Maintenance
// upgrade row — so the promise is shared: one check per page load, not three.
// `refresh()` is the only way to force a second one, and it is a button the
// user presses; nothing here polls for a new release on its own.
let versionPromise = null;
const versionInfo = () => (versionPromise = versionPromise || read("/api/version").then((r) => r.data));
function refreshVersion() {
  versionPromise = null;
  return versionInfo();
}

// The one place that decides what a version payload MEANS, so the tile, the rail
// and the upgrade row can never disagree about it. `latest: null` is not "up to
// date" — it is "we could not tell", which is a different thing to show.
function versionState(v) {
  if (!v) return { kind: "", label: t("version.unknown.label"), note: t("version.unknown.note") };
  if (v.check_disabled) return { kind: "", label: t("version.off.label"), note: t("version.off.note") };
  if (!v.latest) return { kind: "warn", label: t("version.offline.label"), note: t("version.offline.note") };
  if (v.update_available)
    return {
      kind: "warn",
      label: t("version.available.label", { latest: v.latest }),
      note: t("version.available.note", { version: v.version }),
    };
  return {
    kind: "ok",
    label: t("version.current.label"),
    // `install_spec` is CLI data (a package spec), so it is interpolated, never
    // translated — only the sentence around it is ours.
    note: t("version.current.note", { version: v.version, source: v.install_spec || "the install source" }),
  };
}

/* ----------------------------------------------------------------- utils -- */

const $ = (sel, root) => (root || document).querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const frag = () => document.createDocumentFragment();

// Everything user-visible goes through textContent, so no value from disk is
// ever parsed as markup.
function esc(s) {
  return String(s === null || s === undefined ? "" : s);
}

function relAge(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return t("age.now");
  const m = Math.round(s / 60);
  if (m < 90) return t("age.min", { n: m });
  const h = Math.round(m / 60);
  if (h < 36) return t("age.hours", { n: h });
  const d = Math.round(h / 24);
  return tn(d, "age.day");
}

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

/* ---------------------------------------------------------------- banners -- */

// The ONE thing that must be visible on every panel: config does NOT merge, so
// a global install can win skill resolution while this panel edits a project
// file nothing reads. Reported here, never fixed here — this UI never edits
// global config, by design.
// The update banner. It is a BUTTON, not a notice: the useful question is
// "what changed", and the answer is one click away rather than on GitHub.
async function renderUpdateBanner(host) {
  let v;
  try {
    v = await versionInfo();
  } catch (_) {
    return;
  }
  if (!v || !v.update_available) return;

  const b = el("button", "banner banner-update");
  b.type = "button";
  const inner = el("div");
  inner.append(el("strong", null, t("banner.update.title", { latest: v.latest, version: v.version })));
  inner.append(el("div", "note", t("banner.update.note")));
  b.append(el("span", "banner-badge", "NEW"), inner, el("span", "banner-more", t("banner.update.cta")));
  b.addEventListener("click", () => showChangelog(v));
  host.append(b);
}

// Fetched lazily — the modal is what needs the changelog, and paying for that
// request on every page load to fill a box nobody opened is waste.
async function showChangelog(v) {
  const body = el("div", "stack stack-sm");
  const slot = el("div", "stack stack-sm");
  slot.append(skeleton(4));
  body.append(slot);

  const close = modal({
    title: t("changelog.title", { version: v.latest }),
    body,
    actions: [
      { label: t("common.later"), onClick: (c) => c() },
      {
        label: t("changelog.goUpgrade"),
        cls: "btn-primary",
        onClick: (c) => {
          c();
          location.hash = "#/maintenance";
          // The spotlight is armed here and lands after the panel renders — a
          // highlight fired now would point at a node that does not exist yet.
          startUpgradeSpotlight();
        },
      },
    ],
  });

  try {
    const d = (await read("/api/changelog")).data;
    slot.replaceChildren();
    if (d.check_disabled) {
      slot.append(el("div", "note", t("changelog.disabled")));
    } else if (!d.fetched) {
      slot.append(el("div", "note", t("changelog.offline")));
      slot.append(el("div", "note", t("changelog.offlineNote")));
    } else if (!d.entries.length) {
      slot.append(el("div", "note", t("changelog.empty")));
    } else {
      for (const e of d.entries) {
        const sec = el("div", "cl-entry");
        const h = el("div", "cl-head");
        h.append(el("span", "cl-version", "v" + e.version));
        if (e.date) h.append(el("span", "cl-date", e.date));
        sec.append(h);
        if (e.title) sec.append(el("div", "cl-title", stripMd(e.title)));
        if (e.body) sec.append(el("div", "cl-body", reflowMd(stripMd(e.body))));
        slot.append(sec);
      }
      slot.append(el("div", "note", t("changelog.source", { src: d.source })));
    }
  } catch (e) {
    slot.replaceChildren(el("div", "note", t("changelog.loadFail", { err: e.message })));
  }
  return close;
}

// The changelog is markdown written for GitHub. Rather than render it — which
// would mean an HTML sanitiser for text fetched over the network — the few
// inline markers are stripped and it is shown as plain text. Nothing from the
// network is ever parsed as HTML by this panel.
function stripMd(s) {
  return String(s)
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").trim())
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

// REFLOW (v0.44.1). The changelog is this repo's own CHANGELOG.md, and that
// file is hard-wrapped at ~78 columns. `.cl-body` renders `pre-wrap`, so every one of
// those authoring line breaks survived into a 660px box: paragraphs came out as
// a ragged stack of short lines that ended nowhere near the right edge, which
// is exactly the "misaligned" the modal looked. The wrapping belongs to the
// box, not to the source file.
//
// Blank lines are paragraph breaks and are KEPT; a bullet keeps its own line
// (joining those would run a list into one sentence); everything else in a
// paragraph joins with a space and wraps to whatever width it is given.
function reflowMd(s) {
  return String(s)
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split("\n")
        .reduce((lines, raw) => {
          const line = raw.trim();
          if (!line) return lines;
          // A bullet opens a line; anything else continues the one before it,
          // which is also how a bullet that wrapped in the source rejoins.
          if (!lines.length || line.startsWith("• ")) lines.push(line);
          else lines[lines.length - 1] += " " + line;
          return lines;
        }, [])
        .join("\n")
    )
    .filter(Boolean)
    .join("\n\n");
}

async function renderBanners() {
  const host = $("#banners");
  host.replaceChildren();
  renderUpdateBanner(host);
  let doctor;
  try {
    doctor = (await read("/api/doctor")).data;
  } catch (_) {
    return;
  }
  if (!doctor) return;
  const g = doctor.global_install || {};
  if (g.present && g.shadows) {
    const finding = (doctor.findings || []).find((f) => f.id === "global-skew" || f.id === "global-retired-agents");
    const b = el("div", "banner");
    // Prose inside the banner flex row, not a panel container: its lines are
    // meant to read tight, so it is deliberately not a `stack`.
    const bannerBody = el("div");
    bannerBody.append(el("strong", null, t("banner.global.title")));
    bannerBody.append(el("div", null, t("banner.global.body")));
    // The finding's own text is the CLI speaking. It is shown verbatim in every
    // language — a doctor message names files and commands.
    if (finding) bannerBody.append(el("div", "note", finding.message));
    // The command that actually clears the finding, copyable. This panel is
    // project-scoped and never writes global config, so handing over the exact
    // line to paste is the whole of what it can do — and a wrong line here is
    // why the warning felt permanent.
    const fixCmd = (doctor.findings || []).map((f) => f.fix_command).find(Boolean);
    if (fixCmd) {
      const row = el("div", "banner-fix");
      row.append(el("code", "action-cmd", fixCmd));
      const cp = el("button", "btn btn-ghost btn-sm", t("common.copy"));
      cp.type = "button";
      cp.addEventListener("click", () => copy(fixCmd, t("common.copied")));
      row.append(cp);
      bannerBody.append(row);
    }
    bannerBody.append(el("div", "note", t("banner.global.check")));
    b.append(bannerBody);
    host.append(b);
  }
}

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
    slot.replaceChildren(empty(t("common.loadFail"), String(e.message)));
  }
  return slot;
}

/* ================================================================ OVERVIEW == */

/* WHERE A PROBLEM IS ACTUALLY FIXED (v0.43.6).
   `orc doctor` reports every problem in one list, and the panel used to send
   the whole list to Maintenance with a single "Open Maintenance" button. That
   is right for the install-footprint findings — version skew, orphans, missing
   files, unwired hooks — because `orc update` / `doctor --fix` really is where
   those are repaired. It was WRONG for the ones whose fix lives on another
   panel, and `diy-stale` was the one people hit: the flow is recompiled with
   `orc diy compile`, which is a button on FLOW. Sending them to Maintenance
   pointed at a page with no control for the thing it was complaining about.

   So the routing is a table keyed on the finding id the CLI already emits.
   `null` means there is nothing to press anywhere — a dangling trace pointer
   clears itself on the next run, and offering a button for it would be a lie. */
const FINDING_ROUTE = {
  "diy-stale": { panel: "flow", cta: "overview.item.diyStale.cta" },
  "trace-pointer-dangling": { panel: null },
  // v0.46.0. Correct by the rule, not by default: `export-stale` is cleared by
  // `orc export`, which IS a CLI write Maintenance can run — so Maintenance is
  // genuinely the panel that can clear it, not merely the fallback.
  "export-stale": { panel: "maintenance", cta: "overview.item.exportStale.cta" },
  "pact-broken": { panel: "pact", cta: "overview.item.pactBroken.cta" },
  "boundary-refuse": { panel: "boundary", cta: "overview.item.boundaryRefuse.cta" },
};
const DEFAULT_FINDING_ROUTE = { panel: "maintenance", cta: "overview.item.doctor.cta" };
const findingRoute = (id) => FINDING_ROUTE[id] || DEFAULT_FINDING_ROUTE;

PANELS.overview = function (host) {
  head(host, t("overview.title"), t("overview.sub"));
  section(
    host,
    () => read("/api/overview").then((r) => r.data),
    (d) => {
      const out = frag();
      const doctor = d.doctor || {};
      const w = d.wiki || {};
      const p = d.patterns || {};
      const waiting = d.waiting || [];
      const findings = doctor.findings || [];

      /* --- the tiles ------------------------------------------------------ */
      const stats = el("div", "grid grid-3");
      stats.append(
        statTile(
          t("overview.tile.install"),
          doctor.ok ? t("overview.tile.installHealthy") : tn(findings.length, "overview.tile.installIssues"),
          doctor.installed_version
            ? t("overview.tile.installNote", { payload: doctor.installed_version, cli: doctor.package_version })
            : "",
          doctor.ok ? "ok" : "warn",
          doctor.ok ? null : "maintenance"
        )
      );
      stats.append(
        statTile(
          t("overview.tile.wiki"),
          // TIER and STATE are CLI vocabulary (FRESH / AGING / STALE /
          // unregistered) — the words the docs and every other lane use. They
          // are shown as-is in both languages; only the sentence under them is
          // translated.
          w.state === "registered" ? w.tier || t("overview.tile.wikiUnknown") : String(w.state || "none").toUpperCase(),
          w.state === "registered"
            ? t("overview.tile.wikiNote", { docs: w.docs, scan: w.last_scan || "?" })
            : t("overview.tile.wikiNone"),
          w.tier === "FRESH" ? "ok" : w.tier === "AGING" ? "warn" : w.state === "none" ? "" : "bad",
          "knowledge"
        )
      );
      stats.append(
        statTile(
          t("overview.tile.waiting"),
          String(waiting.length),
          t("overview.tile.waitingNote", { n: d.runs_total || 0 }),
          waiting.length ? "warn" : "ok",
          "runs"
        )
      );
      const langs = (p.patterns || []).map((x) => x.lang);
      stats.append(
        statTile(
          t("overview.tile.patterns"),
          String(langs.length),
          langs.length ? langs.join(", ") : t("overview.tile.patternsNone"),
          langs.length ? "ok" : "",
          "knowledge"
        )
      );

      /* v0.46.0 — three chips repeating the CLI's OWN state words. A chip with
         nothing to say still renders its good state: an absent chip and a
         healthy one must never look the same. */
      const pc = d.pact;
      const bc = d.boundary;
      const wd = d.wiki_debt;
      stats.append(
        statTile(
          t("overview.tile.pact"),
          pc && pc.ok
            ? (pc.counts.BROKEN ? pc.counts.BROKEN + " BROKEN" : pc.counts.DRIFTED ? pc.counts.DRIFTED + " DRIFTED" : pc.counts.HOLDING + " HOLDING")
            : t("overview.tile.none"),
          pc && pc.ok ? t("overview.tile.pactNote", { n: pc.entries, u: pc.counts.UNCHECKABLE }) : t("overview.tile.pactNone"),
          pc && pc.ok ? (pc.counts.BROKEN ? "bad" : pc.counts.DRIFTED ? "warn" : "ok") : "",
          pc && pc.ok ? "pact" : null
        )
      );
      stats.append(
        statTile(
          t("overview.tile.boundary"),
          bc && bc.cards && bc.cards.length
            ? (bc.counts.REFUSE ? bc.counts.REFUSE + " REFUSE" : bc.counts.ESCALATE ? bc.counts.ESCALATE + " ESCALATE" : bc.counts.EXECUTE + " EXECUTE")
            : t("overview.tile.none"),
          bc && bc.cards && bc.cards.length ? t("overview.tile.boundaryNote", { n: bc.cards.length, stale: bc.stale }) : t("overview.tile.boundaryNone"),
          bc && bc.cards && bc.cards.length ? (bc.counts.REFUSE ? "bad" : bc.counts.ESCALATE ? "warn" : "ok") : "",
          bc && bc.cards && bc.cards.length ? "boundary" : null
        )
      );
      stats.append(
        statTile(
          t("overview.tile.debt"),
          wd && wd.ok && wd.pending ? String(wd.pending) : "0",
          wd && wd.ok && wd.pending
            ? t("overview.tile.debtNote", { tier: wd.tier, tok: kTokUi((wd.tokens || {}).input + (wd.tokens || {}).cache_write + (wd.tokens || {}).cache_read + (wd.tokens || {}).output) })
            : t("overview.tile.debtNone"),
          wd && wd.ok && wd.pending ? "warn" : "ok",
          "knowledge"
        )
      );

      // The version check crosses the network, so it must never hold up the
      // tiles beside it: the tile renders in its pending state and fills itself
      // in when the answer lands.
      const vt = statTile(t("overview.tile.version"), t("common.checking"), t("overview.tile.versionChecking"), "");
      vt.classList.add("stat-pending");
      stats.append(vt);
      versionInfo()
        .then((v) => {
          const s = versionState(v);
          vt.classList.remove("stat-pending");
          vt.replaceChildren();
          vt.append(el("div", "stat-label", t("overview.tile.version")));
          const val = el("div", "stat-value" + (s.kind ? " stat-" + s.kind : ""));
          val.append(document.createTextNode(v && v.version ? "v" + v.version : "?"), chip(s.label, s.kind));
          vt.append(val, el("div", "stat-note", s.note));
        })
        .catch(() => {
          vt.classList.remove("stat-pending");
          vt.replaceChildren(
            el("div", "stat-label", t("overview.tile.version")),
            el("div", "stat-value", "?"),
            el("div", "stat-note", t("overview.tile.versionFailed"))
          );
        });
      out.append(stats);

      /* --- worth doing ----------------------------------------------------
         One list, in severity order, of everything that wants a decision — and
         every row carries the panel where the fix actually is. This is the
         panel's answer to "what now", and it is the only place the wiki tier
         turns into advice instead of a colour. */
      out.append(attentionCard(d, findings));

      /* --- waiting runs --------------------------------------------------- */
      if (waiting.length) {
        const c = card(t("overview.waiting.title"));
        c.append(el("div", "note", t("overview.waiting.note")));
        const list = el("div", "run-list");
        for (const slug of waiting) {
          const b = el("button", "run-card");
          b.type = "button";
          b.append(chip("waiting", "warn"));
          const mid = el("div");
          mid.append(el("div", "run-slug", slug));
          mid.append(el("div", "run-where", t("overview.waiting.where")));
          b.append(mid, el("div", "run-age", ""));
          b.addEventListener("click", () => {
            location.hash = "#/runs?slug=" + encodeURIComponent(slug);
          });
          list.append(b);
        }
        c.append(list);
        out.append(c);
      }

      /* --- the raw doctor list -------------------------------------------
         Kept below the actionable card, because it is the EVIDENCE: the exact
         message the CLI printed, unedited and untranslated, so what you read
         here is what you would read in a terminal. */
      if (!doctor.ok && findings.length) {
        const c = card(t("overview.doctor.title"));
        for (const f of findings) {
          const row = el("div", "finding");
          row.append(chip(f.fixable ? t("overview.doctor.fixable") : t("overview.doctor.manual"), f.fixable ? "info" : "warn"));
          const detail = el("div");
          detail.append(el("div", null, f.message));
          const r = findingRoute(f.id);
          if (r.panel) {
            const go = el("button", "btn btn-ghost btn-sm", t(r.cta));
            go.type = "button";
            go.addEventListener("click", () => (location.hash = "#/" + r.panel));
            detail.append(go);
          } else {
            detail.append(el("div", "note", t("overview.attention.nothingToDo")));
          }
          row.append(detail);
          c.append(row);
        }
        out.append(c);
      }

      /* --- where things are ----------------------------------------------- */
      const paths = card(t("overview.paths.title"));
      const where = d.where || {};
      paths.append(
        kvList(
          [
            [t("overview.paths.project"), where.project_root],
            [t("overview.paths.config"), where.config],
            [t("overview.paths.skills"), where.skills],
            [t("overview.paths.runs"), where.run_dir],
            [t("overview.paths.traces"), where.log_dir],
          ],
          true
        )
      );
      out.append(paths);

      const know = card(t("overview.know.title"));
      know.append(
        kvList([
          [t("overview.know.patterns"), langs.join(", ") || t("common.none")],
          [t("overview.know.tags"), w.crosslink_tags === undefined ? "" : String(w.crosslink_tags)],
          // `state` and `reason` are the CLI's — shown verbatim.
          [t("overview.know.diy"), d.diy ? `${d.diy.state} — ${d.diy.reason}` : ""],
        ])
      );
      out.append(know);

      return out;
    }
  );
};

// The actionable list. Each entry is {kind, title, body, panel, cta} and knows
// where its fix lives — never a blanket "go to Maintenance".
function attentionCard(d, findings) {
  const w = d.wiki || {};
  const p = d.patterns || {};
  const items = [];

  // 1. Install findings, routed per id.
  for (const f of findings) {
    const r = findingRoute(f.id);
    if (f.id === "diy-stale") {
      items.push({
        kind: "warn",
        title: t("overview.item.diyStale.title"),
        body: t("overview.item.diyStale.body"),
        evidence: d.diy && d.diy.reason,
        panel: "flow",
        cta: t("overview.item.diyStale.cta"),
      });
    } else if (r.panel) {
      items.push({
        kind: f.fixable ? "warn" : "bad",
        // A doctor finding is already a sentence written for a human — using it
        // as the title beats paraphrasing it into something less exact.
        title: f.message,
        panel: r.panel,
        cta: t(r.cta),
      });
    }
  }

  // 2. The wiki. THIS is the recommendation the panel was missing: an AGING
  //    wiki is not an error, it is the moment a refresh is still cheap.
  if (!w.state || w.state === "none") {
    items.push({ kind: "info", title: t("overview.item.wikiNone.title"), body: t("overview.item.wikiNone.body"), panel: "knowledge", cta: t("overview.item.wikiNone.cta") });
  } else if (w.state !== "registered") {
    items.push({ kind: "warn", title: t("overview.item.wikiUnregistered.title"), body: t("overview.item.wikiUnregistered.body"), panel: "knowledge", cta: t("overview.item.wikiUnregistered.cta") });
  } else if (w.tier === "AGING") {
    items.push({
      kind: "warn",
      title: t("overview.item.wikiAging.title"),
      body: t("overview.item.wikiAging.body"),
      evidence: (w.reasons || [])[0],
      panel: "knowledge",
      cta: t("overview.item.wikiAging.cta"),
    });
  } else if (w.tier && w.tier !== "FRESH") {
    items.push({
      kind: "bad",
      title: t("overview.item.wikiStale.title"),
      body: t("overview.item.wikiStale.body"),
      evidence: (w.reasons || [])[0],
      panel: "knowledge",
      cta: t("overview.item.wikiStale.cta"),
    });
  }

  // 3. No cached pattern — not a fault, but the cheapest quality win there is.
  if (!(p.patterns || []).length)
    items.push({ kind: "info", title: t("overview.item.patterns.title"), body: t("overview.item.patterns.body"), panel: "knowledge", cta: t("overview.item.patterns.cta") });

  // 4. Runs left waiting.
  if ((d.waiting || []).length)
    items.push({
      kind: "warn",
      title: tn((d.waiting || []).length, "overview.item.waiting.title"),
      body: t("overview.item.waiting.body"),
      panel: "runs",
      cta: t("overview.item.waiting.cta"),
    });

  const c = card(t("overview.attention.title"), chip(String(items.length), items.length ? "warn" : "ok"));
  c.id = "attention-card";

  if (!items.length) {
    const ok = el("div", "all-clear");
    ok.append(el("div", "all-clear-mark", "✓"));
    const txt = el("div");
    txt.append(el("div", "all-clear-title", t("overview.attention.allClear")));
    txt.append(el("div", "note", t("overview.attention.allClearHint")));
    ok.append(txt);
    c.append(ok);
  }

  const list = el("div", "todo-list");
  const order = { bad: 0, warn: 1, info: 2 };
  items.sort((a, b) => (order[a.kind] || 3) - (order[b.kind] || 3));
  for (const it of items) {
    const row = el("button", "todo todo-" + it.kind);
    row.type = "button";
    row.append(el("span", "todo-mark"));
    const mid = el("div", "todo-body");
    mid.append(el("div", "todo-title", it.title));
    if (it.body) mid.append(el("div", "todo-text", it.body));
    // The CLI's own words for WHY, kept verbatim under our explanation.
    if (it.evidence) mid.append(el("div", "todo-evidence", it.evidence));
    row.append(mid, el("span", "todo-cta", it.cta));
    row.addEventListener("click", () => (location.hash = "#/" + it.panel));
    list.append(row);
  }
  if (items.length) c.append(list);

  // The update offer is appended asynchronously so a slow network check never
  // delays the list — it arrives as one more row when the answer does.
  versionInfo()
    .then((v) => {
      if (!v || !v.update_available) return;
      const row = el("button", "todo todo-info todo-late");
      row.type = "button";
      row.append(el("span", "todo-mark"));
      const mid = el("div", "todo-body");
      mid.append(el("div", "todo-title", t("overview.item.update.title", { latest: v.latest })));
      mid.append(el("div", "todo-text", t("overview.item.update.body", { version: v.version })));
      row.append(mid, el("span", "todo-cta", t("overview.item.update.cta")));
      row.addEventListener("click", () => (location.hash = "#/maintenance"));
      if (!list.isConnected) c.append(list);
      list.append(row);
      const count = c.querySelector(".card-head .chip");
      if (count) {
        count.textContent = String(list.children.length);
        count.className = "chip chip-warn";
      }
      const clear = c.querySelector(".all-clear");
      if (clear) clear.remove();
    })
    .catch(() => {});

  return c;
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

/* ================================================================ SETTINGS == */

// The tier IDS are the CLI's (`k.tier`); only their display name and blurb are
// ours to translate. A tier name alone does not say why a key lives there, and
// "advanced" reads as "do not touch" when it means "you need a reason".
//
// Written out as a literal map rather than `t("settings.tier." + tier)` so the
// keys stay GREPPABLE: a build of a string key from a fragment is a key no
// coverage check can see, and the check is the only thing standing between a
// renamed key and a raw dotted string on somebody's screen.
const TIER_LABEL_KEY = { common: "settings.tier.common", fable5: "settings.tier.fable5", advanced: "settings.tier.advanced" };
const TIER_DESC_KEY = { common: "settings.tierDesc.common", fable5: "settings.tierDesc.fable5", advanced: "settings.tierDesc.advanced" };
const TIER_LABEL = (tier) => (TIER_LABEL_KEY[tier] ? t(TIER_LABEL_KEY[tier]) : tier);
const TIER_DESC = (tier) => (TIER_DESC_KEY[tier] ? t(TIER_DESC_KEY[tier]) : "");

// The settings toolbar: find a key by name or description across every tier,
// narrow to just what you have changed, and open/close all sections. It filters
// what is ALREADY rendered — no refetch, so it stays instant at 36 keys.
function settingsToolbar(d, tiers) {
  const bar = el("div", "toolbar");

  const search = el("div", "search");
  const input = el("input", "text-input");
  input.type = "search";
  input.id = "settings-filter";
  input.placeholder = t("settings.filter");
  input.setAttribute("aria-label", t("settings.filterAria"));
  search.append(input);
  bar.append(search);

  const changedWrap = el("label", "toggle");
  const changed = el("input");
  changed.type = "checkbox";
  const overridden = d.keys.filter((k) => k.is_overridden).length;
  changedWrap.append(changed, document.createTextNode(" " + t("settings.changedOnly", { n: overridden })));
  changedWrap.title = overridden ? t("settings.changedTitle") : t("settings.changedNone");
  if (!overridden) changed.disabled = true;
  bar.append(changedWrap);

  const result = el("span", "toolbar-result");
  bar.append(result);

  const toggleAll = el("button", "btn btn-ghost btn-sm", t("settings.collapseAll"));
  toggleAll.type = "button";
  toggleAll.addEventListener("click", () => {
    const anyOpen = tiers.some((x) => !x.wrap.classList.contains("collapsed"));
    for (const x of tiers) {
      x.wrap.classList.toggle("collapsed", anyOpen);
      x.wrap.querySelector(".tier-head").setAttribute("aria-expanded", String(!anyOpen));
    }
    toggleAll.textContent = anyOpen ? t("settings.expandAll") : t("settings.collapseAll");
  });
  bar.append(toggleAll);

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    const onlyChanged = changed.checked;
    let shown = 0;
    for (const x of tiers) {
      let visible = 0;
      for (const row of x.rows.children) {
        const k = row.dataset.key || "";
        const desc = (row.querySelector(".setting-desc") || {}).textContent || "";
        const hit =
          (!q || k.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) &&
          (!onlyChanged || row.dataset.overridden === "1");
        row.classList.toggle("hidden", !hit);
        if (hit) visible++;
      }
      shown += visible;
      x.count.textContent = visible === x.total ? tn(x.total, "settings.keys") : t("settings.ofTotal", { n: visible, total: x.total });
      // A tier with no matches is hidden outright — an empty titled box is
      // noise between the ones that DID match.
      x.wrap.classList.toggle("hidden", visible === 0);
      // A filter that matches inside a closed section would look like no match
      // at all, so filtering forces the section open.
      if ((q || onlyChanged) && visible) {
        x.wrap.classList.remove("collapsed");
        x.wrap.querySelector(".tier-head").setAttribute("aria-expanded", "true");
      }
    }
    result.textContent = q || onlyChanged ? tn(shown, "settings.matches") : "";
    result.classList.toggle("toolbar-result-none", (q || onlyChanged) && shown === 0);
  };

  input.addEventListener("input", apply);
  changed.addEventListener("change", apply);
  // Esc clears rather than blurs: the filter is the thing in your way.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input.value) {
      e.stopPropagation();
      input.value = "";
      apply();
    }
  });
  return bar;
}

PANELS.settings = function (host) {
  const actions = el("div", "row-actions");
  const profBtn = el("button", "btn btn-sm", t("settings.profiles"));
  profBtn.type = "button";
  profBtn.addEventListener("click", showProfiles);
  const recBtn = el("button", "btn btn-sm", t("settings.recommend"));
  recBtn.type = "button";
  recBtn.addEventListener("click", showRecommend);
  actions.append(profBtn, recBtn);
  head(host, t("settings.title"), t("settings.sub"), actions);

  const body = el("div", "stack");
  host.append(body);
  renderSettings(body);
};

async function renderSettings(body) {
  body.replaceChildren(skeleton(8));
  let d;
  try {
    d = (await read("/api/config")).data;
  } catch (e) {
    body.replaceChildren(empty(t("settings.readFail"), String(e.message)));
    return;
  }

  const out = frag();

  // One edit set per render, so a re-render is also the discard: there is no
  // way for a staged value to outlive the data it was staged against.
  let bar = null;
  const edits = editSet(() => {
    if (bar) bar.paint();
    for (const row of body.querySelectorAll(".setting[data-key]")) {
      row.classList.toggle("staged", edits.map.has(row.dataset.key));
    }
  });

  const pathCard = card(t("settings.file.title"));
  pathCard.append(
    kvList([
      [t("settings.file.file"), d.config_path],
      [t("settings.file.state"), d.exists ? t("settings.file.exists") : t("settings.file.absent")],
    ])
  );
  // Permanently on, deliberately not a key — say so, or somebody hunts for the
  // switch that does not exist.
  pathCard.append(el("div", "note", t("settings.file.traceNote")));
  if ((d.legacy_keys || []).length)
    for (const l of d.legacy_keys)
      pathCard.append(el("div", "note", `\`${l.key}\` is still in the file — it was renamed to \`${l.renamed_to}\`, and is read as that.`));
  out.append(pathCard);

  // The ladder is a DIAGRAM, not an editor, and it re-morphs when opus5_only
  // flips — which is how the precedence rule gets taught rather than described.
  out.append(ladderCard(d.score_table));

  // 36 keys in three flat lists is a wall, and the answer to "where is the one
  // I want" was scrolling. Each tier is now its own collapsible card, and the
  // toolbar filters across ALL of them at once — so finding a key never depends
  // on knowing which tier somebody filed it under.
  const tiers = [];
  out.append(settingsToolbar(d, tiers));

  for (const tier of ["common", "fable5", "advanced"]) {
    const keys = d.keys.filter((k) => k.tier === tier);
    if (!keys.length) continue;

    const allInert = keys.every((k) => k.is_shadowed);
    const wrap = el("div", "card tier");
    wrap.dataset.tier = tier;

    const h = el("button", "tier-head");
    h.type = "button";
    h.setAttribute("aria-expanded", "true");
    h.append(el("span", "tier-caret", "▸"));
    h.append(el("h2", null, TIER_LABEL(tier)));
    const count = el("span", "tier-count", tn(keys.length, "settings.keys"));
    h.append(count);
    if (allInert) h.append(chip(t("settings.inert"), "warn"));

    const rows = el("div", "tier-rows");
    for (const k of keys) rows.append(settingRow(k, body, edits));

    // Collapse is height-animated rather than a display swap, so the rows below
    // it move with the section instead of teleporting.
    h.addEventListener("click", () => {
      const open = h.getAttribute("aria-expanded") === "true";
      h.setAttribute("aria-expanded", String(!open));
      wrap.classList.toggle("collapsed", open);
    });

    // The collapse animates `grid-template-rows: 1fr -> 0fr`, which needs a real
    // element child to collapse against — so the body is wrapped, not folded in
    // place. `height: auto` cannot be transitioned; this can.
    const inner = el("div", "tier-body-inner");
    inner.append(el("div", "tier-desc", TIER_DESC(tier)), rows);
    const bodyWrap = el("div", "tier-body");
    bodyWrap.append(inner);

    wrap.append(h, bodyWrap);
    tiers.push({ tier, wrap, rows, count, total: keys.length });
    out.append(wrap);
  }

  if ((d.hand_edited || []).length) {
    const c = card(t("settings.handEdited.title"));
    c.append(el("div", "note", t("settings.handEdited.note")));
    for (const k of d.hand_edited) {
      const row = el("div", "setting" + (k.is_shadowed ? " shadowed" : ""));
      const left = el("div");
      const name = el("div", "setting-name");
      name.append(document.createTextNode(k.key));
      if (k.is_shadowed) {
        const lock = el("span", "lock");
        lock.append(document.createTextNode("🔒 " + t("settings.shadowed")));
        name.append(lock);
      }
      left.append(name);
      left.append(el("div", "setting-desc", t("settings.handEdited.readonly")));
      if (k.shadow_reason) left.append(el("div", "shadow-why", k.shadow_reason));
      const right = el("div", "setting-control");
      right.append(el("div", "readonly-value", String(k.value)));
      row.append(left, right);
      c.append(row);
    }
    out.append(c);
  }

  // Last block on the panel, and it sticks to the bottom of the viewport once
  // something is pending: with 36 keys across three tiers, an Apply you have to
  // go looking for is an Apply that gets forgotten.
  bar = settingsEditBar(edits, body);
  out.append(bar);

  body.replaceChildren(out);
}

function ladderCard(table) {
  const c = card(t("settings.ladder.title"));
  c.id = "ladder-card"; // the FLIP morph finds it by id, never by a :has() query
  const active = table.active;
  c.append(
    el(
      "div",
      "note",
      active === "opus5_only"
        ? t("settings.ladder.opus5")
        : active === "rubric_bands_override"
        ? t("settings.ladder.override")
        : t("settings.ladder.default")
    )
  );
  const ladder = el("div", "ladder");
  ladder.id = "ladder";
  const rows = active === "opus5_only" ? table.opus5_only : table.default;
  for (const r of rows) {
    const rung = el("div", "rung");
    rung.dataset.agent = r.agent;
    rung.append(el("span", "rung-band", `[${r.from},${r.to}${r.inclusive_to ? "]" : ")"}`));
    const right = el("div");
    const bar = el("div", "rung-bar");
    bar.style.width = Math.max(6, ((r.to - r.from) / 100) * 100) + "%";
    right.append(bar, el("div", "rung-agent", r.agent));
    rung.append(right);
    ladder.append(rung);
  }
  c.append(ladder);
  c.append(el("div", "ladder-note", t("settings.ladder.note")));
  return c;
}

// FLIP: measure the old rungs, swap in the new table, then animate each rung
// from where it used to be. The morph is what makes the precedence rule land.
function morphLadder(oldCard, newCard) {
  const before = new Map();
  for (const r of oldCard.querySelectorAll(".rung")) before.set(r.dataset.agent, r.getBoundingClientRect());
  oldCard.replaceWith(newCard);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const r of newCard.querySelectorAll(".rung")) {
    const from = before.get(r.dataset.agent);
    if (!from) {
      r.animate([{ opacity: 0, transform: "scaleY(.4)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.7,.3,1)" });
      continue;
    }
    const to = r.getBoundingClientRect();
    const dy = from.top - to.top;
    if (!dy) continue;
    r.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.7,.3,1)" });
  }
}

/* ============================================================ staged edits == */
//
// WRITES ARE BATCHED (v0.44.1). Every control used to commit on the spot: one
// click, one `orc config set`, one full re-render of the panel. Changing four
// keys meant four subprocesses and four re-renders, and each one scrolled the
// list out from under you — so a routine "set these five things" was a fight.
//
// Nothing is written until Apply now. Edits accumulate here, the affected rows
// mark themselves, and an edit bar at the bottom says how many are pending.
// The CLI is still the only writer and still the only validator; what changed
// is WHEN it is called, never by whom.
//
// An entry is `{kind: "set", value}` or `{kind: "reset"}` — a per-key reset is
// `orc config reset <key>` (it REMOVES the key from the file), which is not the
// same write as setting it to its default value, so it cannot be flattened into
// one.
function editSet(onChange) {
  const map = new Map();
  const api = {
    map,
    get size() {
      return map.size;
    },
    // Staging a value back to what it already was CLEARS the edit rather than
    // recording a no-op — otherwise "cancel" and "set it back by hand" would
    // leave the bar claiming an unsaved change that would write nothing.
    set(key, value, original) {
      if (String(value) === String(original)) map.delete(key);
      else map.set(key, { kind: "set", value: String(value), original: String(original) });
      onChange(api);
    },
    reset(key) {
      map.set(key, { kind: "reset" });
      onChange(api);
    },
    drop(key) {
      map.delete(key);
      onChange(api);
    },
    clear() {
      map.clear();
      onChange(api);
    },
    entries() {
      return [...map.entries()];
    },
  };
  return api;
}

// The bar. Apply is disabled with nothing pending; Reset is always offered
// (it is a write in its own right, not an undo); **Cancel appears only when
// there is something to cancel** — a permanently visible Cancel next to a
// disabled Apply reads as though the panel is broken.
function editBar(edits, { onApply, onReset, onCancel, resetLabel }) {
  const bar = el("div", "edit-bar");
  const summary = el("div", "edit-summary");
  const actions = el("div", "edit-actions");

  const apply = el("button", "btn btn-sm btn-primary", t("edits.apply"));
  apply.type = "button";
  apply.addEventListener("click", () => onApply(apply));

  const reset = el("button", "btn btn-sm btn-ghost", resetLabel || t("edits.reset"));
  reset.type = "button";
  reset.addEventListener("click", onReset);

  const cancel = el("button", "btn btn-sm btn-ghost", t("edits.cancel"));
  cancel.type = "button";
  cancel.addEventListener("click", onCancel);

  bar.paint = () => {
    const n = edits.size;
    bar.classList.toggle("edit-bar-dirty", n > 0);
    apply.disabled = n === 0;
    apply.textContent = n ? t("edits.applyN", { n }) : t("edits.apply");
    // The pending list is named, never counted: "3 changes" is not consent for
    // three writes you can no longer see.
    summary.replaceChildren();
    if (!n) {
      summary.append(el("span", "note", t("edits.none")));
    } else {
      summary.append(el("span", "note", t("edits.pending")));
      const list = el("div", "edit-list");
      for (const [key, e] of edits.entries()) {
        const item = el("span", "edit-chip");
        // Key names and values are CLI data — never translated.
        item.append(el("span", "edit-key", key));
        item.append(document.createTextNode(e.kind === "reset" ? " → " + t("edits.toDefault") : " → " + e.value));
        list.append(item);
      }
      summary.append(list);
    }
    actions.replaceChildren();
    actions.append(apply, reset);
    if (n) actions.append(cancel);
  };

  bar.append(summary, actions);
  bar.paint();
  return bar;
}

// Apply runs the staged writes ONE AT A TIME, in the order they were staged —
// the same sequence a terminal user would type, which matters because settings
// can shadow each other. A failure does not abort the rest: the remaining
// writes are independent, and stopping halfway would leave a state nobody
// chose. Every failure is reported by key.
async function applyEdits(edits, routes, button) {
  const list = edits.entries();
  if (!list.length) return { ok: true, failed: [] };
  const label = button && button.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = t("edits.applying");
  }
  const failed = [];
  for (const [key, e] of list) {
    try {
      const r = e.kind === "reset" ? await post(routes.reset, { key }) : await post(routes.set, { key, value: e.value });
      if (!r.ok) failed.push(`${key}: ${(r.output || r.command || "").trim().split("\n")[0]}`);
    } catch (err) {
      failed.push(`${key}: ${err.message}`);
    }
  }
  if (button) {
    button.disabled = false;
    if (label) button.textContent = label;
  }
  if (failed.length) toast(t("edits.someFailed", { n: failed.length }), "bad", failed.join("\n"));
  else toast(t("edits.applied", { n: list.length }), "ok");
  return { ok: !failed.length, failed };
}

function settingRow(k, panelBody, edits) {
  const row = el("div", "setting" + (k.is_shadowed ? " shadowed" : ""));
  row.dataset.key = k.key;
  // Read by the toolbar's "changed only" filter. It is on the row rather than
  // recomputed from the control, because the control's shape differs per kind.
  row.dataset.overridden = k.is_overridden ? "1" : "0";

  const left = el("div");
  const name = el("div", "setting-name");
  name.append(document.createTextNode(k.key));
  if (k.is_overridden) name.append(el("span", "dot"));
  if (k.is_shadowed) {
    const lock = el("span", "lock");
    lock.append(document.createTextNode("🔒 " + t("settings.shadowed")));
    name.append(lock);
  }
  left.append(name);
  // `k.desc` and `k.shadow_reason` are the CLI's registry text — never
  // translated. They name keys, values and precedence rules by their real ids.
  left.append(el("div", "setting-desc", k.desc));
  if (k.shadow_reason) left.append(el("div", "shadow-why", k.shadow_reason));

  const right = el("div", "setting-control");
  right.append(controlFor(k, edits));
  if (k.is_overridden) {
    const reset = el("button", "btn btn-ghost btn-sm", t("setting.resetTo", { value: String(k.default) }));
    reset.type = "button";
    reset.addEventListener("click", () => edits.reset(k.key));
    right.append(reset);
  }

  row.append(left, right);
  return row;
}

// The control follows the VALIDATOR, not a hand-kept table: enum → segmented,
// int/range → stepper with the options list as presets, path/repo/model → a
// text input whose validation is the CLI's own exit code.
//
// Since v0.44.1 a control STAGES its value instead of writing it. Each one also
// repaints its own selected state from the staged value, because nothing
// re-renders until Apply — a segmented control that does not follow your click
// would look broken, and a click that neither writes nor moves is worse than no
// control at all.
function controlFor(k, edits) {
  const c = k.control || { kind: "text" };
  const original = String(k.value);
  const stage = (value) => edits.set(k.key, String(value), original);

  if (c.kind === "enum") {
    const choices = c.choices || k.options || [];
    const seg = el("div", "seg");
    const paint = (v) => {
      for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.value === String(v)));
    };
    for (const opt of choices) {
      const b = el("button", null, String(opt));
      b.type = "button";
      b.dataset.value = String(opt);
      b.addEventListener("click", () => {
        stage(String(opt));
        paint(String(opt));
      });
      seg.append(b);
    }
    paint(original);
    return seg;
  }

  if (c.kind === "int" || c.kind === "range") {
    const wrap = el("div", "stepper");
    const input = el("input");
    input.type = "number";
    input.value = original;
    if (c.min !== null && c.min !== undefined) input.min = String(c.min);
    if (c.max !== null && c.max !== undefined) input.max = String(c.max);
    // No `set` button here any more: the edit bar's Apply is the one commit
    // point, so a second button beside every number would be two ideas of what
    // "save" means.
    input.addEventListener("input", () => stage(input.value));
    wrap.append(input);
    const presets = (k.options || []).filter((o) => String(o) !== original);
    if (presets.length) {
      const seg = el("div", "seg");
      for (const p of presets.slice(0, 5)) {
        const b = el("button", null, String(p));
        b.type = "button";
        b.addEventListener("click", () => {
          input.value = String(p);
          stage(String(p));
        });
        seg.append(b);
      }
      const box = el("div");
      box.append(wrap, seg);
      box.className = "setting-control";
      return box;
    }
    return wrap;
  }

  if (c.kind === "subset") {
    const chosen = new Set(
      original
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const seg = el("div", "seg");
    for (const opt of c.choices || []) {
      const b = el("button", null, String(opt));
      b.type = "button";
      b.setAttribute("aria-pressed", String(chosen.has(opt)));
      b.addEventListener("click", () => {
        chosen.has(opt) ? chosen.delete(opt) : chosen.add(opt);
        b.setAttribute("aria-pressed", String(chosen.has(opt)));
        stage([...chosen].join(",") || "");
      });
      seg.append(b);
    }
    return seg;
  }

  // path / repo / free text — validation comes from the CLI's exit code, which
  // means the rules can never drift from the ones a terminal user gets.
  const wrap = el("div");
  wrap.className = "setting-control";
  const input = el("input", "text-input");
  input.value = original;
  input.addEventListener("input", () => stage(input.value));
  wrap.append(input);
  return wrap;
}

// The Settings edit bar. Reset is `orc config reset` with NO key — the CLI's
// own "put every key back to its default", not a loop of per-key writes. It is
// a real write, so it is confirmed and it discards anything staged first: a
// reset that silently kept four pending edits queued behind it would apply them
// straight back over the defaults.
function settingsEditBar(edits, panelBody) {
  const bar = editBar(edits, {
    resetLabel: t("edits.resetAll"),
    onApply: async (btn) => {
      await applyEdits(edits, { set: "/api/config/set", reset: "/api/config/reset" }, btn);
      await rerenderSettings(panelBody);
    },
    onReset: () => {
      modal({
        title: t("edits.resetAllTitle"),
        body: (() => {
          const box = el("div", "stack stack-sm");
          box.append(el("div", null, t("edits.resetAllBody")));
          box.append(el("div", "action-cmd", "orc config reset"));
          return box;
        })(),
        actions: [
          { label: t("common.cancel"), onClick: (c) => c() },
          {
            label: t("edits.resetAllApply"),
            cls: "btn-danger",
            onClick: async (close) => {
              close();
              edits.clear();
              const r = await post("/api/config/reset", {});
              toast(r.command, r.ok ? "ok" : "bad", r.output);
              await rerenderSettings(panelBody);
            },
          },
        ],
      });
    },
    onCancel: () => rerenderSettings(panelBody),
  });
  return bar;
}

// A re-render must not lose the ladder morph, so the ladder is swapped through
// FLIP while everything else is replaced outright.
async function rerenderSettings(panelBody) {
  const old = panelBody.querySelector("#ladder-card");
  const snapshot = old ? old.cloneNode(true) : null;
  await renderSettings(panelBody);
  const fresh = panelBody.querySelector("#ladder-card");
  // Only morph when the table ACTUALLY changed — i.e. opus5_only was flipped.
  // Any other setting re-renders without a distracting animation.
  if (snapshot && fresh && snapshot.textContent !== fresh.textContent) {
    // Put the old one back for a beat so FLIP has real geometry to measure.
    fresh.parentNode.replaceChild(snapshot, fresh);
    morphLadder(snapshot, fresh);
  }
}

async function showProfiles() {
  const d = (await read("/api/config/profiles")).data;
  const body = el("div", "stack stack-sm");
  body.append(el("div", "note", t("profiles.note")));
  for (const p of d.profiles) {
    const c = el("div", "action");
    const left = el("div");
    // Profile name and description come from the CLI's registry — untranslated.
    left.append(el("div", "setting-name", p.name));
    left.append(el("div", "setting-desc", p.desc));
    if (p.changes.length) {
      const list = el("div", "note");
      list.textContent = t("profiles.wouldChange", {
        list: p.changes.map((c2) => `${c2.key} ${c2.from} → ${c2.to}`).join(", "),
      });
      left.append(list);
    } else left.append(el("div", "note", t("profiles.noChange")));
    const apply = el("button", "btn btn-sm btn-allow-busy" + (p.changes.length ? " btn-primary" : ""), t("profiles.apply"));
    apply.type = "button";
    apply.disabled = !p.changes.length;
    apply.addEventListener("click", async () => {
      const r = await post("/api/config/profile", { name: p.name });
      toast(r.command, r.ok ? "ok" : "bad", r.output);
      close();
      route();
    });
    c.append(left, apply);
    body.append(c);
  }
  const close = modal({ title: t("profiles.title"), body, actions: [{ label: t("common.close"), onClick: (c) => c() }] });
}

async function showRecommend() {
  const d = (await read("/api/config/recommend")).data;
  const body = el("div", "stack stack-sm");
  body.append(el("div", "note", t("recommend.note")));
  const list = el("ul");
  for (const r of d.reasons) {
    const li = el("li", "note", "• " + r);
    list.append(li);
  }
  body.append(list);
  const pick = el("div", "action");
  const left = el("div");
  left.append(el("div", "setting-name", d.recommended));
  left.append(el("div", "setting-desc", d.desc));
  const apply = el("button", "btn btn-sm btn-primary btn-allow-busy", t("recommend.applyIt", { name: d.recommended }));
  apply.type = "button";
  apply.addEventListener("click", async () => {
    const r = await post("/api/config/profile", { name: d.recommended });
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    close();
    route();
  });
  pick.append(left, apply);
  body.append(pick);
  const close = modal({ title: t("recommend.title"), body, actions: [{ label: t("common.close"), onClick: (c) => c() }] });
}

/* ==================================================================== RUNS == */

/* THE LIST IS THE DETAIL VIEW (v0.43.6).
   This panel used to be a list with a detail CARD underneath it: clicking the
   fourth run rendered its checkpoint below run forty. On a repo with any
   history that means scrolling past the entire list to read what you just
   clicked, and then scrolling back up to click the next one — the list grows,
   so the problem grows with it, which is the shape of a design that does not
   survive its own success.

   Now every row EXPANDS IN PLACE. The detail is a child of the row, animated
   open with the same `grid-template-rows: 0fr -> 1fr` fold the settings tiers
   use, so what you clicked stays exactly where your eye already is. One row is
   open at a time — an accordion, not a set of toggles — because two open runs
   re-create the scrolling problem in miniature. Detail is fetched on FIRST open
   and then kept, so re-opening a row is instant and costs nothing. */

const RUN_STATUS_KIND = { waiting: "warn", done: "ok" };
// The aftermath grade chip. The LABELS are ours to shorten; the GRADE ids are
// the CLI's and are what the kind map is keyed on.
const AFTER_KIND = { HELD: "ok", CHURN: "warn", REVERTED: "bad", TOO_RECENT: "", SHALLOW: "" };
const AFTER_LABEL = { HELD: "✓ HELD", CHURN: "~ CHURN", REVERTED: "✗ REVERTED", TOO_RECENT: "– too recent", SHALLOW: "– no commits" };
const afterGrade = (after, slug) => ((after && after.runs) || []).find((r) => r.slug === slug) || null;

PANELS.runs = function (host) {
  head(host, t("runs.title"), t("runs.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderRuns(body);
};

async function renderRuns(body) {
  body.replaceChildren(skeleton(6));
  let d;
  let after = null;
  try {
    d = (await read("/api/runs")).data;
    // One extra read, in parallel with nothing — the grade chip is per row and
    // fetching it per row would be N requests for a list that is already loaded.
    after = (await read("/api/aftermath").catch(() => ({ data: null }))).data;
  } catch (e) {
    body.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  if (!d.total) {
    body.replaceChildren(empty(t("runs.empty"), d.run_dir));
    return;
  }

  const wanted = new URLSearchParams(location.hash.split("?")[1] || "").get("slug");
  const out = frag();

  // --- toolbar: status segments + a text filter, both client-side over an
  //     already-fetched list, so filtering never costs a request.
  const bar = el("div", "toolbar");
  const search = el("div", "search");
  const input = el("input", "text-input");
  input.type = "search";
  input.placeholder = t("runs.search");
  search.append(input);
  bar.append(search);

  let statusFilter = "all";
  const seg = el("div", "seg");
  const segs = [
    ["all", t("runs.filterAll")],
    ["waiting", t("runs.filterWaiting")],
    ["done", t("runs.filterDone")],
    ["other", t("runs.filterOther")],
  ];
  for (const [val, label] of segs) {
    const b = el("button", null, label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(val === statusFilter));
    b.addEventListener("click", () => {
      statusFilter = val;
      for (const other of seg.children) other.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-pressed", "true");
      apply();
    });
    seg.append(b);
  }
  bar.append(seg);
  const count = el("span", "toolbar-result");
  bar.append(count);
  const closeAll = el("button", "btn btn-ghost btn-sm", t("runs.collapseAll"));
  closeAll.type = "button";
  closeAll.addEventListener("click", () => collapseAll());
  bar.append(closeAll);
  out.append(bar);

  const list = el("div", "run-list");
  const rows = [];

  const collapseAll = (except) => {
    for (const r of rows) if (r.row !== except) setOpen(r, false);
  };

  function setOpen(entry, open) {
    entry.row.classList.toggle("open", open);
    entry.head.setAttribute("aria-expanded", String(open));
    if (open && !entry.loaded) {
      entry.loaded = true;
      loadRunDetail(entry.pane, entry.slug, entry.grade);
    }
  }

  for (const r of d.runs) {
    const row = el("div", "run-row");
    row.dataset.slug = r.slug;
    row.dataset.status = r.status;

    const headBtn = el("button", "run-card");
    headBtn.type = "button";
    headBtn.setAttribute("aria-expanded", "false");
    headBtn.append(el("span", "run-caret", "▸"));
    // Status is the CLI's vocabulary (`waiting` / `done` / `empty`) — the same
    // word `orc run list` prints. Shown as-is in every language.
    headBtn.append(chip(r.status, RUN_STATUS_KIND[r.status] || ""));
    // The aftermath grade (v0.46.0). The CLI's own word, and `TOO_RECENT` KEEPS
    // ITS SLOT — it is an answer ("younger than 7 days"), not a gap, and hiding
    // it would make a fresh run and an ungraded one look identical.
    const grade = afterGrade(after, r.slug);
    if (grade) {
      const gc = chip(AFTER_LABEL[grade.grade] || grade.grade, AFTER_KIND[grade.grade] || "");
      gc.title = grade.note || "";
      headBtn.append(gc);
    }
    const mid = el("div", "run-mid");
    mid.append(el("div", "run-slug", r.slug));
    const where = [r.lane, r.phase && "phase " + r.phase, r.wave].filter(Boolean).join(" · ");
    mid.append(el("div", "run-where", where || "—"));
    headBtn.append(mid, el("div", "run-age", relAge(r.updated_ms)));

    // The fold. `.run-body-inner` is the real element the 1fr→0fr grid
    // collapses against; without it there is nothing to animate to zero.
    const pane = el("div", "run-pane stack stack-sm");
    pane.append(skeleton(4));
    const inner = el("div", "run-body-inner");
    inner.append(pane);
    const fold = el("div", "run-body");
    fold.append(inner);

    const entry = { row, head: headBtn, pane, slug: r.slug, grade, loaded: false };
    rows.push(entry);

    headBtn.addEventListener("click", () => {
      const isOpen = row.classList.contains("open");
      collapseAll(row);
      setOpen(entry, !isOpen);
      // A row that opens near the bottom of the viewport would otherwise reveal
      // its content off-screen — the one scroll this panel ever performs.
      if (!isOpen)
        requestAnimationFrame(() => {
          const rect = row.getBoundingClientRect();
          if (rect.top < 0 || rect.top > window.innerHeight * 0.6)
            row.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        });
    });

    row.append(headBtn, fold);
    list.append(row);
  }
  out.append(list);

  const none = empty(t("runs.noMatch"));
  none.classList.add("hidden");
  out.append(none);

  function apply() {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    for (const entry of rows) {
      const st = entry.row.dataset.status;
      const statusHit =
        statusFilter === "all" || (statusFilter === "other" ? st !== "waiting" && st !== "done" : st === statusFilter);
      const textHit = !q || entry.row.textContent.toLowerCase().includes(q);
      const hit = statusHit && textHit;
      entry.row.classList.toggle("hidden", !hit);
      // A filtered-out row must not stay open behind the filter — reopening the
      // filter would reveal a run you no longer have in view.
      if (!hit) setOpen(entry, false);
      if (hit) shown++;
    }
    count.textContent = t("runs.count", { shown, total: d.total });
    none.classList.toggle("hidden", shown > 0);
  }
  input.addEventListener("input", apply);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input.value) {
      e.stopPropagation();
      input.value = "";
      apply();
    }
  });

  body.replaceChildren(out);
  apply();

  // Deep link from Overview: open that run, and only that run.
  if (wanted) {
    const entry = rows.find((r) => r.slug === wanted);
    if (entry) {
      setOpen(entry, true);
      requestAnimationFrame(() => entry.row.scrollIntoView({ block: "center" }));
    }
  }
}

// Fills one expanded row. Identical content to the old detail card — the change
// is WHERE it renders, not what it says.
// The aftermath detail goes INSIDE the expanded row — there is no detail box
// below the list and no `showRun`. One row open at a time, fetched on first open.
function afterBox(grade) {
  if (!grade) return null;
  const box = el("div", "after-box");
  box.append(el("div", "after-head", t("runs.after.signals")));
  for (const sig of grade.signals || []) {
    const line = el("div", "after-row");
    line.append(chip(sig.kind, sig.strength >= 3 ? "bad" : "warn"));
    line.append(el("span", null, sig.detail));
    box.append(line);
  }
  // Churn is a SIGNAL, not a verdict — the caveat always travels with the
  // evidence, including on HELD ("nothing came back" is not "it worked").
  if (grade.note) box.append(el("div", "note", grade.note));
  return box;
}

function loadRunDetail(pane, slug, grade) {
  Promise.all([
    read("/api/run?slug=" + encodeURIComponent(slug)),
    read("/api/mock?slug=" + encodeURIComponent(slug)).catch(() => ({ data: null })),
  ])
    .then(([runRes, mockRes]) => {
      const d = runRes.data;
      const mock = mockRes && mockRes.data && mockRes.data.found ? mockRes.data : null;
      const out = frag();
      const ab = afterBox(grade);
      if (ab) out.append(ab);

      out.append(
        kvList([
          [t("runs.field.slug"), d.slug],
          [t("runs.field.status"), d.status],
          [t("runs.field.lane"), d.stands && d.stands.lane],
          [t("runs.field.phase"), d.stands && d.stands.phase],
          [t("runs.field.wave"), d.stands && d.stands.wave],
          [t("runs.field.folder"), d.dir],
          [t("runs.field.updated"), relAge(d.updated_ms)],
        ])
      );

      const tabs = el("div", "tabs");
      const view = el("div", "tab-pane");
      const views = [];
      const addTab = (label, render) => views.push({ label, render });

      if (d.resume)
        addTab(t("runs.tab.resume"), () => {
          const box = el("div", "stack stack-sm");
          box.append(el("div", "note", t("runs.resume.note")));
          const actions = el("div", "row-actions");
          const cp = el("button", "btn btn-sm", t("runs.resume.copy"));
          cp.type = "button";
          cp.addEventListener("click", () => copy(d.resume, t("runs.resume.copied")));
          actions.append(cp);
          box.append(actions, el("pre", "block wrap", d.resume));
          return box;
        });
      if (d.state_of_play) addTab(t("runs.tab.state"), () => el("pre", "block wrap", d.state_of_play));
      if (d.checkpoint)
        addTab(t("runs.tab.checkpoint"), () => {
          const box = el("div", "stack stack-sm");
          // These four are checkpoint.json's own field names — file keys, not
          // labels, so they stay exactly as the file spells them.
          box.append(
            kvList([
              ["phase", d.checkpoint.phase],
              ["wave", d.checkpoint.wave],
              ["updated_at", d.checkpoint.updated_at],
              ["trace_path", d.checkpoint.trace_path],
            ])
          );
          box.append(el("pre", "block", JSON.stringify(d.checkpoint, null, 2)));
          return box;
        });
      if (d.trace)
        addTab(t("runs.tab.trace"), () => {
          const box = el("div", "stack stack-sm");
          box.append(el("div", "note", t("runs.trace.note")));
          box.append(el("pre", "block", d.trace));
          return box;
        });
      // Honesty rule: a run with no mock example shows "Not generated for this
      // run", never an empty state that implies one is missing. And never a
      // Run button.
      addTab(t("runs.tab.mock"), () => {
        if (!mock) return empty(t("runs.mock.none"), t("runs.mock.noneHint"));
        const box = el("div", "stack stack-sm");
        box.append(
          kvList([
            [t("runs.field.folder"), mock.dir],
            [t("runs.field.files"), String(mock.files.length)],
            [t("runs.field.written"), relAge(mock.mtime_ms)],
          ])
        );
        box.append(el("div", "note", t("runs.mock.readonly")));
        if (mock.readme) box.append(el("pre", "block wrap", mock.readme));
        const fl = el("div", "file-list");
        for (const f of mock.files) fl.append(el("div", null, f.path));
        box.append(fl);
        return box;
      });
      if (!views.length)
        addTab(t("runs.tab.files"), () => el("pre", "block", (d.files || []).join("\n") || t("runs.emptyFolder")));

      const show = (v, btn) => {
        for (const other of tabs.children) other.setAttribute("aria-selected", "false");
        btn.setAttribute("aria-selected", "true");
        view.replaceChildren(v.render());
        // Re-trigger the tab-swap fade; a replaced child alone shows no change.
        view.style.animation = "none";
        void view.offsetHeight;
        view.style.animation = "";
      };
      views.forEach((v, i) => {
        const b = el("button", null, v.label);
        b.type = "button";
        b.setAttribute("aria-selected", String(i === 0));
        b.addEventListener("click", () => show(v, b));
        tabs.append(b);
      });
      view.replaceChildren(views[0].render());
      out.append(tabs, view);
      pane.replaceChildren(out);
    })
    .catch((e) => pane.replaceChildren(empty(t("runs.openFail"), String(e.message))));
}

/* =============================================================== KNOWLEDGE == */

PANELS.knowledge = function (host) {
  head(host, t("knowledge.title"), t("knowledge.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderKnowledge(body);
};

async function renderKnowledge(body) {
  body.replaceChildren(skeleton(6));
  const [wikiRes, impactRes, patRes, gotRes, planRes, debtRes, usageRes] = await Promise.all([
    read("/api/wiki").catch(() => ({ data: null })),
    read("/api/wiki/impact").catch(() => ({ data: null })),
    read("/api/patterns").catch(() => ({ data: null })),
    read("/api/gotchas").catch(() => ({ data: null })),
    read("/api/wiki/plan").catch(() => ({ data: null })),
    read("/api/wiki/debt").catch(() => ({ data: null })),
    read("/api/wiki/usage").catch(() => ({ data: null })),
  ]);
  const out = frag();
  out.append(wikiPlanCard(planRes.data, debtRes.data, body));
  if (usageRes.data && usageRes.data.rows) out.append(wikiUsageCard(usageRes.data, body));

  // --- wiki
  const w = wikiRes.data || {};
  const wc = card(t("knowledge.wiki"), wikiActions(body, w));
  if (!w.state || w.state === "none") {
    wc.append(empty(t("knowledge.wiki.none"), t("knowledge.wiki.noneHint")));
  } else if (w.state !== "registered") {
    wc.append(el("div", "note", t("knowledge.wiki.unregistered", { state: String(w.state).toUpperCase() })));
    wc.append(el("div", "note", t("knowledge.wiki.syncHint")));
  } else {
    const tierChip = chip(w.tier || t("overview.tile.wikiUnknown"), w.tier === "FRESH" ? "ok" : w.tier === "AGING" ? "warn" : "bad", w.tier === "STALE");
    const headRow = el("div", "row-actions");
    headRow.append(tierChip);
    wc.append(headRow);
    wc.append(
      kvList([
        [t("knowledge.field.docs"), String(w.docs)],
        [t("knowledge.field.lastScan"), w.last_scan],
        [
          t("knowledge.field.distance"),
          w.distance === null ? t("knowledge.field.unmeasurable") : t("knowledge.field.distanceValue", { n: w.distance }),
        ],
        [t("knowledge.field.anchor"), w.anchor ? String(w.anchor).slice(0, 8) : ""],
        // `wiki_fresh_max` / `wiki_aging_max` are config keys — the numbers are
        // shown, the key names are not paraphrased.
        [t("knowledge.field.edges"), w.edges ? `fresh < ${w.edges.freshMax}c · aging <= ${w.edges.agingMax}c` : ""],
        [t("knowledge.field.tags"), w.crosslink_tags === undefined ? "" : String(w.crosslink_tags)],
        [t("knowledge.field.blind"), w.blind ? String(w.blind) : "0"],
      ])
    );
    // The reason text is the CLI's own sentence about a real doc — verbatim.
    for (const r of w.reasons || []) wc.append(el("div", "note", t("knowledge.wiki.why", { reason: r })));
    wc.append(el("div", "note", t("knowledge.wiki.freshNote")));
  }
  out.append(wc);

  // --- impact
  const imp = impactRes.data;
  if (imp && imp.ok) {
    const c = card(t("knowledge.impact.title"));
    const rec = el("div", "row-actions");
    rec.append(chip(imp.recommendation, imp.recommendation === "CLEAN" ? "ok" : imp.recommendation === "DELTA" ? "info" : "warn"));
    c.append(rec);
    for (const r of imp.reasons || []) c.append(el("div", "note", r));
    c.append(
      el(
        "div",
        "note",
        t("knowledge.impact.counts", {
          registered: imp.registered,
          touched: imp.touched,
          structural: imp.structural,
          pct: imp.affected_pct,
          threshold: imp.threshold,
        })
      )
    );
    const scroll = el("div", "scroll-x");
    const table = el("table");
    const thead = el("thead");
    const hr = el("tr");
    for (const h of [t("knowledge.impact.col.doc"), t("knowledge.impact.col.state"), t("knowledge.impact.col.detail")])
      hr.append(el("th", null, h));
    thead.append(hr);
    const tb = el("tbody");
    for (const d of imp.docs) {
      const tr = el("tr");
      tr.append(el("td", "mono", d.file));
      const st = el("td");
      st.append(chip(d.state, d.state === "CLEAN" ? "ok" : d.state === "TOUCHED" ? "info" : "warn"));
      tr.append(st);
      tr.append(el("td", "note", d.gone.length ? "gone: " + d.gone.join(", ") : d.hits.slice(0, 4).join(", ")));
      tb.append(tr);
    }
    table.append(thead, tb);
    scroll.append(table);
    c.append(scroll);
    if ((imp.blind_spot || []).length) {
      c.append(el("div", "note", t("knowledge.impact.blind")));
      const fl = el("div", "file-list");
      for (const f of imp.blind_spot) fl.append(el("div", null, f));
      c.append(fl);
    }
    out.append(c);
  } else if (imp && !imp.ok) {
    const c = card(t("knowledge.impact.title"));
    c.append(el("div", "note", imp.hint || `unavailable (${imp.reason})`));
    out.append(c);
  }

  // --- patterns
  const p = patRes.data || {};
  const pc = card(t("knowledge.patterns.title"));
  pc.append(el("div", "note", t("knowledge.patterns.note")));
  if (!(p.patterns || []).length) {
    pc.append(empty(t("knowledge.patterns.none"), t("knowledge.patterns.noneHint")));
  } else {
    const table = el("table");
    const tb = el("tbody");
    for (const row of p.patterns) {
      const tr = el("tr");
      tr.append(el("td", "mono", row.lang));
      tr.append(el("td", "note", relAge(row.mtime_ms)));
      tr.append(el("td", "note", row.path));
      tb.append(tr);
    }
    table.append(tb);
    const sc = el("div", "scroll-x");
    sc.append(table);
    pc.append(sc);
  }
  // Language KEYS are the CLI's framework ids (`react`, `nestjs`, …) — a
  // translated one would not resolve to a playbook.
  if ((p.known_languages || []).length)
    pc.append(el("div", "note", t("knowledge.patterns.known", { list: p.known_languages.join(", ") })));
  out.append(pc);

  // --- gotchas
  const g = gotRes.data || {};
  const pruneBtn = el("button", "btn btn-sm", t("knowledge.gotchas.prune"));
  pruneBtn.type = "button";
  pruneBtn.addEventListener("click", async () => {
    const r = await post("/api/gotcha/prune", {});
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    renderKnowledge(body);
  });
  const gc = card(t("knowledge.gotchas.title"), g.count ? pruneBtn : null);
  gc.append(el("div", "note", t("knowledge.gotchas.note")));
  if (!g.count) {
    gc.append(empty(t("knowledge.gotchas.none"), t("knowledge.gotchas.noneHint")));
  } else {
    const table = el("table");
    const thead = el("thead");
    const hr = el("tr");
    // These are the gotcha record's own field names, printed by `orc gotcha
    // list` — column headers stay in the file's vocabulary.
    for (const h of ["Id", "Area", "Kind", "Hits", "Last seen", "Trigger"]) hr.append(el("th", null, h));
    thead.append(hr);
    const tb = el("tbody");
    for (const e of g.gotchas) {
      const tr = el("tr");
      tr.append(el("td", "mono", e.id), el("td", "mono", e.area), el("td", null, e.kind), el("td", null, String(e.hits)), el("td", "note", e.last_seen || "?"), el("td", "note", e.trigger || ""));
      tb.append(tr);
    }
    table.append(thead, tb);
    const sc = el("div", "scroll-x");
    sc.append(table);
    gc.append(sc);
  }
  out.append(gc);

  body.replaceChildren(out);
}

/* PART B MADE VISIBLE (v0.46.0).

   THE PANEL MUST NEVER COMPUTE THE ORDER, THE TIER OR THE ESTIMATE ITSELF — it
   renders `orc wiki plan --json`'s rows in the order they arrive and nothing
   else, the same rule the Flow stepper lives under. A second idea of "which doc
   matters most" is exactly the drift this panel exists to make impossible.

   And: a `used 0/20` row KEEPS ITS SLOT, rendered muted with a retire hint.
   Filtering it out would make "nobody reads this" and "this does not exist"
   look identical — the same rule as an OFF phase in the stepper. */
function wikiPlanCard(plan, debt, body) {
  const c = card(t("knowledge.plan"), wikiPlanActions(body, plan));

  if (!plan || !plan.ok) {
    c.append(empty(t("knowledge.plan.na"), t("knowledge.plan.naHint")));
    return c;
  }

  // The debt line first: the habit this whole workstream is aiming at.
  if (debt && debt.ok && debt.pending) {
    const chips = el("div", "row-actions");
    chips.append(chip(tn(debt.pending, "knowledge.debt.pending"), "warn"));
    if (debt.tokens) chips.append(chip(kTokUi(debt.tokens.input + debt.tokens.cache_write + debt.tokens.cache_read + debt.tokens.output), null));
    if (debt.usd !== null && debt.usd !== undefined) chips.append(chip("$" + debt.usd.toFixed(2), null));
    if (debt.oldest_commits_behind !== null) chips.append(chip(tn(debt.oldest_commits_behind, "knowledge.debt.oldest"), null));
    c.append(chips);
    c.append(el("div", "note", t("knowledge.debt.nothingBroken")));
  } else if (debt && debt.ok) {
    c.append(el("div", "note ok", t("knowledge.debt.none")));
  }

  if (!plan.rows || !plan.rows.length) {
    c.append(el("div", "note ok", t("knowledge.plan.clean")));
    return c;
  }

  // FREE REPAIRS FIRST — a user must never be able to pay for something a free
  // step would have fixed, so they render ABOVE the priced table.
  if (plan.free_repairs && plan.free_repairs.length) {
    const box = el("div", "free-box");
    box.append(el("div", "free-head", t("knowledge.plan.freeFirst")));
    for (const r of plan.free_repairs) {
      const row = el("div", "free-row");
      row.append(chip(t("knowledge.plan.free"), "ok"));
      row.append(el("span", null, r.what));
      row.append(el("code", "mono", r.cmd));
      box.append(row);
    }
    c.append(box);
  }

  const tbl = el("table", "tbl");
  const th = el("tr");
  for (const h of ["knowledge.plan.col.doc", "knowledge.plan.col.state", "knowledge.plan.col.delta", "knowledge.plan.col.used", "knowledge.plan.col.tier", "knowledge.plan.col.tokens", "knowledge.plan.col.usd"])
    th.append(el("th", null, t(h)));
  tbl.append(th);
  for (const r of plan.rows) {
    const tr = el("tr", r.retire_hint ? "row-muted" : null);
    tr.append(el("td", "mono", r.doc.replace(/^wiki\//, "")));
    // The CLI's exact state words. Never a friendlier synonym.
    const stateCell = el("td");
    stateCell.append(chip(r.state, r.state === "STRUCTURAL" ? "bad" : "warn"));
    tr.append(stateCell);
    tr.append(el("td", "num", r.state === "STRUCTURAL" ? "—" : String(r.delta)));
    tr.append(el("td", "num", r.used === null ? "?" : `${r.used}/${r.used_of}`));
    tr.append(el("td", null, r.tier));
    const est = r.estimate;
    tr.append(el("td", "num", est ? kTokUi(est.p50.input + est.p50.cache_write + est.p50.cache_read + est.p50.output) : "—"));
    // The dollar figure is the CLI's — the panel never prices anything itself,
    // and a row the CLI could not price shows an em dash rather than a guess.
    tr.append(el("td", "num", r.usd === null || r.usd === undefined ? "—" : "$" + r.usd.toFixed(2)));
    tbl.append(tr);
    if (r.state === "STRUCTURAL" && r.gone && r.gone.length) {
      const note = el("tr", "row-note");
      const td = el("td", null, t("knowledge.plan.gone", { files: r.gone.slice(0, 3).join(", ") }));
      td.setAttribute("colspan", "7");
      note.append(td);
      tbl.append(note);
    }
    if (r.retire_hint) {
      const note = el("tr", "row-note");
      const td = el("td", null, t("knowledge.plan.retireHint", { n: r.used_of }));
      td.setAttribute("colspan", "7");
      note.append(td);
      tbl.append(note);
    }
  }
  c.append(tbl);
  if (plan.estimate_unavailable) c.append(el("div", "note", t("knowledge.plan.noEstimate")));
  c.append(el("div", "note", t("knowledge.plan.tierNote", { mode: plan.scan_tier_mode, deep: plan.deep, light: plan.light })));
  // A refresh COSTS MONEY, so it is a command, never a button.
  c.append(laneCommand(`/orc-wiki refresh --top ${Math.min(2, plan.rows.length)}`, t("knowledge.plan.refreshWhy")));
  return c;
}

function wikiPlanActions(body, plan) {
  const wrap = el("div", "row-actions");
  // `orc wiki sync` is FREE ($0.00), so it gets a button.
  const s = el("button", "btn btn-sm", t("knowledge.syncFree"));
  s.type = "button";
  s.addEventListener("click", async () => {
    const r = await post("/api/wiki/sync", {});
    toast(r.ok ? t("knowledge.syncOk") : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
    renderKnowledge(body);
  });
  wrap.append(s);
  return wrap;
}

function wikiUsageCard(u, body) {
  const c = card(t("knowledge.usage"), (() => {
    const wrap = el("div", "row-actions");
    const b = el("button", "btn btn-ghost btn-sm", t("knowledge.usage.rebuild"));
    b.type = "button";
    b.addEventListener("click", async () => {
      const r = await post("/api/wiki/usage/rebuild", {});
      toast(r.ok ? t("knowledge.usage.rebuilt") : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
      renderKnowledge(body);
    });
    wrap.append(b);
    return wrap;
  })());
  const chips = el("div", "row-actions");
  chips.append(chip(t("knowledge.usage.registered", { n: u.registered }), null));
  chips.append(chip(t("knowledge.usage.active", { n: u.in_active_use }), "ok"));
  if (u.never_used) chips.append(chip(t("knowledge.usage.never", { n: u.never_used, runs: u.window_runs }), "warn"));
  c.append(chips);
  const body2 = el("div", "usage-rows");
  for (const r of u.rows) {
    const row = el("div", "usage-row" + (r.used ? "" : " row-muted"));
    row.append(el("span", "mono", r.doc.replace(/^wiki\//, "")));
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    track.append(fill);
    requestAnimationFrame(() => fill.style.setProperty("width", Math.max(2, (r.used / (r.of || 1)) * 100) + "%"));
    row.append(track);
    row.append(el("span", "bar-value", `${r.used}/${r.of}`));
    row.append(el("span", "note", r.last_used || t("knowledge.usage.neverUsed")));
    body2.append(row);
  }
  c.append(body2);
  c.append(el("div", "note", t("knowledge.usage.note")));
  return c;
}

function wikiActions(body, w) {
  if (!w || !w.state || w.state === "none") return null;
  const wrap = el("div", "row-actions");
  const sync = el("button", "btn btn-sm", "orc wiki sync");
  sync.type = "button";
  sync.addEventListener("click", async () => {
    const r = await post("/api/wiki/sync", {});
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    renderKnowledge(body);
  });
  wrap.append(sync);
  return wrap;
}

/* =================================================================== STATS == */

/* The Cost tab's unit choice persists: a Max user who picked Quota once should
   not have to pick it every time the panel reloads. It is a per-browser display
   preference, exactly like the theme and the language — never a project setting,
   and never written to config. */
const COST_UNIT_KEY = "orc-ui-cost-unit";
const COST_UNITS = ["tokens", "quota", "usd"];
// Written out in full, never assembled from `"cost.unit." + u` — a key built
// from a fragment is invisible to the i18n coverage check.
const COST_UNIT_KEY_OF = { tokens: "cost.unit.tokens", quota: "cost.unit.quota", usd: "cost.unit.usd" };

PANELS.stats = function (host) {
  head(host, t("stats.title"), t("stats.sub"));
  const tabs = el("div", "tabs");
  const body = el("div", "stack");
  let active = "usage";
  const mk = (id, label) => {
    const b = el("button", "tab" + (id === active ? " tab-on" : ""), label);
    b.type = "button";
    b.addEventListener("click", () => {
      active = id;
      for (const x of tabs.children) x.classList.toggle("tab-on", x === b);
      body.replaceChildren();
      (id === "usage" ? renderStatsUsage : renderStatsCost)(body);
    });
    return b;
  };
  tabs.append(mk("usage", t("stats.tab.usage")), mk("cost", t("stats.tab.cost")));
  host.append(tabs, body);
  renderStatsUsage(body);
};

function renderStatsUsage(host) {
  section(
    host,
    () => read("/api/stats").then((r) => r.data),
    (d) => {
      if (!d.runs) return empty(t("stats.empty"), t("stats.emptyHint", { dir: d.log_dir }));
      const out = frag();

      const tiles = el("div", "grid grid-3");
      tiles.append(statTile(t("stats.runs"), String(d.runs), `${d.from} → ${d.to}`));
      tiles.append(statTile(t("stats.dispatches"), String(d.dispatches)));
      tiles.append(
        statTile(t("stats.downgrades"), String(d.downgrades), t("stats.downgradesNote"), d.downgrades ? "warn" : "ok")
      );
      out.append(tiles);

      // Lane and agent NAMES are the CLI's — only the card titles are ours.
      out.append(barCard(t("stats.lanes"), d.lanes, (k) => (k === "unknown" ? "(no lane)" : "/" + k)));
      if (Object.keys(d.agents || {}).length) out.append(barCard(t("stats.agents"), d.agents, (k) => k.replace(/^orc-/, "")));

      const health = card(t("stats.health"));
      health.append(
        kvList([
          [t("stats.unfinished"), String(d.unfinished)],
          [t("stats.unknownLane"), d.unknown_lane ? String(d.unknown_lane) + "   (pre-v0.34.2 bootstrap files)" : "0"],
          [t("stats.logDir"), d.log_dir],
        ])
      );
      health.append(el("div", "note", t("stats.note")));
      out.append(health);
      return out;
    }
  );
}

/* --------------------------------------------------------------- STATS · COST
   Unit-aware, because a dollar figure is the wrong headline for most Claude Code
   users: on Pro or Max you burn a 5-hour window, not an invoice.

   THE STACKED BAR EXISTS SO CACHE-READ IS VISIBLY SEPARATE. A single-value bar
   would re-hide the exact thing the four-component vector exists to expose — and
   the four components are the CLI's, never recomputed here. */

const kTokUi = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n || 0));

function costUnit() {
  try {
    const v = localStorage.getItem(COST_UNIT_KEY);
    return COST_UNITS.includes(v) ? v : "tokens";
  } catch (_) {
    return "tokens";
  }
}

async function renderStatsCost(host) {
  host.replaceChildren(skeleton(5));
  const url = statsPlanPath ? "/api/budget/forecast?plan=" + encodeURIComponent(statsPlanPath) : "/api/budget/rates";
  const [main, rates] = await Promise.all([
    read(url).catch(() => ({ data: null })),
    read("/api/budget/rates").catch(() => ({ data: null })),
  ]);
  const out = frag();

  // --- the plan picker. `browse` reuses /api/fs/list, which is a DIRECTORY
  // lister: names only, never a file's contents. The server passes the PATH to
  // `orc budget forecast`; nothing here opens the plan.
  const pick = card(t("cost.plan"));
  const row = el("div", "row-actions");
  const input = el("input", "input");
  input.type = "text";
  input.value = statsPlanPath || "";
  input.placeholder = t("cost.planPlaceholder");
  const browse = el("button", "btn btn-ghost btn-sm", t("cost.browse"));
  browse.type = "button";
  browse.addEventListener("click", () => pickFolder((p) => (input.value = p)));
  const go = el("button", "btn btn-sm", t("cost.forecast"));
  go.type = "button";
  go.addEventListener("click", () => {
    statsPlanPath = input.value.trim();
    host.replaceChildren();
    renderStatsCost(host);
  });
  row.append(input, browse, go);
  pick.append(row);
  pick.append(el("div", "note", t("cost.planOnly")));
  out.append(pick);

  const d = main.data;
  if (!statsPlanPath || !d || !d.ok || !d.lanes) {
    const c = card(t("cost.title"));
    c.append(empty(t("cost.noForecast"), t("cost.noForecastHint")));
    if (rates.data && rates.data.dispatches_joined) c.append(ratesCard(rates.data));
    else c.append(laneCommand("orc budget calibrate", t("cost.calibrateWhy")));
    out.append(c);
    host.replaceChildren(out);
    return;
  }

  // --- the unit switch
  const unit = costUnit();
  const c = card(t("cost.title"), unitSwitch(unit, host));
  c.append(el("div", "note", t("cost.sub", { tasks: d.tasks, waves: d.waves })));

  // --- one stacked bar per lane
  const maxRaw = Math.max(...d.lanes.map((l) => l.raw || 0), 1);
  const bars = el("div", "bars");
  for (const l of d.lanes) {
    const r = el("div", "bar-row");
    r.append(el("div", "bar-label", l.cmd || l.lane));
    if (!l.raw) {
      // A lane with no measurable cost is NOT free. Saying so is the honest
      // rendering; a zero-length bar would read as "cheapest".
      const box = el("div", "bar-track");
      box.append(el("div", "bar-none", t("cost.notPossible")));
      r.append(box, el("div", "bar-value", "—"));
      bars.append(r);
      continue;
    }
    const track = el("div", "bar-track");
    const st = el("div", "bar-stack");
    // The vector's four parts, in their real proportions, from the primary
    // lane's own breakdown when we have it and the lane totals otherwise.
    const parts = l.lane === "orc" && d.tokens ? d.tokens.p50 : null;
    if (parts) {
      for (const [k, cls] of [["input", "seg-in"], ["cache_write", "seg-cw"], ["cache_read", "seg-cr"], ["output", "seg-out"]]) {
        const seg = el("div", "bar-seg " + cls);
        seg.title = `${k}: ${kTokUi(parts[k])}`;
        st.append(seg);
        requestAnimationFrame(() => seg.style.setProperty("flex-grow", String(parts[k] || 0)));
      }
    } else {
      const seg = el("div", "bar-seg seg-cr");
      st.append(seg);
      requestAnimationFrame(() => seg.style.setProperty("flex-grow", "1"));
    }
    track.append(st);
    requestAnimationFrame(() => st.style.setProperty("width", Math.max(4, (l.raw / maxRaw) * 100) + "%"));
    r.append(track);
    r.append(el("div", "bar-value", laneUnitValue(l, d, unit)));
    if (l.lane === "orc") r.append(el("span", "bar-mark", "←"));
    bars.append(r);
  }
  c.append(bars);

  const legend = el("div", "legend");
  for (const [k, cls] of [["cost.legend.in", "seg-in"], ["cost.legend.cw", "seg-cw"], ["cost.legend.cr", "seg-cr"], ["cost.legend.out", "seg-out"]]) {
    const item = el("span", "legend-item");
    item.append(el("span", "legend-dot " + cls));
    item.append(el("span", null, t(k)));
    legend.append(item);
  }
  c.append(legend);
  c.append(el("div", "note", t("cost.cacheNote")));

  // --- the honesty block. NONE of this is optional chrome: an honest range
  // rendered as a confident bar is a lie the panel invented.
  if (d.low_confidence_bands)
    c.append(el("div", "note warn", tn(d.low_confidence_bands, "cost.lowConfidence", { min: d.min_samples })));
  if (d.price_table && d.price_table.stale)
    c.append(el("div", "note warn", t("cost.priceStale", { as_of: d.price_table.as_of, days: d.price_table.age_days })));
  if (!d.transcripts_readable) c.append(el("div", "note warn", t("cost.noTranscripts")));
  if (d.unattributed && d.unattributed.blocks)
    c.append(el("div", "note", tn(d.unattributed.blocks, "cost.unattributed")));
  out.append(c);

  // --- context risk. The output nobody else has, so it gets its own card.
  if (d.context_risk && d.context_risk.length) {
    const rc = card(t("cost.contextTitle"));
    rc.append(el("div", "note warn", t("cost.contextIntro")));
    for (const r of d.context_risk) {
      const line = el("div", "row-actions");
      line.append(chip(r.task, "warn"));
      line.append(el("span", null, t("cost.contextRow", { agent: r.agent.replace(/^orc-executor-/, ""), peak: kTokUi(r.peak), window: kTokUi(r.window), pct: r.pct })));
      const b = el("button", "btn btn-ghost btn-sm", t("cost.contextOpenUsage"));
      b.type = "button";
      b.addEventListener("click", () => (location.hash = "#/knowledge"));
      line.append(b);
      rc.append(line);
    }
    rc.append(el("div", "note", t("cost.contextHint")));
    out.append(rc);
  }

  // --- the per-band table, rendered from the CLI's own rows
  const bc = card(t("cost.bands"));
  const tbl = el("table", "tbl");
  const thead = el("tr");
  for (const h of ["cost.col.band", "cost.col.model", "cost.col.n", "cost.col.in", "cost.col.cw", "cost.col.cr", "cost.col.out", "cost.col.samples"])
    thead.append(el("th", null, t(h)));
  tbl.append(thead);
  for (const b of d.bands || []) {
    const tr = el("tr", b.samples < d.min_samples ? "row-soft" : null);
    tr.append(el("td", "mono", b.band));
    tr.append(el("td", null, String(b.agent || "").replace(/^orc-executor-/, "")));
    tr.append(el("td", null, String(b.count)));
    for (const k of ["input", "cache_write", "cache_read", "output"]) tr.append(el("td", "num", b.p50 ? kTokUi(b.p50[k]) : "—"));
    tr.append(el("td", "num", String(b.samples)));
    tbl.append(tr);
  }
  bc.append(tbl);
  bc.append(el("div", "note", t("cost.bandsNote")));
  out.append(bc);
  out.append(laneCommand("/orc-budget", t("cost.laneWhy")));
  host.replaceChildren(out);
}

let statsPlanPath = "";

function unitSwitch(active, host) {
  const wrap = el("div", "seg-ctl");
  for (const u of COST_UNITS) {
    const b = el("button", "seg-btn" + (u === active ? " seg-on" : ""), t(COST_UNIT_KEY_OF[u]));
    b.type = "button";
    b.addEventListener("click", () => {
      try {
        localStorage.setItem(COST_UNIT_KEY, u);
      } catch (_) {}
      host.replaceChildren();
      renderStatsCost(host);
    });
    wrap.append(b);
  }
  return wrap;
}

function laneUnitValue(l, d, unit) {
  if (unit === "usd") return l.usd === null || l.usd === undefined ? "—" : "$" + l.usd.toFixed(2);
  if (unit === "quota") {
    // NEVER a quota figure without a known plan — the CLI decides that, and when
    // it says unavailable the cell says so rather than inventing a percentage.
    if (!d.quota || !d.quota.available) return t("cost.quotaNa");
    const share = d.weighted && d.weighted.p50 ? l.weighted / d.weighted.p50 : 1;
    return (d.quota.window_pct * share).toFixed(1) + "%";
  }
  return kTokUi(l.raw);
}

function ratesCard(r) {
  const c = card(t("cost.ratesTitle"));
  c.append(
    kvList([
      [t("cost.rates.calibrated"), r.calibrated_at],
      [t("cost.rates.joined"), String(r.dispatches_joined)],
      [t("cost.rates.transcripts"), r.transcripts_readable ? `${r.transcript_files}` : t("cost.rates.unreadable")],
      [t("cost.rates.unattributed"), `${r.unattributed.blocks}`],
    ])
  );
  return c;
}

function barCard(title, map, label) {
  const c = card(title);
  const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;
  const total = rows.reduce((n, r) => n + r[1], 0);
  const bars = el("div", "bars");
  for (const [k, n] of rows) {
    const row = el("div", "bar-row");
    row.append(el("div", "bar-label", label ? label(k) : k));
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    track.append(fill);
    row.append(track);
    row.append(el("div", "bar-value", `${n}  ${Math.round((n / total) * 100)}%`));
    bars.append(row);
    // Set the width after insertion so the 320ms grow transition runs.
    requestAnimationFrame(() => fill.style.setProperty("width", Math.max(2, (n / max) * 100) + "%"));
  }
  c.append(bars);
  return c;
}

/* ==================================================================== FLOW == */

PANELS.flow = function (host) {
  head(host, t("flow.title"), t("flow.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderFlow(body);
};

async function renderFlow(body) {
  body.replaceChildren(skeleton(6));
  const d = (await read("/api/diy")).data;
  const out = frag();

  const compile = el("button", "btn btn-sm btn-primary", t("flow.compile"));
  compile.type = "button";
  compile.addEventListener("click", async () => {
    const r = await post("/api/diy/compile", {});
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    renderFlow(body);
  });

  // The Overview's "worth doing" row for a STALE flow deep-links to this panel,
  // so the recompile button is the first thing on it. `#diy-gate` is the anchor.
  const gate = card(t("flow.gate"), d.configured ? compile : null);
  gate.id = "diy-gate";
  const chipRow = el("div", "row-actions");
  chipRow.append(chip(d.state, d.state === "READY" ? "ok" : d.state === "STALE" ? "warn" : ""));
  gate.append(chipRow);
  gate.append(el("div", "note", d.reason));
  for (const trigger of d.triggers || []) gate.append(el("div", "note", "• " + trigger));
  if (!d.configured) gate.append(el("div", "note", t("flow.bootstrap")));
  out.append(gate);

  // Directly below the gate, configured or not: the flow's SHAPE is the first
  // decision, and picking a shipped starting point is how the terminal composer
  // opens. It was the one DIY question the panel could not answer.
  out.append(presetCard(d, body));

  if (d.configured) {
    out.append(stepperCard(d));

    for (const e of d.errors || []) out.append(bannerLine(e, true));
    for (const w of d.warnings || []) out.append(bannerLine(w, false));

    const keys = card(t("flow.keys"));
    keys.id = "flow-keys";
    keys.append(el("div", "note", t("flow.keysNote")));

    // Batched, exactly like Settings (v0.44.1). Recompiling is already a second
    // step after a key change, so writing each key the instant you touch it
    // bought nothing and cost a full re-render per key.
    let bar = null;
    const edits = editSet(() => {
      if (bar) bar.paint();
      for (const row of keys.querySelectorAll(".setting[data-key]")) {
        row.classList.toggle("staged", edits.map.has(row.dataset.key));
      }
    });

    for (const k of d.keys) {
      const row = el("div", "setting");
      row.dataset.key = k.key; // the stepper jumps here when you click a phase
      const left = el("div");
      const name = el("div", "setting-name");
      name.append(document.createTextNode(k.key));
      if (k.is_set) name.append(el("span", "dot"));
      left.append(name, el("div", "setting-desc", k.desc || ""));
      const right = el("div", "setting-control");
      const current = String(k.value === "" ? "" : k.value);
      const stage = (value) => edits.set(k.key, String(value), current);

      // A flow key is a CLOSED SET, so it gets a dropdown carrying every legal
      // value — `orc diy set` would reject anything else anyway, and a text box
      // that only ever accepts a handful of words is a memory test with a
      // rejection at the end of it. The list is the CLI's `options`; the panel
      // holds no copy of what a key accepts.
      if (k.options && k.options.length) {
        const sel = el("select", "select-input");
        // A value outside its own option list still has to be SHOWN — an unset
        // fixed_executor is exactly that. It leads, and it is disabled, so the
        // dropdown reports the state without offering it back as a choice the
        // validator would refuse.
        if (!k.options.some((o) => String(o) === current)) {
          const ph = el("option", null, current === "" ? t("flow.unset") : current);
          ph.value = current;
          ph.disabled = true;
          sel.append(ph);
        }
        for (const opt of k.options) {
          const o = el("option", null, String(opt));
          o.value = String(opt);
          sel.append(o);
        }
        sel.value = current;
        sel.addEventListener("change", () => stage(sel.value));
        right.append(sel);
      } else {
        // Free text (flow_name is a slug) — validation is the CLI's exit code.
        const input = el("input", "text-input");
        input.value = current;
        input.addEventListener("input", () => stage(input.value));
        right.append(input);
      }
      row.append(left, right);
      keys.append(row);
    }

    // The bar is the LAST thing in the keys card, which is where the user asked
    // for it. Reset here is `orc diy init --force`: the CLI has no "put every
    // key back to its default" for a flow — `orc diy reset` DELETES the config
    // and unconfigures the lane, which is a different, larger thing.
    bar = editBar(edits, {
      resetLabel: t("edits.resetFlow"),
      onApply: async (btn) => {
        await applyEdits(edits, { set: "/api/diy/set" }, btn);
        renderFlow(body);
      },
      onReset: () => confirmPreset(d.presets.find((p) => !p.name) || { name: "", changes: {} }, d, body),
      onCancel: () => renderFlow(body),
    });
    keys.append(bar);
    out.append(keys);

    if (d.score_table) {
      const st = card(t("flow.table"));
      st.append(el("div", "note", t("flow.tableNote")));
      const sc = el("div", "scroll-x");
      sc.append(el("pre", "block", d.score_table));
      st.append(sc);
      out.append(st);
    }
    const paths = card(t("flow.files"));
    // config / compiled / lock are the artifact names in the DIY contract.
    paths.append(kvList([["config", d.paths.config], ["compiled", d.paths.compiled], ["lock", d.paths.lock]]));
    out.append(paths);
  }

  body.replaceChildren(out);
}

function bannerLine(text, bad) {
  const b = el("div", "banner" + (bad ? " banner-bad" : ""));
  b.append(el("div", null, text));
  return b;
}

// THE PRESETS (v0.44.0). `orc diy` opens by asking which shape to start from —
// full-lane defaults or one of the shipped presets — and that question had no
// answer in this panel at all: a flow could be tuned key by key here, but never
// STARTED from a known-good shape.
//
// It is a REPLACEMENT, not a merge: `orc diy init --force` rewrites the config
// file, which is what the terminal does too. So every row names the keys the
// preset actually changes, the exact command is on the row before you click it,
// and applying it goes through a confirmation that says what is lost.
//
// A row you are ALREADY ON says so and drops its button (v0.44.1). The match is
// the CLI's — `presets[].active` — and it deliberately ignores `flow_name`, so
// renaming `solo-fast` to `solo` does not make the panel forget which shape the
// flow came from. Offering "use this" for the thing already in use is a button
// whose only possible effect is to overwrite your config with itself.
function presetCard(d, body) {
  const c = card(t("flow.presets"));
  c.id = "diy-presets";
  c.append(el("div", "note", d.configured ? t("flow.presetsNoteConfigured") : t("flow.presetsNote")));

  for (const p of d.presets || []) {
    const row = el("div", "preset-row" + (p.active ? " preset-active" : ""));
    const left = el("div");
    const head = el("div", "preset-head");
    // Preset names and their key=value diffs are CLI data — never translated.
    head.append(el("div", "setting-name", p.name || t("flow.presetDefaults")));
    if (p.active) head.append(chip(t("flow.presetInUse"), "ok"));
    left.append(head);
    const changed = Object.entries(p.changes || {});
    left.append(
      el("div", "setting-desc", changed.length ? changed.map(([k, v]) => `${k}=${v}`).join(" · ") : t("flow.presetDefaultsDesc"))
    );
    left.append(el("div", "action-cmd", presetCommand(p)));
    // The match ignores flow_name, so say so on the row that matched — a chip
    // reading "in use" beside a flow called something else is otherwise just
    // confusing.
    if (p.active) left.append(el("div", "note", t("flow.presetInUseNote")));
    row.append(left);

    if (!p.active) {
      const use = el("button", "btn btn-sm", t("flow.presetUse"));
      use.type = "button";
      use.addEventListener("click", () => confirmPreset(p, d, body));
      row.append(use);
    }
    c.append(row);
  }
  return c;
}

const presetCommand = (p) => "orc diy init --force" + (p.name ? " --preset " + p.name : "");

function confirmPreset(p, d, body) {
  const b = el("div", "stack stack-sm");
  b.append(el("div", null, p.name ? t("flow.presetConfirm", { name: p.name }) : t("flow.presetConfirmDefaults")));
  b.append(el("div", "action-cmd", presetCommand(p)));
  if (p.changes && Object.keys(p.changes).length) {
    b.append(kvList(Object.entries(p.changes).map(([k, v]) => [k, String(v)])));
  }
  // Overwriting a flow you tuned by hand is the only way this can hurt, so it
  // is said plainly rather than implied by the word "force" in the command.
  if (d.configured) b.append(bannerLine(t("flow.presetOverwrite"), true));

  modal({
    title: t("flow.presetTitle"),
    body: b,
    actions: [
      { label: t("common.cancel"), onClick: (c) => c() },
      {
        label: t("flow.presetApply"),
        cls: d.configured ? "btn-danger" : "btn-primary",
        onClick: async (close) => {
          close();
          const r = await post("/api/diy/preset", { name: p.name });
          toast(r.command, r.ok ? "ok" : "bad", r.output);
          renderFlow(body);
        },
      },
    ],
  });
}

// THE FLOW STEPPER (v0.43.7). A compiled DIY flow is a pipeline, and a column
// of key/value rows is the one shape that never shows you a pipeline. Every
// step here comes from `orc diy show --json`'s `steps[]`, which the CLI derives
// from the SAME array `orc diy compile` stitches with — the panel draws the
// order, it never decides it.
//
// A phase you switched OFF keeps its slot and turns RED. Removing it would make
// "I turned review off" and "this flow has no review phase" look identical, and
// it would make the rail change width every time you flip a key.
//
// The sweep LOOPS (v0.44.0). It was one-shot on the reasoning that motion above
// a form is a distraction; in use the opposite complaint arrived — the one thing
// on the panel that says "these run in this order" said it once, before you had
// finished reading the card, and there was no way to see it again short of a
// recompile. The loop is a long, mostly-idle cycle: a single pulse travels the
// rail and the rail is at rest for the rest of it, so it reads as a heartbeat
// rather than a flashing sign. `prefers-reduced-motion` removes it entirely.
function stepperCard(d) {
  const on = d.steps.filter((s) => s.on).length;
  const c = card(t("flow.pipeline"), chip(t("flow.pipelinePhases", { on, total: d.steps.length }), "info"));
  c.append(el("div", "note", t("flow.pipelineNote")));

  const scroll = el("div", "scroll-x");
  const rail = el("div", "stepper");
  d.steps.forEach((s, i) => {
    if (i) {
      const link = el("div", "step-link");
      link.append(el("span", "step-flow"));
      link.style.setProperty("--d", i * 90 + "ms");
      rail.append(link);
    }
    // A step is a button only when there is a key to jump to; a keyless phase
    // (intake, trace, execute) has nothing to edit, so it is not offered as one.
    const step = el(s.key ? "button" : "div", "step" + (s.on ? "" : " step-off"));
    if (s.key) {
      step.type = "button";
      step.title = t("flow.stepJump", { key: s.key });
      step.addEventListener("click", () => jumpToKey(s.key));
    }
    step.style.setProperty("--d", i * 90 + "ms");
    // label / value / key come from the CLI — never translated.
    step.append(el("span", "step-name", s.label));
    step.append(el("span", "step-note", s.on ? s.note || "on" : "off"));
    rail.append(step);
  });
  scroll.append(rail);
  c.append(scroll);
  return c;
}

function jumpToKey(key) {
  const row = document.querySelector('#flow-keys .setting[data-key="' + key + '"]');
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.remove("linked-hi");
  void row.offsetWidth; // restart the highlight when the same step is clicked twice
  row.classList.add("linked-hi");
  setTimeout(() => row.classList.remove("linked-hi"), 1600);
}

/* =============================================================== CROSSLINK == */

PANELS.crosslink = function (host) {
  head(host, t("crosslink.title"), t("crosslink.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderCrosslink(body);
};

// TWO TABS (v0.43.7): DESIGN is the picture of the boundary, SETTINGS is every
// control. They were one scrolling column, which made the diagram something you
// scrolled past on the way to the add form rather than the thing you came for.
//
// With nothing linked yet there is no picture to draw, so Settings opens
// selected and its tab is spotlighted — Design stays reachable and says, in the
// empty state, exactly which tab makes it appear.
async function renderCrosslink(body) {
  body.replaceChildren(skeleton(5));
  const d = (await read("/api/crosslink")).data;
  const live = d.configured && d.nodes.length > 0;

  const tabs = el("div", "tabs");
  // `stack` as well as `tab-pane`: the Settings tab holds several cards, and
  // the container is what spaces panel blocks — see `.stack` in app.css.
  const pane = el("div", "tab-pane stack");
  const views = {
    design: () => designView(d, live, () => select("settings")),
    settings: () => settingsView(d, body),
  };
  const select = async (which) => {
    for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.tab === which));
    pane.replaceChildren(skeleton(3));
    const built = await views[which]();
    pane.replaceChildren(built);
  };
  // Keys are written out in full, never assembled from the tab id — a key built
  // from a fragment is invisible to every check that looks for one.
  for (const [which, label] of [["design", t("crosslink.tab.design")], ["settings", t("crosslink.tab.settings")]]) {
    const b = el("button", null, label);
    b.type = "button";
    b.dataset.tab = which;
    // The spotlight is the answer to "there is nothing here" — it points at the
    // one tab that can change that, and it is dropped the moment a link exists.
    if (!live && which === "settings") b.classList.add("tab-spot");
    b.addEventListener("click", () => select(which));
    tabs.append(b);
  }
  body.replaceChildren(tabs, pane);
  select(live ? "design" : "settings");
}

function designView(d, live, gotoSettings) {
  const out = frag();
  if (!live) {
    const e = empty(t("crosslink.design.empty"), t("crosslink.design.emptyHint"));
    const go = el("button", "btn btn-sm btn-primary", t("crosslink.design.emptyCta"));
    go.type = "button";
    go.addEventListener("click", gotoSettings);
    e.append(go);
    out.append(e);
    return out;
  }
  out.append(vaultCard(d));
  return out;
}

async function settingsView(d, body) {
  const out = frag();

  if (!d.configured) {
    out.append(empty(t("crosslink.empty"), t("crosslink.emptyHint")));
    out.append(await addLinkCard(d, body));
    return out;
  }

  const head2 = card(t("crosslink.graph"));
  head2.append(
    kvList(
      [
        [t("crosslink.self"), d.self],
        [t("crosslink.config"), d.config_path],
        [t("crosslink.needs"), d.needs_baseline || t("crosslink.needsNone")],
      ],
      true
    )
  );
  out.append(head2);

  out.append(await addLinkCard(d, body));

  for (const n of d.nodes) {
    const c = el("div", "action");
    c.dataset.node = n.name; // paired with the graph node above on hover
    const left = el("div");
    const name = el("div", "setting-name");
    name.append(document.createTextNode(n.name));
    name.append(
      chip(
        n.direction === "consume" ? t("crosslink.weCall") : n.direction === "provide" ? t("crosslink.theyCall") : t("crosslink.noEdge"),
        n.direction === "consume" ? "info" : n.direction === "provide" ? "" : "warn"
      )
    );
    left.append(name);
    // repo_path and kind ids come straight from the config file.
    left.append(el("div", "setting-desc", n.repo_path + (n.kinds.length ? "  ·  kinds: " + n.kinds.join(", ") : "")));
    const pv = n.provider || {};
    if (pv.state === "missing") left.append(el("div", "note", t("crosslink.state.missing")));
    else if (pv.state === "no-wiki") left.append(el("div", "note", t("crosslink.state.noWiki")));
    else if (pv.state === "unregistered") left.append(el("div", "note", t("crosslink.state.unregistered")));
    else if (pv.state === "corrupt") left.append(el("div", "note", t("crosslink.state.corrupt")));
    else if (n.direction === "provide") left.append(el("div", "note", t("crosslink.state.inbound")));
    else {
      const row = el("div", "row-actions");
      row.append(chip(pv.tier || t("overview.tile.wikiUnknown"), pv.tier === "FRESH" ? "ok" : pv.tier === "AGING" ? "warn" : "bad", pv.tier === "STALE"));
      row.append(el("span", "note", t("crosslink.peerNote", { scan: pv.last_scan || "?", tags: pv.tags || 0 })));
      left.append(row);
      if (!pv.tags) left.append(el("div", "note", t("crosslink.noTags", { path: n.repo_path })));
    }
    const rm = el("button", "btn btn-sm btn-danger", t("common.remove"));
    rm.type = "button";
    rm.addEventListener("click", () => confirmRemove(n.name, body));
    c.append(left, rm);
    out.append(c);
  }

  if (d.links.length) {
    const lc = card(t("crosslink.edges"));
    for (const l of d.links) lc.append(el("div", "note", `${l.from} ──${l.via}──▶ ${l.to}   (${l.relation.replace(/-/g, " ")})`));
    out.append(lc);
  }

  return out;
}

/* ------------------------------------------------------- the vault graph -- */

// THE DESIGN TAB (v0.43.7). Self in the middle, every linked repo on a ring
// around it, one line per edge drawn in the direction it actually points, and a
// pulse travelling that line so "which way does this one go" is answered by
// motion instead of by reading an arrow glyph.
//
// The layout is COMPUTED, not simulated: peer i sits at a fixed angle for a
// given node count, so the same config draws the same picture every time you
// open the tab. A physics sim would be prettier to poke and useless to compare.
//
// THE LAYOUT IS SOLVED IN PIXELS FROM THE REAL BOX SIZE, and that is the whole
// fix in v0.43.7's first patch. Placing fixed-pixel boxes on a ring whose radius
// was a FRACTION of the container ("0.34 of the height") is a guess: nothing in
// it knows how wide a repo box is, so at three peers the boxes overlapped and
// the picture was unreadable. Repo boxes are a fixed size now and the radii are
// derived from that size, so separation is a property of the layout rather than
// a value that happened to look right in one screenshot. See ringRadii().
//
// Edges carry pathLength="1", so the draw-in and the travelling pulse are
// written as fractions of the line and never need its length measured.

// Fixed box metrics. Fixed is what makes the geometry solvable — a box that
// sizes to its longest repo name cannot be spaced by arithmetic, only measured
// and re-measured. Long names ellipsis instead.
const VAULT = { W: 156, H: 78, GAP: 20, PAD: 24 };

// The smallest ellipse on which no two boxes — and no box and the hub — can
// overlap.
//
// Two axis-aligned boxes miss each other when |dx| >= W+GAP OR |dy| >= H+GAP.
// For neighbours Δ apart on the ring with midangle m:
//     dx = rx·2sin(Δ/2)·|sin m|      dy = ry·2sin(Δ/2)·|cos m|
// One of |sin m|, |cos m| is always at least 1/√2, so scaling both radii by √2
// makes whichever term is doing the work clear its threshold on its own. The
// same √2 as a FLOOR handles the hub, which sits at the centre and is a box too.
// Wider angular gaps only push boxes further apart, so neighbours are the worst
// case and checking them is enough.
function ringRadii(n) {
  const needX = Math.SQRT2 * (VAULT.W + VAULT.GAP);
  const needY = Math.SQRT2 * (VAULT.H + VAULT.GAP);
  // n === 1 has no neighbour pair — and sin(π/1) is 0, so the general form
  // divides by zero. One peer only ever has to clear the hub.
  const sep = n > 1 ? 2 * Math.sin(Math.PI / n) : Infinity;
  return { rx: Math.max(needX, needX / sep), ry: Math.max(needY, needY / sep) };
}

function vaultCard(d) {
  const summary = t(d.nodes.length === 1 && d.links.length === 1 ? "crosslink.repos" : "crosslink.reposPlural", {
    repos: d.nodes.length,
    edges: d.links.length,
  });
  const c = card(t("crosslink.design.title"), chip(summary, "info"));
  c.append(el("div", "note", t("crosslink.design.note")));

  const n = d.nodes.length;
  const { rx, ry } = ringRadii(n);
  // Lay out around an origin first, then size the canvas to what was actually
  // placed. Deriving it from the radii instead would pad for a full ellipse even
  // when the ring only uses part of one — a single peer would sit in a box wide
  // enough for six. The ring opens at -90°, so peer 0 is directly above.
  const at = [[0, 0]]; // the hub
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    at.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  const half = [VAULT.W / 2, VAULT.H / 2];
  const bound = (axis) => {
    const lo = Math.min(...at.map((p) => p[axis] - half[axis]));
    const hi = Math.max(...at.map((p) => p[axis] + half[axis]));
    return [lo, hi - lo];
  };
  const [minX, spanX] = bound(0);
  const [minY, spanY] = bound(1);
  const boxW = Math.round(spanX + 2 * VAULT.PAD);
  const boxH = Math.round(spanY + 2 * VAULT.PAD);
  // Origin-relative → canvas pixels.
  const put = (p) => [p[0] - minX + VAULT.PAD, p[1] - minY + VAULT.PAD];

  // Positions are pixel centres. `self` and the repo's real name both map to the
  // hub because a link may name this repo either way.
  const hub = put(at[0]);
  const pos = { [d.self]: hub, self: hub };
  d.nodes.forEach((node, i) => {
    pos[node.name] = put(at[i + 1]);
  });

  // A ring big enough not to collide can be wider than the panel. That is a
  // scroll, not a reason to squeeze the boxes back together.
  const scroll = el("div", "scroll-x");
  const wrap = el("div", "vault");
  wrap.style.width = boxW + "px";
  wrap.style.height = boxH + "px";

  const svg = svgEl("svg", { class: "vault-edges", viewBox: `0 0 ${boxW} ${boxH}` });
  d.links.forEach((l, i) => {
    // `from`/`to` may name this repo either as the literal "self" or by its
    // real name — the config accepts both, so the position map holds both.
    const a = pos[l.from];
    const b = pos[l.to];
    if (!a || !b) return; // an edge naming a repo that is not in the graph
    const g = svgEl("g", { class: "vault-edge", "data-a": l.from, "data-b": l.to });
    g.style.setProperty("--d", i * 140 + "ms");
    // The canvas is a known pixel size, so the viewBox is 1:1 with it and the
    // endpoints go straight in — no measuring pass, and no stretched viewBox
    // squashing the labels and strokes.
    const ends = { x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1), pathLength: "1" };
    g.append(svgEl("line", { ...ends, class: "vault-line" }));
    // The pulse runs from → to, which IS the direction of the dependency.
    g.append(svgEl("line", { ...ends, class: "vault-pulse" }));
    if (l.via) {
      // Nudged off the line so the label sits beside it, not on top of it.
      const label = svgEl("text", {
        class: "vault-via",
        x: ((a[0] + b[0]) / 2).toFixed(1),
        y: ((a[1] + b[1]) / 2 - 8).toFixed(1),
        "text-anchor": "middle",
      });
      label.textContent = l.via;
      g.append(label);
    }
    svg.append(g);
  });
  wrap.append(svg);

  const place = (node, p, i) => {
    node.style.left = p[0].toFixed(1) + "px";
    node.style.top = p[1].toFixed(1) + "px";
    node.style.setProperty("--d", i * 90 + "ms");
    wrap.append(node);
  };

  const self = el("div", "vault-node vault-hub");
  self.append(el("span", "vault-name", d.self), el("span", "vault-sub", t("crosslink.design.thisRepo")));
  place(self, pos[d.self], 0);

  d.nodes.forEach((node, i) => {
    const box = el("button", "vault-node vault-" + (node.direction || "none"));
    box.type = "button";
    box.dataset.name = node.name;
    box.append(el("span", "vault-name", node.name));
    box.append(el("span", "vault-sub", node.repo_path));
    const pv = node.provider || {};
    // The chip carries the CLI's own state word, so the picture and `orc
    // crosslink list` always say the same thing.
    const state =
      pv.state === "missing" ? ["missing", "bad"] :
      pv.state === "no-wiki" ? ["no wiki", "warn"] :
      pv.state === "unregistered" ? ["unregistered", "warn"] :
      pv.state === "corrupt" ? ["corrupt", "bad"] :
      node.direction === "provide" ? ["inbound", ""] :
      [pv.tier || "linked", pv.tier === "FRESH" ? "ok" : pv.tier === "AGING" ? "warn" : "bad"];
    box.append(chip(state[0], state[1]));
    box.title = `${node.name} — ${node.repo_path}`;

    // Hovering a repo lights the edges it is an end of, so a busy ring can still
    // be read one repo at a time.
    const hi = (onOff) => {
      box.classList.toggle("vault-hi", onOff);
      for (const g of svg.querySelectorAll(".vault-edge")) {
        if (g.dataset.a === node.name || g.dataset.b === node.name) g.classList.toggle("edge-hi", onOff);
        else g.classList.toggle("edge-dim", onOff);
      }
    };
    box.addEventListener("mouseenter", () => hi(true));
    box.addEventListener("mouseleave", () => hi(false));
    box.addEventListener("focus", () => hi(true));
    box.addEventListener("blur", () => hi(false));
    // Clicking a repo is a question about that repo — the answer (its state, its
    // kinds, the Remove button) lives on the Settings tab, so go there.
    box.addEventListener("click", () => {
      const tab = document.querySelector('.tabs button[data-tab="settings"]');
      if (!tab) return;
      tab.click();
      setTimeout(() => {
        const row = document.querySelector('.action[data-node="' + node.name + '"]');
        if (!row) return;
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("linked-hi");
        setTimeout(() => row.classList.remove("linked-hi"), 1600);
      }, 120);
    });
    place(box, pos[node.name], i + 1);
  });

  scroll.append(wrap);
  c.append(scroll);
  return c;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  return node;
}

// The add form. It mirrors the interactive CLI prompt field for field, and it
// submits to the CLI rather than writing YAML — so the errors shown here are
// the CLI's own, not a second opinion about what is valid.
async function addLinkCard(d, body) {
  const c = card(t("crosslink.add.title"));
  c.append(el("div", "note", t("crosslink.add.note")));

  const form = el("div", "linkform");
  const mk = (labelText, node, hint) => {
    // `label` wraps its control, and a label that CONTAINS a button steals that
    // button's click — so the path row (input + Browse) is a plain div instead.
    const f = el(node.dataset && node.dataset.nolabel ? "div" : "label", "field");
    f.append(el("span", "field-label", labelText));
    f.append(node);
    if (hint) f.append(el("span", "field-hint", hint));
    return f;
  };

  const name = el("input", "text-input");
  name.placeholder = "service-z";

  // THE PATH FIELD (v0.43.6). A hand-typed path is the one field here whose
  // mistakes are invisible: the CLI accepts an unresolvable path on purpose
  // (it saves a PENDING edge that resolves later), so a typo does not fail —
  // it just silently never links. The Browse button removes the typo entirely.
  // It is still a plain text input: browsing is an ADDITION, never the only
  // way in, and pasting a path you already know stays the fastest route.
  const repoPath = el("input", "text-input");
  repoPath.placeholder = "../service-z";
  const pathRow = el("div", "path-row");
  pathRow.dataset.nolabel = "1";
  const browse = el("button", "btn btn-sm", t("crosslink.add.browse"));
  browse.type = "button";
  browse.addEventListener("click", () =>
    pickFolder((rel) => {
      repoPath.value = rel;
      syncCmd();
    })
  );
  pathRow.append(repoPath, browse);

  // The catalog comes from the CLI so the picker can never drift from it.
  let kinds = [];
  try {
    kinds = (await read("/api/crosslink/kinds")).data.kinds || [];
  } catch (_) {}
  const kindBox = el("div", "kind-picker");
  const picked = new Set();
  for (const k of kinds) {
    const b = el("button", "kind", k);
    b.type = "button";
    b.addEventListener("click", () => {
      if (picked.has(k)) picked.delete(k);
      else picked.add(k);
      b.classList.toggle("kind-on", picked.has(k));
      syncVia();
    });
    kindBox.append(b);
  }
  const custom = el("input", "text-input");
  custom.placeholder = t("crosslink.add.customHint");

  const dirSeg = el("div", "seg");
  let direction = "calls";
  const self = d.self || "this repo";
  const dirs = [
    ["calls", t("crosslink.add.dirCalls", { self })],
    ["called-by", t("crosslink.add.dirCalledBy", { self })],
  ];
  for (const [val, label] of dirs) {
    const b = el("button", null, label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(val === direction));
    b.addEventListener("click", () => {
      direction = val;
      for (const other of dirSeg.children) other.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-pressed", "true");
    });
    dirSeg.append(b);
  }

  const via = el("select", "text-input");
  const syncVia = () => {
    const all = [...picked, ...custom.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)];
    via.replaceChildren();
    for (const k of [...new Set(all)]) {
      const o = el("option", null, k);
      o.value = k;
      via.append(o);
    }
    via.disabled = !all.length;
  };
  custom.addEventListener("input", syncVia);
  syncVia();

  form.append(
    mk(t("crosslink.add.name"), name, t("crosslink.add.nameHint")),
    mk(t("crosslink.add.path"), pathRow, t("crosslink.add.pathHint")),
    mk(t("crosslink.add.kinds"), kindBox, t("crosslink.add.kindsHint")),
    mk(t("crosslink.add.custom"), custom),
    mk(t("crosslink.add.direction"), dirSeg, t("crosslink.add.directionHint")),
    mk(t("crosslink.add.via"), via, t("crosslink.add.viaHint"))
  );
  c.append(form);

  const err = el("div", "input-err");
  const actions = el("div", "row-actions");
  const save = el("button", "btn btn-primary", t("crosslink.add.save"));
  save.type = "button";
  const cmdPreview = el("code", "action-cmd", "");
  const syncCmd = () => {
    const all = [...picked, ...custom.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)];
    cmdPreview.textContent =
      `orc crosslink add ${name.value || "<name>"} ${repoPath.value || "<path>"} ` +
      `--kinds ${all.join(",") || "<kinds>"} --direction ${direction}` +
      (via.value ? ` --via ${via.value}` : "");
  };
  for (const n of [name, repoPath, custom]) n.addEventListener("input", syncCmd);
  via.addEventListener("change", syncCmd);
  kindBox.addEventListener("click", syncCmd);
  dirSeg.addEventListener("click", syncCmd);
  syncCmd();

  save.addEventListener("click", async () => {
    err.textContent = "";
    const all = [...picked, ...custom.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)];
    // Only the empties are caught here. Everything about VALIDITY — the slug
    // shape, a taken name, an unknown target — is the CLI's call, reported below.
    if (!name.value.trim() || !repoPath.value.trim() || !all.length) {
      err.textContent = t("crosslink.add.required");
      return;
    }
    save.disabled = true;
    save.textContent = t("crosslink.add.saving");
    try {
      const r = await post("/api/crosslink/add", {
        name: name.value.trim(),
        repo_path: repoPath.value.trim(),
        kinds: all.join(","),
        direction,
        via: via.value || all[0],
      });
      if (!r.ok) {
        // The CLI's own rejection text wins over ours whenever there is one.
        err.textContent = r.output || t("crosslink.add.refused");
        save.disabled = false;
        save.textContent = t("crosslink.add.save");
        return;
      }
      toast(t("crosslink.add.linked", { name: name.value.trim() }), "ok", r.output);
      await renderCrosslink(body);
      // The new node draws itself in — the one moment where motion is the
      // feedback that the link now exists.
      const fresh = document.querySelector('.graph-node[data-name="' + name.value.trim() + '"]');
      if (fresh) fresh.classList.add("graph-new");
    } catch (e) {
      err.textContent = String(e.message);
      save.disabled = false;
      save.textContent = t("crosslink.add.save");
    }
  });
  actions.append(save);
  c.append(cmdPreview, err, actions);
  return c;
}

/* --- the folder picker ------------------------------------------------------
   A browser cannot hand back a real filesystem path — `<input type="file"
   webkitdirectory>` gives a folder NAME and nothing above it, which is exactly
   the part a relative repo path needs. So the picker walks the filesystem on
   the SERVER (`/api/fs/list`, directory names only) and the browser just
   renders it. That also makes it identical on Windows and macOS: the server
   knows the real separator and computes the stored relative path itself, so
   nothing here has to guess whether to write `..\peer` or `../peer`.

   It never picks a FILE and never opens one. `onPick` receives the relative
   path the crosslink config will store — the same string you would have typed. */
function pickFolder(onPick) {
  const body = el("div", "stack stack-sm");
  const crumbs = el("div", "picker-crumbs");
  const listBox = el("div", "picker-list");
  const foot = el("div", "picker-foot");
  const relLine = el("div", "note");
  body.append(crumbs, listBox, relLine, foot);

  let current = null; // the listing payload for the folder on screen

  const choose = el("button", "btn btn-primary btn-allow-busy", t("picker.choose"));
  choose.type = "button";
  choose.disabled = true;

  const go = async (path) => {
    listBox.replaceChildren(skeleton(6));
    let d;
    try {
      d = (await read("/api/fs/list" + (path ? "?path=" + encodeURIComponent(path) : ""))).data;
    } catch (e) {
      listBox.replaceChildren(empty(t("picker.unreadable"), String(e.message)));
      return;
    }
    current = d;

    // Breadcrumbs: the shortcuts you actually want (up, home, this project)
    // rather than a clickable path split on the separator, which on Windows is
    // a row of one-letter targets.
    crumbs.replaceChildren();
    const crumb = (label, target, disabled) => {
      const b = el("button", "btn btn-ghost btn-sm", label);
      b.type = "button";
      b.disabled = !target || disabled;
      b.addEventListener("click", () => go(target));
      return b;
    };
    crumbs.append(crumb("↑ " + t("picker.up"), d.parent));
    crumbs.append(crumb(t("picker.home"), d.home));
    if (d.project_root) crumbs.append(crumb(t("picker.project"), d.project_root));
    crumbs.append(el("code", "picker-path", d.path));

    listBox.replaceChildren();
    if (d.error) {
      listBox.append(empty(t("picker.unreadable"), d.error));
    } else if (!d.dirs.length) {
      listBox.append(empty(t("picker.empty")));
    } else {
      for (const dir of d.dirs) {
        const row = el("button", "picker-item");
        row.type = "button";
        row.append(el("span", "picker-icon", dir.is_repo ? "◆" : "▸"));
        const mid = el("div");
        mid.append(el("div", "picker-name", dir.name));
        const tags = el("div", "picker-tags");
        // The two facts that decide whether linking this folder is useful.
        if (dir.is_repo) tags.append(chip(t("picker.isRepo"), "info"));
        if (dir.has_wiki) tags.append(chip(t("picker.hasWiki"), "ok"));
        if (d.project_root && dir.path === d.project_root) tags.append(chip(t("picker.sameRepo"), "warn"));
        mid.append(tags);
        row.append(mid, el("span", "picker-into", "→"));
        // Single click NAVIGATES into the folder; "Use this folder" selects the
        // one you are standing in. One gesture per meaning, so a click never
        // both descends and commits.
        row.addEventListener("click", () => go(dir.path));
        listBox.append(row);
      }
    }

    const isSelf = d.is_project_root;
    choose.disabled = !!d.error || isSelf;
    relLine.textContent = d.error
      ? ""
      : isSelf
      ? t("picker.sameRepo")
      : t("picker.relative", { rel: d.relative });
    relLine.classList.toggle("picker-warn", isSelf);
  };

  choose.addEventListener("click", () => {
    if (!current || current.is_project_root) return;
    onPick(current.relative);
    close();
  });
  foot.append(choose);

  const close = modal({
    title: t("picker.title"),
    body,
    actions: [{ label: t("common.cancel"), onClick: (c) => c() }],
  });
  body.insertBefore(el("div", "note", t("picker.note")), crumbs);
  // Start one level ABOVE the project: a linked repo is almost always a sibling.
  go(metaInfo.project_root ? metaInfo.project_root + "/.." : "");
  return close;
}

function confirmRemove(name, body) {
  const b = el("div");
  b.append(el("div", null, t("crosslink.remove.body", { name })));
  b.append(el("div", "note", t("crosslink.remove.note")));
  b.append(el("div", "action-cmd", `orc crosslink remove ${name}`));
  const close = modal({
    title: t("crosslink.remove.title"),
    body: b,
    actions: [
      { label: t("common.cancel"), onClick: (c) => c() },
      {
        label: t("common.remove"),
        cls: "btn-danger",
        onClick: async (c) => {
          const r = await post("/api/crosslink/remove", { name });
          toast(r.command, r.ok ? "ok" : "bad", r.output);
          c();
          renderCrosslink(body);
        },
      },
    ],
  });
  return close;
}

/* =================================================================== LEARN == */

/* ONE THING AT A TIME (v0.43.6).
   This panel used to stack all eight walkthrough sections as eight boxes of
   monospace text, every one of them open. That is the whole document dumped on
   screen: nothing is emphasised, so nothing is read, and finding the section
   you wanted meant scrolling through the seven you did not.

   A walkthrough has a natural shape — it is ORDERED, and you are at a position
   in it. So the panel now shows a CONTENTS rail and exactly one section, with
   Previous / Next, a progress bar, and a search that filters the rail rather
   than the page. The content is unchanged: it is the same `bin/onboarding-
   content.js` the terminal prints, which is the point — one source, two
   surfaces.

   Where you are is remembered per browser, so switching panels and coming back
   does not restart the walkthrough. */

const LEARN_POS_KEY = "orc-ui-learn-pos";

PANELS.learn = function (host) {
  head(host, t("learn.title"), t("learn.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderLearn(body);
};

async function renderLearn(body) {
  body.replaceChildren(skeleton(6));
  let d;
  try {
    d = (await read("/api/learn")).data;
  } catch (e) {
    body.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const sections = d.sections || [];
  if (!sections.length) {
    body.replaceChildren(empty(t("common.loadFail")));
    return;
  }

  let idx = 0;
  try {
    const saved = Number(localStorage.getItem(LEARN_POS_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved < sections.length) idx = saved;
  } catch (_) {}

  const wrap = el("div", "learn");

  /* --- the contents rail ---------------------------------------------- */
  const side = el("aside", "learn-side");
  const sideHead = el("div", "learn-side-head", t("learn.contents"));
  const search = el("input", "text-input");
  search.type = "search";
  search.placeholder = t("learn.search");
  const navList = el("div", "learn-nav");
  const searchResult = el("div", "learn-result");
  side.append(sideHead, search, navList, searchResult);

  const navItems = sections.map((s, i) => {
    const b = el("button", "learn-nav-item");
    b.type = "button";
    b.append(el("span", "learn-num", String(i + 1)));
    // The section title is content, shipped in onboarding-content.js — the same
    // text the terminal prints. Never translated here.
    b.append(el("span", "learn-nav-title", stripLeadingGlyph(s.title)));
    b.addEventListener("click", () => goTo(i));
    navList.append(b);
    return b;
  });

  /* --- the reading pane ------------------------------------------------ */
  const pane = el("div", "learn-pane");
  const progress = el("div", "learn-progress");
  const bar = el("div", "learn-progress-fill");
  progress.append(bar);
  const meta = el("div", "learn-meta");
  const title = el("h2", "learn-title");
  const article = el("div", "learn-article");
  const foot = el("div", "learn-foot");

  const prev = el("button", "btn btn-sm", t("learn.prev"));
  prev.type = "button";
  prev.addEventListener("click", () => goTo(idx - 1));
  // Next is wired through `onclick` ONLY, and re-assigned by paint(): on the
  // last section it wraps to the start instead of advancing. An addEventListener
  // here as well would leave two live handlers, and both read the same mutable
  // `idx` — so one click would advance twice.
  const next = el("button", "btn btn-sm btn-primary", t("learn.next"));
  next.type = "button";
  const copyBtn = el("button", "btn btn-ghost btn-sm", t("learn.copySection"));
  copyBtn.type = "button";
  copyBtn.addEventListener("click", () => copy(sections[idx].lines.join("\n"), t("learn.copied")));

  foot.append(prev, next, copyBtn);
  pane.append(progress, meta, title, article, foot);
  wrap.append(side, pane);
  body.replaceChildren(wrap);

  function goTo(i) {
    if (i < 0 || i >= sections.length) return;
    idx = i;
    try {
      localStorage.setItem(LEARN_POS_KEY, String(idx));
    } catch (_) {}
    paint();
  }

  function paint() {
    const s = sections[idx];
    navItems.forEach((b, i) => {
      b.setAttribute("aria-current", i === idx ? "true" : "false");
      b.classList.toggle("learn-seen", i < idx);
    });
    bar.style.width = ((idx + 1) / sections.length) * 100 + "%";
    meta.textContent = t("learn.progress", { n: idx + 1, total: sections.length });
    title.textContent = stripLeadingGlyph(s.title);
    article.replaceChildren(renderLearnBody(s.lines));
    // Re-trigger the section-swap animation on every move.
    article.style.animation = "none";
    void article.offsetHeight;
    article.style.animation = "";
    prev.disabled = idx === 0;
    next.textContent = idx === sections.length - 1 ? t("learn.restart") : t("learn.next");
    next.onclick = () => goTo(idx === sections.length - 1 ? 0 : idx + 1);
    // The rail scrolls itself so the current item is always visible, which
    // matters once the rail is taller than the viewport.
    navItems[idx].scrollIntoView({ block: "nearest" });
  }

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let hits = 0;
    sections.forEach((s, i) => {
      const hit = !q || (s.title + " " + s.lines.join(" ")).toLowerCase().includes(q);
      navItems[i].classList.toggle("hidden", !hit);
      if (hit) hits++;
    });
    searchResult.textContent = q ? (hits ? tn(hits, "learn.matches") : t("learn.noMatch")) : "";
    searchResult.classList.toggle("toolbar-result-none", !!q && !hits);
    // A search with exactly one hit jumps to it — the obvious next click.
    if (q && hits === 1) {
      const only = sections.findIndex((s) => (s.title + " " + s.lines.join(" ")).toLowerCase().includes(q));
      if (only >= 0 && only !== idx) goTo(only);
    }
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) {
      e.stopPropagation();
      search.value = "";
      search.dispatchEvent(new Event("input"));
    }
  });

  paint();
}

// The onboarding titles carry a circled number ("① What ORC is") because a
// terminal has no other way to show order. The rail already numbers every item,
// so the glyph would be shown twice.
function stripLeadingGlyph(s) {
  return String(s || "").replace(/^[①-⑳⓪]\s*/, "");
}

/* The walkthrough is plain text written for a terminal, and it stays plain
   text — nothing here is parsed as markup. What the panel adds is TYPOGRAPHY:
   an indented line that starts with `orc ` or `/orc` is a command, so it is
   rendered as a click-to-copy chip; a blank line becomes a paragraph break; a
   line that is a bullet keeps its shape. Everything else is prose. */
function renderLearnBody(lines) {
  const out = frag();
  let para = null;
  const flush = () => {
    if (para && para.childNodes.length) out.append(para);
    para = null;
  };

  for (const raw of lines) {
    const line = String(raw);
    if (!line.trim()) {
      flush();
      continue;
    }
    const cmd = line.match(/^\s{2,}((?:orc|claude)\s+\S.*?|\/orc[\w-]*)(?:\s{2,}(.*))?$/);
    if (cmd) {
      flush();
      const row = el("div", "learn-cmd-row");
      const chipBtn = el("button", "learn-cmd", cmd[1].trim());
      chipBtn.type = "button";
      chipBtn.title = t("common.copy");
      chipBtn.addEventListener("click", () => copy(cmd[1].trim(), cmd[1].trim()));
      row.append(chipBtn);
      if (cmd[2]) row.append(el("span", "learn-cmd-what", cmd[2].trim()));
      out.append(row);
      continue;
    }
    if (/^\s*[•·]/.test(line)) {
      flush();
      out.append(el("div", "learn-bullet", line.replace(/^\s*[•·]\s*/, "")));
      continue;
    }
    // A pipeline / diagram line is centred monospace, not prose.
    if (/[→←]/.test(line) && line.trim().length < 100) {
      flush();
      out.append(el("div", "learn-flowline", line.trim()));
      continue;
    }
    if (!para) para = el("p", "learn-para");
    if (para.childNodes.length) para.append(document.createTextNode(" "));
    para.append(document.createTextNode(line.trim()));
  }
  flush();
  const hint = el("div", "note learn-hint", t("learn.cmdHint"));
  out.append(hint);
  return out;
}

/* ======================================================= MOCKED SKILL USE == */
/*
   Every lane, written out as a run you can read before you pay for one: what
   you type, what ORC prints back, what lands on disk. The whole point is that
   nobody should have to spend tokens to find out what a command looks like.

   THE SAME RULE AS THE FLOW STEPPER: the catalogue is DERIVED by
   `bin/mockrun-catalog.js` — groups, reading order, lane names, summaries — and
   this panel renders it and decides none of it. A second idea of the order (or
   of which doc belongs to which lane) is exactly the drift the panel exists to
   make impossible. Everything that arrives in the payload is CLI-side data, so
   nothing in it is ever passed through `t()`.

   Markdown is rendered to real DOM nodes, never assigned as HTML: `renderMd`
   builds elements and every piece of text goes in through `textContent`. These
   files ship inside the package, but "it is our own file" is not a reason to
   parse it as markup.
*/

const MOCKRUN_KEY = "orc-ui-mockrun-doc";

PANELS.mockrun = function (host) {
  head(host, t("mockrun.title"), t("mockrun.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderMockrun(body);
};

async function renderMockrun(body) {
  body.replaceChildren(skeleton(5));
  let d;
  try {
    d = (await read("/api/mockruns")).data;
  } catch (e) {
    body.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const groups = (d && d.groups) || [];
  const docs = (d && d.docs) || [];
  if (!docs.length) {
    body.replaceChildren(empty(t("mockrun.none"), t("mockrun.noneHint")));
    return;
  }

  // `open` is a slug or null (null = the gallery). Remembered per browser so
  // coming back to the panel returns you to what you were reading.
  let open = null;
  try {
    const saved = localStorage.getItem(MOCKRUN_KEY);
    if (saved && docs.some((x) => x.slug === saved)) open = saved;
  } catch (_) {}

  const wrap = el("div", "mock");

  /* --- the contents rail ------------------------------------------------ */
  const side = el("aside", "mock-side");
  const sideHead = el("div", "mock-side-head", t("mockrun.contents"));
  const search = el("input", "text-input");
  search.type = "search";
  search.placeholder = t("mockrun.search");
  const navList = el("div", "mock-nav");
  const searchResult = el("div", "learn-result");
  side.append(sideHead, search, navList, searchResult);

  const navItems = new Map();
  for (const g of groups) {
    // Group titles come from the CLI. They are content, not panel prose.
    navList.append(el("div", "mock-nav-group", g.title));
    for (const doc of g.docs) {
      const b = el("button", "mock-nav-item");
      b.type = "button";
      b.append(el("span", "mock-nav-title", doc.lane || doc.title));
      if (doc.kind === "annotated") b.append(el("span", "mock-nav-tag", t("mockrun.kindAnnotated")));
      b.addEventListener("click", () => show(doc.slug));
      navList.append(b);
      navItems.set(doc.slug, b);
    }
  }

  /* --- the pane --------------------------------------------------------- */
  const pane = el("div", "mock-pane");
  wrap.append(side, pane);
  body.replaceChildren(wrap);

  function mark() {
    for (const [slug, b] of navItems) b.setAttribute("aria-current", slug === open ? "true" : "false");
  }

  // Re-run the pane's entrance animation on every swap, the same way the Learn
  // panel does — without it, switching document reads as a content flicker.
  function replay() {
    pane.style.animation = "none";
    void pane.offsetHeight;
    pane.style.animation = "";
  }

  function gallery() {
    open = null;
    try {
      localStorage.removeItem(MOCKRUN_KEY);
    } catch (_) {}
    mark();
    const out = frag();

    const intro = el("div", "note mock-intro");
    intro.append(document.createTextNode(t("mockrun.intro", { n: docs.length })));
    out.append(intro);

    for (const g of groups) {
      const sec = el("section", "mock-group");
      sec.append(el("h2", "mock-group-head", g.title));
      const grid = el("div", "mock-grid");
      g.docs.forEach((doc, i) => {
        const c = el("button", "mock-card");
        c.type = "button";
        // The stagger is a CSS custom property so reduced motion's blanket
        // `animation-delay: 0ms !important` still wins over it.
        c.style.setProperty("--i", String(Math.min(i, 8)));
        const top = el("div", "mock-card-top");
        top.append(el("span", "mock-card-lane", doc.lane || doc.title));
        if (doc.kind === "annotated") top.append(chip(t("mockrun.kindAnnotated")));
        c.append(top);
        c.append(el("div", "mock-card-sum", doc.summary));
        c.append(el("div", "mock-card-foot", tn(doc.lines, "mockrun.lines")));
        c.addEventListener("click", () => show(doc.slug));
        grid.append(c);
      });
      sec.append(grid);
      out.append(sec);
    }
    pane.replaceChildren(out);
    replay();
  }

  async function show(slug) {
    open = slug;
    try {
      localStorage.setItem(MOCKRUN_KEY, slug);
    } catch (_) {}
    mark();
    pane.replaceChildren(skeleton(6));
    let doc;
    try {
      doc = (await read("/api/mockrun?slug=" + encodeURIComponent(slug))).data;
    } catch (e) {
      pane.replaceChildren(empty(t("common.loadFail"), String(e.message)));
      return;
    }
    if (!doc || !doc.found) {
      pane.replaceChildren(empty(t("mockrun.missing", { slug })));
      return;
    }

    const out = frag();

    const back = el("button", "btn btn-ghost btn-sm mock-back", t("mockrun.back"));
    back.type = "button";
    back.addEventListener("click", gallery);
    out.append(back);

    const h = el("div", "mock-doc-head");
    h.append(el("h2", "mock-doc-title", doc.title));
    const meta = el("div", "mock-doc-meta");
    // The lane is a command you type, so it is printed as one — a chip would
    // uppercase it, and `/ORC-GRILL` is not a command that exists.
    if (doc.lane) meta.append(el("span", "mock-doc-lane", doc.lane));
    meta.append(el("span", "mock-doc-path", doc.path));
    meta.append(el("span", "mock-doc-lines", tn(doc.lines, "mockrun.lines")));
    h.append(meta);
    out.append(h);

    const article = el("article", "mock-article");
    article.append(renderMd(doc.body, { title: doc.title, docs, open: show }));
    out.append(article);

    // Reading order is the catalogue's order, so "next" means the next thing
    // the index would have you read — not the next file alphabetically.
    const idx = docs.findIndex((x) => x.slug === doc.slug);
    const foot = el("div", "mock-doc-foot");
    const prev = docs[idx - 1];
    const next = docs[idx + 1];
    if (prev) {
      const b = el("button", "btn btn-sm", "← " + (prev.lane || prev.title));
      b.type = "button";
      b.addEventListener("click", () => show(prev.slug));
      foot.append(b);
    }
    const cmd = el("button", "btn btn-ghost btn-sm", t("mockrun.copyCmd"));
    cmd.type = "button";
    cmd.addEventListener("click", () => copy("orc mock-run show " + doc.slug, "orc mock-run"));
    foot.append(cmd);
    if (next) {
      const b = el("button", "btn btn-sm btn-primary", (next.lane || next.title) + " →");
      b.type = "button";
      b.addEventListener("click", () => show(next.slug));
      foot.append(b);
    }
    out.append(foot);

    pane.replaceChildren(out);
    replay();
    pane.scrollTop = 0;
  }

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let hits = 0;
    for (const doc of docs) {
      const hay = (doc.slug + " " + doc.title + " " + (doc.lane || "") + " " + doc.summary).toLowerCase();
      const hit = !q || hay.includes(q);
      navItems.get(doc.slug).classList.toggle("hidden", !hit);
      if (hit) hits++;
    }
    // A group whose every item is filtered out keeps an orphan heading.
    for (const gh of navList.querySelectorAll(".mock-nav-group")) {
      let n = gh.nextElementSibling;
      let any = false;
      while (n && !n.classList.contains("mock-nav-group")) {
        if (!n.classList.contains("hidden")) any = true;
        n = n.nextElementSibling;
      }
      gh.classList.toggle("hidden", !!q && !any);
    }
    searchResult.textContent = q ? (hits ? tn(hits, "mockrun.matches") : t("mockrun.noMatch")) : "";
    searchResult.classList.toggle("toolbar-result-none", !!q && !hits);
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) {
      e.stopPropagation();
      search.value = "";
      search.dispatchEvent(new Event("input"));
    }
  });

  if (open) show(open);
  else gallery();
}

/* --- markdown → DOM -------------------------------------------------------
   Small on purpose: headings, fenced code, tables, quotes, lists, rules and
   paragraphs — the shapes the mocked runs actually use. Anything it does not
   recognise stays as text, which is the correct failure: an unrendered line is
   readable, a swallowed one is not.

   A link to another `.md` in the catalogue becomes a button that opens that
   document here. A link that resolves to nothing renders as its text, never as
   a dead link. */
function renderMd(md, opts) {
  const o = opts || {};
  const lines = String(md || "").split(/\r?\n/);
  const out = frag();
  let i = 0;
  let skippedTitle = false;

  const isTableRow = (s) => /^\s*\|.*\|\s*$/.test(s || "");
  const isDivider = (s) => /^\s*\|?[\s:|-]{3,}\|?\s*$/.test(s || "") && (s || "").includes("-");

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code. The fence language is ignored — none of these documents are
    // syntax-highlighted, and a wrong highlight is worse than none.
    const fence = line.match(/^\s*```/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; // the closing fence
      const box = el("div", "md-codebox");
      const pre = el("pre", "md-code", buf.join("\n"));
      const b = el("button", "copy-btn md-code-copy", t("common.copy").toLowerCase());
      b.type = "button";
      b.addEventListener("click", () => copy(buf.join("\n"), t("mockrun.codeBlock")));
      box.append(pre, b);
      out.append(box);
      continue;
    }

    // Table: a row, then a divider row.
    if (isTableRow(line) && isDivider(lines[i + 1])) {
      const cells = (s) =>
        s
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const table = el("table", "md-table");
      const thead = el("thead");
      const hr = el("tr");
      for (const c of cells(line)) {
        const th = el("th");
        inline(th, c, o);
        hr.append(th);
      }
      thead.append(hr);
      table.append(thead);
      i += 2;
      const tbody = el("tbody");
      while (i < lines.length && isTableRow(lines[i])) {
        const tr = el("tr");
        for (const c of cells(lines[i])) {
          const td = el("td");
          inline(td, c, o);
          tr.append(td);
        }
        tbody.append(tr);
        i++;
      }
      table.append(tbody);
      const scroller = el("div", "md-tablewrap");
      scroller.append(table);
      out.append(scroller);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      // The pane already prints the document title above the article.
      if (h[1].length === 1 && !skippedTitle) {
        skippedTitle = true;
        i++;
        continue;
      }
      const level = Math.min(h[1].length + 1, 5);
      const node = el("h" + level, "md-h md-h" + h[1].length);
      inline(node, h[2], o);
      out.append(node);
      i++;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      out.append(el("hr", "md-hr"));
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      const q = el("blockquote", "md-quote");
      inline(q, buf.join(" "), o);
      out.append(q);
      continue;
    }

    const bullet = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const ordered = /\d/.test(bullet[2]);
      const list = el(ordered ? "ol" : "ul", "md-list");
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) {
          // A wrapped continuation line belongs to the item above it.
          if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && list.lastChild) {
            list.lastChild.append(document.createTextNode(" "));
            inline(list.lastChild, lines[i].trim(), o);
            i++;
            continue;
          }
          break;
        }
        const li = el("li", "md-li md-li-" + Math.min(2, Math.floor(m[1].length / 2)));
        inline(li, m[3], o);
        list.append(li);
        i++;
      }
      out.append(list);
      continue;
    }

    // Paragraph: consecutive plain lines, rewrapped by the box rather than by
    // the file's own 78-column hard wrap (the changelog lesson, v0.44.1).
    //
    // THE FIRST LINE IS TAKEN UNCONDITIONALLY, and that is load-bearing: this
    // is the fall-through branch, so a line the branches above declined but the
    // condition below also rejects (a stray `| … |` row with no divider under
    // it, say) would leave `i` exactly where it was — an infinite loop that
    // hangs the panel on one malformed line. Always consume one, then extend.
    const buf = [lines[i++].trim()];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|#{1,6}\s|>|---|\*\*\*|___)/.test(lines[i]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !isTableRow(lines[i])
    )
      buf.push(lines[i++].trim());
    const p = el("p", "md-p");
    inline(p, buf.join(" "), o);
    out.append(p);
  }
  return out;
}

// Inline markup: `code`, **bold**, and links. Everything else is text.
function inline(parent, text, opts) {
  const o = opts || {};
  const src = String(text || "");
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) parent.append(document.createTextNode(src.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith("`")) parent.append(el("code", "md-code-inline", tok.slice(1, -1)));
    else if (tok.startsWith("**")) parent.append(el("strong", null, tok.slice(2, -2)));
    else {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      // `nolink` is the recursion stop: a link LABEL gets the same inline pass
      // (so `[`orc mock-run`](…)` is not printed with its backticks) but can
      // never contain another link to descend into.
      if (o.nolink) parent.append(document.createTextNode(lm[1]));
      else parent.append(link(lm[1], lm[2], o));
    }
    last = re.lastIndex;
  }
  if (last < src.length) parent.append(document.createTextNode(src.slice(last)));
}

function link(text, href, o) {
  const label = (node) => {
    inline(node, text, Object.assign({}, o, { nolink: true }));
    return node;
  };
  if (/^https?:\/\//i.test(href)) {
    const a = label(el("a", "md-link"));
    a.href = href;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    return a;
  }
  // A relative link into the catalogue opens in this panel. Resolution is by
  // the target's own tail, so `orc-pact.md` and
  // `../templates/skills/orc-mini/examples/mini-run-mock.md` both land.
  const docs = o.docs || [];
  const tail = href.split("#")[0].replace(/^\.\//, "");
  const base = tail.split("/").pop();
  const hit =
    docs.find((d) => d.path.endsWith(tail.replace(/^(\.\.\/)+/, ""))) ||
    docs.find((d) => d.slug + ".md" === base) ||
    docs.find((d) => d.path.endsWith("/" + base));
  if (hit && o.open) {
    const b = label(el("button", "md-doclink"));
    b.type = "button";
    b.title = hit.title;
    b.addEventListener("click", () => o.open(hit.slug));
    return b;
  }
  // Nothing to open: the words stay, the link does not. A dead link in a panel
  // that cannot browse a repository is a promise it cannot keep.
  return label(el("span", "md-link-flat"));
}

/* ============================================================== EXPERIMENT == */

// The one place this panel touches AI at all — and it does so by getting out of
// the way. It opens a terminal with `claude` in this repo and forgets about it.
// No lane output ever comes back here; there is nothing to stream, cancel or
// watch. If the launch fails, the command is on screen to copy, which is the
// same thing the panel is for on a machine where it works.
PANELS.experiment = function (host) {
  head(host, t("experiment.title"), t("experiment.sub"));
  section(
    host,
    () => read("/api/experiment").then((r) => r.data),
    (d) => {
      const out = frag();

      const launch = card(t("experiment.start"));
      launch.append(el("div", "note", t("experiment.startNote")));
      launch.append(kvList([[t("experiment.project"), d.project_root]], true));

      const row = el("div", "row-actions");
      const go = el("button", "btn btn-primary", t("experiment.launch"));
      go.type = "button";
      if (!d.can_launch) {
        go.disabled = true;
        go.title = t("experiment.fixtureTitle");
      }
      go.addEventListener("click", async () => {
        go.disabled = true;
        go.textContent = t("experiment.opening");
        try {
          const r = await post("/api/experiment/launch", {});
          toast(r.ok ? t("experiment.opened", { cwd: r.cwd }) : t("experiment.openFail"), r.ok ? "ok" : "bad");
        } catch (e) {
          toast(t("experiment.openFail"), "bad", String(e.message) + "\n" + t("experiment.openFailHint", { root: d.project_root }));
        }
        go.disabled = false;
        go.textContent = t("experiment.launch");
      });
      row.append(go);
      if (!d.can_launch) row.append(el("span", "note", t("experiment.fixtureNote")));
      launch.append(row);
      out.append(launch);

      // EXPANDED by default (v0.43.6). It shipped collapsed to keep the launch
      // button above the fold, and that cost more than it saved: the lanes are
      // the reason to look at this panel at all, and a collapsed section has
      // ZERO height — so the first-run tour, which points at `.lane-list`, was
      // drawing a spotlight ring around nothing. A section the tour teaches
      // must be a section the tour can see.
      const list = el("div", "lane-list");
      for (const l of d.lanes) {
        const item = el("div", "lane");
        const left = el("div");
        // Lane command and blurb are the server's catalog — untranslated.
        left.append(el("div", "lane-cmd", l.cmd));
        left.append(el("div", "setting-desc", l.what));
        const cp = el("button", "btn btn-sm", t("common.copy"));
        cp.type = "button";
        cp.addEventListener("click", () => copy(l.cmd, l.cmd));
        item.append(left, cp);
        list.append(item);
      }
      out.append(
        collapsible({
          title: t("experiment.lanes"),
          count: t("experiment.lanesCount", { n: d.lanes.length }),
          desc: t("experiment.lanesDesc"),
          content: list,
          collapsed: false,
        })
      );

      return out;
    }
  );
};

/* ============================================================= MAINTENANCE == */

// The most safety-critical panel, and the governing idea is one sentence: every
// destructive action already has a read-only preview in the CLI, so the UI shows
// the preview and makes you approve it — it never fires blind.
//   - Preview is a SEPARATE request from apply; apply is disabled until one has
//     been fetched and rendered in this session.
//   - The exact command is always visible. Close the browser and type it.
//   - Prune names EVERY file. A count is not consent for a deletion.
//   - Single-flight: the whole UI goes read-only while a job runs.
//   - Never automatic. No fix-on-load, no background repair, no nag that runs.

PANELS.maintenance = function (host) {
  head(host, t("maintenance.title"), t("maintenance.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderMaintenance(body);
};

async function renderMaintenance(body) {
  body.replaceChildren(skeleton(5));
  const d = (await read("/api/maintenance")).data;
  const out = frag();

  out.append(el("div", "banner", t("maintenance.banner")));

  // ADVANCED is a section, not a disclaimer (v0.44.0). Everything above targets
  // THIS project; everything in the box below reaches outside it. The global
  // update lives there because a stale global install is a failure this panel
  // already reports and, until now, could only tell you to fix in a terminal.
  const advanced = card(t("maintenance.advanced"));
  advanced.id = "maintenance-advanced";
  advanced.append(el("div", "note", t("maintenance.advancedNote")));
  let anyAdvanced = false;

  for (const a of d.actions) {
    const row = el("div", "action");
    row.dataset.action = a.id; // the upgrade spotlight anchors on this
    const left = el("div");
    // Action id, label and command are the server's catalog — the label
    // describes an exact CLI invocation, so it is shown as written.
    left.append(el("div", "setting-name", a.id));
    left.append(el("div", "setting-desc", a.label));
    left.append(el("div", "action-cmd", a.command));
    if (a.network) left.append(el("div", "note", t("maintenance.network")));

    // `upgrade` is the one action whose whole point is a comparison, so it says
    // what it would actually do BEFORE you preview it — and offers to check
    // again, because "up to date" is only as old as the last check.
    if (a.id === "upgrade") {
      const status = el("div", "action-status");
      status.append(el("span", "note", t("maintenance.checking")));
      left.append(status);
      const paint = (v) => {
        const s = versionState(v);
        status.replaceChildren();
        status.append(chip(s.label, s.kind), el("span", "note", s.note));
        const again = el("button", "btn btn-ghost btn-sm btn-allow-busy", t("maintenance.checkAgain"));
        again.type = "button";
        again.addEventListener("click", () => {
          status.replaceChildren(el("span", "note", t("common.checking")));
          refreshVersion().then(paint).catch(() => status.replaceChildren(el("span", "note", t("maintenance.checkFailed"))));
        });
        status.append(again);
      };
      versionInfo().then(paint).catch(() => status.replaceChildren(el("span", "note", t("maintenance.couldNotCheck"))));
    }

    if (a.advanced) left.append(el("div", "note", t("maintenance.globalNote")));

    const btn = el("button", "btn btn-sm", t("maintenance.preview"));
    btn.type = "button";
    btn.addEventListener("click", () => previewAction(a.id, body));
    row.append(left, btn);
    if (a.advanced) {
      anyAdvanced = true;
      advanced.append(row);
    } else {
      out.append(row);
    }
  }

  if (anyAdvanced) out.append(advanced);

  const job = card(t("maintenance.lastRun"));
  job.id = "job-card";
  out.append(job);
  body.replaceChildren(out);
  refreshJob();
}

async function previewAction(action, body) {
  const d = (await read("/api/maintenance/preview?action=" + encodeURIComponent(action))).data;
  const b = el("div");

  b.append(el("div", null, d.label));
  b.append(el("div", "action-cmd", d.command));
  b.append(el("div", "note", t("maintenance.previewFrom", { command: d.preview_command })));

  // The one action that writes outside this project says so before it runs, and
  // the preview it is showing came from the SAME target — `orc doctor --global`,
  // not the project doctor.
  if (d.advanced) {
    const g = el("div", "banner");
    g.append(el("div", null, t("maintenance.globalWarn")));
    b.append(g);
  }

  // Guard 1 — a run is mid-flight. Updating changes the skills that run will
  // resume into. The CLI has no idea you are mid-run; this panel does.
  let ackWaiting = !d.waiting_runs.length;
  if (d.waiting_runs.length) {
    const warn = el("div", "banner banner-bad");
    const inner = el("div");
    inner.append(el("strong", null, t("maintenance.waitingRuns", { n: d.waiting_runs.length })));
    inner.append(el("div", null, t("maintenance.waitingBody", { slugs: d.waiting_runs.join(", ") })));
    const lbl = el("label", "note");
    const cb = el("input");
    cb.type = "checkbox";
    cb.addEventListener("change", () => {
      ackWaiting = cb.checked;
      syncApply();
    });
    lbl.append(cb, document.createTextNode(" " + t("maintenance.waitingAck")));
    inner.append(lbl);
    warn.append(inner);
    b.append(warn);
  }

  // Guard 2 — a dirty working tree before an upgrade is worth a warning
  // BEFORE, not a surprise after.
  if (d.dirty_tree) {
    const warn = el("div", "banner");
    warn.append(el("div", null, t("maintenance.dirtyTree")));
    b.append(warn);
  }

  const pv = d.preview || {};
  if (action === "upgrade") {
    b.append(
      kvList([
        [t("maintenance.installed"), pv.version],
        [t("maintenance.available"), pv.latest || t("maintenance.availableUnknown")],
        [t("maintenance.source"), pv.install_spec],
        [t("maintenance.updateAvailable"), pv.update_available ? t("maintenance.yes") : t("maintenance.no")],
      ])
    );
    b.append(el("div", "note", t("maintenance.upgradeNote")));
  } else {
    const findings = pv.findings || [];
    b.append(
      kvList([
        [t("maintenance.installedPayload"), pv.installed_version],
        [t("maintenance.thisCli"), pv.package_version],
        [t("maintenance.findings"), String(findings.length)],
      ])
    );
    if (!findings.length) b.append(el("div", "note", t("maintenance.healthy")));
    for (const f of findings) {
      const line = el("div", "note");
      line.append(
        chip(f.fixable ? t("overview.doctor.fixable") : t("overview.doctor.manual"), f.fixable ? "info" : "warn"),
        document.createTextNode(" " + f.message)
      );
      b.append(line);
    }
    // A count is NOT consent for a deletion — name every file.
    if (d.names_files) {
      const paths = findings.filter((f) => f.id === "orphan" || f.id === "orphan-candidates").flatMap((f) => f.paths || []);
      const c = el("div");
      c.append(el("div", "note", paths.length ? t("maintenance.wouldDelete", { n: paths.length }) : t("maintenance.wouldDeleteNone")));
      if (paths.length) {
        const fl = el("div", "file-list");
        for (const p of paths) fl.append(el("div", null, p));
        c.append(fl);
      }
      b.append(c);
    }
  }

  let applyBtn = null;
  const syncApply = () => {
    if (applyBtn) applyBtn.disabled = !ackWaiting;
  };

  const actions = [{ label: t("common.cancel"), onClick: (c) => c() }];
  if (action === "upgrade")
    actions.push({
      label: t("maintenance.checkOnly"),
      onClick: () => toast(t("maintenance.checkOnlyDone"), "ok"),
    });
  actions.push({
    label: action === "prune" ? t("maintenance.applyPrune") : action === "upgrade" ? t("maintenance.applyUpgrade") : t("maintenance.apply"),
    cls: action === "prune" || action === "upgrade" ? "btn-danger" : "btn-primary",
    id: "apply-btn",
    disabled: !ackWaiting,
    onClick: async (close) => {
      try {
        await post("/api/maintenance/apply", { action });
        close();
        toast(t("maintenance.started", { command: d.command }), "ok");
        setBusy(true);
        refreshJob();
      } catch (e) {
        toast(t("maintenance.startFail"), "bad", String(e.message));
      }
    },
  });

  modal({ title: t("maintenance.previewTitle", { command: d.command }), body: b, actions });
  applyBtn = document.getElementById("apply-btn");
  syncApply();
}

/* ============================================== PROMISES · BOUNDARY · SELF-SERVE
   (v0.46.0)

   THE LINE, restated because these three panels sit right on it: a FREE action
   gets a button, a PAID action gets a copy-able command. `orc pact check` runs
   the ledger's own cheap proofs and `orc handoff set` edits one graded surface —
   both deterministic, both a button. `/orc-pact`'s reconcile conversation and
   `/orc-boundary`'s evidence pass cost model tokens, so they are commands with
   the reason printed next to them.

   And the second rule, which these panels are the first real test of: the CLI's
   state words are the ONLY state words. HOLDING/DRIFTED/UNCHECKABLE/BROKEN and
   EXECUTE/ESCALATE/REFUSE are rendered verbatim, never softened into a friendlier
   synonym — a second vocabulary is drift no lint can see. test/webui.test.js
   greps this file for the literals that must come from the CLI instead. */

// Worst first, always. A ledger sorted by id buries the one entry that needs a
// decision under four that do not.
const PACT_KIND = { BROKEN: "bad", DRIFTED: "warn", UNCHECKABLE: "warn", HOLDING: "ok" };
const PACT_ORDER_UI = ["BROKEN", "DRIFTED", "UNCHECKABLE", "HOLDING"];

PANELS.pact = function (host) {
  head(host, t("pact.title"), t("pact.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderPact(body);
};

async function renderPact(body) {
  body.replaceChildren(skeleton(5));
  const [pactRes, boundRes, afterRes] = await Promise.all([
    read("/api/pact").catch(() => ({ data: null })),
    read("/api/boundary").catch(() => ({ data: null })),
    read("/api/aftermath").catch(() => ({ data: null })),
  ]);
  const d = pactRes.data;
  const out = frag();

  if (!d || !d.ok || !d.rows || !d.rows.length) {
    const c = card(t("pact.title"));
    c.append(empty(t("pact.none"), t("pact.noneHint")));
    c.append(laneCommand("/orc-pact", t("pact.cmdHarvestWhy")));
    out.append(c);
    body.replaceChildren(out);
    return;
  }

  // --- the summary row, in the CLI's own words
  const sum = card(t("pact.summary"), pactActions(body, d));
  const chips = el("div", "row-actions");
  for (const s of PACT_ORDER_UI) {
    const n = (d.counts || {})[s] || 0;
    if (!n && s !== "HOLDING") continue;
    chips.append(chip(`${n} ${s}`, PACT_KIND[s], s === "BROKEN"));
  }
  sum.append(chips);
  sum.append(kvList([[t("pact.field.ledger"), d.ledger], [t("pact.field.doc"), d.doc]], true));
  if (!d.doc_exists) sum.append(el("div", "note", t("pact.docMissing")));
  sum.append(el("div", "note", t("pact.uncheckableNote")));
  out.append(sum);

  // --- one card per promise, worst state first (the CLI already sorted them)
  for (const r of d.rows) {
    const c = card(null);
    const headRow = el("div", "row-actions");
    headRow.append(chip(r.state, PACT_KIND[r.state], r.state === "BROKEN"));
    headRow.append(el("span", "mono dim", r.id));
    c.append(headRow);
    c.append(el("div", "promise", r.statement));
    c.append(el("div", "note", r.why));

    const rows = [];
    if (r.anchors && r.anchors.length) rows.push([t("pact.field.anchors"), r.anchors.join(", ")]);
    rows.push([t("pact.field.check"), r.check && r.check.ref ? `${r.check.kind} — ${r.check.ref}` : t("pact.field.checkManual")]);
    if (r.origin) rows.push([t("pact.field.origin"), `${r.origin.lane || "?"}${r.origin.run ? " · " + r.origin.run : ""}`]);
    rows.push([t("pact.field.confidence"), r.confidence]);
    if (r.verified_commit) rows.push([t("pact.field.verified"), String(r.verified_commit).slice(0, 10)]);
    c.append(kvList(rows));

    if (r.last_check && r.last_check.status === "fail")
      c.append(el("div", "note bad", t("pact.lastCheckFailed", { at: r.last_check.at })));

    // ALSO FLAGGED BY — three lanes agreeing is the strongest signal ORC can
    // produce, and in a terminal you only ever see one lane at a time. This is
    // the whole reason the panel is worth building.
    const also = alsoFlagged(r, boundRes.data, afterRes.data);
    if (also.length) {
      const box = el("div", "also");
      box.append(el("div", "also-head", t("pact.alsoFlagged")));
      for (const a of also) {
        const line = el("div", "also-row");
        line.append(chip(a.chip, a.kind));
        line.append(el("span", null, a.text));
        if (a.panel) {
          const b = el("button", "btn btn-ghost btn-sm", t("common.open"));
          b.type = "button";
          b.addEventListener("click", () => (location.hash = "#/" + a.panel));
          line.append(b);
        }
        box.append(line);
      }
      c.append(box);
    }

    // A re-check is FREE (it runs the user's own command), so it is a button.
    if (r.check && r.check.ref) {
      const act = el("div", "row-actions");
      const b = el("button", "btn btn-sm", t("pact.recheckOne"));
      b.type = "button";
      b.addEventListener("click", () => confirmPactCheck([r], body));
      act.append(b);
      act.append(el("span", "note", "orc pact check " + r.id));
      c.append(act);
    }
    if (r.history && r.history.length > 1)
      c.append(
        collapsible({
          title: t("pact.history"),
          count: String(r.history.length),
          collapsed: true,
          content: kvList(r.history.map((h) => [h.at, `${h.status} @ ${String(h.commit || "").slice(0, 10)}`])),
        })
      );
    out.append(c);
  }

  out.append(laneCommand("/orc-pact", t("pact.cmdReconcileWhy")));
  body.replaceChildren(out);
}

// The cross-panel agreement line. Deliberately conservative: it only claims an
// overlap it can SEE (a shared file path, a named pact id), never a guess.
function alsoFlagged(row, boundary, after) {
  const out = [];
  const files = (row.anchors || []).map((a) => String(a).split(":")[0]);
  for (const c of (boundary && boundary.cards) || []) {
    if (c.verdict === "EXECUTE") continue;
    if (!files.some((f) => f === c.area || f.startsWith(c.area + "/"))) continue;
    out.push({ chip: c.verdict, kind: c.verdict === "REFUSE" ? "bad" : "warn", text: t("pact.alsoBoundary", { area: c.area }), panel: "boundary" });
  }
  for (const r of (after && after.runs) || [])
    for (const s of r.signals || [])
      if ((s.ids || []).includes(row.id))
        out.push({ chip: r.grade, kind: "warn", text: t("pact.alsoAftermath", { slug: r.slug }), panel: "runs" });
  return out;
}

function pactActions(body, d) {
  const wrap = el("div", "row-actions");
  const drifted = (d.rows || []).filter((r) => (r.state === "DRIFTED" || r.state === "BROKEN") && r.check && r.check.ref);
  if (drifted.length) {
    const b = el("button", "btn btn-sm", tn(drifted.length, "pact.recheckAll"));
    b.type = "button";
    b.addEventListener("click", () => confirmPactCheck(drifted, body));
    wrap.append(b);
  }
  const s = el("button", "btn btn-ghost btn-sm", t("pact.syncDoc"));
  s.type = "button";
  s.addEventListener("click", async () => {
    const r = await post("/api/pact/sync", {});
    toast(r.ok ? t("pact.syncOk") : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
    renderPact(body);
  });
  wrap.append(s);
  return wrap;
}

// A COUNT IS NOT CONSENT: the confirmation names every id it is about to run,
// and shows the exact command.
function confirmPactCheck(rows, body) {
  const b = frag();
  b.append(el("p", null, tn(rows.length, "pact.confirmBody")));
  const list = el("ul", "file-list");
  for (const r of rows) {
    const li = el("li");
    li.append(el("span", "mono", r.id + "  "));
    li.append(el("span", null, r.check.ref));
    list.append(li);
  }
  b.append(list);
  b.append(el("div", "note", t("pact.confirmNote")));
  const cmd = rows.length === 1 ? "orc pact check " + rows[0].id : "orc pact check";
  b.append(el("pre", "cmd", cmd));
  modal({
    title: t("pact.confirmTitle"),
    body: b,
    actions: {
      [t("common.cancel")]: null,
      [t("pact.confirmGo")]: async () => {
        const r = await post("/api/pact/check", rows.length === 1 ? { id: rows[0].id } : {});
        toast(r.ok ? t("pact.checkDone") : t("pact.checkFound"), r.ok ? "ok" : "warn", r.output);
        renderPact(body);
      },
    },
  });
}

/* ------------------------------------------------------------------ BOUNDARY */

const VERDICT_KIND = { EXECUTE: "ok", ESCALATE: "warn", REFUSE: "bad" };

PANELS.boundary = function (host) {
  head(host, t("boundary.title"), t("boundary.sub"));
  section(
    host,
    () => read("/api/boundary").then((r) => r.data),
    (d) => {
      const out = frag();
      if (!d || !d.cards || !d.cards.length) {
        const c = card(t("boundary.title"));
        c.append(empty(t("boundary.none"), t("boundary.noneHint")));
        c.append(laneCommand("/orc-boundary", t("boundary.cmdWhy")));
        out.append(c);
        return out;
      }

      const sum = card(t("boundary.summary"));
      const chips = el("div", "row-actions");
      for (const v of ["EXECUTE", "ESCALATE", "REFUSE"])
        chips.append(chip(`${(d.counts || {})[v] || 0} ${v}`, VERDICT_KIND[v], v === "REFUSE" && d.counts.REFUSE));
      if (d.stale) chips.append(chip(tn(d.stale, "boundary.staleChip"), "warn"));
      sum.append(chips);
      sum.append(el("div", "note", t("boundary.gatesOrc")));
      out.append(sum);

      for (const c of d.cards) {
        const cc = card(null);
        const headRow = el("div", "row-actions");
        // The CLI's exact word, never a friendlier synonym.
        headRow.append(chip(c.verdict || "MALFORMED", c.verdict ? VERDICT_KIND[c.verdict] : "bad"));
        headRow.append(el("span", "mono", c.area));
        if (c.stale) headRow.append(chip(t("boundary.stale"), "warn"));
        cc.append(headRow);

        for (const r of c.reasons || []) cc.append(el("div", "note", r));

        // THE CHECKLIST IS THE PRODUCT. A REFUSE with none is malformed in the
        // lane, so this renders an ERROR — never an empty card that reads as a
        // flat no.
        if (c.verdict === "REFUSE") {
          if (!c.checklist || !c.checklist.length) {
            cc.append(el("div", "note bad", t("boundary.malformedNoChecklist")));
          } else {
            const box = el("div", "checklist");
            box.append(el("div", "checklist-head", t("boundary.wouldMakeYes")));
            for (const item of c.checklist) {
              const row = el("div", "checklist-row");
              row.append(el("span", "checklist-box", "□"));
              row.append(el("span", null, item));
              // A caution routes to the panel that can CLEAR it — the v0.43.6
              // FINDING_ROUTE idea, applied to a checklist item.
              const route = checklistRoute(item);
              if (route) {
                const b = el("button", "btn btn-ghost btn-sm", route.label);
                b.type = "button";
                b.addEventListener("click", () => (location.hash = "#/" + route.panel));
                row.append(b);
              }
              box.append(row);
            }
            cc.append(box);
          }
        }
        if (c.verdict === "ESCALATE")
          cc.append(
            c.escalate_to
              ? el("div", "note", t("boundary.escalateTo", { who: c.escalate_to }))
              : el("div", "note bad", t("boundary.malformedNoWho"))
          );
        for (const m of c.malformed || []) cc.append(el("div", "note bad", m));

        // A STALE card shows the refresh COMMAND, not a button: refreshing it
        // re-runs the four questions, which costs model tokens.
        if (c.stale) cc.append(laneCommand("/orc-boundary " + c.area, tn(c.distance, "boundary.staleWhy")));
        out.append(cc);
      }
      return out;
    }
  );
};

// Only the routes that genuinely clear the item. Everything else gets no button
// at all — a button that lands on a page with no control for the thing is the
// exact defect FINDING_ROUTE was introduced to fix.
function checklistRoute(item) {
  const s = String(item).toLowerCase();
  if (s.includes("pact.md") || s.includes("invariant") || s.includes("promise")) return { panel: "pact", label: t("boundary.route.pact") };
  if (s.includes("pattern") || s.includes("convention")) return { panel: "knowledge", label: t("boundary.route.knowledge") };
  if (s.includes("wiki") || s.includes("document")) return { panel: "knowledge", label: t("boundary.route.knowledge") };
  return null;
}

/* ----------------------------------------------------------------- SELF-SERVE
   This panel changes what `orc ui` IS: until now a config tool for a developer,
   now also a tool for somebody who does not read code, will never open a
   terminal, and may not read English first. It inherits EVERY Maintenance rule
   with no exceptions, and adds one of its own: a RED surface gets NO BUTTON AT
   ALL — not a disabled one. A disabled button invites a support question; a
   reason and a person to ask answers it. */

const GRADE_DOT = { green: "🟢", amber: "🟡", red: "🔴" };
const GRADE_KIND = { green: "ok", amber: "warn", red: "bad" };
// Same rule as COST_UNIT_KEY_OF: full keys, never `"handoff.grade." + g`.
const GRADE_LABEL_KEY = { green: "handoff.grade.green", amber: "handoff.grade.amber", red: "handoff.grade.red" };

PANELS.handoff = function (host) {
  head(host, t("handoff.title"), t("handoff.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderHandoff(body);
};

async function renderHandoff(body) {
  body.replaceChildren(skeleton(5));
  const res = await read("/api/handoff").catch(() => ({ data: null }));
  const d = res.data;
  const out = frag();

  if (!d || !d.surfaces || !d.surfaces.length) {
    const c = card(t("handoff.title"));
    c.append(empty(t("handoff.none"), t("handoff.noneHint")));
    c.append(laneCommand("/orc-handoff", t("handoff.cmdMapWhy")));
    out.append(c);
    body.replaceChildren(out);
    return;
  }

  const sum = card(t("handoff.summary"));
  const chips = el("div", "row-actions");
  for (const g of ["green", "amber", "red"])
    chips.append(chip(`${GRADE_DOT[g]} ${(d.counts || {})[g] || 0}`, GRADE_KIND[g]));
  sum.append(chips);
  sum.append(el("div", "note", t("handoff.gradeExplain")));
  if (!d.write_enabled) sum.append(el("div", "note warn", t("handoff.writesOff")));
  out.append(sum);

  for (const s of d.surfaces) {
    const c = card(null);
    const headRow = el("div", "row-actions");
    headRow.append(chip(`${GRADE_DOT[s.grade]} ${t(GRADE_LABEL_KEY[s.grade])}`, GRADE_KIND[s.grade]));
    headRow.append(el("span", "mono", s.file));
    if (!s.exists) headRow.append(chip(t("handoff.missing"), "bad"));
    c.append(headRow);
    c.append(el("div", "promise", s.what));

    if (s.grade === "red") {
      // NO BUTTON AT ALL. Not a disabled one.
      c.append(el("div", "note bad", t("handoff.redWhy", { why: s.reason || "" })));
      if (s.ask) c.append(el("div", "note", t("handoff.redAsk", { who: s.ask })));
    } else {
      c.append(
        kvList([
          [t("handoff.field.check"), s.check || t("handoff.field.checkManual")],
          [t("handoff.field.undo"), s.revert],
        ])
      );
      if (s.grade === "amber") c.append(el("div", "note warn", t("handoff.amberNote")));
      if (d.write_enabled && s.exists) {
        const act = el("div", "row-actions");
        const b = el("button", "btn btn-sm", t("handoff.change"));
        b.type = "button";
        b.addEventListener("click", () => editSurface(s, body));
        act.append(b);
        c.append(act);
      }
    }
    out.append(c);
  }
  out.append(laneCommand("/orc-handoff", t("handoff.cmdDoWhy")));
  body.replaceChildren(out);
}

// Preview then apply, the undo command BEFORE the write, one mutation at a time,
// the exact command always visible. Every one of these is a Maintenance rule this
// panel inherits rather than re-decides.
function editSurface(s, body) {
  const b = frag();
  b.append(el("p", null, t("handoff.editIntro", { file: s.file })));

  const keyIn = el("input", "input");
  keyIn.type = "text";
  keyIn.placeholder = t("handoff.keyPlaceholder");
  const valIn = el("input", "input");
  valIn.type = "text";
  valIn.placeholder = t("handoff.valuePlaceholder");
  const form = el("div", "form");
  form.append(el("label", null, t("handoff.keyLabel")), keyIn);
  form.append(el("label", null, t("handoff.valueLabel")), valIn);
  b.append(form);
  b.append(el("div", "note", t("handoff.noNewKeys")));

  // The undo command, BEFORE the write. This is the whole consent step.
  const undo = el("div", "undo-box");
  undo.append(el("div", "undo-head", t("handoff.undoFirst")));
  undo.append(el("pre", "cmd", s.revert));
  b.append(undo);

  const cmdBox = el("pre", "cmd", `orc handoff set ${s.id} <key> <value>`);
  b.append(el("div", "note", t("handoff.willRun")));
  b.append(cmdBox);
  const sync = () => {
    cmdBox.textContent = `orc handoff set ${s.id} ${keyIn.value || "<key>"} ${valIn.value || "<value>"}`;
  };
  keyIn.addEventListener("input", sync);
  valIn.addEventListener("input", sync);
  if (s.check) b.append(el("div", "note", t("handoff.thenCheck", { check: s.check })));

  modal({
    title: t("handoff.editTitle", { file: s.file }),
    body: b,
    actions: {
      [t("common.cancel")]: null,
      [t("handoff.applyChange")]: async () => {
        if (!keyIn.value || !valIn.value) return toast(t("handoff.needBoth"), "bad");
        const r = await post("/api/handoff/set", { id: s.id, key: keyIn.value, value: valIn.value });
        // AMBER applies, then shows the manual check as a TASK — never a pass.
        if (r.ok && s.grade === "amber") toast(t("handoff.amberApplied"), "warn", s.check || "");
        else toast(r.ok ? t("handoff.applied") : t("handoff.failed"), r.ok ? "ok" : "bad", r.output);
        renderHandoff(body);
      },
    },
  });
}

/* ================================================================ CHALLENGE = */
/*
   THE PANEL DERIVES NOTHING. Not the state word, not the iteration order, not
   the pass decision, not the convergence numbers, not the expected revision
   path. It draws `orc challenge … --json`. (The Flow-stepper rule: a second
   idea of the pipeline is exactly the drift this panel exists to make
   impossible.)

   THE FREE/PAID LINE, made visible rather than hidden: `lint`, `accept`,
   `rebut`, `report` and copying a prompt are deterministic and cost no model
   tokens, so each is a real BUTTON. Running an ITERATION costs model tokens, so
   it is a copy-able command and there is no route for it at all.
*/

const CH_STATE_KIND = {
  "AWAITING-JUDGE": "info",
  "AWAITING-FIX": "warn",
  "AWAITING-RECHECK": "info",
  PASSED: "ok",
  "STALE-PASS": "warn",
  "MISSING-REVISION": "warn",
  TAMPERED: "bad",
};
// The ONE actionable state gets the ONE attention-seeking animation, and
// nothing else does.
const CH_PULSE = "AWAITING-RECHECK";
const CH_SEV_KIND = { P0: "bad", P1: "warn", P2: "info", P3: "" };
const CH_DIM_KIND = { CHECKED: "ok", "NOT-CHECKED": "warn", "NOT-SELECTED": "" };

PANELS.challenge = function (host) {
  head(host, t("challenge.title"), t("challenge.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderChallenge(body);
};

async function renderChallenge(body) {
  body.replaceChildren(skeleton(5));
  let d;
  try {
    d = (await read("/api/challenge")).data;
  } catch (e) {
    body.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const out = frag();

  if (!d || !d.cycles || !d.cycles.length) {
    const c = card(t("challenge.title"));
    c.append(empty(t("challenge.none"), t("challenge.noneHint")));
    c.append(laneCommand("/orc-challenge", t("challenge.cmdWhy")));
    out.append(c);
    body.replaceChildren(out);
    return;
  }

  const sum = card(t("challenge.summary"));
  const chips = el("div", "row-actions");
  for (const s of Object.keys(CH_STATE_KIND)) {
    const n = d.cycles.filter((c) => c.state === s).length;
    if (!n) continue;
    chips.append(chip(`${n} ${s}`, CH_STATE_KIND[s], s === CH_PULSE));
  }
  sum.append(chips);
  sum.append(el("div", "note", t("challenge.contract")));
  out.append(sum);

  const list = el("div", "run-list ch-list");
  const rows = [];
  const setOpen = (entry, open) => {
    entry.row.classList.toggle("open", open);
    entry.head.setAttribute("aria-expanded", String(open));
    if (open && !entry.loaded) {
      entry.loaded = true;
      loadChallengeDetail(entry.pane, entry.slug, body);
    }
  };
  const collapseAll = (except) => {
    for (const r of rows) if (r.row !== except) setOpen(r, false);
  };

  for (const c of d.cycles) {
    const row = el("div", "run-row");
    const headBtn = el("button", "run-card");
    headBtn.type = "button";
    headBtn.setAttribute("aria-expanded", "false");
    headBtn.append(el("span", "run-caret", "▸"));
    // The CLI's own state words. Never a friendlier synonym.
    headBtn.append(chip(c.state, CH_STATE_KIND[c.state] || "", c.state === CH_PULSE));
    if (c.stalled) headBtn.append(chip(t("challenge.stalledChip"), "warn"));
    if (c.no_template) headBtn.append(chip(t("challenge.noTemplateChip"), "warn"));
    const mid = el("div", "run-mid");
    mid.append(el("div", "run-slug", c.slug));
    mid.append(el("div", "run-where", `${c.kind} · ${tn(c.iterations, "challenge.iterN")}`));
    headBtn.append(mid);
    headBtn.append(el("div", "run-age", c.blocking ? tn(c.blocking, "challenge.blockingN") : t("challenge.noBlocking")));

    const pane = el("div", "run-pane stack stack-sm");
    pane.append(skeleton(4));
    const inner = el("div", "run-body-inner");
    inner.append(pane);
    const fold = el("div", "run-body");
    fold.append(inner);

    const entry = { row, head: headBtn, pane, slug: c.slug, loaded: false };
    rows.push(entry);
    headBtn.addEventListener("click", () => {
      const isOpen = row.classList.contains("open");
      collapseAll(row);
      setOpen(entry, !isOpen);
    });
    row.append(headBtn, fold);
    list.append(row);
  }
  out.append(list);
  out.append(laneCommand("/orc-challenge", t("challenge.cmdWhy")));
  body.replaceChildren(out);
}

// PROGRESSIVE DISCLOSURE, in the order a human reads: the goal, then the state
// and the timeline, then the reader's score and the dimension strip, then the
// findings, then the raw verdict last and collapsed. Nobody should have to
// scroll past a wall of findings to learn what the document was for.
async function loadChallengeDetail(pane, slug, body) {
  let s;
  let show = null;
  let diff = null;
  try {
    s = (await read("/api/challenge/one?slug=" + encodeURIComponent(slug))).data;
    show = (await read("/api/challenge/show?slug=" + encodeURIComponent(slug)).catch(() => ({ data: null }))).data;
    diff = (await read("/api/challenge/diff?slug=" + encodeURIComponent(slug)).catch(() => ({ data: null }))).data;
  } catch (e) {
    pane.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const out = frag();

  // --- 1. the goal block, ABOVE everything. It is the first thing a reader
  //     needs in order to read anything below it.
  const g = card(t("challenge.goalTitle") + "  v" + s.goals.version);
  g.append(
    kvList([
      [t("challenge.field.goal"), s.goals.goal],
      [t("challenge.field.audience"), s.goals.audience],
      [t("challenge.field.done"), s.goals.done_means],
      [t("challenge.field.outOfScope"), (s.goals.out_of_scope || []).join(" · ")],
      [t("challenge.field.context"), (s.goals.context_refs || []).join(" · ")],
    ])
  );
  g.append(el("div", "note", t("challenge.goalNote")));
  out.append(g);

  // --- 2. the state, and its ONE next action
  const st = card(null);
  const stRow = el("div", "row-actions");
  stRow.append(chip(s.state, CH_STATE_KIND[s.state] || "", s.state === CH_PULSE));
  stRow.append(el("span", "note", s.why));
  st.append(stRow);
  st.append(challengeNextAction(s, diff, body));
  out.append(st);

  // --- 3. the timeline (the hero) + the convergence chart
  if (s.convergence && s.convergence.length) {
    const tl = card(t("challenge.timeline"));
    tl.append(challengeTimeline(s));
    tl.append(challengeConvergence(s));
    if (s.stalled) tl.append(el("div", "note bad", t("challenge.stalledNote", { n: s.convergence.length })));
    out.append(tl);
  } else {
    const tl = card(t("challenge.timeline"));
    tl.append(empty(t("challenge.noIterations"), t("challenge.noIterationsHint", { slug: s.slug })));
    out.append(tl);
  }

  // --- 4. the reader's comprehension score — the most legible thing here to a
  //     non-engineer, so it sits high.
  const last = show && show.iterations && show.iterations[0];
  if (last && last.reader) {
    const rc = card(t("challenge.readerTitle"));
    const big = el("div", "ch-score");
    big.append(el("span", "ch-score-num", String(last.reader.score || "—")));
    big.append(el("span", "note", t("challenge.readerSub", { asked: last.reader.asked, answered: last.reader.answered })));
    rc.append(big);
    rc.append(el("div", "note", t("challenge.readerNote")));
    out.append(rc);
  }

  // --- 5. the dimension strip. A NOT-CHECKED chip KEEPS ITS SLOT and carries
  //     its reason; a 0-finding dimension keeps its slot too.
  const dc = card(t("challenge.dimensions"));
  const strip = el("div", "row-actions");
  for (const dim of s.dimensions || []) {
    const label =
      dim.status === "CHECKED"
        ? `${dim.id} ${dim.findings}${dim.score ? " · " + dim.score : ""}`
        : `${dim.id} ${dim.status}`;
    const c = chip(label, CH_DIM_KIND[dim.status] || "");
    if (dim.reason) {
      c.title = dim.reason;
      // A reason on hover only is a reason a screen reader never gets.
      c.setAttribute("aria-label", `${dim.id} ${dim.status} — ${dim.reason}`);
    }
    strip.append(c);
  }
  dc.append(strip);
  dc.append(el("div", "note", t("challenge.dimNote")));
  out.append(dc);

  // --- 6. the findings
  if (last && last.findings && last.findings.length) {
    const fc = card(t("challenge.findings"), challengeReportBtn(slug, body));
    for (const f of last.findings) {
      const box = el("div", "ch-finding");
      const hdr = el("div", "row-actions");
      hdr.append(chip(f.severity, CH_SEV_KIND[f.severity] || ""));
      hdr.append(el("span", "mono dim", f.id));
      hdr.append(chip(f.dimension, ""));
      if (f.outcome) hdr.append(chip(f.outcome, f.outcome === "resolved" ? "ok" : f.outcome === "still-open" ? "warn" : ""));
      if (show.accepted && show.accepted[f.id]) hdr.append(chip(t("challenge.acceptedBadge"), "ok"));
      if (show.rebuttals && show.rebuttals[f.id]) hdr.append(chip(t("challenge.rebuttedBadge"), "info"));
      box.append(hdr);
      box.append(el("div", "ch-anchor mono", f.anchor || "—"));
      if (f.quote) box.append(el("blockquote", "ch-quote", f.quote));
      const rows = [];
      if (f.what_is_wrong) rows.push([t("challenge.field.wrong"), f.what_is_wrong]);
      if (f.consequence) rows.push([t("challenge.field.consequence"), f.consequence]);
      if (f.acceptance_line) rows.push([t("challenge.field.fixedWhen"), f.acceptance_line]);
      if (f.serves) rows.push([t("challenge.field.serves"), f.serves]);
      if (f.superseded_by) rows.push([t("challenge.field.supersededBy"), f.superseded_by]);
      if (f.reason) rows.push([t("challenge.field.reason"), f.reason]);
      box.append(kvList(rows));
      if (show.accepted && show.accepted[f.id])
        box.append(el("div", "note ok", t("challenge.acceptedNote", { reason: show.accepted[f.id].reason })));
      if (show.rebuttals && show.rebuttals[f.id])
        box.append(el("div", "note", t("challenge.rebuttedNote", { reason: show.rebuttals[f.id].reason, status: show.rebuttals[f.id].status })));
      // Both escape valves are FREE, so both are buttons — and both refuse
      // without a reason, which the CLI decides, not this form.
      if (!f.outcome || f.outcome === "still-open") {
        const acts = el("div", "row-actions");
        if (!(show.accepted && show.accepted[f.id]))
          acts.append(challengeValveBtn("accept", slug, f.id, body));
        if (!(show.rebuttals && show.rebuttals[f.id]))
          acts.append(challengeValveBtn("rebut", slug, f.id, body));
        box.append(acts);
      }
      fc.append(box);
    }
    if (last.dropped && last.dropped.length)
      fc.append(el("div", "note", t("challenge.dropped", { n: last.dropped.length, ids: last.dropped.map((x) => x.id).join(", ") })));
    out.append(fc);
  }

  // --- 7. events, collapsed
  if (show && show.events && show.events.length)
    out.append(
      collapsible({
        title: t("challenge.events"),
        count: String(show.events.length),
        collapsed: true,
        content: kvList(show.events.map((e) => [e.at, `${e.kind} — ${e.detail}`])),
      })
    );

  pane.replaceChildren(out);
}

// EVERY STATE ANSWERS "so what do I do now?" — the one next action, inline.
function challengeNextAction(s, diff, body) {
  const wrap = el("div", "stack stack-sm");
  if (s.state === "MISSING-REVISION") {
    wrap.append(el("div", "note bad", t("challenge.missingRevision", { path: s.revision.expected })));
    if (diff && diff.candidates && diff.candidates.length) {
      const ul = el("ul", "file-list");
      for (const c of diff.candidates) {
        const li = el("li");
        li.append(el("span", "mono", c.path));
        li.append(el("span", "note", `  +${c.added} −${c.removed}`));
        ul.append(li);
      }
      wrap.append(ul);
      // It LISTS, it does not adopt. So the panel offers the recorded escape as
      // a COMMAND — picking one for the user is the exact thing the CLI refuses.
      wrap.append(el("div", "note", t("challenge.candidatesNote")));
      wrap.append(el("pre", "cmd", `orc challenge expect ${s.slug} --set <path>`));
    }
    return wrap;
  }
  if (s.state === "TAMPERED") {
    wrap.append(el("div", "note bad", t("challenge.tamperedNote")));
    return wrap;
  }
  if (s.state === "PASSED" || s.state === "STALE-PASS") {
    wrap.append(el("div", "note", s.state === "PASSED" ? t("challenge.passedNote") : t("challenge.stalePassNote")));
    wrap.append(el("pre", "cmd", `git add orc/orc-challenge/${s.slug}/`));
    return wrap;
  }
  if (s.state === "AWAITING-FIX") {
    wrap.append(el("div", "note", t("challenge.awaitingFixNote")));
    wrap.append(challengeCopyPrompt(s));
    return wrap;
  }
  // AWAITING-JUDGE and AWAITING-RECHECK both need a paid run.
  wrap.append(laneCommand(s.next || `/orc-challenge ${s.slug}`, t("challenge.paidWhy")));
  return wrap;
}

// Copying is FREE, so it is a button. The prompt is assembled from the CLI's own
// fields — the expected path, the slug, the frozen goal file — never from a
// second idea of where anything lives.
function challengeCopyPrompt(s) {
  const prompt = [
    `Fix the findings in orc/orc-challenge/${s.slug}/fix-brief.md.`,
    "",
    `Artifact:  ${(s.artifacts[0] || {}).path || ""}`,
    `Goal:      orc/orc-challenge/${s.slug}/goals.md  (read this first)`,
    "",
    `Write the revised version to:  ${s.revision.expected}`,
    "",
    "Rules:",
    "- Change the artifact only. Do not edit anything under orc/orc-challenge/.",
    "- Do not mark findings resolved. The next judgement decides that.",
    "- If you think a finding is wrong, do not argue with it here —",
    `  run: orc challenge rebut ${s.slug} <id> "why"`,
    "",
    "When you are done, start ANOTHER new session and run:",
    `  /orc-challenge ${s.slug}`,
  ].join("\n");
  const box = el("div", "lane-cmd");
  box.append(el("div", "lane-cmd-head", t("challenge.pasteHead")));
  box.append(el("pre", "cmd ch-prompt", prompt));
  const b = el("button", "btn btn-sm", t("challenge.copyPrompt"));
  b.type = "button";
  b.addEventListener("click", () => copy(prompt, t("challenge.copyPrompt")));
  box.append(b);
  return box;
}

function challengeReportBtn(slug, body) {
  const b = el("button", "btn btn-ghost btn-sm", t("challenge.reRender"));
  b.type = "button";
  b.addEventListener("click", async () => {
    const r = await post("/api/challenge/report", { slug });
    toast(r.ok ? t("challenge.reportOk") : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
    renderChallenge(body);
  });
  return b;
}

// KEYS ARE WRITTEN OUT IN FULL, never assembled from a fragment — the i18n rule.
// A dotted key built by concatenation is a key no lint can find and no
// translator can see.
const CH_VALVE = {
  accept: {
    btn: "challenge.acceptBtn",
    title: "challenge.acceptTitle",
    body: "challenge.acceptBody",
    note: "challenge.acceptNote",
    go: "challenge.acceptGo",
    ok: "challenge.acceptOk",
    route: "/api/challenge/accept",
  },
  rebut: {
    btn: "challenge.rebutBtn",
    title: "challenge.rebutTitle",
    body: "challenge.rebutBody",
    note: "challenge.rebutNote",
    go: "challenge.rebutGo",
    ok: "challenge.rebutOk",
    route: "/api/challenge/rebut",
  },
};

// A COUNT IS NOT CONSENT, and neither is a click: a reason is mandatory, and the
// exact command is on screen the whole time — the CLI refuses without one too,
// so this form has no second idea of what a valid acceptance is.
function challengeValveBtn(which, slug, id, body) {
  const K = CH_VALVE[which];
  const b = el("button", "btn btn-ghost btn-sm", t(K.btn));
  b.type = "button";
  b.addEventListener("click", () => {
    const wrap = frag();
    wrap.append(el("p", null, t(K.body, { id })));
    const input = el("input", "text-input");
    input.type = "text";
    input.placeholder = t("challenge.reasonPlaceholder");
    wrap.append(input);
    const cmd = el("pre", "cmd", `orc challenge ${which} ${slug} ${id} "…"`);
    wrap.append(cmd);
    wrap.append(el("div", "note", t(K.note)));
    const m = modal({
      title: t(K.title),
      body: wrap,
      actions: {
        [t("common.cancel")]: null,
        [t(K.go)]: async () => {
          const reason = input.value.trim();
          if (!reason) return toast(t("challenge.needReason"), "bad");
          const r = await post(K.route, { slug, id, reason });
          toast(r.ok ? t(K.ok) : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
          renderChallenge(body);
        },
      },
    });
    input.addEventListener("input", () => {
      cmd.textContent = `orc challenge ${which} ${slug} ${id} "${input.value || "…"}"`;
    });
    requestAnimationFrame(() => input.focus());
    return m;
  });
  return b;
}

/* THE ITERATION TIMELINE — the hero.

   GEOMETRY IS SOLVED FROM THE BOX SIZE, never expressed as a fraction of the
   container (the VAULT / ringRadii lesson from Crosslink): a node box is a fixed
   size, the rail is the bounding box of what was PLACED, and too many iterations
   SCROLLS rather than being squeezed. A `regoal` or `retemplate` draws a VERSION
   BREAK, because a comparison across one is not a comparison. */
const CH_NODE = { W: 92, H: 62, GAP: 30, PAD: 16, BREAK: 22 };

function challengeTimeline(s) {
  const iters = s.convergence || [];
  const box = el("div", "ch-rail-wrap");
  // Where a version break falls: between iteration i-1 and i, when either frozen
  // yardstick's version number changed.
  const breakBefore = iters.map((it, i) =>
    i === 0 ? false : it.graded_against !== iters[i - 1].graded_against || it.graded_against_goal !== iters[i - 1].graded_against_goal
  );
  const xs = [];
  let x = CH_NODE.PAD;
  for (let i = 0; i < iters.length; i++) {
    if (breakBefore[i]) x += CH_NODE.BREAK;
    xs.push(x);
    x += CH_NODE.W + CH_NODE.GAP;
  }
  const width = (xs.length ? xs[xs.length - 1] + CH_NODE.W : 0) + CH_NODE.PAD;
  const height = CH_NODE.H + 2 * CH_NODE.PAD + 18;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ch-rail");
  // The canvas is the bounding box of what was PLACED, and it keeps its aspect:
  // a stretched viewBox squashes every label and every stroke.
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("challenge.timelineAria", { n: iters.length }));

  const mk = (name, attrs, text) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const k of Object.keys(attrs)) n.setAttribute(k, String(attrs[k]));
    if (text !== undefined) n.textContent = text;
    return n;
  };

  for (let i = 0; i < iters.length; i++) {
    const it = iters[i];
    const cx = xs[i];
    const cy = CH_NODE.PAD;
    if (i > 0) {
      const prevEnd = xs[i - 1] + CH_NODE.W;
      svg.append(mk("line", { x1: prevEnd, y1: cy + CH_NODE.H / 2, x2: cx, y2: cy + CH_NODE.H / 2, class: "ch-rail-link" }));
      if (breakBefore[i]) {
        const bx = (prevEnd + cx) / 2;
        svg.append(mk("line", { x1: bx, y1: cy - 6, x2: bx, y2: cy + CH_NODE.H + 6, class: "ch-rail-break" }));
        svg.append(mk("text", { x: bx, y: cy + CH_NODE.H + 18, class: "ch-rail-breaklabel", "text-anchor": "middle" }, `v${it.graded_against_goal}`));
      }
    }
    const g = mk("g", { class: "ch-rail-node" + (it.passed ? " pass" : " fail"), style: `animation-delay:${i * 40}ms` });
    g.append(mk("rect", { x: cx, y: cy, width: CH_NODE.W, height: CH_NODE.H, rx: 10, class: "ch-rail-box" }));
    g.append(mk("text", { x: cx + CH_NODE.W / 2, y: cy + 24, class: "ch-rail-n", "text-anchor": "middle" }, String(it.n)));
    g.append(
      mk("text", { x: cx + CH_NODE.W / 2, y: cy + 44, class: "ch-rail-verdict", "text-anchor": "middle" }, it.passed ? "PASS" : `FAIL ${it.blocking}`)
    );
    svg.append(g);
  }
  box.append(svg);
  return box;
}

/* THE CONVERGENCE CHART — blocking findings per iteration, stacked by severity,
   the same visual family as the budget cost bar. THIS IS THE PAYOFF PICTURE: you
   can see a cycle converging, or not. It draws left to right on open, once,
   because the SHAPE of the trend is the information. */
function challengeConvergence(s) {
  const iters = s.convergence || [];
  const wrap = el("div", "ch-conv");
  const max = Math.max(1, ...iters.map((i) => ["P0", "P1", "P2", "P3"].reduce((n, k) => n + ((i.severities || {})[k] || 0), 0)));
  for (const it of iters) {
    const rowEl = el("div", "ch-conv-row");
    rowEl.append(el("span", "ch-conv-n", String(it.n)));
    const bar = el("div", "ch-conv-bar");
    for (const sev of ["P0", "P1", "P2", "P3"]) {
      const n = (it.severities || {})[sev] || 0;
      if (!n) continue;
      const seg = el("div", "ch-conv-seg ch-sev-" + sev.toLowerCase());
      seg.style.setProperty("--w", ((n / max) * 100).toFixed(2) + "%");
      seg.title = `${sev} ${n}`;
      bar.append(seg);
    }
    rowEl.append(bar);
    rowEl.append(el("span", "ch-conv-blocking", String(it.blocking)));
    wrap.append(rowEl);
  }
  wrap.append(el("div", "note", t("challenge.convNote")));
  return wrap;
}

/* A paid action is a COMMAND, never a button. This renders one, with the reason
   it is not a button — making the boundary visible rather than hiding it. */
function laneCommand(cmd, why) {
  const box = el("div", "lane-cmd");
  box.append(el("div", "lane-cmd-head", t("common.runInClaude")));
  const row = el("div", "row-actions");
  row.append(el("pre", "cmd", cmd));
  const b = el("button", "btn btn-ghost btn-sm", t("common.copy"));
  b.type = "button";
  b.addEventListener("click", () => copy(cmd, cmd));
  row.append(b);
  box.append(row);
  if (why) box.append(el("div", "note", why));
  return box;
}

/* ==================================================================== DOCS == */
/*
   THE PANEL DERIVES NOTHING. Not the section order, not a line range, not a
   state word, not the batching, not a lint rule name, not the completion
   verdict. It draws `orc doc … --json`. (The Flow-stepper rule: a second idea
   of the pipeline is exactly the drift this panel exists to make impossible.)

   THE FREE/PAID LINE, visible rather than hidden: `list`, `status`, `map`,
   `lint`, `plan` and `assemble` are deterministic and cost no model tokens, so
   each is a real BUTTON. Writing a section, checking a range and editing one all
   cost model tokens, so they are copy-able commands and there is no route for
   any of them.

   AND IT IS A PLAN PREVIEW, NOT A LIVE MONITOR. The server cannot see a running
   session, so the wave card says so in one line. Claiming live status would be
   this panel's first lie.
*/

// The five section states the CLI can emit. The panel may KEY on one — a colour,
// a marker, an action — but never invent one.
const DOC_STATE_KIND = {
  planned: "",
  written: "ok",
  checked: "ok",
  "user-edited": "info",
  open: "warn",
};

PANELS.docs = function (host) {
  head(host, t("docs.title"), t("docs.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderDocs(body);
};

async function renderDocs(body) {
  body.replaceChildren(skeleton(5));
  let d;
  try {
    d = (await read("/api/doc")).data;
  } catch (e) {
    body.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const out = frag();

  // An empty list is an ANSWER, not a gap: it renders the command that starts
  // one, never a spinner and never a "nothing here" shrug.
  if (!d || !d.documents || !d.documents.length) {
    const c = card(t("docs.title"));
    c.append(empty(t("docs.none"), t("docs.noneHint")));
    c.append(laneCommand("/orc-doc", t("docs.cmdWhy")));
    out.append(c);
    body.replaceChildren(out);
    return;
  }

  const sum = card(t("docs.summary"));
  const chips = el("div", "row-actions");
  chips.append(chip(tn(d.documents.length, "docs.docN"), "info"));
  const edited = d.documents.reduce((a, x) => a + (x.user_edited || []).length, 0);
  if (edited) chips.append(chip(tn(edited, "docs.editedN"), "info"));
  sum.append(chips);
  sum.append(el("div", "note", t("docs.contract")));
  out.append(sum);

  // One row open at a time, detail fetched on first open — the Runs-panel rule.
  // There is no detail box below the list.
  const list = el("div", "run-list doc-list");
  const rows = [];
  const setOpen = (entry, open) => {
    entry.row.classList.toggle("open", open);
    entry.head.setAttribute("aria-expanded", String(open));
    if (open && !entry.loaded) {
      entry.loaded = true;
      loadDocDetail(entry.pane, entry.slug, body);
    }
  };
  const collapseAll = (except) => {
    for (const r of rows) if (r.row !== except) setOpen(r, false);
  };

  for (const doc of d.documents) {
    const row = el("div", "run-row");
    const headBtn = el("button", "run-card");
    headBtn.type = "button";
    headBtn.setAttribute("aria-expanded", "false");
    headBtn.append(el("span", "run-caret", "▸"));
    // The CLI's own words. `not started` is the CLI's phrase for a document with
    // no document.md, and it is never softened into "failed" or "empty".
    headBtn.append(chip(doc.document, doc.document === "present" ? "ok" : ""));
    if ((doc.user_edited || []).length) headBtn.append(chip(t("docs.editedChip"), "info"));
    const mid = el("div", "run-mid");
    mid.append(el("div", "run-slug", doc.title || doc.slug));
    mid.append(el("div", "run-where", `${String(doc.type).toUpperCase()} · ${doc.slug}`));
    headBtn.append(mid);
    headBtn.append(
      el("div", "run-age", `${doc.sections_written}/${doc.sections_total}`)
    );

    const pane = el("div", "run-pane stack stack-sm");
    pane.append(skeleton(4));
    const inner = el("div", "run-body-inner");
    inner.append(pane);
    const fold = el("div", "run-body");
    fold.append(inner);

    const entry = { row, head: headBtn, pane, slug: doc.slug, loaded: false };
    rows.push(entry);
    headBtn.addEventListener("click", () => {
      const isOpen = row.classList.contains("open");
      collapseAll(row);
      setOpen(entry, !isOpen);
    });
    row.append(headBtn, fold);
    list.append(row);
  }
  out.append(list);
  out.append(laneCommand("/orc-doc", t("docs.cmdWhy")));
  body.replaceChildren(out);
}

// PROGRESSIVE DISCLOSURE, in the order a human reads it: the shape of the whole
// document first (the ribbon), then what is wrong with it, then the sections,
// then the plan, then the history.
async function loadDocDetail(pane, slug, body) {
  let s;
  let map = null;
  let lint = null;
  let plan = null;
  let show = null;
  const q = "?slug=" + encodeURIComponent(slug);
  try {
    s = (await read("/api/doc/one" + q)).data;
    map = (await read("/api/doc/map" + q).catch(() => ({ data: null }))).data;
    lint = (await read("/api/doc/lint" + q).catch(() => ({ data: null }))).data;
    plan = (await read("/api/doc/plan" + q + "&role=write").catch(() => ({ data: null }))).data;
    show = (await read("/api/doc/show" + q).catch(() => ({ data: null }))).data;
  } catch (e) {
    pane.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const out = frag();
  const sections = (map && map.sections) || [];

  // --- 1. the state line, and the ONE next action
  const st = card(null);
  const stRow = el("div", "row-actions");
  stRow.append(chip(s.state, s.state === "complete" ? "ok" : s.state === "not-started" ? "" : "info"));
  stRow.append(el("span", "note", s.where));
  st.append(stRow);
  st.append(docNextAction(s, body));
  out.append(st);

  // --- 2. THE RIBBON. The one picture this panel is for.
  if (sections.length) {
    const rc = card(t("docs.ribbon"), docFreeActions(slug, body));
    rc.append(docRibbon(sections, (id) => docOpenSection(pane, id)));
    rc.append(docRibbonLegend());
    out.append(rc);
  }

  // --- 3. health — straight from the lint. The CLI's words are the only words.
  //     `ok: false` is the CLI answering "there is no document yet", which is a
  //     real state and not a card with empty numbers in it.
  if (lint && lint.ok !== false) {
    const hc = card(t("docs.health"));
    hc.append(docHealth(lint));
    out.append(hc);
  }

  // --- 4. the sections
  if (sections.length) {
    const sc = card(t("docs.sections"));
    sc.append(docSectionList(sections, slug, show));
    sc.append(el("div", "note", t("docs.sectionsNote")));
    out.append(sc);
  }

  // --- 5. the wave preview
  if (plan && plan.waves && plan.waves.length) {
    const wc = card(t("docs.waves"));
    wc.append(el("div", "note", t("docs.wavesNote")));
    wc.append(docWaves(plan));
    if (plan.clamped) wc.append(el("div", "note bad", t("docs.clamped", { from: plan.clamped.from, to: plan.clamped.to })));
    if ((plan.oversized || []).length)
      wc.append(el("div", "note bad", t("docs.oversized", { ids: plan.oversized.join(", ") })));
    out.append(wc);
  }

  // --- 6. the cycles, last. History is not an action.
  if (show && show.cycles && show.cycles.length) {
    out.append(
      collapsible({
        title: t("docs.cycles"),
        count: String(show.cycles.length),
        collapsed: true,
        content: kvList(show.cycles.map((c) => [`${c.at}`, `${t("docs.cycleN", { n: c.n })} · ${c.kind} · ${tn(c.agents, "docs.agentN")}`])),
      })
    );
  }

  pane.replaceChildren(out);
}

// EVERY STATE ANSWERS "so what do I do now?".
function docNextAction(s, body) {
  const wrap = el("div", "stack stack-sm");
  if ((s.user_edited || []).length)
    wrap.append(el("div", "note", t("docs.editedNote", { names: s.user_edited.map((x) => x.heading).join(" · ") })));
  if ((s.open_sections || []).length)
    wrap.append(el("div", "note warn", t("docs.openNote", { names: s.open_sections.map((x) => x.heading).join(" · ") })));
  if (s.state === "complete") {
    wrap.append(el("div", "note ok", t("docs.completeNote")));
    wrap.append(el("pre", "cmd", `git add ${s.document}`));
    wrap.append(el("div", "note", t("docs.challengeNote")));
    wrap.append(el("pre", "cmd", `/orc-challenge ${s.document}`));
    return wrap;
  }
  wrap.append(laneCommand(s.resume, t("docs.paidWhy")));
  return wrap;
}

// The free actions. A refetch of a deterministic read is a BUTTON; so is
// `assemble`, which only concatenates files already on disk in an order the
// outline already fixed.
function docFreeActions(slug, body) {
  const row = el("div", "row-actions");
  const relint = el("button", "btn btn-ghost btn-sm", t("docs.reLint"));
  relint.type = "button";
  relint.addEventListener("click", () => renderDocs(body));
  row.append(relint);
  const asm = el("button", "btn btn-ghost btn-sm", t("docs.assemble"));
  asm.type = "button";
  asm.addEventListener("click", () => {
    const b = frag();
    b.append(el("p", null, t("docs.assembleBody")));
    // The exact command is ALWAYS on screen, so it is always typeable by hand
    // instead — the Maintenance rule, applied to the one free write here.
    b.append(el("pre", "cmd", `orc doc assemble ${slug}`));
    b.append(el("div", "note", t("docs.assembleNote")));
    modal({
      title: t("docs.assembleTitle"),
      body: b,
      actions: [
        { label: t("common.cancel"), onClick: (close) => close() },
        {
          label: t("docs.assembleGo"),
          onClick: async (close) => {
            close();
            const r = await post("/api/doc/assemble", { slug });
            toast(r.ok ? t("docs.assembleOk") : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
            renderDocs(body);
          },
        },
      ],
    });
  });
  row.append(asm);
  return row;
}

/* THE RIBBON — each section is a segment whose width is proportional to its line
   count, coloured by its state. In one glance: how long the document is, where
   the weight sits, what is still open, what the user edited, and where the
   findings are.

   GEOMETRY IS SOLVED FROM THE BOX SIZE, never expressed as a fraction of the
   container (the VAULT / ringRadii lesson): a segment is `lines × PX` with a
   floor that keeps a 3-line section clickable, the canvas is the bounding box of
   what was PLACED, and a document too long for the panel SCROLLS rather than
   being squeezed into unreadable slivers. */
const DOC_RIBBON = { H: 34, MIN: 14, PX: 1.6, GAP: 2, PAD: 8, LABEL: 16 };

function docRibbon(sections, onPick) {
  const wrap = el("div", "doc-ribbon-wrap");
  const widths = sections.map((s) => Math.max(DOC_RIBBON.MIN, Math.round((s.lines || 1) * DOC_RIBBON.PX)));
  const xs = [];
  let x = DOC_RIBBON.PAD;
  for (const w of widths) {
    xs.push(x);
    x += w + DOC_RIBBON.GAP;
  }
  const width = x - DOC_RIBBON.GAP + DOC_RIBBON.PAD;
  const height = DOC_RIBBON.H + DOC_RIBBON.LABEL + 2 * DOC_RIBBON.PAD;

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "doc-ribbon");
  // The canvas keeps its aspect: a stretched `preserveAspectRatio="none"` viewBox
  // squashes every label and every stroke.
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("docs.ribbonAria", { n: sections.length }));

  const mk = (name, attrs, text) => {
    const n = document.createElementNS(NS, name);
    for (const k of Object.keys(attrs)) n.setAttribute(k, String(attrs[k]));
    if (text !== undefined) n.textContent = text;
    return n;
  };

  sections.forEach((s, i) => {
    const w = widths[i];
    const g = mk("g", {
      class: "doc-seg doc-seg-" + s.state.replace(/[^a-z-]/g, "") + (s.findings ? " has-findings" : ""),
      style: `animation-delay:${i * 26}ms`,
      tabindex: "0",
      role: "button",
    });
    g.append(mk("rect", { x: xs[i], y: DOC_RIBBON.PAD, width: w, height: DOC_RIBBON.H, rx: 4, class: "doc-seg-box" }));
    // A findings marker is STATIC. A blinking error is a reduced-motion hazard
    // and reads as an urgency this panel has no right to imply.
    if (s.findings)
      g.append(mk("rect", { x: xs[i], y: DOC_RIBBON.PAD, width: w, height: 3, class: "doc-seg-mark" }));
    if (w >= 22)
      g.append(
        mk(
          "text",
          { x: xs[i] + w / 2, y: DOC_RIBBON.PAD + DOC_RIBBON.H + 12, class: "doc-seg-n", "text-anchor": "middle" },
          String(i + 1)
        )
      );
    // The tooltip repeats the CLI's own numbers and its own state word.
    g.append(
      mk("title", {}, `${s.heading} — ${s.state} · ${s.start}..${s.end} · ${s.lines} L${s.findings ? " · " + s.findings : ""}`)
    );
    const pick = () => onPick(s.id);
    g.addEventListener("click", pick);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
    svg.append(g);
  });

  wrap.append(svg);
  return wrap;
}

function docRibbonLegend() {
  const row = el("div", "row-actions doc-legend");
  for (const state of Object.keys(DOC_STATE_KIND)) {
    const item = el("span", "doc-legend-item");
    item.append(el("span", "doc-legend-swatch doc-seg-" + state.replace(/[^a-z-]/g, "")));
    item.append(el("span", "note", state));
    row.append(item);
  }
  return row;
}

// Open one section row in the list, from a ribbon click. One at a time.
function docOpenSection(pane, id) {
  const btn = pane.querySelector('[data-section="' + CSS.escape(id) + '"]');
  if (!btn) return;
  for (const other of pane.querySelectorAll(".doc-row.open")) if (other !== btn.parentElement) other.classList.remove("open");
  btn.parentElement.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
  btn.scrollIntoView({ block: "nearest" });
  btn.focus();
}

function docSectionList(sections, slug, show) {
  const list = el("div", "doc-rows");
  const outline = new Map(((show && show.outline) || []).map((o) => [o.id, o]));
  for (const s of sections) {
    const row = el("div", "run-row doc-row");
    const btn = el("button", "run-card");
    btn.type = "button";
    btn.dataset.section = s.id;
    btn.setAttribute("aria-expanded", "false");
    btn.append(el("span", "run-caret", "▸"));
    btn.append(chip(s.state, DOC_STATE_KIND[s.state] || ""));
    const mid = el("div", "run-mid");
    mid.append(el("div", "run-slug", s.heading));
    mid.append(el("div", "run-where mono", `${s.start}..${s.end}`));
    btn.append(mid);
    btn.append(el("div", "run-age", `${s.lines} L`));
    if (s.findings) btn.append(chip(String(s.findings), "warn"));

    const pane = el("div", "run-pane stack stack-sm");
    const rows = [];
    const o = outline.get(s.id);
    if (o && o.purpose) rows.push([t("docs.field.purpose"), o.purpose]);
    rows.push([t("docs.field.required"), o && o.required === false ? t("docs.optional") : t("docs.required")]);
    rows.push([t("docs.field.hash"), String(s.hash || "").slice(0, 12)]);
    if (s.cycle) rows.push([t("docs.field.cycle"), String(s.cycle)]);
    if (s.renamed_from) rows.push([t("docs.field.renamedFrom"), s.renamed_from]);
    pane.append(kvList(rows));
    // REVEAL — the panel never shows a section's text until somebody asks for
    // that one section. It is rendered as DOM through `renderMd`, never as HTML.
    pane.append(docRevealBtn(slug, s.id, pane));
    const inner = el("div", "run-body-inner");
    inner.append(pane);
    const fold = el("div", "run-body");
    fold.append(inner);

    btn.addEventListener("click", () => {
      const open = row.classList.contains("open");
      for (const other of list.querySelectorAll(".doc-row.open")) other.classList.remove("open");
      row.classList.toggle("open", !open);
      btn.setAttribute("aria-expanded", String(!open));
    });
    row.append(btn, fold);
    list.append(row);
  }
  return list;
}

function docRevealBtn(slug, id, pane) {
  const wrap = el("div", "stack stack-sm");
  const b = el("button", "btn btn-ghost btn-sm", t("docs.reveal"));
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    let r = null;
    try {
      r = (await read("/api/doc/section?slug=" + encodeURIComponent(slug) + "&section=" + encodeURIComponent(id))).data;
    } catch (_) {}
    b.remove();
    if (!r || !r.text) {
      wrap.append(el("div", "note", t("docs.revealFail")));
      return;
    }
    const box = el("div", "doc-reveal");
    box.append(renderMd(r.text));
    wrap.append(box);
    wrap.append(el("div", "note", t("docs.revealNote")));
  });
  wrap.append(b);
  return wrap;
}

// The health card. STRAIGHT FROM `orc doc lint --json`: the CLI's rule names,
// the CLI's counts, the CLI's own honesty lines. Never a friendlier synonym for
// a rule, and the two honesty lines are not optional chrome.
function docHealth(lint) {
  const wrap = el("div", "stack stack-sm");
  const chips = el("div", "row-actions");
  chips.append(chip(tn(lint.errors, "docs.errorN"), lint.errors ? "bad" : "ok"));
  chips.append(chip(tn(lint.warnings, "docs.warnN"), lint.warnings ? "warn" : ""));
  chips.append(chip(lint.target_label, "info"));
  chips.append(chip(`max H${lint.max_heading}`, ""));
  chips.append(chip("front matter: " + lint.front_matter, ""));
  wrap.append(chips);

  const r = lint.readability || {};
  wrap.append(
    kvList([
      [t("docs.read.avg"), `${r.avg_sentence_words} / ${r.avg_bar}`],
      [t("docs.read.longest"), r.longest_sentence_line ? `${r.longest_sentence_words} → L${r.longest_sentence_line}` : "—"],
      [t("docs.read.longWords"), `${r.long_word_pct}%`],
      [t("docs.read.passive"), String(r.passive_constructions)],
      [t("docs.read.acronyms"), (r.undefined_acronyms || []).map((a) => a.acronym).join(", ")],
    ])
  );

  // Findings grouped by the CLI's rule name, as bars. A rule keeps its slot at
  // zero only when it fired at least once — a table of every rule that did not
  // fire is noise, but a rule that fired and is not shown is a lie.
  const byRule = new Map();
  for (const f of lint.findings || []) byRule.set(f.rule, (byRule.get(f.rule) || 0) + 1);
  if (byRule.size) {
    const max = Math.max(...byRule.values());
    const bars = el("div", "doc-bars");
    for (const [rule, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
      const row = el("div", "doc-bar-row");
      row.append(el("span", "doc-bar-label mono", rule));
      const bar = el("div", "doc-bar");
      const seg = el("div", "doc-bar-seg");
      seg.style.setProperty("--w", ((n / max) * 100).toFixed(2) + "%");
      bar.append(seg);
      row.append(bar);
      row.append(el("span", "doc-bar-n", String(n)));
      bars.append(row);
    }
    wrap.append(bars);
  }
  if (lint.import_note) wrap.append(el("div", "note warn", lint.import_note));
  for (const line of lint.honesty || []) wrap.append(el("div", "note", line));
  return wrap;
}

/* THE WAVE VISUALISER — the part of ORC that has never been drawn. `orc doc plan
   --json` gives the exact batching, so the panel can show it and decide nothing
   about it: the agent name, the sections, the budget and the wave number are all
   the CLI's. */
function docWaves(plan) {
  const wrap = el("div", "doc-waves");
  plan.waves.forEach((w, wi) => {
    const row = el("div", "doc-wave");
    row.style.setProperty("--i", String(wi));
    row.append(el("div", "doc-wave-n", t("docs.waveN", { n: w.n })));
    const cards = el("div", "doc-wave-cards");
    for (const a of w.agents) {
      const c = el("div", "doc-agent" + (a.oversized ? " oversized" : ""));
      c.append(el("div", "doc-agent-name mono", a.agent));
      c.append(el("div", "doc-agent-secs", a.headings.join(" + ")));
      const meta = el("div", "row-actions");
      meta.append(chip(`${a.budget_lines} L`, ""));
      if (a.range) meta.append(chip(`${a.range[0]}..${a.range[1]}`, "info"));
      if (a.oversized) meta.append(chip(t("docs.oversizedChip"), "bad"));
      c.append(meta);
      cards.append(c);
    }
    row.append(cards);
    wrap.append(row);
  });
  return wrap;
}

// While a mutation runs the WHOLE ui is read-only, output streams into the
// panel, and every panel refetches when it finishes.
function setBusy(on) {
  document.body.classList.toggle("busy", !!on);
}

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

/* =============================================================== shortcuts == */

// Keyboard nav for a panel app that is otherwise all mouse. Deliberately small
// and unmodified: single keys, and ONLY when you are not typing into something.
const SHORTCUTS = () => [
  ["1 – 9, 0", t("shortcuts.panels")],
  ["d · c · p · b · h · m", t("shortcuts.panelsLetters")],
  ["/", t("shortcuts.filter")],
  ["r", t("shortcuts.reload")],
  ["t", t("shortcuts.theme")],
  ["l", t("shortcuts.lang")],
  ["?", t("shortcuts.list")],
  ["Esc", t("shortcuts.escape")],
];

// A keystroke must never be stolen from an input, a textarea or a select — that
// is how a UI eats the "r" in the middle of a path somebody is typing.
function typingInto(t) {
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function showShortcuts() {
  const body = el("div", "stack stack-sm");
  const list = el("dl", "kv");
  for (const [key, what] of SHORTCUTS()) {
    const dt = el("dt");
    dt.append(el("kbd", null, key));
    list.append(dt, el("dd", null, what));
  }
  body.append(list);
  body.append(el("div", "note", t("shortcuts.note")));
  modal({
    title: t("shortcuts.title"),
    body,
    actions: [
      // Dismissing the tour must never be a one-way door: it is skippable
      // precisely because it can be replayed.
      {
        label: t("shortcuts.replay"),
        onClick: (c) => {
          c();
          startFirstRunTour(metaInfo.project_root);
        },
      },
      { label: t("common.close"), onClick: (c) => c() },
    ],
  });
}

function installShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // A dialog owns the keyboard while it is open; it has its own Esc handler.
    if (!$("#modal-host").hidden) return;
    // …and so does a blocking tour step. Its own capture-phase handler has
    // already swallowed the key by now; this is the second lock on the door.
    if (tourActive && tourActive.blocking) return;
    if (typingInto(e.target)) return;

    if (e.key >= "0" && e.key <= "9") {
      // Matched on data-idx, not on position: the rail's order is HTML's to
      // decide, and a positional lookup silently rebinds every key the moment a
      // panel is inserted in the middle.
      const target = document.querySelector('#nav a[data-idx="' + e.key + '"]');
      if (target) {
        e.preventDefault();
        location.hash = target.getAttribute("href");
      }
      return;
    }
    // v0.46.0: the rail outgrew ten digits, so several panels carry a LETTER key.
    // Same lookup, same rule — matched on data-idx, never on position — and the
    // letters are checked before the r/t/l actions so a rail key can never be
    // shadowed by one of them. Adding a panel whose letter collides with an
    // action would break the action; p/b/h/m/c/d were free.
    //
    // The class is derived from the rail rather than re-listed, because that is
    // what went wrong the first time: `c` was given to Challenge in the markup
    // and never added to a hardcoded `[pbhm]`, so the key did nothing and
    // nothing failed. A rail key now works because it is IN THE RAIL.
    if (/^[a-z]$/.test(e.key)) {
      const target = document.querySelector('#nav a[data-idx="' + e.key + '"]');
      if (target) {
        e.preventDefault();
        location.hash = target.getAttribute("href");
        return;
      }
    }
    if (e.key === "/") {
      const f = $("#settings-filter");
      if (f) {
        e.preventDefault();
        f.focus();
        f.select();
      }
      return;
    }
    if (e.key === "r") {
      e.preventDefault();
      route();
      return;
    }
    if (e.key === "t") {
      e.preventDefault();
      $("#theme-toggle").click();
      return;
    }
    if (e.key === "l") {
      e.preventDefault();
      cycleLang();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      showShortcuts();
    }
  });
}

/* ================================================================= startup == */

async function boot() {
  // Language first, and English is loaded UNCONDITIONALLY: it is the fallback
  // table every other language falls back to, so it must exist before the first
  // t() call regardless of which language is selected. If even English cannot be
  // fetched, t() returns the key and the page is ugly but functional — never
  // blank, and never blocked on a file.
  try {
    DICT_EN = await loadLang("en");
  } catch (_) {
    DICT_EN = {};
  }
  let savedLang = "en";
  try {
    savedLang = localStorage.getItem(LANG_KEY) || "en";
  } catch (_) {}
  // No rerender: nothing has been routed yet, and route() is called below.
  await setLang(savedLang, { rerender: false });

  // Meta next: it names the project in the rail and tells us whether we are
  // looking at fixtures, which must never be mistaken for a real install.
  try {
    const meta = await api("/api/meta");
    metaInfo = meta;
    const proj = $("#rail-project");
    proj.textContent = meta.fixtures ? t("rail.fixtures") : meta.project_root || "";
    proj.title = meta.project_root || "";
    $("#rail-version").textContent = (meta.fixtures ? "fixtures · " : "") + "v" + (meta.version || "?");

    // A newer release is worth ONE quiet dot in the rail, on every panel — not a
    // banner, not a modal. It links to the panel that can actually install it;
    // it never installs anything itself.
    versionInfo()
      .then((v) => {
        if (!v || !v.update_available) return;
        const link = el("a", "rail-update", "");
        link.href = "#/maintenance";
        link.append(el("span", "dot dot-warn"), document.createTextNode(`v${v.latest} available`));
        link.title = `You have ${v.version}. Maintenance → upgrade installs ${v.latest}.`;
        $("#rail-version").after(link);
      })
      .catch(() => {});
    if (meta.fixtures) {
      const b = el("div", "banner");
      b.append(el("div", null, t("banner.fixtures")));
      $("#banners").append(b);
    }
  } catch (_) {
    document.body.replaceChildren(
      (() => {
        const e2 = el("div", "empty", t("banner.noToken"));
        e2.append(el("div", "note", t("banner.noTokenHint")));
        return e2;
      })()
    );
    return;
  }

  // Theme: dark-first, remembered, and both painted explicitly.
  const saved = localStorage.getItem("orc-ui-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  const tt = $("#theme-toggle");
  const syncTheme = () => (tt.textContent = document.documentElement.getAttribute("data-theme") === "light" ? t("rail.dark") : t("rail.light"));
  syncTheme();
  tt.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("orc-ui-theme", next);
    syncTheme();
  });

  // Language, right below it in the rail: the same class of control (a
  // per-browser display preference), so it lives in the same place and is
  // remembered the same way. It never touches project config.
  const lb = $("#lang-toggle");
  if (lb) lb.addEventListener("click", cycleLang);
  applyStaticText();

  installShortcuts();
  const help = $("#shortcut-hint");
  if (help) help.addEventListener("click", showShortcuts);

  window.addEventListener("hashchange", route);
  route();

  // First run for THIS project → the tour. Fixture mode is excluded: a tour of
  // canned data would teach the panel using numbers that are not real.
  if (!metaInfo.fixtures && !tourSeen(metaInfo.project_root)) {
    // Let the first panel finish its fetch, so step one has something to point
    // at rather than a skeleton.
    setTimeout(() => startFirstRunTour(metaInfo.project_root), 600);
  }

  // Heartbeat: no ping from any client for 60s and the server exits, so closing
  // this tab shuts down a write surface instead of leaving it holding a token.
  const ping = () => api("/api/ping").catch(() => {});
  ping();
  setInterval(ping, 15000);
  window.addEventListener("beforeunload", () => {
    try {
      navigator.sendBeacon("/api/bye?t=" + encodeURIComponent(TOKEN));
    } catch (_) {}
  });
}

boot();
