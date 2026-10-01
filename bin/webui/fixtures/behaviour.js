"use strict";
/* fixtures/behaviour.js — canned data for `orc ui --fixtures`.
   The Behaviour panel (v2.0.0 W7): `orc habit show|log|points --json`,
   `orc gotcha list|card|quality|list --candidates --json`.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. Here that is every habit state (observed · proposed · applied ·
   declined · never-ask · stale · shadowed · never), every class (apply ·
   suggest · never), every `habits` mode (off · observe · propose), every
   `by=` value, every gotcha source and status, and the three empty answers
   (no traces yet, below the review floor, a card with zero matches).
   test/webui/fixtures.test.js counts them.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const DAY = 86400000;
const NOW = Date.now();
const LOG_DIR = PROJECT + "/.claude/orc/logs";
const STATE_PATH = PROJECT + "/.claude/orc/habits-state.json";
const CACHE_PATH = PROJECT + "/.claude/orc/habits-cache.json";
const STATE_WORDS = ["observed", "proposed", "applied", "declined", "never-ask", "stale", "shadowed", "never"];
const BY_SET = ["user", "ledger", "learned", "config", "default"];
const RULE = { window: 30, max_age_days: 180, half_life_answers: 10, weights: { user: 1, override: 1, ledger: 1, learned: 0.25, preselected: 0.25 }, excluded_by: ["config", "default"], min_n: 5, lb: 0.55, z: 1.96, last_agree: 3, stale_overrides: 2, stale_of: 3, expiry_days: 90, cooldown_answers: 10, cooldown_days: 14 };

const NULL_COMMANDS = { accept: null, decline: null, never: null, forget: null, reset: null, manual: null };
// One row, every key `habit show --json` emits, in its order.
function row(o) {
  const base = {
    id: "H-000000",
    qid: "",
    lanes: [],
    title: "",
    class: "suggest",
    effective_class: "suggest",
    careful: null,
    key: null,
    bucket: {},
    state: "observed",
    why: null,
    stale_reason: null,
    stale_detail: null,
    top: null,
    top_label: null,
    count: 0,
    total: 0,
    n: 0,
    n_eff: 0,
    p: 0,
    lb: 0,
    last_agree: false,
    passes: false,
    proposable: false,
    option: null,
    value: null,
    decided_at: null,
    last_used: null,
    line: null,
    rule: null,
    undo: null,
    options: [],
    share: 0,
    streak: [],
    context: "",
    effect: null,
    commands: NULL_COMMANDS,
  };
  const r = Object.assign(base, o);
  r.commands = Object.assign({}, NULL_COMMANDS, o.commands || {});
  return r;
}
const ruleLine = (lb, n_eff, n) => `Wilson95 LB ${lb} (n_eff ${n_eff}, raw n ${n}) — proposes at ≥ 0.55 with n ≥ 5 and the last 3 agreeing`;

const ROWS = [
  row({
    id: "H-4c1a9e", qid: "quick.q3.offer.review", lanes: ["orc-quick"], title: "Code review before commit", careful: "review-first",
    bucket: { kind: "feature" }, state: "proposed", why: "the rule passes — proposed once, at the end of a run",
    top: "review-first", top_label: "review first", count: 9, total: 10, n: 10, n_eff: 7.82, p: 0.9, lb: 0.6, last_agree: true, passes: true, proposable: true,
    line: 'You chose review first in 9 of your last 10 answers to "Code review before commit" (one "commit directly" on 14-09).',
    rule: ruleLine(0.6, 7.82, 10),
    options: [{ v: "review-first", label: "review first", n: 9 }, { v: "commit-direct", label: "commit directly", n: 1 }, { v: "stop", label: "stop", n: 0 }],
    share: 0.9, streak: [1, 1, 0, 1, 1, 0.25, 1, 1, 1, 1], context: "kind=feature",
    effect: "If you accept, ORC puts review first first and marks it → usual. The question is still asked.",
    commands: { accept: "orc habit accept H-4c1a9e", decline: "orc habit decline H-4c1a9e", never: "orc habit decline H-4c1a9e --never" },
  }),
  row({
    id: "H-7d20b3", qid: "orc.phase-2.pause", lanes: ["orc"], title: "How often the run pauses", class: "apply", effective_class: "apply", careful: "every-1", key: "batch_pause_every",
    state: "stale", stale_reason: "override", stale_detail: { option: "every-2", overrides: 2, of: 3 },
    why: "you chose pause every 2 waves 2 of the last 3 times instead of your usual pause every wave — paused, not flipped",
    top: "every-1", top_label: "pause every wave", count: 7, total: 10, n: 10, n_eff: 7.1, p: 0.7, lb: 0.39, last_agree: false, option: "every-1", decided_at: NOW - 40 * DAY, last_used: NOW - 3 * DAY,
    line: 'You chose pause every wave in 7 of your last 10 answers to "How often the run pauses" (3 other answers, the last "pause every 2 waves" on 25-09).',
    rule: ruleLine(0.39, 7.1, 10), undo: "orc habit forget H-7d20b3",
    options: [{ v: "every-1", label: "pause every wave", n: 7 }, { v: "every-2", label: "pause every 2 waves", n: 3 }],
    share: 0.7, streak: [1, 1, 1, 1, 1, 1, 1, 0, 1, 0],
    effect: "ORC paused this habit. The question is asked again until you decide.",
    commands: { forget: "orc habit forget H-7d20b3" },
  }),
  row({
    id: "H-a19f02", qid: "mini.phase-x.mock", lanes: ["orc-mini"], title: "Mocked runnable example", class: "apply", effective_class: "apply", key: "mock_example",
    state: "applied", why: "answers mock_example at the learned rank",
    top: "skip", top_label: "skip it", count: 12, total: 13, n: 13, n_eff: 9.4, p: 0.92, lb: 0.71, last_agree: true, passes: true, option: "skip", value: "off", decided_at: NOW - 21 * DAY, last_used: NOW - 1 * DAY,
    line: 'You chose skip it in 12 of your last 13 answers to "Mocked runnable example" (one "build the example" on 02-09).',
    rule: ruleLine(0.71, 9.4, 13), undo: "orc habit forget H-a19f02",
    options: [{ v: "skip", label: "skip it", n: 12 }, { v: "build", label: "build the example", n: 1 }],
    share: 0.923, streak: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    effect: "ORC answers mock_example with skip it at the learned rank. Your config file still wins.",
    commands: { forget: "orc habit forget H-a19f02" },
  }),
  row({
    id: "H-0b77c5", qid: "orc.phase-8.ship", lanes: ["orc"], title: "How the change ships", bucket: { branch: "feature" },
    state: "applied", why: "marks open a PR as your usual; the question is still asked",
    top: "pr", top_label: "open a PR", count: 10, total: 11, n: 11, n_eff: 8.2, p: 0.91, lb: 0.66, last_agree: true, passes: true, option: "pr", decided_at: NOW - 30 * DAY, last_used: NOW - 2 * DAY,
    line: 'You chose open a PR in 10 of your last 11 answers to "How the change ships" (one "commit only" on 28-08).',
    rule: ruleLine(0.66, 8.2, 11), undo: "orc habit forget H-0b77c5",
    options: [{ v: "pr", label: "open a PR", n: 10 }, { v: "commit", label: "commit only", n: 1 }, { v: "leave", label: "leave it uncommitted", n: 0 }],
    share: 0.909, streak: [1, 1, 1, 1, 0.25, 1, 1, 1, 1, 1], context: "branch=feature",
    effect: "ORC puts open a PR first and marks it → usual. The question is still asked.",
    commands: { forget: "orc habit forget H-0b77c5" },
  }),
  row({
    id: "H-3e5d18", qid: "any.analysis.depth", lanes: ["orc", "orc-analyze"], title: "Analysis depth",
    state: "observed", why: "3 full-weight answers — the rule needs 5",
    top: "standard", top_label: "standard", count: 3, total: 4, n: 3, n_eff: 3.4, p: 0.75, lb: 0.3,
    line: 'You chose standard in 3 of your last 4 answers to "Analysis depth" (one "deep" on 11-09).',
    rule: ruleLine(0.3, 3.4, 3),
    options: [{ v: "standard", label: "standard", n: 3 }, { v: "deep", label: "deep", n: 1 }],
    share: 0.75, streak: [1, 0, 1, 1],
    effect: "If you accept, ORC puts standard first and marks it → usual. The question is still asked.",
  }),
  row({
    id: "H-92ab40", qid: "orc.intake.testgen", lanes: ["orc"], title: "Author test cases before ship", class: "apply", effective_class: "apply", careful: "author", key: "generate_tests",
    state: "shadowed", why: "your config sets generate_tests: true — the file wins, so this habit is shown and inert (was: proposed)",
    top: "author", top_label: "author tests", count: 8, total: 8, n: 8, n_eff: 6.9, p: 1, lb: 0.65, last_agree: true, passes: true,
    line: 'You chose author tests in 8 of your last 8 answers to "Author test cases before ship".',
    rule: ruleLine(0.65, 6.9, 8),
    options: [{ v: "author", label: "author tests", n: 8 }, { v: "skip", label: "skip tests", n: 0 }],
    share: 1, streak: [1, 1, 1, 1, 1, 1, 1, 1],
    effect: "If you accept, ORC answers generate_tests with author tests at the learned rank. Your config file still wins.",
  }),
  row({
    id: "H-5f6e21", qid: "orc.phase-1.planner", lanes: ["orc"], title: "Which planner writes the plan",
    state: "declined", why: "declined — it can come back after 10 more answers (4 so far) and 14 days (6 so far)",
    top: "planner", top_label: "ORC planner", count: 8, total: 9, n: 9, n_eff: 7, p: 0.89, lb: 0.58, last_agree: true, passes: true, decided_at: NOW - 6 * DAY,
    line: 'You chose ORC planner in 8 of your last 9 answers to "Which planner writes the plan" (one "Superpowers" on 03-09).',
    rule: ruleLine(0.58, 7, 9), undo: "orc habit forget H-5f6e21",
    options: [{ v: "planner", label: "ORC planner", n: 8 }, { v: "superpowers", label: "Superpowers", n: 1 }],
    share: 0.889, streak: [1, 1, 0, 1, 1, 1, 1, 1, 1],
    effect: "If you accept, ORC puts ORC planner first and marks it → usual. The question is still asked.",
    commands: { reset: "orc habit reset H-5f6e21" },
  }),
  row({
    id: "H-c40d9a", qid: "fast.f0.stale-wiki", lanes: ["orc-fast"], title: "A stale wiki at preflight",
    state: "never-ask", why: "you said never — still observed, never proposed",
    top: "refresh", top_label: "refresh the wiki", count: 6, total: 7, n: 7, n_eff: 5.8, p: 0.86, lb: 0.56, last_agree: true, passes: true, decided_at: NOW - 12 * DAY,
    line: 'You chose refresh the wiki in 6 of your last 7 answers to "A stale wiki at preflight" (one "fall back to /orc-mini" on 01-09).',
    rule: ruleLine(0.56, 5.8, 7), undo: "orc habit forget H-c40d9a",
    options: [{ v: "refresh", label: "refresh the wiki", n: 6 }, { v: "mini", label: "fall back to /orc-mini", n: 1 }],
    share: 0.857, streak: [1, 1, 1, 0, 1, 1, 1],
    effect: "If you accept, ORC puts refresh the wiki first and marks it → usual. The question is still asked.",
    commands: { reset: "orc habit reset H-c40d9a" },
  }),
  row({
    id: "H-e81f63", qid: "orc.phase-5-5.security", lanes: ["orc", "orc-diy"], title: "Security review", class: "apply", effective_class: "never", careful: "run", key: "security_review",
    state: "never", why: "your usual answer (skip it) is away from the careful side, so it is never applied — toward `on` only — a habit to skip security is never applied",
    top: "skip", top_label: "skip it", count: 9, total: 10, n: 10, n_eff: 7.6, p: 0.9, lb: 0.6, last_agree: true, passes: true,
    line: 'You chose skip it in 9 of your last 10 answers to "Security review" (one "run the security pass" on 09-09).',
    rule: ruleLine(0.6, 7.6, 10),
    options: [{ v: "skip", label: "skip it", n: 9 }, { v: "run", label: "run the security pass", n: 1 }],
    share: 0.9, streak: [1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
    effect: "ORC shows this and never proposes it: toward `on` only — a habit to skip security is never applied.",
    commands: { manual: "orc config set security_review off" },
  }),
  row({
    id: "H-18aa7f", qid: "orc.phase-2.execution", lanes: ["orc"], title: "How the waves execute", effective_class: "never",
    state: "never", why: "the habit only orders the offer",
    top: "other", top_label: "other", count: 5, total: 8, n: 8, n_eff: 6, p: 0.63, lb: 0.31,
    line: 'You chose other in 5 of your last 8 answers to "How the waves execute" (3 other answers, the last "parallel" on 20-09).',
    rule: ruleLine(0.31, 6, 8),
    options: [{ v: "other", label: "other", n: 5 }, { v: "parallel", label: "parallel", n: 3 }],
    share: 0.625, streak: [0, 1, 1, 0, 1, 1, 0, 1],
    effect: "ORC shows this and never proposes it: the habit only orders the offer.",
  }),
];

function countsOf(rows) {
  const c = {};
  for (const s of STATE_WORDS) c[s] = rows.filter((r) => r.state === s).length;
  return c;
}

// The heat map: weekday (Mon first) × hour. Deterministic, work-hours heavy.
function heatMap(scale) {
  const out = [];
  for (let d = 0; d < 7; d++) {
    const r = [];
    for (let h = 0; h < 24; h++) {
      const work = d < 5 && h >= 9 && h <= 18 ? 1 : 0;
      const v = work ? ((d * 7 + h * 3) % 5) + (h === 14 ? 3 : 0) : d >= 5 && h === 11 ? 1 : 0;
      r.push(Math.round(v * scale));
    }
    out.push(r);
  }
  return out;
}
const WEEKS = Array.from({ length: 12 }, (_, i) => new Date(NOW - (12 - i) * 7 * DAY).toISOString().slice(0, 10));
const HOW = [
  [30, 4, 0, 2, 1], [28, 5, 0, 2, 1], [27, 6, 1, 3, 0], [25, 6, 2, 3, 1], [24, 7, 3, 3, 0], [22, 8, 4, 3, 1],
  [20, 8, 5, 4, 1], [19, 9, 6, 4, 0], [17, 9, 7, 4, 1], [16, 10, 8, 5, 1], [15, 10, 9, 5, 0], [14, 11, 9, 5, 1],
].map((w) => Object.fromEntries(BY_SET.map((b, i) => [b, w[i]])));

function show(mode, rows) {
  const heat = heatMap(1);
  return {
    ok: true,
    mode,
    lane: null,
    window: "90d",
    log_dir: LOG_DIR,
    state_path: STATE_PATH,
    cache_path: CACHE_PATH,
    traces: 94,
    answers: 412,
    excluded_runs: [{ run: "run-orc-pr-review-120926-101500.txt", reason: "untrusted_context" }],
    count: rows.length,
    rows,
    tiles: { runs: 94, answers: 412, saved: 57, saved_prev: 36, qpr: 3.9, qpr_prev: 6.8 },
    rhythm: {
      days: Array.from({ length: 14 }, (_, i) => ({ date: new Date(NOW - (13 - i) * DAY).toISOString().slice(0, 10), answers: [4, 6, 0, 0, 9, 7, 5, 8, 3, 0, 0, 6, 7, 5][i] })),
      heat,
      lanes: [{ lane: "orc-quick", n: 38 }, { lane: "orc-mini", n: 22 }, { lane: "orc", n: 17 }, { lane: "orc-fast", n: 9 }, { lane: "orc-analyze", n: 5 }, { lane: "orc-diy", n: 3 }],
      weeks: WEEKS,
      qpr: [6.8, 6.5, 6.1, 5.9, null, 5.2, 4.9, 4.6, 4.4, 4.2, 4.0, 3.9],
      how: HOW,
      by: BY_SET,
    },
    portrait: [
      { k: "lanes", line: "You run most work through orc-quick (40% of 94 runs)." },
      { k: "time", line: "Your busiest hour is Tue 14:00 (7 runs)." },
      { k: "questions", line: "You answered 3.9 questions per run, against 6.8 in the window before." },
      { k: "usual", line: "Mocked runnable example: usually skip it (12 of 13)." },
    ].concat(mode === "propose" ? [{ k: "proposal", line: "1 habit is ready for your decision." }] : []),
    proposal:
      mode === "propose" && rows.length
        ? { id: "H-4c1a9e", qid: "quick.q3.offer.review", kind: "propose", option: "review-first", line: ROWS[0].line + " Make it your usual? [yes · not now · never]", yes: "orc habit accept H-4c1a9e", keep: null, later: "orc habit decline H-4c1a9e", never: "orc habit decline H-4c1a9e --never", trace: "ASK habit.proposal :: offered=yes|later|never rec=none chose=<yes|later|never> by=user" }
        : null,
    state_words: STATE_WORDS,
    rule: RULE,
    modes: ["off", "observe", "propose"],
    classes: ["apply", "suggest", "never"],
    counts: countsOf(rows),
    next_run: [
      { lane: "orc", id: "H-0b77c5", qid: "orc.phase-8.ship", line: '"How the change ships" offers open a PR first, marked → usual (H-0b77c5)' },
      { lane: "orc-mini", id: "H-a19f02", qid: "mini.phase-x.mock", line: "mock_example: off — learned (H-a19f02)" },
    ],
    files: [LOG_DIR + "/*.txt", STATE_PATH],
  };
}

// `habits: propose` — every state, with the proposal.
const habitsPropose = show("propose", ROWS);
// `habits: observe` — the tabs fill, and NOTHING is proposed: the row the rule
// passes for stays `observed` (the CLI's "`habits: observe` never proposes").
const habitsObserve = show(
  "observe",
  ROWS.map((r) =>
    r.commands.accept
      ? Object.assign({}, r, { state: "observed", why: "the rule passes — `habits: observe` never proposes", commands: NULL_COMMANDS })
      : r
  )
);
// `habits: off` — exit 3. It reads only the cache an earlier on-period left.
const habitsOff = {
  ok: false,
  reason: "off",
  message: "habits is off. Turn it on with: orc config set habits observe (or propose). Nothing is ever applied without your yes.",
  mode: "off",
  modes: ["off", "observe", "propose"],
  kept: 212,
  on: ["orc config set habits observe", "orc config set habits propose"],
};
// Exit 1 — no ASK lines yet in this window.
const habitsEmpty = Object.assign(show("propose", []), {
  window: "30d",
  traces: 0,
  answers: 0,
  excluded_runs: [],
  tiles: { runs: 0, answers: 0, saved: 0, saved_prev: 0, qpr: null, qpr_prev: null },
  portrait: [],
  proposal: null,
  next_run: [],
});
habitsEmpty.rhythm = Object.assign({}, habitsEmpty.rhythm, {
  heat: heatMap(0),
  lanes: [],
  qpr: Array(12).fill(null),
  how: Array.from({ length: 12 }, () => Object.fromEntries(BY_SET.map((b) => [b, 0]))),
  days: habitsEmpty.rhythm.days.map((d) => ({ date: d.date, answers: 0 })),
});

// `orc habit log --json --limit 40` — every by= value.
const LOG_ROWS = [
  ["quick.q3.offer.review", "orc-quick", "review-first", "user", "review-first"],
  ["mini.phase-x.mock", "orc-mini", "skip", "learned", "skip"],
  ["orc.phase-8.ship", "orc", "pr", "user", "pr"],
  ["orc.intake.testgen", "orc", "author", "config", null],
  ["orc.phase-5-5.security", "orc", "skip", "user", null],
  ["any.analysis.depth", "orc-analyze", "standard", "ledger", null],
  ["orc.phase-2.pause", "orc", "every-2", "user", "every-1"],
  ["any.stop.where", "orc-mini", "here", "default", null],
  ["quick.q3.offer.tests", "orc-quick", "update", "user", null],
  ["orc.phase-1.planner", "orc", "planner", "user", null],
];
const habitLog = {
  ok: true,
  count: LOG_ROWS.length,
  total: 412,
  events: LOG_ROWS.map(([qid, lane, chose, by, pre], i) => ({
    id: "H-" + (0x1a2b3c + i * 977).toString(16).slice(0, 6),
    run: `run-${lane}-fixture-${i}.txt`,
    lane,
    at: NOW - (i * 3 + 1) * 3600000,
    qid,
    offered: [chose, "other"],
    rec: pre || "none",
    chose,
    by,
    pre,
    ctx: {},
  })),
};
const habitLogEmpty = { ok: true, count: 0, total: 0, events: [] };

// `orc habit log --states --json` — every `by` a change can carry.
const habitStates = {
  ok: true,
  count: 5,
  history: [
    { id: "H-7d20b3", from: "applied", to: "stale", by: "system", at: NOW - 3 * DAY, reason: "2 overrides in the last 3", inverse: null },
    { id: "H-5f6e21", from: "proposed", to: "declined", by: "panel", at: NOW - 6 * DAY, reason: "not now", inverse: "orc habit reset H-5f6e21" },
    { id: "H-c40d9a", from: "proposed", to: "never-ask", by: "lane", at: NOW - 12 * DAY, reason: "never ask", inverse: "orc habit reset H-c40d9a" },
    { id: "H-a19f02", from: "proposed", to: "applied", by: "user", at: NOW - 21 * DAY, reason: "usual: skip (12 of 13)", inverse: "orc habit forget H-a19f02" },
    { id: "H-0b77c5", from: "proposed", to: "applied", by: "lane", at: NOW - 30 * DAY, reason: "usual: pr (10 of 11)", inverse: "orc habit forget H-0b77c5" },
  ],
};

// `orc habit points --json` — a slice of the registry (the shape, not all 30).
const habitPoints = {
  ok: true,
  count: 2,
  points: [
    { qid: "mini.phase-x.mock", lanes: ["orc-mini"], phase: "phase-x", file: "orc-mini/SKILL.md", title: "Mocked runnable example", options: { build: "build the example", skip: "skip it" }, class: "apply", careful: null, key: "mock_example", values: { build: "on", skip: "off" }, ctx: [], why: "a mock example has no careful side, so both answers can be learned" },
    { qid: "quick.q3.offer.review", lanes: ["orc-quick"], phase: "q3", file: "orc-quick/SKILL.md", title: "Code review before commit", options: { "review-first": "review first", "commit-direct": "commit directly", stop: "stop" }, class: "suggest", careful: "review-first", key: null, ctx: ["kind", "branch"], why: "a review is a dispatch, so its gate is still asked — the habit only orders the offer" },
  ],
  meta_qids: ["habit.proposal"],
  classes: ["apply", "suggest", "never"],
  rule: RULE,
};

// ── Gotchas ─────────────────────────────────────────────────────────────────
// The EXTRA ledger entries (G-004 …) that, with Knowledge's three, carry every
// source and every status. knowledge.js appends them to `gotchas`.
const SOURCES = ["repair", "drift", "review", "verify", "defect", "pr", "sonar", "sarif", "ci", "dismissal"];
const KIND_OF = { repair: "repair", drift: "drift", review: "review", verify: "verify", defect: "repair", ci: "repair", pr: "review", sonar: "review", sarif: "review", dismissal: "review" };
const EXTRA = [
  ["G-004", "orders", "drift", { rule: null, scope: "src/orders/**/*.ts", symptom: "the schema and the client disagree on totalCents", fix: "regenerate the client after a schema change", origin: "run-orc-orders-100926-091200 · drift" }, "active", [0, 1, 0, 2, 1, 0, 1]],
  ["G-005", "billing", "defect", { rule: "repro red→green", scope: "src/billing/**", symptom: "a refund is booked twice on retry", fix: "key the refund on the idempotency key", origin: "issue 88 · 03-09-2026" }, "active", [0, 0, 1, 0, 0, 2, 1]],
  ["G-006", "api", "pr", { rule: "PR 142 · thread 3", scope: "src/routes/**/*.js", symptom: "a handler returns 200 on a validation error", fix: "return 422 with the field name", origin: "PR 142 · thread 3 · 08-09-2026" }, "active", [1, 0, 2, 1, 0, 1, 3]],
  ["G-007", "client", "sonar", { rule: "typescript:S1854", scope: "client/src/**/*.vue", symptom: "a dead store in a computed property", fix: "remove the unused assignment", origin: "sonar · 11-09-2026" }, "active", [2, 1, 1, 0, 2, 1, 1]],
  ["G-008", "infra", "sarif", { rule: "js/path-injection", scope: "src/export/**", symptom: "a file path built from a query string", fix: "resolve under the export root and refuse ..", origin: "sarif codeql.sarif · 12-09-2026" }, "active", [0, 0, 0, 1, 0, 1, 0]],
  ["G-009", "build", "ci", { rule: "ci: lint", scope: "src/**/*.ts", symptom: "CI lint fails on an unused import", fix: "run the linter before you push", origin: "CI run 5521 · 15-09-2026" }, "quiet", [0, 0, 0, 0, 0, 0, 0]],
  ["G-010", "i18n", "dismissal", { rule: null, scope: "client/src/i18n/**", symptom: "long translation files flagged as too long", fix: "(do not flag)", origin: "dismissal · 18-09-2026", polarity: "suppress" }, "active", [0, 1, 0, 1, 1, 0, 1]],
  ["G-011", "legacy", "repair", { rule: null, scope: "src/legacy-session/**", symptom: "the old session cookie is read twice", fix: "read it once in the middleware", origin: "run-orc-auth-020826-100000 · repair" }, "orphaned", [0, 0, 0, 0, 0, 0, 0]],
];
const gotchaExtraEntries = EXTRA.map(([id, area, source, f]) => ({
  id,
  area,
  kind: KIND_OF[source],
  hits: 3,
  last_seen: "20-09-2026",
  trigger: f.symptom,
  fields: Object.assign({ trigger: f.symptom, symptom: f.symptom, cause: "(see origin)", fix: f.fix, scope: f.scope, origin: f.origin, hits: "3", last_seen: "20-09-2026", source }, f.rule ? { rule: f.rule } : {}, f.polarity ? { polarity: f.polarity } : {}),
}));
// The panel view `orc gotcha list --json` carries as `panel`, for G-001 … G-011.
const BASE_ROWS = [
  { id: "G-001", source: "repair", status: "active", status_reason: null, rule: null, scope: "tests/**/*.test.js", fix: "close the http server in afterAll and await it", symptom: "`npm test` never exits; CI times out at 10 minutes", polarity: "flag", origin: "run-orc-add-billing-050826-141233 · TDD repair round 2", weeks: [1, 0, 2, 1, 0, 1, 2] },
  { id: "G-002", source: "review", status: "active", status_reason: null, rule: null, scope: "client/src/**/*.tsx", fix: "use parseInZone from src/time/zone.ts", symptom: "bookings land one day early for users west of UTC", polarity: "flag", origin: "run-orc-bookings-220726-093000 · review", weeks: [0, 0, 1, 0, 0, 1, 0] },
  { id: "G-003", source: "verify", status: "quiet", status_reason: null, rule: null, scope: ".github/workflows/**", fix: "set NODE_OPTIONS in the workflow, not in package.json", symptom: "the CI build is OOM-killed with no error line", polarity: "flag", origin: "run-orc-ci-140626-110000 · verify", weeks: [0, 0, 0, 0, 0, 0, 0] },
];
const panelRows = BASE_ROWS.concat(
  EXTRA.map(([id, , source, f, status, weeks]) => ({
    id,
    source,
    status,
    status_reason: status === "orphaned" ? "its scope matches no tracked file" : null,
    rule: f.rule || null,
    scope: f.scope,
    fix: f.fix,
    symptom: f.symptom,
    polarity: f.polarity || "flag",
    origin: f.origin,
    weeks,
  }))
);
const bySource = {};
for (const r of panelRows) bySource[r.source] = (bySource[r.source] || 0) + 1;
const gotchaPanel = {
  sources: SOURCES,
  statuses: ["active", "candidate", "quiet", "orphaned"],
  by_source: SOURCES.filter((s) => bySource[s]).map((s) => ({ source: s, n: bySource[s] })),
  status_counts: { active: panelRows.filter((r) => r.status === "active").length, candidate: 1, quiet: 2, orphaned: 1 },
  rows: panelRows,
  sync: {
    last_sync: new Date(NOW - 2 * 3600000).toISOString(),
    sources: [
      { name: "sonar", state: "ok", last_ok: new Date(NOW - 2 * 3600000).toISOString(), last_error: null },
      { name: "pr", state: "ok", last_ok: new Date(NOW - 2 * 3600000).toISOString(), last_error: null },
      { name: "ci", state: "timed out", last_ok: new Date(NOW - 3 * DAY).toISOString(), last_error: "ci timed out" },
      { name: "defects", state: "not configured", last_ok: null, last_error: null },
    ],
  },
};

// `orc gotcha card --files … --json --full` — a match, and the zero-match ANSWER.
const gotchaCard = {
  ok: true,
  lane: null,
  text: "gotchas (3 of 11 match):\nG-006 PR 142 · thread 3 · src/routes/**/*.js · a handler returns 200 on a validation error → return 422 with the field name (3×)\nG-001 repair · tests/**/*.test.js · `npm test` never exits; CI times out at 10 minutes → close the http server in afterAll and await it (7×)\ndo not flag: G-010 · client/src/i18n/** · long translation files flagged as too long (the team disputed this 3×)",
  ids: ["G-006", "G-001", "G-010"],
  matched: 3,
  known: 11,
  dropped: 0,
  orphaned: ["G-011"],
  quiet: 1,
  budget: 600,
  tokens: 96,
  rows: [
    { id: "G-006", type: "flag", text: "G-006 PR 142 · thread 3 · src/routes/**/*.js · a handler returns 200 on a validation error → return 422 with the field name (3×)", rank: 2.1, miss: false, kept: true, dropped: null },
    { id: "G-001", type: "flag", text: "G-001 repair · tests/**/*.test.js · `npm test` never exits; CI times out at 10 minutes → close the http server in afterAll and await it (7×)", rank: 1.7, miss: false, kept: true, dropped: null },
    { id: "G-010", type: "suppress", text: "do not flag: G-010 · client/src/i18n/** · long translation files flagged as too long (the team disputed this 3×)", rank: 0.9, miss: false, kept: true, dropped: null },
  ],
  orphaned_rows: [{ id: "G-011", why: "its scope matches no tracked file" }],
};
const gotchaCardNone = { ok: true, lane: null, text: "", ids: [], matched: 0, known: 11, dropped: 0, orphaned: [], quiet: 1, budget: 600, tokens: 0 };

// `orc gotcha quality --json` — above the floor, and below it (exit 1).
const SERIES = [0.48, 0.5, 0.46, 0.55, 0.58, 0.52, 0.6, 0.63, 0.61, 0.66, 0.69, 0.71];
const P3 = [4.1, 3.8, 3.9, 3.2, 3.0, 2.8, 2.6, 2.3, 2.1, 1.9, 1.7, 1.6];
const gotchaQuality = {
  ok: true,
  window_days: 90,
  reviews: 12,
  reviews_traced: 12,
  reviews_observed: 9,
  by_reviewer: { orc: 12, "/code-review": 2 },
  project_reviews: 2,
  // v2.1.0 W6 — `orc fix record`: the fixes made after a review, and the misses.
  fixes: {
    total: 5,
    by_introduced_by: { orc: 2, ai: 1, human: 1, unknown: 1 },
    by_source: { sonar: 2, defect: 2, ci: 1 },
    causes: [
      { id: "sonar", n: 2, share: 0.4 },
      { id: "orc", n: 1, share: 0.2 },
      { id: "ai", n: 1, share: 0.2 },
      { id: "other", n: 1, share: 0.2 },
    ],
  },
  misses: {
    total: 1,
    by_category: [{ category: "functional.logic", n: 1 }],
    list: [
      { obs: "9f2c41ab", at: new Date(NOW - 3 * DAY).toISOString().slice(0, 10), path: "src/orders/total.ts", lines: [40, 58], source: "sonar", rule: "sonar:typescript:S3776", category: "functional.logic", introduced_by: "orc", missed_by: "run-mini-total-290926-101500", fix_run: "run-quick-total-fix-021026-091200" },
    ],
  },
  floor: 5,
  below_floor: false,
  findings: 118,
  categories: [
    { category: "security", findings: 14, addressed: 12, disputed: 1, wontfix: 1, open: 0, acceptance: 0.857, noisy: false },
    { category: "functional.logic", findings: 31, addressed: 21, disputed: 6, wontfix: 2, open: 2, acceptance: 0.724, noisy: false },
    { category: "test", findings: 22, addressed: 10, disputed: 8, wontfix: 2, open: 2, acceptance: 0.5, noisy: false },
    { category: "evolvability.structure", findings: 28, addressed: 7, disputed: 16, wontfix: 3, open: 2, acceptance: 0.269, noisy: true },
    { category: "evolvability.documentation", findings: 23, addressed: 9, disputed: 9, wontfix: 3, open: 2, acceptance: 0.429, noisy: false },
  ],
  gotchas: [{ id: "G-001", helpful: 4, harmful: 0, retire: false }, { id: "G-010", helpful: 0, harmful: 3, retire: true }],
  p3_per_review: 2.75,
  trend: { first_half: 0.53, second_half: 0.67, direction: "up" },
  target: 0.6,
  bands: { ok: 0.6, warn: 0.35 },
  series: SERIES.map((a, i) => ({ run: `run-orc-review-${i + 1}`, at: new Date(NOW - (12 - i) * 4 * DAY).toISOString(), findings: 10, acceptance: a, p3: P3[i] })),
  floor_line: null,
};
const gotchaQualityLow = {
  ok: true,
  window_days: 30,
  reviews: 3,
  // v2.1.0 — one review counted from its trace only (a clean review).
  reviews_traced: 3,
  reviews_observed: 2,
  by_reviewer: { orc: 3 },
  project_reviews: 0,
  fixes: { total: 0, by_introduced_by: { orc: 0, ai: 0, human: 0, unknown: 0 }, by_source: {}, causes: [{ id: "sonar", n: 0, share: 0 }, { id: "orc", n: 0, share: 0 }, { id: "ai", n: 0, share: 0 }, { id: "other", n: 0, share: 0 }] },
  misses: { total: 0, by_category: [], list: [] },
  floor: 5,
  below_floor: true,
  findings: 19,
  categories: [{ category: "test", findings: 7, addressed: 3, disputed: 3, wontfix: 0, open: 1, acceptance: 0.5, noisy: false }],
  gotchas: [],
  p3_per_review: 2.33,
  trend: { first_half: null, second_half: 0.5, direction: null },
  target: 0.6,
  bands: { ok: 0.6, warn: 0.35 },
  series: [
    { run: "run-orc-review-a", at: new Date(NOW - 9 * DAY).toISOString(), findings: 6, acceptance: 0.5, p3: 2 },
    { run: "run-orc-review-b", at: new Date(NOW - 5 * DAY).toISOString(), findings: 7, acceptance: null, p3: 3 },
    { run: "run-orc-review-c", at: new Date(NOW - 1 * DAY).toISOString(), findings: 6, acceptance: 0.6, p3: 2 },
  ],
  floor_line: "5 reviews needed — 3 so far.",
};

// One candidate, every key `publicCand` emits.
function cand(o) {
  return Object.assign({ id: "", kind: "candidate", key: "", rule: null, sig: null, category: null, scope: null, scope_refused: null, lang: null, source: "review", cases: 0, addressed: 0, disputed: 0, prs: 0, strong: false, watch: false, severity: null, cwe: null, last_at: new Date(NOW - 2 * DAY).toISOString(), promote: false, promote_rule: null, why: null, needs: null, obs: [] }, o);
}
// `orc gotcha list --candidates --json` — a candidate and a proposed suppression.
const gotchaCandidates = {
  ok: true,
  count: 3,
  candidates: [
    cand({ id: "C-7e11a0", kind: "candidate", key: "pr|a missing await on a repository call", source: "pr", rule: "PR 151 · thread 2", sig: "a missing await on a repository call", category: "functional.timing", severity: "P2", scope: "src/repos/**/*.ts", cases: 2, addressed: 2, disputed: 0, prs: 1, strong: true, watch: true, needs: "1 more addressed case in another PR, or your yes" }),
  ],
  suppressions: [
    cand({ id: "C-2b91e0", kind: "suppression", key: "suppress|long test names", source: "dismissal", sig: "long test names", category: "evolvability.documentation", severity: "P3", scope: "**/*.spec.*", cases: 3, addressed: 0, disputed: 3, prs: 3, needs: "a person accepts it: orc gotcha accept <id> (a suppression is never automatic)" }),
    cand({ id: "C-a04c55", kind: "suppression", key: "suppress|long translation files", source: "dismissal", sig: "long translation files", category: "evolvability.structure", severity: "P3", scope: "client/src/i18n/**", cases: 4, addressed: 0, disputed: 4, prs: 2, needs: "a person accepts it: orc gotcha accept <id> (a suppression is never automatic)" }),
  ],
  project_actions: [],
  retire: [{ id: "G-010", helpful: 0, harmful: 3, proposal: "retire — ORC never applies it; delete the block yourself" }],
  quiet: ["G-003", "G-009"],
  orphaned: [{ id: "G-011", why: "its scope matches no tracked file" }],
  observations: 164,
  rules: { cases: 3, prs: 2, window_days: 90, jaccard_min: 0.6, suppress_disputes: 2, do_line_cases: 5 },
};

module.exports = {
  habitsPropose,
  habitsObserve,
  habitsOff,
  habitsEmpty,
  habitLog,
  habitLogEmpty,
  habitStates,
  habitPoints,
  gotchaExtraEntries,
  gotchaPanel,
  gotchaCard,
  gotchaCardNone,
  gotchaQuality,
  gotchaQualityLow,
  gotchaCandidates,
};
