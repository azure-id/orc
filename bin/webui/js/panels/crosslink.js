"use strict";
/* panels/crosslink.js — orc ui client
   Design and Settings. VAULT.W/H must stay the same box as .vault-node's CSS
   width/height — a test asserts it and re-runs ringRadii over n=1..16.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

/* =============================================================== CROSSLINK == */

PANELS.crosslink = function (host) {
  head(host, t("crosslink.title"), t("crosslink.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderCrosslink(body);
};

// TWO TABS (v0.43.7): DESIGN is the picture of the boundary, SETTINGS is every
// control. They were one scrolling column, which made the diagram something you
// scrolled past on the way to the add form rather than the thing you came for.
//
// With nothing linked yet there is no picture to draw, so Settings opens
// selected and its tab is spotlighted — Design stays reachable and says, in the
// empty state, exactly which tab makes it appear.
async function renderCrosslink(body) {
  body.replaceChildren(skeleton(5));
  const d = (await read("/api/crosslink")).data;
  const live = d.configured && d.nodes.length > 0;

  const tabs = el("div", "tabs");
  // `stack` as well as `tab-pane`: the Settings tab holds several cards, and
  // the container is what spaces panel blocks — see `.stack` in app.css.
  const pane = el("div", "tab-pane stack");
  const views = {
    design: () => designView(d, live, () => select("settings")),
    settings: () => settingsView(d, body),
  };
  const select = async (which) => {
    for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.tab === which));
    pane.replaceChildren(skeleton(3));
    const built = await views[which]();
    pane.replaceChildren(built);
  };
  // Keys are written out in full, never assembled from the tab id — a key built
  // from a fragment is invisible to every check that looks for one.
  for (const [which, label] of [["design", t("crosslink.tab.design")], ["settings", t("crosslink.tab.settings")]]) {
    const b = el("button", null, label);
    b.type = "button";
    b.dataset.tab = which;
    // The spotlight is the answer to "there is nothing here" — it points at the
    // one tab that can change that, and it is dropped the moment a link exists.
    if (!live && which === "settings") b.classList.add("tab-spot");
    b.addEventListener("click", () => select(which));
    tabs.append(b);
  }
  body.replaceChildren(tabs, pane);
  select(live ? "design" : "settings");
}

function designView(d, live, gotoSettings) {
  const out = frag();
  if (!live) {
    const e = empty(t("crosslink.design.empty"), t("crosslink.design.emptyHint"));
    const go = el("button", "btn btn-sm btn-primary", t("crosslink.design.emptyCta"));
    go.type = "button";
    go.addEventListener("click", gotoSettings);
    e.append(go);
    out.append(e);
    return out;
  }
  out.append(vaultCard(d));
  return out;
}

async function settingsView(d, body) {
  const out = frag();

  if (!d.configured) {
    out.append(empty(t("crosslink.empty"), t("crosslink.emptyHint")));
    out.append(await addLinkCard(d, body));
    return out;
  }

  const head2 = card(t("crosslink.graph"));
  head2.append(
    kvList(
      [
        [t("crosslink.self"), d.self],
        [t("crosslink.config"), d.config_path],
        [t("crosslink.needs"), d.needs_baseline || t("crosslink.needsNone")],
      ],
      true
    )
  );
  out.append(head2);

  out.append(await addLinkCard(d, body));

  for (const n of d.nodes) {
    const c = el("div", "action");
    c.dataset.node = n.name; // paired with the graph node above on hover
    const left = el("div");
    const name = el("div", "setting-name");
    name.append(document.createTextNode(n.name));
    name.append(
      chip(
        n.direction === "consume" ? t("crosslink.weCall") : n.direction === "provide" ? t("crosslink.theyCall") : t("crosslink.noEdge"),
        n.direction === "consume" ? "info" : n.direction === "provide" ? "" : "warn"
      )
    );
    left.append(name);
    // repo_path and kind ids come straight from the config file.
    left.append(el("div", "setting-desc", n.repo_path + (n.kinds.length ? "  ·  kinds: " + n.kinds.join(", ") : "")));
    const pv = n.provider || {};
    if (pv.state === "missing") left.append(el("div", "note", t("crosslink.state.missing")));
    else if (pv.state === "no-wiki") left.append(el("div", "note", t("crosslink.state.noWiki")));
    else if (pv.state === "unregistered") left.append(el("div", "note", t("crosslink.state.unregistered")));
    else if (pv.state === "corrupt") left.append(el("div", "note", t("crosslink.state.corrupt")));
    else if (n.direction === "provide") left.append(el("div", "note", t("crosslink.state.inbound")));
    else {
      const row = el("div", "row-actions");
      row.append(chip(pv.tier || t("overview.tile.wikiUnknown"), pv.tier === "FRESH" ? "ok" : pv.tier === "AGING" ? "warn" : "bad", pv.tier === "STALE"));
      row.append(el("span", "note", t("crosslink.peerNote", { scan: pv.last_scan || "?", tags: pv.tags || 0 })));
      left.append(row);
      if (!pv.tags) left.append(el("div", "note", t("crosslink.noTags", { path: n.repo_path })));
    }
    const rm = el("button", "btn btn-sm btn-danger", t("common.remove"));
    rm.type = "button";
    rm.addEventListener("click", () => confirmRemove(n.name, body));
    c.append(left, rm);
    out.append(c);
  }

  if (d.links.length) {
    const lc = card(t("crosslink.edges"));
    for (const l of d.links) lc.append(el("div", "note", `${l.from} ──${l.via}──▶ ${l.to}   (${l.relation.replace(/-/g, " ")})`));
    out.append(lc);
  }

  return out;
}

/* ------------------------------------------------------- the vault graph -- */

// THE DESIGN TAB (v0.43.7). Self in the middle, every linked repo on a ring
// around it, one line per edge drawn in the direction it actually points, and a
// pulse travelling that line so "which way does this one go" is answered by
// motion instead of by reading an arrow glyph.
//
// The layout is COMPUTED, not simulated: peer i sits at a fixed angle for a
// given node count, so the same config draws the same picture every time you
// open the tab. A physics sim would be prettier to poke and useless to compare.
//
// THE LAYOUT IS SOLVED IN PIXELS FROM THE REAL BOX SIZE, and that is the whole
// fix in v0.43.7's first patch. Placing fixed-pixel boxes on a ring whose radius
// was a FRACTION of the container ("0.34 of the height") is a guess: nothing in
// it knows how wide a repo box is, so at three peers the boxes overlapped and
// the picture was unreadable. Repo boxes are a fixed size now and the radii are
// derived from that size, so separation is a property of the layout rather than
// a value that happened to look right in one screenshot. See ringRadii().
//
// Edges carry pathLength="1", so the draw-in and the travelling pulse are
// written as fractions of the line and never need its length measured.

// Fixed box metrics. Fixed is what makes the geometry solvable — a box that
// sizes to its longest repo name cannot be spaced by arithmetic, only measured
// and re-measured. Long names ellipsis instead.
const VAULT = { W: 156, H: 78, GAP: 20, PAD: 24 };

// The smallest ellipse on which no two boxes — and no box and the hub — can
// overlap.
//
// Two axis-aligned boxes miss each other when |dx| >= W+GAP OR |dy| >= H+GAP.
// For neighbours Δ apart on the ring with midangle m:
//     dx = rx·2sin(Δ/2)·|sin m|      dy = ry·2sin(Δ/2)·|cos m|
// One of |sin m|, |cos m| is always at least 1/√2, so scaling both radii by √2
// makes whichever term is doing the work clear its threshold on its own. The
// same √2 as a FLOOR handles the hub, which sits at the centre and is a box too.
// Wider angular gaps only push boxes further apart, so neighbours are the worst
// case and checking them is enough.
function ringRadii(n) {
  const needX = Math.SQRT2 * (VAULT.W + VAULT.GAP);
  const needY = Math.SQRT2 * (VAULT.H + VAULT.GAP);
  // n === 1 has no neighbour pair — and sin(π/1) is 0, so the general form
  // divides by zero. One peer only ever has to clear the hub.
  const sep = n > 1 ? 2 * Math.sin(Math.PI / n) : Infinity;
  return { rx: Math.max(needX, needX / sep), ry: Math.max(needY, needY / sep) };
}

function vaultCard(d) {
  const summary = t(d.nodes.length === 1 && d.links.length === 1 ? "crosslink.repos" : "crosslink.reposPlural", {
    repos: d.nodes.length,
    edges: d.links.length,
  });
  const c = card(t("crosslink.design.title"), chip(summary, "info"));
  c.append(el("div", "note", t("crosslink.design.note")));

  const n = d.nodes.length;
  const { rx, ry } = ringRadii(n);
  // Lay out around an origin first, then size the canvas to what was actually
  // placed. Deriving it from the radii instead would pad for a full ellipse even
  // when the ring only uses part of one — a single peer would sit in a box wide
  // enough for six. The ring opens at -90°, so peer 0 is directly above.
  const at = [[0, 0]]; // the hub
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    at.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  const half = [VAULT.W / 2, VAULT.H / 2];
  const bound = (axis) => {
    const lo = Math.min(...at.map((p) => p[axis] - half[axis]));
    const hi = Math.max(...at.map((p) => p[axis] + half[axis]));
    return [lo, hi - lo];
  };
  const [minX, spanX] = bound(0);
  const [minY, spanY] = bound(1);
  const boxW = Math.round(spanX + 2 * VAULT.PAD);
  const boxH = Math.round(spanY + 2 * VAULT.PAD);
  // Origin-relative → canvas pixels.
  const put = (p) => [p[0] - minX + VAULT.PAD, p[1] - minY + VAULT.PAD];

  // Positions are pixel centres. `self` and the repo's real name both map to the
  // hub because a link may name this repo either way.
  const hub = put(at[0]);
  const pos = { [d.self]: hub, self: hub };
  d.nodes.forEach((node, i) => {
    pos[node.name] = put(at[i + 1]);
  });

  // A ring big enough not to collide can be wider than the panel. That is a
  // scroll, not a reason to squeeze the boxes back together.
  const scroll = el("div", "scroll-x");
  const wrap = el("div", "vault");
  wrap.style.width = boxW + "px";
  wrap.style.height = boxH + "px";

  const svg = svgEl("svg", { class: "vault-edges", viewBox: `0 0 ${boxW} ${boxH}` });
  d.links.forEach((l, i) => {
    // `from`/`to` may name this repo either as the literal "self" or by its
    // real name — the config accepts both, so the position map holds both.
    const a = pos[l.from];
    const b = pos[l.to];
    if (!a || !b) return; // an edge naming a repo that is not in the graph
    const g = svgEl("g", { class: "vault-edge", "data-a": l.from, "data-b": l.to });
    g.style.setProperty("--d", i * 140 + "ms");
    // The canvas is a known pixel size, so the viewBox is 1:1 with it and the
    // endpoints go straight in — no measuring pass, and no stretched viewBox
    // squashing the labels and strokes.
    const ends = { x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1), pathLength: "1" };
    g.append(svgEl("line", { ...ends, class: "vault-line" }));
    // The pulse runs from → to, which IS the direction of the dependency.
    g.append(svgEl("line", { ...ends, class: "vault-pulse" }));
    if (l.via) {
      // Nudged off the line so the label sits beside it, not on top of it.
      const label = svgEl("text", {
        class: "vault-via",
        x: ((a[0] + b[0]) / 2).toFixed(1),
        y: ((a[1] + b[1]) / 2 - 8).toFixed(1),
        "text-anchor": "middle",
      });
      label.textContent = l.via;
      g.append(label);
    }
    svg.append(g);
  });
  wrap.append(svg);

  const place = (node, p, i) => {
    node.style.left = p[0].toFixed(1) + "px";
    node.style.top = p[1].toFixed(1) + "px";
    node.style.setProperty("--d", i * 90 + "ms");
    wrap.append(node);
  };

  const self = el("div", "vault-node vault-hub");
  self.append(el("span", "vault-name", d.self), el("span", "vault-sub", t("crosslink.design.thisRepo")));
  place(self, pos[d.self], 0);

  d.nodes.forEach((node, i) => {
    const box = el("button", "vault-node vault-" + (node.direction || "none"));
    box.type = "button";
    box.dataset.name = node.name;
    box.append(el("span", "vault-name", node.name));
    box.append(el("span", "vault-sub", node.repo_path));
    const pv = node.provider || {};
    // The chip carries the CLI's own state word, so the picture and `orc
    // crosslink list` always say the same thing.
    const state =
      pv.state === "missing" ? ["missing", "bad"] :
      pv.state === "no-wiki" ? ["no wiki", "warn"] :
      pv.state === "unregistered" ? ["unregistered", "warn"] :
      pv.state === "corrupt" ? ["corrupt", "bad"] :
      node.direction === "provide" ? ["inbound", ""] :
      [pv.tier || "linked", pv.tier === "FRESH" ? "ok" : pv.tier === "AGING" ? "warn" : "bad"];
    box.append(chip(state[0], state[1]));
    box.title = `${node.name} — ${node.repo_path}`;

    // Hovering a repo lights the edges it is an end of, so a busy ring can still
    // be read one repo at a time.
    const hi = (onOff) => {
      box.classList.toggle("vault-hi", onOff);
      for (const g of svg.querySelectorAll(".vault-edge")) {
        if (g.dataset.a === node.name || g.dataset.b === node.name) g.classList.toggle("edge-hi", onOff);
        else g.classList.toggle("edge-dim", onOff);
      }
    };
    box.addEventListener("mouseenter", () => hi(true));
    box.addEventListener("mouseleave", () => hi(false));
    box.addEventListener("focus", () => hi(true));
    box.addEventListener("blur", () => hi(false));
    // Clicking a repo is a question about that repo — the answer (its state, its
    // kinds, the Remove button) lives on the Settings tab, so go there.
    box.addEventListener("click", () => {
      const tab = document.querySelector('.tabs button[data-tab="settings"]');
      if (!tab) return;
      tab.click();
      setTimeout(() => {
        const row = document.querySelector('.action[data-node="' + node.name + '"]');
        if (!row) return;
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("linked-hi");
        setTimeout(() => row.classList.remove("linked-hi"), 1600);
      }, 120);
    });
    place(box, pos[node.name], i + 1);
  });

  scroll.append(wrap);
  c.append(scroll);
  return c;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  return node;
}

// The add form. It mirrors the interactive CLI prompt field for field, and it
// submits to the CLI rather than writing YAML — so the errors shown here are
// the CLI's own, not a second opinion about what is valid.
async function addLinkCard(d, body) {
  const c = card(t("crosslink.add.title"));
  c.append(el("div", "note", t("crosslink.add.note")));

  const form = el("div", "linkform");
  const mk = (labelText, node, hint) => {
    // `label` wraps its control, and a label that CONTAINS a button steals that
    // button's click — so the path row (input + Browse) is a plain div instead.
    const f = el(node.dataset && node.dataset.nolabel ? "div" : "label", "field");
    f.append(el("span", "field-label", labelText));
    f.append(node);
    if (hint) f.append(el("span", "field-hint", hint));
    return f;
  };

  const name = el("input", "text-input");
  name.placeholder = "service-z";

  // THE PATH FIELD (v0.43.6). A hand-typed path is the one field here whose
  // mistakes are invisible: the CLI accepts an unresolvable path on purpose
  // (it saves a PENDING edge that resolves later), so a typo does not fail —
  // it just silently never links. The Browse button removes the typo entirely.
  // It is still a plain text input: browsing is an ADDITION, never the only
  // way in, and pasting a path you already know stays the fastest route.
  const repoPath = el("input", "text-input");
  repoPath.placeholder = "../service-z";
  const pathRow = el("div", "path-row");
  pathRow.dataset.nolabel = "1";
  const browse = el("button", "btn btn-sm", t("crosslink.add.browse"));
  browse.type = "button";
  browse.addEventListener("click", () =>
    pickFolder((rel) => {
      repoPath.value = rel;
      syncCmd();
    })
  );
  pathRow.append(repoPath, browse);

  // The catalog comes from the CLI so the picker can never drift from it.
  let kinds = [];
  try {
    kinds = (await read("/api/crosslink/kinds")).data.kinds || [];
  } catch (_) {}
  const kindBox = el("div", "kind-picker");
  const picked = new Set();
  for (const k of kinds) {
    const b = el("button", "kind", k);
    b.type = "button";
    b.addEventListener("click", () => {
      if (picked.has(k)) picked.delete(k);
      else picked.add(k);
      b.classList.toggle("kind-on", picked.has(k));
      syncVia();
    });
    kindBox.append(b);
  }
  const custom = el("input", "text-input");
  custom.placeholder = t("crosslink.add.customHint");

  const dirSeg = el("div", "seg");
  let direction = "calls";
  const self = d.self || "this repo";
  const dirs = [
    ["calls", t("crosslink.add.dirCalls", { self })],
    ["called-by", t("crosslink.add.dirCalledBy", { self })],
  ];
  for (const [val, label] of dirs) {
    const b = el("button", null, label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(val === direction));
    b.addEventListener("click", () => {
      direction = val;
      for (const other of dirSeg.children) other.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-pressed", "true");
    });
    dirSeg.append(b);
  }

  const via = el("select", "text-input");
  const syncVia = () => {
    const all = [...picked, ...custom.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)];
    via.replaceChildren();
    for (const k of [...new Set(all)]) {
      const o = el("option", null, k);
      o.value = k;
      via.append(o);
    }
    via.disabled = !all.length;
  };
  custom.addEventListener("input", syncVia);
  syncVia();

  form.append(
    mk(t("crosslink.add.name"), name, t("crosslink.add.nameHint")),
    mk(t("crosslink.add.path"), pathRow, t("crosslink.add.pathHint")),
    mk(t("crosslink.add.kinds"), kindBox, t("crosslink.add.kindsHint")),
    mk(t("crosslink.add.custom"), custom),
    mk(t("crosslink.add.direction"), dirSeg, t("crosslink.add.directionHint")),
    mk(t("crosslink.add.via"), via, t("crosslink.add.viaHint"))
  );
  c.append(form);

  const err = el("div", "input-err");
  const actions = el("div", "row-actions");
  const save = el("button", "btn btn-primary", t("crosslink.add.save"));
  save.type = "button";
  const cmdPreview = el("code", "action-cmd", "");
  const syncCmd = () => {
    const all = [...picked, ...custom.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)];
    cmdPreview.textContent =
      `orc crosslink add ${name.value || "<name>"} ${repoPath.value || "<path>"} ` +
      `--kinds ${all.join(",") || "<kinds>"} --direction ${direction}` +
      (via.value ? ` --via ${via.value}` : "");
  };
  for (const n of [name, repoPath, custom]) n.addEventListener("input", syncCmd);
  via.addEventListener("change", syncCmd);
  kindBox.addEventListener("click", syncCmd);
  dirSeg.addEventListener("click", syncCmd);
  syncCmd();

  save.addEventListener("click", async () => {
    err.textContent = "";
    const all = [...picked, ...custom.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)];
    // Only the empties are caught here. Everything about VALIDITY — the slug
    // shape, a taken name, an unknown target — is the CLI's call, reported below.
    if (!name.value.trim() || !repoPath.value.trim() || !all.length) {
      err.textContent = t("crosslink.add.required");
      return;
    }
    save.disabled = true;
    save.textContent = t("crosslink.add.saving");
    try {
      const r = await post("/api/crosslink/add", {
        name: name.value.trim(),
        repo_path: repoPath.value.trim(),
        kinds: all.join(","),
        direction,
        via: via.value || all[0],
      });
      if (!r.ok) {
        // The CLI's own rejection text wins over ours whenever there is one.
        err.textContent = r.output || t("crosslink.add.refused");
        save.disabled = false;
        save.textContent = t("crosslink.add.save");
        return;
      }
      toast(t("crosslink.add.linked", { name: name.value.trim() }), "ok", r.output);
      await renderCrosslink(body);
      // The new node draws itself in — the one moment where motion is the
      // feedback that the link now exists.
      const fresh = document.querySelector('.graph-node[data-name="' + name.value.trim() + '"]');
      if (fresh) fresh.classList.add("graph-new");
    } catch (e) {
      err.textContent = String(e.message);
      save.disabled = false;
      save.textContent = t("crosslink.add.save");
    }
  });
  actions.append(save);
  c.append(cmdPreview, err, actions);
  return c;
}

/* --- the folder picker ------------------------------------------------------
   A browser cannot hand back a real filesystem path — `<input type="file"
   webkitdirectory>` gives a folder NAME and nothing above it, which is exactly
   the part a relative repo path needs. So the picker walks the filesystem on
   the SERVER (`/api/fs/list`, directory names only) and the browser just
   renders it. That also makes it identical on Windows and macOS: the server
   knows the real separator and computes the stored relative path itself, so
   nothing here has to guess whether to write `..\peer` or `../peer`.

   It never picks a FILE and never opens one. `onPick` receives the relative
   path the crosslink config will store — the same string you would have typed. */
function pickFolder(onPick) {
  const body = el("div", "stack stack-sm");
  const crumbs = el("div", "picker-crumbs");
  const listBox = el("div", "picker-list");
  const foot = el("div", "picker-foot");
  const relLine = el("div", "note");
  body.append(crumbs, listBox, relLine, foot);

  let current = null; // the listing payload for the folder on screen

  const choose = el("button", "btn btn-primary btn-allow-busy", t("picker.choose"));
  choose.type = "button";
  choose.disabled = true;

  const go = async (path) => {
    listBox.replaceChildren(skeleton(6));
    let d;
    try {
      d = (await read("/api/fs/list" + (path ? "?path=" + encodeURIComponent(path) : ""))).data;
    } catch (e) {
      listBox.replaceChildren(empty(t("picker.unreadable"), String(e.message)));
      return;
    }
    current = d;

    // Breadcrumbs: the shortcuts you actually want (up, home, this project)
    // rather than a clickable path split on the separator, which on Windows is
    // a row of one-letter targets.
    crumbs.replaceChildren();
    const crumb = (label, target, disabled) => {
      const b = el("button", "btn btn-ghost btn-sm", label);
      b.type = "button";
      b.disabled = !target || disabled;
      b.addEventListener("click", () => go(target));
      return b;
    };
    crumbs.append(crumb("↑ " + t("picker.up"), d.parent));
    crumbs.append(crumb(t("picker.home"), d.home));
    if (d.project_root) crumbs.append(crumb(t("picker.project"), d.project_root));
    crumbs.append(el("code", "picker-path", d.path));

    listBox.replaceChildren();
    if (d.error) {
      listBox.append(empty(t("picker.unreadable"), d.error));
    } else if (!d.dirs.length) {
      listBox.append(empty(t("picker.empty")));
    } else {
      for (const dir of d.dirs) {
        const row = el("button", "picker-item");
        row.type = "button";
        row.append(el("span", "picker-icon", dir.is_repo ? "◆" : "▸"));
        const mid = el("div");
        mid.append(el("div", "picker-name", dir.name));
        const tags = el("div", "picker-tags");
        // The two facts that decide whether linking this folder is useful.
        if (dir.is_repo) tags.append(chip(t("picker.isRepo"), "info"));
        if (dir.has_wiki) tags.append(chip(t("picker.hasWiki"), "ok"));
        if (d.project_root && dir.path === d.project_root) tags.append(chip(t("picker.sameRepo"), "warn"));
        mid.append(tags);
        row.append(mid, el("span", "picker-into", "→"));
        // Single click NAVIGATES into the folder; "Use this folder" selects the
        // one you are standing in. One gesture per meaning, so a click never
        // both descends and commits.
        row.addEventListener("click", () => go(dir.path));
        listBox.append(row);
      }
    }

    const isSelf = d.is_project_root;
    choose.disabled = !!d.error || isSelf;
    relLine.textContent = d.error
      ? ""
      : isSelf
      ? t("picker.sameRepo")
      : t("picker.relative", { rel: d.relative });
    relLine.classList.toggle("picker-warn", isSelf);
  };

  choose.addEventListener("click", () => {
    if (!current || current.is_project_root) return;
    onPick(current.relative);
    close();
  });
  foot.append(choose);

  const close = modal({
    title: t("picker.title"),
    body,
    actions: [{ label: t("common.cancel"), onClick: (c) => c() }],
  });
  body.insertBefore(el("div", "note", t("picker.note")), crumbs);
  // Start one level ABOVE the project: a linked repo is almost always a sibling.
  go(metaInfo.project_root ? metaInfo.project_root + "/.." : "");
  return close;
}

function confirmRemove(name, body) {
  const b = el("div");
  b.append(el("div", null, t("crosslink.remove.body", { name })));
  b.append(el("div", "note", t("crosslink.remove.note")));
  b.append(el("div", "action-cmd", `orc crosslink remove ${name}`));
  const close = modal({
    title: t("crosslink.remove.title"),
    body: b,
    actions: [
      { label: t("common.cancel"), onClick: (c) => c() },
      {
        label: t("common.remove"),
        cls: "btn-danger",
        onClick: async (c) => {
          const r = await post("/api/crosslink/remove", { name });
          toast(r.command, r.ok ? "ok" : "bad", r.output);
          c();
          renderCrosslink(body);
        },
      },
    ],
  });
  return close;
}

/* =================================================================== LEARN == */

/* ONE THING AT A TIME (v0.43.6).
   This panel used to stack all eight walkthrough sections as eight boxes of
   monospace text, every one of them open. That is the whole document dumped on
   screen: nothing is emphasised, so nothing is read, and finding the section
   you wanted meant scrolling through the seven you did not.

   A walkthrough has a natural shape — it is ORDERED, and you are at a position
   in it. So the panel now shows a CONTENTS rail and exactly one section, with
   Previous / Next, a progress bar, and a search that filters the rail rather
   than the page. The content is unchanged: it is the same `bin/onboarding-
   content.js` the terminal prints, which is the point — one source, two
   surfaces.

   Where you are is remembered per browser, so switching panels and coming back
   does not restart the walkthrough. */
