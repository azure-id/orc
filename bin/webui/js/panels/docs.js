"use strict";
/* panels/docs.js — orc ui client
   The section ribbon, the health box and the wave preview.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

// The five section states the CLI can emit. The panel may KEY on one — a colour,
// a marker, an action — but never invent one.
const DOC_STATE_KIND = {
  planned: "",
  written: "ok",
  checked: "ok",
  "user-edited": "info",
  open: "warn",
};

PANELS.docs = function (host) {
  head(host, t("docs.title"), t("docs.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderDocs(body);
};

async function renderDocs(body) {
  body.replaceChildren(skeleton(5));
  let d;
  try {
    d = (await read("/api/doc")).data;
  } catch (e) {
    body.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const out = frag();

  // An empty list is an ANSWER, not a gap: it renders the command that starts
  // one, never a spinner and never a "nothing here" shrug.
  if (!d || !d.documents || !d.documents.length) {
    const c = card(t("docs.title"));
    c.append(empty(t("docs.none"), t("docs.noneHint")));
    c.append(laneCommand("/orc-doc", t("docs.cmdWhy")));
    out.append(c);
    body.replaceChildren(out);
    return;
  }

  const sum = card(t("docs.summary"));
  const chips = el("div", "row-actions");
  chips.append(chip(tn(d.documents.length, "docs.docN"), "info"));
  const edited = d.documents.reduce((a, x) => a + (x.user_edited || []).length, 0);
  if (edited) chips.append(chip(tn(edited, "docs.editedN"), "info"));
  sum.append(chips);
  sum.append(el("div", "note", t("docs.contract")));
  out.append(sum);

  // One row open at a time, detail fetched on first open — the Runs-panel rule.
  // There is no detail box below the list.
  const list = el("div", "run-list doc-list");
  const rows = [];
  const setOpen = (entry, open) => {
    entry.row.classList.toggle("open", open);
    entry.head.setAttribute("aria-expanded", String(open));
    if (open && !entry.loaded) {
      entry.loaded = true;
      loadDocDetail(entry.pane, entry.slug, body);
    }
  };
  const collapseAll = (except) => {
    for (const r of rows) if (r.row !== except) setOpen(r, false);
  };

  for (const doc of d.documents) {
    const row = el("div", "run-row");
    const headBtn = el("button", "run-card");
    headBtn.type = "button";
    headBtn.setAttribute("aria-expanded", "false");
    headBtn.append(el("span", "run-caret", "▸"));
    // The CLI's own words. `not started` is the CLI's phrase for a document with
    // no document.md, and it is never softened into "failed" or "empty".
    headBtn.append(chip(doc.document, doc.document === "present" ? "ok" : ""));
    if ((doc.user_edited || []).length) headBtn.append(chip(t("docs.editedChip"), "info"));
    const mid = el("div", "run-mid");
    mid.append(el("div", "run-slug", doc.title || doc.slug));
    mid.append(el("div", "run-where", `${String(doc.type).toUpperCase()} · ${doc.slug}`));
    headBtn.append(mid);
    headBtn.append(
      el("div", "run-age", `${doc.sections_written}/${doc.sections_total}`)
    );

    const pane = el("div", "run-pane stack stack-sm");
    pane.append(skeleton(4));
    const inner = el("div", "run-body-inner");
    inner.append(pane);
    const fold = el("div", "run-body");
    fold.append(inner);

    const entry = { row, head: headBtn, pane, slug: doc.slug, loaded: false };
    rows.push(entry);
    headBtn.addEventListener("click", () => {
      const isOpen = row.classList.contains("open");
      collapseAll(row);
      setOpen(entry, !isOpen);
    });
    row.append(headBtn, fold);
    list.append(row);
  }
  out.append(list);
  out.append(laneCommand("/orc-doc", t("docs.cmdWhy")));
  body.replaceChildren(out);
}

/* CARD ORDER IS DELIBERATE: MEMORY FIRST (1–4), THEN STATE (5–10).

   The panel used to open with a ribbon, a health box and a wave list. That
   answers "what state is this document in" and nothing else — and a user coming
   back after three weeks did not come back to ask that. They need THEIR OWN
   MEMORY back: what they asked for, in their own words; the brief that was
   frozen and is never re-asked; which reference documents fed it and whether
   those still hold; and the ordered story of every request from the first
   firing to the last touch.

   That is why v0.48.1 added `orc doc journal` / `context` at all: it was a DATA
   gap, not a rendering one, and no amount of layout could have fixed it. */
async function loadDocDetail(pane, slug, body) {
  let s;
  let map = null;
  let lint = null;
  let plan = null;
  let show = null;
  let next = null;
  let audit = null;
  const q = "?slug=" + encodeURIComponent(slug);
  const soft = (route) => read(route).catch(() => ({ data: null }));
  try {
    s = (await read("/api/doc/one" + q)).data;
    map = (await soft("/api/doc/map" + q)).data;
    lint = (await soft("/api/doc/lint" + q)).data;
    plan = (await soft("/api/doc/plan" + q + "&role=write")).data;
    show = (await soft("/api/doc/show" + q)).data;
    next = (await soft("/api/doc/next" + q)).data;
    audit = (await soft("/api/doc/audit" + q)).data;
  } catch (e) {
    pane.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const out = frag();
  const sections = (map && map.sections) || [];

  // ── THE MEMORY HALF ──────────────────────────────────────────────────────

  // --- 1. the header strip. Every value comes from `orc doc show --json`;
  //     the panel computes none of it.
  if (show) out.append(docHeaderStrip(show, s));

  // --- 2. the brief — expanded by default on first open. THE single
  //     highest-value card here, and the verbatim request is its payload.
  if (show && show.context) out.append(docBriefCard(show.context));

  // --- 3. reference files, with the CLI's own state words per row.
  if (show && show.context) out.append(docSourcesCard(show.context));

  // --- 4. the journal — the ordered story, oldest first, gaps AS gaps.
  if (show && (show.journal || []).length) out.append(docJournalCard(show.journal));

  // ── THE STATE HALF ───────────────────────────────────────────────────────

  // --- 5. the state chip and the ONE next action
  const st = card(null);
  const stRow = el("div", "row-actions");
  // THE CLI'S STATE WORDS, VERBATIM — `shipped-drifted` is never softened into
  // something friendlier, and it KEEPS ITS SLOT because it is an answer.
  stRow.append(chip(s.state, DOC_DOC_STATE_KIND[s.state] !== undefined ? DOC_DOC_STATE_KIND[s.state] : "info"));
  stRow.append(el("span", "note", s.where));
  st.append(stRow);
  st.append(docNextAction(s, next, body));
  out.append(st);

  // --- 6. ship. A decision, so it is a modal that names its destination and
  //     shows the exact command BEFORE it runs.
  out.append(docShipCard(s, body));

  // --- 7. audit. A clean audit is a one-line answer, never an empty card.
  if (audit) out.append(docAuditCard(audit, body));

  // --- 8. THE RIBBON. The one picture this panel is for.
  if (sections.length) {
    const rc = card(t("docs.ribbon"), docFreeActions(slug, body));
    rc.append(docRibbon(sections, (id) => docOpenSection(pane, id)));
    rc.append(docRibbonLegend());
    out.append(rc);
  }

  // --- 9. health — straight from the lint. The CLI's words are the only words.
  //     `ok: false` is the CLI answering "there is no document yet", which is a
  //     real state and not a card with empty numbers in it.
  if (lint && lint.ok !== false) {
    const hc = card(t("docs.health"));
    hc.append(docHealth(lint));
    out.append(hc);
  }

  // --- 10. the sections
  if (sections.length) {
    const sc = card(t("docs.sections"));
    sc.append(docSectionList(sections, slug, show));
    sc.append(el("div", "note", t("docs.sectionsNote")));
    out.append(sc);
  }

  // --- 11. the wave preview
  if (plan && plan.waves && plan.waves.length) {
    const wc = card(t("docs.waves"));
    wc.append(el("div", "note", t("docs.wavesNote")));
    wc.append(docWaves(plan));
    if (plan.clamped) wc.append(el("div", "note bad", t("docs.clamped", { from: plan.clamped.from, to: plan.clamped.to })));
    if ((plan.oversized || []).length)
      wc.append(el("div", "note bad", t("docs.oversized", { ids: plan.oversized.join(", ") })));
    out.append(wc);
  }

  // --- 12. the cycles, last. History is not an action, and card 4 already told
  //     the STORY — this is the SHAPE of the run. Both, because they answer
  //     different questions.
  if (show && show.cycles && show.cycles.length) {
    out.append(
      collapsible({
        title: t("docs.cycles"),
        count: String(show.cycles.length),
        collapsed: true,
        content: kvList(
          show.cycles.map((c) => [
            String(c.at || "—"),
            [t("docs.cycleN", { n: c.n }), c.role, c.agents ? tn(c.agents, "docs.agentN") : null, c.model]
              .filter(Boolean)
              .join(" · "),
          ])
        ),
      })
    );
  }

  pane.replaceChildren(out);
}

// The CLI's five computed states. The panel may KEY on one — a colour, a
// marker, an action — but never invent one.
const DOC_DOC_STATE_KIND = {
  "not-started": "",
  "in-progress": "info",
  complete: "ok",
  shipped: "ok",
  "shipped-drifted": "warn",
};

// --- 1. one dense row under the title. `created_at` is here because the CLI
//     always knew it and, until v0.48.1, never said so.
function docHeaderStrip(show, s) {
  const c = card(null);
  const rows = [
    [t("docs.meta.started"), show.created_at || "—"],
    [t("docs.meta.touched"), show.last_touched_at || "—"],
    [t("docs.meta.sessions"), String(show.sessions || 0)],
    [t("docs.meta.cycle"), String(show.cycle || 0)],
    [t("docs.meta.type"), String(show.type || "").toUpperCase()],
    [t("docs.meta.target"), show.target || "—"],
    [t("docs.meta.language"), show.language || "—"],
    [t("docs.meta.length"), show.length || "—"],
    [t("docs.meta.template"), (show.template && show.template.source) || "—"],
  ];
  c.append(kvList(rows));
  return c;
}

// --- 2. THE BRIEF. Frozen once, read forever, never re-asked — and the panel
//     says that out loud, because a card that looks editable invites an edit
//     that this lane cannot honour.
function docBriefCard(ctx) {
  if (!ctx.exists) {
    const c = card(t("docs.brief"));
    c.append(empty(t("docs.briefNone"), t("docs.briefNoneHint")));
    return c;
  }
  const c = card(t("docs.brief"));
  c.append(el("div", "note", t("docs.briefFrozen", { when: ctx.frozen_at || "—" })));
  // THE VERBATIM REQUEST, FIRST AND LARGEST. A paraphrase is where a resumed
  // session quietly starts writing a different document.
  if (ctx.request) {
    const q = el("div", "promise");
    q.textContent = ctx.request;
    c.append(q);
  }
  for (const [key, val] of [
    ["docs.briefPurpose", ctx.purpose],
    ["docs.briefTemplate", ctx.template],
    ["docs.briefDecisions", ctx.decisions],
  ])
    if (val) c.append(collapsible({ title: t(key), collapsed: true, content: renderMd(val) }));
  return c;
}

// --- 3. reference files. When D2 was answered "none" the card says so and
//     KEEPS ITS SLOT — an empty card would read as a bug.
function docSourcesCard(ctx) {
  const c = card(t("docs.sources"));
  if (!ctx.exists || !(ctx.sources || []).length) {
    c.append(el("div", "note", t("docs.sourcesNone")));
    return c;
  }
  const wrap = el("div", "free-box");
  for (const src of ctx.sources) {
    const row = el("div", "free-row");
    // The CLI's words, verbatim: `ok`, `MISSING`, `SOURCE-DRIFTED`.
    row.append(chip(src.state, src.state === "ok" ? "ok" : src.state === "MISSING" ? "bad" : "warn"));
    row.append(el("span", "mono", src.path));
    if (src.note) row.append(el("span", "note", src.note));
    wrap.append(row);
  }
  c.append(wrap);
  c.append(el("div", "note", t("docs.sourcesNote")));
  return c;
}

// --- 4. THE JOURNAL. Oldest first, because reading order IS the story.
function docJournalCard(rows) {
  const recorded = rows.filter((r) => r.origin === "recorded").length;
  const c = card(t("docs.journal"));
  c.append(el("div", "note", t("docs.journalNote", { n: rows.length, recorded })));
  const wrap = el("div", "after-box");
  for (const r of rows) {
    const row = el("div", "after-row");
    row.append(el("span", "mono", r.at || "—"));
    row.append(chip(r.origin, r.origin === "recorded" ? "ok" : r.origin === "observed" ? "warn" : ""));
    row.append(chip(r.kind, "info"));
    // A cycle nobody logged renders AS A GAP. Never a plausible reconstruction:
    // the /orc-pact UNCHECKABLE rule — not knowing is an answer, and faking it
    // teaches people to distrust the rows that are real.
    if (r.gap) row.append(el("span", "note", t("docs.journalGap")));
    else if (r.text) row.append(el("span", null, r.text));
    if ((r.sections || []).length) row.append(el("span", "note mono", r.sections.join(" ")));
    if (r.source && r.source !== "user") row.append(chip(r.source, "info"));
    wrap.append(row);
  }
  c.append(wrap);
  return c;
}

// --- 6. SHIP. A disabled control that explains itself, never a missing one.
function docShipCard(s, body) {
  const c = card(t("docs.ship"));
  const shipped = s.shipped;
  if (shipped) {
    c.append(kvList([[t("docs.shipWhen"), shipped.at], [t("docs.shipWhere"), shipped.where], ...(shipped.note ? [[t("docs.shipNote"), shipped.note]] : [])]));
    if (shipped.forced) c.append(el("div", "note bad", t("docs.shipForced", { why: shipped.force_reason || "" })));
    if (s.state === "shipped-drifted")
      c.append(el("div", "note warn", t("docs.shipDrifted", { names: (s.drifted_sections || []).map((x) => x.heading).join(" · ") })));
    c.append(docShipButtons(s, body, true));
    return c;
  }
  const canShip = s.state === "complete";
  const btnRow = el("div", "row-actions");
  const b = el("button", "btn btn-primary btn-sm", t("docs.shipGo"));
  b.type = "button";
  b.disabled = !canShip;
  if (canShip) b.addEventListener("click", () => docShipModal(s, body, false));
  btnRow.append(b);
  c.append(btnRow);
  if (!canShip)
    c.append(
      el(
        "div",
        "note warn",
        t("docs.shipBlocked", {
          why: (s.open_sections || []).length
            ? (s.open_sections || []).map((x) => x.heading).join(" · ")
            : t("docs.shipBlockedLint"),
        })
      )
    );
  c.append(el("div", "note", t("docs.shipWhy")));
  return c;
}

function docShipButtons(s, body, shipped) {
  const row = el("div", "row-actions");
  const re = el("button", "btn btn-ghost btn-sm", t("docs.reship"));
  re.type = "button";
  re.addEventListener("click", () => docShipModal(s, body, false));
  const un = el("button", "btn btn-ghost btn-sm", t("docs.unship"));
  un.type = "button";
  un.addEventListener("click", () => docShipModal(s, body, true));
  row.append(re, un);
  return row;
}

function docShipModal(s, body, undo) {
  const b = frag();
  const field = (labelKey, ph) => {
    const wrap = el("div", "field");
    wrap.append(el("label", "field-label", t(labelKey)));
    const input = el("input", "text-input");
    input.type = "text";
    input.placeholder = ph;
    wrap.append(input);
    b.append(wrap);
    return input;
  };
  b.append(el("p", null, t(undo ? "docs.unshipBody" : "docs.shipBody")));
  const first = undo ? field("docs.shipReason", t("docs.shipReasonPh")) : field("docs.shipWhere", t("docs.shipWherePh"));
  const note = undo ? null : field("docs.shipNote", t("docs.shipNotePh"));
  // THE EXACT COMMAND IS ALWAYS VISIBLE, and it updates as you type — so it is
  // always typeable by hand instead. The Maintenance rule, unchanged.
  const cmd = el("pre", "cmd", "");
  const paint = () => {
    const v = first.value.trim();
    cmd.textContent = undo
      ? `orc doc unship ${s.slug} --reason "${v || "…"}"`
      : `orc doc ship ${s.slug} --where "${v || "…"}"` + (note && note.value.trim() ? ` --note "${note.value.trim()}"` : "");
  };
  paint();
  first.addEventListener("input", paint);
  if (note) note.addEventListener("input", paint);
  b.append(cmd);
  b.append(el("div", "note", t(undo ? "docs.unshipNote" : "docs.shipModalNote")));
  modal({
    title: t(undo ? "docs.unshipTitle" : "docs.shipTitle"),
    body: b,
    actions: [
      { label: t("common.cancel"), onClick: (close) => close() },
      {
        label: t(undo ? "docs.unship" : "docs.shipGo"),
        onClick: async (close) => {
          const v = first.value.trim();
          if (!v) {
            toast(t(undo ? "docs.unshipNeedReason" : "docs.shipNeedWhere"), "bad");
            return;
          }
          close();
          const r = undo
            ? await post("/api/doc/unship", { slug: s.slug, reason: v })
            : await post("/api/doc/ship", { slug: s.slug, where: v, note: note ? note.value.trim() : "" });
          toast(r.ok ? t("docs.shipOk") : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
          renderDocs(body);
        },
      },
    ],
  });
}

// --- 7. AUDIT. A clean audit is a one-line answer, not an empty card.
function docAuditCard(audit, body) {
  const c = card(t("docs.audit"));
  if (audit.ok === false) return c;
  if (!(audit.findings || []).length) {
    c.append(el("div", "note ok", t("docs.auditClean")));
    return c;
  }
  for (const f of audit.findings) {
    const box = el("div", "finding");
    const left = el("div");
    left.append(el("div", null, f.summary));
    left.append(el("div", "note mono", f.id));
    box.append(left);
    // A caution routes to the panel that can CLEAR it; `panel: null` means no
    // button at all, never a useless one.
    if (f.panel && f.panel !== "docs") {
      const go = el("button", "btn btn-ghost btn-sm", t("docs.auditGo"));
      go.type = "button";
      go.addEventListener("click", () => (location.hash = "#/" + f.panel));
      box.append(go);
    }
    c.append(box);
    c.append(el("pre", "cmd", f.fix));
  }
  return c;
}

// EVERY STATE ANSWERS "so what do I do now?" — and since v0.48.1 the ANSWER
// comes from `orc doc next`, rendered verbatim. There is no ordering logic
// here: the panel decides nothing about the pipeline. Same rule as the Flow
// stepper, and for the same reason.
function docNextAction(s, next, body) {
  const wrap = el("div", "stack stack-sm");
  if ((s.user_edited || []).length)
    wrap.append(el("div", "note", t("docs.editedNote", { names: s.user_edited.map((x) => x.heading).join(" · ") })));
  if ((s.open_sections || []).length)
    wrap.append(el("div", "note warn", t("docs.openNote", { names: s.open_sections.map((x) => x.heading).join(" · ") })));

  if (!next || next.ok === false) {
    wrap.append(laneCommand(s.resume, t("docs.paidWhy")));
    return wrap;
  }
  wrap.append(el("div", "note", `${next.phase} · ${next.why}`));
  if (next.blocked_by) {
    // Waiting on a HUMAN. Never a button, because there is nothing to press.
    wrap.append(el("div", "note warn", t("docs.nextBlocked", { why: next.blocked_by })));
    for (const alt of next.alternatives || []) wrap.append(el("pre", "cmd", alt));
    return wrap;
  }
  // A FREE action gets a button; a PAID action gets a copy-able command. That
  // line is the W2 rule, and it is visible here rather than remembered.
  if (next.paid) wrap.append(laneCommand(next.command, t("docs.paidWhy")));
  else {
    wrap.append(el("pre", "cmd", next.command));
    wrap.append(el("div", "note ok", t("docs.nextFree")));
  }
  if (s.state === "complete" || s.state === "shipped") {
    wrap.append(el("pre", "cmd", `git add ${s.document}`));
    wrap.append(el("div", "note", t("docs.challengeNote")));
    wrap.append(el("pre", "cmd", `/orc-challenge ${s.document}`));
  }
  return wrap;
}

// The free actions. A refetch of a deterministic read is a BUTTON; so is
// `assemble`, which only concatenates files already on disk in an order the
// outline already fixed.
function docFreeActions(slug, body) {
  const row = el("div", "row-actions");
  const relint = el("button", "btn btn-ghost btn-sm", t("docs.reLint"));
  relint.type = "button";
  relint.addEventListener("click", () => renderDocs(body));
  row.append(relint);
  const asm = el("button", "btn btn-ghost btn-sm", t("docs.assemble"));
  asm.type = "button";
  asm.addEventListener("click", () => {
    const b = frag();
    b.append(el("p", null, t("docs.assembleBody")));
    // The exact command is ALWAYS on screen, so it is always typeable by hand
    // instead — the Maintenance rule, applied to the one free write here.
    b.append(el("pre", "cmd", `orc doc assemble ${slug}`));
    b.append(el("div", "note", t("docs.assembleNote")));
    modal({
      title: t("docs.assembleTitle"),
      body: b,
      actions: [
        { label: t("common.cancel"), onClick: (close) => close() },
        {
          label: t("docs.assembleGo"),
          onClick: async (close) => {
            close();
            const r = await post("/api/doc/assemble", { slug });
            toast(r.ok ? t("docs.assembleOk") : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
            renderDocs(body);
          },
        },
      ],
    });
  });
  row.append(asm);
  return row;
}

/* THE RIBBON — each section is a segment whose width is proportional to its line
   count, coloured by its state. In one glance: how long the document is, where
   the weight sits, what is still open, what the user edited, and where the
   findings are.

   GEOMETRY IS SOLVED FROM THE BOX SIZE, never expressed as a fraction of the
   container (the VAULT / ringRadii lesson): a segment is `lines × PX` with a
   floor that keeps a 3-line section clickable, the canvas is the bounding box of
   what was PLACED, and a document too long for the panel SCROLLS rather than
   being squeezed into unreadable slivers. */
const DOC_RIBBON = { H: 34, MIN: 14, PX: 1.6, GAP: 2, PAD: 8, LABEL: 16 };

function docRibbon(sections, onPick) {
  const wrap = el("div", "doc-ribbon-wrap");
  const widths = sections.map((s) => Math.max(DOC_RIBBON.MIN, Math.round((s.lines || 1) * DOC_RIBBON.PX)));
  const xs = [];
  let x = DOC_RIBBON.PAD;
  for (const w of widths) {
    xs.push(x);
    x += w + DOC_RIBBON.GAP;
  }
  const width = x - DOC_RIBBON.GAP + DOC_RIBBON.PAD;
  const height = DOC_RIBBON.H + DOC_RIBBON.LABEL + 2 * DOC_RIBBON.PAD;

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "doc-ribbon");
  // The canvas keeps its aspect: a stretched `preserveAspectRatio="none"` viewBox
  // squashes every label and every stroke.
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("docs.ribbonAria", { n: sections.length }));

  const mk = (name, attrs, text) => {
    const n = document.createElementNS(NS, name);
    for (const k of Object.keys(attrs)) n.setAttribute(k, String(attrs[k]));
    if (text !== undefined) n.textContent = text;
    return n;
  };

  sections.forEach((s, i) => {
    const w = widths[i];
    const g = mk("g", {
      class: "doc-seg doc-seg-" + s.state.replace(/[^a-z-]/g, "") + (s.findings ? " has-findings" : ""),
      style: `animation-delay:${i * 26}ms`,
      tabindex: "0",
      role: "button",
    });
    g.append(mk("rect", { x: xs[i], y: DOC_RIBBON.PAD, width: w, height: DOC_RIBBON.H, rx: 4, class: "doc-seg-box" }));
    // A findings marker is STATIC. A blinking error is a reduced-motion hazard
    // and reads as an urgency this panel has no right to imply.
    if (s.findings)
      g.append(mk("rect", { x: xs[i], y: DOC_RIBBON.PAD, width: w, height: 3, class: "doc-seg-mark" }));
    if (w >= 22)
      g.append(
        mk(
          "text",
          { x: xs[i] + w / 2, y: DOC_RIBBON.PAD + DOC_RIBBON.H + 12, class: "doc-seg-n", "text-anchor": "middle" },
          String(i + 1)
        )
      );
    // The tooltip repeats the CLI's own numbers and its own state word.
    g.append(
      mk("title", {}, `${s.heading} — ${s.state} · ${s.start}..${s.end} · ${s.lines} L${s.findings ? " · " + s.findings : ""}`)
    );
    const pick = () => onPick(s.id);
    g.addEventListener("click", pick);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
    svg.append(g);
  });

  wrap.append(svg);
  return wrap;
}

function docRibbonLegend() {
  const row = el("div", "row-actions doc-legend");
  for (const state of Object.keys(DOC_STATE_KIND)) {
    const item = el("span", "doc-legend-item");
    item.append(el("span", "doc-legend-swatch doc-seg-" + state.replace(/[^a-z-]/g, "")));
    item.append(el("span", "note", state));
    row.append(item);
  }
  return row;
}

// Open one section row in the list, from a ribbon click. One at a time.
function docOpenSection(pane, id) {
  const btn = pane.querySelector('[data-section="' + CSS.escape(id) + '"]');
  if (!btn) return;
  for (const other of pane.querySelectorAll(".doc-row.open")) if (other !== btn.parentElement) other.classList.remove("open");
  btn.parentElement.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
  btn.scrollIntoView({ block: "nearest" });
  btn.focus();
}

function docSectionList(sections, slug, show) {
  const list = el("div", "doc-rows");
  const outline = new Map(((show && show.outline) || []).map((o) => [o.id, o]));
  for (const s of sections) {
    const row = el("div", "run-row doc-row");
    const btn = el("button", "run-card");
    btn.type = "button";
    btn.dataset.section = s.id;
    btn.setAttribute("aria-expanded", "false");
    btn.append(el("span", "run-caret", "▸"));
    btn.append(chip(s.state, DOC_STATE_KIND[s.state] || ""));
    const mid = el("div", "run-mid");
    mid.append(el("div", "run-slug", s.heading));
    mid.append(el("div", "run-where mono", `${s.start}..${s.end}`));
    btn.append(mid);
    btn.append(el("div", "run-age", `${s.lines} L`));
    if (s.findings) btn.append(chip(String(s.findings), "warn"));

    const pane = el("div", "run-pane stack stack-sm");
    const rows = [];
    const o = outline.get(s.id);
    if (o && o.purpose) rows.push([t("docs.field.purpose"), o.purpose]);
    rows.push([t("docs.field.required"), o && o.required === false ? t("docs.optional") : t("docs.required")]);
    rows.push([t("docs.field.hash"), String(s.hash || "").slice(0, 12)]);
    if (s.cycle) rows.push([t("docs.field.cycle"), String(s.cycle)]);
    if (s.renamed_from) rows.push([t("docs.field.renamedFrom"), s.renamed_from]);
    pane.append(kvList(rows));
    // REVEAL — the panel never shows a section's text until somebody asks for
    // that one section. It is rendered as DOM through `renderMd`, never as HTML.
    pane.append(docRevealBtn(slug, s.id, pane));
    const inner = el("div", "run-body-inner");
    inner.append(pane);
    const fold = el("div", "run-body");
    fold.append(inner);

    btn.addEventListener("click", () => {
      const open = row.classList.contains("open");
      for (const other of list.querySelectorAll(".doc-row.open")) other.classList.remove("open");
      row.classList.toggle("open", !open);
      btn.setAttribute("aria-expanded", String(!open));
    });
    row.append(btn, fold);
    list.append(row);
  }
  return list;
}

function docRevealBtn(slug, id, pane) {
  const wrap = el("div", "stack stack-sm");
  const b = el("button", "btn btn-ghost btn-sm", t("docs.reveal"));
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    let r = null;
    try {
      r = (await read("/api/doc/section?slug=" + encodeURIComponent(slug) + "&section=" + encodeURIComponent(id))).data;
    } catch (_) {}
    b.remove();
    if (!r || !r.text) {
      wrap.append(el("div", "note", t("docs.revealFail")));
      return;
    }
    const box = el("div", "doc-reveal");
    box.append(renderMd(r.text));
    wrap.append(box);
    wrap.append(el("div", "note", t("docs.revealNote")));
  });
  wrap.append(b);
  return wrap;
}

// The health card. STRAIGHT FROM `orc doc lint --json`: the CLI's rule names,
// the CLI's counts, the CLI's own honesty lines. Never a friendlier synonym for
// a rule, and the two honesty lines are not optional chrome.
function docHealth(lint) {
  const wrap = el("div", "stack stack-sm");
  const chips = el("div", "row-actions");
  chips.append(chip(tn(lint.errors, "docs.errorN"), lint.errors ? "bad" : "ok"));
  chips.append(chip(tn(lint.warnings, "docs.warnN"), lint.warnings ? "warn" : ""));
  chips.append(chip(lint.target_label, "info"));
  chips.append(chip(`max H${lint.max_heading}`, ""));
  chips.append(chip("front matter: " + lint.front_matter, ""));
  wrap.append(chips);

  const r = lint.readability || {};
  wrap.append(
    kvList([
      [t("docs.read.avg"), `${r.avg_sentence_words} / ${r.avg_bar}`],
      [t("docs.read.longest"), r.longest_sentence_line ? `${r.longest_sentence_words} → L${r.longest_sentence_line}` : "—"],
      [t("docs.read.longWords"), `${r.long_word_pct}%`],
      [t("docs.read.passive"), String(r.passive_constructions)],
      [t("docs.read.acronyms"), (r.undefined_acronyms || []).map((a) => a.acronym).join(", ")],
    ])
  );

  // Findings grouped by the CLI's rule name, as bars. A rule keeps its slot at
  // zero only when it fired at least once — a table of every rule that did not
  // fire is noise, but a rule that fired and is not shown is a lie.
  const byRule = new Map();
  for (const f of lint.findings || []) byRule.set(f.rule, (byRule.get(f.rule) || 0) + 1);
  if (byRule.size) {
    const max = Math.max(...byRule.values());
    const bars = el("div", "doc-bars");
    for (const [rule, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
      const row = el("div", "doc-bar-row");
      row.append(el("span", "doc-bar-label mono", rule));
      const bar = el("div", "doc-bar");
      const seg = el("div", "doc-bar-seg");
      seg.style.setProperty("--w", ((n / max) * 100).toFixed(2) + "%");
      bar.append(seg);
      row.append(bar);
      row.append(el("span", "doc-bar-n", String(n)));
      bars.append(row);
    }
    wrap.append(bars);
  }
  if (lint.import_note) wrap.append(el("div", "note warn", lint.import_note));
  for (const line of lint.honesty || []) wrap.append(el("div", "note", line));
  return wrap;
}

/* THE WAVE VISUALISER — the part of ORC that has never been drawn. `orc doc plan
   --json` gives the exact batching, so the panel can show it and decide nothing
   about it: the agent name, the sections, the budget and the wave number are all
   the CLI's. */
function docWaves(plan) {
  const wrap = el("div", "doc-waves");
  plan.waves.forEach((w, wi) => {
    const row = el("div", "doc-wave");
    row.style.setProperty("--i", String(wi));
    row.append(el("div", "doc-wave-n", t("docs.waveN", { n: w.n })));
    const cards = el("div", "doc-wave-cards");
    for (const a of w.agents) {
      const c = el("div", "doc-agent" + (a.oversized ? " oversized" : ""));
      c.append(el("div", "doc-agent-name mono", a.agent));
      c.append(el("div", "doc-agent-secs", a.headings.join(" + ")));
      const meta = el("div", "row-actions");
      meta.append(chip(`${a.budget_lines} L`, ""));
      if (a.range) meta.append(chip(`${a.range[0]}..${a.range[1]}`, "info"));
      if (a.oversized) meta.append(chip(t("docs.oversizedChip"), "bad"));
      c.append(meta);
      cards.append(c);
    }
    row.append(cards);
    wrap.append(row);
  });
  return wrap;
}
