"use strict";
/* panels/pact.js — orc ui client
   The invariant ledger. HOLDING/DRIFTED/UNCHECKABLE/BROKEN are the CLI's words,
   rendered verbatim.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

// Worst first, always. A ledger sorted by id buries the one entry that needs a
// decision under four that do not.
const PACT_KIND = { BROKEN: "bad", DRIFTED: "warn", UNCHECKABLE: "warn", HOLDING: "ok" };
const PACT_ORDER_UI = ["BROKEN", "DRIFTED", "UNCHECKABLE", "HOLDING"];

PANELS.pact = function (host) {
  head(host, t("pact.title"), t("pact.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderPact(body);
};

async function renderPact(body) {
  body.replaceChildren(skeleton(5));
  const [pactRes, boundRes, afterRes] = await Promise.all([
    read("/api/pact").catch(() => ({ data: null })),
    read("/api/boundary").catch(() => ({ data: null })),
    read("/api/aftermath").catch(() => ({ data: null })),
  ]);
  const d = pactRes.data;
  const out = frag();

  if (!d || !d.ok || !d.rows || !d.rows.length) {
    const c = card(t("pact.title"));
    c.append(empty(t("pact.none"), t("pact.noneHint")));
    c.append(laneCommand("/orc-pact", t("pact.cmdHarvestWhy")));
    out.append(c);
    body.replaceChildren(out);
    return;
  }

  // --- the summary row, in the CLI's own words
  const sum = card(t("pact.summary"), pactActions(body, d));
  const chips = el("div", "row-actions");
  for (const s of PACT_ORDER_UI) {
    const n = (d.counts || {})[s] || 0;
    if (!n && s !== "HOLDING") continue;
    chips.append(chip(`${n} ${s}`, PACT_KIND[s], s === "BROKEN"));
  }
  sum.append(chips);
  sum.append(kvList([[t("pact.field.ledger"), d.ledger], [t("pact.field.doc"), d.doc]], true));
  if (!d.doc_exists) sum.append(el("div", "note", t("pact.docMissing")));
  sum.append(el("div", "note", t("pact.uncheckableNote")));
  out.append(sum);

  // --- one card per promise, worst state first (the CLI already sorted them)
  for (const r of d.rows) {
    const c = card(null);
    const headRow = el("div", "row-actions");
    headRow.append(chip(r.state, PACT_KIND[r.state], r.state === "BROKEN"));
    headRow.append(el("span", "mono dim", r.id));
    c.append(headRow);
    c.append(el("div", "promise", r.statement));
    c.append(el("div", "note", r.why));

    const rows = [];
    if (r.anchors && r.anchors.length) rows.push([t("pact.field.anchors"), r.anchors.join(", ")]);
    rows.push([t("pact.field.check"), r.check && r.check.ref ? `${r.check.kind} — ${r.check.ref}` : t("pact.field.checkManual")]);
    if (r.origin) rows.push([t("pact.field.origin"), `${r.origin.lane || "?"}${r.origin.run ? " · " + r.origin.run : ""}`]);
    rows.push([t("pact.field.confidence"), r.confidence]);
    if (r.verified_commit) rows.push([t("pact.field.verified"), String(r.verified_commit).slice(0, 10)]);
    c.append(kvList(rows));

    if (r.last_check && r.last_check.status === "fail")
      c.append(el("div", "note bad", t("pact.lastCheckFailed", { at: r.last_check.at })));

    // ALSO FLAGGED BY — three lanes agreeing is the strongest signal ORC can
    // produce, and in a terminal you only ever see one lane at a time. This is
    // the whole reason the panel is worth building.
    const also = alsoFlagged(r, boundRes.data, afterRes.data);
    if (also.length) {
      const box = el("div", "also");
      box.append(el("div", "also-head", t("pact.alsoFlagged")));
      for (const a of also) {
        const line = el("div", "also-row");
        line.append(chip(a.chip, a.kind));
        line.append(el("span", null, a.text));
        if (a.panel) {
          const b = el("button", "btn btn-ghost btn-sm", t("common.open"));
          b.type = "button";
          b.addEventListener("click", () => (location.hash = "#/" + a.panel));
          line.append(b);
        }
        box.append(line);
      }
      c.append(box);
    }

    // A re-check is FREE (it runs the user's own command), so it is a button.
    if (r.check && r.check.ref) {
      const act = el("div", "row-actions");
      const b = el("button", "btn btn-sm", t("pact.recheckOne"));
      b.type = "button";
      b.addEventListener("click", () => confirmPactCheck([r], body));
      act.append(b);
      act.append(el("span", "note", "orc pact check " + r.id));
      c.append(act);
    }
    if (r.history && r.history.length > 1)
      c.append(
        collapsible({
          title: t("pact.history"),
          count: String(r.history.length),
          collapsed: true,
          content: kvList(r.history.map((h) => [h.at, `${h.status} @ ${String(h.commit || "").slice(0, 10)}`])),
        })
      );
    out.append(c);
  }

  out.append(laneCommand("/orc-pact", t("pact.cmdReconcileWhy")));
  body.replaceChildren(out);
}

// The cross-panel agreement line. Deliberately conservative: it only claims an
// overlap it can SEE (a shared file path, a named pact id), never a guess.
function alsoFlagged(row, boundary, after) {
  const out = [];
  const files = (row.anchors || []).map((a) => String(a).split(":")[0]);
  for (const c of (boundary && boundary.cards) || []) {
    if (c.verdict === "EXECUTE") continue;
    if (!files.some((f) => f === c.area || f.startsWith(c.area + "/"))) continue;
    out.push({ chip: c.verdict, kind: c.verdict === "REFUSE" ? "bad" : "warn", text: t("pact.alsoBoundary", { area: c.area }), panel: "boundary" });
  }
  for (const r of (after && after.runs) || [])
    for (const s of r.signals || [])
      if ((s.ids || []).includes(row.id))
        out.push({ chip: r.grade, kind: "warn", text: t("pact.alsoAftermath", { slug: r.slug }), panel: "runs" });
  return out;
}

function pactActions(body, d) {
  const wrap = el("div", "row-actions");
  const drifted = (d.rows || []).filter((r) => (r.state === "DRIFTED" || r.state === "BROKEN") && r.check && r.check.ref);
  if (drifted.length) {
    const b = el("button", "btn btn-sm", tn(drifted.length, "pact.recheckAll"));
    b.type = "button";
    b.addEventListener("click", () => confirmPactCheck(drifted, body));
    wrap.append(b);
  }
  const s = el("button", "btn btn-ghost btn-sm", t("pact.syncDoc"));
  s.type = "button";
  s.addEventListener("click", async () => {
    const r = await post("/api/pact/sync", {});
    toast(r.ok ? t("pact.syncOk") : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
    renderPact(body);
  });
  wrap.append(s);
  return wrap;
}

// A COUNT IS NOT CONSENT: the confirmation names every id it is about to run,
// and shows the exact command.
function confirmPactCheck(rows, body) {
  const b = frag();
  b.append(el("p", null, tn(rows.length, "pact.confirmBody")));
  const list = el("ul", "file-list");
  for (const r of rows) {
    const li = el("li");
    li.append(el("span", "mono", r.id + "  "));
    li.append(el("span", null, r.check.ref));
    list.append(li);
  }
  b.append(list);
  b.append(el("div", "note", t("pact.confirmNote")));
  const cmd = rows.length === 1 ? "orc pact check " + rows[0].id : "orc pact check";
  b.append(el("pre", "cmd", cmd));
  modal({
    title: t("pact.confirmTitle"),
    body: b,
    actions: {
      [t("common.cancel")]: null,
      [t("pact.confirmGo")]: async () => {
        const r = await post("/api/pact/check", rows.length === 1 ? { id: rows[0].id } : {});
        toast(r.ok ? t("pact.checkDone") : t("pact.checkFound"), r.ok ? "ok" : "warn", r.output);
        renderPact(body);
      },
    },
  });
}
