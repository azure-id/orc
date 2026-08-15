"use strict";
/* panels/flow.js — orc ui client
   The compiled DIY pipeline. The stepper renders `orc diy show --json`'s steps[]
   and NOTHING else — never a phase list derived here.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

/* ==================================================================== FLOW == */

PANELS.flow = function (host) {
  head(host, t("flow.title"), t("flow.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderFlow(body);
};

async function renderFlow(body) {
  body.replaceChildren(skeleton(6));
  const d = (await read("/api/diy")).data;
  const out = frag();

  const compile = el("button", "btn btn-sm btn-primary", t("flow.compile"));
  compile.type = "button";
  compile.addEventListener("click", async () => {
    const r = await post("/api/diy/compile", {});
    toast(r.command, r.ok ? "ok" : "bad", r.output);
    renderFlow(body);
  });

  // The Overview's "worth doing" row for a STALE flow deep-links to this panel,
  // so the recompile button is the first thing on it. `#diy-gate` is the anchor.
  const gate = card(t("flow.gate"), d.configured ? compile : null);
  gate.id = "diy-gate";
  const chipRow = el("div", "row-actions");
  chipRow.append(chip(d.state, d.state === "READY" ? "ok" : d.state === "STALE" ? "warn" : ""));
  gate.append(chipRow);
  gate.append(el("div", "note", d.reason));
  for (const trigger of d.triggers || []) gate.append(el("div", "note", "• " + trigger));
  if (!d.configured) gate.append(el("div", "note", t("flow.bootstrap")));
  out.append(gate);

  // Directly below the gate, configured or not: the flow's SHAPE is the first
  // decision, and picking a shipped starting point is how the terminal composer
  // opens. It was the one DIY question the panel could not answer.
  out.append(presetCard(d, body));

  if (d.configured) {
    out.append(stepperCard(d));

    for (const e of d.errors || []) out.append(bannerLine(e, true));
    for (const w of d.warnings || []) out.append(bannerLine(w, false));

    const keys = card(t("flow.keys"));
    keys.id = "flow-keys";
    keys.append(el("div", "note", t("flow.keysNote")));

    // Batched, exactly like Settings (v0.44.1). Recompiling is already a second
    // step after a key change, so writing each key the instant you touch it
    // bought nothing and cost a full re-render per key.
    let bar = null;
    const edits = editSet(() => {
      if (bar) bar.paint();
      for (const row of keys.querySelectorAll(".setting[data-key]")) {
        row.classList.toggle("staged", edits.map.has(row.dataset.key));
      }
    });

    for (const k of d.keys) {
      const row = el("div", "setting");
      row.dataset.key = k.key; // the stepper jumps here when you click a phase
      const left = el("div");
      const name = el("div", "setting-name");
      name.append(document.createTextNode(k.key));
      if (k.is_set) name.append(el("span", "dot"));
      left.append(name, el("div", "setting-desc", k.desc || ""));
      const right = el("div", "setting-control");
      const current = String(k.value === "" ? "" : k.value);
      const stage = (value) => edits.set(k.key, String(value), current);

      // A flow key is a CLOSED SET, so it gets a dropdown carrying every legal
      // value — `orc diy set` would reject anything else anyway, and a text box
      // that only ever accepts a handful of words is a memory test with a
      // rejection at the end of it. The list is the CLI's `options`; the panel
      // holds no copy of what a key accepts.
      if (k.options && k.options.length) {
        const sel = el("select", "select-input");
        // A value outside its own option list still has to be SHOWN — an unset
        // fixed_executor is exactly that. It leads, and it is disabled, so the
        // dropdown reports the state without offering it back as a choice the
        // validator would refuse.
        if (!k.options.some((o) => String(o) === current)) {
          const ph = el("option", null, current === "" ? t("flow.unset") : current);
          ph.value = current;
          ph.disabled = true;
          sel.append(ph);
        }
        for (const opt of k.options) {
          const o = el("option", null, String(opt));
          o.value = String(opt);
          sel.append(o);
        }
        sel.value = current;
        sel.addEventListener("change", () => stage(sel.value));
        right.append(sel);
      } else {
        // Free text (flow_name is a slug) — validation is the CLI's exit code.
        const input = el("input", "text-input");
        input.value = current;
        input.addEventListener("input", () => stage(input.value));
        right.append(input);
      }
      row.append(left, right);
      keys.append(row);
    }

    // The bar is the LAST thing in the keys card, which is where the user asked
    // for it. Reset here is `orc diy init --force`: the CLI has no "put every
    // key back to its default" for a flow — `orc diy reset` DELETES the config
    // and unconfigures the lane, which is a different, larger thing.
    bar = editBar(edits, {
      resetLabel: t("edits.resetFlow"),
      onApply: async (btn) => {
        await applyEdits(edits, { set: "/api/diy/set" }, btn);
        renderFlow(body);
      },
      onReset: () => confirmPreset(d.presets.find((p) => !p.name) || { name: "", changes: {} }, d, body),
      onCancel: () => renderFlow(body),
    });
    keys.append(bar);
    out.append(keys);

    if (d.score_table) {
      const st = card(t("flow.table"));
      st.append(el("div", "note", t("flow.tableNote")));
      const sc = el("div", "scroll-x");
      sc.append(el("pre", "block", d.score_table));
      st.append(sc);
      out.append(st);
    }
    const paths = card(t("flow.files"));
    // config / compiled / lock are the artifact names in the DIY contract.
    paths.append(kvList([["config", d.paths.config], ["compiled", d.paths.compiled], ["lock", d.paths.lock]]));
    out.append(paths);
  }

  body.replaceChildren(out);
}

function bannerLine(text, bad) {
  const b = el("div", "banner" + (bad ? " banner-bad" : ""));
  b.append(el("div", null, text));
  return b;
}

// THE PRESETS (v0.44.0). `orc diy` opens by asking which shape to start from —
// full-lane defaults or one of the shipped presets — and that question had no
// answer in this panel at all: a flow could be tuned key by key here, but never
// STARTED from a known-good shape.
//
// It is a REPLACEMENT, not a merge: `orc diy init --force` rewrites the config
// file, which is what the terminal does too. So every row names the keys the
// preset actually changes, the exact command is on the row before you click it,
// and applying it goes through a confirmation that says what is lost.
//
// A row you are ALREADY ON says so and drops its button (v0.44.1). The match is
// the CLI's — `presets[].active` — and it deliberately ignores `flow_name`, so
// renaming `solo-fast` to `solo` does not make the panel forget which shape the
// flow came from. Offering "use this" for the thing already in use is a button
// whose only possible effect is to overwrite your config with itself.
function presetCard(d, body) {
  const c = card(t("flow.presets"));
  c.id = "diy-presets";
  c.append(el("div", "note", d.configured ? t("flow.presetsNoteConfigured") : t("flow.presetsNote")));

  for (const p of d.presets || []) {
    const row = el("div", "preset-row" + (p.active ? " preset-active" : ""));
    const left = el("div");
    const head = el("div", "preset-head");
    // Preset names and their key=value diffs are CLI data — never translated.
    head.append(el("div", "setting-name", p.name || t("flow.presetDefaults")));
    if (p.active) head.append(chip(t("flow.presetInUse"), "ok"));
    left.append(head);
    const changed = Object.entries(p.changes || {});
    left.append(
      el("div", "setting-desc", changed.length ? changed.map(([k, v]) => `${k}=${v}`).join(" · ") : t("flow.presetDefaultsDesc"))
    );
    left.append(el("div", "action-cmd", presetCommand(p)));
    // The match ignores flow_name, so say so on the row that matched — a chip
    // reading "in use" beside a flow called something else is otherwise just
    // confusing.
    if (p.active) left.append(el("div", "note", t("flow.presetInUseNote")));
    row.append(left);

    if (!p.active) {
      const use = el("button", "btn btn-sm", t("flow.presetUse"));
      use.type = "button";
      use.addEventListener("click", () => confirmPreset(p, d, body));
      row.append(use);
    }
    c.append(row);
  }
  return c;
}

const presetCommand = (p) => "orc diy init --force" + (p.name ? " --preset " + p.name : "");

function confirmPreset(p, d, body) {
  const b = el("div", "stack stack-sm");
  b.append(el("div", null, p.name ? t("flow.presetConfirm", { name: p.name }) : t("flow.presetConfirmDefaults")));
  b.append(el("div", "action-cmd", presetCommand(p)));
  if (p.changes && Object.keys(p.changes).length) {
    b.append(kvList(Object.entries(p.changes).map(([k, v]) => [k, String(v)])));
  }
  // Overwriting a flow you tuned by hand is the only way this can hurt, so it
  // is said plainly rather than implied by the word "force" in the command.
  if (d.configured) b.append(bannerLine(t("flow.presetOverwrite"), true));

  modal({
    title: t("flow.presetTitle"),
    body: b,
    actions: [
      { label: t("common.cancel"), onClick: (c) => c() },
      {
        label: t("flow.presetApply"),
        cls: d.configured ? "btn-danger" : "btn-primary",
        onClick: async (close) => {
          close();
          const r = await post("/api/diy/preset", { name: p.name });
          toast(r.command, r.ok ? "ok" : "bad", r.output);
          renderFlow(body);
        },
      },
    ],
  });
}

// THE FLOW STEPPER (v0.43.7). A compiled DIY flow is a pipeline, and a column
// of key/value rows is the one shape that never shows you a pipeline. Every
// step here comes from `orc diy show --json`'s `steps[]`, which the CLI derives
// from the SAME array `orc diy compile` stitches with — the panel draws the
// order, it never decides it.
//
// A phase you switched OFF keeps its slot and turns RED. Removing it would make
// "I turned review off" and "this flow has no review phase" look identical, and
// it would make the rail change width every time you flip a key.
//
// The sweep LOOPS (v0.44.0). It was one-shot on the reasoning that motion above
// a form is a distraction; in use the opposite complaint arrived — the one thing
// on the panel that says "these run in this order" said it once, before you had
// finished reading the card, and there was no way to see it again short of a
// recompile. The loop is a long, mostly-idle cycle: a single pulse travels the
// rail and the rail is at rest for the rest of it, so it reads as a heartbeat
// rather than a flashing sign. `prefers-reduced-motion` removes it entirely.
function stepperCard(d) {
  const on = d.steps.filter((s) => s.on).length;
  const c = card(t("flow.pipeline"), chip(t("flow.pipelinePhases", { on, total: d.steps.length }), "info"));
  c.append(el("div", "note", t("flow.pipelineNote")));

  const scroll = el("div", "scroll-x");
  const rail = el("div", "stepper");
  d.steps.forEach((s, i) => {
    if (i) {
      const link = el("div", "step-link");
      link.append(el("span", "step-flow"));
      link.style.setProperty("--d", i * 90 + "ms");
      rail.append(link);
    }
    // A step is a button only when there is a key to jump to; a keyless phase
    // (intake, trace, execute) has nothing to edit, so it is not offered as one.
    const step = el(s.key ? "button" : "div", "step" + (s.on ? "" : " step-off"));
    if (s.key) {
      step.type = "button";
      step.title = t("flow.stepJump", { key: s.key });
      step.addEventListener("click", () => jumpToKey(s.key));
    }
    step.style.setProperty("--d", i * 90 + "ms");
    // label / value / key come from the CLI — never translated.
    step.append(el("span", "step-name", s.label));
    step.append(el("span", "step-note", s.on ? s.note || "on" : "off"));
    rail.append(step);
  });
  scroll.append(rail);
  c.append(scroll);
  return c;
}

function jumpToKey(key) {
  const row = document.querySelector('#flow-keys .setting[data-key="' + key + '"]');
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.remove("linked-hi");
  void row.offsetWidth; // restart the highlight when the same step is clicked twice
  row.classList.add("linked-hi");
  setTimeout(() => row.classList.remove("linked-hi"), 1600);
}
