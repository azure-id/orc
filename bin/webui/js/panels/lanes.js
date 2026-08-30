"use strict";
/* panels/lanes.js — orc ui client
   The `orc lane` noun, rendered: which lanes exist, which SHARED phases each
   one runs, and the whole call catalogue.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


/* =================================================================== LANES == */

// TWO TABS, on this panel's own precedent (Crosslink's two, Knowledge's five,
// Extra's six). Phases and Calls answer two different questions about the same
// noun — what a lane READS, in order, and what a lane RUNS — and stacking both
// down one column made the second one something you had to know was there.
//
// The tab survives a re-render, exactly as `KN_TAB` and `EX_TAB` do: losing
// your place because a fetch resolved is the small rudeness that makes a panel
// feel unreliable.
let LN_TAB = "phases";
// The selected lane likewise. A lane picker that snaps back to `orc` every time
// the panel repaints is a picker nobody uses twice.
let LN_LANE = "orc";

PANELS.lanes = function (host) {
  head(host, t("lanes.title"), t("lanes.sub"));
  section(
    host,
    () => read("/api/lanes").then((r) => r.data),
    (d) => {
      const out = frag();
      const lanes = d.lanes || [];
      if (!lanes.length) {
        out.append(el("div", "empty", t("lanes.none")));
        return out;
      }
      if (!lanes.some((l) => l.lane === LN_LANE)) LN_LANE = lanes[0].lane;

      const body = el("div", "stack");
      const paint = () => {
        body.replaceChildren();
        if (LN_TAB === "phases") phasesTab(body, lanes);
        else callsTab(body);
      };

      // The panel's own `.tabs` convention: a flat strip driven by
      // `aria-selected`, exactly as Knowledge and Runs build theirs. Keys are
      // written out IN FULL rather than assembled from the tab id — a key built
      // from a fragment is invisible to every check that looks for one.
      const strip = el("div", "tabs");
      const select = (which) => {
        LN_TAB = which;
        for (const b of strip.children) b.setAttribute("aria-selected", String(b.dataset.tab === which));
        paint();
      };
      for (const [which, label] of [
        ["phases", t("lanes.tab.phases")],
        ["calls", t("lanes.tab.calls")],
      ]) {
        const b = el("button", null, label);
        b.type = "button";
        b.dataset.tab = which;
        b.setAttribute("aria-selected", String(which === LN_TAB));
        b.addEventListener("click", () => select(which));
        strip.append(b);
      }
      out.append(strip, body);
      paint();
      return out;
    }
  );
};

/* ------------------------------------------------------------------ phases -- */

function phasesTab(host, lanes) {
  const picker = card(t("lanes.picker.title"));
  picker.append(el("div", "note", t("lanes.picker.note")));

  const sel = el("select", "text-input");
  sel.setAttribute("aria-label", t("lanes.picker.aria"));
  for (const l of lanes) {
    const o = el("option", null, l.lane + (l.command ? "  " + l.command : ""));
    o.value = l.lane;
    if (l.lane === LN_LANE) o.selected = true;
    sel.append(o);
  }
  picker.append(sel);
  host.append(picker);

  const slot = el("div", "stack");
  host.append(slot);

  const load = () => {
    slot.replaceChildren(skeleton(3));
    read("/api/lane/phases?lane=" + encodeURIComponent(LN_LANE))
      .then((r) => slot.replaceChildren(phasesCard(r.data)))
      .catch((e) => slot.replaceChildren(failBox(e)));
  };
  sel.addEventListener("change", () => {
    LN_LANE = sel.value;
    load();
  });
  load();
}

function phasesCard(d) {
  const one = (d.lanes || [])[0];
  const c = card(t("lanes.phases.title"));
  if (!one) {
    c.append(el("div", "empty", t("lanes.phases.unknown")));
    return c;
  }

  // The trace tier and token are the CLI's words for how this lane narrates.
  // They belong at the top because every phase below closes into one of them.
  const meta = el("div", "lane-meta");
  meta.append(el("span", "lane-meta-label", t("lanes.phases.trace")));
  if (one.trace_tier) meta.append(chip(one.trace_tier));
  if (one.trace_token) meta.append(chip("lane token " + one.trace_token, "lane"));
  c.append(meta);

  const phases = one.phases || [];
  if (!phases.length) {
    // AN EMPTY ANSWER IS AN ANSWER (v0.43.0). Five lanes keep their pipeline in
    // their own spine on purpose, so "no shared phases" is a fact about this
    // lane and not a fetch that failed. Saying nothing here would make the two
    // look identical.
    c.append(el("div", "empty", t("lanes.phases.inSpine")));
    return c;
  }

  for (const p of phases) {
    const row = el("div", "phase-row");
    row.append(el("span", "phase-ord", String(p.ord)));

    const mid = el("div", "phase-mid");
    mid.append(el("div", "phase-id", p.id));
    // A row names a FILE or a HEADING, never both and never neither — the
    // manifest rule the two-way lint enforces. Whichever it is, it is a CLI
    // string and is printed verbatim.
    if (p.file) mid.append(el("div", "phase-file", p.file));
    if (p.heading) mid.append(el("div", "phase-file", p.heading));
    if ((p.calls || []).length) {
      const calls = el("div", "phase-calls");
      calls.append(el("span", "phase-calls-label", t("lanes.phases.calls")));
      for (const id of p.calls) calls.append(chip(id, "lane"));
      mid.append(calls);
    }
    row.append(mid);

    const right = el("div", "phase-right");
    // `when` is one of the CLI's own words (`always`, `on-phase`,
    // `compile-time`, …). It is never softened into "sometimes".
    if (p.when) right.append(chip(p.when, p.when === "always" ? "ok" : null));
    if (p.read) right.append(el("div", "phase-read", p.read));
    if ((p.layers || []).length) right.append(el("div", "phase-layers", p.layers.join(" · ")));
    row.append(right);

    if (p.optional_when) row.append(el("div", "phase-why", p.optional_when));
    c.append(row);
  }

  if ((d.phase_files || []).length || (d.layer_set || []).length) {
    const foot = el("div", "note");
    foot.append(document.createTextNode(t("lanes.phases.foot")));
    c.append(foot);
  }
  return c;
}

/* ------------------------------------------------------------------- calls -- */

function callsTab(host) {
  const slot = el("div", "stack");
  host.append(slot);
  slot.replaceChildren(skeleton(4));
  read("/api/lane/calls")
    .then((r) => slot.replaceChildren(callsCard(r.data)))
    .catch((e) => slot.replaceChildren(failBox(e)));
}

function callsCard(d) {
  const calls = d.calls || [];
  const c = card(t("lanes.calls.title", { n: calls.length }));
  c.append(el("div", "note", t("lanes.calls.note")));
  if (!calls.length) {
    c.append(el("div", "empty", t("lanes.calls.none")));
    return c;
  }

  for (const call of calls) {
    // EXPANDS IN PLACE, one row at a time — the Runs-row rule (v0.43.6). A
    // detail box below a list means reading a row and then looking somewhere
    // else for what it said.
    const row = el("div", "call-row");
    const h = el("button", "call-head");
    h.type = "button";
    h.setAttribute("aria-expanded", "false");
    h.append(el("span", "call-caret", "▸"));
    h.append(el("span", "call-cmd", call.cmd));
    if (call.cost) h.append(chip(call.cost, call.cost === "free" ? "ok" : "warn"));
    h.append(el("span", "call-lanes-n", tn((call.lanes || []).length, "lanes.calls.lanes")));

    const detail = el("div", "call-detail");
    detail.hidden = true;
    // Every string below is the CLI's registry text and is never translated: it
    // names commands, exit codes and reference files by their real ids.
    const rows = [];
    if (call.what) rows.push([t("lanes.calls.what"), call.what]);
    if (call.when) rows.push([t("lanes.calls.when"), call.when]);
    if (call.on_absent) rows.push([t("lanes.calls.onAbsent"), call.on_absent]);
    if (call.never) rows.push([t("lanes.calls.never"), call.never]);
    if (call.canonical) rows.push([t("lanes.calls.canonical"), call.canonical]);
    detail.append(kvList(rows));

    // The exit codes are a CONTRACT, so they are drawn as a table rather than
    // folded into a sentence — a lane branches on these numbers.
    const exits = call.exits || {};
    const codes = Object.keys(exits);
    if (codes.length) {
      const ex = el("div", "call-exits");
      ex.append(el("span", "call-exits-label", t("lanes.calls.exits")));
      for (const code of codes) ex.append(el("span", "call-exit", code + " = " + exits[code]));
      detail.append(ex);
    }
    if ((call.states || []).length) {
      const st = el("div", "call-exits");
      st.append(el("span", "call-exits-label", t("lanes.calls.states")));
      for (const s of call.states) st.append(chip(s));
      detail.append(st);
    }
    if ((call.lanes || []).length) {
      const ls = el("div", "call-lane-chips");
      ls.append(el("span", "call-exits-label", t("lanes.calls.calledBy")));
      for (const l of call.lanes) ls.append(chip(l, "lane"));
      detail.append(ls);
    }

    h.addEventListener("click", () => {
      const open = h.getAttribute("aria-expanded") === "true";
      // ONE ROW OPEN AT A TIME, the Runs-row rule again: thirty open rows is
      // the wall this panel replaced.
      for (const other of c.querySelectorAll(".call-head[aria-expanded='true']")) {
        other.setAttribute("aria-expanded", "false");
        other.parentElement.querySelector(".call-detail").hidden = true;
      }
      if (!open) {
        h.setAttribute("aria-expanded", "true");
        detail.hidden = false;
      }
    });

    row.append(h, detail);
    c.append(row);
  }
  return c;
}
