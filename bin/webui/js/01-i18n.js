"use strict";
/* 01-i18n.js — orc ui client
   LANGS, loadLang, setLang, t, applyStaticText, cycleLang.
   
   Keys are written out IN FULL, never assembled from a fragment. The v0.48.1
   file split is by key PREFIX only; `docs.ship.confirm` is still spelled
   `docs.ship.confirm` at every call site.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

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

   The tables are plain JSON served as static assets. Adding a language is a
   FOLDER in i18n/ plus one row in LANGS — no build step, no library, no
   dependency, and no server change (serve.js walks i18n/ at boot).
*/
const LANGS = [
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
];
const LANG_KEY = "orc-ui-lang";

// v0.48.1 — one file per namespace instead of one 53 KB table, so changing the
// Docs panel's wording means opening i18n/en/docs.json rather than paging
// through every string in the panel.
//
// A plain array, and deliberately NOT an index file to fetch: an index would be
// one more round trip and one more thing to forget to update. A namespace owns
// one or more key PREFIXES (`stats` owns `stats.*` and `cost.*`), which the
// test suite asserts — a key whose prefix belongs to no namespace would load
// nowhere and render as a raw dotted string.
const NAMESPACES = [
  "common",
  "nav",
  "banner",
  "overview",
  "settings",
  "runs",
  "knowledge",
  "stats",
  "flow",
  "crosslink",
  "learn",
  "mockrun",
  "maintenance",
  "pact",
  "boundary",
  "handoff",
  "challenge",
  "docs",
  "extra",
  "experiment",
  "tour",
];

let lang = "en";
// English is loaded first and kept as the FALLBACK table: a key the other
// language has not translated yet renders in English rather than as a raw
// dotted key. A half-finished translation degrades to mixed prose, never to
// debug output on somebody's screen.
let DICT = {};
let DICT_EN = {};

// The namespaces are fetched in parallel and merged into ONE flat table, so
// `t()` is unchanged and no call site knows the split happened.
//
// A namespace that fails to load falls back to ENGLISH for its keys rather than
// rejecting the whole language: a network hiccup on one file should cost that
// file's prose, not the entire panel. English itself has no fallback below it,
// so a failure there rejects and boot() lands on raw keys — ugly, never blank.
function loadLang(code) {
  return Promise.all(
    NAMESPACES.map((ns) =>
      fetch(`/i18n/${code}/${ns}.json`, { headers: { "x-orc-token": TOKEN }, cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`i18n ${code}/${ns} ${r.status}`);
          return r.json();
        })
        .catch((e) => {
          if (code === "en") throw e;
          return null;
        })
    )
  ).then((parts) => Object.assign({}, ...parts.filter(Boolean)));
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
