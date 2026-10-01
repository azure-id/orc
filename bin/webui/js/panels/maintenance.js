"use strict";
/* panels/maintenance.js — orc ui client
   Preview-then-apply. The apply button stays disabled until a preview was
   fetched, the exact command is always visible, and a prune names EVERY file.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

PANELS.maintenance = function (host) {
  head(host, t("maintenance.title"), t("maintenance.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderMaintenance(body);
};

async function renderMaintenance(body) {
  body.replaceChildren(skeleton(5));
  const d = (await read("/api/maintenance")).data;
  const out = frag();

  out.append(el("div", "banner", t("maintenance.banner")));

  // ADVANCED is a section, not a disclaimer (v0.44.0). Everything above targets
  // THIS project; everything in the box below reaches outside it. The global
  // update lives there because a stale global install is a failure this panel
  // already reports and, until now, could only tell you to fix in a terminal.
  const advanced = card(t("maintenance.advanced"));
  advanced.id = "maintenance-advanced";
  advanced.append(el("div", "note", t("maintenance.advancedNote")));
  let anyAdvanced = false;

  for (const a of d.actions) {
    const row = el("div", "action");
    row.dataset.action = a.id; // the upgrade spotlight anchors on this
    const left = el("div");
    // Action id, label and command are the server's catalog — the label
    // describes an exact CLI invocation, so it is shown as written.
    left.append(el("div", "setting-name", a.id));
    left.append(el("div", "setting-desc", a.label));
    left.append(el("div", "action-cmd", a.command));
    if (a.network) left.append(el("div", "note", t("maintenance.network")));

    // `upgrade` is the one action whose whole point is a comparison, so it says
    // what it would actually do BEFORE you preview it — and offers to check
    // again, because "up to date" is only as old as the last check.
    if (a.id === "upgrade") {
      const status = el("div", "action-status");
      status.append(el("span", "note", t("maintenance.checking")));
      left.append(status);
      const paint = (v) => {
        const s = versionState(v);
        status.replaceChildren();
        status.append(chip(s.label, s.kind), el("span", "note", s.note));
        const again = el("button", "btn btn-ghost btn-sm btn-allow-busy", t("maintenance.checkAgain"));
        again.type = "button";
        again.addEventListener("click", () => {
          status.replaceChildren(el("span", "note", t("common.checking")));
          refreshVersion().then(paint).catch(() => status.replaceChildren(el("span", "note", t("maintenance.checkFailed"))));
        });
        status.append(again);
      };
      versionInfo().then(paint).catch(() => status.replaceChildren(el("span", "note", t("maintenance.couldNotCheck"))));
    }

    // v2.1.0 W7 — the clear-logs row says WHICH age it deletes at and when the
    // automatic sweep last ran. Every number is the CLI's (`clear logs --summary`).
    if (a.id === "clear-logs" && a.status) left.append(clearLogsStatus(a.status));

    if (a.advanced) left.append(el("div", "note", t("maintenance.globalNote")));

    const btn = el("button", "btn btn-sm", t("maintenance.preview"));
    btn.type = "button";
    btn.addEventListener("click", () => previewAction(a.id, body));
    row.append(left, btn);
    if (a.advanced) {
      anyAdvanced = true;
      advanced.append(row);
    } else {
      out.append(row);
    }
  }

  if (anyAdvanced) out.append(advanced);

  const job = card(t("maintenance.lastRun"));
  job.id = "job-card";
  out.append(job);
  body.replaceChildren(out);
  refreshJob();
}

// "Older than 90 days (Settings ▸ log retention). Last automatic sweep: …" —
// the day value links to the Settings row that sets it.
function clearLogsStatus(s) {
  const box = el("div", "note");
  const [pre, post] = t("maintenance.clearLogs.olderThan", { days: "\u0000" }).split("\u0000");
  const link = el("a", null, t("maintenance.clearLogs.days", { n: s.older_than_days }));
  link.href = "#/settings?key=log_retention_days";
  box.append(document.createTextNode(pre || ""), link, document.createTextNode(post || ""));
  box.append(document.createTextNode(" "));
  box.append(
    document.createTextNode(
      s.last_sweep
        ? t("maintenance.clearLogs.lastSweep", { date: s.last_sweep.date, files: s.last_sweep.files })
        : s.auto === "on"
          ? t("maintenance.clearLogs.noSweepYet")
          : t("maintenance.clearLogs.autoOff")
    )
  );
  if (s.pruned_runs) box.append(document.createTextNode(" " + t("maintenance.clearLogs.pruned", { n: s.pruned_runs })));
  return box;
}

// The third preview shape (v2.1.0 W7): `orc clear logs --json`. A table of
// what it would delete, the kept list with its reasons (collapsed), the totals
// and the old default folder. Rendered as the CLI wrote it.
function clearLogsPreview(b, pv) {
  b.append(
    kvList([
      [t("maintenance.clearLogs.cutoff"), `${pv.cutoff} (${t("maintenance.clearLogs.days", { n: pv.effective_days })})`],
      ["log_dir", pv.log_dir],
      ["run_dir", pv.run_dir],
      [t("maintenance.clearLogs.totals"), t("maintenance.clearLogs.totalsValue", { units: (pv.totals || {}).units || 0, files: (pv.totals || {}).files || 0, bytes: (pv.totals || {}).bytes || 0 })],
    ])
  );
  // The CLI's own sentences (cutoff moved, the old default folder) — shown as written.
  for (const n of pv.notes || []) b.append(el("div", "note", n));
  const del = pv.delete || [];
  if (!del.length) b.append(el("div", "note", t("maintenance.clearLogs.none")));
  else {
    b.append(el("div", "note", t("maintenance.wouldDelete", { n: (pv.totals || {}).files || 0 })));
    const tbl = el("table", "md-table");
    const hr = el("tr");
    for (const h of [t("maintenance.clearLogs.colPath"), t("maintenance.clearLogs.colKind"), t("maintenance.clearLogs.colLast"), t("maintenance.clearLogs.colBytes")]) hr.append(el("th", null, h));
    tbl.append(hr);
    for (const d of del) {
      const tr = el("tr");
      const p = el("td");
      // EVERY file is named — a unit is several files, and a count is not consent.
      const fl = el("div", "file-list");
      for (const f of d.files || [d.path]) fl.append(el("div", null, f));
      if (d.ref) fl.append(el("div", null, "git ref " + d.ref));
      p.append(fl);
      tr.append(p, el("td", null, d.kind), el("td", null, d.last_activity), el("td", null, String(d.bytes)));
      tbl.append(tr);
    }
    b.append(tbl);
  }
  const keep = pv.keep || [];
  if (keep.length) {
    const det = el("details");
    det.append(el("summary", null, t("maintenance.clearLogs.kept", { n: keep.length })));
    const fl = el("div", "file-list");
    for (const k of keep) fl.append(el("div", null, `${k.path} — ${k.reason}`));
    det.append(fl);
    b.append(det);
  }
  if (pv.default_dir)
    b.append(
      el(
        "div",
        "note",
        t(pv.default_dir.included ? "maintenance.clearLogs.defaultIncluded" : "maintenance.clearLogs.defaultDir", {
          path: pv.default_dir.path,
          files: pv.default_dir.files,
          bytes: pv.default_dir.bytes,
        })
      )
    );
}

async function previewAction(action, body) {
  const d = (await read("/api/maintenance/preview?action=" + encodeURIComponent(action))).data;
  const b = el("div");

  b.append(el("div", null, d.label));
  b.append(el("div", "action-cmd", d.command));
  b.append(el("div", "note", t("maintenance.previewFrom", { command: d.preview_command })));

  // Said BEFORE the apply, not discovered after it. A panel that reloads itself
  // with no warning reads as a crash, and the whole point of this note is that
  // the reload is the thing the user wanted.
  if (d.restarts_ui) b.append(el("div", "note", t("maintenance.willRestart")));

  // The one action that writes outside this project says so before it runs, and
  // the preview it is showing came from the SAME target — `orc doctor --global`,
  // not the project doctor.
  if (d.advanced) {
    const g = el("div", "banner");
    g.append(el("div", null, t("maintenance.globalWarn")));
    b.append(g);
  }

  // Guard 1 — a run is mid-flight. Updating changes the skills that run will
  // resume into. The CLI has no idea you are mid-run; this panel does.
  let ackWaiting = !d.waiting_runs.length;
  if (d.waiting_runs.length) {
    const warn = el("div", "banner banner-bad");
    const inner = el("div");
    inner.append(el("strong", null, t("maintenance.waitingRuns", { n: d.waiting_runs.length })));
    inner.append(
      el(
        "div",
        null,
        action === "clear-logs"
          ? t("maintenance.clearLogs.waitingBody", { slugs: d.waiting_runs.join(", ") })
          : t("maintenance.waitingBody", { slugs: d.waiting_runs.join(", ") })
      )
    );
    const lbl = el("label", "note");
    const cb = el("input");
    cb.type = "checkbox";
    cb.addEventListener("change", () => {
      ackWaiting = cb.checked;
      syncApply();
    });
    lbl.append(cb, document.createTextNode(" " + t("maintenance.waitingAck")));
    inner.append(lbl);
    warn.append(inner);
    b.append(warn);
  }

  // Guard 2 — a dirty working tree before an upgrade is worth a warning
  // BEFORE, not a surprise after.
  if (d.dirty_tree) {
    const warn = el("div", "banner");
    warn.append(el("div", null, t("maintenance.dirtyTree")));
    b.append(warn);
  }

  const pv = d.preview || {};
  if (action === "clear-logs") {
    clearLogsPreview(b, pv);
  } else if (action === "upgrade") {
    b.append(
      kvList([
        [t("maintenance.installed"), pv.version],
        [t("maintenance.available"), pv.latest || t("maintenance.availableUnknown")],
        [t("maintenance.source"), pv.install_spec],
        // The install URL and the URL the version number was read from are two
        // different things. Showing only the first is how "up to date" becomes
        // unfalsifiable from this panel.
        [t("maintenance.checkedAt"), pv.checked_ref || pv.checked_source || t("maintenance.availableUnknown")],
        [t("maintenance.updateAvailable"), pv.update_available ? t("maintenance.yes") : t("maintenance.no")],
      ])
    );
    b.append(el("div", "note", t("maintenance.upgradeNote")));
  } else {
    const findings = pv.findings || [];
    b.append(
      kvList([
        [t("maintenance.installedPayload"), pv.installed_version],
        [t("maintenance.thisCli"), pv.package_version],
        [t("maintenance.findings"), String(findings.length)],
      ])
    );
    if (!findings.length) b.append(el("div", "note", t("maintenance.healthy")));
    for (const f of findings) {
      const line = el("div", "note");
      line.append(
        chip(f.fixable ? t("overview.doctor.fixable") : t("overview.doctor.manual"), f.fixable ? "info" : "warn"),
        document.createTextNode(" " + f.message)
      );
      b.append(line);
    }
    // A count is NOT consent for a deletion — name every file.
    if (d.names_files) {
      const paths = findings.filter((f) => f.id === "orphan" || f.id === "orphan-candidates").flatMap((f) => f.paths || []);
      const c = el("div");
      c.append(el("div", "note", paths.length ? t("maintenance.wouldDelete", { n: paths.length }) : t("maintenance.wouldDeleteNone")));
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

  const actions = [{ label: t("common.cancel"), onClick: (c) => c() }];
  if (action === "upgrade")
    actions.push({
      label: t("maintenance.checkOnly"),
      onClick: () => toast(t("maintenance.checkOnlyDone"), "ok"),
    });
  actions.push({
    label:
      action === "prune"
        ? t("maintenance.applyPrune")
        : action === "upgrade"
          ? t("maintenance.applyUpgrade")
          : action === "clear-logs"
            ? t("maintenance.clearLogs.apply")
            : t("maintenance.apply"),
    cls: action === "prune" || action === "upgrade" || d.danger ? "btn-danger" : "btn-primary",
    id: "apply-btn",
    disabled: !ackWaiting,
    onClick: async (close) => {
      try {
        await post("/api/maintenance/apply", { action });
        close();
        toast(t("maintenance.started", { command: d.command }), "ok");
        setBusy(true);
        refreshJob();
      } catch (e) {
        toast(t("maintenance.startFail"), "bad", String(e.message));
      }
    },
  });

  modal({ title: t("maintenance.previewTitle", { command: d.command }), body: b, actions });
  applyBtn = document.getElementById("apply-btn");
  syncApply();
}

/* ============================================== PROMISES · BOUNDARY · SELF-SERVE
   (v0.46.0)

   THE LINE, restated because these three panels sit right on it: a FREE action
   gets a button, a PAID action gets a copy-able command. `orc pact check` runs
   the ledger's own cheap proofs and `orc handoff set` edits one graded surface —
   both deterministic, both a button. `/orc-pact`'s reconcile conversation and
   `/orc-boundary`'s evidence pass cost model tokens, so they are commands with
   the reason printed next to them.

   And the second rule, which these panels are the first real test of: the CLI's
   state words are the ONLY state words. HOLDING/DRIFTED/UNCHECKABLE/BROKEN and
   EXECUTE/ESCALATE/REFUSE are rendered verbatim, never softened into a friendlier
   synonym — a second vocabulary is drift no lint can see. test/webui.test.js
   greps this file for the literals that must come from the CLI instead. */
