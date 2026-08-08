"use strict";
/* ===========================================================================
   app.js — orc ui client
   ---------------------------------------------------------------------------
   Four rules keep this hackable (the plan, §9):
     1. No build step. Edit, refresh.
     2. Panels are INDEPENDENT — each is its own render function against its own
        endpoint, with no shared mutable state. Rewriting Runs must not be able
        to break Settings.
     3. Everything rendered comes from `bin/cli.js --json`. No knowledge about
        ORC is encoded here that the CLI does not already own — notably the
        config key list, the score ladder and the shadowing rules.
     4. All motion is CSS. This file toggles classes; app.css owns the timing,
        and `prefers-reduced-motion` turns the lot off.
   =========================================================================== */

/* ------------------------------------------------------------ fetch layer -- */

// The per-launch token arrives in the opened URL and is required on every /api
// call. It is kept in memory and stripped from the visible address bar so it
// does not end up in a screenshot or a pasted link.
const TOKEN = new URLSearchParams(location.search).get("t") || "";
try {
  if (TOKEN) history.replaceState(null, "", location.pathname + location.hash);
} catch (_) {}

async function api(path, opts) {
  const res = await fetch(path, {
    method: (opts && opts.method) || "GET",
    headers: Object.assign({ "x-orc-token": TOKEN }, opts && opts.body ? { "content-type": "application/json" } : {}),
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch (_) {}
  if (!res.ok) throw new Error((payload && payload.error) || `request failed (${res.status})`);
  return payload;
}

// Reads unwrap to `.data`; a non-zero exit is DATA for several commands, never
// an error, so it is passed through beside the payload.
async function read(path) {
  const r = await api(path);
  return { data: r.data, exit: r.exit_code, ok: r.ok, fixture: !!r.fixture };
}

const post = (path, body) => api(path, { method: "POST", body });

/* ----------------------------------------------------------------- utils -- */

const $ = (sel, root) => (root || document).querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const frag = () => document.createDocumentFragment();

// Everything user-visible goes through textContent, so no value from disk is
// ever parsed as markup.
function esc(s) {
  return String(s === null || s === undefined ? "" : s);
}

function relAge(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hours ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

function chip(text, kind, pulse) {
  const c = el("span", "chip" + (kind ? " chip-" + kind : "") + (pulse ? " chip-pulse" : ""), text);
  return c;
}

function card(title, right) {
  const c = el("div", "card");
  if (title) {
    const head = el("div", "card-head");
    head.append(el("h2", null, title));
    if (right) head.append(right);
    c.append(head);
  }
  return c;
}

function kvList(rows) {
  const dl = el("dl", "kv");
  for (const [k, v] of rows) {
    if (v === undefined || v === null || v === "") continue;
    dl.append(el("dt", null, k), el("dd", null, esc(v)));
  }
  return dl;
}

function skeleton(n) {
  const f = frag();
  for (let i = 0; i < (n || 4); i++) f.append(el("div", "skeleton" + (i % 3 === 2 ? " w-60" : i % 3 === 1 ? " w-40" : "")));
  return f;
}

function empty(msg, hint) {
  const box = el("div", "empty");
  box.append(el("div", null, msg));
  if (hint) box.append(el("div", "note", hint));
  return box;
}

function toast(msg, kind, detail) {
  const t = el("div", "toast" + (kind ? " toast-" + kind : ""));
  t.append(el("div", null, msg));
  if (detail) t.append(el("pre", null, detail.slice(0, 900)));
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "bad" ? 9000 : 4200);
}

function copy(text, label) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast((label || "Copied") + " to clipboard.", "ok"))
    .catch(() => toast("Could not reach the clipboard — select the text and copy by hand.", "bad"));
}

/* ----------------------------------------------------------------- modal -- */

function modal({ title, body, actions }) {
  const host = $("#modal-host");
  $("#modal-title").textContent = title;
  const b = $("#modal-body");
  const f = $("#modal-foot");
  b.replaceChildren(body);
  f.replaceChildren();
  for (const a of actions) {
    const btn = el("button", "btn btn-allow-busy " + (a.cls || ""), a.label);
    btn.type = "button";
    if (a.id) btn.id = a.id;
    btn.disabled = !!a.disabled;
    btn.addEventListener("click", () => a.onClick(closeModal));
    f.append(btn);
  }
  host.hidden = false;
  const onKey = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", onKey);
  $("#modal-backdrop").onclick = closeModal;
  function closeModal() {
    host.hidden = true;
    document.removeEventListener("keydown", onKey);
  }
  return closeModal;
}

/* ---------------------------------------------------------------- banners -- */

// The ONE thing that must be visible on every panel: config does NOT merge, so
// a global install can win skill resolution while this panel edits a project
// file nothing reads. Reported here, never fixed here — this UI never edits
// global config, by design.
async function renderBanners() {
  const host = $("#banners");
  host.replaceChildren();
  let doctor;
  try {
    doctor = (await read("/api/doctor")).data;
  } catch (_) {
    return;
  }
  if (!doctor) return;
  const g = doctor.global_install || {};
  if (g.present && g.shadows) {
    const finding = (doctor.findings || []).find((f) => f.id === "global-skew" || f.id === "global-retired-agents");
    const b = el("div", "banner");
    const body = el("div");
    body.append(el("strong", null, "A global ORC install exists at ~/.claude and may win skill resolution."));
    body.append(
      el(
        "div",
        null,
        "These project settings may not be the ones your runs read. This panel never edits global config — it reports the conflict."
      )
    );
    if (finding) body.append(el("div", "note", finding.message));
    body.append(el("div", "note", "Check it with: orc doctor"));
    b.append(body);
    host.append(b);
  }
}

/* ----------------------------------------------------------------- router -- */

const PANELS = {};
let currentPanel = null;

function route() {
  const name = (location.hash.replace(/^#\//, "") || "overview").split("?")[0];
  const panel = PANELS[name] ? name : "overview";
  currentPanel = panel;
  for (const a of document.querySelectorAll("#nav a"))
    a.setAttribute("aria-current", a.dataset.panel === panel ? "page" : "false");
  const host = $("#panel");
  host.replaceChildren();
  // Re-trigger the 180ms panel animation on every navigation.
  host.style.animation = "none";
  void host.offsetHeight;
  host.style.animation = "";
  PANELS[panel](host);
  renderBanners();
}

function head(host, title, sub, right) {
  const h = el("div", "page-head");
  const left = el("div");
  left.append(el("h1", null, title));
  if (sub) left.append(el("div", "page-sub", sub));
  h.append(left);
  if (right) h.append(right);
  host.append(h);
  return h;
}

// Every panel body is rendered async; this keeps the skeleton/error handling in
// ONE place instead of nine.
async function section(host, loader, render) {
  const slot = el("div");
  slot.append(skeleton(4));
  host.append(slot);
  try {
    const data = await loader();
    const out = render(data);
    slot.replaceChildren(out || el("div"));
  } catch (e) {
    slot.replaceChildren(empty("Could not load this panel.", String(e.message)));
  }
  return slot;
}

/* ================================================================ OVERVIEW == */

PANELS.overview = function (host) {
  head(host, "Overview", "Install health, knowledge state and what is waiting for you.");
  section(
    host,
    () => read("/api/overview").then((r) => r.data),
    (d) => {
      const out = frag();

      const stats = el("div", "grid grid-3");
      const doctor = d.doctor || {};
      stats.append(
        statTile(
          "Install",
          doctor.ok ? "Healthy" : `${(doctor.findings || []).length} issue${(doctor.findings || []).length === 1 ? "" : "s"}`,
          doctor.installed_version ? `payload ${doctor.installed_version} · cli ${doctor.package_version}` : "",
          doctor.ok ? "ok" : "warn"
        )
      );
      const w = d.wiki || {};
      stats.append(
        statTile(
          "Wiki",
          w.state === "registered" ? w.tier || "tier unknown" : (w.state || "none").toUpperCase(),
          w.state === "registered" ? `${w.docs} docs · last scan ${w.last_scan || "?"}` : "no registered wiki",
          w.tier === "FRESH" ? "ok" : w.tier === "AGING" ? "warn" : w.state === "none" ? "" : "bad"
        )
      );
      stats.append(
        statTile(
          "Runs waiting",
          String((d.waiting || []).length),
          `${d.runs_total || 0} recorded in total`,
          (d.waiting || []).length ? "warn" : "ok"
        )
      );
      out.append(stats);

      if ((d.waiting || []).length) {
        const c = card("Waiting for you");
        c.append(
          el("div", "note", "A resume pointer is on disk for these. `orc resume` prints the paste-into-a-fresh-session prompt.")
        );
        const list = el("div", "run-list");
        for (const slug of d.waiting) {
          const b = el("button", "run-card");
          b.type = "button";
          b.append(chip("waiting", "warn"));
          const mid = el("div");
          mid.append(el("div", "run-slug", slug));
          mid.append(el("div", "run-where", "open — see the Runs panel for where it stands"));
          b.append(mid, el("div", "run-age", ""));
          b.addEventListener("click", () => {
            location.hash = "#/runs?slug=" + encodeURIComponent(slug);
          });
          list.append(b);
        }
        c.append(list);
        out.append(c);
      }

      if (!doctor.ok && (doctor.findings || []).length) {
        const c = card("orc doctor");
        for (const f of doctor.findings) {
          const row = el("div", "note");
          row.append(chip(f.fixable ? "fixable" : "manual", f.fixable ? "info" : "warn"), document.createTextNode(" " + f.message));
          c.append(row);
        }
        const a = el("div", "row-actions");
        const go = el("button", "btn btn-sm", "Open Maintenance");
        go.type = "button";
        go.addEventListener("click", () => (location.hash = "#/maintenance"));
        a.append(go);
        c.append(el("div", "note", ""), a);
        out.append(c);
      }

      const paths = card("Where things are");
      const where = d.where || {};
      paths.append(
        kvList([
          ["project", where.project_root],
          ["config", where.config],
          ["skills", where.skills],
          ["runs", where.run_dir],
          ["traces", where.log_dir],
        ])
      );
      out.append(paths);

      const know = card("Knowledge");
      const p = d.patterns || {};
      know.append(
        kvList([
          ["patterns cached", (p.patterns || []).map((x) => x.lang).join(", ") || "none"],
          ["crosslink tags", w.crosslink_tags === undefined ? "" : String(w.crosslink_tags)],
          ["diy flow", d.diy ? `${d.diy.state} — ${d.diy.reason}` : ""],
        ])
      );
      out.append(know);

      return out;
    }
  );
};

function statTile(label, value, note, kind) {
  const t = el("div", "stat");
  t.append(el("div", "stat-label", label));
  const v = el("div", "stat-value", value);
  if (kind === "ok") v.style.color = "var(--ok)";
  if (kind === "warn") v.style.color = "var(--warn)";
  if (kind === "bad") v.style.color = "var(--bad)";
  t.append(v);
  if (note) t.append(el("div", "stat-note", note));
  return t;
}

/* ================================================================ SETTINGS == */

const TIER_LABEL = { common: "Common", fable5: "Fable 5 role override", advanced: "Advanced" };

PANELS.settings = function (host) {
  const actions = el("div", "row-actions");
  const profBtn = el("button", "btn btn-sm", "Profiles");
  profBtn.type = "button";
  profBtn.addEventListener("click", showProfiles);
  const recBtn = el("button", "btn btn-sm", "Recommend a profile");
  recBtn.type = "button";
  recBtn.addEventListener("click", showRecommend);
  actions.append(profBtn, recBtn);
  head(host, "Settings", "Every key `orc config` knows. Each change shells the real command, so the CLI's validators decide.", actions);

  const body = el("div");
  host.append(body);
  renderSettings(body);
};

async function renderSettings(body) {
  body.replaceChildren(skeleton(8));
  let d;
  try {
    d = (await read("/api/config")).data;
  } catch (e) {
    body.replaceChildren(empty("Could not read the config.", String(e.message)));
    return;
  }

  const out = frag();

  const pathCard = card("Override file");
  pathCard.append(
    kvList([
      ["file", d.config_path],
      ["state", d.exists ? "exists — only changed keys are written here" : "not created yet (every key is at its default)"],
    ])
  );
  // Permanently on, deliberately not a key — say so, or somebody hunts for the
  // switch that does not exist.
  pathCard.append(
    el(
      "div",
      "note",
      "Behavior-trace logging is permanently ON and is not configurable. Every run writes a trace; only its folder (log_dir) is a setting."
    )
  );
  if ((d.legacy_keys || []).length)
    for (const l of d.legacy_keys)
      pathCard.append(el("div", "note", `\`${l.key}\` is still in the file — it was renamed to \`${l.renamed_to}\`, and is read as that.`));
  out.append(pathCard);

  // The ladder is a DIAGRAM, not an editor, and it re-morphs when opus5_only
  // flips — which is how the precedence rule gets taught rather than described.
  out.append(ladderCard(d.score_table));

  for (const tier of ["common", "fable5", "advanced"]) {
    const keys = d.keys.filter((k) => k.tier === tier);
    if (!keys.length) continue;
    const wrap = el("div", "tier");
    const h = el("div", "tier-head");
    h.append(el("h2", null, TIER_LABEL[tier] || tier));
    h.append(el("span", "tier-count", `${keys.length} key${keys.length === 1 ? "" : "s"}`));
    if (keys.every((k) => k.is_shadowed) && keys[0].is_shadowed) h.append(chip("inert", "warn"));
    wrap.append(h);
    for (const k of keys) wrap.append(settingRow(k, body));
    out.append(wrap);
  }

  if ((d.hand_edited || []).length) {
    const c = card("Hand-edited keys");
    c.append(
      el(
        "div",
        "note",
        "These are not in the config registry, so `orc config set` refuses them and this panel will not write them. " +
          "rubric_bands_override is the designed case: it is hand-written by intent. Edit the YAML file directly."
      )
    );
    for (const k of d.hand_edited) {
      const row = el("div", "setting" + (k.is_shadowed ? " shadowed" : ""));
      const left = el("div");
      const name = el("div", "setting-name");
      name.append(document.createTextNode(k.key));
      if (k.is_shadowed) {
        const lock = el("span", "lock");
        lock.append(document.createTextNode("🔒 shadowed"));
        name.append(lock);
      }
      left.append(name);
      left.append(el("div", "setting-desc", "read-only here — hand-edit orc.config.yaml"));
      if (k.shadow_reason) left.append(el("div", "shadow-why", k.shadow_reason));
      const right = el("div", "setting-control");
      right.append(el("div", "readonly-value", String(k.value)));
      row.append(left, right);
      c.append(row);
    }
    out.append(c);
  }

  body.replaceChildren(out);
}

function ladderCard(table) {
  const c = card("Score → model ladder");
  c.id = "ladder-card"; // the FLIP morph finds it by id, never by a :has() query
  const active = table.active;
  c.append(
    el(
      "div",
      "note",
      active === "opus5_only"
        ? "opus5_only is ON — executors use the fixed 3-band effort ladder. It outranks the default table, rubric_bands_override, and the whole fable5_* block."
        : active === "rubric_bands_override"
        ? "A hand-written rubric_bands_override is in the file. It replaces the default table (and is itself outranked by opus5_only)."
        : "The default 8-band table. Tables resolve highest-wins: opus5_only > rubric_bands_override > this one."
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
  c.append(
    el(
      "div",
      "ladder-note",
      "Read-only — a diagram, not an editor. This comes from the CLI's own table, so the panel adds no extra copy of it."
    )
  );
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

function settingRow(k, panelBody) {
  const row = el("div", "setting" + (k.is_shadowed ? " shadowed" : ""));
  row.dataset.key = k.key;

  const left = el("div");
  const name = el("div", "setting-name");
  name.append(document.createTextNode(k.key));
  if (k.is_overridden) name.append(el("span", "dot"));
  if (k.is_shadowed) {
    const lock = el("span", "lock");
    lock.append(document.createTextNode("🔒 shadowed"));
    name.append(lock);
  }
  left.append(name);
  left.append(el("div", "setting-desc", k.desc));
  if (k.shadow_reason) left.append(el("div", "shadow-why", k.shadow_reason));

  const right = el("div", "setting-control");
  right.append(controlFor(k, panelBody));
  if (k.is_overridden) {
    const reset = el("button", "btn btn-ghost btn-sm", "reset to " + String(k.default));
    reset.type = "button";
    reset.addEventListener("click", () => writeSetting("/api/config/reset", { key: k.key }, panelBody, row));
    right.append(reset);
  }

  row.append(left, right);
  return row;
}

// The control follows the VALIDATOR, not a hand-kept table: enum → segmented,
// int/range → stepper with the options list as presets, path/repo/model → a
// text input whose validation is the CLI's own exit code.
function controlFor(k, panelBody) {
  const c = k.control || { kind: "text" };
  const commit = (value, node) => writeSetting("/api/config/set", { key: k.key, value }, panelBody, node);

  if (c.kind === "enum") {
    const choices = c.choices || k.options || [];
    const seg = el("div", "seg");
    for (const opt of choices) {
      const b = el("button", null, String(opt));
      b.type = "button";
      b.setAttribute("aria-pressed", String(String(k.value) === String(opt)));
      b.addEventListener("click", () => commit(String(opt), b));
      seg.append(b);
    }
    return seg;
  }

  if (c.kind === "int" || c.kind === "range") {
    const wrap = el("div", "stepper");
    const input = el("input");
    input.type = "number";
    input.value = String(k.value);
    if (c.min !== null && c.min !== undefined) input.min = String(c.min);
    if (c.max !== null && c.max !== undefined) input.max = String(c.max);
    const save = el("button", "btn btn-sm", "set");
    save.type = "button";
    save.addEventListener("click", () => commit(input.value, input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit(input.value, input);
    });
    wrap.append(input, save);
    const presets = (k.options || []).filter((o) => String(o) !== String(k.value));
    if (presets.length) {
      const seg = el("div", "seg");
      for (const p of presets.slice(0, 5)) {
        const b = el("button", null, String(p));
        b.type = "button";
        b.addEventListener("click", () => commit(String(p), b));
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
      String(k.value)
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
        commit([...chosen].join(",") || "", b);
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
  input.value = String(k.value);
  const save = el("button", "btn btn-sm", "set");
  save.type = "button";
  const go = () => commit(input.value, input);
  save.addEventListener("click", go);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
  wrap.append(input, save);
  return wrap;
}

async function writeSetting(endpoint, body, panelBody, node) {
  try {
    const r = await post(endpoint, body);
    if (!r.ok) {
      if (node && node.classList) node.classList.add("invalid");
      toast("The CLI refused that value.", "bad", r.output || r.command);
      return;
    }
    // Brief success flash on the row, then re-render from the CLI so the
    // shadowing, the overridden dots and the ladder all reflect real state.
    if (node && node.closest) {
      const row = node.closest(".setting");
      if (row) {
        row.animate([{ background: "var(--ok-wash)" }, { background: "transparent" }], { duration: 700, easing: "ease-out" });
      }
    }
    toast(r.command, "ok", r.output && r.output.length < 400 ? r.output : "");
    await rerenderSettings(panelBody);
  } catch (e) {
    toast("Write failed.", "bad", String(e.message));
  }
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
  const body = el("div");
  body.append(el("div", "note", "A profile writes only existing, validated keys — nothing it sets is something you could not set yourself."));
  for (const p of d.profiles) {
    const c = el("div", "action");
    const left = el("div");
    left.append(el("div", "setting-name", p.name));
    left.append(el("div", "setting-desc", p.desc));
    if (p.changes.length) {
      const list = el("div", "note");
      list.textContent = "would change: " + p.changes.map((c2) => `${c2.key} ${c2.from} → ${c2.to}`).join(", ");
      left.append(list);
    } else left.append(el("div", "note", "this repo is already on that profile — nothing would change"));
    const apply = el("button", "btn btn-sm btn-allow-busy" + (p.changes.length ? " btn-primary" : ""), "Apply");
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
  const close = modal({ title: "Config profiles", body, actions: [{ label: "Close", onClick: (c) => c() }] });
}

async function showRecommend() {
  const d = (await read("/api/config/recommend")).data;
  const body = el("div");
  body.append(el("div", "note", "Read-only: this looked at the repo and suggests one profile. Nothing was changed."));
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
  const apply = el("button", "btn btn-sm btn-primary btn-allow-busy", "Apply " + d.recommended);
  apply.type = "button";
  apply.addEventListener("click", async () => {
    const r = await post("/api/config/profile", { name: d.recommended });
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    close();
    route();
  });
  pick.append(left, apply);
  body.append(pick);
  const close = modal({ title: "Recommended profile", body, actions: [{ label: "Close", onClick: (c) => c() }] });
}

/* ==================================================================== RUNS == */

PANELS.runs = function (host) {
  head(host, "Runs", "Everything ORC has recorded, newest first. `waiting` means a resume pointer is still on disk.");
  const layout = el("div", "grid");
  const listSlot = el("div");
  const detailSlot = el("div");
  layout.append(listSlot, detailSlot);
  host.append(layout);

  const wanted = new URLSearchParams((location.hash.split("?")[1] || "")).get("slug");

  section(
    listSlot,
    () => read("/api/runs").then((r) => r.data),
    (d) => {
      if (!d.total) return empty("No runs recorded yet.", d.run_dir);
      const list = el("div", "run-list");
      for (const r of d.runs) {
        const b = el("button", "run-card");
        b.type = "button";
        b.append(chip(r.status, r.status === "waiting" ? "warn" : r.status === "done" ? "ok" : ""));
        const mid = el("div");
        mid.append(el("div", "run-slug", r.slug));
        const where = [r.lane, r.phase && "phase " + r.phase, r.wave].filter(Boolean).join(" · ");
        mid.append(el("div", "run-where", where || "—"));
        b.append(mid, el("div", "run-age", relAge(r.updated_ms)));
        b.addEventListener("click", () => {
          for (const other of list.querySelectorAll(".run-card")) other.setAttribute("aria-current", "false");
          b.setAttribute("aria-current", "true");
          showRun(detailSlot, r.slug);
        });
        list.append(b);
        if (r.slug === wanted) setTimeout(() => b.click(), 0);
      }
      return list;
    }
  );
};

function showRun(slot, slug) {
  slot.replaceChildren(skeleton(5));
  Promise.all([read("/api/run?slug=" + encodeURIComponent(slug)), read("/api/mock?slug=" + encodeURIComponent(slug)).catch(() => ({ data: null }))])
    .then(([runRes, mockRes]) => {
      const d = runRes.data;
      const mock = mockRes && mockRes.data && mockRes.data.found ? mockRes.data : null;
      const c = card(null);
      c.append(
        kvList([
          ["slug", d.slug],
          ["status", d.status],
          ["lane", d.stands && d.stands.lane],
          ["phase", d.stands && d.stands.phase],
          ["wave", d.stands && d.stands.wave],
          ["folder", d.dir],
          ["updated", relAge(d.updated_ms)],
        ])
      );

      const tabs = el("div", "tabs");
      const pane = el("div");
      const views = [];
      const addTab = (label, render) => views.push({ label, render });

      if (d.resume)
        addTab("Resume", () => {
          const box = el("div");
          box.append(el("div", "note", "Paste this into a fresh Claude Code session to pick the run back up."));
          const actions = el("div", "row-actions");
          const cp = el("button", "btn btn-sm", "Copy prompt");
          cp.type = "button";
          cp.addEventListener("click", () => copy(d.resume, "Resume prompt copied"));
          actions.append(cp);
          box.append(actions, el("pre", "block wrap", d.resume));
          return box;
        });
      if (d.state_of_play) addTab("State of play", () => el("pre", "block wrap", d.state_of_play));
      if (d.checkpoint)
        addTab("Checkpoint", () => {
          const box = el("div");
          box.append(
            kvList([
              ["phase", d.checkpoint.phase],
              ["wave", d.checkpoint.wave],
              ["updated_at", d.checkpoint.updated_at],
              ["trace", d.checkpoint.trace_path],
            ])
          );
          box.append(el("pre", "block", JSON.stringify(d.checkpoint, null, 2)));
          return box;
        });
      if (d.trace)
        addTab("Trace", () => {
          const box = el("div");
          box.append(el("div", "note", "The tail of this run's behavior trace. Traces are permanent and never auto-pruned."));
          box.append(el("pre", "block", d.trace));
          return box;
        });
      // Honesty rule: a run with no mock example shows "not generated", never an
      // empty state that implies one is missing. And never a Run button.
      addTab("Mock example", () => {
        if (!mock)
          return empty(
            "Not generated for this run.",
            "That is normal: mock examples are written only after a green verify, and only when config `mock_example` is `on` (or you accept the `ask` offer)."
          );
        const box = el("div");
        box.append(kvList([["folder", mock.dir], ["files", String(mock.files.length)], ["written", relAge(mock.mtime_ms)]]));
        box.append(el("div", "note", "Read-only. This panel never runs a mock example — it is arbitrary project code."));
        if (mock.readme) box.append(el("pre", "block wrap", mock.readme));
        const fl = el("div", "file-list");
        for (const f of mock.files) fl.append(el("div", null, f.path));
        box.append(fl);
        return box;
      });
      if (!views.length) addTab("Files", () => el("pre", "block", (d.files || []).join("\n") || "(empty folder)"));

      views.forEach((v, i) => {
        const b = el("button", null, v.label);
        b.type = "button";
        b.setAttribute("aria-selected", String(i === 0));
        b.addEventListener("click", () => {
          for (const other of tabs.children) other.setAttribute("aria-selected", "false");
          b.setAttribute("aria-selected", "true");
          pane.replaceChildren(v.render());
        });
        tabs.append(b);
      });
      pane.replaceChildren(views[0].render());
      c.append(tabs, pane);
      slot.replaceChildren(c);
    })
    .catch((e) => slot.replaceChildren(empty("Could not open that run.", String(e.message))));
}

/* =============================================================== KNOWLEDGE == */

PANELS.knowledge = function (host) {
  head(host, "Knowledge", "What ORC already knows about this repo: the wiki, cached code-patterns, and repair memory.");
  const body = el("div");
  host.append(body);
  renderKnowledge(body);
};

async function renderKnowledge(body) {
  body.replaceChildren(skeleton(6));
  const [wikiRes, impactRes, patRes, gotRes] = await Promise.all([
    read("/api/wiki").catch(() => ({ data: null })),
    read("/api/wiki/impact").catch(() => ({ data: null })),
    read("/api/patterns").catch(() => ({ data: null })),
    read("/api/gotchas").catch(() => ({ data: null })),
  ]);
  const out = frag();

  // --- wiki
  const w = wikiRes.data || {};
  const wc = card("Wiki", wikiActions(body, w));
  if (!w.state || w.state === "none") {
    wc.append(empty("No wiki yet.", "Run /orc-wiki in Claude Code to build one. This panel never scans — that costs a model."));
  } else if (w.state !== "registered") {
    wc.append(el("div", "banner"), el("div", "note", `The wiki is ${w.state.toUpperCase()} — nothing can read it until it is registered.`));
    wc.append(el("div", "note", "`orc wiki sync` fixes this instantly: registration is derived from the docs, so it is free and never a re-scan."));
  } else {
    const tierChip = chip(w.tier || "tier unknown", w.tier === "FRESH" ? "ok" : w.tier === "AGING" ? "warn" : "bad", w.tier === "STALE");
    const headRow = el("div", "row-actions");
    headRow.append(tierChip);
    wc.append(headRow);
    wc.append(
      kvList([
        ["docs", String(w.docs)],
        ["last scan", w.last_scan],
        ["distance", w.distance === null ? "unmeasurable" : `${w.distance} commits on the worst doc's covered files`],
        ["anchor", w.anchor ? String(w.anchor).slice(0, 8) : ""],
        ["edges", w.edges ? `fresh < ${w.edges.freshMax}c · aging <= ${w.edges.agingMax}c` : ""],
        ["crosslink tags", w.crosslink_tags === undefined ? "" : String(w.crosslink_tags)],
        ["structural blind spots", w.blind ? String(w.blind) : "0"],
      ])
    );
    for (const r of w.reasons || []) wc.append(el("div", "note", "why: " + r));
    wc.append(
      el(
        "div",
        "note",
        "Freshness is coverage-relative: a doc is stale only when commits since its OWN anchor touched files IT covers."
      )
    );
  }
  out.append(wc);

  // --- impact
  const imp = impactRes.data;
  if (imp && imp.ok) {
    const c = card("Refresh scope (orc wiki impact)");
    const rec = el("div", "row-actions");
    rec.append(chip(imp.recommendation, imp.recommendation === "CLEAN" ? "ok" : imp.recommendation === "DELTA" ? "info" : "warn"));
    c.append(rec);
    for (const r of imp.reasons || []) c.append(el("div", "note", r));
    c.append(
      el(
        "div",
        "note",
        `${imp.registered} registered · ${imp.touched} touched · ${imp.structural} structural · ${imp.affected_pct}% affected (threshold ${imp.threshold}%)`
      )
    );
    const t = el("div", "scroll-x");
    const table = el("table");
    const thead = el("thead");
    const hr = el("tr");
    for (const h of ["Doc", "State", "Detail"]) hr.append(el("th", null, h));
    thead.append(hr);
    const tb = el("tbody");
    for (const d of imp.docs) {
      const tr = el("tr");
      tr.append(el("td", "mono", d.file));
      const st = el("td");
      st.append(chip(d.state, d.state === "CLEAN" ? "ok" : d.state === "TOUCHED" ? "info" : "warn"));
      tr.append(st);
      tr.append(el("td", "note", d.gone.length ? "gone: " + d.gone.join(", ") : d.hits.slice(0, 4).join(", ")));
      tb.append(tr);
    }
    table.append(thead, tb);
    t.append(table);
    c.append(t);
    if ((imp.blind_spot || []).length) {
      c.append(el("div", "note", "Structural blind spot — changed files no doc covers:"));
      const fl = el("div", "file-list");
      for (const f of imp.blind_spot) fl.append(el("div", null, f));
      c.append(fl);
    }
    out.append(c);
  } else if (imp && !imp.ok) {
    const c = card("Refresh scope (orc wiki impact)");
    c.append(el("div", "note", imp.hint || `unavailable (${imp.reason})`));
    out.append(c);
  }

  // --- patterns
  const p = patRes.data || {};
  const pc = card("Code patterns");
  pc.append(
    el(
      "div",
      "note",
      "Reconciled per-language conventions, injected literally into executor slices. Project conventions win; security and correctness invariants are always kept."
    )
  );
  if (!(p.patterns || []).length) {
    pc.append(empty("No cached patterns.", "Run /orc-pattern in Claude Code to codify one. Codifying costs a model, so this panel never does it."));
  } else {
    const t = el("table");
    const tb = el("tbody");
    for (const row of p.patterns) {
      const tr = el("tr");
      tr.append(el("td", "mono", row.lang));
      tr.append(el("td", "note", relAge(row.mtime_ms)));
      tr.append(el("td", "note", row.path));
      tb.append(tr);
    }
    t.append(tb);
    const sc = el("div", "scroll-x");
    sc.append(t);
    pc.append(sc);
  }
  if ((p.known_languages || []).length)
    pc.append(el("div", "note", "Known language keys: " + p.known_languages.join(", ")));
  out.append(pc);

  // --- gotchas
  const g = gotRes.data || {};
  const pruneBtn = el("button", "btn btn-sm", "Prune to gotchas_max");
  pruneBtn.type = "button";
  pruneBtn.addEventListener("click", async () => {
    const r = await post("/api/gotcha/prune", {});
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    renderKnowledge(body);
  });
  const gc = card("Repair memory (gotchas)", g.count ? pruneBtn : null);
  gc.append(el("div", "note", "One entry per project-specific failure a repair already solved. Pruning ARCHIVES the low-value tail — it never deletes."));
  if (!g.count) {
    gc.append(empty("Nothing recorded yet.", "A repair loop that goes red → green writes the first one."));
  } else {
    const t = el("table");
    const thead = el("thead");
    const hr = el("tr");
    for (const h of ["Id", "Area", "Kind", "Hits", "Last seen", "Trigger"]) hr.append(el("th", null, h));
    thead.append(hr);
    const tb = el("tbody");
    for (const e of g.gotchas) {
      const tr = el("tr");
      tr.append(el("td", "mono", e.id), el("td", "mono", e.area), el("td", null, e.kind), el("td", null, String(e.hits)), el("td", "note", e.last_seen || "?"), el("td", "note", e.trigger || ""));
      tb.append(tr);
    }
    t.append(thead, tb);
    const sc = el("div", "scroll-x");
    sc.append(t);
    gc.append(sc);
  }
  out.append(gc);

  body.replaceChildren(out);
}

function wikiActions(body, w) {
  if (!w || !w.state || w.state === "none") return null;
  const wrap = el("div", "row-actions");
  const sync = el("button", "btn btn-sm", "orc wiki sync");
  sync.type = "button";
  sync.addEventListener("click", async () => {
    const r = await post("/api/wiki/sync", {});
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    renderKnowledge(body);
  });
  wrap.append(sync);
  return wrap;
}

/* =================================================================== STATS == */

PANELS.stats = function (host) {
  head(host, "Stats", "Counted from the trace filenames — no model, instant, free.");
  section(
    host,
    () => read("/api/stats").then((r) => r.data),
    (d) => {
      if (!d.runs) return empty("No traces yet.", d.log_dir + " — run any ORC lane and they appear here.");
      const out = frag();

      const tiles = el("div", "grid grid-3");
      tiles.append(statTile("Runs", String(d.runs), `${d.from} → ${d.to}`));
      tiles.append(statTile("Subagents dispatched", String(d.dispatches)));
      tiles.append(statTile("Model downgrades", String(d.downgrades), "a dispatch that ran below its pin", d.downgrades ? "warn" : "ok"));
      out.append(tiles);

      out.append(barCard("Lanes", d.lanes, (k) => (k === "unknown" ? "(no lane)" : "/" + k)));
      if (Object.keys(d.agents || {}).length) out.append(barCard("Subagents", d.agents, (k) => k.replace(/^orc-/, "")));

      const health = card("Health");
      health.append(
        kvList([
          ["runs that never finished", String(d.unfinished) + (d.unfinished ? "   (see the Runs panel)" : "")],
          ["traces with no lane in the name", d.unknown_lane ? String(d.unknown_lane) + "   (pre-v0.34.2 bootstrap files)" : "0"],
          ["log dir", d.log_dir],
        ])
      );
      health.append(
        el(
          "div",
          "note",
          "Counts only what traces record. /orc-retro and /orc-explain never write one, so they never appear here. Nothing auto-prunes traces."
        )
      );
      out.append(health);
      return out;
    }
  );
};

function barCard(title, map, label) {
  const c = card(title);
  const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;
  const total = rows.reduce((n, r) => n + r[1], 0);
  const bars = el("div", "bars");
  for (const [k, n] of rows) {
    const row = el("div", "bar-row");
    row.append(el("div", "bar-label", label ? label(k) : k));
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    track.append(fill);
    row.append(track);
    row.append(el("div", "bar-value", `${n}  ${Math.round((n / total) * 100)}%`));
    bars.append(row);
    // Set the width after insertion so the 320ms grow transition runs.
    requestAnimationFrame(() => fill.style.setProperty("width", Math.max(2, (n / max) * 100) + "%"));
  }
  c.append(bars);
  return c;
}

/* ==================================================================== FLOW == */

PANELS.flow = function (host) {
  head(host, "Flow (DIY)", "The user-composed lane. Shape is CLI-owned and compiled — a stale compile never runs.");
  const body = el("div");
  host.append(body);
  renderFlow(body);
};

async function renderFlow(body) {
  body.replaceChildren(skeleton(6));
  const d = (await read("/api/diy")).data;
  const out = frag();

  const compile = el("button", "btn btn-sm btn-primary", "orc diy compile");
  compile.type = "button";
  compile.addEventListener("click", async () => {
    const r = await post("/api/diy/compile", {});
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    renderFlow(body);
  });

  const gate = card("Gate", d.configured ? compile : null);
  const chipRow = el("div", "row-actions");
  chipRow.append(chip(d.state, d.state === "READY" ? "ok" : d.state === "STALE" ? "warn" : ""));
  gate.append(chipRow);
  gate.append(el("div", "note", d.reason));
  for (const t of d.triggers || []) gate.append(el("div", "note", "• " + t));
  if (!d.configured)
    gate.append(
      el("div", "note", "Bootstrap it from a terminal: orc diy init [--preset lean|paranoid|solo-fast]. UNCONFIGURED and STALE both refuse to run, and /orc-diy offers plain /orc instead.")
    );
  out.append(gate);

  if (d.configured) {
    for (const e of d.errors || []) out.append(bannerLine(e, true));
    for (const w of d.warnings || []) out.append(bannerLine(w, false));

    const keys = card("Flow keys");
    keys.append(el("div", "note", "Changing a key makes the compile STALE — recompile before running /orc-diy."));
    for (const k of d.keys) {
      const row = el("div", "setting");
      const left = el("div");
      const name = el("div", "setting-name");
      name.append(document.createTextNode(k.key));
      if (k.is_set) name.append(el("span", "dot"));
      left.append(name, el("div", "setting-desc", k.desc || ""));
      const right = el("div", "setting-control");
      const input = el("input", "text-input");
      input.value = String(k.value === "" ? "" : k.value);
      const save = el("button", "btn btn-sm", "set");
      save.type = "button";
      const go = async () => {
        const r = await post("/api/diy/set", { key: k.key, value: input.value });
        toast(r.command, r.ok ? "ok" : "bad", r.output);
        renderFlow(body);
      };
      save.addEventListener("click", go);
      input.addEventListener("keydown", (e) => e.key === "Enter" && go());
      right.append(input, save);
      row.append(left, right);
      keys.append(row);
    }
    out.append(keys);

    if (d.score_table) {
      const st = card("Compiled executor table");
      st.append(el("div", "note", "Clipped to the declared session tier at COMPILE time, never at runtime."));
      const sc = el("div", "scroll-x");
      sc.append(el("pre", "block", d.score_table));
      st.append(sc);
      out.append(st);
    }
    const paths = card("Files");
    paths.append(kvList([["config", d.paths.config], ["compiled", d.paths.compiled], ["lock", d.paths.lock]]));
    out.append(paths);
  }

  body.replaceChildren(out);
}

function bannerLine(text, bad) {
  const b = el("div", "banner" + (bad ? " banner-bad" : ""));
  b.append(el("div", null, text));
  return b;
}

/* =============================================================== CROSSLINK == */

PANELS.crosslink = function (host) {
  head(host, "Crosslink", "Cross-repo wiki references. Advisory, never blocking — it reads foreign WIKI only, never foreign source.");
  const body = el("div");
  host.append(body);
  renderCrosslink(body);
};

async function renderCrosslink(body) {
  body.replaceChildren(skeleton(5));
  const d = (await read("/api/crosslink")).data;
  const out = frag();

  if (!d.configured) {
    out.append(empty("No cross-repo links yet.", "Add one from a terminal with `orc crosslink` (it is an interactive composer)."));
    body.replaceChildren(out);
    return;
  }

  const head2 = card("Graph");
  head2.append(kvList([["self", d.self], ["config", d.config_path], ["needs baseline", d.needs_baseline || "not built yet — run /orc-wiki here"]]));
  out.append(head2);

  for (const n of d.nodes) {
    const c = el("div", "action");
    const left = el("div");
    const name = el("div", "setting-name");
    name.append(document.createTextNode(n.name));
    name.append(chip(n.direction === "consume" ? "we call them" : n.direction === "provide" ? "they call us" : "no edge", n.direction === "consume" ? "info" : n.direction === "provide" ? "" : "warn"));
    left.append(name);
    left.append(el("div", "setting-desc", n.repo_path + (n.kinds.length ? "  ·  kinds: " + n.kinds.join(", ") : "")));
    const pv = n.provider || {};
    if (pv.state === "missing") left.append(el("div", "note", "path not found — saved as a PENDING edge; it resolves when the path appears"));
    else if (pv.state === "no-wiki") left.append(el("div", "note", "no wiki there — /orc-wiki in that repo (edge saved, inert until then)"));
    else if (pv.state === "unregistered") left.append(el("div", "note", "wiki found but UNREGISTERED — `orc wiki sync` in that repo"));
    else if (pv.state === "corrupt") left.append(el("div", "note", "their wiki-meta.json is unreadable — `orc wiki sync` there"));
    else if (n.direction === "provide")
      left.append(el("div", "note", "inbound only — we resolve nothing from them, so their tags and freshness do not matter here"));
    else {
      const row = el("div", "row-actions");
      row.append(chip(pv.tier || "tier unknown", pv.tier === "FRESH" ? "ok" : pv.tier === "AGING" ? "warn" : "bad", pv.tier === "STALE"));
      row.append(el("span", "note", `last scan ${pv.last_scan || "?"} · ${pv.tags || 0} crosslink tags · peer defaults 10/30`));
      left.append(row);
      if (!pv.tags)
        left.append(el("div", "note", `Tags are published by the repo being called: run /orc-wiki crosslink IN ${n.repo_path}.`));
    }
    const rm = el("button", "btn btn-sm btn-danger", "Remove");
    rm.type = "button";
    rm.addEventListener("click", () => confirmRemove(n.name, body));
    c.append(left, rm);
    out.append(c);
  }

  if (d.links.length) {
    const lc = card("Edges");
    for (const l of d.links) lc.append(el("div", "note", `${l.from} ──${l.via}──▶ ${l.to}   (${l.relation.replace(/-/g, " ")})`));
    out.append(lc);
  }

  body.replaceChildren(out);
}

function confirmRemove(name, body) {
  const b = el("div");
  b.append(el("div", null, `Remove the linked repo "${name}" and every edge that touches it?`));
  b.append(el("div", "note", "This only edits this repo's crosslink config. The other repo is never touched."));
  b.append(el("div", "action-cmd", `orc crosslink remove ${name}`));
  const close = modal({
    title: "Remove linked repo",
    body: b,
    actions: [
      { label: "Cancel", onClick: (c) => c() },
      {
        label: "Remove",
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

PANELS.learn = function (host) {
  head(host, "Learn", "The same walkthrough as `orc onboarding` — no GitHub README needed.");
  section(
    host,
    () => read("/api/learn").then((r) => r.data),
    (d) => {
      const out = frag();
      for (const s of d.sections) {
        const c = card(s.title);
        const pre = el("pre", "block wrap", s.lines.join("\n"));
        c.append(pre);
        out.append(c);
      }
      return out;
    }
  );
};

/* ============================================================= MAINTENANCE == */

// The most safety-critical panel, and the governing idea is one sentence: every
// destructive action already has a read-only preview in the CLI, so the UI shows
// the preview and makes you approve it — it never fires blind.
//   - Preview is a SEPARATE request from apply; apply is disabled until one has
//     been fetched and rendered in this session.
//   - The exact command is always visible. Close the browser and type it.
//   - Prune names EVERY file. A count is not consent for a deletion.
//   - Single-flight: the whole UI goes read-only while a job runs.
//   - Never automatic. No fix-on-load, no background repair, no nag that runs.

PANELS.maintenance = function (host) {
  head(host, "Maintenance", "update · upgrade · doctor --fix. Preview first, approve, then it runs — never automatically.");
  const body = el("div");
  host.append(body);
  renderMaintenance(body);
};

async function renderMaintenance(body) {
  body.replaceChildren(skeleton(5));
  const d = (await read("/api/maintenance")).data;
  const out = frag();

  out.append(
    el(
      "div",
      "banner",
      "Nothing on this panel runs on its own. Each action shows the CLI's own read-only preview first, and the exact command it will run."
    )
  );

  for (const a of d.actions) {
    const row = el("div", "action");
    const left = el("div");
    left.append(el("div", "setting-name", a.id));
    left.append(el("div", "setting-desc", a.label));
    left.append(el("div", "action-cmd", a.command));
    if (a.network) left.append(el("div", "note", "Reaches the network and replaces the installed package."));
    const btn = el("button", "btn btn-sm", "Preview…");
    btn.type = "button";
    btn.addEventListener("click", () => previewAction(a.id, body));
    left.append();
    row.append(left, btn);
    out.append(row);
  }

  const job = card("Last run");
  job.id = "job-card";
  out.append(job);
  body.replaceChildren(out);
  refreshJob();
}

async function previewAction(action, body) {
  const d = (await read("/api/maintenance/preview?action=" + encodeURIComponent(action))).data;
  const b = el("div");

  b.append(el("div", null, d.label));
  b.append(el("div", "action-cmd", d.command));
  b.append(el("div", "note", `Preview came from: ${d.preview_command} (read-only).`));

  // Guard 1 — a run is mid-flight. Updating changes the skills that run will
  // resume into. The CLI has no idea you are mid-run; this panel does.
  let ackWaiting = !d.waiting_runs.length;
  if (d.waiting_runs.length) {
    const warn = el("div", "banner banner-bad");
    const inner = el("div");
    inner.append(el("strong", null, `${d.waiting_runs.length} run(s) are still waiting.`));
    inner.append(el("div", null, "Updating changes the skills those runs will resume into: " + d.waiting_runs.join(", ")));
    const lbl = el("label", "note");
    const cb = el("input");
    cb.type = "checkbox";
    cb.addEventListener("change", () => {
      ackWaiting = cb.checked;
      syncApply();
    });
    lbl.append(cb, document.createTextNode(" I understand — continue anyway"));
    inner.append(lbl);
    warn.append(inner);
    b.append(warn);
  }

  // Guard 2 — a dirty working tree before an upgrade is worth a warning
  // BEFORE, not a surprise after.
  if (d.dirty_tree) {
    const warn = el("div", "banner");
    warn.append(el("div", null, "The working tree has uncommitted changes. `orc upgrade` replaces the package while they are still there."));
    b.append(warn);
  }

  const pv = d.preview || {};
  if (action === "upgrade") {
    b.append(
      kvList([
        ["installed", pv.version],
        ["available", pv.latest || "could not check (offline?)"],
        ["source", pv.install_spec],
        ["update available", pv.update_available ? "yes" : "no"],
      ])
    );
    b.append(el("div", "note", "This is what would be installed. `Check only` re-reads the version without changing anything."));
  } else {
    const findings = pv.findings || [];
    b.append(
      kvList([
        ["installed payload", pv.installed_version],
        ["this cli", pv.package_version],
        ["findings", String(findings.length)],
      ])
    );
    if (!findings.length) b.append(el("div", "note", "orc doctor reports a healthy install — this would be a no-op re-copy."));
    for (const f of findings) {
      const line = el("div", "note");
      line.append(chip(f.fixable ? "fixable" : "manual", f.fixable ? "info" : "warn"), document.createTextNode(" " + f.message));
      b.append(line);
    }
    // A count is NOT consent for a deletion — name every file.
    if (d.names_files) {
      const paths = findings.filter((f) => f.id === "orphan" || f.id === "orphan-candidates").flatMap((f) => f.paths || []);
      const c = el("div");
      c.append(el("div", "note", paths.length ? `These ${paths.length} file(s) would be DELETED:` : "No orphan files were detected — nothing would be deleted."));
      if (paths.length) {
        const fl = el("div", "file-list");
        for (const p of paths) fl.append(el("div", null, p));
        c.append(fl);
      }
      b.append(c);
    }
  }

  let applyBtn = null;
  const syncApply = () => {
    if (applyBtn) applyBtn.disabled = !ackWaiting;
  };

  const actions = [{ label: "Cancel", onClick: (c) => c() }];
  if (action === "upgrade")
    actions.push({
      label: "Check only",
      onClick: () => toast("Version check done — see the panel above. Nothing was changed.", "ok"),
    });
  actions.push({
    label: action === "prune" ? "Delete and update" : action === "upgrade" ? "Upgrade now" : "Apply",
    cls: action === "prune" || action === "upgrade" ? "btn-danger" : "btn-primary",
    id: "apply-btn",
    disabled: !ackWaiting,
    onClick: async (close) => {
      try {
        await post("/api/maintenance/apply", { action });
        close();
        toast("Running: " + d.command, "ok");
        setBusy(true);
        refreshJob();
      } catch (e) {
        toast("Could not start it.", "bad", String(e.message));
      }
    },
  });

  modal({ title: "Preview — " + d.command, body: b, actions });
  applyBtn = document.getElementById("apply-btn");
  syncApply();
}

// While a mutation runs the WHOLE ui is read-only, output streams into the
// panel, and every panel refetches when it finishes.
function setBusy(on) {
  document.body.classList.toggle("busy", !!on);
}

let jobPoll = null;
async function refreshJob() {
  const host = document.getElementById("job-card");
  if (!host) return;
  let j;
  try {
    j = await api("/api/job");
  } catch (_) {
    return;
  }
  host.replaceChildren();
  if (!j.id) {
    const h0 = el("div", "card-head");
    h0.append(el("h2", null, "Last run"));
    host.append(h0, el("div", "note", "Nothing has been run from this panel yet."));
    return;
  }
  const h = el("div", "card-head");
  h.append(el("h2", null, j.command));
  h.append(chip(j.running ? "running" : j.exit_code === 0 ? "done" : "failed", j.running ? "info" : j.exit_code === 0 ? "ok" : "bad"));
  host.append(h);
  const out = el("pre", "job-output", j.output || "(no output yet)");
  host.append(out);
  out.scrollTop = out.scrollHeight;

  if (j.running) {
    setBusy(true);
    clearTimeout(jobPoll);
    jobPoll = setTimeout(refreshJob, 700);
  } else {
    setBusy(false);
    clearTimeout(jobPoll);
    jobPoll = null;
  }
}

/* ================================================================= startup == */

async function boot() {
  // Meta first: it names the project in the rail and tells us whether we are
  // looking at fixtures, which must never be mistaken for a real install.
  try {
    const meta = await api("/api/meta");
    const proj = $("#rail-project");
    proj.textContent = meta.fixtures ? "FIXTURE MODE" : meta.project_root || "";
    proj.title = meta.project_root || "";
    $("#rail-version").textContent = (meta.fixtures ? "fixtures · " : "") + "v" + (meta.version || "?");
    if (meta.fixtures) {
      const b = el("div", "banner");
      b.append(el("div", null, "Fixture mode: every number on this page is canned. Nothing real is read, and nothing can be written."));
      $("#banners").append(b);
    }
  } catch (_) {
    document.body.replaceChildren(
      (() => {
        const e2 = el("div", "empty", "This page is missing its session token.");
        e2.append(el("div", "note", "Re-run `orc ui` in your project to get a fresh URL."));
        return e2;
      })()
    );
    return;
  }

  // Theme: dark-first, remembered, and both painted explicitly.
  const saved = localStorage.getItem("orc-ui-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  const tt = $("#theme-toggle");
  const syncTheme = () => (tt.textContent = document.documentElement.getAttribute("data-theme") === "light" ? "Dark" : "Light");
  syncTheme();
  tt.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("orc-ui-theme", next);
    syncTheme();
  });

  window.addEventListener("hashchange", route);
  route();

  // Heartbeat: no ping from any client for 60s and the server exits, so closing
  // this tab shuts down a write surface instead of leaving it holding a token.
  const ping = () => api("/api/ping").catch(() => {});
  ping();
  setInterval(ping, 15000);
  window.addEventListener("beforeunload", () => {
    try {
      navigator.sendBeacon("/api/bye?t=" + encodeURIComponent(TOKEN));
    } catch (_) {}
  });
}

boot();
