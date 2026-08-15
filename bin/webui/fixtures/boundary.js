"use strict";
/* fixtures/boundary.js — canned data for `orc ui --fixtures`.
   Boundary cards with a REFUSE that carries its checklist, an ESCALATE with a
   named person, and an EXECUTE.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const boundary = {
  ok: true,
  dir: PROJECT + "/.claude/orc/boundary",
  counts: { EXECUTE: 2, ESCALATE: 1, REFUSE: 1 },
  stale: 1,
  malformed: [],
  line: "boundary: 2 execute · 1 escalate · 1 refuse (1 stale)",
  cards: [
    {
      file: "src-payments.md",
      path: PROJECT + "/.claude/orc/boundary/src-payments.md",
      area: "src/payments",
      verdict: "REFUSE",
      checklist: [
        "add a test runner to this package",
        "cover the idempotency path",
        "record the money invariant in PACT.md",
      ],
      escalate_to: null,
      anchored_files: ["src/payments/ledger.ts", "src/payments/idempotency.ts"],
      verified_commit: "8a62b4f1c9",
      distance: 0,
      stale: false,
      malformed: [],
      reasons: [
        "self-verify: no — no test runner in this package",
        "reversible: no — writes to a live ledger",
      ],
    },
    {
      file: "db-migrations.md",
      path: PROJECT + "/.claude/orc/boundary/db-migrations.md",
      area: "db/migrations",
      verdict: "ESCALATE",
      checklist: [],
      escalate_to: "the data owner",
      anchored_files: ["db/migrations"],
      verified_commit: "c273793aa1",
      distance: 0,
      stale: false,
      malformed: [],
      reasons: ["reversible: no — a forward migration on live rows", "decision: yes — the rollout window is not ORC's call"],
    },
    {
      file: "web-locales.md",
      path: PROJECT + "/.claude/orc/boundary/web-locales.md",
      area: "web/locales",
      verdict: "EXECUTE",
      checklist: [],
      escalate_to: null,
      anchored_files: ["web/locales/en.json"],
      verified_commit: "783f6971aa",
      distance: 0,
      stale: false,
      malformed: [],
      reasons: ["self-verify: yes — `npm run i18n:check`", "reversible: yes — one git checkout"],
    },
    {
      file: "src-notifications.md",
      path: PROJECT + "/.claude/orc/boundary/src-notifications.md",
      area: "src/notifications",
      verdict: "EXECUTE",
      checklist: [],
      escalate_to: null,
      anchored_files: ["src/notifications/dispatcher.ts"],
      verified_commit: "9f2c41ab8d",
      // STALE: the evidence moved. Not a wrong card — one whose four answers
      // were computed against a commit that is 12 behind.
      distance: 12,
      stale: true,
      malformed: [],
      reasons: ["self-verify: yes — covered by test/notifications", "reversible: yes"],
    },
  ],
};

module.exports = { boundary };
