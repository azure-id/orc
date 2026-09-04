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
   glyph set, not a ramp, not a colour token, not a state word, not the board's
   own rules. All of it arrives from `statusline components --json`, and a test
   greps this file and both string tables for those literals. (The Flow-stepper
   rule, on a fourth surface.)

   Loaded by app.html in the order its numeric prefix names. Classic script,
   no import/export: an ES module import carries no query string, and every
   static request here needs the per-launch session token. */

/* -------------------------------------------------------------- HOOK UI */

// The preview widths the panel offers. Not a fact about the layout — a fact
// about terminals people actually use — so it lives here rather than coming
// from the CLI.
const HK_WIDTHS = [80, 120, 160];
let HK_WIDTH = 120;
let HK_STATE = "healthy";
// Which chip's editor is open, so a re-render does not close it under the user.
let HK_OPEN = null;
// The palette's search box and its open group, both surviving a re-render for
// the same reason.
let HK_SEARCH = "";
let HK_GROUP = null;
// WHICH BOARD. The main status line, or the row Claude Code draws per subagent
// in the agent panel. The panel does not know what boards exist — `components
// --json` carries the list — it only remembers which one you are looking at, so
// a re-render does not put you back on the other one.
let HK_BOARD = "status";

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
      const edits = editSet(() => bar.paint());
      const bar = editBar(edits, {
        onApply: async (b) => {
          await applyActions(edits, b);
          edits.clear();
          rerender();
        },
        onReset: () => confirmReset(),
        onCancel: () => {
          edits.clear();
          rerender();
        },
        resetLabel: t("hookui.resetLayout"),
      });

      out.append(boardTabs(cat));
      out.append(gateCard(show, cat, edits));
      // A caution renders ABOVE the preview, never inside a tab — a caution you
      // have to hunt for is a caution nobody reads.
      if (show.errors.length || show.warnings.length) out.append(cautionCard(show, edits));
      out.append(previewCard(prev, show));
      out.append(boardCard(show, cat, edits));
      out.append(paletteCard(show, cat, edits));
      out.append(presetsCard(presets));
      out.append(advancedCard(show, cat, edits));
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
      HK_BOARD = b;
      // Opening the other board with a chip's editor still open would open a
      // drawer for an item that is not there.
      HK_OPEN = null;
      HK_SEARCH = "";
      rerender();
    });
    row.append(btn);
  }
  c.append(row);
  c.append(el("div", "note", t(HK_BOARD_SUB[HK_BOARD] || HK_BOARD_SUB.status)));
  return c;
}

function rerender() {
  const h = location.hash;
  location.hash = "#/";
  location.hash = h || "#/hookui";
}

// ── the gate ───────────────────────────────────────────────────────────────
// INVERTED from the Extra panel's. There, nothing exists until you connect;
// here the board is LIVE WHILE OFF, because you must be able to compose before
// you arm. What is gated is the switch, not the work.
function gateCard(show, cat, edits) {
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

// ── cautions ───────────────────────────────────────────────────────────────
// An error is a refusal; a warning is a fact the user then owns. They are drawn
// differently and they are never merged into one count.
function cautionCard(show, edits) {
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

// ── the preview ────────────────────────────────────────────────────────────
// Pinned above the board and never scrolled away. `orc statusline preview
// --json`'s output, rendered as DOM and never as HTML.
function previewCard(prev, show) {
  const right = el("div", "row-actions");
  for (const w of HK_WIDTHS) {
    const b = el("button", "btn btn-xs" + (HK_WIDTH === w ? " btn-primary" : " btn-ghost"), String(w));
    b.type = "button";
    b.addEventListener("click", () => {
      HK_WIDTH = w;
      rerender();
    });
    right.append(b);
  }
  const c = card(t("hookui.preview"), right);
  if (!prev || !prev.ok) {
    c.append(el("div", "note", t("hookui.previewUnavailable")));
    return c;
  }

  // The fixture picker. `--fixtures` must carry one of every state INCLUDING
  // the ugly ones — you cannot design a degraded line on a healthy session.
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

  // THE FOUR STRIPPINGS, always visible — not an afterthought tab. You cannot
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
    const re = /\[([0-9;]*)m/g;
    let last = 0;
    let m;
    const push = (s) => {
      if (!s) return;
      const span = el("span", null, s);
      if (style) span.setAttribute("style", style);
      row.append(span);
    };
    while ((m = re.exec(line))) {
      push(line.slice(last, m.index));
      style = sgrStyle(m[1], style);
      last = m.index + m[0].length;
    }
    push(line.slice(last));
    if (!row.childNodes.length) row.append(document.createTextNode(" "));
    pre.append(row);
  }
  return pre;
}

// The 16 ANSI slots, as the browser's own colours. These are NOT ORC's colour
// tokens — they are what a terminal would paint, approximated, because the
// panel cannot know the user's theme and says so.
const HK_ANSI = [
  "#000000", "#cc0000", "#4e9a06", "#c4a000", "#3465a4", "#75507b", "#06989a", "#d3d7cf",
];
const HK_ANSI_BRIGHT = [
  "#555753", "#ef2929", "#8ae234", "#fce94f", "#729fcf", "#ad7fa8", "#34e2e2", "#eeeeec",
];

function sgrStyle(codes, prev) {
  const parts = String(codes || "0").split(";").filter((x) => x !== "");
  if (!parts.length || parts[0] === "0") return null;
  const out = [];
  if (prev) out.push(prev);
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (n === 1) out.push("font-weight:700");
    else if (n === 2) out.push("opacity:.6");
    else if (n === 3) out.push("font-style:italic");
    else if (n === 4) out.push("text-decoration:underline");
    else if (n === 9) out.push("text-decoration:line-through");
    else if (n === 7) out.push("filter:invert(1)");
    else if (n >= 30 && n <= 37) out.push("color:" + HK_ANSI[n - 30]);
    else if (n >= 90 && n <= 97) out.push("color:" + HK_ANSI_BRIGHT[n - 90]);
    else if (n >= 40 && n <= 47) out.push("background:" + HK_ANSI[n - 40]);
    else if (n === 39) out.push("color:inherit");
    else if (n === 38 && parts[i + 1] === "2") {
      out.push("color:rgb(" + parts[i + 2] + "," + parts[i + 3] + "," + parts[i + 4] + ")");
      i += 4;
    } else if (n === 48 && parts[i + 1] === "2") {
      out.push("background:rgb(" + parts[i + 2] + "," + parts[i + 3] + "," + parts[i + 4] + ")");
      i += 4;
    }
  }
  return out.join(";");
}

// ── the board ──────────────────────────────────────────────────────────────
// Three drop zones. THE ILLEGAL DROP IS MADE IMPOSSIBLE rather than allowed and
// then complained about: an illegal zone renders disabled with its reason on
// the zone itself. A user should never be able to do the wrong thing and then
// be told off for it.
//
// The CLI still validates. The board is a convenience; it is never the
// guarantee.
function boardCard(show, cat, edits) {
  const c = card(t("hookui.board"));
  c.append(el("div", "note", cat.dense_prefix));

  for (const line of show.lines) {
    const legal = lineLegal(show, line.line);
    const wrap = el("div", "hk-line-wrap" + (legal ? "" : " hk-line-blocked"));
    const h = el("div", "hk-line-head");
    h.append(el("span", "hk-line-name", tn(line.line, "hookui.lineN")));
    h.append(el("span", "hk-line-count" + (line.full ? " hk-full" : ""), line.counted + "/" + cat.max_per_line));
    wrap.append(h);

    const zone = el("div", "hk-zone");
    zone.setAttribute("role", "list");
    for (const item of line.items) zone.append(chipEl(item, line, show, cat, edits));

    if (!legal.ok) {
      const blocked = el("div", "hk-blocked");
      blocked.append(el("span", "hk-caution-mark", "✕"));
      blocked.append(el("span", null, legal.why));
      zone.append(blocked);
    } else if (!line.full) {
      const add = el("button", "hk-add", t("hookui.add"));
      add.type = "button";
      add.addEventListener("click", () => {
        HK_GROUP = HK_GROUP || Object.keys(cat.groups)[0];
        const p = document.querySelector(".hk-palette-search");
        if (p) p.focus();
      });
      zone.append(add);
    }
    wrap.append(zone);

    // Per-line options. The separator is what gives a line its rhythm, and it
    // is the one line-level control worth surfacing on the board itself.
    const opts = el("div", "hk-line-opts");
    const sep = el("input", "hk-sep");
    sep.type = "text";
    sep.value = line.separator;
    sep.setAttribute("aria-label", t("hookui.separator"));
    sep.addEventListener("change", () => {
      edits.action("line" + line.line, "/api/statusline/line",
        bd({ line: line.line, separator: sep.value }),
        t("hookui.sepChange", { n: line.line, s: sep.value }));
    });
    opts.append(el("span", "note", t("hookui.separator")), sep);
    wrap.append(opts);
    c.append(wrap);
  }
  return c;
}

// The dense-prefix rule, applied to ONE line. The reason travels with the
// answer, because a disabled zone with no reason is a shrug.
function lineLegal(show, n) {
  if (n === 1) return { ok: true };
  const above = show.lines[n - 2];
  if (above && above.count > 0) return { ok: true };
  return { ok: false, why: t("hookui.fillFirst", { n: n - 1 }) };
}

// A chip shows ITS OWN RENDERED OUTPUT, not its component id — that is what the
// user is arranging. The id lives in the tooltip and in the editor header.
function chipEl(item, line, show, cat, edits) {
  const comp = (cat.components || []).find((x) => x.id === item.type);
  const wrap = el("div", "hk-chip" + (HK_OPEN === item.id ? " hk-chip-open" : ""));
  wrap.setAttribute("role", "listitem");
  wrap.setAttribute("tabindex", "0");
  wrap.title = item.type;

  const face = el("div", "hk-chip-face");
  const sample = comp && comp.previews ? comp.previews[item.render] : null;
  face.append(ansiBlock(sample || item.type, "hk-preview hk-preview-chip"));
  wrap.append(face);

  const foot = el("div", "hk-chip-foot");
  foot.append(el("span", "hk-chip-id", item.type));
  const edit = el("button", "hk-icon", "⋯");
  edit.type = "button";
  edit.title = t("hookui.edit");
  edit.addEventListener("click", () => {
    HK_OPEN = HK_OPEN === item.id ? null : item.id;
    rerender();
  });
  const rm = el("button", "hk-icon", "×");
  rm.type = "button";
  rm.title = t("hookui.remove");
  rm.addEventListener("click", () => {
    edits.action("rm" + item.id, "/api/statusline/remove",
      bd({ at: line.line + ":" + item.pos }),
      t("hookui.removed", { id: item.type }));
  });
  foot.append(edit, rm);
  wrap.append(foot);

  // THE NON-DRAG PATH, and it is not an afterthought: pointer drag is unusable
  // for a real fraction of people, so every move a drag can make is on this
  // menu and on the keyboard.
  const menu = el("div", "hk-move");
  for (const target of [1, 2, 3]) {
    if (target === line.line) continue;
    const legal = lineLegal(show, target);
    const b = el("button", "btn btn-xs btn-ghost", tn(target, "hookui.toLine"));
    b.type = "button";
    if (!legal.ok) {
      b.disabled = true;
      b.title = legal.why;
    } else {
      b.addEventListener("click", () => moveTo(item, line, target, 1, edits));
    }
    menu.append(b);
  }
  if (item.pos > 1) {
    const b = el("button", "btn btn-xs btn-ghost", "←");
    b.type = "button";
    b.title = t("hookui.moveLeft");
    b.addEventListener("click", () => moveTo(item, line, line.line, item.pos - 1, edits));
    menu.append(b);
  }
  if (item.pos < line.items.length) {
    const b = el("button", "btn btn-xs btn-ghost", "→");
    b.type = "button";
    b.title = t("hookui.moveRight");
    b.addEventListener("click", () => moveTo(item, line, line.line, item.pos + 1, edits));
    menu.append(b);
  }
  // CLONE is on every chip: two `config` chips on different keys, or two
  // token-kind chips on different kinds, is a normal thing to want.
  const cl = el("button", "btn btn-xs btn-ghost", t("hookui.clone"));
  cl.type = "button";
  cl.addEventListener("click", () =>
    edits.action("cl" + item.id, "/api/statusline/clone",
      bd({ at: line.line + ":" + item.pos }), t("hookui.cloned", { id: item.type })));
  menu.append(cl);
  // EXPAND turns a composite or a group back into its parts — which is how a
  // three-in-one chip becomes three chips the moment you want to restyle one.
  if ((comp && comp.composite) || item.type === "group") {
    const ex = el("button", "btn btn-xs btn-ghost", t("hookui.expand"));
    ex.type = "button";
    ex.addEventListener("click", () =>
      edits.action("ex" + item.id, "/api/statusline/expand",
        bd({ at: line.line + ":" + item.pos }), t("hookui.expanded", { id: item.type })));
    menu.append(ex);
  }
  wrap.append(menu);

  // Keyboard: the settled pattern, and every drag has an equivalent here. A
  // board only reachable by mouse is a board a lot of people cannot use.
  wrap.addEventListener("keydown", (ev) => {
    if (ev.key === "Delete" || ev.key === "Backspace") {
      ev.preventDefault();
      edits.action("rm" + item.id, "/api/statusline/remove",
        bd({ at: line.line + ":" + item.pos }), t("hookui.removed", { id: item.type }));
    } else if (ev.key === "e" || ev.key === "E") {
      ev.preventDefault();
      HK_OPEN = HK_OPEN === item.id ? null : item.id;
      rerender();
    } else if (ev.key === "ArrowLeft" && item.pos > 1) {
      ev.preventDefault();
      moveTo(item, line, line.line, item.pos - 1, edits);
    } else if (ev.key === "ArrowRight" && item.pos < line.items.length) {
      ev.preventDefault();
      moveTo(item, line, line.line, item.pos + 1, edits);
    } else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      const target = line.line + (ev.key === "ArrowUp" ? -1 : 1);
      if (target < 1 || target > 3) return;
      ev.preventDefault();
      const legal = lineLegal(show, target);
      // An illegal line is SKIPPED and the live region says why — never a
      // silent no-op.
      if (!legal.ok) return announce(legal.why);
      moveTo(item, line, target, 1, edits);
    }
  });

  if (HK_OPEN === item.id) wrap.append(editorDrawer(item, line, comp, cat, edits));
  return wrap;
}

function moveTo(item, line, toLine, toPos, edits) {
  edits.action("mv" + item.id, "/api/statusline/move",
    bd({ from: line.line + ":" + item.pos, to: toLine + ":" + toPos }),
    t("hookui.moved", { id: item.type, n: toLine }));
  announce(t("hookui.moved", { id: item.type, n: toLine }));
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

// ── the editor drawer ──────────────────────────────────────────────────────
// A drawer, not a modal: the preview stays visible while you edit, which is the
// entire point.
//
// NO FIELD NAMES. `min_width` and `hide_when` are the JSON's words; the drawer
// says "Min width" and "Hide when". The JSON is for the diff, the drawer is for
// the person — and the ids, renderers and state words that DO appear are the
// CLI's own and are never translated.
function editorDrawer(item, line, comp, cat, edits) {
  const d = el("div", "hk-drawer");
  if (!comp) {
    d.append(el("div", "note", t("hookui.unknownComponent")));
    return d;
  }
  const stage = (field, value, label) => {
    edits.action("set" + item.id + field, "/api/statusline/set",
      bd(Object.assign({ line: line.line, pos: item.pos }, { [field]: value })),
      label);
  };

  d.append(el("div", "hk-drawer-head", comp.id));
  if (comp.summary) d.append(el("div", "note", comp.summary));

  // THE SHAPE PICKER IS A GALLERY, NOT A DROPDOWN. Every renderer the component
  // declares, drawn with this component's real current value. A dropdown
  // containing the word `braille-bar` tells nobody anything, and this is the
  // difference between a feature people use and a settings form they close.
  d.append(el("div", "hk-section", t("hookui.shape")));
  const gallery = el("div", "hk-gallery");
  for (const r of comp.renderers) {
    const b = el("button", "hk-sample" + (item.render === r ? " hk-sample-on" : ""));
    b.type = "button";
    b.title = r;
    b.append(ansiBlock(comp.previews && comp.previews[r] ? comp.previews[r] : r, "hk-preview hk-preview-chip"));
    b.append(el("span", "hk-sample-id", r));
    b.addEventListener("click", () => stage("render", r, t("hookui.shapeChange", { id: comp.id, r })));
    gallery.append(b);
  }
  d.append(gallery);

  // The glyph set, same treatment and for the same reason.
  d.append(el("div", "hk-section", t("hookui.glyphs")));
  d.append(pickRow(cat.glyph_sets, null, (v) => stage("glyphs", v, t("hookui.glyphChange", { id: comp.id, v }))));

  d.append(el("div", "hk-section", t("hookui.words")));
  const label = el("input", "hk-input");
  label.type = "text";
  label.value = item.label == null ? "" : item.label;
  label.placeholder = t("hookui.labelPlaceholder");
  label.addEventListener("change", () => stage("label", label.value, t("hookui.labelChange", { id: comp.id, v: label.value })));
  d.append(labelled(t("hookui.label"), label));
  d.append(labelled(t("hookui.case"), pickRow(cat.cases, item.case, (v) => stage("case", v, t("hookui.caseChange", { id: comp.id, v })))));

  d.append(el("div", "hk-section", t("hookui.colour")));
  d.append(labelled(t("hookui.labelColour"), pickRow(cat.colors, item.label_color, (v) => stage("label_color", v, t("hookui.colourChange", { id: comp.id, v })))));
  d.append(labelled(t("hookui.valueColour"), pickRow(cat.colors, item.value_color, (v) => stage("value_color", v, t("hookui.colourChange", { id: comp.id, v })))));
  if (comp.bounded)
    d.append(labelled(t("hookui.ramp"), pickRow(Object.keys(cat.ramps), item.ramp, (v) => stage("ramp", v, t("hookui.rampChange", { id: comp.id, v })))));
  // R3, AT THE CONTROL, at the moment the choice is made — never in a
  // validation summary later.
  if (comp.states) d.append(el("div", "note note-warn", t("hookui.stateColourWarn", { s: comp.states.join(", ") })));

  // "Emphasis", never "font size". A terminal owns its font, and a picker that
  // did nothing would be worse than not offering one.
  d.append(labelled(t("hookui.emphasis"), pickRow(cat.emphasis.filter((e) => !cat.refused_emphasis.includes(e)), (item.emphasis || [])[0], (v) => stage("emphasis", v, t("hookui.emphasisChange", { id: comp.id, v })))));
  d.append(el("div", "note", t("hookui.fontWhy")));

  if (comp.bounded || comp.defaults.format) {
    d.append(el("div", "hk-section", t("hookui.numbers")));
    d.append(labelled(t("hookui.format"), pickRow(cat.formats, item.format, (v) => stage("format", v, t("hookui.formatChange", { id: comp.id, v })))));
    d.append(labelled(t("hookui.compact"), pickRow(cat.compact, item.compact, (v) => stage("compact", v, t("hookui.compactChange", { id: comp.id, v })))));
    d.append(el("div", "note note-warn", t("hookui.minWidthWarn")));
  }

  // A CHECKLIST, not an enum: "hide when zero" and "hide when there is no run"
  // are independent facts and a user wants both at once.
  d.append(el("div", "hk-section", t("hookui.whenToShow")));
  const checks = el("div", "hk-checks");
  const active = new Set(item.hide_when || []);
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
  d.append(checks);

  // The rest of the number controls. `min_width` is not cosmetic: a value that
  // changes width shifts every component to its right on the keystroke it
  // happens, and that jitter is the main reason people turn a status line off.
  if (comp.bounded || comp.defaults.format) {
    d.append(labelled(t("hookui.minWidth"), numField(item.min_width, 0, 8, (v) =>
      stage("min_width", v, t("hookui.minWidthChange", { id: comp.id, v })))));
    d.append(labelled(t("hookui.precision"), numField(item.precision, 0, 2, (v) =>
      stage("precision", v, t("hookui.precisionChange", { id: comp.id, v })))));
  }
  const rend = cat.renderers[item.render];
  if (rend && rend.width) {
    d.append(labelled(t("hookui.width"), numField(item.width, rend.width[0], rend.width[1], (v) =>
      stage("width", v, t("hookui.widthChange", { id: comp.id, v })))));
    d.append(el("div", "note", t("hookui.widthWhy")));
  }
  d.append(labelled(t("hookui.before"), textField(item.prefix, (v) =>
    stage("prefix", v, t("hookui.beforeChange", { id: comp.id, v })))));
  d.append(labelled(t("hookui.after"), textField(item.suffix, (v) =>
    stage("suffix", v, t("hookui.afterChange", { id: comp.id, v })))));

  // RESPONSIVE WIDTH: the range of terminal widths in which this part is worth
  // its cells. Strictly better than truncating the right of an overflowing
  // line, because the USER chooses what survives a narrow terminal.
  d.append(el("div", "hk-section", t("hookui.narrow")));
  d.append(labelled(t("hookui.minCols"), numField(item.min_cols, 0, 200, (v) =>
    stage("min_cols", v, t("hookui.minColsChange", { id: comp.id, v })))));
  d.append(labelled(t("hookui.priority"), numField(item.priority, 1, 5, (v) =>
    stage("priority", v, t("hookui.priorityChange", { id: comp.id, v })))));
  d.append(el("div", "note", t("hookui.priorityWhy")));

  // WHERE EACH VALUE CAME FROM. It is how a user finds their own overrides
  // again after a theme change — `orc lane config`'s problem, at component
  // scale.
  const ex = el("button", "btn btn-xs btn-ghost", t("hookui.explain"));
  ex.type = "button";
  ex.addEventListener("click", async () => {
    const r = await read("/api/statusline/explain?board=" + HK_BOARD + "&at=" + line.line + ":" + item.pos);
    if (!r.data || !r.data.ok) return toast(t("hookui.explainFailed"), "bad");
    const rows = r.data.resolved.map((x) => [x.field, x.source]);
    modal({ title: comp.id, body: kvList(rows), actions: [] });
  });
  d.append(ex);
  return d;
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

function labelled(name, node) {
  const row = el("div", "hk-field");
  row.append(el("span", "hk-field-name", name));
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

// ── the palette ────────────────────────────────────────────────────────────
function paletteCard(show, cat, edits) {
  const right = el("div", "row-actions");
  const search = el("input", "hk-palette-search");
  search.type = "search";
  search.value = HK_SEARCH;
  search.placeholder = t("hookui.searchPlaceholder");
  search.addEventListener("input", () => {
    HK_SEARCH = search.value;
    paint();
  });
  right.append(search);

  const c = card(t("hookui.palette"), right);
  const body = el("div", "stack");
  c.append(body);

  function paint() {
    body.replaceChildren();
    const q = HK_SEARCH.trim().toLowerCase();
    const hits = q ? cat.components.filter((x) => matches(x, q)) : null;
    if (hits) {
      body.append(el("div", "note", tn(hits.length, "hookui.matches")));
      for (const comp of hits) body.append(paletteRow(comp, show, cat, edits));
      if (!hits.length) body.append(empty(t("hookui.noMatch")));
      return;
    }
    for (const [g, name] of Object.entries(cat.groups)) {
      const rows = cat.components.filter((x) => x.group === g);
      if (!rows.length) continue;
      const inner = el("div");
      for (const comp of rows) inner.append(paletteRow(comp, show, cat, edits));
      body.append(collapsible({
        title: name,
        count: String(rows.length),
        content: inner,
        collapsed: HK_GROUP !== g,
      }));
    }
  }
  paint();
  return c;
}

// Fuzzy plus INITIALISM: with 128 components a substring search is not enough —
// `cw` should find `cache-write`, which plain substring matching does not.
function matches(comp, q) {
  const id = comp.id.toLowerCase();
  if (id.includes(q)) return true;
  if ((comp.summary || "").toLowerCase().includes(q)) return true;
  const initials = id.split("-").map((p) => p[0]).join("");
  if (initials.startsWith(q)) return true;
  let i = 0;
  for (const ch of id) if (ch === q[i]) i++;
  return i === q.length;
}

function paletteRow(comp, show, cat, edits) {
  const row = el("div", "hk-prow");
  row.append(el("span", "hk-prow-id", comp.id));
  // The cost chip is the CLI's own word. A friendlier synonym would be a state
  // that does not exist.
  row.append(chip(comp.cost, comp.cost === "refused" ? "bad" : null));
  const sample = comp.previews && comp.previews[comp.defaults.render];
  row.append(ansiBlock(sample || "", "hk-preview hk-preview-chip"));

  // A REFUSED component gets NO BUTTON AT ALL, never a disabled one — the same
  // rule a connected tool's Connect button follows. "We decided against this"
  // and "we forgot" must not look the same, which is why the row exists at all.
  if (comp.cost === "refused") {
    row.append(el("div", "note note-warn hk-prow-why", comp.refused_reason));
    return row;
  }
  const acts = el("div", "row-actions");
  for (const n of [1, 2, 3]) {
    const legal = lineLegal(show, n);
    const line = show.lines[n - 1];
    const b = el("button", "btn btn-xs btn-ghost", tn(n, "hookui.addTo"));
    b.type = "button";
    if (!legal.ok) {
      b.disabled = true;
      b.title = legal.why;
    } else if (line.full) {
      b.disabled = true;
      b.title = t("hookui.lineFull", { n });
    } else {
      b.addEventListener("click", () =>
        edits.action("add" + comp.id + n, "/api/statusline/set",
          bd({ line: n, pos: line.items.length + 1, type: comp.id }),
          t("hookui.added", { id: comp.id, n })));
    }
    acts.append(b);
  }
  row.append(acts);
  return row;
}

// ── presets ────────────────────────────────────────────────────────────────
// Directly below the gate — the `orc diy` presets position. Applying one
// REPLACES the layout, so it is always confirmed and the loss is NAMED.
function presetsCard(presets) {
  const c = card(t("hookui.presets"));
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
      b.addEventListener("click", () => confirmApply(p.name));
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
      { label: t("common.cancel"), kind: "ghost" },
      {
        label: t("hookui.apply"),
        kind: "primary",
        onClick: async () => {
          const r = await post("/api/statusline/apply", bd({ name }));
          if (!r.ok) toast(t("hookui.applyFailed"), "bad", (r.output || "").trim());
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
      { label: t("common.cancel"), kind: "ghost" },
      {
        label: t("hookui.resetLayout"),
        kind: "primary",
        onClick: async () => {
          await post("/api/statusline/reset", bd({}));
          rerender();
        },
      },
    ],
  });
}

// ── advanced ───────────────────────────────────────────────────────────────
function advancedCard(show, cat, edits) {
  const c = card(t("hookui.advanced"));
  c.append(labelled(t("hookui.theme"), pickRow(Object.keys(cat.themes), show.theme, (v) =>
    edits.action("theme", "/api/statusline/line", bd({ line: 1, theme: v }), t("hookui.themeChange", { v })))));

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
