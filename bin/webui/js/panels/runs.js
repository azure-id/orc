"use strict";
/* panels/runs.js — orc ui client
   The run accordion — one row open at a time, detail fetched on first open.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

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
