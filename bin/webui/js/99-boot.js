"use strict";
/* 99-boot.js — orc ui client
   MUST LOAD LAST. `boot()` is the one load-time call in the panel, and it reads
   bindings from every file above — a classic-script `const` is in TDZ until its
   own file has been evaluated.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


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
