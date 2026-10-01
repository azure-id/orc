"use strict";
// ── `orc fix` — the deterministic half of `/orc-fix` (v2.1.0 W6, 04 §5) ──────
//
//   orc fix classify --text "<what the user said>" [--json]   F0: evidence → ONE proposed class
//   orc fix record <file|-> [--json]                           F2: one observation, the miss, ONE FIX line
//   orc fix list [--window <days>] [--json]                    the fix records, newest first
//
// `/orc-fix` is a RIDER lane, like `/orc-wait` and `/orc-explain`: it opens no
// run of its own. So this module NEVER writes `.current` — it only READS it to
// find the host run, and appends ONE `FIX` line to that run's trace (DE-14).
//
// The class has two axes (04 §5.2): `source` (what found it) and
// `introduced_by` (who wrote the bad lines). Both are kept: a Sonar issue can
// also be in ORC-written code. The user's word wins over the evidence; a
// changed class is recorded `class_by: user`.
//
// A fix is recorded through `recordObservations` (the ONE writer of
// observations.jsonl). Its author is the FINDER (bot for Sonar/CI, human for a
// user report) — never `orc`, so Review Quality never counts a fix as a review.
// With a Sonar issue key the id is `sha1("sonar|sonar <key>")`, the importer's
// own id: a later `orc gotcha sync` upserts the SAME row and keeps the fix fields.
//
// Exit codes. classify: 0 classified · 1 a dispatch is in flight (wait) · 2 usage.
// record: 0 recorded · 1 a dispatch is in flight (nothing written) · 2 malformed.
// list: 0 listed · 1 none.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const G = require("./gotcha.js");

const SOURCES = ["sonar", "ci", "defect", "pr", "review", "other"];
const CLASS_BY = ["user", "evidence"];
const SONAR_RULE = /\b([a-z][a-z0-9]*:S\d+)\b/i;
const SONAR_URL = /^https?:\/\/\S*sonar\S*$/i;
const SONAR_KEY = /[?&](?:open|issues)=([A-Za-z0-9_-]+)/;
const PR_URL = /^https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/(\d+)/i;
const CI_URL = /\/actions\/runs\/\d+/;
const CI_WORDS = /\b(?:ci|pipeline|workflow|check|build)\b[^.\n]{0,30}\b(?:fail|failed|failing|failure|red|broke)/i;
const DEFECT_WORDS = /\b(?:bug|defect|regression|crash|crashes|broken)\b/i;
const REVIEW_WORDS = /\breview(?:er)?\s+(?:comment|finding|note|thread)s?\b/i;
const LOC = /([A-Za-z0-9_.\/\\-]+\.[A-Za-z0-9]+):(\d+)(?:\s*[-–]\s*(\d+))?/;
const BARE_PATH = /((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+)/;
// A commit whose message carries one of these was written with an AI tool.
const AI_TRAILER = /^(?:Co-Authored-By|Generated-By|Assisted-By):.*\b(?:Claude|Copilot|Cursor|Codex|Gemini|GPT|ChatGPT|Devin|Aider|Windsurf)\b/im;
const AI_MARK = /Generated with \[?(?:Claude Code|Copilot|Cursor)/i;
const TRACE_TS = /^\[(\d{2})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?\]/;

const posix = (p) => String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
const oneLine = (v) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").trim();
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout == null ? "" : r.stdout, err: String(r.stderr || "").trim() };
}

// The run in flight, READ from `.current` (never written here), and whether a
// dispatch is still open — the same sidecar `orc run inflight` reads.
function hostRun(deps, claudeDir) {
  const dir = deps.resolveLogDir(claudeDir);
  let cur = null;
  try {
    cur = fs.readFileSync(path.join(dir, ".current"), "utf8").trim();
  } catch (_) {}
  if (!cur) return { host: null, inflight: "clear", pending: 0 };
  const tracePath = path.join(dir, cur);
  if (!fs.existsSync(tracePath)) return { host: null, inflight: "clear", pending: 0 };
  const m = deps.TRACE_NAME.exec(cur);
  const host = { trace: cur, run: cur.replace(/\.txt$/, ""), lane: m ? m[1] : null, slug: m ? m[2] : null, path: tracePath };
  let pend = null;
  try {
    const raw = JSON.parse(fs.readFileSync(tracePath + ".pending.json", "utf8"));
    if (Array.isArray(raw)) pend = raw;
  } catch (_) {}
  const now = Date.now();
  if (pend) {
    const open = pend.filter((r) => !(typeof r.ts === "number" && now - r.ts > deps.inflightStaleMs)).length;
    return { host, inflight: open ? "in-flight" : "clear", pending: open };
  }
  // No sidecar: trust the trace's own SPAWN/RETURN balance.
  let balance = 0;
  try {
    const text = fs.readFileSync(tracePath, "utf8");
    balance = (text.match(/\] hook\s+SPAWN /g) || []).length - (text.match(/\] hook\s+RETURN /g) || []).length + (text.match(/\] hook\s+RETURN ~agent :: unattributed/g) || []).length;
  } catch (_) {}
  return { host, inflight: balance > 0 ? "in-flight" : "clear", pending: Math.max(0, balance) };
}

// `git blame` on the named lines → the commit that wrote most of them.
function blame(root, file, s, e) {
  const r = git(root, ["blame", "--porcelain", "-L", `${s},${e}`, "--", file]);
  if (!r.ok) return { err: (r.err.split("\n")[0] || "git blame failed").slice(0, 160) };
  const counts = new Map();
  const times = {};
  let cur = null;
  for (const line of r.out.split("\n")) {
    const h = /^([0-9a-f]{40}) \d+ \d+/.exec(line);
    if (h) {
      cur = h[1];
      counts.set(cur, (counts.get(cur) || 0) + 1);
      continue;
    }
    const t = /^committer-time (\d+)/.exec(line);
    if (t && cur) times[cur] = Number(t[1]) * 1000;
  }
  const real = [...counts.entries()].filter(([sha]) => !/^0+$/.test(sha)).sort((a, b) => b[1] - a[1]);
  if (!real.length) return { uncommitted: true };
  const sha = real[0][0];
  const msg = git(root, ["log", "-1", "--format=%B", sha]);
  return { commit: sha, time_ms: times[sha] || null, message: msg.ok ? msg.out : "" };
}

function traceWindow(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (_) {
    return null;
  }
  let start = null;
  let end = null;
  for (const line of text.split(/\r?\n/)) {
    const m = TRACE_TS.exec(line);
    if (!m) continue;
    const ts = new Date(2000 + +m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6], +(m[7] || 0)).getTime();
    if (start === null) start = ts;
    end = ts;
  }
  return start === null ? null : { start, end };
}

// `orc` when the commit time falls inside an ORC trace's window AND the file is
// in that run's changed set (the diff against its `orc run snapshot`), or the
// commit message names the run. → { run, why } | null
function orcRunFor(deps, claudeDir, root, b, file) {
  let runs = [];
  try {
    runs = deps.listTraces(claudeDir).runs;
  } catch (_) {}
  for (const r of runs) {
    if (!r.slug) continue;
    const stem = r.name.replace(/\.txt$/, "");
    const named = b.message.includes(stem) || (r.slug.includes("-") && new RegExp(`(^|[^a-z0-9-])${escRe(r.slug)}([^a-z0-9-]|$)`, "i").test(b.message));
    if (named) return { run: stem, why: `the commit message names the run (${r.slug})` };
  }
  if (!b.time_ms) return null;
  for (const r of runs) {
    if (!r.slug) continue;
    const w = traceWindow(r.path);
    if (!w || b.time_ms < w.start - 1000 || b.time_ms > w.end + 1000) continue;
    const d = git(root, ["diff", "--name-only", `refs/orc/runs/${r.slug}/pre`, b.commit]);
    if (!d.ok) continue;
    if (d.out.split(/\r?\n/).map(posix).includes(file))
      return { run: r.name.replace(/\.txt$/, ""), why: `the commit falls inside the run's trace window and ${file} is in the run's changed set` };
  }
  return null;
}

function classify(deps, claudeDir, text) {
  const root = deps.repoRootOf(claudeDir);
  const evidence = [];
  const t = String(text || "");
  const urls = t.match(/https?:\/\/\S+/g) || [];
  const plain = t.replace(/https?:\/\/\S+/g, " ");
  const run = hostRun(deps, claudeDir);
  let source = null;
  let rule = null;
  let sonarKey = null;
  let pr = null;
  const sr = SONAR_RULE.exec(plain);
  const sonarUrl = urls.find((u) => SONAR_URL.test(u));
  if (sonarUrl) {
    const k = SONAR_KEY.exec(sonarUrl);
    if (k) sonarKey = k[1];
    const ru = /[?&]rules?=([a-z][a-z0-9]*(?::|%3A)S\d+)/i.exec(sonarUrl);
    if (ru && !sr) rule = "sonar:" + decodeURIComponent(ru[1]);
  }
  if (sr) rule = "sonar:" + sr[1];
  if (rule || sonarUrl) {
    source = "sonar";
    evidence.push(sonarUrl ? `a Sonar URL${sonarKey ? ` (issue ${sonarKey})` : ""}` : `a Sonar rule key (${rule.replace(/^sonar:/, "")})`);
  }
  const prUrl = urls.find((u) => PR_URL.test(u));
  if (prUrl) pr = PR_URL.exec(prUrl)[1];
  if (!source && prUrl) {
    source = "pr";
    evidence.push(`a PR thread URL (PR ${pr})`);
  }
  if (!source && (urls.some((u) => CI_URL.test(u)) || CI_WORDS.test(plain))) {
    source = "ci";
    evidence.push(urls.some((u) => CI_URL.test(u)) ? "a CI run URL" : "the text names a failed check");
  }
  if (!source && run.host) {
    let txt = "";
    try {
      txt = fs.readFileSync(run.host.path, "utf8");
    } catch (_) {}
    if (/\]\s+\S+\s+REPRO red\b/.test(txt)) {
      source = "defect";
      evidence.push(`a REPRO red line in the host run (${run.host.run})`);
    }
  }
  if (!source && DEFECT_WORDS.test(plain)) {
    source = "defect";
    evidence.push("the text names a defect");
  }
  if (!source && REVIEW_WORDS.test(plain)) {
    source = "review";
    evidence.push("the text names a review comment");
  }
  if (!source) {
    source = "other";
    evidence.push("no Sonar key, PR URL, failed check or reproduction in the text");
  }

  // introduced_by — from the named lines.
  const loc = LOC.exec(plain);
  let file = null;
  let lines = null;
  if (loc) {
    file = posix(loc[1]);
    const s = Number(loc[2]);
    const e = loc[3] ? Number(loc[3]) : s;
    lines = e >= s ? [s, e] : [e, s];
  } else {
    const bp = BARE_PATH.exec(plain);
    if (bp) file = posix(bp[1]);
  }
  let introducedBy = "unknown";
  let introRun = null;
  let commit = null;
  if (!lines) evidence.push("no lines named — introduced_by is unknown");
  else {
    const b = blame(root, file, lines[0], lines[1]);
    if (b.err) evidence.push(`git blame failed: ${b.err}`);
    else if (b.uncommitted) evidence.push("the named lines are not committed yet");
    else {
      commit = b.commit;
      const orc = orcRunFor(deps, claudeDir, root, b, file);
      if (orc) {
        introducedBy = "orc";
        introRun = orc.run;
        evidence.push(`git blame → ${b.commit.slice(0, 7)}: ${orc.why}`);
      } else if (AI_TRAILER.test(b.message) || AI_MARK.test(b.message)) {
        introducedBy = "ai";
        evidence.push(`git blame → ${b.commit.slice(0, 7)}: the commit has an AI co-author trailer`);
      } else {
        introducedBy = "human";
        evidence.push(`git blame → ${b.commit.slice(0, 7)}: no ORC run and no AI trailer`);
      }
    }
  }
  const record = {
    source,
    introduced_by: introducedBy,
    class_by: "evidence",
    rule,
    sonar_key: sonarKey,
    pr,
    path: file,
    lines,
    run: introRun,
    commit,
    fix_run: run.host ? run.host.run : null,
    text: oneLine(t).slice(0, 200) || null,
  };
  return {
    ok: true,
    source,
    introduced_by: introducedBy,
    rule,
    sonar_key: sonarKey,
    pr,
    path: file,
    lines,
    run: introRun,
    commit,
    evidence,
    host: run.host ? { trace: run.host.trace, run: run.host.run, lane: run.host.lane, slug: run.host.slug } : null,
    inflight: run.inflight,
    pending: run.pending,
    // DE-12 (c): a run is open → record only, the host lane makes the fix.
    mode: run.host ? "record-only" : "may-fix",
    record,
  };
}

const AUTHOR_OF = { sonar: "bot", ci: "bot", defect: "human", pr: "human", review: "human", other: "human" };
function stamp(d) {
  const p = (n, w) => String(n).padStart(w || 2, "0");
  return `${p(d.getDate())}${p(d.getMonth() + 1)}${p(d.getFullYear() % 100)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

// A record body → { body } (an observe body) or { field, err }. Pure.
function toObservation(b, now) {
  const bad = (field, err) => ({ field, err });
  if (!b || typeof b !== "object" || Array.isArray(b)) return bad("body", "must be one JSON object");
  if (!SOURCES.includes(b.source)) return bad("source", `must be one of: ${SOURCES.join(", ")}`);
  if (!G.INTRODUCED_BY.includes(b.introduced_by)) return bad("introduced_by", `must be one of: ${G.INTRODUCED_BY.join(", ")}`);
  if (b.class_by !== undefined && b.class_by !== null && !CLASS_BY.includes(b.class_by)) return bad("class_by", "must be user or evidence");
  if (b.author === "orc") return bad("author", "of a fix is the FINDER (bot or human) — never orc");
  if (b.author !== undefined && b.author !== null && !["bot", "human"].includes(b.author)) return bad("author", "must be bot or human");
  if (b.lines !== undefined && b.lines !== null && (!Array.isArray(b.lines) || !b.lines.length || !b.lines.every((n) => Number.isInteger(n) && n > 0)))
    return bad("lines", "must be [start] or [start, end]");
  if (b.sonar_key && !/^[A-Za-z0-9_-]{1,80}$/.test(b.sonar_key)) return bad("sonar_key", "is not a Sonar issue key");
  let rule = b.rule ? oneLine(b.rule) : null;
  if (rule && b.source === "sonar" && !/^sonar:/.test(rule)) rule = "sonar:" + rule;
  const lines = Array.isArray(b.lines) ? b.lines.slice(0, 2) : null;
  const loc = b.path ? `${posix(b.path)}${lines ? ":" + lines.join("-") : ""}` : "-";
  const day = new Date(now).toISOString().slice(0, 10);
  // The importer's own id for a Sonar issue (`sonar ${key}`), so a sync upserts the row.
  const ref = b.sonar_key
    ? `sonar ${b.sonar_key}`
    : b.pr
      ? `PR ${b.pr} · fix ${loc}`
      : `fix ${b.fix_run || day} ${loc}${rule ? " " + rule : ""}`;
  const sig = b.sig || b.text || (rule ? null : `${b.source} fix in ${loc}`);
  return {
    body: {
      // `other` has no SOURCE_KIND row on purpose (no new source kind, 04 §4.2):
      // a fix with no named finder is filed as a defect the user reported.
      source: b.source === "other" ? "defect" : b.source,
      ref,
      rule,
      sig,
      path: b.path ? posix(b.path) : null,
      lines,
      category: b.category || null,
      severity: b.severity || null,
      pr: b.pr || null,
      commit: b.commit || null,
      outcome: b.outcome || "addressed",
      author: b.author || AUTHOR_OF[b.source],
      run: b.run || null,
      introduced_by: b.introduced_by,
      fix_run: b.fix_run || null,
      via: b.via || "orc-fix",
      class_by: b.class_by || "evidence",
    },
  };
}

function readInput(src) {
  if (src === undefined || src === "" || src === true) return { err: "names no input — pass a file path or - for stdin" };
  try {
    const text = src === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(String(src)), "utf8");
    return { value: JSON.parse(text.replace(/^﻿/, "")) };
  } catch (e) {
    return { err: `is not valid JSON (${e.message.split("\n")[0]})` };
  }
}

const USAGE =
  "Usage: orc fix classify --text \"<what the user said>\" [--json]   F0: the evidence and ONE proposed class\n" +
  "                                       (exit 0 · 1 a dispatch is in flight — wait · 2 usage)\n" +
  "       orc fix record <file|-> [--json]     F2: one observation, the computed miss, ONE FIX line in the host trace\n" +
  "                                       (exit 0 · 1 a dispatch is in flight, nothing written · 2 malformed)\n" +
  "       orc fix list [--window <days>] [--json]   the fix records, newest first (exit 0 · 1 none)";

function fixCmd(deps) {
  const { args, emitJson, wantsJson } = deps;
  const asJson = wantsJson();
  const claudeDir = deps.resolveClaudeDir();
  const now = Date.now();
  const pos = deps.positionals();
  const sub = pos[1];
  const valueOf = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const v = args[i + 1];
    return v !== undefined && (v === "-" || !v.startsWith("--")) ? v : "";
  };
  const out = (obj, code, human) => {
    if (asJson) emitJson(obj, code);
    if (human) human();
    process.exit(code);
  };
  const fail = (code, reason, message, extra) =>
    out(Object.assign({ ok: false, reason }, extra || {}, { message }), code, () => console.error(message));

  if (sub === "classify") {
    let text = valueOf("--text");
    if (text === "-") text = fs.readFileSync(0, "utf8");
    if (!text) return fail(2, "usage", "fix classify: --text \"<what the user said>\" is required\n" + USAGE);
    const c = classify(deps, claudeDir, text);
    const code = c.inflight === "in-flight" ? 1 : 0;
    if (code) c.message = `a dispatch is in flight in ${c.host.run} (${c.pending} open) — /orc-fix waits for its return`;
    return out(c, code, () => {
      if (code) console.log(`⏸ ${c.message}`);
      console.log(`proposed: source ${c.source} · introduced by ${c.introduced_by}${c.run ? ` (${c.run})` : ""}`);
      for (const e of c.evidence) console.log(`  - ${e}`);
      console.log(c.host ? `  host run: ${c.host.run} — record only, the host lane makes the fix` : "  no run is open — /orc-fix may offer to make the fix");
    });
  }

  if (sub === "record") {
    const inp = readInput(pos[2] || (args.includes("-") ? "-" : undefined));
    if (inp.err) return fail(2, "malformed", `fix record: the input ${inp.err}`, { field: "body" });
    const run = hostRun(deps, claudeDir);
    if (run.inflight === "in-flight")
      return fail(1, "in-flight", `fix record: a dispatch is in flight in ${run.host.run} (${run.pending} open) — nothing was written. Record after its return.`, { host: run.host.run, pending: run.pending });
    const b = Object.assign({}, inp.value);
    if (!b.fix_run && run.host) b.fix_run = run.host.run;
    const t = toObservation(b, now);
    if (t.err) return fail(2, "malformed", `fix record: field \`${t.field}\` ${t.err}`, { field: t.field });
    const n = G.normalizeObservation(t.body, now);
    if (n.err) return fail(2, "malformed", `fix record: field \`${n.field}\` ${n.err}`, { field: n.field });
    const root = deps.repoRootOf(claudeDir);
    let introducedMs = NaN;
    if (n.o.commit) {
      const r = git(root, ["show", "-s", "--format=%ct", n.o.commit]);
      if (r.ok && /^\d+/.test(r.out.trim())) introducedMs = Number(r.out.trim()) * 1000;
    }
    const o = G.applyMiss(claudeDir, n.o, introducedMs);
    const store = G.makeStore(claudeDir, deps);
    const led = store.load();
    const { recorded, changes } = G.recordObservations(store, led, [o], now);
    const rec = recorded[0] ? recorded[0].o : o;
    const id = "F-" + rec.obs.slice(0, 8);
    const where = rec.path ? `${rec.path}${rec.lines && rec.lines.length ? ":" + rec.lines.join("-") : ""}` : "-";
    const what = rec.rule ? rec.rule.replace(/^sonar:/, "") : rec.sig || "";
    // DE-14 — ONE `FIX` line in the HOST run's trace. Appended only; `.current`
    // is read, never written. Best effort: a trace that cannot be written never
    // takes the record down with it.
    let traceLine = null;
    if (run.host) {
      const head = `FIX source=${b.source} introduced_by=${rec.introduced_by} by=${rec.class_by || "evidence"} obs=${rec.obs.slice(0, 8)}${rec.miss ? ` missed_by=${rec.missed_by}` : ""}`;
      const line = `[${stamp(new Date(now))}] ${"cli".padEnd(8)} ${head} :: ${where}${what ? " " + oneLine(what).slice(0, 80) : ""}`;
      try {
        fs.appendFileSync(run.host.path, line + "\n");
        traceLine = line;
      } catch (_) {}
    }
    const who = rec.introduced_by === "orc" ? `ORC${rec.run ? ` (${rec.run})` : ""}` : rec.introduced_by === "ai" ? "AI-written code" : rec.introduced_by;
    const lineOut = `recorded ${id} · ${b.source}${what ? " " + oneLine(what).slice(0, 60) : ""} · introduced by ${who}${rec.miss ? ` · missed by review ${rec.missed_by}` : ""} · the next review sees it`;
    return out(
      { ok: true, id, obs: rec.obs, observation: rec, miss: !!rec.miss, missed_by: rec.missed_by || null, host: run.host ? run.host.run : null, trace_line: traceLine, promoted: changes.promoted, bumped: changes.bumped, line: lineOut },
      0,
      () => console.log(lineOut)
    );
  }

  if (sub === "list") {
    const w = Number(valueOf("--window"));
    const windowDays = Number.isInteger(w) && w > 0 ? w : G.WINDOW_DAYS;
    const obs = G.makeStore(claudeDir, deps).readObs();
    const list = G.fixesIn(obs, windowDays, now).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const rows = list.map((o) => ({ id: "F-" + o.obs.slice(0, 8), at: o.at, source: o.source, introduced_by: o.introduced_by || null, path: o.path, lines: o.lines, rule: o.rule, outcome: o.outcome, miss: !!o.miss, missed_by: o.missed_by || null, fix_run: o.fix_run || null, via: o.via || null, line: G.fixLine(o, 1) }));
    return out({ ok: true, window_days: windowDays, count: rows.length, fixes: rows }, rows.length ? 0 : 1, () => {
      if (!rows.length) console.log(`no fix records in ${windowDays} days`);
      for (const r of rows) console.log(`  ${r.id} · ${r.at} · ${r.line}`);
    });
  }

  return fail(sub ? 2 : 1, "usage", USAGE);
}

module.exports = { fixCmd, classify, toObservation, hostRun, SOURCES, USAGE };
