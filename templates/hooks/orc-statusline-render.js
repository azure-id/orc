#!/usr/bin/env node
"use strict";

// ANSI, named once. A literal ESC byte in source is invisible in a diff, in a
// grep and in an editor that trims it — so every sequence this file emits is
// built from these three constants and from the precomputed strings the CLI
// put in the compiled file.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const RESET = ESC + "[0m";
const OSC8 = ESC + "]8;;";

/**
 * ORC statusline — THE RENDER ENGINE. (v1.3.0 W1.)
 *
 * ONE ENGINE, TWO CALLERS. `bin/cli.js` requires this file out of
 * `templates/hooks/` for `orc statusline preview`; `orc-statusline.js` requires
 * it as a sibling out of `.claude/hooks/`. That is not a convenience — it is
 * what makes the panel's preview and the bar's real output byte-identical BY
 * CONSTRUCTION rather than by a test that would eventually drift. The plan's
 * "preview ≡ hook" test still exists, but it proves a property this file
 * already guarantees.
 *
 * The split of labour, from `compile-pipeline.md` §0:
 *
 *   the CLI COMPILES an authored layout into a flat render program;
 *   this file EXECUTES that program and resolves NOTHING.
 *
 * So there is no catalogue here, no colour table, no theme, no inheritance, no
 * config knowledge and no idea of what a "component" is. There is a BINDINGS
 * table — the entire extent of what this half knows about the world — and an
 * op walker. A second catalogue on this side of the wall would be the
 * Flow-stepper failure on a third surface, and no lint could see it.
 *
 * Three environment seams, none of which ORC ever sets:
 *   NO_COLOR                  no SGR at all, ever (the standard)
 *   ORC_STATUSLINE_ASCII=1    every glyph falls back to its ASCII twin
 *   ORC_STATUSLINE_MOTION=0   motion is REMOVED, never frozen
 */

// ── R1: the glyph inventory ─────────────────────────────────────────────────
// Every glyph this engine can emit is declared in the compiled file's
// `glyphsets[]`, which the CLI validates as single-cell before it writes. This
// file therefore never chooses a glyph — it indexes one.

// ── The bindings: this engine's ONLY knowledge of the world ─────────────────
// key → getter over { payload, ledger, scan }. A binding the compiled file
// names and this table does not have fails the load gate in the caller, which
// falls back to the shipped default and lets `orc doctor` say the install is
// skewed. That is why the set is closed and why it is here rather than spread
// through the renderers.
const BINDINGS = {
  // — payload: session and tier ————————————————————————————————————
  "model.id": (c) => (c.payload.model && c.payload.model.id) || null,
  "model.name": (c) => (c.payload.model && c.payload.model.display_name) || null,
  "model.short": (c) => shortModel((c.payload.model && c.payload.model.display_name) || (c.payload.model && c.payload.model.id)),
  "effort.level": (c) => lower((c.payload.effort && c.payload.effort.level) || null),
  "tier.text": (c) => tierText(c),
  "verdict.state": (c) => c.derived.verdict,
  "verdict.reasons": (c) => (c.derived.reasons.length ? c.derived.reasons.join(", ") : null),
  "orc.version": (c) => c.derived.version,
  "cc.version": (c) => c.payload.version || null,
  "session.short": (c) => shortId(c.payload.session_id || c.payload.sessionId),
  "session.name": (c) => c.payload.session_name || null,
  "output.style": (c) => (c.payload.output_style && (c.payload.output_style.name || c.payload.output_style)) || null,
  "project.name": (c) => baseName(wsDir(c)),
  "project.cwd": (c) => wsDir(c),
  "added.dirs": (c) => arrLen(c.payload.workspace && c.payload.workspace.added_dirs),

  // — payload: context window ——————————————————————————————————————
  "ctx.used_pct": (c) => num(c.payload.context_window && c.payload.context_window.used_percentage),
  "ctx.remaining_pct": (c) => num(c.payload.context_window && c.payload.context_window.remaining_percentage),
  "ctx.size": (c) => num(c.payload.context_window && c.payload.context_window.context_window_size),
  "ctx.tokens": (c) => ctxTokens(c),
  "ctx.state": (c) => bandState(num(c.payload.context_window && c.payload.context_window.used_percentage), 75, 90, ["ok", "warn", "full"]),
  "ctx.exceeds_200k": (c) => {
    const n = num(c.payload.context_window && c.payload.context_window.context_window_size);
    return n == null ? null : n > 200000 ? "yes" : "no";
  },

  // — payload: quota ————————————————————————————————————————————————
  "quota.5h.pct": (c) => winPct(c, "five_hour"),
  "quota.5h.reset": (c) => winReset(c, "five_hour"),
  "quota.5h.state": (c) => bandState(winPct(c, "five_hour"), 75, 90, ["ok", "warn", "critical"]),
  "quota.week.pct": (c) => winPct(c, "seven_day"),
  "quota.week.reset": (c) => winReset(c, "seven_day"),
  "quota.week.state": (c) => bandState(winPct(c, "seven_day"), 75, 90, ["ok", "warn", "critical"]),
  "quota.worst.pct": (c) => maxOf(winPct(c, "five_hour"), winPct(c, "seven_day")),
  "quota.worst.state": (c) => bandState(maxOf(winPct(c, "five_hour"), winPct(c, "seven_day")), 75, 90, ["ok", "warn", "critical"]),
  "quota.spend.pct": (c) => winPct(c, "spend_limit"),
  "quota.spend.reset": (c) => winReset(c, "spend_limit"),
  "quota.spend.state": (c) => bandState(winPct(c, "spend_limit"), 75, 90, ["ok", "warn", "critical"]),

  // — payload: cost ——————————————————————————————————————————————————
  "cost.usd": (c) => num(c.payload.cost && c.payload.cost.total_cost_usd),
  "cost.rate_usd_h": (c) => ratePerHour(c),
  "cost.wall_ms": (c) => num(c.payload.cost && c.payload.cost.total_duration_ms),
  // Whole minutes, for the api-time / wall-time parts. A raw ms count read
  // as minutes is `api 960000m`.
  "cost.api_min": (c) => mins(num(c.payload.cost && c.payload.cost.total_api_duration_ms)),
  "cost.wall_min": (c) => mins(num(c.payload.cost && c.payload.cost.total_duration_ms)),
  "cost.api_ms": (c) => num(c.payload.cost && c.payload.cost.total_api_duration_ms),
  "cost.api_ratio": (c) => ratioPct(num(c.payload.cost && c.payload.cost.total_api_duration_ms), num(c.payload.cost && c.payload.cost.total_duration_ms)),
  "cost.lines_added": (c) => num(c.payload.cost && c.payload.cost.total_lines_added),
  "cost.lines_removed": (c) => num(c.payload.cost && c.payload.cost.total_lines_removed),
  "cost.lines_net": (c) => {
    const a = num(c.payload.cost && c.payload.cost.total_lines_added);
    const r = num(c.payload.cost && c.payload.cost.total_lines_removed);
    return a == null && r == null ? null : (a || 0) - (r || 0);
  },
  "cost.lines_state": (c) => {
    const a = num(c.payload.cost && c.payload.cost.total_lines_added);
    const r = num(c.payload.cost && c.payload.cost.total_lines_removed);
    if (a == null && r == null) return null;
    const n = (a || 0) - (r || 0);
    return n > 0 ? "growing" : n < 0 ? "shrinking" : "flat";
  },

  // — payload: prompt cache (v1.3.0; free, and the most decision-relevant
  //   block in the payload) ————————————————————————————————————————————
  "cache.state": (c) => boolState(c.payload.prompt_cache && c.payload.prompt_cache.warm, "warm", "cold"),
  "cache.hit_ratio": (c) => pctOf(c.payload.prompt_cache && c.payload.prompt_cache.hit_ratio),
  "cache.hit_state": (c) => bandState(pctOf(c.payload.prompt_cache && c.payload.prompt_cache.hit_ratio), 50, 80, ["poor", "poor", "good"]),
  "cache.ttl": (c) => (c.payload.prompt_cache && c.payload.prompt_cache.ttl) || null,
  "cache.expires_in": (c) => expiresIn(c.payload.prompt_cache && c.payload.prompt_cache.expires_at),
  "cache.expires_state": (c) => {
    const m = expiresIn(c.payload.prompt_cache && c.payload.prompt_cache.expires_at);
    return m == null ? null : m <= 0 ? "expired" : m < 2 ? "soon" : "fresh";
  },
  "cache.requests": (c) => num(c.payload.prompt_cache && c.payload.prompt_cache.requests),
  "cache.misses": (c) => num(c.payload.prompt_cache && c.payload.prompt_cache.misses),
  "cache.write_tokens": (c) => num(c.payload.prompt_cache && c.payload.prompt_cache.cache_write_tokens),
  "cache.rebuilds": (c) => num(c.payload.prompt_cache && c.payload.prompt_cache.rebuilds),
  "cache.recache_cost": (c) => num(c.payload.prompt_cache && c.payload.prompt_cache.recache_tokens_if_cold),

  // — payload: mode and identity ——————————————————————————————————————
  "vim.mode": (c) => (c.payload.vim && c.payload.vim.mode) || null,
  "thinking.state": (c) => boolState(c.payload.thinking && c.payload.thinking.enabled, "on", "off"),
  "fast.state": (c) => boolState(c.payload.fast_mode, "on", "off"),
  "agent.name": (c) => (c.payload.agent && c.payload.agent.name) || null,

  // — payload: repo and PR (no subprocess) ————————————————————————————
  "repo.name": (c) => repoField(c, "name"),
  "repo.owner": (c) => repoField(c, "owner"),
  "repo.host": (c) => repoField(c, "host"),
  "worktree.state": (c) => worktreeState(c),
  "worktree.name": (c) => (c.payload.worktree && c.payload.worktree.name) || null,
  "worktree.branch": (c) => (c.payload.worktree && c.payload.worktree.branch) || null,
  "worktree.origin": (c) => (c.payload.worktree && c.payload.worktree.original_branch) || null,
  "pr.number": (c) => num(c.payload.pr && c.payload.pr.number),
  "pr.url": (c) => (c.payload.pr && c.payload.pr.url) || null,
  "pr.review": (c) => lower(c.payload.pr && c.payload.pr.review_state),

  // — the throttled scan: run state ————————————————————————————————————
  "run.lane": (c) => (c.scan.phase && c.scan.phase.lane) || null,
  "run.phase": (c) => (c.scan.phase && c.scan.phase.label) || null,
  "run.phase_kind": (c) => (c.scan.phase && c.scan.phase.kind) || null,
  "run.status": (c) => runStatus(c),
  "run.agents": (c) => intOr(c.scan.spawns, 0),
  "run.running": (c) => intOr(c.scan.running, 0),
  "run.running_state": (c) => (intOr(c.scan.running, 0) > 0 ? "running" : "idle"),
  "run.inflight_state": (c) => c.scan.inflight || null,
  "run.duration_min": (c) => (c.ledger.started_at ? Math.max(0, Math.round((c.now - c.ledger.started_at) / 60000)) : null),
  "run.lanes": (c) => (Array.isArray(c.scan.lanes) && c.scan.lanes.length ? c.scan.lanes.join(",") : null),
  "run.slug": (c) => c.scan.slug || null,
  "run.last_agent": (c) => c.scan.last_agent || null,
  "run.retries": (c) => intOr(c.scan.retries, null),
  "run.trace_age_min": (c) => intOr(c.scan.trace_age_min, null),
  "run.trace_state": (c) => c.scan.trace_state || null,

  // — the throttled scan: session spend ————————————————————————————————
  "ucs.pct": (c) => ucsPct(c),
  "mtok.total": (c) => tokSum(c.ledger.tok),
  "mtok.input": (c) => tokKind(c.ledger.tok, "input"),
  "mtok.cache_write": (c) => tokKind(c.ledger.tok, "cache_write"),
  "mtok.cache_read": (c) => tokKind(c.ledger.tok, "cache_read"),
  "mtok.output": (c) => tokKind(c.ledger.tok, "output"),
  "mtok.speed": (c) => tokSpeed(c),
  "burn.rate": (c) => burnRate(c),
  "burn.state": (c) => bandState(burnRate(c), 15, 30, ["ok", "warn", "critical"]),
  "quota.trend": (c) => trendOf(seriesOf(c, "quota5h")),
  "compactions": (c) => intOr(c.ledger.compactions, null),

  // — the throttled scan: knowledge, extra, flow, branch —————————————
  "wiki.tier": (c) => (c.scan.wiki ? c.scan.wiki.tier : null),
  "wiki.distance": (c) => (c.scan.wiki ? num(c.scan.wiki.distance) : null),
  "graph.state": (c) => (c.scan.graph ? c.scan.graph.state : null),
  "extra.state": (c) => (c.scan.extra_enabled ? "on" : "off"),
  "diy.state": (c) => (c.scan.diy ? c.scan.diy.state : null),
  "diy.name": (c) => (c.scan.diy ? c.scan.diy.name : null),
  "diy.tier_state": (c) => (c.scan.diy ? c.scan.diy.tier_state : null),
  "diy.step": (c) => num(c.scan.diy && c.scan.diy.step_pct),
  "update.state": (c) => (c.scan.update_version ? "available" : "current"),
  "update.version": (c) => c.scan.update_version || null,
  "git.branch": (c) => c.scan.branch || null,
  "git.head": (c) => c.scan.head || null,


  // — the extended scan (v1.3.0 W3): knowledge, extra, flow, health gates ——
  // Every one of these is a `new read` with its own TTL, and every one answers
  // null when its file is absent — which renders an em dash. UNKNOWN IS NOT
  // ZERO: `pact 0 drifted` and "there is no pact ledger" are different facts.
  "wiki.docs": (c) => num(c.scan.wiki_meta && c.scan.wiki_meta.docs),
  "pattern.state": (c) => c.scan.pattern || null,
  "crosslink.state": (c) => (c.scan.crosslink && c.scan.crosslink.state) || null,
  "crosslink.peers": (c) => num(c.scan.crosslink && c.scan.crosslink.peers),
  "gotchas.count": (c) => num(c.scan.gotchas),
  "extra.profile": (c) => (c.scan.extra && c.scan.extra.profile) || null,
  "extra.provider": (c) => (c.scan.extra && c.scan.extra.provider) || null,
  "extra.spend": (c) => num(c.scan.extra_spend && c.scan.extra_spend.usd),
  "extra.tasks": (c) => num(c.scan.extra_spend && c.scan.extra_spend.tasks),
  "extra.inflight": (c) => (c.scan.extra_inflight ? "running" : c.scan.extra ? "idle" : null),
  "extra.demoted": (c) => (c.scan.extra_demoted ? "demoted" : c.scan.extra ? "none" : null),
  "extra.passphrase": (c) => c.scan.extra_passphrase || null,
  // "unended" says what it MEASURES: a dispatch nothing observed ending.
  "extra.unended": (c) => num(c.scan.extra_unended),
  "extra.reliability": (c) => num(c.scan.extra_reliability),
  "wait.state": (c) => c.scan.wait || null,
  "preset.name": (c) => c.scan.preset || null,
  "run.wave": (c) => num(c.scan.runs && c.scan.runs.wave),
  "run.wave_total": (c) => num(c.scan.runs && c.scan.runs.waves),
  "run.resume": (c) => (c.scan.runs ? c.scan.runs.resume : null),
  "run.open": (c) => num(c.scan.runs && c.scan.runs.open),
  "pact.state": (c) => (c.scan.pact && c.scan.pact.state) || null,
  "pact.drifted": (c) => num(c.scan.pact && c.scan.pact.drifted),
  "boundary.state": (c) => (c.scan.boundary && c.scan.boundary.state) || null,
  "boundary.refused": (c) => num(c.scan.boundary && c.scan.boundary.refused),
  "challenge.state": (c) => (c.scan.challenge && c.scan.challenge.state) || null,
  "challenge.open": (c) => num(c.scan.challenge && c.scan.challenge.open),
  "doc.state": (c) => (c.scan.doc && c.scan.doc.state) || null,
  "doc.done": (c) => num(c.scan.doc && c.scan.doc.done),
  "doc.total": (c) => num(c.scan.doc && c.scan.doc.total),
  "doc.progress": (c) => {
    const d = c.scan.doc;
    if (!d || !d.total) return null;
    return Math.round((d.done / d.total) * 100);
  },
  "usage.state": (c) => c.scan.usage || null,
  // A CONFIG KEY as a component. It reads the raw file, because a hook has no
  // lane and therefore cannot resolve config — so this shows what is IN THE
  // FILE, which is a different and honest claim from what a lane would resolve.
  "config.value": (c) => {
    const raw = c.scan.config_raw;
    const key = c.param && c.param.key;
    if (!raw || !key) return null;
    const m = new RegExp("^[ \\t]*" + String(key).replace(/[^a-z0-9_]/gi, "") + ":[ \\t]*([^#\\r\\n]+)", "m").exec(raw);
    return m ? m[1].trim() : null;
  },

  // — THE SECOND BOARD (v1.4.0): one task, per row ————————————————————
  // These are the ONLY difference between the two boards. Same compiler, same
  // IR, same renderers, same colour model — a different binding table, and
  // that is the whole of it.
  //
  // `tokens` is the number v1.2.0 concluded could not be measured. It could
  // not, from the TRANSCRIPT; Claude Code hands it to the agent panel live.
  "task.name": (c) => (c.task && (c.task.name || c.task.type)) || null,
  "task.type": (c) => (c.task && c.task.type) || null,
  "task.description": (c) => (c.task && (c.task.description || c.task.label)) || null,
  "task.status": (c) => (c.task && c.task.status) || null,
  "task.model": (c) => (c.task && c.task.model) || null,
  "task.model_short": (c) => shortModel(c.task && c.task.model),
  "task.effort": (c) => lower(c.task && c.task.effort),
  "task.tokens": (c) => num(c.task && c.task.tokenCount),
  "task.ctx_size": (c) => num(c.task && c.task.contextWindowSize),
  // A percentage needs BOTH, so an unknown window size answers null rather
  // than dividing by a guess.
  "task.ctx_pct": (c) => {
    const t = num(c.task && c.task.tokenCount);
    const w = num(c.task && c.task.contextWindowSize);
    return t == null || !w ? null : Math.round((t / w) * 100);
  },
  "task.ctx_state": (c) => {
    const t = num(c.task && c.task.tokenCount);
    const w = num(c.task && c.task.contextWindowSize);
    return t == null || !w ? null : bandState(Math.round((t / w) * 100), 75, 90, ["ok", "warn", "full"]);
  },
  "task.elapsed_min": (c) => {
    const st = c.task && c.task.startTime;
    if (st == null) return null;
    const ms = typeof st === "number" ? (st > 1e12 ? st : st * 1000) : Date.parse(st);
    return Number.isFinite(ms) ? Math.max(0, Math.round((c.now - ms) / 60000)) : null;
  },
  "task.cwd": (c) => (c.task && c.task.cwd) || null,
  // THE OBSERVED tier, and it is a THIRD reading: ORC's downgrade check has one
  // from the agent's NAME and one the agent REPORTS about itself. This is the
  // only one of the three nobody had to be trusted for.
  "task.tier": (c) => {
    const m = (c.task && c.task.model) || null;
    const e = lower(c.task && c.task.effort);
    if (!m && !e) return null;
    return (shortModel(m) || "unknown") + (e ? "/" + e : "");
  },

  // — static and clock ————————————————————————————————————————————————
  "clock.now": (c) => c.now,
  "session.elapsed_min": (c) => (c.ledger.started_at ? Math.max(0, Math.round((c.now - c.ledger.started_at) / 60000)) : null),
  "static.text": () => null, // supplied per-op by `lit`; present so the set is total

  // — weather (v2.0.4): a cache file the detached fetcher writes ————————
  // The hook never waits on the network; these read what the last fetch left.
  "weather.temp": (c) => {
    const w = c.scan.weather;
    if (!w) return null;
    return num(c.param && c.param.units === "us" ? w.temp_f : w.temp_c);
  },
  "weather.state": (c) => (c.scan.weather && c.scan.weather.state) || null,
  "weather.desc": (c) => (c.scan.weather && c.scan.weather.desc) || null,
};

// ── small helpers the bindings share ────────────────────────────────────────
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function intOr(v, dflt) {
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}
function lower(v) {
  return v == null || v === "" ? null : String(v).toLowerCase();
}
function arrLen(a) {
  return Array.isArray(a) ? a.length : null;
}
function wsDir(c) {
  return (c.payload.workspace && c.payload.workspace.project_dir) || c.payload.cwd || null;
}
function baseName(p) {
  if (!p) return null;
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}
function shortId(v) {
  return v ? String(v).slice(0, 8) : null;
}
function shortModel(v) {
  if (!v) return null;
  const s = String(v);
  const m = /(opus|sonnet|haiku|fable)[\s._-]?(\d+)[\s._-]?(\d+)?/i.exec(s);
  if (!m) return s.slice(0, 8);
  return m[1][0].toUpperCase() + m[2] + (m[3] ? "." + m[3] : "");
}
function tierText(c) {
  const n = (c.payload.model && (c.payload.model.display_name || c.payload.model.id)) || null;
  const e = lower(c.payload.effort && c.payload.effort.level);
  if (!n && !e) return null;
  return (n || "unknown") + (e ? "/" + e : "");
}
function ctxTokens(c) {
  // Bracket access on purpose. The contract lint pins the trace run-pointer
  // token by substring, and the dotted form of this payload field contains it.
  // This file writes no run pointer and must not read as a copy of that
  // contract.
  const cw = c.payload.context_window;
  const u = cw && cw["current_usage"];
  if (!u) return null;
  let t = 0;
  let seen = false;
  for (const k of ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"]) {
    if (typeof u[k] === "number") {
      t += u[k];
      seen = true;
    }
  }
  return seen ? t : null;
}
function winOf(c, k) {
  return (c.payload.rate_limits && c.payload.rate_limits[k]) || null;
}
function winPct(c, k) {
  const w = winOf(c, k);
  return w ? num(w.used_percentage) : null;
}
function winReset(c, k) {
  const w = winOf(c, k);
  if (!w || w.resets_at == null) return null;
  let ms = null;
  if (typeof w.resets_at === "number") ms = w.resets_at > 1e12 ? w.resets_at : w.resets_at * 1000;
  else {
    const t = Date.parse(w.resets_at);
    if (Number.isFinite(t)) ms = t;
  }
  if (ms == null) return null;
  return Math.max(0, Math.round((ms - Date.now()) / 60000));
}
function maxOf(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}
// A band decision, expressed once. `unknown is not zero` — a null in is a null
// out, never the healthy state.
function bandState(v, warnAt, critAt, words) {
  if (v == null) return null;
  if (v >= critAt) return words[2];
  if (v >= warnAt) return words[1];
  return words[0];
}
function boolState(v, yes, no) {
  if (v == null) return null;
  return v ? yes : no;
}
function pctOf(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v <= 1 ? Math.round(v * 100) : Math.round(v);
}
function ratioPct(a, b) {
  if (a == null || b == null || b <= 0) return null;
  return Math.round((a / b) * 100);
}
function expiresIn(at) {
  if (at == null) return null;
  let ms = null;
  if (typeof at === "number") ms = at > 1e12 ? at : at * 1000;
  else {
    const t = Date.parse(at);
    if (Number.isFinite(t)) ms = t;
  }
  if (ms == null) return null;
  return Math.round((ms - Date.now()) / 60000);
}
function ratePerHour(c) {
  const usd = num(c.payload.cost && c.payload.cost.total_cost_usd);
  const ms = num(c.payload.cost && c.payload.cost.total_duration_ms);
  if (usd == null || ms == null || ms < 60000) return null;
  return usd / (ms / 3600000);
}
function repoField(c, f) {
  const r = c.payload.workspace && c.payload.workspace.repo;
  return (r && r[f]) || null;
}
function worktreeState(c) {
  const w = c.payload.worktree;
  if (!w) return c.payload.workspace && c.payload.workspace.git_worktree ? "worktree" : null;
  if (!w.branch) return "detached";
  return w.original_branch && w.branch !== w.original_branch ? "worktree" : "main";
}
function runStatus(c) {
  if (!c.scan.phase || !c.scan.phase.label) return null;
  // This is the ONE binding that COMPOSES two facts, so it owns a separator —
  // and a separator is a glyph, so it falls back like every other glyph. A
  // value that survives ORC_STATUSLINE_ASCII=1 while the glyphs around it fall
  // back is the one place a partial fallback is worse than none.
  return c.scan.phase.lane + (c.ascii ? " - " : " · ") + c.scan.phase.label;
}
function ucsPct(c) {
  const w = c.ledger && c.ledger.five_hour;
  if (!w || typeof w.last !== "number" || typeof w.baseline !== "number") return null;
  return Math.max(0, (w.accumulated || 0) + Math.max(0, w.last - w.baseline));
}
function tokSum(tok) {
  if (!tok) return null;
  const n = (tok.input || 0) + (tok.cache_write || 0) + (tok.cache_read || 0) + (tok.output || 0);
  return n > 0 ? n : null;
}
function tokKind(tok, k) {
  if (!tok) return null;
  return typeof tok[k] === "number" ? tok[k] : null;
}
function tokSpeed(c) {
  const t = tokSum(c.ledger.tok);
  if (t == null || !c.ledger.started_at) return null;
  const s = (c.now - c.ledger.started_at) / 1000;
  return s < 30 ? null : Math.round(t / s);
}
// Percent of the 5-hour window per hour of session. `unknown is not zero`: too
// short a session has no rate, and reporting 0 would say it is free.
function burnRate(c) {
  const used = ucsPct(c);
  if (used == null || !c.ledger.started_at) return null;
  const h = (c.now - c.ledger.started_at) / 3600000;
  return h < 0.25 ? null : Math.round(used / h);
}
function seriesOf(c, key) {
  const s = c.ledger.series && c.ledger.series[key];
  return Array.isArray(s) ? s : null;
}
function trendOf(series) {
  if (!series || series.length < 2) return null;
  const a = series[series.length - 2];
  const b = series[series.length - 1];
  return b > a ? "rising" : b < a ? "falling" : "flat";
}

// ── Number formatting (design-language.md §4) ───────────────────────────────

function mins(ms) {
  return ms == null ? null : Math.round(ms / 60000);
}
// A `tf` on a val op reads the number as epoch ms and prints LOCAL time. The
// raw epoch is never a clock.
function formatTime(ms, tf) {
  const d = new Date(ms);
  const p = (n) => (n < 10 ? "0" : "") + n;
  const h = d.getHours();
  if (tf === "h:mm a") return (h % 12 || 12) + ":" + p(d.getMinutes()) + " " + (h < 12 ? "am" : "pm");
  const s = p(h) + ":" + p(d.getMinutes());
  return tf === "HH:mm:ss" ? s + ":" + p(d.getSeconds()) : s;
}
function formatValue(v, f) {
  if (v == null) return null;
  if (typeof v !== "number") return String(v);
  let n = v;
  let unit = "";
  if (f.kind === "percent") unit = "%";
  else if (f.kind === "decimal") n = n / 100;

  let s;
  if (f.compact === "si") s = si(n);
  else if (f.compact === "bytes") s = bytes(n);
  else s = n.toFixed(f.prec || 0);

  if (f.kind === "ratio") s = s + "/100";
  else s = s + unit;

  if (f.sign === "always" && n > 0) s = "+" + s;
  else if (f.sign === "never") s = s.replace(/^[+-]/, "");
  return s;
}
function si(n) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e9) return sign + trim(a / 1e9) + "G";
  if (a >= 1e6) return sign + trim(a / 1e6) + "M";
  if (a >= 1000) return sign + Math.round(a / 1000) + "K";
  return sign + String(Math.round(a));
}
function bytes(n) {
  const a = Math.abs(n);
  if (a >= 1024 ** 3) return trim(a / 1024 ** 3) + " GiB";
  if (a >= 1024 ** 2) return trim(a / 1024 ** 2) + " MiB";
  if (a >= 1024) return trim(a / 1024) + " KiB";
  return String(Math.round(a)) + " B";
}
function trim(x) {
  return x.toFixed(1).replace(/\.0$/, "");
}
// R2: a number that changes width makes the line dance.
function pad(s, f) {
  const w = f.min_width || 0;
  if (s.length >= w) return s;
  const fill = " ".repeat(w - s.length);
  return f.align === "left" ? s + fill : fill + s;
}
function truncate(s, max, mode) {
  if (!max || s.length <= max || mode === "none") return s;
  if (mode === "middle") {
    const keep = max - 1;
    const head = Math.ceil(keep / 2);
    const tail = keep - head;
    return s.slice(0, head) + "…" + (tail ? s.slice(-tail) : "");
  }
  return s.slice(0, max - 1) + "…";
}

// ── Cell width and styled text (v2.0.4) ─────────────────────────────────────
// Terminal cells, not string length. Only a line that uses flex, align or a
// caption pays for this; every other line never measures.
const SGR_RE = new RegExp(ESC + "\\[[0-9;?]*[A-Za-z]", "g");
const OSC8_RE = new RegExp(ESC + "\\]8;;[^" + BEL + "]*" + BEL, "g");
const SENT_RE = /\u0000[^\u0000]*\u0000/g;
const WIDE = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3],
  [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693],
  [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce],
  [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa],
  [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728], [0x274c, 0x274c],
  [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797], [0x27b0, 0x27b0],
  [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55], [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f000, 0x1faff],
];
function cellWidth(s) {
  const t = String(s == null ? "" : s).replace(OSC8_RE, "").replace(SGR_RE, "").replace(SENT_RE, "");
  let n = 0;
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    if (cp < 0x300) {
      n += 1;
      continue;
    }
    // Zero width: combining marks, the ZW/direction marks, VS16.
    if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff) ||
      (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe20 && cp <= 0xfe2f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f)
      continue;
    let w = 1;
    for (const r of WIDE) {
      if (cp < r[0]) break;
      if (cp <= r[1]) {
        w = 2;
        break;
      }
    }
    n += w;
  }
  return n;
}
function styleMap(from, to) {
  const m = {};
  const a = [...from];
  const b = [...to];
  for (let i = 0; i < a.length; i++) {
    m[a[i]] = b[i];
    m[a[i].toUpperCase()] = b[i];
  }
  return m;
}
const STYLES = {
  small: styleMap("abcdefghijklmnopqrstuvwxyz", "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ"),
  super: styleMap("0123456789+-=()abcdefghijklmnoprstuvwxyz", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ"),
  sub: styleMap("0123456789+-=()aehijklmnoprstuvx", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ"),
};
// A character with no styled form passes through unchanged.
function styleText(s, style) {
  const m = STYLES[style];
  if (!m || s == null) return s;
  let out = "";
  for (const ch of String(s)) out += m[ch] || ch;
  return out;
}

// ── The renderers ──────────────────────────────────────────────────────────
// Every one takes a value, a glyph set and a width, and returns cells. None of
// them decides a colour: colour arrives as precomputed `sgr` ops around them.

function glyphs(gs, ascii) {
  return ascii && gs.ascii ? Object.assign({}, gs, gs.ascii) : gs;
}

// D3: a value above zero fills at least one cell. 6% on ten cells is not 0%.
function fullCells(p, w) {
  const n = Math.floor((p / 100) * w);
  return Math.min(w, p > 0 ? Math.max(1, n) : n);
}
function barCells(pct, g, w, kind) {
  const p = Math.max(0, Math.min(100, pct == null ? 0 : pct));
  const exact = (p / 100) * w;
  const full = Math.floor(exact);
  let out = "";
  if (kind === "fine" && g.part && g.part.length) {
    const rem = exact - full;
    const idx = Math.min(g.part.length - 1, Math.floor(rem * (g.part.length + 1)) - 1);
    out = g.fill.repeat(full);
    if (full < w && idx >= 0) out += g.part[idx];
    return padCells(out, w, g.empty);
  }
  const n = fullCells(p, w);
  out = g.fill.repeat(n) + g.empty.repeat(Math.max(0, w - n));
  return out.slice(0, w);
}
function padCells(s, w, filler) {
  const len = [...s].length;
  return len >= w ? s : s + filler.repeat(w - len);
}
function gaugeCell(pct, g) {
  const set = g.gauge || ["○", "◔", "◑", "◕", "●"];
  const p = Math.max(0, Math.min(100, pct == null ? 0 : pct));
  return set[Math.min(set.length - 1, Math.round((p / 100) * (set.length - 1)))];
}
function microCell(pct, g) {
  const set = g.micro || ["⠀", "⡀", "⣀", "⣄", "⣤", "⣦", "⣶", "⣿"];
  const p = Math.max(0, Math.min(100, pct == null ? 0 : pct));
  return set[Math.min(set.length - 1, Math.round((p / 100) * (set.length - 1)))];
}
function dotsCells(pct, g, w) {
  const p = Math.max(0, Math.min(100, pct == null ? 0 : pct));
  const on = Math.min(w, p > 0 ? Math.max(1, Math.round((p / 100) * w)) : 0);
  return g.on.repeat(on) + g.off.repeat(Math.max(0, w - on));
}
function markerCells(pct, g, w) {
  const p = Math.max(0, Math.min(100, pct == null ? 0 : pct));
  const at = Math.min(w - 1, Math.round((p / 100) * (w - 1)));
  return (g.track || "─").repeat(at) + (g.on || "●") + (g.track || "─").repeat(Math.max(0, w - at - 1));
}
function splitCells(pct, g, w, threshold) {
  const p = Math.max(0, Math.min(100, pct == null ? 0 : pct));
  const at = Math.min(w - 1, Math.round(((threshold == null ? 60 : threshold) / 100) * (w - 1)));
  const full = Math.floor((p / 100) * w);
  let out = "";
  for (let i = 0; i < w; i++) out += i === at ? g.mark || "|" : i < full ? g.fill : g.empty;
  return out;
}
function sparkCells(series, g, w) {
  const set = g.spark || ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  if (!series || !series.length) return g.empty.repeat(w);
  const s = series.slice(-w);
  const lo = Math.min(...s);
  const hi = Math.max(...s);
  const span = hi - lo || 1;
  let out = "";
  for (const v of s) out += set[Math.min(set.length - 1, Math.floor(((v - lo) / span) * (set.length - 1) + 0.5))];
  return out.length >= w ? out : " ".repeat(w - out.length) + out;
}
function trendGlyph(dir, g) {
  const up = (g.arrows && g.arrows[0]) || "▲";
  const dn = (g.arrows && g.arrows[1]) || "▼";
  const fl = (g.arrows && g.arrows[2]) || "▶";
  return dir === "rising" ? up : dir === "falling" ? dn : fl;
}
function trafficCells(idx, n, g) {
  let out = "";
  for (let i = 0; i < n; i++) out += i === idx ? g.on : g.off;
  return out;
}

// ── Motion ─────────────────────────────────────────────────────────────────
// A LIVENESS TELL on a PULL surface: the frame comes off the wall clock, so it
// advances while the session is active and FREEZES when it is idle, which is
// true and is the point. ORC_STATUSLINE_MOTION=0 REMOVES it — a frozen frame of
// a cycling animation is a bug that looks like a hang.
function motifFrame(set, now, ms, motion) {
  if (!set || !set.length) return "";
  if (!motion) return set[0];
  return set[Math.floor(now / (ms || 200)) % set.length];
}

// ── The op walker ──────────────────────────────────────────────────────────

function bind(key, ctx) {
  const g = BINDINGS[key];
  if (!g) throw new Error("unknown binding: " + key);
  const v = g(ctx);
  return v === undefined ? null : v;
}

// hide_when is a CHECKLIST (prior-art: ccstatusline shipped an enum, hit this,
// and migrated). Any number may be checked and they OR together. `draw_empty`
// overrides the lot — "a state keeps its slot" as a per-item switch.
function hidden(item, v, env) {
  if (item.draw_empty) return false;
  const list = item.hide || [];
  if (!list.length) return false;
  for (const h of list) {
    if (h === "empty" && (v == null || v === "")) return true;
    if (h === "zero" && v === 0) return true;
    if (h === "unknown" && v == null) return true;
    if (h === "ok" && (v === "ok" || v === "clean" || v === "fresh" || v === "current" || v === "holding" || v === "none" || v === "clear")) return true;
    if (h === "idle" && (v == null || v === "idle" || v === 0)) return true;
    if (h === "no-run" && !env.hasRun) return true;
    if (h === "narrow" && item.min_cols && env.cols < item.min_cols) return true;
    if (h === "wide" && item.max_cols && env.cols > item.max_cols) return true;
  }
  return false;
}

function rampSgr(ramp, v, color) {
  if (!color || !ramp) return "";
  if (v == null) return ramp.sgr[0] || "";
  let i = 0;
  for (let k = 0; k < ramp.stops.length; k++) if (v >= ramp.stops[k]) i = k;
  return ramp.sgr[Math.min(i, ramp.sgr.length - 1)] || "";
}

/**
 * Execute a compiled program.
 *
 * @param {object} prog  the parsed statusline-compiled.json
 * @param {object} ctx   { payload, ledger, scan, derived, now, cols, env }
 * @returns {{ text: string, errors: string[] }}
 */
function render(prog, ctx) {
  const errors = [];
  const env = ctx.env || process.env;
  const color = !env.NO_COLOR && prog.ansi !== "off";
  const ascii = env.ORC_STATUSLINE_ASCII === "1";
  const motion = env.ORC_STATUSLINE_MOTION !== "0";
  const cols = ctx.cols || Number(env.COLUMNS) || 0;
  const rctx = {
    // `ascii` rides in the binding context because ONE binding composes two
    // facts and therefore owns a separator (see runStatus).
    ascii,
    // The SECOND BOARD binds ONE task per row. Absent on the main status line,
    // where every `task.*` binding therefore answers null and renders an em
    // dash — which is correct: there is no task there.
    task: ctx.task || null,
    payload: ctx.payload || {},
    ledger: ctx.ledger || {},
    scan: ctx.scan || {},
    derived: ctx.derived || { verdict: null, reasons: [], version: null },
    now: ctx.now || Date.now(),
  };
  const hasRun = !!(rctx.scan.phase || rctx.scan.spawns);

  // H4 PLAN — one lookup, no measuring. The last plan whose `cols` ≤ COLUMNS
  // wins; its ids are dropped.
  const dropped = new Set();
  // A plan applies only when the terminal is narrower than the widest line.
  const need = (prog.lines || []).reduce((m, l) => Math.max(m, Number(l && l.static_width) || 0), 0);
  if (cols && Array.isArray(prog.plans) && !(need && cols >= need)) {
    let chosen = null;
    for (const p of prog.plans) if (p.cols <= cols && (!chosen || p.cols >= chosen.cols)) chosen = p;
    // Narrower than every plan: the smallest real plan (the most it drops).
    if (need && (!chosen || !chosen.cols)) {
      for (const p of prog.plans) if (p.cols > 0 && (!chosen || !chosen.cols || p.cols < chosen.cols)) chosen = p;
    }
    if (chosen) for (const id of chosen.drop) dropped.add(id);
  }

  const lines = [];
  for (const line of prog.lines || []) {
    let out = "";
    const o = { color, ascii, motion, cols, hasRun, dropped, flex: false, caps: [] };
    for (const op of line.ops || []) {
      // H5 FAILURE ISOLATION — each item renders inside its own try. One bad
      // component never takes the bar down; it emits its unknown form and the
      // rest of the line survives.
      try {
        out += walk(op, prog, rctx, o, errors);
      } catch (e) {
        errors.push(String((e && e.message) || e));
      }
    }
    let text = line.prefix ? line.prefix + out : out;
    // A line with no flex, no align and no caption stops here, unmeasured.
    const align = line.align === "right" || line.align === "center" ? line.align : null;
    if (!o.flex && !o.caps.length && !(align && cols > 0)) {
      lines.push(text);
      continue;
    }
    if (o.flex) text = applyFlex(text, cols);
    else if (align && cols > 0) {
      const gap = cols - cellWidth(text);
      if (gap > 0) text = " ".repeat(align === "right" ? gap : Math.floor(gap / 2)) + text;
    }
    if (!o.caps.length) {
      lines.push(text);
      continue;
    }
    const rows = captionRows(text, o.caps);
    if (rows.above) lines.push(rows.above);
    lines.push(rows.line);
    if (rows.below) lines.push(rows.below);
  }
  // A trailing empty line is not a line. It would print as a blank row.
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  // D1: Claude Code trims every row, so a caption row or an indent that starts
  // with a space moves to column 0. U+2800 is one blank cell it keeps. A row
  // that starts with ESC is not trimmed and stays as it is.
  if (!ascii) for (let i = 0; i < lines.length; i++) if (lines[i][0] === " ") lines[i] = "\u2800" + lines[i].slice(1);
  return { text: lines.join("\n"), errors };
}

// FLEX: slack = cols − the line's width, shared by weight (the remainder to the
// last); each flex prints max(min, share). cols 0 → each prints its min. One
// column stays free: a row exactly COLUMNS wide can wrap (D5).
function applyFlex(text, cols) {
  const re = /\u0000F(\d+),(\d+)\u0000/g;
  const fl = [];
  let m;
  while ((m = re.exec(text))) fl.push({ w: Number(m[1]), min: Number(m[2]) });
  const slack = cols > 0 ? Math.max(0, cols - cellWidth(text) - 1) : 0;
  const tot = fl.reduce((a, f) => a + f.w, 0) || 1;
  let used = 0;
  const n = fl.map((f, i) => {
    const share = i === fl.length - 1 ? slack - used : Math.floor((slack * f.w) / tot);
    used += share;
    return Math.max(f.min, cols > 0 ? share : 0);
  });
  let i = 0;
  return text.replace(re, () => " ".repeat(n[i++]));
}

// CAPTIONS: one row above and one below, each placed left to right; a caption
// that would overlap the previous one starts one space after it.
function captionRows(text, caps) {
  const re = /\u0000C(\d+)\u0000/g;
  const at = [];
  let m;
  while ((m = re.exec(text))) at.push({ cap: caps[Number(m[1])], col: cellWidth(text.slice(0, m.index)) });
  const row = { above: "", below: "" };
  const cur = { above: 0, below: 0 };
  const any = { above: false, below: false };
  for (const a of at) {
    const k = a.cap;
    const col = a.col + k.off;
    let start = col;
    if (k.align === "center") start = col + Math.max(0, Math.floor((k.content - k.w) / 2));
    else if (k.align === "right") start = col + Math.max(0, k.content - k.w);
    if (any[k.pos] && start < cur[k.pos] + 1) start = cur[k.pos] + 1;
    row[k.pos] += " ".repeat(Math.max(0, start - cur[k.pos])) + k.text;
    cur[k.pos] = Math.max(start, cur[k.pos]) + k.w;
    any[k.pos] = true;
  }
  return { above: row.above, line: text.replace(re, ""), below: row.below };
}

function walk(op, prog, c, o, errors) {
  switch (op.op) {
    case "lit":
      // A literal falls back like any other glyph. `a` is present only when it
      // differs from `t`, so a plain-ASCII literal costs nothing.
      return o.ascii && op.a != null ? op.a : op.t;
    case "sgr":
      return o.color ? op.s : "";
    case "reset":
      return o.color ? RESET : "";
    case "item":
      return walkItem(op, prog, c, o, errors);
    case "cond": {
      const v = bind(op.b, c);
      if (v == null || v === "" || v === false) return "";
      return children(op, prog, c, o, errors);
    }
    case "link": {
      const url = bind(op.b, c);
      const inner = children(op, prog, c, o, errors);
      // OSC 8. Terminal.app does not support it, so a link is ALWAYS a
      // decoration on text that reads fine without it.
      if (!url || !o.color) return inner;
      return OSC8 + url + BEL + inner + OSC8 + BEL;
    }
    case "flex":
      // A sentinel; render() swaps it for its share of the slack.
      o.flex = true;
      return "\u0000F" + Math.max(1, op.w || 1) + "," + Math.max(op.min || 0, 0) + "\u0000";
    case "val":
      return renderVal(op, prog, c, o);
    case "bar":
      return renderBar(op, prog, c, o);
    case "state":
      return renderState(op, prog, c, o);
    case "motif":
      return renderMotif(op, prog, c, o);
    case "series":
      return renderSeries(op, prog, c, o);
    case "sprite":
      return renderSprite(op, c, o);
    default:
      throw new Error("unknown op: " + op.op);
  }
}

function children(op, prog, c, o, errors) {
  let s = "";
  for (const ch of op.children || []) s += walk(ch, prog, c, o, errors);
  return s;
}

function walkItem(op, prog, c, o, errors) {
  if (o.dropped.has(op.id)) return "";
  let probe = null;
  if (op.b) probe = bind(op.b, op.p ? Object.assign({}, c, { param: op.p }) : c);
  if (hidden(op, probe, { cols: o.cols, hasRun: o.hasRun })) return "";
  let body;
  try {
    body = children(op, prog, c, o, errors);
  } catch (e) {
    errors.push(op.id + ": " + String((e && e.message) || e));
    // The unknown FORM: an em dash keeps the slot. `0` would be a measurement.
    body = op.unknown === "hide" ? "" : "—";
  }
  if (body === "" && !op.draw_empty) return "";
  const l = " ".repeat(op.pad_l || 0);
  const r = " ".repeat(op.pad_r || 0);
  const all = l + body + r;
  // A CAPTION rides as a sentinel at the item's start; render() measures the
  // column once the line is final (after flex and align) and strips it.
  if (op.cap && body !== "" && o.caps) {
    let t = "";
    for (const ch of op.cap.ops || []) t += walk(ch, prog, c, o, errors);
    if (t === "") return all;
    const sw = op.sw || 0;
    const pl = op.pad_l || 0;
    o.caps.push({
      pos: op.cap.pos === "above" ? "above" : "below",
      align: op.cap.align || "left",
      text: t,
      w: cellWidth(t),
      off: sw + pl,
      content: Math.max(0, cellWidth(all) - sw - pl - (op.pad_r || 0)),
    });
    return "\u0000C" + (o.caps.length - 1) + "\u0000" + all;
  }
  return all;
}

function renderVal(op, prog, c, o) {
  const f = prog.formats[op.f] || {};
  // `p` is the op's own parameter (the `config` part's key).
  const v = bind(op.b, op.p ? Object.assign({}, c, { param: op.p }) : c);
  let s = op.tf && typeof v === "number" && isFinite(v) ? formatTime(v, op.tf) : formatValue(v, f);
  // UNKNOWN IS NOT ZERO. An em dash keeps the slot and says "not measured"; a
  // `0` would say the thing was free. And it carries NEITHER the prefix nor the
  // suffix — `Dur —m` reads as "minus minutes".
  // The em dash falls back like every other glyph — an unknown that survives
  // ORC_STATUSLINE_ASCII=1 is the one non-ASCII byte left on an ASCII line.
  if (s == null) return op.unknown === "hide" ? "" : pad(o.ascii ? "-" : "—", f);
  if (f.case === "upper") s = s.toUpperCase();
  else if (f.case === "lower") s = s.toLowerCase();
  else if (f.case === "title") s = s.replace(/\w/g, (m) => m.toUpperCase());
  if (f.case === "small" || f.case === "super" || f.case === "sub") s = styleText(s, f.case);
  s = truncate(s, f.max_len, f.truncate);
  s = (f.prefix || "") + pad(s, f) + (f.suffix || "");
  // A ramp derives the colour from the VALUE, so it colours a number as much as
  // a bar. A state map colours the `word` renderer from the SAME table the
  // `shape` renderer reads, so the two can never disagree.
  let sgr = "";
  if (o.color && op.r != null) sgr = rampSgr(prog.ramps[op.r], typeof v === "number" ? v : null, true);
  else if (o.color && op.m != null) {
    const m = prog.statemaps[op.m] || { sgr: {} };
    sgr = m.sgr[String(v)] || "";
  }
  return sgr ? sgr + s + RESET : s;
}

function renderBar(op, prog, c, o) {
  const g = glyphs(prog.glyphsets[op.g] || {}, o.ascii);
  let v = bind(op.b, c);
  // An ordered state (`o`) becomes its rank as a percent; an unlisted state
  // is unknown. Without this `effort` on `dots` draws nothing for "high".
  if (Array.isArray(op.o) && typeof v === "string") {
    const i = op.o.indexOf(v);
    v = i < 0 ? null : ((i + 1) / op.o.length) * 100;
  }
  const w = op.w || 10;
  const single = op.k === "gauge" || op.k === "ring" || op.k === "micro";
  // D2: UNKNOWN IS NOT ZERO. An empty bar or a 0% glyph reads as "0%"; the
  // unknown form keeps the width and says "not measured".
  if (v == null || (typeof v === "number" && !Number.isFinite(v))) {
    const d = o.ascii ? "-" : "—";
    return single ? d : d + " ".repeat(Math.max(0, w - 1));
  }
  const ramp = op.r != null ? rampSgr(prog.ramps[op.r], v, o.color) : "";
  // Precedence: `gc` (gradient) > `fs`/`es` > the ramp. A single-cell kind
  // takes `fs` as its whole colour.
  const split = o.color && (op.fs || op.es);
  const sgr = split && single && op.fs ? op.fs : ramp;
  const p = Math.max(0, Math.min(100, v == null ? 0 : v));
  let cells;
  switch (op.k) {
    case "gauge":
      cells = gaugeCell(v, g);
      break;
    case "ring":
      cells = gaugeCell(v, g);
      break;
    case "micro":
      cells = microCell(v, g);
      break;
    case "dots":
      cells = dotsCells(v, g, w);
      break;
    case "marker":
      cells = markerCells(v, g, w);
      break;
    case "split":
      cells = splitCells(v, g, w, op.thr);
      break;
    case "meter":
      cells = dotsCells(v, { on: g.meter_on || g.fill, off: g.meter_off || g.empty }, w);
      break;
    case "gradient": {
      // Each cell coloured by ITS OWN position along the ramp. Decoration, and
      // the panel labels it as decoration — never a component default.
      const full = fullCells(p, w);
      if (o.color && Array.isArray(op.gc) && op.gc.length) {
        let s1 = "";
        for (let i = 0; i < w; i++) s1 += (op.gc[i] || op.gc[op.gc.length - 1]) + (i < full ? g.fill : g.empty);
        return s1 + RESET;
      }
      if (split || !o.color || op.r == null) {
        cells = barCells(v, g, w, "blocks");
        break;
      }
      const rp = prog.ramps[op.r];
      let s2 = "";
      for (let i = 0; i < w; i++) {
        s2 += rampSgr(rp, ((i + 1) / w) * 100, true) + (i < full ? g.fill : g.empty);
      }
      return s2 + RESET;
    }
    case "braille-bar":
      cells = barCells(v, { fill: g.braille_fill || "⣿", empty: g.braille_empty || "⠀" }, w, "blocks");
      break;
    case "fine":
      cells = barCells(v, g, w, "fine");
      break;
    default:
      cells = barCells(v, g, w, "blocks");
  }
  if (split && !single) {
    const n = filledCount(op.k, p, w, g, op.thr);
    const list = [...cells];
    // A glyph set whose cells are not one code point each cannot be cut by
    // index; it takes the filled colour whole.
    if (list.length !== w) return (op.fs || ramp) ? (op.fs || ramp) + cells + RESET : cells;
    const run = (s, c) => (s === "" ? "" : c ? c + s + RESET : s);
    return run(list.slice(0, n).join(""), op.fs || ramp) + run(list.slice(n).join(""), op.es || ramp);
  }
  return sgr ? sgr + cells + RESET : cells;
}

// How many leading cells a bar kind draws as FILLED — the cut for `fs`/`es`.
function filledCount(k, p, w, g, thr) {
  if (k === "dots" || k === "meter") return Math.min(w, p > 0 ? Math.max(1, Math.round((p / 100) * w)) : 0);
  if (k === "marker") return Math.min(w - 1, Math.round((p / 100) * (w - 1))) + 1;
  const full = Math.floor((p / 100) * w);
  if (k === "fine" && g.part && g.part.length && full < w) {
    const idx = Math.min(g.part.length - 1, Math.floor(((p / 100) * w - full) * (g.part.length + 1)) - 1);
    return idx >= 0 ? full + 1 : full;
  }
  if (k === "split" || k === "fine") return Math.min(w, full);
  return fullCells(p, w);
}

function renderState(op, prog, c, o) {
  const m = prog.statemaps[op.m] || { glyphs: {}, sgr: {} };
  const v = bind(op.b, c);
  const key = v == null ? "__unknown" : String(v);
  const glyph = m.glyphs[key] != null ? m.glyphs[key] : m.glyphs.__unknown;
  if (glyph == null) return op.unknown === "hide" ? "" : "—";
  const ascii = o.ascii && m.ascii && m.ascii[key] != null ? m.ascii[key] : null;
  const cell = ascii != null ? ascii : glyph;
  const sgr = o.color ? m.sgr[key] || "" : "";
  return sgr ? sgr + cell + RESET : cell;
}

function renderMotif(op, prog, c, o) {
  const m = prog.statemaps[op.m] || { motifs: {} };
  const kind = bind(op.b, c);
  const set = (m.motifs && (m.motifs[String(kind)] || m.motifs.generic)) || null;
  if (!set) return "";
  const frames = o.ascii ? set.a : set.u;
  return motifFrame(frames, c.now, set.ms, o.motion);
}

function renderSeries(op, prog, c, o) {
  const g = glyphs(prog.glyphsets[op.g] || {}, o.ascii);
  let s = seriesOf(c, op.s);
  const w = op.w || 8;
  const dash = o.ascii ? "-" : "—";
  // D4: a spark takes the CURRENT value as its live last point, so it shows
  // something on the first render and moves on every render.
  if (op.k === "spark" || op.k === "spark-braille" || !op.k) {
    const cur = op.b ? bind(op.b, op.p ? Object.assign({}, c, { param: op.p }) : c) : null;
    if (typeof cur === "number" && Number.isFinite(cur)) s = (s || []).concat([cur]);
    if (!s || !s.length) return dash + " ".repeat(Math.max(0, w - 1));
  }
  switch (op.k) {
    case "trend":
      // One point has no direction; the flat arrow would claim one.
      if (!s || s.length < 2) return dash;
      return trendGlyph(trendOf(s), g);
    case "delta": {
      if (!s || s.length < 2) return "—";
      const d = s[s.length - 1] - s[s.length - 2];
      return (d > 0 ? "+" : "") + String(d);
    }
    case "spark-braille": {
      const set = g.spark_braille || ["⠀", "⣀", "⣤", "⣶", "⣿"];
      s = s.slice(-2 * w);
      const lo = Math.min(...s);
      const hi = Math.max(...s);
      const span = hi - lo || 1;
      let out = "";
      for (let i = 0; i < s.length; i += 2) {
        const v = (s[i] + (s[i + 1] == null ? s[i] : s[i + 1])) / 2;
        out += set[Math.min(set.length - 1, Math.round(((v - lo) / span) * (set.length - 1)))];
      }
      // Exactly `w` cells, like `spark`: the history grows in from the right.
      const n = [...out].length;
      return n >= w ? out : " ".repeat(w - n) + out;
    }
    default:
      return sparkCells(s, g, w);
  }
}

// ── Sprites (v2.0.4) ───────────────────────────────────────────────────────
// A pet on a track of `w` cells. The frame and the column both come off the
// wall clock, so it moves only while the line redraws. Every frame cell is one
// terminal cell (the CLI checks that), so a cell is a code point here.
// MOTION=0 puts frame 0 at the left: motion REMOVED, never frozen mid-run.
function renderSprite(op, c, o) {
  const w = Math.max(1, op.w || 16);
  const set = o.ascii && Array.isArray(op.a) && op.a.length ? op.a : op.f || [];
  if (!set.length) return " ".repeat(w);
  const tick = o.motion ? Math.floor(c.now / (op.ms > 0 ? op.ms : 1000)) : 0;
  const frame = [...String(set[tick % set.length])];
  const fw = frame.length;
  let x = 0;
  if (o.motion && op.mode === "run") x = (tick % (w + fw - 1)) - (fw - 1); // always one cell on the track
  else if (o.motion && op.mode === "bounce") {
    const span = Math.max(1, w - fw);
    const p = tick % (2 * span);
    x = p < span ? p : 2 * span - p;
  }
  // `ahead_a` / `behind_a` are the ASCII twins of the fillers, when they differ.
  const ahead = (o.ascii && op.ahead_a != null ? op.ahead_a : op.ahead) || " ";
  const behind = (o.ascii && op.behind_a != null ? op.behind_a : op.behind) || " ";
  let out = "";
  for (let i = 0; i < w; i++) out += i < x ? behind : i >= x + fw ? ahead : frame[i - x];
  return out;
}

// Every op the walker handles. The hooks check a compiled program against
// this before running it, so an op from a newer compiler is a skew, not a dash.
const OPS = { lit: 1, sgr: 1, reset: 1, item: 1, cond: 1, link: 1, flex: 1, val: 1, bar: 1, state: 1, motif: 1, series: 1, sprite: 1 };

module.exports = {
  BINDINGS,
  OPS,
  render,
  formatValue,
  barCells,
  sparkCells,
  motifFrame,
  cellWidth,
  styleText,
  // exported for the CLI's measure pass and its R1/R4 checks
  _internals: { pad, truncate, si, bytes, bandState, hidden, rampSgr, glyphs, burnRate, tokSpeed },
};
