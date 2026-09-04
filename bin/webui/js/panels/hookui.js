"use strict";
/* panels/hookui.js — orc ui client
   The CLI Hook Interface: compose ORC's status line.

   THE ONE DESIGN DECISION THIS PANEL IS BUILT AROUND: you are composing
   something you cannot see while you compose it. The bar lives in a terminal at
   the bottom of a different window. Every other ORC panel shows you STATE; this
   one has to show you a RESULT — continuously, accurately, and in the forms it
   can take. If the preview is not what the hook will print, this panel is worse
   than editing JSON, because it is confidently wrong.

   It is not, and that is structural rather than careful: `orc statusline
   preview` renders through the SAME engine the hook does
   (templates/hooks/orc-statusline-render.js), so the two cannot diverge.

   THE PANEL DERIVES NOTHING. Not a component id, not a renderer name, not a
   glyph set, not a ramp, not a colour token, not a separator, not a state word,
   not the board's own rules. All of it arrives from `statusline components
   --json`, and a test greps this file and both string tables for those
   literals. (The Flow-stepper rule, on a fourth surface.)

   v1.4.1 — THE BOARD IS THE ONLY PLACE ANYTHING IS APPLIED, AND EVERY WRITE'S
   POSITION IS COMPUTED WHEN THAT WRITE RUNS. The list of parts used to carry
   three `+ line N` buttons per row, so the act of building the bar lived a long
   way from the bar — and each of those buttons computed a position from the
   SAVED layout rather than from the layout being staged. Three staged adds all
   landed on position 1, and the CLI read the second and third as EDITS of the
   first: that is why adding three parts produced one. Structural edits are now
   semantic ops against stable refs, replayed by `hkPlan` in order, and every
   position is derived at the moment that op will execute. The list below the
   board is a REFERENCE now: it says what each part shows, and it applies
   nothing. */

/* -------------------------------------------------------------- HOOK UI */

// The preview widths the panel offers. Not a fact about the layout — a fact
// about terminals people actually use — so it lives here rather than coming
// from the CLI. They are COLUMN COUNTS: how many character cells wide the
// terminal is. The card says so out loud, because three bare numbers over a
// picture is a control nobody can guess the meaning of.
const HK_WIDTHS = [80, 120, 160];
let HK_WIDTH = 120;
let HK_STATE = "healthy";
// The reference list's search box and its open group, both surviving a
// re-render so a paint does not close a list the user just opened.
let HK_SEARCH = "";
let HK_GROUP = null;
// WHICH BOARD. The main status line, or the row Claude Code draws per subagent
// in the agent panel. The panel does not know what boards exist — `components
// --json` carries the list — it only remembers which one you are looking at, so
// a re-render does not put you back on the other one.
let HK_BOARD = "status";

// THE STAGED OPS, in the order they were made. NOT a map of finished HTTP
// bodies: a body carries a POSITION, and a position computed when the op was
// staged is wrong the moment an earlier op shifts the line under it. These are
// semantic ops against stable refs; `hkPlan` turns them into writes — and
// recomputes every position — each time the board paints.
let HK_OPS = [];
// The chip being dragged. Transient: cleared on every drop and every paint.
let HK_DRAG = null;

// DRAG IS OFF ON A NARROW SCREEN, and off for real rather than merely restyled:
// a 40-pixel drop gap on a phone is not a target, so the three buttons on every
// chip are the path there. The query matches 06-responsive.css's own breakpoint
// — a chip that still says `draggable` while its handle is hidden is a promise
// the page cannot keep.
function hkCanDrag() {
  try {
    return !window.matchMedia("(max-width: 600px)").matches;
  } catch (_) {
    return true;
  }
}

PANELS.hookui = function (host) {
  head(host, t("hookui.title"), t("hookui.sub"));

  section(
    host,
    () =>
      Promise.all([
        read("/api/statusline/show?board=" + HK_BOARD).then((r) => r.data),
        read("/api/statusline/components?board=" + HK_BOARD).then((r) => r.data),
        read("/api/statusline/presets?board=" + HK_BOARD).then((r) => r.data),
        read("/api/statusline/preview?board=" + HK_BOARD + "&width=" + HK_WIDTH + "&state=" + HK_STATE).then((r) => r.data),
      ]),
    ([show, cat, presets, prev]) => {
      const out = frag();
      if (!show || !cat) {
        out.append(empty(t("hookui.noData")));
        return out;
      }
      // The effective board: what it WILL be once the staged ops run. Every
      // count, every slot cap and every legality question downstream reads this
      // and never `show.lines` directly.
      const plan = hkPlan(show, cat);

      const edits = editSet(() => bar.paint());
      const bar = editBar(edits, {
        onApply: async (b) => {
          await applyActions(edits, b);
          HK_OPS = [];
          rerender();
        },
        onReset: () => confirmReset(),
        onCancel: () => {
          HK_OPS = [];
          rerender();
        },
        resetLabel: t("hookui.resetLayout"),
      });
      // Filled AFTER the bar exists: `editSet`'s onChange paints it, and a
      // paint before that binding is assigned throws.
      for (const a of plan.actions) edits.action(a.key, a.route, a.body, a.label);

      out.append(boardTabs(cat));
      out.append(gateCard(show, cat));
      // A caution renders ABOVE the preview, never inside a tab — a caution you
      // have to hunt for is a caution nobody reads.
      if (show.errors.length || show.warnings.length) out.append(cautionCard(show));
      out.append(previewCard(prev, plan));
      out.append(boardCard(cat, plan));
      out.append(referenceCard(cat));
      out.append(presetsCard(presets, plan));
      out.append(advancedCard(cat, plan));
      out.append(bar);
      return out;
    }
  );
};

// EVERY write carries the board it is about. Forgetting it on one route would
// edit the other board's layout, which is the one mistake here that is silent.
function bd(body) {
  return Object.assign({ board: HK_BOARD }, body);
}

function rerender() {
  const h = location.hash;
  location.hash = "#/";
  location.hash = h || "#/hookui";
}

/* ══ the staged plan ══════════════════════════════════════════════════════
   Replays every staged op onto a working copy of the saved layout and returns
   BOTH the effective board and the ordered writes that produce it. ONE
   function, because a second idea of where a part will land is exactly the bug
   this replaces: the board drew one arrangement and the writes produced
   another, silently. */

// Ops are staged by REF, never by position. A ref is either an item id the CLI
// already gave us, or `new:<n>` for something staged in this session.
function hkOp(op) {
  // A second edit to the same field of the same part REPLACES the first — one
  // decision typed twice is one decision, and the pending list has to read as a
  // list of decisions rather than a list of keystrokes.
  if (op.op === "set") HK_OPS = HK_OPS.filter((o) => !(o.op === "set" && o.ref === op.ref && o.field === op.field));
  if (op.op === "sep") HK_OPS = HK_OPS.filter((o) => !(o.op === "sep" && o.line === op.line));
  if (op.op === "doc") HK_OPS = HK_OPS.filter((o) => !(o.op === "doc" && o.field === op.field));
  HK_OPS.push(op);
  rerender();
}

function hkPlan(show, cat) {
  const structural = new Set((cat.components || []).filter((c) => c.structural).map((c) => c.id));
  const lines = (show.lines || []).map((l) => ({
    line: l.line,
    separator: l.separator,
    items: (l.items || []).map((it) => ({ ref: it.id, type: it.type, src: it, over: {}, isNew: false })),
  }));
  const actions = [];
  const doc = { theme: show.theme, glyphs: show.glyphs };
  const find = (ref) => {
    for (const l of lines) {
      const i = l.items.findIndex((x) => x.ref === ref);
      if (i >= 0) return { l, i, it: l.items[i] };
    }
    return null;
  };

  HK_OPS.forEach((op, oi) => {
    const key = "op" + (oi + 1);
    if (op.op === "add") {
      const l = lines[op.line - 1];
      if (!l) return;
      // THE POSITION IS COMPUTED HERE, not when the button was pressed. Three
      // adds in a row get 1, 2 and 3 and append; three adds computed at stage
      // time all got 1, and the CLI read 2 and 3 as EDITS of the first.
      const pos = l.items.length + 1;
      l.items.push({ ref: "new:" + oi, type: op.type, src: null, over: {}, isNew: true });
      actions.push({ key, route: "/api/statusline/set", body: bd({ line: op.line, pos, type: op.type }), label: t("hookui.opAdd", { id: op.type, n: op.line }) });
    } else if (op.op === "remove") {
      const f = find(op.ref);
      if (!f) return;
      actions.push({ key, route: "/api/statusline/remove", body: bd({ at: f.l.line + ":" + (f.i + 1) }), label: t("hookui.opRemove", { id: f.it.type }) });
      f.l.items.splice(f.i, 1);
    } else if (op.op === "move") {
      const f = find(op.ref);
      if (!f) return;
      const from = f.l.line + ":" + (f.i + 1);
      f.l.items.splice(f.i, 1);
      const dst = lines[op.toLine - 1];
      if (!dst) return;
      const at = Math.max(0, Math.min(op.toPos - 1, dst.items.length));
      dst.items.splice(at, 0, f.it);
      actions.push({ key, route: "/api/statusline/move", body: bd({ from, to: dst.line + ":" + (at + 1) }), label: t("hookui.opMove", { id: f.it.type, n: dst.line }) });
    } else if (op.op === "clone") {
      const f = find(op.ref);
      if (!f) return;
      actions.push({ key, route: "/api/statusline/clone", body: bd({ at: f.l.line + ":" + (f.i + 1) }), label: t("hookui.opClone", { id: f.it.type }) });
      f.l.items.splice(f.i + 1, 0, { ref: "new:" + oi, type: f.it.type, src: f.it.src, over: Object.assign({}, f.it.over), isNew: true });
    } else if (op.op === "set") {
      const f = find(op.ref);
      if (!f) return;
      f.it.over[op.field] = op.value;
      if (op.field === "type") f.it.type = op.value;
      actions.push({ key, route: "/api/statusline/set", body: bd(Object.assign({ line: f.l.line, pos: f.i + 1 }, { [op.field]: op.value })), label: op.label });
    } else if (op.op === "sep") {
      const l = lines[op.line - 1];
      if (!l) return;
      l.separator = op.value;
      actions.push({ key, route: "/api/statusline/line", body: bd({ line: op.line, separator: op.value }), label: op.label });
    } else if (op.op === "doc") {
      doc[op.field] = op.value;
      actions.push({ key, route: "/api/statusline/doc", body: bd({ [op.field]: op.value }), label: op.label });
    }
  });

  for (const l of lines) {
    // A spacer is not a thing the line SAYS, so it does not eat one of the
    // five. Which ids those are is the CLI's answer, carried per component.
    l.counted = l.items.filter((x) => !structural.has(x.type)).length;
    l.full = l.counted >= cat.max_per_line;
  }
  return { lines, actions, doc, dirty: HK_OPS.length > 0, max: cat.max_per_line };
}

// The dense-prefix rule, applied to ONE line of the EFFECTIVE board — never the
// saved one, or a part staged onto line 1 would leave line 2 still refusing.
// The reason travels with the answer, because a disabled zone with no reason is
// a shrug.
function lineLegal(plan, n) {
  if (n === 1) return { ok: true };
  const above = plan.lines[n - 2];
  if (above && above.items.length > 0) return { ok: true };
  return { ok: false, why: t("hookui.fillFirst", { n: n - 1 }) };
}

// Why a part cannot go on this line RIGHT NOW; a null answer means it can. Both
// reasons are the user's to read BEFORE the click, never after it.
function addBlocked(plan, n) {
  const legal = lineLegal(plan, n);
  if (!legal.ok) return legal.why;
  const line = plan.lines[n - 1];
  if (!line) return t("hookui.noSuchLine");
  if (line.full) return t("hookui.lineFull", { n: n, max: plan.max });
  return null;
}

/* ══ the board tabs ═══════════════════════════════════════════════════════ */
// The two boards. Named by the CLI (`boards` in the catalogue), labelled by the
// panel — the id is data and the label is prose, which is the split everywhere
// else in this file too.
//
// The keys are SPELLED OUT rather than assembled from the id, for the same
// reason the tier labels are: a key built from a fragment is invisible to the
// coverage check that keeps the two string tables honest.
const HK_BOARD_LABEL = { status: "hookui.boardStatus", subagent: "hookui.boardSubagent" };
const HK_BOARD_SUB = { status: "hookui.boardStatusSub", subagent: "hookui.boardSubagentSub" };
function boardTabs(cat) {
  const c = card(null);
  const row = el("div", "row-actions hk-boards");
  for (const b of cat.boards || ["status"]) {
    const btn = el("button", "btn btn-sm" + (HK_BOARD === b ? " btn-primary" : " btn-ghost"),
      t(HK_BOARD_LABEL[b] || HK_BOARD_LABEL.status));
    btn.type = "button";
    btn.addEventListener("click", () => {
      if (HK_BOARD === b) return;
      // Switching boards with ops staged would send them to a board they were
      // never about: every op carries a board, but the POSITIONS in them were
      // computed against this one.
      if (HK_OPS.length) return toast(t("hookui.applyFirst"), "bad");
      HK_BOARD = b;
      HK_SEARCH = "";
      rerender();
    });
    row.append(btn);
  }
  c.append(row);
  c.append(el("div", "note", t(HK_BOARD_SUB[HK_BOARD] || HK_BOARD_SUB.status)));
  return c;
}

/* ══ the gate ═════════════════════════════════════════════════════════════ */
// INVERTED from the Extra panel's. There, nothing exists until you connect;
// here the board is LIVE WHILE OFF, because you must be able to compose before
// you arm. What is gated is the switch, not the work.
function gateCard(show, cat) {
  const c = card(t("hookui.gate"));
  const row = el("div", "row-actions");
  row.append(chip(show.enabled ? t("hookui.on") : t("hookui.off"), show.enabled ? "ok" : null));
  if (show.saved) row.append(chip(t("hookui.saved"), null));
  c.append(row);
  c.append(el("div", "note", show.enabled ? t("hookui.gateOnNote") : t("hookui.gateOffNote")));

  const b = el("button", "btn btn-sm" + (show.enabled ? " btn-ghost" : " btn-primary"),
    show.enabled ? t("hookui.turnOff") : t("hookui.turnOn"));
  b.type = "button";
  // ENABLED WITH NOTHING SAVED IS NOT A STATE. The switch cannot reach `on`
  // past a layout that does not validate, and the refusal names the violation
  // rather than saying "invalid".
  if (!show.enabled && !show.ok) {
    b.disabled = true;
    b.title = show.errors[0] || "";
    c.append(el("div", "note note-warn", show.errors[0] || ""));
  }
  b.addEventListener("click", async () => {
    // The KEY IS THE CLI'S. Naming it here would be a second idea of which
    // switch belongs to which board.
    const r = await post("/api/config/set", { key: cat.config_key, value: show.enabled ? "off" : "on" });
    if (!r.ok) toast(t("hookui.switchFailed"), "bad", (r.output || "").trim());
    rerender();
  });
  const acts = el("div", "row-actions");
  acts.append(b);
  c.append(acts);
  return c;
}

/* ══ cautions ═════════════════════════════════════════════════════════════ */
// An error is a refusal; a warning is a fact the user then owns. They are drawn
// differently and they are never merged into one count.
function cautionCard(show) {
  const c = card(t("hookui.cautions"));
  for (const e of show.errors) {
    const row = el("div", "hk-caution hk-caution-bad");
    row.append(el("span", "hk-caution-mark", "✕"));
    row.append(el("span", null, e));
    c.append(row);
  }
  for (const w of show.warnings) {
    const row = el("div", "hk-caution");
    row.append(el("span", "hk-caution-mark", "⚠"));
    row.append(el("span", null, w));
    c.append(row);
  }
  return c;
}

/* ══ the preview ══════════════════════════════════════════════════════════ */
// Pinned above the board and never scrolled away. `orc statusline preview
// --json`'s output, rendered as DOM and never as HTML.
//
// IT DRAWS THE SAVED LAYOUT, and while anything is staged it SAYS SO. The
// preview renders through the hook's own engine, which reads the file — so a
// preview of unsaved edits would need a second engine, which is the one thing
// this design refuses. "These changes are not in the picture yet" is the honest
// version, and it is also the answer to "I pressed Apply and nothing happened":
// something did, and this is where it shows up.
function previewCard(prev, plan) {
  const right = el("div", "row-actions");
  for (const w of HK_WIDTHS) {
    const b = el("button", "btn btn-xs" + (HK_WIDTH === w ? " btn-primary" : " btn-ghost"), tn(w, "hookui.cols"));
    b.type = "button";
    b.addEventListener("click", () => {
      HK_WIDTH = w;
      rerender();
    });
    right.append(b);
  }
  const c = card(t("hookui.preview"), right);
  c.append(el("div", "note", t("hookui.previewAbout")));
  if (plan.dirty) c.append(el("div", "note note-warn", t("hookui.previewStale")));
  if (!prev || !prev.ok) {
    c.append(el("div", "note", t("hookui.previewUnavailable")));
    return c;
  }

  // The fixture picker. `--fixtures` must carry one of every state INCLUDING
  // the ugly ones — you cannot design a degraded line on a healthy session.
  c.append(el("div", "note", t("hookui.fixturesAbout")));
  const states = el("div", "row-actions hk-fixtures");
  for (const [k, label] of Object.entries(prev.fixtures || {})) {
    const b = el("button", "btn btn-xs" + (HK_STATE === k ? " btn-primary" : " btn-ghost"), label);
    b.type = "button";
    b.addEventListener("click", () => {
      HK_STATE = k;
      rerender();
    });
    states.append(b);
  }
  c.append(states);

  c.append(ansiBlock(prev.text, "hk-preview"));

  // THE THREE STRIPPINGS, always visible — not an afterthought tab. You cannot
  // design an ASCII fallback you cannot see, and a design whose only
  // distinction is colour becomes ambiguous the moment NO_COLOR is set.
  const deg = el("div", "hk-degrade");
  deg.append(el("div", "note", t("hookui.degrades")));
  for (const [key, label] of [
    ["no_color", t("hookui.degNoColor")],
    ["ascii", t("hookui.degAscii")],
    ["no_motion", t("hookui.degNoMotion")],
  ]) {
    const row = el("div", "hk-degrade-row");
    row.append(el("span", "hk-degrade-label", label));
    row.append(ansiBlock(prev.strippings[key], "hk-preview hk-preview-sm"));
    deg.append(row);
  }
  c.append(deg);

  const meta = el("div", "row-actions");
  for (const w of prev.static_width || []) if (w) meta.append(chip(tn(w, "hookui.cells"), null));
  c.append(meta);
  return c;
}

// ANSI → DOM. Never innerHTML: this string comes from the CLI, and the rule for
// every other rendered artefact in this panel holds here too.
function ansiBlock(text, cls) {
  const pre = el("pre", cls);
  for (const line of String(text || "").split("\n")) {
    const row = el("div", "hk-line");
    let style = null;
    // A minimal SGR reader: colour, background and the emphasis attributes the
    // compiler can emit. Anything it does not recognise is DROPPED rather than
    // printed, because a stray escape in the middle of a preview is worse than
    // a missing colour.
    const re = /\[([0-9;]*)m/g;
    let last = 0;
    let m;
    const push = (s) => {
      if (!s) return;
      const span = el("span", null, s);
      // THROUGH CSSOM, NEVER A `style` ATTRIBUTE. This page is served under
      // `style-src 'self'`, which blocks a parsed style attribute outright —
      // so every colour this preview drew was thrown away by the browser and
      // the whole thing rendered grey, with the reason only in a console
      // nobody had open. Assigning the property is not a parse and is not
      // blocked, and weakening the policy to `unsafe-inline` for a preview is
      // not a trade worth making.
      if (style) for (const k of Object.keys(style)) span.style[k] = style[k];
      row.append(span);
    };
    while ((m = re.exec(line))) {
      push(line.slice(last, m.index));
      style = sgrStyle(m[1], style);
      last = m.index + m[0].length;
    }
    push(line.slice(last));
    if (!row.childNodes.length) row.append(document.createTextNode(" "));
    pre.append(row);
  }
  return pre;
}

// The 16 ANSI slots, as the browser's own colours. These are NOT ORC's colour
// tokens — they are what a terminal would paint, approximated, because the
// panel cannot know the user's terminal palette and says so.
const HK_ANSI = [
  "#000000", "#cc0000", "#4e9a06", "#c4a000", "#3465a4", "#75507b", "#06989a", "#d3d7cf",
];
const HK_ANSI_BRIGHT = [
  "#555753", "#ef2929", "#8ae234", "#fce94f", "#729fcf", "#ad7fa8", "#34e2e2", "#eeeeec",
];

// An OBJECT of CSS properties rather than a declaration string, because the
// caller assigns them one at a time through CSSOM — see `push` above.
function sgrStyle(codes, prev) {
  const parts = String(codes || "0").split(";").filter((x) => x !== "");
  if (!parts.length || parts[0] === "0") return null;
  const out = Object.assign({}, prev || {});
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (n === 1) out.fontWeight = "700";
    else if (n === 2) out.opacity = ".6";
    else if (n === 3) out.fontStyle = "italic";
    else if (n === 4) out.textDecoration = "underline";
    else if (n === 9) out.textDecoration = "line-through";
    else if (n === 7) out.filter = "invert(1)";
    else if (n >= 30 && n <= 37) out.color = HK_ANSI[n - 30];
    else if (n >= 90 && n <= 97) out.color = HK_ANSI_BRIGHT[n - 90];
    else if (n >= 40 && n <= 47) out.background = HK_ANSI[n - 40];
    else if (n === 39) out.color = "inherit";
    else if (n === 38 && parts[i + 1] === "2") {
      out.color = "rgb(" + parts[i + 2] + "," + parts[i + 3] + "," + parts[i + 4] + ")";
      i += 4;
    } else if (n === 48 && parts[i + 1] === "2") {
      out.background = "rgb(" + parts[i + 2] + "," + parts[i + 3] + "," + parts[i + 4] + ")";
      i += 4;
    }
  }
  return out;
}

/* ══ the board ════════════════════════════════════════════════════════════ */
// THE ILLEGAL DROP IS MADE IMPOSSIBLE rather than allowed and then complained
// about: an illegal zone renders disabled with its reason on the zone itself. A
// user should never be able to do the wrong thing and then be told off for it.
//
// The CLI still validates. The board is a convenience; it is never the
// guarantee.
function boardCard(cat, plan) {
  const c = card(t("hookui.board"));
  c.append(el("div", "note", t("hookui.boardAbout")));
  c.append(el("div", "note", cat.dense_prefix));

  for (const line of plan.lines) {
    const legal = lineLegal(plan, line.line);
    const wrap = el("div", "hk-line-wrap" + (legal.ok ? "" : " hk-line-blocked"));

    const h = el("div", "hk-line-head");
    const title = el("div", "hk-line-title");
    title.append(el("span", "hk-line-name", tn(line.line, "hookui.lineN")));
    title.append(el("span", "hk-line-count" + (line.full ? " hk-full" : ""), tn(line.counted, "hookui.slotsUsed", { max: plan.max })));
    h.append(title);
    h.append(separatorPicker(cat, line));
    wrap.append(h);

    const zone = el("div", "hk-zone");
    zone.setAttribute("role", "list");
    for (const item of line.items) zone.append(chipEl(item, line, plan, cat));

    if (!legal.ok) {
      const blocked = el("div", "hk-blocked");
      blocked.append(el("span", "hk-caution-mark", "✕"));
      blocked.append(el("span", null, legal.why));
      zone.append(blocked);
    }
    // THE ADD BUTTON ALWAYS RENDERS, and carries its own refusal. A control
    // that vanishes when it cannot be used teaches nobody why — and the two
    // refusals are DIFFERENT facts (nothing above it yet · this line is full),
    // so they are two sentences and never one "invalid".
    const b = el("button", "hk-add", t("hookui.add"));
    b.type = "button";
    if (!legal.ok) {
      b.disabled = true;
      b.title = legal.why;
    } else if (line.full) {
      b.disabled = true;
      b.title = t("hookui.lineFull", { n: line.line, max: plan.max });
    } else {
      b.addEventListener("click", () => partPicker(cat, plan, line.line, null));
    }
    zone.append(b);
    if (b.disabled && legal.ok) zone.append(el("div", "note note-warn hk-zone-why", b.title));
    dropTarget(zone, line, plan);
    wrap.append(zone);
    c.append(wrap);
  }
  c.append(el("div", "note", t("hookui.dragHint")));
  return c;
}

// THE SEPARATOR IS A DROPDOWN, and its options are the CLI's. A free-text box
// asked a person to invent a rhythm and then to type a character that may not
// be on their keyboard. A value the layout already carries that is NOT in the
// set keeps its slot, leads the list and is disabled — the `fixed_executor`
// rule: the state must be visible, never re-offerable.
function separatorPicker(cat, line) {
  const wrap = el("label", "hk-line-opts");
  wrap.append(el("span", "note", t("hookui.separator")));
  const sel = el("select", "hk-select");
  const known = cat.separators || [];
  if (!known.some((s) => s.value === line.separator)) {
    const o = el("option", null, t("hookui.sepCustom", { s: JSON.stringify(line.separator) }));
    o.value = line.separator;
    o.disabled = true;
    o.selected = true;
    sel.append(o);
  }
  for (const s of known) {
    // The NAME is the CLI's word; the sample is the literal string, shown
    // between two marks so a run of spaces is visible at all.
    const o = el("option", null, s.name + "   ‹" + s.value + "›");
    o.value = s.value;
    if (s.value === line.separator) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener("change", () => {
    const hit = known.find((s) => s.value === sel.value);
    hkOp({ op: "sep", line: line.line, value: sel.value, label: t("hookui.opSep", { n: line.line, s: hit ? hit.name : sel.value }) });
  });
  wrap.append(sel);
  return wrap;
}

/* ══ a chip ═══════════════════════════════════════════════════════════════ */
// A chip shows ITS OWN RENDERED OUTPUT, not its component id — that is what the
// user is arranging — with the id and a one-line description under it, because
// "what is this thing" is the first question anybody asks of a bar full of
// symbols, and the answer used to live only in a tooltip.
function chipEl(item, line, plan, cat) {
  const comp = (cat.components || []).find((x) => x.id === item.type);
  const wrap = el("div", "hk-chip" + (item.isNew ? " hk-chip-new" : ""));
  wrap.setAttribute("role", "listitem");
  wrap.setAttribute("tabindex", "0");
  wrap.draggable = hkCanDrag();
  wrap.title = comp && comp.summary ? comp.summary : item.type;

  const face = el("div", "hk-chip-face");
  face.append(el("span", "hk-grip", "∷"));
  face.append(ansiBlock(chipSample(item, comp), "hk-preview hk-preview-chip"));
  wrap.append(face);

  wrap.append(el("div", "hk-chip-id", item.type));
  if (comp && comp.summary) wrap.append(el("div", "hk-chip-desc", comp.summary));

  // EDIT · MOVE · REMOVE, on the chip. Each opens a modal that says what it is
  // about to do. The drag is the shortcut, never the mechanism: pointer drag is
  // unusable for a real fraction of people, and it is switched off entirely
  // below the width at which a drop gap stops being a target.
  const acts = el("div", "hk-chip-acts");
  const mk = (label, cls, fn) => {
    const b = el("button", "hk-act " + cls, label);
    b.type = "button";
    b.addEventListener("click", fn);
    acts.append(b);
  };
  mk(t("hookui.edit"), "hk-act-edit", () => editModal(item, line, comp, cat));
  mk(t("hookui.move"), "hk-act-move", () => moveModal(item, line, plan));
  mk(t("hookui.remove"), "hk-act-remove", () => removeModal(item, comp));
  wrap.append(acts);

  // Keyboard: the settled pattern, and every drag has an equivalent here. A
  // board only reachable by mouse is a board a lot of people cannot use.
  wrap.addEventListener("keydown", (ev) => {
    const pos = line.items.indexOf(item) + 1;
    if (ev.key === "Delete" || ev.key === "Backspace") {
      ev.preventDefault();
      removeModal(item, comp);
    } else if (ev.key === "e" || ev.key === "E") {
      ev.preventDefault();
      editModal(item, line, comp, cat);
    } else if (ev.key === "ArrowLeft" && pos > 1) {
      ev.preventDefault();
      moveTo(item, line.line, pos - 1);
    } else if (ev.key === "ArrowRight" && pos < line.items.length) {
      ev.preventDefault();
      moveTo(item, line.line, pos + 1);
    } else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      const target = line.line + (ev.key === "ArrowUp" ? -1 : 1);
      if (target < 1 || target > plan.lines.length) return;
      ev.preventDefault();
      const why = addBlocked(plan, target);
      // A line that cannot take it is SKIPPED and the live region says why —
      // never a silent no-op.
      if (why) return announce(why);
      moveTo(item, target, 1);
    }
  });

  wrap.addEventListener("dragstart", (ev) => {
    HK_DRAG = { ref: item.ref, from: line.line };
    wrap.classList.add("hk-chip-dragging");
    try {
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", item.ref);
    } catch (_) {}
  });
  wrap.addEventListener("dragend", () => {
    HK_DRAG = null;
    wrap.classList.remove("hk-chip-dragging");
    for (const n of document.querySelectorAll(".hk-drop-before, .hk-drop-after"))
      n.classList.remove("hk-drop-before", "hk-drop-after");
  });
  wrap.addEventListener("dragover", (ev) => {
    if (!HK_DRAG || HK_DRAG.ref === item.ref) return;
    ev.preventDefault();
    const r = wrap.getBoundingClientRect();
    const before = ev.clientX < r.left + r.width / 2;
    wrap.classList.toggle("hk-drop-before", before);
    wrap.classList.toggle("hk-drop-after", !before);
  });
  wrap.addEventListener("dragleave", () => wrap.classList.remove("hk-drop-before", "hk-drop-after"));
  wrap.addEventListener("drop", (ev) => {
    if (!HK_DRAG || HK_DRAG.ref === item.ref) return;
    ev.preventDefault();
    ev.stopPropagation();
    const before = wrap.classList.contains("hk-drop-before");
    const pos = line.items.indexOf(item) + 1;
    dropOnto(line, plan, before ? pos : pos + 1);
  });
  return wrap;
}

// What this chip will look like in the bar. A part staged in this session has
// no rendered sample from the CLI yet, so it borrows its component's default —
// which is exactly what it will render as until somebody changes its shape.
function chipSample(item, comp) {
  if (!comp) return item.type;
  const render = item.over.render || (item.src ? item.src.render : (comp.defaults && comp.defaults.render) || comp.renderers[0]);
  const s = comp.previews ? comp.previews[render] : null;
  return s || item.type;
}

// A zone is a drop target across its WHOLE area, so a drop past the last chip
// appends instead of doing nothing.
function dropTarget(zone, line, plan) {
  zone.addEventListener("dragover", (ev) => {
    if (!HK_DRAG) return;
    if (HK_DRAG.from !== line.line && addBlocked(plan, line.line)) return;
    ev.preventDefault();
    zone.classList.add("hk-zone-hot");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("hk-zone-hot"));
  zone.addEventListener("drop", (ev) => {
    zone.classList.remove("hk-zone-hot");
    if (!HK_DRAG) return;
    ev.preventDefault();
    dropOnto(line, plan, line.items.length + 1);
  });
}

function dropOnto(line, plan, pos) {
  if (!HK_DRAG) return;
  const all = plan.lines.reduce((acc, l) => acc.concat(l.items), []);
  const moving = all.find((x) => x.ref === HK_DRAG.ref);
  const from = HK_DRAG.from;
  HK_DRAG = null;
  if (!moving) return;
  // Reordering WITHIN a line never changes how many parts it holds, so the
  // five-slot cap and the dense-prefix rule only apply to a move that crosses
  // lines.
  if (from !== line.line) {
    const why = addBlocked(plan, line.line);
    if (why) return toast(why, "bad");
  }
  moveTo(moving, line.line, pos);
}

function moveTo(item, toLine, toPos) {
  hkOp({ op: "move", ref: item.ref, toLine, toPos });
  announce(t("hookui.opMove", { id: item.type, n: toLine }));
}

// `aria-grabbed` is deprecated and is not used. State is announced through a
// polite live region instead — VoiceOver does not reliably read a dynamically
// updated description, so the live region is the mechanism, not a fallback.
function announce(msg) {
  let region = document.getElementById("hk-live");
  if (!region) {
    region = el("div", "sr-only");
    region.id = "hk-live";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  region.textContent = msg;
}

/* ══ the part picker ══════════════════════════════════════════════════════ */
// ONE MODAL, one search box, one click. It is the only place a part is ever
// chosen — for a new slot and for swapping an existing one — so there is
// exactly one answer to "how do I put something on the bar".
//
// `replace` names the chip whose part is being swapped; absent, this is an add.
function partPicker(cat, plan, line, replace) {
  let q = "";
  // NOT named `body`: that name is reserved for a panel's own card container,
  // which must carry `stack`. This is a modal's contents and spaces itself.
  const pane = el("div", "hk-picker");

  const searchRow = el("div", "hk-picker-search");
  const search = el("input", "hk-input hk-picker-input");
  search.type = "search";
  search.placeholder = t("hookui.searchPlaceholder");
  const count = el("span", "note");
  searchRow.append(search, count);
  pane.append(searchRow);
  pane.append(el("div", "note", replace ? t("hookui.pickerReplaceAbout") : tn(line, "hookui.pickerAbout")));

  const list = el("div", "hk-picker-list");
  pane.append(list);

  const closer = () => close();
  const paint = () => {
    list.replaceChildren();
    const rows = (cat.components || []).filter((c) => (q ? matches(c, q) : true));
    count.textContent = tn(rows.length, "hookui.matches");
    if (!rows.length) {
      list.append(empty(t("hookui.noMatch")));
      return;
    }
    for (const comp of rows) list.append(pickerRow(comp, line, replace, closer));
  };
  search.addEventListener("input", () => {
    q = search.value.trim().toLowerCase();
    paint();
  });
  paint();

  const close = modal({
    title: replace ? t("hookui.pickerReplaceTitle") : tn(line, "hookui.pickerTitle"),
    body: pane,
    actions: [{ label: t("common.cancel"), cls: "btn-ghost", onClick: (c) => c() }],
  });
  setTimeout(() => search.focus(), 40);
}

// A row says WHAT the part is, in a sentence, next to what it will look like.
// A REFUSED part is drawn and is NOT clickable — never a disabled button, and
// never absent: "we decided against this" and "we forgot" must not look the
// same, which is why the row exists at all.
function pickerRow(comp, line, replace, close) {
  const refused = comp.cost === "refused";
  const row = el(refused ? "div" : "button", "hk-pick-row" + (refused ? " hk-pick-row-off" : ""));
  if (!refused) row.type = "button";

  const top = el("div", "hk-pick-top");
  top.append(el("span", "hk-prow-id", comp.id));
  // The cost chip is the CLI's own word. A friendlier synonym would be a state
  // that does not exist.
  top.append(chip(comp.cost, refused ? "bad" : null));
  row.append(top);
  if (comp.summary) row.append(el("div", "hk-pick-desc", comp.summary));
  const sample = comp.previews && comp.previews[(comp.defaults && comp.defaults.render) || comp.renderers[0]];
  if (sample) row.append(ansiBlock(sample, "hk-preview hk-preview-chip"));
  if (refused) {
    row.append(el("div", "note note-warn", comp.refused_reason));
    return row;
  }
  row.addEventListener("click", () => {
    if (replace) hkOp({ op: "set", ref: replace.ref, field: "type", value: comp.id, label: t("hookui.opSwap", { id: comp.id }) });
    else hkOp({ op: "add", line, type: comp.id });
    close();
  });
  return row;
}

// Fuzzy plus INITIALISM: with a catalogue this size a substring search is not
// enough — two letters should find a two-word name, which plain substring
// matching does not.
function matches(comp, q) {
  const id = comp.id.toLowerCase();
  if (id.includes(q)) return true;
  if ((comp.summary || "").toLowerCase().includes(q)) return true;
  if ((comp.label || "").toLowerCase().includes(q)) return true;
  const initials = id.split("-").map((p) => p[0]).join("");
  if (initials.startsWith(q)) return true;
  let i = 0;
  for (const ch of id) if (ch === q[i]) i++;
  return i === q.length;
}

/* ══ move ═════════════════════════════════════════════════════════════════ */
// A modal that says what it is about to do — and on a narrow screen it is the
// ONLY way to move a chip, because drag is off below the width at which a drop
// gap stops being a target.
function moveModal(item, line, plan) {
  const body = el("div", "stack");
  body.append(el("div", "note", t("hookui.moveAbout", { id: item.type })));

  for (const target of plan.lines) {
    const legal = lineLegal(plan, target.line);
    const sameLine = target.line === line.line;
    const box = el("div", "hk-move-line");
    box.append(el("div", "hk-line-name", tn(target.line, "hookui.lineN")));
    // A LINE THAT CANNOT TAKE IT SAYS SO ONCE. Six identical disabled slots is
    // the same refusal printed six times, and the reason is about the LINE
    // rather than about any one slot on it.
    const blocked = sameLine ? null : addBlocked(plan, target.line);
    if (blocked) {
      box.append(el("div", "note note-warn", blocked));
      body.append(box);
      continue;
    }
    const slots = el("div", "hk-move-slots");
    const n = Math.max(1, target.items.length + (sameLine ? 0 : 1));
    for (let p = 1; p <= n; p++) {
      const b = el("button", "btn btn-xs btn-ghost", tn(p, "hookui.slotN"));
      b.type = "button";
      if (sameLine && p === line.items.indexOf(item) + 1) {
        b.disabled = true;
        b.title = t("hookui.alreadyHere");
      } else {
        b.addEventListener("click", () => {
          close();
          moveTo(item, target.line, p);
        });
      }
      slots.append(b);
    }
    box.append(slots);
    body.append(box);
  }

  const close = modal({
    title: t("hookui.moveTitle"),
    body,
    actions: [{ label: t("common.cancel"), cls: "btn-ghost", onClick: (c) => c() }],
  });
}

/* ══ remove ═══════════════════════════════════════════════════════════════ */
function removeModal(item, comp) {
  const body = el("div", "stack");
  body.append(el("div", "note", t("hookui.removeAbout", { id: item.type })));
  if (comp && comp.summary) body.append(el("div", "note", comp.summary));
  modal({
    title: t("hookui.removeTitle"),
    body,
    actions: [
      { label: t("common.cancel"), cls: "btn-ghost", onClick: (c) => c() },
      {
        label: t("hookui.remove"),
        cls: "btn-primary",
        onClick: (c) => {
          c();
          hkOp({ op: "remove", ref: item.ref });
        },
      },
    ],
  });
}

/* ══ the part editor ══════════════════════════════════════════════════════ */
// A MODAL, because the board is what the user is looking at, and a drawer that
// opened inside a chip pushed the whole board down under the thing being
// edited.
//
// NO FIELD NAMES, AND EVERY CONTROL CARRIES A SENTENCE. `min_width` and
// `hide_when` are the JSON's words; this says "Least width" and explains what
// it does. The JSON is for the diff, the editor is for the person — and the
// ids, renderers and state words that DO appear are the CLI's own and are never
// translated.
function editModal(item, line, comp, cat) {
  // NOT named `body`: that name is reserved for a panel's own card container,
  // which must carry `stack`. This is a modal's contents and spaces itself.
  const pane = el("div", "hk-editor");
  if (!comp) {
    pane.append(el("div", "note", t("hookui.unknownComponent")));
    modal({ title: item.type, body: pane, actions: [{ label: t("common.close"), cls: "btn-ghost", onClick: (c) => c() }] });
    return;
  }
  const val = (field, dflt) => (field in item.over ? item.over[field] : item.src && item.src[field] !== undefined && item.src[field] !== null ? item.src[field] : dflt);
  const stage = (field, value, label) => hkOp({ op: "set", ref: item.ref, field, value, label });

  const live = el("div", "hk-editor-live");
  live.append(ansiBlock(chipSample(item, comp), "hk-preview hk-preview-sm"));
  pane.append(live);
  if (comp.summary) pane.append(el("div", "note", comp.summary));

  // Swapping the part itself, from inside the editor: "this slot, but a
  // different thing" is a real edit and it should not need a remove and an add.
  const swap = el("button", "btn btn-xs btn-ghost hk-swap", t("hookui.swap"));
  swap.type = "button";
  swap.addEventListener("click", () => {
    close();
    partPicker(cat, HK_NO_LINES, 0, item);
  });
  pane.append(swap);

  // THE SHAPE PICKER IS A GALLERY, NOT A DROPDOWN. Every renderer the component
  // declares, drawn with this component's real current value. A dropdown
  // containing a renderer's name tells nobody anything, and this is the
  // difference between a feature people use and a settings form they close.
  pane.append(sectionHead(t("hookui.shape"), t("hookui.shapeAbout")));
  const gallery = el("div", "hk-gallery");
  const curRender = val("render", (comp.defaults && comp.defaults.render) || comp.renderers[0]);
  for (const r of comp.renderers) {
    const b = el("button", "hk-sample" + (curRender === r ? " hk-sample-on" : ""));
    b.type = "button";
    b.title = r;
    b.append(ansiBlock(comp.previews && comp.previews[r] ? comp.previews[r] : r, "hk-preview hk-preview-chip"));
    b.append(el("span", "hk-sample-id", r));
    b.addEventListener("click", () => {
      close();
      stage("render", r, t("hookui.shapeChange", { id: comp.id, r }));
    });
    gallery.append(b);
  }
  pane.append(gallery);

  pane.append(sectionHead(t("hookui.glyphs"), t("hookui.glyphsAbout")));
  pane.append(pickRow(cat.glyph_sets, val("glyphs", null), (v) => stage("glyphs", v, t("hookui.glyphChange", { id: comp.id, v }))));

  pane.append(sectionHead(t("hookui.words"), t("hookui.wordsAbout")));
  const label = el("input", "hk-input");
  label.type = "text";
  const cur = val("label", "");
  label.value = cur == null ? "" : String(cur);
  label.placeholder = t("hookui.labelPlaceholder");
  label.addEventListener("change", () => stage("label", label.value, t("hookui.labelChange", { id: comp.id, v: label.value })));
  pane.append(labelled(t("hookui.label"), label, t("hookui.labelAbout")));
  pane.append(labelled(t("hookui.case"), pickRow(cat.cases, val("case", null), (v) => stage("case", v, t("hookui.caseChange", { id: comp.id, v }))), t("hookui.caseAbout")));
  pane.append(labelled(t("hookui.before"), textField(val("prefix", ""), (v) => stage("prefix", v, t("hookui.beforeChange", { id: comp.id, v }))), t("hookui.beforeAbout")));
  pane.append(labelled(t("hookui.after"), textField(val("suffix", ""), (v) => stage("suffix", v, t("hookui.afterChange", { id: comp.id, v }))), t("hookui.afterAbout")));

  pane.append(sectionHead(t("hookui.colour"), t("hookui.colourAbout")));
  pane.append(labelled(t("hookui.labelColour"), pickRow(cat.colors, val("label_color", null), (v) => stage("label_color", v, t("hookui.colourChange", { id: comp.id, v }))), t("hookui.labelColourAbout")));
  pane.append(labelled(t("hookui.valueColour"), pickRow(cat.colors, val("value_color", null), (v) => stage("value_color", v, t("hookui.colourChange", { id: comp.id, v }))), t("hookui.valueColourAbout")));
  if (comp.bounded)
    pane.append(labelled(t("hookui.ramp"), pickRow(Object.keys(cat.ramps), val("ramp", null), (v) => stage("ramp", v, t("hookui.rampChange", { id: comp.id, v }))), t("hookui.rampAbout")));
  // R3, AT THE CONTROL, at the moment the choice is made — never in a
  // validation summary later.
  if (comp.states) pane.append(el("div", "note note-warn", t("hookui.stateColourWarn", { s: comp.states.join(", ") })));

  // "Weight", never "font size". A terminal owns its font, and a picker that
  // did nothing would be worse than not offering one.
  pane.append(labelled(t("hookui.emphasis"), pickRow((cat.emphasis || []).filter((e) => !(cat.refused_emphasis || []).includes(e)), (val("emphasis", []) || [])[0], (v) => stage("emphasis", v, t("hookui.emphasisChange", { id: comp.id, v }))), t("hookui.emphasisAbout")));
  pane.append(el("div", "note", t("hookui.fontWhy")));

  if (comp.bounded || (comp.defaults && comp.defaults.format)) {
    pane.append(sectionHead(t("hookui.numbers"), t("hookui.numbersAbout")));
    pane.append(labelled(t("hookui.format"), pickRow(cat.formats, val("format", null), (v) => stage("format", v, t("hookui.formatChange", { id: comp.id, v }))), t("hookui.formatAbout")));
    pane.append(labelled(t("hookui.compact"), pickRow(cat.compact, val("compact", null), (v) => stage("compact", v, t("hookui.compactChange", { id: comp.id, v }))), t("hookui.compactAbout")));
    // `min_width` is not cosmetic: a value that changes width shifts every part
    // to its right on the keystroke it happens, and that jitter is the main
    // reason people turn a status line off again.
    pane.append(labelled(t("hookui.minWidth"), numField(val("min_width", null), 0, 8, (v) => stage("min_width", v, t("hookui.minWidthChange", { id: comp.id, v }))), t("hookui.minWidthWarn")));
    pane.append(labelled(t("hookui.precision"), numField(val("precision", null), 0, 2, (v) => stage("precision", v, t("hookui.precisionChange", { id: comp.id, v }))), t("hookui.precisionAbout")));
  }

  const rend = cat.renderers[curRender];
  if (rend && rend.width)
    pane.append(labelled(t("hookui.width"), numField(val("width", null), rend.width[0], rend.width[1], (v) => stage("width", v, t("hookui.widthChange", { id: comp.id, v }))), t("hookui.widthWhy")));

  // A CHECKLIST, not an enum: "hide when zero" and "hide when there is no run"
  // are independent facts and a user wants both at once.
  pane.append(sectionHead(t("hookui.whenToShow"), t("hookui.whenToShowAbout")));
  const checks = el("div", "hk-checks");
  const active = new Set(val("hide_when", []) || []);
  for (const h of cat.hide_when) {
    if (h.id === "never") continue;
    const lab = el("label", "hk-check");
    const box = el("input");
    box.type = "checkbox";
    box.checked = active.has(h.id);
    box.addEventListener("change", () => {
      const next = new Set(active);
      if (box.checked) next.add(h.id);
      else next.delete(h.id);
      const v = next.size ? [...next].join(",") : "never";
      stage("hide_when", v, t("hookui.hideChange", { id: comp.id, v }));
    });
    lab.append(box, el("span", null, h.id), el("span", "note", h.says));
    checks.append(lab);
  }
  pane.append(checks);

  // RESPONSIVE WIDTH: the range of terminal widths in which this part is worth
  // its cells. Strictly better than truncating the right of an overflowing
  // line, because the USER chooses what survives a narrow terminal.
  pane.append(sectionHead(t("hookui.narrow"), t("hookui.narrowAbout")));
  pane.append(labelled(t("hookui.minCols"), numField(val("min_cols", null), 0, 200, (v) => stage("min_cols", v, t("hookui.minColsChange", { id: comp.id, v }))), t("hookui.minColsAbout")));
  pane.append(labelled(t("hookui.priority"), numField(val("priority", null), 1, 5, (v) => stage("priority", v, t("hookui.priorityChange", { id: comp.id, v }))), t("hookui.priorityWhy")));

  const close = modal({
    title: comp.id,
    body: pane,
    actions: [
      // WHERE EACH VALUE CAME FROM. It is how a user finds their own overrides
      // again after a colour set change — `orc lane config`'s problem, at part
      // scale. It reads the SAVED item, so it is offered only for one.
      ...(item.src
        ? [{
            label: t("hookui.explain"),
            cls: "btn-ghost",
            onClick: async () => {
              const r = await read("/api/statusline/explain?board=" + HK_BOARD + "&at=" + line.line + ":" + (line.items.indexOf(item) + 1));
              if (!r.data || !r.data.ok) return toast(t("hookui.explainFailed"), "bad");
              modal({
                title: comp.id,
                pane: kvList(r.data.resolved.map((x) => [x.field, x.source])),
                actions: [{ label: t("common.close"), cls: "btn-ghost", onClick: (c) => c() }],
              });
            },
          }]
        : []),
      { label: t("common.close"), cls: "btn-ghost", onClick: (c) => c() },
    ],
  });
}

// `partPicker` reads a board only to answer "can a part go on that line". A
// SWAP changes nothing about where the part sits, so it is handed a board with
// no lines and never asks.
const HK_NO_LINES = { lines: [], max: 5 };

function sectionHead(name, about) {
  const w = el("div", "hk-section-wrap");
  w.append(el("div", "hk-section", name));
  if (about) w.append(el("div", "note", about));
  return w;
}

function numField(value, lo, hi, onSet) {
  const i = el("input", "hk-input hk-num");
  i.type = "number";
  i.min = String(lo);
  i.max = String(hi);
  if (value !== null && value !== undefined) i.value = String(value);
  i.addEventListener("change", () => onSet(i.value));
  return i;
}

function textField(value, onSet) {
  const i = el("input", "hk-input");
  i.type = "text";
  i.value = value == null ? "" : String(value);
  i.addEventListener("change", () => onSet(i.value));
  return i;
}

// A control, its name, and — because a noun on its own is not an explanation —
// the sentence that says what it does. That sentence is most of this release:
// a settings form whose labels are nouns is a form people close.
function labelled(name, node, about) {
  const row = el("div", "hk-field");
  const left = el("div", "hk-field-left");
  left.append(el("span", "hk-field-name", name));
  if (about) left.append(el("span", "note", about));
  row.append(left);
  row.append(node);
  return row;
}

// A row of options. The VALUES are the CLI's and are printed verbatim — a
// translated renderer name is a renderer that does not exist.
function pickRow(options, current, onPick) {
  const row = el("div", "hk-picks");
  for (const o of options || []) {
    const b = el("button", "hk-pick" + (String(current) === String(o) ? " hk-pick-on" : ""), String(o));
    b.type = "button";
    b.addEventListener("click", () => onPick(o));
    row.append(b);
  }
  return row;
}

/* ══ the reference list ═══════════════════════════════════════════════════ */
// WHAT EACH PART SHOWS, and nothing else. It used to carry three `+ line N`
// buttons per row, which put the act of building the bar a long way from the
// bar — and computed a position against a layout that was no longer the one
// being staged. Adding happens on the board now; this is a reference.
function referenceCard(cat) {
  const right = el("div", "row-actions");
  const search = el("input", "hk-input hk-palette-search");
  search.type = "search";
  search.value = HK_SEARCH;
  search.placeholder = t("hookui.searchPlaceholder");
  right.append(search);

  const c = card(t("hookui.reference"), right);
  c.append(el("div", "note", t("hookui.referenceAbout")));
  const body = el("div", "stack");
  c.append(body);

  function paint() {
    body.replaceChildren();
    const q = HK_SEARCH.trim().toLowerCase();
    const hits = q ? (cat.components || []).filter((x) => matches(x, q)) : null;
    if (hits) {
      body.append(el("div", "note", tn(hits.length, "hookui.matches")));
      for (const comp of hits) body.append(referenceRow(comp));
      if (!hits.length) body.append(empty(t("hookui.noMatch")));
      return;
    }
    for (const [g, name] of Object.entries(cat.groups)) {
      const rows = (cat.components || []).filter((x) => x.group === g);
      if (!rows.length) continue;
      const inner = el("div");
      for (const comp of rows) inner.append(referenceRow(comp));
      body.append(collapsible({
        title: name,
        count: String(rows.length),
        content: inner,
        collapsed: HK_GROUP !== g,
      }));
    }
  }
  search.addEventListener("input", () => {
    HK_SEARCH = search.value;
    paint();
  });
  paint();
  return c;
}

function referenceRow(comp) {
  const row = el("div", "hk-prow");
  const top = el("div", "hk-prow-head");
  top.append(el("span", "hk-prow-id", comp.id));
  top.append(chip(comp.cost, comp.cost === "refused" ? "bad" : null));
  row.append(top);
  if (comp.summary) row.append(el("div", "hk-prow-desc", comp.summary));
  const sample = comp.previews && comp.previews[(comp.defaults && comp.defaults.render) || comp.renderers[0]];
  if (sample) row.append(ansiBlock(sample, "hk-preview hk-preview-chip"));
  // A REFUSED part keeps its slot and carries the measurement that refused it:
  // "we decided against this" and "we forgot" must not look the same.
  if (comp.cost === "refused") row.append(el("div", "note note-warn hk-prow-why", comp.refused_reason));
  return row;
}

/* ══ presets ══════════════════════════════════════════════════════════════ */
// Applying one REPLACES the layout, so it is always confirmed and the loss is
// NAMED — the `orc diy init --force` rule.
function presetsCard(presets, plan) {
  const c = card(t("hookui.presets"));
  c.append(el("div", "note", t("hookui.presetsAbout")));
  if (!presets || !presets.presets) return c;
  for (const p of presets.presets) {
    const row = el("div", "hk-preset");
    const h = el("div", "hk-preset-head");
    h.append(el("span", "hk-prow-id", p.name));
    if (p.active) h.append(chip(t("hookui.active"), "ok"));
    row.append(h);
    row.append(el("div", "note", p.summary));
    if (p.preview) row.append(ansiBlock(p.preview, "hk-preview hk-preview-sm"));
    // The ACTIVE row keeps its slot and drops its button.
    if (!p.active) {
      const b = el("button", "btn btn-xs btn-ghost", t("hookui.apply"));
      b.type = "button";
      // A preset is written STRAIGHT AWAY, so it cannot run while ops are
      // staged: those ops carry positions computed against a layout the preset
      // is about to replace.
      if (plan.dirty) {
        b.disabled = true;
        b.title = t("hookui.applyFirst");
      } else {
        b.addEventListener("click", () => confirmApply(p.name));
      }
      row.append(b);
    }
    c.append(row);
  }
  return c;
}

function confirmApply(name) {
  modal({
    title: t("hookui.applyTitle", { name }),
    body: el("div", "note", t("hookui.applyWarn")),
    actions: [
      { label: t("common.cancel"), cls: "btn-ghost", onClick: (c) => c() },
      {
        label: t("hookui.apply"),
        cls: "btn-primary",
        onClick: async (c) => {
          c();
          const r = await post("/api/statusline/apply", bd({ name }));
          if (!r.ok) toast(t("hookui.applyFailed"), "bad", (r.output || "").trim());
          HK_OPS = [];
          rerender();
        },
      },
    ],
  });
}

function confirmReset() {
  modal({
    title: t("hookui.resetTitle"),
    body: el("div", "note", t("hookui.resetWarn")),
    actions: [
      { label: t("common.cancel"), cls: "btn-ghost", onClick: (c) => c() },
      {
        label: t("hookui.resetLayout"),
        cls: "btn-primary",
        onClick: async (c) => {
          c();
          await post("/api/statusline/reset", bd({}));
          HK_OPS = [];
          rerender();
        },
      },
    ],
  });
}

/* ══ more ═════════════════════════════════════════════════════════════════ */
// THE COLOUR SET IS A DOCUMENT SETTING, and it now goes to the command that
// writes document settings. It used to be routed through `statusline line 1
// --theme`, which set ONE line's override while the picker read the document's
// value back — so the button never moved and only a third of the bar changed.
// One command per scope, and the panel calls the one that matches the control.
function advancedCard(cat, plan) {
  const c = card(t("hookui.advanced"));

  const themes = el("div", "hk-theme-list");
  for (const name of Object.keys(cat.themes || {})) {
    const b = el("button", "hk-theme" + (plan.doc.theme === name ? " hk-theme-on" : ""));
    b.type = "button";
    b.append(el("span", "hk-theme-name", name));
    // WHY somebody would pick it — the CLI's sentence, not one written here.
    const about = (cat.themes_about || {})[name];
    if (about) b.append(el("span", "note", about));
    b.addEventListener("click", () => hkOp({ op: "doc", field: "theme", value: name, label: t("hookui.themeChange", { v: name }) }));
    themes.append(b);
  }
  c.append(labelled(t("hookui.theme"), themes, t("hookui.themeAbout")));
  c.append(el("div", "note", t("hookui.themeOverride")));

  c.append(labelled(t("hookui.glyphs"),
    pickRow(cat.glyph_sets, plan.doc.glyphs, (v) => hkOp({ op: "doc", field: "glyphs", value: v, label: t("hookui.glyphsDocChange", { v }) })),
    t("hookui.glyphsDocAbout")));

  const re = el("button", "btn btn-sm btn-ghost", t("hookui.recompile"));
  re.type = "button";
  re.addEventListener("click", async () => {
    const r = await post("/api/statusline/compile", bd({}));
    toast(r.ok ? t("hookui.recompiled") : t("hookui.recompileFailed"), r.ok ? "ok" : "bad");
    rerender();
  });
  const acts = el("div", "row-actions");
  acts.append(re);
  c.append(acts);
  c.append(el("div", "note", t("hookui.compileNote")));
  return c;
}
