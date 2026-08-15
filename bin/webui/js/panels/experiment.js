"use strict";
/* panels/experiment.js — orc ui client
   The one place the panel touches AI at all, and it does so by getting out of
   the way: it opens a terminal and forgets about it.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


/* ============================================================== EXPERIMENT == */

// The one place this panel touches AI at all — and it does so by getting out of
// the way. It opens a terminal with `claude` in this repo and forgets about it.
// No lane output ever comes back here; there is nothing to stream, cancel or
// watch. If the launch fails, the command is on screen to copy, which is the
// same thing the panel is for on a machine where it works.
PANELS.experiment = function (host) {
  head(host, t("experiment.title"), t("experiment.sub"));
  section(
    host,
    () => read("/api/experiment").then((r) => r.data),
    (d) => {
      const out = frag();

      const launch = card(t("experiment.start"));
      launch.append(el("div", "note", t("experiment.startNote")));
      launch.append(kvList([[t("experiment.project"), d.project_root]], true));

      const row = el("div", "row-actions");
      const go = el("button", "btn btn-primary", t("experiment.launch"));
      go.type = "button";
      if (!d.can_launch) {
        go.disabled = true;
        go.title = t("experiment.fixtureTitle");
      }
      go.addEventListener("click", async () => {
        go.disabled = true;
        go.textContent = t("experiment.opening");
        try {
          const r = await post("/api/experiment/launch", {});
          toast(r.ok ? t("experiment.opened", { cwd: r.cwd }) : t("experiment.openFail"), r.ok ? "ok" : "bad");
        } catch (e) {
          toast(t("experiment.openFail"), "bad", String(e.message) + "\n" + t("experiment.openFailHint", { root: d.project_root }));
        }
        go.disabled = false;
        go.textContent = t("experiment.launch");
      });
      row.append(go);
      if (!d.can_launch) row.append(el("span", "note", t("experiment.fixtureNote")));
      launch.append(row);
      out.append(launch);

      // EXPANDED by default (v0.43.6). It shipped collapsed to keep the launch
      // button above the fold, and that cost more than it saved: the lanes are
      // the reason to look at this panel at all, and a collapsed section has
      // ZERO height — so the first-run tour, which points at `.lane-list`, was
      // drawing a spotlight ring around nothing. A section the tour teaches
      // must be a section the tour can see.
      const list = el("div", "lane-list");
      for (const l of d.lanes) {
        const item = el("div", "lane");
        const left = el("div");
        // Lane command and blurb are the server's catalog — untranslated.
        left.append(el("div", "lane-cmd", l.cmd));
        left.append(el("div", "setting-desc", l.what));
        const cp = el("button", "btn btn-sm", t("common.copy"));
        cp.type = "button";
        cp.addEventListener("click", () => copy(l.cmd, l.cmd));
        item.append(left, cp);
        list.append(item);
      }
      out.append(
        collapsible({
          title: t("experiment.lanes"),
          count: t("experiment.lanesCount", { n: d.lanes.length }),
          desc: t("experiment.lanesDesc"),
          content: list,
          collapsed: false,
        })
      );

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
