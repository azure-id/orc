"use strict";
/* panels/rules.js — orc ui client
   The anti-slop rule surface. Two halves that never mix: ORC's shipped packs
   (read-only, 65 rules) and this project's own ledger, which WINS on any
   conflict.

   The panel decides nothing. It does not compute a count, a tier, an override
   or the lint's coverage — every number here came out of `orc rules --json`,
   and the one write goes back through `orc rules set-all`, which is the only
   writer of the ledger.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


/* --------------------------------------------------------------------- RULES */

const RULE_TIER_KIND = { HARD: "bad", PURPOSE: "warn", LOCK: "" };
const RULE_PRIORITY_KIND = { P0: "bad", P1: "warn", P2: "" };

PANELS.rules = function (host) {
  head(host, t("rules.title"), t("rules.sub"));
  renderRules(host);
};

async function renderRules(host) {
  host.replaceChildren();
  section(
    host,
    () => read("/api/rules").then((r) => r.data),
    (d) => {
      const out = frag();
      if (!d || !d.orc) {
        const c = card(t("rules.title"));
        c.append(empty(t("rules.unavailable"), t("rules.unavailableHint")));
        out.append(c);
        return out;
      }
      out.append(rulesPrecedenceCard(d));
      out.append(rulesUserCard(d, host));
      out.append(rulesPacksCard(d));
      out.append(rulesCreditsCard(d));
      out.append(rulesLintCard());
      return out;
    }
  );
}

// CARD 1 — the ladder. Always visible, never behind a toggle, and first on the
// page: precedence is the single thing people get wrong about this surface, and
// a rule set whose order you have to go and look up is a rule set you will
// misread.
function rulesPrecedenceCard(d) {
  const c = card(t("rules.precedence.title"));
  c.append(el("div", "note", t("rules.precedence.lead")));

  const ladder = el("div", "orule-ladder");
  for (const r of d.precedence || []) {
    const row = el("div", "orule-ladder-row");
    row.append(el("span", "orule-rank", String(r.rank)));
    // Deliberately NOT named `body`: that name is reserved for a panel
    // CONTAINER, and `test/webui/render.test.js` lints every one of those for
    // the `stack` class by NAME. This is a row's inner column, not a panel — so
    // it takes a different name rather than a class it does not want.
    const rung = el("div", "orule-ladder-body");
    const top = el("div", "row-actions");
    top.append(el("span", "orule-layer", r.layer));
    // The CLI's own words for the scope, never a friendlier synonym.
    top.append(el("span", "note", r.scope));
    rung.append(top);
    rung.append(el("div", "note mono orule-where", r.where));
    rung.append(el("div", "note", t("rules.precedence.beats", { what: r.beats })));
    row.append(rung);
    ladder.append(row);
  }
  c.append(ladder);

  // The one sentence a reader has to leave with.
  c.append(el("div", "note orule-house-note", t("rules.precedence.houseScope")));

  if ((d.overrides || []).length) {
    const box = el("div", "orule-overrides");
    box.append(el("div", "checklist-head", tn(d.overrides.length, "rules.overrides.head")));
    for (const o of d.overrides) {
      const row = el("div", "orule-override-row");
      row.append(chip(o.id, o.known ? "warn" : "bad"));
      row.append(el("span", null, o.known ? o.title : t("rules.overrides.unknownId")));
      row.append(el("span", "note mono", o.line));
      box.append(row);
    }
    // WHY the count is what it is. A number nobody can reproduce is a number
    // nobody trusts.
    box.append(el("div", "note", d.overrides_note));
    c.append(box);
  }
  c.append(el("div", "note orule-boundary", d.boundary));
  return c;
}

// CARD 2 — the project's own rules. This is `docRulesCard()` from the Docs
// panel, and deliberately so: that design was argued once (v0.49.5) and the
// argument holds here unchanged. A standing instruction is prose, not a form —
// nobody's real P0 fits on one line, and filing it as numbered rows is work the
// tool invented for itself.
//
// The v0.44.1 rule holds: nothing is written until Apply, the pending edit is
// NAMED, Discard renders only while dirty, and a refused write comes back in the
// CLI's own words.
function rulesUserCard(d, host) {
  const c = card(t("rules.user.title"));
  const u = d.user || {};
  const edits = editSet(() => bar.paint());
  const original = String(u.text || u.template || "");

  const headRow = el("div", "row-actions");
  headRow.append(chip(d.line, u.empty ? "" : "ok"));
  for (const pr of d.priorities || ["P0", "P1", "P2"]) {
    const n = (u.counts || {})[pr] || 0;
    if (n) headRow.append(chip(pr + " " + n, RULE_PRIORITY_KIND[pr] || ""));
  }
  c.append(headRow);

  c.append(el("div", "note", t("rules.user.wins")));
  c.append(el("div", "note", t("rules.user.howto")));

  const ta = el("textarea", "orule-editor");
  ta.value = original;
  ta.spellcheck = false;
  ta.rows = 16;
  ta.setAttribute("aria-label", t("rules.user.title"));
  ta.addEventListener("input", () => {
    if (ta.value === original) edits.drop("rules.md");
    else edits.action("rules.md", "/api/rules/setAll", { text: ta.value }, t("rules.user.staged"));
  });
  c.append(ta);

  // A user who would rather open it in their own editor should not have to go
  // hunting for the path.
  c.append(el("div", "note orule-path", u.file || ""));
  c.append(el("div", "note", t("rules.user.turnOff")));

  const bar = editBar(edits, {
    onApply: async (btn) => {
      await applyActions(edits, btn);
      edits.clear();
      renderRules(host);
    },
    onReset: () => renderRules(host),
    onCancel: () => {
      edits.clear();
      renderRules(host);
    },
    resetLabel: t("rules.user.refresh"),
  });
  c.append(bar);
  return c;
}

// CARD 3 — the shipped packs. READ-ONLY, and there is no control anywhere on it:
// a disabled input would be a control that lies about what it can do. 65 rows
// needs a filter, so it has one — client-side over data already fetched, so it
// never re-runs the CLI.
function rulesPacksCard(d) {
  const orc = d.orc || {};
  const c = card(t("rules.packs.title"), chip(t("rules.packs.readOnly"), ""));
  c.append(el("div", "note", t("rules.packs.lead", { n: orc.count || 0 })));

  const counts = el("div", "row-actions");
  for (const p of orc.packs || [])
    counts.append(chip(`${p.prefix} ${p.count}`, ""));
  c.append(counts);

  const controls = el("div", "row-actions orule-filters");
  const search = el("input", "text-input orule-search");
  search.type = "search";
  search.placeholder = t("rules.packs.filter");
  search.setAttribute("aria-label", t("rules.packs.filter"));
  controls.append(search);
  const tierSel = el("select", "text-input orule-tier");
  tierSel.setAttribute("aria-label", t("rules.packs.tier"));
  for (const [v, label] of [["", t("rules.packs.allTiers")], ...(d.tiers || []).map((x) => [x, x])]) {
    const o = el("option", null, label);
    o.value = v;
    tierSel.append(o);
  }
  controls.append(tierSel);
  c.append(controls);

  const list = el("div", "orule-list");
  c.append(list);
  const foot = el("div", "note");
  c.append(foot);

  const overridden = new Set((d.overrides || []).filter((o) => o.known).map((o) => o.id));
  const paint = () => {
    const q = search.value.trim().toLowerCase();
    const tier = tierSel.value;
    list.replaceChildren();
    let shown = 0;
    for (const p of orc.packs || []) {
      const rows = (orc.rules || []).filter(
        (r) =>
          r.pack === p.id &&
          (!tier || r.tier === tier) &&
          (!q || (r.id + " " + r.title + " " + r.body).toLowerCase().includes(q))
      );
      if (!rows.length) continue;
      // A native <details>, so the toggle, the keyboard handling and the
      // open/closed state are the browser's rather than a hand-rolled expander.
      // CLOSED by default, because 65 rule bodies opened at once is a page
      // nobody reads — and OPEN whenever a filter is active, because seeing what
      // matched is the entire reason someone typed one.
      const group = document.createElement("details");
      group.className = "orule-group";
      group.open = !!(q || tier);
      const gh = document.createElement("summary");
      gh.className = "orule-group-head";
      gh.append(el("span", null, p.title));
      gh.append(el("span", "note mono", p.prefix));
      gh.append(el("span", "note", tn(rows.length, "rules.packs.rules")));
      group.append(gh);
      for (const r of rows) {
        shown++;
        const row = el("div", "orule-row" + (overridden.has(r.id) ? " orule-row-off" : ""));
        const top = el("div", "row-actions");
        top.append(chip(r.id, ""));
        top.append(chip(r.tier, RULE_TIER_KIND[r.tier] || ""));
        top.append(el("span", "orule-title", r.title));
        // A rule the project replaced is SHOWN, struck, and labelled. Hiding it
        // would make an override invisible in the one place it is explained.
        if (overridden.has(r.id)) top.append(chip(t("rules.packs.off"), "warn"));
        row.append(top);
        if (r.body) row.append(el("div", "note orule-body", r.body));
        group.append(row);
      }
      list.append(group);
    }
    foot.textContent = shown
      ? t("rules.packs.showing", { shown, total: orc.count || 0 })
      : t("rules.packs.noMatch");
  };
  search.addEventListener("input", paint);
  tierSel.addEventListener("change", paint);
  paint();

  c.append(el("div", "note mono orule-path", orc.dir || ""));
  c.append(el("div", "note", t("rules.packs.changeHow")));
  // The rule TEXT is shipped content that ids point at, so it stays English in
  // every locale. A translated rule is a different rule.
  c.append(el("div", "note", t("rules.packs.englishOnly")));
  return c;
}

// CARD 4 — credit, rendered rather than buried in a file nobody opens. These
// rules are other people's work.
function rulesCreditsCard(d) {
  const c = card(t("rules.credits.title"));
  c.append(el("div", "note", t("rules.credits.lead")));
  const sources = (d.orc || {}).credits || [];
  for (const s of sources) {
    const row = el("div", "orule-credit");
    const top = el("div", "row-actions");
    top.append(el("span", "orule-credit-who", s.author + (s.handle ? " (@" + s.handle + ")" : "")));
    if (s.license) top.append(chip(s.license, ""));
    for (const p of s.packs || []) top.append(chip(p, ""));
    row.append(top);
    if (s.repo) {
      const a = el("a", "note mono orule-credit-link", s.repo);
      a.href = s.repo;
      a.target = "_blank";
      a.rel = "noreferrer noopener";
      row.append(a);
    }
    row.append(el("div", "note", s.took));
    if (s.read) row.append(el("div", "note", t("rules.credits.readOn", { date: s.read })));
    c.append(row);
  }
  if (!sources.length) c.append(el("div", "note", t("rules.credits.none")));
  return c;
}

// CARD 5 — the free lint. It reports; it never fixes. The coverage line is
// relayed VERBATIM, because a clean result that does not say what it could not
// check is the failure that line exists to prevent.
function rulesLintCard() {
  const c = card(t("rules.lint.title"));
  c.append(el("div", "note", t("rules.lint.lead")));

  const row = el("div", "row-actions");
  const input = el("input", "text-input orule-lint-path");
  input.type = "text";
  input.value = ".";
  input.placeholder = t("rules.lint.pathPlaceholder");
  input.setAttribute("aria-label", t("rules.lint.pathPlaceholder"));
  const run = el("button", "btn btn-sm btn-primary", t("rules.lint.run"));
  run.type = "button";
  row.append(input);
  row.append(run);
  c.append(row);

  const out = el("div", "orule-lint-out");
  c.append(out);

  run.addEventListener("click", async () => {
    run.disabled = true;
    out.replaceChildren(skeleton(2));
    try {
      const r = await read("/api/rules/lint?path=" + encodeURIComponent(input.value || "."));
      const d = r.data || {};
      out.replaceChildren();
      if (d.ok === false) {
        out.append(el("div", "note warn", d.hint || t("rules.lint.nothing")));
        return;
      }
      const headRow = el("div", "row-actions");
      headRow.append(chip(tn(d.files || 0, "rules.lint.files"), ""));
      headRow.append(chip(tn(d.count || 0, "rules.lint.findings"), d.count ? "warn" : "ok"));
      out.append(headRow);

      let last = "";
      for (const f of d.findings || []) {
        if (f.file !== last) {
          out.append(el("div", "note mono orule-lint-file", f.file));
          last = f.file;
        }
        const fr = el("div", "orule-lint-row");
        const top = el("div", "row-actions");
        top.append(el("span", "note mono", String(f.line)));
        top.append(chip(f.rule, RULE_TIER_KIND[f.tier] || ""));
        top.append(el("span", null, f.title || ""));
        fr.append(top);
        fr.append(el("div", "note mono", f.evidence));
        fr.append(el("div", "note", "→ " + f.fix));
        out.append(fr);
      }
      if (!(d.findings || []).length) out.append(el("div", "note ok", t("rules.lint.clean")));
      if ((d.suppressed || []).length)
        out.append(el("div", "note warn", t("rules.lint.suppressed", { ids: d.suppressed.join(" · ") })));
      const ex = ((d.exempt || {}).packs || []).length + ((d.exempt || {}).files || []).length;
      if (ex) out.append(el("div", "note", tn(ex, "rules.lint.skipped")));
      // VERBATIM, always, clean or not.
      out.append(el("div", "note orule-lint-coverage", d.coverage || ""));
    } catch (e) {
      out.replaceChildren(failBox(e));
    } finally {
      run.disabled = false;
    }
  });
  return c;
}
