"use strict";
/* 06-edit.js — orc ui client
   editSet, editBar, applyEdits — the staged-write machinery Settings AND Flow
   both use. Nothing is written until Apply; the CLI is still the only writer and
   the only validator.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


/* ============================================================ staged edits == */
//
// WRITES ARE BATCHED (v0.44.1). Every control used to commit on the spot: one
// click, one `orc config set`, one full re-render of the panel. Changing four
// keys meant four subprocesses and four re-renders, and each one scrolled the
// list out from under you — so a routine "set these five things" was a fight.
//
// Nothing is written until Apply now. Edits accumulate here, the affected rows
// mark themselves, and an edit bar at the bottom says how many are pending.
// The CLI is still the only writer and still the only validator; what changed
// is WHEN it is called, never by whom.
//
// An entry is `{kind: "set", value}` or `{kind: "reset"}` — a per-key reset is
// `orc config reset <key>` (it REMOVES the key from the file), which is not the
// same write as setting it to its default value, so it cannot be flattened into
// one.
function editSet(onChange) {
  const map = new Map();
  const api = {
    map,
    get size() {
      return map.size;
    },
    // Staging a value back to what it already was CLEARS the edit rather than
    // recording a no-op — otherwise "cancel" and "set it back by hand" would
    // leave the bar claiming an unsaved change that would write nothing.
    set(key, value, original) {
      if (String(value) === String(original)) map.delete(key);
      else map.set(key, { kind: "set", value: String(value), original: String(original) });
      onChange(api);
    },
    reset(key) {
      map.set(key, { kind: "reset" });
      onChange(api);
    },
    // An ACTION entry (v0.49.2): a route and a body, staged like any other
    // edit, applied by `applyActions`. `label` is what the pending list names —
    // a count is not a change list.
    action(key, route, body, label) {
      map.set(key, { kind: "action", route, body, value: label });
      onChange(api);
    },
    drop(key) {
      map.delete(key);
      onChange(api);
    },
    clear() {
      map.clear();
      onChange(api);
    },
    entries() {
      return [...map.entries()];
    },
  };
  return api;
}

// The bar. Apply is disabled with nothing pending; Reset is always offered
// (it is a write in its own right, not an undo); **Cancel appears only when
// there is something to cancel** — a permanently visible Cancel next to a
// disabled Apply reads as though the panel is broken.
function editBar(edits, { onApply, onReset, onCancel, resetLabel }) {
  const bar = el("div", "edit-bar");
  const summary = el("div", "edit-summary");
  const actions = el("div", "edit-actions");

  const apply = el("button", "btn btn-sm btn-primary", t("edits.apply"));
  apply.type = "button";
  apply.addEventListener("click", () => onApply(apply));

  const reset = el("button", "btn btn-sm btn-ghost", resetLabel || t("edits.reset"));
  reset.type = "button";
  reset.addEventListener("click", onReset);

  const cancel = el("button", "btn btn-sm btn-ghost", t("edits.cancel"));
  cancel.type = "button";
  cancel.addEventListener("click", onCancel);

  bar.paint = () => {
    const n = edits.size;
    bar.classList.toggle("edit-bar-dirty", n > 0);
    apply.disabled = n === 0;
    apply.textContent = n ? t("edits.applyN", { n }) : t("edits.apply");
    // The pending list is named, never counted: "3 changes" is not consent for
    // three writes you can no longer see.
    summary.replaceChildren();
    if (!n) {
      summary.append(el("span", "note", t("edits.none")));
    } else {
      summary.append(el("span", "note", t("edits.pending")));
      const list = el("div", "edit-list");
      for (const [key, e] of edits.entries()) {
        const item = el("span", "edit-chip");
        // Key names and values are CLI data — never translated.
        item.append(el("span", "edit-key", key));
        item.append(document.createTextNode(e.kind === "reset" ? " → " + t("edits.toDefault") : " → " + e.value));
        list.append(item);
      }
      summary.append(list);
    }
    actions.replaceChildren();
    actions.append(apply, reset);
    if (n) actions.append(cancel);
  };

  bar.append(summary, actions);
  bar.paint();
  return bar;
}

// Apply runs the staged writes ONE AT A TIME, in the order they were staged —
// the same sequence a terminal user would type, which matters because settings
// can shadow each other. A failure does not abort the rest: the remaining
// writes are independent, and stopping halfway would leave a state nobody
// chose. Every failure is reported by key.
async function applyEdits(edits, routes, button) {
  const list = edits.entries();
  if (!list.length) return { ok: true, failed: [] };
  const label = button && button.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = t("edits.applying");
  }
  const failed = [];
  for (const [key, e] of list) {
    try {
      const r = e.kind === "reset" ? await post(routes.reset, { key }) : await post(routes.set, { key, value: e.value });
      if (!r.ok) failed.push(`${key}: ${(r.output || r.command || "").trim().split("\n")[0]}`);
    } catch (err) {
      failed.push(`${key}: ${err.message}`);
    }
  }
  if (button) {
    button.disabled = false;
    if (label) button.textContent = label;
  }
  if (failed.length) toast(t("edits.someFailed", { n: failed.length }), "bad", failed.join("\n"));
  else toast(t("edits.applied", { n: list.length }), "ok");
  return { ok: !failed.length, failed };
}

// The same batching, for a panel whose edits are not key/value pairs (v0.49.2).
// The house-rule ledger stages ADDs, REMOVEs, TOGGLEs and MOVEs — four routes,
// four body shapes — so the entry carries its own `route` and `body` and this
// runs them one at a time in staged order. Every other rule of `applyEdits`
// holds exactly: a refused write NEVER aborts the rest, and every failure is
// reported by the key it was staged under.
async function applyActions(edits, button) {
  const list = edits.entries();
  if (!list.length) return { ok: true, failed: [] };
  const label = button && button.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = t("edits.applying");
  }
  const failed = [];
  for (const [key, e] of list) {
    try {
      const r = await post(e.route, e.body);
      if (!r.ok) failed.push(`${key}: ${(r.output || r.command || "").trim().split("\n")[0]}`);
    } catch (err) {
      failed.push(`${key}: ${err.message}`);
    }
  }
  if (button) {
    button.disabled = false;
    if (label) button.textContent = label;
  }
  if (failed.length) toast(t("edits.someFailed", { n: failed.length }), "bad", failed.join("\n"));
  else toast(t("edits.applied", { n: list.length }), "ok");
  return { ok: !failed.length, failed };
}
