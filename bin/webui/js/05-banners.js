"use strict";
/* 05-banners.js — orc ui client
   The shared version promise, the update banner, the changelog modal, and
   renderBanners — including the global-install warning that must be visible on
   EVERY panel (config does not merge, so a global install can win skill
   resolution while this panel edits a project file nothing reads).

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

/* --------------------------------------------------------------- version -- */
// `orc version --json` performs a REAL bounded network check against the
// install source and reports {version, latest, update_available}. Three places
// want that answer — the Overview tile, the rail badge and the Maintenance
// upgrade row — so the promise is shared: one check per page load, not three.
// `refresh()` is the only way to force a second one, and it is a button the
// user presses; nothing here polls for a new release on its own.
let versionPromise = null;
const versionInfo = () => (versionPromise = versionPromise || read("/api/version").then((r) => r.data));
function refreshVersion() {
  versionPromise = null;
  return versionInfo();
}

// The one place that decides what a version payload MEANS, so the tile, the rail
// and the upgrade row can never disagree about it. `latest: null` is not "up to
// date" — it is "we could not tell", which is a different thing to show.
function versionState(v) {
  if (!v) return { kind: "", label: t("version.unknown.label"), note: t("version.unknown.note") };
  if (v.check_disabled) return { kind: "", label: t("version.off.label"), note: t("version.off.note") };
  if (!v.latest) return { kind: "warn", label: t("version.offline.label"), note: t("version.offline.note") };
  if (v.update_available)
    return {
      kind: "warn",
      label: t("version.available.label", { latest: v.latest }),
      note: t("version.available.note", { version: v.version }),
    };
  return {
    kind: "ok",
    label: t("version.current.label"),
    // `install_spec` is CLI data (a package spec), so it is interpolated, never
    // translated — only the sentence around it is ours.
    note: t("version.current.note", { version: v.version, source: v.install_spec || "the install source" }),
  };
}

/* ---------------------------------------------------------------- banners -- */

// The ONE thing that must be visible on every panel: config does NOT merge, so
// a global install can win skill resolution while this panel edits a project
// file nothing reads. Reported here, never fixed here — this UI never edits
// global config, by design.
// The update banner. It is a BUTTON, not a notice: the useful question is
// "what changed", and the answer is one click away rather than on GitHub.
async function renderUpdateBanner(host) {
  let v;
  try {
    v = await versionInfo();
  } catch (_) {
    return;
  }
  if (!v || !v.update_available) return;

  const b = el("button", "banner banner-update");
  b.type = "button";
  const inner = el("div");
  inner.append(el("strong", null, t("banner.update.title", { latest: v.latest, version: v.version })));
  inner.append(el("div", "note", t("banner.update.note")));
  b.append(el("span", "banner-badge", "NEW"), inner, el("span", "banner-more", t("banner.update.cta")));
  b.addEventListener("click", () => showChangelog(v));
  host.append(b);
}

// Fetched lazily — the modal is what needs the changelog, and paying for that
// request on every page load to fill a box nobody opened is waste.
async function showChangelog(v) {
  const body = el("div", "stack stack-sm");
  const slot = el("div", "stack stack-sm");
  slot.append(skeleton(4));
  body.append(slot);

  const close = modal({
    title: t("changelog.title", { version: v.latest }),
    body,
    actions: [
      { label: t("common.later"), onClick: (c) => c() },
      {
        label: t("changelog.goUpgrade"),
        cls: "btn-primary",
        onClick: (c) => {
          c();
          location.hash = "#/maintenance";
          // The spotlight is armed here and lands after the panel renders — a
          // highlight fired now would point at a node that does not exist yet.
          startUpgradeSpotlight();
        },
      },
    ],
  });

  try {
    const d = (await read("/api/changelog")).data;
    slot.replaceChildren();
    if (d.check_disabled) {
      slot.append(el("div", "note", t("changelog.disabled")));
    } else if (!d.fetched) {
      slot.append(el("div", "note", t("changelog.offline")));
      slot.append(el("div", "note", t("changelog.offlineNote")));
    } else if (!d.entries.length) {
      slot.append(el("div", "note", t("changelog.empty")));
    } else {
      for (const e of d.entries) {
        const sec = el("div", "cl-entry");
        const h = el("div", "cl-head");
        h.append(el("span", "cl-version", "v" + e.version));
        if (e.date) h.append(el("span", "cl-date", e.date));
        sec.append(h);
        if (e.title) sec.append(el("div", "cl-title", stripMd(e.title)));
        if (e.body) sec.append(el("div", "cl-body", reflowMd(stripMd(e.body))));
        slot.append(sec);
      }
      slot.append(el("div", "note", t("changelog.source", { src: d.source })));
    }
  } catch (e) {
    slot.replaceChildren(el("div", "note", t("changelog.loadFail", { err: e.message })));
  }
  return close;
}

async function renderBanners() {
  const host = $("#banners");
  host.replaceChildren();
  renderUpdateBanner(host);
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
    // Prose inside the banner flex row, not a panel container: its lines are
    // meant to read tight, so it is deliberately not a `stack`.
    const bannerBody = el("div");
    bannerBody.append(el("strong", null, t("banner.global.title")));
    bannerBody.append(el("div", null, t("banner.global.body")));
    // The finding's own text is the CLI speaking. It is shown verbatim in every
    // language — a doctor message names files and commands.
    if (finding) bannerBody.append(el("div", "note", finding.message));
    // The command that actually clears the finding, copyable. This panel is
    // project-scoped and never writes global config, so handing over the exact
    // line to paste is the whole of what it can do — and a wrong line here is
    // why the warning felt permanent.
    const fixCmd = (doctor.findings || []).map((f) => f.fix_command).find(Boolean);
    if (fixCmd) {
      const row = el("div", "banner-fix");
      row.append(el("code", "action-cmd", fixCmd));
      const cp = el("button", "btn btn-ghost btn-sm", t("common.copy"));
      cp.type = "button";
      cp.addEventListener("click", () => copy(fixCmd, t("common.copied")));
      row.append(cp);
      bannerBody.append(row);
    }
    bannerBody.append(el("div", "note", t("banner.global.check")));
    b.append(bannerBody);
    host.append(b);
  }
}
