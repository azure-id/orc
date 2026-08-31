"use strict";
/* panels/wait.js — orc ui client
   The usage window, and the wait that answers it.

   THE PANEL DERIVES NOTHING. Not the state word, not which window is worst,
   not the threshold, not a lane's checkpoint kind, not whether a wait is
   running. It draws `orc usage check --json` and `orc wait … --json`. (The
   Flow-stepper rule: a second idea of the mechanic is exactly the drift this
   panel exists to make impossible.)

   AND IT CANNOT START A WAIT. A wait lives in a Claude Code session, and
   `orc ui` never runs a lane. What it can do is show the reading, show a wait
   that is running, cancel one, and lift a block. Everything that COSTS a
   decision — starting a wait, blocking a gate — is a copy-able command.

   Loaded by app.html in the order its numeric prefix names. Classic script,
   no import/export: an ES module import carries no query string, and every
   static request here needs the per-launch session token. */

/* ------------------------------------------------------------------- WAIT */

// The CLI's own state words, and only those. A friendlier synonym would be a
// state that does not exist.
const USAGE_KIND = { ok: "ok", low: "warn", unknown: null };

PANELS.wait = function (host) {
  head(host, t("wait.title"), t("wait.sub"));

  section(
    host,
    () =>
      Promise.all([
        read("/api/usage").then((r) => r.data),
        read("/api/wait/status").then((r) => r.data),
        read("/api/wait/lanes").then((r) => r.data),
      ]),
    ([usage, status, lanes]) => {
      const out = frag();
      out.append(usageCard(usage));
      out.append(runCard(status));
      out.append(lanesCard(lanes));
      out.append(settingsCard(usage));
      return out;
    }
  );
};

// ── the reading ────────────────────────────────────────────────────────────
function usageCard(u) {
  const c = card(t("wait.window"));
  if (!u) return c;

  // UNKNOWN IS A STATE, NOT A GAP. It gets the same card, the same size and a
  // sentence saying a run is never stopped on it — because the alternative is a
  // user believing the gate is watching when Claude Code sends no headers.
  if (u.state === "unknown") {
    const row = el("div", "row-actions");
    row.append(chip(u.state, null));
    c.append(row);
    c.append(el("div", "note", u.reason || ""));
    c.append(el("div", "note", u.note || ""));
    c.append(gateNote(u));
    return c;
  }

  const row = el("div", "row-actions");
  row.append(chip(u.state, USAGE_KIND[u.state]));
  if (u.worst) row.append(chip(t("wait.worst", { w: u.worst }), u.state === "low" ? "warn" : null));
  if (typeof u.reading_age_minutes === "number")
    row.append(chip(tn(u.reading_age_minutes, "wait.age"), null));
  c.append(row);

  const rows = [];
  for (const w of [u.five_hour, u.seven_day]) {
    if (!w) continue;
    rows.push([
      w.window,
      // The bar is a WIDTH INSIDE the row, so nothing can fight it for space.
      barFor(w),
    ]);
  }
  const grid = el("div", "wait-windows");
  for (const [label, node] of rows) {
    const r = el("div", "wait-win");
    r.append(el("span", "mono wait-win-label", label));
    r.append(node);
    grid.append(r);
  }
  c.append(grid);

  // A context figure the CLI could not compute is an em dash, never a guess.
  const ctx = el("div", "note");
  ctx.textContent =
    typeof u.context === "number"
      ? t("wait.context", { n: String(u.context) })
      : t("wait.contextUnknown");
  c.append(ctx);
  if (typeof u.context === "number" && u.context >= 70)
    c.append(el("div", "note warn", t("wait.contextLarge")));

  c.append(el("div", "note", u.note || ""));
  c.append(gateNote(u));
  return c;
}

function barFor(w) {
  const wrap = el("div", "wait-bar-wrap");
  const bar = el("div", "wait-bar" + (w.low ? " low" : ""));
  const fill = el("div", "wait-bar-fill");
  fill.style.width = Math.max(0, Math.min(100, w.used_percentage)) + "%";
  bar.append(fill);
  wrap.append(bar);
  const txt = el("span", "wait-bar-text");
  txt.textContent =
    w.used_percentage +
    "% · " +
    t("wait.left", { n: String(w.remaining_percentage) }) +
    (w.resets_in_minutes != null ? " · " + t("wait.resets", { t: mins(w.resets_in_minutes) }) : "");
  wrap.append(txt);
  return wrap;
}

const mins = (n) => (n < 60 ? n + "m" : Math.floor(n / 60) + "h" + (n % 60 ? (n % 60) + "m" : ""));

function gateNote(u) {
  const n = el("div", "note");
  n.textContent =
    u.gate === "off"
      ? t("wait.gateOff")
      : t("wait.gateOn", { gate: u.gate, pct: String(u.stop_pct) });
  return n;
}

// ── the run: a wait running, a block standing, or neither ──────────────────
function runCard(s) {
  const c = card(t("wait.run"));
  if (!s || !s.run) {
    // KEEPS ITS SLOT. "No run in flight" is an answer.
    c.append(empty(t("wait.noRun"), t("wait.noRunHint")));
    c.append(laneCommand("/orc-wait 30", t("wait.startWhy")));
    return c;
  }

  const row = el("div", "row-actions");
  row.append(el("span", "mono", s.run));
  if (s.waiting) row.append(chip(t("wait.waiting"), "warn", true));
  if (s.blocked) row.append(chip(t("wait.blocked"), "bad"));
  if (!s.waiting && !s.blocked) row.append(chip(t("wait.idle"), null));
  c.append(row);

  if (s.waiting) {
    c.append(
      el(
        "div",
        "note",
        t("wait.hops", {
          mode: s.mode || "?",
          done: String(s.hops_done || 0),
          planned: String(s.hops_planned || "?"),
          ends: s.ends_at ? new Date(s.ends_at).toLocaleTimeString() : "?",
        })
      )
    );
    c.append(el("div", "note", t("wait.zeroTokens")));
    if (s.cancel_requested) c.append(el("div", "note warn", t("wait.cancelPending")));
    // FREE action → a real button.
    else c.append(actionRow("wait.cancel", "/api/wait/cancel", { slug: s.run }, t("wait.cancelWhy")));
  }

  if (s.blocked) {
    const b = el("div", "wait-block");
    b.append(el("div", "wait-block-head", t("wait.blockHead")));
    // The reason VERBATIM. It is the record that makes the risk the user's.
    b.append(el("div", "wait-block-reason", s.block_reason || ""));
    // The AGE is what keeps an old block from applying invisibly — there is no
    // auto-expiry, so the panel must always show how old it is.
    if (typeof s.block_age_minutes === "number")
      b.append(el("div", "note", tn(s.block_age_minutes, "wait.blockAge")));
    b.append(el("div", "note", t("wait.blockRisk")));
    b.append(actionRow("wait.unblock", "/api/wait/unblock", { slug: s.run }, t("wait.unblockWhy")));
    c.append(b);
  } else {
    // A block CANNOT be created here: it needs a reason typed in the moment.
    c.append(laneCommand("/orc-wait block <reason>", t("wait.blockWhy")));
  }
  return c;
}

// NOTE the parameter name: `route` is the ROUTER's function, and shadowing it
// here made the post-action refresh call a string.
function actionRow(labelKey, endpoint, body, why) {
  const wrap = el("div", null);
  const row = el("div", "row-actions");
  const b = el("button", "btn btn-sm", t(labelKey));
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      const r = await post(endpoint, body);
      toast(r && r.ok ? t("wait.done") : t("wait.failed"), r && r.ok ? "ok" : "bad");
      route();
    } catch (e) {
      toast(t("wait.failed"), "bad", String(e));
      b.disabled = false;
    }
  });
  row.append(b);
  wrap.append(row);
  if (why) wrap.append(el("div", "note", why));
  return wrap;
}

// ── which lanes support a wait ─────────────────────────────────────────────
function lanesCard(d) {
  const c = card(t("wait.lanes"));
  if (!d || !d.lanes) return c;
  c.append(el("div", "note", t("wait.lanesWhy")));
  const list = el("div", "wait-lanes");
  for (const l of d.lanes) {
    const r = el("div", "wait-lane");
    r.append(el("span", "mono wait-lane-name", l.lane));
    // `none` KEEPS ITS SLOT and reads as its own state, never as a blank.
    r.append(chip(l.checkpoint, l.modes_differ ? "ok" : null));
    r.append(el("span", "wait-lane-safe", l.safe_point));
    r.append(el("div", "note wait-lane-detail", l.detail));
    list.append(r);
  }
  c.append(list);
  c.append(el("div", "note", d.note || ""));
  return c;
}

// ── settings: read-only here, edited where every other key is edited ───────
function settingsCard(u) {
  const c = card(t("wait.settings"));
  c.append(
    kvList([
      ["usage_gate", u && u.gate ? u.gate : "—"],
      ["usage_stop_pct", u && u.stop_pct != null ? String(u.stop_pct) : "—"],
    ])
  );
  // A SECOND editor for keys Settings already stages would be a second idea of
  // the same thing — the drift this panel exists to prevent. Route to the panel
  // that can change it instead (the FINDING_ROUTE rule).
  c.append(el("div", "note", t("wait.settingsWhy")));
  const b = el("button", "btn btn-ghost btn-sm", t("wait.openSettings"));
  b.type = "button";
  b.addEventListener("click", () => (location.hash = "#/settings"));
  const row = el("div", "row-actions");
  row.append(b);
  c.append(row);
  return c;
}
