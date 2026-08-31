"use strict";
/**
 * fixtures/wait.js — canned `orc usage check` / `orc wait …` responses.
 *
 * ONE OF EVERY STATE, including the ugly ones. You cannot design an `unknown`
 * chip on a project whose statusline is happily writing a reading every second,
 * and `unknown` is the state that matters most here: it is what every install
 * on Claude Code before v2.1.80 sees, forever.
 */

// LOW, and low on the WORST window rather than the obvious one. The 5-hour
// window is the one people watch; this fixture has it comfortable and the
// weekly one nearly gone, which is the case a panel gets wrong.
const usage = {
  ok: true,
  state: "low",
  five_hour: {
    window: "5h",
    used_percentage: 62,
    remaining_percentage: 38,
    resets_at: new Date(Date.now() + 96 * 60000).toISOString(),
    resets_in_minutes: 96,
    low: false,
  },
  seven_day: {
    window: "wk",
    used_percentage: 94,
    remaining_percentage: 6,
    resets_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    resets_in_minutes: 2880,
    low: true,
  },
  worst: "wk",
  context: 81,
  stop_pct: 10,
  gate: "wait",
  reading_age_minutes: 2,
  note: "read BEFORE a wave; the wave then spends tokens, so this is a reading and not a promise.",
};

// The state a fresh install on older Claude Code sits in permanently.
const usageUnknown = {
  ok: true,
  state: "unknown",
  reason: "no reading in the last 30 minutes",
  five_hour: null,
  seven_day: null,
  context: null,
  stop_pct: 10,
  gate: "warn",
  note: "unknown is not low — a run is never stopped on a missing reading. Claude Code before v2.1.80 sends no usage headers.",
};

const waitLanes = {
  ok: true,
  modes: ["safe", "soft", "hard"],
  checkpoints: ["full", "docset", "entry", "cycle", "snapshot", "none"],
  lanes: [
    { lane: "/orc", checkpoint: "full", safe_point: "wave or phase edge", modes: ["safe", "soft", "hard"], modes_differ: true, detail: "soft forces the full checkpoint before it stops; hard writes RESUME.md only and can lose an in-flight return." },
    { lane: "/orc-doc", checkpoint: "full", safe_point: "wave edge", modes: ["safe", "soft", "hard"], modes_differ: true, detail: "soft forces the full checkpoint before it stops; hard writes RESUME.md only and can lose an in-flight return." },
    { lane: "/orc-quick", checkpoint: "entry", safe_point: "after an entry closes", modes: ["safe", "soft", "hard"], modes_differ: true, detail: "soft forces the entry checkpoint before it stops; hard writes RESUME.md only and can lose an in-flight return." },
    { lane: "/orc-brainstorm", checkpoint: "snapshot", safe_point: "phase edge", modes: ["safe", "soft", "hard"], modes_differ: true, detail: "soft forces the snapshot checkpoint before it stops; hard writes RESUME.md only and can lose an in-flight return." },
    // A `none` row KEEPS ITS SLOT. Filtering it out would make "this lane has
    // nothing to checkpoint" and "this lane does not support a wait" identical.
    { lane: "/orc-explain", checkpoint: "none", safe_point: "read-only, seconds long", modes: ["safe", "soft", "hard"], modes_differ: false, detail: "nothing to checkpoint — one dispatch, or a read. safe, soft and hard behave identically here." },
    { lane: "/orc-verify", checkpoint: "none", safe_point: "single dispatch", modes: ["safe", "soft", "hard"], modes_differ: false, detail: "nothing to checkpoint — one dispatch, or a read. safe, soft and hard behave identically here." },
  ],
  note: "A lane not in this list does not support a wait.",
};

// Blocked AND waiting at once — the busiest the card ever gets.
const waitStatus = {
  ok: true,
  run: "rate-limit-api",
  waiting: true,
  mode: "soft",
  hop: 30,
  hops_done: 2,
  hops_planned: 4,
  ends_at: new Date(Date.now() + 44 * 60000).toISOString(),
  cancel_requested: false,
  blocked: true,
  block_reason: "window resets in 5m, task needs 10",
  blocked_at: new Date(Date.now() - 12 * 60000).toISOString(),
  block_age_minutes: 12,
};

// No run in flight. An empty result is an ANSWER, so it still carries an object.
const waitStatusNone = {
  ok: true,
  run: null,
  waiting: false,
  blocked: false,
  note: "no run is in flight",
};

module.exports = { usage, usageUnknown, waitLanes, waitStatus, waitStatusNone };
