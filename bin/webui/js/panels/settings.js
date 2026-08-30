"use strict";
/* panels/settings.js — orc ui client
   The toolbar, the tier accordions, every control kind, the score ladder.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


/* ================================================================ SETTINGS == */

// The tier IDS are the CLI's (`k.tier`); only their display name and blurb are
// ours to translate. A tier name alone does not say why a key lives there, and
// "advanced" reads as "do not touch" when it means "you need a reason".
//
// Written out as a literal map rather than `t("settings.tier." + tier)` so the
// keys stay GREPPABLE: a build of a string key from a fragment is a key no
// coverage check can see, and the check is the only thing standing between a
// renamed key and a raw dotted string on somebody's screen.
const TIER_LABEL_KEY = { common: "settings.tier.common", advanced: "settings.tier.advanced" };
const TIER_DESC_KEY = { common: "settings.tierDesc.common", advanced: "settings.tierDesc.advanced" };
const TIER_LABEL = (tier) => (TIER_LABEL_KEY[tier] ? t(TIER_LABEL_KEY[tier]) : tier);
const TIER_DESC = (tier) => (TIER_DESC_KEY[tier] ? t(TIER_DESC_KEY[tier]) : "");

// The settings toolbar: find a key by name or description across every tier,
// narrow to just what you have changed, and open/close all sections. It filters
// what is ALREADY rendered — no refetch, so it stays instant at 36 keys.
function settingsToolbar(d, tiers) {
  const bar = el("div", "toolbar");

  const search = el("div", "search");
  const input = el("input", "text-input");
  input.type = "search";
  input.id = "settings-filter";
  input.placeholder = t("settings.filter");
  input.setAttribute("aria-label", t("settings.filterAria"));
  search.append(input);
  bar.append(search);

  const changedWrap = el("label", "toggle");
  const changed = el("input");
  changed.type = "checkbox";
  const overridden = d.keys.filter((k) => k.is_overridden).length;
  changedWrap.append(changed, document.createTextNode(" " + t("settings.changedOnly", { n: overridden })));
  changedWrap.title = overridden ? t("settings.changedTitle") : t("settings.changedNone");
  if (!overridden) changed.disabled = true;
  bar.append(changedWrap);

  const result = el("span", "toolbar-result");
  bar.append(result);

  const toggleAll = el("button", "btn btn-ghost btn-sm", t("settings.collapseAll"));
  toggleAll.type = "button";
  toggleAll.addEventListener("click", () => {
    const anyOpen = tiers.some((x) => !x.wrap.classList.contains("collapsed"));
    for (const x of tiers) {
      x.wrap.classList.toggle("collapsed", anyOpen);
      x.wrap.querySelector(".tier-head").setAttribute("aria-expanded", String(!anyOpen));
    }
    toggleAll.textContent = anyOpen ? t("settings.expandAll") : t("settings.collapseAll");
  });
  bar.append(toggleAll);

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    const onlyChanged = changed.checked;
    let shown = 0;
    for (const x of tiers) {
      let visible = 0;
      for (const row of x.rows.children) {
        const k = row.dataset.key || "";
        const desc = (row.querySelector(".setting-desc") || {}).textContent || "";
        const hit =
          (!q || k.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) &&
          (!onlyChanged || row.dataset.overridden === "1");
        row.classList.toggle("hidden", !hit);
        if (hit) visible++;
      }
      shown += visible;
      x.count.textContent = visible === x.total ? tn(x.total, "settings.keys") : t("settings.ofTotal", { n: visible, total: x.total });
      // A tier with no matches is hidden outright — an empty titled box is
      // noise between the ones that DID match.
      x.wrap.classList.toggle("hidden", visible === 0);
      // A filter that matches inside a closed section would look like no match
      // at all, so filtering forces the section open.
      if ((q || onlyChanged) && visible) {
        x.wrap.classList.remove("collapsed");
        x.wrap.querySelector(".tier-head").setAttribute("aria-expanded", "true");
      }
    }
    result.textContent = q || onlyChanged ? tn(shown, "settings.matches") : "";
    result.classList.toggle("toolbar-result-none", (q || onlyChanged) && shown === 0);
  };

  input.addEventListener("input", apply);
  changed.addEventListener("change", apply);
  // Esc clears rather than blurs: the filter is the thing in your way.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input.value) {
      e.stopPropagation();
      input.value = "";
      apply();
    }
  });
  return bar;
}

PANELS.settings = function (host) {
  const actions = el("div", "row-actions");
  const profBtn = el("button", "btn btn-sm", t("settings.profiles"));
  profBtn.type = "button";
  profBtn.addEventListener("click", showProfiles);
  const recBtn = el("button", "btn btn-sm", t("settings.recommend"));
  recBtn.type = "button";
  recBtn.addEventListener("click", showRecommend);
  actions.append(profBtn, recBtn);
  head(host, t("settings.title"), t("settings.sub"), actions);

  const body = el("div", "stack");
  host.append(body);
  renderSettings(body);
};

async function renderSettings(body) {
  body.replaceChildren(skeleton(8));
  let d;
  try {
    d = (await read("/api/config")).data;
  } catch (e) {
    body.replaceChildren(empty(t("settings.readFail"), String(e.message)));
    return;
  }

  const out = frag();

  // One edit set per render, so a re-render is also the discard: there is no
  // way for a staged value to outlive the data it was staged against.
  let bar = null;
  const edits = editSet(() => {
    if (bar) bar.paint();
    for (const row of body.querySelectorAll(".setting[data-key]")) {
      row.classList.toggle("staged", edits.map.has(row.dataset.key));
    }
  });

  const pathCard = card(t("settings.file.title"));
  pathCard.append(
    kvList([
      [t("settings.file.file"), d.config_path],
      [t("settings.file.state"), d.exists ? t("settings.file.exists") : t("settings.file.absent")],
    ])
  );
  // Permanently on, deliberately not a key — say so, or somebody hunts for the
  // switch that does not exist.
  pathCard.append(el("div", "note", t("settings.file.traceNote")));
  if ((d.legacy_keys || []).length)
    for (const l of d.legacy_keys)
      pathCard.append(el("div", "note", `\`${l.key}\` is still in the file — it was renamed to \`${l.renamed_to}\`, and is read as that.`));
  out.append(pathCard);

  // The ladder is a DIAGRAM, not an editor, and it re-morphs when opus5_only
  // flips — which is how the precedence rule gets taught rather than described.
  out.append(ladderCard(d.score_table));

  // WHO DECIDES WHAT (v1.0.0 W16). The ladder above answers one family;
  // this answers all of them, and it is the picture a flat key list cannot
  // draw: a contested setting is not decided by the key you are looking at,
  // it is decided by the highest rank that resolved.
  out.append(ranksCard(d.families, d.families_resolved, d.rank_states));

  // 36 keys in three flat lists is a wall, and the answer to "where is the one
  // I want" was scrolling. Each tier is now its own collapsible card, and the
  // toolbar filters across ALL of them at once — so finding a key never depends
  // on knowing which tier somebody filed it under.
  const tiers = [];
  out.append(settingsToolbar(d, tiers));

  for (const tier of ["common", "advanced"]) {
    const keys = d.keys.filter((k) => k.tier === tier);
    if (!keys.length) continue;

    const allInert = keys.every((k) => k.is_shadowed);
    const wrap = el("div", "card tier");
    wrap.dataset.tier = tier;

    const h = el("button", "tier-head");
    h.type = "button";
    h.setAttribute("aria-expanded", "true");
    h.append(el("span", "tier-caret", "▸"));
    h.append(el("h2", null, TIER_LABEL(tier)));
    const count = el("span", "tier-count", tn(keys.length, "settings.keys"));
    h.append(count);
    if (allInert) h.append(chip(t("settings.inert"), "warn"));

    const rows = el("div", "tier-rows");
    for (const k of keys) rows.append(settingRow(k, body, edits));

    // Collapse is height-animated rather than a display swap, so the rows below
    // it move with the section instead of teleporting.
    h.addEventListener("click", () => {
      const open = h.getAttribute("aria-expanded") === "true";
      h.setAttribute("aria-expanded", String(!open));
      wrap.classList.toggle("collapsed", open);
    });

    // The collapse animates `grid-template-rows: 1fr -> 0fr`, which needs a real
    // element child to collapse against — so the body is wrapped, not folded in
    // place. `height: auto` cannot be transitioned; this can.
    const inner = el("div", "tier-body-inner");
    inner.append(el("div", "tier-desc", TIER_DESC(tier)), rows);
    const bodyWrap = el("div", "tier-body");
    bodyWrap.append(inner);

    wrap.append(h, bodyWrap);
    tiers.push({ tier, wrap, rows, count, total: keys.length });
    out.append(wrap);
  }

  if ((d.hand_edited || []).length) {
    const c = card(t("settings.handEdited.title"));
    c.append(el("div", "note", t("settings.handEdited.note")));
    for (const k of d.hand_edited) {
      const row = el("div", "setting" + (k.is_shadowed ? " shadowed" : ""));
      const left = el("div");
      const name = el("div", "setting-name");
      name.append(document.createTextNode(k.key));
      if (k.is_shadowed) {
        const lock = el("span", "lock");
        lock.append(document.createTextNode("🔒 " + t("settings.shadowed")));
        name.append(lock);
      }
      left.append(name);
      left.append(el("div", "setting-desc", t("settings.handEdited.readonly")));
      if (k.shadow_reason) left.append(el("div", "shadow-why", k.shadow_reason));
      const right = el("div", "setting-control");
      right.append(el("div", "readonly-value", String(k.value)));
      row.append(left, right);
      c.append(row);
    }
    out.append(c);
  }

  // A key ORC REMOVED, still sitting in the user's file. It is NOT an editable
  // setting and it is NOT a hand-edited override, so it gets its own block —
  // rendering it as either would tell the user a dead line still does
  // something. The CLI computed the row; this only draws it.
  if ((d.retired_keys || []).length) {
    const c = card(t("settings.retired.title"));
    c.append(el("div", "note", t("settings.retired.note")));
    for (const r of d.retired_keys) {
      const row = el("div", "setting shadowed");
      const left = el("div");
      const name = el("div", "setting-name");
      name.append(document.createTextNode(r.key));
      const lock = el("span", "lock");
      lock.append(document.createTextNode("🔒 " + t("settings.retired.badge")));
      name.append(lock);
      left.append(name);
      left.append(el("div", "setting-desc", t("settings.retired.readonly")));
      left.append(el("div", "shadow-why", `${t("settings.retired.removedIn")} ${r.removed_in} — ${r.why}`));
      const right = el("div", "setting-control");
      right.append(el("div", "readonly-value", String(r.value)));
      row.append(left, right);
      c.append(row);
    }
    out.append(c);
  }

  // Last block on the panel, and it sticks to the bottom of the viewport once
  // something is pending: with 36 keys across three tiers, an Apply you have to
  // go looking for is an Apply that gets forgotten.
  bar = settingsEditBar(edits, body);
  out.append(bar);

  body.replaceChildren(out);
}

// WHO DECIDES WHAT (v1.0.0 W16) — the contested families, resolved.
//
// THE PANEL DECIDES NOTHING HERE. `families` is the CLI's static registry (which
// ranks exist, in which order, and the question each family answers) and
// `families_resolved` is what those ranks actually did against the config on
// disk right now. Re-deriving a precedence in the browser is the exact drift
// this panel exists to make impossible — the Flow-stepper rule, applied to
// config.
//
// Only CONTESTED families are drawn. A family with one rank has no precedence
// to teach, and a card that lists thirty uncontested rows to show two
// interesting ones is a card nobody reads to the bottom of.
//
// Every state word is the CLI's own, from the closed set it publishes as
// `rank_states` — never a friendlier synonym (`resolved`, `not-read`, `inert`,
// `demoted`, `absent`, `partly-resolved`). A `why` is CLI prose and is never
// translated: it names keys, runs, profiles and commands by their real ids.
const RANK_STATE_KIND = {
  resolved: "ok",
  "partly-resolved": "ok",
  "not-read": null,
  inert: "warn",
  demoted: "warn",
  absent: null,
};

function ranksCard(families, resolved, states) {
  const c = card(t("settings.ranks.title"));
  c.id = "ranks-card";
  c.append(el("div", "note", t("settings.ranks.note")));

  const names = Object.keys(families || {}).filter((n) => (families[n] || {}).contested);
  if (!names.length) {
    c.append(el("div", "empty", t("settings.ranks.none")));
    return c;
  }

  for (const name of names) {
    const fam = families[name] || {};
    const res = (resolved || {})[name] || {};
    const block = el("div", "rank-family");

    const h = el("div", "rank-family-head");
    // The family id is a CLI id. The QUESTION beside it is the CLI's too —
    // it is the whole reason the grouping means anything.
    h.append(el("span", "rank-family-name", name));
    h.append(el("span", "rank-family-q", fam.question || ""));
    block.append(h);

    // WHAT ANSWERED, stated before the ladder rather than left to be inferred
    // from which row happens to be green. `resolved_by` is null on a terminal
    // rank, which is not a gap: it means nothing above the floor resolved.
    if (res.resolved_at) {
      const by = el("div", "rank-answer");
      by.append(
        document.createTextNode(
          res.resolved_by
            ? t("settings.ranks.answeredBy", { prio: res.resolved_at, key: res.resolved_by })
            : t("settings.ranks.answeredByDefault", { prio: res.resolved_at })
        )
      );
      block.append(by);
    }

    for (const r of res.ranks || fam.ranks || []) {
      const row = el("div", "rank-row" + (r.state === "resolved" ? " is-resolved" : ""));
      row.append(el("span", "rank-prio", r.prio));
      // A rank is either a KEY or the family's terminal floor. The floor has no
      // key on purpose — it is "the thing that happens when nobody chose" — and
      // rendering it as a key would invite somebody to look for it in the file.
      row.append(el("span", "rank-key" + (r.key ? "" : " is-terminal"), r.key || r.terminal || ""));
      const st = r.state || "absent";
      // An unknown state is RENDERED, not swallowed: the CLI owns this set, and
      // a panel that silently drops a word it does not recognise is a panel that
      // hides the next state somebody adds.
      row.append(chip(st, RANK_STATE_KIND[st] === undefined ? null : RANK_STATE_KIND[st]));
      if (r.why) row.append(el("div", "rank-why", r.why));
      block.append(row);
    }
    c.append(block);
  }

  // The closed set, once, at the bottom. It is what makes an unfamiliar chip
  // above readable without leaving the page.
  if ((states || []).length) {
    const legend = el("div", "rank-legend");
    legend.append(el("span", "rank-legend-label", t("settings.ranks.legend")));
    for (const s of states) legend.append(chip(s, RANK_STATE_KIND[s] === undefined ? null : RANK_STATE_KIND[s]));
    c.append(legend);
  }
  return c;
}

function ladderCard(table) {
  const c = card(t("settings.ladder.title"));
  c.id = "ladder-card"; // the FLIP morph finds it by id, never by a :has() query
  // `base` is the CLAUDE table that resolves. Since v0.50.0 `active` can be a
  // COMPOSITE (`extra+opus5_only`) because an `orc extra` route row overlays
  // the bands it covers — so branching on `active` here would fall through to
  // the default arm and draw the WRONG ladder the moment Extra is armed. The
  // overlay itself is the Extra panel's rail; this card stays the Claude
  // ladder, which is exactly what it has always been.
  const active = table.base || table.active;
  c.append(
    el(
      "div",
      "note",
      active === "opus5_only"
        ? t("settings.ladder.opus5")
        : active === "rubric_bands_override"
        ? t("settings.ladder.override")
        : t("settings.ladder.default")
    )
  );
  const ladder = el("div", "ladder");
  ladder.id = "ladder";
  const rows = active === "opus5_only" ? table.opus5_only : table.default;
  for (const r of rows) {
    const rung = el("div", "rung");
    rung.dataset.agent = r.agent;
    rung.append(el("span", "rung-band", `[${r.from},${r.to}${r.inclusive_to ? "]" : ")"}`));
    const right = el("div");
    const bar = el("div", "rung-bar");
    bar.style.width = Math.max(6, ((r.to - r.from) / 100) * 100) + "%";
    right.append(bar, el("div", "rung-agent", r.agent));
    rung.append(right);
    ladder.append(rung);
  }
  c.append(ladder);
  c.append(el("div", "ladder-note", t("settings.ladder.note")));
  return c;
}

// FLIP: measure the old rungs, swap in the new table, then animate each rung
// from where it used to be. The morph is what makes the precedence rule land.
function morphLadder(oldCard, newCard) {
  const before = new Map();
  for (const r of oldCard.querySelectorAll(".rung")) before.set(r.dataset.agent, r.getBoundingClientRect());
  oldCard.replaceWith(newCard);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const r of newCard.querySelectorAll(".rung")) {
    const from = before.get(r.dataset.agent);
    if (!from) {
      r.animate([{ opacity: 0, transform: "scaleY(.4)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.7,.3,1)" });
      continue;
    }
    const to = r.getBoundingClientRect();
    const dy = from.top - to.top;
    if (!dy) continue;
    r.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.7,.3,1)" });
  }
}

function settingRow(k, panelBody, edits) {
  const row = el("div", "setting" + (k.is_shadowed ? " shadowed" : ""));
  row.dataset.key = k.key;
  // Read by the toolbar's "changed only" filter. It is on the row rather than
  // recomputed from the control, because the control's shape differs per kind.
  row.dataset.overridden = k.is_overridden ? "1" : "0";

  const left = el("div");
  const name = el("div", "setting-name");
  name.append(document.createTextNode(k.key));
  if (k.is_overridden) name.append(el("span", "dot"));
  if (k.is_shadowed) {
    const lock = el("span", "lock");
    lock.append(document.createTextNode("🔒 " + t("settings.shadowed")));
    name.append(lock);
  }
  left.append(name);
  // `k.desc` and `k.shadow_reason` are the CLI's registry text — never
  // translated. They name keys, values and precedence rules by their real ids.
  left.append(el("div", "setting-desc", k.desc));
  if (k.shadow_reason) left.append(el("div", "shadow-why", k.shadow_reason));
  // WHICH LANES READ THIS (v1.0.0 W16). `k.lanes[]` is the CLI's own
  // `CONFIG_META[].lanes[]` — the same list `orc lane config` filters on, and
  // the same list a two-way lint already refuses to let drift. It answers the
  // question a settings screen otherwise leaves you guessing at: I changed
  // this, so what did I just change? A lane name is a CLI id and is never
  // translated.
  //
  // AN EMPTY LIST IS AN ANSWER AND KEEPS ITS ROW. Ten keys are permanently
  // empty and the lint has an allowlist naming every one of them: they are
  // OPERATING keys of the `orc extra` bridge — a lane calls `orc extra
  // dispatch` and the CLI reads `extra_timeout_s`, so no lane ever names it.
  // Skipping the line would make "no lane reads this" look identical to "we
  // did not render it", which is the distinction this whole row exists to
  // draw.
  {
    const lanes = el("div", "setting-lanes");
    lanes.append(el("span", "setting-lanes-label", t("settings.lanes.label")));
    if ((k.lanes || []).length) for (const lane of k.lanes) lanes.append(chip(lane, "lane"));
    else lanes.append(el("span", "setting-lanes-none", t("settings.lanes.none")));
    left.append(lanes);
  }

  const right = el("div", "setting-control");
  right.append(controlFor(k, edits));
  if (k.is_overridden) {
    const reset = el("button", "btn btn-ghost btn-sm", t("setting.resetTo", { value: String(k.default) }));
    reset.type = "button";
    reset.addEventListener("click", () => edits.reset(k.key));
    right.append(reset);
  }

  row.append(left, right);
  return row;
}

// The control follows the VALIDATOR, not a hand-kept table: enum → segmented,
// int/range → stepper with the options list as presets, path/repo/model → a
// text input whose validation is the CLI's own exit code.
//
// Since v0.44.1 a control STAGES its value instead of writing it. Each one also
// repaints its own selected state from the staged value, because nothing
// re-renders until Apply — a segmented control that does not follow your click
// would look broken, and a click that neither writes nor moves is worse than no
// control at all.
function controlFor(k, edits) {
  const c = k.control || { kind: "text" };
  const original = String(k.value);
  const stage = (value) => edits.set(k.key, String(value), original);

  if (c.kind === "enum") {
    const choices = c.choices || k.options || [];
    const seg = el("div", "seg");
    const paint = (v) => {
      for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.value === String(v)));
    };
    for (const opt of choices) {
      const b = el("button", null, String(opt));
      b.type = "button";
      b.dataset.value = String(opt);
      b.addEventListener("click", () => {
        stage(String(opt));
        paint(String(opt));
      });
      seg.append(b);
    }
    paint(original);
    return seg;
  }

  if (c.kind === "int" || c.kind === "range") {
    const wrap = el("div", "stepper");
    const input = el("input");
    input.type = "number";
    input.value = original;
    if (c.min !== null && c.min !== undefined) input.min = String(c.min);
    if (c.max !== null && c.max !== undefined) input.max = String(c.max);
    // No `set` button here any more: the edit bar's Apply is the one commit
    // point, so a second button beside every number would be two ideas of what
    // "save" means.
    input.addEventListener("input", () => stage(input.value));
    wrap.append(input);
    const presets = (k.options || []).filter((o) => String(o) !== original);
    if (presets.length) {
      const seg = el("div", "seg");
      for (const p of presets.slice(0, 5)) {
        const b = el("button", null, String(p));
        b.type = "button";
        b.addEventListener("click", () => {
          input.value = String(p);
          stage(String(p));
        });
        seg.append(b);
      }
      const box = el("div");
      box.append(wrap, seg);
      box.className = "setting-control";
      return box;
    }
    return wrap;
  }

  if (c.kind === "subset") {
    const chosen = new Set(
      original
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const seg = el("div", "seg");
    for (const opt of c.choices || []) {
      const b = el("button", null, String(opt));
      b.type = "button";
      b.setAttribute("aria-pressed", String(chosen.has(opt)));
      b.addEventListener("click", () => {
        chosen.has(opt) ? chosen.delete(opt) : chosen.add(opt);
        b.setAttribute("aria-pressed", String(chosen.has(opt)));
        stage([...chosen].join(",") || "");
      });
      seg.append(b);
    }
    return seg;
  }

  // path / repo / free text — validation comes from the CLI's exit code, which
  // means the rules can never drift from the ones a terminal user gets.
  const wrap = el("div");
  wrap.className = "setting-control";
  const input = el("input", "text-input");
  input.value = original;
  input.addEventListener("input", () => stage(input.value));
  wrap.append(input);
  return wrap;
}

// The Settings edit bar. Reset is `orc config reset` with NO key — the CLI's
// own "put every key back to its default", not a loop of per-key writes. It is
// a real write, so it is confirmed and it discards anything staged first: a
// reset that silently kept four pending edits queued behind it would apply them
// straight back over the defaults.
function settingsEditBar(edits, panelBody) {
  const bar = editBar(edits, {
    resetLabel: t("edits.resetAll"),
    onApply: async (btn) => {
      await applyEdits(edits, { set: "/api/config/set", reset: "/api/config/reset" }, btn);
      await rerenderSettings(panelBody);
    },
    onReset: () => {
      modal({
        title: t("edits.resetAllTitle"),
        body: (() => {
          const box = el("div", "stack stack-sm");
          box.append(el("div", null, t("edits.resetAllBody")));
          box.append(el("div", "action-cmd", "orc config reset"));
          return box;
        })(),
        actions: [
          { label: t("common.cancel"), onClick: (c) => c() },
          {
            label: t("edits.resetAllApply"),
            cls: "btn-danger",
            onClick: async (close) => {
              close();
              edits.clear();
              const r = await post("/api/config/reset", {});
              toast(r.command, r.ok ? "ok" : "bad", r.output);
              await rerenderSettings(panelBody);
            },
          },
        ],
      });
    },
    onCancel: () => rerenderSettings(panelBody),
  });
  return bar;
}

// A re-render must not lose the ladder morph, so the ladder is swapped through
// FLIP while everything else is replaced outright.
async function rerenderSettings(panelBody) {
  const old = panelBody.querySelector("#ladder-card");
  const snapshot = old ? old.cloneNode(true) : null;
  await renderSettings(panelBody);
  const fresh = panelBody.querySelector("#ladder-card");
  // Only morph when the table ACTUALLY changed — i.e. opus5_only was flipped.
  // Any other setting re-renders without a distracting animation.
  if (snapshot && fresh && snapshot.textContent !== fresh.textContent) {
    // Put the old one back for a beat so FLIP has real geometry to measure.
    fresh.parentNode.replaceChild(snapshot, fresh);
    morphLadder(snapshot, fresh);
  }
}

async function showProfiles() {
  const d = (await read("/api/config/profiles")).data;
  const body = el("div", "stack stack-sm");
  body.append(el("div", "note", t("profiles.note")));
  for (const p of d.profiles) {
    const c = el("div", "action");
    const left = el("div");
    // Profile name and description come from the CLI's registry — untranslated.
    left.append(el("div", "setting-name", p.name));
    left.append(el("div", "setting-desc", p.desc));
    if (p.changes.length) {
      const list = el("div", "note");
      list.textContent = t("profiles.wouldChange", {
        list: p.changes.map((c2) => `${c2.key} ${c2.from} → ${c2.to}`).join(", "),
      });
      left.append(list);
    } else left.append(el("div", "note", t("profiles.noChange")));
    const apply = el("button", "btn btn-sm btn-allow-busy" + (p.changes.length ? " btn-primary" : ""), t("profiles.apply"));
    apply.type = "button";
    apply.disabled = !p.changes.length;
    apply.addEventListener("click", async () => {
      const r = await post("/api/config/profile", { name: p.name });
      toast(r.command, r.ok ? "ok" : "bad", r.output);
      close();
      route();
    });
    c.append(left, apply);
    body.append(c);
  }
  const close = modal({ title: t("profiles.title"), body, actions: [{ label: t("common.close"), onClick: (c) => c() }] });
}

async function showRecommend() {
  const d = (await read("/api/config/recommend")).data;
  const body = el("div", "stack stack-sm");
  body.append(el("div", "note", t("recommend.note")));
  const list = el("ul");
  for (const r of d.reasons) {
    const li = el("li", "note", "• " + r);
    list.append(li);
  }
  body.append(list);
  const pick = el("div", "action");
  const left = el("div");
  left.append(el("div", "setting-name", d.recommended));
  left.append(el("div", "setting-desc", d.desc));
  const apply = el("button", "btn btn-sm btn-primary btn-allow-busy", t("recommend.applyIt", { name: d.recommended }));
  apply.type = "button";
  apply.addEventListener("click", async () => {
    const r = await post("/api/config/profile", { name: d.recommended });
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    close();
    route();
  });
  pick.append(left, apply);
  body.append(pick);
  const close = modal({ title: t("recommend.title"), body, actions: [{ label: t("common.close"), onClick: (c) => c() }] });
}

/* ==================================================================== RUNS == */

/* THE LIST IS THE DETAIL VIEW (v0.43.6).
   This panel used to be a list with a detail CARD underneath it: clicking the
   fourth run rendered its checkpoint below run forty. On a repo with any
   history that means scrolling past the entire list to read what you just
   clicked, and then scrolling back up to click the next one — the list grows,
   so the problem grows with it, which is the shape of a design that does not
   survive its own success.

   Now every row EXPANDS IN PLACE. The detail is a child of the row, animated
   open with the same `grid-template-rows: 0fr -> 1fr` fold the settings tiers
   use, so what you clicked stays exactly where your eye already is. One row is
   open at a time — an accordion, not a set of toggles — because two open runs
   re-create the scrolling problem in miniature. Detail is fetched on FIRST open
   and then kept, so re-opening a row is instant and costs nothing. */
