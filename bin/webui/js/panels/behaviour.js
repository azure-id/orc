"use strict";
/* panels/behaviour.js — orc ui client
   Behaviour (v2.0.0 W7): what the lanes learned about how YOU work, from your
   own answers, in this project only. Five tabs — Habits, Rhythm, Gotchas,
   Review quality, Answer log — above them a portrait and four tiles.

   THE RULE OF THIS PANEL: it renders the CLI's lines and derives no habit.
   Every sentence (`portrait[].line`, `rows[].line`, `effect`, `rule`), every
   share, streak, state word, class word, `by=` value, band and command arrives
   from `orc habit show|log --json` and `orc gotcha list|card|quality --json`.
   The panel translates only its OWN prose (DE-19). It never branches on a
   state word: the actions come from `commands{}`, the colours from a
   `data-state` / `data-by` / `data-source` attribute that
   css/panels/behaviour.css maps to a token. A `never` habit has NO button —
   only the command a person types.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

const BH_TABS = ["habits", "rhythm", "gotchas", "quality", "log"];
const BH_WINDOWS = ["30d", "90d", "all"];
const BH_SVG = "http://www.w3.org/2000/svg";
let bhTab = "habits";
let bhWindow = "90d";
// Set after the first paint. A repaint after a write adds `bh-quiet`, so no
// entrance plays twice — the v1.4.2 `hk-quiet` rule.
let bhPainted = false;

// Panel prose for the words the CLI publishes. Looked up BY the CLI's word; a
// word this table does not know renders bare, never invented.
const BH_STATE_HELP = () => ({
  observed: t("behaviour.state.observed"),
  proposed: t("behaviour.state.proposed"),
  applied: t("behaviour.state.applied"),
  declined: t("behaviour.state.declined"),
  "never-ask": t("behaviour.state.neverAsk"),
  stale: t("behaviour.state.stale"),
  shadowed: t("behaviour.state.shadowed"),
  never: t("behaviour.state.never"),
});
const BH_CLASS_HELP = () => ({
  apply: t("behaviour.class.apply"),
  suggest: t("behaviour.class.suggest"),
  never: t("behaviour.class.never"),
});
const BH_BY_HELP = () => ({
  user: t("behaviour.by.user"),
  ledger: t("behaviour.by.ledger"),
  learned: t("behaviour.by.learned"),
  config: t("behaviour.by.config"),
  default: t("behaviour.by.default"),
});
const BH_MODE_HELP = () => ({
  off: t("behaviour.mode.off"),
  observe: t("behaviour.mode.observe"),
  propose: t("behaviour.mode.propose"),
});
const BH_TAB_LABEL = () => ({
  habits: t("behaviour.tab.habits"),
  rhythm: t("behaviour.tab.rhythm"),
  gotchas: t("behaviour.tab.gotchas"),
  quality: t("behaviour.tab.quality"),
  log: t("behaviour.tab.log"),
});

PANELS.behaviour = function (host) {
  bhPainted = false;
  const right = el("div", "bh-headright");
  head(host, t("behaviour.title"), t("behaviour.sub"), right);
  const live = el("div", "bh-sr");
  live.id = "bh-live";
  live.setAttribute("aria-live", "polite");
  host.append(live);
  const body = el("div", "stack");
  host.append(body);
  bhLoad(body, right);
};

// The window switch and the learning switch live in the page head. The window
// is a READ; the learning switch is a WRITE, through the one confirmation.
async function bhLoad(body, right, focusId) {
  if (!bhPainted) body.replaceChildren(skeleton(5));
  let hab;
  try {
    hab = await read("/api/habits?window=" + encodeURIComponent(bhWindow));
  } catch (e) {
    body.replaceChildren(failBox(e));
    return;
  }
  const d = hab.data || {};
  right.replaceChildren(bhModeSwitch(d, body, right));
  // `habits: off` (exit 3) — ONE card instead of the tabs.
  if (d.ok === false && Array.isArray(d.on)) {
    body.classList.toggle("bh-quiet", bhPainted);
    body.replaceChildren(bhOffCard(d), bhFooter(null, true));
    bhPainted = true;
    return;
  }
  right.append(bhWindowSwitch(body, right));
  const [log, states, gotchas, quality, cands] = await Promise.all([
    read("/api/habits/log").catch(() => ({ data: null })),
    read("/api/habits/states").catch(() => ({ data: null })),
    read("/api/gotchas").catch(() => ({ data: null })),
    read("/api/gotcha/quality?window=" + encodeURIComponent(bhWindow)).catch(() => ({ data: null })),
    read("/api/gotcha/candidates").catch(() => ({ data: null })),
  ]);
  const ctx = { d, log: log.data, states: states.data, gotchas: gotchas.data, quality: quality.data, cands: cands.data, body, right };
  body.classList.toggle("bh-quiet", bhPainted);
  const out = frag();
  out.append(bhHero(d));
  const tabs = bhTabs(ctx);
  out.append(tabs.bar);
  out.append(tabs.panel);
  out.append(bhFooter(d, false));
  body.replaceChildren(out);
  tabs.fill();
  bhPainted = true;
  bhRailDot(d);
  if (focusId) {
    const card = body.querySelector('[data-habit="' + focusId + '"]');
    if (card) card.focus();
  }
}

function bhModeSwitch(d, body, right) {
  const seg = el("div", "bh-seg bh-seg-mode");
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", t("behaviour.learning"));
  seg.append(el("span", "bh-seg-label", t("behaviour.learning")));
  const help = BH_MODE_HELP();
  for (const m of d.modes || []) {
    const b = el("button", null, m);
    b.type = "button";
    b.setAttribute("aria-pressed", String(m === d.mode));
    b.addEventListener("click", () => {
      if (m === d.mode) return;
      const cmd = "orc config set habits " + m;
      bhConfirm({
        title: t("behaviour.modeTitle", { mode: m }),
        what: help[m] || "",
        command: cmd,
        go: async () => {
          const r = await post("/api/config/set", { key: "habits", value: m });
          toast(r.ok ? t("behaviour.modeDone", { mode: m }) : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
          bhSay(t("behaviour.modeDone", { mode: m }));
          bhLoad(body, right);
        },
      });
    });
    seg.append(b);
  }
  return seg;
}

function bhWindowSwitch(body, right) {
  const seg = el("div", "bh-seg");
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", t("behaviour.window"));
  for (const w of BH_WINDOWS) {
    const b = el("button", null, w);
    b.type = "button";
    b.setAttribute("aria-pressed", String(w === bhWindow));
    b.addEventListener("click", () => {
      if (w === bhWindow) return;
      bhWindow = w;
      bhLoad(body, right);
    });
    seg.append(b);
  }
  return seg;
}

// ── the off card ────────────────────────────────────────────────────────────
function bhOffCard(d) {
  const c = el("section", "bh-hero bh-off");
  c.append(el("div", "bh-eyebrow", t("behaviour.off.eyebrow")));
  c.append(el("h2", "bh-off-title", t("behaviour.off.title")));
  const ul = el("ul", "bh-off-list");
  const help = BH_MODE_HELP();
  for (const m of d.modes || []) {
    const li = el("li");
    li.append(el("span", "mono", m + " "), document.createTextNode(help[m] || ""));
    ul.append(li);
  }
  if (d.kept) ul.append(el("li", null, t("behaviour.off.kept", { n: d.kept })));
  c.append(ul);
  c.append(el("div", "note", t("behaviour.off.how")));
  for (const cmd of d.on || []) c.append(bhCmd(cmd));
  return c;
}

// ── the hero: portrait + four tiles ─────────────────────────────────────────
function bhHero(d) {
  const h = el("section", "bh-hero");
  h.append(bhOrbit());
  const eb = el("div", "bh-eyebrow");
  eb.append(document.createTextNode(t("behaviour.portrait", { window: d.window || bhWindow })));
  const mc = chip("habits: " + d.mode);
  mc.dataset.mode = d.mode;
  eb.append(mc);
  h.append(eb);
  if (!d.proposal && !(d.counts || {}).proposed && (d.rows || []).length) h.append(el("div", "note", t("behaviour.noProposal")));
  const ul = el("ul", "bh-portrait");
  (d.portrait || []).forEach((p, i) => {
    const li = el("li");
    li.style.animationDelay = 120 + i * 110 + "ms";
    li.append(el("span", "bh-k mono", p.k), el("span", null, p.line));
    ul.append(li);
  });
  if (!(d.portrait || []).length) h.append(empty(t("behaviour.emptyTitle"), t("behaviour.emptyHint")));
  else h.append(ul);
  const T = d.tiles || {};
  const tiles = el("div", "bh-tiles");
  tiles.append(
    bhTile(t("behaviour.tile.runs"), T.runs, null, t("behaviour.tile.runsNote", { n: d.traces || 0 })),
    bhTile(t("behaviour.tile.answers"), T.answers, null, t("behaviour.tile.answersNote")),
    bhTile(t("behaviour.tile.saved"), T.saved, T.saved_prev, t("behaviour.tile.savedNote")),
    bhTile(t("behaviour.tile.qpr"), T.qpr, T.qpr_prev, t("behaviour.tile.qprNote"))
  );
  h.append(tiles);
  return h;
}

// The orbit turns ONCE, slowly, and rests (WCAG 2.2.2). Reduced motion
// removes the satellites in 04-motion.css.
function bhOrbit() {
  const s = bhSv("svg", { class: "bh-orbit", viewBox: "0 0 260 260", "aria-hidden": "true" });
  for (const r of [50, 85, 120]) s.append(bhSv("circle", { cx: 130, cy: 130, r }));
  s.append(bhSv("circle", { class: "sat", cx: 130, cy: 45, r: 4 }));
  s.append(bhSv("circle", { class: "sat sat-b", cx: 215, cy: 130, r: 3 }));
  return s;
}

function bhTile(label, value, prev, note) {
  const tile = el("div", "bh-tile");
  tile.append(el("div", "bh-tile-l", label));
  const v = el("div", "bh-tile-v");
  const num = el("span", null, "—");
  v.append(num);
  if (prev !== null && prev !== undefined && value !== null && value !== undefined)
    v.append(el("small", null, t("behaviour.tile.prev", { n: prev })));
  tile.append(v);
  if (note) tile.append(el("div", "bh-tile-n", note));
  bhCount(num, value);
  return tile;
}

// Numbers count up, finitely, and REST on the CLI's own value. Reduced motion
// and a repaint skip the count and write the value at once.
function bhCount(node, to) {
  if (to === null || to === undefined) return;
  const final = String(to);
  if (bhPainted || bhStill() || typeof to !== "number") {
    node.textContent = final;
    return;
  }
  const dec = Number.isInteger(to) ? 0 : 1;
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / 900);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = k < 1 ? (to * e).toFixed(dec) : final;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function bhStill() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── the tabs ────────────────────────────────────────────────────────────────
function bhTabs(ctx) {
  const d = ctx.d;
  const bar = el("div", "bh-tabs");
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", t("behaviour.tabsLabel"));
  const ink = el("span", "bh-tab-ink");
  const panel = el("div", "stack bh-tabpanel");
  panel.setAttribute("role", "tabpanel");
  const label = BH_TAB_LABEL();
  const g = (ctx.gotchas && ctx.gotchas.panel) || null;
  const counts = {
    habits: (d.rows || []).length,
    gotchas: g ? g.rows.length : null,
    log: ctx.log && ctx.log.events ? ctx.log.events.length : null,
  };
  const btns = [];
  for (const id of BH_TABS) {
    const b = el("button", "bh-tab");
    b.type = "button";
    b.id = "bh-tab-" + id;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", "bh-tabpanel");
    b.append(document.createTextNode(label[id]));
    if (counts[id] !== null && counts[id] !== undefined) {
      const n = el("span", "bh-count", String(counts[id]));
      if (id === "habits" && (d.counts || {}).proposed > 0) n.classList.add("hot");
      b.append(n);
    }
    b.addEventListener("click", () => select(id, false));
    b.addEventListener("keydown", (e) => {
      const i = BH_TABS.indexOf(id);
      const to =
        e.key === "ArrowRight" ? BH_TABS[(i + 1) % BH_TABS.length]
        : e.key === "ArrowLeft" ? BH_TABS[(i - 1 + BH_TABS.length) % BH_TABS.length]
        : e.key === "Home" ? BH_TABS[0]
        : e.key === "End" ? BH_TABS[BH_TABS.length - 1]
        : null;
      if (!to) return;
      e.preventDefault();
      select(to, true);
    });
    btns.push(b);
    bar.append(b);
  }
  bar.append(ink);
  panel.id = "bh-tabpanel";
  function moveInk() {
    const a = bar.querySelector('[aria-selected="true"]');
    if (!a) return;
    ink.style.left = a.offsetLeft + "px";
    ink.style.width = a.offsetWidth + "px";
  }
  function select(id, focus) {
    bhTab = id;
    for (const b of btns) {
      const on = b.id === "bh-tab-" + id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    panel.setAttribute("aria-labelledby", "bh-tab-" + id);
    panel.replaceChildren();
    ({ habits: bhHabits, rhythm: bhRhythm, gotchas: bhGotchas, quality: bhQuality, log: bhLog })[id](panel, ctx);
    requestAnimationFrame(moveInk);
  }
  return { bar, panel, fill: () => select(BH_TABS.includes(bhTab) ? bhTab : "habits", false) };
}

// ── Habits ──────────────────────────────────────────────────────────────────
function bhHabits(slot, ctx) {
  const d = ctx.d;
  const rows = d.rows || [];
  if ((d.next_run || []).length) {
    const nr = card(t("behaviour.nextRun"), el("span", "note", t("behaviour.nextRunNote")));
    const list = el("ul", "bh-next");
    for (const n of d.next_run) {
      const li = el("li");
      li.append(el("span", "bh-lane mono", n.lane), el("span", null, n.line));
      list.append(li);
    }
    nr.append(list);
    slot.append(nr);
  }

  const legend = card(t("behaviour.legendTitle"));
  const lg = el("div", "bh-legend");
  const sh = BH_STATE_HELP();
  for (const s of d.state_words || []) {
    const w = el("span", "note");
    w.append(bhStateChip(s), document.createTextNode(" " + (sh[s] || "")));
    lg.append(w);
  }
  legend.append(lg);
  const cl = el("div", "bh-legend");
  const ch = BH_CLASS_HELP();
  for (const c of d.classes || []) {
    const w = el("span", "note");
    const tag = el("span", "bh-cls", c);
    tag.dataset.cls = c;
    w.append(tag, document.createTextNode(" " + (ch[c] || "")));
    cl.append(w);
  }
  legend.append(cl);
  slot.append(legend);

  if (!rows.length) {
    const e = card(null);
    e.append(empty(t("behaviour.emptyTitle"), t("behaviour.emptyHint")));
    slot.append(e);
  } else {
    // The CLI sends the rows in the order that needs you first; the panel does
    // not sort them.
    const grid = el("div", "bh-habits");
    rows.forEach((r, i) => {
      const c = bhHabitCard(r, ctx);
      c.style.animationDelay = Math.min(i, 12) * 55 + "ms";
      grid.append(c);
    });
    slot.append(grid);
  }

  if (ctx.states && (ctx.states.history || []).length) {
    const list = el("div", "bh-history");
    for (const h of ctx.states.history) {
      const row = el("div", "bh-hist-row");
      row.append(el("span", "mono bh-faint", new Date(h.at).toLocaleString()), el("span", "mono", h.id), el("span", null, `${h.from} → ${h.to}`));
      const by = chip(h.by);
      by.dataset.by = h.by;
      row.append(by);
      if (h.inverse) row.append(bhCmd(h.inverse));
      list.append(row);
    }
    slot.append(collapsible({ title: t("behaviour.history"), count: String(ctx.states.history.length), collapsed: true, desc: t("behaviour.historyNote"), content: list }));
  }
}

function bhStateChip(s) {
  const c = chip(s);
  c.dataset.state = s;
  return c;
}

function bhHabitCard(r, ctx) {
  const c = el("article", "bh-habit");
  c.dataset.state = r.state;
  c.dataset.habit = r.id;
  c.tabIndex = -1;
  const top = el("div", "bh-habit-top");
  for (const l of r.lanes || []) top.append(el("span", "bh-lane mono", l));
  top.append(el("span", "bh-qid mono", r.qid));
  const cls = el("span", "bh-cls", r.effective_class);
  cls.dataset.cls = r.effective_class;
  top.append(cls, bhStateChip(r.state));
  c.append(top);

  const bodyRow = el("div", "bh-habit-body");
  bodyRow.append(bhRing(r.share, r.state));
  const txt = el("div");
  txt.append(el("h3", null, r.title));
  if (r.line) txt.append(el("div", "bh-line", r.line));
  bodyRow.append(txt);
  c.append(bodyRow);

  const opts = r.options || [];
  const total = opts.reduce((s, o) => s + o.n, 0);
  if (total) {
    const dist = el("div", "bh-dist");
    dist.setAttribute("role", "img");
    dist.setAttribute("aria-label", opts.map((o) => `${o.label} ${o.n}`).join(", "));
    const leg = el("div", "bh-dist-legend");
    opts.forEach((o, i) => {
      if (o.n) {
        const s = el("span", "bh-grow-x" + (i === 0 ? " is-top" : ""));
        s.style.flex = String(o.n);
        s.style.animationDelay = 250 + i * 120 + "ms";
        dist.append(s);
      }
      const l = el("span");
      l.append(el("i", i === 0 ? "is-top" : null), document.createTextNode(o.label + " "), el("span", "mono", String(o.n)));
      leg.append(l);
    });
    c.append(dist, leg);
  }

  const meta = el("div", "bh-habit-meta");
  if (r.rule) meta.append(bhMeta(t("behaviour.field.rule"), r.rule));
  meta.append(bhMeta(t("behaviour.field.context"), r.context || t("behaviour.anyContext")));
  if ((r.streak || []).length) meta.append(bhStreak(r.streak));
  c.append(meta);
  if (r.why) c.append(el("div", "note", r.why));
  if (r.effect) c.append(el("div", "bh-why", r.effect));
  c.append(bhActions(r, ctx));
  return c;
}

function bhMeta(label, value) {
  const s = el("span");
  s.append(document.createTextNode(label + " "), el("b", null, value));
  return s;
}

// The 10-answer streak uses SHAPES, never colour alone (WCAG 1.4.1):
// ● the top choice · ○ another choice · ◐ Enter on a pre-selected option.
function bhStreak(streak) {
  const st = el("span", "bh-streak");
  const top = streak.filter((x) => x === 1).length;
  const pre = streak.filter((x) => x > 0 && x < 1).length;
  st.setAttribute("role", "img");
  st.setAttribute("aria-label", t("behaviour.streakLabel", { n: streak.length, top, pre }));
  for (const x of streak) st.append(el("i", x ? "on" : null, x === 1 ? "●" : x > 0 ? "◐" : "○"));
  return st;
}

function bhRing(share, state) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const pct = Math.round((share || 0) * 100);
  const s = bhSv("svg", { class: "bh-ring", viewBox: "0 0 64 64", role: "img", "aria-label": t("behaviour.ringLabel", { pct }) });
  s.dataset.state = state;
  s.append(bhSv("circle", { class: "bg", cx: 32, cy: 32, r: R }));
  const fg = bhSv("circle", { class: "fg", cx: 32, cy: 32, r: R, "stroke-dasharray": C, "stroke-dashoffset": bhPainted ? C * (1 - (share || 0)) : C });
  s.append(fg);
  const tx = bhSv("text", { x: 32, y: 30 });
  tx.textContent = pct + "%";
  const t2 = bhSv("text", { x: 32, y: 44, class: "s" });
  t2.textContent = t("behaviour.ringTop");
  s.append(tx, t2);
  // A transition in 04-motion.css, so the reduced-motion cap makes it instant.
  requestAnimationFrame(() => requestAnimationFrame(() => fg.setAttribute("stroke-dashoffset", String(C * (1 - (share || 0))))));
  return s;
}

// The actions come from `commands{}` — the CLI decides which exist. The
// `manual` command (a `never` habit) gets NO button, on purpose: a safety
// check is switched off by a person typing it.
function bhActions(r, ctx) {
  const cm = r.commands || {};
  const wrap = el("div", "bh-actions-wrap");
  const act = el("div", "row-actions");
  const B = (labelText, cls, route, body, command, title, what) => {
    const b = el("button", "btn btn-sm " + cls, labelText);
    b.type = "button";
    b.addEventListener("click", () =>
      bhConfirm({ title, what, command, go: () => bhWrite(route, body, r.id, ctx, t("behaviour.done", { id: r.id, command })) })
    );
    return b;
  };
  if (cm.accept) {
    act.append(
      B(t("behaviour.act.accept"), "btn-primary", "/api/habit/accept", { id: r.id }, cm.accept, t("behaviour.act.acceptTitle", { id: r.id }), t("behaviour.act.acceptWhat")),
      B(t("behaviour.act.decline"), "btn-ghost", "/api/habit/decline", { id: r.id }, cm.decline, t("behaviour.act.declineTitle"), t("behaviour.act.declineWhat")),
      B(t("behaviour.act.never"), "btn-ghost", "/api/habit/decline", { id: r.id, never: true }, cm.never, t("behaviour.act.neverTitle"), t("behaviour.act.neverWhat"))
    );
    wrap.append(act, bhCmd(cm.accept));
  } else if (cm.forget) {
    act.append(B(t("behaviour.act.forget"), "", "/api/habit/forget", { id: r.id }, cm.forget, t("behaviour.act.forgetTitle", { id: r.id }), t("behaviour.act.forgetWhat")));
    wrap.append(act, bhCmd(cm.forget));
  } else if (cm.reset) {
    act.append(B(t("behaviour.act.reset"), "", "/api/habit/reset", { id: r.id }, cm.reset, t("behaviour.act.resetTitle"), t("behaviour.act.resetWhat")));
    wrap.append(act, bhCmd(cm.reset));
  } else if (cm.manual) {
    wrap.append(el("div", "note", t("behaviour.act.manual")), bhCmd(cm.manual));
  }
  return wrap;
}

// THE ONE CONFIRMATION every write goes through: it names the command, says
// what changes, and has Cancel / Run it. `modal()` traps nothing it does not
// own, closes on Escape, and `closeModal` is its single exit.
function bhConfirm({ title, what, command, go }) {
  const b = frag();
  if (what) b.append(el("p", null, what));
  b.append(el("div", "note", t("behaviour.confirmNote")));
  b.append(el("pre", "cmd", command));
  const opener = document.activeElement;
  modal({
    title,
    body: b,
    actions: [
      { label: t("common.cancel"), cls: "btn-ghost", onClick: (close) => { close(); if (opener && opener.focus) opener.focus(); } },
      { label: t("behaviour.runIt"), cls: "btn-primary", onClick: (close) => { close(); go(); } },
    ],
  });
}

// A write re-fetches `/api/habits` and repaints QUIETLY: nothing arrives again,
// and focus moves to the card that changed. The undo is on that card, never
// in a toast that disappears (WCAG 2.2.1).
async function bhWrite(route, body, id, ctx, said) {
  let r;
  try {
    r = await post(route, body);
  } catch (e) {
    toast(t("common.writeFail"), "bad", String(e.message || e));
    return;
  }
  toast(r.ok ? said : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
  if (r.ok) bhSay(said + " " + t("behaviour.undoWhere"));
  bhLoad(ctx.body, ctx.right, id);
}

function bhSay(text) {
  const live = $("#bh-live");
  if (live) live.textContent = text;
}

// ── Rhythm ──────────────────────────────────────────────────────────────────
function bhRhythm(slot, ctx) {
  const rh = ctx.d.rhythm || {};
  const g = el("div", "grid grid-2");

  const hc = card(t("behaviour.rhythm.when"), el("span", "note", t("behaviour.rhythm.whenNote")));
  const heat = rh.heat || [];
  const flat = heat.flat();
  const max = Math.max(0, ...flat);
  const days = [t("behaviour.day.mon"), t("behaviour.day.tue"), t("behaviour.day.wed"), t("behaviour.day.thu"), t("behaviour.day.fri"), t("behaviour.day.sat"), t("behaviour.day.sun")];
  const grid = el("div", "bh-heat");
  grid.setAttribute("role", "img");
  grid.setAttribute("aria-label", t("behaviour.rhythm.heatLabel", { n: flat.reduce((a, b) => a + b, 0) }));
  grid.append(el("span"));
  for (let h = 0; h < 24; h++) grid.append(el("span", "h", h % 3 === 0 ? String(h).padStart(2, "0") : ""));
  heat.forEach((row, di) => {
    grid.append(el("span", "d", days[di] || ""));
    row.forEach((v, h) => {
      const cell = el("span", "c");
      cell.title = t("behaviour.rhythm.cell", { day: days[di] || "", hour: String(h).padStart(2, "0"), n: v });
      // k = the CLI's cell value over the max; the colour is a token mix.
      if (v && max) cell.style.background = `color-mix(in srgb, var(--accent) ${Math.round(18 + (82 * v) / max)}%, var(--surface-3))`;
      cell.style.animationDelay = Math.min(h * 18 + di * 26, 700) + "ms";
      grid.append(cell);
    });
  });
  hc.append(grid);
  g.append(hc);

  const lanes = rh.lanes || [];
  const tot = lanes.reduce((s, l) => s + l.n, 0);
  const mc = card(t("behaviour.rhythm.lanes"), el("span", "note", tn(tot, "behaviour.rhythm.runs")));
  if (tot) {
    const mix = el("div", "bh-mix");
    mix.setAttribute("role", "img");
    mix.setAttribute("aria-label", lanes.map((l) => `${l.lane} ${l.n}`).join(", "));
    const ml = el("div", "bh-mix-legend");
    lanes.forEach((l, i) => {
      const s = el("span", "bh-grow-x", l.n / tot > 0.09 ? Math.round((100 * l.n) / tot) + "%" : "");
      s.style.flex = String(l.n);
      s.style.background = `var(--s${(i % 7) + 1})`;
      s.style.animationDelay = i * 90 + "ms";
      mix.append(s);
      const row = el("div");
      const sw = el("i");
      sw.style.background = `var(--s${(i % 7) + 1})`;
      row.append(sw, el("span", "mono", l.lane), el("span", "mono bh-dim", String(l.n)));
      ml.append(row);
    });
    mc.append(mix, ml);
  } else mc.append(empty(t("behaviour.emptyTitle"), t("behaviour.emptyHint")));
  g.append(mc);
  slot.append(g);

  const g2 = el("div", "grid grid-2");
  const qpr = rh.qpr || [];
  const qc = card(t("behaviour.rhythm.qpr"));
  const known = qpr.filter((v) => v !== null && v !== undefined);
  if (known.length >= 2) {
    qc.append(bhLine(qpr, { kind: "accent", fmt: (v) => String(v), label: t("behaviour.rhythm.qprLabel", { from: known[0], to: known[known.length - 1], n: qpr.length }) }));
    qc.append(el("div", "note", t("behaviour.rhythm.qprNote")));
  } else qc.append(empty(t("behaviour.emptyTitle"), t("behaviour.emptyHint")));
  g2.append(qc);

  const wc = card(t("behaviour.rhythm.how"));
  const how = rh.how || [];
  const keys = rh.by || [];
  const colMax = Math.max(0, ...how.map((w) => keys.reduce((s, k) => s + (w[k] || 0), 0)));
  if (colMax) {
    const bars = el("div", "bh-how");
    bars.setAttribute("role", "img");
    bars.setAttribute("aria-label", t("behaviour.rhythm.howLabel", { n: how.length }));
    how.forEach((w, i) => {
      const col = el("div", "bh-how-col");
      col.title = keys.map((k) => `${k} ${w[k] || 0}`).join(" · ");
      keys.forEach((k, j) => {
        if (!w[k]) return;
        const s = el("span", "bh-grow-y");
        s.dataset.by = k;
        s.style.height = (100 * w[k]) / colMax + "%";
        s.style.animationDelay = i * 45 + j * 30 + "ms";
        col.append(s);
      });
      bars.append(col);
    });
    wc.append(bars);
    const lg = el("div", "bh-dist-legend");
    const bh = BH_BY_HELP();
    for (const k of keys) {
      const l = el("span");
      const sw = el("i");
      sw.dataset.by = k;
      l.append(sw, el("span", "mono", k), document.createTextNode(" — " + (bh[k] || "")));
      lg.append(l);
    }
    wc.append(lg);
  } else wc.append(empty(t("behaviour.emptyTitle"), t("behaviour.emptyHint")));
  g2.append(wc);
  slot.append(g2);
}

// A line chart that draws itself (stroke-dash, finite). The first and last
// values are labelled; a null week keeps its slot and draws no point.
function bhLine(vals, o) {
  const W = 520;
  const H = 150;
  const P = 26;
  const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] !== null && p[1] !== undefined);
  const ys = pts.map((p) => p[1]).concat(o.target !== undefined ? [o.target] : []);
  // The scale is drawing, not data: it frames the CLI's numbers with a margin.
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = (hi - lo) * 0.3 || hi * 0.2 || 1;
  const min = Math.max(0, lo - pad);
  const max = hi + pad;
  const x = (i) => P + ((W - 2 * P) * i) / Math.max(1, vals.length - 1);
  const y = (v) => H - P + 4 - ((H - 2 * P) * (v - min)) / (max - min || 1);
  const s = bhSv("svg", { class: "bh-chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.label });
  s.dataset.kind = o.kind;
  for (let k = 0; k <= 4; k++) {
    const yy = P - 4 + ((H - 2 * P) * k) / 4;
    s.append(bhSv("line", { class: "grid-l", x1: P, x2: W - P, y1: yy, y2: yy }));
  }
  const dPath = pts.map((p, i) => (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1)).join(" ");
  const ln = bhSv("path", { class: "ln" + (bhPainted ? "" : " bh-draw"), d: dPath });
  s.append(ln);
  requestAnimationFrame(() => {
    try {
      ln.style.setProperty("--len", String(ln.getTotalLength()));
    } catch (_) {}
  });
  [pts[0], pts[pts.length - 1]].forEach((p, i) => {
    s.append(bhSv("circle", { class: "pt bh-fade-late", cx: x(p[0]), cy: y(p[1]), r: 4 }));
    const tx = bhSv("text", { class: "bh-fade-late", x: x(p[0]) + (i ? -6 : 6), y: y(p[1]) - 9, "text-anchor": i ? "end" : "start" });
    tx.textContent = o.fmt(p[1]);
    s.append(tx);
  });
  if (o.target !== undefined && o.target !== null) {
    const ty = y(o.target);
    s.append(bhSv("line", { class: "target", x1: P, x2: W - P, y1: ty, y2: ty }));
    const tt = bhSv("text", { x: W - P, y: ty - 5, "text-anchor": "end" });
    tt.textContent = t("behaviour.target", { v: o.fmt(o.target) });
    s.append(tt);
  }
  return s;
}

// ── Gotchas ─────────────────────────────────────────────────────────────────
function bhGotchas(slot, ctx) {
  const G = ctx.gotchas;
  const P = G && G.panel;
  if (!P) {
    const c = card(t("behaviour.g.title"));
    c.append(empty(t("behaviour.g.none"), t("behaviour.g.noneHint")));
    slot.append(c);
    bhCardPreview(slot);
    return;
  }
  const sync = el("div", "row-actions");
  sync.append(el("span", "note", P.sync && P.sync.last_sync ? t("behaviour.g.lastSync", { at: new Date(P.sync.last_sync).toLocaleString() }) : t("behaviour.g.noSync")));
  for (const s of (P.sync && P.sync.sources) || []) {
    const c = chip(`${s.name} ${s.state}`);
    c.dataset.sync = s.state;
    sync.append(c);
  }
  const sc = card(t("behaviour.g.sources"), el("span", "note", t("behaviour.g.alwaysOn")));
  const tot = (P.by_source || []).reduce((s, x) => s + x.n, 0);
  if (tot) {
    const bar = el("div", "bh-src-bar");
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", P.by_source.map((s) => `${s.source} ${s.n}`).join(", "));
    P.by_source.forEach((s, i) => {
      const b = el("span", "bh-grow-x", s.n / tot > 0.08 ? `${s.source} ${s.n}` : "");
      b.dataset.source = s.source;
      b.style.flex = String(s.n);
      b.style.animationDelay = i * 80 + "ms";
      b.title = `${s.source}: ${s.n}`;
      bar.append(b);
    });
    sc.append(bar);
  }
  const chips = el("div", "bh-legend");
  for (const s of P.statuses || []) {
    const c = chip(`${(P.status_counts || {})[s] || 0} ${s}`);
    c.dataset.status = s;
    chips.append(c);
  }
  sc.append(chips, el("div", "note", t("behaviour.g.statusNote")), sync);
  slot.append(sc);

  const g = el("div", "grid grid-2");
  const lc = card(t("behaviour.g.list"), el("span", "note", t("behaviour.g.listNote")));
  (P.rows || []).forEach((r, i) => {
    const row = el("div", "bh-lesson");
    row.style.animationDelay = Math.min(i, 12) * 45 + "ms";
    row.append(el("div", "bh-lesson-id mono", r.id));
    const mid = el("div");
    mid.append(el("div", "bh-lesson-rule", r.fix && r.fix.charAt(0) !== "(" ? `${r.symptom} → ${r.fix}` : r.symptom || ""));
    const sub = el("div", "bh-lesson-sub");
    const src = el("span", "bh-src mono", r.source);
    src.dataset.source = r.source;
    sub.append(src);
    if (r.rule) sub.append(el("span", "mono", r.rule));
    if (r.scope) sub.append(el("span", "bh-scope mono", r.scope));
    if (r.status_reason) sub.append(el("span", null, r.status_reason));
    mid.append(sub);
    row.append(mid);
    const right = el("div", "bh-lesson-right");
    const st = chip(r.status);
    st.dataset.status = r.status;
    right.append(st, bhSpark(r.weeks || []));
    row.append(right);
    lc.append(row);
  });
  g.append(lc);
  slot.append(g);
  bhCardPreview(g);
}

function bhSpark(weeks) {
  const sp = el("div", "bh-spark");
  const mx = Math.max(1, ...weeks);
  sp.setAttribute("role", "img");
  sp.setAttribute("aria-label", t("behaviour.g.spark", { n: weeks.reduce((a, b) => a + b, 0), w: weeks.length }));
  weeks.forEach((h, i) => {
    const b = el("i", "bh-grow-y" + (h ? "" : " zero"));
    b.style.height = (h ? 20 + (80 * h) / mx : 8) + "%";
    b.style.animationDelay = 200 + i * 40 + "ms";
    sp.append(b);
  });
  return sp;
}

// What the reviewer will see: the EXACT card `orc gotcha card` returns. It
// re-reads on input, debounced 300 ms. Zero matches is the CLI's own answer.
function bhCardPreview(host) {
  const pc = card(t("behaviour.g.preview"), el("span", "note", t("behaviour.g.previewFree")));
  pc.append(el("div", "note", t("behaviour.g.previewHint")));
  const inp = el("input", "bh-input");
  inp.type = "text";
  inp.placeholder = "src/routes/export.js, client/src/i18n/en.json";
  inp.setAttribute("aria-label", t("behaviour.g.previewLabel"));
  const cmdBox = el("pre", "cmd", "orc gotcha card --files <paths> --json");
  const out = el("pre", "bh-card-out", "");
  out.setAttribute("aria-live", "polite");
  let timer = null;
  let seq = 0;
  const paint = async () => {
    const files = inp.value.split(",").map((s) => s.trim()).filter(Boolean).join(",");
    if (!files) {
      cmdBox.textContent = "orc gotcha card --files <paths> --json";
      out.textContent = t("behaviour.g.previewEmpty");
      return;
    }
    cmdBox.textContent = `orc gotcha card --files ${files} --json`;
    const mine = ++seq;
    let r;
    try {
      r = await read("/api/gotcha/card?files=" + encodeURIComponent(files));
    } catch (e) {
      if (mine === seq) out.textContent = String(e.message || e);
      return;
    }
    if (mine !== seq) return;
    const c = r.data || {};
    out.textContent = c.matched ? c.text : t("behaviour.g.noCard", { n: c.known || 0 });
  };
  inp.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(paint, 300);
  });
  pc.append(inp, cmdBox, out);
  paint();
  host.append(pc);
}

// ── Review quality ──────────────────────────────────────────────────────────
function bhQuality(slot, ctx) {
  const Q = ctx.quality;
  if (!Q) {
    const c = card(t("behaviour.q.cats"));
    c.append(empty(t("behaviour.q.none")));
    slot.append(c);
    return;
  }
  // Below the floor, every chart KEEPS its slot and shows the CLI's sentence.
  // Not knowing is an answer.
  const floor = (c) => c.append(el("div", "bh-floor", Q.floor_line || ""));
  const g = el("div", "grid grid-2");
  const cc = card(t("behaviour.q.cats"), el("span", "note", tn(Q.reviews || 0, "behaviour.q.reviews")));
  if (Q.below_floor) floor(cc);
  else {
    const bands = Q.bands || {};
    (Q.categories || []).forEach((c, i) => {
      const row = el("div", "bh-cat");
      const acc = c.acceptance;
      const bar = el("div", "bh-cat-bar");
      const s = el("span", "bh-grow-x");
      if (acc !== null && acc !== undefined) {
        s.style.width = Math.round(acc * 100) + "%";
        // The band thresholds are the CLI's numbers (`bands{}`), not the panel's.
        s.dataset.band = acc >= bands.ok ? "ok" : acc >= bands.warn ? "warn" : "bad";
      }
      s.style.animationDelay = i * 90 + "ms";
      bar.append(s);
      if (Q.target !== undefined) {
        const tick = el("i", "tick");
        tick.style.left = Q.target * 100 + "%";
        tick.title = t("behaviour.target", { v: Math.round(Q.target * 100) + "%" });
        bar.append(tick);
      }
      row.append(el("div", "bh-cat-name mono", c.category), bar, el("div", "bh-cat-num mono", `${acc === null ? "—" : Math.round(acc * 100) + "%"} · n ${c.findings}`));
      cc.append(row);
    });
  }
  g.append(cc);

  const series = Q.series || [];
  const tc = card(t("behaviour.q.trend"));
  const acc = series.map((p) => p.acceptance);
  if (Q.below_floor) floor(tc);
  else if (acc.filter((v) => v !== null).length >= 2)
    tc.append(bhLine(acc, { kind: "ok", fmt: (v) => Math.round(v * 100) + "%", target: Q.target, label: t("behaviour.q.trendLabel", { n: series.length }) }));
  else tc.append(empty(t("behaviour.q.none")));
  g.append(tc);
  slot.append(g);

  const g2 = el("div", "grid grid-2");
  const nc = card(t("behaviour.q.p3"));
  const p3 = series.map((p) => p.p3);
  if (Q.below_floor) floor(nc);
  else if (p3.length >= 2) {
    nc.append(bhLine(p3, { kind: "warn", fmt: (v) => String(v), label: t("behaviour.q.p3Label", { n: series.length }) }));
    nc.append(el("div", "note", t("behaviour.q.p3Note")));
  } else nc.append(empty(t("behaviour.q.none")));
  g2.append(nc);

  const sups = (ctx.cands && ctx.cands.suppressions) || [];
  const sp = card(t("behaviour.q.sups"), el("span", "note", tn(sups.length, "behaviour.q.waiting")));
  if (!sups.length) sp.append(empty(t("behaviour.q.noSups")));
  for (const c of sups) {
    const row = el("div", "bh-lesson");
    row.append(el("div", "bh-lesson-id mono", c.id));
    const mid = el("div");
    mid.append(el("div", "bh-lesson-rule", c.sig || c.rule || ""));
    const sub = el("div", "bh-lesson-sub");
    if (c.category) sub.append(el("span", "mono", c.category));
    if (c.scope) sub.append(el("span", "bh-scope mono", c.scope));
    sub.append(el("span", null, tn(c.disputed, "behaviour.q.disputed")));
    mid.append(sub);
    row.append(mid);
    const cmd = "orc gotcha accept " + c.id;
    const b = el("button", "btn btn-sm", t("behaviour.q.accept"));
    b.type = "button";
    b.addEventListener("click", () =>
      bhConfirm({
        title: t("behaviour.q.acceptTitle", { id: c.id }),
        what: t("behaviour.q.acceptWhat"),
        command: cmd,
        go: async () => {
          const r = await post("/api/gotcha/accept", { id: c.id });
          toast(r.ok ? t("behaviour.done", { id: c.id, command: cmd }) : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
          if (r.ok) bhSay(t("behaviour.done", { id: c.id, command: cmd }));
          bhLoad(ctx.body, ctx.right);
        },
      })
    );
    row.append(b);
    sp.append(row);
  }
  g2.append(sp);
  slot.append(g2);
}

// ── Answer log ──────────────────────────────────────────────────────────────
function bhLog(slot, ctx) {
  const c = card(t("behaviour.log.title"), el("span", "note", t("behaviour.log.from")));
  const events = (ctx.log && ctx.log.events) || [];
  if (!events.length) c.append(empty(t("behaviour.emptyTitle"), t("behaviour.emptyHint")));
  const list = el("div", "bh-log");
  events.forEach((e, i) => {
    const row = el("div", "bh-log-row");
    row.style.animationDelay = Math.min(i, 12) * 70 + "ms";
    const q = el("span", "bh-log-q");
    q.append(el("span", "mono", e.qid), document.createTextNode(" → "), el("b", null, e.chose));
    const by = chip(e.by);
    by.dataset.by = e.by;
    row.append(el("span", "t mono", new Date(e.at).toLocaleString()), el("span", "ln mono", e.lane), q, by);
    list.append(row);
  });
  c.append(list);
  c.append(el("div", "note", t("behaviour.log.note")));
  slot.append(c);
}

// ── Footer (every tab) ──────────────────────────────────────────────────────
function bhFooter(d, off) {
  const f = el("div", "bh-foot");
  f.append(el("span", "bh-lock", "🔒 " + t("behaviour.localOnly")));
  for (const p of (d && d.files) || []) f.append(el("span", "mono", p));
  const tail = el("span");
  if (off) tail.append(document.createTextNode(t("behaviour.offCosts") + " "), el("span", "mono", "orc config set habits observe"));
  else tail.append(document.createTextNode(t("behaviour.turnOff") + " "), el("span", "mono", "orc config set habits off"));
  f.append(tail);
  return f;
}

// ── the rail dot: the ONLY place outside this panel that shows habit state ──
// A proposal waiting (`counts.proposed > 0`) puts a dot on the rail link that
// pulses three times and stops.
function bhRailDot(d) {
  const a = document.querySelector('#nav a[data-panel="behaviour"]');
  if (!a) return;
  const has = !!(d && d.counts && d.counts.proposed > 0);
  let dot = a.querySelector(".bh-dot");
  if (has && !dot) {
    dot = el("span", "bh-dot");
    dot.setAttribute("aria-label", t("behaviour.railDot"));
    dot.setAttribute("role", "img");
    a.append(dot);
  } else if (!has && dot) dot.remove();
}
async function behaviourRailDot() {
  try {
    const r = await read("/api/habits");
    bhRailDot(r.data);
  } catch (_) {}
}

function bhCmd(text) {
  const b = el("div", "bh-cmd");
  b.append(el("span", "mono", "$ " + text));
  const cp = el("button", "copy-btn", t("common.copy").toLowerCase());
  cp.type = "button";
  cp.addEventListener("click", () => copy(text, text));
  b.append(cp);
  return b;
}

function bhSv(tag, attrs) {
  const n = document.createElementNS(BH_SVG, tag);
  for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
  return n;
}
