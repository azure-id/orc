"use strict";
/* panels/lorc.js — orc ui client
   The Light ORC panel (v2.3.0). It draws `orc lorc … --json` and nothing else:
   ORC runs the lorc CLI and passes its JSON through, so this file keeps no copy
   of a lorc format. State words are the CLI's, verbatim (`NOT-INSTALLED`,
   `UNREADABLE`). The rail item shows only when lorc is installed (DE-UI1), and
   the panel never installs a package (DE-UI2) — the Version tab shows the two
   commands as copyable text.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

const LORC_TABS = ["overview", "runs", "usage", "settings", "behaviour", "version"];
// Keys written out in full, never assembled from the tab id.
const LORC_TAB_KEY = {
  overview: "lorc.tab.overview",
  runs: "lorc.tab.runs",
  usage: "lorc.tab.usage",
  settings: "lorc.tab.settings",
  behaviour: "lorc.tab.behaviour",
  version: "lorc.tab.version",
};
const LORC_OUTCOME_KIND = { done: "ok", stopped: "warn", failed: "bad" };
const LORC_INSTALL_CMDS = ["npm i -g @azure-id/lorc@latest", "lorc update"];

// Fixture mode only: `#/lorc?fx=<state>` picks one canned state. A live
// server ignores the parameter, and the panel never sends it outside fixtures.
function lorcFx() {
  if (!metaInfo || !metaInfo.fixtures) return "";
  const m = /[?&]fx=([a-z]+)/.exec(location.hash);
  return m ? m[1] : "";
}
function lorcUrl(path, params) {
  const p = Object.assign({}, params || {});
  const fx = lorcFx();
  if (fx) p.fx = fx;
  const qs = Object.keys(p)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(p[k]))
    .join("&");
  return path + (qs ? "?" + qs : "");
}
function lorcRead(path, params) {
  return read(lorcUrl(path, params)).then((r) => r.data);
}

// A pass-through answer is `{ ok, source, data }` or `{ ok: false, state }`.
// The state word is shown verbatim; UNREADABLE also shows its `detail`.
function lorcStateBox(w) {
  const box = el("div", "lorc-state");
  box.append(chip(String((w && w.state) || "UNREADABLE"), w && w.state === "NOT-INSTALLED" ? "warn" : "bad"));
  if (w && w.state === "NOT-INSTALLED") box.append(el("div", "note", t("lorc.notInstalledHint")));
  if (w && w.detail) box.append(el("pre", "block wrap", String(w.detail)));
  return box;
}
function lorcPass(w, render) {
  if (!w || w.ok === false) return lorcStateBox(w);
  const out = render(w.data);
  return out;
}

function lorcCmd(text) {
  const row = el("div", "lorc-cmd");
  row.append(el("code", "mono", text));
  const b = el("button", "copy-btn", t("common.copy").toLowerCase());
  b.type = "button";
  b.addEventListener("click", () => copy(text, text));
  row.append(b);
  return row;
}

function lorcPct(n) {
  return n === null || n === undefined ? "—" : String(n) + "%";
}
function lorcNum(n) {
  return n === null || n === undefined ? "—" : String(n);
}

PANELS.lorc = function (host) {
  head(host, t("lorc.title"), t("lorc.sub"));
  const tabs = el("div", "tabs");
  const body = el("div", "stack");
  const m = /[?&]tab=([a-z]+)/.exec(location.hash);
  let active = m && LORC_TABS.includes(m[1]) ? m[1] : "overview";
  const mk = (id) => {
    const b = el("button", "tab" + (id === active ? " tab-on" : ""), t(LORC_TAB_KEY[id]));
    b.type = "button";
    b.dataset.tab = id;
    b.addEventListener("click", () => {
      active = id;
      for (const x of tabs.children) x.classList.toggle("tab-on", x === b);
      body.replaceChildren();
      LORC_RENDER[id](body);
    });
    return b;
  };
  for (const id of LORC_TABS) tabs.append(mk(id));
  host.append(tabs, body);
  LORC_RENDER[active](body);
};

/* ---------------------------------------------------------------- overview */
function renderLorcOverview(host) {
  section(
    host,
    () =>
      Promise.all(["/api/lorc/status", "/api/lorc/usage", "/api/lorc/graph", "/api/lorc/doctor"].map((p) => lorcRead(p))),
    ([st, usage, graph, doctor]) => {
      const out = frag();
      const c = card(t("lorc.install.title"), chip(String((st && st.installed) || "none"), st && st.installed !== "none" ? "ok" : "warn"));
      if (!st || st.installed === "none") {
        c.append(chip("NOT-INSTALLED", "warn"));
        c.append(el("div", "note", t("lorc.notInstalledHint")));
        for (const cmd of LORC_INSTALL_CMDS.slice(0, 1)) c.append(lorcCmd(cmd));
        out.append(c);
        return out;
      }
      c.append(
        kvList([
          [t("lorc.install.version"), st.version || "—"],
          [t("lorc.install.project"), st.project ? `${st.project.version} · ${st.project.path}` : "—"],
          [t("lorc.install.global"), st.global ? `${st.global.version} · ${st.global.path}` : "—"],
        ])
      );
      c.append(kvList([[t("lorc.install.cli"), st.cli]], true));
      if (!st.cli_ok) c.append(el("div", "note bad", t("lorc.install.cliBad")));
      out.append(c);

      const u = card(t("lorc.usage.title"));
      u.append(
        lorcPass(usage, (d) => {
          const f = frag();
          f.append(chip(String(d.state), d.state === "ok" ? "ok" : d.state === "unknown" ? "" : "bad"));
          const fh = d.five_hour || {};
          f.append(
            kvList([
              [t("lorc.usage.fiveHour"), d.five_hour ? lorcPct(fh.used) : "—"],
              [t("lorc.usage.resetMin"), d.five_hour ? lorcNum(fh.resets_in_min) : "—"],
              [t("lorc.usage.weekly"), d.seven_day ? lorcPct(d.seven_day.used) : "—"],
              [t("lorc.usage.context"), lorcPct(d.context)],
              [t("lorc.usage.source"), d.source || "—"],
              [t("lorc.usage.limits"), `${lorcPct(d.limit_pct)} · ${lorcPct(d.limit_weekly_pct)}`],
            ])
          );
          return f;
        })
      );
      out.append(u);

      const g = card(t("lorc.graph.title"));
      g.append(
        lorcPass(graph, (d) => {
          const f = frag();
          f.append(chip(String(d.mode), "info"));
          f.append(kvList([[t("lorc.graph.reason"), d.reason], [t("lorc.graph.dir"), d.claudeDir]]));
          return f;
        })
      );
      out.append(g);

      const dc = card(t("lorc.doctor.title"));
      dc.append(
        lorcPass(doctor, (d) => {
          const list = el("div", "lorc-checks");
          for (const ck of d.checks || []) {
            const row = el("div", "lorc-check" + (ck.ok ? "" : " lorc-check-bad"));
            row.append(el("span", "lorc-mark", ck.ok ? "✓" : "✗"), el("span", "mono", ck.id), el("span", null, ck.detail || ""));
            if (!ck.ok && ck.fix) row.append(el("code", "mono", ck.fix));
            list.append(row);
          }
          return list;
        })
      );
      out.append(dc);
      return out;
    }
  );
}

/* -------------------------------------------------------------------- runs */
function lorcRows(d) {
  if (Array.isArray(d)) return d;
  return (d && (d.runs || d.rows)) || [];
}

function renderLorcRuns(host) {
  section(
    host,
    () => lorcRead("/api/lorc/runs"),
    (w) =>
      lorcPass(w, (d) => {
        const rows = lorcRows(d);
        if (!rows.length) return empty(t("lorc.runs.none"), t("lorc.runs.noneHint"));
        const tbl = el("table", "tbl lorc-runs");
        const hr = el("tr");
        for (const k of ["lorc.runs.slug", "lorc.runs.request", "lorc.runs.tier", "lorc.runs.executor", "lorc.runs.outcome", "lorc.runs.duration", "lorc.runs.findings"]) hr.append(el("th", null, t(k)));
        const thead = el("thead");
        thead.append(hr);
        const tb = el("tbody");
        for (const r of rows) {
          const tr = el("tr", "lorc-run-row");
          const f = r.findings || {};
          tr.append(
            el("td", "mono", r.slug),
            el("td", null, r.request || ""),
            el("td", null, r.tier || "—"),
            el("td", "mono", r.executor || "—"),
            (() => {
              const td = el("td");
              td.append(chip(String(r.outcome || "—"), LORC_OUTCOME_KIND[r.outcome] || ""));
              return td;
            })(),
            el("td", null, lorcNum(r.duration_s) + " s"),
            el("td", "mono", `P0 ${f.P0 || 0} · P1 ${f.P1 || 0} · P2 ${f.P2 || 0} · P3 ${f.P3 || 0}`)
          );
          const detail = el("tr", "lorc-run-detail");
          detail.hidden = true;
          const cell = el("td");
          cell.colSpan = 7;
          detail.append(cell);
          tr.addEventListener("click", () => {
            const open = detail.hidden;
            for (const x of tb.querySelectorAll(".lorc-run-detail")) x.hidden = true;
            detail.hidden = !open;
            if (open && !cell.dataset.loaded) {
              cell.dataset.loaded = "1";
              cell.append(skeleton(3));
              lorcRead("/api/lorc/run", { slug: r.slug })
                .then((rw) => cell.replaceChildren(lorcPass(rw, lorcRunDetail)))
                .catch((e) => cell.replaceChildren(failBox(e)));
            }
          });
          tb.append(tr, detail);
        }
        tbl.append(thead, tb);
        return tbl;
      })
  );
}

function lorcRunDetail(d) {
  const f = el("div", "stack stack-sm");
  f.append(el("h3", null, t("lorc.run.tasks")));
  const tasks = d.tasks || [];
  if (!tasks.length) f.append(el("div", "note", t("lorc.run.noTasks")));
  for (const tk of tasks) f.append(el("div", "lorc-task", `${tk.id || ""} · ${tk.title || ""} · ${tk.executor || ""} · ${tk.status || ""}`));
  f.append(el("h3", null, t("lorc.run.checks")));
  const checks = d.checks || [];
  if (!checks.length) f.append(el("div", "note", t("lorc.run.noChecks")));
  for (const ck of checks) {
    const row = el("div", "lorc-check" + (ck.ok ? "" : " lorc-check-bad"));
    row.append(el("span", "lorc-mark", ck.ok ? "✓" : "✗"), el("span", "mono", ck.name || ck.id || ""), el("span", null, ck.detail || ""));
    f.append(row);
  }
  return f;
}

/* ------------------------------------------------------------------- usage */
function renderLorcUsage(host) {
  section(
    host,
    () => lorcRead("/api/lorc/stats"),
    (w) =>
      lorcPass(w, (d) => {
        const runs = (d && d.runs) || [];
        if (!runs.length) return empty(t("lorc.runs.none"), t("lorc.runs.noneHint"));
        const tbl = el("table", "tbl lorc-usage");
        const hr = el("tr");
        for (const k of ["lorc.runs.slug", "lorc.stats.input", "lorc.stats.output", "lorc.stats.cacheRead", "lorc.stats.cacheWrite", "lorc.stats.total", "lorc.stats.cost"]) hr.append(el("th", null, t(k)));
        const thead = el("thead");
        thead.append(hr);
        const tb = el("tbody");
        const rowOf = (label, tk, cost, note) => {
          const tr = el("tr");
          tr.append(el("td", "mono", label));
          for (const k of ["input", "output", "cache_read", "cache_write", "total"]) tr.append(el("td", "num", tk ? lorcNum(tk[k]) : "—"));
          tr.append(el("td", "num", cost === null || cost === undefined ? note || "—" : "$" + String(cost)));
          return tr;
        };
        for (const r of runs) tb.append(rowOf(r.slug, r.tokens, r.cost_usd, r.note));
        const tot = (d && d.totals) || {};
        const trT = rowOf(t("lorc.stats.totals"), tot.tokens, tot.cost_usd);
        trT.classList.add("lorc-total");
        tb.append(trT);
        tbl.append(thead, tb);
        return tbl;
      })
  );
}

/* ---------------------------------------------------------------- settings */
function renderLorcSettings(host) {
  section(
    host,
    () => lorcRead("/api/lorc/settings"),
    (w) =>
      lorcPass(w, (d) => {
        const out = el("div", "stack");
        const files = d.files || {};
        out.append(kvList([[t("lorc.settings.projectFile"), files.project], [t("lorc.settings.globalFile"), files.global]], true));
        const tgl = el("label", "lorc-global");
        const cb = el("input");
        cb.type = "checkbox";
        tgl.append(cb, document.createTextNode(" " + t("lorc.settings.global")));
        out.append(tgl);
        const tbl = el("table", "tbl lorc-settings");
        const hr = el("tr");
        for (const k of ["lorc.settings.key", "lorc.settings.value", "lorc.settings.source", "lorc.settings.edit"]) hr.append(el("th", null, t(k)));
        const thead = el("thead");
        thead.append(hr);
        const tb = el("tbody");
        const values = d.values || {};
        const sources = d.sources || {};
        for (const key of Object.keys(values)) {
          const tr = el("tr");
          const inp = el("input", "input lorc-input");
          inp.type = "text";
          inp.value = String(values[key]);
          inp.dataset.key = key;
          const err = el("div", "note bad lorc-err");
          err.hidden = true;
          const valTd = el("td");
          valTd.append(inp, err);
          const save = el("button", "btn btn-sm", t("lorc.settings.save"));
          save.type = "button";
          save.addEventListener("click", async () => {
            err.hidden = true;
            const r = await lorcSettingsSet(key, inp.value, cb.checked);
            if (r.ok) {
              toast(t("lorc.settings.saved", { key }), "ok", r.line);
              renderAgain(host, renderLorcSettings);
            } else {
              err.textContent = r.line || t("lorc.settings.failed");
              err.hidden = false;
            }
          });
          const editTd = el("td");
          editTd.append(save);
          tr.append(el("td", "mono", key), valTd, el("td", null, String(sources[key] || "")), editTd);
          tb.append(tr);
        }
        tbl.append(thead, tb);
        out.append(tbl);
        out.append(el("div", "note", t("lorc.settings.note")));
        return out;
      })
  );
}

// POST `{ key, value, global }`. A bad value comes back exit 2 with the CLI's
// own line, which is shown as it is.
async function lorcSettingsSet(key, value, global) {
  const r = await post(lorcUrl("/api/lorc/settings/set"), { key, value, global: !!global });
  return lorcWriteResult(r);
}
function lorcWriteResult(r) {
  const line = String((r && (r.output || (r.data && r.data.output))) || "").trim();
  const exit = r && r.exit_code !== undefined ? r.exit_code : 0;
  return { ok: !!r && r.ok !== false && exit === 0, line, exit };
}
function renderAgain(host, fn) {
  host.replaceChildren();
  fn(host);
}

/* --------------------------------------------------------------- behaviour */
function renderLorcBehaviour(host) {
  section(
    host,
    () => lorcRead("/api/lorc/habits"),
    (w) =>
      lorcPass(w, (d) => {
        const out = el("div", "stack");
        const mc = card(t("lorc.habits.mode"), chip(String(d.mode || "—"), "info"));
        out.append(mc);
        const pc = card(t("lorc.habits.proposals"));
        const props = d.proposals || [];
        if (!props.length) pc.append(el("div", "note", t("lorc.habits.none")));
        for (const p of props) {
          const row = el("div", "lorc-proposal");
          row.append(el("div", null, p.text || p.question || p.id), el("div", "mono note", p.id));
          const act = el("div", "row-actions");
          for (const [verb, key] of [["accept", "lorc.habits.accept"], ["decline", "lorc.habits.decline"]]) {
            const b = el("button", "btn btn-sm" + (verb === "accept" ? " btn-primary" : ""), t(key));
            b.type = "button";
            b.dataset.verb = verb;
            b.addEventListener("click", async () => {
              const r = lorcWriteResult(await lorcHabit(verb, p.id));
              toast(r.ok ? t("lorc.habits.done") : t("lorc.habits.failed"), r.ok ? "ok" : "bad", r.line);
              renderAgain(host, renderLorcBehaviour);
            });
            act.append(b);
          }
          row.append(act);
          pc.append(row);
        }
        out.append(pc);
        const s = d.stats || {};
        const sc = card(t("lorc.habits.stats"));
        sc.append(
          kvList([
            [t("lorc.habits.asks"), lorcNum(s.asks)],
            [t("lorc.habits.followed"), s.followed_rate === null || s.followed_rate === undefined ? "—" : String(Math.round(s.followed_rate * 100)) + "%"],
          ])
        );
        const byTier = s.executor_by_tier || {};
        sc.append(el("h3", null, t("lorc.habits.byTier")));
        for (const tier of Object.keys(byTier))
          sc.append(el("div", "mono", tier + ": " + Object.entries(byTier[tier]).map(([x, n]) => `${x} ${n}`).join(" · ")));
        const byCat = s.findings_by_cat || {};
        sc.append(el("h3", null, t("lorc.habits.byCat")));
        for (const cat of Object.keys(byCat)) {
          const c = byCat[cat];
          sc.append(el("div", "mono", `${cat}: fixed ${c.fixed || 0} · listed ${c.listed || 0} · rejected ${c.rejected || 0}`));
        }
        out.append(sc);
        return out;
      })
  );
}

// POST `{ id }`, accept or decline. Nothing is applied without this click.
function lorcHabit(verb, id) {
  return post(lorcUrl(verb === "accept" ? "/api/lorc/habits/accept" : "/api/lorc/habits/decline"), { id });
}

/* ----------------------------------------------------------------- version */
function renderLorcVersion(host) {
  section(
    host,
    () => Promise.all([lorcRead("/api/lorc/version"), lorcRead("/api/lorc/changelog")]),
    ([ver, log]) => {
      const out = frag();
      const c = card(t("lorc.version.title"));
      c.append(lorcPass(ver, (d) => kvList([[t("lorc.version.name"), d.name], [t("lorc.version.installed"), d.version]])));
      out.append(c);
      const cl = card(t("lorc.version.changelog"));
      cl.append(
        lorcPass(log, (d) => {
          const f = frag();
          f.append(kvList([[t("lorc.version.latest"), d.latest], [t("lorc.version.source"), d.source]]));
          const newer = d.newer || [];
          if (!newer.length) f.append(el("div", "note", t("lorc.version.upToDate")));
          for (const e of newer) {
            const box = el("div", "lorc-entry");
            box.append(el("h3", null, `${e.version}${e.date ? " — " + e.date : ""}`));
            for (const line of e.lines || []) box.append(el("div", null, String(line).replace(/^[-*]\s+/, "")));
            f.append(box);
          }
          return f;
        })
      );
      out.append(cl);
      const how = card(t("lorc.version.update"));
      how.append(el("div", "note", t("lorc.version.updateNote")));
      for (const cmd of LORC_INSTALL_CMDS) how.append(lorcCmd(cmd));
      out.append(how);
      return out;
    }
  );
}

const LORC_RENDER = {
  overview: renderLorcOverview,
  runs: renderLorcRuns,
  usage: renderLorcUsage,
  settings: renderLorcSettings,
  behaviour: renderLorcBehaviour,
  version: renderLorcVersion,
};

/* ---------------------------------------------------------- rail + overview */
// DE-UI1: the rail item is hidden when lorc is absent. Called once by boot().
async function lorcRailShow() {
  try {
    const st = await lorcRead("/api/lorc/status");
    lorcRailApply(st);
  } catch (_) {}
}
function lorcRailApply(st) {
  const a = document.querySelector('#nav a[data-panel="lorc"]');
  const li = a && a.parentElement;
  if (li) li.hidden = !(st && st.installed && st.installed !== "none");
}

// The ORC Overview panel calls this: a small chip that links to #/lorc, only
// when lorc is installed. Nothing is drawn when it is absent.
function lorcOverviewChip(host) {
  const chipSlot = el("div", "lorc-detected");
  host.append(chipSlot);
  lorcRead("/api/lorc/status")
    .then((st) => {
      if (!st || !st.installed || st.installed === "none") return;
      const a = el("a", "chip chip-info lorc-chip", t("lorc.detected", { version: st.version || "?" }));
      a.href = "#/lorc";
      chipSlot.append(a);
    })
    .catch(() => {});
}
