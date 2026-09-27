"use strict";
// ── `orc habit` — the habit engine (v2.0.0 W2) ─────────────────────────────
//
// ORC asks the same questions in every run. This module reads the ANSWERS the
// lanes already wrote to the run traces (the `ASK` verb), finds the ones a
// person gives the same way again and again, and PROPOSES them as a usual
// answer. It never applies anything without a yes: there is no automatic
// level (DE-4, DE-16). An accepted `apply` habit is a RANK in the resolver
// (`learned`, between your config file and the shipped default) — it never
// writes `.claude/orc.config.yaml` (DE-6).
//
// Three files, and only one of them is user data:
//   <log_dir>/*.txt                 the `ASK` lines — the source, written by the trace writer
//   .claude/orc/habits-state.json   your decisions (accept / decline / never / forget) + history
//   .claude/orc/habits-cache.json   the parsed `ASK` events, keyed by the trace file list — delete it any time
// None is in the install manifest (`isPrunable` matches only skills/, commands/,
// agents/, hooks/), so `orc update`, `--prune` and `doctor --fix` never touch them.
//
// Routed by bin/cli.js (`orc habit …`), and read by `orc lane config` and
// `orc config list` for the learned rank — the resolver stays the ONE resolver.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

// ── The registry (DATA, the `LANE_CALLS` shape) ─────────────────────────────
// One row per decision point: 30 points in 26 spec rows (`04-habits-spec.md`
// §2.2). A qid this table does not know is DROPPED by the parser and counted by
// `orc habit doctor`; a lookup of an unknown point answers class `never`.
//
// file    the payload file (under templates/skills/) that marks the question
//         `(H <qid>)` — a string, or a list when several lanes ask it. The
//         two-way test (test/cli/habit-registry.test.js) holds the two together.
//
// class   apply   — an accepted habit answers `key` at the learned rank
//         suggest — an accepted habit marks one option `→ usual` and puts it
//                   first; the question is STILL asked
//         never   — observed and shown, never proposed
// careful the option in the careful direction, or null. A habit AWAY from it
//         is downgraded: `apply` → `never`, `suggest` stays `suggest`.
// values  (apply only) option → the config value it answers. An option with no
//         value cannot be applied, so a habit toward it is class `never`.
// ctx     the ctx keys that may split this point into separate habits.
// never_when  a ctx value in which this point is never proposed.
// never_option  an option a habit toward is never proposed, not even as a
//         suggestion (a risk the user must take each time).
// options null + `open: "agent"` = the lane's own agent menu (an ORC agent name).
const ASK_POINTS = {
  "orc.intake.testgen": { lanes: ["orc"], phase: "intake", file: "orc/references/phases/intake.md", title: "Author test cases before ship", options: { author: "author tests", skip: "skip tests" }, class: "apply", careful: "author", key: "generate_tests", values: { author: "true" }, ctx: [], why: "toward authoring tests only — a habit to skip them is never proposed" },
  "mini.phase-t.testgen": { lanes: ["orc-mini"], phase: "phase-t", file: "orc-mini/SKILL.md", title: "Author test cases before ship", options: { author: "author tests", skip: "skip tests" }, class: "apply", careful: "author", key: "generate_tests", values: { author: "true" }, ctx: [], why: "toward authoring tests only — a habit to skip them is never proposed" },
  "orc.phase-1.planner": { lanes: ["orc"], phase: "phase-1", file: "_shared/phases/planning.md", title: "Which planner writes the plan", options: { superpowers: "Superpowers", openspec: "OpenSpec", planner: "ORC planner", self: "plan in session" }, class: "suggest", careful: null, key: null, ctx: [], why: "a planner choice has no careful side, so the habit only orders the offer" },
  "orc.phase-2.execution": { lanes: ["orc"], phase: "phase-2", file: "_shared/phases/scoring.md", title: "How the waves execute", options: { sequential: "sequential", parallel: "parallel", worktrees: "worktrees" }, class: "suggest", careful: null, key: null, ctx: [], why: "the habit only orders the offer" },
  "orc.phase-2.pause": { lanes: ["orc"], phase: "phase-2", file: "_shared/phases/scoring.md", title: "How often the run pauses", options: { "every-1": "pause every wave", "every-2": "pause every 2 waves", straight: "run straight through" }, class: "apply", careful: "every-1", key: "batch_pause_every", values: { "every-1": "1" }, ctx: [], why: "toward more pauses only — a habit to pause less is never applied" },
  "orc.phase-3.pattern": { lanes: ["orc", "orc-diy"], phase: "phase-3", file: ["orc/references/pattern-gate.md", "orc-diy/references/blocks/pattern.md"], title: "Learn the code pattern on a cache miss", options: { learn: "learn the pattern", agnostic: "stay pattern-agnostic" }, class: "suggest", careful: "learn", key: null, ctx: [], why: "pattern_findings stays manual: a scan spends money, so the habit only orders the offer" },
  "orc.phase-5.pattern-missing": { lanes: ["orc"], phase: "phase-5", file: "_shared/phases/review.md", title: "A missing pattern at review", options: { paste: "paste it", file: "name a file", none: "no pattern" }, class: "suggest", careful: null, key: null, ctx: [], why: "the habit only orders the offer" },
  "orc.phase-5-5.security": { lanes: ["orc", "orc-diy"], phase: "phase-5-5", file: "_shared/phases/security.md", title: "Security review", options: { run: "run the security pass", skip: "skip it" }, class: "apply", careful: "run", key: "security_review", values: { run: "on" }, ctx: ["risk"], why: "toward `on` only — a habit to skip security is never applied" },
  "orc.phase-6-7.mock": { lanes: ["orc"], phase: "phase-6-7", file: "_shared/phases/mock-example.md", title: "Mocked runnable example", options: { build: "build the example", skip: "skip it" }, class: "apply", careful: null, key: "mock_example", values: { build: "on", skip: "off" }, ctx: [], why: "a mock example has no careful side, so both answers can be learned" },
  "mini.phase-x.mock": { lanes: ["orc-mini"], phase: "phase-x", file: "orc-mini/SKILL.md", title: "Mocked runnable example", options: { build: "build the example", skip: "skip it" }, class: "apply", careful: null, key: "mock_example", values: { build: "on", skip: "off" }, ctx: [], why: "a mock example has no careful side, so both answers can be learned" },
  "fast.f3-5.mock": { lanes: ["orc-fast"], phase: "f3-5", file: "orc-fast/SKILL.md", title: "Mocked runnable example", options: { build: "build the example", skip: "skip it" }, class: "apply", careful: null, key: "mock_example", values: { build: "on", skip: "off" }, ctx: [], why: "a mock example has no careful side, so both answers can be learned" },
  "orc.phase-7.p2-batch": { lanes: ["orc"], phase: "phase-7", file: "_shared/phases/summary.md", title: "Fix the P2 findings", options: { fix: "fix them", skip: "skip them" }, class: "suggest", careful: "fix", key: null, ctx: [], why: "the habit only orders the offer" },
  "orc.phase-7.p3-batch": { lanes: ["orc"], phase: "phase-7", file: "_shared/phases/summary.md", title: "Fix the P3 findings", options: { fix: "fix them", skip: "skip them" }, class: "suggest", careful: null, key: null, ctx: [], why: "the habit only orders the offer" },
  "orc.phase-8.stack": { lanes: ["orc"], phase: "phase-8", file: "_shared/phases/ship.md", title: "Stacked PRs or one PR", options: { stack: "stacked PRs", single: "one PR" }, class: "suggest", careful: null, key: null, ctx: [], why: "the habit only orders the offer" },
  "orc.phase-8.ship": { lanes: ["orc"], phase: "phase-8", file: "_shared/phases/ship.md", title: "How the change ships", options: { pr: "open a PR", commit: "commit only", leave: "leave it uncommitted" }, class: "suggest", careful: null, key: null, ctx: ["branch"], why: "shipping is irreversible, so the habit only orders the offer" },
  "mini.phase-8.ship": { lanes: ["orc-mini"], phase: "phase-8", file: "orc-mini/SKILL.md", title: "How the change ships", options: { pr: "open a PR", commit: "commit only", leave: "leave it uncommitted" }, class: "suggest", careful: null, key: null, ctx: ["branch"], why: "shipping is irreversible, so the habit only orders the offer" },
  "fast.f4.ship": { lanes: ["orc-fast"], phase: "f4", file: "orc-fast/SKILL.md", title: "How the change ships", options: { pr: "open a PR", commit: "commit only", leave: "leave it uncommitted" }, class: "suggest", careful: null, key: null, ctx: ["branch"], why: "shipping is irreversible, so the habit only orders the offer" },
  "any.ship.review-before-push": { lanes: ["orc-mini", "orc-fast"], phase: "ship", file: ["orc-mini/SKILL.md", "orc-fast/SKILL.md"], title: "Code review before push", options: { review: "review first", push: "push directly" }, class: "apply", careful: "review", key: "review_before_push", values: { review: "on" }, ctx: ["branch"], why: "toward a review only — a habit to push without one is never applied" },
  "orc.phase-8.wiki-refresh": { lanes: ["orc"], phase: "phase-8", file: "_shared/phases/ship.md", title: "Refresh the wiki after ship", options: { refresh: "refresh now", later: "later" }, class: "suggest", careful: null, key: null, ctx: [], why: "a refresh spends money, so the habit only orders the offer" },
  "any.stop.where": { lanes: ["orc", "orc-mini", "orc-wait"], phase: "stop", file: ["_shared/phases/stop-resume.md", "orc-mini/SKILL.md", "orc-wait/SKILL.md"], title: "Where to continue after a stop", options: { here: "continue here", fresh: "a fresh session" }, class: "suggest", careful: null, key: null, ctx: [], why: "the habit only orders the offer" },
  "mini.intake.tdd": { lanes: ["orc-mini"], phase: "intake", file: "orc-mini/SKILL.md", title: "Test-driven loop", options: { yes: "use TDD", no: "no TDD" }, class: "apply", careful: "yes", key: "mini_tdd", values: { yes: "on" }, ctx: [], why: "toward TDD only — a habit to drop it is never applied" },
  "mini.phase-1.complexity": { lanes: ["orc-mini"], phase: "phase-1", file: "orc-mini/SKILL.md", title: "Switch to full /orc on a complex change", options: { switch: "switch to /orc", continue: "continue in mini" }, class: "suggest", careful: "switch", key: null, ctx: ["risk"], never_when: { risk: "cited" }, why: "never proposed when a risk is cited" },
  "mini.phase-m.risk-high": { lanes: ["orc-mini"], phase: "phase-m", file: "orc-mini/SKILL.md", title: "A high-risk change at the smoke gate", options: { review: "review it", test: "test it", ship: "ship it" }, class: "suggest", careful: "review", key: null, ctx: [], why: "the habit only orders the offer" },
  "quick.q2.gate.code": { lanes: ["orc-quick"], phase: "q2", file: "orc-quick/SKILL.md", title: "Which agent writes the code", options: null, open: "agent", class: "suggest", careful: null, key: null, ctx: ["kind"], why: "a dispatch gate is still asked every time — the habit only fills the `→ suggested` line" },
  "quick.q2.gate.recon": { lanes: ["orc-quick"], phase: "q2", file: "orc-quick/SKILL.md", title: "Which agent reads the code", options: null, open: "agent", class: "suggest", careful: null, key: null, ctx: ["kind"], why: "a dispatch gate is still asked every time — the habit only fills the `→ suggested` line" },
  "quick.q3.offer.tests": { lanes: ["orc-quick"], phase: "q3", file: "orc-quick/SKILL.md", title: "Update the tests", options: { update: "update the tests", skip: "skip" }, class: "apply", careful: "update", key: "quick_update_tests", values: { update: "on" }, ctx: ["kind"], why: "toward updating tests only — `off` is not offered" },
  "quick.q3.offer.review": { lanes: ["orc-quick"], phase: "q3", file: "orc-quick/SKILL.md", title: "Code review before commit", options: { "review-first": "review first", "commit-direct": "commit directly", stop: "stop" }, class: "suggest", careful: "review-first", key: null, ctx: ["kind", "branch"], why: "a review is a dispatch, so its gate is still asked — the habit only orders the offer" },
  "quick.q1.too-big": { lanes: ["orc-quick"], phase: "q1", file: "orc-quick/SKILL.md", title: "A request too big for quick", options: { mini: "move to /orc-mini", "keep-going": "keep going" }, class: "suggest", careful: null, key: null, ctx: [], why: "the habit only orders the offer" },
  "fast.f0.stale-wiki": { lanes: ["orc-fast"], phase: "f0", file: "orc-fast/SKILL.md", title: "A stale wiki at preflight", options: { refresh: "refresh the wiki", mini: "fall back to /orc-mini", continue: "continue" }, class: "suggest", careful: null, key: null, ctx: [], never_option: ["continue"], why: "a habit toward `continue` is never proposed (a stale wiki is a risk taken each time); otherwise the habit only orders the offer" },
  "any.analysis.depth": { lanes: ["orc", "orc-analyze"], phase: "analysis", file: ["orc/references/phases/intake.md", "orc-analyze/SKILL.md"], title: "Analysis depth", options: { standard: "standard", deep: "deep" }, class: "suggest", careful: null, key: null, ctx: [], why: "deep analysis needs consent every time, so the habit only orders the offer" },
};

// Not habits: the answer to a proposal itself (`ASK habit.proposal :: …`,
// §4.2). Known, so the parser keeps it and the doctor does not call it unknown,
// but it never becomes a row — a habit about accepting habits feeds itself.
const HABIT_META_QIDS = ["habit.proposal"];

// ── The rule (§3) — CLI constants, not config keys (the `complexity` precedent)
// `/orc-retro` can move a number from data; nobody tunes one by feel. There is
// ONE threshold: propose. The research's second "act" threshold is NOT built —
// no level applies a habit without a yes (DE-4).
const HABIT_RULE = {
  window: 30, // answers per (qid, ctx bucket)
  max_age_days: 180,
  half_life_answers: 10, // recency: weight × 0.5 ^ (answers-ago / 10)
  weights: { user: 1.0, override: 1.0, ledger: 1.0, learned: 0.25, preselected: 0.25 },
  excluded_by: ["config", "default"],
  min_n: 5, // raw n = answers at FULL weight — a pre-selected answer is not raw evidence
  lb: 0.55, // Wilson lower bound at 95 %
  z: 1.96,
  last_agree: 3,
  stale_overrides: 2, // an applied habit is stale on 2 overrides in the last 3
  stale_of: 3,
  expiry_days: 90, // an applied habit not USED for 90 days is stale
  cooldown_answers: 10, // a declined habit may come back after 10 more answers AND 14 days
  cooldown_days: 14,
};

const HABIT_MODES = ["off", "observe", "propose"];
// The keys this release added for habits. Under `habits: off` they are left
// out of `orc lane config` entirely, so the answer is byte-identical to the
// release before (DE-16: off = zero bytes).
const HABIT_KEYS = ["habits", "review_before_push", "mini_tdd", "quick_update_tests"];
const HABIT_FAMILIES = ["habits", "offers"];
const BY_SET = ["user", "ledger", "learned", "config", "default"];
const CTX_VALUES = {
  branch: ["main", "feature", "fix", "release", "other"],
  kind: ["feature", "defect", "pr", "read", "refactor"],
  size: ["s", "m", "l"],
  risk: ["none", "cited"],
};
const STATE_WORDS = ["observed", "proposed", "applied", "declined", "never-ask", "stale", "shadowed", "never"];
const DAY = 86400000;

// ── The parser (§1.1) ───────────────────────────────────────────────────────
// Tail regex: the trace writer prefixes `[DDMMYY HH:MM:SS.mmm] <lane>` and the
// ASK body is everything after the verb. CRLF-safe.
const ASK_RE = /(?:^|\s)ASK\s+(\S+)\s+::\s+(.*?)\s*$/;
const OPT_RE = /^[a-z0-9][a-z0-9-]*$/;
// `QUESTION count=<n> :: <topic>` (trace-verbs.md) — a subagent stopped to ask.
const QUESTION_RE = /(?:^|\s)QUESTION\s+count=(\d+)/;
// A dispatch-gate menu also lists a third-party slot (`deepseek-v4-flash`) or an
// ad-hoc model, so any plain id is an offered option; only `chose=` is counted.
const AGENT_RE = /^[a-z0-9][a-z0-9.:-]*$/;

function pointFor(qid) {
  if (ASK_POINTS[qid]) return ASK_POINTS[qid];
  return { lanes: [], phase: null, file: null, title: qid, options: {}, class: "never", careful: null, key: null, ctx: [], why: "not in the registry — an unknown point is never proposed", unknown: true };
}

// → null (no ASK on this line) · { ok:false, qid, error } · { ok:true, … }
function parseAskLine(line) {
  const text = String(line || "").replace(/\r$/, "");
  const m = ASK_RE.exec(text);
  if (!m) return null;
  const qid = m[1];
  const bad = (error) => ({ ok: false, qid, error, line: text });
  const f = {};
  for (const tok of m[2].split(/\s+/)) {
    const eq = tok.indexOf("=");
    if (eq <= 0) return bad(`"${tok}" is not a field=value pair`);
    const k = tok.slice(0, eq);
    if (f[k] !== undefined) return bad(`field ${k} appears twice`);
    f[k] = tok.slice(eq + 1);
  }
  for (const k of Object.keys(f))
    if (!["offered", "rec", "chose", "by", "pre", "ctx"].includes(k)) return bad(`unknown field ${k}`);
  for (const k of ["offered", "rec", "chose", "by"]) if (!f[k]) return bad(`missing ${k}=`);
  const offered = f.offered.split("|");
  const meta = HABIT_META_QIDS.includes(qid);
  const pt = ASK_POINTS[qid];
  const shape = pt && pt.open === "agent" ? AGENT_RE : OPT_RE;
  for (const o of offered) if (!shape.test(o)) return bad(`offered option "${o}" is not an option id`);
  if (pt && pt.options) for (const o of offered) if (!pt.options[o]) return bad(`offered option "${o}" is not an option of ${qid}`);
  if (f.rec !== "none" && !offered.includes(f.rec)) return bad(`rec=${f.rec} is not an offered option`);
  if (f.chose !== "other" && !offered.includes(f.chose)) return bad(`chose=${f.chose} is not an offered option`);
  if (!BY_SET.includes(f.by)) return bad(`by=${f.by} is outside ${BY_SET.join("|")}`);
  if (f.pre !== undefined && !offered.includes(f.pre)) return bad(`pre=${f.pre} is not an offered option`);
  const ctx = {};
  if (f.ctx !== undefined) {
    for (const kv of f.ctx.split(",")) {
      const [k, v] = kv.split("=");
      if (!CTX_VALUES[k]) return bad(`ctx key ${k} is outside the closed set`);
      if (!CTX_VALUES[k].includes(v)) return bad(`ctx ${k}=${v} is outside ${CTX_VALUES[k].join("|")}`);
      ctx[k] = v;
    }
  }
  return { ok: true, qid, meta, known: !!pt || meta, offered, rec: f.rec, chose: f.chose, by: f.by, pre: f.pre === undefined ? null : f.pre, ctx };
}

// ── The statistics (§3.2 – §3.3) ────────────────────────────────────────────
function wilsonLB(p, n, z = HABIT_RULE.z) {
  if (!(n > 0)) return 0;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

// Kish effective sample size.
function kish(w) {
  const s = w.reduce((a, b) => a + b, 0);
  const s2 = w.reduce((a, b) => a + b * b, 0);
  return s2 ? (s * s) / s2 : 0;
}

// The rule on plain counts (the research's worked values, §3.3).
function ruleOnCounts(k, n) {
  const lb = wilsonLB(k / n, n);
  return { lb: Math.round(lb * 1000) / 1000, propose: n >= HABIT_RULE.min_n && lb >= HABIT_RULE.lb };
}

// How much ONE answer counts as evidence (§3.2).
function evidenceWeight(a) {
  const W = HABIT_RULE.weights;
  if (HABIT_RULE.excluded_by.includes(a.by)) return 0;
  if (a.by === "learned") return W.learned;
  if (a.by === "ledger") return W.ledger;
  if (a.pre && a.chose !== a.pre) return W.override;
  if (a.pre && a.chose === a.pre) return W.preselected;
  return W.user;
}

// answers: oldest → newest, already windowed. Returns the computed row numbers.
function evaluate(answers) {
  const list = answers.slice(-HABIT_RULE.window);
  const L = list.length;
  const ev = list.map(evidenceWeight);
  const rec = list.map((_, i) => Math.pow(0.5, (L - 1 - i) / HABIT_RULE.half_life_answers));
  const w = ev.map((e, i) => e * rec[i]);
  const byOpt = {};
  const cnt = {};
  list.forEach((a, i) => {
    byOpt[a.chose] = (byOpt[a.chose] || 0) + w[i];
    cnt[a.chose] = (cnt[a.chose] || 0) + 1;
  });
  const sw = w.reduce((x, y) => x + y, 0);
  let top = null;
  for (const [o, v] of Object.entries(byOpt)) if (top === null || v > byOpt[top]) top = o;
  const p = sw ? (byOpt[top] || 0) / sw : 0;
  const srec = rec.reduce((x, y) => x + y, 0);
  // Kish over the weights, scaled by the recency-weighted mean evidence: a
  // pre-selected answer counts as a quarter of a choice in n too, not only in p.
  const n_eff = srec ? kish(w) * (sw / srec) : 0;
  const rawN = ev.filter((e) => e >= 1).length;
  const lb = wilsonLB(p, n_eff);
  const last = list.slice(-HABIT_RULE.last_agree);
  const last_agree = last.length === HABIT_RULE.last_agree && last.every((a) => a.chose === top);
  const passes = top !== null && top !== "other" && rawN >= HABIT_RULE.min_n && lb >= HABIT_RULE.lb && last_agree;
  return {
    total: L,
    n: rawN,
    top,
    count: top === null ? 0 : cnt[top],
    counts: cnt,
    p: round3(p),
    n_eff: round3(n_eff),
    lb: round3(lb),
    last_agree,
    passes,
  };
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// The ratchet (§2.1 "Direction"): a habit AWAY from `careful` never becomes an
// `apply`, and an option with no config value cannot be applied at all. So a
// habit can only make ORC MORE careful without a person choosing it.
function effectiveClass(pt, top, bucket) {
  if (!pt || pt.unknown || pt.class === "never") return "never";
  if (pt.never_when && bucket)
    for (const [k, v] of Object.entries(pt.never_when)) if (bucket[k] === v) return "never";
  if (pt.never_option && pt.never_option.includes(top)) return "never";
  if (top === null || top === "other") return pt.class === "apply" ? "never" : pt.class;
  if (pt.class === "apply") {
    if (pt.careful && top !== pt.careful) return "never";
    if (!pt.values || pt.values[top] === undefined) return "never";
  }
  return pt.class;
}

// ── Ids, buckets, branch ────────────────────────────────────────────────────
function bucketOf(pt, ctx) {
  const out = {};
  for (const k of pt.ctx || []) if (ctx && ctx[k] !== undefined) out[k] = ctx[k];
  return out;
}
function bucketKey(b) {
  return Object.keys(b)
    .sort()
    .map((k) => `${k}=${b[k]}`)
    .join(",");
}
// A STABLE id computed from what the habit is, so a read never has to write
// one down: the same point in the same context is the same habit, always.
function habitId(qid, bucket) {
  return "H-" + crypto.createHash("sha1").update(qid + "|" + bucketKey(bucket || {})).digest("hex").slice(0, 6);
}

// §5: the CLI computes the branch class, so no lane passes it.
function branchClass(name) {
  if (!name) return null;
  if (/^(main|master|trunk)$/.test(name)) return "main";
  if (/^(feat|feature)\//.test(name)) return "feature";
  if (/^(fix|bugfix|hotfix)\//.test(name)) return "fix";
  if (/^release\//.test(name)) return "release";
  return "other";
}
function currentBranch(projectRoot) {
  try {
    const b = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();
    return b && b !== "HEAD" ? b : null;
  } catch (_) {
    return null;
  }
}

// ── Files ───────────────────────────────────────────────────────────────────
function statePaths(claudeDir) {
  return {
    state: path.join(claudeDir, "orc", "habits-state.json"),
    cache: path.join(claudeDir, "orc", "habits-cache.json"),
  };
}
function emptyState() {
  return { version: 1, purged_at: null, habits: {}, history: [] };
}
function readState(claudeDir) {
  try {
    const j = JSON.parse(fs.readFileSync(statePaths(claudeDir).state, "utf8"));
    return Object.assign(emptyState(), j, { habits: j.habits || {}, history: j.history || [] });
  } catch (_) {
    return emptyState();
  }
}
function writeState(claudeDir, st) {
  const p = statePaths(claudeDir).state;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2) + "\n");
  fs.renameSync(tmp, p);
}

function habitsMode(map) {
  const v = map && Object.prototype.hasOwnProperty.call(map, "habits") ? String(map.habits) : "off";
  return HABIT_MODES.includes(v) ? v : "off";
}

// ── Collecting the ASK events (REUSES cli.js's listTraces + traceTs) ────────
// A run is excluded when it read untrusted context (a PR body or a peer wiki
// was in the slice), when it aborted, or when it was a dry run (§3.1).
function runExcluded(text) {
  if (/\buntrusted_context\b/.test(text)) return "untrusted_context";
  if (/\bFINISH\b[^\n]*\babort/i.test(text)) return "aborted";
  if (/\bdry[-_]run\b/i.test(text)) return "dry-run";
  return null;
}

function collect(claudeDir, deps) {
  const { dir, runs } = deps.listTraces(claudeDir);
  const sig = crypto
    .createHash("sha1")
    .update(JSON.stringify(runs.map((r) => [r.name, r.mtime])))
    .digest("hex");
  const cp = statePaths(claudeDir).cache;
  try {
    const c = JSON.parse(fs.readFileSync(cp, "utf8"));
    if (c && c.sig === sig && c.version === 3) return Object.assign({ log_dir: dir, cached: true }, c.data);
  } catch (_) {}
  const events = [];
  const bad = [];
  const unknown = {};
  const excluded = [];
  // v2.0.0 W6b (Q7) — every INCLUDED run, a zero-question run too, so
  // `orc stats` can say questions per run in the same pass over the logs.
  // `questions` = the subagent `QUESTION count=<n>` lines, summed.
  const seen = [];
  for (const r of runs) {
    let text = "";
    try {
      text = fs.readFileSync(r.path, "utf8");
    } catch (_) {
      continue;
    }
    const why = runExcluded(text);
    if (why) {
      if (/(?:^|\s)ASK\s/m.test(text)) excluded.push({ run: r.name, reason: why });
      continue;
    }
    const row = { run: r.name, lane: r.lane, date: r.date || null, at: r.mtime || 0, questions: 0 };
    seen.push(row);
    for (const line of text.split(/\r?\n/)) {
      const q = QUESTION_RE.exec(line);
      if (q) row.questions += Number(q[1]) || 0;
      const a = parseAskLine(line);
      if (!a) continue;
      if (!a.ok) {
        bad.push({ run: r.name, error: a.error, line: a.line });
        continue;
      }
      if (!a.known) {
        (unknown[a.qid] ||= { qid: a.qid, count: 0, runs: [] }).count++;
        if (!unknown[a.qid].runs.includes(r.name)) unknown[a.qid].runs.push(r.name);
        continue;
      }
      const ts = deps.traceTs(line) || r.mtime || 0;
      events.push({ run: r.name, lane: r.lane, at: ts, qid: a.qid, offered: a.offered, rec: a.rec, chose: a.chose, by: a.by, pre: a.pre, ctx: a.ctx });
    }
  }
  events.sort((x, y) => x.at - y.at);
  const data = { traces: runs.length, events, bad, unknown: Object.values(unknown), excluded, runs: seen };
  try {
    fs.mkdirSync(path.dirname(cp), { recursive: true });
    fs.writeFileSync(cp, JSON.stringify({ version: 3, sig, data }) + "\n");
  } catch (_) {}
  return Object.assign({ log_dir: dir, cached: false }, data);
}

// ── Questions per run (v2.0.0 W6b, 08 Q7) ───────────────────────────────────
// `orc stats --json` → questions{}. The KPI for "fewer questions": computed from the SAME pass as the habits
// (`collect`), never a second parser. ASKED = a question the user saw: an ASK
// line with `by=user|learned` (learned = shown with the habit's pre-selection)
// plus every subagent `QUESTION count=<n>`. ANSWERED FOR YOU = `by=ledger|config|
// default`: the question was not shown. A run with no question counts as 0.
const ASKED_BY = ["user", "learned"];
const TREND_MAX = 20;
function median(xs) {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
// → null (a pre-W6b cache shape) · { runs, per_run_p50, per_run_trend[], asked, answered_for_you, subagent_questions, by{}, by_lane{}, by_point{} }
function questionStats(col, opts) {
  opts = opts || {};
  if (!col || !Array.isArray(col.runs)) return null;
  const runs = col.runs.filter((r) => !opts.since || !r.date || r.date >= opts.since);
  const per = new Map(runs.map((r) => [r.run, { run: r.run, lane: r.lane, date: r.date, at: r.at, asked: r.questions || 0, answered_for_you: 0, subagent: r.questions || 0 }]));
  const by = Object.fromEntries(BY_SET.map((b) => [b, 0]));
  const byPoint = {};
  for (const e of col.events || []) {
    const row = per.get(e.run);
    if (!row) continue;
    by[e.by] = (by[e.by] || 0) + 1;
    const pt = (byPoint[e.qid] ||= { asked: 0, answered_for_you: 0, lanes: [] });
    if (!pt.lanes.includes(e.lane)) pt.lanes.push(e.lane);
    if (ASKED_BY.includes(e.by)) {
      row.asked++;
      pt.asked++;
    } else {
      row.answered_for_you++;
      pt.answered_for_you++;
    }
  }
  // Oldest first by the trace NAME (its date + HHMMSS), then mtime: a copied
  // log dir has every mtime the same.
  const keyOf = (r) => `${r.date || ""} ${(/-(\d{6})\.txt$/.exec(r.run) || [])[1] || ""}`;
  const rows = [...per.values()].sort((x, y) => keyOf(x).localeCompare(keyOf(y)) || x.at - y.at);
  const byLane = {};
  for (const r of rows) {
    const l = (byLane[r.lane] ||= { runs: 0, asked: 0, answered_for_you: 0, counts: [] });
    l.runs++;
    l.asked += r.asked;
    l.answered_for_you += r.answered_for_you;
    l.counts.push(r.asked);
  }
  for (const l of Object.values(byLane)) {
    l.per_run_p50 = median(l.counts);
    delete l.counts;
  }
  return {
    runs: rows.length,
    per_run_p50: median(rows.map((r) => r.asked)),
    per_run_trend: rows.slice(-TREND_MAX).map((r) => ({ run: r.run, lane: r.lane, date: r.date, asked: r.asked, answered_for_you: r.answered_for_you })),
    asked: rows.reduce((n, r) => n + r.asked, 0),
    answered_for_you: rows.reduce((n, r) => n + r.answered_for_you, 0),
    subagent_questions: rows.reduce((n, r) => n + r.subagent, 0),
    by,
    by_lane: byLane,
    by_point: byPoint,
    rule: "asked = ASK by=user|learned + QUESTION count=<n>; answered for you = ASK by=ledger|config|default",
  };
}

// ── Rows (§4) ───────────────────────────────────────────────────────────────
function dm(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function label(pt, o) {
  return (pt.options && pt.options[o]) || o;
}

// The counts sentence (§3.4): counts, never percentages or Wilson values.
function countsLine(pt, ev, list) {
  if (ev.top === null) return null;
  const others = list.filter((a) => a.chose !== ev.top);
  let tail = "";
  if (others.length === 1) tail = ` (one "${label(pt, others[0].chose)}" on ${dm(others[0].at)})`;
  else if (others.length > 1) tail = ` (${others.length} other answers, the last "${label(pt, others[others.length - 1].chose)}" on ${dm(others[others.length - 1].at)})`;
  return `You chose ${label(pt, ev.top)} in ${ev.count} of your last ${ev.total} answers to "${pt.title}"${tail}.`;
}

// ── The panel fields (v2.0.0 W7, `07-behaviour-panel-spec.md` §4) ──────────
// Every value below is the CLI's. The panel renders it and computes nothing.
function optionRows(pt, ev) {
  const counts = ev.counts || {};
  return Object.entries(counts)
    .map(([v, n]) => ({ v, label: label(pt, v), n }))
    .sort((a, b) => (b.v === ev.top) - (a.v === ev.top) || b.n - a.n || a.v.localeCompare(b.v));
}
// The last 10 counted answers, oldest first: 1 = the top choice, 0 = another
// choice, 0.25 = Enter on a pre-selected top choice (it counts at 0.25, §3.2).
function streakOf(list, top) {
  return list.slice(-10).map((a) => (a.chose !== top ? 0 : a.pre && a.chose === a.pre ? 0.25 : 1));
}
function effectLine(pt, state, eff, top, rec) {
  const opt = label(pt, (rec && rec.option) || top);
  if (state === "applied")
    return pt.class === "apply" ? `ORC answers ${pt.key} with ${opt} at the learned rank. Your config file still wins.` : `ORC puts ${opt} first and marks it → usual. The question is still asked.`;
  if (state === "stale") return `ORC paused this habit. The question is asked again until you decide.`;
  if (eff === "never") return `ORC shows this and never proposes it: ${pt.why}.`;
  if (!top) return null;
  return pt.class === "apply" && eff === "apply"
    ? `If you accept, ORC answers ${pt.key} with ${opt} at the learned rank. Your config file still wins.`
    : `If you accept, ORC puts ${opt} first and marks it → usual. The question is still asked.`;
}
// The value a person types to set this key themself, when the habit is class
// never. Only a value the CLI can name: an unknown one gets no command.
function manualValue(pt, top) {
  if (!pt.key) return null;
  if (pt.values && pt.values[top] !== undefined) return pt.values[top];
  const safe = pt.careful && pt.values ? pt.values[pt.careful] : undefined;
  return safe === "on" ? "off" : safe === "true" ? "false" : null;
}
function commandsFor(id, pt, state, eff, top) {
  const c = { accept: null, decline: null, never: null, forget: null, reset: null, manual: null };
  if (state === "proposed") {
    c.accept = `orc habit accept ${id}`;
    c.decline = `orc habit decline ${id}`;
    c.never = `orc habit decline ${id} --never`;
  } else if (state === "applied" || state === "stale") c.forget = `orc habit forget ${id}`;
  else if (state === "declined" || state === "never-ask") c.reset = `orc habit reset ${id}`;
  else if (state === "never") {
    const v = manualValue(pt, top);
    c.manual = v === null ? null : `orc config set ${pt.key} ${v}`;
  }
  return c;
}
// The inverse of one history entry — the command that undoes it.
function inverseOf(h) {
  if (!/^H-/.test(String(h.id))) return null;
  if (h.to === "applied") return `orc habit forget ${h.id}`;
  if (h.to === "declined" || h.to === "never-ask") return `orc habit reset ${h.id}`;
  if (h.to === "observed" && h.from === "applied") return `orc habit accept ${h.id}`;
  return null;
}

// The panel's numbers for ONE window (`show`). Runs are dated by their trace
// file's mtime; the heat map is local time, Monday first.
const WEEKS = 12;
function panelStats(col, rows, windowDays, now, lane) {
  const inLane = (x) => !lane || x.lane === lane;
  const within = (from, to) => (x) => x.at >= from && x.at < to;
  const span = windowDays ? windowDays * DAY : null;
  const cur = span ? within(now - span, now + DAY) : () => true;
  const prev = span ? within(now - 2 * span, now - span) : null;
  const runsAll = (col.runs || []).filter(inLane);
  const evAll = col.events.filter(inLane);
  const asked = (runs, evs) => {
    const ids = new Set(runs.map((r) => r.run));
    const n = evs.filter((e) => ids.has(e.run) && ASKED_BY.includes(e.by)).length + runs.reduce((s, r) => s + (r.questions || 0), 0);
    return runs.length ? Math.round((n / runs.length) * 10) / 10 : null;
  };
  const saved = (evs) => evs.filter((e) => !ASKED_BY.includes(e.by)).length;
  const runsCur = runsAll.filter(cur);
  const evCur = evAll.filter(cur);
  const runsPrev = prev ? runsAll.filter(prev) : null;
  const evPrev = prev ? evAll.filter(prev) : null;
  const tiles = {
    runs: runsCur.length,
    answers: evCur.length,
    saved: saved(evCur),
    saved_prev: evPrev ? saved(evPrev) : null,
    qpr: asked(runsCur, evCur),
    qpr_prev: runsPrev ? asked(runsPrev, evPrev) : null,
  };
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of runsCur) {
    if (!r.at) continue;
    const d = new Date(r.at);
    heat[(d.getDay() + 6) % 7][d.getHours()]++;
  }
  const byLane = {};
  for (const r of runsCur) byLane[r.lane] = (byLane[r.lane] || 0) + 1;
  const lanes = Object.entries(byLane)
    .map(([l, n]) => ({ lane: l, n }))
    .sort((a, b) => b.n - a.n || a.lane.localeCompare(b.lane));
  const weeks = [];
  const qpr = [];
  const how = [];
  for (let w = WEEKS - 1; w >= 0; w--) {
    const f = within(now - (w + 1) * 7 * DAY, now - w * 7 * DAY + (w ? 0 : DAY));
    const rw = runsAll.filter(f);
    const ew = evAll.filter(f);
    weeks.push(new Date(now - (w + 1) * 7 * DAY).toISOString().slice(0, 10));
    qpr.push(asked(rw, ew));
    const h = Object.fromEntries(BY_SET.map((b) => [b, 0]));
    for (const e of ew) h[e.by] = (h[e.by] || 0) + 1;
    how.push(h);
  }
  // The portrait: 3–5 sentences, every one composed here.
  const portrait = [];
  const total = runsCur.length;
  if (lanes.length) portrait.push({ k: "lanes", line: `You run most work through ${lanes[0].lane} (${Math.round((lanes[0].n / total) * 100)}% of ${total} runs).` });
  let peak = null;
  heat.forEach((row, d) => row.forEach((v, h) => { if (v && (!peak || v > peak.v)) peak = { d, h, v }; }));
  if (peak) portrait.push({ k: "time", line: `Your busiest hour is ${DAY_NAMES[peak.d]} ${String(peak.h).padStart(2, "0")}:00 (${peak.v} run${peak.v === 1 ? "" : "s"}).` });
  if (tiles.qpr !== null)
    portrait.push({
      k: "questions",
      line: tiles.qpr_prev !== null && tiles.qpr_prev !== undefined
        ? `You answered ${tiles.qpr} questions per run, against ${tiles.qpr_prev} in the window before.`
        : `You answered ${tiles.qpr} questions per run.`,
    });
  for (const r of rows.filter((x) => x.state === "applied").slice(0, 2))
    portrait.push({ k: "usual", line: `${r.title}: usually ${label(ASK_POINTS[r.qid], r.option)} (${r.count} of ${r.total}).` });
  const proposed = rows.filter((x) => x.state === "proposed").length;
  if (proposed) portrait.push({ k: "proposal", line: `${proposed} habit${proposed === 1 ? " is" : "s are"} ready for your decision.` });
  return { tiles, heat, lanes, weeks, qpr, how, portrait: portrait.slice(0, 5) };
}
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// What the habits do on the NEXT run, per lane — predictability is the point.
function nextRun(rows) {
  const out = [];
  for (const r of rows) {
    if (r.state !== "applied") continue;
    const pt = ASK_POINTS[r.qid];
    const opt = label(pt, r.option);
    const line = r.class === "apply" ? `${pt.key}: ${r.value} — learned (${r.id})` : `"${r.title}" offers ${opt} first, marked → usual (${r.id})`;
    for (const l of pt.lanes) out.push({ lane: l, id: r.id, qid: r.qid, line });
  }
  return out.sort((a, b) => a.lane.localeCompare(b.lane) || a.id.localeCompare(b.id));
}

// `show` under `habits: off` reads NOTHING new — only the cache file an earlier
// on-period left, so the panel can say "your earlier answers are kept".
function keptAnswers(claudeDir) {
  try {
    const c = JSON.parse(fs.readFileSync(statePaths(claudeDir).cache, "utf8"));
    return c && c.data && Array.isArray(c.data.events) ? c.data.events.length : 0;
  } catch (_) {
    return 0;
  }
}

// The order the CLI sends rows in for the panel: the ones that need you first.
const PANEL_ORDER = ["proposed", "stale", "applied", "observed", "shadowed", "declined", "never-ask", "never"];

function computeRows(claudeDir, deps, opts = {}) {
  const now = opts.now || Date.now();
  const map = opts.map || {};
  const mode = opts.mode || habitsMode(map);
  const col = opts.collected || collect(claudeDir, deps);
  const st = readState(claudeDir);
  const maxAge = (opts.window_days || HABIT_RULE.max_age_days) * DAY;
  const groups = new Map();
  const add = (id, qid, b, e) => {
    if (!groups.has(id)) groups.set(id, { id, qid, bucket: b, events: [] });
    groups.get(id).events.push(e);
  };
  for (const e of col.events) {
    if (HABIT_META_QIDS.includes(e.qid)) continue;
    const pt = ASK_POINTS[e.qid];
    if (!pt) continue;
    const b = bucketOf(pt, e.ctx);
    add(habitId(e.qid, b), e.qid, b, e);
    // The "any context" row holds EVERY answer to the question; a bucket with
    // context is a refinement of it, never a split of its evidence.
    if (Object.keys(b).length) add(habitId(e.qid, {}), e.qid, {}, e);
  }
  // A decision on a habit with no evidence left keeps its row: an applied
  // habit you can no longer see is a setting nobody can undo.
  for (const [id, r] of Object.entries(st.habits))
    if (!groups.has(id) && ASK_POINTS[r.qid]) groups.set(id, { id, qid: r.qid, bucket: r.bucket || {}, events: [] });
  const rows = [];
  for (const g of groups.values()) {
    const pt = ASK_POINTS[g.qid];
    const rec = st.habits[g.id] || null;
    const cutoff = Math.max((rec && rec.cutoff) || 0, st.purged_at || 0);
    const live = g.events.filter((e) => e.at >= cutoff);
    const counted = live.filter((e) => !HABIT_RULE.excluded_by.includes(e.by) && e.at >= now - maxAge);
    const list = counted.slice(-HABIT_RULE.window);
    const ev = evaluate(list);
    const eff = effectiveClass(pt, ev.top, g.bucket);
    const shadowed = pt.class === "apply" && pt.key && Object.prototype.hasOwnProperty.call(map, pt.key);
    let state = "observed";
    let why = null;
    let stale_reason = null;
    let stale_detail = null;
    let last_used = null;
    if (rec && rec.state === "applied") {
      const after = counted.filter((e) => e.at > rec.at);
      const last = after.slice(-HABIT_RULE.stale_of);
      const overrides = last.filter((e) => e.chose !== rec.option).length;
      last_used = Math.max(rec.renewed_at || rec.at, ...live.filter((e) => e.at > rec.at && e.chose === rec.option && e.by !== "default").map((e) => e.at));
      if (overrides >= HABIT_RULE.stale_overrides) {
        state = "stale";
        stale_reason = "override";
        const o = last.filter((e) => e.chose !== rec.option).pop().chose;
        stale_detail = { option: o, overrides, of: last.length };
        why = `you chose ${label(pt, o)} ${overrides} of the last ${last.length} times instead of your usual ${label(pt, rec.option)} — paused, not flipped`;
      } else if (now - last_used > HABIT_RULE.expiry_days * DAY) {
        state = "stale";
        stale_reason = "expired";
        why = `not used for ${HABIT_RULE.expiry_days} days — paused until you keep it`;
      } else {
        state = "applied";
        why = pt.class === "apply" ? `answers ${pt.key} at the learned rank` : `marks ${label(pt, rec.option)} as your usual; the question is still asked`;
      }
    } else if (rec && rec.state === "never-ask") {
      state = "never-ask";
      why = "you said never — still observed, never proposed";
    } else if (rec && rec.state === "declined") {
      const since = counted.filter((e) => e.at > rec.at).length;
      const days = (now - rec.at) / DAY;
      if (since < HABIT_RULE.cooldown_answers || days < HABIT_RULE.cooldown_days) {
        state = "declined";
        why = `declined — it can come back after ${HABIT_RULE.cooldown_answers} more answers (${since} so far) and ${HABIT_RULE.cooldown_days} days (${Math.floor(days)} so far)`;
      }
    }
    if (eff === "never" && state !== "applied" && state !== "stale") {
      state = "never";
      why = pt.careful && ev.top && ev.top !== pt.careful && pt.class === "apply"
        ? `your usual answer (${label(pt, ev.top)}) is away from the careful side, so it is never applied — ${pt.why}`
        : pt.why;
    }
    if (state === "observed") {
      if (ev.passes) {
        state = mode === "propose" ? "proposed" : "observed";
        why = mode === "propose" ? "the rule passes — proposed once, at the end of a run" : "the rule passes — `habits: observe` never proposes";
      } else {
        why = !ev.top
          ? "no counted answers yet"
          : ev.n < HABIT_RULE.min_n
            ? `${ev.n} full-weight answers — the rule needs ${HABIT_RULE.min_n}`
            : !ev.last_agree
              ? `the last ${HABIT_RULE.last_agree} answers do not agree`
              : `not consistent enough yet (${ev.count} of ${ev.total})`;
      }
    }
    if (shadowed) {
      why = `your config sets ${pt.key}: ${map[pt.key]} — the file wins, so this habit is shown and inert (was: ${state})`;
      state = "shadowed";
    }
    const applied = state === "applied" && rec;
    rows.push({
      id: g.id,
      qid: g.qid,
      lanes: pt.lanes,
      title: pt.title,
      class: pt.class,
      effective_class: eff,
      careful: pt.careful,
      key: pt.key,
      bucket: g.bucket,
      state,
      why,
      stale_reason,
      stale_detail,
      top: ev.top,
      top_label: ev.top ? label(pt, ev.top) : null,
      count: ev.count,
      total: ev.total,
      n: ev.n,
      n_eff: ev.n_eff,
      p: ev.p,
      lb: ev.lb,
      last_agree: ev.last_agree,
      passes: ev.passes,
      proposable: ev.passes && eff !== "never" && !shadowed && !(rec && ["applied", "never-ask"].includes(rec.state) && state !== "stale") && state !== "declined",
      option: rec && rec.option ? rec.option : null,
      value: applied && pt.class === "apply" ? pt.values[rec.option] : null,
      decided_at: rec ? rec.at : null,
      last_used,
      line: countsLine(pt, ev, list),
      rule: ev.top ? `Wilson95 LB ${ev.lb} (n_eff ${ev.n_eff}, raw n ${ev.n}) — proposes at ≥ ${HABIT_RULE.lb} with n ≥ ${HABIT_RULE.min_n} and the last ${HABIT_RULE.last_agree} agreeing` : null,
      undo: rec && rec.state !== "observed" ? `orc habit forget ${g.id}` : null,
      // v2.0.0 W7 — what the Behaviour panel draws, computed HERE so the panel
      // derives nothing: not a share, not a streak, not a command.
      options: optionRows(pt, ev),
      share: ev.total ? round3(ev.count / ev.total) : 0,
      streak: streakOf(list, ev.top),
      context: bucketKey(g.bucket),
      effect: effectLine(pt, state, eff, ev.top, rec),
      commands: commandsFor(g.id, pt, state, eff, ev.top),
    });
  }
  rows.sort((a, b) => b.lb - a.lb || a.id.localeCompare(b.id));
  return { rows, collected: col, state: st, mode };
}

// At most ONE proposal per run: the proposed or stale row with the highest LB.
function pickProposal(rows, lane) {
  const cands = rows.filter((r) => (r.state === "proposed" || r.state === "stale") && (!lane || r.lanes.includes(lane)));
  if (!cands.length) return null;
  const r = cands.sort((a, b) => b.lb - a.lb)[0];
  const pt = ASK_POINTS[r.qid];
  const kind = r.state === "stale" ? "re-ask" : "propose";
  const line =
    kind === "propose"
      ? `${r.line} Make it your usual? [yes · not now · never]`
      : r.stale_reason === "expired"
        ? `You have not used your usual ${label(pt, r.option)} for ${HABIT_RULE.expiry_days} days. Keep it · ask every time?`
        : `You chose ${label(pt, r.stale_detail.option)} ${r.stale_detail.overrides} of the last ${r.stale_detail.of} times instead of your usual ${label(pt, r.option)}. Switch to ${label(pt, r.stale_detail.option)} · keep ${label(pt, r.option)} · ask every time?`;
  return {
    id: r.id,
    qid: r.qid,
    kind,
    option: kind === "propose" ? r.top : r.option,
    line,
    yes: kind === "propose" ? `orc habit accept ${r.id}` : r.stale_reason === "expired" ? `orc habit accept ${r.id} --keep` : `orc habit accept ${r.id}`,
    keep: kind === "re-ask" ? `orc habit accept ${r.id} --keep` : null,
    later: kind === "propose" ? `orc habit decline ${r.id}` : null,
    never: kind === "propose" ? `orc habit decline ${r.id} --never` : `orc habit forget ${r.id}`,
    trace: `ASK habit.proposal :: offered=yes|later|never rec=none chose=<yes|later|never> by=user`,
  };
}

// ── The learned rank (§5) — read by `orc lane config` and `orc config list` ─
// An applied `apply` habit whose ctx matches this run answers its key at rank 3:
// below your config file, above the shipped default. A ctx key the CLI cannot
// know at preflight (kind, size, risk) never matches, so such a habit is shown
// and not applied — the conservative answer.
function learnedFor(claudeDir, deps, map, lane, computed) {
  const c = computed || computeRows(claudeDir, deps, { map });
  const branch = branchClass(currentBranch(path.join(claudeDir, "..")));
  const out = {};
  for (const r of c.rows) {
    if (r.state !== "applied" || r.class !== "apply" || r.value === null) continue;
    const pt = ASK_POINTS[r.qid];
    if (lane && !pt.lanes.includes(lane)) continue;
    let match = true;
    for (const [k, v] of Object.entries(r.bucket)) if (k !== "branch" || v !== branch) match = false;
    if (!match || out[pt.key]) continue;
    out[pt.key] = { id: r.id, qid: r.qid, value: r.value, option: r.option, count: r.count, total: r.total };
  }
  return out;
}

// The BRIEF `habits{}` block `orc lane config` carries when habits is not off.
function laneBlock(claudeDir, deps, map, lane) {
  const c = computeRows(claudeDir, deps, { map });
  const learned = learnedFor(claudeDir, deps, map, lane, c);
  const mine = c.rows.filter((r) => r.lanes.includes(lane));
  const suggestions = mine
    .filter((r) => r.state === "applied" && r.class === "suggest")
    .map((r) => ({ id: r.id, qid: r.qid, option: r.option, bucket: r.bucket, mark: `→ usual (${r.count} of ${r.total})` }));
  const proposal = c.mode === "propose" ? pickProposal(c.rows, lane) : null;
  const learnedList = Object.entries(learned).map(([key, l]) => ({
    key,
    value: l.value,
    id: l.id,
    qid: l.qid,
    count: l.count,
    total: l.total,
    undo: `orc habit forget ${l.id}`,
  }));
  const block = {
    mode: c.mode,
    learned: learnedList,
    suggestions,
    proposal,
    line:
      `habits: ${c.mode} — ${learnedList.length} learned, ${suggestions.length} usual mark(s)` +
      (c.mode === "propose" ? (proposal ? ", 1 proposal for the end of the run" : ", no proposal") : ", never proposes"),
  };
  return { block, learned };
}

function announceLine(key, l) {
  return `${key}: ${l.value} — learned (${l.id}, ${l.count} of ${l.total}) · undo: orc habit forget ${l.id}`;
}

// ── Soft preferences (§7, DE-8) — `orc habit repo` ─────────────────────────
// No question is asked: the repo already knows. Computed from `git log -n 100`
// and the tree, with no model. A signal becomes a PROPOSED soft preference only
// at share ≥ 0.8 over ≥ 20 samples, with the evidence in the row. An ACCEPTED
// one rides in `orc rules slice` as the LEARNED tier — below your own
// `.claude/orc/rules.md`, which stays written by a human only. It is re-checked
// on use: when it no longer matches 4 of the last 5 samples it is `stale` and
// leaves the card. Decisions live in habits-state.json under `soft`.
const SOFT_RULE = { share: 0.8, min_n: 20, recheck_of: 5, recheck_need: 4, commits: 100, branches: 30 };
const CC_RE = /^([a-z][a-z0-9-]*)(\(([^)]+)\))?(!)?: \S/;
const TICKET_RE = /\b[A-Z][A-Z0-9]+-\d+\b/;
const TRAILER_RE = /^([A-Za-z][A-Za-z-]+): .+$/;
const BRANCH_SKIP = new Set(["HEAD", "main", "master", "develop", "dev", "trunk", "origin"]);
const BRANCH_RE = /^([a-z]+)\/[a-z0-9][a-z0-9._-]*$/;

function git(projectRoot, argv) {
  try {
    return execFileSync("git", argv, { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (_) {
    return null;
  }
}

// The body WITHOUT its trailers — a `Co-Authored-By:` line is a tool's, not a body.
function bodyOf(body) {
  return String(body || "")
    .split("\n")
    .filter((l) => l.trim() && !TRAILER_RE.test(l.trim()))
    .join("\n")
    .trim();
}

function repoCommits(projectRoot) {
  const out = git(projectRoot, ["log", "-n", String(SOFT_RULE.commits), "--no-merges", "--format=%h%x1f%s%x1f%b%x1e"]);
  if (out === null) return null;
  return out
    .split("\x1e")
    .map((r) => r.replace(/^\s+/, ""))
    .filter(Boolean)
    .map((r) => {
      const [sha, subject, body] = r.split("\x1f");
      return { sha, subject: subject || "", body: body || "" };
    });
}

function repoBranches(projectRoot) {
  const out = git(projectRoot, ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)", "refs/heads", "refs/remotes"]);
  if (out === null) return [];
  const seen = new Set();
  const list = [];
  for (let b of out.split("\n").map((x) => x.trim()).filter(Boolean)) {
    if (/^[^/]+\/HEAD$/.test(b)) continue;
    b = b.replace(/^(origin|upstream)\//, "");
    if (BRANCH_SKIP.has(b) || seen.has(b)) continue;
    seen.add(b);
    list.push(b);
  }
  return list.slice(0, SOFT_RULE.branches);
}

function testStyle(file) {
  const f = String(file).replace(/\\/g, "/");
  if (/\.spec\.[a-z0-9]+$/i.test(f)) return "spec";
  if (/\.test\.[a-z0-9]+$/i.test(f)) return "test";
  if (/(^|\/)test_[^/]+\.py$/.test(f)) return "test_py";
  if (/_test\.(py|go)$/.test(f)) return "_test";
  return null;
}
const TEST_STYLE_WORDS = { spec: "`*.spec.<ext>`", test: "`*.test.<ext>`", test_py: "`test_*.py`", _test: "`*_test.<ext>`" };

// Each signal: its samples (newest first), the value it would propose, a
// predicate for a value, and the sentence the card carries. The predicate is
// what the re-check on use runs against the ACCEPTED value.
const SOFT_SIGNALS = {
  "commit.conventional": {
    title: "Conventional Commits subjects",
    samples: (d) => d.commits,
    value: () => "conventional",
    match: (c) => CC_RE.test(c.subject),
    rule: (d) => {
      const types = [...new Set(d.commits.map((c) => (CC_RE.exec(c.subject) || [])[1]).filter(Boolean))].slice(0, 6);
      return `Write the commit subject as a Conventional Commit: \`type(scope): subject\` (types seen here: ${types.join(", ")}). Keep it at or under ${d.facts.subject_p90} characters.`;
    },
    ev: (c) => c.sha,
  },
  "commit.scope": {
    title: "a scope in the commit type",
    samples: (d) => d.commits.filter((c) => CC_RE.test(c.subject)),
    value: () => "scope",
    match: (c) => !!(CC_RE.exec(c.subject) || [])[3],
    rule: () => "Put a scope in the commit type: `type(scope): subject`.",
    ev: (c) => c.sha,
  },
  "commit.ticket": {
    title: "a ticket id in the commit",
    samples: (d) => d.commits,
    value: () => "ticket",
    match: (c) => TICKET_RE.test(c.subject) || TICKET_RE.test(c.body),
    rule: () => "Name the ticket id (like ABC-123) in the commit message.",
    ev: (c) => c.sha,
  },
  "commit.body": {
    title: "a commit body",
    samples: (d) => d.commits,
    value: () => "body",
    match: (c) => !!bodyOf(c.body),
    rule: () => "Write a body under the commit subject: what changed and why.",
    ev: (c) => c.sha,
  },
  "branch.naming": {
    title: "`<type>/<slug>` branch names",
    samples: (d) => d.branches,
    value: () => "type/slug",
    match: (b) => BRANCH_RE.test(b),
    rule: (d) => {
      const types = [...new Set(d.branches.map((b) => (BRANCH_RE.exec(b) || [])[1]).filter(Boolean))].slice(0, 6);
      return `Name a new branch \`<type>/<slug>\` (types seen here: ${types.join(", ")}).`;
    },
    ev: (b) => b,
  },
  "test.naming": {
    title: "one test file naming style",
    samples: (d) => d.tests,
    value: (d) => {
      const c = {};
      for (const f of d.tests) c[testStyle(f)] = (c[testStyle(f)] || 0) + 1;
      return Object.keys(c).sort((a, b) => c[b] - c[a] || (a < b ? -1 : 1))[0] || null;
    },
    match: (f, v) => testStyle(f) === v,
    rule: (d, v) => `Name a new test file ${TEST_STYLE_WORDS[v] || v}, like the tests already here.`,
    ev: (f) => f,
    // Re-checked against the test files the last commits ADDED, newest first.
    recent: (d) => d.recent_tests,
  },
};

function repoData(projectRoot) {
  const commits = repoCommits(projectRoot);
  if (commits === null) return null;
  const lens = commits.map((c) => c.subject.length).sort((a, b) => a - b);
  const trailers = {};
  for (const c of commits) {
    const keys = new Set(String(c.body).split("\n").map((l) => (TRAILER_RE.exec(l.trim()) || [])[1]).filter(Boolean));
    for (const k of keys) trailers[k] = (trailers[k] || 0) + 1;
  }
  const files = (git(projectRoot, ["ls-files"]) || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const added = (git(projectRoot, ["log", "-n", String(SOFT_RULE.commits), "--diff-filter=A", "--name-only", "--format="]) || "")
    .split("\n")
    .map((x) => x.trim())
    .filter((f) => f && testStyle(f));
  const prFile = [".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md", "docs/pull_request_template.md", "pull_request_template.md"].find((f) =>
    fs.existsSync(path.join(projectRoot, f))
  );
  const prDir = fs.existsSync(path.join(projectRoot, ".github", "PULL_REQUEST_TEMPLATE")) ? ".github/PULL_REQUEST_TEMPLATE/" : null;
  return {
    commits,
    branches: repoBranches(projectRoot),
    tests: files.filter((f) => testStyle(f)),
    recent_tests: added,
    facts: {
      commits: commits.length,
      subject_p90: lens.length ? lens[Math.min(lens.length - 1, Math.ceil(lens.length * 0.9) - 1)] : 0,
      trailers: Object.fromEntries(
        Object.entries(trailers)
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
          .map(([k, n]) => [k, round3(n / (commits.length || 1))])
      ),
      pr_template: prFile || prDir || null,
    },
  };
}

// The re-check on use: 4 of the last 5 samples must still match the ACCEPTED
// value. Fewer than 5 samples: the same 0.8 share of what there is.
function softRecheck(sig, d, value) {
  const recent = (sig.recent ? sig.recent(d) : sig.samples(d)).slice(0, SOFT_RULE.recheck_of);
  const matches = recent.filter((x) => sig.match(x, value)).length;
  const of = recent.length;
  const need = of >= SOFT_RULE.recheck_of ? SOFT_RULE.recheck_need : Math.ceil((of * SOFT_RULE.recheck_need) / SOFT_RULE.recheck_of);
  return { matches, of, holds: of === 0 || matches >= need };
}

const staleWhy = (rc) => `matches ${rc.matches} of the last ${rc.of} — it needs ${SOFT_RULE.recheck_need} of ${SOFT_RULE.recheck_of}`;

function softRows(claudeDir, projectRoot, mode) {
  const d = repoData(projectRoot);
  if (!d) return null;
  const st = readState(claudeDir);
  const soft = st.soft || {};
  const rows = [];
  for (const [id, sig] of Object.entries(SOFT_SIGNALS)) {
    const samples = sig.samples(d);
    const value = sig.value(d);
    const hits = value === null ? [] : samples.filter((x) => sig.match(x, value));
    const n = samples.length;
    const share = n ? round3(hits.length / n) : 0;
    const proposable = value !== null && n >= SOFT_RULE.min_n && share >= SOFT_RULE.share;
    const rec = soft[id] || null;
    let state = "observed";
    let why = null;
    let recheck = null;
    if (rec && rec.state === "applied") {
      recheck = softRecheck(sig, d, rec.value);
      state = recheck.holds ? "applied" : "stale";
      if (!recheck.holds) why = staleWhy(recheck);
    } else if (rec && (rec.state === "declined" || rec.state === "never-ask")) state = rec.state;
    else if (mode === "propose" && proposable) state = "proposed";
    if (state === "observed" && !proposable)
      why = n < SOFT_RULE.min_n ? `${n} sample(s) — a proposal needs ${SOFT_RULE.min_n}` : `share ${share} — a proposal needs ${SOFT_RULE.share}`;
    rows.push({
      id,
      title: sig.title,
      value,
      share,
      n,
      count: hits.length,
      evidence: hits.slice(0, 10).map(sig.ev),
      evidence_count: hits.length,
      proposable,
      state,
      why,
      recheck,
      rule: rec && rec.rule ? rec.rule : value === null ? null : sig.rule(d, value),
      undo: state === "applied" || state === "stale" ? `orc habit repo forget ${id}` : null,
    });
  }
  return { rows, facts: d.facts, state: st };
}

// What `orc rules slice` reads. null under `habits: off` — the slice then
// carries no field and no byte. Git runs only when something was accepted.
function learnedRules(claudeDir, projectRoot, map) {
  if (habitsMode(map) === "off") return null;
  const soft = readState(claudeDir).soft || {};
  const accepted = Object.keys(soft).filter((id) => soft[id] && soft[id].state === "applied" && SOFT_SIGNALS[id] && soft[id].rule);
  if (!accepted.length) return [];
  const d = repoData(projectRoot);
  return accepted.sort().map((id) => {
    const rc = d ? softRecheck(SOFT_SIGNALS[id], d, soft[id].value) : { matches: 0, of: 0, holds: true };
    return Object.assign({ id, rule: soft[id].rule, state: rc.holds ? "applied" : "stale", recheck: rc }, rc.holds ? {} : { why: staleWhy(rc) });
  });
}

// ── The CLI (`orc habit …`, §9) ─────────────────────────────────────────────
const USAGE =
  "Usage: orc habit show [--lane L] [--window 30d|90d|all] | log [--limit N] [--states] | points\n" +
  "       orc habit why <H-id|qid> | accept <H-id> [--keep] | decline <H-id> [--never] | forget <H-id> | reset <H-id>\n" +
  "       orc habit doctor | export | purge --yes      [--json] [--dir <path>]\n" +
  "       orc habit repo [accept <id> | decline <id> [--never] | forget <id>]\n" +
  "  show    exit 0 · 1 no ASK lines yet · 3 habits: off\n" +
  "  log     exit 0 · 1 empty\n" +
  "  why     exit 0 · 2 unknown id\n" +
  "  accept  exit 0 · 2 unknown · 3 habits: off · 4 not proposable (the refusal names why)\n" +
  "  decline|forget|reset  exit 0 · 2 unknown\n" +
  "  doctor  exit 0 clean · 1 findings\n" +
  "  repo    exit 0 · 1 not a git repo · 2 unknown id · 3 habits: off · 4 not proposable\n" +
  "  ORC never applies a habit without your yes. There is no automatic level.";

function habitCmd(deps) {
  const { flag, positionals, emitJson, wantsJson, resolveClaudeDir, readOverride } = deps;
  const pos = positionals();
  const sub = pos[1];
  const arg = pos[2];
  const claudeDir = resolveClaudeDir();
  const { map } = readOverride(claudeDir);
  const mode = habitsMode(map);
  const json = wantsJson();
  const out = (obj, code, human) => {
    if (json) emitJson(obj, code);
    else {
      (human || (() => console.log(JSON.stringify(obj, null, 2))))();
      process.exit(code);
    }
  };
  const fail = (code, reason, message, extra) => out(Object.assign({ ok: false, reason, message }, extra || {}), code, () => console.error("  " + message));
  const now = Date.now();
  const by = ["user", "lane", "panel"].includes(flag("--by")) ? flag("--by") : "user";

  if (sub === "points") {
    const points = Object.entries(ASK_POINTS).map(([qid, p]) => Object.assign({ qid }, p));
    return out({ ok: true, count: points.length, points, meta_qids: HABIT_META_QIDS, classes: ["apply", "suggest", "never"], rule: HABIT_RULE }, 0, () => {
      console.log(`\nORC habit points  (${points.length})\n`);
      for (const p of points) console.log(`  ${p.qid.padEnd(30)} ${p.class.padEnd(8)} ${p.careful ? "careful=" + p.careful : ""}${p.key ? " key=" + p.key : ""}  ${p.title}`);
      console.log("");
    });
  }

  if (sub === "show") {
    if (mode === "off")
      return fail(3, "off", "habits is off. Turn it on with: orc config set habits observe (or propose). Nothing is ever applied without your yes.", {
        mode,
        modes: HABIT_MODES,
        kept: keptAnswers(claudeDir),
        on: HABIT_MODES.filter((m) => m !== "off").map((m) => `orc config set habits ${m}`),
      });
    const w = flag("--window");
    const window_days = w === "30d" ? 30 : w === "90d" ? 90 : null;
    const c = computeRows(claudeDir, deps, { map, mode, window_days: window_days || undefined });
    const lane = typeof flag("--lane") === "string" ? flag("--lane") : null;
    const rows = (lane ? c.rows.filter((r) => r.lanes.includes(lane)) : c.rows.slice()).sort((a, b) => PANEL_ORDER.indexOf(a.state) - PANEL_ORDER.indexOf(b.state));
    const counts = {};
    for (const s of STATE_WORDS) counts[s] = rows.filter((r) => r.state === s).length;
    const days = [];
    for (let d = 13; d >= 0; d--) {
      const day = new Date(now - d * DAY);
      const key = day.toISOString().slice(0, 10);
      days.push({ date: key, answers: c.collected.events.filter((e) => new Date(e.at).toISOString().slice(0, 10) === key).length });
    }
    const ps = panelStats(c.collected, rows, window_days, now, lane);
    const tiles = ps.tiles;
    const rhythm = { days, heat: ps.heat, lanes: ps.lanes, weeks: ps.weeks, qpr: ps.qpr, how: ps.how, by: BY_SET };
    const portrait = ps.portrait;
    const obj = {
      ok: true,
      mode,
      lane,
      window: w || "all",
      log_dir: c.collected.log_dir,
      state_path: statePaths(claudeDir).state,
      cache_path: statePaths(claudeDir).cache,
      traces: c.collected.traces,
      answers: c.collected.events.length,
      excluded_runs: c.collected.excluded,
      count: rows.length,
      rows,
      tiles,
      rhythm,
      portrait,
      proposal: mode === "propose" ? pickProposal(rows, lane) : null,
      state_words: STATE_WORDS,
      rule: HABIT_RULE,
      modes: HABIT_MODES,
      classes: ["apply", "suggest", "never"],
      counts,
      next_run: nextRun(rows),
      files: [path.join(c.collected.log_dir, "*.txt"), statePaths(claudeDir).state],
    };
    const code = c.collected.events.length ? 0 : 1;
    return out(obj, code, () => {
      console.log(`\nORC habits  (${mode})  ${obj.answers} answer(s) in ${obj.traces} trace(s)\n`);
      if (!rows.length) console.log("  No ASK lines yet. Run a lane; each question it asks is recorded in its trace.");
      for (const r of rows) {
        console.log(`  ${r.id}  ${r.state.padEnd(9)} ${r.qid}${Object.keys(r.bucket).length ? " [" + bucketKey(r.bucket) + "]" : ""}`);
        if (r.line) console.log(`      ${r.line}`);
        if (r.why) console.log(`      ↳ ${r.why}`);
        if (r.rule) console.log(`      rule: ${r.rule}`);
        if (r.undo) console.log(`      undo: ${r.undo}`);
      }
      console.log(`\n  states: ${STATE_WORDS.map((s) => `${s} ${counts[s]}`).join(" · ")}`);
      console.log(`  tiles: ${tiles.runs} run(s) · ${tiles.answers} answer(s) · ${tiles.saved} answered for you · ${tiles.qpr === null ? "—" : tiles.qpr} questions per run`);
      console.log(`  rhythm (14 days): ${days.map((x) => x.answers).join(" ")}`);
      for (const p of portrait) console.log(`  portrait: ${p.line}`);
      for (const x of obj.excluded_runs) console.log(`  excluded run: ${x.run} (${x.reason})`);
      if (obj.proposal) console.log(`\n  proposal: ${obj.proposal.line}\n    yes: ${obj.proposal.yes}`);
      console.log("");
    });
  }

  if (sub === "log") {
    const st = readState(claudeDir);
    if (flag("--states")) {
      const history = st.history.slice().reverse().map((h) => Object.assign({}, h, { inverse: inverseOf(h) }));
      return out({ ok: true, count: history.length, history }, history.length ? 0 : 1, () => {
        if (!history.length) console.log("  No habit decisions yet.");
        for (const h of history) console.log(`  ${new Date(h.at).toISOString()}  ${h.id}  ${h.from} → ${h.to}  by ${h.by}${h.reason ? "  — " + h.reason : ""}`);
      });
    }
    const col = collect(claudeDir, deps);
    const lim = Number(flag("--limit")) > 0 ? Number(flag("--limit")) : 40;
    const events = col.events.slice().reverse().slice(0, lim).map((e) => Object.assign({ id: ASK_POINTS[e.qid] ? habitId(e.qid, bucketOf(ASK_POINTS[e.qid], e.ctx)) : null }, e));
    return out({ ok: true, count: events.length, total: col.events.length, events }, events.length ? 0 : 1, () => {
      if (!events.length) console.log("  No ASK lines yet.");
      for (const e of events) console.log(`  ${new Date(e.at).toISOString()}  ${e.qid}  chose=${e.chose} by=${e.by}${e.pre ? " pre=" + e.pre : ""}  (${e.run})`);
    });
  }

  if (sub === "doctor") {
    const col = collect(claudeDir, deps);
    const recent = new Set(col.events.filter((e) => e.at >= now - 30 * DAY).map((e) => e.qid));
    const silent = Object.keys(ASK_POINTS).filter((q) => !recent.has(q));
    const findings = col.unknown.length + col.bad.length + silent.length;
    return out({ ok: true, clean: findings === 0, unknown_qids: col.unknown, bad_lines: col.bad, silent_points: silent, excluded_runs: col.excluded, count: findings }, findings ? 1 : 0, () => {
      console.log(`\norc habit doctor — ${findings ? findings + " finding(s)" : "clean"}\n`);
      for (const u of col.unknown) console.log(`  unknown qid ${u.qid} — ${u.count} line(s) in ${u.runs.join(", ")}`);
      for (const b of col.bad) console.log(`  bad ASK line in ${b.run}: ${b.error}`);
      if (silent.length) console.log(`  ${silent.length} point(s) not emitted in 30 days: ${silent.join(", ")}`);
      console.log("");
    });
  }

  if (sub === "export") {
    const col = collect(claudeDir, deps);
    return out({ ok: true, state_path: statePaths(claudeDir).state, state: readState(claudeDir), events: col.events }, 0);
  }

  if (sub === "purge") {
    if (!flag("--yes")) return fail(1, "needs-yes", "orc habit purge removes every habit decision and makes every past answer stop counting. Add --yes to do it.");
    const p = statePaths(claudeDir);
    const st = emptyState();
    st.purged_at = now;
    st.history.push({ id: "*", from: "any", to: "purged", by, at: now, reason: "orc habit purge --yes" });
    writeState(claudeDir, st);
    try {
      fs.rmSync(p.cache, { force: true });
    } catch (_) {}
    return out({ ok: true, purged_at: now, state_path: p.state, cache_removed: true, traces_touched: false }, 0, () =>
      console.log("  Purged. Every past answer stops counting. The traces themselves are not touched.")
    );
  }

  if (["why", "accept", "decline", "forget", "reset"].includes(sub)) {
    if (!arg) return fail(2, "usage", USAGE);
    const c = computeRows(claudeDir, deps, { map, mode });
    if (sub === "why") {
      const hits = c.rows.filter((r) => r.id === arg || r.qid === arg);
      if (!hits.length) return fail(2, "unknown", `unknown habit id or qid: ${arg}. See: orc habit show`);
      const habits = hits.map((r) => {
        const pt = ASK_POINTS[r.qid];
        const rec = c.state.habits[r.id];
        const cutoff = Math.max((rec && rec.cutoff) || 0, c.state.purged_at || 0);
        const evs = c.collected.events.filter((e) => e.qid === r.qid && bucketKey(bucketOf(pt, e.ctx)) === bucketKey(r.bucket));
        const countedList = evs.filter((e) => e.at >= cutoff && !HABIT_RULE.excluded_by.includes(e.by) && e.at >= now - HABIT_RULE.max_age_days * DAY).slice(-HABIT_RULE.window);
        const L = countedList.length;
        const answers = evs.map((e) => {
          const i = countedList.indexOf(e);
          const counted = i !== -1;
          const reason = counted
            ? null
            : e.at < cutoff
              ? "before a forget or purge"
              : HABIT_RULE.excluded_by.includes(e.by)
                ? `by=${e.by} is not a choice`
                : e.at < now - HABIT_RULE.max_age_days * DAY
                  ? `older than ${HABIT_RULE.max_age_days} days`
                  : `outside the last ${HABIT_RULE.window} answers`;
          const evw = evidenceWeight(e);
          const recw = counted ? Math.pow(0.5, (L - 1 - i) / HABIT_RULE.half_life_answers) : 0;
          return { run: e.run, at: e.at, chose: e.chose, by: e.by, pre: e.pre, ctx: e.ctx, counted, evidence: evw, recency: round3(recw), weight: round3(evw * recw), reason };
        });
        return Object.assign({}, r, { answers });
      });
      return out({ ok: true, query: arg, count: habits.length, habits }, 0, () => {
        for (const h of habits) {
          console.log(`\n  ${h.id}  ${h.qid}  ${h.state}\n      ${h.line || ""}\n      ${h.rule || ""}`);
          for (const a of h.answers)
            console.log(`      ${new Date(a.at).toISOString()}  ${a.chose.padEnd(14)} by=${a.by}${a.pre ? " pre=" + a.pre : ""}  weight ${a.weight}${a.reason ? "  (not counted: " + a.reason + ")" : ""}  ${a.run}`);
        }
        console.log("");
      });
    }
    const st = c.state;
    const row = c.rows.find((r) => r.id === arg);
    if (!row && !st.habits[arg]) return fail(2, "unknown", `unknown habit id: ${arg}. See: orc habit show`);
    const rec = st.habits[arg] || { id: arg, qid: row.qid, bucket: row.bucket, state: "observed" };
    const from = row ? row.state : rec.state;
    const commit = (to, patch, reason) => {
      Object.assign(rec, patch, { id: arg, qid: rec.qid || row.qid, bucket: rec.bucket || row.bucket });
      st.habits[arg] = rec;
      st.history.push({ id: arg, from, to, by, at: now, reason });
      writeState(claudeDir, st);
      return out({ ok: true, id: arg, qid: rec.qid, from, to, option: rec.option || null, value: rec.state === "applied" && ASK_POINTS[rec.qid].class === "apply" ? ASK_POINTS[rec.qid].values[rec.option] : null, undo: to === "applied" ? `orc habit forget ${arg}` : null }, 0, () =>
        console.log(`  ${arg}: ${from} → ${to}${reason ? " — " + reason : ""}`)
      );
    };
    if (sub === "accept") {
      if (mode === "off") return fail(3, "off", "habits is off. Turn it on with: orc config set habits observe (or propose).", { id: arg });
      if (flag("--keep")) {
        if (!rec.option || rec.state !== "applied") return fail(4, "not-proposable", `${arg} has no usual answer to keep. See: orc habit why ${arg}`, { id: arg });
        return commit("applied", { renewed_at: now, at: now }, `kept ${rec.option}`);
      }
      if (!row) return fail(2, "unknown", `unknown habit id: ${arg}`);
      // A re-ask "Switch to Y" is answered by a yes to the NEW option. The rule
      // is not re-run (the overrides are the evidence), but the ratchet is.
      if (row.state === "stale" && row.stale_detail) {
        const y = row.stale_detail.option;
        const pt = ASK_POINTS[row.qid];
        if (effectiveClass(pt, y, row.bucket) === "never")
          return fail(4, "not-proposable", `${arg}: switching to ${y} is class never here — ${pt.why}`, { id: arg });
        return commit("applied", { state: "applied", option: y, at: now, renewed_at: now }, `switched to ${y} after ${row.stale_detail.overrides} overrides`);
      }
      if (row.effective_class === "never")
        return fail(4, "not-proposable", `${arg} is class never here — ${row.why}`, { id: arg, effective_class: row.effective_class });
      if (row.state === "shadowed") return fail(4, "not-proposable", `${arg} is shadowed — ${row.why}`, { id: arg });
      if (!row.passes) return fail(4, "not-proposable", `${arg}: the rule does not pass — ${row.why}`, { id: arg, lb: row.lb, n: row.n, last_agree: row.last_agree });
      return commit("applied", { state: "applied", option: row.top, at: now, renewed_at: now }, `usual: ${row.top} (${row.count} of ${row.total})`);
    }
    if (sub === "decline")
      return flag("--never")
        ? commit("never-ask", { state: "never-ask", at: now }, "never ask")
        : commit("declined", { state: "declined", at: now }, "not now");
    if (sub === "forget") return commit("observed", { state: "observed", option: null, cutoff: now, at: now }, "forgotten — past answers stop counting");
    if (sub === "reset") return commit("observed", { state: "observed", at: now }, "reset — declined / never-ask cleared");
  }

  if (sub === "repo") {
    // DE-16: off = NOTHING — no git call, no row.
    if (mode === "off")
      return fail(3, "off", "habits is off. Turn it on with: orc config set habits observe (or propose). A soft preference is never applied without your yes.", { mode });
    const c = softRows(claudeDir, path.dirname(claudeDir), mode);
    if (!c) return fail(1, "not-git", "orc habit repo reads git history, and this folder is not a git repository.", { mode });
    if (!arg) {
      const obj = { ok: true, mode, rule: SOFT_RULE, facts: c.facts, count: c.rows.length, rows: c.rows, state_path: statePaths(claudeDir).state };
      return out(obj, 0, () => {
        console.log(`\nORC soft preferences  (${mode})  from ${c.facts.commits} commit(s)\n`);
        for (const r of c.rows) {
          console.log(`  ${r.id.padEnd(20)} ${r.state.padEnd(9)} share ${r.share} of ${r.n}${r.value ? "  value=" + r.value : ""}`);
          if (r.rule && (r.state !== "observed" || r.proposable)) console.log(`      rule: ${r.rule}`);
          if (r.why) console.log(`      ↳ ${r.why}`);
          if (r.state === "proposed") console.log(`      yes: orc habit repo accept ${r.id}`);
          if (r.undo) console.log(`      undo: ${r.undo}`);
        }
        console.log(`\n  subject p90: ${c.facts.subject_p90} chars · PR template: ${c.facts.pr_template || "none"}\n`);
      });
    }
    const id = pos[3];
    if (!["accept", "decline", "forget"].includes(arg)) return fail(2, "usage", USAGE);
    const row = c.rows.find((r) => r.id === id);
    if (!row) return fail(2, "unknown", `unknown soft preference: ${id || "(none)"}. One of: ${Object.keys(SOFT_SIGNALS).join(", ")}`);
    const st = c.state;
    st.soft = st.soft || {};
    const from = row.state;
    const commit = (to, rec, reason) => {
      if (rec) st.soft[id] = rec;
      else delete st.soft[id];
      st.history.push({ id, from, to, by, at: now, reason });
      writeState(claudeDir, st);
      return out({ ok: true, id, from, to, rule: rec ? rec.rule || null : null, undo: to === "applied" ? `orc habit repo forget ${id}` : null }, 0, () =>
        console.log(`  ${id}: ${from} → ${to}${reason ? " — " + reason : ""}`)
      );
    };
    if (arg === "accept") {
      if (!row.proposable)
        return fail(4, "not-proposable", `${id}: ${row.why || "the rule does not pass"}. A soft preference needs a share of ${SOFT_RULE.share} over ${SOFT_RULE.min_n} samples.`, { id, share: row.share, n: row.n });
      return commit("applied", { id, state: "applied", value: row.value, rule: row.rule, share: row.share, n: row.n, evidence: row.evidence, at: now }, `share ${row.share} of ${row.n}`);
    }
    if (arg === "decline") {
      const to = flag("--never") ? "never-ask" : "declined";
      return commit(to, { id, state: to, at: now }, to === "never-ask" ? "never ask" : "not now");
    }
    return commit("observed", null, "forgotten — it leaves the rules card");
  }
  return fail(sub ? 2 : 1, "usage", USAGE);
}

module.exports = {
  ASK_POINTS,
  HABIT_META_QIDS,
  HABIT_RULE,
  HABIT_MODES,
  HABIT_KEYS,
  HABIT_FAMILIES,
  STATE_WORDS,
  pointFor,
  parseAskLine,
  wilsonLB,
  kish,
  ruleOnCounts,
  evidenceWeight,
  evaluate,
  effectiveClass,
  habitId,
  bucketOf,
  branchClass,
  statePaths,
  readState,
  habitsMode,
  collect,
  questionStats,
  computeRows,
  pickProposal,
  learnedFor,
  laneBlock,
  announceLine,
  habitCmd,
  SOFT_RULE,
  SOFT_SIGNALS,
  softRows,
  learnedRules,
};
