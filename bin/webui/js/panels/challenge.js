"use strict";
/* panels/challenge.js — orc ui client
   The iteration timeline, the convergence chart, the findings.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


PANELS.challenge = function (host) {
  head(host, t("challenge.title"), t("challenge.sub"));
  const body = el("div", "stack");
  host.append(body);
  renderChallenge(body);
};

async function renderChallenge(body) {
  body.replaceChildren(skeleton(5));
  let d;
  try {
    d = (await read("/api/challenge")).data;
  } catch (e) {
    body.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const out = frag();

  if (!d || !d.cycles || !d.cycles.length) {
    const c = card(t("challenge.title"));
    c.append(empty(t("challenge.none"), t("challenge.noneHint")));
    c.append(laneCommand("/orc-challenge", t("challenge.cmdWhy")));
    out.append(c);
    body.replaceChildren(out);
    return;
  }

  const sum = card(t("challenge.summary"));
  const chips = el("div", "row-actions");
  for (const s of Object.keys(CH_STATE_KIND)) {
    const n = d.cycles.filter((c) => c.state === s).length;
    if (!n) continue;
    chips.append(chip(`${n} ${s}`, CH_STATE_KIND[s], s === CH_PULSE));
  }
  sum.append(chips);
  sum.append(el("div", "note", t("challenge.contract")));
  out.append(sum);

  const list = el("div", "run-list ch-list");
  const rows = [];
  const setOpen = (entry, open) => {
    entry.row.classList.toggle("open", open);
    entry.head.setAttribute("aria-expanded", String(open));
    if (open && !entry.loaded) {
      entry.loaded = true;
      loadChallengeDetail(entry.pane, entry.slug, body);
    }
  };
  const collapseAll = (except) => {
    for (const r of rows) if (r.row !== except) setOpen(r, false);
  };

  for (const c of d.cycles) {
    const row = el("div", "run-row");
    const headBtn = el("button", "run-card");
    headBtn.type = "button";
    headBtn.setAttribute("aria-expanded", "false");
    headBtn.append(el("span", "run-caret", "▸"));
    // The CLI's own state words. Never a friendlier synonym.
    headBtn.append(chip(c.state, CH_STATE_KIND[c.state] || "", c.state === CH_PULSE));
    if (c.stalled) headBtn.append(chip(t("challenge.stalledChip"), "warn"));
    if (c.no_template) headBtn.append(chip(t("challenge.noTemplateChip"), "warn"));
    const mid = el("div", "run-mid");
    mid.append(el("div", "run-slug", c.slug));
    mid.append(el("div", "run-where", `${c.kind} · ${tn(c.iterations, "challenge.iterN")}`));
    headBtn.append(mid);
    headBtn.append(el("div", "run-age", c.blocking ? tn(c.blocking, "challenge.blockingN") : t("challenge.noBlocking")));

    const pane = el("div", "run-pane stack stack-sm");
    pane.append(skeleton(4));
    const inner = el("div", "run-body-inner");
    inner.append(pane);
    const fold = el("div", "run-body");
    fold.append(inner);

    const entry = { row, head: headBtn, pane, slug: c.slug, loaded: false };
    rows.push(entry);
    headBtn.addEventListener("click", () => {
      const isOpen = row.classList.contains("open");
      collapseAll(row);
      setOpen(entry, !isOpen);
    });
    row.append(headBtn, fold);
    list.append(row);
  }
  out.append(list);
  out.append(laneCommand("/orc-challenge", t("challenge.cmdWhy")));
  body.replaceChildren(out);
}

// PROGRESSIVE DISCLOSURE, in the order a human reads: the goal, then the state
// and the timeline, then the reader's score and the dimension strip, then the
// findings, then the raw verdict last and collapsed. Nobody should have to
// scroll past a wall of findings to learn what the document was for.
async function loadChallengeDetail(pane, slug, body) {
  let s;
  let show = null;
  let diff = null;
  try {
    s = (await read("/api/challenge/one?slug=" + encodeURIComponent(slug))).data;
    show = (await read("/api/challenge/show?slug=" + encodeURIComponent(slug)).catch(() => ({ data: null }))).data;
    diff = (await read("/api/challenge/diff?slug=" + encodeURIComponent(slug)).catch(() => ({ data: null }))).data;
  } catch (e) {
    pane.replaceChildren(empty(t("common.loadFail"), String(e.message)));
    return;
  }
  const out = frag();

  // --- 1. the goal block, ABOVE everything. It is the first thing a reader
  //     needs in order to read anything below it.
  const g = card(t("challenge.goalTitle") + "  v" + s.goals.version);
  g.append(
    kvList([
      [t("challenge.field.goal"), s.goals.goal],
      [t("challenge.field.audience"), s.goals.audience],
      [t("challenge.field.done"), s.goals.done_means],
      [t("challenge.field.outOfScope"), (s.goals.out_of_scope || []).join(" · ")],
      [t("challenge.field.context"), (s.goals.context_refs || []).join(" · ")],
    ])
  );
  g.append(el("div", "note", t("challenge.goalNote")));
  out.append(g);

  // --- 2. the state, and its ONE next action
  const st = card(null);
  const stRow = el("div", "row-actions");
  stRow.append(chip(s.state, CH_STATE_KIND[s.state] || "", s.state === CH_PULSE));
  stRow.append(el("span", "note", s.why));
  st.append(stRow);
  st.append(challengeNextAction(s, diff, body));
  out.append(st);

  // --- 3. the timeline (the hero) + the convergence chart
  if (s.convergence && s.convergence.length) {
    const tl = card(t("challenge.timeline"));
    tl.append(challengeTimeline(s));
    tl.append(challengeConvergence(s));
    if (s.stalled) tl.append(el("div", "note bad", t("challenge.stalledNote", { n: s.convergence.length })));
    out.append(tl);
  } else {
    const tl = card(t("challenge.timeline"));
    tl.append(empty(t("challenge.noIterations"), t("challenge.noIterationsHint", { slug: s.slug })));
    out.append(tl);
  }

  // --- 4. the reader's comprehension score — the most legible thing here to a
  //     non-engineer, so it sits high.
  const last = show && show.iterations && show.iterations[0];
  if (last && last.reader) {
    const rc = card(t("challenge.readerTitle"));
    const big = el("div", "ch-score");
    big.append(el("span", "ch-score-num", String(last.reader.score || "—")));
    big.append(el("span", "note", t("challenge.readerSub", { asked: last.reader.asked, answered: last.reader.answered })));
    rc.append(big);
    rc.append(el("div", "note", t("challenge.readerNote")));
    out.append(rc);
  }

  // --- 5. the dimension strip. A NOT-CHECKED chip KEEPS ITS SLOT and carries
  //     its reason; a 0-finding dimension keeps its slot too.
  const dc = card(t("challenge.dimensions"));
  const strip = el("div", "row-actions");
  for (const dim of s.dimensions || []) {
    const label =
      dim.status === "CHECKED"
        ? `${dim.id} ${dim.findings}${dim.score ? " · " + dim.score : ""}`
        : `${dim.id} ${dim.status}`;
    const c = chip(label, CH_DIM_KIND[dim.status] || "");
    if (dim.reason) {
      c.title = dim.reason;
      // A reason on hover only is a reason a screen reader never gets.
      c.setAttribute("aria-label", `${dim.id} ${dim.status} — ${dim.reason}`);
    }
    strip.append(c);
  }
  dc.append(strip);
  dc.append(el("div", "note", t("challenge.dimNote")));
  out.append(dc);

  // --- 6. the findings
  if (last && last.findings && last.findings.length) {
    const fc = card(t("challenge.findings"), challengeReportBtn(slug, body));
    for (const f of last.findings) {
      const box = el("div", "ch-finding");
      const hdr = el("div", "row-actions");
      hdr.append(chip(f.severity, CH_SEV_KIND[f.severity] || ""));
      hdr.append(el("span", "mono dim", f.id));
      hdr.append(chip(f.dimension, ""));
      if (f.outcome) hdr.append(chip(f.outcome, f.outcome === "resolved" ? "ok" : f.outcome === "still-open" ? "warn" : ""));
      if (show.accepted && show.accepted[f.id]) hdr.append(chip(t("challenge.acceptedBadge"), "ok"));
      if (show.rebuttals && show.rebuttals[f.id]) hdr.append(chip(t("challenge.rebuttedBadge"), "info"));
      box.append(hdr);
      box.append(el("div", "ch-anchor mono", f.anchor || "—"));
      if (f.quote) box.append(el("blockquote", "ch-quote", f.quote));
      const rows = [];
      if (f.what_is_wrong) rows.push([t("challenge.field.wrong"), f.what_is_wrong]);
      if (f.consequence) rows.push([t("challenge.field.consequence"), f.consequence]);
      if (f.acceptance_line) rows.push([t("challenge.field.fixedWhen"), f.acceptance_line]);
      if (f.serves) rows.push([t("challenge.field.serves"), f.serves]);
      if (f.superseded_by) rows.push([t("challenge.field.supersededBy"), f.superseded_by]);
      if (f.reason) rows.push([t("challenge.field.reason"), f.reason]);
      box.append(kvList(rows));
      if (show.accepted && show.accepted[f.id])
        box.append(el("div", "note ok", t("challenge.acceptedNote", { reason: show.accepted[f.id].reason })));
      if (show.rebuttals && show.rebuttals[f.id])
        box.append(el("div", "note", t("challenge.rebuttedNote", { reason: show.rebuttals[f.id].reason, status: show.rebuttals[f.id].status })));
      // Both escape valves are FREE, so both are buttons — and both refuse
      // without a reason, which the CLI decides, not this form.
      if (!f.outcome || f.outcome === "still-open") {
        const acts = el("div", "row-actions");
        if (!(show.accepted && show.accepted[f.id]))
          acts.append(challengeValveBtn("accept", slug, f.id, body));
        if (!(show.rebuttals && show.rebuttals[f.id]))
          acts.append(challengeValveBtn("rebut", slug, f.id, body));
        box.append(acts);
      }
      fc.append(box);
    }
    if (last.dropped && last.dropped.length)
      fc.append(el("div", "note", t("challenge.dropped", { n: last.dropped.length, ids: last.dropped.map((x) => x.id).join(", ") })));
    out.append(fc);
  }

  // --- 7. events, collapsed
  if (show && show.events && show.events.length)
    out.append(
      collapsible({
        title: t("challenge.events"),
        count: String(show.events.length),
        collapsed: true,
        content: kvList(show.events.map((e) => [e.at, `${e.kind} — ${e.detail}`])),
      })
    );

  pane.replaceChildren(out);
}

// EVERY STATE ANSWERS "so what do I do now?" — the one next action, inline.
function challengeNextAction(s, diff, body) {
  const wrap = el("div", "stack stack-sm");
  if (s.state === "MISSING-REVISION") {
    wrap.append(el("div", "note bad", t("challenge.missingRevision", { path: s.revision.expected })));
    if (diff && diff.candidates && diff.candidates.length) {
      const ul = el("ul", "file-list");
      for (const c of diff.candidates) {
        const li = el("li");
        li.append(el("span", "mono", c.path));
        li.append(el("span", "note", `  +${c.added} −${c.removed}`));
        ul.append(li);
      }
      wrap.append(ul);
      // It LISTS, it does not adopt. So the panel offers the recorded escape as
      // a COMMAND — picking one for the user is the exact thing the CLI refuses.
      wrap.append(el("div", "note", t("challenge.candidatesNote")));
      wrap.append(el("pre", "cmd", `orc challenge expect ${s.slug} --set <path>`));
    }
    return wrap;
  }
  if (s.state === "TAMPERED") {
    wrap.append(el("div", "note bad", t("challenge.tamperedNote")));
    return wrap;
  }
  if (s.state === "PASSED" || s.state === "STALE-PASS") {
    wrap.append(el("div", "note", s.state === "PASSED" ? t("challenge.passedNote") : t("challenge.stalePassNote")));
    wrap.append(el("pre", "cmd", `git add orc/orc-challenge/${s.slug}/`));
    return wrap;
  }
  if (s.state === "AWAITING-FIX") {
    wrap.append(el("div", "note", t("challenge.awaitingFixNote")));
    wrap.append(challengeCopyPrompt(s));
    return wrap;
  }
  // AWAITING-JUDGE and AWAITING-RECHECK both need a paid run.
  wrap.append(laneCommand(s.next || `/orc-challenge ${s.slug}`, t("challenge.paidWhy")));
  return wrap;
}

// Copying is FREE, so it is a button. The prompt is assembled from the CLI's own
// fields — the expected path, the slug, the frozen goal file — never from a
// second idea of where anything lives.
function challengeCopyPrompt(s) {
  const prompt = [
    `Fix the findings in orc/orc-challenge/${s.slug}/fix-brief.md.`,
    "",
    `Artifact:  ${(s.artifacts[0] || {}).path || ""}`,
    `Goal:      orc/orc-challenge/${s.slug}/goals.md  (read this first)`,
    "",
    `Write the revised version to:  ${s.revision.expected}`,
    "",
    "Rules:",
    "- Change the artifact only. Do not edit anything under orc/orc-challenge/.",
    "- Do not mark findings resolved. The next judgement decides that.",
    "- If you think a finding is wrong, do not argue with it here —",
    `  run: orc challenge rebut ${s.slug} <id> "why"`,
    "",
    "When you are done, start ANOTHER new session and run:",
    `  /orc-challenge ${s.slug}`,
  ].join("\n");
  const box = el("div", "lane-cmd");
  box.append(el("div", "lane-cmd-head", t("challenge.pasteHead")));
  box.append(el("pre", "cmd ch-prompt", prompt));
  const b = el("button", "btn btn-sm", t("challenge.copyPrompt"));
  b.type = "button";
  b.addEventListener("click", () => copy(prompt, t("challenge.copyPrompt")));
  box.append(b);
  return box;
}

function challengeReportBtn(slug, body) {
  const b = el("button", "btn btn-ghost btn-sm", t("challenge.reRender"));
  b.type = "button";
  b.addEventListener("click", async () => {
    const r = await post("/api/challenge/report", { slug });
    toast(r.ok ? t("challenge.reportOk") : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
    renderChallenge(body);
  });
  return b;
}

// KEYS ARE WRITTEN OUT IN FULL, never assembled from a fragment — the i18n rule.
// A dotted key built by concatenation is a key no lint can find and no
// translator can see.
const CH_VALVE = {
  accept: {
    btn: "challenge.acceptBtn",
    title: "challenge.acceptTitle",
    body: "challenge.acceptBody",
    note: "challenge.acceptNote",
    go: "challenge.acceptGo",
    ok: "challenge.acceptOk",
    route: "/api/challenge/accept",
  },
  rebut: {
    btn: "challenge.rebutBtn",
    title: "challenge.rebutTitle",
    body: "challenge.rebutBody",
    note: "challenge.rebutNote",
    go: "challenge.rebutGo",
    ok: "challenge.rebutOk",
    route: "/api/challenge/rebut",
  },
};

// A COUNT IS NOT CONSENT, and neither is a click: a reason is mandatory, and the
// exact command is on screen the whole time — the CLI refuses without one too,
// so this form has no second idea of what a valid acceptance is.
function challengeValveBtn(which, slug, id, body) {
  const K = CH_VALVE[which];
  const b = el("button", "btn btn-ghost btn-sm", t(K.btn));
  b.type = "button";
  b.addEventListener("click", () => {
    const wrap = frag();
    wrap.append(el("p", null, t(K.body, { id })));
    const input = el("input", "text-input");
    input.type = "text";
    input.placeholder = t("challenge.reasonPlaceholder");
    wrap.append(input);
    const cmd = el("pre", "cmd", `orc challenge ${which} ${slug} ${id} "…"`);
    wrap.append(cmd);
    wrap.append(el("div", "note", t(K.note)));
    const m = modal({
      title: t(K.title),
      body: wrap,
      actions: {
        [t("common.cancel")]: null,
        [t(K.go)]: async () => {
          const reason = input.value.trim();
          if (!reason) return toast(t("challenge.needReason"), "bad");
          const r = await post(K.route, { slug, id, reason });
          toast(r.ok ? t(K.ok) : t("common.writeFail"), r.ok ? "ok" : "bad", r.output);
          renderChallenge(body);
        },
      },
    });
    input.addEventListener("input", () => {
      cmd.textContent = `orc challenge ${which} ${slug} ${id} "${input.value || "…"}"`;
    });
    requestAnimationFrame(() => input.focus());
    return m;
  });
  return b;
}

/* THE ITERATION TIMELINE — the hero.

   GEOMETRY IS SOLVED FROM THE BOX SIZE, never expressed as a fraction of the
   container (the VAULT / ringRadii lesson from Crosslink): a node box is a fixed
   size, the rail is the bounding box of what was PLACED, and too many iterations
   SCROLLS rather than being squeezed. A `regoal` or `retemplate` draws a VERSION
   BREAK, because a comparison across one is not a comparison. */
const CH_NODE = { W: 92, H: 62, GAP: 30, PAD: 16, BREAK: 22 };

function challengeTimeline(s) {
  const iters = s.convergence || [];
  const box = el("div", "ch-rail-wrap");
  // Where a version break falls: between iteration i-1 and i, when either frozen
  // yardstick's version number changed.
  const breakBefore = iters.map((it, i) =>
    i === 0 ? false : it.graded_against !== iters[i - 1].graded_against || it.graded_against_goal !== iters[i - 1].graded_against_goal
  );
  const xs = [];
  let x = CH_NODE.PAD;
  for (let i = 0; i < iters.length; i++) {
    if (breakBefore[i]) x += CH_NODE.BREAK;
    xs.push(x);
    x += CH_NODE.W + CH_NODE.GAP;
  }
  const width = (xs.length ? xs[xs.length - 1] + CH_NODE.W : 0) + CH_NODE.PAD;
  const height = CH_NODE.H + 2 * CH_NODE.PAD + 18;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ch-rail");
  // The canvas is the bounding box of what was PLACED, and it keeps its aspect:
  // a stretched viewBox squashes every label and every stroke.
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("challenge.timelineAria", { n: iters.length }));

  const mk = (name, attrs, text) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const k of Object.keys(attrs)) n.setAttribute(k, String(attrs[k]));
    if (text !== undefined) n.textContent = text;
    return n;
  };

  for (let i = 0; i < iters.length; i++) {
    const it = iters[i];
    const cx = xs[i];
    const cy = CH_NODE.PAD;
    if (i > 0) {
      const prevEnd = xs[i - 1] + CH_NODE.W;
      svg.append(mk("line", { x1: prevEnd, y1: cy + CH_NODE.H / 2, x2: cx, y2: cy + CH_NODE.H / 2, class: "ch-rail-link" }));
      if (breakBefore[i]) {
        const bx = (prevEnd + cx) / 2;
        svg.append(mk("line", { x1: bx, y1: cy - 6, x2: bx, y2: cy + CH_NODE.H + 6, class: "ch-rail-break" }));
        svg.append(mk("text", { x: bx, y: cy + CH_NODE.H + 18, class: "ch-rail-breaklabel", "text-anchor": "middle" }, `v${it.graded_against_goal}`));
      }
    }
    const g = mk("g", { class: "ch-rail-node" + (it.passed ? " pass" : " fail"), style: `animation-delay:${i * 40}ms` });
    g.append(mk("rect", { x: cx, y: cy, width: CH_NODE.W, height: CH_NODE.H, rx: 10, class: "ch-rail-box" }));
    g.append(mk("text", { x: cx + CH_NODE.W / 2, y: cy + 24, class: "ch-rail-n", "text-anchor": "middle" }, String(it.n)));
    g.append(
      mk("text", { x: cx + CH_NODE.W / 2, y: cy + 44, class: "ch-rail-verdict", "text-anchor": "middle" }, it.passed ? "PASS" : `FAIL ${it.blocking}`)
    );
    svg.append(g);
  }
  box.append(svg);
  return box;
}

/* THE CONVERGENCE CHART — blocking findings per iteration, stacked by severity,
   the same visual family as the budget cost bar. THIS IS THE PAYOFF PICTURE: you
   can see a cycle converging, or not. It draws left to right on open, once,
   because the SHAPE of the trend is the information. */
function challengeConvergence(s) {
  const iters = s.convergence || [];
  const wrap = el("div", "ch-conv");
  const max = Math.max(1, ...iters.map((i) => ["P0", "P1", "P2", "P3"].reduce((n, k) => n + ((i.severities || {})[k] || 0), 0)));
  for (const it of iters) {
    const rowEl = el("div", "ch-conv-row");
    rowEl.append(el("span", "ch-conv-n", String(it.n)));
    const bar = el("div", "ch-conv-bar");
    for (const sev of ["P0", "P1", "P2", "P3"]) {
      const n = (it.severities || {})[sev] || 0;
      if (!n) continue;
      const seg = el("div", "ch-conv-seg ch-sev-" + sev.toLowerCase());
      seg.style.setProperty("--w", ((n / max) * 100).toFixed(2) + "%");
      seg.title = `${sev} ${n}`;
      bar.append(seg);
    }
    rowEl.append(bar);
    rowEl.append(el("span", "ch-conv-blocking", String(it.blocking)));
    wrap.append(rowEl);
  }
  wrap.append(el("div", "note", t("challenge.convNote")));
  return wrap;
}

/* A paid action is a COMMAND, never a button. This renders one, with the reason
   it is not a button — making the boundary visible rather than hiding it. */
function laneCommand(cmd, why) {
  const box = el("div", "lane-cmd");
  box.append(el("div", "lane-cmd-head", t("common.runInClaude")));
  const row = el("div", "row-actions");
  row.append(el("pre", "cmd", cmd));
  const b = el("button", "btn btn-ghost btn-sm", t("common.copy"));
  b.type = "button";
  b.addEventListener("click", () => copy(cmd, cmd));
  row.append(b);
  box.append(row);
  if (why) box.append(el("div", "note", why));
  return box;
}

/* ==================================================================== DOCS == */
/*
   THE PANEL DERIVES NOTHING. Not the section order, not a line range, not a
   state word, not the batching, not a lint rule name, not the completion
   verdict. It draws `orc doc … --json`. (The Flow-stepper rule: a second idea
   of the pipeline is exactly the drift this panel exists to make impossible.)

   THE FREE/PAID LINE, visible rather than hidden: `list`, `status`, `map`,
   `lint`, `plan` and `assemble` are deterministic and cost no model tokens, so
   each is a real BUTTON. Writing a section, checking a range and editing one all
   cost model tokens, so they are copy-able commands and there is no route for
   any of them.

   AND IT IS A PLAN PREVIEW, NOT A LIVE MONITOR. The server cannot see a running
   session, so the wave card says so in one line. Claiming live status would be
   this panel's first lie.
*/
