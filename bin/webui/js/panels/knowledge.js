"use strict";
/* panels/knowledge.js — orc ui client
   What ORC knows about this repo: the wiki, its coverage, the code patterns,
   the repair memory, and what it knows from next door.

   SIX TABS since v1.9.2 (the code graph got its own), FIVE since v0.49.1 —
   the Crosslink two-tab precedent. This was one
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
  const [wikiRes, impactRes, patRes, gotRes, planRes, debtRes, usageRes, docsRes, covRes, refsRes, graphRes, gainRes] = await Promise.all([
    read("/api/wiki").catch((e) => ({ data: null, error: e })),
    read("/api/wiki/impact").catch((e) => ({ data: null, error: e })),
    read("/api/patterns").catch((e) => ({ data: null, error: e })),
    read("/api/gotchas").catch((e) => ({ data: null, error: e })),
    read("/api/wiki/plan").catch((e) => ({ data: null, error: e })),
    read("/api/wiki/debt").catch((e) => ({ data: null, error: e })),
    read("/api/wiki/usage").catch((e) => ({ data: null, error: e })),
    read("/api/wiki/docs").catch((e) => ({ data: null, error: e })),
    read("/api/wiki/coverage").catch((e) => ({ data: null, error: e })),
    // v1.7.0 — the derived-reference sweep. `--check`, always: opening a panel
    // must never write to a repo.
    read("/api/wiki/refs").catch((e) => ({ data: null, error: e })),
    // v1.8.0 — the code graph. `graph status` exits 0-3 and every code is DATA.
    read("/api/graph").catch((e) => ({ data: null, error: e })),
    // v1.8.2 W4b — the gain meter. Exit 1 (no ledger yet) is DATA, like every
    // other read on this panel.
    read("/api/graph/gain").catch((e) => ({ data: null, error: e })),
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
    refs: refsRes.data,
    graph: graphRes.data,
    graphGain: gainRes.data,
    // A read that FAILED is not the same as a read that came back empty, and
    // rendering them identically is what turned a truncated 30 KB payload into
    // "this repo has no wiki and no git" (v0.49.4). The server already puts the
    // CLI's own words in the 500 body; the panel just has to stop discarding
    // them.
    errors: { coverage: covRes.error || null, docs: docsRes.error || null },
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
    graph: () => knGraphTab(d, body),
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
    // v1.9.2 — the code graph moved off the Wiki tab onto its own.
    ["graph", t("knowledge.tab.graph")],
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
  // The graph's state word is the CLI's own, upper-cased like the wiki tier.
  item(t("knowledge.strip.graph"), d.graph && d.graph.state ? String(d.graph.state).toUpperCase() : "—");
  return strip;
}

/* THE CODE GRAPH CARD (v1.8.0). Every value is `orc graph status --json`'s, and
   the state word is never replaced by a friendlier synonym. An update is FREE
   (parser only, no model), so it is a button; an OFF graph shows the one config
   command that turns it on, because turning a feature on is the user's call. */
// `exact` (v1.9.2): on the Code graph tab the state ladder above already carries
// the chip and the update button, so this card is the exact numbers only.
function graphCard(g, body, gain, exact) {
  const c = card(exact ? t("knowledge.cg.exact.title") : t("knowledge.graph.title"));
  if (!g || !g.state) {
    c.append(empty(t("knowledge.graph.unknown"), t("knowledge.graph.unknownHint")));
    return c;
  }
  if (g.state === "off") {
    c.append(empty(t("knowledge.graph.off"), t("knowledge.graph.offHint")));
    c.append(el("pre", "cmd", "orc config set code_graph on"));
    return c;
  }
  if (exact) c.append(el("div", "note", t("knowledge.cg.exact.lead")));
  const head = el("div", "row-actions");
  head.append(chip(String(g.state).toUpperCase(), g.state === "fresh" ? "ok" : g.state === "drifted" ? "warn" : "idle", g.state === "drifted"));
  const upd = el("button", "btn btn-sm", "orc graph update");
  upd.type = "button";
  upd.addEventListener("click", async () => {
    const r = await post("/api/graph/update", {});
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    renderKnowledge(body);
  });
  head.append(upd);
  if (!exact) c.append(head);
  if (g.state === "none") {
    c.append(el("div", "note", t("knowledge.graph.none")));
    return c;
  }
  const b = g.behind || {};
  c.append(
    kvList([
      [t("knowledge.graph.files"), String(g.files)],
      [t("knowledge.graph.symbols"), String(g.symbols)],
      // EW1 — the generation is what a card quotes back, so the panel shows the
      // one on disk right now. `gen_id` names the CONTENT behind that number.
      [t("knowledge.graph.generation"), g.generation ? `${g.generation}${g.gen_id ? ` · ${g.gen_id}` : ""}` : "—"],
      [t("knowledge.graph.updated"), g.updated_at || "—"],
      [t("knowledge.graph.behind"), g.behind ? `+${b.added || 0} · ~${b.changed || 0} · -${b.deleted || 0}` : "—"],
      // `code_graph_notes` is a config VALUE — shown, never translated.
      [t("knowledge.graph.notes"), g.notes || "—"],
      // A1 (v1.9.1) — how many named symbols the parser found per file, and how
      // many files it read as EMPTY. A graph nobody can get an answer out of
      // looks exactly like a healthy one until this row is on the card.
      ...(g.density
        ? [
            [
              t("knowledge.graph.density"),
              `${g.density.symbols_per_file} symbols/file · ${Math.round(g.density.zero_share * 100)} % files empty${g.thin ? " · THIN" : ""}`,
            ],
          ]
        : []),
    ])
  );
  if (g.thin) c.append(el("div", "note warn", t("knowledge.graph.thin")));
  if (g.state === "drifted") c.append(el("div", "note warn", t("knowledge.graph.drifted")));
  // EW3/EW4 — two things keep the map fresh without a lane step. A panel that
  // shows a DRIFTED map without saying that is a panel that invites a needless
  // click.
  if (!exact) {
    c.append(el("div", "note", t("knowledge.graph.selfheal")));
    c.append(el("div", "note", t("knowledge.graph.locator")));
  }
  // K5 (v1.8.2 W4b) — the gain strip. It renders exactly the CLI's JSON and
  // invents nothing: the word "estimate" is part of the string, never a
  // tooltip, and `avoided` is a RANGE because one number for a counterfactual
  // is the claim this whole meter refuses to make.
  gainStrip(c, gain, body);
  return c;
}

function gainStrip(c, g, body) {
  if (!g || g.state !== "rows") {
    c.append(el("div", "note", t("knowledge.gain.none")));
    return;
  }
  c.append(
    el(
      "div",
      "note",
      t("knowledge.gain.strip")
        .replace("{paid}", kTokUi(g.paid.total))
        .replace("{low}", kTokUi(g.avoided.low))
        .replace("{high}", kTokUi(g.avoided.high))
        .replace("{calls}", String(g.calls_recorded))
    )
  );
  c.append(
    kvList([
      // M3 (v1.9.1) — the ENVELOPE beside the cards. Until this release `paid`
      // counted the card and called itself exact, and the card is between a
      // quarter and an eighth of the answer a lane actually receives.
      [t("knowledge.gain.paid"), `${kTokUi(g.paid.total)}  (${kTokUi(g.paid.card)} · ${kTokUi(g.paid.source)} · ${kTokUi(g.paid.hints)} · ${kTokUi(g.paid.envelope || 0)})`],
      [t("knowledge.gain.avoided"), `~${kTokUi(g.avoided.low)} – ${kTokUi(g.avoided.high)}`],
      [t("knowledge.gain.net"), `~${kTokUi(g.net.low)} – ${kTokUi(g.net.high)}  ·  ~${g.calls.low} – ${g.calls.high}`],
      [t("knowledge.gain.byCommand"), Object.entries(g.by_command).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"],
      // R2 (v1.9.1) — the wide whole-file reads no hint named. A ledger written
      // before 1.9.1 has no such count and reads as 0.
      [t("knowledge.gain.hints"), `${g.hints.injected} · ${g.hints.read_notes} · ${g.hints.updates} · ${g.hints.wide_unhinted || 0}`],
      // M2 — the reads this project never made. A fact, with no advice after it.
      ...(g.never_called && g.never_called.length ? [[t("knowledge.gain.never"), g.never_called.join(" · ")]] : []),
    ])
  );
  const btn = el("button", "btn btn-sm", t("knowledge.gain.measure"));
  btn.type = "button";
  const out = el("div", "note");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const r = await read("/api/graph/gain/measured").catch(() => ({ data: null }));
    btn.disabled = false;
    out.textContent = measuredText(r && r.data);
  });
  c.append(btn);
  c.append(out);
  c.append(el("div", "note", t("knowledge.gain.estimate")));
}

// The A/B in words. Every delta carries its N and the OFF group's own spread,
// because a delta smaller than that spread is noise and the panel must say so
// in the same sentence, never in a footnote.
function measuredText(m) {
  if (!m || !m.compare) return t("knowledge.gain.measuredFew");
  const c = m.compare;
  const row = (label, x, unit) =>
    `${label} ${x.off.median} → ${x.on.median} ${unit} (${x.delta_pct > 0 ? "+" : ""}${x.delta_pct}%, N ${x.off.n}/${x.on.n}, OFF spread ±${x.off_spread_pct}%)`;
  return [
    t("knowledge.gain.measuredHead").replace("{on}", String(m.runs.on)).replace("{off}", String(m.runs.off)),
    row(t("knowledge.gain.execCalls"), c.exec_retrieval_calls, "calls"),
    row(t("knowledge.gain.execTokens"), c.exec_result_tokens, "tokens"),
    row(t("knowledge.gain.sessionTokens"), c.session_result_tokens, "tokens"),
    t("knowledge.gain.noise"),
  ].join("  ·  ");
}

/* ── TAB 1 — WIKI ────────────────────────────────────────────────────────── */
function knWikiTab(d, body) {
  const out = frag();
  out.append(wikiPlanCard(d.plan, d.debt, body));
  out.append(wikiOneDocCard(d.refs));
  // v1.9.2 — the code graph card moved to its own tab (knGraphTab).
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
  out.append(d.errors && d.errors.docs ? failBox(d.errors.docs) : wikiDocsCard(d.docs));

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
  // The read itself failed — a crash, a timeout, output the server could not
  // parse. That is a BROKEN PANEL, not a repo without a wiki, and it must never
  // again be reported as the latter.
  if (d.errors && d.errors.coverage) {
    c.append(failBox(d.errors.coverage));
    out.append(c);
    return out;
  }
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
    const r = await read("/api/gotchas/archived").catch((e) => ({ data: null, error: e }));
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
    const r = await read("/api/gotcha/prune/preview").catch((e) => ({ data: null, error: e }));
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
  const r = await read("/api/crosslink").catch((e) => ({ data: null, error: e }));
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

/* ONE DOC AT A TIME (v1.7.0).
   Two halves of the same question, and neither of them scans.

   The RESOLVER answers "is this topic already in the wiki?" — free, from the
   doc headers. It is a probe, so the panel runs it; the refresh or the add that
   follows is a LANE, so the panel prints the command and stops. That is the
   panel's standing line, visible here rather than implied: a free action gets a
   button, a paid one gets a command you can copy.

   The SWEEP is `orc wiki refs --check`. It exists because after ONE doc changes,
   the surfaces DERIVED from the doc set are behind it — and on a small run
   nobody remembers to look. `--check`, always: opening a panel must never write
   to a repo. */
const REFS_STATE_KIND = { clean: "ok", repaired: "ok", absent: "", behind: "warn", outstanding: "warn", missing: "warn", drifted: "bad", dead: "warn" };

function wikiOneDocCard(refs) {
  const c = card(t("knowledge.one.title"));
  c.append(el("div", "note", t("knowledge.one.lead")));

  // ── the resolver ──────────────────────────────────────────────────────────
  const row = el("div", "row-actions");
  const input = el("input", "text-input kn-one-topic");
  input.type = "text";
  input.placeholder = t("knowledge.one.placeholder");
  input.setAttribute("aria-label", t("knowledge.one.placeholder"));
  const go = el("button", "btn btn-sm btn-primary", t("knowledge.one.resolve"));
  go.type = "button";
  row.append(input, go);
  c.append(row);

  const out = el("div", "kn-one-out");
  c.append(out);

  const resolve = async () => {
    const topic = input.value.trim();
    if (!topic) return;
    go.disabled = true;
    out.replaceChildren(skeleton(1));
    try {
      const r = await read("/api/wiki/resolve?topic=" + encodeURIComponent(topic));
      const d = r.data || {};
      out.replaceChildren();
      if (!d.ok) {
        out.append(el("div", "note warn", d.hint || t("knowledge.one.cannot")));
        return;
      }
      const head = el("div", "row-actions");
      // The CLI's own verdict word, never a friendlier synonym.
      head.append(chip(d.verdict, d.verdict === "match" ? "ok" : d.verdict === "ambiguous" ? "warn" : ""));
      if (d.verdict === "match") head.append(el("span", "mono", d.match.file));
      out.append(head);

      if (d.verdict === "match") out.append(el("div", "note", d.match.why.slice(0, 4).join(" · ")));
      // AMBIGUOUS is a question, not a guess: every candidate is listed with its
      // score, and no command is offered until a human picks one.
      if (d.verdict === "ambiguous")
        for (const cand of d.candidates || []) {
          const cr = el("div", "kn-one-cand");
          cr.append(el("span", "note mono", String(cand.score)));
          cr.append(el("span", "mono", cand.file));
          cr.append(el("span", "note", (cand.why || []).slice(0, 3).join(" · ")));
          out.append(cr);
        }
      if (d.verdict === "new" && (d.suggested_covers || []).length) {
        out.append(el("div", "note", t("knowledge.one.proposed")));
        for (const s of d.suggested_covers) {
          const sr = el("div", "kn-one-cand");
          sr.append(el("span", "mono", s.glob));
          sr.append(el("span", "note", tn(s.matches, "knowledge.one.files")));
          out.append(sr);
        }
        // The CLI's own caveat, relayed. A proposal that arrives without it
        // reads as an answer.
        out.append(el("div", "note", d.note));
      }
      // A LANE costs money, so it is a command to copy, never a button.
      out.append(laneCommand(d.next, t("knowledge.one.next")));
    } catch (e) {
      out.replaceChildren(failBox(e));
    } finally {
      go.disabled = false;
    }
  };
  go.addEventListener("click", resolve);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") resolve();
  });

  // ── the sweep ─────────────────────────────────────────────────────────────
  if (refs && refs.items) {
    const sweep = el("div", "kn-one-sweep");
    sweep.append(el("div", "checklist-head", t("knowledge.one.sweep")));
    for (const i of refs.items) {
      const ir = el("div", "kn-one-ref");
      ir.append(chip(i.state, REFS_STATE_KIND[i.state] || ""));
      ir.append(el("span", "mono", i.id));
      ir.append(el("span", "note", i.what));
      sweep.append(ir);
      if (i.fix) sweep.append(el("div", "note kn-one-fix", "→ " + i.fix + "  (" + i.cost + ")"));
    }
    // WHY only one surface is ever repaired. Relayed from the CLI, because a
    // sweep that looked like it fixed everything would be the more dangerous
    // reading.
    sweep.append(el("div", "note", refs.note));
    c.append(sweep);
  } else if (refs && refs.hint) {
    c.append(el("div", "note", refs.hint));
  }
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

/* ── TAB 6 — CODE GRAPH (v1.9.2) ──────────────────────────────────────────────
   The graph used to be one card on the Wiki tab: a list of exact numbers and no
   picture of what any of them meant. It has its own tab now, in reading order:
   WHERE THIS GRAPH STANDS (the state ladder and the one action it needs), WHAT
   IT IS (the pipeline), WHAT A GRAPH LOOKS LIKE (an example, labelled as one),
   THE NUMBERS (drawn to scale), WHAT IT COST AND SAVED (two bars on one scale),
   every exact number, and what each word means.

   THE PICTURES DERIVE NOTHING. Every number is `orc graph status --json` or
   `orc graph gain --json`, drawn to scale and never re-computed into a new
   claim. The example graph is static prose, and it says so on its face. */
function knGraphTab(d, body) {
  const out = frag();
  const g = d.graph;
  const live = !!(g && (g.state === "fresh" || g.state === "drifted"));
  out.append(cgStateCard(g, body));
  out.append(cgFlowCard(g, live));
  out.append(cgAnatomyCard());
  if (live) out.append(cgNumbersCard(g));
  if (g && g.state && g.state !== "off") out.append(cgGainCard(d.graphGain));
  if (live) out.append(graphCard(g, body, d.graphGain, true));
  out.append(cgGlossaryCard());
  return out;
}

// Reduced motion means the final number at once — never a count that moves.
const cgStill = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// Counts a tile up to the CLI's number, then writes the CLI's own string, so the
// resting value is exactly what `--json` sent.
function cgCount(node, value, delay) {
  const final = value === undefined || value === null ? "—" : String(value);
  const n = Number(value);
  if (value === undefined || value === null || !Number.isFinite(n) || cgStill()) {
    node.textContent = final;
    return;
  }
  const dec = Number.isInteger(n) ? 0 : 1;
  node.textContent = (0).toFixed(dec);
  const dur = 1100;
  let start = null;
  const step = (ts) => {
    if (start === null) start = ts;
    const p = Math.min(1, (ts - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = p < 1 ? (n * eased).toFixed(dec) : final;
    if (p < 1) requestAnimationFrame(step);
  };
  setTimeout(() => requestAnimationFrame(step), delay || 0);
}

// A bar segment that grows to its share. The width is set through CSSOM, never a
// `style` attribute (the panel serves under `style-src 'self'`).
function cgSeg(cls, share, label) {
  const s = el("div", "cg-seg " + cls);
  s.style.setProperty("--w", Math.max(0, Math.min(100, share * 100)).toFixed(2) + "%");
  if (label) s.title = label;
  return s;
}

/* ── 1. the state ladder ─────────────────────────────────────────────────────
   Four states, in the order a graph lives through them. The word is the CLI's;
   the sentence under it says what it means, and the connector says what moves
   the graph to the next one. */
function cgStateCard(g, body) {
  const c = card(t("knowledge.cg.state.title"));
  if (!g || !g.state) {
    c.append(empty(t("knowledge.graph.unknown"), t("knowledge.graph.unknownHint")));
    return c;
  }
  c.append(el("div", "note", t("knowledge.cg.state.lead")));
  const ladder = el("div", "cg-ladder");
  const steps = [
    ["OFF", t("knowledge.cg.state.off"), t("knowledge.cg.state.toNone")],
    ["NONE", t("knowledge.cg.state.none"), t("knowledge.cg.state.toFresh")],
    ["FRESH", t("knowledge.cg.state.fresh"), t("knowledge.cg.state.toDrifted")],
    ["DRIFTED", t("knowledge.cg.state.drifted"), null],
  ];
  // The CLI's state word, upper-cased the way the header strip shows it.
  const nowWord = String(g.state).toUpperCase();
  steps.forEach(([word, what, next], i) => {
    const here = nowWord === word;
    const s = el("div", "cg-step cg-step-" + word.toLowerCase() + (here ? " cg-step-now" : ""));
    s.style.setProperty("--i", String(i));
    const dot = el("span", "cg-step-dot");
    if (here) dot.append(el("span", "cg-beacon"));
    s.append(dot);
    s.append(el("span", "cg-step-word", word));
    s.append(el("span", "cg-step-what", what));
    if (here) s.append(el("span", "cg-step-here", t("knowledge.cg.state.here")));
    ladder.append(s);
    if (next) {
      const link = el("div", "cg-step-link");
      link.style.setProperty("--i", String(i));
      link.append(el("span", "cg-step-line"));
      link.append(el("span", "cg-step-next", next));
      ladder.append(link);
    }
  });
  // The loop back: a DRIFTED graph becomes FRESH again with one free update.
  c.append(ladder, el("div", "cg-loop", t("knowledge.cg.state.loop")));

  // What to do now — the ONE action this state needs, or none.
  const now = el("div", "cg-now cg-now-" + g.state);
  if (g.state === "off") {
    now.append(el("div", null, t("knowledge.cg.now.off")));
    now.append(el("pre", "cmd", "orc config set code_graph on"));
  } else if (g.state === "none" || g.state === "drifted") {
    now.append(el("div", null, g.state === "none" ? t("knowledge.cg.now.none") : t("knowledge.cg.now.drifted")));
    const upd = el("button", "btn btn-sm", "orc graph update");
    upd.type = "button";
    upd.addEventListener("click", async () => {
      upd.disabled = true;
      const r = await post("/api/graph/update", {});
      toast(r.command, r.ok ? "ok" : "bad", r.output);
      renderKnowledge(body);
    });
    now.append(upd);
  } else {
    now.append(el("div", null, t("knowledge.cg.now.fresh")));
  }
  c.append(now);
  // The line a lane prints into the chat, verbatim. It is the CLI's sentence.
  if (g.line) {
    c.append(el("div", "note", t("knowledge.cg.state.lineNote")));
    c.append(el("pre", "cmd cg-line", g.line));
  }
  return c;
}

/* ── 2. the pipeline ─────────────────────────────────────────────────────────
   Five stations, left to right, with dots running between them. The first
   three are free (a parser, no model); the card at the end is what a lane
   pays for in context tokens. */
function cgFlowCard(g, live) {
  const c = card(t("knowledge.cg.flow.title"));
  c.append(el("div", "note", t("knowledge.cg.flow.lead")));
  const rail = el("div", "cg-flow");
  const stations = [
    ["</>", t("knowledge.cg.flow.code"), t("knowledge.cg.flow.codeWhat"), live ? t("knowledge.cg.flow.files", { n: g.files }) : null, "free"],
    ["f(x)", t("knowledge.cg.flow.parse"), t("knowledge.cg.flow.parseWhat"), t("knowledge.cg.flow.parseCost"), "free"],
    ["◉─◉", t("knowledge.cg.flow.store"), t("knowledge.cg.flow.storeWhat"), live ? t("knowledge.cg.flow.symbols", { n: g.symbols }) : null, "free"],
    ["?", t("knowledge.cg.flow.ask"), t("knowledge.cg.flow.askWhat"), "ctx · impact · map", null],
    ["▤", t("knowledge.cg.flow.card"), t("knowledge.cg.flow.cardWhat"), t("knowledge.cg.flow.cardCost"), "paid"],
  ];
  stations.forEach(([glyph, name, what, value, cost], i) => {
    if (i) {
      const link = el("div", "cg-link");
      link.style.setProperty("--i", String(i));
      for (let k = 0; k < 3; k++) {
        const dot = el("span", "cg-link-dot");
        dot.style.setProperty("--k", String(k));
        link.append(dot);
      }
      rail.append(link);
    }
    const s = el("div", "cg-station" + (cost ? " cg-cost-" + cost : ""));
    s.style.setProperty("--i", String(i));
    s.append(el("span", "cg-station-num", String(i + 1)));
    s.append(el("span", "cg-station-glyph", glyph));
    s.append(el("span", "cg-station-name", name));
    s.append(el("span", "cg-station-what", what));
    if (value) s.append(el("span", "cg-station-value", value));
    rail.append(s);
  });
  c.append(rail);
  // The second layer — the only one that can cost a model.
  const notes = el("div", "cg-notes-layer");
  notes.append(el("span", "cg-notes-tag", t("knowledge.cg.flow.notesTag")));
  notes.append(el("span", null, t("knowledge.cg.flow.notes", { mode: g && g.notes ? g.notes : "—" })));
  c.append(notes);
  c.append(el("div", "note", t("knowledge.graph.locator")));
  return c;
}

/* ── 3. the anatomy — an EXAMPLE graph ───────────────────────────────────────
   Four small files from a made-up shop, drawn the way the graph sees them.
   It is never this repo's code, and the card says so in its title. Point at a
   dot and the caption says what `orc graph ctx` would answer for it. */
const CG_SAMPLE = {
  files: [
    { name: "routes/orders.js", x: 16, y: 34, w: 212, h: 236 },
    { name: "middleware/auth.js", x: 262, y: 20, w: 184, h: 110 },
    { name: "services/orders.js", x: 262, y: 162, w: 184, h: 122 },
    { name: "db/index.js", x: 480, y: 96, w: 184, h: 116 },
  ],
  syms: [
    { id: "route", label: "GET /orders/:id", x: 122, y: 110 },
    { id: "list", label: "listOrders", x: 122, y: 206 },
    { id: "auth", label: "requireAuth", x: 354, y: 78 },
    { id: "find", label: "findOrder", x: 354, y: 226 },
    { id: "query", label: "query", x: 572, y: 158 },
  ],
  // kind: call (solid, a dot runs along it) · ref (dashed) · import (dotted, file to file)
  edges: [
    { from: "route", to: "auth", kind: "ref" },
    { from: "route", to: "find", kind: "call" },
    { from: "list", to: "find", kind: "call" },
    { from: "find", to: "query", kind: "call" },
    { from: "f1", to: "f2", kind: "import", d: "M228 60 L262 60" },
    { from: "f1", to: "f3", kind: "import", d: "M228 256 L262 256" },
    { from: "f3", to: "f4", kind: "import", d: "M446 196 L480 184" },
  ],
};

// The captions, one per example dot. Keys are written out in full.
const CG_CAPTION = {
  route: () => t("knowledge.cg.anatomy.route"),
  list: () => t("knowledge.cg.anatomy.list"),
  auth: () => t("knowledge.cg.anatomy.auth"),
  find: () => t("knowledge.cg.anatomy.find"),
  query: () => t("knowledge.cg.anatomy.query"),
};

function cgSvg(tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
  return node;
}

function cgAnatomyCard() {
  const c = card(t("knowledge.cg.anatomy.title"));
  c.append(el("div", "note", t("knowledge.cg.anatomy.lead")));
  const wrap = el("div", "cg-anatomy");
  const scroll = el("div", "scroll-x cg-anatomy-scroll");
  const svg = cgSvg("svg", { class: "cg-svg", viewBox: "0 0 680 300", role: "img", "aria-label": t("knowledge.cg.anatomy.title") });
  const defs = cgSvg("defs");
  for (const [id, cls] of [["cg-arrow-call", "cg-head-call"], ["cg-arrow-ref", "cg-head-ref"]]) {
    const m = cgSvg("marker", { id, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    m.append(cgSvg("path", { d: "M0 0 L10 5 L0 10 z", class: cls }));
    defs.append(m);
  }
  svg.append(defs);

  CG_SAMPLE.files.forEach((f, i) => {
    const gF = cgSvg("g", { class: "cg-file" });
    gF.style.setProperty("--d", i * 90 + "ms");
    gF.append(cgSvg("rect", { x: f.x, y: f.y, width: f.w, height: f.h, rx: 10 }));
    const label = cgSvg("text", { x: f.x + 12, y: f.y + 20, class: "cg-file-name" });
    label.textContent = f.name;
    gF.append(label);
    svg.append(gF);
  });
  const pos = {};
  for (const s of CG_SAMPLE.syms) pos[s.id] = s;

  // Edges first, so the dots sit on top of them.
  const edgeEls = [];
  CG_SAMPLE.edges.forEach((e, i) => {
    let d = e.d;
    if (!d) {
      const a = pos[e.from];
      const b = pos[e.to];
      const mx = (a.x + b.x) / 2;
      d = `M${a.x + 10} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x - 11} ${b.y}`;
    }
    const gE = cgSvg("g", { class: "cg-edge cg-edge-" + e.kind });
    gE.dataset.from = e.from;
    gE.dataset.to = e.to;
    gE.style.setProperty("--d", 380 + i * 110 + "ms");
    const attrs = { d, pathLength: 1, class: "cg-edge-line" };
    if (e.kind === "call") attrs["marker-end"] = "url(#cg-arrow-call)";
    if (e.kind === "ref") attrs["marker-end"] = "url(#cg-arrow-ref)";
    gE.append(cgSvg("path", attrs));
    if (e.kind === "call") {
      const p = cgSvg("path", { d, pathLength: 1, class: "cg-pulse" });
      p.style.setProperty("--d", 1200 + i * 450 + "ms");
      gE.append(p);
    }
    svg.append(gE);
    edgeEls.push(gE);
  });

  const caption = el("div", "cg-caption");
  const setCaption = (id) => {
    caption.replaceChildren();
    if (!id) {
      caption.append(el("span", "cg-caption-hint", t("knowledge.cg.anatomy.hint")));
      return;
    }
    const s = pos[id];
    caption.append(el("span", "cg-caption-sym mono", s.label));
    caption.append(el("span", "cg-caption-text", CG_CAPTION[id]()));
    caption.append(el("span", "cg-caption-cmd mono", "orc graph ctx " + (s.label.includes(" ") ? `"${s.label}"` : s.label)));
  };
  const focus = (id) => {
    wrap.classList.toggle("cg-focus", !!id);
    for (const gE of edgeEls) gE.classList.toggle("cg-edge-hi", !!id && (gE.dataset.from === id || gE.dataset.to === id));
    for (const n of svg.querySelectorAll(".cg-sym")) n.classList.toggle("cg-sym-hi", n.dataset.id === id);
    setCaption(id);
  };

  CG_SAMPLE.syms.forEach((s, i) => {
    const gS = cgSvg("g", { class: "cg-sym", tabindex: 0, role: "button", "aria-label": s.label });
    gS.dataset.id = s.id;
    gS.style.setProperty("--d", 200 + i * 80 + "ms");
    gS.append(cgSvg("circle", { cx: s.x, cy: s.y, r: 16, class: "cg-sym-halo" }));
    gS.append(cgSvg("circle", { cx: s.x, cy: s.y, r: 8, class: "cg-sym-dot" }));
    const tx = cgSvg("text", { x: s.x, y: s.y - 20, class: "cg-sym-name", "text-anchor": "middle" });
    tx.textContent = s.label;
    gS.append(tx);
    gS.addEventListener("mouseenter", () => focus(s.id));
    gS.addEventListener("focus", () => focus(s.id));
    gS.addEventListener("mouseleave", () => focus(null));
    gS.addEventListener("blur", () => focus(null));
    svg.append(gS);
  });

  scroll.append(svg);
  wrap.append(scroll);
  setCaption(null);
  wrap.append(caption);

  // The legend: every mark on the picture, and what it means.
  const legend = el("div", "cg-legend");
  for (const [cls, name, what] of [
    ["cg-lg-file", t("knowledge.cg.legend.file"), t("knowledge.cg.legend.fileWhat")],
    ["cg-lg-sym", t("knowledge.cg.legend.symbol"), t("knowledge.cg.legend.symbolWhat")],
    ["cg-lg-call", t("knowledge.cg.legend.call"), t("knowledge.cg.legend.callWhat")],
    ["cg-lg-ref", t("knowledge.cg.legend.ref"), t("knowledge.cg.legend.refWhat")],
    ["cg-lg-import", t("knowledge.cg.legend.import"), t("knowledge.cg.legend.importWhat")],
  ]) {
    const row = el("div", "cg-legend-row");
    row.append(el("span", "cg-lg " + cls));
    const txt = el("div", "cg-legend-text");
    txt.append(el("strong", null, name));
    txt.append(el("span", "note", what));
    row.append(txt);
    legend.append(row);
  }
  wrap.append(legend);
  c.append(wrap);
  return c;
}

/* ── 4. the numbers, drawn ───────────────────────────────────────────────────
   Tiles that count up to the CLI's own number, the three change counts, and
   the density as a bar — per language when the CLI sent the split. */
function cgNumbersCard(g) {
  const c = card(t("knowledge.cg.num.title"));
  const tiles = el("div", "cg-tiles");
  const tile = (label, value, what, i) => {
    const box = el("div", "cg-tile");
    box.style.setProperty("--i", String(i));
    const v = el("span", "cg-tile-value");
    cgCount(v, value, i * 120);
    box.append(v, el("span", "cg-tile-label", label), el("span", "cg-tile-what", what));
    tiles.append(box);
  };
  tile(t("knowledge.graph.files"), g.files, t("knowledge.cg.num.filesWhat"), 0);
  tile(t("knowledge.graph.symbols"), g.symbols, t("knowledge.cg.num.symbolsWhat"), 1);
  tile(t("knowledge.cg.num.perFile"), g.density ? g.density.symbols_per_file : undefined, t("knowledge.cg.num.perFileWhat"), 2);
  tile(t("knowledge.graph.generation"), g.generation, t("knowledge.cg.num.generationWhat"), 3);
  c.append(tiles);

  // What changed since the map was last built. Three counts, the CLI's.
  if (g.behind) {
    const b = g.behind;
    const row = el("div", "cg-behind");
    row.append(el("span", "cg-behind-label", t("knowledge.cg.num.behind")));
    for (const [cls, sign, n, label] of [
      ["cg-b-add", "+", b.added || 0, t("knowledge.cg.num.added")],
      ["cg-b-chg", "~", b.changed || 0, t("knowledge.cg.num.changed")],
      ["cg-b-del", "-", b.deleted || 0, t("knowledge.cg.num.deleted")],
    ]) {
      const chipEl = el("span", "cg-bchip " + cls + (n ? "" : " cg-b-zero"));
      chipEl.append(el("strong", null, sign + n), el("span", null, label));
      row.append(chipEl);
    }
    c.append(row);
  }

  // The density. `zero_share` is the CLI's; the bar only draws it.
  if (g.density) {
    const den = g.density;
    const pctEmpty = Math.round(den.zero_share * 100);
    c.append(el("div", "cg-sub", t("knowledge.cg.num.densityTitle")));
    const bar = el("div", "cg-bar");
    bar.append(cgSeg("cg-seg-ok", 1 - den.zero_share), cgSeg("cg-seg-empty", den.zero_share));
    c.append(bar);
    const key = el("div", "cg-bar-key");
    key.append(el("span", "cg-key cg-key-ok", t("knowledge.cg.num.hasSymbols", { pct: 100 - pctEmpty })));
    key.append(el("span", "cg-key cg-key-empty", t("knowledge.cg.num.empty", { pct: pctEmpty, n: den.zero_files })));
    c.append(key);
    if (den.by_lang && Object.keys(den.by_lang).length) {
      const langs = el("div", "cg-langs");
      Object.entries(den.by_lang).forEach(([lang, v], i) => {
        const r = el("div", "cg-lang");
        r.style.setProperty("--i", String(i));
        r.append(el("span", "cg-lang-name mono", lang));
        const lb = el("div", "cg-bar cg-bar-sm");
        const share = v.files ? v.zero / v.files : 0;
        lb.append(cgSeg("cg-seg-ok", 1 - share), cgSeg("cg-seg-empty", share));
        r.append(lb);
        r.append(el("span", "cg-lang-nums", t("knowledge.cg.num.lang", { files: v.files, symbols: v.symbols, zero: v.zero })));
        langs.append(r);
      });
      c.append(langs);
    }
    c.append(el("div", "note", t("knowledge.cg.num.densityNote")));
    if (g.thin) c.append(el("div", "note warn", t("knowledge.graph.thin")));
  }
  return c;
}

/* ── 5. what it cost, and what it probably saved ─────────────────────────────
   Two bars on ONE scale. `paid` is exact and solid; `avoided` is an ESTIMATE
   and a RANGE, so it is drawn solid to its low end and striped to its high
   end — a single-number bar for a counterfactual is the claim this meter
   refuses to make. */
const CG_READS = {
  ctx: () => t("knowledge.cg.read.ctx"),
  "for-slice": () => t("knowledge.cg.read.forSlice"),
  impact: () => t("knowledge.cg.read.impact"),
  map: () => t("knowledge.cg.read.map"),
  changes: () => t("knowledge.cg.read.changes"),
  cochange: () => t("knowledge.cg.read.cochange"),
  coverage: () => t("knowledge.cg.read.coverage"),
  path: () => t("knowledge.cg.read.path"),
};

function cgGainCard(gain) {
  const c = card(t("knowledge.cg.gain.title"));
  if (!gain || gain.state !== "rows") {
    c.append(empty(t("knowledge.gain.none"), t("knowledge.cg.gain.noneHint")));
    return c;
  }
  c.append(el("div", "note", t("knowledge.cg.gain.lead")));
  const p = gain.paid || {};
  const a = gain.avoided || {};
  const scale = Math.max(1, p.total || 0, a.high || 0);

  const rows = el("div", "cg-gain");
  const paidRow = el("div", "cg-gain-row");
  paidRow.append(el("span", "cg-gain-name", t("knowledge.cg.gain.paid")));
  const paidBar = el("div", "cg-bar cg-bar-lg");
  for (const [cls, n, label] of [
    ["cg-seg-card", p.card || 0, t("knowledge.cg.gain.card")],
    ["cg-seg-source", p.source || 0, t("knowledge.cg.gain.source")],
    ["cg-seg-hints", p.hints || 0, t("knowledge.cg.gain.hintsPart")],
    ["cg-seg-env", p.envelope || 0, t("knowledge.cg.gain.envelope")],
  ])
    paidBar.append(cgSeg(cls, n / scale, `${label} ${kTokUi(n)}`));
  paidRow.append(paidBar, el("span", "cg-gain-val", kTokUi(p.total || 0)));
  rows.append(paidRow);
  const avRow = el("div", "cg-gain-row");
  avRow.append(el("span", "cg-gain-name", t("knowledge.cg.gain.avoided")));
  const avBar = el("div", "cg-bar cg-bar-lg");
  avBar.append(cgSeg("cg-seg-low", (a.low || 0) / scale), cgSeg("cg-seg-range", ((a.high || 0) - (a.low || 0)) / scale));
  avRow.append(avBar, el("span", "cg-gain-val", `~${kTokUi(a.low || 0)} – ${kTokUi(a.high || 0)}`));
  rows.append(avRow);
  c.append(rows);

  const key = el("div", "cg-bar-key");
  for (const [cls, label, n] of [
    ["cg-key-card", t("knowledge.cg.gain.card"), p.card],
    ["cg-key-source", t("knowledge.cg.gain.source"), p.source],
    ["cg-key-hints", t("knowledge.cg.gain.hintsPart"), p.hints],
    ["cg-key-env", t("knowledge.cg.gain.envelope"), p.envelope],
    ["cg-key-range", t("knowledge.cg.gain.range"), null],
  ])
    key.append(el("span", "cg-key " + cls, n === null ? label : `${label} ${kTokUi(n || 0)}`));
  c.append(key);
  c.append(el("div", "note", t("knowledge.gain.estimate")));

  // Which reads were asked, in the CLI's own order. A read never asked keeps its
  // slot, muted — "never asked" and "not a read" are different facts.
  const names = gain.read_set && gain.read_set.length ? gain.read_set : Object.keys(gain.by_command || {});
  if (names.length) {
    c.append(el("div", "cg-sub", t("knowledge.cg.gain.readsTitle", { n: gain.calls_recorded, runs: gain.runs === undefined ? "—" : gain.runs })));
    const counts = names.map((k) => (gain.by_command && gain.by_command[k]) || 0);
    const most = Math.max(1, ...counts);
    const list = el("div", "cg-reads");
    names.forEach((k, i) => {
      const n = counts[i];
      const r = el("div", "cg-read" + (n ? "" : " cg-read-never"));
      r.style.setProperty("--i", String(i));
      r.append(el("span", "cg-read-cmd mono", k));
      const lb = el("div", "cg-bar cg-bar-sm");
      lb.append(cgSeg("cg-seg-read", n / most));
      r.append(lb);
      r.append(el("span", "cg-read-n", n ? String(n) : t("knowledge.cg.gain.never")));
      r.append(el("span", "cg-read-what", CG_READS[k] ? CG_READS[k]() : ""));
      list.append(r);
    });
    c.append(list);
  }
  return c;
}

/* ── 6. what each word means ─────────────────────────────────────────────────
   Every word this tab and the exact card use, in four groups. */
function cgGlossaryCard() {
  const c = card(t("knowledge.cg.gloss.title"));
  c.append(el("div", "note", t("knowledge.cg.gloss.lead")));
  const groups = [
    [t("knowledge.cg.gloss.gStructure"), [
      [t("knowledge.cg.legend.file"), t("knowledge.cg.gloss.file")],
      [t("knowledge.cg.legend.symbol"), t("knowledge.cg.gloss.symbol")],
      [t("knowledge.cg.legend.call"), t("knowledge.cg.gloss.call")],
      [t("knowledge.graph.generation"), t("knowledge.cg.gloss.generation")],
    ]],
    [t("knowledge.cg.gloss.gFresh"), [
      ["FRESH · DRIFTED", t("knowledge.cg.gloss.freshDrifted")],
      ["NONE · OFF", t("knowledge.cg.gloss.noneOff")],
      [t("knowledge.cg.num.behind"), t("knowledge.cg.gloss.behind")],
      [t("knowledge.cg.gloss.selfHealTerm"), t("knowledge.graph.selfheal")],
    ]],
    [t("knowledge.cg.gloss.gQuality"), [
      [t("knowledge.cg.num.perFile"), t("knowledge.cg.gloss.density")],
      ["THIN", t("knowledge.cg.gloss.thin")],
      [t("knowledge.graph.notes"), t("knowledge.cg.gloss.notes")],
    ]],
    [t("knowledge.cg.gloss.gCost"), [
      [t("knowledge.cg.gain.paid"), t("knowledge.cg.gloss.paid")],
      [t("knowledge.cg.gain.envelope"), t("knowledge.cg.gloss.envelope")],
      [t("knowledge.cg.gain.avoided"), t("knowledge.cg.gloss.avoided")],
      [t("knowledge.cg.gloss.netTerm"), t("knowledge.cg.gloss.net")],
      [t("knowledge.cg.gloss.hintsTerm"), t("knowledge.cg.gloss.hints")],
      [t("knowledge.gain.measure"), t("knowledge.cg.gloss.measured")],
    ]],
  ];
  const grid = el("div", "cg-gloss");
  groups.forEach(([title, terms], gi) => {
    const box = el("div", "cg-gloss-group");
    box.style.setProperty("--i", String(gi));
    box.append(el("div", "cg-gloss-head", title));
    const dl = el("dl", "cg-gloss-list");
    for (const [term, meaning] of terms) dl.append(el("dt", null, term), el("dd", null, meaning));
    box.append(dl);
    grid.append(box);
  });
  c.append(grid);
  return c;
}
