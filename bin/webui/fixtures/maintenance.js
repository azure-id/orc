"use strict";
/* fixtures/maintenance.js — canned data for `orc ui --fixtures`.
   The export state and the mocked-example listing.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const exportState = {
  ok: false,
  out: PROJECT + "/AGENTS.md",
  exists: true,
  source_commit: "c273793aa1b4",
  sources: 17,
  drifted: ["PACT.md", "wiki/orc-feature-payments.md", ".claude/orc/patterns/ts-pattern.md"],
  removed: [],
  stale: true,
};

/* ============================================================ v0.47.0 ====== */
/* /orc-challenge. ONE OF EVERY STATE, including the ugly ones — you cannot
   design a TAMPERED chip on a healthy cycle, a MISSING-REVISION candidate list
   on a cycle whose revision is right where it should be, or a `NOT-CHECKED`
   dimension chip on a cycle that has a template. test/webui.test.js asserts one
   fixture per state, so a new state cannot ship without one. */

const mocks = {
  root: PROJECT + "/mock-examples",
  total: 2,
  mocks: [
    { slug: "merchant-notifications", dir: PROJECT + "/mock-examples/merchant-notifications", mtime_ms: Date.now() - 40 * 60 * 1000, has_readme: true },
    { slug: "invoice-pdf-export", dir: PROJECT + "/mock-examples/invoice-pdf-export", mtime_ms: Date.now() - 5 * 24 * 60 * 60 * 1000, has_readme: false },
  ],
};

module.exports = { exportState, mocks };
