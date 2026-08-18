"use strict";
/* panels/knowledge.js — orc ui client
   What ORC knows about this repo: the wiki, its coverage, the code patterns,
   the repair memory, and what it knows from next door.

   FIVE TABS since v0.49.1, the Crosslink two-tab precedent. This was one
   scrolling column of six cards, and the release that made the CLI stop
   discarding what it computes roughly tripled the content — which is not
   survivable as one scroll.

   THE PANEL DERIVES NOTHING. It never computes a tier, a distance, a coverage
   percentage, an order, an estimate or a price: `computeWikiFreshness` is the
   one engine, `orc wiki plan` decides the order, and a value the CLI could not
   compute renders as an em dash, never as a guess.

   A FREE ACTION GETS A BUTTON; A PAID ACTION GETS A COPY-ABLE COMMAND — and
   that line is visible on the panel rather than implied.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

/* =============================================================== KNOWLEDGE == */

PANELS.knowledge = function (host) {
  head(host, t("knowledge.title"), t("knowledge.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderKnowledge(body);
};

// Which tab was open, so a write that re-renders the panel does not throw the
// user back to the first one.
let KN_TAB = "wiki";

async function renderKnowledge(body) {
  body.replaceChildren(skeleton(6));
  const [wikiRes, impactRes, patRes, gotRes, planRes, debtRes, usageRes, docsRes, covRes] = await Promise.all([
    read("/api/wiki").catch(() => ({ data: null })),
    read("/api/wiki/impact").catch(() => ({ data: null })),
    read("/api/patterns").catch(() => ({ data: null })),
    read("/api/gotchas").catch(() => ({ data: null })),
    read("/api/wiki/plan").catch(() => ({ data: null })),
    read("/api/wiki/debt").catch(() => ({ data: null })),
    read("/api/wiki/usage").catch(() => ({ data: null })),
    read("/api/wiki/docs").catch(() => ({ data: null })),
    read("/api/wiki/coverage").catch(() => ({ data: null })),
  ]);
  const d = {
    wiki: wikiRes.data || {},
    impact: impactRes.data,
    patterns: patRes.data || {},
    gotchas: gotRes.data || {},
    plan: planRes.data,
    debt: debtRes.data,
    usage: usageRes.data,
    docs: docsRes.data,
    coverage: covRes.data,
  };

  const out = frag();
  // THE HEADER STRIP, above the tabs and on every one of them: the numbers that
  // answer "what does ORC know about this repo?" in one line. Every value is
  // CLI-computed, and one it could not compute renders as an em dash.
  out.append(knowledgeHeaderStrip(d));

  const tabs = el("div", "tabs");
  const pane = el("div", "tab-pane stack");
  const views = {
    wiki: () => knWikiTab(d, body),
    coverage: () => knCoverageTab(d),
    patterns: () => knPatternsTab(d),
    memory: () => knMemoryTab(d, body),
    peers: () => knPeersTab(d),
  };
  const select = (which) => {
    KN_TAB = which;
    for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.tab === which));
    pane.replaceChildren(views[which]());
  };
  // Keys are written out in full, never assembled from the tab id — a key built
  // from a fragment is invisible to every check that looks for one.
  for (const [which, label] of [
    ["wiki", t("knowledge.tab.wiki")],
    ["coverage", t("knowledge.tab.coverage")],
    ["patterns", t("knowledge.tab.patterns")],
    ["memory", t("knowledge.tab.memory")],
    ["peers", t("knowledge.tab.peers")],
  ]) {
    const b = el("button", null, label);
    b.type = "button";
    b.dataset.tab = which;
    b.addEventListener("click", () => select(which));
    tabs.append(b);
  }
  out.append(tabs, pane);
  body.replaceChildren(out);
  select(views[KN_TAB] ? KN_TAB : "wiki");
}

/* THE HEADER STRIP. Six numbers, all of them the CLI's. A `—` means the CLI
   could not compute it, and that is an ANSWER — never a zero, never a guess. */
function knowledgeHeaderStrip(d) {
  const w = d.wiki || {};
  const strip = el("div", "kn-strip");
  const item = (label, value, kind) => {
    const box = el("div", "kn-strip-item" + (kind ? " kn-" + kind : ""));
    box.append(el("span", "kn-strip-value", value));
    box.append(el("span", "kn-strip-label", label));
    strip.append(box);
  };
  // The tier word is the CLI's own. Never a friendlier synonym.
  item(t("knowledge.strip.wiki"), w.tier || (w.state ? String(w.state).toUpperCase() : "—"));
  item(t("knowledge.strip.docs"), w.docs === undefined ? "—" : String(w.docs));
  item(
    t("knowledge.strip.covered"),
    d.coverage && d.coverage.ok ? d.coverage.coverage_pct + "%" : "—"
  );
  item(t("knowledge.strip.blind"), w.blind === undefined ? "—" : String(w.blind));
  item(
    t("knowledge.strip.pending"),
    d.debt && d.debt.ok && d.debt.pending !== undefined ? String(d.debt.pending) : "—"
  );
  item(t("knowledge.strip.patterns"), String((d.patterns.patterns || []).length));
  item(t("knowledge.strip.gotchas"), d.gotchas.count === undefined ? "—" : String(d.gotchas.count));
  return strip;
}

/* ── TAB 1 — WIKI ────────────────────────────────────────────────────────── */
function knWikiTab(d, body) {
  const out = frag();
  out.append(wikiPlanCard(d.plan, d.debt, body));
  if (d.usage && d.usage.rows) out.append(wikiUsageCard(d.usage, body));

  const w = d.wiki;
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
    // The per-doc split as a small stacked bar. The counts are the CLI's.
    if (w.counts) {
      const total = Math.max(1, w.counts.FRESH + w.counts.AGING + w.counts.STALE + (w.counts.unknown || 0));
      const bar = el("div", "kn-tierbar");
      for (const [tier, cls] of [["FRESH", "ok"], ["AGING", "warn"], ["STALE", "bad"], ["unknown", "idle"]]) {
        const n = w.counts[tier] || 0;
        if (!n) continue;
        const seg = el("div", "kn-tierbar-seg kn-tier-" + cls);
        seg.style.setProperty("--w", ((n / total) * 100).toFixed(2) + "%");
        seg.title = `${tier} ${n}`;
        bar.append(seg);
      }
      headRow.append(bar);
    }
    wc.append(headRow);
    const rows = [
      [t("knowledge.field.docs"), String(w.docs)],
      [t("knowledge.field.lastScan"), w.last_scan],
    ];
    // THE DOC PINNING THE TIER, BY NAME. A hash is not a thing anybody can go
    // and refresh — and until v0.49.1 the hash is all `--json` carried.
    if (w.worst)
      rows.push([t("knowledge.field.worst"), `${w.worst.file} (${w.worst.distance}c)`]);
    rows.push(
      [
        t("knowledge.field.distance"),
        w.distance === null ? t("knowledge.field.unmeasurable") : t("knowledge.field.distanceValue", { n: w.distance }),
      ],
      [t("knowledge.field.anchor"), w.anchor ? String(w.anchor).slice(0, 8) : ""],
      // `wiki_fresh_max` / `wiki_aging_max` are config keys — the numbers are
      // shown, the key names are not paraphrased.
      [t("knowledge.field.edges"), w.edges ? `fresh < ${w.edges.freshMax}c · aging <= ${w.edges.agingMax}c` : ""],
      [t("knowledge.field.tags"), w.crosslink_tags === undefined ? "" : String(w.crosslink_tags)],
      [t("knowledge.field.blind"), w.blind ? String(w.blind) : "0"]
    );
    wc.append(kvList(rows));
    // The reason text is the CLI's own sentence about a real doc — verbatim.
    for (const r of w.reasons || []) wc.append(el("div", "note", t("knowledge.wiki.why", { reason: r })));
    wc.append(el("div", "note", t("knowledge.wiki.freshNote")));
    // The orientation doc is read FIRST by every consumer, and the panel used
    // not to mention it exists.
    if (w.orientation) {
      if (w.orientation.present)
        wc.append(el("div", "note ok", t("knowledge.orientation.present", { file: w.orientation.file })));
      else {
        wc.append(el("div", "note warn", t("knowledge.orientation.missing")));
        wc.append(el("pre", "cmd", w.orientation.regenerate));
      }
    }
  }
  out.append(wc);

  // THE DOC TABLE — the headline addition. A row EXPANDS IN PLACE (one at a
  // time, detail fetched on first open); there is no detail box below the
  // table, which is the Runs-row rule.
  out.append(wikiDocsCard(d.docs));

  // impact, unchanged, moved onto this tab
  const imp = d.impact;
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
    for (const doc of imp.docs) {
      const tr = el("tr");
      tr.append(el("td", "mono", doc.file));
      const st = el("td");
      st.append(chip(doc.state, doc.state === "CLEAN" ? "ok" : doc.state === "TOUCHED" ? "info" : "warn"));
      tr.append(st);
      tr.append(el("td", "note", doc.gone.length ? "gone: " + doc.gone.join(", ") : doc.hits.slice(0, 4).join(", ")));
      tb.append(tr);
    }
    table.append(thead, tb);
    scroll.append(table);
    c.append(scroll);
    out.append(c);
  } else if (imp && !imp.ok) {
    const c = card(t("knowledge.impact.title"));
    c.append(el("div", "note", imp.hint || `unavailable (${imp.reason})`));
    out.append(c);
  }
  return out;
}

/* THE DOC TABLE. Ordered exactly as the CLI ordered it — THE PANEL NEVER
   INVENTS A RANK (the `wiki plan` rule). A row expands IN PLACE. */
function wikiDocsCard(docs) {
  const c = card(t("knowledge.docs.title"));
  if (!docs || !docs.ok || !(docs.docs || []).length) {
    c.append(empty(t("knowledge.docs.none"), (docs && docs.hint) || t("knowledge.docs.noneHint")));
    return c;
  }
  c.append(el("div", "note", t("knowledge.docs.note")));
  const scroll = el("div", "scroll-x");
  const table = el("table");
  const thead = el("thead");
  const hr = el("tr");
  for (const h of [
    t("knowledge.docs.col.doc"),
    t("knowledge.docs.col.tier"),
    t("knowledge.docs.col.distance"),
    t("knowledge.docs.col.covers"),
    t("knowledge.docs.col.used"),
    t("knowledge.docs.col.tags"),
  ])
    hr.append(el("th", null, h));
  thead.append(hr);
  const tb = el("tbody");
  const open = { row: null };
  for (const r of docs.docs) {
    const tr = el("tr", "kn-doc-row" + (r.retire_hint ? " row-muted" : ""));
    tr.tabIndex = 0;
    const detail = el("tr", "kn-doc-detail");
    const dtd = el("td");
    dtd.setAttribute("colspan", "6");
    detail.append(dtd);
    detail.hidden = true;
    let loaded = false;
    const toggle = () => {
      const willOpen = detail.hidden;
      // One row open at a time — the Runs-row rule.
      if (open.row && open.row !== detail) {
        open.row.hidden = true;
        open.row.previousSibling.classList.remove("open");
      }
      detail.hidden = !willOpen;
      tr.classList.toggle("open", willOpen);
      open.row = willOpen ? detail : null;
      if (willOpen && !loaded) {
        loaded = true;
        loadWikiDoc(dtd, r.file);
      }
    };
    tr.addEventListener("click", toggle);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    tr.append(el("td", "mono", r.file.replace(/^wiki\//, "")));
    const tc = el("td");
    tc.append(chip(r.tier, r.tier === "FRESH" ? "ok" : r.tier === "AGING" ? "warn" : r.tier === "STALE" ? "bad" : ""));
    tr.append(tc);
    tr.append(el("td", "num", r.distance === null ? "?" : r.distance + "c"));
    tr.append(el("td", "note", (r.covers || []).join(", ")));
    // `used: null` is NOT zero-use — unknown must never be reported as dead.
    tr.append(el("td", "num", r.used === null ? "?" : `${r.used}/${r.used_of}`));
    tr.append(el("td", "num", String(r.crosslink_tags || 0)));
    tb.append(tr, detail);
  }
  table.append(thead, tb);
  scroll.append(table);
  c.append(scroll);
  return c;
}

async function loadWikiDoc(host, file) {
  host.replaceChildren(skeleton(2));
  const r = await read("/api/wiki/show?doc=" + encodeURIComponent(file)).catch(() => ({ data: null }));
  const d = r.data;
  if (!d || !d.ok) {
    host.replaceChildren(el("div", "note", (d && d.hint) || t("common.loadFail")));
    return;
  }
  const out = frag();
  out.append(
    kvList([
      [t("knowledge.docs.field.title"), d.title || ""],
      [t("knowledge.docs.field.type"), d.doc_type || ""],
      [t("knowledge.docs.field.scanned"), d.scanned_commit ? String(d.scanned_commit).slice(0, 8) : ""],
      [t("knowledge.docs.field.covers"), (d.covers || []).join(", ")],
      [t("knowledge.docs.field.coveredFiles"), String(d.covered_files)],
      [t("knowledge.docs.field.lastUsed"), d.last_used || t("knowledge.usage.neverUsed")],
    ])
  );
  if ((d.tags || []).length) {
    const tl = el("div", "row-actions");
    for (const tag of d.tags) tl.append(chip(tag.tag, "info"));
    out.append(tl);
  }
  // Free repairs FIRST, as everywhere else on this panel.
  for (const rep of d.free_repairs || []) {
    const row = el("div", "free-row");
    row.append(chip(t("knowledge.plan.free"), "ok"));
    row.append(el("span", null, rep.what));
    row.append(el("code", "mono", rep.cmd));
    out.append(row);
  }
  // REVEAL. The body is fetched only on an explicit request, one artifact at a
  // time, and it is rendered as DOM — never as HTML.
  const reveal = el("button", "btn btn-ghost btn-sm", t("knowledge.reveal"));
  reveal.type = "button";
  reveal.addEventListener("click", async () => {
    reveal.disabled = true;
    const b = await read("/api/wiki/show?doc=" + encodeURIComponent(file) + "&body=1").catch(() => ({ data: null }));
    const box = el("div", "kn-body");
    box.append(renderMd((b.data && b.data.body) || ""));
    reveal.replaceWith(box);
  });
  out.append(reveal);
  host.replaceChildren(out);
}

/* ── TAB 2 — COVERAGE ────────────────────────────────────────────────────── */
function knCoverageTab(d) {
  const out = frag();
  const cov = d.coverage;
  const c = card(t("knowledge.coverage.title"));
  if (!cov || !cov.ok) {
    c.append(empty(t("knowledge.coverage.na"), (cov && cov.hint) || t("knowledge.coverage.naHint")));
    out.append(c);
    return out;
  }
  const big = el("div", "kn-coverage");
  big.append(el("span", "kn-coverage-num", cov.coverage_pct + "%"));
  big.append(el("span", "note", t("knowledge.coverage.sub", { covered: cov.covered, tracked: cov.tracked })));
  c.append(big);
  const bar = el("div", "kn-tierbar");
  const seg = el("div", "kn-tierbar-seg kn-tier-ok");
  seg.style.setProperty("--w", cov.coverage_pct + "%");
  bar.append(seg);
  const rest = el("div", "kn-tierbar-seg kn-tier-idle");
  rest.style.setProperty("--w", 100 - cov.coverage_pct + "%");
  bar.append(rest);
  c.append(bar);
  // NOT OPTIONAL CHROME. There is no threshold, no config key, and nothing
  // branches on this number — a coverage percentage that starts nagging becomes
  // a number people game.
  c.append(el("div", "note", t("knowledge.coverage.notATarget")));
  out.append(c);

  if ((cov.uncovered_dirs || []).length) {
    const uc = card(t("knowledge.coverage.uncovered"));
    uc.append(el("div", "note", t("knowledge.coverage.uncoveredNote")));
    const scroll = el("div", "scroll-x");
    const table = el("table");
    const thead = el("thead");
    const hr = el("tr");
    for (const h of [t("knowledge.coverage.col.dir"), t("knowledge.coverage.col.files"), t("knowledge.coverage.col.last")])
      hr.append(el("th", null, h));
    thead.append(hr);
    const tb = el("tbody");
    for (const row of cov.uncovered_dirs) {
      const tr = el("tr");
      tr.append(el("td", "mono", row.dir));
      tr.append(el("td", "num", String(row.files)));
      tr.append(el("td", "note", row.newest_commit || ""));
      tb.append(tr);
    }
    table.append(thead, tb);
    scroll.append(table);
    uc.append(scroll);
    out.append(uc);
  }

  // THE STRUCTURAL BLIND SPOT AS THE FILE LIST IT ALWAYS WAS — no longer as the
  // number `2`, which tells a user nothing they can act on.
  const blind = (d.wiki && d.wiki.blind_spot) || (d.impact && d.impact.blind_spot) || [];
  const bc = card(t("knowledge.blind.title"));
  if (!blind.length) {
    bc.append(el("div", "note ok", t("knowledge.blind.none")));
  } else {
    bc.append(el("div", "note", t("knowledge.blind.note")));
    const fl = el("div", "file-list");
    for (const f of blind) fl.append(el("div", null, f));
    bc.append(fl);
  }
  out.append(bc);
  return out;
}

/* ── TAB 3 — PATTERNS ────────────────────────────────────────────────────── */
function knPatternsTab(d) {
  const out = frag();
  const p = d.patterns || {};
  const pc = card(t("knowledge.patterns.title"));
  pc.append(el("div", "note", t("knowledge.patterns.note")));
  if (!(p.patterns || []).length) {
    pc.append(empty(t("knowledge.patterns.none"), t("knowledge.patterns.noneHint")));
  } else {
    for (const row of p.patterns) {
      const box = el("div", "kn-pattern");
      const hdr = el("div", "row-actions");
      // The language KEY is the CLI's framework id (`react`, `nestjs`, …) — a
      // translated one would resolve to no playbook.
      hdr.append(el("span", "mono", row.lang));
      hdr.append(el("span", "note", relAge(row.mtime_ms)));
      box.append(hdr);
      box.append(el("div", "note mono", row.path));
      const more = el("button", "btn btn-ghost btn-sm", t("knowledge.patterns.inspect"));
      more.type = "button";
      const detail = el("div", "stack stack-sm");
      more.addEventListener("click", async () => {
        more.disabled = true;
        await loadPattern(detail, row.lang);
        more.remove();
      });
      box.append(more, detail);
      pc.append(box);
    }
  }
  // Known-but-uncached languages: PAID, so a command and never a button.
  const cached = new Set((p.patterns || []).map((x) => x.lang));
  const uncached = (p.known_languages || []).filter((l) => !cached.has(l));
  if (uncached.length) {
    pc.append(el("div", "note", t("knowledge.patterns.known", { list: uncached.join(", ") })));
    for (const l of uncached.slice(0, 6)) pc.append(el("pre", "cmd", `/orc-pattern ${l}`));
    pc.append(el("div", "note", t("knowledge.patterns.paidWhy")));
  }
  out.append(pc);
  return out;
}

async function loadPattern(host, lang) {
  host.replaceChildren(skeleton(2));
  const r = await read("/api/pattern/show?lang=" + encodeURIComponent(lang)).catch(() => ({ data: null }));
  const d = r.data;
  if (!d || !d.ok) {
    host.replaceChildren(el("div", "note", (d && d.hint) || t("common.loadFail")));
    return;
  }
  const out = frag();
  out.append(
    kvList([
      [t("knowledge.patterns.field.codified"), d.codified_at || "—"],
      [t("knowledge.patterns.field.source"), d.source_commit ? String(d.source_commit).slice(0, 8) : "—"],
      [t("knowledge.patterns.field.playbook"), d.playbook || "—"],
      [t("knowledge.patterns.field.size"), `${d.lines} · ${d.bytes}`],
      [t("knowledge.patterns.field.counts"), `${d.conventions} · ${d.invariants}`],
    ])
  );
  // An unheadered file SAYS SO in one line. No date is ever derived from an
  // mtime — that is the `/orc-pact` UNCHECKABLE rule.
  if (!d.headered) out.append(el("div", "note warn", t("knowledge.patterns.unheadered")));
  if ((d.headings || []).length) {
    const hl = el("div", "row-actions");
    for (const h of d.headings.slice(0, 20)) hl.append(chip(h, ""));
    out.append(hl);
  }
  // CONFLICTS get their own block: they are the most decision-shaped thing in
  // the file (the project does X, the invariant says Y) and until now they were
  // invisible outside it.
  if ((d.conflicts || []).length) {
    const cb = el("div", "kn-conflicts");
    cb.append(el("div", "kn-conflicts-head", t("knowledge.patterns.conflicts")));
    for (const c of d.conflicts) cb.append(el("div", "note", c));
    out.append(cb);
  }
  const reveal = el("button", "btn btn-ghost btn-sm", t("knowledge.reveal"));
  reveal.type = "button";
  reveal.addEventListener("click", async () => {
    reveal.disabled = true;
    const b = await read("/api/pattern/show?lang=" + encodeURIComponent(lang) + "&body=1").catch(() => ({ data: null }));
    const box = el("div", "kn-body");
    box.append(renderMd((b.data && b.data.body) || ""));
    reveal.replaceWith(box);
  });
  out.append(reveal);
  out.append(el("div", "note", t("knowledge.patterns.literalNote")));
  host.replaceChildren(out);
}

/* ── TAB 4 — MEMORY (gotchas) ────────────────────────────────────────────── */
function knMemoryTab(d, body) {
  const out = frag();
  const g = d.gotchas || {};
  const gc = card(t("knowledge.gotchas.title"));
  gc.append(el("div", "note", t("knowledge.gotchas.note")));
  if (!g.count) {
    gc.append(empty(t("knowledge.gotchas.none"), t("knowledge.gotchas.noneHint")));
    out.append(gc);
    return out;
  }
  const scroll = el("div", "scroll-x");
  const table = el("table");
  const thead = el("thead");
  const hr = el("tr");
  // These are the gotcha record's own field names, printed by `orc gotcha
  // list` — column headers stay in the file's vocabulary.
  for (const h of ["Id", "Area", "Kind", "Hits", "Last seen", "Trigger"]) hr.append(el("th", null, h));
  thead.append(hr);
  const tb = el("tbody");
  const open = { row: null };
  for (const e of g.gotchas) {
    const tr = el("tr", "kn-doc-row");
    tr.tabIndex = 0;
    const detail = el("tr", "kn-doc-detail");
    const dtd = el("td");
    dtd.setAttribute("colspan", "6");
    detail.append(dtd);
    detail.hidden = true;
    // EVERY FIELD the CLI already emits. `gotchaStatus` has always sent
    // `fields`; the panel rendered six columns and discarded the rest.
    dtd.append(kvList(Object.keys(e.fields || {}).map((k) => [k, e.fields[k]])));
    const toggle = () => {
      const willOpen = detail.hidden;
      if (open.row && open.row !== detail) {
        open.row.hidden = true;
        open.row.previousSibling.classList.remove("open");
      }
      detail.hidden = !willOpen;
      tr.classList.toggle("open", willOpen);
      open.row = willOpen ? detail : null;
    };
    tr.addEventListener("click", toggle);
    tr.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggle();
      }
    });
    tr.append(
      el("td", "mono", e.id),
      el("td", "mono", e.area),
      el("td", null, e.kind),
      el("td", null, String(e.hits)),
      el("td", "note", e.last_seen || "?"),
      el("td", "note", e.trigger || "")
    );
    tb.append(tr, detail);
  }
  table.append(thead, tb);
  scroll.append(table);
  gc.append(scroll);
  gc.append(gotchaPruneBox(g, body));
  out.append(gc);

  // The archive is reachable and clearly labelled as recoverable: eviction is
  // an ARCHIVE, never a delete.
  const ac = card(t("knowledge.archive.title"));
  const load = el("button", "btn btn-ghost btn-sm", t("knowledge.archive.load"));
  load.type = "button";
  load.addEventListener("click", async () => {
    load.disabled = true;
    const r = await read("/api/gotchas/archived").catch(() => ({ data: null }));
    const a = r.data;
    const box = el("div", "stack stack-sm");
    if (!a || !a.count) box.append(el("div", "note", t("knowledge.archive.empty")));
    else for (const e of a.gotchas) box.append(el("div", "note mono", `${e.id} · ${e.area} · ${e.kind} · hits ${e.hits}`));
    load.replaceWith(box);
  });
  ac.append(el("div", "note", t("knowledge.archive.note")));
  ac.append(load);
  out.append(ac);
  return out;
}

/* PREVIEW-THEN-APPLY. The Apply button stays disabled until a preview has been
   fetched, the exact command is on screen throughout, and THE PREVIEW NAMES
   EVERY ENTRY that would be archived — a count is not consent. */
function gotchaPruneBox(g, body) {
  const box = el("div", "kn-prune");
  const cfgMax = g.gotchas_max;
  box.append(el("div", "kn-prune-head", t("knowledge.gotchas.headroom", { n: g.count, max: cfgMax === undefined ? "?" : cfgMax })));
  box.append(el("pre", "cmd", "orc gotcha prune"));
  const acts = el("div", "row-actions");
  const preview = el("button", "btn btn-sm", t("knowledge.gotchas.preview"));
  preview.type = "button";
  const apply = el("button", "btn btn-sm btn-primary", t("knowledge.gotchas.prune"));
  apply.type = "button";
  apply.disabled = true;
  const list = el("div", "stack stack-sm");
  preview.addEventListener("click", async () => {
    const r = await read("/api/gotcha/prune/preview").catch(() => ({ data: null }));
    const d = r.data;
    list.replaceChildren();
    if (!d || !(d.would_archive || []).length) {
      list.append(el("div", "note ok", t("knowledge.gotchas.pruneNone")));
      apply.disabled = true;
      return;
    }
    list.append(el("div", "note warn", t("knowledge.gotchas.pruneWould", { n: d.would_archive.length })));
    for (const e of d.would_archive) list.append(el("div", "note mono", `${e.id} · ${e.area} · ${e.kind} · hits ${e.hits} · ${e.last_seen || "?"}`));
    list.append(el("div", "note", d.honesty));
    apply.disabled = false;
  });
  apply.addEventListener("click", async () => {
    const r = await post("/api/gotcha/prune", {});
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    renderKnowledge(body);
  });
  acts.append(preview, apply);
  box.append(acts, list);
  return box;
}

/* ── TAB 5 — PEERS ───────────────────────────────────────────────────────── */
/* COMPACT and READ-ONLY. It links to Crosslink and NEVER duplicates its editor:
   one boundary, one picture. This tab exists because "what does ORC know?"
   includes what it knows from next door, and that is where a user looks first. */
function knPeersTab(d) {
  const out = frag();
  const c = card(t("knowledge.peers.title"));
  c.append(el("div", "note", t("knowledge.peers.note")));
  const go = el("button", "btn btn-ghost btn-sm", t("knowledge.peers.open"));
  go.type = "button";
  go.addEventListener("click", () => {
    location.hash = "#/crosslink";
  });
  c.append(go);
  out.append(c);
  renderPeers(c);
  return out;
}

async function renderPeers(host) {
  const r = await read("/api/crosslink").catch(() => ({ data: null }));
  const d = r.data;
  if (!d) return;
  if (!d.configured || !(d.nodes || []).length) {
    host.append(el("div", "note", t("knowledge.peers.none")));
    return;
  }
  const scroll = el("div", "scroll-x");
  const table = el("table");
  const thead = el("thead");
  const hr = el("tr");
  for (const h of [
    t("knowledge.peers.col.repo"),
    t("knowledge.peers.col.state"),
    t("knowledge.peers.col.tier"),
    t("knowledge.peers.col.tags"),
  ])
    hr.append(el("th", null, h));
  thead.append(hr);
  const tb = el("tbody");
  for (const n of d.nodes) {
    const prov = n.provider || {};
    const tr = el("tr");
    tr.append(el("td", "mono", n.name));
    const st = el("td");
    // Every word here is the CLI's own — the peer's state, and the peer's
    // freshness tier as IT computed it. A peer's config is not ours to read
    // (`crosslinkProviderInfo`), so nothing here is recomputed on this side.
    st.append(chip(prov.state || "—", prov.state === "wiki" ? "ok" : "warn"));
    tr.append(st);
    const tc = el("td");
    if (prov.tier) tc.append(chip(prov.tier, prov.tier === "FRESH" ? "ok" : prov.tier === "AGING" ? "warn" : "bad"));
    else tc.append(el("span", "note", "—"));
    tr.append(tc);
    tr.append(el("td", "num", prov.tags === undefined ? "—" : String(prov.tags)));
    tb.append(tr);
  }
  table.append(thead, tb);
  scroll.append(table);
  host.append(scroll);
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
  void plan;
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
