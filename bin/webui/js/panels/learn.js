"use strict";
/* panels/learn.js — orc ui client
   The onboarding walkthrough: a contents rail plus one section.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


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
