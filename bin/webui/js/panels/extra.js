"use strict";
/* panels/extra.js — orc ui client
   Integrate with other AI model. The panel for `orc extra`: which providers ORC
   can reach, which connections you have, and whether each one has ever answered.

   THE PANEL NAMES NO PROVIDER, NO MODEL AND NO PRICE. Every tile below is a row
   of `orc extra providers --json`, every chip is a field of `orc extra list
   --json`, and every state word is one the CLI computed — the Flow-stepper rule.
   Model ids are deliberately not shipped at all (they rot within a quarter), so
   the only model names that ever appear here are the ones a real connection test
   read back from the provider.

   THE ONE THING THIS PANEL DERIVES IS NOTHING. Not a freshness tier, not a
   verification state, not an attempt ceiling: STALE and UNVERIFIED arrive as
   `orc extra doctor` findings keyed by profile, and the attempt ceiling is the
   config key's own value.

   THE BOUNDARY CARD IS PANEL PROSE, and that is deliberate rather than an
   oversight. It makes no claim about this repo's state — it explains what the
   subsystem does — so it is a sentence a human reads and therefore a sentence
   that must translate. Everything beside it that IS a fact about your setup (the
   engine, the base URL, whether a key was found) comes from the CLI verbatim.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

/* ================================================================== EXTRA == */

PANELS.extra = function (host) {
  head(host, t("extra.title"), t("extra.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderExtra(body);
};

async function renderExtra(body) {
  body.replaceChildren(skeleton(6));
  // Four reads, in parallel. A read that FAILED is not a read that came back
  // empty (v0.49.4): the error is kept so the card can say which half is
  // missing instead of rendering as "you have nothing configured".
  const [listRes, provRes, docRes, cfgRes, routeRes, laneRes, statRes, rateRes, toolRes] = await Promise.all([
    read("/api/extra").catch((e) => ({ data: null, error: e })),
    read("/api/extra/providers").catch((e) => ({ data: null, error: e })),
    read("/api/extra/doctor").catch((e) => ({ data: null, error: e })),
    read("/api/config").catch((e) => ({ data: null, error: e })),
    read("/api/extra/route").catch((e) => ({ data: null, error: e })),
    read("/api/extra/lanes").catch((e) => ({ data: null, error: e })),
    read("/api/extra/stats").catch((e) => ({ data: null, error: e })),
    read("/api/extra/rates").catch((e) => ({ data: null, error: e })),
    // v0.51.0 — the LOCAL TOOLS read. It exits 1 when nothing is ready, which is
    // exit-code-as-DATA like every other gate command on this panel.
    read("/api/extra/tools").catch((e) => ({ data: null, error: e })),
  ]);
  const d = {
    list: listRes.data,
    providers: provRes.data,
    doctor: docRes.data,
    config: cfgRes.data,
    route: routeRes.data,
    lanes: laneRes.data,
    // `orc extra stats` exits 1 with a real object when nothing has been
    // dispatched yet — an ANSWER, not an error, so it is read like every other
    // exit-code-as-data command on this panel.
    stats: statRes.data,
    rates: rateRes.data,
    tools: toolRes.data,
    errors: {
      list: listRes.error || null,
      providers: provRes.error || null,
      route: routeRes.error || null,
      lanes: laneRes.error || null,
      tools: toolRes.error || null,
    },
  };

  // ONE staged-edit set for the whole panel, and it OUTLIVES a re-render on
  // purpose: a connection test in the middle of planning a routing change must
  // not silently throw the plan away.
  // NOTHING RE-RENDERS UNTIL APPLY (v0.44.1), so staging only repaints the bar
  // and each control repaints its OWN state. A full re-render on every click
  // would re-fetch five endpoints and scroll the list out from under the person
  // using it — the exact fight that release was written to end.
  if (!EX_EDITS) EX_EDITS = editSet(() => EX_BAR && EX_BAR.paint());
  // A render that gated the bar away must not leave the previous one behind as
  // a live reference: paint() on a detached node is a write to nothing.
  EX_BAR = null;
  const edits = EX_EDITS;
  // Which config keys this panel owns is the CLI's answer, read fresh every
  // render. A hard-coded list here would be a second registry.
  EX_CONFIG_KEYS = ((d.config && d.config.keys) || []).filter((k) => k.key.indexOf("extra_") === 0).map((k) => k.key);

  // W8 (v0.51.0) — THE SETUP GATE. `connected` is the CLI's answer (it computes
  // it once, and the config gate and the doctor finding read the same one), so
  // there is no second idea here of what "has anything ever answered" means.
  const connected = !!(d.list && d.list.gate && d.list.gate.connected);
  const out = frag();

  // THE HEADER STRIP AND "WHAT NEEDS YOUR ATTENTION" ARE ON EVERY TAB. The
  // strip is the Knowledge precedent (v0.49.1), and the findings card is the
  // one card that must not be behind a tab: a caution you have to go looking
  // for is a caution nobody reads. Everything else is tabbed.
  out.append(exStrip(d));
  out.append(exFindingsCard(d));

  const tabs = el("div", "tabs");
  // `stack` as well as `tab-pane`: every tab holds several cards, and the
  // container is what spaces panel blocks.
  const pane = el("div", "tab-pane stack");
  // THE GATE STILL DECIDES WHAT EXISTS. With nothing connected there is no
  // routing to draw, no limits worth setting and nothing spent — so those tabs
  // are NOT RENDERED AS EMPTY SHELLS. Setup is the only tab there is, and its
  // own tab is spotlighted (the Crosslink "nothing linked" rule).
  const views = connected
    ? {
        setup: () => exSetupTab(d, body),
        routing: () => exRoutingTab(d, body, edits),
        limits: () => exLimitsTab(d, body, edits),
        spending: () => exSpendingTab(d),
        providers: () => exProvidersTab(d),
      }
    : { setup: () => exSetupTab(d, body) };
  const select = (which) => {
    EX_TAB = which;
    for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.tab === which));
    pane.replaceChildren(views[which]());
  };
  // Keys are written out in full, never assembled from the tab id — a key built
  // from a fragment is invisible to every check that looks for one.
  for (const [which, label] of [
    ["setup", t("extra.tab.setup")],
    ["routing", t("extra.tab.routing")],
    ["limits", t("extra.tab.limits")],
    ["spending", t("extra.tab.spending")],
    ["providers", t("extra.tab.providers")],
  ]) {
    if (!views[which]) continue;
    const b = el("button", null, label);
    b.type = "button";
    b.dataset.tab = which;
    if (!connected && which === "setup") b.classList.add("tab-spot");
    b.addEventListener("click", () => select(which));
    tabs.append(b);
  }
  out.append(tabs, pane);
  body.replaceChildren(out);
  select(views[EX_TAB] ? EX_TAB : "setup");
  // The bar sticks only while dirty, and Discard renders only while dirty —
  // both are editBar's own rules, unchanged. It is GATED with the two cards it
  // belongs to (v0.51.0): "Reset the guardrails" beside a panel that is not
  // showing any guardrails is the same mistake as a Connect button on a tool
  // that is not installed.
  EX_BAR = connected ? exEditBar(edits, body) : null;
  if (EX_BAR) body.append(EX_BAR);
}

/* THE FIVE TABS (v0.53.0).

   This panel was nine cards in one 8,800px scroll — no first step, no last
   step, and no way to be DONE with a section. Knowledge (five tabs, v0.49.1)
   and Crosslink (two, v0.43.7) are the precedent, down to the shared `.tabs` /
   `.tab-pane` in runs.css; Extra was the biggest panel in the app and the only
   big one that never adopted it.

   The grouping is what you DO, in the order you do it: connect something,
   decide where work goes, set the rules, read what it cost, look a provider up.
   Routing carries the band ladder AND the lane table together because a band is
   arithmetic and the lane is the decision — they were two cards you scrolled
   between. */
function exSetupTab(d, body) {
  const out = frag();
  // THE BOUNDARY CARD RENDERS ALWAYS. It is the one thing a first-time reader
  // has to see before they connect anything.
  out.append(exBoundaryCard());
  if (!(d.list && d.list.gate && d.list.gate.connected)) out.append(exGateNotice(d));
  out.append(exToolsCard(d, body));
  out.append(exProfilesCard(d, body));
  return out;
}
function exRoutingTab(d, body, edits) {
  const out = frag();
  out.append(exRoutingCard(d, body, edits));
  out.append(exLanesCard(d));
  return out;
}
function exLimitsTab(d, body, edits) {
  const out = frag();
  out.append(exGuardrailsCard(d, body, edits));
  return out;
}
function exSpendingTab(d) {
  const out = frag();
  out.append(exCostCard(d));
  return out;
}
function exProvidersTab(d) {
  const out = frag();
  out.append(exProvidersCard(d));
  return out;
}

// Which tab was open, so a write that re-renders the panel does not throw you
// back to Setup — the KN_TAB rule.
let EX_TAB = "setup";

// The panel's staged writes. EVERY entry here is an ACTION — a route with a
// body — including the config ones, which stage as `/api/config/set` rather than
// through `applyEdits`. That is why one bar can carry a routing change and a
// guardrail change together, and why `applyActions` needed no new parameter: a
// panel with two Apply buttons is a panel where you forget to press one.
let EX_EDITS = null;
let EX_BAR = null;

function exEditBar(edits, body) {
  return editBar(edits, {
    resetLabel: t("extra.reset.label"),
    onApply: async (btn) => {
      await applyActions(edits, btn);
      edits.clear();
      renderExtra(body);
    },
    onReset: () => exResetModal(edits, body),
    onCancel: () => edits.clear(),
  });
}

/* THE BOUNDARY CARD. It renders ALWAYS and it is never behind a hover or a
   fold — the house-rules precedent. A person about to send their source code to
   a third party should not have to go looking for the paragraph that says so. */
function exBoundaryCard() {
  const c = card(t("extra.boundary.title"));
  c.classList.add("ex-boundary");
  for (const line of [
    t("extra.boundary.leaves"),
    t("extra.boundary.whom"),
    t("extra.boundary.cannot"),
    t("extra.boundary.fence"),
  ])
    c.append(el("p", "ex-boundary-line", line));
  c.append(el("div", "note", t("extra.boundary.probe")));
  return c;
}

/* The header strip. Every number is the CLI's own count; one it could not
   compute renders as an em dash, never as a zero (the Knowledge rule). */
function exStrip(d) {
  const strip = el("div", "ex-strip");
  const counts = (d.list && d.list.counts) || null;
  const item = (label, value) => {
    const box = el("div", "ex-strip-item");
    box.append(el("span", "ex-strip-value", value));
    box.append(el("span", "ex-strip-label", label));
    strip.append(box);
  };
  item(t("extra.strip.profiles"), counts ? String(counts.profiles) : "—");
  // The CLI already counts this. Recounting the array here would be a second
  // idea of what "verified" means, in the panel whose whole gate it is.
  item(t("extra.strip.verified"), counts ? String(counts.verified) : "—");
  item(t("extra.strip.routed"), d.list ? String((d.list.routes || []).length) : "—");
  item(t("extra.strip.findings"), d.doctor ? String((d.doctor.findings || []).length) : "—");
  // The SOONEST deadline across every saved passphrase. An uncomputable value is
  // an em dash, never a guess, and the date is the CLI's — this panel does no
  // arithmetic on it.
  const soon = ((d.list && d.list.profiles) || [])
    .map((x) => x.session)
    .filter((x) => x && x.expires_at)
    .sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))[0];
  item(t("extra.strip.passphrase"), soon ? String(soon.expires_at).slice(0, 10) : "—");
  item(t("extra.strip.catalog"), (d.list && d.list.catalog_as_of) || "—");
  return strip;
}

/* ---------------------------------------------------------------- profiles */

function exProfilesCard(d, body) {
  // "Add a connection" is a WRITE, so it lives in the card head where every
  // other write on this panel will live (W12's rail Apply bar sits below).
  const add = el("button", "btn btn-sm btn-primary", t("extra.add.button"));
  add.type = "button";
  add.disabled = !d.providers;
  add.addEventListener("click", () => exAddModal(d.providers, body, null, d.config));
  const c = card(t("extra.profiles.title"), add);
  if (d.errors.list) {
    c.append(failBox(d.errors.list));
    return c;
  }
  const rows = (d.list && d.list.profiles) || [];
  if (!rows.length) {
    c.append(empty(t("extra.profiles.none"), t("extra.profiles.noneHint")));
    // A connection is added at the terminal until the connect modal lands.
    c.append(el("div", "note", t("extra.profiles.addWhy")));
    return c;
  }
  const max = exConfigValue(d.config, "extra_vault_max_attempts");
  const byProfile = exFindingsByProfile(d.doctor);
  for (const p of rows) c.append(exProfileRow(p, byProfile.get(p.name) || [], max, body, d.config));
  return c;
}

function exProfileRow(p, findings, maxAttempts, body, cfg) {
  const row = el("div", "ex-profile");

  const top = el("div", "row-actions");
  top.append(el("span", "mono ex-name", p.name));
  // `provider/engine` is the CLI's own composite label everywhere else, so it
  // is written the same way here rather than split into two friendlier words.
  top.append(el("span", "note", p.provider + "/" + p.engine));
  top.append(exVerifyChip(p, findings));
  const vault = exVaultChip(p, maxAttempts);
  if (vault) top.append(vault);
  const sess = exSessionChip(p);
  if (sess) top.append(sess);
  row.append(top);

  const kv = [
    [t("extra.profile.engine"), p.engine],
    [t("extra.profile.base"), p.anthropic_base_url || p.base_url || "—"],
    [t("extra.profile.region"), p.region === "default" ? "—" : p.region],
    [t("extra.profile.credential"), exCredentialLine(p)],
    [
      t("extra.profile.modelsLabel"),
      p.models_seen.length ? t("extra.profile.models", { n: p.models_seen.length }) : t("extra.profile.modelsNone"),
    ],
  ];
  row.append(kvList(kv));

  // The model names themselves are DATA the provider returned. They are shown
  // verbatim and never abbreviated into a family name — a family name is a
  // model id that does not exist.
  if (p.models_seen.length) {
    const list = el("div", "ex-models");
    for (const m of p.models_seen) list.append(el("span", "mono ex-model", m));
    row.append(list);
  }

  if (p.privacy) row.append(el("div", "note", t("extra.profile.privacy")));

  // The findings that are about THIS connection, next to it — the caution and
  // the thing it is a caution about on one screen.
  for (const f of findings) row.append(exFindingLine(f));

  const actions = el("div", "row-actions");
  const test = el("button", "btn btn-sm", t("extra.test.button"));
  test.type = "button";
  test.addEventListener("click", () => exTestModal(p, body, cfg));
  actions.append(test);
  // The countdown is only actionable through the one command that can clear it:
  // a correct unlock proves the passphrase and resets the counter to zero. It is
  // offered only where there is a stored key to unlock — never on a tombstone.
  if ((p.credential || {}).vault && p.credential.vault.state === "stored") {
    const unlock = el("button", "btn btn-ghost btn-sm", t("extra.unlock.button"));
    unlock.type = "button";
    unlock.addEventListener("click", () => exUnlockModal(p, body));
    actions.append(unlock);
  }
  // The passphrase's own two actions. EXTEND re-opens the picker with a new
  // deadline measured from today — never an auto-extend on use, because a
  // deadline that renews itself every time you use it is not a deadline.
  if (p.session) {
    const extend = el("button", "btn btn-ghost btn-sm", t("extra.session.extend"));
    extend.type = "button";
    extend.addEventListener("click", () => exSessionModal(p, body, cfg, true));
    actions.append(extend);
    if (p.session.state !== "ABSENT") {
      const forget = el("button", "btn btn-ghost btn-sm", t("extra.session.forget"));
      forget.type = "button";
      forget.addEventListener("click", () => exSessionForgetModal(p, body));
      actions.append(forget);
    }
  }
  const drop = el("button", "btn btn-ghost btn-sm", t("extra.remove.button"));
  drop.type = "button";
  drop.addEventListener("click", () => exRemoveModal(p, body));
  actions.append(drop);
  row.append(actions);
  return row;
}

// THE DEADLINE, beside the vault chip. Every word and every date is the CLI's:
// the state is COMPUTED there on read and never stored, so this renders four
// answers and decides none of them. `not saved` KEEPS ITS SLOT on a vaulted
// connection — that is the state a run STOPS on, and a missing chip would make
// it look like nothing was wrong.
function exSessionChip(p) {
  const sn = p.session;
  if (!sn) return null;
  if (sn.state === "ACTIVE") return chip(t("extra.session.active", { date: String(sn.expires_at).slice(0, 10) }), "ok");
  if (sn.state === "EXPIRING")
    return chip(t("extra.session.expiring", { date: String(sn.expires_at).slice(0, 10), days: sn.days_left }), "warn");
  if (sn.state === "EXPIRED") return chip(t("extra.session.expired"), "bad");
  return chip(t("extra.session.none"), "warn");
}

// UNVERIFIED and STALE are the CLI's states, and they arrive as doctor findings
// rather than being recomputed here: this panel has no idea what
// `extra_verify_max_days` means and must not learn.
function exVerifyChip(p, findings) {
  if (findings.some((f) => f.id === "extra-unverified")) return chip(t("extra.profile.never"), "warn");
  if (!p.verified_at) return chip(t("extra.profile.never"), "warn");
  const stale = findings.some((f) => f.id === "extra-stale-verify");
  const when = String(p.verified_at).slice(0, 10);
  const label =
    t("extra.profile.verifiedAt", { when, how: p.verify_method || "—" }) +
    (p.latency_ms ? " · " + t("extra.profile.latency", { ms: p.latency_ms }) : "");
  return chip(label, stale ? "warn" : "ok");
}

function exCredentialLine(p) {
  const c = p.credential || {};
  // v0.51.0 — a LOCAL TOOL may hold its own credential, and then ORC has nothing
  // to send and nothing is missing. `found`/`not found` are both wrong, so the
  // CLI answers `present: null` and this says what is actually true.
  if (c.source === "tool") return t("extra.profile.credentialTool");
  const where =
    c.source === "vault"
      ? t("extra.profile.credentialVault")
      : t("extra.profile.credentialEnv", { name: c.key_name || "—" });
  return where + " · " + (c.present ? t("extra.profile.present") : t("extra.profile.missing"));
}

// The vault chip carries the CLI's own state word plus the countdown when it is
// non-zero. A zero countdown KEEPS ITS SLOT and reads as no attempts used — a
// countdown toward a destructive action that is not shown is indistinguishable
// from no countdown at all.
function exVaultChip(p, maxAttempts) {
  const v = (p.credential || {}).vault;
  if (!v) return null;
  const used = Number(v.attempts_used) || 0;
  const count =
    used > 0 && maxAttempts !== null
      ? t("extra.vault.attempts", { used, max: maxAttempts })
      : used > 0
        ? t("extra.vault.attempts", { used, max: "—" })
        : t("extra.vault.attemptsNone");
  if (v.state === "wiped") return chip(t("extra.vault.wiped"), "bad");
  if (v.state === "none") return chip(t("extra.vault.none"), "warn");
  return chip(t("extra.vault.stored") + " · " + count, used > 0 ? "warn" : "ok");
}

/* ---------------------------------------------------------------- findings */

function exFindingsByProfile(doctor) {
  const map = new Map();
  for (const f of (doctor && doctor.findings) || []) {
    if (!f.profile) continue;
    if (!map.has(f.profile)) map.set(f.profile, []);
    map.get(f.profile).push(f);
  }
  return map;
}

function exFindingLine(f) {
  const line = el("div", "note ex-finding");
  // The id and the message are the CLI's words. Never softened, never rewritten.
  line.append(chip(f.id, f.fixable === false ? "bad" : "warn"));
  line.append(document.createTextNode(" " + f.message));
  if (f.fixable === false) line.append(el("div", "note", t("extra.findings.notFixable")));
  return line;
}

function exFindingsCard(d) {
  const all = (d.doctor && d.doctor.findings) || [];
  // Only what belongs to no profile lands here; the rest is rendered beside the
  // connection it is about.
  const loose = all.filter((f) => !f.profile);
  const c = card(t("extra.findings.title"));
  if (!all.length) {
    c.append(el("div", "note", t("extra.findings.none")));
    return c;
  }
  for (const f of loose) c.append(exFindingLine(f));
  c.append(laneCommand("orc extra doctor", t("extra.findings.cmdWhy")));
  return c;
}

/* --------------------------------------------------------------- providers */

function exProvidersCard(d) {
  const c = card(t("extra.providers.title"));
  if (d.errors.providers) {
    c.append(failBox(d.errors.providers));
    return c;
  }
  const cat = d.providers || {};
  c.append(el("div", "note", t("extra.providers.sub")));
  c.append(exWhy(t("extra.providers.subWhy")));
  if (cat.stale) c.append(el("div", "banner banner-bad", t("extra.providers.stale")));

  const grid = el("div", "ex-provider-grid");
  for (const p of cat.providers || []) grid.append(exProviderTile(p));
  c.append(grid);
  // The one thing the catalog deliberately does NOT carry, said out loud so
  // nobody goes looking for a model dropdown that will never exist.
  c.append(el("div", "note", t("extra.providers.noModels")));
  return c;
}

function exProviderTile(p) {
  const tile = el("div", "ex-provider");
  // id and label are catalog data: rendered as written, never translated.
  tile.append(el("div", "mono ex-provider-id", p.id));
  tile.append(el("div", "ex-provider-label", p.label));
  const eng = el("div", "row-actions");
  for (const e of p.engines || []) eng.append(chip(e, "info"));
  tile.append(eng);
  if ((p.regions || []).length) {
    const r = el("div", "note");
    r.append(document.createTextNode(t("extra.providers.regions") + ": " + p.regions.map((x) => x.id).join(", ")));
    tile.append(r);
  }
  const links = el("div", "row-actions");
  if (p.docs_url) links.append(exLink(p.docs_url, t("extra.providers.docs")));
  if (p.terms_url) links.append(exLink(p.terms_url, t("extra.providers.terms")));
  if (links.childNodes.length) tile.append(links);
  return tile;
}

// A catalog URL opens in a new tab with no referrer. The shell already sets a
// no-referrer policy; `rel` says it again at the link, because this is the one
// place in the panel that points off the machine.
function exLink(href, label) {
  const a = el("a", "ex-link", label);
  a.href = href;
  a.target = "_blank";
  a.rel = "noreferrer noopener";
  return a;
}

// One config key's effective value, straight from `orc config list --json`.
// `null` when the read failed — which is what makes the attempt ceiling render
// as an em dash rather than as a number this panel made up.
function exConfigValue(cfg, key) {
  const row = ((cfg && cfg.keys) || []).find((k) => k.key === key);
  return row && row.value !== undefined && row.value !== null ? row.value : null;
}

// The legal values of a key, from `orc config list --json`. THE PANEL NAMES NO
// NUMBER ITSELF — the same rule the flow dropdowns are built under, and the
// same grep test enforces it.
function exConfigOptions(cfg, key) {
  const row = ((cfg && cfg.keys) || []).find((k) => k.key === key);
  return (row && Array.isArray(row.options) ? row.options : []).map(String);
}

/* ------------------------------------------- the passphrase and its deadline

   A passphrase stored on the same machine as the vault it opens is NOT A SECOND
   FACTOR ANY MORE. It is a DEADLINE. Every surface that shows the countdown
   repeats the CLI's own sentence saying so, because a promise the product does
   not keep is worse than a feature it does not have.

   At CONNECT TIME this modal is NOT DISMISSIBLE. It has exactly one other
   button, and it is destructive and named — "do not save, disconnect this
   connection" — because a modal with genuinely no way out is a trap the first
   time a write fails, and an escape that DESTROYS the thing being configured
   cannot be pressed by accident and leaves no half-configured state behind. */
function exSessionModal(p, body, cfg, dismissible, pastedKey) {
  const form = el("div", "stack stack-sm");
  form.append(el("div", "note", p.name + " " + "·" + " " + p.provider + "/" + p.engine));

  const pass = exInput(t("extra.save.passPh"), "password");
  const again = exInput(t("extra.save.againPh"), "password");
  form.append(exField(t("extra.save.pass"), pass, t("extra.save.passHint")));
  form.append(exField(t("extra.save.again"), again));

  const opts = exConfigOptions(cfg, "extra_passphrase_ttl_days");
  const current = String(exConfigValue(cfg, "extra_passphrase_ttl_days") || "");
  const ttl = exSelect(opts.map((v) => ({ value: v, label: t("extra.session.days", { n: v }) })));
  if (opts.indexOf(current) !== -1) ttl.value = current;
  form.append(exField(t("extra.session.keepFor"), ttl, t("extra.session.keepForHint")));

  // THE DEADLINE AS A DATE, live under the picker. "30 days" is not something a
  // person can plan around; a date is.
  const when = el("div", "note");
  const paint = () => {
    const d = new Date(Date.now() + Number(ttl.value || 0) * 86400000);
    when.textContent = t("extra.session.until", { date: d.toISOString().slice(0, 10) });
  };
  ttl.addEventListener("change", paint);
  paint();
  form.append(when);

  form.append(el("div", "banner", t("extra.session.honesty")));
  const out = el("div", "note");
  form.append(out);

  const save = async (close) => {
    out.textContent = "";
    if (!pass.value || pass.value !== again.value) {
      out.textContent = t("extra.save.mismatch");
      return;
    }
    setBusy(true);
    try {
      // TWO CALLS, because storing the KEY and caching the PASSPHRASE are two
      // different acts and only one of them has a deadline.
      if (pastedKey) {
        const r = await post("/api/extra/ping", { profile: p.name, key: pastedKey, passphrase: pass.value });
        const d = (r && r.data) || null;
        if (!d || !d.vault || !d.vault.stored) {
          out.textContent = (d && d.vault && d.vault.error) || (r && r.error) || t("common.loadFail");
          return;
        }
      }
      const r2 = await post("/api/extra/session/save", { profile: p.name, ttl_days: ttl.value, passphrase: pass.value });
      const d2 = (r2 && r2.data) || null;
      if (!d2 || !d2.ok) {
        out.textContent = (d2 && d2.error) || (r2 && r2.error) || t("common.loadFail");
        return;
      }
      close();
      exRefresh(body);
    } catch (e) {
      out.textContent = String(e.message);
    } finally {
      setBusy(false);
      pass.value = "";
      again.value = "";
    }
  };

  const actions = [];
  if (dismissible) actions.push({ label: t("common.cancel"), onClick: (c) => c() });
  else
    actions.push({
      // NOT a cancel. It deletes the key and the connection just made, and it
      // says so in the label.
      label: t("extra.session.abandon"),
      cls: "btn-ghost",
      onClick: async (c) => {
        setBusy(true);
        try {
          await post("/api/extra/remove", { name: p.name, reason: "the passphrase was not saved" });
        } catch (_) {
        } finally {
          setBusy(false);
        }
        c();
        exRefresh(body);
      },
    });
  actions.push({ label: t("extra.session.save"), cls: "btn-primary", onClick: (c) => save(c) });

  modal({ title: t("extra.session.title"), body: form, actions, dismissible: dismissible !== false ? true : false });
}

function exSessionForgetModal(p, body) {
  const form = el("div", "stack stack-sm");
  form.append(el("div", "note", t("extra.session.forgetWhat", { name: p.name })));
  modal({
    title: t("extra.session.forget"),
    body: form,
    actions: [
      { label: t("common.cancel"), onClick: (c) => c() },
      {
        label: t("extra.session.forget"),
        cls: "btn-danger",
        onClick: async (c) => {
          c();
          setBusy(true);
          try {
            await post("/api/extra/session/forget", { profile: p.name });
          } finally {
            setBusy(false);
            exRefresh(body);
          }
        },
      },
    ],
  });
}

/* ==================================== the connect modal and the wire (W11) ==
   THE PANEL STILL NEVER TALKS TO A MODEL. Testing a connection POSTs to a route
   that subprocesses `orc extra ping <profile> --json` — the same command you
   would type — so the HTTPS call is the CLI's and every validator, redaction and
   exit code comes for free. That is the whole of what v0.50.0 narrowed in the
   `orc ui` boundary: a probe is a DIAGNOSTIC, the family `orc doctor` is in.

   THE LIFECYCLE IS THE CLI'S: test first, then store. A pasted key is held for
   the probe and NEVER written before the test is green, and a failed test on a
   never-verified profile removes the profile the CLI just wrote — so a typo'd
   key cannot rot in a vault nobody can open. The panel reimplements none of
   that; it calls `add`, then `ping`, and renders what came back.

   A PASTED KEY LEAVES THE BROWSER ONCE, in a POST body over loopback with the
   per-launch token, and reaches the CLI on STDIN. It is never put in a URL,
   never kept past the request, never written to localStorage and never
   re-rendered as a field value. */

// What the probe will do and what it costs, said BEFORE the button — the CLI
// picks the rung, so this describes its ladder and never predicts the outcome.
// Which rung actually answered comes back as `verify_method`, verbatim.
function exProbeNote(engine) {
  const box = el("div", "ex-probe");
  box.append(el("div", "ex-probe-head", t("extra.probe.head")));
  // v0.51.0 — a LOCAL TOOL climbs a different ladder from an endpoint, and its
  // paid rung is not a cheap ping: the tool loads its own system prompt and tool
  // schemas before it sends anything, which is thousands of input tokens against
  // an endpoint probe's ten. The two are therefore quoted separately, and both
  // BEFORE the button.
  if (engine === "cli") {
    box.append(el("div", "note", t("extra.probe.cliFree")));
    box.append(el("div", "note", t("extra.probe.cliPaid")));
    return box;
  }
  box.append(el("div", "note", t("extra.probe.free")));
  box.append(el("div", "note", t("extra.probe.paid")));
  return box;
}

/* THE WIRE. A pulse travels from the credential to the provider and lands green
   or red — the feedback that makes an invisible network call feel like an event.
   The dot's animation is INFINITE while the probe is in flight, which is why
   04-motion.css REMOVES it under reduced motion rather than capping it: a capped
   infinite animation freezes mid-cycle. */
function exWire(fromLabel, toLabel) {
  const wrap = el("div", "ex-wire");
  wrap.append(el("span", "ex-wire-end", fromLabel));
  const line = el("span", "ex-wire-line");
  line.append(el("span", "ex-wire-dot"));
  wrap.append(line);
  wrap.append(el("span", "ex-wire-end", toLabel));
  wrap.arm = () => {
    wrap.classList.remove("ex-wire-ok", "ex-wire-bad");
    wrap.classList.add("ex-wire-live");
  };
  wrap.settle = (ok) => {
    wrap.classList.remove("ex-wire-live");
    wrap.classList.add(ok ? "ex-wire-ok" : "ex-wire-bad");
  };
  return wrap;
}

// One form row, in the shape crosslink's add form already uses.
function exField(labelText, node, hint) {
  // `ex-form-hide` is not decoration: `.field` is a flex box, and an author
  // `display` beats the UA stylesheet's `[hidden]` rule — so a field this form
  // hides needs a rule that names it. See css/panels/extra.css.
  const f = el("label", "field ex-form-hide");
  f.append(el("span", "field-label", labelText));
  f.append(node);
  if (hint) f.append(el("span", "field-hint", hint));
  return f;
}

function exInput(placeholder, type) {
  const i = el("input", "text-input");
  i.type = type || "text";
  if (type === "password") {
    // Never remembered, never autofilled, never re-rendered with a value.
    i.autocomplete = "off";
    i.spellcheck = false;
  }
  if (placeholder) i.placeholder = placeholder;
  return i;
}

function exSelect(options, onChange) {
  const sel = el("select", "text-input");
  for (const o of options) {
    const opt = el("option", null, o.label);
    opt.value = o.value;
    // A value outside its own set leads the list, is labelled, and is DISABLED:
    // the state must be visible, never re-offerable (the v0.44.0 rule).
    if (o.disabled) opt.disabled = true;
    sel.append(opt);
  }
  if (onChange) sel.addEventListener("change", onChange);
  return sel;
}

/* ================================ the native-tools card, and the setup gate ==
   W6/W8 (v0.51.0). Some providers are a LOCAL TOOL rather than an endpoint, and
   a local tool can simply not be installed. When it is absent this card is the
   FIRST thing on the panel and the ONLY thing it offers — no Connect box, no
   test button, no model list, because all three are buttons that cannot succeed.

   THE PANEL SWITCHES ON `state` AND DERIVES NOTHING. Four states arrive from
   `orc extra tools --json`, each with exactly one next action, and every label,
   command, version, URL and alternative in this card came out of that JSON. The
   card names no tool: it cannot, and a test asserts it cannot.

   THE INSTALL OPENS THE USER'S OWN TERMINAL. Not a background job (a hidden
   subprocess makes an elevation prompt, a permissions error, an 80 MB download
   and a forty-second wait all look identical: nothing happened) and not merely a
   string to copy. The exact command renders ABOVE the button — preview-then-
   apply, unchanged — the window is theirs to read and Ctrl-C, and ORC never
   elevates. A machine with no terminal to open degrades to the command, never to
   a dead button. */

function exToolsCard(d, body) {
  const c = card(t("extra.tools.title"));
  const tools = (d.tools && d.tools.tools) || [];
  if (d.errors.tools) {
    c.append(failBox(d.errors.tools));
    return c;
  }
  if (!tools.length) {
    c.append(el("div", "note", t("extra.tools.none")));
    return c;
  }
  c.append(el("div", "note", t("extra.tools.sub")));
  c.append(exWhy(t("extra.tools.subWhy")));
  const grid = el("div", "ex-tool-grid");
  for (const tool of tools) grid.append(exToolBox(tool, d, body));
  c.append(grid);
  // The user will install in another terminal and come back. A card that only
  // refreshed on a full page load would send them away thinking it failed.
  const re = el("button", "btn btn-sm", t("extra.tools.recheck"));
  re.type = "button";
  re.addEventListener("click", () => exRefresh(body));
  const foot = el("div", "row-actions");
  foot.append(re);
  foot.append(el("span", "note", t("extra.tools.recheckWhy")));
  c.append(foot);
  return c;
}

function exToolBox(tool, d, body) {
  const box = el("div", "ex-tool ex-tool-" + tool.state);
  const top = el("div", "row-actions");
  // The label and the binary name are catalog data: written as they arrived.
  top.append(el("span", "ex-tool-name", tool.label));
  top.append(el("span", "mono note", tool.bin));
  top.append(chip(tool.state, tool.state === "ready" ? "ok" : tool.state === "absent" ? "bad" : "warn"));
  box.append(top);

  // v0.53.0 — ONE SENTENCE AND ONE CONTROL PER STATE. Four states carry four
  // different shapes and exactly ONE action each, and the `absent` card used to
  // stack five paragraphs above its button. Everything a state does not need in
  // order to be acted on now lives behind `exToolMore`. Nothing is removed and
  // nothing about the states, their colours or their next actions changes —
  // those are all `orc extra tools`'s answers.
  if (tool.state === "absent") {
    box.append(el("div", "note", t("extra.tools.absentWhat")));
    box.append(exInstallRow(tool, body));
    const more = exToolMore();
    // `null` MEANS THERE IS NONE — never that ORC forgot to look. The two cases
    // must not render the same, and neither may render as an empty slot.
    if (tool.no_install_alternative) {
      const alt = el("div", "note");
      alt.append(document.createTextNode(t("extra.tools.altYes") + " "));
      alt.append(el("span", "mono", tool.no_install_alternative));
      more.append(alt);
    } else {
      more.append(el("div", "note", t("extra.tools.altNone")));
    }
    if (tool.docs_url) more.append(exLink(tool.docs_url, t("extra.providers.docs")));
    box.append(more);
    return box;
  }

  const kv = [
    [t("extra.tools.version"), tool.version || t("extra.tools.versionUnknown")],
    [t("extra.tools.floor"), tool.min_version || "—"],
    [t("extra.tools.auth"), tool.auth_detail || (tool.authed === null ? "—" : tool.authed ? t("extra.tools.authYes") : t("extra.tools.authNo"))],
    [t("extra.tools.models"), tool.models_count === null ? "—" : String(tool.models_count)],
  ];
  const kvDl = kvList(kv);
  // The auth string is the one unbounded field on this card, so it is TAGGED and
  // clamped in CSS — see `.ex-tool .kv dd.ex-auth-detail`. Found by its own
  // label rather than by an index, because kvList drops empty rows.
  const authDt = Array.from(kvDl.querySelectorAll("dt")).find((x) => x.textContent === t("extra.tools.auth"));
  if (authDt && authDt.nextElementSibling) authDt.nextElementSibling.classList.add("ex-auth-detail");
  // THE DIAGNOSTICS GO BEHIND THE DISCLOSURE. A version, a floor, an auth string
  // and a model count are what you read when something is wrong; the state chip
  // already told you whether it is. The PROBE ERROR stays out here — it is the
  // reason for the state, not detail about it.
  const more = exToolMore();
  more.append(kvDl);
  if (tool.bin_path) more.append(el("div", "note mono ex-tool-path", tool.bin_path));
  if (tool.probe_error) box.append(el("div", "note bad", tool.probe_error));

  if (tool.state === "outdated") {
    box.append(el("div", "note", t("extra.tools.outdatedWhat")));
    box.append(exInstallRow(tool, body));
    box.append(more);
    return box;
  }
  if (tool.state === "unauthenticated") {
    box.append(el("div", "note", t("extra.tools.unauthWhat")));
    box.append(exKeyhelpRow(tool, d, body));
    box.append(more);
    return box;
  }
  // ready — and READY IS NOT THE SAME AS UNCONNECTED. `connected` / `verified`
  // are computed by `orc extra tools`, never joined here.
  const actions = el("div", "row-actions");
  if (tool.verified) {
    // A state must be VISIBLE, never re-offerable. There is NO Connect button
    // here, not a disabled one: an absent control and a dead control must not
    // look the same (the `no_install_alternative: null` rule).
    const named = tool.connected_profiles.filter((x) => x.verified_at).map((x) => x.name).join(", ");
    box.append(chip(t("extra.tools.connectedAs") + " " + named, "ok"));
    actions.append(exToolTestBtn(tool, d, body));
  } else if (tool.connected) {
    // Configured and never tested — the setup gate's own state, in the setup
    // gate's own words. The action is a test, not another connection.
    box.append(el("div", "note", t("extra.tools.connectedUntested")));
    actions.append(exToolTestBtn(tool, d, body));
  } else {
    const connect = el("button", "btn btn-sm btn-primary", t("extra.tools.connect"));
    connect.type = "button";
    connect.addEventListener("click", () => exAddModal(d.providers, body, tool, d.config));
    actions.append(connect);
  }
  // A second connection to the same tool with a different model map is
  // legitimate, so it stays available — as a SECONDARY, because it is not what
  // someone looking at a connected card came for.
  if (tool.connected) {
    const again = el("button", "btn btn-sm", t("extra.tools.addAnother"));
    again.type = "button";
    again.addEventListener("click", () => exAddModal(d.providers, body, tool, d.config));
    actions.append(again);
  }
  box.append(actions);
  box.append(more);
  return box;
}

/* THE "WHY" DISCLOSURE (v0.53.0).

   The copy problem on this panel was never that it was untranslated — both
   tables are complete. It was that DESIGN RATIONALE WAS BEING SERVED AS USER
   INSTRUCTION. "A gap is not a hole … so 'I left the hardest work on Claude on
   purpose' and 'there is no top band' can never look the same" is true, and it
   belongs in knowledge.md; as the first thing under a table it tells a
   first-time reader nothing about what to do.

   So the shape is: the INSTRUCTION first, in Simplified Technical English (one
   sentence, active, twenty words at most — bin/webui/i18n/TERMS.md), and the
   REASONING underneath, collapsed. Nothing is deleted; the rationale keeps its
   own voice, which is the one thing TERMS.md protects. It is just no longer in
   the way. */
function exWhy(text) {
  const d = document.createElement("details");
  d.className = "ex-more ex-why";
  const s = document.createElement("summary");
  s.textContent = t("extra.why");
  d.append(s, el("div", "note", text));
  return d;
}

/* THE DISCLOSURE. A native <details>, so the open/closed state, the keyboard
   handling and the toggle are the browser's rather than a fourth hand-rolled
   expander. It is CLOSED by default because a card whose whole content is
   visible has no first thing to look at — and it holds only detail: a state
   never hides the control that acts on it. */
function exToolMore() {
  const d = document.createElement("details");
  d.className = "ex-more";
  const s = document.createElement("summary");
  s.textContent = t("extra.tools.more");
  d.append(s);
  return d;
}

// The one action that can still tell you something about a connected tool. The
// profile it opens on is the CLI's — the first one this tool's row names.
function exToolTestBtn(tool, d, body) {
  const btn = el("button", "btn btn-sm btn-primary", t("extra.tools.test"));
  btn.type = "button";
  btn.addEventListener("click", () => {
    const first = tool.connected_profiles[0];
    const full = ((d.list && d.list.profiles) || []).find((x) => x.name === first.name);
    if (full) exTestModal(full, body, d.config);
  });
  return btn;
}

// PREVIEW THEN APPLY, unchanged: the exact command is visible ABOVE the button,
// and the button is what runs it in a terminal the user can watch.
function exInstallRow(tool, body) {
  const wrap = el("div", "ex-install");
  const inst = tool.install || {};
  const cmds = (inst.cmds || []).length ? inst.cmds : inst.all_cmds || [];
  if (!cmds.length) {
    wrap.append(el("div", "note", t("extra.tools.noCommand")));
    if (inst.docs_url) wrap.append(exLink(inst.docs_url, t("extra.providers.docs")));
    return wrap;
  }
  // The CLI already filtered these to this platform, so the panel picks nothing.
  const pick = cmds.length > 1 ? exSelect(cmds.map((x) => ({ value: x.manager, label: x.manager }))) : null;
  const cmdLine = el("div", "action-cmd", cmds[0].cmd);
  const setCmd = () => {
    const chosen = cmds.find((x) => x.manager === (pick ? pick.value : cmds[0].manager)) || cmds[0];
    cmdLine.textContent = chosen.cmd;
  };
  if (pick) pick.addEventListener("change", setCmd);
  wrap.append(el("div", "note", t("extra.tools.willRun")));
  if (pick) wrap.append(pick);
  wrap.append(cmdLine);
  const out = el("div", "note");
  const btn = el("button", "btn btn-sm btn-primary", t("extra.tools.install"));
  btn.type = "button";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    out.textContent = "";
    try {
      const r = await post("/api/extra/install", {
        provider: tool.provider,
        manager: pick ? pick.value : cmds[0].manager,
      });
      const j = (r && r.data) || null;
      if (!j) {
        out.textContent = (r && r.error) || t("common.loadFail");
        return;
      }
      // `launched: false` is an ANSWER, not an error — the command stays on
      // screen and the user runs it themselves.
      out.textContent = j.note;
      wrap.append(el("div", "note", t("extra.tools.neverElevates")));
    } catch (e) {
      out.textContent = String(e.message);
    } finally {
      btn.disabled = false;
    }
  });
  wrap.append(btn, out);
  return wrap;
}

// Whatever `orc extra keyhelp` returned, rendered. The panel does not decide
// which of the three routes applies and never pipes a key itself.
function exKeyhelpRow(tool, d, body) {
  const wrap = el("div", "ex-keyhelp");
  wrap.append(el("div", "note", t("extra.tools.keyhelpSub")));
  const profiles = ((d.list && d.list.profiles) || []).filter((p) => p.provider === tool.provider);
  if (!profiles.length) {
    // The credential route is a property of a PROFILE (which variable, which
    // key), so there is nothing to compute until one exists.
    wrap.append(el("div", "note", t("extra.tools.keyhelpNoProfile")));
    const connect = el("button", "btn btn-sm", t("extra.tools.connect"));
    connect.type = "button";
    connect.addEventListener("click", () => exAddModal(d.providers, body, tool, d.config));
    wrap.append(connect);
    return wrap;
  }
  const out = el("div", "stack stack-sm");
  wrap.append(out);
  read("/api/extra/keyhelp?profile=" + encodeURIComponent(profiles[0].name))
    .then((r) => {
      const k = r.data;
      if (!k) return;
      out.append(chip(k.route, k.route === "env" ? "ok" : "warn"));
      out.append(el("div", "note", k.why));
      if (k.env_var) out.append(el("div", "note mono", k.env_var));
      if (k.note) out.append(el("div", "note", k.note));
      if (k.cmd) {
        out.append(el("div", "action-cmd", k.cmd));
        out.append(el("div", "note", t("extra.tools.loginManual")));
      }
      // v0.52.0 (D3 Part 2) — HOW to set the variable, per OS. Every command is
      // the CLI's and carries a PLACEHOLDER, never a key, so nothing here can
      // leak into a screenshot or a copy button. ORC does not run it: `setx`
      // would put the key in argv and an `export` line writes it in plaintext.
      exEnvSetBlock(out, k.env_set);
      // v0.53.3 — the route WITH A DEADLINE first, then the variable. Both
      // lines are the CLI's; the panel names no command of its own.
      if (k.vault_unlock) {
        out.append(el("div", "action-cmd", k.vault_unlock.cmd));
        out.append(el("div", "note", k.vault_unlock.why));
      }
      exEnvSetBlock(out, k.key_env);
    })
    .catch((e) => out.append(failBox(e)));
  return wrap;
}

// The per-OS instruction, rendered. The panel names no command of its own — the
// two lines and the note are all computed by `orc extra keyhelp`.
function exEnvSetBlock(out, block) {
  if (!block) return;
  out.append(el("div", "field-label", t("extra.keyhelp.session")));
  out.append(el("div", "action-cmd", block.session));
  out.append(el("div", "field-label", t("extra.keyhelp.persist")));
  out.append(el("div", "action-cmd", block.persist));
  out.append(el("div", "note", block.persist_note));
  // The honest half of the persistent form, when there is one.
  if (block.warning) out.append(el("div", "note bad", block.warning));
}

/* THE SETUP GATE. Until one connection has answered, the routing table, the
   limits, the cost report and the full provider catalogue are NOT APPENDED —
   not hidden, not disabled: absent. Every one of them is a control for work that
   cannot happen yet, and a panel that offers them teaches somebody to configure
   a routing table that will never fire.

   It has TWO FLOORS and the CLI says which one you are on, because the
   instruction differs: with nothing installed and no key the answer is an
   INSTALL, and with a connection that has never answered the answer is TEST IT.
   Someone with neither should never be shown a Connect box that cannot succeed. */
function exGateNotice(d) {
  const gate = (d.list && d.list.gate) || null;
  const box = el("div", "banner ex-gate");
  box.append(el("div", "ex-gate-head", t("extra.gate.title")));
  box.append(
    el("div", null, gate && gate.floor === "never-tested" ? t("extra.gate.neverTested") : t("extra.gate.noConnection"))
  );
  box.append(el("div", "note", t("extra.gate.hidden")));
  box.append(exWhy(t("extra.gate.hiddenWhy")));
  // The CLI's own sentence about what to do next, in the CLI's own words.
  if (gate && gate.next) box.append(el("div", "action-cmd", gate.next));
  return box;
}

/* ---------------------------------------------------------- the add modal -- */

function exAddModal(cat, body, tool, cfg) {
  const providers = (cat && cat.providers) || [];
  const form = el("div", "stack stack-sm");

  const name = exInput(t("extra.add.namePh"));
  // The provider list is the catalog's, in the catalog's order, with the
  // catalog's own ids and labels. The panel names none of them.
  const provider = exSelect(
    providers.map((p) => ({ value: p.id, label: p.id + " — " + p.label })),
    () => sync()
  );
  const engine = exSelect([]);
  const region = exSelect([]);
  const baseUrl = exInput("");
  const envKey = exInput("");
  // v0.51.0 — this placeholder used to be a hard-coded tool name, which became
  // a catalog id and therefore a provider this panel named. It is the selected
  // provider's own `cli_bin` now, or empty.
  const cliBin = exInput("");
  const cliAgent = exInput(t("extra.add.cliAgentPh"));
  const key = exInput(t("extra.add.keyPh"), "password");

  // Env-var NAME first and selected by default (D3): an environment variable
  // your OS already protects beats a passphrase you will forget. Pasting a key
  // is the second option, and it is warned rather than hidden.
  const srcEnv = el("input");
  srcEnv.type = "radio";
  srcEnv.name = "ex-cred";
  srcEnv.checked = true;
  const srcVault = el("input");
  srcVault.type = "radio";
  srcVault.name = "ex-cred";
  // v0.52.0 — THE THIRD SOURCE, and the one that was missing. A local tool that
  // already signed itself in holds its own credential, so it needs no key from
  // ORC: no env var to set, no vault, no passphrase and no deadline. The CLI has
  // had `--tool-auth` since v0.51.0; the panel offered two radios, so a
  // signed-in tool was pushed into the vault and the vault then locked the run.
  // Offered only where it can be true: engine `cli`, on a catalog row that has a
  // binary.
  const srcTool = el("input");
  srcTool.type = "radio";
  srcTool.name = "ex-cred";
  const srcRow = el("div", "ex-cred-choice");
  const lblEnv = el("label", "ex-cred-opt");
  lblEnv.append(srcEnv, el("span", null, t("extra.add.sourceEnv")));
  const lblVault = el("label", "ex-cred-opt");
  lblVault.append(srcVault, el("span", null, t("extra.add.sourceVault")));
  const lblTool = el("label", "ex-cred-opt");
  lblTool.append(srcTool, el("span", null, t("extra.add.sourceTool")));
  srcRow.append(lblEnv, lblVault, lblTool);
  srcEnv.addEventListener("change", () => sync());
  srcVault.addEventListener("change", () => sync());
  srcTool.addEventListener("change", () => sync());

  const fName = exField(t("extra.add.name"), name, t("extra.add.nameHint"));
  const fProvider = exField(t("extra.add.provider"), provider);
  const fEngine = exField(t("extra.add.engine"), engine, t("extra.add.engineHint"));
  const fRegion = exField(t("extra.add.region"), region);
  const fBase = exField(t("extra.add.base"), baseUrl, t("extra.add.baseHint"));
  const fCliBin = exField(t("extra.add.cliBin"), cliBin, t("extra.add.cliBinHint"));
  const fCliAgent = exField(t("extra.add.cliAgent"), cliAgent);
  const fEnvKey = exField(t("extra.add.envKey"), envKey, t("extra.add.envKeyHint"));
  const fKey = exField(t("extra.add.key"), key, t("extra.add.keyHint"));

  const grid = el("div", "linkform");
  grid.append(fName, fProvider, fEngine, fRegion, fBase, fCliBin, fCliAgent);
  form.append(grid);
  form.append(el("div", "field-label", t("extra.add.credential")));
  form.append(srcRow);
  const credGrid = el("div", "linkform");
  credGrid.append(fEnvKey, fKey);
  form.append(credGrid);
  const vaultWarn = el("div", "banner banner-bad ex-form-hide", t("extra.add.vaultWarn"));
  form.append(vaultWarn);
  const toolNote = el("div", "banner ex-form-hide", t("extra.add.sourceToolHint"));
  form.append(toolNote);
  // The rung ladder differs per engine and so does what it COSTS, so the note is
  // repainted whenever the engine changes rather than fixed at the top of a form
  // whose engine the user has not picked yet.
  const probeNote = el("div");
  form.append(probeNote);

  const wire = exWire(t("extra.wire.you"), t("extra.wire.provider"));
  form.append(wire);
  const result = el("div", "ex-result");
  form.append(result);

  const row = () => providers.find((p) => p.id === provider.value) || null;

  // Everything the form offers is derived from the catalog row: the engines this
  // provider ships, the regions it has, the variable it reads by default. A
  // field the CLI would refuse is never offered here.
  function sync() {
    const r = row();
    const engines = (r && r.engines) || [];
    const keep = engine.value;
    engine.replaceChildren();
    for (const e of engines) {
      const o = el("option", null, e);
      o.value = e;
      engine.append(o);
    }
    if (engines.includes(keep)) engine.value = keep;

    const regions = [{ value: "default", label: "default" }].concat(
      ((r && r.regions) || []).map((x) => ({ value: x.id, label: x.id + " — " + x.label }))
    );
    const keepR = region.value;
    region.replaceChildren();
    for (const x of regions) {
      const o = el("option", null, x.label);
      o.value = x.value;
      region.append(o);
    }
    if (regions.some((x) => x.value === keepR)) region.value = keepR;
    fRegion.hidden = regions.length < 2;

    const isCli = engine.value === "cli";
    fCliBin.hidden = !isCli;
    fCliAgent.hidden = !isCli;
    // Engine `cli` has no endpoint at all, and `api` / `claude-shim` read
    // different halves of the catalog — the placeholder is whichever base the
    // CLI will actually use, so an empty field means "the catalog's".
    fBase.hidden = isCli;
    baseUrl.placeholder = (engine.value === "claude-shim" ? r && r.anthropic_base : r && r.api_base) || "";
    cliBin.placeholder = (r && r.cli_bin) || "";
    envKey.placeholder = (r && r.env_key_default) || "";

    probeNote.replaceChildren(exProbeNote(engine.value));

    // The tool source only exists where a tool does. If the engine moves away
    // from `cli` while it is selected, the choice falls back to the default
    // rather than staying checked on a hidden radio.
    const toolable = isCli && !!(r && r.cli_bin);
    lblTool.hidden = !toolable;
    if (!toolable && srcTool.checked) srcEnv.checked = true;

    const vault = srcVault.checked;
    const toolAuth = srcTool.checked && toolable;
    // A tool that holds its own credential is asked for NEITHER field. Showing
    // an empty env box beside it would read as something still to fill in.
    fEnvKey.hidden = vault || toolAuth;
    fKey.hidden = !vault;
    vaultWarn.hidden = !vault;
    toolNote.hidden = !toolAuth;
  }
  engine.addEventListener("change", () => sync());
  // Connect from a READY tool box pre-selects that provider and pre-fills the
  // binary, so the one thing the user was looking at is the one thing the form
  // opens on. Both values are the CLI's — the panel names neither.
  if (tool && providers.some((p) => p.id === tool.provider)) {
    provider.value = tool.provider;
    sync();
    if (Array.from(engine.options).some((o) => o.value === "cli")) engine.value = "cli";
    cliBin.value = tool.bin || "";
    // Decision 2 — PRE-SELECT the tool source when the card the user pressed
    // Connect on says the tool is signed in. The form opens on the state they
    // were already looking at, and the hint says what the other two are for.
    if (tool.authed) srcTool.checked = true;
  }
  sync();

  const run = async (btn) => {
    result.replaceChildren();
    if (!name.value.trim()) {
      result.append(el("div", "note bad", t("extra.add.needName")));
      return;
    }
    btn.disabled = true;
    btn.textContent = t("extra.test.running");
    wire.arm();
    setBusy(true);
    try {
      const added = await post("/api/extra/add", {
        name: name.value.trim(),
        provider: provider.value,
        engine: engine.value,
        region: region.value,
        base_url: engine.value === "claude-shim" ? "" : baseUrl.value.trim(),
        anthropic_base_url: engine.value === "claude-shim" ? baseUrl.value.trim() : "",
        cli_bin: engine.value === "cli" ? cliBin.value.trim() : "",
        cli_agent: engine.value === "cli" ? cliAgent.value.trim() : "",
        tool_auth: srcTool.checked,
        vault: srcVault.checked,
        env_key: srcVault.checked || srcTool.checked ? "" : envKey.value.trim(),
      });
      if (added.fixture) {
        wire.settle(false);
        result.append(el("div", "note", t("extra.fixture")));
        return;
      }
      if (!added.ok) {
        wire.settle(false);
        // The CLI's own refusal, in the CLI's own words. There is no second idea
        // of a valid provider, engine, region or credential source in this panel.
        result.append(exOutput(added.output || added.command));
        return;
      }
      const ping = await post("/api/extra/ping", {
        profile: name.value.trim(),
        key: srcVault.checked ? key.value : "",
      });
      exPingResult(result, wire, ping, name.value.trim(), key.value, body, cfg);
    } catch (e) {
      wire.settle(false);
      result.append(failBox(e));
    } finally {
      btn.disabled = false;
      btn.textContent = t("extra.test.button");
      setBusy(false);
      // The pasted key leaves the form the moment it has been sent.
      key.value = "";
    }
  };

  modal({
    title: t("extra.add.title"),
    body: form,
    actions: [
      { label: t("common.cancel"), onClick: (c) => c() },
      {
        label: t("extra.test.button"),
        cls: "btn-primary",
        id: "ex-test-btn",
        onClick: () => run(document.getElementById("ex-test-btn")),
      },
    ],
  });
}

/* ------------------------------------------------- test an existing profile */

function exTestModal(p, body, cfg) {
  const form = el("div", "stack stack-sm");
  form.append(el("div", "note", p.name + " · " + p.provider + "/" + p.engine));
  form.append(exProbeNote(p.engine));

  // A VAULTED KEY IS RE-PROBED WITH ITS PASSPHRASE (v0.50.0, W14): the CLI
  // decrypts the stored key into memory for the probe and nothing else. Pasting
  // a key here instead REPLACES it, which is the path for a key you rotated at
  // the provider — the two are different acts and the form says which is which.
  const vaulted = (p.credential || {}).source === "vault";
  const key = exInput(t("extra.add.keyPh"), "password");
  const pass = exInput(t("extra.save.passPh"), "password");
  if (vaulted) {
    form.append(el("div", "banner", t("extra.test.vaultedNote")));
    form.append(exField(t("extra.save.pass"), pass, t("extra.test.passHint")));
    form.append(exField(t("extra.test.replaceKey"), key, t("extra.test.replaceKeyHint")));
  }

  // v0.51.0 — the PAID rung, and it is a button of its own so it can never be
  // pressed by accident. The model comes from the same CLI-decided control the
  // routing table uses, because a live test of a model you cannot name is not a
  // test of anything.
  const box = exModelBox(t("extra.routing.modelPh"));
  box.load(p.name);
  form.append(exField(t("extra.test.model"), box.node, t("extra.test.modelHint")));

  const wire = exWire(t("extra.wire.you"), t("extra.wire.provider"));
  form.append(wire);
  const result = el("div", "ex-result");
  form.append(result);

  const run = async (btn, live) => {
    result.replaceChildren();
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = t("extra.test.running");
    wire.arm();
    setBusy(true);
    try {
      const r = await post("/api/extra/ping", {
        profile: p.name,
        key: vaulted ? key.value : "",
        passphrase: vaulted ? pass.value : "",
        live: !!live,
        model: live ? box.value() : "",
      });
      exPingResult(result, wire, r, p.name, vaulted ? key.value : "", body, cfg);
    } catch (e) {
      wire.settle(false);
      result.append(failBox(e));
    } finally {
      btn.disabled = false;
      // Its OWN label back. The free rung and the paid rung are different acts
      // and one of them costs money — they may never end up reading the same.
      btn.textContent = label;
      setBusy(false);
      key.value = "";
      pass.value = "";
    }
  };

  modal({
    title: t("extra.test.title", { name: p.name }),
    body: form,
    actions: [
      { label: t("common.close"), onClick: (c) => c() },
      {
        label: t("extra.test.live"),
        id: "ex-live-btn",
        onClick: () => run(document.getElementById("ex-live-btn"), true),
      },
      {
        label: t("extra.test.button"),
        cls: "btn-primary",
        id: "ex-test-btn",
        onClick: () => run(document.getElementById("ex-test-btn"), false),
      },
    ],
  });
}

/* ------------------------------------------------------------- the result -- */

// Everything rendered here is the CLI's `--json` object. The panel adds no
// verdict of its own: `ok` is the CLI's, `verify_method` is which rung actually
// answered, and `note` is its own caveat about what that rung did NOT prove.
function exPingResult(result, wire, payload, profile, pastedKey, body, cfg) {
  result.replaceChildren();
  if (payload && payload.fixture) {
    wire.settle(false);
    result.append(el("div", "note", t("extra.fixture")));
    return;
  }
  const d = (payload && payload.data) || null;
  if (!d) {
    wire.settle(false);
    result.append(el("div", "note bad", (payload && payload.error) || t("common.loadFail")));
    return;
  }
  wire.settle(!!d.ok);
  if (!d.ok) {
    const box = el("div", "ex-result-bad");
    box.append(chip(d.reason || "unreachable", "bad"));
    if (d.error) box.append(el("div", "note", d.error));
    if (d.base_url) box.append(el("div", "note mono", d.base_url));
    // v0.51.0 — a tool that is not installed is not an unreachable endpoint, and
    // the fix is not a retry. The CLI carries the command; the panel prints it.
    if (d.install_cmd) box.append(el("div", "action-cmd", d.install_cmd));
    if (d.reason === "not-installed")
      box.append(
        el("div", "note", d.no_install_alternative ? t("extra.tools.altYes") + " " + d.no_install_alternative : t("extra.tools.altNone"))
      );
    // The reset the CLI performed, said out loud: a failed test on a connection
    // that had never verified leaves NOTHING behind.
    if (d.profile_reverted) box.append(el("div", "note", t("extra.result.reverted")));
    result.append(box);
    exRefresh(body);
    return;
  }

  const box = el("div", "ex-result-ok");
  box.append(
    chip(
      t("extra.result.verified", { how: d.verify_method || "—" }) +
        (d.latency_ms ? " · " + t("extra.profile.latency", { ms: d.latency_ms }) : ""),
      "ok"
    )
  );
  if (d.models_seen && d.models_seen.length) {
    const list = el("div", "ex-models");
    for (const m of d.models_seen) list.append(el("span", "mono ex-model", m));
    box.append(list);
  }
  // A rung that authenticated and then rejected an invented model name proves
  // the URL and the credential and NOTHING about a model. The CLI says so; it is
  // shown, never softened.
  if (d.note) box.append(el("div", "note", d.note));
  exLiveBlock(box, d);

  // THE SAVE OPENS ONLY ON A GREEN TEST, and the self-destruct is named BEFORE
  // the save rather than after it.
  if (d.vault && d.vault.stored) {
    box.append(el("div", "note", t("extra.save.stored", { pepper: d.vault.pepper })));
    if (d.vault.honesty) box.append(el("div", "note", d.vault.honesty));
  } else if (d.vault && d.vault.error) {
    box.append(el("div", "note", d.vault.error));
    // v0.52.0 — THE HARD GATE. The save used to be an optional inline box the
    // user could ignore, and ignoring it is what left a vaulted key with no
    // passphrase and a run that locked at wave 1. A green test on a connection
    // that will hold its key in the vault now opens a modal with no exit but
    // Save and one destructive escape.
    if (pastedKey) box.append(exSaveRow(profile, pastedKey, body, cfg));
  }
  result.append(box);
  exRefresh(body);
}

/* THE LIVE RESULT. Everything here is the CLI's `--json` object and the panel
   adds no verdict of its own.

   TWO HONESTIES ARE NOT OPTIONAL CHROME.

   `model_reported: null` WITH `reports_model: false` is a real pair, not a
   missing field: neither local tool reports which model answered, so a
   substitution is INVISIBLE on that engine. The renderer says that sentence and
   never leaves a blank, because a blank reads as "nothing went wrong".

   The reply is FOREIGN INPUT (`_shared/untrusted-input.md`): a third party's
   text, capped by the CLI, rendered as DOM text and never as HTML, and never
   acted on. It is evidence that something answered — nothing more. */
function exLiveBlock(box, d) {
  if (!d.reply_excerpt && !d.tokens && !d.model_requested) return;
  const live = el("div", "ex-live");
  const head = el("div", "row-actions");
  if (d.latency_ms) head.append(chip(t("extra.profile.latency", { ms: d.latency_ms }), "info"));
  if (d.model_requested) head.append(el("span", "mono note", d.model_requested));
  live.append(head);

  const kv = [[t("extra.live.requested"), d.model_requested || "—"]];
  kv.push([
    t("extra.live.reported"),
    d.model_reported ? d.model_reported : d.reports_model === false ? t("extra.live.noReport") : "—",
  ]);
  live.append(kvList(kv));

  if (d.reply_excerpt) {
    live.append(el("div", "field-label", t("extra.live.reply")));
    // DOM text, never HTML. The cap is the CLI's.
    live.append(el("pre", "block wrap ex-live-reply", d.reply_excerpt));
    if (d.reply_truncated) live.append(el("div", "note", t("extra.live.truncated")));
    if (d.foreign_input) live.append(el("div", "note", d.foreign_input));
  }
  if (d.tokens) {
    // FOUR KINDS, NEVER BLENDED (/orc-budget). A kind the tool has no concept of
    // reads an em dash, never a zero — unknown is not zero.
    const rows = [
      [t("extra.live.input"), d.tokens.input],
      [t("extra.live.cacheWrite"), d.tokens.cache_write],
      [t("extra.live.cacheRead"), d.tokens.cache_read],
      [t("extra.live.output"), d.tokens.output],
    ];
    live.append(kvList(rows.map(([k, v]) => [k, v === null || v === undefined ? "—" : String(v)])));
  }
  if (d.cost_note) live.append(el("div", "note", d.cost_note));
  box.append(live);
}

// Saving re-runs the test with the passphrase attached, because that is the only
// way the CLI ever stores a key: proved by a live connection first, every time.
//
// v0.52.0 — the inline form is now the LAST RESORT rather than the route. When
// the panel knows the config (and it does, everywhere the connect flow runs) the
// key and its deadline are asked for together, in a modal that cannot be walked
// away from half-done.
function exSaveRow(profile, pastedKey, body, cfg) {
  if (cfg) {
    exSessionModal({ name: profile, provider: "", engine: "", session: null }, body, cfg, false, pastedKey);
    return el("div", "note", t("extra.session.opened"));
  }
  return exSaveRowInline(profile, pastedKey, body);
}

function exSaveRowInline(profile, pastedKey, body) {
  const wrap = el("div", "ex-save");
  wrap.append(el("div", "ex-probe-head", t("extra.save.head")));
  wrap.append(el("div", "banner banner-bad", t("extra.save.warning")));
  const pass = exInput(t("extra.save.passPh"), "password");
  const again = exInput(t("extra.save.againPh"), "password");
  wrap.append(exField(t("extra.save.pass"), pass, t("extra.save.passHint")));
  wrap.append(exField(t("extra.save.again"), again));
  const out = el("div", "note");
  const b = el("button", "btn btn-sm btn-primary btn-allow-busy", t("extra.save.button"));
  b.type = "button";
  b.addEventListener("click", async () => {
    out.textContent = "";
    if (!pass.value || pass.value !== again.value) {
      out.textContent = t("extra.save.mismatch");
      return;
    }
    b.disabled = true;
    try {
      const r = await post("/api/extra/ping", { profile, key: pastedKey, passphrase: pass.value });
      const d = (r && r.data) || null;
      if (d && d.vault && d.vault.stored) {
        out.textContent = t("extra.save.stored", { pepper: d.vault.pepper });
        wrap.replaceChildren(out);
        if (d.vault.honesty) wrap.append(el("div", "note", d.vault.honesty));
        exRefresh(body);
      } else {
        out.textContent = (d && d.vault && d.vault.error) || (r && r.error) || t("common.loadFail");
      }
    } catch (e) {
      out.textContent = String(e.message);
    } finally {
      b.disabled = false;
      pass.value = "";
      again.value = "";
    }
  });
  wrap.append(b, out);
  return wrap;
}

/* ------------------------------------------------------------ unlock, remove */

// The ONE action that clears a countdown: a correct passphrase resets the
// counter to zero. It never yields the key — `orc extra unlock` answers one
// question, with a yes or a no.
function exUnlockModal(p, body) {
  const form = el("div", "stack stack-sm");
  form.append(el("div", "note", t("extra.unlock.what")));
  const pass = exInput(t("extra.save.passPh"), "password");
  form.append(exField(t("extra.save.pass"), pass));
  const out = el("div", "note");
  form.append(out);
  modal({
    title: t("extra.unlock.title", { name: p.name }),
    body: form,
    actions: [
      { label: t("common.cancel"), onClick: (c) => c() },
      {
        label: t("extra.unlock.button"),
        cls: "btn-primary",
        id: "ex-unlock-btn",
        onClick: async () => {
          const b = document.getElementById("ex-unlock-btn");
          out.textContent = "";
          b.disabled = true;
          try {
            const r = await post("/api/extra/unlock", { profile: p.name, passphrase: pass.value });
            const d = (r && r.data) || null;
            out.replaceChildren();
            // The countdown is the CLI's own message, verbatim — "wrong
            // passphrase — attempt 8 of 10" is the point, and a panel that
            // summarised it would delete the one number this feature exists to
            // show. Its honesty line rides with it: the counter stops someone at
            // your keyboard and does not stop someone who copied the file.
            if (d && d.ok) out.append(el("div", null, t("extra.unlock.ok")));
            else if (d) {
              out.append(el("div", "bad", d.error || t("common.loadFail")));
              if (d.honesty) out.append(el("div", "note", d.honesty));
            } else out.append(el("div", "bad", (r && r.error) || t("common.loadFail")));
            exRefresh(body);
          } catch (e) {
            out.textContent = String(e.message);
          } finally {
            b.disabled = false;
            pass.value = "";
          }
        },
      },
    ],
  });
}

// A reason is REQUIRED and the CLI is what refuses without one. The form only
// collects it, and the CLI's answer names the route rows the removal drops.
function exRemoveModal(p, body) {
  const form = el("div", "stack stack-sm");
  form.append(el("div", "note", t("extra.remove.what", { name: p.name })));
  const reason = exInput(t("extra.remove.reasonPh"));
  form.append(exField(t("extra.remove.reason"), reason, t("extra.remove.reasonHint")));
  const out = el("div", "note");
  form.append(out);
  modal({
    title: t("extra.remove.title", { name: p.name }),
    body: form,
    actions: [
      { label: t("common.cancel"), onClick: (c) => c() },
      {
        label: t("extra.remove.button"),
        cls: "btn-danger",
        id: "ex-remove-btn",
        onClick: async (close) => {
          const b = document.getElementById("ex-remove-btn");
          out.textContent = "";
          b.disabled = true;
          try {
            const r = await post("/api/extra/remove", { name: p.name, reason: reason.value });
            if (r && r.ok) {
              close();
              toast(t("extra.remove.done", { name: p.name }), "ok");
              exRefresh(body);
            } else {
              out.textContent = (r && (r.output || r.error)) || t("common.loadFail");
            }
          } catch (e) {
            out.textContent = String(e.message);
          } finally {
            b.disabled = false;
          }
        },
      },
    ],
  });
}

// The CLI's own stdout for a refused write, shown exactly as it was printed.
function exOutput(text) {
  return el("pre", "block wrap fail-detail", String(text || "").slice(0, 2000));
}

// Re-render the panel against the new truth. The modal deliberately stays open:
// the result of the thing you just did is inside it.
function exRefresh(body) {
  if (body) renderExtra(body);
}

/* ================================================ the routing rail (W12 T1) ==
   THE RAIL IS THE PICTURE THAT MAKES THIS CONFIGURABLE AT A GLANCE. One
   horizontal 0→100 axis, every band a segment, drawn from `orc extra route
   --json` and from nothing else — the panel computes no band edge, no agent
   name and no fall-through.

   AN UNMAPPED RANGE KEEPS ITS SLOT and is drawn in Claude's colour with the
   agent it actually resolves to. Filtering the gaps out would make "I left the
   top band on Opus on purpose" and "there is no top band" identical, and would
   make the rail change width on every edit — the v0.43.7 OFF-phase rule.

   GEOMETRY IS SOLVED FROM THE BOX: a segment is `var(--w)` of the axis with a
   readable MINIMUM, so a rail too narrow for its labels SCROLLS inside its own
   box and is never squeezed. (The VAULT/ringRadii lesson: a label sized by a
   fraction of the container knows nothing about how wide a word is.)

   WRITES ARE STAGED AND BATCHED, the v0.44.1 rule: nothing is written until
   Apply, the pending edits are NAMED, a refused write never aborts the rest,
   and Discard renders only while dirty. */

// Which band is open in the editor, so an Apply that re-renders does not throw
// you back to the top of the list.
let EX_OPEN_BAND = null;

/* WHICH LANE DOES A BAND GOVERN (v0.52.0, D6).

   The routing table says `[40,55) → opencode/big-pickle`. That is true for
   `/orc`, which scores every task, and it is NOT how `/orc-fast` works: that
   lane pins ONE executor and resolves the BAND its agent already encodes, at
   BOTH EDGES, requiring them to agree. The rule was implemented and written
   down and rendered nowhere, so a user reading this panel could not get from a
   band to the decision it drives.

   Every word here is `orc extra lanes --json`: the shape, the verdict, the
   edges, whether they agreed, and the sentence underneath. The panel decides
   nothing — a second idea of the routing is drift no lint can see. */
function exLanesCard(d) {
  const c = card(t("extra.lanes.title"));
  c.append(el("div", "note", t("extra.lanes.sub")));
  c.append(exWhy(t("extra.lanes.subWhy")));
  if (d.errors.lanes) {
    c.append(failBox(d.errors.lanes));
    return c;
  }
  const lanes = (d.lanes && d.lanes.lanes) || [];
  if (!lanes.length) {
    c.append(empty(t("extra.lanes.none"), ""));
    return c;
  }
  const list = el("div", "ex-lanes");
  for (const l of lanes) {
    const row = el("div", "ex-lane");
    const top = el("div", "row-actions");
    top.append(el("span", "mono ex-lane-name", l.lane));
    top.append(el("span", "note", l.shape));
    // The verdict word is the CLI's own. A friendlier synonym would be a state
    // that does not exist.
    top.append(
      chip(l.routes, l.routes === "foreign" || l.routes === "roles" || l.routes === "per-task" ? "ok" : l.routes === "never" ? "info" : "warn")
    );
    row.append(top);
    // The disclosure `extra-dispatch.md` demands, finally rendered: both edges
    // and whether they agreed.
    if (l.band)
      row.append(
        el("div", "note mono", t("extra.lanes.edges", { band: l.band, edges: (l.edges || []).join(","), agree: String(l.agree) }))
      );
    row.append(el("div", "note", l.detail));
    list.append(row);
  }
  c.append(list);
  // A lane not listed does not route foreign. Absence is a `no`, never an
  // omission to be interpreted.
  if (d.lanes && d.lanes.note) c.append(el("div", "note", d.lanes.note));
  return c;
}

function exRoutingCard(d, body, edits) {
  const c = card(t("extra.routing.title"));
  if (d.errors.route) {
    c.append(failBox(d.errors.route));
    return c;
  }
  const r = d.route || {};
  const rows = r.rows || [];

  // The CLI's own sentence when the master gate is off. Every row below is
  // inert and it says so — never a panel paraphrase.
  if (r.note) c.append(el("div", "banner", r.note));
  c.append(el("div", "note", t("extra.routing.sub")));

  // R10 — THE GATE. Nothing may be routed to a connection that has never
  // answered, so the editor stays shut until one has, and the ONE line that
  // would open it is printed rather than implied. The LADDER still draws either
  // way: what your bands resolve to today is worth reading before you can
  // change it.
  const verified = ((d.list && d.list.counts) || {}).verified || 0;

  c.append(exBandLadder(rows, d, edits, verified > 0));
  c.append(exBandLegend());
  c.append(el("div", "note", t("extra.routing.gapNote")));
  c.append(exWhy(t("extra.routing.gapWhy")));
  if (!verified) c.append(empty(t("extra.routing.locked"), t("extra.routing.lockedHint")));
  else c.append(el("div", "note", t("extra.routing.editNote")));
  return c;
}

/* THE BAND LADDER (v0.53.0) — ONE PICTURE, AND THE ROW YOU READ IS THE ROW YOU
   EDIT.

   What this replaces was a horizontal 0→100 rail ABOVE a separate list of
   editable rows: the same data twice, and only the second copy was interactive.
   Six things were wrong with the rail and every one of them is structural.

     1. THE TARGET WAS TRUNCATED — clipped mid-word, three rows out of seven.
        The single most important fact in the picture was the one you could not
        read.
     2. THE WIDTHS LIED. `min-width: 128px` fought `var(--w)`, so a 10-point
        band and a 30-point band came out nearly the same width while the
        `0 … 100` axis underneath promised they were to scale.
     3. THE LAST BAND WAS OFF-SCREEN with no affordance that the rail scrolled.
     4. NOTHING SAID WHAT THE COLOURS MEANT. Green versus blue was never
        explained anywhere on the page, and green is "this work leaves your
        machine" — see exBandLegend.
     5. `[0,30)` IS DEVELOPER NOTATION. The half-open bracket is load-bearing so
        it stays, but it now sits beside the CLI's plain reading of the same
        range instead of instead of one.
     6. AND IT WAS THE SAME DATA TWICE.

   Vertical fixes all six at once: the proportional bar is a width INSIDE the
   row, so scale is honest and nothing is ever squeezed or clipped; the target
   gets the whole row; and the editor opens IN PLACE — the Runs-row and
   Knowledge-doc rule, one row open at a time. */
function exBandLadder(rows, d, edits, verified) {
  const list = el("div", "ex-ladder");
  // NO FILTER, and that is the assertion rather than the absence. A range with
  // no connection of yours on it is a CLAUDE range and it keeps its row — the
  // v0.43.7 OFF-phase rule. Filtering the gaps out would make "I left the top
  // band on Claude on purpose" and "there is no top band" look identical.
  const entries = [];
  const openOnly = (which) => {
    for (const e of entries) if (e !== which) e.close();
  };
  for (const row of rows) {
    const e = exBandRow(row, d, edits, verified, openOnly);
    entries.push(e);
    list.append(e.node);
  }
  return list;
}

/* THE LEGEND — the fix for the single biggest comprehension gap on this panel.
   Two colours were carrying the whole meaning of the picture and neither was
   ever named. The words are the panel's own (they describe what the subsystem
   does, not this repo's state), which is the same rule the boundary card is
   written under. */
function exBandLegend() {
  const box = el("div", "ex-legend");
  const item = (cls, label) => {
    const s = el("span", "ex-legend-item");
    s.append(el("span", "ex-legend-swatch " + cls));
    s.append(el("span", "note", label));
    box.append(s);
  };
  item("ex-band-extra", t("extra.routing.legendExtra"));
  item("ex-band-claude", t("extra.routing.legendClaude"));
  return box;
}

/* WHAT YOU ARE ABOUT TO DO, drawn from the STAGED shape rather than from disk.
   Nothing re-renders until Apply (v0.44.1), so a row has to show its own staged
   state and an undo has to put the control back without the panel reloading
   underneath it.

   IT NEVER INVENTS THE OTHER HALF. Un-routing a band hands it back to the
   Claude ladder, and which agent it lands on is `claudeGaps`'s answer — split at
   the resolving table's own edges, which this panel does not know and must not
   learn. A staged un-route therefore draws a Claude row whose target is an em
   dash, and says it is recomputed on Apply. A guessed agent name here would be a
   picture of a run that is not going to happen. */
function exPreviewRow(r, edits) {
  const staged = edits.map.get("route " + r.band);
  if (!staged) return r;
  if (staged.route === "/api/extra/route/rm")
    return { from: r.from, to: r.to, band: r.band, range: r.range, meaning: r.meaning, via: "claude", agent: null, staged: true };
  const target = String((staged.body && staged.body.target) || "");
  const cut = target.indexOf("/");
  return {
    from: r.from,
    to: r.to,
    band: r.band,
    range: r.range,
    meaning: r.meaning,
    via: "extra",
    profile: cut > 0 ? target.slice(0, cut) : target,
    model: cut > 0 ? target.slice(cut + 1) : "",
    engine: null,
    verify_state: null,
    model_known: true,
    staged: true,
  };
}
function exPreviewRows(rows, edits) {
  return rows.map((r) => exPreviewRow(r, edits));
}

function exBandRow(raw, d, edits, verified, openOnly) {
  const key = "route " + raw.band;
  const node = el("div", "ex-band");
  const headBtn = el("button", "ex-band-head");
  headBtn.type = "button";
  headBtn.setAttribute("aria-expanded", "false");
  const pane = el("div", "ex-band-pane");
  node.append(headBtn, pane);

  const isOpen = () => node.classList.contains("open");
  const setOpen = (open) => {
    node.classList.toggle("open", open);
    headBtn.setAttribute("aria-expanded", String(open));
    if (open) EX_OPEN_BAND = raw.band;
    else if (EX_OPEN_BAND === raw.band) EX_OPEN_BAND = null;
    pane.replaceChildren(open ? editor() : frag());
  };

  const target = (p) => (p.via === "extra" ? p.profile + "/" + p.model : p.agent || "—");

  const paint = () => {
    const p = exPreviewRow(raw, edits);
    headBtn.replaceChildren();
    // The proportional bar, INSIDE the row. A CUSTOM PROPERTY and not an inline
    // width: the panel's CSP is `style-src 'self'` and a style attribute is
    // blocked outright. The track is full width, so `--w` is honest at every
    // viewport and no band is ever squeezed to a sliver to make room for text.
    const track = el("span", "ex-band-track");
    const bar = el(
      "span",
      "ex-band-bar " + (p.via === "extra" ? "ex-band-extra" : "ex-band-claude") + (p.staged ? " ex-band-staged" : "")
    );
    bar.style.setProperty("--w", Math.max(0, raw.to - raw.from).toFixed(2) + "%");
    track.append(bar);
    headBtn.append(track);
    const mid = el("span", "ex-band-mid");
    // The CLI's own `[from,to)` string, brackets included: the half-open edge is
    // the whole point of the notation. And BESIDE it the CLI's plain reading of
    // the same range — `range` is computed by `orc extra route`, never written
    // here. "simple work" beside a score would be the panel deciding what a
    // score means, which is the Flow-stepper rule.
    mid.append(el("span", "mono ex-band-label", raw.band));
    if (raw.range) mid.append(el("span", "note ex-band-range", raw.range));
    headBtn.append(mid);
    // THE FULL TARGET, never truncated. It is the most important fact in the row.
    headBtn.append(el("span", "mono ex-band-target", target(p)));
    const chips = el("span", "ex-band-chips");
    if (p.staged) chips.append(chip(t("extra.routing.staged"), "info"));
    if (p.via === "extra" && p.engine) chips.append(chip(p.engine, "info"));
    // The CLI's state word, verbatim — never a friendlier synonym. A STAGED row
    // has no state word yet, because nothing has been written for the CLI to
    // have an opinion about.
    if (p.via === "extra" && p.verify_state)
      chips.append(chip(p.verify_state, p.verify_state === "VERIFIED" ? "ok" : "warn"));
    if (p.via === "extra" && !p.model_known) chips.append(chip(t("extra.routing.modelGone"), "warn"));
    if (p.staged && p.via === "claude") chips.append(el("span", "note", t("extra.routing.recomputed")));
    headBtn.append(chips);
    headBtn.append(el("span", "ex-band-caret", "▸"));
    headBtn.title = raw.band + " → " + target(p);
    if (isOpen()) pane.replaceChildren(editor());
  };

  const editor = () => {
    const box = el("div", "stack stack-sm");
    // WHAT A SCORE IN THIS RANGE DESCRIBES, in the CLI's words.
    if (raw.meaning) box.append(el("div", "note", raw.meaning));
    const staged = edits.map.get(key);
    if (staged) {
      const line = el("div", "note ex-route-staged");
      line.append(chip(t("extra.routing.staged"), "info"));
      line.append(document.createTextNode(" " + staged.value));
      const undo = el("button", "btn btn-ghost btn-sm", t("extra.routing.undo"));
      undo.type = "button";
      undo.addEventListener("click", () => {
        edits.drop(key);
        paint();
      });
      line.append(undo);
      box.append(line);
      return box;
    }
    if (!verified) {
      box.append(el("div", "note", t("extra.routing.lockedHint")));
      return box;
    }
    if (raw.via === "extra") {
      // The row's own detail, all of it the CLI's. It was never visible before:
      // a small model and a turn cap decide what a wave actually does.
      box.append(
        kvList([
          [t("extra.routing.kvProfile"), raw.profile],
          [t("extra.routing.kvModel"), raw.model],
          [t("extra.routing.kvSmall"), raw.small_model || "—"],
          [t("extra.routing.kvTurns"), raw.max_turns === null || raw.max_turns === undefined ? "—" : String(raw.max_turns)],
        ])
      );
      const clear = el("button", "btn btn-sm", t("extra.routing.clear"));
      clear.type = "button";
      clear.addEventListener("click", () => {
        edits.action(key, "/api/extra/route/rm", { band: raw.from + "-" + raw.to }, t("extra.routing.stagedClear"));
        paint();
      });
      const acts = el("div", "row-actions");
      acts.append(clear);
      box.append(acts);
      return box;
    }
    box.append(exRouteControls(raw, d, edits, key, paint));
    return box;
  };

  headBtn.addEventListener("click", () => {
    const next = !isOpen();
    if (next) openOnly(entry);
    setOpen(next);
  });
  paint();
  const entry = { node, close: () => isOpen() && setOpen(false) };
  // A re-render must not close the row you were working in.
  if (EX_OPEN_BAND === raw.band) setOpen(true);
  return entry;
}

function exRouteControls(row, d, edits, key, paint) {
  // A Claude band. The control offers every connection ORC knows about; one
  // that has never answered is DISABLED and labelled, never hidden — the
  // v0.44.0 rule that a value outside its own set must stay visible and must
  // not be re-offerable.
  const profiles = (d.list && d.list.profiles) || [];
  const sel = exSelect(
    [{ value: "", label: t("extra.routing.pickProfile") }].concat(
      profiles.map((p) => ({
        value: p.name,
        label: p.name + (p.verified_at ? "" : "  " + t("extra.routing.untested")),
        disabled: !p.verified_at,
      }))
    )
  );
  // v0.51.0 — WHETHER THIS IS A DROPDOWN OR A TEXT BOX IS THE CLI'S ANSWER.
  // `orc extra models --json` returns `entry: "list" | "free-text"` plus a
  // `group` per row, and this renders it and derives nothing — the Flow-stepper
  // rule (`steps[]`), applied to models. A list that came back empty and the
  // escape-hatch provider are both free text, because a dropdown that cannot
  // contain the answer is worse than a box.
  const box = exModelBox(t("extra.routing.modelPh"));
  const model = box.input;
  const fillModels = () => {
    const p = profiles.find((x) => x.name === sel.value);
    box.load(p ? p.name : null);
  };
  sel.addEventListener("change", fillModels);
  fillModels();

  const add = el("button", "btn btn-sm", t("extra.routing.route"));
  add.type = "button";
  add.addEventListener("click", () => {
    const chosen = box.value();
    if (!sel.value || !chosen) return;
    edits.action(
      key,
      "/api/extra/route/set",
      { band: row.from + "-" + row.to, target: sel.value + "/" + chosen },
      t("extra.routing.stagedSet", { target: sel.value + "/" + chosen })
    );
    paint();
  });

  const controls = el("div", "ex-route-controls");
  controls.append(sel, box.node, add);
  return controls;
}

/* ONE model control, and the CLI decides which shape it takes.

   `entry: "list"` renders a real <select> grouped by the CLI's own `group`, each
   option labelled `label (group)` from data the panel was HANDED. `free-text`
   renders the box that was always here. The panel never decides which — and it
   never composes a group from a string it does not own.

   IT ALSO CARRIES F5's WARNING. A model being LISTED is not a model that WORKS:
   a listed id can be dead upstream, and only a live call tells those two apart.
   The caveat is the CLI's sentence, printed beside the picker, and the per-model
   test is offered next to it. */
function exModelBox(placeholder) {
  const node = el("div", "ex-modelbox");
  const input = exInput(placeholder);
  const sel = exSelect([]);
  const note = el("div", "note");
  const api = { node, input, profile: null, entry: "free-text", value: () => (api.entry === "list" ? sel.value : input.value.trim()) };
  const paint = () => {
    node.replaceChildren(api.entry === "list" ? sel : input, note);
  };
  api.load = (profile) => {
    api.profile = profile;
    if (!profile) {
      api.entry = "free-text";
      note.textContent = "";
      paint();
      return;
    }
    read("/api/extra/models?profile=" + encodeURIComponent(profile))
      .then((r) => {
        const j = r.data || {};
        api.entry = j.entry === "list" ? "list" : "free-text";
        sel.replaceChildren();
        const groups = new Map();
        for (const m of j.models || []) {
          const g = m.group || "";
          if (!groups.has(g)) groups.set(g, []);
          groups.get(g).push(m);
        }
        for (const [g, rows] of groups) {
          const og = el("optgroup");
          og.label = g;
          for (const m of rows) {
            const o = el("option", null, m.label + (m.group ? " (" + m.group + ")" : ""));
            o.value = m.id;
            og.append(o);
          }
          sel.append(og);
        }
        // The provider's own caveat, verbatim: OFFERED is not WORKING.
        note.textContent = j.caveat || "";
        paint();
      })
      .catch(() => {
        api.entry = "free-text";
        paint();
      });
  };
  paint();
  return api;
}

// Reset here is the GUARDRAILS, not the routes: `orc config reset <key>` removes
// a key from the file, and doing that to nine keys is a real write with a real
// effect. It deliberately does NOT touch the routing table — dropping every
// route row is a change to how this repo builds, and the CLI makes that an
// explicit act with a recorded reason for exactly that reason.
function exResetModal(edits, body) {
  const keys = EX_CONFIG_KEYS.slice();
  const box = el("div", "stack stack-sm");
  box.append(el("div", null, t("extra.reset.body")));
  const list = el("div", "file-list");
  // The keys are NAMED. A count is not consent.
  for (const k of keys) list.append(el("div", null, k));
  box.append(list);
  box.append(el("div", "action-cmd", "orc config reset <key>"));
  box.append(el("div", "note", t("extra.reset.note")));
  modal({
    title: t("extra.reset.title"),
    body: box,
    actions: [
      { label: t("common.cancel"), onClick: (c) => c() },
      {
        label: t("extra.reset.apply"),
        cls: "btn-danger",
        onClick: async (close) => {
          close();
          edits.clear();
          const failed = [];
          for (const key of keys) {
            try {
              const r = await post("/api/config/reset", { key });
              if (!r.ok) failed.push(key);
            } catch (_) {
              failed.push(key);
            }
          }
          if (failed.length) toast(t("edits.someFailed", { n: failed.length }), "bad", failed.join(String.fromCharCode(10)));
          else toast(t("extra.reset.done", { n: keys.length }), "ok");
          renderExtra(body);
        },
      },
    ],
  });
}

// The keys this panel owns, filled from `orc config list --json` on every
// render. The panel never hard-codes a key name — it reads which ones exist.
let EX_CONFIG_KEYS = [];

/* ================================== the guardrails and the cost (W12 T2) ==
   ZERO PANEL-SIDE WORK FOR A CONFIG KEY. The nine `extra_*` keys render through
   the SAME `settingRow` / `controlFor` the Settings panel uses, so the control
   follows the CLI's validator, the shadow lock and its reason come for free, and
   adding a tenth key is still zero steps here. The only adapter is the edit set:
   this panel stages everything as an ACTION, so one bar carries a routing change
   and a guardrail change together.

   THE COST CARD RENDERS `orc extra stats --json` AND COMPUTES NOTHING. Four
   token kinds, never blended (`docTokenBar`, the same renderer the Docs panel
   uses — one idea of a token vector). A band nothing joins reads `—`, never `0`,
   and KEEPS ITS SLOT: "this band cost nothing" and "nothing has run here yet"
   are different facts. `usd` is null unless ORC priced it itself. */

// `settingRow`/`controlFor` call `edits.set(key, value, original)` and
// `edits.reset(key)`. This translates both into ACTIONS on the panel's one edit
// set, which is what lets `applyActions` stay untouched.
function exConfigEdits(edits) {
  return {
    map: edits.map,
    get size() {
      return edits.size;
    },
    set(key, value, original) {
      // Staging a value back to what it already was CLEARS the edit rather than
      // recording a no-op — the v0.44.1 rule, and it has to be re-stated here
      // because this adapter is what `controlFor` now talks to.
      if (String(value) === String(original)) edits.drop(key);
      else edits.action(key, "/api/config/set", { key, value: String(value) }, String(value));
    },
    reset(key) {
      // `orc config reset <key>` REMOVES the key from the file, which is not the
      // same write as setting it to its default value.
      edits.action(key, "/api/config/reset", { key }, t("edits.toDefault"));
    },
    drop: (key) => edits.drop(key),
    clear: () => edits.clear(),
    entries: () => edits.entries(),
  };
}

function exGuardrailsCard(d, body, edits) {
  const c = card(t("extra.guard.title"));
  const keys = ((d.config && d.config.keys) || []).filter((k) => k.key.indexOf("extra_") === 0);
  if (!keys.length) {
    c.append(empty(t("extra.guard.none")));
    return c;
  }
  c.append(el("div", "note", t("extra.guard.sub")));
  c.append(exWhy(t("extra.guard.subWhy")));
  const proxy = exConfigEdits(edits);
  const rows = el("div", "settings-list");
  for (const k of keys) rows.append(settingRow(k, body, proxy));
  c.append(rows);
  return c;
}

/* ------------------------------------------------------------- the cost -- */

function exCostCard(d) {
  const c = card(t("extra.cost.title"));
  const st = d.stats;
  if (!st) {
    c.append(empty(t("extra.cost.none"), t("extra.cost.noneHint")));
    return c;
  }

  const head = el("div", "row-actions");
  head.append(chip(t("extra.cost.dispatches", { n: st.dispatches }), st.dispatches ? "info" : "idle"));
  head.append(el("span", "note", t("extra.cost.scanned", { n: st.files_scanned })));
  if (st.since) head.append(el("span", "note", st.since));
  c.append(head);

  // WHERE THE NUMBERS CAME FROM, and the panel decides none of it: the three
  // counts are the CLI's own `sources` object. "ORC wrote this down itself" and
  // "a trace happened to mention it" are different levels of confidence in the
  // same total, and a reader who cannot tell them apart cannot tell a broken
  // relay from a lane that never ran — which is the exact failure that had this
  // card reading `0 tasks sent` while two dispatches had really been paid for.
  const src = st.sources;
  if (src) {
    c.append(
      el(
        "div",
        "note",
        t("extra.cost.sources", {
          log: src.spend_log,
          traces: src.traces_only,
          backfill: src.run_returns,
        })
      )
    );
    c.append(exWhy(t("extra.cost.sourcesWhy")));
    // Both of these are ABSENT counts — rows that exist and are not in the
    // totals. Neither is chrome: a silently short report is the thing this
    // whole card is being fixed for.
    if (src.unreadable_spend_lines)
      c.append(el("div", "note bad", t("extra.cost.unreadable", { n: src.unreadable_spend_lines })));
    if (src.run_returns_undated_skipped)
      c.append(el("div", "note bad", t("extra.cost.undated", { n: src.run_returns_undated_skipped })));
  }

  // The price table's own dating, and its own staleness word. No dollar figure
  // exists without one, and a stale table says so — a cost ORC did not price is
  // never printed as a number.
  if (st.price_table)
    c.append(
      el(
        "div",
        "note" + (st.price_table.stale ? " bad" : ""),
        t("extra.cost.priceTable", { as_of: st.price_table.as_of, days: st.price_table.age_days })
      )
    );

  if (!st.dispatches) {
    // The CLI's own hint, verbatim: it names the next command.
    c.append(empty(t("extra.cost.none"), st.hint));
    return c;
  }

  // EVERY ROUTED BAND KEEPS ITS SLOT, joined by profile+band. One that nothing
  // has run through yet reads `—` in every column, never `0`.
  const byKey = new Map();
  for (const b of st.bands || []) byKey.set(b.profile + "|" + b.band, b);
  const slots = [];
  for (const r of ((d.route && d.route.rows) || []).filter((x) => x.via === "extra")) {
    const key = r.profile + "|" + r.band;
    slots.push({ profile: r.profile, band: r.band, stat: byKey.get(key) || null });
    byKey.delete(key);
  }
  // …and a band the traces know about that is no longer routed keeps its slot
  // too, because that history is exactly what tells you whether unrouting it was
  // the right call.
  for (const b of byKey.values()) slots.push({ profile: b.profile, band: b.band, stat: b, unrouted: true });

  for (const s of slots) c.append(exCostRow(s));

  exCostList(c, t("extra.cost.substitutions"), st.substitutions, (x) => `${x.task}  ${x.requested} → ${x.reported}`);
  exCostList(c, t("extra.cost.reroutes"), st.reroutes, (x) => `${x.task}  ${(x.providers || []).join(" → ")}`);
  exCostList(c, t("extra.cost.fallbacks"), st.fallbacks, (x) => `${x.task}  ${x.reason} → ${x.agent}`);

  if ((st.missing_rates || []).length) c.append(exRatesBox(d, st));
  return c;
}

function exCostRow(s) {
  const row = el("div", "ex-cost-row");
  const head = el("div", "row-actions");
  head.append(el("span", "mono ex-name", s.profile));
  head.append(el("span", "mono ex-route-band", s.band));
  if (s.unrouted) head.append(chip(t("extra.cost.unrouted"), "idle"));
  const g = s.stat;
  head.append(el("span", "note", g ? t("extra.cost.nDispatches", { n: g.dispatches }) : "—"));
  row.append(head);

  if (!g) {
    row.append(el("div", "note", t("extra.cost.never")));
    return row;
  }

  const oc = el("div", "row-actions");
  // The outcome names are the CLI's own field names — never translated.
  for (const [k, n] of Object.entries(g.outcomes || {}))
    if (n) oc.append(chip(k + " " + n, k === "done" ? "ok" : k === "failed" ? "bad" : "warn"));
  for (const e of Object.keys(g.engines || {})) oc.append(chip(e, "info"));
  row.append(oc);

  // The four kinds, never blended, through the SAME renderer the Docs panel
  // uses. `cache_read` is usually the largest count and about a tenth of the
  // price, which is exactly why one blended number would mislead.
  row.append(docTokenBar(g.usage));

  // THE COUNT THAT KEEPS THE VECTOR HONEST. A total assembled from six of ten
  // dispatches is not this band's cost, and it says so rather than averaging
  // the gap away.
  if (g.usage_reported !== g.dispatches)
    row.append(
      el("div", "note bad", t("extra.cost.partial", { got: g.usage_reported, of: g.dispatches, missing: g.usage_missing }))
    );

  row.append(
    el(
      "div",
      "note",
      g.usd === null
        ? t("extra.cost.noRate", { provider: g.provider || "—" })
        : t("extra.cost.usd", { usd: g.usd < 0.01 ? "<0.01" : g.usd.toFixed(2) })
    )
  );
  return row;
}

function exCostList(c, title, arr, fmt) {
  if (!arr || !arr.length) return;
  const box = el("div", "ex-cost-list");
  const h = el("div", "row-actions");
  h.append(chip(String(arr.length), "warn"));
  h.append(el("span", "ex-probe-head", title));
  box.append(h);
  for (const x of arr.slice(0, 8)) box.append(el("div", "note mono", fmt(x)));
  if (arr.length > 8) box.append(el("div", "note", t("extra.cost.more", { n: arr.length - 8 })));
  c.append(box);
}

// The paste path. `bin/pricing.json` ships every models map EMPTY on purpose —
// a figure that is wrong by 2x gets believed — so this is the JSON the CLI built
// for the pairs it actually saw, and the note about where to put it is the
// CLI's own sentence.
function exRatesBox(d, st) {
  const box = el("div", "ex-rates");
  box.append(el("div", "ex-probe-head", t("extra.cost.missingRates")));
  for (const m of st.missing_rates) box.append(el("div", "note mono", m.pair + " · " + t("extra.cost.nDispatches", { n: m.dispatches })));
  const rates = d.rates;
  if (rates && rates.paste) {
    const pre = el("pre", "block wrap", JSON.stringify(rates.paste, null, 2));
    box.append(pre);
    const b = el("button", "btn btn-ghost btn-sm", t("common.copy"));
    b.type = "button";
    b.addEventListener("click", () => copy(JSON.stringify(rates.paste, null, 2), t("extra.cost.missingRates")));
    box.append(b);
    if (rates.where) box.append(el("div", "note", rates.where));
    for (const c of rates.caveats || []) box.append(el("div", "note", c.provider + ": " + c.caveat));
  } else {
    box.append(laneCommand("orc extra rates", t("extra.cost.ratesWhy")));
  }
  return box;
}
