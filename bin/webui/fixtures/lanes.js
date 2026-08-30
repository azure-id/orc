"use strict";
/* fixtures/lanes.js — canned data for `orc ui --fixtures`.
   The `orc lane` noun: the registry, one lane's phases, and the call catalogue.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. For this panel the states that matter are the ones a happy lane
   never shows you:

     · a lane with NO COMMAND — dispatched by something else, never invoked;
     · a lane with NO SHARED PHASES — five keep their pipeline in their own
       spine on purpose, and "none" has to read as an ANSWER rather than as a
       fetch that failed;
     · a phase whose `when` is not `always`, and one carrying `optional_when`;
     · a phase that catalogues NO calls, beside one that catalogues seven;
     · a call that COSTS something, beside the free ones.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted fixture
   is worse than no fixture. These were copied from `orc lane list --json`,
   `orc lane phases <lane> --json` and `orc lane calls --all --json`. */

const laneList = {
  ok: true,
  count: 5,
  lanes: [
    // NO COMMAND, and the note that says what opens it instead. An unexplained
    // null reads as an oversight, which is why the CLI refuses to have one.
    {
      lane: "context-combiner",
      command: null,
      command_note: "a PHASE inside an orc-analyze run — dispatched, never invoked (v0.42.0)",
      keys: 2,
      inert: 0,
    },
    { lane: "orc", command: "/orc", command_note: null, keys: 40, inert: 0 },
    { lane: "orc-mini", command: "/orc-mini", command_note: null, keys: 9, inert: 0 },
    // INERT rules — the count that tells you some of this lane's keys do
    // nothing here however they are set.
    { lane: "orc-quick", command: "/orc-quick", command_note: null, keys: 6, inert: 5 },
    { lane: "orc-wiki", command: "/orc-wiki", command_note: null, keys: 11, inert: 0 },
  ],
  aliases: {},
  rank_states: ["resolved", "partly-resolved", "not-read", "inert", "demoted", "absent"],
};

const lanePhases = {
  orc: {
    ok: true,
    lane: "orc",
    all: false,
    count: 6,
    layer_set: ["core", "full"],
    phase_files: 6,
    lanes: [
      {
        lane: "orc",
        trace_tier: "Build lanes",
        trace_token: "orc",
        phases: [
          {
            ord: 1,
            id: "preflight",
            file: "_shared/phases/preflight.md",
            layers: ["core", "full"],
            read: "whole",
            when: "always",
            optional_when: null,
            calls: [
              "lane-config",
              "wiki-status",
              "pattern-status",
              "gotcha-status",
              "pact-status",
              "boundary-status",
              "aftermath-status",
            ],
          },
          // A phase that catalogues NO call, directly beside one that
          // catalogues seven — the empty list has to be visibly empty.
          {
            ord: 2,
            id: "trace",
            file: "_shared/phases/trace.md",
            layers: ["core"],
            read: "whole",
            when: "always",
            optional_when: null,
            calls: [],
          },
          {
            ord: 3,
            id: "intake",
            file: "_shared/phases/intake.md",
            layers: ["core"],
            read: "whole",
            when: "on-phase",
            optional_when: null,
            calls: [],
          },
          // A row that names a HEADING rather than a file — the manifest rule
          // says a row is one or the other, never both and never neither.
          {
            ord: 4,
            id: "waves",
            file: null,
            heading: "## Phase 4 — waves",
            layers: ["core"],
            read: "section",
            when: "on-phase",
            optional_when: null,
            calls: ["boundary-status"],
          },
          // OPTIONAL, with the condition spelled out. A phase that only
          // sometimes runs and does not say when is a phase nobody can plan
          // around.
          {
            ord: 5,
            id: "security",
            file: "_shared/phases/security.md",
            layers: ["full"],
            read: "whole",
            when: "on-phase",
            optional_when: "only when security_review is on and a task scored >= 70",
            calls: [],
          },
          {
            ord: 6,
            id: "stop-resume",
            file: "_shared/phases/stop-resume.md",
            layers: ["core"],
            read: "whole",
            when: "always",
            optional_when: null,
            calls: ["run-list"],
          },
        ],
      },
    ],
  },
  // IN-SPINE: no shared phases at all. This is the state the panel has to
  // render as an answer — five lanes are deliberately like this, and a blank
  // card would make "this lane owns its pipeline" look like "the read failed".
  "orc-mini": {
    ok: true,
    lane: "orc-mini",
    all: false,
    count: 0,
    layer_set: [],
    phase_files: 0,
    lanes: [{ lane: "orc-mini", trace_tier: "Build lanes", trace_token: "orc-mini", phases: [] }],
  },
};

const laneCalls = {
  ok: true,
  lane: null,
  all: true,
  count: 4,
  calls: [
    {
      id: "lane-config",
      cmd: "orc lane config <lane> [--json]",
      what: "what did this lane's config resolve to, with every shadow and inertness already worded",
      exits: { 0: "answered", 2: "unknown lane" },
      states: null,
      cost: "free",
      when: "once, at preflight, before the first decision that reads a setting",
      on_absent:
        "exit ≠ 0 → say the CLI is unavailable and use the documented defaults, out loud, treating every P0 forcing mode as OFF",
      never:
        "never merge `.claude/orc.config.yaml` yourself, and never re-derive a precedence — the answer already carries it",
      canonical: "_shared/config-precedence.md",
      lanes: ["orc", "orc-mini", "orc-quick", "orc-wiki"],
    },
    {
      id: "wiki-status",
      cmd: "orc wiki status [--json]",
      what: "does a wiki exist here, and how stale is its worst doc",
      exits: { 0: "answered in every state, including none" },
      states: ["none", "unregistered", "FRESH", "AGING", "STALE"],
      cost: "free",
      when: "once, at preflight",
      on_absent: "state `none` is an ANSWER — there is no wiki, so nothing consults one",
      never: "never compute the tier yourself, and never store it",
      canonical: "_shared/detecting-artifacts.md",
      lanes: ["orc", "orc-fast", "orc-learn", "orc-wiki"],
    },
    // A call that COSTS. Every other row here is free, and a panel where every
    // chip says the same word teaches nothing.
    {
      id: "wiki-refresh",
      cmd: "/orc-wiki refresh --top <n>",
      what: "re-scan the ranked docs a delta actually touched",
      exits: { 0: "refreshed", 1: "nothing pending" },
      states: null,
      cost: "paid",
      when: "only when the user asked for it, and only after every free repair ran",
      on_absent: "nothing pending is an ANSWER — do not scan to produce work",
      never: "never run it to clear a caution the free repairs would have cleared",
      canonical: "orc-wiki/references/staleness.md",
      lanes: ["orc-wiki"],
    },
    {
      id: "run-list",
      cmd: "orc run list [--limit <n>] [--json]",
      what: "which runs are unfinished, and what each one was doing when it stopped",
      exits: { 0: "answered, including an empty list" },
      states: null,
      cost: "free",
      when: "at a stop, and when the user asks what is open",
      on_absent: "an empty list is an ANSWER — no run is waiting",
      never: "never claim a run finished; the disk only proves it stopped",
      canonical: "_shared/phases/stop-resume.md",
      lanes: ["orc", "orc-doc", "orc-mini"],
    },
  ],
};

module.exports = { laneList, lanePhases, laneCalls };
