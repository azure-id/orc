"use strict";
// ── `orc clear logs` (v2.1.0 W7, 06-clear-logs-spec) ─────────────────────────
//
//   orc clear logs [--older-than 30|60|90|120|240|360] [--apply] [--json]
//                  [--include-default-dir]
//   orc clear logs --summary [--json]       the Maintenance row: no scan at all
//
// PRINT-ONLY by default (DE-16, the `orc undo` rule): it lists every file it
// would delete, every file it keeps and why, and the totals. Only `--apply`
// deletes. `--older-than` defaults to `log_retention_days` (90); any other
// value exits 2 and names the allowed set.
//
// WHAT IT DELETES (class a), and nothing else:
//   - a finished trace set in log_dir: the `.txt`, its `.txt.jsonl` (or old
//     `.jsonl`) twin, its `.pending.json` and its `.graph-hook.json` — ONE unit;
//   - leftovers in log_dir: `.superseded`, `.new`, a stray `*checkpoint.md`, a
//     sidecar whose `.txt` is gone — each on its own;
//   - a finished run folder (done or closed) in run_dir, WITH its git ref
//     `refs/orc/runs/<slug>/pre` (DE-18 a: a folder without its ref, or a ref
//     without its folder, is the orphan state).
// Only the TOP level of log_dir is read. A sub-folder (`retro/`,
// `extra-journal/`, `graph/`) is never entered.
//
// WHAT IT NEVER DELETES: user data (class b — the NEVER set below), in-flight
// state (`.current`, the trace it names and its sidecars, any file changed in
// the last 6 hours, a waiting run, a run with `wait.json`), a trace with an ASK
// line younger than HABIT_RULE.max_age_days, and anything younger than
// `aftermath_window_days` (the cutoff moves to that window and says so).
//
// DATING. The LAST activity of the run: the newest `[DDMMYY HH:MM:SS]` line
// stamp in the `.txt`, else the stamp in the file name (the run START), else
// the file mtime. A copied folder gets a new mtime, so the mtime is the LAST
// resort. A run folder: its newest file mtime (or `snapshot.taken_ms`).
//
// THE NUMBERS SURVIVE (DE-19 a). Before `--apply` deletes a trace in log_dir,
// its `orc stats` counts go into `.claude/orc/logs-rollup.json` (class b,
// never deleted, never in the install manifest), per lane and month. A delete
// that then fails takes its counts back out. `orc stats` reads both.
//
// THE SWEEP (DE-20 a). `log_retention_auto: on` → `orc trace write` calls
// `sweep()` after a FINISH packet: the same prune with `--apply`, at most once
// per 24 hours, `last_sweep` written into the rollup. It never throws, never
// blocks and never changes the exit code. Off → one config lookup, no scan.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DAY = 86400000;
const YOUNG_MS = 6 * 60 * 60 * 1000; // orc-trace.js STALE_MS: a run may still write to it
const DEFAULT_DAYS = 90;
const DEFAULT_REL = path.join(".claude", "orc", "logs");
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/;
const REF_ROOT = "refs/orc/runs";
const STAMP_RE = /^\[(\d{2})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\]/gm;
const NAME_STAMP_RE = /-(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?=\.)/;
const READ_MAX = 16 * 1024 * 1024; // a bigger file is dated by its name or mtime

// Class b — user data. Never deleted at any age, whatever folder it sits in.
const NEVER = new Set([
  "habits-state.json",
  "habits-cache.json",
  "observations.jsonl",
  "gotchas-sync.json",
  "extra-spend.jsonl",
  "budget-rates.json",
  "logs-rollup.json",
]);
// Class c — in-flight state.
const IN_FLIGHT = new Set([".current", "wait.json", "extra-inflight.json", "ui.lock", ".lock"]);
const DIR_REASON = {
  retro: "retro/ holds /orc-retro reports (deliverables) — never touched",
  "extra-journal": "extra-journal/ has its own 30-day sweep — never touched",
  graph: "graph/ — gain.jsonl is capped by `orc graph gc` — never touched",
};

const posix = (p) => String(p || "").split(path.sep).join("/");
const pad = (n) => String(n).padStart(2, "0");
function localIso(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const localDate = (ms) => localIso(ms).slice(0, 10);
function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
const stampMs = (dd, mm, yy, h, mi, s) => new Date(2000 + +yy, +mm - 1, +dd, +h, +mi, +s).getTime();

function lstat(p) {
  try {
    return fs.lstatSync(p);
  } catch (_) {
    return null;
  }
}

function habitMaxAge() {
  try {
    const n = Number(require("./habit.js").HABIT_RULE.max_age_days);
    return n > 0 ? n : 180;
  } catch (_) {
    return 180;
  }
}

function cfgMap(claudeDir, deps) {
  try {
    return deps.readOverride(claudeDir).map || {};
  } catch (_) {
    return {};
  }
}

const rollupPath = (claudeDir) => path.join(claudeDir, "orc", "logs-rollup.json");
function readRollup(claudeDir) {
  try {
    const j = JSON.parse(fs.readFileSync(rollupPath(claudeDir), "utf8"));
    return j && typeof j === "object" ? j : null;
  } catch (_) {
    return null;
  }
}
function writeRollup(claudeDir, r) {
  const file = rollupPath(claudeDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(r, null, 2) + "\n");
  fs.renameSync(tmp, file);
}
function rollupAdd(r, c, sign) {
  r.buckets = r.buckets || {};
  const month = String(c.date).slice(0, 7);
  const key = `${c.lane}|${month}`;
  const b = (r.buckets[key] = r.buckets[key] || { lane: c.lane, month, runs: 0, from: null, to: null, dispatches: 0, downgrades: 0, unfinished: 0, agents: {} });
  b.runs += sign;
  b.dispatches += sign * (Number(c.dispatches) || 0);
  b.downgrades += sign * (Number(c.downgrades) || 0);
  b.unfinished += sign * (Number(c.unfinished) || 0);
  for (const [a, n] of Object.entries(c.agents || {})) {
    b.agents[a] = (b.agents[a] || 0) + sign * (Number(n) || 0);
    if (!b.agents[a]) delete b.agents[a];
  }
  if (sign > 0) {
    if (!b.from || c.date < b.from) b.from = c.date;
    if (!b.to || c.date > b.to) b.to = c.date;
  }
  if (b.runs <= 0) delete r.buckets[key];
}
const prunedRuns = (r) => Object.values((r && r.buckets) || {}).reduce((n, b) => n + (Number(b.runs) || 0), 0);

// The --older-than value: the flag, else the config, else 90. A bad FLAG is
// an error (exit 2); a bad hand-edited config value falls back to 90.
function pickDays(claudeDir, deps, raw) {
  const allowed = deps.LOG_RETENTION_DAYS;
  if (raw !== undefined) {
    const n = Number(raw);
    if (raw === true || !allowed.includes(n)) return { error: `--older-than must be one of: ${allowed.join(" | ")} (days).` };
    return { days: n };
  }
  const n = Number(cfgMap(claudeDir, deps).log_retention_days);
  return { days: allowed.includes(n) ? n : DEFAULT_DAYS };
}

// One file's last activity: the newest line stamp, else the name stamp, else mtime.
function dateFile(full, name, st) {
  if (st && st.isFile() && st.size > 0 && st.size <= READ_MAX && /\.(txt|superseded|new)$/.test(name)) {
    let text = "";
    try {
      text = fs.readFileSync(full, "utf8");
    } catch (_) {}
    let best = null;
    for (const m of text.matchAll(STAMP_RE)) {
      const ms = stampMs(m[1], m[2], m[3], m[4], m[5], m[6]);
      if (!isNaN(ms) && (best === null || ms > best)) best = ms;
    }
    if (best !== null) return { ms: best, by: "line stamp", text };
    const n = NAME_STAMP_RE.exec(name);
    if (n) return { ms: stampMs(n[1], n[2], n[3], n[4], n[5], n[6]), by: "name stamp", text };
    return { ms: st.mtimeMs, by: "mtime", text };
  }
  const n = NAME_STAMP_RE.exec(name);
  if (n) return { ms: stampMs(n[1], n[2], n[3], n[4], n[5], n[6]), by: "name stamp", text: "" };
  return { ms: st ? st.mtimeMs : 0, by: "mtime", text: "" };
}

function listRefs(root) {
  const r = spawnSync("git", ["for-each-ref", "--format=%(refname)", REF_ROOT], { cwd: root, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) return null;
  return new Set(String(r.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean));
}

// Scan one log folder. `counts` = true only for the configured log_dir: the
// default folder is a folder `orc stats` never reads, so it adds no rollup.
function scanLogDir(dir, ctx, counts) {
  const out = { units: [], keep: [] };
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return out;
  }
  const rel = (n) => posix(path.relative(ctx.root, path.join(dir, n)));
  let ptr = null;
  try {
    ptr = fs.readFileSync(path.join(dir, ".current"), "utf8").trim() || null;
  } catch (_) {}
  const ptrBase = ptr ? path.basename(ptr).replace(/\.txt$/, "") : null;
  const claimed = new Set();
  const stats = new Map();
  for (const n of names) stats.set(n, lstat(path.join(dir, n)));

  const judge = (unit, lead) => {
    // lead = the name the unit is dated by and listed under.
    const st = stats.get(lead);
    const d = dateFile(path.join(dir, lead), lead, st);
    unit.last_ms = d.ms;
    unit.dated_by = d.by;
    unit.path = rel(lead);
    let newestMtime = 0;
    for (const f of unit.names) newestMtime = Math.max(newestMtime, (stats.get(f) || { mtimeMs: 0 }).mtimeMs);
    const keep = (reason) => {
      for (const f of unit.names) out.keep.push({ path: rel(f), reason });
    };
    if (ptrBase && lead.startsWith(ptrBase)) return keep("the active run — `.current` names it");
    if (ctx.now - newestMtime < YOUNG_MS) return keep("changed less than 6 hours ago — a run may still write to it");
    if (unit.kind === "trace" && d.text && /(?:^|\s)ASK\s/m.test(d.text) && d.ms >= ctx.now - ctx.habitDays * DAY)
      return keep(`holds habit answers (younger than ${ctx.habitDays} days)`);
    if (d.ms >= ctx.cutoffMs) return keep(`younger than ${ctx.effective} days (last activity ${localIso(d.ms)})`);
    unit.bytes = unit.names.reduce((s, f) => s + ((stats.get(f) || { size: 0 }).size || 0), 0);
    unit.files = unit.names.map(rel);
    unit.abs = unit.names.map((f) => path.join(dir, f));
    if (counts && unit.kind === "trace") unit.counts = ctx.deps.traceCountsOf(dir, lead);
    out.units.push(unit);
  };

  // 1. The trace sets.
  for (const n of names) {
    const st = stats.get(n);
    if (!st || !st.isFile() || !ctx.deps.traceNameInfo(n)) continue;
    const base = n.replace(/\.txt$/, "");
    const members = [n, n + ".jsonl", base + ".jsonl", n + ".pending.json", base + ".graph-hook.json"].filter(
      (f, i, a) => a.indexOf(f) === i && stats.get(f) && stats.get(f).isFile()
    );
    members.forEach((f) => claimed.add(f));
    judge({ kind: "trace", names: members }, n);
  }

  // 2. Everything else at the top level.
  for (const n of names) {
    if (claimed.has(n)) continue;
    const st = stats.get(n);
    if (!st) continue;
    if (st.isSymbolicLink()) {
      out.keep.push({ path: rel(n), reason: "a link — never followed, never touched" });
      continue;
    }
    if (st.isDirectory()) {
      out.keep.push({ path: rel(n) + "/", reason: DIR_REASON[n] || "a folder — never touched" });
      continue;
    }
    if (NEVER.has(n)) {
      out.keep.push({ path: rel(n), reason: "user data — never deleted" });
      continue;
    }
    if (n === ".current") {
      out.keep.push({ path: rel(n), reason: "the active-run pointer — never touched" });
      continue;
    }
    if (IN_FLIGHT.has(n) || /\.lock$/.test(n)) {
      out.keep.push({ path: rel(n), reason: "in-flight state — never touched" });
      continue;
    }
    const sidecar = /^run-.+\.(txt\.jsonl|txt\.pending\.json|jsonl|graph-hook\.json)$/.test(n);
    if (sidecar || /\.(superseded|new)$/.test(n) || /checkpoint\.md$/.test(n)) {
      judge({ kind: "leftover", names: [n] }, n);
      continue;
    }
    out.keep.push({ path: rel(n), reason: "not an ORC trace file — never touched" });
  }
  return out;
}

function walkFiles(dir, acc) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    const st = lstat(p);
    if (!st) continue;
    if (st.isDirectory()) walkFiles(p, acc);
    else acc.push({ path: p, size: st.size, mtime: st.mtimeMs });
  }
  return acc;
}

function scanRunDir(dir, ctx) {
  const out = { units: [], keep: [] };
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return out;
  }
  const rel = (n) => posix(path.relative(ctx.root, path.join(dir, n)));
  for (const slug of entries) {
    const full = path.join(dir, slug);
    const st = lstat(full);
    if (!st || slug === ".gitignore") continue;
    if (st.isSymbolicLink()) {
      out.keep.push({ path: rel(slug), reason: "a link — never followed, never touched" });
      continue;
    }
    if (!st.isDirectory()) {
      out.keep.push({ path: rel(slug), reason: "not a run folder — never touched" });
      continue;
    }
    const has = (f) => !!lstat(path.join(full, f));
    const keep = (reason) => out.keep.push({ path: rel(slug) + "/", reason });
    const waiting = has("RESUME.md") && !has("RESUME.closed.md");
    if (waiting) {
      keep("a waiting run (RESUME.md, no RESUME.closed.md) — never touched");
      continue;
    }
    if (has("wait.json")) {
      keep("a wait is armed (wait.json) — never touched");
      continue;
    }
    if (ctx.activeSlugs.has(slug)) {
      keep("the active run — `.current` names its trace");
      continue;
    }
    const files = walkFiles(full, []);
    if (!files.length) {
      keep("an empty folder — not a finished run, never touched");
      continue;
    }
    let last = files.reduce((m, f) => Math.max(m, f.mtime), 0);
    if (ctx.now - last < YOUNG_MS) {
      keep("changed less than 6 hours ago — a run may still write to it");
      continue;
    }
    if (!last) {
      try {
        last = Number(JSON.parse(fs.readFileSync(path.join(full, "snapshot.json"), "utf8")).taken_ms) || 0;
      } catch (_) {}
    }
    if (last >= ctx.cutoffMs) {
      keep(`younger than ${ctx.effective} days (last activity ${localIso(last)})`);
      continue;
    }
    const ref = SLUG_RE.test(slug) && ctx.refs && ctx.refs.has(`${REF_ROOT}/${slug}/pre`) ? `${REF_ROOT}/${slug}/pre` : null;
    out.units.push({
      kind: "run",
      status: has("RESUME.closed.md") ? "closed" : "done",
      path: rel(slug) + "/",
      dir: full,
      last_ms: last,
      dated_by: "mtime",
      bytes: files.reduce((s, f) => s + f.size, 0),
      files: files.map((f) => posix(path.relative(ctx.root, f.path))),
      ref,
    });
  }
  return out;
}

// → the --json object (plus `_units`, removed before it is printed).
function plan(claudeDir, opts, deps) {
  const now = opts.now || Date.now();
  const root = path.dirname(claudeDir);
  const map = cfgMap(claudeDir, deps);
  const days = opts.days;
  const aftermath = Number(map.aftermath_window_days) > 0 ? Number(map.aftermath_window_days) : 30;
  const effective = Math.max(days, aftermath);
  const cutoffMs = now - effective * DAY;
  const logDir = deps.resolveLogDir(claudeDir);
  const runDir = deps.resolveRunDir(claudeDir);
  const defDir = path.join(root, DEFAULT_REL);
  const isDefault = path.resolve(logDir) === path.resolve(defDir);

  // The slugs `.current` names (in every folder this run reads) — their run
  // folders are in flight.
  const activeSlugs = new Set();
  for (const d of [logDir, isDefault ? null : defDir]) {
    if (!d) continue;
    try {
      const p = fs.readFileSync(path.join(d, ".current"), "utf8").trim();
      const info = deps.traceNameInfo(p);
      const m = /^run-[a-z0-9]+-(.+)-\d{6}-\d{6}\.txt$/.exec(p);
      if (info && m) activeSlugs.add(m[1]);
    } catch (_) {}
  }
  let refs = null;
  try {
    if (fs.existsSync(runDir)) refs = listRefs(root);
  } catch (_) {}
  const ctx = { root, now, cutoffMs, effective, habitDays: habitMaxAge(), deps, activeSlugs, refs };

  const units = [];
  const keep = [];
  const a = scanLogDir(logDir, ctx, true);
  units.push(...a.units);
  keep.push(...a.keep);
  let defaultInfo = null;
  if (!isDefault) {
    let files = 0;
    let bytes = 0;
    try {
      for (const n of fs.readdirSync(defDir)) {
        const st = lstat(path.join(defDir, n));
        if (st && st.isFile()) {
          files++;
          bytes += st.size;
        }
      }
    } catch (_) {}
    const included = !!opts.includeDefault;
    if (files || included) defaultInfo = { path: posix(path.relative(root, defDir)), files, bytes, included };
    if (included) {
      const b = scanLogDir(defDir, ctx, false);
      units.push(...b.units);
      keep.push(...b.keep);
    }
  }
  const r = scanRunDir(runDir, ctx);
  units.push(...r.units);
  keep.push(...r.keep);

  const notes = [];
  if (effective > days)
    notes.push(`The cutoff moved from ${days} to ${effective} days: aftermath_window_days is ${aftermath}, and /orc-aftermath grades that window.`);
  if (defaultInfo && !defaultInfo.included)
    notes.push(`The old default folder ${defaultInfo.path} still holds ${defaultInfo.files} file(s) (${fmtBytes(defaultInfo.bytes)}). No reader sees it. Add --include-default-dir to clear it with the same rules.`);

  const del = units.map((u) => ({
    path: u.path,
    kind: u.kind,
    last_activity: localIso(u.last_ms),
    dated_by: u.dated_by,
    bytes: u.bytes,
    files: u.files,
    ...(u.kind === "run" ? { status: u.status, ref: u.ref } : {}),
  }));
  return {
    ok: true,
    applied: false,
    older_than_days: days,
    effective_days: effective,
    cutoff: localDate(cutoffMs),
    cutoff_moved: effective > days ? { from: days, to: effective, reason: "aftermath_window_days" } : null,
    log_dir: posix(path.relative(root, logDir)) || ".",
    run_dir: posix(path.relative(root, runDir)) || ".",
    delete: del,
    keep,
    totals: { units: del.length, files: del.reduce((n, d) => n + d.files.length, 0), bytes: del.reduce((n, d) => n + d.bytes, 0) },
    default_dir: defaultInfo,
    notes,
    _units: units,
  };
}

// Delete what the plan names. The rollup is written FIRST (a delete that then
// fails takes its counts back out), then each unit goes as one.
function apply(claudeDir, p, opts) {
  const root = path.dirname(claudeDir);
  const units = p._units;
  const counted = units.filter((u) => u.counts);
  let rollup = readRollup(claudeDir) || { version: 1, buckets: {} };
  if (counted.length) {
    for (const u of counted) rollupAdd(rollup, u.counts, +1);
    writeRollup(claudeDir, rollup);
  }
  const failed = [];
  let files = 0;
  let bytes = 0;
  const backOut = [];
  for (const u of units) {
    try {
      if (u.kind === "run") {
        fs.rmSync(u.dir, { recursive: true, force: true });
        if (u.ref) {
          const g = spawnSync("git", ["update-ref", "-d", u.ref], { cwd: root, encoding: "utf8", windowsHide: true });
          if (g.status !== 0) failed.push({ path: u.ref, error: String(g.stderr || "git update-ref failed").trim() });
        }
      } else {
        for (const f of u.abs) fs.unlinkSync(f);
      }
      files += u.files.length;
      bytes += u.bytes;
    } catch (e) {
      failed.push({ path: u.path, error: e.code || e.message });
      // A trace whose .txt is still there is still counted live — take the
      // rollup copy back out, or `orc stats` counts it twice.
      if (u.counts && u.abs && fs.existsSync(u.abs[0])) backOut.push(u);
    }
  }
  rollup = readRollup(claudeDir) || rollup;
  for (const u of backOut) rollupAdd(rollup, u.counts, -1);
  const stamp = { date: localDate(opts.now || Date.now()), at: opts.now || Date.now(), files, bytes, older_than_days: p.older_than_days };
  if (opts.sweep) rollup.last_sweep = stamp;
  else if (files) rollup.last_apply = stamp;
  if (backOut.length || opts.sweep || files) writeRollup(claudeDir, rollup);
  return { files, bytes, failed, rollup_runs: counted.length - backOut.length };
}

const publicOf = (p) => {
  const o = Object.assign({}, p);
  delete o._units;
  return o;
};

function printHuman(p, res, flags) {
  const head = res ? "APPLIED" : "PREVIEW — nothing is deleted";
  console.log(`orc clear logs — older than ${p.effective_days} days (cutoff ${p.cutoff}) · ${head}`);
  console.log(`  log_dir  ${p.log_dir}`);
  console.log(`  run_dir  ${p.run_dir}`);
  for (const n of p.notes) console.log(`  ${n}`);
  console.log("");
  if (!p.delete.length) console.log("Nothing is old enough to delete.");
  else {
    console.log(`${res ? "Deleted" : "Would delete"}: ${p.totals.units} unit(s), ${p.totals.files} file(s), ${fmtBytes(p.totals.bytes)}`);
    for (const d of p.delete) {
      console.log(`  ${d.kind.padEnd(8)} ${d.last_activity.replace("T", " ").slice(0, 16)}  ${fmtBytes(d.bytes).padStart(9)}  ${d.path}`);
      for (const f of d.files) if (f !== d.path) console.log(`  ${"".padEnd(37)}  ${f}`);
      if (d.ref) console.log(`  ${"".padEnd(37)}  git ref ${d.ref}`);
    }
  }
  if (p.keep.length) {
    console.log(`\nKept: ${p.keep.length}`);
    for (const k of p.keep) console.log(`  ${k.path} — ${k.reason}`);
  }
  console.log("");
  if (res) {
    console.log(`Deleted ${res.files} file(s), ${fmtBytes(res.bytes)}. ${res.rollup_runs} pruned run(s) still count in \`orc stats\` (logs-rollup.json).`);
    for (const f of res.failed) console.log(`  could not delete ${f.path}: ${f.error}`);
  } else if (p.delete.length) {
    const extra = (flags.olderThan !== undefined ? ` --older-than ${p.older_than_days}` : "") + (flags.includeDefault ? " --include-default-dir" : "");
    console.log(`Nothing was deleted. Run \`orc clear logs --apply${extra}\` to delete these ${p.totals.files} file(s).`);
  }
}

function summary(claudeDir, deps) {
  const map = cfgMap(claudeDir, deps);
  const n = Number(map.log_retention_days);
  const r = readRollup(claudeDir);
  return {
    ok: true,
    older_than_days: deps.LOG_RETENTION_DAYS.includes(n) ? n : DEFAULT_DAYS,
    auto: String(map.log_retention_auto || "off") === "on" ? "on" : "off",
    last_sweep: (r && r.last_sweep) || null,
    last_apply: (r && r.last_apply) || null,
    pruned_runs: prunedRuns(r),
    rollup: posix(path.relative(path.dirname(claudeDir), rollupPath(claudeDir))),
  };
}

// deps: { flag, positionals, wantsJson, emitJson, resolveClaudeDir, resolveLogDir,
//         resolveRunDir, readOverride, traceNameInfo, traceCountsOf, LOG_RETENTION_DAYS }
function clearCmd(deps) {
  const json = deps.wantsJson();
  const pos = deps.positionals();
  const fail = (code, reason, message) => {
    if (json) return deps.emitJson({ ok: false, reason, message }, code);
    console.error(message);
    process.exit(code);
  };
  if (pos[1] !== "logs")
    return fail(1, "usage", "usage: orc clear logs [--older-than 30|60|90|120|240|360] [--apply] [--json] [--include-default-dir]");
  const claudeDir = deps.resolveClaudeDir();
  if (deps.flag("--summary") === true) {
    const s = summary(claudeDir, deps);
    if (json) return deps.emitJson(s, 0);
    console.log(`older than ${s.older_than_days} days · automatic sweep ${s.auto} · last sweep ${s.last_sweep ? `${s.last_sweep.date}, ${s.last_sweep.files} file(s)` : "never"} · ${s.pruned_runs} pruned run(s) in ${s.rollup}`);
    return;
  }
  const olderThan = deps.flag("--older-than");
  const pick = pickDays(claudeDir, deps, olderThan);
  if (pick.error) return fail(2, "bad-older-than", pick.error);
  const includeDefault = deps.flag("--include-default-dir") === true;
  const p = plan(claudeDir, { days: pick.days, includeDefault }, deps);
  let res = null;
  if (deps.flag("--apply") === true) {
    res = apply(claudeDir, p, {});
    p.applied = true;
    p.ok = !res.failed.length;
    p.deleted = { files: res.files, bytes: res.bytes };
    p.failed = res.failed;
    p.rollup = { path: summary(claudeDir, deps).rollup, runs_added: res.rollup_runs };
  }
  const code = res && res.failed.length ? 1 : 0;
  if (json) return deps.emitJson(publicOf(p), code);
  printHuman(p, res, { olderThan, includeDefault });
  if (code) process.exit(code);
}

// The FINISH sweep. Returns null when it did not run (off, inside 24 h, or any
// error) — it never throws into `orc trace write`.
function sweep(claudeDir, deps, now) {
  try {
    const map = cfgMap(claudeDir, deps);
    if (String(map.log_retention_auto || "off") !== "on") return null;
    now = now || Date.now();
    const r = readRollup(claudeDir);
    if (r && r.last_sweep && Number(r.last_sweep.at) > 0 && now - Number(r.last_sweep.at) < DAY) return null;
    const pick = pickDays(claudeDir, deps, undefined);
    const p = plan(claudeDir, { days: pick.days, now }, deps);
    const res = apply(claudeDir, p, { sweep: true, now });
    return { ran: true, older_than_days: p.effective_days, files: res.files, bytes: res.bytes, failed: res.failed.length, line: `logs: the automatic sweep (log_retention_auto: on) deleted ${res.files} file(s), ${fmtBytes(res.bytes)}, older than ${p.effective_days} days. The next sweep runs after 24 hours.` };
  } catch (_) {
    return null;
  }
}

module.exports = { clearCmd, plan, apply, sweep, summary, NEVER, DEFAULT_DAYS };
