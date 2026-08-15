"use strict";
/* fixtures/mockrun.js — canned data for `orc ui --fixtures`.
   One rendered walkthrough document.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const mockDetail = {
  root: PROJECT + "/mock-examples",
  slug: "merchant-notifications",
  found: true,
  dir: PROJECT + "/mock-examples/merchant-notifications",
  mtime_ms: Date.now() - 40 * 60 * 1000,
  readme:
    "# Mocked example — merchant notifications\n\n" +
    "A runnable slice of the change with the payment gateway stubbed out.\n\n" +
    "## Run it\n\n```\nnode run.js\n```\n\n" +
    "## What is mocked\n\n- the gateway webhook signature check\n- the SMTP transport (writes to `out/`)\n",
  readme_path: PROJECT + "/mock-examples/merchant-notifications/EXAMPLE.md",
  files: [
    { path: "EXAMPLE.md", size: 412 },
    { path: "run.js", size: 1830 },
    { path: "fixtures/webhook.json", size: 604 },
    { path: "mocks/gateway.js", size: 921 },
  ],
  truncated: false,
};

module.exports = { mockDetail };
