"use strict";
/* panels/handoff.js — orc ui client
   The lane for somebody who does not read code. A RED surface gets NO BUTTON AT
   ALL — not a disabled one.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

/* ----------------------------------------------------------------- SELF-SERVE
   This panel changes what `orc ui` IS: until now a config tool for a developer,
   now also a tool for somebody who does not read code, will never open a
   terminal, and may not read English first. It inherits EVERY Maintenance rule
   with no exceptions, and adds one of its own: a RED surface gets NO BUTTON AT
   ALL — not a disabled one. A disabled button invites a support question; a
   reason and a person to ask answers it. */

const GRADE_DOT = { green: "🟢", amber: "🟡", red: "🔴" };
const GRADE_KIND = { green: "ok", amber: "warn", red: "bad" };
// Same rule as COST_UNIT_KEY_OF: full keys, never `"handoff.grade." + g`.
const GRADE_LABEL_KEY = { green: "handoff.grade.green", amber: "handoff.grade.amber", red: "handoff.grade.red" };

PANELS.handoff = function (host) {
  head(host, t("handoff.title"), t("handoff.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderHandoff(body);
};

async function renderHandoff(body) {
  body.replaceChildren(skeleton(5));
  const res = await read("/api/handoff").catch(() => ({ data: null }));
  const d = res.data;
  const out = frag();

  if (!d || !d.surfaces || !d.surfaces.length) {
    const c = card(t("handoff.title"));
    c.append(empty(t("handoff.none"), t("handoff.noneHint")));
    c.append(laneCommand("/orc-handoff", t("handoff.cmdMapWhy")));
    out.append(c);
    body.replaceChildren(out);
    return;
  }

  const sum = card(t("handoff.summary"));
  const chips = el("div", "row-actions");
  for (const g of ["green", "amber", "red"])
    chips.append(chip(`${GRADE_DOT[g]} ${(d.counts || {})[g] || 0}`, GRADE_KIND[g]));
  sum.append(chips);
  sum.append(el("div", "note", t("handoff.gradeExplain")));
  if (!d.write_enabled) sum.append(el("div", "note warn", t("handoff.writesOff")));
  out.append(sum);

  for (const s of d.surfaces) {
    const c = card(null);
    const headRow = el("div", "row-actions");
    headRow.append(chip(`${GRADE_DOT[s.grade]} ${t(GRADE_LABEL_KEY[s.grade])}`, GRADE_KIND[s.grade]));
    headRow.append(el("span", "mono", s.file));
    if (!s.exists) headRow.append(chip(t("handoff.missing"), "bad"));
    c.append(headRow);
    c.append(el("div", "promise", s.what));

    if (s.grade === "red") {
      // NO BUTTON AT ALL. Not a disabled one.
      c.append(el("div", "note bad", t("handoff.redWhy", { why: s.reason || "" })));
      if (s.ask) c.append(el("div", "note", t("handoff.redAsk", { who: s.ask })));
    } else {
      c.append(
        kvList([
          [t("handoff.field.check"), s.check || t("handoff.field.checkManual")],
          [t("handoff.field.undo"), s.revert],
        ])
      );
      if (s.grade === "amber") c.append(el("div", "note warn", t("handoff.amberNote")));
      if (d.write_enabled && s.exists) {
        const act = el("div", "row-actions");
        const b = el("button", "btn btn-sm", t("handoff.change"));
        b.type = "button";
        b.addEventListener("click", () => editSurface(s, body));
        act.append(b);
        c.append(act);
      }
    }
    out.append(c);
  }
  out.append(laneCommand("/orc-handoff", t("handoff.cmdDoWhy")));
  body.replaceChildren(out);
}

// Preview then apply, the undo command BEFORE the write, one mutation at a time,
// the exact command always visible. Every one of these is a Maintenance rule this
// panel inherits rather than re-decides.
function editSurface(s, body) {
  const b = frag();
  b.append(el("p", null, t("handoff.editIntro", { file: s.file })));

  const keyIn = el("input", "input");
  keyIn.type = "text";
  keyIn.placeholder = t("handoff.keyPlaceholder");
  const valIn = el("input", "input");
  valIn.type = "text";
  valIn.placeholder = t("handoff.valuePlaceholder");
  const form = el("div", "form");
  form.append(el("label", null, t("handoff.keyLabel")), keyIn);
  form.append(el("label", null, t("handoff.valueLabel")), valIn);
  b.append(form);
  b.append(el("div", "note", t("handoff.noNewKeys")));

  // The undo command, BEFORE the write. This is the whole consent step.
  const undo = el("div", "undo-box");
  undo.append(el("div", "undo-head", t("handoff.undoFirst")));
  undo.append(el("pre", "cmd", s.revert));
  b.append(undo);

  const cmdBox = el("pre", "cmd", `orc handoff set ${s.id} <key> <value>`);
  b.append(el("div", "note", t("handoff.willRun")));
  b.append(cmdBox);
  const sync = () => {
    cmdBox.textContent = `orc handoff set ${s.id} ${keyIn.value || "<key>"} ${valIn.value || "<value>"}`;
  };
  keyIn.addEventListener("input", sync);
  valIn.addEventListener("input", sync);
  if (s.check) b.append(el("div", "note", t("handoff.thenCheck", { check: s.check })));

  modal({
    title: t("handoff.editTitle", { file: s.file }),
    body: b,
    actions: {
      [t("common.cancel")]: null,
      [t("handoff.applyChange")]: async () => {
        if (!keyIn.value || !valIn.value) return toast(t("handoff.needBoth"), "bad");
        const r = await post("/api/handoff/set", { id: s.id, key: keyIn.value, value: valIn.value });
        // AMBER applies, then shows the manual check as a TASK — never a pass.
        if (r.ok && s.grade === "amber") toast(t("handoff.amberApplied"), "warn", s.check || "");
        else toast(r.ok ? t("handoff.applied") : t("handoff.failed"), r.ok ? "ok" : "bad", r.output);
        renderHandoff(body);
      },
    },
  });
}

/* ================================================================ CHALLENGE = */
/*
   THE PANEL DERIVES NOTHING. Not the state word, not the iteration order, not
   the pass decision, not the convergence numbers, not the expected revision
   path. It draws `orc challenge … --json`. (The Flow-stepper rule: a second
   idea of the pipeline is exactly the drift this panel exists to make
   impossible.)

   THE FREE/PAID LINE, made visible rather than hidden: `lint`, `accept`,
   `rebut`, `report` and copying a prompt are deterministic and cost no model
   tokens, so each is a real BUTTON. Running an ITERATION costs model tokens, so
   it is a copy-able command and there is no route for it at all.
*/

const CH_STATE_KIND = {
  "AWAITING-JUDGE": "info",
  "AWAITING-FIX": "warn",
  "AWAITING-RECHECK": "info",
  PASSED: "ok",
  "STALE-PASS": "warn",
  "MISSING-REVISION": "warn",
  TAMPERED: "bad",
};
// The ONE actionable state gets the ONE attention-seeking animation, and
// nothing else does.
const CH_PULSE = "AWAITING-RECHECK";
const CH_SEV_KIND = { P0: "bad", P1: "warn", P2: "info", P3: "" };
const CH_DIM_KIND = { CHECKED: "ok", "NOT-CHECKED": "warn", "NOT-SELECTED": "" };
