"use strict";
/* panels/overview.js — orc ui client
   FINDING_ROUTE (a caution routes to the panel that can CLEAR it), the
   attention list, the stat tiles.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


/* ================================================================ OVERVIEW == */

/* WHERE A PROBLEM IS ACTUALLY FIXED (v0.43.6).
   `orc doctor` reports every problem in one list, and the panel used to send
   the whole list to Maintenance with a single "Open Maintenance" button. That
   is right for the install-footprint findings — version skew, orphans, missing
   files, unwired hooks — because `orc update` / `doctor --fix` really is where
   those are repaired. It was WRONG for the ones whose fix lives on another
   panel, and `diy-stale` was the one people hit: the flow is recompiled with
   `orc diy compile`, which is a button on FLOW. Sending them to Maintenance
   pointed at a page with no control for the thing it was complaining about.

   So the routing is a table keyed on the finding id the CLI already emits.
   `null` means there is nothing to press anywhere — a dangling trace pointer
   clears itself on the next run, and offering a button for it would be a lie. */
const FINDING_ROUTE = {
  "diy-stale": { panel: "flow", cta: "overview.item.diyStale.cta" },
  "trace-pointer-dangling": { panel: null },
  // v0.46.0. Correct by the rule, not by default: `export-stale` is cleared by
  // `orc export`, which IS a CLI write Maintenance can run — so Maintenance is
  // genuinely the panel that can clear it, not merely the fallback.
  "export-stale": { panel: "maintenance", cta: "overview.item.exportStale.cta" },
  "pact-broken": { panel: "pact", cta: "overview.item.pactBroken.cta" },
  // v0.48.1. Same rule again: `orc doc audit` and `orc doc ship` are both on
  // DOCS, so that is where a drifted document has to send you.
  "doc-drifted": { panel: "docs", cta: "overview.item.docDrifted.cta" },
  "boundary-refuse": { panel: "boundary", cta: "overview.item.boundaryRefuse.cta" },
};
const DEFAULT_FINDING_ROUTE = { panel: "maintenance", cta: "overview.item.doctor.cta" };
const findingRoute = (id) => FINDING_ROUTE[id] || DEFAULT_FINDING_ROUTE;

PANELS.overview = function (host) {
  head(host, t("overview.title"), t("overview.sub"));
  section(
    host,
    () => read("/api/overview").then((r) => r.data),
    (d) => {
      const out = frag();
      const doctor = d.doctor || {};
      const w = d.wiki || {};
      const p = d.patterns || {};
      const waiting = d.waiting || [];
      const findings = doctor.findings || [];

      /* --- the tiles ------------------------------------------------------ */
      const stats = el("div", "grid grid-3");
      stats.append(
        statTile(
          t("overview.tile.install"),
          doctor.ok ? t("overview.tile.installHealthy") : tn(findings.length, "overview.tile.installIssues"),
          doctor.installed_version
            ? t("overview.tile.installNote", { payload: doctor.installed_version, cli: doctor.package_version })
            : "",
          doctor.ok ? "ok" : "warn",
          doctor.ok ? null : "maintenance"
        )
      );
      stats.append(
        statTile(
          t("overview.tile.wiki"),
          // TIER and STATE are CLI vocabulary (FRESH / AGING / STALE /
          // unregistered) — the words the docs and every other lane use. They
          // are shown as-is in both languages; only the sentence under them is
          // translated.
          w.state === "registered" ? w.tier || t("overview.tile.wikiUnknown") : String(w.state || "none").toUpperCase(),
          w.state === "registered"
            ? t("overview.tile.wikiNote", { docs: w.docs, scan: w.last_scan || "?" })
            : t("overview.tile.wikiNone"),
          w.tier === "FRESH" ? "ok" : w.tier === "AGING" ? "warn" : w.state === "none" ? "" : "bad",
          "knowledge"
        )
      );
      stats.append(
        statTile(
          t("overview.tile.waiting"),
          String(waiting.length),
          t("overview.tile.waitingNote", { n: d.runs_total || 0 }),
          waiting.length ? "warn" : "ok",
          "runs"
        )
      );
      const langs = (p.patterns || []).map((x) => x.lang);
      stats.append(
        statTile(
          t("overview.tile.patterns"),
          String(langs.length),
          langs.length ? langs.join(", ") : t("overview.tile.patternsNone"),
          langs.length ? "ok" : "",
          "knowledge"
        )
      );

      /* v0.46.0 — three chips repeating the CLI's OWN state words. A chip with
         nothing to say still renders its good state: an absent chip and a
         healthy one must never look the same. */
      const pc = d.pact;
      const bc = d.boundary;
      const wd = d.wiki_debt;
      stats.append(
        statTile(
          t("overview.tile.pact"),
          pc && pc.ok
            ? (pc.counts.BROKEN ? pc.counts.BROKEN + " BROKEN" : pc.counts.DRIFTED ? pc.counts.DRIFTED + " DRIFTED" : pc.counts.HOLDING + " HOLDING")
            : t("overview.tile.none"),
          pc && pc.ok ? t("overview.tile.pactNote", { n: pc.entries, u: pc.counts.UNCHECKABLE }) : t("overview.tile.pactNone"),
          pc && pc.ok ? (pc.counts.BROKEN ? "bad" : pc.counts.DRIFTED ? "warn" : "ok") : "",
          pc && pc.ok ? "pact" : null
        )
      );
      stats.append(
        statTile(
          t("overview.tile.boundary"),
          bc && bc.cards && bc.cards.length
            ? (bc.counts.REFUSE ? bc.counts.REFUSE + " REFUSE" : bc.counts.ESCALATE ? bc.counts.ESCALATE + " ESCALATE" : bc.counts.EXECUTE + " EXECUTE")
            : t("overview.tile.none"),
          bc && bc.cards && bc.cards.length ? t("overview.tile.boundaryNote", { n: bc.cards.length, stale: bc.stale }) : t("overview.tile.boundaryNone"),
          bc && bc.cards && bc.cards.length ? (bc.counts.REFUSE ? "bad" : bc.counts.ESCALATE ? "warn" : "ok") : "",
          bc && bc.cards && bc.cards.length ? "boundary" : null
        )
      );
      stats.append(
        statTile(
          t("overview.tile.debt"),
          wd && wd.ok && wd.pending ? String(wd.pending) : "0",
          wd && wd.ok && wd.pending
            ? t("overview.tile.debtNote", { tier: wd.tier, tok: kTokUi((wd.tokens || {}).input + (wd.tokens || {}).cache_write + (wd.tokens || {}).cache_read + (wd.tokens || {}).output) })
            : t("overview.tile.debtNone"),
          wd && wd.ok && wd.pending ? "warn" : "ok",
          "knowledge"
        )
      );

      // The version check crosses the network, so it must never hold up the
      // tiles beside it: the tile renders in its pending state and fills itself
      // in when the answer lands.
      const vt = statTile(t("overview.tile.version"), t("common.checking"), t("overview.tile.versionChecking"), "");
      vt.classList.add("stat-pending");
      stats.append(vt);
      versionInfo()
        .then((v) => {
          const s = versionState(v);
          vt.classList.remove("stat-pending");
          vt.replaceChildren();
          vt.append(el("div", "stat-label", t("overview.tile.version")));
          const val = el("div", "stat-value" + (s.kind ? " stat-" + s.kind : ""));
          val.append(document.createTextNode(v && v.version ? "v" + v.version : "?"), chip(s.label, s.kind));
          vt.append(val, el("div", "stat-note", s.note));
        })
        .catch(() => {
          vt.classList.remove("stat-pending");
          vt.replaceChildren(
            el("div", "stat-label", t("overview.tile.version")),
            el("div", "stat-value", "?"),
            el("div", "stat-note", t("overview.tile.versionFailed"))
          );
        });
      out.append(stats);

      /* --- worth doing ----------------------------------------------------
         One list, in severity order, of everything that wants a decision — and
         every row carries the panel where the fix actually is. This is the
         panel's answer to "what now", and it is the only place the wiki tier
         turns into advice instead of a colour. */
      out.append(attentionCard(d, findings));

      /* --- waiting runs --------------------------------------------------- */
      if (waiting.length) {
        const c = card(t("overview.waiting.title"));
        c.append(el("div", "note", t("overview.waiting.note")));
        const list = el("div", "run-list");
        for (const slug of waiting) {
          const b = el("button", "run-card");
          b.type = "button";
          b.append(chip("waiting", "warn"));
          const mid = el("div");
          mid.append(el("div", "run-slug", slug));
          mid.append(el("div", "run-where", t("overview.waiting.where")));
          b.append(mid, el("div", "run-age", ""));
          b.addEventListener("click", () => {
            location.hash = "#/runs?slug=" + encodeURIComponent(slug);
          });
          list.append(b);
        }
        c.append(list);
        out.append(c);
      }

      /* --- the raw doctor list -------------------------------------------
         Kept below the actionable card, because it is the EVIDENCE: the exact
         message the CLI printed, unedited and untranslated, so what you read
         here is what you would read in a terminal. */
      if (!doctor.ok && findings.length) {
        const c = card(t("overview.doctor.title"));
        for (const f of findings) {
          const row = el("div", "finding");
          row.append(chip(f.fixable ? t("overview.doctor.fixable") : t("overview.doctor.manual"), f.fixable ? "info" : "warn"));
          const detail = el("div");
          detail.append(el("div", null, f.message));
          const r = findingRoute(f.id);
          if (r.panel) {
            const go = el("button", "btn btn-ghost btn-sm", t(r.cta));
            go.type = "button";
            go.addEventListener("click", () => (location.hash = "#/" + r.panel));
            detail.append(go);
          } else {
            detail.append(el("div", "note", t("overview.attention.nothingToDo")));
          }
          row.append(detail);
          c.append(row);
        }
        out.append(c);
      }

      /* --- where things are ----------------------------------------------- */
      const paths = card(t("overview.paths.title"));
      const where = d.where || {};
      paths.append(
        kvList(
          [
            [t("overview.paths.project"), where.project_root],
            [t("overview.paths.config"), where.config],
            [t("overview.paths.skills"), where.skills],
            [t("overview.paths.runs"), where.run_dir],
            [t("overview.paths.traces"), where.log_dir],
          ],
          true
        )
      );
      out.append(paths);

      const know = card(t("overview.know.title"));
      know.append(
        kvList([
          [t("overview.know.patterns"), langs.join(", ") || t("common.none")],
          [t("overview.know.tags"), w.crosslink_tags === undefined ? "" : String(w.crosslink_tags)],
          // `state` and `reason` are the CLI's — shown verbatim.
          [t("overview.know.diy"), d.diy ? `${d.diy.state} — ${d.diy.reason}` : ""],
        ])
      );
      out.append(know);

      return out;
    }
  );
};

// The actionable list. Each entry is {kind, title, body, panel, cta} and knows
// where its fix lives — never a blanket "go to Maintenance".
function attentionCard(d, findings) {
  const w = d.wiki || {};
  const p = d.patterns || {};
  const items = [];

  // 1. Install findings, routed per id.
  for (const f of findings) {
    const r = findingRoute(f.id);
    if (f.id === "diy-stale") {
      items.push({
        kind: "warn",
        title: t("overview.item.diyStale.title"),
        body: t("overview.item.diyStale.body"),
        evidence: d.diy && d.diy.reason,
        panel: "flow",
        cta: t("overview.item.diyStale.cta"),
      });
    } else if (r.panel) {
      items.push({
        kind: f.fixable ? "warn" : "bad",
        // A doctor finding is already a sentence written for a human — using it
        // as the title beats paraphrasing it into something less exact.
        title: f.message,
        panel: r.panel,
        cta: t(r.cta),
      });
    }
  }

  // 2. The wiki. THIS is the recommendation the panel was missing: an AGING
  //    wiki is not an error, it is the moment a refresh is still cheap.
  if (!w.state || w.state === "none") {
    items.push({ kind: "info", title: t("overview.item.wikiNone.title"), body: t("overview.item.wikiNone.body"), panel: "knowledge", cta: t("overview.item.wikiNone.cta") });
  } else if (w.state !== "registered") {
    items.push({ kind: "warn", title: t("overview.item.wikiUnregistered.title"), body: t("overview.item.wikiUnregistered.body"), panel: "knowledge", cta: t("overview.item.wikiUnregistered.cta") });
  } else if (w.tier === "AGING") {
    items.push({
      kind: "warn",
      title: t("overview.item.wikiAging.title"),
      body: t("overview.item.wikiAging.body"),
      evidence: (w.reasons || [])[0],
      panel: "knowledge",
      cta: t("overview.item.wikiAging.cta"),
    });
  } else if (w.tier && w.tier !== "FRESH") {
    items.push({
      kind: "bad",
      title: t("overview.item.wikiStale.title"),
      body: t("overview.item.wikiStale.body"),
      evidence: (w.reasons || [])[0],
      panel: "knowledge",
      cta: t("overview.item.wikiStale.cta"),
    });
  }

  // 3. No cached pattern — not a fault, but the cheapest quality win there is.
  if (!(p.patterns || []).length)
    items.push({ kind: "info", title: t("overview.item.patterns.title"), body: t("overview.item.patterns.body"), panel: "knowledge", cta: t("overview.item.patterns.cta") });

  // 4. Runs left waiting.
  if ((d.waiting || []).length)
    items.push({
      kind: "warn",
      title: tn((d.waiting || []).length, "overview.item.waiting.title"),
      body: t("overview.item.waiting.body"),
      panel: "runs",
      cta: t("overview.item.waiting.cta"),
    });

  const c = card(t("overview.attention.title"), chip(String(items.length), items.length ? "warn" : "ok"));
  c.id = "attention-card";

  if (!items.length) {
    const ok = el("div", "all-clear");
    ok.append(el("div", "all-clear-mark", "✓"));
    const txt = el("div");
    txt.append(el("div", "all-clear-title", t("overview.attention.allClear")));
    txt.append(el("div", "note", t("overview.attention.allClearHint")));
    ok.append(txt);
    c.append(ok);
  }

  const list = el("div", "todo-list");
  const order = { bad: 0, warn: 1, info: 2 };
  items.sort((a, b) => (order[a.kind] || 3) - (order[b.kind] || 3));
  for (const it of items) {
    const row = el("button", "todo todo-" + it.kind);
    row.type = "button";
    row.append(el("span", "todo-mark"));
    const mid = el("div", "todo-body");
    mid.append(el("div", "todo-title", it.title));
    if (it.body) mid.append(el("div", "todo-text", it.body));
    // The CLI's own words for WHY, kept verbatim under our explanation.
    if (it.evidence) mid.append(el("div", "todo-evidence", it.evidence));
    row.append(mid, el("span", "todo-cta", it.cta));
    row.addEventListener("click", () => (location.hash = "#/" + it.panel));
    list.append(row);
  }
  if (items.length) c.append(list);

  // The update offer is appended asynchronously so a slow network check never
  // delays the list — it arrives as one more row when the answer does.
  versionInfo()
    .then((v) => {
      if (!v || !v.update_available) return;
      const row = el("button", "todo todo-info todo-late");
      row.type = "button";
      row.append(el("span", "todo-mark"));
      const mid = el("div", "todo-body");
      mid.append(el("div", "todo-title", t("overview.item.update.title", { latest: v.latest })));
      mid.append(el("div", "todo-text", t("overview.item.update.body", { version: v.version })));
      row.append(mid, el("span", "todo-cta", t("overview.item.update.cta")));
      row.addEventListener("click", () => (location.hash = "#/maintenance"));
      if (!list.isConnected) c.append(list);
      list.append(row);
      const count = c.querySelector(".card-head .chip");
      if (count) {
        count.textContent = String(list.children.length);
        count.className = "chip chip-warn";
      }
      const clear = c.querySelector(".all-clear");
      if (clear) clear.remove();
    })
    .catch(() => {});

  return c;
}
