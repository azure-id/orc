"use strict";
// ── orc graph — THE GAIN METER (v1.8.2 W4b) ─────────────────────────────────
//
// The question this answers is the user's: can ORC show what the graph saves,
// the way `rtk gain` does? Yes — but only while it keeps apart the two halves
// EW8 taught us to keep apart, and only while it refuses the one number that
// would make it lie.
//
//   PAID      the tokens the graph PUT INTO a context — every card, every
//             `--source` block, every hook hint. RECORDED, exact, counted with
//             the same `tok()` the budget uses.
//   AVOIDED   what the read ladder would have cost for the same question had
//             there been no graph. AN ESTIMATE. A counterfactual. `rtk gain`
//             can print one number because a filtered command output has one
//             exact raw size; the alternative to `ctx OrderService.create` is a
//             Grep and then a read, and how much read is a guess.
//   MEASURED  what runs with the graph ON actually did against runs with it
//             OFF, in this project's own history. RECORDED, joined from ORC's
//             traces and Claude Code's usage transcripts.
//
// So the meter prints AVOIDED AS A RANGE, NEVER AS ONE NUMBER (DE-L), and it
// NEVER prints a percent of the session: EW8 §1 measured that percent at a
// tenth of one percent, and printing it would make the meter lie by omission.
//
// K6 — what this file must never do:
//   · never print a percent of the session (the only percent is the MEASURED
//     executor-window delta, with N and the spread beside it)
//   · never count a hook coverage note as avoided anything — it adds, it saves
//     nothing, and it is listed as paid only
//   · never count a card the agent's return marked `graph_used: none`
//   · never block a read: the ledger is appended AFTER the answer is out, and a
//     failed append is silent

const fs = require("fs");
const path = require("path");
const G = require("./graph.js");

const LEDGER_MAX = 5000;
const tok = (s) => Math.ceil(String(s).length / 4);

// A Grep line in an agent's tool result: the path, the line number and the
// matched line. W9's transcripts put it at ~120 characters.
const GREP_LINE_CHARS = 120;
// The read ladder's step 3. The card names a range; a careful agent reads it.
const RANGE_LINES = 80;
// Step 2: the declarations of a file a reader is orienting in.
const OUTLINE_LINES = 60;

function ledgerPath(claudeDir) {
  return path.join(G.graphPaths(claudeDir).dir, "gain.jsonl");
}

// ── the counterfactual (K2) ─────────────────────────────────────────────────
// The rules are written down HERE, in one place, so the number can be checked
// by hand. `low` is the floor a careful agent would have spent. `high` is what
// W9 actually measured agents doing — 1,077 whole-file reads against 139
// searches. The truth is between, and the meter says so on its last line.

// A file's whole cost, and the cost of N of its lines, from the bytes and the
// line count the extractor already recorded. No file is opened to price it.
function fileCost(model, rel) {
  const f = (model && model.byFile && model.byFile[rel]) || {};
  const bytes = Number(f.bytes) || 0;
  const lines = Number(f.lines) || 0;
  return {
    path: rel,
    tokens: Math.ceil(bytes / 4),
    lines,
    perLine: lines > 0 ? bytes / lines : 40,
  };
}

const rangeTokens = (c, n) => Math.ceil(Math.min(c.lines || n, n) * c.perLine / 4);
// A null `hits` means the basis is UNKNOWN (the sharded read path, W8), not
// zero. It contributes nothing to the estimate and `orc graph gain` counts the
// rows it could not size, so a shrinking estimate is never mistaken for a
// shrinking saving.
const grepTokens = (hits) => (hits == null ? 0 : Math.ceil(Math.max(0, hits) * GREP_LINE_CHARS / 4));

// `ctx <symbol>`: one Grep for the name, then a read. Done well that read is
// the 80 lines the card named; done badly it is the whole target file AND the
// whole file of one caller — the one W9 saw agents open to "check".
function ctxSymbol(model, sym, hits, callerFiles) {
  const target = fileCost(model, sym.file);
  const others = (callerFiles || []).map((rel) => fileCost(model, rel)).sort((a, b) => b.tokens - a.tokens);
  const grep = grepTokens(hits);
  const low = grep + rangeTokens(target, RANGE_LINES);
  const high = grep + target.tokens + (others[0] ? others[0].tokens : 0);
  return {
    avoided: { low, high, calls_low: 2, calls_high: others[0] ? 3 : 2 },
    basis: { files: [target, ...others.slice(0, 1)].map(strip), grep_hits: hits },
  };
}

// `ctx <file>`: an outline read done well, the whole file done badly.
function ctxFile(model, rel) {
  const c = fileCost(model, rel);
  return {
    avoided: { low: rangeTokens(c, OUTLINE_LINES), high: c.tokens, calls_low: 1, calls_high: 1 },
    basis: { files: [strip(c)], grep_hits: 0 },
  };
}

// `--source` is the ONE half of this file that is not an estimate: it printed
// exactly the lines a range read would have returned, from the same file.
function sourceAvoided(model, rel, from, to) {
  const c = fileCost(model, rel);
  const n = Math.max(0, (Number(to) || 0) - (Number(from) || 0) + 1);
  const t = Math.ceil(n * c.perLine / 4);
  return { low: t, high: t, calls_low: 1, calls_high: 1 };
}

// `impact`: one Grep per exported symbol done well; the Greps plus a whole-file
// read of every caller file done badly.
function impactCost(model, files, symbolCount, hits, callerFiles) {
  const grep = grepTokens(hits);
  const others = [...new Set(callerFiles || [])].map((rel) => fileCost(model, rel));
  const n = Math.max(1, symbolCount || 1);
  return {
    avoided: {
      low: grep,
      high: grep + others.reduce((a, c) => a + c.tokens, 0),
      calls_low: n,
      calls_high: n + others.length,
    },
    basis: { files: others.slice(0, 5).map(strip), grep_hits: hits },
  };
}

// `path a b`: two Greps and two reads, range or whole.
function pathCost(model, aRel, bRel, hits) {
  const a = fileCost(model, aRel);
  const b = fileCost(model, bRel);
  const grep = grepTokens(hits);
  return {
    avoided: {
      low: grep + rangeTokens(a, RANGE_LINES) + rangeTokens(b, RANGE_LINES),
      high: grep + a.tokens + b.tokens,
      calls_low: 4,
      calls_high: 4,
    },
    basis: { files: [strip(a), strip(b)], grep_hits: hits },
  };
}

// D4 (v1.8.2 W7) `map`: the ORIENTATION sweep it replaces — a Glob over the
// tree, then reads of the few files the planner picked out of the listing.
// Done well those are outline reads of the top three; done badly they are
// whole-file reads of the top five, which is what the planning window shows.
//
// The Glob itself is priced at ZERO. Its real size depends on a pattern the
// graph cannot know, and a meter that guesses high about its own value is a
// meter nobody should believe. Only the reads count.
const MAP_LOW_FILES = 3;
const MAP_HIGH_FILES = 5;
function mapCost(model, shownFiles) {
  const cs = (shownFiles || []).map((rel) => fileCost(model, rel));
  const low = cs.slice(0, MAP_LOW_FILES).reduce((a, c) => a + rangeTokens(c, OUTLINE_LINES), 0);
  const high = cs.slice(0, MAP_HIGH_FILES).reduce((a, c) => a + c.tokens, 0);
  return {
    avoided: {
      low,
      high,
      calls_low: 1 + Math.min(MAP_LOW_FILES, cs.length),
      calls_high: 1 + Math.min(MAP_HIGH_FILES, cs.length),
    },
    basis: { files: cs.slice(0, 5).map(strip), grep_hits: 0 },
  };
}

// `changes`: the reviewer already reads the diff, so that half is zero.
function changesCost(model, symbolCount, hits, callerFiles) {
  return impactCost(model, null, symbolCount, hits, callerFiles);
}

// A PreToolUse hint saves NOTHING when the ladder is done well — the search
// still runs. Done badly it saved the range read the anchor pointed at.
function hintAvoided(model, rel) {
  const c = rel ? fileCost(model, rel) : { lines: 0, perLine: 40 };
  return { low: 0, high: rangeTokens(c, RANGE_LINES), calls_low: 0, calls_high: 1 };
}

const strip = (c) => ({ path: c.path, tokens: c.tokens, lines: c.lines });

// ── the ledger (K1) ─────────────────────────────────────────────────────────
// Append-only, torn-line tolerant, never under the lock. A reader stays
// lock-free, and one `appendFileSync` of one line is atomic enough on both
// platforms — a torn line is skipped exactly as `notes.jsonl`'s is.
function append(claudeDir, row) {
  try {
    const dir = G.graphPaths(claudeDir).dir;
    if (!fs.existsSync(dir)) return false;
    fs.appendFileSync(ledgerPath(claudeDir), JSON.stringify(row) + "\n");
    return true;
  } catch (_) {
    return false; // a meter that can break a read is worse than no meter
  }
}

function readLedger(claudeDir) {
  let text;
  try {
    text = fs.readFileSync(ledgerPath(claudeDir), "utf8");
  } catch (_) {
    return null;
  }
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r.cmd === "string" && r.paid && r.avoided) rows.push(r);
    } catch (_) {
      // a torn last line from a crash mid-append
    }
  }
  return rows;
}

// Called by `graphGc` while it already holds the lock.
function compact(p, atomicWrite) {
  let text;
  try {
    text = fs.readFileSync(path.join(p.dir, "gain.jsonl"), "utf8");
  } catch (_) {
    return { kept: 0, removed: 0 };
  }
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length <= LEDGER_MAX) return { kept: lines.length, removed: 0 };
  const keep = lines.slice(-LEDGER_MAX);
  atomicWrite(path.join(p.dir, "gain.jsonl"), keep.join("\n") + "\n");
  return { kept: keep.length, removed: lines.length - keep.length };
}

// ── aggregation (K3) ────────────────────────────────────────────────────────
function parseSince(spec) {
  const m = /^(\d+)([dhw])$/.exec(String(spec || ""));
  if (!m) return null;
  const n = Number(m[1]);
  const ms = m[2] === "h" ? 3600e3 : m[2] === "w" ? 7 * 864e5 : 864e5;
  return Date.now() - n * ms;
}

// The ledger stamp is ORC's own `DD-MM-YYYY HH:MM:SS` — what `graph.stamp()`
// writes, and the format every ORC artifact uses. The trace's own
// `DDMMYY HH:MM:SS.mmm` is accepted too, so a row written by the hook parses
// whichever shape it carries. Parsed here and nowhere else.
function stampMs(at) {
  const s = String(at || "");
  const d = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (d) return new Date(Number(d[3]), Number(d[2]) - 1, Number(d[1]), Number(d[4]), Number(d[5]), Number(d[6])).getTime();
  const t = /^(\d{2})(\d{2})(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (t) return new Date(2000 + Number(t[3]), Number(t[2]) - 1, Number(t[1]), Number(t[4]), Number(t[5]), Number(t[6])).getTime();
  return null;
}

function gain(claudeDir, opts) {
  const o = opts || {};
  const all = readLedger(claudeDir);
  if (!all) return { ok: false, state: "none", reason: "no-ledger", exit: 1 };
  const sinceMs = parseSince(o.since);
  let rows = all;
  if (o.run) rows = rows.filter((r) => r.run === o.run);
  if (sinceMs != null) rows = rows.filter((r) => {
    const t = stampMs(r.at);
    return t == null || t >= sinceMs;
  });
  if (!rows.length) return { ok: false, state: "none", reason: o.run ? "no-rows-for-run" : "no-rows", exit: 1 };

  const paid = { card: 0, source: 0, hints: 0 };
  const avoided = { low: 0, high: 0 };
  const calls = { low: 0, high: 0 };
  const byCommand = {};
  const hints = { injected: 0, read_notes: 0, updates: 0 };
  // W8: rows the sharded read path could not size. Their estimate omits the
  // search term, so a FALLING estimate can be told apart from a falling saving.
  let unsized = 0;
  const gens = [];
  const runs = new Set();
  for (const r of rows) {
    // K6: a card the agent said it did not use is not a saving.
    const used = r.used !== false;
    paid.card += Number(r.paid.card) || 0;
    paid.source += Number(r.paid.source) || 0;
    paid.hints += Number(r.paid.hints) || 0;
    if (used) {
      avoided.low += Number(r.avoided.low) || 0;
      avoided.high += Number(r.avoided.high) || 0;
      calls.low += Number(r.avoided.calls_low) || 0;
      calls.high += Number(r.avoided.calls_high) || 0;
    }
    if (r.basis && r.basis.grep_hits === null) unsized++;
    byCommand[r.cmd] = (byCommand[r.cmd] || 0) + 1;
    if (r.cmd === "hint") hints.injected++;
    if (r.cmd === "read-note") hints.read_notes++;
    if (r.cmd === "hook-update") hints.updates++;
    if (r.gen) gens.push(Number(r.gen));
    if (r.run) runs.add(r.run);
  }
  const paidTotal = paid.card + paid.source + paid.hints;
  gens.sort((a, b) => a - b);
  return {
    ok: true,
    state: "rows",
    scope: o.run ? "run" : o.since ? "since" : "project",
    run: o.run || null,
    since: o.since || null,
    calls_recorded: rows.length,
    runs: runs.size,
    generation_range: gens.length ? [gens[0], gens[gens.length - 1]] : null,
    paid: { ...paid, total: paidTotal },
    avoided,
    calls,
    net: { low: avoided.low - paidTotal, high: avoided.high - paidTotal },
    by_command: byCommand,
    hints,
    unsized,
    estimate: true,
    carry_note: "a card is re-sent on every later turn of the agent that received it — and so is the read it replaced. Both halves carry the same multiplier, so these are FIRST-ENTRY tokens on both sides (eval/graph-replay.js).",
    exit: 0,
  };
}

function history(claudeDir, opts) {
  const o = opts || {};
  const all = readLedger(claudeDir);
  if (!all) return { ok: false, state: "none", reason: "no-ledger", exit: 1 };
  const limit = Math.max(1, Math.min(500, Number(o.limit) || 40));
  const rows = all.slice(-limit).reverse();
  if (!rows.length) return { ok: false, state: "none", reason: "no-rows", exit: 1 };
  return { ok: true, state: "rows", total: all.length, rows, estimate: true, exit: 0 };
}

function reset(claudeDir) {
  try {
    fs.rmSync(ledgerPath(claudeDir), { force: true });
    return { ok: true, state: "reset", exit: 0 };
  } catch (e) {
    return { ok: false, state: "unavailable", reason: String((e && e.message) || e), exit: 1 };
  }
}

// ── K4 — the recorded A/B, and the arithmetic that keeps it honest ───────
// It needs at least this many runs in EACH group before it prints a median.
// Below it, the rows are printed and the comparison is not.
const MEASURED_MIN_RUNS = 3;

function median(xs) {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

// A median alone is a claim. A median with its N and its spread is a finding.
function summarise(xs) {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y);
  return { n: a.length, median: median(a), min: a[0], max: a[a.length - 1] };
}

// The OFF group's own spread, as a percent of its median. Any ON/OFF delta
// smaller than this is INSIDE THE NOISE and must be reported as such — W9
// round 2 read a −1.8% session total as a result, and it was not one.
function spreadPct(s) {
  if (!s || !s.median) return null;
  return Math.round((100 * (s.max - s.min)) / s.median);
}

function deltaPct(on, off) {
  if (!on || !off || !off.median) return null;
  return Math.round((100 * (on.median - off.median)) / off.median);
}

module.exports = {
  MEASURED_MIN_RUNS,
  median,
  summarise,
  spreadPct,
  deltaPct,
  LEDGER_MAX,
  GREP_LINE_CHARS,
  RANGE_LINES,
  OUTLINE_LINES,
  tok,
  ledgerPath,
  fileCost,
  ctxSymbol,
  ctxFile,
  sourceAvoided,
  impactCost,
  pathCost,
  changesCost,
  mapCost,
  hintAvoided,
  append,
  readLedger,
  compact,
  gain,
  history,
  reset,
  stampMs,
  parseSince,
};
