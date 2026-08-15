"use strict";
/* panels/boundary.js — orc ui client
   EXECUTE/ESCALATE/REFUSE. A REFUSE always renders the checklist that would
   make it a yes.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


/* ------------------------------------------------------------------ BOUNDARY */

const VERDICT_KIND = { EXECUTE: "ok", ESCALATE: "warn", REFUSE: "bad" };

PANELS.boundary = function (host) {
  head(host, t("boundary.title"), t("boundary.sub"));
  section(
    host,
    () => read("/api/boundary").then((r) => r.data),
    (d) => {
      const out = frag();
      if (!d || !d.cards || !d.cards.length) {
        const c = card(t("boundary.title"));
        c.append(empty(t("boundary.none"), t("boundary.noneHint")));
        c.append(laneCommand("/orc-boundary", t("boundary.cmdWhy")));
        out.append(c);
        return out;
      }

      const sum = card(t("boundary.summary"));
      const chips = el("div", "row-actions");
      for (const v of ["EXECUTE", "ESCALATE", "REFUSE"])
        chips.append(chip(`${(d.counts || {})[v] || 0} ${v}`, VERDICT_KIND[v], v === "REFUSE" && d.counts.REFUSE));
      if (d.stale) chips.append(chip(tn(d.stale, "boundary.staleChip"), "warn"));
      sum.append(chips);
      sum.append(el("div", "note", t("boundary.gatesOrc")));
      out.append(sum);

      for (const c of d.cards) {
        const cc = card(null);
        const headRow = el("div", "row-actions");
        // The CLI's exact word, never a friendlier synonym.
        headRow.append(chip(c.verdict || "MALFORMED", c.verdict ? VERDICT_KIND[c.verdict] : "bad"));
        headRow.append(el("span", "mono", c.area));
        if (c.stale) headRow.append(chip(t("boundary.stale"), "warn"));
        cc.append(headRow);

        for (const r of c.reasons || []) cc.append(el("div", "note", r));

        // THE CHECKLIST IS THE PRODUCT. A REFUSE with none is malformed in the
        // lane, so this renders an ERROR — never an empty card that reads as a
        // flat no.
        if (c.verdict === "REFUSE") {
          if (!c.checklist || !c.checklist.length) {
            cc.append(el("div", "note bad", t("boundary.malformedNoChecklist")));
          } else {
            const box = el("div", "checklist");
            box.append(el("div", "checklist-head", t("boundary.wouldMakeYes")));
            for (const item of c.checklist) {
              const row = el("div", "checklist-row");
              row.append(el("span", "checklist-box", "□"));
              row.append(el("span", null, item));
              // A caution routes to the panel that can CLEAR it — the v0.43.6
              // FINDING_ROUTE idea, applied to a checklist item.
              const route = checklistRoute(item);
              if (route) {
                const b = el("button", "btn btn-ghost btn-sm", route.label);
                b.type = "button";
                b.addEventListener("click", () => (location.hash = "#/" + route.panel));
                row.append(b);
              }
              box.append(row);
            }
            cc.append(box);
          }
        }
        if (c.verdict === "ESCALATE")
          cc.append(
            c.escalate_to
              ? el("div", "note", t("boundary.escalateTo", { who: c.escalate_to }))
              : el("div", "note bad", t("boundary.malformedNoWho"))
          );
        for (const m of c.malformed || []) cc.append(el("div", "note bad", m));

        // A STALE card shows the refresh COMMAND, not a button: refreshing it
        // re-runs the four questions, which costs model tokens.
        if (c.stale) cc.append(laneCommand("/orc-boundary " + c.area, tn(c.distance, "boundary.staleWhy")));
        out.append(cc);
      }
      return out;
    }
  );
};

// Only the routes that genuinely clear the item. Everything else gets no button
// at all — a button that lands on a page with no control for the thing is the
// exact defect FINDING_ROUTE was introduced to fix.
function checklistRoute(item) {
  const s = String(item).toLowerCase();
  if (s.includes("pact.md") || s.includes("invariant") || s.includes("promise")) return { panel: "pact", label: t("boundary.route.pact") };
  if (s.includes("pattern") || s.includes("convention")) return { panel: "knowledge", label: t("boundary.route.knowledge") };
  if (s.includes("wiki") || s.includes("document")) return { panel: "knowledge", label: t("boundary.route.knowledge") };
  return null;
}
