"use strict";
/* 00-core.js — orc ui client
   TOKEN, the fetch layer (api/read/post), and the DOM helpers everything else
   is built from ($, el, frag, esc, relAge, setBusy).

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

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

// RELOADING IS NOT `location.reload()` HERE. The line above removed `?t=` from
// the visible URL, so a plain reload re-requests an address with no token and
// lands on the "missing its session token" page — which is what every
// post-update hand-over did. Put the token back on the way out.
function reloadWithToken() {
  const q = TOKEN ? "?t=" + encodeURIComponent(TOKEN) : "";
  location.replace(location.pathname + q + location.hash);
}

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
  if (!res.ok) throw failure(payload, res.status);
  return payload;
}

// A failure has to name what ran and why it stopped. "request failed (500)" is
// the message that sent people looking for a broken panel when what was broken
// was one file on disk (v0.49.2).
function failure(payload, status) {
  const msg = (payload && payload.error) || `request failed (${status})`;
  const err = new Error(String(msg));
  if (payload) {
    err.detail = [payload.command, payload.stderr, payload.stdout].filter(Boolean).join(String.fromCharCode(10));
    err.payload = payload;
  }
  return err;
}

// Reads unwrap to `.data`; a non-zero exit is DATA for several commands, never
// an error, so it is passed through beside the payload.
async function read(path) {
  const r = await api(path);
  return { data: r.data, exit: r.exit_code, ok: r.ok, fixture: !!r.fixture };
}

const post = (path, body) => api(path, { method: "POST", body });


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

// While a mutation runs the WHOLE ui is read-only, output streams into the
// panel, and every panel refetches when it finishes.
function setBusy(on) {
  document.body.classList.toggle("busy", !!on);
}
