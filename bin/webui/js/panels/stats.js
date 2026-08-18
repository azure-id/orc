"use strict";
/* panels/stats.js — orc ui client
   Usage and Cost. The four-part token bar exists so cache-read stays visibly
   separate from the other three.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

/* =================================================================== STATS == */

/* The Cost tab's unit choice persists: a Max user who picked Quota once should
   not have to pick it every time the panel reloads. It is a per-browser display
   preference, exactly like the theme and the language — never a project setting,
   and never written to config. */
const COST_UNIT_KEY = "orc-ui-cost-unit";
const COST_UNITS = ["tokens", "quota", "usd"];
// Written out in full, never assembled from `"cost.unit." + u` — a key built
// from a fragment is invisible to the i18n coverage check.
const COST_UNIT_KEY_OF = { tokens: "cost.unit.tokens", quota: "cost.unit.quota", usd: "cost.unit.usd" };

PANELS.stats = function (host) {
  head(host, t("stats.title"), t("stats.sub"));
  const tabs = el("div", "tabs");
  const body = el("div", "stack");
  let active = "usage";
  const mk = (id, label) => {
    const b = el("button", "tab" + (id === active ? " tab-on" : ""), label);
    b.type = "button";
    b.addEventListener("click", () => {
      active = id;
      for (const x of tabs.children) x.classList.toggle("tab-on", x === b);
      body.replaceChildren();
      (id === "usage" ? renderStatsUsage : renderStatsCost)(body);
    });
    return b;
  };
  tabs.append(mk("usage", t("stats.tab.usage")), mk("cost", t("stats.tab.cost")));
  host.append(tabs, body);
  renderStatsUsage(body);
};

function renderStatsUsage(host) {
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
}

/* --------------------------------------------------------------- STATS · COST
   Unit-aware, because a dollar figure is the wrong headline for most Claude Code
   users: on Pro or Max you burn a 5-hour window, not an invoice.

   THE STACKED BAR EXISTS SO CACHE-READ IS VISIBLY SEPARATE. A single-value bar
   would re-hide the exact thing the four-component vector exists to expose — and
   the four components are the CLI's, never recomputed here. */

const kTokUi = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n || 0));

function costUnit() {
  try {
    const v = localStorage.getItem(COST_UNIT_KEY);
    return COST_UNITS.includes(v) ? v : "tokens";
  } catch (_) {
    return "tokens";
  }
}

async function renderStatsCost(host) {
  host.replaceChildren(skeleton(5));
  const url = statsPlanPath ? "/api/budget/forecast?plan=" + encodeURIComponent(statsPlanPath) : "/api/budget/rates";
  const [main, rates] = await Promise.all([
    read(url).catch(() => ({ data: null })),
    read("/api/budget/rates").catch(() => ({ data: null })),
  ]);
  const out = frag();

  // --- the plan picker. `browse` reuses /api/fs/list, which is a DIRECTORY
  // lister: names only, never a file's contents. The server passes the PATH to
  // `orc budget forecast`; nothing here opens the plan.
  const pick = card(t("cost.plan"));
  const row = el("div", "row-actions");
  const input = el("input", "input");
  input.type = "text";
  input.value = statsPlanPath || "";
  input.placeholder = t("cost.planPlaceholder");
  const browse = el("button", "btn btn-ghost btn-sm", t("cost.browse"));
  browse.type = "button";
  browse.addEventListener("click", () => pickFolder((p) => (input.value = p)));
  const go = el("button", "btn btn-sm", t("cost.forecast"));
  go.type = "button";
  go.addEventListener("click", () => {
    statsPlanPath = input.value.trim();
    host.replaceChildren();
    renderStatsCost(host);
  });
  row.append(input, browse, go);
  pick.append(row);
  pick.append(el("div", "note", t("cost.planOnly")));
  out.append(pick);

  const d = main.data;
  if (!statsPlanPath || !d || !d.ok || !d.lanes) {
    const c = card(t("cost.title"));
    c.append(empty(t("cost.noForecast"), t("cost.noForecastHint")));
    if (rates.data && rates.data.dispatches_joined) c.append(ratesCard(rates.data));
    else c.append(laneCommand("orc budget calibrate", t("cost.calibrateWhy")));
    out.append(c);
    host.replaceChildren(out);
    await costDocuments(out);
    return;
  }

  // --- the unit switch
  const unit = costUnit();
  const c = card(t("cost.title"), unitSwitch(unit, host));
  c.append(el("div", "note", t("cost.sub", { tasks: d.tasks, waves: d.waves })));

  // --- one stacked bar per lane
  const maxRaw = Math.max(...d.lanes.map((l) => l.raw || 0), 1);
  const bars = el("div", "bars");
  for (const l of d.lanes) {
    const r = el("div", "bar-row");
    r.append(el("div", "bar-label", l.cmd || l.lane));
    if (!l.raw) {
      // A lane with no measurable cost is NOT free. Saying so is the honest
      // rendering; a zero-length bar would read as "cheapest".
      const box = el("div", "bar-track");
      box.append(el("div", "bar-none", t("cost.notPossible")));
      r.append(box, el("div", "bar-value", "—"));
      bars.append(r);
      continue;
    }
    const track = el("div", "bar-track");
    const st = el("div", "bar-stack");
    // The vector's four parts, in their real proportions, from the primary
    // lane's own breakdown when we have it and the lane totals otherwise.
    const parts = l.lane === "orc" && d.tokens ? d.tokens.p50 : null;
    if (parts) {
      for (const [k, cls] of [["input", "seg-in"], ["cache_write", "seg-cw"], ["cache_read", "seg-cr"], ["output", "seg-out"]]) {
        const seg = el("div", "bar-seg " + cls);
        seg.title = `${k}: ${kTokUi(parts[k])}`;
        st.append(seg);
        requestAnimationFrame(() => seg.style.setProperty("flex-grow", String(parts[k] || 0)));
      }
    } else {
      const seg = el("div", "bar-seg seg-cr");
      st.append(seg);
      requestAnimationFrame(() => seg.style.setProperty("flex-grow", "1"));
    }
    track.append(st);
    requestAnimationFrame(() => st.style.setProperty("width", Math.max(4, (l.raw / maxRaw) * 100) + "%"));
    r.append(track);
    r.append(el("div", "bar-value", laneUnitValue(l, d, unit)));
    if (l.lane === "orc") r.append(el("span", "bar-mark", "←"));
    bars.append(r);
  }
  c.append(bars);

  const legend = el("div", "legend");
  for (const [k, cls] of [["cost.legend.in", "seg-in"], ["cost.legend.cw", "seg-cw"], ["cost.legend.cr", "seg-cr"], ["cost.legend.out", "seg-out"]]) {
    const item = el("span", "legend-item");
    item.append(el("span", "legend-dot " + cls));
    item.append(el("span", null, t(k)));
    legend.append(item);
  }
  c.append(legend);
  c.append(el("div", "note", t("cost.cacheNote")));

  // --- the honesty block. NONE of this is optional chrome: an honest range
  // rendered as a confident bar is a lie the panel invented.
  if (d.low_confidence_bands)
    c.append(el("div", "note warn", tn(d.low_confidence_bands, "cost.lowConfidence", { min: d.min_samples })));
  if (d.price_table && d.price_table.stale)
    c.append(el("div", "note warn", t("cost.priceStale", { as_of: d.price_table.as_of, days: d.price_table.age_days })));
  if (!d.transcripts_readable) c.append(el("div", "note warn", t("cost.noTranscripts")));
  if (d.unattributed && d.unattributed.blocks)
    c.append(el("div", "note", tn(d.unattributed.blocks, "cost.unattributed")));
  out.append(c);

  // --- context risk. The output nobody else has, so it gets its own card.
  if (d.context_risk && d.context_risk.length) {
    const rc = card(t("cost.contextTitle"));
    rc.append(el("div", "note warn", t("cost.contextIntro")));
    for (const r of d.context_risk) {
      const line = el("div", "row-actions");
      line.append(chip(r.task, "warn"));
      line.append(el("span", null, t("cost.contextRow", { agent: r.agent.replace(/^orc-executor-/, ""), peak: kTokUi(r.peak), window: kTokUi(r.window), pct: r.pct })));
      const b = el("button", "btn btn-ghost btn-sm", t("cost.contextOpenUsage"));
      b.type = "button";
      b.addEventListener("click", () => (location.hash = "#/knowledge"));
      line.append(b);
      rc.append(line);
    }
    rc.append(el("div", "note", t("cost.contextHint")));
    out.append(rc);
  }

  // --- the per-band table, rendered from the CLI's own rows
  const bc = card(t("cost.bands"));
  const tbl = el("table", "tbl");
  const thead = el("tr");
  for (const h of ["cost.col.band", "cost.col.model", "cost.col.n", "cost.col.in", "cost.col.cw", "cost.col.cr", "cost.col.out", "cost.col.samples"])
    thead.append(el("th", null, t(h)));
  tbl.append(thead);
  for (const b of d.bands || []) {
    const tr = el("tr", b.samples < d.min_samples ? "row-soft" : null);
    tr.append(el("td", "mono", b.band));
    tr.append(el("td", null, String(b.agent || "").replace(/^orc-executor-/, "")));
    tr.append(el("td", null, String(b.count)));
    for (const k of ["input", "cache_write", "cache_read", "output"]) tr.append(el("td", "num", b.p50 ? kTokUi(b.p50[k]) : "—"));
    tr.append(el("td", "num", String(b.samples)));
    tbl.append(tr);
  }
  bc.append(tbl);
  bc.append(el("div", "note", t("cost.bandsNote")));
  out.append(bc);
  out.append(laneCommand("/orc-budget", t("cost.laneWhy")));
  host.replaceChildren(out);
  await costDocuments(out);
}

/* DOCUMENTS (v0.49.2). `orc budget` works per RUN, and a /orc-doc document spans
   several. Each row EXPANDS IN PLACE — the Runs-row rule — and fetches
   `orc doc forecast --json` on first open. It duplicates no logic and names no
   number itself; the card is the Docs panel's, rendered here because this is the
   panel somebody opens when the question is "what is this costing me". */
async function costDocuments(out) {
  let list = null;
  try {
    list = (await read("/api/doc")).data;
  } catch (_) {}
  if (!list || !(list.documents || []).length) return;

  const c = card(t("cost.docs"));
  c.append(el("div", "note", t("cost.docsNote")));
  const box = el("div", "run-list");
  for (const doc of list.documents) {
    const row = el("div", "run-row");
    const head = el("button", "run-card", null);
    head.type = "button";
    head.setAttribute("aria-expanded", "false");
    head.append(el("span", "run-caret", "▸"));
    // The CLI's own word for the document's state — never a friendlier synonym.
    head.append(chip(doc.document, doc.document === "present" ? "ok" : ""));
    const mid = el("div", "run-mid");
    mid.append(el("div", "run-slug", doc.title || doc.slug));
    mid.append(el("div", "run-where", `${String(doc.type).toUpperCase()} · ${doc.slug}`));
    head.append(mid, el("div", "run-age", `${doc.sections_written}/${doc.sections_total}`));

    const pane = el("div", "run-pane stack stack-sm");
    pane.append(skeleton(3));
    const inner = el("div", "run-body-inner");
    inner.append(pane);
    const fold = el("div", "run-body");
    fold.append(inner);
    // ONE loader, so "recompute" refetches THIS row and nothing else — it must
    // never re-render the Docs panel's detail into a card that is not it.
    const load = async () => {
      pane.replaceChildren(skeleton(3));
      const q = "?slug=" + encodeURIComponent(doc.slug);
      const fc = (await read("/api/doc/forecast" + q).catch(() => ({ data: null }))).data;
      const cost = (await read("/api/doc/cost" + q).catch(() => ({ data: null }))).data;
      const f = frag();
      if (fc) f.append(docForecastCard(fc, doc.slug, load));
      if (cost) f.append(docCostCard(cost));
      pane.replaceChildren(f);
    };
    let loaded = false;
    head.addEventListener("click", () => {
      const open = !row.classList.contains("open");
      row.classList.toggle("open", open);
      head.setAttribute("aria-expanded", String(open));
      if (!open || loaded) return;
      loaded = true;
      load();
    });
    row.append(head, fold);
    box.append(row);
  }
  c.append(box);
  out.append(c);
}

let statsPlanPath = "";

function unitSwitch(active, host) {
  const wrap = el("div", "seg-ctl");
  for (const u of COST_UNITS) {
    const b = el("button", "seg-btn" + (u === active ? " seg-on" : ""), t(COST_UNIT_KEY_OF[u]));
    b.type = "button";
    b.addEventListener("click", () => {
      try {
        localStorage.setItem(COST_UNIT_KEY, u);
      } catch (_) {}
      host.replaceChildren();
      renderStatsCost(host);
    });
    wrap.append(b);
  }
  return wrap;
}

function laneUnitValue(l, d, unit) {
  if (unit === "usd") return l.usd === null || l.usd === undefined ? "—" : "$" + l.usd.toFixed(2);
  if (unit === "quota") {
    // NEVER a quota figure without a known plan — the CLI decides that, and when
    // it says unavailable the cell says so rather than inventing a percentage.
    if (!d.quota || !d.quota.available) return t("cost.quotaNa");
    const share = d.weighted && d.weighted.p50 ? l.weighted / d.weighted.p50 : 1;
    return (d.quota.window_pct * share).toFixed(1) + "%";
  }
  return kTokUi(l.raw);
}

function ratesCard(r) {
  const c = card(t("cost.ratesTitle"));
  c.append(
    kvList([
      [t("cost.rates.calibrated"), r.calibrated_at],
      [t("cost.rates.joined"), String(r.dispatches_joined)],
      [t("cost.rates.transcripts"), r.transcripts_readable ? `${r.transcript_files}` : t("cost.rates.unreadable")],
      [t("cost.rates.unattributed"), `${r.unattributed.blocks}`],
    ])
  );
  return c;
}

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
