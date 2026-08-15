"use strict";
/* panels/mockrun.js — orc ui client
   The mocked-run gallery and document pane. The catalogue is DERIVED by
   bin/mockrun-catalog.js; this panel decides nothing about it.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

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
