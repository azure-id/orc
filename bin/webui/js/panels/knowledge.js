"use strict";
/* panels/knowledge.js — orc ui client
   Wiki status, the refresh plan, debt and usage.

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
