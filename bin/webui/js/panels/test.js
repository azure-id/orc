"use strict";
/* panels/test.js — orc ui client
   /orc-test: the lane that RUNS the test. What was measured, what was NOT, and
   with whose permission.

   FIVE TABS, on the Knowledge/Extra precedent: Targets · Surface · Cases ·
   Runs · Findings. The header strip and the findings caution stay OUTSIDE the
   tabs — a caution you must hunt for is a caution nobody reads — and the tab
   survives a re-render (`KN_TAB`'s rule).

   THE PANEL DERIVES NOTHING. Not a state word, not a severity, not an OWASP
   id, not a tier, not a verdict, not the code-vs-live diff. `orc test show
   --json` is the whole computed object and this file renders it. A test greps
   this panel for the literals it must not own.

   TWO LINES THIS PANEL DOES NOT CROSS.
     · A FREE ACTION GETS A BUTTON — `surface`, `env`, `report`. Every one costs
       zero model tokens and every one is a real CLI command.
     · A PAID ACTION GETS A COPY-ABLE COMMAND. So does anything that SENDS
       TRAFFIC: `orc test run` is where the requests are, and a page that can
       start a scan against a live host is a page that can start one by
       accident.

   And the reads are reads in the strict sense: opening this page re-scans
   nothing and probes nothing. `orc test env` is the one probe here and it is
   behind a button you press, the `orc extra ping` shape.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

/* ==================================================================== TEST == */

// Which tab was open, and which run was selected, so a write that re-renders
// the panel does not throw the user back to the first of either.
let TEST_TAB = "targets";
let TEST_SLUG = null;
// The last environment reading, per slug, held in this page's memory only. A
// health state is NOT stored on disk — it is computed fresh on every read (the
// computeWikiFreshness rule) — so the panel must never render a stale word as
// if it were current, and must never persist one.
const TEST_ENV_SEEN = {};

// The kind map for the CLI's own state words. The WORDS are the CLI's and are
// rendered as they come; only the colour is ours.
const TEST_STATE_KIND = { RED: "bad", UNREADABLE: "bad", OBSERVED: "ok", PARTIAL: "warn" };
const TEST_VERDICT_KIND = { pass: "ok", fail: "bad", unknown: "warn" };
const TEST_ENV_KIND = { ready: "ok", starting: "warn", down: "warn", unhealthy: "bad", absent: "bad" };
const TEST_SEC_KIND = { FOUND: "bad", "observed-clean": "ok", "partly-observed": "warn", unchecked: "warn", "not-observed": "warn", "not-run": "" };
const TEST_SEV_KIND = { critical: "bad", high: "bad", medium: "warn", low: "" };
const TEST_TOOL_KIND = { ready: "ok", outdated: "warn", unauthenticated: "warn", absent: "bad" };

PANELS.test = function (host) {
  head(host, t("test.title"), t("test.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderTest(body);
};

async function renderTest(body) {
  body.replaceChildren(skeleton(6));
  const [listRes, uiRes] = await Promise.all([
    read("/api/test").catch((e) => ({ data: null, error: e })),
    read("/api/test/ui").catch((e) => ({ data: null, error: e })),
  ]);
  if (!listRes.data) {
    body.replaceChildren(failBox(listRes.error));
    return;
  }
  const list = listRes.data;
  const tools = (uiRes.data && uiRes.data.ui) || null;

  if (!list.runs || !list.runs.length) {
    const out = frag();
    const c = card(t("test.title"));
    c.append(empty(t("test.none"), t("test.noneHint")));
    c.append(
      laneCommand(
        'orc test init <slug> --kind be --env local --start auto --destructive deny --reason "<why>"',
        t("test.initCmd"),
        t("common.runInTerminal")
      )
    );
    out.append(c);
    if (tools) out.append(testToolsCard(tools));
    body.replaceChildren(out);
    return;
  }

  // The selected run. An unknown remembered slug falls back to the first row
  // rather than rendering nothing.
  const slugs = list.runs.map((r) => r.slug);
  if (!TEST_SLUG || slugs.indexOf(TEST_SLUG) === -1) TEST_SLUG = slugs[0];

  const showRes = await read("/api/test/one?slug=" + encodeURIComponent(TEST_SLUG)).catch((e) => ({ data: null, error: e }));
  const d = showRes.data;

  const out = frag();
  out.append(testPicker(list, body));

  // An UNREADABLE ledger is a ROW, never a crash and never a silent gap. It
  // never reaches a tab, because there is nothing measured behind it.
  if (!d || d.state === "UNREADABLE") {
    const c = card(TEST_SLUG);
    c.append(chip(String((d && d.state) || "UNREADABLE"), "bad"));
    c.append(el("div", "note", t("test.target.unreadable")));
    if (d && d.error) c.append(el("pre", "block wrap", esc(d.error)));
    out.append(c);
    if (tools) out.append(testToolsCard(tools));
    body.replaceChildren(out);
    return;
  }

  // THE HEADER STRIP and THE CAUTION, above the tabs and on every one of them.
  out.append(testStrip(d));
  const caution = testCaution(d);
  if (caution) out.append(caution);

  const tabs = el("div", "tabs");
  const pane = el("div", "tab-pane stack");
  const views = {
    targets: () => testTargetsTab(d, tools, body),
    surface: () => testSurfaceTab(d, body),
    cases: () => testCasesTab(d),
    runs: () => testRunsTab(d),
    findings: () => testFindingsTab(d, body),
  };
  const select = (which) => {
    TEST_TAB = which;
    for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.tab === which));
    pane.replaceChildren(views[which]());
  };
  // Keys are written out in full, never assembled from the tab id — a key built
  // from a fragment is invisible to every check that looks for one.
  for (const [which, label] of [
    ["targets", t("test.tab.targets")],
    ["surface", t("test.tab.surface")],
    ["cases", t("test.tab.cases")],
    ["runs", t("test.tab.runs")],
    ["findings", t("test.tab.findings")],
  ]) {
    const b = el("button", null, label);
    b.type = "button";
    b.dataset.tab = which;
    b.addEventListener("click", () => select(which));
    tabs.append(b);
  }
  out.append(tabs, pane);
  body.replaceChildren(out);
  select(views[TEST_TAB] ? TEST_TAB : "targets");
}

/* THE RUN PICKER. Every run keeps its row, including the UNREADABLE one: a
   listing that drops it is a listing that hides the one run that needs
   attention. */
function testPicker(list, body) {
  const c = card(t("test.pick"));
  const bar = el("div", "toolbar");
  const sel = el("select", "text-input");
  for (const r of list.runs) {
    const o = el("option", null, r.slug + "  —  " + r.state);
    o.value = r.slug;
    if (r.slug === TEST_SLUG) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener("change", () => {
    TEST_SLUG = sel.value;
    renderTest(body);
  });
  bar.append(sel);
  bar.append(el("span", "toolbar-result", list.dir));
  c.append(bar);
  c.append(el("div", "note", t("test.pickHint")));
  return c;
}

/* THE HEADER STRIP. Six values, all of them the CLI's. */
function testStrip(d) {
  const strip = el("div", "ts-strip");
  const item = (label, value, kind) => {
    const box = el("div", "ts-strip-item" + (kind ? " ts-" + kind : ""));
    box.append(el("span", "ts-strip-value", value));
    box.append(el("span", "ts-strip-label", label));
    strip.append(box);
  };
  const counts = d.counts || {};
  item(t("test.strip.state"), d.state, TEST_STATE_KIND[d.state] || "");
  item(t("test.strip.cases"), String((d.cases || []).length));
  item(t("test.strip.runs"), String((d.runs || []).length));
  const observed = (d.findings || []).filter((f) => f.observed).length;
  item(t("test.strip.findings"), String((d.findings || []).length), observed ? "bad" : "");
  item(t("test.strip.observed"), String(observed), observed ? "bad" : "");
  // The tier word is the CLI's. Never a friendlier synonym.
  item(t("test.strip.security"), (d.security && d.security.tier) || "—", d.security && d.security.found ? "bad" : "");
  return strip;
}

/* THE CAUTION, outside the tabs. It fires only on something the run actually
   MEASURED — a red case or an OBSERVED finding — and it routes to the tab that
   can show the evidence. */
function testCaution(d) {
  const red = (d.counts && d.counts.fail) || 0;
  const observed = (d.findings || []).filter((f) => f.observed).length;
  if (!red && !observed) return null;
  const box = el("div", "ts-caution");
  const line = el("div", "ts-caution-line");
  line.append(chip(d.state, TEST_STATE_KIND[d.state] || "bad"));
  line.append(el("span", null, d.where));
  box.append(line);
  box.append(el("div", "note", t("test.findings.evidenceNote")));
  return box;
}

/* ------------------------------------------------------------- 1. TARGETS -- */

function testTargetsTab(d, tools, body) {
  const out = frag();
  out.append(el("div", "note", t("test.free")));

  const c = card(t("test.target.title"));
  const g = d.target || {};
  c.append(
    kvList([
      [t("test.target.kind"), g.kind],
      [t("test.target.env"), g.env],
      [t("test.target.baseUrl"), g.base_url],
      [t("test.target.origin"), g.origin],
    ])
  );
  // THE AUTHORIZATION STATEMENT AND THE DESTRUCTIVE DECISION RENDER ALWAYS, and
  // verbatim. A statement nobody filled in is a STATE, said out loud — never an
  // empty row and never a cheerful default.
  const auth = el("div", "ts-auth" + (d.authorized ? "" : " ts-auth-empty"));
  auth.append(el("div", "ts-auth-label", t("test.target.authorized")));
  auth.append(el("div", "ts-auth-value", d.authorized || t("test.target.authorizedEmpty")));
  auth.append(el("div", "note", t("test.target.authorizedNote")));
  c.append(auth);
  const de = d.destructive || {};
  const dbox = el("div", "row-actions");
  dbox.append(el("span", "ts-label", t("test.target.destructive")));
  dbox.append(chip(de.mode || "—", de.mode === "allow" ? "warn" : ""));
  c.append(dbox);
  if (de.reason) c.append(kvList([[t("test.target.destructiveReason"), de.reason]]));
  c.append(el("div", "note", t("test.target.frozen")));
  if (g.env === "remote") c.append(el("div", "note", t("test.target.remoteNote")));
  out.append(c);

  // Identities. The one-identity sentence is stated wherever the count is
  // shown, because it decides what the security tier can honestly report.
  const ic = card(t("test.target.identities"));
  if (!(d.identities || []).length) ic.append(empty(t("test.target.oneIdentity")));
  for (const i of d.identities || []) {
    const row = el("div", "row-actions");
    row.append(el("strong", null, i.name));
    row.append(chip(i.role, ""));
    row.append(chip(i.source, ""));
    if (i.verified_at) row.append(chip(i.verified_at, "ok"));
    ic.append(row);
  }
  if ((d.identities || []).length && !d.two_identities) ic.append(el("div", "note", t("test.target.oneIdentity")));
  out.append(ic);

  out.append(testEnvCard(d, body));
  if (tools) out.append(testToolsCard(tools));
  return out;
}

/* THE ENVIRONMENT. A button, and the outcome is the state. It is not fetched on
   open: a health state is not stored, so rendering one on open would mean
   probing the target every time somebody looks at a page. */
function testEnvCard(d, body) {
  const c = card(t("test.env.title"));
  const seen = TEST_ENV_SEEN[d.slug] || null;

  const bar = el("div", "row-actions");
  const b = el("button", "btn btn-sm", t("test.env.check"));
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    setBusy(true);
    try {
      const r = await post("/api/test/env", { slug: d.slug });
      TEST_ENV_SEEN[d.slug] = r.data || { state: null, refused: r };
    } catch (e) {
      TEST_ENV_SEEN[d.slug] = { error: (e && e.message) || String(e) };
    } finally {
      setBusy(false);
      b.disabled = false;
      renderTest(body);
    }
  });
  bar.append(b);
  c.append(bar);
  c.append(el("div", "note", t("test.env.checkWhy")));

  if (!seen) {
    c.append(el("div", "note", t("test.env.notStored")));
    return c;
  }
  if (seen.error) {
    c.append(el("pre", "block wrap", esc(seen.error)));
    return c;
  }
  // The REMOTE refusal. ORC will not start or stop anything on a host you do
  // not own, and it says so by name rather than rendering an empty card.
  if (seen.ok === false) {
    // The CLI's own reason word, and NO fallback: a refusal ORC could not name
    // is a refusal this panel must not name for it. With no reason the hint
    // stands alone rather than under a word nobody computed.
    if (seen.reason) c.append(chip(String(seen.reason), "warn"));
    c.append(el("div", "note", esc(seen.hint || "")));
    return c;
  }

  const row = el("div", "row-actions");
  row.append(chip(String(seen.state), TEST_ENV_KIND[seen.state] || ""));
  if (seen.next && seen.next.action) row.append(el("span", null, seen.next.action));
  c.append(row);
  if (seen.next && seen.next.why) c.append(el("div", "note", esc(seen.next.why)));
  if (seen.state === "unhealthy") c.append(el("div", "ts-handback", t("test.env.handBack")));

  const rows = [];
  if (seen.detected && seen.detected.command) rows.push([t("test.env.detected"), seen.detected.command + "  (" + seen.detected.rung + ")"]);
  if (seen.process) rows.push([t("test.env.process"), "pid " + seen.process.pid + (seen.process.alive ? "" : " — not alive")]);
  if (rows.length) c.append(kvList(rows));

  if (seen.health && (seen.health.tried || []).length) {
    const h = collapsible({
      title: t("test.env.health"),
      count: String(seen.health.tried.length),
      desc: seen.health.why || "",
      collapsed: true,
      content: (() => {
        const box = el("div", "stack stack-sm");
        for (const x of seen.health.tried) {
          const r2 = el("div", "row-actions");
          r2.append(el("code", null, x.path));
          r2.append(chip(x.status === null ? String(x.reason || "—") : String(x.status), x.status && x.status < 400 ? "ok" : "warn"));
          box.append(r2);
        }
        return box;
      })(),
    });
    c.append(h);
  }
  if (!seen.detected || !seen.detected.command) {
    if ((seen.looked_for || []).length) c.append(kvList([[t("test.env.lookedFor"), seen.looked_for.join(", ")]]));
  }
  if (seen.env_vars && (seen.env_vars.missing || []).length) {
    c.append(kvList([[t("test.env.vars"), seen.env_vars.missing.join(", ")]]));
    c.append(el("div", "note", t("test.env.varsNote")));
  }
  if ((seen.log_tail || []).length) {
    c.append(el("div", "ts-label", t("test.env.logs")));
    c.append(el("pre", "block wrap", seen.log_tail.join("\n")));
  }
  return c;
}

/* THE FRONT-END DRIVER. A tool can simply be absent, and that is a STATE before
   it is a failure. ORC NAMES the install command and never runs it. */
function testToolsCard(tools) {
  const c = card(t("test.ui.title"));
  const row = el("div", "row-actions");
  row.append(chip(String(tools.state), TEST_TOOL_KIND[tools.state] || ""));
  c.append(row);
  if (tools.why) c.append(el("div", "note", esc(tools.why)));
  if (tools.disabled) c.append(el("div", "note", t("test.ui.off")));
  const rows = [];
  if (tools.bin) rows.push([t("test.ui.binary"), tools.bin]);
  if (tools.from) rows.push([t("test.ui.from"), tools.from]);
  if (tools.version) rows.push([t("test.ui.version"), tools.version]);
  if (tools.min_version) rows.push([t("test.ui.minVersion"), tools.min_version]);
  if ((tools.browsers || []).length) rows.push([t("test.ui.browsers"), tools.browsers.join(", ")]);
  if (rows.length) c.append(kvList(rows));
  if (!tools.disabled && tools.state !== "ready" && tools.next) {
    c.append(laneCommand(tools.next, t("test.ui.installNote"), t("common.runInTerminal")));
    // `no_install_alternative: null` MEANS there is none — never that ORC
    // forgot to look.
    if (tools.no_install_alternative === null) c.append(el("div", "note", t("test.ui.noAlternative")));
  }
  c.append(el("div", "note", t("test.ui.fresh")));
  return c;
}

/* ------------------------------------------------------------- 2. SURFACE -- */

function testSurfaceTab(d, body) {
  const out = frag();
  const s = d.surface;

  const bar = card(t("test.surface.take"));
  const row = el("div", "row-actions");
  const b = el("button", "btn btn-sm", t("test.surface.take"));
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    setBusy(true);
    try {
      await post("/api/test/surface", { slug: d.slug });
    } catch (e) {
      toast(String((e && e.message) || e), "bad");
    } finally {
      setBusy(false);
      renderTest(body);
    }
  });
  row.append(b);
  bar.append(row);
  bar.append(el("div", "note", t("test.surface.takeWhy")));
  out.append(bar);

  if (!s) {
    out.append(empty(t("test.surface.none"), t("test.surface.takeWhy")));
    return out;
  }

  const sum = card(t("test.surface.title"));
  sum.append(
    kvList([
      [t("test.surface.specDisk"), s.spec_on_disk ? s.spec_on_disk.file + (s.spec_on_disk.parsed ? "" : " — " + s.spec_on_disk.why) : "—"],
      [t("test.surface.specTarget"), s.spec_at_target && s.spec_at_target.found ? s.spec_at_target.found : "—"],
      [t("test.surface.frameworks"), (s.frameworks || []).join(", ") || "—"],
      [t("test.surface.files"), String(s.files_scanned)],
      [t("test.surface.routes"), String((s.routes || []).length)],
      [t("test.surface.mounts"), (s.mounts || []).map((m) => m.prefix).join(", ") || "—"],
    ])
  );
  if ((s.mounts || []).length) sum.append(el("div", "note", t("test.surface.mountsNote")));
  out.append(sum);

  // THE CODE-VS-LIVE DIFF. A `null` source means NOT MEASURED and carries its
  // own reason — the one thing that must never render as "no shadow APIs".
  const dc = card(t("test.surface.diff"));
  if (s.diff && s.diff.source) {
    const r1 = el("div", "row-actions");
    r1.append(el("span", "ts-label", t("test.surface.codeOnly")));
    r1.append(chip(String(s.diff.code_only.length), s.diff.code_only.length ? "warn" : ""));
    dc.append(r1);
    for (const x of s.diff.code_only) dc.append(el("div", "ts-route-min", x.key + (x.file ? "   " + x.file + (x.line ? ":" + x.line : "") : "")));
    const r2 = el("div", "row-actions");
    r2.append(el("span", "ts-label", t("test.surface.liveOnly")));
    r2.append(chip(String(s.diff.live_only.length), s.diff.live_only.length ? "bad" : ""));
    dc.append(r2);
    for (const x of s.diff.live_only) dc.append(el("div", "ts-route-min ts-bad", x.key));
    dc.append(el("div", "note", esc(s.diff.note)));
  } else {
    dc.append(chip(t("test.surface.notMeasured"), "warn"));
    dc.append(el("div", "note", esc((s.diff && s.diff.why) || "")));
  }
  out.append(dc);

  const rc = card(t("test.surface.routes"));
  for (const r of s.routes || []) {
    const row2 = el("div", "ts-route");
    row2.append(el("span", "ts-method", r.method));
    row2.append(el("span", "ts-path", r.path));
    row2.append(chip(r.in_code ? t("test.surface.inCode") : t("test.surface.notInCode"), r.in_code ? "" : "bad"));
    // `live: null` is "we did not look", which is a different fact from "it is
    // not there" — and only one of them is a finding.
    row2.append(chip(r.live === null ? t("test.surface.liveUnknown") : r.live ? t("test.surface.liveYes") : t("test.surface.notLive"), r.live === null ? "" : r.live ? "ok" : "warn"));
    const where = el("span", "ts-where", r.file ? r.file + (r.line ? ":" + r.line : "") : r.source);
    row2.append(where);
    rc.append(row2);
  }
  out.append(rc);

  if ((s.unresolved || []).length) {
    const uc = card(t("test.surface.unresolved"));
    for (const u of s.unresolved) uc.append(el("div", "ts-route-min", u.file + ":" + u.line + "   " + u.text));
    uc.append(el("div", "note", t("test.surface.unresolvedNote")));
    out.append(uc);
  }
  return out;
}

/* --------------------------------------------------------------- 3. CASES -- */

function testCasesTab(d) {
  const out = frag();
  const cases = d.cases || [];

  const head2 = card(t("test.cases.budget"));
  head2.append(el("div", "note", t("test.cases.derived")));
  if (d.case_budget) {
    head2.append(kvList([[t("test.cases.budget"), String(d.case_budget.budget)]]));
    if (d.case_budget.reached) {
      head2.append(el("div", "note", t("test.cases.budgetReached")));
      if ((d.case_budget.unfinished || []).length)
        head2.append(kvList([[t("test.cases.unfinished"), d.case_budget.unfinished.join(", ")]]));
    }
  }
  const gaps = cases.filter((c) => (c.gaps || []).length).length;
  if (gaps) {
    const gr = el("div", "row-actions");
    gr.append(chip(gaps + " " + t("test.cases.gap"), "warn"));
    head2.append(gr);
    head2.append(el("div", "note", t("test.cases.gapNote")));
  }
  head2.append(laneCommand("orc test case derive " + d.slug, t("test.paidWhy"), t("common.runInTerminal")));
  out.append(head2);

  if (!cases.length) {
    out.append(empty(t("test.cases.none"), t("test.cases.derived")));
  } else {
    const lc = card(t("test.cases.title"));
    for (const c of cases) {
      const row = el("div", "ts-case");
      row.append(el("span", "ts-case-id", c.id));
      row.append(chip(c.tier, ""));
      row.append(chip(c.verdict || t("test.cases.notRun"), TEST_VERDICT_KIND[c.verdict] || ""));
      const mid = el("div", "ts-case-mid");
      mid.append(el("div", "ts-case-target", c.target));
      mid.append(el("div", "ts-case-why", c.why));
      if (c.verdict_why) mid.append(el("div", "ts-case-why", c.verdict_why));
      if ((c.gaps || []).length) for (const g of c.gaps) mid.append(el("div", "ts-case-gap", g));
      // The EVIDENCE PATH, never the evidence BODY. A captured response body is
      // the most sensitive thing this lane writes to disk, and it stays on the
      // disk: this panel names where it is and does not open it.
      if (c.evidence) mid.append(el("div", "ts-case-ev", t("test.cases.evidence") + ": " + c.evidence));
      row.append(mid);
      const tail = el("div", "ts-case-tail");
      if (c.owasp) tail.append(chip(c.owasp, ""));
      if (c.identity) tail.append(chip(t("test.cases.identity") + " " + c.identity, ""));
      if (c.mutates) tail.append(chip(t("test.cases.mutates"), "warn"));
      row.append(tail);
      lc.append(row);
    }
    out.append(lc);
  }

  out.append(testSecurityCard(d));
  return out;
}

/* THE CLOSED OWASP SET. Every one of the ten rows renders, in every state:
   `unchecked` KEEPS ITS SLOT with its reason, never becomes a pass, and never
   raises the exit code. The ids, the names, the state words and the severities
   are all the CLI's. */
function testSecurityCard(d) {
  const sec = d.security || {};
  const c = card(t("test.security.title"));
  const bar = el("div", "row-actions");
  bar.append(el("span", "ts-label", t("test.security.tier")));
  bar.append(chip(String(sec.tier), sec.tier === "off" ? "warn" : ""));
  if (sec.tier_source && sec.tier_source.source) bar.append(el("span", "ts-where", sec.tier_source.source));
  c.append(bar);
  c.append(el("div", "note", t("test.security.tierDerived")));
  for (const note of sec.notes || []) c.append(el("div", "ts-handback", esc(note)));

  for (const r of sec.rows || []) {
    const row = el("div", "ts-owasp");
    row.append(el("span", "ts-owasp-id", r.owasp));
    row.append(chip(r.state, TEST_SEC_KIND[r.state] || ""));
    const mid = el("div", "ts-owasp-mid");
    mid.append(el("div", "ts-owasp-name", r.name));
    mid.append(el("div", "ts-case-why", t("test.security.needs") + ": " + r.needs));
    mid.append(el("div", "ts-case-why", t("test.security.probe") + ": " + r.probe));
    if (r.state === "FOUND" && r.severity) {
      const sv = el("div", "row-actions");
      sv.append(chip(r.severity.severity, TEST_SEV_KIND[r.severity.severity] || "bad"));
      sv.append(el("span", "ts-case-why", r.severity.why));
      mid.append(sv);
      if (r.severity.cvss) mid.append(el("div", "ts-case-ev", r.severity.cvss));
      for (const x of (r.cases || []).filter((y) => y.verdict === "fail")) {
        mid.append(el("div", "ts-case-why", x.id + "  " + x.why));
        if (x.evidence) mid.append(el("div", "ts-case-ev", x.evidence));
      }
    }
    for (const u of r.unchecked || []) mid.append(el("div", "ts-owasp-unchecked", esc(u.why)));
    row.append(mid);
    c.append(row);
  }
  for (const s of sec.statics || []) {
    c.append(el("div", "ts-label", s.owasp + " — " + s.what));
    for (const r of s.rows || []) c.append(el("div", "ts-route-min", (r.at || "—") + "   " + r.what + "   (" + r.target + ")"));
    c.append(el("div", "note", t("test.security.statics")));
  }
  c.append(el("div", "note", t("test.security.uncheckedNote")));
  c.append(el("div", "note", t("test.security.closed")));
  c.append(el("div", "note", t("test.security.detect")));
  return c;
}

/* ---------------------------------------------------------------- 4. RUNS -- */

function testRunsTab(d) {
  const out = frag();
  const c = card(t("test.runs.title"));
  // `orc test run` is where the traffic is. It is a COPY-ABLE COMMAND and never
  // a button here.
  c.append(laneCommand("orc test run " + d.slug, t("test.trafficWhy"), t("common.runInTerminal")));
  out.append(c);

  const runs = d.runs || [];
  if (!runs.length) {
    out.append(empty(t("test.runs.none"), t("test.runs.cmd")));
    return out;
  }

  const list = el("div", "run-list");
  const rows = [];
  const setOpen = (entry, open) => {
    entry.row.classList.toggle("open", open);
    entry.head.setAttribute("aria-expanded", String(open));
  };
  for (const r of runs.slice().reverse()) {
    const row = el("div", "run-row");
    // A row that EXPANDS IN PLACE, one at a time. `.run-card` DECLARES its
    // column count — a card whose child count changes with its state cannot
    // declare its rows.
    const headBtn = el("button", "run-card has-extra");
    headBtn.type = "button";
    headBtn.setAttribute("aria-expanded", "false");
    headBtn.append(el("span", "run-caret", "▸"));
    headBtn.append(chip("run " + r.n, r.counts.fail ? "bad" : "ok"));
    // The stop chip KEEPS ITS SLOT when there was no stop — an empty span, not
    // an em dash. A run that ran to the end and a run whose stop was not
    // computed are different facts, and a placeholder must assert neither.
    headBtn.append(r.stopped ? chip(t("test.runs.stopped") + ": " + r.stopped, "warn") : el("span"));
    const mid = el("div", "run-mid");
    mid.append(el("div", "run-slug", r.counts.pass + " pass · " + r.counts.fail + " fail · " + r.counts.unknown + " unknown"));
    mid.append(el("div", "run-where", r.dir));
    headBtn.append(mid, el("div", "run-age", esc(r.at)));

    const pane = el("div", "run-pane stack stack-sm");
    if (r.stopped) pane.append(el("div", "ts-handback", t("test.runs.stoppedWhy")));
    pane.append(kvList([[t("test.runs.dir"), r.dir]], true));
    const mine = (d.cases || []).filter((c2) => c2.evidence && c2.evidence.indexOf("/" + r.dir + "/") !== -1);
    for (const c2 of mine) {
      const line = el("div", "ts-case");
      line.append(el("span", "ts-case-id", c2.id));
      line.append(chip(c2.verdict || t("test.cases.notRun"), TEST_VERDICT_KIND[c2.verdict] || ""));
      const m2 = el("div", "ts-case-mid");
      m2.append(el("div", "ts-case-target", c2.target));
      if (c2.verdict_why) m2.append(el("div", "ts-case-why", c2.verdict_why));
      line.append(m2, el("div", "ts-case-tail"));
      pane.append(line);
    }
    const inner = el("div", "run-body-inner");
    inner.append(pane);
    const fold = el("div", "run-body");
    fold.append(inner);

    const entry = { row, head: headBtn, pane };
    rows.push(entry);
    headBtn.addEventListener("click", () => {
      const isOpen = row.classList.contains("open");
      for (const other of rows) if (other !== entry) setOpen(other, false);
      setOpen(entry, !isOpen);
    });
    row.append(headBtn, fold);
    list.append(row);
  }
  out.append(list);

  // A FLAKE IS RECORDED, NEVER RETRIED AWAY.
  if ((d.flakes || []).length) {
    const fc = card(t("test.runs.flakes"));
    for (const f of d.flakes)
      fc.append(el("div", "ts-route-min", "run " + f.run + "  " + f.id + "   " + t("test.runs.was") + " " + f.was + " · " + t("test.runs.now") + " " + f.now));
    fc.append(el("div", "note", t("test.runs.flakesNote")));
    out.append(fc);
  }
  return out;
}

/* ------------------------------------------------------------ 5. FINDINGS -- */

function testFindingsTab(d, body) {
  const out = frag();

  const c = card(t("test.findings.title"));
  const bar = el("div", "row-actions");
  const b = el("button", "btn btn-sm", t("test.findings.report"));
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    setBusy(true);
    try {
      await post("/api/test/report", { slug: d.slug });
      toast(t("test.findings.report"), "ok");
    } catch (e) {
      toast(String((e && e.message) || e), "bad");
    } finally {
      setBusy(false);
      renderTest(body);
    }
  });
  bar.append(b);
  c.append(bar);
  c.append(el("div", "note", t("test.findings.reportWhy")));
  if (d.report_exists) c.append(kvList([[t("test.findings.reportAt"), d.paths.report]], true));
  else c.append(el("div", "note", t("test.findings.reportMissing")));
  c.append(el("div", "ts-handback", t("test.findings.neverStaged")));
  out.append(c);

  if (!(d.findings || []).length) {
    out.append(empty(t("test.findings.none"), t("test.findings.evidenceNote")));
    return out;
  }

  for (const f of d.findings) {
    const fc = card(f.title);
    const row = el("div", "row-actions");
    // OBSERVED and NOT OBSERVED are the two things a report must never blur.
    row.append(chip(f.observed ? t("test.findings.observed") : t("test.findings.notObserved"), f.observed ? "bad" : "warn"));
    row.append(chip(f.severity, TEST_SEV_KIND[f.severity] || ""));
    if (f.owasp) row.append(chip(f.owasp, ""));
    fc.append(row);
    fc.append(el("div", "ts-case-why", f.what));
    // ORC'S SEVERITY IS THE ONE THAT COUNTS. The model's own is kept beside it
    // and printed only when the two disagree.
    fc.append(el("div", "note", esc(f.severity_why)));
    if (f.claimed_severity && String(f.claimed_severity).toLowerCase() !== String(f.severity).toLowerCase()) {
      fc.append(el("div", "note", t("test.security.claimed") + ' "' + f.claimed_severity + '"'));
      fc.append(el("div", "note", t("test.security.severityWho")));
    }
    if (!f.observed) fc.append(el("div", "note", t("test.findings.notObservedNote")));
    const rows = [];
    if (f.case) rows.push([t("test.findings.case"), f.case]);
    if (f.target) rows.push([t("test.findings.target"), f.target]);
    if (f.evidence) rows.push([t("test.cases.evidence"), f.evidence]);
    if (f.cvss) rows.push(["CVSS", f.cvss]);
    if (f.impact) rows.push([t("test.findings.impact"), f.impact]);
    if (f.fix) rows.push([t("test.findings.fix"), f.fix]);
    fc.append(kvList(rows));
    if (f.cvss_note) fc.append(el("div", "note", esc(f.cvss_note)));
    out.append(fc);
  }
  out.append(el("div", "note", t("test.findings.evidenceNote")));
  return out;
}
