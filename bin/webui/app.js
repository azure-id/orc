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
  for (const a of actions) {
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
        if (e.body) sec.append(el("div", "cl-body", stripMd(e.body)));
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
    for (const k of keys) rows.append(settingRow(k, body));

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

function settingRow(k, panelBody) {
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
  right.append(controlFor(k, panelBody));
  if (k.is_overridden) {
    const reset = el("button", "btn btn-ghost btn-sm", t("setting.resetTo", { value: String(k.default) }));
    reset.type = "button";
    reset.addEventListener("click", () => writeSetting("/api/config/reset", { key: k.key }, panelBody, row));
    right.append(reset);
  }

  row.append(left, right);
  return row;
}

// The control follows the VALIDATOR, not a hand-kept table: enum → segmented,
// int/range → stepper with the options list as presets, path/repo/model → a
// text input whose validation is the CLI's own exit code.
function controlFor(k, panelBody) {
  const c = k.control || { kind: "text" };
  const commit = (value, node) => writeSetting("/api/config/set", { key: k.key, value }, panelBody, node);

  if (c.kind === "enum") {
    const choices = c.choices || k.options || [];
    const seg = el("div", "seg");
    for (const opt of choices) {
      const b = el("button", null, String(opt));
      b.type = "button";
      b.setAttribute("aria-pressed", String(String(k.value) === String(opt)));
      b.addEventListener("click", () => commit(String(opt), b));
      seg.append(b);
    }
    return seg;
  }

  if (c.kind === "int" || c.kind === "range") {
    const wrap = el("div", "stepper");
    const input = el("input");
    input.type = "number";
    input.value = String(k.value);
    if (c.min !== null && c.min !== undefined) input.min = String(c.min);
    if (c.max !== null && c.max !== undefined) input.max = String(c.max);
    const save = el("button", "btn btn-sm", "set");
    save.type = "button";
    save.addEventListener("click", () => commit(input.value, input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit(input.value, input);
    });
    wrap.append(input, save);
    const presets = (k.options || []).filter((o) => String(o) !== String(k.value));
    if (presets.length) {
      const seg = el("div", "seg");
      for (const p of presets.slice(0, 5)) {
        const b = el("button", null, String(p));
        b.type = "button";
        b.addEventListener("click", () => commit(String(p), b));
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
      String(k.value)
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
        commit([...chosen].join(",") || "", b);
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
  input.value = String(k.value);
  const save = el("button", "btn btn-sm", "set");
  save.type = "button";
  const go = () => commit(input.value, input);
  save.addEventListener("click", go);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
  wrap.append(input, save);
  return wrap;
}

async function writeSetting(endpoint, body, panelBody, node) {
  try {
    const r = await post(endpoint, body);
    if (!r.ok) {
      if (node && node.classList) node.classList.add("invalid");
      toast(t("write.refused"), "bad", r.output || r.command);
      return;
    }
    // Brief success flash on the row, then re-render from the CLI so the
    // shadowing, the overridden dots and the ladder all reflect real state.
    if (node && node.closest) {
      const row = node.closest(".setting");
      if (row) {
        row.animate([{ background: "var(--ok-wash)" }, { background: "transparent" }], { duration: 700, easing: "ease-out" });
      }
    }
    toast(r.command, "ok", r.output && r.output.length < 400 ? r.output : "");
    await rerenderSettings(panelBody);
  } catch (e) {
    toast(t("write.failed"), "bad", String(e.message));
  }
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

PANELS.runs = function (host) {
  head(host, t("runs.title"), t("runs.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderRuns(body);
};

async function renderRuns(body) {
  body.replaceChildren(skeleton(6));
  let d;
  try {
    d = (await read("/api/runs")).data;
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
      loadRunDetail(entry.pane, entry.slug);
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

    const entry = { row, head: headBtn, pane, slug: r.slug, loaded: false };
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
function loadRunDetail(pane, slug) {
  Promise.all([
    read("/api/run?slug=" + encodeURIComponent(slug)),
    read("/api/mock?slug=" + encodeURIComponent(slug)).catch(() => ({ data: null })),
  ])
    .then(([runRes, mockRes]) => {
      const d = runRes.data;
      const mock = mockRes && mockRes.data && mockRes.data.found ? mockRes.data : null;
      const out = frag();

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
  const [wikiRes, impactRes, patRes, gotRes] = await Promise.all([
    read("/api/wiki").catch(() => ({ data: null })),
    read("/api/wiki/impact").catch(() => ({ data: null })),
    read("/api/patterns").catch(() => ({ data: null })),
    read("/api/gotchas").catch(() => ({ data: null })),
  ]);
  const out = frag();

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

PANELS.stats = function (host) {
  head(host, t("stats.title"), t("stats.sub"));
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
};

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

  if (d.configured) {
    for (const e of d.errors || []) out.append(bannerLine(e, true));
    for (const w of d.warnings || []) out.append(bannerLine(w, false));

    const keys = card(t("flow.keys"));
    keys.append(el("div", "note", t("flow.keysNote")));
    for (const k of d.keys) {
      const row = el("div", "setting");
      const left = el("div");
      const name = el("div", "setting-name");
      name.append(document.createTextNode(k.key));
      if (k.is_set) name.append(el("span", "dot"));
      left.append(name, el("div", "setting-desc", k.desc || ""));
      const right = el("div", "setting-control");
      const input = el("input", "text-input");
      input.value = String(k.value === "" ? "" : k.value);
      const save = el("button", "btn btn-sm", t("flow.set"));
      save.type = "button";
      const go = async () => {
        const r = await post("/api/diy/set", { key: k.key, value: input.value });
        toast(r.command, r.ok ? "ok" : "bad", r.output);
        renderFlow(body);
      };
      save.addEventListener("click", go);
      input.addEventListener("keydown", (e) => e.key === "Enter" && go());
      right.append(input, save);
      row.append(left, right);
      keys.append(row);
    }
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

/* =============================================================== CROSSLINK == */

PANELS.crosslink = function (host) {
  head(host, t("crosslink.title"), t("crosslink.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderCrosslink(body);
};

async function renderCrosslink(body) {
  body.replaceChildren(skeleton(5));
  const d = (await read("/api/crosslink")).data;
  const out = frag();

  if (!d.configured) {
    const e = empty(t("crosslink.empty"), t("crosslink.emptyHint"));
    out.append(e);
    out.append(await addLinkCard(d, body));
    body.replaceChildren(out);
    return;
  }

  // The graph as a picture, not a list of rows. Direction is the whole point of
  // a crosslink edge — which repo consumes which — and an arrow says that
  // faster than the words "we call them" repeated down a column.
  out.append(graphCard(d));

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

  body.replaceChildren(out);
}

// A radial graph: self in the middle, every linked repo around it, each edge
// drawn in the direction it actually points. Nothing here is a control — it is
// a diagram, and it is the fastest answer to "which way does this one go".
function graphCard(d) {
  const summary = t(d.nodes.length === 1 && d.links.length === 1 ? "crosslink.repos" : "crosslink.reposPlural", {
    repos: d.nodes.length,
    edges: d.links.length,
  });
  const c = card(t("crosslink.topology"), chip(summary, "info"));
  const wrap = el("div", "graph");

  const self = el("div", "graph-self");
  self.append(el("span", "graph-dot"), el("span", null, d.self));
  self.title = "This repo";
  wrap.append(self);

  const ring = el("div", "graph-ring");
  for (const n of d.nodes) {
    const node = el("div", "graph-node graph-" + (n.direction || "none"));
    node.dataset.name = n.name;

    // The arrow IS the information: ▶ we consume them, ◀ they consume us.
    const arrow = el("span", "graph-arrow", n.direction === "consume" ? "──▶" : n.direction === "provide" ? "◀──" : "───");
    const via = (d.links.find((l) => l.from === n.name || l.to === n.name) || {}).via;
    const label = el("div", "graph-label");
    label.append(el("span", "graph-name", n.name));
    if (via) label.append(el("span", "graph-via", via));

    const pv = n.provider || {};
    // The chip carries the CLI's own state word, so the picture and `orc
    // crosslink list` always say the same thing.
    const state =
      pv.state === "missing" ? ["missing", "bad"] :
      pv.state === "no-wiki" ? ["no wiki", "warn"] :
      pv.state === "unregistered" ? ["unregistered", "warn"] :
      pv.state === "corrupt" ? ["corrupt", "bad"] :
      n.direction === "provide" ? ["inbound", ""] :
      [pv.tier || "linked", pv.tier === "FRESH" ? "ok" : pv.tier === "AGING" ? "warn" : "bad"];

    node.append(arrow, label, chip(state[0], state[1]));
    node.title = `${n.name} — ${n.repo_path}`;
    // Hovering a node lights its row below, so the picture and the detail list
    // are obviously the same set of things.
    node.addEventListener("mouseenter", () => {
      const row = document.querySelector('.action[data-node="' + n.name + '"]');
      if (row) row.classList.add("linked-hi");
    });
    node.addEventListener("mouseleave", () => {
      for (const r of document.querySelectorAll(".linked-hi")) r.classList.remove("linked-hi");
    });
    ring.append(node);
  }
  wrap.append(ring);
  c.append(wrap);
  if (!d.nodes.length) c.append(el("div", "note", t("crosslink.graphEmpty")));
  return c;
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

    const btn = el("button", "btn btn-sm", t("maintenance.preview"));
    btn.type = "button";
    btn.addEventListener("click", () => previewAction(a.id, body));
    row.append(left, btn);
    out.append(row);
  }

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
  // Re-place after layout settles, so the popover's own height is known.
  requestAnimationFrame(place);

  const onResize = () => place();
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onResize, true);

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
      if (target) target.classList.remove("tour-target", "tour-target-rel");
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
