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
  const [listRes, provRes, docRes, cfgRes, routeRes, statRes, rateRes] = await Promise.all([
    read("/api/extra").catch((e) => ({ data: null, error: e })),
    read("/api/extra/providers").catch((e) => ({ data: null, error: e })),
    read("/api/extra/doctor").catch((e) => ({ data: null, error: e })),
    read("/api/config").catch((e) => ({ data: null, error: e })),
    read("/api/extra/route").catch((e) => ({ data: null, error: e })),
    read("/api/extra/stats").catch((e) => ({ data: null, error: e })),
    read("/api/extra/rates").catch((e) => ({ data: null, error: e })),
  ]);
  const d = {
    list: listRes.data,
    providers: provRes.data,
    doctor: docRes.data,
    config: cfgRes.data,
    route: routeRes.data,
    // `orc extra stats` exits 1 with a real object when nothing has been
    // dispatched yet — an ANSWER, not an error, so it is read like every other
    // exit-code-as-data command on this panel.
    stats: statRes.data,
    rates: rateRes.data,
    errors: { list: listRes.error || null, providers: provRes.error || null, route: routeRes.error || null },
  };

  // ONE staged-edit set for the whole panel, and it OUTLIVES a re-render on
  // purpose: a connection test in the middle of planning a routing change must
  // not silently throw the plan away.
  // NOTHING RE-RENDERS UNTIL APPLY (v0.44.1), so staging only repaints the bar
  // and each control repaints its OWN state. A full re-render on every click
  // would re-fetch five endpoints and scroll the list out from under the person
  // using it — the exact fight that release was written to end.
  if (!EX_EDITS) EX_EDITS = editSet(() => EX_BAR && EX_BAR.paint());
  const edits = EX_EDITS;
  // Which config keys this panel owns is the CLI's answer, read fresh every
  // render. A hard-coded list here would be a second registry.
  EX_CONFIG_KEYS = ((d.config && d.config.keys) || []).filter((k) => k.key.indexOf("extra_") === 0).map((k) => k.key);

  const out = frag();
  out.append(exBoundaryCard());
  out.append(exStrip(d));
  out.append(exProfilesCard(d, body));
  out.append(exRoutingCard(d, body, edits));
  out.append(exGuardrailsCard(d, body, edits));
  out.append(exCostCard(d));
  out.append(exFindingsCard(d));
  out.append(exProvidersCard(d));
  body.replaceChildren(out);
  // The bar sticks only while dirty, and Discard renders only while dirty —
  // both are editBar's own rules, unchanged.
  EX_BAR = exEditBar(edits, body);
  body.append(EX_BAR);
}

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
  add.addEventListener("click", () => exAddModal(d.providers, body));
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
  for (const p of rows) c.append(exProfileRow(p, byProfile.get(p.name) || [], max, body));
  return c;
}

function exProfileRow(p, findings, maxAttempts, body) {
  const row = el("div", "ex-profile");

  const top = el("div", "row-actions");
  top.append(el("span", "mono ex-name", p.name));
  // `provider/engine` is the CLI's own composite label everywhere else, so it
  // is written the same way here rather than split into two friendlier words.
  top.append(el("span", "note", p.provider + "/" + p.engine));
  top.append(exVerifyChip(p, findings));
  const vault = exVaultChip(p, maxAttempts);
  if (vault) top.append(vault);
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
  test.addEventListener("click", () => exTestModal(p, body));
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
  const drop = el("button", "btn btn-ghost btn-sm", t("extra.remove.button"));
  drop.type = "button";
  drop.addEventListener("click", () => exRemoveModal(p, body));
  actions.append(drop);
  row.append(actions);
  return row;
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
function exProbeNote() {
  const box = el("div", "ex-probe");
  box.append(el("div", "ex-probe-head", t("extra.probe.head")));
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

/* ---------------------------------------------------------- the add modal -- */

function exAddModal(cat, body) {
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
  const cliBin = exInput(t("extra.add.cliBinPh"));
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
  const srcRow = el("div", "ex-cred-choice");
  const lblEnv = el("label", "ex-cred-opt");
  lblEnv.append(srcEnv, el("span", null, t("extra.add.sourceEnv")));
  const lblVault = el("label", "ex-cred-opt");
  lblVault.append(srcVault, el("span", null, t("extra.add.sourceVault")));
  srcRow.append(lblEnv, lblVault);
  srcEnv.addEventListener("change", () => sync());
  srcVault.addEventListener("change", () => sync());

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
  form.append(exProbeNote());

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
    envKey.placeholder = (r && r.env_key_default) || "";

    const vault = srcVault.checked;
    fEnvKey.hidden = vault;
    fKey.hidden = !vault;
    vaultWarn.hidden = !vault;
  }
  engine.addEventListener("change", () => sync());
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
        vault: srcVault.checked,
        env_key: srcVault.checked ? "" : envKey.value.trim(),
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
      exPingResult(result, wire, ping, name.value.trim(), key.value, body);
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

function exTestModal(p, body) {
  const form = el("div", "stack stack-sm");
  form.append(el("div", "note", p.name + " · " + p.provider + "/" + p.engine));
  form.append(exProbeNote());

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

  const wire = exWire(t("extra.wire.you"), t("extra.wire.provider"));
  form.append(wire);
  const result = el("div", "ex-result");
  form.append(result);

  const run = async (btn) => {
    result.replaceChildren();
    btn.disabled = true;
    btn.textContent = t("extra.test.running");
    wire.arm();
    setBusy(true);
    try {
      const r = await post("/api/extra/ping", {
        profile: p.name,
        key: vaulted ? key.value : "",
        passphrase: vaulted ? pass.value : "",
      });
      exPingResult(result, wire, r, p.name, vaulted ? key.value : "", body);
    } catch (e) {
      wire.settle(false);
      result.append(failBox(e));
    } finally {
      btn.disabled = false;
      btn.textContent = t("extra.test.button");
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
        label: t("extra.test.button"),
        cls: "btn-primary",
        id: "ex-test-btn",
        onClick: () => run(document.getElementById("ex-test-btn")),
      },
    ],
  });
}

/* ------------------------------------------------------------- the result -- */

// Everything rendered here is the CLI's `--json` object. The panel adds no
// verdict of its own: `ok` is the CLI's, `verify_method` is which rung actually
// answered, and `note` is its own caveat about what that rung did NOT prove.
function exPingResult(result, wire, payload, profile, pastedKey, body) {
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

  // THE SAVE OPENS ONLY ON A GREEN TEST, and the self-destruct is named BEFORE
  // the save rather than after it.
  if (d.vault && d.vault.stored) {
    box.append(el("div", "note", t("extra.save.stored", { pepper: d.vault.pepper })));
    if (d.vault.honesty) box.append(el("div", "note", d.vault.honesty));
  } else if (d.vault && d.vault.error) {
    box.append(el("div", "note", d.vault.error));
    if (pastedKey) box.append(exSaveRow(profile, pastedKey, body));
  }
  result.append(box);
  exRefresh(body);
}

// Saving re-runs the test with the passphrase attached, because that is the only
// way the CLI ever stores a key: proved by a live connection first, every time.
function exSaveRow(profile, pastedKey, body) {
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

  // The rail is redrawn from the STAGED shape whenever a row stages or undoes —
  // and by nothing else. Still no panel re-render and still no refetch: this is
  // one element replacing its own children.
  const railHost = el("div");
  const drawRail = () => railHost.replaceChildren(exRail(exPreviewRows(rows, edits)));
  drawRail();
  c.append(railHost);
  c.append(el("div", "note", t("extra.routing.gapNote")));

  // R10 — THE GATE. Nothing may be routed to a connection that has never
  // answered, so the editor is closed until one has, and the ONE line that
  // would open it is printed rather than implied.
  const verified = ((d.list && d.list.counts) || {}).verified || 0;
  if (!verified) {
    c.append(empty(t("extra.routing.locked"), t("extra.routing.lockedHint")));
    return c;
  }

  const table = el("div", "ex-route-rows");
  for (const row of rows) table.append(exRouteRow(row, d, edits, drawRail));
  c.append(table);
  c.append(el("div", "note", t("extra.routing.editNote")));
  return c;
}

/* THE RAIL DRAWS WHAT YOU ARE ABOUT TO DO. R11's second animation: a segment
   grows into the provider's colour when a band is staged and the displaced
   Claude segment gives up its slot, so you SEE the trade you are making before
   anything is written.

   IT NEVER INVENTS THE OTHER HALF. Un-routing a band hands it back to the
   Claude ladder, and which agent it lands on is `claudeGaps`'s answer — split at
   the resolving table's own edges, which this panel does not know and must not
   learn. A staged un-route therefore draws a Claude segment whose target is an
   em dash, and says it is recomputed on Apply. A guessed agent name here would
   be a picture of a run that is not going to happen. */
function exPreviewRows(rows, edits) {
  return rows.map((r) => {
    const staged = edits.map.get("route " + r.band);
    if (!staged) return r;
    if (staged.route === "/api/extra/route/rm")
      return { from: r.from, to: r.to, band: r.band, via: "claude", agent: null, staged: true };
    const target = String((staged.body && staged.body.target) || "");
    const cut = target.indexOf("/");
    return {
      from: r.from,
      to: r.to,
      band: r.band,
      via: "extra",
      profile: cut > 0 ? target.slice(0, cut) : target,
      model: cut > 0 ? target.slice(cut + 1) : "",
      engine: null,
      verify_state: null,
      model_known: true,
      staged: true,
    };
  });
}

function exRail(rows) {
  const wrap = el("div", "ex-rail-wrap");
  const rail = el("div", "ex-rail");
  for (const row of rows) {
    const seg = el(
      "div",
      "ex-seg " + (row.via === "extra" ? "ex-seg-extra" : "ex-seg-claude") + (row.staged ? " ex-seg-staged" : "")
    );
    // A CUSTOM PROPERTY, not an inline width: the panel's CSP is
    // `style-src 'self'` and a style attribute is blocked outright. Same
    // technique as the Docs token bar and the Challenge convergence bar.
    seg.style.setProperty("--w", (Math.max(0, row.to - row.from)).toFixed(2) + "%");
    // The band label is the CLI's own `[from,to)` string, brackets included:
    // the half-open edge is the whole point of the notation.
    seg.append(el("div", "ex-seg-band", row.band));
    const target = row.via === "extra" ? row.profile + "/" + row.model : row.agent || "—";
    seg.append(el("div", "ex-seg-target", target));
    const sub = el("div", "ex-seg-sub");
    if (row.staged) sub.append(chip(t("extra.routing.staged"), "info"));
    // The CLI's state word, verbatim — never a friendlier synonym. A STAGED row
    // has no state word yet, because nothing has been written for the CLI to
    // have an opinion about.
    if (row.via === "extra" && row.verify_state)
      sub.append(chip(row.verify_state, row.verify_state === "VERIFIED" ? "ok" : "warn"));
    if (row.via === "extra" && !row.model_known) sub.append(chip(t("extra.routing.modelGone"), "warn"));
    if (row.staged && row.via === "claude") sub.append(el("span", "note", t("extra.routing.recomputed")));
    if (sub.childNodes.length) seg.append(sub);
    seg.title = row.band + " → " + target;
    rail.append(seg);
  }
  wrap.append(rail);
  const axis = el("div", "ex-rail-axis");
  axis.append(el("span", null, "0"));
  axis.append(el("span", "ex-rail-axis-label", t("extra.routing.axis")));
  axis.append(el("span", null, "100"));
  wrap.append(axis);
  return wrap;
}

function exRouteRow(row, d, edits, drawRail) {
  const key = "route " + row.band;
  const box = el("div", "ex-route-row");
  const head = el("div", "row-actions");
  // NOT named `slot`: that name is reserved for a PANEL container, which must
  // carry "stack" (a test asserts it). This is a row-local swap area.
  const ctl = el("div", "ex-route-slot");
  box.append(head, ctl);

  head.append(el("span", "mono ex-route-band", row.band));
  head.append(
    el("span", "note", row.via === "extra" ? row.profile + "/" + row.model : row.agent)
  );
  if (row.via === "extra" && row.engine) head.append(chip(row.engine, "info"));

  // THE ROW REPAINTS ITSELF. Nothing re-renders until Apply, so a staged change
  // has to show up here and nowhere else — and an undo has to put the control
  // back without the panel reloading underneath it.
  const paint = () => {
    drawRail();
    ctl.replaceChildren();
    for (const b of [...head.querySelectorAll("button")]) b.remove();
    const staged = edits.map.get(key);
    if (staged) {
      const note = el("div", "note ex-route-staged");
      note.append(chip(t("extra.routing.staged"), "info"));
      note.append(document.createTextNode(" " + staged.value));
      const undo = el("button", "btn btn-ghost btn-sm", t("extra.routing.undo"));
      undo.type = "button";
      undo.addEventListener("click", () => {
        edits.drop(key);
        paint();
      });
      note.append(undo);
      ctl.append(note);
      return;
    }
    ctl.append(controls());
  };

  const controls = () => {
    if (row.via === "extra") {
      const clear = el("button", "btn btn-ghost btn-sm", t("extra.routing.clear"));
      clear.type = "button";
      clear.addEventListener("click", () => {
        edits.action(
          key,
          "/api/extra/route/rm",
          { band: row.from + "-" + row.to },
          t("extra.routing.stagedClear")
        );
        paint();
      });
      head.append(clear);
      return el("div");
    }
    return exRouteControls(row, d, edits, key, paint);
  };

  paint();
  return box;
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
  // A model name is the provider's, and ORC's cache is not the authority on
  // somebody else's catalogue: the list is a SUGGESTION (`models_seen`) on a
  // field you can type into, and the CLI warns rather than refuses when a model
  // is not in it.
  const model = exInput(t("extra.routing.modelPh"));
  const listId = "ex-models-" + row.from + "-" + row.to;
  const dl = el("datalist");
  dl.id = listId;
  model.setAttribute("list", listId);
  const fillModels = () => {
    const p = profiles.find((x) => x.name === sel.value);
    dl.replaceChildren();
    for (const m of (p && p.models_seen) || []) {
      const o = el("option");
      o.value = m;
      dl.append(o);
    }
  };
  sel.addEventListener("change", fillModels);
  fillModels();

  const add = el("button", "btn btn-sm", t("extra.routing.route"));
  add.type = "button";
  add.addEventListener("click", () => {
    if (!sel.value || !model.value.trim()) return;
    edits.action(
      key,
      "/api/extra/route/set",
      { band: row.from + "-" + row.to, target: sel.value + "/" + model.value.trim() },
      t("extra.routing.stagedSet", { target: sel.value + "/" + model.value.trim() })
    );
    paint();
  });

  const controls = el("div", "ex-route-controls");
  controls.append(sel, model, dl, add);
  return controls;
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
